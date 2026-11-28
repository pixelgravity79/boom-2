// All sound is synthesised with WebAudio: no files to download, instant start.
export class Sound {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.bellOn = false;
    this.nextBell = 0;
    this.step = 0;
    this.nextNote = 0;
    this.tempo = 1;
  }

  /** Must be called from a user gesture (iOS/Chrome autoplay rules). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.55 : 0; this.music.connect(this.master);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.timer = setInterval(() => this.tick(), 50);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02); }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  get ok() { return this.ctx && this.ctx.state === 'running'; }

  tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.1, at = 0, attack = 0.005, dest = this.sfx, vib = 0 }) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 28; lg.gain.value = vib;
      l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, vol = 0.2, type = 'lowpass', f0 = 1000, f1 = f0, q = 1, at = 0, dest = this.sfx }) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  hop() { const r = 1 + (Math.random() - 0.5) * 0.12; this.tone({ type: 'square', f0: 430 * r, f1: 720 * r, dur: 0.075, vol: 0.06 }); }
  land(kind) {
    if (kind === 'river') this.tone({ type: 'sine', f0: 380, f1: 140, dur: 0.09, vol: 0.12 });
    else this.noise({ dur: 0.05, vol: kind === 'grass' ? 0.12 : 0.09, f0: kind === 'grass' ? 500 : 1400 });
  }
  bump() { this.tone({ type: 'triangle', f0: 190, f1: 90, dur: 0.1, vol: 0.16 }); }
  coin() { this.tone({ type: 'sine', f0: 988, dur: 0.07, vol: 0.12 }); this.tone({ type: 'sine', f0: 1480, dur: 0.14, vol: 0.12, at: 0.06 }); }
  click() { this.tone({ type: 'triangle', f0: 660, f1: 880, dur: 0.04, vol: 0.08 }); }
  squawk(at = 0) { this.tone({ type: 'square', f0: 820, f1: 520, dur: 0.22, vol: 0.07, vib: 60, at }); }
  splat() {
    this.noise({ dur: 0.28, vol: 0.4, type: 'bandpass', f0: 1600, f1: 250, q: 0.8 });
    this.tone({ type: 'sawtooth', f0: 130, f1: 40, dur: 0.22, vol: 0.18 });
    this.squawk(0.05);
  }
  splash() {
    this.noise({ dur: 0.55, vol: 0.35, type: 'bandpass', f0: 2600, f1: 380, q: 0.6 });
    for (let i = 0; i < 4; i++) this.tone({ type: 'sine', f0: 500 + i * 140, f1: 900 + i * 160, dur: 0.06, vol: 0.05, at: 0.12 + i * 0.07 });
    this.squawk(0);
  }
  trainHit() { this.splat(); this.noise({ dur: 0.7, vol: 0.3, type: 'lowpass', f0: 900, f1: 200 }); }
  horn() {
    for (const f of [311, 370, 466]) this.tone({ type: 'sawtooth', f0: f, dur: 0.7, vol: 0.035, attack: 0.04 });
    this.noise({ dur: 1.1, vol: 0.18, type: 'bandpass', f0: 300, f1: 900, q: 0.7, at: 0.15 });
  }
  eagle() { this.tone({ type: 'sawtooth', f0: 2100, f1: 1300, dur: 0.55, vol: 0.06, vib: 90 }); this.squawk(0.5); }
  best() { [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.14, vol: 0.06, at: i * 0.09 })); }
  gameOver() { [392, 330, 262].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.22, vol: 0.1, at: 0.25 + i * 0.16 })); }

  setBell(on) { this.bellOn = on; }

  // background: crossing bells + a light looping tune
  tick() {
    if (!this.ok) return;
    const now = this.ctx.currentTime;
    if (this.bellOn && now >= this.nextBell) {
      this.tone({ type: 'triangle', f0: 1760, dur: 0.12, vol: 0.05 });
      this.tone({ type: 'sine', f0: 2637, dur: 0.1, vol: 0.03 });
      this.nextBell = now + 0.32;
    }
    if (!this.musicOn) { this.nextNote = now; return; }
    if (this.nextNote < now) this.nextNote = now + 0.05;
    const beat = 60 / 118 / 2 / this.tempo;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const lead = [0, -1, 4, -1, 5, 4, 2, -1, 3, -1, 2, 1, 0, -1, -1, -1, 0, -1, 4, -1, 5, 6, 7, -1, 5, -1, 4, 2, 3, -1, -1, -1];
    const bassRoots = [0, 0, 5, 5, 3, 3, 4, 4];
    while (this.nextNote < now + 0.25) {
      const s = this.step % 32, at = this.nextNote - now;
      const n = lead[s];
      if (n >= 0) this.tone({ type: 'square', f0: 523.25 * Math.pow(2, scale[n] / 12), dur: beat * 0.9, vol: 0.018, at, dest: this.music });
      if (s % 2 === 0) {
        const root = [0, 2, 4, 7, 9, 5][bassRoots[(s >> 2) % 8]] ?? 0;
        this.tone({ type: 'triangle', f0: 130.81 * Math.pow(2, (root + (s % 4 === 2 ? 7 : 0)) / 12), dur: beat * 1.6, vol: 0.07, at, dest: this.music });
      }
      if (s % 4 === 2) this.noise({ dur: 0.04, vol: 0.05, type: 'highpass', f0: 6000, at, dest: this.music });
      this.nextNote += beat;
      this.step++;
    }
  }
}
