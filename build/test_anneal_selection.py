# -*- coding: utf-8 -*-
"""Does "Annealing ->" send the parcels that are selected NOW? A test of the real code.

    "C:/Users/Shreya/AppData/Local/Python/bin/python.exe" test_anneal_selection.py

The annealing functions are lifted out of cell/cell.js as they stand, dropped into a page with stubs for his
two apps, and pressed. The rule being tested is the one that broke on 23 Sep: parcels held from an earlier
press were sent instead of the ones on screen, and his payload ids are positions in the parcel list, so a
list re-extracted in between turned a held parcel into a different one -- "random parcels, not the ones I
picked". Every press must read the selection again.

It needs Chrome; it writes its page into the system temp folder and prints PASS / FAIL.
"""
import io, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CELL = os.path.join(HERE, "..", "html support files", "cell", "cell.js")
CHROME = r"C:/Program Files/Google/Chrome/Application/chrome.exe"

HEAD = '<!doctype html><meta charset="utf-8"><title>t</title><pre id="o">running</pre>\n<script>window.addEventListener("error",function(e){document.getElementById("o").textContent="ERR "+e.message+" @"+(e.filename||"").split("/").pop()+":"+e.lineno;});\nvar LOG = [], NOTE = "";\nfunction $(id){ return { value: "2" }; }                      // Buildings / ha = 2\nfunction num(v, d){ return (+v).toFixed(d === undefined ? 0 : d); }\nfunction note(h){ NOTE = h; }\nfunction annealMake(){}\nfunction annealShow(){}\nvar SENT = null;\nfunction annealSetup(w, g){ return annealCount(g); }\nfunction annealReady(cb){ cb({ document: { getElementById: function(){ return { value: 0 }; } }, AnnealWorkflowBridge: {\n  importParcels: function (g) { SENT = g.map(function (p) { return p.sourceId; }); return Promise.resolve(); },\n  applySelection: function () { return Promise.resolve({ ok: true }); } } }); }\nvar ANNEAL_MAX = 300;\nvar ANN = { frame: null, busy: false, on: false, selCell: null, sig: null, done: {} };\nvar SEL = [];\nvar ACT = { built: true, pack: { id: "C11" }, win: function () { return { WoolWorkflowBridge: {\n  getSelectedParcels: function () {\n    if (!SEL.length) return { ok: false, message: "Select at least one parcel." };\n    return { ok: true, parcels: SEL, count: SEL.length, totalArea: SEL.reduce(function(a,p){return a+p.area;},0) };\n  } } }; } };\n</script>\n'
TAIL = '\n<script>\nfunction P(sourceId, ha){ return { id: sourceId, sourceId: sourceId, area: ha * 10000, points: [] }; }\nfunction press(){ SENT = null; ANN.busy = false; annealSend(); return (SENT || []).join(","); }\nfunction t(name, got, want){ LOG.push((got === want ? "PASS  " : "FAIL  ") + name + "  got[" + got + "] want[" + want + "]"); }\n\n// three parcels of two sizes: 70, 68 (a group) and 12 (another)\nSEL = [P(134, 70), P(135, 68), P(9, 12)];\nt("1st press sends the like-sized pair", press(), "135,134");\nt("2nd press sends the odd one", press(), "9");\nt("3rd press starts over", press(), "135,134");\n\n// the selection changes: the new parcels must go, not the leftovers\nANN.done = {}; ANN.sig = null;\nSEL = [P(134, 70), P(135, 68), P(9, 12)];\npress();                                   // first group gone, 9 waiting\nSEL = [P(41, 20), P(42, 21)];              // person picks two others\nt("a new selection wins over what was waiting", press(), "41,42");\n\n// one parcel re-selected on its own\nSEL = [P(9, 12)];\nt("one parcel goes on its own", press(), "9");\n\n// counts follow the area at 2 a hectare\nt("70 ha at 2/ha is capped at 300", annealCount([P(134, 70)]), 140);\nt("12 ha at 2/ha is 24", annealCount([P(9, 12)]), 24);\nt("0.5 ha keeps a floor of 4", annealCount([P(1, 0.5)]), 4);\nt("200 ha would want 400, held at", annealCount([P(2, 200)]), 300);\nsetTimeout(function(){ document.getElementById("o").textContent = LOG.join("\\n"); document.title = LOG.join(" || "); }, 300);\n</script>\n'


def grab(src, name):
    i = src.index("  function " + name + "(")
    j = src.index(chr(10) + "  }" + chr(10), i) + 5
    return src[i:j]


def main():
    src = io.open(CELL, encoding="utf-8", newline="").read().replace(chr(13) + chr(10), chr(10))
    code = chr(10).join(grab(src, n) for n in ["annealDensity", "annealGroups", "annealCount", "annealWanted", "annealSend"])
    page = HEAD + "<script>" + chr(10) + code + chr(10) + "</script>" + TAIL
    d = os.path.join(tempfile.gettempdir(), "loopcity_anneal_test")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "run.html")
    io.open(p, "w", encoding="utf-8", newline="").write(page)
    out = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--user-data-dir=" + os.path.join(d, "profile"),
                          "--virtual-time-budget=6000", "--dump-dom", "file:///" + p.replace(chr(92), "/")],
                         capture_output=True, text=True, timeout=120).stdout
    m = re.search(r"<pre id=.o.>(.*?)</pre>", out, re.S)
    if not m:
        print("the test page did not report -- is Chrome at " + CHROME + "?")
        return 2
    body = m.group(1).strip()
    print(body)
    return 0 if ("FAIL" not in body and "ERR" not in body) else 1


if __name__ == "__main__":
    sys.exit(main())
