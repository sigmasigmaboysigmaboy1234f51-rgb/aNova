import * as THREE from 'three';
import { Mob, MF } from './mob.js';
import { BODIES, buildBrute, poseBrute } from './brute.js';
import { MOB_TYPES, TYPE_LIST } from './mobtypes.js';
import { B, BLOCKS } from './world.js';
import { PX } from './model.js';
import { wrapAngle } from './util.js';
import { moveEntity } from './physics.js';

// Ten bosses, one every five waves. They are all built like bodybuilders
// and each has its own set of moves.

const C = (h) => new THREE.Color(h);
function skinTone(h) {
  const c = C(h);
  return { skin: c, skinDark: c.clone().lerp(C('#000000'), 0.42), skinLight: c.clone().lerp(C('#ffffff'), 0.3) };
}

// Lava cracks, lightning bolts and runes are drawn as glowing tattoos.
// Cracks run in jagged lines across the body.
const cracks = (i, j) => (i + Math.floor(j / 2)) % 9 === 0 || (i * 2 - j + 40) % 13 === 0 || (j === 3 && i % 5 < 3);
const zigzag = (i, j, w, h, zone) => {
  if (zone === 'chest') return Math.abs(((j * 2) % 8) - 4) + 3 === i || Math.abs(((j * 2) % 8) - 4) + w - 8 === i;
  if (zone === 'arm') return (i + j) % 6 === 0;
  if (zone === 'delt') return i === j;
  return false;
};
const runes = (i, j, w, h, zone) => zone !== 'abs' && (i * 5 + j * 3) % 17 === 0;

function crown(P, add, gold = 0xf2c230) {
  for (const [x, z] of [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
    [0, 4],
    [0, -4],
    [-4, 0],
    [4, 0],
  ]) {
    add(P.head, 1.6, 3, 1.6, x, 10.5, z, gold);
  }
  add(P.head, 10, 1.4, 10, 0, 9.4, 0, gold);
  add(P.head, 1.4, 1.4, 1, 0, 9.4, 5.2, 0xd8392b, true);
}

export const BOSSES = [
  {
    id: 'mossback',
    name: 'Mossback Brute',
    title: 'Lifts boulders for breakfast',
    family: 'moss',
    hp: 260,
    speed: 2.7,
    dmg: 6,
    kit: ['slam', 'punch', 'summon'],
    bolt: 'bolt',
    colors: ['#5f7a52', '#4f7d2f', '#3d6a6e'],
    look: {
      body: 'hunch',
      ...skinTone('#5f7a52'),
      pants: C('#4a3b2c'),
      boots: '#2a2018',
      belt: C('#3a2d20'),
      wrist: C('#3d6a6e'),
      eyes: '#ff4a2a',
      hair: C('#4f7d2f'),
      pauldron: true,
      decorate(P, add) {
        add(P.head, 4, 2, 4, -2, 9.5, -1, 0x5c8c36);
        add(P.head, 3, 1.5, 3, 2.5, 9.3, 1, 0x4f7d2f);
        add(P.torso, 6, 2, 3, 3, 19, -5, 0x4f7d2f);
      },
    },
  },
  {
    id: 'colossus',
    name: 'Bone Colossus',
    title: 'Skipped zero leg days',
    family: 'bone',
    hp: 250,
    speed: 2.6,
    dmg: 5,
    kit: ['volley', 'punch', 'summon'],
    bolt: 'bone',
    colors: ['#dcd6c4', '#c4bca6', '#3b3446'],
    look: {
      body: 'tall',
      ...skinTone('#dcd6c4'),
      pants: C('#2a2436'),
      boots: '#1d1826',
      belt: C('#3b3446'),
      wrist: C('#3b3446'),
      eyes: '#6fd6f0',
      ribs: true,
      decorate(P, add) {
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add(s < 0 ? P.shoulderR : P.shoulderL, 1.6, 4, 1.6, s * 1.5, 4.5, -2 + k * 2, 0xe8e2cc);
      },
    },
  },
  {
    id: 'kinggloop',
    name: 'King Gloop',
    title: 'Jiggly, royal, enormous',
    family: 'gloop',
    hp: 280,
    speed: 2.8,
    dmg: 6,
    scale: 1.08,
    kit: ['leap', 'punch', 'summon'],
    bolt: 'bolt',
    colors: ['#9b5fd1', '#caa6ee', '#6d3aa0'],
    look: {
      body: 'fat',
      ...skinTone('#9b5fd1'),
      pants: C('#6d3aa0'),
      boots: '#4c1f73',
      belt: C('#c9a23a'),
      wrist: C('#caa6ee'),
      eyes: '#ffffff',
      alpha: 0.9,
      decorate(P, add) {
        crown(P, add);
      },
    },
  },
  {
    id: 'magma',
    name: 'Magma Titan',
    title: 'Hot tub? He IS the hot tub',
    family: 'imp',
    hp: 300,
    speed: 2.5,
    dmg: 7,
    kit: ['throw', 'slam', 'punch'],
    bolt: 'lava',
    colors: ['#3a302a', '#ff7a2f', '#ffd84a'],
    look: {
      tusks: true,
      ...skinTone('#3a302a'),
      pants: C('#1a1410'),
      boots: '#120e0a',
      belt: C('#2a1c14'),
      wrist: C('#ff7a2f'),
      eyes: '#ffd84a',
      tattoo: (i, j) => cracks(i, j),
      tattooColor: '#ff7a2f',
      decorate(P, add) {
        add(P.head, 1.8, 4, 1.8, -3.5, 10.5, 0, 0xff7a2f, true);
        add(P.head, 1.8, 4, 1.8, 3.5, 10.5, 0, 0xff7a2f, true);
      },
    },
  },
  {
    id: 'glacier',
    name: 'Glacier Hulk',
    title: 'Chill. Very, very chill',
    family: 'moss',
    hp: 300,
    speed: 2.6,
    dmg: 6,
    kit: ['breath', 'volley', 'punch'],
    bolt: 'ice',
    colors: ['#7fb6e0', '#c9ecff', '#3a78b0'],
    look: {
      body: 'fat',
      beard: 0xf4f8ff,
      ...skinTone('#7fb6e0'),
      pants: C('#1d3f66'),
      boots: '#16304e',
      belt: C('#3a78b0'),
      wrist: C('#c9ecff'),
      eyes: '#e4fbff',
      hair: C('#ffffff'),
      decorate(P, add) {
        for (const sh of [P.shoulderR, P.shoulderL]) {
          add(sh, 2, 6, 2, 0, 7, 0, 0xc9ecff);
          add(sh, 1.6, 4, 1.6, 2, 5.5, 1, 0x9fe8ff);
          add(sh, 1.6, 4, 1.6, -2, 5.5, -1, 0x9fe8ff);
        }
      },
    },
  },
  {
    id: 'storm',
    name: 'Storm Champion',
    title: 'Undefeated. Also electric',
    family: 'bone',
    hp: 320,
    speed: 2.9,
    dmg: 6,
    kit: ['strikes', 'volley', 'punch'],
    bolt: 'storm',
    colors: ['#6b4ca8', '#fff6a0', '#44248a'],
    look: {
      ...skinTone('#6b4ca8'),
      pants: C('#1d0f3a'),
      boots: '#140a28',
      belt: C('#44248a'),
      wrist: C('#fff6a0'),
      eyes: '#fff6a0',
      champ: true,
      tattoo: zigzag,
      tattooColor: '#fff6a0',
      decorate(P, add) {
        add(P.head, 9.6, 1.4, 9.6, 0, 7, 0, 0xd8392b);
        add(P.head, 1.2, 3, 1.2, 1, 7, -5.5, 0xd8392b);
      },
    },
  },
  {
    id: 'shadow',
    name: 'Shadow Bruiser',
    title: 'Right behind you',
    family: 'ghost',
    hp: 300,
    speed: 3,
    dmg: 7,
    kit: ['teleport', 'punch', 'volley'],
    bolt: 'shade',
    colors: ['#2a2236', '#d27bff', '#121018'],
    look: {
      body: 'tall',
      ...skinTone('#2a2236'),
      pants: C('#121018'),
      boots: '#0a080e',
      belt: C('#3a3050'),
      wrist: C('#d27bff'),
      eyes: '#d27bff',
      alpha: 0.86,
      tattoo: runes,
      tattooColor: '#b46cff',
      decorate(P, add) {
        add(P.head, 10, 3, 10, 0, 9, -0.5, 0x121018);
        add(P.head, 10, 8, 2, 0, 5, -5, 0x121018);
      },
    },
  },
  {
    id: 'goliath',
    name: 'Stone Goliath',
    title: 'Throws houses. Literally',
    family: 'golem',
    hp: 380,
    speed: 2.2,
    dmg: 8,
    scale: 1.2,
    kit: ['throw', 'slam', 'punch'],
    bolt: 'rock',
    armor: 0.2,
    colors: ['#7a7a7a', '#5e5e5e', '#4f7d2f'],
    look: {
      body: 'stocky',
      eye: 'cyclops',
      ...skinTone('#808080'),
      pants: C('#4a4a4a'),
      boots: '#3a3a3a',
      belt: C('#5a4630'),
      wrist: C('#4f7d2f'),
      eyes: '#8ff0ff',
      hair: C('#4f7d2f'),
      pauldron: true,
      tattoo: (i, j, w, h, zone) => zone === 'chest' && (i * 7 + j * 3) % 9 === 0,
      tattooColor: '#6fd6f0',
      decorate(P, add) {
        add(P.shoulderL, 9.5, 3, 9.5, 0.5, 4, 0, 0x6c6c6c);
      },
    },
  },
  {
    id: 'tyrant',
    name: 'Toxic Tyrant',
    title: 'Smells like victory. And sewage',
    family: 'fuse',
    hp: 340,
    speed: 2.6,
    dmg: 7,
    kit: ['bombs', 'slam', 'punch'],
    bolt: 'toxic',
    colors: ['#7bc62a', '#c8f25a', '#3f6b12'],
    look: {
      body: 'fat',
      ...skinTone('#6fb028'),
      pants: C('#2a2436'),
      boots: '#1a1622',
      belt: C('#5a3f6e'),
      wrist: C('#5a3f6e'),
      eyes: '#c8f25a',
      mask: true,
      decorate(P, add) {
        for (const x of [-3.5, 3.5]) {
          add(P.torso, 5, 12, 5, x, 14, -8.5, 0x5a6470);
          add(P.torso, 3, 3, 3, x, 21.5, -8.5, 0x9be070, true);
        }
      },
    },
  },
  {
    id: 'overlord',
    name: 'Golden Overlord',
    title: 'Final boss. Pure gains',
    family: 'knight',
    hp: 420,
    speed: 3,
    dmg: 8,
    scale: 1.12,
    kit: ['charge', 'slam', 'volley', 'punch'],
    bolt: 'gold',
    armor: 0.15,
    colors: ['#f2c230', '#fff6c8', '#8a6a1f'],
    look: {
      beard: 0xc99a20,
      ...skinTone('#e8b830'),
      pants: C('#7a1f1f'),
      boots: '#3a0e0e',
      belt: C('#7a1f1f'),
      wrist: C('#d8392b'),
      eyes: '#ff3b3b',
      champ: true,
      decorate(P, add) {
        crown(P, add, 0xfff2a8);
        add(P.torso, 20, 22, 1, 0, 8, -6.5, 0x9a1f1f);
      },
    },
  },
];

// Register every boss as a mob type so the network and the bestiary know
// about them.
BOSSES.forEach((b, i) => {
  const scale = (b.scale || 1) * 1.3;
  const id = `boss:${b.id}`;
  const def = {
    id,
    bossIndex: i,
    name: b.name,
    title: b.title,
    family: b.family,
    variant: 'boss',
    body: 'brute',
    ai: 'boss',
    boss: true,
    hp: b.hp,
    speed: b.speed,
    dmg: b.dmg,
    score: 3000 + i * 600,
    coins: 160 + i * 30,
    scale,
    bodyDims: BODIES[b.look.body] || BODIES.buff,
    hw: 0.72 * scale * ((BODIES[b.look.body] || BODIES.buff).bodyW / 1.05),
    h: ((BODIES[b.look.body] || BODIES.buff).headHi - 0.07) * scale,
    death: 3.4,
    armor: b.armor || 0,
    alpha: 1,
    fx: null,
    colors: b.colors,
    colorObjs: b.colors.map((c) => new THREE.Color(c)),
    blurb: b.title,
  };
  b.type = id;
  MOB_TYPES[id] = def;
  TYPE_LIST.push(id);
});

// How each move plays out. fire: the moment (0..1) it happens.
// range: distances it is used from.
export const ACTS = {
  roar: { dur: 1.5 },
  flex: { dur: 1.2 },
  slam: { dur: 1.35, fire: 0.62, range: [0, 6], cd: 3 },
  punch: { dur: 0.95, fire: 0.5, range: [0, 3.6], cd: 1.2 },
  uppercut: { dur: 0.9, fire: 0.5, cd: 1 },
  volley: { dur: 1.2, fire: 0.62, range: [5, 30], cd: 3.5, sight: true },
  throw: { dur: 1.6, fire: 0.62, range: [6, 32], cd: 5, sight: true },
  bombs: { dur: 1.4, fire: 0.62, range: [4, 28], cd: 5.5 },
  breath: { dur: 2.4, range: [0, 8], cd: 6 },
  strikes: { dur: 1.6, fire: 0.3, range: [0, 45], cd: 6 },
  summon: { dur: 1.5, fire: 0.5, range: [0, 45], cd: 14 },
  leap: { dur: 1.8, fire: 0.22, range: [4, 16], cd: 5 },
  leapLand: { dur: 0.7 },
  charge: { dur: 2.2, range: [5, 24], cd: 6 },
  teleport: { dur: 0.8, fire: 0.5, range: [0, 32], cd: 7 },
};
const ACT_LIST = Object.keys(ACTS);

export class Boss extends Mob {
  constructor(mobs, type, x, y, z, mul, id, remote = false) {
    super(mobs, type, x, y, z, mul, id, remote);
    this.bdef = BOSSES[this.def.bossIndex];
    this.act = null;
    this.actT = 0;
    this.actCd = {};
    this.moveCd = 1.5;
    this.enraged = false;
    this.poseState = {};
    this.air = false;
    this.hitSet = new Set();
    this.netType = TYPE_LIST.indexOf(type);
    this.smashT = 0;
    this.roared = false;
  }

  buildModel() {
    const b = BOSSES[this.def.bossIndex];
    this.model = buildBrute({ seed: 41 + this.def.bossIndex * 17, ...b.look });
    this.model.root.scale.setScalar(this.def.scale);
    this.rig = null;
    this.game.scene.add(this.model.root);
    this.emissives = [];
    this.baseEmissive = null;
    // Something to throw, shown in its hands while winding up.
    const rockMat = new THREE.MeshLambertMaterial({ color: this.def.colorObjs[0].clone().lerp(new THREE.Color(0x777777), 0.4) });
    this.held = new THREE.Mesh(new THREE.BoxGeometry(14 * PX, 14 * PX, 14 * PX), rockMat);
    this.held.visible = false;
    this.model.root.add(this.held);
    this.model.materials.push(rockMat);
    const dispose = this.model.dispose;
    this.model.dispose = () => {
      dispose();
      this.held.geometry.dispose();
      rockMat.dispose();
    };
  }

  get flies() {
    return false;
  }

  netExtra() {
    return [this.act ? ACT_LIST.indexOf(this.act) : -1, Math.round(this.actT * 100) / 100, this.enraged ? 1 : 0];
  }

  applyNet(e) {
    super.applyNet(e);
    const a = ACT_LIST[e[10]];
    if (a !== this.act) this.act = a || null;
    this.actT = e[11] || 0;
    this.enraged = !!e[12];
  }

  flags() {
    return super.flags() & ~MF.attack;
  }

  vol() {
    return Math.min(1, super.vol() * 1.6);
  }

  // --- Brain ----------------------------------------------------------------

  update(dt) {
    const g = this.game;
    this.tickTimers(dt);
    if (this.cheatState(dt)) return;
    if (this.state === 'spawn') {
      if (!this.roared) {
        this.roared = true;
        g.sound.roar(1);
      }
      this.spawnT += dt / 2.4;
      this.spawnDust();
      this.spawnDust();
      if (this.spawnT >= 1) {
        this.spawnT = 1;
        this.state = 'live';
      }
      this.sync(dt);
      return;
    }
    if (this.state === 'dying') {
      this.updateDeath(dt);
      return;
    }
    if (this.burnT > 0) {
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        this.hp -= this.burnDps * 0.5;
        if (this.hp <= 0) {
          this.startDeath(true);
          g.onKill(this, false, this.burnBy);
          return;
        }
      }
    }
    this.targetT -= dt;
    if (this.targetT <= 0 || !this.target || this.target.dead) {
      this.target = this.mobs.pickTarget(this.pos);
      this.targetT = 1;
    }
    for (const k of Object.keys(this.actCd)) this.actCd[k] -= dt;
    this.moveCd -= dt;
    if (!this.enraged && this.hp < this.maxHp * 0.4) {
      this.enraged = true;
      this.speed *= 1.25;
      this.startAct('roar');
      g.sound.roar(1);
      if (g.mp) g.mp.sendBanner(this.def.name, 'is getting angry!', '');
      g.hud.showBanner(this.def.name, 'is getting angry!', 2);
    }
    const p = this.target;
    const c = this.ctx;
    c.p = p;
    c.wx = c.wz = 0;
    c.nextStand = -1;
    if (p) {
      c.dx = p.pos.x - this.pos.x;
      c.dz = p.pos.z - this.pos.z;
      c.dy = p.pos.y - this.pos.y;
      c.dist = Math.hypot(c.dx, c.dz) || 1e-3;
    }

    if (this.act) this.runAct(dt, c);
    else if (p) {
      if (c.dist > 2.6) this.follow(c);
      if (this.moveCd <= 0) this.chooseAct(c);
    }

    const acting = !!this.act && this.act !== 'charge' && this.act !== 'leap';
    if (this.act === 'charge' || this.air) {
      moveBoss(this, dt);
    } else {
      this.walk(dt, acting ? 0 : c.wx, acting ? 0 : c.wz, c.nextStand);
    }
    if (this.hitX || this.hitZ) this.smash(dt);
    // Landing from a leap sends out a shockwave.
    if (this.air && this.onGround && this.vel.y <= 0) {
      this.air = false;
      this.startAct('leapLand');
      this.shockwave(7);
    }

    if (p && this.act !== 'charge') {
      const targetYaw = Math.atan2(c.dx, c.dz);
      this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, dt * (this.act ? 2.5 : 5));
    }
    this.sync(dt);
  }

  chooseAct(c) {
    const kit = this.bdef.kit;
    const ok = kit.filter((a) => {
      const A = ACTS[a];
      if ((this.actCd[a] || 0) > 0) return false;
      if (c.dist < A.range[0] || c.dist > A.range[1]) return false;
      if (A.sight && !this.canSee(c.p)) return false;
      if (a === 'punch' || a === 'slam') return Math.abs(c.dy) < 3;
      return true;
    });
    if (!ok.length) return;
    // Melee first when close, otherwise any move that fits.
    const pick = c.dist < 3.6 && ok.includes('punch') && Math.random() < 0.6 ? 'punch' : ok[Math.floor(Math.random() * ok.length)];
    this.startAct(pick);
  }

  startAct(a) {
    this.act = a;
    this.actT = 0;
    this.fired = 0;
    this.hitSet.clear();
    const A = ACTS[a];
    const rage = this.enraged ? 0.65 : 1;
    if (A.cd) this.actCd[a] = A.cd * rage;
    this.moveCd = 0.5 + Math.random() * 0.6 * rage;
    if (a === 'breath' && this.game.mp) this.mobs.bossFx({ k: 'breath', id: this.id, dur: A.dur * 0.75, d: 2 });
    else if (a === 'breath') this.mobs.applyBossFx({ k: 'breath', id: this.id, dur: A.dur * 0.75, d: 2 });
  }

  runAct(dt, c) {
    const g = this.game;
    const A = ACTS[this.act];
    const before = this.actT;
    this.actT += dt / A.dur;
    const fired = A.fire !== undefined && before < A.fire && this.actT >= A.fire;
    const p = c.p;
    switch (this.act) {
      case 'slam':
        if (fired) this.shockwave(7.5);
        break;
      case 'punch':
      case 'uppercut':
        if (fired && p) {
          const reach = 3.2 * this.def.scale;
          const dy = p.pos.y - this.pos.y;
          if (c.dist < reach && dy > -1.5 && dy < 3) {
            p.hurt(this.def.dmg, this.pos, 'boss', { knock: this.act === 'uppercut' ? 3.2 : 2.4 });
            g.sound.landThud(this.vol());
          }
        }
        break;
      case 'volley':
        if (fired && p) this.volley(p);
        break;
      case 'throw':
      case 'bombs':
        if (fired && p) this.lob(p, this.act === 'bombs' ? 3 : 1);
        break;
      case 'strikes':
        if (fired) {
          for (const t of g.targets()) {
            for (let i = 0; i < (this.enraged ? 4 : 3); i++) {
              const a = Math.random() * Math.PI * 2;
              const r = i === 0 ? 0 : 1.5 + Math.random() * 3;
              const x = t.pos.x + Math.cos(a) * r + t.vel.x * 0.6;
              const z = t.pos.z + Math.sin(a) * r + t.vel.z * 0.6;
              const y = this.mobs.groundAt(x, z);
              if (y > 0) this.mobs.bossFx({ k: 'strike', p: [x, y, z], delay: 1.1 + i * 0.25, d: this.def.dmg });
            }
          }
        }
        break;
      case 'summon':
        if (fired) {
          const n = this.enraged ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.mobs.spawnAt(this.family, this.pos.x + Math.cos(a) * 2.5, this.pos.z + Math.sin(a) * 2.5, g.mul || { hp: 1, speed: 1 });
          }
          g.sound.roar(this.vol() * 0.7);
        }
        break;
      case 'leap':
        if (fired && p) {
          const t = 0.95;
          this.vel.set(c.dx / t, 13, c.dz / t);
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > 16) {
            this.vel.x *= 16 / sp;
            this.vel.z *= 16 / sp;
          }
          this.air = true;
          this.onGround = false;
          g.sound.hop(this.vol());
        }
        break;
      case 'charge':
        if (this.actT < 0.3) {
          this.vel.x *= 0.8;
          this.vel.z *= 0.8;
          if (p) this.chargeDir = Math.atan2(c.dx, c.dz);
          if (Math.random() < dt * 12) this.spawnDust();
        } else {
          this.yaw += wrapAngle(this.chargeDir - this.yaw) * Math.min(1, dt * 2);
          const sp = 14 * this.slowMul();
          this.vel.x = Math.sin(this.yaw) * sp;
          this.vel.z = Math.cos(this.yaw) * sp;
          if (Math.random() < dt * 20) this.spawnDust();
          for (const t of g.targets()) {
            if (this.hitSet.has(t)) continue;
            const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
            if (d < this.hw + 0.9 && Math.abs(t.pos.y - this.pos.y) < 2.5) {
              this.hitSet.add(t);
              t.hurt(this.def.dmg, this.pos, 'boss', { knock: 3.2 });
              g.sound.landThud(1);
            }
          }
        }
        break;
      case 'teleport':
        if (fired && p) {
          this.mobs.bossFx({ k: 'puff', p: [this.pos.x, this.pos.y + 1.5, this.pos.z] });
          const back = p.yaw !== undefined ? p.yaw : Math.atan2(-c.dx, -c.dz);
          // Land behind them, where they are not looking.
          const x = p.pos.x + Math.sin(back) * 2.4;
          const z = p.pos.z + Math.cos(back) * 2.4;
          const y = this.mobs.groundAt(x, z);
          if (y > 0) {
            this.pos.set(x, y, z);
            this.clearAround();
          }
          this.mobs.bossFx({ k: 'puff', p: [this.pos.x, this.pos.y + 1.5, this.pos.z] });
          this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        }
        break;
      default:
    }
    if (this.actT >= 1) {
      const was = this.act;
      this.act = null;
      this.actT = 0;
      if (was === 'charge') {
        this.vel.x *= 0.2;
        this.vel.z *= 0.2;
      }
      if (was === 'teleport') this.startAct('uppercut');
    }
  }

  shockwave(r) {
    this.mobs.bossFx({ k: 'ring', p: [this.pos.x, this.pos.y, this.pos.z], r, d: this.def.dmg });
  }

  volley(p) {
    const n = this.enraged ? 7 : 5;
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 2.4 * this.def.scale, this.pos.z);
    const base = Math.atan2(p.pos.x - o.x, p.pos.z - o.z);
    const dist = Math.hypot(p.pos.x - o.x, p.pos.z - o.z);
    const speed = 22;
    const t = dist / speed;
    const vy = (p.pos.y + 1 - o.y) / Math.max(0.2, t) + 0.5 * 5 * t;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.12;
      this.mobs.spawnBolt(o, new THREE.Vector3(Math.sin(a) * speed, vy, Math.cos(a) * speed), this.id, false, this.bdef.bolt);
    }
    this.game.sound.bolt(this.vol());
  }

  lob(p, n) {
    const kind = this.act === 'bombs' ? 'toxic' : this.bdef.bolt;
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 3.3 * this.def.scale, this.pos.z);
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? 2.5 : 0;
      const tx = p.pos.x + p.vel.x * 0.6 + (Math.random() - 0.5) * spread * 2 - o.x;
      const tz = p.pos.z + p.vel.z * 0.6 + (Math.random() - 0.5) * spread * 2 - o.z;
      const d = Math.hypot(tx, tz) || 1;
      const speed = Math.min(18, 8 + d * 0.5);
      const t = d / speed;
      const vy = (p.pos.y + 0.5 - o.y) / t + 0.5 * 14 * t;
      this.mobs.spawnBolt(o, new THREE.Vector3((tx / d) * speed, Math.min(vy, 18), (tz / d) * speed), this.id, false, kind);
    }
    this.game.sound.throw();
  }

  // Bosses are too big for most gaps, so they smash through.
  smash(dt) {
    this.smashT -= dt;
    if (this.smashT > 0) return;
    this.smashT = 0.25;
    const g = this.game;
    const w = g.world;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const reach = this.hw + 0.6;
    // Leave one-block steps alone; it climbs those.
    const y0 = Math.floor(this.pos.y + 0.01) + 1;
    const y1 = Math.floor(this.pos.y + this.h);
    let broke = false;
    for (let s = -1; s <= 1; s++) {
      const x = Math.floor(this.pos.x + fx * reach + fz * s * this.hw * 0.9);
      const z = Math.floor(this.pos.z + fz * reach - fx * s * this.hw * 0.9);
      for (let y = y0; y <= y1; y++) {
        const id = w.get(x, y, z);
        if (!id || id === B.BEDROCK) continue;
        w.set(x, y, z, B.AIR);
        broke = true;
        if (Math.random() < 0.5) g.fx.burst(x + 0.5, y + 0.5, z + 0.5, g.atlas.colors[BLOCKS[id].side], 6, { speed: 3, size: 0.12, up: 2, life: 0.7, spread: 0.4 });
      }
    }
    if (broke) g.sound.blockBreak('hard');
  }

  // Make room when it arrives somewhere.
  clearAround() {
    const w = this.game.world;
    const r = Math.ceil(this.hw);
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let y = Math.floor(this.pos.y); y <= Math.floor(this.pos.y + this.h); y++) {
          const x = Math.floor(this.pos.x) + dx;
          const z = Math.floor(this.pos.z) + dz;
          const id = w.get(x, y, z);
          if (id && id !== B.BEDROCK) w.set(x, y, z, B.AIR);
        }
      }
    }
  }

  // --- Getting hit ------------------------------------------------------------

  hitTest(o, d, maxT) {
    const s = this.def.scale;
    const D = this.def.bodyDims;
    const x = this.pos.x;
    const y = this.pos.y + this.yOffset();
    const z = this.pos.z;
    const bw = D.bodyW * s;
    const tb = rayBoxT(o, d, x - bw, y, z - bw * 0.6, x + bw, y + D.headLo * s, z + bw * 0.6);
    // A hunched boss carries its head out in front.
    const ahead = (D.headAhead || 0) * s;
    const hx = x + Math.sin(this.yaw) * ahead;
    const hz = z + Math.cos(this.yaw) * ahead;
    const th = rayBoxT(o, d, hx - 0.3 * s, y + D.headLo * s, hz - 0.3 * s, hx + 0.3 * s, y + D.headHi * s, hz + 0.3 * s);
    const okB = tb >= 0 && tb < maxT;
    const okH = th >= 0 && th < maxT;
    if (okH && (!okB || th <= tb)) return { t: th, head: true };
    if (okB) return { t: tb, head: false };
    return null;
  }

  startDeath(loud) {
    super.startDeath(loud);
    this.act = null;
    this.game.sound.roar(1);
  }

  updateDeath(dt) {
    const before = this.deathT;
    this.deathT += dt;
    const g = this.game;
    if (before < 2.2 && this.deathT >= 2.2) {
      g.combat.explode(new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z), 3.5, 0, {});
      g.fx.burst(this.pos.x, this.pos.y + 1.5, this.pos.z, this.def.colorObjs, 60, { speed: 7, size: 0.2, up: 4, life: 1.4, spread: 0.8 });
    }
    if (this.deathT > this.def.death) this.remove(false);
    else this.sync(dt);
  }

  // --- Drawing -----------------------------------------------------------------

  sync(dt) {
    if (!this.poseState) this.poseState = {};
    const m = this.model;
    const shake = this.state === 'spawn' ? (Math.random() - 0.5) * 0.08 : 0;
    m.root.position.set(this.pos.x + shake, this.pos.y + this.yOffset(), this.pos.z);
    m.root.rotation.y = this.yaw;
    const flash = this.hurtT > 0 ? Math.min(1, this.hurtT / 0.2) : 0;
    const fire = this.burning ? 0.25 : 0;
    const ice = this.slowed ? 0.3 : 0;
    const rage = this.enraged ? 0.12 + Math.sin(this.t * 9) * 0.06 : 0;
    m.material.color.setRGB(1 + flash * 0.9 + fire + rage, 1 - flash * 0.3 + fire * 0.2 - ice * 0.2, 1 - flash * 0.3 + ice * 0.3);
    const tgt = this.lookTarget();
    let lookYaw = 0;
    let lookPitch = 0;
    if (tgt) {
      const dx = tgt.pos.x - this.pos.x;
      const dz = tgt.pos.z - this.pos.z;
      lookYaw = wrapAngle(Math.atan2(dx, dz) - this.yaw);
      lookPitch = Math.atan2(tgt.pos.y + 1.4 - (this.pos.y + 2.8 * this.def.scale), Math.hypot(dx, dz) || 1);
    }
    poseBrute(
      m,
      this.poseState,
      {
        speed: Math.hypot(this.vel.x, this.vel.z) / this.def.scale,
        act: this.act,
        actT: this.actT,
        spawn: this.state === 'spawn' ? this.spawnT : 1,
        dead: this.state === 'dying',
        deadT: this.deathT,
        hurt: this.hurtT / 0.2,
        lookYaw,
        lookPitch,
        enraged: this.enraged,
      },
      dt,
    );
    // The boulder rides over its head during a throw wind-up.
    const holding = (this.act === 'throw' || this.act === 'bombs') && this.actT < ACTS[this.act].fire;
    this.held.visible = holding;
    if (holding) {
      this.held.position.set(0, (48 + this.actT * 10) * PX, 0);
      this.held.scale.setScalar(this.act === 'bombs' ? 0.45 : 1);
      this.held.rotation.set(this.t, this.t * 0.7, 0);
    }
  }

  yOffset() {
    if (this.state === 'spawn') return -(1 - Math.min(1, this.spawnT * 1.4)) * this.h;
    return 0;
  }
}

function rayBoxT(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = Infinity;
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-9) {
      if (oo[a] < lo[a] || oo[a] > hi[a]) return -1;
      continue;
    }
    let t1 = (lo[a] - oo[a]) / dd[a];
    let t2 = (hi[a] - oo[a]) / dd[a];
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// Charging and leaping bosses ignore their walking speed but still bump
// into the world.
function moveBoss(b, dt) {
  b.vel.y = Math.max(b.vel.y - 30 * dt, -40);
  moveEntity(b.game.world, b, dt);
}
