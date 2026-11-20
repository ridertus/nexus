// Builds dist-web/: index.html (everything inlined), sw.js, manifest, icons.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'dist-web');
fs.mkdirSync(out, { recursive: true });

const r = await build({ entryPoints: [path.join(here, 'app.ts')], bundle: true, format: 'iife', target: 'es2020', minify: true, write: false, legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(here, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(here, 'index.template.html'), 'utf8')
  .replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
fs.writeFileSync(path.join(out, 'index.html'), html);

const version = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version + '-' + Date.now().toString(36);
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(here, 'sw.js'), 'utf8').replace('__VERSION__', version));
fs.copyFileSync(path.join(here, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
for (const f of fs.readdirSync(path.join(here, 'icons'))) fs.copyFileSync(path.join(here, 'icons', f), path.join(out, f));
console.log(`dist-web/index.html ${(html.length / 1024).toFixed(0)} KB · sw ${version}`);
