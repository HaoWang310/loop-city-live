# -*- coding: utf-8 -*-
"""Take the teammate's wool thread app out of his combined page, byte for byte as his own host loads it.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" wool_extract.py

His page carries the wool app as text inside <script type="text/plain" id="embeddedWoolHtml">, with every
closing script tag written <BACKSLASH/script> so it cannot end the carrier early; his host turns them back
(readEmbeddedHtml, line 9337) and hands the result to the frame's srcdoc. This does the same and writes
cell/wool/wool_zh_original.html -- the untouched reference the translated, recoloured copy is made from.
His file is only read.
"""
import hashlib, io, os

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.abspath(os.path.join(V, "..", "..", "Wool thread", "Revised",
                                   u"\u7f8a\u6bdb\u7ebf_\u9000\u706b\u7b97\u6cd5_\u4e00\u4f53\u5316_\u7edf\u4e00UI_\u4ee3\u7801\u68c0\u67e5\u4fee\u590d\u7248.html"))
OUT = os.path.join(V, "html support files", "cell", "wool", "wool_zh_original.html")

src = io.open(SRC, encoding="utf-8", newline="").read()
open_tag = '<script type="text/plain" id="embeddedWoolHtml">'
a = src.index(open_tag) + len(open_tag)
b = src.index("</script>", a)                 # the first real closing tag ends the carrier
body = src[a:b]
esc = "<" + chr(92) + "/script>"
n = body.count(esc)
live = body.replace(esc, "</script>")
io.open(OUT, "w", encoding="utf-8", newline="").write(live)
print("source  ", SRC)
print("escaped closing tags turned back: %d" % n)
print("wool app %d chars, %d lines, md5 %s" % (len(live), live.count("\n"), hashlib.md5(live.encode("utf-8")).hexdigest()))
print("wrote   ", OUT)
