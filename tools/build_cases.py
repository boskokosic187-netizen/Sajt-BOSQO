"""Builds the case-study pages (work/<slug>/index.html) and their media.

Reads content/cases.json, converts every referenced original (PNG/JPG/TIF/MP4)
into web media under media/cases/<slug>/, then renders the HTML pages from the
template below. Media already built (and newer than its source) is skipped.

Usage:  python -I tools/build_cases.py            # media + pages
        python -I tools/build_cases.py --pages    # pages only (fast)
"""
import hashlib
import html
import json
import os
import subprocess
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFIX = {
    "PV/": "D:/Desktop/Production Visuals/",
    "D/": "D:/Desktop/",
    "S/": ROOT.replace("\\", "/") + "/",
}
IMG_WIDTHS = (800, 1600)
ONLY_PAGES = "--pages" in sys.argv


def resolve(src):
    for k, v in PREFIX.items():
        if src.startswith(k):
            return v + src[len(k):]
    return src


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(" ".join(cmd) + "\n" + r.stderr[-1500:])
    return r.stdout


def probe(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=width,height:format=duration", "-of", "json", path])
    j = json.loads(out)
    s = j["streams"][0]
    return s["width"], s["height"], float(j["format"]["duration"])


def fresh(out, src):
    return os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src)


def build_image(src, base, keep_alpha=False):
    """-> dict(w, h, widths). Saves base-<w>.webp/.avif."""
    im = Image.open(src)
    im.draft("RGB", (3400, 3400))
    has_alpha = keep_alpha and (im.mode in ("RGBA", "LA") or "transparency" in im.info)
    im = im.convert("RGBA" if has_alpha else "RGB")
    im.info = {}
    widths = []
    for w in IMG_WIDTHS:
        tw = min(w, im.width)
        if widths and tw == widths[-1]:
            continue
        widths.append(tw)
        out = f"{base}-{tw}.webp"
        if fresh(out, src):
            continue
        r = im if tw == im.width else im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS)
        r.save(out, quality=78, method=6)
        r.save(f"{base}-{tw}.avif", quality=56, icc_profile=None, exif=b"", xmp=b"")
    return {"w": im.width, "h": im.height, "widths": widths}


def build_video(src, base, start=0.0, dur=None):
    w, h, d = probe(src)
    dur = min(dur or 16, d - start)
    ar = w / h
    if ar > 1.25:
        vf = "scale=960:-2"
    elif ar < 0.8:
        vf = "scale=540:-2"
    else:
        vf = "scale=720:-2"
    if not fresh(base + ".mp4", src):
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", src,
             "-an", "-r", "25", "-vf", vf, "-c:v", "libx264", "-profile:v", "high",
             "-pix_fmt", "yuv420p", "-crf", "29", "-preset", "slow", "-movflags", "+faststart",
             base + ".mp4"])
        run(["ffmpeg", "-v", "error", "-y", "-ss", "0.4", "-i", base + ".mp4", "-frames:v", "1", base + "_p.png"])
        p = Image.open(base + "_p.png").convert("RGB")
        p.save(base + ".webp", quality=74, method=6)
        p.save(base + ".avif", quality=54)
        os.remove(base + "_p.png")
    pw, ph = Image.open(base + ".webp").size
    return {"w": pw, "h": ph, "kb": os.path.getsize(base + ".mp4") // 1024}


def media_for(item, outdir, rel):
    src = resolve(item["src"])
    key = hashlib.sha1(item["src"].encode("utf-8")).hexdigest()[:8]
    base = os.path.join(outdir, key)
    if item["type"] == "video":
        info = {"type": "video"} if ONLY_PAGES else build_video(src, base, item.get("start", 0), item.get("dur"))
        if ONLY_PAGES:
            pw, ph = Image.open(base + ".webp").size
            info = {"w": pw, "h": ph}
        info["type"] = "video"
    else:
        if ONLY_PAGES:
            ws = sorted(int(f.rsplit("-", 1)[1][:-5]) for f in os.listdir(outdir)
                        if f.startswith(key + "-") and f.endswith(".webp"))
            w0, h0 = Image.open(f"{base}-{ws[0]}.webp").size
            big = ws[-1]
            info = {"w": big, "h": round(h0 * big / w0), "widths": ws}
        else:
            info = build_image(src, base, item.get("matte", False))
        info["type"] = "image"
    info["url"] = rel + key
    info["label"] = item.get("label", "")
    info["matte"] = item.get("matte", False)
    return info


# ----------------------------------------------------------------- templates
E = lambda s: html.escape(s, quote=True)


def picture(m, sizes, cls="", eager=False):
    ws = m["widths"]
    avif = ", ".join(f"{m['url']}-{w}.avif {w}w" for w in ws)
    webp = ", ".join(f"{m['url']}-{w}.webp {w}w" for w in ws)
    h = round(m["h"] * ws[0] / m["w"])
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<picture><source type="image/avif" srcset="{avif}" sizes="{sizes}">'
            f'<img class="{cls}" src="{m["url"]}-{ws[0]}.webp" srcset="{webp}" sizes="{sizes}" '
            f'width="{ws[0]}" height="{h}" alt="{E(m["label"])}" {load} decoding="async"></picture>')


def video_tag(m, eager=False):
    return (f'<video muted loop playsinline preload="{"auto" if eager else "none"}" data-autoplay '
            f'poster="{m["url"]}.webp" width="{m["w"]}" height="{m["h"]}" '
            f'src="{m["url"]}.mp4" aria-label="{E(m["label"])}"></video>')


def figure(m, sizes, eager=False):
    ar = m["w"] / m["h"]
    if m["type"] == "video":
        inner = video_tag(m, eager)
        data = f'data-video="{m["url"]}.mp4"'
    else:
        inner = picture(m, sizes, eager=eager)
        data = f'data-full="{m["url"]}-{m["widths"][-1]}.webp"'
    cls = "g-item" + (" is-video" if m["type"] == "video" else "") + (" is-matte" if m["matte"] else "")
    return (f'<figure class="{cls}" style="--ar:{ar:.4f}">'
            f'<button class="g-open" type="button" {data} aria-label="Open — {E(m["label"])}">{inner}</button>'
            f'<figcaption>{E(m["label"])}</figcaption></figure>')


def gallery_row(ms):
    tot = sum(m["w"] / m["h"] for m in ms)
    small = all(m["w"] / m["h"] <= 1.25 for m in ms)
    cls = "g-row" + (" is-small" if small and len(ms) > 1 else "")
    figs = "".join(figure(m, f"(min-width: 768px) {max(20, round(100 * (m['w'] / m['h']) / tot))}vw, 100vw")
                   for m in ms)
    return f'<div class="{cls}">{figs}</div>'


TOPBAR = """
  <header class="topbar">
    {MARK}
    <nav class="topnav" aria-label="Main">
      <a href="{R}#work">Work</a>
      <a href="{R}#reel">Reel</a>
      <a href="{R}#process">Process</a>
      <a href="{R}#about">About</a>
      <a href="#contact">Contact</a>
    </nav>
    <a class="status" href="#contact"><i class="status__dot"></i>Available — Q4 2026</a>
    <span class="topbar__tc" data-tc aria-hidden="true">00:00:00:00</span>
  </header>"""

HEAD = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{title} — Boško Kosić</title>
  <meta name="description" content="{desc}">
  <meta name="theme-color" content="#0A0A0B">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{title} — Boško Kosić">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="{R}favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="{R}apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..900&family=Instrument+Serif:ital@1&display=swap">
  <link rel="stylesheet" href="{R}css/site.css">
  <script>document.documentElement.classList.add('js')</script>
  <script src="{R}js/site.js" defer></script>
</head>"""

CONTACT = """
    <section class="contact contact--mini" data-lit id="contact" aria-labelledby="contact-title">
      <div class="sec-head"><span class="sec-head__num">●</span><span class="sec-head__label">Contact</span></div>
      <h2 class="contact__title" id="contact-title">Got a brief?<br><em>Let’s make it move.</em></h2>
      <button class="mail" type="button" data-copy="boskokosic187@gmail.com">
        <span class="mail__addr">boskokosic187@gmail.com</span>
        <span class="mail__hint" data-copy-hint>Click to copy</span>
      </button>
      <ul class="contact__links">
        <li><a href="mailto:boskokosic187@gmail.com">Email</a></li>
        <li><a href="https://calendly.com/boskokosic187/30min" target="_blank" rel="noopener">Book a 30-min call</a></li>
        <li><a href="https://www.linkedin.com/in/bo%C5%A1ko-kosi%C4%87-37aa8925a/" target="_blank" rel="noopener">LinkedIn</a></li>
        <li><a href="https://www.behance.net/bosko_kosic" target="_blank" rel="noopener">Behance</a></li>
      </ul>
      <footer class="foot">
        <span>Designed, animated &amp; coded by Boško Kosić</span>
        <span>Belgrade · © 2026</span>
        <span>Local time <b data-clock>--:--</b> CET</span>
      </footer>
    </section>"""


AVATAR = open(os.path.join(ROOT, "media", "brand", "avatar.svg"), encoding="utf-8").read().strip().replace('role="img" aria-label="Boško Kosić"', 'aria-hidden="true" focusable="false"')
MARK = ('<a class="mark" href="{R}" aria-label="Boško Kosić — home"><span class="mark__av">' + AVATAR +
        '</span><span class="mark__txt"><b>Boško Kosić</b><small>Visual &amp; Motion Designer</small></span></a>')


def render_case(c, i, cases, media):
    R = "../../"
    n = len(cases)
    nxt = cases[(i + 1) % n]
    num = f"{i + 1:02d}"
    hero = media["hero"]
    trio = len(hero) > 1
    hero_html = "".join(
        f'<figure class="cover__item" style="--ar:{m["w"] / m["h"]:.4f}">'
        + (video_tag(m, eager=True) if m["type"] == "video"
           else picture(m, "100vw" if not trio else "33vw", eager=True))
        + f'<figcaption>{E(m["label"])}</figcaption></figure>'
        for m in hero)
    og = (hero[0]["url"] + (".webp" if hero[0]["type"] == "video" else f"-{hero[0]['widths'][-1]}.webp"))

    meta = (f'<div><dt>Client</dt><dd>{E(c["client"])}</dd></div>'
            f'<div><dt>Year</dt><dd>{E(c["years"])}</dd></div>'
            f'<div><dt>Role</dt><dd>{E(c["role"])}</dd></div>'
            f'<div><dt>Deliverables</dt><dd><ul>{"".join(f"<li>{E(d)}</li>" for d in c["deliverables"])}</ul></dd></div>')

    bd = ""
    if media.get("breakdown"):
        b, a = media["breakdown"]
        L = c["breakdown"]
        bd = f"""
    <section class="case-breakdown" aria-label="Breakdown">
      <div class="sec-head"><span class="sec-head__num">↔</span><span class="sec-head__label">Breakdown — drag to compare</span></div>
      <div class="bd" style="--ar:{a['w'] / a['h']:.4f}">
        {picture(a, "100vw", "bd__img")}
        <div class="bd__before">{picture(b, "100vw", "bd__img")}</div>
        <span class="bd__line" aria-hidden="true"></span>
        <span class="bd__label bd__label--l">{E(L['before_label'])}</span>
        <span class="bd__label bd__label--r">{E(L['after_label'])}</span>
        <input class="bd__range" type="range" min="0" max="100" value="50" aria-label="Compare {E(L['before_label'])} and {E(L['after_label'])}">
      </div>
    </section>"""

    rows = "\n        ".join(gallery_row(ms) for ms in media["rows"])
    hl = "".join(f'<li><span class="hl__a">{E(a)}</span><span class="hl__b">{E(b)}</span></li>'
                 for a, b in c["highlights"])
    note = f'<p class="case-note">{E(c["note"])}</p>' if c.get("note") else ""
    next_bg = f'<img src="{nxt["_next_img"]}" alt="" loading="lazy" decoding="async">'

    return (HEAD.format(title=E(c["title"]), desc=E(c["line"]), og=E(og), R=R) + f"""
<body class="page-case">
  <a class="skip" href="#case-main">Skip to content</a>
  <div class="field" aria-hidden="true"></div>
{TOPBAR.replace("{MARK}", MARK).replace("{R}", R)}

  <main id="case-main">
    <section class="case-hero">
      <div class="case-hero__top"><a class="back" href="{R}#work">← All work</a><span>Case {num} / {n:02d}</span></div>
      <p class="eyebrow">{E(c['kicker'])}</p>
      <h1 class="case-title">{E(c['title'])}</h1>
      <p class="case-line">{E(c['line'])}</p>
      <dl class="case-meta">{meta}</dl>
    </section>

    <section class="cover{' is-trio' if trio else ''}" aria-label="Key visual">
      {hero_html}
    </section>

    <section class="case-story">
      <div class="story">
        <h2 class="story__label"><span>01</span> Challenge</h2>
        <p class="story__text">{E(c['challenge'])}</p>
      </div>
      <div class="story">
        <h2 class="story__label"><span>02</span> Idea</h2>
        <p class="story__text">{E(c['idea'])}</p>
      </div>
    </section>
{bd}
    <section class="case-gallery" aria-label="The work">
      <div class="sec-head"><span class="sec-head__num">03</span><span class="sec-head__label">The work</span></div>
      <div class="gallery">
        {rows}
      </div>
      {note}
    </section>

    <section class="case-system">
      <div class="story">
        <h2 class="story__label"><span>04</span> System</h2>
        <p class="story__text">{E(c['system'])}</p>
      </div>
      <ul class="hl">{hl}</ul>
    </section>

    <section class="case-result">
      <div class="sec-head"><span class="sec-head__num">05</span><span class="sec-head__label">Result</span></div>
      <p class="result__big">{E(c['result_big'])}</p>
      <p class="result__label">{E(c['result_label'])}</p>
      <p class="result__text">{E(c['result'])}</p>
    </section>

    <a class="case-next" href="../{nxt['slug']}/">
      <span class="case-next__bg" aria-hidden="true">{next_bg}</span>
      <span class="case-next__label">Next case · {(i + 2 - 1) % n + 1:02d}</span>
      <span class="case-next__title">{E(nxt['title'])}</span>
      <span class="case-next__line">{E(nxt['line'])}</span>
    </a>
{CONTACT}
  </main>

  <dialog class="lightbox" data-lightbox aria-label="Enlarged view">
    <button class="player__close" type="button" data-close aria-label="Close">Close ✕</button>
    <div class="lightbox__frame"></div>
    <p class="lightbox__cap"></p>
  </dialog>
</body>
</html>
""")


def main():
    data = json.load(open(os.path.join(ROOT, "content", "cases.json"), encoding="utf-8"))
    cases = data["cases"]
    allm = {}
    for c in cases:
        slug = c["slug"]
        outdir = os.path.join(ROOT, "media", "cases", slug)
        os.makedirs(outdir, exist_ok=True)
        rel = "../../media/cases/" + slug + "/"
        m = {"hero": [media_for(x, outdir, rel) for x in c["hero"]],
             "rows": [[media_for(x, outdir, rel) for x in row] for row in c["rows"]]}
        if c.get("breakdown"):
            b = c["breakdown"]
            m["breakdown"] = (media_for({"src": b["before"], "type": "image", "label": b["before_label"]}, outdir, rel),
                              media_for({"src": b["after"], "type": "image", "label": b["after_label"]}, outdir, rel))
        h0 = m["hero"][0]
        c["_next_img"] = h0["url"] + (".webp" if h0["type"] == "video" else f"-{h0['widths'][0]}.webp")
        allm[slug] = m
        n_items = sum(len(r) for r in m["rows"])
        print(f"{slug:22s} hero={len(m['hero'])} items={n_items}")
    for i, c in enumerate(cases):
        d = os.path.join(ROOT, "work", c["slug"])
        os.makedirs(d, exist_ok=True)
        page = render_case(c, i, cases, allm[c["slug"]])
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)

    json.dump(allm, open(os.path.join(ROOT, "media", "cases", "manifest.json"), "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
