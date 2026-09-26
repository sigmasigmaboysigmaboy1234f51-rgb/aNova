import * as THREE from 'three';
import { $ } from './util.js';

// Web shooters (Adventure mode). Press 8 to put them on.
//   Left click   shoot a web ball: it sticks mobs, cars, police officers
//                and people to the spot for a few seconds.
//   Right click  (hold) shoot a web line at a building and swing on it.
//                Let go to fly off with all that speed.
//   Space        while swinging: pull yourself up the web (zip).

export const WEB_SLOT = 7;
const RANGE = 60;
const WHITE = [new THREE.Color('#ffffff'), new THREE.Color('#e8eef2'), new THREE.Color('#cfd8e0')];
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();

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

export class Webs {
  constructor(adv) {
    this.adv = adv;
    this.game = adv.game;
    this.anchor = null;
    this.ropeLen = 0;
    this.shotCd = 0;
    this.balls = [];
    this.splats = [];
    this.thrust = 0;
    // The web line: a thin white box stretched between hand and anchor.
    this.line = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshBasicMaterial({ color: '#f4f6f8' }));
    this.line.visible = false;
    this.game.scene.add(this.line);
    this.ballGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.ballMat = new THREE.MeshBasicMaterial({ color: '#f4f6f8' });
    this.splatGeo = new THREE.PlaneGeometry(0.9, 0.9);
    this.splatMat = new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.buildHands();
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
    for (const b of this.balls) s.remove(b.mesh);
    for (const sp of this.splats) s.remove(sp.mesh);
    this.ballGeo.dispose();
    this.ballMat.dispose();
    this.splatGeo.dispose();
    this.splatMat.dispose();
    this.game.viewScene.remove(this.hands);
    this.hands.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.release(true);
  }

  // Two gloved hands with web shooters on the wrists, for first person.
  buildHands() {
    const g = new THREE.Group();
    const glove = new THREE.MeshLambertMaterial({ color: '#c42a2a' });
    const band = new THREE.MeshLambertMaterial({ color: '#9aa0a8' });
    const nozzle = new THREE.MeshBasicMaterial({ color: '#39b8ff' });
    const hand = (side) => {
      const h = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), glove);
      arm.position.z = 0.1;
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), band);
      cuff.position.z = -0.12;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), nozzle);
      tip.position.set(0, 0.07, -0.14);
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.12), glove);
      fist.position.z = -0.24;
      h.add(arm, cuff, tip, fist);
      h.position.set(side * 0.3, -0.34, -0.55);
      h.rotation.set(0.15, side * -0.12, 0);
      g.add(h);
      return h;
    };
    this.handR = hand(1);
    this.handL = hand(-1);
    g.visible = false;
    g.scale.setScalar(0.8);
    this.game.viewScene.add(g);
    this.hands = g;
  }

  get on() {
    const p = this.game.player;
    return p.held === WEB_SLOT && !p.driving && !p.dead;
  }

  // Where the web comes out of: your right hand.
  handPos(out) {
    const g = this.game;
    const p = g.player;
    if (p.thirdPerson) {
      p.model.parts.armR.getWorldPosition(out);
      return out.setY(out.y - 0.45);
    }
    const cam = g.camera;
    return out.set(0.3, -0.28, -0.6).applyQuaternion(cam.quaternion).add(cam.position);
  }

  // What's the aim pointing at, within reach? (A block to swing from.)
  aimPoint() {
    const g = this.game;
    const o = g.camera.position;
    const d = g.player.aimDir(vA);
    const hit = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, RANGE);
    if (!hit) return null;
    return new THREE.Vector3(o.x + d.x * hit.t, o.y + d.y * hit.t, o.z + d.z * hit.t);
  }

  // Called by the player each frame while the web shooters are out.
  input(dt) {
    const g = this.game;
    const inp = g.input;
    const p = g.player;
    this.shotCd -= dt;
    if (inp.leftPressed && this.shotCd <= 0) this.shoot();
    if (inp.right && !this.anchor) {
      const at = this.aimPoint();
      if (at) this.attach(at);
      else if (inp.rightPressed !== false && !this.missT) {
        this.missT = 0.4;
        g.sound.thwip(0.4);
      }
    }
    this.missT = Math.max(0, (this.missT || 0) - dt);
    if (!inp.right && this.anchor) this.release(false);
    // The crosshair shows when there's something to swing from.
    const ok = !this.anchor && !!this.aimPoint();
    document.body.classList.toggle('web-ok', ok);
    p.webFly = p.webFly && !p.onGround;
  }

  attach(at) {
    const g = this.game;
    const p = g.player;
    const c = vA.set(p.pos.x, p.pos.y + 1, p.pos.z);
    this.anchor = at.clone();
    this.ropeLen = Math.max(2.5, c.distanceTo(at) * 0.95);
    p.webFly = true;
    this.thrust = 1;
    g.sound.thwip(1);
    // A little hop off the ground to get going.
    if (p.onGround) p.vel.y = Math.max(p.vel.y, 5);
  }

  release(silent) {
    const g = this.game;
    const p = g.player;
    if (this.anchor && !silent) {
      // Let go at the bottom of a swing and you fly.
      const hs = Math.hypot(p.vel.x, p.vel.z);
      p.vel.x *= 1.15;
      p.vel.z *= 1.15;
      p.vel.y = Math.max(p.vel.y, Math.min(9, 2 + hs * 0.25));
      g.sound.whoosh(Math.min(1, hs / 20));
    }
    this.anchor = null;
    this.line.visible = false;
  }

  // Swing physics: the web is a rope, applied to your velocity before you
  // move. Called by the player.
  swing(dt) {
    if (!this.anchor) return;
    const g = this.game;
    const p = g.player;
    const inp = g.input;
    const c = vA.set(p.pos.x, p.pos.y + 1, p.pos.z);
    const d = vB.subVectors(c, this.anchor);
    let L = d.length();
    if (L < 0.01) return;
    d.divideScalar(L);
    // Zip: Space pulls you up the web.
    if (inp.keys.has('Space')) {
      this.ropeLen = Math.max(1.5, this.ropeLen - 22 * dt);
      p.vel.addScaledVector(d, -30 * dt);
      if (L < 2.5) {
        // Made it: spring up over the edge.
        this.release(true);
        p.vel.y = 10;
        g.sound.whoosh(0.6);
        return;
      }
    }
    // Pump the swing with W, like on a playground swing.
    const fwd = p.aimDir(vC).setY(0).normalize();
    if (inp.keys.has('KeyW')) p.vel.addScaledVector(fwd, 16 * dt);
    if (L >= this.ropeLen) {
      const vr = p.vel.dot(d);
      if (vr > 0) p.vel.addScaledVector(d, -vr);
      p.vel.addScaledVector(d, -(L - this.ropeLen) * 10 * dt * 6);
    }
    // Long ropes feel better a bit shorter.
    if (this.ropeLen > 6) this.ropeLen -= dt * 1.5;
  }

  shoot() {
    const g = this.game;
    const p = g.player;
    this.shotCd = 0.35;
    this.thrust = 1;
    const from = this.handPos(new THREE.Vector3());
    const dir = p.aimDir(new THREE.Vector3());
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.balls.push({ pos: from, vel: dir.multiplyScalar(48).addScaledVector(p.vel, 0.3), life: 1.6, mesh });
    g.sound.thwip(0.8);
  }

  // Something got hit by a web ball.
  stick(hit, at, dir) {
    const g = this.game;
    const adv = this.adv;
    g.fx.burst(at.x, at.y, at.z, WHITE, 10, { speed: 2, size: 0.08, up: 0.5, life: 0.6, spread: 0.2 });
    if (hit.mob) {
      const m = hit.mob;
      m.webT = m.def.boss ? 1.2 : 4;
      g.hud.hitmarker(false);
    } else if (hit.car) {
      hit.car.webbed = 3;
      hit.car.speed *= 0.3;
      if (hit.car.type === 'police') adv.police.crime('shootCop');
    } else if (hit.officer) {
      hit.officer.webT = 5;
      adv.police.crime('shootCop');
      g.hud.hitmarker(false);
    } else if (hit.person) {
      hit.person.webT = 3;
      hit.person.scare(g.player.pos, 4);
    } else if (hit.block) {
      // A splat of web on the wall.
      const b = hit.block;
      const n = vA.set(b.nx || 0, b.ny || 0, b.nz || 0);
      const m = new THREE.Mesh(this.splatGeo, this.splatMat);
      m.position.copy(at).addScaledVector(n, 0.02);
      m.lookAt(vB.copy(m.position).add(n));
      g.scene.add(m);
      this.splats.push({ mesh: m, t: 8 });
      while (this.splats.length > 24) g.scene.remove(this.splats.shift().mesh);
    }
    g.sound.splat();
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const adv = this.adv;
    // Web balls in flight.
    for (const b of this.balls) {
      b.life -= dt;
      const prev = vA.copy(b.pos);
      b.vel.y -= 6 * dt;
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
        this.stick(best, at, seg);
        b.life = 0;
      }
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.x += dt * 12;
    }
    for (const b of this.balls) if (b.life <= 0) g.scene.remove(b.mesh);
    this.balls = this.balls.filter((b) => b.life > 0);
    for (const s of this.splats) {
      s.t -= dt;
      if (s.t <= 0) g.scene.remove(s.mesh);
    }
    this.splats = this.splats.filter((s) => s.t > 0);
    // Swapped away from the web shooters mid-swing.
    if (this.anchor && !this.on) this.release(false);
    // The web line.
    if (this.anchor) {
      const from = this.handPos(vA);
      const to = this.anchor;
      const len = from.distanceTo(to);
      this.line.visible = true;
      this.line.position.copy(from).add(to).multiplyScalar(0.5);
      this.line.scale.set(1, 1, len);
      this.line.lookAt(to);
    }
    // The hands.
    this.thrust = Math.max(0, this.thrust - dt * 4);
    const show = this.on && !p.thirdPerson;
    this.hands.visible = show;
    if (show) {
      const t = performance.now() / 1000;
      const bob = Math.sin(t * 2) * 0.006 + Math.sin(p.walkPhase) * 0.012 * p.walkAmt;
      const k = this.thrust;
      this.handR.position.set(0.3 - k * 0.06, -0.34 + bob + k * 0.1, -0.55 - k * 0.2);
      this.handR.rotation.x = 0.15 + (this.anchor ? 0.9 : k * 0.4);
      this.handL.position.set(-0.3, -0.35 - bob, -0.55);
    }
    if (!this.on) document.body.classList.remove('web-ok');
  }
}

// A white web splat on a transparent canvas.
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

export function webHud(on) {
  const el = $('#web-hint');
  if (el) el.hidden = !on;
}
