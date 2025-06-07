const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'coderank-api',
  brokers: ['localhost:9092']
});

module.exports = kafka;
