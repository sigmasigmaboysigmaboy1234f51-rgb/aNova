// Bundles src/ into one self-contained index.html at the repo root.
// That file runs anywhere: double-clicked, on GitHub Pages, or any web host.
//
//   npm run build                         -> index.html
//   npm run build -- --artifact out.html  -> also a body-only copy for claude.ai
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const NOTICE = 'Blockfire. Copyright (c) 2026 sigmasigmaboysigmaboy1234f51-rgb. All rights reserved. Copying or re-uploading without permission is not allowed.';
const args = process.argv.slice(2);
const artifactAt = args.indexOf('--artifact');
const artifactOut = artifactAt >= 0 ? args[artifactAt + 1] : null;
// --dev keeps names readable for debugging.
const dev = args.includes('--dev');

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  target: 'es2020',
  legalComments: 'eof',
  banner: { js: `/*! ${NOTICE} */` },
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// Fonts are inlined as data URIs so the page is one self-contained file.
let css = await readFile('src/style.css', 'utf8');
for (const [, file] of [...css.matchAll(/url\((fonts\/[\w.-]+\.woff2)\)/g)]) {
  const data = (await readFile('src/' + file)).toString('base64');
  css = css.replace(`url(${file})`, `url(data:font/woff2;base64,${data})`);
}
const template = await readFile('src/index.html', 'utf8');
const inline = (html) => html.replace('/*STYLE*/', () => css).replace('/*SCRIPT*/', () => js);

const page = inline(template);
await writeFile('index.html', page);
console.log(`index.html  ${(page.length / 1024).toFixed(0)} KB`);

if (artifactOut) {
  // The claude.ai viewer supplies its own <html>, <head> and <body>.
  const body = template
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?html[^>]*>\s*/gi, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<\/?body[^>]*>\s*/gi, '')
    .replace(/<meta [^>]*>\s*/gi, '');
  await writeFile(artifactOut, inline(body));
  console.log(`${artifactOut}  written`);
}
