# Beanie Hop: project status (round 1)

**What it is:** an original voxel lane-hopping game for phone and desktop browsers. A chicken has to get across endless procedurally generated grass, roads, rivers and railways. The chicken's head is a real man's face from a photo, wearing his knit beanie. The face is the front of the 3D head cube, with a comb, beak and wattle attached to it.

**Lead developer:** Claude (Claude Code). The code lives in git, which is the single source of truth: repo `pixelgravity79/boom-2`, branch `ccr-436599e2-f8j3sd`, folder `beanie-hop/`.

ChatGPT Work's earlier files for this game could not be recovered: they were not in the repo, Google Drive or the published pages. The project was therefore rebuilt from scratch.

## Done and tested

- **Face pipeline** (`tools/make_face.py`)
  - MediaPipe face landmarks level the eyes.
  - Multiclass segmentation keeps face, glasses and beanie, and removes the background.
  - The photo's hazy filter is colour-graded out, and the face is composited onto a white feather texture.
  - It also produces the matching knit beanie side and top textures and a portrait for menus.
  - Output is in `assets/`.
- **Simulation** (`src/sim/`): pure JavaScript, no DOM, fixed 120 Hz step, deterministic per seed.
  - Lane generation, in strict row order from one seeded RNG:
    - grass with trees, rocks and bushes;
    - roads with cars, vans and trucks;
    - rivers with drifting logs or still lily pads;
    - railways with timed trains and warning lights.
  - Everything that moves is an analytic function of time, so any system can ask "where is it at time t?".
  - Rules:
    - hop, bump into trees or the edge;
    - ride logs and get swept off the edge;
    - splash, get hit by a car or train;
    - the camera creeps forward and an eagle takes you if you fall behind;
    - collect corn;
    - a 2-move input buffer.
- **Fairness guarantees,** checked over 300 seeds x 700 rows by `tests/sim.test.js`:
  - an always-open path through trees and lily pads;
  - road gaps that always leave a crossing window of at least 0.38 s;
  - log gaps between about 0.9 and 4.3 tiles;
  - trains always warn before they arrive.
- **Bot** (`src/sim/bot.js`): a lookahead autopilot playing the real rules, plus a static route map. It reaches row 160 on 10 of 12 test seeds.
- **24 of 24 tests pass:** `node tests/sim.test.js`. Add `--quick` for a short run.

## In progress (not playable yet)

- 3D renderer (Three.js r170, orthographic camera, one directional light with shadows). Written so far:
  - `voxel.js`: box builder and edge-darkening shader patch;
  - `models.js`: vehicles, trains, logs, trees, corn, eagle;
  - `chicken.js`: the hero model and its animations;
  - `lanes.js`: per-row meshes;
  - `particles.js`.
- Not written yet:
  - scene/camera setup, the main loop, input (tap, swipe, keyboard);
  - synthesized audio, menus and HUD, saving;
  - the single-file build and deployment.

## Key design decision to challenge

In this genre the camera normally sits behind the character, so you mostly see the back of its head. Here the man's face must stay recognisable, so **the chicken hops toward the camera (down the screen)** and faces the player.

- Tap, or swipe down, moves forward. Swipe up moves back.
- After a sideways move the chicken turns back to look at you.
- When it's flattened by a car it lands face-up, so you can still see who it was.

The cost is that this is less conventional than hopping up the screen.

## Coordinates (for reading the code)

- Columns: x from -4 to 4 is the playfield.
- Rows: r increases forward, and world z = r. The camera is on the +z side, looking back.
- Directions: `f` forward (+r), `b` back, `l` = -x, `r` = +x.
