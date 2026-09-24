(function () {
  "use strict";
  if (window.__LC_CELL_RESIZE__) return;
  window.__LC_CELL_RESIZE__ = true;

  var bar = document.getElementById("bar");
  var wrap = document.getElementById("wrap");
  var handle = document.getElementById("barResizer");
  if (!bar || !wrap || !handle) return;

  var KEY = "loopCity.cell.topBarHeight";
  var MIN_H = 66;
  var MIN_VIEW_H = 260;
  var DEFAULT_H = bar.getBoundingClientRect().height;

  function clamp(v) {
    return Math.max(MIN_H, Math.min(window.innerHeight - MIN_VIEW_H, v));
  }
  function apply(h, persist) {
    h = Math.round(clamp(h));
    bar.style.flex = "0 0 " + h + "px";
    bar.style.height = h + "px";
    if (persist) {
      try { localStorage.setItem(KEY, String(h)); } catch (_) {}
    }
    window.dispatchEvent(new Event("resize"));
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  if (saved !== null && saved !== "") apply(parseFloat(saved), false);

  handle.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    handle.setPointerCapture(ev.pointerId);
    handle.classList.add("dragging");
    document.body.classList.add("cell-bar-resizing");

    var startY = ev.clientY;
    var startH = bar.getBoundingClientRect().height;

    function move(e) {
      apply(startH + (e.clientY - startY), false);
    }
    function end(e) {
      try {
        if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      } catch (_) {}
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      handle.classList.remove("dragging");
      document.body.classList.remove("cell-bar-resizing");
      apply(bar.getBoundingClientRect().height, true);
    }

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });

  handle.addEventListener("dblclick", function (ev) {
    ev.preventDefault();
    bar.style.flex = "";
    bar.style.height = "";
    try { localStorage.removeItem(KEY); } catch (_) {}
    window.dispatchEvent(new Event("resize"));
  });

  window.addEventListener("resize", function () {
    if (bar.style.height) apply(bar.getBoundingClientRect().height, false);
  });
})();