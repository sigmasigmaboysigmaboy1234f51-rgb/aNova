import * as THREE from 'three';
import { $ } from './util.js';
import { setBoxUV } from './model.js';
import { BLOCKS, SY } from './world.js';
import { Suit, SUITS } from './suit.js';
import { Crimes } from './crimes.js';
import { chadViewArm, chadMaterial } from './chad.js';

// Web shooters (Adventure mode). Press 8 to put them on, and the spider
// suit spreads over you.
//   Left click        web ball: sticks mobs, cars, police and people in a
//                     cocoon for a few seconds. Hold, then let go, for a
//                     big Web Blast that wraps up everything around it.
//   Right click hold  swing from a building (it finds one near where you
//                     aim). Let go to fly. Keep holding to swing again.
//   Right click       on a person, mob or officer: yank them over to you.
//   Space             while swinging: zip up the web. In the air: glide.
//   R                 web zip straight to where you aim.
//   Walk into a wall  crawl up it. W up, S down, Space to leap off.
//   N                 next suit.

export const WEB_SLOT = 7;
const RANGE = 70;
const WHITE = [new THREE.Color('#ffffff'), new THREE.Color('#e8eef2'), new THREE.Color('#cfd8e0')];
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const qA = new THREE.Quaternion();
const mA = new THREE.Matrix4();
const ROPE_N = 18;

// A little web picture for the hotbar.
export function drawWebIcon(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const c = w / 2;
  ctx.clearRect(0, 0, w, w);
  ctx.strokeStyle = '#f4f1ea';
  ctx.lineWidth = w / 32;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9);
    ctx.stroke();
  }
  for (const r of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = c + Math.cos(a) * c * r;
      const y = c + Math.sin(a) * c * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#d8392b';
  ctx.fillRect(c - w * 0.12, c - w * 0.12, w * 0.24, w * 0.24);
}

// The web line: a thin ribbon that always faces the camera, so it looks
// the same from every side. It sags when slack and wiggles as it flies out.
function makeRope() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ROPE_N + 1) * 2 * 3), 3));
  const idx = [];
  for (let i = 0; i < ROPE_N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#f4f6f8', side: THREE.DoubleSide }));
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

// What a cocoon looks like: a white wrap with a web pattern.
let webTex = null;
function webTexture() {
  if (webTex) return webTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  drawWebIcon(c);
  const ctx = c.getContext('2d');
  ctx.clearRect(26, 26, 12, 12);
  webTex = new THREE.CanvasTexture(c);
  return webTex;
}
let wrapTex = null;
function wrapTexture() {
  if (wrapTex) return wrapTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(240, 244, 248, 0.55)';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.lineWidth = 3;
  for (let i = -64; i < 128; i += 12) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 40, 64);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 40, 0);
    ctx.lineTo(i, 64);
    ctx.stroke();
  }
  wrapTex = new THREE.CanvasTexture(c);
  wrapTex.colorSpace = THREE.SRGBColorSpace;
  return wrapTex;
}

// Remember which way the block face points that a web point is on.
function withNormal(pt, hit) {
  pt.n = new THREE.Vector3(hit.nx || 0, hit.ny || 0, hit.nz || 0);
  return pt;
}

export class Webs {
  constructor(adv) {
    this.adv = adv;
    this.game = adv.game;
    this.suit = new Suit(this.game);
    this.crimes = new Crimes(adv, this);
    // Line state: mode is 'swing', 'zip' or 'yank'.
    this.anchor = null;
    this.mode = null;
    this.target = null;
    this.ropeLen = 0;
    this.shootK = 1;
    this.retryT = 0;
    this.shotCd = 0;
    this.chargeT = 0;
    this.charging = false;
    this.balls = [];
    this.splats = [];
    this.cocoons = new Map();
    this.thrust = 0;
    this.thrustL = 0;
    this.alt = false;
    this.crawl = null;
    this.gliding = false;
    this.flip = 0;
    this.landT = 0;
    this.roll = 0;
    this.fovKick = 0;
    this.senseT = 0;
    this.senseCd = 0;
    this.senseDir = 0;
    this.slowT = 0;
    this.swings = 0;
    this.rope = makeRope();
    this.ropeFrom = new THREE.Vector3();
    this.game.scene.add(this.rope);
    this.ballGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.bigGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    this.ballMat = new THREE.MeshBasicMaterial({ color: '#f4f6f8' });
    this.splatGeo = new THREE.PlaneGeometry(0.9, 0.9);
    this.splatMat = new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.wrapGeo = new THREE.BoxGeometry(1, 1, 1);
    this.wrapMat = new THREE.MeshLambertMaterial({ map: wrapTexture(), transparent: true, depthWrite: false });
    this.wingMat = new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    this.buildHands();
  }

  dispose() {
    const s = this.game.scene;
    this.release(true);
    s.remove(this.rope);
    this.rope.geometry.dispose();
    this.rope.material.dispose();
    for (const b of this.balls) s.remove(b.mesh);
    for (const sp of this.splats) s.remove(sp.mesh);
    for (const c of this.cocoons.values()) s.remove(c.mesh);
    this.cocoons.clear();
    for (const x of [this.ballGeo, this.bigGeo, this.ballMat, this.splatGeo, this.splatMat, this.wrapGeo, this.wrapMat, this.wingMat]) x.dispose();
    this.game.viewScene.remove(this.hands);
    this.hands.traverse((o) => o.isMesh && o.geometry.dispose());
    this.handMats.forEach((m) => m.dispose());
    this.removeWings();
    this.crimes.dispose();
    this.suit.dispose();
    this.game.player.crawl = false;
    this.game.timeScale = 1;
    this.game.sound.wind(0);
    document.body.classList.remove('web-ok', 'web-charge', 'sense');
    const sl = $('#speedlines');
    if (sl) sl.style.opacity = '0';
  }

  // Two arms in the spider suit for first person, with the web shooters on
  // the wrists.
  buildHands() {
    const g = new THREE.Group();
    const U = 0.034;
    const base = new THREE.MeshLambertMaterial({ map: this.suit.tex });
    const outer = new THREE.MeshLambertMaterial({ map: this.suit.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const glow = new THREE.MeshBasicMaterial({ color: '#8fe8ff' });
    this.handMats = [base, outer, glow];
    this.glowMat = glow;
    const hand = (side, u, v, ou, ov) => {
      const h = new THREE.Group();
      const w = 4;
      const geo = new THREE.BoxGeometry(w * U, 12 * U, 4 * U);
      setBoxUV(geo, u, v, w, 12, 4);
      const geo2 = new THREE.BoxGeometry((w + 0.5) * U, 12.5 * U, 4.5 * U);
      setBoxUV(geo2, ou, ov, w, 12, 4);
      const arm = new THREE.Group();
      arm.add(new THREE.Mesh(geo, base), new THREE.Mesh(geo2, outer));
      // The hand end points away from you.
      arm.rotation.x = Math.PI / 2;
      arm.position.z = 0.06;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), glow);
      tip.position.set(0, 0.07, -0.02);
      h.add(arm, tip);
      h.position.set(side * 0.3, -0.34, -0.55);
      h.rotation.set(0.15, side * -0.12, 0);
      g.add(h);
      return h;
    };
    this.handR = hand(1, 40, 16, 40, 32);
    this.handL = hand(-1, 32, 48, 48, 48);
    g.visible = false;
    g.scale.setScalar(0.85);
    this.game.viewScene.add(g);
    this.hands = g;
  }

  // A Giga Chad gets his own arms in the suit (see chad.js).
  chadHands() {
    const m = this.game.player.model;
    const look = m.chad ? m.chad.look : null;
    if (look === this.handsLook) return;
    this.handsLook = look;
    if (this.chadHandMeshes) for (const c of this.chadHandMeshes) c.parent.remove(c);
    this.chadHandMeshes = [];
    if (!this.chadHandMat) {
      this.chadHandMat = chadMaterial(this.suit.tex);
      this.handMats.push(this.chadHandMat);
    }
    for (const [h, side] of [[this.handR, 'R'], [this.handL, 'L']]) {
      const arm = h.children[0];
      for (const b of arm.children) b.visible = !look;
      if (!look) continue;
      const c = chadViewArm(look, side, this.chadHandMat);
      c.position.y = -0.17;
      arm.add(c);
      this.chadHandMeshes.push(c);
    }
  }

  get on() {
    const p = this.game.player;
    return p.held === WEB_SLOT && !p.driving && !p.dead;
  }

  // Fully in the suit: spider powers on.
  get suited() {
    return this.suit.k >= 0.95 && this.on;
  }

  // Where the web comes out of: your hand.
  handPos(out, left = false) {
    const g = this.game;
    const p = g.player;
    if (p.thirdPerson) {
      (left ? p.model.parts.armL : p.model.parts.armR).getWorldPosition(out);
      return out.setY(out.y - 0.45 * p.size);
    }
    const cam = g.camera;
    return out.set(left ? -0.26 : 0.26, -0.26, -0.6).applyQuaternion(cam.quaternion).add(cam.position);
  }

  aimFrom(yawOff = 0, pitchOff = 0, out = vA) {
    const p = this.game.player;
    const y = p.yaw + yawOff;
    const pt = p.pitch + p.kick + pitchOff;
    return out.set(-Math.sin(y) * Math.cos(pt), Math.sin(pt), -Math.cos(y) * Math.cos(pt));
  }

  ray(o, d, range = RANGE) {
    const hit = this.game.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
    return hit ? { t: hit.t, pt: new THREE.Vector3(o.x + d.x * hit.t, o.y + d.y * hit.t, o.z + d.z * hit.t), hit } : null;
  }

  // Somewhere to swing from: right where you aim if it's up high, or the
  // best spot a little above your aim. Swinging from the sky doesn't work.
  findAnchor() {
    const g = this.game;
    const p = g.player;
    const o = g.camera.position;
    const w = g.world;
    const aim = this.aimFrom();
    // Aiming right at a building that's close and high enough: use that.
    const direct = this.ray(o, aim);
    if (direct && direct.t >= 4 && direct.t <= 36 && direct.pt.y - p.pos.y >= 5) return withNormal(direct.pt, direct.hit);
    const eye = vC.set(p.pos.x, p.pos.y + p.h * 0.8, p.pos.z);
    const clear = (pt) => {
      const d = vD.subVectors(pt, eye);
      const L = d.length();
      d.divideScalar(L);
      const r = w.raycast(eye.x, eye.y, eye.z, d.x, d.y, d.z, L);
      return !r || r.t > L - 1.2;
    };
    // Otherwise: something up ahead on either side, like the buildings
    // along a street. That makes a nice swing down the road.
    const fx = aim.x;
    const fz = aim.z;
    const fl = Math.hypot(fx, fz) || 1;
    let best = null;
    for (const ahead of [15, 10, 6]) {
      const P = new THREE.Vector3(p.pos.x + (fx / fl) * ahead, Math.min(SY - 2, p.pos.y + (p.onGround ? 11 : 9)), p.pos.z + (fz / fl) * ahead);
      if (w.solid(Math.floor(P.x), Math.floor(P.y), Math.floor(P.z))) continue;
      for (const a of [-1.57, 1.57, -1.05, 1.05, -0.5, 0.5, 0]) {
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const dx = (fx / fl) * c - (fz / fl) * sn;
        const dz = (fz / fl) * c + (fx / fl) * sn;
        for (const dy of [0.25, 0, -0.35]) {
          const hit = w.raycast(P.x, P.y, P.z, dx, dy, dz, 16);
          if (!hit) continue;
          const pt = withNormal(new THREE.Vector3(P.x + dx * hit.t, P.y + dy * hit.t, P.z + dz * hit.t), hit);
          if (pt.y - p.pos.y < 4 || !clear(pt)) continue;
          const score = hit.t + Math.abs(a) * 1.5 + Math.abs(dy) * 4 - ahead * 0.3;
          if (!best || score < best.score) best = { score, pt };
        }
      }
      if (best) return best.pt;
    }
    // Last try: a fan of directions around your aim.
    let fan = null;
    for (const up of [-0.6, -0.3, 0.15, 0.35, 0.55]) {
      for (const side of [0, -0.2, 0.2, -0.4, 0.4]) {
        const d = this.aimFrom(side, up, vB);
        if (d.y > 0.995) continue;
        const r = this.ray(o, d, 45);
        if (!r || r.t < 4 || r.pt.y - p.pos.y < 3) continue;
        const score = Math.abs(up) + Math.abs(side) * 1.4 + r.t * 0.01;
        if (!fan || score < fan.score) fan = { score, pt: withNormal(r.pt, r.hit) };
      }
    }
    return fan ? fan.pt : direct && direct.t > 3 ? withNormal(direct.pt, direct.hit) : null;
  }

  // The closest person, mob, officer or car under the crosshair.
  entityAt(range = 40) {
    const g = this.game;
    const adv = this.adv;
    const o = g.camera.position;
    const d = this.aimFrom();
    const wall = this.ray(o, d, range);
    let maxT = wall ? wall.t : range;
    let best = null;
    const mh = g.mobs.raycast(o, d, maxT);
    if (mh && mh.mob.state === 'live') {
      best = { kind: 'mob', e: mh.mob, t: mh.t };
      maxT = mh.t;
    }
    const ah = adv.traceCars(o, d, maxT);
    if (ah && ah.officer) {
      best = { kind: 'officer', e: ah.officer, t: ah.t };
      maxT = ah.t;
    } else if (ah && ah.car && !ah.car.dead) {
      best = { kind: 'car', e: ah.car, t: ah.t };
      maxT = ah.t;
    }
    for (const person of adv.people) {
      if (person.giver) continue;
      const t = person.hitTest(o, d, maxT);
      if (t !== null) {
        best = { kind: 'person', e: person, t };
        maxT = t;
      }
    }
    return best;
  }

  // --- Input -----------------------------------------------------------------

  // Called by the player each frame while the web shooters are out.
  input(dt) {
    const g = this.game;
    const inp = g.input;
    const p = g.player;
    this.shotCd -= dt;
    this.retryT -= dt;
    // Left: tap for a web ball, hold to charge a Web Blast.
    if (inp.leftPressed && this.shotCd <= 0) this.shoot(false);
    if (inp.left) {
      this.chargeT += dt;
      if (this.chargeT > 0.35 && !this.charging) {
        this.charging = true;
        g.sound.webCharge(0.6);
      }
    } else {
      if (this.charging && this.chargeT > 0.6) this.shoot(true);
      this.charging = false;
      this.chargeT = 0;
    }
    document.body.classList.toggle('web-charge', this.charging && this.chargeT > 0.6);
    // Right: yank whoever you point at, or swing.
    if (inp.rightPressed && !this.anchor) {
      const e = this.entityAt();
      if (e && e.kind !== 'car') this.yank(e);
      else if (e && e.kind === 'car') this.zipTo(e.e.pos.clone().setY(e.e.pos.y + 1.2), e.e);
    }
    if (inp.right && !this.anchor && this.retryT <= 0) {
      const at = this.findAnchor();
      if (at) this.attach(at);
      else {
        this.retryT = 0.25;
        if (inp.rightPressed) g.sound.thwip(0.4);
      }
    }
    if (!inp.right && this.anchor && this.mode === 'swing') this.release(false);
    // R: zip to where you aim.
    if (inp.pressed.has('KeyR') && this.mode !== 'zip') {
      const r = this.ray(g.camera.position, this.aimFrom());
      if (r && r.t > 3) this.zipTo(r.pt);
      else g.sound.thwip(0.4);
    }
    // N: a different suit.
    if (inp.pressed.has('KeyN')) {
      const name = this.suit.cycle();
      g.hud.showBanner(`${name} suit`, 'Press N for the next one', 1.6);
      this.suitUp(true);
    }
    // The crosshair shows when there's something to swing from.
    this.okT = (this.okT || 0) - dt;
    if (this.okT <= 0) {
      this.okT = 0.12;
      this.canSwing = !this.anchor && !!this.findAnchor();
    }
    document.body.classList.toggle('web-ok', !!this.canSwing);
  }

  attach(at) {
    const g = this.game;
    const p = g.player;
    const c = vA.set(p.pos.x, p.pos.y + p.h * 0.55, p.pos.z);
    // The web sticks to the wall, but you swing round a point a few blocks
    // out over the street, so the bottom of the swing isn't the wall.
    this.webPt = at.clone();
    this.anchor = at.clone();
    const n = at.n;
    if (n && n.y === 0) {
      for (let k = 5; k > 0; k--) {
        const q = vB.copy(at).addScaledVector(n, k);
        if (!g.world.solid(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z)) && !g.world.solid(Math.floor(q.x), Math.floor(q.y) - 1, Math.floor(q.z))) {
          this.anchor.copy(q);
          break;
        }
      }
    }
    this.mode = 'swing';
    this.target = null;
    this.shootK = 0;
    // The rope starts at the gap and reels in so the bottom of the swing
    // clears the ground (that's what lifts you off your feet).
    const dist = c.distanceTo(this.anchor);
    this.ropeLen = dist;
    // The ground under you (the street when you're up in the air).
    let floor = Math.floor(p.pos.y);
    while (floor > 1 && !g.world.solid(Math.floor(p.pos.x), floor - 1, Math.floor(p.pos.z))) floor--;
    this.ropeWant = Math.max(3, Math.min(dist * 0.92, this.anchor.y - floor - p.h * 0.55 - 1.2));
    p.webFly = true;
    this.crawl = null;
    this.gliding = false;
    this.alt = !this.alt;
    if (this.alt) this.thrust = 1;
    else this.thrustL = 1;
    g.sound.thwip(1);
    this.swings++;
    // Swings in a row without touching the ground.
    if (!p.onGround) this.streak = (this.streak || 0) + 1;
    if (this.streak >= 2) g.voices.say('swing', { chance: 0.35, cd: 10 });
    // A little hop off the ground to get going.
    if (p.onGround) p.vel.y = Math.max(p.vel.y, 6);
  }

  // Let go of the web.
  release(silent) {
    const g = this.game;
    const p = g.player;
    if (this.anchor && !silent && this.mode === 'swing') {
      // Let go on the way up and you fly.
      const hs = Math.hypot(p.vel.x, p.vel.z);
      p.vel.x *= 1.18;
      p.vel.z *= 1.18;
      p.vel.y = Math.max(p.vel.y, Math.min(11, 2.5 + hs * 0.3));
      g.sound.whoosh(Math.min(1, hs / 20));
      // Show off: a flip when you let go going fast.
      if (hs > 13 && this.flip <= 0) this.flip = 0.001;
    }
    if (this.mode === 'yank' && this.target) this.target.e.yanked = false;
    this.anchor = null;
    this.webPt = null;
    this.mode = null;
    this.target = null;
    this.rope.visible = false;
  }

  // Pull yourself straight at a point (or a car).
  zipTo(at, car = null) {
    const g = this.game;
    const p = g.player;
    this.release(true);
    this.anchor = at.clone();
    this.mode = 'zip';
    this.target = car ? { kind: 'car', e: car } : null;
    this.shootK = 0;
    this.zipT = 0;
    this.crawl = null;
    this.gliding = false;
    p.webFly = true;
    this.thrust = 1;
    this.thrustL = 1;
    g.sound.thwip(1);
    g.sound.zip(1);
  }

  // Web someone and pull them over to you.
  yank(hit) {
    const g = this.game;
    this.release(true);
    this.mode = 'yank';
    this.target = hit;
    hit.e.yanked = true;
    this.anchor = hit.e.pos.clone();
    this.shootK = 0;
    this.yankT = 0;
    this.thrust = 1;
    g.sound.thwip(1);
    if (hit.kind === 'officer') this.adv.police.crime('shootCop');
  }

  // --- Movement (called by the player before it moves) ---------------------------

  move(dt) {
    const g = this.game;
    const p = g.player;
    const inp = g.input;
    const k = inp.keys;
    if (this.mode === 'swing') this.swingStep(dt);
    else if (this.mode === 'zip') this.zipStep(dt);
    if (this.mode === 'yank') this.yankStep(dt);
    // Wall crawling.
    if (this.crawl) {
      const c = this.crawl;
      if (!this.suited || this.anchor) {
        this.crawl = null;
      } else if (k.has('Space')) {
        // Leap off the wall, backwards and up.
        this.crawl = null;
        p.vel.set(-c.x * 8, 10, -c.z * 8);
        p.webFly = true;
        g.sound.whoosh(0.7);
      } else if (k.has('ShiftLeft') || k.has('ShiftRight')) {
        this.crawl = null;
      } else {
        const up = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
        const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        // Sideways along the wall, matched to where you are looking.
        const cr = vA.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
        const tx = -c.z;
        const tz = c.x;
        const s = Math.sign(cr.x * tx + cr.z * tz) || 1;
        p.vel.x = c.x * 2 + tx * right * s * 4.5;
        p.vel.z = c.z * 2 + tz * right * s * 4.5;
        p.vel.y = up * 5.5 * p.size ** 0.5;
        this.crawlT += dt;
      }
    }
    // Gliding on web wings: hold Space in the air.
    const air = !p.onGround && !p.inWater && !this.anchor && !this.crawl;
    this.gliding = this.suited && air && k.has('Space') && p.vel.y < 2;
    if (this.gliding) {
      p.vel.y = Math.max(p.vel.y, -2.4);
      const f = this.aimFrom(0, 0, vA).setY(0).normalize();
      const hs = Math.hypot(p.vel.x, p.vel.z);
      const want = Math.max(hs, 12);
      p.vel.x += (f.x * want - p.vel.x) * Math.min(1, dt * 1.5);
      p.vel.z += (f.z * want - p.vel.z) * Math.min(1, dt * 1.5);
      p.webFly = true;
    }
  }

  // Keep the old name working.
  swing(dt) {
    this.move(dt);
  }

  swingStep(dt) {
    const g = this.game;
    const p = g.player;
    const inp = g.input;
    const c = vA.set(p.pos.x, p.pos.y + p.h * 0.55, p.pos.z);
    const d = vB.subVectors(c, this.anchor);
    const L = d.length();
    if (L < 0.01) return;
    d.divideScalar(L);
    // Zip: Space pulls you up the web.
    if (inp.keys.has('Space')) {
      this.ropeLen = Math.max(1.5, this.ropeLen - 24 * dt);
      this.ropeWant = Math.min(this.ropeWant, this.ropeLen);
      p.vel.addScaledVector(d, -32 * dt);
      if (L < 2.5) {
        // Made it: spring up over the edge.
        this.release(true);
        p.vel.y = 11;
        g.sound.whoosh(0.6);
        return;
      }
    }
    // Pump the swing with W, and a free boost at the bottom of each arc.
    const fwd = this.aimFrom(0, 0, vC).setY(0).normalize();
    if (inp.keys.has('KeyW')) p.vel.addScaledVector(fwd, 18 * dt);
    const low = Math.max(0, -d.y);
    if (low > 0.8) p.vel.addScaledVector(fwd, 10 * dt * low);
    // Reel in to the length we want.
    if (this.ropeLen > this.ropeWant) this.ropeLen = Math.max(this.ropeWant, this.ropeLen - Math.max(14, (this.ropeLen - this.ropeWant) * 3) * dt);
    if (L >= this.ropeLen) {
      const vr = p.vel.dot(d);
      if (vr > 0) p.vel.addScaledVector(d, -vr);
      p.vel.addScaledVector(d, -Math.min(L - this.ropeLen, 2) * 40 * dt);
    }
    // Long ropes feel better a bit shorter.
    if (this.ropeWant > 7) this.ropeWant -= dt * 1.2;
    // Top speed.
    const sp = p.vel.length();
    if (sp > 42) p.vel.multiplyScalar(42 / sp);
  }

  zipStep(dt) {
    const g = this.game;
    const p = g.player;
    this.zipT += dt;
    if (this.target && this.target.e.dead) return this.release(true);
    if (this.target) this.anchor.set(this.target.e.pos.x, this.target.e.pos.y + 1.2, this.target.e.pos.z);
    const c = vA.set(p.pos.x, p.pos.y + p.h * 0.5, p.pos.z);
    const d = vB.subVectors(this.anchor, c);
    const L = d.length();
    if (this.shootK < 1) return;
    if (L < 1.8 || this.zipT > 3) {
      // Arrived: pop up and over.
      this.release(true);
      const f = this.aimFrom(0, 0, vC).setY(0).normalize();
      p.vel.set(f.x * 7, 9, f.z * 7);
      g.sound.whoosh(0.7);
      return;
    }
    d.divideScalar(L);
    const speed = Math.min(34, 12 + this.zipT * 60);
    p.vel.copy(d).multiplyScalar(speed);
    p.vel.y += 2;
  }

  // The yanked one flies over to you and ends up wrapped in a cocoon.
  yankStep(dt) {
    const g = this.game;
    const p = g.player;
    const h = this.target;
    const e = h && h.e;
    if (!e || e.gone || e.dead || (h.kind === 'mob' && e.state !== 'live')) return this.release(true);
    this.anchor.set(e.pos.x, e.pos.y + 1, e.pos.z);
    if (this.shootK < 1) return;
    this.yankT += dt;
    const goal = vA.set(p.pos.x, p.pos.y, p.pos.z).addScaledVector(this.aimFrom(0, 0, vB).setY(0).normalize(), 1.8);
    const d = vC.subVectors(goal, e.pos);
    const L = d.length();
    const step = Math.min(L, (14 + this.yankT * 30) * dt);
    if (L > 0.001) e.pos.addScaledVector(d, step / L);
    e.pos.y += Math.sin(Math.min(1, this.yankT * 2) * Math.PI) * dt * 4;
    if (e.vel) e.vel.set(0, 0, 0);
    // Held still in the web while flying over.
    e.webT = Math.max(e.webT || 0, 0.2);
    if (L < 0.6 || this.yankT > 1.2) {
      e.pos.y = Math.max(e.pos.y, this.adv.groundAt ? this.adv.groundAt(e.pos.x, e.pos.z, e.pos.y + 1) : e.pos.y);
      this.wrap(h.kind, e, 6);
      g.sound.splat();
      e.yanked = false;
      this.release(true);
    }
  }

  // After the player moved: start or stop crawling, big landings.
  after(dt, wasGround, vyBefore) {
    const g = this.game;
    const p = g.player;
    const k = g.input.keys;
    if (this.crawl) {
      const c = this.crawl;
      const touching = c.x ? p.hitX : p.hitZ;
      if (p.hitCeil) {
        // Something sticking out above: drop off the wall.
        this.crawl = null;
        p.vel.set(-c.x * 3, 0, -c.z * 3);
      } else if (!touching) {
        // Over the top: climb onto it.
        this.crawl = null;
        if (p.vel.y > 0 || k.has('KeyW')) {
          p.vel.set(c.x * 4, 6.5, c.z * 4);
          g.sound.whoosh(0.4);
        }
      } else if (p.onGround && (k.has('KeyS') || k.has('ArrowDown'))) this.crawl = null;
    } else if (this.suited && !this.anchor && !p.inWater && (p.hitX || p.hitZ)) {
      // Walked or flew into a wall: stick to it.
      const f = vA;
      const fw = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const sd = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      f.set(-Math.sin(p.yaw) * fw + Math.cos(p.yaw) * sd, 0, -Math.cos(p.yaw) * fw - Math.sin(p.yaw) * sd);
      const airborne = !p.onGround && p.webFly;
      if (f.lengthSq() > 0.1 || airborne) {
        if (f.lengthSq() < 0.1) f.set(p.vel.x, 0, p.vel.z);
        f.normalize();
        const ax = p.hitX && Math.abs(f.x) > 0.3 ? Math.sign(f.x) : 0;
        const az = !ax && p.hitZ && Math.abs(f.z) > 0.3 ? Math.sign(f.z) : 0;
        // Only real walls, not a one-block step.
        if ((ax || az) && this.wallHeight(ax, az) >= 2) {
          this.crawl = { x: ax, z: az };
          this.crawlT = 0;
          p.webFly = false;
          this.gliding = false;
          g.sound.landThud(0.3);
        }
      }
    }
    p.crawl = !!this.crawl;
    // Superhero landing.
    if (!wasGround && p.onGround && vyBefore < -15 && this.suited) {
      this.landT = 0.8;
      p.landDip = 1;
      p.shake = Math.max(p.shake, 0.35);
      const below = g.world.get(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.1), Math.floor(p.pos.z));
      const cols = below ? g.atlas.colors[BLOCKS[below].top] : WHITE;
      g.fx.burst(p.pos.x, p.pos.y + 0.1, p.pos.z, cols, 24, { speed: 6, size: 0.14, up: 1.5, life: 0.7, spread: 0.6 });
      g.sound.landThud(1);
      g.voices.say('landing', { cd: 6 });
    }
    if (p.onGround) this.flip = 0;
    // Landed after a long run of swings: coins.
    if (p.onGround && !wasGround) {
      const n = this.streak || 0;
      this.streak = 0;
      if (n >= 5) {
        const coins = n * 3;
        g.gainCoins(coins);
        g.hud.popup(`${n} swings in a row! +${coins} coins`);
        g.sound.pickup();
      }
    }
  }

  // How many blocks of wall are in front of you (to tell steps from walls).
  wallHeight(ax, az) {
    const g = this.game;
    const p = g.player;
    const x = Math.floor(p.pos.x + ax * (p.hw + 0.3));
    const z = Math.floor(p.pos.z + az * (p.hw + 0.3));
    let n = 0;
    for (let y = Math.floor(p.pos.y); y < Math.floor(p.pos.y) + 4; y++) if (g.world.solid(x, y, z)) n++;
    return n;
  }

  // --- Shooting ---------------------------------------------------------------

  shoot(big) {
    const g = this.game;
    const p = g.player;
    this.shotCd = big ? 0.5 : 0.2;
    this.alt = !this.alt;
    if (this.alt || big) this.thrust = 1;
    if (!this.alt || big) this.thrustL = 1;
    const from = this.handPos(new THREE.Vector3(), !this.alt && !big);
    const dir = this.aimFrom(0, 0, new THREE.Vector3());
    const mesh = new THREE.Mesh(big ? this.bigGeo : this.ballGeo, this.ballMat);
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.balls.push({ pos: from, vel: dir.multiplyScalar(big ? 38 : 50).addScaledVector(p.vel, 0.3), life: big ? 1.3 : 1.6, mesh, big });
    if (big) {
      g.sound.webBlast(0.7);
      g.voices.say('blast', { cd: 3, force: true });
    }
    else g.sound.thwip(0.8);
  }

  // Wrap something up in a cocoon.
  wrap(kind, e, t) {
    const g = this.game;
    if (kind === 'mob') e.webT = Math.max(e.webT || 0, e.def.boss ? 1.2 : t);
    else if (kind === 'officer') e.webT = Math.max(e.webT || 0, t + 1);
    else if (kind === 'person') {
      e.webT = Math.max(e.webT || 0, t);
      if (e.robber) this.crimes.caught(e);
      else e.scare(g.player.pos, 4);
    }
    if (kind === 'officer') this.adv.police.crime('shootCop');
    if (!this.cocoons.has(e)) {
      const mesh = new THREE.Mesh(this.wrapGeo, this.wrapMat);
      g.scene.add(mesh);
      this.cocoons.set(e, { mesh, kind });
    }
    g.hud.hitmarker(false);
  }

  // Something got hit by a web ball.
  stick(hit, at) {
    const g = this.game;
    g.fx.burst(at.x, at.y, at.z, WHITE, 10, { speed: 2, size: 0.08, up: 0.5, life: 0.6, spread: 0.2 });
    if (hit.mob) this.wrap('mob', hit.mob, 4);
    else if (hit.officer) this.wrap('officer', hit.officer, 4);
    else if (hit.person) this.wrap('person', hit.person, 3);
    else if (hit.car) this.webCar(hit.car, 1);
    else if (hit.block) this.splat(at, hit.block, 1);
    g.sound.splat();
  }

  webCar(car, n) {
    car.webbed = Math.max(car.webbed || 0, 3);
    car.speed *= 0.3;
    if (car.type === 'police') this.adv.police.crime('shootCop');
    if (car.getaway) this.crimes.carHit(car, n);
  }

  splat(at, b, size) {
    const g = this.game;
    const n = vA.set(b.nx || 0, b.ny || 0, b.nz || 0);
    const m = new THREE.Mesh(this.splatGeo, this.splatMat);
    m.scale.setScalar(size);
    m.position.copy(at).addScaledVector(n, 0.02);
    m.lookAt(vB.copy(m.position).add(n));
    g.scene.add(m);
    this.splats.push({ mesh: m, t: 10 });
    while (this.splats.length > 30) g.scene.remove(this.splats.shift().mesh);
  }

  // A Web Blast went off: wrap up everything close by.
  burst(at, block) {
    const g = this.game;
    const adv = this.adv;
    const R = 5;
    g.fx.burst(at.x, at.y, at.z, WHITE, 40, { speed: 7, size: 0.12, up: 1, life: 0.8, spread: 0.5 });
    g.sound.splat();
    g.sound.webBlast(1);
    if (block) this.splat(at, block, 3.2);
    for (const m of g.mobs.list) if (m.state === 'live' && m.pos.distanceTo(at) < R) this.wrap('mob', m, 6);
    for (const o of adv.police.officers()) if (o.pos.distanceTo(at) < R) this.wrap('officer', o, 6);
    for (const person of adv.people) if (!person.giver && person.pos.distanceTo(at) < R) this.wrap('person', person, 5);
    for (const c of adv.cars) if (!c.dead && c !== g.player.driving && c.pos.distanceTo(at) < R + 1.5) this.webCar(c, 3);
  }

  // Spider-sense: something is about to hurt you. Time slows for a moment
  // and the edge of the screen tingles on that side.
  sense(from) {
    const g = this.game;
    const p = g.player;
    if (!this.suited || this.senseCd > 0) return;
    this.senseCd = 2.5;
    this.senseT = 1;
    this.slowT = g.mp ? 0 : 0.55;
    const a = Math.atan2(from.x - p.pos.x, from.z - p.pos.z);
    // 0 = straight ahead of you, clockwise.
    this.senseDir = -(a - (p.yaw + Math.PI));
    g.sound.tingle(1);
    g.voices.say('sense', { cd: 8 });
  }

  // A few moments after spider-sense, shots miss more.
  get dodging() {
    return this.senseT > 0 && this.suited;
  }

  // Sparkles and a sound as the suit goes on.
  suitUp(swap = false) {
    const g = this.game;
    const p = g.player;
    const def = this.suit.def;
    const cols = [new THREE.Color(def.main), new THREE.Color(def.second), new THREE.Color('#ffffff')];
    g.fx.burst(p.pos.x, p.pos.y + p.h * 0.6, p.pos.z, cols, 36, { speed: 3.5, size: 0.09, up: 1.5, life: 0.7, spread: 0.5 * p.size });
    g.sound.suitUp(swap ? 0.6 : 1);
    if (!swap) g.voices.say('suit', { cd: 8 });
    const fl = $('#suit-flash');
    if (fl) {
      fl.style.setProperty('--a', def.main);
      fl.style.setProperty('--b', def.second === def.main ? def.lines : def.second);
    }
    this.flashT = 1;
  }

  // --- Drawing ----------------------------------------------------------------

  // Third-person poses on top of the normal animation.
  pose(model, dt) {
    const g = this.game;
    const p = g.player;
    const P = model.parts;
    model.root.rotation.x = 0;
    model.root.updateMatrixWorld(true);
    // Point an arm at something in the world.
    const point = (arm, at) => {
      const s = arm.getWorldPosition(vA);
      const d = vB.subVectors(at, s).normalize();
      mA.extractRotation(arm.parent.matrixWorld).invert();
      d.applyMatrix4(mA).normalize();
      arm.quaternion.setFromUnitVectors(DOWN, d);
    };
    if (this.anchor && this.shootK > 0.2) {
      const tip = this.webPt || this.anchor;
      point(this.alt || this.mode !== 'swing' ? P.armR : P.armL, tip);
      if (this.mode === 'zip') point(P.armL, tip);
      if (this.mode === 'swing') {
        P.legR.rotation.x = -0.9;
        P.legL.rotation.x = -0.25;
        P.hips.rotation.x = 0.25;
      }
    } else if (this.crawl) {
      const s = Math.sin(this.crawlT * 7);
      model.root.rotation.y = Math.atan2(this.crawl.x, this.crawl.z);
      P.armR.rotation.set(-2.7 + s * 0.4, 0, -0.2);
      P.armL.rotation.set(-2.7 - s * 0.4, 0, 0.2);
      P.legR.rotation.set(-0.6 - s * 0.4, 0, 0.1);
      P.legL.rotation.set(-0.6 + s * 0.4, 0, -0.1);
      P.hips.rotation.x = -0.15;
      model.root.position.x += this.crawl.x * 0.12;
      model.root.position.z += this.crawl.z * 0.12;
    } else if (this.gliding) {
      P.armR.rotation.set(0, 0, 1.45);
      P.armL.rotation.set(0, 0, -1.45);
      P.legR.rotation.set(0.25, 0, 0.15);
      P.legL.rotation.set(0.25, 0, -0.15);
      model.root.rotation.x = -1.1;
      model.root.position.y += 0.5 * p.size;
    } else if (this.landT > 0) {
      // Superhero landing: one knee down, a fist on the ground.
      const k = Math.min(1, this.landT / 0.3);
      P.hips.rotation.x = 0.7 * k;
      P.hips.position.y -= 3.5 * k * 0.056;
      P.legR.rotation.x = -1.5 * k;
      P.legL.rotation.x = 0.4 * k;
      P.armR.rotation.set(-0.3 * k, 0, 0.2 * k);
      P.armL.rotation.set(-1.2 * k, 0, -0.9 * k);
      P.head.rotation.x = -0.3 * k;
    }
    if (this.flip > 0) model.root.rotation.x = -Math.min(1, this.flip / 0.65) * Math.PI * 2;
    this.updateWings(model, this.gliding);
  }

  updateWings(model, on) {
    if (on && !this.wings) {
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const geo = new THREE.BufferGeometry();
        // A triangle from the wrist to the hip.
        const s = 0.056;
        geo.setAttribute('position', new THREE.Float32BufferAttribute([side * 4 * s, 22 * s, 0, side * 16 * s, 22 * s, 0, side * 4 * s, 12 * s, 0], 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0], 2));
        g.add(new THREE.Mesh(geo, this.wingMat));
      }
      this.wings = g;
      model.root.add(g);
    }
    if (!on && this.wings) this.removeWings();
  }

  removeWings() {
    if (!this.wings) return;
    this.wings.parent?.remove(this.wings);
    this.wings.traverse((o) => o.isMesh && o.geometry.dispose());
    this.wings = null;
  }

  drawRope(from, to, dt) {
    const g = this.game;
    const cam = g.camera.position;
    const tp = g.player.thirdPerson;
    const pos = this.rope.geometry.attributes.position;
    this.shootK = Math.min(1, this.shootK + dt / 0.09);
    const end = vC.copy(from).lerp(to, this.shootK);
    const len = from.distanceTo(end);
    // Slack when the rope is longer than the gap.
    const sag = this.mode === 'swing' ? Math.max(0, this.ropeLen - len) * 0.45 : 0;
    const wig = (1 - this.shootK) * 0.25;
    for (let i = 0; i <= ROPE_N; i++) {
      const f = i / ROPE_N;
      const pt = vA.copy(from).lerp(end, f);
      // About the same thickness on screen near and far.
      const w = Math.min(0.08, Math.max(tp ? 0.03 : 0.006, pt.distanceTo(cam) * 0.0028));
      pt.y -= Math.sin(f * Math.PI) * sag;
      pt.x += Math.sin(f * 20 + performance.now() / 40) * wig * f;
      const next = vB.copy(from).lerp(end, Math.min(1, f + 0.05));
      const tan = next.sub(vD.copy(from).lerp(end, Math.max(0, f - 0.05))).normalize();
      const side = vD.subVectors(cam, pt).cross(tan).normalize().multiplyScalar(w);
      pos.setXYZ(i * 2, pt.x + side.x, pt.y + side.y, pt.z + side.z);
      pos.setXYZ(i * 2 + 1, pt.x - side.x, pt.y - side.y, pt.z - side.z);
    }
    pos.needsUpdate = true;
    this.rope.visible = true;
  }

  update(realDt) {
    const g = this.game;
    const p = g.player;
    const adv = this.adv;
    const dt = realDt;
    // The suit.
    if (this.suit.update(dt, p.held === WEB_SLOT && !p.dead)) this.suitUp();
    this.crimes.update(dt);
    // Spider-sense and slow motion.
    this.senseCd -= dt;
    this.senseT = Math.max(0, this.senseT - dt * 1.4);
    this.slowT = Math.max(0, this.slowT - dt / Math.max(0.3, g.timeScale || 1));
    g.timeScale = this.slowT > 0 ? 0.4 : Math.min(1, (g.timeScale || 1) + dt * 3);
    document.body.classList.toggle('sense', this.senseT > 0);
    const se = $('#sense');
    if (se && this.senseT > 0) se.style.setProperty('--dir', `${this.senseDir}rad`);
    if (this.suited) this.watchDanger();
    // Web balls in flight.
    for (const b of this.balls) {
      b.life -= dt;
      const prev = vA.copy(b.pos);
      b.vel.y -= (b.big ? 2.5 : 6) * dt;
      b.pos.addScaledVector(b.vel, dt);
      const seg = vB.copy(b.pos).sub(prev);
      const len = seg.length();
      if (len < 1e-6) continue;
      seg.divideScalar(len);
      let best = null;
      const wb = g.world.raycast(prev.x, prev.y, prev.z, seg.x, seg.y, seg.z, len + 0.05);
      if (wb) best = { t: wb.t, block: wb };
      const mh = g.mobs.raycast(prev, seg, best ? best.t : len + 0.1);
      if (mh) best = { t: mh.t, mob: mh.mob };
      const ah = adv.traceCars(prev, seg, best ? best.t : len + 0.1);
      if (ah && ah.car && ah.car === p.driving) {
        // Don't web your own car.
      } else if (ah) best = { t: ah.t, car: ah.car, officer: ah.officer };
      for (const person of adv.people) {
        const t = person.hitTest(prev, seg, best ? best.t : len + 0.1);
        if (t !== null) best = { t, person };
      }
      if (best) {
        const at = prev.clone().addScaledVector(seg, best.t);
        if (b.big) this.burst(at, best.block);
        else this.stick(best, at);
        b.life = 0;
      } else if (b.big && b.life <= 0) this.burst(b.pos.clone(), null);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += dt * 12;
      b.mesh.rotation.y += dt * 7;
    }
    for (const b of this.balls) if (b.life <= 0) g.scene.remove(b.mesh);
    this.balls = this.balls.filter((b) => b.life > 0);
    for (const s of this.splats) {
      s.t -= dt;
      if (s.t <= 0) g.scene.remove(s.mesh);
    }
    this.splats = this.splats.filter((s) => s.t > 0);
    // Cocoons follow whoever is inside, until they break free.
    for (const [e, c] of this.cocoons) {
      const alive = c.kind === 'mob' ? e.state === 'live' && !e.gone : c.kind === 'person' ? adv.people.includes(e) && e.visible !== false : adv.police.officers().includes(e) && e.state !== 'down';
      const held = alive && e.webT > 0;
      if (!held) {
        g.scene.remove(c.mesh);
        this.cocoons.delete(e);
        continue;
      }
      const hgt = c.kind === 'mob' ? e.h : 1.8;
      const wid = c.kind === 'mob' ? e.hw * 2.3 : 0.85;
      c.mesh.scale.set(wid, hgt * 0.9, wid);
      c.mesh.position.set(e.pos.x, e.pos.y + hgt * 0.47, e.pos.z);
      c.mesh.rotation.y = e.yaw || 0;
    }
    // Swapped away from the web shooters mid-swing.
    if (this.anchor && !this.on) this.release(false);
    if (!this.on) {
      this.crawl = null;
      this.gliding = false;
      p.crawl = false;
    }
    // The web line.
    if (this.anchor) this.drawRope(this.handPos(this.ropeFrom, !this.alt && this.mode === 'swing'), this.webPt || this.anchor, dt);
    else this.rope.visible = false;
    // Flips, landings, camera roll and FOV, speed lines, wind.
    if (this.flip > 0) {
      this.flip += dt;
      if (this.flip > 0.65) this.flip = 0;
    }
    this.landT = Math.max(0, this.landT - dt);
    if (this.flashT > 0 || this.flashShown) {
      this.flashT = Math.max(0, (this.flashT || 0) - dt / 0.7);
      const fl = $('#suit-flash');
      const f = this.flashT;
      if (fl) fl.style.opacity = String(f > 0.8 ? (1 - f) * 3.75 : f * 0.94);
      this.flashShown = f > 0;
    }
    const sp = p.vel.length();
    const flying = p.webFly && !p.onGround;
    const cr = Math.cos(p.yaw) * p.vel.x - Math.sin(p.yaw) * p.vel.z;
    const wantRoll = this.mode === 'swing' ? -cr * 0.012 : this.gliding ? -cr * 0.008 : 0;
    this.roll += (Math.max(-0.25, Math.min(0.25, wantRoll)) - this.roll) * Math.min(1, dt * 5);
    this.fovKick += ((flying ? Math.min(20, Math.max(0, sp - 9) * 0.9) : 0) - this.fovKick) * Math.min(1, dt * 4);
    const sl = $('#speedlines');
    if (sl) sl.style.opacity = String(flying && sp > 16 ? Math.min(0.9, (sp - 16) / 16) : 0);
    g.sound.wind(flying ? Math.min(1, sp / 30) : 0);
    // The hands.
    this.thrust = Math.max(0, this.thrust - dt * 4);
    this.thrustL = Math.max(0, this.thrustL - dt * 4);
    const show = this.on && !p.thirdPerson;
    this.hands.visible = show;
    if (show) this.chadHands();
    if (show) {
      const t = performance.now() / 1000;
      const bob = Math.sin(t * 2) * 0.006 + Math.sin(p.walkPhase) * 0.012 * p.walkAmt;
      const k = this.thrust;
      const kl = this.thrustL;
      const hr = this.handR;
      const hl = this.handL;
      hr.position.set(0.3 - k * 0.06, -0.34 + bob + k * 0.1, -0.55 - k * 0.2);
      hl.position.set(-0.3 + kl * 0.06, -0.35 - bob + kl * 0.1, -0.55 - kl * 0.2);
      hr.rotation.set(0.15 + k * 0.4, -0.12, 0);
      hl.rotation.set(0.15 + kl * 0.4, 0.12, 0);
      if (this.anchor && this.shootK > 0.2) {
        const armUp = this.mode === 'zip' ? 0.7 : 1.0;
        if (this.alt || this.mode !== 'swing') hr.rotation.x = 0.15 + armUp;
        if (!this.alt || this.mode === 'zip') hl.rotation.x = 0.15 + armUp;
      } else if (this.crawl) {
        const s = Math.sin(this.crawlT * 7);
        hr.position.y = -0.2 + s * 0.08;
        hl.position.y = -0.2 - s * 0.08;
        hr.rotation.x = hl.rotation.x = 1.2;
      } else if (this.gliding) {
        hr.position.set(0.5, -0.3, -0.45);
        hl.position.set(-0.5, -0.3, -0.45);
        hr.rotation.z = -0.5;
        hl.rotation.z = 0.5;
      }
      if (this.charging) {
        const c = Math.min(1, (this.chargeT - 0.35) / 0.3);
        hr.position.x += (Math.random() - 0.5) * 0.006 * c;
        this.glowMat.color.setRGB(0.55 + 0.45 * c, 0.9, 1);
      } else this.glowMat.color.set('#8fe8ff');
    }
    if (!this.on) document.body.classList.remove('web-ok', 'web-charge');
  }

  // Things about to hit you set off your spider-sense.
  watchDanger() {
    const p = this.game.player;
    for (const c of this.adv.cars) {
      if (c.dead || c === p.driving || Math.abs(c.speed) < 8) continue;
      const dx = p.pos.x - c.pos.x;
      const dz = p.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 12 || Math.abs(p.pos.y - c.pos.y) > 2) continue;
      const f = c.forward(vA);
      if ((f.x * dx + f.z * dz) / d > 0.9 && d / Math.abs(c.speed) < 0.9) this.sense(c.pos);
    }
    for (const m of this.game.mobs.list) {
      if (m.state !== 'live' || m.attackT < 0 || m.attackT > 0.15) continue;
      if (m.pos.distanceTo(p.pos) < 3.5) this.sense(m.pos);
    }
  }
}

export function webHud(on) {
  const el = $('#web-hint');
  if (el) el.hidden = !on;
}

export { SUITS };
