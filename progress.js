/* Flappy Fellas — progression, achievements and save data.
 * Pure logic (no DOM, no storage calls) so Node tests cover exactly what the game runs.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlappyProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';

  const SAVE_VERSION = 2;

  const CHARACTERS = [
    {
      id: 'razz', name: 'Razz', sprite: 'char1', unlockAt: 0, color: '#3d7bff', accent: '#9cc0ff',
      tagline: 'Blows raspberries at gravity.', trail: 'bubbles', pitch: 1.0,
      bio: 'The original. Tongue out, zero fear, absolutely no plan.',
      quips: ['*blows a raspberry at the pipe*', 'Bleh. Again!', 'That pipe was rude first.'],
    },
    {
      id: 'critic', name: 'Couch Critic', sprite: 'char4', unlockAt: 50, color: '#ff4fa3', accent: '#ffb3d6',
      tagline: 'Unimpressed. Still flying.', trail: 'stars', pitch: 0.86,
      bio: 'Has rated every pipe in the forest. Average score: 2/10.',
      quips: ['I’d rate that flight a 2 out of 10.', 'Unimpressed. Again.', 'I saw that pipe. I chose violence.'],
    },
    {
      id: 'roadtrip', name: 'Road Tripper', sprite: 'char3', unlockAt: 100, color: '#ff4b3e', accent: '#ffb0a8',
      tagline: 'Are we there yet? Are we there yet?', trail: 'puffs', pitch: 1.12,
      bio: 'Brought snacks, a plushie and 400 questions about the route.',
      quips: ['Are we there yet? (No.)', 'Who parks a pipe on the highway?', 'I need a bathroom break.'],
    },
    {
      id: 'chill', name: 'Chill Pill', sprite: 'char2', unlockAt: 150, color: '#3fbf8f', accent: '#a9ecd2',
      tagline: 'Has never once been in a hurry.', trail: 'notes', pitch: 0.94,
      bio: 'Flies at the speed of vibes. Pipes are just suggestions.',
      quips: ['Eh. Pipes happen.', 'I meant to do that. Probably.', 'Five more minutes…'],
    },
    {
      id: 'legend', name: 'Golden Razz', sprite: 'char5', unlockAt: 200, color: '#ffc531', accent: '#fff0b3', legendary: true,
      tagline: 'Two hundred pipes. One crown.', trail: 'rainbow', pitch: 1.2,
      bio: 'Forged in 200 pipes of pure stubbornness. Leaves a rainbow. Obviously.',
      quips: ['Even legends bonk.', 'The crown stays on.', 'That pipe will be hearing from my lawyer.'],
    },
  ];
  const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

  /* Achievements. `run` checks receive the finished run summary and the save after stats were applied. */
  const ACHIEVEMENTS = [
    { id: 'liftoff', icon: '\u{1F6EB}', title: 'Liftoff', desc: 'Finish your first flight.', run: (r) => true },
    { id: 'gravity', icon: '\u{1FAA8}', title: 'Speedrun to the Floor', desc: 'Crash without flapping even once.', run: (r) => r.flaps === 0 },
    { id: 'ten', icon: '\u{1F51F}', title: 'Double Digits', desc: 'Score 10 in one flight.', run: (r) => r.score >= 10 },
    { id: 'twentyfive', icon: '\u{1F31F}', title: 'Quarter Century', desc: 'Score 25 in one flight.', run: (r) => r.score >= 25 },
    { id: 'night', icon: '\u{1F989}', title: 'Night Owl', desc: 'Fly until the stars come out (pass 30 pipes).', run: (r) => r.passed >= 30 },
    { id: 'fifty', icon: '\u{1F3C5}', title: 'Halfway to Legend', desc: 'Score 50 in one flight.', run: (r) => r.score >= 50 },
    { id: 'hundred', icon: '\u{1F4AF}', title: 'Century Club', desc: 'Score 100 in one flight.', run: (r) => r.score >= 100 },
    { id: 'legend', icon: '\u{1F451}', title: 'Living Legend', desc: 'Score 200 in one flight.', run: (r) => r.score >= 200 },
    { id: 'bullseye', icon: '\u{1F3AF}', title: 'Bullseye', desc: '5 perfect centre passes in a row.', run: (r) => r.bestPerfectStreak >= 5 },
    { id: 'shave', icon: '\u{1FA92}', title: 'Close Shave', desc: '3 hair-width near misses in one flight.', run: (r) => r.nearMisses >= 3 },
    { id: 'bubble', icon: '\u{1FAE7}', title: 'Bubble Trouble', desc: 'Survive a crash with a bubble shield.', run: (r) => r.shieldSaves >= 1 },
    { id: 'sweet', icon: '\u{1F36C}', title: 'Sweet Tooth', desc: 'Collect 50 golden marshmallows in total.', run: (r, s) => s.stats.mallows >= 50 },
    { id: 'ceiling', icon: '\u{1F64B}', title: 'Ceiling Inspector', desc: 'Bonk the sky 10 times in one flight.', run: (r) => r.ceilingTouches >= 10 },
    { id: 'marathon', icon: '⏱️', title: 'Marathon', desc: 'Stay airborne for 3 minutes.', run: (r) => r.ticks >= 60 * 180 },
    { id: 'soclose', icon: '\u{1F62C}', title: 'So Close', desc: 'Crash exactly 1 point short of an unlock.', run: (r) => r.soClose },
    { id: 'persist', icon: '\u{1F501}', title: 'Persistence', desc: 'Take 25 flights.', run: (r, s) => s.stats.runs >= 25 },
    { id: 'frequent', icon: '\u{1F9F3}', title: 'Frequent Flier', desc: 'Take 100 flights.', run: (r, s) => s.stats.runs >= 100 },
    { id: 'crew', icon: '\u{1F46F}', title: 'The Whole Crew', desc: 'Fly once as each of the four originals.', run: (r, s) => ['razz', 'critic', 'roadtrip', 'chill'].every((id) => (s.stats.charRuns[id] || 0) > 0) },
    { id: 'daily', icon: '\u{1F4C5}', title: 'Daily Flier', desc: 'Finish a Daily Flight.', run: (r) => r.mode === 'daily' },
    { id: 'ghost', icon: '\u{1F47B}', title: 'Ghostbuster', desc: 'Beat your own ghost in a Daily Flight.', run: (r) => r.mode === 'daily' && r.beatGhost },
    { id: 'poke', icon: '\u{1F449}', title: 'Personal Space', desc: 'Poke your flier on the title screen 10 times.', event: 'poke' },
  ];
  const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

  /* Cosmetic toggles earned through achievements. */
  const PERKS = [
    { id: 'bigHead', title: 'Big Head Mode', desc: 'Huge heads. Same hitbox. Pure comedy.', needs: 5 },
    { id: 'party', title: 'Party Mode', desc: 'Confetti on every single point.', needs: 10 },
  ];

  function defaultSave() {
    return {
      v: SAVE_VERSION, updatedAt: 0,
      best: 0, bestByChar: {}, legacyBest: 0,
      unlocked: ['razz'], seen: ['razz'], selected: 'razz',
      achievements: {},
      stats: { runs: 0, totalScore: 0, mallows: 0, flaps: 0, perfects: 0, nearMisses: 0, ticks: 0, pokes: 0, charRuns: {} },
      settings: { sfx: true, music: true, haptics: true, reducedMotion: false, bigHead: false, party: false },
      daily: { date: '', best: 0, ghost: [], attempts: 0, character: 'razz' },
      pendingReveal: [],
    };
  }

  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);

  /** Normalise anything (old versions, corrupted JSON, partial cloud copies) into a valid save. */
  function sanitize(raw) {
    const d = defaultSave();
    if (!raw || typeof raw !== 'object') return d;
    const s = d;
    s.updatedAt = num(raw.updatedAt);
    s.best = Math.floor(num(raw.best));
    s.legacyBest = Math.floor(num(raw.legacyBest));
    if (raw.bestByChar && typeof raw.bestByChar === 'object') for (const k of Object.keys(raw.bestByChar)) if (CHAR_BY_ID[k]) s.bestByChar[k] = Math.floor(num(raw.bestByChar[k]));
    const ids = (a) => (Array.isArray(a) ? a.filter((id) => CHAR_BY_ID[id]) : []);
    s.unlocked = Array.from(new Set(['razz', ...ids(raw.unlocked)]));
    s.seen = Array.from(new Set(['razz', ...ids(raw.seen)]));
    s.selected = CHAR_BY_ID[raw.selected] && s.unlocked.includes(raw.selected) ? raw.selected : 'razz';
    if (raw.achievements && typeof raw.achievements === 'object') for (const k of Object.keys(raw.achievements)) if (ACH_BY_ID[k]) s.achievements[k] = num(raw.achievements[k], 1) || 1;
    const st = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    for (const k of Object.keys(s.stats)) if (k !== 'charRuns') s.stats[k] = Math.floor(num(st[k]));
    if (st.charRuns && typeof st.charRuns === 'object') for (const k of Object.keys(st.charRuns)) if (CHAR_BY_ID[k]) s.stats.charRuns[k] = Math.floor(num(st.charRuns[k]));
    const se = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    for (const k of Object.keys(s.settings)) if (typeof se[k] === 'boolean') s.settings[k] = se[k];
    const dy = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
    if (typeof dy.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dy.date)) {
      s.daily.date = dy.date; s.daily.best = Math.floor(num(dy.best)); s.daily.attempts = Math.floor(num(dy.attempts));
      s.daily.ghost = Array.isArray(dy.ghost) ? dy.ghost.filter((t) => Number.isInteger(t) && t >= 0).slice(0, 20000) : [];
      s.daily.character = CHAR_BY_ID[dy.character] ? dy.character : 'razz';
    }
    s.pendingReveal = ids(raw.pendingReveal);
    // never lose an unlock the score already earned
    for (const c of CHARACTERS) if (Math.max(s.best, s.legacyBest) >= c.unlockAt && !s.unlocked.includes(c.id)) { s.unlocked.push(c.id); if (!s.pendingReveal.includes(c.id)) s.pendingReveal.push(c.id); }
    return s;
  }

  /** Read the old "Flappy Fellas · Claude Lab" best scores (stored per character). */
  function migrateLegacy(save, getItem) {
    let legacy = 0;
    for (const key of ['flappy-lab-Camp Guy', 'flappy-lab-Couch Guy']) {
      try { legacy = Math.max(legacy, Math.floor(+getItem(key) || 0)); } catch (e) { /* storage blocked */ }
    }
    if (legacy > save.legacyBest) {
      save.legacyBest = legacy;
      save.best = Math.max(save.best, legacy);
      return sanitize(save);
    }
    return save;
  }

  /** Combine two copies of a save (this device + cloud) without losing progress from either. */
  function merge(a, b) {
    a = sanitize(a); b = sanitize(b);
    const newer = a.updatedAt >= b.updatedAt ? a : b;
    const m = sanitize(newer);
    m.best = Math.max(a.best, b.best);
    m.legacyBest = Math.max(a.legacyBest, b.legacyBest);
    for (const k of new Set([...Object.keys(a.bestByChar), ...Object.keys(b.bestByChar)])) m.bestByChar[k] = Math.max(a.bestByChar[k] || 0, b.bestByChar[k] || 0);
    m.unlocked = Array.from(new Set([...a.unlocked, ...b.unlocked]));
    m.seen = Array.from(new Set([...a.seen, ...b.seen]));
    for (const k of new Set([...Object.keys(a.achievements), ...Object.keys(b.achievements)])) m.achievements[k] = Math.min(a.achievements[k] || Infinity, b.achievements[k] || Infinity);
    for (const k of Object.keys(m.stats)) if (k !== 'charRuns') m.stats[k] = Math.max(a.stats[k], b.stats[k]);
    for (const k of new Set([...Object.keys(a.stats.charRuns), ...Object.keys(b.stats.charRuns)])) m.stats.charRuns[k] = Math.max(a.stats.charRuns[k] || 0, b.stats.charRuns[k] || 0);
    if (a.daily.date === b.daily.date) {
      const better = a.daily.best >= b.daily.best ? a.daily : b.daily;
      m.daily = { date: a.daily.date, best: better.best, ghost: better.ghost.slice(), character: better.character, attempts: Math.max(a.daily.attempts, b.daily.attempts) };
    } else m.daily = JSON.parse(JSON.stringify(a.daily.date > b.daily.date ? a.daily : b.daily));
    // a reveal already shown on either device is done; anything else still gets its ceremony
    m.pendingReveal = Array.from(new Set([...a.pendingReveal, ...b.pendingReveal])).filter((id) => !m.seen.includes(id));
    m.updatedAt = Math.max(a.updatedAt, b.updatedAt);
    return sanitize(m);
  }

  function nextUnlock(save) {
    return CHARACTERS.find((c) => !save.unlocked.includes(c.id)) || null;
  }

  /** Called whenever the live score changes: unlocks immediately (so a crash a frame later can't lose it). */
  function liveUnlock(save, score) {
    const fresh = [];
    for (const c of CHARACTERS) {
      if (score >= c.unlockAt && !save.unlocked.includes(c.id)) {
        save.unlocked.push(c.id);
        if (!save.pendingReveal.includes(c.id)) save.pendingReveal.push(c.id);
        fresh.push(c);
      }
    }
    return fresh;
  }

  function grant(save, id, now) {
    if (!ACH_BY_ID[id] || save.achievements[id]) return null;
    save.achievements[id] = now || Date.now();
    return ACH_BY_ID[id];
  }

  function earnedCount(save) { return Object.keys(save.achievements).length; }
  function perkUnlocked(save, perkId) { const p = PERKS.find((x) => x.id === perkId); return !!p && earnedCount(save) >= p.needs; }

  /** Fold a finished run into the save. Returns what changed so the UI can celebrate it. */
  function applyRun(save, run, now) {
    now = now || Date.now();
    const perksBefore = PERKS.filter((p) => perkUnlocked(save, p.id)).map((p) => p.id);
    const prevBest = save.best;
    const char = CHAR_BY_ID[run.character] ? run.character : 'razz';
    const st = save.stats;
    st.runs++; st.totalScore += run.score; st.mallows += run.mallows; st.flaps += run.flaps;
    st.perfects += run.perfects; st.nearMisses += run.nearMisses; st.ticks += run.ticks;
    st.charRuns[char] = (st.charRuns[char] || 0) + 1;
    const unlocked = liveUnlock(save, run.score).map((c) => c.id);
    const newBest = run.score > prevBest;
    save.best = Math.max(save.best, run.score);
    save.bestByChar[char] = Math.max(save.bestByChar[char] || 0, run.score);
    // "so close": one short of an unlock that wasn't already earned before this run
    run.soClose = CHARACTERS.some((c) => c.unlockAt > 0 && run.score === c.unlockAt - 1 && prevBest < c.unlockAt);
    let dailyBest = false;
    if (run.mode === 'daily' && run.date) {
      if (save.daily.date !== run.date) save.daily = { date: run.date, best: 0, ghost: [], attempts: 0, character: char };
      save.daily.attempts++;
      if (run.score > save.daily.best || (save.daily.best === 0 && !save.daily.ghost.length)) {
        dailyBest = run.score > save.daily.best;
        save.daily.best = Math.max(save.daily.best, run.score);
        save.daily.ghost = (run.flapTicks || []).slice(0, 20000);
        save.daily.character = char;
      }
    }
    const achievements = [];
    for (const a of ACHIEVEMENTS) if (a.run && !save.achievements[a.id] && a.run(run, save)) achievements.push(grant(save, a.id, now));
    const perks = PERKS.filter((p) => perkUnlocked(save, p.id) && !perksBefore.includes(p.id));
    save.updatedAt = now;
    return { prevBest, newBest, unlocked, achievements, perks, dailyBest, soClose: run.soClose };
  }

  /** Pick a game-over line. `rand` in [0,1) keeps it testable. */
  function quip(run, save, info, rand) {
    const r = rand === undefined ? Math.random() : rand;
    const pick = (a) => a[Math.floor(r * a.length) % a.length];
    const c = CHAR_BY_ID[run.character] || CHARACTERS[0];
    if (run.flaps === 0) return pick(['Speedrun to the floor: complete.', 'Did you… try flapping?', 'Gravity says thanks for the easy win.']);
    if (info && info.soClose) return pick(['SO close. The pipe heard you.', 'One. Point. Short. Breathe.', 'Next flight. You’ve got this.']);
    if (info && info.newBest && run.score > 0) return pick(['New personal best! Frame it.', 'Is this… greatness?', 'Record broken. Pipes shaken.']);
    if (r < 0.4) return pick(c.quips);
    if (run.deathCause === 'ground') return pick(['Gravity: 1. You: 0.', 'The floor called. You answered.', 'That’s one way to land.']);
    if (run.deathCause === 'pipe-top') return pick(['Bonk. Right on the noggin.', 'That pipe came out of nowhere. (It didn’t.)', 'Head, meet pipe.']);
    return pick(['Pipe: undefeated.', 'Tried to limbo. Did not limbo.', 'The pipe would like an apology.']);
  }

  /** Local calendar date as YYYY-MM-DD (Daily Flight seed and reset). */
  function today(d) {
    d = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  return { SAVE_VERSION, CHARACTERS, CHAR_BY_ID, ACHIEVEMENTS, ACH_BY_ID, PERKS, defaultSave, sanitize, merge, migrateLegacy, nextUnlock, liveUnlock, grant, earnedCount, perkUnlocked, applyRun, quip, today };
});
