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
    if (col < C.COL_MIN || col > C.COL_MAX) return null; // scenery pads outside the playfield never hold you
    return lane.pads.has(col) && Math.abs(want - col) <= 0.5 ? { x: col, pad: col } : null;
  }
  let best = null;
  for (let i = 0; i < lane.movers.length; i++) {
    const m = lane.movers[i];
    const c = moverX(lane, m, t);
    const half = m.len / 2;
    const local = want - c;
    if (Math.abs(local) > half + C.LOG_TOLERANCE) continue;
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
    if (local >= -(tr.warn || C.TRAIN_WARN) && local < tr.pass) res.warn = true;
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
    this.hazRun = 0;     // consecutive dangerous rows generated so far
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
    const budget = C.hazardCap(row) - this.hazRun;   // dangerous rows still allowed before a breather
    let type, len;
    if (this.segType !== 'grass' && (budget <= 0 || R.chance(0.78 - 0.33 * d))) {
      type = 'grass';
      len = R.int(1, d < 0.45 ? 3 : 2);
    } else {
      const opts = [['road', 0.5 + 0.05 * d]];
      if (row > 9) opts.push(['river', 0.3]);
      if (row > 18) opts.push(['rail', 0.17 + 0.05 * d]);
      const filtered = opts.filter((o) => o[0] !== this.segType);
      type = R.weighted(filtered.length ? filtered : opts);
      len = type === 'road' ? R.int(1, 2 + Math.round(3 * d))
        : type === 'river' ? R.int(1, Math.min(C.MAX_RIVER_RUN, 2 + Math.round(2 * d)))
        : R.int(1, d > 0.35 ? 2 : 1);
      len = Math.max(1, Math.min(len, budget));
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
      pads: null, decorPads: null, train: null, coins: [], path: this.pathCol,
    };
    this.hazRun = type === 'grass' ? 0 : this.hazRun + 1;
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
      if (row >= 0 && row <= C.START_SAFE_ROWS && x === 0) continue;
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
    if (lane.row >= 20 && R.chance(0.08 + 0.1 * d)) speed *= 1.45; // the occasional speedster lane
    lane.speed = Math.min(speed, C.MAX_CAR_SPEED);
    speed = lane.speed;
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
    if (R.chance(lerp(0.38, 0.18, d)) && !(prevRiver && this.prev.pads)) {
      lane.pads = new Set([this.pathCol]);
      const extra = R.int(1, 3);
      for (let i = 0; i < extra; i++) lane.pads.add(R.int(C.COL_MIN, C.COL_MAX));
      lane.decorPads = new Set();
      for (let x = -C.DECOR_HALF; x <= C.DECOR_HALF; x++) { // scenery only: drawn, never landed on
        if ((x < C.COL_MIN || x > C.COL_MAX) && R.chance(0.15)) lane.decorPads.add(x);
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
    const period = R.range(lerp(10, 6.5, d), lerp(14, 9, d));
    lane.train = { cars, speed, len, period, phase: R.range(0.6, period), pass: (2 * C.TRAIN_START + len) / speed, warn: C.trainWarn(d) };
    if (R.chance(0.05)) lane.coins.push(R.int(C.COL_MIN, C.COL_MAX));
  }
}
