(function () {
  "use strict";

  if (window.__LC_CELL_MAIN_PANEL_RESIZE_LEFT_STABLE__) return;
  window.__LC_CELL_MAIN_PANEL_RESIZE_LEFT_STABLE__ = true;

  var panel = document.getElementById("bar");
  var stage = document.getElementById("wrap");
  var handle = document.getElementById("barResizer");

  if (!panel || !stage || !handle) return;

  var STORAGE_KEY = "loopCity.cell.mainPanelWidth";
  var DEFAULT_WIDTH = 420;
  var MIN_WIDTH = 300;
  var MAX_WIDTH = 720;
  var MIN_STAGE_WIDTH = 420;
  var HANDLE_WIDTH = 8;

  var dragging = false;
  var pointerId = null;
  var startX = 0;
  var startWidth = 0;
  var pendingWidth = null;
  var dragRAF = 0;

  function number(value, fallback) {
    value = parseFloat(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function maximumWidth() {
    var viewport =
      document.documentElement.clientWidth ||
      window.innerWidth ||
      1200;

    return Math.max(
      MIN_WIDTH,
      Math.min(
        MAX_WIDTH,
        viewport - MIN_STAGE_WIDTH - HANDLE_WIDTH
      )
    );
  }

  function applyWidth(width) {
    width = Math.round(
      clamp(
        number(width, DEFAULT_WIDTH),
        MIN_WIDTH,
        maximumWidth()
      )
    );

    panel.style.width = width + "px";
    panel.style.flexBasis = width + "px";
    panel.style.flexGrow = "0";
    panel.style.flexShrink = "0";

    return width;
  }

  function persistWidth(width) {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
    } catch (_) {}
  }

  function finalResizeNotify() {
    /*
     * Do this only AFTER dragging.
     * During drag, the browser already resizes the iframe viewport
     * because flex layout changes. Broadcasting resize on every
     * pointermove caused Canvas / Wool / layer redraw cascades.
     */
    requestAnimationFrame(function () {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (_) {}

      var frames = stage.querySelectorAll("iframe");
      frames.forEach(function (frame) {
        try {
          frame.contentWindow.dispatchEvent(new Event("resize"));
        } catch (_) {}
      });
    });
  }

  function scheduleDragWidth(width) {
    pendingWidth = width;

    if (dragRAF) return;

    dragRAF = requestAnimationFrame(function () {
      dragRAF = 0;

      if (pendingWidth === null) return;

      applyWidth(pendingWidth);
      pendingWidth = null;
    });
  }

  function clearDragState() {
    dragging = false;
    pointerId = null;
    pendingWidth = null;

    if (dragRAF) {
      cancelAnimationFrame(dragRAF);
      dragRAF = 0;
    }

    handle.classList.remove("dragging");
    document.body.classList.remove("cell-main-panel-resizing");
  }

  function beginDrag(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    dragging = true;
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;

    handle.classList.add("dragging");
    document.body.classList.add("cell-main-panel-resizing");

    try {
      handle.setPointerCapture(pointerId);
    } catch (_) {}
  }

  function moveDrag(event) {
    if (!dragging) return;
    if (pointerId !== null && event.pointerId !== pointerId) return;

    event.preventDefault();

    var delta = event.clientX - startX;

    // Left-side panel:
    // drag right => wider
    // drag left  => narrower
    scheduleDragWidth(startWidth + delta);
  }

  function finishDrag(event) {
    if (!dragging) return;

    if (
      event &&
      pointerId !== null &&
      event.pointerId !== pointerId
    ) return;

    var finalWidth =
      pendingWidth !== null
        ? applyWidth(pendingWidth)
        : applyWidth(panel.getBoundingClientRect().width);

    var oldPointerId = pointerId;

    clearDragState();

    try {
      if (
        oldPointerId !== null &&
        handle.hasPointerCapture(oldPointerId)
      ) {
        handle.releasePointerCapture(oldPointerId);
      }
    } catch (_) {}

    persistWidth(finalWidth);
    finalResizeNotify();
  }

  function cancelDrag() {
    if (!dragging) return;

    clearDragState();
    applyWidth(panel.getBoundingClientRect().width);
  }

  function resetWidth(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}

    applyWidth(DEFAULT_WIDTH);
    finalResizeNotify();
  }

  handle.addEventListener("pointerdown", beginDrag);
  handle.addEventListener("pointermove", moveDrag);
  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", cancelDrag);

  /*
   * Do NOT call finishDrag from lostpointercapture.
   * Releasing pointer capture inside finishDrag can itself produce
   * lostpointercapture and used to create a duplicate end path.
   */
  handle.addEventListener("lostpointercapture", function () {
    if (dragging) cancelDrag();
  });

  window.addEventListener("blur", cancelDrag);

  handle.addEventListener("dblclick", resetWidth);

  handle.tabIndex = 0;

  handle.addEventListener("keydown", function (event) {
    var current = panel.getBoundingClientRect().width;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      var w1 = applyWidth(current - 20);
      persistWidth(w1);
      finalResizeNotify();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      var w2 = applyWidth(current + 20);
      persistWidth(w2);
      finalResizeNotify();
    } else if (event.key === "Home") {
      resetWidth(event);
    }
  });

  /*
   * Browser resize: clamp only.
   * Never dispatch another resize from inside a resize handler.
   */
  window.addEventListener("resize", function () {
    if (dragging) return;

    var current = panel.getBoundingClientRect().width;
    var maximum = maximumWidth();

    if (current > maximum) {
      applyWidth(maximum);
    }
  });

  var saved = null;

  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (_) {}

  applyWidth(
    saved !== null && saved !== ""
      ? number(saved, DEFAULT_WIDTH)
      : DEFAULT_WIDTH
  );
})();