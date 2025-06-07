const mongoose = require('mongoose');

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
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: Date,
  completedAt: Date,
  error: String
});

module.exports = mongoose.model('Job', jobSchema);
