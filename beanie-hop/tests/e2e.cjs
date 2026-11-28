// Browser tests against the built game (dist/index.html), on phone and desktop emulation.
// Run: node build.js && node tests/e2e.cjs            (uses the Playwright + Chromium installed on the machine)
const { chromium, devices } = require('playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '../dist/index.html');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let pass = 0, fail = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };

async function check(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}

const chickenOnScreen = (page) => page.evaluate(() => {
  const r = BeanieHop.renderer, v = r.chicken.root.position.clone();
  v.y += 0.6; v.project(r.camera);
  return { inside: Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95, x: v.x, y: v.y, visible: r.chicken.root.visible, sq: r.chicken.sq.v };
});

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const targets = [
    ['iPhone 13', { ...devices['iPhone 13'], deviceScaleFactor: 1 }],
    ['Pixel 7', { ...devices['Pixel 7'], deviceScaleFactor: 1 }],
    ['iPad Mini landscape', { ...devices['iPad Mini landscape'], deviceScaleFactor: 1 }],
    ['Desktop 1280x720', { viewport: { width: 1280, height: 720 } }],
  ];
  for (const [label, opts] of targets) {
    console.log(label);
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(URL + '?seed=21');
    await page.waitForFunction(() => window.BeanieHop && BeanieHop.mode === 'title', null, { timeout: 15000 });
    await page.waitForTimeout(800);

    await check('title screen shows the chicken', async () => {
      const c = await chickenOnScreen(page);
      assert(c.inside && c.visible, JSON.stringify(c));
      assert(await page.isVisible('#title') && !(await page.isVisible('#hud')), 'title/hud visibility');
    });
    await check('a tap starts the game and hops forward', async () => {
      const box = await page.locator('#gl').boundingBox();
      if (opts.hasTouch) await page.touchscreen.tap(box.width / 2, box.height * 0.6);
      else await page.mouse.click(box.width / 2, box.height * 0.6);
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => ({ mode: BeanieHop.mode, r: BeanieHop.game.p.r }));
      assert(s.mode === 'play' && s.r === 1, JSON.stringify(s));
    });
    await check('keyboard: arrows steer, down/space hop forward', async () => {
      await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250);
      const a = await page.evaluate(() => BeanieHop.game.p.x);
      await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250);
      await page.keyboard.press('Space'); await page.waitForTimeout(250);
      const s = await page.evaluate(() => ({ x: BeanieHop.game.p.x, r: BeanieHop.game.p.r, mode: BeanieHop.mode }));
      assert(s.mode !== 'play' || (a === 1 && s.x === 0 && s.r === 2), JSON.stringify({ a, ...s }));
    });
    await check('swipe gesture steers (pointer drag)', async () => {
      if ((await page.evaluate(() => BeanieHop.mode)) !== 'play') return;
      const x0 = await page.evaluate(() => BeanieHop.game.p.x);
      const box = await page.locator('#gl').boundingBox();
      await page.mouse.move(box.width / 2, box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.width / 2 - 60, box.height / 2 + 4, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => ({ x: BeanieHop.game.p.x, mode: BeanieHop.mode }));
      assert(s.mode !== 'play' || s.x === x0 - 1 || x0 - 1 < -4, JSON.stringify({ x0, ...s }));
    });
    await check('pause and resume freeze the game', async () => {
      if ((await page.evaluate(() => BeanieHop.mode)) !== 'play') return;
      await page.click('#pause-btn');
      const t0 = await page.evaluate(() => BeanieHop.game.t);
      await page.waitForTimeout(500);
      const t1 = await page.evaluate(() => BeanieHop.game.t);
      assert(t0 === t1 && (await page.isVisible('#pause')), 'time moved while paused');
      await page.click('#resume-btn');
      await page.waitForTimeout(300);
      assert((await page.evaluate(() => BeanieHop.mode)) === 'play', 'not resumed');
    });
    await check('autopilot plays 6 s: chicken stays on screen and the score climbs', async () => {
      if ((await page.evaluate(() => BeanieHop.mode)) !== 'play') { await page.evaluate(() => BeanieHop.restart(21)); }
      await page.evaluate(() => BeanieHop.autopilot(true));
      let worst = null;
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(1000);
        const c = await chickenOnScreen(page);
        if ((await page.evaluate(() => BeanieHop.mode)) === 'play' && (!c.inside || !c.visible || c.sq < 0.5 || c.sq > 1.5)) worst = c;
      }
      await page.evaluate(() => BeanieHop.autopilot(false));
      const score = await page.evaluate(() => BeanieHop.game.score);
      assert(!worst, 'chicken lost: ' + JSON.stringify(worst));
      assert(score >= 8, 'score only ' + score);
    });
    await check('dying shows the game-over card, saves the best score, and PLAY AGAIN restarts', async () => {
      for (let i = 0; i < 80 && (await page.evaluate(() => BeanieHop.mode)) === 'play'; i++) { await page.evaluate(() => BeanieHop.move('f')); await page.waitForTimeout(120); }
      await page.waitForFunction(() => BeanieHop.mode === 'over', null, { timeout: 8000 });
      await page.waitForTimeout(600);
      assert(await page.isVisible('#over .card'), 'card not visible');
      const c = await chickenOnScreen(page);
      const card = await page.locator('#over .card').boundingBox();
      const vp = page.viewportSize();
      const chickenY = (1 - c.y) / 2 * vp.height;
      const death = await page.evaluate(() => BeanieHop.game.death.kind);
      assert(death === 'eagle' || death === 'train' || death === 'splash' || death === 'swept' || chickenY < card.y, `card covers the chicken (${chickenY.toFixed(0)} vs ${card.y.toFixed(0)})`);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('beanie-hop:v1')));
      const score = await page.evaluate(() => BeanieHop.game.score);
      assert(stored && stored.best >= score && stored.games >= 1, JSON.stringify(stored));
      await page.click('#again-btn');
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => ({ mode: BeanieHop.mode, r: BeanieHop.game.p.r, score: BeanieHop.game.score }));
      assert(s.mode === 'play' && s.r === 0 && s.score === 0, JSON.stringify(s));
    });
    await check('draw calls stay modest', async () => {
      const calls = await page.evaluate(() => BeanieHop.renderer.gl.info.render.calls);
      assert(calls < 400, 'draw calls ' + calls);
      console.log('       draw calls per frame: ' + calls);
    });
    await check('no page errors', async () => { assert(!errors.length, errors.slice(0, 3).join(' | ')); });
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
