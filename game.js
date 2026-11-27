/* Flappy Fellas — renderer, audio, UI and game flow.
 * Simulation lives in engine.js (deterministic, 60 Hz); progression in progress.js.
 * This file only draws, plays sounds, handles input and moves between screens.
 */
(() => {
  'use strict';
  const E = window.FlappyEngine, P = window.FlappyProgress, C = E.config;
  const $ = (id) => document.getElementById(id);
  const ASSETS = window.FLAPPY_ASSETS || {};
  const spriteURL = (name) => ASSETS[name] || 'assets/' + name + '.webp';
  const STEP_MS = 1000 / 60;
  const SPR = 78;            // sprite box in world units (face is about half of it)
  const INK = '#1d1442';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (t) => t * t * (3 - 2 * t);
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  const now = () => performance.now();
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---------------------------------------------------------------- save
  const SAVE_KEY = 'flappy-fellas-save-v2';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function loadSave() {
    let raw = null;
    try { raw = JSON.parse(lsGet(SAVE_KEY) || 'null'); } catch (e) { raw = null; }
    return P.migrateLegacy(P.sanitize(raw), lsGet);
  }
  let save = loadSave();
  function persist() {
    save.updatedAt = Date.now();
    lsSet(SAVE_KEY, JSON.stringify(save));
    Cloud.queue();
  }

  // Cloud copy for claude.ai: a private per-viewer document. Absent anywhere else; the game never depends on it.
  const Cloud = {
    ref: null, busy: false, again: false, last: '', timer: 0,
    async init() {
      try {
        if (!window.claude || typeof window.claude.use !== 'function') return;
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!db || !user) return;
        const id = await user.id();
        if (!id) return;
        this.ref = db.doc('data/users/' + id + '/save');
        const snap = await this.ref.get();
        if (snap.exists) {
          const merged = P.merge(save, snap.data());
          const changed = JSON.stringify(merged) !== JSON.stringify(save);
          save = merged;
          if (changed) { lsSet(SAVE_KEY, JSON.stringify(save)); onSaveReplaced(); }
          this.last = JSON.stringify(snap.data());
        }
        this.queue();
      } catch (e) { this.ref = null; }
    },
    queue() {
      if (!this.ref) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 1500);
    },
    async flush() {
      if (!this.ref) return;
      if (this.busy) { this.again = true; return; }
      const body = JSON.stringify(save);
      if (body === this.last) return;
      this.busy = true;
      try { await this.ref.set(JSON.parse(body)); this.last = body; }
      catch (e) { if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) this.ref = null; }
      this.busy = false;
      if (this.again) { this.again = false; this.flush(); }
    },
  };

  // ---------------------------------------------------------------- audio (all synthesised, no files)
  const Sound = (() => {
    let ac = null, master, sfx, mus, noiseBuf;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function init() {
      if (ac) { if (ac.state !== 'running') ac.resume().catch(() => {}); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
      master = ac.createGain(); master.gain.value = 0.85;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
      master.connect(comp); comp.connect(ac.destination);
      sfx = ac.createGain(); sfx.connect(master);
      mus = ac.createGain(); mus.gain.value = 0; mus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const b = ac.createBuffer(1, 1, 22050), src = ac.createBufferSource();
      src.buffer = b; src.connect(ac.destination); src.start(0);
      if (ac.state !== 'running') ac.resume().catch(() => {});
      apply();
      Music.attach(ac, mus, noiseBuf);
    }
    function apply() {
      if (!ac) return;
      sfx.gain.setTargetAtTime(save.settings.sfx ? 1 : 0, ac.currentTime, 0.02);
      mus.gain.setTargetAtTime(save.settings.music ? 0.55 : 0, ac.currentTime, 0.2);
    }
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function tone(o) {
      if (!ac || !save.settings.sfx) return;
      const t = ac.currentTime + (o.delay || 0), a = o.a || 0.004;
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
      env(g, t, a, o.vol || 0.2, o.dur);
      osc.connect(g); g.connect(sfx);
      osc.start(t); osc.stop(t + a + o.dur + 0.05);
    }
    function noise(o) {
      if (!ac || !save.settings.sfx) return;
      const t = ac.currentTime + (o.delay || 0);
      const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
      f.frequency.setValueAtTime(o.f, t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
      const g = ac.createGain(); env(g, t, o.a || 0.003, o.vol || 0.2, o.dur);
      src.connect(f); f.connect(g); g.connect(sfx);
      src.start(t, Math.random() * 0.8); src.stop(t + o.dur + 0.06);
    }
    const S = {
      init, apply, get ready() { return !!ac && ac.state === 'running'; }, ctx: () => ac,
      flap(ch) {
        const p = ch ? ch.pitch : 1;
        if (ch && ch.id === 'roadtrip') { tone({ type: 'square', f: 520, dur: 0.05, vol: 0.05 }); tone({ type: 'square', f: 415, dur: 0.06, vol: 0.045, delay: 0.06 }); }
        else if (ch && ch.id === 'legend') { [0, 4, 7].forEach((n, i) => tone({ type: 'triangle', f: mtof(84 + n), dur: 0.12, vol: 0.05, delay: i * 0.025 })); }
        else tone({ type: 'sine', f: 430 * p, f2: 760 * p, dur: 0.07, vol: 0.07 });
        noise({ f: 1600 * p, f2: 500, dur: 0.09, vol: 0.16, q: 0.8 });
      },
      score(streak) { const k = 1 + Math.min(streak, 8) * 0.06; tone({ type: 'triangle', f: 988 * k, dur: 0.07, vol: 0.13 }); tone({ type: 'triangle', f: 1480 * k, dur: 0.16, vol: 0.12, delay: 0.06 }); },
      perfect(streak) { const b = 72 + Math.min(streak, 6); [0, 4, 7, 12].forEach((n, i) => tone({ type: 'sine', f: mtof(b + n + 12), dur: 0.12, vol: 0.07, delay: 0.05 + i * 0.045 })); },
      mallow() { tone({ type: 'sine', f: 520, f2: 1500, dur: 0.16, vol: 0.16 }); tone({ type: 'sine', f: 1040, f2: 2600, dur: 0.12, vol: 0.05, delay: 0.03 }); },
      shield() { [0, 3, 7, 12, 15].forEach((n, i) => tone({ type: 'sine', f: mtof(76 + n), dur: 0.25, vol: 0.06, delay: i * 0.05 })); },
      shieldBreak() { noise({ type: 'highpass', f: 3000, dur: 0.25, vol: 0.25 }); tone({ type: 'triangle', f: 1400, f2: 300, dur: 0.3, vol: 0.12 }); },
      hit() { noise({ type: 'lowpass', f: 900, f2: 120, dur: 0.28, vol: 0.5, q: 0.5 }); tone({ type: 'sine', f: 160, f2: 45, dur: 0.32, vol: 0.55 }); },
      whistle() { tone({ type: 'sine', f: 1300, f2: 260, dur: 0.7, vol: 0.06, glide: 0.7 }); },
      thud() { tone({ type: 'sine', f: 110, f2: 40, dur: 0.22, vol: 0.45 }); noise({ type: 'lowpass', f: 400, dur: 0.12, vol: 0.25 }); },
      bonk() { tone({ type: 'sine', f: 320, f2: 180, dur: 0.1, vol: 0.12 }); },
      whew() { noise({ f: 700, f2: 2600, dur: 0.22, vol: 0.1, q: 2 }); },
      click() { tone({ type: 'triangle', f: 700, f2: 900, dur: 0.05, vol: 0.08 }); },
      swoosh() { noise({ f: 400, f2: 2200, dur: 0.22, vol: 0.12, q: 1.4 }); },
      nope() { tone({ type: 'square', f: 196, dur: 0.08, vol: 0.05 }); tone({ type: 'square', f: 165, dur: 0.12, vol: 0.05, delay: 0.1 }); },
      boing() { tone({ type: 'sine', f: 260, f2: 620, dur: 0.12, vol: 0.14 }); tone({ type: 'sine', f: 620, f2: 330, dur: 0.18, vol: 0.1, delay: 0.11 }); },
      milestone() { [0, 4, 7, 12].forEach((n, i) => tone({ type: 'square', f: mtof(72 + n), dur: 0.1, vol: 0.045, delay: i * 0.07 })); },
      badge() { tone({ type: 'sine', f: 1568, dur: 0.5, vol: 0.09 }); tone({ type: 'sine', f: 1568 * 2.76, dur: 0.25, vol: 0.02 }); tone({ type: 'sine', f: 2093, dur: 0.6, vol: 0.08, delay: 0.12 }); },
      newBest() { [0, 4, 7, 12, 7, 12].forEach((n, i) => tone({ type: 'triangle', f: mtof(76 + n), dur: 0.12, vol: 0.08, delay: i * 0.08 })); },
      tick(go) { tone({ type: 'triangle', f: go ? 1320 : 880, dur: go ? 0.25 : 0.1, vol: 0.12 }); },
      drumroll(sec) {
        if (!ac || !save.settings.sfx) return;
        const t = ac.currentTime, src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2400, t + sec); f.Q.value = 1.2;
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + sec);
        const trem = ac.createGain(); const lfo = ac.createOscillator(); lfo.frequency.value = 22; const lg = ac.createGain(); lg.gain.value = 0.5;
        lfo.connect(lg); lg.connect(trem.gain); trem.gain.value = 0.5;
        src.connect(f); f.connect(trem); trem.connect(g); g.connect(sfx);
        src.start(t); lfo.start(t); src.stop(t + sec + 0.05); lfo.stop(t + sec + 0.05);
        tone({ type: 'sine', f: 200, f2: 800, dur: sec, vol: 0.05, glide: sec });
        S._roll = { src, lfo, g };
      },
      stopRoll() { const r = S._roll; if (r && ac) { try { r.g.gain.cancelScheduledValues(ac.currentTime); r.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.01); r.src.stop(ac.currentTime + 0.05); r.lfo.stop(ac.currentTime + 0.05); } catch (e) { /* already stopped */ } } S._roll = null; },
      fanfare(big) {
        const seq = big ? [[72, 0], [76, 0.1], [79, 0.2], [84, 0.32], [88, 0.32], [91, 0.32]] : [[72, 0], [76, 0.08], [79, 0.16], [84, 0.26]];
        seq.forEach(([m, d], i) => { tone({ type: 'sawtooth', f: mtof(m), dur: i >= seq.length - 3 ? 0.9 : 0.14, vol: 0.05, delay: d }); tone({ type: 'triangle', f: mtof(m), dur: i >= seq.length - 3 ? 1.0 : 0.14, vol: 0.07, delay: d }); });
        noise({ type: 'highpass', f: 5000, dur: 1.2, vol: 0.12, delay: big ? 0.32 : 0.26, a: 0.01 });
        if (big) tone({ type: 'sine', f: mtof(48), dur: 1.2, vol: 0.25, delay: 0.32 });
      },
      pop() { noise({ type: 'highpass', f: 2500, dur: 0.04, vol: 0.12 }); },
    };
    return S;
  })();

  // Procedural camp-chiptune: chords, bass, hats and a whistle-ish tune that speeds up with difficulty.
  const Music = (() => {
    let ac = null, out = null, nbuf = null, timer = 0, step = 0, next = 0, playing = false;
    let bpm = 100, intensity = 0, night = false;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const CH = { C: [60, 64, 67], G: [59, 62, 67], Am: [57, 60, 64], F: [57, 60, 65], Em: [59, 64, 67] };
    const BASS = { C: 36, G: 43, Am: 45, F: 41, Em: 40 };
    const DAY = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'];
    const NIGHT = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Em', 'G'];
    const MEL = [
      [[0, 76], [2, 79], [4, 81], [6, 79], [8, 76], [12, 74], [14, 72]],
      [[0, 74], [4, 67], [8, 74], [10, 76], [12, 74]],
      [[0, 72], [2, 76], [4, 81], [8, 79], [10, 76], [12, 72]],
      [[0, 69], [2, 72], [4, 74], [6, 72], [8, 69], [12, 67]],
      [[0, 76], [2, 79], [4, 84], [8, 81], [10, 79], [12, 76], [14, 79]],
      [[0, 74], [4, 71], [8, 74], [10, 79], [12, 74]],
      [[0, 72], [2, 69], [4, 72], [6, 77], [8, 76], [10, 74], [12, 72]],
      [[0, 74], [4, 76], [8, 79]],
    ].map((bar) => { const a = new Array(16).fill(0); bar.forEach(([s, m]) => (a[s] = m)); return a; });
    function note(type, f, t, dur, vol, cutoff) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (cutoff) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = cutoff; o.connect(fl); fl.connect(g); } else o.connect(g);
      g.connect(out); o.start(t); o.stop(t + dur + 0.02);
    }
    function hat(t, vol) {
      const s = ac.createBufferSource(); s.buffer = nbuf;
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + 0.05);
    }
    function kick(t) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.18);
    }
    function snare(t) {
      const s = ac.createBufferSource(); s.buffer = nbuf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7;
      const g = ac.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + 0.13);
    }
    function play(st, t) {
      const bar = (st >> 4) % 8, s16 = st & 15, prog = night ? NIGHT : DAY, ch = prog[bar];
      const beat = 60 / bpm;
      if (s16 % 4 === 0) note('triangle', mtof(BASS[ch] + (s16 === 8 ? 7 : 0)), t, beat * 0.9, 0.22);
      if (s16 % 2 === 0) { const tones = CH[ch], pat = [0, 1, 2, 1, 0, 2, 1, 2]; note('square', mtof(tones[pat[s16 >> 1]] + 12), t, beat * 0.4, night ? 0.025 : 0.032, night ? 1400 : 2600); }
      if (intensity > 0) {
        if (s16 % 4 === 2) hat(t, 0.05);
        if (s16 === 0 || s16 === 8 || (s16 === 10 && bar % 2)) kick(t);
        if (s16 === 4 || s16 === 12) snare(t);
        const m = MEL[bar][s16];
        if (m && !night) note('triangle', mtof(m), t, beat * 0.55, 0.06, 4000);
      } else if (s16 === 0 && bar % 2 === 0) note('sine', mtof(CH[ch][2] + 24), t, beat * 1.5, 0.02);
    }
    function sched() {
      if (!ac || !playing) return;
      while (next < ac.currentTime + 0.12) { play(step, next); next += 60 / bpm / 4; step = (step + 1) % 128; }
    }
    return {
      attach(a, o, n) { ac = a; out = o; nbuf = n; if (playing) this.start(); },
      start() { playing = true; if (!ac) return; if (!timer) { next = Math.max(next, ac.currentTime + 0.05); timer = setInterval(sched, 25); } },
      stop() { playing = false; clearInterval(timer); timer = 0; },
      set(o) { if (o.bpm) bpm = o.bpm; if (o.intensity !== undefined) intensity = o.intensity; if (o.night !== undefined) night = o.night; },
      duck(ms) { if (!ac || !out) return; const t = ac.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(save.settings.music ? 0.12 : 0, t, 0.05); out.gain.setTargetAtTime(save.settings.music ? 0.55 : 0, t + ms / 1000, 0.4); },
    };
  })();

  function haptic(pattern) {
    if (!save.settings.haptics) return;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
      else if (isIOS && inGesture) $('hapticSwitch').click();
    } catch (e) { /* unsupported */ }
  }
  let inGesture = false;

  // ---------------------------------------------------------------- canvases and layout
  const stage = $('stage'), cv = $('game'), ctx = cv.getContext('2d', { alpha: false });
  const fxc = $('fx'), fx = fxc.getContext('2d');
  const view = { W: 420, H: 680, k: 1, dpr: 1, Hv: 680, top: 20, bottom: 660, maxDpr: 2 };
  const quality = { level: 2, slowFrames: 0, frames: 0 };

  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  function layout() {
    const r = stage.getBoundingClientRect();
    view.W = Math.max(200, r.width); view.H = Math.max(300, r.height);
    view.dpr = Math.min(window.devicePixelRatio || 1, view.maxDpr, Math.sqrt(2.2e6 / (view.W * view.H)));
    view.k = view.W / C.width;
    view.Hv = view.H / view.k;
    const extra = Math.max(0, view.Hv - C.height);
    view.top = extra * 0.5;                 // world units of sky above y=0
    view.bottom = C.height + extra * 0.5;   // world y at the bottom edge
    cv.width = Math.round(view.W * view.dpr); cv.height = Math.round(view.H * view.dpr);
    fxc.width = cv.width; fxc.height = cv.height;
    buildLayers();
    buildSprites();
    updateTitleAnchor();
    skyCache.key = '';
    if (rotateMQ.matches && mode === 'play') pause();
  }
  const rotateMQ = window.matchMedia('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)');

  // world y on screen = (y + view.top) * k
  const toScreenY = (y) => (y + view.top) * view.k;
  const toWorldY = (py) => py / view.k - view.top;

  // ---------------------------------------------------------------- pre-rendered layers
  const L = {};
  let lrSeed = 1;
  const lr = () => ((lrSeed = (lrSeed * 16807) % 2147483647) / 2147483647);
  function layerCanvas(wWorld, hWorld) {
    const s = view.k * view.dpr, c = mk(wWorld * s, hWorld * s), g = c.getContext('2d');
    g.scale(s, s); return [c, g];
  }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function pine(g, x, base, h, dark, light) {
    const w = h * 0.46;
    g.fillStyle = '#5b3a24'; g.fillRect(x - h * 0.035, base - h * 0.16, h * 0.07, h * 0.18);
    for (let i = 0; i < 3; i++) {
      const ty = base - h + i * h * 0.24, by = base - h * 0.12 - (2 - i) * h * 0.13, ww = w * (0.55 + i * 0.25);
      g.fillStyle = dark; g.beginPath(); g.moveTo(x, ty); g.lineTo(x + ww, by); g.lineTo(x - ww, by); g.closePath(); g.fill();
      g.fillStyle = light; g.beginPath(); g.moveTo(x, ty); g.lineTo(x - ww * 0.15, by); g.lineTo(x - ww, by); g.closePath(); g.fill();
    }
  }
  function buildLayers() {
    const SW = 840;
    // far mountains (tile 840 wide, 240 tall, base at world y 480)
    lrSeed = 7;
    {
      const [c, g] = layerCanvas(SW, 240);
      const ridge = (amp, base, f1, f2, ph, color, cap) => {
        g.fillStyle = color; g.beginPath(); g.moveTo(0, 240);
        const pts = [];
        for (let x = 0; x <= SW; x += 6) {
          const y = base - amp * (0.55 * Math.sin((x / SW) * TAU * f1 + ph) + 0.3 * Math.sin((x / SW) * TAU * f2 + ph * 2) + 0.15 * Math.sin((x / SW) * TAU * 9 + ph));
          pts.push([x, y]); g.lineTo(x, y);
        }
        g.lineTo(SW, 240); g.closePath(); g.fill();
        if (cap) {
          g.fillStyle = cap;
          for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i]; if (y < base - amp * 0.62 && pts[i - 1][1] > y && pts[i + 1][1] >= y) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y + 22); g.lineTo(x + 12, y + 18); g.lineTo(x, y + 26); g.lineTo(x - 12, y + 18); g.lineTo(x - 26, y + 22); g.closePath(); g.fill(); } }
        }
      };
      ridge(70, 120, 2, 5, 0.4, '#a9c8f2', '#eef6ff');
      ridge(55, 165, 3, 7, 1.7, '#86aee6', null);
      L.mountains = c;
    }
    // tree line with a camp cabin + flag (tile 840 wide, 190 tall, base at world y 565)
    lrSeed = 21;
    {
      const [c, g] = layerCanvas(SW, 190);
      g.fillStyle = '#4b9a5a'; g.beginPath(); g.moveTo(0, 190);
      for (let x = 0; x <= SW; x += 6) g.lineTo(x, 120 - 14 * Math.sin((x / SW) * TAU * 3) - 8 * Math.sin((x / SW) * TAU * 7 + 1));
      g.lineTo(SW, 190); g.closePath(); g.fill();
      // cabin
      const cx = 520, cy = 128;
      g.fillStyle = '#8a5a35'; g.fillRect(cx - 34, cy - 30, 68, 34);
      g.fillStyle = '#6d4426'; for (let i = 0; i < 4; i++) g.fillRect(cx - 34, cy - 26 + i * 8, 68, 2);
      g.fillStyle = '#c0463b'; g.beginPath(); g.moveTo(cx - 44, cy - 28); g.lineTo(cx, cy - 58); g.lineTo(cx + 44, cy - 28); g.closePath(); g.fill();
      g.fillStyle = '#3b2416'; g.fillRect(cx - 7, cy - 18, 14, 22);
      g.fillStyle = '#ffd86b'; g.fillRect(cx + 14, cy - 20, 12, 10); g.fillRect(cx - 26, cy - 20, 12, 10);
      // flag pole
      g.fillStyle = '#ececec'; g.fillRect(cx + 62, cy - 92, 3, 96);
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(cx + 65, cy - 92); g.lineTo(cx + 95, cy - 84); g.lineTo(cx + 65, cy - 76); g.closePath(); g.fill();
      const trees = [];
      for (let x = 8; x < SW; x += 18 + lr() * 26) { if (Math.abs(x - cx) < 60 || Math.abs(x - cx - 64) < 14) continue; trees.push([x, 0.75 + lr() * 0.7]); }
      trees.sort((a, b) => a[1] - b[1]);
      for (const [x, s] of trees) for (const off of [0, SW, -SW]) { const xx = x + off; if (xx > -60 && xx < SW + 60) pine(g, xx, 150 + (1.45 - s) * 18, 92 * s, '#2f7047', '#3f8f59'); }
      L.trees = c;
    }
    // bushes (tile 600 wide, 70 tall, base at the floor)
    lrSeed = 99;
    {
      const BW = 600, [c, g] = layerCanvas(BW, 70);
      const blobs = [];
      for (let x = 0; x < BW; x += 26 + lr() * 30) blobs.push([x, 16 + lr() * 18]);
      for (const [x, r] of blobs) for (const off of [0, BW, -BW]) {
        const xx = x + off; if (xx < -50 || xx > BW + 50) continue;
        g.fillStyle = '#3a8a41'; g.beginPath(); g.arc(xx, 70, r, Math.PI, 0); g.fill();
        g.fillStyle = '#5cb85c'; g.beginPath(); g.arc(xx - r * 0.25, 70 - r * 0.15, r * 0.7, Math.PI, 0); g.fill();
      }
      lrSeed = 5;
      for (let i = 0; i < 18; i++) { const x = lr() * BW, y = 50 + lr() * 18; g.fillStyle = ['#fff', '#ffd23f', '#ff8fb1'][i % 3]; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill(); }
      L.bushes = c; L.bushW = BW;
    }
    // ground tile: grass lip with diagonal stripes, dirt below with pebbles
    {
      const TW = 96, depth = Math.max(60, view.bottom - C.floor + 4), [c, g] = layerCanvas(TW, depth);
      g.fillStyle = '#d99a5b'; g.fillRect(0, 0, TW, depth);
      g.fillStyle = '#c4834a'; for (let y = 34; y < depth; y += 26) g.fillRect(0, y, TW, 3);
      lrSeed = 3;
      for (let i = 0; i < Math.ceil(depth / 12); i++) { g.fillStyle = i % 2 ? '#b8743f' : '#e8b27a'; g.beginPath(); g.ellipse(lr() * TW, 22 + lr() * (depth - 26), 3 + lr() * 3, 2 + lr() * 2, 0, 0, TAU); g.fill(); }
      g.fillStyle = '#7ed957'; g.fillRect(0, 0, TW, 16);
      g.fillStyle = '#6cc443';
      for (let x = -16; x < TW; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, 0); g.lineTo(x + 24, 16); g.lineTo(x + 12, 16); g.closePath(); g.fill(); }
      g.fillStyle = '#4e9a33'; g.fillRect(0, 16, TW, 4);
      g.fillStyle = INK; g.fillRect(0, -1, TW, 3);
      g.fillStyle = '#b6f08f'; g.fillRect(0, 2, TW, 2);
      L.ground = c; L.groundW = TW;
    }
    // clouds
    L.clouds = [0, 1, 2].map((i) => {
      lrSeed = 40 + i * 13;
      const w = 120 + i * 30, h = 56 + i * 8, [c, g] = layerCanvas(w, h);
      // puffs stay inside the canvas (no clipped edges); flat-ish bottom like a cartoon cloud
      const puffs = [], base = h * 0.7;
      for (let j = 0; j < 5; j++) { const r = h * (0.2 + 0.14 * Math.sin(((j + 0.5) / 5) * Math.PI) + lr() * 0.05); puffs.push([r + 2 + (j / 4) * (w - 2 * r - 4), base - r * 0.55 - Math.sin((j / 4) * Math.PI) * h * 0.18, r]); }
      const blob = (dy, col) => { g.fillStyle = col; g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y + dy); g.arc(x, y + dy, Math.min(r, base + dy - y + r * 0.2), 0, TAU); } g.fill(); rr(g, puffs[0][0], base - h * 0.22 + dy, puffs[4][0] - puffs[0][0], h * 0.22, h * 0.11); g.fill(); };
      blob(4, '#cfe6ff'); blob(0, '#ffffff');
      return { c, w, h };
    });
    // sun, moon, glow, stars
    {
      const [c, g] = layerCanvas(180, 180);
      const gr = g.createRadialGradient(90, 90, 10, 90, 90, 90); gr.addColorStop(0, '#fff7c2'); gr.addColorStop(0.35, '#ffe8857a'); gr.addColorStop(1, '#ffe88500');
      g.fillStyle = gr; g.fillRect(0, 0, 180, 180);
      g.fillStyle = '#ffe36e'; g.beginPath(); g.arc(90, 90, 30, 0, TAU); g.fill();
      g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(82, 82, 18, 0, TAU); g.fill();
      L.sun = c;
    }
    {
      const [c, g] = layerCanvas(160, 160);
      const gr = g.createRadialGradient(80, 80, 10, 80, 80, 80); gr.addColorStop(0, '#dfe6ff60'); gr.addColorStop(1, '#dfe6ff00');
      g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
      g.fillStyle = '#f4f1ff'; g.beginPath(); g.arc(80, 80, 24, 0, TAU); g.fill();
      g.fillStyle = '#d6d0f0'; [[72, 72, 5], [90, 86, 4], [76, 92, 3]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); });
      L.moon = c;
    }
    {
      const [c, g] = layerCanvas(40, 40);
      const gr = g.createRadialGradient(20, 20, 0, 20, 20, 20); gr.addColorStop(0, '#fffbd0'); gr.addColorStop(0.25, '#e8ff7a99'); gr.addColorStop(1, '#e8ff7a00');
      g.fillStyle = gr; g.fillRect(0, 0, 40, 40); L.glow = c;
    }
    {
      const [c, g] = layerCanvas(C.width, view.Hv * 0.7);
      lrSeed = 11;
      for (let i = 0; i < 110; i++) { const x = lr() * C.width, y = lr() * view.Hv * 0.7, r = lr() < 0.15 ? 1.6 : 0.9; g.fillStyle = lr() < 0.2 ? '#ffe9a8' : '#ffffff'; g.globalAlpha = 0.5 + lr() * 0.5; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      L.stars = c;
    }
    // pipe gradients (in pipe-local x)
    L.pipes = {};
    const pg = (stops) => { const gr = ctx.createLinearGradient(0, 0, C.pipeWidth, 0); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
    const cg = (stops) => { const gr = ctx.createLinearGradient(-6, 0, C.pipeWidth + 6, 0); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
    const theme = (a, b, c2, d) => ({ body: pg([[0, a], [0.18, c2], [0.32, d], [0.6, b], [1, a]]), cap: cg([[0, a], [0.16, c2], [0.3, d], [0.62, b], [1, a]]), edge: a, light: d });
    L.pipes.static = theme('#1f6b2e', '#43a447', '#6fd36a', '#b8f59a');
    L.pipes.bob = theme('#155e75', '#2aa3c7', '#5fd3ef', '#bff4ff');
    L.pipes.chomp = theme('#5b1f78', '#8e3fbf', '#b46be0', '#e7c2ff');
    L.pipes.gold = theme('#9a6400', '#e0a400', '#ffd23f', '#fff3b0');
  }

  // ---------------------------------------------------------------- character sprites
  const IMG = {};
  const SPR_CACHE = {};
  let spritesReady = false;
  function loadImages() {
    const names = P.CHARACTERS.map((c) => c.sprite);
    return Promise.all(names.map((n) => new Promise((res) => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { IMG[n] = im; res(); };
      im.onerror = () => res();
      im.src = spriteURL(n);
    })));
  }
  function bigHead() { return save.settings.bigHead && P.perkUnlocked(save, 'bigHead'); }
  function buildSprites() {
    const scale = bigHead() ? 1.55 : 1;
    const px = Math.ceil(SPR * scale * view.k * view.dpr);
    for (const ch of P.CHARACTERS) {
      const im = IMG[ch.sprite]; if (!im) continue;
      // two-step downscale keeps the photo crisp instead of aliased
      let src = im;
      if (im.width > px * 2) { const mid = mk(px * 2, px * 2); const g = mid.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, mid.width, mid.height); src = mid; }
      const c = mk(px, px), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, px, px);
      SPR_CACHE[ch.id] = c;
    }
    // wing: feathered, outlined, drawn pointing right from the shoulder
    {
      const s = view.k * view.dpr * scale, w = 40, h = 30, c = mk(w * s, h * s), g = c.getContext('2d');
      g.scale(s, s); g.lineJoin = 'round';
      const path = () => { g.beginPath(); g.moveTo(3, 20); g.bezierCurveTo(8, 2, 28, 0, 38, 6); g.bezierCurveTo(34, 9, 36, 12, 31, 13); g.bezierCurveTo(33, 16, 30, 19, 25, 19); g.bezierCurveTo(26, 23, 20, 25, 15, 24); g.bezierCurveTo(11, 28, 5, 27, 3, 20); g.closePath(); };
      path(); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
      g.strokeStyle = '#b9c7ea'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(10, 17); g.quadraticCurveTo(20, 12, 31, 13); g.moveTo(9, 21); g.quadraticCurveTo(16, 19, 25, 19); g.stroke();
      SPR_CACHE.wing = c; SPR_CACHE.wingW = w * scale; SPR_CACHE.wingH = h * scale;
    }
    // crown for the legendary flier
    {
      const s = view.k * view.dpr * scale, w = 40, h = 28, c = mk(w * s, h * s), g = c.getContext('2d');
      g.scale(s, s); g.lineJoin = 'round';
      g.beginPath(); g.moveTo(4, 25); g.lineTo(2, 7); g.lineTo(12, 15); g.lineTo(20, 2); g.lineTo(28, 15); g.lineTo(38, 7); g.lineTo(36, 25); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, 28); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(1, '#e0a000');
      g.fillStyle = gr; g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
      [[20, 17, '#ff4b6e'], [10, 20, '#3fb4ff'], [30, 20, '#2ed3a0']].forEach(([x, y, col]) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); });
      SPR_CACHE.crown = c; SPR_CACHE.crownW = w * scale; SPR_CACHE.crownH = h * scale;
    }
    spritesReady = true;
  }

  // ---------------------------------------------------------------- particles
  const parts = [], pool = [];
  let maxParts = 320;
  function part(type, x, y, o) {
    if (parts.length >= maxParts) return null;
    const p = pool.pop() || {};
    p.type = type; p.x = x; p.y = y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.g = o.g || 0; p.drag = o.drag || 1;
    p.life = p.max = o.life || 40; p.size = o.size || 4; p.grow = o.grow || 0; p.color = o.color || '#fff';
    p.rot = o.rot || 0; p.vr = o.vr || 0; p.scroll = o.scroll || 0; p.alpha = o.alpha === undefined ? 1 : o.alpha;
    parts.push(p); return p;
  }
  const CONF = ['#ff5d73', '#ffd23f', '#2ed3a0', '#3fb4ff', '#7a5cff', '#ff8a1f', '#ffffff'];
  function burst(x, y, n, kind, spread) {
    const sp = spread || 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = rand(0.4, 1) * sp;
      if (kind === 'confetti') part('confetti', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, g: 0.12, drag: 0.98, life: rand(50, 90), size: rand(4, 7), color: CONF[i % CONF.length], vr: rand(-0.3, 0.3) });
      else if (kind === 'spark') part('spark', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.92, life: rand(18, 30), size: rand(2, 4), color: '#fff6b0' });
      else if (kind === 'star') part('star', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.93, life: rand(25, 40), size: rand(5, 9), color: '#ffe066', vr: rand(-0.2, 0.2) });
      else if (kind === 'feather') part('feather', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, g: 0.05, drag: 0.96, life: rand(60, 100), size: rand(6, 9), color: '#ffffff', vr: rand(-0.2, 0.2) });
      else if (kind === 'shard') part('shard', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.15, drag: 0.97, life: rand(30, 50), size: rand(4, 8), color: '#bdefff', vr: rand(-0.4, 0.4) });
      else part('puff', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 0.9, life: rand(20, 32), size: rand(5, 9), grow: 0.4, color: '#ffffff', alpha: 0.8 });
    }
  }
  function updateParts(f, scroll) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vx *= Math.pow(p.drag, f); p.vy *= Math.pow(p.drag, f); p.vy += p.g * f;
      p.x += (p.vx - p.scroll * scroll) * f; p.y += p.vy * f; p.rot += p.vr * f; p.size += p.grow * f;
      if (p.type === 'confetti') p.vx += Math.sin(p.life * 0.2) * 0.05 * f;
      p.life -= f;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); pool.push(p); }
    }
  }
  function star5(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5 - Math.PI / 2, rr2 = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    g.closePath();
  }
  function drawParts() {
    for (const p of parts) {
      const t = p.life / p.max;
      ctx.globalAlpha = p.alpha * Math.min(1, t * 2.2);
      switch (p.type) {
        case 'confetti': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); break;
        case 'spark': ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t + 0.5, 0, TAU); ctx.fill(); break;
        case 'star': ctx.fillStyle = p.color; star5(ctx, p.x, p.y, p.size * (0.5 + t * 0.5), p.rot); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke(); break;
        case 'feather': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#8e98c8'; ctx.stroke(); ctx.restore(); break;
        case 'shard': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.5, p.size * 0.6); ctx.lineTo(-p.size * 0.5, p.size * 0.4); ctx.closePath(); ctx.fill(); ctx.restore(); break;
        case 'bubble': ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffffffd0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke(); ctx.fillStyle = '#ffffff90'; ctx.beginPath(); ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.25, 0, TAU); ctx.fill(); break;
        case 'note': ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 0.7, p.size * 0.5, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(p.x + p.size * 0.45, p.y - p.size * 2, 2, p.size * 2); ctx.fillRect(p.x + p.size * 0.45, p.y - p.size * 2, p.size * 0.9, 2.2); break;
        case 'zzz': ctx.font = `${Math.round(p.size)}px "Lilita One", sans-serif`; ctx.fillStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText('z', p.x, p.y); ctx.fillText('z', p.x, p.y); break;
        case 'firefly': ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(p.life * 0.15 + p.rot); ctx.drawImage(L.glow, p.x - 10, p.y - 10, 20, 20); ctx.globalCompositeOperation = 'source-over'; break;
        default: ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // floating text popups in world space
  const pops = [];
  function popup(text, x, y, o = {}) {
    if (pops.length > 6) pops.shift();
    pops.push({ text, x, y, life: o.life || 55, max: o.life || 55, size: o.size || 26, color: o.color || '#fff', vy: o.vy === undefined ? -0.9 : o.vy });
  }
  function drawPops(f) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= f; p.y += p.vy * f;
      if (p.life <= 0) { pops.splice(i, 1); continue; }
      const t = 1 - p.life / p.max, sc = t < 0.15 ? 0.6 + (t / 0.15) * 0.55 : t < 0.25 ? 1.15 - ((t - 0.15) / 0.1) * 0.15 : 1;
      ctx.globalAlpha = Math.min(1, p.life / 14);
      ctx.font = `${Math.round(p.size * sc)}px "Lilita One","Arial Rounded MT Bold",sans-serif`;
      ctx.lineWidth = Math.max(4, p.size * 0.24); ctx.strokeStyle = INK; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  // overlay confetti (above the UI, screen pixels)
  const fxParts = [];
  let fxDirty = false;
  function fxConfetti(n, x, y, power) {
    const W = view.W, H = view.H;
    x = x === undefined ? W / 2 : x; y = y === undefined ? H * 0.42 : y;
    const pw = power || 1;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.25, 1.25), v = rand(5, 15) * pw;
      fxParts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, TAU), vr: rand(-0.3, 0.3), w: rand(6, 11), h: rand(3, 6), c: CONF[i % CONF.length], life: rand(90, 150), wob: rand(0, TAU) });
    }
  }
  function fxRain(n) { for (let i = 0; i < n; i++) fxParts.push({ x: rand(0, view.W), y: rand(-view.H * 0.5, -10), vx: rand(-1, 1), vy: rand(2, 5), rot: rand(0, TAU), vr: rand(-0.2, 0.2), w: rand(6, 11), h: rand(3, 6), c: CONF[i % CONF.length], life: rand(140, 220), wob: rand(0, TAU) }); }
  function drawFx(f) {
    if (!fxParts.length) { if (fxDirty) { fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, fxc.width, fxc.height); fxDirty = false; } return; }
    fx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    fx.clearRect(0, 0, view.W, view.H);
    for (let i = fxParts.length - 1; i >= 0; i--) {
      const p = fxParts[i];
      p.vx *= Math.pow(0.985, f); p.vy = p.vy * Math.pow(0.985, f) + 0.22 * f; p.x += (p.vx + Math.sin((p.wob += 0.1 * f)) * 0.8) * f; p.y += p.vy * f; p.rot += p.vr * f; p.life -= f;
      if (p.life <= 0 || p.y > view.H + 20) { fxParts.splice(i, 1); continue; }
      fx.save(); fx.translate(p.x, p.y); fx.rotate(p.rot); fx.scale(1, Math.cos(p.wob * 1.3)); fx.globalAlpha = Math.min(1, p.life / 30); fx.fillStyle = p.c; fx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); fx.restore();
    }
    fxDirty = true;
  }

  // ---------------------------------------------------------------- world look: time of day
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const TOD = [
    { skyT: '#33a3ff', skyB: '#c4ecff', tint: '#000000', tintA: 0, sun: 1, stars: 0, lake: '#8fd8ff', lake2: '#58b8f0' },
    { skyT: '#4b3f9c', skyB: '#ff9a5c', tint: '#ff6a3d', tintA: 0.2, sun: 0.45, stars: 0.1, lake: '#ffb08a', lake2: '#c2617a' },
    { skyT: '#060a28', skyB: '#283a78', tint: '#0b1446', tintA: 0.5, sun: 0, stars: 1, lake: '#2b3f80', lake2: '#151f4a' },
    { skyT: '#5a6fd0', skyB: '#ffc4b8', tint: '#ff7fa0', tintA: 0.14, sun: 0.35, stars: 0.3, lake: '#ffc6cc', lake2: '#a67fc4' },
  ].map((k) => Object.assign({}, k, { _skyT: hex(k.skyT), _skyB: hex(k.skyB), _tint: hex(k.tint), _lake: hex(k.lake), _lake2: hex(k.lake2) }));
  const mixc = (a, b, t, al) => `rgba(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))},${al === undefined ? 1 : al})`;
  function todState(tod) {
    const i = Math.floor(tod) % 4, j = (i + 1) % 4, fr = tod - Math.floor(tod), t = smooth(clamp((fr - 0.62) / 0.38, 0, 1));
    const a = TOD[i], b = TOD[j];
    return { t, a, b, sun: lerp(a.sun, b.sun, t), stars: lerp(a.stars, b.stars, t), tintA: lerp(a.tintA, b.tintA, t), night: lerp(a.stars, b.stars, t) > 0.6, phase: t > 0.5 ? j : i };
  }
  function clockTod() {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    if (h >= 6.5 && h < 17.5) return 0.1;
    if (h >= 17.5 && h < 19.75) return 1.1;
    if (h >= 19.75 || h < 5.25) return 2.1;
    return 3.1;
  }

  // ---------------------------------------------------------------- game state
  let mode = 'boot';             // boot | title | ready | play | dying | over | paused | countdown
  let s = E.create(1);           // current simulation
  let runMode = 'classic', runDate = '', ghost = null, ghostTicks = [], ghostK = 0, ghostDeadAt = -1;
  let char = P.CHAR_BY_ID[save.selected] || P.CHARACTERS[0];
  let acc = 0, last = 0, timeScale = 1, autopilot = false, pending = false;
  let bgDist = 0, baseTod = clockTod(), tod = baseTod, todS = todState(tod);
  let runInfo = null, lastRun = null, shieldSaves = 0, beatGhost = false, bestToastDone = false, prevScore = 0, lastMilestone = 0;
  let overAt = 0, stateAt = 0, idleSince = now(), pokeCount = 0, hitStop = 0;
  const fxState = { shake: 0, flash: 0, flashColor: '#fff', zoom: 0 };
  const P1 = { x: 210, y: 300, dispX: 210, dispY: 300, scale: 1.6, rot: 0, sx: 1, sy: 1, wing: 0, wingV: 0, blink: 0, bob: 0, react: null, speech: null };
  const death = { y: 0, vy: 0, rot: 0, vr: 0, landed: false, t: 0, whistled: false, boinged: false };
  const overAnchor = { y: 160, scale: 1.3 };
  const backOut = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
  const trail = [];
  const bgEvents = [];
  let bgTimer = 300, fireflies = [];
  let titleAnchorY = 330;
  const sessionNew = { chars: new Set(), badges: 0 };
  const recentScores = [];

  function char0() { return P.CHAR_BY_ID[save.selected] || P.CHARACTERS[0]; }

  // ---------------------------------------------------------------- HUD (DOM, touched only on change)
  const hud = { score: $('score'), pill: $('pill'), pillImg: $('pillImg'), pillLabel: $('pillLabel'), pillBar: $('pillBar'), pillNum: $('pillNum'), streak: $('streak'), shield: $('shieldChip'), mode: $('modeChip') };
  let hudScore = -1, hudStreak = -1, hudShield = null;
  function hudTarget() {
    const nxt = P.nextUnlock(save);
    if (nxt) return { label: 'Unlock ' + nxt.name, goal: nxt.unlockAt, img: spriteURL(nxt.sprite), lock: true };
    return { label: runMode === 'daily' ? 'Daily best' : 'Personal best', goal: Math.max(1, runMode === 'daily' && save.daily.date === runDate ? save.daily.best : save.best), img: spriteURL(char.sprite), lock: false };
  }
  let hudGoal = null;
  function hudReset() {
    hudScore = -1; hudStreak = -1; hudShield = null;
    hudGoal = hudTarget();
    hud.pillImg.src = hudGoal.img;
    hud.pillImg.style.filter = hudGoal.lock ? '' : 'none';
    hud.pillLabel.textContent = hudGoal.label;
    hud.mode.hidden = runMode !== 'daily';
    hud.score.classList.remove('gold');
    hudUpdate(true);
  }
  function hudUpdate(force) {
    if (s.score !== hudScore || force) {
      const up = s.score > hudScore && hudScore >= 0;
      hudScore = s.score;
      hud.score.textContent = String(s.score);
      if (up) { hud.score.classList.remove('pop'); void hud.score.offsetWidth; hud.score.classList.add('pop'); }
      const g = hudGoal || hudTarget();
      hud.pillNum.textContent = s.score + '/' + g.goal;
      hud.pillBar.style.width = Math.min(100, (s.score / g.goal) * 100) + '%';
    }
    if (s.perfectStreak !== hudStreak) {
      hudStreak = s.perfectStreak;
      if (hudStreak >= 2) { hud.streak.hidden = false; hud.streak.textContent = 'Perfect ×' + hudStreak; hud.streak.style.animation = 'none'; void hud.streak.offsetWidth; hud.streak.style.animation = ''; }
      else hud.streak.hidden = true;
    }
    if (s.shield !== hudShield) { hudShield = s.shield; hud.shield.hidden = !s.shield; }
  }

  // ---------------------------------------------------------------- screens
  const screens = { title: $('title'), ready: $('ready'), over: $('over'), pause: $('pause'), hud: $('hud'), countdown: $('countdown') };
  function show(name) {
    for (const k of ['title', 'ready', 'over', 'pause']) screens[k].hidden = k !== name;
    screens.hud.hidden = !(name === 'play' || name === 'ready' || name === 'pause' || name === 'countdown' || name === 'dying');
    if (name === 'ready') { screens.hud.hidden = false; }
  }
  function setMode(m) {
    mode = m; stateAt = now();
    if (m === 'title') { show('title'); refreshTitle(); Music.set({ intensity: 0, bpm: 96 }); }
    else if (m === 'ready') { show('ready'); }
    else if (m === 'play') { show('play'); }
    else if (m === 'dying') { show('dying'); }
    else if (m === 'over') { show('over'); }
    else if (m === 'paused') { show('pause'); }
    else if (m === 'countdown') { show('countdown'); }
  }

  function refreshTitle() {
    char = char0();
    $('titleBest').textContent = save.best;
    const nxt = P.nextUnlock(save);
    const face = $('teaser').querySelector('.teaser-face');
    if (nxt) {
      $('teaserImg').src = spriteURL(nxt.sprite); face.classList.remove('open');
      $('teaserName').textContent = 'Next: ' + (save.best >= nxt.unlockAt - 10 ? nxt.name : '???');
      $('teaserReq').textContent = 'Score ' + nxt.unlockAt + ' in one flight';
    } else {
      $('teaserImg').src = spriteURL('char5'); face.classList.add('open');
      $('teaserName').textContent = 'All fliers unlocked!';
      $('teaserReq').textContent = 'Legend status: confirmed';
    }
    $('charsDot').hidden = sessionNew.chars.size === 0;
    $('badgesDot').hidden = sessionNew.badges === 0;
    $('playBtn').classList.toggle('breathe', !save.settings.reducedMotion);
  }
  function updateTitleAnchor() {
    const z = $('pokeZone'), sr = stage.getBoundingClientRect(), r = z.getBoundingClientRect();
    if (r.height > 10) titleAnchorY = toWorldY(r.top - sr.top + r.height * 0.5);
    else titleAnchorY = 300;
  }

  // ---------------------------------------------------------------- run lifecycle
  function newRun(daily) {
    runMode = daily ? 'daily' : 'classic';
    runDate = P.today();
    const seed = daily ? E.seedFrom('flappy-fellas-daily-' + runDate) : ((Math.random() * 4294967296) >>> 0) ^ (Date.now() & 0xffff);
    s = E.create(seed);
    s.y = s.py = 300;
    char = char0();
    ghost = null; ghostTicks = []; ghostK = 0; ghostDeadAt = -1; beatGhost = false;
    if (daily && save.daily.date === runDate && save.daily.ghost.length) {
      ghost = E.create(seed); ghost.events = null; ghost.y = ghost.py = 300;
      ghostTicks = save.daily.ghost; ghost.char = P.CHAR_BY_ID[save.daily.character] || char;
    }
    shieldSaves = 0; bestToastDone = false; prevScore = 0; lastMilestone = 0; pending = false; acc = 0;
    trail.length = 0; pops.length = 0;
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].type !== 'firefly') { pool.push(parts[i]); parts.splice(i, 1); }
    death.landed = false; death.whistled = false; death.boinged = false;
    baseTod = clockTod();
    hudReset();
  }
  function goReady(daily) {
    newRun(daily);
    $('ready').querySelector('.tips').hidden = save.stats.runs >= 3;
    setMode('ready');
    Music.set({ intensity: 0, bpm: 100 });
    Sound.swoosh();
  }
  function startPlay(withFlap) {
    s.y = s.py = P1.dispY;
    if (ghost) { ghost.y = ghost.py = P1.dispY; }
    setMode('play');
    Music.set({ intensity: 1, bpm: 104 });
    if (withFlap) pending = true;
  }
  function restart() {
    if (mode === 'over' && now() - overAt < 380) return;
    closeSheet();
    newRun(runMode === 'daily');
    P1.dispY = 300; P1.dispX = C.x; P1.rot = 0;
    startPlay(true);
  }

  // ---------------------------------------------------------------- per-step game logic (events from the engine)
  function onEvents() {
    const evs = s.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.type) {
        case 'flap':
          Sound.flap(char);
          P1.wingV = -1; P1.sx = 1.14; P1.sy = 0.86;
          if (char.trail === 'puffs') for (let j = 0; j < 2; j++) part('puff', C.x - 22, s.y + 14, { vx: rand(-2.5, -1), vy: rand(0.5, 1.5), life: 26, size: 5, grow: 0.35, color: '#e6e6f0', alpha: 0.85, drag: 0.94 });
          break;
        case 'score': {
          if (e.perfect) {
            Sound.perfect(e.streak);
            popup(e.streak > 1 ? 'Perfect ×' + e.streak : 'Perfect!', C.x + 10, s.y - 46, { size: 24, color: '#ffe066' });
            burst(C.x, s.y, 10, 'spark', 5);
          } else Sound.score(0);
          if (e.milestone) { burst(C.x + 40, s.y, 22, 'confetti', 6); }
          break;
        }
        case 'mallow':
          Sound.mallow();
          popup('+1', e.x, e.y - 20, { color: '#ffd23f', size: 26 });
          burst(e.x, e.y, 12, 'star', 4);
          break;
        case 'shield':
          Sound.shield(); popup('Bubble!', C.x, s.y - 50, { color: '#bff4ff', size: 24 }); burst(C.x, s.y, 10, 'spark', 4);
          break;
        case 'shieldBreak':
          Sound.shieldBreak(); shieldSaves++; burst(C.x, s.y, 16, 'shard', 6); popup('Saved!', C.x + 20, s.y - 44, { color: '#bff4ff', size: 26 });
          shake(7); haptic(30);
          break;
        case 'nearMiss':
          Sound.whew(); popup(['Whew!', 'Close!', 'Yikes!', 'Phew!'][Math.floor(Math.random() * 4)], C.x + 30, s.y - 30, { color: '#ff9bb0', size: 22 });
          break;
        case 'ceiling':
          Sound.bonk(); if (Math.random() < 0.5) popup('bonk', C.x, s.y - 30, { size: 18, color: '#ffffff' });
          break;
        case 'hit':
          die(e.cause);
          break;
      }
    }
    evs.length = 0;
    if (s.score !== prevScore) onScoreChange();
  }

  function onScoreChange() {
    const sc = s.score;
    prevScore = sc;
    // live unlocks: saved immediately so a crash a frame later can't lose them
    const fresh = P.liveUnlock(save, sc);
    if (fresh.length) {
      persist();
      for (const c of fresh) {
        sessionNew.chars.add(c.id);
        toast('New flier unlocked!', c.name, '\u{1F513}', 'unlock');
        Sound.fanfare(false); haptic([20, 40, 20]);
        fxConfetti(60, view.W / 2, view.H * 0.18, 0.9);
      }
      hudGoal = hudTarget(); hud.pillImg.src = hudGoal.img; hud.pillLabel.textContent = hudGoal.label; hud.pillImg.style.filter = hudGoal.lock ? '' : 'none';
    }
    const m = Math.floor(sc / 10) * 10;
    if (m > lastMilestone && m > 0) {
      lastMilestone = m;
      const big = m % 50 === 0;
      Sound.milestone();
      popup(String(m) + '!', C.width / 2 + 20, 200, { size: big ? 64 : 46, color: big ? '#ffd23f' : '#ffffff', vy: -0.4, life: 70 });
      burst(C.x + 20, s.y, big ? 36 : 16, 'confetti', big ? 8 : 6);
      if (big) { flash(0.25, '#fff6c8'); fxConfetti(40, view.W / 2, view.H * 0.2, 0.8); }
    }
    if (save.settings.party && P.perkUnlocked(save, 'party')) burst(C.x, s.y, 14, 'confetti', 6);
    const best = runMode === 'daily' ? (save.daily.date === runDate ? save.daily.best : 0) : save.best;
    if (!bestToastDone && best >= 5 && sc > best) {
      bestToastDone = true; Sound.newBest(); hud.score.classList.add('gold');
      toast(runMode === 'daily' ? 'New daily best!' : 'New personal best!', 'Keep going!', '\u{1F3C6}');
    }
    if (ghost && !beatGhost && sc > save.daily.best && save.daily.best > 0) { beatGhost = true; toast('Ghost busted!', 'You passed your best run', '\u{1F47B}'); }
    hudUpdate();
  }

  function die(cause) {
    setMode('dying');
    hitStop = save.settings.reducedMotion ? 0 : 90;
    death.y = s.y; death.vy = cause === 'ground' ? -4.5 : cause === 'pipe-top' ? 1 : -3; death.rot = P1.rot; death.vr = (Math.random() < 0.5 ? -1 : 1) * 0.22; death.landed = false; death.t = 0; death.whistled = false;
    Sound.hit(); Music.duck(1600);
    shake(cause === 'ground' ? 9 : 12); flash(0.55, '#ffffff'); haptic([40, 30, 60]);
    burst(C.x, s.y, 8, 'feather', 5); burst(C.x, s.y, 10, 'star', 5);
    // record the run right away (never lose progress to a closed tab)
    const run = {
      score: s.score, passed: s.passed, mallows: s.mallows, perfects: s.perfects, bestPerfectStreak: s.bestPerfectStreak,
      nearMisses: s.nearMisses, flaps: s.flaps, ceilingTouches: s.ceilingTouches, deathCause: cause, ticks: s.tick,
      character: char.id, mode: runMode, date: runDate, flapTicks: s.flapTicks.slice(), shieldSaves, beatGhost,
    };
    const prevDaily = save.daily.date === runDate ? save.daily.best : 0;
    runInfo = P.applyRun(save, run);
    runInfo.prevDaily = prevDaily;
    lastRun = run;
    persist();
    recentScores.push(run.score); if (recentScores.length > 6) recentScores.shift();
    if (runInfo.achievements.length) sessionNew.badges += runInfo.achievements.length;
    for (const id of runInfo.unlocked) sessionNew.chars.add(id);
  }

  function showOver() {
    setMode('over'); overAt = now();
    const run = lastRun, info = runInfo;
    $('overScore').textContent = run.score;
    const daily = run.mode === 'daily';
    $('overBestLabel').textContent = daily ? 'Daily best' : 'Best';
    $('overBest').textContent = daily ? save.daily.best : save.best;
    const isNew = daily ? run.score > info.prevDaily && run.score > 0 : info.newBest && run.score > 0;
    $('newBest').hidden = !isNew;
    if (isNew) { fxConfetti(80, view.W / 2, view.H * 0.55, 1); Sound.newBest(); }
    const medal = $('medal'), tiers = [[200, 'm-legend', 'Legend'], [100, 'm-plat', 'Platinum'], [50, 'm-gold', 'Gold'], [25, 'm-silver', 'Silver'], [10, 'm-bronze', 'Bronze']];
    const tier = tiers.find(([n]) => run.score >= n);
    medal.className = 'medal' + (tier ? ' ' + tier[1] : '');
    medal.firstElementChild.textContent = tier ? tier[2] : 'No medal yet';
    const secs = Math.round(run.ticks / 60), mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
    const stats = [mm + ':' + ss + ' airtime'];
    if (run.perfects) stats.push(run.perfects + ' perfect');
    if (run.mallows) stats.push(run.mallows + (run.mallows === 1 ? ' marshmallow' : ' marshmallows'));
    if (run.nearMisses) stats.push(run.nearMisses + (run.nearMisses === 1 ? ' close shave' : ' close shaves'));
    if (run.shieldSaves) stats.push('saved by a bubble');
    $('overStats').innerHTML = stats.map((t) => '<span>' + t + '</span>').join('');
    const ob = $('overBadges');
    ob.hidden = !info.achievements.length;
    ob.innerHTML = info.achievements.map((a) => '<span><i>' + a.icon + '</i>' + a.title + '</span>').join('');
    const nxt = P.nextUnlock(save);
    $('overNext').innerHTML = nxt ? 'Next flier at <b>' + nxt.unlockAt + '</b> · ' + Math.max(0, nxt.unlockAt - save.best) + ' to go' : daily ? 'Daily Flight resets at midnight. Same course for everyone.' : 'Every flier unlocked. <b>Legend.</b>';
    // quip, with a pep talk if the last few runs were rough
    let q = P.quip(run, save, info);
    if (recentScores.length >= 5 && recentScores.slice(-5).every((v) => v < 3)) q = ['Deep breaths. Pipes can smell fear.', 'Tiny taps. Trust the flap.', 'Try tapping a little later. Gravity is your friend.'][Math.floor(Math.random() * 3)];
    $('quip').textContent = q;
    $('overTip').textContent = 'Tap anywhere up here to fly again';
    if (info.achievements.length) setTimeout(() => Sound.badge(), 500);
    info.perks.forEach((p) => toast('Perk unlocked', p.title + ' (Settings)', '✨'));
    // the flier springs back up, dizzy, and "says" the quip from the space above the bubble
    requestAnimationFrame(() => {
      const sr = stage.getBoundingClientRect(), b = document.querySelector('.bubble-quip').getBoundingClientRect(), tip = $('overTip').getBoundingClientRect();
      const topY = toWorldY(tip.bottom - sr.top), botY = toWorldY(b.top - sr.top);
      overAnchor.y = Math.max(topY + 30, (topY + botY) / 2 + 6);
      overAnchor.scale = clamp((botY - topY) / 120, 0.8, 1.45);
    });
    if (save.pendingReveal.length) setTimeout(() => { if (mode === 'over') runReveals(); }, 700);
  }

  // ---------------------------------------------------------------- update + render
  function shake(n) { if (!save.settings.reducedMotion) fxState.shake = Math.max(fxState.shake, n); }
  function flash(a, color) { if (!save.settings.reducedMotion) { fxState.flash = Math.max(fxState.flash, a); fxState.flashColor = color || '#fff'; } }

  function simStep() {
    if (mode !== 'play') return;
    let flap = pending; pending = false;
    if (autopilot) flap = E.policy(s);
    E.step(s, flap);
    bgDist += s.speed;
    if (ghost && !ghost.dead) {
      const f = ghostK < ghostTicks.length && ghostTicks[ghostK] === ghost.tick;
      if (f) ghostK++;
      E.step(ghost, f);
      if (ghost.dead) { ghostDeadAt = now(); burst(C.x, ghost.y, 8, 'puff', 3); }
    }
    // trail particles
    const tr = char.trail;
    if (s.tick % 5 === 0) {
      if (tr === 'bubbles') part('bubble', C.x - 20, s.y + rand(-6, 10), { vx: -s.speed * 0.6, vy: rand(-0.8, -0.3), life: 40, size: rand(3, 6), alpha: 0.9 });
      else if (tr === 'stars') part('star', C.x - 20, s.y + rand(-10, 10), { vx: -s.speed * 0.7, vy: rand(-0.4, 0.4), life: 30, size: rand(3, 5), color: '#ff9fd0', vr: 0.1 });
      else if (tr === 'notes' && s.tick % 15 === 0) part('note', C.x - 24, s.y + rand(-8, 6), { vx: -s.speed * 0.6, vy: -0.6, life: 50, size: 5, color: '#2ea37a' });
      else if (tr === 'puffs' && s.tick % 10 === 0) part('puff', C.x - 26, s.y + 16, { vx: -s.speed * 0.8, vy: 0.2, life: 30, size: 4, grow: 0.25, color: '#dcdce8', alpha: 0.6 });
    }
    if (tr === 'rainbow') { trail.push({ x: C.x - 14, y: s.y }); if (trail.length > 26) trail.shift(); for (const t of trail) t.x -= s.speed; }
    onEvents();
  }

  function updateCosmetics(f, dtMs) {
    const t = now();
    // fireflies at night
    if (todS.stars > 0.6 && quality.level > 0 && fireflies.length < 12 && Math.random() < 0.05 * f) {
      fireflies.push(part('firefly', rand(0, C.width), rand(440, 580), { vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.2), life: rand(200, 400), size: 1, rot: rand(0, TAU), scroll: 0.3 }));
    }
    fireflies = fireflies.filter((p) => p && p.life > 0 && p.type === 'firefly');
    // background events
    bgTimer -= f;
    if (bgTimer <= 0 && quality.level > 0) {
      bgTimer = rand(420, 900);
      const night = todS.stars > 0.6;
      const kind = night ? (Math.random() < 0.25 ? 'ufo' : 'shoot') : Math.random() < 0.5 ? 'balloon' : 'geese';
      bgEvents.push({ kind, x: kind === 'shoot' ? rand(120, 420) : C.width + 80, y: kind === 'balloon' ? rand(60, 200) : kind === 'geese' ? rand(40, 180) : kind === 'ufo' ? rand(90, 180) : rand(-40, 120), t: 0 });
    }
    if (todS.stars > 0.6 && Math.random() < 0.004 * f) bgEvents.push({ kind: 'shoot', x: rand(150, 440), y: rand(-60, 140), t: 0 });
    for (let i = bgEvents.length - 1; i >= 0; i--) {
      const ev = bgEvents[i]; ev.t += f;
      if (ev.kind === 'balloon') ev.x -= 0.25 * f; else if (ev.kind === 'geese') ev.x -= 0.9 * f; else if (ev.kind === 'ufo') ev.x -= 0.7 * f; else { ev.x -= 7 * f; ev.y += 3 * f; }
      if (ev.x < -160 || ev.t > 1400 || (ev.kind === 'shoot' && ev.t > 40)) bgEvents.splice(i, 1);
    }
    // player cosmetics
    const p = P1;
    p.sx = lerp(p.sx, 1, 1 - Math.pow(0.78, f)); p.sy = lerp(p.sy, 1, 1 - Math.pow(0.78, f));
    p.wingV = lerp(p.wingV, 0, 1 - Math.pow(0.82, f));
    p.wing += f * (mode === 'play' ? 0.55 : 0.28);
    if (mode !== 'over') p.scale = lerp(p.scale, mode === 'title' ? 1.7 : 1, 1 - Math.pow(0.86, f));
    if (mode === 'title') {
      const idle = t - idleSince;
      const asleep = idle > 25000 && !p.react;
      p.dispX = lerp(p.dispX, C.width / 2, 1 - Math.pow(0.9, f));
      const ty = titleAnchorY + Math.sin(t / 520) * 9 + (asleep ? 18 : 0);
      p.dispY = lerp(p.dispY, ty, 1 - Math.pow(0.88, f));
      let r = Math.sin(t / 900) * 0.06 + (asleep ? 0.25 : 0);
      if (asleep && Math.random() < 0.02 * f) part('zzz', p.dispX + 30, p.dispY - 30, { vx: 0.4, vy: -0.6, life: 70, size: rand(16, 24) });
      if (p.react) {
        const k = (t - p.react.t) / p.react.dur;
        if (k >= 1) p.react = null;
        else if (p.react.kind === 'spin') r += k * TAU;
        else if (p.react.kind === 'shake') r += Math.sin(k * 40) * 0.25 * (1 - k);
        else if (p.react.kind === 'hop') p.dispY -= Math.sin(k * Math.PI) * 50;
        else if (p.react.kind === 'flip') p.sx = Math.cos(k * TAU);
      }
      p.rot = r;
    } else if (mode === 'ready') {
      p.dispX = lerp(p.dispX, C.x, 1 - Math.pow(0.86, f));
      p.dispY = lerp(p.dispY, 300 + Math.sin(t / 300) * 7, 1 - Math.pow(0.85, f));
      p.rot = lerp(p.rot, 0, 0.2);
      bgDist += C.speed0 * 0.8 * f;
    } else if (mode === 'play' || mode === 'paused' || mode === 'countdown') {
      p.dispX = lerp(p.dispX, C.x, 1 - Math.pow(0.8, f));
    } else if (mode === 'dying' || mode === 'over') {
      if (hitStop > 0) { hitStop -= dtMs; return; }
      if (!death.landed) {
        death.vy = Math.min(death.vy + 0.5 * f, 12); death.y += death.vy * f; death.rot += death.vr * f;
        if (!death.whistled && death.vy > 6 && C.floor - death.y > 120) { death.whistled = true; Sound.whistle(); }
        const floorY = C.floor - C.radius * 0.6;
        if (death.y >= floorY) {
          death.y = floorY;
          if (death.vy > 3) { death.vy *= -0.32; death.vr *= 0.5; Sound.thud(); shake(4); burst(C.x, C.floor, 8, 'puff', 3); p.sx = 1.3; p.sy = 0.7; }
          else { death.landed = true; death.t = t; }
        }
      }
      if (mode === 'dying' && (death.landed || t - stateAt > 1300)) showOver();
    }
    if (mode === 'title' || mode === 'over' || mode === 'dying') bgDist += (mode === 'title' ? 0.6 : 0) * f;
    // shake/flash decay
    fxState.shake *= Math.pow(0.86, f); if (fxState.shake < 0.2) fxState.shake = 0;
    fxState.flash *= Math.pow(0.88, f); if (fxState.flash < 0.01) fxState.flash = 0;
    updateParts(f, mode === 'play' ? s.speed : mode === 'ready' ? C.speed0 * 0.8 : mode === 'title' ? 0.6 : 0);
  }

  const skyCache = { key: '' };
  function drawSky() {
    const st = todS, a = st.a, b = st.b, t = st.t;
    const top = -view.top, horizon = 470, key = Math.floor(tod * 400) + ':' + view.top;
    if (skyCache.key !== key) {
      const gr = ctx.createLinearGradient(0, top, 0, horizon);
      gr.addColorStop(0, mixc(a._skyT, b._skyT, t)); gr.addColorStop(1, mixc(a._skyB, b._skyB, t));
      const lg = ctx.createLinearGradient(0, 452, 0, 520); lg.addColorStop(0, mixc(a._lake, b._lake, t)); lg.addColorStop(1, mixc(a._lake2, b._lake2, t));
      skyCache.key = key; skyCache.sky = gr; skyCache.lake = lg; skyCache.tint = mixc(a._tint, b._tint, t, st.tintA); skyCache.tint2 = mixc(a._tint, b._tint, t, st.tintA * 0.45);
    }
    ctx.fillStyle = skyCache.sky; ctx.fillRect(0, top, C.width, view.bottom - top);
    if (st.stars > 0.02) {
      ctx.globalAlpha = st.stars; ctx.drawImage(L.stars, 0, top, C.width, view.Hv * 0.7);
      ctx.globalAlpha = 1;
    }
    // sun sets behind the mountains, moon rises at night
    if (st.sun > 0.02) { const sy = lerp(400, 70, st.sun); ctx.globalAlpha = Math.min(1, st.sun * 1.6); ctx.drawImage(L.sun, 300 - 90, sy - 90, 180, 180); ctx.globalAlpha = 1; }
    if (st.stars > 0.3) { ctx.globalAlpha = clamp((st.stars - 0.3) / 0.5, 0, 1); ctx.drawImage(L.moon, 70 - 80, 70 - 80, 160, 160); ctx.globalAlpha = 1; }
  }
  function drawStrip(img, worldW, worldH, y, par) {
    const off = -((bgDist * par) % worldW);
    for (let x = off; x < C.width; x += worldW) ctx.drawImage(img, x, y, worldW, worldH);
  }
  function drawBackground() {
    drawSky();
    const night = todS.stars;
    // clouds
    if (quality.level > 0) {
      ctx.globalAlpha = 1 - night * 0.75;
      const cl = L.clouds;
      for (let i = 0; i < 5; i++) {
        const c = cl[i % 3], span = C.width + c.w + 60;
        const x = ((((i * 173 - bgDist * (0.08 + i * 0.02)) % span) + span) % span) - c.w;
        ctx.drawImage(c.c, x, 30 + ((i * 67) % 170), c.w, c.h);
      }
      ctx.globalAlpha = 1;
    }
    for (const ev of bgEvents) drawBgEvent(ev);
    drawStrip(L.mountains, 840, 240, 480 - 240 + 10, 0.12);
    // lake
    ctx.fillStyle = skyCache.lake; ctx.fillRect(0, 452, C.width, 80);
    ctx.fillStyle = night > 0.5 ? '#c9d4ff' : '#ffffff';
    for (let i = 0; i < 9; i++) {
      const x = ((((i * 61 - bgDist * 0.2) % 470) + 470) % 470) - 30, w = 14 + (i % 3) * 8;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(now() / 400 + i);
      ctx.fillRect(x, 460 + (i % 4) * 9, w, 2);
    }
    ctx.globalAlpha = 1;
    drawStrip(L.trees, 840, 190, 565 - 190 + 20, 0.3);
    drawStrip(L.bushes, L.bushW, 70, C.floor - 70 + 4, 0.55);
    if (todS.tintA > 0.01) { ctx.fillStyle = skyCache.tint; ctx.fillRect(0, 250, C.width, C.floor - 250); }
  }
  function drawBgEvent(ev) {
    const x = ev.x, y = ev.y;
    if (ev.kind === 'balloon') {
      ctx.save(); ctx.translate(x, y + Math.sin(ev.t / 50) * 4);
      ctx.fillStyle = '#ff5d73'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 22, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 22, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5b3a24'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, 16); ctx.lineTo(-5, 30); ctx.moveTo(10, 16); ctx.lineTo(5, 30); ctx.stroke();
      ctx.fillStyle = '#8a5a35'; ctx.fillRect(-6, 29, 12, 8); ctx.restore();
    } else if (ev.kind === 'geese') {
      ctx.strokeStyle = '#2c2163'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const gx = x + Math.abs(i - 2) * 16, gy = y + (i - 2) * 9, w = Math.sin(ev.t / 6 + i) * 4;
        ctx.beginPath(); ctx.moveTo(gx - 7, gy - w); ctx.lineTo(gx, gy); ctx.lineTo(gx + 7, gy - w); ctx.stroke();
      }
    } else if (ev.kind === 'ufo') {
      ctx.save(); ctx.translate(x, y + Math.sin(ev.t / 30) * 5);
      if (ev.t % 260 < 120) { const bg = ctx.createLinearGradient(0, 0, 0, 300); bg.addColorStop(0, '#b8ff9c80'); bg.addColorStop(1, '#b8ff9c00'); ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(12, 6); ctx.lineTo(40, 300); ctx.lineTo(-40, 300); ctx.closePath(); ctx.fill();
        const my = 240 - ((ev.t % 260) / 120) * 220; ctx.fillStyle = '#fff1c4'; rr(ctx, -6, my, 12, 9, 3); ctx.fill(); }
      ctx.fillStyle = '#a7f3ff'; ctx.beginPath(); ctx.ellipse(0, -6, 11, 9, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#c3c9e0'; ctx.beginPath(); ctx.ellipse(0, 0, 28, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 10, 1, 2, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (ev.kind === 'shoot') {
      const k = ev.t / 40;
      ctx.globalAlpha = Math.sin(k * Math.PI);
      const g = ctx.createLinearGradient(x, y, x + 70, y - 30); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffffff00');
      ctx.strokeStyle = g; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 70, y - 30); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawPipe(p, al) {
    const x = lerp(p.px, p.x, al), gy = lerp(p.pgy, p.gy, al), g = lerp(p.pg, p.g, al);
    if (x > C.width + 10 || x + C.pipeWidth < -10) return;
    const top = gy - g / 2, bot = gy + g / 2, W = C.pipeWidth, CAP = 26, vt = -view.top - 4;
    const th = p.milestone ? L.pipes.gold : L.pipes[p.kind] || L.pipes.static;
    ctx.save(); ctx.translate(x, 0);
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    // bodies
    ctx.fillStyle = th.body;
    ctx.fillRect(0, vt, W, top - CAP - vt); ctx.strokeRect(0, vt - 4, W, top - CAP - vt + 4);
    ctx.fillRect(0, bot + CAP, W, C.floor - bot - CAP + 2); ctx.strokeRect(0, bot + CAP, W, C.floor - bot - CAP + 8);
    // subtle highlight streak
    ctx.fillStyle = '#ffffff40'; ctx.fillRect(12, vt, 5, top - CAP - vt); ctx.fillRect(12, bot + CAP, 5, C.floor - bot - CAP);
    // caps
    ctx.fillStyle = th.cap;
    rr(ctx, -6, top - CAP, W + 12, CAP, 6); ctx.fill(); ctx.stroke();
    rr(ctx, -6, bot, W + 12, CAP, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff55'; ctx.fillRect(-2, top - CAP + 4, W + 4, 3); ctx.fillRect(-2, bot + 4, W + 4, 3);
    ctx.fillStyle = '#00000026'; ctx.fillRect(0, top - CAP - 6, W, 6); ctx.fillRect(0, bot + CAP, W, 6);
    if (todS.tintA > 0.01) {
      // evening/night light on the pipe itself (teeth and eyes drawn after stay bright)
      ctx.fillStyle = skyCache.tint2;
      ctx.fillRect(0, vt, W, top - CAP - vt); ctx.fillRect(0, bot + CAP, W, C.floor - bot - CAP);
      rr(ctx, -6, top - CAP, W + 12, CAP, 6); ctx.fill(); rr(ctx, -6, bot, W + 12, CAP, 6); ctx.fill();
    }
    if (p.kind === 'chomp') drawChomper(top, bot, W, CAP, x);
    else if (p.kind === 'bob') {
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      const k = Math.sin(now() / 200) * 2;
      ctx.beginPath(); ctx.moveTo(W / 2 - 7, top - 9 + k); ctx.lineTo(W / 2, top - 15 + k); ctx.lineTo(W / 2 + 7, top - 9 + k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 - 7, bot + 11 - k); ctx.lineTo(W / 2, bot + 17 - k); ctx.lineTo(W / 2 + 7, bot + 11 - k); ctx.stroke();
    }
    if (p.milestone) {
      const n = p.id + 1, by = top - CAP - 54;
      ctx.fillStyle = '#ff5d73'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(4, by); ctx.lineTo(W - 4, by); ctx.lineTo(W - 4, by + 36); ctx.lineTo(W / 2, by + 28); ctx.lineTo(4, by + 36); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '20px "Lilita One",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), W / 2, by + 15);
    }
    ctx.restore();
  }
  function drawChomper(top, bot, W, CAP, pipeX) {
    // teeth that face the gap, and googly eyes that watch you
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    const n = 5, tw = (W + 8) / n;
    for (let i = 0; i < n; i++) {
      const x0 = -4 + i * tw;
      ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0 + tw / 2, top + 10); ctx.lineTo(x0 + tw, top); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x0 + tw / 2, bot - 10); ctx.lineTo(x0 + tw, bot); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    const px = C.x - pipeX, py = mode === 'play' ? s.y : P1.dispY;
    for (const ex of [W / 2 - 13, W / 2 + 13]) {
      const ey = top - CAP / 2, dx = px - ex, dy = py - ey, d = Math.hypot(dx, dy) || 1;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + (dx / d) * 3.5, ey + (dy / d) * 3.5, 3.6, 0, TAU); ctx.fill();
    }
  }
  function drawItems(al) {
    const t = now();
    for (const it of s.items) {
      if (it.taken) continue;
      const x = lerp(it.px, it.x, al), y = it.y + Math.sin(t / 260 + it.id) * 4;
      if (x < -30 || x > C.width + 30) continue;
      if (it.kind === 'mallow') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t / 400 + it.id) * 0.25);
        ctx.globalAlpha = 0.35; ctx.drawImage(L.glow, -22, -22, 44, 44); ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff3cf'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        rr(ctx, -11, -9, 22, 18, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffc94a'; rr(ctx, -11, -9, 22, 7, 5); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(-6, -1, 5, 3);
        ctx.restore();
        if (Math.random() < 0.06) part('spark', x + rand(-10, 10), y + rand(-10, 10), { vx: 0, vy: -0.3, life: 18, size: 2, color: '#fff6b0', scroll: 1 });
      } else {
        const r = 14 + Math.sin(t / 150) * 1.2;
        const g = ctx.createRadialGradient(x - 4, y - 5, 2, x, y, r); g.addColorStop(0, '#ffffffee'); g.addColorStop(0.5, '#9be7ff88'); g.addColorStop(1, '#c08bffcc');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x - 5, y - 6, 4, 2.5, -0.6, 0, TAU); ctx.fill();
      }
    }
  }

  function drawFlier(ch, x, y, rot, sx, sy, alpha, o = {}) {
    const spr = SPR_CACHE[ch.id]; if (!spr) return;
    const scale = bigHead() ? 1.55 : 1, size = SPR * scale;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
    if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
    if (o.glow && quality.level > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * 0.35; ctx.drawImage(L.glow, -size * 0.8, -size * 0.8, size * 1.6, size * 1.6); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha; }
    // wings behind the head: quick downstroke on flap, flutter otherwise
    const ww = SPR_CACHE.wingW, wh = SPR_CACHE.wingH;
    const flutter = o.still ? 0 : Math.sin(P1.wing) * 0.28;
    const ang = -0.35 + flutter - P1.wingV * 1.0;
    for (const side of [-1, 1]) {
      ctx.save(); ctx.scale(side, 1); ctx.translate(size * 0.3, size * 0.02); ctx.rotate(ang);
      ctx.drawImage(SPR_CACHE.wing, -2, -wh * 0.72, ww, wh);
      ctx.restore();
    }
    ctx.scale(sx, sy);
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
    if (ch.legendary) { const cw = SPR_CACHE.crownW, chh = SPR_CACHE.crownH; ctx.drawImage(SPR_CACHE.crown, -cw / 2, -size * 0.5 - chh * 0.55, cw, chh); }
    ctx.restore();
  }

  function drawPlayer(al) {
    const t = now();
    let x = P1.dispX, y = P1.dispY, rot = P1.rot;
    if (mode === 'play' || mode === 'paused' || mode === 'countdown') {
      y = lerp(s.py, s.y, mode === 'play' ? al : 1); P1.dispY = y;
      const target = clamp(s.vy * 0.075, -0.42, 0.95);
      P1.rot = lerp(P1.rot, target, s.vy < 0 ? 0.35 : 0.12); rot = P1.rot;
      if (s.vy > 7) { P1.sy = Math.max(P1.sy, 1.05); }
    } else if (mode === 'dying' || mode === 'over') {
      x = C.x; y = death.y; rot = death.rot;
      if (mode === 'over') {
        const k = clamp((t - overAt - 160) / 560, 0, 1);
        if (k > 0) {
          if (!death.boinged) { death.boinged = true; Sound.boing(); death.rot = Math.atan2(Math.sin(death.rot), Math.cos(death.rot)); }
          const e = backOut(k);
          x = lerp(C.x, C.width / 2, e); y = lerp(death.y, overAnchor.y + Math.sin(t / 480) * 6, e);
          rot = lerp(death.rot, Math.sin(t / 360) * 0.16, e); P1.scale = lerp(1, overAnchor.scale, e);
        }
      }
    }
    // rainbow trail for the legend
    if (char.trail === 'rainbow' && trail.length > 2 && (mode === 'play' || mode === 'paused')) {
      const cols = ['#ff5d73', '#ff9f1c', '#ffd23f', '#2ed3a0', '#3fb4ff', '#7a5cff'];
      ctx.lineCap = 'round';
      cols.forEach((c, i) => {
        ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.globalAlpha = 0.85; ctx.beginPath();
        trail.forEach((pt, j) => { const yy = pt.y - 10 + i * 4 + Math.sin((j + s.tick) * 0.5) * 1.5; j ? ctx.lineTo(pt.x, yy) : ctx.moveTo(pt.x, yy); });
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }
    let alpha = 1;
    if (mode === 'play' && s.invuln > 0) alpha = 0.45 + 0.4 * Math.abs(Math.sin(t / 50));
    drawFlier(char, x, y, rot, P1.sx, P1.sy, alpha, { glow: todS.stars > 0.5 || char.legendary, still: mode === 'dying' || mode === 'over', scale: P1.scale });
    if ((mode === 'play' || mode === 'paused' || mode === 'countdown') && s.shield) {
      const r = (bigHead() ? 54 : 40) + Math.sin(t / 140) * 2;
      ctx.lineWidth = 3; ctx.strokeStyle = '#bff4ffd0'; ctx.fillStyle = '#9be7ff22';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffffaa'; ctx.beginPath(); ctx.arc(x, y, r - 6, -2.4, -1.6); ctx.stroke();
    }
    if ((mode === 'dying' || mode === 'over') && death.landed) {
      const sc = mode === 'over' ? P1.scale : 1;
      for (let i = 0; i < 3; i++) { const a = t / 300 + (i * TAU) / 3; ctx.fillStyle = '#ffe066'; star5(ctx, x + Math.cos(a) * 26 * sc, y - 36 * sc + Math.sin(a) * 7, 6 * sc, a); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    if (mode === 'title' && P1.speech && t < P1.speech.until) drawSpeech(P1.speech.text, x, y - SPR * P1.scale * (bigHead() ? 0.85 : 0.6));
  }
  function drawSpeech(text, x, y) {
    ctx.font = '800 15px Nunito, system-ui, sans-serif';
    const w = Math.min(260, ctx.measureText(text).width + 24), h = 34, bx = clamp(x - w / 2, 8, C.width - w - 8);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    rr(ctx, bx, y - h - 10, w, h, 14); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, y - 11); ctx.lineTo(x, y); ctx.lineTo(x + 7, y - 11); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 6, y - 14, 12, 5);
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + w / 2, y - h / 2 - 10);
  }
  function drawGhost() {
    if (!ghost || !(mode === 'play' || mode === 'paused' || mode === 'countdown' || mode === 'dying')) return;
    const gc = ghost.char || char;
    if (ghost.dead) {
      if (ghostDeadAt > 0 && now() - ghostDeadAt < 600) { ctx.globalAlpha = 1 - (now() - ghostDeadAt) / 600; drawFlier(gc, C.x, ghost.y, 0.6, 1, 1, ctx.globalAlpha * 0.5, { still: true }); ctx.globalAlpha = 1; }
      return;
    }
    drawFlier(gc, C.x, ghost.y, clamp(ghost.vy * 0.075, -0.42, 0.95), 1, 1, 0.32, {});
    ctx.font = '13px "Lilita One",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffffb0'; ctx.fillText('ghost', C.x, ghost.y - 44);
  }

  function render(al, f) {
    const k = view.k * view.dpr;
    let sx = 0, sy = 0;
    if (fxState.shake > 0) { sx = rand(-1, 1) * fxState.shake; sy = rand(-1, 1) * fxState.shake; }
    ctx.setTransform(k, 0, 0, k, sx * k, (view.top + sy) * k);
    drawBackground();
    if (mode !== 'title') for (const p of s.pipes) drawPipe(p, mode === 'play' ? al : 1);
    // ground (scrolls with the pipes)
    {
      const gw = L.groundW, off = -((bgDist) % gw), depth = view.bottom - C.floor + 6;
      for (let x = off - (off > 0 ? gw : 0); x < C.width; x += gw) ctx.drawImage(L.ground, x, C.floor, gw, depth);
    }
    if (todS.tintA > 0.01) {
      ctx.fillStyle = skyCache.tint2; ctx.fillRect(0, C.floor, C.width, view.bottom - C.floor + 4);
    }
    if (mode !== 'title') drawItems(mode === 'play' ? al : 1);
    drawGhost();
    if (spritesReady) drawPlayer(al);
    drawParts();
    drawPops(f);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    vignetteEl.classList.toggle('night', todS.stars > 0.5);
    if (fxState.flash > 0) { ctx.globalAlpha = fxState.flash; ctx.fillStyle = fxState.flashColor; ctx.fillRect(0, 0, C.width, view.Hv); ctx.globalAlpha = 1; }
  }

  // ---------------------------------------------------------------- main loop
  const fpsEl = $('fps'), vignetteEl = $('vignette');
  let fpsShow = /fps/.test(location.hash), fpsAcc = 0, fpsN = 0, fpsVal = 60, lastFpsAt = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!last) last = t;
    let dt = t - last; last = t;
    if (dt > 250) dt = STEP_MS;   // tab was asleep: don't fast-forward
    const f = Math.min(4, dt / STEP_MS);
    if (mode === 'play') {
      acc += dt * timeScale;
      let n = 0;
      const maxSteps = timeScale > 1 ? Math.ceil(timeScale) + 2 : 5;
      while (acc >= STEP_MS && n < maxSteps) { simStep(); acc -= STEP_MS; n++; if (mode !== 'play') break; }
      if (n >= maxSteps) acc = 0;
      if (mode === 'play') {
        tod = (baseTod + s.dist / (C.spacing * 15)) % 4;
        if (s.tick % 30 === 0) Music.set({ bpm: 104 + 18 * E.difficulty(s.crossed).t, night: todState(tod).stars > 0.6 });
      }
    } else if (mode === 'title' || mode === 'ready') tod = baseTod;
    todS = todState(tod);
    updateCosmetics(f, dt);
    const al = mode === 'play' ? clamp(acc / STEP_MS, 0, 1) : 1;
    render(al, f);
    drawFx(f);
    // perf: adaptive resolution if the device can't hold 60
    fpsAcc += dt; fpsN++;
    if (t - lastFpsAt > 500) {
      fpsVal = Math.round((fpsN * 1000) / fpsAcc); fpsAcc = 0; fpsN = 0; lastFpsAt = t;
      if (fpsShow) { fpsEl.hidden = false; fpsEl.textContent = fpsVal + ' fps · ' + view.dpr.toFixed(2) + 'x · q' + quality.level; }
      if (mode === 'play' && document.visibilityState === 'visible') {
        if (fpsVal < 50) quality.slowFrames++; else quality.slowFrames = Math.max(0, quality.slowFrames - 1);
        if (quality.slowFrames >= 4) {
          quality.slowFrames = 0;
          if (view.maxDpr > 1.25) { view.maxDpr = Math.max(1.25, view.maxDpr - 0.5); layout(); }
          else if (quality.level > 0) { quality.level--; maxParts = 140; }
        }
      }
    }
  }

  // ---------------------------------------------------------------- input
  function primary() {
    idleSince = now();
    if (mode === 'ready') { startPlay(true); return; }
    if (mode === 'play') { pending = true; return; }
    if (mode === 'over') { restart(); return; }
  }
  const UI_SEL = 'button,.panel,.sheet-card,.reveal,.toast,label,input,a,.teaser';
  stage.addEventListener('pointerdown', (e) => {
    inGesture = true; setTimeout(() => (inGesture = false), 0);
    Sound.init();
    if (e.button !== undefined && e.button > 0) return;
    if (e.target.closest && e.target.closest(UI_SEL)) return;
    if (!$('sheet').hidden || !$('reveal').hidden) return;
    e.preventDefault();
    primary();
  }, { passive: false });
  // stop iOS long-press magnifier / double-tap zoom on the play surface
  cv.addEventListener('touchstart', (e) => { if (e.touches.length) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('#shareImg')) e.preventDefault(); });
  document.addEventListener('keydown', (e) => {
    Sound.init();
    if (e.repeat && (e.code === 'Space' || e.code === 'ArrowUp')) return;
    const typing = e.target && e.target.matches && e.target.matches('input,textarea,select');
    if (typing) return;
    if (!$('reveal').hidden) { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); Reveal.skipOrUse(); } if (e.code === 'Escape') Reveal.later(); return; }
    if (!$('sheet').hidden) { if (e.code === 'Escape') closeSheet(); return; }
    if (!$('share').hidden) { if (e.code === 'Escape') $('share').hidden = true; return; }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (mode === 'title') { $('playBtn').click(); return; }
      if (e.target && e.target.tagName === 'BUTTON' && mode !== 'play') return;
      primary();
    } else if (e.code === 'Enter' && mode === 'over' && !(e.target && e.target.tagName === 'BUTTON')) restart();
    else if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'paused') resume(); }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (mode === 'play') pause(); Music.stop(); }
    else if (save.settings.music) Music.start();
  });
  window.addEventListener('blur', () => { if (mode === 'play') pause(); });

  function pause() {
    if (mode !== 'play') return;
    setMode('paused');
    $('pSfx').checked = save.settings.sfx; $('pMusic').checked = save.settings.music;
    syncTogs($('pause'));
  }
  function resume() {
    if (mode !== 'paused') return;
    setMode('countdown');
    let n = 3;
    const el = screens.countdown; el.hidden = false;
    const tick = () => {
      if (mode !== 'countdown') { el.hidden = true; return; }
      if (n === 0) { el.hidden = true; Sound.tick(true); acc = 0; setMode('play'); return; }
      el.textContent = n; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); Sound.tick(false);
      n--; setTimeout(tick, 560);
    };
    tick();
  }
  $('pauseBtn').addEventListener('click', () => { Sound.click(); pause(); });
  $('resumeBtn').addEventListener('click', () => { Sound.click(); resume(); });
  $('restartBtn').addEventListener('click', () => { Sound.click(); newRun(runMode === 'daily'); P1.dispY = 300; setMode('ready'); $('ready').querySelector('.tips').hidden = true; });
  $('homeBtn').addEventListener('click', () => { Sound.click(); goTitle(); });
  for (const [id, key] of [['pSfx', 'sfx'], ['pMusic', 'music']]) $(id).addEventListener('change', (e) => { save.settings[key] = e.target.checked; applySettings(); persist(); syncTogs($('pause')); });

  function goTitle() {
    closeSheet();
    s = E.create(1); ghost = null;
    setMode('title');
    idleSince = now();
    updateTitleAnchor();
  }

  // title buttons
  $('playBtn').addEventListener('click', () => { Sound.init(); Sound.click(); goReady(false); });
  $('dailyBtn').addEventListener('click', () => { Sound.init(); Sound.click(); goReady(true); toast('Daily Flight', save.daily.date === P.today() && save.daily.best ? 'Beat your ghost: ' + save.daily.best : 'Same course for everyone today', '\u{1F4C5}'); });
  $('charsBtn').addEventListener('click', () => { Sound.click(); openSheet('chars'); });
  $('teaser').addEventListener('click', () => { Sound.click(); openSheet('chars'); });
  $('badgesBtn').addEventListener('click', () => { Sound.click(); openSheet('badges'); });
  $('settingsBtn').addEventListener('click', () => { Sound.click(); openSheet('settings'); });
  $('againBtn').addEventListener('click', () => { Sound.click(); overAt = 0; restart(); });
  $('overHome').addEventListener('click', () => { Sound.click(); goTitle(); });
  $('overChars').addEventListener('click', () => { Sound.click(); openSheet('chars'); });
  $('shareBtn').addEventListener('click', () => { Sound.click(); openShare(); });

  // poke the flier on the title screen
  const POKES = ['Hey!', 'Rude.', 'I’m hovering here!', 'Personal space!', 'That tickles!', 'Poke me again. I dare you.', 'I’m telling the camp counselor.', 'Boop received.', 'Okay, okay, I’m awake!'];
  $('pokeZone').addEventListener('pointerdown', (e) => {
    e.preventDefault(); Sound.init();
    const was = now() - idleSince > 25000;
    idleSince = now();
    if (P1.react) return;
    pokeCount++; save.stats.pokes++;
    const kinds = ['hop', 'spin', 'shake', 'flip'];
    P1.react = { kind: kinds[pokeCount % kinds.length], t: now(), dur: 650 };
    P1.speech = { text: was ? 'Okay, okay, I’m awake!' : pokeCount % 4 === 0 ? char.quips[(pokeCount / 4) % char.quips.length | 0] : POKES[(pokeCount - 1) % (POKES.length - 1)], until: now() + 1500 };
    Sound.boing(); burst(P1.dispX, P1.dispY, 8, 'star', 4);
    if (save.stats.pokes >= 10) { const a = P.grant(save, 'poke'); if (a) { toast('Badge earned', a.title, a.icon); sessionNew.badges++; } }
    persist();
  });

  // ---------------------------------------------------------------- toasts
  const toastQ = [];
  let toastBusy = false;
  function toast(small, big, icon, cls) { toastQ.push({ small, big, icon, cls }); if (!toastBusy) nextToast(); }
  function nextToast() {
    if (!$('reveal').hidden) { toastBusy = true; setTimeout(nextToast, 500); return; }
    const t = toastQ.shift(); if (!t) { toastBusy = false; return; }
    toastBusy = true;
    $('toasts').classList.toggle('bottom', mode === 'play' || mode === 'dying' || mode === 'countdown');
    $('toasts').classList.toggle('mid', mode === 'ready');
    const el = document.createElement('div'); el.className = 'toast' + (t.cls ? ' ' + t.cls : '');
    const i = document.createElement('i'); i.textContent = t.icon || '⭐';
    const sp = document.createElement('span'); const sm = document.createElement('small'); sm.textContent = t.small; const b = document.createElement('b'); b.textContent = t.big;
    sp.append(sm, b); el.append(i, sp); $('toasts').append(el);
    if (t.small === 'Badge earned') Sound.badge();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 360); nextToast(); }, 2100);
  }

  // ---------------------------------------------------------------- unlock ceremony
  function cardHTML(ch, o = {}) {
    const n = P.CHARACTERS.indexOf(ch) + 1, stars = '★'.repeat(n) + '☆'.repeat(5 - n);
    const lock = '<span class="tc-lock"><svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5v11h-13V10H7zm2.5 0h5V8a2.5 2.5 0 0 0-5 0v2z"/></svg></span>';
    return '<div class="tcard' + (o.locked ? ' locked' : '') + (ch.legendary ? ' legend' : '') + (o.mystery ? ' mystery' : '') + (o.selected ? ' selected' : '') + '" style="--cc:' + ch.color + '">' +
      '<span class="tc-stars">' + stars + '</span><span class="tc-no">' + String(n).padStart(2, '0') + '/05</span>' +
      '<img src="' + spriteURL(ch.sprite) + '" alt="">' + (o.locked ? lock : '') + (o.selected ? '<span class="tc-sel">Flying</span>' : '') +
      '<span class="tc-name">' + (o.locked ? '? ? ?' : ch.name) + '</span></div>';
  }
  const Reveal = (() => {
    let cur = null, timer = 0, phase = 'idle', queue = [], back = null;
    const el = $('reveal');
    function open(ids, onClose) {
      queue = ids.slice(); back = onClose || null;
      next();
    }
    function next() {
      const id = queue.shift();
      if (!id) { close(); return; }
      cur = P.CHAR_BY_ID[id];
      el.hidden = false; el.classList.remove('lit');
      $('revealKicker').textContent = cur.legendary ? 'Legendary flier unlocked!' : 'New flier unlocked!';
      $('revealKicker').style.animation = 'none'; void el.offsetWidth; $('revealKicker').style.animation = '';
      const wrap = $('revealCard');
      wrap.innerHTML = cardHTML(cur, { mystery: true });
      wrap.className = 'tcard-wrap charge';
      $('revealText').innerHTML = '';
      $('revealBtns').hidden = true; $('revealSkip').hidden = false;
      $('revealUse').querySelector('span').textContent = 'Fly as ' + cur.name;
      phase = 'charge';
      Sound.init(); Sound.drumroll(1.6);
      clearTimeout(timer); timer = setTimeout(burstNow, save.settings.reducedMotion ? 200 : 1650);
    }
    function burstNow() {
      if (phase !== 'charge') return;
      phase = 'shown'; clearTimeout(timer); Sound.stopRoll();
      const wrap = $('revealCard');
      wrap.innerHTML = cardHTML(cur, {});
      wrap.className = 'tcard-wrap burst';
      el.classList.add('lit');
      Sound.fanfare(true); haptic([30, 50, 30, 50, 80]);
      const r = wrap.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      fxConfetti(cur.legendary ? 220 : 140, r.left - sr.left + r.width / 2, r.top - sr.top + r.height / 2, 1.1);
      if (cur.legendary) fxRain(120);
      const t = $('revealText');
      t.innerHTML = '';
      const h = document.createElement('h3'); h.textContent = cur.name;
      const p = document.createElement('p'); p.textContent = cur.bio;
      const q = document.createElement('span'); q.className = 'req'; q.textContent = cur.unlockAt ? 'Unlocked at ' + cur.unlockAt + ' points' : 'Starter';
      t.append(h, p, q);
      $('revealBtns').hidden = false; $('revealSkip').hidden = true;
      if (!save.seen.includes(cur.id)) save.seen.push(cur.id);
      save.pendingReveal = save.pendingReveal.filter((x) => x !== cur.id);
      persist();
    }
    function close() {
      el.hidden = true; phase = 'idle'; Sound.stopRoll();
      const cb = back; back = null; if (cb) cb();
    }
    el.addEventListener('pointerdown', (e) => { if (phase === 'charge' && !e.target.closest('button')) { e.preventDefault(); burstNow(); } });
    $('revealUse').addEventListener('click', () => {
      Sound.click(); save.selected = cur.id; char = cur; persist(); buildSprites();
      queue.length ? next() : (back = null, close(), afterUse());
    });
    $('revealLater').addEventListener('click', () => { Sound.click(); queue.length ? next() : close(); });
    function afterUse() {
      closeSheet();
      if (mode === 'over' || mode === 'dying') { newRun(runMode === 'daily'); P1.dispY = 300; P1.dispX = C.x; setMode('ready'); $('ready').querySelector('.tips').hidden = true; }
      else refreshTitle();
    }
    return { open, skipOrUse() { if (phase === 'charge') burstNow(); else if (phase === 'shown') $('revealUse').click(); }, later() { if (phase === 'shown') $('revealLater').click(); }, get open_() { return !el.hidden; } };
  })();
  function runReveals() {
    if (!save.pendingReveal.length || !$('reveal').hidden) return;
    Reveal.open(save.pendingReveal.slice(), () => { if (mode === 'title') refreshTitle(); });
  }

  // ---------------------------------------------------------------- sheets
  let sheetKind = null;
  function openSheet(kind) {
    sheetKind = kind;
    const body = $('sheetBody');
    $('sheet').classList.toggle('tall', kind !== 'chars');
    if (kind === 'chars') { $('sheetTitle').textContent = 'Fliers'; body.innerHTML = charsHTML(); sessionNew.chars.clear(); }
    else if (kind === 'badges') { $('sheetTitle').textContent = 'Merit badges'; body.innerHTML = badgesHTML(); sessionNew.badges = 0; }
    else { $('sheetTitle').textContent = 'Settings'; body.innerHTML = settingsHTML(); }
    syncTogs(body);
    $('sheet').hidden = false; body.scrollTop = 0;
    if (mode === 'title') refreshTitle();
  }
  function closeSheet() { $('sheet').hidden = true; sheetKind = null; if (mode === 'title') refreshTitle(); }
  $('sheetClose').addEventListener('click', () => { Sound.click(); closeSheet(); });
  $('sheet').addEventListener('pointerdown', (e) => { if (e.target === $('sheet')) closeSheet(); });

  function charsHTML() {
    const sel = save.selected;
    let h = '<p class="sheet-sub">A new flier unlocks every 50 points in a single flight. Your best: <b>' + save.best + '</b></p><div class="cards">';
    for (const ch of P.CHARACTERS) {
      const locked = !save.unlocked.includes(ch.id), isSel = ch.id === sel;
      h += '<div class="cslot' + (ch.legendary ? ' wide' : '') + '" style="position:relative">';
      if (sessionNew.chars.has(ch.id)) h += '<span class="new-tag">New!</span>';
      h += '<button class="tcard-btn" data-char="' + ch.id + '" style="all:unset;display:block;cursor:pointer" aria-label="' + (locked ? 'Locked flier, score ' + ch.unlockAt : ch.name) + '">' + cardHTML(ch, { locked, selected: isSel }) + '</button>';
      if (locked) {
        const pct = Math.min(100, (save.best / ch.unlockAt) * 100);
        h += '<div class="cinfo">Score <b>' + ch.unlockAt + '</b> in one flight<div class="cbar"><i style="width:' + pct + '%"></i></div></div>';
      } else {
        h += '<div class="cinfo">' + ch.tagline + '<br>Best: <b>' + (save.bestByChar[ch.id] || 0) + '</b></div>';
        h += '<button class="btn' + (isSel ? ' on' : '') + '" data-pick="' + ch.id + '">' + (isSel ? 'Flying' : 'Fly') + '</button>';
      }
      h += '</div>';
    }
    return h + '</div>';
  }
  function badgesHTML() {
    const n = P.earnedCount(save), tot = P.ACHIEVEMENTS.length;
    const hues = ['#ff5d73', '#ff9f1c', '#2ed3a0', '#3fb4ff', '#7a5cff', '#ff6fb5', '#21b6a8'];
    let h = '<div class="badge-sum"><b>' + n + '/' + tot + '</b><div class="cbar"><i style="width:' + (n / tot) * 100 + '%"></i></div></div><div class="badges">';
    P.ACHIEVEMENTS.forEach((a, i) => {
      const got = !!save.achievements[a.id];
      h += '<div class="bdg' + (got ? '' : ' locked') + '"><span class="patch" style="--pc:' + hues[i % hues.length] + '">' + a.icon + '</span><b>' + a.title + '</b><small>' + a.desc + '</small></div>';
    });
    h += '</div><div class="perks"><h3>Perks</h3><p class="sheet-sub">Earn badges to unlock silly extras.</p><div class="set-box">';
    for (const p of P.PERKS) {
      const ok = P.perkUnlocked(save, p.id);
      h += '<label class="tog' + (ok ? '' : ' locked') + '"><input type="checkbox" data-set="' + p.id + '"' + (save.settings[p.id] && ok ? ' checked' : '') + (ok ? '' : ' disabled') + '><span>' + p.title + '<small>' + (ok ? p.desc : 'Earn ' + p.needs + ' badges to unlock') + '</small></span></label>';
    }
    return h + '</div></div>';
  }
  function settingsHTML() {
    const row = (key, title, sub) => '<label class="tog"><input type="checkbox" data-set="' + key + '"' + (save.settings[key] ? ' checked' : '') + '><span>' + title + '<small>' + sub + '</small></span></label>';
    let h = '<div class="set-box">' + row('sfx', 'Sound effects', 'Flaps, dings and bonks') + row('music', 'Music', 'Camp tunes that speed up with you') + row('haptics', 'Vibration', 'Buzz on crashes and unlocks (where supported)') + row('reducedMotion', 'Reduce motion', 'No screen shake or flashes') + '</div>';
    h += '<div class="set-box">';
    for (const p of P.PERKS) { const ok = P.perkUnlocked(save, p.id); h += '<label class="tog' + (ok ? '' : ' locked') + '"><input type="checkbox" data-set="' + p.id + '"' + (save.settings[p.id] && ok ? ' checked' : '') + (ok ? '' : ' disabled') + '><span>' + p.title + '<small>' + (ok ? p.desc : 'Earn ' + p.needs + ' badges to unlock') + '</small></span></label>'; }
    h += '<label class="tog"><input type="checkbox" data-fps' + (fpsShow ? ' checked' : '') + '><span>Show FPS<small>Frame-rate meter for the curious</small></span></label></div>';
    h += '<h3 class="set-h">How to play</h3><p class="about">Tap, click or press <b>Space</b> to flap. Fly through the gaps. <b>Only your face counts</b> for crashes; the hair is decorative. Golden marshmallows are <b>+1</b>, bubbles save you from one crash, bobbing teal pipes move, and purple chompers bite. A new flier unlocks every <b>50 points</b>. <b>Daily Flight</b> is the same course for everyone each day, with a ghost of your best try.</p>';
    h += '<h3 class="set-h">Your progress</h3><p class="about">' + save.stats.runs + ' flights · ' + save.stats.totalScore + ' total points · ' + save.stats.mallows + ' marshmallows · ' + Math.round(save.stats.ticks / 3600) + ' min airborne. Saved on this device' + (Cloud.ref ? ' and to your Claude account' : '') + '.</p>';
    h += '<div class="danger-row"><button class="btn btn-danger" id="resetBtn">Reset progress</button></div>';
    return h;
  }
  function syncTogs(root) { root.querySelectorAll('.tog').forEach((l) => { const i = l.querySelector('input'); l.classList.toggle('on', !!(i && i.checked)); }); }
  function applySettings() {
    Sound.apply();
    document.body.classList.toggle('rm', save.settings.reducedMotion);
    if (save.settings.music) Music.start(); else Music.stop();
  }
  $('sheetBody').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.fps !== undefined) { fpsShow = t.checked; fpsEl.hidden = !fpsShow; syncTogs($('sheetBody')); return; }
    const key = t.dataset.set; if (!key) return;
    save.settings[key] = t.checked; persist(); applySettings();
    if (key === 'bigHead') buildSprites();
    Sound.click(); syncTogs($('sheetBody'));
  });
  $('sheetBody').addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]'), card = e.target.closest('[data-char]');
    if (e.target.id === 'resetBtn') {
      const b = e.target;
      if (b.dataset.armed) {
        try { for (const k of [SAVE_KEY, 'flappy-lab-Camp Guy', 'flappy-lab-Couch Guy']) localStorage.removeItem(k); } catch (err) { /* storage blocked */ }
        save = P.sanitize(null); persist(); onSaveReplaced(); closeSheet(); toast('Progress reset', 'Fresh start!', '\u{1F9F9}');
      }
      else { b.dataset.armed = '1'; b.textContent = 'Tap again to erase everything'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Reset progress'; } }, 3500); }
      return;
    }
    const id = (pick && pick.dataset.pick) || (card && card.dataset.char);
    if (!id) return;
    const ch = P.CHAR_BY_ID[id];
    if (!save.unlocked.includes(id)) { Sound.nope(); const c = card && card.querySelector('.tcard'); if (c) { c.classList.remove('wiggle'); void c.offsetWidth; c.classList.add('wiggle'); } return; }
    save.selected = id; char = ch; persist();
    Sound.boing(); haptic(15);
    $('sheetBody').innerHTML = charsHTML();
    P1.react = { kind: 'hop', t: now(), dur: 600 };
    if (mode === 'title') { P1.speech = { text: ch.quips[0], until: now() + 1600 }; refreshTitle(); }
  });

  // ---------------------------------------------------------------- share card
  async function makeCard() {
    const run = lastRun; if (!run) return null;
    const W = 1080, H = 1350, c = mk(W, H), g = c.getContext('2d');
    const ch = P.CHAR_BY_ID[run.character] || char;
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#2f8fff'); sky.addColorStop(0.7, '#bfeaff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // sunburst behind the flier
    g.save(); g.translate(W / 2, 560); g.fillStyle = '#ffffff22';
    for (let i = 0; i < 16; i++) { g.rotate(TAU / 16); g.beginPath(); g.moveTo(0, 0); g.lineTo(-90, -900); g.lineTo(90, -900); g.closePath(); g.fill(); }
    g.restore();
    g.globalAlpha = 0.95; g.drawImage(L.clouds[2].c, 40, 250, 300, 125); g.drawImage(L.clouds[1].c, 760, 380, 260, 108); g.globalAlpha = 1;
    // ground strip
    g.fillStyle = '#d99a5b'; g.fillRect(0, H - 120, W, 120); g.fillStyle = '#7ed957'; g.fillRect(0, H - 120, W, 34); g.fillStyle = INK; g.fillRect(0, H - 124, W, 6);
    // edge pipes
    for (const [x, gapTop, gapBot] of [[-40, 360, 760], [W - 120, 470, 860]]) {
      g.save(); g.translate(x, 0); g.scale(2.2, 2.2);
      const t2 = gapTop / 2.2, b2 = gapBot / 2.2, fl = (H - 120) / 2.2;
      g.lineWidth = 3; g.strokeStyle = INK;
      g.fillStyle = L.pipes.static.body; g.fillRect(0, -5, 70, t2 - 26 + 5); g.strokeRect(0, -10, 70, t2 - 26 + 10); g.fillRect(0, b2 + 26, 70, fl - b2 - 26); g.strokeRect(0, b2 + 26, 70, fl - b2 - 20);
      g.fillStyle = L.pipes.static.cap; rr(g, -6, t2 - 26, 82, 26, 6); g.fill(); g.stroke(); rr(g, -6, b2, 82, 26, 6); g.fill(); g.stroke();
      g.restore();
    }
    const label = (txt, x, y, size, fill, lw, font) => { g.font = (font || '') + size + 'px "Lilita One","Arial Rounded MT Bold",sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = lw || size * 0.2; g.strokeStyle = INK; g.strokeText(txt, x, y); g.fillStyle = fill; g.fillText(txt, x, y); };
    label('Flappy Fellas', W / 2, 160, 124, '#ffd23f');
    // the flier, with wings
    const im = IMG[ch.sprite];
    if (im) {
      g.save(); g.translate(W / 2, 520); g.rotate(-0.07);
      if (SPR_CACHE.wing) for (const side of [-1, 1]) { g.save(); g.scale(side, 1); g.translate(150, 10); g.rotate(-0.45); g.drawImage(SPR_CACHE.wing, -6, -150, 220, 165); g.restore(); }
      g.drawImage(im, -250, -250, 500, 500);
      if (ch.legendary && SPR_CACHE.crown) g.drawImage(SPR_CACHE.crown, -110, -330, 220, 154);
      g.restore();
    }
    // score panel
    const px = 120, py = 820, pw = W - 240, ph = 360;
    g.fillStyle = INK; rr(g, px, py + 14, pw, ph, 48); g.fill();
    g.fillStyle = '#fff8ec'; g.strokeStyle = INK; g.lineWidth = 8; rr(g, px, py, pw, ph, 48); g.fill(); g.stroke();
    label(String(run.score), W / 2, py + 210, 210, '#ffffff', 26);
    g.font = '900 40px Nunito, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#5b5480';
    g.fillText(ch.name + (run.mode === 'daily' ? '  \u00b7  Daily ' + run.date : '') + (runInfo && runInfo.newBest && run.mode !== 'daily' ? '  \u00b7  New best!' : ''), W / 2, py + 270, pw - 60);
    g.font = '800 38px Nunito, system-ui, sans-serif'; g.fillStyle = INK;
    g.fillText('\u201c' + $('quip').textContent + '\u201d', W / 2, py + 325, pw - 60);
    const tiers = [[200, 'LEGEND', '#ff5d73'], [100, 'PLATINUM', '#6fb7ff'], [50, 'GOLD', '#ffcd2e'], [25, 'SILVER', '#c3ccd8'], [10, 'BRONZE', '#d9822b']];
    const tier = tiers.find(([n]) => run.score >= n);
    if (tier) { g.save(); g.translate(px + pw - 40, py + 10); g.rotate(0.12); g.fillStyle = tier[2]; g.strokeStyle = INK; g.lineWidth = 6; rr(g, -150, -34, 190, 68, 34); g.fill(); g.stroke(); g.fillStyle = INK; g.font = '36px "Lilita One",sans-serif'; g.textAlign = 'center'; g.fillText(tier[1], -55, 13); g.restore(); }
    g.font = '900 34px Nunito, system-ui, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText('Camp Anawanna Arcade', W / 2, H - 40);
    return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
  }
  let shareBlob = null, shareURL = '';
  async function openShare() {
    const blob = await makeCard(); if (!blob) return;
    shareBlob = blob; if (shareURL) URL.revokeObjectURL(shareURL);
    shareURL = URL.createObjectURL(blob);
    $('shareImg').src = shareURL;
    $('share').hidden = false;
    const btn = $('shareSave'); btn.hidden = true;
    let dl = null;
    try { if (window.claude && window.claude.use) dl = await window.claude.use('downloads'); } catch (e) { dl = null; }
    const canShare = !window.claude && navigator.canShare && navigator.canShare({ files: [new File([blob], 'flight.png', { type: 'image/png' })] });
    if (dl || canShare || !window.claude) {
      btn.hidden = false;
      btn.querySelector('span').textContent = canShare ? 'Share' : 'Save image';
      btn.onclick = async () => {
        const name = 'flappy-fellas-' + lastRun.score + '.png';
        try {
          if (dl) { await dl.save({ filename: name, data: shareBlob }); $('shareHint').textContent = 'Saved!'; }
          else if (canShare) await navigator.share({ files: [new File([shareBlob], name, { type: 'image/png' })], title: 'Flappy Fellas' });
          else { const a = document.createElement('a'); a.href = shareURL; a.download = name; document.body.append(a); a.click(); a.remove(); }
        } catch (e) { $('shareHint').textContent = 'Long-press (or right-click) the card to save it.'; }
      };
    }
  }
  $('shareClose').addEventListener('click', () => { Sound.click(); $('share').hidden = true; });

  function onSaveReplaced() {
    char = char0(); buildSprites();
    if (mode === 'title') refreshTitle();
    if (sheetKind) openSheet(sheetKind);
    applySettings();
  }

  // ---------------------------------------------------------------- Lab API (kept from the original for AI playtesting)
  let lab = null;
  window.FlappyLab = {
    config: Object.assign({}, C),
    reset(seed = 42) { lab = E.create(seed); lab.events = null; return E.observe(lab); },
    step(action = 'wait', frames = 8) { if (!lab) this.reset(); E.step(lab, action === 'flap', frames); return E.observe(lab); },
    state() { return E.observe(lab || E.create(42)); },
    runPilot(frames = 3600, seed = 42) { const t = E.create(seed); t.events = null; for (let i = 0; i < Math.min(frames, 30000) && !t.dead; i++) E.step(t, E.policy(t)); lab = t; return E.observe(t); },
    live() { return Object.assign(E.observe(s), { mode, character: char.id }); },
    mode: () => mode,
    autopilot(on = true) { autopilot = !!on; return autopilot; },
    timeScale(n = 1) { timeScale = clamp(+n || 1, 0.1, 16); return timeScale; },
    save: () => JSON.parse(JSON.stringify(save)),
    perf: () => ({ fps: fpsVal, dpr: view.dpr, quality: quality.level, particles: parts.length }),
    flap: () => primary(),
    bench(n = 120) { const t0 = performance.now(); for (let i = 0; i < n; i++) { updateCosmetics(1, STEP_MS); render(1, 1); } return +((performance.now() - t0) / n).toFixed(3); },
  };

  // ---------------------------------------------------------------- boot
  function start() {
    applySettings();
    document.body.classList.toggle('rm', save.settings.reducedMotion);
    layout();
    char = char0();
    P1.dispX = C.width / 2; P1.dispY = titleAnchorY;
    setMode('title');
    requestAnimationFrame(frame);
    loadImages().then(() => { buildSprites(); refreshTitle(); });
    if (document.fonts && document.fonts.load) document.fonts.load('40px "Lilita One"').then(() => { updateTitleAnchor(); }).catch(() => {});
    let rz = 0;
    const onResize = () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => layout()); };
    window.addEventListener('resize', onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage);
    // first sound needs a gesture; music starts with it
    const unlock = () => { Sound.init(); if (save.settings.music) Music.start(); };
    ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
    if (save.pendingReveal.length) setTimeout(runReveals, 900);
    Cloud.init().then(() => { if (save.pendingReveal.length && mode === 'title') setTimeout(runReveals, 300); });
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ selected: save.selected }));
  }
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start); else start();
})();
