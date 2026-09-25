import * as THREE from 'three';
import { moveEntity } from './physics.js';
import { buildHumanoid, buildGloop, PX } from './model.js';
import { paintMoss, paintBone, paintGloop, makeSkinTexture } from './skin.js';
import { FlowField } from './flow.js';
import { SX, SZ, SEA, B, BLOCKS } from './world.js';
import { TILE_UV, T } from './textures.js';
import { Rig, poseMoss, poseBone, ease } from './anim.js';
import { wrapAngle, clamp } from './util.js';
import { MAX_NADES } from './player.js';

export const MOB_TYPES = {
  moss: {
    name: 'Mosshead',
    hp: 12,
    speed: 3.2,
    hw: 0.3,
    h: 1.8,
    dmg: 3,
    score: 100,
    digs: true,
    death: 1.2,
    colors: ['#6f8c55', '#3d6a6e', '#5a7446', '#4f7d2f'],
  },
  bone: {
    name: 'Bonehead',
    hp: 9,
    speed: 3.0,
    hw: 0.3,
    h: 1.85,
    dmg: 3,
    score: 150,
    digs: false,
    death: 1.6,
    colors: ['#dcd6c4', '#c4bca6', '#3b3446'],
  },
  gloop: {
    name: 'Gloop',
    hp: 8,
    speed: 5.4,
    hw: 0.45,
    h: 0.9,
    dmg: 3,
    score: 120,
    digs: true,
    death: 0.6,
    colors: ['#9b5fd1', '#caa6ee', '#6d3aa0'],
  },
};
const TYPE_LIST = ['moss', 'bone', 'gloop'];
for (const t of Object.values(MOB_TYPES)) t.colorObjs = t.colors.map((c) => new THREE.Color(c));

const DIRS8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ATTACK_TIME = 0.5;
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const BOLT_COLORS = [new THREE.Color('#bff3ff'), new THREE.Color('#6fd6f0')];
const FIRE_COLORS = ['#fff2b0', '#ffd36b', '#ff9a3c', '#ff6a20'].map((c) => new THREE.Color(c));
const FROST_COLORS = ['#ffffff', '#d8f6ff', '#9fe8ff'].map((c) => new THREE.Color(c));
const COIN_COLORS = ['#fff2a8', '#ffd84a', '#e0a526'].map((c) => new THREE.Color(c));
const PICKUP_LIFE = { heart: 25, blocks: 25, nade: 25, coin: 30, crate: 120 };
const CRATE_DROP = 18;
const r2 = (v) => Math.round(v * 100) / 100;

function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
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

class Mob {
  // remote = true for a copy that mirrors a mob simulated by the host.
  constructor(mobs, type, x, y, z, mul, id, remote = false) {
    this.mobs = mobs;
    this.game = mobs.game;
    this.id = id;
    this.remote = remote;
    this.type = type;
    this.def = MOB_TYPES[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.net = { x, y, z, yaw: 0, ground: true, flags: 0, spawn: 0, hp: 1 };
    this.hw = this.def.hw;
    this.h = this.def.h;
    this.maxHp = this.def.hp * mul.hp;
    this.hp = this.maxHp;
    this.speed = this.def.speed * mul.speed;
    this.state = 'spawn';
    this.spawnT = 0;
    this.deathT = 0;
    this.gone = false;
    this.yaw = Math.random() * Math.PI * 2;
    this.t = Math.random() * 10;
    this.attackCd = 1 + Math.random();
    this.attackT = -1;
    this.hurtT = 0;
    this.drawT = 0;
    this.fired = 0;
    this.wobble = 0;
    this.aiming = false;
    this.losT = 0;
    this.los = false;
    this.jumpCd = 0;
    this.hopCd = 0.5 + Math.random() * 0.5;
    this.stuck = 0;
    this.progressT = 0;
    this.lastX = x;
    this.lastZ = z;
    this.digT = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1;
    this.onGround = true;
    this.target = null;
    this.targetT = 0;
    this.hitDir = new THREE.Vector3(0, 0, 1);
    this.debris = null;
    this.burnT = 0;
    this.burnDps = 0;
    this.burnBy = 0;
    this.burnTick = 0.5;
    this.slowT = 0;
    this.slowAmt = 0;
    const tex = mobs.tex[type];
    this.model = type === 'gloop' ? buildGloop(tex) : buildHumanoid(tex, { limb: type === 'bone' ? 2 : 0 });
    this.rig = type === 'gloop' ? null : new Rig(this.model);
    if (type === 'bone') this.addBow();
    this.game.scene.add(this.model.root);
    this.emissives = this.model.materials.filter((m) => m.emissive);
    this.sync(0);
  }

  addBow() {
    const arm = this.model.parts.armR;
    const bow = new THREE.Mesh(this.mobs.bowGeo, this.mobs.bowMat);
    bow.position.set(0, -10.5 * PX, 0);
    arm.add(bow);
    this.shard = new THREE.Mesh(this.mobs.shardGeo, this.mobs.boltMat);
    this.shard.position.set(0, -12.5 * PX, 0);
    this.shard.visible = false;
    arm.add(this.shard);
  }

  vol() {
    const p = this.game.player.pos;
    return Math.max(0, 1 - Math.hypot(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z) / 40);
  }

  yOffset() {
    if (this.state === 'spawn') return -(1 - ease(this.spawnT)) * this.h;
    if (this.state === 'dying' && this.type === 'moss' && this.deathT > 0.65) return -((this.deathT - 0.65) / 0.55) * 0.7;
    return 0;
  }

  tickTimers(dt) {
    this.t += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.fired = Math.max(0, this.fired - dt * 3);
    this.wobble = Math.max(0, this.wobble - dt * 3);
    this.attackCd -= dt;
    this.jumpCd -= dt;
    if (this.attackT >= 0) {
      this.attackT += dt / ATTACK_TIME;
      if (this.attackT >= 1) this.attackT = -1;
    }
    this.burnT = Math.max(0, this.burnT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.state !== 'dying') this.statusFx(dt);
  }

  get burning() {
    return this.remote ? !!(this.net.flags & 32) : this.burnT > 0;
  }

  get slowed() {
    return this.remote ? !!(this.net.flags & 64) : this.slowT > 0;
  }

  // Flames and frost you can see on a mob that is burning or slowed.
  statusFx(dt) {
    const g = this.game;
    const r = () => (Math.random() - 0.5) * this.hw * 2;
    if (this.burning && Math.random() < dt * 22) {
      g.fx.burst(this.pos.x + r(), this.pos.y + Math.random() * this.h, this.pos.z + r(), FIRE_COLORS, 1, {
        speed: 0.5,
        size: 0.1,
        up: 2.4,
        life: 0.45,
        spread: 0.05,
        grav: -3,
      });
    }
    if (this.slowed && Math.random() < dt * 12) {
      g.fx.burst(this.pos.x + r(), this.pos.y + Math.random() * this.h, this.pos.z + r(), FROST_COLORS, 1, {
        speed: 0.3,
        size: 0.07,
        up: 0.2,
        life: 0.8,
        spread: 0.05,
        grav: 2,
      });
    }
  }

  slowMul() {
    return this.slowT > 0 ? 1 - this.slowAmt : 1;
  }

  // Fire and frost from gun cores. Only the computer running the mob keeps
  // track of them.
  applyFx(fx, byId) {
    if (!fx) return;
    if (fx.burn > 0) {
      this.burnDps = this.burnT > 0 ? Math.max(this.burnDps, fx.burn) : fx.burn;
      this.burnT = 3;
      this.burnBy = byId;
    }
    if (fx.slow > 0) {
      this.slowAmt = this.slowT > 0 ? Math.max(this.slowAmt, fx.slow) : fx.slow;
      this.slowT = 2.5;
    }
  }

  // Runs the mob's brain. Only the host (or single player) does this.
  update(dt) {
    const g = this.game;
    const w = g.world;
    this.tickTimers(dt);

    if (this.state === 'spawn') {
      this.spawnT += dt / 0.9;
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
        this.hurtT = Math.max(this.hurtT, 0.08);
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
      this.targetT = 0.5;
    }
    const p = this.target;
    let wx = 0;
    let wz = 0;
    let nextStand = -1;
    let dist = 99;
    let dx = 0;
    let dz = 0;
    let dy = 0;
    this.aiming = false;
    if (!p) {
      wx = Math.sin(this.t * 0.4 + this.side) * 0.4;
      wz = Math.cos(this.t * 0.3) * 0.4;
    } else {
      dx = p.pos.x - this.pos.x;
      dz = p.pos.z - this.pos.z;
      dist = Math.hypot(dx, dz) || 1e-3;
      dy = p.pos.y - this.pos.y;
      const toward = () => {
        wx = dx / dist;
        wz = dz / dist;
      };
      const follow = () => {
        const s = this.pathStep();
        if (s) {
          wx = s.x;
          wz = s.z;
          nextStand = s.stand;
        } else toward();
      };
      if (this.type === 'bone') {
        this.losT -= dt;
        if (this.losT <= 0) {
          this.losT = 0.2;
          this.los = dist < 26 && this.canSee(p);
        }
        this.aiming = this.los && dist < 22;
        if (!this.los || dist > 15) follow();
        else if (dist < 7) {
          wx = -dx / dist;
          wz = -dz / dist;
        } else {
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.side = -this.side;
            this.strafeT = 1.2 + Math.random() * 2;
          }
          wx = (-dz / dist) * this.side * 0.6;
          wz = (dx / dist) * this.side * 0.6;
        }
        if (this.aiming && this.attackCd <= 0) {
          if (this.drawT === 0) g.sound.charge(this.vol());
          this.drawT += dt;
          if (this.drawT > 0.6) {
            this.shoot(p);
            this.drawT = 0;
            this.attackCd = 2 + Math.random() * 0.9;
          }
        } else {
          this.drawT = Math.max(0, this.drawT - dt * 2);
        }
      } else if (dist < 2 && Math.abs(dy) < 1.8) {
        toward();
      } else {
        follow();
      }
    }

    if (this.type === 'gloop') this.hop(dt, wx, wz);
    else this.walk(dt, wx, wz, nextStand);

    this.progressT += dt;
    if (this.progressT > 0.8) {
      const moved = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ);
      this.stuck = (wx || wz) && moved < 0.3 && dist > 1.2 ? this.stuck + 1 : 0;
      this.lastX = this.pos.x;
      this.lastZ = this.pos.z;
      this.progressT = 0;
    }
    if (p && this.stuck >= 2 && this.def.digs) this.dig(dt, dx / dist, dz / dist);

    if (p) {
      // Mossheads wind up, then slam. Step back in time and it misses.
      if (this.type === 'moss') {
        if (this.attackT < 0 && dist < 1.4 && dy > -1.2 && dy < 1.6 && this.attackCd <= 0) {
          this.attackT = 0;
          this.attackCd = 1.1;
          this.dealt = false;
        }
        if (this.attackT >= 0.45 && !this.dealt) {
          this.dealt = true;
          if (dist < 1.9 && dy > -1.2 && dy < 1.8) p.hurt(this.def.dmg, this.pos, 'moss');
        }
        if (Math.random() < dt * 0.3) g.sound.groan(this.vol());
      }
      if (this.type === 'gloop' && this.attackCd <= 0) {
        const cy = this.pos.y + 0.45;
        const py = p.pos.y + 0.9;
        if (dist < this.hw + p.hw + 0.25 && Math.abs(cy - py) < 1.3) {
          p.hurt(this.def.dmg, this.pos, 'gloop');
          this.attackCd = 0.9;
        }
      }
    }

    const faceTarget = p && (this.type === 'bone' ? this.aiming : dist < 5);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const targetYaw = faceTarget ? Math.atan2(dx, dz) : hs > 0.3 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw;
    this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, dt * 8);
    this.sync(dt);
  }

  spawnDust() {
    const g = this.game;
    if (Math.random() > 0.5) return;
    const below = g.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y) - 1, Math.floor(this.pos.z));
    if (!below) return;
    g.fx.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, g.atlas.colors[BLOCKS[below].top], 1, {
      speed: 1.5,
      size: 0.09,
      up: 3,
      life: 0.5,
      spread: 0.35,
    });
  }

  // Mirrors the host's copy of this mob: glide toward where it says the mob
  // is and play the same animations.
  updatePuppet(dt) {
    this.tickTimers(dt);
    if (this.state === 'dying') {
      this.updateDeath(dt);
      return;
    }
    const n = this.net;
    const k = 1 - Math.exp(-12 * dt);
    const ox = this.pos.x;
    const oz = this.pos.z;
    if (Math.hypot(n.x - this.pos.x, n.y - this.pos.y, n.z - this.pos.z) > 5) this.pos.set(n.x, n.y, n.z);
    else {
      this.pos.x += (n.x - this.pos.x) * k;
      this.pos.y += (n.y - this.pos.y) * k;
      this.pos.z += (n.z - this.pos.z) * k;
    }
    if (dt > 0) this.vel.set((this.pos.x - ox) / dt, 0, (this.pos.z - oz) / dt);
    this.yaw += wrapAngle(n.yaw - this.yaw) * k;
    this.spawnT = this.state === 'spawn' ? n.spawn : 1;
    if (this.state === 'spawn') this.spawnDust();
    if (this.type === 'gloop' && this.onGround && !n.ground) this.game.sound.hop(this.vol());
    this.onGround = n.ground;
    this.aiming = !!(n.flags & 1);
    this.drawT = n.flags & 2 ? Math.min(0.6, this.drawT + dt) : Math.max(0, this.drawT - dt * 2);
    if (this.type === 'moss' && Math.random() < dt * 0.3) this.game.sound.groan(this.vol());
    this.sync(dt);
  }

  applyNet(e) {
    const n = this.net;
    n.x = e[2];
    n.y = e[3];
    n.z = e[4];
    n.yaw = e[5];
    const flags = e[7];
    if (flags & 4 && !(n.flags & 4)) this.attackT = 0;
    if (flags & 8 && !(n.flags & 8) && this.hurtT <= 0) this.hurtT = 0.2;
    n.flags = flags;
    n.ground = !!(flags & 16);
    n.spawn = e[8];
    n.hp = e[9];
    const st = e[6];
    if (st === 1 && this.state === 'spawn') this.state = 'live';
    if (st === 2 && this.state !== 'dying') this.startDeath(false);
  }

  pathStep() {
    const f = this.mobs.flow;
    const cx = Math.floor(this.pos.x);
    const cz = Math.floor(this.pos.z);
    const d0 = f.at(cx, cz);
    if (!isFinite(d0)) return null;
    let best = d0;
    let bx = 0;
    let bz = 0;
    for (const [ox, oz] of DIRS8) {
      const d = f.at(cx + ox, cz + oz);
      if (d < best - 1e-3) {
        best = d;
        bx = ox;
        bz = oz;
      }
    }
    if (bx === 0 && bz === 0) return null;
    const tx = cx + bx + 0.5 - this.pos.x;
    const tz = cz + bz + 0.5 - this.pos.z;
    const l = Math.hypot(tx, tz) || 1;
    return { x: tx / l, z: tz / l, stand: f.standAt(cx + bx, cz + bz) };
  }

  walk(dt, wx, wz, nextStand) {
    const slow = (this.stuck >= 2 ? 0.4 : 1) * (this.drawT > 0 ? 0.4 : 1) * (this.attackT >= 0 ? 0.3 : 1) * this.slowMul();
    const sp = this.speed * slow;
    const k = Math.min(1, (this.onGround ? 12 : 3) * dt);
    this.vel.x += (wx * sp - this.vel.x) * k;
    this.vel.z += (wz * sp - this.vel.z) * k;
    const inWater = this.pos.y < SEA - 0.4;
    this.vel.y = Math.max(this.vel.y - (inWater ? 12 : 30) * dt, inWater ? -2.5 : -40);
    if (inWater && (wx || wz)) this.vel.y = Math.min(this.vel.y + 26 * dt, 3);
    moveEntity(this.game.world, this, dt);
    const wantsUp = nextStand > Math.floor(this.pos.y + 0.01);
    if ((this.onGround || inWater) && this.jumpCd <= 0 && (wx || wz) && (this.hitX || this.hitZ || wantsUp)) {
      this.vel.y = 8.8;
      this.jumpCd = 0.4;
    }
  }

  // Gloops travel in big bouncy hops that clear two-block walls.
  hop(dt, wx, wz) {
    if (this.onGround) {
      const f = Math.max(0, 1 - dt * 10);
      this.vel.x *= f;
      this.vel.z *= f;
      this.hopCd -= dt;
      if (this.hopCd <= 0 && (wx || wz)) {
        this.vel.y = 11;
        this.vel.x = wx * this.speed * this.slowMul();
        this.vel.z = wz * this.speed * this.slowMul();
        this.hopCd = (0.55 + Math.random() * 0.45) / this.slowMul();
        this.game.sound.hop(this.vol());
      }
    }
    const inWater = this.pos.y < SEA - 0.4;
    this.vel.y = Math.max(this.vel.y - (inWater ? 12 : 28) * dt, inWater ? -2.5 : -40);
    if (inWater) this.vel.y = Math.min(this.vel.y + 24 * dt, 3);
    moveEntity(this.game.world, this, dt);
  }

  // When a wall is in the way for too long, chew through it.
  dig(dt, dx, dz) {
    this.digT -= dt;
    if (this.digT > 0) return;
    this.digT = 0.8;
    const g = this.game;
    const w = g.world;
    const fx = Math.floor(this.pos.x + dx * (this.hw + 0.55));
    const fz = Math.floor(this.pos.z + dz * (this.hw + 0.55));
    const fy = Math.floor(this.pos.y + 0.01);
    const ys = this.type === 'gloop' ? [fy, fy + 1] : [fy + 1, fy];
    for (const y of ys) {
      const id = w.get(fx, y, fz);
      if (!id || id === B.BEDROCK) continue;
      const res = w.hitBlock(fx, y, fz, 1);
      if (!res) continue;
      const c = g.atlas.colors[res.info.side];
      g.fx.burst(fx + 0.5, y + 0.5, fz + 0.5, c, res.broken ? 14 : 4, { speed: 2, size: 0.1, life: 0.6, spread: 0.4 });
      if (this.vol() > 0.2) {
        if (res.broken) g.sound.blockBreak(res.info.sound);
        else g.sound.blockHit(res.info.sound);
      }
      if (this.type === 'moss' && this.attackT < 0) this.attackT = 0.3;
      else this.wobble = 1;
      return;
    }
  }

  canSee(p) {
    const ox = this.pos.x;
    const oy = this.pos.y + 1.5;
    const oz = this.pos.z;
    const tx = p.pos.x - ox;
    const ty = p.pos.y + 1.5 - oy;
    const tz = p.pos.z - oz;
    const len = Math.hypot(tx, ty, tz) || 1;
    return !this.game.world.raycast(ox, oy, oz, tx / len, ty / len, tz / len, len);
  }

  shoot(p) {
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 1.45, this.pos.z);
    const speed = 20;
    const target = vA.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
    const t = o.distanceTo(target) / speed;
    target.addScaledVector(p.vel, t * 0.5);
    target.y += 0.5 * 5 * t * t;
    const dir = target.sub(o).normalize();
    dir.x += (Math.random() - 0.5) * 0.05;
    dir.y += (Math.random() - 0.5) * 0.03;
    dir.z += (Math.random() - 0.5) * 0.05;
    dir.normalize();
    this.fired = 1;
    this.mobs.spawnBolt(o, dir.multiplyScalar(speed), this.id);
    this.game.sound.bolt(this.vol());
  }

  hitTest(o, d, maxT) {
    const x = this.pos.x;
    const y = this.pos.y + this.yOffset();
    const z = this.pos.z;
    if (this.type === 'gloop') {
      const t = rayBox(o, d, x - 0.47, y, z - 0.47, x + 0.47, y + 0.92, z + 0.47);
      return t >= 0 && t < maxT ? { t, head: false } : null;
    }
    const tb = rayBox(o, d, x - 0.36, y, z - 0.36, x + 0.36, y + 1.36, z + 0.36);
    const th = rayBox(o, d, x - 0.3, y + 1.36, z - 0.3, x + 0.3, y + 1.92, z + 0.3);
    const okB = tb >= 0 && tb < maxT;
    const okH = th >= 0 && th < maxT;
    if (okH && (!okB || th <= tb)) return { t: th, head: true };
    if (okB) return { t: tb, head: false };
    return null;
  }

  // fx carries burn / slow from the shooter's gun core.
  damage(amount, dir, head, at, byId, fx) {
    if (this.state === 'dying' || this.gone) return;
    const g = this.game;
    this.hurtT = 0.2;
    this.wobble = 1;
    this.hitDir.set(dir.x, 0, dir.z).normalize();
    if (at) g.fx.burst(at.x, at.y, at.z, this.def.colorObjs, 6, { speed: 2.5, size: 0.08, up: 1.5, life: 0.5, spread: 0.1 });
    if (this.remote) {
      // The host decides what the hit does; we just show it landed.
      if (g.mp) g.mp.sendHitMob(this, amount, head, dir, fx);
      g.sound.mobHurt(this.type, 1);
      return;
    }
    this.applyFx(fx, byId);
    this.hp -= amount;
    this.vel.x += dir.x * 3.5;
    this.vel.z += dir.z * 3.5;
    if (this.onGround) this.vel.y = Math.max(this.vel.y, 3);
    if (this.hp <= 0) {
      this.startDeath(true);
      g.onKill(this, head, byId);
    } else {
      g.sound.mobHurt(this.type, 1);
    }
  }

  startDeath(loud) {
    this.state = 'dying';
    this.deathT = 0;
    this.hurtT = 0.2;
    this.aiming = false;
    this.attackT = -1;
    if (this.shard) this.shard.visible = false;
    this.game.sound.mobDie(this.type, loud ? 1 : this.vol());
    if (this.type === 'bone') this.breakApart();
  }

  // Boneheads rattle apart: every limb flies off and tumbles.
  breakApart() {
    const scene = this.game.scene;
    this.model.root.updateMatrixWorld(true);
    this.debris = [];
    for (const name of ['head', 'body', 'armR', 'armL', 'legR', 'legL']) {
      const obj = this.model.parts[name];
      scene.attach(obj);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 3 + this.hitDir.x * 2.5,
        2 + Math.random() * 3.5,
        (Math.random() - 0.5) * 3 + this.hitDir.z * 2.5,
      );
      const spin = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      this.debris.push({ obj, v, spin });
    }
  }

  updateDeath(dt) {
    this.deathT += dt;
    const w = this.game.world;
    if (this.debris) {
      for (const d of this.debris) {
        d.v.y -= 22 * dt;
        const o = d.obj.position;
        o.addScaledVector(d.v, dt);
        const fy = Math.floor(o.y - 0.08);
        if (w.solid(Math.floor(o.x), fy, Math.floor(o.z))) {
          o.y = fy + 1.08;
          if (d.v.y < 0) d.v.y *= -0.35;
          d.v.x *= 0.7;
          d.v.z *= 0.7;
          d.spin.multiplyScalar(0.7);
        }
        d.obj.rotation.x += d.spin.x * dt;
        d.obj.rotation.y += d.spin.y * dt;
        d.obj.rotation.z += d.spin.z * dt;
      }
    } else if (!this.remote) {
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
      moveEntity(w, this, dt);
    }
    if (this.deathT > this.def.death) this.remove(true);
    else this.sync(dt);
  }

  remove(withPuff) {
    if (this.gone) return;
    this.gone = true;
    const g = this.game;
    if (withPuff) {
      if (this.debris) {
        for (const d of this.debris) {
          const o = d.obj.position;
          g.fx.burst(o.x, o.y, o.z, this.def.colorObjs, 5, { speed: 2, size: 0.1, up: 1.5, life: 0.6, spread: 0.2 });
        }
      } else {
        g.fx.burst(this.pos.x, this.pos.y + this.h * 0.5, this.pos.z, this.def.colorObjs, 22, {
          speed: 3,
          size: 0.12,
          up: 2,
          life: 0.9,
          spread: 0.4,
        });
      }
    }
    if (this.debris) for (const d of this.debris) g.scene.remove(d.obj);
    g.scene.remove(this.model.root);
    this.model.dispose();
  }

  // Who to turn our head toward: our target, or the nearest player we know.
  lookTarget() {
    if (this.target && !this.target.dead) return this.target;
    return this.mobs.pickTarget(this.pos);
  }

  sync(dt) {
    const m = this.model;
    const jitter = this.state === 'spawn' ? (Math.random() - 0.5) * 0.05 : 0;
    m.root.position.set(this.pos.x + jitter, this.pos.y + this.yOffset(), this.pos.z);
    m.root.rotation.y = this.yaw;
    const flash = this.hurtT > 0 ? Math.min(1, this.hurtT / 0.2) : 0;
    const fire = this.burning ? 0.22 + Math.sin(this.t * 17) * 0.08 : 0;
    const ice = this.slowed ? 1 : 0;
    for (const mat of this.emissives) {
      mat.emissive.setRGB(0.55 * flash + fire, 0.05 * flash + fire * 0.35 + ice * 0.1, 0.03 * flash + ice * 0.25);
    }

    if (this.type === 'gloop') {
      let sx = 1;
      let sy = 1;
      if (this.state === 'dying') {
        const k = Math.min(1, this.deathT / 0.5);
        sy = 1 - ease(k) * 0.75;
        sx = 1 + ease(k) * 0.45;
      } else if (!this.onGround && this.state === 'live') {
        const vy = this.remote ? 4 : this.vel.y;
        sy = 1 + clamp(vy * 0.03, -0.2, 0.25);
        sx = 1 - (sy - 1) * 0.6;
      } else if (!this.remote && this.hopCd < 0.18) {
        const q = ((0.18 - Math.max(0, this.hopCd)) / 0.18) * 0.25;
        sy = 1 - q;
        sx = 1 + q * 0.6;
      }
      const wob = this.wobble * Math.sin(this.t * 38) * 0.16;
      m.body.scale.set(sx + wob, sy - wob, sx + wob);
      return;
    }

    if (this.debris) return;
    const tgt = this.lookTarget();
    let lookYaw = 0;
    let lookPitch = 0;
    if (tgt) {
      const dx = tgt.pos.x - this.pos.x;
      const dz = tgt.pos.z - this.pos.z;
      lookYaw = wrapAngle(Math.atan2(dx, dz) - this.yaw);
      lookPitch = Math.atan2(tgt.pos.y + 1.4 - (this.pos.y + 1.6), Math.hypot(dx, dz) || 1);
    }
    const s = {
      speed: Math.hypot(this.vel.x, this.vel.z),
      attack: this.attackT,
      hurt: this.hurtT / 0.2,
      spawn: this.state === 'spawn' ? this.spawnT : 1,
      dead: this.state === 'dying',
      deadT: this.deathT,
      lookYaw,
      lookPitch,
      aiming: this.aiming,
      draw: Math.min(1, this.drawT / 0.6),
      fired: this.fired,
    };
    if (this.type === 'moss') poseMoss(this.rig, s, dt);
    else poseBone(this.rig, s, dt);
    if (this.shard) this.shard.visible = this.drawT > 0.05;
  }
}

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
    this.tex = {};
    for (const [k, paint] of Object.entries({ moss: paintMoss, bone: paintBone, gloop: paintGloop })) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      paint(c);
      this.tex[k] = makeSkinTexture(c);
    }
    this.boltGeo = new THREE.BoxGeometry(0.08, 0.08, 0.5);
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
    this.list = [];
    this.bolts = [];
    this.pickups = [];
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
    if (!at) return false;
    this.list.push(new Mob(this, type, at.x, at.y, at.z, mul, this.nextId++));
    return true;
  }

  spawnBolt(o, v, mobId, fromNet = false) {
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    mesh.position.copy(o);
    this.game.scene.add(mesh);
    this.bolts.push({ pos: o.clone(), vel: v.clone(), life: 3, mesh });
    if (fromNet) {
      const m = this.list.find((x) => x.id === mobId);
      if (m) {
        m.fired = 1;
        this.game.sound.bolt(m.vol());
      }
    } else if (this.game.mp) {
      this.game.mp.sendBolt(o, v, mobId);
    }
  }

  // y is the ground height the pickup rests on.
  spawnPickup(kind, x, y, z, id, value = 0) {
    if (id === undefined || id === null) id = this.nextPickup++;
    let mesh;
    if (kind === 'crate') mesh = this.makeCrate();
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
  }

  // Joined players: mobs are copies of the host's.
  updateRemote(dt) {
    for (const m of this.list) m.updatePuppet(dt);
    this.list = this.list.filter((m) => !m.gone);
    this.updateBolts(dt);
    this.updatePickups(dt);
  }

  snapshot() {
    return this.list
      .filter((m) => !m.gone)
      .map((m) => [
        m.id,
        TYPE_LIST.indexOf(m.type),
        r2(m.pos.x),
        r2(m.pos.y),
        r2(m.pos.z),
        r2(m.yaw),
        m.state === 'spawn' ? 0 : m.state === 'live' ? 1 : 2,
        (m.aiming ? 1 : 0) | (m.drawT > 0.05 ? 2 : 0) | (m.attackT >= 0 ? 4 : 0) | (m.hurtT > 0 ? 8 : 0) | (m.onGround ? 16 : 0) | (m.burnT > 0 ? 32 : 0) | (m.slowT > 0 ? 64 : 0),
        r2(m.spawnT),
        r2(Math.max(0, m.hp / m.maxHp)),
      ]);
  }

  applySnapshot(entries) {
    const seen = new Set();
    for (const e of entries) {
      const id = e[0];
      seen.add(id);
      let m = this.list.find((x) => x.id === id);
      if (!m) {
        if (e[6] === 2) continue;
        m = new Mob(this, TYPE_LIST[e[1]] || 'moss', e[2], e[3], e[4], { hp: 1, speed: 1 }, id, true);
        m.yaw = e[5];
        this.list.push(m);
      }
      m.applyNet(e);
    }
    // Gone on the host: drop it here too, unless it is mid-death animation.
    for (const m of this.list) if (!seen.has(m.id) && m.state !== 'dying') m.remove(false);
    this.list = this.list.filter((m) => !m.gone);
  }

  // We just became the host: take over every mob from where it stands.
  promote(mul) {
    for (const m of this.list) {
      if (!m.remote) continue;
      m.remote = false;
      m.maxHp = m.def.hp * mul.hp;
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
      b.vel.y -= 5 * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      b.mesh.position.copy(b.pos);
      b.mesh.lookAt(vB.copy(b.pos).add(b.vel));
      const inPlayer =
        !p.dead &&
        g.state !== 'menu' &&
        Math.abs(b.pos.x - p.pos.x) < p.hw + 0.12 &&
        Math.abs(b.pos.z - p.pos.z) < p.hw + 0.12 &&
        b.pos.y > p.pos.y &&
        b.pos.y < p.pos.y + p.h + 0.1;
      if (inPlayer) {
        p.hurt(3, vA.copy(b.pos).addScaledVector(b.vel, -0.1), 'bone');
        b.life = 0;
      } else if (w.solid(Math.floor(b.pos.x), Math.floor(b.pos.y), Math.floor(b.pos.z))) {
        b.life = 0;
      }
      if (b.life <= 0) {
        g.fx.burst(b.pos.x, b.pos.y, b.pos.z, BOLT_COLORS, 6, { speed: 2, size: 0.06, up: 1, life: 0.35, spread: 0.05 });
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
        m.position.set(pk.x, pk.y + Math.sin(pk.t * 3) * (pk.kind === 'coin' ? 0.06 : 0.1), pk.z);
      }
      m.visible = pk.t < pk.life - 5 || Math.floor(pk.t * 8) % 2 === 0;
      const d = Math.hypot(p.pos.x - pk.x, p.pos.y + 0.9 - pk.y, p.pos.z - pk.z);
      const reach = pk.kind === 'crate' ? 1.9 : pk.kind === 'coin' ? 1.1 : 1.5;
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
    }
    return true;
  }
}
