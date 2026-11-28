// Simulation tests: determinism, generator guarantees, rules, and a bot fairness run.
// Run: node tests/sim.test.js            (add --quick to skip the long bot run)
import * as C from '../src/sim/config.js';
import { World, moverX, trainState, wrapX, landingSpot } from '../src/sim/world.js';
import { Game } from '../src/sim/game.js';
import { autoplay } from '../src/sim/bot.js';

const quick = process.argv.includes('--quick');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

function stepFor(g, secs) { const n = Math.round(secs / C.DT); for (let i = 0; i < n; i++) g.step(C.DT); }

// A world whose first rows are hand-made, for rule tests
function custom(lanes, seed = 1) {
  const w = new World(seed);
  w.ensure(C.BACK_LIMIT - 1);
  const base = (row) => ({ row, type: 'grass', d: 0, blocked: new Set(), decor: [], movers: [], dir: 1, speed: 0, pads: null, train: null, coins: [] });
  for (let row = C.BACK_LIMIT; row < 40; row++) w.lanes.set(row, { ...base(row), ...(lanes[row] || {}) });
  w.nextRow = 40;
  w.pathCol = 0;
  return new Game(seed, w);
}

console.log('determinism');
test('same seed, same world', () => {
  const a = new World(1234), b = new World(1234);
  for (let r = 0; r < 600; r++) {
    const la = a.lane(r), lb = b.lane(r);
    assert(la.type === lb.type, 'type differs at ' + r);
    assert(JSON.stringify(la.movers) === JSON.stringify(lb.movers), 'movers differ at ' + r);
    assert([...la.blocked].join() === [...lb.blocked].join(), 'trees differ at ' + r);
  }
});
test('different seeds, different worlds', () => {
  const a = new World(1), b = new World(2);
  let diff = 0;
  for (let r = 0; r < 200; r++) if (a.lane(r).type !== b.lane(r).type) diff++;
  assert(diff > 20, 'only ' + diff + ' differing rows');
});
test('wrapX stays in range', () => {
  for (const x of [-100, -17, -16.99, 0, 16.99, 17, 33.5, 1000]) { const v = wrapX(x); assert(v >= -C.WRAP && v < C.WRAP, x + ' -> ' + v); }
});

console.log('generator guarantees (300 seeds x 700 rows)');
const SEEDS = quick ? 60 : 300, ROWS = 700;
const stats = { grass: 0, road: 0, river: 0, rail: 0 };
test('start area is safe grass', () => {
  for (let s = 0; s < SEEDS; s++) {
    const w = new World(s);
    for (let r = 0; r <= C.START_SAFE_ROWS; r++) assert(w.lane(r).type === 'grass', 'seed ' + s + ' row ' + r);
    assert(!w.lane(0).blocked.has(0), 'start tile blocked');
  }
});
test('a static path always exists (trees, lily pads) from the start to row ' + ROWS, () => {
  for (let s = 0; s < SEEDS; s++) {
    const w = new World(s);
    let reach = new Set([0]);
    for (let r = 1; r < ROWS; r++) {
      const lane = w.lane(r);
      stats[lane.type]++;
      const ok = (x) => x >= C.COL_MIN && x <= C.COL_MAX && (lane.type !== 'grass' || !lane.blocked.has(x)) && (!lane.pads || lane.pads.has(x));
      // forward from any reachable column, then sideways along open tiles (not on pads: you can't walk on water)
      let next = new Set([...reach].filter(ok));
      if (lane.type !== 'river' || !lane.pads) {
        const all = lane.type === 'river' ? null : true;
        if (all) {
          let grew = true;
          while (grew) { grew = false; for (const x of [...next]) for (const nx of [x - 1, x + 1]) if (ok(nx) && !next.has(nx)) { next.add(nx); grew = true; } }
        } else { // log lane: logs sweep every column, so anything is reachable
          next = new Set(); for (let x = C.COL_MIN; x <= C.COL_MAX; x++) next.add(x);
        }
      }
      assert(next.size > 0, 'seed ' + s + ': dead end at row ' + r + ' (' + lane.type + ')');
      reach = next;
    }
  }
});
test('road gaps always leave a crossing window', () => {
  for (let s = 0; s < SEEDS; s++) {
    const w = new World(s);
    for (let r = 0; r < ROWS; r++) {
      const l = w.lane(r);
      if (l.type !== 'road') continue;
      const xs = l.movers.map((m) => ({ a: moverX(l, m, 0) - m.len / 2, b: moverX(l, m, 0) + m.len / 2 })).sort((p, q) => p.a - q.a);
      for (let i = 0; i < xs.length; i++) {
        const nxt = xs[(i + 1) % xs.length];
        let gap = nxt.a - xs[i].b;
        if (i === xs.length - 1) gap += C.LOOP;
        if (xs.length === 1) gap = C.LOOP - (xs[0].b - xs[0].a);
        assert(gap >= l.minGap - 1e-6, `seed ${s} row ${r}: gap ${gap.toFixed(2)} < ${l.minGap.toFixed(2)}`);
        const window = (gap - 2 * C.PLAYER_HALF) / l.speed;
        assert(window >= 0.38, `seed ${s} row ${r}: crossing window ${window.toFixed(2)}s`);
      }
    }
  }
});
test('log gaps are jumpable-to (never a long empty stretch)', () => {
  for (let s = 0; s < SEEDS; s++) {
    const w = new World(s);
    for (let r = 0; r < ROWS; r++) {
      const l = w.lane(r);
      if (l.type !== 'river' || l.pads) continue;
      const xs = l.movers.map((m) => ({ a: moverX(l, m, 0) - m.len / 2, b: moverX(l, m, 0) + m.len / 2 })).sort((p, q) => p.a - q.a);
      for (let i = 0; i < xs.length; i++) {
        let gap = (i === xs.length - 1 ? xs[0].a + C.LOOP : xs[i + 1].a) - xs[i].b;
        assert(gap > 0.5 && gap < 4.4, `seed ${s} row ${r}: log gap ${gap.toFixed(2)}`);
      }
    }
  }
});
test('lily pad rows contain the path column and never stack', () => {
  for (let s = 0; s < SEEDS; s++) {
    const w = new World(s);
    for (let r = 1; r < ROWS; r++) {
      const l = w.lane(r);
      if (!l.pads) continue;
      assert(l.pads.has(l.path), `seed ${s} row ${r}`);
      assert(!w.lane(r - 1).pads, `seed ${s} row ${r}: two pad rows in a row`);
    }
  }
});
test('trains never overlap themselves and always warn first', () => {
  for (let s = 0; s < 80; s++) {
    const w = new World(s);
    for (let r = 0; r < ROWS; r++) {
      const l = w.lane(r);
      if (l.type !== 'rail') continue;
      assert(l.train.pass + l.train.warn < l.train.period && l.train.warn >= C.TRAIN_WARN, `seed ${s} row ${r}`);
      const arrive = l.train.phase + l.train.period * 3;
      assert(trainState(l, arrive - 0.5).warn && !trainState(l, arrive - 0.5).active, 'no warning');
      assert(trainState(l, arrive + 0.3).active, 'not active');
    }
  }
});
console.log('       lane mix:', JSON.stringify(stats));

console.log('rules');
test('hop forward moves one row toward the camera and scores', () => {
  const g = custom({});
  assert(g.input('f'));
  assert(g.state === 'playing');
  stepFor(g, C.HOP_TIME / 2);
  assert(g.p.hop && g.pos().y > 0.3, 'mid-air');
  stepFor(g, C.HOP_TIME);
  assert(g.p.r === 1 && g.score === 1 && !g.p.hop);
});
test('trees and the edge block moves (bump, no move)', () => {
  const g = custom({ 1: { blocked: new Set([0]) } });
  g.input('f'); stepFor(g, 0.3);
  assert(g.p.r === 0, 'walked into a tree');
  for (let i = 0; i < 6; i++) { g.input('r'); stepFor(g, 0.25); }
  assert(g.p.x === C.COL_MAX, 'went past the edge: ' + g.p.x);
});
test('cannot walk behind the tree wall', () => {
  const g = custom({});
  for (let i = 0; i < 6; i++) { g.input('b'); stepFor(g, 0.2); }
  assert(g.p.r === C.BACK_LIMIT, 'r=' + g.p.r);
});
test('input buffer holds two moves', () => {
  const g = custom({});
  assert(g.input('f') && g.input('f') && !g.input('f'));
  stepFor(g, C.HOP_TIME * 2 + 0.05);
  assert(g.p.r === 2, 'r=' + g.p.r);
});
test('a car kills', () => {
  const g = custom({ 1: { type: 'road', dir: 1, speed: 2, movers: [{ x0: -3, len: 1.45, kind: 'car', color: 0 }] } });
  g.input('f'); stepFor(g, 2);
  assert(g.state === 'dead' && g.death.kind === 'car', 'state ' + g.state);
});
test('you can cross a road between cars', () => {
  const g = custom({ 1: { type: 'road', dir: 1, speed: 2, movers: [{ x0: -8, len: 1.45, kind: 'car', color: 0 }] } });
  g.input('f'); g.input('f'); stepFor(g, 0.5);
  assert(g.state === 'playing' && g.p.r === 2);
});
test('water without a log splashes', () => {
  const g = custom({ 1: { type: 'river', dir: 1, speed: 1, movers: [{ x0: 8, len: 3, kind: 'log' }] } });
  g.input('f'); stepFor(g, 0.3);
  assert(g.state === 'dead' && g.death.kind === 'splash');
});
test('logs carry you, and sweep you off the edge', () => {
  const g = custom({ 1: { type: 'river', dir: 1, speed: 1.5, movers: [{ x0: 0, len: 3, kind: 'log' }] } });
  g.input('f'); stepFor(g, 0.2);
  assert(g.state === 'playing' && g.p.log, 'not on log');
  const x0 = g.pos().x;
  stepFor(g, 1);
  assert(near(g.pos().x - x0, 1.5, 0.02), 'drift ' + (g.pos().x - x0));
  stepFor(g, 6);
  assert(g.state === 'dead' && g.death.kind === 'swept', g.state);
});
test('landing on a log snaps to a slot; hopping off rounds to a column', () => {
  const g = custom({ 1: { type: 'river', dir: 1, speed: 0.001, movers: [{ x0: 0.3, len: 3, kind: 'log' }] } });
  g.input('f'); stepFor(g, 0.2);
  assert(near(g.pos().x, 0.3, 0.01), 'x ' + g.pos().x);
  g.input('f'); stepFor(g, 0.2);
  assert(g.p.r === 2 && g.p.x === 0, 'x ' + g.p.x);
});
test('lily pads hold, open water next to them does not', () => {
  const g = custom({ 1: { type: 'river', pads: new Set([0]), speed: 0 } });
  g.input('f'); stepFor(g, 0.2);
  assert(g.state === 'playing' && g.p.r === 1);
  g.input('r'); stepFor(g, 0.2);
  assert(g.state === 'dead' && g.death.kind === 'splash');
});
test('trains kill on the tracks', () => {
  const g = custom({ 1: { type: 'rail', dir: 1, train: { cars: 2, speed: 25, len: 10, period: 6, phase: 0.5, pass: (2 * C.TRAIN_START + 10) / 25 } } });
  g.input('f'); stepFor(g, 2.5);
  assert(g.state === 'dead' && g.death.kind === 'train', g.state);
});
test('standing still too long brings the eagle', () => {
  const g = custom({});
  g.input('f'); stepFor(g, 4);
  assert(g.state === 'playing', 'died too early');
  stepFor(g, 12);
  assert(g.state === 'dead' && g.death.kind === 'eagle', g.state);
});
test('corn is collected once', () => {
  const g = custom({ 1: { coins: [0] } });
  g.input('f'); stepFor(g, 0.2); g.input('b'); stepFor(g, 0.2); g.input('f'); stepFor(g, 0.2);
  assert(g.corn === 1, 'corn ' + g.corn);
});
test('clone is independent', () => {
  const g = custom({});
  g.input('f'); stepFor(g, 0.05);
  const h = g.clone(); stepFor(h, 0.3); h.input('f'); stepFor(h, 0.3);
  assert(h.p.r === 2 && g.p.r === 0 && g.p.hop, 'clone leaked');
});

console.log('round 1 review regressions (ChatGPT, Grok)');
// ChatGPT F3
test('a queued hop cannot escape the swept boundary', () => {
  const g = custom({ 1: { type: 'river', speed: 1, dir: 1, movers: [{ x0: 4.945, len: 3, kind: 'log' }] } });
  g.state = 'playing'; g.p.r = 1; g.p.x = 4.945; g.p.log = { i: 0, off: 0 };
  g.input('f');
  g.step(C.DT);
  assert(g.state === 'dead' && g.death.kind === 'swept', g.state);
});
// ChatGPT F5
test('decorative lily pads outside the playfield cannot be landed on', () => {
  const g = custom({ 0: { type: 'river', speed: 0, movers: [{ x0: 4.7, len: 3, kind: 'log' }] }, 1: { type: 'river', pads: new Set([0, 5]) } });
  g.state = 'playing'; g.p.log = { i: 0, off: 0 };
  g.input('f');
  stepFor(g, 0.2);
  assert(g.state === 'dead' && g.death.kind === 'splash', g.state);
});
test('generated scenery pads are kept apart from playable ones', () => {
  for (let s = 0; s < 40; s++) {
    const w = new World(s);
    for (let r = 0; r < 300; r++) {
      const l = w.lane(r);
      if (l.pads) for (const x of l.pads) assert(x >= C.COL_MIN && x <= C.COL_MAX, `seed ${s} row ${r}: playable pad at ${x}`);
    }
  }
});
// ChatGPT F6
test('a fatal landing awards neither corn nor score', () => {
  const g = custom({ 1: { type: 'road', dir: 1, speed: 2, movers: [{ x0: -1.295, len: 1.45, kind: 'car' }], coins: [0] } });
  g.input('f');
  stepFor(g, 0.2);
  assert(g.state === 'dead' && g.death.kind === 'car', g.state);
  assert(g.corn === 0 && g.score === 0, `corn ${g.corn} score ${g.score}`);
  assert(!g.events.some((e) => e.type === 'coin' || e.type === 'land'), 'reward events emitted');
});
// ChatGPT F9
test('invalid and inherited direction names are rejected', () => {
  const g = custom({});
  for (const dir of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'invalid', null, undefined, 3]) assert(!g.input(dir), String(dir));
  assert(g.queue.length === 0 && g.state === 'ready');
});
test('a correction replaces the stale buffered move when the buffer is full', () => {
  const g = custom({});
  g.input('f'); g.input('f');
  assert(g.input('r') && g.queue.map((q) => q.dir).join() === 'f,r', JSON.stringify(g.queue));
  stepFor(g, C.HOP_TIME * 2 + 0.05);
  assert(g.p.r === 1 && g.p.x === 1, `r ${g.p.r} x ${g.p.x}`);
});
test('stale buffered moves expire', () => {
  const g = custom({});
  g.input('f');
  g.queue[0].t -= 1;
  stepFor(g, 0.3);
  assert(g.p.r === 0, 'an expired move was still executed');
});
// ChatGPT F2
test('runs of dangerous rows respect the difficulty cap', () => {
  for (let seed = 0; seed < (quick ? 60 : 300); seed++) {
    const w = new World(seed);
    let streak = 0;
    for (let row = 0; row < 700; row++) {
      streak = w.lane(row).type === 'grass' ? 0 : streak + 1;
      assert(streak <= C.hazardCap(row), `seed ${seed}, row ${row}: ${streak} dangerous rows in a row`);
    }
  }
});
// ChatGPT test: determinism
test('seeded replay produces an identical game', () => {
  const a = new Game(12345), b = new Game(12345);
  const inputs = new Map([[0, 'f'], [20, 'f'], [40, 'r'], [60, 'f'], [90, 'l'], [120, 'f']]);
  for (let tick = 0; tick < 600; tick++) {
    if (inputs.has(tick)) { a.input(inputs.get(tick)); b.input(inputs.get(tick)); }
    a.step(C.DT); b.step(C.DT);
    assert(a.state === b.state && a.score === b.score && a.corn === b.corn, 'diverged at ' + tick);
    assert(near(a.cam, b.cam) && near(a.pos().x, b.pos().x) && near(a.pos().r, b.pos().r), 'diverged at ' + tick);
  }
});
// ChatGPT F4 / Grok F3
test('mid-hop: a car you have already cleared does not kill you', () => {
  // car (speed 10) reaches x=0 in row 1 only when the hop to row 2 is ~80% done
  const g = custom({ 1: { type: 'road', dir: 1, speed: 10, movers: [{ x0: -12, len: 1.45, kind: 'car' }] } });
  g.state = 'playing'; g.p.r = 1;
  g.t = (-(1.005 + 10 * C.HOP_TIME * 0.8) + 12) / 10;   // so the car arrives 0.8 of a hop after we jump
  g.input('f');
  stepFor(g, 0.3);
  assert(g.state === 'playing' && g.p.r === 2, g.state + (g.death ? ' ' + g.death.kind : ''));
});
test('mid-hop: a car in the lane you are jumping into kills you before you land', () => {
  const g = custom({ 1: { type: 'road', dir: 1, speed: 0.001, movers: [{ x0: 0, len: 1.45, kind: 'car' }] } });
  g.input('f');
  stepFor(g, 0.3);
  assert(g.state === 'dead' && g.death.kind === 'car' && g.death.r === 1, g.state);
  assert(g.death.t < C.HOP_TIME, 'only died on landing');
});
test('hops land on an exact tick', () => {
  const g = custom({});
  g.input('f');
  g.step(C.DT);                                   // the buffered move starts on the next step
  assert(g.p.hop, 'hop did not start');
  for (let i = 0; i < C.HOP_TICKS - 1; i++) g.step(C.DT);
  assert(g.p.hop, 'landed early');
  g.step(C.DT);
  assert(!g.p.hop && g.p.r === 1, 'did not land on tick ' + C.HOP_TICKS);
});
// ChatGPT F8
test('the eagle circles (warning event) before it strikes', () => {
  const g = custom({});
  g.input('f');
  const seen = [];
  for (let i = 0; i < 120 * 30 && g.state === 'playing'; i++) { g.step(C.DT); seen.push(...g.drainEvents()); }
  const warn = seen.findIndex((e) => e.type === 'eagleWarn'), death = seen.findIndex((e) => e.type === 'death' && e.kind === 'eagle');
  assert(warn >= 0 && death > warn, `warn ${warn} death ${death}`);
});
// Grok F1 / ChatGPT F11
test('a landing 0.25 past a log end still holds (documented tolerance)', () => {
  const lane = { type: 'river', dir: 1, speed: 0, movers: [{ x0: 0, len: 3, kind: 'log' }] };
  const s = landingSpot(lane, 1.75, 0);
  assert(s && s.log, 'expected landing at 1.75, got ' + JSON.stringify(s));
  assert(!landingSpot(lane, 1.85, 0), '0.35 past the end should splash');
});
// Grok F2 (its test corrected: start on the log, the original jumped into water before reaching it)
test('hopping forward off a log that drifted past the edge lands on the edge column', () => {
  const g = custom({ 1: { type: 'river', dir: 1, speed: 0, movers: [{ x0: 4.2, len: 2, kind: 'log' }] } });
  g.state = 'playing'; g.p.r = 1; g.p.log = { i: 0, off: 0.5 };   // x = 4.7
  g.input('f');
  stepFor(g, C.HOP_TIME + 0.02);
  assert(g.state === 'playing' && g.p.r === 2 && g.p.x === C.COL_MAX, `r=${g.p.r} x=${g.p.x} state=${g.state}`);
});

console.log('bot fairness');
test('the bot gets deep into most seeds', () => {
  const n = quick ? 4 : 12, target = quick ? 60 : 160;
  const res = [];
  const t0 = Date.now();
  for (let s = 0; s < n; s++) res.push(autoplay(new Game(1000 + s), { maxRows: target }));
  const made = res.filter((r) => r.score >= target).length;
  console.log('       ' + res.map((r) => r.score + (r.kind ? '/' + r.kind : '')).join('  ') + `   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  assert(made >= Math.ceil(n * 0.75), `only ${made}/${n} reached row ${target}`);
});
if (!quick) test('acceptance (ChatGPT F13): the bot reaches row 150 on at least 95 of 100 seeds', () => {
  const t0 = Date.now();
  const res = [];
  for (let s = 0; s < 100; s++) res.push(autoplay(new Game(5000 + s), { maxRows: 150 }));
  const made = res.filter((r) => r.score >= 150).length;
  console.log(`       ${made}/100 reached row 150 (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  assert(made >= 95, `only ${made}/100`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
