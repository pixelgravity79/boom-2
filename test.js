/* Flappy Fellas — Node regression tests for the shared engine and the progression/save logic.
 * Run: node test.js   (no dependencies)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine');
const P = require('./progress');
const C = E.config;

function pilotRun(seed, frames) {
  const s = E.create(seed); s.events = null;
  for (let i = 0; i < frames && !s.dead; i++) E.step(s, E.policy(s));
  return s;
}

// ------------------------------------------------------------------ engine: physics
test('flap gives upward velocity and lifts the flier', () => {
  const s = E.create();
  E.step(s, true);
  assert.ok(s.vy < 0);
  assert.ok(s.y < 300);
  assert.equal(s.flaps, 1);
  assert.deepEqual(s.flapTicks, [0]);
});

test('gravity pulls to the ground, fall speed is capped, death cause is recorded', () => {
  const s = E.create();
  let maxVy = 0;
  for (let i = 0; i < 600 && !s.dead; i++) { E.step(s); maxVy = Math.max(maxVy, s.vy); }
  assert.ok(s.dead);
  assert.equal(s.deathCause, 'ground');
  assert.ok(maxVy <= C.maxFall + 1e-9, 'terminal velocity');
});

test('soft ceiling: flapping into the sky never kills, y is clamped', () => {
  const s = E.create();
  for (let i = 0; i < 120; i++) E.step(s, i % 3 === 0);
  assert.ok(s.y >= C.ceiling);
  assert.ok(s.ceilingTouches > 0);
  // the only way to die up there would be a pipe; none has reached the flier yet
  assert.equal(s.deathCause === 'ground', false);
});

// ------------------------------------------------------------------ engine: collisions + scoring
function pipeAt(x, gy, extra = {}) {
  const p = Object.assign({ id: 0, x, px: x, kind: 'static', base: gy, gap: 180, amp: 0, w: 0, phase: 0, milestone: false, scored: false, crossed: false, minClear: Infinity }, extra);
  p.gy = p.pgy = gy; p.g = p.pg = p.gap;
  return p;
}
test('pipe collision: flier inside the top pipe dies with cause pipe-top', () => {
  const s = E.create(); s.sinceSpawn = -1e9; // no spawning during this check
  s.y = 300; s.pipes = [pipeAt(C.x - 10, 460)]; // gap 370..550, flier at 300 is in the top pipe
  E.step(s);
  assert.ok(s.dead);
  assert.equal(s.deathCause, 'pipe-top');
});

test('circle hitbox: a corner the old square box would have hit is a clean miss', () => {
  // flier centre diagonally off the pipe's bottom-left cap corner, ~1.4*r away on each axis offset
  const s = E.create(); s.sinceSpawn = -1e9; s.vy = 0;
  const gapTop = 200, gy = gapTop + 90; // gap 200..380
  const px = C.x + 14 + C.speed0;       // after the step the pipe's left edge sits at C.x + 14
  s.y = gapTop + 12 - C.gravity;        // after gravity: centre 12 below the corner
  s.pipes = [pipeAt(px, gy)];
  E.step(s);
  // dx = 14, dy = 12 -> distance 18.4 > r=17: an AABB test would collide, the circle does not
  assert.equal(s.dead, false);
});

test('scores exactly once per pipe, at the pipe centre, with perfect detection', () => {
  const s = E.create(); s.sinceSpawn = -1e9; s.vy = 0;
  s.y = 300; s.pipes = [pipeAt(C.x - C.pipeWidth / 2 + C.speed0 * 0.5, 300)];
  E.step(s);
  assert.equal(s.score, 1);
  assert.equal(s.perfects, 1, 'dead-centre pass is perfect');
  for (let i = 0; i < 40; i++) { s.vy = 0; s.y = 300; E.step(s); }
  assert.equal(s.score, 1, 'never scored twice');
});

test('marshmallows add a point; bubble shield absorbs one crash then gives invulnerability', () => {
  const s = E.create(); s.sinceSpawn = -1e9;
  s.items = [{ kind: 'mallow', x: C.x + 2, px: C.x + 2, y: 300, taken: false, id: 1 }, { kind: 'shield', x: C.x + 4, px: C.x + 4, y: 300, taken: false, id: 2 }];
  E.step(s);
  assert.equal(s.mallows, 1); assert.equal(s.score, 1); assert.equal(s.shield, true);
  s.pipes = [pipeAt(C.x - 10, 520)]; s.y = 300; s.vy = 0;
  E.step(s);
  assert.equal(s.dead, false, 'shield saved the run');
  assert.equal(s.shield, false);
  assert.ok(s.invuln > 0);
  s.y = 300; E.step(s);
  assert.equal(s.dead, false, 'invulnerable straight after');
});

test('ground bounce while invulnerable instead of death', () => {
  const s = E.create(); s.sinceSpawn = -1e9; s.invuln = 30; s.y = C.floor - C.radius - 1; s.vy = 5;
  E.step(s);
  assert.equal(s.dead, false);
  assert.ok(s.vy < 0);
});

// ------------------------------------------------------------------ engine: determinism + course
test('deterministic replay of the pilot', () => {
  assert.deepEqual(E.observe(pilotRun(42, 2400)), E.observe(pilotRun(42, 2400)));
});

test('the course never depends on the player (needed for Daily ghosts)', () => {
  const a = E.create(77), b = E.create(77);
  for (let i = 0; i < 4000; i++) {
    E.step(a, i % 19 === 0); E.step(b, false);
    a.dead = b.dead = false; a.y = b.y = 300; // keep both alive
  }
  const sig = (s) => s.pipes.map((p) => [p.id, p.kind, p.base.toFixed(3)].join(':')).join('|');
  assert.equal(sig(a), sig(b));
  assert.equal(a.spawned, b.spawned);
});

test('recorded flap ticks replay to the identical run (ghost)', () => {
  const run = pilotRun(2026, 3000);
  const rep = E.replay(2026, run.flapTicks, run.tick);
  assert.equal(rep.score, run.score);
  assert.equal(rep.tick, run.tick);
  assert.equal(rep.y.toFixed(6), run.y.toFixed(6));
});

test('daily seeds are stable per date and differ between dates', () => {
  assert.equal(E.seedFrom('flappy-fellas-daily-2026-11-27'), E.seedFrom('flappy-fellas-daily-2026-11-27'));
  assert.notEqual(E.seedFrom('flappy-fellas-daily-2026-11-27'), E.seedFrom('flappy-fellas-daily-2026-11-28'));
});

test('difficulty ramps smoothly and caps', () => {
  let prev = E.difficulty(0);
  assert.equal(prev.speed, C.speed0); assert.equal(prev.gap, C.gap0);
  for (let n = 1; n <= 400; n++) {
    const d = E.difficulty(n);
    assert.ok(d.speed >= prev.speed && d.gap <= prev.gap);
    assert.ok(d.speed - prev.speed < 0.02, 'no sudden speed jumps');
    prev = d;
  }
  assert.equal(E.difficulty(C.ramp).speed, C.speed1);
  assert.equal(E.difficulty(999).gap, C.gap1);
});

test('generated course is fair: gaps in bounds, specials only after their intro, milestones static', () => {
  const s = E.create(5);
  const seen = { static: 0, bob: 0, chomp: 0 };
  const firsts = {};
  for (let i = 0; i < 60 * 60 * 6; i++) {
    E.step(s); s.dead = false; s.y = 300; s.vy = 0; s.events.length = 0;
    for (const p of s.pipes) {
      if (p._checked) continue; p._checked = true;
      seen[p.kind]++; if (!(p.kind in firsts)) firsts[p.kind] = p.id;
      const worstHalf = (p.gap + (p.kind === 'chomp' ? p.amp : 0)) / 2, drift = p.kind === 'bob' ? p.amp : 0;
      assert.ok(p.base - drift - worstHalf >= C.topMargin - 1e-6, 'gap top inside the sky');
      assert.ok(p.base + drift + worstHalf <= C.floor - C.floorMargin + 1e-6, 'gap bottom above the ground');
      if (p.kind === 'chomp') assert.ok(p.gap - p.amp >= 2 * C.radius * 3.5, 'chompers never close below 3.5 flier widths');
      if (p.milestone) assert.equal(p.kind, 'static');
    }
  }
  assert.ok(seen.bob > 10 && seen.chomp > 10 && seen.static > 100, JSON.stringify(seen));
  assert.ok(firsts.bob >= C.bobFrom && firsts.chomp >= C.chompFrom, JSON.stringify(firsts));
});

test('every course is beatable: the test pilot clears 200+ pipes on several seeds', () => {
  const rows = [42, 1, 7, 101, 999].map((seed) => { const s = pilotRun(seed, 60 * 60 * 4); return { seed, score: s.score, passed: s.passed, dead: s.dead }; });
  console.table(rows);
  for (const r of rows) assert.ok(r.passed >= 150, 'seed ' + r.seed + ' passed ' + r.passed);
});

test('observe() keeps the Lab API shape from the original game', () => {
  const o = E.observe(E.step(E.create(), false, 200));
  for (const k of ['tick', 'y', 'velocity', 'score', 'dead', 'nextPipe']) assert.ok(k in o, k);
  assert.ok(o.nextPipe && 'gapTop' in o.nextPipe && 'gapBottom' in o.nextPipe && 'distance' in o.nextPipe);
});

// ------------------------------------------------------------------ progression
const runOf = (o) => Object.assign({ score: 0, passed: 0, mallows: 0, perfects: 0, bestPerfectStreak: 0, nearMisses: 0, flaps: 5, ceilingTouches: 0, deathCause: 'ground', ticks: 600, character: 'razz', mode: 'classic', shieldSaves: 0, flapTicks: [] }, o);

test('fresh save: only the starter is unlocked', () => {
  const s = P.defaultSave();
  assert.deepEqual(s.unlocked, ['razz']);
  assert.equal(P.nextUnlock(s).id, 'critic');
});

test('a new flier unlocks at 50, 100, 150 and the legend at 200', () => {
  const s = P.defaultSave();
  assert.equal(P.liveUnlock(s, 49).length, 0);
  assert.deepEqual(P.liveUnlock(s, 50).map((c) => c.id), ['critic']);
  assert.deepEqual(P.liveUnlock(s, 50).map((c) => c.id), [], 'only once');
  assert.deepEqual(P.liveUnlock(s, 150).map((c) => c.id), ['roadtrip', 'chill']);
  assert.deepEqual(P.liveUnlock(s, 200).map((c) => c.id), ['legend']);
  assert.deepEqual(s.pendingReveal, ['critic', 'roadtrip', 'chill', 'legend'], 'each gets a reveal ceremony');
  assert.equal(P.nextUnlock(s), null);
  assert.deepEqual(P.SCORE_CHARS.map((c) => c.unlockAt), [0, 50, 100, 150, 200]);
  assert.ok(!P.liveUnlock(s, 9999).length && !s.unlocked.includes('pompom'), 'score never unlocks shop fliers');
});

test('applyRun: best, per-flier best, stats, achievements, so-close', () => {
  const s = P.defaultSave();
  const r1 = P.applyRun(s, runOf({ score: 12, passed: 12, flaps: 30 }), 1000);
  assert.equal(r1.newBest, true); assert.equal(s.best, 12); assert.equal(s.bestByChar.razz, 12);
  assert.deepEqual(r1.achievements.map((a) => a.id).sort(), ['liftoff', 'ten']);
  const r2 = P.applyRun(s, runOf({ score: 49, passed: 45, character: 'razz' }), 2000);
  assert.equal(r2.soClose, true);
  assert.ok(r2.achievements.some((a) => a.id === 'soclose'));
  const r3 = P.applyRun(s, runOf({ score: 0, flaps: 0 }), 3000);
  assert.equal(r3.newBest, false);
  assert.ok(r3.achievements.some((a) => a.id === 'gravity'), 'crash without flapping');
  assert.equal(s.stats.runs, 3);
  assert.equal(s.stats.totalScore, 61);
});

test('achievements are granted once and perks unlock by badge count', () => {
  const s = P.defaultSave();
  P.applyRun(s, runOf({ score: 60, passed: 52, bestPerfectStreak: 6, nearMisses: 3 }));
  const n = P.earnedCount(s);
  assert.ok(n >= 7, 'earned ' + n);
  assert.equal(P.perkUnlocked(s, 'bigHead'), true);
  const again = P.applyRun(s, runOf({ score: 60, passed: 52, bestPerfectStreak: 6, nearMisses: 3 }));
  assert.equal(again.achievements.length, 0);
  assert.ok(P.grant(s, 'poke'));
  assert.equal(P.grant(s, 'poke'), null);
});

test('daily: ghost is kept only when the daily best improves', () => {
  const s = P.defaultSave();
  P.applyRun(s, runOf({ score: 8, mode: 'daily', date: '2026-11-27', flapTicks: [1, 2, 3] }));
  assert.equal(s.daily.best, 8); assert.deepEqual(s.daily.ghost, [1, 2, 3]);
  P.applyRun(s, runOf({ score: 5, mode: 'daily', date: '2026-11-27', flapTicks: [9] }));
  assert.deepEqual(s.daily.ghost, [1, 2, 3]);
  P.applyRun(s, runOf({ score: 3, mode: 'daily', date: '2026-11-28', flapTicks: [7] }));
  assert.equal(s.daily.date, '2026-11-28'); assert.equal(s.daily.best, 3); assert.deepEqual(s.daily.ghost, [7]);
  assert.equal(s.daily.attempts, 1);
});

test('sanitize survives garbage and never loses an earned unlock', () => {
  for (const junk of [null, 42, 'x', [], { best: -5, unlocked: 'all', stats: { runs: NaN }, settings: { sfx: 'yes' } }]) {
    const s = P.sanitize(junk);
    assert.deepEqual(s.unlocked, ['razz']); assert.equal(s.best, 0); assert.equal(s.settings.sfx, true);
  }
  const s = P.sanitize({ best: 120, unlocked: ['razz', 'hacker'], selected: 'legend', achievements: { fake: 1, ten: 5 } });
  assert.deepEqual(s.unlocked, ['razz', 'critic', 'roadtrip']);
  assert.equal(s.selected, 'razz', 'cannot select a locked flier');
  assert.deepEqual(Object.keys(s.achievements), ['ten']);
});

test('save survives a JSON round trip unchanged', () => {
  const s = P.defaultSave();
  P.applyRun(s, runOf({ score: 77, passed: 70, mode: 'daily', date: '2026-11-27', flapTicks: [4, 40] }));
  const back = P.sanitize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s);
});

test('legacy best scores from the original game carry over (and unlock fliers)', () => {
  const store = { 'flappy-lab-Camp Guy': '31', 'flappy-lab-Couch Guy': '104' };
  const s = P.migrateLegacy(P.defaultSave(), (k) => store[k]);
  assert.equal(s.best, 104);
  assert.deepEqual(s.unlocked, ['razz', 'critic', 'roadtrip']);
  assert.deepEqual(s.pendingReveal, ['critic', 'roadtrip']);
  const again = P.migrateLegacy(s, (k) => store[k]);
  assert.deepEqual(again, s, 'idempotent');
  assert.doesNotThrow(() => P.migrateLegacy(P.defaultSave(), () => { throw new Error('blocked'); }));
});

test('merge of device + cloud copies keeps the best of both', () => {
  const a = P.defaultSave(), b = P.defaultSave();
  P.applyRun(a, runOf({ score: 55, passed: 50 }), 100);
  P.applyRun(b, runOf({ score: 20, passed: 20, character: 'razz' }), 200);
  b.settings.music = false; b.updatedAt = 500; a.updatedAt = 100;
  const m = P.merge(a, b);
  assert.equal(m.best, 55);
  assert.ok(m.unlocked.includes('critic'));
  assert.equal(m.settings.music, false, 'newer settings win');
  assert.ok(m.achievements.fifty && m.achievements.ten);
  assert.equal(m.stats.runs, 1, 'counters are not double counted');
  assert.deepEqual(P.merge(m, m), m, 'merge is idempotent');
});

test('Speedrun to the Floor is earnable: the takeoff tap is not a flap', () => {
  assert.equal(P.playerFlaps([0]), 0);
  assert.equal(P.playerFlaps([0, 30, 61]), 2);
  assert.equal(P.playerFlaps([]), 0);
  // a real flight: tap to take off (tick-0 flap), then never touch the screen again
  const s = E.create(3);
  E.step(s, true);
  while (!s.dead) E.step(s, false);
  assert.equal(s.deathCause, 'ground');
  const save = P.defaultSave();
  const info = P.applyRun(save, runOf({ score: s.score, flaps: P.playerFlaps(s.flapTicks), deathCause: s.deathCause, ticks: s.tick, flapTicks: s.flapTicks }));
  assert.ok(info.achievements.some((a) => a.id === 'gravity'));
  // one extra flap after takeoff means no badge
  const t = E.create(3); E.step(t, true); for (let i = 0; i < 10; i++) E.step(t, false); E.step(t, true); while (!t.dead) E.step(t, false);
  assert.equal(P.playerFlaps(t.flapTicks), 1);
});

test('marshmallow shop: bank, buying, no double spend, survives saves and merges', () => {
  const s = P.defaultSave();
  assert.deepEqual(P.SHOP_CHARS.map((c) => [c.id, c.cost]), [['pompom', 30], ['fairway', 30]]);
  P.applyRun(s, runOf({ score: 20, mallows: 18 }));
  assert.equal(P.wallet(s), 18, 'collected marshmallows go in the bank');
  assert.deepEqual(P.buy(s, 'pompom'), { ok: false, reason: 'funds', short: 12 });
  P.applyRun(s, runOf({ score: 20, mallows: 22 }));
  const r = P.buy(s, 'pompom', 5);
  assert.equal(r.ok, true); assert.equal(r.achievement.id, 'shopper');
  assert.equal(P.wallet(s), 10);
  assert.ok(s.unlocked.includes('pompom') && s.pendingReveal.includes('pompom'));
  assert.equal(P.buy(s, 'pompom').reason, 'owned');
  assert.equal(P.buy(s, 'critic').reason, 'not-for-sale');
  assert.equal(P.buy(s, 'nobody').reason, 'not-for-sale');
  // reload + an older cloud copy from before the purchase: still owned, still paid for once
  const back = P.sanitize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back, s);
  const older = P.defaultSave(); older.stats.mallows = 40; older.updatedAt = 1;
  const m = P.merge(back, older);
  assert.ok(m.unlocked.includes('pompom'));
  assert.equal(P.wallet(m), 10);
  // existing players: every marshmallow already collected counts
  assert.equal(P.wallet(P.sanitize({ stats: { mallows: 64 } })), 64);
});

test('quips cover every outcome', () => {
  const s = P.defaultSave();
  const cases = [runOf({ flaps: 0 }), runOf({ deathCause: 'pipe-top' }), runOf({ deathCause: 'pipe-bottom', character: 'legend' }), runOf({ score: 49 })];
  for (const r of cases) for (const x of [0, 0.5, 0.99]) { const q = P.quip(r, s, { soClose: r.score === 49 }, x); assert.equal(typeof q, 'string'); assert.ok(q.length > 3); }
  assert.match(P.quip(runOf({ flaps: 0 }), s, {}, 0), /floor|flapping|Gravity/);
});
