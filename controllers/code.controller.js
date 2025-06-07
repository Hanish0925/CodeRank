const Job = require('../models/job');
const sendJobToKafka = require('../services/kafkaProducer');
const redisClient = require('../config/redis');

const handleCodeExecution = async (req, res) => {
  const { language, code, input } = req.body;

  if (!language || !code) {
    return res.status(400).json({
      success: false,
      error: 'language and code are required'
    });
  }

  try {
    const job = await Job.create({
      language,
      code,
      input,
      status: 'pending'
    });

    await sendJobToKafka(job);

    job.status = 'queued';
    await job.save();

    return res.status(200).json({
      success: true,
      jobId: job._id,
      status: job.status
    });

  } catch (err) {
    console.error('Execution error:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error while queuing job'
    });
  }
};

const getJobStatus = async (req, res) => {
  const { jobId } = req.params;

  try {
    const cached = await redisClient.get(jobId);
    if (cached) {
      return res.status(200).json({
        success: true,
        jobId,
        ...JSON.parse(cached),
        cached: true
      });
    }

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const jobData = {
      status: job.status,
      output: job.output,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt
    };

    await redisClient.setEx(jobId, 300, JSON.stringify(jobData));

    res.status(200).json({
      success: true,
      jobId,
      ...jobData,
      cached: false
    });

  } catch (err) {
    console.error('Redis/DB error:', err);
    res.status(500).json({ success: false, error: 'Error retrieving job status' });
  }
};

const getJobResult = async (req, res) => {
  const { jobId } = req.params;

  try {
    const cached = await redisClient.get(jobId);
    const data = cached ? JSON.parse(cached) : await Job.findById(jobId);

    if (!data) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const result = cached ? data : {
      status: data.status,
      output: data.output,
      error: data.error,
      createdAt: data.createdAt,
      startedAt: data.startedAt,
      completedAt: data.completedAt
    };

    return res.status(200).json({ success: true, jobId, ...result });

  } catch (err) {
    console.error('Error fetching job result:', err);
    return res.status(500).json({ success: false, error: 'Error fetching job result' });
  }
};

module.exports = { handleCodeExecution, getJobStatus, getJobResult };

