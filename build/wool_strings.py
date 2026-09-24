# -*- coding: utf-8 -*-
"""List every piece of Chinese text in the teammate's wool app that a person can see, for translation.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" wool_strings.py

Reads cell/wool/wool_zh_original.html (his wool app, byte for byte as his host loads it) and writes
build/wool_strings.json: one record per distinct literal -- the exact source text of a JS string (quotes
included) or an HTML text node / attribute value -- with every line it occurs on and its kind. Comments are
skipped: they are not on screen, and leaving them in Chinese changes nothing.

The translation is applied by build/wool_translate.py from a mapping of these exact literals, so a literal
that the code also compares against (a group name, a level name) changes everywhere at once and the
comparison still holds. Literals that must NOT change (names read from his Rhino/DXF files, keys of saved
files) are marked keep in the mapping.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(V, "html support files", "cell", "wool", "wool_zh_original.html")
OUT = os.path.join(HERE, "wool_strings.json")
CJK = re.compile(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]")

text = io.open(SRC, encoding="utf-8", newline="").read()
lines_at = [0]
for m in re.finditer("\n", text):
    lines_at.append(m.end())


def line_of(pos):
    lo, hi = 0, len(lines_at) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if lines_at[mid] <= pos: lo = mid
        else: hi = mid - 1
    return lo + 1


found = {}   # literal -> {kind, lines}


def add(lit, kind, pos):
    if not CJK.search(lit): return
    r = found.setdefault(lit, {"kind": set(), "lines": []})
    r["kind"].add(kind)
    ln = line_of(pos)
    if ln not in r["lines"]: r["lines"].append(ln)


def scan_js(s, base):
    """Walk JS source: skip comments and regex-free, collect string and template literals."""
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
            add(lit, "js-template" if q == "`" else "js-string", base + i)
            i = j + 1; continue
        i += 1


# the page: split into <script> bodies (JS, incl. the text/plain worker sources) and markup
pos = 0
for m in re.finditer(r"<script\b[^>]*>(.*?)</script>", text, flags=re.S | re.I):
    markup = text[pos:m.start()]
    # markup: text nodes and attribute values, outside <!-- --> and <style>
    mk = re.sub(r"<!--.*?-->", lambda z: " " * len(z.group(0)), markup, flags=re.S)
    mk = re.sub(r"<style\b.*?</style>", lambda z: " " * len(z.group(0)), mk, flags=re.S | re.I)
    for t in re.finditer(r">([^<>]+)<", mk):
        if CJK.search(t.group(1)): add(t.group(1), "html-text", pos + t.start(1))
    for a in re.finditer(r"\s([a-zA-Z-]+)=\"([^\"]*)\"", mk):
        if CJK.search(a.group(2)): add(a.group(2), "html-attr:" + a.group(1), pos + a.start(2))
    scan_js(m.group(1), m.start(1))
    pos = m.end()
tail = text[pos:]
for t in re.finditer(r">([^<>]+)<", tail):
    if CJK.search(t.group(1)): add(t.group(1), "html-text", pos + t.start(1))

recs = []
for lit, r in found.items():
    recs.append({"id": len(recs) + 1, "src": lit, "kind": sorted(r["kind"]), "lines": sorted(r["lines"])})
recs.sort(key=lambda r: r["lines"][0])
for k, r in enumerate(recs, 1): r["id"] = k
json.dump(recs, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
kinds = {}
for r in recs:
    for k in r["kind"]: kinds[k.split(":")[0]] = kinds.get(k.split(":")[0], 0) + 1
print("%d distinct literals with Chinese: %s" % (len(recs), kinds))
print("wrote", OUT)
