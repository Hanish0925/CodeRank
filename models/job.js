const mongoose = require('mongoose');

const TERMINAL_STATUSES = ['completed', 'error'];

const jobSchema = new mongoose.Schema({
  language: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  input: {
    type: String,
    default: ''
  },
  output: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending', 'queued', 'running', 'completed', 'error'],
    default: 'pending'
  },
  // Distinguishes the four outcomes a judge actually cares about, instead of
  // flattening them all into `status: 'error'`.
  errorType: {
    type: String,
    enum: [
      'compile_error',
      'runtime_error',
      'timeout',
      'memory_limit',
      'unsupported_language',
      'internal'
    ]
  },
  exitCode: Number,
  truncated: {
    type: Boolean,
    default: false
  },
  durationMs: Number,
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: Date,
  completedAt: Date,
  error: String
});

// Supports the stuck-job reaper.
jobSchema.index({ status: 1, startedAt: 1 });

module.exports = mongoose.model('Job', jobSchema);
module.exports.TERMINAL = TERMINAL_STATUSES;
