"""Builds the art for the second Process project, "Night Court" (a made-up 3x3 streetball league).

Sources (Freepik originals, never shipped) in _freepik/night-court/:
  poster.svg    a dunking player with the hoop, already cut into parts (head, torso, arms, legs,
                ball panels, net, backboard); Illustrator export of 409935942_*.eps
  dribble.svg   eight dribbling poses (flat colours); Illustrator export of 67279874_*.eps

Writes js/pr-court.js, loaded by the page only when the demo is about to show Night Court:
  hero     the rig: player + hoop + ball. Every moving part has a class (h-*) and its pivot as
           transform-origin. The ball lives in its own layer behind the net, inside groups that
           copy the body and arm transforms, so it can sit in the hand and still drop *into*
           the net.
  passer   two poses of the player who passes the ball out of the TV frame (dribble, overhead),
           drawn as silhouettes, with the ball in the dribbling hand
  fly      the ball on its own, for the pass from the TV frame into the poster
  pass     where the passer's ball sits in each pose (passer units), for the page
and, between the court-icon:start/end markers in index.html, a small ball for the project circle.

Usage:  python -I tools/build_court.py
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_freepik", "night-court")
NL = "\n"

NIGHT = "#05070F"     # the player, backlit
CHALK = "#F2EFE6"
BALL = "#FF6A1A"
RIM = "#FF6A1A"


def num(m):
    v = round(float(m.group(0)), 1)
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    s = "0" if s in ("-0", "") else s
    return " " + s if m.group(0)[0] == "-" and s[0] != "-" else s


def short(d):
    return re.sub(r"\s+", " ", re.sub(r"-?\d+\.\d+", num, d)).strip()


def paths(name):
    """[(tag, attrs, d)] of every shape in drawing order (Illustrator export)."""
    s = open(os.path.join(SRC, name), encoding="utf-8").read()
    s = re.sub(r"<rect[^>]*/>", "", s, count=1)        # the white artboard
    out = []
    for m in re.finditer(r"<(path|circle|ellipse|polygon)\b([^>]*?)/?>", s, re.S):
        tag, a = m.group(1), m.group(2)
        fill = re.search(r'fill="(#[0-9A-Fa-f]{6})"', a)
        if tag == "path":
            geo = short(re.search(r'\bd="([^"]*)"', a, re.S).group(1))
        elif tag == "circle":
            g = {k: float(re.search(rf'\b{k}="([^"]*)"', a).group(1)) for k in ("cx", "cy", "r")}
            geo = g
        else:
            geo = a
        out.append((tag, fill.group(1) if fill else None, geo))
    return out


def groups(name):
    """The top-level <g> blocks of an Illustrator export, as source text (one pose each)."""
    s = open(os.path.join(SRC, name), encoding="utf-8").read()
    out, depth, start = [], 0, 0
    for m in re.finditer(r"<(/?)g\b[^>]*>", s):
        if m.group(1):
            depth -= 1
            if depth == 0:
                out.append(s[start:m.end()])
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return out


def shapes_in(text):
    out = []
    for m in re.finditer(r"<(path|circle|ellipse)\b([^>]*?)/?>", text, re.S):
        tag, a = m.group(1), m.group(2)
        fill = re.search(r'fill="(#[0-9A-Fa-f]{6})"', a)
        fill = fill.group(1) if fill else None
        if tag == "path":
            out.append(("path", fill, short(re.search(r'\bd="([^"]*)"', a, re.S).group(1))))
            continue
        # balls: circles, or round ellipses that Illustrator turned (the turn moves the centre)
        g = lambda k: float(re.search(rf'\b{k}="([^"]*)"', a).group(1))
        cx, cy, r = g("cx"), g("cy"), g("r") if tag == "circle" else g("rx")
        mt = re.search(r'matrix\(([^)]*)\)', a)
        if mt:
            ma, mb, mc, md, me, mf = (float(v) for v in mt.group(1).split())
            cx, cy = ma * cx + mc * cy + me, mb * cx + md * cy + mf
        out.append(("circle", fill, {"cx": cx, "cy": cy, "r": r}))
    return out


def bbox(d):
    """Bounding box of a path's points and control points (close enough to place a pose)."""
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
        rel = cmd.islower()
        U = cmd.upper()
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


def P(d, fill=None, extra=""):
    f = f' fill="{fill}"' if fill else ""
    return f'<path{f}{extra} d="{d}"/>'


def origin(x, y):
    return f' style="transform-origin:{x}px {y}px"'


# ---------------------------------------------------------------- the hero (poster.svg)
# part numbers in poster.svg (drawing order): 0-8 ball panels, 9 net + rim, 10-14 backboard,
# 15 torso, 16 back leg, 17 front leg, 18 the arm with the ball, 19 back arm, 20 head,
# 21 back hand, 22 wristband
BALL_C = (1206, 488)          # ball centre, r 145
SHOULDER_U = (1335, 1170)     # the arm with the ball
SHOULDER_B = (1052, 1312)     # back arm
NECK = (1150, 1222)
HIP_B = (1120, 2080)
HIP_F = (1480, 1960)
BODY = (1230, 1650)           # the whole player turns about here
RIM_TOP = (1738, 860)


def hero():
    p = paths("poster.svg")
    d = [g for _, _, g in p]
    assert len(p) == 23, len(p)
    ball = (f'<circle fill="{NIGHT}" cx="{BALL_C[0]}" cy="{BALL_C[1]}" r="140"/>'
            + "".join(P(d[i], BALL) for i in range(9)))
    board = "".join(P(d[i], CHALK) for i in (10, 11, 12, 13, 14))
    net = P(d[9], CHALK)
    arm_b = (f'<g class="h-armB"{origin(*SHOULDER_B)}>' + P(d[19]) + P(d[22]) + P(d[21]) + "</g>")
    body = (f'<g class="h-body"{origin(*BODY)}>'
            f'<g class="h-legB"{origin(*HIP_B)}>{P(d[16])}</g>'
            f'<g class="h-legF"{origin(*HIP_F)}>{P(d[17])}</g>'
            f'{P(d[15])}{arm_b}'
            f'<g class="h-head"{origin(*NECK)}>{P(d[20])}</g>'
            f'<g class="h-armU"{origin(*SHOULDER_U)}>{P(d[18])}</g>'
            "</g>")
    # the ball's layer copies the body and arm transforms (the page animates both pairs alike)
    ball_layer = (f'<g class="h-bodyB"{origin(*BODY)}><g class="h-armUB"{origin(*SHOULDER_U)}>'
                  f'<g class="h-ball"{origin(*BALL_C)}>{ball}</g></g></g>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="340 300 2320 2400" class="nc-hero" aria-hidden="true" focusable="false">'
            f'<g class="h-board"{origin(2240, 800)}>{board}</g>'
            + ball_layer
            + f'<g class="h-net"{origin(*RIM_TOP)}>{net}</g>'
            + f'<g fill="{NIGHT}">{body}</g>'
            + "</svg>")


def ball_art(cx, cy, r, cls=""):
    """The poster's ball (dark seams, orange panels) at (cx, cy), radius r."""
    p = paths("poster.svg")
    k = r / 145
    c = f' class="{cls}"' if cls else ""
    return (f'<g{c} transform="translate({cx} {cy}) scale({k:.4f}) translate({-BALL_C[0]} {-BALL_C[1]})">'
            f'<circle fill="{NIGHT}" cx="{BALL_C[0]}" cy="{BALL_C[1]}" r="140"/>'
            + "".join(P(p[i][2], BALL) for i in range(9)) + "</g>")


def passer():
    """Two poses of the TV player, feet at (0, 0), turned to face right (towards the poster)."""
    poses = []
    for g in groups("dribble.svg"):
        sh = shapes_in(g)
        boxes = [bbox(d) for t, _, d in sh if t == "path"]
        x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
        x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
        balls = [d for t, _, d in sh if t == "circle"]
        poses.append(((x0 + x1) / 2, (y0 + y1) / 2, x0, y0, x1, y1, sh, balls))
    assert len(poses) == 8, len(poses)
    # the sheet is two rows of four; we want bottom-right (low dribble) and bottom-left (overhead)
    dribble = max((p for p in poses if p[1] > 1750), key=lambda p: p[0])
    lob = min((p for p in poses if p[1] > 1750), key=lambda p: p[0])
    out, info = [], {}
    for name, p in (("dribble", dribble), ("lob", lob)):
        cx, _, x0, y0, x1, y1, sh, balls = p
        fx, fy = cx, y1                                    # the feet
        body = "".join(P(d) for t, _, d in sh if t == "path")
        out.append(f'<g class="p-{name}" transform="scale(-1 1) translate({-fx:.1f} {-fy:.1f})">{body}</g>')
        b = balls[0]
        info[name] = [round(-(b["cx"] - fx), 1), round(b["cy"] - fy, 1), round(b["r"], 1)]
        info[name + "Box"] = [round(-(x1 - fx)), round(y0 - fy), round(x1 - x0), round(y1 - y0)]
    # the page's ball starts in the dribbling hand
    bx, by, br = info["dribble"]
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-700 -1960 1400 2010" class="nc-passer" aria-hidden="true" focusable="false">'
           + "".join(out)
           + f'<g class="p-ballY"><g class="p-ball" style="transform-origin:{bx}px {by}px">{ball_art(bx, by, br)}</g></g>'
           + "</svg>")
    return svg, info


def icon():
    """The project circle: the ball, rising like a moon over a night court."""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
            + ball_art(50, 54, 30)
            + "</svg>")


def main(test=False):
    h = hero()
    ps, info = passer()
    print(f"hero: {len(h.encode()) / 1024:5.1f} KB   passer: {len(ps.encode()) / 1024:5.1f} KB   {info}")
    if test:
        return h, ps
    q = lambda v: "'" + v.replace("'", "\\'") + "'"
    out = os.path.join(ROOT, "js", "pr-court.js")
    js = ("/* Night Court art for the Process demo, built by tools/build_court.py (do not edit).\n"
          "   Loaded only when the demo is about to show this project. */" + NL
          + "window.prCourt = {" + NL
          + "  hero: " + q(h) + "," + NL
          + "  passer: " + q(ps) + "," + NL
          + "  fly: " + q('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 300 300" aria-hidden="true" focusable="false">'
                         + ball_art(0, 0, 145) + "</svg>") + "," + NL
          + "  pass: " + json_like(info) + "," + NL
          + "};" + NL)
    with open(out, "w", encoding="utf-8", newline="\r\n") as f:
        f.write(js)
    idx = os.path.join(ROOT, "index.html")
    page = open(idx, encoding="utf-8").read()
    a, b = "<!-- court-icon:start -->", "<!-- court-icon:end -->"
    if a in page:
        i, j = page.index(a) + len(a), page.index(b)
        page = page[:i] + icon() + page[j:]
        with open(idx, "w", encoding="utf-8", newline="\r\n") as f:
            f.write(page)


def json_like(d):
    import json
    return json.dumps(d, separators=(",", ":"))


if __name__ == "__main__":
    import sys
    if "--test" in sys.argv:
        h, ps = main(test=True)
        h += '<svg style="width:300px;background:#151b3a" ' + ps[5:]
        T = sys.argv[sys.argv.index("--test") + 1]
        page = ('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#0a0e22;display:flex;flex-wrap:wrap;gap:10px}'
                'svg{width:520px;height:auto;background:#151b3a}'
                '.t1 .h-armU,.t1 .h-armUB{transform:rotate(40deg)}.t1 .h-armB{transform:rotate(-35deg)}'
                '.t1 .h-legB{transform:rotate(25deg)}.t1 .h-legF{transform:rotate(-25deg)}.t1 .h-head{transform:rotate(15deg)}'
                '.t2 .h-body,.t2 .h-bodyB{transform:rotate(15deg)}.t2 .h-armU,.t2 .h-armUB{transform:rotate(-20deg)}'
                '.t2 .h-net{transform:scaleY(1.3)}</style>'
                f'<div>{h}</div><div class="t1">{h}</div><div class="t2">{h}</div>')
        open(T, "w", encoding="utf-8").write(page)
    else:
        main()
