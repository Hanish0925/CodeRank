const Job = require('../models/job');
const { cacheJobResult } = require('../config/redis');

const EXECUTION_TIMEOUT_MS = Number(process.env.EXECUTION_TIMEOUT_MS) || 10000;

// Generous multiple of the execution timeout so we never reap a job that is
// merely queued behind the concurrency limit.
const RUNNING_GRACE_MS = Number(process.env.REAPER_RUNNING_GRACE_MS)
  || EXECUTION_TIMEOUT_MS * 6;

// A job that never got picked up at all (broker down, topic missing).
const QUEUED_GRACE_MS = Number(process.env.REAPER_QUEUED_GRACE_MS) || 10 * 60 * 1000;

const REAPER_INTERVAL_MS = Number(process.env.REAPER_INTERVAL_MS) || 60 * 1000;

/**
 * A worker that dies mid-execution leaves its job in 'running' with no Kafka
 * message left to redeliver. This sweeps those into a terminal state.
 */
const reapStuckJobs = async () => {
  const now = Date.now();
  let reaped = 0;

  const stuckRunning = await Job.find({
    status: 'running',
    startedAt: { $lt: new Date(now - RUNNING_GRACE_MS) }
  }).select('_id startedAt createdAt').lean();

  const stuckQueued = await Job.find({
    status: { $in: ['pending', 'queued'] },
    createdAt: { $lt: new Date(now - QUEUED_GRACE_MS) }
  }).select('_id startedAt createdAt').lean();

  for (const job of [...stuckRunning, ...stuckQueued]) {
    const completedAt = new Date();
    const anchor = job.startedAt || job.createdAt;

    const update = {
      status: 'error',
      errorType: 'internal',
      error: 'Job abandoned: the worker did not report a result in time.',
      completedAt,
      durationMs: anchor ? completedAt.getTime() - new Date(anchor).getTime() : undefined
    };

    const result = await Job.findOneAndUpdate(
      { _id: job._id, status: { $nin: ['completed', 'error'] } },
      update,
      { new: true }
    ).lean();

    if (!result) continue; // Finished between the query and the write.

    await cacheJobResult(job._id, {
      status: result.status,
      output: result.output,
      error: result.error,
      errorType: result.errorType,
      exitCode: result.exitCode,
      truncated: result.truncated,
      durationMs: result.durationMs,
      createdAt: result.createdAt,
      startedAt: result.startedAt,
      completedAt: result.completedAt
    });

    reaped += 1;
  }

  if (reaped > 0) console.log(`Reaper: failed ${reaped} stuck job(s).`);
  return reaped;
};

let timer = null;

const startReaper = () => {
  if (timer) return timer;
  timer = setInterval(() => {
    reapStuckJobs().catch(err => console.error('Reaper error:', err.message));
  }, REAPER_INTERVAL_MS);
  timer.unref();
  console.log(`Reaper running every ${REAPER_INTERVAL_MS / 1000}s`);
  return timer;
};

const stopReaper = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { reapStuckJobs, startReaper, stopReaper };
