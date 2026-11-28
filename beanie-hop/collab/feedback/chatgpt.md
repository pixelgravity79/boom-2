<!-- ChatGPT reply, pasted back by the user as a file on 2026-11-28. Model and settings chosen in the ChatGPT app; not verifiable from here. -->
reviewer: chatgpt
round: 1
ran-it: no

Execution scope and handoff clarification: This file consolidates the preceding chat review, including its proposed changes and regression tests. The earlier chat response claimed local execution and reported sample statistics; I cannot substantiate those runs from the available tool record, so treat those numerical observations as unverified until rerun. The findings below are based on the supplied source code. No live repository changes, renderer execution, or mobile browser testing are claimed. Line references are approximate anchors to the pasted source and should be checked against the current branch.

Project: Beanie Hop, an original voxel lane-hopping browser game featuring a real man's photo as the chicken's head. This is the new chicken game, not the earlier Flappy Bird project. Repository: `pixelgravity79/boom-2`, branch `ccr-436599e2-f8j3sd`, directory `beanie-hop/`. Claude Code is the lead developer and integrator; Gemini and Grok are independent reviewers. Reconcile this review with theirs, verify the findings against the current code, implement appropriate changes, and run regression and mobile browser tests before declaring completion. The repository remains the source of truth.

### F1 Reverse the forward direction without sacrificing the face
- severity: high
- area: mobile
- file: collab/STATUS.md:54, src/render/chicken.js:129–139
- problem: I disagree with making forward movement go down the screen merely to show the man's face. It compromises conventional lane-hopping controls, and approaching hazards may be obscured by foreground geometry. The current head only turns toward the camera after 0.3 seconds of inactivity, so continuous sideways or backward hopping can hide the face.
- fix: Prototype a conventional upward-moving version with independently controlled head and body orientation.
  - Keep simulation coordinates unchanged; change camera orientation and input projection so forward moves upward. Verify left/right mapping using projected world axes rather than assuming the existing signs still work.
  - Position the chicken approximately 68% down the usable screen; preview at least five upcoming lanes.
  - Keep the head facing the camera, with a maximum directional deviation of 25 degrees. Let the body, wings and feet communicate movement direction. Treat the backwards-looking chicken as intentional comedy.
  - Use `1 - Math.exp(-18 * dt)` for head rotation smoothing. Compute a camera-facing yaw in world space and convert it to local head yaw relative to the root. If the head looks anatomically awkward, test a camera-facing stylized head mount.
  - A/B test both orientations with five new players, recording wrong-direction swipes, first-run scores and face recognisability. Do not force the change if the prototype performs worse.
- confidence: medium

### F2 Procedural generation permits excessively long hazard streaks
- severity: high
- area: gameplay
- file: src/sim/world.js:106–126 (`pickType`)
- problem: Individual segment lengths are limited but consecutive dangerous rows are not. Roads can transition into rivers, rivers into rails, etc., without a recovery lane. A static path does not prove dynamic survivability under camera pressure. The preceding review reported the following sample; these figures are retained for comparison, not verified measurements:

| Row range | Grass | Roads | Rivers | Rails | Longest hazard streak |
|---|---:|---:|---:|---:|---:|
| 4–19 | 48.2% | 37.8% | 12.6% | 1.4% | 8 |
| 20–59 | 50.7% | 26.1% | 16.9% | 6.3% | 9 |
| 60–149 | 42.5% | 29.7% | 19.6% | 8.1% | 18 |
| 150–249 | 29.1% | 37.3% | 22.0% | 11.5% | 30 |
| 250–399 | 22.2% | 41.7% | 25.0% | 11.1% | 47 |

  The earlier review identified seed 97, rows 222–268, as a candidate 47-row streak; reproduce before relying on that specific claim.
- fix: Track consecutive hazardous rows independently of `segLeft` and enforce maximums:

```js
const hazardCap = row < 20 ? 3
                : row < 60 ? 4
                : row < 150 ? 5
                : 7;
```

  Limit new segment lengths to the remaining hazard budget. When exhausted, force 1–2 grass rows. After three consecutive river rows, force a grass recovery lane. Target about 30–35% grass at high difficulty rather than allowing it to fall toward 20%. Ensure segment state remains consistent when interrupted.
- confidence: high (structural issue); sample figures unverified

### F3 Buffered movement bypasses the swept-log death boundary
- severity: high
- area: gameplay
- file: src/sim/game.js:67–74 (`step`)
- problem: The next queued hop starts before the swept check. `startHop()` clears `p.log`, bypassing the check. Candidate reproduction: a chicken on a log at x = 4.945 moving outward at one tile/s reaches 4.9533 on the next tick (beyond the 4.95 death boundary), yet can initiate a forward hop before being checked.
- fix: Resolve current hazards before consuming buffered movement:

```js
if (p.log && !p.hop) {
  p.x = this.pos().x;
  if (Math.abs(p.x) > C.SWEPT_X) {
    return this.die('swept');
  }
}
this.checkHazards();
if (this.state !== 'playing') return;
if (!p.hop && this.queue.length && this.t >= p.bumpUntil) {
  this.startHop(this.queue.shift());
}
```

  Apply the same swept validation when establishing a new log attachment. Integrate with F6 so final landing and reward resolution happen before another hop begins.
- confidence: high

### F4 Mid-hop collision detection uses an artificial row boundary
- severity: high
- area: gameplay
- file: src/sim/game.js:54,151–159 (`pos`, `checkHazards`)
- problem: `rEff` switches abruptly from departure lane to destination lane at 50% hop progress. Vehicles in the other lane are ignored even when physical hitboxes overlap. This can produce visible collisions without death or seemingly disconnected deaths.
- fix: Use continuous longitudinal overlap detection; start with these dimensions, then match them to rendered models:

```js
export const PLAYER_HALF_R = 0.22;
export const ROAD_HALF_R = 0.37;
export const TRAIN_HALF_R = 0.43;
```

  Examine `Math.floor(pos.r)` and `Math.ceil(pos.r)`, deduplicating identical rows. For each hazardous lane require lateral and longitudinal overlap:

```js
const overlapsRow = Math.abs(pos.r - row) < C.PLAYER_HALF_R + hazardHalfR;
```

  Preserve existing x-axis checks. Do not make ordinary hops invincible simply because `pos.y` is positive. Preserve the actual continuous collision position in `death.r` and add a separate `hitRow` field. Update any renderer that expects the death row to be integral.
- confidence: high

### F5 Decorative lily pads are accidentally playable
- severity: high
- area: gameplay
- file: src/sim/world.js:27–30,215–221; src/sim/game.js:92–98 (`landingSpot`, `genRiver`, `startHop`)
- problem: Decorative lily pads outside the playable columns are stored in the same Set as playable pads. A forward hop from a drifting log does not enforce the column boundary. A chicken at x = 4.7 can potentially land on decorative pad x = 5 outside the nine-column playfield.
- fix: Separate scenery and playable pads:

```js
lane.pads = new Set([this.pathCol]);
lane.decorPads = new Set();
```

  Store scenery-only pads in `decorPads`. Enforce bounds in `landingSpot()`:

```js
if (lane.pads) {
  const col = Math.round(want);
  if (col < C.COL_MIN || col > C.COL_MAX) return null;
  return lane.pads.has(col) && Math.abs(want - col) <= 0.5
    ? { x: col, pad: col } : null;
}
```

  Ensure the renderer draws both collections, while the simulation and bot use only playable pads.
- confidence: high

### F6 Fatal landings can award corn and score
- severity: medium
- area: gameplay
- file: src/sim/game.js:67–74,121–148 (`step`, `land`)
- problem: `land()` awards corn and score before `checkHazards()` determines whether the landing was fatal. It may emit a successful landing event immediately before a death event.
- fix: Make landing resolution transactional: (1) resolve landing position and attachment, (2) check water, swept boundary and vehicle collisions, (3) return immediately if dead, (4) award corn and score, (5) emit successful landing, (6) consume next buffered input. Only score rows survived at landing. If scoring fatal rows is intentional, document it; corn and successful landing events should still require survival.
- confidence: high

### F7 Retune the difficulty curve for mobile players
- severity: high
- area: gameplay
- file: src/sim/config.js:26–28; src/sim/world.js:111–122,162,192–197,215–229,255–262 (`difficulty`, `autoScroll`, `pickType`, `genGrass`, `genRoad`, `genRiver`, `genRail`)
- problem: Row-linear difficulty compounds shorter windows, longer hazard sequences, faster logs, denser obstacles and eagle pressure. Elapsed playtime and row progression are not equivalent.
- fix: Keep row-based generation deterministic, but calibrate the early curve around a provisional target of 30–60 rows during a new player's first minute. Suggested anchors:

| Parameter | Row 0–20 | Row 60 | Row 150 | Row 320+ |
|---|---:|---:|---:|---:|
| Base road speed | 1.45 | 2.05 | 3.00 | 3.70 |
| Minimum road opening | 0.95s | 0.80s | 0.70s | 0.58s |
| Base log speed | 0.95 | 1.15 | 1.55 | 1.95 |
| Maximum road segment | 2 | 3 | 4 | 5 |
| Maximum river segment | 2 | 2 | 3 | 4 |
| Grass obstacle density | 10% | 15% | 22% | 28% |
| Lily pad probability | 40% | 32% | 24% | 18% |
| Camera creep | 0.28 | 0.38 | 0.52 | 0.65 |
| Maximum log gap | 2.8 | 3.1 | 3.6 | 4.0 |

  Interpolate between anchors. Make minimum road opening an explicit parameter:

```js
const minGap = 2 * C.PLAYER_HALF + speed * safeWindow;
```

  Retain speed variation but cap speedster lanes near 5.8 tiles/s. Rebalance circular road gaps rather than letting the closing gap become disproportionately large. Account for F4's longitudinal collision window when tuning. For trains use periods of 10–14 seconds early and 6.5–9 seconds late, with 1.5-second pre-spawn warning early and at least 1.25 seconds later. Ensure train `pass + warn < period`. For onboarding guarantee an unobstructed center column on rows 0–3 (current code only explicitly protects center on rows 0–1). Introduce first river around rows 10–14, first rail around rows 18–24, and disable speedsters until row 20. These are playtesting starting points, not measured human performance targets. Resolve the minor conflict between this table's creep anchors and F8's formula by using one shared tuning source. The earlier review reported 41 blocked center tiles among 1,200 start tiles, but that figure is unverified.
- confidence: medium

### F8 The eagle punishes legitimate waiting for hazards
- severity: high
- area: gameplay
- file: src/sim/config.js:20–28; src/sim/game.js:76–80
- problem: Camera position is simultaneously presentation state and a lethal timer. At row 150 the current stationary eagle allowance is approximately 4.9 seconds once the camera catches the player (`3.4 / 0.69`). That can punish legitimate waiting for platforms or trains. No simulation event signals the approaching eagle.
- fix: Separate gameplay pressure frontier from rendered camera position. Example tuning (or use consistent F7 anchors):

```js
const EAGLE_MARGIN = 4.4;
const EAGLE_WARN_MARGIN = 3.5;
const autoScroll = score => 0.28 + Math.min(0.37, score * 0.0016);
```

  Emit `eagleWarning` when crossing warning margin and `eagleWarningEnd` on recovery. Use a moving eagle shadow, increasing screech and subtle screen-edge effect. Keep the pressure frontier monotonic so moving backward cannot reset it. Let the presentation camera adapt independently to the viewport and upcoming hazards.
- confidence: high

### F9 The input buffer can make the game feel unresponsive
- severity: high
- area: mobile
- file: src/sim/game.js:39–44,69,112–118 (`input`, `step`, `bump`)
- problem: A full two-slot queue silently rejects corrections. Rapid forward taps followed by a sideways swipe may discard the avoidance move. Two pending moves represent roughly 280ms of movement commitment plus any remaining current hop or bump delay. Also `!C.DIRS[dir]` accepts inherited properties such as `toString`, which can subsequently cause invalid coordinates or a crash.
- fix: Keep two slots but implement directional correction and expiration:

```js
const OPPOSITE = { f: 'b', b: 'f', l: 'r', r: 'l' };
```

  Repeated forward taps may fill both slots. Opposite-direction input cancels stale pending opposite moves. If full and direction changes, replace the last pending input rather than dropping the correction. Expire pending inputs after 0.25 seconds of simulation time. Clear queue on pause, focus loss and restart. Ignore unintended keyboard auto-repeat at adapter level. Explicitly reject inherited direction names:

```js
if (this.state === 'dead' || !Object.hasOwn(C.DIRS, dir)) return false;
```

  Update clone logic, bot code and existing queue tests if moving from string entries to timestamped objects. Test that buffered corrective swipes do not cause unintended extra moves.
- confidence: high

### F10 Simulation clock undermines seeded replay determinism
- severity: medium
- area: code
- file: src/sim/game.js:63–65; src/sim/world.js:16
- problem: `step()` advances `t` while ready. If title screen integration calls it, waiting changes traffic and log phases, even with the same seed and same relative input sequence. Also the current hop duration is 16.2 fixed ticks, so landing resolution is later than the time used to predict river platforms.
- fix: Freeze simulation time outside playing:

```js
step(dt = C.DT) {
  if (this.state !== 'playing') return;
  this.t += dt;
  // Remaining logic.
}
```

  Use a separate rendering clock for title, menus and death animations. Pause freezes all gameplay time. Quantize hops to fixed ticks:

```js
export const HOP_TICKS = 17;
export const HOP_TIME = HOP_TICKS * DT;
```

  Prefer an integer simulation tick and explicit landing tick comparison rather than relying on floating-point `t >= t0 + dur`. Record seed, generator version, and input directions with simulation tick numbers for deterministic replays.
- confidence: high

### F11 Log landing tolerance is inconsistent with its documented value
- severity: medium
- area: gameplay
- file: src/sim/config.js:16; src/sim/world.js:36–41; src/sim/game.js:89–98,128–133
- problem: `LOG_TOLERANCE` is 0.3 but implementation subtracts 0.2, leaving an effective 0.1. Slot snapping can shift the chicken about 0.6 tiles from its intended destination (with the current effective tolerance); tick timing adds small corrections.
- fix: Remove the hidden subtraction and define intended tolerance explicitly:

```js
export const LOG_TOLERANCE = 0.15;
```

```js
if (Math.abs(local) > half + C.LOG_TOLERANCE) continue;
```

  Predict at the actual landing tick per F10. Preserve selected log identity through the hop rather than choosing another platform at the last instant. Render a subtle destination shadow in the latter half of the hop if helpful. Keep predictive river landing; the analytic approach is sound. Consider whether sideways hops should ever snap to a different log; explicitly test intended behavior and edge cases.
- confidence: high

### F12 The architecture is sound, but mutable state needs stronger boundaries
- severity: medium
- area: code
- file: src/sim/game.js:26–33,48–60,171–173; src/sim/world.js:69–104; src/sim/bot.js
- problem: Pure simulation, analytic mover positions, seeded generation and fixed steps are strong choices. Weak contracts: clones share mutable World and pruning; nested `hop.spot` remains shared; cosmetics consume the gameplay RNG stream; events grow unless drained; collected corn keys accumulate; `pos(t)` only evaluates the current movement state, not arbitrary history.
- fix: Preserve architecture, strengthen boundaries:

```text
Input adapter -> fixed-step simulation -> read-only render snapshot + drained events -> renderer/audio/UI
```

  Separate gameplay and cosmetic RNG streams; version generator output. Add an explicit event drain:

```js
drainEvents() {
  const events = this.events;
  this.events = [];
  return events;
}
```

  Treat generated lane definitions as immutable, including nested Sets/arrays by convention or encapsulation. Prevent renderer mutation or world pruning while clones need old rows. Deep-copy hop data if it is not immutable. Remove collected keys for permanently unreachable rows. Interpolate between previous and current render snapshots, not arbitrary `pos(t)` history. Keep fixed-step catch-up bounded and pause on tab visibility changes so a long mobile background interval does not kill the player.
- confidence: high

### F13 Existing fairness tests overstate what they prove
- severity: medium
- area: code
- file: tests/sim.test.js; src/sim/bot.js
- problem: The static route test treats log lanes as making every column reachable without considering timing, pressure or whether a player can reach a platform. The reported bot reaching row 160 on 10 of 12 seeds is encouraging but not a proof of dynamic fairness. The preceding review claimed no static failures in a 300-seed × 700-row sample; this is unverified here.
- fix: Introduce three validation layers: retain static connectivity; offline time-aware search with forward, sideways, backward and wait actions; weaker human-like bot with 150–250ms decision delay, limited lookahead and occasional mistakes. Measure success at rows 25, 60, 150, 300 and record failing seeds/segments. Proposed acceptance criteria: strong bot reaches row 150 in at least 95 of 100 seeds; no streak exceeds cap; no impossible segment found by sufficiently thorough temporal search (not a proof of universal solvability); weaker bot for comparative tuning only. Do not use the depth-three bot as sole authority on fairness.
- confidence: high

### F14 Make the face more readable without enlarging the entire chicken
- severity: medium
- area: visuals
- file: src/render/chicken.js:8–12,65–68,129–139
- problem: Photo face is the central joke. On a 390px phone showing nine columns, head width projects to approximately 36px before margins and camera angle, assuming equal horizontal tile projection. Enlarging the entire chicken obscures hazards and makes hitboxes appear inaccurate.
- fix: Test HEAD_W 0.76 -> 0.84 and HEAD_H 0.925 -> 0.99 with unchanged body. Prototype camera elevation 35–40 degrees above horizontal; preserve face within 25 degrees of camera. Reduce face emissive intensity 0.2 -> 0.12 if washed out, and use controlled front illumination. Keep eyes, glasses and beanie texture sharp rather than pixelating the photograph. Verify at 360px and 390px phone widths; use full portrait prominently in menus and game over. Do not increase gameplay hitbox merely because cosmetic head grows.
- confidence: medium

### F15 Eliminate frame-dependent character animation
- severity: medium
- area: animation
- file: src/render/chicken.js:130–139
- problem: `Math.min(1, rate * dt)` interpolation behaves differently at 30/60/120 FPS. At 30 FPS hopping rotation factor is ~0.87 per frame vs ~0.22 at 120 FPS.
- fix: Use exponential smoothing:

```js
const bodyAlpha = 1 - Math.exp(-turnRate * dt);
this.yaw += angleDiff(this.yaw, target) * bodyAlpha;
const headAlpha = 1 - Math.exp(-18 * dt);
this.headYaw += angleDiff(this.headYaw, headTarget) * headAlpha;
```

  Cap unusually long animation deltas and reset transient wing, leg and head states on restart. Keep simulation fixed tick. Verify death animation positions separately if the renderer supplies variable frame time.
- confidence: high

### F16 Make death animations part of the game's personality
- severity: medium
- area: creative
- file: src/render/chicken.js
- problem: Existing death animations are appropriate, but the photo face provides much more comedic potential.
- fix: Distinct comedic presentation, sound and randomized caption for each death:

| Death | Presentation | Caption |
|---|---|---|
| Car | Pancake pose, face upward | Bro did NOT look both ways. |
| Train | Rapid airborne spin | That was not the Hogwarts Express. |
| Splash | Beanie disappears last | The beanie is not waterproof. |
| Swept | Chicken drifts away helplessly | Bro has left the premises. |
| Eagle | Freeze-frame mid-abduction | Unexpected business trip. |

  Additional captions: "Certified poultry moment."; "The beanie deserved better."; "One more hop, he said."; "He really thought he had that."; "An unfortunate development." Introduce a 100–150ms presentation-only freeze before the death animation; make it skippable and restart fast.
- confidence: medium

### F17 Retain Beanie Hop, but add stronger replayability
- severity: medium
- area: creative
- file: n/a
- problem: The photograph is distinctive but novelty alone will not sustain replayability. Unlocks should reinforce character identity without compromising fairness.
- fix: Keep **Beanie Hop** as preferred title: short, memorable and suitable for home-screen icons. Alternatives: Beanie on the Run, What the Cluck?!, Certified Poultry.

  **The Beanie Collection:** spend collected corn on cosmetic accessories (sunglasses, gold beanie, tiny business tie, traffic cone, cowboy hat). Preserve the original face and avoid gameplay advantages.

  **Daily Beanie Challenge:** shared daily seed derived from UTC date and generator version; identical initial traffic phase and lane layout; personal daily best and shareable portrait scorecard. Add optional translucent personal-best ghost after deterministic replay support. Avoid multiplayer until single-player is polished.
- confidence: high

## Tests

Proposed regression tests for `tests/sim.test.js` using its existing `custom()`, `stepFor()`, `assert()` and `near()` helpers. Run against baseline to confirm failure where applicable, then after fixes. These tests are supplied for integration, not a claim that they have already passed.

```js
test('queued hop cannot escape swept boundary', () => {
  const g = custom({
    1: { type: 'river', speed: 1, dir: 1,
      movers: [{ x0: 4.945, len: 3, kind: 'log' }] }
  });
  g.state = 'playing';
  g.p.r = 1;
  g.p.x = 4.945;
  g.p.log = { i: 0, off: 0 };
  g.input('f');
  g.step(C.DT);
  assert(g.state === 'dead');
  assert(g.death.kind === 'swept');
});
```

```js
test('decorative lily pads cannot be landed on', () => {
  const g = custom({
    0: { type: 'river', speed: 0,
      movers: [{ x0: 4.7, len: 3, kind: 'log' }] },
    1: { type: 'river', pads: new Set([0, 5]) }
  });
  g.state = 'playing';
  g.p.log = { i: 0, off: 0 };
  g.input('f');
  stepFor(g, 0.2);
  assert(g.state === 'dead');
  assert(g.death.kind === 'splash');
});
```

```js
test('fatal landing awards neither corn nor score', () => {
  const g = custom({
    1: { type: 'road', dir: 1, speed: 2,
      movers: [{ x0: -1.295, len: 1.45, kind: 'car' }], coins: [0] }
  });
  g.input('f');
  stepFor(g, 0.2);
  assert(g.state === 'dead');
  assert(g.death.kind === 'car');
  assert(g.corn === 0);
  assert(g.score === 0);
  assert(!g.events.some(e => e.type === 'coin'));
  assert(!g.events.some(e => e.type === 'land'));
});
```

```js
test('invalid inherited direction names are rejected', () => {
  const g = custom({});
  for (const dir of ['toString', 'constructor', '__proto__', 'invalid', null]) {
    assert(!g.input(dir));
  }
  assert(g.queue.length === 0);
  assert(g.state === 'ready');
});
```

```js
test('title screen waiting does not affect gameplay', () => {
  const lanes = { 1: { type: 'road', dir: 1, speed: 2,
    movers: [{ x0: -3, len: 1.45, kind: 'car' }] } };
  const a = custom(lanes);
  const b = custom(lanes);
  stepFor(b, 1);
  a.input('f');
  b.input('f');
  stepFor(a, 0.2);
  stepFor(b, 0.2);
  assert(a.state === b.state);
  assert(near(a.t, b.t));
  assert(near(a.pos().x, b.pos().x));
  assert(near(a.pos().r, b.pos().r));
  assert(a.score === b.score);
});
```

```js
test('consecutive hazard rows respect difficulty cap', () => {
  for (let seed = 0; seed < 300; seed++) {
    const w = new World(seed);
    let streak = 0;
    for (let row = 0; row < 700; row++) {
      const lane = w.lane(row);
      streak = lane.type === 'grass' ? 0 : streak + 1;
      const cap = row < 20 ? 3 : row < 60 ? 4 : row < 150 ? 5 : 7;
      assert(streak <= cap, `Seed ${seed}, row ${row}: ${streak} consecutive hazardous rows`);
    }
  }
});
```

```js
test('seeded replay produces identical final state', () => {
  const a = new Game(12345);
  const b = new Game(12345);
  const inputs = new Map([[0,'f'], [20,'f'], [40,'r'], [60,'f'], [90,'l'], [120,'f']]);
  for (let tick = 0; tick < 600; tick++) {
    if (inputs.has(tick)) {
      a.input(inputs.get(tick));
      b.input(inputs.get(tick));
    }
    a.step(C.DT);
    b.step(C.DT);
    assert(a.state === b.state);
    assert(a.score === b.score);
    assert(a.corn === b.corn);
    assert(near(a.cam, b.cam));
    assert(near(a.pos().x, b.pos().x));
    assert(near(a.pos().r, b.pos().r));
    assert(a.death?.kind === b.death?.kind);
  }
});
```

Integration priorities: fix swept/log/pad boundaries, hazard and reward ordering, invalid input and fixed-clock issues first; then camera/input prototype and difficulty/fairness tuning; then visual polish and optional replayability. Run `node tests/sim.test.js` and `node tests/e2e.cjs` (or current project equivalents), verify on mobile and desktop, and record what was changed, what was rejected and why, what was actually executed, and remaining blockers in `collab/STATUS.md`. Do not represent proposed tuning or unverified statistics as measured results.
