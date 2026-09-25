// Blockfire multiplayer server.
//
// A small relay written in Node.js. The first player to join is the host:
// their game runs the mobs and waves, and this server passes messages
// between everyone. If the host leaves, the next player takes over.
//
// Run a dedicated server with:   node server/server.cjs [--port 25580]
// The desktop app also starts one of these when you click "Host game".

const { WebSocketServer } = require('ws');
const os = require('os');

const PROTOCOL = 3;
const DEFAULT_PORT = 25580;
const MAX_PLAYERS = 8;

// Messages any player may send, and what the server does with them.
const RELAY = new Set(['state', 'shot', 'died', 'proj', 'boom']);
// Messages only the host may send; they go to everyone else.
const HOST_RELAY = new Set(['mobs', 'bolt', 'pickupAdd', 'pickupGone', 'banner', 'cleared']);
// Messages for the host's eyes only.
const TO_HOST = new Set(['hitMob', 'pickup']);

function cleanName(name) {
  const s = String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 16);
  return s || 'Player';
}

function cleanSkin(skin) {
  return typeof skin === 'string' && skin.startsWith('data:image/png;base64,') && skin.length < 80000 ? skin : null;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

function createServer({ port = DEFAULT_PORT, host = '0.0.0.0', log = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, host, maxPayload: 256 * 1024 });
    const players = new Map();
    let nextId = 1;
    let hostId = null;
    const room = { started: false, seed: 0, edits: new Map(), wave: null };

    const send = (p, msg) => {
      if (p && p.ws.readyState === 1) p.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    };
    const broadcast = (msg, exceptId) => {
      const s = JSON.stringify(msg);
      for (const p of players.values()) if (p.id !== exceptId) send(p, s);
    };
    const info = (p) => ({ id: p.id, name: p.name, skin: p.skin, slim: p.slim, state: p.state });

    function leave(me) {
      if (!players.delete(me.id)) return;
      broadcast({ t: 'leave', id: me.id, name: me.name });
      log(`${me.name} left (${players.size} online)`);
      if (hostId === me.id) {
        hostId = players.size ? players.keys().next().value : null;
        if (hostId !== null) {
          broadcast({ t: 'host', id: hostId });
          log(`${players.get(hostId).name} is now the host`);
        } else {
          room.started = false;
          room.edits.clear();
          room.wave = null;
        }
      }
    }

    function handle(me, m) {
      const isHost = me.id === hostId;
      const t = m.t;
      if (RELAY.has(t)) {
        if (t === 'state') me.state = m;
        broadcast({ ...m, id: me.id, name: me.name }, me.id);
      } else if (t === 'skin') {
        me.skin = cleanSkin(m.skin);
        me.slim = !!m.slim;
        broadcast({ t: 'skin', id: me.id, skin: me.skin, slim: me.slim }, me.id);
      } else if (t === 'block') {
        const { x, y, z, b } = m;
        if (![x, y, z, b].every(Number.isInteger)) return;
        room.edits.set(`${x},${y},${z}`, b);
        broadcast({ t: 'block', x, y, z, b, id: me.id }, me.id);
      } else if (t === 'chat') {
        const text = String(m.text || '').slice(0, 120).trim();
        if (text) broadcast({ t: 'chat', id: me.id, name: me.name, text });
      } else if (TO_HOST.has(t)) {
        if (!isHost && hostId !== null) send(players.get(hostId), { ...m, from: me.id });
      } else if (!isHost) {
        return;
      } else if (HOST_RELAY.has(t)) {
        broadcast(m, me.id);
      } else if (t === 'start') {
        room.started = true;
        room.seed = m.seed | 0;
        room.edits.clear();
        room.wave = null;
        broadcast({ t: 'start', seed: room.seed }, me.id);
      } else if (t === 'wave') {
        room.wave = m;
        broadcast(m, me.id);
      } else if (t === 'hurt' || t === 'kill') {
        send(players.get(m.to), m);
      }
    }

    wss.on('connection', (ws) => {
      let me = null;
      ws.isAlive = true;
      ws.on('pong', () => (ws.isAlive = true));
      ws.on('message', (data) => {
        let m;
        try {
          m = JSON.parse(data);
        } catch {
          return;
        }
        if (!m || typeof m.t !== 'string') return;
        if (!me) {
          if (m.t !== 'hello') return;
          if (m.v !== PROTOCOL) {
            ws.send(JSON.stringify({ t: 'error', msg: 'This server runs a different version of Blockfire.' }));
            ws.close();
            return;
          }
          if (players.size >= MAX_PLAYERS) {
            ws.send(JSON.stringify({ t: 'error', msg: `The server is full (${MAX_PLAYERS} players).` }));
            ws.close();
            return;
          }
          me = { ws, id: nextId++, name: cleanName(m.name), skin: cleanSkin(m.skin), slim: !!m.slim, state: null };
          players.set(me.id, me);
          if (hostId === null) hostId = me.id;
          send(me, {
            t: 'welcome',
            id: me.id,
            host: hostId,
            started: room.started,
            seed: room.seed,
            edits: [...room.edits].map(([k, b]) => [...k.split(',').map(Number), b]),
            wave: room.wave,
            players: [...players.values()].filter((p) => p !== me).map(info),
          });
          broadcast({ t: 'join', ...info(me) }, me.id);
          log(`${me.name} joined (${players.size} online)`);
          return;
        }
        handle(me, m);
      });
      ws.on('close', () => me && leave(me));
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
          return players.size;
        },
        close() {
          clearInterval(beat);
          for (const ws of wss.clients) {
            ws.send(JSON.stringify({ t: 'error', msg: 'The host closed the game.' }));
            ws.close();
          }
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

module.exports = { createServer, lanAddresses, PROTOCOL, DEFAULT_PORT };

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
