"""Builds the standby screens of the hero wall (the dimmed tiles around the project screens)
and the Ballies cast loop for screen p8.

Every still is cut from its original (the same sources as content/cases.json) at the tile's
own shape, around a chosen focus point, into media/wall/<name>-<w>.{avif,webp}. A width is made
only when the crop is at least that wide, so no screen shows a picture bigger than its file.

Usage:  python -I tools/build_wall.py            # stills + loop
        python -I tools/build_wall.py --html     # also prints the <figure> markup, in wall order
"""
import io
import os
import subprocess
import sys

from PIL import Image, ImageCms

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_cases import resolve  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "media", "wall")
WIDTHS = {"tile": (480, 720), "v": (480, 720), "w": (480, 960), "xl": (480, 960), "q1": (480, 960)}
SRGB = ImageCms.createProfile("sRGB")
# shape of each tile class (w/h) and the width it takes on a 2560 px screen
SHAPE = {"tile": 1.0, "w": 1.8, "v": 0.52, "xl": 1.0, "q1": 2.2}
SIZES = {"tile": "18vw", "w": "36vw", "v": "24vw", "xl": "34vw", "q1": "15vw"}

# wall order (the dense grid places them by DOM order, so the order is the layout):
# (class, name, source, focus x, focus y, zoom, case, label)   zoom 1 = the largest crop that fits
PICKS = [
    ("q1", "apsis-match", "PV/BOSQO/APSIS/07_Izvor/case/match_uw.png", .5, .5, 1, "apsis", "APSIS · live match, bet slip open"),
    ("xl", "fsu-space", "PV/FSU/FSU Prostor u nastajanju/Resenje_1_Osnova/FSU_Prostor_u_nastajanju_R1-Poster_A3.tif", .5, .62, 1, "fsu", "FSU · Space in the Making"),
    ("tile", "ballies-h2h", "S/_stari-sajt/assets/BALLIES/2/h2h.webp", .5, .55, 1, "ballies", "Ballies · Head-to-head"),
    ("w", "fsu-hortus", "PV/FSU/FSU Samo jedan rad/Posteri/Poster_Ana-Belosevic-Velican.tif", .5, .64, 1, "fsu", "FSU · Only One Work"),
    ("tile", "bb-breakglass", "D/Ai Baby Boo/Break-glass.png", .5, .5, 1, "babyboo", "Baby Boo · Break glass"),
    ("v", "bb-cottonseed", "D/Ai Baby Boo/Gotove/Elephant.png", .5, .5, 1, "babyboo", "Baby Boo · Cottonseed wash"),
    ("tile", "ballies-sportsbooks", "S/_stari-sajt/assets/BALLIES/2/19-11.webp", .5, .5, 1, "ballies", "Ballies · Sportsbooks vs Ballies"),
    ("tile", "fsu-meeting", "PV/FSU/FSU Tacke susreta/Poster.tif", .5, .63, 1, "fsu", "FSU · Meeting Points"),
    ("tile", "ballies-you-vs-ai", "S/_stari-sajt/assets/BALLIES/4/You-vs-Ai.webp", .5, .5, 1, "ballies", "Ballies · You vs AI"),
    ("v", "bb-macadamia", "D/Ai Baby Boo/macadamia.png", .5, .5, 1, "babyboo", "Baby Boo · Macadamia"),
    ("tile", "bb-carousel", "D/Ai Baby Boo/zirafe.png", .5, .6, 1, "babyboo", "Baby Boo · Carousel"),
    ("tile", "ballies-carter", "S/_stari-sajt/assets/BALLIES/4/2000_vince_carter.webp", .5, .5, 1, "ballies", "Ballies · Defy gravity"),
    ("w", "ballies-ambassadors", "S/_stari-sajt/assets/BALLIES/2/Ai-ambassadors-assemble.webp", .5, .45, 1, "ballies", "Ballies · AI Ambassadors"),
    ("v", "bb-manuka", "D/Ai Baby Boo/Gotove/Manuka.png", .5, .5, 1, "babyboo", "Baby Boo · Manuka Honey"),
    ("tile", "ballies-edelman", "S/_stari-sajt/assets/BALLIES/4/edelman-vs-gravity.webp", .5, .5, 1, "ballies", "Ballies · Edelman vs Gravity"),
    ("tile", "fsu-propter", "S/_izvori/fsu/propter-omnia-poster.png", .5, .6, 1, "fsu", "FSU · Propter Omnia"),
    ("w", "apsis-desk", "PV/BOSQO/APSIS/04_Mockupi/APSIS_mock_desk.jpg", .5, .5, 1, "apsis", "APSIS · wide screen and phone"),
    ("tile", "bb-claw", "D/Ai Baby Boo/Masina.png", .5, .5, 1, "babyboo", "Baby Boo · Claw machine"),
    ("w", "ballies-mint", "S/_izvori/ballies/mint-stage.png", .5, .5, 1, "ballies", "Ballies · mint stage"),
    ("v", "apsis-phone", "PV/BOSQO/APSIS/04_Mockupi/APSIS_mock_phone_hand.jpg", .5, .5, 1, "apsis", "APSIS · lobby in the hand"),
    ("w", "ballies-hustler", "S/_stari-sajt/assets/BALLIES/2/Hustler-League-post.webp", .5, .3, 1, "ballies", "Ballies · Hustler League"),
    ("w", "apsis-laptop", "PV/BOSQO/APSIS/04_Mockupi/APSIS_mock_laptop.jpg", .5, .5, 1, "apsis", "APSIS · lobby on a laptop"),
    ("tile", "ballies-brown", "S/_stari-sajt/assets/BALLIES/2/brown-vs-gravity.webp", .5, .5, 1, "ballies", "Ballies · Brown vs Gravity"),
    ("v", "fsu-motion", "PV/FSU/FSU Izlozba GMS Umetnost pokreta i vremena/Poster_A3.tif", .5, .5, 1, "fsu", "FSU · The Art of Motion and Time"),
    ("w", "ballies-metacourt", "S/_stari-sajt/assets/BALLIES/2/King-of-the-metacourt.webp", .5, .28, 1, "ballies", "Ballies · King of the Meta-Court"),
    ("tile", "fsu-harmony", "PV/FSU/FSU Re-Harmony/DM.png", .5, .6, 1, "fsu", "FSU · Re-Harmony"),
    ("v", "fsu-closer", "PV/FSU/FSU Pogled iz blizine/Poster.tif", .5, .5, 1, "fsu", "FSU · A Closer Look"),
]

CAST = ["S/_stari-sajt/assets/BALLIES/1/13.webp", "S/_stari-sajt/assets/BALLIES/1/10.webp",
        "S/_stari-sajt/assets/BALLIES/1/20.webp", "S/_stari-sajt/assets/BALLIES/1/8.webp"]


def crop(im, shape, fx, fy, zoom):
    W, H = im.size
    if W / H > shape:
        ch = H * zoom; cw = ch * shape
    else:
        cw = W * zoom; ch = cw / shape
    x = min(max(fx * W - cw / 2, 0), W - cw)
    y = min(max(fy * H - ch / 2, 0), H - ch)
    return im.crop((round(x), round(y), round(x + cw), round(y + ch)))


def to_srgb(im):
    """CMYK print files and wide-gamut RGB through their own profile, so the colours stay true."""
    icc = im.info.get("icc_profile")
    if icc and im.mode in ("CMYK", "RGB"):
        try:
            im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), SRGB,
                                           renderingIntent=ImageCms.Intent.PERCEPTUAL, outputMode="RGB")
        except ImageCms.PyCMSError:
            pass
    im = im.convert("RGB")
    im.info = {}
    return im


def still(cls, name, src, fx, fy, zoom):
    im = to_srgb(Image.open(resolve(src)))
    c = crop(im, SHAPE[cls], fx, fy, zoom)
    made = []
    for w in WIDTHS[cls]:
        if w > c.width:                       # the last width is the crop itself, never more
            if made and made[-1][0] >= c.width - 40:
                break
            w = c.width
        r = c.resize((w, round(w / SHAPE[cls])), Image.LANCZOS)
        base = os.path.join(OUT, f"{name}-{w}")
        r.save(base + ".webp", quality=76, method=6)
        r.save(base + ".avif", quality=56, icc_profile=None, exif=b"", xmp=b"")
        made.append((w, r.height))
    return made


def cast_loop():
    """4 Ballies characters, one second each, a slow push-in, hard cuts (the cut is the loop point)."""
    out = os.path.join(ROOT, "media", "loops", "ballies-cast-v")
    W, H, FPS, PER = 540, 960, 25, 25
    shots = [crop(to_srgb(Image.open(resolve(s))), W / H, .5, .5, 1) for s in CAST]
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
                          "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high",
                          "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                          "-movflags", "+faststart", "-an", out + ".mp4"], stdin=subprocess.PIPE)
    for i, s in enumerate(shots):
        for f in range(PER):
            z = 1 - 0.07 * (f / PER)
            fr = crop(s, W / H, .5, .46, z).resize((W, H), Image.LANCZOS)
            if i == 0 and f == 0:
                fr.save(out + ".webp", quality=74, method=6)
            p.stdin.write(fr.tobytes())
    p.stdin.close()
    p.wait()


def figure(cls, name, made, case, label):
    klass = "tile q1" if cls == "q1" else ("tile" if cls == "tile" else f"tile {cls}")
    sz = SIZES[cls]
    av = ", ".join(f"media/wall/{name}-{w}.avif {w}w" for w, _ in made)
    wb = ", ".join(f"media/wall/{name}-{w}.webp {w}w" for w, _ in made)
    w0, h0 = made[0]
    return (f'<figure class="{klass}" data-project="{case}" data-label="{label}"><picture>'
            f'<source type="image/avif" srcset="{av}" sizes="{sz}"><img srcset="{wb}" sizes="{sz}" '
            f'loading="lazy" src="media/wall/{name}-{w0}.webp" alt="" width="{w0}" height="{h0}" '
            f'decoding="async"></picture></figure>')


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    html = []
    for cls, name, src, fx, fy, zoom, case, label in PICKS:
        made = still(cls, name, src, fx, fy, zoom)
        print(f"{name:22} {cls:4} {made}", file=sys.stderr)
        html.append(figure(cls, name, made, case, label))
    cast_loop()
    if "--html" in sys.argv:
        sys.stdout.reconfigure(encoding="utf-8")
        print("\n".join(html))
