/* Build Flappy Fellas into single self-contained files (no external files except the optional web font).
 *   dist/index.html     full document: works on any static host or opened straight from disk
 *   dist/artifact.html  page content without the html/head/body skeleton (for hosts that add their own, e.g. claude.ai)
 * Run: node build.js
 */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const scriptSafe = (js) => js.replace(/<\/script/gi, '<\\/script');

let html = read('index.html');
html = html.replace(/<!--INLINE:([\w.]+)-->[\s\S]*?<!--\/INLINE-->/g, (_, file) => {
  const src = read(file);
  return file.endsWith('.css') ? '<style>\n' + src + '</style>' : '<script>\n' + scriptSafe(src) + '</script>';
});
const assets = {};
for (const f of fs.readdirSync(path.join(root, 'assets'))) {
  if (!/\.webp$/.test(f)) continue;
  assets[f.replace(/\.webp$/, '')] = 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'assets', f)).toString('base64');
}
html = html.replace(/<!--ASSETS-->[\s\S]*?<!--\/ASSETS-->/, '<script>window.FLAPPY_ASSETS=' + JSON.stringify(assets) + ';</script>');
if (/<!--INLINE|src="(engine|progress|game)\.js"|href="style\.css"/.test(html)) throw new Error('something was not inlined');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);

// content-only variant: keep title, meta tags the host understands, font links and everything in <body>
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const keepHead = head.split('\n').filter((l) => /<title>|claude:viewport|fonts\.g|<link rel="preconnect"|<style>/.test(l) || false);
const style = head.match(/<style>[\s\S]*?<\/style>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const artifact = keepHead.filter((l) => !/<style>/.test(l)).join('\n') + '\n' + style + '\n' + body.trim() + '\n';
fs.writeFileSync(path.join(root, 'dist/artifact.html'), artifact);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log('dist/index.html    ' + kb(html));
console.log('dist/artifact.html ' + kb(artifact));
