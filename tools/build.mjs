// Bundles src/ into one self-contained index.html at the repo root.
// That file runs anywhere: double-clicked, on GitHub Pages, or any web host.
//
//   npm run build                         -> index.html
//   npm run build -- --artifact out.html  -> also a body-only copy for claude.ai
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const artifactAt = args.indexOf('--artifact');
const artifactOut = artifactAt >= 0 ? args[artifactAt + 1] : null;

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
  write: false,
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/style.css', 'utf8');
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
