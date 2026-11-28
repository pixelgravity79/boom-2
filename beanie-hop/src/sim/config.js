// Shared tuning constants for the simulation. Distances are in tiles, times in seconds.
export const COL_MIN = -4;            // playable columns
export const COL_MAX = 4;
export const WRAP = 17;               // moving things live on a loop x in [-WRAP, WRAP)
export const LOOP = WRAP * 2;
export const DECOR_HALF = 15;         // scenery is generated out to here on each side
export const BACK_LIMIT = -3;         // rows below this are a wall of trees
export const START_SAFE_ROWS = 3;     // rows 0..3 are always plain grass

export const DT = 1 / 120;            // fixed simulation step
export const HOP_TIME = 0.135;        // one hop
export const BUMP_TIME = 0.11;        // bumping into a tree / the edge
export const HOP_HEIGHT = 0.42;
export const PLAYER_HALF = 0.28;      // half-width of the chicken's hitbox
export const LOG_TOLERANCE = 0.3;     // how far past a log's end a landing still counts
export const SWEPT_X = COL_MAX + 0.95; // ride a log this far out and you're gone
export const QUEUE_MAX = 2;           // buffered inputs while mid-hop

export const EAGLE_MARGIN = 3.4;      // fall this many rows behind the camera and the eagle comes
export const CAM_FOLLOW = 3.2;        // how fast the camera catches up with a player ahead of it
export const TRAIN_START = WRAP + 3;  // trains spawn this far off to the side
export const TRAIN_WARN = 1.25;       // seconds of warning lights before a train arrives

// difficulty 0..1 by row
export const difficulty = (row) => Math.min(1, Math.max(0, row) / 320);
// camera creep speed (rows / second) once the run has started
export const autoScroll = (score) => 0.36 + Math.min(0.38, score * 0.0022);

export const DIRS = {
  f: { dx: 0, dr: 1 },   // forward = toward the camera (down the screen)
  b: { dx: 0, dr: -1 },
  l: { dx: -1, dr: 0 },
  r: { dx: 1, dr: 0 },
};

export const VEHICLES = {
  car: { len: 1.45 },
  van: { len: 1.75 },
  truck: { len: 2.7 },
};
