import { B, SX, SY, SZ, SEA } from './world.js';

// How each place in the story looks: sky and light, what the ground is
// made of, what grows there, and any big landmarks.

const CX = (SX - 1) / 2;
const CZ = (SZ - 1) / 2;

// Level a square of ground to one height.
function flatten(w, heights, x0, z0, x1, z1, h, top, under = B.DIRT) {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      for (let y = 1; y < SY; y++) {
        const id = y < h - 3 ? B.STONE : y < h - 1 ? under : y === h - 1 ? top : B.AIR;
        w.data[w.idx(x, y, z)] = id;
      }
      heights[z * SX + x] = h;
    }
  }
}

function put(w, x, y, z, id) {
  if (w.inBounds(x, y, z) && y > 0) w.data[w.idx(x, y, z)] = id;
}

function column(w, x, z, y0, y1, id) {
  for (let y = y0; y <= y1; y++) put(w, x, y, z, id);
}

// The Storm Champion's wrestling ring, with stands all around.
function arena(w, heights, rng) {
  const h = SEA + 5;
  flatten(w, heights, 8, 8, SX - 9, SZ - 9, h, B.SAND, B.SAND);
  const r0 = Math.floor(CX) - 6;
  const r1 = Math.floor(CX) + 6;
  for (let z = r0; z <= r1; z++) for (let x = r0; x <= r1; x++) put(w, x, h, z, (x + z) % 2 ? B.MARBLE : B.CRYSTAL);
  for (const [x, z] of [
    [r0, r0],
    [r1, r0],
    [r0, r1],
    [r1, r1],
  ]) column(w, x, z, h + 1, h + 3, B.GOLD);
  // Stands: stepped rows of brick around the edge.
  for (let ring = 0; ring < 3; ring++) {
    const a = 10 + ring;
    const b = SX - 11 - ring;
    for (let i = a; i <= b; i++) {
      for (const [x, z] of [
        [i, a],
        [i, b],
        [a, i],
        [b, i],
      ]) {
        if (Math.abs(x - CX) < 3 || Math.abs(z - CZ) < 3) continue;
        column(w, x, z, h, h + ring, ring === 2 ? B.BRICK : B.PLANKS);
      }
    }
  }
}

// The Golden Overlord's palace: marble walls, gold towers, a throne.
function palace(w, heights, rng) {
  const h = SEA + 5;
  flatten(w, heights, 10, 10, SX - 11, SZ - 11, h, B.MARBLE, B.STONE);
  const a = 14;
  const b = SX - 15;
  for (let i = a; i <= b; i++) {
    for (const [x, z] of [
      [i, a],
      [i, b],
      [a, i],
      [b, i],
    ]) {
      if (Math.abs(x - CX) < 2.5 || Math.abs(z - CZ) < 2.5) continue;
      column(w, x, z, h, h + 2, i % 4 === 0 ? B.GOLD : B.MARBLE);
    }
  }
  for (const [x, z] of [
    [a, a],
    [b, a],
    [a, b],
    [b, b],
  ]) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) column(w, x + dx, z + dz, h, h + 5, B.GOLD);
    put(w, x, h + 6, z, B.CRYSTAL);
  }
  // Throne at the back.
  const tz = a + 3;
  for (let dx = -2; dx <= 2; dx++) column(w, Math.floor(CX) + dx, tz, h, h + (Math.abs(dx) === 2 ? 2 : 4), B.GOLD);
  for (let dx = -1; dx <= 1; dx++) put(w, Math.floor(CX) + dx, h, tz + 1, B.GOLD);
  // A red carpet to the throne.
  for (let z = tz + 2; z < Math.floor(CZ) + 8; z++) put(w, Math.floor(CX), h - 1, z, B.BRICK);
}

// A cone of basalt with a magma crater.
function volcano(w, heights, rng) {
  const cx = Math.floor(CX) + 9;
  const cz = Math.floor(CZ) - 9;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d > 12) continue;
      const base = heights[z * SX + x];
      const top = Math.min(SY - 6, Math.floor(base + (12 - d) * 1.3));
      const crater = d < 3.2;
      for (let y = base; y < top; y++) put(w, x, y, z, crater && y >= top - 2 ? B.MAGMA : B.BASALT);
      if (crater) put(w, x, top - 1, z, B.MAGMA);
      heights[z * SX + x] = Math.max(base, top);
    }
  }
  // Rivers of magma running down the slopes.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rng();
    for (let r = 3; r < 13; r++) {
      const x = Math.round(cx + Math.cos(a) * r);
      const z = Math.round(cz + Math.sin(a) * r);
      if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
      const hh = heights[z * SX + x];
      put(w, x, hh - 1, z, B.MAGMA);
    }
  }
}

// Old sewers: brick channels full of slime.
function sewer(w, heights, rng) {
  const h = SEA + 3;
  flatten(w, heights, 6, 6, SX - 7, SZ - 7, h, B.BRICK, B.STONE);
  for (let k = 0; k < 3; k++) {
    const along = k % 2 === 0;
    const at = 16 + k * 14;
    for (let i = 8; i < SX - 8; i++) {
      for (let off = -1; off <= 1; off++) {
        const x = along ? i : at + off;
        const z = along ? at + off : i;
        put(w, x, h - 1, z, B.SLIME);
        put(w, x, h - 2, z, B.SLIME);
        heights[z * SX + x] = h - 1;
      }
      // Pipe walls with gaps to cross.
      if (i % 9 < 6) {
        for (const off of [-2, 2]) {
          const x = along ? i : at + off;
          const z = along ? at + off : i;
          put(w, x, h, z, B.MOSSY);
        }
      }
    }
  }
}

// Stepped quarry pits cut into stone.
function quarry(w, heights, rng) {
  for (let k = 0; k < 3; k++) {
    const cx = 14 + Math.floor(rng() * (SX - 28));
    const cz = 14 + Math.floor(rng() * (SZ - 28));
    if (Math.hypot(cx - CX, cz - CZ) < 8) continue;
    for (let step = 0; step < 4; step++) {
      const r = 7 - step * 1.6;
      for (let z = Math.floor(cz - r); z <= cz + r; z++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if (!w.inBounds(x, 0, z)) continue;
          const h = heights[z * SX + x];
          const floor = Math.max(SEA + 1, h - step - 1);
          for (let y = floor; y < SY; y++) put(w, x, y, z, B.AIR);
          put(w, x, floor - 1, z, step % 2 ? B.GRAVEL : B.STONE);
          heights[z * SX + x] = floor;
        }
      }
    }
  }
  // Stacks of cut stone.
  for (let i = 0; i < 8; i++) {
    const x = 6 + Math.floor(rng() * (SX - 12));
    const z = 6 + Math.floor(rng() * (SZ - 12));
    if (Math.hypot(x - CX, z - CZ) < 6) continue;
    const h = heights[z * SX + x];
    if (h <= SEA + 1) continue;
    for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) column(w, x + dx, z + dz, h, h + 1 + Math.floor(rng() * 2), B.COBBLE);
  }
}

// Glowing crystals poking out of the ground (the night level's only light).
function crystals(w, heights, rng, n = 10) {
  for (let i = 0; i < n; i++) {
    const x = 4 + Math.floor(rng() * (SX - 8));
    const z = 4 + Math.floor(rng() * (SZ - 8));
    const h = heights[z * SX + x];
    if (h <= SEA + 1 || Math.hypot(x - CX, z - CZ) < 5) continue;
    column(w, x, z, h, h + 1 + Math.floor(rng() * 2), B.CRYSTAL);
  }
}

// light: sky brightness 0..1. top/under/beach: ground layers.
export const THEMES = {
  meadow: { name: 'Mossy Meadows', sky: '#8fc6ea', fog: [42, 118], light: 1, top: B.GRASS, under: B.DIRT, beach: B.SAND, trees: 17, ruins: 5, pillars: 3 },
  ruins: {
    name: 'The Old Ruins',
    sky: '#d8a878',
    fog: [30, 100],
    light: 0.85,
    sun: '#ffc890',
    top: B.GRASS,
    under: B.DIRT,
    beach: B.GRAVEL,
    trees: 8,
    ruins: 16,
    pillars: 8,
  },
  bog: {
    name: 'Gloop Bog',
    sky: '#8aa88a',
    fog: [20, 80],
    fogColor: '#7a987a',
    light: 0.8,
    water: '#4a7a4a',
    top: B.DARKGRASS,
    under: B.DIRT,
    beach: B.SLIME,
    trees: 14,
    deadTrees: true,
    ruins: 2,
    pillars: 0,
    low: 2,
  },
  volcano: {
    name: 'Mount Ember',
    sky: '#c86a48',
    fog: [28, 95],
    fogColor: '#8a4a3a',
    light: 0.8,
    sun: '#ff9a60',
    water: '#ff6a20',
    lava: true,
    top: B.BASALT,
    under: B.BASALT,
    beach: B.GRAVEL,
    trees: 0,
    ruins: 3,
    pillars: 0,
    extra: volcano,
  },
  snow: {
    name: 'Frostpeak',
    sky: '#c8dcec',
    fog: [30, 100],
    fogColor: '#dce8f0',
    light: 1.1,
    water: '#7ab8e0',
    top: B.SNOW,
    under: B.DIRT,
    beach: B.ICE,
    trees: 20,
    snowTrees: true,
    ruins: 2,
    pillars: 0,
  },
  arena: { name: 'The Storm Arena', sky: '#4a3a6a', fog: [40, 120], fogColor: '#3a2e52', light: 0.75, sun: '#c8a4ff', top: B.GRASS, under: B.DIRT, beach: B.SAND, trees: 6, ruins: 0, pillars: 0, extra: arena },
  night: {
    name: 'Nightfall Hollow',
    sky: '#141a30',
    fog: [18, 70],
    fogColor: '#10142a',
    light: 0.38,
    sun: '#8fa8ff',
    moon: true,
    top: B.DARKGRASS,
    under: B.DIRT,
    beach: B.GRAVEL,
    trees: 26,
    ruins: 6,
    pillars: 2,
    extra: (w, h, rng) => crystals(w, h, rng, 14),
  },
  quarry: { name: 'Rumble Quarry', sky: '#b8c0c8', fog: [36, 110], light: 0.95, top: B.GRAVEL, under: B.STONE, beach: B.GRAVEL, trees: 4, ruins: 4, pillars: 0, extra: quarry },
  sewer: {
    name: 'Stinkwater Sewers',
    sky: '#5a6a4a',
    fog: [16, 64],
    fogColor: '#4a5a3a',
    light: 0.6,
    water: '#5a8a2a',
    top: B.MOSSY,
    under: B.STONE,
    beach: B.SLIME,
    trees: 0,
    ruins: 0,
    pillars: 0,
    extra: sewer,
  },
  palace: {
    name: 'The Golden Palace',
    sky: '#f0c878',
    fog: [40, 120],
    fogColor: '#e8c080',
    light: 1.05,
    sun: '#fff0c0',
    top: B.GRASS,
    under: B.DIRT,
    beach: B.SAND,
    trees: 10,
    ruins: 0,
    pillars: 0,
    extra: palace,
  },
};
