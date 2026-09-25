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

// Step through [t, [a, b]] keyframes with easing.
function track2(keys, r) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (r <= t1) {
      const k = ease(Math.max(0, (r - t0) / Math.max(1e-6, t1 - t0)));
      return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
    }
  }
  return keys[keys.length - 1][1];
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
  let headDown = 0;
  let rYr = rY;
  if (s.reload >= 0) {
    // A real reload: gun tipped across the chest, left hand pulls the
    // magazine, reaches to the belt for a new one, slaps it in and racks.
    const r = s.reload;
    const hold = r < 0.1 ? ease(r / 0.1) : r > 0.9 ? ease((1 - r) / 0.1) : 1;
    rX = lerp(rX, -0.95, hold * 0.7);
    rYr = lerp(rY, 0.5, hold);
    rZ += 0.35 * hold;
    headDown = 0.35 * hold;
    const [kx, ky] = track2(
      [
        [0, [lX, lY]],
        [0.1, [-0.95, -0.55]],
        [0.28, [-0.35, -0.2]],
        [0.45, [-0.15, 0.15]],
        [0.55, [-0.2, 0.05]],
        [0.66, [-0.95, -0.55]],
        [0.72, [-1.05, -0.6]],
        [0.8, [-1.35, -0.85]],
        [0.86, [-1.15, -0.95]],
        [0.9, [-1.3, -0.85]],
        [1, [lX, lY]],
      ],
      r,
    );
    lX = kx;
    lY = ky;
  }
  const br = Math.sin(rig.t * 1.7) * 0.025 * (1 - moving);
  rig.go('armR.x', rX + br, 20, dt);
  rig.go('armR.y', rYr, 20, dt);
  rig.go('armR.z', rZ - 0.05 - br, 20, dt);
  rig.go('armL.x', lX - br, 20, dt);
  rig.go('armL.y', lY, 20, dt);
  rig.go('armL.z', 0.05 + br, 20, dt);
  rig.go('head.x', -look - hx + headDown, 30, dt);
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

// People in town (and police officers): a normal walk with the arms
// swinging, no gun. s: { speed, gesture, gT, pitch, down }
// gestures: 'phone' (calling someone), 'hands' (hands up), 'flee' (arms
// flailing while running away), 'wave', 'aim' (pointing a pistol),
// 'grab' (reaching out to grab you), 'point'.
export function poseCivilian(rig, s, dt) {
  rig.t += dt;
  const run = s.speed > 3.4;
  const moving = Math.min(1, s.speed / 4);
  rig.phase += s.speed * dt * (run ? 2.1 : 2.6);
  const ph = rig.phase;
  const amp = moving * (run ? 1.15 : 0.75);
  const hx = rig.go('hips.x', run ? 0.2 * moving : 0.03 * moving, 12, dt);
  rig.go('hips.y', 0, 8, dt);
  rig.go('hips.z', 0, 8, dt);
  const bob = Math.abs(Math.cos(ph)) * amp;
  rig.go('hips.py', -bob * 0.6, 16, dt);
  rig.go('hips.pz', 0, 14, dt);
  rig.go('legs.pz', 0, 14, dt);
  const lr = Math.sin(ph) * 0.9 * amp;
  rig.go('legR.x', lr, 24, dt);
  rig.go('legL.x', -lr, 24, dt);
  rig.go('legR.z', 0, 10, dt);
  rig.go('legL.z', 0, 10, dt);
  // Arms swing opposite to the legs and hang loose when standing.
  const sw = Math.sin(ph) * amp * (run ? 1.1 : 0.8);
  const idle = Math.sin(rig.t * 1.6) * 0.03 * (1 - moving);
  let rX = -sw - hx * 0.4 + idle;
  let lX = sw - hx * 0.4 - idle;
  let rY = 0;
  let lY = 0;
  let rZ = 0.05;
  let lZ = -0.05;
  let headX = -hx;
  let headY = 0;
  let headZ = 0;
  const t = s.gT || 0;
  switch (s.gesture) {
    case 'phone':
      // Phone to the right ear, head tipped towards it.
      rX = -2.3;
      rY = -0.35;
      rZ = 0.62;
      headZ = 0.14;
      headY = Math.sin(rig.t * 1.3) * 0.15;
      lX = -0.3 + Math.sin(rig.t * 2) * 0.1;
      lZ = -0.15;
      break;
    case 'hands':
      rX = -0.2;
      rZ = -2.7 + Math.sin(rig.t * 9) * 0.08;
      lX = -0.2;
      lZ = 2.7 - Math.sin(rig.t * 9) * 0.08;
      headX = -0.15;
      break;
    case 'flee':
      rX = -2.6 + Math.sin(rig.t * 14) * 0.4;
      lX = -2.6 - Math.sin(rig.t * 14) * 0.4;
      rZ = -0.3;
      lZ = 0.3;
      break;
    case 'wave':
      rX = 0;
      rZ = -2.6 + Math.sin(t * 10) * 0.35;
      headZ = 0.1;
      break;
    case 'aim': {
      // Two hands on a pistol, pointed where they look.
      const p = s.pitch || 0;
      rX = -Math.PI / 2 - p;
      rY = 0.12;
      rZ = 0;
      lX = -Math.PI / 2 - p + 0.05;
      lY = -0.55;
      lZ = 0;
      headX = -p;
      break;
    }
    case 'grab':
      rX = -1.45 + Math.sin(rig.t * 12) * 0.12;
      lX = -1.45 - Math.sin(rig.t * 12) * 0.12;
      rY = 0.25;
      lY = -0.25;
      break;
    case 'point':
      rX = -1.6;
      rY = 0.1;
      break;
    default:
      break;
  }
  rig.go('armR.x', rX, 16, dt);
  rig.go('armR.y', rY, 16, dt);
  rig.go('armR.z', rZ, 16, dt);
  rig.go('armL.x', lX, 16, dt);
  rig.go('armL.y', lY, 16, dt);
  rig.go('armL.z', lZ, 16, dt);
  rig.go('head.x', headX, 12, dt);
  rig.go('head.y', headY, 10, dt);
  rig.go('head.z', headZ, 10, dt);
  rig.apply();
  // Knocked flat on their back.
  const d = s.down || 0;
  const root = rig.m.root;
  root.rotation.x = -ease(Math.min(1, d)) * (Math.PI / 2);
  root.rotation.z = 0;
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
