import { PX } from './model.js';
import { clamp, wrapAngle } from './util.js';

// Poses are computed as targets every frame and each joint eases toward its
// target, so every change (start running, crouch, aim, get hit) blends in
// smoothly instead of snapping.

export const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export class Rig {
  constructor(model) {
    this.m = model;
    this.v = Object.create(null);
    this.phase = 0;
    this.t = Math.random() * 10;
    this.land = 0;
  }

  go(key, target, k, dt) {
    const c = this.v[key];
    const n = c === undefined ? target : c + (target - c) * (1 - Math.exp(-k * dt));
    this.v[key] = n;
    return n;
  }

  get(key) {
    return this.v[key] || 0;
  }

  apply() {
    const P = this.m.parts;
    const v = this.v;
    P.hips.rotation.set(v['hips.x'] || 0, v['hips.y'] || 0, v['hips.z'] || 0);
    P.hips.position.set(0, (12 + (v['hips.py'] || 0)) * PX, (v['hips.pz'] || 0) * PX);
    for (const n of ['head', 'armR', 'armL', 'legR', 'legL']) {
      P[n].rotation.set(v[n + '.x'] || 0, v[n + '.y'] || 0, v[n + '.z'] || 0);
    }
    const lz = (v['legs.pz'] || 0) * PX;
    P.legR.position.z = lz;
    P.legL.position.z = lz;
  }
}

// s: { speed, sprint, crouch, onGround, water, vy, pitch, aim (0..1),
//      recoil (0..1), reload (-1 or 0..1), hurt (0..1), landed (0..1),
//      dead, deadT }
export function posePlayer(rig, s, dt) {
  rig.t += dt;
  const moving = Math.min(1, s.speed / 4.3);
  rig.phase += s.speed * dt * (s.crouch ? 3.4 : 2.4);
  const ph = rig.phase;
  const amp = moving * (s.sprint ? 1.2 : 0.85) * (s.crouch ? 0.55 : 1);
  const air = !s.onGround && !s.water;
  if (s.landed) rig.land = Math.max(rig.land, s.landed);
  rig.land = Math.max(0, rig.land - dt * 3.5);

  const lean = s.crouch ? 0.5 : s.sprint ? 0.28 * moving : 0.05 * moving;
  const hx = rig.go('hips.x', lean - s.hurt * 0.3 + rig.land * 0.25, 12, dt);
  rig.go('hips.z', 0, 8, dt);
  const bob = s.onGround ? Math.abs(Math.cos(ph)) * amp : 0;
  rig.go('hips.py', (s.crouch ? -1.5 : 0) - bob * 0.6 - rig.land * 2, 16, dt);
  rig.go('hips.pz', s.crouch ? 1 : 0, 14, dt);
  rig.go('legs.pz', s.crouch ? -2.5 : 0, 14, dt);

  let lr = Math.sin(ph) * 0.95 * amp;
  let ll = -lr;
  if (air) {
    lr = s.vy > 0 ? -0.55 : -0.2;
    ll = s.vy > 0 ? 0.4 : 0.3;
  } else if (s.water) {
    lr = Math.sin(rig.t * 7) * 0.45;
    ll = -lr;
  }
  const legK = air ? 10 : 24;
  rig.go('legR.x', lr, legK, dt);
  rig.go('legL.x', ll, legK, dt);
  rig.go('legR.z', air ? -0.06 : 0, 10, dt);
  rig.go('legL.z', air ? 0.06 : 0, 10, dt);

  // Arms blend between a relaxed low carry and a shouldered aim.
  const swing = Math.sin(ph) * amp;
  const aim = rig.go('aim', s.aim, 14, dt);
  const look = s.pitch;
  const aR = -Math.PI / 2 - look - hx - s.recoil * 0.35;
  const aL = aR + 0.1;
  let cR = -0.55 - hx * 0.5 - swing * 0.25;
  let cL = -0.95 - hx * 0.5 + swing * 0.25;
  if (s.sprint && moving > 0.5) {
    cR = -0.45 - swing * 0.7;
    cL = -0.9 + swing * 0.7;
  }
  let rX = lerp(cR, aR, aim);
  let lX = lerp(cL, aL, aim);
  const rY = lerp(0.25, 0.1, aim);
  let lY = lerp(-0.7, -0.5, aim);
  let rZ = 0;
  if (s.reload >= 0) {
    const w = Math.sin(Math.PI * s.reload);
    lX += 0.9 * w;
    lY -= 0.25 * w;
    rZ += 0.35 * w;
  }
  const br = Math.sin(rig.t * 1.7) * 0.025 * (1 - moving);
  rig.go('armR.x', rX + br, 20, dt);
  rig.go('armR.y', rY, 20, dt);
  rig.go('armR.z', rZ - 0.05 - br, 20, dt);
  rig.go('armL.x', lX - br, 20, dt);
  rig.go('armL.y', lY, 20, dt);
  rig.go('armL.z', 0.05 + br, 20, dt);
  rig.go('head.x', -look - hx, 30, dt);
  rig.go('head.y', 0, 10, dt);
  rig.go('head.z', 0, 10, dt);
  rig.apply();

  const root = rig.m.root;
  if (s.dead) {
    const d = Math.min(1, s.deadT / 0.5);
    const bounce = d >= 1 ? 0 : Math.sin(d * Math.PI) * 0.08;
    root.rotation.z = ease(d) * (Math.PI / 2) - bounce;
  } else {
    root.rotation.z = 0;
  }
}

// Shared bits for the humanoid mobs.
function lookAt(rig, s, dt, extraZ = 0) {
  const yaw = clamp(wrapAngle(s.lookYaw), -1.1, 1.1);
  rig.go('head.y', yaw, 10, dt);
  rig.go('head.x', -clamp(s.lookPitch, -0.6, 0.6) - rig.get('hips.x'), 10, dt);
  rig.go('head.z', extraZ, 6, dt);
}

// s: { speed, attack (-1 or 0..1), hurt, spawn (0..1), dead, deadT, lookYaw, lookPitch }
export function poseMoss(rig, s, dt) {
  rig.t += dt;
  rig.phase += s.speed * dt * 2.2;
  const ph = rig.phase;
  const amp = Math.min(1, s.speed / 3);
  let hx = 0.12 * amp - s.hurt * 0.5;
  let arms = -1.45 + Math.sin(rig.t * 2.7) * 0.06;
  let armK = 12;
  if (s.attack >= 0) {
    const a = s.attack;
    if (a < 0.4) {
      arms = -1.45 - 0.95 * ease(a / 0.4);
    } else {
      const k = ease(Math.min(1, (a - 0.4) / 0.25));
      arms = -2.4 + 1.55 * k;
      hx += 0.35 * Math.sin(Math.min(1, (a - 0.4) / 0.6) * Math.PI);
    }
    armK = 30;
  }
  if (s.spawn < 1) {
    arms = -2.8 + Math.sin(rig.t * 14) * 0.35;
    hx = -0.25;
    armK = 30;
  }
  if (s.dead) arms = -2.9;
  rig.go('hips.x', hx, 14, dt);
  rig.go('hips.z', Math.sin(ph) * 0.1 * amp, 10, dt);
  rig.go('hips.py', -Math.abs(Math.cos(ph)) * 0.6 * amp, 12, dt);
  const sway = Math.sin(ph) * 0.12 * amp;
  rig.go('armR.x', arms + sway, armK, dt);
  rig.go('armL.x', arms - sway, armK, dt);
  rig.go('armR.y', 0.08, 8, dt);
  rig.go('armL.y', -0.08, 8, dt);
  rig.go('armR.z', s.spawn < 1 ? Math.sin(rig.t * 11) * 0.2 : 0, 10, dt);
  rig.go('armL.z', s.spawn < 1 ? -Math.sin(rig.t * 11) * 0.2 : 0, 10, dt);
  const legs = Math.sin(ph) * 0.7 * amp;
  rig.go('legR.x', legs, 18, dt);
  rig.go('legL.x', -legs, 18, dt);
  lookAt(rig, s, dt, 0.18);
  rig.apply();
  // Falls flat on its back.
  const d = s.dead ? Math.min(1, s.deadT / 0.4) : 0;
  rig.m.root.rotation.x = -ease(d) * (Math.PI / 2);
}

// s: { speed, aiming, draw (0..1), fired (0..1), hurt, spawn, lookYaw, lookPitch }
export function poseBone(rig, s, dt) {
  rig.t += dt;
  rig.phase += s.speed * dt * 2.6;
  const ph = rig.phase;
  const amp = Math.min(1, s.speed / 3);
  const hx = rig.go('hips.x', 0.04 * amp - s.hurt * 0.4 - s.fired * 0.1, 14, dt);
  rig.go('hips.z', 0, 8, dt);
  rig.go('hips.py', -Math.abs(Math.cos(ph)) * 0.5 * amp, 12, dt);
  const legs = Math.sin(ph) * 0.8 * amp;
  rig.go('legR.x', legs, 20, dt);
  rig.go('legL.x', -legs, 20, dt);
  let rX = -legs * 0.8;
  let lX = legs * 0.8;
  let rY = 0;
  let lY = 0;
  if (s.aiming) {
    const pitch = s.lookPitch;
    rX = -Math.PI / 2 - pitch - hx - s.fired * 0.5;
    rY = 0.1;
    lX = -Math.PI / 2 - pitch - hx + 0.1 + s.draw * 0.35;
    lY = -0.45 - s.draw * 0.5;
  }
  if (s.spawn < 1) {
    rX = lX = -2.8 + Math.sin(rig.t * 18) * 0.4;
  }
  rig.go('armR.x', rX, 18, dt);
  rig.go('armL.x', lX, 18, dt);
  rig.go('armR.y', rY, 18, dt);
  rig.go('armL.y', lY, 18, dt);
  rig.go('armR.z', 0, 10, dt);
  rig.go('armL.z', 0, 10, dt);
  // Rattles when hit.
  lookAt(rig, s, dt, s.hurt > 0 ? (Math.random() - 0.5) * 0.6 * s.hurt : 0);
  rig.apply();
}
