import * as THREE from 'three';
import { rayBox } from './mob.js';
import { LANE, GY } from './city.js';
import { SEA } from './world.js';

// Cars for Adventure mode: built from boxes like everything else. You can
// drive any car that's parked (press E), and traffic drives itself round
// the road grid. Cars take damage from bullets, blasts and crashes, and
// blow up when they're wrecked.

export const CAR_TYPES = {
  sedan: { name: 'Sedan', len: 4, wid: 1.9, hgt: 1.5, speed: 22, accel: 9, turn: 1, hp: 120, colors: ['#3d6fd8', '#d8392b', '#e8e4dc', '#2a2a2e', '#4d8a2c', '#8a8f96'] },
  taxi: { name: 'Taxi', len: 4.1, wid: 1.9, hgt: 1.5, speed: 21, accel: 9, turn: 1, hp: 120, colors: ['#f2c230'] },
  police: { name: 'Police Car', len: 4.3, wid: 1.95, hgt: 1.5, speed: 27, accel: 12, turn: 1.05, hp: 170, colors: ['#f4f1ea'] },
  sports: { name: 'Sports Car', len: 4.3, wid: 1.95, hgt: 1.15, speed: 34, accel: 16, turn: 1.15, hp: 100, colors: ['#d8392b', '#ff7a2f', '#39b8ff', '#f2c230'] },
  pickup: { name: 'Pickup Truck', len: 4.8, wid: 2, hgt: 1.8, speed: 20, accel: 8, turn: 0.9, hp: 180, colors: ['#4d8a2c', '#8a5a33', '#2a2a2e', '#d8392b'] },
  van: { name: 'Gold Van', len: 4.8, wid: 2.1, hgt: 2.2, speed: 23, accel: 9, turn: 0.95, hp: 220, colors: ['#f2c230'] },
  bus: { name: 'Bus', len: 8, wid: 2.3, hgt: 2.8, speed: 14, accel: 5, turn: 0.7, hp: 400, colors: ['#39b8ff'] },
  icecream: { name: 'Ice Cream Van', len: 4.9, wid: 2.1, hgt: 2.3, speed: 16, accel: 6, turn: 0.9, hp: 180, colors: ['#ff9dc0'] },
};

const mats = new Map();
function mat(color, glow = false) {
  const key = `${color}|${glow}`;
  if (!mats.has(key)) mats.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
  return mats.get(key);
}
const geos = new Map();
function geo(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  if (!geos.has(key)) geos.set(key, new THREE.BoxGeometry(w, h, d));
  return geos.get(key);
}

const GLASS = '#1d2a36';
const TIRE = '#1a1a1c';
const TRIM = '#3a3b3e';

// Build a car model facing +z. Returns the root plus bits that move.
export function buildCar(type, color) {
  const d = CAR_TYPES[type];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const L = d.len;
  const W = d.wid;
  const add = (w, h, dd, x, y, z, c, glow = false, parent = body) => {
    const m = new THREE.Mesh(geo(w, h, dd), mat(c, glow));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const low = type === 'sports';
  const tall = type === 'bus' || type === 'van' || type === 'icecream';
  const baseY = 0.32;
  const deck = low ? 0.5 : 0.62;
  // Chassis and bumpers.
  add(W, deck, L, 0, baseY + deck / 2, 0, color);
  add(W + 0.04, 0.16, 0.18, 0, baseY + 0.12, L / 2, TRIM);
  add(W + 0.04, 0.16, 0.18, 0, baseY + 0.12, -L / 2, TRIM);
  const top = baseY + deck;
  if (tall) {
    // A box body with a window band.
    const bh = d.hgt - top;
    const bl = type === 'bus' ? L - 0.2 : L * 0.78;
    const bz = type === 'bus' ? 0 : -L * 0.1;
    add(W - 0.04, bh, bl, 0, top + bh / 2, bz, color);
    add(W + 0.02, bh * 0.32, bl - 0.3, 0, top + bh * 0.62, bz, GLASS);
    if (type !== 'bus') {
      // Cab at the front with a windscreen.
      add(W - 0.1, bh * 0.7, L * 0.2, 0, top + bh * 0.35, L * 0.38, color);
      add(W - 0.14, bh * 0.4, 0.05, 0, top + bh * 0.45, L * 0.48, GLASS);
    } else {
      add(W - 0.2, bh * 0.4, 0.05, 0, top + bh * 0.6, L / 2, GLASS);
      add(W + 0.02, 0.18, L - 0.3, 0, top + 0.2, 0, '#f4f1ea');
    }
    if (type === 'icecream') {
      // A giant cone on the roof.
      add(0.5, 0.6, 0.5, 0, d.hgt + 0.3, -0.4, '#d9a84a');
      add(0.7, 0.45, 0.7, 0, d.hgt + 0.8, -0.4, '#fff6f0');
      add(0.5, 0.3, 0.5, 0, d.hgt + 1.1, -0.4, '#ff9dc0');
      add(W + 0.03, 0.2, bl - 0.6, 0, top + 0.25, bz, '#f4f1ea');
    }
    if (type === 'van') add(W + 0.03, 0.25, bl - 0.4, 0, top + 0.3, bz, '#2a2a2e');
  } else {
    // A cabin with windows, and a roof.
    const ch = d.hgt - top;
    const cl = type === 'pickup' ? L * 0.34 : low ? L * 0.4 : L * 0.5;
    const cz = type === 'pickup' ? L * 0.08 : low ? -L * 0.08 : -L * 0.05;
    add(W - 0.16, ch * 0.72, cl, 0, top + ch * 0.36, cz, GLASS);
    add(W - 0.1, ch * 0.28, cl + 0.02, 0, top + ch * 0.86, cz, color);
    add(0.1, ch * 0.72, cl * 0.12, W / 2 - 0.08, top + ch * 0.36, cz, color);
    add(0.1, ch * 0.72, cl * 0.12, -W / 2 + 0.08, top + ch * 0.36, cz, color);
    if (type === 'pickup') {
      // The open truck bed.
      add(W, 0.4, L * 0.42, 0, top + 0.2, -L * 0.26, color);
      add(W - 0.3, 0.36, L * 0.38, 0, top + 0.24, -L * 0.26, '#2a2a2e');
    }
    if (low) add(W, 0.12, 0.4, 0, top + 0.35, -L / 2 + 0.25, '#1d1d1f');
    if (type === 'taxi') {
      add(0.8, 0.22, 0.3, 0, d.hgt + 0.11, cz, '#fff6c8', true);
      add(W + 0.02, 0.12, L * 0.6, 0, top - 0.1, 0, '#1d1d1f');
    }
    if (type === 'police') {
      add(W + 0.02, deck * 0.6, L * 0.55, 0, baseY + deck * 0.45, 0, '#1d1d1f');
    }
  }
  // Lights: headlights front, tail lights back.
  const hl = [];
  for (const s of [-1, 1]) {
    hl.push(add(0.36, 0.16, 0.06, s * (W / 2 - 0.3), top - 0.18, L / 2 + 0.01, '#fff6d0', true));
    add(0.36, 0.14, 0.06, s * (W / 2 - 0.3), top - 0.18, -L / 2 - 0.01, '#d8392b', true);
  }
  // Police lights.
  let siren = null;
  if (type === 'police') {
    const red = add(0.45, 0.16, 0.26, -0.26, d.hgt + 0.08, 0, '#ff2a2a', true);
    const blue = add(0.45, 0.16, 0.26, 0.26, d.hgt + 0.08, 0, '#2a6aff', true);
    siren = { red, blue };
  }
  // Wheels.
  const wheels = [];
  const wz = type === 'bus' ? L * 0.36 : L * 0.32;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wg = new THREE.Group();
      wg.position.set(sx * (W / 2 - 0.12), 0.36, sz * wz);
      root.add(wg);
      add(0.3, 0.72, 0.72, 0, 0, 0, TIRE, false, wg);
      add(0.32, 0.3, 0.3, 0, 0, 0, '#9aa0a8', false, wg);
      wheels.push({ g: wg, front: sz > 0 });
    }
  }
  return { root, body, wheels, siren, lights: hl };
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const FIRE = [new THREE.Color('#ffd84a'), new THREE.Color('#ff7a2f'), new THREE.Color('#3a3530')];

let nextId = 1;

export class Car {
  // opts: { ai: true for traffic, color }
  constructor(adv, type, x, z, yaw, opts = {}) {
    this.adv = adv;
    this.game = adv.game;
    this.id = nextId++;
    this.type = type;
    this.def = CAR_TYPES[type];
    const cols = this.def.colors;
    this.color = opts.color || cols[Math.floor(Math.random() * cols.length)];
    const m = buildCar(type, this.color);
    this.model = m;
    this.game.scene.add(m.root);
    this.pos = new THREE.Vector3(x, adv.groundAt(x, z, GY + 2), z);
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.vy = 0;
    this.hp = this.def.hp;
    this.dead = false;
    this.deadT = 0;
    this.driver = opts.ai ? 'ai' : null;
    this.ai = null;
    this.stuckT = 0;
    this.honkT = 0;
    this.hurtT = 0;
    this.spin = 0;
    this.sirenOn = type === 'police' && !!opts.ai && Math.random() < 0.3;
    this.sync(0);
  }

  get half() {
    return { l: this.def.len / 2, w: this.def.wid / 2 };
  }

  forward(out = tmp) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }

  // Does a block get in the way of the car at (x, z)?
  blocked(x, z, y) {
    const w = this.game.world;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const { l, w: hw } = this.half;
    for (const [a, b] of [
      [l, hw],
      [l, -hw],
      [-l, hw],
      [-l, -hw],
      [l, 0],
      [-l, 0],
      [0, hw],
      [0, -hw],
    ]) {
      const px = x + s * a + c * b;
      const pz = z + c * a - s * b;
      for (const dy of [0.6, 1.3]) if (w.solidP(Math.floor(px), Math.floor(y + dy), Math.floor(pz))) return true;
    }
    return false;
  }

  // Controls: throttle (-1..1), steer (-1..1), handbrake.
  drive(dt, throttle, steerIn, handbrake) {
    const d = this.def;
    if (throttle > 0) {
      if (this.speed < -0.3) this.speed = Math.min(0, this.speed + 18 * dt);
      else this.speed += d.accel * throttle * dt * (1 - Math.max(0, this.speed) / d.speed);
    } else if (throttle < 0) {
      if (this.speed > 0.3) this.speed = Math.max(0, this.speed - 18 * dt);
      else this.speed = Math.max(-d.speed * 0.35, this.speed - d.accel * 0.6 * dt);
    } else {
      const f = 2.5 * dt;
      this.speed = Math.abs(this.speed) < f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    if (handbrake) {
      const f = 12 * dt;
      this.speed = Math.abs(this.speed) < f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    this.speed *= 1 - 0.08 * dt;
    // Steering eases in, and you can't turn standing still.
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 7);
    const grip = handbrake ? 1.6 : 1;
    const sp = Math.min(Math.abs(this.speed), 12) * Math.sign(this.speed);
    this.yaw += sp * this.steer * 0.19 * d.turn * grip * dt;
    this.move(dt);
  }

  move(dt) {
    const g = this.game;
    const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
    if (this.blocked(nx, nz, this.pos.y)) {
      // Crash: bounce back, and a hard hit hurts.
      const hit = Math.abs(this.speed);
      if (hit > 7) {
        this.damage(hit * 2.2, null, this.driver === 'player' ? 'player' : null);
        g.sound.landThud(Math.min(1, hit / 20));
        g.sound.clank(Math.min(1, hit / 15));
        if (this.driver === 'player') g.player.shake = Math.max(g.player.shake, Math.min(0.5, hit / 40));
      }
      this.speed *= -0.25;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    // Stay on the ground: step up curbs, fall off edges.
    const gy = this.adv.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.2);
    if (gy > this.pos.y + 0.01) {
      this.pos.y += Math.min(gy - this.pos.y, 12 * dt);
      this.vy = 0;
    } else {
      this.vy -= 25 * dt;
      this.pos.y = Math.max(gy, this.pos.y + this.vy * dt);
      if (this.pos.y <= gy) this.vy = 0;
    }
  }

  // Traffic: follow the lane to the next junction, then pick a new road.
  aiDrive(dt) {
    const adv = this.adv;
    if (!this.ai) this.ai = adv.traffic.pickRoute(this);
    const ai = this.ai;
    const a = ai.a;
    const b = ai.b;
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    // Right-hand side of the road.
    const rx = -dz;
    const rz = dx;
    const lx = a.x + rx * LANE;
    const lz = a.z + rz * LANE;
    // Where along the road the car is.
    const along = (this.pos.x - a.x) * dx + (this.pos.z - a.z) * dz;
    const total = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
    const ahead = Math.min(total, along + 5.5);
    const tx = lx + dx * ahead;
    const tz = lz + dz * ahead;
    if (total - along < 6.5) {
      const next = adv.traffic.next(b, a);
      this.ai = { a: b, b: next };
    }
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    // How fast: slow for corners, stop for anything in front.
    let target = this.type === 'bus' ? 7 : this.type === 'icecream' ? 6 : 9;
    if (total - along < 12) target = Math.min(target, 6);
    if (this.aiTarget) target = this.aiTarget;
    // Pull over for police cars with their sirens on.
    if (!this.aiTarget && adv.police.yieldTo(this)) target = Math.min(target, 2.5);
    // Stop at red lights (and at yellow, unless it's too late to stop).
    const toNode = total - along;
    const light = adv.traffic.lightFor(b, dx, dz);
    if (!this.aiTarget && light !== 'green' && toNode > 8 && toNode < 20 && !(light === 'yellow' && toNode < 11)) {
      target = Math.min(target, Math.max(0, (toNode - 8.8) * 1.4));
    }
    const f = this.forward(tmp2);
    const block = adv.obstacleAhead(this, f);
    if (block < 9) target = Math.min(target, Math.max(0, (block - 3.2) * 1.4));
    if (block < 4.5 && this.honkT <= 0) {
      this.honkT = 3 + Math.random() * 3;
      if (this.pos.distanceTo(this.game.player.pos) < 18) this.game.sound.horn(0.5);
    }
    this.honkT -= dt;
    // Unstick: reverse a bit, and if that fails, move somewhere else.
    if (Math.abs(this.speed) < 0.4 && target > 2) {
      this.stuckT += dt;
      if (this.stuckT > 14) adv.traffic.respawn(this);
    } else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 4 && this.stuckT < 5.5) {
      this.drive(dt, -0.7, -steer, false);
      return;
    }
    const throttle = Math.max(-1, Math.min(1, (target - this.speed) * 0.6));
    this.drive(dt, throttle, steer, false);
  }

  // by: 'player' when it was you (shots, crashes, your explosions).
  damage(amount, from, by = null) {
    if (this.dead) return;
    if (by) this.lastHitBy = by;
    this.hp -= amount;
    this.hurtT = 0.15;
    if (this.hp <= 0) this.explode();
    else if (this.onHurt) this.onHurt(amount, from);
  }

  explode() {
    const g = this.game;
    this.dead = true;
    this.deadT = 0;
    this.hp = 0;
    this.speed *= 0.3;
    const at = new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z);
    // Wrecking someone else's car is a crime. The gold van is fair game.
    const mine = this.lastHitBy === 'player';
    if (mine && !this.mission && !this.mine) this.adv.police.crime(this.type === 'police' ? 'wreckCop' : 'wreck');
    this.adv.blastBy = mine ? 'player' : null;
    g.combat.explode(at, 3.2, 30, { local: true });
    this.adv.blastBy = undefined;
    g.fx.burst(at.x, at.y, at.z, FIRE, 40, { speed: 6, size: 0.18, up: 4, life: 1.2, spread: 0.8 });
    // Burnt out: everything goes dark.
    this.model.root.traverse((o) => {
      if (o.isMesh) o.material = mat('#2a2622');
    });
    if (this.onWreck) this.onWreck();
  }

  // Did a shot along this ray hit the car? t along the ray, or null.
  hitTest(o, d, maxT) {
    const s = Math.sin(-this.yaw);
    const c = Math.cos(-this.yaw);
    const ox = o.x - this.pos.x;
    const oz = o.z - this.pos.z;
    const lo = { x: ox * c + oz * s, y: o.y - this.pos.y, z: -ox * s + oz * c };
    const ld = { x: d.x * c + d.z * s, y: d.y, z: -d.x * s + d.z * c };
    const { l, w } = this.half;
    const t = rayBox(lo, ld, -w, 0.3, -l, w, this.def.hgt, l);
    return t >= 0 && t < maxT ? t : null;
  }

  update(dt) {
    this.hurtT -= dt;
    // Drove into the sea: the engine floods.
    if (this.pos.y + 0.6 < SEA) {
      this.speed *= 1 - Math.min(1, 3 * dt);
      if (!this.dead) this.damage(12 * dt, null);
    }
    if (this.dead) {
      this.deadT += dt;
      this.move(dt);
      this.speed *= 1 - 2 * dt;
      if (Math.random() < dt * 6) this.game.fx.burst(this.pos.x, this.pos.y + 1.4, this.pos.z, FIRE, 1, { speed: 0.6, size: 0.25, up: 2, life: 1.2, spread: 0.6, grav: -3 });
    } else if (this.driver === 'ai') this.aiDrive(dt);
    else if (this.driver === 'cop' && this.unit) this.adv.police.driveCop(this, dt);
    else if (this.driver !== 'player') this.drive(dt, 0, 0, true);
    this.sync(dt);
  }

  sync(dt) {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    // Lean into turns and dip when braking.
    m.body.rotation.z = -this.steer * Math.min(1, Math.abs(this.speed) / 15) * 0.06;
    this.spin += (this.speed * dt) / 0.36;
    for (const w of m.wheels) {
      w.g.rotation.x = this.spin;
      w.g.rotation.y = w.front ? this.steer * 0.45 : 0;
    }
    if (m.siren) {
      const on = this.sirenOn || this.driver === 'cop' || (this.driver === 'player' && this.adv.siren);
      const f = Math.floor(performance.now() / 180) % 2;
      m.siren.red.visible = !on || f === 0;
      m.siren.blue.visible = !on || f === 1;
    }
  }
}
