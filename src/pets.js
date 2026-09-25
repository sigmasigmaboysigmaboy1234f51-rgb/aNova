import * as THREE from 'three';
import { PX } from './model.js';

// Little buddies that follow you around. Each one has a job: shooting,
// biting, punching, breathing fire, pulling in coins or healing you.
// Your own pet does its job; everyone else's pets just tag along.

const mats = new Map();
function mat(color, glow = false) {
  const key = `${color}|${glow}`;
  if (!mats.has(key)) mats.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
  return mats.get(key);
}
const geos = new Map();
function geo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!geos.has(key)) geos.set(key, new THREE.BoxGeometry(w * PX, h * PX, d * PX));
  return geos.get(key);
}
function maker(group) {
  return (w, h, d, x, y, z, color, glow = false) => {
    const m = new THREE.Mesh(geo(w, h, d), mat(color, glow));
    m.position.set(x * PX, y * PX, z * PX);
    group.add(m);
    return m;
  };
}
function sub(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x * PX, y * PX, z * PX);
  parent.add(g);
  return g;
}

export const PETS = {
  pip: {
    name: 'Mini Pip',
    price: 500,
    rarity: 'rare',
    desc: 'A tiny robot drone. Zaps mobs near you.',
    fly: true,
    build(root) {
      const add = maker(root);
      add(6, 5, 6, 0, 0, 0, 0xd8dde3);
      add(6.2, 1, 6.2, 0, 2, 0, 0x39b8ff);
      add(4, 2, 0.6, 0, 0.2, 3.2, 0x1d2430);
      add(1, 1, 0.4, -1, 0.3, 3.5, 0x6ff0ff, true);
      add(1, 1, 0.4, 1, 0.3, 3.5, 0x6ff0ff, true);
      add(0.6, 2.4, 0.6, 0, 3.6, 0, 0x8f8f93);
      add(1.2, 1.2, 1.2, 0, 5.2, 0, 0xff3b3b, true);
      const prop = sub(root, 0, -3, 0);
      maker(prop)(7, 0.4, 1, 0, 0, 0, 0x5a6270);
      return { spin: prop };
    },
  },
  cat: {
    name: 'Coin Cat',
    price: 400,
    rarity: 'rare',
    desc: 'Pulls coins to you from much further away. Lucky, too: +10% coins.',
    build(root) {
      const add = maker(root);
      add(4, 4, 8, 0, 3, 0, 0xf2c230);
      add(5, 5, 5, 0, 5.5, 5, 0xf2c230);
      for (const x of [-1.6, 1.6]) {
        add(1.4, 1.6, 1, x, 8.6, 5, 0xf2c230);
        add(0.8, 0.8, 0.4, x, 6.2, 7.6, 0x1d1d1d);
      }
      add(1, 0.6, 0.4, 0, 5, 7.6, 0xff9dc0);
      for (const [x, z] of [
        [-1.3, 2.6],
        [1.3, 2.6],
        [-1.3, -2.6],
        [1.3, -2.6],
      ])
        add(1.4, 2, 1.4, x, 1, z, 0xe0a820);
      const tail = sub(root, 0, 4, -4);
      maker(tail)(1, 1, 5, 0, 1, -2.4, 0xe0a820);
      add(2.4, 2.4, 0.4, 0, 3.2, 4.2, 0xfff2a8, true);
      return { tail };
    },
  },
  slime: {
    name: 'Heal Slime',
    price: 600,
    rarity: 'epic',
    desc: 'A friendly blob that slowly heals you when you are hurt.',
    build(root) {
      const body = sub(root, 0, 0, 0);
      const b = maker(body);
      b(7, 6, 7, 0, 3, 0, 0x6fd35a);
      b(5, 4, 5, 0, 3, 0, 0x3f8a2c);
      b(1.2, 1.4, 0.4, -1.4, 4, 3.6, 0x1d1d1d);
      b(1.2, 1.4, 0.4, 1.4, 4, 3.6, 0x1d1d1d);
      b(2, 0.6, 0.4, 0, 2.3, 3.6, 0x2a5a1c);
      b(1.4, 0.4, 1.4, 0, 6.2, 0, 0xff5a7a, true);
      b(0.4, 1.4, 1.4, 0, 6.2, 0, 0xff5a7a, true);
      return { squish: body };
    },
  },
  bat: {
    name: 'Bat Buddy',
    price: 550,
    rarity: 'rare',
    desc: 'Flies at nearby mobs and bites them.',
    fly: true,
    build(root) {
      const add = maker(root);
      add(4, 4, 4, 0, 0, 0, 0x3a2e44);
      add(1, 1, 0.4, -0.9, 0.6, 2.1, 0xff3b3b, true);
      add(1, 1, 0.4, 0.9, 0.6, 2.1, 0xff3b3b, true);
      for (const x of [-1.2, 1.2]) add(1, 1.6, 0.6, x, 2.6, 0, 0x3a2e44);
      const wl = sub(root, -2, 0.5, 0);
      maker(wl)(6, 0.6, 3.6, -3, 0, 0, 0x251c2e);
      const wr = sub(root, 2, 0.5, 0);
      maker(wr)(6, 0.6, 3.6, 3, 0, 0, 0x251c2e);
      return { wings: [wl, wr] };
    },
  },
  golem: {
    name: 'Mini Golem',
    price: 750,
    rarity: 'epic',
    desc: 'A pocket-sized rock guardian. Punches mobs that get close.',
    build(root) {
      const add = maker(root);
      add(7, 6, 5, 0, 7, 0, 0x8f8f93);
      add(5, 4, 4.6, 0, 11.6, 0.4, 0x9d9d9f);
      add(1.2, 0.8, 0.4, -1.2, 12, 2.8, 0xffb040, true);
      add(1.2, 0.8, 0.4, 1.2, 12, 2.8, 0xffb040, true);
      add(1.4, 1.4, 1, 0, 10.8, 3, 0x7c7c80);
      add(7.4, 1, 5.4, 0, 8, 0, 0x4d8a2c);
      const arms = [];
      for (const x of [-4.8, 4.8]) {
        const a = sub(root, x, 9.5, 0);
        maker(a)(2.6, 8, 2.6, 0, -3.6, 0, 0x8f8f93);
        arms.push(a);
      }
      for (const x of [-1.8, 1.8]) add(2.4, 4, 2.6, x, 2, 0, 0x7c7c80);
      return { arms };
    },
  },
  dragon: {
    name: 'Baby Dragon',
    price: 1000,
    rarity: 'legendary',
    desc: 'Breathes fire on mobs and sets them burning.',
    fly: true,
    build(root) {
      const add = maker(root);
      add(4, 4, 7, 0, 0, 0, 0xd8392b);
      add(3, 1.4, 6, 0, -1.8, 0.2, 0xffb040);
      add(4, 3.6, 4, 0, 1.6, 4.6, 0xd8392b);
      add(3, 1.6, 2.4, 0, 0.8, 7.2, 0xc02a20);
      add(0.8, 0.8, 0.4, -1.1, 2.4, 6.7, 0xffd84a, true);
      add(0.8, 0.8, 0.4, 1.1, 2.4, 6.7, 0xffd84a, true);
      for (const x of [-1.2, 1.2]) add(0.8, 2, 0.8, x, 4.2, 3.6, 0xf4f1ea);
      add(1.6, 1.6, 5, 0, 0.3, -5.4, 0xd8392b);
      add(1, 1, 3, 0, 0.8, -8.8, 0xc02a20);
      const wl = sub(root, -2, 1.6, 0);
      maker(wl)(6, 0.5, 4.4, -3, 0, 0, 0xffb040);
      const wr = sub(root, 2, 1.6, 0);
      maker(wr)(6, 0.5, 4.4, 3, 0, 0, 0xffb040);
      return { wings: [wl, wr] };
    },
  },
};

export const PET_ORDER = ['cat', 'pip', 'bat', 'slime', 'golem', 'dragon'];

// Just the model, for thumbnails.
export function petObject(id) {
  const root = new THREE.Group();
  PETS[id].build(root);
  return root;
}

const FIRE = [new THREE.Color('#ffd84a'), new THREE.Color('#ff7a2f'), new THREE.Color('#d8392b')];
const HEAL = [new THREE.Color('#6fd35a'), new THREE.Color('#ff9dc0'), new THREE.Color('#ffffff')];
const ZAP = 0x6ff0ff;
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();

export class Pet {
  // owner is anything with pos and yaw: you, another player or a bot.
  constructor(game, id, owner, local) {
    this.game = game;
    this.id = id;
    this.def = PETS[id];
    this.owner = owner;
    this.local = local;
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.parts = this.def.build(this.model);
    this.root.scale.setScalar(id === 'golem' ? 0.8 : 1);
    this.pos = new THREE.Vector3().copy(owner.pos);
    this.pos.y += 1;
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.t = Math.random() * 10;
    this.cd = 1;
    this.target = null;
    this.act = 0;
    this.root.position.copy(this.pos);
    game.scene.add(this.root);
  }

  dispose() {
    this.game.scene.remove(this.root);
  }

  // Where the pet wants to be: a step ahead on your left, where you can
  // see it without it blocking your gun.
  home() {
    const o = this.owner;
    const side = this.def.fly ? -1.1 : -1.3;
    const yaw = o.yaw || 0;
    const back = this.def.fly ? -0.3 : -0.8;
    // Your camera looks down -z when yaw is 0.
    const x = o.pos.x + Math.sin(yaw) * back + Math.cos(yaw) * side;
    const z = o.pos.z + Math.cos(yaw) * back - Math.sin(yaw) * side;
    return tmp.set(x, o.pos.y, z);
  }

  groundY(x, z, near) {
    const w = this.game.world;
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    // Look for ground a little above and below the owner's feet.
    for (let y = Math.floor(near) + 2; y > Math.floor(near) - 5; y--) if (w.solid(fx, y, fz) && !w.solid(fx, y + 1, fz)) return y + 1;
    return near;
  }

  nearestMob(range) {
    const g = this.game;
    let best = null;
    let bd = range * range;
    for (const m of g.mobs.list) {
      if (m.state !== 'live' || m.gone) continue;
      const d = m.pos.distanceToSquared(this.owner.pos);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  clearShot(from, m) {
    const tx = m.pos.x - from.x;
    const ty = m.pos.y + (m.h || 1.4) * 0.6 - from.y;
    const tz = m.pos.z - from.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    return !this.game.world.raycast(from.x, from.y, from.z, tx / len, ty / len, tz / len, len);
  }

  hit(m, dmg, fx) {
    const g = this.game;
    dir.set(m.pos.x - this.pos.x, 0, m.pos.z - this.pos.z).normalize();
    const at = new THREE.Vector3(m.pos.x, m.pos.y + (m.h || 1.4) * 0.6, m.pos.z);
    m.damage(dmg, dir, false, at, g.myId, fx);
  }

  update(dt) {
    const g = this.game;
    const o = this.owner;
    this.t += dt;
    this.cd -= dt;
    this.act = Math.max(0, this.act - dt * 3);
    const hunting = this.local && g.inGame && !g.duel && !o.dead;
    let goal = this.home();
    const fly = this.def.fly;
    let gy = fly ? o.pos.y + 1.7 + Math.sin(this.t * 2.2) * 0.15 : this.groundY(goal.x, goal.z, o.pos.y);

    if (hunting) this.work(dt);
    // Bats and golems go to their target; everyone else stays close.
    if (this.target && (this.id === 'bat' || this.id === 'golem')) {
      const m = this.target;
      goal = tmp.set(m.pos.x, m.pos.y, m.pos.z);
      if (fly) gy = m.pos.y + (m.h || 1.4) * 0.7;
      else gy = this.groundY(goal.x, goal.z, m.pos.y);
    }
    const dx = goal.x - this.pos.x;
    const dz = goal.z - this.pos.z;
    const far = Math.hypot(dx, dz);
    if (far > 14 || Math.abs(gy - this.pos.y) > 6) {
      // Lost you: pop back next to you.
      this.pos.set(goal.x, gy, goal.z);
      g.fx.burst(this.pos.x, this.pos.y + 0.3, this.pos.z, HEAL, 6, { speed: 1.5, size: 0.06, up: 1, life: 0.4, spread: 0.2 });
    } else {
      const speed = Math.min(1, dt * (this.target ? 5 : 3.5));
      this.pos.x += dx * speed;
      this.pos.z += dz * speed;
      this.pos.y += (gy - this.pos.y) * Math.min(1, dt * (fly ? 4 : 10));
    }
    // Face where it is going, or its target.
    let face = this.yaw;
    if (this.target) face = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z);
    else if (far > 0.3) face = Math.atan2(dx, dz);
    else face = (o.yaw || 0) + Math.PI;
    let d = face - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 8);
    this.animate(dt, far);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.visible = !(o.dead && o.deadT > 2.5) && o.visible !== false;
  }

  animate(dt, moving) {
    const P = this.parts;
    const walk = Math.min(1, moving * 2);
    if (P.spin) P.spin.rotation.y += dt * 30;
    if (P.wings) {
      const f = Math.sin(this.t * (this.id === 'bat' ? 22 : 12)) * 0.7;
      P.wings[0].rotation.z = f;
      P.wings[1].rotation.z = -f;
    }
    if (P.tail) P.tail.rotation.x = 0.5 + Math.sin(this.t * 3) * 0.3;
    if (P.squish) {
      const s = Math.abs(Math.sin(this.t * (3 + walk * 5)));
      P.squish.scale.set(1 + (1 - s) * 0.12, 0.85 + s * 0.3, 1 + (1 - s) * 0.12);
      P.squish.position.y = s * walk * 0.18;
    }
    if (P.arms) {
      P.arms[0].rotation.x = Math.sin(this.t * 8) * 0.5 * walk - this.act * 1.6;
      P.arms[1].rotation.x = -Math.sin(this.t * 8) * 0.5 * walk - this.act * 1.6;
    }
    if (!this.def.fly && !P.squish) this.model.position.y = Math.abs(Math.sin(this.t * 10)) * 0.05 * walk;
  }

  // The pet's job, only for your own pet.
  work(dt) {
    const g = this.game;
    const p = this.owner;
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + 0.2, this.pos.z);
    if (this.target && (this.target.state !== 'live' || this.target.gone || this.target.pos.distanceTo(p.pos) > 16)) this.target = null;
    switch (this.id) {
      case 'pip': {
        if (this.cd > 0) return;
        const m = this.nearestMob(15);
        if (!m || !this.clearShot(eye, m)) {
          this.cd = 0.2;
          return;
        }
        this.target = m;
        this.cd = 0.9;
        const to = new THREE.Vector3(m.pos.x, m.pos.y + (m.h || 1.4) * 0.6, m.pos.z);
        g.tracers.fire(eye, to, ZAP, 0.03);
        this.hit(m, 6, null);
        g.sound.gunshot('pistol', true, 0.25);
        break;
      }
      case 'bat': {
        if (!this.target) this.target = this.nearestMob(11);
        const m = this.target;
        if (!m) return;
        const d = Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z);
        if (d < 1.4 && this.cd <= 0) {
          this.cd = 0.7;
          this.act = 1;
          this.hit(m, 5, null);
          g.fx.burst(this.pos.x, this.pos.y, this.pos.z, FIRE.slice(2), 4, { speed: 2, size: 0.05, up: 1, life: 0.3, spread: 0.1 });
        }
        break;
      }
      case 'golem': {
        if (!this.target) this.target = this.nearestMob(7);
        const m = this.target;
        if (!m) return;
        const d = Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z);
        if (d < 1.6 && this.cd <= 0) {
          this.cd = 1.3;
          this.act = 1;
          this.hit(m, 14, null);
          g.sound.clank(0.5);
        }
        break;
      }
      case 'dragon': {
        const m = this.nearestMob(9);
        this.target = m;
        if (!m || this.cd > 0 || !this.clearShot(eye, m)) return;
        this.cd = 1.2;
        this.act = 1;
        const to = new THREE.Vector3(m.pos.x, m.pos.y + (m.h || 1.4) * 0.6, m.pos.z);
        const dv = to.clone().sub(eye);
        const n = Math.ceil(dv.length() * 2);
        for (let i = 0; i < n; i++) {
          const k = i / n;
          g.fx.burst(eye.x + dv.x * k, eye.y + dv.y * k, eye.z + dv.z * k, FIRE, 2, { speed: 1, size: 0.1, up: 0.5, life: 0.35, spread: 0.1, grav: -2 });
        }
        this.hit(m, 4, { burn: 3 });
        g.sound.throw();
        break;
      }
      case 'slime': {
        if (this.cd > 0) return;
        this.cd = 4;
        if (p.hp < p.maxHp && p.poisonT <= 0) {
          p.heal(1);
          this.act = 1;
          g.fx.burst(p.pos.x, p.pos.y + 1, p.pos.z, HEAL, 8, { speed: 1.5, size: 0.07, up: 2, life: 0.6, spread: 0.3, grav: -3 });
        }
        break;
      }
      default:
        break;
    }
  }
}
