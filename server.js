const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const { WebSocketServer } = require('ws');

// ── CONFIG ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 2758;
const DATA_FILE = path.join(__dirname, 'visits.json');

// ── PERSISTENT VISIT COUNT ──────────────────────────────────────
function loadVisits() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).total || 0;
  } catch { return 0; }
}

function saveVisits(total) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ total }));
}

let totalVisits = loadVisits();
let onlineClients = new Set();

// ── HTTP SERVER (serves index.html + static files) ──────────────
const httpServer = http.createServer((req, res) => {
  // Only serve index.html for any path (SPA style)
  const filePath = path.join(__dirname, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

// ── WEBSOCKET SERVER ────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', (ws, req) => {
  // New visitor — count them
  totalVisits++;
  saveVisits(totalVisits);
  onlineClients.add(ws);

  // Send current stats to the new client immediately
  ws.send(JSON.stringify({
    type: 'stats',
    online: onlineClients.size,
    total: totalVisits
  }));

  // Broadcast updated online count to everyone
  broadcast({ type: 'stats', online: onlineClients.size, total: totalVisits });

  // Heartbeat to keep connection alive
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('close', () => {
    onlineClients.delete(ws);
    broadcast({ type: 'stats', online: onlineClients.size, total: totalVisits });
  });

  ws.on('error', () => {
    onlineClients.delete(ws);
  });
});

// Ping all clients every 30s to detect dead connections
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// ── START ───────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║       YOSHbrew Server Running!        ║
  ║  http://localhost:2758                ║
  ║  WebSocket: ws://localhost:2758       ║
  ╚═══════════════════════════════════════╝
  `);
  console.log(`  Total visits loaded: ${totalVisits}`);
});
