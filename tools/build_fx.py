"""Builds the light-weight overlay effects from the Freepik originals in _freepik/.

The originals (1080p video, 2000 px JPG, EPS) never ship. This makes, in media/fx/:
  burn.mp4    red film burn, one shot, for page changes (screen blend)
  static.mp4  short static/line glitch played on a wall tile when the director cuts
  leak.*      red light leak that breathes behind the name
  chrome*.*   liquid chrome that fills the big name in the hero (desktop + a small one for phones)
and writes the viewfinder HUD (corners, battery, REC, focus) inline into index.html,
from _freepik/hud_raw.svg (Illustrator SVG export of the camcorder EPS).

Usage:  python -I tools/build_fx.py
"""
import os
import re
import subprocess

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_freepik")
OUT = os.path.join(ROOT, "media", "fx")
NL = "\n"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(" ".join(cmd) + NL + r.stderr[-1500:])


def video(src, dst, start, length, vf, crf, fps=25):
    run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(length),
         "-i", os.path.join(SRC, src), "-an", "-r", str(fps), "-vf", vf,
         "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
         "-crf", str(crf), "-preset", "slow", "-movflags", "+faststart",
         os.path.join(OUT, dst)])


# grey specks on black, lifted so they read through a screen blend (limited range: black = 16)
NAME_TEX = "2929.jpg"  # Freepik: monochromatic liquid metal waves

LIFT = "lutyuv=y='clip((val-16)*{k}+16,16,235)':u=128:v=128"


def build_videos():
    video("0_Static_Noise_1920x1080.mp4", "static.mp4", 0, 1,
          "scale=640:360:flags=area," + LIFT.format(k=3), crf=30)
    # rise (1.6 s) -> peak (2.6 s) -> fall; soft blobs, so 960 px is plenty
    video("4657664_Red_Overlay_1920x1080.mp4", "burn.mp4", 1.6, 2.2,
          "scale=960:540:flags=area,eq=contrast=1.12:saturation=1.3:gamma=1.1,"
          "fade=t=in:st=0:d=0.2,fade=t=out:st=1.75:d=0.45", crf=28)


def save(im, name, q_webp, q_avif=None):
    im.info = {}
    im.save(os.path.join(OUT, name + ".webp"), quality=q_webp, method=6)
    if q_avif:
        im.save(os.path.join(OUT, name + ".avif"), quality=q_avif, icc_profile=None, exif=b"", xmp=b"")


def build_stills():
    # light leak: the glow sits on the right edge
    leak = Image.open(os.path.join(SRC, "13235.jpg")).convert("RGB")
    save(leak.resize((1280, round(1280 * leak.height / leak.width)), Image.LANCZOS), "leak", 74, 56)

    # liquid chrome for the big name (background-clip: text): grey only, and the blacks lifted
    # so no part of a letter ever sinks into the black page
    tex = ImageOps.autocontrast(Image.open(os.path.join(SRC, NAME_TEX)).convert("L"), cutoff=0.5)
    tex = tex.point(lambda v: 70 + v * 185 // 255).convert("RGB")
    for w, out in ((1400, "chrome"), (720, "chrome-s")):
        save(tex.resize((w, round(w * tex.height / tex.width)), Image.LANCZOS), out, 70, 52)


def short(d):
    """Two decimals are plenty at HUD size."""
    return re.sub(r"(\d+\.\d{2})\d+", r"\1", re.sub(r"\s+", " ", d))


def build_hud():
    """Keep only the viewfinder parts of the camcorder EPS export (drop the checkerboard)."""
    s = open(os.path.join(SRC, "hud_raw.svg"), encoding="utf-8").read()
    s = re.sub(r"<symbol.*?</symbol>", "", s, flags=re.S)
    paths = [short(d) for d in re.findall(r'<path d="([^"]+)"', s)]

    def pick(*starts):
        return [d for d in paths if d.startswith(starts)]

    corner = pick("M90.88,372.38")[0]
    battery = pick("M297.32,201.23")[0]
    bars = re.findall(r'<rect x="([\d.]+)" y="149.51" width="9.74" height="37.42"/>', s)
    rec = pick("M2334.28,", "M2356.86,", "M2407.37,")
    focus = pick("M1496.8,", "M1093.23,", "M1488.22,", "M1140.98,")

    corners = "".join(f'<svg class="hud__c hud__c--{k}"><use href="#hud-corner"/></svg>'
                      for k in ("tl", "tr", "bl", "br"))
    bat = (f'<svg class="hud__bat" viewBox="146 135 160 67"><path d="{battery}"/>'
           + "".join(f'<rect x="{x}" y="149.51" width="9.74" height="37.42"/>' for x in bars)
           + "</svg>")
    lines = [
        '<div class="hud" aria-hidden="true">',
        '  <svg class="hud__defs" width="0" height="0"><symbol id="hud-corner" viewBox="67 40 311 333">'
        f'<path d="{corner}"/></symbol></svg>',
        "  " + corners,
        f'  <span class="hud__tl">{bat}<span class="hud__meta"><b>4K</b> 25P <i></i> ISO 800 <i></i> 1/50 <i></i> F2.8</span></span>',
        '  <svg class="hud__rec" viewBox="2250 158 129 59"><circle class="hud__dot" cx="2279.37" cy="187.67" r="28.45"/>'
        + "".join(f'<path d="{d}"/>' for d in rec) + "</svg>",
        "</div>",
        '<svg class="hud__focus" aria-hidden="true" viewBox="1089 648 408 248">'
        + "".join(f'<path d="{d}"/>' for d in focus) + "</svg>",
    ]
    html = NL.join("      " + ln for ln in lines)

    # the HUD lives inline in index.html (no extra request); replace it between the markers
    idx = os.path.join(ROOT, "index.html")
    page = open(idx, encoding="utf-8").read()
    a, b = "<!-- hud:start -->", "<!-- hud:end -->"
    i, j = page.index(a) + len(a), page.index(b)
    page = page[:i] + NL + html + NL + "      " + page[j:]
    with open(idx, "w", encoding="utf-8", newline="\r\n") as f:  # index.html keeps CRLF
        f.write(page)


def main():
    os.makedirs(OUT, exist_ok=True)
    build_videos()
    build_stills()
    build_hud()
    for n in sorted(os.listdir(OUT)):
        print(f"{n:16s} {os.path.getsize(os.path.join(OUT, n)) / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
