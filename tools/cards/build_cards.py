"""The hero wall's channel cards: one ON AIR card template for all 38 screens.

Every screen gets new art in the same template (the project's own brand, logo and elements,
not a crop of a work): bg, accent glow, the logo, a cutout with an accent rim, shade, grain.
The channel chrome (CH bug, format, kicker, bar, safe ticks) is NOT in the image: the site
draws it live in CSS (.tile .ch), so it stays sharp and can switch to LIVE when a loop plays.

    python -I tools/cards/build_cards.py            # page + render + encode + index.html
    python -I tools/cards/build_cards.py --page     # only writes the page (for a look)

Sources are prepared by tools/cards/prep.py into _izvori/cards/src (not in the repo).
Renders through tools/cards/render.mjs (headless Chrome, on the GPU); resize and avif/webp
on the CPU (PIL). Output: media/wall/card-<id>-<w>.{avif,webp}.
"""
import hashlib
import html
import os
import re
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "_izvori", "cards", "src")
PNG = os.path.join(ROOT, "_izvori", "cards", "out")
CHROME = os.path.join(ROOT, "_izvori", "cards", "out-chrome")
OUT = os.path.join(ROOT, "media", "wall")

# render size of each screen shape (px, DPR 1) and the widths that go to the site
SHAPE = {"p0": (1040, 776), "pw": (520, 250), "pv": (280, 577), "tile": (520, 520),
         "w": (960, 470), "v": (520, 1060), "xl": (960, 960)}
WIDTHS = {"p0": (1040, 640), "pw": (520, 360), "pv": (280, 200), "tile": (520, 360),
          "w": (960, 480), "v": (520, 360), "xl": (960, 480)}
SIZES = {"p0": "36vw", "pw": "18vw", "pv": "9vw", "tile": "18vw", "w": "36vw", "v": "18vw", "xl": "36vw"}
FMT = {"p0": "16:9", "pw": "16:9", "pv": "9:16", "tile": "1:1", "xl": "1:1", "w": "16:9", "v": "9:16"}

ACC = {"deadair": "#FF3D2E", "halfcourt": "#CCF23D", "jurassic": "#ED9429", "bigger": "#FF4F8B",
       "accord": "#7E6CF0", "interstellar": "#F0A646", "umbra": "#4153FF", "struja": "#ff7a1a",
       "apsis": "#FF3DCB", "ballies": "#5FE3D6", "babyboo": "#F2A93B", "fsu": "#E4002B", "live": "#FFD23F"}
CH = {"deadair": 1, "bigger": 2, "jurassic": 3, "babyboo": 4, "struja": 5, "halfcourt": 6, "accord": 7,
      "ballies": 8, "umbra": 9, "live": 10, "apsis": 11, "interstellar": 12, "fsu": 13}
NAME = {"deadair": "DEAD AIR", "bigger": "BIGGER.", "jurassic": "JURASSIC", "babyboo": "BABY BOO",
        "struja": "STRUJA", "halfcourt": "HALFCOURT", "accord": "ACCORD", "ballies": "BALLIES",
        "umbra": "UMBRA", "live": "LIVE", "apsis": "APSIS", "interstellar": "INTERSTELLAR", "fsu": "FSU"}
ON = {"halfcourt": "#111314", "babyboo": "#1a1206", "live": "#1a1406", "ballies": "#06201d"}


# ------------------------------------------------------------------ logos, inlined
def svg(name, colors=None, pfx="", style=""):
    s = open(os.path.join(SRC, name), encoding="utf-8").read()
    s = re.sub(r"<\?xml[^>]*\?>", "", s)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<title>.*?</title>", "", s, flags=re.S)
    s = re.sub(r"<defs>\s*<style>.*?</style>\s*</defs>", "", s, flags=re.S)
    s = s.replace('class="cls-1"', 'fill="#fff"')
    root = re.match(r"\s*<svg\b[^>]*>", s).group(0)
    clean = re.sub(r'\s(width|height|id|data-name|class)="[^"]*"', "", root)
    s = s.replace(root, clean.replace("<svg", f'<svg style="{style}"' if style else "<svg", 1), 1)
    for a, b in (colors or {}).items():
        s = re.sub(re.escape(a), b, s, flags=re.I)
    if pfx:
        s = re.sub(r'\bid="([^"]+)"', lambda m: f'id="{pfx}{m.group(1)}"', s)
        s = re.sub(r"url\(#([^)]+)\)", lambda m: f"url(#{pfx}{m.group(1)})", s)
        s = re.sub(r'href="#([^"]+)"', lambda m: f'href="#{pfx}{m.group(1)}"', s)
    return s.strip()


def umbra_cast(pfx, n=34, step=6.0):
    """the UMBRA mark with its long cast shadow (copies offset down-right, fading)."""
    s = open(os.path.join(SRC, "umbra-logo.svg"), encoding="utf-8").read()
    body = re.sub(r"^.*?<title>.*?</title>", "", s, flags=re.S).replace("</svg>", "")
    body = body.replace('fill="#17150F"', "")
    uses = "".join(
        f'<use href="#{pfx}m" x="{i * step:.1f}" y="{i * step:.1f}" fill="#cbbd9f" opacity="{.55 * (1 - i / n) ** 1.6:.3f}"/>'
        for i in range(n, 0, -1))
    return (f'<svg viewBox="0 0 1086.91 146.13" style="overflow:visible"><defs><g id="{pfx}m">{body}</g></defs>'
            f'{uses}<use href="#{pfx}m" fill="#17150F"/></svg>')


# ------------------------------------------------------------------ building blocks
def grad(c, at="50% 45%", size="75% 55%"):
    return (f'<div class="bg" style="background:radial-gradient({size} at {at},{c[0]} 0,{c[1]} 45%,'
            f'{c[2]} 100%)"></div>')


def img(src, cls, style=""):
    return f'<img class="{cls}" src="{src}" style="{style}" alt="">'


GLOW = '<div class="glow"></div>'
SHADE = '<div class="shade"></div>'


def logo(inner, style):
    return f'<div class="logo" style="{style}">{inner}</div>'


def el(src, style, cls="subj"):
    return img(src, cls, style)


BALL_G = {"purple": ("#8d4bff", "#4a1fa8", "#160a38"), "blue": ("#3d8bff", "#1a3fb0", "#081440"),
          "sunset": ("#ff8a3d", "#c2304f", "#3a0b2a"), "lemon": ("#f5e14a", "#c99a12", "#3a2a05"),
          "teal": ("#36e0c8", "#11807a", "#04282a"), "red": ("#ff4d4d", "#a8162e", "#2e0610"),
          "mint": ("#7cf5c0", "#1d9b78", "#062a22"), "gold": ("#ffcc55", "#c47a12", "#2b1304")}


def ballies(shape, g, chars):
    out = [grad(BALL_G[g]), GLOW]
    if shape == "w":
        out.append(logo("BALLIES", "top:6cqh;width:92cqw;font:400 26cqh/1 Tanker;color:#fff"))
        pos = {1: [(50, 74)], 2: [(31, 70), (69, 70)], 3: [(19, 66), (50, 74), (81, 66)]}[len(chars)]
    else:
        out.append(logo("BALLIES", "top:10cqh;width:90cqw;font:400 22cqw/1 Tanker;color:#fff"))
        pos = {1: [(50, 80)], 2: [(29, 74), (71, 74)]}[len(chars)]
    order = sorted(range(len(chars)), key=lambda i: pos[i][1])  # the tallest last, in front
    for i in order:
        x, h = pos[i]
        out.append(el(f"ballie_{chars[i]}.png", f"left:{x}%;height:{h}cqh"))
    out.append(SHADE)
    return "".join(out)


def babyboo(shape, tone, subj, glow=None, manuka_still=False, h=None):
    out = [grad(tone, "50% 58%", "80% 60%"), GLOW]
    gl = glow or "rgba(242,169,59,.35)"
    if manuka_still:
        out.append(logo("BABY BOO", "top:76cqh;width:90cqw;font:300 17cqw/1 GS;letter-spacing:.06em;color:#fff3dc"))
        out.append(el(subj, f"height:64cqh;bottom:25cqh;filter:drop-shadow(0 0 3cqmin {gl})"))
        out.append('<div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,.35) 0,rgba(0,0,0,0) 30%)"></div>')
        return "".join(out)
    if shape == "tile":
        out.append(logo("BABY BOO", "top:9cqh;width:86cqw;font:300 15cqw/1 GS;letter-spacing:.06em;color:#fff3dc"))
        h = 76
    else:
        out.append(logo("BABY BOO", "top:11cqh;width:90cqw;font:300 17cqw/1 GS;letter-spacing:.06em;color:#fff3dc"))
        h = h or 82
    out.append(el(subj, f"height:{h}cqh;width:auto;max-width:94cqw;object-fit:contain;bottom:-1cqh;"
                        f"filter:drop-shadow(0 0 3cqmin {gl}) drop-shadow(0 2cqmin 4cqmin rgba(0,0,0,.5))"))
    out.append('<div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,0) 62%,rgba(8,5,2,.85) 100%)"></div>')
    return "".join(out)


def fsu(shape, poster, square=False, pfx=""):
    out = [img(poster, "bg", "filter:blur(2.4cqmin) brightness(.42) saturate(1.3);transform:scale(1.15)"), GLOW]
    L = lambda st: logo(svg("fsu-logo.svg", pfx=pfx), st)  # noqa: E731
    if shape == "xl":
        out += [L("top:8cqh;width:30cqw"), el(poster, "top:25cqh;height:82cqh;transform:translateX(-50%) rotate(-3deg)", "print")]
    elif shape == "w":
        out += [L("left:26cqw;top:37cqh;width:30cqw"),
                el(poster, "left:70cqw;top:9cqh;height:104cqh;transform:translateX(-50%) rotate(4deg)", "print")]
    elif shape == "tile":
        h = 64 if square else 84
        out += [L("top:9cqh;width:36cqw"), el(poster, f"top:28cqh;height:{h}cqh;transform:translateX(-50%) rotate(-3deg)", "print")]
    else:  # v
        out += [L("top:8cqh;width:56cqw"), el(poster, "top:24cqh;width:78cqw;transform:translateX(-50%) rotate(-3deg)", "print")]
    out.append('<div class="shade" style="background:linear-gradient(180deg,rgba(4,5,8,0) 60%,rgba(4,5,8,.75) 100%)"></div>')
    return "".join(out)


APS_BG = ("#1d4fd6", "#0a1c6b", "#040a2a")


def ring(x, y, d):
    return f'<div class="ring" style="left:{x};top:{y};width:{d}"></div>'


def apsis(kind, pfx):
    wm = svg("apsis-wordmark.svg", pfx=pfx)
    out = [grad(APS_BG, "50% 50%", "80% 70%"), GLOW]
    if kind == "desk":
        out += [ring("17%", "52%", "76cqh"),
                el("ap-trophy.png", "left:17%;height:70cqh;bottom:8cqh;transform:translateX(-50%) rotate(-8deg)"),
                logo(wm, "top:39cqh;width:44cqw"),
                el("ap-coin.png", "left:84%;top:12cqh;bottom:auto;height:30cqh;transform:translateX(-50%) rotate(16deg)"),
                el("ap-coin.png", "left:91%;top:58cqh;bottom:auto;height:20cqh;transform:translateX(-50%) rotate(-22deg)")]
    elif kind == "phone":
        out += [logo(wm, "top:9cqh;width:76cqw"), ring("50%", "47%", "84cqw"),
                el("ap-basket.png", "left:50%;top:47%;bottom:auto;height:auto;width:62cqw;transform:translate(-50%,-50%) rotate(-10deg)"),
                el("ap-ticket.png", "left:30%;bottom:11cqh;height:auto;width:50cqw;transform:translateX(-50%) rotate(-12deg)"),
                el("ap-coin.png", "left:76%;bottom:17cqh;height:auto;width:30cqw;transform:translateX(-50%) rotate(18deg)")]
    else:  # laptop
        out += [ring("21%", "56%", "80cqh"),
                el("ap-football.png", "left:21%;bottom:12cqh;height:64cqh;transform:translateX(-50%) rotate(-6deg)"),
                el("ap-tennis.png", "left:81%;top:14cqh;bottom:auto;height:44cqh;transform:translateX(-50%)"),
                el("ap-coin.png", "left:68%;top:64cqh;bottom:auto;height:18cqh;transform:translateX(-50%) rotate(-14deg)"),
                logo(wm, "top:40cqh;width:40cqw")]
    out.append(SHADE)
    return "".join(out)


# ------------------------------------------------------------------ the twelve project screens
def p0():
    return (img("deadair_bg.webp", "bg", "object-position:50% 60%") + GLOW +
            logo(svg("DEADAIR_wordmark_transparent.svg", pfx="da"), "top:23cqh;width:70cqw") + SHADE)


BIG_JS = """<script>(function(){var B=window.BIG;B.LW=1.6;var s=document.getElementById('bigart');
var sd=B.seed(s);B.tf(sd.g,330,212,-18,.62);
var R=B.pigeon(s);B.posePigeon(R,{x:428,y:244,s:.5,turn:-50,wing:[{up:125,spread:1},{up:125,spread:1}],beak:.7,lid:.15,brow:.4});})();</script>"""


def p1():
    return (grad(("#FF8DB2", "#FF4F8B", "#D93A72"), "40% 45%", "85% 80%") +
            logo(svg("bigger-logo.svg", {"#FF4F8B": "#17161C"}, "bg"), "left:6cqw;top:33cqh;width:56cqw;transform:none;filter:drop-shadow(0 .8cqmin 0 #D93A72)") +
            '<svg id="bigart" class="art" viewBox="0 0 520 250"></svg>' + BIG_JS)


def p2():
    return (img("jurassic-keyart.jpg", "bg", "object-position:50% 40%") +
            logo("JURASSIC<br>PARK", "left:7cqw;top:24cqh;transform:none;text-align:left;font:400 13cqw/.86 Tanker;"
                 "color:#1f2a22;filter:none;letter-spacing:.01em"))


def p3():
    return ('<div class="bg" style="background:#000"></div>' +
            img("interstellar-hole.jpg", "bg", "width:200cqw;height:auto;left:-50cqw;top:6cqh;inset:auto;"
                "-webkit-mask:linear-gradient(180deg,transparent 0,#000 18%,#000 70%,transparent 100%)") +
            '<div class="glow"></div>' +
            logo("INTER<br>STELLAR", "top:71cqh;font:400 9.6cqw/1.15 AnyW;letter-spacing:.2em;color:#f3e6cf;padding-left:.2em") + SHADE)


def p4():
    return babyboo("v", ("#5a3608", "#24150a", "#0b0704"), "manuka_cut.png")


def p5():
    return (img("struja.png", "bg", "object-position:50% 40%") + GLOW +
            logo(svg("struja-logo.svg", pfx="st"), "top:60cqh;width:66cqw") + SHADE)


def p6():
    return (img("halfcourt-aerial.jpg", "bg", "filter:brightness(.62)") + GLOW +
            logo(svg("halfcourt-logo.svg", {"#111314": "#CCF23D"}, "hc"), "top:16cqh;width:50cqw") + SHADE)


def p7():
    return (img("accord-v.png", "bg") + GLOW +
            logo(svg("accord-logo.svg", {"#0D0C10": "#fff"}, "ac"), "top:9cqh;width:84cqw") + SHADE)


def p8():
    return (grad(BALL_G["purple"]) + GLOW +
            logo("BALLIES", "top:15cqh;width:92cqw;font:400 25cqw/1 Tanker;color:#fff") +
            el("ballie_13.png", "height:80cqh") + SHADE)


def p9():
    return ('<div class="bg" style="background:radial-gradient(80% 90% at 40% 35%,#F6F1E6 0,#ECE5D6 55%,#d9cfba 100%)"></div>' +
            logo(umbra_cast("um"), "top:36cqh;width:62cqw;filter:none"))


def p10():
    boards = "".join(
        f'<div class="board" style="left:{x}cqw;top:{y}cqh;width:{w}cqw;transform:rotateY({r}deg)">'
        f'<img src="streets-{n}.png" alt=""></div>'
        for n, x, y, w, r in ((0, 4, 14, 34, 34), (2, 34, 10, 34, 0), (4, 64, 14, 34, -34)))
    return ('<div class="bg" style="background:radial-gradient(90% 80% at 50% 30%,#2a1f14 0,#120d09 50%,#050505 100%)"></div>' +
            '<div class="glow" style="--gy:100%;background:radial-gradient(60% 50% at 50% 100%,rgba(255,210,63,.6),transparent 70%);opacity:.35"></div>' +
            f'<div class="stage">{boards}</div>' +
            logo("LIVE ON THE STREETS", "top:73cqh;font:800 6.2cqw/1 Supreme;letter-spacing:.06em;color:#fff") + SHADE)


def q1():
    return (img("apsis_bg.png", "bg", "object-position:50% 40%") + GLOW +
            logo(svg("apsis-wordmark.svg", pfx="q1"), "top:34cqh;width:64cqw;opacity:.96") +
            el("player_m.png", "height:120cqh;bottom:-12cqh") + SHADE)


# ------------------------------------------------------------------ the 36 cards, in wall order
# (id, slot class or None, shape, project, art html, extra style vars, tone)
def cards():
    C = [
        ("deadair", "p0", "p0", "deadair", p0(), "--gx:52%;--gy:55%;--go:.2", "dark"),
        ("bigger", "p1", "pw", "bigger", p1(), "", "dark"),
        ("jurassic", "p2", "pw", "jurassic", p2(), "", "light"),
        ("interstellar", "p3", "pv", "interstellar", p3(), "--gy:42%;--go:.22", "dark"),
        ("babyboo", "p4", "pv", "babyboo", p4(), "--gy:60%;--go:.55", "dark"),
        ("struja", "p5", "pw", "struja", p5(), "--gy:45%;--go:.3", "dark"),
        ("halfcourt", "p6", "pw", "halfcourt", p6(), "--go:.22", "dark"),
        ("accord", "p7", "pv", "accord", p7(), "--gy:58%;--go:.35", "dark"),
        ("ballies", "p8", "pv", "ballies", p8(), "--gy:52%;--go:.5", "dark"),
        ("umbra", "p9", "pw", "umbra", p9(), "", "light"),
        ("live", "p10", "pw", "live", p10(), "", "dark"),
        ("apsis", "q1", "pw", "apsis", q1(), "--go:.25", "dark"),
        # the older work around them
        ("fsu-space", None, "xl", "fsu", fsu("xl", "fsu-space.jpg", pfx="f1"), "--go:.3", "dark"),
        ("ballies-h2h", None, "tile", "ballies", ballies("tile", "red", [1, 2]), "--gy:55%;--go:.45", "dark"),
        ("fsu-hortus", None, "w", "fsu", fsu("w", "fsu-hortus.jpg", pfx="f2"), "--gx:70%;--go:.3", "dark"),
        ("bb-breakglass", None, "tile", "babyboo", babyboo("tile", ("#c8323a", "#5a0f16", "#1a0507"), "bb-breakglass.png", "rgba(255,107,90,.4)"), "--a:#ff6b5a;--go:.45", "dark"),
        ("bb-cottonseed", None, "v", "babyboo", babyboo("v", ("#5f7a98", "#26364a", "#0a1018"), "bb-cottonseed.png", "rgba(200,220,240,.35)", h=68), "--a:#bcd3ea;--go:.4", "dark"),
        ("ballies-sportsbooks", None, "tile", "ballies", ballies("tile", "lemon", [3]), "--a:#fff3a0;--go:.4", "dark"),
        ("fsu-meeting", None, "tile", "fsu", fsu("tile", "fsu-meeting.jpg", pfx="f3"), "--go:.3", "dark"),
        ("ballies-you-vs-ai", None, "tile", "ballies", ballies("tile", "blue", [4, 5]), "--go:.45", "dark"),
        ("bb-macadamia", None, "v", "babyboo", babyboo("v", ("#c98a4b", "#6b3f1a", "#1e1008"), "bb-macadamia.png"), "--go:.45", "dark"),
        ("bb-carousel", None, "tile", "babyboo", babyboo("tile", ("#f3d98a", "#b38a2e", "#2e2208"), "bb-carousel.png", "rgba(255,230,150,.4)"), "--a:#ffe28a;--go:.35", "dark"),
        ("ballies-carter", None, "tile", "ballies", ballies("tile", "sunset", [6]), "--a:#ffb36b;--go:.4", "dark"),
        ("ballies-ambassadors", None, "w", "ballies", ballies("w", "purple", [7, 8, 9]), "--go:.45", "dark"),
        ("bb-manuka", None, "v", "babyboo", babyboo("v", ("#7a4a0c", "#2e1a08", "#0b0704"), "manuka_cut.png", manuka_still=True), "--gy:34%;--go:.6", "dark"),
        ("ballies-edelman", None, "tile", "ballies", ballies("tile", "teal", [10]), "--go:.45", "dark"),
        ("apsis-desk", None, "w", "apsis", apsis("desk", "a1"), "--gx:17%;--gy:52%;--go:.3", "dark"),
        ("bb-claw", None, "tile", "babyboo", babyboo("tile", ("#f59ac0", "#a8406e", "#2a0b1a"), "bb-claw.png", "rgba(255,170,210,.4)"), "--a:#ff9ccc;--go:.4", "dark"),
        ("ballies-mint", None, "w", "ballies", ballies("w", "mint", [11, 12]), "--go:.4", "dark"),
        ("apsis-phone", None, "v", "apsis", apsis("phone", "a2"), "--gy:47%;--go:.3", "dark"),
        ("ballies-hustler", None, "w", "ballies", ballies("w", "sunset", [14, 16]), "--a:#ffb36b;--go:.4", "dark"),
        ("apsis-laptop", None, "w", "apsis", apsis("laptop", "a3"), "--gx:21%;--gy:56%;--go:.3", "dark"),
        ("ballies-brown", None, "tile", "ballies", ballies("tile", "blue", [17]), "--go:.45", "dark"),
        ("fsu-motion", None, "v", "fsu", fsu("v", "fsu-motion.jpg", pfx="f5"), "--go:.3", "dark"),
        ("ballies-metacourt", None, "w", "ballies", ballies("w", "gold", [18, 19, 20]), "--a:#ffd27a;--go:.4", "dark"),
        ("fsu-harmony", None, "tile", "fsu", fsu("tile", "fsu-harmony.jpg", square=True, pfx="f6"), "--go:.3", "dark"),
    ]
    return C


KICK = {"deadair": "Short film · Trailer", "bigger": "Animated short", "jurassic": "Fan poster · Unofficial",
        "interstellar": "Fan art · Motion poster", "babyboo": "Product film · Manuka honey", "struja": "Living identity",
        "halfcourt": "Broadcast identity", "accord": "Fragrance identity", "ballies": "Character series · Web3 sports",
        "umbra": "Living identity", "live": "LED boards · Billboards", "apsis": "Sportsbook UX · concept"}


def bar(cid):
    return 20 + int(hashlib.md5(cid.encode()).hexdigest()[:4], 16) % 61


CSS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "card.css"), encoding="utf-8").read()


def page(C):
    out = ["<!doctype html><html><head><meta charset='utf-8'><style>", CSS, "</style></head><body>",
           '<svg width="0" height="0" style="position:absolute"><filter id="n"><feTurbulence type="fractalNoise" '
           'baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  '
           '0 0 0 0 .5  0 0 0 1 0"/></filter></svg>', '<script src="bigger.js"></script>']
    for cid, slot, shape, proj, art, vars_, tone in C:
        W, H = SHAPE[shape]
        a = ACC[proj]
        kick = KICK[proj] if slot else LABEL[cid].split(" · ", 1)[1]
        out.append(
            f'<figure class="card {tone}" id="{cid}" style="width:{W}px;height:{H}px;--a:{a};--on:{ON.get(proj, "#000")};{vars_}">'
            f'{art}<svg class="grain"><rect width="100%" height="100%" filter="url(#n)"/></svg>'
            f'<div class="chrome"><div class="safe"><i></i><i></i><i></i><i></i></div>'
            f'<div class="bug"><b>CH {CH[proj]:02d}</b><span>{html.escape(NAME[proj])}</span></div>'
            f'<div class="fmt">{"LIVE" if slot == "p0" else FMT[shape]}</div>'
            f'<div class="low"><p>{html.escape(kick)}</p><div class="bar" style="--p:{bar(cid)}%"></div></div></div></figure>')
    out.append("</body></html>")
    with open(os.path.join(SRC, "cards.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(out))


# ------------------------------------------------------------------ the wall in index.html
LABEL = {}


def read_wall():
    """the current figures: their opening tags (attributes stay) keyed by card id."""
    s = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    tags = {}
    for m in re.finditer(r'<figure class="tile[^"]*"[^>]*>', s):
        t = m.group(0)
        slot = re.search(r'class="tile(?: s)? (p\d+|q1)"', t)
        rest = s[m.end():s.find("</figure>", m.end())]
        if slot:
            key = slot.group(1)
        else:
            key = re.search(r"media/wall/(?:card-)?([a-z0-9-]+?)-\d+\.(?:webp|avif)", rest).group(1)
        tags[key] = t
        LABEL[key] = html.unescape(re.search(r'data-label="([^"]*)"', t).group(1))
    return s, tags


def figure(tag, cid, slot, shape, proj, made, tone):
    if slot == "p0":
        tag = re.sub(r'data-label="[^"]*"', 'data-label="DEAD AIR · Short film trailer"', tag)
    sz = SIZES[shape]
    av = ", ".join(f"media/wall/card-{cid}-{w}.avif {w}w" for w, _ in made)
    wb = ", ".join(f"media/wall/card-{cid}-{w}.webp {w}w" for w, _ in made)
    w0, h0 = made[0]
    lazy = 'fetchpriority="high"' if slot == "p0" else 'loading="lazy"'
    fmt = FMT[shape] if slot != "q1" else "21:9"
    kick = KICK[proj] if slot else LABEL[cid].split(" · ", 1)[1]
    on = ON.get(proj, "#000")
    light = " ch--light" if tone == "light" else ""
    return (f'{tag}<picture><source type="image/avif" srcset="{av}" sizes="{sz}"><img srcset="{wb}" sizes="{sz}" '
            f'src="media/wall/card-{cid}-{w0}.webp" alt="" width="{w0}" height="{h0}" decoding="async" {lazy}></picture>'
            f'<span class="ch{light}" style="--a:{ACC[proj]};--on:{on}"><span class="ch__safe"><i></i><i></i><i></i><i></i></span>'
            f'<span class="ch__bug"><b>CH {CH[proj]:02d}</b><span>{html.escape(NAME[proj])}</span></span>'
            f'<span class="ch__fmt">{fmt}</span><span class="ch__low"><span class="ch__kick">{html.escape(kick)}</span>'
            f'<span class="ch__bar" style="--p:{bar(cid)}%"></span></span></span></figure>')


def encode(cid, shape):
    im = Image.open(os.path.join(PNG, cid + ".png")).convert("RGB")
    made = []
    for w in WIDTHS[shape]:
        r = im if w == im.width else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        base = os.path.join(OUT, f"card-{cid}-{w}")
        r.save(base + ".webp", quality=76, method=6)
        r.save(base + ".avif", quality=56)
        made.append((w, r.height))
    return made


if __name__ == "__main__":
    s, tags = read_wall()
    C = cards()
    page(C)
    if "--page" in sys.argv:
        sys.exit(0)
    subprocess.run(["node", os.path.join(ROOT, "tools", "cards", "render.mjs"), os.path.join(SRC, "cards.html"),
                    PNG, "--chrome", CHROME], check=True)
    if "--render" in sys.argv:
        sys.exit(0)
    os.makedirs(OUT, exist_ok=True)
    figs = []
    for cid, slot, shape, proj, art, vars_, tone in C:
        made = encode(cid, shape)
        figs.append(figure(tags[slot or cid], cid, slot, shape, proj, made, tone))
        print(f"{cid:22} {made}", file=sys.stderr)
    ind = "\n            "
    block = (f"<!-- wall:start -->{ind}" + ind.join(figs[:12]) + f"{ind}<!-- the older work around them -->{ind}" +
             ind.join(figs[12:]) + f"{ind}<!-- wall:end -->")
    if "<!-- wall:start -->" in s:
        s = re.sub(r"<!-- wall:start -->.*?<!-- wall:end -->", lambda m: block, s, flags=re.S)
    else:
        a = s.index('<div class="wall__grid">') + len('<div class="wall__grid">')
        b = s.index("</div>", a)
        s = s[:a] + "\n            " + block + "\n          " + s[b:]
    with open(os.path.join(ROOT, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(s)
    print("index.html: wall written", file=sys.stderr)
