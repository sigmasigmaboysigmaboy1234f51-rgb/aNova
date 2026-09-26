import * as THREE from 'three';
import { PX } from './model.js';
import { Vox, VOX_LIT, VOX_GLOW } from './vox.js';

// Little buddies that follow you around. Each one has a job: shooting,
// biting, punching, breathing fire, pulling in coins or healing you.
// Your own pet does its job; everyone else's pets just tag along.

// Each pet is made of coloured boxes baked into a few meshes (one per
// moving part). The shapes are built once per pet and shared.
const geos = new Map();
function geo(key, make) {
  if (!geos.has(key)) {
    const v = new Vox(PX);
    make(v);
    geos.set(key, v.empty ? null : v.geometry());
  }
  return geos.get(key);
}
function mesh(parent, key, make, material = VOX_LIT) {
  const g = geo(key, make);
  const m = g ? new THREE.Mesh(g, material) : new THREE.Group();
  parent.add(m);
  return m;
}
function sub(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x * PX, y * PX, z * PX);
  parent.add(g);
  return g;
}
const SHELL = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false });

// Cartoon eyes: white, a coloured iris, a pupil and a shine, on a face at z.
function eyes(v, x, y, z, w, h, iris, pupil = '#141018') {
  for (const s of [-1, 1]) {
    v.box(w, h, 0.3, s * x, y, z, '#ffffff', 0, 0, 0, 0);
    v.box(w * 0.72, h * 0.72, 0.3, s * x - s * w * 0.06, y - h * 0.1, z + 0.12, iris, 0, 0, 0, 0);
    v.box(w * 0.4, h * 0.46, 0.3, s * x - s * w * 0.06, y - h * 0.14, z + 0.2, pupil, 0, 0, 0, 0);
    v.box(w * 0.26, w * 0.26, 0.3, s * x + s * w * 0.12, y + h * 0.2, z + 0.28, '#ffffff', 0, 0, 0, 0);
  }
}

// A wing: an inner half from the shoulder and an outer half that folds.
function wing(root, key, s, at, inner, outer) {
  const w = sub(root, at[0] * s, at[1], at[2]);
  mesh(w, `${key}:in${s}`, (v) => inner(v, s));
  const tip = sub(w, at[3] * s, 0, 0);
  mesh(tip, `${key}:out${s}`, (v) => outer(v, s));
  w.userData = { side: s, tip };
  return w;
}

export const PETS = {
  pip: {
    name: 'Mini Pip',
    price: 500,
    rarity: 'rare',
    desc: 'A tiny robot drone. Zaps mobs near you.',
    fly: true,
    build(root) {
      const white = '#e9eef3';
      const grey = '#9aa4b0';
      const blue = '#39b8ff';
      mesh(root, 'pip:body', (v) => {
        v.ellipsoid(0, 0, 0, 3.4, 3, 3.2, 0.75, (x, y) => (Math.abs(y) < 0.16 ? blue : y > 0 ? white : '#c3cbd4'));
        v.box(5.4, 3.8, 0.5, 0, 0.3, 2.95, '#7d8794');
        v.box(4.8, 3.2, 0.5, 0, 0.3, 3.15, '#141a24', 0, 0, 0, 0);
        for (const s of [-1, 1]) {
          v.box(1, 2.2, 2.2, s * 3.45, 0.2, 0, grey);
          v.box(0.5, 1.2, 1.2, s * 4, 0.2, 0, '#5a6270');
        }
        v.box(1.3, 0.7, 1.3, 0, 3.2, 0, '#5a6270');
        v.box(0.5, 1.2, 0.5, 0, 3.8, 0, '#3a4048');
        v.box(2.2, 0.8, 2.2, 0, -3.1, 0, '#3a4048');
        v.box(0.8, 0.8, 2.2, 0, -2.2, 2.2, grey);
        v.box(0.5, 2.6, 0.5, 1.9, 3.2, -1.4, grey, -0.3, 0, -0.35);
        for (const x of [-2.4, 2.4]) v.box(0.4, 0.4, 0.3, x, 1.6, 2.85, '#ffd23f', 0, 0, 0, 0);
      });
      const face = sub(root, 0, 0, 0);
      mesh(face, 'pip:eyes', (v) => {
        for (const s of [-1, 1]) {
          v.box(1.1, 1.5, 0.3, s * 1.2, 0.6, 3.45, '#6ff0ff', 0, 0, 0, 0);
          v.box(0.4, 0.4, 0.3, s * 1.2 + 0.3, 1.1, 3.5, '#ffffff', 0, 0, 0, 0);
        }
        v.box(1.8, 0.35, 0.3, 0, -0.7, 3.45, '#6ff0ff', 0, 0, 0, 0);
        v.box(0.35, 0.35, 0.3, -1.05, -0.45, 3.45, '#6ff0ff', 0, 0, 0, 0);
        v.box(0.35, 0.35, 0.3, 1.05, -0.45, 3.45, '#6ff0ff', 0, 0, 0, 0);
      }, VOX_GLOW);
      mesh(root, 'pip:glow', (v) => {
        v.box(1.6, 0.3, 1.6, 0, -3.55, 0, '#6ff0ff', 0, 0, 0, 0);
        v.box(0.5, 0.5, 0.3, 0, -2.2, 3.35, '#6ff0ff', 0, 0, 0, 0);
        for (const s of [-1, 1]) v.box(0.3, 0.8, 0.8, s * 4.3, 0.2, 0, '#6ff0ff', 0, 0, 0, 0);
      }, VOX_GLOW);
      const light = mesh(root, 'pip:light', (v) => v.box(1.1, 1.1, 1.1, 2.55, 4.4, -1.85, '#ff3b3b', 0, 0, 0, 0), VOX_GLOW);
      const prop = sub(root, 0, 4.5, 0);
      mesh(prop, 'pip:prop', (v) => {
        v.box(0.9, 0.5, 0.9, 0, 0, 0, '#3a4048');
        for (const r of [0, Math.PI / 2]) v.box(9, 0.25, 1.1, 0, 0.1, 0, '#5a6270', 0, r, 0.06);
        for (const [x, z] of [[4.3, 0], [-4.3, 0], [0, 4.3], [0, -4.3]]) v.box(0.9, 0.3, 1.2, x, 0.1, z, blue, 0, x ? 0 : Math.PI / 2, 0);
      });
      return { spin: prop, blink: face, light };
    },
  },
  cat: {
    name: 'Coin Cat',
    price: 400,
    rarity: 'rare',
    desc: 'Pulls coins to you from much further away. Lucky, too: +10% coins.',
    build(root) {
      const gold = '#f5b52e';
      const stripe = '#d9801c';
      const cream = '#fff1cf';
      const pink = '#ff9db8';
      mesh(root, 'cat:body', (v) => {
        v.ellipsoid(0, 5.2, -0.4, 2.7, 2.3, 4.2, 0.75, (x, y) => (y < -0.35 ? cream : gold));
        for (const z of [1.2, -0.6, -2.4]) v.box(4.2, 0.6, 0.9, 0, 7.35, z, stripe, 0, 0, 0, 0);
        for (const s of [-1, 1]) for (const z of [0.4, -1.6]) v.box(0.5, 1.4, 0.8, s * 2.55, 6.3, z, stripe, 0, 0, 0, 0);
        v.box(5.4, 1.1, 2.6, 0, 6.3, 3.5, '#d8392b');
        v.box(1.1, 1.1, 1.1, 0, 5.6, 4.9, '#ffd84a');
      });
      mesh(root, 'cat:coin', (v) => {
        v.box(2.2, 2.2, 0.45, 0, 4.4, 5.1, '#ffd84a', 0, 0, 0, 0);
        v.box(1.2, 1.2, 0.5, 0, 4.4, 5.15, '#e0a020', 0, 0, 0, 0);
      }, VOX_GLOW);
      const head = sub(root, 0, 8, 3.8);
      mesh(head, 'cat:head', (v) => {
        v.box(6.2, 5, 5, 0, 0, 0.4, gold);
        v.box(7, 2.4, 3.4, 0, -1.3, 0.8, gold);
        v.box(3.2, 1.8, 1.4, 0, -1.2, 3.1, cream);
        v.box(1.1, 0.7, 0.5, 0, -0.45, 3.85, pink, 0, 0, 0, 0);
        v.box(0.3, 0.7, 0.3, 0, -1.1, 3.85, '#6a3a2a', 0, 0, 0, 0);
        v.box(1.4, 0.3, 0.3, 0, -1.5, 3.85, '#6a3a2a', 0, 0, 0, 0);
        for (const s of [-1, 1]) {
          v.box(2, 1.6, 1.4, s * 2, 2.9, 0.2, gold);
          v.box(1.1, 1.1, 1, s * 2.2, 4, 0.1, gold);
          v.box(1.1, 1.3, 0.3, s * 1.95, 3, 0.95, pink, 0, 0, 0, 0);
          for (const [y, r] of [[-0.9, 0.12], [-1.5, -0.12]]) v.box(3.2, 0.22, 0.22, s * 4.2, y, 2.6, '#ffffff', 0, 0, s * r, 0);
        }
        for (const x of [-1, 0, 1]) v.box(0.5, 0.3, 1.6, x, 2.55, 1.4, stripe, 0, 0, 0, 0);
        v.box(2.4, 0.6, 1.6, 0, -2.5, 2.3, cream);
      });
      const blink = sub(head, 0, 0.5, 0);
      mesh(blink, 'cat:eyes', (v) => eyes(v, 1.45, 0, 2.95, 1.5, 1.8, '#46c45a'));
      const legs = [];
      for (const [x, z] of [[-1.5, 2.3], [1.5, 2.3], [-1.5, -2.9], [1.5, -2.9]]) {
        const leg = sub(root, x, 4, z);
        mesh(leg, 'cat:leg', (v) => {
          v.box(1.7, 3.6, 1.7, 0, -1.6, 0, gold);
          v.box(1.9, 1.1, 2.1, 0, -3.5, 0.15, cream);
        });
        legs.push(leg);
      }
      const tail = sub(root, 0, 6.2, -4.3);
      mesh(tail, 'cat:tail1', (v) => v.box(1.3, 1.3, 3, 0, 0, -1.4, gold));
      const t2 = sub(tail, 0, 0, -2.9);
      mesh(t2, 'cat:tail2', (v) => {
        v.box(1.15, 1.15, 2.6, 0, 0, -1.2, gold);
        v.box(1.25, 1.25, 0.7, 0, 0, -0.6, stripe);
      });
      const t3 = sub(t2, 0, 0, -2.5);
      mesh(t3, 'cat:tail3', (v) => {
        v.box(1, 1, 1.8, 0, 0, -0.8, gold);
        v.box(1.1, 1.1, 1, 0, 0, -1.6, cream);
      });
      return { head, blink, legs, tail: [tail, t2, t3] };
    },
  },
  slime: {
    name: 'Heal Slime',
    price: 600,
    rarity: 'epic',
    desc: 'A friendly blob that slowly heals you when you are hurt.',
    build(root) {
      const body = sub(root, 0, 0, 0);
      mesh(body, 'slime:core', (v) => {
        v.ellipsoid(0, 3, 0, 2.6, 2.1, 2.6, 0.75, (x, y) => (y > 0.3 ? '#4fb33a' : '#3a8a2a'));
        for (const [x, y, z, s] of [[1.6, 4.9, -1, 0.7], [-2.2, 2.2, 1.2, 0.5], [2.4, 1.8, 1.8, 0.45], [-1, 5.6, 1.4, 0.4]]) v.box(s, s, s, x, y, z, '#e6ffd8', 0, 0, 0, 0);
        eyes(v, 1.5, 3.9, 3.85, 1.5, 1.9, '#2a5a1c');
        for (const s of [-1, 1]) v.box(1.2, 0.55, 0.3, s * 2.55, 2.7, 3.55, '#ff8fb0', 0, 0, 0, 0);
        v.box(1.6, 0.4, 0.3, 0, 2.2, 3.95, '#1d3a12', 0, 0, 0, 0);
        for (const s of [-1, 1]) v.box(0.45, 0.45, 0.3, s * 0.95, 2.5, 3.95, '#1d3a12', 0, 0, 0, 0);
      });
      mesh(body, 'slime:shell', (v) => {
        v.ellipsoid(0, 3.5, 0, 4.1, 3.5, 4, 0.8, (x, y) => (y > 0.55 ? '#b4ff9a' : y < -0.6 ? '#4fb33a' : '#72e35a'), 0.2);
      }, SHELL);
      const heart = sub(root, 0, 9.2, 0);
      mesh(heart, 'slime:heart', (v) => {
        for (const s of [-1, 1]) v.box(1.5, 1.5, 0.8, s * 0.75, 0.55, 0, '#ff5a7a', 0, 0, 0, 0);
        v.box(2.9, 1.2, 0.8, 0, -0.2, 0, '#ff5a7a', 0, 0, 0, 0);
        v.box(1.7, 0.9, 0.8, 0, -1.05, 0, '#ff5a7a', 0, 0, 0, 0);
        v.box(0.7, 0.7, 0.8, 0, -1.7, 0, '#ff5a7a', 0, 0, 0, 0);
        v.box(0.5, 0.5, 0.9, -0.9, 0.8, 0, '#ffd0dc', 0, 0, 0, 0);
      }, VOX_GLOW);
      return { squish: body, heart };
    },
  },
  bat: {
    name: 'Bat Buddy',
    price: 550,
    rarity: 'rare',
    desc: 'Flies at nearby mobs and bites them.',
    fly: true,
    build(root) {
      const fur = '#4a3860';
      const dark = '#2a1f38';
      const light = '#7d6a94';
      const mem = '#3a2a4e';
      mesh(root, 'bat:body', (v) => {
        v.ellipsoid(0, 0, 0, 2.5, 2.6, 2.3, 0.7, (x, y) => (y > 0.5 ? light : fur));
        v.box(3, 3, 0.6, 0, -0.5, 2.05, light);
        for (const [x, y, z] of [[-1.8, 1.8, 1], [1.8, 1.8, 1], [-2.2, -0.2, 1.4], [2.2, -0.2, 1.4], [0, 2.5, 0.8]]) v.box(0.8, 0.8, 0.8, x, y, z, light);
        for (const s of [-1, 1]) {
          v.box(1.5, 3, 0.9, s * 1.35, 3.1, 0, fur, 0, 0, -s * 0.25);
          v.box(0.8, 2, 0.3, s * 1.3, 3, 0.45, '#ff9dc0', 0, 0, -s * 0.25, 0);
          v.box(0.7, 1.1, 0.7, s * 0.8, -2.8, 0, dark);
          v.box(0.3, 0.6, 0.3, s * 0.4, -0.55, 2.45, '#ffffff', 0, 0, 0, 0);
        }
        v.box(1, 0.7, 0.4, 0, 0.1, 2.45, '#ff9dc0', 0, 0, 0, 0);
        eyes(v, 1, 0.95, 2.3, 1.3, 1.45, '#ff4a3a');
      });
      const inner = (v, s) => {
        v.box(3.8, 0.55, 0.55, s * 1.9, 0.3, 0.9, fur);
        v.box(3.8, 0.3, 3.4, s * 1.9, 0, -0.6, mem);
        v.box(0.4, 0.4, 3, s * 2.6, 0.1, -0.7, fur, 0, s * 0.3, 0);
      };
      const outer = (v, s) => {
        v.box(3.6, 0.5, 0.5, s * 1.8, 0.3, 0.9, fur, 0, s * 0.15, 0);
        v.box(3.4, 0.28, 3, s * 1.7, 0, -0.5, mem);
        for (const [x, z] of [[0.8, -2.2], [2.2, -2.3], [3.3, -1.6]]) v.box(1.2, 0.26, 0.9, s * x, 0, z, mem);
        for (const a of [0.2, 0.7]) v.box(0.3, 0.3, 3.4, s * (1.4 + a * 1.5), 0.1, -0.5, dark, 0, s * a, 0);
        v.box(0.5, 0.8, 0.5, s * 3.6, 0.6, 1.1, '#f4f1ea');
      };
      const wings = [-1, 1].map((s) => wing(root, 'bat', s, [2.2, 0.8, 0, 3.8], inner, outer));
      return { wings };
    },
  },
  golem: {
    name: 'Mini Golem',
    price: 750,
    rarity: 'epic',
    desc: 'A pocket-sized rock guardian. Punches mobs that get close.',
    build(root) {
      const stone = '#8f8f93';
      const dark = '#6a6a70';
      const light = '#a9a9ae';
      const moss = '#4f8a2c';
      const moss2 = '#6fae3a';
      const legs = [];
      for (const s of [-1, 1]) {
        const leg = sub(root, s * 1.9, 4.4, 0);
        mesh(leg, 'golem:leg', (v) => {
          v.box(2.8, 3.2, 3, 0, -1.4, 0, dark);
          v.box(3.3, 1.3, 3.9, 0, -3.6, 0.35, stone);
          v.box(3.4, 0.5, 0.6, 0, -3.5, 2.3, light);
        });
        legs.push(leg);
      }
      mesh(root, 'golem:body', (v) => {
        v.ellipsoid(0, 8, 0, 4, 3.7, 2.8, 0.8, (x, y) => (y > 0.5 ? light : y < -0.45 ? dark : stone));
        v.box(2.9, 2.9, 0.5, 0, 8.4, 2.75, '#3a3a40');
        for (const s of [-1, 1]) {
          v.box(2.6, 0.9, 2.8, s * 2.4, 11.3, 0, moss);
          v.box(1.2, 0.6, 1.4, s * 2.8, 11.9, -0.4, moss2);
          v.box(0.45, 2.2, 0.45, s * 3.3, 9.9, 1.6, moss);
        }
        v.box(0.35, 2.4, 0.3, 2, 6.8, 2.75, '#55555a', 0, 0, 0.4, 0);
        v.box(0.35, 1.4, 0.3, -2.3, 9.8, 2.6, '#55555a', 0, 0, -0.3, 0);
        v.box(6, 0.9, 3.2, 0, 5.4, 0.1, '#5e4a36');
        v.box(1.2, 1.2, 0.5, 0, 5.4, 1.75, '#c9a23a');
      });
      const core = mesh(root, 'golem:core', (v) => {
        v.box(1.8, 1.8, 0.5, 0, 8.4, 2.95, '#ffb040', 0, 0, 0, 0);
        v.box(0.8, 0.8, 0.5, 0, 8.4, 3.05, '#fff0b0', 0, 0, 0, 0);
      }, VOX_GLOW);
      const head = sub(root, 0, 11.8, 0.5);
      mesh(head, 'golem:head', (v) => {
        v.box(4.4, 3.4, 3.8, 0, 0.3, 0, stone);
        v.box(4.8, 1, 1.2, 0, 1.2, 1.7, dark);
        v.box(1.1, 1.6, 1.1, 0, -0.2, 2.1, dark);
        v.box(4.6, 0.9, 4, 0, 2.3, 0, moss);
        v.box(1.6, 0.6, 1.4, 1, 2.9, -0.3, moss2);
        v.box(0.4, 1.6, 0.4, -1.8, 1.2, 1.95, moss);
      });
      mesh(head, 'golem:eyes', (v) => {
        for (const s of [-1, 1]) v.box(1.1, 0.7, 0.3, s * 1.1, 0.4, 1.95, '#ffd27a', 0, 0, 0, 0);
      }, VOX_GLOW);
      const arms = [];
      for (const s of [-1, 1]) {
        const a = sub(root, s * 4.7, 10.2, 0);
        mesh(a, 'golem:arm', (v) => {
          v.box(2.8, 3.8, 2.8, 0, -1.6, 0, stone);
          v.box(3, 0.9, 3, 0, -0.9, 0, moss);
          v.box(3.6, 3.6, 3.6, 0, -5.1, 0.2, light);
          v.box(3.7, 0.8, 0.8, 0, -5.8, 2, dark);
          for (const x of [-1.2, 0, 1.2]) v.box(0.9, 0.9, 0.5, x, -4.2, 2.1, dark);
        });
        arms.push(a);
      }
      return { arms, legs, head, core };
    },
  },
  dragon: {
    name: 'Baby Dragon',
    price: 1000,
    rarity: 'legendary',
    desc: 'Breathes fire on mobs and sets them burning.',
    fly: true,
    build(root) {
      const red = '#d8392b';
      const dark = '#9e2418';
      const belly = '#ffb040';
      const belly2 = '#ffd27a';
      const horn = '#f4eede';
      const mem = '#ff8a3a';
      mesh(root, 'dragon:body', (v) => {
        v.ellipsoid(0, 0, -0.5, 2.5, 2.4, 3.7, 0.75, (x, y) => (y < -0.45 ? belly : red));
        for (let z = 2; z >= -3; z -= 1.25) v.box(2.4, 0.5, 1, 0, -2.25, z, z % 2.5 ? belly2 : belly, 0, 0, 0, 0);
        for (const [z, h] of [[2.2, 1], [0.9, 1.3], [-0.4, 1.4], [-1.7, 1.2], [-3, 1]]) v.box(0.6, h, 0.9, 0, 2.2 + h / 2, z, dark);
        for (const s of [-1, 1]) {
          v.box(0.8, 1.7, 0.8, s * 1.5, -1.9, 2, red, 0.3, 0, 0);
          v.box(0.9, 0.5, 1, s * 1.5, -2.8, 2.5, horn);
          v.box(1.3, 2, 1.6, s * 1.5, -2.1, -2.2, red);
          v.box(1.4, 0.7, 2, s * 1.5, -3.2, -1.9, dark);
        }
      });
      const head = sub(root, 0, 1.6, 2.8);
      mesh(head, 'dragon:head', (v) => {
        v.box(4.2, 3.4, 3.8, 0, 1.3, 1.4, red);
        v.box(3, 1.6, 2.8, 0, 0.9, 4.2, red);
        v.box(3.1, 0.5, 2.8, 0, 1.75, 4.1, dark);
        for (const s of [-1, 1]) {
          v.box(0.5, 0.4, 0.3, s * 0.75, 1.25, 5.6, '#3a0e05', 0, 0, 0, 0);
          v.box(0.9, 0.9, 2.2, s * 1.2, 3.2, 0.2, horn, -0.55, s * 0.15, 0);
          v.box(0.6, 0.6, 1.4, s * 1.35, 4, -1.2, horn, -0.95, s * 0.2, 0);
          v.box(0.4, 1.6, 1.4, s * 2.25, 1.3, 0.6, mem, 0, s * 0.3, 0);
          v.box(1.3, 0.45, 0.5, s * 1.3, 2.85, 2.9, dark, 0, 0, s * 0.15);
        }
        eyes(v, 1.3, 2, 3.35, 1.2, 1.3, '#ffd84a', '#3a0e05');
      });
      const jaw = sub(head, 0, 0.1, 2.6);
      mesh(jaw, 'dragon:jaw', (v) => {
        v.box(2.7, 0.8, 2.8, 0, -0.4, 1.4, belly);
        for (const s of [-1, 1]) v.box(0.35, 0.5, 0.35, s * 0.9, 0.1, 2.5, '#ffffff', 0, 0, 0, 0);
      });
      const fire = mesh(jaw, 'dragon:fire', (v) => v.box(1.8, 0.4, 2, 0, 0.1, 1.6, '#ffb040', 0, 0, 0, 0), VOX_GLOW);
      fire.visible = false;
      const tail = sub(root, 0, 0, -4);
      mesh(tail, 'dragon:tail1', (v) => {
        v.box(1.8, 1.8, 3, 0, 0, -1.4, red);
        v.box(0.5, 0.9, 0.8, 0, 1.2, -1.4, dark);
      });
      const t2 = sub(tail, 0, 0, -2.9);
      mesh(t2, 'dragon:tail2', (v) => {
        v.box(1.3, 1.3, 2.8, 0, 0, -1.3, red);
        v.box(0.45, 0.8, 0.7, 0, 0.9, -1.3, dark);
      });
      const t3 = sub(t2, 0, 0, -2.7);
      mesh(t3, 'dragon:tail3', (v) => {
        v.box(0.9, 0.9, 2.2, 0, 0, -1, red);
        v.box(2.3, 0.45, 2.3, 0, 0, -2.4, mem, 0, Math.PI / 4, 0);
        v.box(1.2, 0.5, 1.2, 0, 0, -2.4, dark, 0, Math.PI / 4, 0);
      });
      const inner = (v, s) => {
        v.box(3.8, 0.6, 0.6, s * 1.9, 0.3, 0.8, red);
        v.box(3.8, 0.3, 3.6, s * 1.9, 0, -0.9, mem);
        v.box(0.4, 0.4, 3.2, s * 2.8, 0.1, -0.9, dark, 0, s * 0.25, 0);
      };
      const outer = (v, s) => {
        v.box(3.6, 0.5, 0.5, s * 1.8, 0.3, 0.8, red, 0, s * 0.2, 0);
        v.box(3.4, 0.28, 3.2, s * 1.6, 0, -0.8, '#ffa24a');
        for (const [x, z] of [[1, -2.6], [2.5, -2.4], [3.4, -1.4]]) v.box(1.2, 0.26, 1, s * x, 0, z, '#ffa24a');
        for (const a of [0.15, 0.6]) v.box(0.3, 0.3, 3.6, s * (1.2 + a * 1.8), 0.12, -0.8, dark, 0, s * a, 0);
        v.box(0.5, 0.9, 0.5, s * 3.6, 0.7, 1, horn);
      };
      const wings = [-1, 1].map((s) => wing(root, 'dragon', s, [2, 1.7, 0.2, 3.8], inner, outer));
      return { wings, head, jaw, fire, tail: [tail, t2, t3] };
    },
  },
};

export const PET_ORDER = ['cat', 'pip', 'bat', 'slime', 'golem', 'dragon'];

// Just the model, for thumbnails and the wardrobe.
export function petObject(id) {
  const root = new THREE.Group();
  root.userData.parts = PETS[id].build(root);
  root.userData.petId = id;
  animatePet(root.userData.parts, id, { t: 0, walk: 0, act: 0 }, 0);
  return root;
}

// Wings flap, tails swish, eyes blink. s: { t, walk (0-1), act (0-1) }.
export function animatePet(P, id, s, dt) {
  const t = s.t;
  const walk = s.walk || 0;
  if (P.spin) P.spin.rotation.y += dt * 30;
  if (P.wings) {
    const rate = id === 'bat' ? 16 : 9;
    const f = Math.sin(t * rate);
    for (const w of P.wings) {
      const sd = w.userData.side;
      w.rotation.z = sd * (f * 0.75 - 0.1);
      w.rotation.y = sd * -0.15;
      w.userData.tip.rotation.z = sd * (Math.sin(t * rate - 0.9) * 0.55 + 0.15);
    }
  }
  if (P.tail) {
    const sway = Math.sin(t * (id === 'cat' ? 2.4 : 3.2));
    P.tail[0].rotation.set(id === 'cat' ? 0.7 : 0.15, sway * 0.35, 0);
    for (let i = 1; i < P.tail.length; i++) P.tail[i].rotation.set(id === 'cat' ? -0.45 : 0.12, sway * 0.3 * i, 0);
  }
  if (P.legs) {
    const ph = t * (id === 'golem' ? 8 : 11);
    P.legs.forEach((leg, i) => {
      const alt = P.legs.length === 4 ? (i === 0 || i === 3 ? 1 : -1) : i ? 1 : -1;
      leg.rotation.x = Math.sin(ph) * 0.7 * walk * alt;
    });
  }
  if (P.blink) {
    const b = t % 3.7 > 3.57 ? 0.15 : 1;
    P.blink.scale.y = b;
  }
  if (P.head) {
    P.head.rotation.x = Math.sin(t * 1.7) * 0.06 - (id === 'dragon' ? s.act * 0.25 : 0);
    P.head.rotation.y = Math.sin(t * 0.8) * 0.18 * (1 - walk);
    if (id === 'cat') P.head.rotation.z = Math.sin(t * 0.6) * 0.12 * (1 - walk);
  }
  if (P.jaw) {
    P.jaw.rotation.x = s.act * 0.55;
    P.fire.visible = s.act > 0.2;
  }
  if (P.light) P.light.visible = t % 1.2 < 0.8;
  if (P.heart) {
    const beat = 1 + Math.max(0, Math.sin(t * 5)) * 0.18 + s.act * 0.5;
    P.heart.scale.setScalar(beat);
    P.heart.position.y = (9.2 + Math.sin(t * 2) * 0.5) * PX;
    P.heart.rotation.y = t * 1.5;
  }
  if (P.squish) {
    const q = Math.abs(Math.sin(t * (3 + walk * 5)));
    P.squish.scale.set(1 + (1 - q) * 0.12, 0.85 + q * 0.3, 1 + (1 - q) * 0.12);
    P.squish.position.y = q * walk * 0.18;
  }
  if (P.arms) {
    P.arms[0].rotation.x = Math.sin(t * 8) * 0.5 * walk - s.act * 1.6;
    P.arms[1].rotation.x = -Math.sin(t * 8) * 0.5 * walk - s.act * 1.6;
    P.arms[0].rotation.z = -0.1;
    P.arms[1].rotation.z = 0.1;
  }
  if (P.core) P.core.scale.setScalar(1 + Math.sin(t * 3) * 0.06 + s.act * 0.3);
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
    this.root.scale.setScalar(id === 'golem' ? 1 : 1.25);
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
    const walk = Math.min(1, moving * 2);
    animatePet(this.parts, this.id, { t: this.t, walk, act: this.act }, dt);
    if (!this.def.fly && !this.parts.squish) this.model.position.y = Math.abs(Math.sin(this.t * 10)) * 0.05 * walk;
    // Flyers lean into the way they are going.
    if (this.def.fly) this.model.rotation.x = Math.min(0.35, moving * 0.25);
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
