// Blockfire dedicated server.
//
// Online games are normally hosted inside a player's own game and joined
// with a code. This server is for people who want a game that stays up on
// its own machine: players join it by address instead. It runs the same
// room code as the game (src/room.js) and passes messages over WebSockets.
// The first player in is the host; if they leave, the next player takes
// over.
//
// Run it with:   node server/server.cjs [--port 25580]

const { WebSocketServer } = require('ws');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_PORT = 25580;

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

async function createServer({ port = DEFAULT_PORT, host = '0.0.0.0', log = () => {} } = {}) {
  const { Room } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'room.js')).href);
  const room = new Room({ log, migrate: true });
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host, maxPayload: 256 * 1024 });

    wss.on('connection', (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => (ws.isAlive = true));
      const conn = room.connect({
        send: (text) => {
          if (ws.readyState === 1) ws.send(text);
        },
        close: () => ws.close(),
      });
      ws.on('message', (data) => conn.receive(String(data)));
      ws.on('close', () => conn.close());
      ws.on('error', () => {});
    });

    // Drop players whose connection silently died.
    const beat = setInterval(() => {
      for (const ws of wss.clients) {
        if (!ws.isAlive) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 10000);

    wss.on('listening', () => {
      resolve({
        port: wss.address().port,
        addresses: lanAddresses(),
        get playerCount() {
          return room.size;
        },
        close() {
          clearInterval(beat);
          room.close('The server was shut down.');
          setTimeout(() => {
            for (const ws of wss.clients) ws.terminate();
          }, 500);
          return new Promise((done) => wss.close(() => done()));
        },
      });
    });
    wss.on('error', (err) => {
      clearInterval(beat);
      reject(err);
    });
  });
}

module.exports = { createServer, lanAddresses, DEFAULT_PORT };

if (require.main === module) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : DEFAULT_PORT;
  createServer({ port, log: (s) => console.log(`[${new Date().toLocaleTimeString()}] ${s}`) })
    .then((srv) => {
      console.log(`Blockfire server running on port ${srv.port}.`);
      const addrs = srv.addresses.length ? srv.addresses : ['localhost'];
      console.log(`Players can join at: ${addrs.map((a) => `${a}:${srv.port}`).join('  or  ')}`);
    })
    .catch((err) => {
      console.error(err.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : err.message);
      process.exit(1);
    });
}
