/* Growth Simulator v9 - one quadrant, live in the page.

   The model is v8's, which is the Variation Catalogue's sandbox ported line by line, with three changes so it can
   run a piece of the real loop instead of one bare node:
     - the grid is rectangular (the quadrant window), not a square window round one node;
     - several nodes grow at once, each with its own land from ZONEDEF (v3 build_all.py), plus the ribbon on the
       spine, and every node keeps its own reach and its own promotion;
     - the ground is real: cells outside the buildable mask are never drawn, and grade 1 and 2 soil carries the
       catalogue's soil penalty.
   Everything else - desirability, the vein field, contrast, adjacency, the spine magnet, the Gumbel draw, the
   jittered promotion, the farming kernels and the two-pass order - is v8's code.                                */
(function () {
  "use strict";

  var K = { EMPTY: 0, LOW: 1, MED: 2, HIGH: 3, FIELD: 4, VFARM: 5, COM: 6, INST: 7 };
  var Y0 = 2025, Y1 = 2100;
  var PPK = [0, 4000, 9750, 25000];                       // people a km2 by tier

  // the sandbox's trajectory, PCHIP through 2025 0, 2035 .06, 2050 .28, 2075 .65, 2100 1
  var FRAC = [0.0, 0.002986, 0.006832, 0.011465, 0.016815, 0.022811, 0.029382, 0.036458, 0.043966, 0.051838,
    0.06, 0.069103, 0.079732, 0.091717, 0.10489, 0.119083, 0.134127, 0.149853, 0.166093, 0.182678,
    0.19944, 0.21621, 0.23282, 0.2491, 0.264883, 0.28, 0.294749, 0.309538, 0.324362, 0.339216,
    0.354097, 0.368999, 0.383917, 0.398847, 0.413785, 0.428726, 0.443664, 0.458596, 0.473517, 0.488422,
    0.503306, 0.518165, 0.532995, 0.547789, 0.562545, 0.577258, 0.591921, 0.606532, 0.621085, 0.635576,
    0.65, 0.664374, 0.678717, 0.69303, 0.707313, 0.721564, 0.735785, 0.749976, 0.764135, 0.778263,
    0.79236, 0.806426, 0.82046, 0.834463, 0.848434, 0.862373, 0.876281, 0.890157, 0.904, 0.917812,
    0.931591, 0.945338, 0.959052, 0.972734, 0.986384, 1.0];
  function frac(y) { return FRAC[Math.max(0, Math.min(FRAC.length - 1, y - Y0))]; }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function roundHE(x) { var f = Math.floor(x), d = x - f; if (d > 0.5) return f + 1; if (d < 0.5) return f; return (f % 2 === 0) ? f : f + 1; }
  function ramp(y, start, p) { if (start === null || y < start) return 0; return clamp01(Math.pow((y - start) / (2100 - start), p)); }

  // ------------------------------------------------------------------ the catalogue's nine axes, plus farming and functions
  var PARAMS = [
    { id: "reach", group: "Reach", label: "Reach", unit: "x radius of a solid disc", min: 1.0, max: 3.0, step: 0.1, def: 1.9,
      ticks: [1.2, 1.9, 2.8], tickNames: ["tight", "as run", "loose"],
      help: "How far a node's growth spreads for the land it holds." },
    { id: "veinA", group: "Vein", label: "Vein, base a", unit: "U x (a + b . VEIN)", min: 0, max: 1, step: 0.02, def: 0.28,
      ticks: [1.0, 0.28, 0.10], tickNames: ["off", "as run", "hard"], help: "The ridged filament field, after Frei Otto." },
    { id: "veinB", group: "Vein", label: "Vein, weight b", unit: "U x (a + b . VEIN)", min: 0, max: 2.5, step: 0.05, def: 1.35,
      ticks: [0.0, 1.35, 2.20], tickNames: ["off", "as run", "hard"], help: "0 switches the filaments off." },
    { id: "expo", group: "Contrast", label: "Contrast", unit: "U ** e", min: 1.0, max: 3.0, step: 0.1, def: 1.7,
      ticks: [1.0, 1.7, 3.0], tickNames: ["flat", "as run", "greedy"], help: "The exponent on desirability before the draw." },
    { id: "adjA", group: "Adjacency", label: "Adjacency, base a", unit: "draw x (a + b . neighbours)", min: 0.1, max: 1.0, step: 0.05, def: 0.55,
      ticks: [0.90, 0.55, 0.20], tickNames: ["weak", "as run", "strong"], help: "Reward for building beside fabric that already exists." },
    { id: "adjB", group: "Adjacency", label: "Adjacency, reward b", unit: "draw x (a + b . neighbours)", min: 0, max: 2.0, step: 0.05, def: 0.75,
      ticks: [0.20, 0.75, 1.60], tickNames: ["weak", "as run", "strong"], help: "Higher builds next to what is already built." },
    { id: "wR", group: "Spine", label: "Spine, weight", unit: "U + w . e^(-d/decay)", min: 0, max: 2.5, step: 0.1, def: 0.6,
      ticks: [0.0, 0.6, 2.0], tickNames: ["node city", "as run", "ribbon city"], help: "The line as a magnet against the node." },
    { id: "sR", group: "Spine", label: "Spine, decay", unit: "m", min: 500, max: 4000, step: 100, def: 1500,
      ticks: [1500, 1500, 3000], tickNames: ["node city", "as run", "ribbon city"], help: "How fast the line's pull fades." },
    { id: "rcore", group: "Promotion", label: "Promotion, core radius", unit: "m", min: 0, max: 2500, step: 50, def: 700,
      ticks: [0, 700, 1400], tickNames: ["peak at the station", "as run", "a far ring"], help: "Medium density may not begin inside this jittered distance." },
    { id: "rmed", group: "Promotion", label: "Promotion, medium radius", unit: "m", min: 0, max: 4000, step: 50, def: 1700,
      ticks: [0, 1700, 3200], tickNames: ["peak at the station", "as run", "a far ring"], help: "High density may not begin inside this jittered distance." },
    { id: "soil", group: "Soil", label: "Soil", unit: "weight on grade 1 and 2", min: 0.1, max: 1.0, step: 0.05, def: 0.45,
      ticks: [0.20, 0.45, 1.00], tickNames: ["soil protected", "as run", "soil ignored"],
      help: "The penalty the best farmland carries: desirability on grade 1 and 2 land is multiplied by this." },
    { id: "vpk", group: "Vertical band", label: "Vertical band, peak", unit: "m off the edge", min: 30, max: 800, step: 10, def: 240,
      ticks: [60, 240, 480], tickNames: ["quarter", "as run", "wide"], help: "Where vertical farming sits off the built edge." },
    { id: "vsg", group: "Vertical band", label: "Vertical band, sigma", unit: "m", min: 50, max: 1200, step: 5, def: 460,
      ticks: [95, 460, 900], tickNames: ["quarter", "as run", "wide"], help: "The width of the vertical farming collar." },
    { id: "vta", group: "Vertical band", label: "Vertical band, tail", unit: "", min: 0, max: 0.6, step: 0.01, def: 0.22,
      ticks: [0.04, 0.22, 0.35], tickNames: ["quarter", "as run", "wide"], help: "How much vertical farming reaches beyond the collar." },
    { id: "vtl", group: "Vertical band", label: "Vertical band, tail length", unit: "m", min: 100, max: 3000, step: 50, def: 1200,
      ticks: [300, 1200, 2000], tickNames: ["quarter", "as run", "wide"], help: "How far that tail runs." },
    { id: "seed", group: "Chance", label: "Chance", unit: "seed", min: 1, max: 9999, step: 1, def: 42,
      ticks: [7, 42, 2026], tickNames: ["seed 7", "as run", "seed 2026"], help: "Same rules and totals, a different layout." },
    { id: "farmH", group: "Farming", label: "Horizontal farming starts", unit: "year", min: 2026, max: 2070, step: 1, def: 2026,
      help: "The release starts fields in 2026." },
    { id: "farmV", group: "Farming", label: "Vertical farming starts", unit: "year", min: 2026, max: 2080, step: 1, def: 2036,
      help: "The release starts vertical farming in 2036." },
    // The programme is not decided yet, so the functions are off and their sliders are not on the page.
    // The code stays: raise com or inst (v8 ran 5 and 4) and the specks and their row come back together.
    { id: "com", group: "Functions", label: "Commercial / public", unit: "% of built", min: 0, max: 15, step: 0.5, def: 0,
      hidden: true,
      help: "Specks of shops, offices and public uses in the built fabric, thickest at the station and along the line." },
    { id: "inst", group: "Functions", label: "Institutional", unit: "% of built", min: 0, max: 12, step: 0.5, def: 0,
      hidden: true,
      help: "Schools, health, civic and culture, thickest in a ring round the station." },
    { id: "instPeak", group: "Functions", label: "Institutional, ring", unit: "m", min: 0, max: 4000, step: 100, def: 1600,
      hidden: true,
      help: "Where institutional specks are thickest." },
    { id: "progStart", group: "Functions", label: "Functions start", unit: "year", min: 2026, max: 2070, step: 1, def: 2035,
      hidden: true,
      help: "First year of commercial and institutional specks." }
  ];

  // ------------------------------------------------------------------ random numbers (v8's)
  function splitmix32(a) {
    return function () {
      a |= 0; a = (a + 0x9e3779b9) | 0;
      var t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
      t = t ^ (t >>> 15); t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
  }
  function sfc32(seed) {
    var sm = splitmix32(seed >>> 0), a = sm(), b = sm(), c = sm(), d = sm();
    function next() {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      var t = (a + b) | 0;
      a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0;
      t = (t + d) | 0; c = (c + t) | 0;
      return ((t >>> 0) + 0.5) / 4294967296;
    }
    for (var i = 0; i < 12; i++) next();
    return next;
  }
  function normals(rng, len) {
    var out = new Float32Array(len), i = 0;
    while (i < len) {
      var u = rng(), v = rng(), r = Math.sqrt(-2 * Math.log(u)), th = 6.283185307179586 * v;
      out[i++] = r * Math.cos(th);
      if (i < len) out[i++] = r * Math.sin(th);
    }
    return out;
  }
  var GBITS = 20, GUM = new Float32Array(1 << GBITS);
  (function () { for (var g = 0; g < GUM.length; g++) GUM[g] = -Math.log(-Math.log((g + 0.5) / GUM.length)); })();
  function fmix(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h; }
  function drawBase(seed, layer, year) {
    return fmix(fmix(fmix(seed ^ 0x2545f491) ^ Math.imul(layer, 0x9e3779b1)) ^ Math.imul(year, 0x85ebca77));
  }
  function gum(base, cell) { return GUM[fmix(base ^ Math.imul(cell + 1, 0xc2b2ae3d)) >>> (32 - GBITS)]; }
  var LOGMIN = Math.log(1e-9);

  // ------------------------------------------------------------------ filters on a rectangular grid (scipy's, reflect edges)
  function refl(i, n) { return i < 0 ? -i - 1 : (i >= n ? 2 * n - 1 - i : i); }
  function boxFilter(src, s, w, h) {
    var r = (s - 1) >> 1, inv = 1 / s, tmp = new Float32Array(w * h), out = new Float32Array(w * h), row, col, base, acc, k;
    for (row = 0; row < h; row++) {
      base = row * w; acc = 0;
      for (k = -r; k <= r; k++) acc += src[base + refl(k, w)];
      for (col = 0; col < w; col++) { tmp[base + col] = acc * inv; acc += src[base + refl(col + r + 1, w)] - src[base + refl(col - r, w)]; }
    }
    for (col = 0; col < w; col++) {
      acc = 0;
      for (k = -r; k <= r; k++) acc += tmp[refl(k, h) * w + col];
      for (row = 0; row < h; row++) { out[row * w + col] = acc * inv; acc += tmp[refl(row + r + 1, h) * w + col] - tmp[refl(row - r, h) * w + col]; }
    }
    return out;
  }
  function gaussFilter(src, sigma, w, h) {
    var r = Math.floor(4 * sigma + 0.5), L = 2 * r + 1, wt = new Float64Array(L), sum = 0, k, i;
    for (k = -r; k <= r; k++) { wt[k + r] = Math.exp(-(k * k) / (2 * sigma * sigma)); sum += wt[k + r]; }
    for (k = 0; k < L; k++) wt[k] /= sum;
    var tmp = new Float32Array(w * h), out = new Float32Array(w * h), buf = new Float64Array(Math.max(w, h) + 2 * r), row, col, acc;
    for (row = 0; row < h; row++) {
      var base = row * w;
      for (i = -r; i < w + r; i++) buf[i + r] = src[base + refl(i, w)];
      for (col = 0; col < w; col++) { acc = 0; for (k = 0; k < L; k++) acc += wt[k] * buf[col + k]; tmp[base + col] = acc; }
    }
    for (col = 0; col < w; col++) {
      for (i = -r; i < h + r; i++) buf[i + r] = tmp[refl(i, h) * w + col];
      for (row = 0; row < h; row++) { acc = 0; for (k = 0; k < L; k++) acc += wt[k] * buf[row + k]; out[row * w + col] = acc; }
    }
    return out;
  }
  function boxCount(mask, r, out, w, h) {
    var tmp = new Uint16Array(w * h), row, col, base, acc, k;
    for (row = 0; row < h; row++) {
      base = row * w; acc = 0;
      for (k = -r; k <= r; k++) acc += mask[base + refl(k, w)];
      for (col = 0; col < w; col++) { tmp[base + col] = acc; acc += mask[base + refl(col + r + 1, w)] - mask[base + refl(col - r, w)]; }
    }
    for (col = 0; col < w; col++) {
      acc = 0;
      for (k = -r; k <= r; k++) acc += tmp[refl(k, h) * w + col];
      for (row = 0; row < h; row++) { out[row * w + col] = acc; acc += tmp[refl(row + r + 1, h) * w + col] - tmp[refl(row - r, h) * w + col]; }
    }
    return out;
  }
  function bumpBox(cnt, q, r, w, h) {                      // one built cell into the reflected box counts
    var qr = (q / w) | 0, qc = q - qr * w, tr, tc, mr, mc, p;
    for (tr = qr - r; tr <= qr + r; tr++) {
      if (tr < 0 || tr >= h) continue;
      mr = 0;
      for (p = tr - r; p <= tr + r; p++) if (refl(p, h) === qr) mr++;
      if (!mr) continue;
      for (tc = qc - r; tc <= qc + r; tc++) {
        if (tc < 0 || tc >= w) continue;
        mc = 0;
        for (p = tc - r; p <= tc + r; p++) if (refl(p, w) === qc) mc++;
        if (mc) cnt[tr * w + tc] += mr * mc;
      }
    }
  }
  // exact Euclidean distance transform on a rectangle (Felzenszwalb-Huttenlocher), in cells
  function edt(feat, w, h) {
    var INF = 1e20, M = w * h, g = new Float64Array(M), m = Math.max(w, h),
      f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1), x, y, i;
    for (i = 0; i < M; i++) g[i] = feat[i] ? 0 : INF;
    function dt1(n) {
      var k = 0, q, s;
      v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (q = 1; q < n; q++) {
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
      }
      k = 0;
      for (q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    }
    for (x = 0; x < w; x++) { for (y = 0; y < h; y++) f[y] = g[y * w + x]; dt1(h); for (y = 0; y < h; y++) g[y * w + x] = d[y]; }
    for (y = 0; y < h; y++) { var b = y * w; for (x = 0; x < w; x++) f[x] = g[b + x]; dt1(w); for (x = 0; x < w; x++) g[b + x] = d[x]; }
    var out = new Float32Array(M);
    for (i = 0; i < M; i++) out[i] = g[i] >= INF / 2 ? 1e9 : Math.sqrt(g[i]);
    return out;
  }
  function TopK() { this.cap = 0; this.limit = 0; this.cnt = 0; this.key = null; this.idx = null; }
  TopK.prototype.reset = function (limit) {
    if (limit > this.cap) { this.cap = Math.max(limit, 4096); this.key = new Float64Array(this.cap); this.idx = new Int32Array(this.cap); }
    this.limit = limit; this.cnt = 0;
  };
  TopK.prototype.push = function (key, id) {
    var K_ = this.key, I = this.idx, j, p;
    if (this.cnt < this.limit) {
      j = this.cnt++;
      while (j > 0) { p = (j - 1) >> 1; if (K_[p] <= key) break; K_[j] = K_[p]; I[j] = I[p]; j = p; }
      K_[j] = key; I[j] = id; return;
    }
    if (this.limit === 0 || key <= K_[0]) return;
    var cnt = this.cnt; j = 0;
    for (;;) {
      var l = 2 * j + 1; if (l >= cnt) break;
      var r = l + 1, mm = (r < cnt && K_[r] < K_[l]) ? r : l;
      if (K_[mm] >= key) break;
      K_[j] = K_[mm]; I[j] = I[mm]; j = mm;
    }
    K_[j] = key; I[j] = id;
  };

  // ------------------------------------------------------------------ the ground: one window of the real map
  // World holds everything that does not change when a slider moves: the grid, the masks, the distance to each
  // node and to the spine, and the noise fields (those depend on the seed alone).
  function World(cfg) {
    var w = cfg.w, h = cfg.h, C = cfg.cellM, N = w * h, i, r, c;
    this.w = w; this.h = h; this.C = C; this.N = N; this.cellKm2 = (C * C) / 1e6;
    this.build = cfg.build; this.soil = cfg.soil; this.zone = cfg.zone;
    this.x0 = cfg.x0; this.y0 = cfg.y0;                    // the window's top-left in display pixels

    // COMBINED APP: ground the roads have taken. Held BY REFERENCE, and rewritten in place by
    // the caller once a year, so the year loop never has to call back into run(). Empty here
    // means the model behaves exactly as it always did.
    this.forbid = cfg.forbid || new Uint8Array(N);

    // distance to the spine, from the polyline in display pixels
    var feat = new Uint8Array(N), sp = cfg.spine, k, s, pxPerCell = cfg.pxPerCell;
    for (k = 0; k + 1 < sp.length; k++) {
      var ax = (sp[k][0] - cfg.x0) / pxPerCell, ay = (sp[k][1] - cfg.y0) / pxPerCell;
      var bx = (sp[k + 1][0] - cfg.x0) / pxPerCell, by = (sp[k + 1][1] - cfg.y0) / pxPerCell;
      var seg = Math.hypot(bx - ax, by - ay);
      if (seg > 200) continue;                              // a jump in the ring, not a run of line
      var steps = Math.max(1, Math.ceil(seg * 2));
      for (s = 0; s <= steps; s++) {
        var px = Math.round(ax + (bx - ax) * s / steps), py = Math.round(ay + (by - ay) * s / steps);
        if (px >= 0 && px < w && py >= 0 && py < h) feat[py * w + px] = 1;
      }
    }
    var dr = edt(feat, w, h);
    this.DRAIL = new Float32Array(N);
    for (i = 0; i < N; i++) this.DRAIL[i] = dr[i] * C;

    // distance to each growth node
    this.nodes = cfg.nodes.map(function (nd) {
      var cx = (nd.x - cfg.x0) / pxPerCell, cy = (nd.y - cfg.y0) / pxPerCell, D = new Float32Array(N), q;
      for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
        q = r * w + c;
        D[q] = Math.hypot(c + 0.5 - cx, r + 0.5 - cy) * C;
      }
      return { id: nd.id, t: nd.t, zone: nd.zone, cx: cx, cy: cy, D: D, alloc: nd.alloc };
    });
    this.ribbon = cfg.ribbon;                               // per zone: {zone, M, L}
    this.farm = cfg.farm;                                   // per zone: {zone, fh, fv}
    this.noiseCache = [];
  }
  World.prototype.noise = function (seed) {
    // COMBINED APP, bug fix: this returned `.Z`, and the cached object has no `.Z` -- it IS Z,
    // with .seed, .F, .V and .JIT on it. So a cache HIT returned undefined and run() died on
    // `var Z = world.noise(P.seed), F = Z.F`. The parent app never showed it because it only
    // ever ran the model once per page; running a second variant in the same page is what
    // finds it. Return the entry itself.
    for (var i = 0; i < this.noiseCache.length; i++) if (this.noiseCache[i].seed === seed) return this.noiseCache[i];
    var w = this.w, h = this.h, N = this.N, C = this.C, rng = sfc32(seed), j;
    var box = Math.max(3, Math.round(1050 / C) | 1);        // v8: 21 cells of 50 m
    var Fb = boxFilter(normals(rng, N), box, w, h), lo = 1e9, hi = -1e9;
    for (j = 0; j < N; j++) { if (Fb[j] < lo) lo = Fb[j]; if (Fb[j] > hi) hi = Fb[j]; }
    var F = new Float32Array(N);
    for (j = 0; j < N; j++) F[j] = (Fb[j] - lo) / (hi - lo + 1e-9);
    function ridged(sigmaM, pw) {
      var a = gaussFilter(normals(rng, N), sigmaM / C, w, h), mean = 0, sd = 0, q;
      for (q = 0; q < N; q++) mean += a[q];
      mean /= N;
      for (q = 0; q < N; q++) sd += (a[q] - mean) * (a[q] - mean);
      sd = Math.sqrt(sd / N) + 1e-9;
      for (q = 0; q < N; q++) { var t = 1 - Math.abs((a[q] - mean) / sd); a[q] = t <= 0 ? 0 : Math.pow(t, pw); }
      return a;
    }
    var r1 = ridged(400, 2.2), r2 = ridged(950, 2.0), r3 = ridged(1900, 1.8), V = new Float32Array(N), vmax = 0;
    for (j = 0; j < N; j++) { V[j] = 0.45 * r1[j] + 0.35 * r2[j] + 0.20 * r3[j]; if (V[j] > vmax) vmax = V[j]; }
    for (j = 0; j < N; j++) V[j] /= (vmax + 1e-9);
    var JIT = new Float32Array(N);
    for (j = 0; j < N; j++) JIT[j] = (0.70 + 0.60 * F[j]) * (0.80 + 0.40 * V[j]);
    var Z = { seed: seed, F: F, V: V, JIT: JIT };
    this.noiseCache.push(Z);
    if (this.noiseCache.length > 2) this.noiseCache.shift();
    return Z;
  };

  // ------------------------------------------------------------------ a run
  function run(world, Pin) {
    var w = world.w, h = world.h, N = world.N, C = world.C, CELLKM2 = world.cellKm2;
    var P = {}, i, j;
    PARAMS.forEach(function (d) {
      var v = Pin && Pin[d.id] !== undefined ? +Pin[d.id] : d.def;
      P[d.id] = isFinite(v) ? Math.max(d.min, Math.min(d.max, v)) : d.def;
    });
    P.seed = Math.round(P.seed) | 0;
    function cells(km2) { return roundHE(km2 / CELLKM2); }

    var Z = world.noise(P.seed), F = Z.F, V = Z.V, DRAIL = world.DRAIL, build = world.build, soil = world.soil;
    var FORBID = world.forbid;                             // COMBINED APP: by reference, see World()
    var T = { t0: Date.now() };

    // COMBINED APP: how far from the line the ribbon may reach. It was 2,600 m in both places
    // below, and that single number is the whole cause of the measured collapse -- with roads
    // taking ground along the same corridors the ribbon uses, there is not enough land left
    // inside the band and low rise silently delivers half of what it was asked for. Widening it
    // lets the fabric move back rather than disappear. Change BOTH uses or the draw cannot
    // reach cells the candidate list does not hold.
    var RIBBON_WIDE = P.ribbonBand || 4160;

    // soil: the penalty on grade 1 and 2 land (soil classes 0 and 1 in the source)
    var SOIL = new Float32Array(N);
    for (i = 0; i < N; i++) SOIL[i] = (soil[i] <= 1) ? P.soil : 1.0;

    // streams: one per node, then one ribbon per zone
    var streams = [], sid = 1;
    world.nodes.forEach(function (nd) {
      var a = nd.alloc;                                     // [high, medium, low] km2
      if (!a || (a[0] + a[1] + a[2]) <= 0) return;
      var landKm2 = a[0] + a[1] + a[2];
      var reach = Math.sqrt(Math.max(landKm2, 1) / Math.PI) * 1000 * P.reach;
      var prim = nd.t === "P";
      streams.push({ sid: sid++, kind: "node", node: nd, zone: nd.zone, D: nd.D,
        H: cells(a[0]), M: cells(a[1]), L: cells(a[2]), reach: reach, maskR: 1.7 * reach,
        gate: prim ? 2025 : 2035, mStart: prim ? 2033 : 2043, hStart: prim ? 2044 : 2054, order: null });
    });
    world.ribbon.forEach(function (rb) {
      if ((rb.M + rb.L) <= 0) return;
      streams.push({ sid: sid++, kind: "ribbon", zone: rb.zone, D: DRAIL,
        H: 0, M: cells(rb.M), L: cells(rb.L), reach: 0, maskR: 2600,
        gate: 2050, mStart: 2068, hStart: null, order: null });
    });
    streams.forEach(function (st) { st.land = st.H + st.M + st.L; st.got = 0; });

    // the cells each stream may draw from, nearest first (nodes) or along the line (ribbon)
    streams.forEach(function (st) {
      var list = [], q;
      for (q = 0; q < N; q++) {
        if (!build[q]) continue;
        if (st.kind === "node") { if (st.D[q] <= st.maskR && world.zone[q] === st.zone) list.push(q); }
        else if (DRAIL[q] <= RIBBON_WIDE && world.zone[q] === st.zone) list.push(q);
      }
      var arr = Int32Array.from(list), D = st.D;
      Array.prototype.sort.call(arr, function (a, b) { return D[a] - D[b]; });
      st.order = arr;
    });

    // desirability, as the sandbox's fields(): the node and the line as magnets, times vein, times the field
    var LU = new Float32Array(N), DJIT = new Float32Array(N), DNEAR = new Float32Array(N);
    for (i = 0; i < N; i++) DNEAR[i] = 1e9;
    streams.forEach(function (st) {
      if (st.kind !== "node") return;
      var D = st.D;
      for (var q = 0; q < N; q++) if (D[q] < DNEAR[q]) DNEAR[q] = D[q];
    });
    for (i = 0; i < N; i++) {
      var U = (3.0 * Math.exp(-DNEAR[i] / 9000) + P.wR * Math.exp(-DRAIL[i] / P.sR)) *
        (P.veinA + P.veinB * V[i]) * (0.72 + 0.55 * F[i]) * SOIL[i];
      LU[i] = U > 0 ? P.expo * Math.log(U) : -1e9;
      DJIT[i] = DNEAR[i] * Z.JIT[i];
    }
    var LADJ = new Float64Array(26);
    for (i = 0; i <= 25; i++) LADJ[i] = Math.log(P.adjA + P.adjB * i / 25);

    var LWC = new Float32Array(N), LWI = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var dj = DJIT[i], di = (dj - P.instPeak) / 1200;
      LWC[i] = Math.log(Math.exp(-dj / 1800) + 0.5 * Math.exp(-DRAIL[i] / 600) * Math.exp(-DNEAR[i] / 8000) + 0.01);
      LWI[i] = Math.log(Math.exp(-di * di) + 0.3 * Math.exp(-dj / 600) + 0.01);
    }

    // state
    var tier = new Uint8Array(N), own = new Uint8Array(N), B = new Uint8Array(N);
    var yB = new Int16Array(N), yM = new Int16Array(N), yH = new Int16Array(N), yFarm = new Int16Array(N);
    var prog = new Uint8Array(N), yP = new Int16Array(N);
    // COMBINED APP: what a field was, and the year it was lifted for a road.
    var yFarmEnd = new Int16Array(N), farmKind = new Uint8Array(N);
    var EVICT = P.evict !== 0;
    var builtList = new Int32Array(N), builtCount = 0;
    var NB5 = new Uint16Array(N), DENS = new Uint16Array(N), pendNB = [], pendD = [];
    var nb5r = Math.max(1, Math.round(125 / C)), densr = Math.max(2, Math.round(375 / C));
    function flushNB() { for (var k = 0; k < pendNB.length; k++) bumpBox(NB5, pendNB[k], nb5r, w, h); pendNB.length = 0; }
    function flushD() { for (var k = 0; k < pendD.length; k++) bumpBox(DENS, pendD[k], densr, w, h); pendD.length = 0; }
    var nbMax = (2 * nb5r + 1) * (2 * nb5r + 1);
    var heap = new TopK();
    var cnt = { L: 0, M: 0, H: 0, field: 0, vfarm: 0, com: 0, inst: 0 };
    var stats = [];

    var farmCells = { fh: 0, fv: 0 };
    world.farm.forEach(function (f) { farmCells.fh += cells(f.fh); farmCells.fv += cells(f.fv); });

    function target(st, y) {
      if (y < st.gate) return 0;
      var f0 = frac(st.gate), t = clamp01((frac(y) - f0) / Math.max(1e-6, 1 - f0));
      return roundHE(st.land * Math.pow(t, 0.62));
    }
    function build1(q, st, y) {
      tier[q] = 1; own[q] = st.sid; B[q] = 1; yB[q] = y; builtList[builtCount++] = q; cnt.L++;
      pendNB.push(q); pendD.push(q);
    }
    function disc(cx, cy, radM, st, y) {
      var rd = Math.ceil(radM / C) + 1, got = 0, rr, cc, q;
      for (rr = Math.floor(cy - rd); rr <= cy + rd; rr++) for (cc = Math.floor(cx - rd); cc <= cx + rd; cc++) {
        if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
        q = rr * w + cc;
        if (tier[q] !== 0 || !build[q] || FORBID[q]) continue;
        if (Math.hypot(cc + 0.5 - cx, rr + 0.5 - cy) * C > radM) continue;
        build1(q, st, y); got++;
      }
      return got;
    }

    function growthYear(y) {
      flushNB();
      for (var s = 0; s < streams.length; s++) {
        var st = streams[s];
        if (y < st.gate) continue;
        var need = target(st, y) - st.got;
        if (need <= 0) continue;
        if (st.got === 0) {                                 // the seed discs: 500 m at a node, 170 m along the line
          var planted = 0;
          if (st.kind === "node") planted = disc(st.node.cx, st.node.cy, 500, st, y);
          else {
            var step = Math.max(1, Math.floor(st.order.length / 600));
            for (j = 0; j < st.order.length; j += step) {
              var q0 = st.order[j];
              if (DRAIL[q0] > 120) continue;
              planted += disc((q0 % w) + 0.5, ((q0 / w) | 0) + 0.5, 170, st, y);
            }
          }
          st.got += planted;
          need = target(st, y) - st.got;
          if (need <= 0) continue;
        }
        var base = drawBase(P.seed, st.sid, y), q, key, open = 0, rad, wide;
        heap.reset(need);
        if (st.kind === "node") {
          var t = Math.min(1, st.got / Math.max(1, st.land));
          rad = st.reach * Math.max(0.18, Math.pow(t, 0.35)); wide = st.reach * 1.6;
        } else { rad = 2600; wide = RIBBON_WIDE; }
        for (j = 0; j < st.order.length; j++) {
          q = st.order[j];
          if (st.D[q] > rad) {
            if (open >= need || rad === wide) break;
            rad = wide;
            if (st.D[q] > rad) break;
          }
          if (tier[q] !== 0 || FORBID[q]) continue;
          open++;
          key = LU[q] + LADJ[Math.min(25, Math.round(NB5[q] / nbMax * 25))];
          heap.push((key > LOGMIN ? key : LOGMIN) + gum(base, q), q);
        }
        if (heap.cnt < need) st.short = (st.short || 0) + (need - heap.cnt);
        for (j = 0; j < heap.cnt; j++) build1(heap.idx[j], st, y);
        st.got += heap.cnt;
      }
    }

    function promotionYear(y) {
      var densReady = false;
      for (var s = 0; s < streams.length; s++) {
        var st = streams[s], k, q, haveMH = 0, haveH = 0;
        for (k = 0; k < builtCount; k++) { q = builtList[k]; if (own[q] === st.sid) { if (tier[q] >= 2) haveMH++; if (tier[q] === 3) haveH++; } }
        var wantMH = roundHE((st.M + st.H) * ramp(y, st.mStart, 0.85));
        if (wantMH > haveMH) {
          heap.reset(wantMH - haveMH);
          if (st.kind === "node") {
            for (k = 0; k < builtCount; k++) { q = builtList[k]; if (own[q] === st.sid && tier[q] === 1 && DJIT[q] >= P.rcore) heap.push(-DJIT[q], q); }
          } else {
            if (!densReady) { flushD(); densReady = true; }
            for (k = 0; k < builtCount; k++) { q = builtList[k]; if (own[q] === st.sid && tier[q] === 1) heap.push(DENS[q] * (0.4 + 1.2 * V[q]), q); }
          }
          for (k = 0; k < heap.cnt; k++) { q = heap.idx[k]; tier[q] = 2; yM[q] = y; cnt.L--; cnt.M++; }
        }
        if (st.hStart !== null && st.H > 0) {
          var wantH = roundHE(st.H * ramp(y, st.hStart, 0.95));
          if (wantH > haveH) {
            heap.reset(wantH - haveH);
            for (k = 0; k < builtCount; k++) { q = builtList[k]; if (own[q] === st.sid && tier[q] === 2 && DJIT[q] >= P.rmed) heap.push(-DJIT[q], q); }
            for (k = 0; k < heap.cnt; k++) { q = heap.idx[k]; tier[q] = 3; yH[q] = y; cnt.M--; cnt.H++; }
          }
        }
      }
    }

    function functionsYear(y) {
      if (y < P.progStart) return;
      var builtNow = cnt.L + cnt.M + cnt.H, rp = Math.pow(clamp01((y - P.progStart + 1) / 10), 0.7);
      var kinds = [[K.COM, P.com, LWC, "com", 6], [K.INST, P.inst, LWI, "inst", 7]];
      for (var t = 0; t < 2; t++) {
        var kd = kinds[t], need = roundHE(kd[1] / 100 * builtNow * rp) - cnt[kd[3]];
        if (need <= 0) continue;
        var base = drawBase(P.seed, kd[4], y), LW = kd[2], k, q;
        heap.reset(need);
        for (k = 0; k < builtCount; k++) { q = builtList[k]; if (prog[q] === 0) heap.push(LW[q] + gum(base, q), q); }
        for (k = 0; k < heap.cnt; k++) { q = heap.idx[k]; prog[q] = kd[0]; yP[q] = y; cnt[kd[3]]++; }
      }
    }

    // farming, pass 2: the distance from the finished fabric drives the two kernels
    var LWV = null, LWH = null;
    function farmWeights(DFIN) {
      LWV = new Float32Array(N); LWH = new Float32Array(N);
      for (var q = 0; q < N; q++) {
        if (!build[q]) { LWV[q] = -1e9; LWH[q] = -1e9; continue; }
        var D = DFIN[q], a = (D - P.vpk) / P.vsg, b = (D - 1750) / 1650;
        var wv = Math.exp(-a * a) + P.vta * Math.exp(-D / P.vtl);
        var wh = Math.exp(-b * b) + 0.34 * Math.exp(-Math.max(0, D - 180) / 2000) + 0.35 * Math.exp(-DNEAR[q] / 14000);
        LWV[q] = wv > 1e-4 ? 1.6 * Math.log(wv) : -1e9;
        LWH[q] = wh > 1e-4 ? 1.6 * Math.log(wh) : -1e9;
      }
    }
    function farmingYear(y) {
      /* COMBINED APP: the fields yield, and nothing else does.
         A horizontal field standing where a road has just been laid is lifted. The test is
         `tier[e] === K.FIELD`, which excludes low, medium and high rise and the vertical collar
         BY CONSTRUCTION -- there is no branch here that could be got wrong and start evicting
         people. They re-plant themselves on their own: `need` below is the cumulative target
         minus the current count, so the n cells lifted come back as n extra the same year, put
         down by the same weights on the best remaining unroaded ground -- which is further out,
         because the near ground is where the road is. That is the fields being pushed outward,
         and it is the whole of the mechanism. */
      var e;
      if (EVICT) {
        for (e = 0; e < N; e++) {
          if (tier[e] !== K.FIELD || !FORBID[e]) continue;
          farmKind[e] = tier[e];                            // remember what stood here, and until when
          yFarmEnd[e] = y;
          tier[e] = 0; cnt.field--;
        }
      }
      // Vertical is drawn FIRST, and must stay first: it is the collar off the built edge, and
      // re-allocated fields would otherwise take the collar's ground before it is laid.
      var types = [[LWV, K.VFARM, farmCells.fv, "vfarm", 3, P.farmV], [LWH, K.FIELD, farmCells.fh, "field", 4, P.farmH]];
      for (var t = 0; t < 2; t++) {
        var tp = types[t], start = tp[5];
        if (y < start) continue;
        var fr = Math.pow(clamp01((frac(y) - frac(start)) / Math.max(1e-6, 1 - frac(start))), 0.62);
        var need = roundHE(tp[2] * fr) - cnt[tp[3]];
        if (need <= 0) continue;
        var LW = tp[0], base = drawBase(P.seed, tp[4], y), q;
        heap.reset(need);
        for (q = 0; q < N; q++) {
          if (tier[q] !== 0 || LW[q] < -1e8 || FORBID[q]) continue;
          heap.push(LW[q] + gum(base, q), q);
        }
        for (j = 0; j < heap.cnt; j++) { q = heap.idx[j]; tier[q] = tp[1]; yFarm[q] = y; yFarmEnd[q] = 0; cnt[tp[3]]++; }
      }
    }

    function record(y) {
      var visL = 0, visM = 0, visH = 0, k, q;
      for (k = 0; k < builtCount; k++) {
        q = builtList[k];
        if (prog[q]) continue;
        if (tier[q] === 1) visL++; else if (tier[q] === 2) visM++; else if (tier[q] === 3) visH++;
      }
      stats.push({ y: y, L: cnt.L, M: cnt.M, H: cnt.H, visL: visL, visM: visM, visH: visH,
        field: cnt.field, vfarm: cnt.vfarm, com: cnt.com, inst: cnt.inst,
        people: (cnt.L * PPK[1] + cnt.M * PPK[2] + cnt.H * PPK[3]) * CELLKM2 });
    }

    var FARM_FROM = Math.min(P.farmH, P.farmV);
    var pass = 1, year = Y0, snap = null, DFIN = null;
    var out = { w: w, h: h, C: C, K: K, params: P, streams: streams.map(function (st) {
        return { sid: st.sid, kind: st.kind, id: st.node ? st.node.id : ("ribbon " + st.zone), zone: st.zone,
                 H: st.H, M: st.M, L: st.L, reach: st.reach, short: st.short || 0 }; }),
      farmCells: farmCells, tier: tier, yB: yB, yM: yM, yH: yH, yFarm: yFarm, prog: prog, yP: yP,
      yFarmEnd: yFarmEnd, farmKind: farmKind,
      stats: stats, done: false, pass: 1, year: Y0, timing: T, cellKm2: CELLKM2 };

    function takeSnapshot() {
      snap = { tier: tier.slice(), own: own.slice(), B: B.slice(), yB: yB.slice(), yM: yM.slice(), yH: yH.slice(),
        prog: prog.slice(), yP: yP.slice(), builtList: builtList.slice(0, builtCount), builtCount: builtCount,
        cnt: JSON.parse(JSON.stringify(cnt)), got: streams.map(function (st) { return st.got; }), stats: stats.slice() };
    }
    function beginPass2() {
      tier.set(snap.tier); own.set(snap.own); B.set(snap.B); yB.set(snap.yB); yM.set(snap.yM); yH.set(snap.yH);
      prog.set(snap.prog); yP.set(snap.yP); yFarm.fill(0);
      builtList.set(snap.builtList); builtCount = snap.builtCount;
      boxCount(B, nb5r, NB5, w, h); boxCount(B, densr, DENS, w, h); pendNB.length = 0; pendD.length = 0;
      Object.keys(snap.cnt).forEach(function (k) { cnt[k] = snap.cnt[k]; });
      streams.forEach(function (st, s) { st.got = snap.got[s]; });
      stats.length = 0; snap.stats.forEach(function (r) { stats.push(r); });
      farmWeights(DFIN);
      year = FARM_FROM; pass = 2; out.pass = 2;
    }

    return {
      out: out,
      step: function () {
        if (pass === 1) {
          growthYear(year);
          promotionYear(year);
          if (year < FARM_FROM) { functionsYear(year); record(year); }
          if (year === FARM_FROM - 1) takeSnapshot();
          out.year = year;
          year++;
          if (year > Y1) {
            var feat = new Uint8Array(N), q;
            for (q = 0; q < N; q++) feat[q] = (tier[q] >= 1 && tier[q] <= 3) ? 1 : 0;
            var d = edt(feat, w, h);
            DFIN = new Float32Array(N);
            for (q = 0; q < N; q++) DFIN[q] = d[q] * C;
            T.pass1 = Date.now() - T.t0;
            beginPass2();
          }
          return true;
        }
        growthYear(year);
        promotionYear(year);
        farmingYear(year);
        functionsYear(year);
        record(year);
        out.year = year;
        year++;
        if (year > Y1) { out.done = true; T.total = Date.now() - T.t0; return false; }
        return true;
      }
    };
  }

  function classAt(o, i, y) {
    var p = o.prog[i];
    if (p && o.yP[i] <= y) return p;
    var v = o.yH[i];
    if (v && v <= y) return K.HIGH;
    v = o.yM[i];
    if (v && v <= y) return K.MED;
    v = o.yB[i];
    if (v && v <= y) return K.LOW;
    v = o.yFarm[i];
    if (v && v <= y) {
      // COMBINED APP: a field lifted for a road in 2061 stood from yFarm to 2061 and must
      // play back that way. Without this the film shows it as though it never existed, and
      // being SEEN to be pushed out is the whole story the drawing has to tell.
      var e = o.yFarmEnd ? o.yFarmEnd[i] : 0;
      if (e && y >= e) return K.EMPTY;
      return (o.farmKind && o.farmKind[i]) ? o.farmKind[i] : o.tier[i];
    }
    return K.EMPTY;
  }

  window.GrowthSim = { World: World, run: run, PARAMS: PARAMS, K: K, classAt: classAt, PPK: PPK, Y0: Y0, Y1: Y1 };
})();
