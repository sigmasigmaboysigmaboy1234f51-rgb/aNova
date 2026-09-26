import { B, SEA } from './world.js';
import { mulberry32 } from './rng.js';

// Blockton: the Adventure mode city. A 256 x 256 island town, 64 blocks
// tall, with a 6 x 6 grid of roads (street lamps, traffic lights and
// crossings) around 25 city blocks: a downtown of glass skyscrapers,
// neighbourhoods of houses with porches and gardens, shopping streets,
// apartments, the police and fire stations, a hospital, a school, a mall,
// a hotel, a stadium, a building site, a big park, a car repair shop and
// sandy beaches with a pier.

export const CITY_SIZE = 256;
export const CITY_HEIGHT = 64;
export const GY = 7; // The top of the ground. You stand at y = 8.
export const ROADS = [14, 59, 104, 149, 194, 239];
const HALF = 3; // Asphalt runs from the centre line out 3 blocks each way.
export const LANE = 2; // Cars drive 2 blocks right of the centre line.
const EDGE = 9;

// Which city block is which: LOTS[x index][z index]. North (z = 0) is up
// on the map.
const LOTS = [
  ['home', 'shops', 'park', 'homes', 'school'],
  ['homes', 'apartments', 'office', 'hospital', 'homes'],
  ['police', 'mall', 'downtown', 'tower', 'stadium'],
  ['fire', 'tower', 'hotel', 'apartments', 'construction'],
  ['garage', 'homes', 'shops2', 'homes', 'homes'],
];

// House looks: walls, roof, corner trim.
const HOUSES = [
  { wall: B.SIDING, roof: B.ROOF, trim: B.WOOD_DARK },
  { wall: B.STUCCO, roof: B.ROOF, trim: B.PILLAR },
  { wall: B.BRICK, roof: B.ROOF_DARK, trim: B.STONE_BRICK },
  { wall: B.STUCCO_PEACH, roof: B.ROOF, trim: B.PILLAR },
  { wall: B.STUCCO_MINT, roof: B.ROOF_DARK, trim: B.PILLAR },
  { wall: B.BRICK_DARK, roof: B.ROOF_DARK, trim: B.STONE_BRICK },
  { wall: B.PLANKS, roof: B.ROOF_DARK, trim: B.LOG },
];

export function generateCity(world, seed = 7) {
  world.resize(CITY_SIZE, CITY_SIZE, CITY_HEIGHT);
  const N = CITY_SIZE;
  const TOP = CITY_HEIGHT;
  const rng = mulberry32(seed);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  world.seed = seed;
  world.theme = null;
  world.data.fill(0);
  const set = (x, y, z, id) => {
    if (x >= 0 && z >= 0 && x < N && z < N && y >= 0 && y < TOP) world.data[world.idx(x, y, z)] = id;
  };
  const get = (x, y, z) => world.get(x, y, z);
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, id);
  };
  // The outline of a rectangle at height y.
  const ring = (x0, z0, x1, z1, y, id) => {
    for (let x = x0; x <= x1; x++) {
      set(x, y, z0, id);
      set(x, y, z1, id);
    }
    for (let z = z0; z <= z1; z++) {
      set(x0, y, z, id);
      set(x1, y, z, id);
    }
  };
  const info = { lots: {}, parking: [], doors: [], givers: {}, cubes: [], lamps: [], signs: [], spawn: null, hospital: null, taxi: null, police: null, repair: null };

  // --- Ground: an island with stepped beaches down to the sea ---
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const edge = Math.min(x, z, N - 1 - x, N - 1 - z);
      set(x, 0, z, B.BEDROCK);
      if (edge < EDGE) {
        const top = edge < 3 ? 3 : edge < 5 ? 4 : edge < 7 ? 5 : 6;
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
  const nearRoad = (v) => ROADS.find((r) => Math.abs(v - r) <= HALF + 2);
  for (let z = lo; z <= hi; z++) {
    for (let x = lo; x <= hi; x++) {
      const rz = nearRoad(z);
      const rx = nearRoad(x);
      if (rz === undefined && rx === undefined) continue;
      const dz = rz === undefined ? 99 : Math.abs(z - rz);
      const dx = rx === undefined ? 99 : Math.abs(x - rx);
      let id = B.SIDEWALK;
      const onX = dz <= HALF;
      const onZ = dx <= HALF;
      if (onX && onZ) id = B.ASPHALT;
      else if (onX) {
        id = B.ASPHALT;
        if (dz === 0 && dx > HALF + 2 && x % 4 < 2) id = B.LINE_X;
        if (dx >= HALF + 1 && dx <= HALF + 2) id = B.CROSSWALK;
      } else if (onZ) {
        id = B.ASPHALT;
        if (dx === 0 && dz > HALF + 2 && z % 4 < 2) id = B.LINE_Z;
        if (dz >= HALF + 1 && dz <= HALF + 2) id = B.CROSSWALK;
      }
      set(x, GY, z, id);
    }
  }
  // Street lamps along the sidewalks.
  function lamp(x, z, side, along) {
    if (get(x, GY + 1, z)) return;
    fill(x, GY + 1, z, x, GY + 4, z, B.METAL);
    const ax = along === 'x' ? x : x - side;
    const az = along === 'x' ? z - side : z;
    set(ax, GY + 5, az, B.LAMP);
    set(x, GY + 5, z, B.METAL);
    info.lamps.push([ax, az]);
  }
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

  // --- Building parts ---

  // A sign painted on a board, facing the street ('n', 's', 'e' or 'w').
  // (x, z) is the outside face of the wall it hangs on.
  function sign(lines, bg, fg, w, h, x, y, z, facing) {
    const ry = facing === 's' ? 0 : facing === 'n' ? Math.PI : facing === 'e' ? Math.PI / 2 : -Math.PI / 2;
    info.signs.push({ lines, bg, fg, w, h, x, y, z, ry });
  }

  // The outside face of a wall block, for hanging a sign on.
  const face = (x, z, facing) => (facing === 's' ? [x + 0.5, z + 1.03] : facing === 'n' ? [x + 0.5, z - 0.03] : facing === 'e' ? [x + 1.03, z + 0.5] : [x - 0.03, z + 0.5]);

  // A building: walls with rows of windows, floor bands, a flat roof with a
  // parapet, and a doorway. Walls run x0..x1, z0..z1 (inclusive).
  // Options: floors, fh (floor height), wall, win, corner, band, lobby (the
  // ground floor's front), every (a plain wall block every n windows),
  // door ('n', 's', 'e', 'w' or null), doorW, shut (a real door instead of
  // a gap), roof, parapet (false for none), base (for towers on towers).
  function building(x0, z0, x1, z1, floors, o = {}) {
    const fh = o.fh || 4;
    const base = o.base ?? GY + 1;
    const top = base + floors * fh - 1;
    const wall = o.wall ?? B.CONCRETE;
    const win = o.win === undefined ? B.WIN_FRAME : o.win;
    const corner = o.corner ?? wall;
    const band = o.band ?? null;
    const every = o.every ?? 3;
    const door = o.door === undefined ? 's' : o.door;
    const ground = base === GY + 1;
    for (let y = base; y <= top; y++) {
      const ly = (y - base) % fh;
      const first = ground && y - base < fh;
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const ex = x === x0 || x === x1;
          const ez = z === z0 || z === z1;
          if (!ex && !ez) continue;
          const along = ex ? z - z0 : x - x0;
          let id = wall;
          if (ex && ez) id = corner;
          else if (band && ly === fh - 1) id = band;
          else if (first && o.lobby && ly < fh - 1) id = o.lobby;
          else if (win && ly >= 1 && ly <= fh - 2 && (every === 0 || along % every !== 0)) id = win;
          set(x, y, z, id);
        }
      }
    }
    if (o.floorsInside !== false) for (let f = 1; f < floors; f++) fill(x0 + 1, base - 1 + f * fh, z0 + 1, x1 - 1, base - 1 + f * fh, z1 - 1, B.PLANKS);
    if (ground) fill(x0 + 1, GY, z0 + 1, x1 - 1, GY, z1 - 1, o.floor ?? B.TILES);
    fill(x0, top + 1, z0, x1, top + 1, z1, o.roof ?? B.TAR);
    if (o.parapet !== false) ring(x0, z0, x1, z1, top + 2, o.parapet ?? corner);
    // The doorway, in the middle of one wall.
    const mx = Math.floor((x0 + x1) / 2);
    const mz = Math.floor((z0 + z1) / 2);
    let dx = mx;
    let dz = mz;
    if (door === 'n') dz = z0;
    else if (door === 's') dz = z1;
    else if (door === 'w') dx = x0;
    else dx = x1;
    const dw = o.doorW || 2;
    if (ground && door) {
      for (let y = GY + 1; y <= GY + (o.doorH || 3); y++) {
        for (let k = 0; k < dw; k++) {
          const px = door === 'n' || door === 's' ? dx + k : dx;
          const pz = door === 'n' || door === 's' ? dz : dz + k;
          set(px, y, pz, o.shut ? (y === GY + 1 ? B.DOOR_LOW : y === GY + 2 ? B.DOOR_HIGH : wall) : B.AIR);
        }
      }
    }
    const out = door === 'n' ? [dx + dw / 2, z0 - 1.5] : door === 's' ? [dx + dw / 2, z1 + 2] : door === 'w' ? [x0 - 1.5, dz + dw / 2] : [x1 + 2, dz + dw / 2];
    return { top: top + 1, roofY: top + 2, door: out, dx, dz };
  }

  // Things on a flat roof: air vents, a water tower, an antenna, a helipad.
  function roofTop(x0, z0, x1, z1, y, o = {}) {
    const w = x1 - x0;
    const d = z1 - z0;
    if (o.helipad) {
      const cx = Math.floor((x0 + x1) / 2);
      const cz = Math.floor((z0 + z1) / 2);
      fill(cx - 2, y - 1, cz - 2, cx + 2, y - 1, cz + 2, B.HELIPAD);
    }
    if (w >= 5 && d >= 5 && o.vents !== false) {
      for (const [fx, fz] of [[0.25, 0.25], [0.7, 0.3], [0.3, 0.72]]) {
        const x = x0 + Math.floor(w * fx);
        const z = z0 + Math.floor(d * fz);
        if (o.helipad && Math.abs(x - (x0 + x1) / 2) < 4 && Math.abs(z - (z0 + z1) / 2) < 4) continue;
        fill(x, y, z, x + 1, y, z, B.VENT);
      }
    }
    if (o.water && w >= 8) {
      const x = x1 - 4;
      const z = z1 - 4;
      for (const [a, b] of [[0, 0], [2, 0], [0, 2], [2, 2]]) fill(x + a, y, z + b, x + a, y + 2, z + b, B.METAL);
      fill(x, y + 3, z, x + 2, y + 5, z + 2, B.WOOD_DARK);
      fill(x, y + 6, z, x + 2, y + 6, z + 2, B.ROOF_DARK);
    }
    if (o.antenna) {
      const x = Math.floor((x0 + x1) / 2);
      const z = Math.floor((z0 + z1) / 2);
      fill(x, y, z, x, Math.min(TOP - 2, y + o.antenna), z, B.METAL);
      set(x, Math.min(TOP - 1, y + o.antenna + 1), z, B.LAMP);
    }
  }

  // A pitched roof over a footprint, the ridge running along x.
  function pitched(x0, z0, x1, z1, base, roof, gable) {
    const d = z1 - z0 + 1;
    for (let k = 0; k <= Math.ceil(d / 2); k++) {
      const za = z0 - 1 + k;
      const zb = z1 + 1 - k;
      if (za > zb) break;
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        set(x, base + k, za, roof);
        set(x, base + k, zb, roof);
      }
      if (za === zb || za + 1 === zb) break;
      for (let z = za + 1; z < zb; z++) {
        set(x0, base + k, z, gable);
        set(x1, base + k, z, gable);
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

  // A palm tree for the beach.
  function palm(x, z, y) {
    const h = 5 + Math.floor(rng() * 2);
    fill(x, y, z, x, y + h, z, B.LOG);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      set(x + dx, y + h, z + dz, B.LEAVES);
      set(x + dx * 2, y + h - 1, z + dz * 2, B.LEAVES);
    }
    set(x, y + h + 1, z, B.LEAVES);
  }

  const hedge = (x0, z0, x1, z1) => fill(x0, GY + 1, z0, x1, GY + 1, z1, B.HEDGE);
  const flowers = (x0, z0, x1, z1) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (get(x, GY, z) === B.GRASS && !get(x, GY + 1, z)) set(x, GY, z, B.FLOWERS);
  };
  const bench = (x, z, alongX) => (alongX ? fill(x, GY + 1, z, x + 1, GY + 1, z, B.WOOD_DARK) : fill(x, GY + 1, z, x, GY + 1, z + 1, B.WOOD_DARK));
  // A ramp you can drive up and jump off, going in direction +x or +z.
  function ramp(x, z, dir, width = 3, h = 3) {
    for (let k = 0; k < h; k++) {
      for (let w = 0; w < width; w++) {
        const px = dir === 'x' ? x + k : x + w;
        const pz = dir === 'x' ? z + w : z + k;
        fill(px, GY + 1, pz, px, GY + 1 + k, pz, B.HAZARD);
      }
    }
  }
  const park = (x, z, yaw, type) => info.parking.push({ x, z, yaw, type });
  const N_ = 0;
  const S_ = Math.PI;
  const E_ = Math.PI / 2;
  const W_ = -Math.PI / 2;

  // A house with a porch, a door, framed windows, a pitched roof and a
  // chimney. It faces 'n' or 's'. id names it for pizza deliveries.
  function house(x0, z0, w, d, facing, st, id, floors = 1) {
    const x1 = x0 + w - 1;
    const z1 = z0 + d - 1;
    const b = building(x0, z0, x1, z1, floors, { wall: st.wall, win: B.WIN_FRAME, corner: st.trim, every: 3, door: facing, shut: true, roof: B.PLANKS, parapet: false, floor: B.PLANKS, floorsInside: true });
    pitched(x0, z0, x1, z1, b.top + 1, st.roof, st.wall);
    // Chimney.
    const cz = facing === 's' ? z0 + 2 : z1 - 2;
    fill(x1 - 2, b.top + 1, cz, x1 - 2, b.top + Math.ceil(d / 2) + 2, cz, B.BRICK);
    // Porch: a wooden deck, two posts and a little roof.
    const px = b.dx - 1;
    const pz0 = facing === 's' ? z1 + 1 : z0 - 2;
    fill(px, GY, pz0, px + 3, GY, pz0 + 1, B.WOOD_DARK);
    const pz = facing === 's' ? pz0 + 1 : pz0;
    fill(px, GY + 1, pz, px, GY + 3, pz, B.PILLAR);
    fill(px + 3, GY + 1, pz, px + 3, GY + 3, pz, B.PILLAR);
    fill(px, GY + 4, pz0, px + 3, GY + 4, pz0 + 1, st.roof);
    // Flower beds along the front.
    const fz = facing === 's' ? z1 + 1 : z0 - 1;
    flowers(x0, fz, px - 1, fz);
    flowers(px + 4, fz, x1, fz);
    info.doors.push({ x: b.door[0], z: b.door[1] + (facing === 's' ? 0.5 : -0.5), id });
    return b;
  }

  // A shop: a glass front, a door, a striped awning and a sign.
  function shop(x0, z0, x1, z1, facing, name, colors, wall, floors = 2) {
    const b = building(x0, z0, x1, z1, floors, { wall, win: B.WIN_FRAME, lobby: B.SHOP_WIN, band: B.STONE_BRICK, door: facing, every: 3, roof: B.TAR });
    // Awning over the front, one block out.
    const y = GY + 4;
    if (facing === 'n' || facing === 's') {
      const z = facing === 'n' ? z0 - 1 : z1 + 1;
      for (let x = x0; x <= x1; x++) set(x, y, z, B.AWNING);
      const [sx, sz] = face(Math.floor((x0 + x1) / 2), facing === 'n' ? z0 : z1, facing);
      sign([[name, 40]], colors[0], colors[1], Math.min(x1 - x0 - 1, 9), 1.3, sx + ((x1 - x0) % 2 ? 0.5 : 0), GY + 5.8, sz, facing);
    } else {
      const x = facing === 'w' ? x0 - 1 : x1 + 1;
      for (let z = z0; z <= z1; z++) set(x, y, z, B.AWNING);
      const [sx, sz] = face(facing === 'w' ? x0 : x1, Math.floor((z0 + z1) / 2), facing);
      sign([[name, 40]], colors[0], colors[1], Math.min(z1 - z0 - 1, 9), 1.3, sx, GY + 5.8, sz + ((z1 - z0) % 2 ? 0.5 : 0), facing);
    }
    roofTop(x0, z0, x1, z1, b.roofY, { vents: true });
    return b;
  }

  // A glass skyscraper: tiers that step in as they go up.
  function tower(x0, z0, x1, z1, tiers, o) {
    let base = GY + 1;
    let tx0 = x0;
    let tz0 = z0;
    let tx1 = x1;
    let tz1 = z1;
    let b = null;
    tiers.forEach(([floors, inset], i) => {
      tx0 += inset;
      tz0 += inset;
      tx1 -= inset;
      tz1 -= inset;
      b = building(tx0, tz0, tx1, tz1, floors, { ...o, base, door: i === 0 ? o.door : null, parapet: o.parapet ?? B.METAL, floorsInside: false, every: o.every ?? 0 });
      base = b.top + 1;
    });
    return { ...b, x0: tx0, z0: tz0, x1: tx1, z1: tz1 };
  }

  // Driveway (or car park) paving.
  const pave = (x0, z0, x1, z1, id = B.CONCRETE) => fill(x0, GY, z0, x1, GY, z1, id);

  // --- The city blocks ---
  const lots = {
    // Your house, the neighbours, and your car in the driveway.
    home(x0, z0, x1, z1) {
      const h = house(x0 + 2, z0 + 4, 11, 9, 'n', HOUSES[0], 'home');
      info.spawn = { x: h.door[0], z: h.door[1] - 1 };
      pave(x0 + 14, z0 - 1, x0 + 18, z0 + 10);
      park(x0 + 16, z0 + 6, S_, 'player');
      house(x0 + 20, z0 + 4, 11, 9, 'n', HOUSES[3], 'maple', 2);
      house(x0 + 2, z1 - 12, 12, 9, 's', HOUSES[2], 'oak');
      house(x0 + 20, z1 - 12, 11, 9, 's', HOUSES[4], 'rose');
      // Back gardens: hedges, trees, and a pool behind your house.
      hedge(x0 + 1, z0 + 16, x1 - 1, z0 + 16);
      fill(x0 + 4, SEA, z0 + 14, x0 + 9, GY, z0 + 15, B.AIR);
      ring(x0 + 3, z0 + 13, x0 + 10, z0 + 16, GY, B.TILES);
      tree(x0 + 13, z0 + 14);
      tree(x1 - 3, z0 + 13);
      info.cubes.push([x0 + 12, GY + 1, z0 + 15]);
    },
    homes(x0, z0, x1, z1, i, j) {
      const r = mulberry32(i * 31 + j * 7);
      const st = () => HOUSES[Math.floor(r() * HOUSES.length)];
      const names = ['birch', 'cedar', 'pine', 'elm', 'ash', 'fir', 'willow', 'aspen', 'poplar', 'hazel', 'holly', 'ivy', 'laurel', 'maple2', 'olive', 'plum'];
      let n = (i * 5 + j) * 4;
      const nm = () => names[n++ % names.length];
      house(x0 + 2, z0 + 4, 11, 9, 'n', st(), nm(), r() < 0.4 ? 2 : 1);
      house(x0 + 20, z0 + 4, 11, 9, 'n', st(), nm(), r() < 0.4 ? 2 : 1);
      house(x0 + 2, z1 - 12, 11, 9, 's', st(), nm(), r() < 0.4 ? 2 : 1);
      house(x0 + 20, z1 - 12, 12, 9, 's', st(), nm(), r() < 0.4 ? 2 : 1);
      pave(x0 + 14, z0 - 1, x0 + 18, z0 + 10);
      pave(x0 + 14, z1 - 10, x0 + 18, z1 + 1);
      if (r() < 0.7) park(x0 + 16, z0 + 6, S_, 'parked');
      if (r() < 0.7) park(x0 + 16, z1 - 5, N_, 'parked');
      hedge(x0 + 1, z0 + 16, x0 + 13, z0 + 16);
      hedge(x0 + 19, z1 - 16, x1 - 1, z1 - 16);
      tree(x0 + 8, z0 + 15);
      tree(x1 - 6, z0 + 18);
      tree(x0 + 16, z0 + 17);
      if (r() < 0.5) {
        fill(x1 - 11, SEA, z0 + 14, x1 - 7, GY, z0 + 15, B.AIR);
        ring(x1 - 12, z0 + 13, x1 - 6, z0 + 16, GY, B.TILES);
      }
    },
    // Tony's Pizza and friends, and the gas station.
    shops(x0, z0, x1, z1) {
      const pz = shop(x0 + 1, z0 + 1, x0 + 10, z0 + 9, 'n', "TONY'S PIZZA", ['#d8392b', '#fff6e0'], B.BRICK);
      info.givers.pizza = { x: pz.door[0], z: pz.door[1] - 1 };
      shop(x0 + 12, z0 + 1, x0 + 21, z0 + 9, 'n', 'BURGER BLOCK', ['#f2c230', '#5a2a10'], B.STUCCO_PEACH);
      shop(x0 + 23, z0 + 1, x1 - 1, z0 + 9, 'n', 'COMIC CUBES', ['#3d6fd8', '#ffffff'], B.STUCCO_MINT);
      // Gas station: a canopy on posts over the pumps, and a shop.
      const gx = x0 + 3;
      const gz = z0 + 16;
      pave(x0, z0 + 12, x1, z1, B.ASPHALT);
      for (const [x, z] of [[gx, gz], [gx + 12, gz], [gx, gz + 8], [gx + 12, gz + 8]]) fill(x, GY + 1, z, x, GY + 4, z, B.PILLAR);
      fill(gx - 1, GY + 5, gz - 1, gx + 13, GY + 5, gz + 9, B.METAL);
      ring(gx - 1, gz - 1, gx + 13, gz + 9, GY + 6, B.RED_PANEL);
      for (const x of [gx + 4, gx + 8]) {
        fill(x, GY + 1, gz + 4, x, GY + 2, gz + 4, B.METAL);
        set(x, GY + 3, gz + 4, B.LAMP);
      }
      const [sx, sz] = face(gx + 6, gz - 1, 'n');
      sign([['BLOCK GAS', 44]], '#d8392b', '#ffffff', 7, 1.2, sx, GY + 6.1, sz, 'n');
      shop(x1 - 9, z0 + 14, x1 - 1, z0 + 22, 'w', 'MINI MART', ['#3f9a55', '#ffffff'], B.CONCRETE, 1);
      info.givers.race = { x: gx + 6, z: gz + 2 };
      park(gx + 2, gz + 6, E_, 'sports');
      info.cubes.push([gx + 6, GY + 7, gz + 4]);
    },
    // More shops round a car park, and the bank.
    shops2(x0, z0, x1, z1) {
      shop(x0 + 1, z0 + 1, x0 + 10, z0 + 9, 'n', 'TOY TOWN', ['#ff5a8a', '#ffffff'], B.STUCCO);
      shop(x0 + 12, z0 + 1, x0 + 21, z0 + 9, 'n', 'CAFE CUBE', ['#6a4428', '#fff6e0'], B.BRICK_DARK);
      shop(x0 + 23, z0 + 1, x1 - 1, z0 + 9, 'n', 'ARCADE', ['#b46cff', '#ffe14a'], B.STUCCO_MINT);
      const bank = building(x0 + 1, z1 - 12, x0 + 16, z1 - 1, 3, { wall: B.STONE_BRICK, win: B.WIN_FRAME, lobby: B.PILLAR, corner: B.PILLAR, band: B.STONE_BRICK, door: 's', every: 2 });
      const [bx, bz] = face(x0 + 8, z1 - 1, 's');
      sign([['BANK OF BLOCKTON', 36]], '#1e3160', '#f2c230', 10, 1.2, bx + 0.5, GY + 4.6, bz, 's');
      roofTop(x0 + 1, z1 - 12, x0 + 16, z1 - 1, bank.roofY, { vents: true });
      shop(x0 + 19, z1 - 10, x1 - 1, z1 - 1, 's', 'PETS', ['#f2c230', '#1a1a1c'], B.SIDING);
      pave(x0 + 1, z0 + 11, x1 - 1, z1 - 14, B.ASPHALT);
      for (let x = x0 + 3; x < x1 - 2; x += 4) for (let z = z0 + 13; z <= z1 - 16; z += 6) set(x, GY, z, B.LINE_Z);
      park(x0 + 5, z0 + 15, N_, 'parked');
      park(x0 + 21, z0 + 15, N_, 'parked');
    },
    // A big park: pond, paths, fountain, playground, flowers and a skate park.
    park(x0, z0, x1, z1) {
      const mx = Math.floor((x0 + x1) / 2);
      const mz = Math.floor((z0 + z1) / 2);
      for (let t = x0; t <= x1; t++) {
        set(t, GY, mz, B.GRAVEL);
        set(t, GY, mz + 1, B.GRAVEL);
      }
      for (let t = z0; t <= z1; t++) {
        set(mx, GY, t, B.GRAVEL);
        set(mx + 1, GY, t, B.GRAVEL);
      }
      // Pond.
      for (let z = z0 + 2; z <= z0 + 11; z++) {
        for (let x = x0 + 2; x <= x0 + 13; x++) {
          const e = (x - x0 - 7.5) ** 2 / 30 + (z - z0 - 6.5) ** 2 / 20;
          if (e < 1) fill(x, SEA - 1, z, x, GY, z, B.AIR), set(x, SEA - 2, z, B.SAND);
        }
      }
      // Fountain.
      ring(mx - 2, mz - 2, mx + 3, mz + 3, GY + 1, B.MARBLE);
      fill(mx - 1, GY, mz - 1, mx + 2, GY, mz + 2, B.MARBLE);
      fill(mx, GY + 1, mz, mx + 1, GY + 3, mz + 1, B.MARBLE);
      set(mx, GY + 4, mz, B.CRYSTAL);
      // Playground: a slide and a climbing frame (with a golden cube in it).
      const px = x1 - 10;
      const pz = z1 - 10;
      fill(px, GY + 1, pz, px, GY + 3, pz, B.METAL);
      for (let k = 0; k < 4; k++) set(px + 1 + k, GY + 3 - Math.floor(k * 0.7), pz, B.AWNING);
      fill(px + 5, GY + 1, pz + 4, px + 7, GY + 3, pz + 6, B.METAL);
      fill(px + 6, GY + 1, pz + 5, px + 6, GY + 3, pz + 5, B.AIR);
      fill(px - 1, GY, pz - 1, px + 8, GY, pz + 7, B.SAND);
      // Skate park: ramps you can jump a car off.
      fill(x0 + 2, GY, z1 - 12, x0 + 13, GY, z1 - 2, B.CONCRETE);
      ramp(x0 + 3, z1 - 9, 'x');
      ramp(x0 + 9, z1 - 5, 'z', 3, 2);
      for (const [x, z] of [[x0 + 16, z0 + 3], [x0 + 3, mz + 5], [x1 - 3, z0 + 3], [x1 - 8, z0 + 9], [x0 + 20, z0 + 12], [x1 - 3, mz - 4], [x0 + 22, z1 - 3], [x0 + 16, z1 - 14]]) tree(x, z);
      flowers(mx - 5, mz - 5, mx - 3, mz - 3);
      flowers(mx + 4, mz + 4, mx + 6, mz + 6);
      flowers(mx + 4, mz - 5, mx + 6, mz - 3);
      bench(mx - 4, mz + 4, true);
      bench(mx + 4, mz - 4, true);
      info.givers.park = { x: mx + 4, z: mz - 1 };
      info.givers.cubes = { x: px + 2, z: pz + 3 };
      info.cubes.push([px + 6, GY + 4, pz + 5]);
      info.lots.park = [x0, z0, x1, z1];
    },
    // Downtown: the tallest towers in town round a plaza, and the taxi rank.
    downtown(x0, z0, x1, z1) {
      pave(x0, z0, x1, z1, B.TILES);
      const a = tower(x0 + 1, z0 + 1, x0 + 15, z0 + 15, [[10, 0], [2, 2], [1, 2]], { wall: B.GLASS_DARK, win: B.GLASS_DARK, band: B.GLASS_DARK, corner: B.METAL, lobby: B.SHOP_WIN, door: 's' });
      roofTop(a.x0, a.z0, a.x1, a.z1, a.roofY, { vents: false, antenna: 4 });
      info.cubes.push([a.x0 + 1, a.roofY, a.z0 + 1]);
      const b = tower(x1 - 13, z0 + 1, x1 - 1, z0 + 19, [[8, 0], [3, 2]], { wall: B.GLASS_BLUE, win: B.GLASS_BLUE, band: B.METAL, corner: B.METAL, lobby: B.SHOP_WIN, door: 's' });
      roofTop(b.x0, b.z0, b.x1, b.z1, b.roofY, { helipad: true, vents: false });
      const [sx, sz] = face(x0 + 8, z0 + 15, 's');
      sign([['BLOCKTON TOWER', 36]], '#1a1a1c', '#f2c230', 8, 1.1, sx - 0.5, GY + 5.2, sz, 's');
      // The plaza: a fountain, trees in planters, benches.
      const fx = x0 + 10;
      const fz = z1 - 9;
      ring(fx - 2, fz - 2, fx + 2, fz + 2, GY + 1, B.MARBLE);
      set(fx, GY + 1, fz, B.MARBLE);
      set(fx, GY + 2, fz, B.CRYSTAL);
      for (const [x, z] of [[x0 + 3, z1 - 3], [x0 + 18, z1 - 3], [x0 + 3, z0 + 20], [x0 + 18, z0 + 22]]) {
        ring(x - 1, z - 1, x + 1, z + 1, GY + 1, B.STONE_BRICK);
        set(x, GY, z, B.GRASS);
        tree(x, z, 4);
      }
      bench(fx - 5, fz, false);
      bench(fx + 5, fz, false);
      info.taxi = { x: x1 - 3, z: z1 - 3 };
      info.givers.taxi = { x: x1 - 6, z: z1 - 7 };
      info.givers.webs = { x: fx + 1, z: fz - 4 };
      park(x1 - 2.5, z1 - 6, S_, 'taxi');
    },
    // Offices: a stone and glass tower.
    office(x0, z0, x1, z1) {
      const t = tower(x0 + 6, z0 + 5, x1 - 6, z1 - 7, [[9, 0], [3, 3]], { wall: B.CONCRETE, win: B.WIN_FRAME, band: B.STONE_BRICK, corner: B.STONE_BRICK, lobby: B.SHOP_WIN, door: 's', every: 3 });
      roofTop(t.x0, t.z0, t.x1, t.z1, t.roofY, { antenna: 5, vents: true });
      pave(x0, z1 - 6, x1, z1, B.TILES);
      const [sx, sz] = face(Math.floor((x0 + x1) / 2), z1 - 7, 's');
      sign([['CUBE CORP', 44]], '#2a2b2e', '#ffffff', 6, 1.1, sx, GY + 5.2, sz, 's');
      for (const x of [x0 + 2, x1 - 2]) for (const z of [z0 + 3, z1 - 10]) tree(x, z);
      info.cubes.push([t.x0 + 1, t.roofY, t.z1 - 1]);
    },
    // A glass skyscraper.
    tower(x0, z0, x1, z1, i, j) {
      const blue = (i + j) % 2 === 0;
      const t = tower(x0 + 5, z0 + 5, x1 - 5, z1 - 5, blue ? [[9, 0], [3, 3]] : [[7, 0], [3, 2], [2, 2]], { wall: blue ? B.GLASS_BLUE : B.CONCRETE, win: blue ? B.GLASS_BLUE : B.GLASS_DARK, band: blue ? B.METAL : B.CONCRETE, corner: B.METAL, lobby: B.SHOP_WIN, door: 's', every: blue ? 0 : 4 });
      roofTop(t.x0, t.z0, t.x1, t.z1, t.roofY, { antenna: blue ? 0 : 4, water: blue, vents: true });
      pave(x0, z0, x1, z1, B.TILES);
      fill(x0 + 5, GY, z0 + 5, x1 - 5, GY, z1 - 5, B.TILES);
      for (const [x, z] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]]) {
        set(x, GY, z, B.GRASS);
        tree(x, z, 4);
      }
    },
    // Two blocks of flats with balconies, round a courtyard.
    apartments(x0, z0, x1, z1, i, j) {
      const walls = [B.STUCCO, B.STUCCO_PEACH, B.BRICK, B.STUCCO_MINT];
      for (const [k, bz0, bz1, door] of [[0, z0 + 1, z0 + 11, 'n'], [1, z1 - 11, z1 - 1, 's']]) {
        const wall = walls[(i + j + k) % walls.length];
        const bx0 = x0 + 2;
        const bx1 = x1 - 2;
        const floors = 6 + ((i + k) % 3);
        const b = building(bx0, bz0, bx1, bz1, floors, { wall, win: k ? B.CURTAIN_WIN : B.WIN_FRAME, band: B.CONCRETE, corner: B.CONCRETE, lobby: B.SHOP_WIN, door, every: 3, floorsInside: false });
        // Balconies on the street side.
        const bzOut = door === 'n' ? bz0 - 1 : bz1 + 1;
        for (let f = 1; f < floors; f++) {
          const y = GY + f * 4;
          for (let x = bx0 + 2; x <= bx1 - 2; x += 5) {
            fill(x, y, bzOut, x + 2, y, bzOut, B.CONCRETE);
            fill(x, y + 1, bzOut, x + 2, y + 1, bzOut, B.GLASS);
          }
        }
        roofTop(bx0, bz0, bx1, bz1, b.roofY, { water: k === 0, vents: true });
      }
      // Courtyard.
      fill(x0 + 1, GY, z0 + 13, x1 - 1, GY, z1 - 13, B.GRASS);
      for (let x = x0 + 4; x < x1 - 2; x += 7) tree(x, Math.floor((z0 + z1) / 2));
      bench(x0 + 7, z0 + 14, true);
      park(x1 - 2, z0 + 17, N_, 'parked');
    },
    // Hospital: white walls, a red cross and a helipad on the roof.
    hospital(x0, z0, x1, z1) {
      const b = building(x0 + 3, z0 + 2, x1 - 3, z0 + 16, 4, { wall: B.STUCCO, win: B.WIN_FRAME, band: B.CONCRETE, corner: B.CONCRETE, lobby: B.SHOP_WIN, door: 's', every: 3, doorW: 3 });
      const mx = Math.floor((x0 + x1) / 2);
      for (let k = -2; k <= 2; k++) {
        set(mx + k, GY + 11, z0 + 16, B.RED_PANEL);
        set(mx, GY + 11 + k, z0 + 16, B.RED_PANEL);
      }
      const [sx, sz] = face(mx, z0 + 16, 's');
      sign([['HOSPITAL', 44]], '#ffffff', '#d8392b', 6, 1.1, sx + 0.5, GY + 5.2, sz, 's');
      roofTop(x0 + 3, z0 + 2, x1 - 3, z0 + 16, b.roofY, { helipad: true });
      info.hospital = { x: b.door[0], z: b.door[1] + 1 };
      pave(x0 + 2, z0 + 18, x1 - 2, z1 - 1, B.ASPHALT);
      park(x0 + 6, z0 + 22, N_, 'ambulance');
      park(x0 + 12, z0 + 22, N_, 'parked');
      info.cubes.push([mx + 1, b.roofY, z0 + 9]);
    },
    // Police station, with police cars out front.
    police(x0, z0, x1, z1) {
      const b = building(x0 + 2, z0 + 1, x1 - 2, z0 + 12, 3, { wall: B.STONE_BRICK, win: B.GLASS_BLUE, band: B.CONCRETE, corner: B.CONCRETE, lobby: B.GLASS_BLUE, door: 's', every: 2 });
      stairs(x1 - 3, z0 + 3, [GY, GY + 4, GY + 8, GY + 13]);
      info.police = { x: b.door[0], z: b.door[1] + 1, signX: Math.floor((x0 + x1) / 2) + 1, signZ: z0 + 12 };
      const [sx, sz] = face(Math.floor((x0 + x1) / 2), z0 + 12, 's');
      sign([['BLOCKTON POLICE', 34], ['Emergency? Dial 5-0-5-0', 24]], '#1e3160', '#ffffff', 7, 1.6, sx + 0.5, GY + 5.6, sz, 's');
      roofTop(x0 + 2, z0 + 1, x1 - 2, z0 + 12, b.roofY, { antenna: 3 });
      pave(x0, z0 + 14, x1, z1, B.ASPHALT);
      for (let x = x0 + 3; x <= x1 - 3; x += 4) for (let z = z0 + 16; z <= z1; z++) if ((z - z0) % 10 !== 5) set(x, GY, z, B.LINE_Z);
      park(x0 + 5, z0 + 19, N_, 'police');
      park(x0 + 9, z0 + 19, N_, 'police');
      park(x0 + 13, z0 + 21, N_, 'parked');
      info.givers.van = { x: x0 + 17, z: z0 + 15 };
      info.cubes.push([x0 + 4, b.roofY, z0 + 3]);
    },
    // Fire station: big doors, a hose tower and a fire truck.
    fire(x0, z0, x1, z1) {
      const b = building(x0 + 2, z0 + 2, x1 - 8, z0 + 16, 2, { wall: B.RED_PANEL, win: B.WIN_FRAME, band: B.STONE_BRICK, corner: B.STONE_BRICK, door: null });
      // Three garage doors, open.
      for (let k = 0; k < 3; k++) {
        const x = x0 + 4 + k * 6;
        fill(x, GY + 1, z0 + 16, x + 3, GY + 4, z0 + 16, B.AIR);
        fill(x, GY + 5, z0 + 16, x + 3, GY + 5, z0 + 16, B.GARAGE);
      }
      building(x1 - 6, z0 + 4, x1 - 3, z0 + 7, 5, { wall: B.BRICK, win: B.WIN_FRAME, corner: B.STONE_BRICK, door: null, every: 2 });
      const [sx, sz] = face(x0 + 10, z0 + 16, 's');
      sign([['FIRE STATION 5', 40]], '#d8392b', '#ffffff', 9, 1.2, sx, GY + 6.9, sz, 's');
      roofTop(x0 + 2, z0 + 2, x1 - 8, z0 + 16, b.roofY);
      pave(x0 + 1, z0 + 17, x1 - 1, z1, B.CONCRETE);
      park(x0 + 6, z0 + 22, N_, 'firetruck');
    },
    // School: brick classrooms, a playground and a basketball court.
    school(x0, z0, x1, z1) {
      const b = building(x0 + 2, z0 + 2, x1 - 2, z0 + 12, 3, { wall: B.BRICK, win: B.WIN_FRAME, band: B.STONE_BRICK, corner: B.STONE_BRICK, door: 's', every: 2 });
      const [sx, sz] = face(Math.floor((x0 + x1) / 2), z0 + 12, 's');
      sign([['BLOCKTON SCHOOL', 40]], '#3f9a55', '#ffffff', 9, 1.2, sx + 0.5, GY + 4.6, sz, 's');
      roofTop(x0 + 2, z0 + 2, x1 - 2, z0 + 12, b.roofY, { water: true });
      // Court.
      pave(x0 + 2, z0 + 16, x0 + 16, z1 - 2, B.ASPHALT);
      ring(x0 + 3, z0 + 17, x0 + 15, z1 - 3, GY, B.LINE_Z);
      for (const z of [z0 + 17, z1 - 3]) fill(x0 + 9, GY + 1, z, x0 + 9, GY + 4, z, B.METAL);
      // Playground.
      fill(x0 + 19, GY, z0 + 16, x1 - 2, GY, z1 - 2, B.SAND);
      fill(x0 + 22, GY + 1, z0 + 19, x0 + 22, GY + 3, z0 + 19, B.METAL);
      for (let k = 0; k < 4; k++) set(x0 + 23 + k, GY + 3 - Math.floor(k * 0.7), z0 + 19, B.AWNING);
      tree(x1 - 4, z1 - 4);
      info.cubes.push([x1 - 4, b.roofY, z0 + 4]);
    },
    // Shopping mall with a big car park.
    mall(x0, z0, x1, z1) {
      const b = building(x0 + 2, z0 + 2, x1 - 2, z0 + 17, 2, { fh: 5, wall: B.STONE_BRICK, win: B.GLASS_BLUE, band: B.CONCRETE, corner: B.CONCRETE, lobby: B.SHOP_WIN, door: 's', doorW: 4, every: 0, floorsInside: false });
      const [sx, sz] = face(Math.floor((x0 + x1) / 2), z0 + 17, 's');
      sign([['BLOCK MALL', 48]], '#ff5a8a', '#ffffff', 8, 1.5, sx, GY + 7.4, sz, 's');
      // Skylights.
      for (let x = x0 + 6; x < x1 - 4; x += 6) fill(x, b.top, z0 + 6, x + 2, b.top, z0 + 13, B.GLASS);
      pave(x0 + 1, z0 + 19, x1 - 1, z1 - 1, B.ASPHALT);
      for (let x = x0 + 3; x < x1 - 2; x += 4) for (let z = z0 + 21; z <= z1 - 2; z++) if ((z - z0) % 7 !== 0) set(x, GY, z, B.LINE_Z);
      park(x0 + 5, z0 + 24, N_, 'parked');
      park(x0 + 13, z0 + 24, N_, 'parked');
      park(x0 + 21, z0 + 30, S_, 'parked');
    },
    // Hotel Cube: a tall hotel with a pool.
    hotel(x0, z0, x1, z1) {
      const b = building(x0 + 3, z0 + 3, x0 + 19, z1 - 10, 9, { wall: B.STUCCO, win: B.CURTAIN_WIN, band: B.STUCCO_PEACH, corner: B.PILLAR, lobby: B.SHOP_WIN, door: 's', doorW: 3, every: 2, floorsInside: false });
      const [sx, sz] = face(x0 + 11, z1 - 10, 's');
      sign([['HOTEL CUBE', 44]], '#1a1a1c', '#ffd23f', 8, 1.3, sx, GY + 5.4, sz, 's');
      // Entrance canopy on pillars.
      fill(x0 + 8, GY + 4, z1 - 9, x0 + 14, GY + 4, z1 - 7, B.STUCCO);
      fill(x0 + 8, GY + 1, z1 - 7, x0 + 8, GY + 3, z1 - 7, B.PILLAR);
      fill(x0 + 14, GY + 1, z1 - 7, x0 + 14, GY + 3, z1 - 7, B.PILLAR);
      roofTop(x0 + 3, z0 + 3, x0 + 19, z1 - 10, b.roofY, { helipad: false, water: true });
      // Pool.
      fill(x1 - 11, GY, z0 + 3, x1 - 2, GY, z0 + 18, B.TILES);
      fill(x1 - 9, SEA, z0 + 5, x1 - 4, GY, z0 + 16, B.AIR);
      for (let z = z0 + 6; z < z0 + 16; z += 3) bench(x1 - 2, z, false);
    },
    // The stadium: stands, floodlights, a scoreboard, and a monster truck.
    stadium(x0, z0, x1, z1) {
      for (let z = z0 + 4; z <= z1 - 4; z++) for (let x = x0 + 5; x <= x1 - 5; x++) set(x, GY, z, (x + z) % 4 < 2 ? B.GRASS : B.DARKGRASS);
      for (let k = 0; k < 4; k++) {
        fill(x0 + k, GY + 1, z0 + 1, x0 + k, GY + 4 - k, z1 - 1, B.CONCRETE);
        fill(x1 - k, GY + 1, z0 + 1, x1 - k, GY + 4 - k, z1 - 1, B.CONCRETE);
      }
      for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) {
        fill(x, GY + 1, z, x, GY + 13, z, B.METAL);
        fill(x - 1, GY + 14, z, x + 1, GY + 14, z, B.LAMP);
      }
      const mx = Math.floor((x0 + x1) / 2);
      for (const z of [z0 + 4, z1 - 4]) {
        fill(mx - 3, GY + 1, z, mx - 3, GY + 3, z, B.SNOW);
        fill(mx + 3, GY + 1, z, mx + 3, GY + 3, z, B.SNOW);
        fill(mx - 3, GY + 3, z, mx + 3, GY + 3, z, B.SNOW);
      }
      // Scoreboard on posts at the north end.
      fill(mx - 1, GY + 1, z0 + 1, mx - 1, GY + 6, z0 + 1, B.METAL);
      fill(mx + 2, GY + 1, z0 + 1, mx + 2, GY + 6, z0 + 1, B.METAL);
      sign([['BLOCKS 3 - 0 CUBERS', 34]], '#1a1a1c', '#ffd23f', 8, 1.6, mx + 0.5, GY + 7.5, z0 + 1.6, 's');
      // Monster truck ramps.
      ramp(x0 + 8, z1 - 10, 'x', 3, 3);
      ramp(x1 - 12, z0 + 8, 'z', 3, 3);
      info.givers.stadium = { x: mx, z: z0 + 2.5 };
      info.lots.stadium = [x0, z0, x1, z1];
      park(mx + 6, z0 + 8, N_, 'monster');
    },
    // A half-built tower in steel, a crane, sand piles and crates.
    construction(x0, z0, x1, z1) {
      fill(x0, GY, z0, x1, GY, z1, B.GRAVEL);
      for (const [x, z] of [[x0 + 2, z0 + 2], [x0 + 12, z0 + 2], [x0 + 2, z0 + 12], [x0 + 12, z0 + 12]]) fill(x, GY + 1, z, x, GY + 16, z, B.METAL);
      for (const y of [GY + 4, GY + 8, GY + 12, GY + 16]) {
        ring(x0 + 2, z0 + 2, x0 + 12, z0 + 12, y, B.METAL);
        if (y < GY + 16) fill(x0 + 3, y, z0 + 3, x0 + 11, y, z0 + 11, B.PLANKS);
      }
      stairs(x0 + 11, z0 + 3, [GY, GY + 4, GY + 8, GY + 12]);
      const cx = x1 - 4;
      const cz = z0 + 5;
      fill(cx, GY + 1, cz, cx, GY + 24, cz, B.GOLD);
      fill(cx - 16, GY + 24, cz, cx + 3, GY + 24, cz, B.GOLD);
      fill(cx + 2, GY + 21, cz - 1, cx + 3, GY + 23, cz + 1, B.CONCRETE);
      fill(cx - 16, GY + 18, cz, cx - 16, GY + 23, cz, B.METAL);
      for (const [x, z] of [[x0 + 4, z1 - 4], [x0 + 8, z1 - 3]]) {
        for (let y = 0; y < 3; y++) fill(x - 2 + y, GY + 1 + y, z - 2 + y, x + 2 - y, GY + 1 + y, z + 2 - y, B.SAND);
      }
      for (const [x, z] of [[x1 - 8, z1 - 4], [x1 - 6, z1 - 4], [x1 - 7, z1 - 6]]) set(x, GY + 1, z, B.PLANKS);
      set(x1 - 7, GY + 2, z1 - 4, B.PLANKS);
      ring(x0, z0, x1, z1, GY + 1, B.HAZARD);
      for (const [x, z] of [[x0 + 16, z1], [x0 + 17, z1], [x0 + 18, z1]]) set(x, GY + 1, z, B.AIR);
      info.givers.site = { x: x0 + 17, z: z1 - 3 };
      info.lots.site = [x0, z0, x1, z1];
      info.cubes.push([cx - 16, GY + 25, cz]);
    },
    // Block Fix: drive in and they repair your car, respray it, and the
    // police forget about you. Plus some cars for sale.
    garage(x0, z0, x1, z1) {
      const b = building(x0 + 3, z0 + 2, x0 + 18, z0 + 14, 2, { wall: B.BRICK_DARK, win: B.WIN_FRAME, band: B.HAZARD, corner: B.STONE_BRICK, door: null });
      // The big doorway at the front.
      fill(x0 + 8, GY + 1, z0 + 14, x0 + 13, GY + 4, z0 + 14, B.AIR);
      fill(x0 + 4, GY, z0 + 3, x0 + 17, GY, z0 + 13, B.CONCRETE);
      ring(x0 + 6, z0 + 5, x0 + 15, z0 + 12, GY, B.HAZARD);
      info.repair = [x0 + 5, z0 + 4, x0 + 16, z0 + 13];
      const [sx, sz] = face(x0 + 10, z0 + 14, 's');
      sign([['BLOCK FIX', 44], ['Repairs · Respray · 50 coins', 22]], '#f2c230', '#1a1a1c', 7, 1.6, sx + 0.5, GY + 6.2, sz, 's');
      roofTop(x0 + 3, z0 + 2, x0 + 18, z0 + 14, b.roofY);
      pave(x0 + 1, z0 + 16, x1 - 1, z1 - 1, B.ASPHALT);
      sign([['USED CARS', 44]], '#3d6fd8', '#ffffff', 5, 1.1, x1 - 7, GY + 3.2, z0 + 16.6, 's');
      fill(x1 - 9, GY + 1, z0 + 16, x1 - 9, GY + 2, z0 + 16, B.METAL);
      fill(x1 - 5, GY + 1, z0 + 16, x1 - 5, GY + 2, z0 + 16, B.METAL);
      park(x0 + 6, z0 + 24, N_, 'suv');
      park(x0 + 12, z0 + 24, N_, 'sports');
      park(x0 + 18, z0 + 24, N_, 'pickup');
      park(x0 + 24, z0 + 24, N_, 'sedan');
    },
  };

  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const x0 = ROADS[i] + HALF + 3;
      const x1 = ROADS[i + 1] - HALF - 3;
      const z0 = ROADS[j] + HALF + 3;
      const z1 = ROADS[j + 1] - HALF - 3;
      lots[LOTS[i][j]](x0, z0, x1, z1, i, j);
    }
  }

  // Trees round the edge of town, palm trees on the beach, and a pier.
  for (let k = 0; k < 70; k++) {
    const t = Math.floor(rng() * (N - 2 * EDGE - 4)) + EDGE + 2;
    const side = Math.floor(rng() * 4);
    const [x, z] = side === 0 ? [EDGE + 2, t] : side === 1 ? [N - EDGE - 3, t] : side === 2 ? [t, EDGE + 2] : [t, N - EDGE - 3];
    if (get(x, GY, z) === B.GRASS && !get(x, GY + 1, z)) tree(x, z, 4);
  }
  for (let k = 0; k < 40; k++) {
    const t = Math.floor(rng() * (N - 30)) + 15;
    const side = Math.floor(rng() * 4);
    const e = 5;
    const [x, z] = side === 0 ? [e, t] : side === 1 ? [N - 1 - e, t] : side === 2 ? [t, e] : [t, N - 1 - e];
    if (get(x, 5, z) === B.SAND && !get(x, 6, z)) palm(x, z, 6);
  }
  // The pier sticks out into the sea on the east side.
  const pz = 120;
  fill(N - EDGE, 6, pz, N - 1, 6, pz + 3, B.WOOD_DARK);
  for (let x = N - EDGE; x < N; x += 3) {
    fill(x, 1, pz, x, 5, pz, B.LOG);
    fill(x, 1, pz + 3, x, 5, pz + 3, B.LOG);
    set(x, 7, pz, B.WOOD_DARK);
    set(x, 7, pz + 3, B.WOOD_DARK);
  }
  info.cubes.push([N - 2, 7, pz + 1]);
  world.markAllDirty();
  return info;
}

// The road network for traffic: intersections and the roads between them.
export function roadNodes() {
  const nodes = [];
  const n = ROADS.length;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) nodes.push({ i, j, x: ROADS[i] + 0.5, z: ROADS[j] + 0.5 });
  const at = (i, j) => (i < 0 || j < 0 || i >= n || j >= n ? null : nodes[j * n + i]);
  for (const nd of nodes) nd.next = [at(nd.i + 1, nd.j), at(nd.i - 1, nd.j), at(nd.i, nd.j + 1), at(nd.i, nd.j - 1)].filter(Boolean);
  return nodes;
}

// The sidewalk loop around each city block, for people to walk.
export function sidewalkLoops() {
  const loops = [];
  for (let i = 0; i + 1 < ROADS.length; i++) {
    for (let j = 0; j + 1 < ROADS.length; j++) {
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
