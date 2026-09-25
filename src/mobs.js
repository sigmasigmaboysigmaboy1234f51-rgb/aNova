import * as THREE from 'three';
import { FlowField } from './flow.js';
import { SX, SZ, SEA, B, BLOCKS } from './world.js';
import { TILE_UV, T } from './textures.js';
import { MAX_NADES } from './player.js';
import { Mob, MF } from './mob.js';
import { Boss, BOSSES } from './boss.js';
import { MOB_TYPES, TYPE_LIST } from './mobtypes.js';

// All the mobs, their projectiles and the pickups they drop.

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;
const cols = (...c) => c.map((x) => new THREE.Color(x));
const COIN_COLORS = cols('#fff2a8', '#ffd84a', '#e0a526');
const PICKUP_LIFE = { heart: 25, blocks: 25, nade: 25, coin: 30, crate: 120, shard: 1e8 };
const CRATE_DROP = 18;
const TYPE_INDEX = new Map(TYPE_LIST.map((t, i) => [t, i]));
const DUST = cols('#8a7a5a', '#6b5a45', '#a89a7a');
const FROST = cols('#ffffff', '#c9ecff', '#9fe8ff');
const TOXIC = cols('#9be070', '#c8f25a');
const SHADOW_PUFF = cols('#1a1620', '#2a2236', '#5a4a78', '#b46cff');
const SHARD_SPARKS = cols('#d8c4ff', '#b89cff', '#ffffff');

// Everything mobs throw or shoot. Bosses add their own kinds.
// boom: explodes in this radius on impact. breaks: the blast digs blocks.
export const BOLTS = {
  bolt: { color: 0xbff3ff, grav: 5, dmg: 3, colors: cols('#bff3ff', '#6fd6f0') },
  'bolt:frost': { color: 0x9fe8ff, grav: 5, dmg: 3, fx: { slow: 0.45 }, colors: cols('#ffffff', '#9fe8ff') },
  'bolt:blaze': { color: 0xff7a2f, grav: 5, dmg: 3, fx: { burn: 1 }, colors: cols('#ffd36b', '#ff6a20') },
  'bolt:toxic': { color: 0x9be070, grav: 5, dmg: 3, fx: { poison: 1 }, colors: cols('#c8f25a', '#7bc62a') },
  'bolt:shock': { color: 0xc8a4ff, grav: 5, dmg: 3, fx: { shock: 2 }, colors: cols('#fff6a0', '#c8a4ff') },
  'bolt:golden': { color: 0xffd84a, grav: 5, dmg: 3, colors: cols('#fff6c8', '#ffd84a') },
  'bolt:shadow': { color: 0xd27bff, grav: 5, dmg: 3, colors: cols('#d27bff', '#3a3050') },
  fire: { color: 0xff7a2f, cube: 0.24, grav: 12, dmg: 3, boom: 1.5, fx: { burn: 1 }, life: 4, trail: cols('#ffd36b', '#ff6a20', '#3a3030'), colors: cols('#fff2b0', '#ff9a3c', '#ff6a20') },
  // Boss ammo.
  bone: { color: 0xe8e2cc, cube: 0.26, grav: 5, dmg: 4, colors: cols('#e8e2cc', '#c4bca6') },
  ice: { color: 0xc9ecff, grav: 4, dmg: 3, fx: { slow: 0.5 }, colors: cols('#ffffff', '#9fe8ff') },
  storm: { color: 0xfff6a0, grav: 4, dmg: 3, fx: { shock: 2 }, colors: cols('#fff6a0', '#c8a4ff') },
  shade: { color: 0xb46cff, cube: 0.22, grav: 3, dmg: 4, colors: cols('#d27bff', '#3a3050'), trail: cols('#2a2236', '#5a4a78') },
  gold: { color: 0xffd84a, cube: 0.22, grav: 5, dmg: 4, colors: cols('#fff6c8', '#ffd84a') },
  lava: { color: 0xff5a1a, cube: 0.75, grav: 14, dmg: 7, boom: 2.8, breaks: true, fx: { burn: 1 }, life: 6, trail: cols('#ffd36b', '#ff6a20', '#2a1a14'), colors: cols('#ff9a3c', '#ff6a20') },
  rock: {
    color: 0x7a7a7a,
    cube: 0.8,
    grav: 14,
    dmg: 7,
    boom: 2.2,
    life: 6,
    trail: cols('#8a8a8a', '#5e5e5e'),
    colors: cols('#8a8a8a', '#5e5e5e'),
    // The boulder breaks into a pile of cobblestone.
    onBoom(g, b) {
      if (!g.authority) return;
      const w = g.world;
      const x0 = Math.floor(b.pos.x);
      const z0 = Math.floor(b.pos.z);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > 1 && Math.random() < 0.5) continue;
          const y = g.mobs.groundAt(x0 + dx + 0.5, z0 + dz + 0.5);
          if (y <= SEA || g.combat.occupied(x0 + dx, y, z0 + dz)) continue;
          w.set(x0 + dx, y, z0 + dz, B.COBBLE);
        }
      }
    },
  },
  toxic: {
    color: 0x7bc62a,
    cube: 0.4,
    grav: 14,
    dmg: 3,
    boom: 1.6,
    fx: { poison: 1 },
    life: 6,
    trail: cols('#c8f25a', '#3f6b12'),
    colors: cols('#c8f25a', '#7bc62a'),
    onBoom(g, b) {
      if (g.authority) g.mobs.bossFx({ k: 'cloud', p: [b.pos.x, b.pos.y, b.pos.z], r: 2.4, dur: 6 });
    },
  },
};

export class Mobs {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.bolts = [];
    this.pickups = [];
    this.flow = new FlowField();
    this.flowTimer = 0;
    this.flowKey = '';
    this.nextId = 1;
    this.nextPickup = 1;
    this.boltGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
    this.cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    this.boltMats = new Map();
    this.effects = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    this.discGeo = new THREE.CircleGeometry(1, 24);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xbff3ff });
    this.shardGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.bowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.62);
    this.bowMat = new THREE.MeshLambertMaterial({ color: 0x5b4632 });
    this.heartProto = this.makeHeart();
    this.bundleProto = this.makeBundle(game.atlas.texture);
    this.coinProto = this.makeCoin();
    this.nadeProto = this.makeNade();
  }

  makeCoin() {
    const g = new THREE.Group();
    const gold = new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x6a4a00 });
    const dark = new THREE.MeshLambertMaterial({ color: 0xc08a1a, emissive: 0x3a2400 });
    const rim = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    // A pixel-art coin: a ring of gold with a stamped middle.
    const rows = ['.XXX.', 'XOOOX', 'XOXOX', 'XOOOX', '.XXX.'];
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '.') return;
        const m = new THREE.Mesh(rim, ch === 'X' ? gold : dark);
        m.position.set((i - 2) * 0.06, (2 - j) * 0.06, 0);
        if (ch === 'O') m.scale.z = 0.6;
        g.add(m);
      });
    });
    return g;
  }

  makeNade() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), new THREE.MeshLambertMaterial({ color: 0x3d4a2c }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), new THREE.MeshBasicMaterial({ color: 0xff7a2f }));
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), new THREE.MeshLambertMaterial({ color: 0xbfbfbf }));
    pin.position.y = 0.15;
    g.add(body, band, pin);
    return g;
  }

  // Supply crate: planks box on a striped parachute, with a light beam so
  // you can find it.
  makeCrate() {
    const atlas = this.game.atlas;
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const [u0, v0, u1, v1] = TILE_UV[BLOCKS[B.PLANKS].side];
    const uv = box.attributes.uv;
    for (let f = 0; f < 6; f++) {
      uv.setXY(f * 4, u0, v1);
      uv.setXY(f * 4 + 1, u1, v1);
      uv.setXY(f * 4 + 2, u0, v0);
      uv.setXY(f * 4 + 3, u1, v0);
    }
    const crate = new THREE.Mesh(box, new THREE.MeshLambertMaterial({ map: atlas.texture }));
    crate.position.y = 0.4;
    g.add(crate);
    const strapMat = new THREE.MeshLambertMaterial({ color: 0xff7a2f, emissive: 0x401800 });
    for (const rot of [0, Math.PI / 2]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.84, 0.12), strapMat);
      strap.position.y = 0.4;
      strap.rotation.y = rot;
      g.add(strap);
    }
    const star = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.26), new THREE.MeshBasicMaterial({ color: 0xffd84a }));
    star.position.y = 0.83;
    g.add(star);

    const chute = new THREE.Group();
    const red = new THREE.MeshLambertMaterial({ color: 0xd8392b });
    const white = new THREE.MeshLambertMaterial({ color: 0xf4f1ea });
    for (let i = -3; i <= 3; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 2.6), i % 2 ? red : white);
      panel.position.set(i * 0.42, 3.1 - Math.abs(i) * Math.abs(i) * 0.06, 0);
      panel.rotation.z = -i * 0.09;
      chute.add(panel);
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.5, 0.03), lineMat);
      line.position.set(x * 0.8, 1.95, z * 0.75);
      line.rotation.z = -x * 0.17;
      line.rotation.x = z * 0.14;
      chute.add(line);
    }
    g.add(chute);
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 40, 0.3).translate(0, 20, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    g.add(beam);
    g.userData = { chute, beam };
    return g;
  }

  // A Heartstone spark for story mode: a spinning crystal under a beam.
  makeShard() {
    const g = new THREE.Group();
    const glow = new THREE.MeshBasicMaterial({ color: 0xb89cff });
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), glow);
    core.rotation.set(0.5, 0, 0.5);
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.7, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xd8c4ff, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shell.rotation.set(0.5, 0, 0.5);
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 40, 0.3).translate(0, 20, 0),
      new THREE.MeshBasicMaterial({ color: 0xb46cff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    g.add(core, shell, beam);
    return g;
  }

  // Top of the ground at a column, or -1 for water / nothing.
  groundAt(x, z) {
    const w = this.game.world;
    for (let y = 30; y > 0; y--) if (w.solid(Math.floor(x), y, Math.floor(z))) return y + 1;
    return -1;
  }

  // The boss bar shows the biggest mob that is still standing.
  boss() {
    return this.list.find((m) => m.def.boss && m.state !== 'dying' && !m.gone) || null;
  }

  makeHeart() {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8392b, emissive: 0x5a0a04 });
    const rows = ['.X.X.', 'XXXXX', '.XXX.', '..X..'];
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch !== 'X') return;
        const m = new THREE.Mesh(geo, mat);
        m.position.set((i - 2) * 0.08, (1.5 - j) * 0.08, 0);
        g.add(m);
      });
    });
    return g;
  }

  makeBundle(atlasTex) {
    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const [u0, v0, u1, v1] = TILE_UV[T.COBBLE];
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      uv.setXY(f * 4, u0, v1);
      uv.setXY(f * 4 + 1, u1, v1);
      uv.setXY(f * 4 + 2, u0, v0);
      uv.setXY(f * 4 + 3, u1, v0);
    }
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: atlasTex }));
  }

  clear() {
    for (const m of this.list) m.remove(false);
    for (const b of this.bolts) this.game.scene.remove(b.mesh);
    for (const pk of this.pickups) this.game.scene.remove(pk.mesh);
    for (const e of this.effects) if (e.mesh) this.game.scene.remove(e.mesh);
    this.list = [];
    this.bolts = [];
    this.pickups = [];
    this.effects = [];
    this.flowKey = '';
  }

  alive() {
    let n = 0;
    for (const m of this.list) if (m.state !== 'dying') n++;
    return n;
  }

  pickTarget(pos) {
    let best = null;
    let bd = Infinity;
    for (const t of this.game.targets()) {
      const d = (t.pos.x - pos.x) ** 2 + (t.pos.y - pos.y) ** 2 + (t.pos.z - pos.z) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  refreshFlow(force = false) {
    const cells = this.game.targets().map((t) => [Math.floor(t.pos.x), Math.floor(t.pos.z)]);
    if (!cells.length) cells.push([SX >> 1, SZ >> 1]);
    const key = cells.map((c) => c.join(',')).join(';') + '|' + this.game.world.version;
    if (force || key !== this.flowKey) {
      this.flow.compute(this.game.world, cells);
      this.flowKey = key;
    }
  }

  findSpawn() {
    const f = this.flow;
    const players = this.game.targets();
    for (let pass = 0; pass < 2; pass++) {
      const minD = pass === 0 ? 17 : 9;
      for (let i = 0; i < 90; i++) {
        const x = 2 + Math.floor(Math.random() * (SX - 4));
        const z = 2 + Math.floor(Math.random() * (SZ - 4));
        const s = f.standAt(x, z);
        if (s <= SEA) continue;
        let near = Infinity;
        for (const p of players) near = Math.min(near, Math.hypot(x + 0.5 - p.pos.x, z + 0.5 - p.pos.z));
        if (near < minD || (players.length && near > 40)) continue;
        if (pass === 0 && !isFinite(f.at(x, z))) continue;
        return new THREE.Vector3(x + 0.5, s, z + 0.5);
      }
    }
    return null;
  }

  spawn(type, mul) {
    const at = this.findSpawn();
    if (!at) return null;
    const m = new Mob(this, MOB_TYPES[type] ? type : 'moss', at.x, at.y, at.z, mul, this.nextId++);
    this.list.push(m);
    return m;
  }

  // Put a mob at a spot (bosses summon their friends this way).
  spawnAt(type, x, z, mul) {
    const y = this.groundAt(x, z);
    if (y <= SEA) return null;
    const m = new Mob(this, MOB_TYPES[type] ? type : 'moss', Math.floor(x) + 0.5, y, Math.floor(z) + 0.5, mul, this.nextId++);
    this.list.push(m);
    return m;
  }

  spawnBoss(index, mul, boost = 1) {
    const b = BOSSES[index % BOSSES.length];
    const at = this.findSpawn();
    if (!at) return null;
    const boss = new Boss(this, b.type, at.x, at.y, at.z, mul, this.nextId++);
    boss.hpBoost = boost;
    boss.maxHp *= boost;
    boss.hp = boss.maxHp;
    boss.clearAround();
    this.list.push(boss);
    return boss;
  }

  // Boss effects everyone sees: shockwaves, lightning, breath, clouds.
  // The host starts them; each player checks whether they got caught.
  bossFx(ev) {
    this.applyBossFx(ev);
    const g = this.game;
    if (g.mp && g.authority) g.mp.sendBossFx(ev);
  }

  applyBossFx(ev) {
    const g = this.game;
    const at = new THREE.Vector3(ev.p ? ev.p[0] : 0, ev.p ? ev.p[1] : 0, ev.p ? ev.p[2] : 0);
    const scene = g.scene;
    if (ev.k === 'ring') {
      const mesh = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(at.x, at.y + 0.08, at.z);
      scene.add(mesh);
      this.effects.push({ k: 'ring', at, mesh, r: 0.6, max: Math.min(10, ev.r || 7), d: ev.d | 0, hit: false });
      g.sound.landThud(1);
      g.sound.explosion(0.6, false);
      const p = g.player;
      p.shake = Math.max(p.shake, 0.35 * Math.max(0, 1 - p.pos.distanceTo(at) / 25));
    } else if (ev.k === 'strike') {
      const mesh = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.35, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(at.x, at.y + 0.06, at.z);
      scene.add(mesh);
      this.effects.push({ k: 'strike', at, mesh, t: Math.min(3, ev.delay || 1), d: ev.d | 0 });
    } else if (ev.k === 'breath') {
      this.effects.push({ k: 'breath', id: ev.id, t: Math.min(3, ev.dur || 1.6), d: ev.d | 0, tick: 0 });
    } else if (ev.k === 'cloud') {
      this.effects.push({ k: 'cloud', at, r: Math.min(4, ev.r || 2.4), t: Math.min(8, ev.dur || 6), tick: 0 });
    } else if (ev.k === 'puff') {
      g.fx.burst(at.x, at.y, at.z, SHADOW_PUFF, 40, { speed: 4, size: 0.22, up: 1.5, life: 0.9, spread: 0.8, grav: -2 });
      g.sound.explosion(0.3, true);
    }
  }

  updateEffects(dt) {
    const g = this.game;
    const p = g.player;
    const alive = !p.dead && g.inGame;
    for (const e of this.effects) {
      if (e.k === 'ring') {
        const speed = 9;
        e.r += speed * dt;
        const k = e.r / e.max;
        e.mesh.scale.setScalar(e.r);
        e.mesh.material.opacity = Math.max(0, 0.85 * (1 - k));
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          g.fx.burst(e.at.x + Math.cos(a) * e.r, e.at.y + 0.1, e.at.z + Math.sin(a) * e.r, DUST, 1, { speed: 1.5, size: 0.12, up: 2.5, life: 0.4, spread: 0.1 });
        }
        // Jump over the wave to dodge it.
        if (alive && !e.hit) {
          const d = Math.hypot(p.pos.x - e.at.x, p.pos.z - e.at.z);
          if (Math.abs(d - e.r) < 0.8 && p.pos.y - e.at.y < 0.9 && p.pos.y - e.at.y > -1.5) {
            e.hit = true;
            p.hurt(e.d, e.at, 'boss', { knock: 1.4 });
          }
        }
        if (k >= 1) e.done = true;
      } else if (e.k === 'strike') {
        e.t -= dt;
        e.mesh.material.opacity = 0.25 + (Math.sin(e.t * 25) > 0 ? 0.3 : 0);
        e.mesh.scale.setScalar(1.7 * (1.1 - Math.min(1, e.t) * 0.1));
        if (e.t <= 0) {
          // Lightning from the sky.
          let last = new THREE.Vector3(e.at.x, e.at.y + 26, e.at.z);
          for (let i = 1; i <= 8; i++) {
            const next = new THREE.Vector3(e.at.x + (Math.random() - 0.5) * (i < 8 ? 1.2 : 0), e.at.y + 26 - (26 * i) / 8, e.at.z + (Math.random() - 0.5) * (i < 8 ? 1.2 : 0));
            g.tracers.fire(last, next, 0xfff6a0, 0.09);
            last = next;
          }
          g.combat.explode(new THREE.Vector3(e.at.x, e.at.y + 0.3, e.at.z), 1.8, 0, { small: true });
          g.sound.zap(1);
          if (alive && Math.hypot(p.pos.x - e.at.x, p.pos.z - e.at.z) < 1.8 && Math.abs(p.pos.y - e.at.y) < 2.5) p.hurt(e.d, e.at, 'boss', { shock: 2 });
          e.done = true;
        }
      } else if (e.k === 'breath') {
        e.t -= dt;
        const boss = this.list.find((m) => m.id === e.id);
        if (!boss || boss.state === 'dying') e.done = true;
        else {
          const fx = Math.sin(boss.yaw);
          const fz = Math.cos(boss.yaw);
          const hy = boss.pos.y + 2.75 * boss.def.scale;
          for (let i = 0; i < 4; i++) {
            const s = 4 + Math.random() * 6;
            const spread = (Math.random() - 0.5) * 0.7;
            g.fx.emit(boss.pos.x + fx * 0.8, hy, boss.pos.z + fz * 0.8, (fx + spread * fz) * s, -1 + Math.random() * 1.2, (fz - spread * fx) * s, FROST[i % 3], 0.8, 0.14, 0);
          }
          e.tick -= dt;
          if (alive && e.tick <= 0) {
            e.tick = 0.3;
            const dx = p.pos.x - boss.pos.x;
            const dz = p.pos.z - boss.pos.z;
            const d = Math.hypot(dx, dz);
            const dot = (dx * fx + dz * fz) / (d || 1);
            if (d < 8.5 && dot > 0.8 && Math.abs(p.pos.y + 1 - hy) < 3) p.hurt(e.d, boss.pos, 'boss', { slow: 0.55 });
          }
        }
        if (e.t <= 0) e.done = true;
      } else if (e.k === 'cloud') {
        e.t -= dt;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * e.r;
          g.fx.emit(e.at.x + Math.cos(a) * r, e.at.y + Math.random() * 0.8, e.at.z + Math.sin(a) * r, 0, 0.6, 0, TOXIC[i], 1, 0.3, -0.5);
        }
        e.tick -= dt;
        if (alive && e.tick <= 0) {
          e.tick = 0.5;
          const d = vA.set(p.pos.x, p.pos.y + 0.5, p.pos.z).distanceTo(e.at);
          if (d < e.r + 0.4) p.applyStatus({ poison: 1 }, 'boss');
        }
        if (e.t <= 0) e.done = true;
      }
      if (e.done && e.mesh) {
        g.scene.remove(e.mesh);
        e.mesh.material.dispose();
      }
    }
    this.effects = this.effects.filter((e) => !e.done);
  }

  boltMaterial(kind) {
    if (!this.boltMats.has(kind)) this.boltMats.set(kind, new THREE.MeshBasicMaterial({ color: (BOLTS[kind] || BOLTS.bolt).color }));
    return this.boltMats.get(kind);
  }

  spawnBolt(o, v, mobId, fromNet = false, kind = 'bolt') {
    const cfg = BOLTS[kind] || BOLTS.bolt;
    const mesh = new THREE.Mesh(cfg.cube ? this.cubeGeo : this.boltGeo, this.boltMaterial(kind));
    if (cfg.cube) mesh.scale.setScalar(cfg.cube);
    mesh.position.copy(o);
    this.game.scene.add(mesh);
    const m = this.list.find((x) => x.id === mobId);
    this.bolts.push({ pos: o.clone(), vel: v.clone(), life: cfg.life || 3, mesh, cfg, src: m ? m.family : 'bone' });
    if (fromNet) {
      if (m) {
        m.fired = 1;
        this.game.sound.bolt(m.vol());
      }
    } else if (this.game.mp) {
      this.game.mp.sendBolt(o, v, mobId, kind);
    }
  }

  // A mob explosion. The host decides it happened; every player draws it
  // and checks whether it caught them.
  blast(at, r, dmg, opts = {}) {
    this.applyBlast(at, r, dmg, opts);
    const g = this.game;
    if (opts.breaks && g.authority) g.combat.breakBlocks(at, r);
    if (g.mp && g.authority) g.mp.sendMobBoom(at, r, dmg, opts);
  }

  applyBlast(at, r, dmg, { source = 'fuse', fx = null } = {}) {
    const g = this.game;
    g.combat.explode(at, r, 0, { small: r < 2 });
    const bc = g.story && g.story.beacon;
    if (bc && !bc.dead && vB.set(bc.pos.x, bc.pos.y + 1, bc.pos.z).distanceTo(at) < r + 0.5) bc.hurt(dmg);
    const p = g.player;
    if (p.dead || !g.inGame) return;
    const d = vA.set(p.pos.x, p.pos.y + 0.9, p.pos.z).distanceTo(at);
    if (d < r) p.hurt(Math.max(1, Math.round(dmg * (1 - (d / r) * 0.6))), at, source, fx);
  }

  // y is the ground height the pickup rests on.
  spawnPickup(kind, x, y, z, id, value = 0) {
    if (id === undefined || id === null) id = this.nextPickup++;
    let mesh;
    if (kind === 'crate') mesh = this.makeCrate();
    else if (kind === 'shard') mesh = this.makeShard();
    else {
      const proto = { heart: this.heartProto, coin: this.coinProto, nade: this.nadeProto }[kind] || this.bundleProto;
      mesh = proto.clone();
    }
    const lift = kind === 'crate' ? 0 : kind === 'coin' ? 0.3 : 0.45;
    mesh.position.set(x, y + lift, z);
    this.game.scene.add(mesh);
    const pk = { id, kind, mesh, x, y: y + lift, z, base: y, t: 0, value, life: PICKUP_LIFE[kind] || 25, fall: kind === 'crate' ? CRATE_DROP : 0 };
    this.pickups.push(pk);
    return pk;
  }

  // Drop a crate out of the sky near a spot.
  dropCrate(near) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 7;
      const x = Math.floor(near.x + Math.cos(a) * r) + 0.5;
      const z = Math.floor(near.z + Math.sin(a) * r) + 0.5;
      if (x < 2 || z < 2 || x > SX - 2 || z > SZ - 2) continue;
      const y = this.groundAt(x, z);
      if (y <= SEA) continue;
      return this.spawnPickup('crate', x, y, z);
    }
    return null;
  }

  removePickup(id) {
    const pk = this.pickups.find((p) => p.id === id);
    if (!pk) return false;
    pk.t = 1e9;
    this.game.scene.remove(pk.mesh);
    this.pickups = this.pickups.filter((p) => p !== pk);
    return true;
  }

  // Every mob along a ray, nearest first.
  raycastAll(o, d, maxT) {
    const hits = [];
    for (const m of this.list) {
      if (m.state === 'dying' || m.gone) continue;
      const h = m.hitTest(o, d, maxT);
      if (h) hits.push({ mob: m, t: h.t, head: h.head });
    }
    return hits.sort((a, b) => a.t - b.t);
  }

  raycast(o, d, maxT) {
    let best = null;
    for (const m of this.list) {
      if (m.state === 'dying' || m.gone) continue;
      const h = m.hitTest(o, d, maxT);
      if (h && (!best || h.t < best.t)) best = { mob: m, t: h.t, head: h.head };
    }
    return best;
  }

  // Host / single player: run every mob's brain.
  update(dt) {
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.35;
      this.refreshFlow();
    }
    for (const m of this.list) {
      if (m.remote) m.updatePuppet(dt);
      else m.update(dt);
    }
    this.separate(dt);
    this.list = this.list.filter((m) => !m.gone);
    this.updateBolts(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
  }

  // Joined players: mobs are copies of the host's.
  updateRemote(dt) {
    for (const m of this.list) m.updatePuppet(dt);
    this.list = this.list.filter((m) => !m.gone);
    this.updateBolts(dt);
    this.updatePickups(dt);
    this.updateEffects(dt);
  }

  snapshot() {
    return this.list
      .filter((m) => !m.gone)
      .map((m) => {
        const e = [
          m.id,
          m.netType !== undefined ? m.netType : TYPE_INDEX.get(m.type),
          r2(m.pos.x),
          r2(m.pos.y),
          r2(m.pos.z),
          r2(m.yaw),
          m.state === 'spawn' ? 0 : m.state === 'live' ? 1 : 2,
          m.flags(),
          r2(m.spawnT),
          r2(Math.max(0, m.hp / m.maxHp)),
        ];
        if (m.netExtra) e.push(...m.netExtra());
        return e;
      });
  }

  applySnapshot(entries) {
    const seen = new Set();
    for (const e of entries) {
      const id = e[0];
      seen.add(id);
      let m = this.list.find((x) => x.id === id);
      if (!m) {
        if (e[6] === 2) continue;
        m = this.makePuppet(e);
        if (!m) continue;
        m.yaw = e[5];
        this.list.push(m);
      }
      m.applyNet(e);
    }
    // Gone on the host: drop it here too, unless it is mid-death animation.
    for (const m of this.list) if (!seen.has(m.id) && m.state !== 'dying') m.remove(false);
    this.list = this.list.filter((m) => !m.gone);
  }

  makePuppet(e) {
    const type = TYPE_LIST[e[1]] || 'moss';
    this.game.profile.markSeen(type);
    const Kind = MOB_TYPES[type].boss ? Boss : Mob;
    return new Kind(this, type, e[2], e[3], e[4], { hp: 1, speed: 1 }, e[0], true);
  }

  // We just became the host: take over every mob from where it stands.
  promote(mul) {
    for (const m of this.list) {
      if (!m.remote) continue;
      m.remote = false;
      m.maxHp = m.def.hp * mul.hp * (m.hpBoost || 1);
      m.hp = Math.max(1, m.maxHp * m.net.hp);
      m.speed = m.def.speed * mul.speed;
      m.pos.set(m.net.x, m.net.y, m.net.z);
      m.vel.set(0, 0, 0);
      this.nextId = Math.max(this.nextId, m.id + 1);
    }
    this.refreshFlow(true);
  }

  separate(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.state !== 'live' || a.remote) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.state !== 'live' || b.remote) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const r = a.hw + b.hw + 0.15;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = ((r - d) / r) * 30 * dt;
        a.vel.x -= (dx / d) * push;
        a.vel.z -= (dz / d) * push;
        b.vel.x += (dx / d) * push;
        b.vel.z += (dz / d) * push;
      }
    }
  }

  // Every player simulates every bolt, and each one only checks whether it
  // hit themselves. That keeps dodging fair even with lag.
  updateBolts(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    for (const b of this.bolts) {
      const cfg = b.cfg;
      b.vel.y -= cfg.grav * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      b.mesh.position.copy(b.pos);
      if (cfg.cube) b.mesh.rotation.set(b.life * 7, b.life * 5, 0);
      else b.mesh.lookAt(vB.copy(b.pos).add(b.vel));
      if (cfg.trail && Math.random() < dt * 30) g.fx.burst(b.pos.x, b.pos.y, b.pos.z, cfg.trail, 1, { speed: 0.4, size: cfg.cube * 0.5, up: 0.5, life: 0.35, spread: 0.05, grav: -2 });
      const pad = cfg.cube ? cfg.cube * 0.5 : 0.12;
      const inPlayer =
        !p.dead &&
        g.state !== 'menu' &&
        g.inGame &&
        Math.abs(b.pos.x - p.pos.x) < p.hw + pad &&
        Math.abs(b.pos.z - p.pos.z) < p.hw + pad &&
        b.pos.y > p.pos.y - pad &&
        b.pos.y < p.pos.y + p.h + 0.1;
      let direct = false;
      const bc = g.story && g.story.beacon;
      if (bc && !bc.dead && g.authority && Math.abs(b.pos.x - bc.pos.x) < 0.6 && Math.abs(b.pos.z - bc.pos.z) < 0.6 && b.pos.y > bc.pos.y && b.pos.y < bc.pos.y + 2.4) {
        bc.hurt(cfg.dmg);
        b.life = 0;
      } else if (inPlayer) {
        p.hurt(cfg.dmg, vA.copy(b.pos).addScaledVector(b.vel, -0.1), b.src, cfg.fx || null);
        b.life = 0;
        direct = true;
      } else if (w.solid(Math.floor(b.pos.x), Math.floor(b.pos.y), Math.floor(b.pos.z))) {
        b.life = 0;
        b.pos.addScaledVector(b.vel, -dt * 0.5);
      }
      if (b.life <= 0) {
        if (cfg.boom) {
          g.combat.explode(b.pos, cfg.boom, 0, { small: cfg.boom < 2.2 });
          if (!direct && !p.dead && g.inGame) {
            const d = vA.set(p.pos.x, p.pos.y + 0.9, p.pos.z).distanceTo(b.pos);
            if (d < cfg.boom) p.hurt(Math.max(1, Math.round(cfg.dmg * (1 - d / cfg.boom))), b.pos, b.src, cfg.fx || null);
          }
          if (cfg.breaks && g.authority) g.combat.breakBlocks(b.pos, cfg.boom);
          if (cfg.onBoom) cfg.onBoom(g, b);
        } else {
          g.fx.burst(b.pos.x, b.pos.y, b.pos.z, cfg.colors, 6, { speed: 2, size: 0.06, up: 1, life: 0.35, spread: 0.05 });
        }
        g.scene.remove(b.mesh);
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);
  }

  updatePickups(dt) {
    const g = this.game;
    const p = g.player;
    for (const pk of this.pickups) {
      pk.t += dt;
      const m = pk.mesh;
      if (pk.kind === 'crate') {
        if (pk.fall > 0) {
          pk.fall = Math.max(0, pk.fall - dt * 3.2);
          m.rotation.z = Math.sin(pk.t * 1.7) * 0.12;
          m.rotation.x = Math.cos(pk.t * 1.3) * 0.08;
          if (pk.fall === 0) {
            m.rotation.set(0, m.rotation.y, 0);
            m.userData.chute.visible = false;
            const d = Math.hypot(p.pos.x - pk.x, p.pos.z - pk.z);
            g.sound.landThud(Math.max(0, 1 - d / 40));
            const below = g.world.get(Math.floor(pk.x), Math.floor(pk.y) - 1, Math.floor(pk.z));
            if (below) g.fx.burst(pk.x, pk.y + 0.1, pk.z, g.atlas.colors[BLOCKS[below].top], 14, { speed: 3, size: 0.12, up: 1.5, life: 0.7, spread: 0.5 });
          }
        }
        m.position.set(pk.x, pk.y + pk.fall, pk.z);
        m.userData.beam.material.opacity = 0.2 + Math.sin(pk.t * 3) * 0.08;
      } else {
        // Coins fly to you when you get close.
        if (pk.kind === 'coin' && !p.dead && g.inGame) {
          const dx = p.pos.x - pk.x;
          const dy = p.pos.y + 0.8 - pk.y;
          const dz = p.pos.z - pk.z;
          const d = Math.hypot(dx, dy, dz);
          if (d < 4.5 && d > 0.01) {
            const step = Math.min(d, (5 + (4.5 - d) * 4) * dt);
            pk.x += (dx / d) * step;
            pk.y += (dy / d) * step;
            pk.z += (dz / d) * step;
          }
        }
        m.rotation.y += dt * (pk.kind === 'coin' ? 5 : 2.2);
        m.position.set(pk.x, pk.y + Math.sin(pk.t * 3) * (pk.kind === 'coin' ? 0.06 : 0.1) + (pk.kind === 'shard' ? 0.4 : 0), pk.z);
        if (pk.kind === 'shard' && Math.random() < dt * 8) g.fx.burst(pk.x, pk.y + 0.5, pk.z, SHARD_SPARKS, 1, { speed: 1, size: 0.06, up: 1.5, life: 0.6, spread: 0.3, grav: -1 });
      }
      m.visible = pk.t < pk.life - 5 || Math.floor(pk.t * 8) % 2 === 0;
      const d = Math.hypot(p.pos.x - pk.x, p.pos.y + 0.9 - pk.y, p.pos.z - pk.z);
      const reach = pk.kind === 'crate' || pk.kind === 'shard' ? 1.9 : pk.kind === 'coin' ? 1.1 : 1.5;
      if (!p.dead && g.inGame && d < reach && pk.t < pk.life && pk.fall === 0 && this.collect(pk)) {
        pk.t = 1e9;
        if (g.mp) g.mp.pickupTaken(pk.id);
      }
      if (pk.t > pk.life) g.scene.remove(m);
    }
    this.pickups = this.pickups.filter((pk) => pk.t <= pk.life);
  }

  // Returns false if the pickup should stay on the ground.
  collect(pk) {
    const g = this.game;
    const p = g.player;
    if (pk.kind === 'heart') {
      if (p.hp >= p.maxHp) return false;
      p.heal(6);
      g.hud.popup('+3 hearts', 'heal');
      g.sound.pickup();
    } else if (pk.kind === 'blocks') {
      p.blocks = Math.min(99, p.blocks + 6);
      g.hud.popup('+6 blocks');
      g.sound.pickup();
    } else if (pk.kind === 'nade') {
      if (p.grenades >= MAX_NADES) return false;
      p.grenades++;
      g.hud.popup('+1 grenade');
      g.sound.pickup();
    } else if (pk.kind === 'coin') {
      g.gainCoins(pk.value || 1);
      g.fx.burst(pk.x, pk.y, pk.z, COIN_COLORS, 3, { speed: 1.5, size: 0.06, up: 1.5, life: 0.35, spread: 0.1 });
    } else if (pk.kind === 'crate') {
      g.openCrate();
    } else if (pk.kind === 'shard') {
      if (g.story) g.story.onShard();
    }
    return true;
  }
}
