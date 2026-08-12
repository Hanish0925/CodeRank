const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const codeRoutes = require('./routes/code.routes');

const app = express();

// Comma-separated origin allowlist. Unset means "reflect any origin", which is
// the old wide-open behaviour and is only appropriate for local dev.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors(
  allowedOrigins.length ? { origin: allowedOrigins } : {}
));

// A submission is source code, not a payload. Anything bigger is abuse.
app.use(express.json({ limit: process.env.MAX_BODY_SIZE || '64kb' }));

const executeLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many submissions. Please slow down.'
  }
});

const readLimiter = rateLimit({
  windowMs: Number(process.env.READ_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  limit: Number(process.env.READ_RATE_LIMIT_MAX) || 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});

app.use('/api/execute', executeLimiter);
app.use('/api/status', readLimiter);
app.use('/api/result', readLimiter);

app.use('/api', codeRoutes);

app.get('/health', async (req, res) => {
  const mongoUp = mongoose.connection.readyState === 1;

  let redisUp = false;
  try {
    const redisClient = require('./config/redis');
    redisUp = redisClient.isOpen === true;
  } catch (_) {}

  const healthy = mongoUp && redisUp;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    mongo: mongoUp ? 'up' : 'down',
    redis: redisUp ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.get('/', (req, res) => {
  res.send('CodeRank backend is running');
});

// Turns a body-parser 413/400 into a JSON response instead of an HTML stack.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request body too large'
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON body'
    });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ success: false, error: 'Internal server error' });
});

module.exports = app;
