/* ============================================================================================
   Loop City v8 -- the link between the three scales.

   Loop  ->  quadrant  ->  cell. Each scale is its own app, and each still opens on its own. This is
   the one piece they share: how a scale hands the next one what it needs, and how it is told it
   has been handed something.

   Inside "Loop City.html" the three apps sit in frames of one window, and the shell carries the
   messages. A scale you leave is not closed, only hidden, so going back up costs nothing: the
   loop's run, the quadrant's century, its network and its cells are all still there. That was the
   whole reason for a shell rather than three links -- the quadrant's century is 35 seconds and its
   cells are minutes of the architect's own work, and a link back would throw both away.

   Opened on its own, a scale opens the next one in a tab of its own instead, and hands it the same
   thing once that tab says it is ready.

   Messages are plain objects with lc: 1, sent with targetOrigin "*" because a page opened off the
   disk has no origin to name. What protects them is the other end: a page only listens to its own
   parent frame and to windows it opened itself, and the shell only to its own three frames.

     LoopCity.ready()                 say this page can take a context; call once the page is built
     LoopCity.on("enter", fn)         fn(ctx) when the scale above hands this one something
     LoopCity.on("shell", fn)         fn() once, when it turns out this page is inside the shell
     LoopCity.jump(to, ctx, url, viaHash)
                                      go to the next scale. In the shell the shell does it; on its
                                      own it opens url in a new tab, and either the context rides in
                                      the url's #lc= (viaHash, for small ones) or it is posted across
                                      once the new tab is ready (for a cell, which is too big)
     LoopCity.label(text)             what this scale is showing, for the shell's breadcrumb
     LoopCity.hashCtx()               a context that arrived in the url, or null
     LoopCity.hashFor(ctx)            the #lc= fragment for one
   ============================================================================================ */
(function (root) {
  "use strict";

  var handlers = {}, opened = [], inShell = false;
  var framed = (function () { try { return root.parent && root.parent !== root; } catch (e) { return true; } })();

  function post(target, msg) {
    msg.lc = 1;
    try { target.postMessage(msg, "*"); } catch (e) { /* a closed tab */ }
  }
  function from(e) {
    if (framed && e.source === root.parent) return "parent";
    if (root.opener && e.source === root.opener) return "opener";
    for (var i = 0; i < opened.length; i++) if (opened[i].win === e.source) return opened[i];
    return null;
  }

  root.addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.lc !== 1) return;
    var who = from(e);
    if (!who) return;                                  // not our shell, not a tab we opened
    if (d.type === "shell" && who === "parent") {
      inShell = true;
      if (handlers.shell) handlers.shell();
      return;
    }
    if (d.type === "ready" && typeof who === "object") {
      // a tab this page opened is up: hand it what it was opened for, once
      if (who.ctx) { post(who.win, { type: "enter", ctx: who.ctx }); who.ctx = null; }
      return;
    }
    if (d.type === "enter" && handlers.enter) handlers.enter(d.ctx, d);
  });

  function ready() {
    if (framed) post(root.parent, { type: "ready" });
    if (root.opener) post(root.opener, { type: "ready" });
  }

  function hashFor(ctx) { return "#lc=" + encodeURIComponent(JSON.stringify(ctx)); }

  function jump(to, ctx, url, viaHash) {
    if (inShell) { post(root.parent, { type: "jump", to: to, ctx: ctx }); return "shell"; }
    if (!url) return null;
    var w = root.open(url + (viaHash ? hashFor(ctx) : ""), "_blank");
    if (!w) return null;                               // the browser blocked the new tab
    opened.push({ win: w, ctx: viaHash ? null : ctx });
    return "tab";
  }

  function label(text) { if (inShell) post(root.parent, { type: "label", text: text }); }

  function hashCtx() {
    var m = /[#&]lc=([^&]*)/.exec(root.location.hash || "");
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }

  root.LoopCity = {
    on: function (type, fn) { handlers[type] = fn; },
    ready: ready, jump: jump, label: label, hashCtx: hashCtx, hashFor: hashFor,
    get inShell() { return inShell; },
    get framed() { return framed; }
  };
})(window);
