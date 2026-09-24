(function () {
  "use strict";
  if (window.__LC_CELL_RESIZE_V2__) return;
  window.__LC_CELL_RESIZE_V2__ = true;

  var bar = document.getElementById("bar");
  var top = document.getElementById("barTop");
  var bottom = document.getElementById("barBottom");
  var outerHandle = document.getElementById("barResizer");
  var innerHandle = document.getElementById("barInnerResizer");
  if (!bar || !top || !bottom || !outerHandle || !innerHandle) return;

  var BAR_KEY = "loopCity.cell.topBarHeight";
  var TOP_KEY = "loopCity.cell.topRowHeight";
  var MIN_BAR = 110;
  var MIN_TOP = 46;
  var MIN_BOTTOM = 44;
  var MIN_VIEW = 260;
  var HANDLE_H = 8;

  var defaultBar = bar.getBoundingClientRect().height || 190;
  var defaultTop = top.getBoundingClientRect().height || 82;

  function n(v, fallback) {
    v = parseFloat(v);
    return isFinite(v) ? v : fallback;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function maxBar() {
    return Math.max(MIN_BAR, window.innerHeight - MIN_VIEW);
  }
  function maxTop() {
    return Math.max(MIN_TOP, bar.getBoundingClientRect().height - MIN_BOTTOM - HANDLE_H);
  }
  function notifyResize() {
    window.dispatchEvent(new Event("resize"));
  }

  function applyBar(h, persist) {
    h = Math.round(clamp(h, MIN_BAR, maxBar()));
    bar.style.flex = "0 0 " + h + "px";
    bar.style.height = h + "px";
    var th = top.getBoundingClientRect().height;
    if (th > maxTop()) applyTop(maxTop(), false);
    if (persist) {
      try { localStorage.setItem(BAR_KEY, String(h)); } catch (_) {}
    }
    notifyResize();
  }

  function applyTop(h, persist) {
    h = Math.round(clamp(h, MIN_TOP, maxTop()));
    top.style.flex = "0 0 " + h + "px";
    top.style.height = h + "px";
    if (persist) {
      try { localStorage.setItem(TOP_KEY, String(h)); } catch (_) {}
    }
    notifyResize();
  }

  function bindVertical(handle, bodyClass, readStart, apply, onEnd) {
    handle.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      ev.preventDefault();
      handle.setPointerCapture(ev.pointerId);
      handle.classList.add("dragging");
      document.body.classList.add(bodyClass);
      var startY = ev.clientY;
      var startValue = readStart();

      function move(e) {
        apply(startValue + (e.clientY - startY), false);
      }
      function end(e) {
        try {
          if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
        } catch (_) {}
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        handle.classList.remove("dragging");
        document.body.classList.remove(bodyClass);
        onEnd();
      }

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }

  bindVertical(
    outerHandle,
    "cell-bar-resizing",
    function () { return bar.getBoundingClientRect().height; },
    applyBar,
    function () { applyBar(bar.getBoundingClientRect().height, true); }
  );

  bindVertical(
    innerHandle,
    "cell-inner-resizing",
    function () { return top.getBoundingClientRect().height; },
    applyTop,
    function () { applyTop(top.getBoundingClientRect().height, true); }
  );

  outerHandle.addEventListener("dblclick", function (ev) {
    ev.preventDefault();
    bar.style.flex = "";
    bar.style.height = "";
    try { localStorage.removeItem(BAR_KEY); } catch (_) {}
    requestAnimationFrame(function () {
      var savedTop = null;
      try { savedTop = localStorage.getItem(TOP_KEY); } catch (_) {}
      if (savedTop !== null && savedTop !== "") applyTop(n(savedTop, defaultTop), false);
      notifyResize();
    });
  });

  innerHandle.addEventListener("dblclick", function (ev) {
    ev.preventDefault();
    top.style.flex = "0 0 " + Math.round(defaultTop) + "px";
    top.style.height = Math.round(defaultTop) + "px";
    try { localStorage.removeItem(TOP_KEY); } catch (_) {}
    notifyResize();
  });

  var savedBar = null, savedTop = null;
  try {
    savedBar = localStorage.getItem(BAR_KEY);
    savedTop = localStorage.getItem(TOP_KEY);
  } catch (_) {}

  if (savedBar !== null && savedBar !== "") applyBar(n(savedBar, defaultBar), false);
  if (savedTop !== null && savedTop !== "") applyTop(n(savedTop, defaultTop), false);

  window.addEventListener("resize", function () {
    if (bar.style.height) applyBar(bar.getBoundingClientRect().height, false);
    if (top.style.height) applyTop(top.getBoundingClientRect().height, false);
  });
})();