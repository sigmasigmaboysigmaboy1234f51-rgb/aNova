import * as THREE from 'three';

// Small models made of coloured boxes, baked into one mesh per moving part,
// so a detailed pet or mob still costs only a few draw calls. Colours go in
// the vertices, with a little shading from bottom to top of every box.

const col = new THREE.Color();
const mtx = new THREE.Matrix4();
const rot = new THREE.Quaternion();
const eul = new THREE.Euler();
const at = new THREE.Vector3();
const one = new THREE.Vector3(1, 1, 1);
const nm = new THREE.Matrix3();
const v = new THREE.Vector3();

// Corners of each face of a unit box centred on 0, and its normal.
const FACES = [
  [[1, 0, 0], [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]],
  [[-1, 0, 0], [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]],
  [[0, 1, 0], [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]],
  [[0, -1, 0], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]],
  [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
  [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]],
];

export class Vox {
  // unit scales every size and position (PX for skin-pixel sizes).
  constructor(unit = 1) {
    this.unit = unit;
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }

  // A w×h×d box centred on (x, y, z), turned by rx, ry, rz (radians).
  // ao darkens the bottom of the box a little (0 = flat colour).
  box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0, ao = 0.18) {
    const u = this.unit;
    rot.setFromEuler(eul.set(rx, ry, rz));
    mtx.compose(at.set(x * u, y * u, z * u), rot, one);
    nm.getNormalMatrix(mtx);
    col.set(color);
    for (const [n, corners] of FACES) {
      const base = this.pos.length / 3;
      for (const c of corners) {
        v.set(c[0] * w * u, c[1] * h * u, c[2] * d * u).applyMatrix4(mtx);
        this.pos.push(v.x, v.y, v.z);
        v.set(n[0], n[1], n[2]).applyMatrix3(nm).normalize();
        this.nor.push(v.x, v.y, v.z);
        const k = 1 - ao * (0.5 - c[1]);
        this.col.push(col.r * k, col.g * k, col.b * k);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  // Same box on both sides of the middle (x and -x).
  pair(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0, ao) {
    this.box(w, h, d, x, y, z, color, rx, ry, rz, ao);
    return this.box(w, h, d, -x, y, z, color, rx, -ry, -rz, ao);
  }

  // A rounded blob made of columns of boxes, step units across. paint(nx,
  // ny) picks the colour from where a column sits (-1..1 across and up).
  ellipsoid(cx, cy, cz, rx, ry, rz, step, paint, ao = 0.1) {
    const nx = Math.max(1, Math.round((rx * 2) / step));
    const ny = Math.max(1, Math.round((ry * 2) / step));
    const sx = (rx * 2) / nx;
    const sy = (ry * 2) / ny;
    for (let i = 0; i < nx; i++) {
      const x = -rx + sx * (i + 0.5);
      for (let j = 0; j < ny; j++) {
        const y = -ry + sy * (j + 0.5);
        const q = 1 - (x / rx) ** 2 - (y / ry) ** 2;
        if (q <= 0.02) continue;
        const d = Math.max(sx, Math.round((rz * Math.sqrt(q) * 2) / step) * step);
        this.box(sx, sy, d, cx + x, cy + y, cz, paint(x / rx, y / ry), 0, 0, 0, ao);
      }
    }
    return this;
  }

  get empty() {
    return this.idx.length === 0;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Shared materials that take their colour from the vertices.
export const VOX_LIT = new THREE.MeshLambertMaterial({ vertexColors: true });
export const VOX_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });

// A mesh from a Vox (or an empty group if nothing was added).
export function voxMesh(vox, material = VOX_LIT) {
  if (vox.empty) return new THREE.Group();
  return new THREE.Mesh(vox.geometry(), material);
}
