import * as THREE from 'three';
import { B, BLOCKS, SY } from './world.js';
import { TILE_UV } from './textures.js';

// Everything that happens when a gun goes off: hitscan traces, pellets,
// piercing, projectiles you can see fly, explosions, lightning chains and
// the elemental effects from cores.

const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vC = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FIRE = ['#fff2b0', '#ffd36b', '#ff9a3c', '#ff6a20', '#e0402f'].map((c) => new THREE.Color(c));
const SMOKE = ['#4a4640', '#5e5a52', '#35322d'].map((c) => new THREE.Color(c));

function jitter(dir, spread, out) {
  out.copy(dir);
  if (spread > 0) {
    out.x += (Math.random() - 0.5) * spread * 2;
    out.y += (Math.random() - 0.5) * spread * 2;
    out.z += (Math.random() - 0.5) * spread * 2;
  }
  return out.normalize();
}

const PROJ = {
  bolt: { gravity: 9, life: 5, size: 0.06 },
  grenade: { gravity: 20, life: 6, size: 0.16 },
  nade: { gravity: 22, life: 1.7, size: 0.18 },
  block: { gravity: 16, life: 5, size: 0.3 },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.booms = [];
    this.leechAcc = 0;
    this.fireColors = FIRE;
    const scene = game.scene;
    this.boltGeo = new THREE.BoxGeometry(0.04, 0.04, 0.6);
    this.boltMat = new THREE.MeshLambertMaterial({ color: 0x8a5a33 });
    this.tipMat = new THREE.MeshBasicMaterial({ color: 0xffd36b });
    this.nadeGeo = new THREE.BoxGeometry(1, 1, 1);
    this.nadeMat = new THREE.MeshLambertMaterial({ color: 0x3d4a2c });
    this.bandMat = new THREE.MeshBasicMaterial({ color: 0xff7a2f });
    this.blockGeos = new Map();
    this.boomGeo = new THREE.BoxGeometry(1, 1, 1);
    // One persistent beam for our own beam gun.
    const bg = new THREE.BoxGeometry(1, 1, 1);
    bg.translate(0, 0, 0.5);
    this.beam = new THREE.Mesh(
      bg,
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.beam.visible = false;
    scene.add(this.beam);
    this.beamSendT = 0;
  }

  clear() {
    const scene = this.game.scene;
    for (const pr of this.projectiles) scene.remove(pr.mesh);
    for (const b of this.booms) {
      scene.remove(b.mesh);
      b.mesh.material.dispose();
    }
    this.projectiles = [];
    this.booms = [];
    this.beam.visible = false;
    this.game.sound.beam(false);
  }

  // --- Tracing ------------------------------------------------------------

  // Follow a ray up to `range`, collecting up to maxMobs mobs before any block.
  trace(origin, dir, range, maxMobs) {
    const g = this.game;
    const block = g.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
    const blockT = block ? block.t : range;
    const hits = g.mobs.raycastAll(origin, dir, blockT).slice(0, maxMobs);
    const stopped = hits.length >= maxMobs;
    const endT = stopped ? hits[hits.length - 1].t : blockT;
    for (const h of hits) h.at = origin.clone().addScaledVector(dir, h.t);
    return { hits, block: stopped ? null : block, blockT, endT, end: origin.clone().addScaledVector(dir, endT) };
  }

  // --- Firing -------------------------------------------------------------

  // One trigger pull of a non-beam weapon for the local player.
  fire(p, w) {
    const g = this.game;
    const s = w.stats;
    const origin = vA.copy(g.camera.position);
    const aim = p.aimDir(vB);
    const spread = p.spreadFor(w);
    const muzzle = p.muzzleWorld(new THREE.Vector3());
    const color = p.coreColor(w);
    const ends = [];
    let hitAny = false;
    let head = false;

    if (s.proj) {
      // Aim projectiles so they cross the crosshair, then add wobble.
      const probe = this.trace(origin, aim, 60, 1);
      const toward = probe.end.clone().sub(muzzle).normalize();
      for (let n = 0; n < s.pellets; n++) {
        const d = jitter(toward, spread, new THREE.Vector3());
        const vel = d.multiplyScalar(s.speed).addScaledVector(p.vel, 0.3);
        this.spawn(s.proj, muzzle.clone(), vel, { local: true, stats: s, block: p.blockType() });
        if (g.mp) g.mp.sendProj(s.proj, muzzle, vel, p.blockType());
      }
    } else {
      const dir = new THREE.Vector3();
      for (let n = 0; n < s.pellets; n++) {
        jitter(aim, spread, dir);
        const res = this.trace(origin, dir, s.range, 1 + s.pierce);
        for (const h of res.hits) {
          const fall = s.pellets > 1 ? Math.max(0.35, Math.min(1, 1.25 - h.t / s.range)) : 1;
          this.hitMob(p, h.mob, s.dmg * (h.head ? s.head : 1) * fall, dir, h.head, h.at, s, color);
          hitAny = true;
          head = head || h.head;
        }
        if (res.block) this.hitBlock(res.block, res.end, dir, s, color);
        ends.push(res.end);
      }
      for (const e of ends) {
        if (s.chain) this.lightning(muzzle, e, color);
        else g.tracers.fire(muzzle, e, s.quiet ? 0x777777 : color.getHex(), s.pellets > 1 ? 0.022 : 0.035);
      }
      if (g.mp) g.mp.sendShot(muzzle, ends, { gun: w.id, color: color.getHexString(), quiet: !!s.quiet, zap: !!s.chain });
    }
    if (hitAny) {
      g.hud.hitmarker(head);
      if (head) g.sound.headshot();
      else g.sound.hit();
    }
    g.sound.gunshot(w.def.frame, !!s.quiet);
  }

  hitMob(p, mob, dmg, dir, head, at, s, color) {
    const g = this.game;
    mob.damage(dmg, dir, head, at, g.myId, { burn: s.burn, slow: s.slow });
    if (s.leech) {
      this.leechAcc += dmg * s.leech;
      while (this.leechAcc >= 1) {
        this.leechAcc -= 1;
        p.heal(1);
      }
    }
    if (s.chain) this.chain(mob, dmg * 0.5, s.chain, s, color);
    if (s.splash) this.explode(at, s.splash, dmg * 0.45, { local: true, breaks: false, small: true });
  }

  hitBlock(hit, at, dir, s, color) {
    const g = this.game;
    const res = g.world.hitBlock(hit.x, hit.y, hit.z, 1);
    if (res) {
      const colors = g.atlas.colors[res.info.side];
      g.fx.burst(at.x + hit.nx * 0.06, at.y + hit.ny * 0.06, at.z + hit.nz * 0.06, colors, 4, {
        speed: 2.5,
        size: 0.07,
        up: 1.5,
        life: 0.5,
        spread: 0.03,
      });
      if (res.broken) {
        g.fx.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, colors, 18, { speed: 3, size: 0.13, up: 2, life: 0.9, spread: 0.35 });
        g.sound.blockBreak(res.info.sound);
        g.player.blocks = Math.min(99, g.player.blocks + 1);
      } else {
        g.sound.blockHit(res.info.sound);
      }
    }
    if (s.splash) this.explode(at, s.splash, s.dmg * 0.45, { local: true, breaks: false, small: true });
  }

  // Lightning jumps from one mob to the nearest others.
  chain(from, dmg, n, s, color) {
    const g = this.game;
    const done = new Set([from]);
    let prev = from;
    for (let i = 0; i < n; i++) {
      let best = null;
      let bd = 25;
      for (const m of g.mobs.list) {
        if (done.has(m) || m.state === 'dying' || m.gone) continue;
        const d = m.pos.distanceToSquared(prev.pos);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (!best) break;
      done.add(best);
      const a = prev.pos.clone();
      a.y += prev.h * 0.6;
      const b = best.pos.clone();
      b.y += best.h * 0.6;
      this.lightning(a, b, color);
      best.damage(dmg, b.clone().sub(a).normalize(), false, b, g.myId, { burn: s.burn, slow: s.slow });
      prev = best;
    }
    if (done.size > 1) g.sound.zap(0.6);
  }

  lightning(a, b, color) {
    const g = this.game;
    const segs = 6;
    let last = a.clone();
    const len = a.distanceTo(b);
    for (let i = 1; i <= segs; i++) {
      const p = a.clone().lerp(b, i / segs);
      if (i < segs) {
        const k = len * 0.06;
        p.x += (Math.random() - 0.5) * k;
        p.y += (Math.random() - 0.5) * k;
        p.z += (Math.random() - 0.5) * k;
      }
      g.tracers.fire(last, p, color.getHex(), 0.03);
      last = p;
    }
  }

  // Beam weapons deal damage in small ticks while the trigger is held.
  beamTick(p, w, dt, on) {
    const g = this.game;
    if (!on) {
      this.beam.visible = false;
      g.sound.beam(false);
      return;
    }
    const s = w.stats;
    const origin = vA.copy(g.camera.position);
    const aim = p.aimDir(vB);
    const res = this.trace(origin, aim, s.range, 1);
    const muzzle = p.muzzleWorld(vC);
    const color = p.coreColor(w);
    this.beam.visible = true;
    this.beam.material.color.copy(color);
    this.beam.position.copy(muzzle);
    this.beam.lookAt(res.end);
    const width = 0.05 + Math.random() * 0.03;
    this.beam.scale.set(width, width, muzzle.distanceTo(res.end));
    g.sound.beam(true);
    w.beamT = (w.beamT || 0) - dt;
    if (w.beamT <= 0) {
      w.beamT = s.gap;
      w.ammo = Math.max(0, w.ammo - 1);
      const h = res.hits[0];
      if (h) {
        this.hitMob(p, h.mob, s.dmg * (h.head ? s.head : 1), aim, h.head, h.at, s, color);
        if (Math.random() < 0.3) g.hud.hitmarker(h.head);
      } else if (res.block && Math.random() < 0.12) {
        this.hitBlock(res.block, res.end, aim, s, color);
      }
      g.fx.burst(res.end.x, res.end.y, res.end.z, [color], 1, { speed: 1.5, size: 0.06, up: 0.5, life: 0.3, spread: 0.05 });
    }
    this.beamSendT -= dt;
    if (g.mp && this.beamSendT <= 0) {
      this.beamSendT = 0.1;
      g.mp.sendShot(muzzle, [res.end], { gun: w.id, color: color.getHexString(), beam: true });
    }
  }

  // --- Projectiles -------------------------------------------------------

  blockGeo(id) {
    if (this.blockGeos.has(id)) return this.blockGeos.get(id);
    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const info = BLOCKS[id] || BLOCKS[B.COBBLE];
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const tile = f === 2 ? info.top : f === 3 ? info.bottom : info.side;
      const [u0, v0, u1, v1] = TILE_UV[tile];
      uv.setXY(f * 4, u0, v1);
      uv.setXY(f * 4 + 1, u1, v1);
      uv.setXY(f * 4 + 2, u0, v0);
      uv.setXY(f * 4 + 3, u1, v0);
    }
    this.blockGeos.set(id, geo);
    return geo;
  }

  makeMesh(kind, block) {
    const g = new THREE.Group();
    if (kind === 'bolt') {
      g.add(new THREE.Mesh(this.boltGeo, this.boltMat));
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), this.tipMat);
      tip.position.z = 0.3;
      g.add(tip);
    } else if (kind === 'block') {
      if (!this.blockMat) this.blockMat = new THREE.MeshLambertMaterial({ map: this.game.atlas.texture });
      g.add(new THREE.Mesh(this.blockGeo(block), this.blockMat));
    } else {
      const s = PROJ[kind].size;
      const body = new THREE.Mesh(this.nadeGeo, this.nadeMat);
      body.scale.setScalar(s);
      const band = new THREE.Mesh(this.nadeGeo, this.bandMat);
      band.scale.set(s * 1.1, s * 0.3, s * 1.1);
      g.add(body, band);
    }
    return g;
  }

  // local = true for our own projectiles (they deal damage and build);
  // others' projectiles are only drawn.
  spawn(kind, pos, vel, opts = {}) {
    const mesh = this.makeMesh(kind, opts.block);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.projectiles.push({
      kind,
      pos: pos.clone(),
      vel: vel.clone(),
      life: opts.fuse || PROJ[kind].life,
      mesh,
      local: !!opts.local,
      stats: opts.stats || null,
      block: opts.block || B.COBBLE,
      stuck: false,
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0),
    });
  }

  throwGrenade(p) {
    const g = this.game;
    const eye = p.eyePos(new THREE.Vector3());
    const dir = p.aimDir(new THREE.Vector3());
    const vel = dir.multiplyScalar(17).addScaledVector(p.vel, 0.5);
    vel.y += 3;
    eye.addScaledVector(p.aimDir(vA), 0.4);
    this.spawn('nade', eye, vel, { local: true, fuse: 1.6 });
    if (g.mp) g.mp.sendProj('nade', eye, vel);
    g.sound.throw();
  }

  update(dt) {
    const g = this.game;
    const w = g.world;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.stuck) {
        if (pr.life <= 0) pr.dead = true;
        continue;
      }
      const cfg = PROJ[pr.kind];
      const prev = vA.copy(pr.pos);
      pr.vel.y -= cfg.gravity * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      const seg = vB.copy(pr.pos).sub(prev);
      const len = seg.length();
      if (len > 1e-6) seg.divideScalar(len);
      // Mobs first (only our own projectiles can hurt).
      if (pr.local && pr.kind !== 'nade' && len > 0) {
        const hit = g.mobs.raycast(prev, seg, len + 0.1);
        if (hit) {
          const at = prev.clone().addScaledVector(seg, hit.t);
          this.impactMob(pr, hit, at, seg);
          pr.dead = true;
          continue;
        }
      }
      const bh = len > 0 ? w.raycast(prev.x, prev.y, prev.z, seg.x, seg.y, seg.z, len + 0.05) : null;
      if (bh) {
        const at = prev.clone().addScaledVector(seg, Math.max(0, bh.t - 0.02));
        this.impactBlock(pr, bh, at);
        if (pr.dead) continue;
      }
      if (pr.kind === 'nade' && pr.life <= 0) {
        if (pr.local) this.explode(pr.pos, 3, 14, { local: true, breaks: true });
        pr.dead = true;
        continue;
      }
      if (pr.life <= 0 || pr.pos.y < -5) {
        pr.dead = true;
        continue;
      }
      pr.mesh.position.copy(pr.pos);
      if (pr.kind === 'bolt') pr.mesh.lookAt(vC.copy(pr.pos).add(pr.vel));
      else {
        pr.mesh.rotation.x += pr.spin.x * dt;
        pr.mesh.rotation.y += pr.spin.y * dt;
      }
    }
    for (const pr of this.projectiles) if (pr.dead) g.scene.remove(pr.mesh);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);

    for (const b of this.booms) {
      b.t += dt;
      const k = b.t / 0.35;
      b.mesh.scale.setScalar(b.r * (0.4 + k * 1.4));
      b.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) {
        g.scene.remove(b.mesh);
        b.mesh.material.dispose();
        b.dead = true;
      }
    }
    this.booms = this.booms.filter((b) => !b.dead);
  }

  impactMob(pr, hit, at, dir) {
    const g = this.game;
    const s = pr.stats || {};
    if (pr.kind === 'grenade') {
      this.explode(at, s.splash || 3, s.dmg || 14, { local: true, breaks: !!s.breaks });
      return;
    }
    const dmg = (s.dmg || 3) * (hit.head ? s.head || 1 : 1);
    hit.mob.damage(dmg, dir, hit.head, at, g.myId, { burn: s.burn, slow: s.slow });
    g.hud.hitmarker(hit.head);
    if (hit.head) g.sound.headshot();
    else g.sound.hit();
    if (s.chain) this.chain(hit.mob, dmg * 0.5, s.chain, s, new THREE.Color(0xc8a4ff));
  }

  impactBlock(pr, bh, at) {
    const g = this.game;
    const w = g.world;
    const s = pr.stats || {};
    if (pr.kind === 'bolt') {
      pr.stuck = true;
      pr.life = 4;
      pr.pos.copy(at);
      pr.mesh.position.copy(at);
      g.sound.blockHit('wood');
      return;
    }
    if (pr.kind === 'grenade') {
      if (pr.local) this.explode(at, s.splash || 3, s.dmg || 14, { local: true, breaks: !!s.breaks });
      pr.dead = true;
      return;
    }
    if (pr.kind === 'block') {
      const x = bh.x + bh.nx;
      const y = bh.y + bh.ny;
      const z = bh.z + bh.nz;
      if (pr.local && w.inBounds(x, y, z) && y < SY - 1 && w.get(x, y, z) === B.AIR && !this.occupied(x, y, z)) {
        w.set(x, y, z, pr.block);
        g.stats.placed++;
        g.progress.event('place');
        g.sound.place();
      }
      g.fx.burst(at.x, at.y, at.z, g.atlas.colors[BLOCKS[pr.block].side], 6, { speed: 1.5, size: 0.08, up: 1, life: 0.4, spread: 0.2 });
      pr.dead = true;
      return;
    }
    // Hand grenades bounce.
    pr.pos.copy(at);
    if (bh.nx) pr.vel.x *= -0.45;
    if (bh.ny) pr.vel.y *= -0.45;
    if (bh.nz) pr.vel.z *= -0.45;
    pr.vel.multiplyScalar(0.8);
    if (pr.vel.lengthSq() > 4) g.sound.bounce();
  }

  occupied(x, y, z) {
    const g = this.game;
    const inside = (e) =>
      e.pos.x - e.hw < x + 1 && e.pos.x + e.hw > x && e.pos.z - e.hw < z + 1 && e.pos.z + e.hw > z && e.pos.y < y + 1 && e.pos.y + e.h > y;
    if (inside(g.player)) return true;
    if (g.mobs.list.some((m) => m.state !== 'dying' && inside(m))) return true;
    return !!(g.mp && g.mp.remotes.list().some((r) => !r.dead && inside(r)));
  }

  // --- Explosions ----------------------------------------------------------

  // Blow a rough ball-shaped hole. World edits reach other players like any
  // other block change.
  breakBlocks(at, r) {
    const g = this.game;
    const w = g.world;
    const R = Math.ceil(r * 0.8);
    for (let dx = -R; dx <= R; dx++) {
      for (let dy = -R; dy <= R; dy++) {
        for (let dz = -R; dz <= R; dz++) {
          const x = Math.floor(at.x) + dx;
          const y = Math.floor(at.y) + dy;
          const z = Math.floor(at.z) + dz;
          const bd = Math.hypot(x + 0.5 - at.x, y + 0.5 - at.y, z + 0.5 - at.z);
          if (bd > r * 0.8 || y <= 0) continue;
          const id = w.get(x, y, z);
          if (!id || id === B.BEDROCK) continue;
          if (Math.random() > 1.25 - bd / (r * 0.8)) continue;
          w.set(x, y, z, B.AIR);
          if (Math.random() < 0.3) {
            g.fx.burst(x + 0.5, y + 0.5, z + 0.5, g.atlas.colors[BLOCKS[id].side], 3, { speed: 5, size: 0.14, up: 4, life: 1, spread: 0.4 });
          }
        }
      }
    }
  }

  explode(pos, r, dmg, { local = false, breaks = false, small = false } = {}) {
    const g = this.game;
    const p = g.player;
    const at = pos.clone();
    const mesh = new THREE.Mesh(
      this.boomGeo,
      new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.position.copy(at);
    mesh.rotation.set(Math.random(), Math.random(), Math.random());
    g.scene.add(mesh);
    this.booms.push({ mesh, t: 0, r: small ? r * 0.7 : r });
    g.fx.burst(at.x, at.y, at.z, FIRE, small ? 10 : 34, { speed: small ? 3 : 7, size: small ? 0.1 : 0.16, up: 3, life: 0.7, spread: 0.3, grav: 6 });
    if (!small) g.fx.burst(at.x, at.y, at.z, SMOKE, 18, { speed: 3, size: 0.25, up: 3, life: 1.4, spread: 0.6, grav: -2 });
    const d = p.pos.distanceTo(at);
    p.shake = Math.max(p.shake, (small ? 0.08 : 0.45) * Math.max(0, 1 - d / (r * 5)));
    g.sound.explosion(Math.max(0, 1 - d / 50), small);

    if (!local) return;
    for (const m of g.mobs.list) {
      if (m.state === 'dying' || m.gone) continue;
      const c = vA.copy(m.pos);
      c.y += m.h * 0.5;
      const md = c.distanceTo(at);
      if (md > r + m.hw) continue;
      const f = Math.pow(Math.max(0, 1 - md / (r + m.hw)), 0.6);
      const dir = c.clone().sub(at).normalize();
      if (!Number.isFinite(dir.x)) dir.copy(UP);
      m.damage(dmg * f, dir, false, c.clone(), g.myId, {});
    }
    const pc = vA.set(p.pos.x, p.pos.y + 0.9, p.pos.z);
    const pd = pc.distanceTo(at);
    if (!p.dead && pd < r * 0.9) p.hurt(Math.max(1, Math.round(dmg * 0.3 * (1 - pd / r))), at, 'self');

    if (breaks) this.breakBlocks(at, r);
    if (g.mp) g.mp.sendBoom(at, r, small);
  }
}
