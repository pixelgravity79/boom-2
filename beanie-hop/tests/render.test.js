// Render-side unit tests that don't need WebGL. Run: node tests/render.test.js
import { springStep } from '../src/render/spring.js';
let pass = 0, fail = 0;
const test = (n, f) => { try { f(); pass++; console.log('  ok   ' + n); } catch (e) { fail++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
console.log('spring');
test('stays stable and settles at any frame rate (10-240 fps), even with big kicks', () => {
  for (const fps of [10, 12, 17, 24, 30, 60, 120, 240]) {
    const s = { v: 1, vel: 0 };
    for (let f = 0; f < fps * 4; f++) {
      if (f % Math.max(1, Math.round(fps / 6)) === 0) s.vel += f % 2 ? 3.2 : -3.2; // hop/land kicks several times a second
      springStep(s, 1, 380, 18, 1 / fps, 0.55, 1.45);
      assert(Number.isFinite(s.v) && s.v >= 0.55 && s.v <= 1.45, `fps ${fps}: v=${s.v}`);
    }
    for (let f = 0; f < fps * 2; f++) springStep(s, 1, 380, 18, 1 / fps, 0.55, 1.45);
    assert(Math.abs(s.v - 1) < 0.01, `fps ${fps}: did not settle (${s.v})`);
  }
});
test('a long stall (tab switch) cannot blow it up', () => {
  const s = { v: 1.3, vel: 40 };
  springStep(s, 1, 380, 18, 5, 0.55, 1.45);        // only 0.1 s is simulated, and the clamp holds
  assert(Number.isFinite(s.v) && s.v >= 0.55 && s.v <= 1.45, 'v=' + s.v);
  const t = { v: NaN, vel: 1 };
  springStep(t, 1, 380, 18, 1 / 60);
  assert(t.v === 1 && t.vel === 0, 'NaN not recovered');
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
