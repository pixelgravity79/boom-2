<!-- Grok reply, pasted back by the user in chat on 2026-11-28. Model and settings chosen in the Grok app; not verifiable from here. -->
reviewer: grok
round: 1
ran-it: yes

### F1 landingSpot ignores documented LOG_TOLERANCE
- severity: medium
- area: gameplay
- file: src/sim/world.js:38
- problem: The check is `Math.abs(local) > half + C.LOG_TOLERANCE - 0.2`. With LOG_TOLERANCE=0.3 this rejects anything beyond half+0.1. A landing at a log end +0.15–0.25 (common with float drift, log motion during HOP_TIME, or mobile touch offset) returns null and splashes. The constant no longer matches its comment or the value in config.js.
- fix: Change the line to `if (Math.abs(local) > half + C.LOG_TOLERANCE) continue;` (or raise LOG_TOLERANCE to 0.5 and keep the offset if the -0.2 was intentional for slot overlap). Re-run the log-gap tests.
- confidence: high

### F2 hop-off-log clamp is only applied for pure forward/back
- severity: medium
- area: gameplay
- file: src/sim/game.js:148-151 (startHop non-river branch)
- problem: `if (p.log && dx === 0) tx = clamp(tx, C.COL_MIN, C.COL_MAX)` only runs for dr≠0. A sideways hop (or a hop whose rounded column falls outside) from a log that has drifted to |x|≈4.4–4.7 bumps even when the nearest legal column is free. Combined with SWEPT_X=4.95 this creates a narrow “must hop exactly forward in the last 0.1 tile” window on the edge.
- fix: Always compute the candidate column first, then `tx = clamp(Math.round(fx + dx), C.COL_MIN, C.COL_MAX)` when `p.log` is set, and only bump if the clamped column is blocked or the river landingSpot fails. Keep the existing `|want| > COL_MAX+0.5` early-out for pure sideways river hops.
- confidence: high

### F3 mid-hop hazard uses rEff switch at k=0.5
- severity: medium
- area: gameplay
- file: src/sim/game.js:91-96 (pos) and 172-180 (checkHazards)
- problem: Origin-lane vehicles/trains are only tested while k<0.5; destination-lane hazards only after. A train that enters the destination column at k=0.4 is ignored until the switch, then can kill on the next step (or be clipped if the train’s pass window is short). The same window exists for cars. On a phone the 0.135 s hop makes the exact frame non-deterministic under frame-time jitter.
- fix: While `p.hop` is set, call checkHazards against both `h.fr` and `h.tr` (or against the continuous interpolated x on both lanes). Die on the first hit. This removes the clipping window without changing feel.
- confidence: high

### F4 vehicleAt / landingSpot called on every step while on road/rail
- severity: low
- area: performance
- file: src/sim/game.js:167 (checkHazards) and src/sim/world.js:24-29, 32-50
- problem: At 120 Hz a road with 8–12 movers does \~1000 abs comparisons per second; landingSpot does a linear scan on every river hop. Negligible on desktop, measurable on low-end Android when many lanes are live and the bot or a replay is also running. No early-out or spatial structure.
- fix: In vehicleAt sort movers by x0 once per lane (or keep them sorted at gen time) and binary-search the overlapping range; early-return on first hit. In landingSpot the same sort lets you skip logs whose center is > half+LOG_TOLERANCE away. Cache the current lane pointer inside step() so pos()/checkHazards do not re-lookup.
- confidence: medium

### F5 HOP_TIME / EAGLE_MARGIN / LOG_TOLERANCE slightly tight for touch
- severity: medium
- area: mobile
- file: src/sim/config.js:10, 14, 18
- problem: HOP_TIME=0.135 s is snappy but the face/beanie squash is hard to read on a 6" screen and leaves little margin for touch latency or 60 Hz frame drops. EAGLE_MARGIN=3.4 at the starting autoScroll of 0.36 rows/s is only \~9 s of lag; a single missed swipe or notification banner can end the run. Effective log tolerance (see F1) is 0.1 tile.
- fix: HOP_TIME = 0.16; LOG_TOLERANCE = 0.45 (after removing the -0.2); EAGLE_MARGIN = 4.2; leave QUEUE_MAX=2 and the autoScroll ramp unchanged (0.36→0.74 is fine). These values keep the arcade pace while giving touch input and the face animation breathing room.
- confidence: medium

## Tests
```js
// paste into tests/sim.test.js

test('log end + 0.25 still lands (LOG_TOLERANCE)', () => {
  const lane = { type: 'river', dir: 1, speed: 0, movers: [{ x0: 0, len: 3, kind: 'log' }] };
  // half = 1.5; half + 0.3 = 1.8 should be accepted
  const s = landingSpot(lane, 1.75, 0);
  assert(s && s.log, 'expected landing at 1.75, got ' + JSON.stringify(s));
});

test('hop forward off a log that has drifted past COL_MAX lands on edge column', () => {
  const g = custom({
    1: { type: 'river', dir: 1, speed: 0, movers: [{ x0: 4.65, len: 2, kind: 'log' }] }
  });
  // force a landing on the high log (adjust x0 if needed so want falls inside)
  g.input('f');
  stepFor(g, C.HOP_TIME + 0.02);
  assert(g.p.log, 'failed to land on log');
  // drift or set position near edge
  g.p.x = 4.7;
  g.input('f');
  stepFor(g, C.HOP_TIME + 0.02);
  assert(g.state === 'playing' && g.p.r === 2 && g.p.x === C.COL_MAX,
         `expected land at col \( {C.COL_MAX}, got r= \){g.p.r} x=\( {g.p.x} state= \){g.state}`);
});
```
