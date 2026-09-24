# -*- coding: utf-8 -*-
"""Pack the wool thread app into cell/wool/wool_app.js, for the cell page's frame.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" build_cell.py

The cell page puts the teammate's app into a srcdoc frame. A page opened off the disk may not fetch the
file beside it, so the app's HTML is carried in a script instead: window.WOOL_APP_HTML = "...". It takes
cell/wool/wool_en.html (translated, our colours) when it exists, otherwise his original.
"""
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
W = os.path.join(V, "html support files", "cell", "wool")
src = os.path.join(W, "wool_en.html")
if not os.path.exists(src):
    src = os.path.join(W, "wool_zh_original.html")
html = io.open(src, encoding="utf-8", newline="").read()
out = os.path.join(W, "wool_app.js")
with io.open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write("/* Built by build/build_cell.py from %s -- the wool thread app, carried as text so the cell page\n"
            "   can open it in a frame even off the disk. Do not edit here: edit the HTML and rebuild. */\n"
            % os.path.basename(src))
    f.write("window.WOOL_APP_HTML = " + json.dumps(html, ensure_ascii=False) + ";\n")
print("packed %s -> %s (%.0f kB)" % (os.path.basename(src), out, os.path.getsize(out) / 1024))
