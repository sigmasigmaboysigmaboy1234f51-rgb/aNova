import * as THREE from 'three';
import { buildHumanoid, buildGloop, PX } from './model.js';
import { Vox } from './vox.js';

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

// --- Skitter: a hairy spider on eight jointed legs --------------------------
// The legs are three-part chains (femur, tibia, foot) that the mob bends
// every frame so the feet land on the ground (see poseCrawler in mob.js).

export const SPIDER = {
  L1: 0.42,
  L2: 0.46,
  L3: 0.2,
  // Where each leg joins the body (front to back), and where its foot
  // rests: angle from straight out to the side toward the front, and reach.
  sockets: [
    [0.19, 0.27],
    [0.21, 0.16],
    [0.21, 0.05],
    [0.19, -0.05],
  ],
  angles: [0.95, 0.35, -0.3, -0.85],
  reach: [0.66, 0.58, 0.58, 0.64],
  hipY: 0.44,
  ankle: -1.2,
};

const spiderGeos = new Map();
function mix(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getStyle();
}

function spiderGeometry(def) {
  const key = def.colors.join('|') + (def.variant === 'armored' ? 'A' : '');
  if (spiderGeos.has(key)) return spiderGeos.get(key);
  const [main, dark, eye, light] = def.colors;
  const mark = eye;
  const top = mix(main, light, 0.6);
  const hair = mix(dark, '#000000', 0.25);
  const fangC = '#e8e0cc';
  const G = {};

  // Cephalothorax with the leg sockets.
  const t = new Vox();
  t.ellipsoid(0, 0.46, 0.1, 0.23, 0.13, 0.25, 0.046, (x, y) => (y > 0.55 ? top : y < -0.4 ? dark : main));
  t.box(0.07, 0.012, 0.12, 0, 0.592, 0.05, dark, 0, 0, 0, 0);
  for (const a of [0.55, -0.55]) t.pair(0.018, 0.012, 0.13, 0.08, 0.585, 0.1, dark, 0, a, 0, 0);
  for (const [x, z] of SPIDER.sockets) t.pair(0.1, 0.1, 0.1, x, SPIDER.hipY, z, dark);
  t.box(0.14, 0.12, 0.14, 0, 0.47, -0.17, dark);
  G.thorax = t.geometry();

  // Big round abdomen with markings, fuzz and spinnerets.
  const a = new Vox();
  const AR = [0.29, 0.24, 0.37];
  const AC = [0, 0.1, -0.38];
  a.ellipsoid(AC[0], AC[1], AC[2], AR[0], AR[1], AR[2], 0.058, (x, y) => (y > 0.62 ? top : y < -0.5 ? dark : main));
  // Height of the abdomen's top surface over a point.
  const topY = (x, z) => AC[1] + AR[1] * Math.sqrt(Math.max(0, 1 - (x / AR[0]) ** 2 - ((z - AC[2]) / AR[2]) ** 2)) + 0.005;
  for (const [z, w] of [
    [-0.18, 0.15],
    [-0.33, 0.19],
    [-0.5, 0.14],
  ])
    a.pair(w, 0.035, 0.055, 0.05, topY(0.05, z), z, mark, 0, 0.6, 0, 0);
  a.pair(0.06, 0.035, 0.06, 0.15, topY(0.15, -0.28), -0.28, mark, 0, 0, 0, 0);
  a.pair(0.05, 0.035, 0.05, 0.12, topY(0.12, -0.58), -0.58, mark, 0, 0, 0, 0);
  // An hourglass underneath, like a black widow.
  const under = AC[1] - AR[1] - 0.004;
  a.box(0.12, 0.014, 0.07, 0, under, -0.31, mark, 0, 0, 0, 0);
  a.box(0.05, 0.014, 0.06, 0, under, -0.37, mark, 0, 0, 0, 0);
  a.box(0.12, 0.014, 0.07, 0, under, -0.43, mark, 0, 0, 0, 0);
  a.pair(0.05, 0.05, 0.08, 0.04, 0.02, AC[2] - AR[2] - 0.02, dark);
  for (const [x, y, z] of [
    [0.27, 0.2, -0.24],
    [0.28, 0.12, -0.5],
    [0.2, 0.28, -0.62],
    [0.18, 0.3, -0.14],
  ])
    a.pair(0.05, 0.05, 0.05, x, y, z, hair);
  a.box(0.05, 0.05, 0.05, 0, 0.35, -0.5, hair);
  if (def.variant === 'armored') {
    a.box(0.44, 0.05, 0.46, 0, topY(0, -0.38) + 0.01, -0.38, '#9a9aa2');
    for (const z of [-0.24, -0.52]) a.box(0.46, 0.03, 0.05, 0, topY(0, z) + 0.03, z, '#5a5a62');
  }
  G.abdomen = a.geometry();

  // Head: brow, fangs sit on it separately so they can bite.
  const h = new Vox();
  h.box(0.32, 0.22, 0.16, 0, 0.02, 0.06, main);
  h.box(0.34, 0.05, 0.07, 0, 0.12, 0.1, dark);
  h.box(0.2, 0.05, 0.1, 0, 0.15, 0.02, top);
  G.head = h.geometry();
  const e = new Vox();
  e.pair(0.075, 0.075, 0.03, 0.055, 0.035, 0.14, eye, 0, 0, 0, 0);
  e.pair(0.045, 0.045, 0.03, 0.13, 0.06, 0.125, eye, 0, 0, 0, 0);
  e.pair(0.035, 0.035, 0.035, 0.045, 0.165, 0.09, eye, 0, 0, 0, 0);
  e.pair(0.03, 0.03, 0.03, 0.11, 0.155, 0.05, eye, 0, 0, 0, 0);
  e.pair(0.022, 0.022, 0.02, 0.07, 0.055, 0.16, '#ffffff', 0, 0, 0, 0);
  G.eyes = e.geometry();
  const f = new Vox();
  f.box(0.09, 0.13, 0.09, 0, -0.06, 0, main);
  f.box(0.07, 0.03, 0.07, 0, 0.0, 0.03, hair);
  f.box(0.035, 0.09, 0.035, 0.01, -0.16, 0.02, fangC, 0, 0, 0.35);
  G.fang = f.geometry();
  const pp = new Vox();
  pp.box(0.05, 0.05, 0.14, 0, 0, 0.06, dark, 0.45, 0, 0);
  pp.box(0.045, 0.045, 0.1, 0, -0.07, 0.16, main, -0.2, 0, 0);
  pp.box(0.055, 0.055, 0.055, 0, -0.06, 0.22, light);
  G.palp = pp.geometry();

  // Leg segments, built along +x from their joint.
  const { L1, L2, L3 } = SPIDER;
  const band = mix(light, mark, 0.35);
  const l1 = new Vox();
  l1.box(L1, 0.075, 0.075, L1 / 2, 0, 0, dark);
  l1.box(0.06, 0.088, 0.088, L1 - 0.07, 0, 0, band, 0, 0, 0, 0);
  l1.box(0.1, 0.1, 0.1, L1, 0, 0, main);
  l1.box(0.02, 0.06, 0.02, 0.14, 0.055, 0, hair, 0, 0, -0.4);
  l1.box(0.02, 0.06, 0.02, 0.28, 0.055, 0, hair, 0, 0, -0.4);
  G.femur = l1.geometry();
  const l2 = new Vox();
  l2.box(L2, 0.065, 0.065, L2 / 2, 0, 0, main);
  l2.box(0.05, 0.078, 0.078, L2 - 0.06, 0, 0, band, 0, 0, 0, 0);
  l2.box(0.08, 0.075, 0.075, L2, 0, 0, dark);
  for (const x of [0.1, 0.22, 0.34]) l2.box(0.018, 0.05, 0.018, x, 0.045, 0, hair, 0, 0, -0.5);
  l2.box(0.018, 0.045, 0.018, 0.2, -0.04, 0, hair, 0, 0, 0.5);
  G.tibia = l2.geometry();
  const l3 = new Vox();
  l3.box(L3, 0.05, 0.05, L3 / 2, 0, 0, dark);
  l3.box(0.05, 0.035, 0.07, L3, 0, 0, hair);
  G.tarsus = l3.geometry();
  spiderGeos.set(key, G);
  return G;
}

function buildCrawler(def) {
  const G = spiderGeometry(def);
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);
  const skin = new THREE.MeshLambertMaterial({ vertexColors: true });
  const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const materials = [skin];
  body.add(new THREE.Mesh(G.thorax, skin));
  const abdomen = new THREE.Group();
  abdomen.position.set(0, 0.5, -0.2);
  abdomen.add(new THREE.Mesh(G.abdomen, skin));
  body.add(abdomen);
  const head = new THREE.Group();
  head.position.set(0, 0.46, 0.33);
  head.add(new THREE.Mesh(G.head, skin), new THREE.Mesh(G.eyes, eyeMat));
  const fangs = [];
  for (const s of [-1, 1]) {
    const fang = new THREE.Group();
    fang.position.set(s * 0.06, -0.06, 0.12);
    const fm = new THREE.Mesh(G.fang, skin);
    fm.scale.x = s;
    fang.add(fm);
    head.add(fang);
    fangs.push(fang);
    const palp = new THREE.Group();
    palp.position.set(s * 0.14, -0.05, 0.1);
    palp.add(new THREE.Mesh(G.palp, skin));
    head.add(palp);
    fang.userData.palp = palp;
  }
  body.add(head);
  const legs = [];
  const { L1, L2, sockets, angles, reach, hipY } = SPIDER;
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      const [sx, sz] = sockets[i];
      hip.position.set(s * sx, hipY, sz);
      hip.add(new THREE.Mesh(G.femur, skin));
      const knee = new THREE.Group();
      knee.position.x = L1;
      knee.add(new THREE.Mesh(G.tibia, skin));
      const ankle = new THREE.Group();
      ankle.position.x = L2;
      ankle.add(new THREE.Mesh(G.tarsus, skin));
      knee.add(ankle);
      hip.add(knee);
      body.add(hip);
      const a = angles[i];
      hip.userData = {
        side: s,
        i,
        // Tripod-style gait: alternate legs step together.
        group: (i + (s > 0 ? 1 : 0)) % 2,
        knee,
        ankle,
        rest: new THREE.Vector3(s * sx + s * Math.cos(a) * reach[i], 0, sz + Math.sin(a) * reach[i]),
        foot: new THREE.Vector3(),
      };
      legs.push(hip);
    }
  }
  if (def.variant === 'armored') helmet(head, 0.14, 6);
  else if (def.variant === 'frost') spikes(abdomen, 0.3, 3, 0xc9ecff);
  else if (def.variant === 'shock') rod(abdomen, 0.3, 0xfff6a0);
  const m = {
    root,
    body,
    head,
    abdomen,
    fangs,
    legs,
    parts: {},
    materials,
    dispose() {
      skin.dispose();
      eyeMat.dispose();
    },
  };
  for (const leg of legs) {
    leg.userData.foot.copy(leg.userData.rest);
    reachLeg(leg, leg.userData.foot);
  }
  return m;
}

// Bend one spider leg so its foot lands on a point (in body space).
export function reachLeg(hip, foot) {
  const { L1, L2, L3, ankle } = SPIDER;
  const u = hip.userData;
  const dx = foot.x - hip.position.x;
  const dz = foot.z - hip.position.z;
  const dy = foot.y - hip.position.y;
  const r = Math.hypot(dx, dz);
  // The foot hangs down from the ankle at a fixed slant.
  const ax = r - L3 * Math.cos(ankle);
  const ay = dy - L3 * Math.sin(ankle);
  const D = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 0.02, Math.hypot(ax, ay)));
  const base = Math.atan2(ay, ax);
  const a1 = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
  const a2 = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))));
  const femur = base + a1;
  const knee = -(Math.PI - a2);
  hip.rotation.set(0, Math.atan2(-dz, dx), femur);
  u.knee.rotation.z = knee;
  u.ankle.rotation.z = ankle - femur - knee;
}

// --- Flapper: a fuzzy bat with big ears and leathery wings -------------------

const batGeos = new Map();
function batGeometry(def) {
  const key = def.colors.join('|');
  if (batGeos.has(key)) return batGeos.get(key);
  const [main, dark, eye, light] = def.colors;
  const skin = mix(light, '#ff9dc0', 0.35);
  const G = {};
  const b = new Vox();
  b.ellipsoid(0, 0, 0, 0.19, 0.2, 0.17, 0.042, (x, y) => (y < -0.5 ? dark : main));
  b.box(0.2, 0.22, 0.05, 0, -0.03, 0.15, light);
  for (const [x, y, z] of [
    [0.12, 0.13, 0.1],
    [0, 0.17, 0.12],
    [0.16, 0.02, 0.1],
    [0.14, -0.12, 0.06],
  ])
    b.pair(0.05, 0.05, 0.05, x, y, z, light);
  b.pair(0.03, 0.06, 0.03, 0.06, -0.21, 0.02, dark);
  b.pair(0.02, 0.02, 0.05, 0.06, -0.24, 0.05, '#f4f1ea', 0, 0, 0, 0);
  G.body = b.geometry();
  const h = new Vox();
  h.ellipsoid(0, 0, 0, 0.15, 0.12, 0.13, 0.04, (x, y) => (y > 0.5 ? mix(main, light, 0.3) : main));
  h.box(0.13, 0.08, 0.07, 0, -0.035, 0.12, light);
  h.box(0.06, 0.035, 0.03, 0, -0.01, 0.16, dark);
  h.pair(0.08, 0.025, 0.03, 0.065, 0.075, 0.12, dark, 0, 0, -0.35);
  for (const s of [-1, 1]) {
    h.box(0.08, 0.2, 0.04, s * 0.085, 0.17, -0.01, main, 0, 0, -s * 0.3);
    h.box(0.045, 0.13, 0.02, s * 0.085, 0.16, 0.015, skin, 0, 0, -s * 0.3, 0);
    h.box(0.022, 0.05, 0.02, s * 0.03, -0.085, 0.14, '#f4f1ea', 0, 0, 0, 0);
  }
  G.head = h.geometry();
  const e = new Vox();
  e.pair(0.05, 0.045, 0.02, 0.063, 0.03, 0.128, eye, 0, 0, 0, 0);
  e.pair(0.018, 0.018, 0.02, 0.05, 0.042, 0.136, '#ffffff', 0, 0, 0, 0);
  G.eyes = e.geometry();
  const mem = mix(dark, main, 0.25);
  for (const s of [-1, 1]) {
    const wi = new Vox();
    wi.box(0.34, 0.045, 0.045, s * 0.17, 0.02, 0.07, main, 0, s * 0.1, 0);
    wi.box(0.32, 0.018, 0.25, s * 0.16, 0, -0.05, mem);
    wi.box(0.02, 0.022, 0.24, s * 0.22, 0.005, -0.05, dark, 0, s * 0.35, 0);
    G['in' + s] = wi.geometry();
    const wo = new Vox();
    wo.box(0.3, 0.04, 0.04, s * 0.15, 0.02, 0.06, main, 0, s * 0.18, 0);
    wo.box(0.3, 0.018, 0.22, s * 0.14, 0, -0.06, mem);
    for (const [x, z] of [
      [0.06, -0.2],
      [0.18, -0.21],
      [0.28, -0.13],
    ])
      wo.box(0.1, 0.016, 0.07, s * x, 0, z, mem);
    for (const a of [0.15, 0.55]) wo.box(0.02, 0.022, 0.28, s * (0.1 + a * 0.18), 0.005, -0.06, dark, 0, s * a, 0);
    wo.box(0.035, 0.07, 0.035, s * 0.3, 0.04, 0.08, '#f4f1ea');
    wo.box(0.035, 0.05, 0.035, 0, 0.04, 0.09, '#f4f1ea');
    G['out' + s] = wo.geometry();
  }
  batGeos.set(key, G);
  return G;
}

function buildFlyer(def) {
  const G = batGeometry(def);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.3;
  root.add(body);
  const skinMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const materials = [skinMat];
  body.add(new THREE.Mesh(G.body, skinMat));
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0.04);
  head.add(new THREE.Mesh(G.head, skinMat), new THREE.Mesh(G.eyes, eyeMat));
  body.add(head);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.15, 0.07, 0);
    wing.add(new THREE.Mesh(G['in' + side], skinMat));
    const tip = new THREE.Group();
    tip.position.x = side * 0.32;
    tip.add(new THREE.Mesh(G['out' + side], skinMat));
    wing.add(tip);
    wing.userData = { side, tip };
    body.add(wing);
    wings.push(wing);
  }
  if (def.variant === 'armored') helmet(head, 0.1, 5.5);
  else if (def.variant === 'frost') spikes(head, 0.1, 2, 0xc9ecff);
  else if (def.variant === 'shock') rod(head, 0.1, 0xfff6a0);
  return {
    root,
    body,
    head,
    wings,
    parts: {},
    materials,
    dispose() {
      skinMat.dispose();
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
