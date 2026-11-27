"""Turn a photo into a Flappy Fellas character sprite (head + hair, background removed, die-cut sticker outline).

    pip install "rembg[cpu]" mediapipe opencv-python-headless scipy pillow
    python tools/make_character.py photo.jpg assets/char6.webp
    python tools/make_character.py photo.jpg assets/char6.webp --cut 0.85 --rx 1.4      # tighter hair crop
    python tools/make_character.py assets-src/char1.png assets/char5.webp --gold          # golden variant of a sprite
    python tools/make_character.py cap.jpg assets/char7.webp --hat                         # keep a hat or cap

Pipeline: BiRefNet-portrait matting (fine hair edges) x MediaPipe multiclass segmentation (hair / face / glasses
vs clothes) -> keep head, hair, glasses and a short neck, fade long hair out in a soft ellipse -> colour grade ->
square crop centred on the face (the game rotates around it) -> smooth white sticker border with a dark rim.
Models download on first run (rembg caches BiRefNet; MediaPipe's selfie_multiclass model is fetched below).
"""
import argparse, os, urllib.request
import numpy as np, cv2
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
from scipy import ndimage as ndi

MC_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'


def masks(im, cache):
    from rembg import new_session, remove
    import mediapipe as mp
    from mediapipe.tasks import python as mpp
    from mediapipe.tasks.python import vision
    A = np.asarray(remove(im, session=new_session('birefnet-portrait'), only_mask=True), np.float32) / 255
    model = os.path.join(cache, 'selfie_multiclass.tflite')
    if not os.path.exists(model):
        os.makedirs(cache, exist_ok=True); urllib.request.urlretrieve(MC_URL, model)
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(base_options=mpp.BaseOptions(model_asset_path=model), output_confidence_masks=True))
    res = seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(np.asarray(im))))
    C = np.stack([np.squeeze(m.numpy_view()).astype(np.float32) for m in res.confidence_masks])
    seg.close()
    return A, C  # C: 0 background, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 accessories


def cutout(im, A, C, o):
    H, W = A.shape
    hair, body, face, clothes, others = C[1], C[2], C[3], C[4], C[5]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

    def biggest(m):
        lab, n = ndi.label(m); k = int(np.argmax(ndi.sum(np.ones_like(lab), lab, range(1, n + 1)))) + 1
        ys, xs = np.where(lab == k); return xs.min(), xs.max(), ys.min(), ys.max()
    fx0, fx1, fy0, fy1 = biggest(face > .5); fh, fw = fy1 - fy0, fx1 - fx0
    near = (xx > fx0 - .3 * fw) & (xx < fx1 + .3 * fw) & (yy > fy0 - .3 * fh) & (yy < fy1 + .3 * fh)
    fm = cv2.morphologyEx(((face + others * near) > .45).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    fx0, fx1, fy0, fy1 = biggest(ndi.binary_fill_holes(fm)); fh, fw = fy1 - fy0, fx1 - fx0  # glasses no longer split the face
    fcx, fcy = (fx0 + fx1) / 2, (fy0 + fy1) / 2
    glasses = ((xx > fx0 - .12 * fw) & (xx < fx1 + .12 * fw) & (yy > fy0 - .05 * fh) & (yy < fy0 + .70 * fh)).astype(np.float32)
    nd = ((xx - fcx) / (.30 * fw)) ** 2 + ((yy - fy1 + .06 * fh) / (o.neck * fh + .06 * fh)) ** 2
    neck = np.clip((1 - nd) / .25, 0, 1) * (yy > fy0 + .5 * fh)
    keep = hair + face + others * glasses + body * neck + (A > .5) * neck * .8
    if o.hat:  # above the face, trust the person matte: that's the hat (beanies and caps are often 'background' to the segmenter)
        hat = ((xx > fx0 - o.hat_w * fw) & (xx < fx1 + o.hat_w * fw) & (yy > fy0 - o.hat_h * fh) & (yy < fy0 + .3 * fh)).astype(np.float32)
        keep = keep + (A > .35) * hat * (1 - clothes)
    keep = cv2.GaussianBlur(np.clip(keep * 1.25, 0, 1) * (1 - np.clip(clothes * 1.6 - .2, 0, 1)), (0, 0), 3)
    ecx = fcx + o.cx_off * fw
    d = ((xx - ecx) / (o.rx * fw)) ** 2 + (np.maximum(yy - fcy, 0) / (o.cut * fh)) ** 2 + (np.maximum(fcy - yy, 0) / (o.ry_top * fh)) ** 2
    alpha = A * keep * np.clip((1.0 - d) / .18 + .5, 0, 1)
    lab, _ = ndi.label(alpha > .25); k = lab[int(fcy), int(fcx)]
    alpha = alpha * ndi.binary_dilation(lab == (k or 1), iterations=6)
    alpha = np.where(alpha < .04, 0, alpha)
    solid = ndi.binary_fill_holes(alpha > .5)
    alpha = np.maximum(alpha, solid * cv2.GaussianBlur(solid.astype(np.float32), (0, 0), 1.5))
    g = ImageEnhance.Color(ImageEnhance.Contrast(ImageOps.autocontrast(im, cutoff=.6)).enhance(o.contrast)).enhance(o.saturation)
    g = Image.fromarray((np.clip((np.asarray(g, np.float32) / 255) ** o.gamma, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.UnsharpMask(radius=2.2, percent=70, threshold=2))
    solidm = cv2.GaussianBlur(alpha, (0, 0), 4) > .3; lab3, _ = ndi.label(solidm); solidm = lab3 == lab3[int(fcy), int(fcx)]
    alpha = alpha * ndi.binary_dilation(solidm, iterations=8)
    ys, xs = np.where(solidm)
    half = max(fcx - xs.min(), xs.max() - fcx, fcy - ys.min(), ys.max() - fcy) * 1.12
    x0, y0, side = int(fcx - half), int(fcy - half), int(2 * half)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(Image.fromarray(np.dstack([np.asarray(g), (np.clip(alpha, 0, 1) * 255).astype(np.uint8)]), 'RGBA'), (-x0, -y0))
    return canvas.resize((512, 512), Image.LANCZOS)


def sticker(canvas):
    a = np.asarray(canvas)[..., 3].astype(np.float32) / 255
    shape = (cv2.GaussianBlur(a, (0, 0), 7) > .22).astype(np.uint8)
    shape = ndi.binary_fill_holes(cv2.morphologyEx(shape, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))).astype(np.uint8)
    disk = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    white = np.clip(cv2.GaussianBlur(cv2.dilate(shape, disk(9)).astype(np.float32), (0, 0), 1.6) * 1.15, 0, 1)
    rim = cv2.GaussianBlur(cv2.dilate(shape, disk(12)).astype(np.float32), (0, 0), 1.6) * .55

    def over(top, bot):
        ta, ba = top[..., 3:4], bot[..., 3:4]; oa = ta + ba * (1 - ta)
        return np.dstack([(top[..., :3] * ta + bot[..., :3] * ba * (1 - ta)) / np.maximum(oa, 1e-6), oa])
    base = np.dstack([np.full(a.shape + (3,), [40 / 255, 28 / 255, 60 / 255], np.float32), rim])
    wl = np.dstack([np.ones(a.shape + (3,), np.float32), white])
    out = over(np.asarray(canvas).astype(np.float32) / 255, over(wl, base))
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA')


def gold(sprite):
    src = np.asarray(sprite).astype(np.float32) / 255; rgb, a = src[..., :3], src[..., 3]
    lum = np.clip((rgb @ np.array([.3, .59, .11])) * 1.15, 0, 1)
    stops = [(0, (.30, .16, .04)), (.45, (.86, .60, .16)), (.75, (1, .84, .36)), (1, (1, .97, .80))]
    g = np.zeros_like(rgb)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        m = (lum >= t0) & (lum <= t1); t = ((lum - t0) / (t1 - t0))[..., None]
        g[m] = (np.array(c0) * (1 - t) + np.array(c1) * t)[m]
    border = cv2.GaussianBlur((((rgb @ np.array([.3, .59, .11])) > .9) & ((rgb.max(-1) - rgb.min(-1)) < .08)).astype(np.float32), (0, 0), 1)
    yy = np.mgrid[0:a.shape[0], 0:a.shape[1]][0] / a.shape[0]
    sheen = np.stack([np.ones_like(yy), .78 + .18 * np.cos(yy * 9), .25 + .25 * np.cos(yy * 9 + 1)], -1)
    photo = rgb * .38 + g * .62
    out = photo * (1 - border[..., None]) + sheen * border[..., None]
    return Image.fromarray((np.dstack([np.clip(out, 0, 1), a]) * 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('photo'); ap.add_argument('out')
    ap.add_argument('--gold', action='store_true', help='photo is an existing sprite: make its golden variant')
    ap.add_argument('--cut', type=float, default=.95, help='how far long hair may hang below the face centre (face heights)')
    ap.add_argument('--rx', type=float, default=1.5, help='how wide hair may spread (face widths)')
    ap.add_argument('--cx-off', type=float, default=0, help='shift the hair ellipse left/right (face widths)')
    ap.add_argument('--ry-top', type=float, default=9, help='round off hair above the face (face heights; 9 = off)')
    ap.add_argument('--neck', type=float, default=.10)
    ap.add_argument('--hat', action='store_true', help='keep a hat or cap above the face')
    ap.add_argument('--hat-w', type=float, default=.45, help='how far a brim may stick out sideways (face widths)')
    ap.add_argument('--hat-h', type=float, default=1.1, help='how tall the hat may be above the face (face heights)')
    ap.add_argument('--gamma', type=float, default=1.0); ap.add_argument('--saturation', type=float, default=1.08); ap.add_argument('--contrast', type=float, default=1.06)
    ap.add_argument('--size', type=int, default=384); ap.add_argument('--cache', default=os.path.expanduser('~/.cache/flappy-fellas'))
    o = ap.parse_args()
    if o.gold:
        sprite = gold(Image.open(o.photo).convert('RGBA').resize((512, 512), Image.LANCZOS))
    else:
        im = ImageOps.exif_transpose(Image.open(o.photo)).convert('RGB'); im.thumbnail((1600, 1600))
        A, C = masks(im, o.cache)
        sprite = sticker(cutout(im, A, C, o))
    sprite = sprite.resize((o.size, o.size), Image.LANCZOS)
    sprite.save(o.out, 'WEBP', quality=86, method=6) if o.out.endswith('.webp') else sprite.save(o.out)
    print('wrote', o.out)
