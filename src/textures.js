import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// Every block texture is painted pixel by pixel at startup. No image files.

export const TILE = 16;
const COLS = 8;
const ROWS = 2;

export const T = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG_SIDE: 5,
  LOG_TOP: 6,
  LEAVES: 7,
  PLANKS: 8,
  COBBLE: 9,
  BEDROCK: 10,
  BRICK: 11,
  MOSSY: 12,
  GRAVEL: 13,
};

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const GREENS = ['#5f9a37', '#67a23d', '#6fab44', '#5a9234'];

function fillAll(set, rng, palette) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) set(x, y, pick(rng, palette));
}

function dirt(set, rng) {
  fillAll(set, rng, ['#7a5436', '#6d4a2f', '#835c3c', '#735033']);
  for (let i = 0; i < 8; i++) set((rng() * 16) | 0, (rng() * 16) | 0, rng() < 0.5 ? '#9b7a58' : '#56391f');
}

function cobble(set, rng, mossy) {
  const shades = ['#8a8a8c', '#7a7a7c', '#99999b', '#6d6d6f', '#838385'];
  const pts = [];
  for (let i = 0; i < 11; i++) pts.push([rng() * 16, rng() * 16, pick(rng, shades)]);
  const ids = new Int8Array(256);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let best = 1e9;
      let bi = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(x + 0.5 - pts[i][0]);
        let dy = Math.abs(y + 0.5 - pts[i][1]);
        dx = Math.min(dx, 16 - dx);
        dy = Math.min(dy, 16 - dy);
        const d = dx * dx + dy * dy * 1.3;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      ids[y * 16 + x] = bi;
    }
  }
  const moss = [];
  if (mossy) for (let i = 0; i < 5; i++) moss.push([rng() * 16, rng() * 16, 2 + rng() * 2.5]);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const id = ids[y * 16 + x];
      const edge = id !== ids[y * 16 + ((x + 1) & 15)] || id !== ids[((y + 1) & 15) * 16 + x];
      let c = edge ? '#4b4b4e' : pts[id][2];
      if (!edge && rng() < 0.08) c = '#a8a8aa';
      for (const [mx, my, r] of moss) {
        let dx = Math.abs(x - mx);
        let dy = Math.abs(y - my);
        dx = Math.min(dx, 16 - dx);
        dy = Math.min(dy, 16 - dy);
        if (dx * dx + dy * dy < r * r && rng() < 0.8) c = pick(rng, ['#4f7d2f', '#5c8c36', '#44702a']);
      }
      set(x, y, c);
    }
  }
}

const PAINTERS = {
  [T.GRASS_TOP](set, rng) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = rng();
        set(x, y, r < 0.07 ? '#4c7f2a' : r < 0.13 ? '#7dba4f' : pick(rng, GREENS));
      }
    }
  },
  [T.GRASS_SIDE](set, rng) {
    dirt(set, rng);
    for (let x = 0; x < 16; x++) {
      const depth = 2 + (rng() < 0.6 ? 1 : 0) + (rng() < 0.3 ? 1 : 0);
      for (let y = 0; y < depth; y++) set(x, y, pick(rng, GREENS));
      if (rng() < 0.5) set(x, depth, '#4c7f2a');
    }
  },
  [T.DIRT]: dirt,
  [T.STONE](set, rng) {
    fillAll(set, rng, ['#7b7d80', '#838588', '#76787b', '#8a8c90']);
    for (let i = 0; i < 8; i++) {
      const len = 2 + ((rng() * 3) | 0);
      const x0 = (rng() * 16) | 0;
      const y0 = (rng() * 16) | 0;
      const c = rng() < 0.6 ? '#636568' : '#9a9ca0';
      for (let k = 0; k < len; k++) set((x0 + k) % 16, y0, c);
    }
  },
  [T.SAND](set, rng) {
    fillAll(set, rng, ['#d9cd96', '#d1c48a', '#e0d5a2', '#d5c990']);
    for (let i = 0; i < 12; i++) set((rng() * 16) | 0, (rng() * 16) | 0, rng() < 0.5 ? '#c2b176' : '#ebe2b8');
  },
  [T.GRAVEL](set, rng) {
    fillAll(set, rng, ['#7f7a74', '#8f8a83', '#6c6862', '#9a948c', '#76706a', '#7a6a58']);
  },
  [T.LOG_SIDE](set, rng) {
    const cols = ['#6a4d2d', '#5c4226', '#735536'];
    for (let x = 0; x < 16; x++) {
      const base = pick(rng, cols);
      for (let y = 0; y < 16; y++) set(x, y, rng() < 0.14 ? '#4b351f' : base);
    }
    for (let i = 0; i < 5; i++) {
      const x = (rng() * 16) | 0;
      const y0 = (rng() * 16) | 0;
      const len = 3 + ((rng() * 5) | 0);
      for (let k = 0; k < len; k++) set(x, (y0 + k) % 16, '#46311c');
    }
  },
  [T.LOG_TOP](set, rng) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const ring = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)));
        if (ring >= 7) set(x, y, pick(rng, ['#5c4226', '#6a4d2d']));
        else set(x, y, rng() < 0.1 ? '#957040' : ring % 2 ? '#b38c55' : '#a47e48');
      }
    }
  },
  [T.LEAVES](set, rng) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = rng();
        set(x, y, r < 0.14 ? '#28521a' : r < 0.19 ? '#63a642' : pick(rng, ['#3e7b29', '#478731', '#376f24', '#529437']));
      }
    }
  },
  [T.PLANKS](set, rng) {
    const shades = ['#a57b46', '#9c7240', '#ae844f', '#a27744'];
    const seamX = [2, 10, 6, 13];
    for (let b = 0; b < 4; b++) {
      for (let y = b * 4; y < b * 4 + 4; y++) {
        for (let x = 0; x < 16; x++) {
          let c = shades[b];
          if (y % 4 === 3) c = '#6b4c29';
          else if (x === seamX[b]) c = '#7a5830';
          else if (rng() < 0.12) c = '#8e663a';
          else if (rng() < 0.08) c = '#b88e58';
          set(x, y, c);
        }
      }
    }
  },
  [T.COBBLE]: (set, rng) => cobble(set, rng, false),
  [T.MOSSY]: (set, rng) => cobble(set, rng, true),
  [T.BEDROCK](set, rng) {
    fillAll(set, rng, ['#2e2e2f', '#444446', '#5a5a5c', '#1e1e1f', '#3a3a3c']);
  },
  [T.BRICK](set, rng) {
    const shades = ['#9a4a3a', '#8b4032', '#a4553f'];
    for (let y = 0; y < 16; y++) {
      const row = y >> 2;
      const off = row % 2 ? 4 : 0;
      for (let x = 0; x < 16; x++) {
        if (y % 4 === 3 || (x + off) % 8 === 7) {
          set(x, y, rng() < 0.2 ? '#a3978a' : '#b3a795');
          continue;
        }
        const brick = Math.floor((x + off) / 8) + row * 3;
        const base = shades[(brick * 7 + 3) % 3];
        set(x, y, rng() < 0.12 ? '#7c3a2c' : rng() < 0.06 ? '#b8664e' : base);
      }
    }
  },
};

function paintTile(t, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  const rng = mulberry32(seed);
  const set = (x, y, hex) => {
    const i = (y * TILE + x) * 4;
    const n = parseInt(hex.slice(1), 16);
    img.data[i] = n >> 16;
    img.data[i + 1] = (n >> 8) & 255;
    img.data[i + 2] = n & 255;
    img.data[i + 3] = 255;
  };
  PAINTERS[t](set, rng);
  ctx.putImageData(img, 0, 0);
  return c;
}

export function pixelTex(t) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sampleColors(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, TILE, TILE).data;
  const out = [];
  for (let i = 0; i < 8; i++) {
    const k = ((i * 37 + 11) % 256) * 4;
    out.push(new THREE.Color().setRGB(d[k] / 255, d[k + 1] / 255, d[k + 2] / 255, THREE.SRGBColorSpace));
  }
  return out;
}

// [u0, v0, u1, v1] per tile, inset a hair so nearest sampling never bleeds.
export const TILE_UV = [];
for (const t of Object.values(T)) {
  const col = t % COLS;
  const row = Math.floor(t / COLS);
  const du = 0.02 / (COLS * TILE);
  const dv = 0.02 / (ROWS * TILE);
  TILE_UV[t] = [col / COLS + du, 1 - (row + 1) / ROWS + dv, (col + 1) / COLS - du, 1 - row / ROWS - dv];
}

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d');
  const tiles = [];
  const colors = [];
  for (const t of Object.values(T)) {
    const tc = paintTile(t, 1000 + t * 77);
    tiles[t] = tc;
    colors[t] = sampleColors(tc);
    ctx.drawImage(tc, (t % COLS) * TILE, Math.floor(t / COLS) * TILE);
  }
  return { canvas, texture: pixelTex(new THREE.CanvasTexture(canvas)), tiles, colors };
}

export function buildCrackTextures() {
  const rng = mulberry32(4242);
  const paths = [];
  for (let i = 0; i < 9; i++) {
    let x = 7.5 + (rng() - 0.5) * 3;
    let y = 7.5 + (rng() - 0.5) * 3;
    let a = (i / 9) * Math.PI * 2 + rng() * 0.5;
    const pts = [];
    for (let s = 0; s < 10; s++) {
      pts.push([x | 0, y | 0]);
      a += (rng() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a);
      if (x < 0 || y < 0 || x >= 16 || y >= 16) break;
    }
    paths.push(pts);
  }
  const out = [];
  for (let stage = 0; stage < 4; stage++) {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(18, 16, 14, 0.8)';
    const n = Math.min(paths.length, 2 + stage * 2);
    const len = 3 + stage * 2;
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < Math.min(len, paths[i].length); s++) ctx.fillRect(paths[i][s][0], paths[i][s][1], 1, 1);
    }
    out.push(pixelTex(new THREE.CanvasTexture(c)));
  }
  return out;
}

export function buildWaterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d');
  const rng = mulberry32(77);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = pick(rng, ['#3a6cbf', '#3f73c7', '#3565b3', '#3b6ec2']);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = '#5a8fdb';
  for (let i = 0; i < 7; i++) ctx.fillRect((rng() * 16) | 0, (rng() * 16) | 0, 2 + ((rng() * 3) | 0), 1);
  const t = pixelTex(new THREE.CanvasTexture(c));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Draws a little isometric block, like an inventory icon, from two tiles.
export function drawBlockIcon(canvas, tiles, topTile, sideTile) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width / 32;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const face = (tile, a, b, c, d, e, f, dark) => {
    ctx.setTransform(a * S, b * S, c * S, d * S, e * S, f * S);
    ctx.drawImage(tiles[tile], 0, 0);
    if (dark) {
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(0, 0, 16, 16);
    }
  };
  face(topTile, 15 / 16, -7.5 / 16, 15 / 16, 7.5 / 16, 1, 8.5, 0);
  face(sideTile, 15 / 16, 7.5 / 16, 0, 15 / 16, 1, 8.5, 0.2);
  face(sideTile, 15 / 16, -7.5 / 16, 0, 15 / 16, 16, 16, 0.4);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
