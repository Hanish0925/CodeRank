const kafka = require('../config/kafka');
const Job = require('../models/job');
const executeCode = require('../services/codeExecutor');
const { cacheJobResult } = require('../config/redis');

const PARTITIONS_CONCURRENTLY = Number(process.env.KAFKA_CONCURRENCY) || 4;

const consumer = kafka.consumer({ groupId: 'code-executor-group' });

const terminalUpdateFrom = (result, startedAt) => {
  const completedAt = new Date();

  const update = {
    completedAt,
    // startedAt/completedAt were stored but the delta was never computed.
    durationMs: result.durationMs != null
      ? result.durationMs
      : completedAt.getTime() - startedAt.getTime(),
    truncated: Boolean(result.truncated),
    exitCode: result.exitCode
  };

  if (result.success) {
    update.status = 'completed';
    update.output = result.output;
  } else {
    update.status = 'error';
    update.error = result.error;
    update.errorType = result.errorType;
    // Partial output is still useful on a runtime error or TLE.
    if (result.output) update.output = result.output;
  }

  return update;
};

const processMessage = async ({ message }) => {
  const jobData = JSON.parse(message.value.toString());
  const jobId = jobData._id;

  console.log(`Processing Job ID: ${jobId}`);

  const startedAt = new Date();

  // Conditional update: only claim a job that hasn't already been claimed.
  // Guards against a redelivered message re-running a finished job.
  const job = await Job.findOneAndUpdate(
    { _id: jobId, status: { $in: ['pending', 'queued'] } },
    { status: 'running', startedAt },
    { new: true }
  );

  if (!job) {
    const existing = await Job.findById(jobId).lean();
    if (!existing) {
      console.error(`Job not found: ${jobId}`);
    } else {
      console.warn(`Job ${jobId} already in status '${existing.status}', skipping.`);
    }
    return;
  }

  // The real Mongo job id, so the socket the client registered actually
  // resolves. Previously executeCode generated its own uuid and every
  // lookup missed.
  const result = await executeCode(job.language, job.code, job.input, String(jobId));

  const update = terminalUpdateFrom(result, startedAt);
  const finished = await Job.findByIdAndUpdate(jobId, update, { new: true }).lean();

  // The worker owns the terminal result, so it writes the cache directly
  // instead of leaving the API to populate it on a later read.
  await cacheJobResult(jobId, {
    status: finished.status,
    output: finished.output,
    error: finished.error,
    errorType: finished.errorType,
    exitCode: finished.exitCode,
    truncated: finished.truncated,
    durationMs: finished.durationMs,
    createdAt: finished.createdAt,
    startedAt: finished.startedAt,
    completedAt: finished.completedAt
  });

  console.log(`Job ${jobId} -> ${finished.status} (${finished.durationMs}ms)`);
};

const runWorker = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'code-execution', fromBeginning: false });

  console.log('Worker listening to code-execution topic...');

  await consumer.run({
    // Manual commits: with auto-commit, a worker that dies mid-execution loses
    // the message and the job sits in 'running' forever.
    autoCommit: false,
    partitionsConsumedConcurrently: PARTITIONS_CONCURRENTLY,

    eachMessage: async ({ topic, partition, message }) => {
      try {
        await processMessage({ message });
      } catch (err) {
        console.error('Error processing job:', err.message);

        // Don't strand the job in 'running' just because we threw.
        try {
          const jobId = JSON.parse(message.value.toString())._id;
          await Job.findOneAndUpdate(
            { _id: jobId, status: { $nin: ['completed', 'error'] } },
            {
              status: 'error',
              errorType: 'internal',
              error: `Worker error: ${err.message}`,
              completedAt: new Date()
            }
          );
        } catch (_) {}
      }

      // Committed only after the job reached a terminal state (or was
      // explicitly marked failed above).
      await consumer.commitOffsets([
        { topic, partition, offset: (Number(message.offset) + 1).toString() }
      ]);
    }
  });
};

const shutdown = async () => {
  await consumer.disconnect().catch(() => {});
};

module.exports = { runWorker, shutdown, consumer };
