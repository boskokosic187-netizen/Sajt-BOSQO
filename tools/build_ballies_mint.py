"""Ballies: the pictures for the mint stage, the key visual on top of work/ballies/.

Everything comes from the collection's own trait layers (media/labs/ballies, the crops the
Mix-a-Ballie lab stacks, on its 1000 x 1180 rig), so nothing here is drawn twice:

  r-NN.webp   each original (rig.json "originals") without its background, for the big card
  bg-K.webp   the four backgrounds, cut to the card's frame (the head stands out above it)
  wall.webp   the curved wall behind: the originals and 40 new Ballies from the same layers,
              flat with their background, one atlas (WALL_COLS columns of CELL px cards),
              dealt into WALL_ROWS rows so the originals land all over the wall
  mint.json   tokens (id, traits, where each trait sits on the character), the wall order,
              trait names and the background light colours; build_cases.py inlines it

Run from the repo:  python tools/build_ballies_mint.py
"""
import json
import os
import random

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAB = os.path.join(ROOT, "media", "labs", "ballies")
OUT = os.path.join(ROOT, "media", "labs", "ballies-mint")

CARD_W = 840                 # the big card's character: never shown wider (css caps it)
FRAME_TOP = 120              # rig px: the frame starts here, the head stands out above it
CELL = (240, 283)            # one card on the wall (css caps the nearest card at this)
WALL_COLS = 10
NEW = 41                     # new Ballies on the wall, besides the originals (60 cards)
WALL_ROWS = 4                # rows of the curved wall, the cards dealt among them
SEED = 9999

# where a trait sits on the character, as a point in its layer's box (x, y fractions);
# the background has no box of its own, so it is a fixed point beside the body
ANCHOR = {"kit": (0.6, 0.17), "no": (0.5, 0.5), "skin": None, "eyes": (0.3, 0.5), "hair": (0.5, 0.2),
          "extra": (0.5, 0.5), "ball": (0.5, 0.5), "mouth": (0.5, 0.5), "arm": (0.5, 0.45)}
BG_POINT = (60, 500)
LIGHT = ["#66eec8", "#b7a6f0", "#f0a466", "#e8e05c"]   # the light each background throws on the stage
ORDER = [2, 8, 10, 4, 13, 20, 6, 17, 3, 12, 1, 19, 7, 14, 5, 18, 9, 16, 11]   # alternate colours and kits

rig = json.load(open(os.path.join(LAB, "rig.json"), encoding="utf-8"))
L, W, H = rig["layers"], rig["w"], rig["h"]
_crops = {}


def crop(l, k):
    if (l, k) not in _crops:
        _crops[l, k] = Image.open(os.path.join(LAB, f'{L[l]["k"]}-{k:02d}.webp')).convert("RGBA")
    return _crops[l, k]


def compose(combo, bg=True):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for l in range(0 if bg else 1, len(L)):
        x, y, w, h = L[l]["items"][combo[l]][1]
        c = crop(l, combo[l])
        im.alpha_composite(c if c.size == (w, h) else c.resize((w, h), Image.LANCZOS), (x, y))
    return im


def anchors(combo):
    pts = []
    for l, layer in enumerate(L):
        k = layer["k"]
        if k == "bg":
            x, y = BG_POINT
        elif k == "skin":          # the cheek, beside the eyes
            ex, ey, ew, eh = L[[m["k"] for m in L].index("eyes")]["items"][combo[[m["k"] for m in L].index("eyes")]][1]
            x, y = ex + 0.12 * ew, ey + 1.0 * eh
        else:
            bx, by, bw, bh = layer["items"][combo[l]][1]
            fx, fy = ANCHOR[k]
            x, y = bx + fx * bw, by + fy * bh
        pts.append([round(x / W * 100, 2), round(y / H * 100, 2)])
    return pts


def main():
    os.makedirs(OUT, exist_ok=True)
    orig = dict((i, c) for i, c in rig["originals"])
    ids = [i for i in ORDER if i in orig] + [i for i in orig if i not in ORDER]
    ch = round(CARD_W * H / W)
    for i in ids:
        compose(orig[i], bg=False).resize((CARD_W, ch), Image.LANCZOS).save(
            os.path.join(OUT, f"r-{i:02d}.webp"), quality=86, alpha_quality=92, method=6)
    fh = round(CARD_W * (H - FRAME_TOP) / W)
    for k in range(len(L[0]["items"])):
        crop(0, k).crop((0, FRAME_TOP, W, H)).convert("RGB").resize((CARD_W, fh), Image.LANCZOS).save(
            os.path.join(OUT, f"bg-{k}.webp"), quality=88, method=6)

    rng = random.Random(SEED)
    seen = {tuple(c) for c in orig.values()}
    new = []
    while len(new) < NEW:
        c = [rng.randrange(len(x["items"])) for x in L]
        if tuple(c) not in seen:
            seen.add(tuple(c))
            new.append(c)
    cards = [orig[i] for i in ids] + new
    rows = -(-len(cards) // WALL_COLS)
    atlas = Image.new("RGB", (CELL[0] * WALL_COLS, CELL[1] * rows), (10, 10, 11))
    for n, c in enumerate(cards):
        atlas.paste(compose(c).convert("RGB").resize(CELL, Image.LANCZOS),
                    ((n % WALL_COLS) * CELL[0], (n // WALL_COLS) * CELL[1]))
    atlas.save(os.path.join(OUT, "wall.webp"), quality=76, method=6)
    deal = list(range(len(cards)))
    random.Random(SEED + 1).shuffle(deal)
    per = -(-len(cards) // WALL_ROWS)      # [atlas cell, original id or 0] per card, row by row
    wall = [[[n, ids[n] if n < len(ids) else 0] for n in deal[r * per:(r + 1) * per]] for r in range(WALL_ROWS)]

    data = {
        "w": W, "h": H, "frame": round(FRAME_TOP / H * 100, 3), "card": [CARD_W, ch], "bgh": fh,
        "cell": list(CELL), "cols": WALL_COLS, "rows": rows, "cards": len(cards),
        "layers": [[x["k"], x["label"], [m[0] for m in x["items"]]] for x in L],
        "light": LIGHT,
        "tokens": [{"id": i, "c": orig[i], "a": anchors(orig[i])} for i in ids],
        "wall": wall,
    }
    json.dump(data, open(os.path.join(OUT, "mint.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"{len(ids)} originals, {len(cards)} wall cards ({rows} rows), {size / 1024:.0f} KB in {OUT}")


if __name__ == "__main__":
    main()
