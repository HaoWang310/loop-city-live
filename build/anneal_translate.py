# -*- coding: utf-8 -*-
"""Make cell/anneal/anneal_en.html: the teammate's annealing lab in English and in our colours. Nothing else.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" anneal_translate.py

Three kinds of change, all visual, and every one of them listed here:

  1. TEXT. Each visible Chinese literal found by anneal_strings.py is replaced, AT ITS OWN POSITION, by its
     English from build/anneal_translation.json (349 literals, 8 kept in Chinese on purpose: keys his export writes). The
     file is re-scanned exactly as anneal_strings.py scanned it and replaced from the end backwards, so
     one literal can never be rewritten inside another. Comments are left as they are.
  2. COLOURS. Our palette is APPENDED as one override block just before his single </style>. Nothing of his
     CSS is cut: three of his rules outside the theme block do real work (the one that hides the performance
     panel, the unit label, the panel fade while the canvas is dragged), and the hidden #woolSiteCompat block
     carries controls his own code still reads. The colours his drawing code sets for a dark canvas are then
     swapped for ours (COLOUR_SWAPS in anneal_theme.py, each checked to occur exactly as often as expected).

His original stays beside it, untouched: cell/anneal/anneal_zh_original.html. Then run build_anneal.py.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(V, "html support files", "cell", "anneal", "anneal_zh_original.html")
OUT = os.path.join(V, "html support files", "cell", "anneal", "anneal_en.html")
CJK = re.compile(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]")

text = io.open(SRC, encoding="utf-8", newline="").read()
recs = json.load(io.open(os.path.join(HERE, "anneal_strings.json"), encoding="utf-8"))
tr = json.load(io.open(os.path.join(HERE, "anneal_translation.json"), encoding="utf-8"))
keep = set(int(k) for k in tr.get("keep", {}))
EN = {}
for r in recs:
    if r["id"] in keep: continue
    t = tr["translations"].get(str(r["id"]))
    if t is not None: EN[r["src"]] = t["en"]

# ---------------------------------------------------------------- 1. text, by position
spans = []   # (start, end, literal)


def scan_js(s, base):
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "/" and i + 1 < n and s[i + 1] == "/":
            j = s.find("\n", i); i = n if j < 0 else j; continue
        if c == "/" and i + 1 < n and s[i + 1] == "*":
            j = s.find("*/", i + 2); i = n if j < 0 else j + 2; continue
        if c in "'\"`":
            q, j = c, i + 1
            while j < n:
                if s[j] == "\\": j += 2; continue
                if s[j] == q: break
                if q != "`" and s[j] == "\n": break
                j += 1
            lit = s[i:j + 1]
            if CJK.search(lit): spans.append((base + i, base + j + 1, lit))
            i = j + 1; continue
        i += 1


pos = 0
for m in re.finditer(r"<script\b[^>]*>(.*?)</script>", text, flags=re.S | re.I):
    markup = text[pos:m.start()]
    mk = re.sub(r"<!--.*?-->", lambda z: " " * len(z.group(0)), markup, flags=re.S)
    mk = re.sub(r"<style\b.*?</style>", lambda z: " " * len(z.group(0)), mk, flags=re.S | re.I)
    for t in re.finditer(r">([^<>]+)<", mk):
        if CJK.search(t.group(1)): spans.append((pos + t.start(1), pos + t.end(1), t.group(1)))
    for a in re.finditer(r"\s([a-zA-Z-]+)=\"([^\"]*)\"", mk):
        if CJK.search(a.group(2)): spans.append((pos + a.start(2), pos + a.end(2), a.group(2)))
    scan_js(m.group(1), m.start(1))
    pos = m.end()
tail = text[pos:]
for t in re.finditer(r">([^<>]+)<", tail):
    if CJK.search(t.group(1)): spans.append((pos + t.start(1), pos + t.end(1), t.group(1)))

spans.sort()
for a, b in zip(spans, spans[1:]):
    if a[1] > b[0]: sys.exit("overlapping literals at %d / %d" % (a[0], b[0]))
out, last, done, left = [], 0, 0, []
for s, e, lit in spans:
    out.append(text[last:s])
    if lit in EN: out.append(EN[lit]); done += 1
    else: out.append(lit); left.append(lit[:40])
    last = e
out.append(text[last:])
html = "".join(out)
print("text: %d literal occurrences replaced, %d left as they were" % (done, len(left)))
for l in left[:10]: print("   left:", ascii(l))     # the console here is not UTF-8

# ---------------------------------------------------------------- 2. colours: appended, nothing cut
from anneal_theme import OURS, COLOUR_SWAPS          # the theme, kept on its own so it can be re-tuned alone

C = html.index("</style>")
html = html[:C] + OURS + html[C:]
for a, b, n in COLOUR_SWAPS:
    k = html.count(a)
    if k != n: sys.exit("colour swap expected %d, found %d: %s" % (n, k, a[:70]))
    html = html.replace(a, b)
print("colours: theme appended (%d chars), %d drawing colours swapped" % (len(OURS), len(COLOUR_SWAPS)))

html = html.replace('<html lang="zh-CN">', '<html lang="en">', 1)

left_cjk = [l for l in html.split(chr(10)) if CJK.search(l) and not l.strip().startswith(("//", "/*", "*", "<!--"))]
io.open(OUT, "w", encoding="utf-8", newline="").write(html)
print("lines still holding Chinese (comments excluded): %d" % len(left_cjk))
for l in left_cjk[:10]: print("   ", ascii(l.strip()[:110]))
print("wrote", OUT)
