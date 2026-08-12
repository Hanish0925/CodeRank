require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const redisClient = require('./config/redis');
const { runWorker, shutdown } = require('./worker/jobConsumer');
const { startReaper, stopReaper } = require('./services/jobReaper');

let shuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down worker...`);

  stopReaper();
  await shutdown();
  await redisClient.quit().catch(() => {});
  await mongoose.connection.close().catch(() => {});

  process.exit(0);
};

connectDB()
  .then(() => {
    startReaper();
    return runWorker();
  })
  .catch(err => {
    console.error('Worker startup error:', err);
    process.exit(1);
  });

['SIGINT', 'SIGTERM'].forEach(sig =>
  process.on(sig, () => gracefulShutdown(sig))
);
