const kafka = require('../config/kafka');
const producer = kafka.producer();

const sendJobToKafka = async (jobData) => {
  await producer.connect();
  await producer.send({
    topic: 'code-execution',
    messages: [
      {
        key: jobData._id.toString(),
        value: JSON.stringify(jobData)
      }
    ]
  });
  await producer.disconnect();
};

module.exports = sendJobToKafka;
