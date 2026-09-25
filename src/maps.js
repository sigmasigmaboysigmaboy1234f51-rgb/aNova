import { B, SX, SZ, SEA } from './world.js';
import { THEMES } from './themes.js';

// Handmade arenas for duels. Each builder fills an empty world and returns
// where the players start. Arenas face each other along z.

const MID = Math.floor(SX / 2);

function tools(w) {
  const set = (x, y, z, id) => {
    if (w.inBounds(x, y, z)) w.data[w.idx(x, y, z)] = id;
  };
  const box = (x0, y0, z0, x1, y1, z1, id) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) set(x, y, z, id);
  };
  const ground = (h, top, under = B.DIRT, x0 = 0, z0 = 0, x1 = SX - 1, z1 = SZ - 1) => {
    box(x0, 1, z0, x1, h - 4, z1, B.STONE);
    box(x0, h - 3, z0, x1, h - 2, z1, under);
    box(x0, h - 1, z0, x1, h - 1, z1, top);
  };
  // A hollow tower with stairs spiralling up the inside.
  const tower = (cx, cz, h0, tall, id, cap = B.MOSSY) => {
    box(cx - 3, h0, cz - 3, cx + 3, h0 + tall, cz + 3, id);
    box(cx - 2, h0, cz - 2, cx + 2, h0 + tall, cz + 2, B.AIR);
    for (let y = h0 + 1; y <= h0 + tall; y += 3) {
      set(cx - 3, y + 1, cz, B.AIR);
      set(cx + 3, y + 1, cz, B.AIR);
      set(cx, y + 1, cz - 3, B.AIR);
      set(cx, y + 1, cz + 3, B.AIR);
    }
    const ring = [
      [-2, -2],
      [-1, -2],
      [0, -2],
      [1, -2],
      [2, -2],
      [2, -1],
      [2, 0],
      [2, 1],
      [2, 2],
      [1, 2],
      [0, 2],
      [-1, 2],
      [-2, 2],
      [-2, 1],
      [-2, 0],
      [-2, -1],
    ];
    for (let i = 0; i < tall; i++) {
      const [dx, dz] = ring[i % ring.length];
      set(cx + dx, h0 + i, cz + dz, B.PLANKS);
    }
    box(cx - 3, h0 + tall, cz - 3, cx + 3, h0 + tall, cz + 3, B.PLANKS);
    box(cx - 1, h0 + tall, cz - 1, cx + 1, h0 + tall, cz + 1, B.AIR);
    for (let dx = -3; dx <= 3; dx += 2) {
      set(cx + dx, h0 + tall + 1, cz - 3, cap);
      set(cx + dx, h0 + tall + 1, cz + 3, cap);
      set(cx - 3, h0 + tall + 1, cz + dx, cap);
      set(cx + 3, h0 + tall + 1, cz + dx, cap);
    }
    set(cx, h0, cz - 3, B.AIR);
    set(cx, h0 + 1, cz - 3, B.AIR);
    set(cx, h0, cz + 3, B.AIR);
    set(cx, h0 + 1, cz + 3, B.AIR);
  };
  const tree = (x, h, z) => {
    box(x, h, z, x, h + 3, z, B.LOG);
    box(x - 2, h + 2, z - 2, x + 2, h + 3, z + 2, B.LEAVES);
    box(x - 1, h + 4, z - 1, x + 1, h + 4, z + 1, B.LEAVES);
    set(x, h + 2, z, B.LOG);
    set(x, h + 3, z, B.LOG);
  };
  return { set, box, ground, tower, tree };
}

export const MAPS = {
  towers: {
    name: 'Twin Towers',
    desc: 'Two stone towers across an open field. Climb up for the high ground.',
    theme: 'meadow',
    build(w) {
      const { box, ground, tower, tree } = tools(w);
      const h = SEA + 4;
      ground(h, B.GRASS);
      tower(MID, 14, h, 9, B.COBBLE);
      tower(MID, SZ - 15, h, 9, B.COBBLE);
      // A broken wall down the middle, with gaps to run through.
      for (let x = 12; x < SX - 12; x++) if (x % 8 < 5) box(x, h, MID, x, h + 1 + (x % 3 === 0 ? 1 : 0), MID, B.MOSSY);
      for (const [x, z] of [
        [16, 24],
        [48, 40],
        [20, 44],
        [44, 20],
      ])
        tree(x, h, z);
      box(26, h, 27, 28, h + 1, 27, B.PLANKS);
      box(36, h, 37, 38, h + 1, 37, B.PLANKS);
      return [
        [MID + 0.5, h, 14.5, 0],
        [MID + 0.5, h, SZ - 14.5, Math.PI],
      ];
    },
  },
  bridges: {
    name: 'The Bridges',
    desc: 'Two islands and three narrow bridges. Fall in and you have to swim.',
    theme: 'ruins',
    build(w) {
      const { box, ground } = tools(w);
      const h = SEA + 5;
      ground(SEA - 2, B.SAND, B.SAND);
      for (const z0 of [6, SZ - 20]) {
        box(10, 1, z0, SX - 11, h - 2, z0 + 13, B.STONE);
        box(10, h - 1, z0, SX - 11, h - 1, z0 + 13, B.GRASS);
        for (let x = 14; x < SX - 14; x += 6) box(x, h, z0 + (z0 < MID ? 11 : 2), x + 2, h + 1, z0 + (z0 < MID ? 11 : 2), B.BRICK);
      }
      for (const x of [16, MID, SX - 17]) {
        box(x - 1, h - 1, 20, x + 1, h - 1, SZ - 21, B.PLANKS);
        if (x === MID) box(x - 3, h - 1, MID - 3, x + 3, h - 1, MID + 3, B.PLANKS);
      }
      box(MID - 1, h, MID - 1, MID + 1, h + 1, MID + 1, B.MOSSY);
      return [
        [MID + 0.5, h, 9.5, 0],
        [MID + 0.5, h, SZ - 9.5, Math.PI],
      ];
    },
  },
  pit: {
    name: 'The Pit',
    desc: 'A sunken arena. Fight on the rim or drop down into the middle.',
    theme: 'quarry',
    build(w) {
      const { box, ground, set } = tools(w);
      const h = SEA + 9;
      ground(h, B.GRAVEL, B.STONE);
      for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SX; x++) {
          const d = Math.hypot(x - MID + 0.5, z - MID + 0.5);
          const drop = d < 8 ? 5 : d < 12 ? 4 : d < 16 ? 2 : d < 19 ? 1 : 0;
          for (let k = 0; k < drop; k++) set(x, h - 1 - k, z, B.AIR);
          if (drop) set(x, h - 1 - drop, z, drop >= 4 ? B.COBBLE : B.STONE);
        }
      }
      box(MID - 1, h - 6, MID - 1, MID, h - 2, MID, B.BRICK);
      for (const [x, z] of [
        [MID - 5, MID + 3],
        [MID + 4, MID - 4],
        [MID - 4, MID - 5],
        [MID + 3, MID + 4],
      ])
        box(x, h - 5, z, x + 1, h - 4, z, B.PLANKS);
      return [
        [MID + 0.5, h, 8.5, 0],
        [MID + 0.5, h, SZ - 8.5, Math.PI],
      ];
    },
  },
  castles: {
    name: 'Castle Clash',
    desc: 'Two castles with a river between them. Hold your walls.',
    theme: 'palace',
    build(w) {
      const { box, ground, set } = tools(w);
      const h = SEA + 4;
      ground(h, B.GRASS);
      // The river, with two crossings.
      box(0, SEA - 1, MID - 3, SX - 1, h - 1, MID + 2, B.AIR);
      box(0, SEA - 3, MID - 3, SX - 1, SEA - 2, MID + 2, B.SAND);
      box(18, h - 1, MID - 3, 20, h - 1, MID + 2, B.PLANKS);
      box(SX - 21, h - 1, MID - 3, SX - 19, h - 1, MID + 2, B.PLANKS);
      for (const side of [0, 1]) {
        const z0 = side ? SZ - 20 : 6;
        const z1 = z0 + 13;
        const front = side ? z0 : z1;
        box(18, h, z0, SX - 19, h + 3, z1, B.MARBLE);
        box(19, h, z0 + 1, SX - 20, h + 3, z1 - 1, B.AIR);
        for (let x = 18; x <= SX - 19; x += 2) set(x, h + 4, front, B.GOLD);
        // Gate and a walkway along the front wall.
        box(MID - 1, h, front, MID + 1, h + 2, front, B.AIR);
        box(19, h + 2, front + (side ? 1 : -1), SX - 20, h + 2, front + (side ? 1 : -1), B.PLANKS);
        for (let s = 0; s < 3; s++) set(20 + s, h + s, front + (side ? 1 + s : -1 - s), B.PLANKS);
      }
      return [
        [MID + 0.5, h, 9.5, 0],
        [MID + 0.5, h, SZ - 9.5, Math.PI],
      ];
    },
  },
  snowfort: {
    name: 'Snow Forts',
    desc: 'Build up your fort, then shoot the other one down.',
    theme: 'snow',
    build(w) {
      const { box, ground, tree } = tools(w);
      const h = SEA + 4;
      ground(h, B.SNOW);
      for (const side of [0, 1]) {
        const z = side ? SZ - 18 : 17;
        box(MID - 7, h, z, MID + 7, h + 1, z, B.SNOW);
        box(MID - 7, h, z + (side ? 1 : -1) * 4, MID - 7, h + 1, z, B.SNOW);
        box(MID + 7, h, z + (side ? 1 : -1) * 4, MID + 7, h + 1, z, B.SNOW);
        box(MID - 2, h, z, MID + 2, h, z, B.ICE);
      }
      for (const [x, z] of [
        [12, 20],
        [52, 44],
        [14, 46],
        [50, 18],
        [MID - 12, MID],
        [MID + 12, MID],
      ])
        tree(x, h, z);
      box(MID - 3, h, MID, MID + 3, h + 1, MID, B.ICE);
      return [
        [MID + 0.5, h, 10.5, 0],
        [MID + 0.5, h, SZ - 10.5, Math.PI],
      ];
    },
  },
};

export const MAP_ORDER = Object.keys(MAPS);

// Build a duel map into the world. Returns the spawn points.
export function buildMap(world, id) {
  const map = MAPS[id] || MAPS.towers;
  world.data.fill(0);
  for (const k of [...world.cracks.keys()]) world.clearDamage(k);
  world.damage.clear();
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) world.data[world.idx(x, 0, z)] = B.BEDROCK;
  const spawns = map.build(world);
  world.theme = THEMES[map.theme];
  world.markAllDirty();
  return spawns;
}

