import * as THREE from 'three';
import { buildHumanoid, PX } from './model.js';
import { Rig, poseCivilian } from './anim.js';
import { makeSkinTexture, paintOutfit, randomOutfit } from './skin.js';
import { nameplate } from './remote.js';
import { mulberry32 } from './rng.js';
import { rayBox } from './mob.js';
import { GY } from './city.js';

// People of Blockton. They stroll round the sidewalks, run away from mobs
// and gunfire, and dive out of the way of cars. Point a gun at someone and
// they put their hands up, then run off and phone the police. Some people
// have a job for you: they stand still with a "!" over their heads.

const FIRST = ['Sam', 'Alex', 'Jo', 'Max', 'Riley', 'Kim', 'Lee', 'Pat', 'Charlie', 'Robin', 'Jamie', 'Taylor', 'Casey', 'Drew', 'Morgan', 'Quinn'];

// How long a call to the police takes to go through.
export const CALL_TIME = 3.5;

function markTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = "700 54px 'Pixelify Sans', ui-monospace, monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, 32, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let markTex = null;
let phoneGeo = null;
let phoneMat = null;
let screenMat = null;

// A phone in someone's right hand.
export function addPhone(model) {
  if (!phoneGeo) {
    phoneGeo = new THREE.BoxGeometry(0.07, 0.15, 0.03);
    phoneMat = new THREE.MeshLambertMaterial({ color: '#1d1d22' });
    screenMat = new THREE.MeshBasicMaterial({ color: '#8fd8ff' });
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(phoneGeo, phoneMat);
  const screen = new THREE.Mesh(phoneGeo, screenMat);
  screen.scale.set(0.8, 0.8, 0.4);
  screen.position.z = 0.012;
  g.add(body, screen);
  g.position.set(0, -10.6 * PX, 1.4 * PX);
  g.rotation.x = -Math.PI / 2;
  g.visible = false;
  model.parts.armR.add(g);
  return g;
}

export class Person {
  constructor(adv, opts = {}) {
    this.adv = adv;
    this.game = adv.game;
    const seed = opts.seed ?? (Math.random() * 1e9) | 0;
    const rng = mulberry32(seed);
    this.name = opts.name || FIRST[Math.floor(rng() * FIRST.length)];
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 64;
    paintOutfit(this.canvas, randomOutfit(rng), false, seed);
    this.texture = makeSkinTexture(this.canvas);
    this.model = buildHumanoid(this.texture, { slim: rng() < 0.4 });
    this.rig = new Rig(this.model);
    this.phone = addPhone(this.model);
    this.game.scene.add(this.model.root);
    this.pos = new THREE.Vector3(opts.x || 0, GY + 1, opts.z || 0);
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw || 0;
    this.speed = 0;
    this.loop = opts.loop || null;
    this.leg = 0;
    this.dir = rng() < 0.5 ? 1 : -1;
    this.pace = 1.2 + rng() * 0.5;
    this.fleeT = 0;
    this.fleeFrom = new THREE.Vector3();
    this.knockT = 0;
    this.chatT = 0;
    this.threatT = 0;
    this.handsT = 0;
    this.callT = -1;
    this.callCd = 0;
    this.giver = opts.giver || null;
    this.visible = true;
    if (this.giver) {
      if (!markTex) markTex = markTexture('!', '#ffd23f');
      this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthWrite: false }));
      this.mark.scale.set(0.7, 0.7, 1);
      this.game.scene.add(this.mark);
      this.tag = nameplate(opts.title || this.name);
      this.game.scene.add(this.tag);
    }
    if (this.loop) {
      // Start somewhere along the loop.
      this.leg = Math.floor(rng() * this.loop.length);
      const [ax, az] = this.loop[this.leg];
      const [bx, bz] = this.loop[(this.leg + 1) % this.loop.length];
      const k = rng();
      this.pos.set(ax + (bx - ax) * k, GY + 1, az + (bz - az) * k);
      if (this.dir < 0) this.leg = (this.leg + 1) % this.loop.length;
    }
  }

  dispose() {
    const s = this.game.scene;
    s.remove(this.model.root);
    this.model.dispose();
    this.texture.dispose();
    if (this.mark) s.remove(this.mark);
    if (this.tag) {
      s.remove(this.tag);
      this.tag.material.map.dispose();
      this.tag.material.dispose();
    }
  }

  // Did a shot (or your aim) along this ray reach this person?
  hitTest(o, d, maxT) {
    if (!this.visible) return null;
    const p = this.pos;
    const t = rayBox(o, d, p.x - 0.38, p.y, p.z - 0.38, p.x + 0.38, p.y + 1.9, p.z + 0.38);
    return t >= 0 && t < maxT ? t : null;
  }

  // Something scary happened near here.
  scare(from, t = 5) {
    if (this.giver) return;
    this.fleeT = Math.max(this.fleeT, t);
    this.fleeFrom.copy(from);
  }

  // A car is about to hit us: jump sideways.
  dodge(car) {
    if (this.knockT > 0) return;
    const f = car.forward(new THREE.Vector3());
    const side = (this.pos.x - car.pos.x) * f.z - (this.pos.z - car.pos.z) * f.x > 0 ? 1 : -1;
    this.vel.set(f.z * side * 7, 5, -f.x * side * 7);
    this.knockT = 0.8;
    this.scare(car.pos, 3);
  }

  // You're pointing a gun at them (on = true while you aim).
  aimedAt(on, dt, from) {
    if (this.giver) return;
    if (on) {
      this.threatT += dt;
      this.handsT = 0.6;
      this.fleeFrom.copy(from);
      // Long enough: they'll call the police as soon as they can.
      if (this.threatT > 0.45 && this.callT < 0 && this.callCd <= 0) this.startCall();
    } else this.threatT = Math.max(0, this.threatT - dt);
  }

  // Get the phone out and dial the police.
  startCall() {
    if (this.giver || this.callT >= 0) return;
    this.callT = 0;
    this.callCd = 30;
    this.fleeT = Math.max(this.fleeT, CALL_TIME + 3);
    this.adv.police.onCallStart(this);
  }

  update(dt) {
    const g = this.game;
    this.knockT -= dt;
    this.handsT -= dt;
    this.callCd -= dt;
    if (this.callT >= 0) {
      this.callT += dt;
      if (this.callT >= CALL_TIME) {
        this.callT = -1;
        this.adv.police.onCallDone(this);
      }
    }
    let moveX = 0;
    let moveZ = 0;
    let speed = 0;
    this.webT = Math.max(0, (this.webT || 0) - dt);
    if (this.webT > 0) {
      // Stuck to the spot in a web.
    } else if (this.knockT > 0) {
      // Mid-dive.
      this.vel.y -= 20 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < GY + 1) {
        this.pos.y = GY + 1;
        this.vel.set(0, 0, 0);
      }
    } else if (this.handsT > 0) {
      // Hands up! Frozen to the spot, facing you.
      this.yaw = Math.atan2(this.fleeFrom.x - this.pos.x, this.fleeFrom.z - this.pos.z);
    } else if (this.fleeT > 0) {
      this.fleeT -= dt;
      moveX = this.pos.x - this.fleeFrom.x;
      moveZ = this.pos.z - this.fleeFrom.z;
      speed = 4.2;
    } else if (this.loop && !this.giver) {
      this.chatT -= dt;
      if (this.chatT < -12 && Math.random() < dt * 0.1) this.chatT = 2 + Math.random() * 3;
      if (this.chatT <= 0) {
        const n = this.loop.length;
        const [tx, tz] = this.loop[this.leg];
        moveX = tx - this.pos.x;
        moveZ = tz - this.pos.z;
        if (Math.hypot(moveX, moveZ) < 0.4) this.leg = (this.leg + this.dir + n) % n;
        speed = this.pace;
      }
    } else if (this.giver) {
      // Quest givers face you when you come close.
      const p = g.player;
      if (p.pos.distanceTo(this.pos) < 8) this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    }
    const len = Math.hypot(moveX, moveZ);
    if (len > 0.01 && speed > 0) {
      const nx = this.pos.x + (moveX / len) * speed * dt;
      const nz = this.pos.z + (moveZ / len) * speed * dt;
      const w = g.world;
      // Don't walk into walls or off the edge.
      if (!w.solidP(Math.floor(nx), Math.floor(this.pos.y + 0.5), Math.floor(nz)) && w.solid(Math.floor(nx), Math.floor(this.pos.y - 0.5), Math.floor(nz))) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else if (this.fleeT > 0) this.fleeFrom.set(this.pos.x + (Math.random() - 0.5) * 4, 0, this.pos.z + (Math.random() - 0.5) * 4);
      const want = Math.atan2(moveX, moveZ);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 10);
      this.speed = speed;
    } else this.speed = 0;
    this.sync(dt);
  }

  gesture() {
    if (this.webT > 0) return 'flee';
    if (this.handsT > 0) return 'hands';
    if (this.callT >= 0) return 'phone';
    if (this.fleeT > 0) return 'flee';
    if (this.chatT > 0) return 'wave';
    return null;
  }

  sync(dt) {
    const m = this.model;
    m.root.visible = this.visible;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    poseCivilian(this.rig, { speed: this.speed, gesture: this.gesture(), gT: performance.now() / 1000 }, dt);
    this.phone.visible = this.callT >= 0;
    if (this.mark) {
      const on = this.visible && this.adv.showMark(this);
      this.mark.visible = on;
      this.tag.visible = this.visible;
      const bob = Math.sin(performance.now() / 300) * 0.08;
      this.mark.position.set(this.pos.x, this.pos.y + 2.55 + bob, this.pos.z);
      this.tag.position.set(this.pos.x, this.pos.y + 2.1, this.pos.z);
    }
  }
}
