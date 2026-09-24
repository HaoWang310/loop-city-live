(function () {
  "use strict";

  if (window.__LC_CELL_MAIN_PANEL_RESIZE__) return;
  window.__LC_CELL_MAIN_PANEL_RESIZE__ = true;

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
  var raf = 0;

  function number(value, fallback) {
    value = parseFloat(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function availableMaximum() {
    var viewportWidth =
      document.documentElement.clientWidth ||
      window.innerWidth ||
      1200;

    return Math.max(
      MIN_WIDTH,
      Math.min(
        MAX_WIDTH,
        viewportWidth - MIN_STAGE_WIDTH - HANDLE_WIDTH
      )
    );
  }

  function notifyResize() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      raf = 0;
      window.dispatchEvent(new Event("resize"));
    });
  }

  function setWidth(width, persist) {
    width = clamp(
      number(width, DEFAULT_WIDTH),
      MIN_WIDTH,
      availableMaximum()
    );

    width = Math.round(width);

    panel.style.width = width + "px";
    panel.style.flexBasis = width + "px";
    panel.style.flexGrow = "0";
    panel.style.flexShrink = "0";

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, String(width));
      } catch (_) {}
    }

    notifyResize();
    return width;
  }

  function restoreWidth() {
    var saved = null;

    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (_) {}

    if (saved !== null && saved !== "") {
      setWidth(number(saved, DEFAULT_WIDTH), false);
    } else {
      setWidth(DEFAULT_WIDTH, false);
    }
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

    // Right-side panel:
    // drag left = wider, drag right = narrower.
    var delta = event.clientX - startX;
    setWidth(startWidth - delta, false);
  }

  function endDrag(event) {
    if (!dragging) return;

    if (
      event &&
      pointerId !== null &&
      event.pointerId !== pointerId
    ) return;

    dragging = false;

    try {
      if (
        pointerId !== null &&
        handle.hasPointerCapture(pointerId)
      ) {
        handle.releasePointerCapture(pointerId);
      }
    } catch (_) {}

    pointerId = null;

    handle.classList.remove("dragging");
    document.body.classList.remove("cell-main-panel-resizing");

    setWidth(
      panel.getBoundingClientRect().width,
      true
    );
  }

  function resetWidth(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}

    setWidth(DEFAULT_WIDTH, false);
  }

  handle.addEventListener("pointerdown", beginDrag);
  handle.addEventListener("pointermove", moveDrag);
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  handle.addEventListener("lostpointercapture", function () {
    if (dragging) endDrag();
  });

  handle.addEventListener("dblclick", resetWidth);

  handle.tabIndex = 0;

  handle.addEventListener("keydown", function (event) {
    var current = panel.getBoundingClientRect().width;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setWidth(current + 20, true);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setWidth(current - 20, true);
    }

    if (event.key === "Home") {
      event.preventDefault();
      resetWidth();
    }
  });

  window.addEventListener("resize", function () {
    var current = panel.getBoundingClientRect().width;
    var maximum = availableMaximum();

    if (current > maximum) {
      setWidth(maximum, false);
    }
  });

  restoreWidth();
})();