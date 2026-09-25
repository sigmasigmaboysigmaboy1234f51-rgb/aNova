import { B, SEA } from './world.js';
import { mulberry32 } from './rng.js';

// Blockton: the Adventure mode city. A 128 x 128 town on an island with
// a grid of roads, sidewalks and street lamps, and nine city blocks: homes,
// a park, shops and a gas station, downtown towers, the police station, a
// hospital, a stadium and a construction site.

export const CITY_SIZE = 128;
export const GY = 7; // The top of the ground. You stand at y = 8.
export const ROADS = [14, 46, 78, 110];
const HALF = 3; // Asphalt runs from the centre line out 3 blocks each way.
export const LANE = 2; // Cars drive 2 blocks right of the centre line.
const EDGE = 5;

// Which city block is which, by [x index][z index].
const LOTS = [
  ['homes', 'shops', 'hospital'],
  ['park', 'downtown', 'stadium'],
  ['homes2', 'police', 'construction'],
];

export function generateCity(world, seed = 7) {
  world.resize(CITY_SIZE, CITY_SIZE);
  const N = CITY_SIZE;
  const rng = mulberry32(seed);
  world.seed = seed;
  world.theme = null;
  world.data.fill(0);
  const set = (x, y, z, id) => {
    if (x >= 0 && z >= 0 && x < N && z < N && y >= 0 && y < 32) world.data[world.idx(x, y, z)] = id;
  };
  const get = (x, y, z) => world.get(x, y, z);
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, id);
  };
  const info = { lots: {}, parking: [], doors: [], givers: {}, cubes: [], lamps: [], spawn: null, hospital: null, taxi: null };

  // --- Ground: an island with beaches, then grass everywhere ---
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, z, N - 1 - x, N - 1 - z);
      set(x, 0, z, B.BEDROCK);
      if (edge < EDGE) {
        const top = edge < 2 ? 3 : edge < 4 ? 4 : 5;
        fill(x, 1, z, x, top, z, B.SAND);
        continue;
      }
      fill(x, 1, z, x, 5, z, B.STONE);
      set(x, 6, z, B.DIRT);
      set(x, GY, z, edge < EDGE + 1 ? B.SAND : B.GRASS);
    }
  }

  // --- Roads, sidewalks and crossings ---
  const lo = EDGE + 1;
  const hi = N - EDGE - 2;
  const isRoadCentre = (v) => ROADS.includes(v);
  const nearRoad = (v) => ROADS.find((r) => Math.abs(v - r) <= HALF + 2);
  for (let z = lo; z <= hi; z++) {
    for (let x = lo; x <= hi; x++) {
      const rz = nearRoad(z);
      const rx = nearRoad(x);
      if (rz === undefined && rx === undefined) continue;
      const dz = rz === undefined ? 99 : Math.abs(z - rz);
      const dx = rx === undefined ? 99 : Math.abs(x - rx);
      let id = B.SIDEWALK;
      const onX = dz <= HALF; // on a road that runs along x
      const onZ = dx <= HALF;
      if (onX && onZ) id = B.ASPHALT;
      else if (onX) {
        id = B.ASPHALT;
        if (dz === 0 && dx > HALF + 2) id = B.LINE_X;
        if (dx >= HALF + 1 && dx <= HALF + 2) id = B.CROSSWALK;
      } else if (onZ) {
        id = B.ASPHALT;
        if (dx === 0 && dz > HALF + 2) id = B.LINE_Z;
        if (dz >= HALF + 1 && dz <= HALF + 2) id = B.CROSSWALK;
      }
      set(x, GY, z, id);
    }
  }
  // Street lamps along the sidewalks.
  for (const r of ROADS) {
    for (let t = lo + 4; t <= hi - 4; t += 11) {
      if (nearRoad(t) !== undefined) continue;
      for (const side of [-1, 1]) {
        const off = r + side * (HALF + 2);
        lamp(t, off, side, 'x');
        lamp(off, t, side, 'z');
      }
    }
  }
  function lamp(x, z, side, along) {
    if (get(x, GY + 1, z)) return;
    fill(x, GY + 1, z, x, GY + 4, z, B.METAL);
    const ax = along === 'x' ? x : x - side;
    const az = along === 'x' ? z - side : z;
    set(ax, GY + 5, az, B.LAMP);
    set(x, GY + 5, z, B.METAL);
    info.lamps.push([ax, az]);
  }

  // --- Buildings ---
  // A hollow box of walls with window rows, a floor every 4 blocks, a roof
  // and a door on one side ('n', 's', 'e', 'w').
  function building(x0, z0, x1, z1, floors, wall, win, door, roof = B.CONCRETE) {
    const top = GY + floors * 4;
    for (let y = GY + 1; y <= top; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const edgeX = x === x0 || x === x1;
          const edgeZ = z === z0 || z === z1;
          if (!edgeX && !edgeZ) continue;
          const corner = edgeX && edgeZ;
          const ly = (y - GY - 1) % 4;
          const along = edgeX ? z : x;
          let id = wall;
          if (!corner && win && (ly === 1 || ly === 2) && along % 3 !== 0) id = win;
          set(x, y, z, id);
        }
      }
    }
    for (let f = 1; f < floors; f++) fill(x0 + 1, GY + f * 4, z0 + 1, x1 - 1, GY + f * 4, z1 - 1, B.PLANKS);
    fill(x0, top + 1, z0, x1, top + 1, z1, roof);
    fill(x0 + 1, GY, z0 + 1, x1 - 1, GY, z1 - 1, B.PLANKS);
    // The door: a 2 wide, 3 tall gap in the middle of one wall.
    const mx = Math.floor((x0 + x1) / 2);
    const mz = Math.floor((z0 + z1) / 2);
    let dx = mx;
    let dz = mz;
    if (door === 'n') dz = z0;
    else if (door === 's') dz = z1;
    else if (door === 'w') dx = x0;
    else dx = x1;
    for (let y = GY + 1; y <= GY + 3; y++) {
      for (let k = 0; k < 2; k++) {
        if (door === 'n' || door === 's') set(dx + k, y, dz, B.AIR);
        else set(dx, y, dz + k, B.AIR);
      }
    }
    // A step outside the door, and where to stand to knock.
    const out = door === 'n' ? [dx + 1, z0 - 1.5] : door === 's' ? [dx + 1, z1 + 2] : door === 'w' ? [x0 - 1.5, dz + 1] : [x1 + 2, dz + 1];
    return { door: out, top };
  }

  // A pitched roof over a house footprint (runs along x).
  function pitched(x0, z0, x1, z1, base) {
    const d = z1 - z0 + 1;
    for (let k = 0; k <= Math.ceil(d / 2); k++) {
      const za = z0 - 1 + k;
      const zb = z1 + 1 - k;
      if (za > zb) break;
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        set(x, base + k, za, B.ROOF);
        set(x, base + k, zb, B.ROOF);
      }
      if (za === zb || za + 1 === zb) break;
      // Gable ends.
      for (let z = za + 1; z < zb; z++) {
        set(x0, base + k, z, B.SIDING);
        set(x1, base + k, z, B.SIDING);
      }
    }
  }

  // Stairs up through the floors of a building: one flight per level,
  // climbing along +z in column x, with a hole in the floor above.
  function stairs(x, z, levels) {
    for (let i = 0; i + 1 < levels.length; i++) {
      const base = levels[i];
      const top = levels[i + 1];
      const n = top - base;
      for (let k = 0; k < n; k++) set(x, base + 1 + k, z + k, B.PLANKS);
      for (let k = 0; k < n - 1; k++) set(x, top, z + k, B.AIR);
    }
  }

  function tree(x, z, h = 4 + Math.floor(rng() * 2)) {
    if (get(x, GY + 1, z)) return;
    fill(x, GY + 1, z, x, GY + h, z, B.LOG);
    for (let y = GY + h - 1; y <= GY + h + 1; y++) {
      const r = y === GY + h + 1 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r + 1 && !get(x + dx, y, z + dz)) set(x + dx, y, z + dz, B.LEAVES);
    }
  }

  function house(x0, z0, w, d, facing, wall, id) {
    const x1 = x0 + w - 1;
    const z1 = z0 + d - 1;
    const b = building(x0, z0, x1, z1, 1, wall, B.WINDOW, facing, B.PLANKS);
    pitched(x0, z0, x1, z1, b.top + 1);
    info.doors.push({ x: b.door[0], z: b.door[1], id });
    return b;
  }

  // Parking spot: a car will be parked here, facing yaw.
  const park = (x, z, yaw, type) => info.parking.push({ x, z, yaw, type });

  const lots = {
    homes(x0, z0, x1, z1) {
      // Your house, with a driveway and your own car.
      const h = house(x0 + 1, z0 + 1, 8, 7, 's', B.SIDING, 'home');
      info.spawn = { x: h.door[0], z: h.door[1] + 1.5 };
      // The driveway runs out to the road, with your car on it.
      fill(x0 + 10, GY, z0, x0 + 14, GY, z0 + 9, B.CONCRETE);
      park(x0 + 12, z0 + 5, Math.PI, 'player');
      house(x0 + 1, z0 + 12, 8, 8, 'n', B.BRICK, 'maple');
      house(x0 + 12, z0 + 12, 8, 8, 'n', B.SIDING, 'oak');
      tree(x0 + 17, z0 + 3);
      tree(x1 - 1, z0 + 8);
    },
    homes2(x0, z0, x1, z1) {
      house(x0 + 1, z0 + 1, 8, 8, 's', B.BRICK, 'birch');
      house(x0 + 12, z0 + 1, 8, 8, 's', B.SIDING, 'cedar');
      house(x0 + 1, z0 + 12, 9, 8, 'n', B.PLANKS, 'pine');
      house(x0 + 12, z0 + 12, 8, 8, 'n', B.BRICK, 'elm');
      tree(x0 + 10, z0 + 10);
      park(x0 + 10, z0 + 5, 0, 'parked');
    },
    park(x0, z0, x1, z1) {
      // Gravel paths, a pond, a fountain, trees and a playground.
      const mx = Math.floor((x0 + x1) / 2);
      const mz = Math.floor((z0 + z1) / 2);
      for (let t = x0; t <= x1; t++) {
        set(t, GY, mz, B.GRAVEL);
        set(mx, GY, t - x0 + z0, B.GRAVEL);
      }
      // Pond: dig below sea level so the water shows.
      for (let z = z0 + 2; z <= z0 + 7; z++) for (let x = x0 + 2; x <= x0 + 8; x++) {
        const e = (x - x0 - 5) ** 2 / 12 + (z - z0 - 4.5) ** 2 / 7;
        if (e < 1) fill(x, SEA - 1, z, x, GY, z, B.AIR), set(x, SEA - 2, z, B.SAND);
      }
      // Fountain.
      fill(mx - 1, GY + 1, mz - 1, mx + 1, GY + 1, mz + 1, B.MARBLE);
      set(mx, GY + 1, mz, B.AIR);
      fill(mx, GY + 1, mz, mx, GY + 3, mz, B.CRYSTAL);
      // Playground: a slide and a climbing frame in bright colours.
      fill(x1 - 6, GY + 1, z1 - 6, x1 - 6, GY + 3, z1 - 6, B.METAL);
      for (let k = 0; k < 4; k++) set(x1 - 5 + k, GY + 3 - Math.floor(k * 0.7), z1 - 6, B.AWNING);
      fill(x1 - 3, GY + 1, z1 - 3, x1 - 1, GY + 3, z1 - 1, B.METAL);
      fill(x1 - 2, GY + 1, z1 - 2, x1 - 2, GY + 3, z1 - 2, B.AIR);
      for (const [x, z] of [[x0 + 2, z1 - 2], [x0 + 6, z1 - 4], [x1 - 3, z0 + 3], [x1 - 7, z0 + 7], [x0 + 12, z0 + 2], [x0 + 2, z0 + 12]]) tree(x, z);
      // Benches.
      for (const x of [mx - 4, mx + 4]) fill(x, GY + 1, mz + 2, x + 1, GY + 1, mz + 2, B.PLANKS);
      info.givers.park = { x: mx + 3, z: mz - 3 };
      info.givers.cubes = { x: x1 - 5, z: z1 - 2 };
      info.cubes.push([x1 - 2, GY + 4, z1 - 2]);
      info.lots.park = [x0, z0, x1, z1];
    },
    shops(x0, z0, x1, z1) {
      // Tony's Pizza with a striped awning.
      const b = building(x0 + 1, z0 + 1, x0 + 9, z0 + 8, 1, B.BRICK, B.WINDOW, 'e');
      for (let z = z0; z <= z0 + 9; z++) set(x0 + 10, GY + 4, z, B.AWNING);
      info.givers.pizza = { x: b.door[0] + 0.5, z: b.door[1] + 2 };
      // Gas station: a canopy on pillars over pumps, and a little shop.
      const gx = x0 + 3;
      const gz = z0 + 12;
      for (const [x, z] of [[gx, gz], [gx + 8, gz], [gx, gz + 6], [gx + 8, gz + 6]]) fill(x, GY + 1, z, x, GY + 4, z, B.CONCRETE);
      fill(gx - 1, GY + 5, gz - 1, gx + 9, GY + 5, gz + 7, B.METAL);
      for (const x of [gx + 3, gx + 5]) fill(x, GY + 1, gz + 3, x, GY + 2, gz + 3, B.METAL);
      fill(gx - 1, GY, gz - 1, gx + 9, GY, gz + 8, B.ASPHALT);
      building(x1 - 4, z0 + 12, x1, z0 + 17, 1, B.CONCRETE, B.WINDOW, 'w', B.METAL);
      info.givers.race = { x: gx + 4, z: gz + 1 };
      park(gx + 1.5, gz + 5, Math.PI / 2, 'sports');
      info.cubes.push([gx + 4, GY + 6, gz + 3]);
    },
    downtown(x0, z0, x1, z1) {
      // Two glass towers and a concrete one around a small plaza.
      building(x0 + 1, z0 + 1, x0 + 8, z0 + 8, 4, B.GLASS, B.GLASS, 's', B.METAL);
      stairs(x0 + 7, z0 + 2, [GY, GY + 4, GY + 8, GY + 12, GY + 17]);
      building(x1 - 8, z0 + 1, x1 - 1, z0 + 9, 5, B.CONCRETE, B.WINDOW, 's', B.METAL);
      stairs(x1 - 2, z0 + 3, [GY, GY + 4, GY + 8, GY + 12, GY + 16, GY + 21]);
      building(x0 + 1, z1 - 7, x0 + 9, z1 - 1, 3, B.GLASS, B.GLASS, 'e', B.METAL);
      fill(x0 + 11, GY, z0 + 11, x1, GY, z1, B.MARBLE);
      // A taxi stand.
      info.taxi = { x: x1 - 3, z: z1 - 3 };
      info.givers.taxi = { x: x1 - 5, z: z1 - 6 };
      park(x1 - 2.5, z1 - 5, Math.PI, 'taxi');
      tree(x0 + 13, z0 + 13);
      info.cubes.push([x1 - 5, GY + 23, z0 + 5]);
      info.cubes.push([x0 + 4, GY + 18, z0 + 4]);
    },
    police(x0, z0, x1, z1) {
      building(x0 + 1, z0 + 1, x1 - 1, z0 + 9, 2, B.CONCRETE, B.GLASS, 's', B.METAL);
      stairs(x1 - 2, z0 + 3, [GY, GY + 4, GY + 9]);
      // A blue stripe along the front.
      for (let x = x0 + 1; x <= x1 - 1; x++) if (get(x, GY + 4, z0 + 9)) set(x, GY + 4, z0 + 9, B.GLASS);
      fill(x0, GY, z0 + 11, x1, GY, z1, B.ASPHALT);
      for (let x = x0 + 2; x <= x1 - 2; x += 4) for (let z = z0 + 12; z <= z1; z++) if ((z - z0) % 9 !== 0) set(x, GY, z, B.LINE_Z);
      park(x0 + 4, z0 + 15, 0, 'police');
      park(x0 + 8, z0 + 15, 0, 'police');
      park(x0 + 12, z0 + 17, 0, 'parked');
      info.givers.van = { x: x0 + 10, z: z0 + 11.5 };
      info.cubes.push([x0 + 3, GY + 10, z0 + 3]);
    },
    hospital(x0, z0, x1, z1) {
      const b = building(x0 + 2, z0 + 1, x1 - 2, z0 + 11, 2, B.CONCRETE, B.WINDOW, 's', B.CONCRETE);
      // A red cross on the front.
      const mx = Math.floor((x0 + x1) / 2);
      for (let k = -1; k <= 1; k++) {
        set(mx + k, GY + 7, z0 + 11, B.BRICK);
        set(mx, GY + 7 + k, z0 + 11, B.BRICK);
      }
      info.hospital = { x: b.door[0], z: b.door[1] + 1 };
      house(x0 + 1, z1 - 7, 7, 7, 'n', B.SIDING, 'ash');
      house(x1 - 7, z1 - 7, 7, 7, 'n', B.BRICK, 'fir');
      info.cubes.push([x0 + 1, GY + 2, z1]);
    },
    stadium(x0, z0, x1, z1) {
      // A pitch with stands down both sides and floodlights.
      for (let z = z0 + 3; z <= z1 - 3; z++) for (let x = x0 + 4; x <= x1 - 4; x++) set(x, GY, z, (x + z) % 4 < 2 ? B.GRASS : B.DARKGRASS);
      for (let k = 0; k < 3; k++) {
        fill(x0 + k, GY + 1, z0 + 1, x0 + k, GY + 3 - k, z1 - 1, B.CONCRETE);
        fill(x1 - k, GY + 1, z0 + 1, x1 - k, GY + 3 - k, z1 - 1, B.CONCRETE);
      }
      for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) {
        fill(x, GY + 1, z, x, GY + 10, z, B.METAL);
        fill(x - 1, GY + 11, z, x + 1, GY + 11, z, B.LAMP);
      }
      const mx = Math.floor((x0 + x1) / 2);
      for (const z of [z0 + 3, z1 - 3]) {
        fill(mx - 2, GY + 1, z, mx - 2, GY + 3, z, B.SNOW);
        fill(mx + 2, GY + 1, z, mx + 2, GY + 3, z, B.SNOW);
        fill(mx - 2, GY + 3, z, mx + 2, GY + 3, z, B.SNOW);
      }
      info.givers.stadium = { x: mx, z: z0 + 1.5 };
      info.lots.stadium = [x0, z0, x1, z1];
    },
    construction(x0, z0, x1, z1) {
      // A half-built tower in steel, a crane, sand piles and crates.
      for (const [x, z] of [[x0 + 2, z0 + 2], [x0 + 10, z0 + 2], [x0 + 2, z0 + 10], [x0 + 10, z0 + 10]]) fill(x, GY + 1, z, x, GY + 12, z, B.METAL);
      for (const y of [GY + 4, GY + 8, GY + 12]) {
        fill(x0 + 2, y, z0 + 2, x0 + 10, y, z0 + 2, B.METAL);
        fill(x0 + 2, y, z0 + 10, x0 + 10, y, z0 + 10, B.METAL);
        fill(x0 + 2, y, z0 + 2, x0 + 2, y, z0 + 10, B.METAL);
        fill(x0 + 10, y, z0 + 2, x0 + 10, y, z0 + 10, B.METAL);
      }
      for (const y of [GY + 4, GY + 8, GY + 12]) fill(x0 + 3, y, z0 + 3, x0 + 9, y, z0 + 9, B.PLANKS);
      stairs(x0 + 9, z0 + 3, [GY, GY + 4, GY + 8, GY + 12]);
      const cx = x1 - 3;
      const cz = z0 + 4;
      fill(cx, GY + 1, cz, cx, GY + 18, cz, B.GOLD);
      fill(cx - 12, GY + 18, cz, cx + 2, GY + 18, cz, B.GOLD);
      fill(cx - 12, GY + 12, cz, cx - 12, GY + 17, cz, B.METAL);
      for (const [x, z] of [[x0 + 3, z1 - 3], [x0 + 6, z1 - 2]]) {
        for (let y = 0; y < 3; y++) fill(x - 2 + y, GY + 1 + y, z - 2 + y, x + 2 - y, GY + 1 + y, z + 2 - y, B.SAND);
      }
      for (const [x, z] of [[x1 - 6, z1 - 3], [x1 - 4, z1 - 3], [x1 - 5, z1 - 5]]) set(x, GY + 1, z, B.PLANKS);
      set(x1 - 5, GY + 2, z1 - 3, B.PLANKS);
      fill(x0, GY, z0, x1, GY, z1, B.GRAVEL);
      info.givers.site = { x: x0 + 14, z: z1 - 3 };
      info.lots.site = [x0, z0, x1, z1];
      info.cubes.push([cx - 12, GY + 19, cz]);
      info.cubes.push([x0 + 6, GY + 13, z0 + 6]);
    },
  };

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x0 = ROADS[i] + HALF + 3;
      const x1 = ROADS[i + 1] - HALF - 3;
      const z0 = ROADS[j] + HALF + 3;
      const z1 = ROADS[j + 1] - HALF - 3;
      lots[LOTS[i][j]](x0, z0, x1, z1);
    }
  }
  // A few trees on the grass round the edge, and hidden cubes on the beach.
  for (let k = 0; k < 40; k++) {
    const t = Math.floor(rng() * (N - 2 * EDGE - 4)) + EDGE + 2;
    const side = Math.floor(rng() * 4);
    const [x, z] = side === 0 ? [EDGE + 2, t] : side === 1 ? [N - EDGE - 3, t] : side === 2 ? [t, EDGE + 2] : [t, N - EDGE - 3];
    if (get(x, GY, z) === B.GRASS) tree(x, z, 4);
  }
  info.cubes.push([4, 6, 64]);
  info.cubes.push([123, 6, 30]);
  world.markAllDirty();
  return info;
}

// The road network for traffic: intersections and the roads between them.
export function roadNodes() {
  const nodes = [];
  for (let j = 0; j < ROADS.length; j++) for (let i = 0; i < ROADS.length; i++) nodes.push({ i, j, x: ROADS[i] + 0.5, z: ROADS[j] + 0.5 });
  const at = (i, j) => (i < 0 || j < 0 || i >= ROADS.length || j >= ROADS.length ? null : nodes[j * ROADS.length + i]);
  for (const n of nodes) n.next = [at(n.i + 1, n.j), at(n.i - 1, n.j), at(n.i, n.j + 1), at(n.i, n.j - 1)].filter(Boolean);
  return nodes;
}

// The sidewalk loop around each city block, for people to walk.
export function sidewalkLoops() {
  const loops = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      // The inner row of the sidewalk: lamp posts stand on the outer row.
      const a = ROADS[i] + HALF + 1.5;
      const b = ROADS[i + 1] - HALF - 0.5;
      const c = ROADS[j] + HALF + 1.5;
      const d = ROADS[j + 1] - HALF - 0.5;
      loops.push([
        [a, c],
        [b, c],
        [b, d],
        [a, d],
      ]);
    }
  }
  return loops;
}
