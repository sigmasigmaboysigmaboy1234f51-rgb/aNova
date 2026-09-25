import * as THREE from 'three';
import { rayBox } from './mob.js';
import { LANE, GY } from './city.js';
import { SEA } from './world.js';

// Cars for Adventure mode. You can drive any car that's parked (press E),
// and traffic drives itself round the road grid. Cars have working brake
// lights, indicators and reversing lights, doors that open, headlights at
// night, skid marks when you slide, and they dent, smoke, catch fire and
// blow up when they take too much damage.

export const CAR_TYPES = {
  sedan: { name: 'Sedan', shape: 'sedan', len: 4, wid: 1.9, hgt: 1.5, speed: 22, accel: 9, turn: 1, hp: 120, colors: ['#3d6fd8', '#d8392b', '#e8e4dc', '#2a2a2e', '#4d8a2c', '#8a8f96'] },
  taxi: { name: 'Taxi', shape: 'sedan', len: 4.1, wid: 1.9, hgt: 1.5, speed: 21, accel: 9, turn: 1, hp: 120, colors: ['#f2c230'] },
  police: { name: 'Police Car', shape: 'sedan', len: 4.3, wid: 1.95, hgt: 1.5, speed: 27, accel: 12, turn: 1.05, hp: 170, colors: ['#f4f1ea'] },
  sports: { name: 'Sports Car', shape: 'sports', snd: 'sports', len: 4.3, wid: 1.95, hgt: 1.15, speed: 34, accel: 16, turn: 1.15, hp: 100, colors: ['#d8392b', '#ff7a2f', '#39b8ff', '#f2c230', '#1d1d20'] },
  suv: { name: 'SUV', shape: 'suv', len: 4.6, wid: 2.05, hgt: 1.85, lift: 0.12, speed: 23, accel: 10, turn: 0.95, hp: 170, colors: ['#2a2a2e', '#e8e4dc', '#6a1f24', '#3d4f6d', '#8a8f96'] },
  pickup: { name: 'Pickup Truck', shape: 'pickup', len: 4.8, wid: 2, hgt: 1.8, speed: 20, accel: 8, turn: 0.9, hp: 180, colors: ['#4d8a2c', '#8a5a33', '#2a2a2e', '#d8392b'] },
  monster: { name: 'Monster Truck', shape: 'pickup', snd: 'monster', len: 5, wid: 2.7, hgt: 3.1, lift: 0.95, wheelR: 0.85, speed: 26, accel: 12, turn: 0.9, hp: 360, crush: true, colors: ['#39b8ff', '#6fd35a', '#b46cff'] },
  van: { name: 'Gold Van', shape: 'van', snd: 'big', len: 4.8, wid: 2.1, hgt: 2.2, speed: 23, accel: 9, turn: 0.95, hp: 220, colors: ['#f2c230'] },
  bus: { name: 'Bus', shape: 'bus', snd: 'big', len: 8, wid: 2.3, hgt: 2.8, speed: 14, accel: 5, turn: 0.7, hp: 400, colors: ['#39b8ff'] },
  icecream: { name: 'Ice Cream Van', shape: 'van', snd: 'big', len: 4.9, wid: 2.1, hgt: 2.3, speed: 16, accel: 6, turn: 0.9, hp: 180, colors: ['#ff9dc0'] },
};

const mats = new Map();
function mat(color, glow = false) {
  const key = `${color}|${glow}`;
  if (!mats.has(key)) mats.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
  return mats.get(key);
}
const geos = new Map();
function geo(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  if (!geos.has(key)) geos.set(key, new THREE.BoxGeometry(w, h, d));
  return geos.get(key);
}
// A cylinder lying along x (for wheels).
function cyl(r, w, seg = 12) {
  const key = `c${r.toFixed(3)}|${w.toFixed(3)}|${seg}`;
  if (!geos.has(key)) geos.set(key, new THREE.CylinderGeometry(r, r, w, seg).rotateZ(Math.PI / 2));
  return geos.get(key);
}
// The side profile of a car's cabin (points are [z, y]), as a solid the
// width of the car. Used for sloped windscreens and rear windows.
function profile(key, pts, width) {
  if (geos.has(key)) return geos.get(key);
  const shape = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  geos.set(key, g);
  return g;
}

// Canvas decals: text on a colour, cached by what they say.
const decals = new Map();
function decal(key, w, h, draw) {
  if (decals.has(key)) return decals.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true });
  decals.set(key, m);
  return m;
}
function textDecal(text, bg, fg, w = 256, h = 64, font = 0.62) {
  return decal(`t|${text}|${bg}|${fg}|${w}x${h}`, w, h, (ctx) => {
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.floor(h * font)}px 'Pixelify Sans', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}
const PLATES = ['BLK 204', 'CUB 777', 'VXL 042', 'BRK 318', 'MOB 900', 'PXL 128', 'GG 2026', 'FIRE 64', 'TNT 505', 'OAK 311', 'RED 001', 'YAY 123'];
function plateMat() {
  const text = PLATES[Math.floor(Math.random() * PLATES.length)];
  return decal(`plate|${text}`, 96, 24, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e3160';
    ctx.fillRect(0, 0, w, 4);
    ctx.fillStyle = '#1a1a1c';
    ctx.font = "700 17px ui-monospace, monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}
function checkerMat() {
  return decal('checker', 64, 8, (ctx) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#1a1a1c' : '#f4f1ea';
      ctx.fillRect(i * 4, j * 4, 4, 4);
    }
  });
}
// Cracked glass for badly damaged cars.
let crackTex = null;
function crackTexture() {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a4a58';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(230, 240, 250, 0.9)';
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const cx = 10 + Math.random() * 44;
    const cy = 10 + Math.random() * 44;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * (12 + Math.random() * 18), cy + Math.sin(a) * (12 + Math.random() * 18));
      ctx.stroke();
    }
  }
  crackTex = new THREE.CanvasTexture(c);
  crackTex.colorSpace = THREE.SRGBColorSpace;
  return crackTex;
}
// A soft round glow, for headlights at night.
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,225,1)');
  g.addColorStop(0.35, 'rgba(255,240,190,0.45)');
  g.addColorStop(1, 'rgba(255,230,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const GLASS = '#1d2a36';
const TIRE = '#1a1a1c';
const TRIM = '#3a3b3e';
const CHROME = '#c9ced6';
const DARK = '#1d1d20';
const TAIL = ['#6a1410', '#ff2a1a'];
const AMBER = ['#5a3a10', '#ffb020'];
const REVERSE = ['#4a4a46', '#ffffff'];

// Build a car model facing +z (+x is the car's left, the driver's side).
export function buildCar(type, color) {
  const d = CAR_TYPES[type];
  const shape = d.shape;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const L = d.len;
  const W = d.wid;
  const H = d.hgt;
  const R = d.wheelR || 0.36;
  const lift = d.lift || 0;
  const base = 0.3 + lift;
  const own = [];
  const perCar = (m) => {
    own.push(m);
    return m;
  };
  const glass = perCar(new THREE.MeshLambertMaterial({ color: GLASS }));
  const brake = perCar(new THREE.MeshBasicMaterial({ color: TAIL[0] }));
  const rev = perCar(new THREE.MeshBasicMaterial({ color: REVERSE[0] }));
  const indL = perCar(new THREE.MeshBasicMaterial({ color: AMBER[0] }));
  const indR = perCar(new THREE.MeshBasicMaterial({ color: AMBER[0] }));
  const paint = mat(color);
  const add = (w, h, dd, x, y, z, m, parent = body) => {
    const mesh = new THREE.Mesh(geo(w, h, dd), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  // A thin panel between two points on the car's side profile.
  const slab = (w, t, y0, z0, y1, z1, m, x = 0, parent = body) => {
    const len = Math.hypot(y1 - y0, z1 - z0);
    const mesh = new THREE.Mesh(geo(w, t, len), m);
    mesh.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.rotation.x = Math.atan2(-(y1 - y0), z1 - z0);
    parent.add(mesh);
    return mesh;
  };
  const both = (fn) => {
    fn(1);
    fn(-1);
  };
  const dents = [];
  let deck = base + 0.55;
  let door = null;
  let smokeZ = L * 0.34;
  let sirenParts = null;

  if (shape === 'bus') {
    // --- A city bus: one long box with a band of windows. ---
    deck = base + 0.7;
    add(W, H - base, L, 0, (base + H) / 2, 0, paint);
    add(W + 0.02, 0.35, L - 0.1, 0, base + 0.5, 0, mat('#f4f1ea'));
    for (let i = 0; i < 6; i++) {
      const z = -L / 2 + 0.9 + i * ((L - 2.4) / 5);
      both((s) => add(0.04, 0.85, 1.05, (s * W) / 2, H - 0.72, z, glass));
    }
    add(W - 0.3, 1.05, 0.05, 0, H - 0.8, L / 2 + 0.01, glass);
    add(W - 0.5, 0.24, 0.05, 0, H - 0.14, L / 2 + 0.02, textDecal('DOWNTOWN', '#1a1a1c', '#ffb020', 256, 48));
    both((s) => {
      add(0.02, 0.3, 3.2, s * (W / 2 + 0.012), base + 0.5, -0.4, textDecal('BLOCKTON TRANSIT', null, '#1e3160', 512, 48));
    });
    // Folding doors on the kerb side (the right).
    add(0.04, 1.8, 0.9, -W / 2 - 0.01, base + 1.05, L / 2 - 0.9, glass);
    add(0.05, 1.8, 0.04, -W / 2 - 0.02, base + 1.05, L / 2 - 0.9, mat(DARK));
    add(W * 0.6, 0.25, 0.6, 0, H + 0.12, -L * 0.2, mat('#d8dde4'));
    smokeZ = -L / 2 + 0.4;
  } else if (shape === 'van') {
    // --- Box vans: the gold van and the ice cream van. ---
    deck = base + 0.6;
    const ice = type === 'icecream';
    add(W, deck - base, L, 0, (base + deck) / 2, 0, paint);
    const boxBack = -L / 2;
    const boxFront = L * 0.14;
    add(W - 0.04, H - deck, boxFront - boxBack, 0, (deck + H) / 2, (boxFront + boxBack) / 2, paint);
    // The cab: a sloped windscreen in front of the box.
    const cab = profile(`van|${type}`, [[boxFront, deck], [L / 2 - 0.35, deck], [boxFront + 0.25, H - 0.15], [boxFront, H - 0.15]], W - 0.12);
    body.add(new THREE.Mesh(cab, glass));
    add(W - 0.1, 0.12, 0.5, 0, H - 0.1, boxFront + 0.18, paint);
    both((s) => add(0.07, H - deck - 0.1, 0.07, s * (W / 2 - 0.08), (deck + H) / 2, boxFront + 0.02, paint));
    if (ice) {
      // A serving hatch, a striped awning, a giant cone and a sign.
      add(0.04, 0.7, 1.6, -W / 2 - 0.01, deck + 0.55, -L * 0.12, glass);
      for (let i = 0; i < 5; i++) add(0.5, 0.06, 0.34, -W / 2 - 0.22, deck + 1.02, -L * 0.12 - 0.68 + i * 0.34, mat(i % 2 ? '#f4f1ea' : '#ff5a8a'));
      add(0.5, 0.6, 0.5, 0, H + 0.3, -0.5, mat('#d9a84a'));
      add(0.7, 0.45, 0.7, 0, H + 0.8, -0.5, mat('#fff6f0'));
      add(0.5, 0.3, 0.5, 0, H + 1.1, -0.5, mat('#ff9dc0'));
      add(0.14, 0.14, 0.14, 0, H + 1.32, -0.5, mat('#d8392b'));
      both((s) => {
        add(0.02, 0.34, 2.2, s * (W / 2 + 0.012), H - 0.3, -L * 0.15, textDecal('ICE CREAM', '#f4f1ea', '#ff3a7a', 256, 48));
      });
    } else {
      add(W + 0.02, 0.22, L - 0.4, 0, deck + 0.28, -0.05, mat(DARK));
      both((s) => {
        add(0.02, 0.36, 2.4, s * (W / 2 + 0.012), deck + 0.75, -L * 0.14, textDecal('NOT A GETAWAY VAN', null, '#1a1a1c', 512, 64));
      });
      add(W * 0.5, 0.5, 0.02, 0, deck + 0.6, -L / 2 - 0.02, textDecal('$', '#1a1a1c', '#f2c230', 64, 64, 0.8));
    }
    smokeZ = L * 0.38;
  } else {
    // --- Cars with a cabin: sedans, taxis, police cars, sports cars, SUVs,
    // pickups and the monster truck. ---
    const sports = shape === 'sports';
    const suv = shape === 'suv';
    const pickup = shape === 'pickup';
    deck = base + (sports ? 0.42 : suv ? 0.68 : pickup ? 0.62 : 0.55);
    // Lower body, a little hood bulge, side skirts.
    add(W, deck - base, L, 0, (base + deck) / 2, 0, paint);
    add(W - 0.5, 0.05, L * 0.24, 0, deck + 0.02, L * 0.33, paint);
    add(W + 0.02, 0.1, L - 0.6, 0, base + 0.05, 0, mat(TRIM));
    // The cabin: [A-pillar base, roof front, roof back, C-pillar base] as
    // fractions of the length.
    const cab = sports ? [0.12, -0.03, -0.2, -0.4] : suv ? [0.27, 0.15, -0.46, -0.49] : pickup ? [0.26, 0.14, -0.08, -0.1] : [0.2, 0.03, -0.24, -0.37];
    const [aZ, rfZ, rbZ, cZ] = cab.map((k) => k * L);
    const gw = W - 0.16;
    const house = profile(`cab|${type}`, [[cZ, deck], [aZ, deck], [rfZ, H - 0.06], [rbZ, H - 0.06]], gw);
    body.add(new THREE.Mesh(house, glass));
    add(gw + 0.04, 0.08, rfZ - rbZ + 0.06, 0, H - 0.02, (rfZ + rbZ) / 2, paint);
    // Pillars.
    both((s) => {
      const x = s * (gw / 2 + 0.005);
      slab(0.06, 0.07, deck, aZ, H - 0.04, rfZ, paint, x);
      slab(0.06, 0.07, deck, cZ, H - 0.04, rbZ, paint, x);
      if (!pickup) add(0.06, H - deck, 0.1, x, (deck + H) / 2, (aZ + cZ) / 2 - 0.1, paint);
    });
    // Mirrors, door seams and handles.
    both((s) => {
      add(0.16, 0.12, 0.12, s * (W / 2 + 0.07), deck + 0.08, aZ - 0.08, paint);
      add(0.012, deck - base - 0.12, 0.02, s * (W / 2 + 0.004), (base + deck) / 2 + 0.04, aZ + 0.05, mat(DARK));
      if (!pickup && !sports) add(0.012, deck - base - 0.12, 0.02, s * (W / 2 + 0.004), (base + deck) / 2 + 0.04, (aZ + cZ) / 2 - 0.1, mat(DARK));
      add(0.03, 0.04, 0.14, s * (W / 2 + 0.01), deck - 0.1, (aZ + cZ) / 2 + 0.05, mat(CHROME));
    });
    // The driver's door, on a hinge at its front edge.
    const doorLen = (aZ - cZ) * (pickup ? 0.9 : 0.5);
    door = new THREE.Group();
    door.position.set(W / 2 + 0.012, (base + deck) / 2 + 0.03, aZ + 0.02);
    body.add(door);
    add(0.03, deck - base - 0.1, doorLen, 0, 0, -doorLen / 2, paint, door);
    add(0.02, 0.035, 0.12, 0.02, (deck - base) / 2 - 0.15, -doorLen + 0.2, mat(CHROME), door);
    if (sports) {
      // Racing stripes, a wing and side vents.
      for (const x of [-0.18, 0.18]) {
        add(0.2, 0.012, L * 0.5, x, deck + 0.006, L * 0.25, mat('#f4f1ea'));
        add(0.2, 0.012, rfZ - rbZ, x, H + 0.021, (rfZ + rbZ) / 2, mat('#f4f1ea'));
        add(0.2, 0.012, L / 2 + cZ, x, deck + 0.006, (-L / 2 + cZ) / 2, mat('#f4f1ea'));
      }
      add(W - 0.1, 0.06, 0.34, 0, deck + 0.3, -L / 2 + 0.22, mat(DARK));
      both((s) => {
        add(0.08, 0.3, 0.08, s * 0.6, deck + 0.14, -L / 2 + 0.25, mat(DARK));
        add(0.02, 0.16, 0.5, s * (W / 2 + 0.005), base + 0.24, -L * 0.1, mat(DARK));
      });
    }
    if (suv) {
      // Roof rails and a spare wheel on the back.
      both((s) => add(0.06, 0.06, rfZ - rbZ - 0.2, s * (gw / 2 - 0.1), H + 0.05, (rfZ + rbZ) / 2, mat(DARK)));
      for (let k = 0; k < 3; k++) add(gw - 0.1, 0.04, 0.05, 0, H + 0.09, rbZ + 0.4 + k * ((rfZ - rbZ - 0.8) / 2), mat(DARK));
      const spare = new THREE.Mesh(cyl(0.34, 0.24), mat(TIRE));
      spare.rotation.y = Math.PI / 2;
      spare.position.set(0, (base + deck) / 2 + 0.2, -L / 2 - 0.13);
      body.add(spare);
      const hub = new THREE.Mesh(cyl(0.18, 0.26), mat('#9aa0a8'));
      hub.rotation.y = Math.PI / 2;
      hub.position.copy(spare.position);
      body.add(hub);
    }
    if (pickup) {
      // The open bed behind the cab.
      const bedF = cZ - 0.05;
      const bedB = -L / 2;
      add(W - 0.3, 0.05, bedF - bedB - 0.1, 0, deck - 0.02, (bedF + bedB) / 2, mat(DARK));
      both((s) => add(0.1, 0.42, bedF - bedB, s * (W / 2 - 0.05), deck + 0.21, (bedF + bedB) / 2, paint));
      add(W, 0.42, 0.1, 0, deck + 0.21, bedB + 0.05, paint);
      add(W - 0.2, 0.08, 0.08, 0, deck + 0.46, bedB + 0.05, mat(DARK));
      if (d.monster) {
        // A roll bar with lights, flames down the sides and chunky
        // suspension showing under the body.
        add(W - 0.3, 0.1, 0.1, 0, H + 0.2, rbZ - 0.1, mat(DARK));
        both((s) => add(0.1, 0.35, 0.1, s * (W / 2 - 0.2), H + 0.02, rbZ - 0.1, mat(DARK)));
        for (let i = 0; i < 4; i++) add(0.2, 0.14, 0.14, -0.5 + i * 0.33, H + 0.32, rbZ - 0.1, mat('#fff6d0', true));
        both((s) => {
          const flames = ['#ffd84a', '#ff7a2f', '#d8392b'];
          for (let i = 0; i < 5; i++) add(0.02, 0.14 + i * 0.05, 0.36, s * (W / 2 + 0.01), base + 0.2 + i * 0.025, L * 0.32 - i * 0.34, mat(flames[i % 3]));
        });
        for (const z of [-1, 1]) {
          add(W - 0.6, 0.16, 0.16, 0, R, z * L * 0.34, mat(DARK));
          both((s) => add(0.14, base - R + 0.1, 0.14, s * (W / 2 - 0.55), (R + base) / 2, z * L * 0.34 + 0.25, mat('#ff7a2f')));
        }
      }
    }
    if (type === 'taxi') {
      add(0.8, 0.24, 0.3, 0, H + 0.12, (rfZ + rbZ) / 2, mat('#fff6c8', true));
      both((s) => {
        add(0.02, 0.2, 0.7, s * 0.41, H + 0.12, (rfZ + rbZ) / 2, textDecal('TAXI', '#1a1a1c', '#ffd23f', 128, 40));
        add(0.02, 0.1, L * 0.62, s * (W / 2 + 0.013), deck - 0.12, 0, checkerMat());
      });
    }
    if (type === 'police') {
      // Black and white, a push bar, a light bar and POLICE on the doors.
      add(W + 0.01, 0.06, L / 2 - aZ + 0.02, 0, deck + 0.005, (L / 2 + aZ) / 2, mat(DARK));
      add(W + 0.01, 0.06, L / 2 + cZ, 0, deck + 0.005, (-L / 2 + cZ) / 2, mat(DARK));
      add(W - 0.4, 0.32, 0.1, 0, base + 0.2, L / 2 + 0.22, mat(DARK));
      add(1.2, 0.1, 0.3, 0, H + 0.06, (rfZ + rbZ) / 2, mat(DARK));
      const red = add(0.5, 0.16, 0.26, -0.3, H + 0.18, (rfZ + rbZ) / 2, mat('#ff2a2a', true));
      const blue = add(0.5, 0.16, 0.26, 0.3, H + 0.18, (rfZ + rbZ) / 2, mat('#2a6aff', true));
      add(0.12, 0.12, 0.27, 0, H + 0.18, (rfZ + rbZ) / 2, mat('#ffffff', true));
      sirenParts = { red, blue };
      both((s) => {
        add(0.02, 0.24, 1.3, s * (W / 2 + 0.015), (base + deck) / 2 + 0.04, (aZ + cZ) / 2 + 0.1, textDecal('POLICE', null, '#1e3160', 256, 56));
      });
      const back = add(0.9, 0.16, 0.02, 0, deck - 0.12, -L / 2 - 0.012, textDecal('DIAL 5050', null, '#f4f1ea', 256, 48));
      back.rotation.y = Math.PI;
    }
    if (type === 'sedan' || type === 'taxi') add(0.02, 0.4, 0.02, -gw / 2 + 0.15, H + 0.2, rbZ + 0.2, mat(DARK));
    smokeZ = L * 0.36;
  }

  // --- Lights, bumpers, number plates (everything but the bus shares these) ---
  const front = L / 2;
  const lightY = shape === 'bus' ? base + 0.35 : deck - 0.17;
  both((s) => {
    add(0.44, 0.2, 0.04, s * (W / 2 - 0.32), lightY, front - 0.005, mat(CHROME));
    add(0.36, 0.14, 0.05, s * (W / 2 - 0.32), lightY, front + 0.005, mat('#fff6d0', true));
    add(0.12, 0.1, 0.05, s * (W / 2 - 0.07), lightY, front + 0.004, s > 0 ? indL : indR);
    add(0.4, 0.15, 0.05, s * (W / 2 - 0.3), lightY + 0.02, -front - 0.005, brake);
    add(0.12, 0.1, 0.05, s * (W / 2 - 0.07), lightY + 0.02, -front - 0.004, s > 0 ? indL : indR);
    add(0.12, 0.09, 0.05, s * (W / 2 - 0.58), lightY + 0.02, -front - 0.004, rev);
  });
  if (shape !== 'bus' && shape !== 'van') {
    add(W * 0.4, 0.17, 0.05, 0, lightY - 0.02, front + 0.004, mat(DARK));
    add(W * 0.4, 0.03, 0.06, 0, lightY + 0.02, front + 0.006, mat(CHROME));
  }
  const bumperMat = shape === 'sports' ? paint : mat(TRIM);
  const fb = add(W + 0.06, 0.18, 0.2, 0, base + 0.1, front, bumperMat);
  const rb = add(W + 0.06, 0.18, 0.2, 0, base + 0.1, -front, bumperMat);
  const plate = plateMat();
  add(0.44, 0.11, 0.02, 0, base + 0.12, front + 0.11, plate);
  const rp = add(0.44, 0.11, 0.02, 0, base + 0.12, -front - 0.11, plate);
  rp.rotation.y = Math.PI;
  const ex = new THREE.Mesh(cyl(0.05, 0.2, 8), mat(DARK));
  ex.rotation.y = Math.PI / 2;
  ex.position.set(-W / 2 + 0.4, base + 0.02, -front - 0.08);
  body.add(ex);
  dents.push({ obj: fb, end: 1 }, { obj: rb, end: -1 });

  // --- Wheels: tyre, rim, hub and spokes, with an arch over each ---
  const wheels = [];
  const wz = shape === 'bus' ? L * 0.36 : d.monster ? L * 0.34 : L * 0.32;
  const tw = d.monster ? 0.7 : 0.3;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wg = new THREE.Group();
      const wx = sx * (W / 2 - tw / 2 + (d.monster ? 0.2 : 0.04));
      wg.position.set(wx, R, sz * wz);
      root.add(wg);
      wg.add(new THREE.Mesh(cyl(R, tw, d.monster ? 10 : 14), mat(TIRE)));
      const rim = new THREE.Mesh(cyl(R * 0.6, tw + 0.02, 12), mat(shape === 'sports' ? '#2a2a2e' : '#aab0b8'));
      wg.add(rim);
      wg.add(new THREE.Mesh(cyl(R * 0.2, tw + 0.05, 8), mat(DARK)));
      for (let k = 0; k < 2; k++) {
        const sp = new THREE.Mesh(geo(tw + 0.04, R * 1.1, R * 0.12), mat(shape === 'sports' ? '#c9ced6' : '#7a8088'));
        sp.rotation.x = (k * Math.PI) / 2;
        wg.add(sp);
      }
      if (d.monster) {
        // Big tread blocks round the tyre.
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const tr = new THREE.Mesh(geo(tw, 0.14, 0.24), mat(TIRE));
          tr.position.set(0, Math.cos(a) * R, Math.sin(a) * R);
          tr.rotation.x = -a;
          wg.add(tr);
        }
      }
      wheels.push({ g: wg, front: sz > 0 });
      if (!d.monster) add(0.02, 0.2, R * 2 + 0.22, sx * (W / 2 + 0.006), base + 0.02, sz * wz, mat(DARK));
    }
  }

  // --- Headlight glow and the light they throw on the road, for night ---
  const glow = new THREE.Group();
  const gm = new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.9 });
  own.push(gm);
  both((s) => {
    const sp = new THREE.Sprite(gm);
    sp.scale.set(0.9, 0.9, 1);
    sp.position.set(s * (W / 2 - 0.32), lightY, front + 0.15);
    glow.add(sp);
  });
  const poolMat = perCar(new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.2, 7), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.05, front + 3.8);
  glow.add(pool);
  glow.visible = false;
  root.add(glow);

  return {
    root,
    body,
    wheels,
    siren: sirenParts,
    door,
    dents,
    glow,
    pool,
    smoke: new THREE.Vector3(0, deck + 0.1, smokeZ),
    rearZ: -wz,
    halfTrack: W / 2 - 0.2,
    mats: { glass, brake, rev, indL, indR },
    dispose() {
      pool.geometry.dispose();
      for (const m of own) m.dispose();
    },
  };
}

// --- Skid marks: dark strips left on the road when you slide ------------------

export class Skids {
  constructor(scene) {
    this.scene = scene;
    this.max = 500;
    this.i = 0;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.26, 0.55).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#141416', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      this.max,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.s = new THREE.Vector3(1, 1, 1);
  }

  // len: how far the tyre moved since the last mark, so the marks join up.
  add(x, y, z, yaw, len = 0.55) {
    this.q.setFromAxisAngle(this.up, yaw);
    this.s.set(1, 1, Math.max(1, len / 0.5));
    this.m.compose(new THREE.Vector3(x, y + 0.03, z), this.q, this.s);
    this.mesh.setMatrixAt(this.i, this.m);
    this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, this.i === 0 ? this.max : this.i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const FIRE = [new THREE.Color('#ffd84a'), new THREE.Color('#ff7a2f'), new THREE.Color('#3a3530')];
const SMOKE = [new THREE.Color('#9a9a96'), new THREE.Color('#b8b8b2'), new THREE.Color('#7a7a76')];
const BLACK_SMOKE = [new THREE.Color('#2a2622'), new THREE.Color('#3a3530'), new THREE.Color('#1a1816')];
const TYRE_SMOKE = [new THREE.Color('#d8d8d2'), new THREE.Color('#c4c4be')];

let nextId = 1;

export class Car {
  // opts: { ai: true for traffic, color }
  constructor(adv, type, x, z, yaw, opts = {}) {
    this.adv = adv;
    this.game = adv.game;
    this.id = nextId++;
    this.type = type;
    this.def = CAR_TYPES[type];
    const cols = this.def.colors;
    this.color = opts.color || cols[Math.floor(Math.random() * cols.length)];
    const m = buildCar(type, this.color);
    this.model = m;
    this.game.scene.add(m.root);
    this.pos = new THREE.Vector3(x, adv.groundAt(x, z, GY + 2), z);
    this.yaw = yaw;
    this.speed = 0;
    this.vel = { x: 0, z: 0 };
    this.steer = 0;
    this.vy = 0;
    this.hp = this.def.hp;
    this.dead = false;
    this.deadT = 0;
    this.driver = opts.ai ? 'ai' : null;
    this.ai = null;
    this.stuckT = 0;
    this.honkT = 0;
    this.hurtT = 0;
    this.spin = 0;
    this.slip = 0;
    this.braking = false;
    this.reversing = false;
    this.pitch = 0;
    this.lastSpeed = 0;
    this.bounce = 0;
    this.bounceV = 0;
    this.doorT = 0;
    this.doorOpen = 0;
    this.signal = 0;
    this.smokeT = 0;
    this.cracked = false;
    this.jingleT = 3 + Math.random() * 6;
    this.sirenOn = type === 'police' && !!opts.ai && Math.random() < 0.3;
    this.sync(0);
  }

  get half() {
    return { l: this.def.len / 2, w: this.def.wid / 2 };
  }

  forward(out = tmp) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  dispose() {
    this.game.scene.remove(this.model.root);
    this.model.dispose();
  }

  // Swing the driver's door open for a moment (getting in or out).
  openDoor() {
    if (!this.model.door) return;
    this.doorOpen = 0.7;
    this.game.sound.door();
  }

  // Does a block get in the way of the car at (x, z)?
  blocked(x, z, y) {
    const w = this.game.world;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    const { l, w: hw } = this.half;
    // The monster truck rolls right over anything a block high.
    const heights = this.def.crush ? [1.3, 2.2] : [0.6, 1.3];
    for (const [a, b] of [
      [l, hw],
      [l, -hw],
      [-l, hw],
      [-l, -hw],
      [l, 0],
      [-l, 0],
      [0, hw],
      [0, -hw],
    ]) {
      const px = x + s * a + c * b;
      const pz = z + c * a - s * b;
      for (const dy of heights) if (w.solidP(Math.floor(px), Math.floor(y + dy), Math.floor(pz))) return true;
    }
    return false;
  }

  // Controls: throttle (-1..1), steer (-1..1), handbrake.
  drive(dt, throttle, steerIn, handbrake) {
    const d = this.def;
    this.braking = handbrake || (throttle < 0 && this.speed > 0.3) || (throttle > 0 && this.speed < -0.3);
    this.reversing = throttle < 0 && this.speed <= 0.3;
    this.handbrake = handbrake;
    if (throttle > 0) {
      if (this.speed < -0.3) this.speed = Math.min(0, this.speed + 18 * dt);
      else this.speed += d.accel * throttle * dt * (1 - Math.max(0, this.speed) / d.speed);
    } else if (throttle < 0) {
      if (this.speed > 0.3) this.speed = Math.max(0, this.speed - 18 * dt);
      else this.speed = Math.max(-d.speed * 0.35, this.speed - d.accel * 0.6 * dt);
    } else {
      const f = 2.5 * dt;
      this.speed = Math.abs(this.speed) < f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    if (handbrake) {
      const f = 9 * dt;
      this.speed = Math.abs(this.speed) < f ? 0 : this.speed - Math.sign(this.speed) * f;
    }
    this.speed *= 1 - 0.08 * dt;
    // Steering eases in, and you can't turn standing still.
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 7);
    const grip = handbrake ? 1.7 : 1;
    const sp = Math.min(Math.abs(this.speed), 12) * Math.sign(this.speed);
    this.yaw += sp * this.steer * 0.19 * d.turn * grip * dt;
    this.move(dt);
  }

  move(dt) {
    const g = this.game;
    // The car slides a little when the tyres can't keep up: a lot with the
    // handbrake on, which is how you drift.
    const fx = Math.sin(this.yaw) * this.speed;
    const fz = Math.cos(this.yaw) * this.speed;
    const grip = this.dead ? 3 : this.handbrake ? 1.6 : Math.abs(this.speed) > 14 && Math.abs(this.steer) > 0.7 ? 5 : 11;
    const k = Math.min(1, grip * dt);
    this.vel.x += (fx - this.vel.x) * k;
    this.vel.z += (fz - this.vel.z) * k;
    // How much it's sliding sideways.
    this.slip = Math.abs(this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw));
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    if (this.blocked(nx, nz, this.pos.y)) {
      // Crash: bounce back, and a hard hit hurts.
      const hit = Math.hypot(this.vel.x, this.vel.z);
      if (hit > 7) {
        const me = this.driver === 'player';
        // Computer drivers bump into things a lot: go easy on them.
        this.damage(hit * (me ? 2.2 : 0.5), null, me ? 'player' : null, Math.sign(this.speed) || 1);
        g.sound.crash(Math.min(1, hit / 20) * (me ? 1 : 0.6));
        if (me) g.player.shake = Math.max(g.player.shake, Math.min(0.5, hit / 40));
        this.bounceV = -hit * 0.05;
      }
      this.speed *= -0.25;
      this.vel.x *= -0.25;
      this.vel.z *= -0.25;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    // Stay on the ground: step up curbs, fall off edges.
    const step = this.def.crush ? 2.2 : 1.2;
    const gy = this.adv.groundAt(this.pos.x, this.pos.z, this.pos.y + step);
    if (gy > this.pos.y + 0.01) {
      this.pos.y += Math.min(gy - this.pos.y, 12 * dt);
      this.vy = 0;
    } else {
      this.vy -= 25 * dt;
      const was = this.vy;
      this.pos.y = Math.max(gy, this.pos.y + this.vy * dt);
      if (this.pos.y <= gy) {
        // Landed: the suspension soaks it up.
        if (was < -5) {
          this.bounceV = was * 0.04;
          if (this.driver === 'player') g.sound.landThud(Math.min(1, -was / 15));
        }
        this.vy = 0;
      }
    }
    // Skid marks and tyre smoke.
    const skidding = this.slip > 2.4 || (this.handbrake && Math.abs(this.speed) > 4) || (this.braking && Math.abs(this.speed) > 12);
    this.skidding = skidding && this.pos.y - gy < 0.1;
    if (this.skidding && this.adv.skids) {
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      const m = this.model;
      for (const side of [-1, 1]) {
        const x = this.pos.x + c * m.halfTrack * side + s * m.rearZ;
        const z = this.pos.z - s * m.halfTrack * side + c * m.rearZ;
        this.adv.skids.add(x, this.pos.y, z, Math.atan2(this.vel.x, this.vel.z), Math.hypot(this.vel.x, this.vel.z) * dt * 1.1);
        if (Math.random() < dt * 14) g.fx.burst(x, this.pos.y + 0.2, z, TYRE_SMOKE, 1, { speed: 0.6, size: 0.22, up: 0.8, life: 0.8, spread: 0.2, grav: -1 });
      }
    }
  }

  // Traffic: follow the lane to the next junction, then pick a new road.
  aiDrive(dt) {
    const adv = this.adv;
    if (!this.ai) this.ai = adv.traffic.pickRoute(this);
    const ai = this.ai;
    const a = ai.a;
    const b = ai.b;
    const dx = Math.sign(b.x - a.x);
    const dz = Math.sign(b.z - a.z);
    // Right-hand side of the road.
    const rx = -dz;
    const rz = dx;
    const lx = a.x + rx * LANE;
    const lz = a.z + rz * LANE;
    // Where along the road the car is.
    const along = (this.pos.x - a.x) * dx + (this.pos.z - a.z) * dz;
    const total = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
    const ahead = Math.min(total, along + 5.5);
    const tx = lx + dx * ahead;
    const tz = lz + dz * ahead;
    // Decide where to turn a little early, so the indicator can blink.
    if (total - along < 16 && !ai.next) ai.next = adv.traffic.next(b, a);
    if (ai.next) {
      const ndx = Math.sign(ai.next.x - b.x);
      const ndz = Math.sign(ai.next.z - b.z);
      const cross = dx * ndz - dz * ndx;
      this.signal = cross > 0 ? 1 : cross < 0 ? -1 : 0;
    } else this.signal = 0;
    if (total - along < 6.5) this.ai = { a: b, b: ai.next || adv.traffic.next(b, a) };
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    // How fast: slow for corners, stop for anything in front.
    let target = this.type === 'bus' ? 7 : this.type === 'icecream' ? 6 : 9;
    if (total - along < 12) target = Math.min(target, 6);
    if (this.aiTarget) target = this.aiTarget;
    // Pull over for police cars with their sirens on.
    if (!this.aiTarget && adv.police.yieldTo(this)) target = Math.min(target, 2.5);
    // Stop at red lights (and at yellow, unless it's too late to stop).
    const toNode = total - along;
    const light = adv.traffic.lightFor(b, dx, dz);
    if (!this.aiTarget && light !== 'green' && toNode > 8 && toNode < 20 && !(light === 'yellow' && toNode < 11)) {
      target = Math.min(target, Math.max(0, (toNode - 8.8) * 1.4));
    }
    const f = this.forward(tmp2);
    const block = adv.obstacleAhead(this, f);
    if (block < 9) target = Math.min(target, Math.max(0, (block - 3.2) * 1.4));
    if (block < 4.5 && this.honkT <= 0) {
      this.honkT = 3 + Math.random() * 3;
      if (this.pos.distanceTo(this.game.player.pos) < 18) this.game.sound.horn(0.5, this.type === 'bus' ? 0.7 : 1);
    }
    this.honkT -= dt;
    // Unstick: reverse a bit, and if that fails, move somewhere else.
    if (Math.abs(this.speed) < 0.4 && target > 2) {
      this.stuckT += dt;
      if (this.stuckT > 14) adv.traffic.respawn(this);
    } else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 4 && this.stuckT < 5.5) {
      this.drive(dt, -0.7, -steer, false);
      return;
    }
    const throttle = Math.max(-1, Math.min(1, (target - this.speed) * 0.6));
    this.drive(dt, throttle, steer, false);
  }

  // by: 'player' when it was you (shots, crashes, your explosions).
  // end: 1 when the front took the hit, -1 for the back.
  damage(amount, from, by = null, end = 0) {
    if (this.dead) return;
    if (by) this.lastHitBy = by;
    this.hp -= amount;
    this.hurtT = 0.15;
    // Big hits leave dents in the bumpers.
    if (amount > 12) {
      for (const dn of this.model.dents) {
        if (end && dn.end !== end) continue;
        const o = dn.obj;
        o.rotation.z += (Math.random() - 0.5) * 0.12;
        o.rotation.y += (Math.random() - 0.5) * 0.1;
        o.position.z -= dn.end * Math.min(0.12, amount * 0.004);
      }
    }
    if (!this.cracked && this.hp < this.def.hp * 0.5) {
      this.cracked = true;
      const gm = this.model.mats.glass;
      gm.map = crackTexture();
      gm.color.set('#b8c4d0');
      gm.needsUpdate = true;
      this.game.sound.glass(0.6);
    }
    if (this.hp <= 0) this.explode();
    else if (this.onHurt) this.onHurt(amount, from);
  }

  explode() {
    const g = this.game;
    this.dead = true;
    this.deadT = 0;
    this.hp = 0;
    this.speed *= 0.3;
    const at = new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z);
    // Wrecking someone else's car is a crime. The gold van is fair game.
    const mine = this.lastHitBy === 'player';
    if (mine && !this.mission && !this.mine) this.adv.police.crime(this.type === 'police' ? 'wreckCop' : 'wreck');
    this.adv.blastBy = mine ? 'player' : null;
    g.combat.explode(at, 3.2, 30, { local: true });
    this.adv.blastBy = undefined;
    g.fx.burst(at.x, at.y, at.z, FIRE, 40, { speed: 6, size: 0.18, up: 4, life: 1.2, spread: 0.8 });
    // Burnt out: everything goes dark, the door hangs open, the bumpers sag.
    const burnt = mat('#2a2622');
    this.model.root.traverse((o) => {
      if (o.isMesh) o.material = burnt;
    });
    this.model.glow.visible = false;
    if (this.model.door) this.model.door.rotation.y = -0.9 - Math.random() * 0.4;
    for (const dn of this.model.dents) dn.obj.rotation.z += (Math.random() - 0.5) * 0.5;
    this.model.body.position.y = -0.12;
    if (this.onWreck) this.onWreck();
  }

  // Did a shot along this ray hit the car? t along the ray, or null.
  hitTest(o, d, maxT) {
    const s = Math.sin(-this.yaw);
    const c = Math.cos(-this.yaw);
    const ox = o.x - this.pos.x;
    const oz = o.z - this.pos.z;
    const lo = { x: ox * c + oz * s, y: o.y - this.pos.y, z: -ox * s + oz * c };
    const ld = { x: d.x * c + d.z * s, y: d.y, z: -d.x * s + d.z * c };
    const { l, w } = this.half;
    const t = rayBox(lo, ld, -w, 0.3, -l, w, this.def.hgt, l);
    return t >= 0 && t < maxT ? t : null;
  }

  update(dt) {
    this.hurtT -= dt;
    // Drove into the sea: the engine floods.
    if (this.pos.y + 0.6 < SEA) {
      this.speed *= 1 - Math.min(1, 3 * dt);
      if (!this.dead) this.damage(12 * dt, null);
    }
    this.handbrake = false;
    if (this.dead) {
      this.deadT += dt;
      this.move(dt);
      this.speed *= 1 - 2 * dt;
      if (Math.random() < dt * 6) this.game.fx.burst(this.pos.x, this.pos.y + 1.4, this.pos.z, FIRE, 1, { speed: 0.6, size: 0.25, up: 2, life: 1.2, spread: 0.6, grav: -3 });
    } else if (this.driver === 'ai') this.aiDrive(dt);
    else if (this.driver === 'cop' && this.unit) this.adv.police.driveCop(this, dt);
    else if (this.driver !== 'player') this.drive(dt, 0, 0, true);
    if (this.driver !== 'ai') this.signal = 0;
    this.effects(dt);
    this.sync(dt);
  }

  // Smoke when it's hurt, fire when it's nearly gone, and the ice cream
  // van's tune.
  effects(dt) {
    const g = this.game;
    if (this.dead) return;
    const k = this.hp / this.def.hp;
    if (k < 0.5) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = k < 0.25 ? 0.06 : 0.18;
        const p = this.model.smoke;
        const s = Math.sin(this.yaw);
        const c = Math.cos(this.yaw);
        const x = this.pos.x + s * p.z;
        const z = this.pos.z + c * p.z;
        g.fx.burst(x, this.pos.y + p.y, z, k < 0.25 ? BLACK_SMOKE : SMOKE, 1, { speed: 0.5, size: 0.3, up: 1.6, life: 1.4, spread: 0.3, grav: -2 });
        if (k < 0.25 && Math.random() < 0.5) g.fx.burst(x, this.pos.y + p.y, z, FIRE, 1, { speed: 0.4, size: 0.16, up: 1.8, life: 0.5, spread: 0.2, grav: -3 });
      }
    }
    if (this.type === 'icecream') {
      this.jingleT -= dt;
      if (this.jingleT <= 0) {
        this.jingleT = 9;
        const d = this.pos.distanceTo(g.player.pos);
        if (d < 26) g.sound.jingle(Math.max(0.2, 1 - d / 26));
      }
    }
  }

  sync(dt) {
    const m = this.model;
    const g = this.game;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    // The body pitches when you speed up or brake, leans into turns and
    // bounces on its springs.
    const accel = dt > 0 ? (this.speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = this.speed;
    // Flattened by the monster truck.
    if (this.squash) m.body.scale.y = 1 - this.squash;
    this.pitch += (Math.max(-0.07, Math.min(0.07, accel * 0.006)) - this.pitch) * Math.min(1, dt * 6);
    this.bounceV += (-this.bounce * 60 - this.bounceV * 6) * dt;
    this.bounce += this.bounceV * dt;
    if (!this.dead) {
      m.body.rotation.x = -this.pitch;
      m.body.rotation.z = -this.steer * Math.min(1, Math.abs(this.speed) / 15) * 0.06;
      m.body.position.y = Math.max(-0.15, Math.min(0.15, this.bounce));
    }
    this.spin += (this.speed * dt) / (this.def.wheelR || 0.36);
    for (const w of m.wheels) {
      w.g.rotation.x = this.spin;
      w.g.rotation.y = w.front ? this.steer * 0.45 : 0;
    }
    if (m.siren) {
      const on = this.sirenOn || this.driver === 'cop' || (this.driver === 'player' && this.adv.siren);
      const f = Math.floor(performance.now() / 180) % 2;
      m.siren.red.visible = !on || f === 0;
      m.siren.blue.visible = !on || f === 1;
    }
    if (this.dead) return;
    // Lights.
    const night = this.adv.nightK || 0;
    const M = m.mats;
    M.brake.color.set(this.braking ? TAIL[1] : night > 0.3 ? '#b8281c' : TAIL[0]);
    M.rev.color.set(this.reversing && this.speed < -0.2 ? REVERSE[1] : REVERSE[0]);
    const blink = Math.floor(performance.now() / 380) % 2 === 0;
    const hazard = this.hp < this.def.hp * 0.25;
    const left = (this.signal < 0 || hazard) && blink;
    const right = (this.signal > 0 || hazard) && blink;
    M.indL.color.set(left ? AMBER[1] : AMBER[0]);
    M.indR.color.set(right ? AMBER[1] : AMBER[0]);
    m.glow.visible = night > 0.05;
    if (m.glow.visible) m.pool.material.opacity = 0.35 * night;
    // The driver's door.
    if (m.door) {
      this.doorOpen = Math.max(0, this.doorOpen - dt);
      const want = this.doorOpen > 0 ? -1.05 : 0;
      this.doorT += (want - this.doorT) * Math.min(1, dt * 12);
      m.door.rotation.y = this.doorT;
    }
    // Flash when shot.
    m.body.position.x = this.hurtT > 0 ? (Math.random() - 0.5) * 0.03 : 0;
    if (g.player.driving === this) m.root.visible = true;
  }
}
