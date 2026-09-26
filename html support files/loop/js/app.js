/* Growth Simulator v9 - one quadrant. The page: layers, the catalogue's sliders, the key plan and the run.
   Everything is drawn in the data bundle's pixels (35 m each, the slime mould quadrant's registration) under one
   transform, so a view is only a rectangle in that space. The model runs on Zones 05 + 06 at 70 m.              */
(function () {
  "use strict";
  var D = window.GROWTH_DATA, S = window.GrowthSim, K = S.K;
  var W = D.size[0], H = D.size[1], STEP = D.simStep, PX = D.mPerPx;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (v) { return Math.round(v).toLocaleString("en-GB"); };
  var km2 = function (v) { return (Math.round(v * 10) / 10).toLocaleString("en-GB"); };
  var M2_PER_KM2 = 1000000;
  var km2ToM2 = function (v) { return v * M2_PER_KM2; };

  // ---------------------------------------------------------------- the model's own numbers (v3 build_all.py ZONEDEF)
  var ZONEDEF = {
    1: { P: { P3: [0, 16.0, 8.0], S2: [0, 8.0, 5.0] }, ribbon: [0, 8.67, 20.0], fh: 523.6, fv: 22.3, pop: 534992 },
    2: { P: { P4: [21.22, 24.0, 8.0], S3: [9.10, 12.0, 5.0] }, ribbon: [0, 12.41, 26.0], fh: 61.3, fv: 9.5, pop: 1515809 },
    3: { P: { P5: [19.26, 22.0, 8.0], S4: [6.42, 10.0, 5.0], S5: [6.42, 10.0, 5.0] }, ribbon: [0, 18.0, 45.0], fh: 194.2, fv: 70.0, pop: 1783305 },
    4: { P: { P6: [22.4, 25.0, 7.0], S6: [7.45, 11.5, 4.0], S7: [7.45, 11.5, 4.0] }, ribbon: [0, 2.6, 14.5], fh: 220.1, fv: 79.6, pop: 1694140 },
    5: { P: { P1: [48.9, 30.0, 6.0], S8: [21.0, 14.0, 4.0] }, ribbon: [0, 15.0, 12.0], fh: 206.0, fv: 47.7, pop: 2496627 },
    6: { P: { P2: [6.24, 20.0, 6.0], S1: [2.68, 11.0, 4.0] }, ribbon: [0, 9.73, 22.0], fh: 386.1, fv: 89.1, pop: 891653 }
  };
  // What the model runs on. The whole loop is the master setting; the quadrant is the quick one, and the
  // same window the slime mould works in. The views are only windows onto whatever has grown.
  var SCOPES = {
    loop: { zones: [1, 2, 3, 4, 5, 6], win: null, nm: "整个环线" },
    quad: { zones: [5, 6], win: null, nm: "分区 05 + 06" }
  };
  var scope = "loop";
  function zonesNow() { return SCOPES[scope].zones; }

  // ---------------------------------------------------------------- layers
  var P = D.palette;
  var LAYERS = [
    { id: "greenbelt", f: "l_greenbelt.png", nm: "Green Belt", sw: P.greenbelt, on: true, op: 1 },
    { id: "gbedge", f: "l_greenbelt_edge.png", nm: "Green Belt boundary", sw: P.gbEdge, on: true, op: 1 },
    { id: "aonb", f: "l_aonb.png", nm: "National Landscape", sw: P.aonb, on: true, op: 1 },
    { id: "water", f: "l_water.png", nm: "Water", sw: P.water, on: true, op: 1 },
    { id: "townOther", f: "l_towns_other.png", nm: "Existing towns", sw: P.townOther, on: true, op: 1 },
    { id: "townAbs", f: "l_towns_absorbed.png", nm: "Towns the loop absorbs", sw: P.townAbsorbed, on: true, op: 1 },
    { id: "london", f: "l_london_edge.png", nm: "Greater London boundary", sw: P.londonEdge, on: true, op: 1 }
  ];
  var VEC = [
    { id: "growth", nm: "Growth (the model)", sw: P.high, on: true, op: 1 },
    { id: "spine", nm: "The orbital", sw: P.spineOver, on: true, op: 1 },
    { id: "nodes", nm: "Nodes and stations", sw: P.nodeInk, on: true, op: 1 },
    { id: "nodeNames", nm: "Node names", sw: "#5d5a55", on: true, op: 1 },
    { id: "zones", nm: "Zone lines", sw: P.zoneLine, on: true, op: 1 },
    { id: "zoneNames", nm: "Zone names", sw: P.zoneLine, on: false, op: 1 },
    { id: "townNames", nm: "Town names", sw: "#8F8B84", on: false, op: 1 }
  ];
  var CLASS_COLOUR = {};
  CLASS_COLOUR[K.LOW] = P.low; CLASS_COLOUR[K.MED] = P.mid; CLASS_COLOUR[K.HIGH] = P.high;
  CLASS_COLOUR[K.FIELD] = P.farmH; CLASS_COLOUR[K.VFARM] = P.farmV;
  CLASS_COLOUR[K.COM] = "#B2553F"; CLASS_COLOUR[K.INST] = "#6E7FA0";

  // ---------------------------------------------------------------- state
  var img = {}, masks = {}, world = null, sim = null, out = null, running = false, exporting = false;
  var exportKind = null, FIG = null, mapH = 0;               // what the panel last worked out, for the sheet
  var view = { x: 0, y: 0, w: W, h: H }, viewMode = "loop", viewWhich = "NW", viewNote = "the whole loop";
  function viewTitle() { return viewNote.split(" · click")[0].split(" · outside")[0]; }
  var NODE_KM = [40, 20, 10, 5], nodeLevel = 0, nodeId = "P1", inWindow = [];
  var LOOPVIEW = (function () {                              // the loop with even air round it, inside the frame
    var xs = D.spine.map(function (p) { return p[0]; }), ys = D.spine.map(function (p) { return p[1]; });
    var pad = 150, x0 = Math.max(0, Math.min.apply(null, xs) - pad), y0 = Math.max(0, Math.min.apply(null, ys) - pad);
    return { x: x0, y: y0, w: Math.min(W, Math.max.apply(null, xs) + pad) - x0,
             h: Math.min(H, Math.max.apply(null, ys) + pad) - y0 };
  })();
  var year = S.Y0, playing = false, timer = null, params = {}, speed = 90;
  var growthCv = document.createElement("canvas"), growthCtx = null, growthYear = -1;
  var cv = $("cv"), ctx = cv.getContext("2d");
  var SIMW = 0, SIMH = 0, SIMX = 0, SIMY = 0;               // the model's window, in data pixels
  var simZone = null, curCls = null, VC = new Float64Array(8);
  var BOX = { r0: 0, r1: -1, c0: 0, c1: -1, zone: 0 };       // the cells the view covers, in model cells

  // ---------------------------------------------------------------- loading
  // Opened straight off the disk, a page may draw the PNGs beside it but may not read their pixels back, and
  // the masks are pixels. So on file:// the same PNGs are taken from js/assets_inline.js, where they are
  // carried as data URIs; over http the files are used as they are.
  function loadInline() {
    return new Promise(function (res, rej) {
      if (location.protocol !== "file:" || window.GROWTH_ASSETS) return res();
      var s = document.createElement("script");
      s.src = "js/assets_inline.js";
      s.onload = function () { res(); };
      s.onerror = function () {
        rej(new Error("js/assets_inline.js is missing, and a page opened off the disk cannot read the " +
          "layers in assets/. Run build/inline_assets.py, or open the app over http."));
      };
      document.head.appendChild(s);
    });
  }
  function assetSrc(file) {
    var A = window.GROWTH_ASSETS;
    return (A && A[file]) ? A[file] : "assets/" + file;
  }
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("cannot load " + file)); };
      im.src = assetSrc(file);
    });
  }
  function readMask(im, file) {
    var c = document.createElement("canvas");
    c.width = im.width; c.height = im.height;
    var cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(im, 0, 0);
    var d;
    try {
      d = cx.getImageData(0, 0, im.width, im.height).data;
    } catch (e) {
      throw new Error("the page cannot read " + file + ". Rebuild js/assets_inline.js with " +
        "build/inline_assets.py, or open the app over http.");
    }
    var out = new Uint8Array(im.width * im.height);
    for (var i = 0, j = 0; i < out.length; i++, j += 4) out[i] = d[j];
    return { w: im.width, h: im.height, a: out };
  }

  function boot() {
    $("status").textContent = location.protocol === "file:" ? "unpacking the ground…" : "loading the ground…";
    loadInline().then(function () {
      var jobs = LAYERS.map(function (L) { return loadImage(L.f).then(function (im) { img[L.id] = im; }); });
      ["m_build", "m_soil", "m_zone"].forEach(function (m) {
        jobs.push(loadImage(m + ".png").then(function (im) { masks[m] = readMask(im, m + ".png"); }));
      });
      return Promise.all(jobs);
    }).then(function () {
      buildWorld();
      buildUI();
      setView("loop");
      $("status").style.display = "none";
      render();
      if (window.LoopCity) {                               // Loop City v8: the shell may now talk to it
        LoopCity.on("shell", function () { LoopCity.label(viewTitle()); });
        LoopCity.ready();
      }
    }).catch(function (e) {
      $("status").textContent = e.message;
    });
  }

  // ---------------------------------------------------------------- the model's window and world
  function buildWorld() {
    SCOPES.loop.win = [0, 0, W, H];
    SCOPES.quad.win = D.views.quadrant;                      // the slime mould sheet
    var ZN = zonesNow(), q = SCOPES[scope].win;
    SIMX = q[0]; SIMY = q[1];
    SIMW = Math.floor(q[2] / STEP); SIMH = Math.floor(q[3] / STEP);
    var mb = masks.m_build, ms = masks.m_soil, mz = masks.m_zone;
    var build = new Uint8Array(SIMW * SIMH), soil = new Uint8Array(SIMW * SIMH), zone = new Uint8Array(SIMW * SIMH);
    var ox = Math.floor(SIMX / STEP), oy = Math.floor(SIMY / STEP), r, c, s, t;
    for (r = 0; r < SIMH; r++) for (c = 0; c < SIMW; c++) {
      s = (r + oy) * mb.w + (c + ox); t = r * SIMW + c;
      build[t] = mb.a[s] > 127 ? 1 : 0;
      soil[t] = ms.a[s];
      zone[t] = mz.a[s];
    }
    // only the zones in this scope grow
    for (t = 0; t < zone.length; t++) if (ZN.indexOf(zone[t]) < 0) build[t] = 0;

    var nodes = [], ribbon = [], farm = [];
    ZN.forEach(function (z) {
      var zd = ZONEDEF[z];
      Object.keys(zd.P).forEach(function (id) {
        var nd = D.nodes.filter(function (n) { return n.id === id; })[0];
        if (!nd) return;
        nodes.push({ id: id, t: nd.t, zone: z, x: nd.x, y: nd.y, alloc: zd.P[id] });
      });
      ribbon.push({ zone: z, M: zd.ribbon[1], L: zd.ribbon[2] });
      farm.push({ zone: z, fh: zd.fh, fv: zd.fv });
    });

    simZone = zone;
    world = new S.World({
      w: SIMW, h: SIMH, cellM: PX * STEP, pxPerCell: STEP, x0: SIMX, y0: SIMY,
      build: build, soil: soil, zone: zone, spine: D.spine, nodes: nodes, ribbon: ribbon, farm: farm
    });
    growthCv.width = SIMW; growthCv.height = SIMH;
    growthCtx = growthCv.getContext("2d");
    var scopeEn = scope === "loop" ? "the whole loop" : "Zones 05 + 06";
    $("runNote").innerHTML = leftBi(
      scopeEn + " · " + (PX * STEP) + " m grid · " + fmt(SIMW * SIMH / 1e6 * 10) / 10 + "M cells",
      SCOPES[scope].nm + " · " + (PX * STEP) + " m 网格 · " + fmt(SIMW * SIMH / 1e6 * 10) / 10 + "M 个单元"
    );
    document.querySelectorAll("[data-scope]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.scope === scope);
    });
    nodeChips();
  }
  function setScope(name) {
    if (name === scope || running) return;
    scope = name;
    out = null; sim = null; EV = null; growthYear = -1;
    setPlaying(false);
    buildWorld();
    year = S.Y0;
    $("yslider").value = S.Y0;
    $("hudYear").textContent = S.Y0;
    $("hudPhase").textContent = "ready";
    $("barNote").textContent = "press Run";
    $("btnRun").classList.add("primary");
    stats();
    render();
  }

  // ---------------------------------------------------------------- the panels
  // Chinese display strings for the Loop left control panel only.
  // Parameter ids, numeric ranges and simulation logic remain unchanged.
  var LEFT_ZH = {
    group: {
      "Reach": "扩散范围",
      "Vein": "脉络",
      "Contrast": "对比度",
      "Adjacency": "邻接性",
      "Spine": "主环线",
      "Promotion": "密度提升",
      "Soil": "土地保护",
      "Vertical band": "垂直农业带",
      "Chance": "随机性",
      "Farming": "农业",
      "Functions": "功能"
    },
    label: {
      "Reach": "扩散范围",
      "Vein, base a": "脉络，基础值 a",
      "Vein, weight b": "脉络，权重 b",
      "Contrast": "对比度",
      "Adjacency, base a": "邻接性，基础值 a",
      "Adjacency, reward b": "邻接性，奖励值 b",
      "Spine, weight": "主环线，权重",
      "Spine, decay": "主环线，衰减距离",
      "Promotion, core radius": "密度提升，核心半径",
      "Promotion, medium radius": "密度提升，中密度半径",
      "Soil": "优质农地保护",
      "Vertical band, peak": "垂直农业带，峰值位置",
      "Vertical band, sigma": "垂直农业带，宽度 σ",
      "Vertical band, tail": "垂直农业带，尾部权重",
      "Vertical band, tail length": "垂直农业带，尾部长度",
      "Chance": "随机种子",
      "Horizontal farming starts": "水平农业起始年份",
      "Vertical farming starts": "垂直农业起始年份",
      "Commercial / public": "商业 / 公共",
      "Institutional": "公共机构",
      "Institutional, ring": "公共机构，环带",
      "Functions start": "功能起始年份"
    },
    tick: {
      "tight": "紧凑",
      "as run": "基准",
      "loose": "宽松",
      "off": "关闭",
      "hard": "强",
      "flat": "平缓",
      "greedy": "集中",
      "weak": "弱",
      "strong": "强",
      "node city": "节点城市",
      "ribbon city": "带状城市",
      "peak at the station": "站点峰值",
      "a far ring": "远距环带",
      "soil protected": "保护优质农地",
      "soil ignored": "忽略土壤",
      "quarter": "窄带",
      "wide": "宽带",
      "seed 7": "种子 7",
      "seed 2026": "种子 2026"
    },
    help: {
      "reach": "控制节点承载同等建设用地时，增长向外扩散的距离。",
      "veinA": "脉络场的基础影响值；脉络形态参考 Frei Otto 的网络实验。",
      "veinB": "脉络场的权重；设为 0 时关闭脉络影响。",
      "expo": "控制适宜度差异被放大的程度。",
      "adjA": "已有建成区附近继续建设的基础奖励。",
      "adjB": "数值越高，新增建设越倾向贴近已有建成区。",
      "wR": "控制主环线相对节点的吸引强度。",
      "sR": "控制主环线吸引力随距离衰减的速度。",
      "rcore": "中密度开发开始出现前的核心距离限制。",
      "rmed": "高密度开发开始出现前的距离限制。",
      "soil": "控制优质农地的保护强度；数值越低，对一级、二级农地的建设惩罚越强。",
      "vpk": "控制垂直农业相对建成区边缘的峰值位置。",
      "vsg": "控制垂直农业环带的宽度。",
      "vta": "控制垂直农业在主要环带之外继续延伸的程度。",
      "vtl": "控制垂直农业尾部延伸的距离。",
      "seed": "在规则和总量不变的情况下生成不同空间布局。",
      "farmH": "水平农业开始释放的年份。",
      "farmV": "垂直农业开始释放的年份。",
      "com": "建成区中的商业、办公与公共功能点。",
      "inst": "学校、医疗、市政与文化等公共机构点。",
      "instPeak": "公共机构点最集中的环带位置。",
      "progStart": "商业与公共机构功能开始出现的年份。"
    }
  };
  function leftZh(map, key) {
    return (map && map[key] !== undefined) ? map[key] : key;
  }
  function leftBi(en, zh) {
    return "<span class='bi'><span class='en'>" + en + "</span><span class='zh'>" + zh + "</span></span>";
  }

  function buildUI() {
    // sliders, grouped as the catalogue's axes
    var host = $("sliders"), groups = [], byGroup = {};
    S.PARAMS.forEach(function (p) {
      params[p.id] = p.def;
      if (p.hidden) return;
      if (!byGroup[p.group]) { byGroup[p.group] = []; groups.push(p.group); }
      byGroup[p.group].push(p);
    });
    var html = "";
    groups.forEach(function (g) {
      html += "<div class='grp'><h3>" + leftBi(g, leftZh(LEFT_ZH.group, g)) + "</h3>";
      byGroup[g].forEach(function (p) {
        html += "<div class='sl' data-id='" + p.id + "'><div class='lab'><span>" + leftBi(p.label, leftZh(LEFT_ZH.label, p.label)) +
          "</span><b id='v_" + p.id + "'>" + p.def + "</b></div>" +
          "<input type='range' id='s_" + p.id + "' min='" + p.min + "' max='" + p.max + "' step='" + p.step +
          "' value='" + p.def + "' title='" + ((p.help || "") + (LEFT_ZH.help[p.id] ? "\n" + LEFT_ZH.help[p.id] : "")).replace(/'/g, "") + "'>";
        if (p.ticks) {
          html += "<div class='ticks'>";
          p.ticks.forEach(function (t, i) {
            html += "<button data-set='" + p.id + "' data-val='" + t + "'>" + leftBi(p.tickNames[i], leftZh(LEFT_ZH.tick, p.tickNames[i])) + "</button>";
          });
          html += "</div>";
        }
        html += "</div>";
      });
      html += "</div>";
    });
    host.innerHTML = html;
    host.addEventListener("input", function (e) {
      if (e.target.type !== "range") return;
      var id = e.target.id.slice(2);
      params[id] = +e.target.value;
      $("v_" + id).textContent = e.target.value;
      markStale();
    });
    host.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-set]");
      if (!b) return;
      var id = b.dataset.set;
      params[id] = +b.dataset.val;
      $("s_" + id).value = b.dataset.val;
      $("v_" + id).textContent = b.dataset.val;
      markStale();
    });

    // layers: on/off and opacity, the rasters first, then what is drawn on top
    var lh = "";
    function rowHtml(L) {
      return "<div class='lay'><input type='checkbox' data-lay='" + L.id + "'" + (L.on ? " checked" : "") + ">" +
        "<span class='sw' style='background:" + L.sw + "'></span><span class='nm'>" + L.nm + "</span>" +
        "<input type='range' data-op='" + L.id + "' min='0' max='1' step='0.05' value='" + L.op + "'></div>";
    }
    LAYERS.forEach(function (L) { lh += rowHtml(L); });
    lh += "<div style='height:8px'></div>";
    VEC.forEach(function (L) { lh += rowHtml(L); });
    $("layers").innerHTML = lh;
    $("layers").addEventListener("input", function (e) {
      var all = LAYERS.concat(VEC), id = e.target.dataset.lay || e.target.dataset.op;
      if (!id) return;
      all.forEach(function (L) {
        if (L.id !== id) return;
        if (e.target.dataset.lay) L.on = e.target.checked; else L.op = +e.target.value;
      });
      render();
    });

    grainBlock();
    keyplan();
    $("nodeChips").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-node]");
      if (b) setView("node", b.dataset.node);
    });
    document.querySelectorAll("[data-scope]").forEach(function (b) {
      b.addEventListener("click", function () { setScope(b.dataset.scope); });
    });
    $("keyplan").addEventListener("click", keyplanClick);
    $("btnRun").addEventListener("click", runModel);
    $("btnPngFrame").addEventListener("click", function () { exportPng("frame"); });
    $("btnPngSheet").addEventListener("click", function () { exportPng("sheet"); });
    $("btnPlay").addEventListener("click", function () { setPlaying(!playing); });
    $("yslider").addEventListener("input", function (e) { setPlaying(false); setYear(+e.target.value); });
    $("speeds").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-speed]");
      if (!b) return;
      speed = +b.dataset.speed;
      $("speeds").querySelectorAll("button").forEach(function (o) { o.classList.toggle("on", o === b); });
      if (playing) { setPlaying(false); setPlaying(true); }
    });
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = b.dataset.view;
        setView(v, v === "zone" ? 5 : (v === "node" ? nodeId : "NW"));
      });
    });
    cv.addEventListener("click", function (e) {                // a node on the map is a way in as well
      var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      var dx = ((e.clientX - r.left) * dpr - tr.tx) / tr.s, dy = ((e.clientY - r.top) * dpr - tr.ty) / tr.s;
      var best = null, bd = 22 / tr.s * dpr;
      D.nodes.forEach(function (n) {
        var d = Math.hypot(n.x - dx, n.y - dy);
        if (d < bd) { bd = d; best = n; }
      });
      if (best) setView("node", best.id);
    });
    window.addEventListener("resize", function () { fit(); render(); grainPx(); });
    if (window.ResizeObserver) new ResizeObserver(function () { fit(); render(); grainPx(); }).observe($("stage"));
    stats();
  }

  function markStale() {
    $("barNote").textContent = "sliders moved · press Run";
    $("btnRun").classList.add("primary");
  }

  // ---------------------------------------------------------------- key plan
  // Not a diagram: the rail loop itself, drawn in the frame's own coordinates inside a dashed grey window,
  // with the piece you are looking at marked in brown. What it offers to click follows the mode - the four
  // quadrants, the six wedges, or the nodes as points.
  var KP_PAD = 60;                                           // a little air round the frame, in frame pixels
  function tPerim(x, y) {                                    // where a point sits on the frame's edge, 0..4
    if (y <= 1) return x / W;
    if (x >= W - 1) return 1 + y / H;
    if (y >= H - 1) return 2 + (W - x) / W;
    return 3 + (H - y) / H;
  }
  var CORNERS = [[0, 0], [W, 0], [W, H], [0, H]];
  function rayExit(deg) {                                    // where a zone's ray leaves the frame
    var a = deg * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), ax = D.apex[0], ay = D.apex[1], t = 1e18;
    if (dx > 1e-9) t = Math.min(t, (W - ax) / dx); else if (dx < -1e-9) t = Math.min(t, -ax / dx);
    if (dy > 1e-9) t = Math.min(t, (H - ay) / dy); else if (dy < -1e-9) t = Math.min(t, -ay / dy);
    var x = Math.max(0, Math.min(W, ax + dx * t)), y = Math.max(0, Math.min(H, ay + dy * t));
    return [x, y];
  }
  function wedgePath(i) {                                    // apex, out along one ray, round the frame, back
    var e0 = rayExit(D.zones[i].a0), e1 = rayExit(D.zones[i].a1);
    var t0 = tPerim(e0[0], e0[1]), t1 = tPerim(e1[0], e1[1]), d = "M" + D.apex[0] + "," + D.apex[1];
    d += " L" + e0[0].toFixed(0) + "," + e0[1].toFixed(0);
    var t = t0, guard = 0;
    while (guard++ < 6) {
      var nxt = Math.floor(t) + 1, c = CORNERS[nxt % 4];
      var span = (t1 - t + 4) % 4, step = (nxt - t + 4) % 4;
      if (step >= span || span === 0) break;
      d += " L" + c[0] + "," + c[1];
      t = nxt % 4;
    }
    return d + " L" + e1[0].toFixed(0) + "," + e1[1].toFixed(0) + " Z";
  }
  function keyplan() {
    var svg = $("keyplan"), u = W / 150, s = "", i;          // u: one key-plan pixel, in frame pixels
    svg.setAttribute("viewBox", (-KP_PAD) + " " + (-KP_PAD) + " " + (W + 2 * KP_PAD) + " " + (H + 2 * KP_PAD));
    if (viewMode === "quadrant") {
      [["NW", 0, 0], ["NE", W / 2, 0], ["SW", 0, H / 2], ["SE", W / 2, H / 2]].forEach(function (q) {
        var on = viewWhich === q[0];
        s += "<rect data-quad='" + q[0] + "' x='" + q[1] + "' y='" + q[2] + "' width='" + (W / 2) +
          "' height='" + (H / 2) + "' fill='" + (on ? "#e4d6c2" : "#f3f1ed") + "' stroke='#ffffff' stroke-width='" +
          (1.5 * u) + "'></rect>";
      });
    } else if (viewMode === "zone") {
      for (i = 0; i < D.zones.length; i++) {
        var z = D.zones[i], on = +viewWhich === z.id, mine = zonesNow().indexOf(z.id) >= 0;
        s += "<path data-zone='" + z.id + "' d='" + wedgePath(i) + "' fill='" +
          (on ? "#e4d6c2" : (mine ? "#f1ece4" : "#f3f1ed")) + "' stroke='#ffffff' stroke-width='" + (1.2 * u) + "'></path>";
      }
    }
    // the window, and the loop inside it
    s += "<rect x='0' y='0' width='" + W + "' height='" + H + "' fill='none' stroke='#c7c3bb' stroke-width='" +
      (1 * u) + "' stroke-dasharray='" + (4 * u) + "," + (4 * u) + "'></rect>";
    var d = "", jump = 200, started = false;
    for (i = 0; i + 1 < D.spine.length; i += 3) {
      var a = D.spine[i], b = D.spine[Math.min(i + 3, D.spine.length - 1)];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > jump) { started = false; continue; }
      d += (started ? " L" : " M") + a[0].toFixed(0) + "," + a[1].toFixed(0);
      started = true;
    }
    s += "<path d='" + d + "' fill='none' stroke='#9A4F23' stroke-width='" + (1.7 * u) +
      "' stroke-linejoin='round' stroke-linecap='round' pointer-events='none'></path>";
    if (viewMode === "node") {
      D.nodes.forEach(function (n) {
        var on = viewWhich === n.id, mine = inWindow.indexOf(n) >= 0;
        s += "<circle data-node='" + n.id + "' cx='" + n.x + "' cy='" + n.y + "' r='" + ((on ? 5.5 : 3.6) * u) +
          "' fill='" + (on ? "#9A4F23" : (mine ? "#ffffff" : "#f4f2ee")) + "' stroke='" +
          (on ? "#9A4F23" : (mine ? "#4b4842" : "#bdb9b1")) + "' stroke-width='" + (1.1 * u) + "'></circle>";
      });
    }
    // where you are
    s += "<rect x='" + view.x.toFixed(0) + "' y='" + view.y.toFixed(0) + "' width='" + view.w.toFixed(0) +
      "' height='" + view.h.toFixed(0) + "' fill='none' stroke='#9A4F23' stroke-width='" + (1.6 * u) +
      "' stroke-dasharray='" + (5 * u) + "," + (4 * u) + "' pointer-events='none'></rect>";
    svg.innerHTML = s;
  }
  function keyplanClick(e) {
    var t = e.target, z = t.getAttribute && t.getAttribute("data-zone"),
      q = t.getAttribute && t.getAttribute("data-quad"), n = t.getAttribute && t.getAttribute("data-node");
    if (z) setView("zone", +z);
    else if (q) setView("quadrant", q);
    else if (n) setView("node", n);
  }

  function nodeChips() {
    inWindow = D.nodes.filter(function (n) {
      return n.x >= SIMX && n.x <= SIMX + SIMW * STEP && n.y >= SIMY && n.y <= SIMY + SIMH * STEP;
    });
    $("nodeChips").innerHTML = inWindow.map(function (n) {
      return "<button class='btn' data-node='" + n.id + "'>" + n.id + "</button>";
    }).join("");
  }
  function nodeBox(id) {
    var n = D.nodes.filter(function (q) { return q.id === id; })[0] || D.nodes[0];
    var w = NODE_KM[nodeLevel] * 1000 / PX;
    return { x: n.x - w / 2, y: n.y - w / 2, w: w, h: w };
  }

  function zoneBounds(z) {
    var mz = masks.m_zone, minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, r, c;
    for (r = 0; r < mz.h; r++) for (c = 0; c < mz.w; c++) {
      if (mz.a[r * mz.w + c] !== z) continue;
      if (c < minx) minx = c; if (c > maxx) maxx = c;
      if (r < miny) miny = r; if (r > maxy) maxy = r;
    }
    var pad = 6;
    return { x: Math.max(0, (minx - pad) * STEP), y: Math.max(0, (miny - pad) * STEP),
             w: Math.min(W, (maxx + pad) * STEP) - Math.max(0, (minx - pad) * STEP),
             h: Math.min(H, (maxy + pad) * STEP) - Math.max(0, (miny - pad) * STEP) };
  }

  function highlight(mode, which) {
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.classList.toggle("on", b.dataset.view === mode);
    });
    document.querySelectorAll("#nodeChips button").forEach(function (b) {
      b.classList.toggle("on", mode === "node" && b.dataset.node === which);
    });
  }

  function setView(mode, which) {
    var lastMode = viewMode;
    viewMode = mode; viewWhich = which;
    if (mode === "loop") { view = LOOPVIEW; viewNote = "the whole loop · " +
      (LOOPVIEW.w * PX / 1000).toFixed(1) + " × " + (LOOPVIEW.h * PX / 1000).toFixed(1) + " km"; }
    else if (mode === "quadrant") {
      if (which === "NW") { var q = D.views.quadrant; view = { x: q[0], y: q[1], w: q[2], h: q[3] };
        viewNote = "north-west · Zones 05 + 06"; }
      else { var r = D.views.quadrants[which]; view = { x: r[0], y: r[1], w: r[2], h: r[3] };
        viewNote = which + " quadrant" + (scope === "loop" ? "" : " · outside the model's window"); }
    } else if (mode === "node") {
      nodeLevel = (which === nodeId && lastMode === "node") ? (nodeLevel + 1) % NODE_KM.length : 0;
      nodeId = which;
      view = nodeBox(nodeId);
      var far = inWindow.filter(function (q) { return q.id === nodeId; }).length === 0;
      viewNote = nodeId + " · " + NODE_KM[nodeLevel] + " km across" +
        (far ? " · outside the model's window" : " · click again to go closer");
    } else { view = zoneBounds(+which); viewNote = "Zone 0" + which + " · " + D.zones[+which - 1].name; }
    $("viewNote").textContent = viewNote;
    highlight(mode, which);
    keyplan();
    setBox();
    fit(); render(); stats();
    jumpCard();
  }

  // ---------------------------------------------------------------- Loop City v8: down to the next scale
  /* The combined app -- the slime mould and the growth simulator on one clock -- exists for one piece of
     the loop: the slime mould's sheet, which is this frame's north-west quadrant, zones 05 and 06. So the
     card offers the jump for that quadrant, for either of its zones, and for any node inside it, and for
     everything else it says plainly that the next scale has not been built there yet, rather than opening
     an app that would be empty.

     What goes down with you: which piece you chose, as a box in British National Grid metres (the two
     apps' pixels differ by 0.012 m, which over the sheet is 30 m, so a pixel box would land 30 m out), and
     the catalogue's settings as they stand on the sliders, so the quadrant grows with the same ones. */
  var COMBINED = { e0: 452754.1, e1: 540739.7, n0: 166381.6, n1: 246493.2 };   // the slime mould's sheet
  var QNAME = { NW: "North-west quadrant", NE: "North-east quadrant", SW: "South-west quadrant", SE: "South-east quadrant" };
  function toBNG(x, y) { return [D.cornerBNG[0] + x * PX, D.cornerBNG[1] - y * PX]; }
  function boxBNG(b) {
    var a = toBNG(b.x, b.y + b.h), c = toBNG(b.x + b.w, b.y);
    return { E0: Math.max(COMBINED.e0, a[0]), N0: Math.max(COMBINED.n0, a[1]),
             E1: Math.min(COMBINED.e1, c[0]), N1: Math.min(COMBINED.n1, c[1]) };
  }
  function insideCombined(x, y) {
    var p = toBNG(x, y);
    return p[0] > COMBINED.e0 && p[0] < COMBINED.e1 && p[1] > COMBINED.n0 && p[1] < COMBINED.n1;
  }
  function jumpTarget() {
    if (viewMode === "quadrant") {
      if (viewWhich === "NW") return { ok: true, title: QNAME.NW, label: "North-west · Zones 05 + 06", focus: null };
      return { ok: false, title: QNAME[viewWhich] || "This quadrant" };
    }
    if (viewMode === "zone") {
      var z = +viewWhich, nm = "Zone 0" + z + " · " + D.zones[z - 1].name;
      if (z === 5 || z === 6) return { ok: true, title: nm, label: "Zone 0" + z, focus: boxBNG(view) };
      return { ok: false, title: nm };
    }
    if (viewMode === "node") {
      var n = D.nodes.filter(function (q) { return q.id === nodeId; })[0];
      var t = "Node " + nodeId + " · " + NODE_KM[nodeLevel] + " km across";
      if (n && insideCombined(n.x, n.y))
        return { ok: true, title: t, label: nodeId + " · " + NODE_KM[nodeLevel] + " km", focus: boxBNG(view) };
      return { ok: false, title: t };
    }
    return null;
  }
  function jumpCard() {
    var el = $("jump"), t = jumpTarget();
    if (window.LoopCity) LoopCity.label(viewTitle());
    if (!t) { el.className = ""; el.innerHTML = ""; return; }
    if (t.ok) {
      el.className = "show";
      el.innerHTML = "<div class='jk'>Next scale</div><div class='jt'>" + t.title + "</div>" +
        "<div class='js'>The slime mould and the growth simulator on one clock, and the cells that come " +
        "out of them.</div>" +
        "<button class='btn primary' id='btnJump'>Open in the combined app &rarr;</button>" +
        "<div class='jn'>Takes the catalogue settings on the left with it" +
        (t.focus ? ", and opens on this piece." : ".") + "</div>";
      $("btnJump").addEventListener("click", function () { jumpDown(t); });
    } else {
      el.className = "show off";
      el.innerHTML = "<div class='jk'>Next scale</div><div class='jt'>" + t.title + "</div>" +
        "<div class='js'>Not built here yet. The slime mould has only been run on the north-west " +
        "quadrant, zones 05 and 06, so that is the only place the combined app can open.</div>" +
        "<button class='lnk' id='btnGoNW'>Go to the north-west quadrant &rarr;</button>";
      $("btnGoNW").addEventListener("click", function () { setView("quadrant", "NW"); });
    }
  }
  function jumpDown(t) {
    var ctx = { from: "loop", quad: "NW", zones: [5, 6], label: t.label, focus: t.focus,
                params: JSON.parse(JSON.stringify(params)) };
    var how = window.LoopCity ? LoopCity.jump("quadrant", ctx, "../combined_v10.html", true) : null;
    if (!how) $("jump").querySelector(".jn").innerHTML =
      "<span style='color:#9a5f4a'>The browser blocked the new tab. Allow pop-ups for this page, or open " +
      "<b>Loop City.html</b>, which keeps the full workflow in one window.</span>";
  }

  // ---------------------------------------------------------------- drawing
  var tr = { s: 1, tx: 0, ty: 0 };
  function fit() {
    var r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    var avail = Math.max(60, cv.height - 58 * dpr);         // the play bar lies over the foot of the map
    tr.s = Math.max(1e-6, Math.min(cv.width / view.w, avail / view.h) * 0.98);
    tr.tx = cv.width / 2 - (view.x + view.w / 2) * tr.s;
    tr.ty = avail / 2 - (view.y + view.h / 2) * tr.s;
  }
  function layerOn(id) {
    var all = LAYERS.concat(VEC);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].on ? all[i].op : 0;
    return 0;
  }
  // The picture changes in a few hundred thousand places over 75 years, so the changes are indexed once and a
  // year step only repaints those cells. Scrubbing back replays from empty, which is still only one pass.
  var EV = null, growthImg = null, RGBA = null;
  function indexEvents() {
    var N = SIMW * SIMH, i, k, y, c, prev, cand = new Int32Array(5), n, tmp = [];
    for (y = S.Y0; y <= S.Y1; y++) tmp.push({ i: [], c: [] });
    for (i = 0; i < N; i++) {
      n = 0;
      if (out.yB[i]) cand[n++] = out.yB[i];
      if (out.yM[i]) cand[n++] = out.yM[i];
      if (out.yH[i]) cand[n++] = out.yH[i];
      if (out.yFarm[i]) cand[n++] = out.yFarm[i];
      if (out.yP[i]) cand[n++] = out.yP[i];
      if (!n) continue;
      for (k = 1; k < n; k++) { var v = cand[k], j = k - 1; while (j >= 0 && cand[j] > v) { cand[j + 1] = cand[j]; j--; } cand[j + 1] = v; }
      prev = 0;
      for (k = 0; k < n; k++) {
        y = cand[k];
        if (k && y === cand[k - 1]) continue;
        c = S.classAt(out, i, y);
        if (c === prev) continue;
        tmp[y - S.Y0].i.push(i); tmp[y - S.Y0].c.push(c);
        prev = c;
      }
    }
    EV = tmp.map(function (t) { return { i: Int32Array.from(t.i), c: Uint8Array.from(t.c) }; });
    curCls = new Uint8Array(N);
    growthImg = growthCtx.createImageData(SIMW, SIMH);
    RGBA = {};
    Object.keys(CLASS_COLOUR).forEach(function (cl) {
      var hx = CLASS_COLOUR[cl];
      RGBA[cl] = [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)];
    });
    growthYear = S.Y0 - 1;
  }
  function applyYear(y) {
    var e = EV[y - S.Y0], d = growthImg.data, k, i, col;
    for (k = 0; k < e.i.length; k++) {
      i = e.i[k]; col = RGBA[e.c[k]];
      if (inBox(i)) { VC[curCls[i]]--; VC[e.c[k]]++; }       // the view's count, kept as it is painted
      curCls[i] = e.c[k];
      if (!col) { d[i * 4 + 3] = 0; continue; }
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    }
  }
  function paintGrowth(y) {
    if (!out || !EV || growthYear === y) return;
    var start = growthYear + 1;
    if (y < growthYear) { growthImg.data.fill(0); curCls.fill(0); zeroVC(); start = S.Y0; }
    for (var q = start; q <= y; q++) applyYear(q);
    growthCtx.putImageData(growthImg, 0, 0);
    growthYear = y;
  }
  var SK = 1, SKN = 1;                                       // screen 1, export the sheet's width over 1000
  function line(pts, col, wpx, dash) {
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = wpx * SK / tr.s; ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (dash) ctx.setLineDash(dash.map(function (v) { return v * SK / tr.s; }));
    ctx.beginPath();
    var started = false, i, p, q;
    for (i = 0; i + 1 < pts.length; i++) {
      p = pts[i]; q = pts[i + 1];
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 200) { started = false; continue; }   // a jump in the ring
      if (!started) { ctx.moveTo(p[0], p[1]); started = true; }
      ctx.lineTo(q[0], q[1]);
    }
    ctx.stroke();
    ctx.restore();
  }
  function render() {
    if (!cv.width) fit();
    SK = exporting ? Math.max(1, cv.width / 1000) : 1;
    SKN = exporting ? 1 + (SK - 1) * 0.5 : 1;                // symbols and names grow more slowly than the sheet
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(tr.s, 0, 0, tr.s, tr.tx, tr.ty);
    ctx.imageSmoothingEnabled = tr.s < 1;

    LAYERS.forEach(function (L) {
      var a = layerOn(L.id);
      if (!a || !img[L.id]) return;
      ctx.globalAlpha = a;
      ctx.drawImage(img[L.id], 0, 0, W, H);
    });
    ctx.globalAlpha = 1;

    var ga = layerOn("growth");
    if (ga && out) {
      paintGrowth(year);
      ctx.globalAlpha = ga;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(growthCv, SIMX, SIMY, SIMW * STEP, SIMH * STEP);
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = tr.s < 1;
    }

    var za = layerOn("zones");
    if (za) {
      ctx.globalAlpha = za;
      D.rays.forEach(function (r) { line([[r.x0, r.y0], [r.x1, r.y1]], P.zoneLine, 1.2, [10, 8]); });
      ctx.globalAlpha = 1;
    }
    var zn = layerOn("zoneNames");
    if (zn) {
      ctx.save();
      ctx.globalAlpha = zn;
      ctx.fillStyle = "#b6b2aa"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = (34 * SK / tr.s) + "px 'DM Sans', sans-serif";
      D.zones.forEach(function (z) {
        ctx.fillText("0" + z.id + "  " + z.name, Math.max(W * 0.08, Math.min(W * 0.92, z.lx)),
          Math.max(H * 0.04, Math.min(H * 0.96, z.ly)));
      });
      ctx.restore();
    }
    var sa = layerOn("spine");
    if (sa) { ctx.globalAlpha = sa; line(D.spine, P.spineOver, 3.2, null); ctx.globalAlpha = 1; }

    var na = layerOn("nodes"), nn = layerOn("nodeNames");
    if (na || nn) {
      ctx.save();
      ctx.globalAlpha = na || 1;
      D.nodes.forEach(function (n) {
        var rr = (n.t === "P" ? 9 : 6) * SKN / tr.s;
        if (na) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, rr, 0, 6.2832);
          ctx.fillStyle = n.t === "A" ? "#b02222" : (n.t === "P" ? "#ffffff" : "#f0e3c4");
          ctx.fill();
          ctx.lineWidth = 2.4 * SKN / tr.s; ctx.strokeStyle = P.nodeInk; ctx.stroke();
        }
        if (nn) {
          ctx.globalAlpha = nn;
          // Loop City v9: names sized to the view -- small over the whole loop, larger as you go in
          var nfs = viewMode === "loop" ? 15 : (viewMode === "node" ? 24 : 19);
          ctx.font = "600 " + (nfs * SKN / tr.s) + "px 'DM Sans', sans-serif";
          ctx.textAlign = "left"; ctx.textBaseline = "bottom";
          ctx.lineWidth = 5 * (nfs / 26) * SKN / tr.s; ctx.strokeStyle = "rgba(255,255,255,.92)";
          ctx.strokeText(n.id, n.x + rr * 1.6, n.y - rr * 0.6);
          ctx.fillStyle = "#33302c"; ctx.fillText(n.id, n.x + rr * 1.6, n.y - rr * 0.6);
          ctx.globalAlpha = na || 1;
        }
      });
      ctx.restore();
    }
    var ta = layerOn("townNames");
    if (ta) {
      ctx.save();
      ctx.globalAlpha = ta;
      ctx.font = (20 * SKN / tr.s) + "px 'DM Sans', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      D.towns.filter(function (t) { return t.pop > 20000; }).forEach(function (t) {
        ctx.lineWidth = 4 * SKN / tr.s; ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.strokeText(t.n, t.x, t.y);
        ctx.fillStyle = "#8f8b84"; ctx.fillText(t.n, t.x, t.y);
      });
      ctx.restore();
    }

    if (scope !== "loop" && viewMode !== "loop" &&
        (view.x !== SIMX || view.y !== SIMY || view.w !== SIMW * STEP)) {
      ctx.save();
      ctx.strokeStyle = "rgba(154,79,35,.55)"; ctx.lineWidth = 2 * SK / tr.s;
      ctx.setLineDash([9 * SK / tr.s, 7 * SK / tr.s]);
      ctx.strokeRect(SIMX, SIMY, SIMW * STEP, SIMH * STEP);
      ctx.restore();
    }

    // Everything outside the chosen piece steps back. In an export the frame is the crop, so only a zone
    // needs it: its shape is a wedge, and the figures beside it are the wedge's.
    var zd = viewMode === "zone" ? D.zones[viewWhich - 1] : null;
    if (!exporting || zd) {
      var ap = D.apex, R = Math.hypot(W, H) * 1.2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-W, -H, W * 3, H * 3);
      if (zd) {
        ctx.moveTo(ap[0], ap[1]);
        ctx.arc(ap[0], ap[1], R, (zd.a0 - 90) * Math.PI / 180, (zd.a1 - 90) * Math.PI / 180);
        ctx.closePath();
      } else ctx.rect(view.x, view.y, view.w, view.h);
      ctx.fillStyle = "rgba(255,255,255,.80)";
      ctx.fill("evenodd");
      ctx.strokeStyle = "#e2ded6"; ctx.lineWidth = 1 / tr.s;
      if (!zd && !exporting) ctx.strokeRect(view.x, view.y, view.w, view.h);
      ctx.restore();
    }
    scaleBar();
  }

  // A bar of a round number of metres, drawn straight on the canvas so the exported picture carries it too.
  var NICE = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  function barMetres(mPerPx, want) {
    var m = NICE[0], i;
    for (i = 0; i < NICE.length; i++) if (NICE[i] / mPerPx <= want) m = NICE[i];
    return m;
  }
  // The divisions: the 1-2-5 ladder below the bar's own length, down to a tenth of it. A 20 km bar is
  // divided at 2, 5 and 10; a 10 km bar at 1, 2 and 5; a 5 km bar at 500 m, 1 and 2.
  function barTicks(T) {
    var out = [], m = [1, 2, 5], e, i, v;
    for (e = 0; e <= 6; e++) for (i = 0; i < 3; i++) {
      v = m[i] * Math.pow(10, e) * 10;
      if (v >= T / 10 - 1e-6 && v < T - 1e-6) out.push(v);
    }
    out.push(T);
    return out;
  }
  function barLabel(v, T) {
    if (T >= 1000) return v >= 1000 ? String(v / 1000) : v + " m";
    return String(v);
  }
  // x, y is the left end of the bar and the line it stands on; the figures sit under it
  function drawBar(g, x, y, T, mPerPx, u, halo) {
    var len = T / mPerPx, ticks = barTicks(T), fs = Math.max(9, 8.5 * u), h = Math.max(4, 3.6 * u), i, v, px;
    g.save();
    g.font = "600 " + fs.toFixed(1) + "px 'DM Sans', sans-serif";
    g.textAlign = "center"; g.textBaseline = "top";
    var unit = T >= 1000 ? " km" : " m";
    if (halo) {                                              // a white edge, not a box: it reads over fabric
      g.strokeStyle = "rgba(255,255,255,.92)";
      g.lineWidth = Math.max(2.5, 2.6 * u);
      g.lineJoin = "round";
      g.strokeRect(x, y - h, len, h);
    }
    g.lineWidth = Math.max(1, 0.9 * u);
    g.strokeStyle = "#3d3a35";
    var prev = 0, dark = true;                               // the alternating body
    for (i = 0; i < ticks.length; i++) {
      v = ticks[i];
      g.fillStyle = dark ? "#3d3a35" : "#ffffff";
      g.fillRect(x + prev / mPerPx, y - h, (v - prev) / mPerPx, h);
      g.strokeRect(x + prev / mPerPx, y - h, (v - prev) / mPerPx, h);
      prev = v; dark = !dark;
    }
    var right = x + g.measureText("0").width / 2 + 3 * u, txt, half, ty = y + 2.5 * u;
    g.lineWidth = Math.max(2.5, 2.8 * u);
    g.strokeStyle = "rgba(255,255,255,.92)";
    g.lineJoin = "round";
    function figure(t, px) {                                 // haloed, then inked
      if (halo) g.strokeText(t, px, ty);
      g.fillStyle = "#3d3a35";
      g.fillText(t, px, ty);
    }
    figure("0", x);
    for (i = 0; i < ticks.length; i++) {
      v = ticks[i]; px = x + v / mPerPx;
      txt = barLabel(v, T) + (i === ticks.length - 1 ? unit : "");
      half = g.measureText(txt).width / 2;
      if (px - half < right && i < ticks.length - 1) continue;
      figure(txt, px);
      right = px + half + 4 * u;
    }
    g.restore();
    return len;
  }
  function scaleBar() {
    var k = Math.max(1, cv.width / 1000);
    var mPerPx = PX / tr.s, m = barMetres(mPerPx, Math.min(cv.width * 0.26, 230 * k));
    var len = m / mPerPx, x1 = cv.width - 34 * k - len;
    var y = (exportKind === "sheet" ? mapH : cv.height) - (exporting ? 34 * k : 74);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBar(ctx, x1, y, m, mPerPx, k, true);
    if (exporting) {                                         // the frame says its own year, quietly
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = "#231F20";
      ctx.font = "700 " + (13 * k).toFixed(1) + "px 'DM Sans', sans-serif";
      ctx.fillText(String(year), 20 * k, 18 * k);
      ctx.fillStyle = "#8c8880";
      ctx.font = (5.5 * k).toFixed(1) + "px 'DM Sans', sans-serif";
      ctx.fillText(viewTitle(), 20 * k, 18 * k + 16 * k);
    }
    ctx.restore();
  }
  // the strip under the map: the year, what it holds, the legend, the bar. No rules, no frame.
  function drawStrip(g, mw, mh, strip) {
    var u = mw / 1000, x = 30 * u, top = mh + 24 * u, f = FIG || { rows: [], people: 0, homes: 0, have: false };
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#ffffff";
    g.fillRect(0, mh, mw, strip);
    g.textAlign = "left"; g.textBaseline = "top";
    g.fillStyle = "#231F20";
    g.font = "700 " + (33 * u).toFixed(1) + "px 'DM Sans', sans-serif";
    g.fillText(String(year), x, top);
    g.fillStyle = "#8c8880";
    g.font = (9.5 * u).toFixed(1) + "px 'DM Sans', sans-serif";
    g.fillText(viewTitle(), x, top + 39 * u);
    g.fillText("one grain " + world.C + " x " + world.C + " m", x, top + 52 * u);

    var x2 = 250 * u;                                        // what the view holds
    g.fillStyle = "#8c8880";
    g.font = "600 " + (8 * u).toFixed(1) + "px 'DM Sans', sans-serif";
    g.fillText("PEOPLE", x2, top + 1 * u);
    g.fillStyle = "#231F20";
    g.font = "700 " + (23 * u).toFixed(1) + "px 'DM Sans', sans-serif";
    g.fillText(f.have ? fmt(f.people) : "—", x2, top + 12 * u);
    g.fillStyle = "#8c8880";
    g.font = "600 " + (8 * u).toFixed(1) + "px 'DM Sans', sans-serif";
    g.fillText("HOMES", x2, top + 41 * u);
    g.fillStyle = "#231F20";
    g.font = "700 " + (15 * u).toFixed(1) + "px 'DM Sans', sans-serif";
    g.fillText(f.have ? fmt(f.homes) : "—", x2, top + 52 * u);

    // housing in one column, farming in the next, anything else after it
    var groups = [[], [], []], i, r, cx, cy, gi, ri;
    for (i = 0; i < f.rows.length; i++) {
      r = f.rows[i];
      groups[r.nm.indexOf("farming") >= 0 ? 1 : (i < 3 ? 0 : 2)].push(r);
    }
    var col = [470 * u, 700 * u, 930 * u], cw = 200 * u, pitch = 18 * u;
    for (gi = 0; gi < groups.length; gi++) {
      for (ri = 0; ri < groups[gi].length; ri++) {
        r = groups[gi][ri]; cx = col[gi]; cy = top + ri * pitch;
        g.fillStyle = r.sw;
        g.fillRect(cx, cy + 2 * u, 10 * u, 10 * u);
        g.fillStyle = "#5d5a55";
        g.font = (9.5 * u).toFixed(1) + "px 'DM Sans', sans-serif";
        g.fillText(r.nm, cx + 15 * u, cy);
        g.textAlign = "right";
        g.fillStyle = "#231F20";
        g.font = "600 " + (9.5 * u).toFixed(1) + "px 'DM Sans', sans-serif";
        g.fillText(r.val, cx + cw, cy);
        g.textAlign = "left";
      }
    }
    g.restore();
  }

  // ---------------------------------------------------------------- the run
  function runModel() {
    if (running) return;
    running = true;
    growthYear = -1; EV = null;
    $("btnRun").classList.remove("primary");
    $("status").style.display = "block";
    $("status").textContent = "seeding…";
    setTimeout(function () {
      sim = S.run(world, params);
      out = sim.out;
      var t0 = Date.now();
      (function chunk() {
        var more = true, tick = Date.now();                  // as many years as fit in a tick: a hidden page
        while (more && Date.now() - tick < 350) more = sim.step();   // throttles timers, not the work
        var done = ((out.pass - 1) * 76 + (out.year - S.Y0)) / 152;
        $("status").textContent = (out.pass === 1 ? "growing · " : "farming · ") + out.year +
          "   " + Math.round(done * 100) + "%";
        $("hudYear").textContent = out.year;
        if (more) { setTimeout(chunk, 0); return; }
        indexEvents();
        setBox();
        running = false;
        $("status").style.display = "none";
        $("barNote").textContent = "2025 to 2100 · " + SCOPES[scope].nm + " in " +
          ((Date.now() - t0) / 1000).toFixed(1) + " s";
        setYear(S.Y0);
        stats();
        setPlaying(true);                                    // the run is a film, not a final picture
      })();
    }, 30);
  }

  function setYear(y) {
    year = Math.max(S.Y0, Math.min(S.Y1, y));
    $("yslider").value = year;
    $("hudYear").textContent = year;
    $("hudPhase").textContent = !out ? "ready" : (year < 2035 ? "primaries seeding" :
      year < 2050 ? "secondaries" : year < 2068 ? "along the spine" : "densifying");
    stats();
    render();
  }
  function setPlaying(p) {
    if (p && !out) return;
    if (p && year >= S.Y1) setYear(S.Y0);                    // at the end, play again from the start
    playing = p;
    $("btnPlay").textContent = p ? "❚❚" : (year >= S.Y1 ? "↺" : "▶");
    $("btnPlay").title = p ? "pause" : (year >= S.Y1 ? "play it again from 2025" : "play the years");
    if (timer) { clearInterval(timer); timer = null; }
    if (p) timer = setInterval(function () {
      if (year >= S.Y1) { setPlaying(false); return; }
      setYear(year + 1);
    }, speed);
  }

  // One table, so a colour, a name and a number always stand together. A use with no land is not listed:
  // commercial and institutional are off, and the day they are turned on their row comes back with them.
  var LAND = [
    { k: "H", sw: P.high, nm: "Mixed use high rise", note: "25,000 a km²", always: true },
    { k: "M", sw: P.mid, nm: "Mixed use mid rise", note: "9,750", always: true },
    { k: "L", sw: P.low, nm: "Residential low rise", note: "4,000", always: true },
    { k: "field", sw: P.farmH, nm: "Horizontal farming", always: true },
    { k: "vfarm", sw: P.farmV, nm: "Vertical farming", always: true },
    { k: "com", sw: CLASS_COLOUR[K.COM], nm: "Commercial and public" },
    { k: "inst", sw: CLASS_COLOUR[K.INST], nm: "Institutional" }
  ];
  function row(sw, nm, note, val) {
    return "<div class='lrow'><span class='sw" + (sw ? "" : " ghost") + "'" +
      (sw ? " style='background:" + sw + "'" : "") + "></span><span class='lnm'>" + nm +
      (note ? " <i>" + note + "</i>" : "") + "</span><span class='lv'>" + val + "</span></div>";
  }
  // One grain is one cell of the model: what it covers, and what it holds at each density.
  var PPH = 2.30;                                            // people a home, the release's figure
  function grainBlock() {
    var m = world.C, m2 = m * m, ha = m2 / 1e4, km2c = world.cellKm2, h = "";
    h += "<div class='gsum'><span class='gbox'></span><span><b>" + m + " × " + m + " m</b> · " +
      fmt(m2) + " m² · " + (Math.round(ha * 100) / 100) + " ha<span class='sub'>one cell, the smallest " +
      "thing the model decides</span></span></div>";
    [[K.HIGH, P.high, "High rise"], [K.MED, P.mid, "Mid rise"], [K.LOW, P.low, "Low rise"]].forEach(function (r) {
      var people = S.PPK[r[0]] * km2c;
      h += "<div class='lrow'><span class='sw' style='background:" + r[1] + "'></span>" +
        "<span class='lnm'>" + r[2] + "</span><span class='lv'>" + (Math.round(people * 10) / 10) +
        " people</span><span class='lv2'>" + (Math.round(people / PPH * 10) / 10) + " homes</span></div>";
    });
    h += "<span class='sub' id='grainCount'></span><span class='sub' id='grainPx'></span>";
    $("grain").innerHTML = h;
  }
  // the grain never changes; what changes with the view is how much of the screen it gets
  function grainPx() {
    var el = $("grainPx");
    if (!el) return;
    var dpr = window.devicePixelRatio || 1, px = STEP * tr.s / dpr, km = view.w * PX / 1000;
    var side = Math.max(2, Math.min(26, px));
    el.className = "gpx";
    el.innerHTML = "<span class='px' style='width:" + side.toFixed(1) + "px;height:" + side.toFixed(1) +
      "px'></span><span><b>1 grain = " + (px < 1 ? px.toFixed(2) : px.toFixed(1)) + " px</b> · frame " +
      (km < 10 ? (Math.round(km * 10) / 10) : Math.round(km)) + " km wide</span>";
  }
  function grainCount(s) {
    var el = $("grainCount");
    if (!el) return;
    el.textContent = s ? ("at " + year + " · " + fmt((s.H || 0) + (s.M || 0) + (s.L || 0)) +
      " grains built, " + fmt((s.field || 0) + (s.vfarm || 0)) + " farmed") : "nothing built yet";
  }

  // What the view holds. The box is the cells the view covers - the whole window for the loop, the wedge for
  // a zone, the rectangle for a quadrant or a node - and the counts are kept up to date by the painting, so a
  // year costs what its own changes cost. Only a change of view asks for the whole count again.
  function zeroVC() { for (var i = 0; i < 8; i++) VC[i] = 0; }
  function inBox(i) {
    var r = (i / SIMW) | 0, c = i - r * SIMW;
    if (r < BOX.r0 || r > BOX.r1 || c < BOX.c0 || c > BOX.c1) return false;
    return !BOX.zone || simZone[i] === BOX.zone;
  }
  function setBox() {
    BOX.r0 = Math.max(0, Math.floor((view.y - SIMY) / STEP));
    BOX.r1 = Math.min(SIMH - 1, Math.ceil((view.y + view.h - SIMY) / STEP));
    BOX.c0 = Math.max(0, Math.floor((view.x - SIMX) / STEP));
    BOX.c1 = Math.min(SIMW - 1, Math.ceil((view.x + view.w - SIMX) / STEP));
    BOX.zone = viewMode === "zone" ? +viewWhich : 0;
    recount();
  }
  function recount() {
    zeroVC();
    if (!curCls) return;
    var r, c, q, v;
    for (r = BOX.r0; r <= BOX.r1; r++) {
      q = r * SIMW + BOX.c0;
      for (c = BOX.c0; c <= BOX.c1; c++, q++) {
        v = curCls[q];
        if (!v) continue;
        if (BOX.zone && simZone[q] !== BOX.zone) continue;
        VC[v]++;
      }
    }
  }
  function countView() {
    if (!curCls || !EV) { zeroVC(); return false; }
    paintGrowth(year);                                       // which also brings the counts to this year
    return true;
  }
  function plannedFor() {                                    // the release's own figure for what is selected
    var z, sum = 0;
    if (viewMode === "zone") {
      z = ZONEDEF[+viewWhich];
      return z ? { n: z.pop, what: "planned in zone 0" + viewWhich } : null;
    }
    if (viewMode === "node") {
      var a = null;
      Object.keys(ZONEDEF).forEach(function (k) {
        if (ZONEDEF[k].P[viewWhich]) a = ZONEDEF[k].P[viewWhich];
      });
      if (!a) return { n: 0, what: "no land at " + viewWhich };
      return { n: a[0] * S.PPK[3] + a[1] * S.PPK[2] + a[2] * S.PPK[1], what: "planned at " + viewWhich + " alone" };
    }
    if (viewMode === "loop") {
      zonesNow().forEach(function (k) { sum += ZONEDEF[k].pop; });
      return { n: sum, what: scope === "loop" ? "planned by 2100" : "planned in zones 05 + 06" };
    }
    return null;
  }

  function stats() {
    var s = null, i, html = "", have = out && out.stats.length > 0;
    if (have) for (i = 0; i < out.stats.length; i++) if (out.stats[i].y <= year) s = out.stats[i];
    var cellKm2 = out ? out.cellKm2 : 0, viewed = countView(), cells = {};
    if (viewed) {                                            // the view's own count
      cells = { H: VC[K.HIGH], M: VC[K.MED], L: VC[K.LOW], field: VC[K.FIELD], vfarm: VC[K.VFARM],
                com: VC[K.COM], inst: VC[K.INST] };
    } else if (s) {                                          // mid-run, before the years are indexed
      cells = { H: s.H, M: s.M, L: s.L, field: s.field, vfarm: s.vfarm, com: s.com, inst: s.inst };
    }
    var people = (cells.L || 0) * S.PPK[1] + (cells.M || 0) * S.PPK[2] + (cells.H || 0) * S.PPK[3];
    people *= cellKm2;
    $("pop").textContent = have ? fmt(people) : "0";
    $("popWhat").textContent = "Population, " + viewNote.split(" · ")[0];
    var pl = plannedFor();
    $("popOf").textContent = pl ? "of " + (pl.n >= 1e6 ? (Math.round(pl.n / 1e5) / 10) + " M" : fmt(pl.n)) +
      " " + pl.what : "in this window";
    LAND.forEach(function (r) {
      var n = cells[r.k] || 0;
      if (!r.always && !n) return;
      html += row(r.sw, r.nm, r.note, have ? km2(n * cellKm2) + " km²" : "—");
    });
    html += row(null, "Homes", PPH + " a home", have ? fmt(people / PPH) : "—");
    FIG = { have: have, people: people, homes: people / PPH, cells: cells, cellKm2: cellKm2,
            rows: LAND.filter(function (r) { return r.always || cells[r.k]; }).map(function (r) {
              return { sw: r.sw, nm: r.nm, note: r.note, val: km2((cells[r.k] || 0) * cellKm2) + " km²" };
            }) };
    $("stats").innerHTML = html;
    grainCount(have ? { H: cells.H, M: cells.M, L: cells.L, field: cells.field, vfarm: cells.vfarm } : null);
    grainPx();
  }

  // ---------------------------------------------------------------- the handover to the slime mould
  // The mould reads ground as masks on the shared 70 m grid: 2,143 x 1,757 cells cornered on
  // E 452,754.1 / N 246,493.2, which is m_build.png's own grid. The model's window is the top-left
  // 1,256 x 1,144 of it, so what it builds is pasted at 0,0 and the rest of the grid is left at 0.
  var MOULD_YEARS = [2050, 2100];
  function mouldCanvas(y, kind) {
    var fw = Math.floor(W / STEP), fh = Math.floor(H / STEP);
    var c = document.createElement("canvas");
    c.width = fw; c.height = fh;
    var cx = c.getContext("2d"), id = cx.createImageData(fw, fh), d = id.data, r, col, i, q, v, cls;
    for (i = 0; i < fw * fh; i++) d[i * 4 + 3] = 255;        // every pixel written, nothing transparent
    if (out) {
      for (r = 0; r < SIMH; r++) for (col = 0; col < SIMW; col++) {
        cls = S.classAt(out, r * SIMW + col, y);
        if (!cls) continue;
        v = kind === "density" ? Math.round((S.PPK[cls] || 0) * out.cellKm2) : cls;
        if (!v) continue;
        q = (r * fw + col) * 4;
        d[q] = v; d[q + 1] = v; d[q + 2] = v;
      }
    }
    cx.putImageData(id, 0, 0);
    return c;
  }
  function mouldRun(years) {
    var s = out && out.stats.length ? out.stats[out.stats.length - 1] : null, cell = out ? out.cellKm2 : 0;
    var cellM2 = out ? out.cellM2 : km2ToM2(cell), frameM2 = W * PX * H * PX;
    return {
      written_by: "GrowthExport.forMould() in the Growth Simulator v9 page",
      year_on_screen_when_written: year,
      model: "Growth Simulator v9, js/sim.js - v8's model (the Variation Catalogue's sandbox) on a rectangle",
      zones: zonesNow(), scope: scope, years: years, params: params,
      grid: { frame_px: [W, H], frame_px_m: PX,
              frame_size_m: [W * PX, H * PX], frame_size_km: [W * PX / 1000, H * PX / 1000],
              frame_area_m2: frameM2, frame_area_km2: frameM2 / M2_PER_KM2,
              model_px: [Math.floor(W / STEP), Math.floor(H / STEP)], model_px_m: PX * STEP,
              model_cell_area_m2: cellM2, model_cell_area_km2: cell,
              window_px: [SIMW, SIMH], window_origin_px: [SIMX / STEP, SIMY / STEP],
              unit_contract: "length m; area m²; 1 km² = 1,000,000 m²" },
      corner_bng: { e0: D.cornerBNG[0], n1: D.cornerBNG[1] }, crs: D.crs,
      codes: { 1: "low rise", 2: "mid rise", 3: "high rise", 4: "horizontal farming", 5: "vertical farming",
               6: "commercial and public", 7: "institutional" },
      people_per_cell: { low: Math.round(S.PPK[1] * cell), mid: Math.round(S.PPK[2] * cell),
                         high: Math.round(S.PPK[3] * cell) },
      people_per_km2: { low: S.PPK[1], mid: S.PPK[2], high: S.PPK[3] }, people_per_home: 2.30,
      totals_2100: s ? { people: Math.round(s.people),
        high_km2: +(s.H * cell).toFixed(1), high_m2: Math.round(s.H * cellM2),
        mid_km2: +(s.M * cell).toFixed(1), mid_m2: Math.round(s.M * cellM2),
        low_km2: +(s.L * cell).toFixed(1), low_m2: Math.round(s.L * cellM2),
        horizontal_farming_km2: +(s.field * cell).toFixed(1), horizontal_farming_m2: Math.round(s.field * cellM2),
        vertical_farming_km2: +(s.vfarm * cell).toFixed(1), vertical_farming_m2: Math.round(s.vfarm * cellM2) } : null
    };
  }
  function give(url, name, revoke) {
    var a = document.createElement("a");
    a.download = name; a.href = url;
    document.body.appendChild(a); a.click(); a.remove();
    if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  window.GrowthExport = {                                    // console: GrowthExport.forMould()
    years: MOULD_YEARS,
    canvas: mouldCanvas,
    dataUrl: function (y, kind) { return mouldCanvas(y, kind).toDataURL("image/png"); },
    run: mouldRun,
    forMould: function (years) {
      if (!out) { console.log("run the model first"); return; }
      years = years || MOULD_YEARS;
      years.forEach(function (y) {
        mouldCanvas(y, "tier").toBlob(function (b) { give(URL.createObjectURL(b), "built_" + y + "_70m.png", true); });
        mouldCanvas(y, "density").toBlob(function (b) { give(URL.createObjectURL(b), "density_" + y + "_70m.png", true); });
      });
      var j = new Blob([JSON.stringify(mouldRun(years), null, 1)], { type: "application/json" });
      give(URL.createObjectURL(j), "run.json", true);
      return years;
    }
  };

  // ---------------------------------------------------------------- export
  function exportPng(kind) {
    var scale = Math.min(3, Math.max(1, 2200 / view.w));
    var mw = Math.round(view.w * scale), mh = Math.round(view.h * scale);
    var strip = kind === "sheet" ? Math.round(96 * (mw / 1000)) : 0;
    var oc = document.createElement("canvas");
    oc.width = mw; oc.height = mh + strip;
    var octx = oc.getContext("2d");
    var save = { cv: cv, ctx: ctx, tr: { s: tr.s, tx: tr.tx, ty: tr.ty } };
    exporting = true; exportKind = kind; mapH = mh;
    cv = oc; ctx = octx;
    tr.s = scale; tr.tx = -view.x * scale; tr.ty = -view.y * scale;
    render();
    if (strip) drawStrip(octx, mw, mh, strip);
    var name = "loopcity_growth_v9_" + viewMode + "_" + year + (strip ? "_sheet" : "") + ".png";
    function giveHere(url, revoke) { give(url, name, revoke); }
    function done() {
      exporting = false; exportKind = null;
      cv = save.cv; ctx = save.ctx; tr.s = save.tr.s; tr.tx = save.tr.tx; tr.ty = save.tr.ty;
      render();
    }
    done();                                                  // the view is back before the file is made
    // a blob, not a data URI: a page off the disk will not hand over an 8 MB data: link
    if (oc.toBlob) {
      oc.toBlob(function (b) {
        if (b) giveHere(URL.createObjectURL(b), true);
        else giveHere(oc.toDataURL("image/png"), false);
      }, "image/png");
    } else giveHere(oc.toDataURL("image/png"), false);
  }

  boot();
})();
