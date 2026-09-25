import * as THREE from 'three';
import { PX } from './model.js';

// Hats, capes and kill effects you can buy with coins. Everything is
// built from boxes in skin pixels and hangs off the character's head or
// body, so it moves with every animation.

const mats = new Map();
function mat(color, glow = false, alpha = 1) {
  const key = `${color}|${glow}|${alpha}`;
  if (!mats.has(key)) {
    const m = glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
    if (alpha < 1) {
      m.transparent = true;
      m.opacity = alpha;
      m.depthWrite = false;
    }
    mats.set(key, m);
  }
  return mats.get(key);
}
const geos = new Map();
function geo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!geos.has(key)) geos.set(key, new THREE.BoxGeometry(w * PX, h * PX, d * PX));
  return geos.get(key);
}

// add(w, h, d, x, y, z, color, opts) puts a box on the head. Head top is
// at y = 8, the face at z = 4.
function maker(group) {
  return (w, h, d, x, y, z, color, { glow = false, alpha = 1, rx = 0, rz = 0 } = {}) => {
    const m = new THREE.Mesh(geo(w, h, d), mat(color, glow, alpha));
    m.position.set(x * PX, y * PX, z * PX);
    m.rotation.set(rx, 0, rz);
    group.add(m);
    return m;
  };
}

export const HATS = {
  cap: {
    name: 'Red Cap',
    price: 150,
    rarity: 'common',
    build(add) {
      add(8.6, 2, 8.6, 0, 9, 0, 0xd8392b);
      add(8, 0.8, 4, 0, 8.3, 5.5, 0xa8281c);
      add(2, 1, 2, 0, 10.4, 0, 0xf4f1ea);
    },
  },
  party: {
    name: 'Party Hat',
    price: 150,
    rarity: 'common',
    build(add) {
      for (let i = 0; i < 5; i++) add(6 - i * 1.2, 1.6, 6 - i * 1.2, 0, 8.8 + i * 1.6, 0, i % 2 ? 0x39b8ff : 0xff5aa0);
      add(1.4, 1.4, 1.4, 0, 16.6, 0, 0xffd23f);
    },
  },
  cone: {
    name: 'Traffic Cone',
    price: 100,
    rarity: 'common',
    build(add) {
      add(9, 1, 9, 0, 8.5, 0, 0xff7a2f);
      for (let i = 0; i < 5; i++) add(7 - i * 1.3, 1.8, 7 - i * 1.3, 0, 9.9 + i * 1.8, 0, i === 2 ? 0xf4f1ea : 0xff7a2f);
    },
  },
  chef: {
    name: 'Chef Hat',
    price: 200,
    rarity: 'common',
    build(add) {
      add(8.4, 2, 8.4, 0, 9, 0, 0xf4f1ea);
      add(10, 4, 10, 0, 12, 0, 0xffffff);
    },
  },
  catears: {
    name: 'Cat Ears',
    price: 250,
    rarity: 'rare',
    build(add) {
      for (const x of [-3, 3]) {
        add(2.4, 2.4, 1.2, x, 9.2, 0, 0x2a2a2a);
        add(1.2, 1.2, 1.3, x, 9, 0.1, 0xff9dc0);
      }
    },
  },
  bunny: {
    name: 'Bunny Ears',
    price: 250,
    rarity: 'rare',
    build(add) {
      for (const x of [-2, 2]) {
        add(1.6, 6, 1, x, 11, 0, 0xf4f1ea, { rz: x * -0.06 });
        add(0.8, 4.5, 1.1, x, 11, 0.1, 0xff9dc0, { rz: x * -0.06 });
      }
    },
  },
  headphones: {
    name: 'Headphones',
    price: 350,
    rarity: 'rare',
    build(add) {
      add(9.4, 1, 2, 0, 8.6, 0, 0x2a2a2a);
      for (const x of [-4.8, 4.8]) {
        add(1.2, 3, 1, x, 7.5, 0, 0x2a2a2a);
        add(1.6, 3.5, 3.5, x, 5, 0, 0x39b8ff);
      }
    },
  },
  cowboy: {
    name: 'Cowboy Hat',
    price: 400,
    rarity: 'rare',
    build(add) {
      add(14, 0.8, 14, 0, 8.6, 0, 0x8a5a33);
      add(8.4, 3.4, 8.4, 0, 10.6, 0, 0x8a5a33);
      add(8.6, 0.8, 8.6, 0, 9.4, 0, 0x3a2418);
    },
  },
  propeller: {
    name: 'Propeller Beanie',
    price: 450,
    rarity: 'rare',
    build(add, g) {
      for (let i = 0; i < 4; i++) add(8.6, 1, 8.6, 0, 8.6 + i * 0.4, 0, [0xd8392b, 0xffd23f, 0x39b8ff, 0x4d8a2c][i]);
      add(0.8, 2, 0.8, 0, 10.8, 0, 0x8f8f93);
      const spin = new THREE.Group();
      spin.position.y = 12 * PX;
      g.add(spin);
      const a = maker(spin);
      a(9, 0.5, 1.4, 0, 0, 0, 0xd8392b);
      a(1.4, 0.5, 9, 0, 0, 0, 0x39b8ff);
      g.userData.spin = spin;
    },
  },
  tophat: {
    name: 'Top Hat',
    price: 300,
    rarity: 'rare',
    build(add) {
      add(11, 0.8, 11, 0, 8.5, 0, 0x141414);
      add(8, 7, 8, 0, 12.4, 0, 0x1d1d1d);
      add(8.2, 1.2, 8.2, 0, 9.6, 0, 0xd8392b);
    },
  },
  viking: {
    name: 'Viking Helmet',
    price: 500,
    rarity: 'epic',
    build(add) {
      add(9, 3, 9, 0, 9, 0, 0x8f8f93);
      add(9.2, 1, 9.2, 0, 7.6, 0, 0x6c4a2c);
      for (const s of [-1, 1]) {
        add(2.4, 2, 2, s * 5.4, 9.8, 0, 0xe8e2cc);
        add(1.8, 3, 1.6, s * 6.4, 12, 0, 0xe8e2cc, { rz: -s * 0.4 });
      }
    },
  },
  wizard: {
    name: 'Wizard Hat',
    price: 600,
    rarity: 'epic',
    build(add) {
      add(12, 0.8, 12, 0, 8.5, 0, 0x44248a);
      for (let i = 0; i < 6; i++) add(8 - i * 1.3, 1.8, 8 - i * 1.3, i * 0.3, 9.8 + i * 1.8, -i * 0.2, 0x5a34a8);
      add(1.2, 1.2, 1.4, 2.5, 11, 3.6, 0xffd84a, { glow: true });
      add(1, 1, 1.4, -2, 13, 3.1, 0xffd84a, { glow: true });
    },
  },
  pumpkin: {
    name: 'Pumpkin Head',
    price: 700,
    rarity: 'epic',
    build(add) {
      add(10, 9.4, 10, 0, 4.3, 0, 0xe8801a);
      add(1.6, 2, 1.6, 0, 9.8, 0, 0x4d6a2c);
      add(2, 2, 0.6, -2.2, 5.5, 5.1, 0xffd84a, { glow: true });
      add(2, 2, 0.6, 2.2, 5.5, 5.1, 0xffd84a, { glow: true });
      add(5, 1.2, 0.6, 0, 2.2, 5.1, 0xffd84a, { glow: true });
    },
  },
  halo: {
    name: 'Halo',
    price: 800,
    rarity: 'epic',
    build(add, g) {
      const ring = new THREE.Group();
      ring.position.y = 11 * PX;
      g.add(ring);
      const a = maker(ring);
      for (let i = 0; i < 12; i++) {
        const t = (i / 12) * Math.PI * 2;
        a(1.6, 0.8, 1.6, Math.cos(t) * 4.2, 0, Math.sin(t) * 4.2, 0xfff2a8, { glow: true });
      }
      g.userData.halo = ring;
    },
  },
  astronaut: {
    name: 'Space Helmet',
    price: 900,
    rarity: 'epic',
    build(add) {
      add(11, 11, 11, 0, 4, 0, 0xbfe8ff, { alpha: 0.35 });
      add(11.4, 2, 11.4, 0, -1.6, 0, 0xf4f1ea);
      add(1, 3, 1, 3, 10.5, -2, 0x8f8f93);
      add(1.2, 1.2, 1.2, 3, 12.4, -2, 0xff3b3b, { glow: true });
    },
  },
  crown: {
    name: 'Royal Crown',
    price: 1200,
    rarity: 'legendary',
    build(add) {
      add(9.6, 2, 9.6, 0, 9, 0, 0xf2c230);
      for (const [x, z] of [
        [-4, -4],
        [0, -4],
        [4, -4],
        [-4, 0],
        [4, 0],
        [-4, 4],
        [0, 4],
        [4, 4],
      ])
        add(1.6, 2.6, 1.6, x, 11, z, 0xf7d04a);
      add(1.4, 1.4, 0.6, 0, 9, 5, 0xd8392b, { glow: true });
      add(1.2, 1.2, 0.6, -3, 9, 5, 0x39b8ff, { glow: true });
      add(1.2, 1.2, 0.6, 3, 9, 5, 0x6fd35a, { glow: true });
    },
  },
};

export const CAPES = {
  red: { name: 'Hero Cape', price: 300, rarity: 'common', colors: [0xd8392b, 0xa8281c] },
  ninja: { name: 'Shadow Cape', price: 450, rarity: 'rare', colors: [0x1d1d22, 0x2e2e36] },
  dragon: { name: 'Dragon Cape', price: 700, rarity: 'epic', colors: [0x3f8a2c, 0x2a6a1c], scales: true },
  royal: { name: 'Royal Cape', price: 900, rarity: 'epic', colors: [0x6b3aa8, 0x5a2e92], trim: 0xf2c230 },
  rainbow: { name: 'Rainbow Cape', price: 1100, rarity: 'legendary', rainbow: true },
  galaxy: { name: 'Galaxy Cape', price: 1400, rarity: 'legendary', colors: [0x141a3a, 0x1d2450], stars: true },
};

// Particle bursts when you beat a mob.
export const KILL_FX = {
  confetti: { name: 'Confetti', price: 200, rarity: 'common', colors: ['#ff5aa0', '#39b8ff', '#ffd23f', '#6fd35a', '#b46cff'] },
  hearts: { name: 'Love Hearts', price: 300, rarity: 'rare', colors: ['#ff5a7a', '#ff9dc0', '#d8392b'] },
  sparkle: { name: 'Gold Sparkle', price: 450, rarity: 'epic', colors: ['#fff6c8', '#ffd84a', '#f2c230'] },
  void: { name: 'Void Pop', price: 600, rarity: 'legendary', colors: ['#141018', '#6b3aa8', '#d27bff'] },
};

const RAINBOW = [0xd8392b, 0xff7a2f, 0xffd23f, 0x4d8a2c, 0x39b8ff, 0x6b3aa8];

function buildCape(def) {
  const pivot = new THREE.Group();
  const cols = 8;
  const rows = 7;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i += 2) {
      let c = def.colors ? def.colors[(i / 2 + j) % 2] : 0xd8392b;
      if (def.rainbow) c = RAINBOW[j % RAINBOW.length];
      if (def.trim && (j === rows - 1 || i === 0 || i === cols - 2)) c = def.trim;
      const m = new THREE.Mesh(geo(2, 2, 0.6), mat(c));
      m.position.set((i - cols / 2 + 1) * PX, -(j * 2 + 1) * PX, 0);
      pivot.add(m);
      if (def.stars && (i * 7 + j * 3) % 5 === 0) {
        const s = new THREE.Mesh(geo(0.8, 0.8, 0.7), mat(0xffffff, true));
        s.position.set(m.position.x + 0.3 * PX, m.position.y, 0.05 * PX);
        pivot.add(s);
      }
      if (def.scales && j % 2 === 0) {
        const s = new THREE.Mesh(geo(2, 0.6, 0.8), mat(0x6fd35a));
        s.position.set(m.position.x, m.position.y - 0.8 * PX, -0.1 * PX);
        pivot.add(s);
      }
    }
  }
  return pivot;
}

// Put a style ({ hat, cape }) on a character model. Returns what needs
// animating each frame.
export function attachCosmetics(model, style) {
  const out = { parts: [], cape: null, spin: null, halo: null };
  if (!style) return out;
  const P = model.parts;
  if (style.hat && HATS[style.hat] && P.head) {
    const g = new THREE.Group();
    HATS[style.hat].build(maker(g), g);
    P.head.add(g);
    out.parts.push(g);
    out.spin = g.userData.spin || null;
    out.halo = g.userData.halo || null;
  }
  if (style.cape && CAPES[style.cape] && P.body) {
    const cape = buildCape(CAPES[style.cape]);
    // Hangs from the shoulders at the back of the body.
    cape.position.set(0, 6 * PX, -2.4 * PX);
    P.body.add(cape);
    out.parts.push(cape);
    out.cape = cape;
  }
  return out;
}

// Capes flap more the faster you move; propellers spin; halos bob.
export function animateCosmetics(h, t, speed, dt) {
  if (!h) return;
  if (h.cape) {
    const target = 0.12 + Math.min(1, speed / 6) * 0.9 + Math.sin(t * (4 + speed)) * 0.05;
    h.cape.rotation.x += (target - h.cape.rotation.x) * Math.min(1, dt * 8);
  }
  if (h.spin) h.spin.rotation.y += dt * (6 + speed * 3);
  if (h.halo) {
    h.halo.position.y = (11 + Math.sin(t * 2.5) * 0.6) * PX;
    h.halo.rotation.y += dt * 0.8;
  }
}

export function removeCosmetics(h) {
  if (!h) return;
  for (const p of h.parts) if (p.parent) p.parent.remove(p);
}

// A thumbnail stand-in: the item on its own.
export function cosmeticObject(kind, id) {
  const g = new THREE.Group();
  if (kind === 'hat') HATS[id].build(maker(g), g);
  else if (kind === 'cape') {
    const c = buildCape(CAPES[id]);
    c.rotation.y = Math.PI;
    g.add(c);
  }
  return g;
}

// Read a style code ("hat,cape,pet,fx") from another player. Anything
// unknown is dropped.
export function parseStyle(code, pets) {
  const [hat, cape, pet, fx] = String(code || '').split(',');
  return {
    hat: HATS[hat] ? hat : null,
    cape: CAPES[cape] ? cape : null,
    pet: pets && pets[pet] ? pet : null,
    fx: KILL_FX[fx] ? fx : null,
  };
}

// Bots dress up too.
export function randomStyle(rand) {
  const pick = (obj, chance) => {
    const keys = Object.keys(obj);
    return rand() < chance ? keys[Math.floor(rand() * keys.length)] : null;
  };
  return { hat: pick(HATS, 0.8), cape: pick(CAPES, 0.5), pet: null, fx: null };
}

export const RARITY = {
  common: { name: 'Common', color: '#b9b2a0' },
  rare: { name: 'Rare', color: '#4fa8ff' },
  epic: { name: 'Epic', color: '#b46cff' },
  legendary: { name: 'Legendary', color: '#ffb52e' },
};

const fxColors = new Map();
const FX_STYLE = {
  confetti: { n: 30, speed: 5, up: 4, grav: 10, life: 1.3, size: 0.08 },
  hearts: { n: 16, speed: 1.6, up: 2.5, grav: -2.5, life: 1.3, size: 0.13 },
  sparkle: { n: 26, speed: 3.5, up: 2, grav: -1, life: 1, size: 0.07 },
  void: { n: 28, speed: 4, up: 1, grav: -4, life: 0.9, size: 0.11 },
};

// The burst when a mob is beaten by someone wearing a kill effect.
export function killBurst(fx, at, id) {
  const def = KILL_FX[id];
  if (!def) return;
  if (!fxColors.has(id)) fxColors.set(id, def.colors.map((c) => new THREE.Color(c)));
  const s = FX_STYLE[id];
  fx.burst(at.x, at.y + 0.9, at.z, fxColors.get(id), s.n, { speed: s.speed, size: s.size, up: s.up, life: s.life, spread: 0.3, grav: s.grav });
}
