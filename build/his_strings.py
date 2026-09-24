# -*- coding: utf-8 -*-
"""List the visible Chinese in the rest of the teammate's page -- the annealing lab and the host -- for the
English copy of his whole app.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" his_strings.py

Writes build/anneal_strings.json (the annealing lab, taken out of its carrier as his host does) and
build/host_strings.json (the host page with both carriers blanked out), in the same form as
wool_strings.json. His file is only read.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.abspath(os.path.join(V, "..", "..", "Wool thread", "Revised",
      u"\u7f8a\u6bdb\u7ebf_\u9000\u706b\u7b97\u6cd5_\u4e00\u4f53\u5316_\u7edf\u4e00UI_\u4ee3\u7801\u68c0\u67e5\u4fee\u590d\u7248.html"))
CJK = re.compile(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]")
ESC = "<" + chr(92) + "/script>"


def carrier(src, cid):
    tag = '<script type="text/plain" id="%s">' % cid
    a = src.index(tag) + len(tag)
    b = src.index("</script>", a)
    return a, b


def scan(text):
    found = {}

    def add(lit, kind, pos):
        if not CJK.search(lit): return
        r = found.setdefault(lit, {"kind": set(), "lines": []})
        r["kind"].add(kind)
        ln = text.count("\n", 0, pos) + 1
        if ln not in r["lines"]: r["lines"].append(ln)

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
                add(s[i:j + 1], "js-template" if q == "`" else "js-string", base + i)
                i = j + 1; continue
            i += 1

    pos = 0
    for m in re.finditer(r"<script\b[^>]*>(.*?)</script>", text, flags=re.S | re.I):
        mk = re.sub(r"<!--.*?-->", lambda z: " " * len(z.group(0)), text[pos:m.start()], flags=re.S)
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
    recs = [{"src": k, "kind": sorted(v["kind"]), "lines": sorted(v["lines"])} for k, v in found.items()]
    recs.sort(key=lambda r: r["lines"][0])
    for k, r in enumerate(recs, 1): r["id"] = k
    return recs


src = io.open(SRC, encoding="utf-8", newline="").read()
a, b = carrier(src, "embeddedAnnealHtml")
anneal = src[a:b].replace(ESC, "</script>")
io.open(os.path.join(HERE, "anneal_zh.html"), "w", encoding="utf-8", newline="").write(anneal)
wa, wb = carrier(src, "embeddedWoolHtml")
host = src[:wa] + src[wb:a] + src[b:]            # the host with both carriers emptied
io.open(os.path.join(HERE, "host_zh.html"), "w", encoding="utf-8", newline="").write(host)
for name, text in (("anneal", anneal), ("host", host)):
    recs = scan(text)
    json.dump(recs, io.open(os.path.join(HERE, name + "_strings.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    kinds = {}
    for r in recs:
        for k in r["kind"]: kinds[k.split(":")[0]] = kinds.get(k.split(":")[0], 0) + 1
    print("%-7s %4d distinct literals  %s  (%d chars)" % (name, len(recs), kinds, sum(len(r["src"]) for r in recs)))
