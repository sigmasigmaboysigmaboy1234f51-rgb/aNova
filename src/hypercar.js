import * as THREE from 'three';

// The Hyper Car's gadgets. While you drive it:
//
//   Left click     twin roof turret (locks on to whatever you point at)
//   Right click    homing rockets from the side pods
//   Shift          nitro boost (the blue flames), refills when you let go
//   Q              jump jets: hop over traffic, or off a ramp for huge air
//   X              oil slick: cars behind you spin out
//   G              smoke screen: the police lose sight of you
//   C              shield: nothing can hurt the car for a few seconds
//   U              underglow colour
//
// The spiked wheels and the spiked ram shred other cars you hit (see
// Adventure.collide), and the car is armoured: it takes a lot to stop it.

const UNDERGLOW = ['#b46cff', '#39b8ff', '#ff3a7a', '#6fff8a', '#ffd23f', '#ff7a2f', '#ffffff'];
const ROCKET_FIRE = [new THREE.Color('#ffd84a'), new THREE.Color('#ff7a2f'), new THREE.Color('#fff6c8')];
const ROCKET_SMOKE = [new THREE.Color('#b8b8b2'), new THREE.Color('#9a9a96'), new THREE.Color('#d8d8d2')];
const SMOKE = [new THREE.Color('#8a8a86'), new THREE.Color('#a8a8a2'), new THREE.Color('#6a6a66'), new THREE.Color('#c4c4be')];
const NITRO = [new THREE.Color('#6ff0ff'), new THREE.Color('#39b8ff'), new THREE.Color('#ffffff')];
const JET = [new THREE.Color('#ffd84a'), new THREE.Color('#ff7a2f'), new THREE.Color('#fff6c8')];
const SPARKS = [new THREE.Color('#fff6c8'), new THREE.Color('#ffd84a'), new THREE.Color('#ffffff')];

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const AIM = new THREE.Vector3();

let rocketGeo = null;
let rocketMat = null;
let rocketGlow = null;
let slickGeo = null;
let slickMat = null;

export class HyperKit {
  constructor(car) {
    this.car = car;
    this.game = car.game;
    this.adv = car.adv;
    this.m = car.model.hyper;
    this.nitro = 1;
    this.boosting = false;
    this.jetCd = 0;
    this.jetT = 0;
    this.gunCd = 0;
    this.barrel = 0;
    this.flashT = 0;
    this.rocketCd = 0;
    this.pod = 1;
    this.oilCd = 0;
    this.smokeCd = 0;
    this.smokeT = 0;
    this.shieldCd = 0;
    this.glow = 0;
    this.target = null;
    this.rockets = [];
    this.slicks = [];
    this.aimYaw = 0;
    this.aimPitch = 0;
  }

  dispose() {
    const scene = this.game.scene;
    for (const r of this.rockets) scene.remove(r.mesh);
    for (const s of this.slicks) scene.remove(s.mesh);
    this.rockets = [];
    this.slicks = [];
  }

  // You're driving: read the controls. Called before the car moves.
  control(dt, inp) {
    const g = this.game;
    const car = this.car;
    const k = inp.keys;
    // Nitro.
    const want = (k.has('ShiftLeft') || k.has('ShiftRight')) && this.nitro > 0.02 && (this.boosting || this.nitro > 0.15);
    if (want && !this.boosting) {
      g.sound.nitro();
      g.player.shake = Math.max(g.player.shake, 0.2);
    }
    this.boosting = want;
    car.boost = want;
    if (want) this.nitro = Math.max(0, this.nitro - dt / 4);
    // Jump jets.
    if (inp.pressed.has('KeyQ') && this.jetCd <= 0) {
      this.jetCd = 2.2;
      this.jetT = 0.45;
      car.vy = car.air ? Math.max(car.vy, 8) : 12.5;
      car.pos.y += 0.06;
      g.sound.jets();
      g.fx.burst(car.pos.x, car.pos.y + 0.1, car.pos.z, JET, 30, { speed: 4, size: 0.2, up: -1, life: 0.5, spread: 1.4 });
    }
    // Guns.
    if (inp.left) this.fireGuns();
    if (inp.right && this.rocketCd <= 0) this.fireRocket();
    // Oil slick.
    if (inp.pressed.has('KeyX')) {
      if (this.oilCd <= 0) this.dropOil();
      else g.hud.popup(`Oil slick ready in ${Math.ceil(this.oilCd)}s`);
    }
    // Smoke screen.
    if (inp.pressed.has('KeyG')) {
      if (this.smokeCd <= 0) {
        this.smokeCd = 15;
        this.smokeT = 4;
        const pol = this.adv.police;
        pol.blindT = 7;
        g.sound.whoosh(1);
        g.hud.popup(pol.stars > 0 ? 'Smoke screen! The police lost sight of you' : 'Smoke screen!', 'power');
      } else g.hud.popup(`Smoke screen ready in ${Math.ceil(this.smokeCd)}s`);
    }
    // Shield.
    if (inp.pressed.has('KeyC')) {
      if (this.shieldCd <= 0) {
        this.shieldCd = 22;
        car.shieldT = 7;
        g.sound.shieldUp();
        g.hud.popup('Shield up!', 'power');
      } else g.hud.popup(`Shield ready in ${Math.ceil(this.shieldCd)}s`);
    }
    // Underglow colour.
    if (inp.pressed.has('KeyU')) {
      this.glow = (this.glow + 1) % UNDERGLOW.length;
      this.m.underMat.color.set(UNDERGLOW[this.glow]);
      g.sound.click();
    }
  }

  // Where the turret is pointing: the point in the middle of the aiming
  // ring (a little above the middle of the screen), or the target it has
  // locked on to.
  aimPoint(out) {
    const g = this.game;
    const cam = g.camera;
    const car = this.car;
    const o = cam.position;
    const d = v1.set(0, 0.25, 0.5).unproject(cam).sub(o).normalize();
    // Lock on to the enemy closest to the aiming line.
    this.target = null;
    let best = 0.16;
    const consider = (pos, h, t) => {
      v2.set(pos.x, pos.y + h, pos.z).sub(o);
      const along = v2.dot(d);
      if (along < 3 || along > 70) return;
      const off = v2.addScaledVector(d, -along).length() / along;
      if (off < best) {
        best = off;
        this.target = t;
      }
    };
    for (const m of g.mobs.list) if (m.state === 'live' && !m.gone) consider(m.pos, m.h * 0.5, { mob: m });
    const pol = this.adv.police;
    for (const off of pol.officers()) if (off.state !== 'down' && !off.riding) consider(off.pos, 1, { officer: off });
    if (pol.heli && !pol.heli.dead) consider(pol.heli.pos, 0, { heli: pol.heli });
    for (const c of this.adv.cars) if (c !== car && !c.dead && (c.driver === 'cop' || c.getaway || c.mission)) consider(c.pos, 0.8, { car: c });
    const t = this.target;
    if (t) {
      const e = t.mob || t.officer || t.heli || t.car;
      return out.set(e.pos.x, e.pos.y + (t.mob ? t.mob.h * 0.5 : t.officer ? 1 : 0.8), e.pos.z);
    }
    // Nothing to lock on to: whatever's under the ring.
    const hit = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 80);
    const skip = o.distanceTo(car.pos) + 1.5;
    const reach = hit && hit.t > skip ? hit.t : 80;
    return out.copy(o).addScaledVector(d, reach);
  }

  fireGuns() {
    if (this.gunCd > 0) return;
    const g = this.game;
    const car = this.car;
    this.gunCd = 0.075;
    this.barrel = 1 - this.barrel;
    this.flashT = 0.05;
    // From the end of a barrel.
    const f = this.m.flashes[this.barrel];
    f.updateWorldMatrix(true, false);
    const from = v3.setFromMatrixPosition(f.matrixWorld);
    const to = this.aimPoint(AIM);
    const dir = v2.subVectors(to, from);
    const len = dir.length();
    dir.divideScalar(len);
    // A little spread.
    dir.x += (Math.random() - 0.5) * 0.025;
    dir.y += (Math.random() - 0.5) * 0.025;
    dir.z += (Math.random() - 0.5) * 0.025;
    dir.normalize();
    const hit = this.trace(from, dir, 90);
    const end = from.clone().addScaledVector(dir, hit ? hit.t : 90);
    g.tracers.fire(from, end, 0xffe38a, 0.05);
    g.sound.gunshot('minigun', false, 0.7);
    this.adv.gunshot(car.pos);
    if (!hit) return;
    const dmg = 9;
    if (hit.mob) hit.mob.damage(dmg * (g.player.buff('dmg') ? 2 : 1), dir.clone(), hit.head, end, g.myId, {});
    else if (hit.car) hit.car.damage(dmg * 0.8, null, 'player');
    else if (hit.officer) hit.officer.damage(dmg * 0.7, true);
    else if (hit.heli) hit.heli.damage(dmg * 0.6);
    g.fx.burst(end.x, end.y, end.z, SPARKS, 3, { speed: 3, size: 0.05, up: 1, life: 0.25, spread: 0.1 });
  }

  // The first thing along a ray: a block, a mob, a car, an officer or the
  // helicopter (never this car).
  trace(o, d, maxT) {
    const g = this.game;
    const blk = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxT);
    let best = blk ? { t: blk.t } : null;
    const lim = () => (best ? best.t : maxT);
    for (const m of g.mobs.list) {
      if (m.state !== 'live' || m.gone) continue;
      const h = m.hitTest(o, d, lim());
      if (h) best = { t: h.t, mob: m, head: h.head };
    }
    for (const c of this.adv.cars) {
      if (c === this.car || (c.dead && c.deadT > 30)) continue;
      const t = c.hitTest(o, d, lim());
      if (t !== null) best = { t, car: c };
    }
    for (const off of this.adv.police.officers()) {
      const h = off.hitTest(o, d, lim());
      if (h) best = { t: h.t, officer: off };
    }
    const heli = this.adv.police.heli;
    if (heli && !heli.dead) {
      const t = heli.hitTest(o, d, lim());
      if (t !== null) best = { t, heli };
    }
    return best;
  }

  fireRocket() {
    const g = this.game;
    const car = this.car;
    this.rocketCd = 0.7;
    if (!rocketGeo) {
      rocketGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8).rotateX(Math.PI / 2);
      rocketMat = new THREE.MeshLambertMaterial({ color: '#d8392b' });
      rocketGlow = new THREE.MeshBasicMaterial({ color: '#ffd84a' });
    }
    this.pod = -this.pod;
    const [px, py, pz] = this.m.pods;
    const s = Math.sin(car.yaw);
    const c = Math.cos(car.yaw);
    const x = this.pod * px;
    const from = new THREE.Vector3(car.pos.x + c * x + s * pz, car.pos.y + py, car.pos.z - s * x + c * pz);
    const to = this.aimPoint(AIM);
    const vel = to.clone().sub(from).normalize().multiplyScalar(40);
    const mesh = new THREE.Mesh(rocketGeo, rocketMat);
    const tail = new THREE.Mesh(rocketGeo, rocketGlow);
    tail.scale.set(0.8, 0.8, 0.3);
    tail.position.z = -0.32;
    mesh.add(tail);
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.rockets.push({ mesh, vel, t: 0, target: this.target });
    g.sound.gunshot('launcher', false, 0.8);
    this.adv.gunshot(car.pos);
  }

  dropOil() {
    const g = this.game;
    const car = this.car;
    this.oilCd = 6;
    if (!slickGeo) {
      slickGeo = new THREE.CircleGeometry(2.4, 18).rotateX(-Math.PI / 2);
      slickMat = new THREE.MeshBasicMaterial({ color: '#0c0c10', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    }
    const s = Math.sin(car.yaw);
    const c = Math.cos(car.yaw);
    const back = car.def.len / 2 + 2.2;
    const x = car.pos.x - s * back;
    const z = car.pos.z - c * back;
    const y = this.adv.groundAt(x, z, car.pos.y + 1.5);
    const mesh = new THREE.Mesh(slickGeo, slickMat);
    mesh.position.set(x, y + 0.04, z);
    g.scene.add(mesh);
    this.slicks.push({ mesh, x, z, t: 22 });
    g.sound.splat();
    g.hud.popup('Oil slick!', 'power');
  }

  // Every frame, driven or not.
  update(dt) {
    const g = this.game;
    const car = this.car;
    const m = this.m;
    const mine = car.driver === 'player' && g.player.driving === car;
    this.gunCd -= dt;
    this.rocketCd -= dt;
    this.jetCd -= dt;
    this.oilCd = Math.max(0, this.oilCd - dt);
    this.smokeCd = Math.max(0, this.smokeCd - dt);
    this.shieldCd = Math.max(0, this.shieldCd - dt);
    car.shieldT = Math.max(0, (car.shieldT || 0) - dt);
    if (!mine) {
      this.boosting = false;
      car.boost = false;
    }
    if (!this.boosting) this.nitro = Math.min(1, this.nitro + dt / 9);
    if (!car.dead) {
      // Nitro flames and streaks.
      m.flames.visible = this.boosting;
      if (this.boosting) {
        const k = 0.8 + Math.random() * 0.5;
        for (const f of m.flames.children) f.scale.set(1, k, 1);
        if (Math.random() < dt * 40) {
          const s = Math.sin(car.yaw);
          const c = Math.cos(car.yaw);
          g.fx.burst(car.pos.x - s * (car.def.len / 2 + 0.6), car.pos.y + 0.6, car.pos.z - c * (car.def.len / 2 + 0.6), NITRO, 2, { speed: 1.5, size: 0.12, up: 0.3, life: 0.3, spread: 0.3 });
        }
      }
      // Jump jet flames.
      this.jetT -= dt;
      m.jets.visible = this.jetT > 0;
      if (this.jetT > 0 && Math.random() < dt * 40) g.fx.burst(car.pos.x, car.pos.y + 0.1, car.pos.z, JET, 3, { speed: 2, size: 0.16, up: -2, life: 0.35, spread: 1 });
      // Underglow, brighter at night.
      m.under.visible = true;
      m.underMat.opacity = 0.45 + (this.adv.nightK || 0) * 0.5;
      // Shield bubble shimmer.
      m.shield.visible = car.shieldT > 0;
      if (m.shield.visible) m.shieldMat.opacity = 0.14 + Math.sin(performance.now() / 90) * 0.06 + (car.shieldT < 1.5 && Math.floor(performance.now() / 120) % 2 ? -0.1 : 0);
      // The turret swings round to where you're aiming.
      let yaw = 0;
      let pitch = 0;
      if (mine) {
        const to = this.aimPoint(AIM);
        m.turret.updateWorldMatrix(true, false);
        const local = m.turret.worldToLocal(v1.copy(to));
        yaw = Math.atan2(local.x, local.z);
        pitch = -Math.atan2(local.y - 0.26, Math.hypot(local.x, local.z));
      }
      this.aimYaw += (yaw - this.aimYaw) * Math.min(1, dt * 12);
      this.aimPitch += (Math.max(-0.5, Math.min(0.35, pitch)) - this.aimPitch) * Math.min(1, dt * 12);
      m.turret.rotation.y = this.aimYaw;
      m.gun.rotation.x = this.aimPitch;
      this.flashT -= dt;
      m.flashes.forEach((f, i) => {
        f.visible = this.flashT > 0 && i === this.barrel;
        if (f.visible) f.rotation.z = Math.random() * Math.PI;
      });
      // Smoke screen pouring out the back.
      if (this.smokeT > 0) {
        this.smokeT -= dt;
        if (Math.random() < dt * 30) {
          const s = Math.sin(car.yaw);
          const c = Math.cos(car.yaw);
          g.fx.burst(car.pos.x - s * car.def.len * 0.6, car.pos.y + 0.8, car.pos.z - c * car.def.len * 0.6, SMOKE, 4, { speed: 1.5, size: 0.9, up: 1.2, life: 3.5, spread: 1.2, grav: -0.5 });
        }
      }
    }
    this.updateRockets(dt);
    this.updateSlicks(dt);
    if (mine) this.hud();
  }

  updateRockets(dt) {
    const g = this.game;
    for (const r of this.rockets) {
      r.t += dt;
      // Homing: turn towards the target it locked on to.
      const t = r.target;
      const e = t && (t.mob || t.officer || t.heli || t.car);
      const alive = e && (t.mob ? t.mob.state === 'live' && !t.mob.gone : t.car ? !t.car.dead : t.heli ? !t.heli.dead : t.officer.state !== 'down');
      if (alive) {
        const want = v1.set(e.pos.x, e.pos.y + (t.mob ? t.mob.h * 0.5 : 0.8), e.pos.z).sub(r.mesh.position).normalize().multiplyScalar(40);
        r.vel.lerp(want, Math.min(1, dt * 4)).setLength(40);
      }
      const step = v2.copy(r.vel).multiplyScalar(dt);
      const len = step.length();
      const dir = v3.copy(step).divideScalar(len);
      const hit = this.trace(r.mesh.position, dir, len + 0.3);
      r.mesh.position.add(step);
      r.mesh.lookAt(v1.copy(r.mesh.position).add(dir));
      if (Math.random() < 0.8) g.fx.burst(r.mesh.position.x, r.mesh.position.y, r.mesh.position.z, Math.random() < 0.5 ? ROCKET_FIRE : ROCKET_SMOKE, 1, { speed: 0.4, size: 0.14, up: 0.3, life: 0.5, spread: 0.05, grav: -1 });
      if (hit || r.t > 3) {
        if (hit) r.mesh.position.addScaledVector(dir, hit.t - len);
        r.done = true;
        g.combat.explode(r.mesh.position.clone(), 3.4, 70, { local: true });
        g.scene.remove(r.mesh);
      }
    }
    this.rockets = this.rockets.filter((r) => !r.done);
  }

  // Other cars that drive over your oil spin out.
  updateSlicks(dt) {
    const g = this.game;
    for (const s of this.slicks) {
      s.t -= dt;
      s.mesh.material.opacity = 0.85;
      for (const c of this.adv.cars) {
        if (c === this.car || c.dead || c.air || Math.abs(c.speed) < 4) continue;
        if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) > 2.6) continue;
        if (c.oilT > 0) continue;
        c.oilT = 1.5;
        c.spinV += (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2);
        c.speed *= 0.8;
        if (c.pos.distanceTo(g.player.pos) < 40) g.sound.skid(0.6);
      }
      if (s.t <= 0) g.scene.remove(s.mesh);
    }
    this.slicks = this.slicks.filter((s) => s.t > 0);
  }

  // The gadget bars under the speedometer.
  hud() {
    const $ = (id) => document.getElementById(id);
    const bar = (id, k) => {
      const el = $(id);
      if (el) el.style.width = `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`;
    };
    bar('hy-nitro', this.nitro);
    bar('hy-shield', this.car.shieldT > 0 ? this.car.shieldT / 7 : 1 - this.shieldCd / 22);
    bar('hy-jets', 1 - Math.max(0, this.jetCd) / 2.2);
    bar('hy-smoke', 1 - this.smokeCd / 15);
    bar('hy-oil', 1 - this.oilCd / 6);
    const lock = $('hy-aim');
    if (lock) lock.classList.toggle('locked', !!this.target);
  }
}
