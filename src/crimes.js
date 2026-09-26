import * as THREE from 'three';
import { faceRects } from './skin.js';
import { PX } from './model.js';
import { Vox, VOX_LIT } from './vox.js';
import { LANE } from './city.js';

// Crime alerts: while you're in the spider suit, the police radio calls
// for help every so often. Robbers run from a shop with bags of money, or
// speed off in a getaway car. Web them up to catch them.

const RADIO = {
  robbery: ['Robbery at a shop! The robbers are running for it.', 'Robbers on the loose! Stop them before they get away.', 'Someone just robbed the corner shop!'],
  getaway: ['Getaway car speeding through town! Web it to stop it.', 'Bank robbers in a black car! Stop that car.', 'A car full of robbers just ran a red light!'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Stripy top, black mask and beanie over a normal outfit.
export function paintRobber(canvas) {
  const ctx = canvas.getContext('2d');
  const px = (x, y, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const H = faceRects(0, 0, 8, 8, 8);
  // Beanie: the top of the head and the top two rows all round.
  for (const f of ['front', 'back', 'left', 'right']) {
    const [x, y, w] = H[f];
    for (let i = 0; i < w; i++) for (let j = 0; j < 2; j++) px(x + i, y + j, j === 1 ? '#2a2a30' : '#18181c');
  }
  ctx.fillStyle = '#18181c';
  ctx.fillRect(...H.top);
  // Mask across the eyes.
  const [fx, fy] = H.front;
  for (let i = 0; i < 8; i++) px(fx + i, fy + 3, '#111114');
  for (let i = 0; i < 8; i++) px(fx + i, fy + 4, i === 1 || i === 2 || i === 5 || i === 6 ? '#f2f2f2' : '#111114');
  for (const f of ['left', 'right', 'back']) {
    const [x, y, w] = H[f];
    for (let i = 0; i < w; i++) {
      px(x + i, y + 3, '#111114');
      px(x + i, y + 4, '#111114');
    }
  }
  // Black and white stripes on the body and arms.
  const stripes = (u, v, w, h, d) => {
    const F = faceRects(u, v, w, h, d);
    for (const f of ['front', 'back', 'left', 'right']) {
      const [x, y, fw, fh] = F[f];
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) px(x + i, y + j, j % 2 ? '#f0f0ea' : '#1c1c22');
    }
  };
  stripes(16, 16, 8, 12, 4);
  stripes(40, 16, 4, 5, 4);
  stripes(32, 48, 4, 5, 4);
  // Dark trousers.
  for (const [u, v] of [
    [0, 16],
    [16, 48],
  ]) {
    const F = faceRects(u, v, 4, 12, 4);
    for (const f of ['front', 'back', 'left', 'right']) {
      const [x, y, fw, fh] = F[f];
      ctx.fillStyle = '#2b2b33';
      ctx.fillRect(x, y, fw, fh - 2);
    }
  }
}

// A bag of money to hold.
let bagGeo = null;
function moneyBag() {
  if (!bagGeo) {
    const v = new Vox(PX);
    v.box(5, 5, 4, 0, -2.5, 0, '#c8a060');
    v.box(3.6, 1.4, 3, 0, 0.6, 0, '#b08a50');
    v.box(1.2, 1.4, 1.2, 0, 1.8, 0, '#8a6a3a');
    v.box(0.6, 2.4, 0.3, 0, -2.6, 2.05, '#2f8a3a', 0, 0, 0, 0);
    v.box(1.8, 0.5, 0.3, 0, -1.9, 2.05, '#2f8a3a', 0, 0, 0, 0);
    v.box(1.8, 0.5, 0.3, 0, -3.3, 2.05, '#2f8a3a', 0, 0, 0, 0);
    bagGeo = v.geometry();
  }
  const m = new THREE.Mesh(bagGeo, VOX_LIT);
  m.position.set(0, -12 * PX, 0);
  return m;
}

export class Crimes {
  constructor(adv, webs) {
    this.adv = adv;
    this.game = adv.game;
    this.webs = webs;
    this.active = null;
    this.wait = 14;
  }

  dispose() {
    this.end(null, true);
  }

  get stopped() {
    return this.adv.prog.crimes || 0;
  }

  update(dt) {
    const a = this.adv;
    const c = this.active;
    if (!c) {
      // Crimes only happen while you're suited up and not on a job.
      if (!this.webs.suited || a.active) return;
      this.wait -= dt;
      if (this.wait <= 0) this.start();
      return;
    }
    // A job started: the police take this one.
    if (a.active) return this.end(null, true);
    c.t -= dt;
    if (c.car && !c.car.dead) {
      if (!c.stopped) a.setBeacon(c.car.pos.x, c.car.pos.z, 0xff4a3a, true);
    }
    const loose = c.robbers.filter((r) => !r.caught);
    if (c.stopped || !c.car) {
      if (loose.length === 0 && c.robbers.length) return this.end('win');
      // Point at the nearest one still running.
      const p = this.game.player.pos;
      let near = null;
      for (const r of loose) if (!near || r.pos.distanceToSquared(p) < near.pos.distanceToSquared(p)) near = r;
      if (near) a.setBeacon(near.pos.x, near.pos.z, 0xff4a3a, true);
    }
    for (const r of loose) this.run(r, dt);
    if (c.t <= 0) this.end('fail');
  }

  // Robbers run away from you, faster than people but slower than you.
  run(r, dt) {
    const p = this.game.player.pos;
    const d = Math.hypot(r.pos.x - p.x, r.pos.z - p.z);
    r.fleeFrom.copy(p);
    r.fleeT = Math.max(r.fleeT, 1);
    r.robberRun = d < 45 ? 5.6 : 3.5;
  }

  start(kind = Math.random() < 0.55 ? 'robbery' : 'getaway') {
    const a = this.adv;
    const g = this.game;
    const c = { kind, t: kind === 'robbery' ? 90 : 110, robbers: [], car: null, stopped: false, hits: 0 };
    this.active = c;
    if (kind === 'robbery') {
      const [x, z] = a.randomSidewalk(45);
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) c.robbers.push(this.addRobber(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3));
      a.setBeacon(x, z, 0xff4a3a);
    } else {
      // Far along the roads from you, heading off fast.
      const nodes = a.traffic.nodes;
      const p = g.player.pos;
      const far = nodes.filter((nd) => Math.hypot(nd.x - p.x, nd.z - p.z) > 55 && Math.hypot(nd.x - p.x, nd.z - p.z) < 120);
      const nd = far.length ? far[Math.floor(Math.random() * far.length)] : nodes[0];
      const car = a.addCar('sports', nd.x + LANE, nd.z, 0, true, '#1c1c22');
      car.getaway = true;
      car.aiTarget = 15;
      car.mission = true;
      c.car = car;
      a.setBeacon(car.pos.x, car.pos.z, 0xff4a3a);
    }
    g.hud.showBanner('CRIME ALERT!', pick(RADIO[kind]), 3.5);
    g.sound.radio(1);
    g.voices.say('radio', { force: true, cut: true, cd: 2 });
    this.webs.sense(a.beaconAt ? new THREE.Vector3(a.beaconAt[0], g.player.pos.y, a.beaconAt[1]) : g.player.pos);
  }

  addRobber(x, z) {
    const a = this.adv;
    const r = a.addPerson({ x, z, paint: paintRobber, name: 'Robber' });
    r.robber = true;
    r.caught = false;
    r.pos.y = a.groundAt(x, z, r.pos.y + 3);
    r.model.parts.armR.add(moneyBag());
    return r;
  }

  // A web ball hit the getaway car. Four and it's stuck.
  carHit(car, n) {
    const c = this.active;
    if (!c || c.car !== car || c.stopped) return;
    c.hits += n;
    const g = this.game;
    if (c.hits < 4) {
      g.hud.popup(`Getaway car webbed ${c.hits} of 4`);
      return;
    }
    c.stopped = true;
    car.webbed = 999;
    car.speed = 0;
    car.aiTarget = 0;
    g.hud.showBanner('Car stopped!', 'The robbers are running. Catch them!', 2.5);
    g.sound.splat();
    const f = car.forward(new THREE.Vector3());
    for (const side of [-1, 1]) c.robbers.push(this.addRobber(car.pos.x + f.z * side * 1.6, car.pos.z - f.x * side * 1.6));
  }

  // A robber got webbed.
  caught(r) {
    if (r.caught) return;
    r.caught = true;
    r.webT = 1e6;
    this.game.voices.say('robber', { cd: 2 });
    const c = this.active;
    const left = c ? c.robbers.filter((x) => !x.caught).length : 0;
    if (c && left) this.game.hud.popup(`Robber caught! ${left} to go`);
  }

  end(result, quiet = false) {
    const c = this.active;
    if (!c) return;
    const a = this.adv;
    const g = this.game;
    this.active = null;
    this.wait = 40 + Math.random() * 35;
    a.clearBeacon();
    if (result === 'win') {
      const coins = 120 + c.robbers.length * 30 + (c.car ? 60 : 0);
      a.prog.crimes = (a.prog.crimes || 0) + 1;
      g.gainCoins(coins);
      g.progress.addXp(150);
      g.progress.event('crime', { n: a.prog.crimes });
      g.hud.showBanner('Crime stopped!', `Your friendly neighbourhood hero · +${coins} coins`, 3.5);
      g.voices.say('stopped', { force: true, cd: 2 });
      g.sound.cleared();
      g.profile.scheduleSave();
    } else if (result === 'fail' && !quiet) {
      g.hud.showBanner('They got away...', 'Stay suited up, there will be more', 3);
    }
    // Everyone involved leaves after a while (the caught ones for the police).
    for (const r of c.robbers) a.removePersonLater(r, quiet ? 0 : 6);
    if (c.car) a.removeCarLater(c.car, quiet ? 0 : 12);
  }

  // What to show in the job box.
  objective() {
    const c = this.active;
    if (!c) return null;
    const loose = c.robbers.filter((r) => !r.caught).length;
    if (c.kind === 'getaway' && !c.stopped) return ['Crime alert', `Web the getaway car: ${c.hits} of 4 · ${Math.ceil(c.t)}s`];
    return ['Crime alert', `Catch the robbers: ${c.robbers.length - loose} of ${c.robbers.length} · ${Math.ceil(c.t)}s`];
  }
}
