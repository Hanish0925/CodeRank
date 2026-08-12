/**
 * Shared mutable state for the jest.mock factories in api.test.js.
 * jest.mock factories are hoisted above variable declarations, so they can't
 * close over test-file locals — they require this module instead.
 */
const sentMessages = [];
const redisStore = new Map();

const reset = () => {
  sentMessages.length = 0;
  redisStore.clear();
};

module.exports = { sentMessages, redisStore, reset };
