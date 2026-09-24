(function () {
  "use strict";
  if (window.__LC_QUADRANT_RESIZE__) return;
  window.__LC_QUADRANT_RESIZE__ = true;

  var left = document.getElementById("panelL");
  var stage = document.getElementById("stage");
  var layers = document.getElementById("panel");
  var wool = document.getElementById("panelW");
  if (!left || !stage || !layers || !wool || !document.body) return;

  var STYLE_ID = "lcQuadrantResizeStyle";
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#stage{min-width:360px!important}" +
      ".lc-qsplit{position:relative;flex:0 0 8px;width:8px;height:100%;cursor:col-resize;" +
      "z-index:65;background:transparent;touch-action:none;user-select:none}" +
      ".lc-qsplit:after{content:'';position:absolute;top:0;bottom:0;left:3px;width:2px;" +
      "background:transparent;transition:background .12s ease}" +
      ".lc-qsplit:hover:after,.lc-qsplit.dragging:after{background:rgba(143,95,56,.48)}" +
      "body.lc-qresizing{cursor:col-resize!important;user-select:none!important}" +
      "body.lc-qresizing *{cursor:col-resize!important}";
    document.head.appendChild(style);
  }

  var CFG = {
    left:   { panel:left,   key:"loopCity.quadrant.leftWidth",   min:180, max:520, def:300, dir: 1 },
    layers: { panel:layers, key:"loopCity.quadrant.layersWidth", min:180, max:520, def:322, dir:-1 },
    wool:   { panel:wool,   key:"loopCity.quadrant.woolWidth",   min:190, max:520, def:306, dir:-1 }
  };
  var MIN_STAGE = 360;
  var HANDLE_W = 8;

  function visible(el) {
    return !!el && getComputedStyle(el).display !== "none";
  }
  function n(v, fallback) {
    v = parseFloat(v);
    return isFinite(v) ? v : fallback;
  }
  function width(el, fallback) {
    return n(el.getBoundingClientRect().width, fallback);
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function makeHandle(id, beforeEl, title) {
    var h = document.getElementById(id);
    if (h) return h;
    h = document.createElement("div");
    h.id = id;
    h.className = "lc-qsplit";
    h.setAttribute("role", "separator");
    h.setAttribute("aria-orientation", "vertical");
    h.title = title + "；双击恢复默认宽度";
    beforeEl.parentNode.insertBefore(h, beforeEl);
    return h;
  }

  var hLeft = makeHandle("lcSplitLeft", stage, "拖动调整左侧参数栏宽度");
  var hLayers = makeHandle("lcSplitLayers", layers, "拖动调整图层控制栏宽度");
  var hWool = makeHandle("lcSplitWool", wool, "拖动调整羊毛线栏宽度");
  CFG.left.handle = hLeft;
  CFG.layers.handle = hLayers;
  CFG.wool.handle = hWool;

  function handleCount(exceptName) {
    var c = 0;
    Object.keys(CFG).forEach(function (name) {
      if (name === exceptName) return;
      var x = CFG[name];
      if (visible(x.panel) && x.handle.style.display !== "none") c++;
    });
    return c;
  }

  function maxFor(name) {
    var me = CFG[name], used = MIN_STAGE;
    Object.keys(CFG).forEach(function (other) {
      if (other === name) return;
      var x = CFG[other];
      if (visible(x.panel)) used += width(x.panel, x.def);
    });
    used += (handleCount(name) + 1) * HANDLE_W;
    return Math.max(me.min, Math.min(me.max, document.body.clientWidth - used));
  }

  function updateWoolTab() {
    var t = document.getElementById("toggleW");
    if (!t) return;
    if (visible(wool)) t.style.right = Math.round(width(wool, CFG.wool.def)) + "px";
    else t.style.right = "0px";
  }

  function dispatchResize() {
    window.dispatchEvent(new Event("resize"));
  }

  function apply(name, value, persist) {
    var c = CFG[name];
    value = clamp(value, c.min, maxFor(name));
    c.panel.style.flexBasis = Math.round(value) + "px";
    if (persist) {
      try { localStorage.setItem(c.key, String(Math.round(value))); } catch (_) {}
    }
    updateWoolTab();
    dispatchResize();
  }

  function start(name, ev) {
    var c = CFG[name], h = c.handle;
    if (!visible(c.panel)) return;
    ev.preventDefault();
    h.setPointerCapture(ev.pointerId);
    h.classList.add("dragging");
    document.body.classList.add("lc-qresizing");
    var startX = ev.clientX;
    var startW = width(c.panel, c.def);

    function move(e) {
      apply(name, startW + c.dir * (e.clientX - startX), false);
    }
    function end(e) {
      try { h.releasePointerCapture(e.pointerId); } catch (_) {}
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", end);
      h.removeEventListener("pointercancel", end);
      h.classList.remove("dragging");
      document.body.classList.remove("lc-qresizing");
      apply(name, width(c.panel, c.def), true);
    }
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", end);
    h.addEventListener("pointercancel", end);
  }

  Object.keys(CFG).forEach(function (name) {
    var c = CFG[name];
    c.handle.addEventListener("pointerdown", function (e) { start(name, e); });
    c.handle.addEventListener("dblclick", function () {
      c.panel.style.flexBasis = c.def + "px";
      try { localStorage.removeItem(c.key); } catch (_) {}
      updateWoolTab();
      dispatchResize();
    });
    var saved = null;
    try { saved = localStorage.getItem(c.key); } catch (_) {}
    if (saved !== null && saved !== "") c.panel.style.flexBasis = clamp(n(saved, c.def), c.min, c.max) + "px";
  });

  function sync() {
    hLeft.style.display = visible(left) ? "" : "none";
    hLayers.style.display = visible(layers) ? "" : "none";
    hWool.style.display = visible(wool) ? "" : "none";

    Object.keys(CFG).forEach(function (name) {
      var c = CFG[name];
      if (visible(c.panel)) {
        var w = width(c.panel, c.def);
        if (w > maxFor(name)) c.panel.style.flexBasis = Math.round(maxFor(name)) + "px";
      }
    });
    updateWoolTab();
    dispatchResize();
  }

  var observer = new MutationObserver(sync);
  observer.observe(left, {attributes:true, attributeFilter:["class","style"]});
  observer.observe(layers, {attributes:true, attributeFilter:["class","style"]});
  observer.observe(wool, {attributes:true, attributeFilter:["class","style"]});

  window.addEventListener("resize", sync);
  sync();
})();