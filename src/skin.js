import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { loadImage, store } from './util.js';

// Skins use the standard 64x64 layout that Minecraft uses, so a skin made
// here works there, and any Minecraft skin PNG works here.

export const LAYOUT = {
  head: { base: [0, 0], outer: [32, 0] },
  body: { base: [16, 16], outer: [16, 32] },
  armR: { base: [40, 16], outer: [40, 32] },
  armL: { base: [32, 48], outer: [48, 48] },
  legR: { base: [0, 16], outer: [0, 32] },
  legL: { base: [16, 48], outer: [0, 48] },
};

export function partSize(part, slim) {
  if (part === 'head') return [8, 8, 8];
  if (part === 'body') return [8, 12, 4];
  if (part === 'armR' || part === 'armL') return [slim ? 3 : 4, 12, 4];
  return [4, 12, 4];
}

// "right" is the character's right side (on your left when you face them).
export function faceRects(u, v, w, h, d) {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h],
  };
}

export function allRegions(slim) {
  const out = [];
  for (const part of Object.keys(LAYOUT)) {
    for (const layer of ['base', 'outer']) {
      const [w, h, d] = partSize(part, slim);
      const [u, v] = LAYOUT[part][layer];
      const f = faceRects(u, v, w, h, d);
      for (const face of Object.keys(f)) out.push({ part, layer, face, rect: f[face] });
    }
  }
  return out;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const h = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = amt < 0 ? (c) => c * (1 + amt) : (c) => c + (255 - c) * amt;
  return rgbToHex(f(r), f(g), f(b));
}

const tone = (hex) => [hex, shade(hex, -0.07), shade(hex, 0.06), shade(hex, -0.03)];

class Painter {
  constructor(ctx, rng) {
    this.ctx = ctx;
    this.rng = rng;
  }
  px(x, y, c) {
    if (!c) return;
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x, y, 1, 1);
  }
  pick(pal) {
    if (!Array.isArray(pal)) return pal;
    return this.rng() < 0.55 ? pal[0] : pal[1 + Math.floor(this.rng() * (pal.length - 1))];
  }
  // c is a colour, a palette to scatter, or fn(i, j) returning a colour or null to skip.
  fill([x, y, w, h], c) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) this.px(x + i, y + j, typeof c === 'function' ? c(i, j) : this.pick(c));
    }
  }
}

export const DEFAULT_OUTFIT = {
  skin: '#e0ac85',
  hair: '#4a2f1c',
  hairStyle: 'short',
  top: '#e0752d',
  topStyle: 'hoodie',
  pants: '#3a4f7a',
  shoes: '#2b2b2b',
  eyes: '#3d6fb6',
  accent: '#f3efe6',
};

const SKINS = ['#f1c7a5', '#e0ac85', '#c68e6a', '#a86f4c', '#8a5738', '#5e3b26'];
const HAIRS = ['#2a1a10', '#4a2f1c', '#7a4a24', '#c79a4b', '#e3c77a', '#b0402a', '#1b1b1d', '#8f8f93', '#3f5fa8', '#e46da0'];
const TOPS = ['#e0752d', '#3c7dd9', '#d94c4c', '#3f9a55', '#7b4ac2', '#e6c229', '#2f3542', '#f0f0ea', '#1f8a8a'];
const PANTS = ['#3a4f7a', '#2b2b30', '#6b5a45', '#46553a', '#5a3f6e', '#8a8f9a'];
const SHOES = ['#2b2b2b', '#5a3b22', '#e8e8e8', '#8a2f2f'];
const EYES = ['#3d6fb6', '#4b8a4b', '#5a3a20', '#2b2b2b', '#6b4ca8'];

export function randomOutfit(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle: pick(['short', 'long', 'spiky']),
    top: pick(TOPS),
    topStyle: pick(['hoodie', 'tee', 'jacket']),
    pants: pick(PANTS),
    shoes: pick(SHOES),
    eyes: pick(EYES),
    accent: pick(['#f3efe6', '#ffd23f', '#1b1b1d', '#d8392b']),
  };
}

export function paintOutfit(canvas, o, slim = false, seed = 11) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(seed));
  const skin = tone(o.skin);
  const hair = tone(o.hair);
  const top = tone(o.top);
  const pants = tone(o.pants);
  const shoes = tone(o.shoes);

  // Head
  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], skin);
  p.fill(H.top, hair);
  const long = o.hairStyle === 'long';
  p.fill(H.back, (i, j) => (j < (long ? 8 : 6) ? p.pick(hair) : null));
  // ff = how far from the face this column is
  const sideHair = (ff, j) => j <= 1 || (j <= 3 && ff >= 2) || (j <= 5 && ff >= 4) || (long && ff >= 3);
  p.fill(H.right, (i, j) => (sideHair(7 - i, j) ? p.pick(hair) : null));
  p.fill(H.left, (i, j) => (sideHair(i, j) ? p.pick(hair) : null));
  const [fx, fy] = H.front;
  p.fill([fx, fy, 8, 2], hair);
  const fringe = o.hairStyle === 'spiky' ? [0, 2, 4, 7] : long ? [0, 1, 6, 7] : [0, 5, 6, 7];
  for (const c of fringe) p.px(fx + c, fy + 2, p.pick(hair));
  p.px(fx, fy + 3, p.pick(hair));
  p.px(fx + 7, fy + 3, p.pick(hair));
  p.px(fx + 1, fy + 4, '#f3efe6');
  p.px(fx + 2, fy + 4, o.eyes);
  p.px(fx + 5, fy + 4, o.eyes);
  p.px(fx + 6, fy + 4, '#f3efe6');
  p.px(fx + 3, fy + 5, shade(o.skin, -0.12));
  p.px(fx + 4, fy + 5, shade(o.skin, -0.12));
  p.px(fx + 2, fy + 6, shade(o.skin, -0.2));
  p.px(fx + 3, fy + 6, shade(o.skin, -0.4));
  p.px(fx + 4, fy + 6, shade(o.skin, -0.4));
  p.px(fx + 5, fy + 6, shade(o.skin, -0.2));
  if (o.hairStyle === 'spiky') {
    const HO = faceRects(32, 0, 8, 8, 8);
    p.fill(HO.top, () => (p.rng() < 0.55 ? p.pick(hair) : null));
    p.fill([HO.front[0], HO.front[1], 8, 1], (i) => (i % 2 === 0 ? p.pick(hair) : null));
  }

  // Body
  const Bd = faceRects(16, 16, 8, 12, 4);
  for (const k of Object.keys(Bd)) p.fill(Bd[k], top);
  for (const k of ['front', 'back', 'right', 'left']) {
    const [x, y, w] = Bd[k];
    p.fill([x, y + 11, w, 1], shade(o.top, -0.25));
  }
  const [bx, by] = Bd.front;
  if (o.topStyle === 'hoodie') {
    p.fill([bx + 1, by + 7, 6, 3], shade(o.top, -0.12));
    p.fill([bx + 1, by + 7, 6, 1], shade(o.top, -0.25));
    p.fill([bx + 2, by, 4, 1], shade(o.top, -0.3));
    for (const c of [2, 5]) {
      p.px(bx + c, by + 1, '#ece6d6');
      p.px(bx + c, by + 2, '#ece6d6');
    }
    const [kx, ky] = Bd.back;
    p.fill([kx + 1, ky, 6, 3], shade(o.top, -0.12));
  } else if (o.topStyle === 'tee') {
    p.fill([bx + 2, by, 4, 1], skin);
    p.fill([bx + 3, by + 1, 2, 1], skin);
    for (const k of ['front', 'back', 'right', 'left']) {
      const [x, y, w] = Bd[k];
      p.fill([x, y + 5, w, 2], o.accent || '#f3efe6');
    }
  } else {
    p.fill([bx + 3, by, 2, 11], tone('#ecebe4'));
    for (let j = 0; j < 4; j++) {
      p.px(bx + 2, by + j, shade(o.top, -0.2));
      p.px(bx + 5, by + j, shade(o.top, -0.2));
    }
    p.px(bx + 3, by + 3, '#3a3a3a');
    p.px(bx + 3, by + 6, '#3a3a3a');
  }

  // Arms
  const armW = slim ? 3 : 4;
  const sleeve = o.topStyle === 'tee' ? 4 : 10;
  for (const part of ['armR', 'armL']) {
    const [u, v] = LAYOUT[part].base;
    const A = faceRects(u, v, armW, 12, 4);
    for (const k of ['right', 'front', 'left', 'back']) {
      p.fill(A[k], (i, j) => (j === sleeve - 1 ? shade(o.top, -0.2) : j < sleeve ? p.pick(top) : p.pick(skin)));
    }
    p.fill(A.top, top);
    p.fill(A.bottom, skin);
  }

  // Legs
  for (const part of ['legR', 'legL']) {
    const [u, v] = LAYOUT[part].base;
    const L = faceRects(u, v, 4, 12, 4);
    for (const k of ['right', 'front', 'left', 'back']) {
      p.fill(L[k], (i, j) =>
        j < 9 ? p.pick(pants) : j === 9 ? shade(o.pants, -0.2) : j === 11 ? shade(o.shoes, -0.25) : p.pick(shoes),
      );
    }
    p.fill(L.top, pants);
    p.fill(L.bottom, shade(o.shoes, -0.25));
  }
}

// --- Mob skins -----------------------------------------------------------

export function paintMoss(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(301));
  const skin = ['#6f8c55', '#65804d', '#7b995f', '#5a7446'];
  const moss = ['#4f7d2f', '#5c8c36', '#44702a'];
  const tunic = tone('#3d6a6e');
  const trousers = tone('#4a3b2c');
  const mottled = () => (p.rng() < 0.18 ? p.pick(moss) : p.pick(skin));

  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], mottled);
  p.fill(H.top, moss);
  const [fx, fy] = H.front;
  p.fill([fx + 1, fy + 3, 2, 2], '#22301a');
  p.fill([fx + 5, fy + 3, 2, 2], '#22301a');
  p.px(fx + 2, fy + 4, '#ffcf4a');
  p.px(fx + 5, fy + 4, '#ffcf4a');
  p.fill([fx + 2, fy + 6, 4, 1], '#2a1f14');
  p.px(fx + 3, fy + 6, '#d9d2b0');
  const HO = faceRects(32, 0, 8, 8, 8);
  p.fill(HO.top, () => (p.rng() < 0.5 ? p.pick(['#5e9a37', '#6fab44', '#4c7f2a']) : null));
  for (const k of ['front', 'back', 'left', 'right']) {
    const [x, y, w] = HO[k];
    p.fill([x, y, w, 1], () => (p.rng() < 0.45 ? p.pick(['#5e9a37', '#6fab44']) : null));
  }

  const Bd = faceRects(16, 16, 8, 12, 4);
  for (const k of Object.keys(Bd)) p.fill(Bd[k], () => (p.rng() < 0.1 ? p.pick(skin) : p.pick(tunic)));
  for (const k of ['front', 'back', 'right', 'left']) {
    const [x, y, w] = Bd[k];
    p.fill([x, y + 9, w, 1], '#8a6d3b');
  }
  for (const part of ['armR', 'armL']) {
    const [u, v] = LAYOUT[part].base;
    const A = faceRects(u, v, 4, 12, 4);
    for (const k of Object.keys(A)) p.fill(A[k], (i, j) => (j < 3 && k !== 'bottom' ? p.pick(tunic) : mottled()));
  }
  for (const part of ['legR', 'legL']) {
    const [u, v] = LAYOUT[part].base;
    const L = faceRects(u, v, 4, 12, 4);
    for (const k of Object.keys(L)) {
      p.fill(L[k], (i, j) => (k === 'bottom' || j >= 9 ? '#3a2d20' : p.rng() < 0.08 ? p.pick(skin) : p.pick(trousers)));
    }
  }
}

export function paintBone(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(302));
  const bone = ['#dcd6c4', '#cfc8b4', '#e6e1d1', '#c4bca6'];
  const gap = '#2a2723';
  const cloth = tone('#3b3446');
  const boneCracked = () => (p.rng() < 0.05 ? '#9c937c' : p.pick(bone));

  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], boneCracked);
  const [fx, fy] = H.front;
  p.fill([fx + 1, fy + 3, 2, 2], '#1c1a17');
  p.fill([fx + 5, fy + 3, 2, 2], '#1c1a17');
  p.px(fx + 2, fy + 4, '#8fe3ff');
  p.px(fx + 5, fy + 4, '#8fe3ff');
  p.px(fx + 3, fy + 5, '#1c1a17');
  p.px(fx + 4, fy + 5, '#1c1a17');
  for (let i = 1; i < 7; i++) p.px(fx + i, fy + 6, i % 2 ? '#1c1a17' : p.pick(bone));
  // A tattered hood on the outer layer.
  const HO = faceRects(32, 0, 8, 8, 8);
  p.fill(HO.top, cloth);
  p.fill(HO.back, (i, j) => (j < 7 || p.rng() < 0.5 ? p.pick(cloth) : null));
  p.fill(HO.right, (i, j) => (j <= 1 || (7 - i >= 3 && j <= 6) ? p.pick(cloth) : null));
  p.fill(HO.left, (i, j) => (j <= 1 || (i >= 3 && j <= 6) ? p.pick(cloth) : null));
  p.fill([HO.front[0], HO.front[1], 8, 1], cloth);

  const Bd = faceRects(16, 16, 8, 12, 4);
  for (const k of Object.keys(Bd)) p.fill(Bd[k], gap);
  const [bx, by] = Bd.front;
  const [kx, ky] = Bd.back;
  for (let j = 0; j < 9; j++) {
    for (const x of [bx + 3, bx + 4, kx + 3, kx + 4]) p.px(x, by + j, p.pick(bone));
  }
  for (const r of [1, 3, 5, 7]) {
    p.fill([bx + 1, by + r, 6, 1], bone);
    p.fill([Bd.right[0], by + r, 4, 1], bone);
    p.fill([Bd.left[0], by + r, 4, 1], bone);
  }
  p.fill([bx + 1, by + 9, 6, 2], bone);
  p.fill([kx + 1, ky + 9, 6, 2], bone);
  for (const part of ['armR', 'armL', 'legR', 'legL']) {
    const [u, v] = LAYOUT[part].base;
    const A = faceRects(u, v, 2, 12, 2);
    for (const k of Object.keys(A)) p.fill(A[k], (i, j) => (j === 5 || j === 6 ? '#b3ab94' : p.pick(bone)));
  }
}

export function paintGloop(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(303));
  const jelly = ['rgba(155,95,209,0.78)', 'rgba(168,109,219,0.78)', 'rgba(142,82,196,0.78)'];
  const F = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(F)) {
    p.fill(F[k], (i, j) => {
      if (i === 0 || j === 0 || i === 7 || j === 7) return 'rgba(109,58,160,0.95)';
      return p.rng() < 0.06 ? 'rgba(214,184,244,0.9)' : p.pick(jelly);
    });
  }
  const [fx, fy] = F.front;
  for (const ex of [1, 5]) {
    p.fill([fx + ex, fy + 2, 2, 2], '#1d0f2b');
    p.px(fx + ex, fy + 2, '#f5ecff');
  }
  p.fill([fx + 2, fy + 5, 4, 1], '#3a1b52');
  p.px(fx + 2, fy + 6, '#3a1b52');
  p.px(fx + 5, fy + 6, '#3a1b52');
}

// --- The player's skin ---------------------------------------------------

export function makeSkinTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SkinState {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 64;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.slim = false;
    this.texture = makeSkinTexture(this.canvas);
    this.listeners = new Set();
    paintOutfit(this.canvas, DEFAULT_OUTFIT, false);
  }

  // model = true when the arm width changed and meshes must be rebuilt.
  changed(model = false) {
    this.texture.needsUpdate = true;
    for (const fn of this.listeners) fn({ model });
  }

  setSlim(slim) {
    if (this.slim === slim) return;
    this.slim = slim;
    this.changed(true);
    this.save();
  }

  save() {
    store.set('skin', this.canvas.toDataURL('image/png'));
    store.set('slim', this.slim ? '1' : '0');
  }

  async restore() {
    const url = store.get('skin');
    if (!url) return false;
    try {
      const img = await loadImage(url);
      if (img.width !== 64 || img.height !== 64) return false;
      this.ctx.clearRect(0, 0, 64, 64);
      this.ctx.drawImage(img, 0, 0);
      this.slim = store.get('slim') === '1';
      this.changed(true);
      return true;
    } catch {
      return false;
    }
  }

  replace(canvas, slim) {
    this.ctx.clearRect(0, 0, 64, 64);
    this.ctx.drawImage(canvas, 0, 0);
    this.slim = slim;
    this.changed(true);
    this.save();
  }
}

function copyFlipped(ctx, sx, sy, w, h, dx, dy) {
  const src = ctx.getImageData(sx, sy, w, h);
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = (y * w + (w - 1 - x)) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
    }
  }
  ctx.putImageData(out, dx, dy);
}

// Old 64x32 skins have no separate left arm and leg: mirror the right ones.
function convertLegacy(ctx) {
  copyFlipped(ctx, 4, 16, 4, 4, 20, 48);
  copyFlipped(ctx, 8, 16, 4, 4, 24, 48);
  copyFlipped(ctx, 0, 20, 4, 12, 24, 52);
  copyFlipped(ctx, 4, 20, 4, 12, 20, 52);
  copyFlipped(ctx, 8, 20, 4, 12, 16, 52);
  copyFlipped(ctx, 12, 20, 4, 12, 28, 52);
  copyFlipped(ctx, 44, 16, 4, 4, 36, 48);
  copyFlipped(ctx, 48, 16, 4, 4, 40, 48);
  copyFlipped(ctx, 40, 20, 4, 12, 40, 52);
  copyFlipped(ctx, 44, 20, 4, 12, 36, 52);
  copyFlipped(ctx, 48, 20, 4, 12, 32, 52);
  copyFlipped(ctx, 52, 20, 4, 12, 44, 52);
  // Some old skins filled the hat area with a solid colour; drop it.
  const hat = ctx.getImageData(32, 0, 32, 16).data;
  let seeThrough = false;
  for (let i = 3; i < hat.length; i += 4) if (hat[i] < 128) seeThrough = true;
  if (!seeThrough) ctx.clearRect(32, 0, 32, 16);
}

// Slim (3 px) arm skins leave the last two columns of the arm back empty.
function looksSlim(ctx) {
  const d = ctx.getImageData(54, 20, 2, 12).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  return true;
}

export async function readSkinFile(file) {
  if (!/png$/i.test(file.type) && !/\.png$/i.test(file.name)) {
    throw new Error('Pick a .png file. Minecraft skins are PNG images.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) {
      throw new Error(`Skins are 64×64 pixels. This image is ${img.width}×${img.height}.`);
    }
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    if (img.height === 32) {
      convertLegacy(ctx);
      return { canvas: c, slim: false, legacy: true };
    }
    return { canvas: c, slim: looksSlim(ctx), legacy: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}
