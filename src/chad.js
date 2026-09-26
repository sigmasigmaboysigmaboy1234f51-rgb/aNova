import * as THREE from 'three';
import { PX, setBoxUV } from './model.js';
import { LAYOUT, partSize, faceRects } from './skin.js';

// The Giga Chad cheat: a smooth, properly human body with real muscles in
// place of the blocks. Every muscle is a rounded shape in a signed distance
// field, blended into its neighbours so the creases between them show
// (pecs, a six-pack, obliques, the V under the abs, delts, biceps, the
// horseshoe of the triceps, quads, calves). The field is turned into a
// mesh once, with shadows baked into the creases.
//
// The mesh keeps the game's skeleton: head, body, two arms and two legs
// that pivot where the blocky ones do, plus an elbow so he can flex. Its
// texture is laid out like a skin, so the spider suits fit him too.
//
// All sizes here are skin pixels (1.8 m = 32 px), x to his left, z forward.

// Where the joints are (feet at y = 0).
export const CHAD = {
  hipY: 15.6, // legs and the upper body turn here
  legX: 1.75,
  neck: [0, 28.35, -0.2], // the head turns here
  shoulder: [4.35, 25.3, 0], // arms (x is for his left arm)
  elbow: [4.8, 19.5, -0.15],
  fist: [5.02, 13.6, 0.25],
};

// --- Distance field shapes ------------------------------------------------

// Every shape knows a sphere it fits in, so far-away shapes can be skipped.
function bound(c, r, f) {
  f.b = [c[0], c[1], c[2], r];
  return f;
}

function rotm(rx = 0, ry = 0, rz = 0) {
  // Inverse rotation (world to shape), as a row-major 3x3.
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).invert().elements;
  return [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
}

// An ellipsoid (a good approximation of its true distance).
function ell([cx, cy, cz], [rx, ry, rz], rot) {
  const R = rot ? rotm(...rot) : null;
  const lo = Math.min(rx, ry, rz);
  return bound([cx, cy, cz], Math.max(rx, ry, rz), (x, y, z) => {
    let px = x - cx;
    let py = y - cy;
    let pz = z - cz;
    if (R) {
      const a = R[0] * px + R[1] * py + R[2] * pz;
      const b = R[3] * px + R[4] * py + R[5] * pz;
      const c = R[6] * px + R[7] * py + R[8] * pz;
      px = a;
      py = b;
      pz = c;
    }
    const ax = px / rx;
    const ay = py / ry;
    const az = pz / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax / rx;
    const by = ay / ry;
    const bz = az / rz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -lo;
  });
}

// A capsule that gets thinner (or fatter) from a to b.
function cone([ax, ay, az], [bx, by, bz], r1, r2 = r1) {
  const Bx = bx - ax;
  const By = by - ay;
  const Bz = bz - az;
  const l2 = Bx * Bx + By * By + Bz * Bz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const mid = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2];
  return bound(mid, Math.sqrt(l2) / 2 + Math.max(r1, r2), (x, y, z) => {
    const px = x - ax;
    const py = y - ay;
    const pz = z - az;
    const Y = px * Bx + py * By + pz * Bz;
    const Z = Y - l2;
    const qx = px * l2 - Bx * Y;
    const qy = py * l2 - By * Y;
    const qz = pz * l2 - Bz * Y;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = Y * Y * l2;
    const z2 = Z * Z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(Z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(Y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + Y * rr) * il2 - r1;
  });
}

// A box with rounded edges.
function rbox([cx, cy, cz], [hx, hy, hz], r, rot) {
  const R = rot ? rotm(...rot) : null;
  return bound([cx, cy, cz], Math.hypot(hx, hy, hz), (x, y, z) => {
    let px = x - cx;
    let py = y - cy;
    let pz = z - cz;
    if (R) {
      const a = R[0] * px + R[1] * py + R[2] * pz;
      const b = R[3] * px + R[4] * py + R[5] * pz;
      const c = R[6] * px + R[7] * py + R[8] * pz;
      px = a;
      py = b;
      pz = c;
    }
    const qx = Math.abs(px) - hx + r;
    const qy = Math.abs(py) - hy + r;
    const qz = Math.abs(pz) - hz + r;
    const mx = Math.max(qx, 0);
    const my = Math.max(qy, 0);
    const mz = Math.max(qz, 0);
    return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r;
  });
}

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

// A shape list: [op, fn, k]. 'add' blends in, 'sub' carves out. A shape
// whose bounding sphere is too far away to change the answer is skipped.
function field(list) {
  const L = list.map(([op, f, k]) => ({ add: op === 'add', f, k, b: f.b || null }));
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < L.length; i++) {
      const { add, f, k, b } = L[i];
      if (b) {
        const lb = Math.sqrt((x - b[0]) ** 2 + (y - b[1]) ** 2 + (z - b[2]) ** 2) - b[3];
        if (add ? lb >= d + k : lb >= k - d) continue;
      }
      const v = f(x, y, z);
      if (add) d = k > 0 ? smin(d, v, k) : Math.min(d, v);
      else d = k > 0 ? smax(d, -v, k) : Math.max(d, -v);
    }
    return d;
  };
}

// Walk in from outside along a direction until you hit the surface.
function surface(f, x, y, z, dx, dy, dz) {
  let t = 0;
  let d = f(x, y, z);
  for (let i = 0; i < 80 && d > 0.002; i++) {
    t += d;
    d = f(x + dx * t, y + dy * t, z + dz * t);
  }
  return [x + dx * t, y + dy * t, z + dz * t];
}

// --- The body --------------------------------------------------------------

// Shapes that decide colours (hair, eyebrows, eyes, lips).
const HAIR_CAP = ell([0, 30.52, -0.45], [1.62, 1.92, 1.92]);
const QUIFF = ell([0, 31.72, 0.42], [1.2, 0.58, 1.12], [-0.3, 0, 0]);
// Hair grows above a line from the forehead down to the back of the neck.
const hairField = bound([0, 30.7, -0.3], 2.7, (x, y, z) => {
  const line = -(y - (30.98 + (z - 1.05) * 0.72)) / 1.23;
  return smin(smax(HAIR_CAP(x, y, z), line, 0.18), QUIFF(x, y, z), 0.3);
});
const BROWS = [1, -1].flatMap((s) => [
  cone([s * 0.18, 29.99, 1.53], [s * 0.62, 30.1, 1.46], 0.11, 0.095),
  cone([s * 0.62, 30.1, 1.46], [s * 1.02, 30.04, 1.22], 0.095, 0.05),
]);
const LIPS = [ell([0, 28.43, 1.43], [0.42, 0.12, 0.2]), ell([0, 28.22, 1.39], [0.36, 0.13, 0.2])];

function headShapes() {
  const S = [
    ['add', ell([0, 30.15, -0.35], [1.5, 1.75, 1.8]), 0],
    ['add', ell([0, 30.5, 0.5], [1.28, 0.98, 0.98]), 0.4],
    ['add', hairField, 0.2],
    // Neck and throat, so there's never a gap when he looks around.
    ['add', cone([0, 26.6, -0.35], [0, 28.6, -0.3], 1.12, 1.1), 0.4],
    ['add', ell([0, 27.45, 0.35], [0.9, 0.7, 0.8]), 0.5],
    // A heavy brow over deep-set eyes, and high cheekbones.
    ['add', ell([0, 29.98, 1.05], [1.18, 0.28, 0.5]), 0.3],
    ['add', ell([0, 28.75, 0.95], [0.95, 0.75, 0.75]), 0.4],
    // The jaw: wide, square and sharp, with a strong chin.
    ['add', ell([0, 28.05, 0.3], [1.25, 0.74, 1.2]), 0.5],
    ['add', ell([0, 27.52, 1.18], [0.64, 0.43, 0.43]), 0.2],
    ['sub', cone([0, 27.3, 1.62], [0, 27.68, 1.6], 0.07), 0.1],
    // Nose.
    ['add', cone([0, 29.72, 1.36], [0, 28.98, 1.8], 0.14, 0.2), 0.2],
    ['add', ell([0, 28.9, 1.77], [0.24, 0.2, 0.2]), 0.12],
    // Lips.
    ['add', LIPS[0], 0.12],
    ['add', LIPS[1], 0.12],
  ];
  for (const s of [1, -1]) {
    S.push(
      ['add', ell([s * 0.85, 29.2, 0.95], [0.42, 0.3, 0.48]), 0.3],
      ['add', cone([s * 1.15, 27.98, -0.45], [s * 0.5, 27.45, 1.12], 0.36, 0.34), 0.35],
      ['add', cone([s * 1.18, 28.95, -0.5], [s * 1.15, 27.98, -0.45], 0.37, 0.36), 0.35],
      ['add', ell([s * 0.21, 28.86, 1.57], [0.17, 0.15, 0.17]), 0.12],
      ['sub', ell([s * 0.52, 29.6, 1.42], [0.36, 0.26, 0.26]), 0.2],
      ['add', ell([s * 0.52, 29.79, 1.2], [0.34, 0.1, 0.17]), 0.08],
      // Ears.
      ['add', ell([s * 1.48, 29.3, -0.15], [0.2, 0.52, 0.34], [0, s * 0.3, 0]), 0.15],
      ['sub', ell([s * 1.61, 29.28, -0.1], [0.08, 0.3, 0.18], [0, s * 0.3, 0]), 0.06],
    );
  }
  return S;
}

function torsoShapes() {
  const S = [];
  const add = (f, k) => S.push(['add', f, k]);
  const sub = (f, k) => S.push(['sub', f, k]);
  // Ribcage, broad upper back, a tight waist and the hips: the V shape.
  add(ell([0, 22.7, -0.3], [2.85, 3.8, 1.95]), 0);
  add(ell([0, 24.3, -0.35], [3.25, 2.0, 1.9]), 0.8);
  add(ell([0, 19.0, -0.05], [2.2, 2.8, 1.35]), 1.0);
  add(ell([0, 16.3, -0.15], [2.35, 1.75, 1.45]), 0.9);
  add(ell([0, 24.6, -1.3], [2.2, 2.3, 0.95]), 0.7);
  for (const s of [1, -1]) {
    // Lats: the wings under the arms.
    add(ell([s * 2.3, 22.6, -0.7], [1.25, 3.0, 1.2], [0, 0, -s * 0.3]), 0.7);
    add(ell([s * 2.9, 23.8, -0.5], [0.85, 1.7, 1.05], [0, 0, -s * 0.35]), 0.6);
    add(ell([s * 1.05, 15.55, -1.0], [1.2, 1.35, 1.05]), 0.5); // glutes
    add(ell([s * 3.5, 25.75, -0.15], [0.7, 0.55, 0.9]), 0.5); // top of the shoulder
    // Traps sloping from the neck down to the shoulders.
    add(ell([s * 1.55, 26.35, -0.55], [1.75, 0.8, 1.05], [0, 0, -s * 0.42]), 0.7);
  }
  add(cone([0, 25.4, -0.25], [0, 27.9, -0.2], 1.35, 1.12), 0.9);
  const base = field(S.slice());
  for (const s of [1, -1]) {
    add(cone([s * 0.85, 28.5, -0.25], [s * 0.25, 25.9, 0.9], 0.28, 0.24), 0.35); // neck straps
    add(cone([s * 0.35, 25.8, 1.0], [s * 3.2, 26.05, 0.15], 0.15, 0.15), 0.45); // collarbones
    // Pecs: big plates with a sharp lower edge, tied in under the arm.
    add(ell([s * 1.5, 24.0, 1.0], [1.62, 1.18, 0.9], [0, s * 0.3, s * 0.12]), 0.3);
    add(ell([s * 1.65, 24.95, 0.7], [1.45, 0.72, 0.72]), 0.55);
    add(ell([s * 2.9, 24.5, 0.5], [0.7, 0.8, 0.6]), 0.5);
  }
  // The six-pack (eight, really): square blocks sitting on the belly.
  [21.55, 20.5, 19.45, 18.35].forEach((y, i) => {
    for (const s of [1, -1]) {
      const [x0, y0, z0] = surface(base, s * 0.58, y, 4, 0, 0, -1);
      add(rbox([x0, y0, z0 - 0.19], [0.5, i === 3 ? 0.52 : 0.44, 0.3], 0.26), 0.22);
    }
  });
  for (const s of [1, -1]) {
    // Obliques and the serratus "fingers" along the ribs.
    add(ell([s * 1.95, 19.4, 0.3], [0.45, 1.7, 0.85], [0, 0, s * 0.18]), 0.55);
    for (let i = 0; i < 3; i++) {
      const [x0, y0, z0] = surface(base, s * 4, 23.3 - i * 0.62, 3.2 - i * 0.1, -s * 0.7, 0, -0.7);
      add(ell([x0 - s * 0.06, y0, z0 - 0.06], [0.3, 0.2, 0.34], [0, s * 0.5, s * 0.5]), 0.18);
    }
    // The V lines from the hips down under the shorts.
    sub(cone([s * 2.1, 17.6, 1.05], [s * 0.75, 15.6, 1.45], 0.12, 0.1), 0.22);
    // Shoulder blades and the long back muscles either side of the spine.
    const [bx, by, bz] = surface(base, s * 1.8, 24.2, -4, 0, 0, 1);
    add(ell([bx, by, bz + 0.2], [1.0, 0.95, 0.45], [0, 0, s * 0.4]), 0.35);
    const [ex, ey, ez] = surface(base, s * 0.62, 18.6, -4, 0, 0, 1);
    add(ell([ex, ey, ez + 0.28], [0.5, 2.4, 0.45]), 0.35);
  }
  // The groove down the middle of the back.
  const spine = [25.6, 22.5, 19.5, 17.2].map((y) => surface(base, 0, y, -4, 0, 0, 1));
  for (let i = 0; i < spine.length - 1; i++) sub(cone(spine[i], spine[i + 1], 0.07), 0.3);
  // Shorts over the hips, up to a waistband.
  const shorts = ell([0, 15.7, -0.15], [2.42, 1.9, 1.68]);
  add(bound(shorts.b, shorts.b[3], (x, y, z) => smax(shorts(x, y, z), y - 16.4, 0.08)), 0.12);
  return S;
}

// One arm, split at the elbow (s = 1 for his left arm, -1 for the right).
function upperArmShapes(s) {
  return [
    // Delts: three heads capping the shoulder, tapering down the arm.
    ['add', ell([s * 4.62, 24.9, 0.0], [1.02, 1.7, 1.15]), 0],
    ['add', ell([s * 4.25, 24.9, 0.65], [0.85, 1.35, 0.75]), 0.35],
    ['add', ell([s * 4.3, 24.95, -0.7], [0.85, 1.3, 0.75]), 0.35],
    ['add', cone([s * 4.5, 24.8, 0], [s * 4.75, 19.8, -0.1], 0.95, 0.66), 0.45],
    ['add', ell([s * 4.6, 22.1, 0.52], [0.95, 1.8, 0.98]), 0.3], // biceps
    ['add', ell([s * 4.35, 22.5, -0.65], [0.88, 2.05, 0.9]), 0.3], // triceps
    ['add', ell([s * 5.1, 22.9, -0.35], [0.62, 1.55, 0.78]), 0.28],
    ['add', ell([s * 5.1, 21.0, 0.15], [0.5, 1.0, 0.62]), 0.3],
    ['add', ell([s * 4.8, 19.5, -0.22], [0.66, 0.68, 0.66]), 0.3],
  ];
}

function foreArmShapes(s) {
  const S = [
    ['add', ell([s * 4.8, 19.45, -0.22], [0.64, 0.64, 0.64]), 0],
    ['add', cone([s * 4.85, 19.2, 0], [s * 5.0, 14.8, 0.1], 0.8, 0.48), 0.3],
    ['add', ell([s * 5.05, 18.1, 0.22], [0.85, 1.6, 0.82]), 0.35],
    ['add', ell([s * 4.6, 17.7, -0.2], [0.66, 1.65, 0.68]), 0.35],
    ['add', ell([s * 5.0, 14.7, 0.1], [0.5, 0.36, 0.43]), 0.25],
    // A fist: knuckles out, thumb wrapped round the front.
    ['add', rbox([s * 5.02, 13.6, 0.25], [0.56, 0.92, 0.76], 0.35), 0.25],
    ['add', cone([s * 4.62, 14.15, 0.78], [s * 4.8, 13.2, 1.02], 0.21, 0.19), 0.12],
  ];
  for (let i = 0; i < 4; i++) S.push(['add', ell([s * 5.45, 13.15, 0.25 + (i - 1.5) * 0.36], [0.2, 0.22, 0.17]), 0.1]);
  return S;
}

function legShapes(s) {
  const X = (v) => s * v;
  const S = [
    ['add', cone([X(1.85), 15.3, 0.0], [X(1.45), 9.0, 0.12], 1.55, 0.8), 0],
    ['add', ell([X(2.35), 12.2, 0.2], [0.9, 3.0, 1.1]), 0.45], // outer quad
    ['add', ell([X(1.8), 12.8, 0.95], [0.85, 2.9, 0.75]), 0.4],
    ['add', ell([X(1.12), 10.1, 0.6], [0.72, 1.25, 0.75]), 0.3], // the teardrop
    ['add', ell([X(1.05), 13.5, -0.05], [0.8, 2.3, 1.05]), 0.45],
    ['add', ell([X(1.75), 12.3, -0.75], [1.0, 3.0, 0.9]), 0.45],
    ['add', ell([X(1.45), 8.65, 0.25], [0.72, 0.8, 0.8]), 0.3],
    ['add', ell([X(1.43), 8.8, 0.88], [0.38, 0.45, 0.2]), 0.15],
    ['add', cone([X(1.45), 8.3, 0.1], [X(1.48), 1.7, 0.0], 0.7, 0.44), 0.3],
    ['add', ell([X(1.65), 6.4, 0.5], [0.38, 1.9, 0.38]), 0.25],
    // Calves: two heads and the soleus under them.
    ['add', ell([X(1.12), 6.3, -0.55], [0.62, 1.6, 0.72]), 0.3],
    ['add', ell([X(1.78), 6.5, -0.5], [0.55, 1.45, 0.62]), 0.3],
    ['add', ell([X(1.47), 4.7, -0.32], [0.66, 1.45, 0.58]), 0.4],
    ['add', ell([X(1.47), 1.55, 0], [0.45, 0.45, 0.5]), 0.3],
    // Sneakers.
    ['add', rbox([X(1.47), 0.62, 0.85], [0.62, 0.52, 1.72], 0.46), 0.35],
    ['add', ell([X(1.47), 0.5, 2.1], [0.62, 0.45, 0.6]), 0.3],
    ['add', rbox([X(1.47), 0.17, 0.85], [0.7, 0.17, 1.95], 0.12), 0.06],
  ];
  // Gym shorts down to the middle of the thigh, with a clean hem.
  const cloth = cone([X(1.8), 14.9, -0.08], [X(1.6), 11.2, 0.12], 1.68, 1.5);
  S.push(['add', bound(cloth.b, cloth.b[3], (x, y, z) => smax(cloth(x, y, z), 11.1 - y, 0.1)), 0.08]);
  return S;
}

// --- Meshing -----------------------------------------------------------------

// Surface nets over a grid of step h: a smooth mesh of the field's surface.
function* mesh(f, [x0, y0, z0, x1, y1, z1], h) {
  const nx = Math.ceil((x1 - x0) / h) + 1;
  const ny = Math.ceil((y1 - y0) / h) + 1;
  const nz = Math.ceil((z1 - z0) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  let n = 0;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[n++] = f(x0 + i * h, y0 + j * h, z0 + k * h);
    yield;
  }
  const at = (i, j, k) => i + nx * (j + ny * k);
  const cx = nx - 1;
  const cy = ny - 1;
  const cell = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const pos = [];
  const corner = new Float32Array(8);
  const E = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          const v = V[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          corner[c] = v;
          if (v < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let m = 0;
        for (const [a, b] of E) {
          const va = corner[a];
          const vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          m++;
        }
        cell[i + cx * (j + cy * k)] = pos.length / 3;
        pos.push(x0 + (i + sx / m) * h, y0 + (j + sy / m) * h, z0 + (k + sz / m) * h);
      }
    }
    yield;
  }
  const C = (i, j, k) => cell[i + cx * (j + cy * k)];
  // One quad round every grid edge the surface crosses, wound so it faces
  // out of the body.
  const quads = [];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const v = V[at(i, j, k)] < 0;
        if (v !== V[at(i + 1, j, k)] < 0) {
          const q = [C(i, j - 1, k - 1), C(i, j, k - 1), C(i, j, k), C(i, j - 1, k)];
          quads.push(v ? q : q.reverse());
        }
        if (v !== V[at(i, j + 1, k)] < 0) {
          const q = [C(i - 1, j, k - 1), C(i, j, k - 1), C(i, j, k), C(i - 1, j, k)];
          quads.push(v ? q.reverse() : q);
        }
        if (v !== V[at(i, j, k + 1)] < 0) {
          const q = [C(i - 1, j - 1, k), C(i, j - 1, k), C(i, j, k), C(i - 1, j, k)];
          quads.push(v ? q : q.reverse());
        }
      }
    }
    if (k % 4 === 0) yield;
  }
  return { pos, quads };
}

function gradient(f, x, y, z, e = 0.04) {
  const gx = f(x + e, y, z) - f(x - e, y, z);
  const gy = f(x, y + e, z) - f(x, y - e, z);
  const gz = f(x, y, z + e) - f(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

// Snaps the net onto the true surface, then works out normals and baked
// shadow (how enclosed each point is: the creases between muscles).
function* finish(f, { pos, quads }) {
  const n = pos.length / 3;
  const nor = new Float32Array(n * 3);
  const ao = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let x = pos[i * 3];
    let y = pos[i * 3 + 1];
    let z = pos[i * 3 + 2];
    const d = f(x, y, z);
    const g0 = gradient(f, x, y, z);
    x -= g0[0] * d;
    y -= g0[1] * d;
    z -= g0[2] * d;
    if (i % 300 === 299) yield;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    const [gx, gy, gz] = gradient(f, x, y, z);
    nor[i * 3] = gx;
    nor[i * 3 + 1] = gy;
    nor[i * 3 + 2] = gz;
    let occ = 0;
    let w = 1;
    for (let s = 1; s <= 4; s++) {
      const t = s * 0.19;
      occ += w * Math.max(0, t - f(x + gx * t, y + gy * t, z + gz * t));
      w *= 0.6;
    }
    ao[i] = Math.max(0.42, Math.min(1, 1 - occ * 1.6));
  }
  // Two triangles per quad, facing out, split along the shorter diagonal.
  const tris = [];
  const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const d2 = (a, b) => {
    const A = P(a);
    const B = P(b);
    return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2;
  };
  for (let qi = 0; qi < quads.length; qi++) {
    const q = quads[qi];
    if (qi % 1500 === 1499) yield;
    if (q.some((v) => v < 0)) continue;
    const [a, b, c, d] = q;
    const pair = d2(a, c) <= d2(b, d) ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
    tris.push(...pair);
  }
  return { pos, nor, ao, tris };
}

// --- Texture layout ------------------------------------------------------

// Faces of a box, in BoxGeometry order, and which way each one looks.
const FACE_AXES = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [2, 1],
  [2, -1],
];

// For a part's box, how to turn a point on each face into skin UVs: for
// each face, U and V as a sum of the point's two in-face coordinates
// (from -0.5 to 0.5 across the box), and the face's UV rectangle.
function faceMaps(part, slim) {
  const [w, h, d] = partSize(part, slim);
  const [u, v] = LAYOUT[part].base;
  const g = new THREE.BoxGeometry(1, 1, 1);
  setBoxUV(g, u, v, w, h, d);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  // Half a texel in from the edges so nothing bleeds in from next door.
  const inset = 0.5 / 1024;
  const maps = [];
  for (let f = 0; f < 6; f++) {
    const axis = FACE_AXES[f][0];
    const [a, b] = [0, 1, 2].filter((i) => i !== axis);
    const c = [0, 1, 2, 3].map((i) => ({
      p: [p.getX(f * 4 + i), p.getY(f * 4 + i), p.getZ(f * 4 + i)],
      t: [uv.getX(f * 4 + i), uv.getY(f * 4 + i)],
    }));
    const o = c[0];
    const A = c.find((q) => q.p[a] !== o.p[a] && q.p[b] === o.p[b]);
    const B = c.find((q) => q.p[b] !== o.p[b] && q.p[a] === o.p[a]);
    const da = A.p[a] - o.p[a];
    const db = B.p[b] - o.p[b];
    const ua = (A.t[0] - o.t[0]) / da;
    const va = (A.t[1] - o.t[1]) / da;
    const ub = (B.t[0] - o.t[0]) / db;
    const vb = (B.t[1] - o.t[1]) / db;
    maps.push({
      a,
      b,
      u0: o.t[0] - o.p[a] * ua - o.p[b] * ub,
      v0: o.t[1] - o.p[a] * va - o.p[b] * vb,
      ua,
      va,
      ub,
      vb,
      lo: [Math.min(o.t[0], A.t[0], B.t[0]) + inset, Math.min(o.t[1], A.t[1], B.t[1]) + inset],
      hi: [Math.max(o.t[0], A.t[0], B.t[0]) - inset, Math.max(o.t[1], A.t[1], B.t[1]) - inset],
    });
  }
  g.dispose();
  return maps;
}

// Builds one part's geometry. Positions are in the part's own frame
// (relative to its joint), in world units. Each triangle gets the skin face
// it looks at most, so suits and paint land where they would on a block.
function* partGeometry(part, net, slim, pivot, [lo, hi] = netBox(net)) {
  const { pos, nor, ao, tris } = net;
  const maps = faceMaps(part, slim);
  const span = [0, 1, 2].map((a) => 1 / Math.max(1e-6, hi[a] - lo[a]));
  // What you see looking at the part from each of its six sides: the
  // furthest-out surface, on a fine grid.
  const CELL = 0.08;
  const res = [0, 1, 2].map((a) => Math.max(2, Math.ceil((hi[a] - lo[a]) / CELL)));
  const views = FACE_AXES.map(([axis]) => {
    const [a, b] = [0, 1, 2].filter((i) => i !== axis);
    return { axis, a, b, w: res[a], h: res[b], d: new Float32Array(res[a] * res[b]).fill(-1e9) };
  });
  const cellOf = (v, i, k) => Math.min(v[k === 'a' ? 'w' : 'h'] - 1, Math.max(0, Math.floor((pos[i * 3 + v[k]] - lo[v[k]]) / CELL)));
  const fn = tris.map((t) => {
    const n = [0, 0, 0];
    for (const v of t) for (let a = 0; a < 3; a++) n[a] += nor[v * 3 + a];
    const l = Math.hypot(...n) || 1;
    return n.map((c) => c / l);
  });
  for (let ti = 0; ti < tris.length; ti++) {
    if (ti % 4000 === 3999) yield;
    const t = tris[ti];
    for (let f = 0; f < 6; f++) {
      const [axis, sgn] = FACE_AXES[f];
      if (fn[ti][axis] * sgn <= 0) continue;
      const v = views[f];
      let a0 = 1e9;
      let a1 = -1;
      let b0 = 1e9;
      let b1 = -1;
      let dep = -1e9;
      for (const i of t) {
        const ca = cellOf(v, i, 'a');
        const cb = cellOf(v, i, 'b');
        a0 = Math.min(a0, ca);
        a1 = Math.max(a1, ca);
        b0 = Math.min(b0, cb);
        b1 = Math.max(b1, cb);
        dep = Math.max(dep, pos[i * 3 + axis] * sgn);
      }
      for (let cb = b0; cb <= b1; cb++) for (let ca = a0; ca <= a1; ca++) if (dep > v.d[cb * v.w + ca]) v.d[cb * v.w + ca] = dep;
    }
  }
  const n = tris.length * 3;
  const P = new Float32Array(n * 3);
  const N = new Float32Array(n * 3);
  const Cl = new Float32Array(n * 3);
  const T = new Float32Array(n * 2);
  const G = new Float32Array(n * 3); // body-space position, for painting
  const F = new Uint8Array(tris.length); // which side each triangle is painted from
  const q = [0, 0, 0];
  let o = 0;
  for (let ti = 0; ti < tris.length; ti++) {
    if (ti % 2500 === 2499) yield;
    const t = tris[ti];
    let tried = 0;
    // The side it faces most that can actually see it (or, if none can,
    // the one where it's least hidden).
    const nn = fn[ti];
    let face = -1;
    let bestGap = 1e9;
    let bestDot = -1;
    let fallback = 0;
    for (let f = 0; f < 6; f++) {
      const [axis, sgn] = FACE_AXES[f];
      const dot = nn[axis] * sgn;
      if (dot > bestDot) {
        bestDot = dot;
        fallback = f;
      }
    }
    for (let pass = 0; pass < 6 && face < 0; pass++) {
      // Try sides in order of how squarely the triangle faces them.
      let f = -1;
      let dot = 0.02;
      for (let g = 0; g < 6; g++) {
        const d = nn[FACE_AXES[g][0]] * FACE_AXES[g][1];
        if (d > dot && !(tried & (1 << g))) {
          dot = d;
          f = g;
        }
      }
      if (f < 0) break;
      tried |= 1 << f;
      const [axis, sgn] = FACE_AXES[f];
      const v = views[f];
      let ca = 0;
      let cb = 0;
      let dep = 0;
      for (const i of t) {
        ca += (pos[i * 3 + v.a] - lo[v.a]) / 3;
        cb += (pos[i * 3 + v.b] - lo[v.b]) / 3;
        dep += (pos[i * 3 + axis] * sgn) / 3;
      }
      const ia = Math.min(v.w - 1, Math.max(0, Math.floor(ca / CELL)));
      const ib = Math.min(v.h - 1, Math.max(0, Math.floor(cb / CELL)));
      const gap = v.d[ib * v.w + ia] - dep;
      if (gap <= 0.12) face = f;
      else if (gap < bestGap) {
        bestGap = gap;
        fallback = f;
      }
    }
    if (face < 0) face = fallback;
    F[ti] = face;
    const m = maps[face];
    for (let k = 0; k < 3; k++) {
      const v = t[k] * 3;
      for (let a = 0; a < 3; a++) {
        const x = pos[v + a];
        q[a] = (x - lo[a]) * span[a] - 0.5;
        G[o * 3 + a] = x;
        P[o * 3 + a] = (x - pivot[a]) * PX;
        N[o * 3 + a] = nor[v + a];
        Cl[o * 3 + a] = ao[t[k]];
      }
      const U = m.u0 + q[m.a] * m.ua + q[m.b] * m.ub;
      const V = m.v0 + q[m.a] * m.va + q[m.b] * m.vb;
      T[o * 2] = U < m.lo[0] ? m.lo[0] : U > m.hi[0] ? m.hi[0] : U;
      T[o * 2 + 1] = V < m.lo[1] ? m.lo[1] : V > m.hi[1] ? m.hi[1] : V;
      o++;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Cl, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(T, 2));
  g.computeBoundingSphere();
  g.userData = { part, body: G, face: F };
  return g;
}

// The box around some nets (for laying the skin over them).
function netBox(...nets) {
  const lo = [1e9, 1e9, 1e9];
  const hi = [-1e9, -1e9, -1e9];
  for (const { pos } of nets) {
    for (let i = 0; i < pos.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], pos[i + a]);
        hi[a] = Math.max(hi[a], pos[i + a]);
      }
    }
  }
  return [lo, hi];
}

// His left side is his right side, mirrored.
function mirror({ pos, nor, ao, tris }) {
  const p = pos.slice();
  const n = nor.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] = -p[i];
    n[i] = -n[i];
  }
  return { pos: p, nor: n, ao, tris: tris.map(([a, b, c]) => [a, c, b]) };
}

function merge(a, b) {
  const off = a.pos.length / 3;
  const nor = new Float32Array(a.nor.length + b.nor.length);
  nor.set(a.nor);
  nor.set(b.nor, a.nor.length);
  const ao = new Float32Array(a.ao.length + b.ao.length);
  ao.set(a.ao);
  ao.set(b.ao, a.ao.length);
  return { pos: [...a.pos, ...b.pos], nor, ao, tris: [...a.tris, ...b.tris.map((t) => t.map((v) => v + off))] };
}

function* sculpt(shapes, box, h) {
  const f = field(shapes);
  const m = yield* mesh(f, box, h);
  return yield* finish(f, m);
}

function* build(slim) {
  const out = { slim };
  const head = yield* sculpt(headShapes(), [-2.3, 24.9, -2.9, 2.3, 33.3, 2.6], 0.16);
  out.head = yield* partGeometry('head', head, slim, CHAD.neck);
  yield;
  const torso = yield* sculpt(torsoShapes(), [-5.0, 13.0, -3.2, 5.0, 29.9, 3.2], 0.2);
  out.body = yield* partGeometry('body', torso, slim, [0, CHAD.hipY, 0]);
  yield;
  const nets = {
    arm: yield* sculpt(upperArmShapes(-1), [-6.6, 18.2, -2.3, -2.6, 27.4, 2.3], 0.2),
    fore: yield* sculpt(foreArmShapes(-1), [-6.6, 11.9, -1.9, -3.4, 20.8, 2.1], 0.16),
    leg: yield* sculpt(legShapes(-1), [-4.2, -0.8, -2.6, 1.0, 17.8, 3.6], 0.22),
  };
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'R' : 'L';
    const n = s < 0 ? nets : { arm: mirror(nets.arm), fore: mirror(nets.fore), leg: mirror(nets.leg) };
    const at = (p) => [s * p[0], p[1], p[2]];
    const armBox = netBox(n.arm, n.fore);
    out['arm' + side] = yield* partGeometry('arm' + side, n.arm, slim, at(CHAD.shoulder), armBox);
    out['fore' + side] = yield* partGeometry('arm' + side, n.fore, slim, at(CHAD.elbow), armBox);
    out['leg' + side] = yield* partGeometry('leg' + side, n.leg, slim, [s * CHAD.legX, CHAD.hipY, 0]);
    // The whole arm in one piece for first person, with the fist at 0.
    out['view' + side] = yield* partGeometry('arm' + side, merge(n.arm, n.fore), slim, at(CHAD.fist), armBox);
    yield;
  }
  return out;
}

const CACHE = new Map();
const PENDING = new Map();

// Every part of the body (slim skins lay the arms out 3 pixels wide, so
// the texture is placed differently). Built at once...
export function chadGeometry(slim = false) {
  const key = slim ? 'slim' : 'wide';
  if (!CACHE.has(key)) CACHE.set(key, finishNow(build(slim)));
  return CACHE.get(key);
}

// ...or a few milliseconds at a time, so the game keeps running.
export function loadChad(slim = false) {
  const key = slim ? 'slim' : 'wide';
  if (CACHE.has(key)) return Promise.resolve(CACHE.get(key));
  if (!PENDING.has(key)) {
    PENDING.set(
      key,
      runSoon(build(slim)).then((g) => {
        CACHE.set(key, g);
        PENDING.delete(key);
        return g;
      }),
    );
  }
  return PENDING.get(key);
}

export function chadReady(slim = false) {
  return CACHE.has(slim ? 'slim' : 'wide');
}

// --- Paint ---------------------------------------------------------------------

// The texture is a skin layout at 8 times the size (512 x 512).
export const CHAD_TEX = 1024;

const DEFAULT_COLORS = { skin: [198, 138, 95], hair: [42, 29, 21], shorts: [31, 42, 68], shoes: [240, 240, 240], eyes: [75, 109, 140] };

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const ramp = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

// His colours come from your skin: skin tone from your face, hair from the
// top of your head, shorts from your trousers and shoes from your feet.
export function chadColors(skinCanvas) {
  const C = { ...DEFAULT_COLORS };
  if (!skinCanvas) return C;
  let data;
  try {
    data = skinCanvas.getContext('2d').getImageData(0, 0, 64, 64).data;
  } catch {
    return C;
  }
  const most = (rects) => {
    const buckets = new Map();
    for (const [x0, y0, w, h] of rects) {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const i = (y * 64 + x) * 4;
          if (data[i + 3] < 128) continue;
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
          const b = buckets.get(key) || [0, 0, 0, 0];
          b[0] += data[i];
          b[1] += data[i + 1];
          b[2] += data[i + 2];
          b[3]++;
          buckets.set(key, b);
        }
      }
    }
    let best = null;
    for (const b of buckets.values()) if (!best || b[3] > best[3]) best = b;
    return best ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]] : null;
  };
  C.skin = most([[8, 8, 8, 8]]) || C.skin;
  C.hair = most([[8, 0, 8, 8]]) || C.hair;
  C.shorts = most([[4, 20, 4, 9], [20, 52, 4, 9]]) || C.shorts;
  C.shoes = most([[4, 31, 4, 1], [20, 63, 4, 1]]) || C.shoes;
  // A bald skin still gets hair; trousers the colour of skin become dark
  // shorts; shoes the colour of the shorts become white sneakers.
  if (dist3(C.hair, C.skin) < 40) C.hair = DEFAULT_COLORS.hair;
  if (dist3(C.shorts, C.skin) < 40) C.shorts = DEFAULT_COLORS.shorts;
  if (dist3(C.shoes, C.shorts) < 40) C.shoes = DEFAULT_COLORS.shoes;
  // The eyes: whatever on the eye row of the face isn't skin or white.
  for (let x = 8; x < 16; x++) {
    const i = (12 * 64 + x) * 4;
    const c = [data[i], data[i + 1], data[i + 2]];
    if (data[i + 3] > 128 && dist3(c, C.skin) > 28 && Math.min(...c) < 200) {
      C.eyes = c;
      break;
    }
  }
  return C;
}

const EYE_C = [0.52, 29.6, 1.2];

function colorAt(part, x, y, z, C) {
  const skin = C.skin;
  if (part === 'head') {
    // Eyes, painted into the sockets: narrow, a little hooded.
    for (const e of [1, -1]) {
      const ex = (x - e * EYE_C[0]) / 0.29;
      const ey = (y - EYE_C[1] + ex * ex * 0.015) / 0.12;
      const r = Math.hypot(ex, ey);
      if (z > 1.0 && r < 1.12) {
        const ix = x - e * (EYE_C[0] - 0.02);
        const iy = y - EYE_C[1] + 0.005;
        const ir = Math.hypot(ix, iy);
        let c = [222, 214, 204];
        c = mix(c, scale(C.eyes, 0.9), ramp(0.125, 0.105, ir));
        c = mix(c, [12, 12, 16], ramp(0.055, 0.04, ir));
        c = mix(c, [255, 255, 255], ramp(0.03, 0.015, Math.hypot(ix - 0.03, iy - 0.035)));
        // Shadow from the upper lid, and a soft edge into the skin.
        c = mix(c, [60, 40, 34], ramp(0.1, 0.7, ey) * 0.55);
        return mix(c, scale(skin, 0.7), ramp(0.9, 1.12, r));
      }
    }
    // Everything else on the face starts as skin, with soft-edged features
    // painted over it.
    let c = skin;
    // Stubble along the jaw and chin, and a moustache shadow.
    let b = ramp(28.75, 28.3, y) * 0.4 * ramp(26.9, 27.5, y) * ramp(-1.0, -0.3, z);
    if (z > 1.2) b = Math.max(b, 0.34 * ramp(28.44, 28.52, y) * ramp(28.76, 28.64, y) * ramp(0.56, 0.4, Math.abs(x)));
    if (b > 0) c = mix(c, scale(C.hair, 0.85), b * (0.75 + 0.25 * hash(x, y, z)));
    // A bit of colour on the ears and cheeks.
    if (Math.abs(x) > 1.35 && y > 28.7 && y < 29.9) c = mix(c, [200, 90, 80], 0.1);
    const cheek = Math.max(0, 1 - Math.hypot(Math.abs(x) - 0.85, y - 28.95, z - 1.05) / 0.45);
    c = mix(c, [205, 95, 85], cheek * 0.1);
    // Lips, the line of the mouth and the nostrils.
    if (z > 1.28) {
      const lip = Math.min(LIPS[0](x, y, z), LIPS[1](x, y, z));
      c = mix(c, [168, 88, 80], 0.4 * ramp(0.06, 0.01, lip));
      c = mix(c, [60, 30, 28], 0.7 * ramp(0.06, 0.02, Math.abs(y - 28.33)) * ramp(0.42, 0.3, Math.abs(x)));
    }
    for (const s of [1, -1]) c = mix(c, [50, 26, 22], 0.65 * ramp(0.1, 0.06, Math.hypot(x - s * 0.13, y - 28.74, z - 1.66)));
    // Lash lines above the eyes.
    for (const e of [1, -1]) {
      const ex = (x - e * EYE_C[0]) / 0.3;
      const top = EYE_C[1] + 0.12 - ex * ex * 0.1;
      if (z > 1.0 && Math.abs(ex) < 1.15) c = mix(c, [40, 28, 24], 0.6 * ramp(0.06, 0.015, Math.abs(y - top)));
    }
    // Eyebrows and hair.
    const brow = Math.min(...BROWS.map((f) => f(x, y, z)));
    c = mix(c, scale(C.hair, 0.72 + 0.12 * hash(x, y, z)), ramp(0.1, 0.04, brow));
    // Hair: above the hairline, on the hair and anywhere it blends in.
    const line = -(y - (30.98 + (z - 1.05) * 0.72)) / 1.23;
    const hair = ramp(0.08, 0.0, line) * ramp(0.4, 0.25, Math.min(HAIR_CAP(x, y, z), QUIFF(x, y, z)));
    if (hair > 0) {
      // Swept-back strands.
      const k = 0.86 + 0.14 * Math.sin(z * 13 + Math.sin(x * 4.5) * 2.2) + (hash(x, y, z) - 0.5) * 0.08;
      c = mix(c, scale(C.hair, k), hair);
    }
    return c;
  }
  if (part === 'body') {
    if (y < 16.42) return y > 15.98 ? mix(C.shorts, [255, 255, 255], 0.2) : C.shorts;
    return skin;
  }
  if (part === 'armR' || part === 'armL') {
    return y < 13.3 ? mix(skin, [200, 100, 90], 0.1) : skin;
  }
  // Legs.
  const lx = Math.abs(x);
  if (y > 11.05) {
    if (lx > 2.3 && Math.abs(z - 0.12) < 0.17) return [236, 236, 236]; // side stripe
    return C.shorts;
  }
  if (y < 1.25) {
    if (y < 0.36) return dist3(C.shoes, [240, 240, 240]) < 60 ? [200, 200, 204] : [236, 236, 236];
    if (y > 0.9 && z > 0.45 && z < 1.85 && Math.abs(lx - 1.47) < 0.3) return Math.floor(z * 7) % 2 ? [248, 248, 248] : scale(C.shoes, 0.8);
    return C.shoes;
  }
  if (y < 2.05) return y > 1.8 ? C.shorts : [244, 244, 244]; // socks
  if (y > 8.3 && y < 9.3 && z > 0.8) return mix(skin, [200, 100, 90], 0.08); // knees
  return skin;
}

// Paints his texture by drawing every triangle of the body into its place
// in the skin layout, coloured from where it is on the body. Where two
// triangles land on the same spot, the one further out wins.
function* paint(canvas, geo, colors) {
  const N = CHAD_TEX;
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  const S = N / 64;
  // Built in memory and put on the canvas once at the end (reading a canvas
  // back is very slow).
  const img = new ImageData(N, N);
  const D = img.data;
  // A base coat under everything, so the texture never shows a gap.
  const base = colors.skin.map(Math.round);
  for (const part of ['head', 'body', 'armR', 'armL', 'legR', 'legL']) {
    const [w, h, d] = partSize(part, geo.slim);
    const [u, v] = LAYOUT[part].base;
    for (const [x, y, fw, fh] of Object.values(faceRects(u, v, w, h, d))) {
      for (let py = y * S; py < (y + fh) * S; py++) {
        for (let px = x * S; px < (x + fw) * S; px++) {
          const i = (py * N + px) * 4;
          D[i] = base[0];
          D[i + 1] = base[1];
          D[i + 2] = base[2];
          D[i + 3] = 255;
        }
      }
    }
  }
  const depth = new Float32Array(N * N).fill(-1e9);
  for (const key of ['head', 'body', 'armR', 'foreR', 'armL', 'foreL', 'legR', 'legL']) {
    const g = geo[key];
    const part = g.userData.part;
    const G = g.userData.body;
    const T = g.attributes.uv.array;
    const count = T.length / 2;
    for (let t = 0; t < count; t += 3) {
      if (t % 3000 === 2997) yield;
      // The side it was given its UVs from.
      const [axis, sign] = FACE_AXES[g.userData.face[t / 3]];
      const X0 = T[t * 2] * N;
      const Y0 = (1 - T[t * 2 + 1]) * N;
      const X1 = T[t * 2 + 2] * N;
      const Y1 = (1 - T[t * 2 + 3]) * N;
      const X2 = T[t * 2 + 4] * N;
      const Y2 = (1 - T[t * 2 + 5]) * N;
      const area = (X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(X0, X1, X2) - 1));
      const maxX = Math.min(N - 1, Math.ceil(Math.max(X0, X1, X2) + 1));
      const minY = Math.max(0, Math.floor(Math.min(Y0, Y1, Y2) - 1));
      const maxY = Math.min(N - 1, Math.ceil(Math.max(Y0, Y1, Y2) + 1));
      const l0 = Math.hypot(X2 - X1, Y2 - Y1) || 1;
      const l1 = Math.hypot(X0 - X2, Y0 - Y2) || 1;
      const l2 = Math.hypot(X1 - X0, Y1 - Y0) || 1;
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const cx = px + 0.5;
          const cy = py + 0.5;
          let w0 = ((X1 - cx) * (Y2 - cy) - (X2 - cx) * (Y1 - cy)) / area;
          let w1 = ((X2 - cx) * (Y0 - cy) - (X0 - cx) * (Y2 - cy)) / area;
          let w2 = 1 - w0 - w1;
          // A little outside the edges counts too, so thin triangles leave
          // no holes.
          const e = Math.abs(area);
          if ((w0 * e) / l0 < -0.6 || (w1 * e) / l1 < -0.6 || (w2 * e) / l2 < -0.6) continue;
          w0 = Math.max(0, w0);
          w1 = Math.max(0, w1);
          w2 = Math.max(0, w2);
          const ws = w0 + w1 + w2;
          w0 /= ws;
          w1 /= ws;
          w2 /= ws;
          const a = t * 3;
          const x = G[a] * w0 + G[a + 3] * w1 + G[a + 6] * w2;
          const y = G[a + 1] * w0 + G[a + 4] * w1 + G[a + 7] * w2;
          const z = G[a + 2] * w0 + G[a + 5] * w1 + G[a + 8] * w2;
          const out = sign * [x, y, z][axis];
          const idx = py * N + px;
          if (out <= depth[idx]) continue;
          depth[idx] = out;
          const c = colorAt(part, x, y, z, colors);
          D[idx * 4] = c[0];
          D[idx * 4 + 1] = c[1];
          D[idx * 4 + 2] = c[2];
          D[idx * 4 + 3] = 255;
        }
      }
    }
  }
  // Grow the paint out into any gaps between triangles, so the texture
  // filtering never picks up the base coat at the seams.
  let edge = [];
  for (let i = 0; i < N * N; i++) if (depth[i] === -1e9 && D[i * 4 + 3]) edge.push(i);
  for (let pass = 0; pass < 6 && edge.length; pass++) {
    const next = [];
    const fill = [];
    for (const i of edge) {
      const x = i % N;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const j of [i - 1, i + 1, i - N, i + N]) {
        if (j < 0 || j >= N * N || (j === i - 1 && x === 0) || (j === i + 1 && x === N - 1) || depth[j] === -1e9) continue;
        r += D[j * 4];
        g += D[j * 4 + 1];
        b += D[j * 4 + 2];
        n++;
      }
      if (n) fill.push(i, r / n, g / n, b / n);
      else next.push(i);
    }
    for (let k = 0; k < fill.length; k += 4) {
      const i = fill[k];
      D[i * 4] = fill[k + 1];
      D[i * 4 + 1] = fill[k + 2];
      D[i * 4 + 2] = fill[k + 3];
      depth[i] = -1e8;
    }
    edge = next;
    yield;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function finishNow(it) {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

// Runs a step-by-step job a few milliseconds at a time.
function runSoon(it) {
  return new Promise((resolve) => {
    const step = () => {
      const end = performance.now() + 6;
      let r;
      do r = it.next();
      while (!r.done && performance.now() < end);
      if (r.done) resolve(r.value);
      else setTimeout(step, 0);
    };
    step();
  });
}

export function paintChad(canvas, geo, colors) {
  return finishNow(paint(canvas, geo, colors));
}

export function chadTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}


// --- On a model ----------------------------------------------------------------

// Painted looks, shared by everyone with the same colours.
const LOOKS = new Map();

// Your Giga Chad look (geometry and texture), made in the background.
export function chadLook(skinCanvas, slim = false) {
  const colors = chadColors(skinCanvas);
  const key = `${slim}|${colors.skin.map(Math.round)}|${colors.hair.map(Math.round)}|${colors.shorts.map(Math.round)}|${colors.shoes.map(Math.round)}|${colors.eyes.map(Math.round)}`;
  if (!LOOKS.has(key)) {
    LOOKS.set(
      key,
      loadChad(slim).then(async (geo) => {
        const canvas = await runSoon(paint(document.createElement('canvas'), geo, colors));
        const look = { key, slim, geo, colors, canvas, texture: chadTexture(canvas), ready: true };
        LOOKS.set(key, Promise.resolve(look));
        LOOKS.get(key).look = look;
        return look;
      }),
    );
  }
  return LOOKS.get(key);
}

// Where the grip of a gun sits in his fist, relative to his elbow.
const at = (p, s) => [s * p[0], p[1], p[2]];
const GRIP = [0.62, -11.95, 1.05]; // from the shoulder (x for his left arm)

// Puts the Chad body on a humanoid model (from model.js) in place of its
// blocks. Joints move to where a person's are and the arms get elbows.
export function applyChad(model, look) {
  if (model.chad) return;
  const P = model.parts;
  const geo = look.geo;
  const mat = chadMaterial(look.texture);
  const meshes = [];
  const put = (parent, g) => {
    const m = new THREE.Mesh(g, mat);
    parent.add(m);
    meshes.push(m);
    return m;
  };
  const save = {};
  for (const n of ['body', 'head', 'armR', 'armL', 'legR', 'legL']) save[n] = [P[n].position.clone(), P[n].scale.clone()];
  for (const m of [...model.baseMeshes, ...model.outerMeshes]) m.visible = false;
  const fore = {};
  const parts = {};
  parts.head = put(P.head, geo.head);
  parts.body = put(P.body, geo.body);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'R' : 'L';
    parts['arm' + side] = put(P['arm' + side], geo['arm' + side]);
    const f = new THREE.Group();
    f.rotation.order = 'YXZ';
    P['arm' + side].add(f);
    parts['fore' + side] = put(f, geo['fore' + side]);
    fore[side] = f;
    parts['leg' + side] = put(P['leg' + side], geo['leg' + side]);
  }
  model.hipY = CHAD.hipY;
  const chad = {
    mat,
    meshes,
    fore,
    // Elbow bends asked for this frame (by emotes), applied by chadStance.
    bend: { R: null, L: null },
    parts,
    save,
    look,
    // Something held in the right hand (a gun or a block) goes in his fist.
    hold(obj) {
      const u = obj.userData;
      if (!u.handPos) u.handPos = obj.position.clone();
      const e = [s0 * CHAD.elbow[0] - s0 * CHAD.shoulder[0], CHAD.elbow[1] - CHAD.shoulder[1], CHAD.elbow[2] - CHAD.shoulder[2]];
      fore.R.add(obj);
      // The blocky hand holds things at (0, -11.7, 1.7) from the shoulder.
      obj.position.set(u.handPos.x / PX + at(GRIP, -1)[0] - e[0], u.handPos.y / PX + 11.7 + GRIP[1] - e[1], u.handPos.z / PX - 1.7 + GRIP[2] - e[2]).multiplyScalar(PX);
    },
    // Super buff on top: even bigger.
    bulk(k) {
      P.body.scale.set(1 + 0.3 * k, 1 + 0.04 * k, 1 + 0.35 * k);
      P.body.position.set(0, 0, 0);
      P.head.scale.setScalar(1 - 0.04 * k);
      P.head.position.set(CHAD.neck[0] * PX, (CHAD.neck[1] - CHAD.hipY) * (1 + 0.04 * k) * PX, CHAD.neck[2] * PX);
      for (const s of [-1, 1]) {
        const side = s < 0 ? 'R' : 'L';
        const w = 1 + 0.4 * k;
        P['arm' + side].position.set(s * (CHAD.shoulder[0] + 1.3 * k) * PX, (CHAD.shoulder[1] - CHAD.hipY + 0.2 * k) * PX, CHAD.shoulder[2] * PX);
        parts['arm' + side].scale.set(w, 1 + 0.03 * k, w);
        parts['fore' + side].scale.set(w, 1, w);
        fore[side].position.set(s * (CHAD.elbow[0] - CHAD.shoulder[0]) * w * PX, (CHAD.elbow[1] - CHAD.shoulder[1]) * PX, (CHAD.elbow[2] - CHAD.shoulder[2]) * PX);
        P['leg' + side].position.set(s * (CHAD.legX + 0.45 * k) * PX, CHAD.hipY * PX, P['leg' + side].position.z);
        parts['leg' + side].scale.set(1 + 0.3 * k, 1, 1 + 0.35 * k);
      }
    },
  };
  const s0 = -1;
  model.chad = chad;
  for (const o of [...P.armR.children]) if (o.userData.inHand) chad.hold(o);
  model.materials.push(mat);
  model.bulk = undefined;
  chad.bulk(0);
}

// Back to blocks.
export function removeChad(model) {
  const chad = model.chad;
  if (!chad) return;
  const P = model.parts;
  for (const m of chad.meshes) m.parent.remove(m);
  for (const side of ['R', 'L']) {
    const f = chad.fore[side];
    for (const o of [...f.children]) {
      if (!o.userData.inHand) continue;
      P['arm' + side].add(o);
      o.position.copy(o.userData.handPos);
    }
    f.parent.remove(f);
  }
  for (const [n, [pos, sc]] of Object.entries(chad.save)) {
    P[n].position.copy(pos);
    P[n].scale.copy(sc);
  }
  for (const m of [...model.baseMeshes, ...model.outerMeshes]) m.visible = true;
  model.materials.splice(model.materials.indexOf(chad.mat), 1);
  chad.mat.dispose();
  model.hipY = 12;
  model.chad = null;
  model.bulk = undefined;
}

// First-person arms: the fist at 0 and the shoulder up +y, sized like the
// blocky first-person arm (0.034 per pixel). The left arm reaches back off
// screen, so its upper arm is stretched long.
const VIEW_U = 0.034;
const STRETCHED = new Map();
function stretched(geo) {
  if (!STRETCHED.has(geo)) {
    const g = geo.clone();
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const e = (CHAD.elbow[1] - CHAD.fist[1]) * PX;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > e) {
        p.setY(i, e + (y - e) * 2.4);
        const ny = n.getY(i) / 2.4;
        const l = Math.hypot(n.getX(i), ny, n.getZ(i)) || 1;
        n.setXYZ(i, n.getX(i) / l, ny / l, n.getZ(i) / l);
      }
    }
    g.computeBoundingSphere();
    STRETCHED.set(geo, g);
  }
  return STRETCHED.get(geo);
}

export function chadViewArm(look, side, material, long = false) {
  const geo = look.geo['view' + side];
  const m = new THREE.Mesh(long ? stretched(geo) : geo, material);
  m.scale.setScalar(VIEW_U / PX);
  return m;
}

export function chadMaterial(map) {
  return new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.62, metalness: 0 });
}

// How he stands: lats so wide his arms hang out a little, and a neck that
// only bends so far (a person's head can't fold flat like a block's).
export function chadStance(model, rig) {
  const P = model.parts;
  const aim = rig ? rig.get('aim') : 0;
  const out = 0.13 * (1 - aim);
  P.armR.rotation.z -= out;
  P.armL.rotation.z += out;
  P.head.rotation.x = Math.max(-0.8, Math.min(0.65, P.head.rotation.x));
  const c = model.chad;
  for (const side of ['R', 'L']) {
    const b = c.bend[side];
    c.fore[side].rotation.set(b ? b[0] : 0, b ? b[1] : 0, b ? b[2] : 0);
    c.bend[side] = null;
  }
}
