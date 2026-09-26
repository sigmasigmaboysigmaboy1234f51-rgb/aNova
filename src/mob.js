import * as THREE from 'three';
import { moveEntity } from './physics.js';
import { PX } from './model.js';
import { SEA, B, BLOCKS } from './world.js';
import { Rig, poseMoss, poseBone, ease } from './anim.js';
import { wrapAngle, clamp } from './util.js';
import { MOB_TYPES } from './mobtypes.js';
import { mobTexture } from './mobskins.js';
import { buildMobModel } from './mobmodels.js';

// One mob. The host (or single player) runs its brain; everyone else
// draws a puppet copy that follows the host's snapshots.

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
const vA = new THREE.Vector3();
const FIRE_COLORS = ['#fff2b0', '#ffd36b', '#ff9a3c', '#ff6a20'].map((c) => new THREE.Color(c));
const FROST_COLORS = ['#ffffff', '#d8f6ff', '#9fe8ff'].map((c) => new THREE.Color(c));
const SMOKE_COLORS = ['#1a1620', '#2a2236', '#3a3050'].map((c) => new THREE.Color(c));
const TOXIC_COLORS = ['#c8f25a', '#7bc62a', '#9be070'].map((c) => new THREE.Color(c));
const SPARK_COLORS = ['#fff6a0', '#c8a4ff', '#ffffff'].map((c) => new THREE.Color(c));
const GOLD_COLORS = ['#fff6c8', '#ffd84a', '#f2c230'].map((c) => new THREE.Color(c));

// Snapshot flag bits.
export const MF = { aim: 1, draw: 2, attack: 4, hurt: 8, ground: 16, burn: 32, slow: 64, special: 128, charge: 256 };

export function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
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

export class Mob {
  // remote = true for a copy that mirrors a mob simulated by the host.
  constructor(mobs, type, x, y, z, mul, id, remote = false) {
    this.mobs = mobs;
    this.game = mobs.game;
    this.id = id;
    this.remote = remote;
    this.type = type;
    this.def = MOB_TYPES[type] || MOB_TYPES.moss;
    this.family = this.def.family;
    this.ai = this.def.ai;
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
    this.atkTime = this.ai === 'golem' ? 0.8 : 0.5;
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
    this.fuseT = 0;
    this.chargeT = 0;
    this.chargeCd = 2;
    this.biteCd = 0;
    this.orbit = Math.random() * Math.PI * 2;
    this.diving = 0;
    this.ctx = { p: null, dist: 99, dx: 0, dz: 0, dy: 0, wx: 0, wz: 0, nextStand: -1 };
    this.buildModel();
    this.sync(0);
  }

  buildModel() {
    const def = this.def;
    this.model = buildMobModel(def, mobTexture(this.type));
    this.rig = def.body === 'humanoid' ? new Rig(this.model) : null;
    if (this.family === 'bone') this.addBow();
    this.game.scene.add(this.model.root);
    this.emissives = this.model.materials.filter((m) => m.emissive);
    this.baseEmissive = this.model.baseEmissive || null;
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

  get flies() {
    return this.ai === 'flyer' || this.ai === 'ghost';
  }

  yOffset() {
    if (this.state === 'spawn') return this.ai === 'ghost' ? 0 : -(1 - ease(this.spawnT)) * this.h;
    if (this.state === 'dying' && this.def.body === 'humanoid' && this.family !== 'bone' && this.deathT > 0.65) {
      return -((this.deathT - 0.65) / 0.55) * 0.7 * this.def.scale;
    }
    return 0;
  }

  tickTimers(dt) {
    this.t += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.fired = Math.max(0, this.fired - dt * 3);
    this.wobble = Math.max(0, this.wobble - dt * 3);
    this.attackCd -= dt;
    this.jumpCd -= dt;
    this.biteCd -= dt;
    this.chargeCd -= dt;
    this.chargeT = Math.max(0, this.chargeT - dt);
    if (this.attackT >= 0) {
      this.attackT += dt / this.atkTime;
      if (this.attackT >= 1) this.attackT = -1;
    }
    this.burnT = Math.max(0, this.burnT - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.state !== 'dying') this.statusFx(dt);
  }

  get burning() {
    return this.remote ? !!(this.net.flags & MF.burn) : this.burnT > 0;
  }

  get slowed() {
    return this.remote ? !!(this.net.flags & MF.slow) : this.slowT > 0;
  }

  // Flames, frost, sparks and sparkles you can see on a mob.
  statusFx(dt) {
    const g = this.game;
    const r = () => (Math.random() - 0.5) * this.hw * 2;
    const emit = (colors, rate, o) => {
      if (Math.random() < dt * rate) g.fx.burst(this.pos.x + r(), this.pos.y + Math.random() * this.h, this.pos.z + r(), colors, 1, o);
    };
    const v = this.def.variant;
    if (this.burning || v === 'blaze') emit(FIRE_COLORS, this.burning ? 22 : 9, { speed: 0.5, size: 0.1, up: 2.4, life: 0.45, spread: 0.05, grav: -3 });
    if (this.slowed || v === 'frost') emit(FROST_COLORS, this.slowed ? 12 : 5, { speed: 0.3, size: 0.07, up: 0.2, life: 0.8, spread: 0.05, grav: 2 });
    if (v === 'toxic') emit(TOXIC_COLORS, 5, { speed: 0.2, size: 0.07, up: 0, life: 0.7, spread: 0.05, grav: 6 });
    else if (v === 'shock') emit(SPARK_COLORS, 7, { speed: 2.5, size: 0.05, up: 1, life: 0.2, spread: 0.05, grav: 0 });
    else if (v === 'shadow') emit(SMOKE_COLORS, 6, { speed: 0.3, size: 0.12, up: 0.6, life: 0.8, spread: 0.1, grav: -1 });
    else if (v === 'golden') emit(GOLD_COLORS, 5, { speed: 0.4, size: 0.05, up: 1, life: 0.6, spread: 0.1, grav: 0 });
  }

  slowMul() {
    return this.slowT > 0 ? 1 - this.slowAmt : 1;
  }

  // Fire and frost from gun cores. Only the computer running the mob keeps
  // track of them.
  applyFx(fx, byId) {
    if (!fx) return;
    if (fx.burn > 0 && this.def.immune !== 'burn') {
      this.burnDps = this.burnT > 0 ? Math.max(this.burnDps, fx.burn) : fx.burn;
      this.burnT = 3;
      this.burnBy = byId;
    }
    if (fx.slow > 0) {
      this.slowAmt = this.slowT > 0 ? Math.max(this.slowAmt, fx.slow) : fx.slow;
      this.slowT = 2.5;
    }
  }

  // Hurt a player, adding this mob's variant effect (frost, fire, ...).
  strike(p, dmg, extra) {
    const fx = this.def.fx || extra ? { ...(this.def.fx || {}), ...(extra || {}) } : null;
    const g = this.game;
    const harder = g.variant === 'hardcore' && !g.mp ? 1.6 : 1;
    p.hurt(Math.round(dmg * harder), this.pos, this.family, fx);
  }

  // --- The brain -----------------------------------------------------------

  update(dt) {
    const g = this.game;
    this.tickTimers(dt);
    if (this.cheatState(dt)) return;

    if (this.state === 'spawn') {
      this.spawnT += dt / 0.9;
      if (!this.flies) this.spawnDust();
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
    const c = this.ctx;
    const p = this.target;
    c.p = p;
    c.wx = 0;
    c.wz = 0;
    c.nextStand = -1;
    c.dist = 99;
    c.dx = c.dz = c.dy = 0;
    this.aiming = false;
    if (!p) {
      c.wx = Math.sin(this.t * 0.4 + this.side) * 0.4;
      c.wz = Math.cos(this.t * 0.3) * 0.4;
    } else {
      c.dx = p.pos.x - this.pos.x;
      c.dz = p.pos.z - this.pos.z;
      c.dist = Math.hypot(c.dx, c.dz) || 1e-3;
      c.dy = p.pos.y - this.pos.y;
      this.think(c, dt);
      if (this.gone) return;
    }

    if (this.ai === 'flyer') this.fly(dt, c);
    else if (this.ai === 'ghost') this.drift(dt, c);
    else if (this.def.body === 'gloop') this.hop(dt, c.wx, c.wz);
    else this.walk(dt, c.wx, c.wz, c.nextStand);

    if (!this.flies) {
      this.progressT += dt;
      if (this.progressT > 0.8) {
        const moved = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ);
        this.stuck = (c.wx || c.wz) && moved < 0.3 && c.dist > 1.2 ? this.stuck + 1 : 0;
        this.lastX = this.pos.x;
        this.lastZ = this.pos.z;
        this.progressT = 0;
      }
      if (p && this.stuck >= (this.ai === 'golem' ? 1 : 2) && this.def.digs) this.dig(dt, c.dx / c.dist, c.dz / c.dist);
    }

    const faceTarget = p && (this.ai === 'archer' || this.ai === 'thrower' ? this.aiming : c.dist < 5 || this.flies);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const targetYaw = faceTarget ? Math.atan2(c.dx, c.dz) : hs > 0.3 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw;
    this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, dt * 8);
    this.sync(dt);
  }

  toward(c) {
    c.wx = c.dx / c.dist;
    c.wz = c.dz / c.dist;
  }

  follow(c) {
    const s = this.pathStep();
    if (s) {
      c.wx = s.x;
      c.wz = s.z;
      c.nextStand = s.stand;
    } else this.toward(c);
  }

  // Decide where to go and whether to attack.
  think(c, dt) {
    const g = this.game;
    const p = c.p;
    const sc = this.def.scale;
    switch (this.ai) {
      case 'archer':
      case 'thrower': {
        this.losT -= dt;
        if (this.losT <= 0) {
          this.losT = 0.2;
          this.los = c.dist < 26 && this.canSee(p);
        }
        const thrower = this.ai === 'thrower';
        this.aiming = this.los && c.dist < (thrower ? 18 : 22);
        if (!this.los || c.dist > 15) this.follow(c);
        else if (c.dist < (thrower ? 6 : 7)) {
          c.wx = -c.dx / c.dist;
          c.wz = -c.dz / c.dist;
        } else {
          this.strafeT -= dt;
          if (this.strafeT <= 0) {
            this.side = -this.side;
            this.strafeT = 1.2 + Math.random() * 2;
          }
          c.wx = (-c.dz / c.dist) * this.side * 0.6;
          c.wz = (c.dx / c.dist) * this.side * 0.6;
        }
        if (this.aiming && this.attackCd <= 0) {
          if (this.drawT === 0) g.sound.charge(this.vol());
          this.drawT += dt;
          if (this.drawT > (thrower ? 0.7 : 0.6)) {
            if (thrower) this.throwFire(p);
            else this.shoot(p);
            this.drawT = 0;
            this.attackCd = (thrower ? 2.4 : 2) + Math.random() * 0.9;
          }
        } else {
          this.drawT = Math.max(0, this.drawT - dt * 2);
        }
        return;
      }
      case 'hopper':
        if (c.dist < 2 && Math.abs(c.dy) < 1.8) this.toward(c);
        else this.follow(c);
        if (this.attackCd <= 0) {
          const cy = this.pos.y + this.h * 0.5;
          const py = p.pos.y + 0.9;
          if (c.dist < this.hw + p.hw + 0.25 && Math.abs(cy - py) < 1.3) {
            this.strike(p, this.def.dmg);
            this.attackCd = 0.9;
          }
        }
        return;
      case 'crawler': {
        if (c.dist < 1.6 && Math.abs(c.dy) < 1.5) this.toward(c);
        else this.follow(c);
        // Pounce from a few blocks away.
        if (this.onGround && this.attackCd <= 0 && c.dist > 2.2 && c.dist < 5.5 && c.dy > -1 && c.dy < 2.5) {
          this.vel.x = (c.dx / c.dist) * 8.5;
          this.vel.z = (c.dz / c.dist) * 8.5;
          this.vel.y = 6.5;
          this.onGround = false;
          this.attackCd = 2.2 + Math.random();
          this.attackT = 0;
          g.sound.hop(this.vol());
        }
        if (this.biteCd <= 0 && c.dist < this.hw + p.hw + 0.35 && c.dy > -1 && c.dy < 1.2) {
          this.strike(p, this.def.dmg);
          this.biteCd = 0.8;
        }
        return;
      }
      case 'bomber': {
        const near = c.dist < 2.4 && Math.abs(c.dy) < 2;
        if (this.fuseT > 0) {
          if (c.dist > 5.5) this.fuseT = 0;
          else {
            this.fuseT += dt / 1.3;
            if (Math.random() < dt * 8) g.sound.fuse(this.vol());
            if (this.fuseT >= 1) {
              this.detonate();
              return;
            }
          }
        } else if (near && this.onGround) {
          this.fuseT = 0.001;
          g.sound.fuse(this.vol());
        }
        if (this.fuseT <= 0) {
          if (c.dist < 2 && Math.abs(c.dy) < 1.8) this.toward(c);
          else this.follow(c);
        }
        return;
      }
      case 'flyer': {
        // Circle above, then dive in for a bite.
        this.orbit += dt * 1.1 * this.side;
        if (this.diving <= 0 && this.attackCd <= 0 && c.dist < 9) {
          this.diving = 1.6;
          g.sound.squeak(this.vol());
        }
        if (this.diving > 0) {
          this.diving -= dt;
          c.tx = p.pos.x;
          c.ty = p.pos.y + 1.1;
          c.tz = p.pos.z;
          const d3 = Math.hypot(c.dx, p.pos.y + 1.1 - (this.pos.y + 0.3), c.dz);
          if (d3 < 0.9) {
            this.strike(p, this.def.dmg);
            this.diving = 0;
            this.attackCd = 2 + Math.random() * 1.5;
            this.vel.y = 5;
          }
          if (this.diving <= 0) this.attackCd = Math.max(this.attackCd, 1.5);
        } else {
          c.tx = p.pos.x + Math.cos(this.orbit) * 3.5;
          c.ty = p.pos.y + 3 + Math.sin(this.t * 1.7) * 0.6;
          c.tz = p.pos.z + Math.sin(this.orbit) * 3.5;
        }
        return;
      }
      case 'ghost':
        c.tx = p.pos.x;
        c.ty = p.pos.y + 0.15 + Math.sin(this.t * 2) * 0.15;
        c.tz = p.pos.z;
        if (this.attackCd <= 0 && c.dist < 0.9 * sc + 0.4 && c.dy > -1.6 && c.dy < 1.6) {
          this.strike(p, this.def.dmg);
          this.attackCd = 1.2;
          this.attackT = 0;
        }
        return;
      default: {
        // melee, golem, knight: walk up and swing.
        if (this.ai === 'knight' && this.chargeT <= 0 && this.chargeCd <= 0 && c.dist > 3.5 && c.dist < 9 && Math.abs(c.dy) < 1.5 && this.onGround) {
          this.chargeT = 1.1;
          this.chargeCd = 5 + Math.random() * 2;
          g.sound.charge(this.vol());
        }
        if (c.dist < 2 * sc && Math.abs(c.dy) < 1.8) this.toward(c);
        else this.follow(c);
        const reach = 1.25 + this.hw;
        if (this.attackT < 0 && c.dist < reach && c.dy > -1.2 && c.dy < 1.6 * sc && this.attackCd <= 0) {
          this.attackT = 0;
          this.attackCd = this.ai === 'golem' ? 1.8 : 1.1;
          this.dealt = false;
          this.chargeT = 0;
        }
        if (this.attackT >= 0.45 && !this.dealt) {
          this.dealt = true;
          if (c.dist < reach + 0.5 && c.dy > -1.2 && c.dy < 1.8 * sc) {
            this.strike(p, this.def.dmg, this.ai === 'golem' ? { knock: 2.2 } : null);
            if (this.ai === 'golem') g.sound.landThud(this.vol());
          }
        }
        if (this.family === 'moss' && Math.random() < dt * 0.3) g.sound.groan(this.vol());
      }
    }
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
      spread: 0.35 * this.def.scale,
    });
  }

  // The Fuse goes off. It hurts players and blows a hole in the ground.
  detonate() {
    const at = this.pos.clone();
    at.y += this.h * 0.5;
    this.mobs.blast(at, 3.2, this.def.dmg, { breaks: true, source: 'fuse', fx: this.def.fx });
    this.hp = 0;
    this.state = 'dying';
    this.deathT = 99;
    this.remove(false);
  }

  // --- Puppets -------------------------------------------------------------

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
    const oy = this.pos.y;
    const oz = this.pos.z;
    if (Math.hypot(n.x - this.pos.x, n.y - this.pos.y, n.z - this.pos.z) > 5) this.pos.set(n.x, n.y, n.z);
    else {
      this.pos.x += (n.x - this.pos.x) * k;
      this.pos.y += (n.y - this.pos.y) * k;
      this.pos.z += (n.z - this.pos.z) * k;
    }
    if (dt > 0) this.vel.set((this.pos.x - ox) / dt, (this.pos.y - oy) / dt, (this.pos.z - oz) / dt);
    this.yaw += wrapAngle(n.yaw - this.yaw) * k;
    this.spawnT = this.state === 'spawn' ? n.spawn : 1;
    if (this.state === 'spawn' && !this.flies) this.spawnDust();
    if (this.def.body === 'gloop' && this.onGround && !n.ground) this.game.sound.hop(this.vol());
    this.onGround = n.ground;
    this.aiming = !!(n.flags & MF.aim);
    this.drawT = n.flags & MF.draw ? Math.min(0.6, this.drawT + dt) : Math.max(0, this.drawT - dt * 2);
    if (this.ai === 'bomber') this.fuseT = n.flags & MF.special ? Math.min(0.99, this.fuseT + dt / 1.3) : 0;
    if (this.ai === 'flyer') this.diving = n.flags & MF.special ? 1 : 0;
    this.chargeT = n.flags & MF.charge ? 0.5 : 0;
    if (this.family === 'moss' && Math.random() < dt * 0.3) this.game.sound.groan(this.vol());
    this.sync(dt);
  }

  applyNet(e) {
    const n = this.net;
    n.x = e[2];
    n.y = e[3];
    n.z = e[4];
    n.yaw = e[5];
    const flags = e[7];
    if (flags & MF.attack && !(n.flags & MF.attack)) this.attackT = 0;
    if (flags & MF.hurt && !(n.flags & MF.hurt) && this.hurtT <= 0) this.hurtT = 0.2;
    n.flags = flags;
    n.ground = !!(flags & MF.ground);
    n.spawn = e[8];
    n.hp = e[9];
    const st = e[6];
    if (st === 1 && this.state === 'spawn') this.state = 'live';
    if (st === 2 && this.state !== 'dying') this.startDeath(false);
  }

  flags() {
    return (
      (this.aiming ? MF.aim : 0) |
      (this.drawT > 0.05 ? MF.draw : 0) |
      (this.attackT >= 0 ? MF.attack : 0) |
      (this.hurtT > 0 ? MF.hurt : 0) |
      (this.onGround ? MF.ground : 0) |
      (this.burnT > 0 ? MF.burn : 0) |
      (this.slowT > 0 ? MF.slow : 0) |
      (this.fuseT > 0 || this.diving > 0 ? MF.special : 0) |
      (this.chargeT > 0 ? MF.charge : 0)
    );
  }

  // --- Moving ----------------------------------------------------------------

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
    const slow =
      (this.stuck >= 2 ? 0.4 : 1) *
      (this.drawT > 0 ? 0.4 : 1) *
      (this.attackT >= 0 && this.ai !== 'crawler' ? 0.3 : 1) *
      (this.fuseT > 0 ? 0 : 1) *
      (this.chargeT > 0 ? 2.1 : 1) *
      this.slowMul();
    const sp = this.speed * slow;
    const k = Math.min(1, (this.onGround ? 12 : this.ai === 'crawler' ? 1 : 3) * dt);
    this.vel.x += (wx * sp - this.vel.x) * k;
    this.vel.z += (wz * sp - this.vel.z) * k;
    const inWater = this.pos.y < SEA - 0.4;
    this.vel.y = Math.max(this.vel.y - (inWater ? 12 : 30) * dt, inWater ? -2.5 : -40);
    if (inWater && (wx || wz)) this.vel.y = Math.min(this.vel.y + 26 * dt, 3);
    moveEntity(this.game.world, this, dt);
    const wantsUp = nextStand > Math.floor(this.pos.y + 0.01);
    if ((this.onGround || inWater) && this.jumpCd <= 0 && (wx || wz) && (this.hitX || this.hitZ || wantsUp)) {
      // Skitters scramble up walls two blocks high.
      this.vel.y = this.ai === 'crawler' && (this.hitX || this.hitZ) ? 11.2 : 8.8;
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

  // Flappers steer through the air and climb over anything in the way.
  fly(dt, c) {
    const p = c.p;
    let tx = this.pos.x;
    let ty = this.pos.y;
    let tz = this.pos.z;
    if (p) {
      tx = c.tx;
      ty = c.ty;
      tz = c.tz;
    } else {
      ty = Math.max(this.pos.y, SEA + 6);
    }
    const dx = tx - this.pos.x;
    const dy = ty - this.pos.y;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const sp = this.speed * (this.diving > 0 ? 1.7 : 1) * this.slowMul();
    const k = Math.min(1, dt * (this.diving > 0 ? 5 : 2.5));
    this.vel.x += ((dx / d) * sp - this.vel.x) * k;
    this.vel.y += ((dy / d) * sp - this.vel.y) * k;
    this.vel.z += ((dz / d) * sp - this.vel.z) * k;
    moveEntity(this.game.world, this, dt);
    if (this.hitX || this.hitZ) this.vel.y = Math.max(this.vel.y, 4);
  }

  // Specters float straight through blocks.
  drift(dt, c) {
    const p = c.p;
    if (!p) return;
    const dx = c.tx - this.pos.x;
    const dy = c.ty - this.pos.y;
    const dz = c.tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const sp = this.speed * this.slowMul() * (d < 0.6 ? 0.2 : 1);
    this.vel.set((dx / d) * sp, (dy / d) * sp, (dz / d) * sp);
    this.pos.addScaledVector(this.vel, dt);
    this.onGround = false;
  }

  // When a wall is in the way for too long, chew through it. Golems smash.
  dig(dt, dx, dz) {
    this.digT -= dt;
    if (this.digT > 0) return;
    const golem = this.ai === 'golem';
    this.digT = golem ? 0.4 : 0.8;
    const g = this.game;
    const w = g.world;
    const fx = Math.floor(this.pos.x + dx * (this.hw + 0.55));
    const fz = Math.floor(this.pos.z + dz * (this.hw + 0.55));
    const fy = Math.floor(this.pos.y + 0.01);
    const tall = Math.ceil(this.h);
    const ys = this.def.body === 'gloop' ? [fy, fy + 1] : golem ? Array.from({ length: tall }, (_, i) => fy + tall - 1 - i) : [fy + 1, fy];
    for (const y of ys) {
      const id = w.get(fx, y, fz);
      if (!id || id === B.BEDROCK) continue;
      const res = w.hitBlock(fx, y, fz, golem ? 2 : 1);
      if (!res) continue;
      const col = g.atlas.colors[res.info.side];
      g.fx.burst(fx + 0.5, y + 0.5, fz + 0.5, col, res.broken ? 14 : 4, { speed: 2, size: 0.1, life: 0.6, spread: 0.4 });
      if (this.vol() > 0.2) {
        if (res.broken) g.sound.blockBreak(res.info.sound);
        else g.sound.blockHit(res.info.sound);
      }
      if ((this.family === 'moss' || golem) && this.attackT < 0) this.attackT = 0.3;
      else this.wobble = 1;
      if (!golem) return;
    }
  }

  canSee(p) {
    const ox = this.pos.x;
    const oy = this.pos.y + this.h * 0.83;
    const oz = this.pos.z;
    const tx = p.pos.x - ox;
    const ty = p.pos.y + 1.5 - oy;
    const tz = p.pos.z - oz;
    const len = Math.hypot(tx, ty, tz) || 1;
    return !this.game.world.raycast(ox, oy, oz, tx / len, ty / len, tz / len, len);
  }

  shoot(p) {
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 1.45 * this.def.scale, this.pos.z);
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
    this.mobs.spawnBolt(o, dir.multiplyScalar(speed), this.id, false, this.boltKind('bolt'));
    this.game.sound.bolt(this.vol());
  }

  // Imps lob fireballs in an arc, so walls do not always save you.
  throwFire(p) {
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 1.5 * this.def.scale, this.pos.z);
    const tx = p.pos.x + p.vel.x * 0.4 - o.x;
    const tz = p.pos.z + p.vel.z * 0.4 - o.z;
    const dist = Math.hypot(tx, tz) || 1;
    const speed = 13;
    const t = dist / speed;
    const vy = (p.pos.y + 0.8 - o.y) / t + 0.5 * 12 * t;
    const v = new THREE.Vector3((tx / dist) * speed, Math.min(vy, 14), (tz / dist) * speed);
    this.fired = 1;
    this.mobs.spawnBolt(o, v, this.id, false, this.boltKind('fire'));
    this.game.sound.throw();
  }

  // Frost / toxic / shock variants shoot matching bolts.
  boltKind(base) {
    const v = this.def.variant;
    if (base === 'bolt' && (v === 'blaze' || v === 'toxic' || v === 'shock' || v === 'frost' || v === 'golden' || v === 'shadow')) return `bolt:${v}`;
    return base;
  }

  // --- Getting hit -------------------------------------------------------------

  hitTest(o, d, maxT) {
    const x = this.pos.x;
    const y = this.pos.y + this.yOffset();
    const z = this.pos.z;
    const s = this.def.scale;
    const body = this.def.body;
    const check = (b, h) => {
      const okB = b >= 0 && b < maxT;
      const okH = h >= 0 && h < maxT;
      if (okH && (!okB || h <= b)) return { t: h, head: true };
      if (okB) return { t: b, head: false };
      return null;
    };
    if (body === 'gloop') {
      const t = rayBox(o, d, x - 0.47 * s, y, z - 0.47 * s, x + 0.47 * s, y + 0.92 * s, z + 0.47 * s);
      return t >= 0 && t < maxT ? { t, head: false } : null;
    }
    if (body === 'crawler') {
      const fx = Math.sin(this.yaw) * 0.4 * s;
      const fz = Math.cos(this.yaw) * 0.4 * s;
      const tb = rayBox(o, d, x - 0.42 * s, y + 0.2 * s, z - 0.42 * s, x + 0.42 * s, y + 0.72 * s, z + 0.42 * s);
      const th = rayBox(o, d, x + fx - 0.2 * s, y + 0.26 * s, z + fz - 0.2 * s, x + fx + 0.2 * s, y + 0.6 * s, z + fz + 0.2 * s);
      return check(tb, th);
    }
    if (body === 'flyer') {
      const tb = rayBox(o, d, x - 0.3 * s, y + 0.1 * s, z - 0.3 * s, x + 0.3 * s, y + 0.5 * s, z + 0.3 * s);
      const th = rayBox(o, d, x - 0.17 * s, y + 0.44 * s, z - 0.17 * s, x + 0.17 * s, y + 0.74 * s, z + 0.17 * s);
      return check(tb, th);
    }
    const tb = rayBox(o, d, x - 0.36 * s, y, z - 0.36 * s, x + 0.36 * s, y + 1.36 * s, z + 0.36 * s);
    const th = rayBox(o, d, x - 0.3 * s, y + 1.36 * s, z - 0.3 * s, x + 0.3 * s, y + 1.92 * s, z + 0.3 * s);
    return check(tb, th);
  }

  // fx carries burn / slow from the shooter's gun core.
  damage(amount, dir, head, at, byId, fx) {
    if (this.state === 'dying' || this.gone) return;
    const g = this.game;
    // A knight's shield soaks up body shots from the front.
    if (this.ai === 'knight' && !head && this.fuseT === 0) {
      const facing = Math.sin(this.yaw) * dir.x + Math.cos(this.yaw) * dir.z;
      if (facing < -0.35) {
        amount *= 0.25;
        if (at) g.fx.burst(at.x, at.y, at.z, SPARK_COLORS, 4, { speed: 3, size: 0.05, up: 1, life: 0.25, spread: 0.05 });
        g.sound.clank(this.vol());
      }
    }
    if (this.def.armor) amount *= 1 - this.def.armor;
    if (byId === g.myId && g.dnums) g.dnums.add(at || { x: this.pos.x, y: this.pos.y + this.h * 0.8, z: this.pos.z }, amount, head);
    this.hurtT = 0.2;
    this.wobble = 1;
    this.hitDir.set(dir.x, 0, dir.z).normalize();
    if (at) g.fx.burst(at.x, at.y, at.z, this.def.colorObjs, 6, { speed: 2.5, size: 0.08, up: 1.5, life: 0.5, spread: 0.1 });
    if (this.remote) {
      // The host decides what the hit does; we just show it landed.
      if (g.mp) g.mp.sendHitMob(this, amount, head, dir, fx);
      g.sound.mobHurt(this.family, 1);
      return;
    }
    this.applyFx(fx, byId);
    this.hp -= amount;
    const push = this.def.boss ? 0.3 : this.ai === 'golem' ? 1.2 : 3.5 / Math.max(1, this.def.scale);
    this.vel.x += dir.x * push;
    this.vel.z += dir.z * push;
    if (this.onGround && !this.def.boss && this.ai !== 'golem') this.vel.y = Math.max(this.vel.y, 3);
    if (this.fuseT > 0) this.fuseT = Math.max(0.001, this.fuseT - 0.15);
    if (this.hp <= 0) {
      this.startDeath(true);
      g.onKill(this, head, byId);
    } else {
      g.sound.mobHurt(this.family, 1);
    }
  }

  startDeath(loud) {
    this.state = 'dying';
    this.deathT = 0;
    this.hurtT = 0.2;
    this.aiming = false;
    this.attackT = -1;
    this.fuseT = 0;
    if (this.shard) this.shard.visible = false;
    this.game.sound.mobDie(this.family, loud ? 1 : this.vol());
    // Plain Boneheads rattle apart (the Bone Colossus boss has its own fall).
    if (this.family === 'bone' && this.def.body === 'humanoid') this.breakApart();
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
    } else if (this.ai !== 'ghost' && (!this.remote || this.ai === 'flyer')) {
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
      moveEntity(w, this, dt);
    }
    if (this.deathT > this.def.death) this.remove(true);
    else this.sync(dt);
  }

  // Cheats: kicked into the sky, banished by the Ban Gun, or frozen.
  cheatState(dt) {
    const g = this.game;
    const root = this.model.root;
    if (this.yeet) {
      const y = this.yeet;
      y.t += dt;
      y.v.y -= 20 * dt;
      this.pos.addScaledVector(y.v, dt);
      this.sync(dt);
      root.rotation.x = y.t * 11;
      root.rotation.z = y.t * 6;
      if (y.t > 1.4) this.remove(true);
      return true;
    }
    if (this.banish) {
      this.banish.t += dt;
      this.sync(dt);
      const k = Math.max(0, 1 - this.banish.t / 0.45);
      root.scale.setScalar(this.def.scale * k);
      root.rotation.y += this.banish.t * 30;
      if (k <= 0) this.remove(false);
      return true;
    }
    // Stuck in a web: can't move or attack until it wears off.
    if (this.state === 'live' && this.webT > 0) {
      this.webT -= dt;
      this.vel.set(0, 0, 0);
      this.sync(dt);
      for (const mat of this.emissives.length ? this.emissives : this.model.materials) if (mat.emissive) mat.emissive.setRGB(0.42, 0.42, 0.4);
      return true;
    }
    if (this.state === 'live' && (this.frozenT > 0 || g.cheats.has('freeze'))) {
      this.frozenT = Math.max(0, (this.frozenT || 0) - dt);
      this.vel.set(0, 0, 0);
      this.sync(dt);
      for (const mat of this.emissives.length ? this.emissives : this.model.materials) if (mat.emissive) mat.emissive.setRGB(0.08, 0.3, 0.55);
      return true;
    }
    return false;
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
          size: 0.12 * Math.max(1, this.def.scale),
          up: 2,
          life: 0.9,
          spread: 0.4 * this.def.scale,
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

  // --- Drawing -----------------------------------------------------------------

  sync(dt) {
    const m = this.model;
    const jitter = this.state === 'spawn' && !this.flies ? (Math.random() - 0.5) * 0.05 : 0;
    const bob = this.ai === 'ghost' ? Math.sin(this.t * 2.2) * 0.08 : 0;
    m.root.position.set(this.pos.x + jitter, this.pos.y + this.yOffset() + bob, this.pos.z);
    m.root.rotation.y = this.yaw;
    const flash = this.hurtT > 0 ? Math.min(1, this.hurtT / 0.2) : 0;
    const fire = this.burning ? 0.22 + Math.sin(this.t * 17) * 0.08 : 0;
    const ice = this.slowed ? 1 : 0;
    // Fuses blink white faster and faster before they blow.
    const fuse = this.fuseT > 0 ? (Math.sin(this.t * (10 + this.fuseT * 40)) > 0 ? 0.55 : 0) : 0;
    const base = this.baseEmissive;
    const pulse = base ? 0.7 + Math.sin(this.t * 3) * 0.3 : 0;
    for (const mat of this.emissives) {
      mat.emissive.setRGB(
        0.55 * flash + fire + fuse + (base ? base.r * pulse : 0),
        0.05 * flash + fire * 0.35 + ice * 0.1 + fuse + (base ? base.g * pulse : 0),
        0.03 * flash + ice * 0.25 + fuse + (base ? base.b * pulse : 0),
      );
    }
    const sc = this.def.scale;
    if (this.ai === 'bomber') m.root.scale.setScalar(sc * (1 + this.fuseT * 0.25));
    if (this.ai === 'ghost' && this.state === 'spawn') for (const mat of m.materials) mat.opacity = this.def.alpha * ease(this.spawnT);
    if (this.ai === 'ghost' && this.state === 'dying') for (const mat of m.materials) mat.opacity = this.def.alpha * Math.max(0, 1 - this.deathT / this.def.death);
    if (m.spark) m.spark.scale.setScalar(0.7 + Math.random() * 0.6);
    if (m.glowTip) m.glowTip.visible = Math.random() > 0.15;
    if (m.tail) m.tail.rotation.y = Math.sin(this.t * 3) * 0.4;

    const body = this.def.body;
    if (body === 'gloop') {
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
    if (body === 'crawler') {
      this.poseCrawler(dt);
      return;
    }
    if (body === 'flyer') {
      this.poseFlyer(dt);
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
      lookPitch = Math.atan2(tgt.pos.y + 1.4 - (this.pos.y + 1.6 * sc), Math.hypot(dx, dz) || 1);
    }
    const s = {
      speed: Math.hypot(this.vel.x, this.vel.z) / sc,
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
    if (this.ai === 'archer' || this.ai === 'thrower') poseBone(this.rig, s, dt);
    else poseMoss(this.rig, s, dt);
    const P = m.parts;
    if (this.ai === 'knight' && this.state !== 'dying') {
      // Shield up in front, sword arm does the swinging.
      P.armL.rotation.set(-1.25, -0.6, 0.15);
      if (this.attackT < 0) P.armR.rotation.x = -0.5 + Math.sin(this.rig.phase) * 0.3;
    } else if (this.ai === 'ghost' && this.state !== 'dying') {
      P.armR.rotation.x = P.armL.rotation.x = -1.4 + Math.sin(this.t * 2.2) * 0.12;
      P.hips.position.y += Math.sin(this.t * 2.2) * 0.02;
    } else if (this.ai === 'bomber' && this.fuseT > 0) {
      P.armR.rotation.x = -2.6 + Math.sin(this.t * 30) * 0.3;
      P.armL.rotation.x = -2.6 - Math.sin(this.t * 30) * 0.3;
    } else if (this.ai === 'thrower' && this.aiming) {
      // Wind up overhand instead of drawing a bow.
      P.armR.rotation.x = -2.6 + this.drawT * 0.8 - this.fired * 1.6;
      P.armL.rotation.x = -0.4;
    }
    if (this.shard) this.shard.visible = this.drawT > 0.05;
  }

  poseCrawler(dt) {
    const m = this.model;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.legPhase = (this.legPhase || 0) + speed * dt * 5;
    const dead = this.state === 'dying';
    for (const leg of m.legs) {
      const { side, i, base } = leg.userData;
      const ph = this.legPhase + i * 1.6 + (side > 0 ? Math.PI : 0);
      const air = !this.onGround && !dead;
      leg.rotation.y = base + (dead ? 0 : Math.sin(ph) * 0.35 * Math.min(1, speed / 3));
      leg.rotation.z = dead ? side * 0.9 : air ? side * -0.35 : Math.max(0, Math.cos(ph)) * side * -0.25 * Math.min(1, speed / 3);
    }
    m.head.rotation.x = this.attackT >= 0 ? -0.4 : 0;
    const d = dead ? Math.min(1, this.deathT / 0.35) : 0;
    m.root.rotation.z = ease(d) * Math.PI;
    m.body.position.y = dead ? ease(d) * 0.7 : 0;
    m.body.rotation.x = !this.onGround && !dead ? -0.25 : 0;
  }

  poseFlyer(dt) {
    const m = this.model;
    const dead = this.state === 'dying';
    const rate = this.diving > 0 ? 26 : 16;
    this.flap = (this.flap || 0) + dt * (dead ? 0 : rate);
    for (const w of m.wings) {
      const { side, tip } = w.userData;
      const a = dead ? 0.6 : Math.sin(this.flap) * 0.8;
      w.rotation.z = side * a;
      tip.rotation.z = side * a * 0.6;
      if (this.diving > 0) w.rotation.y = side * -0.5;
      else w.rotation.y = 0;
    }
    m.body.position.y = 0.3 + (dead ? 0 : Math.sin(this.flap) * 0.04);
    m.body.rotation.x = this.diving > 0 ? 0.6 : 0.1;
    m.root.rotation.z = dead ? this.deathT * 9 : 0;
  }
}
