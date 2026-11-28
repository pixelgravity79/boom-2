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

// dist/artifact.html: the same page without the html/head/body skeleton, for hosts that add their own
// (claude.ai artifacts). Keeps the title, font links, styles, markup and script.
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const keep = head.split('\n').filter((l) => /<title>|fonts\.g|rel="preconnect"/.test(l));
const style = head.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const artifact = [...keep, '<meta name="claude:viewport-fit-sides" content="cover">', style, body.trim()].join('\n') + '\n';
fs.writeFileSync(path.join(root, 'dist/artifact.html'), artifact);
const kb = (t) => (Buffer.byteLength(t) / 1024).toFixed(0) + ' KB';
console.log(`dist/index.html     ${kb(html)}${dev ? ' (dev)' : ''}\ndist/artifact.html  ${kb(artifact)}`);
