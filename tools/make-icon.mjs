// Draws the app icon (a grass block with an ember spark) as a 256x256 PNG.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 32;
const S = 8;
const px = new Array(N * N).fill(null);
const set = (x, y, c) => {
  if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c;
};
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// Isometric cube: top (grass), left and right (dirt with grass lip).
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const cx = x - 15.5;
    const top = Math.abs(cx) / 2 + (y - 9) < 7.5 && y >= 2 && Math.abs(cx) / 2 - (y - 9) < 7.5;
    const inSide = y >= 9 + Math.abs(cx) / 2 - 7.5 && y <= 30 - Math.abs(cx) / 2 + 0 && Math.abs(cx) <= 15;
    if (top) set(x, y, hex(pick(['#5f9a37', '#67a23d', '#6fab44', '#7dba4f'])));
    else if (inSide) {
      const depth = y - (9 + Math.abs(cx) / 2 - 7.5) - 7.5 + Math.abs(cx) / 2;
      const lip = depth < 3 + (x % 3 === 0 ? 1 : 0);
      const base = lip ? pick(['#5a9234', '#67a23d']) : pick(['#7a5436', '#6d4a2f', '#835c3c']);
      const c = hex(base);
      const k = cx < 0 ? 0.8 : 0.6;
      set(x, y, [c[0] * k, c[1] * k, c[2] * k, 255]);
    }
  }
}
// Ember spark in the corner.
for (const [x, y, c] of [
  [26, 1, '#ffd23f'], [27, 2, '#ffd23f'], [25, 2, '#ff7a2f'], [26, 2, '#fff2b0'], [26, 3, '#ff7a2f'],
  [28, 3, '#ff7a2f'], [24, 3, '#ff7a2f'], [27, 4, '#ffd23f'], [25, 4, '#ffd23f'], [26, 5, '#ff7a2f'],
]) set(x, y, hex(c));

const W = N * S;
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const c = px[Math.floor(y / S) * N + Math.floor(x / S)] || [0, 0, 0, 0];
    c.forEach((v, i) => (raw[y * (W * 4 + 1) + 1 + x * 4 + i] = Math.round(v)));
  }
}
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b) => {
  let c = 0xffffffff;
  for (const v of b) c = table[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(W, 4);
ihdr[8] = 8;
ihdr[9] = 6;
writeFileSync(
  'build/icon.png',
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]),
);
console.log('build/icon.png written');
