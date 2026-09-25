import * as THREE from 'three';
import { moveEntity } from './physics.js';
import { buildHumanoid, holdGun } from './model.js';
import { Rig, posePlayer } from './anim.js';
import { makeSkinTexture, paintOutfit, randomOutfit } from './skin.js';
import { nameplate } from './remote.js';
import { rayBox } from './mob.js';
import { FlowField } from './flow.js';
import { GUNS, gunStats, defaultBuild } from './weapons.js';
import { B, SEA } from './world.js';
import { CORES } from './gun.js';
import { mulberry32 } from './rng.js';
import { wrapAngle, clamp } from './util.js';
import { attachCosmetics, animateCosmetics, randomStyle } from './cosmetics.js';
import { poseEmote } from './emotes.js';

// Computer players for practice duels. They find their way around the
// map, strafe, aim like a person (late and a bit off), reload, jump,
// throw grenades and, on Hard, build cover when they are hurt.

export const BOT_NAMES = [
  'Pixel Pete',
  'Cube Carl',
  'Blocky Bea',
  'Sniper Sam',
  'Turbo Tia',
  'Crouchy Chris',
  'Laggy Larry',
  'Noob Norris',
  'Buff Brenda',
  'Headshot Hank',
  'Dizzy Dot',
  'Captain Kaboom',
];

export const DIFFICULTY = {
  easy: { name: 'Easy', react: 0.65, aim: 0.09, turn: 5, dmg: 0.6, strafe: 0.4, nades: 0, build: false, hp: 16 },
  normal: { name: 'Normal', react: 0.38, aim: 0.05, turn: 8, dmg: 0.85, strafe: 0.8, nades: 0.08, build: false, hp: 20 },
  hard: { name: 'Hard', react: 0.2, aim: 0.026, turn: 12, dmg: 1, strafe: 1.2, nades: 0.18, build: true, hp: 20 },
};

// Guns a bot can carry (all of them shoot straight).
const BOT_GUNS = ['ember', 'spark', 'buzz', 'scatter', 'longshot', 'flare', 'tesla', 'mill'];
// How close each gun likes to fight.
const RANGE = { ember: 12, spark: 10, buzz: 7, scatter: 5, longshot: 24, flare: 11, tesla: 9, mill: 10 };

const vA = new THREE.Vector3();
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

let nextBotId = -1;

export class Bot {
  constructor(game, name, level, seed) {
    this.game = game;
    this.isBot = true;
    this.id = nextBotId--;
    this.name = name;
    this.skill = DIFFICULTY[level] || DIFFICULTY.normal;
    const rng = mulberry32(seed);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hw = 0.3;
    this.h = 1.8;
    this.yaw = 0;
    this.pitch = 0;
    this.maxHp = this.skill.hp;
    this.hp = this.maxHp;
    this.dead = false;
    this.deadT = 0;
    this.respawnT = 0;
    this.invuln = 0;
    this.onGround = false;
    this.hitX = this.hitZ = false;
    this.flow = new FlowField();
    this.flowT = Math.random();
    this.target = null;
    this.seeT = 0;
    this.sees = false;
    this.seenFor = 0;
    this.strafe = rng() < 0.5 ? 1 : -1;
    this.strafeT = 1;
    this.jumpCd = 0;
    this.nadeCd = 4;
    this.buildCd = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.hurtT = 0;
    this.sinceHurt = 99;
    this.aimErr = new THREE.Vector2();
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 64;
    paintOutfit(this.canvas, randomOutfit(rng), false, seed);
    this.texture = makeSkinTexture(this.canvas);
    this.pickGun(BOT_GUNS[Math.floor(rng() * BOT_GUNS.length)]);
    this.style = randomStyle(rng);
    this.build();
  }

  pickGun(id) {
    this.gunId = id;
    this.stats = gunStats(id, defaultBuild(id));
    this.color = new THREE.Color((CORES[this.stats.core.split('.')[1]] || CORES.ember).beam);
    this.ammo = this.stats.mag;
    this.reloadT = 0;
    this.fireCd = 1;
    this.spin = 0;
  }

  build() {
    const scene = this.game.scene;
    this.model = buildHumanoid(this.texture, { slim: false });
    this.gun = holdGun(this.model, this.gunId, defaultBuild(this.gunId));
    this.rig = new Rig(this.model);
    this.cos = attachCosmetics(this.model, this.style);
    scene.add(this.model.root);
    this.tag = nameplate(this.name);
    scene.add(this.tag);
  }

  dispose() {
    const scene = this.game.scene;
    scene.remove(this.model.root);
    scene.remove(this.tag);
    this.gun.userData.dispose();
    this.model.dispose();
    this.texture.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }

  spawn(pos, yaw) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.dead = false;
    this.deadT = 0;
    this.invuln = 1.5;
    this.ammo = this.stats.mag;
    this.reloadT = 0;
    this.target = null;
    this.seenFor = 0;
  }

  // --- Being shot ----------------------------------------------------------

  hitTest(o, d, maxT) {
    if (this.dead) return null;
    const x = this.pos.x;
    const y = this.pos.y;
    const z = this.pos.z;
    const tb = rayBox(o, d, x - 0.36, y, z - 0.36, x + 0.36, y + 1.36, z + 0.36);
    const th = rayBox(o, d, x - 0.3, y + 1.36, z - 0.3, x + 0.3, y + 1.9, z + 0.3);
    const okB = tb >= 0 && tb < maxT;
    const okH = th >= 0 && th < maxT;
    if (okH && (!okB || th <= tb)) return { t: th, head: true };
    if (okB) return { t: tb, head: false };
    return null;
  }

  // Someone (the player or another bot) hit us.
  takeHit(dmg, head, fx, byId, from) {
    if (this.dead || this.invuln > 0) return;
    this.hp -= Math.max(1, Math.round(dmg));
    this.hurtT = 0.25;
    this.sinceHurt = 0;
    // Getting shot makes you look for the shooter.
    const g = this.game;
    const shooter = byId === g.myId ? g.player : g.bots.find((b) => b.id === byId);
    if (shooter && !shooter.dead) {
      this.target = shooter;
      this.seenFor = Math.max(this.seenFor, this.skill.react * 0.5);
    }
    if (from) {
      const dx = this.pos.x - from.x;
      const dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 2.5;
      this.vel.z += (dz / l) * 2.5;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadT = 0;
      this.respawnT = 3;
      g.sound.death();
      if (g.duel) g.duel.onKill(byId, this.id);
    } else g.sound.hurt();
  }

  // --- Brain -----------------------------------------------------------------

  enemies() {
    const g = this.game;
    const out = [];
    if (!g.player.dead) out.push(g.player);
    for (const b of g.bots) if (b !== this && !b.dead) out.push(b);
    return out;
  }

  canSee(t) {
    const ox = this.pos.x;
    const oy = this.pos.y + 1.6;
    const oz = this.pos.z;
    const tx = t.pos.x - ox;
    const ty = t.pos.y + 1.3 - oy;
    const tz = t.pos.z - oz;
    const len = Math.hypot(tx, ty, tz) || 1;
    return !this.game.world.raycast(ox, oy, oz, tx / len, ty / len, tz / len, len);
  }

  update(dt) {
    const g = this.game;
    this.invuln -= dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.recoil *= Math.exp(-14 * dt);
    this.flashT -= dt;
    this.fireCd -= dt;
    this.jumpCd -= dt;
    this.nadeCd -= dt;
    this.buildCd -= dt;
    this.sinceHurt += dt;
    if (this.dead) {
      this.deadT += dt;
      this.respawnT -= dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
      moveEntity(g.world, this, dt);
      if (this.respawnT <= 0 && g.duel && !g.duel.over) {
        const s = g.duel.spawnFor(this.id);
        this.spawn(s.pos, s.yaw);
      }
      this.sync(dt);
      return;
    }
    // Health comes back slowly when left alone.
    if (this.sinceHurt > 5 && this.hp < this.maxHp && Math.random() < dt * 0.6) this.hp++;

    // Pick the nearest enemy, sticking with the current one a while.
    const foes = this.enemies();
    if (!this.target || this.target.dead || !foes.includes(this.target) || Math.random() < dt * 0.2) {
      let best = null;
      let bd = Infinity;
      for (const f of foes) {
        const d = f.pos.distanceToSquared(this.pos) * (this.canSeeQuick(f) ? 0.5 : 1);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      if (best !== this.target) this.seenFor = 0;
      this.target = best;
    }
    const t = this.target;
    let wx = 0;
    let wz = 0;
    let want = 0;
    if (t) {
      this.seeT -= dt;
      if (this.seeT <= 0) {
        this.seeT = 0.15;
        this.sees = this.canSee(t);
      }
      this.seenFor = this.sees ? this.seenFor + dt : Math.max(0, this.seenFor - dt * 2);
      const dx = t.pos.x - this.pos.x;
      const dz = t.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const range = RANGE[this.gunId] || 10;
      if (this.sees) {
        // Keep the gun's favourite distance and strafe.
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafe = -this.strafe;
          this.strafeT = 0.6 + Math.random() * 1.4;
        }
        const close = dist < range * 0.6 ? -1 : dist > range * 1.3 ? 1 : 0;
        wx = (dx / dist) * close + (-dz / dist) * this.strafe * this.skill.strafe;
        wz = (dz / dist) * close + (dx / dist) * this.strafe * this.skill.strafe;
        want = 1;
      } else {
        // Walk the map toward them.
        this.flowT -= dt;
        if (this.flowT <= 0) {
          this.flowT = 0.8;
          this.flow.compute(g.world, [[Math.floor(t.pos.x), Math.floor(t.pos.z)]]);
        }
        const s = this.pathStep();
        if (s) {
          wx = s.x;
          wz = s.z;
        } else {
          wx = dx / dist;
          wz = dz / dist;
        }
        want = 1;
      }
      this.aim(dt, t);
      this.shoot(dt, t, dist);
      // Grenades over walls and cover when hurt, for the tougher bots.
      if (this.skill.nades && this.nadeCd <= 0 && dist > 6 && dist < 18 && Math.random() < this.skill.nades) this.throwNade(t);
      if (this.nadeCd <= 0) this.nadeCd = 3 + Math.random() * 3;
      if (this.skill.build && this.hp < this.maxHp * 0.45 && this.buildCd <= 0 && this.sees) this.buildWall(t);
    }
    const l = Math.hypot(wx, wz);
    if (l > 0) {
      wx /= l;
      wz /= l;
    }
    const speed = 4.4 * (this.reloadT > 0 ? 0.8 : 1) * want * (this.stats.mobility || 1);
    const k = Math.min(1, (this.onGround ? 12 : 3) * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    this.vel.y = Math.max(this.vel.y - 30 * dt, -40);
    const inWater = this.pos.y < SEA - 0.35;
    if (inWater) this.vel.y = Math.min(this.vel.y + 34 * dt, 4);
    moveEntity(g.world, this, dt);
    // Hop over steps, and now and then to dodge.
    if (this.onGround && this.jumpCd <= 0 && ((this.hitX || this.hitZ) && l > 0 || (this.sees && Math.random() < dt * 0.25 * this.skill.strafe))) {
      this.vel.y = 9;
      this.jumpCd = 0.5;
    }
    this.sync(dt);
  }

  canSeeQuick(f) {
    return f === this.target && this.sees;
  }

  pathStep() {
    const f = this.flow;
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
    const len = Math.hypot(tx, tz) || 1;
    return { x: tx / len, z: tz / len };
  }

  // Turn toward the target like a person: a little late, a little off.
  aim(dt, t) {
    const lead = this.skill.react * 0.6;
    const tx = t.pos.x + t.vel.x * lead - this.pos.x;
    const tz = t.pos.z + t.vel.z * lead - this.pos.z;
    const ty = t.pos.y + (Math.random() < 0.15 ? 1.6 : 1.1) - (this.pos.y + 1.6);
    const wantYaw = Math.atan2(-tx, -tz);
    const wantPitch = Math.atan2(ty, Math.hypot(tx, tz));
    // Wander the aim error slowly so misses look natural.
    const e = this.skill.aim;
    this.aimErr.x += ((Math.random() - 0.5) * e * 2 - this.aimErr.x) * Math.min(1, dt * 3);
    this.aimErr.y += ((Math.random() - 0.5) * e * 2 - this.aimErr.y) * Math.min(1, dt * 3);
    const k = Math.min(1, dt * this.skill.turn);
    this.yaw += wrapAngle(wantYaw + this.aimErr.x - this.yaw) * k;
    this.pitch += (clamp(wantPitch + this.aimErr.y, -1.4, 1.4) - this.pitch) * k;
  }

  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  shoot(dt, t, dist) {
    const s = this.stats;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.ammo = s.mag;
      return;
    }
    if (this.ammo <= 0) {
      this.reloadT = s.reload * 1.1;
      return;
    }
    if (s.mode === 'spin') this.spin = clamp(this.spin + (this.sees ? dt / s.spinUp : -dt), 0, 1);
    if (!this.sees || this.seenFor < this.skill.react || this.fireCd > 0) return;
    if (dist > s.range * 0.9) return;
    if (s.mode === 'spin' && this.spin < 1) return;
    // Only shoot when roughly lined up.
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const off = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - this.yaw));
    if (off > 0.25 + 1 / Math.max(2, dist)) return;
    this.fire();
  }

  fire() {
    const g = this.game;
    const s = this.stats;
    this.ammo--;
    this.fireCd = s.gap * (s.mode === 'semi' ? 1.6 + Math.random() : 1.05);
    this.recoil = 1;
    this.flashT = 0.05;
    const origin = vA.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
    const aim = this.aimDir(new THREE.Vector3());
    const muzzle = this.gun.userData.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3();
    const spread = s.spread * (s.hip || 1) * (Math.hypot(this.vel.x, this.vel.z) > 1 ? 1.5 : 1);
    for (let n = 0; n < s.pellets; n++) {
      dir.copy(aim);
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      const res = this.trace(origin, dir, s.range);
      if (res.hit) {
        const fall = s.pellets > 1 ? Math.max(0.35, Math.min(1, 1.25 - res.t / s.range)) : 1;
        const dmg = s.dmg * (res.head ? s.head : 1) * fall * this.skill.dmg;
        const fx = s.burn || s.slow ? { burn: s.burn ? 1 : 0, slow: s.slow } : null;
        if (res.hit === g.player) g.player.pvpHit(dmg, this.pos, this.id, fx, res.head);
        else res.hit.takeHit(dmg, res.head, fx, this.id, this.pos);
      } else if (res.block) {
        const b = g.world.hitBlock(res.block.x, res.block.y, res.block.z, 1);
        if (b && b.broken) g.sound.blockBreak(b.info.sound);
      }
      if (s.chain) g.combat.lightning(muzzle, res.end, this.color);
      else g.tracers.fire(muzzle, res.end, this.color.getHex(), s.pellets > 1 ? 0.022 : 0.035);
    }
    const d = muzzle.distanceTo(g.player.pos);
    if (d < 50) g.sound.gunshot(GUNS[this.gunId].frame, false, (1 - d / 50) * 0.8);
  }

  // The first thing along a ray: the player, another bot, or a block.
  trace(o, d, range) {
    const g = this.game;
    const block = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, range);
    let bestT = block ? block.t : range;
    let hit = null;
    let head = false;
    const cands = [g.player, ...g.bots];
    for (const c of cands) {
      if (c === this || c.dead) continue;
      const h = c === g.player ? g.player.hitTest(o, d, bestT) : c.hitTest(o, d, bestT);
      if (h && h.t < bestT) {
        bestT = h.t;
        hit = c;
        head = h.head;
      }
    }
    return { hit, head, t: bestT, block: hit ? null : block, end: o.clone().addScaledVector(d, bestT) };
  }

  throwNade(t) {
    const g = this.game;
    this.nadeCd = 5 + Math.random() * 4;
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
    const dx = t.pos.x - o.x;
    const dz = t.pos.z - o.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = 13;
    const time = dist / speed;
    const vy = (t.pos.y + 0.5 - o.y) / time + 0.5 * 22 * time;
    const vel = new THREE.Vector3((dx / dist) * speed, Math.min(14, vy), (dz / dist) * speed);
    g.combat.spawn('nade', o, vel, { local: true, fuse: 1.6, owner: this.id });
    g.sound.throw();
  }

  // Throw up a quick wall between us and the enemy.
  buildWall(t) {
    this.buildCd = 8;
    const w = this.game.world;
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const fx = dx / l;
    const fz = dz / l;
    const cx = this.pos.x + fx * 1.6;
    const cz = this.pos.z + fz * 1.6;
    for (let s = -1; s <= 1; s++) {
      const x = Math.floor(cx + -fz * s);
      const z = Math.floor(cz + fx * s);
      for (let y = Math.floor(this.pos.y); y < Math.floor(this.pos.y) + 2; y++) {
        if (w.get(x, y, z) === B.AIR && !this.game.combat.occupied(x, y, z)) w.set(x, y, z, B.COBBLE);
      }
    }
    this.game.sound.place();
  }

  // --- Drawing ---------------------------------------------------------------

  sync(dt) {
    const m = this.model;
    m.root.visible = !(this.dead && this.deadT > 2.5);
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw + Math.PI;
    const flash = this.hurtT > 0 ? 1 : this.dead ? 0.5 : 0;
    for (const mat of m.materials) mat.emissive.setRGB(0.6 * flash, 0.05 * flash, 0.03 * flash);
    posePlayer(
      this.rig,
      {
        speed: Math.hypot(this.vel.x, this.vel.z),
        sprint: false,
        crouch: false,
        onGround: this.onGround,
        water: this.pos.y < SEA - 0.35,
        vy: this.vel.y,
        pitch: this.pitch,
        aim: this.sees ? 1 : 0,
        recoil: this.recoil,
        reload: this.reloadT > 0 ? 1 - this.reloadT / (this.stats.reload * 1.1) : -1,
        hurt: this.hurtT / 0.25,
        landed: 0,
        dead: this.dead,
        deadT: this.deadT,
      },
      dt,
    );
    // When the duel is over the bots celebrate (or sulk with a flex).
    const g = this.game;
    if (g.duel && g.duel.over && !this.dead) {
      this.partyT = (this.partyT || 0) + dt;
      const won = g.duel.score(this.id) >= g.duel.score(g.myId);
      poseEmote(m, won ? 'dance' : 'flex', this.partyT, Math.min(1, this.partyT * 4));
    } else this.partyT = 0;
    const u = this.gun.userData;
    u.showFlash(this.flashT > 0);
    u.shroud.position.z = this.recoil * 0.03;
    u.spin.rotation.z += this.spin * dt * 40;
    animateCosmetics(this.cos, this.game.time, Math.hypot(this.vel.x, this.vel.z), dt);
    this.tag.visible = m.root.visible;
    this.tag.position.set(this.pos.x, this.pos.y + 2.15, this.pos.z);
  }
}
