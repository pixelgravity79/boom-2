// Voxel models. Each returns a cached BufferGeometry with vertex colours (one draw call per object).
// Vehicles point along +x; the lane view rotates them for traffic going the other way.
import { VoxelBuilder, NO_BOTTOM, vary, col } from './voxel.js';

export const PAL = {
  grassA: 0x95d86a, grassB: 0x8bce62, grassEdge: 0x6fae4c, dirt: 0x8a6a46,
  road: 0x5b606c, roadEdge: 0x4a4e58, line: 0xf1f1ea,
  water: 0x56c3ee, waterDeep: 0x45afe0,
  gravel: 0x8d857b, sleeper: 0x6e4c36, rail: 0xc3c9d1,
  trunk: 0x7b5434, leaf: [0x4caf50, 0x5cbf4f, 0x3f9f4a, 0x69c35a], leafTop: 0x7fd36a,
  rock: 0xa3a8ad, rockTop: 0xbfc3c7, bush: 0x3e9a48, stump: 0x8a5d3a, stumpTop: 0xd2a979,
  flowers: [0xff6b8b, 0xffd166, 0xffffff, 0xb388ff],
  log: 0x8b5a3a, logDark: 0x6f4429, logEnd: 0xd1a676,
  pad: 0x4fb34f, padDark: 0x3f9a40,
  cars: [0xe8475f, 0xffb52e, 0x3fa7d6, 0x2ec4b6, 0xf2856d, 0x9f6ad4], // teal, not green: reads apart from grass (Gemini F7)
  trucks: [0xe8475f, 0x3fa7d6, 0xffb52e, 0x50b383],
  cargo: [0xf4f1ea, 0xf6a04d, 0xe9e2d0, 0x7fc8f8],
  glass: 0x2d3d5c, tire: 0x26262b, hub: 0x9aa0a6, head: 0xfff3b0, tail: 0xff4d4d,
  trainRed: 0xd7263d, trainDark: 0x2b2d42, trainCream: 0xf4efe1, trainBlue: 0x3e92cc,
  corn: 0xffcf33, cornDark: 0xf2a922, husk: 0x7ccf5b,
  white: 0xf7f4ee, orange: 0xf5a623, red: 0xe8424b,
  eagle: 0x5b3a26, eagleDark: 0x432a1b, eagleHead: 0xf6f3ea, beakYellow: 0xffc53d,
};

const cache = new Map();
const cached = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

function wheels(b, len, width, r = 0.15) {
  const xs = len > 2 ? [len / 2 - 0.4, -len / 2 + 0.45, -len / 2 + 0.85] : [len / 2 - 0.36, -len / 2 + 0.36];
  for (const x of xs) for (const s of [-1, 1]) {
    b.box(r * 2, r * 2, 0.12, x, 0, s * (width / 2 - 0.02), PAL.tire, NO_BOTTOM);
    b.box(r * 0.9, r * 0.9, 0.02, x, r * 0.55, s * (width / 2 + 0.05), PAL.hub);
  }
}

export const carGeo = (ci) => cached('car' + ci, () => {
  const b = new VoxelBuilder();
  const body = col(PAL.cars[ci % PAL.cars.length]);
  const L = 1.45, W = 0.8;
  b.box(L, 0.3, W, 0, 0.14, 0, body, NO_BOTTOM);
  b.box(L - 0.06, 0.06, W - 0.08, 0, 0.1, 0, col(PAL.tire));             // shadow line under the body
  b.box(0.82, 0.2, W - 0.06, -0.08, 0.44, 0, col(PAL.glass));            // windows
  b.box(0.78, 0.08, W - 0.12, -0.08, 0.64, 0, body.clone().multiplyScalar(1.08)); // roof
  b.box(0.12, 0.2, W - 0.1, -0.08, 0.44, 0, body);                       // pillar between windows
  b.box(0.04, 0.09, 0.16, L / 2, 0.28, W / 2 - 0.16, PAL.head);
  b.box(0.04, 0.09, 0.16, L / 2, 0.28, -W / 2 + 0.16, PAL.head);
  b.box(0.04, 0.08, 0.14, -L / 2, 0.28, W / 2 - 0.16, PAL.tail);
  b.box(0.04, 0.08, 0.14, -L / 2, 0.28, -W / 2 + 0.16, PAL.tail);
  wheels(b, L, W);
  return b.build();
});

export const vanGeo = (ci) => cached('van' + ci, () => {
  const b = new VoxelBuilder();
  const body = col(PAL.cars[(ci + 2) % PAL.cars.length]);
  const L = 1.75, W = 0.82;
  b.box(L, 0.62, W, 0, 0.14, 0, body, NO_BOTTOM);
  b.box(0.3, 0.22, W + 0.02, L / 2 - 0.2, 0.46, 0, PAL.glass);
  b.box(L - 0.5, 0.06, W + 0.02, -0.2, 0.5, 0, col(0xffffff));            // side stripe
  b.box(0.04, 0.1, 0.16, L / 2, 0.24, W / 2 - 0.16, PAL.head);
  b.box(0.04, 0.1, 0.16, L / 2, 0.24, -W / 2 + 0.16, PAL.head);
  b.box(0.04, 0.1, 0.14, -L / 2, 0.24, W / 2 - 0.16, PAL.tail);
  b.box(0.04, 0.1, 0.14, -L / 2, 0.24, -W / 2 + 0.16, PAL.tail);
  wheels(b, L, W);
  return b.build();
});

export const truckGeo = (ci) => cached('truck' + ci, () => {
  const b = new VoxelBuilder();
  const cab = col(PAL.trucks[ci % PAL.trucks.length]);
  const cargo = col(PAL.cargo[ci % PAL.cargo.length]);
  const L = 2.7, W = 0.86;
  b.box(0.78, 0.66, W, L / 2 - 0.39, 0.16, 0, cab, NO_BOTTOM);
  b.box(0.06, 0.22, W - 0.1, L / 2, 0.5, 0, PAL.glass);
  b.box(0.5, 0.2, W + 0.02, L / 2 - 0.4, 0.5, 0, PAL.glass);
  b.box(0.04, 0.1, 0.16, L / 2, 0.22, W / 2 - 0.16, PAL.head);
  b.box(0.04, 0.1, 0.16, L / 2, 0.22, -W / 2 + 0.16, PAL.head);
  b.box(1.84, 0.9, W + 0.04, -L / 2 + 0.92, 0.2, 0, cargo, NO_BOTTOM);
  b.box(1.86, 0.1, W + 0.06, -L / 2 + 0.92, 0.62, 0, cab);               // stripe on the box
  b.box(L - 0.1, 0.1, W - 0.2, 0, 0.1, 0, col(PAL.tire));
  wheels(b, L, W, 0.16);
  return b.build();
});

export const vehicleGeo = (m) => (m.kind === 'truck' ? truckGeo(m.color) : m.kind === 'van' ? vanGeo(m.color) : carGeo(m.color));

export const logGeo = (len) => cached('log' + len, () => {
  const b = new VoxelBuilder();
  b.box(len - 0.06, 0.3, 0.74, 0, 0, 0, PAL.log, NO_BOTTOM);
  for (let x = -len / 2 + 0.45; x < len / 2 - 0.2; x += 0.62) b.box(0.1, 0.302, 0.742, x, 0, 0, PAL.logDark, NO_BOTTOM); // bark bands
  b.box(0.04, 0.24, 0.62, len / 2 - 0.02, 0.03, 0, PAL.logEnd, NO_BOTTOM);
  b.box(0.04, 0.24, 0.62, -len / 2 + 0.02, 0.03, 0, PAL.logEnd, NO_BOTTOM);
  b.box(0.3, 0.08, 0.1, -len / 4, 0.3, -0.12, PAL.logDark, NO_BOTTOM);   // a little stub
  return b.build();
});

export const cornGeo = () => cached('corn', () => {
  const b = new VoxelBuilder();
  b.box(0.2, 0.36, 0.2, 0, 0, 0, PAL.corn);
  for (let y = 0.04; y < 0.34; y += 0.08) for (const s of [-1, 1]) b.box(0.21, 0.03, 0.08, 0, y, s * 0.05, PAL.cornDark);
  b.box(0.06, 0.26, 0.22, -0.12, -0.02, 0, PAL.husk);
  b.box(0.06, 0.22, 0.22, 0.12, -0.02, 0, PAL.husk);
  b.box(0.08, 0.08, 0.08, 0, 0.36, 0, PAL.husk);
  return b.build();
});

/** Static scenery item into a builder at tile (x, z=0), varied by v in 0..1 */
export function addProp(b, kind, x, v, z = 0, tall = false) {
  const jitter = (v - 0.5) * 0.12;
  switch (kind) {
    case 'tree': {
      const h = tall ? 0.7 + v * 1.1 : [0.5, 0.72, 0.95][Math.floor(v * 3) % 3];
      const leaf = vary(PAL.leaf[Math.floor(v * 7) % PAL.leaf.length], v, 0.05);
      b.box(0.28, 0.3, 0.28, x, 0, z, PAL.trunk, NO_BOTTOM);
      b.box(0.8, h, 0.8, x + jitter * 0.3, 0.3, z, leaf);
      b.box(0.6, 0.1, 0.6, x + jitter * 0.3, 0.3 + h, z, vary(PAL.leafTop, v, 0.05), NO_BOTTOM);
      break;
    }
    case 'rock':
      b.box(0.72, 0.34, 0.62, x + jitter, 0, z, vary(PAL.rock, v), NO_BOTTOM);
      b.box(0.42, 0.16, 0.38, x + jitter - 0.06, 0.34, z - 0.04, PAL.rockTop, NO_BOTTOM);
      break;
    case 'bush':
      b.box(0.7, 0.36, 0.66, x, 0, z, vary(PAL.bush, v), NO_BOTTOM);
      b.box(0.46, 0.16, 0.44, x + jitter, 0.36, z, vary(PAL.leaf[1], v), NO_BOTTOM);
      break;
    case 'stump':
      b.box(0.48, 0.24, 0.48, x, 0, z, PAL.stump, NO_BOTTOM);
      b.box(0.38, 0.02, 0.38, x, 0.24, z, PAL.stumpTop, NO_BOTTOM);
      break;
    case 'flowers': {
      const c = PAL.flowers[Math.floor(v * 13) % PAL.flowers.length];
      for (let k = 0; k < 3; k++) {
        const fx = x + Math.sin(v * 50 + k * 2.1) * 0.3, fz = z + Math.cos(v * 37 + k * 1.7) * 0.3;
        b.box(0.03, 0.1, 0.03, fx, 0, fz, PAL.leaf[2], NO_BOTTOM);
        b.box(0.09, 0.07, 0.09, fx, 0.1, fz, c, NO_BOTTOM);
      }
      break;
    }
    case 'tuft':
      for (let k = 0; k < 3; k++) {
        const fx = x + Math.sin(v * 31 + k * 2.4) * 0.3, fz = z + Math.cos(v * 23 + k * 1.3) * 0.3;
        b.box(0.05, 0.12 + k * 0.03, 0.05, fx, 0, fz, PAL.leaf[k % 3], NO_BOTTOM);
      }
      break;
    default: break;
  }
}

export const signalGeo = () => cached('signal', () => {
  const b = new VoxelBuilder();
  b.box(0.08, 0.95, 0.08, 0, 0, 0, 0x9aa0a6, NO_BOTTOM);
  b.box(0.4, 0.22, 0.1, 0, 0.88, 0, PAL.trainDark);
  b.box(0.5, 0.06, 0.06, 0, 0.62, 0.0, 0xf1f1ea);   // crossbuck
  b.box(0.22, 0.04, 0.04, 0, 0, 0, 0x6e6e6e, NO_BOTTOM);
  return b.build();
});

export const lampGeo = () => cached('lamp', () => new VoxelBuilder().box(0.1, 0.1, 0.04, 0, 0, 0, 0xffffff).build());

export const locoGeo = () => cached('loco', () => {
  const b = new VoxelBuilder();
  const L = 3.3, W = 0.92;
  b.box(L, 0.2, W, 0, 0.05, 0, PAL.trainDark, NO_BOTTOM);
  b.box(L - 0.5, 0.86, W, -0.25, 0.25, 0, PAL.trainRed);
  b.box(0.5, 0.56, W - 0.1, L / 2 - 0.25, 0.25, 0, PAL.trainRed);           // nose
  b.box(0.06, 0.3, W - 0.2, L / 2 - 0.5, 0.75, 0, PAL.glass);               // front windows
  b.box(0.8, 0.26, W + 0.02, L / 2 - 1.0, 0.72, 0, PAL.glass);              // cab side windows
  b.box(L - 0.5, 0.1, W + 0.02, -0.25, 0.4, 0, PAL.trainCream);             // stripe
  b.box(0.06, 0.12, 0.2, L / 2, 0.36, 0.25, PAL.head);
  b.box(0.06, 0.12, 0.2, L / 2, 0.36, -0.25, PAL.head);
  b.box(0.3, 0.14, 0.3, -0.9, 1.11, 0, PAL.trainDark);                      // roof unit
  for (const x of [-1.2, -0.4, 0.5, 1.2]) for (const s of [-1, 1]) b.box(0.32, 0.26, 0.08, x, 0, s * (W / 2), PAL.tire, NO_BOTTOM);
  return b.build();
});

export const carriageGeo = (v) => cached('carriage' + v, () => {
  const b = new VoxelBuilder();
  const L = 3.2, W = 0.9;
  const body = v % 2 ? PAL.trainBlue : PAL.trainCream;
  b.box(L, 0.2, W, 0, 0.05, 0, PAL.trainDark, NO_BOTTOM);
  b.box(L, 0.86, W, 0, 0.25, 0, body);
  for (let x = -L / 2 + 0.45; x < L / 2 - 0.2; x += 0.55) b.box(0.34, 0.24, W + 0.02, x, 0.68, 0, PAL.glass);
  b.box(L, 0.08, W + 0.02, 0, 0.42, 0, v % 2 ? PAL.trainCream : PAL.trainRed);
  b.box(L - 0.2, 0.06, W - 0.2, 0, 1.11, 0, 0xd9d9d9);
  for (const x of [-1.1, -0.6, 0.6, 1.1]) for (const s of [-1, 1]) b.box(0.32, 0.26, 0.08, x, 0, s * (W / 2), PAL.tire, NO_BOTTOM);
  return b.build();
});

export const eagleParts = () => cached('eagle', () => {
  const body = new VoxelBuilder();
  body.box(0.56, 0.4, 0.95, 0, 0, 0, PAL.eagle);
  body.box(0.44, 0.38, 0.42, 0, 0.18, 0.55, PAL.eagleHead);
  body.box(0.16, 0.12, 0.22, 0, 0.24, 0.86, PAL.beakYellow);
  body.box(0.07, 0.07, 0.04, 0.16, 0.36, 0.72, 0x111111);
  body.box(0.07, 0.07, 0.04, -0.16, 0.36, 0.72, 0x111111);
  body.box(0.5, 0.12, 0.34, 0, 0.12, -0.62, PAL.eagleHead);  // tail
  body.box(0.1, 0.22, 0.1, 0.14, -0.2, 0.1, PAL.beakYellow); // talons
  body.box(0.1, 0.22, 0.1, -0.14, -0.2, 0.1, PAL.beakYellow);
  const wing = new VoxelBuilder();
  wing.box(1.1, 0.08, 0.6, 0.55, 0, 0, PAL.eagleDark);
  wing.box(0.4, 0.081, 0.36, 0.95, 0, -0.1, PAL.eagle);
  return { body: body.build(), wing: wing.build() };
});
