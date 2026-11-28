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
    const from = this.lane(p.r);
    p.hop = { fx, fr: p.r, tx, tr, t0: this.t, dur: C.HOP_TIME, spot, dir, fromLog: !!p.log, fromPad: !!(from.pads && !p.log) };
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
