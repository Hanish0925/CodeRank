const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'coderank-api',
  brokers: (process.env.KAFKA_BROKER || 'localhost:9092').split(',')
});

module.exports = kafka;
