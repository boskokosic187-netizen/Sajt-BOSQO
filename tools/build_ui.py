"""UI/UX prototypes (ui/<slug>/index.html): live concept interfaces shown in the Interfaces
section of the home page, each also a page of its own.

Sources are in tools/ui: one <slug>.html per prototype plus shared.css / shared.js, which are
written into the page where it says <!--@shared.css--> / <!--@shared.js--> (one request per
prototype, nothing to keep in step with the 7-day cache). <!--@file:name--> drops in another
file from tools/ui (an svg). Fonts and pictures live in media/ui; `python tools/build_ui.py
media` makes them again from the brand folders in Production Visuals/BOSQO (only needed when
a source changes: what it writes is committed)."""
import io
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "ui")
BOSQO = "D:/Desktop/Production Visuals/BOSQO"
SLUGS = ["accord", "halfcourt", "tabla", "umbra"]


def read(name):
    return io.open(os.path.join(SRC, name), encoding="utf-8").read()


def build():
    for slug in SLUGS:
        p = os.path.join(SRC, slug + ".html")
        if not os.path.exists(p):
            continue
        s = read(slug + ".html")
        s = s.replace("<!--@shared.css-->", "<style>" + read("shared.css") + "</style>")
        s = s.replace("<!--@shared.js-->", "<script>" + read("shared.js") + "</script>")
        s = re.sub(r"<!--@file:([\w.\-]+)-->", lambda m: read(m.group(1)).strip(), s)
        out = os.path.join(ROOT, "ui", slug)
        os.makedirs(out, exist_ok=True)
        io.open(os.path.join(out, "index.html"), "w", encoding="utf-8", newline="\n").write(s)
        print(f"ui/{slug}/index.html  {len(s.encode('utf-8')) / 1024:.1f} KB")


def media():
    from PIL import Image
    M = os.path.join(ROOT, "media", "ui")
    fonts = {  # official files, unmodified (ITF Free Font License: no subsetting)
        "ACCORD/07_Izvor/accord/fonts/Switzer-Variable.woff2": "Switzer-Variable.woff2",
        "ACCORD/07_Izvor/accord/fonts/Zodiak-Variable.woff2": "Zodiak-Variable.woff2",
        "ACCORD/07_Izvor/accord/fonts/Zodiak-VariableItalic.woff2": "Zodiak-VariableItalic.woff2",
        "HALFCOURT/07_Izvor/fonts/Panchang-Bold.woff2": "Panchang-Bold.woff2",
    }
    for a, b in fonts.items():
        shutil.copyfile(os.path.join(BOSQO, a), os.path.join(M, "fonts", b))
    shutil.copyfile(os.path.join(BOSQO, "HALFCOURT/07_Izvor/fonts/ITF_FFL_2.0.txt"), os.path.join(M, "fonts", "ITF_FFL_2.0.txt"))

    def webp(src, dst, box=None, w=None, q=82):
        im = Image.open(os.path.join(BOSQO, src)).convert("RGB")
        if box:
            im = im.crop(box)
        if w and w < im.width:   # never past the file
            im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(os.path.join(M, dst), "WEBP", quality=q, method=6)
        print(dst, im.size)

    # ACCORD: the three notes out of the posters (the bottle and its ingredient, no poster type), the set, the turntable
    for n, name, x in ((1, "top", 120), (2, "heart", 560), (3, "base", 350)):
        webp(f"ACCORD/02_Posteri/ACCORD_poster_0{n}_{name}.jpg", f"accord/note-{name}.webp", (x, 420, x + 1800, 2820), 1008)
    webp("ACCORD/04_Mockupi/packaging.jpg", "accord/set.webp", None, 1920)
    shutil.copyfile(os.path.join(BOSQO, "ACCORD/06_Web/accord-live/media/spin.webp"), os.path.join(M, "accord", "spin.webp"))
    # TABLA: the billboards it schedules are the real ones (Live on the Streets), small web versions
    for src, name in (("media/cases/live-on-the-streets/6f98249e", "iths"), ("media/cases/live-on-the-streets/c81676d1", "fsu"),
                      ("media/cases/live-on-the-streets/e945b2e5", "its"), ("media/loops/its-future", "future")):
        for ext in (".mp4", ".webp"):
            shutil.copyfile(os.path.join(ROOT, src + ext), os.path.join(M, "tabla", name + ext))
    svg = io.open(os.path.join(BOSQO, "ACCORD/03_Logo/ACCORD_wordmark_transparent.svg"), encoding="utf-8").read()
    svg = re.sub(r' width="\d+" height="\d+"', "", svg).replace('fill="#0D0C10"', 'fill="currentColor"').replace("<svg ", '<svg class="wm" aria-label="ACCORD" role="img" ')
    io.open(os.path.join(SRC, "accord-wordmark.svg"), "w", encoding="utf-8").write(svg)


if __name__ == "__main__":
    if "media" in sys.argv:
        media()
    build()
