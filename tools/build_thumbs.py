"""Thumbnails of the Selected work cards on the home page (index.html, .row__art).

Each card gets a composed picture instead of one cropped frame: the best pieces of the project
fanned out like prints on a table, on a dark ground lit in the project's colour. The card's type
sits over the lower half (css: .row__art::after), so the pieces hang from the top and run off the
bottom, and the middle of the picture carries the strongest piece (narrow cards crop the sides).

Run: python -I tools/build_thumbs.py   ->  media/stills/work-<slug>-{800,1600}.{webp,avif}
"""
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PV = "D:/Desktop/Production Visuals/"
MC = ROOT.replace("\\", "/") + "/media/cases/"
OUT = os.path.join(ROOT, "media", "stills")
SS = 2  # supersampling


def load(src):
    p = src if os.path.isabs(src) else (MC + src if src.startswith(("live-", "ballies/", "series-", "baby-", "fsu-")) else PV + src)
    return Image.open(p).convert("RGB")


def ground(w, h, colour):
    """A dark table with the project's colour as a soft light from the top."""
    r, g, b = (int(colour[i:i + 2], 16) for i in (1, 3, 5))
    base = Image.new("RGB", (w, h), (11, 11, 13))
    glow = Image.new("L", (w // 8, h // 8), 0)
    d = ImageDraw.Draw(glow)
    gw, gh = glow.size
    d.ellipse((gw * 0.1, -gh * 0.75, gw * 0.9, gh * 0.75), fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(gw / 9)).resize((w, h), Image.BICUBIC)
    return Image.composite(Image.new("RGB", (w, h), (r, g, b)), base, glow.point(lambda v: int(v * 0.55)))


def place(canvas, im, cx, cy, height, angle, radius=0.012):
    """Paste a piece centred at (cx, cy) (fractions), `height` of the canvas high, turned by `angle`."""
    W, H = canvas.size
    ph = int(H * height)
    pw = int(ph * im.width / im.height)
    piece = im.resize((pw, ph), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw - 1, ph - 1), radius=int(H * radius), fill=255)
    piece.putalpha(mask)
    piece = piece.rotate(angle, expand=True, resample=Image.BICUBIC)
    x, y = int(W * cx - piece.width / 2), int(H * cy - piece.height / 2)
    # the shadow it throws on the table
    pad = int(H * 0.12)
    sh = Image.new("L", (piece.width + 2 * pad, piece.height + 2 * pad), 0)
    sh.paste(piece.getchannel("A"), (pad, pad))
    sh = sh.filter(ImageFilter.GaussianBlur(H * 0.03)).point(lambda v: int(v * 0.8))
    canvas.paste((0, 0, 0), (x - pad + int(H * 0.012), y - pad + int(H * 0.03)), sh)
    canvas.paste(piece, (x, y), piece)


def fan(canvas, files, height=0.92, top=0.07, step=0.17, turn=6.0, drop=0.035, order=None):
    """Portrait pieces fanned around the middle: the centre one upright and on top."""
    n = len(files)
    mid = (n - 1) / 2
    seq = order or sorted(range(n), key=lambda i: -abs(i - mid))   # the outer ones first, the middle last
    for i in seq:
        o = i - mid
        place(canvas, load(files[i]), 0.5 + o * step, top + height / 2 + drop * o * o, height, -o * turn)


def save(canvas, slug):
    W, H = canvas.size
    big = canvas.resize((W // SS, H // SS), Image.LANCZOS)
    # a little grain keeps the dark ground from banding
    noise = Image.effect_noise(big.size, 9).convert("RGB")
    big = ImageChops.add(big, noise, scale=1, offset=-128) if False else Image.blend(big, ImageChops.overlay(big, noise), 0.06)
    for w in (1600, 800):
        im = big.resize((w, round(big.height * w / big.width)), Image.LANCZOS)
        im.save(os.path.join(OUT, f"work-{slug}-{w}.webp"), quality=84, method=6)
        try:
            im.save(os.path.join(OUT, f"work-{slug}-{w}.avif"), quality=62)
        except Exception as e:   # no avif plugin: the page falls back to webp
            print("avif skipped:", e)
    print(f"work-{slug}", big.size)


B = "BOSQO/"
F = "FSU/"
CARDS = {
    # wide card: three billboards stacked like frames of the same campaign
    "live-on-the-streets": dict(size=(1800, 940), colour="#ff2e63", manual=[
        (PV + "Bilbordi Novembar 2k26/ITHS/SAJT.png", 0.17, 0.27, 0.30, 5),
        (PV + "Bilbordi Novembar 2k26/FSU/FSU META/1200x628.png", 0.83, 0.27, 0.30, -5),
        (PV + "Bilbordi Novembar 2k26/ITS/ITS META/1200x628.png", 0.50, 0.30, 0.40, 0),
    ]),
    "ballies": dict(size=(1500, 940), colour="#3ddc5f", fan=dict(files=[
        "ballies/c03c5db5-1423.webp", "ballies/1501ba48-1423.webp", "ballies/a05bd664-1423.webp", "ballies/9bfca2cc-1423.webp",
        "ballies/909bd414-1080.webp"], order=[0, 4, 1, 3, 2], height=0.54, top=0.06, step=0.2, turn=5, drop=0.02)),
    "on-air": dict(size=(1200, 940), colour="#66eed8", fan=dict(files=[
        B + "UMBRA/02_Posteri/UMBRA_poster_01_first_light.jpg",
        B + "INTERSTELLAR/02_Posteri/INTERSTELLAR_poster_01_gargantua.jpg",
        B + "STRUJA/02_Posteri/STRUJA_poster_01_prvi_takt.jpg",
        B + "HALFCOURT/02_Posteri/HALFCOURT_poster_01_paris.jpg",
        B + "ACCORD/02_Posteri/ACCORD_poster_00_the_chord.jpg"], height=0.56, top=0.06, step=0.215, turn=5, drop=0.02)),
    "fsu-2026": dict(size=(1500, 940), colour="#ffd21f", fan=dict(files=[
        F + "FSU Prostor u nastajanju/Resenje_1_Osnova/FSU_Prostor_u_nastajanju_R1-Poster_A3.tif",
        F + "FSU Tacke susreta/Poster.tif",
        F + "FSU Izlozba GMS Umetnost pokreta i vremena/Poster_A3.tif",
        F + "FSU Samo jedan rad/Posteri/Poster_Zajednicko.tif"], height=0.56, top=0.06, step=0.2, turn=5, drop=0.02)),
    "series-at-scale": dict(size=(1200, 940), colour="#b28cff", fan=dict(files=[
        "ITS/ITS Studijski programi i moduli/Post_03_Nauka_o_podacima_i_VI/meta/1080x1350.png",
        "ITS/ITS Studijski programi i moduli/Post_04_Digitalna_multimedija_OSS/meta/1080x1350.png",
        "ITS/ITS Studijski programi i moduli/Post_02_Razvoj_softvera/meta/1080x1350.png",
        "ITS/ITS Studijski programi i moduli/Post_10_Menadzment_u_e-sportu/meta/1080x1350.png",
        "ITS/ITS Studijski programi i moduli/Post_08_Menadzment_u_IT/meta/1080x1350.png"], height=0.54, top=0.06, step=0.22, turn=5, drop=0.02)),
    "hammerling": dict(size=(1800, 940), colour="#FFB43A", fan=dict(files=[
        "BOSQO/SPEC_UA/HAMMERLING/05_web/still_A_1.2.png",
        "BOSQO/SPEC_UA/HAMMERLING/05_web/still_A_6.png",
        "BOSQO/SPEC_UA/HAMMERLING/05_web/still_C_1.2.png",
        "BOSQO/SPEC_UA/HAMMERLING/05_web/still_A_10.5.png",
        "BOSQO/SPEC_UA/HAMMERLING/05_web/still_B_1.2.png",
        ], height=0.8, top=0.07, step=0.15, turn=5, drop=0.015)),
    "lanternfin": dict(size=(1800, 940), colour="#3EE6FF", fan=dict(files=[
        "BOSQO/SPEC_UA/LANTERNFIN/05_web/still_A_1.2.png",
        "BOSQO/SPEC_UA/LANTERNFIN/05_web/still_A_6.png",
        "BOSQO/SPEC_UA/LANTERNFIN/05_web/still_B_1.2.png",
        "BOSQO/SPEC_UA/LANTERNFIN/05_web/still_A_10.5.png",
        "BOSQO/SPEC_UA/LANTERNFIN/05_web/still_C_1.2.png",
        ], height=0.8, top=0.07, step=0.15, turn=5, drop=0.015)),
    "baby-boo": dict(size=(1800, 940), colour="#ffa53b", fan=dict(files=[
        "baby-boo/d2b2570e-900.webp", "baby-boo/b11c9114-900.webp", "baby-boo/662f78ef-900.webp", "baby-boo/ec7cd41b-900.webp",
        "baby-boo/beef3cd5-1152.webp", "baby-boo/d6feabfa-893.webp", "baby-boo/f064f492-900.webp"],
        height=0.58, top=0.05, step=0.135, turn=4, drop=0.012)),
}


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    for slug, c in CARDS.items():
        if only and slug not in only:
            continue
        w, h = c["size"]
        canvas = ground(w * SS, h * SS, c["colour"])
        if "manual" in c:
            for src, cx, cy, hh, ang in c["manual"]:
                place(canvas, load(src), cx, cy, hh, ang)
        else:
            fan(canvas, **c["fan"])
        save(canvas, slug)


if __name__ == "__main__":
    main()
