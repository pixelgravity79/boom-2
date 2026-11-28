# Beanie Hop

An original voxel lane-hopping game for phone and desktop browsers. A chicken whose head is the man from the photo, beanie and all, has to cross endless roads, rivers and railways.

This is a separate project from Flappy Fellas, which is in the repo root. Nothing outside `beanie-hop/` belongs to this game.

**Status: playable.** Build it with `node build.js`, then open `dist/index.html`. It's one self-contained file that works offline or from any web host. See `collab/STATUS.md` for details.

**Controls:**
- Tap or swipe down hops toward you. Swipe left or right steps sideways, and swipe up hops back.
- Keyboard: arrows or WASD, and Space hops. P or Esc pauses.

## Commands

```sh
npm install
npm test               # simulation tests (300 seeds x 700 rows + bot run) and collaboration-tool tests
npm run test:quick     # shorter version
npm run handoff        # rebuild the messages for ChatGPT / Gemini / Grok in collab/out/
npm run feedback       # read their replies (pasted files and pushed collab/<name> branches)
npm run ask:gemini     # send Gemini its message through the API and save the reply
npm run build          # -> dist/index.html
npm run test:e2e       # browser tests: iPhone, Pixel, iPad, desktop
```

## Layout

| Path | What |
|---|---|
| `src/sim/` | game rules and level generator: pure JS, deterministic, runs in Node |
| `src/render/` | Three.js voxel renderer: models, chicken, lanes, particles, camera |
| `src/main.js`, `src/ui.js`, `src/input.js`, `src/audio.js`, `src/storage.js` | game loop, menus/HUD, controls, synthesized sound, saving |
| `assets/` | face and beanie textures made from the photo |
| `assets-src/hero-photo.webp` | the original photo |
| `tools/make_face.py` | photo to head textures (MediaPipe landmarks and segmentation) |
| `collab/` | working with the other AIs; start at `collab/README.md` |
| `tests/` | `sim.test.js` and `collab.test.js` |
