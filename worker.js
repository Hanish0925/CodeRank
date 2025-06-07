require('dotenv').config();
const connectDB = require('./config/db');

connectDB().then(() => {
  require('./worker/jobConsumer');
});
