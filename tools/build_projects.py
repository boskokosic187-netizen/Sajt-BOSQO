"""Builds the projects that open in place from the home wall.

Reads content/projects.json. For every project it encodes the monitors' media into
media/projects/<slug>/, renders one 16:9 preview frame per monitor (exactly what the program
monitor will show: a single piece, or a grid for a set), copies the project's own pages
(e.g. a live demo) and writes a <template data-proj="<slug>"> into index.html between
<!-- projects:start --> and <!-- projects:end -->. A template is inert, so nothing in it
loads until the visitor opens the project (js: setupHome → projects).

Monitor types: loop (the wall's own loop from media/loops, so the screen carries on in the
monitor), video, film (plays once, with sound and controls), image, set (a grid of videos
and images, "cols"), live (a page of the project in an iframe, "href" + "thumb").
Options: "w" video width, "dur"/"start" seconds, "poster_at" seconds for the poster frame, "crf" for
fine detail that smears at the default (28 film, 29 video).

Usage:  python -I tools/build_projects.py
        python -I tools/build_projects.py --check PV/BOSQO/<IME>/06_Web/projects.<slug>.json
        (reads only: checks a handed-over project before it is pasted into content/projects.json)
"""
import hashlib
import html
import json
import math
import os
import re
import shutil
import subprocess
import sys

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREFIX = {"PV/": "D:/Desktop/Production Visuals/", "D/": "D:/Desktop/", "S/": ROOT.replace("\\", "/") + "/"}
IMG_WIDTHS = (480, 960, 1600)
THUMB = (480, 270)
E = lambda s: html.escape(str(s), quote=True)


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
    j = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height:format=duration", "-of", "json", path]))
    return j["streams"][0]["width"], j["streams"][0]["height"], float(j["format"]["duration"])


def fresh(out, src):
    return os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src)


def key(item):
    o = {k: item[k] for k in ("w", "dur", "start", "poster_at", "type", "crf") if k in item}
    return hashlib.sha1((item["src"] + json.dumps(o, sort_keys=True)).encode("utf-8")).hexdigest()[:8]


def video(item, outdir, rel):
    """MP4 (H.264; a film keeps its sound) + a poster frame. -> dict for the page."""
    src = resolve(item["src"])
    base = os.path.join(outdir, key(item))
    w, h, d = probe(src)
    start = item.get("start", 0)
    dur = min(item.get("dur", 16), d - start)
    width = item.get("w") or (960 if w / h > 1.25 else 540 if w / h < 0.8 else 720)
    film = item["type"] == "film"
    if not fresh(base + ".mp4", src):
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", src]
            + (["-c:a", "aac", "-b:a", "128k"] if film else ["-an"])
            + ["-r", "25", "-vf", f"scale={width}:-2", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
               "-crf", str(item.get("crf", 28 if film else 29)), "-preset", "slow", "-movflags", "+faststart", base + ".mp4"])
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{item.get('poster_at', 0.4):.2f}", "-i", base + ".mp4",
             "-frames:v", "1", base + "_p.png"])
        p = Image.open(base + "_p.png").convert("RGB")
        p.save(base + ".webp", quality=76, method=6)
        os.remove(base + "_p.png")
    pw, ph = Image.open(base + ".webp").size
    return {"kind": "film" if film else "video", "src": rel + key(item) + ".mp4", "poster": rel + key(item) + ".webp",
            "w": pw, "h": ph, "_frame": base + ".webp", "_kb": os.path.getsize(base + ".mp4") // 1024}


def image(item, outdir, rel):
    src = resolve(item["src"])
    k = key(item)
    im = Image.open(src)
    im.draft("RGB", (3400, 3400))
    im = im.convert("RGB")
    im.info = {}
    widths = []
    for w in IMG_WIDTHS:
        tw = min(w, im.width)
        if widths and tw == widths[-1]:
            continue
        widths.append(tw)
        out = os.path.join(outdir, f"{k}-{tw}.webp")
        if not fresh(out, src):
            r = im if tw == im.width else im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS)
            r.save(out, quality=80, method=6)
    return {"kind": "image", "src": f"{rel}{k}-{widths[-1]}.webp",
            "srcset": ", ".join(f"{rel}{k}-{w}.webp {w}w" for w in widths), "w": im.width, "h": im.height,
            "_frame": os.path.join(outdir, f"{k}-{widths[-1]}.webp")}


# ------------------------------------------------------------ preview frames
def fit(im, box, cover):
    bw, bh = box
    s = (max if cover else min)(bw / im.width, bh / im.height)
    r = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    if cover:
        x, y = (r.width - bw) // 2, (r.height - bh) // 2
        return r.crop((x, y, x + bw, y + bh)), (0, 0)
    return r, ((bw - r.width) // 2, (bh - r.height) // 2)


def preview(mon, parts, out):
    """The monitor's 16:9 frame, laid out like the program monitor will show it (css: .mv__set)."""
    W, H = THUMB
    c = Image.new("RGB", (W, H), (5, 5, 6))
    frames = [Image.open(p["_frame"]).convert("RGB") for p in parts]
    if mon["type"] != "set":
        im = frames[0]
        r, at = fit(im, (W, H), im.width / im.height > 1.6)
        c.paste(r, at)
    else:
        cols = mon.get("cols", 2)
        rows = math.ceil(len(frames) / cols)
        pad, gap = round(W * 0.025), round(W * 0.012)
        cw = (W - 2 * pad - (cols - 1) * gap) / cols
        ch = (H - 2 * pad - (rows - 1) * gap) / rows
        ars = [im.width / im.height for im in frames]
        if max(ars) / min(ars) < 1.02:  # one shape: the cells hug the pieces (css: .mv__set.is-fit)
            cw = min(cw, ch * ars[0])
            ch = cw / ars[0]
        top = pad + (H - 2 * pad - (rows * ch + (rows - 1) * gap)) / 2
        for i, im in enumerate(frames):
            row, col = divmod(i, cols)
            n_in_row = min(cols, len(frames) - row * cols)
            x0 = pad + (W - 2 * pad - (n_in_row * cw + (n_in_row - 1) * gap)) / 2 + col * (cw + gap)
            y0 = top + row * (ch + gap)
            r, at = fit(im, (round(cw), round(ch)), False)
            c.paste(r, (round(x0) + at[0], round(y0) + at[1]))
    c.save(out, quality=78, method=6)


# ------------------------------------------------------------------- page
def piece(item, outdir, rel):
    if item["type"] in ("video", "film"):
        return video(item, outdir, rel)
    if item["type"] == "image":
        return image(item, outdir, rel)
    raise ValueError(item["type"])


def monitor(mon, outdir, rel):
    """-> (data for js, parts for the preview frame)"""
    t = mon["type"]
    if t == "loop":
        lp = os.path.join(ROOT, "media", "loops", mon["loop"])
        w, h = Image.open(lp + ".webp").size
        d = {"kind": "loop", "src": f"media/loops/{mon['loop']}.mp4", "poster": f"media/loops/{mon['loop']}.webp", "w": w, "h": h}
        parts = [{"_frame": lp + ".webp"}]
    elif t == "live":
        th = image({"type": "image", "src": mon["thumb"]}, outdir, rel)
        # the page itself, not its folder: opened from disk (file://) a folder shows as a listing
        href = mon["href"] + ("index.html" if mon["href"].endswith("/") else "")
        d = {"kind": "live", "src": href, "poster": th["src"]}
        parts = [th]
    elif t == "set":
        items = [piece(x, outdir, rel) for x in mon["items"]]
        d = {"kind": "set", "cols": mon.get("cols", 2), "items": [{k: v for k, v in x.items() if not k.startswith("_")} for x in items]}
        parts = items
    else:
        p = piece(mon, outdir, rel)
        d = {k: v for k, v in p.items() if not k.startswith("_")}
        parts = [p]
    d["label"] = mon["label"]
    d["fit"] = "cover" if t in ("loop", "live") or (t != "set" and d.get("w", 16) / d.get("h", 9) > 1.6) else "contain"
    return d, parts


def render(p, mons, thumbs):
    slug = p["slug"]
    m0 = mons[0]
    first = (f'<img src="{m0["poster"]}" alt="" width="{m0.get("w", 960)}" height="{m0.get("h", 540)}" decoding="async">'
             if m0.get("poster") else "")
    pvw = "".join(
        f'<button class="mv__mon" type="button" style="--i:{i}" data-cut="{i + 1}" aria-pressed="{"true" if i == 0 else "false"}" '
        f'aria-label="{E(m["label"])}"><img src="{thumbs[i]}" alt="" width="{THUMB[0]}" height="{THUMB[1]}" decoding="async">'
        f'<span class="mv__name"><b>{i + 1}</b>{E(mon["umd"])}</span>{"<i class=mv__live>Live</i>" if mon["type"] == "live" else ""}</button>'
        for i, (m, mon) in enumerate(zip(mons, p["monitors"])))
    def cta_btn(j, c):
        # the way into the live page is the loud one (orange); the first is the film
        live = p["monitors"][c["cut"] - 1]["type"] == "live"
        cls, icon = (("btn--live", '<span class="btn__dot" aria-hidden="true"></span>') if live else
                     ("btn--rec", '<span class="btn__play" aria-hidden="true"></span>') if j == 0 else ("btn--ghost", ""))
        return (f'<button class="btn {cls}" type="button" data-cut="{c["cut"]}">{icon}{E(c["label"])}'
                + (f' <span class="btn__meta">{E(c["meta"])}</span>' if c.get("meta") else "") + "</button>")
    cta = "".join(cta_btn(j, c) for j, c in enumerate(p.get("cta", [])))
    facts = "".join(f'<li><b>{E(a)}</b><span>{E(b)}</span></li>' for a, b in p.get("facts", []))
    data = json.dumps(mons, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f"""      <template data-proj="{slug}">
        <div class="proj" style="--accent:{E(p.get('accent', '#ff4d1f'))};--n:{len(mons)};--tl:{len(p['title'])}" role="region" aria-label="{E(p['title'])} — the project" tabindex="-1">
          <div class="proj__in">
            <header class="proj__head">
              <p class="proj__kick"><span class="proj__air"><i></i>On air</span><span>{E(p['kicker'])}</span></p>
              <p class="proj__keys" aria-hidden="true"><kbd>1</kbd>–<kbd>{len(mons)}</kbd> cut <kbd>Esc</kbd> back to the wall</p>
              <button class="proj__close" type="button" data-proj-close>Close<span aria-hidden="true">✕</span></button>
            </header>
            <figure class="proj__pgm">
              <div class="mv__screen is-{mons[0]['fit']}" data-screen>{first}</div>
              <figcaption class="mv__umd"><span class="mv__tally">PGM</span><span data-umd>{E(mons[0]['label'])}</span></figcaption>
            </figure>
            <div class="proj__info">
              <h2 class="proj__title">{E(p['title'])}</h2>
              <p class="proj__line">{E(p['line'])}</p>
              <div class="proj__cta">{cta}</div>
              <p class="proj__idea">{E(p['idea'])}</p>
              <ul class="proj__facts">{facts}</ul>
              <p class="proj__role"><span>Role</span>{E(p['role'])}</p>
              <p class="proj__note">{E(p.get('note', ''))}</p>
            </div>
            <div class="proj__pvw" role="group" aria-label="Every format: pick one to put it on program">{pvw}</div>
          </div>
          <script type="application/json" data-mons>{data}</script>
        </div>
      </template>"""


def main():
    data = json.load(open(os.path.join(ROOT, "content", "projects.json"), encoding="utf-8"))
    blocks = []
    for p in data["projects"]:
        slug = p["slug"]
        outdir = os.path.join(ROOT, "media", "projects", slug)
        os.makedirs(outdir, exist_ok=True)
        rel = f"media/projects/{slug}/"
        for a, b in p.get("copy", []):
            shutil.copytree(resolve(a), os.path.join(ROOT, b), dirs_exist_ok=True)
        mons, thumbs = [], []
        for mon in p["monitors"]:
            d, parts = monitor(mon, outdir, rel)
            tk = hashlib.sha1(json.dumps(mon, sort_keys=True).encode("utf-8")).hexdigest()[:8]
            preview(mon, parts, os.path.join(outdir, f"t-{tk}.webp"))
            mons.append(d)
            thumbs.append(f"{rel}t-{tk}.webp")
            kb = sum(x.get("_kb", 0) for x in parts)
            print(f"{slug:10s} {mon['umd']:16s} {mon['type']:6s} {kb:6d} KB video")
        blocks.append(render(p, mons, thumbs))
        # nothing left over from earlier builds
        keep = {os.path.basename(t) for t in thumbs}
        keep |= {os.path.basename(x) for m in mons for x in _files(m)}
        for f in os.listdir(outdir):
            if f not in keep:
                os.remove(os.path.join(outdir, f))

    ip = os.path.join(ROOT, "index.html")
    s = open(ip, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in s else "\n"
    s = s.replace("\r\n", "\n")
    a, b = "      <!-- projects:start -->\n", "      <!-- projects:end -->\n"
    if a not in s:
        at = s.index('      <div class="bar" aria-hidden="true">')
        s = s[:at] + a + b + "\n" + s[at:]
    i, j = s.index(a) + len(a), s.index(b)
    s = s[:i] + "\n".join(blocks) + "\n" + s[j:]
    open(ip, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
    print("index.html: projects", [p["slug"] for p in data["projects"]])


def _files(m):
    """File names a monitor's data points to (for the clean-up)."""
    out = []
    for it in m.get("items", [m]):
        for k in ("src", "poster"):
            if it.get(k, "").startswith("media/projects/"):
                out.append(it[k])
        for part in it.get("srcset", "").split(","):
            if part.strip():
                out.append(part.strip().split(" ")[0])
    return out


# ------------------------------------------------------------------ check
TYPES = ("loop", "live", "film", "video", "image", "set")


def check(path):
    """A project handed over from its own session (06_Web/projects.<slug>.json): the same object as an
    entry in content/projects.json plus "wall" (the two loop masters and the tiles' labels). Reads only."""
    p = json.load(open(resolve(path), encoding="utf-8"))
    errs, warns = [], []
    err, warn = errs.append, warns.append

    def streams(src):
        j = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration",
                            "-of", "json", src]))
        v = [x for x in j["streams"] if x["codec_type"] == "video"]
        a = [x for x in j["streams"] if x["codec_type"] == "audio"]
        return (v[0]["width"], v[0]["height"]) if v else (0, 0), float(j["format"].get("duration", 0)), bool(a)

    def exists(src, what):
        if not src:
            err(f"{what}: no path")
            return None
        if not src.startswith(("PV/", "S/")):
            warn(f"{what}: use the PV/ prefix, not {src[:40]}")
        f = resolve(src)
        if not os.path.isfile(f):
            err(f"{what}: missing {src}")
            return None
        return f

    for k in ("slug", "title", "kicker", "accent", "line", "idea", "role", "facts", "cta", "note", "monitors", "wall"):
        if not p.get(k):
            err(f"missing \"{k}\"")
    slug = p.get("slug", "")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
        err(f"slug \"{slug}\": lowercase letters, digits and hyphens only")
    have = [x["slug"] for x in json.load(open(os.path.join(ROOT, "content", "projects.json"), encoding="utf-8"))["projects"]]
    if slug in have:
        warn(f"slug \"{slug}\" is already on the site: it will replace it")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", p.get("accent", "")):
        err("accent: #rrggbb")
    for k, n in (("line", 25), ("idea", 70)):
        if len(p.get(k, "").split()) > n:
            warn(f"{k}: {len(p[k].split())} words (≤ {n})")
    if len(p.get("facts", [])) != 4 or any(len(f) != 2 for f in p.get("facts", [])):
        err("facts: exactly 4 pairs [short, explanation]")

    w = p.get("wall", {})
    for k, ar, minw in (("loop", 16 / 9, 1920), ("loop_v", 9 / 16, 1080)):
        f = exists(w.get(k), f"wall.{k}")
        if f:
            (vw, vh), d, _ = streams(f)
            if abs(d - 4.0) > 0.08:
                err(f"wall.{k}: {d:.2f} s, the loop must be exactly 4.0 s")
            if abs(vw / max(vh, 1) - ar) > 0.02 or vw < minw:
                err(f"wall.{k}: {vw}×{vh}, needs {'1920×1080' if ar > 1 else '1080×1920'}")
    for k in ("label", "label_v"):
        if not w.get(k):
            err(f"wall.{k}: the tile's label, e.g. \"{p.get('title', 'NAME')} · living identity\"")

    # an identity carries every format; a fan poster and a cartoon are lighter on purpose
    fmt = p.get("format", "identity")
    lo, hi = {"identity": (8, 9), "poster": (5, 6), "cartoon": (4, 6)}.get(fmt, (0, 0))
    if not hi:
        err(f"format \"{fmt}\": identity, poster or cartoon")
    mons = p.get("monitors", [])
    if hi and not lo <= len(mons) <= hi:
        warn(f"{len(mons)} monitors ({lo}–{hi} for a {fmt})")
    if mons and (mons[0].get("type") != "loop" or mons[0].get("loop") != slug):
        err(f"monitor 1 must be {{\"type\": \"loop\", \"loop\": \"{slug}\"}}")
    total = 0
    for i, m in enumerate(mons, 1):
        t, tag = m.get("type"), f"monitor {i}"
        if t not in TYPES:
            err(f"{tag}: type \"{t}\" ({', '.join(TYPES)})")
            continue
        if not m.get("umd") or not m.get("label"):
            err(f"{tag}: needs \"umd\" (short, ≤ 16) and \"label\"")
        elif len(m["umd"]) > 16:
            warn(f"{tag}: umd \"{m['umd']}\" is long")
        if t == "live":
            exists(m.get("thumb"), f"{tag} thumb")
            href = m.get("href", "")
            cp = [c for c in p.get("copy", []) if href.rstrip("/") == c[1].rstrip("/")]
            if not href.startswith(f"projects/{slug}/") or not cp:
                err(f"{tag}: href \"projects/{slug}/live/\" and \"copy\": [[\"PV/…/06_Web/<ime>-live\", \"projects/{slug}/live\"]]")
            elif not os.path.isfile(os.path.join(resolve(cp[0][0]), "index.html")):
                err(f"{tag}: no index.html in {cp[0][0]}")
            else:
                page = open(os.path.join(resolve(cp[0][0]), "index.html"), encoding="utf-8", errors="ignore").read()
                if re.search(r"(src|href)=[\"']https?://", page):
                    warn(f"{tag}: the live page loads something from outside")
                if ":pause" not in "".join(open(os.path.join(dp, f), encoding="utf-8", errors="ignore").read()
                                           for dp, _d, fs in os.walk(resolve(cp[0][0])) for f in fs if f.endswith((".js", ".html"))):
                    warn(f"{tag}: the live page should stop on postMessage('{slug}:pause')")
        items = m.get("items", []) if t == "set" else [m] if t in ("film", "video", "image") else []
        if t == "set" and not 1 <= len(items) <= 6:
            err(f"{tag}: a set takes 1–6 pieces")
        for j, it in enumerate(items, 1):
            it_tag = tag + (f" piece {j}" if t == "set" else "")
            f = exists(it.get("src"), it_tag)
            if not f:
                continue
            total += os.path.getsize(f)
            if it.get("type") in ("video", "film"):
                (vw, vh), d, audio = streams(f)
                if it["type"] == "film" and not audio:
                    err(f"{it_tag}: the film has no sound")
                if it.get("poster_at", 0) >= d:
                    err(f"{it_tag}: poster_at {it['poster_at']} s is past the end ({d:.1f} s)")
                if it.get("dur", 0) > d + 0.1:
                    warn(f"{it_tag}: dur {it['dur']} s, the file is {d:.1f} s")
                if max(vw, vh) < 1080:
                    warn(f"{it_tag}: only {vw}×{vh}")
            elif it.get("type") == "image":
                im = Image.open(f)
                if max(im.size) < 1600:
                    warn(f"{it_tag}: only {im.width}×{im.height} (1600+ px)")
            else:
                err(f"{it_tag}: a piece is video, film or image")
    for c in p.get("cta", []):
        if not 1 <= c.get("cut", 0) <= len(mons):
            err(f"cta \"{c.get('label')}\": cut {c.get('cut')} is not a monitor")

    for x in warns:
        print("  warn ", x)
    for x in errs:
        print("  ERROR", x)
    print(f"{slug or '?'}: {len(mons)} monitors, {total / 1e6:.0f} MB of sources, "
          + ("ready for the site" if not errs else f"{len(errs)} error(s) to fix"))
    return not errs


if __name__ == "__main__":
    if sys.argv[1:2] == ["--check"] and len(sys.argv) == 3:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.exit(0 if check(sys.argv[2]) else 1)
    main()
