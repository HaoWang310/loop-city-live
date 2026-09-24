/* ============================================================================================
   parcels.js : the parcel boundary, made once and shared.

   Three faults, and they were one fault.

   1. THE OVERLAPS. smoothParcelRings() smoothed every parcel on its own. Two neighbours share a
      boundary, but each held its own copy of it - walked in the opposite direction, started at a
      different vertex, sitting inside a different ring. Douglas-Peucker splits that shared run at
      different places depending on what else is in the ring, so the two smoothed copies of ONE
      road came out different and crossed. Gaps on the other side of the same corner.

      The fix is not a better smoother. It is to smooth the EDGE, once, in the graph, and only
      then read the faces: both neighbours are then handed the same polyline because it IS the
      same polyline. Overlaps stop being tuned away and become impossible.

      The endpoints are copied verbatim, never recomputed. graph.js says why, and it is worth
      repeating: if smoothing moves a junction by a floating-point hair the two edges that met
      there no longer meet, the face traversal walks off into the wrong ring, and the parcel
      comes back wrong with no error at all.

   2. THE HALF LINE. A face of the centreline graph is bounded BY the centreline, so every parcel
      owned half of the carriageway on each side. inset() pulls the ring in by half the road
      width, which puts its edge at the kerb and makes the parcel the land the road wraps around
      - the rule this app was built on. Two neighbours pull back from the same centreline by the
      same amount, so they end up parallel with a full road width between them.

   3. THE BENDS. Chaikin cuts a fixed FRACTION off a corner, so a hard junction is still hard
      after six passes and the only way to soften it is to soften everything. fillet() rounds a
      corner to a RADIUS IN METRES instead, which is the control that means something on a plan.
      Every corner's movement is capped at the inset distance, so a fillet can never spend the
      gap that step 2 just opened: two parcels a road apart cannot be brought together by it.

   Coordinates: CELL units, cell centres, exactly as roads.js and graph.js. Metres are the
   caller's business.
   ============================================================================================ */
(function (root) {
  "use strict";

  var EPS = 1e-9;
  /* The most points one road is allowed to carry after smoothing. A parcel boundary is a
     chain of these, and every pair of them is tested for crossing afterwards, so an edge
     that runs away takes the whole extraction with it. */
  var MAX_EDGE_PTS = 400;

  /* Diagnostics from the last call. The panel reads these; no geometry depends on them. */
  var stats = {
    edgesSmoothed: 0, ptsBefore: 0, ptsAfter: 0,
    insetTried: 0, insetOk: 0, insetRefused: 0,
    filletCorners: 0, filletSkipped: 0, budgetStops: 0,
    clampMoved: 0, containMoved: 0, fingersCut: 0, minClear: Infinity
  };

  /* ---------------------------------------------------------------------------- flat <-> pairs */

  /* A ring arrives closed - last point repeated - and every operation here wants it open, because
     a closed ring with a duplicated vertex has one corner that is two corners. */
  function openOf(ring) {
    var P = [], i, n = ring.length >> 1, x, y;
    for (i = 0; i < n; i++) {
      x = ring[2 * i]; y = ring[2 * i + 1];
      if (P.length && Math.abs(P[P.length - 1][0] - x) < EPS && Math.abs(P[P.length - 1][1] - y) < EPS) continue;
      P.push([x, y]);
    }
    while (P.length > 1 &&
           Math.abs(P[0][0] - P[P.length - 1][0]) < EPS &&
           Math.abs(P[0][1] - P[P.length - 1][1]) < EPS) P.pop();
    return P;
  }

  function flatOf(P) {
    var r = new Float64Array(P.length * 2 + 2), i;
    for (i = 0; i < P.length; i++) { r[2 * i] = P[i][0]; r[2 * i + 1] = P[i][1]; }
    r[2 * P.length] = P[0][0];
    r[2 * P.length + 1] = P[0][1];
    return r;
  }

  /* The same shoelace as graph.js, so a sign here means what a sign there means. */
  function areaOf(P) {
    var s = 0, i, n = P.length, j;
    for (i = 0; i < n; i++) { j = (i + 1) % n; s += P[i][0] * P[j][1] - P[j][0] * P[i][1]; }
    return s / 2;
  }

  /* First point repeated as the last, once and exactly. A ring that merely ends near where it
     began is not a closed polyline, and Rhino will say so. */
  function closeExact(ring) {
    var P = openOf(ring);
    if (P.length < 3) return ring;
    return flatOf(P);
  }

  /* ------------------------------------------------------------------- 1 . smooth the edges */

  /* The endpoints are COPIED from the original, not trusted to survive. */
  function pinEnds(p, o) {
    var q = new Float64Array(p.length), i;
    for (i = 0; i < p.length; i++) q[i] = p[i];
    if (q.length >= 4 && o.length >= 4) {
      q[0] = o[0]; q[1] = o[1];
      q[q.length - 2] = o[o.length - 2];
      q[q.length - 1] = o[o.length - 1];
    }
    return q;
  }

  /* A copy of the graph with every edge's polyline simplified and then corner-cut, pinned at both
     junctions. Everything else is carried through untouched - and angA / angB in particular, which
     are the angles the SKELETON left at. faces() sorts the half-edges by those, not by the angle
     the drawn line appears to leave at, so they must not be recomputed from the smoothed points or
     the rotation system changes and the faces change with it. */
  function smoothGraph(g, simpCells, passes) {
    stats.edgesSmoothed = 0; stats.ptsBefore = 0; stats.ptsAfter = 0; stats.budgetStops = 0;
    if (!g) return g;
    var hasRoads = (typeof root.Roads !== "undefined" && root.Roads.simplify);
    var hasChaik = (typeof root.RoadGraph !== "undefined" && root.RoadGraph.chaikinPinned);

    var edges = [], i, e, p, raw;
    for (i = 0; i < g.edges.length; i++) {
      e = g.edges[i];
      /* Always from the ORIGINAL points, never from the last smoothed ones. The two sliders are
         live, and a smoother applied on top of itself compounds: drag the smoothing up and back
         down again and without this the road never returns to where it was. rawPts is carried
         through every derived graph for exactly that reason - including the ones hand-editing
         makes by deleting an edge. */
      raw = e.rawPts || e.pts;
      p = raw;
      stats.ptsBefore += raw.length >> 1;
      if (simpCells > 0 && hasRoads) p = root.Roads.simplify(p, simpCells);
      /* Chaikin DOUBLES the point count every pass. Run to the slider's number without a budget
         a twelve-pass road is four thousand times the points it started with, and the page stops
         - which is exactly what it did the first time this ceiling was raised. It converges on
         its quadratic B-spline after four or five passes anyway, so a pass that would take the
         edge past the budget is a pass that buys nothing and costs everything. */
      /* A spline through the simplified points, not six rounds of corner-cutting on them. The
         two are not the same thing and the difference is the whole of the faceting: Chaikin cuts
         a fixed FRACTION off each corner and doubles the point count doing it, so a road is a
         polygon with its points shaved off however long you run it. A centripetal Catmull-Rom
         passes through every one of the same points and is a curve at the first pass, at a
         bounded number of samples. `passes` is now how far to go from the chords toward that
         curve, 0 to 6, which is the dial a road actually wants. */
      if (passes > 0) {
        p = curveOpen(p, 0.35, Math.min(1, passes / 6));
        if ((p.length >> 1) > MAX_EDGE_PTS) {
          stats.budgetStops++;
          if (hasRoads) p = root.Roads.simplify(p, 0.05);
        }
      }
      p = pinEnds(p, raw);
      stats.ptsAfter += p.length >> 1;
      stats.edgesSmoothed++;
      edges.push({ id: i, src: e.src, a: e.a, b: e.b, pts: p, rawPts: raw,
                   lengthCells: e.lengthCells,
                   dangling: e.dangling, angA: e.angA, angB: e.angB });
    }
    /* Rebuilt rather than copied: a loop edge puts its id in the node's list TWICE and adds 2 to
       the degree, because a loop really does leave the node twice. */
    var lists = [], deg = [], nodes = [];
    for (i = 0; i < g.nodes.length; i++) { lists.push([]); deg.push(0); }
    edges.forEach(function (ed) {
      lists[ed.a].push(ed.id); deg[ed.a]++;
      lists[ed.b].push(ed.id); deg[ed.b]++;
    });
    for (i = 0; i < g.nodes.length; i++) {
      nodes.push({ id: i, src: g.nodes[i].src, x: g.nodes[i].x, y: g.nodes[i].y,
                   deg: deg[i], edges: lists[i] });
    }
    return { nodes: nodes, edges: edges, w: g.w, h: g.h, stats: g.stats };
  }

  /* ------------------------------------------------------------------------- 2 . inset */

  /* One side of the question: which way is in. Rather than reason about whether a positive
     shoelace is clockwise on a screen whose y runs downward - which is exactly the kind of
     reasoning that is right in the head and wrong in the file - this offsets BOTH ways and keeps
     the one whose area went down. */
  function offsetOnce(P, d, s) {
    var n = P.length, N = [], out = [], i, j, dx, dy, L;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      dx = P[j][0] - P[i][0]; dy = P[j][1] - P[i][1];
      L = Math.sqrt(dx * dx + dy * dy);
      if (L < EPS) { N.push(null); continue; }
      dx /= L; dy /= L;
      N.push([s * -dy, s * dx, dx, dy]);          // normal x, normal y, direction x, direction y
    }
    for (i = 0; i < n; i++) {
      var a = N[(i - 1 + n) % n], b = N[i];
      if (!a && !b) { out.push([P[i][0], P[i][1]]); continue; }
      if (!a) a = b;
      if (!b) b = a;
      var ax = P[i][0] + d * a[0], ay = P[i][1] + d * a[1];
      var bx = P[i][0] + d * b[0], by = P[i][1] + d * b[1];
      var cross = a[2] * b[3] - a[3] * b[2];
      if (Math.abs(cross) < 1e-7) { out.push([(ax + bx) / 2, (ay + by) / 2]); continue; }
      var t = ((bx - ax) * b[3] - (by - ay) * b[2]) / cross;
      var X = ax + t * a[2], Y = ay + t * a[3];
      /* A sharp corner throws the two offset lines' intersection a long way out. Mitred to three
         times the inset: past that the spike is longer than the thing it belongs to. */
      var mx = X - P[i][0], my = Y - P[i][1], m = Math.sqrt(mx * mx + my * my), lim = d * 3;
      if (m > lim && m > EPS) { X = P[i][0] + mx / m * lim; Y = P[i][1] + my / m * lim; }
      out.push([X, Y]);
    }
    return out;
  }

  /* Where the ring is narrower than twice the inset, the two sides cross and the offset folds
     back on itself. A folded segment runs the opposite way to the one it came from, so it can be
     found by the sign of the dot product and dropped. */
  function unfold(P, Q) {
    var n = Q.length, keep = [], i, j, ux, uy, vx, vy;
    if (n !== P.length) return Q;
    for (i = 0; i < n; i++) {
      j = (i + 1) % n;
      ux = P[j][0] - P[i][0]; uy = P[j][1] - P[i][1];
      vx = Q[j][0] - Q[i][0]; vy = Q[j][1] - Q[i][1];
      if (ux * vx + uy * vy < 0) continue;        // this segment turned round: leave its start out
      keep.push(Q[i]);
    }
    return keep.length >= 3 ? keep : Q;
  }

  /* Does the ring cross itself? A ring that does is not a parcel whatever its area says, and on
     a shape narrower than twice the inset unfold() alone will not always catch it - the first
     write of this refused a 6-wide sliver by area and let through a ring of area 5,720 where the
     original was 1,200. Neighbouring segments share an endpoint and are skipped; everything else
     is tested properly. O(n^2), so it is capped and a ring past the cap is refused rather than
     passed unchecked. Refusing is the safe answer: the caller keeps the centreline ring. */
  function selfCrosses(P) {
    var n = P.length, i, j;
    if (n > 800) return true;
    for (i = 0; i < n; i++) {
      var a1 = P[i], a2 = P[(i + 1) % n];
      for (j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;          // first and last share a vertex
        var b1 = P[j], b2 = P[(j + 1) % n];
        if (segHit(a1[0], a1[1], a2[0], a2[1], b1[0], b1[1], b2[0], b2[1])) return true;
      }
    }
    return false;
  }

  /* Pull the ring in by d (cell units). Returns null if the ring cannot take it - a parcel only a
     road wide has nothing left once both sides step back, and half a parcel is worse than a
     parcel measured to the centreline. The caller says so rather than shipping the wreckage. */
  function inset(ring, d) {
    stats.insetTried++;
    if (!(d > 0)) return ring;
    var P = openOf(ring);
    if (P.length < 3) { stats.insetRefused++; return null; }
    var A0 = areaOf(P), aA0 = Math.abs(A0);
    if (aA0 < EPS) { stats.insetRefused++; return null; }

    /* Both directions, every time, and keep the smaller. Deciding "inward" from the sign of the
       shoelace is the kind of reasoning that is right in the head and wrong in the file. */
    var Q1 = unfold(P, offsetOnce(P, d, 1));
    var Q2 = unfold(P, offsetOnce(P, d, -1));
    var a1 = Math.abs(areaOf(Q1)), a2 = Math.abs(areaOf(Q2));
    var Q = (a1 <= a2) ? Q1 : Q2;

    var A1 = areaOf(Q);
    /* Four ways this fails and all four have to be caught, because three of them come back as a
       perfectly well-formed ring with a plausible number attached to it.
         the sign flipped          - the ring turned itself inside out
         the area did not go down  - an inset that grows is not an inset
         it lost more than 85 %    - the parcel was never much wider than the road
         it crosses itself         - a figure of eight is not a parcel */
    if (A1 === 0 || (A1 > 0) !== (A0 > 0) ||
        Math.abs(A1) >= aA0 || Math.abs(A1) < 0.15 * aA0 || selfCrosses(Q)) {
      stats.insetRefused++;
      return null;
    }
    stats.insetOk++;
    return flatOf(Q);
  }

  /* ------------------------------------------------------------------------- 3 . fillet */

  /* Round every corner to radius R, and move no corner further than maxMove.

     The cap is the whole reason a fillet is safe here, and it is worth writing down why one road
     width is the right number rather than half of one.

     Take any vertex on the boundary between two parcels. One of them sees it as a convex corner
     and the other as a reflex one - they are the same corner from opposite sides - and a fillet
     rounds a convex corner INWARD and fills a reflex one, which on a shared boundary is the same
     direction for both. The two boundaries shift together and the gap between them is unchanged.
     At a junction the same holds: the interior angles round a node sum to 360 degrees, so at most
     one of the faces meeting there can be reflex, and only that one moves toward its neighbour.
     One road width is therefore a cap the geometry cannot spend.

     A corner too sharp for the radius asked for simply gets the largest radius that fits inside
     its budget. Nothing is refused; the corner is only rounded less. */
  function fillet(ring, R, maxMove) {
    if (!(R > 0)) return ring;
    var P = openOf(ring), n = P.length;
    if (n < 3) return ring;
    var out = [], i, STEP = Math.PI / 22;

    for (i = 0; i < n; i++) {
      var p = P[i], a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      var ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1];
      var lu = Math.sqrt(ux * ux + uy * uy), lv = Math.sqrt(vx * vx + vy * vy);
      if (lu < EPS || lv < EPS) { out.push([p[0], p[1]]); stats.filletSkipped++; continue; }
      ux /= lu; uy /= lu; vx /= lv; vy /= lv;

      var cosT = ux * vx + uy * vy;
      if (cosT > 1) cosT = 1; else if (cosT < -1) cosT = -1;
      var theta = Math.acos(cosT);                       // the angle between the two legs, 0..pi
      if (theta > Math.PI - 0.12) { out.push([p[0], p[1]]); stats.filletSkipped++; continue; }

      var half = theta / 2, sh = Math.sin(half), th = Math.tan(half);
      if (sh < EPS || th < EPS) { out.push([p[0], p[1]]); stats.filletSkipped++; continue; }

      /* the radius that spends exactly the movement budget, if that is less than the one asked for */
      var rEff = R, k = 1 / sh - 1;
      if (k > 1e-6 && maxMove > 0) rEff = Math.min(rEff, maxMove / k);
      var t = rEff / th;
      t = Math.min(t, 0.45 * lu, 0.45 * lv);             // never eat more than half a leg
      rEff = t * th;
      if (t < 1e-6 || rEff < 1e-6) { out.push([p[0], p[1]]); stats.filletSkipped++; continue; }

      var bx = ux + vx, by = uy + vy, lb = Math.sqrt(bx * bx + by * by);
      if (lb < EPS) { out.push([p[0], p[1]]); stats.filletSkipped++; continue; }
      bx /= lb; by /= lb;
      var dc = rEff / sh, C = [p[0] + bx * dc, p[1] + by * dc];

      var p1 = [p[0] + ux * t, p[1] + uy * t], p2 = [p[0] + vx * t, p[1] + vy * t];
      var a1 = Math.atan2(p1[1] - C[1], p1[0] - C[0]);
      var a2 = Math.atan2(p2[1] - C[1], p2[0] - C[0]);
      var da = a2 - a1;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;

      var steps = Math.max(2, Math.ceil(Math.abs(da) / STEP)), s2;
      for (s2 = 0; s2 <= steps; s2++) {
        var ang = a1 + da * s2 / steps;
        out.push([C[0] + Math.cos(ang) * rEff, C[1] + Math.sin(ang) * rEff]);
      }
      stats.filletCorners++;
    }
    return out.length >= 3 ? flatOf(out) : ring;
  }

  /* ------------------------------------------------------------------------- measurements */

  /* Two rings overlap if any segment of one crosses any segment of the other. O(n*m) per pair and
     O(k^2) pairs, which on a hundred parcels of a few hundred points is a second - too slow to
     run on every redraw and exactly right to run once, after an extraction, to prove the claim.
     A bounding-box test first throws most pairs away before a single segment is looked at. */
  function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
    function side(x1, y1, x2, y2, x3, y3) {
      var v = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
      return v > EPS ? 1 : (v < -EPS ? -1 : 0);
    }
    var d1 = side(ax, ay, bx, by, cx, cy), d2 = side(ax, ay, bx, by, dx, dy);
    var d3 = side(cx, cy, dx, dy, ax, ay), d4 = side(cx, cy, dx, dy, bx, by);
    return (d1 * d2 < 0) && (d3 * d4 < 0);       // proper crossing only: touching is not overlapping
  }

  function bbox(r) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
    for (i = 0; i + 1 < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
    return [x0, y0, x1, y1];
  }

  function countOverlaps(rings) {
    var bs = rings.map(bbox), hits = 0, pairs = 0, i, j, k, m, bad = {};
    for (i = 0; i < rings.length; i++) {
      for (j = i + 1; j < rings.length; j++) {
        if (bs[i][2] < bs[j][0] || bs[j][2] < bs[i][0] ||
            bs[i][3] < bs[j][1] || bs[j][3] < bs[i][1]) continue;
        pairs++;
        var A = rings[i], B = rings[j], found = false;
        for (k = 0; k + 3 < A.length && !found; k += 2) {
          for (m = 0; m + 3 < B.length; m += 2) {
            if (segHit(A[k], A[k + 1], A[k + 2], A[k + 3],
                       B[m], B[m + 1], B[m + 2], B[m + 3])) { found = true; break; }
          }
        }
        if (found) { hits++; bad[i] = 1; bad[j] = 1; }
      }
    }
    /* Which ones, not only how many. A count tells the architect there is a problem; the list
       tells them where it is, and the parcels can be joined or deleted by hand from there. */
    var which = [];
    for (i = 0; i < rings.length; i++) if (bad[i]) which.push(i);
    return { crossingPairs: hits, testedPairs: pairs, which: which };
  }

  /* Every ring closed, exactly. Not "closed enough". */
  function allClosed(rings) {
    var n = 0, i, r;
    for (i = 0; i < rings.length; i++) {
      r = rings[i];
      if (r.length >= 4 && r[0] === r[r.length - 2] && r[1] === r[r.length - 1]) n++;
    }
    return n;
  }

  /* fillet() is called once per parcel, so it ACCUMULATES and the caller clears. The first write
     cleared at the top of fillet() and the panel then reported the last parcel's corners as if
     they were the whole run - five rounded, forty-one skipped, out of a hundred and nineteen
     parcels. A diagnostic that is quietly measuring one hundred and nineteenth of the thing it
     names is worse than no diagnostic. */
  function resetStats() {
    stats.insetTried = 0; stats.insetOk = 0; stats.insetRefused = 0;
    stats.filletCorners = 0; stats.filletSkipped = 0;
    stats.clampMoved = 0; stats.containMoved = 0; stats.fingersCut = 0;
    stats.minClear = Infinity;
  }

  /* ------------------------------------------------- 4 . a real curve, and room to draw it

     The architect's reading of v5.5, and it is right: the boundaries are still hard, and because
     the road is really a DOUBLE line the two sides need not be the same curve. Two things follow,
     and only together do they work.

     THE CURVE. Chaikin cuts a fixed fraction off a corner and doubles the point count doing it,
     so three passes on a Douglas-Peucker polygon is a polygon with its points shaved off - which
     is exactly what a faceted parcel looks like. A centripetal Catmull-Rom spline through the
     same points is an actual curve: it passes through every one of them, it cannot cusp or loop
     the way a uniform Catmull-Rom does on unevenly spaced points, and it costs one pass at a
     bounded number of samples instead of doubling for ever.

     THE ROOM. Curving a ring moves it, and a ring that moves can cross its neighbour or wander
     over some third road that has nothing to do with it - the fault that still bit past four
     passes in v5.5. So every point is held at least half a road width from EVERY centreline,
     measured against the actual segments and not a cell-resolution field, because half a road is
     0.2 of a 92.6 m cell and a field that coarse cannot see it. Two neighbours sit on opposite
     sides of the same line, each half a road off it, so they are a full road apart and crossing
     is arithmetically impossible. Where a parcel relaxes away from the road, the road widens
     there; where it tries to bulge in, it stops at the kerb. The road stops being a constant
     ribbon and starts behaving like a road. */

  /* Centripetal Catmull-Rom, alpha = 0.5. The knot spacing is the SQUARE ROOT of the chord
     length, which is what stops the curve looping back on itself where three points bunch up -
     the uniform version does loop there, and on a skeleton ring points bunch up constantly. */
  function crPoint(p0, p1, p2, p3, t1, t2, t3, t) {
    function lerp(a, b, ta, tb, tt) {
      var d = tb - ta;
      if (Math.abs(d) < 1e-12) return [a[0], a[1]];
      var u = (tb - tt) / d, v = (tt - ta) / d;
      return [a[0] * u + b[0] * v, a[1] * u + b[1] * v];
    }
    var A1 = lerp(p0, p1, 0, t1, t), A2 = lerp(p1, p2, t1, t2, t), A3 = lerp(p2, p3, t2, t3, t);
    var B1 = lerp(A1, A2, 0, t2, t), B2 = lerp(A2, A3, t1, t3, t);
    return lerp(B1, B2, t1, t2, t);
  }

  function knots(p0, p1, p2, p3) {
    function k(a, b, t) {
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var d = Math.pow(dx * dx + dy * dy, 0.25);       // ^(alpha/2) with alpha = 0.5
      return t + (d < 1e-9 ? 1e-9 : d);
    }
    var t1 = k(p0, p1, 0), t2 = k(p1, p2, t1), t3 = k(p2, p3, t2);
    return [t1, t2, t3];
  }

  /* An OPEN polyline - one road between two junctions - curved the same way, pinned at both ends.
     The two phantom control points are reflections of the real ones, so the curve leaves each
     junction along the line the road actually leaves it on.

     `blend` is how far to go from the straight chords toward the full spline: 0 is the simplified
     polyline exactly, 1 is the spline. It exists because the shape of a spline is fixed by its
     control points - there is no "more spline" - and a road still wants a dial between the line
     the mould drew and the line an engineer would draw through the same points. */
  function curveOpen(pts, spacing, blend) {
    var P = openOfOpen(pts), n = P.length;
    if (n < 3 || !(blend > 0)) return pts;
    var step = (spacing > 0 ? spacing : 0.3), out = [], i, j, s;
    var ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]]]
                .concat(P, [[2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]]]);
    for (i = 0; i + 3 < ext.length; i++) {
      var p0 = ext[i], p1 = ext[i + 1], p2 = ext[i + 2], p3 = ext[i + 3];
      var K = knots(p0, p1, p2, p3), t1 = K[0], t2 = K[1], t3 = K[2];
      var cx = p2[0] - p1[0], cy = p2[1] - p1[1];
      var chord = Math.sqrt(cx * cx + cy * cy);
      var m = Math.max(1, Math.min(60, Math.ceil(chord / step)));
      for (j = 0; j < m; j++) {
        var u = j / m;
        s = t1 + (t2 - t1) * u;
        var c = crPoint(p0, p1, p2, p3, t1, t2, t3, s);
        // the straight chord at the same parameter, to blend against
        out.push([p1[0] + cx * u + (c[0] - (p1[0] + cx * u)) * blend,
                  p1[1] + cy * u + (c[1] - (p1[1] + cy * u)) * blend]);
      }
    }
    out.push([P[n - 1][0], P[n - 1][1]]);
    var r = new Float64Array(out.length * 2);
    for (i = 0; i < out.length; i++) { r[2 * i] = out[i][0]; r[2 * i + 1] = out[i][1]; }
    return r;
  }

  /* like openOf, but for a line rather than a ring: duplicates are dropped, the ends are kept */
  function openOfOpen(pts) {
    var P = [], i, n = pts.length >> 1, x, y;
    for (i = 0; i < n; i++) {
      x = pts[2 * i]; y = pts[2 * i + 1];
      if (P.length && Math.abs(P[P.length - 1][0] - x) < EPS && Math.abs(P[P.length - 1][1] - y) < EPS) continue;
      P.push([x, y]);
    }
    return P;
  }

  /* A closed ring, simplified first and then curved through what is left. The simplify tolerance
     IS the smoothness control: fewer points is a looser, softer curve, more points holds tighter
     to where the mould actually put the boundary. */
  function curveRing(ring, simpCells, spacing) {
    if (!(simpCells > 0)) return ring;
    var flat = ring;
    if (typeof root.Roads !== "undefined" && root.Roads.simplify) flat = root.Roads.simplify(flat, simpCells);
    var P = openOf(flat), n = P.length;
    if (n < 4) return ring;
    var out = [], i, j, s;
    var step = (spacing > 0 ? spacing : 0.3);
    for (i = 0; i < n; i++) {
      var p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      var K = knots(p0, p1, p2, p3), t1 = K[0], t2 = K[1], t3 = K[2];
      var chord = Math.sqrt((p2[0] - p1[0]) * (p2[0] - p1[0]) + (p2[1] - p1[1]) * (p2[1] - p1[1]));
      var m = Math.max(1, Math.min(40, Math.ceil(chord / step)));
      for (j = 0; j < m; j++) {                        // p2 is emitted as the next span's p1
        s = t1 + (t2 - t1) * (j / m);
        out.push(crPoint(p0, p1, p2, p3, t1, t2, t3, s));
      }
    }
    return out.length >= 3 ? flatOf(out) : ring;
  }

  /* ------------------------------------------------------------ the corridor, as real segments */

  /* Every centreline segment, bucketed by cell, so a point can ask what is near it without
     walking the whole network. Bucket size is one cell: the query radius is a fraction of that,
     so three by three buckets always cover it. */
  function buildCorridor(graph, bucket) {
    var B = bucket > 0 ? bucket : 1.0, map = {}, i, k, e, pts, ax, ay, bx, by;
    function put(key, seg) { (map[key] || (map[key] = [])).push(seg); }
    for (i = 0; i < graph.edges.length; i++) {
      e = graph.edges[i]; pts = e.pts;
      for (k = 0; k + 3 < pts.length; k += 2) {
        ax = pts[k]; ay = pts[k + 1]; bx = pts[k + 2]; by = pts[k + 3];
        var seg = [ax, ay, bx, by];
        var x0 = Math.floor(Math.min(ax, bx) / B), x1 = Math.floor(Math.max(ax, bx) / B);
        var y0 = Math.floor(Math.min(ay, by) / B), y1 = Math.floor(Math.max(ay, by) / B);
        /* a long segment is registered in every bucket its bounding box touches; on a smoothed
           skeleton a segment is a fraction of a cell, so this is one or two buckets */
        for (var gx = x0; gx <= x1; gx++) for (var gy = y0; gy <= y1; gy++) put(gx + "," + gy, seg);
      }
    }
    return { B: B, map: map };
  }

  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = 0;
    if (L2 > 1e-18) {
      t = ((px - ax) * dx + (py - ay) * dy) / L2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
    }
    var qx = ax + t * dx, qy = ay + t * dy;
    var ex = px - qx, ey = py - qy;
    return [Math.sqrt(ex * ex + ey * ey), qx, qy, ax, ay, bx, by];
  }

  /* The nearest centreline to one point, and where on it. Rings out from the point's own bucket
     so a point far from everything still finds something rather than reporting infinity. */
  function nearestSeg(cor, px, py, want) {
    var B = cor.B, gx = Math.floor(px / B), gy = Math.floor(py / B);
    var need = Math.max(1, Math.ceil(want / B)), best = [Infinity, 0, 0, 0, 0, 0, 0], r, dx, dy, arr, i, d;
    for (r = need; r <= need + 3; r++) {
      for (dx = -r; dx <= r; dx++) {
        for (dy = -r; dy <= r; dy++) {
          if (r > need && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // only the new ring
          arr = cor.map[(gx + dx) + "," + (gy + dy)];
          if (!arr) continue;
          for (i = 0; i < arr.length; i++) {
            d = segDist(px, py, arr[i][0], arr[i][1], arr[i][2], arr[i][3]);
            if (d[0] < best[0]) best = d;
          }
        }
      }
      if (best[0] < (r - 0) * B) break;          // nothing outside this ring can beat it
    }
    return best;
  }

  /* Hold every point of the ring at least minD from every centreline. A point already outside is
     left exactly where it is - this pushes, it never pulls, so it cannot undo the curve except
     where the curve was illegal. */
  /* Split any span longer than `step` until none is. The clamp moves POINTS, so a ring whose
     points are far apart can have a long edge stride clean over a road with neither of its ends
     anywhere near it - the check caught exactly that on a square straddling a line, 30 away at
     every corner and crossing in the middle. Densifying first makes "no point is too close" mean
     "no part of the boundary is too close", which is the thing actually being promised. */
  function densify(P, step) {
    if (!(step > 0)) return P;
    var out = [], n = P.length, i, j, k, m;
    for (i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      out.push(a);
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy);
      m = Math.floor(L / step);
      if (m > 1) {
        if (m > 64) m = 64;                    // a fuse: a ring is a boundary, not a point cloud
        for (k = 1; k < m; k++) out.push([a[0] + dx * k / m, a[1] + dy * k / m]);
      }
    }
    return out;
  }

  function clampToCorridor(ring, cor, minD) {
    if (!(minD > 0) || !cor) return ring;
    var P0 = openOf(ring), n0 = P0.length, i, k, moved = 0, worst = Infinity;
    if (n0 < 3) return ring;

    /* Densify only the spans that could possibly be too close, and leave the rest whole. A span
       of length L whose MIDPOINT is further than minD + L/2 from every road cannot have any point
       within minD of one - no part of it needs splitting and no part of it needs testing. That
       keeps a boundary running well clear of everything at the handful of points it was drawn
       with, instead of shattering every ring into a point cloud for the sake of the few spans
       that are actually tight. */
    var P = [];
    for (i = 0; i < n0; i++) {
      var a = P0[i], b = P0[(i + 1) % n0];
      P.push(a);
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy);
      if (L < minD * 0.8) continue;
      /* Infinity here is not "unknown", it is an answer: nearestSeg searches at least as far as
         it was asked to, so nothing found within minD + L/2 means nothing IS within minD + L/2.
         Reading it as unknown is what had this shattering rings that were nowhere near a road. */
      var mid = nearestSeg(cor, a[0] + dx / 2, a[1] + dy / 2, minD + L / 2)[0];
      if (!isFinite(mid) || mid - L / 2 >= minD) continue;        // the whole span is clear
      var m = Math.min(256, Math.floor(L / (minD * 0.8)));
      for (k = 1; k < m; k++) P.push([a[0] + dx * k / m, a[1] + dy * k / m]);
    }

    for (i = 0; i < P.length; i++) {
      var px = P[i][0], py = P[i][1];
      var nb = nearestSeg(cor, px, py, minD), d = nb[0];
      if (!isFinite(d)) continue;
      if (d >= minD) { if (d < worst) worst = d; continue; }
      var vx = px - nb[1], vy = py - nb[2], Lv = Math.sqrt(vx * vx + vy * vy);
      if (Lv < 1e-9) {
        /* The point sits exactly ON the centreline, so it has no direction of its own. The only
           direction that helps is the ROAD's perpendicular - the ring's own normal is useless
           here and picking it is how this first came back reporting a clearance of zero: on a
           boundary running parallel to the road, the ring normal points along the road and
           pushing that way moves the point not one millimetre further from it. The side is taken
           from where the ring's neighbours are, so the boundary stays on the side it was on. */
        var sx = nb[5] - nb[3], sy = nb[6] - nb[4], sl = Math.sqrt(sx * sx + sy * sy);
        if (sl < 1e-9) continue;
        vx = -sy / sl; vy = sx / sl;
        var pa = P[(i - 1 + P.length) % P.length], pb = P[(i + 1) % P.length];
        var mx = (pa[0] + pb[0]) / 2 - px, my = (pa[1] + pb[1]) / 2 - py;
        if (mx * vx + my * vy < 0) { vx = -vx; vy = -vy; }
      } else { vx /= Lv; vy /= Lv; }
      P[i] = [nb[1] + vx * minD, nb[2] + vy * minD];
      moved++;
      if (minD < worst) worst = minD;
    }
    stats.clampMoved += moved;
    if (worst < stats.minClear) stats.minClear = worst;
    return P.length >= 3 ? flatOf(P) : ring;
  }

  /* ----------------------------------------------------------- the curve may only cut inward

     Distance to the nearest centreline is not enough on its own, and the first run proved it:
     124 parcels, 181 crossing pairs, every point of every one of them a legal half-road clear of
     SOME centreline. A spline through widely spaced points bulges outward at a corner - about an
     eighth of the chord - and a big enough bulge carries the boundary clean over the road and
     into the neighbour, where it sits happily half a road away from a DIFFERENT road. Distance
     has no idea which side of the network it is on.

     The constraint that does is containment: a smoothed boundary may not leave the face it came
     from. Two faces are disjoint by construction, so two boundaries that each stay inside their
     own cannot meet, whatever the smoother does. It also says something true about the drawing -
     smoothing a parcel gives land back to the road, it never takes road land - so the curve is
     an inward operation and the parcel can only get slightly smaller. */
  function inside(P, x, y) {
    var n = P.length, i, j, hit = false;
    for (i = 0, j = n - 1; i < n; j = i++) {
      var yi = P[i][1], yj = P[j][1];
      if ((yi > y) !== (yj > y)) {
        var xx = P[i][0] + (y - yi) / (yj - yi) * (P[j][0] - P[i][0]);
        if (x < xx) hit = !hit;
      }
    }
    return hit;
  }

  function nearestOnRing(P, x, y) {
    var n = P.length, i, best = Infinity, bx = x, by = y;
    for (i = 0; i < n; i++) {
      var d = segDist(x, y, P[i][0], P[i][1], P[(i + 1) % n][0], P[(i + 1) % n][1]);
      if (d[0] < best) { best = d[0]; bx = d[1]; by = d[2]; }
    }
    return [bx, by];
  }

  /* Hold `ring` inside `bound`. A point already inside is left exactly where it is.

     Densified first, and that is not a refinement. This tests POINTS, so a ring carrying few of
     them can have a long span sail outside between two that are both safely in - which is exactly
     what a filleted ring is, since filleting runs on a simplified copy whose vertices are metres
     apart at the corners and kilometres apart along the straights. Filleting without this put 4
     to 6 crossing pairs back at every radius. */
  function clampInside(ring, bound, step) {
    if (!ring || !bound) return ring;
    var B = openOf(bound), P = densify(openOf(ring), step > 0 ? step : 0.35), i, moved = 0;
    if (B.length < 3 || P.length < 3) return ring;
    for (i = 0; i < P.length; i++) {
      if (inside(B, P[i][0], P[i][1])) continue;
      P[i] = nearestOnRing(B, P[i][0], P[i][1]);
      moved++;
    }
    stats.containMoved += moved;
    /* If nothing was outside, hand back the ring that came in -- not the densified copy made to
       test it. Returning the dense one regardless put every cell back over the wool algorithm's
       400-vertex limit (824 points a cell), because this runs after the decimation and the extra
       points had nothing left to remove them. Densifying is for the TEST, not for the result. */
    return moved ? flatOf(P) : ring;
  }

  /* ================================================================= 5 . the cell, made smooth

     The goal changed, and with it the method: these rings are not a drawing any more, they are the
     INPUT to the wool algorithm, so they have to be smooth the way a curve is smooth - no spike
     anywhere, bounded vertex count, one closed ring - not smooth the way a picture looks smooth.

     Four things were tried before this and the measurements said none of them worked. Corner-
     cutting shaves a polygon and stays a polygon. A spline through Douglas-Peucker points is a
     real curve but inherits every badly placed point, and measured on the sharpest turn it beat
     nothing: 304 turns over 30 degrees against 162 for straight chords, and seven rings still
     carrying a 180-degree spike. Holding points half a road off the centreline does not stop a
     bulge landing in the neighbour. Containment stops that but leaves the corner it projected.

     What works on a closed curve is iterative averaging, because it attacks the thing a spike
     actually is. A spike is a point far from the average of its neighbours, so it is exactly the
     point that moves most, and it is gone in a few passes. Corner-cutting cannot do that: it
     takes the same fraction off a gentle bend and a reversal alike.

     Two constraints make it safe, and they are cheap enough to apply on every pass rather than
     once at the end - which matters, because a constraint applied once at the end is a projection
     that puts a kink back exactly where the smoother just took one out.

       outward is forbidden   a point may move inward or along the boundary, never out past where
                              it started. The ring therefore never leaves its own face, two faces
                              are disjoint, and no two cells can cross. It also says the right
                              thing: smoothing a cell gives land to the road, it never takes any.
       inward is bounded      and not by much, or a cell quietly shrinks away from the road it is
                              supposed to front.

     Uniform resampling first, because averaging is only meaningful when the points are evenly
     spaced - on a ring straight off the graph they are not, and the smoother would then pull hard
     where they bunch and not at all where they stretch. */

  function ringLength(P) {
    var L = 0, i, n = P.length;
    for (i = 0; i < n; i++) {
      var a = P[i], b = P[(i + 1) % n];
      L += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    }
    return L;
  }

  function resampleUniform(P, step, maxPts) {
    var n = P.length, L = ringLength(P);
    if (!(L > 0) || !(step > 0)) return P;
    var m = Math.max(8, Math.min(maxPts || 4000, Math.round(L / step)));
    var want = L / m, out = [], i = 0, acc = 0, cur = 0;
    var a = P[0], b = P[1 % n], segLen;
    out.push([a[0], a[1]]);
    segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (out.length < m && i < n * 4) {
      if (acc + (segLen - cur) >= want) {
        var need = want - acc, t = (cur + need) / (segLen || 1);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        cur += need; acc = 0;
      } else {
        acc += segLen - cur;
        i++;
        a = P[i % n]; b = P[(i + 1) % n];
        segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        cur = 0;
      }
    }
    return out.length >= 3 ? out : P;
  }

  /* The outward normal at each point of the ORIGINAL ring, which is what "outward" is measured
     against for the whole run. Taken from the ring's own orientation, so it is outward whichever
     way the face traversal happened to wind. */
  function outwardNormals(P) {
    var n = P.length, s = areaOf(P) > 0 ? 1 : -1, N = [], i;
    for (i = 0; i < n; i++) {
      var a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      var tx = b[0] - a[0], ty = b[1] - a[1], L = Math.sqrt(tx * tx + ty * ty);
      if (L < EPS) { N.push([0, 0]); continue; }
      N.push([s * ty / L, -s * tx / L]);
    }
    return N;
  }

  /* One closed cell, smooth, bounded, and still inside its own face.
       iters   how many averaging passes. 0 returns the ring untouched.
       maxIn   the furthest any point may end up inside where it started, in cells.
       cor     the corridor index, or null. minD is the half-road setback.
       maxPts  the vertex ceiling of the ring handed back. */
  function smoothCell(ring, iters, maxIn, cor, minD, maxPts, step) {
    if (!(iters > 0)) return ring;
    var P0 = resampleUniform(openOf(ring), step > 0 ? step : 0.35, 4000);
    var n = P0.length;
    if (n < 6) return ring;
    var N = outwardNormals(P0);
    var P = P0.map(function (p) { return [p[0], p[1]]; });
    var Q = new Array(n), i, k, t;

    for (t = 0; t < iters; t++) {
      for (i = 0; i < n; i++) {
        var a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
        /* plain averaging with a half-weight: the neighbours' midpoint, half way. A spike is the
           point furthest from that midpoint, so it is the point this moves most. */
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        var x = P[i][0] + 0.5 * (mx - P[i][0]), y = P[i][1] + 0.5 * (my - P[i][1]);

        // measured against where this point STARTED, not against the last pass
        var ux = x - P0[i][0], uy = y - P0[i][1];
        var s = ux * N[i][0] + uy * N[i][1];
        if (s > 0) { x -= s * N[i][0]; y -= s * N[i][1]; }              // never outward
        else if (s < -maxIn) {
          var over = -maxIn - s;
          x += over * N[i][0]; y += over * N[i][1];                     // and not too far in
        }
        Q[i] = [x, y];
      }
      for (i = 0; i < n; i++) { P[i][0] = Q[i][0]; P[i][1] = Q[i][1]; }
    }

    /* Blocking the outward component of each point's own movement is necessary and it is not
       sufficient: the points stay put but the LINE between two of them can still bow out over a
       concave stretch, and eleven pairs crossed that way on the first run of this. Containment
       against the ring it started from is the test that sees a bowed edge, because it asks where
       the boundary is rather than where a vertex went. */
    var raw = flatOf(P0), sm = flatOf(P);
    var out = clampInside(sm, raw);
    if (cor && minD > 0) out = clampToCorridor(out, cor, minD);
    out = clampInside(out, raw);              // the corridor clamp can push back out at a junction
    sm = out;                                 // the smooth ring, and the bound for what follows
    /* The wool algorithm simplifies anything past 400 vertices on import, and a decimation you
       did not choose is a decimation you cannot predict. Do it here, to a tolerance, so the ring
       that arrives is the ring that was drawn. */
    if (maxPts > 0 && typeof root.Roads !== "undefined" && root.Roads.simplify) {
      var tol = 0.01, guard = 0;
      while ((out.length >> 1) > maxPts && guard++ < 24) {
        out = root.Roads.simplify(out, tol);
        tol *= 1.6;
      }
      /* Simplifying cuts a chord across a bend, and across a CONCAVE bend that chord falls
         outside the ring, so containment has to run again AFTER the decimation - otherwise the
         very step that brings the cell under the wool algorithm's vertex limit is the step that
         puts it back over its neighbour.

         Against the SMOOTH ring, though, not the raw one. Projecting onto the raw ring puts a
         decimated point back on the jagged line the smoothing just took the jaggedness out of,
         and on a big cell that is most of its vertices: eight cells came back with 1,380 turns
         over thirty degrees between them that way, more than half of every boundary. The smooth
         ring is already inside the raw one, so landing on it satisfies both. */
      out = clampInside(out, sm);
      /* Containment can densify when it has to move something, so the ceiling is checked once
         more after it rather than assumed to have survived. */
      var g2 = 0, t2 = 0.01;
      while ((out.length >> 1) > maxPts && g2++ < 24) { out = root.Roads.simplify(out, t2); t2 *= 1.6; }
      out = closeExact(out);
    }
    return out;
  }

  /* ----------------------------------------------------------------------- 6 . the pimples

     The architect's word for it, and it is the right one: "a pimple from one that goes into
     another cell, making both not a smooth closed loop". A finger of one cell reaching into its
     neighbour. Neither side is a smooth ring afterwards - the one with the finger has a spike,
     the one it pokes into has a notch to match.

     No turn-angle test sees this. Every individual turn on the way out along a finger can be
     perfectly gentle; what is wrong is not any one corner but that the boundary comes BACK
     alongside itself. So the test is self-proximity: two points close together on the sheet and
     far apart along the ring. Measured on a real run, 9 of 62 cells had one.

     Cutting the finger off only ever removes area, so a cell can gain nothing and cannot newly
     reach a neighbour. The notch on the other side is left alone - filling it would make that
     cell GROW, into ground the first one has only just given up, and a fix that can grow a cell
     is a fix that can put the crossing back. What is left between them is road. */
  function removeFingers(ring, gap, alongMin, maxCutFrac) {
    if (!(gap > 0) || !(alongMin > 0)) return ring;
    var P = openOf(ring), pass, cut = 0, skip = {};
    for (pass = 0; pass < 24; pass++) {          // more sweeps, because a skip costs one
      var n = P.length;
      if (n < 12) break;
      var s = new Float64Array(n), i, j;
      for (i = 1; i < n; i++) {
        s[i] = s[i - 1] + Math.sqrt((P[i][0] - P[i - 1][0]) * (P[i][0] - P[i - 1][0]) +
                                    (P[i][1] - P[i - 1][1]) * (P[i][1] - P[i - 1][1]));
      }
      var total = s[n - 1] + Math.sqrt((P[0][0] - P[n - 1][0]) * (P[0][0] - P[n - 1][0]) +
                                       (P[0][1] - P[n - 1][1]) * (P[0][1] - P[n - 1][1]));
      var bi = -1, bj = -1, bd = gap;
      for (i = 0; i < n; i++) {
        for (j = i + 1; j < n; j++) {
          var along = Math.abs(s[j] - s[i]);
          along = Math.min(along, total - along);
          if (along < alongMin) continue;
          if (skip[i + ':' + j]) continue;       // already found un-cuttable this sweep
          var dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1];
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      if (bi < 0) break;

      /* Two arcs join the pinch. The SHORTER one is the finger; the longer one is the cell. Only
         cut when the finger is a small part of the whole, or a U-shaped cell - which is a
         perfectly good cell - would lose an arm.

         A pinch too big to cut used to end the pass for the WHOLE ring, so a cell with one
         legitimate waist kept every other finger it had. That is why exactly one spike survived
         at every setting however the thresholds were moved: the same un-cuttable pinch was
         stopping the search before it reached the real one. Skip it and keep looking instead -
         the skipped pair is remembered so the next sweep does not pick it again. */
      var inner = s[bj] - s[bi], outer = total - inner;
      var q = [], k, cuttable = true;
      if (inner <= outer) {
        if (inner > maxCutFrac * total) cuttable = false;
        else for (k = 0; k < n; k++) if (k <= bi || k >= bj) q.push(P[k]);
      } else {
        if (outer > maxCutFrac * total) cuttable = false;
        else for (k = bi; k <= bj; k++) q.push(P[k]);
      }
      if (!cuttable || q.length < 6) { skip[bi + ':' + bj] = 1; continue; }
      P = q;
      skip = {};                       // the indices mean something else now
      cut++;
    }
    stats.fingersCut += cut;
    return cut ? flatOf(P) : ring;
  }

  /* How many places a ring doubles back alongside itself. The measure the cutting is judged on,
     and the one that reads "pimple" as a number. */
  function fingerCount(ring, gap, alongMin) {
    var P = openOf(ring), n = P.length, i, j, hits = 0;
    if (n < 8) return 0;
    var s = new Float64Array(n);
    for (i = 1; i < n; i++) {
      s[i] = s[i - 1] + Math.sqrt((P[i][0] - P[i - 1][0]) * (P[i][0] - P[i - 1][0]) +
                                  (P[i][1] - P[i - 1][1]) * (P[i][1] - P[i - 1][1]));
    }
    var total = s[n - 1] + Math.sqrt((P[0][0] - P[n - 1][0]) * (P[0][0] - P[n - 1][0]) +
                                     (P[0][1] - P[n - 1][1]) * (P[0][1] - P[n - 1][1]));
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var along = Math.abs(s[j] - s[i]);
        along = Math.min(along, total - along);
        if (along < alongMin) continue;
        var dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1];
        if (Math.sqrt(dx * dx + dy * dy) < gap) { hits++; break; }
      }
    }
    return hits;
  }

  /* The sharpest turn anywhere on a ring, and how many turns are harder than `hard` radians.
     This is the measure the smoothing is judged on, because it is the one that sees a kink:
     total turning cannot, since a smooth curve turns a great deal in a great many small steps. */
  function turnStats(ring, hard) {
    var P = openOf(ring), n = P.length, i, mx = 0, cnt = 0;
    for (i = 0; i < n; i++) {
      var a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
      var a1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
      var a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      var d = a2 - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      d = Math.abs(d);
      if (d > mx) mx = d;
      if (d > (hard || Math.PI / 6)) cnt++;
    }
    return { maxTurn: mx, hardTurns: cnt, points: n };
  }

  /* What the narrowest point of the whole road network actually is, measured after the fact. The
     clamp promises a number; this is the number, read back off the geometry that was produced.

     nearestSeg only searches a few buckets out, which is right for the clamp - it only has to
     know whether anything is CLOSER than minD - but wrong for measuring, where a point far from
     every road would come back Infinity and silently drop out of the minimum. So the search is
     widened here, and a point that still finds nothing is reported as at least that far rather
     than as nothing at all. */
  function measureClearance(rings, cor, want) {
    var reach = Math.max(want, 3 * cor.B), worst = Infinity, i, k, d;
    for (i = 0; i < rings.length; i++) {
      for (k = 0; k + 1 < rings[i].length; k += 2) {
        d = nearestSeg(cor, rings[i][k], rings[i][k + 1], reach)[0];
        if (!isFinite(d)) d = reach;           // nothing within reach: it is at least this clear
        if (d < worst) worst = d;
      }
    }
    return worst;
  }

  root.Parcels = {
    removeFingers: removeFingers,
    fingerCount: fingerCount,
    smoothCell: smoothCell,
    turnStats: turnStats,
    resampleUniform: resampleUniform,
    curveRing: curveRing,
    curveOpen: curveOpen,
    clampInside: clampInside,
    buildCorridor: buildCorridor,
    clampToCorridor: clampToCorridor,
    measureClearance: measureClearance,
    resetStats: resetStats,
    smoothGraph: smoothGraph,
    inset: inset,
    fillet: fillet,
    closeExact: closeExact,
    openOf: openOf,
    flatOf: flatOf,
    areaOf: areaOf,
    countOverlaps: countOverlaps,
    allClosed: allClosed,
    stats: stats
  };
})(typeof window !== "undefined" ? window : this);
