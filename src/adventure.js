import * as THREE from 'three';
import { $ } from './util.js';
import { SX, SZ, SY, BLOCKS, B } from './world.js';
import { THEMES } from './themes.js';
import { generateCity, roadNodes, sidewalkLoops, GY, LANE, CITY_SIZE } from './city.js';
import { Car, CAR_TYPES, Skids } from './cars.js';
import { Person } from './townsfolk.js';
import { Police, POLICE_NUMBER } from './police.js';
import { Webs } from './webs.js';
import { MOB_TYPES } from './mobtypes.js';
import { BOSSES, Boss } from './boss.js';

// Adventure mode: explore Blockton, a modern town. Drive any parked car
// (E), take jobs from people with a "!" over their heads, find the golden
// cubes, and watch out for mobs at night.

export const CITY_THEME = { ...THEMES.meadow, name: 'Blockton', fog: [90, 230] };

const V = () => new THREE.Vector3();
const tmp = new THREE.Vector3();
const GOLD = [new THREE.Color('#fff6c8'), new THREE.Color('#ffd84a'), new THREE.Color('#f2c230')];

// Everyone with a job for you.
const GIVERS = {
  pizza: { name: 'Tony', title: 'Tony (Pizza)', seed: 11 },
  taxi: { name: 'Carl', title: 'Cabbie Carl', seed: 22 },
  race: { name: 'Rita', title: 'Racer Rita', seed: 33 },
  park: { name: 'Rosa', title: 'Ranger Rosa', seed: 44 },
  van: { name: 'Chief', title: 'Chief Blocksworth', seed: 55 },
  cubes: { name: 'Kevin', title: 'Kid Kevin', seed: 66 },
  stadium: { name: 'Coach', title: 'Coach Cole', seed: 77 },
  webs: { name: 'Webster', title: 'Web Master Webster', seed: 99 },
  site: { name: 'Fran', title: 'Foreman Fran', seed: 88 },
};

// --- Missions ---------------------------------------------------------------

const MISSIONS = {
  pizza: {
    title: 'Pizza Panic',
    coins: 250,
    xp: 250,
    lines: ['Mamma mia! Three orders and my driver is off sick.', 'Take these pizzas to the houses with the yellow lights. Hot pizza only: you have 110 seconds!', 'Grab any car you like. Go go go!'],
    start(a, m) {
      const doors = [...a.info.doors].filter((d) => d.id !== 'home').sort(() => Math.random() - 0.5);
      m.stops = doors.slice(0, 3);
      m.i = 0;
      m.t = 110;
      a.setBeacon(m.stops[0].x, m.stops[0].z, 0xffd23f);
    },
    update(a, m, dt) {
      m.t -= dt;
      const s = m.stops[m.i];
      if (a.near(s.x, s.z, 3.2)) {
        m.i++;
        a.game.sound.pickup();
        a.game.hud.popup(`Pizza delivered! ${m.i}/3`, 'power');
        if (m.i >= 3) return 'win';
        a.setBeacon(m.stops[m.i].x, m.stops[m.i].z, 0xffd23f);
      }
      return m.t <= 0 ? 'fail' : null;
    },
    objective: (a, m) => `Deliver pizza ${m.i + 1} of 3 · ${Math.ceil(m.t)}s`,
  },
  taxi: {
    title: 'Taxi Driver',
    coins: 300,
    xp: 300,
    lines: ["Hey pal! Blockton's busiest taxi company, that's me.", "Hop in the yellow taxi, pick up three passengers and get 'em where they're going.", 'Pull up next to them and stop. Easy money!'],
    start(a, m) {
      m.fares = 0;
      m.t = 200;
      m.stage = 'car';
      m.passenger = null;
      const taxi = a.cars.find((c) => c.type === 'taxi' && !c.dead && c.driver !== 'ai');
      if (taxi) a.setBeacon(taxi.pos.x, taxi.pos.z, 0xffd23f);
    },
    update(a, m, dt) {
      m.t -= dt;
      const car = a.game.player.driving;
      const inTaxi = car && car.type === 'taxi';
      if (m.stage === 'car' && inTaxi) m.stage = 'pickup';
      if (m.stage === 'pickup') {
        if (!m.passenger) {
          const p = a.randomSidewalk(40);
          m.passenger = a.addPerson({ x: p[0], z: p[1] });
          m.passenger.loop = null;
          m.passenger.chatT = 99;
          a.setBeacon(p[0], p[1], 0x6fd35a);
        }
        if (inTaxi && Math.abs(car.speed) < 3 && a.near(m.passenger.pos.x, m.passenger.pos.z, 5.5)) {
          m.passenger.visible = false;
          a.game.sound.clank(0.4);
          const d = a.randomSidewalk(45);
          m.dest = d;
          m.stage = 'drop';
          a.setBeacon(d[0], d[1], 0xffd23f);
        }
      } else if (m.stage === 'drop') {
        m.passenger.pos.copy(a.game.player.pos);
        if (inTaxi && Math.abs(car.speed) < 3 && a.near(m.dest[0], m.dest[1], 5)) {
          m.passenger.pos.set(m.dest[0], GY + 1, m.dest[1]);
          m.passenger.visible = true;
          m.passenger.fleeT = 0;
          a.removePersonLater(m.passenger, 4);
          m.passenger = null;
          m.fares++;
          a.game.gainCoins(40);
          a.game.hud.popup(`Fare paid! ${m.fares}/3 (+40 coins)`, 'power');
          if (m.fares >= 3) return 'win';
          m.stage = 'pickup';
        }
      }
      return m.t <= 0 ? 'fail' : null;
    },
    objective(a, m) {
      const car = a.game.player.driving;
      if (m.stage === 'car' || !car || car.type !== 'taxi') return `Get in the taxi · ${Math.ceil(m.t)}s`;
      return m.stage === 'pickup' ? `Pick up passenger ${m.fares + 1} of 3 · ${Math.ceil(m.t)}s` : `Drop them off at the yellow light · ${Math.ceil(m.t)}s`;
    },
    cleanup(a, m) {
      if (m.passenger) a.removePerson(m.passenger);
    },
  },
  race: {
    title: 'Street Race',
    coins: 300,
    xp: 300,
    lines: ["Think you're fast? Beat my lap record round Blockton.", 'Hit every checkpoint before the clock runs out. The sports car over there is all yours.', 'Ready... set...'],
    start(a, m) {
      const N = a.traffic.nodes;
      const n = Math.round(Math.sqrt(N.length));
      const at = (i, j) => N[j * n + i];
      // A lap round the middle of town.
      m.route = [at(1, 1), at(2, 1), at(3, 1), at(4, 1), at(4, 2), at(4, 3), at(4, 4), at(3, 4), at(2, 4), at(1, 4), at(1, 3), at(1, 2), at(1, 1)];
      m.i = 0;
      m.t = 75;
      m.go = false;
      const cp = m.route[0];
      a.setBeacon(cp.x, cp.z, 0x39b8ff);
    },
    update(a, m, dt) {
      const car = a.game.player.driving;
      if (!m.go) {
        if (car) {
          m.go = true;
          a.game.hud.showBanner('GO!', 'Follow the blue lights', 1.5);
          a.game.sound.wave();
        }
        return null;
      }
      m.t -= dt;
      const cp = m.route[m.i];
      if (a.near(cp.x, cp.z, 6.5)) {
        m.i++;
        a.game.sound.coin();
        if (m.i >= m.route.length) return 'win';
        const n = m.route[m.i];
        a.setBeacon(n.x, n.z, 0x39b8ff);
      }
      return m.t <= 0 ? 'fail' : null;
    },
    objective: (a, m) => (m.go ? `Checkpoint ${m.i + 1} of ${m.route.length} · ${Math.ceil(m.t)}s` : 'Get in a car to start'),
  },
  park: {
    title: 'Park Invasion',
    coins: 250,
    xp: 300,
    lines: ['Mossheads! In MY park! They are trampling the flowers!', 'Clear out fifteen of them before they reach the playground.'],
    start(a, m) {
      m.killed = 0;
      m.spawned = 0;
      m.goal = 15;
      m.tag = 'park';
      const [x0, z0, x1, z1] = a.info.lots.park;
      a.setBeacon((x0 + x1) / 2, (z0 + z1) / 2, 0xff5a5a);
    },
    update(a, m, dt) {
      const [x0, z0, x1, z1] = a.info.lots.park;
      const around = a.missionMobs();
      if (m.spawned < m.goal && around < 5) {
        const types = ['moss', 'moss:mini', 'moss:frost', 'bone', 'moss:giant'].filter((t) => MOB_TYPES[t]);
        // Not in the pond.
        for (let k = 0; k < 6; k++) {
          if (a.spawnMob(types[Math.floor(Math.random() * types.length)], x0 + 2 + Math.random() * (x1 - x0 - 4), z0 + 2 + Math.random() * (z1 - z0 - 4))) {
            m.spawned++;
            break;
          }
        }
      }
      return m.killed >= m.goal || (m.spawned >= m.goal && around === 0) ? 'win' : null;
    },
    objective: (a, m) => `Clear the park: ${m.killed} of ${m.goal}`,
  },
  van: {
    title: 'Gold Van Chase',
    coins: 400,
    xp: 400,
    lines: ["The Golden Overlord's goons just robbed the Blockton Bank!", "They're getting away in a gold van. Grab a police car, chase them down and stop that van. Shoot it, ram it, whatever it takes!", 'Then round up the goons.'],
    start(a, m) {
      const far = a.traffic.nodes.slice().sort((p, q) => a.game.player.pos.distanceToSquared(tmp.set(q.x, 0, q.z)) - a.game.player.pos.distanceToSquared(tmp.set(p.x, 0, p.z)))[0];
      const van = a.addCar('van', far.x + LANE, far.z, 0, true);
      van.aiTarget = 13;
      van.mission = true;
      m.van = van;
      m.t = 160;
      m.stage = 'chase';
      m.killed = 0;
      m.goal = 4;
      m.tag = 'van';
      van.onWreck = () => {
        m.stage = 'goons';
        a.game.hud.showBanner('Van stopped!', 'Get the goons!', 2.5);
        for (let i = 0; i < m.goal; i++) {
          const t = MOB_TYPES['knight'] ? 'knight' : 'moss';
          a.spawnMob(t, van.pos.x + (Math.random() - 0.5) * 4, van.pos.z + (Math.random() - 0.5) * 4);
        }
      };
    },
    update(a, m, dt) {
      if (m.stage === 'chase') {
        m.t -= dt;
        a.setBeacon(m.van.pos.x, m.van.pos.z, 0xffd23f, true);
        if (m.t <= 0) return 'fail';
      } else {
        a.clearBeacon();
        if (m.killed >= m.goal || a.missionMobs() === 0) return 'win';
      }
      return null;
    },
    objective: (a, m) => (m.stage === 'chase' ? `Stop the gold van! Van ${Math.max(0, Math.ceil((m.van.hp / m.van.def.hp) * 100))}% · ${Math.ceil(m.t)}s` : `Round up the goons: ${m.killed} of ${m.goal}`),
    cleanup(a, m) {
      if (m.van) a.removeCarLater(m.van, 20);
    },
  },
  webs: {
    title: 'Rooftop Rings',
    coins: 350,
    xp: 400,
    lines: [
      'Nice web shooters! Press 8 to put them on.',
      'Hold right click on a building to swing, let go to fly, and press Space to zip up your web.',
      'Swing through all my rings on the rooftops before the time runs out. Go!',
    ],
    start(a, m) {
      m.rings = a.rooftopRings(6);
      m.i = 0;
      m.t = 100;
      a.showRing(m.rings[0]);
      a.game.player.select(7);
    },
    update(a, m, dt) {
      m.t -= dt;
      const r = m.rings[m.i];
      const p = a.game.player.pos;
      if (Math.hypot(p.x - r.x, p.y + 1 - r.y, p.z - r.z) < 3.4) {
        m.i++;
        a.game.sound.coin();
        a.game.hud.popup(`Ring ${m.i}/${m.rings.length}!`, 'power');
        if (m.i >= m.rings.length) return 'win';
        a.showRing(m.rings[m.i]);
      }
      return m.t <= 0 ? 'fail' : null;
    },
    objective: (a, m) => `Swing through ring ${m.i + 1} of ${m.rings.length} · ${Math.ceil(m.t)}s`,
    cleanup(a) {
      a.showRing(null);
    },
  },
  stadium: {
    title: 'Stadium Showdown',
    coins: 500,
    xp: 600,
    lines: ["Big match tonight, kid. Problem is, the other team's captain is a BOSS.", 'Like, an actual boss. Muscles, glowing eyes, the lot. Beat it and the trophy is yours!'],
    start(a, m) {
      const [x0, z0, x1, z1] = a.info.lots.stadium;
      const done = Object.keys(a.prog.done).length;
      const i = (done + Math.floor(Math.random() * 3)) % BOSSES.length;
      const g = a.game;
      const mobs = g.mobs;
      const boss = new Boss(mobs, BOSSES[i].type, Math.floor((x0 + x1) / 2) + 0.5, GY + 1, Math.floor((z0 + z1) / 2) + 0.5, g.waveMul(4), mobs.nextId++);
      boss.advTag = 'stadium';
      mobs.list.push(boss);
      m.boss = boss;
      g.profile.markSeen(boss.type);
      g.hud.showBanner(boss.def.name, 'Stadium Showdown!', 3);
      g.sound.roar(1);
      m.tag = 'stadium';
      a.setBeacon((x0 + x1) / 2, (z0 + z1) / 2, 0xff5a5a);
    },
    update(a, m) {
      if (!m.boss) return 'win';
      if (m.boss.state === 'dying' || (m.boss.gone && m.boss.hp <= 0)) return 'win';
      return m.boss.gone ? 'fail' : null;
    },
    objective: (a, m) => (m.boss ? `Beat the ${m.boss.def.name}` : ''),
  },
  site: {
    title: 'Site Defence',
    coins: 300,
    xp: 350,
    lines: ["Hard hats on! Something's been digging up my building site.", 'Skitters and golems, three waves of them. Keep them off my crane!'],
    start(a, m) {
      m.wave = 0;
      m.left = 0;
      m.tag = 'site';
      m.pause = 1;
      const [x0, z0, x1, z1] = a.info.lots.site;
      a.setBeacon((x0 + x1) / 2, (z0 + z1) / 2, 0xff5a5a);
    },
    update(a, m, dt) {
      if (m.wave) m.left = a.missionMobs();
      if (m.left > 0) return null;
      m.pause -= dt;
      if (m.pause > 0) return null;
      if (m.wave >= 3) return 'win';
      m.wave++;
      m.pause = 3;
      const [x0, z0, x1, z1] = a.info.lots.site;
      const types = ['skitter', 'golem', 'skitter:mini', 'fuse'].filter((t) => MOB_TYPES[t]);
      const n = 3 + m.wave * 2;
      for (let i = 0; i < n; i++) a.spawnMob(types[Math.floor(Math.random() * types.length)], x0 + 2 + Math.random() * (x1 - x0 - 4), z0 + 2 + Math.random() * (z1 - z0 - 4));
      m.left = a.missionMobs();
      a.game.hud.showBanner(`Wave ${m.wave} of 3`, 'Defend the site!', 2);
      return null;
    },
    objective: (a, m) => (m.wave ? `Wave ${m.wave} of 3 · ${m.left} left` : 'Get ready...'),
  },
};

// --- The mode itself ---------------------------------------------------------------

export class Adventure {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.people = [];
    this.givers = {};
    this.cubes = [];
    this.active = null;
    this.beacon = null;
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.siren = false;
    this.nightT = 0;
    this.removals = [];
    this.driven = 0;
    const p = game.profile;
    p.adv = p.adv || { done: {}, cubes: [], met: {} };
    this.prog = p.adv;
  }

  // --- Setting up and tearing down ---

  start() {
    const g = this.game;
    this.info = generateCity(g.world, 7);
    g.world.flush();
    // Clouds above the skyscrapers.
    g.clouds.position.y = SY + 18;
    this.traffic = new Traffic(this);
    this.skids = new Skids(g.scene);
    this.nightK = 0;
    this.police = new Police(this);
    this.webs = new Webs(this);
    this.buildSigns();
    // Parked cars.
    for (const s of this.info.parking) {
      const type = s.type === 'player' ? 'sedan' : s.type === 'parked' ? ['sedan', 'pickup', 'suv'][Math.floor(Math.random() * 3)] : s.type;
      const c = this.addCar(type, s.x, s.z, s.yaw, false, s.type === 'player' ? '#f2c230' : undefined);
      if (s.type === 'player') c.mine = true;
    }
    // Traffic.
    const types = ['sedan', 'sedan', 'suv', 'taxi', 'pickup', 'sedan', 'police', 'sports', 'suv', 'bus', 'icecream', 'sedan', 'taxi', 'sedan', 'suv', 'pickup', 'sports', 'sedan', 'bus', 'taxi', 'police', 'sedan'];
    for (const t of types) {
      const r = this.traffic.randomSpot();
      const c = this.addCar(t, r.x, r.z, r.yaw, true);
      c.ai = r.route;
    }
    // People out for a walk.
    const loops = sidewalkLoops();
    for (let i = 0; i < 34; i++) this.addPerson({ loop: loops[(i * 7) % loops.length] });
    // People with jobs.
    for (const [id, gv] of Object.entries(GIVERS)) {
      const spot = this.info.givers[id];
      if (!spot) continue;
      const p = this.addPerson({ x: spot.x, z: spot.z, giver: id, name: gv.name, title: gv.title, seed: gv.seed });
      this.givers[id] = p;
    }
    // Golden cubes.
    this.info.cubes.forEach(([x, y, z], i) => {
      if (this.prog.cubes.includes(i)) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd84a }));
      m.position.set(x + 0.5, y + 0.6, z + 0.5);
      g.scene.add(m);
      this.cubes.push({ i, m, x: x + 0.5, y: y + 0.6, z: z + 0.5 });
    });
    this.buildGlow();
    this.buildMap();
    this.showUI(true);
  }

  // Street lamps and floodlights glow at night.
  buildGlow() {
    const w = this.game.world;
    const pts = [];
    for (let y = GY + 1; y < SY; y++) for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) if (w.get(x, y, z) === B.LAMP) pts.push(x + 0.5, y + 0.3, z + 0.5);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,244,200,1)');
    grad.addColorStop(0.25, 'rgba(255,220,140,0.55)');
    grad.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.glow = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size: 3.2, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.visible = false;
    this.glow.frustumCulled = false;
    this.game.scene.add(this.glow);
  }

  dispose() {
    const g = this.game;
    if (this.active) this.endMission(null);
    if (g.player.driving) this.exitCar(true);
    for (const c of this.cars) c.dispose();
    for (const p of this.people) p.dispose();
    for (const c of this.cubes) g.scene.remove(c.m);
    if (this.glow) {
      g.scene.remove(this.glow);
      this.glow.geometry.dispose();
      this.glow.material.map.dispose();
      this.glow.material.dispose();
      this.glow = null;
    }
    this.clearBeacon();
    g.clouds.position.y = 40;
    if (this.traffic) this.traffic.dispose();
    if (this.skids) this.skids.dispose();
    this.skids = null;
    if (this.police) this.police.dispose();
    if (this.webs) this.webs.dispose();
    document.body.classList.remove('adventure', 'web-ok');
    const p = g.player;
    if (p.held === 7) p.select(0);
    p.webFly = false;
    for (const m of this.signs || []) {
      g.scene.remove(m);
      m.geometry.dispose();
      m.material.map.dispose();
      m.material.dispose();
    }
    this.signs = [];
    this.cars = [];
    this.people = [];
    this.cubes = [];
    g.sound.engine(false);
    g.sound.siren(false);
    this.showUI(false);
  }

  // The engine and siren go quiet while the game is paused.
  quiet() {
    const snd = this.game.sound;
    snd.engine(false);
    snd.siren(false);
    snd.copSiren(0);
    snd.heli(0);
    snd.skid(0);
  }

  showUI(on) {
    document.body.classList.toggle('adventure', on);
    $('#minimap').hidden = !on;
    $('#drive-hud').hidden = true;
    $('#prompt').hidden = true;
    document.body.classList.toggle('driving', false);
  }

  get spawn() {
    const s = this.info.spawn;
    return new THREE.Vector3(s.x, this.groundAt(s.x, s.z, GY + 2), s.z);
  }

  get policeDoor() {
    const s = this.info.police;
    return new THREE.Vector3(s.x, this.groundAt(s.x, s.z, GY + 2), s.z);
  }

  // Signs on the buildings, painted on canvases.
  buildSigns() {
    const g = this.game;
    this.signs = [];
    for (const sg of this.info.signs || []) {
      const c = document.createElement('canvas');
      c.width = Math.round(64 * sg.w);
      c.height = Math.round(64 * sg.h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = sg.bg;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.strokeStyle = sg.fg;
      ctx.lineWidth = 5;
      ctx.strokeRect(4, 4, c.width - 8, c.height - 8);
      ctx.fillStyle = sg.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      sg.lines.forEach(([text, size], i) => {
        // Shrink the words until they fit.
        let px = size;
        do {
          ctx.font = `700 ${px}px 'Pixelify Sans', ui-monospace, monospace`;
          px -= 2;
        } while (ctx.measureText(text).width > c.width - 18 && px > 8);
        ctx.fillText(text, c.width / 2, (c.height * (i + 0.5)) / sg.lines.length + 2);
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sg.w, sg.h), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(sg.x, sg.y, sg.z);
      m.rotation.y = sg.ry;
      g.scene.add(m);
      this.signs.push(m);
    }
  }

  get hospital() {
    const s = this.info.hospital;
    return new THREE.Vector3(s.x, this.groundAt(s.x, s.z, GY + 2), s.z);
  }

  // The highest ground at (x, z) at or below `from`.
  groundAt(x, z, from = SY - 1) {
    const w = this.game.world;
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    for (let y = Math.min(SY - 1, Math.floor(from)); y > 0; y--) if (w.solid(fx, y - 1, fz) && !w.solid(fx, y, fz)) return y;
    return GY + 1;
  }

  addCar(type, x, z, yaw, ai, color) {
    const c = new Car(this, type, x, z, yaw, { ai, color });
    this.cars.push(c);
    return c;
  }

  removeCar(c) {
    c.dispose();
    this.cars = this.cars.filter((x) => x !== c);
  }

  removeCarLater(c, t) {
    this.removals.push({ t, fn: () => this.removeCar(c) });
  }

  addPerson(opts) {
    const p = new Person(this, opts);
    this.people.push(p);
    return p;
  }

  removePerson(p) {
    p.dispose();
    this.people = this.people.filter((x) => x !== p);
  }

  removePersonLater(p, t) {
    this.removals.push({ t, fn: () => this.removePerson(p) });
  }

  // A point on some sidewalk at least `minDist` from you.
  randomSidewalk(minDist = 30) {
    const loops = sidewalkLoops();
    const pp = this.game.player.pos;
    for (let k = 0; k < 40; k++) {
      const loop = loops[Math.floor(Math.random() * loops.length)];
      const i = Math.floor(Math.random() * 4);
      const [ax, az] = loop[i];
      const [bx, bz] = loop[(i + 1) % 4];
      const t = 0.2 + Math.random() * 0.6;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (Math.hypot(x - pp.x, z - pp.z) >= minDist) return [x, z];
    }
    return loops[0][0];
  }

  // Are you (or your car) close to (x, z)?
  near(x, z, r) {
    const p = this.game.player.pos;
    return Math.hypot(p.x - x, p.z - z) < r;
  }

  spawnMob(type, x, z) {
    const g = this.game;
    const m = g.mobs.spawnAt(type, x, z, g.waveMul(3));
    if (m) {
      m.advTag = this.active ? this.active.tag : 'night';
      g.profile.markSeen(m.type);
    }
    return m;
  }

  missionMobs() {
    const tag = this.active && this.active.tag;
    return this.game.mobs.list.filter((m) => m.advTag === tag && !m.gone && m.state !== 'dying').length;
  }

  // --- Beacons: a tall beam of light over where you need to go ---

  setBeacon(x, z, color, follow = false) {
    if (!this.beacon) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 40, 0.7),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.game.scene.add(m);
      this.beacon = m;
    }
    this.beacon.material.color.set(color);
    this.beacon.position.set(x, GY + 20, z);
    this.beaconAt = [x, z];
    if (!follow) this.game.sound.pickup();
  }

  clearBeacon() {
    if (this.beacon) {
      this.game.scene.remove(this.beacon);
      this.beacon.geometry.dispose();
      this.beacon.material.dispose();
      this.beacon = null;
    }
    this.beaconAt = null;
  }

  // --- Jobs ---

  showMark(person) {
    return !this.active && !!person.giver && (person.giver !== 'cubes' || !this.prog.met.cubes);
  }

  talkTo(person) {
    const g = this.game;
    const id = person.giver;
    const who = { name: person.name, color: '#ffd23f', skin: person.canvas };
    if (id === 'cubes') {
      this.prog.met.cubes = true;
      g.profile.scheduleSave();
      const left = this.info.cubes.length - this.prog.cubes.length;
      g.talk(
        [
          [who, 'Psst! I hid golden cubes all over Blockton. On roofs, in alleys, even on the beach!'],
          [who, left ? `There are ${left} left to find. Each one is worth 50 coins, and if you find them all I'll give you 500 more!` : 'You found every single one. You are the best explorer in Blockton!'],
          [who, 'Some are way up on the skyscrapers. Use your web shooters (press 8) to get up there!'],
        ],
        () => {},
      );
      return;
    }
    const M = MISSIONS[id];
    if (!M) return;
    const again = this.prog.done[id];
    const lines = M.lines.map((t) => [who, t]);
    if (again) lines.unshift([who, `Back for more? Same job, smaller tip this time.`]);
    g.talk(lines, () => this.startMission(id));
  }

  startMission(id) {
    const M = MISSIONS[id];
    const m = { id, M, tag: id };
    this.active = m;
    M.start(this, m);
    this.game.hud.showBanner(M.title, 'Job started', 2.5);
    this.game.sound.wave();
  }

  endMission(result) {
    const m = this.active;
    if (!m) return;
    const g = this.game;
    this.active = null;
    this.clearBeacon();
    if (m.M.cleanup) m.M.cleanup(this, m);
    // Mission mobs wander off.
    for (const mob of g.mobs.list) if (mob.advTag === m.tag && mob.state === 'live') mob.remove(true);
    if (result === 'win') {
      const first = !this.prog.done[m.id];
      const coins = Math.round(m.M.coins * (first ? 1 : 0.4));
      this.prog.done[m.id] = (this.prog.done[m.id] || 0) + 1;
      g.gainCoins(coins);
      g.progress.addXp(first ? m.M.xp : Math.round(m.M.xp * 0.4));
      g.progress.event('mission', { id: m.id, first });
      g.hud.showBanner(`${m.M.title}: done!`, `+${coins} coins`, 3.5);
      g.sound.cleared();
      g.profile.scheduleSave();
    } else if (result === 'fail') {
      g.hud.showBanner(`${m.M.title}: failed`, 'Talk to them again to have another go', 3);
      g.sound.death();
    }
  }

  onKill(mob) {
    const m = this.active;
    if (!m || mob.advTag !== m.tag) return;
    if (m.killed !== undefined) m.killed++;
    if (m.left !== undefined) m.left = Math.max(0, m.left - 1);
  }

  // --- Driving ---

  nearestCar(r = 3.8) {
    const p = this.game.player.pos;
    let best = null;
    let bd = r;
    for (const c of this.cars) {
      if (c.dead || c.mission || (c.driver === 'ai' && Math.abs(c.speed) > 4) || Math.abs(c.pos.y - p.y) > 2.5) continue;
      // A police car the officers got out of is up for grabs...
      if (c.driver === 'cop' && !(c.unit && c.unit.mode === 'deployed')) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z) - c.def.wid / 2;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  nearestGiver(r = 3) {
    const p = this.game.player.pos;
    for (const person of Object.values(this.givers)) if (person.pos.distanceTo(p) < r) return person;
    return null;
  }

  enterCar(c) {
    const g = this.game;
    const p = g.player;
    if (c.driver === 'ai') {
      // Car-jacked! The driver hops out and runs off.
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      const side = c.def.wid / 2 + 0.8;
      const out = this.addPerson({ x: c.pos.x + co * side, z: c.pos.z - s * side });
      out.fleeFrom.copy(p.pos);
      // ...and phones the police about it.
      out.startCall();
      this.removePersonLater(out, 16);
      c.ai = null;
      c.sirenOn = false;
      g.hud.popup('Hey! That was my car!', 'heal');
    } else if (c.driver === 'cop') {
      // Stealing a police car. Bold.
      if (c.unit) c.unit.car = null;
      c.unit = null;
      c.sirenOn = false;
      this.police.crime('stealCop');
    }
    p.driving = c;
    c.driver = 'player';
    this.camPos = null;
    p.thirdPerson = false;
    p.inspectT = 0;
    p.stopEmote();
    this.camYaw = 0;
    g.combat.beamTick(p, null, 0, false);
    c.openDoor();
    g.sound.engine(true, 0, c.def.snd || 'car');
    document.body.classList.add('driving');
    $('#drive-hud').hidden = false;
    $('#dh-name').textContent = c.def.name;
  }

  exitCar(silent = false) {
    const g = this.game;
    const p = g.player;
    const c = p.driving;
    if (!c) return;
    p.driving = null;
    if (!c.dead) c.driver = null;
    this.siren = false;
    g.sound.engine(false);
    g.sound.siren(false);
    document.body.classList.remove('driving');
    $('#drive-hud').hidden = true;
    // Step out of the driver's door, or on top if it's blocked.
    const s = Math.sin(c.yaw);
    const co = Math.cos(c.yaw);
    const side = c.def.wid / 2 + 0.7;
    const w = g.world;
    let x = c.pos.x + co * side;
    let z = c.pos.z - s * side;
    let y = this.groundAt(x, z, c.pos.y + 2);
    if (w.solid(Math.floor(x), Math.floor(y), Math.floor(z)) || y > c.pos.y + 1.5) {
      x = c.pos.x - co * side;
      z = c.pos.z + s * side;
      y = this.groundAt(x, z, c.pos.y + 2);
    }
    p.pos.set(x, y, z);
    p.vel.set(0, 0, 0);
    p.yaw = c.yaw + Math.PI;
    if (!silent) c.openDoor();
    g.sound.skid(0);
  }

  // The camera follows the car from behind. Move the mouse to look around.
  carCamera(cam, dt) {
    const c = this.game.player.driving;
    const g = this.game;
    const [mx, my] = g.input.takeMouse();
    const sens = g.settings.sens || 1;
    this.camYaw -= mx * 0.0035 * sens;
    this.camPitch = Math.max(-0.1, Math.min(0.9, this.camPitch + my * 0.0028 * sens * (g.settings.invertY ? -1 : 1)));
    // The camera swings back behind the car once you get going.
    if (Math.abs(c.speed) > 3 && Math.abs(mx) < 1) this.camYaw *= Math.exp(-2 * dt);
    this.camYaw = Math.atan2(Math.sin(this.camYaw), Math.cos(this.camYaw));
    const yaw = c.yaw + Math.PI + this.camYaw;
    const dist = 5.5 + c.def.len * 0.6;
    const eye = 0.4 + c.def.hgt * 0.65;
    const want = tmp.set(c.pos.x + Math.sin(yaw) * dist * Math.cos(this.camPitch), c.pos.y + eye + Math.sin(this.camPitch) * dist, c.pos.z + Math.cos(yaw) * dist * Math.cos(this.camPitch));
    // Don't go through walls.
    const w = this.game.world;
    const from = V().set(c.pos.x, c.pos.y + eye + 0.2, c.pos.z);
    const dir = want.clone().sub(from);
    const len = dir.length();
    dir.divideScalar(len);
    let safe = len;
    for (let t = 0.5; t < len; t += 0.25) {
      if (w.solid(Math.floor(from.x + dir.x * t), Math.floor(from.y + dir.y * t), Math.floor(from.z + dir.z * t))) {
        safe = t - 0.3;
        break;
      }
    }
    const target = from.addScaledVector(dir, Math.max(1, safe));
    if (!this.camPos) this.camPos = target.clone();
    this.camPos.lerp(target, 1 - Math.exp(-10 * dt));
    cam.position.copy(this.camPos);
    cam.lookAt(c.pos.x, c.pos.y + eye - 0.1, c.pos.z);
    const fov = 72 + Math.min(14, Math.abs(c.speed) * 0.5);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  // What's in front of a car, and how far: other cars, people, you, mobs.
  obstacleAhead(car, f, ignorePlayer = false) {
    let best = 99;
    const rx = f.z;
    const rz = -f.x;
    const check = (x, z, halfLen, halfWid) => {
      const dx = x - car.pos.x;
      const dz = z - car.pos.z;
      const along = dx * f.x + dz * f.z - car.def.len / 2 - halfLen;
      const side = Math.abs(dx * rx + dz * rz);
      if (along > -1 && along < best && side < car.def.wid / 2 + halfWid + 0.3) best = Math.max(0, along);
    };
    for (const c of this.cars) if (c !== car) check(c.pos.x, c.pos.z, c.def.len / 2, c.def.wid / 2);
    const p = this.game.player;
    if (!p.driving && !p.dead && !ignorePlayer) check(p.pos.x, p.pos.z, 0.3, 0.3);
    for (const person of this.people) if (person.visible) check(person.pos.x, person.pos.z, 0.3, 0.3);
    for (const o of this.police.officers()) check(o.pos.x, o.pos.z, 0.3, 0.3);
    for (const m of this.game.mobs.list) if (m.state === 'live') check(m.pos.x, m.pos.z, m.hw, m.hw);
    return best;
  }

  // Bullets that hit cars, police officers or the helicopter.
  traceCars(o, d, maxT) {
    let best = null;
    for (const c of this.cars) {
      if (c.dead && c.deadT > 30) continue;
      const t = c.hitTest(o, d, maxT);
      if (t !== null && (!best || t < best.t)) best = { car: c, t };
    }
    for (const off of this.police.officers()) {
      const h = off.hitTest(o, d, best ? best.t : maxT);
      if (h) best = { officer: off, t: h.t, head: h.head };
    }
    const heli = this.police.heli;
    if (heli) {
      const t = heli.hitTest(o, d, best ? best.t : maxT);
      if (t !== null) best = { heli, t };
    }
    return best;
  }

  // An explosion hurts cars and scares people.
  blast(at, r, dmg) {
    // Explosions you set off (or a car you wrecked going up) count as yours.
    const by = this.blastBy !== undefined ? this.blastBy : 'player';
    for (const c of this.cars) {
      const d = c.pos.distanceTo(at);
      if (d < r + c.def.len / 2) {
        // Dent the side facing the blast.
        const dir = V().subVectors(c.pos, at).setY(0).normalize();
        c.dent(V().copy(c.pos).addScaledVector(dir, -c.def.wid * 0.6).setY(c.pos.y + 0.8), dir, 0.25 * Math.max(0.3, 1 - d / (r + 2)));
        c.spinV += (Math.random() - 0.5) * 2;
        c.damage(dmg * 1.5 * Math.max(0.3, 1 - d / (r + 2)), null, by);
      }
    }
    for (const o of this.police.officers()) if (o.pos.distanceTo(at) < r + 0.5) o.damage(dmg, by === 'player');
    const heli = this.police.heli;
    if (heli && heli.pos.distanceTo(at) < r + 2 && by === 'player') heli.damage(dmg * 2);
    for (const p of this.people) if (p.pos.distanceTo(at) < 18) p.scare(at, 6);
  }

  // Someone fired a gun near here.
  gunshot(at) {
    for (const p of this.people) if (p.pos.distanceTo(at) < 14) p.scare(at, 4);
  }

  // --- Every frame ---

  update(dt) {
    const g = this.game;
    const p = g.player;
    const inp = g.input;
    // Getting in and out, and talking to people.
    const car = p.driving;
    let prompt = '';
    if (!p.dead && g.state === 'playing') {
      if (car) {
        if (inp.pressed.has('KeyE')) this.exitCar();
        else {
          const k = inp.keys;
          const th = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
          const st = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
          car.drive(dt, th, st, k.has('Space'));
          if (inp.pressed.has('KeyH')) g.sound.horn(1);
          if (inp.pressed.has('KeyF') && car.def.siren) {
            this.siren = !this.siren;
            g.sound.siren(this.siren);
          }
          this.driven += Math.abs(car.speed) * dt;
          if (this.driven > 100) {
            g.progress.event('drive', { m: Math.round(this.driven) });
            this.driven = 0;
          }
        }
      } else {
        const giver = this.nearestGiver();
        const near = this.nearestCar();
        if (giver && !this.active && this.showMark(giver)) {
          prompt = `Press E to talk to ${giver.name}`;
          if (inp.pressed.has('KeyE')) this.talkTo(giver);
        } else if (near) {
          prompt = `Press E to drive the ${near.def.name}`;
          if (inp.pressed.has('KeyE')) this.enterCar(near);
        }
      }
    }
    const pr = $('#prompt');
    if (pr.textContent !== prompt) pr.textContent = prompt;
    pr.hidden = !prompt;

    this.traffic.update(dt);
    for (const c of this.cars) c.update(dt);
    this.collide(dt);
    if (p.driving) p.pos.set(p.driving.pos.x, p.driving.pos.y + 0.3, p.driving.pos.z);
    this.updateThreats(dt);
    this.updateRepair(dt);
    this.webs.update(dt);
    this.police.update(dt);
    this.upkeep(dt);
    for (const person of this.people) person.update(dt);
    // Things removed after a delay.
    for (const r of this.removals) r.t -= dt;
    for (const r of this.removals.filter((x) => x.t <= 0)) r.fn();
    this.removals = this.removals.filter((x) => x.t > 0);
    this.updateCubes(dt);
    this.updateNight(dt);
    if (this.beacon) this.beacon.material.opacity = 0.35 + Math.sin(performance.now() / 200) * 0.12;
    if (this.ring) this.ring.rotation.y += dt * 1.2;
    // The job in progress.
    if (this.active) {
      const res = this.active.M.update(this, this.active, dt);
      if (res) this.endMission(res);
    }
    // Driving HUD.
    if (car) {
      if (car.dead) {
        this.exitCar();
        p.hurt(6, car.pos, 'self');
      } else {
        $('#dh-speed').textContent = String(Math.round(Math.abs(car.speed) * 3.6));
        $('#dh-hp').style.width = `${Math.max(0, (car.hp / car.def.hp) * 100)}%`;
        // Four gears: the revs climb, then drop as it changes up.
        const k = Math.min(1, Math.abs(car.speed) / car.def.speed) * 4;
        const gear = Math.min(3, Math.floor(k));
        const revs = Math.abs(car.speed) < 0.5 ? 0.05 : 0.15 + gear * 0.1 + (k - gear) * 0.5;
        g.sound.engine(true, revs, car.def.snd || 'car');
        g.sound.siren(this.siren);
        g.sound.skid(car.skidding ? Math.min(1, 0.4 + car.slip * 0.1) : 0);
      }
    }
    this.mapT = (this.mapT || 0) - dt;
    if (this.mapT <= 0) {
      this.mapT = 0.1;
      this.drawMap();
    }
  }

  // Point a gun at someone and they put their hands up, then call the
  // police as soon as you look away.
  updateThreats(dt) {
    const g = this.game;
    const p = g.player;
    const armed = g.state === 'playing' && !p.driving && !p.dead && p.held < 3 && !!p.weapon;
    let target = null;
    if (armed) {
      const o = g.camera.position;
      const d = p.aimDir(V());
      const block = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 30);
      let best = block ? block.t : 30;
      for (const person of this.people) {
        if (person.giver || !person.visible || person.pos.distanceTo(p.pos) > 30) continue;
        const t = person.hitTest(o, d, best);
        if (t !== null) {
          best = t;
          target = person;
        }
      }
    }
    for (const person of this.people) person.aimedAt(person === target, dt, p.pos);
  }

  // Spots high up on the tallest rooftops, one after another, for the
  // Rooftop Rings job.
  rooftopRings(n) {
    const w = this.game.world;
    const tops = [];
    for (let z = 20; z < SZ - 20; z += 5) {
      for (let x = 20; x < SX - 20; x += 5) {
        let y = SY - 1;
        while (y > GY && !w.solid(x, y, z)) y--;
        if (y >= GY + 20) tops.push({ x: x + 0.5, y: y + 4, z: z + 0.5 });
      }
    }
    const out = [];
    let at = this.game.player.pos;
    while (out.length < n && tops.length) {
      // The nearest tall roof that isn't too close to the last one.
      let best = -1;
      let bd = Infinity;
      tops.forEach((t, i) => {
        const d = Math.hypot(t.x - at.x, t.z - at.z);
        if (d > 22 && d < bd && out.every((o) => Math.hypot(o.x - t.x, o.z - t.z) > 22)) {
          bd = d;
          best = i;
        }
      });
      if (best < 0) break;
      const t = tops.splice(best, 1)[0];
      out.push(t);
      at = t;
    }
    return out;
  }

  // A big glowing ring to fly through (and a beacon to find it).
  showRing(r) {
    const g = this.game;
    if (!this.ring) {
      this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.28, 8, 24), new THREE.MeshBasicMaterial({ color: '#39b8ff' }));
      g.scene.add(this.ring);
    }
    this.ring.visible = !!r;
    if (r) {
      this.ring.position.set(r.x, r.y, r.z);
      this.setBeacon(r.x, r.z, 0x39b8ff);
    } else {
      this.clearBeacon();
      g.scene.remove(this.ring);
      this.ring.geometry.dispose();
      this.ring.material.dispose();
      this.ring = null;
    }
  }

  // Landed a big jump.
  stunt(car, airT) {
    const g = this.game;
    const coins = Math.round(airT * 25);
    g.gainCoins(coins);
    g.hud.showBanner('STUNT JUMP!', `${airT.toFixed(1)} seconds in the air · +${coins} coins`, 2.2);
    g.sound.powerup();
    g.progress.event('stunt', { t: airT });
  }

  // Block Fix: drive in and stop, and they fix your car for 50 coins.
  updateRepair(dt) {
    const g = this.game;
    const car = g.player.driving;
    const r = this.info.repair;
    if (!r) return;
    const inside = car && car.pos.x > r[0] && car.pos.x < r[2] && car.pos.z > r[1] && car.pos.z < r[3];
    if (!inside) {
      this.repairT = 0;
      this.repaired = false;
      return;
    }
    if (this.repaired || Math.abs(car.speed) > 1) return;
    this.repairT = (this.repairT || 0) + dt;
    if (this.repairT < 1.2) return;
    this.repaired = true;
    const cost = 50;
    if (g.profile.coins < cost && car.hp >= car.def.hp && !car.dented) return;
    if (g.profile.coins < cost) {
      g.hud.showBanner('Block Fix', `A repair costs ${cost} coins. Come back when you have some!`, 2.5);
      return;
    }
    g.profile.coins -= cost;
    g.profile.changed();
    const cols = car.def.colors.length > 1 ? car.def.colors.filter((c) => c !== car.color) : ['#3d6fd8', '#d8392b', '#2a2a2e', '#e8e4dc', '#4d8a2c', '#ff7a2f', '#b46cff'];
    car.repair(cols[Math.floor(Math.random() * cols.length)]);
    g.fx.burst(car.pos.x, car.pos.y + 1.5, car.pos.z, [new THREE.Color(car.color), new THREE.Color('#ffffff')], 40, { speed: 3, size: 0.12, up: 2, life: 1, spread: 1.2 });
    g.sound.buy();
    let sub = `Fixed and resprayed for ${cost} coins.`;
    // A new colour: the police can't find you any more.
    if (this.police.stars > 0 && !this.police.seen) {
      this.police.reset();
      sub += ' The police lost you!';
    }
    g.hud.showBanner('Good as new!', sub, 3);
  }

  // Clear away old wrecks and keep the roads busy.
  upkeep(dt) {
    this.upkeepT = (this.upkeepT || 0) - dt;
    if (this.upkeepT > 0) return;
    this.upkeepT = 4;
    const pp = this.game.player.pos;
    const far = (c) => Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z) > 35;
    for (const c of this.cars.filter((c) => c.dead && c.deadT > 40 && far(c))) this.removeCar(c);
    const traffic = this.cars.filter((c) => c.driver === 'ai' && !c.dead && !c.mission).length;
    if (traffic < 20) {
      const types = ['sedan', 'sedan', 'suv', 'taxi', 'pickup', 'police', 'sports', 'bus', 'icecream'];
      for (let k = 0; k < 6; k++) {
        const r = this.traffic.randomSpot();
        if (Math.hypot(r.x - pp.x, r.z - pp.z) < 30) continue;
        if (this.cars.some((c) => Math.hypot(c.pos.x - r.x, c.pos.z - r.z) < 7)) continue;
        const c = this.addCar(types[Math.floor(Math.random() * types.length)], r.x, r.z, r.yaw, true);
        c.ai = r.route;
        break;
      }
    }
  }

  objective() {
    const m = this.active;
    if (m) return [m.M.title, m.M.objective(this, m)];
    const left = this.info.cubes.length - this.prog.cubes.length;
    const night = this.game.sky.isNight();
    return ['Blockton', night ? 'Night time: mobs are out. Stay safe!' : `Talk to people with a ! for jobs · Golden cubes ${this.prog.cubes.length}/${this.info.cubes.length}${left ? '' : ' ★'}`];
  }

  // Cars bump into each other, mobs get run over, people jump clear.
  collide(dt) {
    const g = this.game;
    const cars = this.cars;
    // You can't walk through a car.
    const me = g.player;
    if (!me.driving && !me.dead) {
      for (const c of cars) {
        if (me.pos.y > c.pos.y + c.def.hgt - 0.1 || me.pos.y + 1.8 < c.pos.y) continue;
        const sn = Math.sin(c.yaw);
        const cs = Math.cos(c.yaw);
        const dx = me.pos.x - c.pos.x;
        const dz = me.pos.z - c.pos.z;
        const along = dx * sn + dz * cs;
        const side = dx * cs - dz * sn;
        const pl = c.def.len / 2 + 0.3 - Math.abs(along);
        const pw = c.def.wid / 2 + 0.3 - Math.abs(side);
        if (pl <= 0 || pw <= 0) continue;
        if (pl < pw) {
          const k = pl * Math.sign(along || 1);
          me.pos.x += sn * k;
          me.pos.z += cs * k;
        } else {
          const k = pw * Math.sign(side || 1);
          me.pos.x += cs * k;
          me.pos.z -= sn * k;
        }
      }
    }
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        const hit = carOverlap(a, b);
        if (!hit) continue;
        // The monster truck drives right over other cars and crushes them.
        const big = a.def.crush && !b.def.crush ? a : b.def.crush && !a.def.crush ? b : null;
        if (big && Math.abs(big.speed) > 3) {
          const small = big === a ? b : a;
          small.damage(Math.abs(big.speed) * 14 * dt, null, big.driver === 'player' ? 'player' : null);
          small.squash = Math.min(0.45, (small.squash || 0) + dt * 2);
          small.speed *= 1 - Math.min(1, 4 * dt);
          big.bounceV = Math.max(big.bounceV, 0.9);
          if (Math.random() < dt * 8) g.sound.crash(0.5);
          continue;
        }
        // Push them apart along the shallowest axis (heavier cars move less).
        const [ux, uz, depth] = hit;
        const ma = a.mass;
        const mb = b.mass;
        const ka = mb / (ma + mb);
        a.pos.x -= ux * depth * ka;
        a.pos.z -= uz * depth * ka;
        b.pos.x += ux * depth * (1 - ka);
        b.pos.z += uz * depth * (1 - ka);
        // A bump: swap momentum along the line between them.
        const closing = (a.vel.x - b.vel.x) * ux + (a.vel.z - b.vel.z) * uz;
        if (closing <= 0.3) continue;
        const imp = (1.3 * closing) / (1 / ma + 1 / mb);
        a.vel.x -= (imp / ma) * ux;
        a.vel.z -= (imp / ma) * uz;
        b.vel.x += (imp / mb) * ux;
        b.vel.z += (imp / mb) * uz;
        a.speed = a.vel.x * Math.sin(a.yaw) + a.vel.z * Math.cos(a.yaw);
        b.speed = b.vel.x * Math.sin(b.yaw) + b.vel.z * Math.cos(b.yaw);
        // Where they touch: hitting off-centre spins them.
        const ea = Math.abs(ux * Math.sin(a.yaw) + uz * Math.cos(a.yaw)) * a.def.len * 0.5 + Math.abs(ux * Math.cos(a.yaw) - uz * Math.sin(a.yaw)) * a.def.wid * 0.5;
        const cx = a.pos.x + ux * ea;
        const cz = a.pos.z + uz * ea;
        a.spinV += (((cx - a.pos.x) * -uz - (cz - a.pos.z) * -ux) * imp * 0.05) / ma + (Math.random() - 0.5) * closing * 0.03;
        b.spinV += (((cx - b.pos.x) * uz - (cz - b.pos.z) * ux) * imp * 0.05) / mb + (Math.random() - 0.5) * closing * 0.03;
        if (closing > 5) {
          const byA = a.driver === 'player' ? 'player' : null;
          const byB = b.driver === 'player' ? 'player' : null;
          const at = V().set(cx, (a.pos.y + b.pos.y) / 2 + 0.75, cz);
          a.crash(closing * 1.4 * ka, at, V().set(-ux, 0, -uz), byB);
          b.crash(closing * 1.4 * (1 - ka), at, V().set(ux, 0, uz), byA);
        }
      }
      if (Math.abs(a.speed) < 2.5 || a.dead) continue;
      const f = a.forward(V());
      // Run over mobs.
      for (const m of g.mobs.list) {
        if (m.state !== 'live') continue;
        const dx = m.pos.x - a.pos.x;
        const dz = m.pos.z - a.pos.z;
        const along = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (Math.abs(along) < a.def.len / 2 + m.hw && side < a.def.wid / 2 + m.hw && Math.abs(m.pos.y - a.pos.y) < 2) {
          const dmg = Math.abs(a.speed) * (m.def.boss ? 1.5 : 4);
          m.damage(dmg, { x: f.x * Math.sign(a.speed), y: 0, z: f.z * Math.sign(a.speed) }, false, m.pos.clone().setY(m.pos.y + 1), a.driver === 'player' ? g.myId : -1, {});
          a.speed *= m.def.boss ? 0.2 : 0.8;
          a.damage(m.def.boss ? 8 : 2, null);
        }
      }
      // People dive out of the way.
      for (const person of this.people) {
        if (!person.visible || person.giver) continue;
        const dx = person.pos.x - a.pos.x;
        const dz = person.pos.z - a.pos.z;
        const along = dx * f.x * Math.sign(a.speed) + dz * f.z * Math.sign(a.speed);
        const side = Math.abs(dx * f.z - dz * f.x);
        if (along > 0 && along < a.def.len / 2 + 3 && side < a.def.wid / 2 + 0.6) person.dodge(a);
      }
      // Running into police officers knocks them flat.
      for (const o of this.police.officers()) {
        if (o.state === 'down') continue;
        const dx = o.pos.x - a.pos.x;
        const dz = o.pos.z - a.pos.z;
        const along = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (Math.abs(along) < a.def.len / 2 + 0.3 && side < a.def.wid / 2 + 0.3 && Math.abs(o.pos.y - a.pos.y) < 1.5 && Math.abs(a.speed) > 4) o.runOver(a);
      }
      // A car driving into you on foot knocks you over.
      const p = g.player;
      if (!p.driving && !p.dead && (a.driver === 'ai' || a.driver === 'cop')) {
        const dx = p.pos.x - a.pos.x;
        const dz = p.pos.z - a.pos.z;
        const along = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (Math.abs(along) < a.def.len / 2 + 0.3 && side < a.def.wid / 2 + 0.3) {
          p.vel.x += f.z * 6 * Math.sign(dx * f.z - dz * f.x || 1);
          p.vel.z -= f.x * 6 * Math.sign(dx * f.z - dz * f.x || 1);
          p.vel.y = 5;
          p.invuln = 0;
          p.hurt(3, a.pos, 'self');
          a.speed = 0;
        }
      }
    }
  }

  updateCubes(dt) {
    const g = this.game;
    const p = g.player.pos;
    const t = performance.now() / 1000;
    for (const c of this.cubes) {
      c.m.rotation.y = t * 2;
      c.m.rotation.x = t * 1.3;
      c.m.position.y = c.y + Math.sin(t * 2 + c.i) * 0.12;
      if (Math.random() < dt * 3) g.fx.burst(c.x, c.y, c.z, GOLD, 1, { speed: 0.6, size: 0.06, up: 1, life: 0.6, spread: 0.3, grav: -1 });
      if (Math.hypot(p.x - c.x, p.y + 0.9 - c.y, p.z - c.z) < 1.4) {
        g.scene.remove(c.m);
        c.taken = true;
        this.prog.cubes.push(c.i);
        g.gainCoins(50);
        g.fx.burst(c.x, c.y, c.z, GOLD, 30, { speed: 4, size: 0.1, up: 3, life: 0.8, spread: 0.2 });
        g.sound.powerup();
        const n = this.prog.cubes.length;
        const all = this.info.cubes.length;
        g.hud.popup(`Golden cube ${n}/${all}! +50`, 'head');
        if (n >= all) {
          g.gainCoins(500);
          g.hud.showBanner('All golden cubes found!', '+500 coins from Kid Kevin', 4);
          g.sound.cleared();
        }
        g.progress.event('cube', { n });
        g.profile.scheduleSave();
      }
    }
    this.cubes = this.cubes.filter((c) => !c.taken);
  }

  // At night mobs come out.
  updateNight(dt) {
    const g = this.game;
    const sky = g.sky;
    const day = sky.active && sky.dayNight ? Math.min(1, Math.max(0, Math.sin(sky.t * Math.PI * 2) * 3 + 0.45)) : 1;
    this.nightK = 1 - day;
    if (this.glow) {
      this.glow.material.opacity = (1 - day) * 0.85;
      this.glow.visible = day < 0.98;
    }
    if (!sky.isNight() || this.active) return;
    this.nightT -= dt;
    if (this.nightT > 0) return;
    this.nightT = 6;
    const around = g.mobs.list.filter((m) => m.advTag === 'night' && m.state !== 'dying').length;
    if (around >= 6) return;
    const p = g.player.pos;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * 10;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (x < 8 || z < 8 || x > SX - 8 || z > SZ - 8) continue;
      const types = ['moss', 'bone', 'skitter', 'ghost', 'bat', 'imp'].filter((t) => MOB_TYPES[t]);
      if (this.spawnMob(types[Math.floor(Math.random() * types.length)], x, z)) break;
    }
  }

  // --- The minimap ---

  buildMap() {
    const g = this.game;
    const c = document.createElement('canvas');
    c.width = SX;
    c.height = SZ;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(SX, SZ);
    const w = g.world;
    const colors = g.atlas.colors;
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        let y = SY - 1;
        while (y > 0 && !w.solid(x, y, z)) y--;
        const id = w.get(x, y, z);
        const k = (z * SX + x) * 4;
        let col = id ? colors[BLOCKS[id].top][0] : null;
        let r = 40;
        let gg = 90;
        let b = 160;
        if (col && y >= 6) {
          const shade = 0.75 + Math.min(0.5, (y - 7) * 0.03);
          r = Math.min(255, col.r * 255 * shade);
          gg = Math.min(255, col.g * 255 * shade);
          b = Math.min(255, col.b * 255 * shade);
        }
        img.data[k] = r;
        img.data[k + 1] = gg;
        img.data[k + 2] = b;
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapBase = c;
  }

  drawMap() {
    const cv = $('#minimap');
    const ctx = cv.getContext('2d');
    const S = cv.width;
    // A window of the map round you.
    const VIEW = Math.min(SX, 110);
    const k = S / VIEW;
    const p = this.game.player;
    const ox = Math.max(0, Math.min(SX - VIEW, p.pos.x - VIEW / 2));
    const oz = Math.max(0, Math.min(SZ - VIEW, p.pos.z - VIEW / 2));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapBase, ox, oz, VIEW, VIEW, 0, 0, S, S);
    const X = (x) => (x - ox) * k;
    const Z = (z) => (z - oz) * k;
    const inside = (x, z) => x >= ox && z >= oz && x <= ox + VIEW && z <= oz + VIEW;
    const dot = (x, z, r, color) => {
      if (!inside(x, z)) return;
      ctx.fillStyle = color;
      ctx.fillRect(X(x) - r, Z(z) - r, r * 2, r * 2);
    };
    const blink = Math.floor(performance.now() / 250) % 2;
    // Where the police think you are.
    const pol = this.police;
    if (pol.stars > 0 && !pol.seen) {
      ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
      ctx.beginPath();
      ctx.arc(X(pol.lastKnown.x), Z(pol.lastKnown.z), 14 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of this.cars) {
      if (c.dead) continue;
      const cop = c.driver === 'cop';
      dot(c.pos.x, c.pos.z, cop ? 2.6 : 1.8, cop ? (blink ? '#ff3a3a' : '#3a7aff') : c.mine ? '#f2c230' : '#cfd4da');
    }
    for (const o of pol.officers()) dot(o.pos.x, o.pos.z, 1.8, '#3a7aff');
    if (pol.heli && !pol.heli.dead) dot(pol.heli.pos.x, pol.heli.pos.z, 3.5, blink ? '#3a7aff' : '#ffffff');
    if (!this.active) for (const [id, person] of Object.entries(this.givers)) if (this.showMark(person)) dot(person.pos.x, person.pos.z, 3.5, id === 'cubes' ? '#ffd84a' : '#ffd23f');
    for (const c of this.cubes) if (this.prog.met.cubes) dot(c.x, c.z, 2, '#ffe14a');
    if (this.beaconAt) {
      const [bx, bz] = this.beaconAt;
      if (inside(bx, bz)) {
        const pulse = 3.5 + Math.sin(performance.now() / 150) * 1.2;
        dot(bx, bz, pulse, '#ff4a3a');
      } else {
        // Off the map: an arrow on the edge pointing at it.
        const a = Math.atan2(Z(bz) - S / 2, X(bx) - S / 2);
        const r = S / 2 - 8;
        ctx.save();
        ctx.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
        ctx.rotate(a);
        ctx.fillStyle = blink ? '#ff4a3a' : '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    // You: an arrow pointing where you face.
    const yaw = p.driving ? p.driving.yaw + Math.PI : p.yaw;
    const px = X(p.pos.x);
    const pz = Z(p.pos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-yaw + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Do two cars overlap? Returns the push direction (from a to b) and how
// deep, using the separating axis test on their rectangles.
function carOverlap(a, b) {
  const dx = b.pos.x - a.pos.x;
  const dz = b.pos.z - a.pos.z;
  if (dx * dx + dz * dz > (a.def.len + b.def.len) ** 2 / 4 + 4) return null;
  if (Math.abs(a.pos.y - b.pos.y) > 2) return null;
  const fa = [Math.sin(a.yaw), Math.cos(a.yaw)];
  const fb = [Math.sin(b.yaw), Math.cos(b.yaw)];
  const axes = [fa, [fa[1], -fa[0]], fb, [fb[1], -fb[0]]];
  let best = null;
  for (const [ux, uz] of axes) {
    const ext = (f, d) => Math.abs(ux * f[0] + uz * f[1]) * d.len / 2 + Math.abs(ux * f[1] - uz * f[0]) * d.wid / 2;
    const dist = dx * ux + dz * uz;
    const over = ext(fa, a.def) + ext(fb, b.def) - Math.abs(dist);
    if (over <= 0) return null;
    if (!best || over < best[2]) best = dist >= 0 ? [ux, uz, over] : [-ux, -uz, over];
  }
  return best;
}

// Traffic light colours: [on, off] for red, yellow and green.
const LIGHTS = [
  ['#ff3a2a', '#3a1210'],
  ['#ffc83a', '#3a2e10'],
  ['#4aff6a', '#10361a'],
];
const PHASE = 13;

// Where traffic can go: junctions on the road grid. Big junctions have
// traffic lights, and traffic stops at red.
class Traffic {
  constructor(adv) {
    this.adv = adv;
    this.nodes = roadNodes();
    this.t = Math.random() * PHASE;
    this.ns = 'green';
    this.ew = 'red';
    this.buildLights();
  }

  buildLights() {
    const scene = this.adv.game.scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const dark = new THREE.MeshLambertMaterial({ color: '#2a2b2e' });
    // One set of lamp materials for each direction: [red, yellow, green].
    this.mats = { ns: LIGHTS.map((c) => new THREE.MeshBasicMaterial({ color: c[1] })), ew: LIGHTS.map((c) => new THREE.MeshBasicMaterial({ color: c[1] })) };
    const head = new THREE.BoxGeometry(0.5, 1.3, 0.5);
    const lampX = new THREE.BoxGeometry(0.05, 0.32, 0.32);
    const lampZ = new THREE.BoxGeometry(0.32, 0.32, 0.05);
    const pole = new THREE.BoxGeometry(0.22, 6.4, 0.22);
    const arm = new THREE.BoxGeometry(0.14, 0.14, 1);
    this.geos = [head, lampX, lampZ, pole, arm];
    this.dark = dark;
    const y = GY + 6.6;
    for (const n of this.nodes) {
      if (n.next.length < 3) continue;
      const g = new THREE.Group();
      g.position.set(n.x, 0, n.z);
      const h = new THREE.Mesh(head, dark);
      h.position.y = y;
      g.add(h);
      for (const [k, i] of [[0.42, 0], [0, 1], [-0.42, 2]]) {
        for (const sgn of [-1, 1]) {
          const a = new THREE.Mesh(lampX, this.mats.ew[i]);
          a.position.set(sgn * 0.27, y + k, 0);
          g.add(a);
          const b = new THREE.Mesh(lampZ, this.mats.ns[i]);
          b.position.set(0, y + k, sgn * 0.27);
          g.add(b);
        }
      }
      // A pole on the corner and an arm out over the junction.
      const px = 5;
      const p = new THREE.Mesh(pole, dark);
      p.position.set(px, GY + 1 + 3.2, px);
      g.add(p);
      const len = Math.hypot(px, px);
      const r = new THREE.Mesh(arm, dark);
      r.scale.z = len;
      r.position.set(px / 2, y + 0.75, px / 2);
      r.rotation.y = Math.PI / 4;
      g.add(r);
      this.group.add(g);
    }
  }

  dispose() {
    this.adv.game.scene.remove(this.group);
    for (const gg of this.geos) gg.dispose();
    this.dark.dispose();
    for (const m of [...this.mats.ns, ...this.mats.ew]) m.dispose();
  }

  // Green for one road, then yellow, then both red for a moment.
  update(dt) {
    this.t = (this.t + dt) % PHASE;
    const t = this.t;
    const half = PHASE / 2;
    const state = (u) => (u < half - 1.6 ? 'green' : u < half - 0.5 ? 'yellow' : 'red');
    this.ns = state(t);
    this.ew = state((t + half) % PHASE);
    for (const [dir, st] of [['ns', this.ns], ['ew', this.ew]]) {
      const on = st === 'red' ? 0 : st === 'yellow' ? 1 : 2;
      this.mats[dir].forEach((m, i) => m.color.set(LIGHTS[i][i === on ? 0 : 1]));
    }
  }

  // The light a car heading (dx, dz) into junction `node` sees.
  lightFor(node, dx, dz) {
    if (node.next.length < 3) return 'green';
    return dz !== 0 ? this.ns : this.ew;
  }

  next(b, a) {
    const opts = b.next.filter((n) => n !== a);
    const list = opts.length ? opts : b.next;
    return list[Math.floor(Math.random() * list.length)];
  }

  // A route for a car that has none: the road it's closest to.
  pickRoute(car) {
    let best = null;
    let bd = Infinity;
    const f = car.forward(V());
    for (const a of this.nodes) {
      for (const b of a.next) {
        const dx = Math.sign(b.x - a.x);
        const dz = Math.sign(b.z - a.z);
        if (dx * f.x + dz * f.z < 0.3) continue;
        const ax = car.pos.x - a.x;
        const az = car.pos.z - a.z;
        const len = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
        const t = Math.max(0, Math.min(len, ax * dx + az * dz));
        const d = Math.hypot(a.x + dx * t - car.pos.x, a.z + dz * t - car.pos.z);
        if (d < bd) {
          bd = d;
          best = { a, b };
        }
      }
    }
    return best || { a: this.nodes[0], b: this.nodes[0].next[0] };
  }

  randomSpot() {
    const a = this.nodes[Math.floor(Math.random() * this.nodes.length)];
    const b = a.next[Math.floor(Math.random() * a.next.length)];
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    const t = 8 + Math.random() * 16;
    return { x: a.x + dx * t - dz * LANE, z: a.z + dz * t + dx * LANE, yaw: Math.atan2(dx, dz), route: { a, b } };
  }

  // Move a stuck car somewhere out of sight.
  respawn(car) {
    const p = this.adv.game.player.pos;
    for (let k = 0; k < 10; k++) {
      const r = this.randomSpot();
      if (Math.hypot(r.x - p.x, r.z - p.z) < 25) continue;
      car.pos.set(r.x, this.adv.groundAt(r.x, r.z, GY + 2), r.z);
      car.yaw = r.yaw;
      car.ai = r.route;
      car.speed = 0;
      car.stuckT = 0;
      return;
    }
  }
}

export { CAR_TYPES, CITY_SIZE };
