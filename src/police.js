import * as THREE from 'three';
import { $ } from './util.js';
import { buildHumanoid, PX } from './model.js';
import { Rig, poseCivilian } from './anim.js';
import { makeSkinTexture, paintOutfit, randomOutfit, faceRects } from './skin.js';
import { mulberry32 } from './rng.js';
import { moveEntity } from './physics.js';
import { rayBox } from './mob.js';
import { GY, ROADS, LANE } from './city.js';
import { SEA } from './world.js';
import { addPhone } from './townsfolk.js';

// The Blockton Police Department. Wreck cars, attack the police or point a
// gun at someone (they'll ring 5-0-5-0) and you get wanted stars. The more
// stars, the more cops: police cars chase you with their sirens on,
// officers jump out and run after you, at three stars they shoot back, and
// at four the helicopter comes out. Get out of sight long enough and they
// give up. Get caught standing still and you're BUSTED.

export const POLICE_NUMBER = '5-0-5-0';
const MAX_STARS = 5;
const UNITS = [0, 1, 2, 3, 3, 4];
const SIGHT = 34;

const STREETS_X = ['1st Street', '2nd Street', '3rd Street', '4th Street', '5th Street', '6th Street'];
const STREETS_Z = ['Maple Avenue', 'Oak Avenue', 'Pine Avenue', 'Cedar Avenue', 'Birch Avenue', 'Willow Avenue'];

// The street name nearest to (x, z), for the police radio.
export function streetAt(x, z) {
  let best = '';
  let bd = Infinity;
  ROADS.forEach((r, i) => {
    const dz = Math.abs(z - r - 0.5);
    if (dz < bd) {
      bd = dz;
      best = STREETS_X[i];
    }
    const dx = Math.abs(x - r - 0.5);
    if (dx < bd) {
      bd = dx;
      best = STREETS_Z[i];
    }
  });
  return best;
}

// North is up on the map (towards z = 0).
function heading(vx, vz) {
  if (Math.hypot(vx, vz) < 1) return null;
  if (Math.abs(vx) > Math.abs(vz)) return vx > 0 ? 'east' : 'west';
  return vz > 0 ? 'south' : 'north';
}

// A police uniform: navy shirt and tie, badge, belt and a peaked cap.
function paintOfficer(canvas, seed) {
  const rng = mulberry32(seed);
  const o = randomOutfit(rng);
  o.top = '#22375e';
  o.topStyle = 'jacket';
  o.pants = '#1a2031';
  o.shoes = '#141414';
  o.hairStyle = 'short';
  paintOutfit(canvas, o, false, seed);
  const ctx = canvas.getContext('2d');
  const px = (x, y, c, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  // Shirt front: tie, badge, pocket flaps and belt.
  const B = faceRects(16, 16, 8, 12, 4);
  const [bx, by] = B.front;
  px(bx + 3, by + 1, '#141a2a', 2, 6);
  px(bx + 5, by + 2, '#ffd23f', 2, 2);
  px(bx + 6, by + 3, '#c89a1a');
  px(bx + 1, by + 3, '#1a2c4c', 2, 1);
  px(B.front[0] - 4, by + 9, '#101010', 24, 1);
  px(bx + 3, by + 9, '#d8b848', 2, 1);
  // Shoulder patches.
  for (const part of [[40, 16], [32, 48]]) {
    const A = faceRects(part[0], part[1], 4, 12, 4);
    px(A.right[0], A.right[1] + 1, '#ffd23f', 4, 2);
    px(A.left[0], A.left[1] + 1, '#ffd23f', 4, 2);
  }
  // The cap, on the outer head layer.
  const H = faceRects(32, 0, 8, 8, 8);
  px(H.top[0], H.top[1], '#1e2f52', 8, 8);
  for (const k of ['front', 'back', 'left', 'right']) {
    const [x, y, w] = H[k];
    px(x, y, '#1e2f52', w, 2);
    px(x, y + 2, '#111111', w, 1);
  }
  px(H.front[0] + 3, H.front[1] + 1, '#ffd23f', 2, 1);
}

let starTex = null;
function dizzyTexture() {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffe14a';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 6 : 14;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  starTex = new THREE.CanvasTexture(c);
  return starTex;
}

const PISTOL_GEO = [new THREE.BoxGeometry(0.08, 0.12, 0.32), new THREE.BoxGeometry(0.07, 0.17, 0.08)];
const PISTOL_MAT = new THREE.MeshLambertMaterial({ color: '#23252a' });
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
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

// --- Officers ------------------------------------------------------------------

class Officer {
  constructor(police, unit, seed) {
    this.police = police;
    this.game = police.game;
    this.unit = unit;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 64;
    paintOfficer(this.canvas, seed);
    this.texture = makeSkinTexture(this.canvas);
    this.model = buildHumanoid(this.texture);
    this.rig = new Rig(this.model);
    // A pistol in the right hand, a radio... and a phone, of course.
    const gun = new THREE.Group();
    const slide = new THREE.Mesh(PISTOL_GEO[0], PISTOL_MAT);
    slide.position.set(0, 0, 0.06);
    const grip = new THREE.Mesh(PISTOL_GEO[1], PISTOL_MAT);
    grip.position.set(0, -0.08, 0);
    gun.add(slide, grip);
    gun.position.set(0, -11.2 * PX, 1.2 * PX);
    gun.rotation.x = -Math.PI / 2;
    this.model.parts.armR.add(gun);
    this.gun = gun;
    addPhone(this.model);
    this.game.scene.add(this.model.root);
    this.dizzy = [0, 1, 2].map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dizzyTexture(), depthWrite: false }));
      s.scale.set(0.22, 0.22, 1);
      s.visible = false;
      this.game.scene.add(s);
      return s;
    });
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hw = 0.3;
    this.h = 1.8;
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 12;
    this.state = 'ride';
    this.downT = 0;
    this.hurtT = 0;
    this.aimT = 0;
    this.shootCd = 1 + Math.random();
    this.jumpCd = 0;
    this.speed = 0;
    this.onGround = true;
    this.model.root.visible = false;
  }

  get riding() {
    return this.state === 'ride';
  }

  get active() {
    return this.state === 'chase' || this.state === 'return';
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.model.root);
    this.model.dispose();
    this.texture.dispose();
    for (const d of this.dizzy) {
      s.remove(d);
      d.material.dispose();
    }
  }

  // Hop out of the car on one side.
  getOut(side) {
    const c = this.unit.car;
    const s = Math.sin(c.yaw);
    const co = Math.cos(c.yaw);
    const off = c.def.wid / 2 + 0.6;
    this.pos.set(c.pos.x + co * off * side, c.pos.y, c.pos.z - s * off * side);
    this.vel.set(0, 0, 0);
    this.yaw = c.yaw;
    this.state = 'chase';
    this.model.root.visible = true;
  }

  hitTest(o, d, maxT) {
    if (this.riding) return null;
    const p = this.pos;
    if (this.state === 'down') {
      // Lying on the ground.
      const t = rayBox(o, d, p.x - 0.9, p.y, p.z - 0.9, p.x + 0.9, p.y + 0.45, p.z + 0.9);
      return t >= 0 && t < maxT ? { t, head: false } : null;
    }
    const tb = rayBox(o, d, p.x - 0.36, p.y, p.z - 0.36, p.x + 0.36, p.y + 1.36, p.z + 0.36);
    const th = rayBox(o, d, p.x - 0.3, p.y + 1.36, p.z - 0.3, p.x + 0.3, p.y + 1.9, p.z + 0.3);
    const okB = tb >= 0 && tb < maxT;
    const okH = th >= 0 && th < maxT;
    if (okH && (!okB || th <= tb)) return { t: th, head: true };
    if (okB) return { t: tb, head: false };
    return null;
  }

  damage(n, byPlayer = true) {
    if (this.state === 'down' || this.riding) return;
    this.hp -= n;
    this.hurtT = 0.2;
    this.aimT = 0;
    if (byPlayer) this.police.crime('shootCop');
    if (this.hp <= 0) this.knockOut(byPlayer);
    else this.game.sound.hurt();
  }

  // Knocked flat, seeing stars. They get up again later.
  knockOut(byPlayer) {
    this.state = 'down';
    this.downT = 0;
    this.hp = 0;
    this.game.sound.landThud(0.7);
    if (byPlayer) this.police.crime('copDown');
  }

  // A car ran into us.
  runOver(car) {
    if (this.state === 'down' || this.riding) return;
    const f = car.forward(v1);
    this.vel.set(f.x * Math.abs(car.speed) * 0.5, 5, f.z * Math.abs(car.speed) * 0.5);
    this.knockOut(car.driver === 'player');
  }

  // Aim and fire the pistol at you.
  shoot() {
    const g = this.game;
    const p = g.player;
    const pol = this.police;
    const from = v1.set(this.pos.x, this.pos.y + 1.35, this.pos.z);
    const at = v2.set(p.pos.x, p.pos.y + (p.driving ? 0.8 : 1.1), p.pos.z);
    const dist = from.distanceTo(at);
    const fast = p.driving ? Math.abs(p.driving.speed) : Math.hypot(p.vel.x, p.vel.z);
    const dodge = g.adventure && g.adventure.webs.dodging ? 0.35 : 1;
    const chance = (0.5 - dist * 0.012 - fast * 0.015 + (pol.stars >= 5 ? 0.1 : 0)) * dodge;
    const hit = Math.random() < chance;
    if (!hit) at.add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.3) * 1.5, (Math.random() - 0.5) * 2.4));
    // Muzzle roughly at the hand.
    const muzzle = from.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 0.5 - Math.cos(this.yaw) * 0.2, 0.05, Math.cos(this.yaw) * 0.5 + Math.sin(this.yaw) * 0.2));
    g.tracers.fire(muzzle, at.clone(), 0xffe08a, 0.03);
    g.sound.gunshot('pistol', false, Math.max(0.15, 1 - dist / 40));
    if (hit) p.hurt(1, from.clone(), 'police');
    this.shootCd = 1.1 + Math.random() * 0.8 - (pol.stars >= 5 ? 0.3 : 0);
  }

  // Follow the flow field (the same one mobs use) towards you.
  pathStep() {
    const f = this.game.mobs.flow;
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
    if (!bx && !bz) return null;
    const tx = cx + bx + 0.5 - this.pos.x;
    const tz = cz + bz + 0.5 - this.pos.z;
    const l = Math.hypot(tx, tz) || 1;
    return { x: tx / l, z: tz / l, stand: f.standAt(cx + bx, cz + bz) };
  }

  update(dt) {
    const g = this.game;
    const pol = this.police;
    const p = g.player;
    this.hurtT -= dt;
    this.shootCd -= dt;
    this.jumpCd -= dt;
    if (this.riding) {
      const c = this.unit.car;
      if (c) this.pos.copy(c.pos);
      this.model.root.visible = false;
      return;
    }
    // Webbed up: stuck, wriggling.
    if (this.webT > 0 && this.state !== 'down') {
      this.webT -= dt;
      this.vel.set(0, this.vel.y, 0);
      this.speed = 0;
      this.sync(dt, 'hands');
      for (const mat of this.model.materials) mat.emissive.setRGB(0.4, 0.4, 0.38);
      return;
    }
    let wx = 0;
    let wz = 0;
    let speed = 0;
    let gesture = null;
    if (this.state === 'down') {
      this.downT += dt;
      if (this.downT > 14) {
        this.state = pol.stars > 0 ? 'chase' : 'return';
        this.hp = 8;
      }
    } else {
      const target = pol.seen ? p.pos : pol.lastKnown;
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (pol.stars === 0 && this.state === 'chase') this.state = 'return';
      if (this.state === 'return') {
        const c = this.unit.car;
        if (c && !c.dead) {
          const cx = c.pos.x - this.pos.x;
          const cz = c.pos.z - this.pos.z;
          const cd = Math.hypot(cx, cz);
          if (cd < c.def.wid / 2 + 1) {
            this.state = 'ride';
            this.model.root.visible = false;
            return;
          }
          wx = cx / cd;
          wz = cz / cd;
          speed = 3;
          if (pol.stars > 0 && pol.seen && dist < 20) this.state = 'chase';
        } else {
          this.state = 'walk';
        }
      } else if (this.state === 'walk') {
        // No car left: stroll off. They're removed once you can't see them.
        wx = Math.sin(this.yaw);
        wz = Math.cos(this.yaw);
        speed = 1.6;
        if (pol.stars > 0) this.state = 'chase';
      } else {
        // Chasing you.
        const shootRange = pol.stars >= 3 && pol.seen && dist < 24 && dist > 3.5 && pol.lineOfSight(this.pos, 1.5);
        if (shootRange && (this.aimT > 0 || Math.random() < dt * 0.9)) {
          this.aimT += dt;
          // Spider-sense tingles just before they fire.
          if (this.aimT > 0.2 && !this.sensed) {
            this.sensed = true;
            if (g.adventure) g.adventure.webs.sense(this.pos);
          }
          gesture = 'aim';
          this.yaw = Math.atan2(dx, dz);
          this.pitch = Math.atan2(p.pos.y - this.pos.y, dist);
          if (this.aimT > 0.55 && this.shootCd <= 0) this.shoot();
          if (this.aimT > 2.6) this.aimT = 0;
        } else {
          this.aimT = 0;
          this.sensed = false;
          const step = dist > 2.5 && pol.seen ? this.pathStep() : null;
          if (!pol.seen && dist < 2) {
            // Nobody here: look around.
            if (!this.lookT || this.lookT <= 0) {
              this.lookT = 1.5 + Math.random() * 2;
              this.lookDir = Math.random() * Math.PI * 2;
            }
            this.lookT -= dt;
            wx = Math.sin(this.lookDir);
            wz = Math.cos(this.lookDir);
            speed = 2;
          } else if (step) {
            wx = step.x;
            wz = step.z;
            this.nextStand = step.stand;
          } else if (dist > 0.9) {
            wx = dx / dist;
            wz = dz / dist;
          }
          if (pol.seen || dist >= 2) speed = dist > 1.2 ? 5.2 : 0;
          if (dist < 3 && pol.seen) gesture = 'grab';
        }
      }
    }
    // Move like the mobs do.
    const k = Math.min(1, (this.onGround ? 12 : 3) * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    const inWater = this.pos.y < SEA - 0.4;
    this.vel.y = Math.max(this.vel.y - (inWater ? 12 : 30) * dt, inWater ? -2.5 : -40);
    if (inWater && speed) this.vel.y = Math.min(this.vel.y + 26 * dt, 3);
    moveEntity(g.world, this, dt);
    const wantsUp = (this.nextStand || 0) > Math.floor(this.pos.y + 0.01);
    if (this.onGround && this.jumpCd <= 0 && speed && (this.hitX || this.hitZ || wantsUp)) {
      this.vel.y = 8.8;
      this.jumpCd = 0.4;
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3 && gesture !== 'aim' && this.state !== 'down') {
      let d = Math.atan2(this.vel.x, this.vel.z) - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 10);
    }
    this.speed = this.state === 'down' ? 0 : hs;
    this.sync(dt, gesture);
  }

  sync(dt, gesture) {
    const m = this.model;
    m.root.visible = !this.riding;
    const down = this.state === 'down' ? Math.min(1, this.downT / 0.35) : 0;
    m.root.position.set(this.pos.x, this.pos.y + down * 0.13, this.pos.z);
    m.root.rotation.y = this.yaw;
    poseCivilian(this.rig, { speed: this.speed, gesture, pitch: this.pitch, down }, dt);
    this.gun.visible = gesture === 'aim';
    const flash = this.hurtT > 0 ? 0.6 : 0;
    for (const mat of m.materials) mat.emissive.setRGB(flash, 0.05 * flash, 0.03 * flash);
    // Dizzy stars going round their head.
    const t = performance.now() / 1000;
    this.dizzy.forEach((s, i) => {
      s.visible = this.state === 'down' && this.downT > 0.4;
      if (!s.visible) return;
      const a = t * 3 + (i * Math.PI * 2) / 3;
      // The head is behind the feet when lying on your back.
      const hx = this.pos.x - Math.sin(this.yaw) * 1.5;
      const hz = this.pos.z - Math.cos(this.yaw) * 1.5;
      s.position.set(hx + Math.cos(a) * 0.35, this.pos.y + 0.55, hz + Math.sin(a) * 0.35);
    });
  }
}

// --- Units: one police car and two officers ------------------------------------

class Unit {
  constructor(police, car) {
    this.police = police;
    this.car = car;
    this.mode = 'drive';
    this.stuckT = 0;
    this.revT = 0;
    this.pathT = 0;
    this.waypoint = null;
    this.officers = [new Officer(police, this, (Math.random() * 1e9) | 0), new Officer(police, this, (Math.random() * 1e9) | 0)];
    for (const o of this.officers) o.pos.copy(car.pos);
    car.driver = 'cop';
    car.unit = this;
    car.sirenOn = true;
    car.ai = null;
  }

  get riding() {
    return this.officers.filter((o) => o.riding).length;
  }

  deploy() {
    if (this.mode === 'deployed' || !this.car) return;
    this.mode = 'deployed';
    this.bestD = undefined;
    this.noProg = 0;
    this.officers.forEach((o, i) => {
      if (o.riding) o.getOut(i === 0 ? 1 : -1);
    });
    this.police.game.sound.clank(0.4);
  }

  dispose() {
    for (const o of this.officers) o.dispose();
    this.officers = [];
    if (this.car) {
      this.car.unit = null;
      if (this.car.driver === 'cop') this.car.driver = null;
    }
  }
}

// --- The helicopter ---------------------------------------------------------------

function textTexture(text, bg, fg, w = 128, h = 32) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `700 ${Math.floor(h * 0.7)}px 'Pixelify Sans', ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Heli {
  constructor(police) {
    this.police = police;
    this.game = police.game;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mats = [];
    const mat = (c, basic = false) => {
      const m = basic ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c });
      mats.push(m);
      return m;
    };
    const geos = [];
    const box = (w, h, d, x, y, z, m, parent = body) => {
      const g = new THREE.BoxGeometry(w, h, d);
      geos.push(g);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const navy = mat('#1e3160');
    const white = mat('#eef0f2');
    const dark = mat('#26282c');
    const glass = mat('#2a4a66');
    box(1.7, 1.4, 3, 0, 0, 0, navy);
    box(1.72, 0.35, 3.02, 0, -0.3, 0, white);
    box(1.5, 1.1, 0.9, 0, 0.05, 1.8, glass);
    box(1.3, 0.5, 0.6, 0, -0.35, 2.2, navy);
    box(0.45, 0.45, 3.6, 0, 0.25, -3.1, navy);
    box(0.12, 1.1, 0.7, 0, 0.8, -4.7, navy);
    box(1.2, 0.1, 0.4, 0, 0.35, -4.5, white);
    const label = new THREE.MeshBasicMaterial({ map: textTexture('POLICE', '#1e3160', '#ffffff') });
    mats.push(label);
    for (const s of [-1, 1]) {
      const side = box(0.02, 0.35, 1.6, s * 0.87, 0.3, -0.2, label);
      side.rotation.y = s > 0 ? 0 : Math.PI;
      // Skids.
      box(0.1, 0.1, 3, s * 0.75, -1.15, 0.1, dark);
      box(0.08, 0.45, 0.08, s * 0.75, -0.9, 0.9, dark);
      box(0.08, 0.45, 0.08, s * 0.75, -0.9, -0.7, dark);
    }
    box(0.2, 0.35, 0.2, 0, 0.85, 0, dark);
    const rotor = new THREE.Group();
    rotor.position.set(0, 1.05, 0);
    body.add(rotor);
    box(8, 0.06, 0.32, 0, 0, 0, dark, rotor);
    box(0.32, 0.06, 8, 0, 0, 0, dark, rotor);
    const tail = new THREE.Group();
    tail.position.set(0.12, 0.8, -4.7);
    body.add(tail);
    box(0.04, 1.4, 0.16, 0, 0, 0, dark, tail);
    // Red and blue lights, and the searchlight.
    this.red = box(0.18, 0.12, 0.18, -0.5, -0.6, 1.2, mat('#ff2a2a', true));
    this.blue = box(0.18, 0.12, 0.18, 0.5, -0.6, 1.2, mat('#2a6aff', true));
    box(0.3, 0.3, 0.3, 0, -0.75, 1.8, mat('#fff6d0', true));
    const coneGeo = new THREE.ConeGeometry(2.6, 1, 16, 1, true);
    coneGeo.translate(0, -0.5, 0);
    geos.push(coneGeo);
    this.beam = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    mats.push(this.beam.material);
    this.game.scene.add(this.beam);
    this.root = root;
    this.body = body;
    this.rotor = rotor;
    this.tail = tail;
    this.mats = mats;
    this.geos = geos;
    this.game.scene.add(root);
    const p = this.game.player.pos;
    const a = Math.random() * Math.PI * 2;
    this.pos = new THREE.Vector3(p.x + Math.cos(a) * 70, 34, p.z + Math.sin(a) * 70);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.orbit = a;
    this.hp = 260;
    this.dead = false;
    this.fallT = 0;
    this.gone = false;
    this.shootCd = 3;
    this.hurtT = 0;
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.root);
    s.remove(this.beam);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  }

  hitTest(o, d, maxT) {
    if (this.gone) return null;
    const p = this.pos;
    const t = rayBox(o, d, p.x - 1.6, p.y - 1.2, p.z - 1.6, p.x + 1.6, p.y + 1.1, p.z + 1.6);
    return t >= 0 && t < maxT ? t : null;
  }

  damage(n) {
    if (this.dead) return;
    this.hp -= n;
    this.hurtT = 0.12;
    this.police.crime('shootCop');
    if (this.hp <= 0) {
      this.dead = true;
      this.police.crime('heliDown');
      this.game.hud.feed('Dispatch: Air unit going down! Air unit going down!', 'bad');
      this.game.sound.explosion(0.8);
    }
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const pol = this.police;
    const t = performance.now() / 1000;
    this.rotor.rotation.y += dt * (this.dead ? 14 : 26);
    this.tail.rotation.x += dt * 30;
    this.hurtT -= dt;
    const blink = Math.floor(t * 3) % 2;
    this.red.visible = blink === 0;
    this.blue.visible = blink === 1;
    if (this.dead) {
      // Spinning down in flames.
      this.fallT += dt;
      this.vel.y -= 14 * dt;
      this.yaw += dt * 5;
      this.pos.addScaledVector(this.vel, dt);
      if (Math.random() < dt * 30) g.fx.burst(this.pos.x, this.pos.y, this.pos.z, pol.fire, 2, { speed: 1, size: 0.3, up: 2, life: 1, spread: 0.5, grav: -2 });
      const ground = pol.adv.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
      if (this.pos.y - 1.2 <= ground || this.fallT > 6) {
        g.combat.explode(new THREE.Vector3(this.pos.x, ground + 1, this.pos.z), 4.5, 24, { local: true });
        g.fx.burst(this.pos.x, ground + 1, this.pos.z, pol.fire, 60, { speed: 8, size: 0.25, up: 5, life: 1.5, spread: 1 });
        this.gone = true;
      }
    } else {
      // Circle high over you (or where you were last seen).
      const leaving = pol.stars < 4;
      const target = pol.seen ? p.pos : pol.lastKnown;
      this.orbit += dt * 0.25;
      const r = leaving ? 120 : 13;
      const want = v1.set(target.x + Math.cos(this.orbit) * r, target.y + (leaving ? 40 : 17), target.z + Math.sin(this.orbit) * r);
      const to = want.sub(this.pos);
      const len = to.length();
      const maxV = leaving ? 18 : 14;
      if (len > 0.01) to.multiplyScalar(Math.min(maxV, len * 0.8) / len);
      this.vel.lerp(to, Math.min(1, dt * 1.5));
      this.pos.addScaledVector(this.vel, dt);
      const face = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
      let d = face - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 1.5);
      if (leaving && Math.hypot(this.pos.x - p.pos.x, this.pos.z - p.pos.z) > 100) this.gone = true;
      // The marksman at five stars.
      this.shootCd -= dt;
      if (pol.stars >= 5 && pol.seen && this.shootCd <= 0) {
        this.shootCd = 2.2 + Math.random();
        const from = this.pos.clone().add(new THREE.Vector3(0, -0.8, 0));
        const at = p.pos.clone().add(new THREE.Vector3(0, 1, 0));
        const webs = g.adventure && g.adventure.webs;
        if (webs) webs.sense(this.pos);
        const hit = Math.random() < 0.35 * (webs && webs.dodging ? 0.35 : 1);
        if (!hit) at.add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
        g.tracers.fire(from, at, 0xffe08a, 0.03);
        g.sound.gunshot('rifle', false, 0.4);
        if (hit) p.hurt(1, from, 'police');
      }
    }
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    // Tilt into the direction of travel.
    const fwd = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    const side = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    this.body.rotation.set(Math.max(-0.35, Math.min(0.35, fwd * 0.025)), 0, Math.max(-0.3, Math.min(0.3, -side * 0.02)));
    // The searchlight points at you. Brighter at night.
    const b = this.beam;
    b.visible = !this.dead && pol.stars >= 4;
    if (b.visible) {
      const target = pol.seen ? p.pos : pol.lastKnown;
      const from = v1.set(this.pos.x, this.pos.y - 0.8, this.pos.z);
      const to = v2.set(target.x, target.y, target.z);
      const len = from.distanceTo(to);
      b.position.copy(from);
      b.scale.set(1, len, 1);
      b.lookAt(to);
      b.rotateX(-Math.PI / 2);
      b.material.opacity = g.sky.isNight() ? 0.2 : 0.06;
    }
  }
}

// --- The police department ----------------------------------------------------

export class Police {
  constructor(adv) {
    this.adv = adv;
    this.game = adv.game;
    this.stars = 0;
    this.units = [];
    this.heli = null;
    this.seen = false;
    this.seenT = 0;
    this.lastKnown = new THREE.Vector3();
    this.lookT = 0;
    this.spawnT = 0;
    this.bustT = 0;
    this.calls = [];
    this.copHitT = 0;
    this.radioT = 0;
    this.lastCall = null;
    this.searching = false;
    this.fire = ['#ffd84a', '#ff7a2f', '#3a3530'].map((c) => new THREE.Color(c));
    this.renderHud();
  }

  dispose() {
    for (const u of this.units) u.dispose();
    this.units = [];
    if (this.heli) this.heli.dispose();
    this.heli = null;
    this.game.sound.copSiren(0);
    this.game.sound.heli(0);
    this.stars = 0;
    this.renderHud();
    const ph = $('#phone');
    if (ph) ph.hidden = true;
  }

  // Busted, wasted or quit: call everyone off at once.
  reset() {
    for (const u of this.units) {
      const c = u.car;
      u.dispose();
      if (c && !c.dead) this.adv.removeCar(c);
    }
    this.units = [];
    if (this.heli) this.heli.dispose();
    this.heli = null;
    this.stars = 0;
    this.bustT = 0;
    this.game.sound.copSiren(0);
    this.game.sound.heli(0);
    this.renderHud();
  }

  officers() {
    const out = [];
    for (const u of this.units) for (const o of u.officers) if (!o.riding) out.push(o);
    return out;
  }

  // --- Crimes ---

  crime(kind) {
    const g = this.game;
    const p = g.player.pos;
    const before = this.stars;
    let s = this.stars;
    let msg = '';
    const where = streetAt(p.x, p.z);
    switch (kind) {
      case 'call':
        s = Math.max(s, 1);
        msg = `Report of a gun on ${where}. Units respond.`;
        break;
      case 'wreck':
        s += 1;
        msg = `Car wrecked on ${where}!`;
        break;
      case 'wreckCop':
        s += 2;
        msg = `Officer down! A police car was destroyed on ${where}!`;
        break;
      case 'stealCop':
        s = Math.max(s + 1, 2);
        msg = 'The suspect stole a police car!';
        break;
      case 'shootCop':
        // Only counts once every few seconds, or one burst would max it out.
        if (this.copHitT > 0) return;
        this.copHitT = 6;
        s = Math.max(s, 2);
        msg = 'Shots fired at officers! All units!';
        break;
      case 'copDown':
        s += 1;
        msg = 'Officer knocked out! Requesting backup!';
        break;
      case 'heliDown':
        s += 1;
        break;
      default:
        return;
    }
    this.stars = Math.min(MAX_STARS, s);
    this.seenT = 0;
    this.lastKnown.copy(p);
    if (this.stars > before) {
      g.sound.chirp();
      const pop = $('#wanted');
      pop.classList.remove('bump');
      void pop.offsetWidth;
      pop.classList.add('bump');
      if (this.stars >= 4 && before < 4) msg += ' Send in the helicopter!';
    }
    if (msg) g.hud.feed(`Dispatch: ${msg}`, 'bad');
    this.renderHud();
  }

  // Someone got their phone out.
  onCallStart(person) {
    this.calls = this.calls.filter((c) => c !== person);
    this.calls.push(person);
    this.game.sound.dial();
  }

  // ...and got through.
  onCallDone(person) {
    this.calls = this.calls.filter((c) => c !== person);
    this.crime('call');
    const ph = $('#phone');
    this.lastCall = { person, t: 3.2 };
    ph.dataset.stage = 'talk';
  }

  // --- Every frame ---

  update(dt) {
    const g = this.game;
    const p = g.player;
    this.copHitT -= dt;
    this.radioT = Math.max(0, this.radioT - dt);
    this.updatePhone(dt);
    // Who can see you?
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 0.25;
      this.seen = this.stars > 0 && this.canSee();
    }
    if (this.stars > 0) {
      if (this.seen) {
        this.seenT = 0;
        this.lastKnown.copy(p.pos);
      } else {
        // The clock only runs while they're looking for you where you were
        // last seen (or once you're long gone), not while they drive over.
        this.searching = this.isSearching();
        if (this.searching || p.pos.distanceTo(this.lastKnown) > 70) this.seenT += dt;
        // Out of sight long enough: they give up.
        if (this.seenT > this.escapeTime()) {
          this.stars = 0;
          g.hud.showBanner('You lost the cops!', 'Wanted level cleared', 2.5);
          g.hud.feed('Dispatch: We lost the suspect. All units, stand down.', '');
          g.progress.addXp(50);
          g.sound.powerup();
        }
      }
    }
    // Send units, and the helicopter at four stars.
    this.spawnT -= dt;
    const active = this.units.filter((u) => u.car && !u.car.dead && u.mode !== 'leave').length;
    if (this.stars > 0 && active < UNITS[this.stars] && this.spawnT <= 0) {
      this.spawnT = 3;
      this.sendUnit();
    }
    if (this.stars >= 4 && !this.heli) {
      this.heli = new Heli(this);
    }
    if (this.heli) {
      this.heli.update(dt);
      if (this.heli.gone) {
        this.heli.dispose();
        this.heli = null;
      }
    }
    for (const u of this.units) {
      for (const o of u.officers) o.update(dt);
      // Everyone back in the car when it's over: drive off.
      if (this.stars === 0 && u.mode !== 'leave' && u.car && !u.car.dead && u.riding === u.officers.length) u.mode = 'leave';
    }
    this.cleanup();
    this.updateBust(dt);
    this.updateSounds();
    this.renderHud();
  }

  isSearching() {
    if (this.heli && !this.heli.dead) return true;
    const k = this.lastKnown;
    for (const u of this.units) {
      if (u.car && !u.car.dead && u.car.pos.distanceTo(k) < 26) return true;
      for (const o of u.officers) if (!o.riding && o.pos.distanceTo(k) < 20) return true;
    }
    return false;
  }

  escapeTime() {
    return 9 + this.stars * 3;
  }

  // Is any cop close enough, with nothing in the way?
  canSee() {
    const p = this.game.player.pos;
    if (this.heli && !this.heli.dead && this.stars >= 4 && Math.hypot(this.heli.pos.x - p.x, this.heli.pos.z - p.z) < 45) return true;
    for (const u of this.units) {
      if (u.car && !u.car.dead && u.car.pos.distanceTo(p) < SIGHT && this.lineOfSight(u.car.pos, 1.2)) return true;
      for (const o of u.officers) if (!o.riding && o.state !== 'down' && o.pos.distanceTo(p) < SIGHT && this.lineOfSight(o.pos, 1.6)) return true;
    }
    return false;
  }

  lineOfSight(from, h) {
    const p = this.game.player.pos;
    const a = v1.set(from.x, from.y + h, from.z);
    const b = v2.set(p.x, p.y + 1.5, p.z);
    const d = b.sub(a);
    const len = d.length();
    if (len < 0.5) return true;
    d.divideScalar(len);
    return !this.game.world.raycast(a.x, a.y, a.z, d.x, d.y, d.z, len);
  }

  // A new police car on a road out of sight, heading your way.
  sendUnit() {
    const adv = this.adv;
    const p = this.game.player.pos;
    // A police car already out on patrol nearby joins in first.
    const patrol = adv.cars.find((c) => c.type === 'police' && c.driver === 'ai' && !c.dead && c.pos.distanceTo(p) < 60);
    let car = patrol;
    if (!car) {
      let spot = null;
      for (let k = 0; k < 20; k++) {
        const r = adv.traffic.randomSpot();
        const d = Math.hypot(r.x - p.x, r.z - p.z);
        if (d < 32 || d > 75) continue;
        // Pointing your way, so they don't start with a U-turn.
        if (Math.sin(r.yaw) * (p.x - r.x) + Math.cos(r.yaw) * (p.z - r.z) < 0 && k < 15) continue;
        if (adv.cars.some((c) => Math.hypot(c.pos.x - r.x, c.pos.z - r.z) < 6)) continue;
        spot = r;
        if (!this.lineOfSight(new THREE.Vector3(r.x, GY + 1, r.z), 1.2)) break;
      }
      if (!spot) return;
      car = adv.addCar('police', spot.x, spot.z, spot.yaw, false);
    }
    this.units.push(new Unit(this, car));
    if (this.radioT <= 0) {
      this.radioT = 1;
      const car2 = this.game.player.driving;
      const v = car2 ? { x: Math.sin(car2.yaw) * car2.speed, z: Math.cos(car2.yaw) * car2.speed } : this.game.player.vel;
      const dir = heading(v.x, v.z);
      const what = car2 ? `in a ${car2.def.name.toLowerCase()}` : 'on foot';
      this.game.hud.feed(`Dispatch: Suspect ${what}${dir ? `, heading ${dir}` : ''} on ${streetAt(p.x, p.z)}.`, '');
    }
  }

  // Remove police that are done, far away or wrecked.
  cleanup() {
    const p = this.game.player.pos;
    const keep = [];
    for (const u of this.units) {
      const c = u.car;
      const far = c ? c.pos.distanceTo(p) > 70 : true;
      // Officers on foot leave once you can't see them.
      const allGone = u.officers.every((o) => o.riding || o.pos.distanceTo(p) > 25 || !this.lineOfSight(o.pos, 1.6));
      const done = (u.mode === 'leave' && far) || ((!c || c.dead) && allGone && this.stars === 0);
      if (done) {
        u.dispose();
        if (c && !c.dead) this.adv.removeCar(c);
        continue;
      }
      if (c && c.dead && c.unit === u) {
        // The car blew up: whoever was inside got out first.
        u.car = null;
        u.officers.forEach((o, i) => {
          if (o.riding) {
            o.pos.copy(c.pos).add(new THREE.Vector3(i ? 1.4 : -1.4, 0, 0));
            o.knockOut(false);
            o.model.root.visible = true;
          }
        });
      }
      keep.push(u);
    }
    this.units = keep;
  }

  // An officer grabbing you while you're standing still (or stuck in a
  // car) fills the BUSTED bar.
  updateBust(dt) {
    const g = this.game;
    const p = g.player;
    let grabbed = false;
    if (this.stars > 0 && !p.dead) {
      const car = p.driving;
      const slow = car ? Math.abs(car.speed) < 2 : Math.hypot(p.vel.x, p.vel.z) < 3.2;
      const reach = car ? car.def.wid / 2 + 1.4 : 1.5;
      if (slow) for (const o of this.officers()) if (o.state === 'chase' && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < reach && Math.abs(o.pos.y - p.pos.y) < 1.5) grabbed = true;
    }
    this.bustT = grabbed ? this.bustT + dt : Math.max(0, this.bustT - dt * 0.8);
    if (this.bustT >= 1.6) this.busted();
  }

  busted() {
    const g = this.game;
    const adv = this.adv;
    const fine = Math.min(g.profile.coins, this.stars * 25);
    if (g.player.driving) adv.exitCar(true);
    if (adv.active) adv.endMission('fail');
    this.reset();
    g.profile.coins -= fine;
    g.profile.changed();
    const s = adv.policeDoor;
    g.player.reset(s);
    g.player.yaw = 0;
    g.hud.showBanner('BUSTED!', fine ? `Fine: ${fine} coins. The police let you go with a warning.` : 'The police let you go with a warning.', 4);
    g.sound.clank(1);
    g.sound.death();
    g.progress.event('busted', {});
  }

  // --- Police driving ---

  // Called by a police car's update() when it's chasing you.
  driveCop(car, dt) {
    const g = this.game;
    const adv = this.adv;
    const u = car.unit;
    const p = g.player;
    if (u.mode === 'deployed') {
      car.drive(dt, 0, 0, true);
      // Everyone back in: go again (or go home).
      if (u.riding === u.officers.length) u.mode = this.stars > 0 ? 'drive' : 'leave';
      return;
    }
    if (u.mode === 'leave') {
      // Rejoin traffic and drive off.
      car.driver = 'ai';
      car.sirenOn = false;
      car.ai = null;
      car.aiDrive(dt);
      car.driver = 'cop';
      return;
    }
    const target = this.seen ? p.pos : this.lastKnown;
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    // Straight at you when there's a clear run; otherwise along the roads
    // to the bit of road closest to you.
    const kerb = this.roadPoint(target);
    const kd = Math.hypot(kerb.x - car.pos.x, kerb.z - car.pos.z);
    u.pathT -= dt;
    if (u.pathT <= 0) {
      u.pathT = 0.5;
      u.direct = dist < 20 && this.clearRun(car.pos, target);
      u.waypoint = u.direct ? null : this.nextWaypoint(car, kerb);
    }
    let tx = target.x;
    let tz = target.z;
    if (!u.direct) {
      const w = u.waypoint || kerb;
      tx = w.x;
      tz = w.z;
    }
    const arrived = u.direct ? dist < 11 : kd < 7;
    // Getting any closer? If not, the officers get out and walk, or the
    // car gets moved somewhere better.
    if (u.bestD === undefined || dist < u.bestD - 1) {
      u.bestD = dist;
      u.noProg = 0;
    } else u.noProg = (u.noProg || 0) + dt;
    // Something in the way: pull out into the other lane and overtake.
    const f = car.forward(v1);
    const block = adv.obstacleAhead(car, f, true);
    if (block < 9 && !u.direct && Math.abs(car.speed) > -1) u.overT = Math.max(u.overT || 0, 1.3);
    if (u.overT > 0) {
      u.overT -= dt;
      tx = car.pos.x + f.x * 10 + f.z * 4.5;
      tz = car.pos.z + f.z * 10 - f.x * 4.5;
    }
    const want = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    let diff = want - car.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    let steer = Math.max(-1, Math.min(1, diff * 2.4));
    const chasingCar = p.driving && Math.abs(p.driving.speed) > 4;
    const left = u.direct ? dist - 6 : kd - 2;
    let targetSpeed = chasingCar ? car.def.speed * 0.8 : Math.max(0, Math.min(car.def.speed * 0.72, left * 1.6));
    // Sharp turns need slowing down.
    targetSpeed *= 1 - Math.min(0.6, Math.abs(diff) * 0.35);
    if (u.overT > 0) targetSpeed = Math.min(targetSpeed, 11);
    const again = adv.obstacleAhead(car, car.forward(v2), true);
    if (again < 5) targetSpeed = Math.min(targetSpeed, Math.max(0, (again - 2) * 2));
    // Stuck behind something: back up and try again.
    if (Math.abs(car.speed) < 0.6 && targetSpeed > 3) u.stuckT += dt;
    else u.stuckT = Math.max(0, u.stuckT - dt);
    let throttle = Math.max(-1, Math.min(1, (targetSpeed - car.speed) * 0.5));
    if (u.stuckT > 1.2 && u.revT <= 0) u.revT = 1.1;
    if (u.revT > 0) {
      u.revT -= dt;
      throttle = -0.8;
      steer = -steer || 1;
      if (u.revT <= 0) u.stuckT = 0;
    }
    // Facing the wrong way: a three-point turn (back up while turning).
    if (Math.abs(diff) > 2.1 && Math.abs(car.speed) < 5) u.kturn = true;
    if (u.kturn && (Math.abs(diff) < 1.2 || car.speed > 5)) u.kturn = false;
    if (u.kturn && u.revT <= 0) {
      throttle = -0.8;
      steer = -Math.sign(diff);
    }
    car.drive(dt, throttle, steer, false);
    // Close enough and slow: everyone out!
    const canWalk = !p.driving || Math.abs(p.driving.speed) < 5;
    if (canWalk && u.riding > 0 && ((arrived && Math.abs(car.speed) < 3) || (dist < 48 && u.noProg > 4))) u.deploy();
    // Hopelessly stuck far away: move to a road near you, out of sight.
    if (u.noProg > 8 && dist >= 48 && !this.lineOfSight(car.pos, 1.2)) {
      const w = this.roadPoint(target);
      const spots = [];
      for (let k = 0; k < 12; k++) {
        const r = adv.traffic.randomSpot();
        const d = Math.hypot(r.x - w.x, r.z - w.z);
        if (d > 18 && d < 45 && !adv.cars.some((c) => c !== car && Math.hypot(c.pos.x - r.x, c.pos.z - r.z) < 6)) spots.push([d, r]);
      }
      spots.sort((a, b) => a[0] - b[0]);
      if (spots.length) {
        const r = spots[0][1];
        car.pos.set(r.x, adv.groundAt(r.x, r.z, GY + 2), r.z);
        car.yaw = r.yaw;
        car.speed = 0;
      }
      u.noProg = 0;
      u.bestD = undefined;
      u.stuckT = 0;
    }
  }

  // Traffic slows down to let a police car with its siren on go past.
  yieldTo(car) {
    for (const u of this.units) {
      const c = u.car;
      if (!c || c === car || c.dead || u.mode !== 'drive') continue;
      const dx = car.pos.x - c.pos.x;
      const dz = car.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 16) continue;
      // It's behind us and coming our way.
      const f = c.forward(v1);
      if ((dx * f.x + dz * f.z) / (d || 1) > 0.6) return true;
    }
    return false;
  }

  // The closest point on a road to (x, z), in the right-hand lane.
  roadPoint(t) {
    const lo = ROADS[0] + 0.5;
    const hi = ROADS[ROADS.length - 1] + 0.5;
    const cx = Math.max(lo, Math.min(hi, t.x));
    const cz = Math.max(lo, Math.min(hi, t.z));
    let best = null;
    let bd = Infinity;
    for (const r of ROADS) {
      const c = r + 0.5;
      const d1 = Math.hypot(t.x - c, t.z - cz);
      if (d1 < bd) {
        bd = d1;
        best = { x: c + Math.sign(t.x - c) * Math.min(2.5, Math.abs(t.x - c)), z: cz, road: 'z', c };
      }
      const d2 = Math.hypot(t.x - cx, t.z - c);
      if (d2 < bd) {
        bd = d2;
        best = { x: cx, z: c + Math.sign(t.z - c) * Math.min(2.5, Math.abs(t.z - c)), road: 'x', c };
      }
    }
    return best;
  }

  // Can a car drive straight from a to b? (Nothing solid in the way.)
  clearRun(a, b) {
    const w = this.game.world;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    for (let t = 1; t < len; t += 0.7) {
      const x = Math.floor(a.x + (dx * t) / len);
      const z = Math.floor(a.z + (dz * t) / len);
      if (w.solid(x, GY + 1, z) || w.solid(x, GY + 2, z) || !w.solid(x, GY, z)) return false;
    }
    return true;
  }

  // The next junction on the shortest road route towards the target.
  nextWaypoint(car, target) {
    const nodes = this.adv.traffic.nodes;
    const nearest = (x, z) => {
      let best = null;
      let bd = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      return [best, bd];
    };
    // Already on the right road: straight there.
    if (target.road === 'z' && Math.abs(car.pos.x - target.c) < 3.5) return null;
    if (target.road === 'x' && Math.abs(car.pos.z - target.c) < 3.5) return null;
    const [start, sd] = nearest(car.pos.x, car.pos.z);
    // The junction on the kerb point's road nearest to it.
    let goal = null;
    let gd = Infinity;
    for (const n of nodes) {
      const on = target.road === 'z' ? Math.abs(n.x - target.c) < 0.6 : Math.abs(n.z - target.c) < 0.6;
      const d = Math.hypot(n.x - target.x, n.z - target.z);
      if (on && d < gd) {
        gd = d;
        goal = n;
      }
    }
    if (!goal) [goal] = nearest(target.x, target.z);
    if (start === goal && sd < 7) return null;
    // Breadth-first search over the road grid.
    const prev = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift();
      if (n === goal) break;
      for (const m of n.next) {
        if (prev.has(m)) continue;
        prev.set(m, n);
        queue.push(m);
      }
    }
    const path = [];
    for (let n = goal; n; n = prev.get(n)) path.unshift(n);
    // Already at (or past) the first junction: head for the next one.
    let node = path[0];
    if (path.length > 1) {
      const a = path[0];
      const b = path[1];
      const past = Math.hypot(car.pos.x - b.x, car.pos.z - b.z) < Math.hypot(a.x - b.x, a.z - b.z);
      if (sd < 7 || past) node = b;
    }
    // Keep to the right-hand lane on the way there.
    const dx = node.x - car.pos.x;
    const dz = node.z - car.pos.z;
    const ax = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
    const az = ax ? 0 : Math.sign(dz);
    return { x: node.x - az * LANE, z: node.z + ax * LANE };
  }

  // --- Sound and HUD ---

  updateSounds() {
    const g = this.game;
    const p = g.player.pos;
    let near = Infinity;
    for (const u of this.units) if (u.car && !u.car.dead && u.car.driver === 'cop' && u.mode !== 'leave') near = Math.min(near, u.car.pos.distanceTo(p));
    g.sound.copSiren(near < 70 ? Math.max(0, 1 - near / 70) : 0);
    g.sound.heli(this.heli && !this.heli.gone ? Math.max(0, 1 - this.heli.pos.distanceTo(p) / 90) : 0);
  }

  // The phone card: who's calling, and what they're saying.
  updatePhone(dt) {
    const ph = $('#phone');
    const caller = this.calls[this.calls.length - 1];
    if (caller) {
      ph.hidden = false;
      ph.dataset.stage = 'ring';
      $('#ph-name').textContent = caller.name;
      $('#ph-status').textContent = caller.callT < 1.4 ? `Calling ${POLICE_NUMBER}…` : 'Blockton Police, what’s your emergency?';
      $('#ph-fill').style.width = `${Math.min(100, (caller.callT / 3.5) * 100)}%`;
      return;
    }
    if (this.lastCall) {
      this.lastCall.t -= dt;
      ph.hidden = false;
      $('#ph-name').textContent = this.lastCall.person.name;
      $('#ph-status').textContent = `“Someone pulled a gun on me on ${streetAt(this.lastCall.person.pos.x, this.lastCall.person.pos.z)}!”`;
      $('#ph-fill').style.width = '100%';
      if (this.lastCall.t <= 0) this.lastCall = null;
      return;
    }
    ph.hidden = true;
  }

  renderHud() {
    const el = $('#wanted');
    if (!el) return;
    const flash = this.stars > 0 && !this.seen && this.searching;
    const key = `${this.stars}|${flash}|${Math.round(this.bustT * 20)}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    el.hidden = this.stars === 0;
    [...el.querySelectorAll('i')].forEach((s, i) => s.classList.toggle('on', i < this.stars));
    el.classList.toggle('search', flash);
    const bust = $('#bust');
    bust.hidden = this.bustT <= 0.05;
    $('#bust-fill').style.width = `${Math.min(100, (this.bustT / 1.6) * 100)}%`;
  }
}
