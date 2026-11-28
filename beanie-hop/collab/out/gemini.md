# Beanie Hop: round 1 review request for Gemini

You're joining a small team building **Beanie Hop**, an original voxel lane-hopping browser game for phones and desktop. The chicken's head is a real man's face from a photo.
Claude (Claude Code) is lead developer and integrates every change. ChatGPT (architecture, advanced reasoning, code review, debugging, gameplay improvements, creative direction) and Grok (gameplay mechanics, code optimisation, edge-case detection, independent technical review) are reviewing in parallel.
Your review will be compared with theirs, so be specific and disagree openly where you think someone (including Claude) is wrong.

**Your role:** Visual design, graphics, animation, performance optimisation, independent testing.

## How to work
If you can open a project folder and a terminal (for example in an IDE), please work from the real code:
```sh
git clone https://github.com/pixelgravity79/boom-2.git && cd boom-2
git checkout ccr-436599e2-f8j3sd && cd beanie-hop
npm install && node tests/sim.test.js --quick
```
Then write your findings into `beanie-hop/collab/feedback/gemini.md` (replace the template, keep the format below).
Commit that one file on a new branch named `collab/gemini` and push it.
Please **don't change any other file**: Claude reads your branch and makes the changes, so the team keeps one source of truth.

If you can't use git, reply in chat in the format below instead. The source files are included at the end of this message.

**Ground rules**
- Only say `ran-it: yes` if you actually executed the code or tests. Reading the code is fine; just say so.
- Point at exact files and lines. Propose concrete changes (values, code) rather than general advice.
- Rank by impact on how the game plays and looks on a phone.

## What we need from you this round
1. Face integration: look at assets/head_front.webp and src/render/chicken.js. Does the face read as part of the chicken's head rather than a picture stuck on it? Give specific changes (mask edge, shading, head proportions, beak/comb/wattle placement, emissive level).
2. Check tools/make_face.py's colour grade and crop. Is the man still clearly recognisable at about 40 CSS pixels wide on a phone? What would you change?
3. Palette and models (models.js, lanes.js): does the world look cohesive and readable at a glance (cars vs logs vs trains vs safe grass)? Name the exact PAL colours or model sizes you would change.
4. Animation: the hop, squash-and-stretch, wing flap, idle and death poses in chicken.js. What would make them feel better?
5. Mobile performance: draw calls, shadow cost, materials, the instanced particles, the edgeShade shader patch. What will hurt on a mid-range Android phone?

## Images
If you can see images, the user will attach these files from `beanie-hop/`: `assets/head_front.webp`, `assets/head_side_r.webp`, `assets/head_top.webp`, `assets/portrait.webp`.

## Reply format (please keep it exactly, it is read by a script)
```
reviewer: gemini
round: 1
ran-it: yes | no        (yes only if you actually executed the code or the tests)

### F1 <short title>
- severity: high | medium | low
- area: gameplay | visuals | animation | performance | mobile | code | creative
- file: src/sim/game.js:120      (or n/a)
- problem: what is wrong or weak, concretely
- fix: the exact change you propose (numbers, code, or steps)
- confidence: high | medium | low

### F2 ...

## Tests
(optional) new tests as fenced ```js blocks in the style of tests/sim.test.js
```

## Source files
#### `collab/STATUS.md`
```markdown
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
```

#### `tools/make_face.py`
```python
"""Turn the hero photo into the chicken's head textures for Beanie Hop.

    pip install mediapipe scipy pillow numpy
    python tools/make_face.py photo.jpg --models /path/to/models --out assets

Needs MediaPipe's face_landmarker.task and selfie_multiclass_256x256.tflite in --models:
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
    https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite

Pipeline
  1. face landmarks -> roll angle from the iris line; rotate so the eyes are level
  2. multiclass segmentation -> keep face skin + glasses + the beanie, drop background, neck and clothes
  3. colour grade (the source has a hazy sepia filter): per-channel levels, mild contrast and saturation
  4. composite onto a white "feather" texture with a soft shadow where feathers meet the face
Outputs (all used by src/render/chicken.js):
  head_front.webp  front of the head cube: beanie cuff + face, feathers elsewhere
  head_side_l.webp / head_side_r.webp / head_back.webp / head_top.webp  knit beanie over feathers
  portrait.webp    transparent cut-out for menus and the game-over card
  face_meta.json   where the chin / mouth sit in the front texture (for placing the beak)
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageOps, ImageFilter
from scipy import ndimage as ndi

FRONT_W, FRONT_H = 512, 624   # head front texture; aspect matches the head box (0.64 x 0.78)
SIDE = 256


def detect(im, models):
    import mediapipe as mp
    from mediapipe.tasks import python as mpp
    from mediapipe.tasks.python import vision
    arr = np.ascontiguousarray(np.asarray(im))
    W, H = im.size
    lm = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=mpp.BaseOptions(model_asset_path=os.path.join(models, 'face_landmarker.task')), num_faces=1))
    res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=arr))
    if not res.face_landmarks:
        raise SystemExit('no face found')
    pts = np.array([[p.x * W, p.y * H] for p in res.face_landmarks[0]])
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=mpp.BaseOptions(model_asset_path=os.path.join(models, 'selfie_multiclass.tflite')), output_confidence_masks=True))
    r2 = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=arr))
    C = np.stack([np.squeeze(m.numpy_view()).astype(np.float32) for m in r2.confidence_masks])
    return pts, C.argmax(0).astype(np.uint8)  # 0 bg, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 accessories


def largest(mask):
    lab, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def grade(rgb, ref_mask):
    """Undo the hazy filter: per-channel levels from the subject's own pixels, then gentle contrast/saturation."""
    f = rgb.astype(np.float32) / 255
    px = f[ref_mask]
    lo = np.percentile(px, 0.3, axis=0) * 0.85
    hi = np.percentile(px, 99.8, axis=0)
    f = np.clip((f - lo) / np.maximum(hi - lo, 1e-3), 0, 1)
    f = 0.82 * f + 0.18 * (f ** 0.8)                # lift shadows a little so glasses/eyes stay readable when small
    g = f.mean(-1, keepdims=True)
    f = np.clip(g + (f - g) * 0.96, 0, 1)           # the levels already warm it up; keep skin natural
    return f


def feathers(w, h, seed, cell=8):
    """White feather texture: cream base, blocky soft noise (voxel feel), faint feather scallops."""
    rng = np.random.default_rng(seed)
    base = np.array([0.965, 0.955, 0.93])
    n = rng.normal(0, 1, ((h + cell - 1) // cell, (w + cell - 1) // cell))
    n = np.kron(n, np.ones((cell, cell)))[:h, :w]
    yy, xx = np.mgrid[0:h, 0:w]
    scallop = 0.5 + 0.5 * np.sin((xx + (yy // (cell * 2)) % 2 * cell) / cell * np.pi)
    shade = 1 - 0.025 * n - 0.018 * scallop * ((yy % (cell * 2)) > cell * 1.4)
    return np.clip(base[None, None] * shade[..., None], 0, 1)


def knit(w, h, palette, seed, rows=None):
    """Heathered knit: vertical stitches of randomly mixed yarn colours (sampled from the photo's beanie)."""
    rng = np.random.default_rng(seed)
    st = 8  # stitch size in texels
    cols, rws = (w + st - 1) // st, (h + st - 1) // st
    k = len(palette)
    probs = np.array([0.22, 0.38, 0.40])[:k]; probs /= probs.sum()
    idx = rng.choice(k, size=(rws * 2, cols * 2), p=probs)
    img = np.array(palette)[idx]
    img = np.kron(img, np.ones((st // 2, st // 2, 1)))[:h, :w]
    yy, xx = np.mgrid[0:h, 0:w]
    # V-stitch shading: darker groove between stitch columns, lighter crown of each stitch
    gx = (xx % st) / st
    gy = ((yy + (np.abs(gx - 0.5) * st).astype(int)) % st) / st
    shade = 1 - 0.18 * (np.abs(gx - 0.5) > 0.42) - 0.10 * (gy > 0.8) + 0.05 * (gy < 0.3)
    img = img * shade[..., None]
    if rows:
        for (y0, y1, c) in rows:
            m = (yy >= y0) & (yy < y1)
            img[m] = np.array(c) * shade[m][:, None]
    return np.clip(img, 0, 1)


def to_img(f, alpha=None):
    a = (np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8)
    if alpha is not None:
        a = np.dstack([a, (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)])
    return Image.fromarray(a)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('photo')
    ap.add_argument('--models', required=True)
    ap.add_argument('--out', default='assets')
    ap.add_argument('--debug', default=None)
    o = ap.parse_args()
    os.makedirs(o.out, exist_ok=True)

    im = ImageOps.exif_transpose(Image.open(o.photo)).convert('RGB')
    pts, lab = detect(im, o.models)

    # 1. level the eyes
    eL, eR = pts[468], pts[473]
    ang = np.degrees(np.arctan2(eR[1] - eL[1], eR[0] - eL[0]))
    cx, cy = (eL + eR) / 2
    rot = im.rotate(ang, resample=Image.BICUBIC, center=(cx, cy))
    labr = np.asarray(Image.fromarray(lab).rotate(ang, resample=Image.NEAREST, center=(cx, cy)))
    a = np.deg2rad(ang); c, s = np.cos(a), np.sin(a)
    P = np.stack([(pts[:, 0] - cx) * c + (pts[:, 1] - cy) * s + cx, -(pts[:, 0] - cx) * s + (pts[:, 1] - cy) * c + cy], -1)
    eye_d = np.linalg.norm(eR - eL)

    # 2. masks
    face = largest(labr == 3)
    acc = labr == 5
    beanie = largest(acc | (labr == 1))
    fy0, fx0 = np.argwhere(face).min(0); fy1, fx1 = np.argwhere(face).max(0)
    glasses = acc & ~beanie
    gl_zone = np.zeros_like(glasses); gl_zone[fy0:fy1, fx0:fx1 + int(0.02 * eye_d)] = True
    glasses &= gl_zone                                      # keep the lenses, trim the arm poking past the cheek
    keep = face | beanie | glasses
    keep = ndi.binary_fill_holes(keep)
    keep = ndi.binary_opening(keep, iterations=6)
    keep = ndi.binary_closing(keep, iterations=10)
    keep = largest(keep)

    # 3. crop box: chin at the bottom, the beanie cuff at the top, centred on the visible head
    chin_y = P[152, 1]
    top_y = chin_y - eye_d * 3.55
    bottom_y = chin_y + eye_d * 0.42                # a strip of feathers under the chin for the beak
    hh = bottom_y - top_y
    ww = hh * FRONT_W / FRONT_H
    eyes_mid = (P[468, 0] + P[473, 0]) / 2
    mid_x = eyes_mid + 0.12 * eye_d                 # centre on the face, not the beanie (3/4 view)
    box = (int(mid_x - ww / 2), int(top_y), int(mid_x + ww / 2), int(bottom_y))

    graded = grade(np.asarray(rot), keep)
    crop = to_img(graded).crop(box).resize((FRONT_W, FRONT_H), Image.LANCZOS)
    m = Image.fromarray((keep * 255).astype(np.uint8)).crop(box).resize((FRONT_W, FRONT_H), Image.LANCZOS)
    m = np.asarray(m.filter(ImageFilter.GaussianBlur(1.6)), np.float32) / 255
    m = np.clip((m - 0.5) * 1.6 + 0.5, 0, 1)

    # 4. composite on feathers with a soft contact shadow around the face
    fe = feathers(FRONT_W, FRONT_H, 7)
    sh = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9)), np.float32) / 255
    fe = fe * (1 - 0.22 * sh[..., None])
    cf = np.asarray(crop, np.float32) / 255
    front = cf * m[..., None] + fe * (1 - m[..., None])
    to_img(front).save(os.path.join(o.out, 'head_front.webp'), quality=90, method=6)

    # beanie palette from the graded beanie pixels (3 yarn colours: dark, mid, light)
    bp = graded[ndi.binary_erosion(beanie, iterations=25) & (np.random.default_rng(0).random(beanie.shape) < 0.05)]
    lum = bp.mean(-1)
    q = np.percentile(lum, [25, 60, 90])
    pal = [bp[np.abs(lum - qi) < 0.05].mean(0).tolist() for qi in q]
    stripe_dark = (np.array(pal[0]) * 0.75).tolist()
    stripe_light = [0.92, 0.89, 0.83]

    # where the beanie meets the feathers along each edge of the front texture (fraction from top)
    def edge_frac(col):
        rows = np.where(m[:, col] > 0.5)[0]
        bean_rows = rows[rows < FRONT_H * 0.75]
        return float(bean_rows.max()) / FRONT_H if len(bean_rows) else 0.35
    fl = min(edge_frac(6), 0.62)
    fr = min(edge_frac(FRONT_W - 7), 0.62)

    def side(f_front, f_back, seed):
        fe2 = feathers(SIDE, SIDE, seed)
        kn = knit(SIDE, SIDE, pal, seed + 1)
        yy, xx = np.mgrid[0:SIDE, 0:SIDE] / SIDE
        line = f_front + (f_back - f_front) * xx
        wob = 0.012 * np.sin(xx * 40)
        mm = (yy < line + wob).astype(np.float32)
        mm = np.asarray(Image.fromarray((mm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
        rim = np.clip(1 - np.abs(yy - line) * 45, 0, 1) * 0.18          # folded cuff edge shadow
        out = kn * mm[..., None] + fe2 * (1 - mm[..., None])
        return out * (1 - rim[..., None])

    # side textures are mapped so u runs back->front on the left face and front->back on the right face
    to_img(side(fl, 0.42, 11)[:, ::-1]).save(os.path.join(o.out, 'head_side_l.webp'), quality=88)
    to_img(side(fr, 0.42, 13)).save(os.path.join(o.out, 'head_side_r.webp'), quality=88)
    to_img(side(0.42, 0.42, 17)).save(os.path.join(o.out, 'head_back.webp'), quality=88)
    top = knit(SIDE, SIDE, pal, 19, rows=[(0, 40, stripe_dark), (40, 56, stripe_light), (200, 216, stripe_light), (216, 256, stripe_dark)])
    to_img(top).save(os.path.join(o.out, 'head_top.webp'), quality=88)

    # portrait cut-out for the UI
    pb = (box[0] - int(ww * 0.06), box[1] - int(hh * 0.18), box[2] + int(ww * 0.06), box[3] + int(hh * 0.02))
    pc = to_img(graded).crop(pb)
    pm = Image.fromarray((keep * 255).astype(np.uint8)).crop(pb).filter(ImageFilter.GaussianBlur(3))
    pc.putalpha(pm)
    pc.thumbnail((320, 320), Image.LANCZOS)
    pc.save(os.path.join(o.out, 'portrait.webp'), quality=90, method=6)

    def uv(p):
        return [round((p[0] - box[0]) / (box[2] - box[0]), 4), round((p[1] - box[1]) / (box[3] - box[1]), 4)]
    meta = {'chin': uv(P[152]), 'mouth': uv((P[13] + P[14]) / 2), 'nose': uv(P[1]), 'eyeL': uv(P[468]),
            'eyeR': uv(P[473]), 'beanieEdgeLeft': fl, 'beanieEdgeRight': fr,
            'palette': [[round(v, 3) for v in col] for col in pal], 'stripeDark': [round(v, 3) for v in stripe_dark]}
    with open(os.path.join(o.out, 'face_meta.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    print(json.dumps(meta))
    if o.debug:
        to_img(graded).crop(box).resize((FRONT_W, FRONT_H)).save(os.path.join(o.debug, 'graded_crop.png'))


if __name__ == '__main__':
    main()
```

#### `src/render/voxel.js`
```js
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
```

#### `src/render/models.js`
```js
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
  cars: [0xe8475f, 0xffb52e, 0x3fa7d6, 0x7ac74f, 0xf2856d, 0x9f6ad4],
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
```

#### `src/render/chicken.js`
```js
// The hero: a voxel chicken whose head is the man from the photo, beanie and all.
// The face is the front of the head cube (generated by tools/make_face.py), the knit beanie wraps the
// top and sides, and the comb, beak and wattle are real geometry attached to that head.
import * as THREE from 'three';
import { PAL } from './models.js';

const HEAD_W = 0.64, HEAD_H = 0.78, HEAD_D = 0.56;
const BODY_W = 0.5, BODY_H = 0.4, BODY_D = 0.54;
const LEG_H = 0.15;
const YAW = { f: 0, b: Math.PI, l: -Math.PI / 2, r: Math.PI / 2 };

const lambert = (opts) => new THREE.MeshLambertMaterial(opts);
const boxMesh = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  return m;
};
const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Chicken {
  /** tex: { front, sideL, sideR, back, top } THREE.Textures; meta: face_meta.json */
  constructor(tex, meta) {
    this.root = new THREE.Group();       // world position + facing
    this.pose = new THREE.Group();       // squash & stretch, death poses
    this.root.add(this.pose);

    const white = lambert({ color: PAL.white });
    const orange = lambert({ color: PAL.orange });
    const red = lambert({ color: PAL.red });
    this.mats = { white, orange, red };

    // legs + feet
    this.legs = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 0.12, LEG_H, 0.02);
      leg.add(boxMesh(0.06, LEG_H, 0.06, orange, 0, -LEG_H, 0));
      leg.add(boxMesh(0.12, 0.035, 0.17, orange, 0, -LEG_H, 0.04));
      this.pose.add(leg);
      this.legs.push(leg);
    }
    // body, tail, wings
    this.body = boxMesh(BODY_W, BODY_H, BODY_D, white, 0, LEG_H, -0.04);
    this.pose.add(this.body);
    const tail = boxMesh(0.3, 0.2, 0.12, white, 0, LEG_H + 0.24, -0.34);
    tail.rotation.x = -0.35;
    this.pose.add(tail);
    this.pose.add(boxMesh(0.18, 0.1, 0.08, white, 0, LEG_H + 0.42, -0.36));
    this.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * (BODY_W / 2), LEG_H + BODY_H - 0.06, -0.06);
      const w = boxMesh(0.07, 0.26, 0.34, white, s * 0.035, -0.26, 0);
      pivot.add(w);
      this.pose.add(pivot);
      this.wings.push({ pivot, s });
    }

    // head: the face lives on the +z face of this box
    this.head = new THREE.Group();
    this.head.position.set(0, LEG_H + BODY_H - 0.05, 0.02);
    for (const t of Object.values(tex)) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
    const faceMat = lambert({ map: tex.front, emissive: 0xffffff, emissiveMap: tex.front, emissiveIntensity: 0.32 });
    const knit = (map) => lambert({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.08 });
    const headMats = [knit(tex.sideR), knit(tex.sideL), knit(tex.top), white, faceMat, knit(tex.back)];
    const headBox = new THREE.Mesh(new THREE.BoxGeometry(HEAD_W, HEAD_H, HEAD_D), headMats);
    headBox.position.y = HEAD_H / 2;
    headBox.castShadow = true;
    this.head.add(headBox);
    this.faceMat = faceMat;

    // comb poking out of the top of the beanie
    const combX = 0.02;
    this.head.add(boxMesh(0.09, 0.1, 0.12, red, combX, HEAD_H, 0.1));
    this.head.add(boxMesh(0.09, 0.15, 0.12, red, combX, HEAD_H, -0.02));
    this.head.add(boxMesh(0.09, 0.09, 0.12, red, combX, HEAD_H, -0.14));
    // beak + wattle under the chin, lined up with the face in the photo
    const chinX = ((meta && meta.chin ? meta.chin[0] : 0.55) - 0.5) * HEAD_W;
    const chinY = HEAD_H * (1 - (meta && meta.chin ? meta.chin[1] : 0.9));
    this.beak = boxMesh(0.15, 0.09, 0.14, orange, chinX, Math.max(0.005, chinY - 0.085), HEAD_D / 2 + 0.06);
    this.head.add(this.beak);
    this.head.add(boxMesh(0.1, 0.03, 0.1, lambert({ color: 0xd9861a }), chinX, Math.max(0.005, chinY - 0.085) - 0.005, HEAD_D / 2 + 0.07));
    this.head.add(boxMesh(0.08, 0.12, 0.05, red, chinX, chinY - 0.2, HEAD_D / 2 + 0.03));
    this.pose.add(this.head);

    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });

    this.yaw = 0;
    this.headYaw = 0;
    this.sq = { v: 1, vel: 0, target: 1 };   // squash spring on Y
    this.lastHopT = -9;
    this.deathT = -1;
    this.flight = null;
  }

  reset() {
    this.yaw = 0; this.headYaw = 0;
    this.sq.v = 1; this.sq.vel = 0; this.sq.target = 1;
    this.deathT = -1; this.flight = null;
    this.root.visible = true;
    this.root.rotation.set(0, 0, 0);
    this.pose.rotation.set(0, 0, 0);
    this.pose.scale.set(1, 1, 1);
    this.pose.position.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
  }

  press() { this.sq.target = 0.82; }
  release() { this.sq.target = 1; }
  kick(v) { this.sq.vel += v; }

  /**
   * view: { x, y, z, hopK (0..1 or 1 when grounded), hopping, face, idleFor, bumpK, now, dt, title }
   */
  update(view) {
    const { dt } = view;
    // squash spring
    const s = this.sq;
    s.vel += (-(s.v - s.target) * 380 - s.vel * 18) * dt;
    s.v += s.vel * dt;

    this.root.position.set(view.x, view.y, view.z);

    // facing: turn toward the move; after a moment of standing still, turn back to look at the player
    let target = YAW[view.face] ?? 0;
    if (!view.hopping && view.idleFor > 0.55) target = 0;
    const turnRate = view.hopping ? 26 : 9;
    this.yaw += angleDiff(this.yaw, target) * Math.min(1, turnRate * dt);
    this.root.rotation.y = this.yaw;

    // the head leads the body when looking back at the camera
    const headTarget = !view.hopping && view.idleFor > 0.3 ? angleDiff(this.yaw, 0) : 0;
    this.headYaw += (headTarget - this.headYaw) * Math.min(1, 14 * dt);
    this.head.rotation.y = this.headYaw;

    // squash & stretch + hop pose
    const sy = s.v * (view.hopping ? 1 + Math.sin(view.hopK * Math.PI) * 0.12 : 1);
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    this.pose.scale.set(sxz, sy, sxz);
    const flap = view.hopping ? Math.sin(view.hopK * Math.PI) : 0;
    for (const w of this.wings) w.pivot.rotation.z = w.s * (0.1 + flap * 1.1 + (view.title ? Math.max(0, Math.sin(view.now * 9)) * 0.15 * (Math.sin(view.now * 0.7) > 0.6 ? 1 : 0) : 0));
    for (let i = 0; i < 2; i++) this.legs[i].rotation.x = view.hopping ? (i ? 1 : -1) * Math.sin(view.hopK * Math.PI) * 0.4 : 0;
    // idle life: breathing, a little head bob and the odd curious tilt
    const idle = view.hopping ? 0 : 1;
    this.head.position.y = LEG_H + BODY_H - 0.05 + idle * Math.sin(view.now * 2.4) * 0.008;
    this.head.rotation.z = idle * Math.sin(view.now * 0.9) * 0.05 * (Math.sin(view.now * 0.31) > 0.4 ? 1 : 0.2);
    this.head.rotation.x = view.hopping ? -0.08 * flap : -0.04;
    // bump: lean into the obstacle and pop back
    this.pose.rotation.x = view.bumpK > 0 ? Math.sin(view.bumpK * Math.PI) * 0.25 : 0;
    this.pose.position.y = view.bumpK > 0 ? Math.sin(view.bumpK * Math.PI) * 0.12 : 0;
  }

  /** Death poses. kind: car | train | splash | swept | eagle; k = seconds since death */
  updateDeath(death, k, dt, baseY) {
    const p = this.pose;
    this.head.rotation.set(0, 0, 0);
    if (death.kind === 'car') {
      // pancake, face up, so you can still see who it was
      this.root.rotation.y = 0;
      const e = Math.min(1, k / 0.08);
      p.rotation.x = -Math.PI / 2 * e;
      p.scale.set(1.25, 1.25, 1 - 0.86 * e);
      p.position.set(0, 0.03, 0.04 * e);
      this.root.position.y = baseY;
    } else if (death.kind === 'train') {
      if (!this.flight) this.flight = { vx: death.dir * 16, vy: 7, vz: -1.5, spin: 14 };
      const f = this.flight;
      f.vy -= 22 * dt;
      this.root.position.x += f.vx * dt;
      this.root.position.y += f.vy * dt;
      this.root.position.z += f.vz * dt;
      p.rotation.z += f.spin * dt * -death.dir;
      p.rotation.x += f.spin * 0.6 * dt;
      if (k > 2) this.root.visible = false;
    } else if (death.kind === 'splash' || death.kind === 'swept') {
      const e = Math.min(1, k / 0.6);
      this.root.position.y = baseY - 0.15 - e * e * 1.0;
      p.rotation.z = Math.sin(k * 18) * 0.25 * (1 - e);
      p.rotation.x = -0.4 * e;
      if (k > 0.9) this.root.visible = false;
    } else if (death.kind === 'eagle') {
      p.rotation.z = Math.sin(k * 20) * 0.3;   // wriggling in the talons; the eagle moves the root
    }
  }
}
```

#### `src/render/lanes.js`
```js
// One LaneView per visible row: a single merged mesh for ground + scenery, plus meshes for whatever moves.
import * as THREE from 'three';
import * as C from '../sim/config.js';
import { moverX, trainState } from '../sim/world.js';
import { VoxelBuilder, NO_BOTTOM, vary } from './voxel.js';
import { PAL, addProp, vehicleGeo, logGeo, cornGeo, signalGeo, lampGeo, locoGeo, carriageGeo } from './models.js';

export const GROUND_HALF = 36;   // ground strips extend this far to the sides
export const TOP = { grass: 0, road: -0.06, rail: -0.04, river: -0.3 };
export const LOG_TOP = -0.1, PAD_TOP = -0.25;

/** Height the chicken stands at on this lane. */
export function standY(lane, onLog, onPad) {
  if (lane.type === 'river') return onLog ? LOG_TOP : onPad ? PAD_TOP : TOP.river;
  return TOP[lane.type];
}

function buildStatic(lane, prev, next) {
  const ground = new VoxelBuilder(), props = new VoxelBuilder();
  const W = GROUND_HALF * 2, odd = lane.row & 1;
  const base = -0.9;
  if (lane.type === 'grass') {
    ground.box(W, 0.78, 1, 0, base, 0, PAL.dirt, NO_BOTTOM);
    ground.box(W, 0.12, 1, 0, -0.12, 0, odd ? PAL.grassA : PAL.grassB, NO_BOTTOM);
    for (const o of lane.decor) addProp(props, o.kind, o.x, o.v, 0, Math.abs(o.x) > C.COL_MAX + 1);
    if (lane.row < C.BACK_LIMIT) ground.box(W, 0.02, 1, 0, 0, 0, PAL.grassEdge, NO_BOTTOM);
  } else if (lane.type === 'road') {
    ground.box(W, 0.84, 1, 0, base, 0, PAL.road, NO_BOTTOM);
    if (next && next.type === 'road') {
      for (let x = -GROUND_HALF + 0.5; x < GROUND_HALF; x += 1.7) ground.box(0.75, 0.012, 0.07, x, TOP.road, 0.5, PAL.line, NO_BOTTOM);
    }
    if (!prev || prev.type !== 'road') ground.box(W, 0.012, 0.05, 0, TOP.road, -0.47, PAL.roadEdge, NO_BOTTOM);
    if (!next || next.type !== 'road') ground.box(W, 0.012, 0.05, 0, TOP.road, 0.47, PAL.roadEdge, NO_BOTTOM);
  } else if (lane.type === 'rail') {
    ground.box(W, 0.86, 1, 0, base, 0, PAL.gravel, NO_BOTTOM);
    for (let x = -GROUND_HALF + 0.3; x < GROUND_HALF; x += 0.6) props.box(0.2, 0.04, 0.84, x, TOP.rail, 0, PAL.sleeper, NO_BOTTOM);
    for (const z of [-0.24, 0.24]) props.box(W, 0.07, 0.07, 0, TOP.rail + 0.02, z, PAL.rail, NO_BOTTOM);
  } else { // river: bed below, water surface is its own animated mesh
    ground.box(W, 0.3, 1, 0, base, 0, PAL.waterDeep, NO_BOTTOM);
    if (lane.pads) {
      for (const x of lane.pads) {
        const v = ((x * 7919 + lane.row * 104729) % 1000) / 1000;
        props.box(0.8, 0.05, 0.8, x, PAD_TOP - 0.05, 0, vary(PAL.pad, v, 0.08), NO_BOTTOM);
        props.box(0.22, 0.052, 0.12, x + 0.22, PAD_TOP - 0.05, 0.25, PAL.padDark, NO_BOTTOM);
        if (v > 0.7) props.box(0.12, 0.08, 0.12, x - 0.2, PAD_TOP, -0.15, 0xff8fb1, NO_BOTTOM);
      }
    }
  }
  return { ground: ground.build(), props: props.empty ? null : props.build() };
}

export class LaneView {
  constructor(lane, prev, next, mats) {
    this.lane = lane;
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.position.z = lane.row;
    const { ground, props } = buildStatic(lane, prev, next);
    this.geos = [ground];
    const g = new THREE.Mesh(ground, mats.world);
    g.receiveShadow = true;
    this.group.add(g);
    if (props) {
      this.geos.push(props);
      const pm = new THREE.Mesh(props, mats.world);
      pm.castShadow = true; pm.receiveShadow = true;
      this.group.add(pm);
    }
    if (lane.type === 'river') {
      const water = new THREE.Mesh(mats.waterGeo, mats.water[lane.speed ? lane.dir : 0]);
      water.position.y = TOP.river;
      water.receiveShadow = true;
      this.group.add(water);
    }
    // movers
    this.movers = lane.movers.map((m) => {
      const mesh = new THREE.Mesh(m.kind === 'log' ? logGeo(m.len) : vehicleGeo(m), mats.world);
      mesh.castShadow = true;
      mesh.receiveShadow = m.kind === 'log';
      mesh.position.y = m.kind === 'log' ? LOG_TOP - 0.3 : TOP.road;
      if (lane.dir < 0) mesh.rotation.y = Math.PI;
      this.group.add(mesh);
      return { m, mesh, sink: 0, sinkV: 0 };
    });
    // trains + crossing signals
    if (lane.type === 'rail') {
      this.train = new THREE.Group();
      const loco = new THREE.Mesh(locoGeo(), mats.world);
      loco.position.x = -1.65;
      loco.castShadow = true;
      this.train.add(loco);
      for (let i = 0; i < lane.train.cars; i++) {
        const c = new THREE.Mesh(carriageGeo(i + lane.row), mats.world);
        c.position.x = -(3.4 + 1.6 + i * 3.3);
        c.castShadow = true;
        this.train.add(c);
      }
      if (lane.dir < 0) this.train.rotation.y = Math.PI;
      this.train.position.y = TOP.rail;
      this.train.visible = false;
      this.group.add(this.train);
      this.lamps = [];
      for (const sx of [C.COL_MAX + 0.95, C.COL_MIN - 0.95]) {
        const s = new THREE.Mesh(signalGeo(), mats.world);
        s.position.set(sx, TOP.rail, -0.42);
        s.castShadow = true;
        this.group.add(s);
        for (const lx of [-0.1, 0.1]) {
          const lamp = new THREE.Mesh(lampGeo(), mats.lampOff);
          lamp.position.set(sx + lx, TOP.rail + 0.95, -0.36);
          this.group.add(lamp);
          this.lamps.push(lamp);
        }
      }
      this.warn = false;
    }
    // corn
    this.coins = lane.coins.map((x) => {
      const mesh = new THREE.Mesh(cornGeo(), mats.world);
      mesh.castShadow = true;
      mesh.position.set(x, standY(lane, false, false) + 0.12, 0);
      this.group.add(mesh);
      return { x, mesh, key: lane.row + ':' + x };
    });
  }

  update(t, game, viewHalf, dt) {
    const lane = this.lane;
    for (let i = 0; i < this.movers.length; i++) {
      const mv = this.movers[i];
      const x = moverX(lane, mv.m, t);
      mv.mesh.position.x = x;
      mv.mesh.visible = Math.abs(x) < viewHalf + mv.m.len;
      if (mv.m.kind === 'log') {
        const ridden = game.p.log && game.p.r === lane.row && game.p.log.i === i && game.state === 'playing';
        if (ridden && !mv.rider) mv.sinkV -= 0.9;        // dips when you land on it
        mv.rider = ridden;
        mv.sinkV += (-mv.sink * 140 - mv.sinkV * 9) * dt;
        mv.sink += mv.sinkV * dt;
        mv.mesh.position.y = LOG_TOP - 0.3 + mv.sink * 0.06 + Math.sin(t * 2 + i * 1.7 + lane.row) * 0.012;
      }
    }
    if (this.train) {
      const s = trainState(lane, t);
      this.train.visible = s.active;
      if (s.active) this.train.position.x = s.head;
      this.warn = s.warn;
      const blink = s.warn && Math.floor(t * 6) % 2 === 0;
      for (let i = 0; i < this.lamps.length; i++) {
        this.lamps[i].material = s.warn && (i % 2 === 0) === blink ? this.mats.lampOn : this.mats.lampOff;
      }
    }
    for (const c of this.coins) {
      const got = game.collected.has(c.key);
      if (got && c.mesh.visible) c.mesh.visible = false;
      if (!got) {
        c.mesh.rotation.y = t * 2.4 + c.x;
        c.mesh.position.y = standY(lane, false, false) + 0.14 + Math.sin(t * 3 + c.x) * 0.05;
      }
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
  }
}
```

#### `src/render/particles.js`
```js
// Pooled voxel particles in a single InstancedMesh: dust puffs, feathers, splashes, sparkles.
import * as THREE from 'three';

const MAX = 320;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export class Particles {
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < MAX; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
    this.list = [];
    this.free = [];
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.color = new THREE.Color();
    this.scale = 1;   // lowered on weak devices
  }

  spawn(x, y, z, o) {
    const n = Math.max(1, Math.round((o.n || 1) * this.scale));
    for (let k = 0; k < n; k++) {
      if (!this.free.length) return;
      const i = this.free.pop();
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed || 1) * (0.5 + Math.random() * 0.7);
      const up = (o.up || 0) * (0.6 + Math.random() * 0.6);
      const part = {
        i, x: x + (Math.random() - 0.5) * (o.spread || 0), y, z: z + (Math.random() - 0.5) * (o.spread || 0),
        vx: Math.cos(a) * sp + (o.vx || 0), vy: up, vz: Math.sin(a) * sp * (o.flatZ ? 0.4 : 1) + (o.vz || 0),
        g: o.gravity ?? 9, drag: o.drag ?? 1.5, life: 0, max: (o.life || 0.6) * (0.7 + Math.random() * 0.6),
        size: (o.size || 0.08) * (0.7 + Math.random() * 0.6), rx: Math.random() * 6, ry: Math.random() * 6,
        spin: (o.spin || 0) * (Math.random() - 0.5), floor: o.floor ?? -10, flutter: o.flutter || 0,
      };
      const cs = o.colors || [0xffffff];
      this.mesh.setColorAt(i, this.color.set(cs[Math.floor(Math.random() * cs.length)]));
      this.list.push(part);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const P = this.list[k];
      P.life += dt;
      if (P.life >= P.max) {
        this.mesh.setMatrixAt(P.i, zero);
        this.free.push(P.i);
        this.list.splice(k, 1);
        continue;
      }
      const d = Math.exp(-P.drag * dt);
      P.vx *= d; P.vz *= d;
      P.vy -= P.g * dt;
      if (P.flutter) { P.vy = Math.max(P.vy, -P.flutter); P.vx += Math.sin(P.life * 9 + P.rx) * 2 * dt; }
      P.x += P.vx * dt; P.y += P.vy * dt; P.z += P.vz * dt;
      if (P.y < P.floor) { P.y = P.floor; P.vy *= -0.3; P.vx *= 0.6; P.vz *= 0.6; }
      P.rx += P.spin * dt; P.ry += P.spin * 0.7 * dt;
      const k01 = P.life / P.max;
      const sc = P.size * (k01 < 0.15 ? k01 / 0.15 : 1 - Math.pow((k01 - 0.15) / 0.85, 2));
      m4.compose(p.set(P.x, P.y, P.z), q.setFromEuler(e.set(P.rx, P.ry, 0)), s.set(sc, sc, sc));
      this.mesh.setMatrixAt(P.i, m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const P of this.list) { this.mesh.setMatrixAt(P.i, zero); this.free.push(P.i); }
    this.list.length = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
```

