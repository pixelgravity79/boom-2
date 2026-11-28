// DOM overlay: title, HUD, pause and game-over card.
const $ = (id) => document.getElementById(id);

const ICONS = {
  sfx: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7" stroke="#2a2230" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  sfxOff: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="#2a2230" stroke-width="2" stroke-linecap="round"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 17V6l10-2v11" stroke="#2a2230" stroke-width="2" fill="none"/><circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="15" r="2.6"/></svg>',
  musicOff: '<svg viewBox="0 0 24 24"><path d="M9 17V6l10-2v11" stroke="#2a2230" stroke-width="2" fill="none"/><circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="15" r="2.6"/><path d="M3 3l18 18" stroke="#2a2230" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

const DEATHS = {
  car: { title: 'SPLAT!', quips: ['Should have looked both ways.', 'Flat as a pancake. A very handsome pancake.', 'That car did not brake for poultry.', 'Squashed. The beanie survived, at least.'] },
  train: { title: 'TOOT TOOT!', quips: ['That train had places to be.', 'The bells were ringing for a reason.', 'Next stop: the great coop in the sky.'] },
  splash: { title: 'SPLASH!', quips: ["Can't swim. Never could.", 'Chickens and rivers: not friends.', 'That was a puddle with ambitions.'] },
  swept: { title: 'SWEPT AWAY!', quips: ['Rode that log a bit too long.', 'Off to see the ocean, apparently.', 'Should have hopped off sooner.'] },
  eagle: { title: 'SNATCHED!', quips: ['Too slow! The eagle was hungry.', 'Standing still is not a strategy.', 'Air mail, one chicken.'] },
};

export class UI {
  constructor(h) {
    this.h = h;
    this.el = {};
    for (const id of ['hud', 'score', 'hud-best', 'corn', 'title', 'title-best', 'title-corn', 'pause', 'over', 'over-title', 'quip', 'over-score', 'over-best', 'over-corn', 'new-best', 'portrait', 'toast', 'fps', 'loading']) this.el[id] = $(id);
    const on = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); h.click(); fn(); });
    on('pause-btn', h.pause);
    on('resume-btn', h.resume);
    on('again-btn', h.restart);
    on('home-btn', h.home);
    on('home-btn-2', h.home);
    for (const id of ['sfx-btn', 'sfx-btn-2']) on(id, h.toggleSfx);
    for (const id of ['music-btn', 'music-btn-2']) on(id, h.toggleMusic);
    this.toastTimer = 0;
    this.lastScore = -1;
  }

  setPortrait(url) { this.el.portrait.src = url; }
  loaded() { this.el.loading.classList.add('gone'); setTimeout(() => this.el.loading.remove(), 400); }

  setToggles(sfx, music) {
    for (const id of ['sfx-btn', 'sfx-btn-2']) { const b = $(id); b.innerHTML = sfx ? ICONS.sfx : ICONS.sfxOff; b.classList.toggle('off', !sfx); b.setAttribute('aria-pressed', String(sfx)); }
    for (const id of ['music-btn', 'music-btn-2']) { const b = $(id); b.innerHTML = music ? ICONS.music : ICONS.musicOff; b.classList.toggle('off', !music); b.setAttribute('aria-pressed', String(music)); }
  }

  show(screen) { // 'title' | 'play' | 'pause' | 'over'
    this.el.title.classList.toggle('hidden', screen !== 'title');
    this.el.hud.classList.toggle('hidden', screen === 'title');
    this.el.pause.classList.toggle('hidden', screen !== 'pause');
    this.el.over.classList.toggle('hidden', screen !== 'over');
  }

  title(save) {
    this.el['title-best'].textContent = save.best;
    this.el['title-corn'].textContent = save.corn;
    this.show('title');
  }

  hud(score, best, corn) {
    if (score !== this.lastScore) {
      this.el.score.textContent = score;
      if (score > 0) { this.el.score.classList.remove('pop'); void this.el.score.offsetWidth; this.el.score.classList.add('pop'); }
      this.lastScore = score;
    }
    this.el['hud-best'].textContent = 'TOP ' + Math.max(best, score);
    this.el.corn.textContent = corn;
  }

  toast(text, ms = 1100) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  gameOver({ kind, score, best, newBest, corn }) {
    const d = DEATHS[kind] || DEATHS.car;
    this.el['over-title'].textContent = d.title;
    this.el.quip.textContent = d.quips[Math.floor(Math.random() * d.quips.length)];
    this.el['over-score'].textContent = score;
    this.el['over-best'].textContent = best;
    this.el['over-corn'].textContent = '+' + corn;
    this.el['new-best'].classList.toggle('hidden', !newBest);
    const card = this.el.over.querySelector('.card');
    card.className = 'card over-card dead-' + (kind === 'swept' ? 'splash' : kind);
    this.show('over');
  }

  fps(text) { this.el.fps.classList.remove('hidden'); this.el.fps.textContent = text; }
}
