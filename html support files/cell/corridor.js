/* ============================================================================================
   Loop City v10 -- the green corridor: ONE band along the whole railway.

   Until v10.1 every cell drew its own corridor from the piece of rail inside it: its own width, its own
   smoothing, stopping at its own edge. Two cells side by side did not meet, and a cell whose rail runs
   along its edge (C31) got almost none. Now the corridor is one thing along the whole v12 railway
   (cell/rail_v12.js), and each cell cuts its piece out of it:

     the line     the railway smoothed over 1,250 m either side (position and direction) -- the same line
                  for every cell, so neighbouring cells' corridors meet edge to edge across the 30 m road
                  between them.
     the width    by the kind of cell (the user's sketch, 21 Sep):
                    cells around a node  (a station inside)  the node width, 2,500 m by default
                    cells in the spine   (no station)        thicker, 4,000 m by default, narrowing smoothly
                                                             to the node width over the last 2 km of
                                                             railway before a node cell -- one function of
                                                             chainage, so every cell agrees at every edge
                  A cell knows its neighbours' outlines (pack.neighbours) and the stations are the loop's
                  own (LC_RAIL.stations), so a cell gets the same corridor whether it is opened alone or
                  with its neighbours.

   Chainage is metres along the railway from P1 in the rail designer's direction. Inside a cell it is
   taken relative to the cell (rel), so a cell across P1 (chainage 0 / 412 km) has no seam.
   ============================================================================================ */
(function (root) {
  "use strict";
  var RAIL = root.LC_RAIL || null;
  var DS = 1250;                         // smoothing, m either side: the centreline is one line for all cells
  var STEP = 50;                         // band samples, m
  var TAPER = 2000;                      // spine width -> node width, m, where the rail leaves into a node cell
  var P = RAIL ? RAIL.loop : null, NP = P ? P.length : 0, C = [], T = 0;
  if (P) {
    C.push(0);
    for (var i = 1; i < NP; i++) C.push(C[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    T = C[NP - 1] + Math.hypot(P[0][0] - P[NP - 1][0], P[0][1] - P[NP - 1][1]);
  }

  function wrap(s) { return ((s % T) + T) % T; }
  // the railway at chainage s (the closing segment NP-1 -> 0 included)
  function at(s) {
    s = wrap(s);
    var lo = 0, hi = NP - 1;
    if (s >= C[NP - 1]) { lo = NP - 1; }
    else { while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (C[mid] <= s) lo = mid; else hi = mid; } }
    var a = P[lo], b = P[(lo + 1) % NP], L = (lo === NP - 1 ? T : C[lo + 1]) - C[lo], t = L > 0 ? (s - C[lo]) / L : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // the corridor's centreline at chainage s: position and direction, both smoothed over DS
  function centre(s) {
    var px = 0, py = 0;
    for (var k = -4; k <= 4; k++) { var q = at(s + k * DS / 4); px += q[0]; py += q[1]; }
    var a = at(s - DS), b = at(s + DS), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    var t = [dx / d, dy / d];
    return { p: [px / 9, py / 9], t: t, n: [-t[1], t[0]] };           // n: left of the railway's direction
  }

  /* 22 Sep: THE GREEN CORRIDOR APP'S EDGES. "We use this polyline ... so the green spine is not a direct offset of
     the railway but thicker and thinner based on the context conditions." The Green Corridor Simulator
     (03_Growth Simulator/03_App/v13, "Extract polyline") measures the corridor it grew on each side of the railway
     and writes its two edges; build/build_corridor_js.py gives every edge point its chainage on this railway
     (cell/corridor_edges.js, window.LC_GREEN). The band is then read straight off them: at chainage s, the edge
     point opposite s on each side. The railway stays the spine -- the threads start from it -- and each side has its
     own width, from nothing (a town or water beside the line) to 2 km (at the nodes). "out" is outside the loop,
     which is the railway's left (the loop runs clockwise), so it is the band's L and "in" its Rt.
     setMode("fixed") gives back the old band (the two widths below) for comparison. */
  function prepEdge(E) {
    if (!E || !E.s || !E.p || E.s.length !== E.p.length || E.s.length < 4) return null;
    for (var i = 1; i < E.s.length; i++) if (E.s[i] < E.s[i - 1]) return null;       // folds: cannot be read by chainage
    return { s: E.s, p: E.p, n: E.s.length };
  }
  var GREEN = null;
  (function () {
    var G = root.LC_GREEN;
    if (!G || !P) return;
    var o = prepEdge(G.out), n = prepEdge(G["in"]);
    if (o && n && Math.abs((G.lengthM || T) - T) < 5) GREEN = { out: o, "in": n, source: G.source || "", year: G.year, maxHalf: +G.maxHalfM || 2000 };
  })();
  var MODE = GREEN ? "green" : "fixed";
  function setMode(m) { MODE = (m === "green" && GREEN) ? "green" : "fixed"; return MODE; }
  // the edge point opposite chainage s: between the two edge points whose chainage brackets s (across P1 as well)
  function edgePt(E, s) {
    s = wrap(s);
    var S = E.s, N = E.n, a, b, sa, sb;
    if (s < S[0] || s >= S[N - 1]) { a = N - 1; b = 0; sa = S[N - 1]; sb = S[0] + T; if (s < S[0]) s += T; }
    else {
      var lo = 0, hi = N - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; }
      a = lo; b = hi; sa = S[lo]; sb = S[hi];
    }
    var t = sb > sa ? (s - sa) / (sb - sa) : 0, pa = E.p[a], pb = E.p[b];
    return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
  }
  // each side's width at chainage s, metres: out (left, L) and in (right, Rt)
  function greenAt(s) {
    var p = at(s), L = edgePt(GREEN.out, s), Rt = edgePt(GREEN["in"], s);
    return { p: p, L: L, Rt: Rt, wL: Math.hypot(L[0] - p[0], L[1] - p[1]), wR: Math.hypot(Rt[0] - p[0], Rt[1] - p[1]) };
  }

  function inPoly(R, x, y) {
    var c = false;
    for (var i = 0, j = R.length - 1; i < R.length; j = i++) {
      var a = R[i], b = R[j];
      if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
    }
    return c;
  }
  function ringOf(r) { var R = r.slice(); if (R.length > 3 && R[0][0] === R[R.length - 1][0] && R[0][1] === R[R.length - 1][1]) R.pop(); return R; }
  function bboxOf(R) { var b = [1e300, 1e300, -1e300, -1e300]; R.forEach(function (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); }); return b; }
  function segX(p, q, a, b) {          // intersection of segments pq and ab: {t along pq, u along ab} or null
    var rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    var t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
    return (t >= 0 && t < 1 && u >= 0 && u <= 1) ? { t: t, u: u } : null;
  }
  function distToRing(R, x, y) {
    var best = Infinity;
    for (var i = 0; i < R.length; i++) {
      var a = R[i], b = R[(i + 1) % R.length], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      var t = l2 > 0 ? ((x - a[0]) * vx + (y - a[1]) * vy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      var d = Math.hypot(a[0] + vx * t - x, a[1] + vy * t - y); if (d < best) best = d;
    }
    return best;
  }

  /* The railway around one ring (BNG): the rail points near it, their chainage relative to the cell
     (rel, in (-T/2, T/2], zero at the rail point nearest the ring's middle), and the rail's crossings of the
     ring, in order along the railway. */
  function railAround(ring, reach) {
    var R = ringOf(ring), bb = bboxOf(R), m = reach || 6000;
    var cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, best = Infinity, s0 = 0, near = [];
    for (var i = 0; i < NP; i++) {
      var q = P[i];
      if (q[0] < bb[0] - m || q[0] > bb[2] + m || q[1] < bb[1] - m || q[1] > bb[3] + m) continue;
      near.push(i);
      var d = Math.hypot(q[0] - cx, q[1] - cy); if (d < best) { best = d; s0 = C[i]; }
    }
    function rel(s) { return wrap(s - s0 + T / 2) - T / 2; }
    var cross = [];
    near.forEach(function (i) {
      var a = P[i], b = P[(i + 1) % NP], L = (i === NP - 1 ? T : C[i + 1]) - C[i];
      for (var k = 0; k < R.length; k++) {
        var h = segX(a, b, R[k], R[(k + 1) % R.length]);
        if (h) cross.push({ r: rel(C[i] + h.t * L), p: [a[0] + (b[0] - a[0]) * h.t, a[1] + (b[1] - a[1]) * h.t], k: k, u: h.u });
      }
    });
    cross.sort(function (x, y) { return x.r - y.r; });
    // after each crossing, is the railway inside the ring?
    cross.forEach(function (x) { var q = at(s0 + x.r + 5); x.into = inPoly(R, q[0], q[1]); });
    var rs = near.map(function (i) { return rel(C[i]); });
    return { R: R, bb: bb, s0: s0, rel: rel, cross: cross, near: near, rs: rs };
  }

  // which stations lie inside a ring
  function stationsIn(ring) {
    if (!RAIL) return [];
    var R = ringOf(ring);
    return RAIL.stations.filter(function (s) { return inPoly(R, s.E, s.N); });
  }
  // a cell around a node has a station in it; a cell in the spine has none but the corridor reaches it
  function kindOf(pack, wSpine) {
    if ((pack.stations && pack.stations.length) || pack.centre || stationsIn(pack.ring).length) return "node";
    if (!RAIL) return "none";
    var A = railAround(pack.ring), R = A.R, reach = (wSpine || 4000) / 2;
    if (A.cross.length) return "spine";
    for (var i = 0; i < A.near.length; i++) {
      var q = P[A.near[i]];
      if (inPoly(R, q[0], q[1])) return "spine";
      // the green corridor reaches the cell where the corridor on the side facing it is wider than the gap
      var dq = distToRing(R, q[0], q[1]);
      if (MODE === "green") {
        if (dq > GREEN.maxHalf) continue;
        var g = greenAt(C[A.near[i]]);
        if (inPoly(R, g.L[0], g.L[1]) || inPoly(R, g.Rt[0], g.Rt[1]) || dq < Math.max(g.wL, g.wR) * 0.98) return "spine";
      } else if (dq < reach) return "spine";
    }
    return "none";
  }

  /* The corridor's width along the railway -- ONE function of chainage, the same whichever cell asks:
       inside a node cell's stretch of railway (a cell with a station in it)   the node width;
       elsewhere, at distance d along the railway from the nearest node cell   the node width, widening smoothly
                                                                              to the spine width at d = TAPER.
     So a spine cell narrows towards a node cell even when another spine cell lies in between (C61 -> C64 -> C43:
     C64 holds only 0.8 km of railway), and two neighbouring spine cells always agree at their edge. A spine cell
     finds the node cells near it among its neighbours (pack.neighbours: outlines of the cells around it, several
     km out), and the stretch of railway each holds is where the railway crosses its outline. */
  function widthFor(pack, A, kind, wNode, wSpine) {
    /* the node stretches of railway near this cell: its own (if it is a node cell) and every neighbour's with a
       station inside -- then the same function for every cell, node cells included: the corridor's EDGES cross
       a boundary at other chainages than the rail does, so a node cell's band must widen beyond its own stretch
       exactly as its spine neighbour's does, or the edges would jog there (review, 21 Sep) */
    var spans = [], tapers = [];
    function addSpans(R2, id) {
      var xs = [];
      A.near.forEach(function (i) {
        var a = P[i], b = P[(i + 1) % NP], L = (i === NP - 1 ? T : C[i + 1]) - C[i];
        for (var k = 0; k < R2.length; k++) {
          var h = segX(a, b, R2[k], R2[(k + 1) % R2.length]);
          if (h) xs.push(A.rel(C[i] + h.t * L));
        }
      });
      if (!xs.length) return;
      xs.sort(function (x, y) { return x - y; });
      var open = null;
      xs.forEach(function (r) {
        var q = at(A.s0 + r + 5), into = inPoly(R2, q[0], q[1]);
        if (into) open = r;
        else { spans.push([open === null ? -Infinity : open, r, id]); open = null; }
      });
      if (open !== null) spans.push([open, Infinity, id]);
    }
    if (kind === "node") addSpans(A.R, pack.id);
    (pack.neighbours || []).forEach(function (nb) { if (nb.ring && stationsIn(nb.ring).length) addSpans(ringOf(nb.ring), nb.id); });
    function smooth(u) { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
    function fn(r) {
      var d = Infinity;
      for (var k = 0; k < spans.length; k++) {
        var sp = spans[k];
        if (r >= sp[0] && r <= sp[1]) return wNode;
        d = Math.min(d, r < sp[0] ? sp[0] - r : r - sp[1]);
      }
      return wNode + (wSpine - wNode) * smooth(d / TAPER);
    }
    // the node cells whose narrowing reaches this cell's railway, for the note
    if (kind === "spine") A.cross.forEach(function (x) {
      spans.forEach(function (sp) {
        var d = x.r < sp[0] ? sp[0] - x.r : x.r > sp[1] ? x.r - sp[1] : 0;
        if (d < TAPER && tapers.indexOf(sp[2]) < 0) tapers.push(sp[2]);
      });
    });
    // stations the railway passes near this cell whose cell is not among its neighbours: the width there is a guess
    var unknown = [];
    if (RAIL) RAIL.stations.forEach(function (st) {
      var r = A.rel(st.s), covered = spans.some(function (sp) { return r >= sp[0] && r <= sp[1]; });
      if (!covered && A.rs.length && r > A.rs[0] - TAPER && r < A.rs[A.rs.length - 1] + TAPER && Math.abs(r) < 12000) unknown.push(st.id);
    });
    return { fn: fn, tapers: tapers.map(function (id) { return { id: id }; }), spans: spans, unknown: unknown };
  }

  /* The band for one cell, BNG: sampled every STEP m over the stretch of railway that comes within the
     widest half-width of the ring, and one taper length beyond. Each sample: rel chainage, centre, left
     normal, width, and the two edges. */
  function bandFor(pack, opt) {
    if (!RAIL) return null;
    if (MODE === "green") return greenBand(pack, opt);
    var wNode = opt.corridorM || 2500, wSpine = opt.corridorSpineM || 4000;
    var kind = opt.kind || kindOf(pack, wSpine), A = railAround(pack.ring), R = A.R;
    var W = widthFor(pack, A, kind, wNode, wSpine), half = Math.max(wNode, wSpine) / 2;
    var lo = Infinity, hi = -Infinity;
    A.near.forEach(function (i, k) {
      var q = P[i];
      if (inPoly(R, q[0], q[1]) || distToRing(R, q[0], q[1]) < half + 300) { lo = Math.min(lo, A.rs[k]); hi = Math.max(hi, A.rs[k]); }
    });
    if (!isFinite(lo)) return { kind: kind, samples: [], cross: A.cross, s0: A.s0, tapers: W.tapers };
    lo -= Math.max(half, TAPER); hi += Math.max(half, TAPER);
    var S = [];
    for (var r = lo; r <= hi + 1e-6; r += STEP) {
      var c = centre(A.s0 + r), w = W.fn(r);
      S.push({ r: r, p: c.p, t: c.t, n: c.n, w: w,
               L: [c.p[0] + c.n[0] * w / 2, c.p[1] + c.n[1] * w / 2], Rt: [c.p[0] - c.n[0] * w / 2, c.p[1] - c.n[1] * w / 2] });
    }
    return { kind: kind, samples: S, cross: A.cross, s0: A.s0, rel: A.rel, tapers: W.tapers, widthAt: W.fn, unknownStations: W.unknown,
             wNode: wNode, wSpine: wSpine, left: S.map(function (q) { return q.L; }), right: S.map(function (q) { return q.Rt; }) };
  }

  /* The band from the green corridor app's edges: the same window and the same sample every STEP m as the fixed
     band, so everything that reads a band reads this one; p is the railway itself (the edges were measured from
     it), t and n the smoothed direction, and each side carries its own width, wL (out) and wR (in). */
  function greenBand(pack, opt) {
    var half = GREEN.maxHalf;
    var kind = opt.kind || kindOf(pack), A = railAround(pack.ring), R = A.R;
    var lo = Infinity, hi = -Infinity;
    A.near.forEach(function (i, k) {
      var q = P[i];
      if (inPoly(R, q[0], q[1]) || distToRing(R, q[0], q[1]) < half + 300) { lo = Math.min(lo, A.rs[k]); hi = Math.max(hi, A.rs[k]); }
    });
    if (!isFinite(lo)) return { kind: kind, samples: [], cross: A.cross, s0: A.s0, tapers: [], source: "green" };
    lo -= Math.max(half, TAPER); hi += Math.max(half, TAPER);
    var S = [];
    for (var r = lo; r <= hi + 1e-6; r += STEP) {
      var s = A.s0 + r, c = centre(s), g = greenAt(s);
      S.push({ r: r, p: g.p, t: c.t, n: c.n, w: g.wL + g.wR, wL: g.wL, wR: g.wR, L: g.L, Rt: g.Rt });
    }
    return { kind: kind, samples: S, cross: A.cross, s0: A.s0, rel: A.rel, tapers: [], unknownStations: [],
             source: "green", sourceFile: GREEN.source, year: GREEN.year, maxHalf: half,
             left: S.map(function (q) { return q.L; }), right: S.map(function (q) { return q.Rt; }) };
  }

  // the band sample interpolated at rel chainage r (BNG)
  function sampleAt(band, r) {
    var S = band.samples; if (!S.length) return null;
    var k = Math.max(0, Math.min(S.length - 2, Math.floor((r - S[0].r) / STEP)));
    var a = S[k], b = S[k + 1], t = Math.max(0, Math.min(1, (r - a.r) / ((b.r - a.r) || 1)));
    function mix(x, y) { return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t]; }
    var n = mix(a.n, b.n), dn = Math.hypot(n[0], n[1]) || 1, w = a.w + (b.w - a.w) * t;
    // each side's width: the green corridor's own, or half the fixed band's
    var wL = a.wL !== undefined ? a.wL + (b.wL - a.wL) * t : w / 2, wR = a.wR !== undefined ? a.wR + (b.wR - a.wR) * t : w / 2;
    return { r: r, p: mix(a.p, b.p), n: [n[0] / dn, n[1] / dn], t: [n[1] / dn, -n[0] / dn], w: w, wL: wL, wR: wR, L: mix(a.L, b.L), Rt: mix(a.Rt, b.Rt) };
  }
  // rel chainage of the band sample nearest a point (BNG)
  function relNear(band, q) {
    var S = band.samples, best = Infinity, bi = 0;
    for (var i = 0; i < S.length; i++) { var d = Math.hypot(S[i].p[0] - q[0], S[i].p[1] - q[1]); if (d < best) { best = d; bi = i; } }
    // refine along the neighbouring segments
    var r = S[bi].r;
    [bi - 1, bi].forEach(function (k) {
      if (k < 0 || k + 1 >= S.length) return;
      var a = S[k].p, b = S[k + 1].p, vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      var t = l2 > 0 ? ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      var d = Math.hypot(a[0] + vx * t - q[0], a[1] + vy * t - q[1]);
      if (d <= best + 1e-9) { best = d; r = S[k].r + t * (S[k + 1].r - S[k].r); }
    });
    return { r: r, d: best };
  }
  // where one edge of the band ('L' or 'Rt') crosses the ring: [{r, p, k (ring segment), u}]
  function edgeCrossings(band, ring, which) {
    var R = ringOf(ring), S = band.samples, out = [];
    for (var i = 0; i + 1 < S.length; i++) {
      var a = S[i][which], b = S[i + 1][which];
      for (var k = 0; k < R.length; k++) {
        var h = segX(a, b, R[k], R[(k + 1) % R.length]);
        if (h) out.push({ r: S[i].r + h.t * (S[i + 1].r - S[i].r), p: [a[0] + (b[0] - a[0]) * h.t, a[1] + (b[1] - a[1]) * h.t], k: k, u: h.u });
      }
    }
    out.sort(function (x, y) { return x.r - y.r; });
    return out;
  }

  root.LoopCorridor = {
    ready: !!RAIL, lengthM: T, DS: DS, STEP: STEP, TAPER: TAPER,
    at: at, centre: centre, railAround: railAround, stationsIn: stationsIn, kindOf: kindOf,
    bandFor: bandFor, sampleAt: sampleAt, relNear: relNear, edgeCrossings: edgeCrossings, inPoly: inPoly,
    // 22 Sep: the green corridor app's edges, when cell/corridor_edges.js is there
    green: GREEN ? { source: GREEN.source, year: GREEN.year, maxHalf: GREEN.maxHalf } : null,
    mode: function () { return MODE; }, setMode: setMode, greenAt: function (s) { return GREEN ? greenAt(s) : null; }
  };
})(window);
