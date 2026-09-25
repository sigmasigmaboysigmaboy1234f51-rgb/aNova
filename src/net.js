import { PROTOCOL } from './room.js';

// Talks to a dedicated Blockfire server (server/server.cjs) over a
// WebSocket. Online games hosted from inside the game use p2p.js instead.
export const DEFAULT_PORT = 25580;

// Accepts "192.168.1.5", "192.168.1.5:25580", "myserver.net" or a full
// ws:// / wss:// address.
export function parseAddress(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (/^wss?:\/\//i.test(s)) return s;
  s = s.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!/:\d+$/.test(s)) s += ':' + DEFAULT_PORT;
  return 'ws://' + s;
}

export class NetClient {
  constructor(url, hello, on) {
    this.on = on;
    this.id = null;
    this.hostId = null;
    this.open = false;
    this.closed = false;
    try {
      this.ws = new WebSocket(url);
    } catch {
      setTimeout(() => this.fail('unreachable'), 0);
      return;
    }
    const ws = this.ws;
    this.timer = setTimeout(() => {
      if (this.open) return;
      this.fail('unreachable');
      ws.close();
    }, 7000);
    ws.onopen = () => {
      this.open = true;
      clearTimeout(this.timer);
      this.send({ ...hello, t: 'hello', v: PROTOCOL });
    };
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
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
    };
    ws.onclose = () => {
      clearTimeout(this.timer);
      this.fail(this.open ? 'lost' : 'unreachable');
    };
    ws.onerror = () => {};
  }

  get isHost() {
    return this.id !== null && this.id === this.hostId;
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  fail(reason) {
    if (this.closed) return;
    this.closed = true;
    if (this.on.close) this.on.close(reason);
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    try {
      if (this.ws) this.ws.close();
    } catch {
      /* already closed */
    }
  }
}
