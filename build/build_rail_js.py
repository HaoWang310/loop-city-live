# -*- coding: utf-8 -*-
"""The railway and its stations, for the cell page: cell/rail_v12.js.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" build_rail_js.py

The green corridor is one band along the whole railway, and every cell cuts its piece out of it -- so the
cell page needs the whole line, not only the piece inside each cell. This writes the rail designer's v12
final (assets/rail_v12_loop.npy: 412.14 km, closed, every station on it) every second point, 50 m apart --
the same points the quadrant cuts its cells' spines from -- and the 17 stations from assets/nodes.csv, each
with its chainage along the line. British National Grid metres, to the centimetre.

    window.LC_RAIL = { loop: [[E, N], ...], lengthM, stations: [{id, kind, E, N, s}], source }

A script, not a JSON file, so the page also works opened off the disk. Nothing else is changed.
"""
import csv, io, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
ASSETS = os.path.join(V, "assets")
OUT = os.path.join(V, "html support files", "cell", "rail_v12.js")

R = np.load(os.path.join(ASSETS, "rail_v12_loop.npy"))[::2]
seg = np.hypot(*np.diff(np.vstack([R, R[:1]]), axis=0).T)
C = np.concatenate([[0.0], np.cumsum(seg)])            # chainage of each point; C[-1] = the whole loop
total = float(C[-1])

stations = []
with io.open(os.path.join(ASSETS, "nodes.csv"), newline="", encoding="utf-8") as fh:
    for row in csv.DictReader(fh):
        e, n = float(row["easting"]), float(row["northing"])
        # chainage: the nearest point of the line, then along its segment
        d = np.hypot(R[:, 0] - e, R[:, 1] - n)
        i = int(d.argmin())
        best = (d[i], C[i])
        for j in (i - 1, i):
            a, b = R[j % len(R)], R[(j + 1) % len(R)]
            v = b - a; l2 = float(v @ v)
            t = 0.0 if l2 == 0 else max(0.0, min(1.0, float((np.array([e, n]) - a) @ v) / l2))
            q = a + v * t; dd = float(np.hypot(*(q - [e, n])))
            if dd < best[0]:
                best = (dd, (C[j % len(R)] + t * np.sqrt(l2)) % total)
        stations.append({"id": row["name"].strip(), "kind": row.get("kind", "").strip(), "E": round(e, 2), "N": round(n, 2),
                         "s": round(float(best[1]), 2), "offM": round(float(best[0]), 2)})
stations.sort(key=lambda s: s["s"])

data = {"loop": [[round(float(e), 2), round(float(n), 2)] for e, n in R], "lengthM": round(total, 2),
        "stations": [{k: s[k] for k in ("id", "kind", "E", "N", "s")} for s in stations],
        "source": "London2100 rail designer v12 final (assets/rail_v12_loop.npy, every 2nd point) + assets/nodes.csv"}
js = ("/* Loop City -- the railway (v12 final, closed, 50 m points) and its 17 stations, BNG metres.\n"
      "   Written by build/build_rail_js.py. */\nwindow.LC_RAIL = " + json.dumps(data, separators=(",", ":")) + ";\n")
io.open(OUT, "w", encoding="utf-8", newline="\n").write(js)
print("rail      %d points, %.2f km, closed" % (len(R), total / 1000))
print("stations  %s" % ", ".join("%s %.2f km (%.1f m off)" % (s["id"], s["s"] / 1000, s["offM"]) for s in stations))
print("wrote     %s (%.0f kB)" % (OUT, os.path.getsize(OUT) / 1024))
