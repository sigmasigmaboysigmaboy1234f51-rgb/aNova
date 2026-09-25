import * as THREE from 'three';
import { GUNS, cleanBuild, buildCode } from './weapons.js';

// Guns are built from voxels like pixel-art item models, snapped together
// from a frame (one per gun) and a module for every installed part.
// Voxel (i, j, k): i runs back to front along the barrel, j bottom to top,
// k left to right (4 is the middle). The barrel points down -z in model
// space, and every gun is placed so its grip sits in the same spot.

const S = 0.014;
const GRIP = new THREE.Vector3(0, -0.11, 0.11);

// Colour slots. Paints replace the metal and grip colours, cores replace
// the glow colours.
const BASE_PAL = {
  8: '#c49a45',
  11: '#8ff0ff',
  12: '#08090a',
  15: '#a8ecff',
  16: '#c46a2e',
  17: '#f2c230',
  18: '#8a5a33',
  19: '#5e3b20',
  20: '#e8e2cc',
  21: '#67a23d',
  22: '#7a5436',
  23: '#ff3b3b',
  24: '#f4f1ea',
};

export const PAINTS = {
  steel: { 1: '#383e48', 2: '#56606e', 3: '#707985', 5: '#ff7a2f', 6: '#a8401a', 9: '#2c2e34', 10: '#43454d' },
  gunmetal: { 1: '#24272c', 2: '#3a3f47', 3: '#5c636d', 5: '#d6d9de', 6: '#8d939b', 9: '#1e1f23', 10: '#34363c' },
  desert: { 1: '#6b5a3e', 2: '#a48d62', 3: '#c9b284', 5: '#4f5a32', 6: '#353d20', 9: '#5a4a30', 10: '#76623f' },
  camo: { 1: '#33402a', 2: '#56673a', 3: '#7d8a52', 5: '#8a6b3c', 6: '#5c4526', 9: '#2f3524', 10: '#454f33', camo: true },
  candy: { 1: '#c2477f', 2: '#ff8fc0', 3: '#ffd1e6', 5: '#6ee7c8', 6: '#2fa58a', 9: '#fff0f7', 10: '#ffc2dd' },
  obsidian: { 1: '#0e0c14', 2: '#211b2c', 3: '#3a2f4d', 5: '#b46cff', 6: '#6b3aa8', 9: '#141118', 10: '#241e2c' },
  neon: { 1: '#101318', 2: '#1b2029', 3: '#2b3340', 5: '#39ff9c', 6: '#1a9e5c', 9: '#0d0f13', 10: '#1b1f27', neon: true },
  gold: { 1: '#8a6a1f', 2: '#c9a23a', 3: '#f2d774', 5: '#ffffff', 6: '#d8d0b8', 9: '#3a2a12', 10: '#5a4420' },
};

export const CORES = {
  ember: { 7: '#ffd36b', 13: '#ffb040', 14: '#ff7a2f', 25: '#e8692a', 26: '#9a3a14', beam: '#ffb040' },
  inferno: { 7: '#fff0a0', 13: '#ff7a20', 14: '#ff3b10', 25: '#e8501a', 26: '#8a2a0c', beam: '#ff6a20' },
  frost: { 7: '#e4fbff', 13: '#8fe3ff', 14: '#39b8ff', 25: '#3aa0d8', 26: '#1d5e86', beam: '#9fe8ff' },
  shock: { 7: '#f1e4ff', 13: '#c09cff', 14: '#8a4dff', 25: '#7a4ad8', 26: '#44248a', beam: '#c8a4ff' },
  blast: { 7: '#ffe6cc', 13: '#ff7050', 14: '#ff2a1a', 25: '#d83a2a', 26: '#801a12', beam: '#ff7a50' },
  leech: { 7: '#eaffcc', 13: '#9be070', 14: '#48c02c', 25: '#4aa83a', 26: '#23601a', beam: '#8fe070' },
};

const GROUP = {
  body: 'body',
  glow: 'body',
  shroud: 'shroud',
  heat: 'shroud',
  cell: 'cell',
  cellGlow: 'cell',
  spin: 'spin',
  spinGlow: 'spin',
};
const UNLIT = new Set(['glow', 'heat', 'cellGlow', 'spinGlow']);

class Voxels {
  constructor() {
    this.map = new Map();
  }
  key(i, j, k) {
    return ((i + 64) * 256 + (j + 64)) * 256 + (k + 64);
  }
  set(i, j, k, c, part = 'body') {
    this.map.set(this.key(i, j, k), { i, j, k, c, part });
  }
  get(i, j, k) {
    return this.map.get(this.key(i, j, k));
  }
  del(i, j, k) {
    this.map.delete(this.key(i, j, k));
  }
  box(i0, i1, j0, j1, k0, k1, c, part) {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) this.set(i, j, k, c, part);
  }
  carve(i0, i1, j0, j1, k0, k1) {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) this.del(i, j, k);
  }
  paint(i0, i1, j0, j1, k0, k1, c) {
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (let k = k0; k <= k1; k++) {
          const v = this.get(i, j, k);
          if (v) v.c = c;
        }
      }
    }
  }
  // Hollow rectangle standing across the barrel axis.
  ring(i, j0, j1, k0, k1, c, part) {
    this.box(i, i, j0, j1, k0, k1, c, part);
    this.carve(i, i, j0 + 1, j1 - 1, k0 + 1, k1 - 1);
  }
}

// A raked pistol grip with finger ridges. Top row at jTop, front edge at i.
function grip(v, i, jTop, jBottom, rake = 2) {
  for (let j = jTop; j >= jBottom; j--) {
    const shift = Math.floor((jTop - j) / rake);
    v.box(i - 4 - shift, i - shift, j, j, 3, 5, 9);
    if (j % 2) v.paint(i - shift, i - shift, j, j, 3, 5, 10);
  }
  const shift = Math.floor((jTop - jBottom + 1) / rake);
  v.box(i - 4 - shift, i - shift, jBottom - 1, jBottom - 1, 3, 5, 2);
}

function trigger(v, i, j) {
  v.box(i, i + 4, j - 3, j - 3, 4, 4, 1);
  v.box(i + 4, i + 4, j - 2, j, 4, 4, 1);
  v.set(i + 1, j, 4, 3);
  v.set(i + 1, j - 1, 4, 3);
  v.set(i + 2, j - 2, 4, 3);
}

function rail(v, i0, i1, j) {
  v.box(i0, i1, j, j, 3, 5, 1);
  for (let i = i0; i <= i1; i += 2) v.box(i, i, j + 1, j + 1, 3, 5, 1);
}

// --- Frames ----------------------------------------------------------------
// Each returns anchors where parts attach:
//   front {i, j}     barrel start       muzzle {i, j}   fixed muzzle (no barrel slot)
//   top {i0, i1, j}  sight rail         bottom {i0, i1, j, len}  magazine
//   rear {i, j0, j1} stock              under {i, j}    underbarrel
//   grip {i, j}      where the hand is  barrelLen       default barrel length

const FRAMES = {
  rifle(v) {
    v.box(8, 30, 9, 16, 1, 7, 2);
    v.carve(8, 30, 9, 10, 1, 1);
    v.carve(8, 30, 9, 10, 7, 7);
    for (const k of [1, 7]) {
      v.paint(15, 15, 11, 16, k, k, 1);
      v.paint(25, 25, 11, 16, k, k, 1);
      v.paint(9, 14, 12, 12, k, k, 5);
      v.paint(26, 29, 12, 12, k, k, 5);
      for (const [i, j] of [
        [10, 15],
        [29, 15],
        [10, 11],
        [29, 11],
      ]) v.paint(i, i, j, j, k, k, 8);
    }
    v.carve(17, 23, 12, 14, 1, 1);
    v.carve(17, 23, 12, 14, 7, 7);
    for (let i = 17; i <= 23; i++) {
      const c = i % 2 ? 7 : 14;
      v.box(i, i, 12, 14, 2, 2, c, 'glow');
      v.box(i, i, 12, 14, 6, 6, c, 'glow');
    }
    for (const i of [18, 20, 22]) v.paint(i, i, 16, 16, 2, 6, 1);
    v.box(26, 28, 14, 15, 8, 8, 3);
    rail(v, 9, 30, 17);
    grip(v, 15, 8, 1);
    trigger(v, 15, 8);
    v.box(19, 26, 8, 8, 2, 6, 1);
    return {
      front: { i: 31, j: 12 },
      barrelLen: 13,
      top: { i0: 9, i1: 30, j: 18 },
      bottom: { i0: 20, i1: 25, j: 8, len: 7 },
      rear: { i: 8, j0: 8, j1: 15 },
      under: { i: 33, j: 10 },
      grip: { i: 13, j: 4 },
    };
  },

  pistol(v) {
    v.box(10, 24, 13, 17, 2, 6, 2);
    for (let i = 11; i <= 14; i += 2) v.paint(i, i, 14, 16, 2, 6, 1);
    v.paint(18, 20, 17, 17, 3, 5, 1);
    for (const k of [2, 6]) v.paint(15, 23, 13, 13, k, k, 5);
    v.box(11, 22, 11, 12, 3, 5, 1);
    grip(v, 14, 10, 3, 3);
    trigger(v, 14, 10);
    return {
      front: { i: 25, j: 15 },
      barrelLen: 4,
      top: { i0: 11, i1: 23, j: 18 },
      bottom: { i0: 9, i1: 12, j: 3, len: 2 },
      under: { i: 19, j: 11 },
      grip: { i: 12, j: 7 },
    };
  },

  revolver(v) {
    v.box(8, 21, 11, 16, 3, 5, 2);
    v.box(6, 8, 15, 18, 4, 4, 1);
    // Cylinder, which drops out to reload.
    v.box(14, 19, 10, 16, 1, 7, 3, 'cell');
    for (const j of [11, 13, 15]) {
      v.paint(14, 19, j, j, 1, 1, 1);
      v.paint(14, 19, j, j, 7, 7, 1);
    }
    for (const [j, k] of [
      [11, 2],
      [11, 6],
      [15, 2],
      [15, 6],
      [13, 1],
      [13, 7],
    ]) v.set(19, j, k, 8, 'cell');
    for (let j = 10; j >= 2; j--) {
      const shift = Math.floor((10 - j) / 3);
      v.box(5 - shift, 10 - shift, j, j, 3, 5, j % 3 ? 18 : 19);
    }
    trigger(v, 11, 10);
    return {
      front: { i: 22, j: 14 },
      barrelLen: 10,
      top: { i0: 9, i1: 21, j: 17 },
      grip: { i: 8, j: 6 },
    };
  },

  smg(v) {
    v.box(8, 24, 9, 15, 2, 6, 2);
    for (const k of [2, 6]) {
      v.paint(9, 23, 11, 11, k, k, 5);
      v.paint(16, 16, 12, 15, k, k, 1);
    }
    v.box(20, 21, 13, 14, 7, 7, 3);
    rail(v, 9, 24, 16);
    grip(v, 14, 8, 2);
    trigger(v, 14, 8);
    return {
      front: { i: 25, j: 12 },
      barrelLen: 7,
      top: { i0: 10, i1: 23, j: 17 },
      bottom: { i0: 17, i1: 20, j: 8, len: 10 },
      rear: { i: 8, j0: 10, j1: 14 },
      under: { i: 25, j: 10 },
      grip: { i: 12, j: 5 },
    };
  },

  shotgun(v) {
    v.box(8, 28, 9, 16, 1, 7, 2);
    for (const k of [1, 7]) {
      v.paint(9, 27, 14, 14, k, k, 5);
      v.paint(11, 11, 10, 12, k, k, 8);
      v.paint(26, 26, 10, 12, k, k, 8);
    }
    v.paint(16, 24, 9, 9, 2, 6, 1);
    rail(v, 10, 27, 17);
    grip(v, 15, 8, 1);
    trigger(v, 15, 8);
    // Tube magazine and the pump, which racks back after every shot.
    v.box(29, 44, 8, 10, 3, 5, 1);
    v.box(30, 40, 7, 11, 2, 6, 9, 'shroud');
    for (let i = 30; i <= 40; i += 2) v.paint(i, i, 7, 11, 2, 6, 10);
    return {
      front: { i: 29, j: 13 },
      barrelLen: 16,
      top: { i0: 10, i1: 27, j: 18 },
      bottom: { i0: 17, i1: 23, j: 8, len: 4 },
      rear: { i: 8, j0: 9, j1: 15 },
      under: { i: 41, j: 8 },
      grip: { i: 13, j: 4 },
    };
  },

  sniper(v) {
    v.box(6, 30, 9, 15, 2, 6, 2);
    for (const k of [2, 6]) v.paint(8, 29, 12, 12, k, k, 5);
    v.box(20, 20, 14, 14, 7, 8, 3);
    v.box(20, 21, 12, 14, 9, 9, 3);
    rail(v, 8, 30, 16);
    grip(v, 13, 8, 2);
    trigger(v, 13, 8);
    return {
      front: { i: 31, j: 12 },
      barrelLen: 20,
      top: { i0: 10, i1: 28, j: 17 },
      bottom: { i0: 18, i1: 23, j: 8, len: 5 },
      rear: { i: 6, j0: 8, j1: 15 },
      under: { i: 38, j: 10 },
      grip: { i: 11, j: 5 },
    };
  },

  crossbow(v) {
    v.box(6, 30, 10, 12, 3, 5, 18);
    v.paint(6, 30, 12, 12, 4, 4, 19);
    v.box(26, 31, 9, 13, 2, 6, 2);
    // Limbs sweep out and back, with the string pulled to the nock.
    for (const s of [-1, 1]) {
      for (let d = 1; d <= 11; d++) {
        const k = 4 + s * d;
        const back = d > 8 ? d - 8 : 0;
        v.box(30 - back, 31 - back, 10, 13, k, k, d > 9 ? 5 : 1);
      }
      const tipI = 28;
      const tipK = 4 + s * 11;
      for (let t = 0; t <= 10; t++) {
        const i = Math.round(tipI + (18 - tipI) * (t / 10));
        const k = Math.round(tipK + (4 - tipK) * (t / 10));
        v.set(i, 13, k, 20);
      }
    }
    // The loaded bolt (gone once fired).
    v.box(18, 38, 13, 13, 4, 4, 18, 'cell');
    v.box(18, 19, 13, 13, 3, 5, 5, 'cell');
    v.box(39, 40, 13, 13, 4, 4, 7, 'cellGlow');
    grip(v, 14, 9, 3, 2);
    trigger(v, 14, 9);
    return {
      muzzle: { i: 41, j: 13 },
      top: { i0: 8, i1: 16, j: 13 },
      rear: { i: 6, j0: 9, j1: 12 },
      under: { i: 26, j: 9 },
      grip: { i: 12, j: 6 },
    };
  },

  beam(v) {
    v.box(6, 28, 7, 16, 1, 7, 2);
    for (const [j, k] of [
      [16, 1],
      [16, 7],
      [7, 1],
      [7, 7],
    ]) v.carve(6, 28, j, j, k, k);
    for (const k of [1, 7]) {
      v.paint(8, 26, 12, 12, k, k, 5);
      for (let i = 9; i <= 25; i += 3) v.paint(i, i, 9, 10, k, k, 1);
    }
    // Emitter: a ring, three prongs and a glowing crystal.
    v.ring(29, 6, 17, 0, 8, 3);
    v.box(29, 34, 17, 17, 4, 4, 3);
    v.box(29, 34, 11, 12, 0, 0, 3);
    v.box(29, 34, 11, 12, 8, 8, 3);
    v.box(29, 33, 11, 12, 3, 5, 14, 'glow');
    v.box(29, 32, 11, 12, 4, 4, 7, 'glow');
    // Coolant tanks (the "magazine").
    for (const [k0, k1] of [
      [1, 3],
      [5, 7],
    ]) {
      v.box(9, 23, 17, 19, k0, k1, 15, 'cellGlow');
      v.box(10, 22, 18, 18, k0 + 1, k0 + 1, 14, 'cellGlow');
      v.box(8, 8, 17, 19, k0, k1, 3, 'cell');
      v.box(24, 24, 17, 19, k0, k1, 3, 'cell');
    }
    grip(v, 14, 6, 0);
    trigger(v, 14, 6);
    return {
      muzzle: { i: 35, j: 12 },
      top: { i0: 24, i1: 28, j: 17 },
      rear: { i: 6, j0: 8, j1: 14 },
      under: { i: 20, j: 7 },
      grip: { i: 12, j: 3 },
    };
  },

  tesla(v) {
    v.box(6, 24, 9, 16, 1, 7, 2);
    for (const k of [1, 7]) v.paint(7, 23, 13, 13, k, k, 5);
    v.box(25, 42, 12, 12, 4, 4, 16);
    for (const i of [27, 31, 35, 39]) {
      v.ring(i, 9, 15, 1, 7, 16);
      v.set(i, 12, 4, 14, 'glow');
    }
    v.box(42, 44, 11, 13, 3, 5, 15, 'glow');
    v.set(43, 12, 4, 7, 'glow');
    // Battery pack under the body.
    v.box(12, 19, 3, 8, 2, 6, 25, 'cell');
    v.paint(12, 19, 3, 3, 2, 6, 26);
    for (const k of [2, 6]) v.box(13, 18, 5, 6, k, k, 14, 'cellGlow');
    rail(v, 7, 23, 17);
    grip(v, 11, 8, 1);
    trigger(v, 11, 8);
    return {
      muzzle: { i: 45, j: 12 },
      top: { i0: 8, i1: 22, j: 18 },
      rear: { i: 6, j0: 9, j1: 15 },
      under: { i: 21, j: 9 },
      grip: { i: 9, j: 4 },
    };
  },

  launcher(v) {
    v.box(10, 42, 8, 16, 0, 8, 2);
    for (const [j, k] of [
      [16, 0],
      [16, 8],
      [8, 0],
      [8, 8],
    ]) v.carve(10, 42, j, j, k, k);
    v.carve(40, 42, 10, 14, 2, 6);
    v.box(39, 39, 10, 14, 2, 6, 12);
    for (let j = 8; j <= 16; j++) for (let k = 0; k <= 8; k++) v.paint(36, 37, j, j, k, k, (j + k) % 2 ? 17 : 1);
    v.paint(12, 12, 8, 16, 0, 8, 5);
    v.box(8, 9, 9, 15, 1, 7, 1);
    v.box(38, 38, 17, 19, 4, 4, 1);
    // Drum of grenades.
    v.box(15, 23, 1, 7, 0, 8, 1, 'cell');
    for (const [i, j] of [
      [15, 1],
      [23, 1],
      [15, 7],
      [23, 7],
    ]) v.carve(i, i, j, j, 0, 8);
    for (const k of [0, 8]) v.box(18, 20, 3, 5, k, k, 5, 'cell');
    grip(v, 13, 7, 1);
    trigger(v, 13, 7);
    return {
      muzzle: { i: 43, j: 12 },
      top: { i0: 14, i1: 34, j: 17 },
      rear: { i: 8, j0: 9, j1: 15 },
      under: { i: 26, j: 8 },
      grip: { i: 11, j: 4 },
    };
  },

  minigun(v) {
    v.box(2, 20, 5, 18, 0, 8, 2);
    for (const k of [0, 8]) {
      v.paint(3, 19, 12, 12, k, k, 5);
      for (let i = 5; i <= 17; i += 4) v.paint(i, i, 7, 16, k, k, 1);
    }
    v.box(6, 16, 21, 21, 3, 5, 1);
    v.box(6, 6, 19, 20, 4, 4, 1);
    v.box(16, 16, 19, 20, 4, 4, 1);
    // Ammo box and belt.
    v.box(6, 14, 0, 4, 0, 8, 25, 'cell');
    v.paint(6, 14, 4, 4, 0, 8, 26);
    v.box(15, 17, 3, 4, 3, 5, 8, 'cell');
    // Spinning barrel cluster.
    for (let n = 0; n < 6; n++) {
      const ang = (n / 6) * Math.PI * 2;
      const dj = Math.round(Math.sin(ang) * 3);
      const dk = Math.round(Math.cos(ang) * 3);
      v.box(21, 44, 12 + dj, 12 + dj, 4 + dk, 4 + dk, 1, 'spin');
      v.set(44, 12 + dj, 4 + dk, 12, 'spin');
    }
    v.box(21, 43, 12, 12, 4, 4, 3, 'spin');
    for (const i of [27, 38]) v.ring(i, 8, 16, 0, 8, 3, 'spin');
    v.box(24, 24, 11, 13, 3, 5, 14, 'spinGlow');
    grip(v, 7, 4, 0, 3);
    return {
      muzzle: { i: 45, j: 12 },
      spin: { j: 12 },
      top: { i0: 7, i1: 15, j: 22 },
      grip: { i: 5, j: 2 },
    };
  },

  builder(v) {
    v.box(8, 26, 9, 16, 1, 7, 2);
    for (let i = 9; i <= 25; i++) for (const k of [1, 7]) v.paint(i, i, 10, 10, k, k, i % 2 ? 17 : 1);
    v.box(27, 36, 9, 16, 1, 7, 1);
    v.carve(27, 36, 10, 15, 2, 6);
    v.ring(27, 9, 16, 1, 7, 5);
    // Hopper with the next block ready to go.
    v.box(12, 20, 17, 22, 1, 7, 3);
    v.carve(13, 19, 19, 22, 2, 6);
    v.box(14, 18, 18, 21, 2, 6, 22, 'cell');
    v.paint(14, 18, 21, 21, 2, 6, 21);
    grip(v, 14, 8, 1);
    trigger(v, 14, 8);
    return {
      muzzle: { i: 37, j: 12 },
      top: { i0: 21, i1: 26, j: 17 },
      rear: { i: 8, j0: 9, j1: 16 },
      grip: { i: 12, j: 4 },
    };
  },
};

// --- Part modules ----------------------------------------------------------

function barrel(v, a, style) {
  const { i: i0, j } = a.front;
  const len = Math.max(3, Math.round(a.barrelLen * ({ short: 0.6, long: 1.4, precision: 1.2 }[style] || 1)));
  const end = i0 + len;
  const shroud = (from, to, vents) => {
    v.box(from, to, j - 2, j + 2, 2, 6, 2, 'shroud');
    v.paint(to, to, j - 2, j + 2, 2, 6, 5);
    v.paint(from, from, j - 2, j + 2, 2, 6, 1);
    if (!vents) return;
    for (let i = from + 2; i < to - 1; i += 2) {
      v.carve(i, i, j + 2, j + 2, 3, 5);
      v.carve(i, i, j - 1, j + 1, 2, 2);
      v.carve(i, i, j - 1, j + 1, 6, 6);
      v.box(i, i, j - 1, j + 1, 3, 5, 13, 'heat');
    }
  };
  if (style === 'twin') {
    v.box(i0, end, j - 1, j + 1, 1, 3, 1);
    v.box(i0, end, j - 1, j + 1, 5, 7, 1);
    v.box(i0, i0 + Math.round(len * 0.4), j - 2, j + 2, 0, 8, 2, 'shroud');
    v.set(end, j, 2, 12);
    v.set(end, j, 6, 12);
  } else if (style === 'heavy') {
    v.box(i0, end, j - 2, j + 2, 2, 6, 1);
    for (let i = i0 + 1; i < end; i += 2) {
      v.box(i, i, j - 2, j + 2, 1, 1, 13, 'heat');
      v.box(i, i, j - 2, j + 2, 7, 7, 13, 'heat');
    }
    v.set(end, j, 4, 12);
  } else if (style === 'precision') {
    v.box(i0, end, j - 1, j + 1, 3, 5, 1);
    for (let i = i0 + 1; i < end; i += 3) v.paint(i, i + 1, j + 1, j + 1, 3, 5, 3);
    v.box(end - 1, end, j - 2, j + 2, 2, 6, 3);
    v.set(end, j, 4, 12);
  } else {
    v.box(i0, end, j - 1, j + 1, 3, 5, 1);
    v.set(end, j, 4, 12);
    const cover = style === 'short' ? 0.55 : style === 'long' ? 0.45 : 0.72;
    shroud(i0, i0 + Math.round(len * cover), style !== 'long');
    if (style === 'long') for (let i = i0 + Math.round(len * 0.5); i < end; i += 3) v.paint(i, i, j + 1, j + 1, 3, 5, 3);
  }
  return { i: end + 1, j };
}

function muzzle(v, m, style) {
  const { i, j } = m;
  if (style === 'brake') {
    v.box(i, i + 3, j - 2, j + 2, 2, 6, 2);
    v.carve(i + 1, i + 1, j - 1, j + 1, 2, 2);
    v.carve(i + 1, i + 1, j - 1, j + 1, 6, 6);
    v.carve(i + 1, i + 1, j + 2, j + 2, 3, 5);
    v.paint(i + 3, i + 3, j - 2, j + 2, 2, 6, 1);
    v.set(i + 3, j, 4, 12);
    return { i: i + 4, j };
  }
  if (style === 'suppressor') {
    v.box(i, i + 8, j - 2, j + 2, 2, 6, 1);
    for (const [dj, k] of [
      [-2, 2],
      [-2, 6],
      [2, 2],
      [2, 6],
    ]) v.carve(i, i + 8, j + dj, j + dj, k, k);
    v.paint(i, i, j - 2, j + 2, 2, 6, 3);
    v.paint(i + 8, i + 8, j - 2, j + 2, 2, 6, 3);
    v.paint(i + 4, i + 4, j - 2, j + 2, 2, 6, 5);
    v.set(i + 8, j, 4, 12);
    return { i: i + 9, j };
  }
  if (style === 'compensator') {
    v.box(i, i + 2, j - 1, j + 2, 3, 5, 2);
    v.carve(i + 1, i + 1, j + 2, j + 2, 4, 4);
    v.set(i + 2, j, 4, 12);
    return { i: i + 3, j };
  }
  if (style === 'choke') {
    v.box(i, i, j - 1, j + 1, 3, 5, 3);
    v.box(i + 1, i + 1, j - 2, j + 2, 2, 6, 3);
    v.set(i + 1, j, 4, 12);
    return { i: i + 2, j };
  }
  if (style === 'flame') {
    v.box(i, i + 3, j - 2, j + 2, 2, 6, 1);
    v.ring(i + 2, j - 2, j + 2, 2, 6, 14, 'glow');
    v.set(i + 3, j - 2, 4, 7, 'glow');
    v.set(i + 3, j, 4, 12);
    return { i: i + 4, j };
  }
  return { i, j };
}

function sight(v, t, style) {
  const a = t.i0 + Math.max(1, Math.floor((t.i1 - t.i0) * 0.3));
  const j = t.j;
  if (style === 'reddot') {
    v.box(a, a + 6, j, j + 1, 3, 5, 2);
    v.box(a + 1, a + 2, j + 2, j + 2, 4, 4, 1);
    v.box(a + 5, a + 6, j + 2, j + 5, 2, 6, 1);
    v.carve(a + 5, a + 6, j + 2, j + 4, 3, 5);
    v.paint(a + 5, a + 6, j + 5, j + 5, 2, 6, 3);
    v.set(a + 6, j + 3, 4, 11, 'glow');
    return { i: a, j: j + 3 };
  }
  if (style === 'holo') {
    v.box(a, a + 7, j, j + 1, 2, 6, 2);
    v.box(a + 5, a + 7, j + 2, j + 7, 1, 7, 1);
    v.carve(a + 5, a + 7, j + 2, j + 6, 2, 6);
    v.paint(a + 5, a + 7, j + 7, j + 7, 1, 7, 3);
    for (const [dj, k] of [
      [4, 3],
      [4, 5],
      [3, 4],
      [5, 4],
    ]) v.set(a + 7, j + dj, k, 11, 'glow');
    return { i: a, j: j + 4 };
  }
  if (style === 'scope2' || style === 'scope4') {
    const big = style === 'scope4';
    const len = big ? 13 : 9;
    const r = big ? 2 : 1;
    const cj = j + 2 + r;
    for (const ri of [a + 1, a + len - 3]) v.box(ri, ri + 1, j, cj - r - 1, 3, 5, 1);
    v.box(a - 1, a + len, cj - r, cj + r, 4 - r, 4 + r, 1);
    v.box(a - 2, a - 1, cj - r - 1, cj + r + 1, 3 - r, 5 + r, 1);
    v.box(a + len - 1, a + len, cj - r - 1, cj + r + 1, 3 - r, 5 + r, 1);
    v.paint(a + 3, a + 3, cj - r, cj + r, 4 - r, 4 + r, 5);
    v.box(a + len, a + len, cj - r, cj + r, 4 - r, 4 + r, 15, 'glow');
    v.box(a - 2, a - 2, cj - r, cj + r, 4 - r, 4 + r, 12);
    if (big) {
      v.box(a + 5, a + 6, cj + r + 1, cj + r + 2, 4, 4, 3);
      v.box(a + 5, a + 6, cj, cj, 4 + r + 1, 4 + r + 2, 3);
    }
    return { i: a - 2, j: cj };
  }
  // Iron sights: a notch at the back, a glowing post at the front.
  const b = t.i0 + 1;
  const f = t.i1;
  v.box(b, b, j, j + 2, 3, 5, 1);
  v.del(b, j + 2, 4);
  v.box(f, f, j, j + 1, 4, 4, 1);
  v.set(f, j + 2, 4, 11, 'glow');
  return { i: b, j: j + 2 };
}

function mag(v, b, style) {
  const len = Math.max(2, Math.round(b.len * ({ extended: 1.6, quick: 0.75 }[style] || 1)));
  const top = b.j - 1;
  const bot = top - len + 1;
  if (style === 'drum') {
    v.box(b.i0 - 2, b.i1 + 2, bot - 1, top, 1, 7, 25, 'cell');
    for (const [i, j] of [
      [b.i0 - 2, bot - 1],
      [b.i1 + 2, bot - 1],
      [b.i0 - 2, top],
      [b.i1 + 2, top],
    ]) v.carve(i, i, j, j, 1, 7);
    const ci = Math.round((b.i0 + b.i1) / 2);
    const cj = Math.round((bot + top) / 2);
    for (const k of [1, 7]) {
      v.box(ci - 1, ci + 1, cj - 1, cj + 1, k, k, 3, 'cell');
      v.set(ci, cj, k, 7, 'cellGlow');
    }
    return;
  }
  v.box(b.i0, b.i1, bot, top, 2, 6, 25, 'cell');
  v.paint(b.i0, b.i1, bot, bot, 2, 6, 26);
  v.paint(b.i0, b.i1, top, top, 2, 6, 1);
  if (len >= 5) {
    const mid = Math.round((bot + top) / 2);
    v.paint(b.i0, b.i1, mid, mid, 2, 6, 26);
    for (const k of [2, 6]) {
      v.box(b.i0 + 1, b.i1 - 1, bot + 1, mid - 1, k, k, style === 'overcharged' ? 14 : 7, 'cellGlow');
      v.box(b.i0 + 1, b.i1 - 1, mid + 1, top - 1, k, k, 7, 'cellGlow');
    }
  }
  if (style === 'quick') v.box(b.i0 + 1, b.i1 - 1, bot - 1, bot - 1, 4, 4, 9, 'cell');
  if (style === 'overcharged') {
    for (let j = bot; j <= top; j += 2) {
      v.set(b.i1 + 1, j, 3, 16, 'cell');
      v.set(b.i1 + 1, j, 5, 16, 'cell');
    }
  }
}

function stock(v, r, style) {
  const { i, j0, j1 } = r;
  if (style === 'skeleton') {
    v.box(i - 7, i - 1, j0, j1, 3, 5, 2);
    v.carve(i - 6, i - 3, j0 + 2, j1 - 3, 3, 5);
    v.paint(i - 7, i - 1, j0, j0, 3, 5, 1);
    v.box(i - 9, i - 8, j0 - 1, j1, 2, 6, 9);
    for (let j = j0 - 1; j <= j1; j += 2) v.paint(i - 9, i - 9, j, j, 2, 6, 10);
  } else if (style === 'standard') {
    v.box(i - 8, i - 1, j0, j1, 3, 5, 2);
    v.paint(i - 7, i - 2, j0 + 2, j0 + 2, 3, 5, 5);
    v.box(i - 10, i - 9, j0 - 1, j1, 2, 6, 9);
  } else if (style === 'heavy') {
    v.box(i - 9, i - 1, j0 - 1, j1, 2, 6, 2);
    v.box(i - 7, i - 3, j1 + 1, j1 + 2, 3, 5, 9);
    v.paint(i - 8, i - 2, j0 + 1, j0 + 1, 2, 6, 5);
    v.box(i - 11, i - 10, j0 - 2, j1 + 1, 1, 7, 9);
    for (let j = j0 - 2; j <= j1 + 1; j += 2) v.paint(i - 11, i - 11, j, j, 1, 7, 10);
  } else {
    v.box(i - 1, i - 1, j0 + 2, j1 - 2, 3, 5, 1);
  }
}

function under(v, u, style) {
  const { i, j } = u;
  if (style === 'foregrip') {
    v.box(i, i + 3, j - 5, j - 1, 3, 5, 9);
    for (let jj = j - 5; jj <= j - 1; jj += 2) v.paint(i + 3, i + 3, jj, jj, 3, 5, 10);
    return null;
  }
  if (style === 'laser') {
    v.box(i, i + 5, j - 3, j - 1, 3, 5, 1);
    v.paint(i + 1, i + 3, j - 3, j - 3, 3, 5, 5);
    v.set(i + 6, j - 2, 4, 23, 'glow');
    return { i: i + 6, j: j - 2 };
  }
  if (style === 'bipod') {
    v.box(i, i + 1, j - 2, j - 1, 3, 5, 1);
    for (let n = 0; n < 8; n++) {
      const jj = j - 2 - Math.floor(n / 3);
      v.set(i + 2 + n, jj, 2, 1);
      v.set(i + 2 + n, jj, 6, 1);
    }
  }
  return null;
}

// Paint effects: camo blotches, neon edge lines.
function applyPaint(v, paint) {
  const p = PAINTS[paint] || PAINTS.steel;
  if (p.camo) {
    for (const vx of v.map.values()) {
      if (vx.c !== 2) continue;
      const n = Math.sin(vx.i * 0.9 + vx.k * 0.4) + Math.cos(vx.j * 1.1 - vx.i * 0.3);
      if (n > 0.9) vx.c = 5;
      else if (n < -1.1) vx.c = 1;
    }
  }
  if (p.neon) {
    for (const vx of v.map.values()) {
      if (vx.part !== 'body' || (vx.c !== 1 && vx.c !== 2 && vx.c !== 3)) continue;
      if (!v.get(vx.i, vx.j + 1, vx.k)) {
        vx.part = 'glow';
        vx.c = 5;
      }
    }
  }
}

// --- Meshing ---------------------------------------------------------------

const FACES = [
  { n: [1, 0, 0], d: [0, 0, 1], shade: 0.88, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], d: [0, 0, -1], shade: 0.88, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], d: [0, 1, 0], shade: 1, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], d: [0, -1, 0], shade: 0.62, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], d: [-1, 0, 0], shade: 0.8, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], d: [1, 0, 0], shade: 0.8, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

function hash(i, j, k) {
  let h = Math.imul(i + 99, 374761393) ^ Math.imul(j + 99, 668265263) ^ Math.imul(k + 99, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function meshPart(vox, part, pal, place, offsetY) {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const lit = !UNLIT.has(part);
  const base = new THREE.Color();
  for (const v of vox.map.values()) {
    if (v.part !== part) continue;
    const { i, j, k } = v;
    const same = (dj) => {
      const n = vox.get(i, j + dj, k);
      return n && GROUP[n.part] === GROUP[part];
    };
    base.set(pal[v.c] || '#ff00ff');
    let tone = 0.94 + hash(i, j, k) * 0.12;
    if (lit) {
      if (!same(1)) tone *= 1.35;
      else if (!same(-1)) tone *= 0.75;
    }
    const o = place(i, j, k);
    const x0 = o.x - S / 2;
    const y0 = o.y - S / 2 - offsetY;
    const z0 = o.z - S / 2;
    for (const f of FACES) {
      const n = vox.get(i + f.d[0], j + f.d[1], k + f.d[2]);
      if (n && GROUP[n.part] === GROUP[part]) continue;
      const l = Math.pow(lit ? f.shade * tone : tone, 2.2);
      const vi = pos.length / 3;
      for (const c of f.c) {
        pos.push(x0 + c[0] * S, y0 + c[1] * S, z0 + c[2] * S);
        nor.push(f.n[0], f.n[1], f.n[2]);
        col.push(base.r * l, base.g * l, base.b * l);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

const cache = new Map();

function geometries(gunId, build) {
  const key = gunId + '|' + buildCode(build);
  if (cache.has(key)) return cache.get(key);
  const v = new Voxels();
  const a = FRAMES[GUNS[gunId].frame](v);
  const style = (slot) => (build[slot] ? build[slot].split('.')[1] : null);
  let m = a.muzzle;
  if (a.front) m = barrel(v, a, style('barrel') || 'standard');
  if (build.muzzle) m = muzzle(v, m, style('muzzle'));
  const eye = a.top ? sight(v, a.top, style('sight') || 'iron') : null;
  if (a.bottom) mag(v, a.bottom, style('mag') || 'standard');
  if (a.rear) stock(v, a.rear, style('stock') || 'none');
  const laser = a.under && build.under ? under(v, a.under, style('under')) : null;
  const paint = style('paint') || 'steel';
  const core = style('core') || 'ember';
  applyPaint(v, paint);
  const pal = { ...BASE_PAL, ...(PAINTS[paint] || PAINTS.steel), ...(CORES[core] || CORES.ember) };
  // Place every gun so its grip lands in the same spot.
  const place = (i, j, k) => new THREE.Vector3((k - 4) * S, (j - a.grip.j) * S + GRIP.y, -(i - a.grip.i) * S + GRIP.z);
  const spinY = a.spin ? place(0, a.spin.j, 4).y : 0;
  const geo = {};
  for (const part of Object.keys(GROUP)) geo[part] = meshPart(v, part, pal, place, part.startsWith('spin') ? spinY : 0);
  geo.muzzle = place(m.i, m.j, 4);
  geo.muzzle.z += S / 2;
  geo.eye = eye ? place(eye.i, eye.j, 4) : place(a.grip.i + 6, a.grip.j + 12, 4);
  geo.laser = laser ? place(laser.i, laser.j, 4) : null;
  geo.spinY = spinY;
  geo.beamColor = (CORES[core] || CORES.ember).beam;
  cache.set(key, geo);
  return geo;
}

let flashTex = null;
function flashTexture() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.translate(32, 32);
  ctx.fillStyle = 'rgba(255, 170, 70, 0.9)';
  for (let s = 0; s < 8; s++) {
    const ang = (s / 8) * Math.PI * 2;
    const len = s % 2 ? 18 : 31;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang - 0.22) * 6, Math.sin(ang - 0.22) * 6);
    ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
    ctx.lineTo(Math.cos(ang + 0.22) * 6, Math.sin(ang + 0.22) * 6);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
  g.addColorStop(0, 'rgba(255, 255, 245, 1)');
  g.addColorStop(0.4, 'rgba(255, 235, 170, 0.95)');
  g.addColorStop(1, 'rgba(255, 200, 120, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-32, -32, 64, 64);
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}

export function buildGun(gunId, build) {
  build = cleanBuild(gunId, build);
  const geo = geometries(gunId, build);
  const g = new THREE.Group();
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const heat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const beamColor = new THREE.Color(geo.beamColor);
  const flashMat = new THREE.MeshBasicMaterial({
    map: flashTexture(),
    color: beamColor.clone().lerp(new THREE.Color(1, 1, 1), 0.35),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  g.add(new THREE.Mesh(geo.body, solid), new THREE.Mesh(geo.glow, glow));
  const shroud = new THREE.Group();
  shroud.add(new THREE.Mesh(geo.shroud, solid), new THREE.Mesh(geo.heat, heat));
  const cell = new THREE.Group();
  cell.add(new THREE.Mesh(geo.cell, solid), new THREE.Mesh(geo.cellGlow, glow));
  const spin = new THREE.Group();
  spin.position.y = geo.spinY;
  spin.add(new THREE.Mesh(geo.spin, solid), new THREE.Mesh(geo.spinGlow, glow));
  g.add(shroud, cell, spin);
  const muzzleObj = new THREE.Object3D();
  muzzleObj.position.copy(geo.muzzle);
  g.add(muzzleObj);

  const flash = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), flashMat);
  const plume = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.14), flashMat);
  plume.rotation.y = Math.PI / 2;
  plume.position.z = -0.1;
  const plume2 = plume.clone();
  plume2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  flash.add(face, plume, plume2);
  flash.position.copy(geo.muzzle);
  flash.position.z -= 0.02;
  flash.visible = false;
  g.add(flash);

  let laserBeam = null;
  if (geo.laser) {
    laserBeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.006, 6).translate(0, 0, -3),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    laserBeam.position.copy(geo.laser);
    g.add(laserBeam);
  }

  const setHeat = (h) => heat.color.setRGB(0.18 + 0.95 * h, 0.07 + 0.6 * h, 0.05 + 0.25 * h);
  setHeat(0);
  g.userData = {
    gunId,
    build,
    muzzle: muzzleObj,
    cell,
    shroud,
    spin,
    flash,
    laser: laserBeam,
    eye: geo.eye.clone(),
    beamColor,
    setHeat,
    showFlash(on) {
      flash.visible = on;
      if (on) {
        flash.rotation.z = Math.random() * Math.PI;
        flash.scale.setScalar(0.8 + Math.random() * 0.45);
      }
    },
    dispose() {
      for (const mat of [solid, glow, heat, flashMat]) mat.dispose();
      face.geometry.dispose();
      plume.geometry.dispose();
      if (laserBeam) {
        laserBeam.geometry.dispose();
        laserBeam.material.dispose();
      }
    },
  };
  return g;
}

// Kept for older call sites: the starter rifle with its default parts.
export function buildBlaster() {
  return buildGun('ember');
}
