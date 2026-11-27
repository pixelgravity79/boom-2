/* Flappy Fellas — shared deterministic simulation.
 * No browser dependencies: the game, the browser Lab API and the Node tests all run this exact code.
 * One step = one 60 Hz frame. Everything random comes from the seeded RNG inside the state, and the
 * course (pipes, pickups, speed) never depends on what the player does, so a seed always produces
 * the same course and a list of flap ticks always replays the same run (used by the Daily ghost).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlappyEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const config = Object.freeze({
    width: 420, height: 640, floor: 590,
    x: 112,            // flier's fixed horizontal position
    radius: 17,        // hitbox circle around the face (the hair is drawn bigger: hair doesn't count)
    gravity: 0.38, flap: -6.55, maxFall: 9.6,
    ceiling: -70,      // soft ceiling above the visible top: you can't die up there, but pipes still extend
    pipeWidth: 70, spacing: 232, spawnX: 440,
    speed0: 2.55, speed1: 3.55,
    gap0: 184, gap1: 144,
    delta0: 95, delta1: 158,   // max vertical jump between consecutive gap centres
    ramp: 170,                 // pipes until max difficulty
    topMargin: 62, floorMargin: 54,
    itemRadius: 13, perfectWindow: 13, nearMiss: 7,
    invulnFrames: 72,
    bobFrom: 12, chompFrom: 32,
  });

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** Difficulty for the n-th pipe (0-based). Gentle start, eases toward the max around pipe 170. */
  function difficulty(n) {
    const t = clamp(n / config.ramp, 0, 1);
    const e = t * (1.2 - 0.2 * t);
    return { t, speed: lerp(config.speed0, config.speed1, e), gap: lerp(config.gap0, config.gap1, e), delta: lerp(config.delta0, config.delta1, e) };
  }

  function create(seed = 42) {
    return {
      seed: seed >>> 0, startSeed: seed >>> 0,
      tick: 0, y: 300, vy: 0, py: 300,
      score: 0, passed: 0, mallows: 0, crossed: 0, spawned: 0,
      speed: config.speed0, dist: 0, sinceSpawn: config.spacing,
      dead: false, deathCause: null, deathTick: -1,
      shield: false, invuln: 0, lastShieldAt: -99,
      perfectStreak: 0, bestPerfectStreak: 0, perfects: 0, nearMisses: 0, flaps: 0, ceilingTouches: 0,
      flapTicks: [],
      pipes: [], items: [], events: [],
    };
  }

  function random(s) { s.seed = (Math.imul(1664525, s.seed) + 1013904223) >>> 0; return s.seed / 4294967296; }

  /** FNV-1a: turns a string such as a date into a seed (Daily Flight). */
  function seedFrom(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function emit(s, type, data) { if (s.events) s.events.push(data ? Object.assign({ type }, data) : { type }); }

  function gapCenter(p, tick) { return p.kind === 'bob' ? p.base + p.amp * Math.sin(p.phase + tick * p.w) : p.base; }
  function gapSize(p, tick) { return p.kind === 'chomp' ? p.gap + p.amp * Math.sin(p.phase + tick * p.w) : p.gap; }

  function spawn(s) {
    const c = config, n = s.spawned, d = difficulty(n);
    // fixed number of RNG draws per spawn keeps courses stable when tuning odds
    const rY = random(s), rKind = random(s), rPhase = random(s), rItem = random(s), rItemKind = random(s), rItemY = random(s);
    const prev = s.pipes.length ? s.pipes[s.pipes.length - 1].base : 300;
    let kind = 'static';
    const milestone = (n + 1) % 25 === 0;
    const afterSpecial = s.pipes.length && s.pipes[s.pipes.length - 1].kind !== 'static';
    if (!milestone && !(afterSpecial && rKind < 0.5)) {
      const pChomp = n >= c.chompFrom ? Math.min(0.2, 0.08 + (n - c.chompFrom) * 0.0012) : 0;
      const pBob = n >= c.bobFrom ? Math.min(0.32, 0.14 + (n - c.bobFrom) * 0.0015) : 0;
      const r = (rKind * 7.31) % 1; // decorrelate from the afterSpecial check above
      kind = r < pChomp ? 'chomp' : r < pChomp + pBob ? 'bob' : 'static';
    }
    let gap = d.gap, amp = 0, w = 0;
    if (kind === 'bob') { amp = Math.min(24 + n * 0.14, 44); w = (Math.PI * 2) / lerp(150, 118, d.t); }
    if (kind === 'chomp') { gap = d.gap + 14; amp = 17; w = (Math.PI * 2) / lerp(120, 96, d.t); }
    const half = (gap + (kind === 'chomp' ? amp : 0)) / 2;
    const lo = c.topMargin + half + (kind === 'bob' ? amp : 0);
    const hi = c.floor - c.floorMargin - half - (kind === 'bob' ? amp : 0);
    // keep the *effective* jump fair: a bobbing neighbour eats into the allowed vertical change
    const prevAmp = s.pipes.length ? s.pipes[s.pipes.length - 1].amp * (s.pipes[s.pipes.length - 1].kind === 'bob' ? 1 : 0) : 0;
    const reach = Math.max(40, d.delta - prevAmp - (kind === 'bob' ? amp : 0));
    const low = Math.max(lo, prev - reach), high = Math.min(hi, prev + reach);
    const base = low <= high ? low + rY * (high - low) : clamp(prev, lo, hi);
    const p = { id: n, x: c.spawnX, px: c.spawnX, kind, base, gap, amp, w, phase: rPhase * Math.PI * 2, milestone, scored: false, crossed: false, minClear: Infinity };
    p.gy = p.pgy = gapCenter(p, s.tick); p.g = p.pg = gapSize(p, s.tick);
    s.pipes.push(p);
    s.spawned++;
    // pickups float midway to the next pipe
    if (n >= 2) {
      const ix = c.spawnX + c.pipeWidth + (c.spacing - c.pipeWidth) / 2;
      const iy = clamp(base + (rItemY - 0.5) * 120, c.topMargin + 10, c.floor - c.floorMargin - 10);
      if (n >= 18 && n - s.lastShieldAt >= 14 && rItem < 0.055) {
        s.items.push({ kind: 'shield', x: ix, px: ix, y: iy, taken: false, id: n });
        s.lastShieldAt = n;
      } else if (rItem > 0.7 + 0.05 * rItemKind) {
        s.items.push({ kind: 'mallow', x: ix, px: ix, y: iy, taken: false, id: n });
      }
    }
  }

  // circle vs axis-aligned rectangle
  function hitsRect(cx, cy, r, x0, y0, x1, y1) {
    const nx = cx < x0 ? x0 : cx > x1 ? x1 : cx, ny = cy < y0 ? y0 : cy > y1 ? y1 : cy;
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function step(s, flap = false, frames = 1) {
    const c = config, n = Math.min(600, Math.max(1, frames | 0));
    for (let i = 0; i < n && !s.dead; i++) {
      s.py = s.y;
      if (i === 0 && flap) { s.vy = c.flap; s.flaps++; s.flapTicks.push(s.tick); emit(s, 'flap'); }
      s.vy = Math.min(c.maxFall, s.vy + c.gravity);
      s.y += s.vy;
      if (s.y < c.ceiling) { s.y = c.ceiling; if (s.vy < 0) { s.vy = 0; s.ceilingTouches++; emit(s, 'ceiling'); } }
      s.tick++;
      if (s.invuln > 0) s.invuln--;
      s.speed = difficulty(s.crossed).speed;
      s.dist += s.speed;
      s.sinceSpawn += s.speed;
      if (s.sinceSpawn >= c.spacing) { s.sinceSpawn -= c.spacing; spawn(s); }

      for (const p of s.pipes) {
        p.px = p.x; p.pgy = p.gy; p.pg = p.g;
        p.x -= s.speed;
        p.gy = gapCenter(p, s.tick); p.g = gapSize(p, s.tick);
        const top = p.gy - p.g / 2, bottom = p.gy + p.g / 2;
        const overlapping = p.x < c.x + c.radius && p.x + c.pipeWidth > c.x - c.radius;
        if (overlapping) p.minClear = Math.min(p.minClear, s.y - c.radius - top, bottom - (s.y + c.radius));
        if (!p.crossed && p.x + c.pipeWidth / 2 <= c.x) {
          p.crossed = true; s.crossed++;
          if (!s.dead) {
            p.scored = true; s.passed++; s.score++;
            const perfect = Math.abs(s.y - p.gy) < c.perfectWindow;
            if (perfect) { s.perfects++; s.perfectStreak++; s.bestPerfectStreak = Math.max(s.bestPerfectStreak, s.perfectStreak); } else s.perfectStreak = 0;
            emit(s, 'score', { perfect, streak: s.perfectStreak, milestone: p.milestone, pipe: p.id });
          }
        }
        if (overlapping && s.invuln <= 0 && !s.dead) {
          const hitTop = hitsRect(c.x, s.y, c.radius, p.x, -1e4, p.x + c.pipeWidth, top);
          const hitBottom = !hitTop && hitsRect(c.x, s.y, c.radius, p.x, bottom, p.x + c.pipeWidth, c.floor + 100);
          if (hitTop || hitBottom) {
            if (s.shield) {
              s.shield = false; s.invuln = c.invulnFrames; s.vy = hitTop ? 2 : -5;
              emit(s, 'shieldBreak', { pipe: p.id });
            } else {
              s.dead = true; s.deathCause = hitTop ? 'pipe-top' : 'pipe-bottom'; s.deathTick = s.tick;
              emit(s, 'hit', { cause: s.deathCause, pipe: p.id });
            }
          }
        }
        // near miss: pipe fully passed with a tiny clearance
        if (!p.nearChecked && p.x + c.pipeWidth < c.x - c.radius) {
          p.nearChecked = true;
          if (p.scored && !s.dead && p.minClear >= 0 && p.minClear < c.nearMiss) { s.nearMisses++; emit(s, 'nearMiss', { clear: p.minClear }); }
        }
      }
      if (s.pipes.length && s.pipes[0].x + c.pipeWidth < -20) s.pipes.shift();

      for (const it of s.items) {
        it.px = it.x; it.x -= s.speed;
        if (!it.taken && !s.dead) {
          const dx = it.x - c.x, dy = it.y - s.y, rr = c.radius + c.itemRadius + 3;
          if (dx * dx + dy * dy < rr * rr) {
            it.taken = true;
            if (it.kind === 'mallow') { s.mallows++; s.score++; emit(s, 'mallow', { x: it.x, y: it.y }); }
            else if (s.shield) { s.score++; emit(s, 'mallow', { x: it.x, y: it.y, spare: true }); }
            else { s.shield = true; emit(s, 'shield', { x: it.x, y: it.y }); }
          }
        }
      }
      if (s.items.length && s.items[0].x < -30) s.items.shift();

      if (!s.dead && s.y + c.radius > c.floor) {
        if (s.shield || s.invuln > 0) {
          if (s.shield) { s.shield = false; s.invuln = c.invulnFrames; emit(s, 'shieldBreak', { ground: true }); }
          s.y = c.floor - c.radius; s.vy = c.flap * 1.05;
        } else {
          s.y = c.floor - c.radius; s.dead = true; s.deathCause = 'ground'; s.deathTick = s.tick;
          emit(s, 'hit', { cause: 'ground' });
        }
      }
    }
    return s;
  }

  function nextPipe(s) { return s.pipes.find((p) => p.x + config.pipeWidth >= config.x - config.radius); }

  function observe(s) {
    const c = config, p = nextPipe(s);
    return {
      tick: s.tick, y: +s.y.toFixed(2), velocity: +s.vy.toFixed(2), score: s.score, passed: s.passed, mallows: s.mallows,
      dead: s.dead, cause: s.deathCause, shield: s.shield, speed: +s.speed.toFixed(3),
      nextPipe: p ? { distance: +(p.x - c.x).toFixed(2), kind: p.kind, gapTop: +(p.gy - p.g / 2).toFixed(2), gapBottom: +(p.gy + p.g / 2).toFixed(2) } : null,
    };
  }

  function clone(s) {
    return Object.assign({}, s, { pipes: s.pipes.map((p) => Object.assign({}, p)), items: s.items.map((i) => Object.assign({}, i)), flapTicks: [], events: null });
  }

  /** Cheap reflex pilot: aim slightly below the centre of the gap we'll meet. */
  function reflex(s) {
    const c = config, p = nextPipe(s);
    let target = 300;
    if (p) {
      const eta = Math.max(0, (p.x + c.pipeWidth / 2 - c.x) / s.speed);
      target = p.x - c.x < 260 ? gapCenter(p, s.tick + Math.min(eta, 40)) + 4 : target;
    }
    return s.y > target + 6 && s.vy > -1.5;
  }

  function rollout(s, first, horizon) {
    const t = clone(s);
    step(t, first);
    let i = 1;
    for (; i < horizon && !t.dead; i++) step(t, reflex(t));
    return t.dead ? i : horizon;
  }

  /** Test pilot with lookahead: only flaps when the rollouts say not flapping is worse. */
  function policy(s, horizon = 46) {
    const wait = rollout(s, false, horizon), flap = rollout(s, true, horizon);
    if (wait >= horizon && flap >= horizon) return reflex(s);
    return flap > wait;
  }

  /** Replay a recorded list of flap ticks (Daily ghost, tests). */
  function replay(seed, flapTicks, maxTicks = 60 * 60 * 20) {
    const s = create(seed); s.events = null;
    let k = 0;
    while (!s.dead && s.tick < maxTicks) {
      const f = k < flapTicks.length && flapTicks[k] === s.tick;
      if (f) k++;
      step(s, f);
    }
    return s;
  }

  return { config, difficulty, create, step, observe, policy, reflex, clone, replay, seedFrom, gapCenter, gapSize, nextPipe, random };
});
