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
Options: "w" video width, "dur"/"start" seconds, "poster_at" seconds for the poster frame.

Usage:  python -I tools/build_projects.py
"""
import hashlib
import html
import json
import math
import os
import shutil
import subprocess

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
    o = {k: item[k] for k in ("w", "dur", "start", "poster_at", "type") if k in item}
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
               "-crf", "28" if film else "29", "-preset", "slow", "-movflags", "+faststart", base + ".mp4"])
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
        for i, im in enumerate(frames):
            row, col = divmod(i, cols)
            n_in_row = min(cols, len(frames) - row * cols)
            x0 = pad + (W - 2 * pad - (n_in_row * cw + (n_in_row - 1) * gap)) / 2 + col * (cw + gap)
            y0 = pad + row * (ch + gap)
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
        d = {"kind": "live", "src": mon["href"], "poster": th["src"]}
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
    cta = "".join(
        f'<button class="btn {"btn--rec" if j == 0 else "btn--ghost"}" type="button" data-cut="{c["cut"]}">'
        + ('<span class="btn__play" aria-hidden="true"></span>' if j == 0 else "")
        + f'{E(c["label"])}' + (f' <span class="btn__meta">{E(c["meta"])}</span>' if c.get("meta") else "") + "</button>"
        for j, c in enumerate(p.get("cta", [])))
    facts = "".join(f'<li><b>{E(a)}</b><span>{E(b)}</span></li>' for a, b in p.get("facts", []))
    data = json.dumps(mons, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f"""      <template data-proj="{slug}">
        <div class="proj" style="--accent:{E(p.get('accent', '#ff4d1f'))};--n:{len(mons)}" role="region" aria-label="{E(p['title'])} — the project" tabindex="-1">
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


if __name__ == "__main__":
    main()
