/* ==================================================================================================
   LOOP CITY · combined app v1 · js/cells.js

   Parcels, and every file the parcels leave the app in.

   This is the mould app's own cell extraction, lifted out of
     Slime Mold/app/template_quadrant_v5.html   (extractCells, line ~1401)
   and parameterised so it can be called twice a year on two different road networks at two
   different resolutions: the settlement network on the fine 950 x 865 grid, and the landscape
   network on the coarse 475 x 433 grid.

   The arithmetic is not new. The flood fill, the 12-cell pad, fillHoles, blurField, traceRings,
   the kept filter, edtTo, the label-pole scan, simplifyRing and the 8 km band sort all run exactly
   as they ran in v5. What changed is only the ten edits listed in section 5 of the spec, and each
   one is marked EDIT n below so it can be checked against the spec line by line.

   Written to ES5 on purpose: var and function, typed arrays, no arrow functions, no modules, no
   dependencies. It hangs one object, window.Cells, and reads nothing off the page. The two
   exceptions are attachGrowth (which needs a canvas to rasterise a polygon) and download (which
   needs an anchor to hand the browser a file); both are guarded so the module still loads, and
   selfCheck still runs, where there is no document.
   ================================================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ registration

     The corner is the spine of the whole app. Every grid in both halves of this project is a
     division of the SAME rectangle in EPSG:27700, and nothing here is ever allowed to work back to
     a cell size from a pixel size again -- that is how the two apps drifted 92 m apart at the south
     edge in the first place.

     Sheet         2513 x 2288 px   -> 35.012177 m east, 35.013811 m north.  Not a round 35.
     Mould fine     950 x  865      -> cellE 92.616421..., cellN 92.614566...  Never 92.584.
     Mould coarse   475 x  433      -> exactly twice fine, NOT extent/433.
     Growth window 1256 x 1144      -> exactly 70.0 m, cornered on the same E0 / N1.
  */

  var SHEET = {
    e0: 452754.1, n0: 166381.6, e1: 540739.7, n1: 246493.2,
    mapW: 2513, mapH: 2288
  };

  var GROWTH = {
    W: 1256, H: 1144, cell: 70.0,
    E0: 452754.1, N1: 246493.2
  };

  /* The growth model's own class codes and densities, copied from Growth Simulator/app/js/sim.js so
     this file does not have to be loaded after it. If the host passes opts.K / opts.PPK we use
     those instead, because the sim is authoritative and a silent divergence here would be a lie
     told in km2. */
  var K_DEFAULT = { EMPTY: 0, LOW: 1, MED: 2, HIGH: 3, FIELD: 4, VFARM: 5, COM: 6, INST: 7 };
  var PPK_DEFAULT = [0, 4000, 9750, 25000];        // people a km2 by tier: low, mid, high

  /* ------------------------------------------------------------------ small helpers */

  function num(v, dflt) { return (typeof v === "number" && isFinite(v)) ? v : dflt; }

  function now() {
    if (typeof performance !== "undefined" && performance && performance.now) return performance.now();
    return Date.now();
  }

  function listOf(c) {
    // callers hand us either the extraction record or the bare list; take both
    if (!c) return [];
    if (c.list) return c.list;
    if (c.length !== undefined) return c;
    return [];
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function f3(v) { return (isFinite(v) ? v : 0).toFixed(3); }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function hasDoc() { return typeof document !== "undefined" && document && document.createElement; }

  /* ==================================================================================================
     THE EIGHT PURE GEOMETRY HELPERS

     These come across from v5 unchanged in behaviour. The only differences are ES5 spellings:
     .fill(-1) and Float64Array.from and Math.hypot are ES6 and are written out as loops, so the
     file also opens in anything old. Read them as the originals; they are.
     ================================================================================================== */

  var MS_SIDES = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2],
                  [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [3, 1], [0, 1], [3, 0], []];

  function traceRings(F, w, h, level) {
    // Closed outlines where F rises above level, joined end to end. F must be at or below the level all
    // round its border, so that every outline closes. A point's coordinates are in grid units, each value
    // sitting at its own index.
    var nE = 2 * w * h, nb = new Int32Array(2 * nE), i, j, x, y;
    for (i = 0; i < nb.length; i++) nb[i] = -1;

    function link(a, b) {
      if (nb[2 * a] < 0) nb[2 * a] = b; else nb[2 * a + 1] = b;
      if (nb[2 * b] < 0) nb[2 * b] = a; else nb[2 * b + 1] = a;
    }

    for (y = 0; y < h - 1; y++) {
      for (x = 0; x < w - 1; x++) {
        i = y * w + x;
        var c = (F[i] > level ? 1 : 0) | (F[i + 1] > level ? 2 : 0) |
                (F[i + w + 1] > level ? 4 : 0) | (F[i + w] > level ? 8 : 0);
        if (c === 0 || c === 15) continue;
        var sd = MS_SIDES[c];
        var e = [2 * i, 2 * (i + 1) + 1, 2 * (i + w), 2 * i + 1];   // edges: top, right, bottom, left
        for (j = 0; j < sd.length; j += 2) link(e[sd[j]], e[sd[j + 1]]);
      }
    }

    function put(eid, out) {
      var ii = eid >> 1, xx = ii % w, yy = (ii - xx) / w, a, b;
      if (eid & 1) { a = F[ii]; b = F[ii + w]; out.push(xx, yy + (level - a) / (b - a)); }
      else { a = F[ii]; b = F[ii + 1]; out.push(xx + (level - a) / (b - a), yy); }
    }

    var seen = new Uint8Array(nE), rings = [], e0;
    for (e0 = 0; e0 < nE; e0++) {
      if (seen[e0] || nb[2 * e0] < 0) continue;
      var out = [], prev = -1, cur = e0;
      do {
        seen[cur] = 1; put(cur, out);
        var a2 = nb[2 * cur], b2 = nb[2 * cur + 1], nx = a2 !== prev ? a2 : b2;
        prev = cur; cur = nx;
      } while (cur >= 0 && cur !== e0 && !seen[cur]);
      if (out.length >= 6) {
        var ring = new Float64Array(out.length);
        for (i = 0; i < out.length; i++) ring[i] = out[i];
        rings.push(ring);
      }
    }
    return rings;
  }

  function blurField(src, w, h, sigma) {
    // separable Gaussian, zero beyond the border
    var r = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * r + 1);
    var sum = 0, i, x, y, j, b, acc;
    for (i = -r; i <= r; i++) { var v = Math.exp(-i * i / (2 * sigma * sigma)); k[i + r] = v; sum += v; }
    for (i = 0; i < k.length; i++) k[i] /= sum;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (y = 0; y < h; y++) {
      var row = y * w;
      for (x = 0; x < w; x++) {
        acc = 0;
        for (j = Math.max(-r, -x), b = Math.min(r, w - 1 - x); j <= b; j++) acc += k[j + r] * src[row + x + j];
        tmp[row + x] = acc;
      }
    }
    for (y = 0; y < h; y++) {
      var row2 = y * w, j0 = Math.max(-r, -y), j1 = Math.min(r, h - 1 - y);
      for (x = 0; x < w; x++) {
        acc = 0;
        for (j = j0; j <= j1; j++) acc += k[j + r] * tmp[row2 + j * w + x];
        out[row2 + x] = acc;
      }
    }
    return out;
  }

  function edtTo(w, h, isSource) {
    // Exact Euclidean distance, in cells, from every cell to the nearest source cell: Felzenszwalb and
    // Huttenlocher's transform, the same numbers as scipy's distance_transform_edt in belt_sim.py.
    var INF = 1e20, n = w * h, N = Math.max(w, h), i, x, y, q;
    var g = new Float64Array(n);
    for (i = 0; i < n; i++) g[i] = isSource(i) ? 0 : INF;
    var f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);

    function pass(len) {
      var k = 0, s, dq;
      v[0] = 0; z[0] = -INF; z[1] = INF;
      for (q = 1; q < len; q++) {
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (q = 0; q < len; q++) {
        while (z[k + 1] < q) k++;
        dq = q - v[k];
        d[q] = dq * dq + f[v[k]];
      }
    }

    for (y = 0; y < h; y++) {
      var r = y * w;
      for (x = 0; x < w; x++) f[x] = g[r + x];
      pass(w);
      for (x = 0; x < w; x++) g[r + x] = d[x];
    }
    var D = new Float32Array(n);
    for (x = 0; x < w; x++) {
      for (y = 0; y < h; y++) f[y] = g[y * w + x];
      pass(h);
      for (y = 0; y < h; y++) D[y * w + x] = Math.sqrt(d[y]);
    }
    return D;
  }

  function fillHoles(M, w, h) {
    // Ground the outside cannot reach belongs to the cell: islands of vein inside it. The cell is
    // four-connected, so the outside is flooded eight-connected, or a vein touching the outside only at a
    // corner would count as a hole.
    var out = new Uint8Array(w * h), stack = new Int32Array(w * h), top = 0, x, y, i, dx, dy, xx, yy;

    function push(k) { if (!out[k] && M[k] < 0.5) { out[k] = 1; stack[top++] = k; } }

    for (x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (top) {
      i = stack[--top]; x = i % w; y = (i - x) / w;
      for (dy = -1; dy <= 1; dy++) {
        yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (dx = -1; dx <= 1; dx++) {
          xx = x + dx; if (xx < 0 || xx >= w || (!dx && !dy)) continue;
          push(yy * w + xx);
        }
      }
    }
    for (i = 0; i < w * h; i++) if (!out[i]) M[i] = 1;
  }

  function ringArea(r) {
    // signed: positive when anticlockwise with y up
    var a = 0, i, j;
    for (i = 0, j = r.length - 2; i < r.length; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
    return a / 2;
  }

  function ringLength(r, sx, sy) {
    var L = 0, i, j, dx, dy;
    for (i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      dx = (r[i] - r[j]) * sx; dy = (r[i + 1] - r[j + 1]) * sy;
      L += Math.sqrt(dx * dx + dy * dy);
    }
    return L;
  }

  function pointInRing(x, y, r) {
    var inside = false, i, j, xi, yi, xj, yj;
    for (i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      xi = r[i]; yi = r[i + 1]; xj = r[j]; yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function simplifyRing(r, eps) {
    // Douglas-Peucker on a closed outline, split at the point farthest from the first
    var n = r.length >> 1, i;
    if (!(eps > 0) || n < 8) return r;
    var far = 0, fd = -1, dx, dy, d;
    for (i = 1; i < n; i++) {
      dx = r[2 * i] - r[0]; dy = r[2 * i + 1] - r[1]; d = dx * dx + dy * dy;
      if (d > fd) { fd = d; far = i; }
    }
    var keep = new Uint8Array(n), e2 = eps * eps, stack = [0, far, far, n];
    keep[0] = 1; keep[far] = 1;
    while (stack.length) {
      var b = stack.pop(), a = stack.pop();
      var ax = r[2 * a], ay = r[2 * a + 1], bb = b % n;
      var bx = r[2 * bb] - ax, by = r[2 * bb + 1] - ay, L2 = bx * bx + by * by;
      var md = -1, mi = -1, px, py, cr;
      for (i = a + 1; i < b; i++) {
        px = r[2 * i] - ax; py = r[2 * i + 1] - ay;
        if (L2 > 0) { cr = px * by - py * bx; d = cr * cr / L2; } else d = px * px + py * py;
        if (d > md) { md = d; mi = i; }
      }
      if (mi >= 0 && md > e2) { keep[mi] = 1; stack.push(a, mi, mi, b); }
    }
    var outArr = [];
    for (i = 0; i < n; i++) if (keep[i]) outArr.push(r[2 * i], r[2 * i + 1]);
    var res = new Float64Array(outArr.length);
    for (i = 0; i < outArr.length; i++) res[i] = outArr[i];
    return res;
  }

  /* ==================================================================================================
     COORDINATES

     worldXY is the v5 function with CFG.map.extentBNG and S.mapW / S.mapH replaced by the module's
     own SHEET, so nothing on the page has to exist for it to be right.

     bng === true gives real EPSG:27700 eastings and northings in metres. That is the setting the
     export panel ships with (iBNG is `checked` in the markup) and it must stay that way: with it
     off everything shifts by (-452754.1, -166381.6) to the sheet's bottom-left corner for the 3DS,
     which is one click and a silent 452 km error in QGIS.
     ================================================================================================== */

  function worldXY(x, y, bng) {
    var E = SHEET.e0 + x * (SHEET.e1 - SHEET.e0) / SHEET.mapW;
    var N = SHEET.n1 - y * (SHEET.n1 - SHEET.n0) / SHEET.mapH;
    return bng ? [E, N] : [E - SHEET.e0, N - SHEET.n0];
  }

  function setSheet(s) {
    if (!s) return SHEET;
    if (s.e0 !== undefined) SHEET.e0 = s.e0;
    if (s.e1 !== undefined) SHEET.e1 = s.e1;
    if (s.n0 !== undefined) SHEET.n0 = s.n0;
    if (s.n1 !== undefined) SHEET.n1 = s.n1;
    if (s.mapW !== undefined) SHEET.mapW = s.mapW;
    if (s.mapH !== undefined) SHEET.mapH = s.mapH;
    return SHEET;
  }

  function setGrowth(g) {
    if (!g) return GROWTH;
    if (g.W !== undefined) GROWTH.W = g.W;
    if (g.H !== undefined) GROWTH.H = g.H;
    if (g.cell !== undefined) GROWTH.cell = g.cell;
    if (g.E0 !== undefined) GROWTH.E0 = g.E0;
    if (g.N1 !== undefined) GROWTH.N1 = g.N1;
    return GROWTH;
  }

  /* ==================================================================================================
     extractCellsOn(field, SW, SH, opts)

     The ten edits, each marked in place:

       1  the toggleRun() call is gone      -- called from inside the year loop it paused the run
       2  field and SW / SH are arguments
       3  the five parseFloat(iX.value) reads are opts
       4  the confine test takes opts.confineMask
       5  the stations come from opts.nodes
       6  /S.sx and /S.sy become *(sheetW/SW) and *(sheetH/SH)
       7  opts.idPrefix and opts.sink
       8  the distance transform also treats built fabric as a source
       9  ONE ruler: cellE / cellN drive minCells, sigma, eps, roomKm, areaKm2 and perimKm alike
      10  a solid border ring, so a parcel cut by the sheet edge is kept and flagged edge:true

     opts:
       thr          vein threshold, default 0.5              (the road raster is 0 / 1)
       minKm2       smallest parcel kept
       smoothM      smoothing radius in metres
       simpM        simplification tolerance in metres
       confineMask  Uint8Array on the field grid, or null. Null is what both layers pass.
       nodes        [{id, x, y}] in MAP PIXELS, already filtered to the zone
       idPrefix     "C" for settlement, "R" for landscape
       sink         function(record) -- where to put the result. S.cells is one slot and a second
                    call would otherwise destroy the first.
       builtMask    Uint8Array on the field grid: 1 where the growth model has built fabric
       cellE,cellN  metres a cell, east and north. Defaults to the sheet extent over SW / SH.
       sheetW,sheetH  map pixels. Defaults to SHEET.
       step, year, layer  carried straight onto the record for the exporters

     Returns the record, and also hands it to opts.sink. Returns null when there is no network yet;
     the host writes the note on the panel, because this function does not touch the page.
     ================================================================================================== */

  function extractCellsOn(field, SW, SH, opts) {
    opts = opts || {};
    // EDIT 1: `if(S.running) toggleRun();` is deleted. In v5 an outline of a moving network was out
    // of date at once, so it paused the run. Called once a year from inside the year loop, that same
    // line stops the century at whatever year you first extracted, with the button reading "Resume".
    var t0 = now();
    if (!field || !SW || !SH) return null;

    // EDIT 2: the field and its size are arguments, not S.trail / S.SW / S.SH.
    var i, x, y, k;

    // EDIT 3: the five DOM reads become opts.
    var thr = num(opts.thr, 0.5);
    var minKm2 = num(opts.minKm2, 1);
    var smoothM = num(opts.smoothM, 300);
    var simpM = num(opts.simpM, 15);
    var confineMask = opts.confineMask || null;          // EDIT 4, used below

    var sheetW = num(opts.sheetW, SHEET.mapW), sheetH = num(opts.sheetH, SHEET.mapH);

    // EDIT 9: ONE ruler. v5 measured minCells, sigma, eps and roomKm with S.mPerPx*(S.mapW/SW) and
    // measured areaKm2 and perimKm with metresPerPx(). Those two are 0.035 % apart, which is small
    // enough never to look wrong and large enough to make two numbers on the same panel disagree.
    // Here cellE and cellN come from the registration and drive every one of them.
    var cellE = num(opts.cellE, (SHEET.e1 - SHEET.e0) / SW);
    var cellN = num(opts.cellN, (SHEET.n1 - SHEET.n0) / SH);
    var cellM = 0.5 * (cellE + cellN);      // for the isotropic measures: the two differ by 0.002 %
    var km2 = (cellE / 1000) * (cellN / 1000);

    var minCells = Math.max(4, minKm2 / km2);
    var sigma = smoothM / cellM;
    var eps = simpM / cellM;

    // EDIT 5: the stations are given, not read off CFG.
    var nodes = opts.nodes || [];
    // EDIT 7: the id prefix and the sink are given, so settlement and landscape can be numbered
    // independently and land in different slots.
    var idPrefix = opts.idPrefix || "C";
    var builtMask = opts.builtMask || null;              // EDIT 8, used below

    // is there a network at all? measured on the real field, before the border ring is painted in,
    // or the ring itself would always answer yes
    var solid = 0;
    for (i = 0; i < SW * SH; i++) if (field[i] > thr) solid++;
    if (!solid) {
      if (opts.sink) opts.sink(null);
      return null;
    }

    /* ---- EDIT 10: the border ring -------------------------------------------------------------
       v5 marked a piece `open` if it touched the edge of the grid and then threw it away, silently.
       On a quadrant that is most of the farm layer. Here the field is copied into a grid one cell
       larger all round and that one-cell ring is painted solid, so no piece of ground can reach the
       border at all: every piece closes, every piece is traced, and a piece that was cut by the
       sheet is KEPT and carries edge:true so the drawing and the DXF can say so. The only thing
       still discarded as open is a piece that leaves a confineMask, and that count is reported.

       The alternative -- passing S.zone as the mask, which is what v5 did -- deletes any parcel
       touching the corridor edge with no message at all.
    --------------------------------------------------------------------------------------------- */
    var w0 = SW + 2, h0 = SH + 2, n = w0 * h0;
    var T = new Float32Array(n);
    var solidV = thr + 1;                              // comfortably above the threshold
    for (x = 0; x < w0; x++) { T[x] = solidV; T[(h0 - 1) * w0 + x] = solidV; }
    for (y = 0; y < h0; y++) { T[y * w0] = solidV; T[y * w0 + w0 - 1] = solidV; }
    for (y = 0; y < SH; y++) {
      var rs = y * SW, rd = (y + 1) * w0 + 1;
      for (x = 0; x < SW; x++) T[rd + x] = field[rs + x];
    }

    // the ground between the veins, in four-connected pieces
    var lab = new Int32Array(n), stack = new Int32Array(n), pieces = [];
    var next = 1, discardedOpen = 0, discardedSmall = 0;
    for (var s = 0; s < n; s++) {
      if (lab[s] || T[s] > thr) continue;
      var top = 0, size = 0, open = false, edge = false;
      var x0 = w0, y0 = h0, x1 = 0, y1 = 0;
      stack[top++] = s; lab[s] = next;
      while (top) {
        i = stack[--top]; x = i % w0; y = (i - x) / w0;
        size++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        // the piece meets the real sheet edge if it sits in the outermost row or column of the
        // ORIGINAL grid, which is the second row or column of this padded one
        if (x === 1 || y === 1 || x === SW || y === SH) edge = true;
        // EDIT 4: the confine test. Null for both layers in v1, so nothing is discarded.
        if (confineMask) {
          var oi = (y - 1) * SW + (x - 1);
          if (oi < 0 || oi >= SW * SH || !confineMask[oi]) open = true;
        }
        if (x > 0 && !lab[i - 1] && T[i - 1] <= thr) { lab[i - 1] = next; stack[top++] = i - 1; }
        if (x < w0 - 1 && !lab[i + 1] && T[i + 1] <= thr) { lab[i + 1] = next; stack[top++] = i + 1; }
        if (y > 0 && !lab[i - w0] && T[i - w0] <= thr) { lab[i - w0] = next; stack[top++] = i - w0; }
        if (y < h0 - 1 && !lab[i + w0] && T[i + w0] <= thr) { lab[i + w0] = next; stack[top++] = i + w0; }
      }
      if (open) discardedOpen++;
      else if (size < minCells) discardedSmall++;
      else pieces.push({ id: next, x0: x0, y0: y0, x1: x1, y1: y1, edge: edge });
      next++;
    }

    // each closed piece as one smooth outline
    var pad = Math.ceil(3 * sigma) + 2, list = [];
    var kx = sheetW / SW, ky = sheetH / SH;          // EDIT 6, below

    for (var pi = 0; pi < pieces.length; pi++) {
      var pc = pieces[pi];
      var ox = pc.x0 - pad, oy = pc.y0 - pad;
      var w = pc.x1 - pc.x0 + 1 + 2 * pad, h = pc.y1 - pc.y0 + 1 + 2 * pad;
      var M = new Float32Array(w * h);
      var Cp = builtMask ? new Uint8Array(w * h) : null;
      for (y = pc.y0; y <= pc.y1; y++) {
        var row = y * w0, lrow = (y - oy) * w - ox;
        for (x = pc.x0; x <= pc.x1; x++) {
          if (lab[row + x] !== pc.id) continue;
          M[lrow + x] = 1;
          if (Cp) {
            var bi = (y - 1) * SW + (x - 1);
            if (bi >= 0 && bi < SW * SH && builtMask[bi]) Cp[lrow + x] = 1;
          }
        }
      }
      fillHoles(M, w, h);
      var B = sigma > 0.05 ? blurField(M, w, h, sigma) : M;

      // Largest first. An outline inside one already kept is a hole the smoothing opened; drop it.
      var raw = traceRings(B, w, h, 0.5), rings = [];
      for (k = 0; k < raw.length; k++) rings.push({ r: raw[k], a: Math.abs(ringArea(raw[k])) });
      rings.sort(function (p, q) { return q.a - p.a; });
      var kept = [];
      for (k = 0; k < rings.length; k++) {
        var o = rings[k];
        // as shipped in v5: an area in cells squared is compared against a count of cells. It is a
        // speck filter and it works; it is not a unit conversion. Left exactly as it was.
        if (o.a < minCells) continue;
        var insideOne = false;
        for (var q = 0; q < kept.length; q++) {
          if (pointInRing(o.r[0], o.r[1], kept[q].r)) { insideOne = true; break; }
        }
        if (insideOne) continue;
        kept.push(o);
      }
      if (!kept.length) continue;

      // EDIT 8: room is how far the parcel's ground gets from a vein AND from built fabric. With
      // only `M[i] < 0.5` the transform runs straight across the town, the label pole lands on a
      // tower block, and roomKm reports depth that is roofs.
      var D = edtTo(w, h, Cp
        ? function (ii) { return M[ii] < 0.5 || Cp[ii] === 1; }
        : function (ii) { return M[ii] < 0.5; });

      for (k = 0; k < kept.length; k++) {
        var kr = kept[k].r;
        // the label goes at the middle of the largest disc that fits inside this outline
        var best = -1, bidx = -1;
        for (i = 0; i < w * h; i++) {
          if (D[i] <= best) continue;
          var px = i % w, py = (i - px) / w;
          if (pointInRing(px, py, kr)) { best = D[i]; bidx = i; }
        }
        var ring = simplifyRing(kr, eps);

        // rg: the outline back in ORIGINAL field-grid cells, a cell's value at its centre. The -1
        // undoes the border ring's padding. All the measurements are taken here, on one ruler.
        var rg = new Float64Array(ring.length);
        var pts = new Float64Array(ring.length);
        for (var m = 0; m < ring.length; m += 2) {
          rg[m] = ring[m] + ox - 1 + 0.5;
          rg[m + 1] = ring[m + 1] + oy - 1 + 0.5;
          // EDIT 6: v5 divided by S.sx and S.sy, which happened to equal SW/mapW today. Multiplying
          // by the sheet over the grid is the same number for the fine grid and the correct one for
          // the coarse grid, where S.sx does not apply at all. Skip this edit and the 475 x 433
          // layer comes out at half scale, quietly, with plausible-looking outlines.
          pts[m] = rg[m] * kx;
          pts[m + 1] = rg[m + 1] * ky;
        }

        var lxg, lyg;
        if (bidx >= 0) {
          lxg = (bidx % w) + ox - 1 + 0.5;
          lyg = ((bidx - (bidx % w)) / w) + oy - 1 + 0.5;
        } else {
          // no cell of the box tested inside the outline, which should not happen. Rather than
          // write a label at a negative index, fall back to the mean of the outline's own points.
          lxg = 0; lyg = 0;
          for (var mm = 0; mm < rg.length; mm += 2) { lxg += rg[mm]; lyg += rg[mm + 1]; }
          lxg /= (rg.length / 2); lyg /= (rg.length / 2);
          best = 0;
        }

        var stations = [];
        for (var q2 = 0; q2 < nodes.length; q2++) {
          if (pointInRing(nodes[q2].x, nodes[q2].y, pts)) stations.push(nodes[q2].id);
        }

        list.push({
          ring: pts,                                            // map pixels, for drawing and export
          ringG: rg,                                            // field-grid cells, for measuring
          areaKm2: Math.abs(ringArea(rg)) * cellE * cellN / 1e6,
          perimKm: ringLength(rg, cellE, cellN) / 1000,
          roomKm: Math.max(0, best) * cellM / 1000,
          lx: lxg * kx, ly: lyg * ky,                           // map pixels
          lxG: lxg, lyG: lyg,                                   // field-grid cells, for the sort
          edge: pc.edge === true,
          stations: stations
        });
      }
    }

    // numbered as a page is read: in rows 8 km deep, west to east. On the grid, so the band is the
    // same 8 km on both layers rather than 8 km of whichever ruler happened to be in scope.
    var band = 8000 / cellN;
    list.sort(function (a, b) {
      return (Math.floor(a.lyG / band) - Math.floor(b.lyG / band)) || (a.lxG - b.lxG);
    });
    var edgeCount = 0;
    for (i = 0; i < list.length; i++) {
      list[i].id = idPrefix + (i + 1);
      if (list[i].edge) edgeCount++;
    }

    var rec = {
      list: list,
      layer: opts.layer || (idPrefix === "R" ? "landscape" : "settlement"),
      idPrefix: idPrefix,
      step: num(opts.step, 0),
      year: num(opts.year, 0),
      thr: thr, minKm2: minKm2, smoothM: smoothM, simplifyM: simpM,
      SW: SW, SH: SH, cellE: cellE, cellN: cellN, cellM: cellM,
      discarded: discardedOpen,          // pieces thrown away as open: print this, section 11
      discardedSmall: discardedSmall,    // pieces under minKm2: expected, not a fault
      edgeCount: edgeCount,
      ms: Math.round(now() - t0)
    };
    if (opts.sink) opts.sink(rec);
    return rec;
  }

  /* ==================================================================================================
     attachGrowth(cells, classAt, out, Y, opts)

     What each parcel actually contains, in the growth model's own terms. It runs AFTER the
     extraction and writes onto the parcels in place, so the proven function above never has to know
     that the growth model exists.

     The method is the one line ported from export_for_growth.py:186. Each parcel's outline is
     painted into an offscreen canvas that IS the growth grid -- 1256 x 1144 cells of exactly 70 m,
     cornered on E 452,754.1 / N 246,493.2 -- with the parcel's index encoded as the fill colour.
     One getImageData, then one pass over classAt. Sampled by British National Grid position, never
     pixel for pixel: the mould's cell is 92.6 m and the growth model's is 70 m and they do not line
     up, which is the whole reason the registration table exists.

     THE TRAP, and it is unavoidable with a canvas: fill() is antialiased and there is no way to
     turn that off. A pixel half inside a parcel comes back as a blend, which decodes to an index
     that is either invalid or a neighbour's. We require alpha 255 and an index inside the list, and
     drop anything else. That costs at most a one-cell (70 m) rind at each parcel edge, so the
     numbers sit a hair low on a small parcel and are unaffected on a large one. Better a known
     small bias than a handful of cells silently credited to the wrong parcel.

     opts:
       layer        "settlement" | "landscape"
       growth       {W,H,cell,E0,N1}, defaults to the registration
       growthIndex  function(gx,gy) -> the sim's own array index. Defaults to gy*W+gx, which is
                    right while the sim runs on the 1256 x 1144 window. If it is ever run on the
                    full 2143 x 1757 grid this MUST be supplied, or every number below is read off
                    the wrong part of the country.
       K, PPK       the sim's class codes and densities
       roads        [[E,N,E,N,...], ...] road centrelines in metres, for roadKm
       yearSet      a number, or opts.yearSetOf(parcel) for a function
     ================================================================================================== */

  function attachGrowth(cells, classAt, out, Y, opts) {
    opts = opts || {};
    var list = listOf(cells);
    var layer = opts.layer || (cells && cells.layer) || "settlement";
    var i, j, k, p;

    // the numbers exist whatever happens, so nothing downstream has to test for undefined
    for (i = 0; i < list.length; i++) {
      p = list[i];
      p.layer = layer;
      p.builtKm2 = 0;
      p.tiers = { highKm2: 0, midKm2: 0, lowKm2: 0 };
      p.people = 0;
      p.vfarmKm2 = 0;
      p.fieldKm2 = 0;
      p.roadKm = 0;
      p.blobs = 0;
      p.edge = p.edge === true;
      p.yearSet = opts.yearSetOf ? opts.yearSetOf(p) : num(opts.yearSet, num(Y, 0));
    }
    if (!list.length) return cells;

    var G = opts.growth || GROWTH;
    var GW = G.W, GH = G.H, gc = G.cell, gE0 = G.E0, gN1 = G.N1;
    var cellKm2 = (gc / 1000) * (gc / 1000);
    var KK = opts.K || K_DEFAULT;
    var PP = opts.PPK || PPK_DEFAULT;
    var gIndex = opts.growthIndex || function (gx, gy) { return gy * GW + gx; };

    if (!hasDoc()) {
      // no canvas, no raster. Say so rather than returning zeros that look like an answer.
      if (cells && cells.list) cells.growthNote = "attachGrowth needs a document; parcels carry zeros.";
      return cells;
    }

    var cv = document.createElement("canvas");
    cv.width = GW; cv.height = GH;
    var cx = cv.getContext("2d", { willReadFrequently: true }) || cv.getContext("2d");
    if (!cx) return cells;
    cx.fillStyle = "#000000";
    cx.fillRect(0, 0, GW, GH);                    // index 0 is nobody

    /* Paint largest FIRST, so a parcel that encloses another ends up underneath it.

       That case is real, not theoretical. The border ring of EDIT 10 keeps the piece of ground that
       wraps the sheet edge, and v5's own rule -- an outline inside one already kept is a hole the
       smoothing opened, drop it -- means that wrapping parcel's outline swallows anything it
       completely surrounds. Paint it last and it would take every enclosed parcel's fabric with it
       and leave them reading zero. Note the matching oddity: such a parcel's areaKm2 comes from its
       outline and so counts the ground inside its holes, while its builtKm2 comes from the raster
       and does not. */
    var order = [];
    for (i = 0; i < list.length; i++) order.push(i);
    order.sort(function (a, b) { return (list[b].areaKm2 || 0) - (list[a].areaKm2 || 0); });

    // index 1..N, encoded little end first into r,g,b
    for (var oi2 = 0; oi2 < order.length; oi2++) {
      i = order[oi2];
      var idx = i + 1;
      var r = idx & 255, g = (idx >> 8) & 255, b = (idx >> 16) & 255;
      var ring = list[i].ring;
      if (!ring || ring.length < 6) continue;
      cx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
      cx.beginPath();
      for (k = 0; k < ring.length; k += 2) {
        var EN = worldXY(ring[k], ring[k + 1], true);
        var gx = (EN[0] - gE0) / gc, gy = (gN1 - EN[1]) / gc;
        if (k === 0) cx.moveTo(gx, gy); else cx.lineTo(gx, gy);
      }
      cx.closePath();
      cx.fill();
    }

    var data = cx.getImageData(0, 0, GW, GH).data;
    var nG = GW * GH;
    var owner = new Int32Array(nG);               // parcel index at each growth cell, 0 for none
    var built = new Uint8Array(nG);               // built fabric inside a parcel, for the blob count
    var N = list.length;

    // one pass: decode the owner, read the class, accumulate
    var cntLow = new Float64Array(N + 1), cntMid = new Float64Array(N + 1), cntHigh = new Float64Array(N + 1);
    var cntBuilt = new Float64Array(N + 1), cntVfarm = new Float64Array(N + 1), cntField = new Float64Array(N + 1);
    var bx0 = new Int32Array(N + 1), by0 = new Int32Array(N + 1), bx1 = new Int32Array(N + 1), by1 = new Int32Array(N + 1);
    for (i = 1; i <= N; i++) { bx0[i] = GW; by0[i] = GH; bx1[i] = -1; by1[i] = -1; }

    for (i = 0; i < nG; i++) {
      var a = data[4 * i + 3];
      if (a !== 255) continue;                    // an antialiased edge pixel: not ours to count
      var id = data[4 * i] | (data[4 * i + 1] << 8) | (data[4 * i + 2] << 16);
      if (id < 1 || id > N) continue;
      owner[i] = id;
      var gxx = i % GW, gyy = (i - gxx) / GW;
      if (gxx < bx0[id]) bx0[id] = gxx; if (gxx > bx1[id]) bx1[id] = gxx;
      if (gyy < by0[id]) by0[id] = gyy; if (gyy > by1[id]) by1[id] = gyy;

      var cls = classAt ? classAt(out, gIndex(gxx, gyy), Y) : KK.EMPTY;
      if (cls === KK.LOW) { cntLow[id]++; cntBuilt[id]++; built[i] = 1; }
      else if (cls === KK.MED) { cntMid[id]++; cntBuilt[id]++; built[i] = 1; }
      else if (cls === KK.HIGH) { cntHigh[id]++; cntBuilt[id]++; built[i] = 1; }
      else if (cls === KK.COM || cls === KK.INST) { cntBuilt[id]++; built[i] = 1; }
      else if (cls === KK.VFARM) cntVfarm[id]++;
      else if (cls === KK.FIELD) cntField[id]++;
    }

    for (i = 1; i <= N; i++) {
      p = list[i - 1];
      p.tiers.lowKm2 = cntLow[i] * cellKm2;
      p.tiers.midKm2 = cntMid[i] * cellKm2;
      p.tiers.highKm2 = cntHigh[i] * cellKm2;
      // built is the tiers plus the commercial and institutional specks: everything with a roof
      p.builtKm2 = cntBuilt[i] * cellKm2;
      p.vfarmKm2 = cntVfarm[i] * cellKm2;
      p.fieldKm2 = cntField[i] * cellKm2;
      p.people = (cntLow[i] * PP[1] + cntMid[i] * PP[2] + cntHigh[i] * PP[3]) * cellKm2;
    }

    /* how many separate pieces of fabric the parcel encloses. Before about 2040 the growth model's
       fabric is speckled, and a parcel holding forty specks reads on paper as a parcel holding one
       town. The count is the honest way to say which it is. Eight-connected, because a settlement
       that touches itself only at a corner is one settlement. */
    var seen = new Uint8Array(nG), fstack = new Int32Array(nG);
    for (i = 1; i <= N; i++) {
      if (bx1[i] < 0) continue;
      var blobs = 0;
      for (var yy = by0[i]; yy <= by1[i]; yy++) {
        for (var xx = bx0[i]; xx <= bx1[i]; xx++) {
          var si = yy * GW + xx;
          if (seen[si] || !built[si] || owner[si] !== i) continue;
          blobs++;
          var ftop = 0;
          seen[si] = 1; fstack[ftop++] = si;
          while (ftop) {
            var ci = fstack[--ftop], cxx = ci % GW, cyy = (ci - cxx) / GW, dx, dy;
            for (dy = -1; dy <= 1; dy++) {
              var ny = cyy + dy; if (ny < 0 || ny >= GH) continue;
              for (dx = -1; dx <= 1; dx++) {
                var nx = cxx + dx; if (nx < 0 || nx >= GW || (!dx && !dy)) continue;
                var ni = ny * GW + nx;
                if (seen[ni] || !built[ni] || owner[ni] !== i) continue;
                seen[ni] = 1; fstack[ftop++] = ni;
              }
            }
          }
        }
      }
      list[i - 1].blobs = blobs;
    }

    /* roadKm: the parcel's frontage, not the road inside it. A parcel is the ground BETWEEN the
       veins, so the centreline never lies inside the outline -- sampling the polyline and asking
       who owns that exact cell would return zero for everything. We sample every half cell and
       credit the step to every distinct parcel in the 3 x 3 neighbourhood, so a road between two
       parcels is counted once for each of them. That means the sum of roadKm across parcels is
       roughly twice the network's length, on purpose: each number is that parcel's own frontage. */
    var roads = opts.roads;
    if (roads && roads.length) {
      var step = gc * 0.5, credit = new Int32Array(9);
      var acc = new Float64Array(N + 1);
      for (i = 0; i < roads.length; i++) {
        var pl = roads[i];
        if (!pl || pl.length < 4) continue;
        for (j = 0; j + 3 < pl.length; j += 2) {
          var eA = pl[j], nA = pl[j + 1], eB = pl[j + 2], nB = pl[j + 3];
          var dE = eB - eA, dN = nB - nA, seg = Math.sqrt(dE * dE + dN * dN);
          if (!(seg > 0)) continue;
          var steps = Math.max(1, Math.ceil(seg / step)), sl = seg / steps;
          for (k = 0; k < steps; k++) {
            var t = (k + 0.5) / steps;
            var sE = eA + dE * t, sN = nA + dN * t;
            var sx = Math.floor((sE - gE0) / gc), sy = Math.floor((gN1 - sN) / gc);
            if (sx < 0 || sx >= GW || sy < 0 || sy >= GH) continue;
            var nc = 0, ddx, ddy;
            for (ddy = -1; ddy <= 1; ddy++) {
              var ry = sy + ddy; if (ry < 0 || ry >= GH) continue;
              for (ddx = -1; ddx <= 1; ddx++) {
                var rx = sx + ddx; if (rx < 0 || rx >= GW) continue;
                var ow = owner[ry * GW + rx];
                if (!ow) continue;
                var dup = false;
                for (var c2 = 0; c2 < nc; c2++) if (credit[c2] === ow) { dup = true; break; }
                if (!dup) credit[nc++] = ow;
              }
            }
            for (var c3 = 0; c3 < nc; c3++) acc[credit[c3]] += sl;
          }
        }
      }
      for (i = 1; i <= N; i++) list[i - 1].roadKm = acc[i] / 1000;
    }

    if (cells && cells.list) {
      cells.growthYear = num(Y, 0);
      cells.growthCellKm2 = cellKm2;
    }
    return cells;
  }

  /* ==================================================================================================
     DRAWING
     ================================================================================================== */

  function cellsPath(c, L) {
    c.beginPath();
    for (var k = 0; k < L.length; k++) {
      var r = L[k].ring;
      c.moveTo(r[0], r[1]);
      for (var i = 2; i < r.length; i += 2) c.lineTo(r[i], r[i + 1]);
      c.closePath();
    }
  }

  /* ==================================================================================================
     EXPORT

     Coordinates are real EPSG:27700 eastings and northings in metres, and $INSUNITS is 6 (metres).
     A DXF exported from QGIS drops straight onto this one and Rhino set to metres reads the same
     file. bng defaults to TRUE and must stay that way -- see the note on worldXY.
     ================================================================================================== */

  function networkOutline(field, SW, SH, opts) {
    // The veins' edges over the whole sheet: the field, blurred by one cell so the wisps do not each
    // become an outline, traced at the vein edge.
    //
    // Kept because it is the drawing the v5 DXF put on its NETWORK layer, and the host may still
    // want it on screen. It is NOT what cellsDXF writes for the roads any more: an outline of the
    // vein is a pair of lines either side of a road, at whatever width the trail happens to be that
    // year, and the DXF now takes the centreline instead so that the road in the film, the road in
    // the DXF and the parcel boundary are the same line.
    opts = opts || {};
    var thr = num(opts.thr, 0.5);
    var sheetW = num(opts.sheetW, SHEET.mapW), sheetH = num(opts.sheetH, SHEET.mapH);
    var cellE = num(opts.cellE, (SHEET.e1 - SHEET.e0) / SW);
    var cellN = num(opts.cellN, (SHEET.n1 - SHEET.n0) / SH);
    var cellM = 0.5 * (cellE + cellN);
    var w = SW + 2, h = SH + 2, x, y, k;
    var F = new Float32Array(w * h);
    for (y = 0; y < SH; y++) {
      var r = y * SW, lr = (y + 1) * w + 1;
      for (x = 0; x < SW; x++) F[lr + x] = field[r + x];
    }
    var B = blurField(F, w, h, 1.0), eps = num(opts.simpM, 15) / cellM;
    var minA = 0.05 / ((cellE / 1000) * (cellN / 1000));       // specks under 0.05 km2 are left out
    var rings = traceRings(B, w, h, thr), out = [];
    var kx = sheetW / SW, ky = sheetH / SH;
    for (var i = 0; i < rings.length; i++) {
      if (Math.abs(ringArea(rings[i])) < minA) continue;
      var sr = simplifyRing(rings[i], eps), pts = new Float64Array(sr.length);
      for (k = 0; k < sr.length; k += 2) {
        // held to the sheet: the padding lets an outline along the edge sit half a cell beyond it
        pts[k] = clamp((sr[k] - 1 + 0.5) * kx, 0, sheetW);
        pts[k + 1] = clamp((sr[k + 1] - 1 + 0.5) * ky, 0, sheetH);
      }
      out.push(pts);
    }
    return out;
  }

  function zoneTag(zones) {
    if (!zones || !zones.length) return "quadrant";
    var s = "";
    for (var i = 0; i < zones.length; i++) {
      var v = String(zones[i]);
      while (v.length < 2) v = "0" + v;
      s += v;
    }
    return "z" + s;
  }

  function fmtPeople(v) {
    v = Math.round(v || 0);
    var s = String(v), out = "", c = 0;
    for (var i = s.length - 1; i >= 0; i--) { out = s.charAt(i) + out; if (++c % 3 === 0 && i > 0) out = "," + out; }
    return out;
  }

  /* one line of the numbers attachGrowth put on a parcel, for the CELL_DATA text layer */
  function dataLine(c) {
    var bits = [];
    bits.push("built " + (c.builtKm2 || 0).toFixed(2) + " km2");
    bits.push("pop " + fmtPeople(c.people));
    if (c.tiers) bits.push("H/M/L " + c.tiers.highKm2.toFixed(2) + "/" + c.tiers.midKm2.toFixed(2) + "/" + c.tiers.lowKm2.toFixed(2));
    bits.push("vfarm " + (c.vfarmKm2 || 0).toFixed(2));
    bits.push("field " + (c.fieldKm2 || 0).toFixed(2));
    bits.push("road " + (c.roadKm || 0).toFixed(1) + " km");
    bits.push("blobs " + (c.blobs || 0));
    if (c.yearSet) bits.push("set " + c.yearSet);
    if (c.edge) bits.push("EDGE");
    return bits.join("  ");
  }

  /* --------------------------------------------------------------------------------------------
     cellsDXF(o)

     o:
       cells      the settlement record (or list)      -> layer CELLS
       cells2     the landscape record (or list)       -> layer CELLS_FARM
       roads1     [[E,N,...], ...] in METRES           -> layer ROADS_1, open polylines, 35 m road
       roads2     [[E,N,...], ...] in METRES           -> layer ROADS_2, open polylines, 19 m road
       fabric     [[E,N,...], ...] in METRES, closed   -> layer FABRIC
       vfarm      [[E,N,...], ...] in METRES, closed   -> layer VFARM
       rail       [[[x,y],...], ...] in MAP PIXELS, already clipped to the sheet
       nodes      [{id,t,x,y}] in MAP PIXELS
       bng        default true
       zones, step, year
     -------------------------------------------------------------------------------------------- */

  function cellsDXF(o) {
    o = o || {};
    var L1 = listOf(o.cells), L2 = listOf(o.cells2);
    var bng = o.bng !== false;                 // iBNG ships checked, and must stay checked
    var out = [];

    function g(code, val) { out.push(String(code), String(val)); }

    /* The six new layers are the spec's, with the spec's colours. Three of those colour numbers
       collide with layers this file already wrote (NETWORK 33, CELLS 30, CELL_LABELS 32). A
       duplicate ACI is legal in a DXF and every one of these gets restyled in QGIS or Rhino the
       moment it lands, so the names are what matter and the names are all distinct. */
    var LAYERS = [
      ["FRAME", 8], ["RAILWAY", 7], ["STATIONS", 5], ["NETWORK", 33],
      ["CELLS", 30], ["CELL_LABELS", 32],
      ["CELLS_FARM", 34], ["ROADS_1", 33], ["ROADS_2", 35],
      ["CELL_DATA", 31], ["FABRIC", 30], ["VFARM", 32]
    ];

    var sheetW = SHEET.mapW, sheetH = SHEET.mapH;
    var lo = worldXY(0, sheetH, bng), hi = worldXY(sheetW, 0, bng);
    var mx = (SHEET.e1 - SHEET.e0) / sheetW, my = (SHEET.n1 - SHEET.n0) / sheetH;
    var i, k;

    g(0, "SECTION"); g(2, "HEADER");
    g(9, "$ACADVER"); g(1, "AC1009");
    g(9, "$INSUNITS"); g(70, 6);                    // 6 = metres
    g(9, "$EXTMIN"); g(10, f3(lo[0])); g(20, f3(lo[1])); g(30, "0.0");
    g(9, "$EXTMAX"); g(10, f3(hi[0])); g(20, f3(hi[1])); g(30, "0.0");
    g(0, "ENDSEC");
    g(0, "SECTION"); g(2, "TABLES");
    g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
    g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, "0.0");
    g(0, "ENDTAB");
    g(0, "TABLE"); g(2, "LAYER"); g(70, LAYERS.length);
    for (i = 0; i < LAYERS.length; i++) {
      g(0, "LAYER"); g(2, LAYERS[i][0]); g(70, 0); g(62, LAYERS[i][1]); g(6, "CONTINUOUS");
    }
    g(0, "ENDTAB");
    g(0, "ENDSEC");

    g(0, "SECTION"); g(2, "ENTITIES");

    // a polyline whose points are MAP PIXELS
    function poly(layer, pts, closed) {
      g(0, "POLYLINE"); g(8, layer); g(66, 1); g(10, "0.0"); g(20, "0.0"); g(30, "0.0"); g(70, closed ? 1 : 0);
      for (var j = 0; j < pts.length; j += 2) {
        var p = worldXY(pts[j], pts[j + 1], bng);
        g(0, "VERTEX"); g(8, layer); g(10, f3(p[0])); g(20, f3(p[1])); g(30, "0.0");
      }
      g(0, "SEQEND"); g(8, layer);
    }

    // a polyline whose points are already METRES. The roads arrive as centrelines in metres from
    // traceSkeleton, so running them through worldXY would convert a coordinate twice. When British
    // National Grid is switched off everything else shifts to the sheet corner, so these have to
    // shift with it or the roads and the parcels end up 452 km apart in the same file.
    function polyM(layer, pts, closed) {
      g(0, "POLYLINE"); g(8, layer); g(66, 1); g(10, "0.0"); g(20, "0.0"); g(30, "0.0"); g(70, closed ? 1 : 0);
      for (var j = 0; j < pts.length; j += 2) {
        var E = pts[j], N = pts[j + 1];
        if (!bng) { E -= SHEET.e0; N -= SHEET.n0; }
        g(0, "VERTEX"); g(8, layer); g(10, f3(E)); g(20, f3(N)); g(30, "0.0");
      }
      g(0, "SEQEND"); g(8, layer);
    }

    function text(layer, x, y, height, s) {
      var p = worldXY(x, y, bng);
      g(0, "TEXT"); g(8, layer); g(10, f3(p[0])); g(20, f3(p[1])); g(30, "0.0"); g(40, f3(height)); g(1, s);
      g(72, 1); g(11, f3(p[0])); g(21, f3(p[1])); g(31, "0.0"); g(73, 2);
    }

    poly("FRAME", [0, 0, sheetW, 0, sheetW, sheetH, 0, sheetH], true);

    var rail = o.rail || [];
    for (i = 0; i < rail.length; i++) {
      var run = rail[i], flat = [];
      for (k = 0; k < run.length; k++) { flat.push(run[k][0], run[k][1]); }
      if (flat.length >= 4) poly("RAILWAY", flat, false);
    }

    var nodes = o.nodes || [];
    for (i = 0; i < nodes.length; i++) {
      var nd = nodes[i], pn = worldXY(nd.x, nd.y, bng);
      g(0, "CIRCLE"); g(8, "STATIONS"); g(10, f3(pn[0])); g(20, f3(pn[1])); g(30, "0.0");
      g(40, nd.t === "P" ? "300.0" : "220.0");
      text("STATIONS", nd.x + 700 / mx, nd.y - 450 / my, 260, nd.id);
    }

    // the roads, as the centrelines they are
    var r1 = o.roads1 || [], r2 = o.roads2 || [];
    for (i = 0; i < r1.length; i++) if (r1[i] && r1[i].length >= 4) polyM("ROADS_1", r1[i], false);
    for (i = 0; i < r2.length; i++) if (r2[i] && r2[i].length >= 4) polyM("ROADS_2", r2[i], false);

    var fab = o.fabric || [], vf = o.vfarm || [];
    for (i = 0; i < fab.length; i++) if (fab[i] && fab[i].length >= 6) polyM("FABRIC", fab[i], true);
    for (i = 0; i < vf.length; i++) if (vf[i] && vf[i].length >= 6) polyM("VFARM", vf[i], true);

    // the parcels. The per-parcel numbers go on CELL_DATA as TEXT, not as XDATA: QGIS's DXF reader
    // drops XDATA on the floor, and overlaying these in QGIS is the entire reason for the file.
    function writeCells(L, cellLayer) {
      for (var j = 0; j < L.length; j++) {
        var c = L[j];
        poly(cellLayer, c.ring, true);
        text("CELL_LABELS", c.lx, c.ly - 180 / my, 220,
             c.id + (c.stations && c.stations.length ? " " + c.stations.join(" ") : ""));
        text("CELL_LABELS", c.lx, c.ly + 180 / my, 150, c.areaKm2.toFixed(1) + " km2");
        if (c.builtKm2 !== undefined) text("CELL_DATA", c.lx, c.ly + 400 / my, 130, dataLine(c));
      }
    }
    writeCells(L1, "CELLS");
    writeCells(L2, "CELLS_FARM");

    g(0, "ENDSEC");
    g(0, "EOF");
    return out.join("\r\n") + "\r\n";
  }

  /* --------------------------------------------------------------------------------------------
     The .prj sidecar. A DXF has nowhere at all to record a coordinate system, so QGIS asks every
     time. Save this next to the DXF with the same base name and it stops asking.
     -------------------------------------------------------------------------------------------- */

  function prjSidecar() {
    return 'PROJCS["OSGB 1936 / British National Grid",' +
      'GEOGCS["OSGB 1936",' +
      'DATUM["OSGB_1936",' +
      'SPHEROID["Airy 1830",6377563.396,299.3249646,AUTHORITY["EPSG","7001"]],' +
      'TOWGS84[446.448,-125.157,542.06,0.15,0.247,0.842,-20.489],' +
      'AUTHORITY["EPSG","6277"]],' +
      'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
      'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
      'AUTHORITY["EPSG","4277"]],' +
      'PROJECTION["Transverse_Mercator"],' +
      'PARAMETER["latitude_of_origin",49],' +
      'PARAMETER["central_meridian",-2],' +
      'PARAMETER["scale_factor",0.9996012717],' +
      'PARAMETER["false_easting",400000],' +
      'PARAMETER["false_northing",-100000],' +
      'UNIT["metre",1,AUTHORITY["EPSG","9001"]],' +
      'AXIS["Easting",EAST],AXIS["Northing",NORTH],' +
      'AUTHORITY["EPSG","27700"]]';
  }

  /* --------------------------------------------------------------------------------------------
     GeoJSON. Always British National Grid, whatever the DXF toggle says: QGIS reads the crs member
     and a GeoJSON in sheet-corner metres would be a file that claims to be somewhere it is not.
     -------------------------------------------------------------------------------------------- */

  function cellsGeoJSON(o) {
    o = o || {};
    var feats = [], step = 0;
    if (o.cells && o.cells.step !== undefined) step = o.cells.step;

    function addAll(rec) {
      var L = listOf(rec);
      for (var j = 0; j < L.length; j++) {
        var c = L[j], ring = [], i, a = 0;
        for (i = 0; i < c.ring.length; i += 2) {
          var p = worldXY(c.ring[i], c.ring[i + 1], true);
          ring.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
        }
        for (i = 0; i < ring.length; i++) {
          var jj = (i === 0) ? ring.length - 1 : i - 1;
          a += ring[jj][0] * ring[i][1] - ring[i][0] * ring[jj][1];
        }
        if (a < 0) ring.reverse();                            // exterior rings anticlockwise
        ring.push([ring[0][0], ring[0][1]]);
        var t = c.tiers || { highKm2: 0, midKm2: 0, lowKm2: 0 };
        feats.push({
          type: "Feature",
          properties: {
            id: c.id,
            layer: c.layer || (rec && rec.layer) || "",
            area_km2: +c.areaKm2.toFixed(3),
            perimeter_km: +c.perimKm.toFixed(3),
            room_km: +c.roomKm.toFixed(2),
            stations: (c.stations || []).join(" "),
            built_km2: +(c.builtKm2 || 0).toFixed(3),
            high_km2: +t.highKm2.toFixed(3),
            mid_km2: +t.midKm2.toFixed(3),
            low_km2: +t.lowKm2.toFixed(3),
            people: Math.round(c.people || 0),
            vfarm_km2: +(c.vfarmKm2 || 0).toFixed(3),
            field_km2: +(c.fieldKm2 || 0).toFixed(3),
            road_km: +(c.roadKm || 0).toFixed(3),
            blobs: c.blobs || 0,
            year_set: c.yearSet || 0,
            edge: c.edge === true,
            step: (rec && rec.step) || step,
            year: (rec && rec.year) || o.year || 0
          },
          geometry: { type: "Polygon", coordinates: [ring] }
        });
      }
    }

    addAll(o.cells);
    addAll(o.cells2);
    return JSON.stringify({
      type: "FeatureCollection",
      name: "loopcity_cells_" + zoneTag(o.zones),
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::27700" } },
      features: feats
    });
  }

  function cellsCSV(o) {
    o = o || {};
    var bng = o.bng !== false;
    var rows = [["id", "layer", "area_km2", "perimeter_km", "room_km",
                 bng ? "label_easting" : "label_x_m", bng ? "label_northing" : "label_y_m",
                 "built_km2", "high_km2", "mid_km2", "low_km2", "people",
                 "vfarm_km2", "field_km2", "road_km", "blobs", "year_set", "edge",
                 "stations"].join(",")];

    function addAll(rec) {
      var L = listOf(rec);
      for (var j = 0; j < L.length; j++) {
        var c = L[j], p = worldXY(c.lx, c.ly, bng);
        var t = c.tiers || { highKm2: 0, midKm2: 0, lowKm2: 0 };
        rows.push([c.id, c.layer || (rec && rec.layer) || "",
                   c.areaKm2.toFixed(3), c.perimKm.toFixed(3), c.roomKm.toFixed(2),
                   p[0].toFixed(1), p[1].toFixed(1),
                   (c.builtKm2 || 0).toFixed(3), t.highKm2.toFixed(3), t.midKm2.toFixed(3),
                   t.lowKm2.toFixed(3), Math.round(c.people || 0),
                   (c.vfarmKm2 || 0).toFixed(3), (c.fieldKm2 || 0).toFixed(3),
                   (c.roadKm || 0).toFixed(3), c.blobs || 0, c.yearSet || 0,
                   c.edge ? 1 : 0,
                   (c.stations || []).join(" ")].join(","));
      }
    }

    addAll(o.cells);
    addAll(o.cells2);
    return rows.join("\r\n") + "\r\n";
  }

  function cellsSVG(o) {
    // In map pixels, one to the sheet's own pixel. Each group opens as a layer in Illustrator.
    o = o || {};
    var W = SHEET.mapW, H = SHEET.mapH;
    var mx = (SHEET.e1 - SHEET.e0) / W;
    var L1 = listOf(o.cells), L2 = listOf(o.cells2);
    var nodes = o.nodes || [], rail = o.rail || [];
    var i, k, s;

    function d(r) {
      var str = "M" + r[0].toFixed(1) + " " + r[1].toFixed(1);
      for (var j = 2; j < r.length; j += 2) str += "L" + r[j].toFixed(1) + " " + r[j + 1].toFixed(1);
      return str + "Z";
    }

    // roads arrive in metres: put them back into map pixels so they sit on the sheet
    function dM(pts) {
      var str = "";
      for (var j = 0; j < pts.length; j += 2) {
        var px = (pts[j] - SHEET.e0) / mx;
        var py = (SHEET.n1 - pts[j + 1]) / ((SHEET.n1 - SHEET.n0) / H);
        str += (j === 0 ? "M" : "L") + px.toFixed(1) + " " + py.toFixed(1);
      }
      return str;
    }

    var railStr = "";
    for (i = 0; i < rail.length; i++) {
      s = "";
      for (k = 0; k < rail[i].length; k++) s += (k ? "L" : "M") + rail[i][k][0].toFixed(1) + " " + rail[i][k][1].toFixed(1);
      if (s) railStr += '<path d="' + s + '"/>';
    }

    function pathsM(arr) {
      var str = "";
      for (var j = 0; j < arr.length; j++) if (arr[j] && arr[j].length >= 4) str += '<path d="' + dM(arr[j]) + '"/>';
      return str;
    }

    function cellPaths(L) {
      var str = "";
      for (var j = 0; j < L.length; j++) str += '<path id="' + esc(L[j].id) + '" d="' + d(L[j].ring) + '"/>';
      return str;
    }

    function cellText(L) {
      var str = "";
      for (var j = 0; j < L.length; j++) {
        str += '<text x="' + L[j].lx.toFixed(1) + '" y="' + (L[j].ly + 22).toFixed(1) + '">' +
               esc(L[j].id + " " + L[j].areaKm2.toFixed(1) + " km2") + '</text>';
      }
      return str;
    }

    var nodeStr = "", nameStr = "";
    for (i = 0; i < nodes.length; i++) {
      nodeStr += '<circle cx="' + nodes[i].x.toFixed(1) + '" cy="' + nodes[i].y.toFixed(1) + '" r="7"/>';
      nameStr += '<text x="' + (nodes[i].x + 11).toFixed(1) + '" y="' + (nodes[i].y + 5).toFixed(1) + '">' +
                 esc(nodes[i].id) + '</text>';
    }

    // the road strokes are the declared carriageways, converted to sheet pixels, so the hierarchy
    // reads the same on the page as it does on the canvas: 35 m main, 19 m secondary
    var w1 = (num(o.roadW1, 35) / mx).toFixed(2), w2 = (num(o.roadW2, 19) / mx).toFixed(2);

    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
      '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<desc>Loop City parcels, ' + esc(o.name || "zones 05-06") + ', year ' + (o.year || "") +
      '. One unit is ' + mx.toFixed(2) + ' m.</desc>' +
      '<g id="FRAME"><rect x="0" y="0" width="' + W + '" height="' + H +
        '" fill="none" stroke="#9c968c" stroke-width="1"/></g>' +
      '<g id="RAILWAY" fill="none" stroke="#2b2925" stroke-width="2">' + railStr + '</g>' +
      '<g id="ROADS_2" fill="none" stroke="#a98f6f" stroke-width="' + w2 +
        '" stroke-linecap="round" stroke-linejoin="round">' + pathsM(o.roads2 || []) + '</g>' +
      '<g id="ROADS_1" fill="none" stroke="#5c4a34" stroke-width="' + w1 +
        '" stroke-linecap="round" stroke-linejoin="round">' + pathsM(o.roads1 || []) + '</g>' +
      '<g id="CELLS_FARM" fill="none" stroke="#8a8f6a" stroke-width="2" stroke-linejoin="round">' +
        cellPaths(L2) + '</g>' +
      '<g id="CELLS" fill="none" stroke="#e8591a" stroke-width="3" stroke-linejoin="round">' +
        cellPaths(L1) + '</g>' +
      '<g id="STATIONS" fill="#ffffff" stroke="#36322c" stroke-width="2">' + nodeStr + '</g>' +
      '<g id="STATION_NAMES" font-family="Arial, sans-serif" font-size="14" fill="#36322c">' +
        nameStr + '</g>' +
      '<g id="CELL_LABELS" font-family="Arial, sans-serif" font-size="13" fill="#a3410f" ' +
        'text-anchor="middle">' + cellText(L1) + cellText(L2) + '</g>' +
      '</svg>';
  }

  /* The one function here that touches the page, and only on a click. Guarded so the module still
     loads in a console or a test runner with no document. */
  function download(blob, base, ext) {
    if (!hasDoc()) return false;
    var t = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19), name = base + "_" + t + "." + ext;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 20000);
    /* The page says where the file went, and offers it again as a link: a browser lets a page save one
       file per press and refuses the rest without a word. The page owns that chip; this module only
       asks for it, so it still runs with no page at all. */
    var page = typeof window !== "undefined" ? window : null;
    return (page && page.saveChip) ? page.saveChip(name, blob) : true;
  }

  /* ==================================================================================================
     selfCheck()

     There is no Node on this machine, so this file cannot be run before it ships. Open the app and
     type  Cells.selfCheck()  in the console. It builds a small synthetic field with one rectangular
     road loop in it and checks the four things most likely to be quietly wrong:

       rectangle   the parcel inside the loop comes back with the true area, within 2 %
       oneRuler    doubling cellE and cellN quadruples areaKm2 and doubles roomKm, so the same
                   ruler really is driving both -- this is the check that would have caught the
                   0.035 % two-ruler bug in v5, and would catch a missed EDIT 6
       border      the ground OUTSIDE the loop touches the sheet edge, is kept, and says edge:true
       exports     DXF, GeoJSON, CSV and the .prj all build and carry the real eastings
     ================================================================================================== */

  function selfCheck() {
    var R = { pass: true, notes: [] };

    function say(name, ok, detail) {
      R[name] = ok;
      if (!ok) { R.pass = false; R.notes.push(name + ": " + detail); }
      else R.notes.push(name + " ok" + (detail ? " (" + detail + ")" : ""));
    }

    // ---- a 60 x 50 field with a one-cell road loop: the ring of cells x 8..40, y 6..34 ----------
    var SW = 60, SH = 50, i, x, y;
    var F = new Float32Array(SW * SH);
    for (x = 8; x <= 40; x++) { F[6 * SW + x] = 1; F[34 * SW + x] = 1; }
    for (y = 6; y <= 34; y++) { F[y * SW + 8] = 1; F[y * SW + 40] = 1; }
    // the ground inside the loop is x 9..39, y 7..33 -> 31 x 27 cells exactly

    function runAt(cell) {
      return extractCellsOn(F, SW, SH, {
        thr: 0.5, minKm2: 0.01, smoothM: 0, simpM: 0,
        confineMask: null, nodes: [],
        idPrefix: "C", layer: "settlement",
        cellE: cell, cellN: cell, sheetW: SW, sheetH: SH
      });
    }

    var recA = runAt(100), recB = runAt(200);
    if (!recA || !recA.list.length) { say("extract", false, "no parcels came back"); return R; }
    say("extract", true, recA.list.length + " parcels, " + recA.ms + " ms");

    // the inside parcel is the one that does not touch the edge
    function inner(rec) {
      var best = null;
      for (var j = 0; j < rec.list.length; j++) if (!rec.list[j].edge) best = rec.list[j];
      return best;
    }
    function outer(rec) {
      for (var j = 0; j < rec.list.length; j++) if (rec.list[j].edge) return rec.list[j];
      return null;
    }

    var inA = inner(recA), inB = inner(recB);
    if (!inA) { say("rectangle", false, "no closed inner parcel"); return R; }

    var trueKm2 = (31 * 100 / 1000) * (27 * 100 / 1000);           // 3.1 km x 2.7 km = 8.37 km2
    var err = Math.abs(inA.areaKm2 - trueKm2) / trueKm2;
    say("rectangle", err < 0.02,
        "area " + inA.areaKm2.toFixed(4) + " km2 vs true " + trueKm2.toFixed(4) +
        ", error " + (err * 100).toFixed(2) + " %");
    R.areaKm2 = inA.areaKm2;
    R.trueKm2 = trueKm2;

    // perimeter, as a second opinion on the same ruler
    var truePerim = 2 * (3.1 + 2.7);
    R.perimKm = inA.perimKm;
    say("perimeter", Math.abs(inA.perimKm - truePerim) / truePerim < 0.02,
        inA.perimKm.toFixed(4) + " km vs true " + truePerim.toFixed(4));

    // ---- one ruler: double the cell, area x4 and room x2 ---------------------------------------
    if (!inB) { say("oneRuler", false, "the 200 m run found no inner parcel"); }
    else {
      var aR = inB.areaKm2 / inA.areaKm2, rR = inB.roomKm / inA.roomKm;
      R.areaRatio = aR; R.roomRatio = rR;
      R.roomKm100 = inA.roomKm; R.roomKm200 = inB.roomKm;
      say("oneRuler", Math.abs(aR - 4) < 0.02 && Math.abs(rR - 2) < 0.02,
          "area ratio " + aR.toFixed(4) + " (want 4), room ratio " + rR.toFixed(4) + " (want 2)");
      // and the room itself: the 27-cell-deep block reaches 14 cells from a vein
      say("room", Math.abs(inA.roomKm - 1.4) < 0.11,
          inA.roomKm.toFixed(3) + " km at 100 m cells, want about 1.4");
    }

    // ---- the border ring: the outside is kept, and says so -------------------------------------
    var edgeCell = outer(recA);
    say("border", !!edgeCell && edgeCell.edge === true && recA.edgeCount >= 1,
        edgeCell ? (edgeCell.id + " flagged edge, " + recA.edgeCount + " of " +
                    recA.list.length + " parcels touch the sheet") : "no parcel touched the sheet");
    say("discardReported", typeof recA.discarded === "number",
        recA.discarded + " discarded as open, " + recA.discardedSmall + " under the minimum");

    // ---- ids are the prefix, and a second call does not clobber the first -----------------------
    var sinkA = null, sinkB = null;
    extractCellsOn(F, SW, SH, { thr: 0.5, minKm2: 0.01, smoothM: 0, simpM: 0, cellE: 100, cellN: 100,
      sheetW: SW, sheetH: SH, idPrefix: "C", sink: function (v) { sinkA = v; } });
    extractCellsOn(F, SW, SH, { thr: 0.5, minKm2: 0.01, smoothM: 0, simpM: 0, cellE: 200, cellN: 200,
      sheetW: SW, sheetH: SH, idPrefix: "R", sink: function (v) { sinkB = v; } });
    say("sinks", !!sinkA && !!sinkB && sinkA !== sinkB &&
        sinkA.list[0].id.charAt(0) === "C" && sinkB.list[0].id.charAt(0) === "R",
        "two calls, two records, prefixes C and R");

    // ---- an empty field says nothing rather than crashing ---------------------------------------
    var empty = extractCellsOn(new Float32Array(SW * SH), SW, SH, { thr: 0.5, cellE: 100, cellN: 100,
      sheetW: SW, sheetH: SH });
    say("emptyField", empty === null, "an unstarted mould returns null");

    // ---- the exporters build, and carry real eastings -------------------------------------------
    var roads1 = [[460000, 200000, 470000, 200000, 470000, 210000]];
    var dxf = "", gj = "", csv = "", svg = "", prj = "";
    try {
      dxf = cellsDXF({ cells: recA, cells2: null, roads1: roads1, nodes: [], rail: [] });
      gj = cellsGeoJSON({ cells: recA });
      csv = cellsCSV({ cells: recA });
      svg = cellsSVG({ cells: recA, roads1: roads1 });
      prj = prjSidecar();
    } catch (e) {
      say("exporters", false, "threw: " + e.message);
    }
    if (dxf) {
      var hasUnits = dxf.indexOf("$INSUNITS") >= 0;
      var hasRoads = dxf.indexOf("ROADS_1") >= 0 && dxf.indexOf("470000.000") >= 0;
      var hasData = dxf.indexOf("CELL_DATA") >= 0;
      var bngish = dxf.indexOf("45") >= 0 && dxf.indexOf("4527") >= 0;
      say("exporters", hasUnits && hasRoads && hasData && bngish &&
          gj.indexOf("EPSG::27700") >= 0 && csv.indexOf("built_km2") >= 0 &&
          svg.indexOf("<svg") === 0 && prj.indexOf("27700") > 0,
          "dxf " + dxf.length + " chars, geojson " + gj.length + ", csv " + csv.length +
          ", svg " + svg.length + ", prj " + prj.length);
      R.dxfBytes = dxf.length;
    }

    // ---- geojson properties actually carry the growth keys --------------------------------------
    try {
      var obj = JSON.parse(gj), pr = obj.features[0].properties;
      say("geojsonKeys",
          pr.built_km2 !== undefined && pr.high_km2 !== undefined && pr.people !== undefined &&
          pr.vfarm_km2 !== undefined && pr.field_km2 !== undefined && pr.road_km !== undefined &&
          pr.blobs !== undefined && pr.year_set !== undefined && pr.edge !== undefined,
          "every new key present");
    } catch (e2) { say("geojsonKeys", false, "unparseable: " + e2.message); }

    // ---- attachGrowth, if there is a canvas to paint into ---------------------------------------
    if (hasDoc()) {
      // the synthetic sheet is 60 x 50 "map pixels" of 100 m, so put SHEET there for the duration:
      // attachGrowth goes through worldXY, and with the real 2513 x 2288 sheet in place the parcels
      // would land 450 km away from the fake growth window. Restored in the finally, always.
      var savedSheet = { e0: SHEET.e0, n0: SHEET.n0, e1: SHEET.e1, n1: SHEET.n1,
                         mapW: SHEET.mapW, mapH: SHEET.mapH };
      try {
        // a fake growth model: everything is MED except an anti-diagonal scatter that is FIELD
        var GW = 64, GH = 64, cellm = 70;
        var fakeOut = {};
        var fakeClassAt = function (o2, ii, yy) { return (ii % 7 === 0) ? 4 : 2; };   // FIELD : MED
        var rec2 = runAt(100);
        setSheet({ e0: 0, n0: 0, e1: SW * 100, n1: SH * 100, mapW: SW, mapH: SH });
        // one road along the loop's north side: field row 6.5 -> N = 5000 - 650 = 4350
        attachGrowth(rec2, fakeClassAt, fakeOut, 2050, {
          layer: "settlement",
          growth: { W: GW, H: GH, cell: cellm, E0: 0, N1: SH * 100 },
          K: K_DEFAULT, PPK: PPK_DEFAULT,
          roads: [[900, 4350, 3900, 4350]],
          yearSet: 2043
        });
        var g2 = inner(rec2);
        R.attachBuiltKm2 = g2 ? +g2.builtKm2.toFixed(4) : null;
        R.attachFieldKm2 = g2 ? +g2.fieldKm2.toFixed(4) : null;
        R.attachPeople = g2 ? Math.round(g2.people) : null;
        R.attachRoadKm = g2 ? +g2.roadKm.toFixed(3) : null;
        R.attachBlobs = g2 ? g2.blobs : null;
        say("attachGrowth", !!g2 && g2.builtKm2 > 0 && g2.fieldKm2 > 0 && g2.people > 0 &&
            g2.yearSet === 2043 && g2.layer === "settlement" && g2.blobs >= 1 && g2.roadKm > 2.5,
            g2 ? ("built " + g2.builtKm2.toFixed(3) + " km2, field " + g2.fieldKm2.toFixed(3) +
                  ", people " + Math.round(g2.people) + ", blobs " + g2.blobs +
                  ", road " + g2.roadKm.toFixed(2) + " km (want about 3)") : "no inner parcel");
        // built + field should very nearly be the parcel's own area: the only losses are the
        // antialiased rind and the 70 m raster against a 100 m outline
        if (g2) {
          var cov = (g2.builtKm2 + g2.fieldKm2) / g2.areaKm2;
          R.attachCoverage = +cov.toFixed(4);
          say("attachCoverage", cov > 0.85 && cov < 1.15,
              "raster covers " + (cov * 100).toFixed(1) + " % of the outline's area");
        }
      } catch (e3) {
        say("attachGrowth", false, "threw: " + e3.message);
      } finally {
        setSheet(savedSheet);
      }
    } else {
      R.notes.push("attachGrowth skipped: no document");
    }

    return R;
  }

  /* ================================================================================================== */

  window.Cells = {
    // registration
    SHEET: SHEET, GROWTH: GROWTH, setSheet: setSheet, setGrowth: setGrowth,
    K: K_DEFAULT, PPK: PPK_DEFAULT,

    // the work
    extractCellsOn: extractCellsOn,
    attachGrowth: attachGrowth,

    // the eight pure helpers, exposed because the road code wants traceRings and blurField too
    traceRings: traceRings, blurField: blurField, edtTo: edtTo, fillHoles: fillHoles,
    ringArea: ringArea, ringLength: ringLength, pointInRing: pointInRing, simplifyRing: simplifyRing,

    // drawing and export
    cellsPath: cellsPath,
    worldXY: worldXY,
    networkOutline: networkOutline,
    cellsDXF: cellsDXF,
    cellsGeoJSON: cellsGeoJSON,
    cellsCSV: cellsCSV,
    cellsSVG: cellsSVG,
    prjSidecar: prjSidecar,
    zoneTag: zoneTag,
    dataLine: dataLine,
    download: download,

    selfCheck: selfCheck
  };

})();
