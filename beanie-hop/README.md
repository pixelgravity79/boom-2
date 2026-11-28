# Beanie Hop

An original voxel lane-hopping game for phone and desktop browsers. A chicken whose head is the man from the photo, beanie and all, has to cross endless roads, rivers and railways.

This is a separate project from Flappy Fellas, which is in the repo root. Nothing outside `beanie-hop/` belongs to this game.

**Status: work in progress, not playable yet.**

| Part | State |
|---|---|
| Face pipeline | done |
| Simulation and level generator | done, with tests |
| 3D renderer | partly written |
| Input, audio, menus, build and deployment | still to do |

See `collab/STATUS.md` for details.

## Commands

```sh
npm install
npm test               # simulation tests (300 seeds x 700 rows + bot run) and collaboration-tool tests
npm run test:quick     # shorter version
npm run handoff        # rebuild the messages for ChatGPT / Gemini / Grok in collab/out/
npm run feedback       # read their replies (pasted files and pushed collab/<name> branches)
```

## Layout

| Path | What |
|---|---|
| `src/sim/` | game rules and level generator: pure JS, deterministic, runs in Node |
| `src/render/` | Three.js voxel renderer: models, chicken, lanes, particles |
| `assets/` | face and beanie textures made from the photo |
| `assets-src/hero-photo.webp` | the original photo |
| `tools/make_face.py` | photo to head textures (MediaPipe landmarks and segmentation) |
| `collab/` | working with the other AIs; start at `collab/README.md` |
| `tests/` | `sim.test.js` and `collab.test.js` |
