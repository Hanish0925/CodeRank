const WebSocket = require('ws');

const connections = new Map();

let wss = null;

function setupWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', ws => {
    let jobId = null;

    ws.on('message', msg => {
      const next = msg.toString().trim();
      if (!next) return;

      // A socket may only be registered for one job at a time.
      if (jobId && connections.get(jobId) === ws) {
        connections.delete(jobId);
      }

      jobId = next;
      connections.set(jobId, ws);
    });

    ws.on('close', () => {
      // Only drop the entry if it's still ours, so a reconnect for the same
      // job isn't unregistered by a stale socket closing late.
      if (jobId && connections.get(jobId) === ws) {
        connections.delete(jobId);
      }
    });

    ws.on('error', () => {
      if (jobId && connections.get(jobId) === ws) {
        connections.delete(jobId);
      }
    });
  });

  console.log('🔌 WebSocket server ready');
  return wss;
}

function getSocketForJob(jobId) {
  return connections.get(String(jobId));
}

function closeWebSocket() {
  if (!wss) return;
  for (const ws of connections.values()) {
    ws.close();
  }
  connections.clear();
  wss.close();
  wss = null;
}

module.exports = { setupWebSocket, getSocketForJob, closeWebSocket };
