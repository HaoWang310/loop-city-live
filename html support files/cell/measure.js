/* ============================================================================================
   Loop City v10 -- measure: click two points, read the distance.

   Works on his wool thread drawing and on the all-cells overview. Distances are in metres throughout (his
   frame is metres at real size, the overview is British National Grid metres), shown in km from 1 km up.

   On his drawing the measure takes only the LEFT click, and only while it is switched on: the click is
   caught before it reaches his page, so his anchor tools and his parcel picking do not see it. The wheel
   (zoom) and a right-drag (pan) still go to him, so the view moves as usual while measuring.

     click, click        a distance; a third click starts a new one
     Shift + click       carries on from the last point: a path, with its total
     Esc                 clear
   ============================================================================================ */
(function (root) {
  "use strict";
  var M = { on: false, pts: [], hover: null, shift: false, host: null, onChange: null };

  function fmtLen(m) {
    if (!isFinite(m)) return "";
    if (m >= 1000) return (m / 1000).toLocaleString("en-GB", { minimumFractionDigits: m >= 10000 ? 1 : 2, maximumFractionDigits: m >= 10000 ? 1 : 2 }) + " km";
    return Math.round(m).toLocaleString("en-GB") + " m";
  }
  function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  function total(pts) { var t = 0; for (var i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]); return t; }

  function readout() {
    var p = M.pts, t;
    if (!M.on && !p.length) t = "";
    else if (p.length < 2) t = p.length ? "Click the second point…" : "Measure: click two points on the drawing. Shift + click to carry on along a path · wheel zooms · right-drag pans · Esc clears.";
    else if (p.length === 2) t = "<b>" + fmtLen(dist(p[0], p[1])) + "</b>" + (dist(p[0], p[1]) >= 1000 ? " (" + Math.round(dist(p[0], p[1])).toLocaleString("en-GB") + " m)" : "") +
      " · Shift + click to carry on, click to start again";
    else t = "<b>" + fmtLen(total(p)) + "</b> along " + (p.length - 1) + " legs (" + Math.round(total(p)).toLocaleString("en-GB") + " m) · straight across " + fmtLen(dist(p[0], p[p.length - 1]));
    if (M.onChange) M.onChange(t);
  }

  function add(w, shift) {
    if (M.pts.length >= 2 && !shift) M.pts = [];
    M.pts.push(w);
    readout();
  }
  function clear() { M.pts = []; M.hover = null; readout(); }

  // the measure, drawn with any world -> screen function
  function drawOn(g, w2s) {
    var p = M.pts.slice();
    if (!p.length) return;
    var live = M.on && M.hover && (p.length === 1 || M.shift);
    if (live) p.push(M.hover);
    var s = p.map(function (q) { return w2s(q[0], q[1]); });
    g.save();
    g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); s.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
    g.strokeStyle = "rgba(255,255,255,.95)"; g.lineWidth = 5; g.stroke();
    g.strokeStyle = "#1f5f8b"; g.lineWidth = 2; g.setLineDash(live ? [7, 5] : []); g.stroke(); g.setLineDash([]);
    s.forEach(function (q) { g.beginPath(); g.arc(q[0], q[1], 4.5, 0, 6.2832); g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#1f5f8b"; g.stroke(); });
    g.font = "600 12.5px 'DM Sans','Segoe UI',sans-serif"; g.textAlign = "center"; g.textBaseline = "bottom";
    for (var i = 1; i < s.length; i++) {
      var d = dist(p[i - 1], p[i]); if (d <= 0) continue;
      var mx = (s[i - 1][0] + s[i][0]) / 2, my = (s[i - 1][1] + s[i][1]) / 2 - 7;
      g.lineWidth = 4; g.strokeStyle = "rgba(255,255,255,.95)"; g.strokeText(fmtLen(d), mx, my);
      g.fillStyle = "#1f5f8b"; g.fillText(fmtLen(d), mx, my);
    }
    if (p.length > 2) {
      var e = s[s.length - 1], tt = "total " + fmtLen(total(p));
      g.textAlign = "left"; g.textBaseline = "middle";
      g.lineWidth = 4; g.strokeStyle = "rgba(255,255,255,.95)"; g.strokeText(tt, e[0] + 10, e[1] + 14);
      g.fillStyle = "#1f5f8b"; g.fillText(tt, e[0] + 10, e[1] + 14);
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ on his drawing */
  // his w2s is affine (a scale and an offset, y up); its inverse comes from two of its points
  function inverse(w2s) {
    var o = w2s(0, 0), u = w2s(1, 0), s = u[0] - o[0];
    return function (sx, sy) { return [(sx - o[0]) / s, (o[1] - sy) / s]; };
  }
  function frameHost(win, doc) {
    if (doc.__lcMeasure) return doc.__lcMeasure;
    var view = doc.getElementById("view");
    var c = doc.createElement("canvas");
    c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;";
    view.parentNode.appendChild(c);
    var H = { win: win, doc: doc, canvas: c, view: view, down: null,
              w2s: function (x, y) { return win.__wool.w2s(x, y); },
              s2w: function (sx, sy) { return inverse(win.__wool.w2s)(sx, sy); } };
    function local(e) { var r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function mine(e) { return M.on && M.host === H && e.target === view; }
    doc.addEventListener("pointerdown", function (e) {
      if (!mine(e)) return;
      if (e.button !== 0 || e.altKey) return;                  // right-drag and Alt-drag still pan in his page
      e.stopImmediatePropagation(); e.preventDefault();
      H.down = local(e);
    }, true);
    doc.addEventListener("pointerup", function (e) {
      if (!H.down) return;
      var q = local(e), d = H.down; H.down = null;
      e.stopImmediatePropagation();
      if (Math.hypot(q[0] - d[0], q[1] - d[1]) < 6) add(H.s2w(q[0], q[1]), e.shiftKey);
    }, true);
    doc.addEventListener("click", function (e) { if (mine(e) && e.button === 0) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    doc.addEventListener("pointermove", function (e) {
      if (!M.on || M.host !== H) return;
      var q = local(e); M.hover = H.s2w(q[0], q[1]); M.shift = e.shiftKey;
    }, true);
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && M.host === H) clear(); }, true);
    H.draw = function () {
      var r = view.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
      var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      var g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
      if (M.host === H && win.__wool) drawOn(g, H.w2s);
    };
    // his page sets the canvas cursor itself as the mouse moves; a crosshair class outranks it while measuring
    var css = doc.createElement("style");
    css.textContent = "#view.lc-measure{cursor:crosshair !important}";
    (doc.head || doc.documentElement).appendChild(css);
    H.cursor = function () { view.classList.toggle("lc-measure", M.on && M.host === H); };
    doc.__lcMeasure = H;
    return H;
  }

  root.CellMeasure = {
    frameHost: frameHost, drawOn: drawOn, add: add, clear: clear, fmtLen: fmtLen,
    use: function (host) { if (M.host !== host) { M.host = host; M.pts = []; M.hover = null; } if (host && host.cursor) host.cursor(); readout(); },
    toggle: function (on) { M.on = on === undefined ? !M.on : !!on; if (M.host && M.host.cursor) M.host.cursor(); if (!M.on) M.hover = null; readout(); return M.on; },
    hover: function (w, shift) { M.hover = w; M.shift = !!shift; },
    set onChange(fn) { M.onChange = fn; },
    get on() { return M.on; }, get host() { return M.host; }, get points() { return M.pts; }
  };
  root.addEventListener("keydown", function (e) { if (e.key === "Escape") clear(); });
})(window);
