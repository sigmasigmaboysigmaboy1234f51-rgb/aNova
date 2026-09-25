import { LAYOUT, faceRects, Painter, tone, shade, paintMoss, paintBone, paintGloop, makeSkinTexture } from './skin.js';
import { mulberry32 } from './rng.js';
import { MOB_TYPES, VARIANTS } from './mobtypes.js';

// Skins for the mob families, painted pixel by pixel in the same 64x64
// layout as player skins, plus the recolouring that makes each variant.

function limbs(p, parts, fn) {
  for (const part of parts) {
    const [u, v] = LAYOUT[part].base;
    const A = faceRects(u, v, 4, 12, 4);
    for (const k of Object.keys(A)) p.fill(A[k], (i, j) => fn(k, i, j));
  }
}

export function paintFuse(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(307));
  const red = tone('#d8392b');
  const dark = tone('#2a2622');
  // Head: a stick of dynamite end-on, with a nervous face.
  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], (i, j) => (j === 0 || j === 7 ? '#8a2a1c' : p.pick(red)));
  p.fill(H.top, (i, j) => ((i + j) % 5 === 0 ? '#e8e2cc' : '#b8322a'));
  const [fx, fy] = H.front;
  p.fill([fx + 1, fy + 2, 2, 2], '#f4f1ea');
  p.fill([fx + 5, fy + 2, 2, 2], '#f4f1ea');
  p.px(fx + 2, fy + 3, '#1a1a1a');
  p.px(fx + 5, fy + 3, '#1a1a1a');
  p.fill([fx + 2, fy + 5, 4, 1], '#1a1a1a');
  p.px(fx + 1, fy + 6, '#1a1a1a');
  p.px(fx + 6, fy + 6, '#1a1a1a');
  // Body: bundled sticks with black straps and a warning label.
  const Bd = faceRects(16, 16, 8, 12, 4);
  for (const k of Object.keys(Bd)) {
    p.fill(Bd[k], (i, j) => (j === 2 || j === 9 ? p.pick(dark) : i % 3 === 2 ? '#a82c20' : p.pick(red)));
  }
  const [bx, by] = Bd.front;
  p.fill([bx + 2, by + 4, 4, 4], '#ffd23f');
  p.fill([bx + 3, by + 4, 2, 2], '#1a1a1a');
  p.fill([bx + 3, by + 7, 2, 1], '#1a1a1a');
  limbs(p, ['armR', 'armL'], (k, i, j) => (j > 9 ? '#1a1a1a' : j === 3 ? p.pick(dark) : p.pick(red)));
  limbs(p, ['legR', 'legL'], (k, i, j) => (j > 9 ? '#141210' : p.pick(dark)));
}

export function paintGolem(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(308));
  const stone = ['#7a7a7a', '#6c6c6c', '#8a8a8a', '#5e5e5e', '#949494'];
  const moss = ['#4f7d2f', '#5c8c36', '#44702a'];
  // Cobblestone: little rounded stones with dark gaps.
  const cobble = (i, j) => ((i * 7 + j * 3) % 11 === 0 || (i + j * 5) % 13 === 0 ? '#4a4a4a' : p.pick(stone));
  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], cobble);
  p.fill(H.top, (i, j) => (p.rng() < 0.6 ? p.pick(moss) : cobble(i, j)));
  const [fx, fy] = H.front;
  p.fill([fx, fy + 2, 8, 1], '#3e3e3e');
  p.fill([fx + 1, fy + 3, 2, 1], '#8ff0ff');
  p.fill([fx + 5, fy + 3, 2, 1], '#8ff0ff');
  p.fill([fx + 2, fy + 6, 4, 1], '#2e2e2e');
  const Bd = faceRects(16, 16, 8, 12, 4);
  for (const k of Object.keys(Bd)) p.fill(Bd[k], cobble);
  const [bx, by] = Bd.front;
  p.fill([bx + 3, by + 3, 2, 3], '#6fd6f0');
  p.px(bx + 3, by + 3, '#d8fbff');
  p.fill([bx + 2, by + 3, 1, 3], '#3e3e3e');
  p.fill([bx + 5, by + 3, 1, 3], '#3e3e3e');
  for (const k of ['top']) p.fill(Bd[k], moss);
  limbs(p, ['armR', 'armL'], (k, i, j) => (j < 2 && p.rng() < 0.5 ? p.pick(moss) : cobble(i, j)));
  limbs(p, ['legR', 'legL'], (k, i, j) => cobble(i, j));
}

export function paintImp(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(309));
  const skin = tone('#c8402a');
  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], skin);
  p.fill(H.top, tone('#a8321f'));
  const [fx, fy] = H.front;
  p.fill([fx + 1, fy + 2, 2, 1], '#2a1210');
  p.fill([fx + 5, fy + 2, 2, 1], '#2a1210');
  p.fill([fx + 1, fy + 3, 2, 1], '#ffd84a');
  p.fill([fx + 5, fy + 3, 2, 1], '#ffd84a');
  p.fill([fx + 1, fy + 5, 6, 2], '#2a1210');
  p.px(fx + 2, fy + 5, '#f4f1ea');
  p.px(fx + 5, fy + 5, '#f4f1ea');
  p.px(fx + 3, fy + 6, '#ff9a3c');
  p.px(fx + 4, fy + 6, '#ff9a3c');
  const Bd = faceRects(16, 16, 8, 12, 4);
  for (const k of Object.keys(Bd)) p.fill(Bd[k], (i, j) => (j >= 9 ? p.pick(tone('#2a1210')) : p.pick(skin)));
  const [bx, by] = Bd.front;
  for (const r of [3, 5]) p.fill([bx + 2, by + r, 4, 1], shade('#c8402a', -0.2));
  limbs(p, ['armR', 'armL'], (k, i, j) => (j > 10 ? '#2a1210' : p.pick(skin)));
  limbs(p, ['legR', 'legL'], (k, i, j) => (j > 9 ? '#1a0c0a' : j < 3 ? p.pick(tone('#2a1210')) : p.pick(skin)));
}

export function paintKnight(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(310));
  const rust = ['#8a5a3a', '#a8703f', '#7a4a2c', '#9a6444', '#6e4630'];
  const iron = ['#8f8f93', '#7a7a80', '#a0a0a6'];
  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], (i, j) => (p.rng() < 0.45 ? p.pick(rust) : p.pick(iron)));
  const [fx, fy] = H.front;
  p.fill([fx, fy + 3, 8, 2], '#141210');
  p.px(fx + 2, fy + 3, '#ff5a3a');
  p.px(fx + 5, fy + 3, '#ff5a3a');
  p.fill([fx + 3, fy + 5, 2, 3], shade('#8f8f93', -0.25));
  for (let j = 5; j < 8; j++) {
    p.px(fx + 1, fy + j, '#4a4a50');
    p.px(fx + 6, fy + j, '#4a4a50');
  }
  const Bd = faceRects(16, 16, 8, 12, 4);
  // Chainmail under a torn red tabard with a gold stripe.
  for (const k of Object.keys(Bd)) p.fill(Bd[k], (i, j) => ((i + j) % 2 ? '#6a6a70' : '#8f8f93'));
  const [bx, by] = Bd.front;
  p.fill([bx + 1, by, 6, 11], (i, j) => (j === 10 && i % 2 ? null : i === 2 || i === 3 ? '#c9a23a' : p.pick(tone('#7a1f1f'))));
  const [kx, ky] = Bd.back;
  p.fill([kx + 1, ky, 6, 11], (i, j) => (j === 10 && i % 2 ? null : p.pick(tone('#7a1f1f'))));
  limbs(p, ['armR', 'armL'], (k, i, j) => (j === 4 || j === 9 ? '#4a4a50' : p.rng() < 0.4 ? p.pick(rust) : p.pick(iron)));
  limbs(p, ['legR', 'legL'], (k, i, j) => (j === 5 ? '#4a4a50' : p.rng() < 0.4 ? p.pick(rust) : p.pick(iron)));
}

export function paintGhost(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  const p = new Painter(ctx, mulberry32(311));
  const pale = ['#dfe8f0', '#cfdce8', '#e8f0f6', '#b8c8d8'];
  const H = faceRects(0, 0, 8, 8, 8);
  for (const k of Object.keys(H)) p.fill(H[k], pale);
  const [fx, fy] = H.front;
  p.fill([fx + 1, fy + 2, 2, 3], '#141820');
  p.fill([fx + 5, fy + 2, 2, 3], '#141820');
  p.px(fx + 1, fy + 2, '#8fe3ff');
  p.px(fx + 5, fy + 2, '#8fe3ff');
  p.fill([fx + 3, fy + 6, 2, 1], '#141820');
  const Bd = faceRects(16, 16, 8, 12, 4);
  for (const k of Object.keys(Bd)) p.fill(Bd[k], (i, j) => (j > 8 && (i + j) % 3 === 0 ? null : p.pick(pale)));
  limbs(p, ['armR', 'armL'], (k, i, j) => (j > 9 && i % 2 ? null : p.pick(pale)));
  // The legs fade away into wisps.
  limbs(p, ['legR', 'legL'], (k, i, j) => (j > 4 || (j > 1 && (i + j) % 2) ? null : p.pick(pale)));
}

const PAINTERS = {
  moss: paintMoss,
  bone: paintBone,
  gloop: paintGloop,
  fuse: paintFuse,
  golem: paintGolem,
  imp: paintImp,
  knight: paintKnight,
  ghost: paintGhost,
};

// Repaint a skin along a variant's colour ramp. Bright, saturated pixels
// (eyes and glowing bits) keep their colour so faces stay readable.
export function recolor(canvas, variant) {
  const v = VARIANTS[variant];
  if (!v || !v.ramp) return;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const ramp = v.ramp.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const eyes = v.eyes ? [parseInt(v.eyes.slice(1, 3), 16), parseInt(v.eyes.slice(3, 5), 16), parseInt(v.eyes.slice(5, 7), 16)] : null;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx ? (mx - mn) / mx : 0;
    if (sat > 0.55 && mx > 200) {
      if (eyes) [d[i], d[i + 1], d[i + 2]] = eyes;
      continue;
    }
    const l = Math.min(0.999, (r * 0.3 + g * 0.59 + b * 0.11) / 255) * 1.1;
    const x = Math.min(0.999, l) * (ramp.length - 1);
    const k = Math.floor(x);
    const t = x - k;
    const a = ramp[k];
    const c = ramp[Math.min(ramp.length - 1, k + 1)];
    for (let n = 0; n < 3; n++) d[i + n] = (a[n] + (c[n] - a[n]) * t) * 0.85 + d[i + n] * 0.15;
  }
  ctx.putImageData(img, 0, 0);
}

const cache = new Map();

// The skin texture for a mob type, painted once and shared.
export function mobTexture(typeId) {
  if (cache.has(typeId)) return cache.get(typeId);
  const def = MOB_TYPES[typeId];
  const paint = PAINTERS[def.family];
  let tex = null;
  if (paint) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    paint(c);
    recolor(c, def.variant);
    tex = makeSkinTexture(c);
  }
  cache.set(typeId, tex);
  return tex;
}
