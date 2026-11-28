// Build Beanie Hop into one self-contained HTML file: dist/index.html (game code, Three.js, textures inlined).
// Only the web font is fetched from outside; without it the game falls back to a system font.
//   node build.js          minified
//   node build.js --dev    readable, with source maps inline
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const res = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  format: 'iife',
  target: ['es2020', 'safari15', 'chrome90', 'firefox90'],
  loader: { '.webp': 'dataurl' },
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
html = html.replace('<!--STYLE-->', () => `<style>\n${css}</style>`).replace('<!--SCRIPT-->', () => `<script>\n${js}</script>`);
if (html.includes('<!--STYLE-->') || html.includes('<!--SCRIPT-->')) throw new Error('template placeholders left');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB${dev ? ' (dev)' : ''}`);
