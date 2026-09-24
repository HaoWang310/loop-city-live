# -*- coding: utf-8 -*-
"""Pack assets/*.png into js/assets_inline.js as data URIs.

A page opened straight off the disk (file://) treats every image beside it as cross-origin: the app may draw
them but may not read the pixels back, which is how it gets its build, soil and zone masks, and it may not
write the canvas out as a PNG either. Images carried in the page as data URIs are not cross-origin, so with
this file the app works by double-click as well as over http.

Run after build_data.py, with any Python 3 (stdlib only):
    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" build/inline_assets.py
"""
import base64
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
ASSETS = os.path.join(APP, "assets")
OUT = os.path.join(APP, "js", "assets_inline.js")

# files starting with "_" are working copies the app never loads (the mould's network, copied in for v9.3's test)
names = sorted(f for f in os.listdir(ASSETS) if f.lower().endswith(".png") and not f.startswith("_"))
if not names:
    raise SystemExit("no PNGs in %s - run build_data.py first" % ASSETS)

parts, raw = [], 0
for n in names:
    b = open(os.path.join(ASSETS, n), "rb").read()
    raw += len(b)
    parts.append('"%s":"data:image/png;base64,%s"' % (n, base64.b64encode(b).decode("ascii")))

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write("/* Built by build/inline_assets.py - assets/*.png carried in the page, so the app also works\n")
    f.write("   when index.html is opened straight off the disk. Do not edit by hand. */\n")
    f.write("window.GROWTH_ASSETS = {\n  " + ",\n  ".join(parts) + "\n};\n")

print("js/assets_inline.js: %d files, %.1f MB of PNG, %.1f MB of script"
      % (len(names), raw / 1e6, os.path.getsize(OUT) / 1e6))
for n in names:
    print("   %-26s %6.0f kB" % (n, os.path.getsize(os.path.join(ASSETS, n)) / 1024))
