import * as THREE from 'three';
import { buildHumanoid, buildGloop, PX } from './model.js';

// Bodies for every mob family, plus the bits that make variants stand out:
// armour, ice spikes, shock rods, horns, shields and swords.

const shared = new Map();
function mat(key, make) {
  if (!shared.has(key)) shared.set(key, make());
  return shared.get(key);
}
const lambert = (color, emissive = 0) => mat(`l${color}|${emissive}`, () => new THREE.MeshLambertMaterial({ color, emissive }));
const basic = (color) => mat(`b${color}`, () => new THREE.MeshBasicMaterial({ color }));
function box(w, h, d, material) {
  const key = `g${w}|${h}|${d}`;
  const geo = mat(key, () => new THREE.BoxGeometry(w, h, d));
  return new THREE.Mesh(geo, material);
}
// Sizes in skin pixels, like the characters.
const pbox = (w, h, d, material) => box(w * PX, h * PX, d * PX, material);

function helmet(parent, y, size) {
  const iron = lambert(0x9a9aa2);
  const dark = lambert(0x5a5a62);
  const g = new THREE.Group();
  const top = pbox(size + 1, 3, size + 1, iron);
  top.position.y = y + 1.5 * PX;
  const rim = pbox(size + 1.6, 1, size + 1.6, dark);
  rim.position.y = y;
  const crest = pbox(1, 2, size - 1, dark);
  crest.position.y = y + 3.5 * PX;
  g.add(top, rim, crest);
  parent.add(g);
}

function spikes(parent, y, spread, color) {
  const ice = mat(`ice${color}`, () => new THREE.MeshLambertMaterial({ color, emissive: 0x16384a, transparent: true, opacity: 0.85 }));
  for (let i = -1; i <= 1; i++) {
    const s = pbox(1.4, 3 + (i === 0 ? 2 : 0), 1.4, ice);
    s.position.set(i * spread * PX, y + (i === 0 ? 2.5 : 1.5) * PX, 0);
    s.rotation.z = -i * 0.35;
    parent.add(s);
  }
}

function rod(parent, y, color) {
  const pole = pbox(0.8, 4, 0.8, lambert(0x4a4a50));
  pole.position.y = y + 2 * PX;
  const tip = pbox(1.6, 1.6, 1.6, basic(color));
  tip.position.y = y + 4.6 * PX;
  parent.add(pole, tip);
  return tip;
}

// --- Humanoid families ----------------------------------------------------

function decorateHumanoid(m, def) {
  const P = m.parts;
  const fam = def.family;
  if (fam === 'imp') {
    const horn = lambert(0x2a1210);
    for (const x of [-3, 3]) {
      const h = pbox(1.5, 3, 1.5, horn);
      h.position.set(x * PX, 9.5 * PX, 0);
      h.rotation.z = -Math.sign(x) * 0.3;
      P.head.add(h);
    }
    const tail = pbox(1, 1, 7, lambert(0xa8321f));
    tail.position.set(0, 1 * PX, -5 * PX);
    tail.rotation.x = 0.6;
    const tip = pbox(2, 2, 2, lambert(0x2a1210));
    tip.position.set(0, 3.2 * PX, -8.3 * PX);
    P.hips.add(tail, tip);
    m.tail = tail;
  } else if (fam === 'knight') {
    const shield = new THREE.Group();
    const face = pbox(1.2, 11, 8, lambert(0x6e4630));
    const rim = pbox(1.4, 12, 1, lambert(0x8f8f93));
    rim.position.z = 4 * PX;
    const rim2 = rim.clone();
    rim2.position.z = -4 * PX;
    const boss = pbox(1.4, 3, 3, lambert(0xc9a23a));
    boss.position.x = 0.5 * PX;
    shield.add(face, rim, rim2, boss);
    shield.position.set(3.2 * PX, -7 * PX, 0);
    P.armL.add(shield);
    m.shield = shield;
    const sword = new THREE.Group();
    const blade = pbox(1, 14, 2, lambert(0xc8c8d0));
    blade.position.y = -10 * PX;
    const guard = pbox(1.2, 1, 5, lambert(0xc9a23a));
    guard.position.y = -3 * PX;
    const grip = pbox(1.2, 3, 1.2, lambert(0x3a2418));
    grip.position.y = -1.5 * PX;
    sword.add(blade, guard, grip);
    sword.position.set(0, -10.5 * PX, 1.5 * PX);
    sword.rotation.x = -Math.PI / 2;
    P.armR.add(sword);
  } else if (fam === 'fuse') {
    const wick = pbox(1, 4, 1, lambert(0x2a2622));
    wick.position.y = 10 * PX;
    const spark = pbox(1.8, 1.8, 1.8, basic(0xffd84a));
    spark.position.y = 12.4 * PX;
    P.head.add(wick, spark);
    m.spark = spark;
  } else if (fam === 'golem') {
    const moss = lambert(0x4f7d2f);
    for (const arm of [P.armR, P.armL]) {
      const tuft = pbox(5, 2, 5, moss);
      tuft.position.y = 1 * PX;
      arm.add(tuft);
    }
  } else if (fam === 'ghost') {
    P.legR.visible = false;
    P.legL.visible = false;
  }
  const v = def.variant;
  if (v === 'armored') {
    helmet(P.head, 8 * PX, 8);
    const plate = pbox(9, 8, 5.2, lambert(0x9a9aa2));
    plate.position.y = 2 * PX;
    const band = pbox(9.2, 1, 5.4, lambert(0x5a5a62));
    band.position.y = -2.5 * PX;
    P.body.add(plate, band);
  } else if (v === 'frost') {
    spikes(P.head, 8 * PX, 2.5, 0xc9ecff);
  } else if (v === 'shock') {
    m.glowTip = rod(P.head, 8 * PX, 0xfff6a0);
  }
}

// --- Skitter: a low body on eight legs ---------------------------------------

function buildCrawler(def) {
  const [main, dark, eye, light] = def.colors;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bodyMat = new THREE.MeshLambertMaterial({ color: main });
  const darkMat = new THREE.MeshLambertMaterial({ color: dark });
  const lightMat = new THREE.MeshLambertMaterial({ color: light });
  const eyeMat = new THREE.MeshBasicMaterial({ color: eye });
  const materials = [bodyMat, darkMat, lightMat];
  const abdomen = box(0.62, 0.42, 0.7, bodyMat);
  abdomen.position.set(0, 0.46, -0.3);
  const stripe = box(0.64, 0.08, 0.5, lightMat);
  stripe.position.set(0, 0.68, -0.32);
  const thorax = box(0.44, 0.32, 0.38, darkMat);
  thorax.position.set(0, 0.42, 0.15);
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.38);
  const skull = box(0.36, 0.28, 0.24, bodyMat);
  head.add(skull);
  for (const [x, y] of [
    [-0.1, 0.05],
    [0.1, 0.05],
    [-0.05, -0.04],
    [0.05, -0.04],
  ]) {
    const e = box(0.06, 0.06, 0.02, eyeMat);
    e.position.set(x, y, 0.125);
    head.add(e);
  }
  const fangL = box(0.04, 0.1, 0.04, lightMat);
  fangL.position.set(-0.07, -0.16, 0.1);
  const fangR = fangL.clone();
  fangR.position.x = 0.07;
  head.add(fangL, fangR);
  body.add(abdomen, stripe, thorax, head);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.2, 0.44, 0.28 - i * 0.14);
      const upper = box(0.5, 0.07, 0.07, darkMat);
      upper.position.x = side * 0.25;
      upper.rotation.z = side * 0.55;
      const knee = new THREE.Group();
      knee.position.set(side * 0.44, 0.26, 0);
      const lower = box(0.07, 0.58, 0.07, bodyMat);
      lower.position.y = -0.28;
      knee.add(lower);
      knee.rotation.z = side * -0.35;
      hip.add(upper, knee);
      hip.rotation.y = side * (0.45 - i * 0.3);
      hip.userData = { side, i, base: hip.rotation.y };
      body.add(hip);
      legs.push(hip);
    }
  }
  if (def.variant === 'armored') {
    const plate = box(0.7, 0.14, 0.62, lambert(0x9a9aa2));
    plate.position.set(0, 0.72, -0.28);
    body.add(plate);
    helmet(head, 0.1, 6);
  } else if (def.variant === 'frost') spikes(abdomen, 0.2, 3, 0xc9ecff);
  else if (def.variant === 'shock') rod(abdomen, 0.2, 0xfff6a0);
  return {
    root,
    body,
    head,
    legs,
    parts: {},
    materials,
    dispose() {
      for (const m of materials) m.dispose();
      eyeMat.dispose();
    },
  };
}

// --- Flapper: a flying fuzzball with leathery wings ---------------------------

function buildFlyer(def) {
  const [main, dark, eye, light] = def.colors;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.3;
  root.add(body);
  const bodyMat = new THREE.MeshLambertMaterial({ color: main });
  const darkMat = new THREE.MeshLambertMaterial({ color: dark, side: THREE.DoubleSide });
  const lightMat = new THREE.MeshLambertMaterial({ color: light });
  const eyeMat = new THREE.MeshBasicMaterial({ color: eye });
  const materials = [bodyMat, darkMat, lightMat];
  const torso = box(0.34, 0.36, 0.3, bodyMat);
  const belly = box(0.24, 0.24, 0.04, lightMat);
  belly.position.set(0, -0.03, 0.15);
  const head = new THREE.Group();
  head.position.set(0, 0.26, 0.04);
  head.add(box(0.3, 0.24, 0.26, bodyMat));
  for (const x of [-0.08, 0.08]) {
    const e = box(0.06, 0.05, 0.02, eyeMat);
    e.position.set(x, 0.02, 0.135);
    head.add(e);
    const ear = box(0.08, 0.16, 0.04, darkMat);
    ear.position.set(x * 1.4, 0.18, 0);
    ear.rotation.z = -Math.sign(x) * 0.25;
    head.add(ear);
  }
  const fang = box(0.03, 0.05, 0.02, basic(0xf4f1ea));
  fang.position.set(0.04, -0.09, 0.13);
  head.add(fang);
  body.add(torso, belly, head);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.16, 0.08, 0);
    const inner = box(0.34, 0.03, 0.3, darkMat);
    inner.position.x = side * 0.17;
    const tip = new THREE.Group();
    tip.position.x = side * 0.34;
    const outer = box(0.34, 0.03, 0.24, darkMat);
    outer.position.set(side * 0.17, 0, -0.03);
    const bone = box(0.36, 0.05, 0.04, bodyMat);
    bone.position.set(side * 0.17, 0.02, 0.12);
    tip.add(outer, bone);
    wing.add(inner, tip);
    wing.userData = { side, tip };
    body.add(wing);
    wings.push(wing);
  }
  if (def.variant === 'armored') helmet(head, 0.12, 5.5);
  else if (def.variant === 'frost') spikes(head, 0.12, 2, 0xc9ecff);
  else if (def.variant === 'shock') rod(head, 0.12, 0xfff6a0);
  return {
    root,
    body,
    head,
    wings,
    parts: {},
    materials,
    dispose() {
      for (const m of materials) m.dispose();
      eyeMat.dispose();
    },
  };
}

// Build the model for a mob type. tex is its painted skin (humanoids and
// gloops); the others are coloured blocks.
export function buildMobModel(def, tex) {
  let m;
  if (def.body === 'gloop') {
    m = buildGloop(tex);
    if (def.variant === 'armored') helmet(m.body, 0.9, 13);
    else if (def.variant === 'frost') spikes(m.body, 0.9, 3, 0xc9ecff);
    else if (def.variant === 'shock') rod(m.body, 0.9, 0xfff6a0);
  } else if (def.body === 'crawler') m = buildCrawler(def);
  else if (def.body === 'flyer') m = buildFlyer(def);
  else {
    m = buildHumanoid(tex, { limb: def.limb || 0 });
    decorateHumanoid(m, def);
  }
  m.root.scale.setScalar(def.scale || 1);
  if (def.alpha < 1) {
    for (const material of m.materials) {
      material.transparent = true;
      material.opacity = def.alpha;
      material.depthWrite = false;
    }
  }
  if (def.glow) {
    const c = new THREE.Color(def.glow).multiplyScalar(0.18);
    m.baseEmissive = c;
  }
  return m;
}
