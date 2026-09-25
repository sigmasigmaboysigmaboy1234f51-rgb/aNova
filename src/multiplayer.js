import * as THREE from 'three';
import { NetClient } from './net.js';
import { PeerHost, PeerClient } from './p2p.js';
import { RemotePlayers, F } from './remote.js';
import { $ } from './util.js';

// Glue between the network and the game: decides who runs the mobs, sends
// our state out, applies everyone else's, and runs chat and the player list.

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const vec = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Only the status effects we know, with sane numbers.
function cleanFx(fx) {
  if (!fx || typeof fx !== 'object') return null;
  const out = {};
  for (const k of ['slow', 'burn', 'poison', 'shock', 'knock']) {
    const v = Number(fx[k]);
    if (v > 0) out[k] = Math.min(k === 'slow' ? 0.8 : 4, v);
  }
  return out;
}

export const DEATH_VERBS = {
  moss: 'was clobbered by a Mosshead',
  bone: 'was shot by a Bonehead',
  gloop: 'was flattened by a Gloop',
  skitter: 'was jumped by a Skitter',
  imp: 'was roasted by an Ember Imp',
  fuse: 'was blown up by a Fuse',
  knight: 'was cut down by a Rust Knight',
  golem: 'was pounded by a Cobble Golem',
  bat: 'was bitten by a Flapper',
  ghost: 'was spooked to death by a Specter',
  boss: 'was crushed by a boss',
  self: 'blew themselves up',
};

export class Multiplayer {
  // kind: 'host' (online, peer to peer), 'join' (by code) or 'server'
  // (a dedicated server by address).
  constructor(game, { name, kind, url, code }) {
    this.game = game;
    this.name = name;
    this.kind = kind;
    this.hosting = kind === 'host';
    this.code = kind === 'join' ? code : null;
    this.remotes = new RemotePlayers(game);
    this.stateT = 0;
    this.mobT = 0;
    this.waveT = 0;
    this.lastWaveKey = '';
    this.chatOpen = false;
    this.errorMsg = '';
    this.chatLog = $('#chat-log');
    this.chatForm = $('#chat-form');
    this.chatInput = $('#chat-input');
    this.tablist = $('#tablist');
    this.chatLog.textContent = '';
    this.onSubmit = (e) => {
      e.preventDefault();
      const text = this.chatInput.value.trim();
      if (text) this.net.send({ t: 'chat', text });
      this.closeChat();
    };
    this.onChatKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeChat();
      }
      e.stopPropagation();
    };
    this.chatForm.addEventListener('submit', this.onSubmit);
    this.chatInput.addEventListener('keydown', this.onChatKey);
    this.skinTimer = 0;
    this.onSkin = () => {
      clearTimeout(this.skinTimer);
      this.skinTimer = setTimeout(() => this.sendSkin(), 800);
    };
    game.skin.listeners.add(this.onSkin);
    game.world.onEdit = (x, y, z, b) => this.net.send({ t: 'block', x, y, z, b });

    const hello = { name, skin: game.skin.canvas.toDataURL('image/png'), slim: game.skin.slim };
    const on = this.handlers();
    if (kind === 'host') {
      this.net = new PeerHost(hello, on, {
        onCode: (c) => {
          this.code = c;
          game.onHostCode(c);
        },
      });
    } else if (kind === 'join') this.net = new PeerClient(code, hello, on);
    else this.net = new NetClient(url, hello, on);
  }

  get id() {
    return this.net.id;
  }

  get isHost() {
    return this.net.isHost;
  }

  handlers() {
    const g = this.game;
    return {
      welcome: (m) => {
        for (const p of m.players) this.remotes.add(p);
        if (m.id === m.host && !m.started) {
          const seed = (Math.random() * 2 ** 31) | 0;
          const mode = g.mpMode || null;
          g.startMultiplayer(seed, [], true, mode);
          this.net.send({ t: 'start', seed, mode });
          this.system(this.hosting ? this.inviteText() : 'You are the host. Mobs and waves run on your computer.');
        } else if (m.started) {
          g.startMultiplayer(m.seed, m.edits, m.id === m.host, m.mode);
          if (m.wave) this.applyWave(m.wave);
          const host = this.remotes.get(m.host);
          this.system(`Joined ${host ? host.name + "'s" : 'the'} game. Press T to chat, hold Tab to see players.`);
        } else {
          g.waitingForHost();
        }
      },
      start: (m) => g.startMultiplayer(m.seed, [], false, m.mode),
      join: (m) => {
        this.remotes.add(m);
        this.system(`${m.name} joined the game`);
        g.sound.pickup();
      },
      leave: (m) => {
        this.remotes.remove(m.id);
        this.system(`${m.name} left the game`);
      },
      host: (m) => {
        if (m.id === this.net.id) {
          g.becomeHost();
          this.system('The host left. You are the host now.');
        } else {
          const r = this.remotes.get(m.id);
          this.system(`${r ? r.name : 'Someone'} is the host now`);
        }
      },
      state: (m) => {
        const r = this.remotes.get(m.id) || this.remotes.add({ id: m.id, name: m.name });
        r.pushState(m);
      },
      skin: (m) => {
        const r = this.remotes.get(m.id);
        if (r && m.skin) r.setSkin(m.skin, m.slim);
      },
      block: (m) => g.world.set(m.x, m.y, m.z, m.b, true),
      shot: (m) => {
        const r = this.remotes.get(m.id);
        if (!r || !Array.isArray(m.e)) return;
        r.onShot(vec(m.a), m.e.slice(0, 16).map(vec), m);
      },
      proj: (m) => {
        g.combat.spawn(m.k, vec(m.o), vec(m.v), { block: m.b });
        if (m.k === 'nade') g.sound.throw();
      },
      boom: (m) => g.combat.explode(vec(m.p), Math.min(8, Number(m.r) || 3), 0, { small: !!m.s }),
      chat: (m) => this.line(m.name, m.text),
      died: (m) => this.system(`${m.name} ${DEATH_VERBS[m.by] || 'was cubed'}`),
      mobs: (m) => {
        if (!this.isHost) g.mobs.applySnapshot(m.l);
      },
      bolt: (m) => {
        if (!this.isHost) g.mobs.spawnBolt(vec(m.o), vec(m.v), m.m, true, typeof m.k === 'string' ? m.k : 'bolt');
      },
      bfx: (m) => {
        if (!this.isHost && m.e && typeof m.e.k === 'string') g.mobs.applyBossFx(m.e);
      },
      hitp: (m) => {
        if (!g.duel || m.to !== this.id) return;
        const r = this.remotes.get(m.from);
        const fx = m.fx ? { burn: Math.min(3, Number(m.fx[0]) || 0) > 0 ? 1 : 0, slow: Math.min(0.6, Number(m.fx[1]) || 0) } : null;
        g.player.pvpHit(Math.min(60, Number(m.d) || 0), r ? r.pos : null, m.from, fx, !!m.h);
      },
      pvp: (m) => {
        if (g.duel && m.k === 'kill') g.duel.onKill(m.by, m.id);
      },
      duel: (m) => {
        if (g.duel && m.k === 'win') g.duel.onWin(m);
      },
      mboom: (m) => {
        if (!this.isHost) g.mobs.applyBlast(vec(m.p), Math.min(8, Number(m.r) || 3), Number(m.d) || 0, { source: m.s, fx: cleanFx(m.fx) });
      },
      pickupAdd: (m) => {
        if (!this.isHost) g.mobs.spawnPickup(m.kind, m.p[0], m.p[1], m.p[2], m.k, m.v | 0);
      },
      pickupGone: (m) => g.mobs.removePickup(m.k),
      pickup: (m) => {
        if (this.isHost && g.mobs.removePickup(m.k)) this.net.send({ t: 'pickupGone', k: m.k });
      },
      hitMob: (m) => {
        if (!this.isHost) return;
        const mob = g.mobs.list.find((x) => x.id === m.m && !x.remote);
        const fx = m.fx ? { burn: Number(m.fx[0]) || 0, slow: Math.min(0.8, Number(m.fx[1]) || 0) } : null;
        if (mob) mob.damage(m.d, { x: m.dir[0], y: 0, z: m.dir[1] }, !!m.h, null, m.from, fx);
      },
      wave: (m) => {
        if (!this.isHost) this.applyWave(m);
      },
      banner: (m) => {
        g.hud.showBanner(m.title, m.sub);
        if (m.sound === 'wave') g.sound.wave();
      },
      cleared: (m) => g.onWaveCleared(m.n, m.bonus),
      hurt: (m) => g.player.hurt(m.d, m.f ? { x: m.f[0], y: m.f[1], z: m.f[2] } : null, m.s, cleanFx(m.fx)),
      kill: (m) => g.creditKill(m.pts, m.head, typeof m.mt === 'string' ? m.mt : null),
      error: (m) => {
        this.errorMsg = m.msg;
      },
      close: (reason) => g.onDisconnected(reason, this.errorMsg),
    };
  }

  inviteText() {
    return this.code ? `You are hosting. Your join code is ${this.code}. Friends click Multiplayer, then type it under Join a friend.` : 'You are hosting.';
  }

  applyWave(m) {
    const g = this.game;
    g.wave = m.n;
    g.netLeft = m.left;
    g.waveState = m.rest ? 'rest' : 'fight';
    g.lastWaveMsg = m;
  }

  // --- Sending ---------------------------------------------------------

  // One trigger pull: where it came from, where every pellet ended, and
  // how to draw it.
  sendShot(from, ends, o) {
    this.net.send({
      t: 'shot',
      a: [r2(from.x), r2(from.y), r2(from.z)],
      e: ends.map((e) => [r2(e.x), r2(e.y), r2(e.z)]),
      g: o.gun,
      c: o.color,
      q: o.quiet ? 1 : 0,
      z: o.zap ? 1 : 0,
      bm: o.beam ? 1 : 0,
    });
  }

  sendProj(kind, o, v, block) {
    this.net.send({ t: 'proj', k: kind, o: [r2(o.x), r2(o.y), r2(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)], b: block || 0 });
  }

  sendBoom(at, r, small) {
    this.net.send({ t: 'boom', p: [r2(at.x), r2(at.y), r2(at.z)], r: r2(r), s: small ? 1 : 0 });
  }

  sendHitMob(mob, amount, head, dir, fx) {
    const msg = { t: 'hitMob', m: mob.id, d: amount, h: head ? 1 : 0, dir: [r2(dir.x), r2(dir.z)] };
    if (fx && (fx.burn || fx.slow)) msg.fx = [r2(fx.burn || 0), r2(fx.slow || 0)];
    this.net.send(msg);
  }

  sendBolt(o, v, mobId, kind) {
    if (!this.isHost) return;
    this.net.send({ t: 'bolt', o: [r2(o.x), r2(o.y), r2(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)], m: mobId, k: kind });
  }

  sendBossFx(e) {
    this.net.send({ t: 'bfx', e });
  }

  sendMobBoom(at, r, d, { source, fx } = {}) {
    this.net.send({ t: 'mboom', p: [r2(at.x), r2(at.y), r2(at.z)], r: r2(r), d, s: source, fx: fx || null });
  }

  sendHurt(to, d, from, s, fx) {
    this.net.send({ t: 'hurt', to, d, f: from ? [r2(from.x), r2(from.y), r2(from.z)] : null, s, fx: fx || null });
  }

  sendKill(to, pts, head, type) {
    this.net.send({ t: 'kill', to, pts, head: !!head, mt: type });
  }

  pickupAdded(pk) {
    if (this.isHost) this.net.send({ t: 'pickupAdd', k: pk.id, kind: pk.kind, p: [r2(pk.x), r2(pk.base), r2(pk.z)], v: pk.value || 0 });
  }

  pickupTaken(id) {
    this.net.send(this.isHost ? { t: 'pickupGone', k: id } : { t: 'pickup', k: id });
  }

  sendHitPlayer(to, d, head, s, dir) {
    const msg = { t: 'hitp', to, d: r2(d), h: head ? 1 : 0 };
    if (s && (s.burn || s.slow)) msg.fx = [r2(s.burn || 0), r2(s.slow || 0)];
    this.net.send(msg);
  }

  // We got knocked out in a duel.
  sendKnockout(by) {
    this.net.send({ t: 'pvp', k: 'kill', by });
  }

  sendDied(by) {
    this.net.send({ t: 'died', by });
    this.system(`You ${(DEATH_VERBS[by] || 'were cubed').replace(/^was/, 'were')}`);
  }

  sendBanner(title, sub, sound) {
    this.net.send({ t: 'banner', title, sub, sound });
  }

  sendCleared(n, bonus) {
    this.net.send({ t: 'cleared', n, bonus });
  }

  sendSkin() {
    this.net.send({ t: 'skin', skin: this.game.skin.canvas.toDataURL('image/png'), slim: this.game.skin.slim });
  }

  // --- Every frame -----------------------------------------------------

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.remotes.update(dt);

    this.stateT -= dt;
    if (this.stateT <= 0 && g.inGame) {
      this.stateT = 0.05;
      const f =
        (p.crouch ? F.crouch : 0) |
        (p.sprint ? F.sprint : 0) |
        (p.onGround ? F.ground : 0) |
        (p.dead ? F.dead : 0) |
        (p.hurtT > 0 ? F.hurt : 0) |
        (p.inWater ? F.water : 0);
      const w = p.weapon;
      this.net.send({
        t: 'state',
        p: [r3(p.pos.x), r3(p.pos.y), r3(p.pos.z)],
        y: r3(p.yaw),
        pi: r3(p.pitch + p.kick),
        f,
        a: w && (p.sinceShot < 1.4 || w.reloadT > 0 || p.ads > 0.3) ? 1 : 0,
        r: w ? r2(w.reloadFrac) : -1,
        w: w ? w.id : '',
        wb: w ? w.code : '',
        bk: w ? 0 : p.blockType(),
        sw: p.swing > 0 ? 1 : 0,
        sc: g.stats.score,
        k: g.stats.kills,
        st: g.profile.styleCode(),
      });
    }

    if (this.isHost && g.inGame) {
      this.mobT -= dt;
      if (this.mobT <= 0) {
        this.mobT = 0.1;
        this.net.send({ t: 'mobs', l: g.mobs.snapshot() });
      }
      this.waveT -= dt;
      const left = g.waveState === 'rest' ? null : g.queue.length + g.mobs.alive();
      const key = `${g.wave}|${left}|${g.waveState}`;
      if (key !== this.lastWaveKey || this.waveT <= 0) {
        this.lastWaveKey = key;
        this.waveT = 1;
        const msg = { t: 'wave', n: g.wave, left, rest: g.waveState === 'rest' };
        g.lastWaveMsg = msg;
        this.net.send(msg);
      }
    }

    // Chat lines fade out after a while unless the chat box is open.
    const now = performance.now();
    for (const el of this.chatLog.children) el.classList.toggle('old', !this.chatOpen && now - Number(el.dataset.t) > 9000);

    const showTab = g.input.keys.has('Tab') && g.inGame;
    this.tablist.hidden = !showTab;
    if (showTab) this.renderTab();
  }

  renderTab() {
    const g = this.game;
    const rows = [
      { name: `${this.name} (you)`, score: g.stats.score, kills: g.stats.kills, host: this.isHost, dead: g.player.dead },
      ...this.remotes.list().map((r) => ({ name: r.name, score: r.score, kills: r.kills, host: r.id === this.net.hostId, dead: r.dead })),
    ].sort((a, b) => b.score - a.score);
    const body = this.tablist.querySelector('tbody');
    body.textContent = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = r.name;
      if (r.host) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = 'Host';
        name.append(' ', tag);
      }
      if (r.dead) tr.className = 'dead';
      const kills = document.createElement('td');
      kills.textContent = String(r.kills);
      const score = document.createElement('td');
      score.textContent = r.score.toLocaleString('en-US');
      tr.append(name, kills, score);
      body.appendChild(tr);
    }
  }

  // --- Chat ------------------------------------------------------------

  line(name, text) {
    const el = document.createElement('div');
    el.className = 'chat-line';
    el.dataset.t = String(performance.now());
    if (name) {
      const who = document.createElement('b');
      who.textContent = name + ': ';
      el.appendChild(who);
    }
    el.appendChild(document.createTextNode(text));
    this.chatLog.appendChild(el);
    while (this.chatLog.children.length > 40) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  system(text) {
    this.line('', text);
    this.chatLog.lastChild.classList.add('sys');
  }

  openChat() {
    if (this.chatOpen) return;
    this.chatOpen = true;
    this.chatForm.hidden = false;
    this.chatInput.value = '';
    this.game.input.active = false;
    this.game.input.releaseAll();
    this.chatInput.focus();
  }

  closeChat() {
    if (!this.chatOpen) return;
    this.chatOpen = false;
    this.chatForm.hidden = true;
    this.chatInput.blur();
    this.game.input.active = this.game.state === 'playing';
  }

  close() {
    this.net.close();
    this.closeChat();
    this.remotes.clear();
    this.tablist.hidden = true;
    this.chatForm.removeEventListener('submit', this.onSubmit);
    this.chatInput.removeEventListener('keydown', this.onChatKey);
    this.game.skin.listeners.delete(this.onSkin);
    clearTimeout(this.skinTimer);
    this.game.world.onEdit = null;
  }
}
