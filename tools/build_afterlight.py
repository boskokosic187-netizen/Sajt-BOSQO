"""Builds the photo layers for the fourth Process project, "Afterlight" (a made-up sci-fi film).

Sources (Freepik originals, never shipped) in _freepik/afterlight/:
  37294252_*.jpg  an astronaut walking away, on white (the hero of the one-sheet)
  37294258_*.jpg  the same suit, close up, on white (the character poster)
  39357.jpg       a dune crest against a clear sky (the sky is keyed out)
  762.jpg         a ringed planet, edge on, on a black starfield
  679.jpg         dust thrown up, on black

Writes media/process/afterlight/ (AVIF + WebP, alpha kept), loaded only when the demo
gets to this project:
  hero      the walker, cut out (rembg), cleaned of the white fringe and relit for the
            scene: his back to us in shadow, a warm rim where the light ahead catches him
  hero-raw  the same crop as it was shot (step 02 shows the cut being made)
  face      the close-up, cut out, a touch darker so it sits in the night
  dune      the crest with the sky keyed out and graded to dusk
  planet    the planet and its ring with the stars and the black taken out
  dust      the dust as light on a clear background
  stars     a small tile of stars for the sky
and writes the hero's outline as an SVG path to _freepik/afterlight/hero-outline.txt (the selection
drawn in step 02; it goes into index.html by hand, in the afterlight template).

Usage:  python -I tools/build_afterlight.py
"""
import os

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_freepik", "afterlight")
OUT = os.path.join(ROOT, "media", "process", "afterlight")


def src(prefix):
    return next(os.path.join(SRC, f) for f in os.listdir(SRC) if f.startswith(prefix) and f.endswith(".jpg"))


def save(rgb, a, name, w=None, q_webp=80, q_avif=56):
    """rgb float 0..255 (h, w, 3), a float 0..1 (h, w) or None; resized to width w"""
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    im = Image.fromarray(rgb, "RGB")
    if a is not None:
        im.putalpha(Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), "L"))
    if w and im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, name + ".webp"), quality=q_webp, method=6, exact=False)
    im.save(os.path.join(OUT, name + ".avif"), quality=q_avif, icc_profile=None, exif=b"", xmp=b"")
    kb = [os.path.getsize(os.path.join(OUT, name + e)) // 1024 for e in (".avif", ".webp")]
    print(f"{name:9s} {im.width}x{im.height}  avif {kb[0]} KB  webp {kb[1]} KB")
    return im.size


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lum(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def cut(path, longest=2400):
    """The subject on white: rembg's mask, then the white taken back out of the soft edge"""
    from rembg import new_session, remove
    im = Image.open(path).convert("RGB")
    im.thumbnail((longest, longest), Image.LANCZOS)
    m = remove(im, session=new_session("isnet-general-use"), only_mask=True)
    a = np.asarray(m, dtype=np.float32) / 255
    a = smooth(a, 0.08, 0.92)                    # firmer edge, no grey veil
    c = np.asarray(im, dtype=np.float32)
    # the edge pixels are part subject, part white: un-mix them (C = a*F + (1-a)*255)
    f = (c - (1 - a[..., None]) * 255) / np.maximum(a[..., None], 0.05)
    f = np.where(a[..., None] > 0.97, c, np.clip(f, 0, 255))
    return f, a, c


def crop_box(a, pad):
    ys, xs = np.where(a > 0.05)
    h, w = a.shape
    return max(0, xs.min() - pad), max(0, ys.min() - pad), min(w, xs.max() + pad + 1), min(h, ys.max() + pad + 1)


def hero():
    f, a, raw = cut(src("37294252"))
    x0, y0, x1, y1 = crop_box(a, 24)
    f, a, raw = f[y0:y1, x0:x1], a[y0:y1, x0:x1], raw[y0:y1, x0:x1]
    # backlit: the back we see is in shadow, cool; the light is ahead of him (the horizon)
    L = lum(f)
    back = f * np.array([0.40, 0.40, 0.47]) + 6
    back *= (0.75 + 0.25 * smooth(L, 40, 230))[..., None]
    # a warm rim on the outline, strongest where the edge faces up and to the right
    inside = a > 0.5
    dist = ndimage.distance_transform_edt(inside)
    rim = np.exp(-dist / 9.0) * inside
    soft = ndimage.gaussian_filter(a, 6)
    gy, gx = np.gradient(soft)
    n = np.hypot(gx, gy) + 1e-6
    face_up = np.clip((-gy / n) * 0.8 + (-gx / n) * 0.35, 0, 1)   # normals point out of the shape
    rim *= 0.35 + 0.65 * face_up
    rimc = np.array([255, 178, 104], np.float32)
    out = back + (rimc - back) * np.clip(rim * 1.15, 0, 1)[..., None]
    w = 760
    save(out, a, "hero", w)
    save(raw, None, "hero-raw", w, q_webp=72, q_avif=50)
    # the selection outline, in the saved image's pixels
    k = min(1, w / a.shape[1])
    m = (cv2.resize(a, (round(a.shape[1] * k), round(a.shape[0] * k)), interpolation=cv2.INTER_AREA) > 0.5).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, 1.6, True)[:, 0, :]
    d = "M" + " ".join(f"{x},{y}" for x, y in c) + "Z"
    print(f"hero outline: viewBox 0 0 {m.shape[1]} {m.shape[0]}, {len(c)} points")
    with open(os.path.join(SRC, "hero-outline.txt"), "w") as fh:
        fh.write(f'<svg viewBox="0 0 {m.shape[1]} {m.shape[0]}"><path d="{d}"/></svg>\n')


def face():
    f, a, _ = cut(src("37294258"))
    x0, y0, x1, y1 = crop_box(a, 16)
    f, a = f[y0:y1, x0:x1], a[y0:y1, x0:x1]
    L = lum(f)
    # into the night: the suit a little darker and cooler, the warm light on the face kept
    g = f * np.array([0.80, 0.78, 0.84])
    g *= (0.7 + 0.3 * smooth(L, 60, 220))[..., None]
    print("face crop", (x0, y0, x1, y1), "->", f.shape[1], "x", f.shape[0])
    save(g, a, "face", 1000)


def dune():
    c = np.asarray(Image.open(src("39357")).convert("RGB"), dtype=np.float32)
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    sky = smooth(B - R, -4, 9)
    # the crest only: the sky is everything above the sand, so close the gaps in it
    sky = ndimage.gaussian_filter(sky, 0.8)
    a = 1 - sky
    # only the big dune: the far horizon showing past its slope goes with the sky
    lab, n = ndimage.label(a > 0.5)
    big = lab == (np.argmax(np.bincount(lab.ravel())[1:]) + 1)
    a *= ndimage.gaussian_filter(ndimage.binary_dilation(big, iterations=2).astype(np.float32), 1)
    # where that far land touches the slope (top right), only the lit, saturated sand stays
    far = np.zeros_like(a)
    far[:430, 1150:] = 1
    far = ndimage.gaussian_filter(far, 6)
    a *= 1 - far * (1 - smooth(R - B, 95, 125))
    L = lum(c)
    lit = smooth(L, 70, 210)
    # dusk: the shade sinks to a deep violet brown, the lit face keeps its amber
    g = c * (0.34 + 0.5 * lit)[..., None]
    g += (1 - lit)[..., None] * np.array([10, 4, 16])
    g[..., 0] *= 1.04
    g[..., 2] *= 0.86
    # the crest catches the last light: a thin glow just under the skyline
    edge = ndimage.gaussian_filter((a > 0.5).astype(np.float32), 3)
    rim = np.clip((1 - edge) * 2.2, 0, 1) * (a > 0.5)
    g += rim[..., None] * np.array([120, 60, 20])
    save(g, a, "dune", 1500, q_avif=52)


def planet():
    c = np.asarray(Image.open(src("762")).convert("RGB"), dtype=np.float32)
    L = lum(c)
    h, w = L.shape
    # the disc: a circle through the edge of everything bright off the ring's rows
    pts = []
    for y in range(185, 620, 3):
        if 385 <= y <= 420:
            continue
        xs = np.where(L[y, 500:1040] > 28)[0]
        if len(xs) > 10:
            pts += [(500 + xs[0], y), (500 + xs[-1], y)]
    P = np.array(pts, np.float64)
    A = np.c_[2 * P[:, 0], 2 * P[:, 1], np.ones(len(P))]
    cx, cy, k = np.linalg.lstsq(A, (P ** 2).sum(1), rcond=None)[0]
    r = np.sqrt(k + cx * cx + cy * cy)
    yy, xx = np.mgrid[0:h, 0:w]
    disc = smooth(r + 1.2 - np.hypot(xx - cx, yy - cy), 0, 2.4)
    # the ring: a thin bright band through the middle; only its light, no stars
    band = smooth(14 - np.abs(yy - cy - 2), 0, 6)
    ring = np.clip((L - 14) / 70, 0, 1) * band
    disc *= smooth(L, 5, 26)                     # the fit runs a little wide: no black rim around the night side
    a = np.maximum(disc, ring)
    rgb = np.where(disc[..., None] > 0.5, c, c / np.maximum(a[..., None], 0.05))
    x0, x1 = 20, w - 20
    y0, y1 = int(cy - r - 14), int(cy + r + 14)
    print(f"planet: centre {cx:.0f},{cy:.0f} r {r:.0f}; crop {x0},{y0} {x1},{y1}")
    save(rgb[y0:y1, x0:x1], a[y0:y1, x0:x1], "planet", 1400)


def dust():
    c = np.asarray(Image.open(src("679")).convert("RGB"), dtype=np.float32)
    L = lum(c)
    a = np.clip((L - 14) / 150, 0, 1) ** 1.15
    # the cloud only: the loose grains under it cost a lot of bytes and read as noise
    a = ndimage.median_filter(a, 7)
    a = ndimage.gaussian_filter(a, 1.2)
    ys = np.where(a.max(1) > 0.12)[0]
    a = a[: ys.max() + 20]
    # no edge may show: the plume was cut by the photo's top
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    a *= smooth(yy / h, 0, 0.3) * smooth(1 - yy / h, 0, 0.2) * smooth(xx / w, 0, 0.18) * smooth(1 - xx / w, 0, 0.18)
    rgb = np.zeros(a.shape + (3,), np.float32) + np.array([255, 226, 190])
    save(rgb, a * 0.95, "dust", 480, q_webp=70)


def stars():
    rng = np.random.default_rng(7)
    S = 512
    a = np.zeros((S, S), np.float32)
    for _ in range(170):
        x, y = rng.uniform(0, S, 2)
        b = rng.uniform(0.25, 1) ** 2
        s = 0.55 if rng.uniform() < 0.85 else 1.1
        yy, xx = np.mgrid[0:S, 0:S]
        # wrap around, so the tile repeats without a seam
        dx = np.minimum(np.abs(xx - x), S - np.abs(xx - x))
        dy = np.minimum(np.abs(yy - y), S - np.abs(yy - y))
        a = np.maximum(a, b * np.exp(-(dx * dx + dy * dy) / (2 * s * s)))
    rgb = np.zeros((S, S, 3), np.float32) + np.array([242, 236, 226])
    save(rgb, a, "stars", q_webp=82, q_avif=60)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    hero()
    face()
    dune()
    planet()
    dust()
    stars()
