require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const connectDB = require('./config/db');
const redisClient = require('./config/redis');
const { setupWebSocket, closeWebSocket } = require('./wsServer');
const { connectProducer, disconnectProducer } = require('./services/kafkaProducer');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
setupWebSocket(server);

let shuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down...`);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  await new Promise(resolve => server.close(resolve));
  closeWebSocket();
  await disconnectProducer();
  await redisClient.quit().catch(() => {});
  await mongoose.connection.close().catch(() => {});

  clearTimeout(forceExit);
  console.log('Shutdown complete.');
  process.exit(0);
};

const start = async () => {
  await connectDB();

  // Connect the Kafka producer once at startup rather than per request.
  await connectProducer().catch(err =>
    console.error('Kafka producer connect failed (will retry on first send):', err.message)
  );

  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
};

start().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});

['SIGINT', 'SIGTERM'].forEach(sig =>
  process.on(sig, () => gracefulShutdown(sig))
);
