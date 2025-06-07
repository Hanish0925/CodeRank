const WebSocket = require('ws');
const connections = new Map();

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', ws => {
    let jobId = null;

    ws.on('message', msg => {
      jobId = msg.toString();
      connections.set(jobId, ws);
    });

    ws.on('close', () => {
      if (jobId) connections.delete(jobId);
    });
  });

  console.log('🔌 WebSocket server ready');
}

function getSocketForJob(jobId) {
  return connections.get(jobId);
}

module.exports = { setupWebSocket, getSocketForJob };
