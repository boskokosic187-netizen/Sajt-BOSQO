"""Contact sheet of rendered cards: python -I tools/cards/sheet.py <pngdir> <out.jpg> [scale]"""
import os, sys
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
sc = float(sys.argv[3]) if len(sys.argv) > 3 else .5
order = [l.split('id="')[1].split('"')[0] for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '_izvori', 'cards', 'src', 'cards.html'), encoding='utf-8') if '<figure class="card' in l]
ims = [Image.open(os.path.join(d, i + '.png')).convert('RGB') for i in order]
ims = [im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS) for im in ims]
W, G = 2400, 16
rows, row, x = [], [], G
for im in ims:
    if x + im.width + G > W and row:
        rows.append(row); row, x = [], G
    row.append(im); x += im.width + G
rows.append(row)
H = G + sum(max(i.height for i in r) + G for r in rows)
sheet = Image.new('RGB', (W, H), (17, 17, 17)); y = G
for r in rows:
    x = G
    for im in r:
        sheet.paste(im, (x, y)); x += im.width + G
    y += max(i.height for i in r) + G
sheet.save(out, quality=88); print(sheet.size)
