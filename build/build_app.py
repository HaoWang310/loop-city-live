# -*- coding: utf-8 -*-
"""Assemble the combined Loop City app into one self-contained HTML file.

    "C:\\Users\\Shreya\\AppData\\Local\\Python\\bin\\python.exe" build_app.py

Takes app/template_combined_v10.html and pours into it:

  the config      the class table, the sheet's extent, the spine, and the STATIONS -- the snapped
                  ones from js/nodes_fixed.js if that has been built, because the two models
                  disagreed about where they were by up to 316 m
  the base map    Z0506_belt_base.png as a data URI
  the three masks m_build / m_soil / m_zone, the growth model's own ground, also as data URIs
  the modules     js/*.js in dependency order, inlined

Everything is carried inside the file as text, because a page opened off the disk is not allowed
to read the pixels of an image beside it -- and the masks ARE pixels. That trap caught both parent
apps and is the one thing that must not be undone.

An earlier build is moved, unchanged, into archive/ with its build time. Nothing is overwritten.
"""
import os, sys, json, base64, shutil, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
APP = os.path.join(V, "app", "template_combined_v10.html")
ASSETS = os.path.join(V, "assets")
SUP = os.path.join(V, "html support files")        # 22 Sep: every page Loop City.html loads lives here
JS = os.path.join(SUP, "js")
ARCH = os.path.join(os.path.dirname(V), "archive")
OUT = os.path.join(SUP, "combined_v10.html")

META = os.path.join(ASSETS, "Z0506_belt_meta.json")
PNG = os.path.join(ASSETS, "Z0506_belt_base.png")

# Loaded in this order: nothing here may depend on the main script, which runs last.
MODULES = ["lclink.js", "grid.js", "roads.js", "graph.js", "parcels.js", "wool.js", "cells.js", "growth_data.js", "growth_sim.js", "nodes_fixed.js"]

for p in (APP, META, PNG):
    if not os.path.exists(p):
        sys.exit("missing: %s" % p)

meta = json.load(open(META, encoding="utf-8"))
P, L = meta["palette"], meta["lines"]
zones = meta.get("zones", [5, 6])

# The mould's class table, unchanged from build_app_quadrant.py: (key, colour, label, weight, priority).
# Priority decides who survives when the sheet is reduced to the simulation grid -- a rail line is two
# pixels wide and would vanish under an averaging downsample.
CLASSES = [
    ("paper",     P["paper"],     "Open land",               0.05,  0),
    ("farmland",  P["farmland"],  "Green Belt farmland",     0.00,  1),
    ("greenbelt", P["greenbelt"], "Green Belt",             -0.60,  2),
    ("amenity",   P["amenity"],   "Parks, playing fields",  -0.40,  3),
    ("flood",     P["flood"],     "Flood zone 3",           -2.00,  6),
    ("aonb",      P["aonb"],      "National Landscape",     -4.00,  5),
    ("water",     P["water"],     "Water",                  -6.00,  7),
    ("urban",     P["urban"],     "Existing urban",          1.20,  8),
    ("town",      P["town"],      "Town, outside belt",      0.80,  9),
    ("beltTown",  P["beltTown"],  "Town, joins belt",        2.50, 11),
    ("road",      L["road_nat"],  "Road",                    0.60, 10),
    ("rail",      L["rail"],      "Rail",                    2.00, 13),
    ("radial",    L["radial"],    "Historic radial",         1.60, 12),
    ("orbTun",    L["orb_tun"],   "Orbital, in tunnel",      2.00, 14),
    ("orbOver",   L["orb_over"],  "Orbital, overground",     4.00, 15),
]
if "gbEdge" in P:
    CLASSES.insert(3, ("gbEdge", P["gbEdge"], "Green Belt boundary", -1.20, 4))
classes = [{"key": k, "rgb": list(rgb), "label": lab, "weight": w, "priority": pr}
           for k, rgb, lab, w, pr in CLASSES]

# ---- the stations. The snapped positions win: that is where the railway actually is.
#
# The mould's metadata carries the NOMINAL station positions, which predate the alignment that
# was actually drawn; nodes.csv carries the ones snapped onto it. They differ by up to 316 m
# (S1), and fabric grown round one set with roads routed round the other gives parcels that do
# not close on their stations -- which is the one thing this drawing is for.
#
# The sheet position is recomputed here from the snapped easting and northing through the
# sheet's OWN extent, not through the rounded 35 m: the sheet's pixel is 35.0122 m east and
# 35.0138 m north, and using 35 would put every station about 25 m out on its own.
import csv

nodes = meta.get("nodes", [])
source = "the base map's nominal positions"
csv_path = os.path.join(ASSETS, "nodes.csv")
if os.path.exists(csv_path):
    ex0 = meta["extentBNG"]
    mE = (ex0["e1"] - ex0["e0"]) / meta["size"][0]
    mN = (ex0["n1"] - ex0["n0"]) / meta["size"][1]
    snapped = {}
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            try:
                snapped[row["name"].strip()] = (float(row["easting"]), float(row["northing"]))
            except (KeyError, TypeError, ValueError):
                continue
    out, moved = [], []
    for n in nodes:
        s = snapped.get(n["id"])
        if not s:
            out.append(n); continue
        m = dict(n)
        x, y = (s[0] - ex0["e0"]) / mE, (ex0["n1"] - s[1]) / mN
        d = ((x - n["x"]) * mE) ** 2 + ((y - n["y"]) * mN) ** 2
        d = d ** 0.5
        m["x"], m["y"], m["E"], m["N"] = round(x, 4), round(y, 4), s[0], s[1]
        if d > 50:
            moved.append("%s %.0f m" % (n["id"], d))
        out.append(m)
    nodes = out
    source = "snapped onto the built alignment" + (" -- moved: %s" % ", ".join(moved) if moved else "")

# ---- the railway: the rail designer's v12 final, one closed loop
#
# The base map's metadata carried its own copy of the orbital: an open line that started and ended at P1
# with a 328 m gap, 53 m off the final alignment on average and up to 333 m near P1 -- an earlier trace.
# Every cell whose ring crossed P1 got its spine in two pieces. The line that is the project's railway is
# the rail designer's v12 (05_Final/London2100_RailDesigner_v12/data/loop.npy, copied as
# assets/rail_v12_loop.npy): 412.14 km, closed, every station exactly on it. It goes in here in the sheet's
# own pixels, every second point (50 m apart), and closed explicitly -- first point repeated at the end.
import numpy as np
RAIL = os.path.join(ASSETS, "rail_v12_loop.npy")
spine = meta.get("spine", [])
rail_note = "the base map's own copy (open at P1)"
if os.path.exists(RAIL):
    ex0 = meta["extentBNG"]
    mE_ = (ex0["e1"] - ex0["e0"]) / meta["size"][0]
    mN_ = (ex0["n1"] - ex0["n0"]) / meta["size"][1]
    L = np.load(RAIL)[::2]
    spine = [[round((e - ex0["e0"]) / mE_, 2), round((ex0["n1"] - n) / mN_, 2)] for e, n in L]
    spine.append(list(spine[0]))
    seg = np.hypot(*np.diff(np.asarray(L), axis=0).T)
    rail_note = "v12 final, %d points, %.2f km, closed" % (len(spine), (seg.sum() + np.hypot(*(L[0] - L[-1]))) / 1000)

cfg = {
    "map": {
        "name": "Loop City \u00b7 zones %s" % ", ".join("%02d" % z for z in zones),
        "mPerPx": meta["mPerPx"],
        "size": meta["size"],
        "extentBNG": meta["extentBNG"],
        "wedge": meta["wedge"],
        "spine": spine,
        "nodes": nodes,
        "towns": meta.get("towns", []),
        "zones": zones,
    },
    "classes": classes,
    "simLongEdge": 950,
}


def datauri(path):
    return "data:image/png;base64," + base64.b64encode(open(path, "rb").read()).decode()


html = open(APP, encoding="utf-8").read()


def pour(tag, text):
    global html
    a = "/*__%s__*/" % tag
    if a not in html:
        sys.exit("template has no %s slot" % tag)
    i = html.index(a)
    j = html.index("/*__END__*/", i) + len("/*__END__*/")
    html = html[:i] + text + html[j:]


pour("CONFIG", json.dumps(cfg, separators=(",", ":")))
masks = {}
for name in ("m_build", "m_soil", "m_zone"):
    p = os.path.join(ASSETS, name + ".png")
    if os.path.exists(p):
        masks[name] = datauri(p)
    else:
        print("WARNING: %s.png missing -- the growth model will have no ground" % name)
pour("MASKS", json.dumps(masks, separators=(",", ":")))

# ---- the QGIS base layers, poured in the same way and for the same reason
#
# They were being loaded with fetch(), and fetch is BLOCKED on file:// -- so double-clicking the
# page gave no layers at all, and the catch() swallowed it so nothing said why. Exactly the trap
# the growth masks hit in September. Over http the loose files still work; off the disk these do.
LAYER_DIR = os.path.join(ASSETS, "layers")
lay = {"manifest": None, "png": {}}
man_p = os.path.join(LAYER_DIR, "layers.json")
if os.path.exists(man_p):
    lay["manifest"] = json.load(open(man_p, encoding="utf-8"))
    for L in lay["manifest"].get("layers", []):
        f = os.path.join(LAYER_DIR, L["id"] + ".png")
        if os.path.exists(f):
            lay["png"][L["id"]] = datauri(f)
    print("layers    %d inlined (%.1f MB)"
          % (len(lay["png"]), sum(len(v) for v in lay["png"].values()) / 1e6))
else:
    print("layers    none built yet -- run build_layers.py with the QGIS interpreter")
pour("LAYERS", json.dumps(lay, separators=(",", ":")))

if html.count("__BASEMAP__") != 1:
    sys.exit("expected exactly one __BASEMAP__ slot")
html = html.replace("__BASEMAP__", datauri(PNG))

# ---- the modules, inlined in dependency order
blocks, missing = [], []
for m in MODULES:
    p = os.path.join(JS, m)
    if not os.path.exists(p):
        missing.append(m); continue
    src = open(p, encoding="utf-8").read()
    # A literal </script> inside a string would close the tag we are writing it into.
    src = src.replace("</script>", "<\\/script>")
    blocks.append('<script data-module="%s">\n%s\n</script>' % (m, src))
if missing:
    print("modules not built yet, left out: %s" % ", ".join(missing))
html = html.replace("<!--__MODULES__-->", "\n".join(blocks))

# ---- every revision is kept, inside this version's own folder
#
# The user's rule, and it is the right one: "dont override existing code, each steps need to be
# there, so later i can come back at it", and a revision of v5 is archived as v5.0, v5.1, v5.2
# beside it. So before a build overwrites anything, the CURRENT state -- the template, the
# modules and the built page -- is copied into archive/v<N>.<r>/ whole. Going back is then a
# copy, not an act of archaeology.
REV_FILE = os.path.join(V, "archive", "_revision.txt")
VER = os.path.basename(V)


def archive_current():
    if not os.path.exists(OUT):
        return None                       # nothing built yet: nothing to keep
    os.makedirs(os.path.dirname(REV_FILE), exist_ok=True)
    rev = 0
    if os.path.exists(REV_FILE):
        try:
            rev = int(open(REV_FILE).read().strip())
        except ValueError:
            rev = 0
    dst = os.path.join(V, "archive", "%s.%d" % (VER, rev))
    while os.path.exists(dst):
        rev += 1
        dst = os.path.join(V, "archive", "%s.%d" % (VER, rev))
    os.makedirs(dst)
    dsup = os.path.join(dst, "html support files")          # the archive keeps the working folder's layout
    os.makedirs(dsup)
    shutil.copy2(OUT, os.path.join(dsup, os.path.basename(OUT)))
    shutil.copytree(os.path.join(V, "app"), os.path.join(dst, "app"))
    # the modules, but not the two big data bundles: they are inputs and they do not change
    os.makedirs(os.path.join(dsup, "js"))
    for f in sorted(os.listdir(JS)):
        if f in ("growth_data.js", "assets_inline.js"):
            continue
        if f.endswith(".js"):
            shutil.copy2(os.path.join(JS, f), os.path.join(dsup, "js", f))
    # v8 is three scales in one window, so a revision keeps all of them: the shell, the loop's page
    # and script (not its 3.6 MB of inlined layers, which are inputs), and the cell page.
    for f in ("Loop City.html",):
        if os.path.exists(os.path.join(V, f)):
            shutil.copy2(os.path.join(V, f), os.path.join(dst, f))
    loop = os.path.join(SUP, "loop")
    if os.path.isdir(loop):
        os.makedirs(os.path.join(dsup, "loop", "js"))
        for f in ("index.html",):
            if os.path.exists(os.path.join(loop, f)):
                shutil.copy2(os.path.join(loop, f), os.path.join(dsup, "loop", f))
        for f in ("app.js", "sim.js"):
            if os.path.exists(os.path.join(loop, "js", f)):
                shutil.copy2(os.path.join(loop, "js", f), os.path.join(dsup, "loop", "js", f))
    cell = os.path.join(SUP, "cell")
    if os.path.isdir(cell):
        shutil.copytree(cell, os.path.join(dsup, "cell"))
    open(REV_FILE, "w").write(str(rev + 1))
    return "%s.%d" % (VER, rev)


kept = archive_current()
if kept:
    print("kept the previous state as archive/%s" % kept)

open(OUT, "w", encoding="utf-8").write(html)

ex = meta["extentBNG"]
cellE = (ex["e1"] - ex["e0"]) / cfg["simLongEdge"]
print("sheet     %d x %d px, extent %.1f..%.1f E / %.1f..%.1f N"
      % (meta["size"][0], meta["size"][1], ex["e0"], ex["e1"], ex["n0"], ex["n1"]))
print("mould     %d x %d cells at %.4f m  (never 92.584)" % (950, 865, cellE))
print("railway   %s" % rail_note)
print("stations  %s" % ", ".join(n["id"] for n in nodes if n.get("inZone")))
print("          %s" % source)
print("modules   %s" % ", ".join(m for m in MODULES if os.path.exists(os.path.join(JS, m))))
print("masks     %s" % (", ".join(sorted(masks)) or "none"))
print("wrote     %s  (%.1f MB)" % (OUT, os.path.getsize(OUT) / 1e6))
