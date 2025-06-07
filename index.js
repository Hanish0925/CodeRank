require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { setupWebSocket } = require('./wsServer');

const PORT = process.env.PORT || 3000;

connectDB();

const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
