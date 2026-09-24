/* ============================================================================================
   Loop City v10 -- the cell scale: our bar, his wool thread app, one copy of it per cell.

   1. His app is loaded into a frame as it is (window.WOOL_APP_HTML, built from cell/wool/wool_en.html).
      It starts on his own demonstration cell.
   2. When a cell is handed down (or a cell file opened), woolcell.js turns it into his settings file, and
      it goes in through HIS file input, exactly as if you had pressed his "load settings" and picked it --
      his loadSettings does the rest, including scaling everything to the cell's real size in metres.
   3. From then on it is his app: Run, his anchor tools and sliders, Extract parcels, and his level 1/2
      roads (made to work at real size by woolroads.js, from outside his code).
   4. Exports here put the result back on British National Grid: inside his app the cell sits at a local
      origin, x = E - E0, y = N - N0.

   v10 -- several cells. Each cell gets its own frame with its own copy of his app, so each keeps everything
   it has done (anchors moved, threads solved, parcels, roads) while you look at another. A tab per cell;
   "All cells" draws them together (overview.js); "Run all" presses his Run, Extract parcels and Build roads
   in every cell, a few cells at a time. View modes, his display switches for every cell at once, and
   Measure (measure.js) sit on the second row of the bar.

   The frames are srcdoc frames, so they share this page's origin -- also when opened off the disk -- and
   this page may read window.__wool and his parcel bridge, which is all it reads.
   ============================================================================================ */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function num(v, d) { d = d || 0; return (+v).toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function note(h) { $("note").innerHTML = h; }

  var SLOTS = [], ACT = null, SEQ = 0, RUN = null;
  // the corridor is one band along the whole railway, so its two widths belong to the page, not to a cell
  var PAGE = { corridorM: WoolCell.WIDTH_NODE, corridorSpineM: WoolCell.WIDTH_SPINE };
  /* 22 Sep: and where it comes from. By default the green corridor app's two edge polylines (cell/corridor_edges.js,
     from build/build_corridor_js.py): "the green spine is not a direct offset of the railway but thicker and thinner
     based on the context conditions". The fixed widths stay as the other choice. */
  var LCOR = window.LoopCorridor || null;
  PAGE.source = LCOR && LCOR.green ? "green" : "fixed";
  if (LCOR && LCOR.setMode) LCOR.setMode(PAGE.source);
  function corridorId() {
    return PAGE.source === "green" && LCOR && LCOR.green ? { kind: "green", source: LCOR.green.source, year: LCOR.green.year }
                                                        : { kind: "fixed", nodeM: PAGE.corridorM, spineM: PAGE.corridorSpineM };
  }
  function corridorUI() {
    var t = ACT, off = !t || t === "all" || !t.pack;
    $("oCorrSrc").value = PAGE.source;
    $("oCorrSrc").disabled = off || !(LCOR && LCOR.green);
    var fixedNow = $("oCorrSrc").value === "fixed";
    ["oCorr", "oCorrS"].forEach(function (id) { $(id).disabled = off || !fixedNow; });
  }
  var SHOW = { threads: true, parcels: true, roads: true, anchors: true };
  var wrap = $("wrap"), ov = $("ov");

  /* ================================================================== one copy of his app per cell */
  function makeSlot(pack) {
    var s = { n: ++SEQ, pack: null, built: null, opt: null, frame: null, ready: false, queued: null,
              layers: CellLayers.create(), roads: null, measure: null, run: null, statsSig: "" };
    var fr = document.createElement("iframe");
    fr.className = "wool"; fr.title = "Wool thread";
    wrap.insertBefore(fr, ov);
    s.frame = fr;
    s.win = function () { try { return fr.contentWindow; } catch (e) { return null; } };
    s.doc = function () { try { return fr.contentDocument; } catch (e) { return null; } };
    s.label = function () { return statusOf(s); };
    fr.addEventListener("load", function () { waitReady(s); });
    if (window.WOOL_APP_HTML) fr.srcdoc = window.WOOL_APP_HTML;
    else note("<b>cell/wool/wool_app.js is missing</b> -- run build/build_cell.py.");
    SLOTS.push(s);
    if (pack) givePack(s, pack);
    return s;
  }
  function waitReady(s) {
    var tries = 0;
    (function wait() {
      var w = s.win();
      if (!s.frame.isConnected) return;
      if (w && w.__wool && w.document.getElementById("fileIn")) {
        s.ready = true;
        s.roads = WoolRoads.create(w, w.document, function () { refresh(true); });
        s.layers.setRoads(function () { return s.roads && s.roads.shown ? s.roads.current() : null; });
        s.measure = CellMeasure.frameHost(w, w.document);
        catchCountSliders(s);
        applyShow(s);
        if (s.queued) { var q = s.queued; s.queued = null; inject(s, q); }
        if (s === ACT) CellMeasure.use(s.measure);
        refresh(true);
        return;
      }
      if (++tries < 300) setTimeout(wait, 50);
      else note("<b>The wool thread did not start.</b> Open the browser console for the reason.");
    })();
  }
  /* His three count sliders (On outline / Shared anchors / Interior line) respace the current group's anchors by his
     own rule: along the chords between the old outline points (so cell-edge anchors drift inside the cell) and along
     one line threaded through both corridor edges (so corridor anchors land inside the corridor). Here they are caught
     before his page sees the change and turned into our starting-anchor counts instead, so a re-spaced anchor stays on
     the corridor edge or on the cell's outline. His code is not changed; the event just never reaches it. */
  function catchCountSliders(s) {
    var d = s.doc(), w = s.win();
    var ROLE = { sCntOutline: "outline", sCntShared: "shared", sCntInner: "inner" };
    d.addEventListener("change", function (e) {
      var role = e.target && ROLE[e.target.id]; if (!role || !s.built) return;
      e.stopImmediatePropagation();
      var m = w.__wool.model, g = m.groups[m.active], v = parseInt(e.target.value, 10), o = s.opt, what = "";
      var name = g ? g.name : "";
      if (s.kind === "spine") {
        if (/^Rib/.test(name) && role !== "inner") { o.between = Math.max(0, v - 2); what = "Between ribs " + o.between; }
      } else if (/^Road/.test(name)) {
        if (role === "outline") { o.outside = Math.max(2, v); what = "Outside / side " + o.outside; }
        else if (role === "shared") { o.edgePairs = Math.max(2, Math.round(v / 2)); what = "Edge points " + o.edgePairs; }
        else { o.inside = Math.max(0, v); what = "Inside / side " + o.inside; }
      } else if (/^Spine/.test(name)) {
        if (role === "outline") { o.mouthPts = Math.max(2, v); what = "mouth points " + o.mouthPts; }
        else if (role === "shared") { o.edgePairs = Math.max(2, Math.round(v / 2)); what = "Edge points " + o.edgePairs; }
        else { o.spinePts = Math.max(2, v + 1); what = "Rail points " + o.spinePts; }
      }
      if (!what) { note("That count is not used by this cell's starting anchors -- use the boxes above the drawing."); return; }
      if (s === ACT) {
        $("oSpine").value = o.spinePts; $("oEdge").value = o.edgePairs; $("oInside").value = o.inside; $("oOutside").value = o.outside; $("oBetween").value = o.between;
      }
      place(s);
      if (s === ACT) note($("note").innerHTML + " <b>His count slider set " + what + "</b>: the anchors were placed again by the recipe, so they stay on the corridor edge and on the outline.");
    }, true);
  }
  function removeSlot(s) {
    if (s.run) s.run.cancel = true;
    s.frame.remove();
    SLOTS.splice(SLOTS.indexOf(s), 1);
    if (ACT === s) activate(SLOTS.filter(function (x) { return x.pack; })[0] || SLOTS[0] || null);
    refresh(true);
  }

  // his own route in: a .json given to his file input goes to his openFile, then his loadSettings
  function inject(s, text) {
    if (!s.ready) { s.queued = text; return; }
    var w = s.win(), d = s.doc(), inp = d && d.getElementById("fileIn");
    if (!inp) { note("<b>Could not reach the wool thread's file input.</b>"); return; }
    var file = new w.File([text], "loop-city-cell-" + (s.pack ? s.pack.id : "cell") + ".json", { type: "application/json" });
    var dt = new w.DataTransfer();
    dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new w.Event("change", { bubbles: true }));
  }

  function givePack(s, p) {
    s.pack = p;
    var d = WoolCell.defaults(p);
    s.kind = d.kind;
    s.opt = { corridorM: PAGE.corridorM, corridorSpineM: PAGE.corridorSpineM, spinePts: d.spinePts, edgePairs: d.edgePairs, mouthPts: 6,
              inside: d.inside, outside: d.outside, ribM: d.ribM, between: d.between, connect: d.connect };
    s.frame.title = "Wool thread · cell " + p.id;
    place(s);
  }
  function place(s) {
    if (!s || !s.pack) return;
    s.opt.corridorM = PAGE.corridorM; s.opt.corridorSpineM = PAGE.corridorSpineM;
    var b = WoolCell.build(s.pack, s.opt);
    if (!b.ok) {
      var had = !!s.built;
      s.built = null; s.kind = "none"; s.why = b.why;
      // the corridor it drew before is no longer this page's corridor: stop drawing it
      if (had && s.ready) s.layers.attach(s.win(), s.doc(), s.pack, { E0: s.pack.bbox.E0, N0: s.pack.bbox.N0 }, null);
      if (s.roads) s.roads.clear("This cell cannot be threaded with the corridor as it is now.");
      if (s === ACT) { note("<b>Cell " + s.pack.id + " cannot be threaded:</b> " + b.why + "."); kindUI(s); buttonsUI(s); }
      return false;
    }
    s.built = b; s.kind = b.kind; s.why = ""; s.statsSig = "";
    if (s.roads) s.roads.clear("New starting anchors placed: build the roads again once the wool thread has run.");
    inject(s, JSON.stringify(b.settings));
    attachLayers(s);
    if (s === ACT) { placedNote(s); kindUI(s); buttonsUI(s); }
    return true;
  }
  function placedNote(s) {
    var b = s.built; if (!b) return;
    var unk = (b.corridor && b.corridor.unknownStations) || [];
    var st = b.stats, tail = (unk.length ? " · <b>the corridor near " + unk.join(", ") + " is not narrowed</b>: " + (unk.length > 1 ? "their cells are" : "its cell is") +
      " not in this quadrant's cells" : "") + " · real size " + num(st.across / 1000, 1) + " km across, parcel grid " + num(st.gridM, 1) + " m, magnet range " +
      num(st.magRM) + " m. Now press <b>Run</b> in the wool thread, then <b>Extract parcels</b>" + (SLOTS.length > 1 ? " -- or <b>Run all</b> for every cell." : ".");
    function km(m) { return num(m / 1000, 1); }
    function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
    if (b.kind === "spine") {
      note("<b>Cell " + s.pack.id + ", in the spine: " + st.threads + " threads</b> in " + st.groups + " groups · " +
        plural(st.ribs[0] + st.ribs[1], "rib") + " (" + (st.gateRibs[0] + st.gateRibs[1]) + " at road ends), " + st.ribs[1] + " north and " + st.ribs[0] + " south, " +
        "no centre · " + (st.railPoints ? plural(st.railPoints, "rail point") + " weaving the corridor, entered at " + plural(st.entrances, "end") +
        " (his level 1 runs along it) · railway " + km(st.railInKm * 1000) + " km inside" : "the railway runs outside it: no rail points, no entrances") + " · green corridor " +
        (st.sideM ? greenWords(b.corridor, st.widthM)
                  : Math.abs(st.widthM[1] - st.widthM[0]) < 50 ? km(st.widthM[0]) + " km" : km(st.widthM[0]) + "–" + km(st.widthM[1]) + " km, narrowing to the node width towards " + st.tapers.join(", ")) +
        tail);
    } else {
      note("<b>Cell " + s.pack.id + ", around " + (st.station ? st.station.id : "a node") + ": " + st.threads + " threads</b> · " + (st.outside[0] + st.outside[1]) + " outside anchors (" +
        (st.roadEnds[0] + st.roadEnds[1]) + " are road ends) · " + (st.inside[0] + st.inside[1]) + " inside · " +
        "railway " + num(st.spineKm, 1) + " km" + (st.station ? ", split at " + st.station.id : ", split at its middle") +
        " · green corridor " + (b.corridor.source === "green" ? greenWords(b.corridor, null)
                                  : km(b.corridor.widthM) + " km wide" + (b.corridor.shared ? ", one band with its neighbours'" : " (its own: no railway file)")) +
        " · connected " + (st.connect === "all" ? "everything to everything (his)" : "nearby only") + tail);
    }
  }
  // the green corridor app's corridor, in words: each side's width here, and the range across the cell
  function greenWords(c, range) {
    function km(m) { return num(m / 1000, 1); }
    var sd = c.sideM || [0, 0];
    return "from the corridor app (" + (c.year || "") + "): " + km(sd[0]) + " km outside the loop, " + km(sd[1]) + " km inside" +
      (range && Math.abs(range[1] - range[0]) >= 50 ? ", " + km(range[0]) + "–" + km(range[1]) + " km across in this cell" : "") +
      (sd[0] < WoolCell.MIN_SIDE || sd[1] < WoolCell.MIN_SIDE ? " (one side closes up against a town or water here)" : "");
  }
  function kindUI(t) {
    var k = t === "all" ? "all" : (t && t.kind) || "";
    document.body.classList.toggle("isSpine", k === "spine");
    document.body.classList.toggle("isNode", k === "node" || k === "");
    document.body.classList.toggle("isAll", k === "all" || k === "none");
    var el = $("cKind");
    el.className = "kind " + (k === "spine" ? "spine" : k === "node" ? "node" : "");
    el.textContent = k === "spine" ? "in the spine" : k === "node" ? "around a node" : k === "all" ? "all cells" : k === "none" ? "cannot be threaded" : "";
  }
  // the ground and the rail over his canvas (layers.js); retried until his page and the cell are both there
  function attachLayers(s) {
    if (!s.frame.isConnected) return;
    if (!s.ready || !s.pack || !s.built) { setTimeout(function () { attachLayers(s); }, 120); return; }
    s.layers.attach(s.win(), s.doc(), s.pack, s.built.frame, s.built.corridor);
  }

  /* ================================================================== the annealing lab, the step after the parcels
     The parcels selected in his wool app go to his annealing lab, through the bridges the two of them already
     carry: WoolWorkflowBridge.getSelectedParcels here, AnnealWorkflowBridge.importParcels + applySelection there.
     Neither app is changed. His lab keeps its own frame of reference -- it puts the parcels on their own corner --
     so what comes back is not yet in British National Grid; that is the next piece of work, not this one. */
  var ANN = { frame: null, busy: false, on: false, selCell: null, sig: null, done: {} };
  function annealWin() { try { return ANN.frame && ANN.frame.contentWindow; } catch (e) { return null; } }
  function annealMake() {
    if (ANN.frame) return ANN.frame;
    var fr = document.createElement("iframe");
    fr.className = "anneal"; fr.title = "Annealing lab";
    wrap.appendChild(fr);
    ANN.frame = fr;
    if (window.ANNEAL_APP_HTML) fr.srcdoc = window.ANNEAL_APP_HTML;
    else note("<b>cell/anneal/anneal_app.js is missing</b> -- run build/build_anneal.py.");
    return fr;
  }
  function workflowStepUI(stage) {
    var root = document.getElementById("cellWorkflowSteps");
    if (!root) return;
    var order = { wool: 1, parcel: 2, anneal: 3 };
    var at = order[stage] || 1;
    Array.prototype.forEach.call(root.querySelectorAll(".wf-step"), function (el) {
      var n = order[el.getAttribute("data-wf")] || 1;
      el.classList.toggle("on", n === at);
      el.classList.toggle("done", n < at);
    });
  }

  function annealShow(on) {
    ANN.on = !!on;
    if (ANN.frame) ANN.frame.classList.toggle("on", ANN.on);
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ lc: 1, type: "annealState", on: ANN.on }, "*");
      }
    } catch (_) {}
    $("bAnnealBack").style.display = ANN.on ? "" : "none";
    $("bAnneal").classList.toggle("primary", !ANN.on);
    document.body.classList.toggle("isAnneal", ANN.on);
    if (!ANN.on) refresh(true);
  }
  function annealReady(cb, t0) {
    var w = annealWin();
    if (w && w.AnnealWorkflowBridge) return cb(w);
    if (Date.now() - (t0 || Date.now()) > 20000) { note("<b>The annealing lab did not start.</b>"); ANN.busy = false; return; }
    setTimeout(function () { annealReady(cb, t0 || Date.now()); }, 150);
  }

  function annealPreviewOpen() {
    annealMake();
    annealShow(true);
    ANN.busy = false;
    note("<b>Annealing demo opened.</b> This is the built-in example site. You can adjust parameters and run it immediately. In Wool, select parcels and press <b>Enter</b> to replace the demo with the selected parcel(s).");
    annealReady(function (w) {
      try {
        var A = w && w.AnnealWorkflowBridge;
        if (A && typeof A.showDemo === "function") {
          Promise.resolve(A.showDemo()).catch(function () {});
        }
        if (w && w.dispatchEvent) w.dispatchEvent(new Event("resize"));
      } catch (_) {}
    });
  }

  /* His lab is set up for a 160 x 110 m plot, and it gives EVERY site the same number of buildings
     (generateInitialRegionLayout reads one params.number). Our parcels are hectares and they differ, so:
       the count    each parcel's area times "Buildings / ha" -- about 2 a hectare is a plot ratio near 2 at
                    his building sizes (a building carries roughly 10,000 m2 of floor)
       the groups   parcels within half again of each other in size go together, biggest group first; the rest
                    wait for the next press, so no parcel is built at another parcel's density
     Set by value only, with no event: his own workflow code does the same, because a change event on any of
     these rebuilds the site and throws the run away. */
  function annealDensity() { var v = parseFloat($("oAnnealDens").value); return v > 0 ? v : 2; }
  function annealGroups(parcels) {
    var by = parcels.slice().sort(function (a, b) { return (a.area || 0) - (b.area || 0); }), out = [], cur = [];
    by.forEach(function (p) {
      if (cur.length && (p.area || 0) > 1.5 * (cur[0].area || 1)) { out.push(cur); cur = []; }
      cur.push(p);
    });
    if (cur.length) out.push(cur);
    out.sort(function (a, b) { return b.length - a.length || (a[0].area || 0) - (b[0].area || 0); });   // most parcels first, then the smaller sites: a quicker first run
    return out;
  }
  var ANNEAL_MAX = 300;          // his daylight check compares every building with every other: n^2
  function annealWanted(group) {
    var areas = group.map(function (p) { return +p.area || 0; }).sort(function (a, b) { return a - b; });
    var med = areas[areas.length >> 1] || 0;
    return Math.round(med / 10000 * annealDensity());
  }
  function annealCount(group) { return Math.max(4, Math.min(ANNEAL_MAX, annealWanted(group))); }
  function annealSetup(w, group) {
    var n = annealCount(group);
    var set = function (id, v) { var el = w.document.getElementById(id); if (el) el.value = v; };
    set("number", n); set("sMin", 18); set("sMax", 60); set("hMin", 9); set("hMax", 80);
    return n;
  }
  function annealSend() {
    if (ANN.busy) return;

    if (!ACT || ACT === "all") {
      annealPreviewOpen();
      return;
    }

    var w0 = ACT.win && ACT.win(), B = w0 && w0.WoolWorkflowBridge;
    if (!B) {
      annealPreviewOpen();
      note("<b>Annealing demo opened.</b> The current Wool workspace is not ready for parcel transfer yet.");
      return;
    }

    // Read the CURRENT parcel selection from Wool.
    // Every selected parcel is transferred; nothing is grouped, skipped or auto-confirmed.
    var r = B.getSelectedParcels();
    if (!r.ok) {
      note("<b>" + r.message + "</b> Select one or more parcels, then press <b>Enter</b> or click <b>Annealing →</b>.");
      return;
    }

    var parcels = r.parcels.slice();
    var cellId = ACT.pack && ACT.pack.id ? ACT.pack.id : "demo";
    var sig = cellId + "|" + parcels.map(function (p) {
      return p.sourceId || p.id;
    }).sort().join(",");

    ANN.sig = sig;
    ANN.done = {};
    ANN.busy = true;
    ANN.selCell = cellId;

    var area = parcels.reduce(function (sum, p) {
      return sum + (+p.area || 0);
    }, 0);

    note("Sending <b>" + parcels.length + " selected parcel" +
      (parcels.length === 1 ? "" : "s") +
      "</b> (" + num(area / 10000, 2) +
      " ha) into Annealing. All will remain selectable there.");

    annealMake();
    annealShow(true);

    annealReady(function (w) {
      try {
        var A = w && w.AnnealWorkflowBridge;
        if (!A || typeof A.importParcels !== "function") {
          throw new Error("Annealing parcel bridge is not ready.");
        }

        // Use all selected parcels only to set a sensible initial building-count default.
        // The Annealing layer itself decides the final subset after the second selection.
        var n = annealSetup(w, parcels);

        Promise.resolve(A.importParcels(parcels)).then(function (res) {
          ANN.busy = false;

          if (res && res.ok === false) {
            note("<b>The annealing lab refused the parcels:</b> " +
              (res.message || "no reason given"));
            return;
          }

          note("<b>" + parcels.length + " parcel" +
            (parcels.length === 1 ? "" : "s") +
            " transferred to Annealing.</b> All are shown as candidates. " +
            "Select again in Annealing with click / Shift+click / box selection, then press <b>Enter</b> to start. " +
            "Current default: <b>" + n + " buildings per selected site</b>.");
        }).catch(function (e) {
          ANN.busy = false;
          note("<b>The annealing lab could not take the parcels:</b> " + e.message);
        });
      } catch (e) {
        ANN.busy = false;
        note("<b>The annealing lab could not take the parcels:</b> " + e.message);
      }
    });
  }

  /* ================================================================== which cell is on screen */
  function activate(t) {
    if (ANN.on && t !== ACT) { annealShow(false); ANN.sig = null; ANN.done = {}; }   // another cell: back to its wool thread
    ACT = t;
    SLOTS.forEach(function (s) { s.frame.classList.toggle("on", s === t); });
    ov.classList.toggle("on", t === "all");
    var all = t === "all";
    ["oOutside", "oInside", "oSpine", "oEdge", "oRib", "oBetween", "bAnchors"].forEach(function (id) { $(id).disabled = all || !(t && t.pack); });
    corridorUI();
    kindUI(t);
    if (all) {
      CellOverview.fit();
      CellMeasure.use(CellOverview.host);
      var L = live(), km2 = L.reduce(function (a, s) { return a + ((s.pack.figures || {}).areaKm2 || 0); }, 0);
      $("cId").textContent = "All cells";
      $("cSub").textContent = L.length + " cells · " + num(km2) + " km² · " + (L[0] ? L[0].pack.year : "");
      note("<b>All " + L.length + " cells on one sheet</b>, in British National Grid. Wheel zooms, drag pans, click a cell to open it. " +
        "Export PNG and Export DXF here take every cell at once.");
    } else if (t && t.pack) {
      var o = t.opt;
      $("oCorr").value = PAGE.corridorM; $("oCorrS").value = PAGE.corridorSpineM; corridorUI();
      $("oSpine").value = o.spinePts; $("oEdge").value = o.edgePairs; $("oInside").value = o.inside; $("oOutside").value = o.outside;
      $("oRib").value = o.ribM; $("oBetween").value = o.between; $("oConnect").value = o.connect || "nearby";
      $("cId").textContent = "Cell " + t.pack.id;
      var f = t.pack.figures || {};
      $("cSub").textContent = (t.kind === "spine" ? "in the spine, no station" : t.pack.centre ? "converges on " + t.pack.centre.id : "no station") + " · " + num(f.areaKm2 || 0) + " km² · " + t.pack.year;
      if (t.measure) CellMeasure.use(t.measure);
      t.statsSig = "";
      placedNote(t);
      if (window.LoopCity) LoopCity.label(t.pack.label || t.pack.id);
    }
    if (!ANN.on) workflowStepUI("wool");
    buttonsUI(t);
    if (t && t !== "all" && t.pack && !t.built && t.why) note("<b>Cell " + t.pack.id + " cannot be threaded:</b> " + t.why + ".");
    refresh(true);
  }
  function live() { return SLOTS.filter(function (s) { return s.pack && s.built; }); }
  function buttonsUI(t) {
    var all = t === "all";
    ["bPng", "bDxf", "bRoadsNow"].forEach(function (id) { $(id).disabled = !(all ? live().length : (t && t.built)); });
    $("bSaveCell").disabled = !(all ? live().length : (t && t.pack));
    $("bAnneal").disabled = false;                           // Annealing is always directly accessible; parcels transfer when available
  }

  /* ================================================================== the cells arriving */
  function keyOf(p) { var b = p.bbox || {}; return [p.id, p.year, Math.round(b.E0), Math.round(b.N0), Math.round(b.E1), Math.round(b.N1)].join("|"); }
  /* The surroundings shared by several cells ("In context") come only with a selection of cells: a single cell's
     pack.context is just a box, and taken as the shared surroundings it drew no map round the cell at all. */
  function sharedOf(ctx) { return ctx && ctx.kind === "loopcity.cells" && ctx.context && ctx.context.box ? ctx.context : null; }
  function packsOf(ctx) {
    if (!ctx) return [];
    if (ctx.kind === "loopcity.cells" && Array.isArray(ctx.cells)) return ctx.cells;
    return [ctx];
  }
  // replace: the quadrant's selection is the set of cells (cells already here keep their work)
  function setPacks(packs, replace, shared) {
    if (shared !== undefined) {
      CellLayers.set("shared", shared || null);
      if (shared) CellLayers.groundOf(shared);          // start its map images loading now, not at the first drawing
    }
    packs = packs.filter(function (p) { return p && p.kind === "loopcity.cell" && p.ring && p.bbox; });
    if (!packs.length) { note("<b>That is not a Loop City cell.</b>"); return; }
    var want = {}, first = null;
    packs.forEach(function (p) { want[keyOf(p)] = 1; });
    if (replace) SLOTS.slice().forEach(function (s) { if (s.pack && !want[keyOf(s.pack)]) removeSlot(s); });
    packs.forEach(function (p) {
      var s = null;
      SLOTS.forEach(function (x) { if (!s && x.pack && keyOf(x.pack) === keyOf(p)) s = x; });
      if (!s) {
        SLOTS.forEach(function (x) { if (!s && !x.pack) s = x; });      // the demonstration copy takes the first cell
        if (s) givePack(s, p); else s = makeSlot(p);
      }
      if (!first) first = s;
    });
    $("empty").style.display = "none";
    layersUI();
    activate(first);
    if (window.LoopCity) LoopCity.label(packs.length > 1 ? packs.length + " cells" : (packs[0].label || packs[0].id));
  }

  /* ================================================================== his display switches, and the view modes */
  var HIS = { threads: "cShowThreads", parcels: "cShowParcels", roads: "cShowRoads", anchors: "cShowAnchors" };
  function applyShow(s) {
    var w = s.win(), d = s.doc(); if (!s.ready || !d) return;
    Object.keys(HIS).forEach(function (k) {
      var el = d.getElementById(HIS[k]);
      if (el && el.checked !== SHOW[k]) { el.checked = SHOW[k]; el.dispatchEvent(new w.Event("change", { bubbles: true })); }
    });
  }
  function showUI() { Object.keys(HIS).forEach(function (k) { $("s" + k.charAt(0).toUpperCase() + k.slice(1)).checked = SHOW[k]; }); }

  var MODES = {
    /* every mode carries context -- the roads, the built fabric, the other cells -- so "In context" has something to
       show round the cells (22 Sep) */
    wool:    { show: [1, 1, 1, 1], ground: ["corridor", "fabric", "water", "roads_regional", "roads_national", "neighbours"], op: 0.7 },
    parcels: { show: [0, 1, 0, 0], ground: ["corridor", "fabric", "water", "roads_regional", "roads_national", "neighbours"], op: 0.6 },
    roads:   { show: [0, 1, 1, 0], ground: ["corridor", "water", "roads_local", "roads_regional", "roads_national", "neighbours"], op: 0.85, build: true },
    map:     { show: [1, 1, 1, 1], ground: ["corridor", "urban", "woodland", "greenspace", "water", "roads_local", "roads_regional", "roads_national", "neighbours"], op: 0.7 },
    cover:   { show: [1, 0, 0, 0], ground: ["urban", "woodland", "greenspace", "water", "aonb", "greenbelt_edge", "neighbours"], op: 0.85 },
    growth:  { show: [1, 0, 0, 0], ground: ["fabric", "mould", "water", "roads_national", "neighbours"], op: 0.9 },
    ground:  { show: [0, 0, 0, 0], ground: ["corridor", "urban", "woodland", "greenspace", "water", "aonb", "greenbelt_edge", "roads_local", "roads_regional", "roads_national", "mould", "neighbours"], op: 1 }
  };
  function applyMode(k) {
    var M = MODES[k]; if (!M) return;
    SHOW = { threads: !!M.show[0], parcels: !!M.show[1], roads: !!M.show[2], anchors: !!M.show[3] };
    CellLayers.LAYERS.forEach(function (L) { L.on = M.ground.indexOf(L.id) >= 0; });
    CellLayers.set("opacity", M.op);
    $("lOp").value = M.op;
    Array.prototype.forEach.call($("lList").querySelectorAll("input[data-l]"), function (el) { var L = CellLayers.byId(el.dataset.l); el.checked = !!(L && L.on); });
    showUI();
    SLOTS.forEach(applyShow);
    $("vMode").value = k;
    if (M.build) targets().forEach(function (s) { if (canRoad(s) && !s.roads.current() && !s.roads.busy) s.roads.build(); });
    refresh(true);
  }
  function custom() { $("vMode").value = "custom"; }
  $("vMode").onchange = function () { if (this.value !== "custom") applyMode(this.value); };
  $("vCtx").onchange = function () { CellLayers.set("context", this.value === "1"); refresh(true); };
  Object.keys(HIS).forEach(function (k) {
    $("s" + k.charAt(0).toUpperCase() + k.slice(1)).onchange = function () { SHOW[k] = this.checked; SLOTS.forEach(applyShow); custom(); refresh(true); };
  });

  function targets() { return ACT === "all" ? live() : (ACT && ACT.pack ? [ACT] : []); }
  function canRoad(s) { var w = s.win(); return s.ready && s.roads && w && w.__wool && w.__wool.topo && w.__wool.iter > 0; }
  $("bRoadsNow").onclick = function () {
    var T = targets().filter(canRoad);
    if (!T.length) { note("<b>Nothing to build roads from yet:</b> press <b>Run</b> in the wool thread first (or <b>Run all</b>)."); return; }
    if (!SHOW.roads) { SHOW.roads = true; showUI(); SLOTS.forEach(applyShow); custom(); }
    T.forEach(function (s) { s.roads.build(); });
  };

  /* ================================================================== measure */
  CellMeasure.onChange = function (t) { var el = $("measureOut"); el.innerHTML = t; el.style.display = t ? "block" : "none"; };
  $("bMeasure").onclick = function () { var on = CellMeasure.toggle(); this.classList.toggle("on", on); };

  /* ================================================================== the layers popover */
  function layersUI() {
    var h = '', have = {};
    SLOTS.forEach(function (s) {
      if (!s.pack) return;
      Object.keys(s.pack.layers || {}).forEach(function (id) { have[id] = 1; });
      if (s.pack.fabric) have.fabric = 1;
    });
    CellLayers.LAYERS.forEach(function (L) {
      if (L.raster && !have[L.id]) return;
      if (L.id === 'fabric' && !have.fabric) return;
      h += '<label><input type="checkbox" data-l="' + L.id + '"' + (L.on ? ' checked' : '') + '> ' + L.nm + '</label>';
    });
    $('lList').innerHTML = h;
  }
  $('bLayers').onclick = function (e) { e.stopPropagation(); $('layersPop').classList.toggle('show'); };
  $('layersPop').addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { $('layersPop').classList.remove('show'); });
  $('lList').addEventListener('change', function (e) { var id = e.target.dataset.l; if (id) { CellLayers.toggle(id, e.target.checked); custom(); } });
  $('lRail').onchange = function () { CellLayers.set('railOn', this.checked); };
  $('lStation').onchange = function () { CellLayers.set('stationOn', this.checked); };
  $('lGreen').onchange = function () { CellLayers.set('greenOn', this.checked); };
  $('lOp').oninput = function () { CellLayers.set('opacity', +this.value); custom(); };
  $('lRoadW').oninput = function () {
    CellLayers.set('roadScale', +this.value);
    $('vRoadW').textContent = '× ' + (+this.value).toFixed(2) + (+this.value === 1 ? ' (his widths)' : '');
  };

  /* ================================================================== the tabs, and what each cell has got to */
  function running(s) { var d = s.doc(), b = d && d.getElementById("bRun"); return !!(b && /pause/i.test(b.textContent)); }
  function statusOf(s) {
    if (!s.pack) return "demonstration";
    if (!s.built && s.why) return "cannot be threaded";
    var w = s.win(), wo = w && w.__wool;
    if (!wo || !s.built) return "loading";
    if (s.run && s.run.text) return s.run.text;
    var target = (wo.params && wo.params.stopAt) || 3000, R = s.roads && s.roads.current(), n = s.layers.parcels.length;
    if (running(s)) return "solving " + num(wo.iter) + " / " + num(target);
    if (s.roads && s.roads.busy) return "building roads";
    if (n && R) return n + " plots · " + R.roads.length + " roads";
    if (n) return n + " plots";
    if (wo.iter > 0) return "solved to " + num(wo.iter);
    return "not run";
  }
  var tabSig = "";
  function refresh(force) {
    // reading every cell's parcels back out of his app twice a second is the page's steadiest cost: not while the lab is on
    if (!ANN.on) SLOTS.forEach(function (s) { if (s.built && s.ready) s.layers.sync(); });
    var many = SLOTS.filter(function (s) { return s.pack; }).length > 1;
    $("cellsGrp").style.display = many ? "" : "none";
    var sig = (ACT === "all" ? "all" : (ACT ? ACT.n : "-")) + "|" + SLOTS.map(function (s) { return s.n + ":" + (s.pack ? s.pack.id : "") + ":" + statusOf(s); }).join(",") + "|" + !!RUN;
    if (force || sig !== tabSig) {
      tabSig = sig;
      if (many) {
        var h = '';
        SLOTS.forEach(function (s) {
          if (!s.pack) return;
          h += '<span class="chip' + (s === ACT ? ' on' : '') + '" data-n="' + s.n + '" title="Cell ' + s.pack.id + '"><b>' + s.pack.id + '</b> ' + statusOf(s) +
               '<button class="x" data-x="' + s.n + '" title="Close this cell">&times;</button></span>';
        });
        h += '<span class="chip all' + (ACT === "all" ? ' on' : '') + '" data-n="all"><b>All cells</b></span>';
        $("cells").innerHTML = h;
      }
      $("bRunAll").textContent = RUN ? (RUN.stop ? "Stopping…" : "Stop") : "Run all";
    }
    // his display switches, read back from the cell on screen (they can be changed in his own panel too)
    if (ACT && ACT !== "all" && ACT.ready) {
      var d = ACT.doc(), changed = false;
      Object.keys(HIS).forEach(function (k) { var el = d.getElementById(HIS[k]); if (el && el.checked !== SHOW[k]) { SHOW[k] = el.checked; changed = true; } });
      if (changed) { showUI(); custom(); }
    }
    statsNote();
  }
  $("cells").addEventListener("click", function (e) {
    var x = e.target.closest("[data-x]");
    if (x) {
      e.stopPropagation();
      var s = SLOTS.filter(function (q) { return String(q.n) === x.dataset.x; })[0]; if (!s) return;
      var wo = s.win() && s.win().__wool;
      if (wo && wo.iter > 0 && !window.confirm("Close cell " + s.pack.id + "? What it has done here (threads, parcels, roads) is not kept -- export it first if you need it.")) return;
      removeSlot(s); return;
    }
    var c = e.target.closest("[data-n]"); if (!c) return;
    if (c.dataset.n === "all") activate("all");
    else activate(SLOTS.filter(function (q) { return String(q.n) === c.dataset.n; })[0]);
  });
  setInterval(function () { refresh(false); }, 500);

  // what the parcels of the cell on screen measure, once per extraction -- are they too small?
  function ringArea(pts) { var a = 0; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]); return Math.abs(a / 2); }
  function parcelFigures(list) {
    var A = list.map(function (p) { return ringArea(p.pts); }).sort(function (a, b) { return a - b; });
    if (!A.length) return null;
    var q = function (f) { return A[Math.min(A.length - 1, Math.floor(f * A.length))]; };
    return { n: A.length, green: list.filter(function (p) { return p.green; }).length, med: q(0.5), p10: q(0.1), p90: q(0.9), total: A.reduce(function (a, b) { return a + b; }, 0) };
  }
  function statsNote() {
    if (!ACT || ACT === "all" || !ACT.built) return;
    var P = ACT.layers.parcels, R = ACT.roads && ACT.roads.current();
    var sig = P.length + ":" + (P[0] ? P[0].pts.length + ":" + P[0].pts[0][0] : "") + ":" + (R ? R.roads.length + ":" + R.iter : "");
    if (sig === ACT.statsSig) return;
    ACT.statsSig = sig;
    var F = parcelFigures(P);
    if (!F) return;
    var ha = function (m2) { return num(m2 / 10000, m2 < 100000 ? 1 : 0) + " ha"; };
    note("<b>Cell " + ACT.pack.id + ": " + F.n + " parcels</b> (" + F.green + " in the green corridor) · median " + ha(F.med) +
      " -- a square of about " + num(Math.sqrt(F.med)) + " m · most between " + ha(F.p10) + " and " + ha(F.p90) +
      " · " + num(F.total / 1e6, 1) + " km² in parcels" +
      (R ? " · roads: level 1 " + num(R.lenMain / 1000, 1) + " km, level 2 " + num(R.lenSecondary / 1000, 1) + " km" : "") +
      ". <b>Measure</b> checks any distance on the drawing.");
  }

  /* ================================================================== Run all */
  function runAll() {
    if (RUN) { RUN.stop = true; refresh(true); return; }
    var todo = live().filter(function (s) { return s.ready; });
    if (!todo.length) return;
    var conc = Math.max(1, Math.min(todo.length, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
    RUN = { stop: false, live: 0, i: 0, todo: todo, conc: conc, t0: Date.now() };
    note("<b>Run all:</b> " + todo.length + " cells, " + conc + " at a time -- his Run to the end of his iterations, his Extract parcels, then the roads. " +
      "Open any cell's tab to watch it; <b>Stop</b> pauses them where they are.");
    refresh(true);
    pump();
  }
  function pump() {
    if (!RUN) return;
    while (!RUN.stop && RUN.live < RUN.conc && RUN.i < RUN.todo.length) {
      RUN.live++;
      runOne(RUN.todo[RUN.i++], function () { RUN.live--; pump(); });
    }
    if (RUN.live === 0 && (RUN.stop || RUN.i >= RUN.todo.length)) {
      var stopped = RUN.stop, mins = (Date.now() - RUN.t0) / 60000, L = RUN.todo;
      RUN = null;
      var parts = L.map(function (s) { return s.pack.id + " " + statusOf(s); });
      note((stopped ? "<b>Run all stopped.</b> " : "<b>Run all finished</b> in " + num(mins, 1) + " min. ") + parts.join(" · ") + ". Open <b>All cells</b> to see them together.");
      refresh(true);
    }
  }
  // one cell: his buttons, in his order, watching his own state for each step to finish
  function runOne(s, done) {
    var d = s.doc(), wo = s.win().__wool;
    var btn = function (id) { return d.getElementById(id); };
    var target = (wo.params && wo.params.stopAt) || 3000, t = Date.now(), prev = null;
    s.run = { step: "solve", text: "starting" };
    if (!running(s) && wo.iter < target) btn("bRun").click();
    function next(step, text) { s.run.step = step; s.run.text = text; t = Date.now(); }
    function finish(msg) { s.run = null; if (msg) s.lastRun = msg; refresh(true); done(); }
    (function poll() {
      if (!s.frame.isConnected || s.run === null || s.run.cancel) { s.run = null; done(); return; }
      if (RUN && RUN.stop) { if (running(s)) btn("bRun").click(); finish(); return; }
      var r = s.run, age = Date.now() - t;
      if (r.step === "solve") {
        if (running(s)) r.text = "solving " + num(wo.iter) + " / " + num(target);
        else if (wo.iter > 0) { prev = wo.current().parcels; next("parcels", "extracting parcels"); btn("bParcels").click(); }
        else if (age > 4000) { finish("did not start"); return; }
      } else if (r.step === "parcels") {
        var ps = wo.current().parcels;
        if (ps && ps !== prev) { next("roads", "building roads"); s.roads.build(); }
        else if (age > 240000) { finish("parcels did not finish"); return; }
      } else if (r.step === "roads") {
        if (!s.roads.busy && (s.roads.current() || s.roads.error)) { finish(); return; }
        if (age > 300000) { finish("roads did not finish"); return; }
      }
      setTimeout(poll, 400);
    })();
  }
  $("bRunAll").onclick = runAll;

  /* ================================================================== exports, in BNG */
  /* Saving a file off the disk. A browser allows one file per click and then refuses the rest: a page that
     fires two saves in a row (the DXF and its .prj did) is flagged, and every later save is dropped without a
     word -- a crossed-out arrow appears in the address bar. So: one automatic save per press, and the file is
     also offered as a link in the note, because clicking that link is a fresh press and is never refused.
     The links stay alive until four more files have been saved. */
  var KEEP = [];
  function blobLink(blob, name, label) {
    var u = URL.createObjectURL(blob);
    KEEP.push(u);
    while (KEEP.length > 5) URL.revokeObjectURL(KEEP.shift());
    return '<a href="' + u + '" download="' + String(name).replace(/"/g, "") + '">' + (label || name) + "</a>";
  }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 20000);
    return blobLink(blob, name, "save it again");
  }
  function saved(name, link, extra) {
    note("<b>" + name + "</b> saved" + (extra || "") + ". Nothing in your downloads? The browser refuses repeated " +
         "saves from a page opened off the disk -- " + link + ", or allow them at the crossed-out arrow in the address bar.");
  }
  function stem() {
    if (ACT === "all") { var L = live(); return "Loop City cells " + L.map(function (s) { return s.pack.id; }).join(" ") + " " + (L[0] ? L[0].pack.year : ""); }
    return "Loop City cell " + (ACT && ACT.pack ? ACT.pack.id + " " + ACT.pack.year : "demo");
  }

  // a picture at print size (3,000 px across) of what the view shows; Shift + click: exactly the screen instead
  $("bPng").onclick = function (e) {
    var c = null, name = stem();
    if (ACT === "all") { c = CellOverview.png(); name += " all cells"; }
    else if (ACT && e && e.shiftKey) { c = ACT.layers.composite(ACT.measure && CellMeasure.points.length ? ACT.measure.canvas : null); name += " wool thread (screen)"; }
    else if (ACT && ACT.built) { c = CellOverview.cellPng(ACT, 3000); name += " wool thread " + ($("vMode").value || "view"); }
    if (!c) { note("Nothing to draw yet: open a cell and run the wool thread first."); return; }
    var px = c.width + " × " + c.height + " px";
    c.toBlob(function (b) {
      if (!b) { note("<b>The picture could not be made</b> at " + px + " -- the browser ran out of room for a canvas that size. Try Shift+click for the screen instead."); return; }
      saved(name + ".png", download(b, name + ".png"), " (" + px + ", " + num(b.size / 1048576, 1) + " MB)");
      CellOverview.freeScratch();
    });
  };

  // a plain R12 DXF: polylines, points and text on named layers, metres, British National Grid
  function dxf(layers) {
    var o = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC",
             "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layers.length)];
    layers.forEach(function (L) { o.push("0", "LAYER", "2", L.name, "70", "0", "62", String(L.color), "6", "CONTINUOUS"); });
    o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
    layers.forEach(function (L) {
      (L.polys || []).forEach(function (P) {
        o.push("0", "POLYLINE", "8", L.name, "66", "1", "70", P.closed ? "1" : "0");
        P.pts.forEach(function (q) { o.push("0", "VERTEX", "8", L.name, "10", q[0].toFixed(3), "20", q[1].toFixed(3), "30", "0"); });
        o.push("0", "SEQEND", "8", L.name);
      });
      (L.points || []).forEach(function (q) { o.push("0", "POINT", "8", L.name, "10", q[0].toFixed(3), "20", q[1].toFixed(3), "30", "0"); });
      (L.texts || []).forEach(function (T) { o.push("0", "TEXT", "8", L.name, "10", T.p[0].toFixed(3), "20", T.p[1].toFixed(3), "30", "0", "40", String(T.h), "1", T.t); });
    });
    o.push("0", "ENDSEC", "0", "EOF");
    return o.join("\n");
  }
  var PRJ = 'PROJCS["OSGB 1936 / British National Grid",GEOGCS["OSGB 1936",DATUM["OSGB_1936",SPHEROID["Airy 1830",6377563.396,299.3249646]],' +
    'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",49],' +
    'PARAMETER["central_meridian",-2],PARAMETER["scale_factor",0.9996012717],PARAMETER["false_easting",400000],' +
    'PARAMETER["false_northing",-100000],UNIT["metre",1]]';

  function dxfLayers(list) {
    var Ls = {}, order = [];
    function L(name, color) { if (!Ls[name]) { Ls[name] = { name: name, color: color, polys: [], points: [], texts: [] }; order.push(name); } return Ls[name]; }
    L("CELL", 1); L("CELL_NAMES", 7); L("RAILWAY", 7); L("GREEN_CORRIDOR_EDGES", 3); L("ANCHORS_OUTSIDE", 30); L("ANCHORS_INSIDE", 30);
    L("WOOL_THREADS", 8); L("WOOL_PARCELS", 32); L("GREEN_CORRIDOR_PARCELS", 3); L("WOOL_ROADS_L1", 30); L("WOOL_ROADS_L2", 94);
    list.forEach(function (s) {
      var w = s.win(); if (!w || !w.__wool || !s.built) return;
      var E0 = s.built.frame.E0, N0 = s.built.frame.N0, W = w.__wool, m = W.model;
      var G = function (x, y) { return [x + E0, y + N0]; };
      L("CELL").polys.push({ closed: true, pts: m.boundary.map(function (p) { return G(p[0], p[1]); }) });
      var c = CellLayers.centroid(s.pack.ring);
      L("CELL_NAMES").texts.push({ p: c, h: 250, t: "Cell " + s.pack.id });
      var seen = {};
      m.groups.forEach(function (g) {
        g.A.forEach(function (id) { var a = m.anchors[id]; if (a && !seen[id]) { seen[id] = 1; L("ANCHORS_OUTSIDE").points.push(G(a.x, a.y)); } });
        g.B.forEach(function (id) { var a = m.anchors[id]; if (a && !seen[id]) { seen[id] = 1; L("ANCHORS_INSIDE").points.push(G(a.x, a.y)); } });
      });
      var tp = W.topo, pos = W.positions;
      if (tp && pos) {
        for (var t = 0; t < tp.T; t++) {
          var ia = tp.threads[3 * t], ib = tp.threads[3 * t + 1], base = tp.NA + t * (tp.S - 1), pts = [G(pos[2 * ia], pos[2 * ia + 1])];
          for (var k = 0; k < tp.S - 1; k++) pts.push(G(pos[2 * (base + k)], pos[2 * (base + k) + 1]));
          pts.push(G(pos[2 * ib], pos[2 * ib + 1]));
          L("WOOL_THREADS").polys.push({ closed: false, pts: pts });
        }
      }
      s.layers.sync();
      s.layers.parcels.forEach(function (p) { L(p.green ? "GREEN_CORRIDOR_PARCELS" : "WOOL_PARCELS").polys.push({ closed: true, pts: p.pts }); });
      var R = s.roads && s.roads.current();
      if (R) R.roads.forEach(function (r) { L(r.level === 1 ? "WOOL_ROADS_L1" : "WOOL_ROADS_L2").polys.push({ closed: false, pts: r.pts.map(function (q) { return G(q[0], q[1]); }) }); });
      (s.pack.spine || []).forEach(function (r) { L("RAILWAY").polys.push({ closed: false, pts: r }); });
      var C = s.built.corridor;
      if (C) [C.left, C.right].forEach(function (edge) { clipToRing(edge, s.pack.ring).forEach(function (piece) { L("GREEN_CORRIDOR_EDGES").polys.push({ closed: false, pts: piece }); }); });
    });
    return order.map(function (k) { return Ls[k]; });
  }
  // the pieces of a polyline inside a ring, cut exactly where it crosses the ring
  function clipToRing(line, ring) {
    var R = ring.slice(); if (R.length > 3 && R[0][0] === R[R.length - 1][0] && R[0][1] === R[R.length - 1][1]) R.pop();
    function inside(q) { return CellLayers.inPoly(R, q[0], q[1]); }
    var out = [], cur = null;
    for (var i = 0; i < line.length; i++) {
      var q = line[i], inQ = inside(q);
      if (i > 0) {
        var p = line[i - 1], hits = [];
        for (var k = 0; k < R.length; k++) {
          var a = R[k], b = R[(k + 1) % R.length], rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1], den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-12) continue;
          var t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
          if (t > 0 && t <= 1 && u >= 0 && u <= 1) hits.push(t);
        }
        hits.sort(function (x, y) { return x - y; });
        hits.forEach(function (t) {
          var h = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
          if (cur) { cur.push(h); if (cur.length > 1) out.push(cur); cur = null; } else cur = [h];
        });
      }
      if (inQ) { if (!cur) cur = []; cur.push(q); }
    }
    if (cur && cur.length > 1) out.push(cur);
    return out;
  }
  $("bDxf").onclick = function () {
    var list = ACT === "all" ? live() : (ACT && ACT.pack ? [ACT] : []);
    if (!list.length) return;
    var layers = dxfLayers(list), n = function (nm) { var x = layers.filter(function (l) { return l.name === nm; })[0]; return x ? x.polys.length + x.points.length : 0; };
    var link = download(new Blob([dxf(layers)], { type: "application/dxf" }), stem() + " wool thread.dxf");
    var prj = blobLink(new Blob([PRJ], { type: "text/plain" }), stem() + " wool thread.prj", "the .prj beside it");
    saved(stem() + " wool thread.dxf", link,
      " in British National Grid metres: " + list.length + (list.length > 1 ? " cells" : " cell") + ", the railway, " +
      (n("ANCHORS_OUTSIDE") + n("ANCHORS_INSIDE")) + " anchors, " + n("WOOL_THREADS") + " threads, " + n("WOOL_PARCELS") + " parcels and " +
      n("GREEN_CORRIDOR_PARCELS") + " in the green corridor, " + (n("WOOL_ROADS_L1") + n("WOOL_ROADS_L2")) + " roads (level 1 and 2 on their own layers). Save " +
      prj + " too if the drawing is going into GIS");
  };

  $("bSaveCell").onclick = function () {
    var b = null;
    if (ACT === "all") {
      var L = live();
      b = new Blob([JSON.stringify({ kind: "loopcity.cells", cells: L.map(function (s) { return s.pack; }), context: CellLayers.OPT.shared || undefined, corridor: corridorId() })], { type: "application/json" });
    } else if (ACT && ACT.pack) b = new Blob([JSON.stringify(Object.assign({}, ACT.pack, { corridorUsed: corridorId() }))], { type: "application/json" });
    if (!b) return;
    saved(stem() + ".json", download(b, stem() + ".json"), " -- open it again with <b>Open cell file…</b>");
  };
  function openCellFile() { $("fileCell").click(); }
  $("bOpenCell").onclick = openCellFile; $("bOpenCell2").onclick = openCellFile;
  $("bHideEmpty").onclick = function () { $("empty").style.display = "none"; };
  // one or more files; each adds its cells to the ones already here
  $("fileCell").onchange = function (e) {
    var files = Array.prototype.slice.call(e.target.files || []); e.target.value = "";
    if (!files.length) return;
    var packs = [], left = files.length, ctxFromFile = null;
    files.forEach(function (f) {
      var r = new FileReader();
      r.onload = function () {
        try { var obj = JSON.parse(r.result); packs = packs.concat(packsOf(obj)); if (sharedOf(obj)) ctxFromFile = sharedOf(obj); } catch (err) { note("<b>Could not read " + f.name + ":</b> " + err.message); }
        if (--left === 0 && packs.length) setPacks(packs, false, ctxFromFile || undefined);
      };
      r.readAsText(f);
    });
  };
  /* Place anchors: this cell's counts, and the corridor's two widths. The widths are the whole page's -- one
     band along the railway -- so a change of width places every cell again (their runs start over). */
  $("oCorrSrc").onchange = function () {
    var fixedNow = this.value === "fixed";
    ["oCorr", "oCorrS"].forEach(function (id) { $(id).disabled = !fixedNow; });
    if (ACT && ACT !== "all" && ACT.pack) note("Corridor: <b>" + (fixedNow ? "fixed widths" : "the corridor app's polylines") + "</b> -- press <b>Place anchors</b> to thread every cell with it.");
  };
  $("bAnneal").onclick = annealSend;
  $("bAnnealBack").onclick = function () { annealShow(false); };

  function bindWorkflowStepNavigation() {
    var root = document.getElementById("cellWorkflowSteps");
    if (!root || root.__lcBound) return;
    root.__lcBound = true;

    Array.prototype.forEach.call(root.querySelectorAll(".wf-step"), function (el) {
      el.setAttribute("role", "button");
      el.tabIndex = 0;

      function openStep() {
        var step = el.getAttribute("data-wf");

        if (step === "anneal") {
          annealSend();
          return;
        }

        annealShow(false);

        var vm = $("vMode");
        if (vm) {
          vm.value = step === "parcel" ? "parcels" : "wool";
          try {
            vm.dispatchEvent(new Event("change", { bubbles: true }));
          } catch (_) {
            if (typeof vm.onchange === "function") vm.onchange();
          }
        }

        workflowStepUI(step === "parcel" ? "parcel" : "wool");
      }

      el.addEventListener("click", openStep);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openStep();
        }
      });
    });
  }

  bindWorkflowStepNavigation();
  $("bAnchors").onclick = function () {
    if (!ACT || ACT === "all" || !ACT.pack) return;
    var o = { corridorM: PAGE.corridorM, corridorSpineM: PAGE.corridorSpineM, spinePts: +$("oSpine").value, edgePairs: +$("oEdge").value,
              mouthPts: (ACT.opt && ACT.opt.mouthPts) || 6, inside: +$("oInside").value, outside: +$("oOutside").value,
              ribM: +$("oRib").value, between: +$("oBetween").value, connect: $("oConnect").value };
    var wN = +$("oCorr").value, wS = +$("oCorrS").value, src = $("oCorrSrc").value, failed = [];
    function restore() {
      var a = ACT.opt;
      $("oCorr").value = PAGE.corridorM; $("oCorrS").value = PAGE.corridorSpineM; $("oCorrSrc").value = PAGE.source; corridorUI();
      $("oSpine").value = a.spinePts; $("oEdge").value = a.edgePairs; $("oInside").value = a.inside; $("oOutside").value = a.outside;
      $("oRib").value = a.ribM; $("oBetween").value = a.between; $("oConnect").value = a.connect || "nearby";
    }
    if (src !== PAGE.source || (src === "fixed" && (wN !== PAGE.corridorM || wS !== PAGE.corridorSpineM))) {
      if (RUN) { note("<b>Run all is going:</b> stop it before changing the corridor -- a new corridor places every cell again."); restore(); return; }
      var others = SLOTS.filter(function (s) { return s.pack && s !== ACT; });
      var ran = others.filter(function (s) { var wo = s.win() && s.win().__wool; return s.built && wo && wo.iter > 0; });
      if (ran.length && !window.confirm("The corridor is one band along the railway, so a new corridor places the anchors of every cell again -- " +
          ran.map(function (s) { return s.pack.id; }).join(", ") + " will start over. Go ahead?")) { restore(); return; }
      PAGE.corridorM = wN; PAGE.corridorSpineM = wS; PAGE.source = LCOR ? LCOR.setMode(src) : "fixed"; corridorUI();
      others.forEach(function (s) { if (place(s) === false) failed.push(s.pack.id); });
    }
    ACT.opt = o;
    place(ACT);
    if (failed.length) note($("note").innerHTML + " <b>Cannot be threaded with this corridor:</b> " + failed.join(", ") + ".");
    refresh(true);
  };

  /* ================================================================== drawing, every frame, for what is on screen */
  (function tick() {
    try {
      if (ANN.on) { /* the lab covers the page: drawing the cells behind it costs a frame and shows nothing */ }
      else if (ACT === "all") CellOverview.draw(false);
      else if (ACT) { ACT.layers.redraw(false); if (ACT.measure) ACT.measure.draw(); }
    } catch (e) { /* a frame still loading */ }
    requestAnimationFrame(tick);
  })();

  CellOverview.init(ov, function () { return SLOTS; }, function () { return SHOW; }, function (s) { activate(s); });

  // the demonstration copy, until a cell arrives
  activate(makeSlot(null));  // Wool sends this when one or more parcels are selected and the user presses Enter.
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.channel !== "WOOL_ANNEAL_HTML_BRIDGE_V1" ||
        d.source !== "wool" ||
        d.type !== "event" ||
        d.event !== "enterSelectedParcel") return;

    var slot = null;
    for (var i = 0; i < SLOTS.length; i++) {
      try {
        if (SLOTS[i].win && SLOTS[i].win() === e.source) {
          slot = SLOTS[i];
          break;
        }
      } catch (_) {}
    }

    if (!slot) return;
    if (slot !== ACT) activate(slot);

    // Use the exact same transfer path as the Annealing button:
    // selected Wool parcels -> AnnealWorkflowBridge.importParcels -> applySelection.
    annealSend();
  });

  // Global top navigation can return from Annealing to the Wool workspace.
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.lc !== 1 || d.type !== "openWool") return;

    try {
      if (window.parent && window.parent !== window && e.source !== window.parent) return;
    } catch (_) {}

    // Hide Annealing only; keep the Wool iframe, simulation, anchors,
    // selected parcels and all controls exactly as they were.
    annealShow(false);
    applyMode("wool");
    workflowStepUI("wool");

    try {
      var w = ACT && ACT !== "all" && ACT.win && ACT.win();
      if (w && w.focus) w.focus();
    } catch (_) {}
  });

  // Global top navigation can open the Annealing workspace directly.
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.lc !== 1 || (d.type !== "openAnnealing" && d.type !== "openAnnealingDemo")) return;

    try {
      if (window.parent && window.parent !== window && e.source !== window.parent) return;
    } catch (_) {}

    if (d.type === "openAnnealingDemo") {
      annealPreviewOpen();
      return;
    }

    annealSend();
  });



  /* ================================================================== the link to the other scales */
  if (window.LoopCity) {
    LoopCity.on("enter", function (ctx) { setPacks(packsOf(ctx), true, sharedOf(ctx)); });
    LoopCity.on("shell", function () { if (ACT && ACT.pack) LoopCity.label(ACT.pack.label || ACT.pack.id); });
    LoopCity.ready();
  }
  window.LoopCityCell = {
    load: function (ctx) { setPacks(packsOf(ctx), true, sharedOf(ctx)); },
    add: function (ctx) { setPacks(packsOf(ctx), false); },
    activate: function (i) { activate(i === "all" ? "all" : SLOTS[i]); },
    mode: applyMode, runAll: runAll,
    openAnnealing: annealSend,
    closeAnnealing: function () { annealShow(false); },
    openWool: function () {
      annealShow(false);
      applyMode("wool");
      workflowStepUI("wool");
    },
    get slots() { return SLOTS; }, get active() { return ACT; },
    get pack() { return ACT && ACT.pack; }, get built() { return ACT && ACT.built; }
  };
})();
