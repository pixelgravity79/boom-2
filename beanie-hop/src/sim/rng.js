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
