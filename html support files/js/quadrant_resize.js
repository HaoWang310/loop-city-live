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
      "body.lc-qresizing *{cursor:col-resize!important}" +
      "#toggleW.open{border-right:1px solid var(--line,#e2ded6)!important;border-radius:7px!important;background:#faf8f4!important}";
    document.head.appendChild(style);
  }

  var CFG = {
    left:   { panel:left,   key:"loopCity.quadrant.leftWidth",   min:180, max:520, def:330, dir: 1 },
    layers: { panel:layers, key:"loopCity.quadrant.layersWidth", min:180, max:520, def:330, dir:-1 },
    wool:   { panel:wool,   key:"loopCity.quadrant.woolWidth",   min:190, max:520, def:330, dir:-1 }
  };
  var MIN_STAGE = 360;
  var HANDLE_W = 8;
  var WOOL_TAB_RAIL = 34;

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
    if (visible(wool) || visible(layers)) used += WOOL_TAB_RAIL;
    return Math.max(me.min, Math.min(me.max, document.body.clientWidth - used));
  }

  function updateLayerTab() {
    var t = document.getElementById("toggleTab");
    var root = document.getElementById("quadrantMain");
    if (!t || !root) return;

    var rr = root.getBoundingClientRect();
    var x;

    if (visible(layers)) {
      // Follow the ACTUAL left edge of the Base Map Layers panel.
      // This avoids any arithmetic based on remembered panel widths.
      x = layers.getBoundingClientRect().left - rr.left - t.offsetWidth;
    } else {
      // When the layers panel is closed, keep its reopen button attached
      // to the live right edge of the drawing.
      x = stage.getBoundingClientRect().right - rr.left - t.offsetWidth;
    }

    t.style.left = Math.round(Math.max(0, x)) + "px";
    t.style.right = "auto";
  }

  function updateWoolTab() {
    var t = document.getElementById("toggleW");
    if (!t) return;

    /* The Wool tab gets its own rail instead of floating over either panel.
       When Wool is open the rail is the left margin of the Wool panel; when
       Wool is closed the same rail sits at the outside edge of the Layers panel. */
    if (visible(wool)) {
      wool.style.marginLeft = WOOL_TAB_RAIL + "px";
      layers.style.marginRight = "0px";
      t.style.right = Math.round(width(wool, CFG.wool.def)) + "px";
    } else {
      wool.style.marginLeft = "0px";
      layers.style.marginRight = visible(layers) ? WOOL_TAB_RAIL + "px" : "0px";
      t.style.right = "0px";
    }
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
    updateLayerTab();
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
      updateLayerTab();
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
    updateLayerTab();
    dispatchResize();
  }

  var observer = new MutationObserver(sync);
  observer.observe(left, {attributes:true, attributeFilter:["class","style"]});
  observer.observe(layers, {attributes:true, attributeFilter:["class","style"]});
  observer.observe(wool, {attributes:true, attributeFilter:["class","style"]});

  window.addEventListener("resize", sync);
  if (typeof ResizeObserver !== "undefined") {
    var edgeObserver = new ResizeObserver(function () { updateLayerTab(); });
    edgeObserver.observe(stage);
    edgeObserver.observe(layers);
    edgeObserver.observe(wool);
  }
  sync();
  updateLayerTab();
})();

/* Data-integrity compatibility patch for the currently generated combined_v10.html.
   Future builds from template_combined_v10.html contain the final-metrics marker and skip this. */
(function(){
  "use strict";
  if(window.__LC_QUADRANT_FINAL_METRICS_PATCH__)return;
  window.__LC_QUADRANT_FINAL_METRICS_PATCH__=true;
  if(window.__LC_FINAL_PARCEL_METRICS_AFTER_SMOOTH__)return;
  if(typeof smoothParcelRings!=="function"||typeof attachParcelFigures!=="function")return;

  function refreshFinalMetrics(){
    if(typeof S==="undefined"||!S||!Array.isArray(S.parcels))return;
    var CE=Number(S.cellE)||1,CN=Number(S.cellN)||CE;
    S.parcels.forEach(function(f){
      var r=f&&f.ring||[];
      if(r.length<6)return;
      var twiceA=0,perM=0;
      for(var i=0,j=r.length-2;i<r.length;j=i,i+=2){
        var x0=r[j],y0=r[j+1],x1=r[i],y1=r[i+1];
        twiceA+=x0*y1-x1*y0;
        perM+=Math.hypot((x1-x0)*CE,(y1-y0)*CN);
      }
      f.areaCells=Math.abs(twiceA)*0.5;
      f.perimCells=perM/Math.max(CE,1e-9);
      f.areaKm2=f.areaCells*CE*CN/1e6;
      f.perimKm=perM/1000;
    });
  }

  var originalSmooth=smoothParcelRings;
  smoothParcelRings=function(){
    var result=originalSmooth.apply(this,arguments);
    refreshFinalMetrics();
    attachParcelFigures();
    return result;
  };

  try{
    if(typeof S!=="undefined"&&S&&S.parcels&&S.parcels.length){
      refreshFinalMetrics();
      attachParcelFigures();
    }
  }catch(_){}
})();

(function(){
  "use strict";
  if(document.getElementById("lcUnifiedAnnealLikeQuadrantUI"))return;
  var st=document.createElement("style");
  st.id="lcUnifiedAnnealLikeQuadrantUI";
  st.textContent=`
:root{--paper:#f4f2ee;--card:#fff;--line:#e2ded6;--line2:#eeebe5;--ink:#2b2925;--ink2:#6f6a62;--ink3:#9c968c;--accent:#8f5f38;--accent2:#b58a68}
body{background:var(--paper)!important;color:var(--ink)!important}
#panelL,#panel,#panelW{background:#fff!important;flex-basis:330px;min-width:260px}
#panelL{border-right:1px solid var(--line)!important}
#panel,#panelW{border-left:1px solid var(--line)!important}
#panelScroll,#panelScrollL,#panelScrollW{padding:0 14px 28px!important}
.panelHead{min-height:48px;display:flex;align-items:center;padding:14px 0 10px!important;margin:0!important;border-bottom:1px solid var(--line2)!important;font-size:13px!important;font-weight:650!important}
.panelSub{padding:9px 0 12px;margin:0!important;border-bottom:1px solid var(--line2)}
section{margin:0!important;padding:14px 0 12px!important;border-bottom:1px solid var(--line2)}
section>h2{margin:0 0 10px!important;color:var(--ink)!important;font-size:10px!important;letter-spacing:.12em!important}
button.btn,#yearbar button{border-color:var(--line)!important;background:#fbfaf8!important;color:var(--ink)!important;border-radius:7px!important;box-shadow:none!important}
button.btn:hover,#yearbar button:hover{background:#f2efe9!important;border-color:#d7c8b8!important}
button.btn.primary,button.btn.running,#yearbar button.on{background:var(--accent)!important;border-color:var(--accent)!important;color:#fff!important}
#stage,#canvasWrap{background:radial-gradient(circle at 52% 46%,#fbfaf8 0,#f4f2ee 72%)!important}
#yearbar{background:#fff!important;border-top:1px solid var(--line)!important;padding:0 14px!important}
.chip{background:rgba(255,255,255,.94)!important;border-color:var(--line)!important;border-radius:999px!important}
#keyPlan{border-color:var(--line)!important;border-radius:8px!important;background:#fbfaf8!important}
input[type=range]{background:#e5e1d9!important;accent-color:var(--accent)!important}
`;
  document.head.appendChild(st);
})();
