# -*- coding: utf-8 -*-
"""The green corridor from the Green Corridor Simulator, for the wool thread: cell/corridor_edges.js.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" build_corridor_js.py [path/to/edges.geojson]

22 Sep: "we use this polyline ... so the green spine is not a direct offset of the railway but thicker and thinner
based on the context conditions". The corridor app (03_Growth Simulator/03_App/v13, "Extract polyline") writes the
corridor's two edges as closed polylines in BNG metres: "corridor edge, out" (outside the loop) and "corridor edge,
in" (inside it), with the railway it measured them from. This reads that file -- only reads it; the corridor app is
never touched -- and gives every edge point its CHAINAGE: metres along the railway from P1 (cell/rail_v12.js, the
same v12 line the corridor app used), found by projecting the point onto the line. The cell page then cuts each
cell's stretch of corridor out of the two edges by chainage, exactly as it cut the old fixed-width band.

    window.LC_GREEN = { source, year, lengthM, maxHalfM, out: {s: [...], p: [[E, N], ...]}, in: {...}, checks }

Each edge is sorted by chainage from its lowest value, so the page can find the edge opposite any point of the
railway with a binary search. Checked here, and the build stops if a check fails: the file's spine lies on the
railway; "out" is on the railway's left (the loop runs clockwise, so left is outside) and "in" on its right; the
chainage never runs backwards along either edge. Default input: the v13 sample (the same file as v14's
samples/green_spine_2100_v13.geojson).
"""
import io, json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
ROOT = os.path.abspath(os.path.join(V, "..", "..", ".."))
DEFAULT = os.path.join(ROOT, "03_Growth Simulator", "03_App", "v13", "samples", "greencorridor_edges_2100_bng.geojson")
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
OUT = os.path.join(V, "html support files", "cell", "corridor_edges.js")

# the railway exactly as cell/rail_v12.js has it (build_rail_js.py): every second point of the v12 loop, closed
R = np.load(os.path.join(V, "assets", "rail_v12_loop.npy"))[::2].astype(float)
NR = len(R)
seg = np.vstack([R[1:], R[:1]]) - R                     # segment i: R[i] -> R[i+1], the last one closing the loop
segL = np.hypot(seg[:, 0], seg[:, 1])
C = np.concatenate([[0.0], np.cumsum(segL)])            # C[i] = chainage of R[i]; C[NR] = the whole loop
T = float(C[-1])


def project(P):
    """Chainage, distance and side (+1 left of the railway's direction, -1 right) of each point P[k]."""
    s = np.empty(len(P)); d = np.empty(len(P)); side = np.empty(len(P))
    for k, q in enumerate(P):
        dd = np.hypot(R[:, 0] - q[0], R[:, 1] - q[1])
        i0 = int(dd.argmin())
        best = (np.inf, 0.0, 1.0)
        for i in ((i0 - 2) % NR, (i0 - 1) % NR, i0, (i0 + 1) % NR):
            a, v = R[i], seg[i]
            l2 = float(v @ v)
            t = 0.0 if l2 == 0 else min(1.0, max(0.0, float((q - a) @ v) / l2))
            f = a + v * t
            dist = float(math.hypot(*(q - f)))
            if dist < best[0]:
                cr = v[0] * (q[1] - a[1]) - v[1] * (q[0] - a[0])  # > 0: left of the direction of travel
                best = (dist, (C[i] + t * segL[i]) % T, 1.0 if cr >= 0 else -1.0)
        d[k], s[k], side[k] = best
    return s, d, side


gj = json.load(io.open(SRC, encoding="utf-8"))
feats = gj.get("features", [])
def line(layer):
    f = [x for x in feats if (x.get("properties") or {}).get("layer") == layer]
    if not f: sys.exit("no feature with layer %r in %s" % (layer, SRC))
    c = np.array(f[0]["geometry"]["coordinates"], dtype=float)
    if len(c) > 2 and np.allclose(c[0], c[-1]): c = c[:-1]  # closed on the wire: drop the repeated point
    return c, f[0].get("properties") or {}

out, pOut = line("corridor edge, out")
inn, pIn = line("corridor edge, in")
spine, _ = line("spine")
year = pOut.get("year")

# 1 · the file's spine is this railway
_, dSp, _ = project(spine[:: max(1, len(spine) // 400)])
if dSp.max() > 10:
    sys.exit("the file's spine is %.1f m off cell/rail_v12.js -- a different railway; refusing" % dSp.max())

edges, checks = {}, {"spineOffM": round(float(dSp.max()), 2)}
for name, P, want in (("out", out, 1.0), ("in", inn, -1.0)):
    s, d, side = project(P)
    far = d > 30
    wrong = int(np.sum(side[far] != want))
    if wrong:
        sys.exit("%d points of the '%s' edge more than 30 m from the railway are on the wrong side" % (wrong, name))
    # sorted by chainage from the lowest: the list starts after P1's seam
    k0 = int(np.argmin(s))
    s = np.roll(s, -k0); P = np.roll(P, -k0, axis=0); d = np.roll(d, -k0)
    back = int(np.sum(np.diff(s) < -1e-6))
    if back:
        sys.exit("the chainage runs backwards %d times along the '%s' edge: it folds, so it cannot be read by chainage" % (back, name))
    edges[name] = {"s": [round(float(v), 1) for v in s], "p": [[round(float(a), 1), round(float(b), 1)] for a, b in P]}
    checks[name] = {"points": int(len(P)), "medianM": round(float(np.median(d)), 1), "maxM": round(float(d.max()), 1),
                    "within30m": int(np.sum(d <= 30)), "firstS": round(float(s[0]), 1), "lastS": round(float(s[-1]), 1)}

maxHalf = max(checks["out"]["maxM"], checks["in"]["maxM"])
try:
    src_rel = os.path.relpath(SRC, ROOT)
except ValueError:                                      # another drive (e.g. the browser's Downloads on C:)
    src_rel = os.path.basename(SRC)
data = {"source": src_rel.replace("\\", "/"), "year": year, "lengthM": round(T, 2),
        "maxHalfM": maxHalf, "out": edges["out"], "in": edges["in"], "checks": checks}
js = ("/* Loop City -- the green corridor's two edges from the Green Corridor Simulator (\"Extract polyline\"), BNG metres,\n"
      "   each point with its chainage along cell/rail_v12.js. Written by build/build_corridor_js.py from\n"
      "   " + data["source"] + " (" + str(year) + "). */\nwindow.LC_GREEN = " + json.dumps(data, separators=(",", ":")) + ";\n")
# never overwrite: the corridor the page had before goes to archive/_corridor_edges/ with the time it was replaced
if os.path.exists(OUT):
    import shutil, time
    ARC = os.path.join(V, "archive", "_corridor_edges")
    os.makedirs(ARC, exist_ok=True)
    kept = os.path.join(ARC, "corridor_edges %s.js" % time.strftime("%Y-%m-%d %H%M%S"))
    shutil.copy2(OUT, kept)
    print("kept      the previous corridor as %s" % os.path.relpath(kept, V))
io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
print("source    %s (%s)" % (data["source"], year))
print("railway   %d points, %.2f km; the file's spine within %.2f m of it" % (NR, T / 1000, checks["spineOffM"]))
for n in ("out", "in"):
    c = checks[n]
    print("%-9s %d points, from the railway: median %.0f m, max %.0f m, %d within 30 m" % (n, c["points"], c["medianM"], c["maxM"], c["within30m"]))
print("wrote     %s (%.0f kB)" % (OUT, os.path.getsize(OUT) / 1024))
