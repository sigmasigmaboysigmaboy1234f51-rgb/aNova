// Packs unity/BlockfireVR into dist/BlockfireVR.unitypackage, which you
// import into a Unity project (double-click it, or Assets > Import Package >
// Custom Package). A .unitypackage is a .tar.gz with one folder per asset:
// <guid>/pathname (where it goes), <guid>/asset (the file) and
// <guid>/asset.meta. The guids come from the paths, so they stay the same
// from one version to the next and re-importing updates the files in place.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'unity', 'BlockfireVR');
const out = resolve(root, process.argv[2] || 'dist/BlockfireVR.unitypackage');

const guid = (path) => createHash('md5').update('blockfire-vr:' + path).digest('hex');

const tail = ['  externalObjects: {}', '  userData: ', '  assetBundleName: ', '  assetBundleVariant: ', ''];
function meta(path, isDir) {
  const head = ['fileFormatVersion: 2', 'guid: ' + guid(path)];
  if (isDir) return [...head, 'folderAsset: yes', 'DefaultImporter:', ...tail].join('\n');
  if (path.endsWith('.cs'))
    return [...head, 'MonoImporter:', '  externalObjects: {}', '  serializedVersion: 2', '  defaultReferences: []',
      '  executionOrder: 0', '  icon: {instanceID: 0}', '  userData: ', '  assetBundleName: ', '  assetBundleVariant: ', ''].join('\n');
  if (path.endsWith('.shader'))
    return [...head, 'ShaderImporter:', '  externalObjects: {}', '  defaultTextures: []', '  nonModifiableTextures: []',
      '  userData: ', '  assetBundleName: ', '  assetBundleVariant: ', ''].join('\n');
  if (/\.(txt|md)$/.test(path)) return [...head, 'TextScriptImporter:', ...tail].join('\n');
  return [...head, 'DefaultImporter:', ...tail].join('\n');
}

// Everything under unity/BlockfireVR goes to Assets/BlockfireVR.
const entries = [];
(function walk(dir) {
  const path = 'Assets/BlockfireVR' + (dir === src ? '' : '/' + relative(src, dir).split('\\').join('/'));
  entries.push({ path, dir: true });
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || name.endsWith('.meta')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else entries.push({ path: path + '/' + name, data: readFileSync(full) });
  }
})(src);

// A plain ustar archive.
const blocks = [];
function file(name, data) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148);
  h.write('0', 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  blocks.push(h, data);
  if (data.length % 512) blocks.push(Buffer.alloc(512 - (data.length % 512)));
}
for (const e of entries) {
  const g = guid(e.path);
  if (!e.dir) file(g + '/asset', e.data);
  file(g + '/asset.meta', Buffer.from(meta(e.path, e.dir)));
  file(g + '/pathname', Buffer.from(e.path));
}
blocks.push(Buffer.alloc(1024));

mkdirSync(dirname(out), { recursive: true });
const gz = gzipSync(Buffer.concat(blocks), { level: 9 });
writeFileSync(out, gz);
console.log(`${relative(root, out)}: ${entries.length} assets, ${(gz.length / 1024).toFixed(1)} KB`);
