"""Builds the art for the third Process project, "fizz" (a made-up pink lemonade in a can).

Sources (Freepik originals, never shipped) in _freepik/fizz/:
  239598006_*.svg  cartoon juice splashes: a crown, a swirl, waves (recoloured to pinks)
  426268358_*.svg  a soda can, line art + a coloured version: lid, pull tab, rims (silver)
  427674031_*.svg  a lemon in phases: whole with a leaf, half, two slices, a wedge
  428063152_*.svg  ice cubes

Writes js/pr-fizz.js, loaded by the page only when the demo is about to show fizz:
  defs     one hidden <svg> of <symbol>s (lemons, splash, ice, the can's neck and bottom, a lid,
           the pull tab, a line-art can) that the banners show with <use>, so the label can be
           cloned into the strips of the 3D can without copying the drawings
  can      the numbers the page needs to put the neck and the bottom on the 3D label
and, between the fizz-icon:start/end markers in index.html, a lemon slice for the project circle.

Usage:  python -I tools/build_fizz.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_freepik", "fizz")
NL = "\n"


def src(prefix):
    return next(os.path.join(SRC, f) for f in os.listdir(SRC) if f.startswith(prefix) and f.endswith(".svg"))


def num(t):
    s = ("%.1f" % round(float(t), 1)).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def short(d):
    """A path's data with one decimal. Illustrator packs numbers ("66.038.516" is 66.038 and .516),
    so it is read token by token and written back with a space only where a sign doesn't separate."""
    out, prev = [], ""
    for t in re.findall(r"[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?", d):
        if t.isalpha():
            out.append(t)
            prev = t
            continue
        s = num(t)
        if prev and not prev.isalpha() and s[0] != "-":
            out.append(" ")
        out.append(s)
        prev = s
    return "".join(out)


def bbox(d):
    """Bounding box of a path's points and control points (enough to sort shapes into regions)."""
    toks = re.findall(r"[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?", d)
    xs, ys, x, y, sx, sy, i, cmd = [], [], 0.0, 0.0, 0.0, 0.0, 0, None
    n = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            if cmd in "Zz":
                x, y = sx, sy
                continue
        k = n[cmd.upper()]
        v = [float(t) for t in toks[i:i + k]]
        i += k
        rel, U = cmd.islower(), cmd.upper()
        if U == "H":
            x = x + v[0] if rel else v[0]
            pts = [(x, y)]
        elif U == "V":
            y = y + v[0] if rel else v[0]
            pts = [(x, y)]
        elif U == "A":
            x, y = (x + v[5], y + v[6]) if rel else (v[5], v[6])
            pts = [(x, y)]
        else:
            pts = [(x + v[j], y + v[j + 1]) if rel else (v[j], v[j + 1]) for j in range(0, k, 2)]
            x, y = pts[-1]
        if U == "M":
            sx, sy = x, y
            cmd = "l" if rel else "L"
        xs += [p[0] for p in pts]
        ys += [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def shapes(path):
    """Every shape of an Illustrator export in drawing order: dicts with tag, fill, opacity, blend,
    the geometry attributes as text, and a rough box. Background rects and circles are left out."""
    s = open(path, encoding="utf-8").read()
    out = []
    for m in re.finditer(r"<(path|ellipse|circle|rect|polygon)\b([^>]*?)/?>", s, re.S):
        tag, a = m.group(1), m.group(2)
        style = (re.search(r'style="([^"]*)"', a) or [None, ""])[1]
        fill = re.search(r"fill:\s*(#[0-9A-Fa-f]{3,6})", style) or re.search(r'fill="(#[0-9A-Fa-f]{3,6})"', a)
        fill = fill.group(1).upper() if fill else "#000000"
        if len(fill) == 4:
            fill = "#" + "".join(c * 2 for c in fill[1:])
        op = re.search(r"opacity:\s*([\d.]+)", style)
        blend = re.search(r"mix-blend-mode:\s*(\w+)", style)
        g = lambda k: float(re.search(rf'\b{k}="([^"]*)"', a).group(1))
        tr = re.search(r'transform="([^"]*)"', a)
        if tag == "path":
            d = short(re.search(r'\bd="([^"]*)"', a, re.S).group(1))
            geo, box = f'd="{d}"', bbox(d)
        elif tag == "rect":
            if g("width") > 3000:                      # the artboard
                continue
            x = float((re.search(r'\bx="([^"]*)"', a) or [0, 0])[1])
            y = float((re.search(r'\by="([^"]*)"', a) or [0, 0])[1])
            geo = f'x="{x:.1f}" y="{y:.1f}" width="{g("width"):.1f}" height="{g("height"):.1f}"'
            box = (x, y, x + g("width"), y + g("height"))
        elif tag == "circle":
            if g("r") > 1000:                          # the backdrop
                continue
            geo = f'cx="{g("cx"):.1f}" cy="{g("cy"):.1f}" r="{g("r"):.1f}"'
            box = (g("cx") - g("r"), g("cy") - g("r"), g("cx") + g("r"), g("cy") + g("r"))
        elif tag == "ellipse":
            cx, cy, rx, ry = g("cx"), g("cy"), g("rx"), g("ry")
            geo = f'cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}"'
            if tr:
                ma, mb, mc, md, me, mf = (float(v) for v in re.findall(r"-?[\d.]+", tr.group(1)))
                geo += ' transform="matrix(%s)"' % " ".join(("%.4f" % v).rstrip("0").rstrip(".") for v in (ma, mb, mc, md, me, mf))
                cx, cy = ma * cx + mc * cy + me, mb * cx + md * cy + mf
            box = (cx - rx, cy - rx, cx + rx, cy + rx)
        else:
            continue
        out.append({"tag": tag, "fill": fill, "op": float(op.group(1)) if op else 1.0,
                    "blend": blend.group(1) if blend else None, "geo": geo, "box": box})
    return out


def region(sh, x0, y0, x1, y1):
    """The shapes whose box centre lies inside the rectangle."""
    return [s for s in sh if x0 <= (s["box"][0] + s["box"][2]) / 2 <= x1 and y0 <= (s["box"][1] + s["box"][3]) / 2 <= y1]


def lum(c):
    r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ramp(sh, colours):
    """Recolour by brightness: the darkest source colour gets the first colour, the lightest the last."""
    src = sorted({s["fill"] for s in sh}, key=lum)
    m = {c: colours[round(i * (len(colours) - 1) / max(1, len(src) - 1))] for i, c in enumerate(src)}
    return [dict(s, fill=m[s["fill"]]) for s in sh]


def draw(sh, fills=None):
    """Shapes as SVG text. fills maps source colours; blend modes become plain tints."""
    out = []
    for s in sh:
        f = (fills or {}).get(s["fill"], s["fill"])
        extra = ""
        if s["blend"] == "multiply":
            f, extra = "#000", f' opacity="{0.4 * s["op"]:.2f}"'
        elif s["blend"] == "screen":
            f, extra = "#fff", f' opacity="{0.55 * s["op"]:.2f}"'
        elif s["op"] < 1:
            extra = f' opacity="{s["op"]:.2f}"'
        out.append(f'<{s["tag"]} fill="{f}"{extra} {s["geo"]}/>')
    return "".join(out)


def box_of(sh, pad=0):
    x0 = min(s["box"][0] for s in sh) - pad
    y0 = min(s["box"][1] for s in sh) - pad
    x1 = max(s["box"][2] for s in sh) + pad
    y1 = max(s["box"][3] for s in sh) + pad
    return x0, y0, x1, y1


def symbol(sid, sh, fills=None, pad=4, vb=None):
    x0, y0, x1, y1 = vb or box_of(sh, pad)
    return (f'<symbol id="{sid}" viewBox="{x0:.0f} {y0:.0f} {x1 - x0:.0f} {y1 - y0:.0f}">' + draw(sh, fills) + "</symbol>"), (x0, y0, x1, y1)


# ---------------------------------------------------------------- palette
PINK, BERRY, MINT, LEMON, CREAM = "#FF4F8B", "#3A0A26", "#A6EBD0", "#FFE45C", "#FFF4EA"
SPLASH = ["#C8175A", "#E0306E", "#FF5A93", "#FF8DB4", "#FFC4D8", "#FFE6EF"]
LEMONS = {
    "#FAD030": "#FFE04A", "#F9CF32": "#FFE04A", "#F9CF30": "#FFE04A", "#F1D12E": "#FFDC45", "#F3CE3E": "#FFE04A",
    "#F5B92B": "#F6BF2A", "#F3BA2C": "#F6BF2A", "#F8DD72": "#FFEC8C",
    "#EDE7BF": "#FFF6CF", "#F2EBB8": "#FFF3C4", "#F2E8B5": "#FFF3C4", "#FFFFFF": "#FFFFFF",
    "#1BAF56": "#2CC285", "#148343": "#1D9C68", "#128543": "#1D9C68",
}
ICE = {"#9BE9F5": "#C4F5EC", "#9EE7F6": "#C4F5EC", "#8FD9E4": "#A6EBD0", "#6FC8D6": "#7DD8C0", "#71C7D6": "#7DD8C0"}


def main():
    syms, info = [], {}

    # lemons: whole (with its leaf), half, a slice, another slice, a wedge
    lem = shapes(src("427674031"))
    for sid, r in (("fz-whole", (150, 400, 740, 1290)), ("fz-half", (930, 690, 1510, 1300)), ("fz-slice", (1700, 700, 2290, 1290)),
                   ("fz-slice2", (2480, 710, 3050, 1280)), ("fz-wedge", (3220, 900, 3860, 1260))):
        sh = region(lem, *r)
        sym, vb = symbol(sid, sh, LEMONS)
        syms.append(sym)
        info[sid] = round((vb[2] - vb[0]) / (vb[3] - vb[1]), 3)

    # splashes: a crown that bursts out of the can, a swirl behind the hero
    spl = shapes(src("239598006"))
    crown = ramp(region(spl, 1760, 990, 2430, 1440), SPLASH)
    swirl = ramp(region(spl, 990, 520, 1700, 1400), SPLASH)
    for sid, sh in (("fz-crown", crown), ("fz-swirl", swirl)):
        sym, vb = symbol(sid, sh)
        syms.append(sym)
        info[sid] = round((vb[2] - vb[0]) / (vb[3] - vb[1]), 3)

    # ice: two tilted cubes
    ice = shapes(src("428063152"))
    for sid, r in (("fz-ice", (150, 650, 950, 1460)), ("fz-ice2", (2400, 620, 3230, 1470))):
        sym, vb = symbol(sid, region(ice, *r), ICE)
        syms.append(sym)
        info[sid] = round((vb[2] - vb[0]) / (vb[3] - vb[1]), 3)

    # the can (right-hand, coloured version): 27 is the body's outline, 34-48 the lid, 49-52 the tab,
    # 20-26 the bottom rim. Its green goes: the label is ours, the metal shows above and below it.
    can = shapes(src("426268358"))
    assert len(can) == 54, len(can)
    body = can[27]["geo"]
    X0, X1 = 1290.0, 2449.6                      # the body's sides
    CX, RX = (X0 + X1) / 2, (X1 - X0) / 2
    TOP, BOT = 400.0, 1760.0                     # where the label's top and bottom meet the sides
    RY = round(RX * 0.237, 1)                    # the lid's ellipse: we look at the can 13.7 deg from above
    lid = draw(can[34:49])
    tab = draw(can[49:53])
    metal = ('<linearGradient id="fz-metal" x1="0" x2="1" y1="0" y2="0">'
             '<stop offset="0" stop-color="#7d8085"/><stop offset=".1" stop-color="#c3c6c9"/><stop offset=".24" stop-color="#f5f6f7"/>'
             '<stop offset=".36" stop-color="#d4d6d9"/><stop offset=".62" stop-color="#b3b6ba"/><stop offset=".86" stop-color="#8d9095"/>'
             '<stop offset="1" stop-color="#666a6f"/></linearGradient>')
    clips = (f'<clipPath id="fz-neckclip"><path d="M1200 0H2550V{TOP}H{X1}A{RX} {RY} 0 0 1 {X0} {TOP}H1200Z"/></clipPath>'
             f'<clipPath id="fz-botclip"><path d="M1200 2200H2550V{BOT}H{X1}A{RX} {RY} 0 0 1 {X0} {BOT}H1200Z"/></clipPath>')
    # the mouth: the scored opening, pushed in when the tab goes up (hidden until then)
    mouth = '<path class="fz-mouth" fill="#3b3d40" d="M1708 112c40-14 104-12 128 8 18 16-6 40-52 44-48 4-96-6-100-26-2-12 8-20 24-26z"/>'
    neck_vb = (1280, 20, 1180, TOP + RY + 30 - 20)
    syms.append(f'<symbol id="fz-neck" viewBox="{neck_vb[0]} {neck_vb[1]} {neck_vb[2]} {neck_vb[3]:.0f}">'
                f'<path clip-path="url(#fz-neckclip)" fill="url(#fz-metal)" {body}/>'
                f'<path clip-path="url(#fz-neckclip)" fill="#000" opacity=".16" {can[31]["geo"]}/>'
                + lid + "</symbol>")
    bot_vb = (1280, BOT - 20, 1180, 2110 - (BOT - 20))
    syms.append(f'<symbol id="fz-bot" viewBox="{bot_vb[0]} {bot_vb[1]:.0f} {bot_vb[2]} {bot_vb[3]:.0f}">'
                + draw(can[20:22]) + f'<path clip-path="url(#fz-botclip)" fill="url(#fz-metal)" {body}/>'
                + draw(can[22:27]) + "</symbol>")
    # the tab on its own (the page lifts it about the rivet), and a lid for the six-pack
    syms.append(f'<symbol id="fz-tab" viewBox="{neck_vb[0]} {neck_vb[1]} {neck_vb[2]} {neck_vb[3]:.0f}">' + tab + "</symbol>")
    syms.append(f'<symbol id="fz-mouth" viewBox="{neck_vb[0]} {neck_vb[1]} {neck_vb[2]} {neck_vb[3]:.0f}">' + mouth + "</symbol>")
    # line art for the board: the empty can before the design (the left-hand drawing)
    line = [dict(s, fill=BERRY if s["fill"] == "#231F20" else "#FFFDF8") for s in can[0:20]]
    sym, vb = symbol("fz-sketch", line, pad=8)
    syms.append(sym)
    info["fz-sketch"] = round((vb[2] - vb[0]) / (vb[3] - vb[1]), 3)

    k = 1 / (X1 - X0)                             # in can widths
    info["can"] = {
        "neck": [round((neck_vb[0] - X0) * k, 4), round((neck_vb[1] - TOP) * k, 4), round(neck_vb[2] * k, 4), round(neck_vb[3] * k, 4)],
        "bot": [round((bot_vb[0] - X0) * k, 4), round((bot_vb[1] - BOT) * k, 4), round(bot_vb[2] * k, 4), round(bot_vb[3] * k, 4)],
        "ry": round(RY * k, 4),
        "rivet": [round((1776 + 26 - X0) * k, 4), round((168 - TOP) * k, 4)],
    }
    defs = ('<svg xmlns="http://www.w3.org/2000/svg" class="pr__defs" aria-hidden="true" focusable="false"><defs>'
            + metal + clips + "</defs>" + "".join(syms) + "</svg>")
    print(f"defs: {len(defs.encode()) / 1024:5.1f} KB")
    print(json.dumps(info))

    q = lambda v: "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
    out = os.path.join(ROOT, "js", "pr-fizz.js")
    js = ("/* fizz art for the Process demo, built by tools/build_fizz.py (do not edit).\n"
          "   Loaded only when the demo is about to show this project. */" + NL
          + "window.prFizz = {" + NL
          + "  defs: " + q(defs) + "," + NL
          + "  info: " + json.dumps(info, separators=(",", ":")) + "," + NL
          + "};" + NL)
    with open(out, "w", encoding="utf-8", newline="\r\n") as f:
        f.write(js)

    # the project circle: a slice of lemon on pink
    sl = region(lem, 1700, 700, 2290, 1290)
    x0, y0, x1, y1 = box_of(sl)
    cx, cy, r = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2
    icon = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
            f'<g transform="translate(50 52) rotate(-18) scale({34 / r:.4f}) translate({-cx:.1f} {-cy:.1f})">' + draw(sl, LEMONS) + "</g></svg>")
    idx = os.path.join(ROOT, "index.html")
    page = open(idx, encoding="utf-8", newline="").read()
    a, b = "<!-- fizz-icon:start -->", "<!-- fizz-icon:end -->"
    if a in page:
        i, j = page.index(a) + len(a), page.index(b)
        page = page[:i] + icon + page[j:]
        with open(idx, "w", encoding="utf-8", newline="") as f:
            f.write(page)
    return defs, icon


if __name__ == "__main__":
    import sys
    defs, icon = main()
    if "--test" in sys.argv:
        T = sys.argv[sys.argv.index("--test") + 1]
        ids = re.findall(r'<symbol id="([^"]+)"', defs)
        tiles = "".join(f'<figure><figcaption>{i}</figcaption><svg><use href="#{i}"/></svg></figure>' for i in ids)
        page = ('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#3A0A26;display:flex;flex-wrap:wrap;gap:8px;font:bold 16px sans-serif;color:#fff}'
                'figure{margin:0;width:300px;height:330px;background:#FF4F8B}figure:nth-child(2n){background:#2a0619}svg{width:300px;height:300px;display:block}.pr__defs{position:absolute;width:0;height:0}</style>'
                + defs + tiles + f'<figure><figcaption>icon</figcaption><div style="width:300px;height:300px;border-radius:50%;overflow:hidden;background:#FF4F8B">{icon}</div></figure>')
        open(T, "w", encoding="utf-8").write(page)
