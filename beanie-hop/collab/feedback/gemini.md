<!-- Gemini via API: model gemini-3.5-flash, effort high, 2026-11-28T02:53:49.203Z, 21538 tokens in / 2171 out, est. cost $0.0000 -->
reviewer: gemini
round: 1
ran-it: no

### F1 Beak and facial feature misalignment on 3D head
- severity: high
- area: visuals
- file: src/render/chicken.js:65-68
- problem: `chicken.js` calculates `chinX` and `chinY` using `meta.chin`, then positions the beak at `chinY - 0.085`. `meta.chin` is the chin location from MediaPipe! Placing the 3D beak at `chinY - 0.085` attaches it to the man's lower jaw/neck instead of his mouth. `face_meta.json` provides `meta.mouth` and `meta.nose`, but `chicken.js` completely ignores them.
- fix: Align the 3D beak geometry to `meta.mouth` instead of `meta.chin`:
```javascript
const mouthX = ((meta && meta.mouth ? meta.mouth[0] : 0.5) - 0.5) * HEAD_W;
const mouthY = HEAD_H * (1 - (meta && meta.mouth ? meta.mouth[1] : 0.65));
this.beak = boxMesh(0.15, 0.09, 0.14, orange, mouthX, mouthY, HEAD_D / 2 + 0.06);
```
- confidence: high

### F2 Face texture glows in dark shadows like a sticker (emissive mismatch)
- severity: high
- area: visuals
- file: src/render/chicken.js:53
- problem: `faceMat` is configured with `emissiveIntensity: 0.32` and `emissive: 0xffffff`, whereas the knit beanie uses `0.08` and the 3D comb, beak, and body use standard unlit Lambert materials (`0.0`). When the chicken enters shadow, the face stays bright white while attached 3D features turn dark. This makes the face look like a floating digital sticker rather than part of the 3D head.
- fix: Match `faceMat` emissive intensity to the beanie and ambient lighting:
```javascript
const faceMat = lambert({ map: tex.front, emissive: 0xffffff, emissiveMap: tex.front, emissiveIntensity: 0.06 });
```
- confidence: high

### F3 Car death pancake rotation sinks face below ground
- severity: high
- area: animation
- file: src/render/chicken.js:135-141
- problem: In `updateDeath`, car flattening rotates the `pose` group by `rotation.x = -Math.PI / 2`. Because the head is offset at `Y = +0.53, Z = +0.02` relative to the group origin, rotating -90 degrees swings the head to `Y = -0.02, Z = +0.53`. The position adjustment `p.position.set(0, 0.03, 0.04 * e)` is far too small, causing the chicken's face to clip under the road geometry into the asphalt.
- fix: Adjust the squished `p.position` offset to keep the head above ground level:
```javascript
p.position.set(0, 0.28 * e, 0.35 * e);
```
- confidence: high

### F4 Excessive shadow map draw calls on mobile devices
- severity: high
- area: performance
- file: src/render/chicken.js:79
- problem: `this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; ... } })` enables shadow casting on all ~15 sub-meshes of the hero chicken (comb blocks, beak, wattle, 2 legs, 2 feet, 2 wings, body, tail blocks). Combined with shadow casting on every prop in `lanes.js`, this doubles scene draw calls during the shadow pass, causing severe frame drops on mid-range Android GPUs (Adreno 610/618).
- fix: Disable `castShadow` on minor sub-meshes and cast shadows only from the main structural volumes (`headBox` and `body`). In `lanes.js`, set `castShadow = false` on small props (`flowers`, `tuft`, `lamp`, `signal`).
- confidence: high

### F5 Asymmetric crop offset skews face texture on symmetrical 3D head box
- severity: medium
- area: visuals
- file: tools/make_face.py:130
- problem: `mid_x = eyes_mid + 0.12 * eye_d` shifts the face crop horizontally to compensate for a 3/4 view photo. When mapped onto the symmetrical 0.64 wide 3D head box in `chicken.js`, the face texture is visibly off-center to the right relative to the centered comb and beak geometry.
- fix: Center the crop box directly on the eye midpoint in `tools/make_face.py`:
```python
mid_x = eyes_mid  # center crop on eye midpoint
```
- confidence: high

### F6 Railway crossing signal lamps are cropped off-screen on phones
- severity: high
- area: gameplay
- file: src/render/lanes.js:105
- problem: Signal posts are placed at `sx = COL_MAX + 0.95` (+4.95) and `COL_MIN - 0.95` (-4.95). On tall mobile screens (19.5:9 aspect ratio in orthographic view), columns outside +/-4.2 are cropped off the sides of the viewport. Players cannot see the warning lights blink before a fast train strikes.
- fix: Move signal locations inward so they remain clearly visible within the phone viewport:
```javascript
for (const sx of [C.COL_MAX - 0.2, C.COL_MIN + 0.2]) { // +/- 3.8
```
- confidence: high

### F7 Poor color contrast: green cars blend with grass & logs match tree trunks
- severity: medium
- area: visuals
- file: src/render/models.js:18
- problem: `PAL.cars[3] = 0x7ac74f` (green car) is almost identical in hue and brightness to `PAL.grassEdge` (`0x6fae4c`) and `PAL.grassA` (`0x95d86a`), making green cars blend into the background near road edges. Additionally, floating logs (`PAL.log = 0x8b5a3a`) share almost the exact brown hue as tree trunks (`PAL.trunk = 0x7b5434`).
- fix: Change `PAL.cars[3]` to bright cyan (`0x1dd1a1`) or purple (`0x9b59b6`). Shift `PAL.log` to a warmer cedar brown (`0x9c5932`) with lighter end caps (`PAL.logEnd = 0xe6c280`) to pop against blue water.
- confidence: high

### F8 Face mask edge feathering creates dirty halo at 40px phone scale
- severity: medium
- area: visuals
- file: tools/make_face.py:135-141
- problem: `make_face.py` applies `GaussianBlur(1.6)` followed by aggressive contrast clamping `(m - 0.5) * 1.6 + 0.5`, creating hard pixelated mask steps. The contact shadow uses a wide `GaussianBlur(9)` at 0.22 opacity. When downscaled to ~40 CSS px on phones, this wide shadow forms a muddy dark border around the face cutout.
- fix: Smooth the mask gradient and tighten the shadow radius in `tools/make_face.py`:
```python
m = np.asarray(m.filter(ImageFilter.GaussianBlur(2.2)), np.float32) / 255
# remove the np.clip contrast threshold line
sh = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3.5)), np.float32) / 255
fe = fe * (1 - 0.12 * sh[..., None])
```
- confidence: high

### F9 Rigid hop animation missing forward pitch anticipation
- severity: medium
- area: animation
- file: src/render/chicken.js:118-128
- problem: During a hop, `pose.rotation.x` stays completely flat (0 radians) unless bumping into an obstacle. The chicken jumps vertically without leaning forward into the hop direction, making the motion feel stiff and unnatural.
- fix: Pitch the body forward during the hop airborne arc:
```javascript
if (view.hopping) {
  this.pose.rotation.x = Math.sin(view.hopK * Math.PI) * -0.16;
}
```
- confidence: high

### F10 Unmerged static lane meshes double static scenery draw calls
- severity: medium
- area: performance
- file: src/render/lanes.js:39-49
- problem: `buildStatic()` creates two separate `THREE.Mesh` objects per lane (`ground` and `props`). Over 25 visible rows, this adds 50 static draw calls every frame.
- fix: Merge static scenery props directly into the `ground` `VoxelBuilder` inside `buildStatic()` so each lane requires only 1 merged static mesh.
- confidence: high
