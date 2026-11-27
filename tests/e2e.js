/* Flappy Fellas — end-to-end browser tests (Playwright, phone emulation).
 * Run: node tests/e2e.js            (tests the source page, index.html)
 *      node tests/e2e.js dist       (tests the single-file build, dist/index.html)
 * Needs the `playwright` package and its Chromium.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PAGE = process.argv[2] === 'dist' ? '/dist/index.html' : '/index.html';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' };

function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ✔ ' + name); }
  catch (e) { fail++; console.log('  ✖ ' + name + '\n      ' + (e && e.message ? e.message.split('\n')[0] : e)); }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'assertion failed'); }

async function openGame(browser, url, device, init) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|ERR_NAME|net::/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // offline-safe; game must not depend on web fonts
  if (init) await page.addInitScript(init);
  await page.goto(url);
  await page.waitForFunction(() => window.FlappyLab && FlappyLab.mode() === 'title');
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}
const tapStage = async (page) => { const b = await page.locator('#stage').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.4); };

(async () => {
  const srv = await serve();
  const url = 'http://127.0.0.1:' + srv.address().port + PAGE;
  const browser = await chromium.launch();
  console.log('Testing ' + PAGE);

  for (const [name, device] of [['iPhone 13', devices['iPhone 13']], ['Pixel 7', devices['Pixel 7']]]) {
    console.log('\n' + name);
    const { ctx, page, errors } = await openGame(browser, url, device);
    await check('title screen renders, no horizontal scroll, sprites loaded', async () => {
      ok(await page.isVisible('#playBtn'), 'play button');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(overflow <= 0, 'overflow ' + overflow);
      const loaded = await page.evaluate(() => [...document.querySelectorAll('#teaserImg')].every((i) => i.complete && i.naturalWidth > 0));
      ok(loaded, 'teaser sprite loaded');
    });
    await check('Play -> get ready -> touch tap starts the flight', async () => {
      await page.click('#playBtn', { force: true });
      ok((await page.evaluate(() => FlappyLab.mode())) === 'ready', 'ready');
      const b = await page.locator('#stage').boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(50);
      ok((await page.evaluate(() => FlappyLab.mode())) === 'play', 'play');
      ok((await page.evaluate(() => FlappyLab.live().velocity)) < 0, 'first tap flapped');
    });
    await check('steady 60 fps frame pacing while flying', async () => {
      await page.evaluate(() => FlappyLab.autopilot(true));
      const ms = await page.evaluate(() => new Promise((res) => { const d = []; let p = performance.now(); const f = (t) => { d.push(t - p); p = t; if (d.length < 150) requestAnimationFrame(f); else res(d.slice(10)); }; requestAnimationFrame(f); }));
      const avg = ms.reduce((a, b) => a + b, 0) / ms.length, long = ms.filter((x) => x > 34).length;
      ok(avg < 17.6, 'avg frame ' + avg.toFixed(2) + 'ms');
      ok(long <= 2, long + ' long frames');
    });
    await check('score rises during autopilot play and HUD mirrors it', async () => {
      await page.waitForFunction(() => FlappyLab.live().score >= 3, null, { timeout: 20000 });
      const hud = await page.textContent('#score'), live = await page.evaluate(() => FlappyLab.live().score);
      ok(+hud === live, 'hud ' + hud + ' vs ' + live);
    });
    await check('crash -> game over panel with score, then a tap restarts almost instantly', async () => {
      await page.evaluate(() => FlappyLab.autopilot(false));
      await page.waitForFunction(() => FlappyLab.mode() === 'over', null, { timeout: 15000 });
      ok(await page.isVisible('#againBtn'), 'play again visible');
      await page.waitForTimeout(450);
      const t0 = Date.now();
      await tapStage(page);
      await page.waitForFunction(() => FlappyLab.mode() === 'play', null, { timeout: 2000 });
      ok(Date.now() - t0 < 500, 'restart took ' + (Date.now() - t0) + 'ms');
      await page.evaluate(() => FlappyLab.autopilot(false));
      await page.waitForFunction(() => FlappyLab.mode() === 'over', null, { timeout: 15000 });
    });
    await check('pause and 3-2-1 resume', async () => {
      await page.click('#againBtn');
      await page.evaluate(() => FlappyLab.autopilot(true));
      await page.waitForTimeout(400);
      await page.click('#pauseBtn');
      ok((await page.evaluate(() => FlappyLab.mode())) === 'paused', 'paused');
      const tick = await page.evaluate(() => FlappyLab.live().tick);
      await page.waitForTimeout(300);
      ok((await page.evaluate(() => FlappyLab.live().tick)) === tick, 'time frozen while paused');
      await page.click('#resumeBtn');
      await page.waitForFunction(() => FlappyLab.mode() === 'play', null, { timeout: 4000 });
      await page.evaluate(() => FlappyLab.autopilot(false));
      await page.waitForFunction(() => FlappyLab.mode() === 'over', null, { timeout: 15000 });
    });
    await check('no script errors', async () => ok(errors.length === 0, errors.join(' | ')));
    await ctx.close();
  }

  console.log('\nProgression + saving (iPhone 13)');
  {
    const { ctx, page, errors } = await openGame(browser, url, devices['iPhone 13']);
    await check('reaching 50 unlocks Couch Critic mid-flight and saves immediately', async () => {
      await page.click('#playBtn', { force: true });
      await tapStage(page);
      await page.evaluate(() => { FlappyLab.autopilot(true); FlappyLab.timeScale(10); });
      await page.waitForFunction(() => FlappyLab.live().score >= 50, null, { timeout: 120000 });
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('flappy-fellas-save-v2')).unlocked);
      ok(stored.includes('critic'), 'stored ' + stored);
      ok(await page.isVisible('.toast'), 'unlock toast');
    });
    await check('game over plays the reveal ceremony, and "Fly as" selects the new flier', async () => {
      await page.evaluate(() => { FlappyLab.timeScale(1); FlappyLab.autopilot(false); });
      await page.waitForFunction(() => FlappyLab.mode() === 'over', null, { timeout: 20000 });
      await page.waitForSelector('#reveal:not([hidden])', { timeout: 4000 });
      await page.locator('#reveal').click({ position: { x: 20, y: 20 } }); // tap skips the drumroll
      await page.waitForSelector('#revealBtns:not([hidden])', { timeout: 3000 });
      ok((await page.textContent('#revealText h3')) === 'Couch Critic', 'name shown');
      await page.click('#revealUse');
      ok((await page.evaluate(() => FlappyLab.save().selected)) === 'critic', 'selected');
      ok((await page.evaluate(() => FlappyLab.mode())) === 'ready', 'straight into a new flight');
    });
    await check('character select shows 2 unlocked and 3 locked cards with requirements', async () => {
      await page.click('#pauseBtn').catch(() => {});
      await page.evaluate(() => document.getElementById('homeBtn').click());
      await page.click('#charsBtn');
      const locked = await page.locator('#sheetBody .tcard.locked').count(), all = await page.locator('#sheetBody .tcard').count();
      ok(all === 7 && locked === 3, all + ' cards, ' + locked + ' locked');
      ok((await page.locator('#sheetBody .tc-price').count()) === 2, 'two shop fliers with price tags');
      ok((await page.textContent('#sheetBody')).includes('Score 100 in one flight'), 'requirement text');
      await page.click('#sheetClose');
    });
    await check('progress survives a reload', async () => {
      await page.reload();
      await page.waitForFunction(() => window.FlappyLab && FlappyLab.mode() === 'title');
      const s = await page.evaluate(() => FlappyLab.save());
      ok(s.best >= 50 && s.unlocked.includes('critic') && s.selected === 'critic' && s.stats.runs >= 1, JSON.stringify({ best: s.best, u: s.unlocked, sel: s.selected }));
      ok(+(await page.textContent('#titleBest')) === s.best, 'title shows best');
      ok(s.pendingReveal.length === 0, 'reveal not repeated');
    });
    await check('badges sheet lists earned merit badges', async () => {
      await page.click('#badgesBtn');
      const earned = await page.locator('#sheetBody .bdg:not(.locked)').count();
      ok(earned >= 4, earned + ' earned');
      await page.click('#sheetClose');
    });
    await check('Speedrun to the Floor: take off, never tap again, earn the badge', async () => {
      await page.evaluate(() => document.getElementById('homeBtn').click());
      ok(!(await page.evaluate(() => FlappyLab.save().achievements.gravity)), 'not earned yet');
      await page.click('#playBtn', { force: true });
      await tapStage(page);
      await page.waitForFunction(() => FlappyLab.mode() === 'over', null, { timeout: 10000 });
      ok(await page.evaluate(() => !!FlappyLab.save().achievements.gravity), 'badge granted');
      ok((await page.textContent('#overBadges')).includes('Speedrun to the Floor'), 'listed on the game-over panel');
    });
    await check('no script errors', async () => ok(errors.length === 0, errors.join(' | ')));
    await ctx.close();
  }

  console.log('\nMigration, daily ghost, layout');
  {
    const { ctx, page, errors } = await openGame(browser, url, devices['iPhone 13'], () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.clear(); localStorage.setItem('flappy-lab-Couch Guy', '57'); } });
    await check('best score from the original game carries over and unlocks a flier', async () => {
      const s = await page.evaluate(() => FlappyLab.save());
      ok(s.best === 57 && s.unlocked.includes('critic'), JSON.stringify({ best: s.best, u: s.unlocked }));
      await page.waitForSelector('#reveal:not([hidden])', { timeout: 4000 });
      await page.locator('#reveal').click({ position: { x: 20, y: 20 } });
      await page.click('#revealLater');
    });
    await check('Daily Flight records a ghost and races it on the next try', async () => {
      await page.click('#dailyBtn', { force: true });
      await tapStage(page);
      await page.evaluate(() => { FlappyLab.autopilot(true); FlappyLab.timeScale(8); });
      await page.waitForFunction(() => FlappyLab.live().score >= 6, null, { timeout: 60000 });
      await page.evaluate(() => { FlappyLab.autopilot(false); FlappyLab.timeScale(1); });
      await page.waitForFunction(() => FlappyLab.mode() === 'over', null, { timeout: 15000 });
      const d = await page.evaluate(() => FlappyLab.save().daily);
      ok(d.best >= 6 && d.ghost.length > 0, JSON.stringify({ best: d.best, ghost: d.ghost.length }));
      await page.click('#againBtn');
      ok(await page.isVisible('#modeChip'), 'daily chip in HUD');
    });
    await check('no script errors', async () => ok(errors.length === 0, errors.join(' | ')));
    await ctx.close();
  }
  console.log('\nMarshmallow shop');
  {
    const { ctx, page, errors } = await openGame(browser, url, devices['Pixel 7'], () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('flappy-fellas-save-v2', JSON.stringify({ best: 12, stats: { runs: 9, mallows: 41 } })); } });
    await check('bank shows on the title screen', async () => ok((await page.textContent('#titleMallows')) === '41', await page.textContent('#titleMallows')));
    await check('buy Pom-Pom Pilot (tap twice), reveal plays, bank drops to 11', async () => {
      await page.click('#charsBtn');
      await page.click('[data-buy="pompom"]');
      ok((await page.textContent('[data-buy="pompom"]')).includes('Tap again'), 'asks to confirm');
      await page.click('[data-buy="pompom"]');
      await page.waitForSelector('#reveal:not([hidden])', { timeout: 3000 });
      ok((await page.textContent('#revealKicker')).includes('purchased'), 'purchase kicker');
      await page.locator('#reveal').click({ position: { x: 20, y: 20 } });
      await page.waitForSelector('#revealBtns:not([hidden])', { timeout: 3000 });
      ok((await page.textContent('#revealText h3')) === 'Pom-Pom Pilot', 'name');
      await page.click('#revealUse');
      const s = await page.evaluate(() => FlappyLab.save());
      ok(s.selected === 'pompom' && s.unlocked.includes('pompom') && s.spent === 30 && !!s.achievements.shopper, JSON.stringify({ sel: s.selected, spent: s.spent }));
      ok((await page.textContent('#titleMallows')) === '11', 'bank ' + (await page.textContent('#titleMallows')));
    });
    await check('Fairway Flier is not affordable yet and says how many more', async () => {
      await page.click('#charsBtn');
      const t = await page.textContent('#sheetBody .btn.buy[disabled]');
      ok(/Need 19 more/.test(t), t);
      await page.click('#sheetClose');
    });
    await check('the purchase survives a reload and the new flier can fly', async () => {
      await page.reload();
      await page.waitForFunction(() => window.FlappyLab && FlappyLab.mode() === 'title');
      ok((await page.evaluate(() => FlappyLab.save().selected)) === 'pompom', 'still selected');
      await page.click('#playBtn', { force: true });
      await tapStage(page);
      ok((await page.evaluate(() => FlappyLab.live().character)) === 'pompom', 'flying as pompom');
    });
    await check('no script errors', async () => ok(errors.length === 0, errors.join(' | ')));
    await ctx.close();
  }
  for (const [name, device, expectRotate] of [['iPhone SE', devices['iPhone SE'], false], ['iPad Mini', devices['iPad Mini'], false], ['Phone landscape', devices['iPhone 13 landscape'], true], ['Desktop 1440x900', { viewport: { width: 1440, height: 900 } }, false]]) {
    const { ctx, page, errors } = await openGame(browser, url, device);
    await check(name + ': layout fits, ' + (expectRotate ? 'asks to rotate' : 'all controls on screen'), async () => {
      const vis = await page.evaluate(() => getComputedStyle(document.querySelector('.rotate')).display !== 'none');
      ok(vis === expectRotate, 'rotate overlay ' + vis);
      if (!expectRotate) {
        const st = await page.locator('#stage').boundingBox();
        for (const sel of ['#playBtn', '#settingsBtn', '#dailyBtn']) { const b = await page.locator(sel).boundingBox(); ok(b.y >= st.y - 1 && b.y + b.height <= st.y + st.height + 1, sel + ' off screen'); }
      }
      ok(errors.length === 0, errors.join(' | '));
    });
    await ctx.close();
  }

  await browser.close();
  srv.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
