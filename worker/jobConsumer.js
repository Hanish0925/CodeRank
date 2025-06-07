const kafka = require('../config/kafka');
const Job = require('../models/job');
const executeCode  = require('../services/codeExecutor');

const consumer = kafka.consumer({ groupId: 'code-executor-group' });

const runWorker = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: 'code-execution', fromBeginning: false });

  console.log('Worker listening to code-execution topic...');

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const jobData = JSON.parse(message.value.toString());
        const jobId = jobData._id;

        console.log(` Processing Job ID: ${jobId}`);

        const job = await Job.findById(jobId);
        if (!job) {
          console.error(`Job not found: ${jobId}`);
          return;
        }

        job.status = 'running';
        job.startedAt = new Date();
        await job.save();

        const result = await executeCode(job.language, job.code, job.input);

        if (result.success) {
          job.output = result.output;
          job.status = 'completed';
        } else {
          job.error = result.error;
          job.status = 'error';
        }

        job.completedAt = new Date();
        await job.save();

        console.log(`Job ${jobId} completed.`);

      } catch (err) {
        console.error('Error processing job:', err.message);
      }
    }
  });
};

runWorker().catch(err => console.error('Worker startup error:', err));
