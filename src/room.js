// A multiplayer room. The first player in is the host: their game runs the
// mobs and waves, and the room passes messages between everyone.
//
// The same room runs in two places:
//   - inside the host's own game for online play (players connect with a
//     code, peer to peer), and
//   - in server/server.cjs for dedicated servers joined by address.
// A transport is anything with send(text) and close().

export const PROTOCOL = 4;
export const MAX_PLAYERS = 8;

// Messages any player may send, and what the room does with them.
const RELAY = new Set(['state', 'shot', 'died', 'proj', 'boom', 'pvp']);
// Messages only the host may send; they go to everyone else.
const HOST_RELAY = new Set(['mobs', 'bolt', 'mboom', 'bfx', 'pickupAdd', 'pickupGone', 'banner', 'cleared', 'duel']);
// Messages for the host's eyes only.
const TO_HOST = new Set(['hitMob', 'pickup']);
// Messages the host sends to one player.
const DIRECT = new Set(['hurt', 'kill']);

function cleanName(name) {
  const s = String(name || '')
    .replace(/[^\w .\-]/g, '')
    .trim()
    .slice(0, 16);
  return s || 'Player';
}

function cleanSkin(skin) {
  return typeof skin === 'string' && skin.startsWith('data:image/png;base64,') && skin.length < 80000 ? skin : null;
}

export class Room {
  constructor({ maxPlayers = MAX_PLAYERS, log = () => {}, migrate = true } = {}) {
    this.maxPlayers = maxPlayers;
    this.log = log;
    // A dedicated server can hand the game to the next player when the host
    // leaves. A game hosted inside someone's game ends when they leave.
    this.migrate = migrate;
    this.players = new Map();
    this.nextId = 1;
    this.hostId = null;
    this.started = false;
    this.seed = 0;
    this.mode = null;
    this.edits = new Map();
    this.wave = null;
  }

  get size() {
    return this.players.size;
  }

  send(p, msg) {
    if (!p) return;
    try {
      p.t.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } catch {
      /* the connection is going away */
    }
  }

  broadcast(msg, exceptId) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.id !== exceptId) this.send(p, s);
  }

  info(p) {
    return { id: p.id, name: p.name, skin: p.skin, slim: p.slim, state: p.state };
  }

  // A new connection. Returns what the transport should call when a
  // message arrives or the connection closes.
  connect(transport) {
    const session = { me: null };
    return {
      receive: (text) => this.receive(session, transport, text),
      close: () => {
        if (session.me) this.leave(session.me);
      },
    };
  }

  receive(session, transport, text) {
    let m;
    try {
      m = typeof text === 'string' ? JSON.parse(text) : text;
    } catch {
      return;
    }
    if (!m || typeof m.t !== 'string') return;
    if (session.me) {
      this.handle(session.me, m);
      return;
    }
    if (m.t !== 'hello') return;
    const reject = (msg) => {
      try {
        transport.send(JSON.stringify({ t: 'error', msg }));
      } catch {
        /* ignore */
      }
      setTimeout(() => transport.close(), 50);
    };
    if (m.v !== PROTOCOL) return reject('This game runs a different version of Blockfire. Update the game and try again.');
    if (this.players.size >= this.maxPlayers) return reject(`The game is full (${this.maxPlayers} players).`);
    if (!this.migrate && this.hostId === null && this.closed) return reject('The host closed the game.');
    const me = { t: transport, id: this.nextId++, name: cleanName(m.name), skin: cleanSkin(m.skin), slim: !!m.slim, state: null };
    session.me = me;
    this.players.set(me.id, me);
    if (this.hostId === null) this.hostId = me.id;
    this.send(me, {
      t: 'welcome',
      id: me.id,
      host: this.hostId,
      started: this.started,
      seed: this.seed,
      mode: this.mode,
      edits: [...this.edits].map(([k, b]) => [...k.split(',').map(Number), b]),
      wave: this.wave,
      players: [...this.players.values()].filter((p) => p !== me).map((p) => this.info(p)),
    });
    this.broadcast({ t: 'join', ...this.info(me) }, me.id);
    this.log(`${me.name} joined (${this.players.size} online)`);
  }

  leave(me) {
    if (!this.players.delete(me.id)) return;
    this.broadcast({ t: 'leave', id: me.id, name: me.name });
    this.log(`${me.name} left (${this.players.size} online)`);
    if (this.hostId !== me.id) return;
    if (this.migrate && this.players.size) {
      this.hostId = this.players.keys().next().value;
      this.broadcast({ t: 'host', id: this.hostId });
      this.log(`${this.players.get(this.hostId).name} is now the host`);
      return;
    }
    // Nobody left to run the game.
    this.hostId = null;
    this.started = false;
    this.edits.clear();
    this.wave = null;
    if (!this.migrate) this.close('The host left the game.');
  }

  handle(me, m) {
    const isHost = me.id === this.hostId;
    const t = m.t;
    if (RELAY.has(t)) {
      if (t === 'state') me.state = m;
      this.broadcast({ ...m, id: me.id, name: me.name }, me.id);
    } else if (t === 'skin') {
      me.skin = cleanSkin(m.skin);
      me.slim = !!m.slim;
      this.broadcast({ t: 'skin', id: me.id, skin: me.skin, slim: me.slim }, me.id);
    } else if (t === 'block') {
      const { x, y, z, b } = m;
      if (![x, y, z, b].every(Number.isInteger)) return;
      this.edits.set(`${x},${y},${z}`, b);
      this.broadcast({ t: 'block', x, y, z, b, id: me.id }, me.id);
    } else if (t === 'chat') {
      const text = String(m.text || '')
        .slice(0, 120)
        .trim();
      if (text) this.broadcast({ t: 'chat', id: me.id, name: me.name, text });
    } else if (t === 'hitp') {
      // Player-versus-player hits go straight to the player who was hit.
      const to = this.players.get(m.to);
      if (to && to !== me) this.send(to, { ...m, from: me.id, fromName: me.name });
    } else if (TO_HOST.has(t)) {
      if (!isHost && this.hostId !== null) this.send(this.players.get(this.hostId), { ...m, from: me.id });
    } else if (!isHost) {
      return;
    } else if (HOST_RELAY.has(t)) {
      this.broadcast(m, me.id);
    } else if (t === 'start') {
      this.started = true;
      this.seed = m.seed | 0;
      this.mode = typeof m.mode === 'string' ? m.mode.slice(0, 40) : null;
      this.edits.clear();
      this.wave = null;
      this.broadcast({ t: 'start', seed: this.seed, mode: this.mode }, me.id);
    } else if (t === 'wave') {
      this.wave = m;
      this.broadcast(m, me.id);
    } else if (DIRECT.has(t)) {
      this.send(this.players.get(m.to), m);
    }
  }

  close(msg = 'The host closed the game.') {
    this.closed = true;
    for (const p of this.players.values()) {
      this.send(p, { t: 'error', msg });
      try {
        p.t.close();
      } catch {
        /* already closed */
      }
    }
    this.players.clear();
  }
}
