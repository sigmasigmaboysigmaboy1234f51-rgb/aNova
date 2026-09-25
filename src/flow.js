import { SX, SZ, SEA } from './world.js';

// A distance map from the player's column across the island. Mobs walk
// downhill on it, which gets them around trees, walls and cliffs.

class MinHeap {
  constructor(cap) {
    this.k = new Float32Array(cap);
    this.v = new Int32Array(cap);
    this.n = 0;
  }
  push(key, val) {
    if (this.n >= this.k.length) return;
    let i = this.n++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.k[parent] <= key) break;
      this.k[i] = this.k[parent];
      this.v[i] = this.v[parent];
      i = parent;
    }
    this.k[i] = key;
    this.v[i] = val;
  }
  pop() {
    const topK = this.k[0];
    const topV = this.v[0];
    const lastK = this.k[--this.n];
    const lastV = this.v[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.k[c + 1] < this.k[c]) c++;
      if (this.k[c] >= lastK) break;
      this.k[i] = this.k[c];
      this.v[i] = this.v[c];
      i = c;
    }
    this.k[i] = lastK;
    this.v[i] = lastV;
    this.lastKey = topK;
    return topV;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class FlowField {
  constructor() {
    this.dist = new Float32Array(SX * SZ).fill(Infinity);
    this.stand = new Int16Array(SX * SZ).fill(-1);
    this.heap = new MinHeap(SX * SZ * 9);
  }

  at(x, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return Infinity;
    return this.dist[z * SX + x];
  }

  standAt(x, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return -1;
    return this.stand[z * SX + x];
  }

  compute(world, tx, tz) {
    world.computeStand(this.stand);
    const dist = this.dist;
    const stand = this.stand;
    dist.fill(Infinity);
    tx = Math.min(SX - 1, Math.max(0, tx));
    tz = Math.min(SZ - 1, Math.max(0, tz));
    const heap = this.heap;
    heap.n = 0;
    dist[tz * SX + tx] = 0;
    heap.push(0, tz * SX + tx);
    // Can a mob step from column b into column a? One block up at most.
    const ok = (a, b) => a >= 0 && b >= 0 && a - b <= 1 && b - a <= 4;
    while (heap.n > 0) {
      const i = heap.pop();
      const d = heap.lastKey;
      if (d > dist[i]) continue;
      const x = i % SX;
      const z = (i / SX) | 0;
      const hc = stand[i];
      for (const [dx, dz, cost] of DIRS) {
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
        const j = nz * SX + nx;
        const hn = stand[j];
        if (hn < 0) continue;
        if (hc >= 0 && !ok(hc, hn)) continue;
        if (dx !== 0 && dz !== 0) {
          const a = stand[z * SX + nx];
          const b = stand[nz * SX + x];
          if (a < 0 || b < 0 || Math.abs(a - hn) > 1 || Math.abs(b - hn) > 1 || Math.abs(a - hc) > 1 || Math.abs(b - hc) > 1) continue;
        }
        const nd = d + cost * (hn <= SEA ? 2.5 : 1);
        if (nd < dist[j]) {
          dist[j] = nd;
          heap.push(nd, j);
        }
      }
    }
  }
}
