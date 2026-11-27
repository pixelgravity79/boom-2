# Flappy Fellas

A summer-camp flappy game starring real faces. Tap to flap, fly through the gaps, unlock a new flier every 50 points.

Rebuilt from the original *Flappy Fellas · Claude Lab* (Camp Guy / Couch Guy). It keeps the shared deterministic engine, the `FlappyLab` console API and the Node test runner, and adds everything else.

## Play

- **Phone / tablet / desktop:** open `index.html` from any static host, or `dist/index.html`, a single self-contained file you can even open straight from disk.
- Local dev: `python3 -m http.server 8000`, then open `http://localhost:8000`.
- Controls: tap, click or <kbd>Space</kbd>/<kbd>↑</kbd> to flap · <kbd>P</kbd>/<kbd>Esc</kbd> pause · <kbd>Enter</kbd> fly again.

## What's in it

**Fliers.** Seven characters cut out of real photos (background removed, die-cut sticker border, cartoon wings). Five unlock by score, two are bought with marshmallows:

| Flier | Unlock | Quirk |
|---|---|---|
| Razz | start | bubble trail, raspberry energy |
| Couch Critic | score 50 | pink star trail, rates every pipe 2/10 |
| Road Tripper | score 100 | exhaust puffs and a *meep-meep* flap |
| Chill Pill | score 150 | music-note trail, zero hurry |
| Golden Razz *(legendary)* | score 200 | gold statue finish, crown, rainbow trail, harp flaps |
| Pom-Pom Pilot | shop: 30 marshmallows | snowflake trail, sleigh-bell flaps |
| Fairway Flier | shop: 30 marshmallows | golf-ball trail, golf-swing *tink* flaps |

Unlocks are saved the instant the score is reached (a crash a frame later can't lose them), get a toast and confetti mid-flight, then a full reveal ceremony at game over: drum roll, a shaking mystery trading card, a flash, a fanfare and a card flip. The **Fliers** screen shows a trading card for each, with locked silhouettes, requirements and progress bars.

**Marshmallow shop.** Every golden marshmallow you collect goes into a bank (shown on the title screen and in flight). Shop fliers are bought from the bottom of the Fliers screen with a two-tap confirm, then get the same reveal ceremony. The bank is *collected minus spent*, so marshmallows collected before the shop existed count, and a purchase can't be undone or double-spent by an older cloud copy.

**Gameplay**
- Fixed 60 Hz simulation, rendered with interpolation, so motion is smooth on 60/90/120 Hz screens; input is applied on the next simulation step.
- Circle-vs-rectangle collision around the face. **Only your face counts; the hair is decorative.**
- Soft ceiling (no more dying for touching the top), terminal velocity, squash-and-stretch, nose-dive tilt.
- Difficulty ramps by pipe number (speed 2.55 to 3.55, gap 184 to 144 over ~170 pipes), so the course never depends on how you play.
- Special obstacles: **bobbing teal pipes** (from pipe 12) and **purple chompers** with teeth and googly eyes that watch you (from pipe 32). Every 25th pipe is a gold milestone pipe.
- Pickups: **golden marshmallows** (+1 point, and +1 in the shop bank) and **bubble shields** (survive one crash).
- **Perfect** centre passes chain into streaks; hair-width near misses shout *Whew!*
- Restart is one tap from the game-over screen.

**World:** parallax mountains, lake, camp cabin and pine forest; the day turns to sunset, night (stars, moon, fireflies, shooting stars, a marshmallow-stealing UFO) and dawn as you fly; hot-air balloons and geese by day. The title screen matches your real clock.

**Extras:** 22 merit badges · Big Head Mode and Party Mode perks (earned with badges) · **Daily Flight**: the same course for everyone each day, racing a ghost of your best attempt · shareable flight card · poke your flier on the title screen (it has opinions; leave it alone and it falls asleep) · character-specific game-over quips · synthesized sound effects and a camp chiptune that speeds up with you · haptics where supported · reduced-motion setting · auto-pause when you switch apps · portrait-only prompt on phones turned sideways.

**Saving:** everything (best scores, per-flier bests, unlocks, badges, stats, settings, daily ghost) is saved in `localStorage`, with versioned save data that repairs itself if corrupted. Best scores from the original game (`flappy-lab-Camp Guy` / `flappy-lab-Couch Guy`) carry over automatically. When hosted on claude.ai, a private per-player copy is also kept in the page's database and merged back if browser storage is cleared.

**Performance:** pre-rendered parallax layers and sprites, pooled particles, no per-frame `shadowBlur`/filters, a CSS vignette, capped canvas resolution, and automatic quality reduction if a device can't hold 60 fps (toggle **Show FPS** in Settings, or add `#fps` to the URL).

## Files

| File | What |
|---|---|
| `engine.js` | deterministic simulation shared by the game, the Lab API and the tests (UMD, no DOM) |
| `progress.js` | characters, unlocks, achievements, save sanitising/merging, quips (UMD, no DOM) |
| `game.js` | renderer, audio synth, input, menus, unlock ceremony, share card |
| `index.html`, `style.css` | markup and styles |
| `assets/char1-7.webp` | character sprites |
| `build.js` | builds `dist/index.html` (single file) and `dist/artifact.html` (same page without the html/head/body skeleton) |
| `test.js` | Node regression tests for engine + progression |
| `tests/e2e.js` | Playwright browser tests with iPhone / Pixel / iPad / desktop emulation |
| `tools/make_character.py` | photo → sticker sprite pipeline (BiRefNet matting + MediaPipe hair/face segmentation) |

## Test and build

```sh
node test.js              # 28 engine + progression tests (no dependencies)
npm install               # once, for Playwright
node tests/e2e.js         # 33 browser checks against index.html
node build.js             # -> dist/index.html, dist/artifact.html
node tests/e2e.js dist    # same browser checks against the single-file build
```

## For AI playtesting (`FlappyLab`)

Same idea as the original: open the browser console.

```js
FlappyLab.reset(42); FlappyLab.step('flap', 8); FlappyLab.step('wait', 8); FlappyLab.state();  // headless step mode
FlappyLab.runPilot(3600)        // lookahead test pilot on a headless run
FlappyLab.autopilot(true)       // let the pilot fly the live game
FlappyLab.timeScale(8)          // fast-forward the live game
FlappyLab.live(); FlappyLab.save(); FlappyLab.perf(); FlappyLab.bench()
```

`engine.js` also loads in Node: `const E = require('./engine'); const s = E.create(42); E.step(s, true);`

## Adding a flier

1. `python tools/make_character.py photo.jpg assets/char8.webp` (tweak `--cut`, `--rx` if long hair needs trimming; add `--hat` for hats and caps).
2. Add an entry to `CHARACTERS` in `progress.js` (`sprite: 'char8'`, colours, trail, quips, and either `unlockAt: <score>` or `unlockAt: null, cost: <marshmallows>` for the shop).
3. `node test.js && node build.js`.
