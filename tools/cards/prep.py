"""Gathers and prepares the sources of the wall cards into _izvori/cards/src (never committed):
cut-outs (rembg, isnet-general-use), FSU posters through their ICC profile, film frames, logos, fonts.
Each step is skipped when its file already exists, so a re-run is cheap.

Usage:  python -I tools/cards/prep.py
"""
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from build_cases import resolve  # noqa: E402
from build_wall import to_srgb  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "_izvori", "cards", "src")
PV = "D:/Desktop/Production Visuals/"
BQ = PV + "BOSQO/"
SCR = "C:/Users/Gigabite/AppData/Local/Temp/claude/9cbc4cc15644e207/640316d7-4668-4496-ba92-a79ab5c73253/scratchpad/thumb/a/"

# FSU posters (the work itself floats on the card)
FSU = {
    "fsu-space": "PV/FSU/FSU Prostor u nastajanju/Resenje_1_Osnova/FSU_Prostor_u_nastajanju_R1-Poster_A3.tif",
    "fsu-hortus": "PV/FSU/FSU Samo jedan rad/Posteri/Poster_Ana-Belosevic-Velican.tif",
    "fsu-meeting": "PV/FSU/FSU Tacke susreta/Poster.tif",
    "fsu-propter": "S/_izvori/fsu/propter-omnia-poster.png",
    "fsu-motion": "PV/FSU/FSU Izlozba GMS Umetnost pokreta i vremena/Poster_A3.tif",
    "fsu-harmony": "PV/FSU/FSU Re-Harmony/DM.png",
    "fsu-closer": "PV/FSU/FSU Pogled iz blizine/Poster.tif",
}
# product cut-outs
CUT = {
    "bb-breakglass": "D/Ai Baby Boo/Break-glass.png",
    "bb-cottonseed": "D/Ai Baby Boo/Gotove/Elephant.png",
    "bb-macadamia": "D/Ai Baby Boo/macadamia.png",
    "bb-carousel": "D/Ai Baby Boo/zirafe.png",
    "bb-claw": "D/Ai Baby Boo/Masina.png",
    "ap-coin": BQ + "APSIS/00_Ulaz/05_coin.webp",
    "ap-trophy": BQ + "APSIS/00_Ulaz/06_trophy.webp",
    "ap-ticket": BQ + "APSIS/00_Ulaz/07_ticket.webp",
    "ap-basket": BQ + "APSIS/00_Ulaz/08_ball_basketball.webp",
    "ap-football": BQ + "APSIS/00_Ulaz/08_ball_football.webp",
    "ap-tennis": BQ + "APSIS/00_Ulaz/08_ball_tennis.webp",
}
# rembg loses navy parts on the navy studio floor: balls get a clean ellipse from the mask's box,
# the trophy keeps only its rings (the plinth melts into the floor). Manuka uses manuka_cut.png
# (the approved cut, made by hand from Manuka.png: white jars on white lose their bottom edge).
FIX = {"ap-basket": "ellipse", "ap-football": "ellipse", "ap-tennis": "ellipse", "ap-trophy": 616}
FRAMES = {   # name: (film, second)
    "struja": (BQ + "STRUJA/01_Film/STRUJA_film_16x9.mp4", 1.2),
    "accord": (BQ + "ACCORD/01_Film/ACCORD_film_16x9.mp4", 1.2),
    "accord-v": (BQ + "ACCORD/01_Film/ACCORD_film_9x16.mp4", 0.6),
}
COPY = {
    "halfcourt-aerial.jpg": BQ + "HALFCOURT/00_Ulaz/ph_court_aerial.jpg",
    "jurassic-keyart.jpg": BQ + "JURASSIC/02_Poster/JURASSIC_keyart_16x9_clean.jpg",
    "bigger.js": BQ + "BIGGER/07_Izvor/engine/bigger.js",
    "anybody-wide.woff": BQ + "INTERSTELLAR/06_Web/interstellar-live/fonts/anybody-wide.woff",
    "struja-logo.svg": BQ + "STRUJA/03_Logo/STRUJA_logo_cyr_transparent.svg",
    "halfcourt-logo.svg": BQ + "HALFCOURT/03_Logo/HALFCOURT_lockup_transparent_ink.svg",
    "umbra-logo.svg": BQ + "UMBRA/03_Logo/UMBRA_logo_transparent.svg",
    "accord-logo.svg": BQ + "ACCORD/03_Logo/ACCORD_wordmark_transparent.svg",
    "bigger-logo.svg": BQ + "BIGGER/03_Logo/BIGGER_wordmark_transparent_light.svg",
    "fsu-logo.svg": PV + "FSU/FSU Direktan upis bez prijemnog/_BRENDING/engine/assets/fsu_logo_beli.svg",
}
SCRATCH = ["apsis-wordmark.svg", "DEADAIR_wordmark_transparent.svg", "apsis_bg.png", "player_m.png",
           "deadair_bg.webp", "manuka_cut.png", "Supreme-Extrabold.woff2", "Supreme-Bold.woff2",
           "Tanker-Regular.woff2", "GeneralSans-Light.woff2", "GeneralSans-Semibold.woff2"] + \
          [f"ballie_{i}.png" for i in range(1, 21) if i != 15]


def out(name):
    return os.path.join(SRC, name)


def fsu():
    for name, src in FSU.items():
        p = out(name + ".jpg")
        if os.path.exists(p):
            continue
        im = to_srgb(Image.open(resolve(src)))
        im.thumbnail((1400, 1400), Image.LANCZOS)
        im.save(p, quality=92)
        print(name, im.size)


def cutouts():
    todo = [(n, s) for n, s in CUT.items() if not os.path.exists(out(n + ".png"))]
    if not todo:
        return
    from rembg import new_session, remove
    sess = new_session("isnet-general-use")
    for name, src in todo:
        im = Image.open(resolve(src)).convert("RGB")
        a = remove(im, session=sess, only_mask=True, post_process_mask=True)
        if FIX.get(name) == "ellipse":
            x0, y0, x1, y1 = a.point(lambda v: 255 if v > 128 else 0).getbbox()
            a = Image.new("L", im.size, 0)
            ImageDraw.Draw(a).ellipse((x0 + 1, y0 + 1, x1 - 2, y1 - 2), fill=255)
        elif isinstance(FIX.get(name), int):
            y = FIX[name] + a.getbbox()[1]
            ImageDraw.Draw(a).rectangle((0, y, im.width, im.height), fill=0)
        a = a.filter(ImageFilter.GaussianBlur(0.6))
        rgba = im.convert("RGBA")
        rgba.putalpha(a)
        rgba = rgba.crop(a.point(lambda v: 255 if v > 8 else 0).getbbox())
        rgba.save(out(name + ".png"))
        print(name, rgba.size)


def frames():
    for name, (film, t) in FRAMES.items():
        p = out(name + ".png")
        if not os.path.exists(p):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", film, "-frames:v", "1", p], check=True)
            print(name, Image.open(p).size)


def copies():
    for name, src in COPY.items():
        if not os.path.exists(out(name)):
            shutil.copy(src, out(name))
    for name in SCRATCH:
        if not os.path.exists(out(name)) and os.path.exists(SCR + name):
            shutil.copy(SCR + name, out(name))
    p = out("interstellar-hole.jpg")
    if not os.path.exists(p):
        im = Image.open(BQ + "INTERSTELLAR/02_Posteri/INTERSTELLAR_poster_01_gargantua.jpg").convert("RGB")
        W, H = im.size
        im.crop((0, int(H * .12), W, int(H * .65))).save(p, quality=93)
    for i in range(6):
        f = f"streets-{i}.png"
        s = SCR.replace("/a/", "/fr/") + f"loop_streets-nov_{i}.png"
        if not os.path.exists(out(f)) and os.path.exists(s):
            shutil.copy(s, out(f))


if __name__ == "__main__":
    os.makedirs(SRC, exist_ok=True)
    copies()
    fsu()
    frames()
    cutouts()
    print("ok", len(os.listdir(SRC)), "files")
