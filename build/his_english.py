# -*- coding: utf-8 -*-
"""An English copy of the teammate's whole app -- wool thread, annealing lab and the page that joins them.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" his_english.py

Only the visible text changes, each literal at its own position, from:
    build/wool_translation.json      the wool thread (401 literals, done for the cell scale)
    build/anneal_translation.json    the annealing lab
    build/host_translation.json      the page around them
Literals marked keep (JSON keys his export writes, text matched against outside data) stay in Chinese.
His colours, layout and code are left exactly as they are -- this is his app in English, not our version
of it (ours, in our colours, is v9/cell/wool/wool_en.html). The two apps go back into their carriers the way
his page carries them: as text, with every closing script tag written <BACKSLASH/script>.

Writes  Wool thread/Revised/English/<his file name> (English).html. His file is only read.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
NAME = u"\u7f8a\u6bdb\u7ebf_\u9000\u706b\u7b97\u6cd5_\u4e00\u4f53\u5316_\u7edf\u4e00UI_\u4ee3\u7801\u68c0\u67e5\u4fee\u590d\u7248"
SRC = os.path.abspath(os.path.join(V, "..", "..", "Wool thread", "Revised", NAME + ".html"))
OUTD = os.path.abspath(os.path.join(V, "..", "..", "Wool thread", "Revised", "English"))
CJK = re.compile(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]")
ESC = "<" + chr(92) + "/script>"


def spans_of(text):
    """(start, end, literal) for every visible Chinese literal -- the same scan as wool_strings.py."""
    out = []

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
                if CJK.search(lit): out.append((base + i, base + j + 1, lit))
                i = j + 1; continue
            i += 1

    pos = 0
    for m in re.finditer(r"<script\b[^>]*>(.*?)</script>", text, flags=re.S | re.I):
        mk = re.sub(r"<!--.*?-->", lambda z: " " * len(z.group(0)), text[pos:m.start()], flags=re.S)
        mk = re.sub(r"<style\b.*?</style>", lambda z: " " * len(z.group(0)), mk, flags=re.S | re.I)
        for t in re.finditer(r">([^<>]+)<", mk):
            if CJK.search(t.group(1)): out.append((pos + t.start(1), pos + t.end(1), t.group(1)))
        for a in re.finditer(r"\s([a-zA-Z-]+)=\"([^\"]*)\"", mk):
            if CJK.search(a.group(2)): out.append((pos + a.start(2), pos + a.end(2), a.group(2)))
        scan_js(m.group(1), m.start(1))
        pos = m.end()
    for t in re.finditer(r">([^<>]+)<", text[pos:]):
        if CJK.search(t.group(1)): out.append((pos + t.start(1), pos + t.end(1), t.group(1)))
    out.sort()
    return out


def mapping(strings_file, tr_file):
    recs = json.load(io.open(os.path.join(HERE, strings_file), encoding="utf-8"))
    tr = json.load(io.open(os.path.join(HERE, tr_file), encoding="utf-8"))
    keep = set(int(k) for k in tr.get("keep", {}))
    m = {}
    for r in recs:
        if r["id"] in keep: continue
        t = tr["translations"].get(str(r["id"]))
        if t is not None: m[r["src"]] = t["en"]
    return m, len(keep)


def translate(text, m):
    out, last, done, left = [], 0, 0, 0
    for s, e, lit in spans_of(text):
        out.append(text[last:s]); out.append(m.get(lit, lit)); last = e
        if lit in m: done += 1
        else: left += 1
    out.append(text[last:])
    return "".join(out), done, left


src = io.open(SRC, encoding="utf-8", newline="").read()


def carrier(cid):
    tag = '<script type="text/plain" id="%s">' % cid
    a = src.index(tag) + len(tag)
    return a, src.index("</script>", a)


wa, wb = carrier("embeddedWoolHtml")
aa, ab = carrier("embeddedAnnealHtml")
wool = src[wa:wb].replace(ESC, "</script>")
anneal = src[aa:ab].replace(ESC, "</script>")

report = []
wool_en, d1, l1 = translate(wool, mapping("wool_strings.json", "wool_translation.json")[0])
m2, k2 = mapping("anneal_strings.json", "anneal_translation.json")
anneal_en, d2, l2 = translate(anneal, m2)
MARK_W, MARK_A = "\u0001WOOL\u0001", "\u0001ANNEAL\u0001"
host = src[:wa] + MARK_W + src[wb:aa] + MARK_A + src[ab:]
m3, k3 = mapping("host_strings.json", "host_translation.json")
host_en, d3, l3 = translate(host, m3)
page = host_en.replace(MARK_W, wool_en.replace("</script>", ESC)).replace(MARK_A, anneal_en.replace("</script>", ESC))
page = page.replace('<html lang="zh-CN">', '<html lang="en">')

os.makedirs(OUTD, exist_ok=True)
dst = os.path.join(OUTD, NAME + " (English).html")
io.open(dst, "w", encoding="utf-8", newline="").write(page)
print("wool thread   %4d literals replaced, %d left" % (d1, l1))
print("annealing     %4d literals replaced, %d left (%d kept on purpose)" % (d2, l2, k2))
print("host          %4d literals replaced, %d left (%d kept on purpose)" % (d3, l3, k3))
print("wrote", dst, "(%.0f kB)" % (os.path.getsize(dst) / 1024))
