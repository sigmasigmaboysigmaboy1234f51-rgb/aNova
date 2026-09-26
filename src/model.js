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

// Body parts hang off a hips joint so the whole upper body can lean
// (crouching, sprinting, getting hit) while the legs stay planted.
export function buildHumanoid(texture, { slim = false, limb = 0 } = {}) {
  const armW = limb || (slim ? 3 : 4);
  const legW = limb || 4;
  const depth = limb || 4;
  const base = new THREE.MeshLambertMaterial({ map: texture });
  const outer = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hips = new THREE.Group();
  hips.rotation.order = 'YXZ';
  hips.position.set(0, 12 * PX, 0);
  root.add(hips);
  const parts = { hips };
  const baseMeshes = [];
  const outerMeshes = [];

  const add = (parent, name, w, h, d, px, py, offsetY, inflate) => {
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
    parent.add(g);
    parts[name] = g;
    baseMeshes.push(m);
    outerMeshes.push(m2);
  };

  // Upper body positions are relative to the hips (12 px off the ground).
  add(hips, 'body', 8, 12, 4, 0, 6, 0, 0.25);
  add(hips, 'head', 8, 8, 8, 0, 12, 4, 0.5);
  add(hips, 'armR', armW, 12, depth, -(4 + armW / 2), 10, -4, 0.25);
  add(hips, 'armL', armW, 12, depth, 4 + armW / 2, 10, -4, 0.25);
  add(root, 'legR', legW, 12, depth, -2, 12, -6, 0.25);
  add(root, 'legL', legW, 12, depth, 2, 12, -6, 0.25);

  return {
    root,
    parts,
    armW,
    legW,
    baseMeshes,
    outerMeshes,
    materials: [base, outer],
    dispose() {
      for (const m of [...baseMeshes, ...outerMeshes]) m.geometry.dispose();
      base.dispose();
      outer.dispose();
      // The Giga Chad body (chad.js) shares its geometry; only its paint is ours.
      if (this.chad) this.chad.mat.dispose();
    },
  };
}

// The Super Buff cheat: k from 0 (normal) to 1 (huge muscles). Wider,
// deeper chest, thick arms and legs, and a head that looks small on top.
// Only the limb boxes grow, so a gun in the hand keeps its shape.
export function setBulk(model, k) {
  const P = model.parts;
  if (!P || !P.body || model.bulk === k) return;
  model.bulk = k;
  if (model.chad) return model.chad.bulk(k);
  P.body.scale.set(1 + 0.55 * k, 1 + 0.08 * k, 1 + 0.65 * k);
  P.head.scale.setScalar(1 - 0.08 * k);
  P.head.position.y = (12 + 0.5 * k) * PX;
  const armX = 4 + model.armW / 2 + 2.2 * k + (model.armW / 2) * 0.75 * k;
  P.armR.position.set(-armX * PX, (10 + 0.5 * k) * PX, 0);
  P.armL.position.set(armX * PX, (10 + 0.5 * k) * PX, 0);
  for (const n of ['armR', 'armL']) for (const m of P[n].children.slice(0, 2)) m.scale.set(1 + 0.75 * k, 1 + 0.05 * k, 1 + 0.75 * k);
  const legX = 2 + 0.9 * k;
  P.legR.position.x = -legX * PX;
  P.legL.position.x = legX * PX;
  for (const n of ['legR', 'legL']) for (const m of P[n].children.slice(0, 2)) m.scale.set(1 + 0.45 * k, 1, 1 + 0.5 * k);
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

import { buildGun } from './gun.js';

// Puts a gun in a humanoid's right hand, grip in the palm.
export function holdGun(model, gunId, build) {
  const gun = buildGun(gunId, build);
  gun.scale.setScalar(0.85);
  gun.rotation.set(-Math.PI / 2, 0, Math.PI);
  gun.position.set(0, -11.7 * PX, 1.7 * PX);
  gun.userData.inHand = true;
  model.parts.armR.add(gun);
  if (model.chad) model.chad.hold(gun);
  return gun;
}
