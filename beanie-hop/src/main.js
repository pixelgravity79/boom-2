// Wires the simulation, renderer, input, sound and UI together and runs the frame loop.
import * as THREE from 'three';
import * as C from './sim/config.js';
import { Game } from './sim/game.js';
import { trainState } from './sim/world.js';
import { decide } from './sim/bot.js';
import { randomSeed } from './sim/rng.js';
import { Renderer } from './render/scene.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';
import * as store from './storage.js';
import headFront from '../assets/head_front.webp';
import headSideL from '../assets/head_side_l.webp';
import headSideR from '../assets/head_side_r.webp';
import headBack from '../assets/head_back.webp';
import headTop from '../assets/head_top.webp';
import portrait from '../assets/portrait.webp';
import faceMeta from '../assets/face_meta.json';

const params = new URLSearchParams(location.search + '&' + location.hash.slice(1));

async function loadTextures() {
  const loader = new THREE.TextureLoader();
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const [front, sideL, sideR, back, top] = await Promise.all([headFront, headSideL, headSideR, headBack, headTop].map(load));
  return { front, sideL, sideR, back, top };
}

async function start(hot = {}) {
  const canvas = document.getElementById('gl');
  const save = store.load();
  if (hot && hot.save && typeof hot.save === 'object') { // carried over a republish of the page
    for (const k of ['best', 'corn', 'games', 'hops']) if (Number.isFinite(hot.save[k])) save[k] = Math.max(save[k], hot.save[k]);
  }
  const sound = new Sound();
  sound.sfxOn = save.sfx; sound.musicOn = save.music;

  let renderer;
  try {
    renderer = new Renderer(canvas, { textures: await loadTextures(), meta: faceMeta });
  } catch (err) {
    document.getElementById('loading').textContent = 'This browser could not start 3D graphics (WebGL).';
    throw err;
  }

  let game = null, mode = 'title', acc = 0, last = performance.now(), deathShownAt = 0, overTimer = 0;
  let newBestShown = false, runStartBest = save.best, autopilot = params.has('autopilot'), timeScale = 1;
  const trainActive = new Map();

  const ui = new UI({
    click: () => { sound.unlock(); sound.click(); },
    pause: () => pause(),
    resume: () => resume(),
    restart: () => newGame(true),
    home: () => { newGame(false); },
    toggleSfx: () => { save.sfx = !save.sfx; sound.setSfx(save.sfx); store.save(save); ui.setToggles(save.sfx, save.music); },
    toggleMusic: () => { save.music = !save.music; sound.setMusic(save.music); store.save(save); ui.setToggles(save.sfx, save.music); },
  });
  ui.setPortrait(portrait);
  ui.setToggles(save.sfx, save.music);

  function newGame(play) {
    game = new Game(params.has('seed') ? +params.get('seed') : randomSeed());
    renderer.reset(game);
    acc = 0; newBestShown = false; runStartBest = save.best; overTimer = 0;
    trainActive.clear();
    sound.setBell(false);
    ui.danger(false);
    if (play) { mode = 'play'; ui.show('play'); ui.hud(0, save.best, 0); }
    else { mode = 'title'; ui.title(save); }
  }

  function pause() {
    if (mode !== 'play') return;
    mode = 'pause'; ui.show('pause'); sound.setBell(false); game.queue.length = 0;
  }
  function resume() {
    if (mode !== 'pause') return;
    mode = 'play'; ui.show('play'); last = performance.now(); sound.resume();
  }

  const input = new Input(document.getElementById('app'), {
    blocked: (el) => !!(el && el.closest && el.closest('.ui, .card')),
    press: () => { if (mode === 'play' || mode === 'title') renderer.chicken.press(); },
    release: () => renderer.chicken.release(),
    move: (dir) => {
      sound.unlock();
      if (mode === 'title') { mode = 'play'; ui.show('play'); ui.hud(0, save.best, 0); if (!save.seenHelp) { save.seenHelp = true; store.save(save); } }
      if (mode === 'play') game.input(dir);
      else if (mode === 'over' && performance.now() - deathShownAt > 700) newGame(true);
    },
    key: (code) => {
      if (code === 'Escape' || code === 'KeyP') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); return true; }
      if ((code === 'Enter' || code === 'Space') && mode === 'over') { sound.unlock(); newGame(true); return true; }
      if ((code === 'Enter' || code === 'Space') && mode === 'pause') { resume(); return true; }
      return false;
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); sound.suspend(); } else if (mode !== 'pause') sound.resume();
  });
  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 200));

  function handleEvents() {
    const events = game.drainEvents();
    for (const e of events) {
      if (mode === 'play' || mode === 'over') {
        if (e.type === 'hop') sound.hop();
        else if (e.type === 'land') sound.land(e.lane);
        else if (e.type === 'bump') sound.bump();
        else if (e.type === 'coin') sound.coin();
        else if (e.type === 'score' && !newBestShown && runStartBest > 0 && e.score > runStartBest) { newBestShown = true; ui.toast('NEW BEST!'); sound.best(); }
        else if (e.type === 'eagleWarn') { ui.danger(true); sound.eagleWarn(); }
        else if (e.type === 'eagleWarnEnd') ui.danger(false);
        else if (e.type === 'death') { ui.danger(false); onDeath(e.kind); }
      }
    }
    renderer.effects(game, events);
  }

  function onDeath(kind) {
    if (kind === 'car') sound.splat();
    else if (kind === 'train') sound.trainHit();
    else if (kind === 'eagle') sound.eagle();
    else sound.splash();
    if (navigator.vibrate) { try { navigator.vibrate(kind === 'train' ? [60, 40, 90] : 70); } catch { /* not allowed */ } }
    sound.setBell(false);
    const newBest = game.score > save.best;
    save.best = Math.max(save.best, game.score);
    save.corn += game.corn;
    save.games++;
    save.hops += game.hops;
    store.save(save);
    overTimer = kind === 'eagle' ? 1.6 : kind === 'train' ? 1.1 : 0.85;
    mode = 'over-wait';
    const info = { kind, score: game.score, best: save.best, newBest: newBest && game.score > 0, corn: game.corn };
    ui.pendingOver = info;
  }

  // background sounds tied to the world: crossing bells and passing trains near the chicken
  function worldSounds(t) {
    let bell = false;
    for (let r = game.p.r - 3; r <= game.p.r + 7; r++) {
      const lane = game.lane(r);
      if (!lane || lane.type !== 'rail') continue;
      const s = trainState(lane, t);
      if (s.warn && !s.active) bell = true;
      if (s.active && !trainActive.get(r) && Math.abs(r - game.p.r) < 7) sound.horn();
      trainActive.set(r, s.active);
    }
    sound.setBell(bell && mode === 'play');
  }

  // adaptive quality: drop resolution, then shadows, if the device can't hold ~50 fps
  const perf = { frames: 0, time: 0, slow: 0, level: 0, fps: 60 };
  const LEVELS = [
    {},
    { dpr: Math.min(window.devicePixelRatio || 1, 1.5) },
    { dpr: Math.min(window.devicePixelRatio || 1, 1.25), shadowSize: 1024 },
    { dpr: 1, shadowSize: 1024, particles: 0.6 },
    { dpr: 1, shadows: false, particles: 0.5 },
  ];
  if (params.has('low')) { perf.level = 4; renderer.setQuality(LEVELS[4]); }
  function trackPerf(dt) {
    perf.frames++; perf.time += dt;
    if (perf.time < 1.5) return;
    perf.fps = perf.frames / perf.time;
    if (params.has('fps')) ui.fps(`${perf.fps.toFixed(0)} fps  q${perf.level}  dpr ${renderer.quality.dpr}`);
    if (perf.fps < 48 && !document.hidden && mode === 'play') perf.slow++; else perf.slow = 0;
    if (perf.slow >= 2 && perf.level < LEVELS.length - 1) { perf.level++; renderer.setQuality(LEVELS[perf.level]); perf.slow = 0; }
    perf.frames = 0; perf.time = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (mode === 'pause') return;
    dt *= timeScale;
    if (autopilot && mode === 'play' && !game.p.hop && !game.queue.length && game.t >= game.p.bumpUntil && game.state !== 'dead') {
      const a = decide(game, 3);
      if (a) game.input(a);
    }
    acc += dt;
    let n = 0;
    while (acc >= C.DT && n < 40) { game.step(C.DT); acc -= C.DT; n++; }
    if (n >= 40) acc = 0;
    const t = game.t + acc;
    handleEvents();
    if (mode === 'play') { ui.hud(game.score, save.best, game.corn); worldSounds(t); }
    if (mode === 'over-wait') {
      overTimer -= dt;
      if (overTimer <= 0) { mode = 'over'; deathShownAt = performance.now(); ui.gameOver(ui.pendingOver); sound.gameOver(); }
    }
    sound.tempo = 1 + Math.min(0.35, game.score / 400);
    renderer.render(game, t, dt, mode === 'title' ? 'title' : mode === 'play' ? 'play' : 'over', now / 1000);
    if (game.p.r % 25 === 0) game.prune();
    trackPerf(dt / timeScale);
  }

  newGame(false);
  ui.loaded();
  requestAnimationFrame((t) => { last = t; frame(t); });

  // console / test hooks
  window.BeanieHop = {
    get game() { return game; },
    get mode() { return mode; },
    get perf() { return { ...perf, quality: { ...renderer.quality } }; },
    renderer,
    play: () => { if (mode === 'title') input.h.move('f'); },
    move: (d) => input.h.move(d),
    autopilot: (on = true) => { autopilot = on; },
    timeScale: (s) => { timeScale = s; },
    restart: (seed) => { if (seed !== undefined) params.set('seed', seed); newGame(true); },
    save: () => ({ ...save }),
  };
  try { window.claude?.hot?.snapshot?.(() => ({ save: { ...save } })); } catch { /* not hosted on claude.ai */ }
}

const boot = (data) => start(data || {});
if (window.claude?.hot?.ready) window.claude.hot.ready(boot);
else boot(window.claude?.hot?.data ?? {});
