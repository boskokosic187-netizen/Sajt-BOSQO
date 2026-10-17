"""Builds the animatable vector avatar (logo + intro) from the cartoon portrait.

Sources (made with ChatGPT from the profile photo, kept in _freepik/lik/):
  lik.png        the avatar, front view, on an orange-red disc
  lik-wink.png   the same picture with the left eye (viewer's right) winking

Steps:
  1. both pictures are snapped to one shared flat palette (so traced shapes match
     exactly), the disc and the white around it are marked for removal (magenta);
  2. three images are traced in Illustrator (Image Trace, run through a .jsx):
       base   the whole character
       wink   only the patch that changes when winking (right brow + eye)
       blink  the closed eye mirrored onto the left eye, for blinking
  3. the traces are scaled into a 200 x 200 viewBox and assembled into
     media/brand/avatar.svg (groups .av-head, .av-lid--0, .av-lid--1, same hooks the
     CSS/JS already animate), which is also written inline into index.html.

    python -I tools/build_avatar.py              (then: python -I tools/build_cases.py --pages)
    python -I tools/build_avatar.py --assemble   rebuild the SVG from the last trace only
"""
import os
import re
import subprocess
import time

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_freepik", "lik")
WORK = os.path.join(SRC, "build")
OUT = os.path.join(ROOT, "media", "brand")
ILLUSTRATOR = r"D:\Adobe Apps\Adobe Illustrator 2026\Support Files\Contents\Windows\Illustrator.exe"
CROSS = (255, 0, 255)            # "not part of the drawing": removed after tracing
K = 12                           # flat colours in the cartoon
WORK_PX = 700                    # traced at this size: plenty for the 440 px intro, light as a logo
EYE_L, EYE_R = (502, 453), (729, 454)   # in the 1254 px sources
AXIS = (EYE_L[0] + EYE_R[0]) / 2


def palette(img, inside):
    px = img[inside].astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
    _, _, cen = cv2.kmeans(px, K, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    return cen


def snap(img, pal):
    """Nearest palette colour (in Lab), then a 5 px mode filter to drop anti-alias slivers."""
    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
    plab = cv2.cvtColor(pal.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    d = ((lab[:, :, None, :] - plab[None, None, :, :]) ** 2).sum(-1)
    idx = d.argmin(-1)
    votes = np.stack([cv2.blur((idx == k).astype(np.float32), (5, 5)) for k in range(len(pal))], -1)
    return votes.argmax(-1)


def flat(idx, pal, keep):
    out = pal.astype(np.uint8)[idx]
    out[~keep] = CROSS
    return out


def disc():
    """Centre and radius of the orange disc at WORK_PX: its orange spans the full width,
    its top is the topmost orange row."""
    img = np.asarray(Image.open(os.path.join(SRC, "lik.png")).convert("RGB").resize((WORK_PX, WORK_PX), Image.LANCZOS))
    ys, xs = np.where(np.abs(img.astype(int) - [253, 71, 20]).sum(2) < 60)
    r = (xs.max() - xs.min()) / 2
    return (xs.min() + xs.max()) / 2, ys.min() + r, r


def quantize():
    os.makedirs(WORK, exist_ok=True)
    big = Image.open(os.path.join(SRC, "lik.png")).convert("RGB")
    f = WORK_PX / big.width
    load = lambda n: np.asarray(Image.open(os.path.join(SRC, n)).convert("RGB").resize((WORK_PX, WORK_PX), Image.LANCZOS))
    base, wink = load("lik.png"), load("lik-wink.png")
    h, w = base.shape[:2]
    eye_l = (round(EYE_L[0] * f), round(EYE_L[1] * f))
    eye_r = (round(EYE_R[0] * f), round(EYE_R[1] * f))
    axis = AXIS * f
    cx, cy, r = disc()
    yy, xx = np.mgrid[:h, :w]
    inside = (xx - cx) ** 2 + (yy - cy) ** 2 < (r - 1) ** 2

    pal = palette(base, inside)
    bg = np.argmin(np.abs(pal - [253, 71, 20]).sum(1))
    bi, wi = snap(base, pal), snap(wink, pal)
    # base: everything but the disc colour. Shapes touching the rim (the sweater) are
    # carried 6 px past it, so the circular clip never leaves a hairline of orange.
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    ring = (dist > r - 3) & (dist < r + 4)
    k = (r - 4) / np.maximum(dist, 1)
    ix = np.clip(np.round(cx + (xx - cx) * k), 0, w - 1).astype(int)
    iy = np.clip(np.round(cy + (yy - cy) * k), 0, h - 1).astype(int)
    bi = np.where(ring, bi[iy, ix], bi)
    Image.fromarray(flat(bi, pal, (dist < r + 4) & (bi != bg))).save(os.path.join(WORK, "base.png"))

    # wink patch: where the two pictures differ around the right eye, grown so its edge
    # runs through areas both pictures agree on, plus the whole eye
    diff = (np.abs(base.astype(int) - wink.astype(int)).sum(2) > 60).astype(np.uint8)
    z = lambda v: max(3, round(v * f)) | 1
    diff[:round(340 * f)], diff[round(520 * f):], diff[:, :round(600 * f)], diff[:, round(850 * f):] = 0, 0, 0, 0
    diff = cv2.morphologyEx(diff, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    patch = cv2.dilate(diff, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (z(29), z(29))))
    cv2.ellipse(patch, eye_r, (round(84 * f), round(40 * f)), 0, 0, 360, 1, -1)
    patch = cv2.morphologyEx(patch, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (z(41), z(41)))) > 0
    Image.fromarray(flat(wi, pal, patch)).save(os.path.join(WORK, "wink.png"))

    # blink patch: the closed right eye (without the brow) mirrored across the face axis
    mirror = wi[:, ::-1]
    shift = int(round(2 * axis - (w - 1)))          # mirror about the face axis, not the image centre
    mirror = np.roll(mirror, shift, axis=1)
    eye = np.zeros((h, w), np.uint8)
    cv2.ellipse(eye, (eye_l[0], eye_l[1] + 1), (round(80 * f), round(31 * f)), 0, 0, 360, 1, -1)
    Image.fromarray(flat(mirror, pal, eye > 0)).save(os.path.join(WORK, "blink.png"))


JSX = r"""
// Image Trace the flat pictures in build/ (1 px = 1 pt), export SVG, close; quit if we opened Illustrator.
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
var DIR = "%(dir)s/";
var names = ["base", "wink", "blink"];
var log = [];
function step(what, fn) { try { fn(); } catch (e) { log.push(what + ": " + e); } }
for (var i = 0; i < names.length; i++) {
  var doc, img, t, o;
  step("doc", function () { doc = app.documents.add(DocumentColorSpace.RGB, %(w)d, %(h)d); });
  step("place", function () {
    img = doc.placedItems.add();
    img.file = new File(DIR + names[i] + ".png");
    img.width = %(w)d; img.height = %(h)d;
    var ab = doc.artboards[0].artboardRect;   // [left, top, right, bottom]
    img.left = ab[0]; img.top = ab[1];
  });
  step("trace", function () { t = img.trace(); o = t.tracing.tracingOptions; });
  step("mode", function () { o.tracingMode = TracingModeType.TRACINGMODECOLOR; });
  step("colortype", function () { o.tracingColorTypeValue = TracingColorType.TRACINGLIMITEDCOLOR; });
  step("colors", function () { o.maxColors = %(colors)d; });
  step("method", function () { o.tracingMethod = TracingMethodType.TRACINGMETHODABUTTING; });
  step("fills", function () { o.fills = true; o.strokes = false; o.ignoreWhite = false; });
  step("fidelity", function () { o.pathFidelity = 70; o.cornerFidelity = 75; o.noiseFidelity = %(noise)d; });
  step("expand", function () { app.redraw(); t.tracing.expandTracing(); });
  step("export", function () {
    var e = new ExportOptionsSVG();
    e.embedRasterImages = false;
    e.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
    e.coordinatePrecision = 2;
    e.documentEncoding = SVGDocumentEncoding.UTF8;
    doc.exportFile(new File(DIR + names[i] + ".svg"), ExportType.SVG, e);
    log.push(names[i] + " paths " + doc.pathItems.length + " artboard " + doc.artboards[0].artboardRect);
  });
  step("close", function () { doc.close(SaveOptions.DONOTSAVECHANGES); });
}
var lf = new File(DIR + "trace.log"); lf.encoding = "UTF-8"; lf.open("w"); lf.write(log.join("\n")); lf.close();
if (%(quit)s && app.documents.length === 0) app.quit();
"""


def trace(w, h):
    running = b"Illustrator.exe" in subprocess.run(["tasklist"], capture_output=True).stdout
    for n in ("base", "wink", "blink", "trace"):
        p = os.path.join(WORK, n + (".log" if n == "trace" else ".svg"))
        if os.path.exists(p):
            os.remove(p)
    jsx = os.path.join(WORK, "trace.jsx")
    open(jsx, "w", encoding="utf-8").write(JSX % {
        "dir": WORK.replace("\\", "/"), "w": w, "h": h, "colors": K + 1, "noise": 14,
        "quit": "false" if running else "true"})
    subprocess.Popen([ILLUSTRATOR, jsx])
    log = os.path.join(WORK, "trace.log")
    for _ in range(360):
        if os.path.exists(log):
            break
        time.sleep(0.5)
    else:
        raise SystemExit("Illustrator did not finish the trace (no build/trace.log)")
    print(open(log, encoding="utf-8").read())


SHAPE = re.compile(r"<(path|polygon)\b([^>]*?)/>", re.S)
NUM = re.compile(r"-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
ARGS = {"M": 2, "L": 2, "T": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "Z": 0}


def fmt(v):
    """One decimal in the 200 px box (0.2 px at 440 px), no leading zero."""
    t = f"{v:.1f}".rstrip("0").rstrip(".")
    t = t.replace("-0.", "-.") if t.startswith("-0.") else (t[1:] if t.startswith("0.") else t)
    return "0" if t in ("", "-0", "-") else t


def compact(d, tf):
    """Illustrator path data -> the same outline, mapped by tf (x, y) -> (x, y) and written
    relative with one decimal. Each step is measured from the *rounded* pen position, so
    rounding never drifts along a long outline."""
    toks = re.findall(r"[MmLlHhVvCcSsQqTtZz]|" + NUM.pattern, d)
    out = []
    st = {"prev": None, "num": False}
    pen = start = (0.0, 0.0)          # exact, in source units
    rpen = rstart = (0.0, 0.0)        # rounded, in output units
    i, cmd = 0, None

    def put(c, nums):
        if c != st["prev"] or c == "M":   # a repeated command letter can be left out
            out.append(c)
            st["num"] = False
        for n in nums:
            t = fmt(n)
            if st["num"] and not t.startswith("-"):
                out.append(" ")
            out.append(t)
            st["num"] = True
        st["prev"] = c
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            if cmd in "Zz":
                out.append("z")
                st["prev"], st["num"] = "z", False
                pen, rpen = start, rstart
                continue
        rel, C = cmd.islower(), cmd.upper()
        n = ARGS[C]
        vals = [float(v) for v in toks[i:i + n]]
        i += n
        if C == "H":
            pts = [((pen[0] + vals[0]) if rel else vals[0], pen[1])]
        elif C == "V":
            pts = [(pen[0], (pen[1] + vals[0]) if rel else vals[0])]
        else:
            pts = [((pen[0] + vals[k]) if rel else vals[k], (pen[1] + vals[k + 1]) if rel else vals[k + 1]) for k in range(0, n, 2)]
        mapped = [tuple(round(v, 1) for v in tf(*p)) for p in pts]
        if C == "M":
            put("M", mapped[0])
            start = pen = pts[0]
            rstart = rpen = mapped[0]
            cmd = "l" if rel else "L"   # extra pairs after a moveto are linetos
            continue
        steps = [(x - rpen[0], y - rpen[1]) for x, y in mapped]
        if C in "HV" or (C == "L" and (steps[0][0] == 0 or steps[0][1] == 0)):
            dx, dy = steps[0]
            if dy == 0:
                put("h", [dx])
            elif dx == 0:
                put("v", [dy])
            else:
                put("l", [dx, dy])
        else:
            put(C.lower(), [v for st in steps for v in st])
        pen, rpen = pts[-1], mapped[-1]
    return "".join(out)


def shapes(name, tf):
    """{fill: path data} from an Illustrator SVG: same-colour shapes merged (the trace is
    abutting, so they never overlap), the magenta 'not drawing' areas dropped."""
    svg = open(os.path.join(WORK, name + ".svg"), encoding="utf-8").read()
    out = {}
    for tag, attrs in SHAPE.findall(svg):
        m = re.search(r'fill="(#[0-9A-Fa-f]{6})"', attrs)
        fill = (m.group(1) if m else "#000000").lower()
        rgb = tuple(int(fill[i:i + 2], 16) for i in (1, 3, 5))
        if sum(abs(a - b) for a, b in zip(rgb, CROSS)) < 90:
            continue
        if tag == "polygon":
            pts = NUM.findall(re.search(r'points="([^"]*)"', attrs).group(1))
            d = "M" + " ".join(pts[:2]) + "L" + " ".join(pts[2:]) + "Z"
        else:
            d = re.search(r'\bd="([^"]*)"', attrs).group(1)
        out[fill] = out.get(fill, "") + compact(d, tf)
    return out


def assemble(cx, cy, r):
    s = 200 / (2 * r)
    tf = lambda x, y: ((x - (cx - r)) * s, (y - (cy - r)) * s)
    group = lambda name: "\n".join(f'<path fill="{f}" d="{d}"/>' for f, d in shapes(name, tf).items())
    # the sweater carried well past the rim along the shoulder line, so a tilted or popping
    # head never shows orange under it (drawn first: it only shows where nothing else is)
    rgb = lambda f: tuple(int(f[i:i + 2], 16) for i in (1, 3, 5))
    navy = min(shapes("base", tf), key=lambda f: sum(abs(a - b) for a, b in zip(rgb(f), (26, 34, 48))))
    flat_img = np.asarray(Image.open(os.path.join(WORK, "base.png")).convert("RGB")).astype(int)
    drawn = np.abs(flat_img - CROSS).sum(2) > 30

    def shoulder(x200):
        x = int(round(cx - r + x200 * 2 * r / 200))
        col = np.where(drawn[int(cy):, x])[0]         # first drawn pixel below the disc centre
        return tf(x, int(cy) + col[0])[1] + 1.5

    left = [(x, shoulder(x)) for x in (20, 26, 32, 38)]
    right = [(x, shoulder(x)) for x in (162, 168, 174, 180)]
    ext = lambda a, b, x: b[1] + (b[1] - a[1]) / (b[0] - a[0]) * (x - b[0])
    pts = ([(-60, ext(left[1], left[0], -60))] + left + [(38, 165), (162, 165)] + right +
           [(260, ext(right[-2], right[-1], 260)), (260, 330), (-60, 330)])
    bleed = "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts) + "z"
    svg = f"""<svg class="av" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Boško Kosić">
<defs><clipPath id="av-clip"><circle cx="100" cy="100" r="100"/></clipPath></defs>
<g clip-path="url(#av-clip)">
<circle class="av-bg" cx="100" cy="100" r="100"/>
<g class="av-head">
<path fill="{navy}" d="{bleed}"/>
{group("base")}
<g class="av-lid av-lid--0">
{group("blink")}
</g>
<g class="av-lid av-lid--1">
{group("wink")}
</g>
</g>
</g>
</svg>"""
    open(os.path.join(OUT, "avatar.svg"), "w", encoding="utf-8").write(svg)
    print(f"avatar.svg {len(svg.encode()) / 1024:.1f} KB")

    # the home page carries the logo inline too
    p = os.path.join(ROOT, "index.html")
    html = open(p, "rb").read().decode("utf-8")
    inline = svg.replace('role="img" aria-label="Boško Kosić"', 'aria-hidden="true" focusable="false"')
    html, n = re.subn(r'(<span class="mark__av">)<svg class="av".*?</svg>(</span>)',
                      lambda m: m.group(1) + inline.replace("\n", "\r\n") + m.group(2), html, flags=re.S)
    assert n == 1, "logo avatar not found in index.html"
    open(p, "wb").write(html.encode("utf-8"))


def main():
    import sys
    if "--assemble" not in sys.argv:      # --assemble: reuse the last trace in build/
        quantize()
        w, h = Image.open(os.path.join(WORK, "base.png")).size
        trace(w, h)
    assemble(*disc())


if __name__ == "__main__":
    main()
