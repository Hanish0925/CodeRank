/**
 * HTTP-level tests. These exercise Express, routing, validation, the body-size
 * cap, the rate limiter and the Redis caching rules — none of which the
 * executor unit tests touch. Kafka and Redis are mocked; Mongo runs in-memory.
 */
// Set before ../app is required — app.js reads these at module load.
process.env.RATE_LIMIT_MAX = '8';
process.env.READ_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// --- Kafka: capture sends instead of hitting a broker ------------------------
jest.mock('../services/kafkaProducer', () => {
  const { sentMessages } = require('./helpers/mockState');
  const send = jest.fn(async (jobData) => {
    sentMessages.push(JSON.parse(JSON.stringify(jobData)));
  });
  send.connectProducer = jest.fn(async () => {});
  send.disconnectProducer = jest.fn(async () => {});
  return send;
});

// --- Redis: in-memory stand-in ----------------------------------------------
jest.mock('../config/redis', () => {
  const TERMINAL = ['completed', 'error'];
  const { redisStore: store } = require('./helpers/mockState');

  const client = {
    isOpen: true,
    get: jest.fn(async key => (store.has(key) ? store.get(key) : null)),
    setEx: jest.fn(async (key, ttl, value) => { store.set(key, value); }),
    del: jest.fn(async key => { store.delete(key); }),
    quit: jest.fn(async () => {}),
    on: jest.fn()
  };

  client.ready = Promise.resolve();
  client.cacheJobResult = jest.fn(async (jobId, jobData) => {
    if (!TERMINAL.includes(jobData.status)) return false;
    store.set(String(jobId), JSON.stringify(jobData));
    return true;
  });
  client.TERMINAL_STATUSES = TERMINAL;
  client.RESULT_TTL_SECONDS = 300;

  return client;
});

const { sentMessages, reset: resetMockState } = require('./helpers/mockState');
const app = require('../app');
const Job = require('../models/job');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Job.deleteMany({});
  resetMockState();
});

describe('POST /api/execute', () => {
  test('queues a valid submission and returns a job id', async () => {
    const res = await request(app)
      .post('/api/execute')
      .send({ language: 'python', code: 'print("hi")' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBeDefined();

    // The status must already be 'queued' in Mongo by the time we respond,
    // otherwise the controller would race the worker's 'running'.
    expect(res.body.status).toBe('queued');
    const job = await Job.findById(res.body.jobId).lean();
    expect(job.status).toBe('queued');
  });

  test('publishes to Kafka only after the job row exists as queued', async () => {
    const res = await request(app)
      .post('/api/execute')
      .send({ language: 'python', code: 'print("hi")' });

    expect(sentMessages).toHaveLength(1);
    expect(String(sentMessages[0]._id)).toBe(String(res.body.jobId));
    expect(sentMessages[0].status).toBe('queued');
  });

  test('rejects a missing language or code', async () => {
    const res = await request(app).post('/api/execute').send({ code: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('rejects an unsupported language', async () => {
    const res = await request(app)
      .post('/api/execute')
      .send({ language: 'ruby', code: 'puts 1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported language/i);
  });

  test('rejects a body over the 64kb cap', async () => {
    const res = await request(app)
      .post('/api/execute')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ language: 'python', code: 'x'.repeat(70000) }));

    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);
  });

  test('rejects malformed JSON with a JSON error, not an HTML stack', async () => {
    const res = await request(app)
      .post('/api/execute')
      .set('content-type', 'application/json')
      .send('{"language":');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/status/:jobId', () => {
  test('404s on an unknown id', async () => {
    const res = await request(app)
      .get(`/api/status/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(404);
  });

  test('404s on a malformed id instead of throwing a cast error', async () => {
    const res = await request(app).get('/api/status/not-an-object-id');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('does NOT cache a non-terminal status', async () => {
    const job = await Job.create({ language: 'python', code: 'x', status: 'queued' });

    const first = await request(app).get(`/api/status/${job._id}`);
    expect(first.body.status).toBe('queued');
    expect(first.body.cached).toBe(false);

    // The bug: a queued read used to be pinned in Redis for 300s, so the
    // job would still report 'queued' long after it finished.
    await Job.findByIdAndUpdate(job._id, { status: 'completed', output: 'done' });

    const second = await request(app).get(`/api/status/${job._id}`);
    expect(second.body.status).toBe('completed');
    expect(second.body.output).toBe('done');
  });

  test('caches a terminal status and serves it on the next read', async () => {
    const job = await Job.create({
      language: 'python',
      code: 'x',
      status: 'completed',
      output: 'hello',
      durationMs: 42
    });

    const first = await request(app).get(`/api/status/${job._id}`);
    expect(first.body.cached).toBe(false);
    expect(first.body.status).toBe('completed');

    const second = await request(app).get(`/api/status/${job._id}`);
    expect(second.body.cached).toBe(true);
    expect(second.body.output).toBe('hello');
    expect(second.body.durationMs).toBe(42);
  });
});

describe('GET /api/result/:jobId', () => {
  test('never leaks Mongoose internals into the response', async () => {
    const job = await Job.create({
      language: 'python',
      code: 'x',
      status: 'completed',
      output: 'hello'
    });

    const res = await request(app).get(`/api/result/${job._id}`);

    expect(res.status).toBe(200);
    const keys = Object.keys(res.body);
    expect(keys).not.toContain('$__');
    expect(keys).not.toContain('_doc');
    expect(keys).not.toContain('$isNew');
    // The raw submission shouldn't come back either.
    expect(keys).not.toContain('code');
  });

  test('surfaces the distinct error type for a failed job', async () => {
    const job = await Job.create({
      language: 'cpp',
      code: 'x',
      status: 'error',
      errorType: 'compile_error',
      error: 'Compilation failed',
      exitCode: 101
    });

    const res = await request(app).get(`/api/result/${job._id}`);
    expect(res.body.errorType).toBe('compile_error');
    expect(res.body.exitCode).toBe(101);
  });
});

describe('GET /health', () => {
  test('reports mongo and redis state', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body.mongo).toBe('up');
    expect(res.body).toHaveProperty('uptimeSeconds');
  });
});

describe('rate limiting', () => {
  test('starts rejecting once the submission window is exhausted', async () => {
    // The limiter store is shared across the whole file, so don't assume how
    // many requests are left — just submit until it pushes back.
    let sawTooMany = false;

    for (let i = 0; i < 40 && !sawTooMany; i += 1) {
      const res = await request(app)
        .post('/api/execute')
        .send({ language: 'python', code: 'print(1)' });
      if (res.status === 429) sawTooMany = true;
    }

    expect(sawTooMany).toBe(true);
  });
});
