import * as THREE from 'three';
import { moveEntity } from './physics.js';
import { B, BLOCKS, SEA, SY } from './world.js';
import { buildHumanoid, buildBlaster, setBoxUV, PX } from './model.js';
import { clamp } from './util.js';

export const PLACEABLE = [B.COBBLE, B.PLANKS, B.BRICK, B.MOSSY];
export const MAG = 16;
export const MAX_HP = 20;
const RELOAD = 1.1;
const FIRE_GAP = 0.13;
const REACH = 5.5;
const RANGE = 90;

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const vE = new THREE.Vector3();
const vF = new THREE.Vector3();

function overlapsBlock(e, x, y, z) {
  return (
    e.pos.x - e.hw < x + 1 &&
    e.pos.x + e.hw > x &&
    e.pos.z - e.hw < z + 1 &&
    e.pos.z + e.hw > z &&
    e.pos.y < y + 1 &&
    e.pos.y + e.h > y
  );
}

// First-person arm (wearing your skin) holding the blaster.
function buildViewModel(skin) {
  const group = new THREE.Group();
  const gun = buildBlaster();
  group.add(gun);
  const armW = skin.slim ? 3 : 4;
  const U = 0.034;
  const base = new THREE.MeshLambertMaterial({ map: skin.texture });
  const outer = new THREE.MeshLambertMaterial({ map: skin.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const geos = [];
  const part = (u, v, inflate, mat) => {
    const geo = new THREE.BoxGeometry((armW + inflate) * U, (12 + inflate) * U, (4 + inflate) * U);
    setBoxUV(geo, u, v, armW, 12, 4);
    geo.translate(0, (12 * U) / 2, 0);
    geos.push(geo);
    return new THREE.Mesh(geo, mat);
  };
  const arm = new THREE.Group();
  arm.add(part(40, 16, 0, base), part(40, 32, 0.5, outer));
  arm.position.set(0.02, -0.09, 0.15);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.85, -0.3, 0.45).normalize());
  group.add(arm);
  group.position.set(0.25, -0.2, -0.52);
  group.scale.setScalar(0.72);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({
      color: 0xffd36b,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  flash.position.set(0, 0.01, -0.55);
  flash.visible = false;
  gun.add(flash);
  return {
    group,
    flash,
    rest: group.position.clone(),
    dispose() {
      for (const g of geos) g.dispose();
      base.dispose();
      outer.dispose();
    },
  };
}

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hw = 0.3;
    this.h = 1.8;
    this.eyeH = 1.62;
    this.maxHp = MAX_HP;
    this.thirdPerson = false;
    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.6 }),
    );
    this.selection.visible = false;
    game.scene.add(this.selection);
    this.buildModels();
    game.skin.listeners.add(({ model }) => {
      if (model) this.buildModels();
    });
    this.reset(new THREE.Vector3(32.5, 12, 32.5));
  }

  buildModels() {
    const { scene, viewScene, skin } = this.game;
    const wasVisible = this.model ? this.model.root.visible : false;
    if (this.model) {
      scene.remove(this.model.root);
      this.model.dispose();
    }
    this.model = buildHumanoid(skin.texture, { slim: skin.slim });
    const gun = buildBlaster();
    gun.scale.setScalar(0.6);
    gun.rotation.set(-Math.PI / 2, 0, Math.PI);
    gun.position.set(0, -11 * PX, 2 * PX);
    this.model.parts.armR.add(gun);
    this.gun3p = gun;
    this.model.root.visible = wasVisible;
    scene.add(this.model.root);

    if (this.view) {
      viewScene.remove(this.view.group);
      this.view.dispose();
    }
    this.view = buildViewModel(skin);
    viewScene.add(this.view.group);
  }

  reset(spawn) {
    this.pos.copy(spawn);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI * 0.25;
    this.pitch = -0.05;
    this.kick = 0;
    this.hp = MAX_HP;
    this.dead = false;
    this.deadT = 0;
    this.killer = null;
    this.ammo = MAG;
    this.reloadT = 0;
    this.fireCd = 0;
    this.placeCd = 0;
    this.blocks = 24;
    this.slot = 0;
    this.invuln = 0;
    this.sinceHurt = 99;
    this.regenT = 0;
    this.shake = 0;
    this.walkPhase = 0;
    this.walkAmt = 0;
    this.stepDist = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.onGround = false;
    this.inWater = false;
  }

  aimDir(out) {
    const p = this.pitch + this.kick;
    const cp = Math.cos(p);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(p), -Math.cos(this.yaw) * cp);
  }

  eye(out) {
    return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
  }

  update(dt) {
    const g = this.game;
    const inp = g.input;
    const w = g.world;
    this.kick *= Math.exp(-10 * dt);
    this.shake *= Math.exp(-9 * dt);
    this.recoil *= Math.exp(-14 * dt);
    this.flashT -= dt;

    if (this.dead) {
      this.deadT += dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
      moveEntity(w, this, dt);
      this.selection.visible = false;
      return;
    }

    const [mx, my] = inp.takeMouse();
    const sens = 0.0024 * g.settings.sens;
    this.yaw -= mx * sens;
    this.pitch = clamp(this.pitch - my * sens, -1.55, 1.55);

    for (let i = 0; i < 4; i++) if (inp.pressed.has('Digit' + (i + 1))) this.slot = i;
    if (inp.wheel) this.slot = (this.slot + (inp.wheel > 0 ? 1 : -1) + 4) % 4;
    if (inp.pressed.has('KeyV') || inp.pressed.has('F5')) this.thirdPerson = !this.thirdPerson;

    const k = inp.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let wx = -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * side;
    let wz = -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * side;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    this.inWater = this.pos.y < SEA - 0.35;
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    let speed = sprint && fwd > 0 ? 7 : 4.7;
    if (this.inWater) speed *= 0.55;
    const accel = this.onGround ? 14 : this.inWater ? 6 : 3.5;
    const a = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * a;
    this.vel.z += (wz * speed - this.vel.z) * a;
    const jump = k.has('Space');
    if (this.inWater) {
      this.vel.y = Math.max(this.vel.y - 12 * dt, -3);
      if (jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 4);
      if (jump && (this.hitX || this.hitZ)) this.vel.y = 6.5;
    } else {
      this.vel.y = Math.max(this.vel.y - 30 * dt, -45);
      if (jump && this.onGround) {
        this.vel.y = 9;
        g.sound.jump();
      }
    }
    moveEntity(w, this, dt);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    const target = this.onGround && hs > 0.5 ? Math.min(1, hs / 5) : 0;
    this.walkAmt += (target - this.walkAmt) * Math.min(1, dt * 10);
    this.walkPhase += hs * dt * 2.2;
    if (this.onGround && hs > 1) {
      this.stepDist += hs * dt;
      if (this.stepDist > 2.1) {
        this.stepDist = 0;
        const below = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z));
        if (below) g.sound.step(BLOCKS[below].sound);
      }
    }

    this.fireCd -= dt;
    this.placeCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = MAG;
    }
    if (inp.pressed.has('KeyR') && this.ammo < MAG && this.reloadT <= 0) this.startReload();
    if (inp.left && this.fireCd <= 0 && this.reloadT <= 0 && this.ammo > 0) this.shoot();
    if (this.ammo === 0 && this.reloadT <= 0 && this.fireCd <= 0) this.startReload();
    if (inp.right && this.placeCd <= 0) this.tryPlace();

    this.invuln -= dt;
    this.sinceHurt += dt;
    if (this.sinceHurt > 6 && this.hp < this.maxHp) {
      this.regenT += dt;
      if (this.regenT > 2.5) {
        this.regenT = 0;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }

    this.updateSelection();
  }

  startReload() {
    this.reloadT = RELOAD;
    this.game.sound.reload();
  }

  muzzleWorld(out) {
    if (this.thirdPerson) return this.gun3p.userData.muzzle.getWorldPosition(out);
    const cam = this.game.camera;
    return out.set(0.26, -0.22, -0.95).applyQuaternion(cam.quaternion).add(cam.position);
  }

  shoot() {
    const g = this.game;
    const w = g.world;
    this.ammo--;
    this.fireCd = FIRE_GAP;
    const origin = vA.copy(g.camera.position);
    const dir = this.aimDir(vB);
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    const spread = 0.004 + (moving ? 0.01 : 0) + (this.onGround || this.inWater ? 0 : 0.025);
    dir.x += (Math.random() - 0.5) * spread * 2;
    dir.y += (Math.random() - 0.5) * spread * 2;
    dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();

    const mobHit = g.mobs.raycast(origin, dir, RANGE);
    const blockHit = w.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, RANGE);
    let endT = RANGE;
    if (mobHit && (!blockHit || mobHit.t < blockHit.t)) {
      endT = mobHit.t;
      const at = vC.copy(dir).multiplyScalar(endT).add(origin);
      mobHit.mob.damage(mobHit.head ? 9 : 4, dir, mobHit.head, at);
      g.hud.hitmarker(mobHit.head);
      if (mobHit.head) g.sound.headshot();
      else g.sound.hit();
    } else if (blockHit) {
      endT = blockHit.t;
      const at = vC.copy(dir).multiplyScalar(endT).add(origin);
      const res = w.hitBlock(blockHit.x, blockHit.y, blockHit.z, 1);
      if (res) {
        const colors = g.atlas.colors[res.info.side];
        g.fx.burst(at.x + blockHit.nx * 0.06, at.y + blockHit.ny * 0.06, at.z + blockHit.nz * 0.06, colors, 5, {
          speed: 2.5,
          size: 0.07,
          up: 1.5,
          life: 0.5,
          spread: 0.03,
        });
        if (res.broken) {
          g.fx.burst(blockHit.x + 0.5, blockHit.y + 0.5, blockHit.z + 0.5, colors, 18, {
            speed: 3,
            size: 0.13,
            up: 2,
            life: 0.9,
            spread: 0.35,
          });
          g.sound.blockBreak(res.info.sound);
          this.blocks = Math.min(99, this.blocks + 1);
        } else {
          g.sound.blockHit(res.info.sound);
        }
      }
    }
    const end = vC.copy(dir).multiplyScalar(endT).add(origin);
    g.tracers.fire(this.muzzleWorld(vD), end);
    this.kick += 0.022;
    this.recoil = 1;
    this.flashT = 0.05;
    this.shake = Math.max(this.shake, 0.04);
    g.sound.shoot();
    g.stats.shots++;
  }

  // Ray from the camera, limited to arm's reach from the player's eyes.
  targetBlock() {
    const cam = this.game.camera;
    const dir = this.aimDir(vE);
    const extra = this.thirdPerson ? cam.position.distanceTo(this.eye(vF)) : 0;
    const o = cam.position;
    return this.game.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, REACH + extra);
  }

  tryPlace() {
    const g = this.game;
    const w = g.world;
    this.placeCd = 0.2;
    const hit = this.targetBlock();
    if (!hit || (hit.nx === 0 && hit.ny === 0 && hit.nz === 0)) return;
    if (this.blocks <= 0) {
      g.sound.empty();
      g.hud.flashBlocks();
      return;
    }
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (!w.inBounds(x, y, z) || y >= SY - 1 || w.get(x, y, z) !== B.AIR) return;
    if (overlapsBlock(this, x, y, z)) return;
    if (g.mobs.list.some((m) => m.state !== 'dying' && overlapsBlock(m, x, y, z))) return;
    const id = PLACEABLE[this.slot];
    w.set(x, y, z, id);
    this.blocks--;
    g.stats.placed++;
    g.sound.place();
    g.fx.burst(x + 0.5, y + 0.5, z + 0.5, g.atlas.colors[BLOCKS[id].side], 6, {
      speed: 1.2,
      size: 0.08,
      up: 1,
      life: 0.4,
      spread: 0.45,
    });
  }

  updateSelection() {
    const hit = this.targetBlock();
    this.selection.visible = !!hit;
    if (hit) this.selection.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  hurt(amount, from, source) {
    if (this.dead || this.invuln > 0) return;
    const g = this.game;
    this.hp -= amount;
    this.invuln = 0.4;
    this.sinceHurt = 0;
    this.regenT = 0;
    if (from) {
      const dx = this.pos.x - from.x;
      const dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 6;
      this.vel.z += (dz / l) * 6;
      this.vel.y = Math.max(this.vel.y, 4.5);
    }
    this.shake = 0.12;
    g.hud.damage();
    g.sound.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadT = 0;
      this.killer = source;
      g.sound.death();
      g.onPlayerDeath();
    }
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  updateCamera(cam) {
    const eye = this.eye(vA);
    let roll = 0;
    if (this.dead) {
      const k = Math.min(1, this.deadT / 0.7);
      eye.y -= k * 1.2;
      roll = k * 0.6;
    } else if (!this.thirdPerson) {
      eye.y += Math.abs(Math.sin(this.walkPhase)) * 0.06 * this.walkAmt - 0.03 * this.walkAmt;
    }
    const s = this.shake;
    cam.rotation.set(
      this.pitch + this.kick + (Math.random() - 0.5) * s * 0.3,
      this.yaw + (Math.random() - 0.5) * s * 0.3,
      roll,
      'YXZ',
    );
    if (this.thirdPerson && !this.dead) {
      const d = this.aimDir(vB);
      const want = vC.copy(eye).addScaledVector(d, -4.2);
      want.x += Math.cos(this.yaw) * 0.55;
      want.z -= Math.sin(this.yaw) * 0.55;
      want.y += 0.3;
      const dirB = want.sub(eye);
      const total = dirB.length();
      dirB.divideScalar(total);
      const w = this.game.world;
      let safe = 0;
      for (let t = 0.2; t <= total; t += 0.1) {
        if (w.solid(Math.floor(eye.x + dirB.x * t), Math.floor(eye.y + dirB.y * t), Math.floor(eye.z + dirB.z * t))) break;
        safe = t;
      }
      cam.position.copy(eye).addScaledVector(dirB, Math.max(0, safe - 0.2));
    } else {
      cam.position.copy(eye);
    }
    cam.updateMatrixWorld();
  }

  updateModels() {
    const m = this.model;
    const show = this.thirdPerson;
    m.root.visible = show;
    if (show) {
      const P = m.parts;
      m.root.position.copy(this.pos);
      m.root.rotation.y = this.yaw + Math.PI;
      m.root.rotation.z = this.dead ? Math.min(1, this.deadT / 0.4) * (Math.PI / 2) : 0;
      const s = Math.sin(this.walkPhase) * 0.8 * this.walkAmt;
      P.legR.rotation.x = s;
      P.legL.rotation.x = -s;
      const aim = -Math.PI / 2 - (this.pitch + this.kick);
      P.armR.rotation.x = aim - this.recoil * 0.25;
      P.armR.rotation.y = 0.1;
      P.armL.rotation.x = aim + 0.12;
      P.armL.rotation.y = -0.5;
      P.head.rotation.x = -clamp(this.pitch, -1.2, 1.2);
    }
    const v = this.view;
    v.group.visible = !this.thirdPerson && !this.dead;
    const bobX = Math.sin(this.walkPhase) * 0.012 * this.walkAmt;
    const bobY = -Math.abs(Math.cos(this.walkPhase)) * 0.014 * this.walkAmt;
    const r = this.reloadT > 0 ? Math.sin((1 - this.reloadT / RELOAD) * Math.PI) : 0;
    v.group.position.set(v.rest.x + bobX, v.rest.y + bobY - r * 0.12, v.rest.z + this.recoil * 0.07);
    v.group.rotation.set(this.recoil * 0.12 - r * 0.9, 0.04, r * 0.5);
    v.flash.visible = this.flashT > 0;
    if (v.flash.visible) v.flash.rotation.z = Math.random() * Math.PI;
  }
}
