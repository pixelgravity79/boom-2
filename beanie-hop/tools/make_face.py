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
