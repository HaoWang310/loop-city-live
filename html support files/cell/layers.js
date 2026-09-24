/* ============================================================================================
   Loop City v10 -- the ground under the wool thread, and the railway over it.

   His app draws the cell, the anchors and the threads on its own canvas and knows nothing of the map.
   These are two more canvases laid exactly over his, inside his stage, drawn with HIS view transform
   (window.__wool.w2s, which his app exposes), so they pan and zoom with him. Neither takes a mouse event,
   and neither changes a line of his code.

     the ground   the base map the cell was cut from: the road network (motorway and trunk bold, A and B as
                  they are, local roads grey -- the road view we settled on), water, woodland, urban,
                  Green Belt and National Landscape, the growth fabric of the year, the mould's roads and
                  the neighbouring cells. Drawn in MULTIPLY over his white canvas, so it reads as the ground
                  under his threads rather than a sheet on top of them.
     the rail     the green corridor parcels, the railway, thick and dark grey, and the station.

   v10: one set of these per cell (CellLayers.create), since each cell now has its own copy of his app.
   Which layers are on, and how strong the ground is, is shared by all of them (CellLayers.OPT), so every
   cell and the all-cells overview read the same way.

   Everything comes from the cell the quadrant handed down: its layers are already cut to the cell's box,
   in British National Grid, and his frame is x = E - E0, y = N - N0.
   ============================================================================================ */
(function (root) {
  "use strict";

  var LAYERS = [
    { id: "corridor", nm: "The green corridor", on: true },
    { id: "fabric", nm: "Growth fabric", on: false },
    { id: "urban", nm: "Existing urban", on: false, raster: true },
    { id: "woodland", nm: "Woodland", on: false, raster: true },
    { id: "greenspace", nm: "Parks, playing fields", on: false, raster: true },
    { id: "water", nm: "Water", on: true, raster: true },
    { id: "aonb", nm: "National Landscape", on: false, raster: true },
    { id: "greenbelt_edge", nm: "Green Belt boundary", on: false, raster: true },
    { id: "roads_local", nm: "Local roads", on: false, raster: true, tint: "#a9a49d", road: true },
    { id: "roads_regional", nm: "A and B roads", on: true, raster: true, road: true },
    { id: "roads_national", nm: "Motorway and trunk", on: true, raster: true, bold: true, road: true },
    { id: "mould", nm: "The mould's roads", on: false },
    { id: "neighbours", nm: "Neighbouring cells", on: false }
  ];
  // shared by every cell: what is drawn over the wool, and how strong the ground is
  // context: draw the ground round the cells too (In context), or only inside them (Isolated)
  var OPT = { railOn: true, stationOn: true, greenOn: true, opacity: 0.75, roadScale: 1, context: true, shared: null, version: 0 };

  function byId(id) { for (var i = 0; i < LAYERS.length; i++) if (LAYERS[i].id === id) return LAYERS[i]; return null; }
  function layerSig() { return LAYERS.map(function (L) { return L.on ? 1 : 0; }).join(""); }

  function inPoly(P, x, y) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
    }
    return c;
  }
  function centroid(pts) { var cx = 0, cy = 0; pts.forEach(function (q) { cx += q[0]; cy += q[1]; }); return [cx / pts.length, cy / pts.length]; }
  function bandOf(corridor) { return corridor ? corridor.left.concat(corridor.right.slice().reverse()) : null; }

  function fabricCanvas(f) {
    var bin = atob(f.cls), c = document.createElement("canvas");
    c.width = f.w; c.height = f.h;
    var x = c.getContext("2d"), im = x.createImageData(f.w, f.h), d = im.data, pal = {};
    Object.keys(f.palette || {}).forEach(function (k) {
      var h = f.palette[k]; pal[k] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    });
    for (var i = 0; i < f.w * f.h; i++) {
      var q = pal[bin.charCodeAt(i)]; if (!q) continue;
      d[4 * i] = q[0]; d[4 * i + 1] = q[1]; d[4 * i + 2] = q[2]; d[4 * i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }

  /* The ground of one cell, loaded once per cell and shared by its frame and the overview. */
  var GROUND = typeof WeakMap === "function" ? new WeakMap() : null;
  function groundOf(pack) {
    var G = GROUND && GROUND.get(pack);
    if (G) return G;
    G = { imgs: {}, tint: {}, fab: null, version: 0 };
    Object.keys(pack.layers || {}).forEach(function (id) {
      var im = new Image();
      im.onload = function () { G.imgs[id] = im; G.version++; OPT.version++; };
      im.src = pack.layers[id].src;
    });
    if (pack.fabric) { try { G.fab = fabricCanvas(pack.fabric); } catch (e) { G.fab = null; } }
    if (GROUND) GROUND.set(pack, G);
    return G;
  }
  function tinted(G, id, hex) {
    var k = id + hex; if (G.tint[k]) return G.tint[k];
    var im = G.imgs[id], c = document.createElement("canvas");
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    var x = c.getContext("2d"); x.drawImage(im, 0, 0);
    x.globalCompositeOperation = "source-in"; x.fillStyle = hex; x.fillRect(0, 0, c.width, c.height);
    return (G.tint[k] = c);
  }

  /* ------------------------------------------------------------------ drawing, in any view
     W(E, N) -> screen. Used for his frame (through his w2s) and for the all-cells overview (its own). */
  function line(g, W, pts) { g.beginPath(); pts.forEach(function (p, i) { var q = W(p[0], p[1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); }

  /* The map layers of one source -- a cell, or the shared context round a selection (both have layers, fabric,
     roads, neighbours) -- drawn as they are, unclipped. */
  function drawLayers(g, W, src, withNeighbours) {
    var G = groundOf(src);
    g.imageSmoothingEnabled = true;
    LAYERS.forEach(function (L) {
      if (!L.on) return;
      if (L.id === "fabric" && G.fab) {
        var f = src.fabric, tl = W(f.E0, f.N1), br = W(f.E0 + f.w * f.cellM, f.N1 - f.h * f.cellM);
        g.imageSmoothingEnabled = false; g.globalAlpha = 0.85;
        g.drawImage(G.fab, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
        g.imageSmoothingEnabled = true; g.globalAlpha = 1;
      } else if (L.raster && G.imgs[L.id]) {
        var m = src.layers[L.id], t = W(m.E0, m.N1), u = W(m.E1, m.N0), im = L.tint ? tinted(G, L.id, L.tint) : G.imgs[L.id];
        g.drawImage(im, t[0], t[1], u[0] - t[0], u[1] - t[1]);
        if (L.bold) { g.drawImage(im, t[0] + 0.8, t[1], u[0] - t[0], u[1] - t[1]); g.drawImage(im, t[0], t[1] + 0.8, u[0] - t[0], u[1] - t[1]); }
      } else if (L.id === "mould") {
        g.strokeStyle = "#3b2d1e"; g.lineWidth = 2.4; g.lineJoin = "round"; g.lineCap = "round";
        (src.roads || []).forEach(function (r) { line(g, W, r); g.stroke(); });
      } else if (L.id === "neighbours" && withNeighbours) {
        g.strokeStyle = "#a89880"; g.lineWidth = 1.2; g.setLineDash([]);
        (src.neighbours || []).forEach(function (n) { line(g, W, n.ring); g.closePath(); g.stroke(); });
      }
    });
  }
  /* One cell's ground. clipRing: only inside the cell (Isolated). skipLayers: the corridor band only -- the layers
     come from the shared context instead. The corridor band is always the cell's own piece, inside its outline. */
  function drawGround(g, W, pack, corridor, clipRing, skipLayers) {
    var bd = bandOf(corridor), cor = byId("corridor");
    g.save();
    if (clipRing) { line(g, W, pack.ring); g.closePath(); g.clip(); }
    if (bd && cor && cor.on) {
      g.save(); line(g, W, pack.ring); g.closePath(); g.clip();
      line(g, W, bd); g.closePath(); g.fillStyle = "#cbd9b8"; g.fill();
      g.restore();
    }
    if (!skipLayers) drawLayers(g, W, pack, !clipRing);
    g.restore();
  }

  // his level 1/2 roads (woolroads.js), in his frame's metres; drawn in his two colours and widths
  var ROAD_C = { 1: "#a55328", 2: "#6f8e61" }, ROAD_W = { 1: 4.8, 2: 3.8 };
  function drawRoads(g, W, roads, frame, scale) {
    if (!roads || !roads.length) return;
    var E0 = frame ? frame.E0 : 0, N0 = frame ? frame.N0 : 0;
    g.lineCap = "round"; g.lineJoin = "round"; g.setLineDash([]);
    [2, 1].forEach(function (lv) {
      g.beginPath(); var any = false;
      roads.forEach(function (r) {
        if (r.level !== lv || !r.pts || r.pts.length < 2) return;
        r.pts.forEach(function (p, i) { var q = W(p[0] + E0, p[1] + N0); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
        any = true;
      });
      if (any) { g.strokeStyle = ROAD_C[lv]; g.globalAlpha = lv === 2 ? 0.98 : 1; g.lineWidth = (scale || 1) * (OPT.roadScale || 1) * ROAD_W[lv]; g.stroke(); }
    });
    g.globalAlpha = 1;
  }

  // greens: arrays of [E, N] rings; roads: his road list in his frame (x = E - E0, y = N - N0)
  // size: 1 on his drawing; smaller on the all-cells sheet when it is zoomed far out, so the rail does not swamp the corridor
  function drawOver(g, W, pack, corridor, greens, roads, frame, roadScale, size) {
    var cor = byId("corridor"), z = size || 1;
    if (OPT.greenOn && greens && greens.length) {
      g.fillStyle = "#b9cf9f"; g.strokeStyle = "#6f9a58"; g.lineWidth = 1.1;
      greens.forEach(function (pts) { line(g, W, pts); g.closePath(); g.fill(); g.stroke(); });
    }
    if (corridor && cor && cor.on) {
      g.save(); line(g, W, pack.ring); g.closePath(); g.clip();
      g.strokeStyle = "#6f9a58"; g.lineWidth = 1.6; g.setLineDash([]);
      line(g, W, corridor.left); g.stroke(); line(g, W, corridor.right); g.stroke();
      g.restore();
    }
    drawRoads(g, W, roads, frame, roadScale);
    if (OPT.railOn) {
      g.lineJoin = "round"; g.lineCap = "round";
      g.strokeStyle = "rgba(74,71,68,.55)"; g.lineWidth = 2 * z; g.setLineDash([8 * z, 6 * z]);
      (pack.railNear || []).forEach(function (r) { line(g, W, r); g.stroke(); });
      g.setLineDash([]); g.strokeStyle = "#4a4744"; g.lineWidth = 4.5 * z;
      (pack.spine || []).forEach(function (r) { line(g, W, r); g.stroke(); });
    }
    if (OPT.stationOn) {
      (pack.stations || []).forEach(function (s) {
        var q = W(s.E, s.N);
        g.beginPath(); g.arc(q[0], q[1], 8 * z, 0, 6.2832); g.fillStyle = "#e8c46a"; g.fill();
        g.lineWidth = 1.6 * z; g.strokeStyle = "#2b2925"; g.stroke();
        g.font = "600 " + Math.max(9, 13 * z).toFixed(1) + "px 'DM Sans','Segoe UI',sans-serif"; g.lineWidth = 3.5 * z; g.strokeStyle = "rgba(255,255,255,.95)";
        g.strokeText(s.id, q[0] + 12 * z, q[1] - 9 * z); g.fillStyle = "#2b2925"; g.fillText(s.id, q[0] + 12 * z, q[1] - 9 * z);
      });
    }
  }

  /* ------------------------------------------------------------------ one cell's layers over his frame */
  function create() {
    var S = { win: null, doc: null, pack: null, frame: null, corridor: null, ground: null, rail: null,
              sig: "", greenSig: "", greens: [], parcels: [], parcelCount: 0, roadsFn: null };

    function makeCanvas(doc, after, blend) {
      var c = doc.createElement("canvas");
      c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;" +
        (blend ? "mix-blend-mode:" + blend + ";" : "");
      after.parentNode.insertBefore(c, after.nextSibling);
      return c;
    }
    function attach(win, doc, pack, frame, corridor) {
      S.win = win; S.doc = doc; S.pack = pack; S.frame = frame; S.corridor = corridor || null;
      var view = doc.getElementById("view");
      if (!view) return false;
      if (!S.ground || S.ground.ownerDocument !== doc) {
        S.ground = makeCanvas(doc, view, "multiply");
        S.rail = makeCanvas(doc, S.ground, null);
      }
      groundOf(pack);
      S.sig = ""; S.greenSig = "";
      return true;
    }
    // our BNG -> his world -> his screen
    function W(E, N) { return S.win.__wool.w2s(E - S.frame.E0, N - S.frame.N0); }
    function sizeTo(c) {
      var v = S.doc.getElementById("view"), r = v.getBoundingClientRect(), dpr = S.win.devicePixelRatio || 1;
      var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      var g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
      return g;
    }

    /* His extracted parcels, read once per extraction, in BNG, each marked green if its centre lies in the
       corridor band -- drawn green over his beige, as on the parcels-formation page. */
    function readParcels() {
      var out = [], greens = [], sp = S.doc.getElementById("cShowParcels");
      S.parcelCount = 0;
      if (!S.win.WoolWorkflowBridge) return { all: out, greens: greens };
      var E0 = S.frame.E0, N0 = S.frame.N0, band = bandOf(S.corridor);
      var all = []; try { all = S.win.WoolWorkflowBridge.getAllParcels() || []; } catch (e) { all = []; }
      all.forEach(function (p) {
        var pts = p.points.map(function (q) { return [q.x + E0, q.y + N0]; }), c = centroid(pts);
        var green = !!(band && inPoly(band, c[0], c[1]));
        out.push({ pts: pts, green: green, area: p.area });
        if (green && !(sp && !sp.checked)) greens.push(pts);
      });
      S.parcelCount = all.length;
      return { all: out, greens: greens };
    }

    // his parcels, re-read whenever his parcel status line changes (a new extraction, or cleared)
    function sync() {
      if (!S.win || !S.doc || !S.frame) return "";
      var st = S.doc.getElementById("parcelStatus"), sp = S.doc.getElementById("cShowParcels");
      var psig = (st ? st.textContent : "") + "|" + (sp && sp.checked ? 1 : 0);
      if (psig !== S.greenSig) { S.greenSig = psig; var P = readParcels(); S.parcels = P.all; S.greens = P.greens; }
      return psig;
    }
    function roadsNow() { var R = S.roadsFn ? S.roadsFn() : null; return R && R.roads ? R : null; }

    function redraw(force) {
      if (!S.win || !S.win.__wool || !S.pack || !S.ground) return;
      var a = W(S.frame.E0, S.frame.N0), b = W(S.frame.E0 + 1000, S.frame.N0 + 1000);
      var v = S.doc.getElementById("view"), r = v.getBoundingClientRect();
      var psig = sync(), R = roadsNow();
      var sig = [a[0], a[1], b[0], b[1], r.width, r.height, OPT.version, OPT.opacity, OPT.railOn, OPT.stationOn, OPT.greenOn, psig, layerSig(),
                 R ? R.iter + ":" + R.roads.length + ":" + (R.stats && R.stats.ms) : "-"].join("|");
      if (!force && sig === S.sig) return;
      S.sig = sig;
      var gg = sizeTo(S.ground);
      if (OPT.context && OPT.shared && covers(OPT.shared.box, S.pack.bbox)) { drawLayers(gg, W, OPT.shared, true); drawGround(gg, W, S.pack, S.corridor, false, true); }
      else drawGround(gg, W, S.pack, S.corridor, !OPT.context);
      drawOver(sizeTo(S.rail), W, S.pack, S.corridor, S.greens, R ? R.roads : null, S.frame, 1);
      S.ground.style.opacity = OPT.opacity;
    }

    // one picture of his drawing, the ground and the rail, as on screen
    function composite(extra) {
      var v = S.doc && S.doc.getElementById("view");
      if (!v) return null;
      redraw(true);
      var c = document.createElement("canvas"); c.width = v.width; c.height = v.height;
      var g = c.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(v, 0, 0);
      if (S.ground) { g.globalAlpha = OPT.opacity; g.globalCompositeOperation = "multiply"; g.drawImage(S.ground, 0, 0); }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
      if (S.rail) g.drawImage(S.rail, 0, 0);
      if (extra && extra.width) g.drawImage(extra, 0, 0, c.width, c.height);
      return c;
    }

    return {
      attach: attach, redraw: redraw, composite: composite, sync: sync,
      setRoads: function (fn) { S.roadsFn = fn; S.sig = ""; },
      get roads() { return roadsNow(); },
      get state() { return S; },
      get parcels() { return S.parcels; },
      get greenCount() { return S.greens.length; },
      get parcelCount() { return S.parcelCount; }
    };
  }

  // does the shared surroundings' box hold this cell's box? (a cell added later may lie outside it)
  function covers(box, bb) { return !!(box && bb && bb.E0 >= box.E0 && bb.N0 >= box.N0 && bb.E1 <= box.E1 && bb.N1 <= box.N1); }
  root.CellLayers = {
    covers: covers,
    LAYERS: LAYERS, OPT: OPT, byId: byId, create: create,
    drawGround: drawGround, drawLayers: drawLayers, drawOver: drawOver, drawRoads: drawRoads, groundOf: groundOf, bandOf: bandOf, inPoly: inPoly, centroid: centroid,
    set: function (k, v) { OPT[k] = v; OPT.version++; },
    toggle: function (id, on) { var L = byId(id); if (L) { L.on = !!on; OPT.version++; } }
  };
})(window);
