const mongoose = require('mongoose');
const Job = require('../models/job');
const sendJobToKafka = require('../services/kafkaProducer');
const redisClient = require('../config/redis');
const { cacheJobResult } = require('../config/redis');

const SUPPORTED_LANGUAGES = ['python', 'cpp', 'javascript', 'java'];
const MAX_CODE_LENGTH = 50000;
const MAX_INPUT_LENGTH = 10000;

const publicJobFields = (job) => ({
  status: job.status,
  output: job.output,
  error: job.error,
  errorType: job.errorType,
  exitCode: job.exitCode,
  truncated: job.truncated,
  durationMs: job.durationMs,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  completedAt: job.completedAt
});

const handleCodeExecution = async (req, res) => {
  const { language, code, input } = req.body || {};

  if (!language || !code) {
    return res.status(400).json({
      success: false,
      error: 'language and code are required'
    });
  }

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`
    });
  }

  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `code must be a string of at most ${MAX_CODE_LENGTH} characters`
    });
  }

  if (input != null && (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH)) {
    return res.status(400).json({
      success: false,
      error: `input must be a string of at most ${MAX_INPUT_LENGTH} characters`
    });
  }

  let job;
  try {
    // Created as 'queued' *before* the Kafka send. The worker is local and
    // usually wins the race, so writing 'queued' after the send would clobber
    // the worker's 'running'.
    job = await Job.create({
      language,
      code,
      input: input || '',
      status: 'queued'
    });

    await sendJobToKafka(job);

    return res.status(202).json({
      success: true,
      jobId: job._id,
      status: job.status
    });

  } catch (err) {
    console.error('Execution error:', err);

    if (job) {
      // The job row exists but nothing will ever pick it up.
      await Job.findByIdAndUpdate(job._id, {
        status: 'error',
        errorType: 'internal',
        error: 'Failed to enqueue job',
        completedAt: new Date()
      }).catch(() => {});
    }

    return res.status(500).json({
      success: false,
      error: 'Server error while queuing job'
    });
  }
};

const readJob = async (jobId) => {
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return { notFound: true };
  }

  const cached = await redisClient.get(String(jobId)).catch(() => null);
  if (cached) {
    return { data: JSON.parse(cached), cached: true };
  }

  // .lean() returns a plain object, so spreading it can't leak Mongoose
  // internals ($__, _doc) into the JSON response.
  const job = await Job.findById(jobId).lean();
  if (!job) {
    return { notFound: true };
  }

  const data = publicJobFields(job);

  // Only terminal states get cached; anything else would be pinned for the
  // full TTL with nothing to invalidate it.
  await cacheJobResult(jobId, data);

  return { data, cached: false };
};

const getJobStatus = async (req, res) => {
  try {
    const { data, cached, notFound } = await readJob(req.params.jobId);

    if (notFound) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    return res.status(200).json({
      success: true,
      jobId: req.params.jobId,
      ...data,
      cached
    });

  } catch (err) {
    console.error('Redis/DB error:', err);
    return res.status(500).json({ success: false, error: 'Error retrieving job status' });
  }
};

const getJobResult = async (req, res) => {
  try {
    const { data, cached, notFound } = await readJob(req.params.jobId);

    if (notFound) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    return res.status(200).json({
      success: true,
      jobId: req.params.jobId,
      ...data,
      cached
    });

  } catch (err) {
    console.error('Error fetching job result:', err);
    return res.status(500).json({ success: false, error: 'Error fetching job result' });
  }
};

module.exports = { handleCodeExecution, getJobStatus, getJobResult };
