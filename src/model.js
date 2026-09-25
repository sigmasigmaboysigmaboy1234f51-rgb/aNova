import * as THREE from 'three';
import { LAYOUT } from './skin.js';

// One skin pixel in world units. A 32 px tall character is 1.8 blocks tall.
export const PX = 1.8 / 32;

// Maps the six faces of a box onto a skin's unfolded-box layout.
// Face order matches BoxGeometry: +x, -x, +y, -y, +z, -z. Models face +z,
// so +x is the character's left side.
export function setBoxUV(geo, u, v, w, h, d, tw = 64, th = 64) {
  const face = (x1, y1, x2, y2) => [
    [x1 / tw, 1 - y2 / th],
    [x2 / tw, 1 - y2 / th],
    [x2 / tw, 1 - y1 / th],
    [x1 / tw, 1 - y1 / th],
  ];
  const top = face(u + d, v, u + d + w, v + d);
  const bottom = face(u + d + w, v, u + d + w * 2, v + d);
  const right = face(u, v + d, u + d, v + d + h);
  const front = face(u + d, v + d, u + d + w, v + d + h);
  const left = face(u + d + w, v + d, u + d * 2 + w, v + d + h);
  const back = face(u + d * 2 + w, v + d, u + d * 2 + w * 2, v + d + h);
  const tl = (f) => [f[3], f[2], f[0], f[1]];
  const faces = [tl(left), tl(right), tl(top), [bottom[0], bottom[1], bottom[3], bottom[2]], tl(front), tl(back)];
  const uv = geo.attributes.uv;
  let i = 0;
  for (const f of faces) for (const [x, y] of f) uv.setXY(i++, x, y);
  uv.needsUpdate = true;
}

export function buildHumanoid(texture, { slim = false, limb = 0 } = {}) {
  const armW = limb || (slim ? 3 : 4);
  const legW = limb || 4;
  const depth = limb || 4;
  const base = new THREE.MeshLambertMaterial({ map: texture });
  const outer = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const parts = {};
  const baseMeshes = [];
  const outerMeshes = [];

  const add = (name, w, h, d, px, py, offsetY, inflate) => {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    g.position.set(px * PX, py * PX, 0);
    const [u, v] = LAYOUT[name].base;
    const [ou, ov] = LAYOUT[name].outer;
    const geo = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
    setBoxUV(geo, u, v, w, h, d);
    const m = new THREE.Mesh(geo, base);
    m.position.y = offsetY * PX;
    const k = inflate * 2;
    const geo2 = new THREE.BoxGeometry((w + k) * PX, (h + k) * PX, (d + k) * PX);
    setBoxUV(geo2, ou, ov, w, h, d);
    const m2 = new THREE.Mesh(geo2, outer);
    m2.position.y = offsetY * PX;
    g.add(m, m2);
    root.add(g);
    parts[name] = g;
    baseMeshes.push(m);
    outerMeshes.push(m2);
  };

  add('head', 8, 8, 8, 0, 24, 4, 0.5);
  add('body', 8, 12, 4, 0, 18, 0, 0.25);
  add('armR', armW, 12, depth, -(4 + armW / 2), 22, -4, 0.25);
  add('armL', armW, 12, depth, 4 + armW / 2, 22, -4, 0.25);
  add('legR', legW, 12, depth, -2, 12, -6, 0.25);
  add('legL', legW, 12, depth, 2, 12, -6, 0.25);

  return {
    root,
    parts,
    baseMeshes,
    outerMeshes,
    materials: [base, outer],
    dispose() {
      for (const m of [...baseMeshes, ...outerMeshes]) m.geometry.dispose();
      base.dispose();
      outer.dispose();
    },
  };
}

export function buildGloop(texture) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.46, 0.46),
    new THREE.MeshLambertMaterial({ color: 0x4c1f73 }),
  );
  inner.position.y = 0.36;
  const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  setBoxUV(geo, 0, 0, 8, 8, 8);
  const shellMat = new THREE.MeshLambertMaterial({ map: texture, transparent: true });
  const shell = new THREE.Mesh(geo, shellMat);
  shell.position.y = 0.45;
  body.add(inner, shell);
  return {
    root,
    body,
    materials: [inner.material, shellMat],
    dispose() {
      geo.dispose();
      inner.geometry.dispose();
      inner.material.dispose();
      shellMat.dispose();
    },
  };
}

// A chunky little energy blaster. Barrel points down -z.
export function buildBlaster() {
  const g = new THREE.Group();
  const mats = new Map();
  const mat = (c, glow) => {
    const key = c + (glow || '');
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshLambertMaterial({ color: c, emissive: glow || 0x000000 }));
    }
    return mats.get(key);
  };
  const box = (w, h, d, x, y, z, c, rx = 0, glow) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, glow));
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  box(0.1, 0.12, 0.42, 0, 0, -0.05, '#3b3f46');
  box(0.05, 0.03, 0.3, 0, 0.075, -0.02, '#23262b');
  box(0.03, 0.04, 0.03, 0, 0.105, -0.17, '#ffb13b', 0, '#7a4a00');
  box(0.065, 0.065, 0.2, 0, 0.01, -0.35, '#5b6068');
  box(0.08, 0.08, 0.04, 0, 0.01, -0.46, '#2b2e33');
  box(0.108, 0.05, 0.16, 0, -0.005, 0.02, '#ff8a2a', 0, '#8a3200');
  box(0.07, 0.16, 0.08, 0, -0.12, 0.09, '#2a2c31', 0.3);
  box(0.06, 0.1, 0.07, 0, -0.09, -0.13, '#4a4f57');
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, -0.5);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  return g;
}
