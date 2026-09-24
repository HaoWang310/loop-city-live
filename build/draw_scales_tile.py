# -*- coding: utf-8 -*-
"""Loop City v8 -- the three scales, on one sheet.

    "C:\\Users\\Shreya\\AppData\\Local\\Python\\bin\\python.exe" draw_scales_tile.py

The three pictures are the apps' own canvases, taken out of the running pages (tiles/_src/), not
screenshots: the loop at the north-west quadrant in 2100, the quadrant with its cells and one cell
selected, and that cell on its own page with the wool thread run on it. Writes into v8/tiles/.
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(V, "tiles", "_src")
INK, INK2, INK3, ACCENT = "#211d1a", "#6d6560", "#9c968c", "#8f5f38"
for fam in ("DM Sans", "Inter", "Segoe UI"):
    try:
        font_manager.findfont(fam, fallback_to_default=False)
        plt.rcParams["font.family"] = fam
        break
    except Exception:
        continue

# each picture cut to what the app drew, not the paper round it
PANELS = [
    ("tile_loop.png", (84, 4, 996, 836),
     "1 \u00b7 The loop", "Growth Simulator v9.8, the whole loop grown, 2100.\nThe north-west quadrant chosen on the key plan."),
    ("tile_quadrant.png", (20, 96, 732, 748),
     "2 \u00b7 The quadrant", "The slime mould and the growth simulator on one clock.\n19 cells at 2100, C11 selected (blue)."),
    ("tile_cell.png", (150, 0, 1082, 900),
     "3 \u00b7 The cell", "C11, converging on P1, 230 km\u00b2, in metres.\nThe wool thread run on it: the v7 port, as it stands."),
]
ARROWS = [
    ("Open in the\ncombined app \u2192", "takes the piece\nchosen, as a box in\nBNG metres, and the\ncatalogue settings"),
    ("Open this cell in\nthe wool thread \u2192", "takes the ring, the\nspine, the station or\ncorridor, gateways,\nroads, fabric, layers"),
]

ims = []
for f, box, t, s in PANELS:
    im = Image.open(os.path.join(SRC, f)).convert("RGB").crop(box)
    ims.append((im, t, s))

H_IN = 5.2                                         # picture height, inches
gap = 1.75                                         # the jump between two scales
widths = [H_IN * im.width / im.height for im, _, _ in ims]
left, right, top, bot = 0.45, 0.45, 1.25, 1.35
W_IN = left + right + sum(widths) + gap * (len(ims) - 1)
fig = plt.figure(figsize=(W_IN, H_IN + top + bot), dpi=170, facecolor="white")
FW, FH = W_IN, H_IN + top + bot

fig.text(left / FW, 1 - 0.33 / FH, "Loop City v8 \u00b7 three scales in one window", fontsize=17, color=INK, va="top")
fig.text(left / FW, 1 - 0.68 / FH,
         "The loop, a quadrant, a cell. Each is its own app; the bar along the top of Loop City.html goes down "
         "and back up, and a scale you leave stays exactly as you left it.",
         fontsize=9.2, color=INK2, va="top")

x = left
for i, (im, t, s) in enumerate(ims):
    w = widths[i]
    ax = fig.add_axes([x / FW, bot / FH, w / FW, H_IN / FH])
    ax.imshow(im, interpolation="lanczos")
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values():
        sp.set_color("#d9d3c9"); sp.set_linewidth(0.8)
    fig.text(x / FW, (bot - 0.16) / FH, t, fontsize=11.5, color=INK, va="top", fontweight="bold")
    fig.text(x / FW, (bot - 0.44) / FH, s, fontsize=8.6, color=INK2, va="top", linespacing=1.5)
    if i < len(ARROWS):
        cx = (x + w + gap / 2) / FW
        cy = (bot + H_IN / 2) / FH
        a, n = ARROWS[i]
        fig.patches.append(matplotlib.patches.FancyBboxPatch(
            ((x + w + 0.16) / FW, cy - 0.25 / FH), (gap - 0.32) / FW, 0.50 / FH,
            boxstyle="round,pad=0,rounding_size=0.012", transform=fig.transFigure,
            facecolor=ACCENT, edgecolor=ACCENT))
        fig.text(cx, cy, a, fontsize=7.6, color="white",
                 ha="center", va="center", fontweight="bold", linespacing=1.3)
        fig.text(cx, cy - 0.38 / FH, n, fontsize=6.8, color=INK3, ha="center", va="top", linespacing=1.45)
    x += w + gap

fig.text(left / FW, 0.2 / FH,
         "Only the north-west quadrant (zones 05 and 06) goes down to the combined app, because it is the only "
         "one the slime mould has been run on; elsewhere the loop says so. One cell at a time goes down to the "
         "wool thread, which is the next piece of work.",
         fontsize=7.8, color=INK3, va="bottom")

os.makedirs(os.path.join(V, "tiles"), exist_ok=True)
dst = os.path.join(V, "tiles", "01 - three scales, the loop to a quadrant to a cell.png")
fig.savefig(dst, facecolor="white")
print("wrote", dst)
