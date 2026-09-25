import * as THREE from 'three';
import { moveEntity, boxHitsWorld } from './physics.js';
import { B, BLOCKS, SEA, SY } from './world.js';
import { buildHumanoid, holdGun, setBoxUV, PX } from './model.js';
import { buildGun, CORES } from './gun.js';
import { GUNS, gunStats, cleanBuild, buildCode } from './weapons.js';
import { TILE_UV } from './textures.js';
import { Rig, posePlayer, ease } from './anim.js';
import { attachCosmetics, animateCosmetics, removeCosmetics } from './cosmetics.js';
import { POWERS } from './powerups.js';
import { EMOTES, EMOTE_KEYS, emoteWeight, poseEmote } from './emotes.js';
import { reloadStyle, gunPoints, buildLeftArm, buildShell, reloadPose, inspectPose } from './viewanim.js';
import { clamp } from './util.js';
import { rayBox } from './mob.js';

export const PLACEABLE = [B.COBBLE, B.PLANKS, B.BRICK, B.MOSSY];
export const MAX_HP = 20;
export const MAX_NADES = 5;
const REACH = 5.5;
const H_STAND = 1.8;
const H_CROUCH = 1.5;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.27;
const BASE_FOV = 75;
const SHIELD_COLORS = [new THREE.Color('#6f8cff'), new THREE.Color('#bfe8ff'), new THREE.Color('#ffffff')];
const VIEW_SCALE = 0.6;
const VIEW_REST = new THREE.Vector3(0.22, -0.2, -0.45);
const ZERO3 = [0, 0, 0];
// Where your left shoulder is, in view space: behind you, low and left.
const LEFT_SHOULDER = new THREE.Vector3(-0.3, -0.8, -0.08);
const UP = new THREE.Vector3(0, 1, 0);

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const vE = new THREE.Vector3();
const vF = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const lerp = (a, b, t) => a + (b - a) * t;

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

// One gun in your loadout, with its own ammo and timers.
export class Weapon {
  constructor(id, build) {
    this.id = id;
    this.def = GUNS[id];
    this.build = cleanBuild(id, build);
    this.code = buildCode(this.build);
    this.stats = gunStats(id, this.build);
    this.color = new THREE.Color((CORES[this.stats.core.split('.')[1]] || CORES.ember).beam);
    this.ammo = this.stats.mag;
    this.reloadT = 0;
    this.fireCd = 0;
    this.heat = 0;
    this.spin = 0;
    this.flashT = 0;
    this.beamT = 0;
  }

  get reloadFrac() {
    return this.reloadT > 0 ? 1 - this.reloadT / this.stats.reload : -1;
  }
}

// Your arm (wearing your skin) plus whatever you hold in first person.
function buildArm(skin, geos, base, outer) {
  const armW = skin.slim ? 3 : 4;
  const U = 0.034;
  const part = (u, v, inflate, mat) => {
    const geo = new THREE.BoxGeometry((armW + inflate) * U, (12 + inflate) * U, (4 + inflate) * U);
    setBoxUV(geo, u, v, armW, 12, 4);
    geo.translate(0, (12 * U) / 2, 0);
    geos.push(geo);
    return new THREE.Mesh(geo, mat);
  };
  const arm = new THREE.Group();
  arm.add(part(40, 16, 0, base), part(40, 32, 0.5, outer));
  return arm;
}

function blockCube(atlas, id, size) {
  const geo = new THREE.BoxGeometry(size, size, size);
  const info = BLOCKS[id];
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const tile = f === 2 ? info.top : f === 3 ? info.bottom : info.side;
    const [u0, v0, u1, v1] = TILE_UV[tile];
    uv.setXY(f * 4, u0, v1);
    uv.setXY(f * 4 + 1, u1, v1);
    uv.setXY(f * 4 + 2, u0, v0);
    uv.setXY(f * 4 + 3, u1, v0);
  }
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: atlas.texture }));
}

function buildGunView(skin, weapon) {
  const group = new THREE.Group();
  const gun = buildGun(weapon.id, weapon.build);
  group.add(gun);
  const geos = [];
  const base = new THREE.MeshLambertMaterial({ map: skin.texture });
  const outer = new THREE.MeshLambertMaterial({ map: skin.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const arm = buildArm(skin, geos, base, outer);
  arm.position.set(0.01, -0.1, 0.12);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.85, -0.3, 0.45).normalize());
  group.add(arm);
  // The left hand holds the front of the gun and does the reloading.
  const points = gunPoints(gun);
  const armL = buildLeftArm(skin, geos, base, outer, setBoxUV);
  group.add(armL);
  const shell = weapon.def.frame === 'shotgun' ? buildShell() : null;
  if (shell) {
    shell.visible = false;
    group.add(shell);
  }
  group.position.copy(VIEW_REST);
  group.scale.setScalar(VIEW_SCALE);
  const eye = gun.userData.eye;
  const dir = new THREE.Vector3();
  // The shoulder stays put on screen however the gun tilts, so the arm
  // always reaches back to it.
  const setHand = (x, y, z) => {
    armL.position.set(x, y, z);
    group.updateMatrixWorld();
    dir.copy(LEFT_SHOULDER);
    group.worldToLocal(dir);
    dir.sub(armL.position).normalize();
    armL.quaternion.setFromUnitVectors(UP, dir);
  };
  setHand(points.support.x, points.support.y, points.support.z);
  return {
    group,
    gun,
    armL,
    shell,
    points,
    setHand,
    style: reloadStyle(weapon.def.frame, points.cellTop),
    cell: gun.userData.cell,
    cellY: gun.userData.cell.position.y,
    ads: new THREE.Vector3(-eye.x * VIEW_SCALE, -eye.y * VIEW_SCALE, -0.3 - eye.z * VIEW_SCALE),
    dispose() {
      for (const g of geos) g.dispose();
      base.dispose();
      outer.dispose();
      gun.userData.dispose();
      if (shell) shell.userData.dispose();
    },
  };
}

function buildBlockView(skin, atlas, blockId) {
  const group = new THREE.Group();
  const geos = [];
  const base = new THREE.MeshLambertMaterial({ map: skin.texture });
  const outer = new THREE.MeshLambertMaterial({ map: skin.texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const arm = buildArm(skin, geos, base, outer);
  arm.position.set(0.02, -0.12, 0.05);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.5, -0.6, 0.6).normalize());
  const cube = blockCube(atlas, blockId, 0.15);
  cube.position.set(-0.02, -0.01, -0.1);
  cube.rotation.set(0.2, 0.7, 0);
  group.add(arm, cube);
  group.position.set(0.3, -0.28, -0.5);
  return {
    group,
    blockId,
    dispose() {
      for (const g of geos) g.dispose();
      base.dispose();
      outer.dispose();
      cube.geometry.dispose();
      cube.material.dispose();
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
    this.weapons = [null, null, null];
    this.views = [null, null, null];
    this.guns3p = [null, null, null];
    this.blockView = null;
    this.held = 0;
    this.lastHeld = 3;
    this.blockSlot = 0;
    this.selection = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.6 }),
    );
    this.selection.visible = false;
    game.scene.add(this.selection);
    this.loadWeapons();
    this.buildModels();
    game.skin.listeners.add(({ model }) => {
      if (model) this.buildModels();
    });
    this.styleKey = game.profile.styleCode();
    game.profile.listeners.add(() => {
      const k = game.profile.styleCode();
      if (k === this.styleKey) return;
      this.styleKey = k;
      this.dress();
    });
    this.reset(new THREE.Vector3(32.5, 12, 32.5));
  }

  // --- Loadout -----------------------------------------------------------

  // Pick up the guns in your profile's loadout. Guns that did not change
  // keep their ammo.
  loadWeapons() {
    const prof = this.game.profile;
    let changed = false;
    for (let i = 0; i < 3; i++) {
      const id = prof.loadout[i];
      const cur = this.weapons[i];
      if (!id) {
        if (cur) changed = true;
        this.weapons[i] = null;
        continue;
      }
      const build = prof.builds[id];
      if (cur && cur.id === id && cur.code === buildCode(cleanBuild(id, build))) continue;
      this.weapons[i] = new Weapon(id, build);
      changed = true;
    }
    if (!this.weapons[this.held] && this.held < 3) this.held = this.weapons.findIndex(Boolean);
    if (this.held < 0) this.held = 3;
    return changed;
  }

  refreshLoadout() {
    if (this.loadWeapons()) this.buildModels();
  }

  get weapon() {
    return this.held < 3 ? this.weapons[this.held] : null;
  }

  blockType() {
    return PLACEABLE[this.blockSlot];
  }

  select(slot) {
    if (slot === this.held) return;
    if (slot < 3 && !this.weapons[slot]) return;
    this.inspectT = 0;
    const w = this.weapon;
    if (w) w.reloadT = 0;
    this.lastHeld = this.held;
    this.held = slot;
    if (slot >= 3) this.blockSlot = slot - 3;
    this.equip = 0;
    this.ads = 0;
    this.game.combat.beamTick(this, null, 0, false);
    this.game.sound.equip();
  }

  cycle(dir) {
    for (let n = 1; n <= 7; n++) {
      const s = (this.held + dir * n + 70) % 7;
      if (s >= 3 || this.weapons[s]) {
        this.select(s);
        return;
      }
    }
  }

  buildModels() {
    const { scene, viewScene, skin, atlas } = this.game;
    const wasVisible = this.model ? this.model.root.visible : false;
    if (this.model) {
      scene.remove(this.model.root);
      this.model.dispose();
      for (const g of this.guns3p) if (g) g.userData.dispose();
    }
    this.model = buildHumanoid(skin.texture, { slim: skin.slim });
    this.guns3p = this.weapons.map((w) => (w ? holdGun(this.model, w.id, w.build) : null));
    this.block3p = blockCube(atlas, this.blockType(), 0.22);
    this.block3p.position.set(0, -11 * PX, 1.5 * PX);
    this.model.parts.armR.add(this.block3p);
    this.block3pId = this.blockType();
    this.model.root.visible = wasVisible;
    this.rig = new Rig(this.model);
    scene.add(this.model.root);
    this.dress();

    for (const v of this.views) {
      if (!v) continue;
      viewScene.remove(v.group);
      v.dispose();
    }
    this.views = this.weapons.map((w) => (w ? buildGunView(skin, w) : null));
    for (const v of this.views) if (v) viewScene.add(v.group);
    if (this.blockView) {
      viewScene.remove(this.blockView.group);
      this.blockView.dispose();
    }
    this.blockView = buildBlockView(skin, atlas, this.blockType());
    viewScene.add(this.blockView.group);
  }

  syncBlockModels() {
    const id = this.blockType();
    if (this.blockView.blockId !== id) {
      this.game.viewScene.remove(this.blockView.group);
      this.blockView.dispose();
      this.blockView = buildBlockView(this.game.skin, this.game.atlas, id);
      this.game.viewScene.add(this.blockView.group);
    }
    if (this.block3pId !== id) {
      const old = this.block3p;
      this.block3p = blockCube(this.game.atlas, id, 0.22);
      this.block3p.position.copy(old.position);
      old.parent.add(this.block3p);
      old.parent.remove(old);
      old.geometry.dispose();
      old.material.dispose();
      this.block3pId = id;
    }
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
    this.buffs = {};
    this.stopEmote();
    for (const w of this.weapons) {
      if (!w) continue;
      w.ammo = w.stats.mag;
      w.reloadT = 0;
      w.fireCd = 0;
      w.heat = 0;
      w.spin = 0;
    }
    this.placeCd = 0;
    this.mineCd = 0;
    this.nadeCd = 0;
    this.blocks = 24;
    this.grenades = 2;
    this.invuln = 0;
    this.sinceHurt = 99;
    this.regenT = 0;
    this.shake = 0;
    this.walkPhase = 0;
    this.walkAmt = 0;
    this.stepDist = 0;
    this.recoil = 0;
    this.recoilRoll = 0;
    this.recoilYaw = 0;
    this.swing = 0;
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
    this.ads = 0;
    this.leech = 0;
    this.burnT = 0;
    this.slowT = 0;
    this.slowAmt = 0;
    this.poisonT = 0;
    this.dotT = 0;
    this.dotBy = null;
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

  zoom() {
    const w = this.weapon;
    return w ? lerp(1, w.stats.zoom, this.ads) : 1;
  }

  // How far shots wander right now.
  spreadFor(w) {
    const s = w.stats;
    let spread = s.spread * lerp(s.hip, s.ads, this.ads);
    if (Math.hypot(this.vel.x, this.vel.z) > 1) spread *= 1.6;
    if (!this.onGround && !this.inWater) spread *= 3;
    if (this.crouch && this.onGround) spread *= s.bipod ? 0.35 : 0.6;
    return spread;
  }

  coreColor(w) {
    return w.color;
  }

  update(dt) {
    const g = this.game;
    const inp = g.input;
    const w = g.world;
    this.time += dt;
    this.updateBuffs(dt);
    this.kick *= Math.exp(-10 * dt);
    this.shake *= Math.exp(-9 * dt);
    this.recoil *= Math.exp(-14 * dt);
    this.recoilRoll *= Math.exp(-12 * dt);
    this.swing = Math.max(0, this.swing - dt * 4);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.sinceShot += dt;
    this.equip = Math.min(1, this.equip + dt * 2.6);
    for (const wp of this.weapons) {
      if (!wp) continue;
      wp.heat = Math.max(0, wp.heat - dt * 0.45);
      wp.flashT -= dt;
      wp.fireCd -= dt;
      if (wp !== this.weapon) wp.spin = Math.max(0, wp.spin - dt * 2);
    }

    if (this.dead) {
      this.deadT += dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
      moveEntity(w, this, dt);
      this.selection.visible = false;
      this.sprint = false;
      g.combat.beamTick(this, null, 0, false);
      return;
    }

    const zoom = this.zoom();
    const [mx, my] = inp.takeMouse();
    const sens = (0.0024 * g.settings.sens) / zoom;
    this.yaw -= mx * sens;
    this.pitch = clamp(this.pitch - my * sens * (g.settings.invertY ? -1 : 1), -1.55, 1.55);
    this.swayX = clamp(this.swayX + mx * 0.00022, -0.05, 0.05);
    this.swayY = clamp(this.swayY + my * 0.00022, -0.05, 0.05);

    // Hotbar: 1-3 guns, 4-7 blocks, scroll to cycle, Q for the last thing held.
    for (let i = 0; i < 7; i++) if (inp.pressed.has('Digit' + (i + 1))) this.select(i);
    if (inp.wheel) this.cycle(inp.wheel > 0 ? 1 : -1);
    if (inp.pressed.has('KeyQ')) this.select(this.lastHeld);
    if (inp.pressed.has('KeyV') || inp.pressed.has('F5')) {
      this.thirdPerson = !this.thirdPerson;
      this.emoteView = false;
    }
    for (const [key, id] of EMOTE_KEYS) if (inp.pressed.has(key)) this.startEmote(id);
    // I: show off your gun.
    if (inp.pressed.has('KeyI') && this.weapon && this.weapon.reloadT <= 0) this.inspectT = 0.001;
    if (this.inspectT > 0) {
      this.inspectT += dt;
      if (inp.left || inp.right || (this.weapon && this.weapon.reloadT > 0) || this.inspectT > 2.4) this.inspectT = 0;
    }
    this.updateEmote(dt);
    if (this.held >= 3) this.blockSlot = this.held - 3;

    const weapon = this.weapon;
    const k = inp.keys;
    const cheats = g.cheats;
    const flying = cheats.has('fly');
    const wantCrouch = (k.has('ShiftLeft') || k.has('ShiftRight')) && !flying;
    if (wantCrouch) this.crouch = true;
    else if (this.crouch && this.canStand()) this.crouch = false;
    this.h = this.crouch ? H_CROUCH : H_STAND;

    const fwdHeld = k.has('KeyW') || k.has('ArrowUp');
    const fwd = (fwdHeld ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (inp.pressed.has('KeyW') || inp.pressed.has('ArrowUp')) {
      if (this.time - this.lastW < 0.3) this.sprintLatch = true;
      this.lastW = this.time;
    }
    if (!fwdHeld) this.sprintLatch = false;
    const ctrl = g.desktop && (k.has('ControlLeft') || k.has('ControlRight'));
    const aiming = !!weapon && inp.right && weapon.reloadT <= 0;
    this.sprint = fwd > 0 && (this.sprintLatch || ctrl) && !this.crouch && !this.inWater && !aiming;
    this.ads = damp(this.ads, aiming ? 1 : 0, 14, dt);

    let wx = -Math.sin(this.yaw) * fwd + Math.cos(this.yaw) * side;
    let wz = -Math.cos(this.yaw) * fwd - Math.sin(this.yaw) * side;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    this.inWater = this.pos.y < SEA - 0.35;
    let speed = this.sprint ? 7 : this.crouch ? 2.1 : 4.7;
    if (this.buff('speed')) speed *= 1.45;
    if (cheats.has('speed')) speed *= 2;
    if (flying) speed *= 1.6;
    if (this.slowT > 0) speed *= 1 - this.slowAmt;
    if (weapon) speed *= weapon.stats.mobility * (1 - this.ads * 0.4) * (weapon.spin > 0.3 ? 0.7 : 1);
    if (this.inWater) speed *= 0.55;
    const accel = this.onGround ? 14 : this.inWater ? 6 : 3.5;
    const a = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * a;
    this.vel.z += (wz * speed - this.vel.z) * a;
    const jump = k.has('Space');
    if (flying) {
      // Fly cheat: no gravity. Space goes up, Shift goes down.
      const down = k.has('ShiftLeft') || k.has('ShiftRight');
      this.vel.y += ((jump ? 9 : 0) - (down ? 9 : 0) - this.vel.y) * Math.min(1, dt * 10);
    } else if (this.inWater) {
      this.vel.y = Math.max(this.vel.y - 12 * dt, -3);
      if (jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 4);
      if (jump && (this.hitX || this.hitZ)) this.vel.y = 6.5;
    } else {
      this.vel.y = Math.max(this.vel.y - 30 * dt, -45);
      if (jump && this.onGround) {
        this.vel.y = cheats.has('jump') ? 19 : 9;
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

    this.placeCd -= dt;
    this.mineCd -= dt;
    this.nadeCd -= dt;
    if (weapon) this.updateGun(dt, weapon);
    else {
      g.combat.beamTick(this, null, 0, false);
      if (inp.left && this.mineCd <= 0) this.mine();
      if (inp.right && this.placeCd <= 0) this.tryPlace();
    }
    // F places a block even with a gun out, G throws a grenade.
    if (k.has('KeyF') && this.placeCd <= 0) this.tryPlace();
    if (inp.pressed.has('KeyG') && this.nadeCd <= 0) {
      if (this.grenades > 0) {
        if (!cheats.has('nades')) this.grenades--;
        this.nadeCd = 0.8;
        this.swing = 1;
        g.combat.throwGrenade(this);
      } else {
        g.sound.empty();
        g.hud.popup('No grenades');
        this.nadeCd = 0.5;
      }
    }

    this.invuln -= dt;
    this.sinceHurt += dt;
    this.updateStatus(dt);
    const noRegen = g.variant === 'hardcore' && !g.mp && !g.duel && !g.story;
    if (this.sinceHurt > 6 && this.hp < this.maxHp && this.poisonT <= 0 && !noRegen) {
      this.regenT += dt;
      if (this.regenT > 2.5) {
        this.regenT = 0;
        this.hp = Math.min(this.maxHp, this.hp + 1);
      }
    }
    this.syncBlockModels();
    this.updateSelection();
  }

  updateGun(dt, w) {
    const g = this.game;
    const inp = g.input;
    const s = w.stats;
    // A cheat gun replaces whatever the gun normally shoots.
    if (g.cheats.gunOn()) {
      g.combat.beamTick(this, null, 0, false);
      this.cheatCd = (this.cheatCd || 0) - dt;
      if (inp.left && this.cheatCd <= 0 && this.equip > 0.6) {
        this.cheatCd = 0.22;
        this.recoil = 1;
        this.sinceShot = 0;
        this.kick += 0.02;
        w.flashT = 0.05;
        g.cheats.fire(this);
      }
      return;
    }
    if (w.reloadT > 0) {
      w.reloadT -= dt;
      if (w.reloadT <= 0) w.ammo = s.mag;
    }
    if (inp.pressed.has('KeyR') && w.ammo < s.mag && w.reloadT <= 0) this.startReload(w);
    const ready = w.reloadT <= 0 && this.equip > 0.6;
    if (s.mode === 'beam') {
      g.combat.beamTick(this, w, dt, ready && inp.left && w.ammo > 0);
      if (ready && inp.left && w.ammo > 0) {
        this.sinceShot = 0;
        this.recoil = Math.max(this.recoil, 0.15);
        w.heat = Math.min(1, w.heat + dt * 0.6);
      }
    } else {
      if (s.mode === 'spin') {
        w.spin = clamp(w.spin + (inp.left && ready ? dt / s.spinUp : -dt * 1.5), 0, 1);
        if (inp.left && ready) g.sound.spin(w.spin);
      }
      const trigger = s.mode === 'semi' ? inp.leftPressed : inp.left;
      if (trigger && ready && w.fireCd <= 0 && (s.mode !== 'spin' || w.spin >= 1)) {
        if (w.ammo > 0) this.fire(w);
        else if (s.mode === 'semi') g.sound.empty();
      }
    }
    if (w.ammo === 0 && w.reloadT <= 0 && w.fireCd <= 0) this.startReload(w);
  }

  startReload(w) {
    if (this.infiniteAmmo()) return;
    w.reloadT = w.stats.reload * (this.buff('rapid') ? 0.5 : 1);
    this.sprintLatch = false;
    this.game.sound.reload(w.stats.reload * (this.buff("rapid") ? 0.5 : 1), w.def.frame);
    this.game.combat.beamTick(this, null, 0, false);
  }

  fire(w) {
    const g = this.game;
    const s = w.stats;
    if (s.proj === 'block') {
      if (this.blocks <= 0) {
        g.sound.empty();
        g.hud.flashBlocks();
        w.fireCd = 0.3;
        return;
      }
      if (!g.cheats.has('blocks')) this.blocks--;
    }
    if (!this.infiniteAmmo()) w.ammo--;
    w.fireCd = (this.buff('rapid') ? s.gap / 1.7 : s.gap) / (g.cheats.has('rapid') ? 3 : 1);
    this.sprintLatch = false;
    this.sinceShot = 0;
    g.combat.fire(this, w);
    const steady = this.crouch && this.onGround ? (s.bipod ? 0.25 : 0.6) : 1;
    this.kick += 0.022 * s.recoil * steady * (1 - this.ads * 0.3);
    this.recoil = 1;
    this.recoilRoll = (Math.random() - 0.5) * 0.08;
    this.recoilYaw = (Math.random() - 0.5) * 0.06;
    if (!s.noFlash) w.flashT = 0.05;
    w.heat = Math.min(1, w.heat + 0.06 + s.gap * 0.1);
    this.shake = Math.max(this.shake, 0.02 + 0.015 * s.recoil);
    g.stats.shots++;
  }

  // Where our muzzle appears on screen, placed out in the world, so tracers
  // start at the barrel you see.
  muzzleWorld(out) {
    const g = this.game;
    if (this.thirdPerson) {
      const gun = this.guns3p[this.held];
      return gun ? gun.userData.muzzle.getWorldPosition(out) : this.eyePos(out);
    }
    const view = this.views[this.held];
    if (!view) return this.eyePos(out);
    view.gun.userData.muzzle.getWorldPosition(out);
    out.project(g.viewCam);
    out.z = 0.5;
    out.unproject(g.camera).sub(g.camera.position).normalize();
    return out.multiplyScalar(0.9).add(g.camera.position);
  }

  // Ray from the camera, limited to arm's reach from the player's eyes.
  targetBlock() {
    const cam = this.game.camera;
    const dir = this.aimDir(vE);
    const extra = this.thirdPerson ? cam.position.distanceTo(this.eyePos(vF)) : 0;
    const o = cam.position;
    return this.game.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, REACH + extra);
  }

  mine() {
    const g = this.game;
    this.mineCd = 0.22;
    this.swing = 1;
    const hit = this.targetBlock();
    if (!hit) return;
    const res = g.world.hitBlock(hit.x, hit.y, hit.z, 1);
    if (!res) return;
    const colors = g.atlas.colors[res.info.side];
    if (res.broken) {
      g.fx.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, colors, 14, { speed: 2.5, size: 0.12, up: 2, life: 0.8, spread: 0.35 });
      g.sound.blockBreak(res.info.sound);
      this.blocks = Math.min(99, this.blocks + 1);
    } else {
      g.fx.burst(hit.x + 0.5 + hit.nx * 0.5, hit.y + 0.5 + hit.ny * 0.5, hit.z + 0.5 + hit.nz * 0.5, colors, 3, {
        speed: 1.5,
        size: 0.07,
        up: 1,
        life: 0.4,
        spread: 0.3,
      });
      g.sound.blockHit(res.info.sound);
    }
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
    if (g.combat.occupied(x, y, z)) return;
    const id = this.blockType();
    w.set(x, y, z, id);
    if (!g.cheats.has('blocks')) this.blocks--;
    g.stats.placed++;
    g.progress.event('place');
    g.sound.place();
    this.swing = 1;
    g.fx.burst(x + 0.5, y + 0.5, z + 0.5, g.atlas.colors[BLOCKS[id].side], 6, {
      speed: 1.2,
      size: 0.08,
      up: 1,
      life: 0.4,
      spread: 0.45,
    });
  }

  updateSelection() {
    const hit = this.weapon && this.ads > 0.5 ? null : this.targetBlock();
    this.selection.visible = !!hit;
    if (hit) this.selection.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  // Burning and poison tick damage; frost slows you down.
  updateStatus(dt) {
    this.slowT = Math.max(0, this.slowT - dt);
    const burning = this.burnT > 0;
    this.burnT = Math.max(0, this.burnT - dt);
    this.poisonT = Math.max(0, this.poisonT - dt);
    const lava = this.inWater && this.game.world.theme && this.game.world.theme.lava;
    if (this.inWater && !lava) this.burnT = 0;
    // Mount Ember's sea is lava.
    if (lava && !this.dead) {
      this.lavaT = (this.lavaT || 0) - dt;
      this.burnT = Math.max(this.burnT, 2);
      if (this.lavaT <= 0) {
        this.lavaT = 0.4;
        this.dot(2, 'lava');
        this.vel.y = Math.max(this.vel.y, 5);
      }
    }
    if (burning || this.poisonT > 0) {
      this.dotT -= dt;
      if (this.dotT <= 0) {
        this.dotT = burning ? 0.9 : 1.25;
        this.dot(1, this.dotBy);
      }
    } else {
      this.dotT = 0.6;
    }
    const g = this.game;
    if (burning && Math.random() < dt * 14 && this.thirdPerson) {
      g.fx.burst(this.pos.x, this.pos.y + Math.random() * 1.6, this.pos.z, g.combat.fireColors, 1, { speed: 0.5, size: 0.1, up: 2.4, life: 0.4, spread: 0.2, grav: -3 });
    }
  }

  // Damage over time: no knockback, no invulnerability window.
  dot(n, source) {
    if (this.dead || this.shielded()) return;
    this.hp -= n;
    this.sinceHurt = 0;
    this.regenT = 0;
    this.hurtT = Math.max(this.hurtT, 0.12);
    this.game.hud.damage();
    if (this.hp <= 0) this.die(source);
  }

  // Bots shoot at this box.
  hitTest(o, d, maxT) {
    if (this.dead) return null;
    const k = this.h / 1.8;
    const x = this.pos.x;
    const y = this.pos.y;
    const z = this.pos.z;
    const tb = rayBox(o, d, x - 0.36, y, z - 0.36, x + 0.36, y + 1.36 * k, z + 0.36);
    const th = rayBox(o, d, x - 0.3, y + 1.36 * k, z - 0.3, x + 0.3, y + this.h + 0.1, z + 0.3);
    const okB = tb >= 0 && tb < maxT;
    const okH = th >= 0 && th < maxT;
    if (okH && (!okB || th <= tb)) return { t: th, head: true };
    if (okB) return { t: tb, head: false };
    return null;
  }

  // Duels: another player hit us. No invulnerability window, so fast guns
  // work, but a small knockback away from the shooter.
  pvpHit(amount, from, byId, fx, head) {
    if (this.dead || this.invuln > 0.6 || this.game.cheats.has('god')) return;
    const g = this.game;
    this.hp -= Math.max(1, Math.round(amount));
    this.sinceHurt = 0;
    this.regenT = 0;
    this.hurtT = 0.25;
    this.applyStatus(fx, 'pvp');
    if (from) {
      const dx = this.pos.x - from.x;
      const dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 2.5;
      this.vel.z += (dz / l) * 2.5;
      const right = Math.cos(this.yaw) * (dx / l) - Math.sin(this.yaw) * (dz / l);
      this.hurtRoll = (right >= 0 ? -1 : 1) * 0.07;
    }
    this.shake = Math.max(this.shake, head ? 0.18 : 0.1);
    g.hud.damage();
    g.sound.hurt();
    if (this.hp <= 0) {
      this.pvpKiller = byId;
      this.die('pvp');
    }
  }

  applyStatus(fx, source) {
    if (!fx) return;
    if (fx.slow) {
      this.slowT = 2.2;
      this.slowAmt = Math.min(0.7, fx.slow);
    }
    if (fx.burn) {
      this.burnT = Math.max(this.burnT, 3);
      this.dotBy = source;
    }
    if (fx.poison) {
      this.poisonT = Math.max(this.poisonT, 5);
      this.dotBy = source;
    }
  }

  hurt(amount, from, source, fx) {
    if (this.dead || this.invuln > 0) return;
    const g = this.game;
    if (this.shielded()) return;
    if (fx && fx.shock) {
      amount += fx.shock;
      this.shake = Math.max(this.shake, 0.25);
      g.sound.zap(0.8);
    }
    this.applyStatus(fx, source);
    const knock = fx && fx.knock ? fx.knock : 1;
    this.hp -= amount;
    this.invuln = 0.4;
    this.sinceHurt = 0;
    this.regenT = 0;
    this.hurtT = 0.3;
    if (from) {
      const dx = this.pos.x - from.x;
      const dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 6 * knock;
      this.vel.z += (dz / l) * 6 * knock;
      this.vel.y = Math.max(this.vel.y, 4.5 * Math.sqrt(knock));
      const right = Math.cos(this.yaw) * (dx / l) - Math.sin(this.yaw) * (dz / l);
      this.hurtRoll = (right >= 0 ? -1 : 1) * 0.09;
    } else {
      this.hurtRoll = (Math.random() < 0.5 ? -1 : 1) * 0.09;
    }
    this.shake = 0.12;
    g.hud.damage();
    g.sound.hurt();
    if (this.hp <= 0) this.die(source);
  }

  die(source) {
    if (this.dead) return;
    const g = this.game;
    this.hp = 0;
    this.dead = true;
    this.deadT = 0;
    this.killer = source;
    this.crouch = false;
    this.burnT = this.poisonT = this.slowT = 0;
    g.sound.death();
    g.onPlayerDeath();
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  // --- Emotes ------------------------------------------------------------

  startEmote(id) {
    if (this.dead || !this.onGround || !EMOTES[id]) return;
    this.emote = id;
    this.emoteT = 0;
    // Swing the camera round so you can see yourself.
    if (!this.thirdPerson) {
      this.thirdPerson = true;
      this.emoteView = true;
    }
    this.game.progress.event('emote', { id });
  }

  stopEmote() {
    if (!this.emote) return;
    this.emote = null;
    if (this.emoteView) this.thirdPerson = false;
    this.emoteView = false;
  }

  updateEmote(dt) {
    const inp = this.game.input;
    const k = inp.keys;
    if (this.emote) {
      this.emoteT += dt;
      const moved = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => k.has(c));
      if (moved || inp.left || inp.right || this.dead || this.emoteT >= EMOTES[this.emote].time) this.stopEmote();
    }
    const want = this.emote && this.emoteView ? 1 : 0;
    this.emoteCam = damp(this.emoteCam || 0, want, 6, dt);
  }

  // --- Power-ups ---------------------------------------------------------

  addBuff(id) {
    this.buffs[id] = Math.max(this.buffs[id] || 0, POWERS[id].time);
    if (id === 'ammo') {
      const w = this.weapon;
      if (w) {
        w.reloadT = 0;
        w.ammo = w.stats.mag;
      }
    }
  }

  buff(id) {
    return (this.buffs[id] || 0) > 0;
  }

  infiniteAmmo() {
    return this.buff('ammo') || this.game.cheats.has('ammo');
  }

  // The shield soaks a hit and sparkles.
  shielded() {
    if (this.game.cheats.has('god')) return true;
    if (!this.buff('shield')) return false;
    if ((this.shieldFx || 0) <= 0) {
      this.shieldFx = 0.25;
      this.game.fx.burst(this.pos.x, this.pos.y + 1, this.pos.z, SHIELD_COLORS, 10, { speed: 3, size: 0.07, up: 1, life: 0.35, spread: 0.4 });
      this.game.sound.clank(0.6);
    }
    return true;
  }

  updateBuffs(dt) {
    this.shieldFx = (this.shieldFx || 0) - dt;
    for (const k of Object.keys(this.buffs)) {
      const before = this.buffs[k];
      this.buffs[k] = Math.max(0, before - dt);
      if (before > 0 && this.buffs[k] === 0) this.game.hud.popup(`${POWERS[k].name} wore off`);
    }
    // Infinite ammo keeps the magazine full.
    const w = this.weapon;
    if (w && this.infiniteAmmo()) {
      w.ammo = w.stats.mag;
      w.reloadT = 0;
    }
  }

  scoped() {
    const w = this.weapon;
    return !!w && w.stats.zoom >= 2 && this.ads > 0.85 && !this.thirdPerson;
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
      const bob = this.walkAmt * (1 + this.sprintW * 0.6) * (1 - this.ads * 0.8);
      eye.y += Math.abs(Math.sin(this.walkPhase)) * 0.06 * bob - 0.03 * bob;
    }
    const s = this.shake;
    // During an emote the camera circles to your front.
    const ew = this.emoteCam || 0;
    const cy = this.yaw + Math.PI * ew;
    const cp = (this.pitch + this.kick) * (1 - ew) - 0.18 * ew;
    cam.rotation.set(cp + (Math.random() - 0.5) * s * 0.3, cy + (Math.random() - 0.5) * s * 0.3, roll, 'YXZ');
    if (this.thirdPerson && !this.dead) {
      const d = ew > 0.001 ? vB.set(-Math.sin(cy) * Math.cos(cp), Math.sin(cp), -Math.cos(cy) * Math.cos(cp)) : this.aimDir(vB);
      const want = vC.copy(eye).addScaledVector(d, -4.2 + ew * 0.8);
      want.x += Math.cos(cy) * 0.55 * (1 - ew);
      want.z -= Math.sin(cy) * 0.55 * (1 - ew);
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
    const moving = Math.hypot(this.vel.x, this.vel.z) > 2;
    const target = ((this.game.settings.fov || BASE_FOV) + (this.sprint && moving ? 9 : 0) - (this.inWater ? 5 : 0)) / (this.thirdPerson ? 1 : this.zoom());
    this.fov = damp(this.fov, target, 12, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  animState() {
    const w = this.weapon;
    return {
      speed: Math.hypot(this.vel.x, this.vel.z),
      sprint: this.sprint,
      crouch: this.crouch,
      onGround: this.onGround,
      water: this.inWater,
      vy: this.vel.y,
      pitch: this.pitch + this.kick,
      aim: w && (this.sinceShot < 1.4 || w.reloadT > 0 || this.ads > 0.3) ? 1 : 0,
      recoil: this.recoil,
      reload: w ? w.reloadFrac : -1,
      hurt: this.hurtT / 0.3,
      landed: this.landed,
      dead: this.dead,
      deadT: this.deadT,
    };
  }

  // Hats and capes from the Style shop.
  dress() {
    removeCosmetics(this.cos);
    this.cos = attachCosmetics(this.model, this.game.profile.style);
  }

  updateModels(dt) {
    const m = this.model;
    m.root.visible = this.thirdPerson;
    const flash = this.hurtT > 0 ? this.hurtT / 0.3 : this.dead ? 0.5 : 0;
    for (const mat of m.materials) mat.emissive.setRGB(0.6 * flash, 0.05 * flash, 0.03 * flash);
    const weapon = this.weapon;
    this.guns3p.forEach((gun, i) => {
      if (gun) gun.visible = i === this.held;
    });
    this.block3p.visible = this.held >= 3;
    if (this.thirdPerson) {
      m.root.position.copy(this.pos);
      m.root.rotation.y = this.yaw + Math.PI;
      posePlayer(this.rig, this.animState(), dt);
      if (this.swing > 0) m.parts.armR.rotation.x -= Math.sin(this.swing * Math.PI) * 0.8;
      if (this.emote) poseEmote(m, this.emote, this.emoteT, emoteWeight(this.emote, this.emoteT));
      animateCosmetics(this.cos, this.game.time, Math.hypot(this.vel.x, this.vel.z), dt);
    }
    this.landed = 0;

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.sprintW = damp(this.sprintW, this.sprint && hs > 1 ? 1 : 0, 9, dt);
    this.crouchW = damp(this.crouchW, this.crouch ? 1 : 0, 9, dt);
    const firstPerson = !this.thirdPerson && !this.dead;
    const scoped = this.scoped();
    this.views.forEach((v, i) => {
      if (v) v.group.visible = firstPerson && i === this.held && !scoped;
    });
    this.blockView.group.visible = firstPerson && this.held >= 3;
    const bob = this.walkAmt * (1 + this.sprintW * 0.9) * (1 - this.ads * 0.85);
    const bx = Math.sin(this.walkPhase) * 0.014 * bob;
    const by = -Math.abs(Math.cos(this.walkPhase)) * 0.016 * bob;
    const eq = 1 - ease(this.equip);
    const sway = 1 - this.ads * 0.8;

    if (weapon) {
      const v = this.views[this.held];
      const r = weapon.reloadFrac;
      const A = this.ads;
      // A proper reload: the left hand does the work (see viewanim.js).
      const P = r >= 0 ? reloadPose(v.style, r, v.points) : null;
      const I = !P && this.inspectT > 0 ? inspectPose(this.inspectT) : null;
      const rr = P ? P.rot : I ? I.rot : ZERO3;
      const rp = P ? P.pos : I ? I.pos : ZERO3;
      // Breathing: a slow drift when you stand still.
      const still = 1 - Math.min(1, this.walkAmt * 2);
      const breathe = Math.sin(this.time * 1.7) * 0.004 * still * (1 - A * 0.8);
      const drift = Math.sin(this.time * 0.9) * 0.012 * still * (1 - A);
      v.group.position.set(
        lerp(VIEW_REST.x, v.ads.x, A) + bx - this.swayX * 0.6 * sway - this.sprintW * 0.05 - this.crouchW * 0.035 * (1 - A) + rp[0] + eq * 0.12,
        lerp(VIEW_REST.y, v.ads.y, A) + by + breathe + this.swayY * 0.6 * sway - this.sprintW * 0.05 - this.landDip * 0.05 - eq * 0.35 + rp[1],
        lerp(VIEW_REST.z, v.ads.z, A) + this.recoil * 0.06 * (1 - A * 0.5) + this.sprintW * 0.03 + rp[2],
      );
      v.group.rotation.set(
        this.recoil * 0.12 * (1 - A * 0.6) - this.sprintW * 0.4 + this.swayY * 1.2 * sway - eq * 0.9 + rr[0],
        0.04 * (1 - A) + this.sprintW * 0.65 + this.swayX * 1.5 * sway + this.recoil * this.recoilYaw + rr[1],
        this.sprintW * 0.25 + this.recoilRoll + drift + eq * 0.6 + rr[2],
      );
      const empty = weapon.stats.mag === 1 && weapon.ammo === 0;
      if (P) {
        v.setHand(P.hand[0], P.hand[1], P.hand[2]);
        v.cell.position.set(P.cell[0], v.cellY + P.cell[1], P.cell[2]);
        v.cell.visible = P.cellVisible && !(empty && (r < 0.45 || !P.cellVisible));
        if (v.shell) {
          v.shell.visible = !!P.shell;
          if (P.shell) v.shell.position.set(P.shell[0], P.shell[1], P.shell[2]);
        }
      } else {
        const S = v.points.support;
        // The front hand rides the recoil a little.
        v.setHand(S.x, S.y, S.z + this.recoil * 0.015);
        v.cell.position.set(0, v.cellY, 0);
        v.cell.visible = !empty;
        if (v.shell) v.shell.visible = false;
      }
    }
    for (let i = 0; i < 3; i++) {
      const wp = this.weapons[i];
      if (!wp) continue;
      const on = i === this.held;
      for (const gun of [this.views[i] && this.views[i].gun, this.guns3p[i]]) {
        if (!gun) continue;
        const u = gun.userData;
        u.shroud.position.z = on ? this.recoil * 0.03 : 0;
        u.setHeat(wp.heat);
        u.showFlash(on && wp.flashT > 0);
        u.spin.rotation.z += wp.spin * dt * 40;
        // The held gun's first-person cell is handled by the reload animation.
        if (!(on && weapon && this.views[i] && gun === this.views[i].gun)) {
          const rf = wp.reloadFrac;
          u.cell.visible = !(wp.stats.mag === 1 && wp.ammo === 0 && rf < 0.5) && !(rf >= 0.28 && rf < 0.55);
        }
        if (u.laser) u.laser.visible = on;
      }
    }
    const bv = this.blockView.group;
    const sw = Math.sin(this.swing * Math.PI);
    bv.position.set(0.32 + bx - this.swayX * 0.6, -0.3 + by + this.swayY * 0.6 - eq * 0.3 - sw * 0.06, -0.55 - sw * 0.08);
    bv.rotation.set(-sw * 0.6 - eq * 0.8, this.swayX * 1.5, 0);
  }
}
