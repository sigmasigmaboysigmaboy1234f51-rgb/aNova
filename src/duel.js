import * as THREE from 'three';
import { MAPS, buildMap } from './maps.js';
import { THEMES } from './themes.js';

// Duels: players against each other on a handmade map, no mobs. First to
// TARGET knockouts wins, then everyone gets a fresh map for a rematch.

export const TARGET = 10;
const VERBS = ['blasted', 'bonked', 'cubed', 'outplayed', 'flattened', 'zapped', 'sent packing'];

export class Duel {
  constructor(game, mapId) {
    this.game = game;
    this.mapId = MAPS[mapId] ? mapId : 'towers';
    this.map = MAPS[this.mapId];
    this.scores = new Map();
    this.over = false;
    this.spawns = [];
  }

  get theme() {
    return THEMES[this.map.theme];
  }

  build() {
    this.spawns = buildMap(this.game.world, this.mapId);
  }

  // Everyone gets a side: players are sorted by id and take turns.
  spawnFor(id) {
    const g = this.game;
    const ids = [g.myId, ...(g.mp ? g.mp.remotes.list().map((r) => r.id) : [])].sort((a, b) => a - b);
    const i = Math.max(0, ids.indexOf(id));
    const [x, y, z] = this.spawns[i % this.spawns.length];
    const pos = new THREE.Vector3(x, y, z);
    // Face the middle of the map.
    const dx = 32 - x;
    const dz = 32 - z;
    return { pos, yaw: Math.atan2(-dx, -dz) };
  }

  placePlayer() {
    const p = this.game.player;
    const s = this.spawnFor(this.game.myId);
    p.reset(s.pos);
    p.yaw = s.yaw;
    p.invuln = 1.5;
  }

  name(id) {
    const g = this.game;
    if (id === g.myId) return g.mp ? g.mp.name : 'You';
    const r = g.mp && g.mp.remotes.get(id);
    return r ? r.name : 'Someone';
  }

  score(id) {
    return this.scores.get(id) || 0;
  }

  onKill(by, victim) {
    const g = this.game;
    if (this.over || by === victim) return;
    this.scores.set(by, this.score(by) + 1);
    const verb = VERBS[Math.floor(Math.random() * VERBS.length)];
    if (g.mp) g.mp.system(`${this.name(by)} ${verb} ${this.name(victim)}`);
    if (by === g.myId) {
      g.stats.kills++;
      g.hud.popup('Knockout!', 'head');
      g.sound.headshot();
    }
    // The host calls the winner.
    if (g.authority && this.score(by) >= TARGET) {
      const msg = { t: 'duel', k: 'win', id: by, name: this.name(by) };
      if (g.mp) g.mp.net.send(msg);
      this.onWin(msg);
    }
  }

  onWin(m) {
    const g = this.game;
    this.over = true;
    const me = m.id === g.myId;
    g.hud.showBanner(me ? 'You win!' : `${m.name} wins!`, 'Rematch in a few seconds', 6);
    if (me) {
      g.sound.cleared();
      g.gainCoins(100);
    } else g.sound.death();
    // The host starts the rematch on a fresh copy of the map.
    if (g.authority) {
      setTimeout(() => {
        if (g.duel !== this || !g.mp) return;
        const seed = (Math.random() * 2 ** 31) | 0;
        const mode = `duel:${this.mapId}`;
        g.mp.net.send({ t: 'start', seed, mode });
        g.startMultiplayer(seed, [], true, mode);
      }, 7000);
    }
  }

  // The top-left of the HUD: the score.
  hud() {
    const g = this.game;
    const others = g.mp ? g.mp.remotes.list() : [];
    if (!others.length) return ['Duel', `Waiting for an opponent. Share your join code!`];
    const me = this.score(g.myId);
    if (others.length === 1) {
      const o = others[0];
      return [`You ${me} : ${this.score(o.id)} ${o.name}`, `${this.map.name}. First to ${TARGET} wins`];
    }
    let best = others[0];
    for (const o of others) if (this.score(o.id) > this.score(best.id)) best = o;
    return [`You ${me} · Top: ${best.name} ${this.score(best.id)}`, `${this.map.name}. First to ${TARGET} wins`];
  }
}
