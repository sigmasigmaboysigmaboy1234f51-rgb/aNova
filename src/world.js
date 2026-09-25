import * as THREE from 'three';
import { T, TILE_UV } from './textures.js';
import { mulberry32, fbm2, smoothstep } from './rng.js';

export const SX = 64;
export const SY = 32;
export const SZ = 64;
export const CHUNK = 16;
export const SEA = 6;
const NCX = SX / CHUNK;
const NCZ = SZ / CHUNK;

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAVES: 6,
  PLANKS: 7,
  COBBLE: 8,
  BEDROCK: 9,
  BRICK: 10,
  MOSSY: 11,
  GRAVEL: 12,
  SNOW: 13,
  ICE: 14,
  BASALT: 15,
  MAGMA: 16,
  GOLD: 17,
  CRYSTAL: 18,
  DARKGRASS: 19,
  SLIME: 20,
  MARBLE: 21,
};

const def = (name, hp, sound, top, side = top, bottom = top) => ({ name, hp, sound, top, side, bottom });
export const BLOCKS = [
  null,
  def('Grass', 2, 'soft', T.GRASS_TOP, T.GRASS_SIDE, T.DIRT),
  def('Dirt', 2, 'soft', T.DIRT),
  def('Stone', 4, 'hard', T.STONE),
  def('Sand', 1, 'soft', T.SAND),
  def('Log', 3, 'wood', T.LOG_TOP, T.LOG_SIDE, T.LOG_TOP),
  def('Leaves', 1, 'leaf', T.LEAVES),
  def('Planks', 3, 'wood', T.PLANKS),
  def('Cobblestone', 4, 'hard', T.COBBLE),
  def('Bedrock', Infinity, 'hard', T.BEDROCK),
  def('Bricks', 5, 'hard', T.BRICK),
  def('Mossy stone', 4, 'hard', T.MOSSY),
  def('Gravel', 2, 'soft', T.GRAVEL),
  def('Snow', 2, 'soft', T.SNOW_TOP, T.SNOW_SIDE, T.DIRT),
  def('Ice', 2, 'hard', T.ICE),
  def('Basalt', 4, 'hard', T.BASALT),
  def('Magma', 4, 'hard', T.MAGMA),
  def('Gold block', 6, 'hard', T.GOLD),
  def('Crystal', 5, 'hard', T.CRYSTAL),
  def('Dark grass', 2, 'soft', T.DARK_TOP, T.DARK_SIDE, T.DIRT),
  def('Slime', 1, 'soft', T.SLIME),
  def('Marble', 5, 'hard', T.MARBLE),
];

// Faces list corners in bottom-left, bottom-right, top-right, top-left order
// as seen from outside the block. `t` names the two axes the face spans,
// used to find the three neighbours that darken each corner (ambient occlusion).
const AO_CURVE = [0.5, 0.68, 0.84, 1];
const FACES = [
  { n: [1, 0, 0], shade: 0.8, c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], t: [1, 2] },
  { n: [-1, 0, 0], shade: 0.62, c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], t: [1, 2] },
  { n: [0, 1, 0], shade: 1, c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], t: [0, 2] },
  { n: [0, -1, 0], shade: 0.5, c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], t: [0, 2] },
  { n: [0, 0, 1], shade: 0.72, c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], t: [0, 1] },
  { n: [0, 0, -1], shade: 0.9, c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], t: [0, 1] },
].map((f) => ({
  ...f,
  which: f.n[1] > 0 ? 'top' : f.n[1] < 0 ? 'bottom' : 'side',
  // Vertex colours are multiplied in linear space, so pre-curve them to get
  // the brightness we asked for on screen.
  light: AO_CURVE.map((a) => Math.pow(f.shade * a, 2.2)),
  aoOff: f.c.map((c) => {
    const [a1, a2] = f.t;
    const s1 = c[a1] ? 1 : -1;
    const s2 = c[a2] ? 1 : -1;
    const o1 = [0, 0, 0];
    const o2 = [0, 0, 0];
    const o3 = [0, 0, 0];
    o1[a1] = s1;
    o2[a2] = s2;
    o3[a1] = s1;
    o3[a2] = s2;
    return [o1, o2, o3];
  }),
}));

export class World {
  constructor(scene, atlas) {
    this.data = new Uint8Array(SX * SY * SZ);
    this.damage = new Map();
    this.cracks = new Map();
    this.material = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true });
    this.crackMats = atlas.cracks.map(
      (map) =>
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
    );
    this.crackGeo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = new Array(NCX * NCZ).fill(null);
    this.dirty = new Set();
    this.version = 0;
  }

  idx(x, y, z) {
    return (y * SZ + z) * SX + x;
  }

  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= SY || x < 0 || z < 0 || x >= SX || z >= SZ) return B.AIR;
    return this.data[(y * SZ + z) * SX + x];
  }

  solid(x, y, z) {
    return this.get(x, y, z) !== B.AIR;
  }

  // For moving things: the world edge acts like a wall.
  solidP(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0) return true;
    if (y >= SY) return false;
    return this.data[(y * SZ + z) * SX + x] !== B.AIR;
  }

  inBounds(x, y, z) {
    return x >= 0 && z >= 0 && y >= 0 && x < SX && z < SZ && y < SY;
  }

  // silent = true for edits that came from another player, so they are not
  // sent back out again.
  set(x, y, z, id, silent = false) {
    if (!this.inBounds(x, y, z)) return;
    const k = this.idx(x, y, z);
    if (this.data[k] === id) return;
    this.data[k] = id;
    if (!silent && this.onEdit) this.onEdit(x, y, z, id);
    this.clearDamage(k);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = (x + dx) >> 4;
        const cz = (z + dz) >> 4;
        if (cx >= 0 && cz >= 0 && cx < NCX && cz < NCZ) this.dirty.add(cz * NCX + cx);
      }
    }
    this.version++;
  }

  clearDamage(k) {
    this.damage.delete(k);
    const m = this.cracks.get(k);
    if (m) {
      this.group.remove(m);
      this.cracks.delete(k);
    }
  }

  // Returns what happened, or null if there was nothing to hit.
  hitBlock(x, y, z, amount = 1) {
    const id = this.get(x, y, z);
    if (!id || !this.inBounds(x, y, z)) return null;
    const info = BLOCKS[id];
    if (!isFinite(info.hp)) return { id, info, broken: false };
    const k = this.idx(x, y, z);
    const d = (this.damage.get(k) || 0) + amount;
    if (d >= info.hp) {
      this.set(x, y, z, B.AIR);
      return { id, info, broken: true };
    }
    this.damage.set(k, d);
    const stage = Math.min(3, Math.floor((d / info.hp) * 4));
    let m = this.cracks.get(k);
    if (!m) {
      m = new THREE.Mesh(this.crackGeo, this.crackMats[stage]);
      m.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.group.add(m);
      this.cracks.set(k, m);
      if (this.cracks.size > 40) {
        const oldest = this.cracks.keys().next().value;
        this.clearDamage(oldest);
      }
    }
    m.material = this.crackMats[stage];
    return { id, info, broken: false };
  }

  // theme (see themes.js) picks the ground blocks, trees and landmarks.
  generate(seed, theme = null) {
    const th = theme || { top: B.GRASS, under: B.DIRT, beach: B.SAND, trees: 24, ruins: 5, pillars: 3 };
    this.seed = seed;
    this.theme = th;
    this.data.fill(0);
    for (const k of [...this.cracks.keys()]) this.clearDamage(k);
    this.damage.clear();
    const rng = mulberry32(seed);
    const heights = new Int16Array(SX * SZ);
    const cx = (SX - 1) / 2;
    const cz = (SZ - 1) / 2;

    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const nx = (x - cx) / (SX / 2);
        const nz = (z - cz) / (SZ / 2);
        let d = Math.sqrt(nx * nx + nz * nz);
        d += (fbm2(x * 0.07, z * 0.07, seed + 11, 3) - 0.5) * 0.35;
        const island = 1 - smoothstep(0.55, 0.92, d);
        const hills = fbm2(x * 0.05, z * 0.05, seed, 4);
        const peak = Math.pow(Math.max(0, hills - 0.45) / 0.55, 1.6) * 10;
        let h = Math.floor(SEA - 3 - (th.low || 0) * (1 - hills) + island * (4.5 + hills * 4 + peak));
        h = Math.max(2, Math.min(SY - 10, h));
        heights[z * SX + x] = h;
        const beach = h <= SEA + 1;
        const rocky = fbm2(x * 0.09, z * 0.09, seed + 5, 2) > 0.63 && h > SEA + 4;
        const gravel = h <= SEA && fbm2(x * 0.15, z * 0.15, seed + 9, 2) > 0.58;
        for (let y = 0; y < h; y++) {
          let id = B.STONE;
          if (y === 0) id = B.BEDROCK;
          else if (y === h - 1) id = gravel ? B.GRAVEL : beach ? th.beach : rocky ? B.STONE : th.top;
          else if (y >= h - 4) id = beach ? (th.beach === B.ICE ? B.DIRT : th.beach) : rocky ? B.STONE : th.under;
          this.data[this.idx(x, y, z)] = id;
        }
      }
    }

    // Trees, kept away from the middle so the player starts in the open.
    // Landmarks first, so trees and ruins fit around them.
    if (th.extra) th.extra(this, heights, rng);
    const trees = [];
    for (let i = 0; i < 200 && trees.length < th.trees; i++) {
      const x = 3 + Math.floor(rng() * (SX - 6));
      const z = 3 + Math.floor(rng() * (SZ - 6));
      if (Math.hypot(x - cx, z - cz) < 6) continue;
      const h = heights[z * SX + x];
      if (this.get(x, h - 1, z) !== th.top || this.get(x, h, z) !== B.AIR) continue;
      if (trees.some(([tx, tz]) => Math.abs(tx - x) < 4 && Math.abs(tz - z) < 4)) continue;
      this.placeTree(x, h, z, rng, th);
      trees.push([x, z]);
    }

    // Broken old walls to hide behind.
    let ruins = 0;
    for (let i = 0; i < 120 && ruins < th.ruins; i++) {
      const x = 4 + Math.floor(rng() * (SX - 8));
      const z = 4 + Math.floor(rng() * (SZ - 8));
      const dist = Math.hypot(x - cx, z - cz);
      if (dist < 7 || dist > 22 || heights[z * SX + x] <= SEA + 1) continue;
      this.placeRuin(x, z, heights, rng);
      ruins++;
    }

    // A few brick pillars as landmarks.
    let pillars = 0;
    for (let i = 0; i < 80 && pillars < th.pillars; i++) {
      const x = 4 + Math.floor(rng() * (SX - 8));
      const z = 4 + Math.floor(rng() * (SZ - 8));
      const dist = Math.hypot(x - cx, z - cz);
      const h = heights[z * SX + x];
      if (dist < 9 || dist > 24 || h <= SEA + 1 || this.get(x, h, z) !== B.AIR) continue;
      const tall = 3 + Math.floor(rng() * 3);
      for (let k = 0; k < tall; k++) this.data[this.idx(x, h + k, z)] = k === tall - 1 && rng() < 0.5 ? B.MOSSY : B.BRICK;
      pillars++;
    }

    for (let i = 0; i < NCX * NCZ; i++) this.dirty.add(i);
    this.version++;
  }

  markAllDirty() {
    for (let i = 0; i < NCX * NCZ; i++) this.dirty.add(i);
    this.version++;
  }

  placeTree(x, y0, z, rng, th = {}) {
    const top = y0 + 3 + (rng() < 0.5 ? 1 : 0);
    for (let y = y0; y <= top; y++) this.data[this.idx(x, y, z)] = B.LOG;
    // Dead trees in the bog: bare trunks with a couple of stubby branches.
    if (th.deadTrees && rng() < 0.6) {
      if (this.inBounds(x + 1, top - 1, z)) this.data[this.idx(x + 1, top - 1, z)] = B.LOG;
      if (this.inBounds(x, top - 2, z - 1)) this.data[this.idx(x, top - 2, z - 1)] = B.LOG;
      return;
    }
    for (let dy = -2; dy <= 1; dy++) {
      const y = top + dy;
      const r = dy <= -1 ? 2 : 1;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const corner = Math.abs(dx) === r && Math.abs(dz) === r;
          if (dy === 1 && dx !== 0 && dz !== 0) continue;
          if (corner && (dy === 0 || rng() < 0.5)) continue;
          if (this.inBounds(x + dx, y, z + dz) && this.get(x + dx, y, z + dz) === B.AIR) {
            this.data[this.idx(x + dx, y, z + dz)] = B.LEAVES;
          }
        }
      }
    }
    // Snow settles on top of the Frostpeak trees.
    if (th.snowTrees) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let y = top + 1; y >= top - 2; y--) {
            if (this.get(x + dx, y, z + dz) === B.LEAVES) {
              if (this.inBounds(x + dx, y + 1, z + dz) && this.get(x + dx, y + 1, z + dz) === B.AIR) this.data[this.idx(x + dx, y + 1, z + dz)] = B.SNOW;
              break;
            }
          }
        }
      }
    }
  }

  placeRuin(x, z, heights, rng) {
    const len = 5 + Math.floor(rng() * 4);
    const alongX = rng() < 0.5;
    const tall = 2 + (rng() < 0.4 ? 1 : 0);
    const wall = (wx, wz) => {
      if (wx < 1 || wz < 1 || wx >= SX - 1 || wz >= SZ - 1) return;
      const base = heights[wz * SX + wx];
      for (let k = 0; k < tall; k++) {
        if (k > 0 && rng() < 0.3) break;
        this.data[this.idx(wx, base + k, wz)] = rng() < 0.4 ? B.MOSSY : B.COBBLE;
      }
    };
    for (let i = 0; i < len; i++) wall(x + (alongX ? i : 0), z + (alongX ? 0 : i));
    if (rng() < 0.6) {
      const ex = x + (alongX ? len - 1 : 0);
      const ez = z + (alongX ? 0 : len - 1);
      for (let i = 1; i < 4; i++) wall(ex + (alongX ? 0 : i), ez + (alongX ? i : 0));
    }
  }

  // Top surface at the centre, where the player starts.
  spawnPoint() {
    const x = Math.floor(SX / 2);
    const z = Math.floor(SZ / 2);
    let y = SY - 1;
    while (y > 0 && !this.solid(x, y - 1, z)) y--;
    return new THREE.Vector3(x + 0.5, y, z + 0.5);
  }

  // For each column, the lowest height where something 2 blocks tall can stand.
  computeStand(out) {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        let s = -1;
        for (let y = 1; y < SY - 1; y++) {
          if (this.solid(x, y - 1, z) && !this.solid(x, y, z) && !this.solid(x, y + 1, z)) {
            s = y;
            break;
          }
        }
        out[z * SX + x] = s;
      }
    }
    return out;
  }

  // Grid walk along a ray (Amanatides & Woo). Returns the first solid block
  // with the face normal that was entered, or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
    let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
    let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    while (t <= maxDist) {
      if (this.solid(x, y, z)) return { x, y, z, nx, ny, nz, t };
      if (tmx < tmy && tmx < tmz) {
        x += sx;
        t = tmx;
        tmx += tdx;
        nx = -sx;
        ny = 0;
        nz = 0;
      } else if (tmy < tmz) {
        y += sy;
        t = tmy;
        tmy += tdy;
        nx = 0;
        ny = -sy;
        nz = 0;
      } else {
        z += sz;
        t = tmz;
        tmz += tdz;
        nx = 0;
        ny = 0;
        nz = -sz;
      }
    }
    return null;
  }

  flush(limit = Infinity) {
    let n = 0;
    for (const ci of this.dirty) {
      this.buildChunk(ci);
      this.dirty.delete(ci);
      if (++n >= limit) break;
    }
  }

  buildChunk(ci) {
    const cx = ci % NCX;
    const cz = Math.floor(ci / NCX);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const pos = [];
    const uv = [];
    const col = [];
    const ind = [];
    let vi = 0;
    for (let y = 0; y < SY; y++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          const id = this.data[(y * SZ + z) * SX + x];
          if (id === B.AIR) continue;
          const info = BLOCKS[id];
          for (const f of FACES) {
            const nx = x + f.n[0];
            const ny = y + f.n[1];
            const nz = z + f.n[2];
            if (this.get(nx, ny, nz) !== B.AIR) continue;
            const [u0, v0, u1, v1] = TILE_UV[info[f.which]];
            const us = [u0, u1, u1, u0];
            const vs = [v0, v0, v1, v1];
            const ao = [0, 0, 0, 0];
            for (let k = 0; k < 4; k++) {
              const [o1, o2, o3] = f.aoOff[k];
              const s1 = this.solid(nx + o1[0], ny + o1[1], nz + o1[2]) ? 1 : 0;
              const s2 = this.solid(nx + o2[0], ny + o2[1], nz + o2[2]) ? 1 : 0;
              const s3 = this.solid(nx + o3[0], ny + o3[1], nz + o3[2]) ? 1 : 0;
              ao[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
              const c = f.c[k];
              pos.push(x + c[0], y + c[1], z + c[2]);
              uv.push(us[k], vs[k]);
              const l = f.light[ao[k]];
              col.push(l, l, l);
            }
            // Split the quad along the diagonal that keeps the shading even.
            if (ao[0] + ao[2] > ao[1] + ao[3]) ind.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            else ind.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
            vi += 4;
          }
        }
      }
    }
    let mesh = this.meshes[ci];
    if (mesh) {
      mesh.geometry.dispose();
    } else {
      mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
      this.meshes[ci] = mesh;
      this.group.add(mesh);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(vi > 65535 ? new THREE.Uint32BufferAttribute(ind, 1) : new THREE.Uint16BufferAttribute(ind, 1));
    geo.computeBoundingSphere();
    mesh.geometry = geo;
  }
}
