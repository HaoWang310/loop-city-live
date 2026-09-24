# -*- coding: utf-8 -*-
"""Pack the annealing lab into cell/anneal/anneal_app.js, for the cell page's frame.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" build_anneal.py

The same way the wool thread is carried (build_cell.py): a page opened off the disk may not fetch the file
beside it, so the app's HTML travels in a script instead -- window.ANNEAL_APP_HTML = "..." -- and the cell
page puts it in a srcdoc frame. It takes cell/anneal/anneal_en.html (English, our colours) when it exists,
otherwise his original.

One line is added on the way in, and it is the only change to his page here: his lab loads rhino3dm from
the internet for its 3DM export (a <script src="https://cdn.jsdelivr.net/..."> at the top). Off the disk
that request simply fails and the export button reports it; the line is left as it is so his code is
untouched, and the 3DM export is the one thing that needs the internet.
"""
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
A = os.path.join(V, "html support files", "cell", "anneal")
src = os.path.join(A, "anneal_en.html")
if not os.path.exists(src):
    src = os.path.join(A, "anneal_zh_original.html")
html = io.open(src, encoding="utf-8", newline="").read()
out = os.path.join(A, "anneal_app.js")
with io.open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write("/* Built by build/build_anneal.py from %s -- the annealing lab, carried as text so the cell page\n"
            "   can open it in a frame even off the disk. Do not edit here: edit the HTML and rebuild. */\n"
            % os.path.basename(src))
    f.write("window.ANNEAL_APP_HTML = " + json.dumps(html, ensure_ascii=False) + ";\n")
print("packed %s -> %s (%.0f kB)" % (os.path.basename(src), out, os.path.getsize(out) / 1024))
