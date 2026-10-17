"""Builds web-ready media for the portfolio from original project files.

Video sources -> short muted loops (MP4 H.264 + WebM VP9) + poster frames,
plus 9:16 variants for the mobile feed. Stills -> AVIF + WebP in several widths.
The loop window is picked automatically: the 4 s with the most motion.

Usage:  python -I tools/build_media.py [slug ...]
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

DESK = "D:/Desktop/"
PV = DESK + "Production Visuals/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "media")

# slug, source, loop length (s), forced start (s) or None
VIDEOS = [
    ("its-future", DESK + "ITS/Bilbord Jul/Animacija_1.mp4", 4, None),
    ("fsu-predupis", DESK + "FSU Best/Animacija_1.mp4", 4, None),
    ("fsu-prolecni", DESK + "FSU Best/FSU.mp4", 4, None),
    ("its-diplome", DESK + "ITS/Svecana dodela diploma/1152x640.mp4", 4, None),
    ("its-sah", DESK + "ITS/trofej beograda sah/animacija.mp4", 4, None),
    ("its-maj", DESK + "ITS/Bilbord Maj/ITS ITHS animacija.mp4", 4, None),
    ("its-matematika", DESK + "ITS/Republicko takmicenje iz matematike/1152x640.mp4", 4, None),
    ("its-novogodisnji", DESK + "FSU/Novogodisnji bilbordi/ITS Vizuali/Animacija.mp4", 4, None),
    ("kalendar-fsu", PV + "FSU/Kalendar nastave FSU/kalendar-fsu-2026-2027-1080p.mp4", 4, None),
    ("ballies-strike", DESK + "Ballies Best/strike 1.mp4", 3, None),
    ("fsu-duh", PV + "FSU/FSU_DuhBeograda/video/Video DM.mp4", 4, None),
    ("lisica", PV + "Testovi/Lisica mase/Lisica_mase-1080x1080.mp4", 3, 0),
    ("ballies-ai", DESK + "Ballies Best/9-16.mp4", 4, None),
    ("manuka", PV + "Baby Boo/Manuka Honey Pilot/BabyBoo_ManukaHoney_Pilot-1080x1920.mp4", 4, None),
    ("bb-med", DESK + "Ai Baby Boo/Gotove/med 4.mp4", 4, None),
    ("bb-slon", DESK + "Ai Baby Boo/Slon.mp4", 4, None),
    ("its-reklama", DESK + "ITS/Animirana reklama/Animacija.mp4", 4, None),
]

STILLS = [
    ("car-dusan", PV + "BOSQO/Car Dusan - Carstvo srpsko/04_finale/car_dusan_3840.png"),
    ("bvs", PV + "BOSQO/Batman vs Superman/BvS_Sudar_u_kisi-3840x2160.jpg"),
    ("tacke-susreta", PV + "FSU/FSU Tacke susreta/DM.png"),
    ("fsu-doors", PV + "FSU/FSU Doors/Post_1_Stvaraj_je/FSU_Doors_Post1-1080x1080.png"),
    ("master-kk", PV + "FSU/FSU Master kreativne komunikacije/FSU_Master-kreativne-komunikacije-1080x1080.png"),
    ("graficki", PV + "FSU/FSU Graficki Dizajn/FSU_Graficki_Dizajn_Post1-1080x1080.png"),
    ("ztv", PV + "ZTV Gaming Show/Dresovi 2XL/03_Priprema/PREGLED svih osam.png"),
    ("pogled", PV + "FSU/FSU Pogled iz blizine/DM.png"),
    ("odyssey", DESK + "odyssey_poster_web.jpg"),
    ("ballies-post4", DESK + "Ballies Best/Ball-post-4.png"),
    ("ballies-arena", DESK + "Ballies Best/ballies-arena-AD.png"),
    ("ballies-allstars", DESK + "Ballies Best/all-stars-banner-1920-1080.jpg"),
    ("tri-gracije", DESK + "tri gracije poster.tif"),
    ("shift", DESK + "Poster A3.tif"),
    ("galerija-raste", DESK + "galerija koja raste.tif"),
    ("iths-calories", PV + "ITHS/ITHS Calories Tracker/ITHS_Calories-Tracker_1080x1080.png"),
    ("ai-filmfest", DESK + "poster.tif"),
    ("portrait", ROOT + "/_freepik/about/mojaslika-chatgpt.webp"),   # ChatGPT clean-up of _stari-sajt/assets/mojaslika.webp
    ("sta-radi", PV + "ITS/ITS Sta radi zanimanja/01_Sta_radi_Build-Release_inzenjer/DM.png"),
]
STILL_WIDTHS = (480, 960, 1600)


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(" ".join(cmd) + "\n" + r.stderr[-1500:])
    return r.stdout


def probe(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height:format=duration",
               "-of", "json", path])
    j = json.loads(out)
    s = j["streams"][0]
    return s["width"], s["height"], float(j["format"]["duration"])


def best_window(path, length, dur):
    """Return start time of the `length`-second window with the most motion."""
    if dur <= length + 0.2:
        return 0.0
    fps = 8
    w, h = 96, 54
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf",
         f"fps={fps},scale={w}:{h},format=gray", "-f", "rawvideo", "-"],
        capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8)
    n = len(frames) // (w * h)
    if n < 3:
        return 0.0
    frames = frames[: n * w * h].reshape(n, h, w).astype(np.float32)
    diff = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    bright = frames.mean(axis=(1, 2))[1:]
    # penalise near-black frames (fades) so loops do not start/end in black
    score = diff * (bright > 18)
    win = int(length * fps)
    if len(score) <= win:
        return 0.0
    sums = np.convolve(score, np.ones(win), "valid")
    # skip the very first second (logo stings) and the tail (end cards)
    lo, hi = int(fps * 0.8), len(sums) - int(fps * 0.5)
    if hi <= lo:
        lo, hi = 0, len(sums)
    i = lo + int(np.argmax(sums[lo:hi]))
    return i / fps


def tile_scale(w, h):
    ar = w / h
    if ar > 1.2:
        return "scale=640:-2"
    if ar < 0.8:
        return "scale=360:-2"
    return "scale=480:-2"


VERTICAL_FILL = ("split[a][b];[a]scale=360:640:force_original_aspect_ratio=increase,"
                 "crop=360:640,boxblur=18:2,eq=brightness=-0.18[bg];"
                 "[b]scale=360:640:force_original_aspect_ratio=decrease[fg];"
                 "[bg][fg]overlay=(W-w)/2:(H-h)/2")


def encode(src, start, length, vf, dst_base, crf_x264=30, crf_vp9=40):
    common = ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", str(length),
              "-i", src, "-an", "-r", "25"]
    vfa = ["-vf", vf] if "[" not in vf else ["-filter_complex", vf]
    run(common + vfa + ["-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
                        "-crf", str(crf_x264), "-preset", "slow", "-movflags", "+faststart",
                        dst_base + ".mp4"])
    # H.264 only: at these settings it beat VP9 on size for every clip and plays everywhere
    # poster = first frame of the loop
    run(["ffmpeg", "-v", "error", "-y", "-i", dst_base + ".mp4", "-frames:v", "1",
         dst_base + "_tmp.png"])
    im = Image.open(dst_base + "_tmp.png").convert("RGB")
    im.save(dst_base + ".webp", quality=72, method=6)
    im.save(dst_base + ".avif", quality=55)
    os.remove(dst_base + "_tmp.png")
    return im.size


def build_videos(only, manifest):
    d = os.path.join(OUT, "loops")
    os.makedirs(d, exist_ok=True)
    for slug, src, length, forced in VIDEOS:
        if only and slug not in only:
            continue
        w, h, dur = probe(src)
        start = forced if forced is not None else best_window(src, length, dur)
        length = min(length, max(1.0, dur - start - 0.05))
        busy = slug in ("ballies-strike",)
        size = encode(src, start, length, tile_scale(w, h), os.path.join(d, slug),
                      34 if busy else 30, 46 if busy else 40)
        entry = {"type": "video", "src": src, "start": round(start, 2), "len": length,
                 "w": size[0], "h": size[1]}
        if w / h > 0.8:  # landscape/square also gets a 9:16 version for mobile
            encode(src, start, length, VERTICAL_FILL, os.path.join(d, slug + "-v"),
                   35 if busy else 31, 47 if busy else 42)
        sizes = {ext: os.path.getsize(os.path.join(d, f"{slug}.{ext}")) // 1024
                 for ext in ("mp4", "webp")}
        entry["kb"] = sizes
        manifest[slug] = entry
        print(f"{slug:18s} {w}x{h} {dur:5.1f}s start={start:5.2f} -> {size} {sizes}")


def build_stills(only, manifest):
    d = os.path.join(OUT, "stills")
    os.makedirs(d, exist_ok=True)
    for slug, src in STILLS:
        if only and slug not in only:
            continue
        im = Image.open(src)
        im.draft("RGB", (3200, 3200))
        im = im.convert("RGB")
        im.info = {}
        widths = []
        for w in STILL_WIDTHS:
            if w > im.width * 1.05:      # a source a few % short still makes that width
                continue
            r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
            r.save(os.path.join(d, f"{slug}-{w}.webp"), quality=74, method=6)
            r.save(os.path.join(d, f"{slug}-{w}.avif"), quality=52, icc_profile=None, exif=b"", xmp=b"")
            widths.append(w)
        manifest[slug] = {"type": "still", "src": src, "w": im.width, "h": im.height,
                          "widths": widths}
        print(f"{slug:18s} {im.width}x{im.height} -> {widths}")


def build_mobile_reel():
    """Vertical teaser montage for the mobile hero (720x1280)."""
    d = os.path.join(OUT, "reel")
    os.makedirs(d, exist_ok=True)
    cuts = [  # slug of an already-built loop source, seconds
        ("manuka", 2.2), ("ballies-strike", 1.6), ("its-future", 1.8), ("bb-slon", 1.8),
        ("fsu-duh", 1.8), ("ballies-ai", 1.8), ("its-sah", 1.6), ("bb-med", 1.8),
        ("fsu-predupis", 1.8),
    ]
    src_by = {s: (p, f) for s, p, _l, f in VIDEOS}
    man = json.load(open(os.path.join(OUT, "manifest.json"), encoding="utf-8"))
    parts = []
    fill = VERTICAL_FILL.replace("360:640", "720:1280").replace("boxblur=18:2", "boxblur=30:2")
    for i, (slug, sec) in enumerate(cuts):
        src, _ = src_by[slug]
        start = man[slug]["start"]
        w, h, _d = probe(src)
        # square clips fill the phone (crop); wide billboards sit on a blurred fill
        vf = ("scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280"
              if 0.8 <= w / h <= 1.25 else fill)
        part = os.path.join(d, f"_part{i}.mp4")
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", str(sec), "-i", src,
             "-an", "-r", "25", "-filter_complex", vf + ",setsar=1",
             "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-pix_fmt", "yuv420p", part])
        parts.append(part)
    lst = os.path.join(d, "_list.txt")
    with open(lst, "w") as f:
        for p in parts:
            f.write(f"file '{os.path.basename(p)}'\n")
    joined = os.path.join(d, "_joined.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
         "-c", "copy", joined])
    total = sum(s for _, s in cuts)
    encode(joined, 0, total, "scale=720:1280", os.path.join(d, "mobile-reel"), 31, 42)
    for p in parts + [lst, joined]:
        os.remove(p)
    print("mobile reel", total, "s",
          os.path.getsize(os.path.join(d, "mobile-reel.mp4")) // 1024, "KB")


def main():
    only = set(sys.argv[1:]) - {"reel"}
    mpath = os.path.join(OUT, "manifest.json")
    manifest = {}
    if os.path.exists(mpath):
        manifest = json.load(open(mpath, encoding="utf-8"))
    reel_only = sys.argv[1:] == ["reel"]
    if not reel_only and (not only or only & {s for s, *_ in VIDEOS}):
        build_videos(only, manifest)
    if not reel_only and (not only or only & {s for s, _ in STILLS}):
        build_stills(only, manifest)
    json.dump(manifest, open(mpath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    if not only or "reel" in sys.argv[1:]:
        build_mobile_reel()


if __name__ == "__main__":
    main()
