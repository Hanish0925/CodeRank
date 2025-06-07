const redis = require('redis');

const redisClient = redis.createClient({
  url: 'redis://localhost:6379'
});

redisClient.on('error', err => console.error('Redis Error:', err));

(async () => {
  await redisClient.connect();
  console.log('Redis connected');
})();

module.exports = redisClient;
