"""Builds the rigged cat and the feather toy for the Process section ("purr." Meta banners).

Sources (Freepik originals, never shipped) in _freepik/macka/:
  428109475_*.svg   black cat peeking out of a cardboard box (flat, Illustrator SVG export)
  toys.svg          "Cat toys, pet care equipment set" EPS exported to SVG (only the yellow
                    feather petals are vectors; the red ones came out as images, so they are
                    rebuilt here from recoloured copies of the yellow ones)

Writes, inline into index.html (inside <template data-purr>, between the purr:start/end
markers, so the page needs no extra request and works even opened as a file):
  the cat   split into parts that move on their own: head (ears, eyes with pupils and lids,
            brows, whiskers), arms + paws, a tail chain, and the box (faces without the
            notches the paws sat in)
  the toy   the feather on a string, hanging from (0, -1600), knot at (0, 0); the point it
            swings from is set in css (per format)
and, between the purr-icon:start/end markers, the cat's head as a still icon for the project
circle beside the section title (no whiskers: they vanish at that size)

Every moving part has a class (c-*) and its pivot as transform-origin, so the page can animate
it with plain transform/opacity. Shapes keep the original 2000 x 2000 coordinates.

Usage:  python -I tools/build_process.py
"""
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_freepik", "macka")
NL = "\n"

INK = "#191A1B"


def num(m):
    v = round(float(m.group(0)), 1)
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    s = "0" if s in ("-0", "") else s
    # a minus was also the separator from the previous number: keep them apart
    return " " + s if m.group(0)[0] == "-" and s[0] != "-" else s


def short(d):
    """One decimal is plenty in a 2000-unit drawing."""
    return re.sub(r"\s+", " ", re.sub(r"-?\d+\.\d+", num, d)).strip()


def shapes(path):
    """[(tag, fill, geometry)] in drawing order; geometry is d (path) or points (polygon)."""
    s = open(path, encoding="utf-8").read()
    out = []
    for m in re.finditer(r"<(path|polygon|rect)\b([^>]*?)/?>", s, re.S):
        tag, a = m.group(1), m.group(2)
        fill = re.search(r"fill:?\s*=?\"?(#[0-9A-Fa-f]{6})", a)
        geo = re.search(r'\b(?:d|points)="([^"]*)"', a, re.S)
        out.append((tag, fill.group(1) if fill else None, short(geo.group(1)) if geo else ""))
    return out


def P(d, fill, extra=""):
    return f'<path fill="{fill}"{extra} d="{d}"/>'


def poly(pts, fill, extra=""):
    return f'<polygon fill="{fill}"{extra} points="{pts}"/>'


def origin(x, y):
    return f' style="transform-origin:{x}px {y}px"'


def cat():
    src = glob.glob(os.path.join(SRC, "428109475_*.svg"))[0]
    s = shapes(src)
    d = [g for _, _, g in s]
    fill = [f for _, f, _ in s]
    assert len(s) == 38, len(s)

    # the head silhouette (14) with each ear cut off along its base; every ear piece
    # reaches 30 units into the head so a turned ear never opens a gap
    defs = [
        '<clipPath id="purr-skull"><polygon points="0,2000 0,800 745,800 945,640 1000,612 '
        '1100,612 1140,640 1335,800 2000,800 2000,2000"/></clipPath>',
        '<clipPath id="purr-earL"><polygon points="0,0 1010,0 1010,598 960,646 760,815 0,815"/></clipPath>',
        '<clipPath id="purr-earR"><polygon points="1090,0 2000,0 2000,815 1318,815 1125,646 1090,598"/></clipPath>',
        # the cat never shows below the bottom of the box
        '<clipPath id="purr-box"><polygon points="0,0 2000,0 2000,1340 1579,1346 973,1476 437,1351 0,1351"/></clipPath>',
        '<clipPath id="purr-eyeL"><circle cx="897" cy="869" r="66"/></clipPath>',
        '<clipPath id="purr-eyeR"><circle cx="1159" cy="869" r="66"/></clipPath>',
    ]

    def eye(side, cx, hx):
        cy = 869
        # lid: waits above the eye, bottom edge sags; slides down 152 to close, ~95 sleepy
        lid = (f"M{cx - 80},{cy - 260} H{cx + 80} V{cy - 100} "
               f"Q{cx},{cy - 64} {cx - 80},{cy - 100} Z")
        lash = f"M{cx - 80},{cy - 100} Q{cx},{cy - 64} {cx + 80},{cy - 100}"
        return (f'<g class="c-eye{side}">'
                f'<circle fill="#FBC02C" cx="{cx}" cy="{cy}" r="66"/>'
                # c-look: moved by the page (transform attribute) to look at the visitor's cursor
                f'<g class="c-look{side}"><ellipse class="c-pupil{side}" fill="#0E1112" cx="{cx - 0.3}" cy="{cy - 0.4}" rx="37.5" ry="40.6"{origin(cx, cy)}/></g>'
                f'<circle fill="#FFF" cx="{hx}" cy="842.4" r="9.5"/>'
                f'<g clip-path="url(#purr-eye{side})"><g class="c-lid{side}">'
                f'<path fill="{INK}" d="{lid}"/>'
                f'<path fill="none" stroke="#4A4B4C" stroke-width="7" stroke-linecap="round" d="{lash}"/>'
                f"</g></g></g>")

    head = (
        f'<g class="c-head"{origin(1032, 1040)}>'
        + P(d[14], INK, ' clip-path="url(#purr-skull)"')
        + f'<g class="c-earL"{origin(845, 718)}>' + P(d[14], INK, ' clip-path="url(#purr-earL)"') + P(d[32], fill[32]) + "</g>"
        + f'<g class="c-earR"{origin(1232, 720)}>' + P(d[14], INK, ' clip-path="url(#purr-earR)"') + P(d[17], fill[17]) + "</g>"
        + f'<g class="c-brows">{P(d[27], fill[27])}{P(d[22], fill[22])}</g>'
        + eye("L", 897, 872.5) + eye("R", 1159, 1182.6)
        + P(d[23], fill[23])
        + f'<g class="c-whiskL"{origin(850, 955)}>' + "".join(P(d[i], fill[i]) for i in (31, 30, 37, 35)) + "</g>"
        + f'<g class="c-whiskR"{origin(1232, 958)}>' + "".join(P(d[i], fill[i]) for i in (18, 15, 9, 10, 5)) + "</g>"
        + "</g>"
    )

    # tail: six short segments, each one turns at its joint (local 0,0), so small turns add
    # up to a smooth curve; the rest pose ("?" curl) is in the wrapper's transform attribute,
    # the class takes the animated turn on top of it
    L = 62
    segs = [(-48, 42), (-8, 41), (-12, 39), (-14, 37), (-20, 34), (-26, 30)]
    tail = ""
    for i, (rest, w) in reversed(list(enumerate(segs))):
        inner = tail
        tail = (f'<g transform="{f"translate({L} 0) " if i else ""}rotate({rest})">'
                f'<g class="c-t{i + 1}">'
                f'<path stroke="{INK}" stroke-width="{w}" stroke-linecap="round" d="M0,0 H{L}"/>'
                f"{inner}</g></g>")
    # it curls up behind the left of the head (the right side belongs to the paw and the toy)
    tail = f'<g class="c-tail" transform="translate(790 992) scale(-1 1)">{tail}</g>'

    # arms live behind the box faces (inside the box) and turn with the paws from the
    # same shoulder, so a paw lifted over the rim stays joined to the body
    arm_l = (f'<g class="c-armLw"><g class="c-armL"{origin(760, 1190)}>'
             f'<rect fill="{INK}" x="705" y="980" width="112" height="620" rx="56"/></g></g>')
    arm_r = (f'<g class="c-armRw"><g class="c-armR"{origin(1320, 1180)}>'
             f'<rect fill="{INK}" x="1266" y="975" width="112" height="620" rx="56"/></g></g>')
    body = P("M752,985 C752,880 1318,880 1318,985 L1338,1460 L732,1460 Z", INK, ' class="c-body"')

    cat_layer = (f'<g clip-path="url(#purr-box)"><g class="c-cat">'
                 f'{tail}{body}{arm_l}{arm_r}<g class="c-aim">{head}</g></g></g>')   # c-aim: head turns to the cursor

    # box without the notches the paws sat in
    face_r = "973,1053.8 1579,926.2 1579,1345.9 973,1476.4"
    flap_l = "973,1053.8 851.8,1258.6 306.1,1120.8 432.7,925.8"
    inside = "432.7,925.8 1064.3,799.4 1579,926.2 973,1053.8"
    front = (poly(d[24], fill[24]) + poly(d[25], fill[25]) + poly(flap_l, fill[34])
             + poly(face_r, fill[11]))
    # logo printed on the right face (skewed into its plane)
    logo = ('<g transform="translate(1276 1236) skewY(-11.9)"><g class="c-logo">'
            '<text text-anchor="middle" font-family="Archivo, sans-serif" font-weight="900" '
            'font-stretch="125%" font-size="118" letter-spacing="-3" fill="#7A4A1A">purr.</text>'
            '<text text-anchor="middle" y="52" font-family="Archivo, sans-serif" font-weight="700" '
            'font-stretch="125%" font-size="34" letter-spacing="6" fill="#7A4A1A">PET SHOP</text></g></g>')

    paw_l = (f'<g class="c-pawLw"><g class="c-pawL"{origin(760, 1190)}>'
             + P(d[4], INK) + P(d[33], INK) + "</g></g>")
    paw_r = (P(d[16], fill[16], ' class="c-pawRsh"')
             + f'<g class="c-pawRw"><g class="c-pawR"{origin(1320, 1180)}>'
             + P(d[2], INK) + P(d[12], INK) + "</g></g>")

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="290 470 1480 1030" class="purr-cat">'
        + "<defs>" + "".join(defs) + "</defs>"
        + P(d[1], "#000", ' class="c-shadow" fill-opacity=".14"')
        + poly(d[8], fill[8])
        + poly(inside, fill[13], ' class="c-inside"')
        + cat_layer + front + logo + paw_l + paw_r
        + "</svg>"
    )
    return svg


def icon():
    src = glob.glob(os.path.join(SRC, "428109475_*.svg"))[0]
    s = shapes(src)
    d = [g for _, _, g in s]
    fill = [f for _, f, _ in s]

    def eye(cx, hx):
        return (f'<circle fill="#FBC02C" cx="{cx}" cy="869" r="66"/>'
                f'<ellipse fill="#0E1112" cx="{cx - 0.3}" cy="868.6" rx="37.5" ry="40.6"/>'
                f'<circle fill="#FFF" cx="{hx}" cy="842.4" r="9.5"/>')

    # a bust: the circle (r 470 about 1032, 920) cuts through the body, the ear tips stay inside
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="562 450 940 940" aria-hidden="true" focusable="false">'
            + P("M752,985 C752,880 1318,880 1318,985 L1338,1460 L732,1460 Z", INK)
            + P(d[14], INK) + P(d[32], fill[32]) + P(d[17], fill[17]) + P(d[27], fill[27]) + P(d[22], fill[22])
            + eye(897, 872.5) + eye(1159, 1182.6) + P(d[23], fill[23])
            + "</svg>")


def toy():
    s = shapes(os.path.join(SRC, "toys.svg"))
    d = [g for _, _, g in s]
    # blue and red: the stock yellow petals vanished on the yellow banner
    BLUE, RED = "#2D5BE3", "#EF3416"
    kx, ky = 957, 806                                     # where the petals meet the string
    petals = [(8, RED, 38), (7, RED, -18), (9, RED, -30),  # red copies, turned about the knot
              (8, BLUE, 0), (7, BLUE, 0), (9, BLUE, 0), (10, BLUE, 0)]
    turn = lambda r: f' transform="rotate({r} {kx} {ky})"' if r else ""
    body = "".join(f'<path fill="{c}"{turn(r)} d="{d[i]}"/>' for i, c, r in petals)
    tassel = (f'<g class="t-feather" style="transform-origin:0px 0px">'
              f'<g transform="scale(1.5) rotate(-28) translate({-kx} {-ky})">{body}</g></g>')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -1600 400 1860" class="purr-toy">'
        '<g class="t-swing">'
        '<path fill="none" stroke="#953A27" stroke-width="5" stroke-linecap="round" d="M0,-1600 V0"/>'
        f"{tassel}</g></svg>"
    )
    return svg


def main():
    svgs = [cat(), toy()]
    idx = os.path.join(ROOT, "index.html")
    page = open(idx, encoding="utf-8").read()
    a, b = "<!-- purr:start -->", "<!-- purr:end -->"
    i, j = page.index(a) + len(a), page.index(b)
    pad = " " * 12
    page = page[:i] + NL + NL.join(pad + v for v in svgs) + NL + pad + page[j:]
    ico = icon()
    a, b = "<!-- purr-icon:start -->", "<!-- purr-icon:end -->"
    i, j = page.index(a) + len(a), page.index(b)
    page = page[:i] + ico + page[j:]
    with open(idx, "w", encoding="utf-8", newline="\r\n") as f:  # index.html keeps CRLF
        f.write(page)
    for name, v in zip(("cat", "toy", "icon"), svgs + [ico]):
        print(f"{name}: {len(v.encode()) / 1024:5.1f} KB inline")


if __name__ == "__main__":
    main()
