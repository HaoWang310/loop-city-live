# -*- coding: utf-8 -*-
"""The five station cells, and what each one hands the wool thread.

    "C:\\Users\\Shreya\\AppData\\Local\\Python\\bin\\python.exe" draw_wool_sample.py

Reads wool_sample.json, posted by the app through catcher.py, and writes a sheet into v7/tiles/.

What this shows and what it does NOT. It shows the INPUTS: the cell, the spine that is the railway
clipped to it, and the centre that is the station. It does not show any thread, because the solver
is not ported yet. Drawing a plausible-looking internal network before the algorithm is read would
be the most misleading thing this project could produce, so the sheet says what it is.
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
GREEN, ORANGE, ROAD = "#2f7d4f", "#e8591a", "#b9ad9c"
for fam in ("DM Sans", "Inter", "Segoe UI"):
    try:
        font_manager.findfont(fam, fallback_to_default=False)
        plt.rcParams["font.family"] = fam
        break
    except Exception:
        continue

J = json.load(io.open(os.path.join(HERE, "wool_sample.json"), encoding="utf-8"))
mE, mN = J["cellE"], J["cellN"]
cells = J["cells"]
wool = [c for c in cells if c["wool"]]
roads = J["roads"]
nodes = {n["id"]: n for n in J["nodes"]}


def ring_xy(flat):
    a = np.asarray(flat, float)
    return a[0::2], a[1::2]


def km(v_cells, axis="x"):
    return v_cells * (mE if axis == "x" else mN) / 1000.0


def draw_cell(ax, c, detail=False):
    """One cell: its boundary, the roads that bound it, the spine, the centre."""
    x, y = ring_xy(c["ring"])
    x, y = km(x), km(y, "y")
    if detail:
        pad = 0.06 * max(x.max() - x.min(), y.max() - y.min())
        x0, x1 = x.min() - pad, x.max() + pad
        y0, y1 = y.min() - pad, y.max() + pad
        # the road network, as context, only where it falls in the window
        for e in roads:
            a = np.asarray(e, float)
            ex, ey = km(a[0::2]), km(a[1::2], "y")
            if ex.max() < x0 or ex.min() > x1 or ey.max() < y0 or ey.min() > y1:
                continue
            ax.plot(ex, ey, color=ROAD, lw=0.7, zorder=1)
    ax.fill(x, y, color=GREEN, alpha=0.10, zorder=2)
    ax.plot(x, y, color=GREEN, lw=1.7, zorder=3)
    # the spine: the railway, clipped to this cell
    for run in c["rail"]:
        a = np.asarray(run, float)
        ax.plot(km(a[:, 0]), km(a[:, 1], "y"), color=GREEN, lw=2.0, ls=(0, (5, 3)), zorder=4)
    # the centre: the station the threads converge on
    for sid in c["stations"]:
        n = nodes.get(sid)
        if not n:
            continue
        cx, cy = km(n["x"]), km(n["y"], "y")
        ax.plot([cx], [cy], marker="o", ms=7, mfc="none", mec=GREEN, mew=1.8, zorder=6)
        ax.plot([cx - 0.9, cx + 0.9], [cy, cy], color=GREEN, lw=1.2, zorder=6)
        ax.plot([cx, cx], [cy - 0.9, cy + 0.9], color=GREEN, lw=1.2, zorder=6)
    ax.set_aspect("equal")
    ax.invert_yaxis()                      # sheet rows run south, as everywhere in this app
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_color(RULE); s.set_linewidth(0.7)


n = len(wool)
fig_w = 13.2
pw = (fig_w - 0.9 - 0.14 * (n - 1)) / n
fig_h = pw + 3.0
fig = plt.figure(figsize=(fig_w, fig_h), dpi=180, facecolor="white")

fig.text(0.034, 1 - 0.34 / fig_h, "The station cells, and what each hands the wool thread",
         fontsize=16.5, color=INK, va="top")
fig.text(0.034, 1 - 0.70 / fig_h,
         "Combined app v7  \u00b7  zones 05, 06  \u00b7  2100  \u00b7  smallest cell 30 km\u00b2  "
         "\u00b7  every one of the five stations has a cell, and the railway crosses all five",
         fontsize=9, color=INK2, va="top")

for i, c in enumerate(wool):
    x0 = 0.034 + i * (pw / fig_w + 0.011)
    ax = fig.add_axes([x0, 1.75 / fig_h, pw / fig_w, pw / fig_h])
    draw_cell(ax, c, detail=True)
    st = ", ".join(c["stations"])
    ax.set_title("%s  \u00b7  %s" % (c["id"], st), fontsize=10.5, color=INK, pad=6, loc="left")
    fig.text(x0, 1.62 / fig_h,
             "%s km\u00b2   spine %s km   boundary %d points"
             % (("%.0f" % c["km2"]), ("%.1f" % c["railKm"]), len(c["ring"]) // 2),
             fontsize=8, color=INK2, va="top")

fig.text(0.034, 0.030,
         "THE CENTRE is the station: where a cell has one, the threads converge on it, which is "
         "what the original does with the single centre its two merge trees grow toward.\n"
         "THE SPINE is the railway clipped to the cell \u2014 dashed above \u2014 not the seven "
         "hard-coded anchor points the original carries in a local Rhino frame. Everything here "
         "is metres on the British National Grid.\n\n"
         "What is NOT here is any thread. The solver is being read out of the original line by "
         "line and has not been ported yet, and a plausible-looking internal network drawn before "
         "that reading is finished would be the most\nmisleading thing this project could "
         "produce. These are the inputs, and they are real.",
         fontsize=8, color=INK2, va="bottom", linespacing=1.6)

dst = os.path.join(TILES, "01 - the station cells and their wool inputs.png")
fig.savefig(dst, facecolor="white")
print("wrote", dst)
print("cells drawn: " + ", ".join("%s(%s) %.0f km2, spine %.1f km"
      % (c["id"], "/".join(c["stations"]), c["km2"], c["railKm"]) for c in wool))
