/* ============================================================================================
   Loop City v10 -- a cell from our app, turned into the teammate's wool thread input.

   His app starts from a cell drawn in Rhino: an outline and groups of anchors. Ours starts from a
   slime-mould cell: a ring, the railway through it, the station, and the road ends where the network
   meets the ring -- all in British National Grid metres. This file builds HIS input from OURS, in the
   form his own "load settings" button reads (version 5), so everything after this point is his code,
   unchanged.

   TWO KINDS OF CELL (the user's sketch, 21 Sep: "its for cells in the spine, vs the cells around the node")

   Cells around a node (a station inside) -- HIS recipe, his own node cell's, measured and repeated:
     Spine east / Spine west   the railway, split at the station. A = points along the rail;
                               B = points on both corridor edges, and a few on the outline where the
                               corridor meets it. Every A threads to every B: the corridor weave.
     Road north / Road south   the two sides of the corridor. A = points on the outline (the road ends
                               first, then evenly spaced ones up to the count); B = interior points in a
                               line across the cell, plus that side's corridor-edge points -- the SAME
                               anchors as the spine's, which is how the two networks join.
     Everything converges on the station, as in his node cell.

   Cells in the spine (no station; low-rise along the railway) -- the roads do NOT converge on a centre:
     Rib north k / Rib south k  ribs across the cell, from the corridor's edge out to the outline: feet one
                               every "rib spacing" along the edge, ends spread evenly along that side's
                               outline, paired in order (a ladder -- they never cross or crowd), road ends
                               taking the nearest rib end's place. Each bay between
                               two ribs is one of his groups: A = the bay's outline points (its two ribs'
                               ends and N between), B = the bay's corridor-edge points (its two ribs' feet
                               and N between). Neighbouring bays share their rib's anchors, so the ribs
                               join up; a bay's threads bundle only among themselves (his magnets act
                               within a group), so nothing gathers to one point.
     Edge north k / south k    the corridor's edge in each bay, a thread from rib foot to rib foot: the
                               corridor is closed along its edge, and a road can run along it.
     Spine k                   a short weave inside the corridor: one rail point every rib spacing, threaded
                               to the next along the rail and to the corridor-edge anchors within a bay of it.
     Road north / Road south   one anchor each, where the railway enters and leaves the cell: his level 1
                               road runs from end to end along the corridor, the ribs are the streets off it.

   THE CORRIDOR is one band along the whole railway (corridor.js): the same smoothed line for every cell,
   node width in node cells, spine width in spine cells narrowing to the node width where the railway
   leaves them into a node cell. So neighbouring cells' corridors meet edge to edge. Without the railway
   file (rail_v12.js) the old per-cell corridor is used.

   SCALE. His settings were tuned on a cell of 49,794 m2. The file is written at that size and carries
   the cell's real area, so his loadSettings scales the geometry AND every distance setting up to the
   real size itself. The scaling is about the outline's vertex average, so the file is written about that
   same point and his coordinates come out as ours exactly: x = E - E0, y = N - N0, metres, y north.
   ============================================================================================ */
(function (root) {
  "use strict";

  var HIS_AREA = 49794;                 // the area his node cell is calibrated to (loadNodeCell)
  var MAG_K = 1.84386;                  // his "range from segments" factor
  var SEGS = 80;                        // his DEFINITION.segs

  // his DEFINITION and parcel defaults, copied as they are in his script
  var DEFINITION = { segs: 80, lenS: 409847, over: 0, tension: false, angS: 20995, magS: 350, magR: 2.168,
                     ancS: 1000000, mom: 0.9, inside: true, magAll: false, stopAt: 3000 };
  var PARCEL = { inset: 1.0, minArea: 5, maxArea: 0, straighten: true, straightenTol: 0.3,
                 rebuildSmooth: false, rebuildSmoothAmount: 60, outlineEdge: true, cell: 0.19 };
  /* his road defaults (roadP), written into every file. His loadSettings keeps whatever road settings the page
     already had for keys a file leaves out, then scales them with the cell -- so a cell placed twice in the same
     frame had its road distances scaled twice (x68, then x68 again). With the defaults in the file, every load
     starts from his own values. */
  var ROADS = { radius: 1.0, mainDensity: 30, secondaryMin: 1.4, secondaryLength: 20.0, angleTol: 25, minRun: 2.0, clean: 55, connect: true, connectTol: 6.0 };

  /* ------------------------------------------------------------------------ geometry */
  function area(P) { var a = 0; for (var i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return Math.abs(a / 2); }
  function inside(P, x, y) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) c = !c;
    }
    return c;
  }
  function len(P) { var L = 0; for (var i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return L; }
  function cum(P, closed) {
    var c = [0];
    for (var i = 1; i < P.length; i++) c.push(c[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    if (closed) c.push(c[c.length - 1] + Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]));
    return c;
  }
  // point and unit tangent at arc length s on an open polyline
  function at(P, C, s) {
    s = Math.max(0, Math.min(C[C.length - 1], s));
    var i = 1; while (i < C.length - 1 && C[i] < s) i++;
    var a = P[i - 1], b = P[i], L = (C[i] - C[i - 1]) || 1e-9, t = (s - C[i - 1]) / L;
    var tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: [tx, ty] };
  }
  // point at arc length s on a closed ring (C from cum(R, true))
  function onRing(R, C, s) {
    var T = C[C.length - 1]; s = ((s % T) + T) % T;
    var i = 1; while (i < C.length - 1 && C[i] < s) i++;
    var a = R[i - 1], b = R[i % R.length], L = (C[i] - C[i - 1]) || 1e-9, t = (s - C[i - 1]) / L;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  // nearest point on the ring: {p, s (arc length), d}
  function nearestOnRing(R, C, x, y) {
    var best = { d: Infinity, p: null, s: 0 };
    for (var i = 0; i < R.length; i++) {
      var a = R[i], b = R[(i + 1) % R.length], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      var t = l2 > 0 ? ((x - a[0]) * vx + (y - a[1]) * vy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      var qx = a[0] + vx * t, qy = a[1] + vy * t, d = Math.hypot(qx - x, qy - y);
      if (d < best.d) best = { d: d, p: [qx, qy], s: C[i] + t * Math.sqrt(l2) };
    }
    return best;
  }
  // first crossing of the ring by the ray from p along unit u (distance), or Infinity
  function rayHit(R, p, u) {
    var best = Infinity;
    for (var i = 0; i < R.length; i++) {
      var a = R[i], b = R[(i + 1) % R.length], ex = b[0] - a[0], ey = b[1] - a[1];
      var den = u[0] * ey - u[1] * ex; if (Math.abs(den) < 1e-12) continue;
      var t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
      var v = ((a[0] - p[0]) * u[1] - (a[1] - p[1]) * u[0]) / den;
      if (t > 1e-6 && v >= 0 && v <= 1 && t < best) best = t;
    }
    return best;
  }
  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[b.length >> 1]; }
  function vavg(R) { var x = 0, y = 0; R.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / R.length, y / R.length]; }
  var LC = function () { return root.LoopCorridor && root.LoopCorridor.ready ? root.LoopCorridor : null; };

  /* ------------------------------------------------------------------------ the recipe */
  /* opt: { corridorM (node width), corridorSpineM (spine width), spinePts, edgePairs, mouthPts, inside, outside,
     ribM, between }. outside and inside are PER SIDE of the corridor -- per road group -- which is what his own
     count sliders and his catalogue mean. spinePts / edgePairs / mouthPts are per half of the rail. ribM and
     between are for cells in the spine. */
  var WIDTH_NODE = 2500, WIDTH_SPINE = 4000;
  /* 22 Sep: with the green corridor app's edges each side of the corridor has its own width, and where a town or
     water sits beside the line one side runs in to the railway. A side narrower than this has no edge to anchor to:
     no edge anchors and no rib feet are put there (they would sit on the rail points: threads of no length). */
  var MIN_SIDE = 60;
  function kindOf(pack) { var C = LC(); return C ? C.kindOf(pack, WIDTH_SPINE) : ((pack.spine && pack.spine.length) ? "node" : "none"); }
  function defaults(pack) {
    // one corridor along the whole railway, so its width is the same in every cell: his corridor is ~6.6% of
    // his cell across, asked for wider -- 2.5 km at the nodes; thicker in the spine (the user's sketch)
    return { corridorM: WIDTH_NODE, corridorSpineM: WIDTH_SPINE, spinePts: 4, edgePairs: 7, mouthPts: 6, inside: 4, outside: 9,
             ribM: 1200, between: 1, connect: "nearby", kind: kindOf(pack) };
  }

  function build(pack, opt) {
    opt = opt || defaults(pack);
    var E0 = pack.bbox.E0, N0 = pack.bbox.N0;
    function L(q) { return [q[0] - E0, q[1] - N0]; }            // local metres, y north
    var R = pack.ring.map(L);
    if (R.length > 3 && R[0][0] === R[R.length - 1][0] && R[0][1] === R[R.length - 1][1]) R.pop();
    var RC = cum(R, true), per = RC[RC.length - 1];
    var cellA = area(R);
    var C = LC();
    var band = C ? C.bandFor(pack, { corridorM: opt.corridorM, corridorSpineM: opt.corridorSpineM || opt.corridorM }) : null;
    var kind = band ? band.kind : ((pack.spine && pack.spine.length) ? "node" : "none");
    var ctx = { pack: pack, opt: opt, E0: E0, N0: N0, L: L, R: R, RC: RC, per: per, cellA: cellA, band: band };
    var made = kind === "spine" ? spineRecipe(ctx) : kind === "node" ? nodeRecipe(ctx) :
      { ok: false, why: "the corridor does not reach this cell and it has no station, so there is nothing to thread yet" };
    if (!made.ok) return made;
    made.kind = kind;
    return finish(ctx, made);
  }

  /* ======================================================================== cells around a node */
  function nodeRecipe(X) {
    var pack = X.pack, opt = X.opt, E0 = X.E0, N0 = X.N0, L = X.L, R = X.R, RC = X.RC, per = X.per, cellA = X.cellA;
    // ---- the spine: the longest rail run, carried on to the ring at both ends
    var runs = (pack.spine || []).map(function (r) { return r.map(L); });
    if (!runs.length) return { ok: false, why: "no railway inside this cell, so there is no spine" };
    /* The railway can arrive in pieces: joined end to end, nearest ends first, wherever the gap is under a
       tenth of the cell's size; a piece further off is not the same line. */
    var tol = 0.1 * Math.sqrt(area(R)), pool = runs.map(function (r) { return r.slice(); });
    pool.sort(function (a, b) { return len(b) - len(a); });
    var sp = pool.shift();
    for (;;) {
      var best = null;
      pool.forEach(function (r, i) {
        [[r[0], false], [r[r.length - 1], true]].forEach(function (e) {
          [[sp[0], true], [sp[sp.length - 1], false]].forEach(function (s) {
            var d = Math.hypot(e[0][0] - s[0][0], e[0][1] - s[0][1]);
            if (d < tol && (!best || d < best.d)) best = { i: i, d: d, rev: e[1], atStart: s[1] };
          });
        });
      });
      if (!best) break;
      var r = pool.splice(best.i, 1)[0];
      var endNear = best.rev;
      if (best.atStart) { if (!endNear) r.reverse(); sp = r.concat(sp); }
      else { if (endNear) r.reverse(); sp = sp.concat(r); }
    }
    function extend(first) {
      var p = first ? sp[0] : sp[sp.length - 1], q = first ? sp[1] : sp[sp.length - 2];
      var d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, u = [(p[0] - q[0]) / d, (p[1] - q[1]) / d];
      var t = rayHit(R, p, u);
      if (isFinite(t) && t < 0.25 * Math.sqrt(cellA)) { var e = [p[0] + u[0] * t, p[1] + u[1] * t]; if (first) sp.unshift(e); else sp.push(e); }
    }
    extend(true); extend(false);
    var SC = cum(sp, false), SL = SC[SC.length - 1];

    // ---- the split: the station, or the middle of the rail
    var sSplit = SL / 2, station = null;
    if (pack.centre) {
      var c = L([pack.centre.E, pack.centre.N]); best = Infinity;
      for (var s = 0; s <= SL; s += SL / 400) { var q = at(sp, SC, s).p, d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (d < best) { best = d; sSplit = s; } }
      station = { id: pack.centre.id, off: best };
    }
    var w2 = opt.corridorM / 2;
    var Cn = LC(), BAND = X.band;
    // the shared corridor only if this cell's rail is the loop's railway (a cell file from an older rail is not)
    if (BAND && BAND.samples.length) {
      var dev = 0;
      for (var k0 = 0; k0 <= 8; k0++) { var q0 = at(sp, SC, SL * k0 / 8).p; dev = Math.max(dev, Cn.relNear(BAND, [q0[0] + E0, q0[1] + N0]).d); }
      if (dev > Math.max(400, w2)) BAND = null;
    } else BAND = null;
    // with the green corridor app's edges, the widest either side reaches near this cell stands in for the old
    // half-width wherever a search radius or a margin is needed
    var GREENB = !!(BAND && BAND.source === "green");
    if (GREENB) { var wm = 0; BAND.samples.forEach(function (q) { wm = Math.max(wm, q.wL, q.wR); }); w2 = Math.max(300, wm); }
    /* The rail's direction for everything built off it -- corridor edges, the band, the interior line. With the
       shared corridor it is the corridor's own centreline (smoothed over 1,250 m, the same line in every cell);
       without it, smoothed here over a stretch as long as the corridor is wide (the rail jogs 325 m at P1). */
    var DS = Math.max(w2, SL / 40), DIRC = Math.min(600, SL / 4);
    function dirAt(s) {
      if (BAND) {
        var qq = at(sp, SC, s).p, rn = Cn.relNear(BAND, [qq[0] + E0, qq[1] + N0]), cs = Cn.sampleAt(BAND, rn.r);
        var a0 = at(sp, SC, s - DIRC).p, b0 = at(sp, SC, s + DIRC).p, t = cs.t;
        var flip = (b0[0] - a0[0]) * t[0] + (b0[1] - a0[1]) * t[1] < 0;
        if (flip) t = [-t[0], -t[1]];                                                // along this cell's rail
        /* The band's two edges named for THIS cell's direction: left of it is the band's L (the corridor app's
           "out") unless the cell's rail runs the other way round the loop. Each side has its own width. */
        var eL = flip ? cs.Rt : cs.L, eR = flip ? cs.L : cs.Rt;
        return { p: [cs.p[0] - E0, cs.p[1] - N0], t: t, h: cs.w / 2,                // h: the band's half-width here
                 hl: flip ? cs.wR : cs.wL, hr: flip ? cs.wL : cs.wR, pl: [eL[0] - E0, eL[1] - N0], pr: [eR[0] - E0, eR[1] - N0] };
      }
      var a = at(sp, SC, s - DS).p, b = at(sp, SC, s + DS).p, dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy) || 1;
      var px = 0, py = 0, n = 0;
      for (var k = -4; k <= 4; k++) { var qk = at(sp, SC, s + k * DS / 4).p; px += qk[0]; py += qk[1]; n++; }
      var tt = [dx / dd, dy / dd], nn = [-tt[1], tt[0]], pc = [px / n, py / n];
      return { p: pc, t: tt, h: w2, hl: w2, hr: w2, pl: [pc[0] + nn[0] * w2, pc[1] + nn[1] * w2], pr: [pc[0] - nn[0] * w2, pc[1] - nn[1] * w2] };
    }

    // ---- anchors: one table, ids shared where groups meet
    var anchors = {}, nextId = 1;
    function add(p) { var id = nextId++; anchors[id] = { x: p[0], y: p[1] }; return id; }
    var split = add(at(sp, SC, sSplit).p);

    // where the corridor's two edges cross the outline -- the same points the neighbouring cell's corridor uses
    var EL = BAND ? Cn.edgeCrossings(BAND, pack.ring, "L") : [], ER = BAND ? Cn.edgeCrossings(BAND, pack.ring, "Rt") : [];
    var exactMouths = 0;
    function mouthArc(end) {
      var m = nearestOnRing(R, RC, end[0], end[1]), eb = [end[0] + E0, end[1] + N0];
      function pick(list) {
        var bx = null;
        list.forEach(function (x) { var d = Math.hypot(x.p[0] - eb[0], x.p[1] - eb[1]); if (d < 2 * w2 + 600 && (!bx || d < bx.d)) bx = { d: d, x: x }; });
        return bx && bx.x;
      }
      function off(p) { var q = nearestOnRing(R, RC, p[0] - E0, p[1] - N0), d = ((q.s - m.s) % per + per) % per; return d > per / 2 ? d - per : d; }
      var xl = pick(EL), xr = pick(ER), dl = xl ? off(xl.p) : null, dr = xr ? off(xr.p) : null;
      if (dl === null && dr === null) return { m: m, a0: m.s - 1.2 * w2, a1: m.s + 1.2 * w2 };
      if (dl === null) dl = dr > 0 ? -1.2 * w2 : 1.2 * w2;
      if (dr === null) dr = dl > 0 ? -1.2 * w2 : 1.2 * w2;
      exactMouths += (xl ? 1 : 0) + (xr ? 1 : 0);
      return { m: m, a0: m.s + Math.min(dl, dr), a1: m.s + Math.max(dl, dr) };
    }

    var sOf = {};                                               // where along the rail an anchor sits
    sOf[split] = sSplit;
    function half(dir) {                                        // dir +1: towards the end, -1: towards the start
      var hl = dir > 0 ? SL - sSplit : sSplit;
      var A = [split], B = [], edgeL = [], edgeR = [];
      for (var j = 1; j < opt.spinePts; j++) {                  // along the rail, as far as 80% of the half
        var s1 = sSplit + dir * hl * 0.8 * j / Math.max(1, opt.spinePts - 1);
        var rid = add(at(sp, SC, s1).p); A.push(rid); sOf[rid] = s1;
      }
      for (var k = 0; k < opt.edgePairs; k++) {                 // corridor edges, from the station out to the mouth
        var s2 = sSplit + dir * hl * (0.04 + 0.92 * (k + 0.5) / opt.edgePairs), g = dirAt(s2);
        var pl = g.pl, pr = g.pr;                                 // on the corridor's edges, left and right of the rail
        if (g.hl >= MIN_SIDE && inside(R, pl[0], pl[1])) { var il = add(pl); B.push(il); edgeL.push(il); sOf[il] = s2; }
        if (g.hr >= MIN_SIDE && inside(R, pr[0], pr[1])) { var ir = add(pr); B.push(ir); edgeR.push(ir); sOf[ir] = s2; }
      }
      // the mouth: outline points across the corridor where it meets the ring, from one edge to the other
      var end = dir > 0 ? sp[sp.length - 1] : sp[0], M = mouthArc(end);
      var mouth = [];
      // a mouth the corridor has almost closed (a town at the outline) takes fewer points, one every 150 m at most
      var mPts = Math.max(1, Math.min(opt.mouthPts, Math.round((M.a1 - M.a0) / 150) + 1));
      for (var q2 = 0; q2 < mPts; q2++) {
        var s3 = mPts > 1 ? M.a0 + (M.a1 - M.a0) * q2 / (mPts - 1) : (M.a0 + M.a1) / 2;
        var id = add(onRing(R, RC, s3)); B.push(id); mouth.push(id);
      }
      return { A: A, B: B, edgeL: edgeL, edgeR: edgeR, mouth: mouth, dir: dir, hl: hl, mouthS: M.m.s, a0: M.a0, a1: M.a1 };
    }
    var H1 = half(+1), H2 = half(-1);                          // H1 runs towards the rail's end, H2 its start

    // ---- the two sides of the corridor: the ring minus the two mouths
    function arcBetween(s0, s1) { var T = per; return ((s1 - s0) % T + T) % T; }
    var mg = 0.1 * w2;
    var mA0 = H1.a1 + mg, mA1 = H2.a0 - mg;                     // side from mouth 1 to mouth 2 (increasing s)
    var mB0 = H2.a1 + mg, mB1 = H1.a0 - mg;
    var sideArcs = [{ s0: mA0, span: arcBetween(mA0, mA1) }, { s0: mB0, span: arcBetween(mB0, mB1) }];
    sideArcs.forEach(function (a) { a.mid = onRing(R, RC, a.s0 + a.span / 2); });
    var northIdx = sideArcs[0].mid[1] >= sideArcs[1].mid[1] ? 0 : 1;
    function sideOf(p) {
      var g = dirAt(sSplit), n = [-g.t[1], g.t[0]];
      var ref = sideArcs[0].mid, s0 = (ref[0] - g.p[0]) * n[0] + (ref[1] - g.p[1]) * n[1];
      var sp_ = (p[0] - g.p[0]) * n[0] + (p[1] - g.p[1]) * n[1];
      return (s0 >= 0) === (sp_ >= 0) ? 0 : 1;
    }

    // ---- outside: the road ends first, then evenly spaced points up to the count
    var gates = (pack.gateways || []).map(L).map(function (g) { return nearestOnRing(R, RC, g[0], g[1]); });
    var sideA = [[], []];
    function inArc(s, a) { var d = arcBetween(a.s0, s); return d <= a.span; }
    var roadEnds = [0, 0];
    gates.forEach(function (g) {
      var k = inArc(g.s, sideArcs[0]) ? 0 : (inArc(g.s, sideArcs[1]) ? 1 : -1);
      if (k < 0) return;                                        // a road end inside a corridor mouth
      sideA[k].push({ s: g.s, p: g.p, gate: true }); roadEnds[k]++;
    });
    [0, 1].forEach(function (k) {
      var a = sideArcs[k], want = Math.max(2, opt.outside);
      var extra = want - sideA[k].length;
      if (extra > 0) {
        var step = a.span / (want + 1), gap = step * 0.5;
        for (var j = 1; j <= want && extra > 0; j++) {
          var s = a.s0 + step * j;
          if (sideA[k].some(function (e) { return Math.abs(arcBetween(e.s, s)) < gap || Math.abs(arcBetween(s, e.s)) < gap; })) continue;
          sideA[k].push({ s: s, p: onRing(R, RC, s), gate: false }); extra--;
        }
      }
      sideA[k].sort(function (x, y) { return arcBetween(a.s0, x.s) - arcBetween(a.s0, y.s); });
    });

    // ---- inside: a line across the cell through the split, perpendicular to the rail
    var g0 = dirAt(sSplit), nrm = [-g0.t[1], g0.t[0]];
    var rays = [nrm, [-nrm[0], -nrm[1]]].map(function (u, ui) {
      var hs = Math.max(30, ui === 0 ? g0.hl : g0.hr);          // from this side's corridor edge
      var start = [g0.p[0] + u[0] * hs, g0.p[1] + u[1] * hs], t = rayHit(R, start, u);
      return { u: u, start: start, len: isFinite(t) ? t : 0, side: sideOf([start[0] + u[0], start[1] + u[1]]) };
    });
    var rayLen = rays[0].len + rays[1].len, interior = [[], []];
    rays.forEach(function (ry) {
      if (!(ry.len > 0) || !(rayLen > 0)) return;
      var n = Math.max(0, opt.inside);
      for (var j = 1; j <= n; j++) {
        var t = ry.len * j / (n + 1);
        interior[ry.side].push(add([ry.start[0] + ry.u[0] * t, ry.start[1] + ry.u[1] * t]));
      }
    });

    // ---- the groups, in his order: spine, spine, road south, road north
    function leftOfRail(q) {
      var bst = Infinity, bs = 0;
      for (var s5 = 0; s5 <= SL; s5 += SL / 300) { var o = at(sp, SC, s5).p, d5 = Math.hypot(o[0] - q[0], o[1] - q[1]); if (d5 < bst) { bst = d5; bs = s5; } }
      var gg = dirAt(bs); return ((q[0] - gg.p[0]) * -gg.t[1] + (q[1] - gg.p[1]) * gg.t[0]) > 0;
    }
    var leftArc = leftOfRail(sideArcs[0].mid) ? 0 : 1;
    var edges = [[], []];
    [H1, H2].forEach(function (H) {
      H.edgeL.forEach(function (id) { edges[leftArc].push(id); });
      H.edgeR.forEach(function (id) { edges[1 - leftArc].push(id); });
    });
    function roadGroup(k, name) {
      var A = sideA[k].map(function (e) { return add(e.p); });
      return { name: name, color: "#7b7671", mode: "cross", visible: true, aOnOutline: true, A: A, B: interior[k].concat(edges[k]) };
    }
    var southIdx = 1 - northIdx;
    var groups;
    if (opt.connect === "all") {
      // his node cell: every edge anchor of a group to every interior anchor of it
      groups = [
        { name: "Spine east", color: "#8c9a78", mode: "cross", visible: true, aOnOutline: false, A: H1.A, B: H1.B },
        { name: "Spine west", color: "#8c9a78", mode: "cross", visible: true, aOnOutline: false, A: H2.A, B: H2.B },
        roadGroup(southIdx, "Road south"),
        roadGroup(northIdx, "Road north")
      ];
    } else groups = nearbyGroups();

    /* NEARBY ONLY (22 Sep: "everything is connecting to everything, that's why it's too busy"). The same anchors, in
       the same places, but each connects only to what faces it:
         the rail    each rail point to the corridor-edge anchors within one step of it along the rail (the last
                     one also to the mouth), so the corridor weave stays local and still gathers at the station
         each side   the outline anchors taken three at a time, overlapping by one so the stretches join up; each
                     stretch to the corridor-edge anchors facing it along the rail, and to the interior line where
                     it crosses the station's own stretch
         the edges   a thread along each corridor edge, anchor to anchor (as in the spine cells)
       Every group keeps his exact name -- his road builder takes level 1 entrances only from groups called Road
       north / Road south, and it takes them from every group of that name -- so level 1 still runs to the station. */
    function nearbyGroups() {
      var out = [];
      [[H1, "Spine east"], [H2, "Spine west"]].forEach(function (pair) {
        var H = pair[0], step = H.hl / Math.max(1, opt.spinePts), edgeIds = H.edgeL.concat(H.edgeR);
        H.A.forEach(function (rid, j) {
          var s0 = sOf[rid], B = edgeIds.filter(function (id) { return Math.abs(sOf[id] - s0) <= step * 1.15; });
          if (j === H.A.length - 1) B = B.concat(H.mouth);
          if (!B.length) B = edgeIds.slice().sort(function (a, b) { return Math.abs(sOf[a] - s0) - Math.abs(sOf[b] - s0); }).slice(0, 2);
          if (!B.length && j + 1 < H.A.length) B = [H.A[j + 1]];  // no edge on either side here: on along the rail
          if (B.length) out.push({ name: pair[1], color: "#8c9a78", mode: "cross", visible: true, aOnOutline: false, A: [rid], B: B });
        });
      });
      // where along the rail an outline point faces: the nearest rail point
      function railS(q) {
        var best = Infinity, bs = 0;
        for (var t = 0; t <= 300; t++) { var s0 = SL * t / 300, o = at(sp, SC, s0).p, d = Math.hypot(o[0] - q[0], o[1] - q[1]); if (d < best) { best = d; bs = s0; } }
        return bs;
      }
      [[southIdx, "Road south"], [northIdx, "Road north"]].forEach(function (pair) {
        var k = pair[0], O = sideA[k].map(function (e) { return { id: add(e.p), s: railS(e.p) }; });
        var E = edges[k], pad = 0.08 * SL;
        for (var i = 0; i < O.length - 1; i += 2) {
          var chunk = O.slice(i, Math.min(O.length, i + 3));
          var lo = Math.min.apply(null, chunk.map(function (c) { return c.s; })) - pad, hi = Math.max.apply(null, chunk.map(function (c) { return c.s; })) + pad;
          var B = E.filter(function (id) { return sOf[id] >= lo && sOf[id] <= hi; });
          if (sSplit >= lo && sSplit <= hi) B = interior[k].concat(B);
          if (B.length < 2) {
            var mid = (lo + hi) / 2;
            B = B.concat(E.filter(function (id) { return B.indexOf(id) < 0; }).sort(function (a, b) { return Math.abs(sOf[a] - mid) - Math.abs(sOf[b] - mid); }).slice(0, 2 - B.length));
          }
          // this side of the corridor has closed up (a town beside the line): the stretch goes to the interior line
          if (!B.length) B = interior[k].length ? interior[k].slice() : [split];
          if (B.length) out.push({ name: pair[1], color: "#7b7671", mode: "cross", visible: true, aOnOutline: true, A: chunk.map(function (c) { return c.id; }), B: B });
          if (i + 3 >= O.length) break;
        }
      });
      /* the corridor's edge as a thread, anchor to anchor, from where it meets the outline at one end to the other --
         as in the spine cells -- so parcels close along the corridor edge instead of spilling across it */
      function nearestOf(list, id) {
        var a = anchors[id], best = null, bd = Infinity;
        list.forEach(function (m) { var q = anchors[m], d = Math.hypot(q.x - a.x, q.y - a.y); if (d < bd) { bd = d; best = m; } });
        return best;
      }
      /* 22 Sep: where a side of the green corridor closes up against a town or water (the corridor app's edges run in
         to the railway), the edge thread stops there and starts again beyond it, instead of cutting straight through
         the town from one open stretch to the next. */
      function sideW(k, s) { var g = dirAt(s); return k === leftArc ? g.hl : g.hr; }
      function openAlong(k, s0, s1) {
        var a = Math.max(0, Math.min(s0, s1)), b = Math.min(SL, Math.max(s0, s1)), n = Math.max(1, Math.ceil((b - a) / 50));
        for (var i = 0; i <= n; i++) if (sideW(k, a + (b - a) * i / n) < MIN_SIDE) return false;
        return true;
      }
      var used = {};
      out.forEach(function (g) { g.A.concat(g.B).forEach(function (id) { used[id] = 1; }); });
      var railIds = H1.A.concat(H2.A);
      [[southIdx, "Edge south"], [northIdx, "Edge north"]].forEach(function (pair) {
        var k = pair[0], sorted = edges[k].slice().sort(function (a, b) { return sOf[a] - sOf[b]; });
        if (sorted.length < 1) return;
        var runs = [[sorted[0]]];
        for (var q = 1; q < sorted.length; q++) {
          if (openAlong(k, sOf[sorted[q - 1]], sOf[sorted[q]])) runs[runs.length - 1].push(sorted[q]); else runs.push([sorted[q]]);
        }
        runs.forEach(function (run, ri) {
          var chain = run.slice();
          if (ri === 0 && openAlong(k, 0, sOf[chain[0]])) { var m0 = nearestOf(H2.mouth, chain[0]); if (m0 !== null) chain.unshift(m0); }
          if (ri === runs.length - 1 && openAlong(k, sOf[chain[chain.length - 1]], SL)) { var m1 = nearestOf(H1.mouth, chain[chain.length - 1]); if (m1 !== null) chain.push(m1); }
          if (chain.length < 2) {                           // a lone edge anchor between two closed stretches
            if (!used[chain[0]]) { var r0 = nearestOf(railIds, chain[0]); if (r0 !== null) out.push({ name: pair[1], color: "#6f9a58", mode: "cross", visible: true, aOnOutline: false, A: [chain[0]], B: [r0] }); }
            return;
          }
          for (var i = 1; i < chain.length; i += 2) {
            var B = [chain[i - 1]]; if (i + 1 < chain.length) B.push(chain[i + 1]);
            out.push({ name: pair[1], color: "#6f9a58", mode: "cross", visible: true, aOnOutline: false, A: [chain[i]], B: B });
          }
        });
      });
      return out;
    }

    // the green corridor: the shared band's piece, or (without the railway file) offset from this cell's spine
    var corridor, sideM = null;
    if (BAND && GREENB) {
      var wo = [], wi = [];
      BAND.samples.forEach(function (q) { var lq = L(q.p); if (inside(R, lq[0], lq[1])) { wo.push(q.wL); wi.push(q.wR); } });
      sideM = [median(wo), median(wi)];
      corridor = { left: BAND.left, right: BAND.right, widthM: sideM[0] + sideM[1], sideM: sideM, shared: true, unknownStations: [],
                   source: "green", sourceFile: BAND.sourceFile, year: BAND.year };
    }
    else if (BAND) corridor = { left: BAND.left, right: BAND.right, widthM: opt.corridorM, shared: true, unknownStations: BAND.unknownStations };
    else {
      var cL = [], cR = [];
      for (var cs = 0; cs <= SL + 1e-6; cs += SL / 240) {
        var cg = dirAt(cs), cn = [-cg.t[1], cg.t[0]];
        cL.push([cg.p[0] + cn[0] * w2 + E0, cg.p[1] + cn[1] * w2 + N0]);
        cR.push([cg.p[0] - cn[0] * w2 + E0, cg.p[1] - cn[1] * w2 + N0]);
      }
      corridor = { left: cL, right: cR, widthM: opt.corridorM, shared: false };
    }
    corridor.spine = sp.map(function (q) { return [q[0] + E0, q[1] + N0]; });
    return {
      ok: true, anchors: anchors, nextId: nextId, groups: groups, active: Math.min(2, groups.length - 1), corridor: corridor,
      stats: { roadEnds: roadEnds, station: station, outside: [sideA[0].length, sideA[1].length], inside: [interior[0].length, interior[1].length],
               spineKm: SL / 1000, exactMouths: exactMouths, widthM: sideM ? [sideM[0] + sideM[1], sideM[0] + sideM[1]] : [opt.corridorM, opt.corridorM],
               sideM: sideM, connect: opt.connect === "all" ? "all" : "nearby" }
    };
  }

  /* ======================================================================== cells in the spine */
  function spineRecipe(X) {
    var pack = X.pack, opt = X.opt, E0 = X.E0, N0 = X.N0, L = X.L, R = X.R, RC = X.RC, per = X.per, band = X.band, Cn = LC();
    if (!band || !band.samples.length) return { ok: false, why: "the corridor does not reach this cell" };
    var spacing = Math.max(300, +opt.ribM || 1200), between = Math.max(0, Math.round(opt.between == null ? 1 : +opt.between));
    var anchors = {}, nextId = 1;
    function add(p) { var id = nextId++; anchors[id] = { x: p[0], y: p[1] }; return id; }
    function edgeAt(sig, r) {                                   // local point on the edge, and the outward normal
      var c = Cn.sampleAt(band, r), q = sig > 0 ? c.L : c.Rt;
      return { p: L(q), u: sig > 0 ? c.n : [-c.n[0], -c.n[1]], w: c.w, ws: sig > 0 ? c.wL : c.wR };   // ws: this side's width
    }
    var gates = (pack.gateways || []).map(function (g) {
      var rn = Cn.relNear(band, g), c = Cn.sampleAt(band, rn.r);
      var lg = L(g);
      var side = ((g[0] - c.p[0]) * c.n[0] + (g[1] - c.p[1]) * c.n[1]) >= 0 ? 1 : -1;
      return { g: lg, s: nearestOnRing(R, RC, lg[0], lg[1]).s, r: rn.r, d: rn.d, w: c.w, ws: side > 0 ? c.wL : c.wR, used: false, side: side };
    });

    /* THE LADDER. For each stretch of corridor edge inside the cell, this side's outline is the way round the
       ring from where the edge enters to where it leaves that lies on this side of the corridor. The rib feet are
       spaced evenly along the edge (one per rib spacing), the rib ends evenly along that outline, and the n-th
       foot is paired with the n-th end -- so ribs never cross or crowd together, however the corridor bends, and
       the corners share out among all the bays. A road end on that outline takes the nearest rib end's place. */
    var edgeAnchors = [], sides = { "1": [], "-1": [] }, ribCount = { "1": 0, "-1": 0 }, gateRibs = { "1": 0, "-1": 0 };
    function arcFwd(s0, s1) { return ((s1 - s0) % per + per) % per; }          // along increasing arc length
    // how much of a stretch of outline lies beyond the corridor on side sig: 24 points along it, counted
    function arcScore(s0, len, dv, sig) {
      var n = 0;
      for (var k = 1; k < 24; k++) {
        var q = onRing(R, RC, s0 + dv * len * k / 24), qb = [q[0] + E0, q[1] + N0], c = Cn.sampleAt(band, Cn.relNear(band, qb).r);
        var o = (qb[0] - c.p[0]) * c.n[0] + (qb[1] - c.p[1]) * c.n[1];
        if (sig > 0 ? o > c.wL : -o > c.wR) n++;                // beyond this side's own edge
      }
      return n;
    }
    [1, -1].forEach(function (sig) {
      var Xs = Cn.edgeCrossings(band, pack.ring, sig > 0 ? "L" : "Rt");
      // the stretches of this edge inside the cell: between consecutive crossings whose middle is inside
      for (var i = 0; i + 1 < Xs.length; i++) {
        var ra = Xs[i].r, rb = Xs[i + 1].r;
        var mid = edgeAt(sig, (ra + rb) / 2);
        if (!inside(R, mid.p[0], mid.p[1]) || rb - ra < 0.3 * spacing) continue;
        var pa = L(Xs[i].p), pb = L(Xs[i + 1].p);
        var sa = nearestOnRing(R, RC, pa[0], pa[1]).s, sb = nearestOnRing(R, RC, pb[0], pb[1]).s;
        var fwd = arcFwd(sa, sb), back = per - fwd;
        // this side's outline: of the two ways round, the one lying beyond the corridor on this side (a single
        // midpoint is not enough -- where the railway leaves the cell along its edge both midpoints can test alike)
        var scF = arcScore(sa, fwd, 1, sig), scB = arcScore(sa, back, -1, sig);
        var dir = scF > scB ? 1 : scB > scF ? -1 : (fwd >= back ? 1 : -1);
        var span = dir > 0 ? fwd : back;
        var n = Math.max(0, Math.round((rb - ra) / spacing) - 1), arcStep = span / (n + 1);
        var ribs = [];
        for (var j = 1; j <= n; j++) ribs.push({ r: ra + (rb - ra) * j / (n + 1), along: arcStep * j, gate: false });
        gates.forEach(function (G) {
          if (G.used || G.d <= G.ws + 50) return;                 // a road end inside the corridor on its side
          var along = dir > 0 ? arcFwd(sa, G.s) : arcFwd(G.s, sa);
          if (!(along > 0 && along < span)) return;
          var k = Math.round(along / arcStep);
          if (k < 1 || k > n || ribs[k - 1].gate || Math.abs(along - arcStep * k) > 0.5 * arcStep) return;
          ribs[k - 1].along = along; ribs[k - 1].o = G.g; ribs[k - 1].gate = true; G.used = true;
        });
        var chain = [{ r: ra, mouth: true, p: pa, s: sa }];
        ribs.forEach(function (b) {
          var e = edgeAt(sig, b.r);
          if (e.ws < MIN_SIDE || !inside(R, e.p[0], e.p[1])) return;  // no foot where this side has closed up
          var sv = sa + dir * b.along;
          chain.push({ r: b.r, e: e.p, o: b.o || onRing(R, RC, sv), s: sv, gate: b.gate });
        });
        chain.push({ r: rb, mouth: true, p: pb, s: sa + dir * span });
        // anchors: a mouth is one point, on the outline and on the corridor edge at once
        chain.forEach(function (c) {
          if (c.mouth) { c.oid = c.eid = add(c.p); edgeAnchors.push({ id: c.eid, r: c.r }); }
          else { c.eid = add(c.e); c.oid = add(c.o); edgeAnchors.push({ id: c.eid, r: c.r }); ribCount[sig]++; if (c.gate) gateRibs[sig]++; }
        });
        sides[sig].push({ chain: chain, dir: dir });
      }
    });

    // bays: his groups, one per stretch between two ribs, on each side -- and along the corridor edge of each bay,
    // a thread from rib foot to rib foot, so the corridor is closed along its edge and a road can run along it
    var ribGroups = { "1": [], "-1": [] }, edgeGroups = { "1": [], "-1": [] };
    // is this side of the corridor open all along the rail from r0 to r1? (the corridor app's edges can close up)
    function openR(sig, r0, r1) {
      var a = Math.min(r0, r1), b = Math.max(r0, r1), n = Math.max(1, Math.ceil((b - a) / 50));
      for (var i = 0; i <= n; i++) if (edgeAt(sig, a + (b - a) * i / n).ws < MIN_SIDE) return false;
      return true;
    }
    [1, -1].forEach(function (sig) {
      sides[sig].forEach(function (side) {
        var chain = side.chain, dir = side.dir;
        for (var k = 0; k + 1 < chain.length; k++) {
          var a = chain[k], b = chain[k + 1], A = [a.oid], B = [a.eid], d = b.s - a.s;   // along this side's outline
          for (var j = 1; j <= between; j++) A.push(add(onRing(R, RC, a.s + d * j / (between + 1))));
          var E = [];
          for (j = 1; j <= between; j++) {
            var re = a.r + (b.r - a.r) * j / (between + 1), e = edgeAt(sig, re);
            if (e.ws >= MIN_SIDE && inside(R, e.p[0], e.p[1])) { var id = add(e.p); B.push(id); E.push(id); edgeAnchors.push({ id: id, r: re }); }
          }
          if (openR(sig, a.r, b.r)) edgeGroups[sig].push({ A: [a.eid], B: E.concat([b.eid]) });   // not through a town
          // road ends on this bay's stretch of outline that did not become rib ends join its outline anchors
          gates.forEach(function (G) {
            if (G.used || G.d <= G.ws + 50) return;
            var off = dir > 0 ? arcFwd(a.s, G.s) : arcFwd(G.s, a.s);
            if (off > 1 && off < Math.abs(d) - 1) { G.used = true; G.bay = true; A.push(add(G.g)); }
          });
          A.push(b.oid); B.push(b.eid);
          ribGroups[sig].push({ A: A, B: B });
        }
      });
    });

    /* The railway through the cell. A rail point every rib spacing along each stretch of rail inside the cell;
       each is threaded to the next one along the rail and to the corridor-edge anchors within a bay of it -- the
       weave inside the corridor. The chain along the rail is the line his level 1 road follows: every rail point
       is in two groups, so his road builder counts it as shared and routes through it; the only two entrances
       (his "Road north" / "Road south") are where the railway enters and leaves the cell. So level 1 runs along
       the corridor, from end to end, and the ribs become the streets off it -- no star round a centre. */
    var spineGroups = [], cross = band.cross || [], rail = [];
    for (var i = 0; i + 1 < cross.length; i++) {
      if (!cross[i].into) continue;
      var a = cross[i].r, b = cross[i + 1].r, n = Math.max(1, Math.round((b - a) / spacing)), bay = (b - a) / n;
      if (b - a < 0.3 * spacing) continue;
      for (var j = 0; j < n; j++) {
        var u = a + bay * (j + 0.5), q = L(Cn.at(band.s0 + u));
        if (inside(R, q[0], q[1])) rail.push({ id: add(q), u: u, bay: bay });
      }
    }
    rail.forEach(function (rp, k) {
      var B = [];
      if (k + 1 < rail.length) B.push(rail[k + 1].id);
      edgeAnchors.forEach(function (e) { if (Math.abs(e.r - rp.u) <= rp.bay + 1) B.push(e.id); });
      if (B.length) spineGroups.push({ A: [rp.id], B: B });
    });
    // the two entrances: where the railway first enters the cell and where it last leaves it, on the outline
    var gatesAt = [];
    if (rail.length) {
      var firstIn = null, lastOut = null;
      cross.forEach(function (x) { if (x.into && !firstIn) firstIn = x; if (!x.into) lastOut = x; });
      if (firstIn) gatesAt.push({ p: L(firstIn.p), to: rail[0].id });
      if (lastOut && lastOut.r > (firstIn ? firstIn.r : -Infinity)) gatesAt.push({ p: L(lastOut.p), to: rail[rail.length - 1].id });
    }

    // north and south: the side the corridor's left normal points to, taken over the stretch inside the cell
    var ny = 0;
    band.samples.forEach(function (sm) { var q = L(sm.p); if (inside(R, q[0], q[1])) ny += sm.n[1]; });
    if (!ny) band.samples.forEach(function (sm) { ny += sm.n[1]; });
    var northSig = ny >= 0 ? 1 : -1, name = {}; name[northSig] = "Rib north"; name[-northSig] = "Rib south";
    var groups = [];
    spineGroups.forEach(function (g, k) { groups.push({ name: "Spine " + (k + 1), color: "#8c9a78", mode: "cross", visible: true, aOnOutline: false, A: g.A, B: g.B }); });
    if (gatesAt.length) {
      var gw2 = gatesAt.map(function (G) { return { A: [add(G.p)], B: [G.to], y: G.p[1] }; });
      gw2.sort(function (x, y) { return x.y - y.y; });                       // the southern one first, as his order
      var nm = gw2.length > 1 ? ["Road south", "Road north"] : ["Road north"];
      gw2.forEach(function (G, k) { groups.push({ name: nm[k], color: "#5f5a54", mode: "cross", visible: true, aOnOutline: true, A: G.A, B: G.B }); });
    }
    var active = groups.length;
    var edgeName = {}; edgeName[northSig] = "Edge north"; edgeName[-northSig] = "Edge south";
    [-northSig, northSig].forEach(function (sig) {
      edgeGroups[sig].forEach(function (g, k) { groups.push({ name: edgeName[sig] + " " + (k + 1), color: "#6f9a58", mode: "cross", visible: true, aOnOutline: false, A: g.A, B: g.B }); });
    });
    [-northSig, northSig].forEach(function (sig) {
      ribGroups[sig].forEach(function (g, k) { groups.push({ name: name[sig] + " " + (k + 1), color: "#7b7671", mode: "cross", visible: true, aOnOutline: true, A: g.A, B: g.B }); });
    });
    if (!groups.length) return { ok: false, why: "the corridor only touches this cell -- no room for ribs" };

    // widths inside the cell, for the note
    var wIn = [], wo = [], wi = [];
    band.samples.forEach(function (s) { var q = L(s.p); if (inside(R, q[0], q[1])) { wIn.push(s.w); if (s.wL !== undefined) { wo.push(s.wL); wi.push(s.wR); } } });
    var green = band.source === "green";
    if (green && !wo.length) {
      // the railway runs outside this cell: the widths where the corridor's edges are inside it, else nearest it
      band.samples.forEach(function (s) {
        var l = L(s.L), rr = L(s.Rt), a = inside(R, l[0], l[1]), b = inside(R, rr[0], rr[1]);
        if (a) wo.push(s.wL); if (b) wi.push(s.wR); if (a || b) wIn.push(s.w);
      });
      if (!wo.length && !wi.length) {
        var c0 = vavg(R), sn = Cn.sampleAt(band, Cn.relNear(band, [c0[0] + E0, c0[1] + N0]).r);
        wo.push(sn.wL); wi.push(sn.wR); wIn.push(sn.w);
      }
    }
    var sideM = green ? [wo.length ? median(wo) : 0, wi.length ? median(wi) : 0] : null;
    var roadEnds = [gateRibs[-northSig] + gates.filter(function (G) { return G.bay && G.side === -northSig; }).length,
                    gateRibs[northSig] + gates.filter(function (G) { return G.bay && G.side === northSig; }).length];
    return {
      ok: true, anchors: anchors, nextId: nextId, groups: groups, active: Math.min(active, groups.length - 1),
      roads: { mainDensity: 10 },                              // his level 1 target: the spine, without extra branches
      corridor: green ? { left: band.left, right: band.right, widthM: sideM ? sideM[0] + sideM[1] : opt.corridorSpineM, sideM: sideM, shared: true, tapers: [],
                          unknownStations: [], source: "green", sourceFile: band.sourceFile, year: band.year }
                      : { left: band.left, right: band.right, widthM: opt.corridorSpineM, shared: true, tapers: band.tapers, unknownStations: band.unknownStations },
      stats: { ribs: [ribCount[-northSig], ribCount[northSig]], gateRibs: [gateRibs[-northSig], gateRibs[northSig]], spineGroups: spineGroups.length,
               bays: [ribGroups[-northSig].length, ribGroups[northSig].length], railInKm: railInside(band, R, L) / 1000,
               widthM: wIn.length ? [Math.min.apply(null, wIn), Math.max.apply(null, wIn)] : [opt.corridorSpineM, opt.corridorSpineM],
               tapers: (band.tapers || []).map(function (t) { return t.id; }), sideM: sideM,
               roadEnds: roadEnds, roadEndsLeft: gates.filter(function (G) { return !G.used; }).length,
               entrances: gatesAt.length, railPoints: rail.length }
    };
  }
  function railInside(band, R, L) {
    var c = band.cross || [], s = 0;
    for (var i = 0; i + 1 < c.length; i++) if (c[i].into) s += c[i + 1].r - c[i].r;
    return s;
  }

  /* ======================================================================== his settings file */
  function finish(X, M) {
    var pack = X.pack, R = X.R, cellA = X.cellA, E0 = X.E0, N0 = X.N0, groups = M.groups, anchors = M.anchors;
    var threads = groups.reduce(function (s, g) {
      var seen = {}, n = 0;
      g.A.forEach(function (a) { g.B.forEach(function (b) { if (a === b) return; var k = a < b ? a + "_" + b : b + "_" + a; if (!seen[k]) { seen[k] = 1; n++; } }); });
      return s + n;
    }, 0);
    // written at his calibration size, about the outline's vertex average
    var c0 = vavg(R), f = Math.sqrt(HIS_AREA / cellA);
    function W(p) { return [c0[0] + (p[0] - c0[0]) * f, c0[1] + (p[1] - c0[1]) * f]; }
    var boundary = R.map(W), anchorsW = {};
    Object.keys(anchors).forEach(function (id) { var p = W([anchors[id].x, anchors[id].y]); anchorsW[id] = { x: p[0], y: p[1] }; });
    // his magnet range from segments, on this geometry at his size
    var segSum = 0, segN = 0;
    groups.forEach(function (g) {
      g.A.forEach(function (a) { g.B.forEach(function (b) {
        if (a === b) return;
        segSum += Math.hypot(anchorsW[a].x - anchorsW[b].x, anchorsW[a].y - anchorsW[b].y) / SEGS; segN++;
      }); });
    });
    var params = JSON.parse(JSON.stringify(DEFINITION));
    if (segN) params.magR = +(MAG_K * segSum / segN).toFixed(4);
    var pp = JSON.parse(JSON.stringify(PARCEL));
    var bb = [1e300, 1e300, -1e300, -1e300];
    boundary.forEach(function (p) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
    // his autoCell rule, on the file's own (calibration-size) geometry; it is scaled up with everything else
    pp.cell = Math.max(0.05, Math.min(1, Math.round(Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 1400 * 100) / 100));
    var roads = JSON.parse(JSON.stringify(ROADS));
    Object.keys(M.roads || {}).forEach(function (k) { roads[k] = M.roads[k]; });
    var settings = {
      app: "Wool Thread", version: 5, params: params, parcelParams: pp, roadParams: roads,
      model: { boundary: boundary, anchors: anchorsW, nextId: M.nextId, groups: groups, active: M.active, units: "m" },
      siteAreaTargetM2: cellA, siteAreaCalibrationManual: true,
      loopCity: { cell: pack.id, kind: M.kind, E0: E0, N0: N0, frame: "x = E - E0, y = N - N0, metres, y north",
                  corridor: M.corridor && M.corridor.source === "green" ? { source: M.corridor.sourceFile, year: M.corridor.year } : "fixed widths" }
    };
    var st = M.stats;
    st.areaKm2 = cellA / 1e6; st.across = Math.sqrt(cellA); st.threads = threads; st.groups = groups.length;
    st.scaleUp = 1 / f; st.gridM = pp.cell / f; st.magRM = params.magR / f;
    return { ok: true, kind: M.kind, settings: settings, frame: { E0: E0, N0: N0 }, opt: X.opt, corridor: M.corridor, stats: st };
  }

  root.WoolCell = { build: build, defaults: defaults, kindOf: kindOf, HIS_AREA: HIS_AREA, WIDTH_NODE: WIDTH_NODE, WIDTH_SPINE: WIDTH_SPINE, MIN_SIDE: MIN_SIDE };
})(window);
