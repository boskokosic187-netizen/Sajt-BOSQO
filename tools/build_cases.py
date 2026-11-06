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
import math
import os
import re
import subprocess
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFIX = {
    "PV/": "D:/Desktop/Production Visuals/",
    "D/": "D:/Desktop/",
    "A/": "D:/Arhiva/Desktop 2026-10/Projekti/",
    "S/": ROOT.replace("\\", "/") + "/",
}
IMG_WIDTHS = (800, 1600)
ONLY_PAGES = "--pages" in sys.argv
BUILT = {}   # url -> media info from the last build (media/cases/manifest.json)


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
    url = rel + key
    built_only = ONLY_PAGES or not os.path.exists(src)   # archived originals keep their built media
    if built_only and url in BUILT:   # its size as recorded when it was built
        info = dict(BUILT[url])
    elif item["type"] == "video":
        info = {"type": "video"} if built_only else build_video(src, base, item.get("start", 0), item.get("dur"))
        if built_only:
            pw, ph = Image.open(base + ".webp").size
            info = {"w": pw, "h": ph}
        info["type"] = "video"
    else:
        if built_only:
            ws = sorted(int(f.rsplit("-", 1)[1][:-5]) for f in os.listdir(outdir)
                        if f.startswith(key + "-") and f.endswith(".webp"))
            w0, h0 = Image.open(f"{base}-{ws[0]}.webp").size
            big = ws[-1]
            info = {"w": big, "h": round(h0 * big / w0), "widths": ws}
        else:
            info = build_image(src, base, item.get("matte", False))
        info["type"] = "image"
    info["url"] = url
    info["label"] = item.get("label", "")
    info["matte"] = item.get("matte", False)
    if item.get("cap"):   # where the caption sits when the picture has its own type bottom left
        info["cap"] = item["cap"]
    return info


# ----------------------------------------------------------------- templates
E = lambda s: html.escape(s, quote=True)


def picture(m, sizes, cls="", eager=False, alt=None):
    ws = m["widths"]
    avif = ", ".join(f"{m['url']}-{w}.avif {w}w" for w in ws)
    webp = ", ".join(f"{m['url']}-{w}.webp {w}w" for w in ws)
    h = round(m["h"] * ws[0] / m["w"])
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return (f'<picture><source type="image/avif" srcset="{avif}" sizes="{sizes}">'
            f'<img class="{cls}" src="{m["url"]}-{ws[0]}.webp" srcset="{webp}" sizes="{sizes}" '
            f'width="{ws[0]}" height="{h}" alt="{E(m["label"] if alt is None else alt)}" {load} decoding="async"></picture>')


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


# ------------------------------------------------------------------- blocks
# A case can show its work as full-screen blocks instead of rows: one campaign, carousel or
# series per block, grouped by kind. Each type has its own layout:
#   board    every format of a campaign at its true aspect ratio, together on one screen
#   tracks   carousel slides in rows that move sideways while the block is pinned
#   marquee  a long series in rows that drift on their own
#   cards    a few projects as cards, each cycling through its own formats
BOARD_AR = 2.25   # width / height of the space a board fills on a desktop screen
CARD_CAP = 0.09   # a card's caption, as a share of that height


def block_items(b):
    if b["type"] == "tracks":
        return [x for t in b["tracks"] for x in t["items"]]
    if b["type"] == "cards":
        return [x for c in b["cards"] for x in c["items"]]
    return b["items"]


def all_media(m):
    return (m["hero"] + [i for r in m["rows"] for i in r] + [x for b in m.get("blocks", ()) for x in block_items(b)]
            + list(m.get("breakdown", ())) + [x for k in m.get("craft", ()) for r in k["rows"] for x in r]
            + list(m.get("lab", ())))


def block_media(b, outdir, rel):
    m = {k: v for k, v in b.items() if k not in ("items", "tracks", "cards")}
    if b["type"] == "tracks":
        m["tracks"] = [{"name": t["name"], "items": [media_for(x, outdir, rel) for x in t["items"]]} for t in b["tracks"]]
    elif b["type"] == "cards":
        m["cards"] = [{**c, "items": [media_for(x, outdir, rel) for x in c["items"]]} for c in b["cards"]]
    else:
        m["items"] = [media_for(x, outdir, rel) for x in b["items"]]
    return m


def board_columns(ms):
    """Splits a campaign's formats, kept in order, into columns of 1-4. Items in a column share
    its width, so every format keeps its aspect ratio; the split whose overall shape is closest
    to the stage wins, with nudges against mixing very different shapes in one column
    and against items too small to read.
    The key visual (the first item) gets a column of its own unless it is a wide banner."""
    ars = [m["w"] / m["h"] for m in ms]
    best = [None, None]

    def walk(i, cols):
        if i == len(ars):
            S = [sum(1 / ars[j] for j in c) for c in cols]
            a = sum(1 / x for x in S)
            mix = sum(max(ars[j] for j in c) / min(ars[j] for j in c) - 1 for c in cols)
            # sqrt(area) of every item as a share of the board height: nothing too small to read
            small = sum(max(0, 0.3 - 1 / x / math.sqrt(ars[j])) for c, x in zip(cols, S) for j in c)
            cost = abs(math.log(a / BOARD_AR)) + 0.12 * mix + 3 * small
            if best[0] is None or cost < best[0]:
                best[:] = [cost, [list(c) for c in cols]]
            return
        for k in ((1,) if i == 0 and ars[0] < 1.8 else (1, 2, 3, 4)):
            if i + k <= len(ars):
                cols.append(range(i, i + k))
                walk(i + k, cols)
                cols.pop()

    walk(0, [])
    return best[1]


def tag_of(label):
    """'Post 1 · feed 1:1' -> 'Feed 1:1': the format part of a label."""
    t = label.rsplit(" · ", 1)[-1]
    return t[:1].upper() + t[1:]


def media_btn(m, title, sizes, cls="", tag=None, dup=False):
    """One clickable piece of work. A marquee copy (dup) opens the lightbox at its original."""
    cap = f"{title} · {m['label']}" if m["label"] else title
    k = m["url"].rsplit("/", 1)[1]
    video = m["type"] == "video"
    inner = video_tag(m) if video else picture(m, sizes, alt="" if dup else None)
    t = f'<span class="b-tag" aria-hidden="true">{E(tag)}</span>' if tag else ""
    c = "g-open b-item" + (" is-video" if video else "") + (" g-dup" if dup else "") + (" " + cls if cls else "")
    st = f'style="--ar:{m["w"] / m["h"]:.4f}"'
    if dup:
        return f'<button class="{c}" type="button" tabindex="-1" aria-hidden="true" data-k="{k}" {st}>{inner}{t}</button>'
    data = f'data-video="{m["url"]}.mp4"' if video else f'data-full="{m["url"]}-{m["widths"][-1]}.webp"'
    return (f'<button class="{c}" type="button" {data} data-k="{k}" data-cap="{E(cap)}" '
            f'aria-label="Open — {E(cap)}" {st}>{inner}{t}</button>')


def board_html(b):
    ms = b["items"]
    if b.get("cols"):   # a split set by hand, where the automatic one is not the best picture
        it = iter(range(len(ms)))
        cols = [[next(it) for _ in range(k)] for k in b["cols"]]
    else:
        cols = board_columns(ms)
    S = [sum(ms[j]["h"] / ms[j]["w"] for j in c) for c in cols]   # a column's height per unit of its width
    A = sum(1 / x for x in S)
    B = sum((len(c) - 1) / x for c, x in zip(cols, S))
    out = []
    for c, x in zip(cols, S):
        vw = max(12, round(100 / x / A))
        items = "".join(media_btn(ms[j], b["title"], f"(min-width: 768px) {vw}vw, 70vw", tag=tag_of(ms[j]["label"]))
                        for j in c)
        out.append(f'<div class="board__col" style="--S:{x:.4f};--k1:{len(c) - 1}">{items}</div>')
    return f'<div class="board" style="--A:{A:.4f};--B:{B:.4f};--n1:{len(cols) - 1}">{"".join(out)}</div>'


def tracks_html(b):
    named = b.get("tag") == "label"   # every piece tagged with its label, not a slide number
    rows = []
    for n, t in enumerate(b["tracks"]):
        items = "".join(media_btn(m, b["title"] if named else f'{b["title"]} · {t["name"]}', "(min-width: 768px) 24vw, 60vw",
                                  tag=m["label"] if named else f"{j + 1:02d}")
                        for j, m in enumerate(t["items"]))
        rows.append(f'<div class="track" data-dir="{-1 if n % 2 else 1}">'
                    f'<p class="track__name">{E(t["name"])}<span>{len(t["items"])} {"pieces" if named else "slides"}</span></p>'
                    f'<div class="track__view"><div class="track__run">{items}</div></div></div>')
    return (f'<div class="tracks">{"".join(rows)}'
            f'<div class="tracks__bar" aria-hidden="true"><i></i></div></div>')


def marquee_html(b):
    n = b.get("rows", 3)
    out = []
    for r in range(n):
        row = b["items"][r::n]
        one = "".join(media_btn(m, b["title"], "(min-width: 768px) 16vw, 40vw") for m in row)
        dup = "".join(media_btn(m, b["title"], "(min-width: 768px) 16vw, 40vw", dup=True) for m in row)
        out.append(f'<div class="mq__row"><div class="mq__run" style="--dur:{len(row) * 7}s">{one}{dup}{dup}</div></div>')
    return f'<div class="mq">{"".join(out)}</div>'


def cards_html(b):
    ar, n = b.get("ar", 1), len(b["cards"])

    def size(c):   # card width on a stage of BOARD_AR x 1 with c columns
        r = math.ceil(n / c)
        return min((BOARD_AR - (c - 1) * 0.02) / c, ((1 - (r - 1) * 0.03) / r - CARD_CAP) * ar)

    cols = max(range(1, n + 1), key=size)
    out = []
    for c in b["cards"]:
        many = len(c["items"]) > 1
        frames = "".join(media_btn(m, f'{b["title"]} · {c["title"]}', "(min-width: 768px) 26vw, 46vw",
                                   cls="card__f" + (" is-on" if j == 0 else ""), tag=m["label"] if many else None)
                         for j, m in enumerate(c["items"]))
        out.append(f'<figure class="card"><div class="card__frames">{frames}</div>'
                   f'<figcaption><b>{E(c["title"])}</b><span>{E(c["meta"])}</span></figcaption></figure>')
    fit = " cards--contain" if b.get("fit") == "contain" else ""
    return (f'<div class="cards{fit}" style="--cols:{cols};--rows:{math.ceil(n / cols)};--car:{ar}">'
            f'{"".join(out)}</div>')


def count_of(b):
    if b["type"] == "board":
        return f'{len(b["items"])} formats'
    if b["type"] == "tracks":
        n = sum(len(t["items"]) for t in b["tracks"])
        if b.get("tag") == "label":
            return f"{n} pieces"
        return f'{len(b["tracks"])} carousels · {n} slides' if len(b["tracks"]) > 1 else f"{n} slides"
    if b["type"] == "marquee":
        return f'{len(b["items"])} posts'
    many = any(len(c["items"]) > 1 for c in b["cards"])
    return f'{len(b["cards"])} {"projects" if many else "posts"}'


def blocks_html(blocks):
    """The blocks, and the bar that jumps between kinds."""
    ids, out, kinds = set(), [], {}
    for n, b in enumerate(blocks):
        bid = "w-" + re.sub(r"[^a-z0-9]+", "-", b["title"].lower()).strip("-")
        while bid in ids:
            bid += "-2"
        ids.add(bid)
        kinds.setdefault(b["kind"], [bid, 0])[1] += 1
        body = {"board": board_html, "tracks": tracks_html, "marquee": marquee_html, "cards": cards_html}[b["type"]](b)
        fmts = ""
        if b["type"] == "board":
            tags = list(dict.fromkeys(tag_of(m["label"]) for m in b["items"]))
            fmts = '<ul class="blk__fmts">' + "".join(f"<li>{E(t)}</li>" for t in tags) + "</ul>"
        line = f'<p class="blk__line">{E(b["line"])}</p>' if b.get("line") else ""
        out.append(f"""
        <section class="blk blk--{b['type']}" id="{bid}" data-kind="{E(b['kind'])}" aria-labelledby="{bid}-t">
          <div class="blk__in">
            <header class="blk__head">
              <p class="blk__kick"><span class="blk__n">{n + 1:02d} / {len(blocks):02d}</span><span>{E(b['kind'])}</span><span>{count_of(b)}</span></p>
              <h3 class="blk__title" id="{bid}-t">{E(b['title'])}</h3>
              <div class="blk__about">{line}{fmts}</div>
            </header>
            <div class="blk__stage">{body}</div>
          </div>
          <span class="blk__shade" aria-hidden="true"></span>
        </section>""")
        if b["type"] == "tracks":
            out.append('\n        <div class="blk-run" aria-hidden="true"></div>')
    nav = "".join(f'<a href="#{bid}" data-kind="{E(k)}">{E(k)}<i>{c}</i></a>' for k, (bid, c) in kinds.items())
    return (f'<div class="blocks" data-blocks>{"".join(out)}\n      </div>\n'
            f'      <nav class="chap" aria-label="The work by kind">{nav}</nav>')


TOPBAR = """
  <header class="topbar">
    {MARK}
    <nav class="topnav" aria-label="Main">
      <a href="{R}#work">Work</a>
      <a href="{R}#reel">Reel</a>
      <a href="{R}#process">Process</a>
      <a href="{R}#about">About</a>
      <a class="topnav__cta" href="#contact">Contact</a>
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
  <!-- the cut needs the title and key visual on the first frame -->
  <link rel="expect" href="#cover" blocking="render">
  <script>
    (function (d) {{
      d.classList.add('js');
      try {{
        // opened from another page of the site: the cut carries the top bar (and on a case its
        // title and key visual) over from the page before (css: THE CUT, js/site.js: setupCut)
        var act = window.navigation && navigation.activation;
        if (act && act.from && act.navigationType !== 'reload' && 'onpagereveal' in window) {{
          d.classList.add('vt-in');
          addEventListener('pagereveal', function (e) {{
            if (e.viewTransition) e.viewTransition.finished.then(function () {{ d.classList.remove('vt-in'); }});
            else d.classList.remove('vt-in');
          }});
        }}
      }} catch (e) {{ /* no cut */ }}
    }})(document.documentElement);
  </script>
  <script type="speculationrules">{{"prefetch": [{{"where": {{"href_matches": "/work/*"}}, "eagerness": "moderate"}}]}}</script>
  <script src="{R}js/site.js" defer></script>{extra}
</head>"""

CONTACT = """
    <section class="contact contact--mini" data-lit id="contact" aria-labelledby="contact-title">
      <div class="sec-head"><span class="sec-head__num">●</span><span class="sec-head__label">Contact</span></div>
      <div class="ct">
        <div class="ct__main">
          <div class="ct__mon" data-ct-mon data-base="../../media/loops/" data-loops="interstellar|Interstellar,struja|STRUJA,deadair|DEAD AIR,accord|ACCORD,halfcourt|HALFCOURT,jurassic|Jurassic Park,bigger|BIGGER.,umbra|UMBRA">
            <div class="ct__pix" aria-hidden="true"><img src="../../media/loops/interstellar.webp" alt="" width="960" height="540" loading="lazy" decoding="async"><video muted playsinline preload="none"></video><video muted playsinline preload="none"></video></div>
            <p class="ct__bug" aria-hidden="true"><span class="ct__tally"><i></i>On air</span><span class="ct__now" data-ct-now>Interstellar</span><span class="ct__tc">Belgrade <b data-clock>--:--</b></span></p>
            <div class="ct__lower">
              <h2 class="contact__title" id="contact-title">Got a brief?<br><em>Let’s make it move.</em></h2>
              <p class="contact__sub">Open to full-time roles, remote contracts and freelance projects worldwide.</p>
            </div>
            <span class="ct__run" aria-hidden="true"></span>
          </div>
          <ul class="ct__tiles" aria-label="Reach me directly">
            <li><button class="ct__tile ct__tile--mail card" type="button" data-copy="boskokosic187@gmail.com"><span class="ct__th"><span>Email</span><span class="ct__do"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg><span data-copy-hint>Copy</span></span></span><span class="ct__mail">boskokosic187<span>@gmail.com</span></span></button></li>
            <li><a class="ct__tile ct__tile--call card" href="https://calendly.com/boskokosic187/30min" target="_blank" rel="noopener"><span class="ct__th"><span>Book a call</span><i class="ct__arr" aria-hidden="true">↗</i></span><span class="ct__big">30<small>min</small></span><span class="ct__note">Pick a time that suits you</span></a></li>
            <li><div class="ct__tile ct__tile--soc card"><span class="ct__th"><span>Elsewhere</span></span><span class="ct__soc"><a href="https://www.linkedin.com/in/bo%C5%A1ko-kosi%C4%87-37aa8925a/" target="_blank" rel="noopener">LinkedIn <i aria-hidden="true">↗</i></a><a href="https://www.behance.net/bosko_kosic" target="_blank" rel="noopener">Behance <i aria-hidden="true">↗</i></a><a href="https://www.instagram.com/boskokosic/" target="_blank" rel="noopener">Instagram <i aria-hidden="true">↗</i></a></span></div></li>
          </ul>
        </div>

        <div class="qb card" data-brief>
          <p class="qb__h"><span class="qb__lamp" aria-hidden="true"></span><b>Quick brief</b><span>3 taps · 20 seconds</span></p>
          <dl class="qb__mail">
            <div class="qb__to">
              <dt>To</dt>
              <dd><span class="ct__av" data-av-slot aria-hidden="true"><i class="ct__dot"></i></span><span class="qb__who"><b>Boško Kosić</b><span data-presence>Usually replies within a day</span></span></dd>
            </div>
            <div class="qb__re">
              <dt>Subject</dt>
              <dd><span class="qb__subj is-empty" data-subject>Pick what you need below</span><i class="qb__caret" aria-hidden="true"></i></dd>
            </div>
          </dl>
          <p class="qb__hi">Hi Boško,</p>
          <div class="qb__q" role="group" aria-labelledby="qb-need">
            <p class="qb__n" id="qb-need"><i aria-hidden="true">1</i>I need</p>
            <div class="qb__chips" data-pick="many">
              <button class="qb__chip" type="button" aria-pressed="false">Campaign</button>
              <button class="qb__chip" type="button" aria-pressed="false">Billboards &amp; DOOH</button>
              <button class="qb__chip" type="button" aria-pressed="false">Key art &amp; posters</button>
              <button class="qb__chip" type="button" aria-pressed="false">Motion &amp; animation</button>
              <button class="qb__chip" type="button" aria-pressed="false">Social content</button>
              <button class="qb__chip" type="button" aria-pressed="false">Brand identity</button>
              <button class="qb__chip" type="button" aria-pressed="false">A full-time designer</button>
            </div>
          </div>
          <div class="qb__q" role="group" aria-labelledby="qb-when">
            <p class="qb__n" id="qb-when"><i aria-hidden="true">2</i>Timing</p>
            <div class="qb__chips" data-pick="one">
              <button class="qb__chip" type="button" aria-pressed="false">As soon as possible</button>
              <button class="qb__chip" type="button" aria-pressed="false">In 1–3 months</button>
              <button class="qb__chip" type="button" aria-pressed="false">Just exploring</button>
            </div>
          </div>
          <div class="qb__end">
            <a class="qb__send" href="mailto:boskokosic187@gmail.com?subject=Project%20brief" data-send>
              <span class="qb__go"><i aria-hidden="true">3</i>Send the brief</span>
              <span class="qb__note">Opens your email, ready to send</span>
              <span class="qb__arr" aria-hidden="true">→</span>
            </a>
            <p class="qb__after"><i aria-hidden="true"></i>Then I reply within a day, with questions and first ideas.</p>
          </div>
        </div>
      </div>

      <footer class="foot">
        <span>Designed, animated &amp; coded by Boško Kosić</span>
        <span>Belgrade · © 2026</span>
        <a class="foot__top" href="#">Back to top <i aria-hidden="true">↑</i></a>
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
    cap_cls = lambda m: ' class="is-right"' if m.get("cap") == "right" else ""
    hero_html = "".join(
        f'<figure class="cover__item" style="--ar:{m["w"] / m["h"]:.4f}">'
        + (video_tag(m, eager=True) if m["type"] == "video"
           else picture(m, "100vw" if not trio else "33vw", eager=True))
        + f'<figcaption{cap_cls(m)}>{E(m["label"])}</figcaption></figure>'
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

    if media.get("blocks"):
        work = blocks_html(media["blocks"])
    else:
        rows = "\n        ".join(gallery_row(ms) for ms in media["rows"])
        work = f'<div class="gallery">\n        {rows}\n      </div>'
    hl = "".join(f'<li><span class="hl__a">{E(a)}</span><span class="hl__b">{E(b)}</span></li>'
                 for a, b in c["highlights"])
    note = f'<p class="case-note">{E(c["note"])}</p>' if c.get("note") else ""
    next_bg = f'<img src="{nxt["_next_img"]}" alt="" loading="lazy" decoding="async">'

    return (HEAD.format(title=E(c["title"]), desc=E(c["line"]), og=E(og), R=R, extra="") + f"""
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

    <section class="cover{' is-trio' if trio else ''}" id="cover" aria-label="Key visual">
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
    <section class="case-gallery{' case-gallery--blocks' if media.get('blocks') else ''}" aria-label="The work">
      <div class="sec-head"><span class="sec-head__num">03</span><span class="sec-head__label">The work</span></div>
      {work}
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


# ------------------------------------------------------------- story pages
# A case in the "story" format says less and shows more: the brief and the idea in two
# sentences, then the lab (one interactive piece that does what the project is about, so the
# visitor tries the skill instead of reading about it), then the craft: a few skills, each
# with a few pieces as proof, then the result. js/case.js runs the labs, css/case.css styles
# the page on top of site.css.
def rich(t):
    """Escapes text and turns *word* into the serif italic."""
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", E(t))


def lab_mixer(c, lab, R, media):
    reels = lab["reels"]
    cuts = lab["cuts"]
    k0 = lab.get("start", 0)
    rows = "".join(
        f'<li class="mx__row" data-r="{r}"><span class="mx__k">{E(name)}</span>'
        f'<span class="mx__v" data-v>{E(lab["traits"][k0][r])}</span>'
        f'<span class="mx__from" data-from>#{k0 + 1:02d}</span>'
        f'<button class="mx__lock" type="button" aria-pressed="false" aria-label="Keep this {E(name.lower())}" title="Keep this {E(name.lower())}" data-lock>'
        f'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></button></li>'
        for r, name in enumerate(reels))
    figs = "".join(
        f'<div class="mx__reel" data-reel="{r}" style="--t:{cuts[r]};--h:{cuts[r + 1] - cuts[r]:.4f}">'
        f'<div class="mx__strip"></div>'
        f'<button class="mx__hit" type="button" aria-label="Change the {E(name.lower())}">'
        f'<i aria-hidden="true">{E(name)} ↻</i></button></div>'
        for r, name in enumerate(reels))
    total = lab["n"] ** len(reels)
    data = E(json.dumps(lab["traits"], ensure_ascii=False, separators=(",", ":")))
    return f"""
      <div class="mx" data-lab="mixer" data-base="{R}{lab['base']}" data-n="{lab['n']}" data-start="{k0}" data-traits="{data}">
        <div class="mx__copy">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
          <ol class="mx__rows" aria-live="polite">{rows}</ol>
          <div class="mx__act">
            <button class="mx__spin" type="button" data-spin><span>Spin the reels</span><kbd aria-hidden="true">Space</kbd></button>
            <button class="mx__orig" type="button" data-orig>Show an original</button>
          </div>
          <p class="mx__id"><span data-id-k>Original</span> <b data-id>#{k0 + 1:02d}</b><span class="mx__of">{lab['n']} originals · {total:,} mixes</span></p>
        </div>
        <div class="mx__stage">
          <div class="mx__fig" style="--ar:{lab['ar']}">{figs}</div>
          <span class="mx__floor" aria-hidden="true"></span>
        </div>
      </div>"""


def skyline(seed=7, w=2400, h=120):
    """A city on the horizon: blocks of dark buildings with a few warm windows (inline SVG)."""
    import random
    rnd = random.Random(seed)
    x, rects, wins = 0, [], []
    while x < w:
        bw = rnd.randint(28, 90)
        bh = rnd.randint(18, h - 8) if rnd.random() < 0.85 else rnd.randint(60, h)
        rects.append(f'<rect x="{x}" y="{h - bh}" width="{bw}" height="{bh}"/>')
        for _ in range(rnd.randint(0, 5)):
            wx, wy = x + rnd.randint(3, max(4, bw - 6)), h - bh + rnd.randint(4, max(5, bh - 6))
            wins.append(f'<rect x="{wx}" y="{wy}" width="3" height="2"/>')
        x += bw + rnd.randint(0, 6)
    return (f'<svg class="db__city" viewBox="0 0 {w} {h}" preserveAspectRatio="none" aria-hidden="true">'
            f'<g fill="#07080c">{"".join(rects)}</g><g fill="#ffb36b" opacity="0.55">{"".join(wins)}</g></svg>')


def lab_driveby(c, lab, R, media):
    boards = []
    for b, m in zip(lab["boards"], media["lab"]):
        boards.append({"name": b["name"], "mp4": m["url"] + ".mp4", "poster": m["url"] + ".webp", "at": b.get("at", 0),
                       "pins": b["pins"]})
    data = E(json.dumps(boards, ensure_ascii=False, separators=(",", ":")))
    b0 = boards[0]
    speeds = "".join(f'<button type="button" class="db__opt" data-kmh="{k}" aria-pressed="{str(k == 90).lower()}">{k}<small>km/h</small></button>'
                     for k in (50, 90, 130))
    names = "".join(f'<button type="button" class="db__opt" data-board="{j}" aria-pressed="{str(j == 0).lower()}">{E(b["name"])}</button>'
                    for j, b in enumerate(boards))
    lamps = "".join(f'<span class="db__lamp" style="--side:{side};--k:{k}"><i></i></span>' for side in (-1, 1) for k in range(4))
    return f"""
      <div class="db" data-lab="driveby" data-boards="{data}">
        <div class="db__head">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
        </div>
        <div class="db__stage">
          <div class="db__world" aria-hidden="true">
            <div class="db__sky">{skyline()}</div>
            <div class="db__3d">
              <div class="db__road"><i class="db__lines"></i></div>
              {lamps}
              <div class="db__bb"><div class="db__face"><video muted playsinline loop preload="none" poster="{b0['poster']}"></video></div><i class="db__legs"></i></div>
            </div>
            <span class="db__dash"></span>
          </div>
          <div class="db__hud" aria-hidden="true">
            <span class="db__rec"><i></i>Drive-by</span>
            <span class="db__speedo"><b data-kmh-out>90</b> km/h</span>
            <span class="db__clock">On screen <b data-t>0.0</b> s</span>
          </div>
          <div class="db__read" hidden>
            <div class="db__card"><video muted playsinline loop preload="none"></video><ol class="db__pins" aria-hidden="true"></ol></div>
            <div class="db__legend">
              <p class="db__had">You had <b data-had>0.0</b> seconds.</p>
              <p class="db__order">It was built to be read in this order:</p>
              <ol class="db__list"></ol>
            </div>
          </div>
          <button class="db__start" type="button" data-go><span class="db__play" aria-hidden="true"></span>Drive by</button>
        </div>
        <div class="db__ctrl">
          <div class="db__seg" role="group" aria-label="Speed">{speeds}</div>
          <div class="db__seg" role="group" aria-label="Billboard">{names}</div>
          <button class="mx__spin db__go" type="button" data-go><span>Drive by</span><kbd aria-hidden="true">Space</kbd></button>
        </div>
      </div>"""


def lab_loupe(c, lab, R, media):
    m = media["lab"][0]
    t = lab["tiles"]
    tiles = E(json.dumps({**t, "base": R + t["base"]}, separators=(",", ":")))
    spots = E(json.dumps(lab["spots"], ensure_ascii=False, separators=(",", ":")))
    dots = "".join(f'<button class="lp__dot" type="button" data-spot="{j}" style="--x:{x};--y:{y}" aria-label="{E(n)}"><span>{j + 1}</span></button>'
                   for j, (x, y, n, _) in enumerate(lab["spots"]))
    items = "".join(f'<li><button type="button" class="lp__spot" data-spot="{j}" aria-pressed="{str(j == 0).lower()}"><span>{j + 1:02d}</span>{E(n)}</button></li>'
                    for j, (x, y, n, _) in enumerate(lab["spots"]))
    return f"""
      <div class="lp" data-lab="loupe" data-tiles="{tiles}" data-spots="{spots}">
        <div class="db__head">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
        </div>
        <div class="lp__frame" style="--ar:{m['w'] / m['h']:.4f}">
          {picture(m, "(min-width: 1024px) 94vw, 100vw", "lp__img")}
          {dots}
          <div class="lp__lens" aria-hidden="true"><div class="lp__plane"></div><span class="lp__read"><b>100%</b><span data-xy></span></span></div>
          <span class="lp__hint" aria-hidden="true">Move over the picture</span>
        </div>
        <div class="lp__foot">
          <ol class="lp__list" aria-label="Details">{items}</ol>
          <p class="lp__cap" data-cap aria-live="polite">{E(lab['spots'][0][3])}</p>
        </div>
      </div>"""


def lab_scrub(c, lab, R, media):
    n = lab["n"]
    return f"""
      <div class="sc" data-lab="scrub" data-base="{R}{lab['base']}" data-n="{n}" data-fps="{lab['fps']}">
        <div class="sc__copy">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
          <div class="sc__meter">
            <p class="sc__tc"><span>Frame</span><b data-sctc>00:00:00</b></p>
            <div class="sc__track" aria-hidden="true"><i data-bar></i></div>
            <input class="sc__range" type="range" min="0" max="{n - 1}" value="0" step="1" aria-label="Pour the honey, frame by frame" data-range>
          </div>
          <div class="mx__act">
            <button class="mx__spin" type="button" data-pour><span>Let it pour</span><kbd aria-hidden="true">Space</kbd></button>
            <button class="mx__orig" type="button" data-back>Back to the first drop</button>
          </div>
        </div>
        <div class="sc__stage">
          <div class="sc__frame" style="--ar:{lab['ar']}">
            <img class="sc__poster" src="{R}{lab['base']}000.webp" alt="{E(lab['alt'])}" width="432" height="768" decoding="async">
            <canvas width="432" height="768" aria-hidden="true"></canvas>
            <span class="sc__hint" aria-hidden="true"><i>⟷</i>Drag across the jar</span>
          </div>
        </div>
      </div>"""


def lab_flip(c, lab, R, media):
    n = len(lab["names"])
    names = E(json.dumps(lab["names"], ensure_ascii=False, separators=(",", ":")))
    zones = "".join(
        f'<g class="fl__z" style="--i:{j}"><rect x="{x0 * 100}" y="{y0 * 100}" width="{(x1 - x0) * 100}" height="{(y1 - y0) * 100}" rx="0.6"/>'
        f'<text x="{x0 * 100 + 1.2}" y="{y0 * 100 + 3.6}">{E(t)}</text></g>'
        for j, (x0, y0, x1, y1, t) in enumerate(lab["zones"]))
    m = lab["margin"] * 100
    cols = "".join(f'<line x1="{m + (100 - 2 * m) * k / 12:.2f}" y1="0" x2="{m + (100 - 2 * m) * k / 12:.2f}" y2="100"/>' for k in range(1, 12))
    return f"""
      <div class="sc fl" data-lab="flip" data-base="{R}{lab['base']}" data-n="{n}" data-names="{names}">
        <div class="sc__copy">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
          <div class="fl__now">
            <p class="fl__count"><b data-fl-i>01</b><span>/ {n:02d}</span></p>
            <p class="fl__name" data-fl-name aria-live="polite">{E(lab['names'][0])}</p>
          </div>
          <div class="sc__meter">
            <div class="sc__track" aria-hidden="true"><i data-bar></i></div>
            <input class="sc__range" type="range" min="0" max="{n - 1}" value="0" step="1" aria-label="Flip through the series" data-range>
          </div>
          <div class="mx__act">
            <button class="mx__spin" type="button" data-riffle><span>Riffle through</span><kbd aria-hidden="true">Space</kbd></button>
            <label class="fl__sys"><input type="checkbox" data-sys><span class="fl__sw" aria-hidden="true"></span>Show the system</label>
          </div>
        </div>
        <div class="sc__stage">
          <div class="sc__frame fl__frame" style="--ar:1">
            <img class="sc__poster" src="{R}{lab['base']}00.webp" alt="{E(lab['alt'])}" width="720" height="720" decoding="async">
            <canvas width="720" height="720" aria-hidden="true"></canvas>
            <svg class="fl__grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <g class="fl__cols">{cols}</g>
              <rect class="fl__margin" x="{m}" y="{m}" width="{100 - 2 * m}" height="{100 - 2 * m}"/>
              {zones}
            </svg>
            <span class="sc__hint" aria-hidden="true"><i>⟷</i>Drag across the post</span>
          </div>
        </div>
      </div>"""


def lab_gallery(c, lab, R, media):
    pieces = []
    for j, (it, m) in enumerate(zip(lab["media"], media["lab"])):
        ar = m["w"] / m["h"]
        pieces.append(
            f'<figure class="gw__piece{" is-sq" if ar > 0.85 else ""}" style="--ar:{ar:.4f}" data-i="{j}">'
            f'<span class="gw__light" aria-hidden="true"></span>'
            f'<span class="gw__frame">{picture(m, "(min-width: 768px) 22vw, 50vw", alt=it["title"])}</span>'
            f'<figcaption class="gw__label"><b>{E(it["title"])}</b><span>{E(it["meta"])}</span></figcaption></figure>')
    n = len(pieces)
    return f"""
      <div class="gw" data-lab="gallery" data-n="{n}">
        <div class="db__head">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
        </div>
        <div class="gw__room">
          <div class="gw__track">{"".join(pieces)}</div>
          <span class="gw__floor" aria-hidden="true"></span>
          <span class="sc__hint gw__hint" aria-hidden="true"><i>⟷</i>Drag to walk</span>
        </div>
        <div class="gw__ctrl">
          <button class="gw__btn" type="button" data-step="-1" aria-label="Previous piece">←</button>
          <p class="gw__now" aria-live="polite"><b data-gw-i>01</b><span>/ {n:02d}</span><em data-gw-t>{E(lab['media'][0]['title'])}</em></p>
          <button class="gw__btn" type="button" data-step="1" aria-label="Next piece">→</button>
        </div>
      </div>"""


LABS = {"mixer": lab_mixer, "driveby": lab_driveby, "loupe": lab_loupe, "scrub": lab_scrub, "flip": lab_flip, "gallery": lab_gallery}


def render_story(c, i, cases, media):
    R = "../../"
    n = len(cases)
    nxt = cases[(i + 1) % n]
    num = f"{i + 1:02d}"
    hero = media["hero"]
    h0 = hero[0]
    trio = len(hero) > 1
    cover = "".join(
        f'<figure class="cover__item" style="--ar:{m["w"] / m["h"]:.4f}">'
        + (video_tag(m, eager=True) if m["type"] == "video" else picture(m, "33vw" if trio else "100vw", eager=True))
        + (f'<figcaption>{E(m["label"])}</figcaption>' if m["label"] else "") + '</figure>'
        for m in hero)
    og = h0["url"] + (".webp" if h0["type"] == "video" else f"-{h0['widths'][-1]}.webp")
    meta = (f'<div><dt>Client</dt><dd>{E(c["client"])}</dd></div>'
            f'<div><dt>Year</dt><dd>{E(c["years"])}</dd></div>'
            f'<div><dt>Role</dt><dd>{E(c["role"])}</dd></div>')
    skills = "".join(f"<li>{E(x)}</li>" for x in c["skills"])
    lab = c["lab"]
    lab_html = LABS[lab["type"]](c, lab, R, media)
    craft = []
    for j, k in enumerate(media["craft"]):
        rows = "".join(gallery_row(r) for r in k["rows"])
        craft.append(f"""
      <article class="cr">
        <header class="cr__head">
          <p class="cr__skill"><span>{j + 1:02d}</span>{E(k['skill'])}</p>
          <h3 class="cr__title">{rich(k['title'])}</h3>
          <p class="cr__text">{E(k['text'])}</p>
        </header>
        <div class="cr__media gallery">{rows}</div>
      </article>""")
    note = f'<p class="case-note">{E(c["note"])}</p>' if c.get("note") else ""
    next_bg = f'<img src="{nxt["_next_img"]}" alt="" loading="lazy" decoding="async">'
    extra = f'\n  <link rel="stylesheet" href="{R}css/case.css">\n  <script src="{R}js/case.js" defer></script>'

    return (HEAD.format(title=E(c["title"]), desc=E(c["line"]), og=E(og), R=R, extra=extra) + f"""
<body class="page-case page-story">
  <a class="skip" href="#case-main">Skip to content</a>
  <div class="field" aria-hidden="true"></div>
{TOPBAR.replace("{MARK}", MARK).replace("{R}", R)}

  <main id="case-main">
    <section class="case-hero cs-hero">
      <div class="case-hero__top"><a class="back" href="{R}#work">← All work</a><span>Case {num} / {n:02d}</span></div>
      <p class="eyebrow">{E(c['kicker'])}</p>
      <h1 class="case-title">{E(c['title'])}</h1>
      <div class="cs-hero__sub">
        <p class="case-line">{E(c['line'])}</p>
        <ul class="cs-skills" aria-label="Skills in this project">{skills}</ul>
      </div>
      <dl class="case-meta cs-meta">{meta}</dl>
    </section>

    <section class="cover{' is-trio' if trio else ''}" id="cover" aria-label="Key visual">
      {cover}
    </section>

    <section class="case-story cs-story">
      <div class="story">
        <h2 class="story__label"><span>01</span> The brief</h2>
        <p class="story__text">{E(c['brief'])}</p>
      </div>
      <div class="story">
        <h2 class="story__label"><span>02</span> The idea</h2>
        <p class="story__text">{E(c['idea'])}</p>
      </div>
    </section>

    <section class="cs-lab cs-lab--{lab['type']}" id="lab" aria-labelledby="lab-t">
      <div class="sec-head"><span class="sec-head__num">03</span><span class="sec-head__label">Try it · {E(lab['kicker'])}</span></div>{lab_html}
      <p class="lab__why"><b>Why it matters</b>{E(lab['why'])}</p>
    </section>

    <section class="cs-craft" aria-labelledby="craft-t">
      <div class="sec-head"><span class="sec-head__num">04</span><span class="sec-head__label" id="craft-t">The craft · {len(craft)} skills, shown</span></div>{"".join(craft)}
      {note}
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
    mpath = os.path.join(ROOT, "media", "cases", "manifest.json")
    if os.path.exists(mpath):
        for m in json.load(open(mpath, encoding="utf-8")).values():
            for x in all_media(m):
                BUILT[x["url"]] = x
    allm = {}
    for c in cases:
        slug = c["slug"]
        outdir = os.path.join(ROOT, "media", "cases", slug)
        os.makedirs(outdir, exist_ok=True)
        rel = "../../media/cases/" + slug + "/"
        m = {"hero": [media_for(x, outdir, rel) for x in c["hero"]],
             "rows": [[media_for(x, outdir, rel) for x in row] for row in c.get("rows", [])]}
        if c.get("blocks"):
            m["blocks"] = [block_media(b, outdir, rel) for b in c["blocks"]]
        if c.get("lab", {}).get("media"):   # pictures and films a lab plays with
            m["lab"] = [media_for(x, outdir, rel) for x in c["lab"]["media"]]
        if c.get("craft"):
            m["craft"] = [{**k, "rows": [[media_for(x, outdir, rel) for x in r] for r in k["rows"]]} for k in c["craft"]]
        if c.get("breakdown"):
            b = c["breakdown"]
            m["breakdown"] = (media_for({"src": b["before"], "type": "image", "label": b["before_label"]}, outdir, rel),
                              media_for({"src": b["after"], "type": "image", "label": b["after_label"]}, outdir, rel))
        h0 = m["hero"][0]
        c["_next_img"] = h0["url"] + (".webp" if h0["type"] == "video" else f"-{h0['widths'][0]}.webp")
        allm[slug] = m
        if not ONLY_PAGES:   # drop media of items no longer in the case
            used = {x["url"].rsplit("/", 1)[1] for x in all_media(m)}
            for f in os.listdir(outdir):
                if f.split("-")[0].split(".")[0] not in used:
                    os.remove(os.path.join(outdir, f))
        n_items = len(all_media(m)) - len(m["hero"])
        print(f"{slug:22s} hero={len(m['hero'])} items={n_items}")
    for i, c in enumerate(cases):
        d = os.path.join(ROOT, "work", c["slug"])
        os.makedirs(d, exist_ok=True)
        page = (render_story if c.get("format") == "story" else render_case)(c, i, cases, allm[c["slug"]])
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)

    json.dump(allm, open(mpath, "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
