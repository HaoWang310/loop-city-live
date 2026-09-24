# -*- coding: utf-8 -*-
"""The wool thread, run in the five station cells.

    "C:\\Users\\Shreya\\AppData\\Local\\Python\\bin\\python.exe" draw_wool_run.py

Reads wool_run.json, posted by the app through catcher.py, and writes a sheet into v7/tiles/.
Drawn from the geometry the app produced, not from screenshots of it.
"""
import os, io, json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
TILES = os.path.join(V, "tiles")
os.makedirs(TILES, exist_ok=True)

INK, INK2, RULE = "#211d1a", "#6d6560", "#cfc7bf"
MOULD = "#3b2d1e"        # the mould's roads -- the network that makes the cells
L1, L2 = "#1f5e3a", "#6fa585"
THREAD = (47 / 255, 125 / 255, 79 / 255, 0.13)
for fam in ("DM Sans", "Inter", "Segoe UI"):
    try:
        font_manager.findfont(fam, fallback_to_default=False)
        plt.rcParams["font.family"] = fam
        break
    except Exception:
        continue

J = json.load(io.open(os.path.join(HERE, "wool_run.json"), encoding="utf-8"))
mE, mN = J["cellE"], J["cellN"]
cells, roads = J["cells"], J["roads"]
nodes = {n["id"]: n for n in J["nodes"]}


def km(a, axis):
    a = np.asarray(a, float)
    return a * (mE if axis == "x" else mN) / 1000.0


def xy(flat):
    a = np.asarray(flat, float)
    return km(a[0::2], "x"), km(a[1::2], "y")


def draw_cell(ax, c):
    rx, ry = xy(c["ring"])
    pad = 0.07 * max(rx.max() - rx.min(), ry.max() - ry.min())
    x0, x1, y0, y1 = rx.min() - pad, rx.max() + pad, ry.min() - pad, ry.max() + pad
    # the mould's roads round it, as the frame the cell was read off
    for e in roads:
        ex, ey = xy(e)
        if ex.max() < x0 or ex.min() > x1 or ey.max() < y0 or ey.min() > y1:
            continue
        ax.plot(ex, ey, color=MOULD, lw=1.5, zorder=2, solid_capstyle="round")
    ax.plot(rx, ry, color="#b9a88f", lw=0.8, zorder=3)
    # the relaxed threads, faint, so the bundling the roads were read from is visible
    for t in c["threads"]:
        tx, ty = xy(t)
        ax.plot(tx, ty, color=THREAD, lw=0.5, zorder=4)
    for s in c["level2"]:
        sx, sy = xy(s)
        ax.plot(sx, sy, color=L2, lw=0.95, zorder=5, solid_capstyle="round")
    for s in c["level1"]:
        sx, sy = xy(s)
        ax.plot(sx, sy, color=L1, lw=1.9, zorder=6, solid_capstyle="round")
    for run in c["rail"]:
        a = np.asarray(run, float)
        ax.plot(km(a[:, 0], "x"), km(a[:, 1], "y"), color=INK, lw=0.9, ls=(0, (4, 2.5)), zorder=7)
    for a in c["anchors"]:
        ax_, ay_ = km(a["x"], "x"), km(a["y"], "y")
        if a["role"] == "gateway":
            ax.plot([ax_], [ay_], marker="o", ms=5, mfc="white", mec=L1, mew=1.3, zorder=9)
        elif a["role"] == "spine":
            ax.plot([ax_], [ay_], marker="o", ms=2.4, mfc=L1, mec=L1, zorder=9)
    for sid in c["station"].split("/"):
        n = nodes.get(sid)
        if n:
            cx, cy = km(n["x"], "x"), km(n["y"], "y")
            ax.plot([cx], [cy], marker="o", ms=8, mfc="#e8c46a", mec=INK, mew=1.1, zorder=10)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1)
    ax.set_aspect("equal"); ax.invert_yaxis()
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color(RULE); s.set_linewidth(0.7)


n = len(cells)
fig_w = 14.0
pw = (fig_w - 0.9 - 0.13 * (n - 1)) / n
fig_h = pw + 3.25
fig = plt.figure(figsize=(fig_w, fig_h), dpi=180, facecolor="white")

tot1 = sum(c["stats"]["km1"] for c in cells)
tot2 = sum(c["stats"]["km2"] for c in cells)
fig.text(0.032, 1 - 0.34 / fig_h, "The wool thread, run in the five station cells",
         fontsize=16.5, color=INK, va="top")
fig.text(0.032, 1 - 0.70 / fig_h,
         "Combined app v7  \u00b7  zones 05, 06  \u00b7  2100  \u00b7  British National Grid, metres  "
         "\u00b7  %d of %d threaded  \u00b7  level 1 %.1f km, level 2 %.1f km"
         % (sum(1 for c in cells if c["stats"]["ok"]), n, tot1, tot2),
         fontsize=9, color=INK2, va="top")

for i, c in enumerate(cells):
    x0 = 0.032 + i * (pw / fig_w + 0.0095)
    ax = fig.add_axes([x0, 2.0 / fig_h, pw / fig_w, pw / fig_h])
    draw_cell(ax, c)
    s = c["stats"]
    ax.set_title("%s  \u00b7  %s" % (c["id"], c["station"]), fontsize=10.5, color=INK, pad=6, loc="left")
    fig.text(x0, 1.86 / fig_h,
             "%.0f km\u00b2  \u00b7  %d gateways (%dN %dS)\n%d threads  \u00b7  magnet %d m\n"
             "level 1 %.1f km  \u00b7  level 2 %.1f km"
             % (c["km2"], s["gatewaysN"] + s["gatewaysS"], s["gatewaysN"], s["gatewaysS"],
                s["threads"], round(s["magRM"]), s["km1"], s["km2"]),
             fontsize=7.6, color=INK2, va="top", linespacing=1.55)

# key
ky = 0.93 / fig_h
kx = 0.032
def key(x, label, **kw):
    fig.lines.append(plt.Line2D([x, x + 0.022], [ky, ky], transform=fig.transFigure, **kw))
    fig.text(x + 0.027, ky, label, fontsize=7.6, color=INK2, va="center")
key(kx,        "mould road, the cell's own edge", color=MOULD, lw=1.5)
key(kx + 0.16, "wool level 1", color=L1, lw=1.9)
key(kx + 0.26, "wool level 2", color=L2, lw=0.95)
key(kx + 0.36, "railway, the spine", color=INK, lw=0.9, ls=(0, (4, 2.5)))
# markers drawn, not typed: DM Sans has no circle glyphs and would print boxes
def mark(x, label, **kw):
    fig.lines.append(plt.Line2D([x], [ky], transform=fig.transFigure, linestyle="none", **kw))
    fig.text(x + 0.009, ky, label, fontsize=7.6, color=INK2, va="center")
mark(kx + 0.50, "gateway, where a road meets the cell", marker="o", ms=5, mfc="white", mec=L1, mew=1.3)
mark(kx + 0.70, "station, the centre", marker="o", ms=7, mfc="#e8c46a", mec=INK, mew=1.1)

fig.text(0.032, 0.028,
         "THE SOLVER is his, ported line for line and tested against his own demo cell: 102,104 "
         "magnet pairs at the first iteration and anchor drift of 1.3726 m max / 0.3933 m mean after "
         "3000, identical to what\nwas measured on his original to the digit. Run here at his own "
         "similarity scale, the magnet range derived from each cell's geometry (158-223 m).\n"
         "THE ROADS are read from the relaxed threads by his own weight, length / (0.32 + thickness^1.28), "
         "level 1 routed from every gateway to the station and level 2 the rest of the bundled wool "
         "that meets it.\nHis road builder is not ported -- it cannot be cut to two levels without "
         "breaking, and carries some thirty thresholds in absolute units that fail at this scale.",
         fontsize=7.4, color=INK2, va="bottom", linespacing=1.6)

dst = os.path.join(TILES, "02 - the wool thread in the five station cells.png")
fig.savefig(dst, facecolor="white")
print("wrote", dst)
