# -*- coding: utf-8 -*-
"""Make cell/wool/wool_en.html: the teammate's wool thread app in English and in our colours. Nothing else.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" wool_translate.py

Three kinds of change, all visual, and every one of them listed here:

  1. TEXT. Each visible Chinese literal found by wool_strings.py is replaced, AT ITS OWN POSITION, by its
     English from build/wool_translation.json (401 literals; none had to be kept, see that file). The
     file is re-scanned exactly as wool_strings.py scanned it and replaced from the end backwards, so
     one literal can never be rewritten inside another. Comments are left as they are.
  2. COLOURS. His "unified monochrome" dark style block is replaced by the same rules in our palette, and
     the handful of colours hard-coded in his drawing code for a dark canvas are swapped for ours
     (COLOUR_SWAPS below, each checked to occur exactly as often as expected).
  3. KILOMETRES ON THE DRAWING. His scale bar prints metres; at 5-17 km that reads "5,000 m", so the one
     label line prints km from 1,000 m up. Everything underneath stays in metres.

His original stays beside it, untouched: cell/wool/wool_zh_original.html. Then run build_cell.py.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.path.join(V, "html support files", "cell", "wool", "wool_zh_original.html")
OUT = os.path.join(V, "html support files", "cell", "wool", "wool_en.html")
CJK = re.compile(r"[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]")

text = io.open(SRC, encoding="utf-8", newline="").read()
recs = json.load(io.open(os.path.join(HERE, "wool_strings.json"), encoding="utf-8"))
tr = json.load(io.open(os.path.join(HERE, "wool_translation.json"), encoding="utf-8"))
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
for l in left[:10]: print("   left:", l)

# ---------------------------------------------------------------- 2. colours
DARK = html.index("/* ===== UNIFIED MONOCHROME UI")
DARK_END = html.index("</style>", DARK)
OURS = """/* ===== Loop City v9: our colours in place of the dark theme. Visual only -- no rule here changes logic. ===== */
:root{
  --paper:#f4f2ee;--card:#ffffff;--line:#e2ded6;--line2:#eeebe5;
  --ink:#2b2925;--ink2:#6f6a62;--ink3:#9c968c;
  --accent:#8f5f38;--accent2:#c4ad97;--beige:#f4efe9;
}
html,body{background:#f4f2ee;color:#2b2925;font-family:"DM Sans","Inter","Segoe UI",system-ui,-apple-system,sans-serif}
#stage{background:#ffffff}
#hud{top:16px;left:18px;gap:7px}
#hud h1{font-size:16px;letter-spacing:.01em;color:#2b2925;font-weight:600}
#hud h1 span{color:#9c968c;font-weight:400}
.chip{background:rgba(255,255,255,.9);border-color:#e2ded6;border-radius:20px;color:#6f6a62;padding:3px 10px}
.chip b{color:#2b2925}
#tools{top:14px;right:18px;background:#ffffff;border-color:#e2ded6;border-radius:8px;box-shadow:0 2px 10px rgba(43,41,37,.06)}
#tools button{background:#ffffff;color:#6f6a62;border-right-color:#eeebe5;padding:7px 11px}
#tools button:hover{background:#f7f5f1;color:#2b2925}
#tools button.on{background:#efe7dc;color:#6b4a2c;font-weight:600}
#zoombar button{border-color:#e2ded6;background:rgba(255,255,255,.92);border-radius:7px;color:#6f6a62}
#zoombar button:hover{background:#ffffff;color:#2b2925}
#scalebar{color:#6f6a62}#scalebar .bar{background:#2b2925}
#legend{color:#6f6a62}#legend .lg{color:#6f6a62}
#kept{background:#fbfaf8;border-top-color:#e2ded6}
.card{background:#ffffff;border-color:#e2ded6;border-radius:8px}.card.on{border-color:#8f5f38}.card .nm{color:#2b2925}.card .ac{color:#9c968c}.card .ac a:hover{color:#2b2925}
#panel{flex-basis:360px;width:360px;min-width:280px;background:#ffffff;border-right:1px solid #e2ded6}
#panelScroll{padding:18px 16px 40px}
#panelScroll::-webkit-scrollbar{width:9px}#panelScroll::-webkit-scrollbar-thumb{background:#dcd8d0;border-radius:5px;border:3px solid #fff}
#panelResizer::after{background:#e2ded6}#panelResizer:hover::after,body.panel-resizing #panelResizer::after{background:#8f5f38}
section{margin-bottom:0;padding:14px 0 13px;border-bottom:1px solid #eeebe5}
section>h2{display:flex;align-items:center;gap:7px;margin:0 0 11px;font-size:10px;letter-spacing:.11em;color:#9c968c;font-weight:700;text-transform:uppercase}
section>h2::before{content:"";width:12px;height:1px;background:#8f5f38;opacity:.85}
.row{gap:7px;margin:7px 0}
button.btn{border-color:#e2ded6;background:#fbfaf8;color:#2b2925;border-radius:8px;padding:8px 10px}
button.btn:hover{background:#f2efe9;border-color:#c9c4bb}
button.btn.primary{background:#8f5f38;border-color:#8f5f38;color:#ffffff;font-weight:600}
button.btn.primary:hover{filter:brightness(1.08)}
button.btn:disabled{opacity:.4}
.f{margin:11px 0}.f .lab span:first-child{color:#6f6a62}.f .lab span:last-child{color:#2b2925;font-weight:600}
.hint{color:#6f6a62;font-size:10.5px;line-height:1.55}.status{color:#6f6a62;font-size:10.5px}
.check{color:#6f6a62}.check input{accent-color:#8f5f38}
select,input[type=text],input[type=number]{background:#fbfaf8;color:#2b2925;border-color:#e2ded6;border-radius:6px;outline:none}
select:focus,input[type=text]:focus,input[type=number]:focus{border-color:#c9c4bb;box-shadow:0 0 0 1px #e2ded6}
input[type=range]{-webkit-appearance:none;appearance:none;height:3px;background:#e2ded6;border-radius:2px;accent-color:#8f5f38}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#8f5f38;border:2px solid #fff;box-shadow:0 0 0 1px #e2ded6}
input[type=range]::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:#8f5f38;border:2px solid #fff;box-shadow:0 0 0 1px #e2ded6}
details{border-top-color:#eeebe5}details summary{color:#6f6a62}details summary::after{color:#9c968c}
.grp{border-color:#e2ded6;border-radius:8px;background:#fbfaf8}.grp:hover{border-color:#c9c4bb}.grp.on{border-color:#d9c7b1;background:#efe7dc}.grp .n{color:#2b2925}.grp .c,.grp .eye{color:#9c968c}
#drop{background:rgba(244,242,238,.92);color:#2b2925;border-color:#8f5f38}
#roadInfoPopup,#parcelInfoPopup{background:rgba(255,255,255,.98);border-color:#e2ded6;border-radius:8px;box-shadow:0 8px 24px rgba(43,41,37,.12);color:#2b2925}
#roadInfoPopup .riTitle,#parcelInfoPopup .piTitle{color:#2b2925}
#roadInfoPopup .riRow span:first-child,#parcelInfoPopup .piRow span:first-child{color:#9c968c}
#roadInfoPopup .riRow span:last-child,#parcelInfoPopup .piRow span:last-child{color:#2b2925}
.levelTab{background:#fbfaf8;color:#6f6a62;border-color:#e2ded6;border-radius:6px}.levelTab.active{color:#6b4a2c;border-color:#d9c7b1;background:#efe7dc;box-shadow:none}
#parcelLevelCard{background:rgba(255,255,255,.99);border-color:#e2ded6;border-radius:10px;box-shadow:0 12px 32px rgba(43,41,37,.14)}
#parcelLevelCard .plHead:hover{background:#f7f5f1}#parcelLevelCard .plTitle{color:#2b2925}#parcelLevelCard .plClose{color:#9c968c}
#parcelLevelCard .plHint{color:#6f6a62}.plRangeRow{border-top-color:#eeebe5}.plNameInput{background:#fbfaf8;color:#2b2925;border-color:#e2ded6;border-radius:6px}.plNameInput:focus{border-color:#c9c4bb;box-shadow:none}
.plBigSwitch{background:#fbfaf8;border-color:#e2ded6;border-radius:8px;color:#6f6a62}.plBigSwitch:hover{background:#f2efe9}.plSwitchTrack{background:#e2ded6;border-color:#d8d2c8}.plSwitchTrack::after{background:#ffffff}.plSwitchWrap input:checked + .plSwitchTrack{background:#8f5f38;border-color:#8f5f38}.plSwitchWrap input:checked + .plSwitchTrack::after{background:#ffffff}
input::placeholder{color:#b5afa6}option{background:#ffffff;color:#2b2925}
@media(max-width:900px){#panel{flex-basis:330px;width:330px}#panelScroll{padding-left:13px;padding-right:13px}}
"""
html = html[:DARK] + OURS + html[DARK_END:]

# colours his drawing code sets for a dark canvas -> ours on a white one. (snippet, replacement, times)
COLOUR_SWAPS = [
    ("ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, VW, VH);", "ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, VW, VH);", 1),
    ("x.fillStyle = '#050505'; x.fillRect(0, 0, c.width, c.height);", "x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);", 1),
    ("ctx.fillStyle = '#050505'; ctx.strokeStyle = '#e4e4e4';", "ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2b2925';", 1),
    ("ctx.fillStyle = '#050505'; ctx.fill(); ctx.lineWidth = on ? 1.6 : 1;", "ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = on ? 1.6 : 1;", 1),
    ("c.strokeStyle='#d0d0d0';", "c.strokeStyle='#c07a45';", 1),                                    # parcel edge, by level
    ("c.fillStyle = '#262626'; c.fill(); c.strokeStyle = '#d0d0d0';",
     "c.fillStyle = '#efe2d0'; c.fill(); c.strokeStyle = '#c07a45';", 1),                             # parcels: baked surface, orange line
    ("c.strokeStyle = '#d7d7d7'; c.lineWidth = opt.outlineW;", "c.strokeStyle = '#2b2925'; c.lineWidth = opt.outlineW;", 1),   # the cell outline
    ("ctx.strokeStyle = '#f2f2f2'; ctx.setLineDash([2, 2]);", "ctx.strokeStyle = '#2b2925'; ctx.setLineDash([2, 2]);", 1),     # snap ring
    ("hq[1], 7, 0, 6.2832); ctx.strokeStyle = '#f2f2f2';", "hq[1], 7, 0, 6.2832); ctx.strokeStyle = '#2b2925';", 1),           # hover ring
    ("ctx.fillStyle='rgba(255,255,255,.055)';", "ctx.fillStyle='rgba(143,95,56,.06)';", 1),        # box select
    ("ctx.strokeStyle='#f5f5f5';ctx.lineWidth=1.2;ctx.setLineDash([6,4]);", "ctx.strokeStyle='#8f5f38';ctx.lineWidth=1.2;ctx.setLineDash([6,4]);", 1),
    ("c.strokeStyle='#ffffff';c.lineWidth=1.8;c.beginPath();c.moveTo(qc[0]-6,qc[1]);", "c.strokeStyle='#2b2925';c.lineWidth=1.8;c.beginPath();c.moveTo(qc[0]-6,qc[1]);", 1),  # road diagnostics centre
    ("c.fillStyle='rgba(205,213,220,.64)';", "c.fillStyle='rgba(120,115,108,.55)';", 1),           # road diagnostics nodes
]
for a, b, n in COLOUR_SWAPS:
    k = html.count(a)
    if k != n: sys.exit("colour swap expected %d, found %d: %s" % (n, k, a))
    html = html.replace(a, b)
print("colours: dark style block replaced, %d drawing colours swapped" % len(COLOUR_SWAPS))

# ---------------------------------------------------------------- 3. km on the scale bar
a = "document.getElementById('sbLab').textContent = fmtNum(siteLengthToMeters(nice)) + ' m';"
if html.count(a) != 1: sys.exit("scale bar line not found")
html = html.replace(a, "var _m = siteLengthToMeters(nice); document.getElementById('sbLab').textContent = _m >= 1000 ? fmtNum(_m / 1000) + ' km' : fmtNum(_m) + ' m';   // Loop City: km on the drawing")
html = html.replace('<html lang="zh-CN">', '<html lang="en">', 1)

left_cjk = [l for l in html.split("\n") if CJK.search(l) and not l.strip().startswith(("//", "/*", "*", "<!--"))]
io.open(OUT, "w", encoding="utf-8", newline="").write(html)
print("lines still holding Chinese (comments excluded): %d" % len(left_cjk))
for l in left_cjk[:8]: print("   ", l.strip()[:110])
print("wrote", OUT)
