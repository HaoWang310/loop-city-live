/* ============================================================================================
   Loop City v10 -- all cells at once.

   Every cell opened on the cell page has its own copy of his wool thread app. This draws them all together,
   in British National Grid metres, on one sheet: the ground each cell was cut from, the green corridor, his
   threads, his parcels (corridor parcels green), his level 1/2 roads, the railway and the stations, and each
   cell's outline with its name and where it has got to. It reads their results; it runs nothing.

   Wheel zooms, drag pans, a click on a cell opens it. With Measure on, clicks measure instead.
   ============================================================================================ */
(function (root) {
  "use strict";
  var O = { canvas: null, ground: null, view: { cx: 0, cy: 0, s: 1 }, slots: null, show: null, onPick: null, sig: "", fitted: "", drag: null, host: null };

  function size() { var r = O.canvas.getBoundingClientRect(); return [Math.max(1, r.width), Math.max(1, r.height)]; }
  // RV: the view being drawn -- the sheet on screen, or a picture made for export
  var RV = null;
  function W(E, N) { var v = RV || { cx: O.view.cx, cy: O.view.cy, s: O.view.s, z: size() }; return [(E - v.cx) * v.s + v.z[0] / 2, v.z[1] / 2 - (N - v.cy) * v.s]; }
  function S2W(sx, sy) { var z = size(); return [(sx - z[0] / 2) / O.view.s + O.view.cx, (z[1] / 2 - sy) / O.view.s + O.view.cy]; }

  function live() { return (O.slots ? O.slots() : []).filter(function (s) { return s.pack && s.built; }); }
  function fit() {
    var L = live(); if (!L.length) return;
    var b = [1e300, 1e300, -1e300, -1e300];
    L.forEach(function (s) { s.pack.ring.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); });
    var z = size();
    O.view.cx = (b[0] + b[2]) / 2; O.view.cy = (b[1] + b[3]) / 2;
    O.view.s = Math.min(z[0] / ((b[2] - b[0]) * 1.08), z[1] / ((b[3] - b[1]) * 1.12));
    O.fitted = L.map(function (s) { return s.pack.id; }).join(",");
    O.sig = "";
  }

  function threadsOf(s) {
    var w = s.win(), wo = w && w.__wool; if (!wo || !wo.topo || !wo.positions) return null;
    return { tp: wo.topo, pos: wo.positions, groups: wo.model.groups, iter: wo.iter };
  }
  function drawThreads(g, s, T) {
    var tp = T.tp, pos = T.pos, E0 = s.built.frame.E0, N0 = s.built.frame.N0;
    if (!pos || pos.length < 2 * tp.N) return;
    var byG = {};
    for (var t = 0; t < tp.T; t++) { var gi = tp.threads[3 * t + 2]; (byG[gi] = byG[gi] || []).push(t); }
    g.lineWidth = 0.6; g.globalAlpha = 0.5; g.lineJoin = "round";
    Object.keys(byG).forEach(function (gi) {
      var grp = T.groups[gi]; g.strokeStyle = (grp && grp.color) || "#8a837a";
      g.beginPath();
      byG[gi].forEach(function (t) {
        var ia = tp.threads[3 * t], ib = tp.threads[3 * t + 1], base = tp.NA + t * (tp.S - 1);
        var q = W(pos[2 * ia] + E0, pos[2 * ia + 1] + N0); g.moveTo(q[0], q[1]);
        for (var k = 0; k < tp.S - 1; k++) { q = W(pos[2 * (base + k)] + E0, pos[2 * (base + k) + 1] + N0); g.lineTo(q[0], q[1]); }
        q = W(pos[2 * ib] + E0, pos[2 * ib + 1] + N0); g.lineTo(q[0], q[1]);
      });
      g.stroke();
    });
    g.globalAlpha = 1;
  }
  function ringPath(g, ring) { g.beginPath(); ring.forEach(function (q, i) { var p = W(q[0], q[1]); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); }

  function draw(force) {
    if (!O.canvas || O.canvas.offsetParent === null) return;
    var L = live(), SH = O.show ? O.show() : { threads: true, parcels: true, roads: true };
    var key = L.map(function (s) { return s.pack.id; }).join(",");
    if (key && key !== O.fitted) fit();
    var z = size();
    var sig = [O.view.cx, O.view.cy, O.view.s, z[0], z[1], CellLayers.OPT.version, CellLayers.OPT.opacity, CellLayers.OPT.roadScale, CellLayers.OPT.railOn, CellLayers.OPT.stationOn, CellLayers.OPT.greenOn,
               CellLayers.LAYERS.map(function (l) { return l.on ? 1 : 0; }).join(""), SH.threads, SH.parcels, SH.roads,
               CellMeasure.host === O.host ? JSON.stringify(CellMeasure.points) + (CellMeasure.on ? JSON.stringify(O.hover || 0) : "") : "",
               L.map(function (s) { var T = threadsOf(s), R = s.roads && s.roads.current(); s.layers.sync();
                 return s.pack.id + ":" + (T ? T.iter : "-") + ":" + s.layers.parcels.length + ":" + (R ? R.iter + "/" + R.roads.length : "-") + ":" + s.label(); }).join(";")].join("|");
    if (!force && sig === O.sig) return;
    O.sig = sig;
    render(O.canvas, z, root.devicePixelRatio || 1);
  }

  /* One drawing of every cell onto canvas c, z = [width, height] in screen px, k = pixels per screen px.
     The same order as on his drawing: his threads and parcels first, the ground multiplied over them, then
     the corridor parcels, the corridor edges, his roads, the railway and the stations on top. */
  function render(c, z, k, only, view) {
    var L = only || live(), SH = O.show ? O.show() : { threads: true, parcels: true, roads: true };
    RV = { cx: (view || O.view).cx, cy: (view || O.view).cy, s: (view || O.view).s, z: z };
    try { renderIn(c, z, k, L, SH, !!only); } finally { RV = null; }
  }
  // his anchors, in his role colours (edge anchors filled, interior anchors ringed, shared ones circled)
  var ROLE_COLOR = { outline: "#9a4f23", shared: "#7f9468", inner: "#5f6b7a" };
  function drawAnchors(g, s) {
    var w = s.win(), wo = w && w.__wool; if (!wo || !wo.model) return;
    var m = wo.model, E0 = s.built.frame.E0, N0 = s.built.frame.N0, roleOf = WoolRoads.roleFn(m), many = {};
    m.groups.forEach(function (gr) { gr.A.concat(gr.B).forEach(function (id) { many[id] = (many[id] || 0) + 1; }); });
    m.groups.forEach(function (gr) {
      gr.A.forEach(function (id) { var a = m.anchors[id]; if (!a) return; var q = W(a.x + E0, a.y + N0); g.beginPath(); g.arc(q[0], q[1], 3.6, 0, 6.2832); g.fillStyle = ROLE_COLOR[roleOf(id)]; g.fill(); });
      gr.B.forEach(function (id) { var a = m.anchors[id]; if (!a) return; var q = W(a.x + E0, a.y + N0); g.beginPath(); g.arc(q[0], q[1], 3.4, 0, 6.2832); g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 1.6; g.strokeStyle = ROLE_COLOR[roleOf(id)]; g.stroke(); });
    });
    Object.keys(many).forEach(function (id) {
      if (many[id] < 2 || !m.anchors[id]) return;
      var a = m.anchors[id], q = W(a.x + E0, a.y + N0);
      g.beginPath(); g.arc(q[0], q[1], 6.2, 0, 6.2832); g.strokeStyle = "#7f9468"; g.lineWidth = 1; g.stroke();
    });
  }
  function renderIn(c, z, k, L, SH, one) {
    var w = Math.round(z[0] * k), h = Math.round(z[1] * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    if (!O.ground) O.ground = document.createElement("canvas");
    if (O.ground.width !== w || O.ground.height !== h) { O.ground.width = w; O.ground.height = h; }
    var g = c.getContext("2d"), gg = O.ground.getContext("2d");
    g.setTransform(k, 0, 0, k, 0, 0); gg.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, z[0], z[1]);
    gg.clearRect(0, 0, z[0], z[1]);

    var greensOf = {};
    L.forEach(function (s) {
      var parcels = s.layers.parcels, T = threadsOf(s), greens = [];
      if (SH.threads && T) drawThreads(g, s, T);
      if (SH.parcels && parcels.length) {
        g.lineWidth = 0.6;
        parcels.forEach(function (p) {
          if (p.green) { greens.push(p.pts); return; }
          ringPath(g, p.pts); g.fillStyle = "#efe2d0"; g.fill(); g.strokeStyle = "#c07a45"; g.stroke();
        });
      }
      greensOf[s.n] = greens;
    });
    // the ground: round the cells too (In context: the shared context if the quadrant sent one, else each cell's
    // own box), or only inside them (Isolated)
    var OPTc = CellLayers.OPT;
    if (OPTc.context) {
      var sh = OPTc.shared, inSh = function (s) { return sh && CellLayers.covers(sh.box, s.pack.bbox); };
      if (sh && L.some(inSh)) CellLayers.drawLayers(gg, W, sh, true);
      L.forEach(function (s) { if (!inSh(s)) CellLayers.drawLayers(gg, W, s.pack, true); });
      L.forEach(function (s) { CellLayers.drawGround(gg, W, s.pack, s.built.corridor, true, true); });
    } else L.forEach(function (s) { CellLayers.drawGround(gg, W, s.pack, s.built.corridor, true); });
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = CellLayers.OPT.opacity; g.globalCompositeOperation = "multiply"; g.drawImage(O.ground, 0, 0); g.restore();
    // how much detail the zoom allows: full at 60 px per km or more, down to a third when far out
    var pxKm = (RV ? RV.s : O.view.s) * 1000, zf = one ? 1 : Math.max(0.35, Math.min(1, pxKm / 60));
    L.forEach(function (s) {
      var R = s.roads && s.roads.current();
      CellLayers.drawOver(g, W, s.pack, s.built.corridor, SH.parcels ? greensOf[s.n] : null, SH.roads && R ? R.roads : null, s.built.frame, one ? 1 : 0.45 * zf, zf);
      ringPath(g, s.pack.ring); g.strokeStyle = "#2b2925"; g.lineWidth = 1.4; g.stroke();
      if (one && SH.anchors) drawAnchors(g, s);
    });
    // names last, over everything -- moved off the station when it sits near the middle of the cell
    if (one) {
      g.textAlign = "left"; g.textBaseline = "top"; g.font = "700 15px 'DM Sans','Segoe UI',sans-serif"; g.fillStyle = "#2b2925";
      g.fillText("Cell " + L[0].pack.id, 18, 16);
      g.font = "500 12px 'DM Sans','Segoe UI',sans-serif"; g.fillStyle = "#6f6a62"; g.fillText(L[0].label() + " \u00b7 " + L[0].pack.year, 18, 36);
    }
    if (!one) L.forEach(function (s) {
      var ctr = CellLayers.centroid(s.pack.ring), q = W(ctr[0], ctr[1]);
      var b = s.pack.bbox || {}, reach = 0.18 * Math.max((b.E1 - b.E0) || 0, (b.N1 - b.N0) || 0);
      if ((s.pack.stations || []).some(function (st) { return Math.hypot(st.E - ctr[0], st.N - ctr[1]) < reach; })) q = [q[0], q[1] + 34 * zf];
      g.textAlign = "center"; g.textBaseline = "middle";
      var full = zf > 0.7;                                   // far out: the name only, smaller
      g.font = "700 " + (full ? 14 : 10).toFixed(0) + "px 'DM Sans','Segoe UI',sans-serif";
      g.lineWidth = full ? 4 : 3; g.strokeStyle = "rgba(255,255,255,.95)"; g.strokeText(full ? "Cell " + s.pack.id : s.pack.id, q[0], full ? q[1] - 8 : q[1]);
      g.fillStyle = "#2b2925"; g.fillText(full ? "Cell " + s.pack.id : s.pack.id, q[0], full ? q[1] - 8 : q[1]);
      if (full) {
        g.font = "500 11.5px 'DM Sans','Segoe UI',sans-serif";
        g.strokeText(s.label(), q[0], q[1] + 9); g.fillStyle = "#6f6a62"; g.fillText(s.label(), q[0], q[1] + 9);
      }
    });
    // a scale bar, in km
    var vs = RV ? RV.s : O.view.s;                       // the scale of the picture being drawn, not of the screen
    var target = 120 / vs, pow = Math.pow(10, Math.floor(Math.log10(target))), step = [1, 2, 5, 10].map(function (m) { return m * pow; }).filter(function (v) { return v <= target; }).pop() || pow;
    var px = step * vs, x0 = 18, y0 = z[1] - 20;
    g.fillStyle = "#2b2925"; g.fillRect(x0, y0, px, 3);
    g.font = "600 11px 'DM Sans','Segoe UI',sans-serif"; g.textAlign = "left"; g.textBaseline = "bottom";
    g.fillText(step >= 1000 ? (step / 1000) + " km" : step + " m", x0, y0 - 3);
    if (CellMeasure.host === O.host) CellMeasure.drawOn(g, W);
  }

  function pick(E, N) {
    var L = live();
    for (var i = 0; i < L.length; i++) if (CellLayers.inPoly(L[i].pack.ring, E, N)) return L[i];
    return null;
  }

  function init(canvas, slots, show, onPick) {
    O.canvas = canvas; O.slots = slots; O.show = show; O.onPick = onPick;
    O.host = { name: "overview", cursor: function () { canvas.style.cursor = CellMeasure.on && CellMeasure.host === O.host ? "crosshair" : "grab"; } };
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, a = S2W(sx, sy);
      O.view.s *= Math.exp(-e.deltaY * 0.0015);
      var b = S2W(sx, sy); O.view.cx += a[0] - b[0]; O.view.cy += a[1] - b[1];
    }, { passive: false });
    canvas.addEventListener("pointerdown", function (e) {
      var r = canvas.getBoundingClientRect();
      O.drag = { sx: e.clientX - r.left, sy: e.clientY - r.top, cx: O.view.cx, cy: O.view.cy, moved: false, button: e.button, shift: e.shiftKey };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (CellMeasure.on && CellMeasure.host === O.host) { O.hover = S2W(sx, sy); CellMeasure.hover(O.hover, e.shiftKey); }
      var d = O.drag; if (!d) return;
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) > 5) d.moved = true;
      if (d.moved) { O.view.cx = d.cx - (sx - d.sx) / O.view.s; O.view.cy = d.cy + (sy - d.sy) / O.view.s; }
    });
    canvas.addEventListener("pointerup", function (e) {
      var d = O.drag; O.drag = null; if (!d || d.moved || d.button !== 0) return;
      var r = canvas.getBoundingClientRect(), w = S2W(e.clientX - r.left, e.clientY - r.top);
      if (CellMeasure.on && CellMeasure.host === O.host) { CellMeasure.add(w, e.shiftKey); return; }
      var s = pick(w[0], w[1]); if (s && O.onPick) O.onPick(s);
    });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    return O.host;
  }

  /* A browser refuses a canvas over about 16,000 px a side or 250 million pixels, and refuses long before
     that when the page is already holding the cells' own drawings. Two pictures are made at once here (the
     sheet and the ground under it), so the print size is held to 90 million pixels between them; past that it
     is drawn a little smaller rather than not at all. */
  var MAX_SIDE = 15000, MAX_PX = 45e6;
  function capped(z, k) {
    k = Math.min(k, MAX_SIDE / z[0], MAX_SIDE / z[1]);
    var px = z[0] * k * z[1] * k;
    if (px > MAX_PX) k *= Math.sqrt(MAX_PX / px);
    return Math.max(1, k);
  }
  // the scratch sheet the export drew on: let go of it, or it sits at print size until the next drawing
  function freeScratch() { if (O.ground) { O.ground.width = 1; O.ground.height = 1; } O.sig = ""; }

  // the sheet as on screen, drawn again at print size (at least 3,000 px across)
  function png() {
    var z = size(), k = capped(z, Math.max(2, 3000 / z[0])), c = document.createElement("canvas");
    render(c, z, k);
    O.sig = "";
    return c;
  }
  // one cell, framed on its own, at print size: the same drawing as the sheet, with his anchors
  function cellPng(s, px) {
    var b = s.pack.bbox, wE = b.E1 - b.E0, hN = b.N1 - b.N0;
    var z = [1500, Math.round(1500 * hN / wE) + 90];
    var sc = Math.min(1400 / wE, (z[1] - 130) / hN);
    var view = { cx: (b.E0 + b.E1) / 2, cy: (b.N0 + b.N1) / 2 - 15 / sc, s: sc };
    var c = document.createElement("canvas");
    render(c, z, capped(z, (px || 3000) / z[0]), [s], view);
    O.sig = "";
    return c;
  }

  root.CellOverview = { init: init, draw: draw, fit: fit, png: png, cellPng: cellPng, freeScratch: freeScratch, get host() { return O.host; } };
})(window);
