// Shared tuning constants for the simulation. Distances are in tiles, times in seconds.
export const COL_MIN = -4;            // playable columns
export const COL_MAX = 4;
export const WRAP = 17;               // moving things live on a loop x in [-WRAP, WRAP)
export const LOOP = WRAP * 2;
export const DECOR_HALF = 15;         // scenery is generated out to here on each side
export const BACK_LIMIT = -3;         // rows below this are a wall of trees
export const START_SAFE_ROWS = 3;     // rows 0..3 are always plain grass

export const DT = 1 / 120;            // fixed simulation step
export const HOP_TICKS = 18;          // one hop = 0.15 s, a whole number of ticks so landing is exact
export const HOP_TIME = HOP_TICKS * DT;
export const BUMP_TIME = 0.11;        // bumping into a tree / the edge
export const HOP_HEIGHT = 0.42;
export const PLAYER_HALF = 0.28;      // half-width of the chicken's hitbox (x)
export const PLAYER_HALF_R = 0.22;    // half-depth of the chicken's hitbox (rows)
export const LANE_HALF_R = { road: 0.37, rail: 0.43 }; // half-depth of a car / train
export const LOG_TOLERANCE = 0.3;     // how far past a log's end a landing still counts (tiles)
export const SWEPT_X = COL_MAX + 0.95; // ride a log this far out and you're gone
export const QUEUE_MAX = 2;           // buffered inputs while mid-hop
export const INPUT_EXPIRE = 0.4;      // a buffered move older than this is dropped

export const EAGLE_MARGIN = 4.3;      // fall this many rows behind the pressure line and the eagle comes
export const EAGLE_WARN_MARGIN = 3.0; // ...and this far behind it starts circling (warning)
export const CAM_FOLLOW = 3.2;        // how fast the camera catches up with a player ahead of it
export const TRAIN_START = WRAP + 3;  // trains spawn this far off to the side
export const TRAIN_WARN = 1.25;       // minimum seconds of warning lights before a train arrives
export const trainWarn = (d) => 1.5 - 0.25 * d;

// difficulty 0..1 by row
export const difficulty = (row) => Math.min(1, Math.max(0, row) / 320);
// camera creep speed (rows / second) once the run has started
export const autoScroll = (score) => 0.30 + Math.min(0.38, score * 0.0018);
// longest run of dangerous rows (road / river / rail) before a grass row is forced
export const hazardCap = (row) => (row < 20 ? 3 : row < 60 ? 4 : row < 150 ? 5 : 7);
export const MAX_RIVER_RUN = 3;
export const MAX_CAR_SPEED = 5.8;

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
