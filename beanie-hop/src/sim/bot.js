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
  if (depth === 0) return survives(g, 0.5) ? value(g) : -1e9;   // a plan must stay alive a beat longer than its last move
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
