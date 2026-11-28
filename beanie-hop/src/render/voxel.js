// Minimal voxel geometry builder: appends axis-aligned boxes with per-vertex colours straight into
// typed arrays, so a whole lane of scenery becomes one draw call.
import * as THREE from 'three';

// corners of each face, counter-clockwise seen from outside; order +x -x +y -y +z -z
const FACES = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], shade: 0.93 },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], shade: 0.93 },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], shade: 1 },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], shade: 0.7 },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], shade: 0.97 },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], shade: 0.88 },
];
export const NO_BOTTOM = 1 << 3;
export const ONLY_TOP = ~(1 << 2) & 63;

const tmp = new THREE.Color();
export const col = (hex) => new THREE.Color(hex);

export class VoxelBuilder {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.i = [];
    this.count = 0;
  }

  /** Box of size w,h,d whose bottom-centre sits at (x,y,z). `skip` is a bitmask of faces to leave out. */
  box(w, h, d, x, y, z, color, skip = 0) {
    const c = color.isColor ? color : tmp.set(color);
    const hx = w / 2, hy = h / 2, hz = d / 2, cy = y + hy;
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const F = FACES[f], base = this.count;
      for (const k of F.c) {
        this.p.push(x + k[0] * hx, cy + k[1] * hy, z + k[2] * hz);
        this.n.push(F.n[0], F.n[1], F.n[2]);
        this.c.push(c.r * F.shade, c.g * F.shade, c.b * F.shade);
      }
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.count += 4;
    }
    return this;
  }

  get empty() { return this.count === 0; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Slightly vary a colour (deterministic from v in 0..1) so repeated props don't look stamped. */
export function vary(hex, v, amount = 0.06) {
  const c = new THREE.Color(hex);
  const k = 1 + (v - 0.5) * 2 * amount;
  return c.multiplyScalar(k);
}

/**
 * Patch a material so everything outside the playable strip (|x| > edge) is shaded darker,
 * the way the edges of the board fade in this genre. Works with instancing.
 */
export function edgeShade(material, edge = 4.5, strength = 0.38) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEdge = { value: edge };
    shader.uniforms.uEdgeStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vEdgeX;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vec4 edgeWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    edgeWp = instanceMatrix * edgeWp;
  #endif
  edgeWp = modelMatrix * edgeWp;
  vEdgeX = edgeWp.x;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEdgeX;\nuniform float uEdge;\nuniform float uEdgeStrength;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  gl_FragColor.rgb *= 1.0 - uEdgeStrength * smoothstep(uEdge - 0.04, uEdge + 0.12, abs(vEdgeX));`);
  };
  material.customProgramCacheKey = () => 'edge' + edge + '_' + strength;
  return material;
}
