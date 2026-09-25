import * as THREE from 'three';
import { moveEntity } from './physics.js';
import { buildHumanoid, buildGloop, PX } from './model.js';
import { paintMoss, paintBone, paintGloop, makeSkinTexture } from './skin.js';
import { FlowField } from './flow.js';
import { SX, SZ, SEA, B, BLOCKS } from './world.js';
import { TILE_UV, T } from './textures.js';
import { wrapAngle, clamp } from './util.js';

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
    colors: ['#9b5fd1', '#caa6ee', '#6d3aa0'],
  },
};
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
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const BOLT_COLORS = [new THREE.Color('#bff3ff'), new THREE.Color('#6fd6f0')];
const easeOut = (t) => 1 - (1 - t) * (1 - t);

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
  constructor(mobs, type, x, y, z, mul) {
    this.mobs = mobs;
    this.game = mobs.game;
    this.type = type;
    this.def = MOB_TYPES[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.hw = this.def.hw;
    this.h = this.def.h;
    this.hp = this.def.hp * mul.hp;
    this.speed = this.def.speed * mul.speed;
    this.state = 'spawn';
    this.spawnT = 0;
    this.deathT = 0;
    this.gone = false;
    this.yaw = Math.random() * Math.PI * 2;
    this.t = Math.random() * 10;
    this.attackCd = 1 + Math.random();
    this.hurtT = 0;
    this.swingT = 0;
    this.drawT = 0;
    this.aiming = false;
    this.losT = 0;
    this.los = false;
    this.walkPhase = 0;
    this.jumpCd = 0;
    this.hopCd = 0.5 + Math.random() * 0.5;
    this.stuck = 0;
    this.progressT = 0;
    this.lastX = x;
    this.lastZ = z;
    this.digT = 0;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1;
    this.onGround = false;
    const tex = mobs.tex[type];
    this.model = type === 'gloop' ? buildGloop(tex) : buildHumanoid(tex, { limb: type === 'bone' ? 2 : 0 });
    if (type === 'bone') this.addBow();
    this.game.scene.add(this.model.root);
    this.emissives = this.model.materials.filter((m) => m.emissive);
    this.sync();
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

  distToPlayer() {
    const p = this.game.player.pos;
    return Math.hypot(p.x - this.pos.x, p.y - this.pos.y, p.z - this.pos.z);
  }

  vol() {
    return Math.max(0, 1 - this.distToPlayer() / 40);
  }

  yOffset() {
    return this.state === 'spawn' ? -(1 - easeOut(this.spawnT)) * this.h : 0;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    this.t += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.attackCd -= dt;
    this.jumpCd -= dt;

    if (this.state === 'spawn') {
      this.spawnT += dt / 0.9;
      if (Math.random() < 0.5) {
        const below = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y) - 1, Math.floor(this.pos.z));
        if (below) {
          g.fx.burst(this.pos.x, this.pos.y + 0.1, this.pos.z, g.atlas.colors[BLOCKS[below].top], 1, {
            speed: 1.5,
            size: 0.09,
            up: 3,
            life: 0.5,
            spread: 0.35,
          });
        }
      }
      if (this.spawnT >= 1) {
        this.spawnT = 1;
        this.state = 'live';
      }
      this.sync();
      return;
    }

    if (this.state === 'dying') {
      this.deathT += dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
      moveEntity(w, this, dt);
      if (this.deathT > 0.75) this.remove(true);
      else this.sync();
      return;
    }

    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-3;
    const dy = p.pos.y - this.pos.y;
    const alive = !p.dead;
    let wx = 0;
    let wz = 0;
    let nextStand = -1;
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

    this.aiming = false;
    if (!alive) {
      wx = Math.sin(this.t * 0.4 + this.side) * 0.4;
      wz = Math.cos(this.t * 0.3) * 0.4;
    } else if (this.type === 'bone') {
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
    if (alive && this.stuck >= 2 && this.def.digs) this.dig(dt, dx / dist, dz / dist);

    if (alive) {
      if (this.type === 'moss' && dist < 1.3 && dy > -1.2 && dy < 1.6 && this.attackCd <= 0) {
        p.hurt(this.def.dmg, this.pos, 'moss');
        this.attackCd = 1;
        this.swingT = 0.35;
      }
      if (this.type === 'gloop' && this.attackCd <= 0) {
        const cy = this.pos.y + 0.45;
        const py = p.pos.y + 0.9;
        if (dist < this.hw + p.hw + 0.25 && Math.abs(cy - py) < 1.3) {
          p.hurt(this.def.dmg, this.pos, 'gloop');
          this.attackCd = 0.9;
        }
      }
      if (this.type === 'moss' && Math.random() < dt * 0.3) g.sound.groan(this.vol());
    }

    const faceTarget = alive && (this.type === 'bone' ? this.aiming : dist < 5);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const targetYaw = faceTarget ? Math.atan2(dx, dz) : hs > 0.3 ? Math.atan2(this.vel.x, this.vel.z) : this.yaw;
    this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, dt * 8);
    this.sync();
  }

  // Next step along the flow field, as a unit direction.
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
    const slow = (this.stuck >= 2 ? 0.4 : 1) * (this.drawT > 0 ? 0.4 : 1);
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
    this.walkPhase += Math.hypot(this.vel.x, this.vel.z) * dt * 2.6;
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
        this.vel.x = wx * this.speed;
        this.vel.z = wz * this.speed;
        this.hopCd = 0.55 + Math.random() * 0.45;
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
      this.swingT = 0.35;
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
    this.mobs.spawnBolt(o, dir.multiplyScalar(speed));
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

  damage(amount, dir, head, at) {
    if (this.state === 'dying' || this.gone) return;
    const g = this.game;
    this.hp -= amount;
    this.hurtT = 0.2;
    this.vel.x += dir.x * 3.5;
    this.vel.z += dir.z * 3.5;
    if (this.onGround) this.vel.y = Math.max(this.vel.y, 3);
    g.fx.burst(at.x, at.y, at.z, this.def.colorObjs, 6, { speed: 2.5, size: 0.08, up: 1.5, life: 0.5, spread: 0.1 });
    if (this.hp <= 0) {
      this.state = 'dying';
      this.deathT = 0;
      this.hurtT = 0.75;
      this.aiming = false;
      g.sound.mobDie(this.type, 1);
      g.onKill(this, head);
    } else {
      g.sound.mobHurt(this.type, 1);
    }
  }

  remove(withPuff) {
    if (this.gone) return;
    this.gone = true;
    const g = this.game;
    if (withPuff) {
      g.fx.burst(this.pos.x, this.pos.y + this.h * 0.5, this.pos.z, this.def.colorObjs, 22, {
        speed: 3,
        size: 0.12,
        up: 2,
        life: 0.9,
        spread: 0.4,
      });
    }
    g.scene.remove(this.model.root);
    this.model.dispose();
  }

  sync() {
    const m = this.model;
    m.root.position.set(this.pos.x, this.pos.y + this.yOffset(), this.pos.z);
    m.root.rotation.y = this.yaw;
    const flash = this.hurtT > 0 ? Math.min(1, this.hurtT / 0.2) : 0;
    for (const mat of this.emissives) mat.emissive.setRGB(0.55 * flash, 0.05 * flash, 0.03 * flash);

    if (this.type === 'gloop') {
      let sx = 1;
      let sy = 1;
      if (this.state === 'dying') {
        const k = Math.min(1, this.deathT / 0.5);
        sy = 1 - k * 0.7;
        sx = 1 + k * 0.4;
      } else if (!this.onGround && this.state === 'live') {
        sy = 1 + clamp(this.vel.y * 0.03, -0.2, 0.25);
        sx = 1 - (sy - 1) * 0.6;
      } else if (this.hopCd < 0.18) {
        const q = ((0.18 - Math.max(0, this.hopCd)) / 0.18) * 0.25;
        sy = 1 - q;
        sx = 1 + q * 0.6;
      }
      m.body.scale.set(sx, sy, sx);
      return;
    }

    const P = m.parts;
    const amt = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 3);
    const s = Math.sin(this.walkPhase) * 0.75 * amt;
    P.legR.rotation.x = s;
    P.legL.rotation.x = -s;
    const p = this.game.player;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const pitchTo = Math.atan2(p.pos.y + 1.4 - (this.pos.y + 1.6), dist);
    if (this.state === 'live') {
      P.head.rotation.y = clamp(wrapAngle(Math.atan2(dx, dz) - this.yaw), -1, 1);
      P.head.rotation.x = -clamp(pitchTo, -0.6, 0.6);
    }
    if (this.type === 'moss') {
      const swing = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) * 0.9 : 0;
      const sway = Math.sin(this.t * 3) * 0.06;
      P.armR.rotation.x = -1.45 + sway + swing;
      P.armL.rotation.x = -1.45 - sway + swing;
    } else if (this.aiming) {
      P.armR.rotation.x = -Math.PI / 2 - pitchTo;
      P.armR.rotation.y = 0.1;
      P.armL.rotation.x = -Math.PI / 2 - pitchTo + 0.1;
      P.armL.rotation.y = -0.45;
    } else {
      P.armR.rotation.x = -s * 0.8;
      P.armL.rotation.x = s * 0.8;
      P.armR.rotation.y = 0;
      P.armL.rotation.y = 0;
    }
    if (this.shard) this.shard.visible = this.drawT > 0.05;
    if (this.state === 'dying') m.root.rotation.z = Math.min(1, this.deathT / 0.35) * (Math.PI / 2);
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

  refreshFlow(force = false) {
    const p = this.game.player.pos;
    const key = `${Math.floor(p.x)},${Math.floor(p.z)},${this.game.world.version}`;
    if (force || key !== this.flowKey) {
      this.flow.compute(this.game.world, Math.floor(p.x), Math.floor(p.z));
      this.flowKey = key;
    }
  }

  findSpawn() {
    const f = this.flow;
    const p = this.game.player.pos;
    for (let pass = 0; pass < 2; pass++) {
      const minD = pass === 0 ? 17 : 9;
      for (let i = 0; i < 90; i++) {
        const x = 2 + Math.floor(Math.random() * (SX - 4));
        const z = 2 + Math.floor(Math.random() * (SZ - 4));
        const s = f.standAt(x, z);
        if (s <= SEA) continue;
        const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
        if (d < minD || d > 40) continue;
        if (pass === 0 && !isFinite(f.at(x, z))) continue;
        return new THREE.Vector3(x + 0.5, s, z + 0.5);
      }
    }
    return null;
  }

  spawn(type, mul) {
    const at = this.findSpawn();
    if (!at) return false;
    this.list.push(new Mob(this, type, at.x, at.y, at.z, mul));
    return true;
  }

  spawnBolt(o, v) {
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    mesh.position.copy(o);
    this.game.scene.add(mesh);
    this.bolts.push({ pos: o.clone(), vel: v.clone(), life: 3, mesh });
  }

  spawnPickup(kind, x, y, z) {
    const mesh = (kind === 'heart' ? this.heartProto : this.bundleProto).clone();
    mesh.position.set(x, y + 0.45, z);
    this.game.scene.add(mesh);
    this.pickups.push({ kind, mesh, x, y: y + 0.45, z, t: 0 });
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

  update(dt) {
    this.flowTimer -= dt;
    if (this.flowTimer <= 0) {
      this.flowTimer = 0.35;
      this.refreshFlow();
    }
    for (const m of this.list) m.update(dt);
    this.separate(dt);
    this.list = this.list.filter((m) => !m.gone);
    this.updateBolts(dt);
    this.updatePickups(dt);
  }

  separate(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.state !== 'live') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.state !== 'live') continue;
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
      pk.mesh.rotation.y += dt * 2.2;
      pk.mesh.position.y = pk.y + Math.sin(pk.t * 3) * 0.1;
      pk.mesh.visible = pk.t < 20 || Math.floor(pk.t * 8) % 2 === 0;
      const d = Math.hypot(p.pos.x - pk.x, p.pos.y + 0.9 - pk.y, p.pos.z - pk.z);
      if (!p.dead && d < 1.5) {
        if (pk.kind === 'heart') {
          p.heal(6);
          g.hud.popup('+3 hearts', 'heal');
        } else {
          p.blocks = Math.min(99, p.blocks + 6);
          g.hud.popup('+6 blocks');
        }
        g.sound.pickup();
        pk.t = 99;
      }
      if (pk.t > 25) g.scene.remove(pk.mesh);
    }
    this.pickups = this.pickups.filter((pk) => pk.t <= 25);
  }
}

