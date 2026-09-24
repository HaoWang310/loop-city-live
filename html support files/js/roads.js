/* ------------------------------------------------------------------------------------------------
   LOOP CITY - combined app v1
   roads.js : the drawing contract. The one place a vein becomes a road.

   Why this file exists, in one paragraph. On the measured run the mould's veins average 1,106 m
   wide and the widest is 4.8 km. Drawn as they are, the network covers 1,082.6 km2 against 737.1
   km2 of the cells it is meant to enclose - more road than parcel. That is a micrograph, not a
   plan. Thinning the vein to a single line of cells is what turns a territory into a road, and
   every consumer downstream - the canvas, the DXF, the parcel flood fill, the FORBID mask the
   growth model reads - must be fed from that SAME line, or the km2 on the panel, the line in the
   drawing and the edge of the parcel are three different things and the numbers never agree.

   Pure geometry. No DOM, no canvas, no globals but window.Roads. Everything here can be called
   from the console on a synthetic grid, and Roads.selfCheck() does exactly that.

   Coordinates: everything in and out of this file is in CELL units of whichever grid you hand it
   (fine 950x865, or coarse 475x433). Cell CENTRES. The +0.5 that turns a cell index into a centre
   in metres belongs to the caller, with the grid's own cellE / cellN - do it here and the two
   grids would need two copies of this file.

   ES5 on purpose: var and function, typed arrays, no arrow functions, no modules, no imports.
   There is no Node on this machine, so none of this can be run before it reaches the browser.
   That is why selfCheck() is not optional.
   ------------------------------------------------------------------------------------------------ */

(function () {
  'use strict';

  /* The eight neighbours in Zhang-Suen's own ring order, starting north and going clockwise:
     P2=N P3=NE P4=E P5=SE P6=S P7=SW P8=W P9=NW. Keeping their order means the crossing number
     below is a straight walk round the array instead of a lookup table nobody can check. */
  var DX = [0, 1, 1, 1, 0, -1, -1, -1];
  var DY = [-1, -1, 0, 1, 1, 1, 0, -1];

  /* When a walk has a choice of where to go next, take the orthogonal step before the diagonal.
     This is not tidiness. Beside a crossroads every cell has diagonal neighbours belonging to the
     OTHER arm - the cell just west of a plus-sign's centre touches the north arm and the south arm
     as well as the centre. Reach for a diagonal first and the line cuts the corner, skips the
     junction, and the crossroads comes out of the tracer as two roads that never meet. */
  var ORD = [0, 2, 4, 6, 1, 3, 5, 7];

  var MAX_THIN_PASSES = 60;   // a 4.8 km vein is ~52 cells across, so ~26 passes; 60 is the fuse
  var MAX_PRUNE_ROUNDS = 20;
  var MAX_CLEAN_ROUNDS = 20;

  /* Diagnostics from the last call of each heavy function. Panel chips read these; nothing in the
     geometry does. Kept here rather than returned so the signatures stay as the spec states them. */
  var stats = {
    thinPasses: 0, thinRedundant: 0, thinCellsIn: 0, thinCellsOut: 0,
    pruneRounds: 0, pruneBranches: 0, pruneCells: 0, pruneComponents: 0,
    tracePolys: 0, traceIsolated: 0, traceStrays: 0, traceRings: 0
  };

  /* ---------------------------------------------------------------- small neighbourhood helpers */

  /* Read the eight neighbours of (x,y) into p. Outside the array is 0 - that is the whole of the
     border rule: nothing is ever eroded because of ground that is not there. The interior fast
     path skips eight bounds tests per cell, which matters at 821,750 cells a pass. */
  function ringInto(m, w, h, x, y, p) {
    var i = y * w + x, d, nx, ny;
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      p[0] = m[i - w] ? 1 : 0;
      p[1] = m[i - w + 1] ? 1 : 0;
      p[2] = m[i + 1] ? 1 : 0;
      p[3] = m[i + w + 1] ? 1 : 0;
      p[4] = m[i + w] ? 1 : 0;
      p[5] = m[i + w - 1] ? 1 : 0;
      p[6] = m[i - 1] ? 1 : 0;
      p[7] = m[i - w - 1] ? 1 : 0;
      return;
    }
    for (d = 0; d < 8; d++) {
      nx = x + DX[d];
      ny = y + DY[d];
      p[d] = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? 0 : (m[ny * w + nx] ? 1 : 0);
    }
  }

  function ringSum(p) {
    return p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
  }

  /* Zhang-Suen's A(P1): how many separate RUNS of set cells sit in the ring. It is the number that
     tells a crossroads from a bend, and it is the number this file classifies nodes with instead of
     a plain neighbour count. A neighbour count cannot do the job: on a clean plus-sign the four
     cells immediately around the centre each touch two arms diagonally, so a degree count calls
     five cells junctions where there is one crossroads, and the tracer returns twelve stubs where
     there should be four roads. A says 4 at the centre and 2 at its neighbours, which is the truth.
       A == 0  isolated speck        A == 1  a free end        A == 2  a through-cell
       A >= 3  a real junction */
  function crossA(p) {
    var a = 0, k;
    for (k = 0; k < 8; k++) if (p[k] === 0 && p[(k + 1) & 7] === 1) a++;
    return a;
  }

  /* The same ring, with the diagonal neighbours that are only a SHORT CUT round a corner taken
     out. If a diagonal neighbour can also be reached by stepping orthogonally - the cell due
     north and the cell north-east are both set - then that diagonal is not a second way to go,
     it is the same way seen across the corner. A(P1) already counts it that way, because it
     counts RUNS of neighbours rather than neighbours, so anything that WALKS the network has to
     count it that way too or the walker and the node classifier disagree about what a road is.

     They did disagree, and it cost road: pruneSpurs counted raw neighbours, so a cell with one
     short cut beside it looked like a three-way junction, the walk stopped there, and a fifteen-
     cell spur was measured as two cells and pruned as a barb. That is 1.4 km of road deleted
     because of a corner. The flanking orthogonals are exactly the two ring entries either side
     of the diagonal, which is why this is four comparisons and not a search. */
  function effRing(m, w, h, x, y, p) {
    var d;
    ringInto(m, w, h, x, y, p);
    for (d = 1; d < 8; d += 2) {
      if (!p[d]) continue;
      if (p[(d + 7) & 7] || p[(d + 1) & 7]) p[d] = 0;
    }
  }

  /* Scratch for oneLump. Eight slots, allocated once: it is called for every cell of the skeleton
     on every cleaning round, and three little arrays per call is the kind of thing that makes the
     garbage collector, rather than the arithmetic, the slow part of a year. Safe to share because
     nothing here is re-entrant. */
  var LUMP_D = new Int8Array(8), LUMP_SEEN = new Uint8Array(8), LUMP_STACK = new Int8Array(8);

  /* Do p's own neighbours already reach each other without p, inside the 3x3 window? If they do,
     p carries no connection that is not there anyway, and removing it cannot break the network.
     A flood over at most eight items, on the offsets rather than the cells. */
  function oneLump(p) {
    var d, i, j, n = 0, top = 0, cnt = 1, a, b;
    for (d = 0; d < 8; d++) if (p[d]) LUMP_D[n++] = d;
    if (n < 1) return false;
    if (n === 1) return true;
    for (i = 0; i < n; i++) LUMP_SEEN[i] = 0;
    LUMP_SEEN[0] = 1;
    LUMP_STACK[top++] = 0;
    while (top) {
      a = LUMP_D[LUMP_STACK[--top]];
      for (j = 0; j < n; j++) {
        if (LUMP_SEEN[j]) continue;
        b = LUMP_D[j];
        if (Math.abs(DX[a] - DX[b]) <= 1 && Math.abs(DY[a] - DY[b]) <= 1) {
          LUMP_SEEN[j] = 1;
          cnt++;
          LUMP_STACK[top++] = j;
        }
      }
    }
    return cnt === n;
  }

  /* Indices of the set cells, so the passes below walk the skeleton instead of the sheet. On the
     fine grid that is the difference between 30,000 cells and 821,750, once per round. */
  function setIndex(m, n) {
    var idx = [], i;
    for (i = 0; i < n; i++) if (m[i]) idx.push(i);
    return idx;
  }

  /* Drop the cells that have been cleared since the list was made, without touching the sheet. */
  function refilter(idx, m) {
    var out = [], k;
    for (k = 0; k < idx.length; k++) if (m[idx[k]]) out.push(idx[k]);
    return out;
  }

  /* ------------------------------------------------------------------------ redundant cells

     Zhang-Suen converges and still leaves two things behind: 2x2 elbows, and the inside cell of a
     staircase step. Both are one cell thick as far as ZS is concerned - its crossing number is a
     conservative test and refuses to touch them - and both read as junctions to anything that
     counts neighbours, so a smooth arc comes out of the tracer as a hundred two-point stubs. On the
     test ring that is 23 cells and the difference between one closed road and 112 fragments.

     The rule has to cut in exactly one place and not one cell further:
       delete p when its neighbours already reach each other without it (oneLump)  AND  A <= 2.
     The second clause is the one that matters. A real crossroads is ALSO removable in the
     topological sense - take the middle out of a plus and the four arms still touch each other
     diagonally - so without the A >= 3 guard this pass would quietly delete every junction in the
     network and hand back a set of roads that never meet.

     One cell at a time, against the live state, never as a batch: in a 2x2 elbow both cells look
     removable and only one of them is. Deleting both opens the line. */
  function cleanRedundant(out, w, h, known) {
    var n = w * h, p = new Uint8Array(8), removed = 0, rounds = 0;
    var idx = known ? refilter(known, out) : setIndex(out, n);
    var keep, k, i, x, y, cut, a, b;
    while (rounds < MAX_CLEAN_ROUNDS) {
      rounds++;
      keep = [];
      cut = 0;
      for (k = 0; k < idx.length; k++) {
        i = idx[k];
        if (!out[i]) continue;
        x = i % w;
        y = (i - x) / w;
        ringInto(out, w, h, x, y, p);
        b = ringSum(p);
        a = crossA(p);
        /* b < 2: a free end IS the line, never shorten one.
           a >= 3: a crossroads, and crossroads are the whole point of the drawing. */
        if (b >= 2 && a < 3 && oneLump(p)) { out[i] = 0; cut++; }
        else keep.push(i);
      }
      idx = keep;                          // next round only re-examines what is still standing
      removed += cut;
      if (!cut) break;
    }
    return removed;
  }

  /* ------------------------------------------------------------------------------ 1 · thinZS */

  /* Zhang-Suen thinning. Two sub-iterations a pass, 8-connected, repeat until a whole pass deletes
     nothing. The input is not touched; the answer is a new array.

     The work is driven off a list of the cells still set rather than the whole sheet, because after
     two passes the veins are a small fraction of 821,750 cells and there is no reason to keep
     asking the empty ground whether it would like to be thinner. Deletions inside a sub-iteration
     are marked and applied together at the end of it - that simultaneity is the algorithm, not an
     optimisation; delete as you go and a two-cell-wide line erases itself completely. */
  function thinZS(mask, w, h) {
    var n = w * h, out = new Uint8Array(n), i;
    for (i = 0; i < n; i++) out[i] = mask[i] ? 1 : 0;
    stats.thinCellsIn = 0;
    var idx = new Int32Array(n), cnt = 0;
    for (i = 0; i < n; i++) if (out[i]) { idx[cnt++] = i; stats.thinCellsIn++; }

    var dead = new Uint8Array(n), p = new Uint8Array(8);
    var passes = 0, changed, sub, ndead, k, x, y, b, a, keep, N, E, S, W;

    while (passes < MAX_THIN_PASSES) {
      passes++;
      changed = 0;
      for (sub = 0; sub < 2; sub++) {
        ndead = 0;
        for (k = 0; k < cnt; k++) {
          i = idx[k];
          x = i % w;
          y = (i - x) / w;
          ringInto(out, w, h, x, y, p);
          b = ringSum(p);
          if (b < 2 || b > 6) continue;         // 1 is an end, 7+ is still the middle of a blob
          if (crossA(p) !== 1) continue;        // removing it would cut the neighbourhood in two
          N = p[0]; E = p[2]; S = p[4]; W = p[6];
          if (sub === 0) {
            if (N && E && S) continue;
            if (E && S && W) continue;
          } else {
            if (N && E && W) continue;
            if (N && S && W) continue;
          }
          dead[i] = 1;
          ndead++;
        }
        if (ndead) {
          keep = 0;
          for (k = 0; k < cnt; k++) {
            i = idx[k];
            if (dead[i]) { out[i] = 0; dead[i] = 0; } else idx[keep++] = i;
          }
          cnt = keep;
          changed += ndead;
        }
      }
      if (!changed) break;
    }

    stats.thinPasses = passes;
    stats.thinRedundant = cleanRedundant(out, w, h);
    stats.thinCellsOut = 0;
    for (i = 0; i < n; i++) if (out[i]) stats.thinCellsOut++;
    return out;
  }

  /* --------------------------------------------------------------------------- 2 · pruneSpurs */

  /* Thinning a blob grows barbs: every bulge on the edge of a 1 km-wide vein becomes a dead-end
     branch a few cells long, and a hundred of them turn a legible network into a thistle. This
     walks in from every free end and removes the branch if it is shorter than minCells.

     Two things it must never do, and how each is prevented rather than hoped for:

     - Disconnect the network. Only branches that START at a free end and STOP at a junction are
       ever cut, and such a branch is a dead end by construction: nothing reaches the rest of the
       network through it. The walk uses the LIVE state, re-counting neighbours after every cut, so
       three short arms meeting at one junction are not all cut in the same breath - cut the first,
       and the junction becomes a through-cell, and what is left is one continuous road whose length
       is now the whole of the two remaining arms. That is the case a batch would have deleted
       entirely.
     - Delete a free-standing piece that is long enough to be a road. A branch that ends at another
       free end rather than a junction IS its whole component; it is only dropped when the whole of
       it is shorter than minCells, and it is counted separately so a vanished island is visible.

     Each round ends in cleanRedundant. Cutting a barb usually leaves its last cell sitting against
     the trunk with three neighbours - a stub that is no longer an end, so no later round would ever
     walk it, and which would sit in the drawing forever as a 93 m tick against the road. */
  function pruneSpurs(skel, w, h, minCells) {
    var n = w * h, out = new Uint8Array(n), i;
    for (i = 0; i < n; i++) out[i] = skel[i] ? 1 : 0;
    if (!(minCells > 1)) { stats.pruneRounds = 0; stats.pruneBranches = 0; stats.pruneCells = 0; stats.pruneComponents = 0; return out; }

    var p = new Uint8Array(8), branch = new Int32Array(n);
    var rounds = 0, branches = 0, cells = 0, components = 0;
    var idx = setIndex(out, n);            // kept across the rounds; only ever gets shorter
    var ends, singles, k, e, s, x, y, d, d0, deg, len, prev, cur, cx, cy, dc, nxt, j, whole, did;

    while (rounds < MAX_PRUNE_ROUNDS) {
      rounds++;
      did = 0;

      /* free ends and lone specks, as the round finds them; each is re-tested live before use.
         effRing, not ringInto, everywhere in this walk: a branch must be measured in the same
         units the tracer draws it in, or a road is deleted for being a length it never was. */
      ends = [];
      singles = [];
      idx = refilter(idx, out);
      for (k = 0; k < idx.length; k++) {
        i = idx[k];
        x = i % w;
        y = (i - x) / w;
        effRing(out, w, h, x, y, p);
        deg = ringSum(p);
        if (deg === 1) ends.push(i);
        else if (deg === 0) singles.push(i);
      }

      for (k = 0; k < singles.length; k++) {
        if (1 < minCells) { out[singles[k]] = 0; did++; cells++; components++; }
      }

      for (e = 0; e < ends.length; e++) {
        s = ends[e];
        if (!out[s]) continue;                       // an earlier cut this round ate it
        x = s % w;
        y = (s - x) / w;
        effRing(out, w, h, x, y, p);
        if (ringSum(p) !== 1) continue;              // no longer a free end
        d0 = -1;
        for (d = 0; d < 8; d++) if (p[d]) { d0 = d; break; }
        if (d0 < 0) continue;

        len = 0;
        branch[len++] = s;
        prev = s;
        cur = (y + DY[d0]) * w + (x + DX[d0]);
        whole = false;

        for (;;) {
          cx = cur % w;
          cy = (cur - cx) / w;
          effRing(out, w, h, cx, cy, p);
          dc = ringSum(p);
          if (dc >= 3) break;                        // a junction: the branch stops SHORT of it
          branch[len++] = cur;
          if (dc <= 1) { whole = true; break; }      // the other free end: this was a whole island
          nxt = -1;
          for (d = 0; d < 8; d++) {
            if (!p[d]) continue;
            j = (cy + DY[d]) * w + (cx + DX[d]);
            if (j !== prev) { nxt = j; break; }
          }
          if (nxt < 0) { whole = true; break; }
          prev = cur;
          cur = nxt;
          if (len >= n) break;                       // fuse; a corrupt mask must not hang the year
        }

        if (len < minCells) {
          for (i = 0; i < len; i++) out[branch[i]] = 0;
          did += len;
          cells += len;
          branches++;
          if (whole) components++;
        }
      }

      did += cleanRedundant(out, w, h, idx);
      if (!did) break;
    }

    stats.pruneRounds = rounds;
    stats.pruneBranches = branches;
    stats.pruneCells = cells;
    stats.pruneComponents = components;
    return out;
  }

  /* ------------------------------------------------------------------------ 3 · traceSkeleton */

  /* Turn the skeleton into polylines: flat Float64Array of [x0,y0,x1,y1,...] in cell coordinates.
     Split at junctions, so every line runs end-to-end or junction-to-junction and no cell of the
     line is walked twice. A junction cell appears as the first or last point of each road meeting
     there - that is not walking it twice, that is the roads meeting.

     What is marked as used is the STEP, not the cell, in both directions at once: a four-way
     crossroads has four steps out of it and must produce four roads, so a per-cell flag would
     produce one. Nodes are classified by A (see crossA) and not by neighbour count, and the next
     step is chosen orthogonal-first (see ORD), for the reason written beside both. */
  function traceSkeleton(skel, w, h) {
    var n = w * h, A = new Uint8Array(n), vis = new Uint8Array(n), used = new Uint8Array(n);
    var p = new Uint8Array(8), polys = [], isolated = 0, strays = 0, rings = 0;
    var idx = setIndex(skel, n), k, i, x, y, d, j2, pl;

    for (k = 0; k < idx.length; k++) {
      i = idx[k];
      x = i % w;
      y = (i - x) / w;
      ringInto(skel, w, h, x, y, p);
      A[i] = crossA(p);
    }

    function nbAt(i, d) {
      var x = i % w, y = (i - x) / w, nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return -1;
      var j = ny * w + nx;
      return skel[j] ? j : -1;
    }

    function markStep(i, d) {
      var j = nbAt(i, d);
      used[i] |= (1 << d);
      if (j >= 0) used[j] |= (1 << ((d + 4) & 7));
    }

    /* Before anything walks: spend the diagonal steps that are only a short cut round a corner
       (see effRing). Marking them used means no walk can ever take one.

       This is not tidiness, it is the bug that nearly shipped. Leave them in and a walk
       occasionally takes the short cut, skips the cells it cut past, and the step INTO those
       cells from the far side is then owned by a cell that has already been visited - so the
       old "start only from an unvisited cell" rule never went back for it. The step was
       dropped. A real length of road never reached the polylines, and because raster4 draws the
       polylines and nothing else, the mask was left with a one-cell diagonal hole exactly where
       that road used to seal the parcel. extractCells' four-connected fill walks through a hole
       like that and two parcels quietly become one, with a plausible outline and a wrong area:
       the precise failure this whole module exists to prevent, wearing the face of a modelling
       result rather than a bug. Measured on a 70x62 test field: twelve stranded steps, one of
       them load-bearing, one leak. */
    for (k = 0; k < idx.length; k++) {
      i = idx[k];
      x = i % w;
      y = (i - x) / w;
      for (d = 1; d < 8; d += 2) {
        j2 = nbAt(i, d);
        if (j2 < 0) continue;
        if (skel[y * w + (x + DX[d])] || skel[(y + DY[d]) * w + x]) {
          used[i] |= (1 << d);
          used[j2] |= (1 << ((d + 4) & 7));
        }
      }
    }

    function walk(start, d0) {
      var sx = start % w;
      var pts = [sx, (start - sx) / w], cur = nbAt(start, d0), guard = 0, dd, dw, d2, nx, cx;
      vis[start] = 1;
      markStep(start, d0);
      for (;;) {
        guard++;
        if (guard > n + 4) break;                    // fuse; never spin on a malformed mask
        vis[cur] = 1;
        cx = cur % w;
        pts.push(cx, (cur - cx) / w);
        if (cur === start) break;                    // a ring: first point repeated, as promised
        if (A[cur] !== 2) break;                     // an end or a junction: the road stops here
        d2 = -1;
        for (dd = 0; dd < 8; dd++) {
          dw = ORD[dd];
          if (nbAt(cur, dw) >= 0 && !(used[cur] & (1 << dw))) { d2 = dw; break; }
        }
        if (d2 < 0) break;
        nx = nbAt(cur, d2);
        markStep(cur, d2);
        cur = nx;
      }
      return new Float64Array(pts);
    }

    /* pass 1 - out of every node, once per unused step */
    for (k = 0; k < idx.length; k++) {
      i = idx[k];
      if (A[i] === 2) continue;
      if (A[i] === 0) { isolated++; vis[i] = 1; continue; }   // a speck draws no road
      for (var dd = 0; dd < 8; dd++) {
        d = ORD[dd];
        if (nbAt(i, d) >= 0 && !(used[i] & (1 << d))) polys.push(walk(i, d));
      }
    }

    /* pass 2 - the cells that are not nodes. A closed loop has no node at all to start from, so
       this is where rings come from; but it also has to pick up any step out of a through-cell
       that pass 1's walks did not happen to take.

       Gate on the STEP, never on whether the cell has been visited. That was the old rule and
       it is the one that lost road: what a walk spends is steps, so a cell can be visited and
       still own a step nothing has walked, and under the old rule nothing ever went back for
       it. Starting on an already-drawn road is no longer a risk, because the short cuts that
       used to cause it were spent above - every step still unused up here is a real road that
       is not in the drawing yet. On the same test field this took the polyline count DOWN, from
       28 to 17: the stubs it used to emit were the fragments of the roads it was breaking. */
    for (k = 0; k < idx.length; k++) {
      i = idx[k];
      if (A[i] !== 2) continue;
      for (var de = 0; de < 8; de++) {
        d = ORD[de];
        if (nbAt(i, d) >= 0 && !(used[i] & (1 << d))) {
          pl = walk(i, d);
          polys.push(pl);
          if (pl[0] === pl[pl.length - 2] && pl[1] === pl[pl.length - 1]) rings++;
        }
      }
    }

    /* pass 3 - any step still unwalked, then the specks. On a skeleton from thinZS the first
       half finds nothing; it is here because traceSkeleton is public and may one day be handed a
       mask that was never thinned - a 2x2 corner cell, say, which has three real neighbours but
       A says 1 - and a road silently missing from the DXF is worse than an ugly one. */
    for (k = 0; k < idx.length; k++) {
      i = idx[k];
      for (var df = 0; df < 8; df++) {
        d = ORD[df];
        if (nbAt(i, d) >= 0 && !(used[i] & (1 << d))) { polys.push(walk(i, d)); strays++; }
      }
      if (!vis[i]) { vis[i] = 1; isolated++; }
    }

    stats.tracePolys = polys.length;
    stats.traceIsolated = isolated;
    stats.traceStrays = strays;
    stats.traceRings = rings;
    return polys;
  }

  /* ----------------------------------------------------------------------------- 4 · simplify */

  /* Douglas-Peucker on a flat coordinate array, with an explicit stack. Iterative and not
     recursive for one blunt reason: a traced vein can be 40,000 points long and the recursive form
     puts one frame on the call stack per split. It does not slow down, it throws.

     A closed ring is split at the point farthest from the first before it is simplified, the way
     simplifyRing does it in the quadrant app. Run plain DP on a ring and the first and last point
     are the same point, the "line" between them has no length, and the whole ring measures zero
     from it and collapses to two points. */
  function simplify(poly, eps) {
    var n = poly.length >> 1, i, out, k;
    if (n < 3 || !(eps > 0)) {
      out = new Float64Array(poly.length);
      for (i = 0; i < poly.length; i++) out[i] = poly[i];
      return out;
    }
    var closed = (poly[0] === poly[2 * n - 2] && poly[1] === poly[2 * n - 1]);
    var keep = new Uint8Array(n), e2 = eps * eps, stack;
    keep[0] = 1;
    keep[n - 1] = 1;

    if (closed && n > 3) {
      var far = 0, fd = -1, dx0, dy0, dd;
      for (i = 1; i < n - 1; i++) {
        dx0 = poly[2 * i] - poly[0];
        dy0 = poly[2 * i + 1] - poly[1];
        dd = dx0 * dx0 + dy0 * dy0;
        if (dd > fd) { fd = dd; far = i; }
      }
      keep[far] = 1;
      stack = [0, far, far, n - 1];
    } else {
      stack = [0, n - 1];
    }

    var a, b, ax, ay, dx, dy, L2, md, mi, px, py, d, cr;
    while (stack.length) {
      b = stack.pop();
      a = stack.pop();
      ax = poly[2 * a];
      ay = poly[2 * a + 1];
      dx = poly[2 * b] - ax;
      dy = poly[2 * b + 1] - ay;
      L2 = dx * dx + dy * dy;
      md = -1;
      mi = -1;
      for (i = a + 1; i < b; i++) {
        px = poly[2 * i] - ax;
        py = poly[2 * i + 1] - ay;
        if (L2 > 0) { cr = px * dy - py * dx; d = cr * cr / L2; }
        else d = px * px + py * py;                  // a and b are the same point: measure from it
        if (d > md) { md = d; mi = i; }
      }
      if (mi >= 0 && md > e2) { keep[mi] = 1; stack.push(a, mi, mi, b); }
    }

    var cnt = 0;
    for (i = 0; i < n; i++) if (keep[i]) cnt++;
    out = new Float64Array(cnt * 2);
    k = 0;
    for (i = 0; i < n; i++) {
      if (!keep[i]) continue;
      out[k++] = poly[2 * i];
      out[k++] = poly[2 * i + 1];
    }
    return out;
  }

  /* ------------------------------------------------------------------------------ 5 · raster4 */

  /* Bresenham with ONE axis moving per step. Never both. This is not a drawing preference and it
     must not be "tidied" later:

     the parcel flood fill in extractCells is four-connected on the ground between the veins. A road
     that steps diagonally leaves a four-connected gap at the corner, the fill walks straight
     through it, and two parcels become one - silently, with a plausible-looking outline and a
     wrong area. The cure is not to dilate the skeleton: one round of 3x3 dilate is 278 m of
     carriageway and cuts every parcel 139 m inside its true edge, everywhere, which looks entirely
     reasonable on screen and is wrong by a fixed amount across the whole sheet.

     Cells outside the grid are skipped rather than clamped - clamping would draw a false road down
     the border. */
  function line4(x0, y0, x1, y1, w, h, mask, path) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0, guard = dx + dy + 2, e2;
    for (;;) {
      if (path) path.push(x, y);
      if (mask && x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1;
      if (x === x1 && y === y1) break;
      if (--guard < 0) break;
      e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }          // if / ELSE - the two-if form is the
      else { err += dx; y += sy; }                   // eight-connected one and it leaks
    }
  }

  function raster4(polys, w, h) {
    var m = new Uint8Array(w * h), i, p, k, x, y;
    for (i = 0; i < polys.length; i++) {
      p = polys[i];
      if (!p || p.length < 2) continue;
      if (p.length === 2) {                          // a one-point road still occupies its cell
        x = Math.round(p[0]);
        y = Math.round(p[1]);
        if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1;
        continue;
      }
      for (k = 0; k + 3 < p.length; k += 2) {
        line4(Math.round(p[k]), Math.round(p[k + 1]),
              Math.round(p[k + 2]), Math.round(p[k + 3]), w, h, m, null);
      }
    }
    return m;
  }

  /* --------------------------------------------------------------------------- 6 · stampWidth */

  /* The road at its DECLARED width instead of at one cell. Layer 1 is 35 m (an M road), layer 2
     19 m (an A road), set by the user on 20 September: "main roads can be 30-40m wide, and
     secondary roads 18-20m". That supersedes the 20 m / 12 m in the spec's table at 1.3 - if
     anyone puts those back because the document says so, the inks and the DXF go out of step with
     the drawing everyone has been looking at. Internal roads are not this module's business: they
     come later out of parcel subdivision, with the wool thread.

     The arithmetic, said out loud rather than hidden: a 35 m road on a 92.6 m mould cell is a
     third of a cell. One cell IS the road, and more than one would be a lie - so at 35 m this
     returns zero rounds of dilation and says cellsWide: 1. The panel must print that, because all
     three draft designs shipped a width slider that did nothing at all until it passed 46 m and
     then jumped straight to 278 m, and nobody could tell from the drawing which of the two was
     happening. drawnWidthM is what the mask actually represents; widthM is what was asked for.
     They differ, always, and the export note should say by how much.

     Dilation is four-connected for the same reason raster4 is: a diagonal dilate would re-open the
     corners raster4 was careful to close. */
  function stampWidth(polys, w, h, widthM, cellM) {
    var rounds = Math.max(0, Math.round(widthM / cellM / 2 - 0.5));
    var mask = raster4(polys, w, h), n = w * h;
    var r, i, x, y, next;
    for (r = 0; r < rounds; r++) {
      next = new Uint8Array(n);
      for (i = 0; i < n; i++) {
        if (!mask[i]) continue;
        next[i] = 1;
        x = i % w;
        y = (i - x) / w;
        if (x > 0) next[i - 1] = 1;
        if (x < w - 1) next[i + 1] = 1;
        if (y > 0) next[i - w] = 1;
        if (y < h - 1) next[i + w] = 1;
      }
      mask = next;
    }
    return {
      mask: mask,
      cellsWide: 1 + 2 * rounds,
      rounds: rounds,
      widthM: widthM,
      cellM: cellM,
      drawnWidthM: (1 + 2 * rounds) * cellM
    };
  }

  /* ------------------------------------------------------------------------------- 7 · length */

  /* Metres, using the grid's own two cell sizes. cellE and cellN differ in the fourth decimal
     (92.616421 east, 92.614566 north) and both are passed rather than averaged, because a single
     "cell size" is how the quadrant app ended up measuring the same parcel with two rulers 0.035 %
     apart. Never 92.584 - that is extent / 950 of the wrong extent. */
  function polyLengthM(poly, cellE, cellN) {
    var L = 0, i, dx, dy;
    for (i = 0; i + 3 < poly.length; i += 2) {
      dx = (poly[i + 2] - poly[i]) * cellE;
      dy = (poly[i + 3] - poly[i + 1]) * cellN;
      L += Math.sqrt(dx * dx + dy * dy);
    }
    return L;
  }

  function totalLengthM(polys, cellE, cellN) {
    var L = 0, i;
    for (i = 0; i < polys.length; i++) if (polys[i]) L += polyLengthM(polys[i], cellE, cellN);
    return L;
  }

  /* ---------------------------------------------------------------------------- 8 · selfCheck */

  /* Nothing here can be run before it is in a browser, so this is how the module is tested:
     open the app, type Roads.selfCheck() in the console, and read ok. Everything it builds is a
     few hundred cells, so it costs milliseconds and can be called on every boot.

     Each case is one thing that, if it broke, would break the drawing in a way that looks like a
     modelling failure rather than a bug. */
  function selfCheck() {
    var R = {}, i, k, x, y, n;

    /* --- a 9-cell-wide bar, 40 long, must come back as ONE line one cell thick --------------- */
    var bw = 50, bh = 21, bar = new Uint8Array(bw * bh);
    for (y = 6; y < 15; y++) for (x = 5; x < 45; x++) bar[y * bw + x] = 1;
    var bs = thinZS(bar, bw, bh);
    var perCol = {}, cells = 0, blocks = 0;
    for (y = 0; y < bh; y++) for (x = 0; x < bw; x++) {
      if (!bs[y * bw + x]) continue;
      cells++;
      perCol[x] = (perCol[x] || 0) + 1;
    }
    var maxPerCol = 0;
    for (k in perCol) if (perCol.hasOwnProperty(k) && perCol[k] > maxPerCol) maxPerCol = perCol[k];
    for (y = 0; y < bh - 1; y++) for (x = 0; x < bw - 1; x++) {
      if (bs[y * bw + x] && bs[y * bw + x + 1] && bs[(y + 1) * bw + x] && bs[(y + 1) * bw + x + 1]) blocks++;
    }
    var bp = traceSkeleton(bs, bw, bh);
    var bNodes = countNodes(bs, bw, bh);
    R.barCells = cells;
    R.barMaxPerColumn = maxPerCol;
    R.bar2x2Blocks = blocks;
    R.barPolylines = bp.length;
    R.barEnds = bNodes.ends;
    R.barJunctions = bNodes.junctions;
    R.barInputUntouched = countSet(bar) === 9 * 40;
    R.barThinsToOneCellLine = (maxPerCol === 1 && blocks === 0 && bp.length === 1 &&
                               bNodes.ends === 2 && bNodes.junctions === 0 && cells > 25);

    /* --- a thick plus must come back as a plus with ONE junction and FOUR roads -------------- */
    var pw = 41, ph = 41, plus = new Uint8Array(pw * ph);
    for (y = 16; y < 25; y++) for (x = 4; x < 37; x++) plus[y * pw + x] = 1;
    for (x = 16; x < 25; x++) for (y = 4; y < 37; y++) plus[y * pw + x] = 1;
    var ps = thinZS(plus, pw, ph);
    var pNodes = countNodes(ps, pw, ph);
    var pp = traceSkeleton(ps, pw, ph);
    var allTouchCentre = pp.length > 0;
    for (i = 0; i < pp.length; i++) {
      var f = pp[i], atA = (f[0] === 20 && f[1] === 20);
      var atB = (f[f.length - 2] === 20 && f[f.length - 1] === 20);
      if (!atA && !atB) allTouchCentre = false;
    }
    R.plusJunctions = pNodes.junctions;
    R.plusEnds = pNodes.ends;
    R.plusPolylines = pp.length;
    R.plusOneJunction = (pNodes.junctions === 1 && pNodes.ends === 4 && pp.length === 4 && allTouchCentre);

    /* --- a 3-cell barb: gone at minCells 5, kept whole at minCells 2 ------------------------- */
    var sw = 40, sh = 12, spur = new Uint8Array(sw * sh);
    for (x = 4; x < 34; x++) spur[6 * sw + x] = 1;          // 30-cell trunk
    for (k = 1; k < 4; k++) spur[(6 + k) * sw + 18] = 1;    // 3-cell barb hanging off it
    var cut5 = pruneSpurs(spur, sw, sh, 5);
    var keep2 = pruneSpurs(spur, sw, sh, 2);
    R.spurBefore = countSet(spur);
    R.spurAfter5 = countSet(cut5);
    R.spurAfter2 = countSet(keep2);
    R.spurBarbRemovedAt5 = (R.spurBefore === 33 && R.spurAfter5 === 30);
    R.spurBarbKeptAt2 = (R.spurAfter2 === 33);
    R.spurTrunkSurvived = (countNodes(cut5, sw, sh).junctions === 0 && traceSkeleton(cut5, sw, sh).length === 1);

    /* --- raster4 must never take a diagonal step, and must therefore SEAL --------------------- */
    var path = [];
    line4(0, 0, 37, 23, 200, 200, null, path);
    var diagBad = 0;
    for (i = 2; i < path.length; i += 2) {
      var ax = Math.abs(path[i] - path[i - 2]), ay = Math.abs(path[i + 1] - path[i - 1]);
      if (ax + ay !== 1) diagBad++;
    }
    R.diagCells = path.length >> 1;
    R.diagNonFourConnectedSteps = diagBad;
    R.diagReachesEnd = (path[path.length - 2] === 37 && path[path.length - 1] === 23);
    R.raster4IsFourConnected = (diagBad === 0 && R.diagReachesEnd);

    /* --- a ring traces back as ONE closed polyline, and its raster seals the inside ---------- */
    var rw = 30, rh = 30, rg = new Uint8Array(rw * rh), t, ang;
    for (t = 0; t < 3600; t++) {
      ang = t * Math.PI / 1800;
      rg[Math.round(15 + 10 * Math.sin(ang)) * rw + Math.round(15 + 10 * Math.cos(ang))] = 1;
    }
    var rs = thinZS(rg, rw, rh);
    var rp = traceSkeleton(rs, rw, rh);
    var rClosed = false;
    if (rp.length === 1) {
      var q = rp[0];
      rClosed = (q.length >= 6 && q[0] === q[q.length - 2] && q[1] === q[q.length - 1]);
    }
    R.ringPolylines = rp.length;
    R.ringPoints = rp.length === 1 ? (rp[0].length >> 1) : 0;
    R.ringTracesAsOneClosedRing = rClosed;

    var rm = raster4(rp, rw, rh);
    n = rw * rh;
    var seen = new Uint8Array(n), st = [0], leak = 0;
    seen[0] = 1;
    while (st.length) {
      i = st.pop();
      x = i % rw;
      y = (i - x) / rw;
      if (x > 0 && !seen[i - 1] && !rm[i - 1]) { seen[i - 1] = 1; st.push(i - 1); }
      if (x < rw - 1 && !seen[i + 1] && !rm[i + 1]) { seen[i + 1] = 1; st.push(i + 1); }
      if (y > 0 && !seen[i - rw] && !rm[i - rw]) { seen[i - rw] = 1; st.push(i - rw); }
      if (y < rh - 1 && !seen[i + rw] && !rm[i + rw]) { seen[i + rw] = 1; st.push(i + rw); }
    }
    if (seen[15 * rw + 15]) leak = 1;
    R.ringParcelLeaks = leak;
    R.ringSealsItsParcel = (leak === 0);

    /* --- declared widths: 35 m and 19 m are both one cell on the fine mould grid ------------- */
    var cellM = 92.616421052631;
    var line = [new Float64Array([5, 5, 5, 25])];
    var s35 = stampWidth(line, 30, 30, 35, cellM);
    var s19 = stampWidth(line, 30, 30, 19, cellM);
    var s280 = stampWidth(line, 30, 30, 280, cellM);
    R.width35Cells = s35.cellsWide;
    R.width19Cells = s19.cellsWide;
    R.width280Cells = s280.cellsWide;
    R.width35DrawnM = Math.round(s35.drawnWidthM * 10) / 10;
    R.declaredWidthIsHonest = (s35.cellsWide === 1 && s35.rounds === 0 &&
                               s19.cellsWide === 1 && s280.cellsWide === 3 &&
                               countSet(s35.mask) === countSet(raster4(line, 30, 30)));

    /* --- simplify: an L of 201 points is 3 points, and 40,000 points do not blow the stack --- */
    var L = new Float64Array(201 * 2);
    for (i = 0; i <= 200; i++) { L[2 * i] = i; L[2 * i + 1] = i < 100 ? 0 : i - 100; }
    var Ls = simplify(L, 0.5);
    var big = new Float64Array(40000 * 2);
    for (i = 0; i < 40000; i++) { big[2 * i] = i; big[2 * i + 1] = Math.sin(i * 0.01) * 50; }
    var bigS = simplify(big, 0.5);
    R.simplifyLPoints = Ls.length >> 1;
    R.simplifyBigPoints = bigS.length >> 1;
    R.simplifyKeepsCorners = (Ls.length === 6 && Ls[2] === 100 && Ls[3] === 0);
    R.simplifySurvives40k = (bigS.length >= 4 && bigS.length < big.length);

    /* --- lengths: ten cells east and ten cells north are NOT the same distance ---------------
       cellE 92.616421 against cellN 92.614566. It is 1.9 cm over ten cells and 1.6 m over the
       whole sheet, which is nothing - until one ruler is used for the road and the other for the
       parcel it cuts, which is how the quadrant app came to measure the same cell two ways. */
    var cE = 92.616421052631, cN = 92.614566473988;
    var lenTest = [new Float64Array([0, 0, 10, 0]), new Float64Array([0, 0, 0, 10])];
    var east = polyLengthM(lenTest[0], cE, cN);
    var north = polyLengthM(lenTest[1], cE, cN);
    R.lengthEastM = Math.round(east * 1000) / 1000;
    R.lengthNorthM = Math.round(north * 1000) / 1000;
    var tot = totalLengthM(lenTest, cE, cN);
    R.lengthTotalM = Math.round(tot * 1000) / 1000;
    R.lengthUsesBothCellSizes = (Math.abs(east - 10 * cE) < 1e-6 &&
                                 Math.abs(north - 10 * cN) < 1e-6 &&
                                 east > north &&
                                 Math.abs(tot - (east + north)) < 1e-6);

    /* --- a whole small NETWORK, not a figure: nothing may fall out of it --------------------
       Every case above is one clean shape, and the bug that nearly shipped could not be seen in
       any of them. It needed a branchy field: a step out of an already-visited cell was
       dropped, a real length of road never reached the polylines, and raster4 then left a
       one-cell diagonal hole exactly where that road used to seal the parcel - the leak this
       module exists to prevent, looking like a modelling result rather than a bug.

       So the last case is the contract itself, not a shape. The field is grown from a fixed
       seed with a Lehmer generator whose products all stay inside 2^53, so every browser gets
       the same 2,064 cells; it thins to 151. Three things are then true or the drawing is
       wrong: every skeleton cell is in some polyline, every step between two skeleton cells
       that has no way round it is walked exactly once, and the raster has no diagonal-only
       bridge anywhere. Before the fix this field lost one step and leaked through it. */
    var nw = 64, nh = 56, nfield = new Uint8Array(nw * nh), nseed = 5;
    var nrnd = function (mod) { nseed = (nseed * 16807) % 2147483647; return nseed % mod; };
    var bx, by, bt, br, ex, ey, ix, iy;
    for (i = 0; i < 5; i++) {
      bx = nrnd(nw);
      by = nrnd(nh);
      for (bt = 0; bt < 90; bt++) {
        br = 2 + nrnd(4);
        for (ey = -br; ey <= br; ey++) for (ex = -br; ex <= br; ex++) {
          if (ex * ex + ey * ey > br * br) continue;
          ix = bx + ex;
          iy = by + ey;
          if (ix >= 0 && iy >= 0 && ix < nw && iy < nh) nfield[iy * nw + ix] = 1;
        }
        bx += nrnd(7) - 3;
        by += nrnd(7) - 3;
        if (bx < 0) bx = 0; else if (bx > nw - 1) bx = nw - 1;
        if (by < 0) by = 0; else if (by > nh - 1) by = nh - 1;
      }
    }
    var nsk = thinZS(nfield, nw, nh);
    var nPolys = traceSkeleton(nsk, nw, nh);
    var nRaster = raster4(nPolys, nw, nh);
    var nN = nw * nh, nSeen = new Uint8Array(nN), nWalk = new Uint8Array(nN);
    var nq, npl, nStray = 0, nUncovered = 0, nLost = 0, nLeak = 0, nd, sx2, sy2, q00, q10, q01, q11;

    for (i = 0; i < nPolys.length; i++) {
      npl = nPolys[i];
      for (nq = 0; nq < npl.length; nq += 2) {
        x = npl[nq];
        y = npl[nq + 1];
        if (x < 0 || y < 0 || x >= nw || y >= nh || !nsk[y * nw + x]) { nStray++; continue; }
        nSeen[y * nw + x] = 1;
      }
      /* record each drawn step at both of its ends, the way the tracer marks them */
      for (nq = 0; nq + 3 < npl.length; nq += 2) {
        x = npl[nq];
        y = npl[nq + 1];
        sx2 = npl[nq + 2] - x;
        sy2 = npl[nq + 3] - y;
        for (nd = 0; nd < 8; nd++) if (DX[nd] === sx2 && DY[nd] === sy2) break;
        if (nd > 7) continue;                        // not a single-cell step: caught elsewhere
        nWalk[y * nw + x] |= (1 << nd);
        nWalk[(y + sy2) * nw + (x + sx2)] |= (1 << ((nd + 4) & 7));
      }
    }
    for (i = 0; i < nN; i++) if (nsk[i] && !nSeen[i]) nUncovered++;
    for (y = 0; y < nh; y++) for (x = 0; x < nw; x++) {
      if (!nsk[y * nw + x]) continue;
      for (nd = 0; nd < 8; nd++) {
        ix = x + DX[nd];
        iy = y + DY[nd];
        if (ix < 0 || iy < 0 || ix >= nw || iy >= nh) continue;
        if (!nsk[iy * nw + ix]) continue;
        /* a diagonal with a way round is a short cut, not a road: it is MEANT to be skipped */
        if ((nd & 1) && (nsk[y * nw + ix] || nsk[iy * nw + x])) continue;
        if (!(nWalk[y * nw + x] & (1 << nd))) nLost++;
      }
    }
    for (y = 0; y < nh - 1; y++) for (x = 0; x < nw - 1; x++) {
      q00 = nRaster[y * nw + x];
      q10 = nRaster[y * nw + x + 1];
      q01 = nRaster[(y + 1) * nw + x];
      q11 = nRaster[(y + 1) * nw + x + 1];
      if (q00 && q11 && !q10 && !q01) nLeak++;
      if (q10 && q01 && !q00 && !q11) nLeak++;
    }
    R.netFieldCells = countSet(nfield);
    R.netSkeletonCells = countSet(nsk);
    R.netPolylines = nPolys.length;
    R.netStrayPoints = nStray;
    R.netUncoveredCells = nUncovered;
    R.netLostSteps = nLost >> 1;                     // counted from both ends
    R.netDiagonalLeaks = nLeak;
    R.netKm = Math.round(totalLengthM(nPolys, cE, cN) / 10) / 100;
    R.networkLosesNoRoad = (nStray === 0 && nUncovered === 0 && nLost === 0 && nLeak === 0 &&
                            nPolys.length > 5 && R.netSkeletonCells > 100);

    R.ok = !!(R.barThinsToOneCellLine && R.barInputUntouched && R.plusOneJunction &&
              R.spurBarbRemovedAt5 && R.spurBarbKeptAt2 && R.spurTrunkSurvived &&
              R.raster4IsFourConnected && R.ringTracesAsOneClosedRing && R.ringSealsItsParcel &&
              R.declaredWidthIsHonest && R.simplifyKeepsCorners && R.simplifySurvives40k &&
              R.lengthUsesBothCellSizes && R.networkLosesNoRoad);
    return R;
  }

  function countSet(m) {
    var c = 0, i;
    for (i = 0; i < m.length; i++) if (m[i]) c++;
    return c;
  }

  /* ends and junctions by the crossing number, which is what the tracer uses. A neighbour count
     would say five junctions on a clean plus-sign; this says one. */
  function countNodes(m, w, h) {
    var p = new Uint8Array(8), idx = setIndex(m, w * h), k, i, x, y, a, ends = 0, junctions = 0, specks = 0;
    for (k = 0; k < idx.length; k++) {
      i = idx[k];
      x = i % w;
      y = (i - x) / w;
      ringInto(m, w, h, x, y, p);
      a = crossA(p);
      if (a === 0) specks++;
      else if (a === 1) ends++;
      else if (a >= 3) junctions++;
    }
    return { ends: ends, junctions: junctions, specks: specks };
  }

  window.Roads = {
    thinZS: thinZS,
    pruneSpurs: pruneSpurs,
    traceSkeleton: traceSkeleton,
    simplify: simplify,
    raster4: raster4,
    stampWidth: stampWidth,
    polyLengthM: polyLengthM,
    totalLengthM: totalLengthM,
    selfCheck: selfCheck,
    stats: stats,
    /* One place for the two declared widths, so the canvas stroke, the stamp and the export note
       cannot drift apart. Metres. */
    WIDTH_M: { layer1: 35, layer2: 19 },
    /* handed out because the panel and the tracer must agree on what a junction is */
    crossA: crossA,
    countNodes: countNodes
  };
})();
