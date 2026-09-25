import * as THREE from 'three';

// First-person reloads. Your left hand holds the front of the gun, and
// on a reload it grabs the magazine, pulls it out, fetches a new one,
// slaps it in and racks the gun. Shotguns load shells one at a time,
// revolvers swing out the cylinder, crossbows pull the string, and
// energy guns swap the cell on top.
//
// Everything here is in the gun's own space: the barrel points down -z,
// the grip is near z = 0.1 and the magazine hangs below.

const ease = (t) => t * t * (3 - 2 * t);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Which way each kind of gun reloads.
export function reloadStyle(frame, cellTop) {
  if (frame === 'shotgun') return 'shells';
  if (frame === 'revolver') return 'cylinder';
  if (frame === 'crossbow') return 'string';
  if (frame === 'launcher') return 'breech';
  if (cellTop) return 'top';
  if (frame === 'pistol') return 'pistol';
  if (frame === 'minigun' || frame === 'tesla') return 'box';
  return 'mag';
}

// Useful points on a gun, worked out from its shape.
export function gunPoints(gun) {
  const box = new THREE.Box3();
  const body = gun.children[0];
  body.geometry.computeBoundingBox();
  box.copy(body.geometry.boundingBox);
  const cellBox = new THREE.Box3();
  gun.userData.cell.traverse((m) => {
    if (!m.geometry) return;
    m.geometry.computeBoundingBox();
    if (Number.isFinite(m.geometry.boundingBox.min.x)) cellBox.union(m.geometry.boundingBox);
  });
  if (cellBox.isEmpty()) cellBox.set(V(-0.03, -0.14, -0.04), V(0.03, -0.06, 0.02));
  const cellC = cellBox.getCenter(new THREE.Vector3());
  const muzzle = gun.userData.muzzle.position;
  const eye = gun.userData.eye;
  const cellTop = cellC.y > 0;
  // The front hand goes under the barrel, in front of the magazine.
  const zs = Math.max(muzzle.z + 0.1, Math.min(cellBox.min.z - 0.1, -0.02));
  const support = V(-0.01, box.min.y + 0.1 - 0.04, zs);
  return {
    box,
    cellBox,
    cellC,
    cellTop,
    support,
    // Where the hand holds the magazine (under it, or on top for cells).
    grab: cellTop ? V(cellC.x, cellBox.max.y + 0.03, cellC.z) : V(cellC.x - 0.01, cellBox.min.y - 0.03, cellC.z),
    // The charging handle, on the left side near the back.
    rack: V(-0.08, eye.y - 0.04, Math.min(box.max.z - 0.08, eye.z + 0.02)),
    // Where the left shoulder is, far behind and below.
    shoulder: V(-0.9, -0.55, 1.1),
  };
}

// A left arm in your skin, long enough to reach off the bottom of the screen.
export function buildLeftArm(skin, geos, base, outer, setBoxUV) {
  const armW = skin.slim ? 3 : 4;
  const U = 0.034;
  const part = (u, v, inflate, mat) => {
    const geo = new THREE.BoxGeometry((armW + inflate) * U, (12 + inflate) * U, (4 + inflate) * U);
    setBoxUV(geo, u, v, armW, 12, 4);
    geo.translate(0, (12 * U) / 2, 0);
    geos.push(geo);
    return new THREE.Mesh(geo, mat);
  };
  const arm = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(part(32, 48, 0, base), part(48, 48, 0.5, outer));
  inner.scale.set(1, 2.4, 1);
  arm.add(inner);
  return arm;
}

// A shotgun shell for the shell-by-shell reload.
export function buildShell() {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ color: 0xc8302a });
  const brass = new THREE.MeshLambertMaterial({ color: 0xd9a84a });
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.06), red);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.018), brass);
  b.position.z = 0.035;
  g.add(a, b);
  g.userData.dispose = () => {
    red.dispose();
    brass.dispose();
    a.geometry.dispose();
    b.geometry.dispose();
  };
  return g;
}

// Smoothly step through keyframes: [[t, [values...]], ...].
function track(keys, r) {
  if (r <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    if (r <= t1) {
      const k = ease((r - t0) / Math.max(1e-6, t1 - t0));
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return keys[keys.length - 1][1];
}

const add = (p, x, y, z) => [p.x + x, p.y + y, p.z + z];

// Keep the hand from coming right up to the camera.
function clampHand(out) {
  if (out.hand) out.hand = [out.hand[0], out.hand[1], Math.min(out.hand[2], 0.02)];
  return out;
}

// The pose at reload progress r (0..1).
// Returns hand (gun space), rot [x, y, z] and pos [x, y, z] to add to the
// gun, where the magazine is (an offset from its normal place, or null),
// and whether a shell is in the hand.
export function reloadPose(style, r, P) {
  return clampHand(pose(style, r, P));
}

function pose(style, r, P) {
  const S = P.support;
  const G = P.grab;
  const R = P.rack;
  const out = { hand: null, rot: [0, 0, 0], pos: [0, 0, 0], cell: [0, 0, 0], cellVisible: true, shell: null };
  const s = [S.x, S.y, S.z];
  if (style === 'mag' || style === 'box' || style === 'pistol') {
    const down = add(G, -0.05, -0.22, 0.05);
    const off = add(G, -0.35, -0.6, 0.25);
    const rack = style !== 'box';
    const keys = [
      [0, s],
      [0.1, [G.x, G.y, G.z]],
      [0.26, down],
      [0.4, off],
      [0.5, off],
      [0.62, add(G, -0.02, -0.12, 0.02)],
      [0.69, [G.x, G.y, G.z]],
      [0.72, add(G, 0, -0.025, 0)],
    ];
    if (rack) keys.push([0.8, [R.x, R.y, R.z]], [0.86, add(R, 0, 0, 0.1)], [0.9, [R.x, R.y, R.z]], [1, s]);
    else keys.push([0.85, add(G, -0.05, -0.1, 0.05)], [1, s]);
    out.hand = track(keys, r);
    // Tip the gun toward your left hand so you can see the magazine well,
    // then turn it to show the charging handle.
    out.rot = track(
      [
        [0, [0, 0, 0]],
        [0.12, [0.12, 0.3, -0.55]],
        [0.66, [0.12, 0.3, -0.55]],
        [0.7, [0.2, 0.3, -0.5]],
        [0.76, [0.05, 0.35, -0.8]],
        [0.86, [0.1, 0.35, -0.8]],
        [0.88, [0.02, 0.33, -0.75]],
        [1, [0, 0, 0]],
      ],
      r,
    );
    out.pos = track([[0, [0, 0, 0]], [0.12, [-0.07, 0.06, 0.03]], [0.7, [-0.07, 0.06, 0.03]], [0.8, [-0.08, 0.07, 0.02]], [0.88, [-0.08, 0.07, 0.04]], [1, [0, 0, 0]]], r);
    // The magazine rides in the hand from 0.1 to 0.4, then a new one from 0.5 to 0.69.
    if ((r > 0.1 && r < 0.4) || (r >= 0.5 && r < 0.69)) out.cell = [out.hand[0] - G.x, out.hand[1] - G.y, out.hand[2] - G.z];
    out.cellVisible = !(r >= 0.38 && r < 0.5);
    return out;
  }
  if (style === 'top') {
    const up = add(G, -0.1, 0.1, -0.03);
    const off = add(G, -0.45, -0.4, 0.05);
    out.hand = track(
      [
        [0, s],
        [0.12, [G.x, G.y, G.z]],
        [0.28, up],
        [0.42, off],
        [0.5, off],
        [0.62, add(G, 0, 0.14, 0.02)],
        [0.7, [G.x, G.y, G.z]],
        [0.74, add(G, 0, -0.02, 0)],
        [0.85, add(G, -0.04, 0.03, 0.03)],
        [1, s],
      ],
      r,
    );
    out.rot = track([[0, [0, 0, 0]], [0.12, [0.1, 0.25, -0.35]], [0.7, [0.1, 0.25, -0.35]], [0.74, [0.02, 0.25, -0.3]], [1, [0, 0, 0]]], r);
    out.pos = track([[0, [0, 0, 0]], [0.12, [-0.02, -0.02, 0.02]], [0.8, [-0.02, -0.02, 0.02]], [1, [0, 0, 0]]], r);
    if ((r > 0.12 && r < 0.42) || (r >= 0.5 && r < 0.7)) out.cell = [out.hand[0] - G.x, out.hand[1] - G.y, out.hand[2] - G.z];
    out.cellVisible = !(r >= 0.4 && r < 0.5);
    return out;
  }
  if (style === 'shells') {
    // Roll the gun to show the loading port, feed four shells, pump.
    const port = add(P.cellC, -0.01, P.cellBox.min.y - P.cellC.y - 0.02, 0.02);
    const below = add(port, -0.12, -0.28, 0.12);
    const keys = [[0, s], [0.1, below]];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const t0 = 0.1 + (i / n) * 0.64;
      const t1 = t0 + 0.64 / n;
      keys.push([t0 + (t1 - t0) * 0.55, port], [t1, below]);
    }
    keys.push([0.8, s], [0.86, add(S, 0, 0, 0.1)], [0.93, s], [1, s]);
    out.hand = track(keys, r);
    out.rot = track([[0, [0, 0, 0]], [0.1, [-0.05, 0.15, -0.7]], [0.76, [-0.05, 0.15, -0.7]], [0.82, [0, 0, 0]], [0.86, [0.04, 0, 0]], [1, [0, 0, 0]]], r);
    out.pos = track([[0, [0, 0, 0]], [0.1, [-0.09, 0.09, -0.02]], [0.76, [-0.09, 0.09, -0.02]], [0.82, [0, 0, 0]], [0.86, [0, 0, 0.03]], [1, [0, 0, 0]]], r);
    // A shell in the hand on the way up to the port.
    if (r > 0.1 && r < 0.74) {
      const seg = ((r - 0.1) / 0.64) * n;
      const f = seg - Math.floor(seg);
      if (f < 0.55) out.shell = [out.hand[0] + 0.01, out.hand[1] + 0.04, out.hand[2] - 0.02];
    }
    return out;
  }
  if (style === 'cylinder') {
    // Flick the cylinder out, push the empties, speedloader in, flick back.
    const C = P.cellC;
    const side = add(C, -0.08, -0.04, 0.02);
    const off = add(C, -0.35, -0.5, 0.2);
    out.hand = track(
      [
        [0, s],
        [0.12, side],
        [0.25, add(C, -0.06, 0.08, 0.02)],
        [0.36, off],
        [0.48, off],
        [0.64, add(C, -0.12, 0, 0.04)],
        [0.74, side],
        [0.84, add(side, 0.04, 0.06, 0)],
        [1, s],
      ],
      r,
    );
    out.rot = track([[0, [0, 0, 0]], [0.12, [0.45, 0.2, 0.6]], [0.3, [0.55, 0.2, 0.6]], [0.74, [0.2, 0.2, 0.6]], [0.84, [0, 0.1, 0.15]], [1, [0, 0, 0]]], r);
    out.pos = track([[0, [0, 0, 0]], [0.12, [-0.03, 0.02, 0.03]], [0.8, [-0.03, 0.02, 0.03]], [1, [0, 0, 0]]], r);
    // The cylinder swings out to the left while it's open.
    const open = track([[0, [0]], [0.12, [0]], [0.18, [1]], [0.76, [1]], [0.82, [0]], [1, [0]]], r)[0];
    out.cell = [-0.07 * open, -0.02 * open, 0];
    return out;
  }
  if (style === 'string') {
    // Crossbow: pull the string back and set a new bolt.
    const front = add(P.cellC, 0, 0.04, -0.1);
    const back = add(P.cellC, 0, 0.04, 0.16);
    const off = add(front, -0.4, -0.4, 0.3);
    out.hand = track([[0, s], [0.14, front], [0.4, back], [0.48, back], [0.6, off], [0.66, off], [0.8, add(P.cellC, 0, 0.05, 0)], [0.88, add(P.cellC, -0.03, 0.02, 0.05)], [1, s]], r);
    out.rot = track([[0, [0, 0, 0]], [0.12, [-0.35, 0.3, -0.2]], [0.84, [-0.3, 0.3, -0.2]], [1, [0, 0, 0]]], r);
    out.pos = track([[0, [0, 0, 0]], [0.12, [-0.03, 0.05, 0]], [0.84, [-0.03, 0.05, 0]], [1, [0, 0, 0]]], r);
    if (r >= 0.66 && r < 0.8) out.cell = [out.hand[0] - P.cellC.x, out.hand[1] - P.cellC.y - 0.05, out.hand[2] - P.cellC.z];
    out.cellVisible = r >= 0.66;
    return out;
  }
  // Launcher: tip the barrel down, slide a round into the breech, snap shut.
  const off = add(G, -0.35, -0.5, 0.25);
  out.hand = track([[0, s], [0.12, [G.x, G.y, G.z]], [0.3, off], [0.46, off], [0.62, add(G, 0, -0.1, 0.04)], [0.72, [G.x, G.y, G.z]], [0.8, add(G, 0, -0.03, 0)], [1, s]], r);
  out.rot = track([[0, [0, 0, 0]], [0.14, [0.5, 0.15, 0.3]], [0.72, [0.5, 0.15, 0.3]], [0.8, [-0.05, 0.1, 0.2]], [0.86, [0.03, 0.05, 0.1]], [1, [0, 0, 0]]], r);
  out.pos = track([[0, [0, 0, 0]], [0.14, [-0.02, 0.03, 0.02]], [0.8, [-0.02, 0.03, 0.02]], [1, [0, 0, 0]]], r);
  if ((r > 0.12 && r < 0.3) || (r >= 0.46 && r < 0.72)) out.cell = [out.hand[0] - G.x, out.hand[1] - G.y, out.hand[2] - G.z];
  out.cellVisible = !(r >= 0.28 && r < 0.46);
  return out;
}

// Inspecting your gun (press I): lift it, turn it to show the side, flip
// it over, then back. Returns rot and pos to add, like a reload pose.
export function inspectPose(t) {
  const T = 2.4;
  const r = Math.min(1, t / T);
  return {
    rot: track(
      [
        [0, [0, 0, 0]],
        [0.15, [0.25, 0.9, 0.25]],
        [0.45, [0.2, 1.1, 0.35]],
        [0.6, [0.05, 0.6, -1.4]],
        [0.8, [0.05, 0.5, -1.6]],
        [1, [0, 0, 0]],
      ],
      r,
    ),
    pos: track([[0, [0, 0, 0]], [0.15, [-0.12, 0.08, 0.02]], [0.8, [-0.1, 0.08, 0.02]], [1, [0, 0, 0]]], r),
    hand: r > 0.1 && r < 0.9,
    done: t >= T,
  };
}
