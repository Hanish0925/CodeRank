const redis = require('redis');

const RESULT_TTL_SECONDS = 300;
const TERMINAL_STATUSES = ['completed', 'error'];

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', err => console.error('Redis Error:', err));

const ready = redisClient.connect()
  .then(() => console.log('Redis connected'))
  .catch(err => {
    console.error('Redis connection error:', err.message);
  });

/**
 * Only terminal results are safe to cache. Caching `pending`/`queued`/`running`
 * pins a transient status for the full TTL, because nothing invalidates it.
 */
const cacheJobResult = async (jobId, jobData) => {
  if (!TERMINAL_STATUSES.includes(jobData.status)) return false;

  try {
    await redisClient.setEx(
      String(jobId),
      RESULT_TTL_SECONDS,
      JSON.stringify(jobData)
    );
    return true;
  } catch (err) {
    console.error('Redis cache write failed:', err.message);
    return false;
  }
};

module.exports = redisClient;
module.exports.ready = ready;
module.exports.cacheJobResult = cacheJobResult;
module.exports.RESULT_TTL_SECONDS = RESULT_TTL_SECONDS;
module.exports.TERMINAL_STATUSES = TERMINAL_STATUSES;
