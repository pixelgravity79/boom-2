// Damped spring integrated in small fixed sub-steps, so it stays stable at any frame rate
// (a single large step at 10-20 fps makes an explicit spring explode).
const H = 1 / 240;

/** s = { v, vel }. Moves s.v toward target. Optional clamp range. */
export function springStep(s, target, k, c, dt, lo = -Infinity, hi = Infinity) {
  let rem = Math.min(dt, 0.1);
  while (rem > 1e-6) {
    const h = Math.min(rem, H);
    s.vel += (-(s.v - target) * k - s.vel * c) * h;
    s.v += s.vel * h;
    rem -= h;
  }
  if (!Number.isFinite(s.v) || !Number.isFinite(s.vel)) { s.v = target; s.vel = 0; }
  if (s.v < lo) { s.v = lo; s.vel = Math.max(0, s.vel); }
  if (s.v > hi) { s.v = hi; s.vel = Math.min(0, s.vel); }
  return s.v;
}
