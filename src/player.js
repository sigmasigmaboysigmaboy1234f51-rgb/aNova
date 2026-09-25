import * as THREE from 'three';
import { moveEntity, boxHitsWorld } from './physics.js';
import { B, BLOCKS, SEA, SY } from './world.js';
import { buildHumanoid, buildBlaster, setBoxUV, PX } from './model.js';
import { Rig, posePlayer, ease } from './anim.js';
import { clamp } from './util.js';

export const PLACEABLE = [B.COBBLE, B.PLANKS, B.BRICK, B.MOSSY];
export const MAG = 16;
export const MAX_HP = 20;
export const RELOAD = 1.1;
const FIRE_GAP = 0.13;
const REACH = 5.5;
const RANGE = 90;
const H_STAND = 1.8;
const H_CROUCH = 1.5;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.27;
const BASE_FOV = 75;

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vD = new THREE.Vector3();
const vE = new THREE.Vector3();
const vF = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

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
  const cell = gun.userData.cell;
  return {
    group,
    flash,
    cell,
    cellY: cell.position.y,
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
    this.h = H_STAND;
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
    this.rig = new Rig(this.model);
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
    this.recoilRoll = 0;
    this.flashT = 0;
    this.onGround = false;
    this.inWater = false;
    this.crouch = false;
    this.sprint = false;
    this.sprintLatch = false;
    this.lastW = -1;
    this.time = 0;
    this.h = H_STAND;
    this.eye = EYE_STAND;
    this.fov = BASE_FOV;
    this.landDip = 0;
    this.landed = 0;
    this.hurtT = 0;
    this.hurtRoll = 0;
    this.strafeRoll = 0;
    this.sinceShot = 99;
    this.equip = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.sprintW = 0;
    this.crouchW = 0;
  }

  aimDir(out) {
    const p = this.pitch + this.kick;
    const cp = Math.cos(p);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(p), -Math.cos(this.yaw) * cp);
  }

  eyePos(out) {
    return out.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
  }

  canStand() {
    const p = this.pos;
    return !boxHitsWorld(this.game.world, p.x - this.hw, p.y, p.z - this.hw, p.x + this.hw, p.y + H_STAND, p.z + this.hw);
  }

  // Is there a block under any corner of our feet?
  supported(x, y, z) {
    const w = this.game.world;
    const fy = Math.floor(y - 0.05);
    const r = this.hw - 0.01;
    return (
      w.solidP(Math.floor(x - r), fy, Math.floor(z - r)) ||
      w.solidP(Math.floor(x + r), fy, Math.floor(z - r)) ||
      w.solidP(Math.floor(x - r), fy, Math.floor(z + r)) ||
      w.solidP(Math.floor(x + r), fy, Math.floor(z + r))
    );
  }

  update(dt) {
    const g = this.game;
    const inp = g.input;
    const w = g.world;
    this.time += dt;
    this.kick *= Math.exp(-10 * dt);
    this.shake *= Math.exp(-9 * dt);
    this.recoil *= Math.exp(-14 * dt);
    this.recoilRoll *= Math.exp(-12 * dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.sinceShot += dt;
    this.equip = Math.min(1, this.equip + dt * 2.2);
    this.flashT -= dt;

    if (this.dead) {
      this.deadT += dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
      moveEntity(w, this, dt);
      this.selection.visible = false;
      this.sprint = false;
      return;
    }

    const [mx, my] = inp.takeMouse();
    const sens = 0.0024 * g.settings.sens;
    this.yaw -= mx * sens;
    this.pitch = clamp(this.pitch - my * sens, -1.55, 1.55);
    this.swayX = clamp(this.swayX + mx * 0.00022, -0.05, 0.05);
    this.swayY = clamp(this.swayY + my * 0.00022, -0.05, 0.05);

    for (let i = 0; i < 4; i++) if (inp.pressed.has('Digit' + (i + 1))) this.slot = i;
    if (inp.wheel) this.slot = (this.slot + (inp.wheel > 0 ? 1 : -1) + 4) % 4;
    if (inp.pressed.has('KeyV') || inp.pressed.has('F5')) this.thirdPerson = !this.thirdPerson;

    const k = inp.keys;
    // Crouch: hold Shift. You stay crouched under low ceilings.
    const wantCrouch = k.has('ShiftLeft') || k.has('ShiftRight');
    if (wantCrouch) this.crouch = true;
    else if (this.crouch && this.canStand()) this.crouch = false;
    this.h = this.crouch ? H_CROUCH : H_STAND;

    const fwdHeld = k.has('KeyW') || k.has('ArrowUp');
    const fwd = (fwdHeld ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    // Sprint: double-tap W (or hold Ctrl in the desktop app, where Ctrl+W
    // can't close the window).
    if (inp.pressed.has('KeyW') || inp.pressed.has('ArrowUp')) {
      if (this.time - this.lastW < 0.3) this.sprintLatch = true;
      this.lastW = this.time;
    }
    if (!fwdHeld) this.sprintLatch = false;
    const ctrl = g.desktop && (k.has('ControlLeft') || k.has('ControlRight'));
    this.sprint = fwd > 0 && (this.sprintLatch || ctrl) && !this.crouch && !this.inWater;

    let wx = -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * side;
    let wz = -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * side;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    this.inWater = this.pos.y < SEA - 0.35;
    let speed = this.sprint ? 7 : this.crouch ? 2.1 : 4.7;
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
    const px = this.pos.x;
    const py = this.pos.y;
    const pz = this.pos.z;
    const wasGround = this.onGround;
    const vyBefore = this.vel.y;
    moveEntity(w, this, dt);

    // Crouching never walks you off an edge.
    if (this.crouch && wasGround && !this.onGround && vyBefore <= 0 && !this.supported(this.pos.x, py, this.pos.z)) {
      if (this.supported(this.pos.x, py, pz)) {
        this.pos.z = pz;
        this.vel.z = 0;
      } else if (this.supported(px, py, this.pos.z)) {
        this.pos.x = px;
        this.vel.x = 0;
      } else {
        this.pos.x = px;
        this.pos.z = pz;
        this.vel.x = this.vel.z = 0;
      }
      this.pos.y = py;
      this.vel.y = 0;
      this.onGround = true;
    }

    if (!wasGround && this.onGround && vyBefore < -7) {
      this.landed = clamp((-vyBefore - 7) / 14, 0.25, 1);
      this.landDip = this.landed;
      const below = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z));
      if (below) g.sound.step(BLOCKS[below].sound);
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    const target = this.onGround && hs > 0.5 ? Math.min(1, hs / 5) : 0;
    this.walkAmt += (target - this.walkAmt) * Math.min(1, dt * 10);
    this.walkPhase += hs * dt * (this.crouch ? 3 : 2.2);
    if (this.onGround && hs > 1 && !this.crouch) {
      this.stepDist += hs * dt;
      if (this.stepDist > 2.1) {
        this.stepDist = 0;
        const below = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z));
        if (below) g.sound.step(BLOCKS[below].sound);
      }
    }
    this.strafeRoll = damp(this.strafeRoll, -side * 0.012, 8, dt);

    this.fireCd -= dt;
    this.placeCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = MAG;
    }
    if (inp.pressed.has('KeyR') && this.ammo < MAG && this.reloadT <= 0) this.startReload();
    if (inp.left && this.fireCd <= 0 && this.reloadT <= 0 && this.ammo > 0 && this.equip > 0.6) this.shoot();
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
    this.sprintLatch = false;
    this.game.sound.reload();
  }

  get reloadFrac() {
    return this.reloadT > 0 ? 1 - this.reloadT / RELOAD : -1;
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
    this.sprintLatch = false;
    this.sinceShot = 0;
    const origin = vA.copy(g.camera.position);
    const dir = this.aimDir(vB);
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    let spread = 0.004 + (moving ? 0.01 : 0) + (this.onGround || this.inWater ? 0 : 0.025);
    if (this.crouch && this.onGround) spread *= 0.35;
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
      mobHit.mob.damage(mobHit.head ? 9 : 4, dir, mobHit.head, at, g.myId);
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
    const from = this.muzzleWorld(vD);
    g.tracers.fire(from, end);
    if (g.mp) g.mp.sendShot(from, end);
    this.kick += this.crouch ? 0.012 : 0.022;
    this.recoil = 1;
    this.recoilRoll = (Math.random() - 0.5) * 0.08;
    this.flashT = 0.05;
    this.shake = Math.max(this.shake, 0.04);
    g.sound.shoot();
    g.stats.shots++;
  }

  // Ray from the camera, limited to arm's reach from the player's eyes.
  targetBlock() {
    const cam = this.game.camera;
    const dir = this.aimDir(vE);
    const extra = this.thirdPerson ? cam.position.distanceTo(this.eyePos(vF)) : 0;
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
    if (g.mp && g.mp.remotes.list().some((r) => !r.dead && overlapsBlock(r, x, y, z))) return;
    const id = PLACEABLE[this.slot];
    w.set(x, y, z, id);
    this.blocks--;
    g.stats.placed++;
    g.sound.place();
    this.recoil = Math.max(this.recoil, 0.4);
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
    this.hurtT = 0.3;
    if (from) {
      const dx = this.pos.x - from.x;
      const dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 6;
      this.vel.z += (dz / l) * 6;
      this.vel.y = Math.max(this.vel.y, 4.5);
      // Tip the camera away from whatever hit you.
      const right = Math.cos(this.yaw) * (dx / l) - Math.sin(this.yaw) * (dz / l);
      this.hurtRoll = (right >= 0 ? -1 : 1) * 0.09;
    } else {
      this.hurtRoll = (Math.random() < 0.5 ? -1 : 1) * 0.09;
    }
    this.shake = 0.12;
    g.hud.damage();
    g.sound.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadT = 0;
      this.killer = source;
      this.crouch = false;
      g.sound.death();
      g.onPlayerDeath();
    }
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  updateCamera(cam, dt) {
    this.eye = damp(this.eye, this.crouch ? EYE_CROUCH : EYE_STAND, 14, dt);
    this.landDip = Math.max(0, this.landDip - dt * 3.2);
    this.hurtRoll *= Math.exp(-7 * dt);
    const eye = this.eyePos(vA);
    eye.y -= Math.sin(this.landDip * Math.PI * 0.5) * 0.16;
    let roll = this.hurtRoll + this.strafeRoll;
    if (this.dead) {
      const k = Math.min(1, this.deadT / 0.7);
      eye.y -= ease(k) * (this.eye - 0.25);
      roll = ease(k) * 0.6;
    } else if (!this.thirdPerson) {
      const bob = this.walkAmt * (1 + this.sprintW * 0.6);
      eye.y += Math.abs(Math.sin(this.walkPhase)) * 0.06 * bob - 0.03 * bob;
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
    // Sprinting widens the view a little.
    const moving = Math.hypot(this.vel.x, this.vel.z) > 2;
    this.fov = damp(this.fov, BASE_FOV + (this.sprint && moving ? 9 : 0) - (this.inWater ? 5 : 0), 8, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  // Everything the third-person model, remote copies and animation need.
  animState() {
    return {
      speed: Math.hypot(this.vel.x, this.vel.z),
      sprint: this.sprint,
      crouch: this.crouch,
      onGround: this.onGround,
      water: this.inWater,
      vy: this.vel.y,
      pitch: this.pitch + this.kick,
      aim: this.sinceShot < 1.4 || this.reloadT > 0 ? 1 : 0,
      recoil: this.recoil,
      reload: this.reloadFrac,
      hurt: this.hurtT / 0.3,
      landed: this.landed,
      dead: this.dead,
      deadT: this.deadT,
    };
  }

  updateModels(dt) {
    const m = this.model;
    m.root.visible = this.thirdPerson;
    const flash = this.hurtT > 0 ? this.hurtT / 0.3 : this.dead ? 0.5 : 0;
    for (const mat of m.materials) mat.emissive.setRGB(0.6 * flash, 0.05 * flash, 0.03 * flash);
    if (this.thirdPerson) {
      m.root.position.copy(this.pos);
      m.root.rotation.y = this.yaw + Math.PI;
      posePlayer(this.rig, this.animState(), dt);
    }
    this.landed = 0;

    const v = this.view;
    v.group.visible = !this.thirdPerson && !this.dead;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.sprintW = damp(this.sprintW, this.sprint && hs > 1 ? 1 : 0, 9, dt);
    this.crouchW = damp(this.crouchW, this.crouch ? 1 : 0, 9, dt);
    const bob = this.walkAmt * (1 + this.sprintW * 0.9);
    const bx = Math.sin(this.walkPhase) * 0.014 * bob;
    const by = -Math.abs(Math.cos(this.walkPhase)) * 0.016 * bob;
    const r = this.reloadFrac;
    const tilt = r < 0 ? 0 : r < 0.2 ? ease(r / 0.2) : r > 0.8 ? ease((1 - r) / 0.2) : 1;
    const eq = 1 - ease(this.equip);
    v.group.position.set(
      v.rest.x + bx - this.swayX * 0.6 - this.sprintW * 0.05 - this.crouchW * 0.035,
      v.rest.y + by + this.swayY * 0.6 - tilt * 0.03 - this.sprintW * 0.05 - this.landDip * 0.05 - eq * 0.35,
      v.rest.z + this.recoil * 0.06 + this.sprintW * 0.03,
    );
    v.group.rotation.set(
      this.recoil * 0.12 - tilt * 0.25 - this.sprintW * 0.4 + this.swayY * 1.2 - eq * 0.9,
      0.04 + this.sprintW * 0.65 + this.swayX * 1.5,
      tilt * 0.6 + this.sprintW * 0.25 + this.recoilRoll,
    );
    this.swayX *= Math.exp(-9 * dt);
    this.swayY *= Math.exp(-9 * dt);
    // Reload: the energy cell drops out and a fresh one slides in.
    let off = 0;
    if (r > 0.2 && r < 0.45) off = ease((r - 0.2) / 0.25);
    else if (r >= 0.45 && r < 0.55) off = 1;
    else if (r >= 0.55 && r < 0.8) off = 1 - ease((r - 0.55) / 0.25);
    v.cell.position.y = v.cellY - off * 0.18;
    v.cell.visible = off < 0.97;
    v.flash.visible = this.flashT > 0;
    if (v.flash.visible) v.flash.rotation.z = Math.random() * Math.PI;
  }
}
