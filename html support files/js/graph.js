/* ------------------------------------------------------------------------------------------------
   LOOP CITY - combined app v2
   graph.js : the road NETWORK. Junctions and edges, not a pile of pixels.

   Why this file exists, in one paragraph. roads.js turns a 1,106 m-wide vein into a one-cell
   centreline, and that was the right first move - but a centreline is still only ink. Measured on
   the shipped v1: the extracted lines came back as hundreds of disconnected fragments, which read
   on screen as a broken drawing rather than a network; and of the 818,592 cells of open ground the
   network enclosed ZERO, because the agents hug a settlement and never finish the circuit. Cutting
   parcels out of that produced one parcel of 7,048 km2 - the whole sheet - and reported no error at
   all. A number that wrong, arriving quietly, is the worst thing this project can produce.

   Both faults are the same fault: there was no graph. Once there is one,
     - the centrelines are the graph's EDGES, so they are connected by construction and cannot come
       out as fragments;
     - the roads are those same edges given a width, so the drawing and the geometry are one thing;
     - and a parcel is a FACE of the planar graph, which is a closed ring by definition. Nothing
       needs to be flood-filled, nothing needs to be "checked for closure", and a face that is the
       whole sheet cannot be produced by accident - it would have to be a real ring.

   This file does not re-implement roads.js. It assumes window.Roads and calls thinZS, pruneSpurs,
   traceSkeleton, simplify, raster4, polyLengthM, crossA and countNodes. Those are tested; a second
   copy of them would only be a second thing to keep in step.

   Coordinates: CELL units of whichever grid you hand it, cell centres, exactly as roads.js. The
   +0.5 and the cellE / cellN that turn a cell into metres belong to the caller.

   ES5 on purpose: var and function, typed arrays, no arrow functions, no modules, no imports, no
   DOM. Every loop that could recurse uses an explicit stack instead - a traced vein is 40,000
   points and the sheet is 950 x 865, and the recursive form of any of this does not slow down, it
   throws. There is no Node on this machine, so nothing here can be run before it reaches a browser.
   That is why selfCheck() is not optional.
   ------------------------------------------------------------------------------------------------ */

(function () {
  'use strict';

  /* Fail here, loudly, rather than three functions later with an undefined. A module that quietly
     does nothing is the exact failure this app keeps having to design out. */
  if (!window.Roads) {
    throw new Error('graph.js needs roads.js loaded first: <script src="js/roads.js"> before this one.');
  }
  var RD = window.Roads;

  /* The eight neighbours in Zhang-Suen's ring order, starting north and going clockwise. Same order
     as roads.js, and it has to be: crossA() is borrowed from there and reads a ring written in this
     order. roads.js keeps its own ringInto() private, so the eight reads are repeated here - eight
     array lookups, not an algorithm. */
  var DX = [0, 1, 1, 1, 0, -1, -1, -1];
  var DY = [-1, -1, 0, 1, 1, 1, 0, -1];

  var DEFAULTS = {
    pruneCells: 6,        // thinning barbs shorter than this are not roads
    bridgeCells: 6,       // a gap this wide or less is a junction that the mould merely missed
    simplifyCells: 1.0,   // Douglas-Peucker tolerance, in cells
    smoothPasses: 2,      // Chaikin corner cutting, endpoints pinned
    border: false,        // close faces against the sheet edge
    borderSnap: 6         // a loose end this close to the edge is taken to reach it
  };

  /* Diagnostics from the last call of each heavy function. The panel chips read these; nothing in
     the geometry does. */
  var stats = {
    maskCells: 0, skelCells: 0, prunedCells: 0,
    ends: 0, bridges: 0, bridgeCells: 0,
    nodes: 0, edges: 0, loops: 0, dangling: 0, specks: 0,
    syntheticNodes: 0, forcedNodes: 0, degenerateDropped: 0, lengthCells: 0,
    coreNodes: 0, coreEdges: 0,
    faceRings: 0, faceOuter: 0, faceKept: 0, faceDegenerate: 0, faceComponents: 0,
    faceTraversalOk: false, faceEulerOk: false, faceBorder: false, borderUnattached: false
  };

  function withDefaults(opts) {
    var o = {}, k;
    for (k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) o[k] = DEFAULTS[k];
    if (opts) for (k in opts) if (opts.hasOwnProperty(k) && opts[k] !== undefined && opts[k] !== null) o[k] = opts[k];
    return o;
  }

  function countSet(m) {
    var c = 0, i;
    for (i = 0; i < m.length; i++) if (m[i]) c++;
    return c;
  }

  /* The eight neighbours of (x,y). Outside the array is 0: nothing is ever classified as a junction
     because of ground that is not there. */
  function ring8(m, w, h, x, y, p) {
    var d, nx, ny;
    for (d = 0; d < 8; d++) {
      nx = x + DX[d];
      ny = y + DY[d];
      p[d] = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : (m[ny * w + nx] ? 1 : 0);
    }
  }

  /* ------------------------------------------------------------------- Chaikin, endpoints pinned

     Each pass replaces every corner with two points a quarter and three quarters along, so the
     staircase the mould leaves on a 92.6 m cell converges on a quadratic B-spline through the same
     ground. Simplify FIRST and then smooth: smoothing noise only gives you smooth noise.

     The first and last point are copied through verbatim - not recomputed, copied - and that is the
     whole reason this is written out here instead of reusing the app's chaikin() with closed=false.
     If smoothing moves an endpoint by even a floating-point hair, the two edges that met at that
     junction no longer meet, the face traversal walks off into the wrong ring, and the parcel comes
     out as a plausible-looking outline with a wrong area. selfCheck compares endpoints before and
     after with ===, not with a tolerance, because a tolerance would let exactly that through.

     A closed edge (a ring with one synthetic node) is smoothed the same open way, so its one pinned
     point keeps its cell-scale corner while the rest of the ring rounds. That is a visible kink on
     one vertex of a long ring, and it is the price of the endpoints being exactly where the graph
     says they are. Do not "fix" it by smoothing the ring closed. */
  function chaikinPinned(flat, iters) {
    var a = flat, t, i, k, n, out, res, x0, y0, x1, y1;
    for (t = 0; t < iters; t++) {
      n = a.length;
      if (n < 6) return a;                       // two points is already as smooth as it gets
      out = [];
      out.push(a[0], a[1]);
      for (i = 0; i + 3 < n; i += 2) {
        x0 = a[i]; y0 = a[i + 1]; x1 = a[i + 2]; y1 = a[i + 3];
        out.push(x0 + 0.25 * (x1 - x0), y0 + 0.25 * (y1 - y0),
                 x0 + 0.75 * (x1 - x0), y0 + 0.75 * (y1 - y0));
      }
      out.push(a[n - 2], a[n - 1]);
      res = new Float64Array(out.length);
      for (k = 0; k < out.length; k++) res[k] = out[k];
      a = res;
    }
    return a;
  }

  /* ------------------------------------------------------------------------ graph bookkeeping */

  /* src is the id this node or edge had in the graph build() made, and it is carried through every
     graph derived from it - the core, the bordered copy - so a face can always name the roads that
     bound it in the graph the caller is holding. A src of -1 means "not a road": the four sheet-edge
     segments and the little connectors that reach them. That -1 has to SURVIVE coring, which is why
     srcOf* reads the field rather than falling back to the id whenever it is negative. */
  function mkNode(nodes, x, y, src) {
    var nd = { id: nodes.length, src: (src === undefined ? nodes.length : src), x: x, y: y, deg: 0, edges: [] };
    nodes.push(nd);
    return nd.id;
  }

  /* One place where an edge is registered, so a self-loop cannot be counted once by accident. A
     loop puts its id in the node's list TWICE and adds 2 to the degree, because a loop really does
     leave the junction twice - and the face traversal below depends on that being true. */
  function addEdge(nodes, edges, a, b, pts, src, lengthCells) {
    var e = {
      id: edges.length,
      src: (src === undefined ? edges.length : src),
      a: a, b: b,
      pts: pts,
      lengthCells: (lengthCells === undefined) ? RD.polyLengthM(pts, 1, 1) : lengthCells,
      dangling: false
    };
    edges.push(e);
    nodes[a].edges.push(e.id); nodes[a].deg++;
    nodes[b].edges.push(e.id); nodes[b].deg++;
    return e;
  }

  /* The angle an edge leaves each of its two nodes at, taken from the RAW traced cells and then
     carried, unchanged, through simplifying, smoothing, coring and the border.

     It would be easier to read the angle back off the polyline in faces(), and that is a bug
     waiting: the order of the roads round a junction is a fact about the skeleton, and simplifying
     can move the second point of an edge a long way from the cell it actually stepped into. Two
     edges then appear to leave in the same direction, the sort has to break the tie arbitrarily, and
     an arbitrary tie is an embedding that cannot be drawn flat - the traversal merges two faces into
     one and Euler's count quietly stops adding up. Measured on the test field: 4 rings where there
     should have been 6. */
  function carryAngles(ne, oe) {
    ne.angA = (oe && oe.angA !== undefined) ? oe.angA : leaveAngle(ne.pts, false);
    ne.angB = (oe && oe.angB !== undefined) ? oe.angB : leaveAngle(ne.pts, true);
  }

  /* The points of an edge, ordered so they start at the given node. */
  function ptsFrom(e, node) {
    var p = e.pts, n = p.length >> 1, out, i;
    if (e.a === node) return p;
    out = new Float64Array(p.length);
    for (i = 0; i < n; i++) { out[2 * i] = p[2 * (n - 1 - i)]; out[2 * i + 1] = p[2 * (n - 1 - i) + 1]; }
    return out;
  }

  function markDangling(nodes, edges) {
    var i, e, n = 0;
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      e.dangling = (nodes[e.a].deg === 1 || nodes[e.b].deg === 1);
      if (e.dangling) n++;
    }
    return n;
  }

  function srcOfNode(nd) { return (nd.src === undefined) ? nd.id : nd.src; }
  function srcOfEdge(e) { return (e.src === undefined) ? e.id : e.src; }

  /* ------------------------------------------------------------------- 1 . bridge near-misses

     Every degree-1 end that lies within maxGap cells of a skeleton cell the road does not already
     reach is joined to it by a four-connected line.

     A bridge is an honest claim, and it should be read as one: two roads passing within N metres of
     each other would, in any real plan, MEET. The mould does not know that. It lays trail by
     traffic, and a rim that carries a little less traffic than its neighbours simply stops - so the
     network it leaves is a tree that hugs the settlements, and a tree encloses nothing. This step is
     what makes faces exist at all. At 6 cells on the mould's grid a bridge is at most 556 m of new
     road, which is a plausible link road and not a plausible motorway; raise bridgeCells and you are
     drawing roads the model did not find, so the count is on a chip and in the stats.

     "Does not already reach" is measured ALONG the network, not in straight lines. A flood out from
     the end, 3 x maxGap steps deep, marks everything the road gets to the short way round; anything
     still unmarked inside the box is a genuine near-miss rather than a corner about to be cut. Test
     it with a straight-line distance instead and every bend in a road bridges itself into a shortcut
     across its own corner, which shortens the network and invents junctions that are not there.

     The gaps are all measured against the skeleton as it stands and drawn at the end, in one call to
     Roads.raster4 - four-connected, one axis a step, for the reason written at raster4 itself: a
     diagonal bridge leaves a hole the parcel fill walks straight through. */
  function bridgeEnds(skel, w, h, maxGap) {
    var n = w * h, out = new Uint8Array(n), i;
    for (i = 0; i < n; i++) out[i] = skel[i] ? 1 : 0;
    var res = { mask: out, ends: 0, bridges: 0, cells: 0 };
    if (!(maxGap >= 2)) return res;

    var gap = Math.floor(maxGap), lim = gap * gap, hops = 3 * gap;
    var p = new Uint8Array(8), ends = [], x, y;

    for (i = 0; i < n; i++) {
      if (!out[i]) continue;
      x = i % w; y = (i - x) / w;
      ring8(out, w, h, x, y, p);
      if (RD.crossA(p) === 1) ends.push(i);      // crossA, never a neighbour count - see roads.js
    }
    res.ends = ends.length;
    if (!ends.length) return res;

    /* seen[] is stamped with the end's own number rather than cleared, so the flood costs nothing
       per end beyond the cells it actually walks. The flood stays inside a box of side 2*hops+1, so
       the queue can be sized once for the worst case and reused. */
    var seen = new Int32Array(n), side = 2 * hops + 3, cap = side * side;
    var q = new Int32Array(cap), qd = new Int32Array(cap);
    var segs = [], e, tag, head, tail, cur, cd, d, nx, ny, j;
    var bx, by, bi, best, bestD2, dx, dy, d2;

    for (e = 0; e < ends.length; e++) {
      tag = e + 1;
      head = 0; tail = 0;
      q[tail] = ends[e]; qd[tail] = 0; tail++;
      seen[ends[e]] = tag;
      while (head < tail) {
        cur = q[head]; cd = qd[head]; head++;
        if (cd >= hops) continue;
        x = cur % w; y = (cur - x) / w;
        for (d = 0; d < 8; d++) {
          nx = x + DX[d]; ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          j = ny * w + nx;
          if (!out[j] || seen[j] === tag) continue;
          seen[j] = tag;
          if (tail >= cap) break;                // fuse; a corrupt mask must not overrun the queue
          q[tail] = j; qd[tail] = cd + 1; tail++;
        }
      }

      x = ends[e] % w; y = (ends[e] - x) / w;
      best = -1; bestD2 = Infinity;
      for (by = y - gap; by <= y + gap; by++) {
        if (by < 0 || by >= h) continue;
        for (bx = x - gap; bx <= x + gap; bx++) {
          if (bx < 0 || bx >= w) continue;
          bi = by * w + bx;
          if (!out[bi] || seen[bi] === tag) continue;
          dx = bx - x; dy = by - y; d2 = dx * dx + dy * dy;
          if (d2 > lim) continue;
          if (d2 < bestD2 || (d2 === bestD2 && bi < best)) { bestD2 = d2; best = bi; }
        }
      }
      if (best < 0) continue;
      bx = best % w; by = (best - bx) / w;
      segs.push(new Float64Array([x, y, bx, by]));
    }

    if (segs.length) {
      var bm = RD.raster4(segs, w, h);
      for (i = 0; i < n; i++) if (bm[i] && !out[i]) { out[i] = 1; res.cells++; }
      res.bridges = segs.length;
    }
    return res;
  }

  /* ---------------------------------------------------------------------- 2 . skeleton -> graph

     Nodes are the cells whose crossing number A(P1) is not 2: A == 1 is a free end, A >= 3 is a real
     junction, A == 0 is a speck. Never a neighbour COUNT - on a clean plus-sign the four cells
     around the centre each touch two arms diagonally, so counting neighbours calls five cells
     junctions where there is one crossroads, and hands back twelve stubs instead of four roads. That
     is Roads.crossA's whole reason for being exported.

     The chains between the nodes are not re-walked here. Roads.traceSkeleton already walks them, and
     it is the piece with the expensive lesson in it: it spends the diagonal steps that are only a
     short cut round a corner before anything moves, so no walk can take one, skip the cells it cut
     past and strand a real length of road outside the drawing. Re-writing that walk to "build a
     graph properly" would mean re-learning it. So the polylines come from there, and this function
     only has to decide which cell each polyline's ends belong to.

     A closed loop has no node at all to start from, so its first cell becomes ONE synthetic node and
     the ring becomes a single edge that starts and ends there. Without it a perfectly good ring -
     the most valuable thing on the sheet, because it is a parcel - would have no edge and no face. */
  function graphFromSkeleton(skel, w, h, st) {
    var n = w * h, polys = RD.traceSkeleton(skel, w, h);
    var A = new Uint8Array(n), p = new Uint8Array(8), i, x, y;
    for (i = 0; i < n; i++) {
      if (!skel[i]) continue;
      x = i % w; y = (i - x) / w;
      ring8(skel, w, h, x, y, p);
      A[i] = RD.crossA(p);
    }

    var nodeAt = new Int32Array(n), nodes = [], edges = [], k;
    for (i = 0; i < n; i++) nodeAt[i] = -1;

    function nodeForCell(cell) {
      if (nodeAt[cell] < 0) {
        var cx = cell % w;
        nodeAt[cell] = mkNode(nodes, cx, (cell - cx) / w);
      }
      return nodeAt[cell];
    }

    var synthetic = 0, forced = 0, loops = 0, pl, ax, ay, bx, by, ia, ib, na, nb, closed;
    for (k = 0; k < polys.length; k++) {
      pl = polys[k];
      if (!pl || pl.length < 4) continue;        // a one-point "road" is a speck; it draws nothing
      ax = pl[0]; ay = pl[1];
      bx = pl[pl.length - 2]; by = pl[pl.length - 1];
      ia = ay * w + ax;
      ib = by * w + bx;
      closed = (ia === ib);
      if (closed && A[ia] === 2) synthetic++;    // a ring: its start cell is made a node on purpose
      else {
        /* An end that the tracer stopped at but the crossing number calls a through-cell. On a
           skeleton out of thinZS this does not happen; it can on a mask that was never thinned. The
           cell is made a node anyway rather than dropped, because a road that stops somewhere really
           does stop somewhere, and a silently missing edge is worse than an honest extra node. */
        if (A[ia] === 2) forced++;
        if (A[ib] === 2) forced++;
      }
      na = nodeForCell(ia);
      nb = nodeForCell(ib);
      if (na === nb) loops++;
      carryAngles(addEdge(nodes, edges, na, nb, pl, edges.length), null);
    }

    st.syntheticNodes = synthetic;
    st.forcedNodes = forced;
    st.loops = loops;
    st.specks = 0;
    for (i = 0; i < n; i++) if (skel[i] && A[i] === 0) st.specks++;
    return { nodes: nodes, edges: edges };
  }

  /* --------------------------------------------------------------- collapsed cycles, after simplify

     Simplifying can slide one of two parallel routes exactly on top of the other. It happened on the
     test field: two roads left the same junction, ran two cells apart and met again, and at a
     tolerance of one cell the wiggle on one of them was inside the tolerance, so both came back as
     the same straight line from (28,43) to (30,43). The graph still said there were two ways round;
     the drawing said there was one; and the ring between them had no area for a parcel to be.

     When that has happened the two really are one road, and the graph has to say so. Anything that
     encloses nothing - a pair of coincident routes, or a self-loop that goes out and back along
     itself - is dropped, with the count in stats.degenerateDropped so it is never silent. The
     threshold is a true zero and not a small parcel: a sliver of even a hundredth of a cell is left
     alone, because deciding that a parcel is too small is the caller's job and not this file's. */
  var DEGEN_EPS = 1e-9;

  function ringArea(parts) {
    var r = [], i, k, p;
    for (k = 0; k < parts.length; k++) {
      p = parts[k];
      for (i = 0; i < p.length; i++) r.push(p[i]);
    }
    if (r.length < 6) return 0;
    r.push(r[0], r[1]);
    return signedArea(r);
  }

  function dropCollapsed(nodes, edges) {
    var keep = new Uint8Array(edges.length), i, j, k, e, key, groups = {}, gp;
    for (i = 0; i < edges.length; i++) keep[i] = 1;

    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      if (e.a !== e.b) continue;
      if (Math.abs(ringArea([e.pts])) <= DEGEN_EPS) keep[i] = 0;
    }
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      if (!keep[i] || e.a === e.b) continue;
      key = (e.a < e.b) ? (e.a + ',' + e.b) : (e.b + ',' + e.a);
      if (!groups.hasOwnProperty(key)) groups[key] = [];
      groups[key].push(i);
    }
    for (key in groups) {
      if (!groups.hasOwnProperty(key)) continue;
      gp = groups[key];
      if (gp.length < 2) continue;
      for (i = 0; i < gp.length; i++) {
        if (!keep[gp[i]]) continue;
        for (j = i + 1; j < gp.length; j++) {
          if (!keep[gp[j]]) continue;
          k = ringArea([ptsFrom(edges[gp[i]], edges[gp[i]].a),
                        ptsFrom(edges[gp[j]], edges[gp[i]].b)]);
          if (Math.abs(k) <= DEGEN_EPS) keep[gp[j]] = 0;
        }
      }
    }
    return keep;
  }

  /* ------------------------------------------------------------------------------- 3 . build */

  function build(mask, w, h, opts) {
    var o = withDefaults(opts), i;
    var st = {};
    for (i in stats) if (stats.hasOwnProperty(i)) st[i] = stats[i];

    st.maskCells = countSet(mask);

    /* a. one cell thick. b. barbs off. Both from roads.js, unchanged. */
    var skel = RD.thinZS(mask, w, h);
    st.skelCells = countSet(skel);
    var pruned = RD.pruneSpurs(skel, w, h, o.pruneCells);
    st.prunedCells = st.skelCells - countSet(pruned);

    /* c. bridge the near-misses. This is where faces come from. */
    var br = bridgeEnds(pruned, w, h, o.bridgeCells);
    st.ends = br.ends;
    st.bridges = br.bridges;
    st.bridgeCells = br.cells;

    /* d. re-thin. A bridge that runs alongside an existing road makes a two-cell blob, and a blob
          classifies as a row of junctions. Thinning again costs one pass over a small skeleton and
          means the graph is built on a line rather than on a smear. */
    var fin = br.bridges ? RD.thinZS(br.mask, w, h) : br.mask;

    /* e. the graph. */
    var g = graphFromSkeleton(fin, w, h, st);
    var nodes = g.nodes, edges = g.edges;

    /* f. simplify, then smooth, then measure. In that order, and the endpoints never move. */
    var e, pts, total = 0;
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      pts = RD.simplify(e.pts, o.simplifyCells);
      pts = chaikinPinned(pts, o.smoothPasses);
      e.pts = pts;
      e.lengthCells = RD.polyLengthM(pts, 1, 1);
    }

    /* g. anything that now encloses nothing is one road drawn twice. See dropCollapsed. */
    var keep = dropCollapsed(nodes, edges), dropped = 0;
    for (i = 0; i < edges.length; i++) if (!keep[i]) dropped++;
    if (dropped) {
      var nn = [], ne = [], nmap = new Int32Array(nodes.length), live = new Uint8Array(nodes.length);
      for (i = 0; i < edges.length; i++) if (keep[i]) { live[edges[i].a] = 1; live[edges[i].b] = 1; }
      for (i = 0; i < nodes.length; i++) nmap[i] = live[i] ? mkNode(nn, nodes[i].x, nodes[i].y) : -1;
      for (i = 0; i < edges.length; i++) {
        if (!keep[i]) continue;
        e = edges[i];
        carryAngles(addEdge(nn, ne, nmap[e.a], nmap[e.b], e.pts, undefined, e.lengthCells), e);
      }
      nodes = nn;
      edges = ne;
    }
    st.degenerateDropped = dropped;
    st.loops = 0;
    for (i = 0; i < edges.length; i++) {
      total += edges[i].lengthCells;
      if (edges[i].a === edges[i].b) st.loops++;
    }

    st.nodes = nodes.length;
    st.edges = edges.length;
    st.dangling = markDangling(nodes, edges);
    st.lengthCells = total;
    st.skeletonCells = countSet(fin);
    st.opts = o;

    for (i in st) if (st.hasOwnProperty(i) && stats.hasOwnProperty(i)) stats[i] = st[i];
    return { nodes: nodes, edges: edges, w: w, h: h, stats: st };
  }

  /* ------------------------------------------------------------------------------ 4 . coreOf

     The 2-core: drop every degree-1 node and its edge, and keep doing it until none are left.

     This is not tidying. A dangling edge bounds no face - there is no ground on one side of it that
     is not also on the other - so the face traversal walks UP it and straight back DOWN it, and
     emits that there-and-back as part of a ring. On a real network, which is mostly dangling ends,
     that turns every parcel outline into a fringe of zero-width spurs: the drawing the user called
     "broken lines", produced this time by the parcel code rather than the road code.

     Keep the full graph for DRAWING - those dead ends are real roads and belong in the DXF - and use
     the core for FACES. Nothing is lost; they are two views of the same edges.

     A self-loop counts 2 towards its node's degree, so a lone ring survives coring, which is right:
     a ring is exactly the thing a face needs. Ids are re-assigned so that nodes[id].id === id in
     every graph this module hands out, and each node and edge carries src - its id in the graph
     build() made - so a face can always say which road bounds it. */
  function coreOf(g) {
    var nN = g.nodes.length, nE = g.edges.length, i, k;
    var keepN = new Uint8Array(nN), keepE = new Uint8Array(nE), deg = new Int32Array(nN);
    for (i = 0; i < nN; i++) { keepN[i] = 1; deg[i] = g.nodes[i].deg; }
    for (i = 0; i < nE; i++) keepE[i] = 1;

    var stack = [], v, el, eid, e, other, fuse = 0, maxPush = nN + 2 * nE + 8;
    for (i = 0; i < nN; i++) if (deg[i] <= 1) stack.push(i);
    while (stack.length) {
      if (++fuse > maxPush) break;               // fuse; a corrupt graph must not hang the year
      v = stack.pop();
      if (!keepN[v] || deg[v] > 1) continue;
      keepN[v] = 0;
      el = g.nodes[v].edges;
      for (k = 0; k < el.length; k++) {
        eid = el[k];
        if (!keepE[eid]) continue;               // a loop sits in the list twice; drop it once
        keepE[eid] = 0;
        e = g.edges[eid];
        if (e.a === e.b) { deg[v] -= 2; continue; }
        deg[e.a]--; deg[e.b]--;
        other = (e.a === v) ? e.b : e.a;
        if (keepN[other] && deg[other] <= 1) stack.push(other);
      }
    }

    var map = new Int32Array(nN), nodes = [], edges = [], nd;
    for (i = 0; i < nN; i++) map[i] = -1;
    for (i = 0; i < nN; i++) {
      if (!keepN[i]) continue;
      nd = g.nodes[i];
      map[i] = mkNode(nodes, nd.x, nd.y, srcOfNode(nd));
    }
    for (i = 0; i < nE; i++) {
      if (!keepE[i]) continue;
      e = g.edges[i];
      carryAngles(addEdge(nodes, edges, map[e.a], map[e.b], e.pts, srcOfEdge(e), e.lengthCells), e);
      /* 22 Sep: the original points travel too. The parcel graph is cored, and without them its roads came out with
         no rawPts, so "Parcel jitter" and "Road curve" smoothed roads that were already smoothed. */
      if (e.rawPts) edges[edges.length - 1].rawPts = e.rawPts;
    }
    markDangling(nodes, edges);
    stats.coreNodes = nodes.length;
    stats.coreEdges = edges.length;
    return { nodes: nodes, edges: edges, w: g.w, h: g.h, stats: g.stats };
  }

  function componentCount(g) {
    var nN = g.nodes.length, seen = new Uint8Array(nN), c = 0, i, st, v, el, k, e, o;
    for (i = 0; i < nN; i++) {
      if (seen[i]) continue;
      c++; seen[i] = 1; st = [i];
      while (st.length) {
        v = st.pop();
        el = g.nodes[v].edges;
        for (k = 0; k < el.length; k++) {
          e = g.edges[el[k]];
          o = (e.a === v) ? e.b : e.a;
          if (!seen[o]) { seen[o] = 1; st.push(o); }
        }
      }
    }
    return c;
  }

  /* --------------------------------------------------------------------------- 5 . the border

     Optional, and only useful on the FULL graph, because what attaches to the sheet edge is a loose
     end and the core has none left.

     Four border edges round the sheet, split wherever a loose end reaches them, so a road running
     off the edge of the drawing closes its parcel against the edge instead of leaving it open. The
     faces that use one of those four sides are flagged edge:true, exactly as the parcel extractor
     already flags a piece cut by the sheet.

     The trap, and it is the 7,048 km2 one wearing a new hat: if NOTHING attaches, the border ring is
     its own separate component, and a purely combinatorial face traversal cannot know that the road
     network is inside it. It would hand back the whole sheet as one clean, closed, entirely wrong
     parcel. So an unattached border is refused and said out loud in stats.borderUnattached, rather
     than drawn. */
  function withBorder(g, o) {
    var w = g.w, h = g.h, i, k, nd, e;
    var nodes = [], edges = [], map = new Int32Array(g.nodes.length);

    for (i = 0; i < g.nodes.length; i++) {
      nd = g.nodes[i];
      map[i] = mkNode(nodes, nd.x, nd.y, srcOfNode(nd));
    }
    for (i = 0; i < g.edges.length; i++) {
      e = g.edges[i];
      carryAngles(addEdge(nodes, edges, map[e.a], map[e.b], e.pts, srcOfEdge(e), e.lengthCells), e);
    }

    /* corners first, so an end that lands exactly on one becomes THAT node instead of a twin of it
       sitting at the same coordinate with a zero-length edge between them */
    var cxs = [0, w - 1, w - 1, 0], cys = [0, 0, h - 1, h - 1], corner = [];
    for (i = 0; i < 4; i++) corner.push(mkNode(nodes, cxs[i], cys[i], -1));

    var sideOf = [[], [], [], []], at = {}, att = 0;
    var snap = o.borderSnap, x, y, dd, s, px, py, key, nid;

    for (i = 0; i < g.nodes.length; i++) {
      if (g.nodes[i].deg !== 1) continue;
      x = nodes[map[i]].x; y = nodes[map[i]].y;
      dd = [y, (w - 1) - x, (h - 1) - y, x];     // 0 top, 1 right, 2 bottom, 3 left
      s = 0;
      for (k = 1; k < 4; k++) if (dd[k] < dd[s]) s = k;
      if (dd[s] > snap) continue;
      px = x; py = y;
      if (s === 0) py = 0; else if (s === 1) px = w - 1; else if (s === 2) py = h - 1; else px = 0;

      key = px + ',' + py;
      if (at.hasOwnProperty(key)) nid = at[key];
      else {
        nid = -1;
        for (k = 0; k < 4; k++) if (nodes[corner[k]].x === px && nodes[corner[k]].y === py) nid = corner[k];
        if (nid < 0 && px === x && py === y) nid = map[i];               // already on the edge
        if (nid < 0) nid = mkNode(nodes, px, py, -1);
        at[key] = nid;
        if (nid !== corner[0] && nid !== corner[1] && nid !== corner[2] && nid !== corner[3]) {
          sideOf[s].push({ t: (s === 0 || s === 2) ? px : py, id: nid });
        }
      }
      if (nid !== map[i]) {
        carryAngles(addEdge(nodes, edges, map[i], nid, new Float64Array([x, y, px, py]), -1), null);
      }
      att++;
    }

    if (!att) return null;

    var s2, a0, b0, list, t0, t1, asc, chain, na, nb;
    for (s2 = 0; s2 < 4; s2++) {
      a0 = corner[s2];
      b0 = corner[(s2 + 1) & 3];
      list = sideOf[s2].slice();
      t0 = (s2 === 0 || s2 === 2) ? nodes[a0].x : nodes[a0].y;
      t1 = (s2 === 0 || s2 === 2) ? nodes[b0].x : nodes[b0].y;
      asc = t1 > t0;
      list.sort(function (pa, pb) { return asc ? (pa.t - pb.t) : (pb.t - pa.t); });
      chain = [a0];
      for (i = 0; i < list.length; i++) if (list[i].id !== chain[chain.length - 1]) chain.push(list[i].id);
      if (chain[chain.length - 1] !== b0) chain.push(b0);
      for (i = 0; i + 1 < chain.length; i++) {
        na = chain[i]; nb = chain[i + 1];
        if (nodes[na].x === nodes[nb].x && nodes[na].y === nodes[nb].y) continue;
        carryAngles(addEdge(nodes, edges, na, nb,
                new Float64Array([nodes[na].x, nodes[na].y, nodes[nb].x, nodes[nb].y]), -1), null);
      }
    }

    markDangling(nodes, edges);
    return { nodes: nodes, edges: edges, w: w, h: h, stats: g.stats };
  }

  /* ---------------------------------------------------------------------------- 6 . the faces

     Planar face traversal on half-edges. Every edge has two: 2e runs a -> b along its points, 2e+1
     runs b -> a against them. At each node the outgoing half-edges are sorted ONCE by the angle they
     leave at, and then

        next(h) = the half-edge clockwise-next from twin(h), about the node they share.

     Each half-edge belongs to exactly one face, so the whole thing costs one pass over 2E.

     Which ring is the OUTER one is not guessed and is not "the biggest". With the half-edges sorted
     counter-clockwise by angle and next() taking the clockwise neighbour, a bounded face is
     traversed counter-clockwise and therefore has POSITIVE signed area, and the unbounded one runs
     the other way round and comes out negative. Work it through on a unit square and the four steps
     close as A->B->C->D->A, shoelace +1; the outside closes as A->D->C->B->A, shoelace -1. So the
     rule is a sign, and it holds for every component separately, which matters because a sheet full
     of separate loops has one unbounded ring EACH and "the biggest" would only ever find one of
     them. The count of negatives must equal the number of connected components, and V - E + F = C
     must hold; both are checked and both are in the stats. If either is ever false the traversal is
     wrong, and a wrong parcel with a clean outline is the thing this module exists to prevent.

     Two honest limits, neither of which can be fixed by sorting harder:
     - a component sitting INSIDE a face of another component is not noticed. Combinatorially the two
       are unrelated, so the face round it is reported as if the inner one were not there. In this
       app the road network is one connected thing by the time it gets here, and stats.faceComponents
       says when it is not.
     - a cut edge inside the core - a lane joining two rings - is walked twice by the outer ring, and
       once you discard the outer ring that is exactly right. It never appears in a kept face.

     y points DOWN in cell coordinates, so a "counter-clockwise" ring here looks clockwise on screen.
     That changes nothing: the angles and the shoelace are computed in the same coordinates, and the
     areas are reported as magnitudes. */
  function faces(g, opts) {
    var o = withDefaults(opts), work = g, bordered = false;

    if (o.border) {
      var wb = withBorder(g, o);
      if (wb) { work = wb; bordered = true; stats.borderUnattached = false; }
      else stats.borderUnattached = true;        // said out loud, never drawn as a whole-sheet face
    }

    /* Coring here as well as in coreOf() is deliberate: faces() must be safe whichever of the two
       graphs it is handed, and coring a core is a no-op. */
    work = coreOf(work);
    stats.faceBorder = bordered;

    var E = work.edges.length, N = work.nodes.length, i, k, e;
    stats.faceRings = 0; stats.faceOuter = 0; stats.faceKept = 0; stats.faceDegenerate = 0;
    stats.faceComponents = componentCount(work);
    stats.faceTraversalOk = false;
    stats.faceEulerOk = false;
    if (!E) {
      stats.faceTraversalOk = (N === 0);
      stats.faceEulerOk = (N === 0);
      return [];
    }

    var HE = 2 * E, origin = new Int32Array(HE), ang = new Float64Array(HE);
    var byNode = [], pos = new Int32Array(HE);
    for (i = 0; i < N; i++) byNode.push([]);

    for (i = 0; i < E; i++) {
      e = work.edges[i];
      origin[2 * i] = e.a;
      origin[2 * i + 1] = e.b;
      /* the angles the SKELETON left at, not the angles the simplified line appears to leave at */
      ang[2 * i] = (e.angA !== undefined) ? e.angA : leaveAngle(e.pts, false);
      ang[2 * i + 1] = (e.angB !== undefined) ? e.angB : leaveAngle(e.pts, true);
      byNode[e.a].push(2 * i);
      byNode[e.b].push(2 * i + 1);
    }
    /* ties broken by id so two runs of the same field give the same parcels; two edges leaving one
       node in exactly the same direction cannot happen on a skeleton, but determinism is free */
    var cmp = function (p, q) { return (ang[p] - ang[q]) || (p - q); };
    for (i = 0; i < N; i++) {
      byNode[i].sort(cmp);
      for (k = 0; k < byNode[i].length; k++) pos[byNode[i][k]] = k;
    }

    function nextHE(he) {
      var tw = he ^ 1, v = origin[tw], arr = byNode[v], j = pos[tw] - 1;
      if (j < 0) j = arr.length - 1;
      return arr[j];
    }

    var used = new Uint8Array(HE), out = [], h0, h, ring, ids, guard, rev, area, per, isEdge, twice;
    var neg = 0, kept = 0, rings = 0, degen = 0;
    /* 22 Sep: the roads the UNBOUNDED ring walks. A road listed in one face only is either on the outside or a slit
       inside that face, and the outer-edge smoothing has to tell the two apart. */
    var outerSrc = {};

    for (h0 = 0; h0 < HE; h0++) {
      if (used[h0]) continue;
      ring = [];
      ids = [];
      isEdge = false;
      twice = false;
      h = h0;
      guard = 0;
      do {
        used[h] = 1;
        e = work.edges[h >> 1];
        rev = (h & 1) === 1;
        appendPts(ring, e.pts, rev);
        if (e.src < 0) isEdge = true; else if (ids.indexOf(e.src) < 0) ids.push(e.src); else twice = true;
        h = nextHE(h);
        if (++guard > HE + 4) break;             // fuse; every half-edge is spent exactly once
      } while (h !== h0);
      /* counted even when it is degenerate, because the count of negative rings is checked against
         the number of components below, and a ring quietly skipped would break that check rather
         than the thing it is watching for */
      if (ring.length < 4) { rings++; degen++; continue; }
      ring.push(ring[0], ring[1]);               // closed by construction, and closed on the wire

      rings++;
      area = signedArea(ring);
      /* Three outcomes and they are not the same thing. Positive is a bounded face. Negative is the
         unbounded one, and there is exactly one per component. Zero is neither: it is a ring that
         encloses nothing, which build() should already have taken out, so it is counted on its own
         and reported rather than quietly filed under "outer" - filed there it would break the count
         of components below and hide the reason. */
      if (Math.abs(area) <= DEGEN_EPS) { degen++; continue; }
      if (area < 0) { neg++; for (k = 0; k < ids.length; k++) outerSrc[ids[k]] = 1; continue; }
      per = 0;
      for (k = 0; k + 3 < ring.length; k += 2) {
        per += Math.sqrt((ring[k + 2] - ring[k]) * (ring[k + 2] - ring[k]) +
                         (ring[k + 3] - ring[k + 1]) * (ring[k + 3] - ring[k + 1]));
      }
      var fr = new Float64Array(ring.length);
      for (k = 0; k < ring.length; k++) fr[k] = ring[k];
      /* slit: the ring walks one road twice, down and back -- a road with this face on both sides */
      out.push({ id: kept, ring: fr, areaCells: area, perimCells: per, edgeIds: ids, edge: isEdge, slit: twice });
      kept++;
    }

    stats.faceRings = rings;
    stats.faceOuter = neg;
    stats.faceKept = kept;
    stats.faceDegenerate = degen;
    /* Two checks, and they are deliberately separate because they fail for different reasons.

       faceTraversalOk is pure counting: a face traversal on ANY rotation system produces exactly
       E - N + 2C rings, whatever the geometry is. If that number is wrong the walk itself is wrong -
       a next() that is not a permutation, a fuse that tripped, a half-edge spent twice.

       faceEulerOk is the geometric one: one unbounded ring per component and no ring enclosing
       nothing. It is what has to hold before a face can be called a parcel, and it can be false on
       an honest traversal - two edges lying on top of each other after simplifying will do it. Then
       the number to look at is faceDegenerate, not this one. */
    stats.faceTraversalOk = (rings === E - N + 2 * stats.faceComponents);
    stats.faceEulerOk = stats.faceTraversalOk && (neg === stats.faceComponents) && (degen === 0);
    out.outerSrc = outerSrc;
    return out;
  }

  /* The direction a half-edge leaves its node in. Scans past any repeated first point rather than
     trusting pts[2],pts[3] to be different - a zero-length first segment would sort the half-edge to
     a meaningless angle and send the traversal into the wrong ring. */
  function leaveAngle(pts, rev) {
    var n = pts.length >> 1, i, x0, y0;
    if (!rev) {
      x0 = pts[0]; y0 = pts[1];
      for (i = 1; i < n; i++) {
        if (pts[2 * i] !== x0 || pts[2 * i + 1] !== y0) return Math.atan2(pts[2 * i + 1] - y0, pts[2 * i] - x0);
      }
    } else {
      x0 = pts[2 * n - 2]; y0 = pts[2 * n - 1];
      for (i = n - 2; i >= 0; i--) {
        if (pts[2 * i] !== x0 || pts[2 * i + 1] !== y0) return Math.atan2(pts[2 * i + 1] - y0, pts[2 * i] - x0);
      }
    }
    return 0;
  }

  /* Every point except the last: the next half-edge starts at that node and pushes it as its own
     first point. Push it here as well and every junction appears twice in the ring. */
  function appendPts(ring, pts, rev) {
    var n = pts.length >> 1, i;
    if (!rev) { for (i = 0; i < n - 1; i++) ring.push(pts[2 * i], pts[2 * i + 1]); }
    else { for (i = n - 1; i > 0; i--) ring.push(pts[2 * i], pts[2 * i + 1]); }
  }

  function signedArea(ring) {
    var s = 0, i, n = ring.length;
    for (i = 0; i + 3 < n; i += 2) s += ring[i] * ring[i + 3] - ring[i + 2] * ring[i + 1];
    return s / 2;
  }

  /* -------------------------------------------------------------------------- 7 . toPolys */

  /* Flat coordinate arrays for the canvas, the DXF and the SVG, so all three draw the same thing.
     "all" is every edge including the dead ends - that is the road network as it is. "core" is the
     part that bounds something. "faces" is the parcels, closed. Nothing shorter than two points ever
     leaves here: a one-point polyline is not a line, and downstream it becomes either a stray dot in
     the drawing or a degenerate entity the DXF reader complains about. */
  function toPolys(g, which) {
    var out = [], i, src, fs;
    if (which === 'faces') {
      fs = faces(g);
      for (i = 0; i < fs.length; i++) if (fs[i].ring.length >= 4) out.push(fs[i].ring);
      return out;
    }
    src = (which === 'core') ? coreOf(g) : g;
    for (i = 0; i < src.edges.length; i++) {
      if (src.edges[i].pts && src.edges[i].pts.length >= 4) out.push(src.edges[i].pts);
    }
    return out;
  }

  /* ------------------------------------------------------------------------- 8 . offsetEdge */

  /* One edge offset both ways by a half width, so a road can be drawn as a double line with a fill
     between it instead of as a stroke. Segment normals, mitred at the joins, mitre limit 4.

     "left" is the +(-dy, dx) side. Cell y points DOWN, the way a canvas does, so that side is the
     one on your RIGHT looking along the road on screen. The two names are only labels for the two
     kerbs; nothing downstream should care which is which, and if anything ever does, it should say
     so out loud rather than assume.

     It self-intersects on a hairpin tighter than the width, and that is accepted rather than solved.
     A 30 m road on a 92.6 m cell is a third of a cell wide; a bend tight enough to fold the offset
     over itself is a bend below the resolution of the grid the road was found on, so the geometry
     that would be needed to clean it up would be cleaning up noise. If this is ever used at a width
     where that stops being true - an 8-lane section, or a coarse grid - the offset needs a real
     clipper, not a bigger mitre limit. */
  function offsetEdge(pts, halfWidth) {
    var P = [], i, x, y, n;
    for (i = 0; i < (pts.length >> 1); i++) {
      x = pts[2 * i]; y = pts[2 * i + 1];
      if (P.length >= 2 && P[P.length - 2] === x && P[P.length - 1] === y) continue;
      P.push(x, y);
    }
    n = P.length >> 1;
    if (n < 2) {
      return { left: new Float64Array(P), right: new Float64Array(P) };
    }

    var nx = new Float64Array(n - 1), ny = new Float64Array(n - 1), dx, dy, L;
    for (i = 0; i < n - 1; i++) {
      dx = P[2 * i + 2] - P[2 * i];
      dy = P[2 * i + 3] - P[2 * i + 1];
      L = Math.sqrt(dx * dx + dy * dy);
      if (L === 0) { nx[i] = 0; ny[i] = 0; } else { nx[i] = -dy / L; ny[i] = dx / L; }
    }

    var left = new Float64Array(n * 2), right = new Float64Array(n * 2), ax, ay, mx, my, ml, c;
    for (i = 0; i < n; i++) {
      if (i === 0) { ax = nx[0]; ay = ny[0]; }
      else if (i === n - 1) { ax = nx[n - 2]; ay = ny[n - 2]; }
      else {
        mx = nx[i - 1] + nx[i];
        my = ny[i - 1] + ny[i];
        ml = Math.sqrt(mx * mx + my * my);
        if (ml < 1e-12) { ax = nx[i]; ay = ny[i]; }   // a perfect reversal: no mitre exists
        else {
          mx /= ml; my /= ml;
          c = mx * nx[i] + my * ny[i];                // cosine of half the turn
          if (c < 0.25) c = 0.25;                     // mitre limit 4, or a hairpin throws a spike
          ax = mx / c; ay = my / c;
        }
      }
      left[2 * i] = P[2 * i] + halfWidth * ax;
      left[2 * i + 1] = P[2 * i + 1] + halfWidth * ay;
      right[2 * i] = P[2 * i] - halfWidth * ax;
      right[2 * i + 1] = P[2 * i + 1] - halfWidth * ay;
    }
    return { left: left, right: right };
  }

  /* -------------------------------------------------------------------------- 9 . selfCheck

     Nothing here can be run before it is in a browser, so this is how the module is tested: open the
     app and type RoadGraph.selfCheck() in the console. Every case is a few hundred cells, so it
     costs milliseconds and can be called on every boot.

     Each case is one thing that, if it broke, would produce a clean-looking parcel with a wrong
     number in it - which is the only kind of failure this app cannot survive. */
  function selfCheck() {
    var R = {}, i, x, y, g, fs, e;

    function box(w, h) { return new Uint8Array(w * h); }
    function rect(m, w, x0, y0, x1, y1) {           // the OUTLINE of a box, one cell thick
      var a, b;
      for (a = x0; a <= x1; a++) { m[y0 * w + a] = 1; m[y1 * w + a] = 1; }
      for (b = y0; b <= y1; b++) { m[b * w + x0] = 1; m[b * w + x1] = 1; }
    }
    var CLEAN = { pruneCells: 3, bridgeCells: 0, simplifyCells: 0.8, smoothPasses: 0 };

    /* --- a square ring: one closed edge, ONE face, and the area of the square it is ------------ */
    var sw = 32, sh = 32, sq = box(sw, sh);
    rect(sq, sw, 5, 5, 24, 24);
    g = build(sq, sw, sh, CLEAN);
    var sqNodes = RD.countNodes(sq, sw, sh);
    fs = faces(g);
    R.squareJunctions = sqNodes.junctions;
    R.squareNodes = g.nodes.length;
    R.squareEdges = g.edges.length;
    R.squareEdgeClosed = (g.edges.length === 1 && g.edges[0].a === g.edges[0].b);
    R.squareFaces = fs.length;
    R.squareAreaCells = fs.length ? Math.round(fs[0].areaCells * 100) / 100 : 0;
    R.squareTrueArea = 19 * 19;
    R.squareAreaErrPct = fs.length ? Math.round(Math.abs(fs[0].areaCells - 361) / 361 * 10000) / 100 : 100;
    R.squareIsOneClosedFace = ((sqNodes.junctions === 0 || sqNodes.junctions === 4) &&
                               g.edges.length === 1 && R.squareEdgeClosed &&
                               fs.length === 1 && R.squareAreaErrPct <= 3);
    /* and the same ring again with the app's real smoothing on, because that is what will actually
       be exported. Chaikin cuts a corner off every vertex, so a smoothed parcel must always enclose
       a little less than the staircase it came from, and the question is only how much. It is 1.8 %
       here and it stays inside the same 3 % - but only because thinning chamfers each corner of the
       square into two vertices first, so the cuts are cell-sized. Simplify a ring down to four long
       sides and then smooth it and the loss is an eighth of the area, whatever the ring's size.
       That is worth knowing before anyone raises the simplify tolerance to tidy a drawing. */
    var gs = build(sq, sw, sh, { pruneCells: 3, bridgeCells: 0, simplifyCells: 0.8, smoothPasses: 2 });
    var fss = faces(gs);
    R.squareAreaSmoothed = fss.length ? Math.round(fss[0].areaCells * 10) / 10 : 0;
    R.squareSmoothedLossPct = fss.length ? Math.round((1 - fss[0].areaCells / 361) * 1000) / 10 : 100;
    R.squareSmoothedStaysWithin3Pct = (fss.length === 1 &&
                                       Math.abs(fss[0].areaCells - 361) / 361 <= 0.03);

    /* --- a figure of eight: two squares sharing one cell must give TWO faces ------------------- */
    var fw = 42, fh = 42, f8 = box(fw, fh);
    rect(f8, fw, 5, 5, 20, 20);
    rect(f8, fw, 20, 20, 35, 35);
    g = build(f8, fw, fh, CLEAN);
    fs = faces(g);
    R.eightNodes = g.nodes.length;
    R.eightEdges = g.edges.length;
    R.eightFaces = fs.length;
    R.eightAreas = [];
    for (i = 0; i < fs.length; i++) R.eightAreas.push(Math.round(fs[i].areaCells));
    R.eightGivesTwoFaces = (fs.length === 2 && stats.faceEulerOk);

    /* --- a plus: ONE junction of degree 4, four dangling edges, no core, no faces -------------- */
    var pw = 42, ph = 42, plus = box(pw, ph);
    for (x = 5; x <= 35; x++) plus[20 * pw + x] = 1;
    for (y = 5; y <= 35; y++) plus[y * pw + 20] = 1;
    g = build(plus, pw, ph, { pruneCells: 3, bridgeCells: 0, simplifyCells: 0.8, smoothPasses: 2 });
    var deg4 = 0, dang = 0;
    for (i = 0; i < g.nodes.length; i++) if (g.nodes[i].deg === 4) deg4++;
    for (i = 0; i < g.edges.length; i++) if (g.edges[i].dangling) dang++;
    var pcore = coreOf(g);
    var pfaces = faces(g);
    R.plusNodes = g.nodes.length;
    R.plusDeg4Nodes = deg4;
    R.plusEdges = g.edges.length;
    R.plusDanglingEdges = dang;
    R.plusCoreNodes = pcore.nodes.length;
    R.plusCoreEdges = pcore.edges.length;
    R.plusFaces = pfaces.length;
    R.plusIsOneCrossroads = (deg4 === 1 && g.edges.length === 4 && dang === 4 &&
                             pcore.nodes.length === 0 && pcore.edges.length === 0 &&
                             pfaces.length === 0);

    /* --- two parallel lines: no face, then a face, and the ONLY change is the bridging --------- */
    var bw = 44, bh = 24, par = box(bw, bh);
    for (x = 5; x <= 35; x++) { par[8 * bw + x] = 1; par[12 * bw + x] = 1; }
    var gNo = build(par, bw, bh, { pruneCells: 3, bridgeCells: 0, simplifyCells: 0.8, smoothPasses: 0 });
    var fNo = faces(gNo);
    var gBr = build(par, bw, bh, { pruneCells: 3, bridgeCells: 5, simplifyCells: 0.8, smoothPasses: 0 });
    var fBr = faces(gBr);
    R.bridgeEndsFound = gBr.stats.ends;
    R.bridgesMade = gBr.stats.bridges;
    R.bridgeCellsAdded = gBr.stats.bridgeCells;
    R.facesWithoutBridging = fNo.length;
    R.facesWithBridging = fBr.length;
    R.bridgeAreaCells = fBr.length ? Math.round(fBr[0].areaCells) : 0;
    R.bridgingMakesTheFace = (fNo.length === 0 && fBr.length === 1 && gBr.stats.bridges >= 2 &&
                              R.bridgeAreaCells > 100 && R.bridgeAreaCells < 130);

    /* --- smoothing must not move a single endpoint, and every edge must end ON its node -------- */
    var mw = 60, mh = 48, mesh = box(mw, mh);
    rect(mesh, mw, 6, 6, 30, 30);
    rect(mesh, mw, 30, 12, 52, 40);
    for (x = 12; x <= 46; x++) mesh[24 * mw + x] = 1;
    for (y = 6; y <= 40; y++) mesh[y * mw + 18] = 1;
    var gA = build(mesh, mw, mh, { pruneCells: 3, bridgeCells: 4, simplifyCells: 1.0, smoothPasses: 0 });
    var gB = build(mesh, mw, mh, { pruneCells: 3, bridgeCells: 4, simplifyCells: 1.0, smoothPasses: 3 });
    var moved = 0, offNode = 0, grew = 0, pa, pb;
    if (gA.edges.length !== gB.edges.length) moved = -1;
    else {
      for (i = 0; i < gA.edges.length; i++) {
        pa = gA.edges[i].pts; pb = gB.edges[i].pts;
        if (pa[0] !== pb[0] || pa[1] !== pb[1]) moved++;
        if (pa[pa.length - 2] !== pb[pb.length - 2] || pa[pa.length - 1] !== pb[pb.length - 1]) moved++;
        if (pb.length > pa.length) grew++;
      }
      for (i = 0; i < gB.edges.length; i++) {
        e = gB.edges[i];
        if (e.pts[0] !== gB.nodes[e.a].x || e.pts[1] !== gB.nodes[e.a].y) offNode++;
        if (e.pts[e.pts.length - 2] !== gB.nodes[e.b].x || e.pts[e.pts.length - 1] !== gB.nodes[e.b].y) offNode++;
      }
    }
    R.meshEdges = gB.edges.length;
    R.meshEndpointsMoved = moved;
    R.meshEndpointsOffNode = offNode;
    R.meshEdgesActuallySmoothed = grew;
    R.smoothingPinsEndpoints = (moved === 0 && offNode === 0 && grew > 0);

    /* --- toPolys: three views of the same edges, and never a one-point "line" ------------------ */
    var shortest = 1e9, tot = 0, modes = ['all', 'core', 'faces'], mm, ps;
    for (mm = 0; mm < 3; mm++) {
      ps = toPolys(gB, modes[mm]);
      tot += ps.length;
      for (i = 0; i < ps.length; i++) if ((ps[i].length >> 1) < shortest) shortest = ps[i].length >> 1;
    }
    R.polysAll = toPolys(gB, 'all').length;
    R.polysCore = toPolys(gB, 'core').length;
    R.polysFaces = toPolys(gB, 'faces').length;
    R.polysShortest = (tot ? shortest : 0);
    R.toPolysNeverEmitsAPoint = (tot > 0 && shortest >= 2);

    /* --- offsetEdge: a straight road is exactly half a width to each side --------------------- */
    var off = offsetEdge(new Float64Array([0, 0, 10, 0, 20, 0]), 0.5);
    var offOk = (off.left.length === 6 && off.right.length === 6);
    for (i = 0; i < 3 && offOk; i++) {
      if (Math.abs(off.left[2 * i + 1] - 0.5) > 1e-12) offOk = false;      // +(-dy,dx) of a road
      if (Math.abs(off.right[2 * i + 1] + 0.5) > 1e-12) offOk = false;     // running due east
      if (off.left[2 * i] !== 10 * i || off.right[2 * i] !== 10 * i) offOk = false;
    }
    var hair = offsetEdge(new Float64Array([0, 0, 10, 0, 0, 0.2]), 0.5);
    R.offsetLeftY = off.left[1];
    R.offsetRightY = off.right[1];
    R.offsetHairpinPoints = hair.left.length >> 1;
    R.offsetIsHalfAWidthEachSide = (offOk && hair.left.length === 6 &&
                                    isFinite(hair.left[2]) && isFinite(hair.left[3]));

    /* --- the border: one road across the sheet must cut it in TWO ----------------------------- */
    var dw = 30, dh = 30, cut = box(dw, dh);
    for (x = 0; x < dw; x++) cut[15 * dw + x] = 1;
    g = build(cut, dw, dh, { pruneCells: 3, bridgeCells: 0, simplifyCells: 0.8, smoothPasses: 0 });
    var fNoB = faces(g, { border: false });
    var fB = faces(g, { border: true, borderSnap: 2 });
    var bothEdge = fB.length > 0, sum = 0;
    for (i = 0; i < fB.length; i++) { if (!fB[i].edge) bothEdge = false; sum += fB[i].areaCells; }
    R.borderFacesOff = fNoB.length;
    R.borderFacesOn = fB.length;
    R.borderAreaSum = Math.round(sum);
    R.borderSheetArea = (dw - 1) * (dh - 1);
    R.borderClosesTheSheet = (fNoB.length === 0 && fB.length === 2 && bothEdge &&
                              Math.abs(sum - 841) < 1);
    /* and a network that does not reach the edge must REFUSE the border rather than hand back the
       whole sheet as one clean parcel - the 7,048 km2 failure, which reported nothing at all */
    var islandG = build(sq, sw, sh, CLEAN);
    var islandF = faces(islandG, { border: true, borderSnap: 2 });
    R.borderIslandFaces = islandF.length;
    R.borderIslandRefused = stats.borderUnattached;
    R.borderRefusesToInventASheet = (islandF.length === 1 && stats.borderUnattached === true);

    /* --- a whole branchy FIELD, not a figure -------------------------------------------------
       Every case above is one clean shape, and the faults this module is for do not show in clean
       shapes. The field is grown from a fixed seed with a Lehmer generator whose products all stay
       inside 2^53, so every browser gets the same one. What must hold on it: the network is one
       graph rather than a heap of fragments, every edge still ends exactly on its node after
       simplifying and smoothing, and Euler's V - E + F = C holds for the faces - which is the same
       statement as "exactly one unbounded ring per component", and is the one thing that would catch
       a face traversal that had quietly lost or invented a parcel. */
    var nw = 64, nh = 56, nf = box(nw, nh), seed = 5;
    var rnd = function (mod) { seed = (seed * 16807) % 2147483647; return seed % mod; };
    var bx, by, bt, br2, ex, ey, ix, iy;
    for (i = 0; i < 5; i++) {
      bx = rnd(nw); by = rnd(nh);
      for (bt = 0; bt < 90; bt++) {
        br2 = 2 + rnd(4);
        for (ey = -br2; ey <= br2; ey++) for (ex = -br2; ex <= br2; ex++) {
          if (ex * ex + ey * ey > br2 * br2) continue;
          ix = bx + ex; iy = by + ey;
          if (ix >= 0 && iy >= 0 && ix < nw && iy < nh) nf[iy * nw + ix] = 1;
        }
        bx += rnd(7) - 3; by += rnd(7) - 3;
        if (bx < 0) bx = 0; else if (bx > nw - 1) bx = nw - 1;
        if (by < 0) by = 0; else if (by > nh - 1) by = nh - 1;
      }
    }
    var gf = build(nf, nw, nh, { pruneCells: 4, bridgeCells: 5, simplifyCells: 1.0, smoothPasses: 2 });
    var gfCore = coreOf(gf);
    var ff = faces(gf);
    var fOff = 0, fArea = 0;
    for (i = 0; i < gf.edges.length; i++) {
      e = gf.edges[i];
      if (e.pts[0] !== gf.nodes[e.a].x || e.pts[1] !== gf.nodes[e.a].y) fOff++;
      if (e.pts[e.pts.length - 2] !== gf.nodes[e.b].x || e.pts[e.pts.length - 1] !== gf.nodes[e.b].y) fOff++;
    }
    for (i = 0; i < ff.length; i++) fArea += ff[i].areaCells;
    R.fieldCells = countSet(nf);
    R.fieldSkeletonCells = gf.stats.skeletonCells;
    R.fieldBridges = gf.stats.bridges;
    R.fieldNodes = gf.nodes.length;
    R.fieldEdges = gf.edges.length;
    R.fieldDangling = gf.stats.dangling;
    R.fieldCoreNodes = gfCore.nodes.length;
    R.fieldCoreEdges = gfCore.edges.length;
    R.fieldComponents = stats.faceComponents;
    R.fieldFaces = ff.length;
    R.fieldFaceAreaCells = Math.round(fArea);
    R.fieldSheetCells = nw * nh;
    R.fieldEndpointsOffNode = fOff;
    R.fieldDegenerateDropped = gf.stats.degenerateDropped;
    R.fieldDegenerateRings = stats.faceDegenerate;
    R.fieldTraversalOk = stats.faceTraversalOk;
    R.fieldEulerOk = stats.faceEulerOk;
    R.fieldLengthCells = Math.round(gf.stats.lengthCells);
    /* a face that is the whole sheet is the failure this module exists to prevent, so it is a test
       and not a hope */
    var biggest = 0;
    for (i = 0; i < ff.length; i++) if (ff[i].areaCells > biggest) biggest = ff[i].areaCells;
    R.fieldBiggestFace = Math.round(biggest);
    R.fieldIsANetwork = (gf.edges.length > 10 && ff.length > 0 && fOff === 0 &&
                         stats.faceTraversalOk && stats.faceEulerOk &&
                         biggest < nw * nh * 0.9);

    R.ok = !!(R.squareIsOneClosedFace && R.squareSmoothedStaysWithin3Pct &&
              R.eightGivesTwoFaces && R.plusIsOneCrossroads &&
              R.bridgingMakesTheFace && R.smoothingPinsEndpoints && R.toPolysNeverEmitsAPoint &&
              R.offsetIsHalfAWidthEachSide && R.borderClosesTheSheet &&
              R.borderRefusesToInventASheet && R.fieldIsANetwork);
    return R;
  }

  window.RoadGraph = {
    build: build,
    coreOf: coreOf,
    faces: faces,
    toPolys: toPolys,
    offsetEdge: offsetEdge,
    selfCheck: selfCheck,
    stats: stats,
    DEFAULTS: DEFAULTS,
    /* handed out so a caller can smooth its own line the same pinned way the edges were smoothed,
       and so the bridging can be looked at on its own when a network refuses to close */
    chaikinPinned: chaikinPinned,
    bridgeEnds: bridgeEnds
  };
})();
