import * as THREE from 'three';
import { LAYOUT, partSize, faceRects, makeSkinTexture } from './skin.js';
import { PX } from './model.js';
import { store } from './util.js';

// The spider suit. Pick up the web shooters in Adventure mode and the suit
// spreads out over you from the chest; put them away and it pulls back in.
// It is painted like a skin, but four times sharper (256 x 256 in the same
// layout), so the web lines and eyes come out crisp. Because it is a skin,
// it covers you whatever size you are, buff or not.

export const SUITS = {
  classic: { name: 'Classic', main: '#c8202e', second: '#1f3f9e', lines: '#16161e', eyes: '#f2f6fa', frame: '#101016', emblem: '#16161e', back: '#9e1420' },
  shadow: { name: 'Shadow', main: '#17171f', second: '#17171f', lines: '#2c2c3a', eyes: '#f2f6fa', frame: '#f2f6fa', seam: '#2c2c3a', emblem: '#f2f6fa', back: '#f2f6fa' },
  street: { name: 'Street', main: '#17171f', second: '#17171f', lines: '#d8262e', eyes: '#f2f6fa', frame: '#101016', emblem: '#d8262e', back: '#d8262e' },
  iron: { name: 'Iron', main: '#b01e28', second: '#d6a62a', lines: '#6e1016', eyes: '#f2f6fa', frame: '#6e1016', emblem: '#f2c94a', back: '#f2c94a', legs: true },
  future: { name: 'Future', main: '#1d2d70', second: '#0e1430', lines: '#3350b8', eyes: '#ff3b3b', frame: '#0a0a14', emblem: '#e0342c', back: '#e0342c' },
};
export const SUIT_ORDER = Object.keys(SUITS);

const S = 4;
const PARTS = ['head', 'body', 'armR', 'armL', 'legR', 'legL'];
// Height (in skin pixels from the feet) of the top and bottom of each part.
const SPAN = { head: [32, 24], body: [24, 12], armR: [24, 12], armL: [24, 12], legR: [12, 0], legL: [12, 0] };

// A spider web: spokes from a point and sagging rings between them.
function web(ctx, cx, cy, color, width = 0.26) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const n = 10;
  const spokes = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    spokes.push([Math.cos(a), Math.sin(a)]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20);
    ctx.stroke();
  }
  for (let r = 1.7; r < 16; r += 1.7) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [x, y] = spokes[i % n];
      const [px, py] = spokes[(i + n - 1) % n];
      const X = cx + x * r;
      const Y = cy + y * r;
      if (i === 0) ctx.moveTo(X, Y);
      else {
        // Sag toward the middle between spokes.
        const mx = cx + ((x + px) / 2) * r * 0.86;
        const my = cy + ((y + py) / 2) * r * 0.86;
        ctx.quadraticCurveTo(mx, my, X, Y);
      }
    }
    ctx.stroke();
  }
}

// The spider emblem: a body, a head and eight bent legs.
function spider(ctx, cx, cy, size, fill, edge) {
  const s = size / 5;
  ctx.lineCap = 'round';
  const legs = [
    [-0.6, -1.8, -2.2, -2.6],
    [-0.8, -0.6, -2.6, -1.2],
    [-0.8, 0.5, -2.6, 1.3],
    [-0.6, 1.4, -2.0, 3.0],
  ];
  const draw = (w, c) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    for (const side of [-1, 1]) {
      for (const [kx, ky, fx, fy] of legs) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + (ky > 0 ? 0.3 : -0.3) * s);
        ctx.lineTo(cx - side * kx * s * 1.4, cy + (ky - 0.2) * s);
        ctx.lineTo(cx - side * fx * s, cy + fy * s);
        ctx.stroke();
      }
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 0.9 * s, 0.55 * s + (w - 0.35 * s) / 2, 0.6 * s + (w - 0.35 * s) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.6 * s, 0.75 * s + (w - 0.35 * s) / 2, 1.25 * s + (w - 0.35 * s) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (edge) draw(0.35 * s + 0.35, edge);
  draw(0.35 * s, fill);
}

// Big mask eyes, pointed up and out, with thick frames.
function eyes(ctx, suit) {
  const shape = [
    [0.45, 2.2],
    [1.7, 2.35],
    [3.35, 3.55],
    [3.3, 4.45],
    [2.35, 4.95],
    [1.0, 4.55],
    [0.45, 3.5],
  ];
  for (const side of [0, 1]) {
    const pt = ([x, y]) => [side ? 8 - x : x, y];
    ctx.beginPath();
    shape.forEach((p, i) => (i ? ctx.lineTo(...pt(p)) : ctx.moveTo(...pt(p))));
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = suit.frame;
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.fillStyle = suit.eyes;
    ctx.fill();
    // A soft shine.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const [hx, hy] = pt([1.3, 2.9]);
    ctx.fillRect(hx - 0.25, hy - 0.2, 0.5, 0.4);
  }
}

// Which parts of a face are the second colour (blue on the classic suit).
function zones(part, face, w, h) {
  if (part === 'body') {
    if (face === 'front' || face === 'back') {
      return [
        [[0, 3.4], [2.6, 6], [2.6, 10.8], [0, 10.8]],
        [[8, 3.4], [5.4, 6], [5.4, 10.8], [8, 10.8]],
      ];
    }
    if (face === 'right' || face === 'left') return [[[0, 1.2], [w, 1.2], [w, 10.8], [0, 10.8]]];
    if (face === 'bottom') return [[[0, 0], [w, 0], [w, h], [0, h]]];
    return [];
  }
  if (part === 'armR' || part === 'armL') {
    if (face === 'top' || face === 'bottom') return [];
    return [[[0, 1.4], [w, 1.4], [w, 6.4], [0, 6.4]]];
  }
  if (part === 'legR' || part === 'legL') {
    if (face === 'top') return [[[0, 0], [w, 0], [w, h], [0, h]]];
    if (face === 'bottom') return [];
    return [[[0, 0], [w, 0], [w, 6.2], [0, 6.2]]];
  }
  return [];
}

// Where the web on each face spreads out from.
function webCentre(part, face, w, h) {
  if (part === 'head') return face === 'front' ? [4, 5.2] : [w / 2, h / 2];
  if (part === 'body') return face === 'front' ? [4, 2.6] : face === 'back' ? [4, 4.2] : [w / 2, 2];
  if (part === 'armR' || part === 'armL') return [w / 2, face === 'top' ? h / 2 : 9.4];
  return [w / 2, face === 'bottom' ? h / 2 : 9];
}

export function paintSuit(canvas, suit, slim) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const part of PARTS) {
    const [w, h, d] = partSize(part, slim);
    const [u, v] = LAYOUT[part].base;
    const F = faceRects(u, v, w, h, d);
    for (const face of Object.keys(F)) {
      const [fx, fy, fw, fh] = F[face];
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx * S, fy * S, fw * S, fh * S);
      ctx.clip();
      ctx.translate(fx * S, fy * S);
      ctx.scale(S, S);
      ctx.fillStyle = suit.main;
      ctx.fillRect(0, 0, fw, fh);
      const [cx, cy] = webCentre(part, face, fw, fh);
      web(ctx, cx, cy, suit.lines);
      for (const poly of zones(part, face, fw, fh)) {
        ctx.beginPath();
        poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = suit.second;
        ctx.fill();
        ctx.strokeStyle = suit.seam || suit.frame;
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
      // A little shading toward the bottom of each side face.
      if (face !== 'top' && face !== 'bottom') {
        const grad = ctx.createLinearGradient(0, 0, 0, fh);
        grad.addColorStop(0, 'rgba(255,255,255,0.06)');
        grad.addColorStop(1, 'rgba(0,0,0,0.14)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, fw, fh);
      }
      if (part === 'head' && face === 'front') eyes(ctx, suit);
      if (part === 'body' && face === 'front') spider(ctx, 4, 2.7, 2.6, suit.emblem, suit.emblem === suit.main ? suit.frame : null);
      if (part === 'body' && face === 'back') spider(ctx, 4, 4.6, 5.2, suit.back, suit.seam || suit.frame);
      ctx.restore();
    }
    // Outer layer: empty, except the web shooters on the wrists.
    if (part === 'armR' || part === 'armL') {
      const [ou, ov] = LAYOUT[part].outer;
      const O = faceRects(ou, ov, w, h, d);
      for (const face of ['front', 'back', 'left', 'right']) {
        const [fx, fy, fw] = O[face];
        ctx.fillStyle = '#aeb6c0';
        ctx.fillRect(fx * S, (fy + 7.6) * S, fw * S, 1.2 * S);
        ctx.fillStyle = '#6b737e';
        ctx.fillRect(fx * S, (fy + 8.5) * S, fw * S, 0.3 * S);
      }
      const [bx, by, bw] = O.front;
      ctx.fillStyle = '#39b8ff';
      ctx.fillRect((bx + bw / 2 - 0.4) * S, (by + 7.8) * S, 0.8 * S, 0.6 * S);
    }
  }
}

// Robot spider legs for the Iron suit, on the back.
function buildLegs() {
  const g = new THREE.Group();
  const gold = new THREE.MeshLambertMaterial({ color: '#e0b43a' });
  const red = new THREE.MeshLambertMaterial({ color: '#b01e28' });
  const legs = [];
  for (const side of [-1, 1]) {
    for (const up of [0, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 1.6 * PX, (up ? 9.5 : 6.5) * PX, -2.4 * PX);
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.9 * PX, 0.9 * PX, 9 * PX), gold);
      a.position.z = -4.5 * PX;
      const knee = new THREE.Group();
      knee.position.z = -9 * PX;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.7 * PX, 0.7 * PX, 10 * PX), gold);
      b.position.z = -5 * PX;
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1 * PX, 1 * PX, 2 * PX), red);
      tip.position.z = -10.5 * PX;
      knee.add(b, tip);
      hip.add(a, knee);
      hip.userData = { side, up, knee };
      g.add(hip);
      legs.push(hip);
    }
  }
  g.userData.legs = legs;
  g.userData.dispose = () => {
    g.traverse((o) => o.isMesh && o.geometry.dispose());
    gold.dispose();
    red.dispose();
  };
  return g;
}

export class Suit {
  constructor(game) {
    this.game = game;
    this.style = store.get('suitStyle', 'classic');
    if (!SUITS[this.style]) this.style = 'classic';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 64 * S;
    this.tex = makeSkinTexture(this.canvas);
    this.mix = document.createElement('canvas');
    this.mix.width = this.mix.height = 64 * S;
    this.mixCtx = this.mix.getContext('2d');
    this.mixTex = makeSkinTexture(this.mix);
    this.k = 0;
    this.painted = '';
    this.legs = null;
    this.legT = 0;
  }

  get def() {
    return SUITS[this.style];
  }

  paint() {
    const slim = this.game.skin.slim;
    const key = `${this.style}|${slim}`;
    if (key === this.painted) return;
    this.painted = key;
    paintSuit(this.canvas, this.def, slim);
    this.tex.needsUpdate = true;
  }

  // Next suit style. Returns its name.
  cycle() {
    const i = SUIT_ORDER.indexOf(this.style);
    this.style = SUIT_ORDER[(i + 1) % SUIT_ORDER.length];
    store.set('suitStyle', this.style);
    this.paint();
    return this.def.name;
  }

  // Blend: the suit covers everything within a growing distance of the chest.
  composite(k) {
    const ctx = this.mixCtx;
    const skin = this.game.skin;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.mix.width, this.mix.height);
    ctx.drawImage(skin.canvas, 0, 0, this.mix.width, this.mix.height);
    const R = k * 22;
    for (const part of PARTS) {
      const [w, h, d] = partSize(part, skin.slim);
      const [top, bottom] = SPAN[part];
      for (const layer of ['base', 'outer']) {
        const [u, v] = LAYOUT[part][layer];
        const F = faceRects(u, v, w, h, d);
        for (const face of Object.keys(F)) {
          const [fx, fy, fw, fh] = F[face];
          const rows = face === 'top' || face === 'bottom' ? [[fy, fh, face === 'top' ? top : bottom]] : Array.from({ length: fh }, (_, j) => [fy + j, 1, top - ((top - bottom) * (j + 0.5)) / fh]);
          for (const [ry, rh, y] of rows) {
            const dist = Math.abs(y - 18);
            if (dist > R) continue;
            const r = [fx * S, ry * S, fw * S, rh * S];
            ctx.clearRect(...r);
            ctx.drawImage(this.canvas, ...r, ...r);
            // A bright edge where the suit is spreading.
            if (layer === 'base' && R - dist < 1.4 && k < 1) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
              ctx.fillRect(...r);
            }
          }
        }
      }
    }
    this.mixTex.needsUpdate = true;
  }

  // on: are the web shooters out? Returns true the moment the suit starts
  // going on (for the sparkle and sound).
  update(dt, on) {
    const g = this.game;
    const p = g.player;
    this.paint();
    const was = this.k;
    this.k = Math.max(0, Math.min(1, this.k + (on ? dt : -dt) / 0.7));
    const m = p.model;
    const map = this.k <= 0 ? g.skin.texture : this.k >= 1 ? this.tex : this.mixTex;
    if (this.k > 0 && this.k < 1) this.composite(this.k);
    for (const mat of m.materials) if (mat.map !== map) mat.map = map;
    // Hats and capes don't go with the suit.
    if (p.cos) for (const part of p.cos.parts) part.visible = this.k < 0.5;
    this.updateLegs(dt);
    return on && was === 0 && this.k > 0;
  }

  updateLegs(dt) {
    const p = this.game.player;
    const want = this.def.legs && this.k > 0.6;
    const body = p.model.parts.body;
    if (want && (!this.legs || this.legs.parent !== body)) {
      if (this.legs) this.dropLegs();
      this.legs = buildLegs();
      body.add(this.legs);
    } else if (!want && this.legs) this.dropLegs();
    if (!this.legs) return;
    this.legT += dt;
    // Out wide when flying or climbing, tucked in and twitching otherwise.
    const busy = !p.onGround || p.crawl ? 1 : 0;
    this.legSpread = (this.legSpread || 0) + (busy - (this.legSpread || 0)) * Math.min(1, dt * 6);
    const k = this.legSpread;
    for (const leg of this.legs.userData.legs) {
      const { side, up, knee } = leg.userData;
      const wig = Math.sin(this.legT * 3 + side + up * 2) * 0.08;
      leg.rotation.set((up ? -0.5 : 0.35) * (1 - k * 0.4) + wig, side * (0.5 + k * 0.5), side * (up ? 0.4 : -0.3));
      knee.rotation.x = 0.9 - k * 0.7 + wig;
    }
  }

  dropLegs() {
    if (!this.legs) return;
    this.legs.parent?.remove(this.legs);
    this.legs.userData.dispose();
    this.legs = null;
  }

  // Back to your own clothes straight away (leaving Adventure mode).
  reset() {
    const p = this.game.player;
    this.k = 0;
    for (const mat of p.model.materials) mat.map = this.game.skin.texture;
    if (p.cos) for (const part of p.cos.parts) part.visible = true;
    this.dropLegs();
  }

  dispose() {
    this.reset();
    this.tex.dispose();
    this.mixTex.dispose();
  }
}
