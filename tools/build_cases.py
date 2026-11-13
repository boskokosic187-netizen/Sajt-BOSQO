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
IMG_WIDTHS = (800, 1600, 2560)   # 2560: a cover on a 2560 px screen; every width stops at the source's own
# a video gets every width of its shape up to its source; the page plays the smallest that covers
# its box (js: pickSrc), so a phone never loads the 2560 one
VIDEO_WIDTHS = {"wide": (960, 1600, 2560), "tall": (540, 1080), "square": (720, 1080)}
ARCHIVE = "D:/Arhiva/Desktop 2026-10/Projekti/"
ONLY_PAGES = "--pages" in sys.argv
BUILT = {}   # url -> media info from the last build (media/cases/manifest.json)


def resolve(src):
    for k, v in PREFIX.items():
        if src.startswith(k):
            p = v + src[len(k):]
            if k == "D/" and not os.path.exists(p) and os.path.exists(ARCHIVE + src[len(k):]):
                return ARCHIVE + src[len(k):]   # a Desktop original moved to the archive (Oct 2026)
            return p
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


def video_widths(w, h):
    ar = w / h
    shape = "wide" if ar > 1.25 else "tall" if ar < 0.8 else "square"
    out = []
    for tw in VIDEO_WIDTHS[shape]:
        tw = min(tw, w) // 2 * 2
        if not out or tw > out[-1]:
            out.append(tw)
    return out


def build_video(src, base, start=0.0, dur=None):
    """base.mp4 at the first width, base-<w>.mp4 for the bigger ones; a poster for the first
    and the biggest (the next-case strip shows the biggest)."""
    w, h, d = probe(src)
    dur = min(dur or 16, d - start)
    widths = video_widths(w, h)
    for j, tw in enumerate(widths):
        name = base + ("" if j == 0 else f"-{tw}")
        if fresh(name + ".mp4", src):
            continue
        crf = "29" if j == 0 else "30"   # a bigger frame hides a little more compression
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", src,
             "-an", "-r", "25", "-vf", f"scale={tw}:-2", "-c:v", "libx264", "-profile:v", "high",
             "-pix_fmt", "yuv420p", "-crf", crf, "-preset", "slow", "-movflags", "+faststart",
             name + ".mp4"])
        if j == 0 or j == len(widths) - 1:
            run(["ffmpeg", "-v", "error", "-y", "-ss", "0.4", "-i", name + ".mp4", "-frames:v", "1", name + "_p.png"])
            p = Image.open(name + "_p.png").convert("RGB")
            p.save(name + ".webp", quality=74, method=6)
            if j == 0:
                p.save(name + ".avif", quality=54)
            os.remove(name + "_p.png")
    pw, ph = Image.open(base + ".webp").size
    return {"w": pw, "h": ph, "kb": os.path.getsize(base + ".mp4") // 1024, "vw": widths,
            "big": [widths[-1], round(widths[-1] * h / w / 2) * 2]}


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
            old = BUILT.get(url, {})
            info = {"w": pw, "h": ph, **{k: old[k] for k in ("vw", "big") if k in old}}
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


def biggest(m):
    """(w, h) of the largest file the page has for this piece: it is never shown bigger."""
    if m["type"] == "video":
        return tuple(m.get("big") or (m["w"], m["h"]))
    w = m["widths"][-1]
    return w, round(m["h"] * w / m["w"])


def video_srcs(m):
    vw = m.get("vw") or [m["w"]]
    return ", ".join(f'{m["url"]}{"" if j == 0 else "-" + str(w)}.mp4 {w}' for j, w in enumerate(vw))


def video_big(m):
    vw = m.get("vw") or [m["w"]]
    return m["url"] + ("" if len(vw) == 1 else "-" + str(vw[-1]))


def cap_style(m):
    w, h = biggest(m)
    return f"max-width:{w}px;max-height:{h}px"


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
    # with more than one width the file is picked for the box it plays in (js: pickSrc)
    src = (f'data-srcs="{video_srcs(m)}" data-poster-big="{video_big(m)}.webp"' if len(m.get("vw") or ()) > 1
           else f'src="{m["url"]}.mp4"')
    return (f'<video muted loop playsinline preload="{"auto" if eager else "none"}" data-autoplay '
            f'poster="{m["url"]}.webp" width="{m["w"]}" height="{m["h"]}" '
            f'{src} aria-label="{E(m["label"])}"></video>')


def figure(m, sizes, eager=False):
    ar = m["w"] / m["h"]
    if m["type"] == "video":
        inner = video_tag(m, eager)
        data = f'data-video="{video_big(m)}.mp4"'
    else:
        inner = picture(m, sizes, eager=eager)
        data = f'data-full="{m["url"]}-{m["widths"][-1]}.webp"'
    cls = "g-item" + (" is-video" if m["type"] == "video" else "") + (" is-matte" if m["matte"] else "")
    return (f'<figure class="{cls}" style="--ar:{ar:.4f}">'
            f'<button class="g-open" type="button" {data} aria-label="Open — {E(m["label"])}">{inner}</button>'
            f'<figcaption>{E(m["label"])}</figcaption></figure>')


def gallery_row(ms, extra=""):
    tot = sum(m["w"] / m["h"] for m in ms)
    small = all(m["w"] / m["h"] <= 1.25 for m in ms)
    cls = "g-row" + (" is-small" if small and len(ms) > 1 else "") + extra
    figs = "".join(figure(m, f"(min-width: 768px) {max(20, round(100 * (m['w'] / m['h']) / tot))}vw, 100vw")
                   for m in ms)
    # the pieces share one height, so the row stops growing when its smallest piece is at 1:1
    top = min(biggest(m)[1] for m in ms)
    cap = f"calc({top * tot:.0f}px + {len(ms) - 1} * var(--gap))"
    return f'<div class="{cls}" style="max-width:{cap}">{figs}</div>'


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
            + list(m.get("lab", ())) + list(m.get("ux", ())))


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


SITE = "https://bosko.trif.rs/"   # share tags need absolute addresses


def og_image(slug, hero):
    """The picture a link to the case shows when it is shared: 1200x630 JPG in media/og/.
    One wide key visual fills it; tall pieces (three films) stand side by side on the site's black."""
    from PIL import Image
    out = os.path.join(ROOT, "media", "og", slug + ".jpg")
    srcs = []
    for m in hero[:3]:
        rel = m["url"] + (".webp" if m["type"] == "video" else f"-{m['widths'][-1]}.webp")
        rel = re.sub(r"^(\.\./)+", "", rel)   # the pages' own "../../" prefix
        srcs.append(os.path.join(ROOT, rel.replace("/", os.sep)))
    if not (os.path.exists(out) and all(os.path.getmtime(out) >= os.path.getmtime(p) for p in srcs)):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        W, H = 1200, 630
        ims = [Image.open(p).convert("RGB") for p in srcs]
        card = Image.new("RGB", (W, H), (10, 10, 11))
        if len(ims) == 1 and ims[0].width / ims[0].height >= 1.2:
            im = ims[0]
            if im.width / im.height > 2.0:   # a billboard: all of it, with a little black above and below
                im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
                card.paste(im, (0, (H - im.height) // 2))
            else:
                k = max(W / im.width, H / im.height)
                im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
                card.paste(im.crop(((im.width - W) // 2, (im.height - H) // 2, (im.width - W) // 2 + W, (im.height - H) // 2 + H)), (0, 0))
        else:
            gap, pad = 14, 28
            h = H - 2 * pad
            ims = [im.resize((round(im.width * h / im.height), h), Image.LANCZOS) for im in ims]
            x = (W - sum(im.width for im in ims) - gap * (len(ims) - 1)) // 2
            for im in ims:
                card.paste(im, (x, pad))
                x += im.width + gap
        card.save(out, quality=88, optimize=True, progressive=True)
    return SITE + "media/og/" + slug + ".jpg"


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
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Boško Kosić">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{title} — Boško Kosić">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{og}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="{og}">
  <link rel="icon" href="{R}favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="{R}apple-touch-icon.png">
  <!-- the fonts live on the site and load ahead of the stylesheet, so the first paint is already in Archivo -->
  <link rel="preload" href="{R}media/fonts/archivo-v25-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="{R}media/fonts/archivo-v25-latin-ext.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="{R}media/fonts/instrument-serif-v5-italic-latin.woff2" as="font" type="font/woff2" crossorigin>
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
          <div class="ct__mon" data-ct-mon data-hd="-1920" data-base="../../media/loops/" data-loops="interstellar|Interstellar,struja|STRUJA,deadair|DEAD AIR,accord|ACCORD,halfcourt|HALFCOURT,jurassic|Jurassic Park,bigger|BIGGER.,umbra|UMBRA">
            <div class="ct__pix" aria-hidden="true"><img src="../../media/loops/interstellar.webp" srcset="../../media/loops/interstellar.webp 960w, ../../media/loops/interstellar-1920.webp 1920w" sizes="(min-width: 2000px) 1500px, 960px" alt="" width="960" height="540" loading="lazy" decoding="async"><video muted playsinline preload="none"></video><video muted playsinline preload="none"></video></div>
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
            <li><div class="ct__tile ct__tile--soc card"><span class="ct__th"><span>Elsewhere</span></span><span class="ct__soc"><a href="https://www.linkedin.com/in/bo%C5%A1ko-kosi%C4%87-37aa8925a/" target="_blank" rel="noopener">LinkedIn <i aria-hidden="true">↗</i></a><a href="../../media/cv/Bosko-Kosic-CV.pdf" download>CV · PDF <i aria-hidden="true">↓</i></a><a href="https://www.instagram.com/boskokosic/" target="_blank" rel="noopener">Instagram <i aria-hidden="true">↗</i></a></span></div></li>
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
        f'<figure class="cover__item" style="--ar:{m["w"] / m["h"]:.4f};{cap_style(m)}">'
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

    return (HEAD.format(title=E(c["title"]), desc=E(c["line"]), og=E(og_image(c["slug"], hero)), url=SITE + "work/" + c["slug"] + "/", R=R, extra="") + f"""
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
      <p class="result__big">{E(c['result_big'])}{result_mascot(c, R)}</p>
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
    """Mix a Ballie: the real trait layers of the collection (media/labs/ballies, rig.json),
    stacked in their order on one card, with a layers panel beside it (top layer first, as in
    an editor). js/case.js swaps layers, spins, explodes the stack; this renders the start
    character so the card is whole before any script runs."""
    rig = json.load(open(os.path.join(ROOT, lab["rig"]), encoding="utf-8"))
    L, W, H = rig["layers"], rig["w"], rig["h"]
    base = R + lab["base"]
    o = next((x for x in rig["originals"] if x[0] == lab.get("start")), rig["originals"][0])
    cur = o[1]
    url = lambda l, k: f'{base}{L[l]["k"]}-{k:02d}.webp'

    def img(l, k, cls=""):
        x, y, w, h = L[l]["items"][k][1]
        return (f'<img{cls} src="{url(l, k)}" alt="" width="{w}" height="{h}" loading="lazy" decoding="async" draggable="false"'
                f' style="left:{x / W * 100:.3f}%;top:{y / H * 100:.3f}%;width:{w / W * 100:.3f}%">')

    layers = "".join(
        f'<div class="mx__layer" data-l="{l}" style="--i:{l}">{img(l, cur[l])}'
        f'<span class="mx__lt" aria-hidden="true"><b>{l + 1:02d}</b>{E(L[l]["label"])}</span></div>'
        for l in range(len(L)))
    lock = ('<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/>'
            '<path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>')
    rows = "".join(
        f'<li class="mx__row" data-l="{l}">'
        f'<button class="mx__pick" type="button" data-pick aria-label="{E(L[l]["label"])}: {E(L[l]["items"][cur[l]][0])}. Next {E(L[l]["label"].lower())}">'
        f'<span class="mx__th"><img src="{url(l, cur[l])}" alt="" loading="lazy" decoding="async" draggable="false"></span>'
        f'<span class="mx__k">{E(L[l]["label"])}</span>'
        f'<span class="mx__v" data-v>{E(L[l]["items"][cur[l]][0])}</span>'
        f'<span class="mx__n" data-n>{cur[l] + 1}/{len(L[l]["items"])}</span></button>'
        f'<button class="mx__lock" type="button" aria-pressed="false" aria-label="Keep this {E(L[l]["label"].lower())}" title="Keep this {E(L[l]["label"].lower())}" data-lock>{lock}</button></li>'
        for l in reversed(range(len(L))))
    n_traits = sum(len(x["items"]) for x in L)
    total = math.prod(len(x["items"]) for x in L)
    data = json.dumps(rig, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f"""
      <div class="mx" data-lab="mixer" data-base="{base}" data-start="{o[0]}">
        <script type="application/json" data-rig>{data}</script>
        <div class="mx__copy">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
          <div class="mx__panel">
            <p class="mx__ph"><span class="mx__pt">Layers</span><span class="mx__pc">{len(L)} layers · {n_traits} traits</span><button class="mx__x" type="button" aria-pressed="false" data-explode><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 5 9-5" opacity=".5"/></svg><span>Explode</span></button></p>
            <ol class="mx__rows" aria-label="Traits, top layer first">{rows}</ol>
          </div>
          <div class="mx__act">
            <button class="mx__spin" type="button" data-spin><span>Spin the reels</span><kbd aria-hidden="true">Space</kbd></button>
            <button class="mx__orig" type="button" data-orig>Show an original</button>
          </div>
          <p class="mx__of">{total:,} possible Ballies · {len(rig['originals'])} originals</p>
        </div>
        <div class="mx__stage">
          <figure class="mx__card">
            <div class="mx__art" style="--ar:{W}/{H}">{layers}</div>
            <figcaption class="mx__cap"><span class="mx__brand"><i aria-hidden="true"></i>Ballies Rookies</span><span class="mx__id is-orig" aria-live="polite"><span data-id-k>Original</span> <b data-id>#{o[0]}</b></span></figcaption>
          </figure>
          <span class="mx__floor" aria-hidden="true"></span>
          <span class="mx__tip" aria-hidden="true"></span>
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
        vw = m.get("vw") or [m["w"]]
        boards.append({"name": b["name"], "mp4": m["url"] + ".mp4", "poster": m["url"] + ".webp", "at": b.get("at", 0),
                       "srcs": [[m["url"] + ("" if j == 0 else f"-{w}") + ".mp4", w] for j, w in enumerate(vw)],
                       "ar": round(m["w"] / m["h"], 4), "pins": b["pins"]})
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


def mascot(a, base, tag="button", extra=""):
    """One rigged animal: groups (body, head, tail, ears, neck, trunk) of the same drawing cut by
    clip-path, each turning on its own joint; outer span idles (css), inner span acts (js)."""
    bx, by, bw, bh = a["box"]

    def imgs(g):
        out = ""
        for im in g.get("imgs", ()):
            x, y, w, h = im["r"]
            clip = f";clip-path:{im['clip']}" if im.get("clip") else ""
            cls = f' class="zo__{im["cls"]}"' if im.get("cls") else ""
            out += (f'<img{cls} src="{base}{im["src"]}" alt="" decoding="async" draggable="false" '
                    f'style="left:{x}%;top:{y}%;width:{w}%;height:{h}%{clip}">')
        for j, (x, y) in enumerate(g.get("dots", ())):
            out += f'<i class="zo__dot" style="left:{x}%;top:{y}%"></i>'
        if g.get("zzz"):
            x, y = g["zzz"]
            out += f'<i class="zo__zzz" style="left:{x}%;top:{y}%"><b>z</b><b>z</b><b>z</b></i>'
        if g.get("tip"):
            x, y = g["tip"]
            out += f'<i class="zo__tip" style="left:{x}%;top:{y}%"></i>'
        if g.get("sub"):
            out += group(g["sub"])
        return out

    def group(g):
        o = g.get("o")
        org = f' style="--ox:{o[0]}%;--oy:{o[1]}%"' if o else ""
        return f'<span class="zo__g zo__g--{g["g"]}"{org}><span class="zo__k">{imgs(g)}</span></span>'

    body = "".join(group(g) for g in a["groups"])
    label = f'{a["name"]}: wake it up'
    btn = f' type="button" aria-label="{E(label)}"' if tag == "button" else ' aria-hidden="true"'
    return (f'<{tag} class="zo__a zo__a--{a["key"]}" data-a="{a["key"]}"{btn}{extra} '
            f'style="--bx:{bx};--by:{by};--bw:{bw};--bh:{bh}">'
            f'<span class="zo__in">{body}</span><span class="zo__shadow"></span></{tag}>')


def lab_mascots(c, lab, R, media):
    rig = json.load(open(os.path.join(ROOT, lab["rig"]), encoding="utf-8"))
    base = R + lab["base"]
    sw, sh = rig["stage"]
    cast = "".join(mascot(a, base) for a in rig["animals"])
    names = "".join(f'<button type="button" class="db__opt" data-wake="{a["key"]}">{E(a["name"])}</button>' for a in rig["animals"])
    parts = E(json.dumps({a["key"]: [a["name"], a["parts"]] for a in rig["animals"]}, separators=(",", ":")))
    floor = rig["floor"] / sh * 100
    # a floor drawn by hand: one wobbly ink line across the stage
    pts = " ".join(f"{x},{rig['floor'] + (2.2 * math.sin(x / 37) + 1.4 * math.sin(x / 11.3)):.1f}" for x in range(0, sw + 1, 25))
    return f"""
      <div class="zo" data-lab="mascots" data-parts="{parts}">
        <div class="db__head">
          <h2 class="lab__title" id="lab-t">{rich(lab['title'])}</h2>
          <p class="lab__line">{E(lab['line'])}</p>
        </div>
        <div class="zo__stage">
          <div class="zo__scroll">
            <div class="zo__cast is-pre" style="--sw:{sw};--sh:{sh};--floor:{floor:.2f}%">
              <svg class="zo__floor" viewBox="0 0 {sw} {sh}" preserveAspectRatio="none" aria-hidden="true"><polyline points="{pts}"/></svg>
              {cast}
              <span class="zo__bubbles" aria-hidden="true"></span>
            </div>
          </div>
          <span class="sc__hint zo__hint" aria-hidden="true"><i>☞</i>Tap a friend</span>
        </div>
        <div class="db__ctrl zo__ctrl">
          <div class="db__seg" role="group" aria-label="Wake one">{names}</div>
          <p class="zo__read" aria-live="polite"><b data-zo-name>Five friends</b><span data-zo-parts>{sum(len(a['parts']) for a in rig['animals'])} parts, one line</span></p>
          <button class="mx__spin db__go" type="button" data-bath><span>Bath time</span><kbd aria-hidden="true">Space</kbd></button>
        </div>
      </div>"""


def result_mascot(c, R):
    """A mascot beside the result number (the koala sleeps through it: no studio day to get up for)."""
    m = c.get("result_mascot")
    if not m:
        return ""
    rig = json.load(open(os.path.join(ROOT, m["rig"]), encoding="utf-8"))
    a = next(x for x in rig["animals"] if x["key"] == m["key"])
    return mascot(a, R + m["base"], tag="span", extra=' data-zo-solo')


LABS = {"mixer": lab_mixer, "driveby": lab_driveby, "loupe": lab_loupe, "scrub": lab_scrub, "flip": lab_flip, "gallery": lab_gallery,
        "mascots": lab_mascots}


def stage_mint(c, R):
    """Ballies key visual, a mint stage instead of a still: a curved wall of 60 Ballies behind
    (the originals among new ones from the same layers), one original big in the middle with
    its ten traits called out, and the next original revealed top to bottom every few seconds.
    Pictures and data: tools/build_ballies_mint.py (media/labs/ballies-mint). js/case.js mints,
    css/case.css builds the room; this renders the first original whole, so the stage stands
    before any script runs."""
    rel = "media/labs/ballies-mint/"
    base = R + rel
    d = json.load(open(os.path.join(ROOT, rel, "mint.json"), encoding="utf-8"))
    L, T = d["layers"], d["tokens"]
    t = T[0]
    cw, ch = d["card"]
    total = math.prod(len(x[2]) for x in L)
    n_traits = sum(len(x[2]) for x in L)

    def trait(l):
        k, label, names = L[l]
        v = t["c"][l]
        return (f'<li class="mint__t" data-t="{l}" style="--k:{v};--n:{len(names)}">'
                f'<span class="mint__k"><b>{l + 1:02d}</b>{E(label)}</span>'
                f'<span class="mint__v" data-v>{E(names[v])}</span>'
                f'<span class="mint__n"><i class="mint__m"></i><span data-n>{v + 1:02d}/{len(names):02d}</span></span></li>')

    left = "".join(trait(l) for l in (5, 4, 3, 0, 7))       # head, eyes, skin, background, ball
    right = "".join(trait(l) for l in (8, 6, 1, 2, 9))      # mouth, extra, jersey, number, arm
    rows = "".join(
        f'<div class="mint__row" style="--r:{r}">' + "".join(
            f'<i class="mint__nft" style="--i:{j};--x:{n % d["cols"]};--y:{n // d["cols"]}"'
            + (f' data-o="{o}" data-s="Original #{o:02d}"' if o else f' data-s="Mint #{(n * 7919 + 1301) % 8000 + 1000}"')
            + '></i>' for j, (n, o) in enumerate(row)) + '</div>'
        for r, row in enumerate(d["wall"]))
    on = ' is-on" aria-current="true'
    ticks = "".join(
        f'<button class="mint__tick{on if j == 0 else ""}" type="button" data-go="{j}" aria-label="Original #{x["id"]:02d}"><i></i></button>'
        for j, x in enumerate(T))
    dna = " ".join(f"{v:02d}" for v in t["c"])
    data = json.dumps({"light": d["light"], "layers": L, "tokens": T}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f"""
    <section class="cover cover--stage" id="cover" aria-label="Key visual: the Ballies originals, minted one by one">
      <div class="mint" data-stage="mint" data-base="{base}" style="--tint:{d['light'][t['c'][0]]};--cols:{d['cols']};--rows:{d['rows']}">
        <script type="application/json" data-mint>{data}</script>
        <style>.mint__nft{{background-image:url("{base}wall.webp")}}</style>
        <div class="mint__space" aria-hidden="true">
          <div class="mint__sky"></div>
          <div class="mint__floor"></div>
          <div class="mint__wall">{rows}</div>
        </div>
        <div class="mint__veil" aria-hidden="true"></div>
        <div class="mint__float">
          <div class="mint__rig">
            <ul class="mint__traits mint__traits--l" aria-label="Traits, left">{left}</ul>
            <button class="mint__card" type="button" aria-label="Mint the next original">
              <span class="mint__frame">
                <img class="mint__bg" src="{base}bg-{t['c'][0]}.webp" alt="" width="{cw}" height="{d['bgh']}" decoding="async" draggable="false">
                <img class="mint__bg is-top" alt="" width="{cw}" height="{d['bgh']}" decoding="async" draggable="false">
                <span class="mint__holo"></span>
              </span>
              <img class="mint__char" src="{base}r-{t['id']:02d}.webp" alt="Ballies original #{t['id']:02d}" width="{cw}" height="{ch}" fetchpriority="high" decoding="async" draggable="false">
              <img class="mint__char is-top" alt="" width="{cw}" height="{ch}" decoding="async" draggable="false">
              <span class="mint__beam"></span>
              <span class="mint__plate"><b>Ballies Rookies</b><span data-id>#{t['id']:02d}</span></span>
            </button>
            <ul class="mint__traits mint__traits--r" aria-label="Traits, right">{right}</ul>
            <svg class="mint__lines" aria-hidden="true"></svg>
          </div>
        </div>
        <div class="mint__hud" aria-hidden="true">
          <span class="mint__corner"></span><span class="mint__corner"></span><span class="mint__corner"></span><span class="mint__corner"></span>
          <p class="mint__tl"><span><i class="mint__rec"></i><b data-state>Live mint</b></span><span class="mint__dim">{len(L)} layers · {n_traits} traits · {len(T)} originals</span></p>
          <p class="mint__tr"><span>Original <b data-id>#{t['id']:02d}</b></span><span class="mint__dim"><span data-pos>01</span> / {len(T):02d}</span></p>
          <p class="mint__bl"><span class="mint__dim">DNA</span><b data-dna>{dna}</b></p>
          <p class="mint__br"><b>{total:,}</b><span class="mint__dim">possible Ballies</span></p>
        </div>
        <div class="mint__ticks" role="group" aria-label="Originals">{ticks}</div>
      </div>
    </section>"""


STAGES = {"mint": stage_mint}


def render_story(c, i, cases, media):
    R = "../../"
    n = len(cases)
    nxt = cases[(i + 1) % n]
    num = f"{i + 1:02d}"
    hero = media["hero"]
    h0 = hero[0]
    trio = len(hero) > 1
    cover = "".join(
        f'<figure class="cover__item" style="--ar:{m["w"] / m["h"]:.4f};{cap_style(m)}">'
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
        # "one_row": a set (one format per school) stays a single row on phones too
        rows = "".join(gallery_row(r, " is-one-row" if k.get("one_row") else "") for r in k["rows"])
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
    next_bg = nxt["_next_bg"]
    extra = f'\n  <link rel="stylesheet" href="{R}css/case.css">\n  <script src="{R}js/case.js" defer></script>'
    # the key visual: a still (or three side by side), or a live stage built for the case;
    # "hero" stays the still for the share image and the next-case strip either way
    stage = (STAGES[c["stage"]](c, R) if c.get("stage") else
             f'    <section class="cover{" is-trio" if trio else ""}" id="cover" aria-label="Key visual">\n      {cover}\n    </section>')

    return (HEAD.format(title=E(c["title"]), desc=E(c["line"]), og=E(og_image(c["slug"], hero)), url=SITE + "work/" + c["slug"] + "/", R=R, extra=extra) + f"""
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

{stage}

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
      <p class="result__big">{E(c['result_big'])}{result_mascot(c, R)}</p>
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


# ------------------------------------------------------------- UX case study
# A case written as a UX study (format "ux"): problem, research, users, flows, wireframe to final,
# system, the exceptions, a test plan and the result. It is reached from the Interfaces section,
# so it does not count among the numbered cases of Selected work.
def _lum(h):
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def ux_svg(path, key):
    """A flow drawn as SVG, inline so its text stays text; its marker id is made unique on the page."""
    s = open(resolve(path), encoding="utf-8").read()
    s = re.sub(r"^<\?xml[^>]*>\s*", "", s.strip())
    return s.replace('id="a"', f'id="{key}-a"').replace("url(#a)", f"url(#{key}-a)")


def ux_wipe(wire, final, sizes):
    w, h = biggest(final)
    return (f'<div class="bd uxc-bd" style="--ar:{final["w"] / final["h"]:.4f};max-width:{w}px">'
            f'{picture(final, sizes, "bd__img")}'
            f'<div class="bd__before">{picture(wire, sizes, "bd__img")}</div>'
            f'<span class="bd__line" aria-hidden="true"></span>'
            f'<span class="bd__label bd__label--l">Wireframe</span><span class="bd__label bd__label--r">Final</span>'
            f'<input class="bd__range" type="range" min="0" max="100" value="50" '
            f'aria-label="Compare the wireframe and the final screen: {E(final["label"])}"></div>')


def render_ux(c, cases, media):
    R = "../../"
    nxt = cases[0]
    U = {x["id"]: x for x in media["ux"]}
    hero = media["hero"]
    h0 = hero[0]
    cover = (f'<figure class="cover__item" style="--ar:{h0["w"] / h0["h"]:.4f};{cap_style(h0)}">'
             f'{picture(h0, "100vw", eager=True)}<figcaption>{E(h0["label"])}</figcaption></figure>')
    meta = "".join(f"<div><dt>{E(k)}</dt><dd>{E(v)}</dd></div>" for k, v in c["meta"])
    skills = "".join(f"<li>{E(x)}</li>" for x in c["skills"])
    proto = R + c["prototype"]

    def head(n, label, id_=None):
        i = f' id="{id_}"' if id_ else ""
        return f'<div class="sec-head"><span class="sec-head__num">{n:02d}</span><span class="sec-head__label"{i}>{E(label)}</span></div>'

    p = c["problem"]
    measures = "".join(f'<li><b>{E(a)}</b><span>{E(b)}</span></li>' for a, b in p["measures"])
    rs = c["research"]
    insights = "".join(
        f'<article class="uxc-card{" is-assume" if x["tag"] == "Assumption" else ""}">'
        f'<p class="uxc-tag">{E(x["tag"])}</p><h3>{E(x["title"])}</h3><p>{E(x["text"])}</p></article>'
        for x in rs["insights"])
    ps = c["personas"]
    personas = "".join(
        f'<article class="uxc-card uxc-persona"><p class="uxc-tag">Proto-persona · assumption</p>'
        f'<h3>{E(x["name"])}</h3><blockquote>{E(x["job"])}</blockquote>'
        f'<p><b>Needs</b>{E(x["needs"])}</p></article>' for x in ps["items"])

    screens = []
    for j, s in enumerate(c["screens"]):
        dw, df = (U[k] for k in s["desk"])
        pw, pf = (U[k] for k in s["phone"])
        why = "".join(f"<li>{E(x)}</li>" for x in s["why"])
        screens.append(f"""
      <article class="cr uxc-scr">
        <header class="cr__head">
          <p class="cr__skill"><span>{j + 1:02d}</span>{E(s['skill'])}</p>
          <h3 class="cr__title">{rich(s['title'])}</h3>
          <p class="cr__text">{E(s['text'])}</p>
          <div class="uxc-why"><b>Why</b><ul>{why}</ul></div>
        </header>
        <div class="uxc-pair">
          <div class="uxc-pair__d" style="--ar:{df['w'] / df['h']:.4f}">{ux_wipe(dw, df, "(min-width: 1024px) 44vw, 100vw")}<p class="uxc-cap">Desktop · drag to compare</p></div>
          <div class="uxc-pair__m" style="--ar:{pf['w'] / pf['h']:.4f}">{ux_wipe(pw, pf, "(min-width: 1024px) 14vw, 62vw")}<p class="uxc-cap">Phone</p></div>
        </div>
      </article>""")

    sy = c["system"]
    swatches = "".join(
        f'<li><span class="uxc-sw" style="background:{hx}"></span><b>{E(nm)}</b><code>{hx}</code><small>{E(role)}</small></li>'
        for nm, hx, role in sy["colors"])
    col = {nm: hx for nm, hx, _ in sy["colors"]}
    pairs = [("Text", "Night"), ("Muted", "Surface"), ("Pick", "Night"), ("Live", "Night"), ("Up", "Surface"), ("Down", "Surface")]
    ink = "#1A0420"
    rows = []
    for fg, bg in pairs:
        r = contrast(col[fg], col[bg])
        grade = "AAA" if r >= 7 else "AA" if r >= 4.5 else "AA large" if r >= 3 else "fails"
        rows.append(f'<li><span class="uxc-aa" style="color:{col[fg]};background:{col[bg]}">1.85</span>'
                    f'<span>{fg} on {bg}</span><b>{r:.1f} : 1</b><em>{grade}</em></li>')
    r = contrast(ink, col["Pick"])
    rows.append(f'<li><span class="uxc-aa" style="color:{ink};background:{col["Pick"]}">1.85</span>'
                f'<span>Ink on Pick (selected)</span><b>{r:.1f} : 1</b><em>{"AAA" if r >= 7 else "AA"}</em></li>')
    odds = [("", "1", "1.85", "Default"), ("sel", "1", "1.85", "Selected"), ("up", "X", "2.10", "Went up"),
            ("dn", "2", "1.67", "Went down"), ("sus", "1", "1.92", "Suspended")]
    odds_html = "".join(f'<li><span class="uxc-od{" " + k if k else ""}"><small>{a}</small><b>{b}</b></span><p>{E(t)}</p></li>'
                        for k, a, b, t in odds)

    rp = c["responsible"]
    resp = []
    for x in rp["items"]:
        m = U[x["id"]]
        resp.append(f'<figure class="uxc-rp" style="--ar:{m["w"] / m["h"]:.4f}">'
                    f'<button class="g-open" type="button" data-full="{m["url"]}-{m["widths"][-1]}.webp" '
                    f'data-cap="{E(x["title"])}" aria-label="Open — {E(x["title"])}">'
                    f'{picture(m, "(min-width: 1024px) 15vw, (min-width: 768px) 30vw, 46vw")}</button>'
                    f'<figcaption><b>{E(x["title"])}</b>{E(x["text"])}</figcaption></figure>')
    t = c["test"]
    tasks = "".join(f'<tr><td>{j + 1:02d}</td><td>{E(a)}</td><td>{E(b)}</td></tr>' for j, (a, b) in enumerate(t["tasks"]))
    mocks = gallery_row([U[k] for k in c["result"]["mocks"]])
    diff = "".join(f'<div class="story"><h3 class="story__label"><span>{j + 1:02d}</span> Next time</h3><p class="story__text">{E(x)}</p></div>'
                   for j, x in enumerate(c["differently"]))
    extra = f'\n  <link rel="stylesheet" href="{R}css/case.css">\n  <script src="{R}js/case.js" defer></script>'
    og = og_image(c["slug"], [U[c["og"]]])

    return (HEAD.format(title=E(c["title"]) + " — UX case study", desc=E(c["line"]), og=E(og), url=SITE + "work/" + c["slug"] + "/", R=R, extra=extra) + f"""
<body class="page-case page-story page-ux">
  <a class="skip" href="#case-main">Skip to content</a>
  <div class="field" aria-hidden="true"></div>
{TOPBAR.replace("{MARK}", MARK).replace("{R}", R)}

  <main id="case-main">
    <section class="case-hero cs-hero uxc-hero">
      <div class="case-hero__top"><a class="back" href="{R}#interfaces">← Interfaces</a><span>UX case study</span></div>
      <p class="eyebrow">{E(c['kicker'])}</p>
      <h1 class="case-title">{E(c['title'])}</h1>
      <div class="cs-hero__sub">
        <p class="case-line">{E(c['line'])}</p>
        <ul class="cs-skills" aria-label="Skills in this project">{skills}</ul>
      </div>
      <div class="uxc-cta">
        <a class="btn btn--rec" href="{proto}">Try the prototype <span aria-hidden="true">→</span></a>
        <p class="uxc-disc">{E(c['disclaimer'])}</p>
      </div>
      <dl class="case-meta cs-meta uxc-meta">{meta}</dl>
    </section>

    <section class="cover" id="cover" aria-label="Key visual">
      {cover}
    </section>

    <section class="uxc-sec" aria-labelledby="ux1">
      {head(1, "Problem & goal", "ux1")}
      <div class="uxc-pg">
        <div><h2 class="uxc-k">Who</h2><p>{E(p['who'])}</p></div>
        <div><h2 class="uxc-k">Today</h2><p>{E(p['today'])}</p></div>
        <div class="uxc-goal"><h2 class="uxc-k">Goal</h2><p>{E(p['goal'])}</p></div>
      </div>
      <ul class="uxc-measures" aria-label="Measures">{measures}</ul>
      <p class="case-note">{E(p['measures_note'])}</p>
    </section>

    <section class="uxc-sec" aria-labelledby="ux2">
      {head(2, "Research · what was really done", "ux2")}
      <p class="uxc-lead">{E(rs['note'])}</p>
      <div class="uxc-grid uxc-grid--2">{insights}</div>
    </section>

    <section class="uxc-sec" aria-labelledby="ux3">
      {head(3, "Users · jobs to be done", "ux3")}
      <p class="case-note">{E(ps['note'])}</p>
      <div class="uxc-grid uxc-grid--3">{personas}</div>
    </section>

    <section class="uxc-sec" aria-labelledby="ux4">
      {head(4, "Flow & information architecture", "ux4")}
      <div class="uxc-fl">
        <div class="uxc-fl__t"><h3>{E(c['flow']['title'])}</h3><p>{E(c['flow']['text'])}</p></div>
        <div class="uxc-svg" tabindex="0" role="group" aria-label="Bet flow diagram, scrolls sideways on small screens">{ux_svg(c['flow']['svg'], 'flow')}</div>
      </div>
      <div class="uxc-fl">
        <div class="uxc-fl__t"><h3>{E(c['ia']['title'])}</h3><p>{E(c['ia']['text'])}</p></div>
        <div class="uxc-svg" tabindex="0" role="group" aria-label="Information architecture diagram, scrolls sideways on small screens">{ux_svg(c['ia']['svg'], 'ia')}</div>
      </div>
    </section>

    <section class="cs-craft uxc-screens" aria-labelledby="ux5">
      {head(5, "Wireframe → final · three key screens", "ux5")}{"".join(screens)}
    </section>

    <section class="uxc-sec" aria-labelledby="ux6">
      {head(6, "Design system", "ux6")}
      <p class="uxc-lead">{E(sy['text'])}</p>
      <div class="uxc-ds">
        <div class="uxc-ds__col">
          <h3 class="uxc-k">Colour tokens</h3>
          <ul class="uxc-sws">{swatches}</ul>
        </div>
        <div class="uxc-ds__col">
          <h3 class="uxc-k">Type</h3>
          <div class="uxc-spec">
            <p class="uxc-spec__a">Odds that stay put</p>
            <p class="uxc-spec__n"><span>Nippo</span> titles · <span>Satoshi</span> interface and numbers</p>
            <p class="uxc-spec__b">1.85 &nbsp;2.10 &nbsp;1.67 &nbsp;11.11 &nbsp;38.00 / 100.00</p>
            <p class="uxc-spec__n">Tabular figures: odds line up and never shift when they change</p>
          </div>
          <h3 class="uxc-k">Odds button · the main component</h3>
          <ul class="uxc-odds" aria-label="Odds button states">{odds_html}</ul>
          <p class="uxc-note2">52 px tall, the whole cell is the target. {E(sy['motion'])}</p>
        </div>
        <div class="uxc-ds__col">
          <h3 class="uxc-k">Contrast, measured (WCAG 2.2)</h3>
          <ul class="uxc-ctr">{"".join(rows)}</ul>
        </div>
      </div>
    </section>

    <section class="uxc-sec" aria-labelledby="ux7">
      {head(7, "Responsible play · the exceptions", "ux7")}
      <p class="uxc-lead">{E(rp['text'])}</p>
      <div class="uxc-rps gallery">{"".join(resp)}</div>
    </section>

    <section class="uxc-sec" aria-labelledby="ux8">
      {head(8, "What I'd test next", "ux8")}
      <p class="uxc-lead">{E(t['text'])}</p>
      <div class="uxc-tbl" tabindex="0" role="group" aria-label="Test tasks">
        <table><thead><tr><th>#</th><th>Task</th><th>Pass when</th></tr></thead><tbody>{tasks}</tbody></table>
      </div>
      <p class="case-note">A plan, not results: no test has been run yet</p>
    </section>

    <section class="case-result uxc-result" aria-labelledby="ux9">
      {head(9, "Result", "ux9")}
      <a class="uxc-try" href="{proto}">Try the prototype <span aria-hidden="true">→</span></a>
      <p class="result__text">{E(c['result']['text'])}</p>
      <div class="gallery uxc-mocks">{mocks}</div>
      <p class="case-note">{E(c['disclaimer'])}</p>
    </section>

    <section class="case-story cs-story uxc-diff" aria-labelledby="ux10">
      <div class="uxc-diff__h">{head(10, "What I'd do differently", "ux10")}</div>{diff}
    </section>

    <a class="case-next" href="../{nxt['slug']}/">
      <span class="case-next__bg" aria-hidden="true">{nxt['_next_bg']}</span>
      <span class="case-next__label">Selected work · 01</span>
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
        if c.get("ux"):   # a UX study's screens, wireframes and mockups, picked by id
            m["ux"] = [{**media_for(x, outdir, rel), "id": x["id"]} for x in c["ux"]]
        if c.get("breakdown"):
            b = c["breakdown"]
            m["breakdown"] = (media_for({"src": b["before"], "type": "image", "label": b["before_label"]}, outdir, rel),
                              media_for({"src": b["after"], "type": "image", "label": b["after_label"]}, outdir, rel))
        h0 = m["hero"][0]
        c["_next_img"] = h0["url"] + (".webp" if h0["type"] == "video" else f"-{h0['widths'][0]}.webp")
        # the next-case strip: the biggest picture there is, never past its own size (css: .case-next__bg)
        bw, bh = biggest(h0)
        cap = f' style="--mw:{bw}px;--mh:{bh}px"'
        if h0["type"] == "video":
            c["_next_bg"] = f'<img src="{video_big(h0)}.webp" alt=""{cap} loading="lazy" decoding="async">'
        else:
            ws, u = h0["widths"], h0["url"]
            c["_next_bg"] = (f'<img src="{u}-{ws[0]}.webp" srcset="{", ".join(f"{u}-{w}.webp {w}w" for w in ws)}" '
                             f'sizes="100vw" alt=""{cap} loading="lazy" decoding="async">')
        allm[slug] = m
        if not ONLY_PAGES:   # drop media of items no longer in the case
            used = {x["url"].rsplit("/", 1)[1] for x in all_media(m)}
            for f in os.listdir(outdir):
                if f.split("-")[0].split(".")[0] not in used:
                    os.remove(os.path.join(outdir, f))
        n_items = len(all_media(m)) - len(m["hero"])
        print(f"{slug:22s} hero={len(m['hero'])} items={n_items}")
    nonux = [c for c in cases if c.get("format") != "ux"]   # the numbered cases of Selected work
    for c in cases:
        d = os.path.join(ROOT, "work", c["slug"])
        os.makedirs(d, exist_ok=True)
        if c.get("format") == "ux":
            page = render_ux(c, nonux, allm[c["slug"]])
        else:
            page = (render_story if c.get("format") == "story" else render_case)(c, nonux.index(c), nonux, allm[c["slug"]])
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page)

    json.dump(allm, open(mpath, "w", encoding="utf-8"),
              indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
