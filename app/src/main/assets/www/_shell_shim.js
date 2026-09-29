/* Platform shell for Resonance Studio (Android).
 *
 * The web app is the source of truth and is not forked. This file is the only new
 * front-end code: it adds the mobile layer the studio never had and removes what only
 * makes sense on a desktop.
 *
 *   1. A bottom bar that follows you: play/pause, stop, the session name and clock, a
 *      fullscreen-visualizer button and the menu. The page's own header (three rows of
 *      transport on a phone) is hidden; its controls stay live and are what this drives.
 *   2. The MENU: a drag-up sheet that names every part of the studio in plain words and
 *      jumps to it, plus the things you would otherwise have to find: skins, focus mode,
 *      the quick guide, the device check, the update check.
 *   3. FULLSCREEN VISUALIZER: tap any visual panel (or the bar button) and the panel's
 *      own canvas - moved, never copied, so the page keeps drawing into it - fills the
 *      screen, with a small play/pause embedded at the bottom. Back or the X returns.
 *   4. File work that a phone cannot do by itself: .gnaural/.zip import through the
 *      system picker, and every save (share packs, .gnaural, WAV exports of any length)
 *      streamed to Downloads/Resonance Studio by the shell.
 *   5. Playback state reported to the native service, so sessions keep going with the
 *      screen off and the lock screen has pause/stop - driven in the service itself.
 *
 * Playback is never reimplemented: every action below goes through the page's own
 * window.__gnauralAPI, and every fact comes from the page's own DOM/state.
 *
 * BRIDGE (the only platform-specific part):
 *   Android  window.ResonanceJs   synchronous @JavascriptInterface object
 *   iOS      window.webkit.messageHandlers.rs   postMessage + window.__rsDevice
 */
(function () {
  "use strict";
  if (window.__rs) return;

  var host = window.ResonanceJs;                   // Android, if we are on Android
  var wk = null, ios = false;
  try {
    wk = (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.rs) || null;
  } catch (e) { wk = null; }
  ios = !!wk && !host;

  function native(name, args) {
    try { if (host && typeof host[name] === "function") return host[name].apply(host, args || []); }
    catch (e) { /* the shell is gone; the page must keep working without it */ }
    try { if (wk) wk.postMessage({ m: name, a: args || [] }); }
    catch (e2) { }
    return null;
  }
  function report(msg) { native("log", [String(msg)]); }

  var doc = document;
  var $id = function (id) { return doc.getElementById(id); };
  var $ = function (sel) { return doc.querySelector(sel); };

  var APP_NAME = "Resonance Studio";
  var SITE_BASE = "https://moddys.net/resonance/app/";   // where this page really lives

  /* ==================================================================== state === */

  function api() { return window.__gnauralAPI || null; }
  function pState() { var a = api(); return a ? a.state : null; }
  function isPlaying() { var s = pState(); return !!(s && s.playing); }

  function text(el) { return el ? (el.textContent || "").trim() : ""; }
  function sessionTitle() {
    var t = text($id("nowtitle"));
    return (t && t !== "(untitled)") ? t : "";
  }
  function clockText() { return text($id("clock")); }
  function modeText() { return text($id("modePill")); }

  function info() {
    return { playing: isPlaying(), session: sessionTitle(), error: null,
             mode: pState() ? (pState().mode || "") : "" };
  }

  var lastKey = null;
  function pushState(force) {
    var s = info();
    var key = (s.playing ? "1" : "0") + "|" + (s.session || "");
    if (!force && key === lastKey) return;
    lastKey = key;
    native("state", [!!s.playing, s.session || "", ""]);
  }

  /* ==================================================== controls on the page === */
  /* Every action drives the page's own API. Nothing is duplicated. */

  function pagePlay()   { var a = api(); if (a) { try { a.play(); } catch (e) { } } }
  function pagePause()  { var a = api(); if (a) { try { a.pause(); } catch (e) { } } }
  function pageToggle() { var a = api(); if (a) { try { a.togglePlay(); } catch (e) { } } }
  function pageStop()   { var a = api(); if (a) { try { a.stopPlayback(false); } catch (e) { } } }
  function masterNow()  { var m = $id("master"); return m ? parseFloat(m.value) : 0.7; }
  function setMaster(v) { var a = api(); if (a) { try { a.setMaster(v); return; } catch (e) { } }
                          var m = $id("master"); if (m) { m.value = String(v); m.dispatchEvent(new Event("input", { bubbles: true })); } }
  function toast(t)     { var a = api(); if (a) { try { a.toast(String(t)); return; } catch (e) { } } report(t); }

  function pageReady() { return !!(api() && $id("plist")); }

  /* ============================================================ injected CSS === */

  function injectCss(css, id) {
    if (id && doc.getElementById(id)) return;
    var s = doc.createElement("style");
    if (id) s.id = id;
    s.textContent = css;
    (doc.head || doc.documentElement).appendChild(s);
  }

  var BAR_H = 66;

  function appCss() {
    injectCss([
      "html.rs-app{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}",
      /* the page's own header is the desktop control island: the shell owns the bar now */
      "html.rs-app header.studio{display:none !important}",
      "html.rs-app body{padding-bottom:calc(" + (BAR_H + 18) + "px + env(safe-area-inset-bottom,0px)) !important}",
      /* the page's toast sits behind the bar; lift it above */
      "html.rs-app #toast{bottom:calc(" + (BAR_H + 22) + "px + env(safe-area-inset-bottom,0px)) !important;z-index:88 !important}",
      /* the WAV-export progress lives in the hidden header: keep it visible above the bar */
      "html.rs-app #prog:not([hidden]){display:block !important;position:fixed;left:14px;right:14px;",
      "  bottom:calc(" + (BAR_H + 8) + "px + env(safe-area-inset-bottom,0px));height:8px;z-index:78;accent-color:var(--acc)}",
      /* phone-sized touch-ups, all measured against the page's own rules */
      "@media (max-width:640px){",
      "  html.rs-app #plist{max-height:58vh}",
      "  html.rs-app button,html.rs-app select{min-height:40px}",
      "  html.rs-app .chip{min-height:34px}",
      "  html.rs-app #plist .item{padding:9px 8px}",
      "}",
      /* the keyboard-shortcut card is dead weight on a phone */
      "@media (max-width:900px){html.rs-app .col.right section.card:last-child{display:none}}",
      /* jump highlight */
      "html.rs-app .rs-jump{outline:2px solid var(--acc);outline-offset:2px;border-radius:12px;transition:outline-color .3s}",
      /* locked while a sheet or overlay is open */
      "html.rs-locked,html.rs-locked body{overflow:hidden !important}"
    ].join(""), "rsAppCss");
  }

  /* ================================================================= the bar === */

  var barEl = null;

  function barCss() {
    injectCss([
      "#rsBar{position:fixed;left:0;right:0;bottom:0;z-index:75;display:flex;align-items:center;gap:9px;",
      "  padding:9px 10px calc(9px + env(safe-area-inset-bottom,0px));",
      "  background:color-mix(in srgb, var(--panel,#1b1510) 97%, transparent);",
      "  border-top:1px solid var(--line,#3a2c20);box-shadow:0 -10px 26px rgba(0,0,0,.38);",
      "  font:14px/1.25 var(--sans,system-ui);color:var(--ink,#f2e6d8);touch-action:manipulation;",
      "  user-select:none;-webkit-user-select:none}",
      "#rsBar .rs-round{flex:0 0 auto;width:50px;height:50px;border-radius:50%;padding:0;",
      "  border:2px solid var(--acc,#e0b96f);background:var(--acc,#e0b96f);color:var(--acc-ink,#2a1a08);",
      "  font-size:18px;font-weight:900;line-height:1;cursor:pointer}",
      "#rsBar .rs-round:active{transform:scale(.94)}",
      "#rsBar .rs-mini{flex:0 0 auto;width:38px;height:38px;border-radius:50%;padding:0;",
      "  border:1.5px solid var(--line2,#5a452c);background:transparent;color:var(--ink,#f2e6d8);",
      "  font-size:12px;line-height:1;cursor:pointer}",
      "#rsBar .rs-now{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;",
      "  cursor:pointer;padding:4px 2px}",
      "#rsBar .rs-now b{font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;",
      "  text-overflow:ellipsis;color:var(--ink,#f2e6d8)}",
      "#rsBar .rs-now span{font-family:var(--mono,monospace);font-size:11.5px;color:var(--ink-dim,#b9a48c);",
      "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#rsBar .rs-icon{flex:0 0 auto;width:44px;height:44px;border-radius:12px;padding:0;",
      "  border:1.5px solid var(--line2,#5a452c);background:transparent;color:var(--ink-dim,#b9a48c);",
      "  font-size:17px;line-height:1;cursor:pointer}",
      "#rsBar .rs-icon:active{transform:scale(.95)}",
      "#rsBar .rs-icon.rs-on{border-color:var(--acc,#e0b96f);color:var(--acc,#e0b96f)}"
    ].join(""), "rsBarCss");
  }

  function buildBar() {
    barCss();
    var bar = doc.createElement("div");
    bar.id = "rsBar";
    bar.innerHTML =
      '<button class="rs-round" data-rs="play" aria-label="Play or pause">\u25B6</button>' +
      '<button class="rs-mini" data-rs="stop" aria-label="Stop">\u25A0</button>' +
      '<div class="rs-now" data-rs="open" role="button" tabindex="0" aria-label="Open the menu">' +
      '  <b id="rsTitle">Pick a session</b>' +
      '  <span id="rsSub">\u2014</span>' +
      '</div>' +
      '<button class="rs-icon" data-rs="viz" aria-label="Fullscreen visualizer">\u25D0</button>' +
      '<button class="rs-icon" data-rs="menu" aria-label="Menu">\u2630</button>';
    doc.body.appendChild(bar);

    bar.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-rs]");
      if (!b) return;
      var act = b.getAttribute("data-rs");
      if (act === "play") { pageToggle(); pushState(true); }
      else if (act === "stop") { pageStop(); pushState(true); }
      else if (act === "open" || act === "menu") { openSheet(true); }
      else if (act === "viz") { enterFullscreen(); }
    });
    bar.querySelector('[data-rs="open"]').addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openSheet(true); }
    });

    /* drag the bar up to open the sheet (buttons and sliders are never stolen) */
    var y0 = null;
    bar.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest("button,input")) return;
      y0 = ev.clientY;
    }, { passive: true });
    doc.addEventListener("pointerup", function (ev) {
      if (y0 == null) return;
      var dy = ev.clientY - y0; y0 = null;
      if (dy < -26) openSheet(true);
    }, { passive: true });

    return bar;
  }

  /* =============================================================== the sheet === */
  /* The menu and the player: one drag-up panel. Everything in it either jumps to the
     page's own card or performs one named action - nothing is re-implemented. */

  var sheetEl = null;
  var SHEET = { open: false };
  var sheetH = 0;

  var ROWS = [
    ["grp", "Play"],
    ["jump", "Sessions", "search the built-in library", "#plist"],
    ["jump", "Quick picks", "add a layer to the sound", "#quickpick"],
    ["jump", "Player & schedule", "the graph of what plays when", "#graph"],
    ["jump", "What you hear", "carrier, rate, band", "#hearinfo"],
    ["grp", "Edit"],
    ["jump", "Voices & entries", "shape the schedule", "#voicelist"],
    ["grp", "Tools"],
    ["jump", "Live tools", "meter \u00B7 timer \u00B7 pacer \u00B7 mute", "#timerBtn"],
    ["act", "Skin", "the look of the studio", "skin"],
    ["act", "Focus mode", "hide everything else", "focus"],
    ["grp", "Files"],
    ["jump", "Files & export", "open \u00B7 save \u00B7 WAV \u00B7 share link", "#loadBtn"],
    ["jump", "Pack downloads", "save a pack for any tool", "#pklist"],
    ["grp", "Look"],
    ["act", "Visualizer \u2014 fullscreen", "fill the screen with the sound", "fs"],
    ["jump", "Visualizer settings", "modes, calm, scramble", "#vizCard"],
    ["grp", "App"],
    ["act", "Quick guide", "how to use all of this", "guide"],
    ["ext", "Full help", "opens moddys.net in the browser", "https://moddys.net/resonance/help/"],
    ["act", "Check device", "what this phone reports", "check"],
    ["act", "About Resonance Studio", "version and licences", "about"],
    ["act", "Check for updates", "asks moddys.net", "upd"]
  ];

  function sheetCss() {
    injectCss([
      "#rsSheet{position:fixed;left:0;right:0;bottom:0;z-index:80;",
      "  height:min(78vh,760px);display:flex;flex-direction:column;",
      "  background:linear-gradient(180deg,var(--panel2,#241c15),var(--panel,#1b1510));",
      "  border-top:1px solid var(--line,#3a2c20);border-radius:18px 18px 0 0;",
      "  box-shadow:0 -18px 50px rgba(0,0,0,.55);color:var(--ink,#f2e6d8);",
      "  font:14.5px/1.4 var(--sans,system-ui);",
      "  transform:translateY(calc(100% + 30px));transition:transform .28s cubic-bezier(.22,.61,.36,1);",
      "  padding-bottom:env(safe-area-inset-bottom,0px)}",
      "#rsSheet.rs-open{transform:translateY(0)}",
      "#rsSheet.rs-drag{transition:none}",
      "#rsGrab{flex:0 0 auto;display:flex;align-items:center;justify-content:center;height:26px;",
      "  cursor:grab;touch-action:none;position:relative}",
      "#rsGrab i{width:46px;height:5px;border-radius:3px;background:var(--line2,#5a452c);display:block}",
      "#rsGrab b{position:absolute;right:16px;font-size:15px;color:var(--ink-faint,#7d6a58);",
      "  transform:rotate(180deg);transition:transform .28s}",
      "#rsSheet.rs-open #rsGrab b{transform:rotate(0)}",
      "#rsSHead{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:2px 16px 10px}",
      "#rsSHead .rs-brand{font:italic 600 1.08rem 'Palatino Linotype',Palatino,Georgia,serif;",
      "  background:linear-gradient(180deg,#f6e7c4 8%,#d9b66f 55%,#ab8742 100%);",
      "  -webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap}",
      "#rsSHead .rs-pill{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;",
      "  border:1px solid var(--line2,#5a452c);border-radius:999px;padding:2px 8px;color:var(--ink-faint,#7d6a58)}",
      "#rsSHead .rs-pill.ok{color:var(--good,#93c793);border-color:var(--good,#93c793)}",
      "#rsSHead .rs-pill.warn{color:var(--bad,#e0604f);border-color:var(--bad,#e0604f)}",
      "#rsSScroll{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;",
      "  padding:0 14px calc(18px + env(safe-area-inset-bottom,0px));touch-action:pan-y}",
      ".rs-player{border:1px solid var(--line,#3a2c20);border-radius:14px;padding:12px 12px 10px;",
      "  background:color-mix(in srgb, var(--acc,#e0b96f) 5%, var(--panel,#1b1510))}",
      ".rs-player .rs-p-title{font-weight:800;font-size:16px;line-height:1.2}",
      ".rs-player .rs-p-src{color:var(--ink-faint,#7d6a58);font-size:12px;margin-top:2px;",
      "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".rs-player .rs-p-row{display:flex;align-items:center;gap:9px;margin-top:10px;flex-wrap:wrap}",
      ".rs-player .rs-p-time{font-family:var(--mono,monospace);color:var(--ink-dim,#b9a48c);font-size:12.5px}",
      ".rs-player button.rs-tbtn{min-height:44px;border-radius:12px;padding:9px 14px;font-weight:700;",
      "  border:1.5px solid var(--line2,#5a452c);background:transparent;color:inherit;cursor:pointer}",
      ".rs-player button.rs-tbtn.rs-primary{background:var(--acc,#e0b96f);border-color:var(--acc,#e0b96f);",
      "  color:var(--acc-ink,#2a1a08);flex:1}",
      ".rs-player .rs-vol{display:flex;align-items:center;gap:10px;margin-top:10px}",
      ".rs-player .rs-vol input{flex:1;accent-color:var(--acc,#e0b96f);height:30px}",
      ".rs-player .rs-vol .rs-volpct{font-family:var(--mono,monospace);font-size:12px;",
      "  color:var(--ink-dim,#b9a48c);min-width:44px;text-align:right}",
      ".rs-player label.rs-loop{display:inline-flex;align-items:center;gap:7px;color:var(--ink-dim,#b9a48c);",
      "  font-size:13px;cursor:pointer}",
      ".rs-player .rs-loop input{accent-color:var(--acc,#e0b96f);width:20px;height:20px}",
      ".rs-grp{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-faint,#7d6a58);",
      "  margin:16px 4px 6px;font-weight:700}",
      ".rs-mrow{display:flex;align-items:center;gap:11px;width:100%;text-align:left;",
      "  min-height:52px;padding:9px 11px;margin:5px 0;border-radius:13px;cursor:pointer;",
      "  border:1px solid var(--line,#3a2c20);background:var(--panel,#1b1510);color:inherit;",
      "  font:inherit}",
      ".rs-mrow:active{transform:scale(.99)}",
      ".rs-mrow .rs-mtxt{flex:1 1 auto;min-width:0}",
      ".rs-mrow .rs-mtxt b{display:block;font-weight:700;font-size:14.5px}",
      ".rs-mrow .rs-mtxt span{display:block;color:var(--ink-faint,#7d6a58);font-size:12px;",
      "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".rs-mrow .rs-mend{flex:0 0 auto;color:var(--ink-faint,#7d6a58);font-size:16px}",
      ".rs-mrow .rs-chip{flex:0 0 auto;font-size:11px;letter-spacing:.05em;border:1px solid var(--line2,#5a452c);",
      "  border-radius:999px;padding:3px 9px;color:var(--ink-dim,#b9a48c)}",
      ".rs-mrow .rs-chip.on{color:var(--acc,#e0b96f);border-color:var(--acc,#e0b96f)}"
    ].join(""), "rsSheetCss");
  }

  function buildSheet() {
    sheetCss();
    var sheet = doc.createElement("div");
    sheet.id = "rsSheet";
    var rowsHtml = "";
    for (var i = 0; i < ROWS.length; i++) {
      var r = ROWS[i];
      if (r[0] === "grp") { rowsHtml += '<div class="rs-grp">' + r[1] + '</div>'; continue; }
      var chip = (r[3] === "skin" || r[3] === "focus") ? '<span class="rs-chip" id="rsChip_' + r[3] + '">\u2014</span>'
               : '<span class="rs-mend">\u203A</span>';
      rowsHtml += '<button class="rs-mrow" data-act="' + r[3] + '" data-kind="' + r[0] + '">' +
        '<span class="rs-mtxt"><b>' + r[1] + '</b><span>' + r[2] + '</span></span>' + chip + '</button>';
    }
    sheet.innerHTML =
      '<div id="rsGrab" data-rs="grab"><i></i><b>\u25BE</b></div>' +
      '<div id="rsSHead">' +
      '  <span class="rs-brand">Resonance Studio</span>' +
      '  <span class="rs-pill" id="rsVerPill"></span>' +
      '  <span class="rs-pill" id="rsCompatPill"></span>' +
      '</div>' +
      '<div id="rsSScroll">' +
      '  <div class="rs-player">' +
      '    <div class="rs-p-title" id="rsPTitle">Pick a session</div>' +
      '    <div class="rs-p-src" id="rsPSrc"></div>' +
      '    <div class="rs-p-row">' +
      '      <button class="rs-tbtn rs-primary" data-rs="sPlay">\u25B6 Play</button>' +
      '      <button class="rs-tbtn" data-rs="sStop">\u25A0 Stop</button>' +
      '      <span class="rs-p-time" id="rsPTime">0:00 / 0:00</span>' +
      '      <label class="rs-loop"><input type="checkbox" id="rsLoop"> Loop</label>' +
      '    </div>' +
      '    <div class="rs-vol">' +
      '      <span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-faint,#7d6a58)">Vol</span>' +
      '      <input type="range" id="rsVol" min="0" max="1" step="0.01" value="0.7" aria-label="volume">' +
      '      <span class="rs-volpct" id="rsVolPct">\u2014</span>' +
      '    </div>' +
      '  </div>' +
      rowsHtml +
      '</div>';
    doc.body.appendChild(sheet);

    /* --- gesture controller: full-height panel, translated down when closed -------- */
    var y = 0, dragging = false, startY = 0, startOffset = 0;

    function measure() {
      sheetH = sheet.offsetHeight || Math.min(Math.round(window.innerHeight * 0.78), 760);
      if (!SHEET.open) apply(sheetH, false);
    }
    function apply(offset, animate) {
      if (animate === false) sheet.classList.add("rs-drag");
      else sheet.classList.remove("rs-drag");
      sheet.style.transform = "translateY(" + offset + "px)";
      y = offset;
    }
    function setOpen(open, animate) {
      SHEET.open = !!open;
      sheet.classList.toggle("rs-open", SHEET.open);
      apply(SHEET.open ? 0 : sheetH, animate);
      doc.documentElement.classList.toggle("rs-locked", SHEET.open);
      if (SHEET.open) { syncSheet(); refreshChips(); }
    }
    openSheet = function (open) { if (!sheetH) measure(); setOpen(open, true); };

    function onDown(ev) {
      if (!ev.isPrimary) return;
      if (ev.target.closest("button,input")) return;
      dragging = true;
      startY = ev.clientY;
      startOffset = y;
      sheet.classList.add("rs-drag");
    }
    function onMove(ev) {
      if (!dragging) return;
      var dy = ev.clientY - startY;
      var next = Math.min(sheetH, Math.max(0, startOffset + dy));
      apply(next, false);
      ev.preventDefault();
    }
    function onUp(ev) {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("rs-drag");
      var dy = ev.clientY - startY;
      if (Math.abs(dy) < 24 && startOffset === 0) { setOpen(false); return; }   // tap on handle closes
      if (Math.abs(dy) < 24) { setOpen(!SHEET.open); return; }
      setOpen(dy < 0);
    }
    sheet.querySelector("#rsGrab").addEventListener("pointerdown", onDown, { passive: true });
    sheet.querySelector("#rsSHead").addEventListener("pointerdown", onDown, { passive: true });
    doc.addEventListener("pointermove", onMove, { passive: false });
    doc.addEventListener("pointerup", onUp, { passive: true });
    doc.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("resize", measure);

    sheet.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-rs]");
      if (b) {
        var act = b.getAttribute("data-rs");
        if (act === "sPlay") { pageToggle(); pushState(true); return; }
        if (act === "sStop") { pageStop(); pushState(true); return; }
        return;   // grab handled by the gesture code
      }
      var row = ev.target.closest(".rs-mrow");
      if (!row) return;
      var what = row.getAttribute("data-act");
      var kind = row.getAttribute("data-kind");
      if (kind === "jump") { jumpTo(what); return; }
      if (kind === "ext") { native("url", [what]); return; }
      if (what === "skin") { cycleSkin(); return; }
      if (what === "focus") { toggleFocus(); return; }
      if (what === "fs") { openSheet(false); enterFullscreen(); return; }
      if (what === "guide") { openSheet(false); openGuide(); return; }
      if (what === "check") { openSheet(false); openCheck(); return; }
      if (what === "about") { openSheet(false); openAbout(); return; }
      if (what === "upd") {
        toast("Checking for updates\u2026");
        native("checkUpdate", []);
        return;
      }
    });

    var vol = sheet.querySelector("#rsVol");
    vol.addEventListener("input", function () {
      setMaster(parseFloat(vol.value));
      sheet.querySelector("#rsVolPct").textContent = Math.round(parseFloat(vol.value) * 100) + "%";
    });
    var loop = sheet.querySelector("#rsLoop");
    loop.addEventListener("change", function () {
      var el = $id("loop");
      if (el) { el.checked = loop.checked; el.dispatchEvent(new Event("change", { bubbles: true })); }
    });

    measure();
    return sheet;
  }
  var openSheet = function () { };   // replaced once the sheet is built

  function jumpTo(sel) {
    var el = $(sel);
    if (!el) { return; }
    openSheet(false);
    var card = el.closest("section.card") || el;
    try { card.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { card.scrollIntoView(); }
    card.classList.add("rs-jump");
    window.setTimeout(function () { card.classList.remove("rs-jump"); }, 1900);
  }

  function cycleSkin() {
    var sel = $id("skin");
    if (!sel) return;
    var order = ["forge", "nocturne", "paper"];
    var cur = doc.documentElement.getAttribute("data-skin") || "forge";
    var next = order[(order.indexOf(cur) + 1) % order.length];
    sel.value = next;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    refreshChips();
    toast("Skin: " + next);
  }
  function toggleFocus() {
    var b = $id("focusBtn");
    if (b) b.click();
    refreshChips();
  }
  function refreshChips() {
    var skin = doc.documentElement.getAttribute("data-skin") || "forge";
    var c1 = $id("rsChip_skin"); if (c1) c1.textContent = skin;
    var c2 = $id("rsChip_focus");
    if (c2) {
      var on = doc.body.classList.contains("focus");
      c2.textContent = on ? "on" : "off";
      c2.classList.toggle("on", on);
    }
  }

  /* ============================================================== overlays === */
  /* Guide, device check, about and the fullscreen visualizer are one class of thing:
     a fixed layer with a close X; Android's back button closes the topmost one. */

  var overlays = [];

  function overlayCss() {
    injectCss([
      ".rs-ov{position:fixed;inset:0;z-index:85;display:none;flex-direction:column;",
      "  background:var(--bg,#0e0b09);color:var(--ink,#f2e6d8);font:15px/1.55 var(--sans,system-ui)}",
      ".rs-ov.rs-ov-on{display:flex}",
      ".rs-ov .rs-ov-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;",
      "  padding:calc(10px + env(safe-area-inset-top,0px)) 14px 10px;",
      "  border-bottom:1px solid var(--line,#3a2c20)}",
      ".rs-ov .rs-ov-head b{flex:1 1 auto;font-size:16px}",
      ".rs-ov .rs-ov-x{flex:0 0 auto;width:42px;height:42px;border-radius:50%;",
      "  border:1.5px solid var(--line2,#5a452c);background:transparent;color:inherit;",
      "  font-size:17px;cursor:pointer}",
      ".rs-ov .rs-ov-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;",
      "  padding:14px 16px calc(26px + env(safe-area-inset-bottom,0px))}",
      ".rs-ov h4{margin:18px 0 6px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;",
      "  color:var(--acc,#e0b96f)}",
      ".rs-ov h4:first-child{margin-top:0}",
      ".rs-ov p{margin:0 0 10px;color:var(--ink-dim,#b9a48c)}",
      ".rs-ov p b,.rs-ov li b{color:var(--ink,#f2e6d8)}",
      ".rs-ov ul{margin:0 0 10px;padding-left:18px;color:var(--ink-dim,#b9a48c)}",
      ".rs-ov .rs-report{font-family:var(--mono,monospace);font-size:12px;white-space:pre-wrap;",
      "  background:var(--panel,#1b1510);border:1px solid var(--line,#3a2c20);border-radius:10px;",
      "  padding:10px;margin:8px 0;color:var(--ink-dim,#b9a48c)}",
      ".rs-ov .rs-crow{display:flex;gap:10px;align-items:baseline;padding:9px 10px;",
      "  font-size:13px;border-bottom:1px solid var(--line,#3a2c20)}",
      ".rs-ov .rs-crow:last-child{border-bottom:0}",
      ".rs-ov .rs-crow b{flex:0 0 auto;min-width:118px;color:var(--ink,#f2e6d8)}",
      ".rs-ov .rs-crow span{color:var(--ink-dim,#b9a48c)}",
      ".rs-ov .rs-crow i{font-style:normal;font-weight:800}",
      ".rs-ov .rs-crow.ok i{color:var(--good,#93c793)}",
      ".rs-ov .rs-crow.warn i{color:var(--bad,#e0604f)}",
      ".rs-ov button.rs-cta{width:100%;min-height:46px;border-radius:12px;margin:8px 0;",
      "  border:1.5px solid var(--acc,#e0b96f);background:transparent;color:var(--acc,#e0b96f);",
      "  font:inherit;font-weight:700;cursor:pointer}",
      ".rs-ov a{color:var(--acc2,#f2ddb0)}"
    ].join(""), "rsOvCss");
  }

  function buildOverlay(id, title, bodyHtml) {
    overlayCss();
    var ov = doc.createElement("div");
    ov.className = "rs-ov";
    ov.id = id;
    ov.innerHTML =
      '<div class="rs-ov-head"><b>' + title + '</b>' +
      '<button class="rs-ov-x" data-ov-x="' + id + '" aria-label="Close">\u2715</button></div>' +
      '<div class="rs-ov-body">' + bodyHtml + '</div>';
    doc.body.appendChild(ov);
    ov.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-ov-x]")) closeOverlay(ov);
    });
    overlays.push(ov);
    return ov;
  }

  function showOverlay(ov) {
    ov.classList.add("rs-ov-on");
    doc.documentElement.classList.add("rs-locked");
    markBack();
  }
  function closeOverlay(ov, fromPop) {
    ov.classList.remove("rs-ov-on");
    doc.documentElement.classList.toggle("rs-locked", anyOverlayOpen());
    if (!fromPop) unmarkBackTop();
  }
  function anyOverlayOpen() {
    for (var i = 0; i < overlays.length; i++) if (overlays[i].classList.contains("rs-ov-on")) return true;
    return FS.on;
  }

  /* One history entry per opened layer, so Android's back button closes the topmost
     layer first - and only then leaves the app. */
  var backStack = 0;
  function markBack() {
    try { history.pushState({ rsLayer: ++backStack }, ""); } catch (e) { }
  }
  function unmarkBackTop() {
    if (history.state && history.state.rsLayer) { try { history.back(); } catch (e) { } }
  }
  window.addEventListener("popstate", function () {
    var top = null;
    for (var i = overlays.length - 1; i >= 0; i--) {
      if (overlays[i].classList.contains("rs-ov-on")) { top = overlays[i]; break; }
    }
    if (top) { closeOverlay(top, true); return; }
    if (FS.on) { exitFullscreen(true); return; }
  });

  /* ------------------------------------------------------------- quick guide ---- */

  function openGuide() {
    var ov = doc.getElementById("rsGuide");
    if (!ov) {
      ov = buildOverlay("rsGuide", "Quick guide",
        '<h4>What this is</h4>' +
        '<p>A tone, beat and noise studio that runs entirely on this device. Everything is ' +
        'synthesised live \u2014 nothing streams, nothing is uploaded, there is no account. ' +
        'The built-in sessions are ready to play; everything about them can be changed.</p>' +
        '<h4>Start here</h4>' +
        '<ul>' +
        '<li><b>Sessions</b> \u2014 tap one (search "sleep", "focus", "speaker", "7.83").</li>' +
        '<li><b>Play</b> \u2014 the round button in the bar below. The bar follows you everywhere.</li>' +
        '<li><b>Stop</b> rewinds; <b>Pause</b> keeps your place.</li>' +
        '</ul>' +
        '<h4>Headphones or speakers?</h4>' +
        '<p><b>Binaural pair</b> sessions need headphones \u2014 the beat is created in your ' +
        'hearing, not in the file. The <b>Speakers</b> pack and the isochronic pulses work on ' +
        'any loudspeaker, and nothing in them depends on a difference between your ears. The ' +
        '"What you hear" panel says which you are holding.</p>' +
        '<h4>The visualizer</h4>' +
        '<p>Tap any visual panel \u2014 or the \u25D0 button in the bar \u2014 and it fills the ' +
        'screen, with a small play/pause at the bottom. Tap the picture to hide those controls, ' +
        'X or the back button to return. The panels are capped well below the flashing ' +
        'thresholds, and can be switched off in Visualizer settings.</p>' +
        '<h4>Make it yours</h4>' +
        '<ul>' +
        '<li><b>Quick picks</b> adds one layer to the current sound.</li>' +
        '<li><b>Voices &amp; entries</b> edits each layer\u2019s schedule: every entry ramps into ' +
        'the next one\u2019s values, and the last wraps around to the first.</li>' +
        '<li><b>Files &amp; export</b> saves .gnaural files, exports WAV audio, and copies a ' +
        'share link that opens the same schedule on moddys.net.</li>' +
        '</ul>' +
        '<h4>Your files</h4>' +
        '<p><b>Open .gnaural</b> and <b>Add pack (.zip)</b> import from anywhere on the phone. ' +
        '<b>Save .gnaural</b>, <b>Export WAV</b> and <b>Pack downloads</b> all write to ' +
        '<b>Downloads/Resonance Studio</b>. Everything works offline.</p>' +
        '<h4>Timer, pacer, mute</h4>' +
        '<p><b>Live tools</b> has a session timer (stop after N minutes), a breathing pacer ' +
        'that follows the sound, and Mute \u2014 which stops everything instantly.</p>' +
        '<h4>While the screen is off</h4>' +
        '<p>Leave the app or lock the screen and the session keeps going; the notification has ' +
        'pause and stop. Swiping the app away ends the session.</p>' +
        '<h4>Skins</h4>' +
        '<p><b>Forge</b> (warm), <b>nocturne</b> (cool), <b>paper</b> (light) \u2014 from the menu.</p>' +
        '<h4>Care</h4>' +
        '<p>Keep volumes moderate \u2014 a pulse train is more alerting than a steady tone at the ' +
        'same level, and if you have to raise your voice to be heard at arm\u2019s length it is ' +
        'too loud. If you have epilepsy or a seizure disorder, ask a clinician before using ' +
        'repetitive pulsed tones. Skip it while driving or operating machinery, and stop if it ' +
        'feels unpleasant. <b>Not a medical device or treatment.</b></p>' +
        '<h4>Offline</h4>' +
        '<p>The whole studio is inside the app. Only the update check and the full help pages ' +
        'touch the network.</p>');
    }
    showOverlay(ov);
  }

  /* ------------------------------------------------------------ device check ---- */

  var DEV = {};
  function deviceFacts() {
    if (DEV.raw) return DEV;
    var raw = native("device", []);
    try { DEV = raw ? JSON.parse(raw) : {}; } catch (e) { DEV = {}; }
    DEV.raw = true;
    return DEV;
  }

  function audioPathText() {
    var m = pState() ? (pState().mode || "") : "";
    if (m === "worklet") return "AudioWorklet \u2014 full quality";
    if (m === "spn") return "Script fallback \u2014 reduced efficiency";
    return m ? m : "not started yet";
  }

  function checkReport() {
    var d = deviceFacts();
    var c = d.compat || {};
    var lines = [
      APP_NAME + " " + (d.app || "?") + " (Android)",
      "Device: " + (d.manufacturer || "?") + " " + (d.model || "?"),
      "Android: " + (d.release || "?") + " (API " + (d.api || "?") + ")",
      "WebView: " + (d.webview || "?"),
      "Audio path: " + audioPathText(),
      "Notifications: " + (d.notifications ? "granted" : "not granted"),
      "Compatibility: " + (c.system || "?") + " \u2014 " +
        (c.supported ? (c.recommended ? "supported" : "supported, older than tuned-for") : "NOT supported")
    ];
    return lines.join("\n");
  }

  function checkRows() {
    var d = deviceFacts();
    var c = d.compat || {};
    var rows = [];
    function row(ok, label, detail) { rows.push({ ok: ok, label: label, detail: detail }); }
    row(true, "Device", (d.manufacturer || "?") + " " + (d.model || "?"));

    var api = d.api || 0;
    row(api >= 30, "Android", (d.release || "?") + " (API " + api + ")" +
      (api >= 30 ? "" : " \u2014 tuned for Android 11+; this release runs, with rough edges"));

    row(true, "Engine", d.webview || "unknown");

    var mode = pState() ? (pState().mode || "") : "";
    row(mode !== "spn", "Audio path", audioPathText());

    row(!!d.notifications, "Notifications", d.notifications
      ? "granted \u2014 the lock screen can pause and stop"
      : "not granted \u2014 background play still works, the notification does not show");

    var body = '<div class="rs-report" style="border:0;padding:0;background:transparent"></div>';
    body = "";
    for (var i = 0; i < rows.length; i++) {
      body += '<div class="rs-crow ' + (rows[i].ok ? "ok" : "warn") + '">' +
        '<i>' + (rows[i].ok ? "\u2713" : "!") + '</i><b>' + rows[i].label + '</b>' +
        '<span>' + rows[i].detail + '</span></div>';
    }
    body += '<button class="rs-cta" id="rsCopyReport">\u29C9 Copy report</button>';
    body += '<p style="font-size:12.5px">The report is plain text \u2014 paste it anywhere to ' +
            'describe exactly what this device reports.</p>';
    return body;
  }

  function openCheck() {
    var ov = doc.getElementById("rsCheck");
    if (!ov) ov = buildOverlay("rsCheck", "Check device", "<div id='rsCheckBody'></div>");
    var body = ov.querySelector("#rsCheckBody");
    body.innerHTML = checkRows();
    var copy = body.querySelector("#rsCopyReport");
    if (copy) copy.addEventListener("click", function () {
      var ok = native("copy", [checkReport()]);
      copy.textContent = ok ? "\u2713 Copied" : "\u2715 Copy failed";
      window.setTimeout(function () { copy.innerHTML = "\u29C9 Copy report"; }, 2000);
    });
    showOverlay(ov);
  }

  function openAbout() {
    var ov = doc.getElementById("rsAbout");
    if (!ov) {
      var d = deviceFacts();
      ov = buildOverlay("rsAbout", "About Resonance Studio",
        '<h4>' + APP_NAME + ' <span style="color:var(--ink-faint,#7d6a58);font-size:13px">v' +
        (d.app || "?") + ' \u00B7 Android</span></h4>' +
        '<p>The mobile home of <b>Gnaural Web</b>, bundled from <b>moddys.net/resonance</b> \u2014 ' +
        'binaural and monaural beats, isochronic pulses and noise beds, with the full session ' +
        'library, schedule editor and visualizers built in. Everything is synthesised on this ' +
        'device; nothing streams and nothing is collected.</p>' +
        '<h4>Licences</h4>' +
        '<p><b>Gnaural Web</b> is a browser re-implementation of Gnaural\u2019s scheduling engine ' +
        'and .gnaural format. Gnaural is \u00A9 Bret Logan and contributors: the upstream engine is ' +
        'LGPL-2.1-or-later and this port keeps those terms; the rest of the app is GPL-2.0-or-later. ' +
        'The full texts ship inside the app (app/COPYING, app/COPYING.LESSER) and on the site. ' +
        'Not affiliated with the upstream project, the Monroe Institute or any other programme.</p>' +
        '<h4>More</h4>' +
        '<button class="rs-cta" data-about-ext="https://moddys.net/resonance/help/">Full help on moddys.net</button>' +
        '<button class="rs-cta" data-about-ext="https://moddys.net/resonance/credits/">Credits &amp; licence</button>' +
        '<button class="rs-cta" id="rsAboutUpd">Check for updates</button>');
      ov.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-about-ext]");
        if (b) { native("url", [b.getAttribute("data-about-ext")]); return; }
        if (ev.target.closest("#rsAboutUpd")) { toast("Checking for updates\u2026"); native("checkUpdate", []); }
      });
    }
    showOverlay(ov);
  }

  /* ======================================================= fullscreen viz === */
  /* The active visual panel is MOVED (never copied) into a fullscreen layer, so the
     page's own visualizer code keeps drawing into it. A resize event makes the viz
     system re-fit its canvas to the new box - the same path it uses when a phone
     rotates. */

  var FS = { on: false, host: null, home: null, homeNext: null };

  function fsCss() {
    injectCss([
      "#rsFs{position:fixed;inset:0;z-index:90;background:#000;display:none}",
      "html.rs-fs #rsFs{display:block}",
      "html.rs-fs #rsBar{display:none}",
      "html.rs-fs #rsSheet{display:none}",
      "#rsFsStage{position:absolute;inset:0;overflow:hidden}",
      "html.rs-fs .rs-fs-host{position:absolute !important;inset:0 !important;width:100% !important;",
      "  height:100% !important;margin:0 !important;padding:0 !important;border:0 !important;",
      "  border-radius:0 !important;background:transparent !important;box-shadow:none !important;",
      "  min-height:0 !important}",
      "html.rs-fs .rs-fs-host h3{display:none !important}",
      "html.rs-fs .rs-fs-host .viz-canvas{width:100% !important;height:100% !important;",
      "  max-width:none !important;border-radius:0 !important}",
      "#rsFsTop{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));left:14px;right:12px;",
      "  display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.72);",
      "  font:13px/1.3 var(--sans,system-ui);pointer-events:none;transition:opacity .25s;z-index:2}",
      "#rsFsTop .rs-fs-title{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;",
      "  text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.8)}",
      "#rsFsTop button{pointer-events:auto;width:42px;height:42px;border-radius:50%;",
      "  border:1px solid rgba(255,255,255,.28);background:rgba(20,17,13,.42);color:#fff;",
      "  font-size:17px;cursor:pointer;backdrop-filter:blur(6px)}",
      "#rsFsCtl{position:absolute;left:0;right:0;bottom:calc(16px + env(safe-area-inset-bottom,0px));",
      "  display:flex;justify-content:center;align-items:center;gap:16px;z-index:2;",
      "  pointer-events:none;transition:opacity .25s}",
      "#rsFsCtl button{pointer-events:auto;border-radius:50%;border:1px solid rgba(255,255,255,.28);",
      "  background:rgba(20,17,13,.42);color:#fff;backdrop-filter:blur(6px);cursor:pointer}",
      "#rsFsCtl .rs-fs-play{width:54px;height:54px;font-size:20px}",
      "#rsFsCtl .rs-fs-stop{width:42px;height:42px;font-size:14px}",
      /* the visualizer's own status badge ("paused", "x1 slowed") rises above the
         controls instead of hiding behind them */
      "html.rs-fs .rs-fs-host .viz-badge{bottom:calc(86px + env(safe-area-inset-bottom,0px)) !important;opacity:.6}",
      "html.rs-fs-hide #rsFsTop,html.rs-fs-hide #rsFsCtl{opacity:0}",
      "html.rs-fs-hide #rsFsCtl button,html.rs-fs-hide #rsFsTop button{pointer-events:none}"
    ].join(""), "rsFsCss");
  }

  function buildFs() {
    fsCss();
    var fs = doc.createElement("div");
    fs.id = "rsFs";
    fs.innerHTML =
      '<div id="rsFsStage" data-rs="fsStage"></div>' +
      '<div id="rsFsTop"><span class="rs-fs-title" id="rsFsTitle"></span>' +
      '<button data-rs="fsExit" aria-label="Close the visualizer">\u2715</button></div>' +
      '<div id="rsFsCtl">' +
      '<button class="rs-fs-play" data-rs="fsPlay" aria-label="Play or pause">\u25B6</button>' +
      '<button class="rs-fs-stop" data-rs="fsStop" aria-label="Stop">\u25A0</button>' +
      '</div>';
    doc.body.appendChild(fs);
    fs.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-rs]");
      if (b) {
        var act = b.getAttribute("data-rs");
        if (act === "fsExit") { exitFullscreen(false); return; }
        if (act === "fsPlay") { pageToggle(); pushState(true); return; }
        if (act === "fsStop") { pageStop(); pushState(true); return; }
        if (act === "fsStage") {
          doc.documentElement.classList.toggle("rs-fs-hide");
          return;
        }
      }
    });
    return fs;
  }

  function enterFullscreen() {
    if (FS.on) return;
    var cv = doc.querySelector("[data-viz-panel]");
    var viz = window.ResonanceViz && window.ResonanceViz.api;
    if (!cv) { toast("The visualizer is still starting \u2014 try again in a moment."); return; }
    if (viz) { try { if (!viz.getPrefs().on) viz.enable(true); } catch (e) { } }
    var host = cv.classList && cv.classList.contains("viz-flank")
      ? cv : (cv.closest(".viz-inline") || cv.parentElement);
    if (!host) return;
    var fs = doc.getElementById("rsFs") || buildFs();
    FS.host = host; FS.home = host.parentNode; FS.homeNext = host.nextSibling;
    fs.querySelector("#rsFsStage").appendChild(host);
    host.classList.add("rs-fs-host");
    doc.documentElement.classList.add("rs-fs");
    doc.documentElement.classList.remove("rs-fs-hide");
    FS.on = true;
    markBack();
    try { window.dispatchEvent(new Event("resize")); } catch (e) { }
    syncFs();
  }

  function exitFullscreen(fromPop) {
    if (!FS.on) return;
    FS.on = false;
    var fs = doc.getElementById("rsFs");
    if (FS.host && FS.home) {
      var next = (FS.homeNext && FS.homeNext.parentNode === FS.home) ? FS.homeNext : null;
      try { FS.home.insertBefore(FS.host, next); } catch (e) { }
    }
    if (FS.host) FS.host.classList.remove("rs-fs-host");
    doc.documentElement.classList.remove("rs-fs");
    doc.documentElement.classList.remove("rs-fs-hide");
    if (fs) fs.style.display = "";
    doc.documentElement.classList.toggle("rs-locked", anyOverlayOpen());
    if (!fromPop) unmarkBackTop();
    try { window.dispatchEvent(new Event("resize")); } catch (e) { }
    FS.host = null; FS.home = null; FS.homeNext = null;
  }

  function syncFs() {
    var p = $id("rsFsTitle");
    if (p) p.textContent = sessionTitle() || APP_NAME;
    var fs = doc.getElementById("rsFs");
    if (!fs) return;
    var play = fs.querySelector('[data-rs="fsPlay"]');
    if (play) play.textContent = isPlaying() ? "\u275A\u275A" : "\u25B6";
  }

  /* ============================================================== downloads === */
  /* The page saves through blob: URLs, which a WebView cannot download itself. The
     shell reads the blob and streams it to the native side in chunks, so exports of
     any length (a 20-minute WAV is ~200 MB) land in Downloads/Resonance Studio. */

  function mimeOf(name) {
    if (/\.wav$/i.test(name)) return "audio/wav";
    if (/\.gnaural$/i.test(name)) return "application/xml";
    if (/\.zip$/i.test(name)) return "application/zip";
    return "application/octet-stream";
  }

  function b64(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 32768) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 32768, bytes.length)));
    }
    return btoa(s);
  }

  function saveBlob(href, name) {
    var reader = null, started = false, failed = false;
    var buf = [], buflen = 0, done = 0, total = 0;

    function send() {
      var chunk = new Uint8Array(buflen), off = 0;
      for (var i = 0; i < buf.length; i++) { chunk.set(buf[i], off); off += buf[i].length; }
      buf = []; buflen = 0;
      if (!started) {
        if (!native("fileStart", [name, mimeOf(name)])) { failed = true; return false; }
        started = true;
      }
      if (chunk.length && !native("fileChunk", [b64(chunk)])) { failed = true; return false; }
      if (total > 3 * 1024 * 1024) {
        toast("Saving " + name + "\u2026 " + Math.round(done / 1048576) + " MB");
      }
      return true;
    }
    function step() {
      reader.read().then(function (r) {
        if (failed) return;
        if (r.done) {
          if (!send()) { toast("Could not save " + name); return; }
          var res = native("fileEnd", []);
          if (res && String(res).indexOf("ok:") === 0) toast("Saved to " + String(res).substring(3));
          else toast("Could not save " + name + (res ? " \u2014 " + String(res).replace(/^err:/, "") : ""));
          return;
        }
        done += r.value.length;
        buf.push(r.value); buflen += r.value.length;
        if (buflen >= 512 * 1024 && !send()) { toast("Could not save " + name); return; }
        step();
      }).catch(function () {
        toast("Could not save " + name);
      });
    }
    fetch(href).then(function (res) {
      if (!res.ok || !res.body) throw new Error("blob read failed");
      var cl = res.headers.get("Content-Length");
      total = cl ? parseInt(cl, 10) : 0;
      toast("Saving " + name + "\u2026");
      reader = res.body.getReader();
      step();
    }).catch(function () {
      toast("Could not save " + name);
    });
  }

  function savePack(a, name) {
    var path = "";
    try { path = new URL(a.href, location.href).pathname; } catch (e) { path = a.getAttribute("href") || ""; }
    var i = path.indexOf("/app/");
    var asset = i >= 0 ? ("www" + path.substring(i)) : ("www/app/" + path.replace(/^\.?\//, ""));
    var res = native("saveAsset", [asset, name]);
    if (res && String(res).indexOf("ok:") === 0) toast("Saved to " + String(res).substring(3));
    else toast("Could not save " + name);
  }

  function downloadClicks() {
    doc.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      var abs = a.href || href;
      var name = a.getAttribute("download") || "";
      if (/^blob:/i.test(abs)) {
        ev.preventDefault(); ev.stopPropagation();
        saveBlob(abs, name || "resonance-file");
        return;
      }
      if (/\.zip($|[?#])/i.test(href) && /pack\//.test(abs)) {
        ev.preventDefault(); ev.stopPropagation();
        savePack(a, name || (href.split("/").pop() || "pack.zip"));
        return;
      }
    }, true);
  }

  /* -------------------------------------------------------------------- copy ---- */

  function patchClipboard() {
    try {
      var clip = navigator.clipboard;
      if (!clip || !clip.writeText) return;
      var orig = clip.writeText.bind(clip);
      clip.writeText = function (t) {
        var out = String(t == null ? "" : t);
        /* The share link is built against the page's own origin; inside the app that is the
           private asset origin, and in the harness a 127.0.0.1 one. The link is the one
           thing that leaves the app, so rewrite any local address to the real site. */
        var here = location.origin + location.pathname;
        out = out.split(here).join(SITE_BASE);
        out = out.split(location.origin + "/app/").join(SITE_BASE);
        out = out.split("https://appassets.androidplatform.net/app/").join(SITE_BASE);
        var ok = native("copy", [out]);
        if (ok) return Promise.resolve();
        return orig(out);
      };
    } catch (e) { report("clipboard patch: " + e); }
  }

  /* ------------------------------------------------------------------ links ---- */
  /* This app is one page. Relative links (help/, credits/, NOTICE.txt) and external
     ones belong in the phone's browser - resolved against the real site, not the app's
     private origin - so the player is never navigated away from. */

  function externalLinks() {
    var realOpen = window.open;
    window.open = function (url) {
      var u = String(url || "");
      if (/^https?:/i.test(u)) { native("url", [u]); return null; }
      return realOpen ? realOpen.apply(window, arguments) : null;
    };
    doc.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#") return;
      if (a.hasAttribute("download")) return;             // save handlers own those
      if (/^blob:|^data:|^mailto:|^tel:/i.test(href)) return;
      if (/\.zip($|[?#])/i.test(href)) return;            // pack zips: saved by the shell
      var absolute;
      if (/^https?:/i.test(href)) absolute = href;
      else {
        try { absolute = new URL(href, SITE_BASE).href; } catch (e) { return; }
      }
      if (absolute.indexOf("appassets.androidplatform.net") !== -1) return;
      ev.preventDefault(); ev.stopPropagation();
      report("link handed to the shell: " + absolute);
      native("url", [absolute]);
    }, true);
  }

  /* -------------------------------------------------------------- keyboard ---- */

  function wireSearchKeyboard() {
    var q = $id("search");
    if (!q) return;
    function commit() {
      try { q.blur(); } catch (e) { }
      native("dismissKeyboard", []);
    }
    q.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "Go" || e.keyCode === 13) commit();
    });
    q.addEventListener("search", commit);
  }

  /* =============================================================== update strip === */

  var UPD = { state: "unknown", latest: null };
  var updEl = null;

  function updStyle() {
    injectCss(
      "#rsUpd{position:fixed;left:0;right:0;top:0;z-index:95;display:flex;gap:9px;align-items:center;" +
      "padding:calc(9px + env(safe-area-inset-top,0px)) 13px 9px;" +
      "background:color-mix(in srgb, var(--panel2,#241c15) 97%, transparent);" +
      "border-bottom:1px solid var(--acc,#e0b96f);color:var(--ink,#f2e6d8);" +
      "box-shadow:0 8px 22px rgba(0,0,0,.45);" +
      "font:13px/1.35 var(--sans,system-ui)}" +
      "#rsUpd .rs-upd-t{flex:1 1 auto;min-width:0}" +
      "#rsUpd b{color:var(--acc,#e0b96f)}" +
      "#rsUpd .rs-upd-n{display:block;opacity:.8;font-size:12px}" +
      "#rsUpd button{flex:0 0 auto;min-height:40px;border:1.5px solid var(--acc,#e0b96f);" +
      "background:var(--acc,#e0b96f);color:var(--acc-ink,#2a1a08);font-weight:700;" +
      "border-radius:10px;padding:8px 13px;font:inherit;cursor:pointer}" +
      "#rsUpd button.rs-alt{background:transparent;color:var(--ink-dim,#b9a48c);border-color:var(--line2,#5a452c)}" +
      "#rsUpd button:disabled{opacity:.6}", "rsUpdCss");
  }

  function updShow() {
    updStyle();
    if (!updEl) {
      updEl = doc.createElement("div");
      updEl.id = "rsUpd";
      updEl.innerHTML = '<div class="rs-upd-t"></div>' +
        '<button data-rs-upd="go"></button>' +
        '<button class="rs-alt" data-rs-upd="later">Later</button>';
      updEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-rs-upd]");
        if (!b) return;
        if (b.getAttribute("data-rs-upd") === "later") { updEl.style.display = "none"; return; }
        b.disabled = true;
        native("updateApp", [UPD.latest.url, UPD.latest.version, UPD.latest.sha256]);
        b.textContent = "Downloading\u2026";
        var note = updEl.querySelector(".rs-upd-n");
        if (note) note.textContent = "Android will ask to install it when the download finishes.";
      });
      doc.body.appendChild(updEl);
    }
    var d = deviceFacts();
    updEl.querySelector(".rs-upd-t").innerHTML =
      "<b>Version " + esc(UPD.latest.version) + " is available</b>" +
      "<span class=\"rs-upd-n\">You are on " + esc(d.app || "an older build") +
      ". Updating installs over this one; sessions you saved stay.</span>";
    var go = updEl.querySelector('[data-rs-upd="go"]');
    go.textContent = "Update now";
    go.disabled = false;
    updEl.style.display = "";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  window.__rsUpdate = {
    available: function (info) {
      UPD.latest = info || {}; UPD.state = "available";
      try { updShow(); } catch (e) { }
      return UPD.state;
    },
    none: function (latest) {
      UPD.state = "current"; UPD.latest = latest ? { version: latest } : null;
      return UPD.state;
    },
    failed: function (why) {
      UPD.state = "failed"; UPD.why = String(why || "");
      return UPD.state;
    },
    state: function () { return { state: UPD.state, latest: UPD.latest }; }
  };

  /* =================================================================== tick === */

  var lastTitle = null;

  function syncBar() {
    var title = $id("rsTitle"), sub = $id("rsSub");
    var playing = isPlaying();
    var sess = sessionTitle() || "Pick a session";
    if (title && title.textContent !== sess) title.textContent = sess;
    var src = text($id("nowsrc"));
    var clk = clockText();
    var s2 = (src ? src : "\u2014") + (clk ? "  \u00B7  " + clk : "");
    if (sub && sub.textContent !== s2) sub.textContent = s2;
    var p = barEl ? barEl.querySelector('[data-rs="play"]') : null;
    var glyph = playing ? "\u275A\u275A" : "\u25B6";
    if (p && p.textContent !== glyph) p.textContent = glyph;
    if (doc.title.indexOf(APP_NAME) === -1 && sess !== "Pick a session") {
      doc.title = sess + " \u2014 " + APP_NAME;
    }
  }

  function syncSheet() {
    if (!sheetEl || !SHEET.open) return;
    var t = sheetEl.querySelector("#rsPTitle");
    var src = sheetEl.querySelector("#rsPSrc");
    var ti = sheetEl.querySelector("#rsPTime");
    var sess = sessionTitle() || "(untitled)";
    if (t && t.textContent !== sess) t.textContent = sess;
    var stx = text($id("nowsrc")) + (modeText() ? "  \u00B7  " + modeText() : "");
    if (src && src.textContent !== stx) src.textContent = stx;
    if (ti && ti.textContent !== clockText()) ti.textContent = clockText() || "0:00 / 0:00";
    var play = sheetEl.querySelector('[data-rs="sPlay"]');
    if (play) {
      var label = isPlaying() ? "\u275A\u275A Pause" : "\u25B6 Play";
      if (play.textContent !== label) play.textContent = label;
    }
    var vol = sheetEl.querySelector("#rsVol");
    var v = masterNow();
    if (vol && parseFloat(vol.value) !== v) vol.value = String(v);
    var pct = sheetEl.querySelector("#rsVolPct");
    if (pct) pct.textContent = Math.round(v * 100) + "%";
    var loop = sheetEl.querySelector("#rsLoop");
    var lel = $id("loop");
    if (loop && lel && loop.checked !== lel.checked) loop.checked = lel.checked;
    refreshChips();
  }

  function syncHdrPills() {
    var d = deviceFacts();
    var v = doc.getElementById("rsVerPill");
    if (v && !v.textContent) v.textContent = "v" + (d.app || "?");
    var c = doc.getElementById("rsCompatPill");
    if (c && !c.textContent && d.compat) {
      if (!d.compat.supported) { c.textContent = "unsupported device"; c.classList.add("warn"); }
      else if (!d.compat.recommended) { c.textContent = "older than tuned-for"; c.classList.add("warn"); }
      else { c.textContent = "device ok"; c.classList.add("ok"); }
    }
  }

  function tick() {
    syncBar();
    syncSheet();
    syncFs();
    pushState(false);
  }

  /* =================================================================== boot === */

  function markAsApp() {
    try { doc.documentElement.classList.add("rs-app"); } catch (e) { }
  }

  markAsApp();
  appCss();
  patchClipboard();
  externalLinks();
  downloadClicks();

  var bootTries = 0;
  function boot() {
    if (!pageReady()) {
      if (++bootTries <= 60) { window.setTimeout(boot, 250); return; }
      report("shim: the page never became ready - player bar not built");
      return;
    }
    barEl = buildBar();
    sheetEl = buildSheet();
    measureFirstOpen();
    deviceFacts();
    syncHdrPills();
    wireSearchKeyboard();
    window.setInterval(tick, 1000);
    tick();
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden) tick(); });
    window.addEventListener("beforeunload", function () {
      native("state", [false, "", ""]);
    });
    report("shim ready | session=" + (sessionTitle() || "none"));
  }

  function measureFirstOpen() {
    /* The sheet measures itself when first opened; until then it rests closed. */
    if (sheetEl) { try { sheetEl.style.transform = "translateY(calc(100% + 30px))"; } catch (e) { } }
  }

  /* Tapping a visual panel goes fullscreen - the panel is the button. */
  doc.addEventListener("click", function (ev) {
    if (FS.on) return;
    var host = ev.target && ev.target.closest ? ev.target.closest("[data-viz-host]") : null;
    if (!host) return;
    if (ev.target.closest("button,input,a")) return;
    enterFullscreen();
  }, true);

  boot();

  /* The shell drives playback through these; keep the names stable. */
  window.__rs = {
    play: function () { pagePlay(); pushState(true); },
    pause: function () { pagePause(); pushState(true); },
    stop: function () { pageStop(); pushState(true); },
    toggle: function () { if (isPlaying()) pagePause(); else pagePlay(); pushState(true); },
    info: info,
    sheet: function () { return SHEET; },
    menu: function () { openSheet(true); return true; },
    fullscreen: function () { openSheet(false); enterFullscreen(); },
    fullscreenExit: function () { exitFullscreen(false); },
    guide: function () { openGuide(); },
    check: function () { openCheck(); },
    checkReport: checkReport,
    about: function () { openAbout(); },
    /* From the launch compatibility notice: open the check panel directly. */
    compat: function () { openSheet(true); openCheck(); },
    update: window.__rsUpdate,
    viz: function () { enterFullscreen(); }
  };
})();
