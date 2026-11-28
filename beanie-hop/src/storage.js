// Saved progress in localStorage. Every access is guarded: private mode, blocked storage or a corrupted
// value must never stop the game from starting.
const KEY = 'beanie-hop:v1';
const DEFAULTS = { best: 0, corn: 0, games: 0, hops: 0, sfx: true, music: true, seenHelp: false };

const num = (v, d = 0) => (Number.isFinite(+v) && +v >= 0 ? Math.floor(+v) : d);

export function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  const d = { ...DEFAULTS };
  if (raw && typeof raw === 'object') {
    for (const k of ['best', 'corn', 'games', 'hops']) d[k] = num(raw[k]);
    for (const k of ['sfx', 'music', 'seenHelp']) if (typeof raw[k] === 'boolean') d[k] = raw[k];
  }
  return d;
}

export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
}
