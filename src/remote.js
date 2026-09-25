import * as THREE from 'three';
import { buildHumanoid, holdGun, PX } from './model.js';
import { GUNS, parseBuildCode } from './weapons.js';
import { B } from './world.js';
import { Rig, posePlayer } from './anim.js';
import { makeSkinTexture, paintOutfit, DEFAULT_OUTFIT } from './skin.js';
import { loadImage, clamp, wrapAngle } from './util.js';

// Other players in a multiplayer game, drawn with their own skins.

export const F = { crouch: 1, sprint: 2, ground: 4, dead: 8, hurt: 16, water: 32 };

function nameplate(name) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = "600 30px 'Pixelify Sans', ui-monospace, monospace";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(name).width) + 20;
  c.width = w;
  c.height = 44;
  ctx.font = font;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 10, 23);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set((w / 44) * 0.3, 0.3, 1);
  return sprite;
}

class RemotePlayer {
  constructor(game, info) {
    this.game = game;
    this.id = info.id;
    this.name = info.name;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hw = 0.3;
    this.h = 1.8;
    this.dead = false;
    this.deadT = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.score = 0;
    this.kills = 0;
    this.buf = [];
    this.invuln = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.heat = 0;
    this.hasState = false;
    this.gunKey = 'ember|';
    this.blockId = 0;
    this.beamT = 0;
    this.wasGround = true;
    this.lastVy = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 64;
    paintOutfit(this.canvas, DEFAULT_OUTFIT, false);
    this.texture = makeSkinTexture(this.canvas);
    this.slim = false;
    this.build();
    this.tag = nameplate(this.name);
    this.tag.visible = false;
    game.scene.add(this.tag);
    if (info.skin) this.setSkin(info.skin, info.slim);
    if (info.state) this.pushState(info.state);
  }

  build() {
    const scene = this.game.scene;
    if (this.model) {
      scene.remove(this.model.root);
      this.model.dispose();
      this.gun.userData.dispose();
    }
    this.model = buildHumanoid(this.texture, { slim: this.slim });
    this.gun = this.makeGun();
    this.cube = new THREE.Mesh(this.game.combat.blockGeo(this.blockId || B.COBBLE), this.cubeMat());
    this.cube.scale.setScalar(0.22 / 0.3);
    this.cube.position.set(0, -11 * PX, 1.5 * PX);
    this.cube.visible = false;
    this.model.parts.armR.add(this.cube);
    this.rig = new Rig(this.model);
    this.model.root.visible = this.hasState;
    scene.add(this.model.root);
  }

  makeGun() {
    const [id, code] = this.gunKey.split('|');
    const gunId = GUNS[id] ? id : 'ember';
    return holdGun(this.model, gunId, parseBuildCode(gunId, code));
  }

  cubeMat() {
    const c = this.game.combat;
    if (!c.blockMat) c.blockMat = new THREE.MeshLambertMaterial({ map: this.game.atlas.texture });
    return c.blockMat;
  }

  // Show whatever they are holding: their exact gun build, or a block.
  setHeld(gunId, code, block) {
    if (gunId && GUNS[gunId]) {
      const key = `${gunId}|${code || ''}`;
      if (key !== this.gunKey) {
        this.gunKey = key;
        this.model.parts.armR.remove(this.gun);
        this.gun.userData.dispose();
        this.gun = this.makeGun();
      }
      this.gun.visible = true;
      this.cube.visible = false;
    } else {
      this.gun.visible = false;
      this.cube.visible = true;
      if (block && block !== this.blockId) {
        this.blockId = block;
        this.cube.geometry = this.game.combat.blockGeo(block);
      }
    }
  }

  async setSkin(dataURL, slim) {
    try {
      const img = await loadImage(dataURL);
      if (img.width === 64 && img.height === 64) {
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(img, 0, 0);
        this.texture.needsUpdate = true;
      }
    } catch {
      /* keep the default skin */
    }
    if (!!slim !== this.slim) {
      this.slim = !!slim;
      this.build();
    }
  }

  pushState(s) {
    if (!s || !s.p) return;
    this.buf.push({ t: performance.now(), x: s.p[0], y: s.p[1], z: s.p[2], yaw: s.y, pitch: s.pi, f: s.f | 0, r: s.r ?? -1, a: s.a || 0 });
    if (typeof s.w === 'string') this.setHeld(s.w, s.wb, s.bk | 0);
    if (s.sw) this.swing = 1;
    if (this.buf.length > 30) this.buf.shift();
    this.score = s.sc | 0;
    this.kills = s.k | 0;
    if (!this.hasState) {
      this.hasState = true;
      this.pos.set(s.p[0], s.p[1], s.p[2]);
    }
  }

  // Called by the host's mobs when they hit this player.
  hurt(amount, from, source) {
    if (this.dead || this.invuln > 0) return;
    this.invuln = 0.4;
    this.game.mp.sendHurt(this.id, amount, from, source);
  }

  onShot(from, ends, m) {
    const g = this.game;
    const color = new THREE.Color(typeof m.c === 'string' && /^[0-9a-f]{6}$/i.test(m.c) ? '#' + m.c : '#ffb040');
    // Start the tracer at the gun in their hand when we can see it.
    const start = this.model.root.visible ? this.gun.userData.muzzle.getWorldPosition(new THREE.Vector3()) : from;
    if (m.bm) {
      this.beamT = 0.15;
      this.showBeam(start, ends[0], color);
    } else {
      this.recoil = 1;
      if (!m.q) this.flashT = 0.05;
      for (const e of ends) {
        if (m.z) g.combat.lightning(start, e, color);
        else g.tracers.fire(start, e, m.q ? 0x777777 : color.getHex(), ends.length > 1 ? 0.022 : 0.035);
      }
    }
    this.heat = Math.min(1, this.heat + 0.06);
    const d = start.distanceTo(g.player.pos);
    const frame = GUNS[m.g] ? GUNS[m.g].frame : 'rifle';
    if (d < 50 && !m.bm) g.sound.gunshot(frame, !!m.q, (1 - d / 50) * 0.8);
  }

  showBeam(from, to, color) {
    if (!this.beam) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0, 0.5);
      this.beam = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.game.scene.add(this.beam);
    }
    this.beam.material.color.copy(color);
    this.beam.position.copy(from);
    this.beam.lookAt(to);
    const w = 0.05 + Math.random() * 0.03;
    this.beam.scale.set(w, w, Math.max(0.01, from.distanceTo(to)));
    this.beam.visible = true;
  }

  update(dt) {
    if (!this.hasState) return;
    this.invuln -= dt;
    this.beamT -= dt;
    if (this.beam && this.beamT <= 0) this.beam.visible = false;
    this.swing = Math.max(0, (this.swing || 0) - dt * 4);
    this.recoil *= Math.exp(-14 * dt);
    this.flashT -= dt;
    this.heat = Math.max(0, this.heat - dt * 0.45);
    this.gun.userData.shroud.position.z = this.recoil * 0.03;
    this.gun.userData.setHeat(this.heat);
    this.gun.userData.showFlash(this.flashT > 0);
    // Draw where they were ~110 ms ago, blending between the two updates
    // around that moment, so movement stays smooth on a bumpy connection.
    const rt = performance.now() - 110;
    const buf = this.buf;
    let a = buf[0];
    let b = buf[0];
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= rt) {
        a = buf[i];
        b = buf[i + 1] || buf[i];
        break;
      }
    }
    const k = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
    const ox = this.pos.x;
    const oy = this.pos.y;
    const oz = this.pos.z;
    this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    if (dt > 0) {
      const s = Math.min(1, dt * 12);
      this.vel.x += ((this.pos.x - ox) / dt - this.vel.x) * s;
      this.vel.y += ((this.pos.y - oy) / dt - this.vel.y) * s;
      this.vel.z += ((this.pos.z - oz) / dt - this.vel.z) * s;
    }
    this.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * k;
    this.pitch = a.pitch + (b.pitch - a.pitch) * k;
    const f = b.f;
    const crouch = !!(f & F.crouch);
    const ground = !!(f & F.ground);
    const dead = !!(f & F.dead);
    if (dead && !this.dead) this.deadT = 0;
    this.dead = dead;
    if (dead) this.deadT += dt;
    this.h = crouch ? 1.5 : 1.8;
    const landed = ground && !this.wasGround && this.lastVy < -7 ? Math.min(1, (-this.lastVy - 7) / 14) : 0;
    this.wasGround = ground;
    this.lastVy = this.vel.y;

    const m = this.model;
    m.root.visible = !(dead && this.deadT > 2.5);
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw + Math.PI;
    const hurt = f & F.hurt ? 1 : 0;
    const flash = hurt || (dead ? 0.5 : 0);
    for (const mat of m.materials) mat.emissive.setRGB(0.6 * flash, 0.05 * flash, 0.03 * flash);
    posePlayer(
      this.rig,
      {
        speed: Math.hypot(this.vel.x, this.vel.z),
        sprint: !!(f & F.sprint),
        crouch,
        onGround: ground,
        water: !!(f & F.water),
        vy: this.vel.y,
        pitch: this.pitch,
        aim: b.a,
        recoil: this.recoil,
        reload: b.r,
        hurt,
        landed,
        dead,
        deadT: this.deadT,
      },
      dt,
    );
    if (this.swing > 0) m.parts.armR.rotation.x -= Math.sin(this.swing * Math.PI) * 0.8;
    this.tag.visible = m.root.visible;
    this.tag.position.set(this.pos.x, this.pos.y + (crouch ? 1.8 : 2.15), this.pos.z);
  }

  dispose() {
    const scene = this.game.scene;
    scene.remove(this.model.root);
    scene.remove(this.tag);
    if (this.beam) {
      scene.remove(this.beam);
      this.beam.geometry.dispose();
      this.beam.material.dispose();
    }
    this.gun.userData.dispose();
    this.model.dispose();
    this.texture.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

export class RemotePlayers {
  constructor(game) {
    this.game = game;
    this.map = new Map();
  }

  add(info) {
    if (this.map.has(info.id)) return this.map.get(info.id);
    const r = new RemotePlayer(this.game, info);
    this.map.set(info.id, r);
    return r;
  }

  get(id) {
    return this.map.get(id);
  }

  remove(id) {
    const r = this.map.get(id);
    if (!r) return;
    r.dispose();
    this.map.delete(id);
  }

  clear() {
    for (const r of this.map.values()) r.dispose();
    this.map.clear();
  }

  list() {
    return [...this.map.values()];
  }

  update(dt) {
    for (const r of this.map.values()) r.update(dt);
  }
}
