/* ============================================================================================
   Loop City v10 -- his level 1/2 road network, on a cell at real size.

   His "Build level 1/2 roads" hands the solved threads to his road worker (the script "roadSrc" in his
   page). That worker is tuned to his own cell, 49,794 m2 (about 220 m across): some of its tolerances are
   fixed numbers of metres, and on a 15 km cell its indexes outgrow what the browser allows -- it stops with
   "Map maximum size exceeded". Nothing is wrong with his logic; it is asked to work 70 times larger than
   the size it was written for.

   His app keeps its workings private (one closure), so the road step cannot be re-routed inside it. This
   does it from outside, in three parts, without changing a line of his code:

     1. the request   built from what his app exposes (window.__wool: the threads, the anchors, the groups,
                      the outline, his road settings; his parcels) exactly as his generateRoads builds it --
                      roadThreadsFlat, roadAnchorRoles, roadGatewayMask and roleOf are ported here line for
                      line, with the same numbers (9,000 road points, at least 20 per thread; an anchor is on
                      the outline within 1% of the outline's diagonal; only groups named Road north / Road
                      south give level 1 gateways).
     2. his worker    made from his own roadSrc text, as his makeWorker makes it, and sent the request scaled
                      DOWN to his calibration size about the centre of the outline (as his calibration scales).
                      His road distances were scaled up with the cell by his calibration; they come back down
                      with it, so his worker sees his own defaults. The answer is scaled back UP to metres.
     3. his buttons   his "Build level 1/2 roads" and "Clear roads" are caught before they reach his page and
                      do this instead; his road sliders re-run it; his status line reports it; his "Show road
                      network" shows and hides it. The roads are drawn by layers.js, in his two colours and
                      widths, over his drawing.

   On his demonstration cell the factor is 1 and nothing is scaled.
   ============================================================================================ */
(function (root) {
  "use strict";
  var HIS_AREA = 49794;                                                    // his cell, m2 -- his calibration size
  var PARAM_LEN = ["radius", "minRun", "secondaryLength", "connectTol"];   // his road distances, in metres
  var STAT_LEN = ["secondaryLengthThreshold", "terminusServiceTol", "invalidTerminiRemovedLength",
                  "isolatedRoadLengthRemoved", "mainDensityPromotedLength"];

  function areaOf(B) { var a = 0; for (var i = 0, j = B.length - 1; i < B.length; j = i++) a += (B[j][0] + B[i][0]) * (B[j][1] - B[i][1]); return Math.abs(a / 2); }
  function frameOf(model) {
    var B = model && model.boundary, cx = 0, cy = 0;
    if (!B || B.length < 3) return { f: 1, cx: 0, cy: 0 };
    for (var i = 0; i < B.length; i++) { cx += B[i][0]; cy += B[i][1]; }
    cx /= B.length; cy /= B.length;
    var A = areaOf(B), f = A > 0 ? Math.sqrt(HIS_AREA / A) : 1;
    if (Math.abs(f - 1) < 1e-6) f = 1;
    return { f: f, cx: cx, cy: cy };
  }

  /* ------------------------------------------------------------------ 1. the request, as his generateRoads builds it */
  // his threadsFlat
  function threadsFlat(tp, pos) {
    var offs = new Int32Array(tp.T + 1), pts = new Float64Array(tp.T * (tp.S + 1) * 2), n = 0;
    for (var t = 0; t < tp.T; t++) {
      offs[t] = n;
      var ia = tp.threads[3 * t], ib = tp.threads[3 * t + 1], base = tp.NA + t * (tp.S - 1);
      pts[2 * n] = pos[2 * ia]; pts[2 * n + 1] = pos[2 * ia + 1]; n++;
      for (var k = 0; k < tp.S - 1; k++) { pts[2 * n] = pos[2 * (base + k)]; pts[2 * n + 1] = pos[2 * (base + k) + 1]; n++; }
      pts[2 * n] = pos[2 * ib]; pts[2 * n + 1] = pos[2 * ib + 1]; n++;
    }
    offs[tp.T] = n;
    return { pts: pts, offs: offs };
  }
  // his roadThreadsFlat: the same thinning, 9,000 points in all, at least 20 per thread
  function roadThreadsFlat(tp, pos) {
    var originalPerThread = tp.S + 1, originalTotal = tp.T * originalPerThread, targetTotal = 9000;
    var keepPerThread = Math.min(originalPerThread, Math.max(20, Math.floor(targetTotal / Math.max(1, tp.T))));
    if (keepPerThread >= originalPerThread) {
      var full = threadsFlat(tp, pos);
      full.originalPoints = originalTotal; full.roadPoints = originalTotal; full.samplesPerThread = originalPerThread;
      return full;
    }
    var offs = new Int32Array(tp.T + 1), pts = new Float64Array(tp.T * keepPerThread * 2), n = 0;
    function writePoint(index) { pts[2 * n] = pos[2 * index]; pts[2 * n + 1] = pos[2 * index + 1]; n++; }
    for (var t = 0; t < tp.T; t++) {
      offs[t] = n;
      var ia = tp.threads[3 * t], ib = tp.threads[3 * t + 1], base = tp.NA + t * (tp.S - 1), lastK = -1;
      for (var j = 0; j < keepPerThread; j++) {
        var k = Math.round(j * tp.S / Math.max(1, keepPerThread - 1));
        if (k === lastK) continue;
        lastK = k;
        if (k <= 0) writePoint(ia); else if (k >= tp.S) writePoint(ib); else writePoint(base + k - 1);
      }
    }
    offs[tp.T] = n;
    if (n * 2 !== pts.length) pts = pts.slice(0, n * 2);
    return { pts: pts, offs: offs, originalPoints: originalTotal, roadPoints: n, samplesPerThread: keepPerThread };
  }
  // his bbox, projectClosed, onOutline, groupsOf, roleOf
  function bbox(poly) { var b = [1e300, 1e300, -1e300, -1e300]; poly.forEach(function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }); return b; }
  function projectDist(poly, x, y) {
    var best = 1e300, n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      var t = l2 > 0 ? ((x - a[0]) * vx + (y - a[1]) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      var d = Math.hypot(a[0] + vx * t - x, a[1] + vy * t - y);
      if (d < best) best = d;
    }
    return best;
  }
  function roleFn(model) {
    var bb = bbox(model.boundary), tol = Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) * 0.01;
    function groupsOf(id) { var s = []; model.groups.forEach(function (g, gi) { if (g.A.indexOf(id) >= 0 || g.B.indexOf(id) >= 0) s.push(gi); }); return s; }
    return function roleOf(id) {
      var a = model.anchors[id]; if (!a) return "inner";
      if (projectDist(model.boundary, a.x, a.y) < tol) return "outline";
      if (groupsOf(id).length > 1) return "shared";
      return "inner";
    };
  }
  function roadAnchorRoles(tp, roleOf) {
    var ar = new Uint8Array(tp.NA);
    for (var i = 0; i < tp.NA; i++) { var role = roleOf(tp.ids[i]); ar[i] = role === "outline" ? 0 : (role === "shared" ? 1 : 2); }
    return ar;
  }
  function roadGatewayMask(tp, model, roleOf) {
    var sideById = new Map();
    model.groups.forEach(function (g) {
      var m = /^Road\s+(south|north)$/i.exec(g.name || "");
      if (!m) return;
      var code = m[1].toLowerCase() === "north" ? 1 : 2;
      g.A.forEach(function (id) { if (model.anchors[id] && roleOf(id) === "outline") sideById.set(id, code); });
    });
    var gm = new Uint8Array(tp.NA);
    for (var i = 0; i < tp.NA; i++) gm[i] = sideById.get(tp.ids[i]) || 0;
    return gm;
  }
  function flatBoundary(model) { var f = new Float64Array(model.boundary.length * 2); model.boundary.forEach(function (p, i) { f[2 * i] = p[0]; f[2 * i + 1] = p[1]; }); return f; }

  /* ------------------------------------------------------------------ 2. scaled to his size and back */
  function downFlat(a, F) {
    if (!a) return a;
    var o = new Float64Array(a.length);
    for (var i = 0; i + 1 < a.length; i += 2) { o[i] = F.cx + (a[i] - F.cx) * F.f; o[i + 1] = F.cy + (a[i + 1] - F.cy) * F.f; }
    return o;
  }
  function up(p, F) { if (p && p.length >= 2) { p[0] = F.cx + (p[0] - F.cx) / F.f; p[1] = F.cy + (p[1] - F.cy) / F.f; } }
  function upRoad(R, F) {
    if (!R) return;
    (R.pts || []).forEach(function (q) { up(q, F); });
    if (typeof R.length === "number") R.length /= F.f;
    if (R.box && R.box.length === 4) { var a = [R.box[0], R.box[1]], b = [R.box[2], R.box[3]]; up(a, F); up(b, F); R.box = [a[0], a[1], b[0], b[1]]; }
  }
  function paramsDown(p, F) {
    var q = {};
    Object.keys(p).forEach(function (k) { q[k] = p[k]; });
    PARAM_LEN.forEach(function (k) { if (typeof q[k] === "number") q[k] *= F.f; });
    return q;
  }
  function upReply(d, F) {
    if (!d || d.missing || F.f === 1) return d;
    (d.roads || []).forEach(function (R) { upRoad(R, F); });
    if (typeof d.centerX === "number" && typeof d.centerY === "number") { var c = [d.centerX, d.centerY]; up(c, F); d.centerX = c[0]; d.centerY = c[1]; }
    STAT_LEN.forEach(function (k) { if (typeof d[k] === "number") d[k] /= F.f; });
    var D = d.debug;
    if (D) {
      ["graphNodes", "gateways", "serviceTermini", "deadEnds"].forEach(function (k) { (D[k] || []).forEach(function (p) { up(p, F); }); });
      ["bridges", "removedIsolated"].forEach(function (k) { (D[k] || []).forEach(function (R) { upRoad(R, F); }); });
    }
    return d;
  }

  /* ------------------------------------------------------------------ one runner per copy of his app */
  var SNAP = 0;
  function create(win, doc, onChange) {
    var R = { win: win, doc: doc, worker: null, busy: false, again: false, snap: null, result: null, error: "", onChange: onChange || function () {} };
    var W = function () { return win.__wool; };
    function $(id) { return doc.getElementById(id); }
    function status(t) { var el = $("roadStatus"); if (el) el.textContent = t; }
    function button(busy) { var b = $("bRoads"); if (b) { b.disabled = !!busy; b.textContent = busy ? "Generating…" : "Build level 1/2 roads"; } }
    function worker() {
      if (R.worker) return R.worker;
      var src = $("roadSrc") ? $("roadSrc").textContent : "";
      R.worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      R.worker.onmessage = reply;
      R.worker.onerror = function (e) {
        R.busy = false; button(false);
        R.error = (e && e.message) ? e.message : "unknown error";
        status("Road generation failed: " + R.error); R.onChange();
        try { R.worker.terminate(); } catch (x) { /* gone */ }
        R.worker = null;
      };
      return R.worker;
    }
    function paused() { var b = $("bRun"); return !(b && /pause/i.test(b.textContent)); }

    // a fresh snapshot of the solved threads: the geometry his worker caches by key
    function snapshot() {
      var w = W(), tp = w && w.topo, pos = w && w.positions, m = w && w.model;
      if (!tp || !pos || !m) return null;
      var cur = w.current ? w.current() : {}, ps = cur.parcels, roleOf = roleFn(m), F = frameOf(m);
      var fl = roadThreadsFlat(tp, pos);
      var parcels = (ps && ps.polys && (!isFinite(ps.iter) || ps.iter === w.iter)) ? ps.polys : null;
      return {
        id: ++SNAP, iter: w.iter, topo: tp, positions: pos, F: F,
        originalPoints: fl.originalPoints || 0, roadPoints: fl.roadPoints || 0,
        data: {
          pts: downFlat(fl.pts, F), offs: fl.offs,
          anchors: downFlat(new Float64Array(pos.slice(0, tp.NA * 2)), F),
          anchorRoles: roadAnchorRoles(tp, roleOf), gatewayMask: roadGatewayMask(tp, m, roleOf),
          boundary: downFlat(flatBoundary(m), F),
          parcels: parcels ? parcels.map(function (P) { return downFlat(P, F); }) : null
        }
      };
    }
    function send(withData) {
      var w = W(), s = R.snap; if (!s) return;
      if (R.busy) { R.again = true; return; }
      var p = w.roadParams || {};
      var params = { radius: p.radius, mainDensity: p.mainDensity, secondaryMin: p.secondaryMin, secondaryLength: p.secondaryLength,
                     angleTol: p.angleTol, minRun: p.minRun, clean: p.clean, connect: p.connect, connectTol: p.connectTol, diagnostics: false };
      var msg = { req: s.id, key: s.id + "|" + p.radius + "|" + p.angleTol, params: paramsDown(params, s.F) };
      if (withData) Object.keys(s.data).forEach(function (k) { msg[k] = s.data[k]; });
      R.busy = true; R.error = ""; button(true);
      status("Building roads (his road worker, at his calibration size" + (s.F.f !== 1 ? ", 1 : " + fmt(1 / s.F.f, 1) : "") + "): bundled centrelines → X/T nodes → graph pre-repair → L1/L2 → parcel service · road input " +
        s.originalPoints.toLocaleString("en-GB") + "→" + s.roadPoints.toLocaleString("en-GB") + " points…");
      worker().postMessage(msg);
    }
    function reply(e) {
      var d = e.data, s = R.snap;
      R.busy = false;
      if (!s || d.req !== s.id) { button(false); if (R.again) { R.again = false; send(true); } return; }
      if (d.missing) { send(true); return; }
      if (R.again) { R.again = false; send(false); return; }
      button(false);
      upReply(d, s.F);
      var roads = (d.roads || []).map(function (r) { if (r) r.level = (r.level === 1 ? 1 : 2); return r; }).filter(Boolean);
      var L1 = 0, L2 = 0, len1 = 0, len2 = 0;
      roads.forEach(function (r) {
        var L = 0; for (var i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        r.lengthM = L; if (r.level === 1) { L1++; len1 += L; } else { L2++; len2 += L; }
      });
      R.result = { roads: roads, iter: s.iter, main: L1, secondary: L2, lenMain: len1, lenSecondary: len2, ms: d.ms, stats: d };
      status(roads.length
        ? "Roads " + roads.length + " · level 1 " + L1 + " (" + fmt(len1 / 1000, 1) + " km) · level 2 " + L2 + " (" + fmt(len2 / 1000, 1) + " km)" +
          " · north level 1 entries " + (d.northAccepted || 0) + " · south level 1 entries " + (d.southAccepted || 0) +
          " · parcels served " + (d.parcelServed || 0) + " of " + (d.parcelTargets || 0) +
          " · from iteration " + s.iter.toLocaleString("en-GB") + " · built by his road worker at his calibration size and scaled back to metres" +
          (d.ms !== undefined ? " · " + d.ms + " ms" : "")
        : "Road calculation finished, but no L1/L2 roads were formed. Check that the Road north / Road south edge entrances can snap to the current wool thread graph, or increase the road connection repair distance.");
      var sr = $("cShowRoads"); if (sr && !sr.checked) { sr.checked = true; sr.dispatchEvent(new win.Event("change", { bubbles: true })); }
      R.onChange();
    }

    function build() {
      if (!W() || !W().topo) { status("Thread network not initialised yet. Please wait."); return false; }
      if (!paused()) { $("bRun").click(); setTimeout(build, 350); return true; }   // his Build pauses the solve first
      R.snap = snapshot();
      if (!R.snap) { status("Thread network initialising; build the roads when it is ready."); return false; }
      R.result = null; R.onChange();
      send(true);
      return true;
    }
    function clear(msg) {
      R.snap = null; R.result = null; R.again = false;
      if (R.busy && R.worker) { try { R.worker.terminate(); } catch (e) { /* gone */ } R.worker = null; R.busy = false; }
      button(false);
      status(msg || "Road network cleared.");
      R.onChange();
    }
    // roads belong to the threads they were built from: a new solve, a reset or a moved anchor retires them
    function current() {
      var w = W();
      if (!R.result || !R.snap || !w) return null;
      if (w.topo !== R.snap.topo || w.iter !== R.result.iter) {
        clear("Roads out of date: the wool thread changed since they were built. Build the roads again.");
        return null;
      }
      return R.result;
    }

    // 3. his buttons and sliders, caught on the way in
    doc.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("#bRoads, #bClearRoads") : null;
      if (!t) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (t.id === "bRoads") build(); else clear();
    }, true);
    var SLIDERS = { sRoadRadius: 1, sRoadClean: 1, sRoadMain: 1, sRoadSecondary: 1, sRoadSecondaryLength: 1, sRoadAngle: 1, sRoadMinRun: 1,
                    sRoadConnectTol: 1, nRoadConnectTol: 1, cRoadConnect: 1 };
    var later = 0;
    doc.addEventListener("change", function (e) {
      if (!e.target || !SLIDERS[e.target.id] || !R.snap) return;
      clearTimeout(later); later = setTimeout(function () { if (R.snap) send(false); }, 60);   // after his own handler has set his roadP
    });

    return {
      build: build, clear: clear, current: current,
      get busy() { return R.busy; }, get error() { return R.error; },
      get shown() { var sr = $("cShowRoads"); return !sr || sr.checked; }
    };
  }

  function fmt(v, d) { return (+v).toLocaleString("en-GB", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }

  root.WoolRoads = { create: create, frameOf: frameOf, roleFn: roleFn, HIS_AREA: HIS_AREA };
})(window);
