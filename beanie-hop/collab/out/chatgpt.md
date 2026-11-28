# Beanie Hop: round 1 review request for ChatGPT

You're joining a small team building **Beanie Hop**, an original voxel lane-hopping browser game for phones and desktop. The chicken's head is a real man's face from a photo.
Claude (Claude Code) is lead developer and integrates every change. Gemini (visual design, graphics, animation, performance optimisation, independent testing) and Grok (gameplay mechanics, code optimisation, edge-case detection, independent technical review) are reviewing in parallel.
Your review will be compared with theirs, so be specific and disagree openly where you think someone (including Claude) is wrong.

**Your role:** Architecture, advanced reasoning, code review, debugging, gameplay improvements, creative direction.

## How to work
The relevant source files are included at the end of this message. Reply in chat in the format below; it will be passed back to Claude.

**Ground rules**
- Only say `ran-it: yes` if you actually executed the code or tests. Reading the code is fine; just say so.
- Point at exact files and lines. Propose concrete changes (values, code) rather than general advice.
- Rank by impact on how the game plays and looks on a phone.

## What we need from you this round
1. Review the simulation architecture (src/sim): is the split between pure rules and rendering sound, and is anything going to hurt us once the renderer, input and UI are attached?
2. Hunt for logic bugs in game.js and world.js: hop/landing on logs and lily pads, collisions mid-hop, the camera creep and eagle, the input buffer. Point at exact lines.
3. Challenge the big design decision in STATUS.md: the chicken hops TOWARD the camera (down the screen) so the man's face is always visible. Is there a better way to keep the face visible? Argue for or against it.
4. Difficulty curve: look at difficulty(), the lane mix and the speeds/gaps in world.js. Suggest concrete number changes for the first 60 seconds of play and for row 150+.
5. Creative direction: game-over lines, a better title than 'Beanie Hop' if you have one, and one or two replayability ideas that fit the photo-face concept.

## Reply format (please keep it exactly, it is read by a script)
```
reviewer: chatgpt
round: 1
ran-it: yes | no        (yes only if you actually executed the code or the tests)

### F1 <short title>
- severity: high | medium | low
- area: gameplay | visuals | animation | performance | mobile | code | creative
- file: src/sim/game.js:120      (or n/a)
- problem: what is wrong or weak, concretely
- fix: the exact change you propose (numbers, code, or steps)
- confidence: high | medium | low

### F2 ...

## Tests
(optional) new tests as fenced ```js blocks in the style of tests/sim.test.js
```

## Source files
#### `collab/STATUS.md`
```markdown
# Beanie Hop: project status (round 1)

**What it is:** an original voxel lane-hopping game for phone and desktop browsers. A chicken has to get across endless procedurally generated grass, roads, rivers and railways. The chicken's head is a real man's face from a photo, wearing his knit beanie. The face is the front of the 3D head cube, with a comb, beak and wattle attached to it.

**Lead developer:** Claude (Claude Code). The code lives in git, which is the single source of truth: repo `pixelgravity79/boom-2`, branch `ccr-436599e2-f8j3sd`, folder `beanie-hop/`.

ChatGPT Work's earlier files for this game could not be recovered: they were not in the repo, Google Drive or the published pages. The project was therefore rebuilt from scratch.

## Done and tested

- **Face pipeline** (`tools/make_face.py`)
  - MediaPipe face landmarks level the eyes.
  - Multiclass segmentation keeps face, glasses and beanie, and removes the background.
  - The photo's hazy filter is colour-graded out, and the face is composited onto a white feather texture.
  - It also produces the matching knit beanie side and top textures and a portrait for menus.
  - Output is in `assets/`.
- **Simulation** (`src/sim/`): pure JavaScript, no DOM, fixed 120 Hz step, deterministic per seed.
  - Lane generation, in strict row order from one seeded RNG:
    - grass with trees, rocks and bushes;
    - roads with cars, vans and trucks;
    - rivers with drifting logs or still lily pads;
    - railways with timed trains and warning lights.
  - Everything that moves is an analytic function of time, so any system can ask "where is it at time t?".
  - Rules:
    - hop, bump into trees or the edge;
    - ride logs and get swept off the edge;
    - splash, get hit by a car or train;
    - the camera creeps forward and an eagle takes you if you fall behind;
    - collect corn;
    - a 2-move input buffer.
- **Fairness guarantees,** checked over 300 seeds x 700 rows by `tests/sim.test.js`:
  - an always-open path through trees and lily pads;
  - road gaps that always leave a crossing window of at least 0.38 s;
  - log gaps between about 0.9 and 4.3 tiles;
  - trains always warn before they arrive.
- **Bot** (`src/sim/bot.js`): a lookahead autopilot playing the real rules, plus a static route map. It reaches row 160 on 10 of 12 test seeds.
- **24 of 24 tests pass:** `node tests/sim.test.js`. Add `--quick` for a short run.

## In progress (not playable yet)

- 3D renderer (Three.js r170, orthographic camera, one directional light with shadows). Written so far:
  - `voxel.js`: box builder and edge-darkening shader patch;
  - `models.js`: vehicles, trains, logs, trees, corn, eagle;
  - `chicken.js`: the hero model and its animations;
  - `lanes.js`: per-row meshes;
  - `particles.js`.
- Not written yet:
  - scene/camera setup, the main loop, input (tap, swipe, keyboard);
  - synthesized audio, menus and HUD, saving;
  - the single-file build and deployment.

## Key design decision to challenge

In this genre the camera normally sits behind the character, so you mostly see the back of its head. Here the man's face must stay recognisable, so **the chicken hops toward the camera (down the screen)** and faces the player.

- Tap, or swipe down, moves forward. Swipe up moves back.
- After a sideways move the chicken turns back to look at you.
- When it's flattened by a car it lands face-up, so you can still see who it was.

The cost is that this is less conventional than hopping up the screen.

## Coordinates (for reading the code)

- Columns: x from -4 to 4 is the playfield.
- Rows: r increases forward, and world z = r. The camera is on the +z side, looking back.
- Directions: `f` forward (+r), `b` back, `l` = -x, `r` = +x.
```

#### `src/sim/config.js`
```js
// Shared tuning constants for the simulation. Distances are in tiles, times in seconds.
export const COL_MIN = -4;            // playable columns
export const COL_MAX = 4;
export const WRAP = 17;               // moving things live on a loop x in [-WRAP, WRAP)
export const LOOP = WRAP * 2;
export const DECOR_HALF = 15;         // scenery is generated out to here on each side
export const BACK_LIMIT = -3;         // rows below this are a wall of trees
export const START_SAFE_ROWS = 3;     // rows 0..3 are always plain grass

export const DT = 1 / 120;            // fixed simulation step
export const HOP_TIME = 0.135;        // one hop
export const BUMP_TIME = 0.11;        // bumping into a tree / the edge
export const HOP_HEIGHT = 0.42;
export const PLAYER_HALF = 0.28;      // half-width of the chicken's hitbox
export const LOG_TOLERANCE = 0.3;     // how far past a log's end a landing still counts
export const SWEPT_X = COL_MAX + 0.95; // ride a log this far out and you're gone
export const QUEUE_MAX = 2;           // buffered inputs while mid-hop

export const EAGLE_MARGIN = 3.4;      // fall this many rows behind the camera and the eagle comes
export const CAM_FOLLOW = 3.2;        // how fast the camera catches up with a player ahead of it
export const TRAIN_START = WRAP + 3;  // trains spawn this far off to the side
export const TRAIN_WARN = 1.25;       // seconds of warning lights before a train arrives

// difficulty 0..1 by row
export const difficulty = (row) => Math.min(1, Math.max(0, row) / 320);
// camera creep speed (rows / second) once the run has started
export const autoScroll = (score) => 0.36 + Math.min(0.38, score * 0.0022);

export const DIRS = {
  f: { dx: 0, dr: 1 },   // forward = toward the camera (down the screen)
  b: { dx: 0, dr: -1 },
  l: { dx: -1, dr: 0 },
  r: { dx: 1, dr: 0 },
};

export const VEHICLES = {
  car: { len: 1.45 },
  van: { len: 1.75 },
  truck: { len: 2.7 },
};
```

#### `src/sim/rng.js`
```js
// Small deterministic PRNG (mulberry32) with helpers.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), // inclusive
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(entries) { // [[value, weight], ...]
      let total = 0;
      for (const e of entries) total += e[1];
      let x = next() * total;
      for (const e of entries) { x -= e[1]; if (x <= 0) return e[0]; }
      return entries[entries.length - 1][0];
    },
  };
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
```

#### `src/sim/world.js`
```js
// Procedural lanes. Generated strictly in row order from one seeded RNG, so a seed always gives the same world.
// Everything that moves is an analytic function of time (no per-frame state), which keeps the simulation
// deterministic and lets the renderer, the tests and the bot ask "where is it at time t?" directly.
import { makeRng } from './rng.js';
import * as C from './config.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function wrapX(x) {
  let v = (x + C.WRAP) % C.LOOP;
  if (v < 0) v += C.LOOP;
  return v - C.WRAP;
}

export const moverX = (lane, m, t) => wrapX(m.x0 + lane.dir * lane.speed * t);

/** The car/truck at x (with the player's half-width), or null. */
export function vehicleAt(lane, x, t, half = C.PLAYER_HALF) {
  for (const m of lane.movers) {
    if (Math.abs(moverX(lane, m, t) - x) < m.len / 2 + half) return m;
  }
  return null;
}

/** Where the chicken would end up landing at `want` on a river lane at time t: on a log slot, a lily pad, or null (splash). */
export function landingSpot(lane, want, t) {
  if (lane.pads) {
    const col = Math.round(want);
    return lane.pads.has(col) && Math.abs(want - col) <= 0.5 ? { x: col, pad: col } : null;
  }
  let best = null;
  for (let i = 0; i < lane.movers.length; i++) {
    const m = lane.movers[i];
    const c = moverX(lane, m, t);
    const half = m.len / 2;
    const local = want - c;
    if (Math.abs(local) > half + C.LOG_TOLERANCE - 0.2) continue;
    const slot = clamp(Math.round(local + half - 0.5), 0, m.len - 1);
    const off = slot - half + 0.5;
    const d = Math.abs(local - off);
    if (!best || d < best.d) best = { x: c + off, log: { i, off }, d };
  }
  return best;
}

/** Train schedule for a rail lane at time t. */
export function trainState(lane, t) {
  const tr = lane.train;
  const res = { warn: false, active: false, head: 0, tail: 0 };
  const k = Math.floor((t - tr.phase) / tr.period);
  for (const kk of [k, k + 1]) {
    if (kk < 0) continue;
    const local = t - (tr.phase + kk * tr.period);
    if (local >= -C.TRAIN_WARN && local < tr.pass) res.warn = true;
    if (local >= 0 && local < tr.pass) {
      res.active = true;
      res.head = -lane.dir * C.TRAIN_START + lane.dir * tr.speed * local;
      res.tail = res.head - lane.dir * tr.len;
    }
  }
  return res;
}

export function trainAt(lane, x, t, half = C.PLAYER_HALF) {
  const s = trainState(lane, t);
  if (!s.active) return false;
  const lo = Math.min(s.head, s.tail), hi = Math.max(s.head, s.tail);
  return x + half > lo && x - half < hi;
}

const CAR_COLORS = 6, TRUCK_COLORS = 4;

export class World {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed ^ 0x9e3779b9);
    this.lanes = new Map();
    this.nextRow = C.BACK_LIMIT - 14;
    this.pathCol = 0;
    this.segType = 'grass';
    this.segLeft = 0;
    this.prev = null;
    this.roadDir = this.rng.chance(0.5) ? 1 : -1;
    this.riverDir = this.rng.chance(0.5) ? 1 : -1;
  }

  lane(row) {
    if (row >= this.nextRow) this.ensure(row);
    return this.lanes.get(row) || null;
  }

  ensure(row) {
    while (this.nextRow <= row) {
      const lane = this.gen(this.nextRow);
      this.lanes.set(lane.row, lane);
      this.prev = lane;
      this.nextRow++;
    }
  }

  prune(belowRow) {
    for (const k of this.lanes.keys()) if (k < belowRow) this.lanes.delete(k);
  }

  pickType(row) {
    if (row <= C.START_SAFE_ROWS) return 'grass';
    if (this.segLeft > 0) { this.segLeft--; return this.segType; }
    const R = this.rng, d = C.difficulty(row);
    let type, len;
    if (this.segType !== 'grass' && R.chance(0.78 - 0.33 * d)) {
      type = 'grass';
      len = R.int(1, d < 0.45 ? 3 : 2);
    } else {
      const opts = [['road', 0.5 + 0.05 * d]];
      if (row > 9) opts.push(['river', 0.3]);
      if (row > 16) opts.push(['rail', 0.17 + 0.05 * d]);
      const filtered = opts.filter((o) => o[0] !== this.segType);
      type = R.weighted(filtered.length ? filtered : opts);
      len = type === 'road' ? R.int(1, 2 + Math.round(3 * d))
        : type === 'river' ? R.int(1, 2 + Math.round(2 * d))
        : R.int(1, d > 0.35 ? 2 : 1);
    }
    this.segType = type;
    this.segLeft = len - 1;
    return type;
  }

  gen(row) {
    const type = row < C.BACK_LIMIT ? 'grass' : this.pickType(row);
    const lane = {
      row, type, d: C.difficulty(row),
      blocked: new Set(), decor: [], movers: [], dir: 1, speed: 0,
      pads: null, train: null, coins: [], path: this.pathCol,
    };
    if (type === 'grass') this.genGrass(lane);
    else if (type === 'road') this.genRoad(lane);
    else if (type === 'river') this.genRiver(lane);
    else this.genRail(lane);
    return lane;
  }

  genGrass(lane) {
    const R = this.rng, row = lane.row, d = lane.d;
    const add = (x, kind, block = true) => {
      lane.decor.push({ x, kind, v: R.next() });
      if (block) lane.blocked.add(x);
    };
    const scenery = () => R.weighted([['tree', 0.62], ['rock', 0.16], ['bush', 0.12], ['stump', 0.1]]);
    if (row < C.BACK_LIMIT) { // the wall of trees behind the start
      for (let x = -C.DECOR_HALF; x <= C.DECOR_HALF; x++) if (R.chance(0.8)) add(x, 'tree');
      return;
    }
    for (let x = -C.DECOR_HALF; x <= C.DECOR_HALF; x++) {
      if (x >= C.COL_MIN && x <= C.COL_MAX) continue;
      if (R.chance(Math.abs(x) === C.COL_MAX + 1 ? 0.7 : 0.5)) add(x, scenery());
    }
    // the guaranteed path wanders by at most one column per grass row
    const from = this.pathCol;
    const to = clamp(from + R.int(-1, 1), C.COL_MIN + 1, C.COL_MAX - 1);
    const keep = new Set([from, to]);
    let density = row <= C.START_SAFE_ROWS ? 0.1 : lerp(0.13, 0.3, d);
    if (this.prev && this.prev.type === 'river') density *= 0.35; // lots of landing spots after water
    for (let x = C.COL_MIN; x <= C.COL_MAX; x++) {
      if (keep.has(x)) continue;
      if (row >= 0 && row <= 1 && Math.abs(x) <= 1) continue;
      if (R.chance(density)) add(x, scenery());
    }
    // never wall off more than 5 of the 9 columns
    while (lane.blocked.size > 0 && [...lane.blocked].filter((x) => x >= C.COL_MIN && x <= C.COL_MAX).length > 5) {
      const inside = lane.decor.filter((o) => o.x >= C.COL_MIN && o.x <= C.COL_MAX);
      const o = inside[Math.floor(R.next() * inside.length)];
      lane.decor.splice(lane.decor.indexOf(o), 1);
      lane.blocked.delete(o.x);
    }
    for (let x = -C.DECOR_HALF; x <= C.DECOR_HALF; x++) { // flowers and tufts never block
      if (!lane.blocked.has(x) && R.chance(0.14)) lane.decor.push({ x, kind: R.chance(0.5) ? 'flowers' : 'tuft', v: R.next(), soft: true });
    }
    this.pathCol = to;
    lane.path = to;
    if (row > C.START_SAFE_ROWS && R.chance(0.11)) {
      const free = [];
      for (let x = C.COL_MIN; x <= C.COL_MAX; x++) if (!lane.blocked.has(x)) free.push(x);
      lane.coins.push(R.pick(free));
    }
  }

  genRoad(lane) {
    const R = this.rng, d = lane.d;
    if (R.chance(0.7)) this.roadDir = -this.roadDir;
    lane.dir = this.roadDir;
    let speed = lerp(1.65, 3.7, d) * R.range(0.85, 1.2);
    if (R.chance(0.08 + 0.1 * d)) speed *= 1.45; // the occasional speedster lane
    lane.speed = speed;
    const truckLane = R.chance(0.25 + 0.2 * d);
    const minGap = 2 * C.PLAYER_HALF + speed * lerp(0.62, 0.4, d) + 0.55;
    const maxGap = minGap + lerp(6.5, 3.2, d);
    const start = R.range(0, C.LOOP);
    const color = R.int(0, truckLane ? TRUCK_COLORS - 1 : CAR_COLORS - 1);
    let used = 0;
    for (;;) {
      const kind = truckLane ? (R.chance(0.8) ? 'truck' : 'van') : (R.chance(0.78) ? 'car' : 'van');
      const len = C.VEHICLES[kind].len;
      if (used + len + minGap > C.LOOP && lane.movers.length) break;
      lane.movers.push({ x0: start + used + len / 2, len, kind, color: R.chance(0.7) ? color : R.int(0, truckLane ? TRUCK_COLORS - 1 : CAR_COLORS - 1) });
      used += len + R.range(minGap, maxGap);
    }
    lane.minGap = minGap;
    if (R.chance(0.035)) lane.coins.push(R.int(C.COL_MIN, C.COL_MAX));
  }

  genRiver(lane) {
    const R = this.rng, d = lane.d;
    const prevRiver = this.prev && this.prev.type === 'river';
    if (R.chance(lerp(0.32, 0.16, d)) && !(prevRiver && this.prev.pads)) {
      lane.pads = new Set([this.pathCol]);
      const extra = R.int(1, 3);
      for (let i = 0; i < extra; i++) lane.pads.add(R.int(C.COL_MIN, C.COL_MAX));
      for (let x = -C.DECOR_HALF; x <= C.DECOR_HALF; x++) { // scenery pads outside the playfield
        if ((x < C.COL_MIN || x > C.COL_MAX) && R.chance(0.15)) lane.pads.add(x);
      }
      lane.speed = 0;
      return;
    }
    this.riverDir = prevRiver ? -this.riverDir : (R.chance(0.5) ? 1 : -1);
    lane.dir = this.riverDir;
    lane.speed = lerp(0.95, 1.95, d) * R.range(0.85, 1.15);
    const maxLen = d < 0.5 ? 4 : 3;
    const gMin = 1.1, gMax = lerp(2.6, 3.6, d);
    // pick n logs with random gaps, then spread the leftover evenly so the loop closes inside [gMin, gMax]
    const meanLen = (2 + maxLen) / 2, meanGap = (gMin + gMax) / 2;
    const n = Math.max(3, Math.round(C.LOOP / (meanLen + meanGap)));
    let lens, gaps;
    for (let attempt = 0; ; attempt++) {
      lens = []; gaps = [];
      for (let i = 0; i < n; i++) { lens.push(R.int(2, maxLen)); gaps.push(R.range(gMin, gMax)); }
      const total = lens.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);
      const adj = (C.LOOP - total) / n;
      gaps = gaps.map((g) => g + adj);
      if (gaps.every((g) => g >= gMin * 0.75 && g <= gMax + 0.7)) break;
      if (attempt > 30) { // fallback: even spacing always closes the loop
        lens = lens.map(() => 3);
        gaps = lens.map(() => C.LOOP / n - 3);
        break;
      }
    }
    let pos = R.range(0, C.LOOP);
    for (let i = 0; i < n; i++) {
      lane.movers.push({ x0: pos + lens[i] / 2, len: lens[i], kind: 'log' });
      pos += lens[i] + gaps[i];
    }
    lane.maxGap = gMax + 0.7;
  }

  genRail(lane) {
    const R = this.rng, d = lane.d;
    lane.dir = R.chance(0.5) ? 1 : -1;
    const cars = R.int(2, 4);
    const speed = R.range(24, 30);
    const len = 3.4 + cars * 3.3;
    const period = R.range(lerp(8.5, 5.2, d), lerp(13, 8, d));
    lane.train = { cars, speed, len, period, phase: R.range(0.6, period), pass: (2 * C.TRAIN_START + len) / speed };
    if (R.chance(0.05)) lane.coins.push(R.int(C.COL_MIN, C.COL_MAX));
  }
}
```

#### `src/sim/game.js`
```js
// The game rules. Pure logic, no DOM or WebGL: the renderer, the tests and the bot all drive this.
import * as C from './config.js';
import { World, moverX, vehicleAt, landingSpot, trainAt } from './world.js';
import { randomSeed } from './rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Game {
  constructor(seed = randomSeed(), world = null) {
    this.seed = seed >>> 0;
    this.world = world || new World(this.seed);
    this.t = 0;
    this.state = 'ready'; // ready -> playing -> dead
    this.p = { x: 0, r: 0, face: 'f', hop: null, log: null, bumpT: -9, bumpUntil: 0, bumpDir: 'f', lastMoveT: 0 };
    this.queue = [];
    this.score = 0;
    this.corn = 0;
    this.collected = new Set();
    this.cam = 0;
    this.started = false;
    this.death = null;
    this.events = [];
    this.hops = 0;
  }

  clone() {
    const g = Object.create(Game.prototype);
    Object.assign(g, this);
    g.p = { ...this.p, hop: this.p.hop && { ...this.p.hop }, log: this.p.log && { ...this.p.log } };
    g.queue = this.queue.slice();
    g.collected = new Set(this.collected);
    g.events = [];
    return g;
  }

  lane(row) { return this.world.lane(row); }

  /** Queue a move: 'f' forward (toward the camera), 'b' back, 'l' left (-x), 'r' right (+x). */
  input(dir) {
    if (this.state === 'dead' || !C.DIRS[dir]) return false;
    if (this.queue.length >= C.QUEUE_MAX) return false;
    this.queue.push(dir);
    if (this.state === 'ready') { this.state = 'playing'; this.started = true; }
    return true;
  }

  /** Continuous position at time t (defaults to now): x, r (row, fractional mid-hop), y (height), k (hop progress). */
  pos(t = this.t) {
    const p = this.p;
    if (this.death) return { x: this.death.x, r: this.death.r, y: 0, k: 1, rEff: Math.round(this.death.r) };
    if (p.hop) {
      const h = p.hop;
      const k = clamp((t - h.t0) / h.dur, 0, 1);
      return { x: h.fx + (h.tx - h.fx) * k, r: h.fr + (h.tr - h.fr) * k, y: C.HOP_HEIGHT * 4 * k * (1 - k), k, rEff: k < 0.5 ? h.fr : h.tr };
    }
    if (p.log) {
      const lane = this.lane(p.r);
      return { x: moverX(lane, lane.movers[p.log.i], t) + p.log.off, r: p.r, y: 0, k: 1, rEff: p.r };
    }
    return { x: p.x, r: p.r, y: 0, k: 1, rEff: p.r };
  }

  step(dt = C.DT) {
    this.t += dt;
    if (this.state !== 'playing') return;
    const p = this.p;
    if (p.hop && this.t >= p.hop.t0 + p.hop.dur) this.land();
    if (this.state !== 'playing') return;
    if (!p.hop && this.queue.length && this.t >= p.bumpUntil) this.startHop(this.queue.shift());
    if (p.log && !p.hop) {
      p.x = this.pos().x;
      if (Math.abs(p.x) > C.SWEPT_X) return this.die('swept');
    }
    this.checkHazards();
    if (this.state !== 'playing') return;
    // the camera creeps forward on its own and catches up with a player who is ahead of it
    const pr = this.pos().r;
    this.cam += C.autoScroll(this.score) * dt;
    if (pr > this.cam) this.cam += (pr - this.cam) * (1 - Math.exp(-C.CAM_FOLLOW * dt));
    if (pr < this.cam - C.EAGLE_MARGIN) this.die('eagle');
  }

  startHop(dir) {
    const p = this.p, { dx, dr } = C.DIRS[dir];
    p.face = dir;
    const tr = p.r + dr;
    if (tr < C.BACK_LIMIT) return this.bump(dir);
    const to = this.lane(tr);
    const t1 = this.t + C.HOP_TIME;
    const fx = this.pos().x;
    let tx, spot = null;
    if (to.type === 'river') {
      // sideways on a log keeps the log's drift; anything else jumps straight from where we are
      const base = dr === 0 && p.log ? moverX(to, to.movers[p.log.i], t1) + p.log.off : fx;
      const want = base + dx;
      if (dx !== 0 && Math.abs(want) > C.COL_MAX + 0.5) return this.bump(dir);
      spot = landingSpot(to, want, t1);
      tx = spot ? spot.x : want;
    } else {
      tx = Math.round(fx + dx);
      if (p.log && dx === 0) tx = clamp(tx, C.COL_MIN, C.COL_MAX); // stepping off a log near the edge still works
      if (tx < C.COL_MIN || tx > C.COL_MAX) return this.bump(dir);
      if (to.type === 'grass' && to.blocked.has(tx)) return this.bump(dir);
    }
    p.hop = { fx, fr: p.r, tx, tr, t0: this.t, dur: C.HOP_TIME, spot, dir };
    p.log = null;
    this.hops++;
    this.events.push({ type: 'hop', dir, from: this.lane(p.r).type, to: to.type });
  }

  bump(dir) {
    const p = this.p;
    p.face = dir;
    p.bumpT = this.t;
    p.bumpDir = dir;
    p.bumpUntil = this.t + C.BUMP_TIME;
    this.events.push({ type: 'bump', dir });
  }

  land() {
    const p = this.p, h = p.hop;
    p.hop = null;
    p.r = h.tr;
    p.x = h.tx;
    p.lastMoveT = this.t;
    const lane = this.lane(p.r);
    if (lane.type === 'river') {
      if (!h.spot) return this.die('splash');
      if (h.spot.log) {
        p.log = { ...h.spot.log };
        p.x = this.pos().x;
      } else p.x = h.spot.pad;
    }
    const col = Math.round(p.x);
    if (lane.coins.includes(col) && Math.abs(p.x - col) < 0.5) {
      const key = p.r + ':' + col;
      if (!this.collected.has(key)) {
        this.collected.add(key);
        this.corn++;
        this.events.push({ type: 'coin', x: col, r: p.r });
      }
    }
    if (p.r > this.score) {
      this.score = p.r;
      this.events.push({ type: 'score', score: this.score });
    }
    this.events.push({ type: 'land', lane: lane.type, onLog: !!p.log, pad: lane.pads ? true : false, x: p.x, r: p.r });
  }

  checkHazards() {
    const pos = this.pos();
    const lane = this.lane(pos.rEff);
    if (lane.type === 'road') {
      const m = vehicleAt(lane, pos.x, this.t);
      if (m) this.die('car', { vehicle: m, dir: lane.dir, speed: lane.speed, vx: moverX(lane, m, this.t) });
    } else if (lane.type === 'rail') {
      if (trainAt(lane, pos.x, this.t)) this.die('train', { dir: lane.dir });
    }
  }

  die(kind, info = {}) {
    const pos = this.pos();
    this.death = { kind, t: this.t, x: pos.x, r: kind === 'car' || kind === 'train' ? pos.rEff : pos.r, y: pos.y, face: this.p.face, ...info };
    this.state = 'dead';
    this.queue.length = 0;
    this.events.push({ type: 'death', kind });
  }

  /** Rows that should exist right now (used to prune memory). */
  prune() {
    this.world.prune(Math.floor(Math.min(this.cam, this.p.r)) - 30);
  }
}
```

#### `src/sim/bot.js`
```js
// A lookahead autopilot. It plays the real rules on cloned games, so it doubles as a fairness check:
// if the bot can routinely get deep into a seed, the generator isn't producing impossible layouts.
import * as C from './config.js';

const ACTIONS = ['f', 'l', 'r', 'w', 'b'];

function advance(g, a) {
  if (a === 'w') {
    for (let i = 0; i < 10; i++) { g.step(C.DT); if (g.state === 'dead') return false; }
    return true;
  }
  g.input(a);
  for (let i = 0; i < 40; i++) {
    g.step(C.DT);
    if (g.state === 'dead') return false;
    if (!g.p.hop && !g.queue.length && g.t >= g.p.bumpUntil) break;
  }
  return true;
}

function survives(g, secs) {
  const h = g.clone();
  const n = Math.ceil(secs / C.DT);
  for (let i = 0; i < n; i++) { h.step(C.DT); if (h.state === 'dead') return false; }
  return true;
}

// Static route map: moves needed from each tile to reach `ahead` rows further, treating trees as walls,
// lily-pad rows as pads only and everything else (roads, rails, log rows) as open. Lets the bot plan
// around dead-end pockets that a short timing lookahead can't see out of.
function routeField(game, ahead = 10, behind = 5) {
  const r0 = game.p.r - behind, r1 = game.p.r + ahead, W = C.COL_MAX - C.COL_MIN + 1;
  const open = (x, r) => {
    if (r < C.BACK_LIMIT || x < C.COL_MIN || x > C.COL_MAX) return false;
    const l = game.lane(r);
    if (l.type === 'grass') return !l.blocked.has(x);
    if (l.pads) return l.pads.has(x);
    return true;
  };
  const dist = new Map(), q = [];
  for (let x = C.COL_MIN; x <= C.COL_MAX; x++) if (open(x, r1)) { dist.set(r1 * W + x, 0); q.push([x, r1]); }
  for (let i = 0; i < q.length; i++) {
    const [x, r] = q[i], d = dist.get(r * W + x);
    for (const [nx, nr] of [[x, r - 1], [x - 1, r], [x + 1, r], [x, r + 1]]) {
      if (nr < r0 || nr > r1 || !open(nx, nr) || dist.has(nr * W + nx)) continue;
      // sideways moves across a pad row are only possible pad-to-pad (handled by open), log rows are free
      dist.set(nr * W + nx, d + 1);
      q.push([nx, nr]);
    }
  }
  return { get: (x, r) => { const v = dist.get(r * W + Math.round(x)); return v === undefined ? 99 : v; }, r1 };
}

let field = null;

function value(g) {
  const pos = g.pos();
  let v = g.score * 4 + g.p.r * 2 - field.get(pos.x, g.p.r) * 6 - Math.abs(pos.x) * 0.3 + g.corn * 2;
  if (g.p.log) v -= Math.max(0, Math.abs(pos.x) - 2.5) * 3; // don't ride logs toward the edge
  v -= Math.max(0, g.cam - pos.r) * 4;                       // stay ahead of the eagle
  return v;
}

function search(g, depth) {
  if (depth === 0) return survives(g, 0.3) ? value(g) : -1e9;
  let best = -1e9;
  for (const a of ACTIONS) {
    if (a === 'b' && depth < 2) continue;
    const h = g.clone();
    if (!advance(h, a)) continue;
    const v = search(h, depth - 1);
    if (v > best) best = v;
  }
  return best;
}

/** Best next action for the current game: 'f' | 'b' | 'l' | 'r' | null (wait a moment). */
export function decide(game, depth = 3) {
  if (game.state === 'dead') return null;
  field = routeField(game);
  let best = null, bestV = -Infinity;
  for (const a of ACTIONS) {
    const h = game.clone();
    if (!advance(h, a)) continue;
    const v = search(h, depth - 1) + (a === 'f' ? 0.5 : 0);
    if (v > bestV) { bestV = v; best = a; }
  }
  return best === 'w' ? null : best;
}

/** Play a headless game with the bot. Returns { score, kind, t, corn, hops }. */
export function autoplay(game, { maxRows = 200, maxTime = 600, depth = 3 } = {}) {
  game.input('f');
  let steps = 0;
  while (game.state === 'playing' && game.score < maxRows && game.t < maxTime) {
    if (!game.p.hop && !game.queue.length && game.t >= game.p.bumpUntil) {
      const a = decide(game, depth);
      if (a) game.input(a);
      else for (let i = 0; i < 6; i++) game.step(C.DT);
    }
    game.step(C.DT);
    if (++steps % 600 === 0) game.prune();
  }
  return { score: game.score, kind: game.death ? game.death.kind : null, t: +game.t.toFixed(1), corn: game.corn, hops: game.hops };
}
```

#### `tests/sim.test.js`
```js
// Simulation tests: determinism, generator guarantees, rules, and a bot fairness run.
// Run: node tests/sim.test.js            (add --quick to skip the long bot run)
import * as C from '../src/sim/config.js';
import { World, moverX, trainState, wrapX } from '../src/sim/world.js';
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
      assert(l.train.pass + C.TRAIN_WARN < l.train.period, `seed ${s} row ${r}`);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

#### `src/render/chicken.js`
```js
// The hero: a voxel chicken whose head is the man from the photo, beanie and all.
// The face is the front of the head cube (generated by tools/make_face.py), the knit beanie wraps the
// top and sides, and the comb, beak and wattle are real geometry attached to that head.
import * as THREE from 'three';
import { PAL } from './models.js';

const HEAD_W = 0.64, HEAD_H = 0.78, HEAD_D = 0.56;
const BODY_W = 0.5, BODY_H = 0.4, BODY_D = 0.54;
const LEG_H = 0.15;
const YAW = { f: 0, b: Math.PI, l: -Math.PI / 2, r: Math.PI / 2 };

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);
const boxMesh = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  return m;
};
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Chicken {
  /** tex: { front, sideL, sideR, back, top } THREE.Textures; meta: face_meta.json */
  constructor(tex, meta) {
    this.root = new THREE.Group();       // world position + facing
    this.pose = new THREE.Group();       // squash & stretch, death poses
    this.root.add(this.pose);

    const white = lambert({ color: PAL.white });
    const orange = lambert({ color: PAL.orange });
    const red = lambert({ color: PAL.red });
    this.mats = { white, orange, red };

    // legs + feet
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.12, LEG_H, 0.02);
      leg.add(boxMesh(0.06, LEG_H, 0.06, orange, 0, -LEG_H, 0));
      leg.add(boxMesh(0.12, 0.035, 0.17, orange, 0, -LEG_H, 0.04));
      this.pose.add(leg);
      this.legs.push(leg);
    }
    // body, tail, wings
    this.body = boxMesh(BODY_W, BODY_H, BODY_D, white, 0, LEG_H, -0.04);
    this.pose.add(this.body);
    const tail = boxMesh(0.3, 0.2, 0.12, white, 0, LEG_H + 0.24, -0.34);
    tail.rotation.x = -0.35;
    this.pose.add(tail);
    this.pose.add(boxMesh(0.18, 0.1, 0.08, white, 0, LEG_H + 0.42, -0.36));
    this.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * (BODY_W / 2), LEG_H + BODY_H - 0.06, -0.06);
      const w = boxMesh(0.07, 0.26, 0.34, white, s * 0.035, -0.26, 0);
      pivot.add(w);
      this.pose.add(pivot);
      this.wings.push({ pivot, s });
    }

    // head: the face lives on the +z face of this box
    this.head = new THREE.Group();
    this.head.position.set(0, LEG_H + BODY_H - 0.05, 0.02);
    for (const t of Object.values(tex)) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
    const faceMat = lambert({ map: tex.front, emissive: 0xffffff, emissiveMap: tex.front, emissiveIntensity: 0.32 });
    const knit = (map) => lambert({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.08 });
    const headMats = [knit(tex.sideR), knit(tex.sideL), knit(tex.top), white, faceMat, knit(tex.back)];
    const headBox = new THREE.Mesh(new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D), headMats);
    headBox.position.y = HEAD_H / 2;
    headBox.castShadow = true;
    this.head.add(headBox);
    this.faceMat = faceMat;

    // comb poking out of the top of the beanie
    const combX = 0.02;
    this.head.add(boxMesh(0.09, 0.1, 0.12, red, combX, HEAD_H, 0.1));
    this.head.add(boxMesh(0.09, 0.15, 0.12, red, combX, HEAD_H, -0.02));
    this.head.add(boxMesh(0.09, 0.09, 0.12, red, combX, HEAD_H, -0.14));
    // beak + wattle under the chin, lined up with the face in the photo
    const chinX = ((meta && meta.chin ? meta.chin[0] : 0.55) - 0.5) * HEAD_W;
    const chinY = HEAD_H * (1 - (meta && meta.chin ? meta.chin[1] : 0.9));
    this.beak = boxMesh(0.15, 0.09, 0.14, orange, chinX, Math.max(0.005, chinY - 0.085), HEAD_D / 2 + 0.06);
    this.head.add(this.beak);
    this.head.add(boxMesh(0.1, 0.03, 0.1, lambert({ color: 0xd9861a }), chinX, Math.max(0.005, chinY - 0.085) - 0.005, HEAD_D / 2 + 0.07));
    this.head.add(boxMesh(0.08, 0.12, 0.05, red, chinX, chinY - 0.2, HEAD_D / 2 + 0.03));
    this.pose.add(this.head);

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

    this.yaw = 0;
    this.headYaw = 0;
    this.sq = { v: 1, vel: 0, target: 1 };   // squash spring on Y
    this.lastHopT = -9;
    this.deathT = -1;
    this.flight = null;
  }

  reset() {
    this.yaw = 0; this.headYaw = 0;
    this.sq.v = 1; this.sq.vel = 0; this.sq.target = 1;
    this.deathT = -1; this.flight = null;
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.pose.rotation.set(0, 0, 0);
    this.pose.scale.set(1, 1, 1);
    this.pose.position.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
  }

  press() { this.sq.target = 0.82; }
  release() { this.sq.target = 1; }
  kick(v) { this.sq.vel += v; }

  /**
   * view: { x, y, z, hopK (0..1 or 1 when grounded), hopping, face, idleFor, bumpK, now, dt, title }
   */
  update(view) {
    const { dt } = view;
    // squash spring
    const s = this.sq;
    s.vel += (-(s.v - s.target) * 380 - s.vel * 18) * dt;
    s.v += s.vel * dt;

    this.root.position.set(view.x, view.y, view.z);

    // facing: turn toward the move; after a moment of standing still, turn back to look at the player
    let target = YAW[view.face] ?? 0;
    if (!view.hopping && view.idleFor > 0.55) target = 0;
    const turnRate = view.hopping ? 26 : 9;
    this.yaw += angleDiff(this.yaw, target) * Math.min(1, turnRate * dt);
    this.root.rotation.y = this.yaw;

    // the head leads the body when looking back at the camera
    const headTarget = !view.hopping && view.idleFor > 0.3 ? angleDiff(this.yaw, 0) : 0;
    this.headYaw += (headTarget - this.headYaw) * Math.min(1, 14 * dt);
    this.head.rotation.y = this.headYaw;

    // squash & stretch + hop pose
    const sy = s.v * (view.hopping ? 1 + Math.sin(view.hopK * Math.PI) * 0.12 : 1);
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    this.pose.scale.set(sxz, sy, sxz);
    const flap = view.hopping ? Math.sin(view.hopK * Math.PI) : 0;
    for (const w of this.wings) w.pivot.rotation.z = w.s * (0.1 + flap * 1.1 + (view.title ? Math.max(0, Math.sin(view.now * 9)) * 0.15 * (Math.sin(view.now * 0.7) > 0.6 ? 1 : 0) : 0));
    for (let i = 0; i < 2; i++) this.legs[i].rotation.x = view.hopping ? (i ? 1 : -1) * Math.sin(view.hopK * Math.PI) * 0.4 : 0;
    // idle life: breathing, a little head bob and the odd curious tilt
    const idle = view.hopping ? 0 : 1;
    this.head.position.y = LEG_H + BODY_H - 0.05 + idle * Math.sin(view.now * 2.4) * 0.008;
    this.head.rotation.z = idle * Math.sin(view.now * 0.9) * 0.05 * (Math.sin(view.now * 0.31) > 0.4 ? 1 : 0.2);
    this.head.rotation.x = view.hopping ? -0.08 * flap : -0.04;
    // bump: lean into the obstacle and pop back
    this.pose.rotation.x = view.bumpK > 0 ? Math.sin(view.bumpK * Math.PI) * 0.25 : 0;
    this.pose.position.y = view.bumpK > 0 ? Math.sin(view.bumpK * Math.PI) * 0.12 : 0;
  }

  /** Death poses. kind: car | train | splash | swept | eagle; k = seconds since death */
  updateDeath(death, k, dt, baseY) {
    const p = this.pose;
    this.head.rotation.set(0, 0, 0);
    if (death.kind === 'car') {
      // pancake, face up, so you can still see who it was
      this.root.rotation.y = 0;
      const e = Math.min(1, k / 0.08);
      p.rotation.x = -Math.PI / 2 * e;
      p.scale.set(1.25, 1.25, 1 - 0.86 * e);
      p.position.set(0, 0.03, 0.04 * e);
      this.root.position.y = baseY;
    } else if (death.kind === 'train') {
      if (!this.flight) this.flight = { vx: death.dir * 16, vy: 7, vz: -1.5, spin: 14 };
      const f = this.flight;
      f.vy -= 22 * dt;
      this.root.position.x += f.vx * dt;
      this.root.position.y += f.vy * dt;
      this.root.position.z += f.vz * dt;
      p.rotation.z += f.spin * dt * -death.dir;
      p.rotation.x += f.spin * 0.6 * dt;
      if (k > 2) this.root.visible = false;
    } else if (death.kind === 'splash' || death.kind === 'swept') {
      const e = Math.min(1, k / 0.6);
      this.root.position.y = baseY - 0.15 - e * e * 1.0;
      p.rotation.z = Math.sin(k * 18) * 0.25 * (1 - e);
      p.rotation.x = -0.4 * e;
      if (k > 0.9) this.root.visible = false;
    } else if (death.kind === 'eagle') {
      p.rotation.z = Math.sin(k * 20) * 0.3;   // wriggling in the talons; the eagle moves the root
    }
  }
}
```

