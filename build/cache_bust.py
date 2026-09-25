# -*- coding: utf-8 -*-
"""Apply one build token to every locally loaded Loop City page/script.

GitHub Pages and normal browsers may keep an unchanged subresource URL cached even
after the file behind it has changed.  The build workflow calls this script with
LOOP_CITY_CACHE_TOKEN=<source commit sha>.  Only URL query strings change; source
logic and generated app contents do not.
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TOKEN = (os.environ.get("LOOP_CITY_CACHE_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else "")).strip()
if not TOKEN:
    sys.exit("missing LOOP_CITY_CACHE_TOKEN")
TOKEN = re.sub(r"[^A-Za-z0-9_.-]", "", TOKEN)[:32]
if not TOKEN:
    sys.exit("empty cache token after sanitising")

def read(rel):
    p = os.path.join(ROOT, *rel.split("/"))
    with open(p, encoding="utf-8") as fh:
        return p, fh.read()

def write_if_changed(path, before, after):
    if before == after:
        print("cache     unchanged", os.path.relpath(path, ROOT))
        return False
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(after)
    print("cache     %-12s %s" % (TOKEN, os.path.relpath(path, ROOT)))
    return True

# Shell: its iframe/page URLs and the dynamically injected Quadrant resize module.
p, s = read("index.html")
out = re.sub(r"\?v=[A-Za-z0-9_.-]+", "?v=" + TOKEN, s)
write_if_changed(p, s, out)

# Standalone/sub-frame pages: version every local script, including scripts which
# previously had no ?v=.  Remote http(s) dependencies are intentionally untouched.
for rel in (
    "html support files/cell/cell.html",
    "html support files/loop/index.html",
    "html support files/combined_v10.html",
):
    p, s = read(rel)
    pat = re.compile(r'(<script\b[^>]*\bsrc=")(?!https?://)([^"?]+)(?:\?v=[^"]*)?(")', re.I)
    out = pat.sub(lambda m: m.group(1) + m.group(2) + "?v=" + TOKEN + m.group(3), s)
    write_if_changed(p, s, out)
