import * as THREE from 'three';

// The Ember blaster, built from ~1,500 voxels like a pixel-art item model.
// Voxel (i, j, k): i runs back to front along the barrel, j bottom to top,
// k left to right. The barrel points down -z in model space.

const S = 0.014; // size of one voxel
const I0 = 20; // voxel at the model origin (middle of the receiver)
const J0 = 12;
const K0 = 4;

const PAL = {
  1: '#383e48', // dark steel
  2: '#56606e', // steel
  3: '#707985', // light steel
  5: '#ff7a2f', // ember
  6: '#a8401a', // ember shadow
  7: '#ffd36b', // glow
  8: '#c49a45', // brass
  9: '#2c2e34', // rubber
  10: '#43454d', // rubber ridge
  11: '#8ff0ff', // sight reticle
  12: '#08090a', // bore
  13: '#ffb040', // vent heat (tinted by how hot the gun is)
  14: '#ff7a2f', // ember glow
};

// Parts that move or glow get their own meshes. Faces are only hidden
// between voxels of the same group, so moving parts never show holes.
const GROUP = { body: 'body', glow: 'body', shroud: 'shroud', heat: 'shroud', cell: 'cell', cellGlow: 'cell' };

class Voxels {
  constructor() {
    this.map = new Map();
  }
  key(i, j, k) {
    return i * 4096 + j * 64 + k;
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
}

function design() {
  const v = new Voxels();
  // Stock: rubber butt pad and a skeleton frame.
  v.box(0, 1, 7, 15, 2, 6, 9);
  for (let j = 7; j <= 15; j += 2) v.paint(0, 0, j, j, 2, 6, 10);
  v.box(2, 8, 8, 15, 3, 5, 2);
  v.carve(3, 6, 10, 12, 3, 5);
  v.paint(2, 8, 8, 8, 3, 5, 1);

  // Receiver, stepped narrower at the bottom.
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
  // Glowing charge window on both sides.
  v.carve(17, 23, 12, 14, 1, 1);
  v.carve(17, 23, 12, 14, 7, 7);
  // Glowing coil bands in the window.
  for (let i = 17; i <= 23; i++) {
    const c = i % 2 ? 7 : 14;
    v.box(i, i, 12, 14, 2, 2, c, 'glow');
    v.box(i, i, 12, 14, 6, 6, c, 'glow');
  }
  // Ejection slots on top and a charging handle on the right.
  for (const i of [18, 20, 22]) v.paint(i, i, 16, 16, 2, 6, 1);
  v.box(26, 28, 14, 15, 8, 8, 3);
  // Top rail with teeth.
  v.box(9, 30, 17, 17, 3, 5, 1);
  for (let i = 9; i <= 30; i += 2) v.box(i, i, 18, 18, 3, 5, 1);

  // Red-dot sight: a low housing and an open hoop with a glowing dot.
  v.box(14, 20, 18, 19, 3, 5, 2);
  v.box(15, 16, 20, 20, 4, 4, 1);
  v.box(19, 20, 20, 23, 2, 6, 1);
  v.carve(19, 20, 20, 22, 3, 5);
  v.paint(19, 20, 23, 23, 2, 6, 3);
  v.set(20, 21, 4, 11, 'glow');

  // Barrel and muzzle brake.
  v.box(31, 47, 11, 13, 3, 5, 1);
  v.box(44, 47, 10, 14, 2, 6, 2);
  v.carve(45, 45, 11, 13, 2, 2);
  v.carve(45, 45, 11, 13, 6, 6);
  v.carve(45, 45, 14, 14, 3, 5);
  v.paint(47, 47, 10, 14, 2, 6, 1);
  v.set(47, 12, 4, 12);
  v.box(43, 43, 15, 16, 4, 4, 1);

  // Foregrip under the barrel.
  v.box(33, 36, 5, 10, 3, 5, 9);
  for (let j = 5; j <= 9; j += 2) v.paint(36, 36, j, j, 3, 5, 10);

  // Pistol grip, raked back, with finger ridges.
  for (let j = 8; j >= 1; j--) {
    const shift = Math.floor((8 - j) / 2);
    v.box(11 - shift, 15 - shift, j, j, 3, 5, 9);
    if (j % 2) v.paint(15 - shift, 15 - shift, j, j, 3, 5, 10);
  }
  v.box(7, 11, 0, 0, 3, 5, 2);

  // Trigger guard and trigger.
  v.box(15, 19, 5, 5, 4, 4, 1);
  v.box(19, 19, 6, 8, 4, 4, 1);
  v.set(16, 8, 4, 3);
  v.set(16, 7, 4, 3);
  v.set(17, 6, 4, 3);
  // Magazine well.
  v.box(19, 26, 8, 8, 2, 6, 1);

  // Barrel shroud (slides back when you fire) with heat vents.
  v.box(31, 42, 10, 14, 2, 6, 2, 'shroud');
  v.paint(41, 41, 10, 14, 2, 6, 5);
  v.paint(31, 31, 10, 14, 2, 6, 1);
  for (const i of [33, 35, 37, 39]) {
    v.carve(i, i, 14, 14, 3, 5);
    v.carve(i, i, 11, 13, 2, 2);
    v.carve(i, i, 11, 13, 6, 6);
    v.box(i, i, 11, 13, 3, 5, 13, 'heat');
  }

  // Energy cell magazine (drops out when reloading).
  v.box(20, 25, 1, 7, 2, 6, 5, 'cell');
  v.paint(20, 25, 1, 1, 2, 6, 6);
  v.paint(20, 25, 4, 4, 2, 6, 6);
  v.paint(20, 25, 7, 7, 2, 6, 1);
  for (const k of [2, 6]) {
    v.box(21, 24, 2, 3, k, k, 7, 'cellGlow');
    v.box(21, 24, 5, 6, k, k, 7, 'cellGlow');
  }
  return v;
}

// Unit-cube corners for each face, as seen from outside, and the voxel step
// that faces that way.
const FACES = [
  { n: [1, 0, 0], d: [0, 0, 1], shade: 0.88, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], d: [0, 0, -1], shade: 0.88, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], d: [0, 1, 0], shade: 1, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], d: [0, -1, 0], shade: 0.62, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], d: [-1, 0, 0], shade: 0.8, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], d: [1, 0, 0], shade: 0.8, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

function hash(i, j, k) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function meshPart(vox, part) {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const lit = !['glow', 'heat', 'cellGlow'].includes(part);
  const base = new THREE.Color();
  for (const v of vox.map.values()) {
    if (v.part !== part) continue;
    const { i, j, k } = v;
    const same = (dj) => {
      const n = vox.get(i, j + dj, k);
      return n && GROUP[n.part] === GROUP[part];
    };
    base.set(PAL[v.c]);
    // Pixel-art shading: bright top edges, dark bottom edges, a little grain.
    let tone = 0.94 + hash(i, j, k) * 0.12;
    if (lit) {
      if (!same(1)) tone *= 1.35;
      else if (!same(-1)) tone *= 0.75;
    }
    const x0 = (k - K0 - 0.5) * S;
    const y0 = (j - J0 - 0.5) * S;
    const z0 = -(i - I0 + 0.5) * S;
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

let shared = null;
function geometries() {
  if (shared) return shared;
  const vox = design();
  shared = {};
  for (const part of Object.keys(GROUP)) shared[part] = meshPart(vox, part);
  shared.muzzle = new THREE.Vector3(0, 0, -(48 - I0) * S);
  shared.flashTex = flashTexture();
  return shared;
}

// A spiky star burst for the muzzle flash.
function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.translate(32, 32);
  ctx.fillStyle = 'rgba(255, 150, 50, 0.9)';
  for (let s = 0; s < 8; s++) {
    const a = (s / 8) * Math.PI * 2;
    const len = s % 2 ? 18 : 31;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.22) * 6, Math.sin(a - 0.22) * 6);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.lineTo(Math.cos(a + 0.22) * 6, Math.sin(a + 0.22) * 6);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
  g.addColorStop(0, 'rgba(255, 255, 240, 1)');
  g.addColorStop(0.4, 'rgba(255, 220, 110, 0.95)');
  g.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(-32, -32, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildBlaster() {
  const geo = geometries();
  const g = new THREE.Group();
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const heat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const flashMat = new THREE.MeshBasicMaterial({
    map: geo.flashTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  g.add(new THREE.Mesh(geo.body, solid), new THREE.Mesh(geo.glow, glow));
  const shroud = new THREE.Group();
  shroud.add(new THREE.Mesh(geo.shroud, solid), new THREE.Mesh(geo.heat, heat));
  g.add(shroud);
  const cell = new THREE.Group();
  cell.add(new THREE.Mesh(geo.cell, solid), new THREE.Mesh(geo.cellGlow, glow));
  g.add(cell);
  const muzzle = new THREE.Object3D();
  muzzle.position.copy(geo.muzzle);
  g.add(muzzle);

  // Flash: a star facing back at you, plus a flame plume seen from the side.
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

  const setHeat = (h) => heat.color.setRGB(0.18 + 0.95 * h, 0.07 + 0.6 * h, 0.05 + 0.25 * h);
  setHeat(0);
  g.userData = {
    muzzle,
    cell,
    shroud,
    flash,
    setHeat,
    // Show or hide the flash, spinning and resizing it each shot.
    showFlash(on) {
      flash.visible = on;
      if (on) {
        flash.rotation.z = Math.random() * Math.PI;
        flash.scale.setScalar(0.8 + Math.random() * 0.45);
      }
    },
    dispose() {
      for (const m of [solid, glow, heat, flashMat]) m.dispose();
      face.geometry.dispose();
      plume.geometry.dispose();
    },
  };
  return g;
}
