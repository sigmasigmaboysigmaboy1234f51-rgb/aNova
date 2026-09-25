import * as THREE from 'three';
import { buildHumanoid } from './model.js';
import { Rig, posePlayer } from './anim.js';
import { makeSkinTexture, paintOutfit, randomOutfit } from './skin.js';
import { nameplate } from './remote.js';
import { mulberry32 } from './rng.js';
import { GY } from './city.js';

// People of Blockton. They stroll round the sidewalks, run away from mobs
// and gunfire, and dive out of the way of cars. Some of them have a job
// for you: they stand still with a "!" over their heads.

const FIRST = ['Sam', 'Alex', 'Jo', 'Max', 'Riley', 'Kim', 'Lee', 'Pat', 'Charlie', 'Robin', 'Jamie', 'Taylor', 'Casey', 'Drew', 'Morgan', 'Quinn'];

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

  update(dt) {
    const g = this.game;
    this.knockT -= dt;
    let moveX = 0;
    let moveZ = 0;
    let speed = 0;
    if (this.knockT > 0) {
      // Mid-dive.
      this.vel.y -= 20 * dt;
      this.pos.addScaledVector(this.vel, dt);
      if (this.pos.y < GY + 1) {
        this.pos.y = GY + 1;
        this.vel.set(0, 0, 0);
      }
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

  sync(dt) {
    const m = this.model;
    m.root.visible = this.visible;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    posePlayer(
      this.rig,
      {
        speed: this.speed,
        sprint: this.fleeT > 0,
        crouch: false,
        onGround: this.knockT <= 0,
        water: false,
        vy: this.vel.y,
        pitch: 0,
        aim: 0,
        recoil: 0,
        reload: -1,
        hurt: 0,
        landed: 0,
        dead: false,
        deadT: 0,
      },
      dt,
    );
    // Waving while chatting, arms up when running scared.
    if (this.fleeT > 0) {
      m.parts.armR.rotation.x = -2.8;
      m.parts.armL.rotation.x = -2.8;
    } else if (this.chatT > 0) m.parts.armR.rotation.z = -0.6 - Math.abs(Math.sin(performance.now() / 180)) * 0.5;
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
