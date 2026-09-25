import * as THREE from 'three';
import { PX } from './model.js';
import { mulberry32 } from './rng.js';

// The bosses' bodybuilder model: big chest, six-pack, boulder shoulders,
// huge arms and a tiny angry head. Every box gets its own pixel-art faces,
// painted with shading so the muscles read as round.

// Box faces in BoxGeometry order: +x, -x, +y, -y, +z (front), -z (back).
const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

function hex(c) {
  return new THREE.Color(c);
}

// Packs every face of every box into one texture.
class Atlas {
  constructor(size = 512) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');
    this.glow = document.createElement('canvas');
    this.glow.width = this.glow.height = size;
    this.gctx = this.glow.getContext('2d');
    this.gctx.fillStyle = '#000';
    this.gctx.fillRect(0, 0, size, size);
    this.x = 0;
    this.y = 0;
    this.row = 0;
    this.anyGlow = false;
  }

  alloc(w, h) {
    if (this.x + w > this.size) {
      this.x = 0;
      this.y += this.row + 1;
      this.row = 0;
    }
    const r = [this.x, this.y, w, h];
    this.x += w + 1;
    this.row = Math.max(this.row, h);
    return r;
  }
}

// Paints a face pixel by pixel. fn(i, j, w, h) returns a colour, or
// [colour, glow] for pixels that shine in the dark.
function paintFace(atlas, rect, fn) {
  const [x0, y0, w, h] = rect;
  const ctx = atlas.ctx;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let c = fn(i, j, w, h);
      if (!c) continue;
      let glow = null;
      if (Array.isArray(c)) [c, glow] = c;
      ctx.fillStyle = c;
      ctx.fillRect(x0 + i, y0 + j, 1, 1);
      if (glow) {
        atlas.gctx.fillStyle = glow;
        atlas.gctx.fillRect(x0 + i, y0 + j, 1, 1);
        atlas.anyGlow = true;
      }
    }
  }
}

function setFaceUV(geo, f, rect, size) {
  const [x, y, w, h] = rect;
  const u0 = x / size;
  const u1 = (x + w) / size;
  const v1 = 1 - y / size;
  const v0 = 1 - (y + h) / size;
  const uv = geo.attributes.uv;
  uv.setXY(f * 4, u0, v1);
  uv.setXY(f * 4 + 1, u1, v1);
  uv.setXY(f * 4 + 2, u0, v0);
  uv.setXY(f * 4 + 3, u1, v0);
}

// Colour helpers for shading.
function mix(a, b, t) {
  return a.clone().lerp(b, t);
}
function styleOf(c) {
  return '#' + c.getHexString();
}

// A shaded muscle surface: lit from above, darker toward the edges.
function muscle(look, rng, i, j, w, h, extra = 0) {
  const nx = w > 1 ? (i / (w - 1)) * 2 - 1 : 0;
  const ny = h > 1 ? (j / (h - 1)) * 2 - 1 : 0;
  const edge = Math.max(Math.abs(nx), Math.abs(ny));
  let t = 0.5 - ny * 0.18 - edge * edge * 0.28 + extra + (rng() - 0.5) * 0.08;
  t = Math.max(0, Math.min(1, t));
  const c = t < 0.5 ? mix(look.skinDark, look.skin, t * 2) : mix(look.skin, look.skinLight, (t - 0.5) * 2);
  return c;
}

// Body types. Sizes are in skin pixels.
//   buff:   the classic bodybuilder
//   fat:    a huge round belly, soft chest and a double chin
//   tall:   long legs and arms, narrow and lanky
//   hunch:  a gorilla: short legs, bent forward, arms to the ground
//   stocky: short and wide, like a dwarf
// headLo/headHi and bodyW size the hitbox (in model units at scale 1).
export const BODIES = {
  buff: { hipY: 22, legGap: 4, thigh: [9, 11, 9], shin: [7, 9, 7], torsoLen: 1, chestW: 24, shoulderX: 15, armLen: 1, armThick: 1, fist: 1, headScale: 1, lean: 0, headLo: 2.62, headHi: 3.12, bodyW: 1.05 },
  fat: { hipY: 20, legGap: 5, thigh: [10, 10, 10], shin: [8, 8, 8], torsoLen: 1, chestW: 25, shoulderX: 15.5, armLen: 0.95, armThick: 1.05, fist: 1, headScale: 1.05, lean: -0.06, belly: true, headLo: 2.51, headHi: 3.02, bodyW: 1.3 },
  tall: { hipY: 29, legGap: 3.5, thigh: [7, 15, 7], shin: [6, 12, 6], torsoLen: 1.15, chestW: 20, shoulderX: 12.5, armLen: 1.3, armThick: 0.8, fist: 0.9, headScale: 0.95, lean: 0.06, headLo: 3.14, headHi: 3.6, bodyW: 0.85, headFwd: 0 },
  hunch: { hipY: 17, legGap: 4.5, thigh: [9, 8, 9], shin: [8, 7, 8], torsoLen: 1, chestW: 26, shoulderX: 16, armLen: 1.4, armThick: 1.15, fist: 1.2, headScale: 1, lean: 0.55, hunch: true, headFwd: 2, headLo: 2.12, headHi: 2.58, bodyW: 1.2, headAhead: 0.62 },
  stocky: { hipY: 15, legGap: 4.5, thigh: [10, 7, 10], shin: [9, 6, 9], torsoLen: 1, chestW: 28, shoulderX: 17, armLen: 0.95, armThick: 1.15, fist: 1.15, headScale: 1.1, lean: 0.04, headLo: 2.24, headHi: 2.8, bodyW: 1.2 },
};

export function buildBrute(look) {
  const rng = mulberry32(look.seed || 7);
  const atlas = new Atlas(512);
  const geos = [];
  const pending = [];
  // w, h, d in skin pixels. paint(face, i, j, w, h) -> colour.
  const part = (w, h, d, paint) => {
    const geo = new THREE.BoxGeometry(w * PX, h * PX, d * PX);
    geos.push(geo);
    const dims = { px: [d, h], nx: [d, h], py: [w, d], ny: [w, d], pz: [w, h], nz: [w, h] };
    FACES.forEach((face, f) => {
      const [fw, fh] = dims[face];
      const rect = atlas.alloc(Math.max(1, Math.round(fw)), Math.max(1, Math.round(fh)));
      pending.push(() => paintFace(atlas, rect, (i, j, W, H) => paint(face, i, j, W, H)));
      setFaceUV(geo, f, rect, atlas.size);
    });
    return geo;
  };

  const skinPaint = (extraFn) => (face, i, j, w, h) => {
    const base = muscle(look, rng, i, j, w, h);
    const e = extraFn ? extraFn(face, i, j, w, h, base) : null;
    return e || styleOf(base);
  };
  const dark = (c, k = 0.3) => styleOf(mix(c, hex('#000000'), k));
  const light = (c, k = 0.25) => styleOf(mix(c, hex('#ffffff'), k));
  const flat = (c, noise = 0.06) => () => styleOf(mix(hex(c), hex(rng() < 0.5 ? '#000000' : '#ffffff'), rng() * noise));
  const tattoo = look.tattoo;

  const mats = [];
  const mesh = (geo, parent, x, y, z) => {
    const m = new THREE.Mesh(geo, null);
    m.position.set(x * PX, y * PX, z * PX);
    parent.add(m);
    mats.push(m);
    return m;
  };
  const group = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x * PX, y * PX, z * PX);
    g.rotation.order = 'YXZ';
    parent.add(g);
    return g;
  };

  const B = BODIES[look.body] || BODIES.buff;
  const TL = B.torsoLen;
  const AL = B.armLen;
  const AT = B.armThick;
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const hips = group(root, 0, B.hipY, 0);

  // --- Legs: thigh, shin and a heavy boot ---
  const legs = {};
  const [tw, th, td] = B.thigh;
  const [sw, sh, sd] = B.shin;
  for (const side of [-1, 1]) {
    const leg = group(hips, side * B.legGap, 0, 0);
    const thigh = part(tw, th, td, (face, i, j, w, h) => {
      if (j < 4) return styleOf(mix(look.pants, hex('#000000'), (i % 3 === 0 ? 0.15 : 0) + rng() * 0.08));
      return styleOf(muscle(look, rng, i, j, w, h));
    });
    mesh(thigh, leg, 0, -th / 2, 0);
    const knee = group(leg, 0, -th, 0);
    mesh(part(sw, sh, sd, skinPaint()), knee, 0, -sh / 2, 0);
    mesh(part(sw + 1, 3, sd + 3, flat(look.boots)), knee, 0, -sh - 0.5, 1);
    legs[side] = { leg, knee };
  }

  // --- Waist and belt ---
  const beltW = B.belly ? 18 : 12;
  const belt = part(beltW, 5, B.belly ? 14 : 9, (face, i, j, w, h) => {
    if (look.champ && face === 'pz' && i >= 4 && i < w - 4) {
      // A championship belt with a big gold plate.
      if (j === 0 || j === h - 1) return '#8a6a1f';
      return (i + j) % 3 ? '#f2c230' : '#fff2a8';
    }
    if (j === 0 || j === h - 1) return dark(look.belt, 0.35);
    if (face === 'pz' && i >= w / 2 - 2 && i < w / 2 + 2 && j > 0 && j < h - 1) return '#c9a23a';
    return styleOf(mix(look.belt, hex('#000000'), rng() * 0.1));
  });
  mesh(belt, hips, 0, 2.5, B.belly ? 1 : 0);

  // --- Torso (leans for attacks) ---
  const torso = group(hips, 0, 5, 0);
  let belly = null;
  if (B.belly) {
    // A big round gut, hanging over the belt.
    const gut = part(22, 15, 16, (face, i, j, w, h) => {
      const nx = (i / (w - 1)) * 2 - 1;
      const ny = (j / (h - 1)) * 2 - 1;
      const base = muscle(look, rng, i, j, w, h, 0.06 - (nx * nx + ny * ny) * 0.12);
      if (face === 'pz') {
        // Belly button, and a shadow where it hangs over the belt.
        if (Math.abs(i + 0.5 - w / 2) < 1 && j === Math.round(h * 0.6)) return dark(base, 0.55);
        if (j >= h - 2) return dark(base, 0.25 + (j - (h - 2)) * 0.1);
        if (j === 1 && Math.abs(nx) < 0.6) return light(base, 0.18);
      }
      if (tattoo && face === 'pz' && tattoo(i, j, w, h, 'abs')) return [look.tattooColor, look.tattooColor];
      return styleOf(base);
    });
    belly = group(torso, 0, 4.5, 4.5);
    mesh(gut, belly, 0, 0, 0);
    // Extra layers on the front make it round, and it hangs over the belt.
    const round = (w, h, d) =>
      part(w, h, d, (face, i, j, W, H) => {
        const nx = (i / Math.max(1, W - 1)) * 2 - 1;
        const base = muscle(look, rng, i, j, W, H, 0.1 - nx * nx * 0.1);
        if (face === 'pz' && Math.abs(i + 0.5 - W / 2) < 1 && j === Math.round(H * 0.55)) return dark(base, 0.55);
        return styleOf(base);
      });
    mesh(round(16, 11, 3), belly, 0, 0.5, 9.5);
    mesh(round(10, 7, 2), belly, 0, 0, 12);
    mesh(round(18, 4, 5), belly, 0, -7, 5);
    // Love handles.
    for (const side of [-1, 1]) mesh(part(3, 8, 10, skinPaint()), torso, side * 10.5, 4, 1);
  } else {
    const abs = part(12, 8 * TL, 8, (face, i, j, w, h) => {
      const base = muscle(look, rng, i, j, w, h);
      if (face === 'pz') {
        // Six-pack: two columns, three rows, with deep lines between.
        const mid = Math.floor(w / 2);
        if (i === mid || i === mid - 1) return dark(base, 0.35);
        if (j === Math.round(h * 0.25) || j === Math.round(h * 0.62)) return dark(base, 0.3);
        if (i === 1 || i === w - 2) return dark(base, 0.15);
      }
      if (tattoo && face === 'pz' && tattoo(i, j, w, h, 'abs')) return [look.tattooColor, look.tattooColor];
      return styleOf(base);
    });
    mesh(abs, torso, 0, 4 * TL, 0.2);
  }
  const chestW = B.chestW;
  const chestH = Math.round(11 * TL);
  const chest = part(chestW, chestH, B.belly ? 13 : 11, (face, i, j, w, h) => {
    const base = muscle(look, rng, i, j, w, h, face === 'pz' ? 0.05 : 0);
    if (face === 'pz' && !B.belly) {
      const mid = w / 2;
      if (Math.abs(i + 0.5 - mid) < 1) return dark(base, 0.4);
      // Lower edge of each pec.
      if (j === h - 3 && Math.abs(i + 0.5 - mid) < 8) return dark(base, 0.35);
      if (j === 1 && Math.abs(i + 0.5 - mid) > 2 && Math.abs(i + 0.5 - mid) < 8) return light(base, 0.25);
    }
    if (face === 'nz') {
      // Back: a spine groove and lats.
      if (Math.abs(i + 0.5 - w / 2) < 1) return dark(base, 0.3);
      if (j > 3 && (i === 3 || i === w - 4)) return dark(base, 0.2);
    }
    if (look.ribs && face === 'pz' && j % 3 === 1 && Math.abs(i + 0.5 - w / 2) > 1.5) return dark(base, 0.5);
    if (tattoo && (face === 'pz' || face === 'nz') && tattoo(i, j, w, h, 'chest')) return [look.tattooColor, look.tattooColor];
    return styleOf(base);
  });
  mesh(chest, torso, 0, 13.5 * TL, 0);
  if (B.belly) {
    // Soft, droopy chest instead of pecs.
    for (const side of [-1, 1]) {
      const moob = part(9, 5, 3, (face, i, j, w, h) => {
        const base = muscle(look, rng, i, j, w, h, 0.04);
        if (face === 'pz' && j >= h - 1) return dark(base, 0.3);
        return styleOf(base);
      });
      mesh(moob, torso, side * 5, 11.5, 6.5);
    }
  } else {
    // Pecs stick out past the chest.
    for (const side of [-1, 1]) {
      const pec = part(Math.round(chestW * 0.42), 6, 2, (face, i, j, w, h) => {
        const base = muscle(look, rng, i, j, w, h, 0.08);
        if (face === 'pz' && j === h - 1) return dark(base, 0.3);
        if (face === 'pz' && j === 0 && i > 1 && i < w - 2) return light(base, 0.25);
        return styleOf(base);
      });
      mesh(pec, torso, side * chestW * 0.216, 15 * TL, 6);
    }
    // Lats flare out under the arms for the V shape.
    for (const side of [-1, 1]) mesh(part(3, 8, 8, skinPaint()), torso, side * (chestW / 2 - 4.5), 9.5 * TL, -0.5);
  }
  const traps = part(Math.round(chestW * 0.58), B.hunch ? 6 : 4, 7, skinPaint());
  mesh(traps, torso, 0, 20 * TL - (B.hunch ? 0.5 : 0), -1.5);
  const neck = group(torso, 0, 19 * TL, B.headFwd || 0);
  mesh(part(6, 3, 6, skinPaint()), neck, 0, 1.5, 0);

  // --- Head ---
  const hs = Math.round(9 * B.headScale);
  const head = group(neck, 0, 3, 0.5);
  const cyclops = look.eye === 'cyclops';
  const headGeo = part(hs, hs, hs, (face, i, j, w, h) => {
    const base = muscle(look, rng, i, j, w, h, 0.05);
    if (face === 'py' && look.hair) return styleOf(mix(look.hair, hex('#000000'), rng() * 0.2));
    if (face === 'pz') {
      const cx = w / 2;
      if (look.mask) {
        if (j >= 4 && j <= 7 && i >= 1 && i <= w - 2) {
          if (j >= 5 && j <= 6 && (i === 3 || i === w - 4)) return '#141414';
          return (i + j) % 2 ? '#4a5a3a' : '#3a4a2c';
        }
      }
      if (cyclops) {
        // One huge eye in the middle of the face.
        if (j === 1 && i >= 1 && i <= w - 2) return dark(base, 0.45);
        if (j >= 2 && j <= 4 && Math.abs(i + 0.5 - cx) < 2.5) {
          if (j === 3 && Math.abs(i + 0.5 - cx) < 1) return ['#141414', '#000000'];
          return [look.eyes, look.eyes];
        }
      } else {
        // Heavy brow, glowing eyes.
        if (j === 2 && i >= 1 && i <= w - 2) return dark(base, 0.45);
        if (j === 3 && (i === 2 || i === w - 3)) return [look.eyes, look.eyes];
        if (j === 3 && (i === 1 || i === 3 || i === w - 4 || i === w - 2)) return dark(base, 0.35);
      }
      // Clenched teeth.
      if (j === h - 3 && i >= 2 && i <= w - 3) return i % 2 ? '#f4f1ea' : '#d8d2c0';
      if (j === h - 2 && i >= 2 && i <= w - 3) return dark(base, 0.4);
      if (j === h - 4 && Math.abs(i + 0.5 - cx) < 1) return dark(base, 0.2);
    }
    return styleOf(base);
  });
  mesh(headGeo, head, 0, hs / 2, 0);

  // --- Arms: boulder shoulders, big upper arms, thick forearms, fists ---
  const arms = {};
  const uh = Math.round(12 * AL);
  const fh = Math.round(11 * AL);
  const ut = Math.max(6, Math.round(8 * AT));
  const ft = Math.max(6, Math.round(9 * AT));
  for (const side of [-1, 1]) {
    const shoulder = group(torso, side * B.shoulderX, 16 * TL, 0);
    const delt = part(Math.round(10 * AT), 9, Math.round(10 * AT), (face, i, j, w, h) => {
      if (look.pauldron && side === -1) {
        const t = rng();
        return t < 0.25 ? '#4f7d2f' : styleOf(mix(hex('#7a7a7a'), hex('#4a4a4a'), rng() * 0.6));
      }
      const base = muscle(look, rng, i, j, w, h, 0.1);
      if (tattoo && tattoo(i, j, w, h, 'delt')) return [look.tattooColor, look.tattooColor];
      return styleOf(base);
    });
    mesh(delt, shoulder, side * 0.5, 0, 0);
    const upper = group(shoulder, side * 1, -3, 0);
    mesh(part(ut, uh, ut, skinPaint()), upper, 0, -uh / 2, 0);
    if (!B.belly && B.armThick >= 0.9) {
      // The bicep peak on the front of the upper arm.
      const bicep = part(6, 7, 4, (face, i, j, w, h) => {
        const base = muscle(look, rng, i, j, w, h, 0.12);
        if (face === 'pz' && j === 1 && i > 0 && i < w - 1) return light(base, 0.3);
        if (face === 'pz' && i === 2 && j > 2) return dark(base, 0.25);
        return styleOf(base);
      });
      mesh(bicep, upper, 0, -uh / 2 - 0.5, ut / 2 + 1.5);
    }
    const elbow = group(upper, 0, -uh, 0);
    mesh(
      part(ft, fh, ft, (face, i, j, w, h) => {
        const base = muscle(look, rng, i, j, w, h);
        if (j >= h - 2) return styleOf(mix(look.wrist, hex('#000000'), rng() * 0.1));
        if (tattoo && tattoo(i, j, w, h, 'arm')) return [look.tattooColor, look.tattooColor];
        return styleOf(base);
      }),
      elbow,
      0,
      -fh / 2,
      0,
    );
    const fs = Math.round(10 * B.fist);
    const fist = part(fs, Math.round(8 * B.fist), fs, (face, i, j, w, h) => {
      const base = muscle(look, rng, i, j, w, h, -0.05);
      if (face === 'pz' && j === 1 && i % 2 === 1) return dark(base, 0.3);
      return styleOf(base);
    });
    mesh(fist, elbow, 0, -fh - 3 * B.fist, 0.5);
    arms[side] = { shoulder, upper, elbow };
  }

  // Extra pieces: crowns, horns, spikes, tanks.
  const extras = [];
  const addExtra = (parent, w, h, d, x, y, z, color, glow) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w * PX, h * PX, d * PX),
      glow ? new THREE.MeshBasicMaterial({ color, transparent: !!look.alpha, opacity: look.alpha || 1 }) : new THREE.MeshLambertMaterial({ color, transparent: !!look.alpha, opacity: look.alpha || 1 }),
    );
    m.position.set(x * PX, y * PX, z * PX);
    parent.add(m);
    extras.push(m);
    return m;
  };
  const P = { root, hips, torso, neck, head, legR: legs[-1].leg, legL: legs[1].leg, kneeR: legs[-1].knee, kneeL: legs[1].knee };
  P.shoulderR = arms[-1].shoulder;
  P.shoulderL = arms[1].shoulder;
  P.upperR = arms[-1].upper;
  P.upperL = arms[1].upper;
  P.elbowR = arms[-1].elbow;
  P.elbowL = arms[1].elbow;
  P.belly = belly;
  const skinHex = look.skin.getHex();
  const hh = hs;
  if (B.belly) {
    // A double chin.
    addExtra(P.head, hh - 2, 2, 3, 0, -0.6, hh / 2 - 1.5, skinHex);
  }
  if (look.beard) {
    addExtra(P.head, hh, 3, 2, 0, 1.2, hh / 2 + 0.6, look.beard);
    addExtra(P.head, hh - 3, 3, 2, 0, -1.3, hh / 2 + 0.2, look.beard);
    addExtra(P.head, hh - 6, 2, 2, 0, -3.2, hh / 2, look.beard);
  }
  if (look.tusks) {
    for (const x of [-hh / 2 + 2, hh / 2 - 2]) addExtra(P.head, 1.2, 3, 1.2, x, 2.2, hh / 2 + 0.7, 0xf4f1ea);
  }
  if (look.decorate) look.decorate(P, addExtra, hh);

  for (const fn of pending) fn();
  const tex = new THREE.CanvasTexture(atlas.canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const matOpts = { map: tex };
  let glowTex = null;
  if (atlas.anyGlow) {
    glowTex = new THREE.CanvasTexture(atlas.glow);
    glowTex.magFilter = THREE.NearestFilter;
    glowTex.minFilter = THREE.NearestFilter;
    glowTex.colorSpace = THREE.SRGBColorSpace;
    matOpts.emissiveMap = glowTex;
    matOpts.emissive = new THREE.Color(1, 1, 1);
  }
  if (look.alpha) {
    matOpts.transparent = true;
    matOpts.opacity = look.alpha;
  }
  const material = new THREE.MeshLambertMaterial(matOpts);
  // A second material for hit flashes, so the glow map stays as it is.
  for (const m of mats) m.material = material;
  const materials = [material, ...extras.map((e) => e.material)];

  return {
    root,
    parts: P,
    material,
    materials,
    body: B,
    hasGlow: !!glowTex,
    dispose() {
      for (const g of geos) g.dispose();
      tex.dispose();
      if (glowTex) glowTex.dispose();
      material.dispose();
      for (const e of extras) {
        e.geometry.dispose();
        e.material.dispose();
      }
    },
  };
}

// --- Animation -----------------------------------------------------------------

const damp = (v, target, k, dt) => v + (target - v) * (1 - Math.exp(-k * dt));

// s: { speed, act (string or null), actT (0..1), spawn (0..1), dead, deadT,
//      hurt, lookYaw, lookPitch, enraged }
export function poseBrute(model, st, s, dt) {
  const P = model.parts;
  st.t = (st.t || 0) + dt;
  st.phase = (st.phase || 0) + s.speed * dt * 1.6;
  const ph = st.phase;
  const amp = Math.min(1, s.speed / 2.5);
  const v = (st.v = st.v || {});
  const go = (k, target, rate = 12) => (v[k] = damp(v[k] === undefined ? target : v[k], target, rate, dt));
  const breathe = Math.sin(st.t * 2.2) * 0.5 + 0.5;

  // Walking: heavy stomp with swinging arms held out wide.
  let legR = Math.sin(ph) * 0.6 * amp;
  let legL = -legR;
  let kneeR = Math.max(0, -Math.sin(ph)) * 0.8 * amp;
  let kneeL = Math.max(0, Math.sin(ph)) * 0.8 * amp;
  const body = model.body || BODIES.buff;
  const hip0 = body.hipY;
  let hipsY = hip0 - Math.abs(Math.cos(ph)) * 0.8 * amp;
  let torsoX = 0.12 * amp;
  let torsoY = Math.sin(ph) * 0.08 * amp;
  let armRx = -Math.sin(ph) * 0.45 * amp;
  let armLx = Math.sin(ph) * 0.45 * amp;
  let armRz = -0.32;
  let armLz = 0.32;
  let elbowR = -0.35;
  let elbowL = -0.35;
  let elbowRz = 0;
  let elbowLz = 0;
  let headX = 0;

  const a = s.actT;
  const act = s.act;
  const e = (x) => x * x * (3 - 2 * x);
  if (s.spawn < 1 || act === 'roar' || act === 'flex') {
    // Double biceps: arms up, fists by the ears, elbows bent.
    const k = s.spawn < 1 ? e(Math.min(1, s.spawn * 1.6)) : e(Math.min(1, (a || 0) * 4));
    armRx = -0.2 * k;
    armLx = -0.2 * k;
    armRz = -0.32 - 1.2 * k;
    armLz = 0.32 + 1.2 * k;
    elbowR = -0.35 + 0.15 * k;
    elbowL = -0.35 + 0.15 * k;
    elbowRz = -1.75 * k;
    elbowLz = 1.75 * k;
    torsoX = -0.1 * k;
    headX = -0.25 * k;
  } else if (act === 'slam' || act === 'leapLand') {
    // Both fists overhead, then smash down.
    if (a < 0.55) {
      const k = e(a / 0.55);
      armRx = armLx = -2.7 * k;
      armRz = -0.2;
      armLz = 0.2;
      elbowR = elbowL = -0.5 * k;
      torsoX = -0.25 * k;
    } else {
      const k = e(Math.min(1, (a - 0.55) / 0.15));
      armRx = armLx = -2.7 + 2.2 * k;
      elbowR = elbowL = -0.2;
      torsoX = -0.25 + 0.75 * k;
      hipsY -= 3 * k;
      kneeR = kneeL = 0.9 * k;
      legR = legL = -0.5 * k;
    }
  } else if (act === 'punch' || act === 'uppercut') {
    const up = act === 'uppercut';
    if (a < 0.45) {
      const k = e(a / 0.45);
      armRx = up ? 0.6 * k : -0.6 * k;
      elbowR = -1.8 * k;
      torsoY = 0.6 * k;
      torsoX = up ? 0.2 * k : 0.1;
    } else {
      const k = e(Math.min(1, (a - 0.45) / 0.15));
      armRx = up ? 0.6 - 3.4 * k : -0.6 - 1.0 * k;
      elbowR = -1.8 + 1.6 * k;
      torsoY = 0.6 - 1.1 * k;
      torsoX = up ? 0.2 - 0.4 * k : 0.25;
    }
  } else if (act === 'throw' || act === 'bombs' || act === 'volley') {
    if (a < 0.6) {
      const k = e(a / 0.6);
      armRx = -2.9 * k;
      armLx = act === 'throw' ? -2.9 * k : -0.5;
      elbowR = -0.6 * k;
      elbowL = act === 'throw' ? -0.6 * k : -0.4;
      torsoX = -0.3 * k;
    } else {
      const k = e(Math.min(1, (a - 0.6) / 0.15));
      armRx = -2.9 + 1.9 * k;
      armLx = act === 'throw' ? -2.9 + 1.9 * k : -0.5;
      torsoX = -0.3 + 0.6 * k;
    }
  } else if (act === 'breath') {
    torsoX = 0.2;
    headX = -0.2 + Math.sin(st.t * 30) * 0.03;
    armRx = armLx = 0.3;
    armRz = -0.7;
    armLz = 0.7;
  } else if (act === 'charge') {
    if (a < 0.3) {
      const k = e(a / 0.3);
      torsoX = 0.5 * k;
      legR = 0.8 * Math.sin(st.t * 18) * k;
    } else {
      torsoX = 0.55;
      legR = Math.sin(st.t * 22) * 1.1;
      legL = -legR;
      armRx = -Math.sin(st.t * 22) * 0.9;
      armLx = -armRx;
    }
  } else if (act === 'strikes' || act === 'summon') {
    const k = e(Math.min(1, a * 3));
    armRx = armLx = -3 * k;
    armRz = -0.5 * k;
    armLz = 0.5 * k;
    elbowR = elbowL = -0.1;
    torsoX = -0.2 * k;
    headX = -0.4 * k;
  } else if (act === 'leap') {
    const k = e(Math.min(1, a * 2));
    armRx = armLx = -2.4 * k;
    kneeR = kneeL = a < 0.25 ? 1 : 0.2;
    legR = legL = a < 0.25 ? -0.8 : 0.3;
  }
  if (s.enraged) {
    torsoX += Math.sin(st.t * 17) * 0.015;
  }

  go('legR', legR, 16);
  go('legL', legL, 16);
  go('kneeR', kneeR, 16);
  go('kneeL', kneeL, 16);
  go('hipsY', hipsY, 16);
  go('torsoX', torsoX + body.lean - s.hurt * 0.15, 14);
  go('torsoY', torsoY, 14);
  go('armRx', armRx, 16);
  go('armLx', armLx, 16);
  go('armRz', armRz, 14);
  go('armLz', armLz, 14);
  go('elbowR', elbowR, 16);
  go('elbowL', elbowL, 16);
  go('elbowRz', elbowRz, 16);
  go('elbowLz', elbowLz, 16);
  go('headX', headX - Math.max(-0.4, Math.min(0.4, s.lookPitch || 0)), 10);
  go('headY', Math.max(-0.8, Math.min(0.8, s.lookYaw || 0)), 8);

  P.legR.rotation.x = v.legR;
  P.legL.rotation.x = v.legL;
  P.kneeR.rotation.x = v.kneeR;
  P.kneeL.rotation.x = v.kneeL;
  P.hips.position.y = v.hipsY * PX;
  P.torso.rotation.set(v.torsoX, v.torsoY, 0);
  P.torso.scale.set(1 + breathe * 0.02, 1, 1 + breathe * 0.03);
  // A hunched body leans forward; its arms still hang to the ground.
  const hang = body.lean * 0.85;
  P.shoulderR.rotation.set(v.armRx + hang, 0, v.armRz);
  P.shoulderL.rotation.set(v.armLx + hang, 0, v.armLz);
  P.elbowR.rotation.set(v.elbowR, 0, v.elbowRz);
  P.elbowL.rotation.set(v.elbowL, 0, v.elbowLz);
  P.head.rotation.set(v.headX - body.lean * 0.8, v.headY, 0);
  // A big belly wobbles as it walks and breathes.
  if (P.belly) {
    const jiggle = Math.sin(ph * 2) * 0.05 * amp + breathe * 0.03;
    P.belly.scale.set(1 + jiggle * 0.6, 1 - jiggle * 0.5, 1 + jiggle);
    P.belly.position.y = (5 + Math.abs(Math.sin(ph)) * 0.4 * amp) * PX;
  }

  // Dying: drops to its knees, then falls forward.
  if (s.dead) {
    const d = s.deadT;
    const k1 = e(Math.min(1, d / 0.6));
    const k2 = e(Math.max(0, Math.min(1, (d - 0.9) / 0.5)));
    P.kneeR.rotation.x = P.kneeL.rotation.x = 1.6 * k1;
    P.legR.rotation.x = P.legL.rotation.x = -1.4 * k1;
    P.hips.position.y = (hip0 - hip0 * 0.45 * k1) * PX;
    P.torso.rotation.x = 0.4 * k1 + 1.0 * k2;
    P.shoulderR.rotation.set(-0.3, 0, -0.5 - k1);
    P.shoulderL.rotation.set(-0.3, 0, 0.5 + k1);
    model.root.rotation.x = 0.6 * k2;
  } else {
    model.root.rotation.x = 0;
  }
}
