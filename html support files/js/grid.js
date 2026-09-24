/* ==========================================================================
   LOOP CITY · combined app v1 · js/grid.js
   The one place that knows where anything is.

   Three grids cover the same piece of England, and every one of them has a
   different cell size:

       sheet         2513 x 2288 px    ~35.01 m   the base map image
       mould fine     950 x  865 cells  ~92.62 m  where the slime mould walks
       mould coarse   475 x  433 cells ~185.23 m  layer 2, the landscape roads
       growth        1256 x 1144 cells   70.00 m  where the fabric is built

   Everything here is tied to four British National Grid corners, and to
   nothing else. In particular nothing derives a cell size from `mPerPx` any
   more. That is how the two halves of this app drifted apart in the first
   place: the mould file computed its cell from metres-per-pixel, and the
   metres-per-pixel had been tidied to a round 35 somewhere upstream. Note
   carefully where the loss actually happened, because it is not where you
   would look: 35.012177 * (2513/950) is 92.61642, the right answer to five
   decimals. It is 35.0 * (2513/950) that gives 92.58421. The multiplication
   was never the problem. The rounding one step earlier was, and there it
   looked like housekeeping. The result is 32 mm per cell short, and over
   950 cells that is 30 m of accumulated slide - a third of a cell - so a
   station sat in one cell on the mould sheet and the neighbouring cell in the
   growth model, and no amount of care downstream could put them back together.
   A number computed from the corners cannot drift. Everything below is.

   ES5. No modules, no dependencies, no DOM. Hangs `window.Grid` and nothing
   else. There is no Node on this machine, so nothing here has been executed
   by its author - run `Grid.selfCheck()` in the browser console before you
   trust a single road it places.
   ========================================================================== */

(function (global) {
  "use strict";

  /* ---------------------------------------------------------------- corners
     EPSG:27700. E0/N1 is the top-left of the sheet, E1/N0 the bottom-right.
     North increases upward, so row 0 sits at N1 and rows count DOWN in N.
     These four numbers are the only measured quantities in this file. */

  var E0 = 452754.1;
  var N1 = 246493.2;
  var E1 = 540739.7;
  var N0 = 166381.6;

  var EXT_E = E1 - E0;   //  87985.6 m across
  var EXT_N = N1 - N0;   //  80111.6 m down

  /* Fine cell first, and the coarse cell from it by multiplication.

     This ordering is the whole point. Writing the coarse cell as EXT_N/433
     instead of 2*(EXT_N/865) looks equivalent and is not: 433 coarse rows of
     185.0 m reach 80111.6 m, while 433 rows of 2 x 92.6146 m reach 80204.2 m.
     The two definitions are 92.4 m apart at the south edge - one whole fine
     cell - and the drift is monotonic, so a road traced on the coarse grid and
     read back on the fine grid would be right at the top of the sheet and a
     cell out at the bottom. Layer 2 is built on exactly that correspondence,
     so that error would not look like an error. It would look like a road.

     The price is honest and small: coarse row 432 covers only fine row 864 and
     hangs 92.6 m past the south edge of the sheet. It is flagged below as
     `outsideRow` and nothing extracts from it. Columns are clean - 475 x 2 is
     exactly 950. */

  var FINE_E = EXT_E / 950;   // 92.616421052631... NEVER 92.584
  var FINE_N = EXT_N / 865;   // 92.614566473988...

  var GRID = {
    crs: "EPSG:27700",

    /* the four corners, so no other file has to re-type them */
    E0: E0, N1: N1, E1: E1, N0: N0,
    extentE: EXT_E,
    extentN: EXT_N,

    fine: {
      SW: 950, SH: 865,
      cellE: FINE_E,
      cellN: FINE_N
    },

    coarse: {
      SW: 475, SH: 433,
      cellE: 2 * FINE_E,
      cellN: 2 * FINE_N,
      outsideRow: 432        // covers one fine row only; never extract from it
    },

    /* The modelled window is the top-left 1256 x 1144 of the growth model's
       full 2143 x 1757 grid, which is why X0/Y0 are 0 and why the window's
       own origin is the sheet's origin. 70.0 m exactly - the growth model was
       always metric and always right; it is the mould that had to be fixed. */
    growth: {
      W: 1256, H: 1144,
      cell: 70.0,
      X0: 0, Y0: 0,
      fullW: 2143, fullH: 1757
    },

    /* The base map image. mE and mN are NOT a round 35 - they are the sheet
       extent divided by its pixels, and the canvas must use these when it
       converts a declared road width in metres into a stroke, or a 35 m road
       comes out 0.4 % wrong at every zoom for no reason. */
    sheet: {
      W: 2513, H: 2288,
      mE: EXT_E / 2513,      // 35.012177 m per pixel east
      mN: EXT_N / 2288       // 35.013811 m per pixel north
    },

    /* Carriageway widths the user set on 20 Sep, in metres, kept here so the
       canvas, the DXF and the SVG all read one number instead of three.
       grid.js owns only the arithmetic that turns these into cells or pixels;
       the ink, the dash and the clipping belong to the drawing contract.

       Worth saying plainly, because it decides the shape of the whole
       coupling: NEITHER of these widths is representable as a mask on ANY of
       these grids. 35 m is half a growth cell and 38 % of a fine mould cell;
       19 m is a fifth of one. That is why a road travels between the two
       halves of this app as a polyline in metres and is only ever rasterised
       at the far end, and why the growth-grid reserve is stated in CELLS on
       the panel. A slider labelled "30 m road width" on a 70 m grid can do
       nothing at all until it passes 46 m and then jumps straight to 278 m. */
    road: {
      layer1_m: 35,          // settlement roads, like an M road
      layer2_m: 19           // landscape and farm roads, like an A road
                             // internal roads are not this app's job - they
                             // come later, from parcel subdivision
    }
  };

  /* ------------------------------------------------------- the lookup tables

     Built once at boot, about 20 ms and about 13 MB, and then never rebuilt.
     The year loop runs 76 times over 1.4 million growth cells; a Math.floor
     and a divide in there is 100 million floating-point operations a run, for
     an answer that cannot change. So the answer is computed here instead.

     Built SEPARABLY - one map per column, one per row, combined by addition.
     Doing it cell by cell would be 1.4 million floors instead of 2,400, and
     more importantly it would let the two axes disagree: a per-cell floor of
     a 2-D expression can land a cell on a different row from its neighbour in
     the same row if the arithmetic reassociates. Separable cannot. */

  var CACHE = null;

  function build() {
    if (CACHE) return CACHE;

    var t0 = (global.performance && global.performance.now)
      ? global.performance.now() : 0;

    var SW = GRID.fine.SW, SH = GRID.fine.SH;
    var SW2 = GRID.coarse.SW;
    var GW = GRID.growth.W, GH = GRID.growth.H;
    var CELL = GRID.growth.cell;
    var cE = GRID.fine.cellE, cN = GRID.fine.cellN;

    var x, y, v, i, base;

    /* --- growth -> fine, per axis. Cell CENTRE into cell index. --------- */
    var mx = new Int32Array(GW);
    var my = new Int32Array(GH);
    var clampedCols = 0, clampedRows = 0;

    for (x = 0; x < GW; x++) {
      v = Math.floor((x + 0.5) * CELL / cE);
      /* This clamp never fires with the constants above (the largest value is
         948 against a limit of 949). It is here so that if someone ever edits
         a corner by a metre, the app draws a wrong road at the sheet edge
         rather than writing off the end of an Int32Array and taking the whole
         page down with a number nobody can trace. selfCheck reports the count,
         so a clamp that starts firing is visible rather than silent. */
      if (v < 0) { v = 0; clampedCols++; }
      else if (v >= SW) { v = SW - 1; clampedCols++; }
      mx[x] = v;
    }
    for (y = 0; y < GH; y++) {
      v = Math.floor((y + 0.5) * CELL / cN);
      if (v < 0) { v = 0; clampedRows++; }
      else if (v >= SH) { v = SH - 1; clampedRows++; }
      my[y] = v;
    }

    /* --- fine -> growth, per axis, -1 where there is no growth cell ----

       The growth window is 1256 x 70 = 87,920 m wide. The sheet is 87,985.6 m
       wide. The last 65.6 m of the sheet - fine column 949 - is simply not
       modelled, and no arithmetic makes it so. So it is -1, and every consumer
       guards on it. Do not be tempted to clamp it to column 1255 instead: that
       would fold a strip of the Essex edge back onto its neighbour and the
       fabric there would read double. Guard, never divide. */
    var gx = new Int32Array(SW);
    var gy = new Int32Array(SH);

    for (x = 0; x < SW; x++) {
      v = Math.floor((x + 0.5) * cE / CELL);
      gx[x] = (v >= 0 && v < GW) ? v : -1;
    }
    for (y = 0; y < SH; y++) {
      v = Math.floor((y + 0.5) * cN / CELL);
      gy[y] = (v >= 0 && v < GH) ? v : -1;
    }

    /* --- the four tables ----------------------------------------------- */

    var G2M = new Int32Array(GW * GH);     // 1,436,864 · ~5.7 MB
    var M2G = new Int32Array(SW * SH);     //   821,750 · ~3.3 MB
    var COVER = new Uint8Array(SW * SH);   //   821,750 · ~0.8 MB
    var F2C = new Int32Array(SW * SH);     //   821,750 · ~3.3 MB

    /* G2M, and COVER counted in the same pass - a second pass over 1.4 M
       cells to count what this one already knows would be pure waste. */
    var row;
    for (y = 0; y < GH; y++) {
      row = my[y] * SW;
      base = y * GW;
      for (x = 0; x < GW; x++) {
        i = row + mx[x];
        G2M[base + x] = i;
        COVER[i]++;
      }
    }

    /* M2G and F2C. F2C is exact by construction: the coarse grid IS the fine
       grid halved, so the coarse cell of a fine cell is a shift, not a
       division, and no rounding can creep in. */
    var g, c;
    for (y = 0; y < SH; y++) {
      base = y * SW;
      g = gy[y];
      c = (y >> 1) * SW2;
      for (x = 0; x < SW; x++) {
        M2G[base + x] = (g < 0 || gx[x] < 0) ? -1 : (g * GW + gx[x]);
        F2C[base + x] = c + (x >> 1);
      }
    }

    CACHE = {
      G2M: G2M, M2G: M2G, COVER: COVER, F2C: F2C,
      gx: gx, gy: gy, mx: mx, my: my,
      clampedCols: clampedCols,
      clampedRows: clampedRows,
      buildMs: ((global.performance && global.performance.now)
        ? global.performance.now() : 0) - t0
    };
    return CACHE;
  }

  /* ------------------------------------------------- cell centre <-> BNG

     Always the CENTRE of the cell, never its corner. A corner is half a cell
     out, which on the mould grid is 46 m - about the width of the roads this
     app is drawing - and the error is systematic, so it never looks like
     noise. It looks like the whole network sitting slightly north-west.

        E = E0 + (i + 0.5) * cell        N = N1 - (j + 0.5) * cell

     The inverses floor, so they return the cell a point falls IN, and they
     report `inside` rather than clamping. A point off the sheet is a fact
     about the data, not something to round away. */

  function fineToBNG(i, j) {
    return { E: E0 + (i + 0.5) * GRID.fine.cellE,
             N: N1 - (j + 0.5) * GRID.fine.cellN };
  }

  function bngToFine(E, N) {
    var i = Math.floor((E - E0) / GRID.fine.cellE);
    var j = Math.floor((N1 - N) / GRID.fine.cellN);
    var ok = (i >= 0 && i < GRID.fine.SW && j >= 0 && j < GRID.fine.SH);
    return { mx: i, my: j, inside: ok, idx: ok ? (j * GRID.fine.SW + i) : -1 };
  }

  function coarseToBNG(i, j) {
    return { E: E0 + (i + 0.5) * GRID.coarse.cellE,
             N: N1 - (j + 0.5) * GRID.coarse.cellN };
  }

  function bngToCoarse(E, N) {
    var i = Math.floor((E - E0) / GRID.coarse.cellE);
    var j = Math.floor((N1 - N) / GRID.coarse.cellN);
    var ok = (i >= 0 && i < GRID.coarse.SW && j >= 0 && j < GRID.coarse.SH);
    return { cx: i, cy: j, inside: ok, idx: ok ? (j * GRID.coarse.SW + i) : -1 };
  }

  function growthToBNG(i, j) {
    return { E: E0 + (i + 0.5) * GRID.growth.cell,
             N: N1 - (j + 0.5) * GRID.growth.cell };
  }

  function bngToGrowth(E, N) {
    var i = Math.floor((E - E0) / GRID.growth.cell);
    var j = Math.floor((N1 - N) / GRID.growth.cell);
    var ok = (i >= 0 && i < GRID.growth.W && j >= 0 && j < GRID.growth.H);
    return { gx: i, gy: j, inside: ok, idx: ok ? (j * GRID.growth.W + i) : -1 };
  }

  function sheetToBNG(i, j) {
    return { E: E0 + (i + 0.5) * GRID.sheet.mE,
             N: N1 - (j + 0.5) * GRID.sheet.mN };
  }

  function bngToSheet(E, N) {
    var i = Math.floor((E - E0) / GRID.sheet.mE);
    var j = Math.floor((N1 - N) / GRID.sheet.mN);
    var ok = (i >= 0 && i < GRID.sheet.W && j >= 0 && j < GRID.sheet.H);
    return { px: i, py: j, inside: ok, idx: ok ? (j * GRID.sheet.W + i) : -1 };
  }

  /* Metres to cells, for the modules that need a declared width as a count.
     These exist so that no file ever writes `metres / mPerPx` again. */
  function metresToFineCells(m)   { return m / GRID.fine.cellE; }
  function metresToCoarseCells(m) { return m / GRID.coarse.cellE; }
  function metresToGrowthCells(m) { return m / GRID.growth.cell; }
  function metresToSheetPx(m)     { return m / GRID.sheet.mE; }

  /* ---------------------------------------------- growth -> mould, the push

     SCATTER-ACCUMULATE, then divide by COVER. Not a gather.

     A mould cell is 92.6 m and a growth cell is 70 m, so each mould cell
     covers about 1.75 growth cells - one, two or four of them, never three,
     because the count is the product of a column count and a row count and
     each of those is 1 or 2. A gather ("for each mould cell, read the one
     growth cell at its centre") would look at 820,885 of the 1,436,864 growth
     cells and throw away the other 43 %. On dense fabric that would be almost
     invisible. On the scattered low rise of the 2030s, where a settlement is
     a handful of isolated cells, it means a cell is seen in one year and
     missed the next as the pattern shifts by one - fabric that flickers.

     Scattering visits every growth cell exactly once and divides by how many
     landed, so what arrives on the mould grid is the mean of what was there.
     A half-covered mould cell reads 0.5, which is what the blob hardening in
     step 5 wants to threshold.

     src  Float32Array/Uint8Array of GW*GH   (any numeric typed array)
     dst  Float32Array of SW*SH              (written, zeroed here first)
     Returns dst. */

  function pushGrowthToMould(src, dst, COVER, G2M) {
    var n = GRID.growth.W * GRID.growth.H;
    var m = GRID.fine.SW * GRID.fine.SH;
    var i;

    /* Loud, early, and by name. A silently mismatched buffer here would show
       up as a road in the wrong county forty seconds into a run. */
    if (!src || src.length !== n) {
      throw new Error("Grid.pushGrowthToMould: src must be " + n +
                      " growth cells, got " + (src ? src.length : src));
    }
    if (!dst || dst.length !== m) {
      throw new Error("Grid.pushGrowthToMould: dst must be " + m +
                      " fine mould cells, got " + (dst ? dst.length : dst));
    }
    if (!COVER || COVER.length !== m || !G2M || G2M.length !== n) {
      throw new Error("Grid.pushGrowthToMould: COVER/G2M are the wrong size " +
                      "- pass the ones from Grid.build().");
    }

    /* An explicit loop rather than dst.fill(0): typed-array fill is ES2015 and
       everything else in this file is ES5, so this keeps one rule. */
    for (i = 0; i < m; i++) dst[i] = 0;

    for (i = 0; i < n; i++) dst[G2M[i]] += src[i];

    for (i = 0; i < m; i++) {
      /* COVER is 0 for exactly 865 cells - the unmodelled east column. They
         are left at 0, never divided. A divide there gives NaN, and a NaN in
         SET propagates through the distance transform into every weight on
         the sheet within one year. */
      if (COVER[i] > 1) dst[i] /= COVER[i];
      else if (COVER[i] === 0) dst[i] = 0;
    }
    return dst;
  }

  /* ------------------------------------------------------------ selfCheck

     Everything below compares this file's arithmetic against numbers measured
     independently, outside the browser, before the file was written. It is not
     the code agreeing with itself. Run it in the console:

         Grid.selfCheck()

     and read `ok`. Every check is reported as <name>_ok plus the value that
     was actually measured, so a failure tells you how far out it is rather
     than just that it is out. */

  function selfCheck() {
    var R = { ok: true, notes: [] };

    function check(name, pass, value) {
      R[name + "_ok"] = !!pass;
      R[name] = value;
      if (!pass) { R.ok = false; R.notes.push(name + " = " + value); }
    }

    var T = build();
    var SW = GRID.fine.SW, SH = GRID.fine.SH;
    var GW = GRID.growth.W, GH = GRID.growth.H;
    var i, x, y, d;

    /* 1 · the cell sizes. 92.584 is the old wrong number and is named here on
       purpose, so that if it ever comes back this check says its name. */
    var eE = Math.round(GRID.fine.cellE * 10000) / 10000;
    var eN = Math.round(GRID.fine.cellN * 10000) / 10000;
    check("fineCellE", eE === 92.6164 && Math.abs(GRID.fine.cellE - 92.584) > 0.01,
          GRID.fine.cellE);
    check("fineCellN", eN === 92.6146 && Math.abs(GRID.fine.cellN - 92.584) > 0.01,
          GRID.fine.cellN);

    /* 2 · coarse is exactly twice fine. Strict ===, because "close enough"
       is the failure this check exists to catch. */
    check("coarseIsTwiceFine",
          GRID.coarse.cellE === 2 * GRID.fine.cellE &&
          GRID.coarse.cellN === 2 * GRID.fine.cellN,
          GRID.coarse.cellE - 2 * GRID.fine.cellE);

    /* 3 · the sheet metres per pixel, against the registration file. */
    check("sheetMetres",
          Math.abs(GRID.sheet.mE - 35.012177) < 1e-5 &&
          Math.abs(GRID.sheet.mN - 35.013811) < 1e-5,
          GRID.sheet.mE + " / " + GRID.sheet.mN);

    /* 4 · exactly 865 cells of M2G are outside, and they are column 949 and
       nothing else. Counting them is not enough - 865 scattered holes would
       pass a count and be a different bug entirely. */
    var out = 0, outElsewhere = 0, col949 = 0;
    for (y = 0; y < SH; y++) {
      var base = y * SW;
      for (x = 0; x < SW; x++) {
        if (T.M2G[base + x] === -1) {
          out++;
          if (x === 949) col949++; else outElsewhere++;
        }
      }
    }
    check("m2gOutside", out === 865, out);
    check("m2gOutsideIsColumn949", col949 === 865 && outElsewhere === 0,
          "col949=" + col949 + " elsewhere=" + outElsewhere);

    /* 5 · COVER accounts for every single growth cell, once. If this sums to
       anything but 1,436,864 then the push is dropping or double-counting
       fabric, and every km² figure on the chips is wrong. */
    var coverSum = 0, cover0 = 0, coverMax = 0;
    for (i = 0; i < SW * SH; i++) {
      coverSum += T.COVER[i];
      if (T.COVER[i] === 0) cover0++;
      if (T.COVER[i] > coverMax) coverMax = T.COVER[i];
    }
    check("coverSum", coverSum === GW * GH, coverSum);
    check("coverZeros", cover0 === 865, cover0);
    check("coverMax", coverMax === 4, coverMax);

    /* 6 · the round trip. growth -> fine -> growth, per axis, which is how it
       actually happens: the maps are separable, so east and north never
       interfere. Worst case must be one cell; the mean must stay well under
       half a cell or the two grids are not really registered.

       Measured independently beforehand: max 1, mean |dx| 0.2444, mean |dy|
       0.2439. The Chebyshev mean over all 1.4 M cells (the chance that EITHER
       axis is out) is 0.4287, and it is reported below as well - the 0.30 gate
       is the per-axis figure, not that one, and saying so here stops the next
       reader "fixing" a pass into a fail. */
    var dxs = new Int32Array(GW), dys = new Int32Array(GH);
    var maxAxis = 0, sumX = 0, sumY = 0;
    for (x = 0; x < GW; x++) {
      d = T.gx[T.mx[x]];
      d = (d < 0) ? GW : Math.abs(d - x);   // -1 here would be a real failure
      dxs[x] = d; sumX += d; if (d > maxAxis) maxAxis = d;
    }
    for (y = 0; y < GH; y++) {
      d = T.gy[T.my[y]];
      d = (d < 0) ? GH : Math.abs(d - y);
      dys[y] = d; sumY += d; if (d > maxAxis) maxAxis = d;
    }
    var meanX = sumX / GW, meanY = sumY / GH;
    var meanAxis = (meanX + meanY) / 2;
    check("roundTripMax", maxAxis <= 1, maxAxis);
    check("roundTripMean", meanAxis < 0.30, meanAxis);

    var sumCheb = 0;
    for (y = 0; y < GH; y++) {
      var dy = dys[y];
      for (x = 0; x < GW; x++) { d = dxs[x]; sumCheb += (d > dy) ? d : dy; }
    }
    R.roundTripMeanChebyshev = sumCheb / (GW * GH);   // reported, not gated

    /* 7 · F2C really is the halving, checked at the corners and at the seam
       where the odd row count bites. */
    var f2cOK =
      T.F2C[0] === 0 &&
      T.F2C[1] === 0 &&
      T.F2C[2] === 1 &&
      T.F2C[SW] === 0 &&                              // fine row 1 -> coarse 0
      T.F2C[2 * SW] === GRID.coarse.SW &&             // fine row 2 -> coarse 1
      T.F2C[864 * SW + 949] === 432 * GRID.coarse.SW + 474;
    check("f2cHalving", f2cOK, T.F2C[864 * SW + 949]);

    /* 8 · nothing was clamped. A non-zero here means a corner has been edited
       and the tables are quietly lying about the sheet edge. */
    check("noClamping", T.clampedCols === 0 && T.clampedRows === 0,
          T.clampedCols + "/" + T.clampedRows);

    /* 9 · the conversions are each other's inverse, at the corners and in the
       middle, on all four grids. */
    function inv(name, toBNG, toCell, kx, ky, cells) {
      var bad = 0, k, p, q;
      for (k = 0; k < cells.length; k++) {
        p = toBNG(cells[k][0], cells[k][1]);
        q = toCell(p.E, p.N);
        if (q[kx] !== cells[k][0] || q[ky] !== cells[k][1] || !q.inside) bad++;
      }
      check(name, bad === 0, bad);
    }
    inv("invFine", fineToBNG, bngToFine, "mx", "my",
        [[0, 0], [1, 0], [0, 1], [475, 432], [949, 864]]);
    inv("invCoarse", coarseToBNG, bngToCoarse, "cx", "cy",
        [[0, 0], [1, 1], [237, 216], [474, 431]]);
    inv("invGrowth", growthToBNG, bngToGrowth, "gx", "gy",
        [[0, 0], [1, 0], [628, 572], [1255, 1143]]);
    inv("invSheet", sheetToBNG, bngToSheet, "px", "py",
        [[0, 0], [1, 1], [1256, 1144], [2512, 2287]]);

    /* 10 · the corners land where a map says they should: cell (0,0) half a
       cell inside the north-west corner, the last cell half a cell inside the
       south-east one. A sign error in the N direction would sail through every
       check above and put the whole city upside down. */
    var nw = fineToBNG(0, 0), se = fineToBNG(949, 864);
    check("orientation",
          Math.abs(nw.E - (E0 + GRID.fine.cellE / 2)) < 1e-6 &&
          Math.abs(nw.N - (N1 - GRID.fine.cellN / 2)) < 1e-6 &&
          se.E > nw.E && se.N < nw.N &&
          Math.abs(se.E - (E1 - GRID.fine.cellE / 2)) < 1e-6 &&
          Math.abs(se.N - (N0 + GRID.fine.cellN / 2)) < 1e-6,
          "NW " + nw.E.toFixed(1) + "," + nw.N.toFixed(1) +
          "  SE " + se.E.toFixed(1) + "," + se.N.toFixed(1));

    /* 11 · the push, on a synthetic four-cell world with a hand-worked answer,
       so the mechanism is tested away from the real tables' size. Four growth
       cells land on two mould cells, and a third mould cell is covered by
       nothing at all. Means: 2 and 20, and the uncovered cell stays 0. */
    var sG2M = new Int32Array([0, 0, 1, 1]);
    var sCOV = new Uint8Array([2, 2, 0]);
    var sSrc = new Float32Array([1, 3, 10, 30]);
    var sDst = new Float32Array([99, 99, 99]);     // deliberately dirty
    var pushOK;
    try {
      /* the real function guards on the real sizes, so the synthetic case
         exercises the same arithmetic inline - the guard is what check 12 is
         for. */
      var k;
      for (k = 0; k < 3; k++) sDst[k] = 0;
      for (k = 0; k < 4; k++) sDst[sG2M[k]] += sSrc[k];
      for (k = 0; k < 3; k++) {
        if (sCOV[k] > 1) sDst[k] /= sCOV[k];
        else if (sCOV[k] === 0) sDst[k] = 0;
      }
      pushOK = (sDst[0] === 2 && sDst[1] === 20 && sDst[2] === 0);
    } catch (e) { pushOK = false; }
    check("pushSynthetic", pushOK, sDst[0] + "," + sDst[1] + "," + sDst[2]);

    /* 12 · the push on the real tables. A field of ones must come out as ones
       everywhere the mould is covered, and 0 in the uncovered column. Exact in
       float32: at most four 1.0s summed and halved or quartered. If this drifts
       by so much as an ulp, COVER and G2M disagree. */
    var ones = new Float32Array(GW * GH);
    for (i = 0; i < GW * GH; i++) ones[i] = 1;
    var got = new Float32Array(SW * SH);
    /* Dirty the destination first, and this matters more than it looks. A
       Float32Array straight from the constructor is already zero, so a `got`
       handed over clean would let a push that had FORGOTTEN to zero dst sail
       through this check. In the app dst is the same SET / FARM / POP buffer
       every year for seventy-five years, so a missing zero pass would not
       crash - it would quietly add each year's fabric to the last one's, and
       every km² on the chips would climb for a reason nobody could find. 99 is
       not a plausible cell value, so if it survives anywhere it names itself. */
    for (i = 0; i < SW * SH; i++) got[i] = 99;
    pushGrowthToMould(ones, got, T.COVER, T.G2M);
    var wrong = 0, zeros = 0;
    for (i = 0; i < SW * SH; i++) {
      if (T.COVER[i] === 0) { if (got[i] !== 0) wrong++; else zeros++; }
      else if (got[i] !== 1) wrong++;
    }
    check("pushRealOnes", wrong === 0 && zeros === 865, "wrong=" + wrong +
          " zeros=" + zeros);

    /* 13 · the guard fires. A wrong-sized buffer must throw by name, not
       corrupt memory and carry on. */
    var threw = false;
    try { pushGrowthToMould(new Float32Array(10), got, T.COVER, T.G2M); }
    catch (e2) { threw = true; }
    check("pushGuards", threw, threw);

    R.buildMs = T.buildMs;
    return R;
  }

  /* -------------------------------------------------------------- exports */

  global.Grid = {
    GRID: GRID,
    build: build,

    fineToBNG: fineToBNG,
    bngToFine: bngToFine,
    coarseToBNG: coarseToBNG,
    bngToCoarse: bngToCoarse,
    growthToBNG: growthToBNG,
    bngToGrowth: bngToGrowth,
    sheetToBNG: sheetToBNG,
    bngToSheet: bngToSheet,

    metresToFineCells: metresToFineCells,
    metresToCoarseCells: metresToCoarseCells,
    metresToGrowthCells: metresToGrowthCells,
    metresToSheetPx: metresToSheetPx,

    pushGrowthToMould: pushGrowthToMould,
    selfCheck: selfCheck
  };

/* `this` is the window in a plain <script>, which is how this app loads. The
   fallback is only so that a console paste or a test harness cannot end up
   defining Grid on nothing and failing three files later with "Grid is not
   defined". */
})(typeof window !== "undefined" ? window : this);
