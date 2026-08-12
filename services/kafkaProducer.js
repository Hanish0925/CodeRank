const kafka = require('../config/kafka');

const producer = kafka.producer();

let connectPromise = null;

/**
 * Connects once and reuses the connection. The old code did
 * connect() -> send() -> disconnect() per request, putting a TCP handshake
 * and a metadata fetch on the hot path of every submission.
 */
const connectProducer = () => {
  if (!connectPromise) {
    connectPromise = producer.connect().catch(err => {
      // Reset so a later request can retry instead of latching the failure.
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
};

const sendJobToKafka = async (jobData) => {
  await connectProducer();
  await producer.send({
    topic: 'code-execution',
    messages: [
      {
        key: jobData._id.toString(),
        value: JSON.stringify(jobData)
      }
    ]
  });
};

const disconnectProducer = async () => {
  if (!connectPromise) return;
  connectPromise = null;
  await producer.disconnect().catch(() => {});
};

module.exports = sendJobToKafka;
module.exports.connectProducer = connectProducer;
module.exports.disconnectProducer = disconnectProducer;
