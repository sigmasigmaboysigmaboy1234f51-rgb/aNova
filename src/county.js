import { B, SEA } from './world.js';
import { mulberry32, fbm2 } from './rng.js';

// Blockton County: the Adventure world. Blockton's city blocks sit in the
// middle of a 768 x 768 island, with suburbs round them, farms and a
// village to the north, forest, mountains and lakes to the west, a beach
// town to the east and factories and a port to the south. Roads run on a
// grid all the way across.
//
// Each lot (the land between four roads) is one letter here, x across, z
// (north to south) down:
//   C Blockton (city.js)   h homes      s shops      p park
//   W shopping plaza       G gym        D car dealer L library
//   R speedway             B beach homes b boardwalk
//   V village homes        v village centre
//   F farm   f fields   T forest   m mountains   l lake   k campsite
//   I factories   P port
export const COUNTY = [
  'mmmTTfFffFfTTVvB',
  'mmmTllffFffTVVBB',
  'mmTTllfFfffTTVBB',
  'mTkTTffffFfTTBBB',
  'TTTThhhshhphhhBB',
  'TllhhWhhGhhhshbB',
  'TllhphCCCCChhsBB',
  'TThhshCCCCCDhhbB',
  'TThhhhCCCCChphBB',
  'ThhhhLCCCCChhhBB',
  'ThhphhCCCCChWhBB',
  'TThhshhhRphhhhBB',
  'ffTThhhIIIIhhhhB',
  'fFTThIIIIIIIhTTB',
  'ffFTTIIIIIIITTTB',
  'fffTTPPPPPPPTTTB',
];
export const NLOT = 16;
// Blockton's 5 x 5 blocks start at lot (CORE, CORE).
export const CORE = 6;
export const ROAD_GAP = 45;
export const ROADS = Array.from({ length: NLOT + 1 }, (_, k) => 14 + k * ROAD_GAP);

const TOWN = 'ChspWGDLRBbVv';
export function districtAt(i, j) {
  return i < 0 || j < 0 || i >= NLOT || j >= NLOT ? '~' : COUNTY[j][i];
}
export const isTownLot = (i, j) => TOWN.includes(districtAt(i, j));

// The lot a point is in (or next to, on a road).
export function lotAt(x, z) {
  return [Math.floor((x - ROADS[0]) / ROAD_GAP), Math.floor((z - ROADS[0]) / ROAD_GAP)];
}

// Is (x, z) in town (sidewalks, street lamps, traffic lights)?
export function townAt(x, z) {
  const [i, j] = lotAt(x, z);
  return isTownLot(i, j) || isTownLot(i - 1, j) || isTownLot(i, j - 1) || isTownLot(i - 1, j - 1);
}

// Names for the map.
export const AREAS = [
  { name: 'Blockton', x: 396, z: 396 },
  { name: 'Pinecrest Village', x: 650, z: 60 },
  { name: 'Sunny Shores', x: 700, z: 380 },
  { name: 'Mount Cubemore', x: 60, z: 70 },
  { name: 'Whispering Woods', x: 60, z: 420 },
  { name: 'Harvest Farms', x: 330, z: 110 },
  { name: 'Iron Docks', x: 400, z: 690 },
  { name: 'Maple Heights', x: 190, z: 300 },
];

// A room inside walls x0..x1, z0..z1 (the walls), its door on side `door`.
// Local (u, v): u across from the door's left, v in from the door.
function room(x0, z0, x1, z1, door) {
  const ix0 = x0 + 1;
  const iz0 = z0 + 1;
  const ix1 = x1 - 1;
  const iz1 = z1 - 1;
  const alongX = door === 'n' || door === 's';
  const W = alongX ? ix1 - ix0 + 1 : iz1 - iz0 + 1;
  const D = alongX ? iz1 - iz0 + 1 : ix1 - ix0 + 1;
  const at = (u, v) => {
    if (door === 's') return [ix0 + u, iz1 - v];
    if (door === 'n') return [ix1 - u, iz0 + v];
    if (door === 'e') return [ix1 - v, iz0 + u];
    return [ix0 + v, iz1 - u];
  };
  // The way to face to look at the door (a person's yaw).
  const toDoor = door === 's' ? 0 : door === 'n' ? Math.PI : door === 'e' ? Math.PI / 2 : -Math.PI / 2;
  return { W, D, at, toDoor, x0: ix0, z0: iz0, x1: ix1, z1: iz1 };
}

const PEOPLE = ['Nina', 'Omar', 'Priya', 'Leo', 'Mia', 'Theo', 'Zara', 'Ben', 'Ivy', 'Raj', 'Ellie', 'Finn', 'Luna', 'Kai', 'Rosa', 'Dev', 'Hana', 'Otto', 'Sofia', 'Jay'];

// Lot builders for the rest of the county, and furniture for buildings
// that do something (see places.js). `kit` has city.js's building tools.
export function countyLots(kit) {
  const { set, get, fill, ring, building, house, shop, tree, palm, hedge, flowers, bench, park, pave, sign, face, roofTop, pitched, info, HOUSES, GY } = kit;
  const Y = GY + 1;
  const N_ = 0;
  const S_ = Math.PI;
  let staffN = 0;
  const staffName = () => PEOPLE[staffN++ % PEOPLE.length];
  const put = ([x, z], y, id) => set(x, y, z, id);
  const col = ([x, z], y0, y1, id) => fill(x, y0, z, x, y1, z, id);
  const cube = (x, y, z) => info.cubes.push([x, y, z]);

  // A place people can use: shops, the hospital and so on.
  function place(type, name, b, r, staff, extra = {}) {
    const p = { type, name, door: b.door, room: [r.x0, r.z0, r.x1, r.z1], staff, ...extra };
    info.places.push(p);
    return p;
  }
  // Someone standing at local (u, v), facing the door.
  const person = (r, u, v, title, extra = {}) => {
    const [x, z] = r.at(u, v);
    return { x: x + 0.5, z: z + 0.5, yaw: r.toDoor, title, name: extra.name || staffName(), seed: 500 + staffN * 37, ...extra };
  };
  // Keep the way in from the door clear.
  const clearDoor = (r) => {
    const [dx0, dz0] = r.at(Math.floor(r.W / 2) - 1, 0);
    const [dx1, dz1] = r.at(Math.floor(r.W / 2) + 1, 1);
    fill(Math.min(dx0, dx1), Y, Math.min(dz0, dz1), Math.max(dx0, dx1), Y + 2, Math.max(dz0, dz1), B.AIR);
  };
  const floor = (r, id) => fill(r.x0, GY, r.z0, r.x1, GY, r.z1, id);

  // --- Furniture for working buildings ---------------------------------------

  const furnish = {
    hospital(b, x0, z0, x1, z1, door, name, small = false) {
      const r = room(x0, z0, x1, z1, door);
      floor(r, B.TILES);
      // Reception desk and waiting chairs.
      for (let u = 1; u <= 5; u++) put(r.at(u, 3), Y, B.COUNTER);
      for (let u = r.W - 7; u <= r.W - 2; u += 2) put(r.at(u, 2), Y, B.WOOD_DARK);
      // A row of beds along the back wall, with curtains between.
      const beds = [];
      const n = small ? 2 : 6;
      for (let k = 0; k < n; k++) {
        const u = 2 + k * 4;
        if (u + 1 >= r.W - 1) break;
        put(r.at(u, r.D - 1), Y, B.BED);
        put(r.at(u, r.D - 2), Y, B.BED);
        col(r.at(u + 2, r.D - 1), Y, Y + 1, B.STUCCO_MINT);
        const [bx, bz] = r.at(u, r.D - 2);
        const [hx, hz] = r.at(u, r.D - 1);
        beds.push({ x: bx + 0.5, z: bz + 0.5, yaw: Math.atan2(bx - hx, bz - hz) });
      }
      // A red cross on the back wall.
      const [cx, cz] = r.at(Math.floor(r.W / 2), r.D - 1);
      if (!get(cx, Y + 2, cz)) {
        for (const [a, bb] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const [px, pz] = r.at(Math.floor(r.W / 2) + a, r.D - 1);
          set(px, Y + 2 + bb, pz, B.RED_PANEL);
        }
      }
      clearDoor(r);
      const staff = [person(r, 3, 4, 'Nurse'), person(r, Math.min(r.W - 3, 12), r.D - 4, 'Doctor', { name: small ? 'Dr. Moss' : 'Dr. Blocksworth' })];
      return place('hospital', name, b, r, staff, { beds, small });
    },

    police(b, x0, z0, x1, z1, door, name, cells = 3) {
      const r = room(x0, z0, x1, z1, door);
      floor(r, B.TILES);
      // The front desk, with lockers along the wall.
      for (let u = 2; u <= 7; u++) put(r.at(u, 3), Y, B.COUNTER);
      for (let v = 1; v <= 4; v++) col(r.at(0, v), Y, Y + 1, B.LOCKER);
      // Cells at the back: bars across the front, a bench inside.
      const list = [];
      for (let k = 0; k < cells; k++) {
        const u0 = 1 + k * 4;
        if (u0 + 3 > r.W - 4) break;
        const front = r.D - 4;
        for (let v = front; v < r.D; v++) {
          col(r.at(u0, v), Y, Y + 2, B.STONE_BRICK);
          col(r.at(u0 + 4, v), Y, Y + 2, B.STONE_BRICK);
        }
        for (let u = u0 + 1; u <= u0 + 3; u++) col(r.at(u, front), Y, Y + 2, B.BARS);
        for (let u = u0 + 1; u <= u0 + 3; u++) put(r.at(u, r.D - 1), Y, B.WOOD_DARK);
        const [ix, iz] = r.at(u0 + 2, r.D - 2);
        const door2 = r.at(u0 + 2, front);
        list.push({ x: ix + 0.5, z: iz + 0.5, door: door2, yaw: r.toDoor });
      }
      clearDoor(r);
      const staff = [person(r, 4, 4, 'Desk Sergeant')];
      return place('police', name, b, r, staff, { cells: list });
    },

    school(b, x0, z0, x1, z1, door, name) {
      const r = room(x0, z0, x1, z1, door);
      floor(r, B.PLANKS);
      const half = Math.floor(r.W / 2);
      // Classroom: a chalkboard on the back wall, the teacher's desk and
      // rows of desks.
      for (let u = 2; u <= half - 3; u++) col(r.at(u, r.D - 1), Y + 1, Y + 2, B.BOARD);
      put(r.at(Math.floor(half / 2), r.D - 3), Y, B.COUNTER);
      put(r.at(Math.floor(half / 2) + 1, r.D - 3), Y, B.COUNTER);
      for (const v of [3, 5]) for (let u = 2; u <= half - 3; u += 2) if (v < r.D - 3) put(r.at(u, v), Y, B.COUNTER);
      // A wall down the middle with a gap, lockers by the door.
      for (let v = 3; v < r.D; v++) if (v !== 4 && v !== 5) col(r.at(half, v), Y, Y + 2, B.BRICK);
      for (let u = 1; u < half - 2; u++) col(r.at(u, 0), Y, Y + 1, B.LOCKER);
      // Cafeteria: a serving counter and tables.
      for (let u = half + 3; u <= r.W - 2; u++) put(r.at(u, r.D - 3), Y, B.COUNTER);
      for (let u = half + 3; u <= r.W - 3; u += 3) put(r.at(u, 3), Y, B.COUNTER);
      clearDoor(r);
      const staff = [person(r, Math.floor(half / 2), r.D - 2, 'Teacher', { name: 'Ms. Cubes' }), person(r, half + 5, r.D - 2, 'Lunch Lady', { name: 'Dot' })];
      return place('school', name, b, r, staff);
    },

    // A shop counter with someone behind it and shelves round the walls.
    store(b, x0, z0, x1, z1, door, type, name, o = {}) {
      const r = room(x0, z0, x1, z1, door);
      if (o.floor) floor(r, o.floor);
      const back = r.D - 3;
      const mid = Math.floor(r.W / 2);
      if (type === 'mart') {
        // Aisles, fridges along the back, a till by the door.
        for (let u = 1; u < r.W - 1; u += 3) for (let v = 2; v <= r.D - 3; v++) if (Math.abs(u - mid) > 1) col(r.at(u, v), Y, Y + 1, B.SHELF);
        for (let u = 0; u < r.W; u++) col(r.at(u, r.D - 1), Y, Y + 1, B.FREEZER);
        put(r.at(r.W - 2, 1), Y, B.COUNTER);
        clearDoor(r);
        return place(type, name, b, r, [person(r, r.W - 1, 1, o.title || 'Cashier')]);
      }
      if (type === 'food') {
        for (let u = 1; u < r.W - 1; u++) put(r.at(u, back), Y, B.COUNTER);
        for (let u = 0; u < r.W; u++) col(r.at(u, r.D - 1), Y, Y + 1, B.METAL);
        for (const u of [1, r.W - 2]) {
          put(r.at(u, 2), Y, B.COUNTER);
          put(r.at(u, 1), Y, B.WOOD_DARK);
        }
        clearDoor(r);
        return place(type, name, b, r, [person(r, mid, r.D - 2, o.title || 'Cook')], { menu: o.menu });
      }
      // Gun racks, clothes rails, tanks for pets or shelves of books.
      const wall = { guns: B.METAL, clothes: B.AWNING, pets: B.GLASS_BLUE, books: B.BOOKS }[type] || B.SHELF;
      for (let v = 1; v < r.D - 1; v++) {
        col(r.at(0, v), Y, Y + 1, type === 'guns' ? B.SHELF : wall);
        col(r.at(r.W - 1, v), Y, Y + 1, wall);
      }
      if (type === 'clothes') for (let u = 2; u < r.W - 2; u += 3) if (Math.abs(u - mid) > 1) put(r.at(u, 2), Y, [B.RED_PANEL, B.STUCCO_MINT, B.SIDING, B.AWNING][u % 4]);
      for (let u = 1; u < r.W - 1; u++) put(r.at(u, back), Y, B.COUNTER);
      clearDoor(r);
      return place(type, name, b, r, [person(r, mid, r.D - 2, o.title || 'Shopkeeper')]);
    },

    bank(b, x0, z0, x1, z1, door, name) {
      const r = room(x0, z0, x1, z1, door);
      floor(r, B.MARBLE);
      const v = Math.min(5, r.D - 4);
      for (let u = 1; u < r.W - 1; u++) {
        put(r.at(u, v), Y, B.COUNTER);
        if (u % 3 !== 1) put(r.at(u, v), Y + 1, B.GLASS);
      }
      // The vault at the back.
      for (let u = 2; u < r.W - 2; u++) col(r.at(u, r.D - 1), Y, Y + 2, B.METAL);
      col(r.at(Math.floor(r.W / 2), r.D - 1), Y, Y + 1, B.GARAGE);
      clearDoor(r);
      return place('bank', name, b, r, [person(r, 4, v + 1, 'Bank Teller')]);
    },

    gym(b, x0, z0, x1, z1, door, name) {
      const r = room(x0, z0, x1, z1, door);
      floor(r, B.RUBBER);
      // Weight racks and benches, a mirror wall, a boxing ring.
      for (let u = 1; u < r.W - 1; u++) col(r.at(u, r.D - 1), Y, Y + 1, u % 3 ? B.METAL : B.RUBBER);
      for (let u = 2; u < Math.floor(r.W / 2) - 1; u += 3) {
        put(r.at(u, r.D - 4), Y, B.WOOD_DARK);
        put(r.at(u, r.D - 5), Y, B.WOOD_DARK);
        put(r.at(u, r.D - 4), Y + 2, B.METAL);
      }
      for (let v = 1; v < r.D - 1; v++) col(r.at(0, v), Y, Y + 2, B.GLASS);
      const rx = Math.floor(r.W / 2) + 2;
      for (let u = rx; u <= r.W - 3; u++) for (let v = 4; v <= r.D - 4; v++) put(r.at(u, v), GY, B.CARPET);
      for (const [u, v] of [[rx, 4], [r.W - 3, 4], [rx, r.D - 4], [r.W - 3, r.D - 4]]) col(r.at(u, v), Y, Y + 1, B.RED_PANEL);
      for (let u = 2; u <= 6; u++) put(r.at(u, 2), Y, B.COUNTER);
      clearDoor(r);
      return place('gym', name, b, r, [person(r, 4, 3, 'Coach', { name: 'Coach Tank' })]);
    },

    library(b, x0, z0, x1, z1, door, name) {
      const r = room(x0, z0, x1, z1, door);
      floor(r, B.CARPET);
      for (let u = 1; u < r.W - 1; u += 3) for (let v = r.D - 5; v < r.D; v++) if (Math.abs(u - r.W / 2) > 2) col(r.at(u, v), Y, Y + 2, B.BOOKS);
      for (let u = 2; u < r.W - 2; u += 4) {
        put(r.at(u, 3), Y, B.COUNTER);
        put(r.at(u + 1, 3), Y, B.COUNTER);
      }
      for (let u = 2; u <= 5; u++) put(r.at(u, 1), Y, B.COUNTER);
      clearDoor(r);
      return place('library', name, b, r, [person(r, 3, 2, 'Librarian', { name: 'Mr. Pages' })]);
    },

    hotel(b, x0, z0, x1, z1, door, name) {
      const r = room(x0, z0, x1, z1, door);
      floor(r, B.CARPET);
      for (let u = 1; u <= 6; u++) put(r.at(u, 4), Y, B.COUNTER);
      for (let u = r.W - 6; u < r.W - 1; u += 2) put(r.at(u, 3), Y, B.WOOD_DARK);
      clearDoor(r);
      return place('hotel', name, b, r, [person(r, 3, 5, 'Receptionist')]);
    },

    home(b, x0, z0, x1, z1, door) {
      const r = room(x0, z0, x1, z1, door);
      for (let u = 2; u < r.W - 2; u++) for (let v = 2; v < r.D - 1; v++) put(r.at(u, v), GY, B.CARPET);
      // Bed in the back corner, TV and sofa, a kitchen corner.
      put(r.at(r.W - 1, r.D - 1), Y, B.BED);
      put(r.at(r.W - 1, r.D - 2), Y, B.BED);
      put(r.at(Math.floor(r.W / 2), r.D - 1), Y, B.SCREEN);
      put(r.at(Math.floor(r.W / 2) - 1, r.D - 1), Y, B.SCREEN);
      for (let u = Math.floor(r.W / 2) - 2; u <= Math.floor(r.W / 2) + 1; u++) put(r.at(u, r.D - 4), Y, B.WOOD_DARK);
      col(r.at(0, r.D - 1), Y, Y + 1, B.FREEZER);
      put(r.at(0, r.D - 2), Y, B.COUNTER);
      put(r.at(0, r.D - 3), Y, B.COUNTER);
      clearDoor(r);
      const [bx, bz] = r.at(r.W - 1, r.D - 2);
      return place('home', 'Your house', b, r, [], { beds: [{ x: bx + 0.5, z: bz + 0.5, yaw: 0 }] });
    },

    fire(b, x0, z0, x1, z1) {
      const r = room(x0, z0, x1, z1, 's');
      return place('fire', 'Fire Station 5', b, r, [person(r, 2, 2, 'Fire Chief', { name: 'Chief Blaze' })]);
    },
  };

  // --- The county's lots -----------------------------------------------------

  const SHOP_NAMES = [
    ['CUBE COFFEE', '#6a4428', '#fff6e0', 'food'],
    ['PIXEL PHONES', '#1a1a1c', '#6ff0ff'],
    ['BLOCK BAKERY', '#f0bf9c', '#6a2a10', 'food'],
    ['DONUT DEN', '#ff8ac0', '#5a1a3a', 'food'],
    ['TACO TOWER', '#f2c230', '#7a1e18', 'food'],
    ['BOOK NOOK', '#3a6a2a', '#ffffff', 'books'],
    ['HAIR CUBE', '#b46cff', '#ffffff'],
    ['FLOWER POWER', '#ff5a8a', '#ffffff'],
    ['SPORTY', '#3d6fd8', '#ffffff', 'clothes'],
    ['HARDWARE', '#d8392b', '#ffffff'],
    ['POST OFFICE', '#1e3160', '#f2c230'],
    ['SUSHI SQUARE', '#1a1a1c', '#ff5a5a', 'food'],
    ['VET', '#3f9a55', '#ffffff', 'pets'],
    ['LAUNDRY', '#6ff0ff', '#1a1a1c'],
    ['ICE CREAM', '#ffe0f0', '#d8392b', 'food'],
    ['GAME ZONE', '#b46cff', '#ffe14a'],
  ];
  const FOOD = {
    'CUBE COFFEE': 'coffee',
    'BLOCK BAKERY': 'bakery',
    'DONUT DEN': 'donut',
    'TACO TOWER': 'taco',
    'SUSHI SQUARE': 'sushi',
    'ICE CREAM': 'icecream',
    'BURGER BLOCK': 'burger',
    'FISH & CHIPS': 'fish',
  };
  // A shop that might do something: food, books, clothes or pets.
  function workingShop(x0, z0, x1, z1, facing, [name, bg, fg, kind], wall, floors = 1) {
    const b = shop(x0, z0, x1, z1, facing, name, [bg, fg], wall, floors);
    if (kind === 'food') furnish.store(b, x0, z0, x1, z1, facing, 'food', name, { menu: FOOD[name] || 'snack', title: 'Server' });
    else if (kind) furnish.store(b, x0, z0, x1, z1, facing, kind, name, { floor: kind === 'clothes' ? B.CARPET : null });
    return b;
  }

  function strip(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 131 + j * 17);
    const pick = () => SHOP_NAMES[Math.floor(r() * SHOP_NAMES.length)];
    const walls = [B.BRICK, B.STUCCO_PEACH, B.STUCCO_MINT, B.STUCCO, B.BRICK_DARK, B.SIDING];
    workingShop(x0 + 1, z0 + 1, x0 + 10, z0 + 9, 'n', pick(), walls[Math.floor(r() * walls.length)]);
    workingShop(x0 + 12, z0 + 1, x0 + 21, z0 + 9, 'n', pick(), walls[Math.floor(r() * walls.length)]);
    workingShop(x0 + 23, z0 + 1, x1 - 1, z0 + 9, 'n', pick(), walls[Math.floor(r() * walls.length)]);
    pave(x0 + 1, z0 + 11, x1 - 1, z1 - 12, B.ASPHALT);
    for (let x = x0 + 3; x < x1 - 2; x += 4) for (let z = z0 + 13; z <= z1 - 14; z += 6) set(x, GY, z, B.LINE_Z);
    workingShop(x0 + 1, z1 - 10, x0 + 14, z1 - 1, 's', pick(), walls[Math.floor(r() * walls.length)]);
    workingShop(x0 + 17, z1 - 10, x1 - 1, z1 - 1, 's', pick(), walls[Math.floor(r() * walls.length)]);
    if (r() < 0.8) park(x0 + 6, z0 + 15, N_, 'parked');
    if (r() < 0.6) park(x0 + 18, z0 + 15, N_, 'parked');
  }

  function smallPark(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 71 + j * 13);
    const mx = Math.floor((x0 + x1) / 2);
    const mz = Math.floor((z0 + z1) / 2);
    for (let t = x0; t <= x1; t++) set(t, GY, mz, B.GRAVEL);
    for (let t = z0; t <= z1; t++) set(mx, GY, t, B.GRAVEL);
    // A pond in one corner.
    const px = r() < 0.5 ? x0 + 8 : x1 - 8;
    const pz = r() < 0.5 ? z0 + 8 : z1 - 8;
    for (let z = pz - 5; z <= pz + 5; z++) {
      for (let x = px - 6; x <= px + 6; x++) {
        if ((x - px) ** 2 / 30 + (z - pz) ** 2 / 20 < 1) {
          fill(x, SEA - 1, z, x, GY, z, B.AIR);
          set(x, SEA - 2, z, B.SAND);
        }
      }
    }
    for (let k = 0; k < 14; k++) tree(x0 + 2 + Math.floor(r() * (x1 - x0 - 4)), z0 + 2 + Math.floor(r() * (z1 - z0 - 4)));
    flowers(mx - 4, mz - 4, mx - 2, mz - 2);
    flowers(mx + 2, mz + 2, mx + 4, mz + 4);
    bench(mx - 3, mz + 2, true);
    bench(mx + 2, mz - 2, true);
  }

  function plaza(x0, z0, x1, z1, i, j) {
    const second = i > 8;
    furnish.store(shop(x0 + 1, z0 + 1, x0 + 15, z0 + 11, 'n', second ? 'BLAST MASTERS 2' : 'BLAST MASTERS', ['#1a1a1c', '#ff5a2a'], B.BRICK_DARK, 1), x0 + 1, z0 + 1, x0 + 15, z0 + 11, 'n', 'guns', second ? 'Blast Masters 2' : 'Blast Masters', { title: 'Gunsmith' });
    furnish.store(shop(x0 + 17, z0 + 1, x1 - 1, z0 + 11, 'n', second ? 'PET PALACE' : 'DRIP SHOP', second ? ['#f2c230', '#1a1a1c'] : ['#ff5a8a', '#ffffff'], B.STUCCO, 1), x0 + 17, z0 + 1, x1 - 1, z0 + 11, 'n', second ? 'pets' : 'clothes', second ? 'Pet Palace' : 'Drip Shop', { floor: B.CARPET });
    furnish.store(shop(x0 + 1, z1 - 12, x0 + 18, z1 - 1, 's', 'FOOD MART', ['#3f9a55', '#ffffff'], B.CONCRETE, 1), x0 + 1, z1 - 12, x0 + 18, z1 - 1, 's', 'mart', 'Food Mart');
    const bb = shop(x0 + 21, z1 - 12, x1 - 1, z1 - 1, 's', 'BURGER BLOCK', ['#f2c230', '#5a2a10'], B.STUCCO_PEACH, 1);
    furnish.store(bb, x0 + 21, z1 - 12, x1 - 1, z1 - 1, 's', 'food', 'Burger Block', { menu: 'burger', title: 'Cook' });
    pave(x0 + 1, z0 + 13, x1 - 1, z1 - 14, B.ASPHALT);
    park(x0 + 8, z0 + 16, N_, 'parked');
    park(x0 + 24, z0 + 17, S_, 'parked');
  }

  function gym(x0, z0, x1, z1) {
    const bx0 = x0 + 2;
    const bz0 = z0 + 2;
    const bx1 = x1 - 2;
    const bz1 = z0 + 20;
    const b = building(bx0, bz0, bx1, bz1, 2, { fh: 5, wall: B.BRICK_DARK, win: B.GLASS_DARK, band: B.HAZARD, corner: B.METAL, lobby: B.GLASS_DARK, door: 's', doorW: 3, every: 0, floorsInside: false });
    const [sx, sz] = face(Math.floor((bx0 + bx1) / 2), bz1, 's');
    sign([['IRON TEMPLE GYM', 40], ['No pain, no gain', 22]], '#1a1a1c', '#ffd23f', 10, 1.6, sx + 0.5, GY + 7.2, sz, 's');
    roofTop(bx0, bz0, bx1, bz1, b.roofY, { vents: true });
    furnish.gym(b, bx0, bz0, bx1, bz1, 's', 'Iron Temple Gym');
    pave(x0 + 1, bz1 + 2, x1 - 1, z1 - 1, B.ASPHALT);
    park(x0 + 6, bz1 + 7, N_, 'parked');
    cube(bx0 + 2, b.roofY, bz0 + 2);
  }

  function dealer(x0, z0, x1, z1) {
    const bx0 = x0 + 2;
    const bz0 = z0 + 2;
    const bx1 = x1 - 2;
    const bz1 = z0 + 17;
    const b = building(bx0, bz0, bx1, bz1, 1, { fh: 6, wall: B.GLASS_BLUE, win: B.GLASS_BLUE, corner: B.METAL, band: B.METAL, lobby: B.GLASS_BLUE, door: 's', doorW: 5, every: 0, doorH: 4 });
    const [sx, sz] = face(Math.floor((bx0 + bx1) / 2), bz1, 's');
    sign([['WHEELS & DEALS', 40], ['New cars · Super cars', 22]], '#d8392b', '#ffffff', 10, 1.6, sx + 0.5, GY + 7.3, sz, 's');
    const r = room(bx0, bz0, bx1, bz1, 's');
    for (let u = 1; u <= 4; u++) put(r.at(u, 2), Y, B.COUNTER);
    place('dealer', 'Wheels & Deals', b, r, [person(r, 2, 3, 'Car Dealer', { name: 'Slick Rick' })], { show: [] });
    // Cars in the showroom and out on the lot.
    park(bx0 + 7, bz0 + 7, S_, 'super');
    park(bx0 + 15, bz0 + 7, S_, 'sports');
    park(bx0 + 23, bz0 + 7, S_, 'suv');
    pave(x0 + 1, bz1 + 2, x1 - 1, z1 - 1, B.ASPHALT);
    for (let k = 0; k < 4; k++) park(x0 + 5 + k * 7, bz1 + 9, N_, ['pickup', 'sedan', 'sports', 'suv'][k]);
    for (const x of [x0 + 2, x1 - 2]) {
      fill(x, GY + 1, bz1 + 3, x, GY + 6, bz1 + 3, B.METAL);
      set(x, GY + 6, bz1 + 4, B.RED_PANEL);
      set(x, GY + 5, bz1 + 4, B.RED_PANEL);
    }
  }

  function library(x0, z0, x1, z1) {
    const bx0 = x0 + 3;
    const bz0 = z0 + 3;
    const bx1 = x1 - 3;
    const bz1 = z0 + 18;
    const b = building(bx0, bz0, bx1, bz1, 2, { fh: 5, wall: B.STONE_BRICK, win: B.WIN_FRAME, band: B.PILLAR, corner: B.PILLAR, lobby: B.PILLAR, door: 's', doorW: 3, every: 2, floorsInside: false });
    pitched(bx0, bz0, bx1, bz1, b.top + 1, B.ROOF_DARK, B.STONE_BRICK);
    const [sx, sz] = face(Math.floor((bx0 + bx1) / 2), bz1, 's');
    sign([['BLOCKTON LIBRARY', 36]], '#3a2a1a', '#f2d890', 9, 1.2, sx + 0.5, GY + 6.1, sz, 's');
    furnish.library(b, bx0, bz0, bx1, bz1, 's', 'Blockton Library');
    for (const x of [x0 + 3, x1 - 3]) tree(x, z1 - 4);
    flowers(x0 + 6, bz1 + 2, x1 - 6, bz1 + 3);
    cube(bx0 + 3, b.top + 5, Math.floor((bz0 + bz1) / 2));
  }

  function speedway(x0, z0, x1, z1) {
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const rx = (x1 - x0) / 2 - 1;
    const rz = (z1 - z0) / 2 - 1;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const e = ((x - mx) / rx) ** 2 + ((z - mz) / rz) ** 2;
        const e2 = ((x - mx) / (rx - 6)) ** 2 + ((z - mz) / (rz - 6)) ** 2;
        if (e <= 1 && e2 > 1) set(x, GY, z, B.ASPHALT);
        else if (e2 <= 1 && e2 > 0.8) set(x, GY + 1, z, B.RUBBER);
        else if (e > 1 && e < 1.18) set(x, GY + 1, z, (x + z) % 2 ? B.RUBBER : B.RED_PANEL);
      }
    }
    // Start line and a gap to drive in.
    for (let x = Math.round(mx) - 1; x <= Math.round(mx) + 1; x++) for (let z = z1 - 6; z <= z1 + 1; z++) set(x, GY + 1, z, B.AIR);
    for (let z = z1 - 6; z <= z1 - 1; z++) set(Math.round(mx) + 4, GY, z, B.CROSSWALK);
    for (let k = 0; k < 3; k++) fill(Math.round(mx) - 6, GY + 1 + k, z0 + 8 + k, Math.round(mx) + 6, GY + 1 + k, z0 + 8 + k, B.CONCRETE);
    sign([['BLOCKTON SPEEDWAY', 36]], '#1a1a1c', '#ff5a2a', 9, 1.2, Math.round(mx) + 0.5, GY + 5.4, z0 + 7.4, 'n');
    park(Math.round(mx) + 8, z1 - 3, Math.PI / 2, 'sports');
  }

  function beachHomes(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 57 + j * 19);
    const pastel = [HOUSES[1], HOUSES[3], HOUSES[4]];
    fill(x0, GY, z0, x1, GY, z1, B.SAND);
    house(x0 + 2, z0 + 4, 11, 9, 'n', pastel[Math.floor(r() * 3)], `shore${i}${j}a`, r() < 0.4 ? 2 : 1);
    house(x0 + 20, z0 + 4, 11, 9, 'n', pastel[Math.floor(r() * 3)], `shore${i}${j}b`);
    house(x0 + 2, z1 - 12, 12, 9, 's', pastel[Math.floor(r() * 3)], `shore${i}${j}c`);
    house(x0 + 20, z1 - 12, 11, 9, 's', pastel[Math.floor(r() * 3)], `shore${i}${j}d`, r() < 0.4 ? 2 : 1);
    for (let k = 0; k < 6; k++) palm(x0 + 3 + Math.floor(r() * (x1 - x0 - 6)), z0 + 15 + Math.floor(r() * 4), GY + 1);
    if (r() < 0.6) park(x0 + 16, z0 + 6, S_, 'parked');
  }

  function boardwalk(x0, z0, x1, z1, i, j) {
    fill(x0, GY, z0, x1, GY, z1, B.WOOD_DARK);
    workingShop(x0 + 1, z0 + 1, x0 + 10, z0 + 9, 'n', j < 6 ? ['SURF SHACK', '#3d9ad8', '#ffffff', 'clothes'] : ['FISH & CHIPS', '#3d6fd8', '#ffe14a', 'food'], B.SIDING);
    workingShop(x0 + 12, z0 + 1, x0 + 21, z0 + 9, 'n', ['ICE CREAM', '#ffe0f0', '#d8392b', 'food'], B.STUCCO_MINT);
    workingShop(x0 + 23, z0 + 1, x1 - 1, z0 + 9, 'n', ['ARCADE', '#b46cff', '#ffe14a'], B.STUCCO);
    for (let x = x0 + 2; x < x1; x += 6) palm(x, z1 - 3, GY + 1);
    for (let x = x0 + 4; x < x1 - 2; x += 8) bench(x, z0 + 14, true);
    info.boardwalks.push(Math.floor((z0 + z1) / 2));
  }

  function villageCentre(x0, z0, x1, z1) {
    const clinic = building(x0 + 1, z0 + 1, x0 + 14, z0 + 11, 1, { wall: B.STUCCO, win: B.WIN_FRAME, corner: B.PILLAR, door: 's', every: 3 });
    pitched(x0 + 1, z0 + 1, x0 + 14, z0 + 11, clinic.top + 1, B.ROOF, B.STUCCO);
    const [cx, cz] = face(x0 + 7, z0 + 11, 's');
    sign([['VILLAGE CLINIC', 30]], '#ffffff', '#d8392b', 6, 1, cx + 0.5, GY + 4.4, cz, 's');
    furnish.hospital(clinic, x0 + 1, z0 + 1, x0 + 14, z0 + 11, 's', 'Village Clinic', true);
    const store = shop(x0 + 17, z0 + 1, x1 - 1, z0 + 11, 's', 'GENERAL STORE', ['#6a4428', '#fff6e0'], B.PLANKS, 1);
    furnish.store(store, x0 + 17, z0 + 1, x1 - 1, z0 + 11, 's', 'mart', 'General Store', { title: 'Shopkeeper' });
    const cop = building(x0 + 1, z1 - 12, x0 + 16, z1 - 1, 1, { wall: B.STONE_BRICK, win: B.GLASS_BLUE, corner: B.CONCRETE, door: 'n', every: 2 });
    const [px, pz] = face(x0 + 8, z1 - 12, 'n');
    sign([['VILLAGE POLICE', 30]], '#1e3160', '#ffffff', 6, 1, px + 0.5, GY + 4.4, pz, 'n');
    furnish.police(cop, x0 + 1, z1 - 12, x0 + 16, z1 - 1, 'n', 'Village Police', 2);
    // A little church with a steeple, and the village green with a well.
    const ch = building(x0 + 20, z1 - 14, x1 - 2, z1 - 2, 1, { fh: 6, wall: B.STONE_BRICK, win: B.GLASS_BLUE, corner: B.PILLAR, door: 'n', every: 2 });
    pitched(x0 + 20, z1 - 14, x1 - 2, z1 - 2, ch.top + 1, B.ROOF_DARK, B.STONE_BRICK);
    fill(x1 - 5, ch.top + 1, z1 - 12, x1 - 4, ch.top + 9, z1 - 11, B.STONE_BRICK);
    fill(x1 - 5, ch.top + 10, z1 - 12, x1 - 4, ch.top + 11, z1 - 11, B.ROOF_DARK);
    const gx = Math.floor((x0 + x1) / 2);
    const gz = Math.floor((z0 + z1) / 2);
    ring(gx - 1, gz - 1, gx + 1, gz + 1, GY + 1, B.COBBLE);
    fill(gx, SEA, gz, gx, GY, gz, B.AIR);
    for (const [x, z] of [[gx - 1, gz - 1], [gx + 1, gz + 1]]) set(x, GY + 2, z, B.WOOD_DARK);
    fill(gx - 1, GY + 3, gz - 1, gx + 1, GY + 3, gz + 1, B.ROOF);
    tree(gx - 6, gz);
    tree(gx + 6, gz);
    cube(x1 - 5, ch.top + 12, z1 - 12);
  }

  function village(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 91 + j * 29);
    const st = () => HOUSES[[0, 2, 5, 6][Math.floor(r() * 4)]];
    house(x0 + 3, z0 + 3, 9, 8, 'n', st(), `village${i}${j}a`);
    house(x0 + 21, z0 + 3, 9, 8, 'n', st(), `village${i}${j}b`);
    house(x0 + 3, z1 - 11, 9, 8, 's', st(), `village${i}${j}c`);
    house(x0 + 21, z1 - 11, 9, 8, 's', st(), `village${i}${j}d`);
    for (let x = x0 + 1; x <= x1 - 1; x += 2) set(x, GY + 1, z0 + 15, B.WOOD_DARK);
    for (let k = 0; k < 8; k++) tree(x0 + 2 + Math.floor(r() * (x1 - x0 - 4)), z0 + 13 + Math.floor(r() * 7));
    flowers(x0 + 13, z0 + 12, x0 + 19, z0 + 20);
  }

  // Crops in rows, hay bales and a scarecrow.
  function fields(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 37 + j * 53);
    const alongX = r() < 0.5;
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      for (let x = x0 + 1; x <= x1 - 1; x++) {
        const k = alongX ? z - z0 : x - x0;
        if (k % 3 === 0) set(x, GY, z, B.FARMLAND);
        else {
          set(x, GY, z, B.FARMLAND);
          if (r() < 0.93) set(x, GY + 1, z, (i + j) % 3 === 0 ? B.HEDGE : B.WHEAT);
        }
      }
    }
    // Paths in and a scarecrow.
    const mx = Math.floor((x0 + x1) / 2);
    for (let z = z0; z <= z1; z++) {
      set(mx, GY, z, B.DIRT);
      set(mx, GY + 1, z, B.AIR);
    }
    fill(mx + 3, GY + 1, z0 + 12, mx + 3, GY + 3, z0 + 12, B.LOG);
    set(mx + 3, GY + 4, z0 + 12, B.HAY);
    fill(mx + 2, GY + 3, z0 + 12, mx + 4, GY + 3, z0 + 12, B.PLANKS);
    for (let k = 0; k < 4; k++) {
      const x = x0 + 3 + Math.floor(r() * (x1 - x0 - 6));
      const z = z0 + 3 + Math.floor(r() * (z1 - z0 - 6));
      fill(x, GY + 1, z, x + 1, GY + 1, z, B.HAY);
      if (r() < 0.5) set(x, GY + 2, z, B.HAY);
    }
    for (let x = x0; x <= x1; x += 2) {
      if (Math.abs(x - mx) > 2) set(x, GY + 1, z0, B.WOOD_DARK);
      if (Math.abs(x - mx) > 2) set(x, GY + 1, z1, B.WOOD_DARK);
    }
  }

  function farm(x0, z0, x1, z1, i, j) {
    fields(x0, z0 + 18, x1, z1, i, j);
    fill(x0, GY, z0, x1, GY, z0 + 17, B.GRASS);
    fill(x0, GY + 1, z0, x1, GY + 2, z0 + 17, B.AIR);
    house(x0 + 2, z0 + 2, 10, 8, 's', HOUSES[6], `farm${i}${j}`);
    // The big red barn.
    const bx0 = x0 + 15;
    const bz0 = z0 + 1;
    const bx1 = x0 + 27;
    const bz1 = z0 + 12;
    const b = building(bx0, bz0, bx1, bz1, 1, { fh: 6, wall: B.RED_PANEL, win: null, corner: B.PLANKS, door: 's', doorW: 4, doorH: 4, parapet: false, floor: B.GRAVEL });
    pitched(bx0, bz0, bx1, bz1, b.top + 1, B.ROOF_DARK, B.RED_PANEL);
    fill(bx0 + 2, GY + 1, bz0 + 2, bx0 + 4, GY + 2, bz0 + 4, B.HAY);
    // A silo.
    const sx = x1 - 2;
    const sz = z0 + 5;
    for (let y = GY + 1; y <= GY + 14; y++) {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= 5 && dx * dx + dz * dz >= 2) set(sx + dx, y, sz + dz, B.METAL);
    }
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= 5) set(sx + dx, GY + 15, sz + dz, B.ROOF);
    cube(sx, GY + 16, sz);
    fill(x0 + 4, GY + 1, z0 + 13, x0 + 5, GY + 1, z0 + 14, B.HAY);
    park(x0 + 9, z0 + 14, Math.PI / 2, 'pickup');
  }

  function forest(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 23 + j * 41);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (r() < 0.3) set(x, GY, z, B.DARKGRASS);
    for (let z = z0 + 2; z <= z1 - 2; z += 4) {
      for (let x = x0 + 2; x <= x1 - 2; x += 4) {
        if (r() < 0.25) continue;
        tree(x + Math.floor(r() * 3) - 1, z + Math.floor(r() * 3) - 1, 4 + Math.floor(r() * 4));
      }
    }
    // Sometimes a log cabin in a clearing.
    if (r() < 0.35) {
      const cx = x0 + 10 + Math.floor(r() * 10);
      const cz = z0 + 10 + Math.floor(r() * 10);
      fill(cx - 5, GY + 1, cz - 5, cx + 5, GY + 8, cz + 5, B.AIR);
      const b = building(cx - 3, cz - 3, cx + 3, cz + 2, 1, { wall: B.LOG, win: B.WIN_FRAME, corner: B.LOG, door: 's', every: 3, parapet: false, floor: B.PLANKS });
      pitched(cx - 3, cz - 3, cx + 3, cz + 2, b.top + 1, B.ROOF_DARK, B.LOG);
      if (r() < 0.5) cube(cx, b.top + 5, cz);
    }
  }

  // Hills: stone with grass on top, snow on the peaks, pines on the slopes.
  function mountain(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 17 + j * 83);
    let peak = [0, x0, z0];
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
        const fade = Math.min(1, edge / 8);
        const n = fbm2(x * 0.045, z * 0.045, 777, 4);
        const h = Math.floor(Math.max(0, n - 0.3) * 60 * fade);
        if (h <= 0) continue;
        fill(x, GY, z, x, GY + h - 1, z, B.STONE);
        const top = GY + h;
        set(x, top, z, h > 17 ? B.SNOW : h > 13 ? B.STONE : B.GRASS);
        if (h > peak[0]) peak = [h, x, z];
        if (h > 3 && h < 12 && r() < 0.025) tree(x, z, 4);
      }
    }
    // Trees can't sit on hills, so plant them properly.
    for (let k = 0; k < 10; k++) {
      const x = x0 + 2 + Math.floor(r() * (x1 - x0 - 4));
      const z = z0 + 2 + Math.floor(r() * (z1 - z0 - 4));
      let y = GY;
      while (get(x, y + 1, z)) y++;
      if (get(x, y, z) === B.GRASS && y < GY + 12) {
        fill(x, y + 1, z, x, y + 5, z, B.LOG);
        for (let yy = y + 3; yy <= y + 7; yy++) {
          const rad = yy >= y + 6 ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) if (Math.abs(dx) + Math.abs(dz) <= rad && !get(x + dx, yy, z + dz)) set(x + dx, yy, z + dz, B.LEAVES);
        }
      }
    }
    if (peak[0] > 10 && (i + j) % 2 === 0) cube(peak[1], GY + peak[0] + 1, peak[2]);
  }

  function lake(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 29 + j * 61);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const rx = (x1 - x0) / 2 - 2;
    const rz = (z1 - z0) / 2 - 2;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const wob = 1 + (fbm2(x * 0.15, z * 0.15, 99, 2) - 0.5) * 0.35;
        const e = (((x - mx) / rx) ** 2 + ((z - mz) / rz) ** 2) / wob;
        if (e < 0.85) {
          fill(x, SEA - 2, z, x, GY + 2, z, B.AIR);
          set(x, SEA - 3, z, e < 0.5 ? B.GRAVEL : B.SAND);
        } else if (e < 1.05) set(x, GY, z, B.SAND);
      }
    }
    // A wooden dock out into the water.
    const dz = Math.round(mz);
    for (let x = x0 + 3; x <= Math.round(mx) - 2; x++) {
      set(x, GY, dz, B.WOOD_DARK);
      set(x, GY, dz + 1, B.WOOD_DARK);
      if (x % 3 === 0) fill(x, SEA - 2, dz - 1, x, GY - 1, dz - 1, B.LOG);
    }
    if ((i + j) % 2) cube(Math.round(mx) - 2, GY + 1, dz);
    for (let k = 0; k < 10; k++) {
      const a = r() * Math.PI * 2;
      const x = Math.round(mx + Math.cos(a) * (rx + 1.5));
      const z = Math.round(mz + Math.sin(a) * (rz + 1.5));
      if (get(x, GY, z) === B.GRASS) tree(x, z);
    }
  }

  function camp(x0, z0, x1, z1, i, j) {
    forest(x0, z0, x1, z1, i, j);
    const mx = Math.floor((x0 + x1) / 2);
    const mz = Math.floor((z0 + z1) / 2);
    fill(mx - 9, GY + 1, mz - 9, mx + 9, GY + 10, mz + 9, B.AIR);
    fill(mx - 9, GY, mz - 9, mx + 9, GY, mz + 9, B.GRASS);
    // Campfire with logs round it, and tents.
    ring(mx - 1, mz - 1, mx + 1, mz + 1, GY + 1, B.COBBLE);
    set(mx, GY + 1, mz, B.MAGMA);
    for (const [dx, dz] of [[-3, 0], [3, 0], [0, 3]]) set(mx + dx, GY + 1, mz + dz, B.LOG);
    const tent = (tx, tz, id) => {
      for (let k = 0; k < 3; k++) {
        fill(tx - 2 + k, GY + 1 + k, tz, tx - 2 + k, GY + 1 + k, tz + 3, id);
        fill(tx + 2 - k, GY + 1 + k, tz, tx + 2 - k, GY + 1 + k, tz + 3, id);
      }
    };
    tent(mx - 6, mz - 7, B.AWNING);
    tent(mx + 5, mz - 7, B.STUCCO_MINT);
    tent(mx + 5, mz + 4, B.RED_PANEL);
    fill(mx - 7, GY + 1, mz + 5, mx - 5, GY + 1, mz + 5, B.WOOD_DARK);
    cube(mx, GY + 3, mz - 6);
  }

  function meadow(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 13 + j * 7);
    flowers(x0 + 2, z0 + 2, x0 + 8, z0 + 8);
    for (let k = 0; k < 5; k++) tree(x0 + 2 + Math.floor(r() * (x1 - x0 - 4)), z0 + 2 + Math.floor(r() * (z1 - z0 - 4)));
  }

  // Factories and warehouses.
  function industrial(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 43 + j * 11);
    fill(x0, GY, z0, x1, GY, z1, B.CONCRETE);
    if ((i + j) % 2 === 0) {
      const b = building(x0 + 2, z0 + 2, x1 - 2, z0 + 18, 2, { fh: 5, wall: B.CONCRETE, win: B.WINDOW, corner: B.METAL, band: B.METAL, door: 's', doorW: 5, doorH: 4, every: 4, roof: B.METAL, floorsInside: false });
      for (let k = 0; k < 3; k++) {
        const x = x0 + 6 + k * 8;
        fill(x, b.top + 1, z0 + 6, x + 1, b.top + 10 + k * 2, z0 + 7, B.BRICK);
      }
      const [sx, sz] = face(Math.floor((x0 + x1) / 2), z0 + 18, 's');
      sign([[pick(r, ['CUBE STEEL', 'BLOCK BRICKS CO.', 'PIXEL PAINTS', 'VOXEL MOTORS']), 36]], '#2a2b2e', '#ffffff', 9, 1.2, sx + 0.5, GY + 8.2, sz, 's');
    } else {
      for (const [bz0, bz1] of [[z0 + 2, z0 + 13], [z1 - 13, z1 - 2]]) {
        const b = building(x0 + 2, bz0, x1 - 2, bz1, 1, { fh: 7, wall: B.GARAGE, win: null, corner: B.METAL, door: bz0 === z0 + 2 ? 's' : 'n', doorW: 4, doorH: 4, roof: B.METAL, parapet: false });
        roofTop(x0 + 2, bz0, x1 - 2, bz1, b.roofY, { vents: true });
      }
    }
    // Stacked crates and a container or two.
    for (let k = 0; k < 4; k++) {
      const x = x0 + 3 + Math.floor(r() * (x1 - x0 - 8));
      const z = z1 - 6 + Math.floor(r() * 3);
      if (get(x, GY + 1, z)) continue;
      fill(x, GY + 1, z, x + 1, GY + 1 + Math.floor(r() * 2), z + 1, B.PLANKS);
    }
    park(x1 - 5, z1 - 4, N_, r() < 0.5 ? 'pickup' : 'parked');
  }
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  // The docks: stacks of containers and a big crane.
  function port(x0, z0, x1, z1, i, j) {
    const r = mulberry32(i * 67 + j * 3);
    fill(x0, GY, z0, x1, GY, z1, B.CONCRETE);
    const colors = [B.CONTAINER_RED, B.CONTAINER_BLUE, B.CONTAINER_GREEN];
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 4; k++) {
        const x = x0 + 2 + k * 8;
        const z = z0 + 3 + row * 5;
        const h = 1 + Math.floor(r() * 3);
        for (let y = 0; y < h; y++) fill(x, GY + 1 + y * 2, z, x + 5, GY + 2 + y * 2, z + 2, pick(r, colors));
      }
    }
    // A gantry crane over the quay.
    const cz = z1 - 8;
    for (const x of [x0 + 3, x1 - 3]) {
      fill(x, GY + 1, cz - 2, x, GY + 16, cz - 2, B.METAL);
      fill(x, GY + 1, cz + 2, x, GY + 16, cz + 2, B.METAL);
    }
    fill(x0 + 3, GY + 17, cz - 2, x1 - 3, GY + 17, cz + 2, B.GOLD);
    fill(x0 + 12, GY + 14, cz - 1, x0 + 15, GY + 16, cz + 1, B.GLASS_BLUE);
    if (i % 2) cube(x0 + 5, GY + 18, cz);
    for (let x = x0 + 1; x <= x1 - 1; x += 3) set(x, GY + 1, z1 - 1, B.METAL);
  }

  function homesLot(x0, z0, x1, z1, i, j) {
    kit.lots.homes(x0, z0, x1, z1, i, j);
  }

  const builders = {
    h: homesLot,
    s: strip,
    p: smallPark,
    W: plaza,
    G: gym,
    D: dealer,
    L: library,
    R: speedway,
    B: beachHomes,
    b: boardwalk,
    V: village,
    v: villageCentre,
    F: farm,
    f: fields,
    T: forest,
    m: mountain,
    l: lake,
    k: camp,
    I: industrial,
    P: port,
    x: meadow,
  };
  return { builders, furnish };
}
