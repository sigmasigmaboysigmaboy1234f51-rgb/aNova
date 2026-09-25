import { Peer } from 'peerjs';
import { Room, PROTOCOL } from './room.js';

// Online play without a server. The host's own game runs the room, and it
// gets a short join code. Friends type the code and connect straight to the
// host's computer (WebRTC). A public PeerJS broker introduces the two
// computers, and a relay helps when home routers are strict.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PREFIX = 'blockfire-v4-';
const CHUNK = 15000;

export function makeCode(rng = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return s;
}

// Tidies whatever the player typed. Returns null if it can't be a code.
export function cleanCode(input) {
  const s = String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (s.length !== 6 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s;
}

// Which broker to use. The public PeerJS cloud unless the page says
// otherwise (?peer=host:port, used by tests and people running their own).
function peerOptions() {
  const o = { debug: 0 };
  try {
    const q = new URLSearchParams(location.search).get('peer');
    if (q) {
      const [host, port] = q.split(':');
      Object.assign(o, { host, port: Number(port) || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' });
    }
  } catch {
    /* no location */
  }
  return o;
}

// Big messages are split into pieces: "~id|index|count|text".
let nextChunk = 1;
function sendText(conn, text) {
  if (text.length <= CHUNK) {
    conn.send(text);
    return;
  }
  const id = nextChunk++;
  const n = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < n; i++) conn.send(`~${id}|${i}|${n}|${text.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

class Reassembler {
  constructor() {
    this.parts = new Map();
  }

  // Returns the whole message once it is complete, else null.
  take(data) {
    const text = typeof data === 'string' ? data : String(data);
    if (text[0] !== '~') return text;
    const a = text.indexOf('|');
    const b = text.indexOf('|', a + 1);
    const c = text.indexOf('|', b + 1);
    const id = text.slice(1, a);
    const i = Number(text.slice(a + 1, b));
    const n = Number(text.slice(b + 1, c));
    if (!(n > 0 && n < 200 && i >= 0 && i < n)) return null;
    let e = this.parts.get(id);
    if (!e) {
      e = { n, got: 0, list: new Array(n) };
      this.parts.set(id, e);
    }
    if (e.list[i] === undefined) {
      e.list[i] = text.slice(c + 1);
      e.got++;
    }
    if (e.got < e.n) return null;
    this.parts.delete(id);
    return e.list.join('');
  }
}

// Both ends share this: routing messages to the game's handlers.
class Endpoint {
  constructor(on) {
    this.on = on;
    this.id = null;
    this.hostId = null;
    this.closed = false;
  }

  get isHost() {
    return this.id !== null && this.id === this.hostId;
  }

  deliver(text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (m.t === 'welcome') {
      this.id = m.id;
      this.hostId = m.host;
    } else if (m.t === 'host') {
      this.hostId = m.id;
    }
    const fn = this.on[m.t];
    if (fn) fn(m);
  }

  fail(reason) {
    if (this.closed) return;
    this.closed = true;
    if (this.on.close) this.on.close(reason);
  }
}

// Hosting: open a room in this game and wait for friends.
export class PeerHost extends Endpoint {
  constructor(hello, on, { onCode } = {}) {
    super(on);
    this.hello = hello;
    this.onCode = onCode;
    this.room = new Room({ migrate: false });
    this.local = null;
    this.open(0);
  }

  open(attempt) {
    this.code = makeCode();
    const peer = new Peer(PREFIX + this.code, peerOptions());
    this.peer = peer;
    peer.on('open', () => {
      if (this.closed) return;
      if (!this.local) {
        // We join our own room without going through the network.
        this.local = this.room.connect({
          send: (text) => queueMicrotask(() => !this.closed && this.deliver(text)),
          close: () => {},
        });
        this.local.receive(JSON.stringify({ ...this.hello, t: 'hello', v: PROTOCOL }));
      }
      if (this.onCode) this.onCode(this.code);
    });
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      // Lost the broker: players already here stay connected; reconnect so
      // new ones can still find us.
      if (!this.closed) setTimeout(() => !this.closed && !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', (err) => {
      if (this.closed) return;
      if (err.type === 'unavailable-id' && attempt < 5) {
        peer.destroy();
        this.open(attempt + 1);
      } else if (!this.local) {
        this.fail(err.type === 'browser-incompatible' ? 'webrtc' : 'broker');
      }
    });
  }

  accept(conn) {
    const parts = new Reassembler();
    let link = null;
    conn.on('open', () => {
      link = this.room.connect({ send: (text) => conn.open && sendText(conn, text), close: () => conn.close() });
    });
    conn.on('data', (d) => {
      const text = parts.take(d);
      if (text && link) link.receive(text);
    });
    const gone = () => {
      if (link) link.close();
      link = null;
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  send(m) {
    if (this.local && !this.closed) this.local.receive(JSON.stringify(m));
  }

  get playerCount() {
    return this.room.size;
  }

  close() {
    this.closed = true;
    this.room.close('The host closed the game.');
    const peer = this.peer;
    setTimeout(() => peer && peer.destroy(), 400);
  }
}

// Joining a friend's game by code.
export class PeerClient extends Endpoint {
  constructor(code, hello, on) {
    super(on);
    this.open = false;
    const parts = new Reassembler();
    const peer = new Peer(peerOptions());
    this.peer = peer;
    this.timer = setTimeout(() => this.fail(this.reachedBroker ? 'nocode' : 'broker'), 15000);
    peer.on('open', () => {
      this.reachedBroker = true;
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      this.conn = conn;
      conn.on('open', () => {
        this.open = true;
        clearTimeout(this.timer);
        sendText(conn, JSON.stringify({ ...hello, t: 'hello', v: PROTOCOL }));
      });
      conn.on('data', (d) => {
        const text = parts.take(d);
        if (text) this.deliver(text);
      });
      conn.on('close', () => this.fail(this.open ? 'lost' : 'nocode'));
      conn.on('error', () => this.fail(this.open ? 'lost' : 'nocode'));
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') this.fail('nocode');
      else if (!this.open) this.fail(err.type === 'browser-incompatible' ? 'webrtc' : 'broker');
    });
  }

  send(m) {
    if (this.conn && this.conn.open) sendText(this.conn, JSON.stringify(m));
  }

  fail(reason) {
    clearTimeout(this.timer);
    super.fail(reason);
    const peer = this.peer;
    setTimeout(() => peer && !peer.destroyed && peer.destroy(), 200);
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    try {
      if (this.conn) this.conn.close();
    } catch {
      /* already closed */
    }
    const peer = this.peer;
    setTimeout(() => peer && !peer.destroyed && peer.destroy(), 200);
  }
}
