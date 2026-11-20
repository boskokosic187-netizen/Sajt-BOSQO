"""Builds the Ballies cast loop for wall screen p8 (media/loops/ballies-cast-v.{mp4,webp}).

The wall's still screens are no longer crops of the works: every screen shows its own
ON AIR channel card, made by tools/cards/build_cards.py. crop() and to_srgb() stay here
because the cards tools use them too.

Usage:  python -I tools/build_wall.py
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
SRGB = ImageCms.createProfile("sRGB")
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


if __name__ == "__main__":
    cast_loop()
