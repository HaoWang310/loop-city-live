/* ============================================================================================
   wool.js : the wool thread, inside a cell, in real metres.

   A port rather than a handshake. The original is a single 5,005-line page that works in a local
   Rhino frame on a cell of about 0.05 km2; ours runs on the British National Grid on cells of 30
   to 300 km2. Three things follow from that and they shape everything here.

   IT MUST BE GEOREFERENCED. Nothing is normalised into a unit square and quietly handed back. The
   cell arrives in this app's own CELL units -- the mould's 92.6 m grid, the same units roads.js
   and graph.js use -- and `cellE` / `cellN` convert to metres wherever a real dimension is meant.
   A road width is metres. A junction spacing is metres. Only the things that are genuinely
   proportions of the cell stay proportions.

   THE SPINE IS THE RAILWAY. The original's spine is seven hard-coded points in a group whose name
   no code ever tests. Here it is the real alignment, clipped to the cell, arriving as runs.

   TWO LEVELS, NOT THREE. The original has three, and the third is the only one that reads the
   parcels -- its author's own comment calls that stage "PARCEL-GUIDED TERTIARY NETWORK". Parcels
   inside a cell are the next piece of work, not this one, so level 3 is not ported. What is left
   is the seam that was already there: 1 and 2 are anchor-driven, 3 was parcel-driven.

   ------------------------------------------------------------------------------ the contract

   Wool.thread(cell, opts) -> { level1, level2, stats }

     cell.ring     Float64Array, closed, CELL units. The boundary. One ring, no holes; concave is
                   fine, which is what the original assumes too.
     cell.spine    array of runs, each an array of [x,y] in CELL units. The railway inside the
                   cell. May be empty -- and a cell with no railway has no spine and cannot be
                   threaded, which the caller is expected to have checked.
     cell.centre   [x,y] or null. The station. Where there is one, the structural level converges
                   on it.
     cell.anchors  [{north,south,mid}] -- used INSTEAD of a centre, where the cell has no station:
                   the spine offset into a corridor and divided equally, each anchor joining north
                   to south. Not a fallback; a different figure.
     cell.cellE    metres per cell unit, east. cell.cellN likewise, north.

     level1        array of Float64Array polylines -- the structural roads
     level2        array of Float64Array polylines -- everything else
     stats         counts and lengths, for saying what happened rather than implying it

   ============================================================================================ */
(function (root) {
  "use strict";

  var EPS = 1e-9;

  var DEFAULTS = {
    /* THE SOLVER, as the original ships it. S = 80 segments and the magnet range derived from the
       geometry at 1.84386 point spacings: the verifier's "similarity" regime, in which the result
       is the original's pattern at our scale. Measured on his solver, the run is identical after a
       rescale of coordinates and magnet range together -- the algorithm is scale-covariant. */
    segs: 80,
    iterations: 3000,

    /* Real dimensions, in METRES. */
    spineSpacingM: 1500,       // spine anchors sampled along the railway at this spacing
    minRoadM: 400,             // a level-2 dead end shorter than this is pruned
    minCellM: 20,              // the thread raster is never finer than this

    /* Proportions. */
    cellPerMagR: 0.6,          // thread raster cell, as a fraction of the magnet range
    bundleMin: 2               // level 2 needs at least two threads running together
  };

  /* ------------------------------------------------------------------------------- geometry */

  function ringPoints(ring) {
    var P = [], i, n = ring.length >> 1;
    for (i = 0; i < n; i++) {
      var x = ring[2 * i], y = ring[2 * i + 1];
      if (P.length && Math.abs(P[P.length - 1][0] - x) < EPS &&
                      Math.abs(P[P.length - 1][1] - y) < EPS) continue;
      P.push([x, y]);
    }
    while (P.length > 1 && Math.abs(P[0][0] - P[P.length - 1][0]) < EPS &&
                           Math.abs(P[0][1] - P[P.length - 1][1]) < EPS) P.pop();
    return P;
  }

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

  function bbox(P) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i;
    for (i = 0; i < P.length; i++) {
      if (P[i][0] < x0) x0 = P[i][0];
      if (P[i][0] > x1) x1 = P[i][0];
      if (P[i][1] < y0) y0 = P[i][1];
      if (P[i][1] > y1) y1 = P[i][1];
    }
    return [x0, y0, x1, y1];
  }

  /* The cell's own size, used wherever the original used a fraction of the diagonal. Kept as one
     function so there is a single place to look when a tolerance behaves oddly at a new scale. */
  function diagonal(P) {
    var b = bbox(P);
    return Math.sqrt((b[2] - b[0]) * (b[2] - b[0]) + (b[3] - b[1]) * (b[3] - b[1]));
  }

  /* Deterministic, and it has to be: the original contains no Math.random() at all and the same
     cell must give the same roads every time or two runs cannot be compared. */
  function rng(seed) {
    var s = (seed | 0) || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  function polyLen(pts) {
    var L = 0, i;
    for (i = 0; i + 1 < pts.length; i++) {
      L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    }
    return L;
  }

  function flat(pts) {
    var r = new Float64Array(pts.length * 2), i;
    for (i = 0; i < pts.length; i++) { r[2 * i] = pts[i][0]; r[2 * i + 1] = pts[i][1]; }
    return r;
  }

  /* ============================================================================ THE SOLVER

     A faithful port of the original's worker, lines 451-640, read from the source and not from a
     paraphrase. It is a Kangaroo-style projection relaxer -- "each goal proposes a move, moves
     averaged by strength" -- with five goals in a fixed order: Anchor, Length, Angle, MagnetSnap,
     keep-inside. No mass, no timestep, no collision; threads cross freely.

     Three departures, each deliberate and each switchable back:

       FLOAT64 OUT, IN A LOCAL FRAME. The original's only exit is `new Float32Array(P)`. At demo
       coordinates (x ~ 400-650) that is harmless; at British National Grid eastings it snaps every
       point to a 3 to 6 cm lattice, and the warm-restart path makes the loss permanent. Here the
       caller subtracts an origin before solving and nothing is ever narrowed.

       PINNED ANCHORS, IF ASKED. The original's anchor weight is summed, not normalised, so an
       anchor with d threads carries only 1e6 / (1e6 + d*430,842) of its own vote -- 36.7 % at
       d = 4, 8.8 % at d = 24 -- and the verifier measured anchors drifting up to 1.37 m. A station
       is a fixed thing on the railway, so `pin` holds chosen anchors exactly where they were put.
       Off by default, which is how the fidelity test is run.

       THE /80 BUG IS NOT COPIED. rangeFromSegments divides by a literal 80 rather than by the
       number of segments; `magnetRange()` below divides by S.

     Everything else -- the goal formulas, the 0.6667 / 0.3333 split, the half-way magnet with a
     hard cut, the hash constants 73856093 and 19349663, the containment refreshed every fourth
     iteration and weighted by the anchor strength -- is exactly as written. The bundling is
     chaotic, so a port with any change of summation order gives a statistically identical but
     geometrically different pattern; the fidelity test checks the STATISTICS, not the picture. */

  var SOLVER_DEFAULTS = {        // the original's DEFINITION, line 2470
    segs: 80, lenS: 409847, over: 0, tension: false, angS: 20995, magS: 350,
    magR: 2.2,                   // the code's own fallback; the demo carries 2.168 in its data
    ancS: 1000000, mom: 0.9, inside: true, magAll: false, stopAt: 3000
  };

  var HBITS = 17, HSIZE = 1 << HBITS, HMASK = HSIZE - 1;

  /* anchors: Float64Array 2*NA.  threads: Int32Array 3*T of (ia, ib, group).  boundary: Float64Array
     2*nb or null.  pin: optional Uint8Array NA, 1 = hold this anchor exactly. */
  function Solver(anchors, threads, S, boundary, params, pin) {
    var prm = {}, k;
    for (k in SOLVER_DEFAULTS) prm[k] = SOLVER_DEFAULTS[k];
    if (params) for (k in params) prm[k] = params[k];

    var NA = anchors.length / 2, T = threads.length / 3, N = NA + T * (S - 1);
    var P = new Float64Array(2 * N), V = new Float64Array(2 * N), M = new Float64Array(2 * N),
        W = new Float64Array(N), AT = new Float64Array(anchors);
    var IDX = new Int32Array(T * (S + 1)), R0 = new Float64Array(T), R = new Float64Array(T);
    var TG = new Int32Array(T), PT = new Int32Array(N), INS = new Uint8Array(N).fill(1);
    var CX = new Int32Array(N), CY = new Int32Array(N), HEAD = new Int32Array(HSIZE), NEXT = new Int32Array(N);
    var BND = boundary ? new Float64Array(boundary) : null;
    var PIN = pin || null;
    var self = { iter: 0, lastMove: 0, pairs: 0, NA: NA, T: T, N: N, S: S, P: P, IDX: IDX, TG: TG,
                 prm: prm, AT: AT };

    var a, t, i, base;
    for (a = 0; a < NA; a++) { P[2 * a] = AT[2 * a]; P[2 * a + 1] = AT[2 * a + 1]; PT[a] = -1; }
    var next = NA;
    for (t = 0; t < T; t++) {
      var ia = threads[3 * t], ib = threads[3 * t + 1];
      TG[t] = threads[3 * t + 2];
      base = t * (S + 1);
      IDX[base] = ia; IDX[base + S] = ib;
      for (k = 1; k < S; k++) {
        var f = k / S; i = next++;
        IDX[base + k] = i; PT[i] = t;
        P[2 * i] = AT[2 * ia] + (AT[2 * ib] - AT[2 * ia]) * f;
        P[2 * i + 1] = AT[2 * ia + 1] + (AT[2 * ib + 1] - AT[2 * ia + 1]) * f;
      }
      var Lc = Math.hypot(AT[2 * ib] - AT[2 * ia], AT[2 * ib + 1] - AT[2 * ia + 1]);
      R0[t] = Lc / S; R[t] = R0[t] * (1 + (prm.over || 0) / 100);
    }

    function inPoly(x, y) {
      var n = BND.length / 2, c = false, j2, i2;
      for (i2 = 0, j2 = n - 1; i2 < n; j2 = i2++) {
        var xi = BND[2 * i2], yi = BND[2 * i2 + 1], xj = BND[2 * j2], yj = BND[2 * j2 + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    }
    function closestOnPoly(x, y) {
      var n = BND.length / 2, bx = x, by = y, bd = 1e300, j2, i2;
      for (i2 = 0, j2 = n - 1; i2 < n; j2 = i2++) {
        var ax = BND[2 * j2], ay = BND[2 * j2 + 1], vx = BND[2 * i2] - ax, vy = BND[2 * i2 + 1] - ay;
        var l2 = vx * vx + vy * vy, s = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        var qx = ax + vx * s, qy = ay + vy * s, dd = (qx - x) * (qx - x) + (qy - y) * (qy - y);
        if (dd < bd) { bd = dd; bx = qx; by = qy; }
      }
      return [bx, by];
    }

    self.step = function () {
      M.fill(0); W.fill(0);
      var i, j, k, t, base, dx, dy, w;
      // Anchor
      w = prm.ancS;
      for (i = 0; i < NA; i++) {
        M[2 * i] += w * (AT[2 * i] - P[2 * i]); M[2 * i + 1] += w * (AT[2 * i + 1] - P[2 * i + 1]); W[i] += w;
      }
      // Length
      w = prm.lenS;
      if (w > 0) for (t = 0; t < T; t++) {
        base = t * (S + 1); var r = R[t];
        for (k = 0; k < S; k++) {
          i = IDX[base + k]; j = IDX[base + k + 1];
          dx = P[2 * j] - P[2 * i]; dy = P[2 * j + 1] - P[2 * i + 1];
          var L = Math.sqrt(dx * dx + dy * dy);
          if (L < 1e-12 || (prm.tension && L < r)) continue;
          var f = 0.5 * (L - r) / L, mx = dx * f * w, my = dy * f * w;
          M[2 * i] += mx; M[2 * i + 1] += my; M[2 * j] -= mx; M[2 * j + 1] -= my;
          W[i] += w; W[j] += w;
        }
      }
      // Angle
      w = prm.angS;
      if (w > 0) for (t = 0; t < T; t++) {
        base = t * (S + 1);
        for (k = 1; k < S; k++) {
          var i0 = IDX[base + k - 1], i1 = IDX[base + k], i2 = IDX[base + k + 1];
          dx = P[2 * i1] - 0.5 * (P[2 * i0] + P[2 * i2]); dy = P[2 * i1 + 1] - 0.5 * (P[2 * i0 + 1] + P[2 * i2 + 1]);
          M[2 * i1] -= w * dx * 0.6667; M[2 * i1 + 1] -= w * dy * 0.6667;
          M[2 * i0] += w * dx * 0.3333; M[2 * i0 + 1] += w * dy * 0.3333;
          M[2 * i2] += w * dx * 0.3333; M[2 * i2 + 1] += w * dy * 0.3333;
          W[i0] += w; W[i1] += w; W[i2] += w;
        }
      }
      // MagnetSnap
      w = prm.magS; var rg = prm.magR, pairs = 0;
      if (w > 0 && rg > 0) {
        var inv = 1 / rg, r2 = rg * rg;
        HEAD.fill(-1);
        for (i = NA; i < N; i++) {
          var cx = Math.floor(P[2 * i] * inv), cy = Math.floor(P[2 * i + 1] * inv);
          CX[i] = cx; CY[i] = cy;
          var h = ((cx * 73856093) ^ (cy * 19349663)) & HMASK;
          NEXT[i] = HEAD[h]; HEAD[h] = i;
        }
        for (i = NA; i < N; i++) {
          var ti = PT[i], gi = TG[ti], px = P[2 * i], py = P[2 * i + 1];
          for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
            var ccx = CX[i] + ox, ccy = CY[i] + oy, hh = ((ccx * 73856093) ^ (ccy * 19349663)) & HMASK;
            for (j = HEAD[hh]; j !== -1; j = NEXT[j]) {
              if (j <= i || CX[j] !== ccx || CY[j] !== ccy) continue;
              var tj = PT[j];
              if (tj === ti || (!prm.magAll && TG[tj] !== gi)) continue;
              dx = P[2 * j] - px; dy = P[2 * j + 1] - py;
              var d2 = dx * dx + dy * dy;
              if (d2 >= r2) continue;
              M[2 * i] += w * 0.5 * dx; M[2 * i + 1] += w * 0.5 * dy;
              M[2 * j] -= w * 0.5 * dx; M[2 * j + 1] -= w * 0.5 * dy;
              W[i] += w; W[j] += w;
              pairs++;
            }
          }
        }
      }
      self.pairs = pairs;
      // keep inside the outline -- note it borrows the ANCHOR strength, as the original does
      if (prm.inside && BND) {
        w = prm.ancS;
        var every = (self.iter % 4 === 0);
        for (i = NA; i < N; i++) {
          if (every) INS[i] = inPoly(P[2 * i], P[2 * i + 1]) ? 1 : 0;
          if (!INS[i]) {
            var q = closestOnPoly(P[2 * i], P[2 * i + 1]);
            M[2 * i] += w * (q[0] - P[2 * i]); M[2 * i + 1] += w * (q[1] - P[2 * i + 1]); W[i] += w;
          }
        }
      }
      // move
      var mom = prm.mom, mm = 0;
      for (i = 0; i < N; i++) {
        if (W[i] <= 0) continue;
        dx = M[2 * i] / W[i]; dy = M[2 * i + 1] / W[i];
        /* A pinned anchor's proposed move is undone a few lines down, so counting it would report
           motion that never happens: the first run reported a final move of 3.72 m, six times less
           settled than the original, and it was the station and gateways being pulled along their
           threads and put back every step. Only points that are allowed to move are counted. */
        var d = dx * dx + dy * dy;
        if (d > mm && !(PIN && i < NA && PIN[i])) mm = d;
        V[2 * i] = V[2 * i] * mom + dx; V[2 * i + 1] = V[2 * i + 1] * mom + dy;
        P[2 * i] += V[2 * i]; P[2 * i + 1] += V[2 * i + 1];
      }
      // the one addition: an anchor that must not creep is put back, and its momentum killed
      if (PIN) for (i = 0; i < NA; i++) if (PIN[i]) {
        P[2 * i] = AT[2 * i]; P[2 * i + 1] = AT[2 * i + 1]; V[2 * i] = 0; V[2 * i + 1] = 0;
      }
      self.lastMove = Math.sqrt(mm);
      self.iter++;
    };

    /* One thread as a polyline, anchor to anchor. */
    self.thread = function (t) {
      var out = new Float64Array(2 * (S + 1)), b = t * (S + 1), q;
      for (k = 0; k <= S; k++) { q = IDX[b + k]; out[2 * k] = P[2 * q]; out[2 * k + 1] = P[2 * q + 1]; }
      return out;
    };
    return self;
  }

  /* Build the thread list from groups, exactly as buildTopology does (2713-2729): 'cross' joins
     every A to every B, anything else is all-pairs over A+B, duplicates dropped PER GROUP. Anchor
     indices must be explicit integers; the original leans on JavaScript's key order for this. */
  function buildThreads(groups) {
    var th = [];
    groups.forEach(function (g, gi) {
      var seen = {};
      function add(a, b) {
        if (a === b) return;
        var key = a < b ? a + "," + b : b + "," + a;
        if (seen[key]) return;
        seen[key] = 1;
        th.push(a, b, gi);
      }
      if (g.mode === "cross") g.A.forEach(function (a) { g.B.forEach(function (b) { add(a, b); }); });
      else {
        var all = g.A.concat(g.B), i, j;
        for (i = 0; i < all.length; i++) for (j = i + 1; j < all.length; j++) add(all[i], all[j]);
      }
    });
    return new Int32Array(th);
  }

  /* The magnet range the original derives from the geometry -- 1.84386 point spacings -- but
     divided by the real S rather than a literal 80. The verifier's reading of why this constant
     matters: the straight-line start is an exact fixed point of every goal EXCEPT the magnet, so
     unless the magnet finds pairs on iteration 1 the solver does not move at all, and 1.84386
     spacings is what guarantees two threads leaving a shared anchor already overlap. */
  function magnetRange(anchors, threads, S) {
    var T = threads.length / 3, sum = 0, t;
    for (t = 0; t < T; t++) {
      var a = threads[3 * t], b = threads[3 * t + 1];
      sum += Math.hypot(anchors[2 * b] - anchors[2 * a], anchors[2 * b + 1] - anchors[2 * a + 1]) / S;
    }
    return T ? sum / T * 1.84386 : SOLVER_DEFAULTS.magR;
  }

  /* ======================================================================== OUR CELL, AS A MODEL

     The original is handed a model whose anchors were typed in by hand. Ours are made from the
     cell, and every one of them is a real thing on the ground:

       GATEWAYS    where a road of the network meets this cell's edge -- the junctions on its
                   boundary. The original's gateways are anchors in groups literally named
                   "Road north" / "Road south"; here they are found, not named.
       NORTH/SOUTH which side of the RAILWAY a gateway is on. The original grows two merge trees,
                   north and south, and the rail is what divides a Loop City cell in two, so the
                   split is the rail rather than a label.
       CENTRE      the station, where there is one. Pinned: a station is on the railway and must
                   not creep the metre and more the original's anchors drift.
       SPINE       the railway inside the cell, sampled into anchors. The original cannot follow a
                   curve -- a thread is only a pair of anchors, a straight chord that the magnet
                   pulls sideways -- so a real alignment can only enter as points along it.
       CORRIDOR    in a cell with no station, the corridor anchors instead of a centre: each pair
                   joins north to south, and the gateways on each side run to them.

     Everything is converted into a LOCAL frame in metres before solving -- cell units times the
     metres per cell, less an origin at the cell's corner -- so nothing is ever evaluated at BNG
     magnitude, and handed back in the app's cell units afterwards. */

  function nearestOnRun(run, x, y) {
    var best = Infinity, bi = 0, bt = 0, i;
    for (i = 0; i + 1 < run.length; i++) {
      var ax = run[i][0], ay = run[i][1], vx = run[i + 1][0] - ax, vy = run[i + 1][1] - ay;
      var l2 = vx * vx + vy * vy, s = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      var qx = ax + vx * s, qy = ay + vy * s, d = (qx - x) * (qx - x) + (qy - y) * (qy - y);
      if (d < best) { best = d; bi = i; bt = s; }
    }
    return { d: Math.sqrt(best), i: bi, t: bt };
  }

  /* Which side of the railway a point is on: the sign of the cross product of the rail's local
     direction with the offset to the point. +1 and -1 are the two halves of the cell. */
  function sideOfRun(run, x, y) {
    var n = nearestOnRun(run, x, y), a = run[n.i], b = run[n.i + 1];
    var c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    return c >= 0 ? 1 : -1;
  }

  /* Points at equal spacing along a polyline, ends excluded. */
  function sampleRun(run, spacing) {
    var L = 0, i, seg = [];
    for (i = 0; i + 1 < run.length; i++) {
      var l = Math.hypot(run[i + 1][0] - run[i][0], run[i + 1][1] - run[i][1]);
      seg.push(l); L += l;
    }
    var n = Math.max(1, Math.round(L / spacing)), out = [], k;
    for (k = 1; k < n; k++) {
      var want = L * k / n, acc = 0;
      for (i = 0; i < seg.length; i++) {
        if (acc + seg[i] >= want) {
          var f = seg[i] > 0 ? (want - acc) / seg[i] : 0;
          out.push([run[i][0] + (run[i + 1][0] - run[i][0]) * f,
                    run[i][1] + (run[i + 1][1] - run[i][1]) * f]);
          break;
        }
        acc += seg[i];
      }
    }
    return out;
  }

  function prepare(cell, o) {
    var mE = cell.cellE, mN = cell.cellN;
    var ringC = ringPoints(cell.ring);
    var b = bbox(ringC);
    var ox = b[0] * mE, oy = b[1] * mN;
    function L(p) { return [p[0] * mE - ox, p[1] * mN - oy]; }           // cell units -> local m
    var ring = ringC.map(L);

    // the longest rail run is the spine; a short re-entry is not
    var runs = (cell.spine || []).map(function (r) { return r.map(L); });
    var spine = runs.slice().sort(function (p, q) { return polyLen(q) - polyLen(p); })[0] || null;

    var anchors = [], pin = [], role = [];
    function add(p, isPinned, r) { anchors.push(p[0], p[1]); pin.push(isPinned ? 1 : 0); role.push(r); return anchors.length / 2 - 1; }

    // gateways, split by the railway
    var north = [], south = [];
    (cell.gateways || []).forEach(function (g) {
      var p = L(g), side = spine ? sideOfRun(spine, p[0], p[1]) : 1;
      var id = add(p, true, "gateway");
      (side > 0 ? north : south).push(id);
    });

    var groups = [], centreId = -1, spineIds = [], corrN = [], corrS = [];
    if (cell.centre) {
      centreId = add(L(cell.centre), true, "centre");
      if (spine) {
        /* spine samples, kept clear of the station so two anchors do not sit on each other */
        var cxy = anchors.slice(2 * centreId, 2 * centreId + 2);
        sampleRun(spine, o.spineSpacingM).forEach(function (p) {
          if (Math.hypot(p[0] - cxy[0], p[1] - cxy[1]) < o.spineSpacingM * 0.5) return;
          spineIds.push(add(p, false, "spine"));
        });
      }
      var targets = spineIds.concat([centreId]);
      if (north.length) groups.push({ name: "Road north", mode: "cross", A: north, B: targets });
      if (south.length) groups.push({ name: "Road south", mode: "cross", A: south, B: targets });
    } else {
      (cell.anchors || []).forEach(function (a) {
        corrN.push(add(L(a.north), true, "corridor"));
        corrS.push(add(L(a.south), true, "corridor"));
      });
      /* which corridor edge faces which gateways: the north corridor edge is the one on the same
         side of the rail as the north gateways */
      if (spine && corrN.length) {
        var sN = sideOfRun(spine, anchors[2 * corrN[0]], anchors[2 * corrN[0] + 1]);
        if (sN < 0) { var tmp = corrN; corrN = corrS; corrS = tmp; }
      }
      if (north.length && corrN.length) groups.push({ name: "Road north", mode: "cross", A: north, B: corrN });
      if (south.length && corrS.length) groups.push({ name: "Road south", mode: "cross", A: south, B: corrS });
    }

    var AA = new Float64Array(anchors);
    var threads = buildThreads(groups);
    var S = o.segs;
    var magR = magnetRange(AA, threads, S);
    var bnd = new Float64Array(ring.length * 2);
    ring.forEach(function (p, i) { bnd[2 * i] = p[0]; bnd[2 * i + 1] = p[1]; });

    return {
      ox: ox, oy: oy, mE: mE, mN: mN, ring: ring, bnd: bnd, spine: spine,
      anchors: AA, pin: new Uint8Array(pin), role: role, groups: groups, threads: threads,
      S: S, magR: magR, centreId: centreId, north: north, south: south,
      corrN: corrN, corrS: corrS, spineIds: spineIds,
      toCell: function (x, y) { return [(x + ox) / mE, (y + oy) / mN]; }
    };
  }

  /* ================================================================= THREADS INTO TWO LEVELS

     The original's road builder is not ported, and this is the reason. It carries some thirty
     thresholds in absolute units that break at a 300 km2 cell; its welding tolerance has a ceiling
     of 2.8 m whatever the sliders say; a hoisting bug wipes the table that tells it which anchors
     are gateways before any routing runs; and even the cut its own verifier recommended for two
     levels throws ReferenceError and still leaves one line drawing level-3 roads.

     What IS kept is what it was trying to do, taken from its own code:

       THE WEIGHT     cost = length / (0.32 + max(1, thickness)^1.28)  -- line 1441, verbatim. A
                      six-thread bundle costs len/10.25 and a lone thread len/1.32: 7.8 times
                      cheaper per metre. That ratio is the whole "follow the wool" behaviour.
       THE THICKNESS  how many threads run along an edge, which is what his support score measures.
       THE LEVELS     level 1 routed from each gateway to the centre along the cheapest wool, as
                      his two rooted trees are; level 2 the rest of the bundled wool that meets it.

     And the graph itself comes from the machinery this app already trusts for the mould: the
     relaxed threads are painted into a raster, thinned, and read as a planar graph by the same
     RoadGraph.build that turns the mould's trail into roads. That replaces his intersection pass,
     which is all-pairs over roads and segments, and his fixed-tolerance weld, both of which fail
     at this scale. */

  function extract(model, solver, o) {
    var RG = root.RoadGraph;
    if (!RG || !RG.build) return { level1: [], level2: [], why: "RoadGraph is not loaded" };

    var b = bbox(model.ring);
    var rc = Math.max(o.minCellM, model.magR * o.cellPerMagR);        // raster cell, metres
    var W = Math.max(8, Math.ceil((b[2] - b[0]) / rc) + 3);
    var H = Math.max(8, Math.ceil((b[3] - b[1]) / rc) + 3);
    var x0 = b[0] - rc, y0 = b[1] - rc;
    var count = new Float32Array(W * H);

    /* paint every thread, once per cell per thread, so a cell's value is how many DISTINCT threads
       pass through it -- the thickness of the bundle, not how long a thread lingered there */
    var stamp = new Int32Array(W * H).fill(-1), t, k;
    for (t = 0; t < solver.T; t++) {
      var th = solver.thread(t);
      for (k = 0; k + 3 < th.length; k += 2) {
        var ax = th[k], ay = th[k + 1], bx = th[k + 2], by = th[k + 3];
        var steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (rc * 0.5)));
        for (var q = 0; q <= steps; q++) {
          var f = q / steps, px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
          var cx = Math.floor((px - x0) / rc), cy = Math.floor((py - y0) / rc);
          if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
          var ci = cy * W + cx;
          if (stamp[ci] === t) continue;
          stamp[ci] = t; count[ci] += 1;
        }
      }
    }

    // a mask of where any thread runs, fattened by one cell so near-coincident threads become one band
    var mask = new Uint8Array(W * H), i, x, y;
    for (i = 0; i < W * H; i++) if (count[i] > 0) mask[i] = 1;
    var fat = new Uint8Array(mask);
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      i = y * W + x;
      if (mask[i]) continue;
      if (mask[i - 1] || mask[i + 1] || mask[i - W] || mask[i + W]) fat[i] = 1;
    }

    var g = RG.build(fat, W, H, { pruneCells: 2, bridgeCells: 2, simplifyCells: 0.6, smoothPasses: 1 });
    if (!g || !g.edges || !g.edges.length) return { level1: [], level2: [], why: "no graph from the threads" };

    // raster cell -> local metres
    function toL(cx, cy) { return [x0 + (cx + 0.5) * rc, y0 + (cy + 0.5) * rc]; }

    /* thickness of each edge: the mean distinct-thread count along it */
    var eScore = new Float64Array(g.edges.length), eLen = new Float64Array(g.edges.length), e;
    for (e = 0; e < g.edges.length; e++) {
      var pts = g.edges[e].pts, sum = 0, n = 0, len = 0;
      for (k = 0; k + 1 < pts.length; k += 2) {
        var gx = Math.round(pts[k]), gy = Math.round(pts[k + 1]);
        if (gx >= 0 && gy >= 0 && gx < W && gy < H) { sum += count[gy * W + gx]; n++; }
        if (k + 3 < pts.length) len += Math.hypot(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]) * rc;
      }
      eScore[e] = n ? sum / n : 1;
      eLen[e] = len;
    }
    // his weight, line 1441
    function cost(e) { return eLen[e] / (0.32 + Math.pow(Math.max(1, eScore[e]), 1.28)); }

    // adjacency
    var adj = g.nodes.map(function () { return []; });
    for (e = 0; e < g.edges.length; e++) {
      adj[g.edges[e].a].push({ e: e, to: g.edges[e].b });
      adj[g.edges[e].b].push({ e: e, to: g.edges[e].a });
    }
    function nearestNode(p) {
      var best = -1, bd = Infinity, n2;
      for (n2 = 0; n2 < g.nodes.length; n2++) {
        if (!adj[n2].length) continue;
        var L2 = toL(g.nodes[n2].x, g.nodes[n2].y), d = Math.hypot(L2[0] - p[0], L2[1] - p[1]);
        if (d < bd) { bd = d; best = n2; }
      }
      return { n: best, d: bd };
    }

    /* Dijkstra from one node, over his weight. Returns predecessor edges. */
    function dijkstra(src) {
      var N = g.nodes.length, dist = new Float64Array(N).fill(Infinity), pe = new Int32Array(N).fill(-1);
      var heap = [[0, src]]; dist[src] = 0;
      while (heap.length) {
        // small binary heap
        var top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          var hi = 0;
          for (;;) {
            var l = 2 * hi + 1, r = l + 1, m = hi;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === hi) break;
            var sw = heap[m]; heap[m] = heap[hi]; heap[hi] = sw; hi = m;
          }
        }
        var d0 = top[0], u = top[1];
        if (d0 !== dist[u]) continue;
        for (var a = 0; a < adj[u].length; a++) {
          var st = adj[u][a], nd = d0 + cost(st.e);
          if (nd < dist[st.to]) {
            dist[st.to] = nd; pe[st.to] = st.e;
            heap.push([nd, st.to]);
            var ci2 = heap.length - 1;
            while (ci2 > 0) {
              var pi = (ci2 - 1) >> 1;
              if (heap[pi][0] <= heap[ci2][0]) break;
              var s2 = heap[pi]; heap[pi] = heap[ci2]; heap[ci2] = s2; ci2 = pi;
            }
          }
        }
      }
      return { dist: dist, pe: pe };
    }
    function pathEdges(sp, target) {
      var out = [], v = target, guard = 0;
      while (sp.pe[v] >= 0 && guard++ < 100000) {
        var ed = sp.pe[v]; out.push(ed);
        v = g.edges[ed].a === v ? g.edges[ed].b : g.edges[ed].a;
      }
      return out;
    }

    var level = new Uint8Array(g.edges.length), snapMissM = 0;
    function snap(id) {
      var p = [model.anchors[2 * id], model.anchors[2 * id + 1]];
      var r = nearestNode(p);
      if (r.d > snapMissM) snapMissM = r.d;
      return r.n;
    }

    /* LEVEL 1 */
    if (model.centreId >= 0) {
      var c = snap(model.centreId);
      if (c >= 0) {
        var sp = dijkstra(c);
        model.north.concat(model.south).forEach(function (gid) {
          var gn = snap(gid);
          if (gn >= 0 && isFinite(sp.dist[gn])) pathEdges(sp, gn).forEach(function (ed) { level[ed] = 1; });
        });
      }
    } else {
      /* no station: each gateway runs to the nearest corridor anchor on its own side, by the same
         weight, and the rungs are routed across the corridor from north anchor to south */
      function runSide(gates, corr) {
        if (!gates.length || !corr.length) return;
        var cn = corr.map(snap).filter(function (n2) { return n2 >= 0; });
        gates.forEach(function (gid) {
          var gn = snap(gid); if (gn < 0) return;
          var sp2 = dijkstra(gn), best = -1, bd = Infinity;
          cn.forEach(function (n2) { if (sp2.dist[n2] < bd) { bd = sp2.dist[n2]; best = n2; } });
          if (best >= 0) pathEdges(sp2, best).forEach(function (ed) { level[ed] = 1; });
        });
      }
      runSide(model.north, model.corrN);
      runSide(model.south, model.corrS);
      for (var ra = 0; ra < Math.min(model.corrN.length, model.corrS.length); ra++) {
        var na = snap(model.corrN[ra]), nb = snap(model.corrS[ra]);
        if (na < 0 || nb < 0) continue;
        var sp3 = dijkstra(na);
        if (isFinite(sp3.dist[nb])) pathEdges(sp3, nb).forEach(function (ed) { level[ed] = 1; });
      }
    }

    /* LEVEL 2: the rest of the BUNDLED wool that meets level 1. A bundle is where at least two
       threads run together -- a lone thread is a thread, not a road -- and it has to connect to the
       structural network, growing outward from it, which is his rule at line 1966: "grow only from
       the existing road network outward". Short dead-ends are pruned. */
    var onNet = new Uint8Array(g.nodes.length);
    for (e = 0; e < g.edges.length; e++) if (level[e] === 1) { onNet[g.edges[e].a] = 1; onNet[g.edges[e].b] = 1; }
    var grew = true, pass2 = 0;
    while (grew && pass2++ < 60) {
      grew = false;
      for (e = 0; e < g.edges.length; e++) {
        if (level[e]) continue;
        if (eScore[e] < o.bundleMin) continue;
        var ea = g.edges[e].a, eb = g.edges[e].b;
        if (!onNet[ea] && !onNet[eb]) continue;
        level[e] = 2; onNet[ea] = 1; onNet[eb] = 1; grew = true;
      }
    }
    // prune level-2 stubs shorter than the minimum road, repeatedly, since pruning makes new stubs
    var pruned = 0, deg = new Int32Array(g.nodes.length);
    for (var pp = 0; pp < 8; pp++) {
      deg.fill(0);
      for (e = 0; e < g.edges.length; e++) if (level[e]) { deg[g.edges[e].a]++; deg[g.edges[e].b]++; }
      var any = false;
      for (e = 0; e < g.edges.length; e++) {
        if (level[e] !== 2) continue;
        if ((deg[g.edges[e].a] === 1 || deg[g.edges[e].b] === 1) && eLen[e] < o.minRoadM) {
          level[e] = 0; pruned++; any = true;
        }
      }
      if (!any) break;
    }

    /* EVERY GATEWAY IS REACHED. A gateway is where a road from outside meets this cell, so the
       network inside has to reach it -- and on the first run of all five station cells it did not,
       twice: in C4 two gateways were left 2,951 m and 1,663 m from any wool road. The cause is the
       raster: a gateway sits ON the cell edge with its threads fanning inward, and thinning and
       spur-pruning erode the tip of a fan that begins at the edge of the mask, so the skeleton
       starts some way in and the gateway is left hanging.

       The repair follows the wool rather than drawing a straight line: take the gateway's own
       relaxed threads, walk each one inward from the gateway until it comes within reach of the
       network, and make the shortest such stretch that gateway's road. It is level 1, because it is
       the continuation of the structural road into the cell. The same holds for the centre and
       the corridor anchors, which the structure also has to reach; spine samples are attractors,
       not destinations, and are left as they are. */
    var netSegs = [];
    for (e = 0; e < g.edges.length; e++) {
      if (!level[e]) continue;
      var ep = g.edges[e].pts;
      for (k = 0; k + 3 < ep.length; k += 2) {
        var La = toL(ep[k], ep[k + 1]), Lb = toL(ep[k + 2], ep[k + 3]);
        netSegs.push([La[0], La[1], Lb[0], Lb[1]]);
      }
    }
    function distToNet(x, y) {
      var best = Infinity;
      for (var si = 0; si < netSegs.length; si++) {
        var sg = netSegs[si], vx = sg[2] - sg[0], vy = sg[3] - sg[1], l2 = vx * vx + vy * vy;
        var s = l2 > 0 ? ((x - sg[0]) * vx + (y - sg[1]) * vy) / l2 : 0;
        s = s < 0 ? 0 : s > 1 ? 1 : s;
        var d = Math.hypot(sg[0] + vx * s - x, sg[1] + vy * s - y);
        if (d < best) best = d;
      }
      return best;
    }
    var reach = rc * 1.6, connectors = [], connected = 0, stillLoose = 0;
    var mustReach = [];
    model.north.concat(model.south).forEach(function (id) { mustReach.push(id); });
    if (model.centreId >= 0) mustReach.push(model.centreId);
    model.corrN.concat(model.corrS).forEach(function (id) { mustReach.push(id); });
    var SS = solver.S, IDXs = solver.IDX;
    mustReach.forEach(function (aid) {
      var ax0 = model.anchors[2 * aid], ay0 = model.anchors[2 * aid + 1];
      if (netSegs.length && distToNet(ax0, ay0) <= reach) return;
      var bestRun = null, bestLen = Infinity;
      for (var tt = 0; tt < solver.T; tt++) {
        var bse = tt * (SS + 1), fromA = IDXs[bse] === aid, fromB = IDXs[bse + SS] === aid;
        if (!fromA && !fromB) continue;
        var th2 = solver.thread(tt), run = [], len2 = 0, hit = false;
        for (var q2 = 0; q2 <= SS; q2++) {
          var qi = fromA ? q2 : SS - q2, px2 = th2[2 * qi], py2 = th2[2 * qi + 1];
          if (run.length) len2 += Math.hypot(px2 - run[run.length - 1][0], py2 - run[run.length - 1][1]);
          run.push([px2, py2]);
          if (q2 > 0 && distToNet(px2, py2) <= reach) { hit = true; break; }
        }
        if (hit && len2 < bestLen) { bestLen = len2; bestRun = run; }
      }
      if (bestRun) { connectors.push(bestRun); connected++; }
      else stillLoose++;
    });

    // back to the app's cell units
    function toCellPoly(pts) {
      var outp = new Float64Array(pts.length);
      for (var z = 0; z + 1 < pts.length; z += 2) {
        var lm = toL(pts[z], pts[z + 1]), cc = model.toCell(lm[0], lm[1]);
        outp[z] = cc[0]; outp[z + 1] = cc[1];
      }
      return outp;
    }
    var level1 = [], level2 = [], km1 = 0, km2 = 0;
    for (e = 0; e < g.edges.length; e++) {
      if (level[e] === 1) { level1.push(toCellPoly(g.edges[e].pts)); km1 += eLen[e]; }
      else if (level[e] === 2) { level2.push(toCellPoly(g.edges[e].pts)); km2 += eLen[e]; }
    }
    // the gateway connectors are already in local metres, so they convert directly
    connectors.forEach(function (run) {
      var outp = new Float64Array(run.length * 2), cl = 0;
      run.forEach(function (pt, z) {
        var cc = model.toCell(pt[0], pt[1]); outp[2 * z] = cc[0]; outp[2 * z + 1] = cc[1];
        if (z) cl += Math.hypot(pt[0] - run[z - 1][0], pt[1] - run[z - 1][1]);
      });
      level1.push(outp); km1 += cl;
    });
    return {
      connected: connected, stillLoose: stillLoose,
      level1: level1, level2: level2, km1: km1 / 1000, km2: km2 / 1000, pruned: pruned,
      rasterCellM: rc, graphEdges: g.edges.length, snapMissM: snapMissM,
      maxThickness: Math.max.apply(null, Array.from(eScore))
    };
  }

  /* --------------------------------------------------------------------------------- the run */

  /* Thread one cell. Asynchronous and chunked, because 3000 iterations over some fifteen thousand
     points is seconds of work and the page has to keep painting. onProgress(fraction, text),
     onDone(result). Returns a handle whose cancel() stops it. */
  function thread(cell, opts, onProgress, onDone) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    if (opts) for (k in opts) o[k] = opts[k];
    var stats = { ok: false, why: "", mode: "", level1: 0, level2: 0, km1: 0, km2: 0 };
    function fail(why) { stats.why = why; if (onDone) onDone({ level1: [], level2: [], stats: stats }); return { cancel: function () {} }; }

    if (!cell || !cell.ring || cell.ring.length < 8) return fail("no cell boundary");
    if (!cell.spine || !cell.spine.length)
      return fail("no railway inside this cell, so there is no spine to thread against");
    if (!cell.centre && !(cell.anchors && cell.anchors.length))
      return fail("no station and no corridor anchors: nothing for the roads to run between");
    if (!cell.gateways || cell.gateways.length < 2)
      return fail("fewer than two places where a road meets this cell's edge, so nothing to thread from");

    var model = prepare(cell, o);
    stats.mode = model.centreId >= 0 ? "converging on a station" : "north to south across the corridor";
    if (!model.threads.length) return fail("the anchors made no threads -- every gateway fell on one side of the railway with nothing to meet it");

    var solver = Solver(model.anchors, model.threads, model.S, model.bnd,
                        { magR: model.magR, stopAt: o.iterations }, model.pin);
    stats.anchors = solver.NA; stats.threads = solver.T; stats.points = solver.N;
    stats.magRM = model.magR; stats.gatewaysN = model.north.length; stats.gatewaysS = model.south.length;

    var cancelled = false, t0 = Date.now();
    function chunk() {
      if (cancelled) return;
      var until = Date.now() + 30;
      while (solver.iter < o.iterations && Date.now() < until) solver.step();
      if (onProgress) onProgress(solver.iter / o.iterations,
        solver.iter + " of " + o.iterations + " iterations, " + solver.pairs.toLocaleString() + " magnet pairs");
      if (solver.iter < o.iterations) { setTimeout(chunk, 0); return; }
      var r = extract(model, solver, o);
      stats.ok = !r.why; stats.why = r.why || "";
      stats.level1 = r.level1.length; stats.level2 = r.level2.length;
      stats.km1 = r.km1; stats.km2 = r.km2; stats.seconds = (Date.now() - t0) / 1000;
      stats.rasterCellM = r.rasterCellM; stats.snapMissM = r.snapMissM; stats.maxThickness = r.maxThickness;
      stats.finalMove = solver.lastMove;
      stats.connected = r.connected; stats.stillLoose = r.stillLoose;
      // the relaxed threads too, in cell units, so they can be drawn under the roads
      var threadsOut = [];
      for (var t = 0; t < solver.T; t++) {
        var th = solver.thread(t), c = new Float64Array(th.length);
        for (var z = 0; z + 1 < th.length; z += 2) { var cc = model.toCell(th[z], th[z + 1]); c[z] = cc[0]; c[z + 1] = cc[1]; }
        threadsOut.push(c);
      }
      var anchorsOut = [];
      for (var a = 0; a < model.anchors.length / 2; a++) {
        var ac = model.toCell(model.anchors[2 * a], model.anchors[2 * a + 1]);
        anchorsOut.push({ x: ac[0], y: ac[1], role: model.role[a] });
      }
      if (onDone) onDone({ level1: r.level1, level2: r.level2, threads: threadsOut,
                           anchors: anchorsOut, stats: stats });
    }
    setTimeout(chunk, 0);
    return { cancel: function () { cancelled = true; }, stats: stats };
  }

  root.Wool = {
    thread: thread,
    prepare: prepare,
    extract: extract,
    Solver: Solver,
    buildThreads: buildThreads,
    magnetRange: magnetRange,
    SOLVER_DEFAULTS: SOLVER_DEFAULTS,
    DEFAULTS: DEFAULTS,
    // exposed because the app and the tests both want them, and two copies would drift
    ringPoints: ringPoints,
    inside: inside,
    bbox: bbox,
    diagonal: diagonal,
    polyLen: polyLen,
    flat: flat,
    rng: rng
  };
})(typeof window !== "undefined" ? window : this);
