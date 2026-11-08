/* Platform shell for Resonance Studio (Android) — 2.0.
 *
 * The web app is the source of truth and is not forked. This file is the only new
 * front-end code: it turns the desktop studio into a phone application.
 *
 *   1. A real app shell: five destinations (Home, Sessions, Studio, Visualise, Settings)
 *      in a Material 3 bottom navigation, a large-title app bar, and a mini player that
 *      follows you. The page's own desktop header is hidden; its controls stay live and
 *      are what the shell drives.
 *   2. The page's own cards are MOVED into the screens - never copied - so the page's
 *      renderers keep painting into the same nodes. Every action goes through
 *      window.__gnauralAPI; every fact comes from the page's own DOM/state.
 *   3. A VISUALISE section bound to the session: the Cymatic Chamber resolves the
 *      session's own carrier onto its mode ladder and breathes at its beat; the screen
 *      picks a medium from the voice type and the beat band and prints the mapping.
 *   4. File work a phone cannot do by itself: .gnaural/.zip import through the system
 *      picker, and every save (pack zips, .gnaural, WAV exports of any length) streamed
 *      to Downloads/Resonance Studio by the shell.
 *   5. Playback state reported to the native service, so sessions keep going with the
 *      screen off and the lock screen has pause/stop - driven in the service itself.
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
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };

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
  function setMaster(v) {
    v = Math.max(0, Math.min(1, isFinite(v) ? v : 0.7));
    var done = false, a = api();
    if (a) { try { a.setMaster(v); done = true; } catch (e) { } }
    if (!done) { var m = $id("master"); if (m) { m.value = String(v); m.dispatchEvent(new Event("input", { bubbles: true })); } }
    if (v > 0.001) MUTEV = v;
    paintLevel(v);
  }
  /* The level has three faces - the home fader, the mini player's fader and the mute
     toggles - and every one of them paints from this single function, so a change made
     on any screen is already correct on the others before the next tick lands. */
  var MUTEV = 0.7;
  function paintLevel(v) {
    var off = !(v > 0.001);
    var a = $id("rsVol"), b = $id("rsMiniVol"), p = $id("rsVolPct");
    var more = [$id("rsCymVol"), $id("rsFsVol"), $id("rsStuVol")];
    if (a && Math.abs(parseFloat(a.value) - v) > 0.004) a.value = String(v);
    if (b && Math.abs(parseFloat(b.value) - v) > 0.004) b.value = String(v);
    var pct = Math.round(v * 100) + "%";
    more.forEach(function (el) {
      if (!el) return;
      if (Math.abs(parseFloat(el.value) - v) > 0.004) el.value = String(v);
      if (el.getAttribute("aria-valuetext") !== pct) el.setAttribute("aria-valuetext", pct);
    });
    if (p && p.textContent !== pct) p.textContent = pct;
    ["rsMute", "rsMiniMute"].forEach(function (id) {
      var el = $id(id);
      if (!el) return;
      var want = off ? "true" : "false";
      if (el.getAttribute("aria-pressed") !== want) {
        el.setAttribute("aria-pressed", want);
        el.innerHTML = svgFill(off ? "voloff" : "vol");
      }
    });
  }
  /* Mute remembers the level it silenced, so the second tap is a restore and not a guess. */
  function toggleMute() {
    var v = masterNow();
    if (v > 0.001) { MUTEV = v; setMaster(0); } else setMaster(MUTEV || 0.7);
    try { pushState(true); } catch (e) { }
  }
  /* Short messages go to the shell's own Toast. The page's API has no toast method, so the
     old code threw here and every message fell through to a logcat line, invisible. Off the
     phone, fall back to the page's own toast element, then to the log. */
  function toast(t) {
    var s = String(t);
    try { if (host && typeof host.toast === "function") { host.toast(s); return; } } catch (e) { }
    var el = $id("toast");
    if (el) {
      el.textContent = s; el.classList.add("show");
      window.clearTimeout(toast._t);
      toast._t = window.setTimeout(function () { el.classList.remove("show"); }, 2600);
      return;
    }
    report(s);
  }

  function pageReady() { return !!(api() && $id("plist")); }

  /* Window insets come from the shell (env() is 0 on older WebViews). */
  var lastInsets = "";
  function applyInsets() {
    var ins = window.__rsInsets;
    if (!ins || (ins.t + "|" + ins.b) === lastInsets) return;
    lastInsets = ins.t + "|" + ins.b;
    var root = doc.documentElement.style;
    root.setProperty("--rs-safe-t", (ins.t || 0) + "px");
    root.setProperty("--rs-safe-b", (ins.b || 0) + "px");
    try { window.dispatchEvent(new Event("resize")); } catch (e) { }
  }
  window.__rsApplyInsets = applyInsets;

  function injectCss(css, id) {
    if (id && doc.getElementById(id)) return;
    var s = doc.createElement("style");
    if (id) s.id = id;
    s.textContent = css;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ================================================================== theme === */

  var THEME_KEY = "resonance.app.theme.v1";
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(THEME_KEY) || "{}") || {}; } catch (e) { prefs = {}; }
  function savePrefs() { try { localStorage.setItem(THEME_KEY, JSON.stringify(prefs)); } catch (e) { } }

  function systemPalette() {
    try {
      var raw = native("palette", []);
      if (!raw) return null;
      var p = typeof raw === "string" ? JSON.parse(raw) : raw;
      return (p && p.primary) ? p : null;
    } catch (e) { return null; }
  }

  function applyTheme() {
    /* One look, by owner decision: the app is dark, always. System and Light were removed —
       they read badly against the shell's own warm surfaces — and a stored light preference
       from an older build is rewritten here, so an update cannot boot into a half-themed screen. */
    var html = doc.documentElement;
    if (prefs.theme !== "dark") { prefs.theme = "dark"; savePrefs(); }
    html.setAttribute("data-rs-theme", "dark");
    /* the page's own canvases and skin tokens follow the app theme */
    var skin = $id("skin");
    if (skin && skin.value !== "forge") {
      skin.value = "forge";
      try { skin.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { }
    }
    native("chrome", [false]);          /* always the dark chrome */
    var chosen = prefs.theme2 || "calm";
    if (chosen === "calm") html.removeAttribute("data-rs-accent");
    else html.setAttribute("data-rs-accent", chosen);
    var pal = prefs.accent === "system" ? systemPalette() : null;
    var root = html.style;
    var map = { primary: "--rs-pri", onPrimary: "--rs-on-pri", container: "--rs-pri-c",
                onContainer: "--rs-on-pri-c" };
    var k;
    for (k in map) root.removeProperty(map[k]);
    if (pal) for (k in map) if (pal[k]) root.setProperty(map[k], pal[k]);
    /* the graph canvas is drawn by the page with skin tokens; a theme swap leaves the
       old palette baked in until the next edit, so redraw it */
    try { var A = api(); if (A && A.drawGraph) window.setTimeout(A.drawGraph, 60); } catch (e) { }
  }

  /* the art layer: "full" wears the vintage face, "minimal" keeps the plain controls */
  function applyUi() {
    var m = prefs.ui === "minimal" ? "minimal" : "full";
    doc.documentElement.setAttribute("data-rs-ui", m);
    $$("#rsUi button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-u") === m ? "true" : "false");
    });
  }

  /* ==================================================================== css === */

  var SAFE_T = "var(--rs-safe-t,env(safe-area-inset-top,0px))";
  var SAFE_B = "var(--rs-safe-b,env(safe-area-inset-bottom,0px))";

  var CSS = [
    /* ---------------------------------------------------------------- tokens --- */
    "html[data-rs-theme]{",
    /* surfaces are the tablet's warm brushed plate, not the old green-grey: the same
       brown/silver family the full-screen plate and the brass keys are cut from, so a
       phone screen and a tablet screen read as one material. The accent stays teal. */
    "  --rs-bg:#0F0C0A; --rs-surface:#141110; --rs-s1:#1B1714; --rs-s2:#231E19;",
    "  --rs-s3:#2C2621; --rs-s4:#372F28;",
    "  --rs-ink:#EFE9E1; --rs-ink2:#D2C8BC; --rs-dim:#B3A89B; --rs-out:#8D8275;",
    "  --rs-line:#3B332B; --rs-line2:#544A3F;",
    "  --rs-pri:#7FDCCB; --rs-on-pri:#003731; --rs-pri-c:#12463F; --rs-on-pri-c:#A9F2E4;",
    "  --rs-live:#E9B972; --rs-on-live:#3A2405;",
    "  --rs-good:#8FD6A8; --rs-bad:#FFB4AB;",
    "  --rs-r-xs:10px; --rs-r-sm:12px; --rs-r-md:16px; --rs-r-lg:24px; --rs-r-xl:28px;",
    "  --rs-ease:cubic-bezier(.2,0,0,1); --rs-sans:-apple-system,Roboto,'Segoe UI',system-ui,sans-serif",
    "}",
    "html[data-rs-theme=\"dark\"] .rs-screen section.card,html[data-rs-theme=\"dark\"] .rs-hero{",
    "  box-shadow:0 1px 2px rgba(0,0,0,.45),0 1px 3px 1px rgba(0,0,0,.28)}",
    "html[data-rs-theme=\"light\"] section.card,html[data-rs-theme=\"light\"] .rs-hero{",
    "  box-shadow:0 1px 2px rgba(16,24,22,.10),0 1px 3px 1px rgba(16,24,22,.06)}",
    "html[data-rs-theme=\"light\"]{",
    "  --rs-bg:#F5FAF8; --rs-surface:#FFFFFF; --rs-s1:#EEF5F2; --rs-s2:#E6EFEB;",
    "  --rs-s3:#DDE8E3; --rs-s4:#D3E0DA;",
    "  --rs-ink:#141A18; --rs-ink2:#2C3633; --rs-dim:#465450; --rs-out:#5F6E6A;",
    "  --rs-line:#C6D4CF; --rs-line2:#AABAB4;",
    "  --rs-pri:#00695E; --rs-on-pri:#FFFFFF; --rs-pri-c:#9EF2E2; --rs-on-pri-c:#00201B;",
    "  --rs-live:#8A5A00; --rs-on-live:#FFF3DC;",
    "  --rs-good:#1D6B3A; --rs-bad:#B3261E",
    "}",

    /* --------------------------------------------------------------- reset --- */
    "html.rs-app{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}",
    "html.rs-app header.studio{display:none !important}",
    "html.rs-app body{margin:0 !important;padding:0 !important;background:var(--rs-bg) !important;",
    "  color:var(--rs-ink) !important;font:15px/1.45 -apple-system,Roboto,'Segoe UI',system-ui,sans-serif;",
    "  overscroll-behavior-y:none}",
    "html.rs-app .wrap{display:none !important}",
    "html.rs-locked,html.rs-locked body{overflow:hidden !important}",
    "html.rs-app :focus-visible{outline:2.5px solid var(--rs-pri);outline-offset:2px;border-radius:6px}",

    /* ---------------------------------------------------------------- shell --- */
    "#rsApp{position:fixed;top:0;right:0;bottom:0;left:0;display:flex;flex-direction:column;",
    "  background:var(--rs-bg);z-index:70}",
    "#rsTop{flex:0 0 auto;padding:calc(6px + " + SAFE_T + ") 8px 6px 16px;display:flex;",
    "  align-items:center;gap:4px;background:var(--rs-bg);min-height:56px}",
    "#rsTop.rs-lg{align-items:flex-end;padding-bottom:12px;min-height:0}",
    "#rsTop .rs-tt{flex:1 1 auto;min-width:0}",
    "#rsTop h1{margin:0;font-size:20px;line-height:26px;font-weight:600;letter-spacing:-.01em}",
    "#rsTop.rs-lg h1{font-size:31px;line-height:36px;font-weight:700;letter-spacing:-.025em}",
    "#rsTop p{margin:2px 0 0;font-size:13px;line-height:18px;color:var(--rs-dim);",
    "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#rsBody{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;",
    "  -webkit-overflow-scrolling:touch;padding-bottom:20px;scroll-behavior:smooth}",
    "#rsBody.rs-nosmooth{scroll-behavior:auto}",
    ".rs-screen{display:none;animation:rsIn .18s var(--rs-ease);",
    "  --ink:var(--rs-ink);--ink2:var(--rs-ink2);--ink-dim:var(--rs-dim);--ink-faint:var(--rs-dim);",
    "  --panel:var(--rs-s2);--panel2:var(--rs-s3);--line:var(--rs-line);--line2:var(--rs-line2);",
    "  --bg:var(--rs-bg);--bg2:var(--rs-s1);",
    "  --acc:var(--rs-pri);--acc2:var(--rs-pri);--good:var(--rs-good);--bad:var(--rs-bad)}",
    ".rs-screen.rs-on{display:block}",
    "@keyframes rsIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}",

    /* -------------------------------------------------------------- buttons --- */
    ".rs-ico{width:48px;height:48px;flex:0 0 auto;display:inline-flex;align-items:center;",
    "  justify-content:center;border:0;border-radius:50%;background:transparent;",
    "  color:var(--rs-ink2);cursor:pointer;padding:0}",
    ".rs-ico:active{background:var(--rs-s2)}",
    ".rs-ico svg{width:24px;height:24px;display:block}",
    "button.rs-btn{min-height:48px;padding:0 20px;border-radius:999px;border:1px solid var(--rs-line2);",
    "  background:transparent;color:var(--rs-ink);font:600 15px/1 var(--rs-sans);cursor:pointer}",
    "button.rs-btn.rs-filled{background:var(--rs-pri);border-color:var(--rs-pri);color:var(--rs-on-pri)}",
    "button.rs-btn.rs-tonal{background:var(--rs-pri-c);border-color:transparent;color:var(--rs-on-pri-c)}",
    "button.rs-btn:active{transform:scale(.98)}",
    ".rs-fab{width:64px;height:64px;flex:0 0 auto;border-radius:50%;border:0;display:flex;",
    "  align-items:center;justify-content:center;background:var(--rs-pri);color:var(--rs-on-pri);",
    "  cursor:pointer;position:relative}",
    ".rs-fab svg{width:30px;height:30px}",
    ".rs-fab.rs-live{background:var(--rs-live);color:var(--rs-on-live)}",
    ".rs-fab::after{content:'';position:absolute;top:-5px;right:-5px;bottom:-5px;left:-5px;",
    "  border-radius:50%;border:2px solid var(--rs-live);opacity:0}",
    "html.rs-playing .rs-fab::after{animation:rsRing 3.4s ease-out infinite}",
    "@keyframes rsRing{0%{opacity:.55;transform:scale(.92)}70%{opacity:0;transform:scale(1.18)}100%{opacity:0}}",

    /* ---------------------------------------------------------------- cards --- */
    "#rsBrowse,#rsVoices{background:transparent !important;border:0 !important;padding:6px 0 0 !important;}",
    "#rsBrowse > section.card,#rsVoices > section.card{margin:0 16px 12px;}",
    ".rs-screen section.card{display:block;margin:0 16px 12px;padding:16px;" +
    "  border-radius:var(--rs-r-md) !important;",
    "  background:var(--rs-s1);border:1px solid var(--rs-line);color:var(--rs-ink);",
    "  box-shadow:none;max-width:none;width:auto;float:none}",
    ".rs-screen section.card > h3,.rs-screen section.card > h2{margin:0 0 12px;font-size:17px;",
    "  line-height:22px;font-weight:700;letter-spacing:-.01em;color:var(--rs-ink);display:block}",
    ".rs-screen section.card h3:empty,.rs-screen section.card h2:empty{display:none}",
    /* the chamber is the section's hero; the ambient card is the quiet sibling */
    ".rs-cta{position:relative;overflow:hidden;padding:18px 16px 16px !important;",
    "  background:linear-gradient(155deg,var(--rs-s3),var(--rs-s1)) !important;border-color:var(--rs-line2) !important}",
    ".rs-cta-top{display:flex;align-items:flex-start;margin-bottom:14px}",
    ".rs-cta-top > * + *{margin-left:12px}",
    ".rs-cta-art{flex:0 0 auto;width:46px;height:46px;border-radius:14px;display:flex;align-items:center;",
    "  justify-content:center;background:var(--rs-pri-c);color:var(--rs-on-pri-c)}",
    ".rs-cta h3{margin:2px 0 4px !important;font-size:19px !important}",
    ".rs-cta-sub{margin:0;font-size:13px;line-height:18px;color:var(--rs-dim)}",
    /* the chamber's controls belong to the chamber: one hairline under the head, the
       switch first, then the mapping and the three pickers, then the way in */
    ".rs-cymctl{margin:0;padding:12px 0 0;border-top:1px solid var(--rs-line)}",
    ".rs-cymctl .rs-sw{padding-top:0;padding-bottom:2px}",
    /* the chamber's controls ride with it as a Setup sheet above the transport */
    "html.rs-app .rs-cym-setup{position:absolute;left:0;right:0;bottom:84px;max-height:64%;overflow:auto;",
    "  display:none;padding:12px 14px 16px;background-color:#120D07;border-top:1px solid #5A4526;",
    "  box-shadow:0 -14px 34px rgba(0,0,0,.65);z-index:9}",
    "html.rs-app .rs-cym-setup.on{display:block}",
    /* Setup is a brass face like Back, ? and Controls, not a text pill: one round key, */
    /* 44 px, the same generated metal as the transport beside it */
    "html.rs-app #rsCymSetup{width:44px;height:44px;min-width:44px;padding:0;border-radius:50%;",
    "  font-size:0;background-color:#100e0c;border:1px solid rgba(255,255,255,.22);",
    "  box-shadow:0 4px 12px rgba(0,0,0,.5)}",
    "html[data-rs-ui=full] #rsCymSetup{background-image:url(ui/amp-setup.webp);",
    "  background-size:cover;background-position:center;border:0}",
    "html.rs-app .rs-cym-setup .rs-cymctl{padding:0;margin:0;background:none;border:0}",
    /* the sheet can be dismissed without aiming at the key again: a grabber you tap, */
    /* or pull down, the same gesture the More sheet uses */
    "html.rs-app .rs-cym-grab{display:block;width:100%;height:28px;margin:0 0 6px;padding:0;",
    "  border:0;background:transparent;cursor:grab;touch-action:none}",
    "html.rs-app .rs-cym-grab span{display:block;width:44px;height:4px;margin:12px auto 0;",
    "  border-radius:2px;background:rgba(255,226,180,.38)}",
    /* a quiet picture bleeds in at the head of each way in, and fades into the card */
    "html[data-rs-ui=full] .rs-cta{position:relative;overflow:hidden}",
    "html[data-rs-ui=full] .rs-cta::before{content:\"\";position:absolute;top:0;left:0;right:0;height:96px;",
    "  background-size:cover;background-position:center;pointer-events:none;",
    "  background-image:linear-gradient(180deg,rgba(20,18,16,.15),rgba(20,18,16,.94))}",
    "html[data-rs-ui=full] .rs-cta[data-art=chamber]::before{background-image:",
    "  linear-gradient(180deg,rgba(20,18,16,.15),rgba(20,18,16,.94)),url(ui/cta-chamber.webp)}",
    "html[data-rs-ui=full] .rs-cta[data-art=focus]::before{background-image:",
    "  linear-gradient(180deg,rgba(20,18,16,.15),rgba(20,18,16,.94)),url(ui/cta-focus.webp)}",
    "html[data-rs-ui=full] .rs-cta > *{position:relative;z-index:1}",
    /* the card now carries the Focus view's own atmosphere through its whole height — the
       aurora plate under a scrim that stays dark enough for text at every line, down to the
       auto-scramble switch. Generated chrome art read as a different app next to it. */
    "html[data-rs-ui=full] #rsVizCard{position:relative;overflow:hidden}",
    "html[data-rs-ui=full] #rsVizCard::before{content:\"\";position:absolute;inset:0;",
    "  background-size:cover;background-position:center top;pointer-events:none;",
    "  background-image:linear-gradient(180deg,rgba(18,16,14,.42),rgba(15,13,11,.80) 46%,",
    "  rgba(13,11,9,.92) 78%,rgba(12,10,9,.96)),url(ui/scene/aurora.webp)}",
    "html[data-rs-ui=full] #rsVizCard > *{position:relative;z-index:1}",
    "#rsVizCard .rs-vizadv{margin:12px 0 6px;padding:0 12px;border:1px solid var(--rs-line);",
    "  border-radius:12px;background-color:rgba(0,0,0,.22)}",
    "#rsVizCard .rs-vizadv summary{min-height:48px}",
    "#rsVizCard .rs-vizadv .row, #rsVizCard .rs-vizadv .chips{margin-top:2px}",
    /* the scene picker is faceplate too: a smoked LED window naming the scene in amber caps,
       brass arrows, and a list in the same language. The page's own <select> stays the source
       of truth (chips, arrows and the engine all drive it) but is hidden — its native popup is
       the one surface Android will not let us style. */
    "html[data-rs-ui=full] .rs-scenebox{position:relative;background-color:#161009;border:1px solid #4A3A22;",
    "  border-radius:12px;background-image:linear-gradient(180deg,#1D150D,#120C07);",
    "  box-shadow:inset 0 1px 0 rgba(255,226,180,.10)}",
    "html[data-rs-ui=full] .rs-scenebox .readout{color:#C9BFAC;font:700 10px/1 var(--rs-sans);",
    "  letter-spacing:.16em;text-transform:uppercase}",
    "html[data-rs-ui=full] .rs-scenebox .vz-scenes button,html[data-rs-ui=full] .rs-scenebox .vz-scenes button:hover,",
    "html[data-rs-ui=full] .rs-scenebox .vz-scenes button:active{background-color:#1B140C;background-image:none;",
    "  border:1px solid #5A4526;border-radius:10px;color:#E8D6B4}",
    "html[data-rs-ui=full] .rs-scenebox select#vizPreset{display:none}",
    "html[data-rs-ui=full] #vizSync{display:none !important}",
    "html[data-rs-ui=full] .rs-scenemenu{flex:1 1 auto;min-width:0;min-height:46px;display:flex;align-items:center;",
    "  justify-content:center;gap:8px;padding:0 10px;border-radius:10px;border:1px solid #5A4526;",
    "  background-color:#120D07;background-image:linear-gradient(180deg,#0B0805,#171008 62%,#0A0704);",
    "  box-shadow:inset 0 1px 4px rgba(0,0,0,.9);cursor:pointer;text-align:center}",
    "html[data-rs-ui=full] .rs-scenemenu span{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;",
    "  white-space:nowrap;text-align:center;",
    "  font:700 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#FFB454;",
    "  letter-spacing:.12em;text-transform:uppercase;font-variant-numeric:tabular-nums;",
    "  text-shadow:0 0 6px rgba(255,150,40,.55),0 0 2px rgba(255,200,120,.8)}",
    "html[data-rs-ui=full] .rs-scenemenu svg{flex:0 0 auto;color:#C9BFAC}",
    /* the arrows' sizing rule is more specific than a bare class; the picker has to win it
       or it renders as a third 46 px square */
    "html[data-rs-ui=full] .rs-scenebox .vz-scenes button.rs-scenemenu{flex:1 1 auto;width:auto;min-width:0}",
    "html[data-rs-ui=full] .rs-scenebox .rs-scene-shuffle,html[data-rs-ui=full] .rs-scenebox .rs-scene-shuffle:hover,",
    "html[data-rs-ui=full] .rs-scenebox .rs-scene-shuffle:active{min-height:40px;padding:0 12px;border-radius:9px;",
    "  border:1px solid #5A4526;background-color:#1B140C !important;",
    "  background-image:linear-gradient(180deg,#2B2115,#17110B 60%,#0F0A06) !important;",
    "  box-shadow:inset 0 1px 0 rgba(255,226,180,.16),0 2px 6px rgba(0,0,0,.55);",
    "  color:#E8D6B4 !important;font:700 10.5px/1 var(--rs-sans) !important;letter-spacing:.13em;",
    "  text-transform:uppercase}",
    "html[data-rs-ui=full] .rs-scenepop{position:absolute;left:0;right:0;top:100%;z-index:30;max-height:264px;",
    "  overflow:auto;margin-top:6px;padding:6px;border-radius:12px;border:1px solid #5A4526;",
    "  background-color:#120D07;background-image:linear-gradient(180deg,#1B130B,#0E0906);",
    "  box-shadow:0 14px 34px rgba(0,0,0,.7);display:none}",
    "html[data-rs-ui=full] .rs-scenepop.rs-on{display:block}",
    "html[data-rs-ui=full] .rs-scenepop button{display:block;width:100%;min-height:44px;padding:0 10px;border:0;",
    "  border-radius:8px;background:none;text-align:left;color:#D8C9AC;",
    "  font:700 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;",
    "  text-transform:uppercase}",
    "html[data-rs-ui=full] .rs-scenepop button[aria-selected=true]{color:#FFB454;background:rgba(120,84,32,.22)}",
    "html[data-rs-ui=full] .rs-scenepop button:active{background:rgba(120,84,32,.32)}",
    /* Turn on/off and Scramble are the same brass keys as Surprise me */
    "html[data-rs-ui=full] #vizCard #vizToggle,html[data-rs-ui=full] #vizCard #vizToggle:hover,",
    "html[data-rs-ui=full] #vizCard #vizToggle:active,",
    "html[data-rs-ui=full] #vizCard #vizScramble,html[data-rs-ui=full] #vizCard #vizScramble:hover,",
    "html[data-rs-ui=full] #vizCard #vizScramble:active{min-height:44px;padding:0 14px;border-radius:9px;",
    "  border:1px solid #5A4526;background-color:#1B140C !important;",
    "  background-image:linear-gradient(180deg,#2B2115,#17110B 60%,#0F0A06) !important;",
    "  box-shadow:inset 0 1px 0 rgba(255,226,180,.16),0 2px 6px rgba(0,0,0,.55);",
    "  color:#E8D6B4 !important;font:700 10.5px/1 var(--rs-sans) !important;letter-spacing:.13em;",
    "  text-transform:uppercase}",
    ".rs-hint{margin:0;font-size:12.5px;line-height:18px;color:var(--rs-out)}",
    "#vizNote{display:none !important}",
    /* folded card: a summary row, contents hidden until asked for */
    ".rs-fold{padding:4px 14px !important}",
    ".rs-fold summary{display:flex;align-items:center;min-height:54px;cursor:pointer;list-style:none}",
    ".rs-fold summary::-webkit-details-marker{display:none}",
    ".rs-fold summary .rs-fold-t{flex:1 1 auto;min-width:0;padding:8px 0}",
    ".rs-fold summary b{display:block;font-size:14.5px;font-weight:600;color:var(--rs-ink)}",
    ".rs-fold summary span span{display:block;font-size:12px;line-height:16px;color:var(--rs-out)}",
    ".rs-fold summary svg{flex:0 0 auto;color:var(--rs-out);margin-left:10px}",
    ".rs-fold[open] summary svg,.rs-fold details[open] summary svg{transform:rotate(90deg)}",
    ".rs-fold details > section{padding:2px 0 12px}",
    ".rs-fold h3{display:none !important}",
    ".rs-fold #hearinfo{margin:0 0 8px}",
    ".rs-screen .hint,.rs-screen .readout{font-size:13px;line-height:19px;color:var(--rs-dim);margin:0 0 10px}",
    ".rs-hero #meta{font-size:12.5px;color:var(--rs-out);margin:0 0 10px;font-variant-numeric:tabular-nums}",
    ".rs-screen .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0}",
    ".rs-screen .row.between{justify-content:space-between}",
    ".rs-screen .sep{display:none}",
    ".rs-screen section.card .row > button,.rs-screen section.card > button{min-height:44px;",
    "  border-radius:var(--rs-r-sm);border:1px solid var(--rs-line2);background:var(--rs-s2);color:var(--rs-ink);",
    "  font:600 14px/1 var(--rs-sans);padding:0 14px;cursor:pointer}",
    ".rs-screen section.card .row > button:active,.rs-screen section.card > button:active{background:var(--rs-s3)}",
    ".rs-screen section.card > button.rs-btn.rs-filled,.rs-screen .row > button.rs-btn.rs-filled{",
    "  background:var(--rs-pri) !important;border-color:var(--rs-pri) !important;color:var(--rs-on-pri) !important}",
    ".rs-screen select{min-height:44px;border-radius:var(--rs-r-sm);border:1px solid var(--rs-line2);",
    "  background:var(--rs-s2);color:var(--rs-ink);font:14px/1 var(--rs-sans);padding:0 10px;max-width:100%}",
    ".rs-screen input[type=search],.rs-screen input[type=text]{min-height:48px;width:100%;",
    "  border-radius:999px;border:1px solid var(--rs-line2);background:var(--rs-s2);color:var(--rs-ink);",
    "  font:15px/1 var(--rs-sans);padding:0 18px;min-width:0}",
    ".rs-screen input[type=search]::placeholder{color:var(--rs-out);text-overflow:ellipsis}",
    ".rs-screen input[type=range]{-webkit-appearance:none;appearance:none;height:44px;width:100%;",
    "  background:transparent;margin:0}",
    ".rs-screen input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;",
    "  background:var(--rs-s3)}",
    ".rs-screen input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;",
    "  margin-top:-9px;border-radius:50%;background:var(--rs-pri);border:2px solid var(--rs-bg)}",
    ".rs-screen kbd{display:none}",
    ".rs-screen .chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}",
    ".rs-screen .chip{min-height:48px;border-radius:999px;border:1px solid var(--rs-line2);",
    "  background:transparent;color:var(--rs-ink2);font:600 13px/1 var(--rs-sans);padding:0 14px;cursor:pointer}",
    ".rs-screen .chip.on{background:var(--rs-pri-c);border-color:transparent;color:var(--rs-on-pri-c)}",
    ".rs-rail{margin:0 16px 16px}",
    ".rs-rail h4{margin:0 0 8px;font-size:15px;font-weight:700;letter-spacing:-.01em}",
    ".rs-rail .rs-track{display:flex;overflow-x:auto;gap:10px;padding:0 0 4px;",
    "  -webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}",
    ".rs-rail .rs-track::-webkit-scrollbar{display:none}",
    ".rs-card{flex:0 0 auto;width:150px;min-height:92px;scroll-snap-align:start;text-align:left;",
    "  border-radius:14px;border:1px solid var(--rs-line);background:var(--rs-s2);color:var(--rs-ink);",
    "  padding:12px;display:flex;flex-direction:column;justify-content:space-between;gap:6px;",
    "  font:inherit;cursor:pointer}",
    ".rs-card b{font-size:14px;font-weight:600;line-height:17px;display:-webkit-box;",
    "  -webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
    ".rs-card span{font-size:11.5px;line-height:15px;color:var(--rs-dim);display:flex;gap:6px;",
    "  align-items:center;flex-wrap:wrap}",
    ".rs-card .rs-tag{font-weight:600;letter-spacing:.04em;text-transform:uppercase;font-size:9.5px;",
    "  padding:2px 6px;border-radius:999px;background:var(--rs-s4);color:var(--rs-ink2)}",
    ".rs-card .rs-tag.spk{background:var(--rs-pri-c);color:var(--rs-on-pri-c)}",
    ".rs-card:active{background:var(--rs-s3)}",
    ".rs-modhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;",
    "  padding:0 16px}",
    ".rs-modhead button{background:none;border:0;color:var(--rs-pri);font:600 13px/1 var(--rs-sans);",
    "  padding:6px 0;cursor:pointer}",
    ".rs-chipbtn{min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--rs-line2);",
    "  background:transparent;color:var(--rs-ink2);font:600 13px/1 var(--rs-sans);flex:0 0 auto}",
    ".rs-screen .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
    ".rs-screen .rs-searchrow{display:flex;align-items:center;margin:0 16px 6px}",
    "#scr-sessions .rs-pad{height:0}",
    "#rsBrowse{padding-top:2px}",
    "#rsBrowse #search{min-height:44px}",
    "#rsBrowse #rsFilterBtn{min-height:44px}",
    ".rs-screen .rs-searchrow #search{flex:1 1 auto;margin:0}",
    ".rs-screen .rs-searchrow > * + *{margin-left:8px}",
    "#rsFilterWrap{display:none}",
    "#rsFilterWrap.rs-on{display:block}",
    ".rs-screen .cnt{color:var(--rs-dim);font-weight:400}",
    ".rs-screen .grp{font:600 12px/1 var(--rs-sans);letter-spacing:.06em;text-transform:uppercase;",
    "  color:var(--rs-out);padding:14px 4px 6px}",
    ".rs-screen #plist{max-height:none;overflow:visible;margin:0;display:flex;flex-direction:column;gap:8px}",
    ".rs-screen #plist .item{display:flex;gap:10px;align-items:flex-start;padding:12px 10px;",
    "  border-radius:var(--rs-r-sm);border:1px solid var(--rs-line);background:var(--rs-s2);cursor:pointer}",
    ".rs-screen #plist .item .nm b{font-size:15px;font-weight:600}",
    ".rs-screen #plist .item .nm span{font-size:13px;line-height:18px;color:var(--rs-dim)}",
    ".rs-screen #plist .item.sel{border-color:var(--rs-pri);background:var(--rs-pri-c)}",
    ".rs-screen #plist .item.sel .nm b,.rs-screen #plist .item.sel .nm span{color:var(--rs-on-pri-c)}",
    ".rs-screen #plist .star{width:44px;height:44px;border:0;background:transparent;color:var(--rs-ink2);",
    "  font-size:19px;cursor:pointer;padding:0;flex:0 0 auto}",
    ".rs-screen #plist .star.on{color:var(--rs-live)}",
    ".rs-screen .scrollbox{max-height:none;overflow:visible}",
    ".rs-screen canvas#spec,.rs-screen canvas#phase{background:var(--rs-bg);border:1px solid var(--rs-line);",
    "  border-radius:var(--rs-r-xs);display:block;width:100%}",
    ".rs-screen #rsLive h4,.rs-screen .meter h4{font-size:12px;letter-spacing:.06em;",
    "  text-transform:uppercase;color:var(--rs-dim) !important;margin:0 0 6px}",
    ".rs-screen #rsLive b,.rs-screen .meter b,.rs-screen #rsLive .readout div{",
    "  color:var(--rs-ink) !important}",
    ".rs-screen #rsLive .readout{color:var(--rs-dim) !important}",
    ".rs-screen .meter + .meter{margin-top:14px}",

    /* the entries table is a 7-col grid on desktop; on a phone it wraps into a card */
    ".rs-screen .ehead{display:none}",
    ".rs-screen .erow{display:grid;grid-template-columns:1fr 1fr 40px;",
    "  gap:6px;padding:10px;border-radius:var(--rs-r-sm);border:1px solid var(--rs-line);",
    "  background:var(--rs-s2);margin:0 0 8px;align-items:center}",
    ".rs-screen .erow .idx{grid-column:1 / -1;font:600 11px/1 var(--rs-sans);letter-spacing:.06em;",
    "  text-transform:uppercase;color:var(--rs-out)}",
    ".rs-screen .erow input{height:46px;border-radius:var(--rs-r-xs);border:1px solid var(--rs-line2);",
    "  background:var(--rs-bg);color:var(--rs-ink);font:14px/1 ui-monospace,monospace;",
    "  padding:0 8px;width:100%;min-width:0}",
    ".rs-screen .erow .mini{height:40px;border-radius:var(--rs-r-xs);border:1px solid var(--rs-line2);",
    "  background:var(--rs-s3);color:var(--rs-ink);padding:0 8px;font:600 13px/1 var(--rs-sans)}",
    ".rs-screen .erow .etools{grid-column:1 / -1}",
    ".rs-screen #voicelist .vrow{min-height:48px;border-radius:var(--rs-r-sm);background:var(--rs-s2);",
    "  border:1px solid var(--rs-line);margin:0 0 8px;padding:6px 10px}",
    ".rs-screen #voicelist .vrow.sel{border-color:var(--rs-pri);background:var(--rs-pri-c)}",
    ".rs-screen #voicelist .vrow button{min-height:40px;border-radius:var(--rs-r-xs);border:1px solid var(--rs-line2);",
    "  background:var(--rs-s3);color:var(--rs-ink);padding:0 10px;font:600 12px/1 var(--rs-sans)}",
    ".rs-screen #voicelist .vrow .vname{font-size:14px}",
    ".rs-screen .etools{padding:0}",
    ".rs-screen #quickpick .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
    ".rs-screen #quickpick input,.rs-screen #quickpick select{width:100%;min-width:0;min-height:42px;",
    "  border-radius:var(--rs-r-xs);border:1px solid var(--rs-line2);background:var(--rs-bg);",
    "  color:var(--rs-ink);font:14px/1 var(--rs-sans);padding:0 10px}",
    ".rs-screen #quickpick label.small,.rs-screen label.small{font-size:11px;letter-spacing:.06em;",
    "  text-transform:uppercase;color:var(--rs-dim);margin:0 0 3px;display:block}",
    ".rs-screen #quickpick button.chip{width:100%}",
    ".rs-screen .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
    ".rs-screen .grid2 input,.rs-screen .grid2 select{width:100%;min-width:0;min-height:42px;",
    "  border-radius:var(--rs-r-xs);border:1px solid var(--rs-line2);background:var(--rs-bg);",
    "  color:var(--rs-ink);font:14px/1 var(--rs-sans);padding:0 10px}",
    ".rs-screen details.tool{border:1px solid var(--rs-line);border-radius:var(--rs-r-sm);margin:0 0 8px;",
    "  padding:0 12px;background:var(--rs-s2)}",
    ".rs-screen details.tool > summary{min-height:48px;display:flex;align-items:center;",
    "  font-weight:600;font-size:14px;cursor:pointer}",
    ".rs-screen details.tool .body{padding:0 0 10px}",

    /* ----------------------------------------------------------------- hero --- */
    ".rs-hero{margin:0 16px 12px;padding:16px;border-radius:var(--rs-r-hero);",
    "  background:linear-gradient(160deg,var(--rs-s2),var(--rs-s1));border:1px solid var(--rs-line)}",
    ".rs-hero-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:12px}",
    ".rs-hero-top .rs-tt{flex:1 1 auto;min-width:0}",
    ".rs-hero h1{margin:0;font-size:20px;line-height:26px;font-weight:700;letter-spacing:-.015em}",
    ".rs-hero p{margin:3px 0 0;font-size:13px;line-height:18px;color:var(--rs-dim)}",
    /* the player below already names the session; the line under the title only mirrored it */
    ".rs-hero #rsNowSrc{display:none}",
    /* the page's own status pill repeated the shell's live pill, two lines apart */
    ".rs-hero #modePill{display:none}",
    ".rs-pill{flex:0 0 auto;font:600 11px/1 var(--rs-sans);letter-spacing:.06em;text-transform:uppercase;",
    "  padding:7px 11px;border-radius:999px;background:var(--rs-s3);color:var(--rs-ink2)}",
    /* a pill that is also a control: the button carries the 44 px tap target, the pill inside
       keeps the exact shape of the LIVE chip beside it */
    ".rs-tap{flex:0 0 auto;display:block;padding:10px 0;margin:-10px 0;border:0;background:none;cursor:pointer}",
    ".rs-tap .rs-pill{display:block}",
    ".rs-tap:focus-visible{outline:2px solid var(--rs-pri);outline-offset:3px;border-radius:999px}",
    /* no rubber-band or pull-to-refresh: a swipe at the top edge must not reload the shell */
    "html,body{overscroll-behavior:none}",
    /* Files & export: one two-column rhythm instead of rows of ragged widths */
    ".rs-files .row{display:flex;gap:8px}",
    ".rs-files .row.rs-2 > *{flex:1 1 0;min-width:0}",
    ".rs-files .row.rs-1 > *{flex:1 1 auto}",
    ".rs-files .row > button,.rs-files .row > select{min-height:44px}",
    ".rs-files .sep{margin:14px 0 10px}",
    ".rs-files #packinfo{font-size:12px}",
    ".rs-filelen{display:block;margin:4px 0 12px}",
    ".rs-filelen > span{display:block;margin:0 0 6px;font-size:11.5px;letter-spacing:.07em;",
    "  text-transform:uppercase;color:var(--rs-dim);font-weight:600}",
    ".rs-filelen > select{width:100%;min-height:46px}",
    /* Scene reads as a menu with many options, not three loose controls */
    ".rs-scenebox{background:var(--rs-s3);border:1px solid var(--rs-line2);border-radius:14px;",
    "  padding:10px 12px 12px;margin:4px 0 14px}",
    ".rs-scenebox > .row{margin-bottom:8px}",
    ".rs-scenebox .readout{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;",
    "  color:var(--rs-ink2);font-weight:700}",
    ".rs-scenebox .vz-scenes{display:flex;gap:8px;align-items:stretch;grid-template-columns:none}",
    ".rs-scenebox .vz-scenes button{flex:0 0 46px;width:46px;min-width:46px;min-height:46px;",
    "  padding:0;border-radius:12px;font-size:22px;line-height:1;display:grid;place-items:center}",
    ".rs-scenebox .vz-scenes button#vizShuffle{flex:0 0 auto;width:auto;min-width:0;padding:0 12px;",
    "  font-size:13px;letter-spacing:.04em;text-transform:uppercase}",
    ".rs-scenebox .vz-scenes select{flex:1 1 auto;min-width:0;min-height:46px;border-radius:12px;",
    "  font-weight:600}",
    /* the page's card sat inside the shell's card, so every control paid two paddings */
    "#rsVizCard #vizCard{padding:0;border:0;background:transparent;box-shadow:none;margin:0}",
    ".rs-scenebox .rs-scene-shuffle{flex:0 0 auto;min-height:34px;padding:0 10px;border-radius:10px;",
    "  font-size:11.5px;letter-spacing:.06em;text-transform:uppercase}",
    "html.rs-playing .rs-pill.rs-live{background:var(--rs-live);color:var(--rs-on-live)}",
    /* the page's chart is hidden and repainted by the shell's own session map (see
       the schedule-map block in the home section) */
    ".rs-hero > section.card{background:transparent;border:0;padding:0;margin:0}",
    ".rs-hero #graph{display:none}",
    ".rs-sched{margin:0 0 12px}",
    ".rs-hero canvas#rsSched{width:100%;height:128px;display:block;border-radius:var(--rs-r-sm);",
    "  background:#12100F;border:1px solid #2E2519}",
    ".rs-hero .stage{background:transparent;border:0;padding:0;margin:0}",
    ".rs-transport{display:flex;align-items:center;gap:14px}",
    ".rs-transport .rs-vol{flex:1 1 auto;min-width:0}",
    ".rs-transport .rs-vol small{display:block;font:600 11px/1 var(--rs-sans);letter-spacing:.07em;",
    "  text-transform:uppercase;color:var(--rs-out);margin-bottom:2px}",
    ".rs-transport #rsClock{font-variant-numeric:tabular-nums;font-size:13px;color:var(--rs-dim);",
    "  flex:0 0 auto}",

    /* ------------------------------------------------ the vintage face (Full UI) --- */
    /* Art only exists in the Full interface; Minimal falls back to the plain controls. */
    "html[data-rs-ui=full] .rs-hero{background-image:url(ui/plate.webp);background-size:cover;",
    "  background-position:center;background-color:#141210;color:#F2F6F4;position:relative;overflow:hidden}",
    /* real brushing: a fine anisotropic sheen over the plate, so it is metal and not a flat band */
    "html[data-rs-ui=full] .rs-hero::before{content:\"\";position:absolute;top:0;right:0;bottom:0;left:0;",
    "  pointer-events:none;background:repeating-linear-gradient(180deg,rgba(255,244,224,.055) 0 1px,",
    "  rgba(0,0,0,.055) 1px 2px,rgba(255,255,255,0) 2px 5px);opacity:.9}",
    "html[data-rs-ui=full] .rs-hero > *{position:relative;z-index:1}",
    "html[data-rs-ui=full] .rs-sched{margin-bottom:6px}",
    "html[data-rs-ui=full] .rs-hero #meta{margin:2px 0 12px}",
    "html[data-rs-ui=full] .rs-hero .rs-transport{margin-top:0}",
    "html[data-rs-ui=full] .rs-hero h1{color:#F7FBF8}",
    "html[data-rs-ui=full] .rs-hero p,html[data-rs-ui=full] .rs-hero #meta,",
    /* the hero's counter line reads as the amplifier's own little display: centred
       under the schedule picture, smoked glass, amber digits */
    "html[data-rs-ui=full] .rs-hero #meta{display:block;text-align:center;margin:10px auto 0 !important;",
    "  font:600 12.5px/1.25 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;",
    "  letter-spacing:.09em;color:#FFB454;background-color:#120D07;",
    "  background-image:linear-gradient(180deg,#0C0906,#1B1309 60%,#0A0704);",
    "  border:1px solid #3B2C15;border-radius:8px;padding:8px 12px;max-width:100%;",
    "  box-shadow:inset 0 2px 7px rgba(0,0,0,.95),0 1px 0 rgba(255,255,255,.05);",
    "  text-shadow:0 0 7px rgba(255,150,40,.55),0 0 2px rgba(255,200,120,.85)}",
    "html[data-rs-ui=full] .rs-hero #meta b{color:#FFD08A;font-weight:700}",
    "html[data-rs-ui=full] .rs-hero #rsClock{color:#D2DBD6}",
    "html[data-rs-ui=full] .rs-hero .rs-vol small{color:#C9BFAC}",
    "html[data-rs-ui=full] .rs-hero .rs-sw{color:#D2DBD6}",
    "html[data-rs-ui=full] .rs-hero .rs-sw span{color:#D2DBD6}",
    "html[data-rs-ui=full] .rs-hero .pill{background:#3A332A;color:#F0E7D7}",
    "html[data-rs-ui=full] .rs-hero .rs-pill{background:#3A332A;color:#F0E7D7}",
    /* The two readouts in the hero's top row wear the same hardware as the transport: Surprise
       me is a brass-edged key, the state is a smoked LED window with a pilot lamp. Both faces
       are re-declared for hover/active/focus because the page's own button:hover shorthand
       (background: color-mix(...)) resets background-image — a tap leaves that hover on. */
    "html[data-rs-ui=full] .rs-hero #rsSurprise,html[data-rs-ui=full] .rs-hero #rsSurprise:hover,",
    "html[data-rs-ui=full] .rs-hero #rsSurprise:active,html[data-rs-ui=full] .rs-hero #rsSurprise:focus{",
    "  display:inline-flex;align-items:center;min-height:44px;padding:0 13px;margin:0;border-radius:9px;",
    "  border:1px solid #5A4526;background-color:#1B140C;",
    "  background-image:linear-gradient(180deg,#2B2115,#17110B 60%,#0F0A06);",
    "  box-shadow:inset 0 1px 0 rgba(255,226,180,.16),0 2px 6px rgba(0,0,0,.55)}",
    "html[data-rs-ui=full] .rs-hero #rsSurprise:active{transform:translateY(1px)}",
    "html[data-rs-ui=full] .rs-hero #rsSurprise .rs-pill{padding:0;border-radius:0;background:none;",
    "  color:#E8D6B4;font:700 10.5px/1 var(--rs-sans);letter-spacing:.13em}",
    "html[data-rs-ui=full] .rs-hero #rsMode{display:inline-flex;align-items:center;gap:7px;",
    "  padding:6px 9px;border-radius:6px;border:1px solid #3B2C15;background-color:#120D07;",
    "  background-image:linear-gradient(180deg,#0B0805,#171008 62%,#0A0704);",
    "  box-shadow:inset 0 1px 4px rgba(0,0,0,.9),0 1px 0 rgba(255,255,255,.04);color:#FFB454;",
    "  font:700 10.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;",
    "  letter-spacing:.14em;text-shadow:0 0 5px rgba(255,150,40,.45)}",
    "html[data-rs-ui=full] .rs-hero #rsMode::before{content:'';width:6px;height:6px;border-radius:50%;",
    "  background:radial-gradient(circle at 35% 30%,#5A1612,#2A0B09 70%);",
    "  box-shadow:inset 0 0 1px #000,inset 0 0 0 1px rgba(0,0,0,.7)}",
    "html[data-rs-ui=full].rs-playing .rs-hero #rsMode::before{",
    "  background:radial-gradient(circle at 35% 30%,#FF6B5A,#E0241A 60%,#8C0F0A);",
    "  box-shadow:0 0 8px rgba(255,60,64,.85),inset 0 0 1px rgba(0,0,0,.3)}",
    /* The transport is a BUTTON, not a knob. The faceplate used to lay knob-calm.webp
     * here and hide the svg, so play read as a rotary dial (knurled rim, pointer slot
     * at 12 o'clock) and stop carried no symbol at all. Now each control is its own
     * machined brass button with the glyph inlaid in black lacquer, and the face swaps
     * to the pause art while the session runs - the shape says what it does. */
    "html[data-rs-ui=full] .rs-hero .rs-fab{width:68px;height:68px;border:0;position:relative;",
    "  background-image:url(ui/amp-play.webp);background-size:cover;background-position:center;",
    "  background-color:#100e0c;box-shadow:0 7px 18px rgba(0,0,0,.55);",
    "  transition:transform .12s var(--rs-ease),box-shadow .18s ease}",
    "html[data-rs-ui=full].rs-playing .rs-hero .rs-fab{background-image:url(ui/amp-pause.webp);",
    "  transform:scale(.96);box-shadow:0 7px 18px rgba(0,0,0,.55),0 0 0 2px var(--rs-live)}",
    "html[data-rs-ui=full] .rs-fab svg{display:none}",
    "html[data-rs-ui=full] .rs-fab::after{content:\"\";position:absolute;left:50%;bottom:-7px;width:8px;height:8px;",
    "  margin-left:-4px;border-radius:50%;background:var(--rs-s4);border:1px solid rgba(0,0,0,.5)}",
    "html[data-rs-ui=full].rs-playing .rs-fab::after{background:var(--rs-live);box-shadow:0 0 10px var(--rs-live)}",
    /* the amplifier's pilot lamp and counter window: a red lens beside a brass key,
       and the clock behind smoked glass with amber digits */
    ".rs-amprow{display:flex;align-items:center;gap:12px}",
    ".rs-ledpanel{display:inline-flex;align-items:center;justify-content:center;min-width:112px;",
    "  padding:7px 11px;border-radius:8px;border:1px solid #3B2C15;background-color:#120D07;",
    "  background-image:linear-gradient(180deg,#0C0906,#1B1309 60%,#0A0704);",
    "  box-shadow:inset 0 2px 7px rgba(0,0,0,.95),0 1px 0 rgba(255,255,255,.05)}",
    "#rsClock{font:700 15px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;",
    "  color:#FFB454;letter-spacing:.08em;font-variant-numeric:tabular-nums;",
    "  text-shadow:0 0 7px rgba(255,150,40,.6),0 0 2px rgba(255,200,120,.9)}",
    ".rs-loopunit{display:none;align-items:center;gap:8px;margin-left:auto}",
    "html[data-rs-ui=full] .rs-loopunit{display:inline-flex}",
    /* the row's own spacing rule (.rs-transport > * + *) outranks a bare margin, so the
       group only reaches the card's right edge with a selector that outranks it in turn:
       the lamp and its label sit left, the key itself ends flush under Stop */
    "html[data-rs-ui=full] .rs-amprow > .rs-loopunit{margin-left:auto}",
    "html[data-rs-ui=full] .rs-loopswitch{display:none}",
    /* The page's own button:hover shorthand (background: color-mix(...)) wiped this key's
       generated face the first time it was pressed and never gave it back — a tap leaves a
       sticky hover on a touch screen. The face is re-declared for every state it can be in,
       at a specificity the page's rule cannot beat. */
    "html[data-rs-ui=full] .rs-loopkey,html[data-rs-ui=full] .rs-loopkey:hover,",
    "html[data-rs-ui=full] .rs-loopkey:active,html[data-rs-ui=full] .rs-loopkey:focus{",
    "  width:46px;height:46px;border-radius:50%;border:0;padding:0;cursor:pointer;",
    "  background-image:url(ui/amp-loop.webp);background-size:cover;background-position:center;",
    "  background-repeat:no-repeat;background-color:#100e0c;",
    "  box-shadow:0 4px 12px rgba(0,0,0,.5);transition:transform .12s var(--rs-ease)}",
    ".rs-loopkey:active{transform:scale(.95)}",
    ".rs-loopled{width:10px;height:10px;border-radius:50%;flex:0 0 10px;",
    "  background:radial-gradient(circle at 35% 30%,#5a1612,#2a0b09 70%);",
    "  box-shadow:inset 0 0 2px #000,inset 0 0 0 1px rgba(0,0,0,.7);",
    "  transition:background .15s,box-shadow .15s}",
    ".rs-loopled.on{background:radial-gradient(circle at 35% 30%,#ff6b5a,#e0241a 60%,#8c0f0a);",
    "  box-shadow:0 0 9px rgba(255,60,40,.85),0 0 2px rgba(255,220,200,.9),inset 0 0 2px rgba(0,0,0,.4)}",
    ".rs-loopcap{font:600 10.5px/1 var(--rs-sans);letter-spacing:.14em;text-transform:uppercase;color:#C9BFAC}",
    /* The level readout is the clock's LED language one size down: a smoked-glass window
       with amber digits, so the number reads as part of the faceplate rather than as prose
       next to it. Discreet by size, not by being dim. */
    ".rs-vollab{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:3px}",
    ".rs-vollab small{margin:0}",
    ".rs-ledmini{display:inline-flex;align-items:center;justify-content:flex-end;min-width:42px;",
    "  padding:3px 6px 2px;border-radius:5px;border:1px solid #3B2C15;background-color:#120D07;",
    "  background-image:linear-gradient(180deg,#0B0805,#1A1208 62%,#0A0704);",
    "  box-shadow:inset 0 1px 4px rgba(0,0,0,.95),0 1px 0 rgba(255,255,255,.04);",
    "  font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#FFB454;",
    "  letter-spacing:.06em;font-variant-numeric:tabular-nums;text-shadow:0 0 5px rgba(255,150,40,.45)}",
    "html[data-rs-ui=full] .rs-transport #rsStop{width:52px;height:52px;border:0;border-radius:50%;",
    "  background-image:url(ui/amp-stop.webp);background-size:cover;background-position:center;",
    "  background-color:#100e0c;box-shadow:0 4px 12px rgba(0,0,0,.5)}",
    "html[data-rs-ui=full] #rsStop svg{display:none}",
    /* the level control is a fader sunk into the faceplate: the generated slot carries
     * the graduated scale, the generated knob rides it, so the slider reads as a piece
     * of amplifier hardware instead of a browser range input */
    "html[data-rs-ui=full] .rs-vol input[type=range]{-webkit-appearance:none;height:46px;background:transparent;",
    "  margin:0}",
    "html[data-rs-ui=full] .rs-vol input[type=range]::-webkit-slider-runnable-track{height:36px;border-radius:8px;",
    "  background-image:url(ui/amp-vol-track.webp);background-size:100% 100%;background-repeat:no-repeat;",
    "  border:1px solid rgba(0,0,0,.65);box-shadow:inset 0 2px 5px rgba(0,0,0,.7)}",
    "html[data-rs-ui=full] .rs-vol input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:34px;",
    "  height:46px;margin-top:-6px;border:0;border-radius:6px;",
    "  background-image:url(ui/amp-vol-knob.webp);background-size:cover;background-position:center;",
    "  filter:drop-shadow(0 2px 3px rgba(0,0,0,.65))}",
    "html[data-rs-ui=full] .rs-tile{background-size:cover;background-position:center;position:relative;",
    "  overflow:hidden;color:#F4F7F5;border-color:rgba(0,0,0,.5);background-color:#12100F}",
    "html[data-rs-ui=full] .rs-tile::after{content:\"\";position:absolute;top:0;right:0;bottom:0;left:0;",
    "  background:linear-gradient(100deg,rgba(6,8,7,.9),rgba(6,8,7,.55) 62%,rgba(6,8,7,.2))}",
    "html[data-rs-ui=full] .rs-tile > *{position:relative;z-index:1}",
    "html[data-rs-ui=full] .rs-tile b{color:#F4F7F5}",
    "html[data-rs-ui=full] .rs-tile span{color:#CFD8D3}",
    "html[data-rs-ui=full] .rs-tile svg{color:#EADFC9}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=sleep]{background-image:url(ui/tile-sleep.webp)}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=focus]{background-image:url(ui/tile-focus.webp)}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=relax]{background-image:url(ui/tile-relax.webp)}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=wake]{background-image:url(ui/tile-wake.webp)}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=drift]{background-image:url(ui/tile-drift.webp)}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=work]{background-image:url(ui/tile-work.webp)}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=meditate]{background-image:url(ui/tile-meditate.webp)}",
    "html[data-rs-ui=full] .rs-tile[data-rs-tile=morning]{background-image:url(ui/tile-morning.webp)}",
    /* session rows carry their band: a 3 px edge and a wash that dies out */
    "html[data-rs-ui=full] #plist .item{position:relative;overflow:hidden}",
    "html[data-rs-ui=full] #plist .item[data-band=sleep]{box-shadow:inset 3px 0 0 #6C81BE;",
    "  background-image:linear-gradient(92deg,rgba(108,129,190,.20),rgba(108,129,190,0) 52%)}",
    "html[data-rs-ui=full] #plist .item[data-band=focus]{box-shadow:inset 3px 0 0 #D2A659;",
    "  background-image:linear-gradient(92deg,rgba(210,166,89,.18),rgba(210,166,89,0) 52%)}",
    "html[data-rs-ui=full] #plist .item[data-band=relax]{box-shadow:inset 3px 0 0 #8E9E6B;",
    "  background-image:linear-gradient(92deg,rgba(142,158,107,.18),rgba(142,158,107,0) 52%)}",
    "html[data-rs-ui=full] #plist .item[data-band=wake]{box-shadow:inset 3px 0 0 #D8B45C;",
    "  background-image:linear-gradient(92deg,rgba(216,180,92,.18),rgba(216,180,92,0) 52%)}",
    "html[data-rs-ui=full] #plist .item[data-band=other]{box-shadow:inset 3px 0 0 #B6AFA3;",
    "  background-image:linear-gradient(92deg,rgba(182,175,163,.12),rgba(182,175,163,0) 52%)}",
    /* the same banding on the rail cards, a touch lighter because they are small */
    /* the session row's band, carried onto the app's cards: a 3 px edge and a wash that
       dies inside the first half of the box. Quieter than a row because a card is four
       times the area - the colour marks the section, it does not become the section. */
    "html[data-rs-ui=full] .rs-screen .card[data-band]{box-shadow:inset 3px 0 0 var(--rs-band,#B6AFA3)}",
    /* every card in the dark Full interface is the same brushed plate as the bars and the
       hero, under a scrim dark enough to keep body copy at full contrast; a banded card
       stacks its band wash on top of that material */
    "html[data-rs-ui=full][data-rs-theme=\"dark\"] .rs-screen section.card{background-image:",
    "  linear-gradient(160deg,rgba(22,18,14,.90),rgba(14,11,9,.945)),url(ui/strip.webp);",
    "  background-size:cover;background-position:center top;background-repeat:no-repeat;",
    "  border-color:#3B332B}",
    "html[data-rs-ui=full] .rs-screen .card[data-band]{background-image:",
    "  linear-gradient(100deg,var(--rs-band-wash2,rgba(182,175,163,.08)),rgba(0,0,0,0) 52%),",
    "  linear-gradient(160deg,rgba(22,18,14,.90),rgba(14,11,9,.945)),url(ui/strip.webp);",
    "  background-size:100% 100%,cover,cover;background-position:left top,center top,center top;",
    "  background-repeat:no-repeat}",
    "html[data-rs-ui=full] .rs-screen .card[data-band=sleep]{--rs-band:#6C81BE;--rs-band-wash2:rgba(108,129,190,.09)}",
    "html[data-rs-ui=full] .rs-screen .card[data-band=focus]{--rs-band:#D2A659;--rs-band-wash2:rgba(210,166,89,.09)}",
    "html[data-rs-ui=full] .rs-screen .card[data-band=relax]{--rs-band:#8E9E6B;--rs-band-wash2:rgba(142,158,107,.09)}",
    "html[data-rs-ui=full] .rs-screen .card[data-band=wake]{--rs-band:#D8B45C;--rs-band-wash2:rgba(216,180,92,.09)}",
    "html[data-rs-ui=full] .rs-screen .card[data-band=other]{--rs-band:#B6AFA3;--rs-band-wash2:rgba(182,175,163,.08)}",
    /* the same band language on the small hardware: quick-pick chips carry their session's
       colour, and every pressed toggle takes the band of the card it lives in (CSS vars
       inherit, so a chip in the amber Studio card rings amber, one in a silver rail rings
       silver). At rest a toggle keeps only a hairline edge - the colour marks state. */
    "html[data-rs-ui=full] #quickpick button.chip[data-band]{background-image:",
    "  linear-gradient(100deg,var(--rs-band-wash2,rgba(182,175,163,.10)),rgba(0,0,0,0) 72%)}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=sleep]{--rs-band-wash2:rgba(108,129,190,.12)}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=focus]{--rs-band-wash2:rgba(210,166,89,.12)}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=relax]{--rs-band-wash2:rgba(142,158,107,.12)}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=wake]{--rs-band-wash2:rgba(216,180,92,.12)}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=other]{--rs-band-wash2:rgba(182,175,163,.10)}",
    "html[data-rs-ui=full] .rs-seg button[aria-pressed=true],",
    "html[data-rs-ui=full] #rsFilters button[aria-pressed=true],",
    "html[data-rs-ui=full] #rsVisToggles button[aria-pressed=true],",
    "html[data-rs-ui=full] #rsScenes button[aria-pressed=true],",
    "html[data-rs-ui=full] #rsMedia button[aria-pressed=true],",
    "html[data-rs-ui=full] #rsAccents button[aria-pressed=true],",
    "html[data-rs-ui=full] #plist .rs-chip[aria-pressed=true]{",
    "  box-shadow:inset 0 0 0 1px var(--rs-band,#B6AFA3);",
    "  background-image:linear-gradient(180deg,var(--rs-band-wash2,rgba(182,175,163,.12)),rgba(0,0,0,0))}",
    "html[data-rs-ui=full] .rs-seg button{box-shadow:inset 0 0 0 1px rgba(59,51,43,.9)}",
    "html[data-rs-ui=full] .rs-card[data-band]{box-shadow:inset 3px 0 0 var(--rs-band,#B6AFA3);",
    "  background-image:linear-gradient(100deg,var(--rs-band-wash,transparent),transparent 70%)}",
    "html[data-rs-ui=full] .rs-card[data-band=sleep]{--rs-band:#6C81BE;--rs-band-wash:rgba(108,129,190,.18)}",
    "html[data-rs-ui=full] .rs-card[data-band=focus]{--rs-band:#D2A659;--rs-band-wash:rgba(210,166,89,.16)}",
    "html[data-rs-ui=full] .rs-card[data-band=relax]{--rs-band:#8E9E6B;--rs-band-wash:rgba(142,158,107,.16)}",
    "html[data-rs-ui=full] .rs-card[data-band=wake]{--rs-band:#D8B45C;--rs-band-wash:rgba(216,180,92,.16)}",
    "html[data-rs-ui=full] .rs-card[data-band=other]{--rs-band:#B6AFA3;--rs-band-wash:rgba(182,175,163,.12)}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band]{box-shadow:inset 3px 0 0 var(--rs-band,#B6AFA3)}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=sleep]{--rs-band:#6C81BE}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=focus]{--rs-band:#D2A659}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=relax]{--rs-band:#8E9E6B}",
    "html[data-rs-ui=full] #quickpick button.chip[data-band=wake]{--rs-band:#D8B45C}",
    /* the same faceplate material on the chrome: player bar, app bar, nav, viewer controls */
    "html[data-rs-ui=full] #rsMini{background-image:url(ui/strip.webp);background-size:cover;",
    "  background-position:center;background-color:#141210;border:1px solid #2A2318;border-radius:14px;",
    "  padding:6px 8px;color:#F2F6F4}",
    "html[data-rs-ui=full] #rsMini b{color:#F6FAF8}",
    "html[data-rs-ui=full] #rsMini span{color:#C9D3CE}",
    "html[data-rs-ui=full] #rsMiniPlay{background-image:url(ui/amp-play.webp);background-size:cover;",
    "  background-position:center;background-color:#100e0c;box-shadow:0 3px 9px rgba(0,0,0,.55);position:relative}",
    "html[data-rs-ui=full].rs-playing #rsMiniPlay{background-image:url(ui/amp-pause.webp)}",
    "html[data-rs-ui=full] #rsMiniPlay svg{display:none}",
    "html[data-rs-ui=full] #rsMiniStop{width:44px;height:44px;background-image:url(ui/amp-stop.webp);",
    "  background-size:cover;background-position:center;background-color:#100e0c;border:0;",
    "  box-shadow:0 3px 9px rgba(0,0,0,.5)}",
    "html[data-rs-ui=full] #rsMiniStop svg{display:none}",
    "html[data-rs-ui=full] #rsMiniMute{background:transparent;border:0;color:#D8D2C6}",
    "html[data-rs-ui=full] #rsMiniVol{-webkit-appearance:none;height:40px;background:transparent;margin:0}",
    "html[data-rs-ui=full] #rsMiniVol::-webkit-slider-runnable-track{height:26px;border-radius:6px;",
    "  background-image:url(ui/amp-vol-track.webp);background-size:100% 100%;background-repeat:no-repeat;",
    "  border:1px solid rgba(0,0,0,.65)}",
    "html[data-rs-ui=full] #rsMiniVol::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:34px;",
    "  margin-top:-5px;border:0;border-radius:4px;background-image:url(ui/amp-vol-knob.webp);",
    "  background-size:cover;background-position:center;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))}",
    "html[data-rs-ui=full] #rsBar{background-image:url(ui/strip.webp);background-size:cover;",
    "  background-position:center top;background-color:transparent}",
    "html[data-rs-ui=full] #rsNav{background-image:url(ui/strip.webp);background-size:cover;",
    "  background-position:center bottom;background-color:#141210}",
    "html[data-rs-ui=full] #rsNav button[aria-selected=true]{background:rgba(224,185,111,.14)}",
    "html[data-rs-ui=full] #rsNav button{color:#C9D3CE}",
    "html[data-rs-ui=full] #rsNav button[aria-selected=true]{color:#F8F1E1}",
    "html[data-rs-ui=full] #rsFsCtl .rs-fs-play{font-size:0;border:0;background-color:#100e0c;",
    "  background-image:url(ui/amp-play.webp);background-size:cover;background-position:center}",

    /* --------------------------------------------------------------- tiles --- */
    ".rs-states{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 16px 12px}",
    ".rs-tile{min-height:132px;text-align:left;border-radius:var(--rs-r-md);border:1px solid var(--rs-line);",
    "  background:var(--rs-s1);color:var(--rs-ink);padding:13px;display:flex;flex-direction:column;",
    "  justify-content:space-between;gap:8px;cursor:pointer;font:inherit}",
    ".rs-tile:active{background:var(--rs-s3)}",
    ".rs-tile svg{width:22px;height:22px;color:var(--rs-pri)}",
    ".rs-tile b{display:block;font-size:15px;font-weight:600}",
    ".rs-tile span{display:block;font-size:12px;line-height:16px;color:var(--rs-dim);",
    "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",

    /* --------------------------------------------------------------- build --- */
    ".rs-build .rs-field{margin:0 0 14px}",
    ".rs-build .rs-field label{display:flex;justify-content:space-between;align-items:baseline;",
    "  font:600 13px/1.4 inherit;color:var(--rs-ink2);margin-bottom:2px}",
    ".rs-build .rs-field output{font-variant-numeric:tabular-nums;color:var(--rs-pri);font-weight:700}",
    ".rs-build .rs-field .rs-sub{font-size:12px;color:var(--rs-out);margin-top:-2px;display:block}",
    ".rs-seg{display:flex;gap:6px;margin:0 0 14px}",
    ".rs-seg button{flex:1 1 0;min-height:48px;border-radius:var(--rs-r-sm);border:1px solid var(--rs-line2);",
    "  background:transparent;color:var(--rs-ink2);font:600 13px/1 var(--rs-sans);cursor:pointer}",
    ".rs-seg button[aria-pressed=\"true\"]{background:var(--rs-pri-c);border-color:transparent;",
    "  color:var(--rs-on-pri-c)}",

    /* ------------------------------------------------------------------ nav --- */
    "#rsNav{flex:0 0 auto;display:flex;background:var(--rs-s1);border-top:1px solid var(--rs-line);",
    "  padding:6px 4px calc(6px + " + SAFE_B + ")}",
    /* the tab bar is static: it is the way out of every screen, so it never hides */
    "#rsNav button{flex:1 1 0;min-height:56px;border:0;background:transparent;color:var(--rs-dim);",
    "  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;",
    "  cursor:pointer;padding:0;position:relative;font:600 11px/1 var(--rs-sans)}",
    "#rsNav button svg{width:24px;height:24px}",
    "#rsNav button .rs-npill{position:absolute;top:3px;width:60px;height:32px;border-radius:999px;",
    "  background:transparent;transition:background .18s var(--rs-ease)}",
    "#rsNav button[aria-selected=\"true\"]{color:var(--rs-on-pri-c)}",
    "#rsNav button[aria-selected=\"true\"] .rs-npill{background:var(--rs-pri-c)}",
    "#rsNav button svg{position:relative;z-index:1;margin-top:6px}",
    "#rsNav button span{position:relative;z-index:1}",

    /* ---------------------------------------------------------- mini player --- */
    "#rsMini{flex:0 0 auto;display:none;align-items:center;gap:10px;margin:0 10px 8px;",
    "  padding:8px 8px 8px 14px;border-radius:16px;background:var(--rs-s2);border:1px solid var(--rs-line);",
    "  transition:transform .28s var(--rs-ease),opacity .22s ease}",
    /* the player is static now: no minihide transform, no opacity fade */
    "#rsMini.rs-on{display:flex}",
    "#rsMini .rs-mt{flex:1 1 auto;min-width:0}",
    "#rsMini b{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;",
    "  text-overflow:ellipsis}",
    "#rsMini span{display:block;font-size:12px;color:var(--rs-dim);font-variant-numeric:tabular-nums}",
    "#rsMini button{width:48px;height:48px;flex:0 0 auto;border:0;border-radius:50%;",
    "  background:var(--rs-pri);color:var(--rs-on-pri);display:flex;align-items:center;",
    "  justify-content:center;cursor:pointer;padding:0}",
    "#rsMini button svg{width:22px;height:22px}",
    "#rsMini .rs-mini-stop{background:var(--rs-s3);color:var(--rs-ink);border:1px solid var(--rs-line2)}",
    /* the level row: a mute toggle and the fader, on both the hero and the mini player */
    ".rs-volrow{display:flex;align-items:center;gap:6px;flex:1 1 auto;min-width:0}",
    ".rs-volrow input[type=range]{flex:1 1 auto;min-width:0}",
    ".rs-vol small{display:block;margin-bottom:2px}",
    ".rs-mute{width:44px;height:44px;flex:0 0 auto;display:inline-flex;align-items:center;",
    "  justify-content:center;border:1px solid transparent;border-radius:50%;background:transparent;",
    "  color:var(--rs-ink)}",
    ".rs-mute svg{width:24px;height:24px;display:block}",
    ".rs-mute[aria-pressed=true]{color:var(--rs-live)}",
    "html[data-rs-ui=full] .rs-mute{color:#EFE7D6;background:rgba(0,0,0,.28);",
    "  border-color:rgba(255,255,255,.14)}",
    "html[data-rs-ui=full] .rs-mute[aria-pressed=true]{color:var(--rs-live);",
    "  background:rgba(0,0,0,.42);border-color:var(--rs-live)}",
    "#rsMini .rs-mini-mute{width:44px;height:44px}",
    "#rsMini .rs-mini-mute svg{width:19px;height:19px}",
    "#rsMini input[type=range]{flex:0 1 96px;min-width:56px;max-width:132px;height:36px;margin:0;",
    "  accent-color:var(--rs-live);background:transparent}",

    /* --------------------------------------------------------------- sheet --- */
    "#rsScrim{position:fixed;top:0;right:0;bottom:0;left:0;z-index:85;background:rgba(6,9,8,.55);" +
    "  opacity:0;pointer-events:none;transition:opacity .22s var(--rs-ease)}" +
    "html.rs-sheet #rsScrim{opacity:1;pointer-events:auto}" +
    "#rsSheet{position:fixed;left:0;right:0;bottom:var(--rs-sheet-lift,0px);z-index:86;display:flex;",
    "  flex-direction:column;",
    "  background:var(--rs-s2);color:var(--rs-ink);border-radius:var(--rs-r-sheet) var(--rs-r-sheet) 0 0;",
    "  border-top:1px solid var(--rs-line);box-shadow:0 -18px 44px rgba(0,0,0,.45);",
    /* 110% clears a sheet that sits on the bottom edge; a lifted one needs the lift too,
       and a hidden dialog must not keep taking taps or focus */
    "  transform:translateY(calc(110% + var(--rs-sheet-lift,0px)));",
    "  visibility:hidden;transition:transform .26s var(--rs-ease),visibility 0s linear .26s;",
    "  padding-bottom:calc(8px + " + SAFE_B + ");max-height:82vh}",
    "#rsSheet.rs-open{transform:none;visibility:visible;",
    "  transition:transform .26s var(--rs-ease)}",
    "#rsSheet.rs-drag{transition:none}",
    "#rsSheet .rs-grab{height:26px;display:flex;align-items:center;justify-content:center;",
    "  touch-action:none;cursor:grab}",
    "#rsSheet .rs-grab i{width:36px;height:4px;border-radius:2px;background:var(--rs-line2)}",
    "#rsSheet .rs-shead{display:flex;align-items:center;gap:8px;padding:0 20px 10px}",
    "#rsSheet .rs-shead b{flex:1 1 auto;font-size:16px}",
    "#rsSheet .rs-sbody{overflow-y:auto;padding:0 10px 10px}",
    ".rs-mrow{width:100%;display:flex;align-items:center;gap:0;min-height:56px !important;padding:8px 12px;",
    "  border:0;border-radius:var(--rs-r-sm);background:transparent;color:var(--rs-ink);text-align:left;",
    "  cursor:pointer;font:inherit}",
    ".rs-mrow:active{background:var(--rs-s3)}",
    ".rs-mrow .rs-mtxt{flex:1 1 auto;min-width:0}",
    ".rs-mrow b{display:block;font-size:15px;font-weight:600}",
    ".rs-mrow span{display:block;font-size:12.5px;color:var(--rs-dim)}",
    ".rs-mrow svg{flex:0 0 auto;color:var(--rs-ink2)}",

    /* -------------------------------------------------------------- generic --- */
    ".rs-pad{height:8px}",
    ".rs-stats{display:flex;gap:8px;margin:0 16px 12px;flex-wrap:wrap}",
    ".rs-stat{flex:1 1 0;min-width:0;border-radius:12px;background:var(--rs-s1);",
    "  border:1px solid var(--rs-line);padding:9px 10px}",
    ".rs-stat b{display:block;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}",
    ".rs-stat span{display:block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;",
    "  color:var(--rs-out);margin-top:2px}",
    ".rs-mod{margin:0 16px 12px !important}",
    ".rs-mod > summary{min-height:56px;display:flex;align-items:center;justify-content:space-between;",
    "  font-size:15px;font-weight:700}",
    ".rs-mod > summary::after{content:'\u2039';transform:rotate(-90deg);color:var(--rs-out);",
    "  transition:transform .18s var(--rs-ease)}",
    ".rs-mod[open] > summary::after{transform:rotate(90deg)}",
    ".rs-mod .body > section.card{margin:0 !important;padding:6px 0 14px;background:transparent;",
    "  border:0;box-shadow:none}",
    ".rs-note{font-size:12.5px;line-height:18px;color:var(--rs-out);margin:10px 0 0}",
    ".rs-kv{display:flex;justify-content:space-between;gap:12px;padding:10px 0;",
    "  border-bottom:1px solid var(--rs-line);font-size:14px}",
    ".rs-kv:last-child{border-bottom:0}",
    ".rs-kv b{color:var(--rs-dim);font-weight:500}",
    ".rs-kv span{font-variant-numeric:tabular-nums;text-align:right}",
    ".rs-swatches{display:flex;gap:10px;margin:2px 0 12px;flex-wrap:wrap}",
    ".rs-swatch{width:44px;height:44px;border-radius:50%;border:2px solid var(--rs-line2);",
    "  background:var(--sw);cursor:pointer;padding:0;position:relative}",
    ".rs-swatch[aria-pressed=\"true\"]{border-color:var(--rs-ink);border-width:3px}",
    ".rs-swatch[aria-pressed=\"true\"]::after{content:'';position:absolute;top:50%;left:50%;",
    "  width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:var(--rs-ink)}",
    ".rs-sw{display:flex;align-items:center;gap:14px;min-height:56px;padding:6px 0}",
    ".rs-sw .rs-swt{flex:1 1 auto;min-width:0}",
    ".rs-sw b{display:block;font-size:15px;font-weight:600;margin-bottom:2px}",
    ".rs-sw span{display:block;font-size:12.5px;line-height:17px;color:var(--rs-dim)}",
    ".rs-sw input{position:absolute;opacity:0;width:1px;height:1px}",
    ".rs-sw .rs-track{flex:0 0 auto;width:52px;height:32px;border-radius:16px;background:var(--rs-s4);",
    "  border:2px solid var(--rs-out);position:relative;transition:background .16s,border-color .16s}",
    ".rs-sw .rs-track::after{content:'';position:absolute;top:6px;left:6px;width:16px;height:16px;",
    "  border-radius:50%;background:var(--rs-out);transition:transform .16s var(--rs-ease),background .16s}",
    ".rs-sw input:checked + .rs-track{background:var(--rs-pri);border-color:var(--rs-pri)}",
    ".rs-sw input:checked + .rs-track::after{transform:translateX(20px);background:var(--rs-on-pri)}",
    ".rs-sw input:focus-visible + .rs-track{outline:2.5px solid var(--rs-pri);outline-offset:2px}",

    /* --------------------------------------------------------------- toast --- */
    /* The page's .toast centres itself with left:50% + translateX(-50%). The shell turns it
       into a top banner by pinning left/right — and left the transform in place, so the bar
       was pushed half its width off the glass (-159 px on a 390 px viewport) and the only
       thing on screen was the empty right end of the pill. Drop the transform with it. */
    "html.rs-app #toast{left:16px !important;right:16px !important;bottom:auto !important;",
    "  top:calc(10px + " + SAFE_T + ") !important;transform:none !important;",
    "  z-index:120 !important;border-radius:var(--rs-r-sm)}",
    "html.rs-app #toast.show{transform:none !important}",
    "html.rs-app #prog:not([hidden]){display:block !important;position:fixed;left:14px;right:14px;",
    "  bottom:calc(150px + " + SAFE_B + ");height:8px;z-index:78;accent-color:var(--rs-pri)}",

    /* ------------------------------------------------------------ studio --- */
    /* the studio opens on what is loaded: a title, four numbers that each mean one
       thing, and the transport. Everything else follows that reading order. */
    ".rs-now-top{display:flex;align-items:center;gap:10px;margin:0 0 12px}",
    ".rs-now-top h3{margin:0 !important;flex:1 1 auto;min-width:0;overflow:hidden;",
    "  text-overflow:ellipsis;white-space:nowrap}",
    ".rs-stpill{flex:0 0 auto;font:600 10.5px/1 var(--rs-sans);letter-spacing:.1em;",
    "  text-transform:uppercase;padding:5px 9px;border-radius:999px;border:1px solid var(--rs-line2);",
    "  color:var(--rs-dim)}",
    ".rs-stpill[data-state=playing]{background:var(--rs-live);border-color:transparent;color:var(--rs-on-live)}",
    ".rs-stpill[data-state=paused]{border-color:var(--rs-pri);color:var(--rs-pri)}",
    ".rs-stpill[data-state=ready]{border-color:var(--rs-line2);color:var(--rs-ink2)}",
    ".rs-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px}",
    ".rs-mtile{background:var(--rs-bg);border:1px solid var(--rs-line);border-radius:var(--rs-r-sm);",
    "  padding:8px 5px;text-align:center;min-width:0}",
    ".rs-mtile b{display:block;font:700 15px/1.15 var(--rs-sans);color:var(--rs-ink);",
    "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".rs-mtile span{display:block;margin-top:3px;font:600 9.5px/1.15 var(--rs-sans);letter-spacing:0;",
    "  text-transform:uppercase;color:var(--rs-dim);white-space:normal;overflow-wrap:anywhere}",
    ".rs-nowtr{display:flex;align-items:center;gap:10px}",
    /* the same machined keys as the hero and the chamber: the generated brass faces,
       play and pause as separate keys so the shape says what a press will do */
    ".rs-ampk{border:0;border-radius:50%;padding:0;flex:0 0 auto;cursor:pointer;",
    "  background-color:#100e0c;background-size:cover;background-position:center;",
    "  transition:transform .12s var(--rs-ease)}",
    ".rs-stuplay{width:56px;height:56px;background-image:url(ui/amp-play.webp);",
    "  box-shadow:0 5px 14px rgba(0,0,0,.5)}",
    ".rs-stupause{width:48px;height:48px;background-image:url(ui/amp-pause.webp);opacity:.9;",
    "  box-shadow:0 4px 12px rgba(0,0,0,.5)}",
    ".rs-stustop{width:48px;height:48px;background-image:url(ui/amp-stop.webp);",
    "  box-shadow:0 4px 12px rgba(0,0,0,.5)}",
    ".rs-stuplay:active,.rs-stupause:active,.rs-stustop:active{transform:scale(.95)}",
    ".rs-stuplay.rs-live{box-shadow:0 5px 14px rgba(0,0,0,.5),0 0 0 2px var(--rs-live)}",
    ".rs-stupause.rs-dim{opacity:.55}",
    /* the master fader: a sunk slot with a knurled brass thumb, sized to stay 44 px */
    ".rs-stuvol{display:flex;align-items:center;flex:1 1 auto;min-width:64px;height:48px;margin-left:2px}",
    "#rsStuVol{width:100%;height:44px;margin:0;-webkit-appearance:none;background:transparent;",
    "  accent-color:#C9A227}",
    "#rsStuVol::-webkit-slider-runnable-track{height:28px;border-radius:7px;",
    "  background:linear-gradient(180deg,#2B231A,#14100C);border:1px solid rgba(0,0,0,.8);",
    "  box-shadow:inset 0 2px 6px rgba(0,0,0,.8)}",
    "#rsStuVol::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:34px;",
    "  margin-top:-4px;border-radius:5px;border:1px solid rgba(0,0,0,.7);",
    "  background:linear-gradient(180deg,#E7C98A,#8A6A33 58%,#3B2C15);",
    "  box-shadow:0 2px 5px rgba(0,0,0,.65)}",
    /* the loop switch is part of the faceplate too: a brass collar in a sunk slot,
       not the app-wide accent pill, so the transport reads as one piece of hardware */
    "#rsNow .rs-stuloop .rs-track{width:46px;height:26px;border-radius:13px;",
    "  background:linear-gradient(180deg,#2B231A,#14100C);border:1px solid rgba(0,0,0,.8);",
    "  box-shadow:inset 0 2px 5px rgba(0,0,0,.75)}",
    "#rsNow .rs-stuloop .rs-track::after{width:20px;height:20px;top:2px;left:2px;",
    "  border:1px solid rgba(0,0,0,.7);background:linear-gradient(180deg,#E7C98A,#8A6A33 58%,#3B2C15);",
    "  box-shadow:0 1px 3px rgba(0,0,0,.6)}",
    "#rsNow .rs-stuloop input:checked + .rs-track{background:linear-gradient(180deg,#5A4520,#2A2010);",
    "  border-color:#8A6A33}",
    "#rsNow .rs-stuloop input:checked + .rs-track::after{transform:translateX(22px)}",
    ".rs-nowtr2{display:flex;align-items:center;gap:10px;margin-top:10px}",
    ".rs-nowclock{flex:1 1 auto;text-align:left;font:600 12.5px/1 var(--rs-sans);",
    "  font-variant-numeric:tabular-nums;color:var(--rs-ink2);white-space:nowrap}",
    ".rs-stuloop{flex:0 0 auto;min-height:44px;padding:0;gap:8px}",
    ".rs-stuloop .rs-swt span{font-size:12px;color:var(--rs-dim)}",
    ".rs-nowneed{margin:10px 0 0;font-size:12.5px;line-height:17px;color:var(--rs-dim)}",
    ".rs-nowneed:empty{display:none}",
    /* the mix: one row per layer, and only the open row carries an editor */
    ".rs-mix-top{display:flex;align-items:center;gap:8px;margin:0 0 2px}",
    ".rs-mix-top h3{margin:0 !important;flex:1 1 auto}",
    ".rs-cnt{font:600 12px/1 var(--rs-sans);color:var(--rs-dim)}",
    ".rs-mrows{margin:10px 0 0}",
    ".rs-lay{border:1px solid var(--rs-line);border-radius:var(--rs-r-sm);background:var(--rs-bg);",
    "  margin:0 0 8px;overflow:hidden}",
    ".rs-lay.open{border-color:var(--rs-line2);background:var(--rs-s1)}",
    ".rs-mhead{display:flex;align-items:stretch}",
    ".rs-mopen{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:10px;min-height:56px;",
    "  padding:8px 6px 8px 12px;border:0;background:transparent;color:var(--rs-ink);text-align:left;cursor:pointer}",
    ".rs-mdot{flex:0 0 10px;width:10px;height:10px;border-radius:50%;background:#D2A659}",
    ".rs-mdot[data-d='1']{background:#8E9E6B}",
    ".rs-mdot[data-d='2']{background:#6C81BE}",
    ".rs-mdot[data-d='3']{background:#D8B45C}",
    ".rs-mdot[data-d='4']{background:#B6AFA3}",
    ".rs-mdot[data-d='5']{background:#C88A6A}",
    ".rs-mtxt{flex:1 1 auto;min-width:0;display:block}",
    ".rs-mtxt b{display:block;font:600 14.5px/1.25 var(--rs-sans);color:var(--rs-ink);",
    "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".rs-mtxt span{display:block;font-size:12px;line-height:16px;color:var(--rs-dim);",
    "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".rs-mlvl{flex:0 0 auto;font:600 12px/1 var(--rs-sans);font-variant-numeric:tabular-nums;",
    "  color:var(--rs-ink2)}",
    ".rs-mopen svg{flex:0 0 18px;width:18px;height:18px;color:var(--rs-dim);transition:transform .18s}",
    ".rs-lay.open .rs-mopen svg{transform:rotate(90deg)}",
    ".rs-mmini{flex:0 0 auto;min-width:56px;padding:0 12px;border:0;border-left:1px solid var(--rs-line);",
    "  background:transparent;color:var(--rs-dim);font:600 11.5px/1 var(--rs-sans);cursor:pointer}",
    ".rs-mmini.on{color:var(--rs-bad);background:rgba(0,0,0,.25)}",
    ".rs-medit{padding:2px 14px 12px;border-top:1px solid var(--rs-line)}",
    ".rs-mfield{margin:10px 0 0}",
    ".rs-mfield label{display:flex;align-items:baseline;gap:8px;font:600 12.5px/1.2 var(--rs-sans);",
    "  color:var(--rs-ink2);margin:0 0 6px}",
    ".rs-mfield output{margin-left:auto;font:600 12.5px/1 var(--rs-sans);color:var(--rs-pri);",
    "  font-variant-numeric:tabular-nums}",
    ".rs-mfield input[type=range]{width:100%;height:44px;margin:0;accent-color:var(--rs-pri)}",
    ".rs-mfield .rs-sub{display:block;margin:2px 0 0;font-size:11.5px;line-height:16px;color:var(--rs-dim)}",
    ".rs-medit-foot{display:flex;gap:8px;margin:12px 0 0;flex-wrap:wrap}",
    ".rs-mini{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--rs-line2);",
    "  background:transparent;color:var(--rs-ink2);font:600 12px/1 var(--rs-sans);cursor:pointer}",
    ".rs-mini.rs-del{color:var(--rs-bad);border-color:rgba(200,90,80,.45)}",
    ".rs-addbtn{margin:2px 0 0;width:100%}",
    ".rs-addpane{margin:12px 0 0;padding:12px 0 0;border-top:1px solid var(--rs-line)}",
    ".rs-chapters{display:flex;gap:6px;overflow-x:auto;padding:0 0 10px;-webkit-overflow-scrolling:touch}",
    ".rs-chapters button{flex:0 0 auto;min-height:40px;padding:0 13px;border-radius:999px;",
    "  border:1px solid var(--rs-line2);background:transparent;color:var(--rs-ink2);",
    "  font:600 12px/1 var(--rs-sans);cursor:pointer}",
    ".rs-chapters button[aria-selected='true']{background:var(--rs-pri-c);border-color:transparent;",
    "  color:var(--rs-on-pri-c)}",
    "#rsChapPanel .card,#rsChapPanel details{background:transparent !important;border:0 !important;",
    "  padding:0 !important;margin:0 !important;box-shadow:none !important}",
    "#rsChapPanel summary{display:none}",
    "#rsChapPanel .rs-chapoff{display:none !important}",
    "#rsChapPanel .hint{font-size:12px;line-height:17px;color:var(--rs-dim);margin:0 0 8px}",
    "#rsChapPanel .chips{display:grid !important;grid-template-columns:1fr 1fr;gap:6px}",
    "#rsChapPanel .chips button.chip{width:100%;min-height:44px;padding:0 10px;border-radius:999px;",
    "  border:1px solid var(--rs-line2);background:transparent;color:var(--rs-ink2);",
    "  font:600 12.5px/1 var(--rs-sans)}",
    "#rsChapPanel #rsBuild{padding:0 !important}",
    "#rsChapPanel #rsBuild h3{display:none}",

    /* every option carries its own mark: a palette swatch in the colours it renders,
       or a shape for the looks that have no colour of their own. Small and quiet — the
       chip's label still says the name; the mark only has to be recognisable. */
    ".rs-swb{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:7px;",
    "  vertical-align:-1px;flex:0 0 12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.34)}",
    ".rs-mk{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;",
    "  flex:0 0 16px;opacity:.85;color:currentColor}",
    ".rs-mk svg{width:16px;height:16px;display:block}",
    "#vizBackdrops .chip,#vizOverlays .chip,#vizPalettes .chip{display:inline-flex;align-items:center;gap:0}",
    "#rsScenes button,#cymPal .cym-chip{display:inline-flex;align-items:center}",
    "#vizBackdrops .chip .rs-mk,#vizOverlays .chip .rs-mk{margin-right:6px}",
    /* ---------------------------------------------------- visualise section --- */
    ".rs-map{font-variant-numeric:tabular-nums;font-size:13px;line-height:19px;color:var(--rs-ink2);",
    "  background:var(--rs-bg);border:1px solid var(--rs-line);border-radius:var(--rs-r-sm);padding:12px;margin:10px 0}",
    ".rs-map b{color:var(--rs-pri)}",
    ".rs-chips{display:flex;gap:8px;overflow-x:auto;padding:0 0 10px;-webkit-overflow-scrolling:touch}",
    ".rs-chips button{flex:0 0 auto;min-height:48px;border-radius:999px;border:1px solid var(--rs-line2);",
    "  background:transparent;color:var(--rs-ink2);font:600 13px/1 var(--rs-sans);padding:0 15px;cursor:pointer}",
    ".rs-chips button[aria-pressed=\"true\"]{background:var(--rs-pri-c);border-color:transparent;",
    "  color:var(--rs-on-pri-c)}",
    "#vizCard .viz-inline{margin:0}",
    /* the focus picker: one card per scene, and the still is the label */
    ".rs-focusgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 0 10px}",
    ".rs-fscard{position:relative;display:block;min-height:112px;padding:0;border:1px solid var(--rs-line2);",
    "  border-radius:14px;overflow:hidden;background-color:var(--rs-s2);background-size:cover;",
    "  background-position:center;color:var(--rs-ink);text-align:left;cursor:pointer}",
    ".rs-fscard::after{content:\"\";position:absolute;inset:0;",
    "  background:linear-gradient(180deg,rgba(8,7,6,.10) 0%,rgba(8,7,6,.62) 55%,rgba(8,7,6,.92) 100%)}",
    ".rs-fscard .rs-fsname{position:relative;z-index:1;display:block;margin:62px 10px 0;",
    "  font:600 13px/1.25 var(--rs-sans)}",
    ".rs-fscard .rs-fsblurb{position:relative;z-index:1;display:block;margin:3px 10px 10px;",
    "  font:400 11px/1.3 var(--rs-sans);color:#C9BFAC}",
    ".rs-fscard[aria-pressed=\"true\"]{border-color:var(--rs-pri);box-shadow:0 0 0 2px var(--rs-pri-c)}",
    ".rs-fscard-legacy{min-height:72px;background-image:none !important}",
    ".rs-fscard-legacy .rs-fsname{margin-top:14px}",
    ".rs-focusmore{width:100%;min-height:44px;border-radius:var(--rs-r-sm);border:1px solid var(--rs-line2);",
    "  background:transparent;color:var(--rs-ink2);font:600 13px/1 var(--rs-sans);cursor:pointer}",
    "#vizCard canvas.viz-canvas{width:100% !important;height:190px !important;border-radius:var(--rs-r-sm);",
    "  border:1px solid var(--rs-line)}",
    "#vizCard .viz-badge{font-size:11px}",
    ".rs-screen #pklist{grid-template-columns:1fr;gap:8px}",
    ".rs-screen #pklist > div{padding:0 14px;border-radius:var(--rs-r-sm);background:var(--rs-s2)}",
    ".rs-screen #pklist a{display:flex;align-items:center;min-height:56px;font-size:15px;",
    "  color:var(--rs-ink);text-decoration:none}",
    ".rs-screen #pklist .pk-n{padding-bottom:10px;margin-top:-8px;color:var(--rs-dim)}",
    "#vizCard .cym-entry,#vizCard button[data-cym]{display:none}",
    "#vizCard button,#vizCard .ghost{color:var(--rs-ink2) !important}",
    ".rs-screen #vizCard button{min-height:40px;border-radius:var(--rs-r-xs);",
    "  border:1px solid var(--rs-line2) !important;background-color:var(--rs-s2) !important}",
    ".rs-screen #vizCard .ghost{background-color:transparent !important}",
    ".rs-screen #vizCard .vz-scenes button{min-width:40px;padding:0 6px;background-color:transparent !important}",
    "#vizCard select,#vizCard input{color:var(--rs-ink) !important}",
    "#vizCard .viz-scenes button{min-width:0 !important}",

    /* ------------------------------------------------- old-WebView fallbacks --- */
    /* The system WebView on older devices predates flex `gap`. Every row that relies on
       gap for structure also gets a sibling margin, so spacing survives either way. */
    ".rs-transport{gap:0}.rs-transport > * + *{margin-left:14px}",
    ".rs-hero-top{gap:0}.rs-hero-top > * + *{margin-left:10px}",
    ".rs-seg{gap:0}.rs-seg > * + *{margin-left:6px}",
    ".rs-chips{display:flex;flex-wrap:wrap;overflow:visible;gap:0}",
    ".rs-chips > *{margin:0 8px 0 0}",
    ".rs-screen .chips{display:flex;flex-wrap:wrap;gap:0}",
    ".rs-screen .chips > *{margin:0 8px 8px 0}",
    ".rs-screen #plist .item{gap:0}",
    ".rs-screen #plist .item .star{margin-right:8px}",
    ".rs-screen #voicelist .vrow{gap:0}",
    ".rs-screen #voicelist .vrow > * + *{margin-left:8px}",
    ".rs-tile{gap:0}",
    ".rs-tile > * + *{margin-top:8px}",
    ".rs-mrow{gap:0}.rs-mrow > * + *{margin-left:14px}",
    ".rs-sw{gap:0}.rs-sw > * + *{margin-left:14px}",
    "#rsMini{gap:0}#rsMini > * + *{margin-left:10px}",
    "#rsTop{gap:0}#rsTop > * + *{margin-left:4px}",
    ".rs-screen .row{gap:0}.rs-screen .row > * + *{margin-left:8px}",
    "#rsNav button{min-width:0}",
    ".rs-screen .card h3 + .chips,.rs-screen .card h3 + .row{margin-top:2px}",
    /* ------------------------------------------------------------ state layer --- */
    ".rs-ico,button.rs-btn,.rs-tile,.rs-mrow,.rs-chipbtn,.rs-screen .chip,.rs-chips button,",
    ".rs-screen #plist .item,.rs-screen #plist .star,#rsNav button,#rsMini button{position:relative;",
    "  overflow:hidden;-webkit-tap-highlight-color:transparent}",
    ".rs-ico::before,button.rs-btn::before,.rs-tile::before,.rs-mrow::before,.rs-chipbtn::before,",
    ".rs-screen .chip::before,.rs-chips button::before,.rs-screen #plist .item::before,",
    ".rs-screen #plist .star::before,#rsNav button::before,#rsMini button::before{",
    "  content:'';position:absolute;top:0;right:0;bottom:0;left:0;border-radius:inherit;",
    "  background:currentColor;opacity:0;transition:opacity .12s var(--rs-ease);pointer-events:none}",
    ".rs-ico:active::before,button.rs-btn:active::before,.rs-tile:active::before,",
    ".rs-mrow:active::before,.rs-chipbtn:active::before,.rs-screen .chip:active::before,",
    ".rs-chips button:active::before,.rs-screen #plist .item:active::before,",
    ".rs-screen #plist .star:active::before,#rsNav button:active::before{opacity:.12}",
    "@media (hover:hover){.rs-ico:hover::before,button.rs-btn:hover::before,.rs-tile:hover::before,",
    "  .rs-mrow:hover::before,.rs-chipbtn:hover::before,.rs-screen .chip:hover::before,",
    "  .rs-chips button:hover::before,.rs-screen #plist .item:hover::before{opacity:.06}}",
    "#rsNav button::before{border-radius:var(--rs-r-xl)}",

    /* ------------------------------------------------------------- themes --- */
    "html[data-rs-theme=\"dark\"][data-rs-accent=\"dusk\"]{--rs-pri:#B9BEEA;--rs-on-pri:#232748;--rs-pri-c:#3A3F73;--rs-on-pri-c:#E2E4FA}",
    "html[data-rs-theme=\"light\"][data-rs-accent=\"dusk\"]{--rs-pri:#4A508C;--rs-on-pri:#FFFFFF;--rs-pri-c:#D6D8F4;--rs-on-pri-c:#1B1F42}",
    "html[data-rs-theme=\"dark\"][data-rs-accent=\"sage\"]{--rs-pri:#A8CFAF;--rs-on-pri:#17351F;--rs-pri-c:#2C4A33;--rs-on-pri-c:#DCEEE0}",
    "html[data-rs-theme=\"light\"][data-rs-accent=\"sage\"]{--rs-pri:#35664A;--rs-on-pri:#FFFFFF;--rs-pri-c:#CDE8D6;--rs-on-pri-c:#10291A}",
    "html[data-rs-theme=\"dark\"][data-rs-accent=\"sand\"]{--rs-pri:#DCC295;--rs-on-pri:#3A2A0F;--rs-pri-c:#4E3D22;--rs-on-pri-c:#F2E5CE}",
    "html[data-rs-theme=\"light\"][data-rs-accent=\"sand\"]{--rs-pri:#7A5B23;--rs-on-pri:#FFFFFF;--rs-pri-c:#F0E3C9;--rs-on-pri-c:#2C2008}",
    "html[data-rs-theme=\"dark\"][data-rs-accent=\"slate\"]{--rs-pri:#AEC0CC;--rs-on-pri:#1B2A33;--rs-pri-c:#2E3F49;--rs-on-pri-c:#DCE9EF}",
    "html[data-rs-theme=\"light\"][data-rs-accent=\"slate\"]{--rs-pri:#405C6B;--rs-on-pri:#FFFFFF;--rs-pri-c:#D3E3EA;--rs-on-pri-c:#16262E}",
    /* ------------------------------------------------------------- chamber --- */
    /* the chamber's own header sat under the status bar (env() is 0 here) */
    ".rs-app .cym .cym-top{padding-top:calc(10px + " + SAFE_T + ") !important}",
    /* the header is a faceplate: title and controls sit inside one panel */
    "html[data-rs-ui=full] .cym .cym-top{background-image:url(ui/strip.webp);",
    "  background-size:cover;background-position:center;border-bottom:1px solid #4A3D2B;",
    "  box-shadow:0 4px 14px rgba(0,0,0,.5);padding:calc(8px + " + SAFE_T + ") 10px 8px !important}",
    "html[data-rs-ui=full] .cym .cym-top h2,html[data-rs-ui=full] .cym .cym-top b{",
    "  color:#F6EFE0;letter-spacing:.06em;text-transform:uppercase;font-size:12px}",
    /* the wording goes; the plate keeps the room for the controls */
    ".rs-app .cym .cym-top .cym-brand{display:none}",
    ".rs-app .cym .cym-top{justify-content:flex-start !important;align-items:center !important}",
    ".rs-app .cym .cym-actions{width:100% !important;margin-left:0 !important}",
    ".rs-app .cym .cym-dock{bottom:calc(12px + " + SAFE_B + ") !important}",
    /* ---- the chamber's faceplate ------------------------------------------------
       The same amplifier hardware as the rest of the app, arranged as two rows of
       hardware rather than a row of pills:

         phone                       wide (600 px and up)
         back  · live ·   ?  close   back [live] · play stop [fader] Controls ? close
         play stop [fader] Controls

       Navigation keeps its own line so the transport never wraps mid-cluster, and the
       master fader is the only element that grows, so play and stop stay put. */
    ".rs-app .cym .cym-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;",
    "  flex:1 1 auto;width:auto;min-width:0;max-width:100%;padding-right:2px;box-sizing:border-box}",
    ".rs-app .cym .rs-cym-nav,.rs-app .cym .rs-cym-tr{display:flex;align-items:center;gap:8px;min-width:0}",
    ".rs-app .cym .rs-cym-nav{flex:1 1 100%}",
    ".rs-app .cym .rs-cym-tr{flex:1 1 100%}",
    ".rs-app .cym .rs-cym-nav > button,.rs-app .cym .rs-cym-tr > button{min-height:44px;height:44px;",
    "  min-width:44px;padding:0 10px;box-sizing:border-box;flex:0 0 auto;border-radius:999px;",
    "  font:600 12px/1 var(--rs-sans);letter-spacing:.06em;text-transform:uppercase;",
    "  background:rgba(18,14,10,.62);color:#F2E6D8;border:1px solid rgba(255,255,255,.22)}",
    ".rs-app .cym .cym-back{padding:0;font-size:0}",
    ".rs-app .cym .cym-nav-live{flex:1 1 auto;display:flex;justify-content:center;min-width:0}",
    ".rs-app .cym .cym-live{display:inline-flex;align-items:center;gap:6px;",
    "  font:600 10px/1 var(--rs-sans);letter-spacing:.18em;text-transform:uppercase;",
    "  color:#D9C6A6;white-space:nowrap}",
    ".rs-app .cym #rsCymInfo{padding:0;font-size:0}",
    ".rs-app .cym #cymPlay{width:56px;height:56px;min-width:56px;padding:0;",
    "  border-radius:50%;font-size:0;background-color:#100e0c;border:0;",
    "  box-shadow:0 5px 14px rgba(0,0,0,.55)}",
    ".rs-app .cym #rsCymStop{width:48px;height:48px;min-width:48px;padding:0;",
    "  border-radius:50%;font-size:0;background-color:#100e0c;border:0;",
    "  box-shadow:0 4px 12px rgba(0,0,0,.5)}",
    /* the master fader: a sunk slot with a knurled thumb, the same hardware as the
       hero and the mini player, sized to stay a 44 px target on a 320 px glass */
    ".rs-app .cym .rs-cym-vol{display:flex;align-items:center;margin:0;flex:1 1 auto;",
    "  min-width:84px;max-width:260px;height:48px}",
    ".rs-app .cym .rs-cym-vol input{width:100%;height:44px;margin:0;-webkit-appearance:none;",
    "  background:transparent}",
    ".rs-app .cym .rs-cym-vol input::-webkit-slider-runnable-track{height:28px;border-radius:7px;",
    "  background:linear-gradient(180deg,#2B231A,#14100C);border:1px solid rgba(0,0,0,.8);",
    "  box-shadow:inset 0 2px 6px rgba(0,0,0,.8)}",
    ".rs-app .cym .rs-cym-vol input::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:34px;",
    "  margin-top:-4px;border-radius:5px;border:1px solid rgba(0,0,0,.7);",
    "  background:linear-gradient(180deg,#E7C98A,#8A6A33 58%,#3B2C15);",
    "  box-shadow:0 2px 5px rgba(0,0,0,.65)}",
    ".rs-app .cym .cym-tempo{min-width:44px;font-size:16px !important;line-height:1}",
    /* the generated brass faces, only in the Full interface (Minimal stays typographic) */
    "html[data-rs-ui=full] .cym #cymPlay{background-image:url(ui/amp-play.webp);",
    "  background-size:cover;background-position:center}",
    "html[data-rs-ui=full].rs-playing .cym #cymPlay{background-image:url(ui/amp-pause.webp)}",
    "html[data-rs-ui=full] .cym #rsCymStop{background-image:url(ui/amp-stop.webp);",
    "  background-size:cover;background-position:center}",
    "html[data-rs-ui=full] .cym .cym-back{background-image:url(ui/amp-back.webp);",
    "  background-size:cover;background-position:center;border:0}",
    "html[data-rs-ui=full] .cym #rsCymInfo{background-image:url(ui/amp-info.webp);",
    "  background-size:cover;background-position:center;border:0}",
    "html[data-rs-ui=full] .cym .rs-cym-vol input::-webkit-slider-runnable-track{",
    "  background-image:url(ui/amp-vol-track.webp);background-size:100% 100%;background-repeat:no-repeat}",
    "html[data-rs-ui=full] .cym .rs-cym-vol input::-webkit-slider-thumb{",
    "  background-image:url(ui/amp-vol-knob.webp);background-size:cover;background-position:center}",
    /* the one labelled key: brass plate, engraved dark lettering, the same metal as
       the faces beside it - a dark pill with white type read as a different family */
    "html[data-rs-ui=full] .cym #cymCtl{background-image:linear-gradient(180deg,#E2C489,#B58C4C 56%,#7E5C2E);",
    "  background-color:#B58C4C;border-color:#5E4623;color:#241A0F;font-size:11px;",
    "  letter-spacing:.10em;text-shadow:0 1px 0 rgba(255,244,220,.35);",
    "  box-shadow:inset 0 1px 0 rgba(255,248,230,.45),inset 0 -2px 4px rgba(0,0,0,.35),0 3px 9px rgba(0,0,0,.45)}",
    ".rs-app .cym .cym-tone{display:none}",
    /* wide: one panel row, navigation at the left, the transport cluster at the right */
    "@media (min-width: 600px){",
    "  .rs-app .cym .rs-cym-nav{flex:0 0 auto}",
    "  .rs-app .cym .rs-cym-tr{flex:1 1 auto;justify-content:flex-end}",
    "  .rs-app .cym .rs-cym-tr .rs-cym-vol{flex:0 1 220px}",
    "}",
    /* narrow: keep the transport on one line, and give the fader room */
    "@media (max-width: 359px){",
    "  .rs-app .cym #cymCtl{padding:0 7px;font-size:10.5px}",
    "  .rs-app .cym .rs-cym-vol{min-width:64px}",
    "}",
    /* the panels start under the two-row faceplate on a phone */
    /* the lower panel is a drawer on a phone: a grab handle stays on the glass when
       it is put away, so it can be pulled back up instead of hunted for in the top bar */
    "@media (max-width: 820px){",
    /* the top player slides up out of the way from its lip, and the lip stays on the
       glass (just under the status bar) so the panel can be pulled back down */
    "  .rs-app .cym .cym-top{transition:transform .26s cubic-bezier(.22,.61,.36,1)}",
    "  .rs-app .cym .cym-top.rs-cym-hid{transform:translateY(calc(var(--rs-safe-t,0px) - 100%)) !important}",
    "  .rs-app .cym .cym-top.rs-dragging{transition:none !important}",
    "  .rs-app .cym .rs-cym-lip{position:absolute;left:0;right:0;bottom:-30px;height:30px;",
    "    display:flex;align-items:center;justify-content:center;gap:8px;pointer-events:auto;",
    "    background:linear-gradient(180deg,rgba(10,8,6,0),rgba(10,8,6,.55));",
    "    border-radius:0 0 12px 12px;touch-action:none;cursor:grab}",
    "  .rs-app .cym .rs-cym-lip i{width:44px;height:4px;border-radius:2px;display:block;",
    "    background:linear-gradient(90deg,#8A6A33,#E7C98A,#8A6A33)}",
    "  .rs-app .cym .rs-cym-lip em{font-style:normal;color:#C9B48C;font-size:11px;line-height:1}",
    "  .rs-app .cym .rs-cym-lip:focus-visible{outline:2px solid #E0B96F;outline-offset:-2px}",
    /* the drawer anchors to the bottom edge, not to the panel's desktop top offset */
    "  .rs-app .cym .cym-left.rs-cym-sheet{top:auto !important;height:auto;",
    "    bottom:calc(var(--rs-safe-b,0px)) !important;",
    "    transform:translateY(calc(100% - 54px)) !important;",
    "    transition:transform .26s cubic-bezier(.22,.61,.36,1)}",
    "  .rs-app .cym .cym-left.rs-cym-sheet.open{transform:translateY(0) !important}",
    "  .rs-app .cym .cym-left.rs-cym-sheet.rs-dragging{transition:none !important}",
    "  .rs-app .cym .rs-cym-grab{position:sticky;top:0;z-index:3;display:flex;align-items:center;",
    "    gap:10px;flex:0 0 54px;height:54px;margin:-14px -16px 10px;padding:0 14px 0 16px;box-sizing:border-box;",
    "    background:linear-gradient(180deg,rgba(28,22,15,.99),rgba(18,13,9,.97));",
    "    border-bottom:1px solid rgba(224,185,111,.20);touch-action:none;cursor:grab}",
    "  .rs-app .cym .rs-cym-grab i{display:flex;justify-content:center;width:44px;flex:0 0 44px}",
    "  .rs-app .cym .rs-cym-grab i::before{content:'';width:44px;height:4px;border-radius:2px;",
    "    background:linear-gradient(90deg,#8A6A33,#E7C98A,#8A6A33);display:block}",
    "  .rs-app .cym .rs-cym-grab b{flex:1 1 auto;font:600 10px/1 var(--rs-sans);letter-spacing:.16em;",
    "    text-transform:uppercase;color:#D9C6A6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    /* the chevron is the same toggle key as the player's lip: a visible puck, not a hint */
    /* the expand key: a brass puck at the far right, the same size as the app's other keys,
       so it reads as a control rather than a decoration on the handle */
    "  .rs-app .cym .rs-cym-grab em{font-style:normal;color:#241A0F;font-size:17px;line-height:1;",
    "    width:40px;height:40px;flex:0 0 40px;border-radius:50%;display:flex;align-items:center;",
    "    justify-content:center;background-image:linear-gradient(180deg,#E2C489,#B58C4C 56%,#7E5C2E);",
    "    border:1px solid #5E4623;text-shadow:0 1px 0 rgba(255,244,220,.35);",
    "    box-shadow:inset 0 1px 0 rgba(255,248,230,.45),0 3px 9px rgba(0,0,0,.5)}",
    "  .rs-app .cym .rs-cym-grab{box-shadow:0 -8px 18px rgba(0,0,0,.45)}",
    "  .rs-app .cym .rs-cym-grab:focus-visible{outline:2px solid #E0B96F;outline-offset:-2px}",
    "}",
    "@media (max-width: 599px){",
    "  .rs-app .cym .cym-panel{top:calc(132px + " + SAFE_T + ") !important}",
    "}",
    ".rs-app .cym .cym-tone{max-width:44vw}",
    /* the gesture hint lives behind a ? */
    ".rs-app .cym .cym-note{display:none}",
    ".rs-cym-info{position:absolute;right:12px;top:calc(126px + " + SAFE_T + ");z-index:6;",
    "  width:min(300px,78vw);padding:12px 14px;border-radius:14px;background:rgba(16,12,9,.94);",
    "  border:1px solid rgba(255,255,255,.22);color:#E6DCCB;font:12.5px/1.5 var(--rs-sans);display:none}",
    ".rs-cym-info.on{display:block}",
    ".rs-cym-info b{display:block;color:#fff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;",
    "  margin-bottom:6px}",
    /* tempo moves into the panel, where the other parameters live */
    ".rs-cym-tempo{display:flex;align-items:center;gap:8px;margin:0 0 10px}",
    ".rs-cym-tempo span{font:600 12px/1 var(--rs-sans);letter-spacing:.06em;text-transform:uppercase;",
    "  color:#B9A48C;flex:1 1 auto}",
    ".rs-cym-tempo button{min-width:40px;min-height:40px;border-radius:10px;background:rgba(255,255,255,.06);",
    "  border:1px solid rgba(255,255,255,.2);color:#F2E6D8;font-size:16px;line-height:1}",
    ".rs-cym-tempo output{min-width:44px;text-align:center;font-variant-numeric:tabular-nums;color:#E0B96F}",
    /* oval chips: the label sat high in the pill */
    ".rs-app #vizCard .viz-chips button,.rs-app #vizCard .chip{display:inline-flex;",
    "  align-items:center;justify-content:center;line-height:1;padding:0 14px}",
    /* ------------------------------------------------------- reduced motion --- */
    "@media (prefers-reduced-motion: reduce){",
    "  .rs-screen{animation:none} #rsSheet{transition:none}",
    "  html.rs-playing .rs-fab::after{animation:none;opacity:.5}",
    "  #rsNav button .rs-npill{transition:none}",
    "}",
    /* the house look at full screen: the same brushed plate the faders sit on, darkened
       enough that the ink keeps its contrast, so the app reads as one old amplifier face
       rather than dark cards floating on a pale page */
    "html[data-rs-ui=full][data-rs-theme=dark] #rsApp{background-color:#0E1211;",
    "  background-image:linear-gradient(180deg,rgba(12,9,7,.88),rgba(14,11,8,.93)),",
    "  url(ui/plate.webp);background-size:cover;background-position:center top}",
    "html[data-rs-ui=full][data-rs-theme=dark] #rsTop{background:transparent}",

    /* the page's adopted controls: a rate box, a mute key and a chip were all under the
       44 px tap floor — the shell's own controls were already there */
    "#scr-studio input:not([type=range]),#scr-studio select,#scr-studio button,",
    "#scr-vis button{min-height:44px !important}",

    /* ------------------------------------------------------------- tablets --- */
    /* A phone screen stretched to a tablet reads as a bug: the hero becomes a banner, the
       module cards 4:1, a select 1000 px wide and an overlay line 100 characters long.
       One rail carries the bar, the screens and the mini player, so everything shares a
       single left edge; the module grid gains columns instead of growing cards. Layers
       that are meant to be full bleed (chamber, fullscreen, focus) are untouched. */
    "@media (min-width: 600px){",
    /* the bar stays at the bottom on a tablet: same shape as the phone, just a wider
       glass, so the app keeps one navigation language everywhere */
    "  html{--rs-rail:720px;--rs-sheet-lift:16px;--rs-nrail:0px}",
    "  #rsTop,#rsMini{width:100%;max-width:var(--rs-rail);margin-left:auto;margin-right:auto}",
    "  #rsBody .rs-screen{max-width:var(--rs-rail);margin-left:auto;margin-right:auto}",
    /* the home fills the glass: the modules take every pixel the player leaves, so a
       tablet does not end in a band of empty background */
    /* an id beats `.rs-screen{display:none}`, so Home's own display must be scoped to its
       selected state or it stays pinned above whatever screen is open on a tablet */
    "  #scr-home.rs-on{display:flex;flex-direction:column;min-height:100%}",
    "  #scr-home .rs-hero,#scr-home .rs-build{flex:0 0 auto}",
    "  #scr-home #rsStates{flex:1 1 auto;display:grid;grid-template-columns:1fr 1fr;",
    "    grid-auto-rows:minmax(120px,1fr);gap:10px}",
    /* a 560 px sheet flush to the bottom edge of a tablet reads half-dialog: lift it */
    "  #rsSheet{width:min(560px,100%);margin-left:auto;margin-right:auto;",
    "    border-radius:var(--rs-r-sheet);border:1px solid var(--rs-line)}",
    /* an overlay is prose: it gets a document measure, not the app rail */
    "  .rs-ov .rs-ov-head,.rs-ov .rs-ov-body{width:100%;max-width:min(var(--rs-rail),640px);",
    "    margin-left:auto;margin-right:auto;box-sizing:border-box}",
    "}",
    "@media (min-width: 900px){",
    "  html{--rs-rail:960px}",
    /* two panes: the player and Build a tone on the left, the modules filling the right
       column top to bottom — the width and the height are both used */
    /* the same id-level display as the 600 block: scoped to the selected state, and
       written with the same specificity so this rule wins at 900+ instead of losing */
    "  #scr-home.rs-on{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(0,1.05fr);",
    "    grid-template-rows:auto 1fr;grid-template-areas:'hero states' 'build states';",
    "    column-gap:14px;row-gap:14px;align-items:start;padding:0 16px;min-height:100%}",
    "  #scr-home .rs-hero{grid-area:hero;margin:0}",
    "  #scr-home .rs-build{grid-area:build;margin:0;align-self:start}",
    "  #scr-home #rsStates{grid-area:states;margin:0;align-self:stretch;height:100%;",
    "    grid-template-columns:1fr 1fr}",
    "}"
  ].join("\n");

  function shellCss() { injectCss(CSS, "rsShellCss"); }

  /* ================================================================== icons === */

  var I = {
    home: "M4 11.2 12 4l8 7.2V20a1 1 0 0 1-1 1h-4.6v-6.2H9.6V21H5a1 1 0 0 1-1-1z",
    list: "M4 6h16M4 12h16M4 18h10",
    sliders: "M5 7h6M15 7h4M5 17h4M13 17h6M13 7a2 2 0 1 0 0-.01M9 17a2 2 0 1 0 0-.01",
    vis: "M12 3.4a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2zM7.4 12c1.4-2.6 2.9-2.6 4.3 0s2.9 2.6 4.3 0",
    gear: "M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zM19.3 12a7.3 7.3 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.4 7.4 0 0 0-2-1.2L14.6 3h-3.9l-.4 2.5a7.4 7.4 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.3 7.3 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.4 7.4 0 0 0 2 1.2l.4 2.5h3.9l.4-2.5a7.4 7.4 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
    play: "M8 5.2v13.6L19 12z",
    pause: "M7 5h3.6v14H7zM13.4 5H17v14h-3.6z",
    stop: "M6 6h12v12H6z",
    moon: "M20 14.4A8.4 8.4 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4z",
    sun: "M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    focus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    book: "M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM17 4h2v16h-2",
    shield: "M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z",
    info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM11 10.5h2V17h-2zM11 7h2v2h-2z",
    down: "M12 4v11M7.5 11 12 15.5 16.5 11M5 19h14",
    wave: "M3 12h3l2-5 3 10 3-8 2 5h5",
    close: "M6 6l12 12M18 6 6 18",
    chev: "M9 6l6 6-6 6",
    chamber: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 6.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2zM12 9.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z",
  };
/* ICONS:START */
  /* Generated by tools/make_icons.py from the Material Symbols catalog in the
     local Iconset library. Filled glyphs, 24x24, inherited colour. */
  var IC = {
    "vol": "<path d=\"M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z\"/>",
    "voloff": "<path d=\"M4 9v6h4l5 4V5L8 9H4zm17.1-1.6-1.4-1.4-3 3-3-3-1.4 1.4 3 3-3 3 1.4 1.4 3-3 3 3 1.4-1.4-3-3z\"/>",
    "book": "<path d=\"M13 17.05q1.1-.525 2.213-.788T17.5 16q.9 0 1.763.15T21 16.6V6.7q-.825-.35-1.713-.525T17.5 6q-1.175 0-2.325.3T13 7.2zm-1.662 2.338q-.313-.088-.588-.238q-.975-.575-2.05-.862T6.5 18q-1.05 0-2.062.275T2.5 19.05q-.525.275-1.012-.025T1 18.15V6.1q0-.275.138-.525T1.55 5.2q1.175-.575 2.413-.888T6.5 4q1.45 0 2.838.375T12 5.5q1.275-.75 2.663-1.125T17.5 4q1.3 0 2.538.313t2.412.887q.275.125.413.375T23 6.1v12.05q0 .575-.487.875t-1.013.025q-.925-.5-1.937-.775T17.5 18q-1.125 0-2.2.288t-2.05.862q-.275.15-.587.238t-.663.087t-.663-.088M14 8.776q0-.225.163-.462T14.525 8q.725-.25 1.45-.375T17.5 7.5q.5 0 .988.063t.962.162q.225.05.388.25t.162.45q0 .425-.275.625t-.7.1q-.35-.075-.737-.112T17.5 9q-.65 0-1.275.125t-1.2.325q-.45.175-.737-.025T14 8.775m0 5.5q0-.225.163-.462t.362-.313q.725-.25 1.45-.375T17.5 13q.5 0 .988.063t.962.162q.225.05.388.25t.162.45q0 .425-.275.625t-.7.1q-.35-.075-.737-.112T17.5 14.5q-.65 0-1.275.113t-1.2.312q-.45.175-.737-.012T14 14.275m0-2.75q0-.225.163-.462t.362-.313q.725-.25 1.45-.375t1.525-.125q.5 0 .988.063t.962.162q.225.05.388.25t.162.45q0 .425-.275.625t-.7.1q-.35-.075-.737-.112t-.788-.038q-.65 0-1.275.125t-1.2.325q-.45.175-.737-.025t-.288-.65\"/>",
    "chev": "<path d=\"M12.6 12L8.7 8.1q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.6 4.6q.15.15.213.325t.062.375t-.062.375t-.213.325l-4.6 4.6q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7z\"/>",
    "close": "<path d=\"m12 13.4l-4.9 4.9q-.275.275-.7.275t-.7-.275t-.275-.7t.275-.7l4.9-4.9l-4.9-4.9q-.275-.275-.275-.7t.275-.7t.7-.275t.7.275l4.9 4.9l4.9-4.9q.275-.275.7-.275t.7.275t.275.7t-.275.7L13.4 12l4.9 4.9q.275.275.275.7t-.275.7t-.7.275t-.7-.275z\"/>",
    "down": "<path d=\"M11.625 15.513q-.175-.063-.325-.213l-3.6-3.6q-.3-.3-.288-.7t.288-.7q.3-.3.713-.312t.712.287L11 12.15V5q0-.425.288-.712T12 4t.713.288T13 5v7.15l1.875-1.875q.3-.3.713-.288t.712.313q.275.3.288.7t-.288.7l-3.6 3.6q-.15.15-.325.213t-.375.062t-.375-.062M6 20q-.825 0-1.412-.587T4 18v-2q0-.425.288-.712T5 15t.713.288T6 16v2h12v-2q0-.425.288-.712T19 15t.713.288T20 16v2q0 .825-.587 1.413T18 20z\"/>",
    "focus": "<path d=\"M8.463 15.538Q7 14.075 7 12t1.463-3.537T12 7t3.538 1.463T17 12t-1.463 3.538T12 17t-3.537-1.463M5 21q-.825 0-1.412-.587T3 19v-3q0-.425.288-.712T4 15t.713.288T5 16v3h3q.425 0 .713.288T9 20t-.288.713T8 21zm14 0h-3q-.425 0-.712-.288T15 20t.288-.712T16 19h3v-3q0-.425.288-.712T20 15t.713.288T21 16v3q0 .825-.587 1.413T19 21M3 8V5q0-.825.588-1.412T5 3h3q.425 0 .713.288T9 4t-.288.713T8 5H5v3q0 .425-.288.713T4 9t-.712-.288T3 8m16 0V5h-3q-.425 0-.712-.288T15 4t.288-.712T16 3h3q.825 0 1.413.588T21 5v3q0 .425-.288.713T20 9t-.712-.288T19 8\"/>",
    "gear": "<path d=\"M10.825 22q-.675 0-1.162-.45t-.588-1.1L8.85 18.8q-.325-.125-.612-.3t-.563-.375l-1.55.65q-.625.275-1.25.05t-.975-.8l-1.175-2.05q-.35-.575-.2-1.225t.675-1.075l1.325-1Q4.5 12.5 4.5 12.337v-.675q0-.162.025-.337l-1.325-1Q2.675 9.9 2.525 9.25t.2-1.225L3.9 5.975q.35-.575.975-.8t1.25.05l1.55.65q.275-.2.575-.375t.6-.3l.225-1.65q.1-.65.588-1.1T10.825 2h2.35q.675 0 1.163.45t.587 1.1l.225 1.65q.325.125.613.3t.562.375l1.55-.65q.625-.275 1.25-.05t.975.8l1.175 2.05q.35.575.2 1.225t-.675 1.075l-1.325 1q.025.175.025.338v.674q0 .163-.05.338l1.325 1q.525.425.675 1.075t-.2 1.225l-1.2 2.05q-.35.575-.975.8t-1.25-.05l-1.5-.65q-.275.2-.575.375t-.6.3l-.225 1.65q-.1.65-.587 1.1t-1.163.45zm1.225-6.5q1.45 0 2.475-1.025T15.55 12t-1.025-2.475T12.05 8.5q-1.475 0-2.488 1.025T8.55 12t1.013 2.475T12.05 15.5\"/>",
    "home": "<path d=\"M4 19v-9q0-.475.213-.9t.587-.7l6-4.5q.525-.4 1.2-.4t1.2.4l6 4.5q.375.275.588.7T20 10v9q0 .825-.588 1.413T18 21h-3q-.425 0-.712-.288T14 20v-5q0-.425-.288-.712T13 14h-2q-.425 0-.712.288T10 15v5q0 .425-.288.713T9 21H6q-.825 0-1.412-.587T4 19\"/>",
    "info": "<path d=\"M12.713 16.713Q13 16.425 13 16v-4q0-.425-.288-.712T12 11t-.712.288T11 12v4q0 .425.288.713T12 17t.713-.288m0-8Q13 8.425 13 8t-.288-.712T12 7t-.712.288T11 8t.288.713T12 9t.713-.288M12 22q-2.075 0-3.9-.788t-3.175-2.137T2.788 15.9T2 12t.788-3.9t2.137-3.175T8.1 2.788T12 2t3.9.788t3.175 2.137T21.213 8.1T22 12t-.788 3.9t-2.137 3.175t-3.175 2.138T12 22\"/>",
    "list": "<path d=\"M16 20q-1.25 0-2.125-.875T13 17t.875-2.125T16 14q.275 0 .525.038T17 14.2V7q0-.425.288-.712T18 6h3q.425 0 .713.288T22 7t-.288.713T21 8h-2v9q0 1.25-.875 2.125T16 20M4 16q-.425 0-.712-.288T3 15t.288-.712T4 14h6q.425 0 .713.288T11 15t-.288.713T10 16zm0-4q-.425 0-.712-.288T3 11t.288-.712T4 10h10q.425 0 .713.288T15 11t-.288.713T14 12zm0-4q-.425 0-.712-.288T3 7t.288-.712T4 6h10q.425 0 .713.288T15 7t-.288.713T14 8z\"/>",
    "moon": "<path d=\"M12.1 22q-2.1 0-3.937-.8t-3.2-2.162t-2.163-3.2T2 11.9q0-3.2 1.8-5.8t4.825-3.65q.55-.2 1.025.138t.45.912q-.075 2.125.675 4.05t2.25 3.425t3.425 2.25t4.05.675q.65-.025.963.438t.112 1.037q-1.1 3-3.687 4.813T12.1 22\"/>",
    "more": "<path d=\"M12 20q-.825 0-1.412-.587T10 18t.588-1.412T12 16t1.413.588T14 18t-.587 1.413T12 20m0-6q-.825 0-1.412-.587T10 12t.588-1.412T12 10t1.413.588T14 12t-.587 1.413T12 14m0-6q-.825 0-1.412-.587T10 6t.588-1.412T12 4t1.413.588T14 6t-.587 1.413T12 8\"/>",
    "pause": "<path d=\"M16 19q-.825 0-1.412-.587T14 17V7q0-.825.588-1.412T16 5t1.413.588T18 7v10q0 .825-.587 1.413T16 19m-8 0q-.825 0-1.412-.587T6 17V7q0-.825.588-1.412T8 5t1.413.588T10 7v10q0 .825-.587 1.413T8 19\"/>",
    "play": "<path d=\"M8 17.175V6.825q0-.425.3-.713t.7-.287q.125 0 .263.037t.262.113l8.15 5.175q.225.15.338.375t.112.475t-.112.475t-.338.375l-8.15 5.175q-.125.075-.262.113T9 18.175q-.4 0-.7-.288t-.3-.712\"/>",
    "relax": "<path d=\"M11.85 21.925q-4.35-.65-6.9-3.363t-2.9-7.387q-.025-.275.063-.488t.237-.362t.363-.225t.462-.025q4.575.625 7.05 3.525t2.75 7.25q.025.225-.062.438t-.263.362q-.15.15-.363.238t-.437.037m.15-9.3q-.35-.55-1.612-1.612T8.25 9.6q.2-1.25 1.013-3.162T11.2 2.975q.15-.2.363-.3t.437-.1t.425.1t.35.325q1.125 1.575 1.963 3.45T15.75 9.6q-.975.45-2.175 1.463T12 12.625m2.95 8.575q-.05-1.525-.462-3.462T13.2 14.4q1.075-1.65 3.188-2.85t4.462-1.475q.25-.05.45.038t.35.237t.238.35t.062.45q-.2 4.025-2.187 6.538T14.95 21.2\"/>",
    "shield": "<path d=\"m10.95 12.7l-1.4-1.4q-.3-.3-.7-.3t-.7.3t-.3.713t.3.712l2.1 2.125q.3.3.7.3t.7-.3l4.25-4.25q.3-.3.3-.712t-.3-.713t-.712-.3t-.713.3zm.725 9.175q-.15-.025-.3-.075Q8 20.675 6 17.637T4 11.1V6.375q0-.625.363-1.125t.937-.725l6-2.25q.35-.125.7-.125t.7.125l6 2.25q.575.225.938.725T20 6.375V11.1q0 3.5-2 6.538T12.625 21.8q-.15.05-.3.075T12 21.9t-.325-.025\"/>",
    "sliders": "<path d=\"M11.288 20.713Q11 20.425 11 20v-4q0-.425.288-.712T12 15t.713.288T13 16v1h7q.425 0 .713.288T21 18t-.288.713T20 19h-7v1q0 .425-.288.713T12 21t-.712-.288M4 19q-.425 0-.712-.288T3 18t.288-.712T4 17h4q.425 0 .713.288T9 18t-.288.713T8 19zm3.288-4.288Q7 14.425 7 14v-1H4q-.425 0-.712-.288T3 12t.288-.712T4 11h3v-1q0-.425.288-.712T8 9t.713.288T9 10v4q0 .425-.288.713T8 15t-.712-.288M12 13q-.425 0-.712-.288T11 12t.288-.712T12 11h8q.425 0 .713.288T21 12t-.288.713T20 13zm3.288-4.288Q15 8.425 15 8V4q0-.425.288-.712T16 3t.713.288T17 4v1h3q.425 0 .713.288T21 6t-.288.713T20 7h-3v1q0 .425-.288.713T16 9t-.712-.288M4 7q-.425 0-.712-.288T3 6t.288-.712T4 5h8q.425 0 .713.288T13 6t-.288.713T12 7z\"/>",
    "stop": "<path d=\"M6 16V8q0-.825.588-1.412T8 6h8q.825 0 1.413.588T18 8v8q0 .825-.587 1.413T16 18H8q-.825 0-1.412-.587T6 16\"/>",
    "sun": "<path d=\"M11.288 4.713Q11 4.425 11 4V2q0-.425.288-.712T12 1t.713.288T13 2v2q0 .425-.288.713T12 5t-.712-.288M16.95 7.05q-.275-.275-.275-.687t.275-.713l1.4-1.425q.3-.3.712-.3t.713.3q.275.275.275.7t-.275.7L18.35 7.05q-.275.275-.7.275t-.7-.275M20 13q-.425 0-.713-.288T19 12t.288-.712T20 11h2q.425 0 .713.288T23 12t-.288.713T22 13zm-8.712 9.713Q11 22.425 11 22v-2q0-.425.288-.712T12 19t.713.288T13 20v2q0 .425-.288.713T12 23t-.712-.288M5.65 7.05l-1.425-1.4q-.3-.3-.3-.725t.3-.7q.275-.275.7-.275t.7.275L7.05 5.65q.275.275.275.7t-.275.7q-.3.275-.7.275t-.7-.275m12.7 12.725l-1.4-1.425q-.275-.3-.275-.712t.275-.688t.688-.275t.712.275l1.425 1.4q.3.275.288.7t-.288.725q-.3.3-.725.3t-.7-.3M2 13q-.425 0-.712-.288T1 12t.288-.712T2 11h2q.425 0 .713.288T5 12t-.288.713T4 13zm2.225 6.775q-.275-.275-.275-.7t.275-.7L5.65 16.95q.275-.275.687-.275t.713.275q.3.3.3.713t-.3.712l-1.4 1.4q-.3.3-.725.3t-.7-.3M7.75 16.25Q6 14.5 6 12t1.75-4.25T12 6t4.25 1.75T18 12t-1.75 4.25T12 18t-4.25-1.75\"/>",
    "theme": "<path d=\"M12 21q-3.775 0-6.387-2.613T3 12q0-3.45 2.25-5.988T11 3.05q.325-.05.575.088t.4.362t.163.525t-.188.575q-.425.65-.638 1.375T11.1 7.5q0 2.25 1.575 3.825T16.5 12.9q.775 0 1.538-.225t1.362-.625q.275-.175.563-.162t.512.137q.25.125.388.375t.087.6q-.35 3.45-2.937 5.725T12 21\"/>",
    "vis": "<path d=\"M7 17V7q0-.425.288-.712T8 6t.713.288T9 7v10q0 .425-.288.713T8 18t-.712-.288T7 17m4 4V3q0-.425.288-.712T12 2t.713.288T13 3v18q0 .425-.288.713T12 22t-.712-.288T11 21m-8-8v-2q0-.425.288-.712T4 10t.713.288T5 11v2q0 .425-.288.713T4 14t-.712-.288T3 13m12 4V7q0-.425.288-.712T16 6t.713.288T17 7v10q0 .425-.288.713T16 18t-.712-.288T15 17m4-4v-2q0-.425.288-.712T20 10t.713.288T21 11v2q0 .425-.288.713T20 14t-.712-.288T19 13\"/>",
    "wave": "<path d=\"M7 18.95q-1.225 0-1.95.55t-2.025.775q-.425.075-.725-.2t-.3-.7t.287-.712T3 18.25q.9-.275 1.7-.763T7 17q.95 0 1.563.213t1.137.474t1.05.488T12 18.4t1.25-.225t1.05-.488t1.15-.475T17 17q1.5 0 2.3.488t1.7.762q.425.125.713.413t.287.712t-.3.7t-.725.2q-1.3-.225-2.025-.775T17 18.95q-.7 0-1.213.213t-1.025.474t-1.15.488T12 20.35t-1.613-.225t-1.15-.488t-1.012-.475T7 18.95m0-4.45q-1.225 0-1.95.55t-2.025.775q-.425.075-.725-.2t-.3-.7t.287-.712T3 13.8q.9-.275 1.7-.763T7 12.55q.95 0 1.563.213t1.137.475t1.05.487t1.25.225t1.25-.225t1.05-.487t1.15-.475T17 12.55q1.5 0 2.3.488t1.7.762q.425.125.713.413t.287.712t-.3.7t-.725.2q-1.3-.225-2.025-.775T17 14.5q-.725 0-1.237.212t-1.026.475t-1.137.488t-1.6.225t-1.612-.225t-1.15-.488t-1.013-.474T7 14.5m0-4.45q-1.225 0-1.95.55t-2.025.775q-.425.075-.725-.2t-.3-.7t.288-.712T3 9.35q.9-.275 1.7-.763T7 8.1q.95 0 1.563.213t1.137.474t1.05.488T12 9.5t1.25-.225t1.05-.488t1.15-.475T17 8.1q1.5 0 2.3.488t1.7.762q.425.125.713.413t.287.712t-.3.7t-.725.2q-1.3-.225-2.025-.775T17 10.05q-.7 0-1.213.212t-1.025.475t-1.15.488T12 11.45t-1.613-.225t-1.15-.488t-1.012-.475T7 10.05M7 5.6q-1.225 0-1.95.55t-2.025.775Q2.6 7 2.3 6.725t-.3-.7t.287-.713T3 4.9q.9-.275 1.7-.763T7 3.65q.95 0 1.563.213t1.137.475t1.05.487T12 5.05t1.25-.225t1.05-.488t1.15-.474T17 3.65q1.5 0 2.3.488T21 4.9q.425.125.713.413t.287.712t-.3.7t-.725.2q-1.3-.225-2.025-.775T17 5.6q-.7 0-1.213.213t-1.025.475t-1.15.487T12 7t-1.613-.225t-1.15-.488t-1.012-.474T7 5.6\"/>"
  };
/* ICONS:END */

  function svg(name, size) {
    if (IC[name]) {
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"' +
        (size ? ' width="' + size + '" height="' + size + '"' : "") + '>' + IC[name] + '</svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (size ? ' width="' + size + '" height="' + size + '"' : "") + '><path d="' + I[name] + '"/></svg>';
  }
  function svgFill(name) {
    if (IC[name]) return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + IC[name] + '</svg>';
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + I[name] + '"/></svg>';
  }

  /* ================================================================ screens === */

  var SCREENS = [
    { id: "home", label: "Home", icon: "home", title: "Resonance", large: true,
      sub: function () { return ""; } },
    { id: "sessions", label: "Sessions", icon: "list", title: "Sessions",
      sub: function () { return ""; } },
    { id: "studio", label: "Studio", icon: "sliders", title: "Studio",
      sub: function () { return "The sound you are building"; } },
    { id: "vis", label: "Visualise", icon: "vis", title: "Visualise",
      sub: function () { return "The tone made visible"; } },
    { id: "settings", label: "Settings", icon: "gear", title: "Settings",
      sub: function () { return ""; } }
  ];

  var CUR = "home";
  var screenEls = {}, navEls = {};

  function buildShell() {
    var app = doc.createElement("div");
    app.id = "rsApp";
    app.innerHTML =
      '<header id="rsTop" role="banner">' +
      '  <div class="rs-tt"><h1 id="rsTitle" tabindex="-1"></h1><p id="rsSub"></p></div>' +
      '  <button class="rs-ico" id="rsOverflow" aria-label="More" aria-haspopup="dialog" aria-expanded="false">' +
      '    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/>' +
      '    <circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg></button>' +
      '</header>' +
      '<main id="rsBody" tabindex="-1"></main>' +
      '<div id="rsMini"><div class="rs-mt"><b id="rsMiniTitle"></b><span id="rsMiniTime"></span></div>' +
      '  <button id="rsMiniMute" class="rs-mini-mute" aria-label="Mute" aria-pressed="false">' + svgFill("vol") + '</button>' +
      '  <input id="rsMiniVol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Volume">' +
      '  <button id="rsMiniPlay" aria-label="Play or pause"></button>' +
      '  <button id="rsMiniStop" class="rs-mini-stop" aria-label="Stop and rewind">' + svg("stop") + '</button></div>' +
      '<nav id="rsNav" role="tablist" aria-label="Sections"></nav>';
    doc.body.appendChild(app);

    var body = $id("rsBody");
    SCREENS.forEach(function (s) {
      var sec = doc.createElement("section");
      sec.className = "rs-screen";
      sec.id = "scr-" + s.id;
      sec.setAttribute("role", "tabpanel");
      sec.setAttribute("aria-labelledby", "nav-" + s.id);
      body.appendChild(sec);
      screenEls[s.id] = sec;
    });

    var nav = $id("rsNav");
    SCREENS.forEach(function (s) {
      var b = doc.createElement("button");
      b.id = "nav-" + s.id;
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", s.id === CUR ? "true" : "false");
      b.setAttribute("aria-controls", "scr-" + s.id);
      b.innerHTML = '<span class="rs-npill" aria-hidden="true"></span>' + svg(s.icon) + '<span>' + s.label + '</span>';
      b.addEventListener("click", function () { go(s.id); });
      nav.appendChild(b);
      navEls[s.id] = b;
    });

    $id("rsOverflow").addEventListener("click", function () { openSheet(true); });
    $id("rsMiniPlay").addEventListener("click", function () { pageToggle(); pushState(true); });
    $id("rsMiniStop").addEventListener("click", function () { pageStop(); pushState(true); });
    $id("rsMiniMute").addEventListener("click", toggleMute);
    $id("rsMiniVol").addEventListener("input", function () { setMaster(parseFloat(this.value)); });

    return app;
  }

  /* The player is static, by owner decision: it used to slide away after 8 quiet seconds and
   * that read as the UI breaking. It now stays where it is on every screen that shows it
   * (Home and Studio have their own transport, so syncMini simply does not mount it there).
   * wakeChrome stays as the one place that clears classes left over from older builds. */
  function wakeChrome() {
    doc.documentElement.classList.remove("rs-navhide");   /* a stale class from an older build */
    doc.documentElement.classList.remove("rs-minihide");  /* ditto: the player never hides now */
  }

  function go(id, opts) {
    if (!screenEls[id]) return;
    wakeChrome();
    CUR = id;
    SCREENS.forEach(function (s) {
      var on = s.id === id;
      screenEls[s.id].classList.toggle("rs-on", on);
      navEls[s.id].setAttribute("aria-selected", on ? "true" : "false");
    });
    var top = $id("rsTop");
    top.classList.toggle("rs-lg", !!SCREENS.filter(function (s) { return s.id === id; })[0].large);
    renderTop();
    if (!opts || opts.scroll !== false) {
      var b = $id("rsBody");
      b.classList.add("rs-nosmooth");
      b.scrollTop = 0;
      window.setTimeout(function () { b.classList.remove("rs-nosmooth"); }, 40);
    }
    syncMini();
    if (id === "vis") syncVis();
  }

  function renderTop() {
    var s = SCREENS.filter(function (x) { return x.id === CUR; })[0];
    var h = $id("rsTitle"), p = $id("rsSub");
    if (h && h.textContent !== s.title) h.textContent = s.title;
    var sub = s.sub ? s.sub() : "";
    if (p && p.textContent !== sub) p.textContent = sub;
    if (p) p.style.display = sub ? "" : "none";
  }

  /* =================================================================== home === */

  var STATES = [
    { label: "Deep sleep", t: "sleep", icon: "moon", re: [/deep sleep/i, /sleep/i, /delta/i] },
    { label: "Drift off", t: "drift", icon: "moon", re: [/drift/i, /2\.5\s*hz/i, /delta|theta/i] },
    { label: "Focus", t: "focus", icon: "focus", re: [/focus 40/i, /focus|study/i, /alpha/i] },
    { label: "Deep work", t: "work", icon: "focus", re: [/deep work/i, /beta/i, /concentrat/i] },
    { label: "Relax", t: "relax", icon: "relax", re: [/relax|calm|unwind/i, /theta/i] },
    { label: "Meditate", t: "meditate", icon: "relax", re: [/meditat|breath/i, /theta|alpha/i] },
    { label: "Wake", t: "wake", icon: "sun", re: [/wake|energis|alarm/i, /gamma|beta/i] },
    { label: "Morning", t: "morning", icon: "sun", re: [/morning|sunrise/i, /gamma|beta/i] }
  ];

  function presetByName(res, used) {
    var list = (pState() && pState().presetList) || [];
    var rs = res instanceof Array ? res : [res];
    var r, i;
    used = used || [];
    function free(k) { return used.indexOf(k) === -1; }
    for (r = 0; r < rs.length; r++) {
      for (i = 0; i < list.length; i++) if (free(i) && rs[r].test(list[i].name)) return { i: i, it: list[i] };
    }
    for (r = 0; r < rs.length; r++) {
      for (i = 0; i < list.length; i++) if (free(i) && rs[r].test(list[i].blurb || "")) return { i: i, it: list[i] };
    }
    return null;
  }

  function loadPresetAt(i, it) {
    var a = api(); if (!a) return;
    try { a.loadPreset(i); } catch (e) { }
    prefs.last = i; savePrefs();
    try { buildModules(); } catch (e) { }
    var sel = $id("presets");
    if (sel) sel.value = String(i);
    var pl = $id("plist");
    if (pl) $$(".item", pl).forEach(function (row) {
      row.classList.toggle("sel", !!it && text(row).indexOf(it.name) === 0);
    });
    pushState(true);
    syncHero();
  }

  function buildHome() {
    var scr = screenEls.home;
    scr.innerHTML =
      '<div class="rs-hero">' +
      '  <div class="rs-hero-top"><div class="rs-tt">' +
      '    <h1 id="rsNowTitle">Pick a session</h1><p id="rsNowSrc"></p></div>' +
      '    <button class="rs-tap" id="rsSurprise" aria-label="Surprise me — load a random session and play it">' +
      '      <span class="rs-pill">Surprise me</span></button>' +
      '    <span class="rs-pill rs-live" id="rsMode">idle</span></div>' +
      '  <div class="rs-transport rs-amp">' +
      '    <button class="rs-fab rs-tbtn" id="rsPlay" aria-label="Play">' + svgFill("play") + '</button>' +
      '    <div class="rs-vol rs-amp-vol"><div class="rs-vollab"><small>Volume</small>' +
      '      <output id="rsVolPct" class="rs-ledmini">70%</output></div>' +
      '      <div class="rs-volrow">' +
      '        <button class="rs-mute" id="rsMute" aria-label="Mute" aria-pressed="false">' + svgFill("vol") + '</button>' +
      '        <input id="rsVol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Volume"></div></div>' +
      '    <button class="rs-ico rs-tbtn rs-stopbtn" id="rsStop" aria-label="Stop and rewind">' + svg("stop") + '</button>' +
      '  </div>' +
      '  <div class="rs-transport rs-amprow" style="margin-top:10px">' +
      /* the timer sits in an amber LED window, and Loop is a brass key with a pilot
         lamp: the same hardware language as the transport above it */
      '    <span class="rs-ledpanel"><span id="rsClock" aria-live="polite">0:00 / 0:00</span></span>' +
      '    <span class="rs-loopunit">' +
      /* reading order: the engraved label, the pilot lamp, then the key itself at the
         far right of the row — the lamp sits left of the key it reports on */
      '      <b class="rs-loopcap" aria-hidden="true">Loop</b>' +
      '      <i class="rs-loopled" id="rsLoopLed" aria-hidden="true"></i>' +
      '      <button class="rs-loopkey" id="rsLoopBtn" aria-pressed="true" aria-label="Loop"></button>' +
      '    </span>' +
      '    <label class="rs-sw rs-loopswitch" style="flex:1 1 auto;min-height:40px;padding:0">' +
      '      <span class="rs-swt"><span style="font-size:12.5px">Loop</span></span>' +
      '      <input type="checkbox" id="rsLoop" checked><span class="rs-track" aria-hidden="true"></span></label>' +
      '  </div>' +
      '</div>' +
      '<div class="rs-states" id="rsStates"></div>' +
      '<section class="card rs-build" data-band="focus" id="rsBuild" aria-labelledby="rsBuildH">' +
      '  <h3 id="rsBuildH">Build a tone</h3>' +
      '  <div class="rs-field"><label for="rsCarrier">Carrier <output id="rsCarrierOut">220 Hz</output></label>' +
      '    <input id="rsCarrier" type="range" min="90" max="560" step="5" value="220" aria-label="Carrier frequency">' +
      '    <span class="rs-sub">The pitch you hear.</span></div>' +
      '  <div class="rs-field"><label for="rsBeat">Beat <output id="rsBeatOut">7.8 Hz</output></label>' +
      '    <input id="rsBeat" type="range" min="0.5" max="30" step="0.1" value="7.8" aria-label="Beat frequency">' +
      '    <span class="rs-sub" id="rsBand">Alpha — relaxed, present. Headphones.</span></div>' +
      '  <div class="rs-seg" id="rsBed" role="group" aria-label="Background bed">' +
      '    <button data-bed="none" aria-pressed="true">No bed</button>' +
      '    <button data-bed="pink" aria-pressed="false">Pink</button>' +
      '    <button data-bed="brown" aria-pressed="false">Brown</button>' +
      '    <button data-bed="white" aria-pressed="false">White</button></div>' +
      '  <button class="rs-btn rs-filled" id="rsBuildGo" style="width:100%">Play this tone</button>' +
      '</section>';
  }

  function bandOf(hz) {
    if (hz < 4) return ["Delta", "deep, drowsy — headphones"];
    if (hz < 8) return ["Theta", "drowsy, drifting — headphones"];
    if (hz < 13) return ["Alpha", "relaxed, present — headphones"];
    if (hz < 30) return ["Beta", "alert, active — headphones"];
    return ["Gamma", "bright, alert — headphones"];
  }

  /* ---------------------------------------------------------- schedule map --- */
  /* The page's own chart — three bands with 10 px monospace labels, drawn into a
     web-looking canvas — is the last thing on Home that reads as a web page. It
     keeps drawing into its (now hidden) canvas; this map is the shell's own. Same
     data (the page's `state.curves`), laid out like an audio app: time runs left to
     right, one ridge per layer for the carrier shaded by its level, the rate as a
     heat strip along the bottom, and a playhead you can read at a glance. */

  var SCHED = { last: 0, raf: 0 };
  var SCHED_INK = "#B7AC97", SCHED_FIELD = "#12100F", SCHED_GRID = "#2A2318",
      SCHED_HEAD = "#F6F1E8", SCHED_RATE = "#E0B96F", SCHED_AXIS = "#8A7250",
      SCHED_CHIP = "#5A4C36", SCHED_CHIP_LINE = "#8A7250";
  var SCHED_COLS = ["#E0B96F", "#82B3D8", "#45D6FF", "#93C793", "#E0604F", "#D9A066", "#B48EAD", "#7FD0C0"];

  function schedEl() { return $id("rsSched"); }

  function schedRate() {
    var GE = window.GnauralEngine;
    return (GE && GE.SAMPLE_RATE) || 44100;
  }

  function schedStep(total) {
    var raw = total / 5, steps = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= raw) return steps[i];
    return 7200;
  }

  function schedClock(s) {
    s = Math.max(0, Math.round(s));
    var m = Math.floor(s / 60), r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  /* one pass over a curve's flat point list: ramps are drawn as a step at each
     entry boundary (the schedule's own semantics — each entry glides to the next).
     `start` false means "line to the first point" instead of moving to it, so a
     caller can already have a subpath open (the fill closes onto its baseline). */
  function schedTrace(g, pts, total, plotW, plotH, x0, base, vmax, start) {
    var begun = !!start;
    for (var j = 0; j + 3 < pts.length; j += 4) {
      var ax = x0 + (pts[j] / total) * plotW, ay = base - (pts[j + 1] / vmax) * plotH;
      var bx = x0 + (pts[j + 2] / total) * plotW, by = base - (pts[j + 3] / vmax) * plotH;
      if (!begun) { g.moveTo(ax, ay); begun = true; }
      g.lineTo(bx, ay);
      g.lineTo(bx, by);
    }
  }

  /* an instrument-style label: field-coloured plate, then the text, so a ridge
     passing underneath can never eat it */
  function schedPlate(g, x, y, txt, ink, font) {
    g.font = font || "600 9.5px system-ui, sans-serif";
    g.textAlign = "left";
    var w = g.measureText(txt).width;
    g.fillStyle = SCHED_FIELD; g.globalAlpha = 1;
    g.fillRect(x - 1, y - 1, w + 2, 13);
    g.fillStyle = ink;
    g.fillText(txt, x, y + 10);
  }

  function drawSched() {
    var cv = schedEl();
    if (!cv || !cv.isConnected || !cv.clientWidth) return;
    var W = cv.clientWidth, H = cv.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.floor(W * dpr) || cv.height !== Math.floor(H * dpr)) {
      cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
    }
    var g = cv.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = SCHED_FIELD; g.fillRect(0, 0, W, H);
    g.textBaseline = "alphabetic";

    var st = pState();
    var c = st && st.curves;
    var total = (c && c.total) || 0;
    var voices = (c && c.voices) || [];
    var x0 = 8, x1 = W - 8, plotW = Math.max(10, x1 - x0);
    var pitchT = 32, pitchB = H - 52, plotH = Math.max(12, pitchB - pitchT);
    var rateT = pitchB + 4, rateH = 16, ruleY = rateT + rateH + 4;

    if (!voices.length || !total) {
      g.globalAlpha = 0.85;
      g.strokeStyle = SCHED_GRID; g.lineWidth = 1; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(x0, pitchT + plotH / 2); g.lineTo(x1, pitchT + plotH / 2); g.stroke();
      g.setLineDash([]);
      g.font = "500 12px system-ui, sans-serif"; g.textAlign = "center";
      g.fillStyle = SCHED_INK;
      g.fillText("Pick a session to see its shape", W / 2, pitchT + plotH / 2 - 10);
      g.textAlign = "left"; g.globalAlpha = 1;
      cv.setAttribute("aria-label", "Session map, no session loaded");
      return;
    }

    var maxBase = c.maxBase || 1, maxBeat = c.maxBeat || 1;
    var sel = st.selected | 0, many = voices.length > 1;
    var i, j, v, col, isNoise, avg, nh;

    function volAvg(vv) {
      var s = 0;
      for (var k = 1; k < vv.vol.length; k += 4) s += vv.vol[k];
      return Math.min(1, s / Math.max(1, vv.vol.length / 4));
    }

    /* time grid, faint, behind everything */
    var step = schedStep(total);
    g.strokeStyle = "rgba(183,172,151,.13)"; g.lineWidth = 1;
    for (var t = step; t < total - step * 0.4; t += step) {
      var gx = Math.round(x0 + (t / total) * plotW) + 0.5;
      g.beginPath(); g.moveTo(gx, pitchT); g.lineTo(gx, rateT + rateH); g.stroke();
    }

    /* the selected layer's own entry boundaries, a touch brighter than the grid */
    var sv = voices[sel] || voices[0];
    if (sv) {
      g.strokeStyle = "rgba(183,172,151,.26)";
      for (j = 0; j + 3 < sv.base.length; j += 4) {
        var ex = Math.round(x0 + (sv.base[j] / total) * plotW) + 0.5;
        g.beginPath(); g.moveTo(ex, pitchT); g.lineTo(ex, pitchB); g.stroke();
      }
    }

    /* filled ridges — the level shades the fill, the colour names the layer.
       A noise bed has no pitch, so it is hatched along the floor instead. */
    for (i = 0; i < voices.length; i++) {
      v = voices[i]; col = SCHED_COLS[i % SCHED_COLS.length];
      if (v.mute || !v.base.length) continue;
      isNoise = (v.type === 1 || v.type === 7 || v.type === 8);
      avg = volAvg(v);
      g.fillStyle = col;
      if (isNoise) {
        nh = 7 + 22 * avg;
        g.globalAlpha = 0.18; g.fillRect(x0, pitchB - nh, plotW, nh);
        g.save();
        g.beginPath(); g.rect(x0, pitchB - nh, plotW, nh); g.clip();
        g.globalAlpha = 0.5; g.strokeStyle = col; g.lineWidth = 1;
        for (var hx = x0 - nh; hx < x1 + nh; hx += 5) {
          g.beginPath(); g.moveTo(hx, pitchB); g.lineTo(hx + nh, pitchB - nh); g.stroke();
        }
        g.restore();
        continue;
      }
      g.globalAlpha = 0.22 + 0.38 * avg;
      g.beginPath(); g.moveTo(x0, pitchB);
      if (v.base.length > 1) g.lineTo(x0, pitchB - (v.base[1] / maxBase) * plotH);
      schedTrace(g, v.base, total, plotW, plotH, x0, pitchB, maxBase, true);
      g.lineTo(x1, pitchB); g.closePath(); g.fill();
    }

    /* outlines: selected solid, the rest lighter, muted dashed */
    for (i = 0; i < voices.length; i++) {
      v = voices[i]; col = SCHED_COLS[i % SCHED_COLS.length];
      if (!v.base.length) continue;
      isNoise = (v.type === 1 || v.type === 7 || v.type === 8);
      var dim = v.mute || (many && i !== sel);
      g.globalAlpha = v.mute ? 0.35 : dim ? 0.6 : 1;
      g.strokeStyle = col; g.lineWidth = isNoise ? 1.6 : (dim ? 1.2 : 1.8);
      if (v.mute) g.setLineDash([3, 3]);
      g.beginPath();
      if (isNoise) {
        g.moveTo(x0, pitchB - (7 + 22 * volAvg(v))); g.lineTo(x1, pitchB - (7 + 22 * volAvg(v)));
      } else {
        schedTrace(g, v.base, total, plotW, plotH, x0, pitchB, maxBase);
      }
      g.stroke();
      g.setLineDash([]);
    }

    /* beat lane: its own floor rule, then the traces inside the lane's own inset */
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(183,172,151,.16)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, rateT + rateH - 0.5); g.lineTo(x1, rateT + rateH - 0.5); g.stroke();
    g.strokeStyle = SCHED_RATE; g.lineWidth = 1.3;
    for (i = 0; i < voices.length; i++) {
      v = voices[i];
      if (v.mute || !v.beat.length || v.type === 1 || v.type === 7 || v.type === 8) continue;
      g.globalAlpha = i === sel ? 1 : 0.6;
      g.beginPath(); schedTrace(g, v.beat, total, plotW, rateH - 8, x0, rateT + rateH - 4, maxBeat); g.stroke();
    }
    g.globalAlpha = 1;

    /* axis + ruler with ticks; the end of the session always gets a label */
    g.strokeStyle = SCHED_AXIS; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, ruleY + 0.5); g.lineTo(x1, ruleY + 0.5); g.stroke();
    var marks = [];
    for (t = 0; t <= total + 0.5; t += step) marks.push(t);
    var endX = x0 + (total / total) * plotW;
    var lastX = x0 + (marks[marks.length - 1] / total) * plotW;
    if (marks[marks.length - 1] < total - 1) {
      if (endX - lastX < 46 && marks.length > 1) marks.pop();
      marks.push(total);
    }
    g.font = "500 10px system-ui, sans-serif";
    for (i = 0; i < marks.length; i++) {
      var tx = x0 + (marks[i] / total) * plotW;
      var edge = i === 0 ? "left" : (i === marks.length - 1 ? "right" : "center");
      g.strokeStyle = SCHED_AXIS;
      g.beginPath(); g.moveTo(Math.round(tx) + 0.5, ruleY); g.lineTo(Math.round(tx) + 0.5, ruleY + 4); g.stroke();
      g.fillStyle = SCHED_INK; g.textAlign = edge;
      g.fillText(schedClock(marks[i]), tx, ruleY + 15);
    }
    g.textAlign = "left";

    /* legend */
    g.globalAlpha = 0.8;
    g.font = "500 9.5px system-ui, sans-serif";
    g.fillText("shade = level · amber = beat", x0, H - 3);
    g.globalAlpha = 1;

    /* zone header: names AND the scale each lane is drawn against */
    schedPlate(g, x0, 0, "carrier Hz \u2264" + Math.round(maxBase), SCHED_INK);
    var bTxt = "beat Hz \u2264" + (maxBeat < 10 ? maxBeat.toFixed(1) : Math.round(maxBeat));
    g.font = "600 9.5px system-ui, sans-serif";
    var bw = g.measureText(bTxt).width;
    schedPlate(g, x1 - bw, 0, bTxt, SCHED_INK);

    /* playhead last, so labels and lanes can never eat it; the chip rides under
       the head rather than over it */
    var pos = Math.min(total, ((st.live && st.live.sample) || 0) / schedRate());
    var px = Math.round(x0 + (pos / total) * plotW) + 0.5;
    var lab = schedClock(pos);
    g.font = "700 10px system-ui, sans-serif";
    var lw = g.measureText(lab).width + 12;
    var lx = Math.min(W - lw - 3, Math.max(x0, px - lw / 2));
    g.fillStyle = SCHED_CHIP; g.fillRect(lx, 15, lw, 15);
    g.strokeStyle = SCHED_CHIP_LINE; g.lineWidth = 1;
    g.strokeRect(lx + 0.5, 15.5, lw - 1, 14);
    g.fillStyle = SCHED_HEAD; g.textAlign = "center";
    g.fillText(lab, lx + lw / 2, 26);
    g.textAlign = "left";
    g.strokeStyle = SCHED_HEAD; g.lineWidth = 1.6; g.globalAlpha = 1;
    g.beginPath(); g.moveTo(px, 33); g.lineTo(px, ruleY); g.stroke();
    g.fillStyle = SCHED_HEAD;
    g.beginPath(); g.arc(px, 36, 2.8, 0, Math.PI * 2); g.fill();

    cv.setAttribute("aria-label",
      "Session map, " + voices.length + (voices.length === 1 ? " layer" : " layers") +
      ", " + schedClock(total) + " total, at " + schedClock(pos));
  }

  function schedLoop(ts) {
    SCHED.raf = window.requestAnimationFrame(schedLoop);
    if (CUR !== "home" || doc.hidden) return;
    // A still session is a still map: four updates a second while paused, the full 15 only
    // while the playhead is actually moving. This loop was the app's only frame source at
    // idle and cost ~1.5 CPU cores on a tablet.
    var step = isPlaying() ? 66 : 250;
    if (ts - SCHED.last < step) return;
    SCHED.last = ts;
    try { drawSched(); } catch (e) { report("sched: " + (e && e.message)); }
  }

  function buildSched() {
    var cv = doc.createElement("canvas");
    cv.id = "rsSched";
    cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Session map");
    var box = doc.createElement("div");
    box.className = "rs-sched";
    box.appendChild(cv);
    return box;
  }

  function wireHome() {
    var tiles = $id("rsStates");
    var used = [];
    var TILE_IDS = null;
    STATES.forEach(function (s, si) {
      var hit = presetByName(s.re, used);
      if (hit) used.push(hit.i);
      var b = doc.createElement("button");
      b.className = "rs-tile";
      b.setAttribute("data-rs-tile", s.t);
      b.type = "button";
      b.innerHTML = svg(s.icon) + "<div><b>" + s.label + "</b><span>" +
        (hit ? esc(hit.it.name) : "no match") + "</span></div>";
      b.disabled = !hit;
      b.addEventListener("click", function () {
        if (!hit) return;
        loadPresetAt(hit.i, hit.it);
        pagePlay(); pushState(true);
        toast(s.label + " — " + hit.it.name);
      });
      tiles.appendChild(b);
    });

    var loopBtn = $id("rsLoopBtn");
    if (loopBtn) loopBtn.addEventListener("click", function () {
      var l = $id("loop"); if (!l) return;
      l.checked = !l.checked;
      l.dispatchEvent(new Event("change", { bubbles: true }));
      syncHero();
    });
    $id("rsPlay").addEventListener("click", function () { pageToggle(); pushState(true); });
    $id("rsStop").addEventListener("click", function () { pageStop(); pushState(true); });

    /* The library's 🎲 button now lives beside the live pill. It keeps driving the page's
       own handler (which also scrambles the visualiser), then makes sure it is audible. */
    var sur = $id("rsSurprise");
    if (sur) sur.addEventListener("click", function () {
      var b = $id("randomBtn");
      if (!b) { toast("The library is still loading — try again."); return; }
      b.click();
      if (!isPlaying()) pagePlay();
      pushState(true);
    });

    var vol = $id("rsVol");
    vol.addEventListener("input", function () { setMaster(parseFloat(vol.value)); });
    var mut = $id("rsMute");
    if (mut) mut.addEventListener("click", toggleMute);
    var loop = $id("rsLoop");
    loop.addEventListener("change", function () {
      var el = $id("loop");
      if (el) { el.checked = loop.checked; el.dispatchEvent(new Event("change", { bubbles: true })); }
    });

    var car = $id("rsCarrier"), beat = $id("rsBeat");
    function outs() {
      $id("rsCarrierOut").textContent = car.value + " Hz";
      $id("rsBeatOut").textContent = parseFloat(beat.value).toFixed(1) + " Hz";
      var b = bandOf(parseFloat(beat.value));
      $id("rsBand").textContent = b[0] + " — " + b[1];
    }
    car.addEventListener("input", outs);
    beat.addEventListener("input", outs);
    outs();

    var bed = "none";
    $$("#rsBed button").forEach(function (b) {
      b.addEventListener("click", function () {
        bed = b.getAttribute("data-bed");
        $$("#rsBed button").forEach(function (o) {
          o.setAttribute("aria-pressed", o === b ? "true" : "false");
        });
      });
    });

    $id("rsModules").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-more]");
      if (!b) return;
      $id("rsFilterBtn").setAttribute("aria-expanded", "true");
      $id("rsFilterWrap").classList.add("rs-on");
      $id("rsBrowse").scrollIntoView({ block: "start" });
    });

    var fb = $id("rsFilterBtn");
    if (fb) fb.addEventListener("click", function () {
      var on = fb.getAttribute("aria-expanded") !== "true";
      fb.setAttribute("aria-expanded", on ? "true" : "false");
      $id("rsFilterWrap").classList.toggle("rs-on", on);
    });

    $id("rsBuildGo").addEventListener("click", function () {
      var a = api(); if (!a) return;
      var GE = window.GnauralEngine || {};
      var c = parseFloat(car.value), bt = parseFloat(beat.value);
      var voices = [{ type: GE.VOICE_BINAURAL, mute: false, mono: false,
                      entries: [{ duration: 1800, volL: 0.3, volR: 0.3, basefreq: c, beat: bt }] }];
      var bedType = { pink: GE.VOICE_PINK, brown: GE.VOICE_BROWN, white: GE.VOICE_WHITE }[bed];
      if (bedType !== undefined) {
        voices.push({ type: bedType, mute: false, mono: false,
                      entries: [{ duration: 1800, volL: 0.1, volR: 0.1, basefreq: 1, beat: 0 }] });
      }
      try {
        a.loadSchedule(voices, { title: "Custom " + c + " Hz / " + bt.toFixed(1) + " Hz",
          source: "built in the app", loops: Infinity, warnings: [] });
      } catch (e) { toast("Could not build that tone"); return; }
      pagePlay(); pushState(true); syncHero();
      toast("Playing your tone");
    });
  }

  /* =============================================================== sessions === */

  function rsMinutes(it) {
    var m = /(\d+)\s*minutes?/i.exec(it.blurb || "");
    return m ? parseInt(m[1], 10) : null;
  }
  function rsFavs() {
    try { return JSON.parse(localStorage.getItem("resonance.favourites.v1") || "[]") || []; } catch (e) { return []; }
  }

  function rail(title, items, opts) {
    if (!items.length) return null;
    opts = opts || {};
    var wrap = doc.createElement("section");
    wrap.className = "rs-rail";
    wrap.innerHTML = '<div class="rs-modhead"><h4>' + title + '</h4>' +
      (opts.more ? '<button type="button" data-more="' + opts.more + '">See all</button>' : '') + '</div>';
    var track = doc.createElement("div");
    track.className = "rs-track";
    var band = /sleep|delta|drift/i.test(title) ? "sleep"
      : /focus|study|alpha|work/i.test(title) ? "focus"
      : /relax|calm|theta|medit|breath/i.test(title) ? "relax"
      : /wake|morning|gamma|beta|energ/i.test(title) ? "wake"
      : /short|under|speaker|pulse|room|iso/i.test(title) ? "other" : "";
    items.slice(0, 12).forEach(function (hit) {
      var b = doc.createElement("button");
      b.className = "rs-card";
      b.type = "button";
      if (band) b.setAttribute("data-band", band);
      var mins = rsMinutes(hit.it);
      b.innerHTML = "<b>" + esc(hit.it.name) + "</b><span>" +
        (mins ? mins + " min" : "session") +
        (/speaker/i.test(hit.it.packName) ? " <i class='rs-tag spk'>speakers</i>"
          : (/pair|binaural/i.test(hit.it.blurb || "") ? " <i class='rs-tag'>headphones</i>" : "")) +
        "</span>";
      b.addEventListener("click", function () { loadPresetAt(hit.i, hit.it); });
      track.appendChild(b);
    });
    wrap.appendChild(track);
    return wrap;
  }

  function buildModules() {
    var host = $id("rsModules");
    if (!host) return;
    var list = (pState() && pState().presetList) || [];
    var all = list.map(function (it, i) { return { it: it, i: i }; });
    var favs = rsFavs();
    host.innerHTML = "";

    var last = prefs.last;
    var cont = last !== undefined && list[last] ? [{ it: list[last], i: last }] : [];
    var modules = [
      rail("Continue", cont),
      rail("Your favourites", all.filter(function (r) { return favs.indexOf(r.it.name) !== -1; })),
      rail("Under 15 minutes", all.filter(function (r) { var m = rsMinutes(r.it); return m && m <= 15; })),
      rail("Sleep", byBand(/sleep|delta/i, all)),
      rail("Focus", byBand(/focus|study|alpha|concentrat/i, all)),
      rail("Speaker-friendly", all.filter(function (r) {
        return /speaker|iso|pulse/i.test(r.it.packName + " " + (r.it.blurb || ""));
      }))
    ];
    var shown = 0;
    modules.forEach(function (m) { if (m) { host.appendChild(m); shown++; } });
    if (!shown) host.innerHTML = "";
  }

  function byBand(re, all) {
    return all.filter(function (r) { return re.test(r.it.name + " " + (r.it.packName || "")); }).slice(0, 12);
  }

  function buildSessions() {
    screenEls.sessions.innerHTML =
      '<div class="rs-pad"></div>' +
      '<section class="card" data-band="other" id="rsBrowse" aria-labelledby="rsBrowseH">' +
      '  <h3 id="rsBrowseH" class="sr-only">Sessions</h3>' +
      '  <div id="rsModules"></div>' +
      '  <div class="rs-searchrow"><button class="rs-chipbtn" id="rsFilterBtn" aria-expanded="false" ' +
      '    aria-controls="rsFilterWrap">Filters</button></div>' +
      '  <div id="rsFilterWrap"></div></section>' +
      '<div class="rs-pad"></div>';
  }

  /* ================================================================= studio === */

  /* ------------------------------------------------------------------ studio --- */

  /* A layer is a page "voice". The page's names are the truth (binaural beat, pink
     noise); the shell only adds what each one means for the person holding the phone. */
  function voiceEngine() { return window.GnauralEngine || {}; }
  function isNoise(v) {
    var GE = voiceEngine();
    return v.type === GE.VOICE_PINK || v.type === GE.VOICE_BROWN || v.type === GE.VOICE_WHITE;
  }
  /* The page keeps its type names in a module-scope table, not on window, so the shell
     carries its own copy of the same nine names (engine.js's type constants). */
  var RS_TYPE_NAMES = {
    0: "Binaural beat", 1: "Pink noise", 2: "Audio file", 3: "Isochronic pulses",
    4: "Alt isochronic pulses", 5: "Water drops", 6: "Rain", 7: "White noise", 8: "Brown noise"
  };
  function voiceName(v) {
    var GE = voiceEngine();
    if (v.type === GE.VOICE_PINK) return "Pink noise";
    if (v.type === GE.VOICE_BROWN) return "Brown noise";
    if (v.type === GE.VOICE_WHITE) return "White noise";
    if (v.mono && v.type === GE.VOICE_BINAURAL) return "Steady tone";
    return RS_TYPE_NAMES[v.type] || "Tone";
  }
  function hzText(hz) {
    hz = parseFloat(hz) || 0;
    return (hz >= 10 ? Math.round(hz) : Math.round(hz * 10) / 10) + " Hz";
  }
  function voiceEntry(v) { return (v.entries && v.entries[0]) || {}; }
  function voiceBeat(v) { return voiceEntry(v).beat || 0; }
  function voiceBase(v) { return voiceEntry(v).basefreq || 0; }
  function voiceLevel(v) {
    var top = 0;
    (v.entries || []).forEach(function (e) {
      top = Math.max(top, e.volL || 0, e.volR || 0);
    });
    return top;
  }
  function voiceDetail(v) {
    if (isNoise(v)) return "noise bed";
    var b = voiceBeat(v);
    if (!b) return hzText(voiceBase(v)) + " · steady";
    return hzText(voiceBase(v)) + " · " + hzText(b) + " beat · " + bandOf(b)[0].toLowerCase();
  }
  function leadVoice(vs) {
    for (var i = 0; i < (vs || []).length; i++) if (!isNoise(vs[i])) return vs[i];
    return (vs || [])[0] || null;
  }
  function needsPhones(vs) {
    var GE = voiceEngine();
    return (vs || []).some(function (v) {
      return v.type === GE.VOICE_BINAURAL && !v.mono && voiceBeat(v) > 0;
    });
  }

  var mixOpen = -1;
  var mixSig = "";

  /* The rows carry the numbers, so the signature must too: a replaced schedule with the
     same shape is a different mix. Edits write on change (not input), so a rebuild here
     never lands in the middle of a drag. */
  function mixStructure(vs) {
    return (vs || []).map(function (v) {
      return [v.type, (v.entries || []).length, v.mute ? 1 : 0,
              Math.round(voiceBase(v)), Math.round(voiceBeat(v) * 10),
              Math.round(voiceLevel(v) * 100)].join(":");
    }).join("|");
  }

  /* The number that only ever means one thing: the level of the loudest entry, so a
     layer that fades is still summarised by what it reaches. */
  function setLayerLevel(v, level) {
    var cur = voiceLevel(v);
    (v.entries || []).forEach(function (e) {
      if (cur > 0.0001) {
        var r = level / cur;
        e.volL = Math.max(0, Math.min(1, (e.volL || 0) * r));
        e.volR = Math.max(0, Math.min(1, (e.volR || 0) * r));
      } else { e.volL = e.volR = level; }
    });
  }

  function mixEditor(v, i, count) {
    var e = voiceEntry(v);
    var multi = (v.entries || []).length > 1;
    var noise = isNoise(v);
    var lvl = Math.round(voiceLevel(v) * 100);
    var h = '<div class="rs-medit" id="rsMedit' + i + '">';
    if (!noise && !multi) {
      h += '<div class="rs-mfield"><label for="rsEB' + i + '">Pitch' +
        '<output id="rsEBO' + i + '">' + hzText(e.basefreq || 0) + '</output></label>' +
        '<input id="rsEB' + i + '" type="range" min="40" max="600" step="1" value="' +
        Math.round(e.basefreq || 0) + '" data-rs="mix-pitch" data-i="' + i + '" aria-label="Pitch in hertz">' +
        '<span class="rs-sub">The tone you hear.</span></div>' +
        '<div class="rs-mfield"><label for="rsET' + i + '">Beat' +
        '<output id="rsETO' + i + '">' + hzText(e.beat || 0) +
        ((e.beat || 0) ? " · " + bandOf(e.beat)[0].toLowerCase() : "") + '</output></label>' +
        '<input id="rsET' + i + '" type="range" min="0" max="40" step="0.1" value="' + (e.beat || 0) +
        '" data-rs="mix-beat" data-i="' + i + '" aria-label="Beat in hertz">' +
        '<span class="rs-sub">Zero holds a steady tone.</span></div>';
    } else if (multi) {
      h += '<p class="rs-sub">A timeline of ' + (v.entries || []).length +
        ' entries — pitch and beat follow its curve. Open the timeline to change them.</p>';
    }
    h += '<div class="rs-mfield"><label for="rsEL' + i + '">Level' +
      '<output id="rsELO' + i + '">' + lvl + '%</output></label>' +
      '<input id="rsEL' + i + '" type="range" min="0" max="100" step="1" value="' + lvl +
      '" data-rs="mix-level" data-i="' + i + '" aria-label="Layer level in percent"></div>' +
      '<div class="rs-medit-foot">' +
      '<button class="rs-mini" data-rs="mix-timeline" data-i="' + i + '">Timeline · ' +
      (v.entries || []).length + ' entries</button>' +
      (count > 1 ? '<button class="rs-mini rs-del" data-rs="mix-remove" data-i="' + i +
        '">Remove</button>' : '') +
      '</div></div>';
    return h;
  }

  function paintMix(vs) {
    var box = $id("rsMixRows"); if (!box) return;
    var count = (vs || []).length;
    box.innerHTML = (vs || []).map(function (v, i) {
      var on = i === mixOpen;
      return '<div class="rs-lay' + (on ? " open" : "") + '" data-i="' + i + '">' +
        '<div class="rs-mhead">' +
        '<button class="rs-mopen" data-rs="mix-open" data-i="' + i + '" aria-expanded="' +
        (on ? "true" : "false") + '" aria-controls="rsMedit' + i + '">' +
        '<span class="rs-mdot" data-d="' + (i % 6) + '"></span>' +
        '<span class="rs-mtxt"><b>' + esc(voiceName(v)) + '</b><span>' + esc(voiceDetail(v)) +
        '</span></span>' +
        '<span class="rs-mlvl">' + Math.round(voiceLevel(v) * 100) + '%</span>' +
        svg("chev", 18) + '</button>' +
        '<button class="rs-mmini' + (v.mute ? " on" : "") + '" data-rs="mix-mute" data-i="' + i +
        '" aria-pressed="' + (v.mute ? "true" : "false") + '" aria-label="' +
        (v.mute ? "Unmute " : "Mute ") + esc(voiceName(v)) + '">' +
        (v.mute ? "muted" : "mute") + '</button></div>' +
        (on ? mixEditor(v, i, count) : "") + '</div>';
    }).join("");
    var c = $id("rsMixCount");
    if (c) c.textContent = String(count);
    var hint = $id("rsMixHint");
    if (hint) hint.textContent = count
      ? "Every layer adds one sound. Tap a layer to tune it."
      : "Nothing in the mix yet. Add a sound, or start a tone from scratch.";
  }

  function applyMix() {
    var a = api(); if (!a) return;
    try { a.rebuildEngine(); a.syncToWorklet(); a.refresh(); } catch (e) { }
    mixSig = "";
    syncStudio();
    pushState(true);
  }

  function openTimeline(i) {
    var adv = $id("rsAdvDet"); if (adv) adv.open = true;
    var rows = $$("#voicelist .vrow");
    if (rows[i] && rows[i].click) rows[i].click();
    var card = $id("rsVoices");
    if (card && card.scrollIntoView) card.scrollIntoView({ block: "start" });
  }

  /* The add-a-sound catalogue is the page's own (rates.js), not a second copy: its six
     groups become chapters, and the by-hand form and Build a tone join them so every
     way of adding a sound starts in one place. */
  var CHAP = [];
  function shortChapter(t) {
    if (/brainwave|band/i.test(t)) return "Bands";
    if (/schumann/i.test(t)) return "Resonance";
    if (/breath/i.test(t)) return "Breathing";
    if (/focus.level/i.test(t)) return "Focus sets";
    if (/solfeggio/i.test(t)) return "Solfeggio";
    if (/noise/i.test(t)) return "Noise";
    return String(t || "More").split(/[—(]/)[0].trim().slice(0, 14);
  }
  function buildChapters() {
    var tabs = $id("rsChapters"), panel = $id("rsChapPanel");
    var qp = $id("quickpick");
    if (!tabs || !panel || !qp) return;
    $$(":scope > p.hint", qp).forEach(function (h) { h.style.display = "none"; });
    var groups = [];
    $$("details", qp).forEach(function (d) {
      var sm = d.querySelector("summary");
      /* the group's first hint is its blurb; the rest are one line per chip, which is
         the chip's own title in a pane this narrow - keep the catalogue readable */
      var body = d.querySelector(".body");
      if (body) $$(".hint", body).forEach(function (h, k) { if (k) h.style.display = "none"; });
      groups.push({ label: shortChapter(sm ? text(sm) : ""), el: d, det: true });
    });
    var hand = $id("addvoicePane");
    if (hand) groups.push({ label: "By hand", el: hand, det: true });
    var scratch = $id("rsBuild");
    if (scratch) groups.push({ label: "From scratch", el: scratch, det: false });
    CHAP = groups;
    tabs.innerHTML = groups.map(function (g, i) {
      return '<button type="button" role="tab" data-chap="' + i + '" aria-selected="' +
        (i === 0 ? "true" : "false") + '">' + esc(g.label) + '</button>';
    }).join("");
    groups.forEach(function (g, i) {
      if (g.det) g.el.open = i === 0;
      g.el.classList.toggle("rs-chapoff", i !== 0);
    });
  }
  function pickChapter(i) {
    CHAP.forEach(function (g, j) {
      var on = i === j;
      if (g.det && on) g.el.open = true;
      g.el.classList.toggle("rs-chapoff", !on);
      if (g.det) g.el.classList.toggle("on", on);
    });
    $$("#rsChapters [data-chap]").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-chap") === String(i) ? "true" : "false");
    });
  }

  function wireStudio() {
    /* The page can replace the whole schedule (Build a tone, a quick pick, a preset).
       Its API is the one place all of those pass through, so wrap it once: the mix then
       repaints in the same beat instead of waiting for the 1 Hz tick. */
    (function hookApi() {
      var a = api();
      if (!a) { window.setTimeout(hookApi, 250); return; }
      if (a.__rsStudioHooked) return;
      a.__rsStudioHooked = true;
      ["loadSchedule", "loadPreset", "loadGnauralText", "addVoice", "removeVoice", "refresh"]
        .forEach(function (k) {
          var fn = a[k];
          if (typeof fn !== "function") return;
          a[k] = function () {
            var out = fn.apply(a, arguments);
            try { mixSig = ""; syncStudio(); } catch (e) { }
            return out;
          };
        });
    })();

    var play = $id("rsStuPlay");
    if (play) play.addEventListener("click", function () { pagePlay(); pushState(true); syncStudio(); });
    var pause = $id("rsStuPause");
    if (pause) pause.addEventListener("click", function () { pagePause(); pushState(true); syncStudio(); });
    var stop = $id("rsStuStop");
    if (stop) stop.addEventListener("click", function () { pageStop(); pushState(true); syncStudio(); });
    var vol = $id("rsStuVol");
    if (vol) vol.addEventListener("input", function () { setMaster(parseFloat(vol.value)); });
    var lp = $id("rsStuLoop");
    if (lp) lp.addEventListener("change", function () {
      var l = $id("loop");
      if (!l) return;
      l.checked = this.checked;
      l.dispatchEvent(new Event("change", { bubbles: true }));
    });

    var add = $id("rsMixAdd");
    if (add) add.addEventListener("click", function () {
      var pane = $id("rsAddPane"); if (!pane) return;
      var open = pane.hidden;
      if (open) buildChapters();
      pane.hidden = !open;
      this.setAttribute("aria-expanded", open ? "true" : "false");
      this.classList.toggle("open", open);
      if (open) {
        var b = $id("rsBody");
        if (b && pane.getBoundingClientRect().top > window.innerHeight - 140) {
          pane.scrollIntoView({ block: "nearest" });
        }
      }
    });

    var tabs = $id("rsChapters");
    if (tabs) tabs.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-chap]") : null;
      if (!b) return;
      pickChapter(parseInt(b.getAttribute("data-chap"), 10) || 0);
    });

    var rows = $id("rsMixRows");
    if (rows && !rows.rsWired) {
      rows.rsWired = true;
      rows.addEventListener("click", function (ev) {
        var b = ev.target.closest ? ev.target.closest("[data-rs]") : null;
        if (!b || !rows.contains(b)) return;
        var st = pState(); if (!st) return;
        var vs = st.schedule.voices || [];
        var i = parseInt(b.getAttribute("data-i"), 10) || 0;
        var act = b.getAttribute("data-rs");
        if (act === "mix-open") {
          mixOpen = (mixOpen === i) ? -1 : i;
          paintMix(vs);
        } else if (act === "mix-mute") {
          if (!vs[i]) return;
          vs[i].mute = !vs[i].mute;
          applyMix();
        } else if (act === "mix-remove") {
          var a = api();
          if (a && a.removeVoice(i)) {
            if (mixOpen >= vs.length - 1) mixOpen = -1;
            applyMix();
            toast("Layer removed");
          } else toast("Keep at least one layer");
        } else if (act === "mix-timeline") {
          openTimeline(i);
        }
      });
      rows.addEventListener("input", function (ev) {
        var r = ev.target; if (!r || !r.getAttribute) return;
        var k = r.getAttribute("data-rs"); if (!k) return;
        var out = r.parentNode.querySelector("output");
        if (!out) return;
        if (k === "mix-level") out.textContent = r.value + "%";
        else if (k === "mix-pitch") out.textContent = hzText(parseFloat(r.value));
        else if (k === "mix-beat") {
          var bv = parseFloat(r.value) || 0;
          out.textContent = hzText(bv) + (bv ? " · " + bandOf(bv)[0].toLowerCase() : "");
        }
      });
      /* write on release, not on every pixel of the drag: each write rebuilds the
         engine, and the page's own editor edits on change for the same reason */
      rows.addEventListener("change", function (ev) {
        var r = ev.target; if (!r || !r.getAttribute) return;
        var k = r.getAttribute("data-rs");
        if (k !== "mix-pitch" && k !== "mix-beat" && k !== "mix-level") return;
        var st = pState(); if (!st) return;
        var i = parseInt(r.getAttribute("data-i"), 10) || 0;
        var v = (st.schedule.voices || [])[i]; if (!v) return;
        var val = parseFloat(r.value); if (!isFinite(val)) return;
        if (k === "mix-level") setLayerLevel(v, val / 100);
        else {
          var e = v.entries && v.entries[0]; if (!e) return;
          if (k === "mix-pitch") e.basefreq = Math.max(1, val);
          else e.beat = Math.max(0, val);
        }
        applyMix();
        if (k === "mix-pitch" || k === "mix-beat") paintMix(st.schedule.voices || []);
      });
    }
  }

  function syncStudio() {
    var st = pState(); if (!st) return;
    var vs = (st.schedule && st.schedule.voices) || [];
    var title = $id("rsStuTitle");
    if (title) title.textContent = st.title || sessionTitle() || "Nothing loaded";

    var clock = clockText();
    var pill = $id("rsStuPill");
    if (pill) {
      var at = String(clock || "").split("/")[0].trim();
      var m = isPlaying() ? "playing" : (at && at !== "0:00" ? "paused" : (vs.length ? "ready" : "idle"));
      if (pill.textContent !== m) pill.textContent = m;
      pill.setAttribute("data-state", m);
    }
    var cl = $id("rsStuClock");
    if (cl) cl.textContent = clock || "0:00 / 0:00";
    var b = $id("rsStuPlay"), pb = $id("rsStuPause");
    var on = isPlaying();
    if (b) b.classList.toggle("rs-live", on);
    if (pb) pb.classList.toggle("rs-dim", !on);
    var lp = $id("rsStuLoop"), lel = $id("loop");
    if (lp && lel && lp.checked !== lel.checked) lp.checked = lel.checked;

    var lead = leadVoice(vs);
    var beat = lead ? voiceBeat(lead) : 0;
    var dur = 0;
    try { dur = st.engine && st.engine.duration ? st.engine.duration() : 0; } catch (e) { }
    var fmt = (api() && api().fmtTime) ? api().fmtTime(dur) : "";
    var tiles = [
      ["200", lead ? hzText(voiceBase(lead)) : "—", "carrier"],
      ["200", beat ? hzText(beat) : "—", beat ? "beat · " + bandOf(beat)[0].toLowerCase() : "beat"],
      ["200", dur ? fmt : "—", "length"],
      ["200", String(vs.length), vs.length === 1 ? "layer" : "layers"]
    ];
    var metrics = $id("rsMetrics");
    if (metrics) {
      var html = tiles.map(function (t) {
        return '<div class="rs-mtile"><b>' + esc(t[1]) + '</b><span>' + esc(t[2]) + '</span></div>';
      }).join("");
      if (metrics.dataset.k !== html) { metrics.dataset.k = html; metrics.innerHTML = html; }
    }
    var need = $id("rsStuNeed");
    if (need) {
      var n = !vs.length ? "" :
        needsPhones(vs) ? "Headphones — the beat is made between your ears."
          : "Speaker-safe — nothing here needs headphones.";
      if (need.textContent !== n) need.textContent = n;
    }

    var sig = mixStructure(vs);
    if (sig !== mixSig) { mixSig = sig; paintMix(vs); }
    else if (mixOpen >= 0 && mixOpen < vs.length) {
      /* keep the open row's summary text honest without rebuilding its sliders */
      var row = $$("#rsMixRows .rs-lay")[mixOpen];
      if (row) {
        var lv = row.querySelector(".rs-mlvl");
        if (lv) lv.textContent = Math.round(voiceLevel(vs[mixOpen]) * 100) + "%";
        var dt = row.querySelector(".rs-mtxt span");
        if (dt) dt.textContent = voiceDetail(vs[mixOpen]);
      }
    }
  }

  function buildStudio() {
    screenEls.studio.innerHTML =
      '<div class="rs-pad"></div>' +
      /* --- now: what is loaded, the numbers that matter, and the transport --- */
      '<section class="card rs-now" data-band="focus" id="rsNow" aria-labelledby="rsNowH">' +
      '  <div class="rs-now-top"><h3 id="rsNowH"><span id="rsStuTitle">Nothing loaded</span></h3>' +
      '    <span class="rs-stpill" id="rsStuPill" data-state="idle">idle</span></div>' +
      '  <div class="rs-metrics" id="rsMetrics" aria-live="polite"></div>' +
      '  <div class="rs-nowtr">' +
      '    <button class="rs-ampk rs-stuplay" id="rsStuPlay" aria-label="Play"></button>' +
      '    <button class="rs-ampk rs-stupause" id="rsStuPause" aria-label="Pause"></button>' +
      '    <button class="rs-ampk rs-stustop" id="rsStuStop" aria-label="Stop"></button>' +
      '    <label class="rs-stuvol"><input id="rsStuVol" type="range" min="0" max="1" step="0.01" ' +
      'value="0.7" aria-label="Volume"></label>' +
      '  </div>' +
      '  <div class="rs-nowtr2">' +
      '    <span class="rs-nowclock" id="rsStuClock">0:00 / 0:00</span>' +
      '    <label class="rs-sw rs-stuloop"><span class="rs-swt"><span>Loop</span></span>' +
      '      <input type="checkbox" id="rsStuLoop" checked><span class="rs-track" aria-hidden="true"></span></label>' +
      '  </div>' +
      '  <p class="rs-nowneed" id="rsStuNeed"></p>' +
      '</section>' +
      /* --- the mix: one row per layer, the place a person actually works --- */
      '<section class="card" data-band="focus" id="rsMix" aria-labelledby="rsMixH">' +
      '  <div class="rs-mix-top"><h3 id="rsMixH">The mix</h3>' +
      '    <span class="rs-cnt" id="rsMixCount">0</span></div>' +
      '  <p class="rs-hint" id="rsMixHint">Every layer adds one sound. Tap a layer to tune it.</p>' +
      '  <div class="rs-mrows" id="rsMixRows"></div>' +
      '  <button class="rs-btn rs-tonal rs-addbtn" id="rsMixAdd" aria-expanded="false" ' +
      '    aria-controls="rsAddPane">+ Add a sound</button>' +
      '  <div class="rs-addpane" id="rsAddPane" hidden>' +
      '    <div class="rs-chapters" id="rsChapters" role="tablist" aria-label="Kinds of sound"></div>' +
      '    <div class="rs-chap" id="rsChapPanel"></div>' +
      '  </div>' +
      '</section>' +
      /* --- keep it: the page's own files card, unfolded --- */
      '<details class="tool rs-mod" id="rsFilesDet" open><summary>Save, export &amp; share</summary>' +
      '  <div class="body"><section class="card" id="rsFiles" aria-label="Save, export and share"></section></div>' +
      '</details>' +
      /* --- advanced: the raw schedule, then the meters --- */
      '<details class="tool rs-mod" id="rsAdvDet"><summary>Advanced — the raw schedule</summary>' +
      '  <div class="body"><section class="card" id="rsVoices" aria-labelledby="rsVoicesH">' +
      '    <h3 id="rsVoicesH">Raw schedule</h3>' +
      '    <p class="rs-hint">Each voice is a track; each entry is a segment that ramps into the next.</p>' +
      '  </section></div>' +
      '</details>' +
      '<details class="tool rs-mod" id="rsLiveDet"><summary>Live meters &amp; tools</summary>' +
      '  <div class="body"><section class="card" id="rsLive" aria-label="Live meters and tools"></section></div>' +
      '</details>' +
      '<div class="rs-pad"></div>';
    wireStudio();
  }

  /* ==================================================================== vis === */

  var MEDIA = [
    ["plate", "Plate"], ["bolted", "Bolted"], ["disc", "Disc"],
    ["drum", "Drum"], ["water", "Water"], ["bubbles", "Bubbles"]
  ];

  var SCENES = [
    ["cathedral", "Cathedral"], ["cold-forge", "Cold Forge"], ["solar-disc", "Solar Disc"],
    ["faraday-storm", "Faraday Storm"], ["skin-tight", "Skin Tight"], ["minnaert-cloud", "Bubbles"],
    ["ember-pool", "Ember Pool"], ["black-water", "Black Water"]
  ];


  /* Each option carries a mark of its own. Palettes and chamber scenes get a swatch in
     the colours that option actually renders (extracted from cymrender.js' palette
     table and vizpal.js' stops); backdrops and overlays have no colour of their own, so
     they get a shape mark instead. Decorative only: the label still carries the name. */
  var RS_SW = {"cym": {"champagne": ["rgb(249,228,177)", "rgb(255,236,189)"], "ion": ["rgb(136,237,255)", "rgb(158,246,255)"], "copper": ["rgb(255,194,143)", "rgb(255,202,156)"], "verdigris": ["rgb(158,249,228)", "rgb(194,255,238)"], "ice": ["rgb(217,237,255)", "rgb(230,243,255)"], "mono": ["rgb(237,237,237)", "rgb(253,253,253)"], "ember": ["rgb(255,176,104)", "rgb(255,205,128)"], "magma": ["rgb(255,133,176)", "rgb(255,172,189)"], "orchid": ["rgb(228,152,255)", "rgb(238,189,255)"], "ultraviolet": ["rgb(172,133,255)", "rgb(196,183,255)"], "toxic": ["rgb(160,238,104)", "rgb(189,246,138)"], "candy": ["rgb(255,168,220)", "rgb(255,202,238)"], "aurora": ["rgb(123,250,220)", "rgb(172,255,236)"], "solar": ["rgb(255,228,104)", "rgb(255,241,156)"], "neon": ["rgb(128,205,255)", "rgb(176,222,255)"], "blood": ["rgb(246,104,123)", "rgb(255,156,160)"], "lagoon": ["rgb(104,233,238)", "rgb(156,248,250)"], "blossom": ["rgb(255,156,189)", "rgb(255,189,211)"], "cobalt": ["rgb(143,199,248)", "rgb(205,233,255)"], "gunmetal": ["rgb(189,211,233)", "rgb(222,233,246)"], "abyss": ["rgb(90,230,249)", "rgb(148,253,255)"]}, "viz": {"auto": ["hsl(211, 26%, 62%)", "hsl(225, 20%, 36%)"], "ember": ["hsl(42, 37%, 64%)", "hsl(56, 27%, 38%)"], "moss": ["hsl(139, 34%, 60%)", "hsl(153, 24%, 34%)"], "ice": ["hsl(247, 27%, 58%)", "hsl(261, 20%, 32%)"], "dusk": ["hsl(308, 35%, 60%)", "hsl(322, 25%, 34%)"], "rose": ["hsl(20, 58%, 60%)", "hsl(34, 48%, 34%)"], "mono": ["hsl(210, 4%, 66%)", "hsl(210, 3%, 40%)"]}, "scenePal": {"cold-forge": "gunmetal", "ember-grid": "ember", "ultraviolet-room": "ultraviolet", "salt-flat": "solar", "toxic-bloom": "toxic", "cathedral": "mono", "lagoon-drift": "lagoon", "orchid-field": "orchid", "blood-iron": "blood", "blossom": "blossom", "machine-room": "neon", "magma-bolt": "magma", "candy-rig": "candy", "aurora-bolt": "aurora", "iron-weather": "ice", "solar-disc": "solar", "deep-lagoon": "ice", "violet-vault": "ultraviolet", "neon-plate": "neon", "ash-coin": "mono", "skin-tight": "verdigris", "toxic-membrane": "toxic", "blood-drum": "blood", "candy-skin": "candy", "faraday-storm": "ion", "black-water": "mono", "ember-pool": "ember", "aurora-ripple": "aurora", "minnaert-cloud": "abyss", "orchid-fizz": "orchid"}};
  var RS_MK = {"off": "<circle cx=\"8\" cy=\"8\" r=\"5.2\" stroke-dasharray=\"2 2.2\"/>", "tide": "<path d=\"M1.4 9.6c1.7-2.4 3.4-2.4 5.1 0s3.4 2.4 5.1 0 2.3-1.2 3-.1\"/><path d=\"M1.4 12.8c1.7-2.4 3.4-2.4 5.1 0s3.4 2.4 5.1 0\"/>", "phasefield": "<path d=\"M8 13.2a5.2 5.2 0 1 1 0-10.4\"/><path d=\"M8 11.2a3.2 3.2 0 1 1 0-6.4\"/><circle cx=\"8\" cy=\"8\" r=\"1\"/>", "drift": "<circle cx=\"3.4\" cy=\"5.4\" r=\".95\"/><circle cx=\"7\" cy=\"9.4\" r=\".95\"/><circle cx=\"11\" cy=\"4.6\" r=\".95\"/><circle cx=\"12.6\" cy=\"11\" r=\".95\"/><circle cx=\"5.4\" cy=\"12.2\" r=\".95\"/>", "rainfall": "<path d=\"M4 2.5 2.6 8.5\"/><path d=\"M8 2.5 6.6 8.5\"/><path d=\"M12 2.5 10.6 8.5\"/><path d=\"M6 10 4.6 14\"/><path d=\"M10 10 8.6 14\"/>", "score": "<path d=\"M2 11.6h4v-3h4v-3h4\"/>", "aurora": "<path d=\"M2 10.6c2.4-3.8 4.6-3.8 6 0s3.6 3.8 6 0\"/><path d=\"M2 6.2c2.4-3.8 4.6-3.8 6 0\"/>", "pulse": "<path d=\"M4 12.2V7\"/><path d=\"M8 12.2V4\"/><path d=\"M12 12.2V9\"/>", "phasors": "<circle cx=\"8\" cy=\"8\" r=\"5.2\"/><path d=\"M8 8 12.2 6\"/><circle cx=\"12.2\" cy=\"6\" r=\"1\"/>", "traces": "<path d=\"M1.6 10.4 5 6.6l2.6 3 2.6-5 3.6 2.6\"/>", "orbits": "<circle cx=\"8\" cy=\"8\" r=\"3\"/><ellipse cx=\"8\" cy=\"8\" rx=\"6.4\" ry=\"3.4\" transform=\"rotate(-24 8 8)\"/>", "ripples": "<circle cx=\"8\" cy=\"8\" r=\"2\"/><circle cx=\"8\" cy=\"8\" r=\"4\"/><circle cx=\"8\" cy=\"8\" r=\"6\"/>", "harmonograph": "<path d=\"M8 2.4c2.7 0 2.7 4.1 0 5.6s-2.7 5.6 0 5.6\"/><path d=\"M4.3 8c0-2.7 4.1-2.7 5.6 0\"/>", "weave": "<path d=\"M2.4 2.4 13.6 13.6\"/><path d=\"M13.6 2.4 2.4 13.6\"/><path d=\"M8 2v12\"/><path d=\"M2 8h12\"/>", "meters": "<path d=\"M3 12.4V8.6\"/><path d=\"M6.6 12.4V5.4\"/><path d=\"M10.2 12.4V7\"/><path d=\"M13.4 12.4V9.6\"/>", "plate": "<rect x=\"2.6\" y=\"2.6\" width=\"10.8\" height=\"10.8\" rx=\"1.4\"/>", "bolted": "<rect x=\"2.6\" y=\"2.6\" width=\"10.8\" height=\"10.8\" rx=\"1.2\"/><circle cx=\"4.6\" cy=\"4.6\" r=\".6\"/><circle cx=\"11.4\" cy=\"4.6\" r=\".6\"/><circle cx=\"4.6\" cy=\"11.4\" r=\".6\"/><circle cx=\"11.4\" cy=\"11.4\" r=\".6\"/>", "disc": "<circle cx=\"8\" cy=\"8\" r=\"5.6\"/><circle cx=\"8\" cy=\"8\" r=\"1.4\"/>", "drum": "<ellipse cx=\"8\" cy=\"8\" rx=\"5.6\" ry=\"3\"/><path d=\"M2.4 8v2.6c0 1.7 2.5 3 5.6 3s5.6-1.3 5.6-3V8\"/>", "water": "<path d=\"M1.8 6.6c1.6-2 3.1-2 4.7 0s3.1 2 4.7 0\"/><path d=\"M1.8 10.2c1.6-2 3.1-2 4.7 0s3.1 2 4.7 0\"/>", "bubbles": "<circle cx=\"5.4\" cy=\"10.4\" r=\"2.6\"/><circle cx=\"10.4\" cy=\"6.2\" r=\"1.6\"/><circle cx=\"9.6\" cy=\"11.6\" r=\"1\"/>"};

  function swatch(bg) {
    return '<i class="rs-swb" aria-hidden="true" style="background-image:' + bg + '"></i>';
  }
  function mark(id) {
    var g = RS_MK[id];
    return g ? '<i class="rs-mk" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" ' +
      'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
      g + '</svg></i>' : '';
  }
  function decorateChamberPalettes() {
    var box = $id("cymPal");
    if (!box) return;
    $$(".cym-chip", box).forEach(function (c) {
      if (c.getAttribute("data-rs-sw")) return;
      c.setAttribute("data-rs-sw", "1");
      var cols = RS_SW.cym[c.getAttribute("data-id")] || RS_SW.cym.champagne;
      if (!cols) return;
      c.insertAdjacentHTML("afterbegin", swatch("linear-gradient(135deg," + cols[0] + "," + cols[1] + ")"));
    });
  }
  function decorateSwatches() {
    decorateChamberPalettes();
    var sc = $id("rsScenes");
    if (sc) $$("button[data-scene]", sc).forEach(function (b) {
      if (b.getAttribute("data-rs-sw")) return;
      b.setAttribute("data-rs-sw", "1");
      var cols = RS_SW.cym[RS_SW.scenePal[b.getAttribute("data-scene")]] || RS_SW.cym.mono;
      b.insertAdjacentHTML("afterbegin", swatch("linear-gradient(135deg," + cols[0] + "," + cols[1] + ")"));
    });
    var med = $id("rsMedia");
    if (med) $$("button[data-medium]", med).forEach(function (b) {
      if (b.getAttribute("data-rs-sw")) return;
      b.setAttribute("data-rs-sw", "1");
      b.insertAdjacentHTML("afterbegin", mark(b.getAttribute("data-medium")));
    });
    [["vizBackdrops", 0], ["vizOverlays", 0], ["vizPalettes", 1]].forEach(function (pair) {
      var box = $id(pair[0]); if (!box) return;
      $$(".chip", box).forEach(function (c) {
        if (c.getAttribute("data-rs-sw")) return;
        c.setAttribute("data-rs-sw", "1");
        var id = c.getAttribute("data-id") || "";
        if (pair[1]) {
          var cols = RS_SW.viz[id] || RS_SW.viz.mono || ["#8b8b8b", "#d0d0d0"];
          /* only the stops that exist: a missing one used to write ",undefined" into the
             gradient, which is invalid and renders as an empty circle */
          var ramp = cols.slice(0, 3).filter(function (x) { return !!x; }).join(",");
          c.insertAdjacentHTML("afterbegin", swatch("linear-gradient(135deg," + ramp + ")"));
        } else {
          c.insertAdjacentHTML("afterbegin", mark(id));
        }
      });
    });
  }

  function sessionShape() {
    var st = pState(); if (!st) return null;
    var vs = (st.schedule && st.schedule.voices) || [];
    var live = vs.filter(function (v) { return !v.mute; });
    if (!live.length) return null;
    var carrier = 0, beat = 0, iso = false, noise = false, binaural = false;
    live.forEach(function (v) {
      var e = (v.entries && v.entries[0]) || {};
      if (v.type === 0) { binaural = true; if (!carrier) carrier = e.basefreq || 0; beat = e.beat || 0; }
      else if (v.type === 3 || v.type === 4) { iso = true; beat = beat || e.beat || 0; if (!carrier) carrier = e.basefreq || 0; }
      else { noise = true; }
    });
    if (!carrier) carrier = 220;
    if (!beat && iso) beat = 8;
    return { carrier: carrier, beat: beat, iso: iso, noise: noise, binaural: binaural,
             voices: live.length };
  }

  function planFor(shape) {
    if (!shape) return null;
    var b = shape.beat;
    if (shape.iso) return { medium: "water", scene: "ember-pool", band: "isochronic", why: "pulses drive the water surface" };
    if (shape.noise && !shape.binaural) return { medium: "drum", scene: "skin-tight", band: "noise", why: "a noise bed shakes the skin and lifts dust" };
    if (b < 4) return { medium: "plate", scene: "cathedral", band: "delta", why: "slow delta sits on a big free plate" };
    if (b < 8) return { medium: "plate", scene: "cold-forge", band: "theta", why: "theta drifts across a steel plate" };
    if (b < 13) return { medium: "disc", scene: "solar-disc", band: "alpha", why: "alpha rings a clamped disc" };
    if (b < 30) return { medium: "water", scene: "faraday-storm", band: "beta", why: "beta makes fast Faraday ripples" };
    return { medium: "water", scene: "black-water", band: "gamma", why: "gamma drives a tight, bright ripple" };
  }

  var follow = prefs.follow !== false;

  /* Choosing a chip is a decision, not a temporary override: it stops the chamber
     re-deriving the look from the session, and it says so on the Follow switch. The
     old code let the 1 Hz plan re-apply over the choice, which is why Cathedral /
     Cold Forge / Solar Disc read as dead buttons. */
  function setFollow(on, quiet) {
    follow = !!on;
    prefs.follow = follow; savePrefs();
    var cb = $id("rsFollow");
    if (cb) cb.checked = follow;
    var c = cymApi();
    try { if (c && c.setPrefs) c.setPrefs({ src: follow ? "session" : "manual" }); } catch (e) { }
    if (follow) syncVis(); else markScenes();
    if (!quiet) toast(follow ? "Following the tone" : "Manual — the scene stays put");
  }

  function buildVis() {
    screenEls.vis.innerHTML =
      '<div class="rs-pad"></div>' +
      '<section class="card rs-cta" id="rsCymCard" data-band="focus" data-art="chamber" aria-labelledby="rsCymH">' +
      '  <div class="rs-cta-top"><span class="rs-cta-art">' + svg("chamber", 26) + '</span>' +
      '    <div><h3 id="rsCymH">Cymatic chamber</h3>' +
      '    <p class="rs-cta-sub">Full visual experience</p></div></div>' +
      '  <button class="rs-btn rs-filled" id="rsChamber" style="width:100%">Open the chamber</button>' +
      '</section>' +
      '<section class="card rs-cta" data-band="relax" data-art="focus" aria-labelledby="rsFocusH">' +
      '  <div class="rs-cta-top"><span class="rs-cta-art">' + svg("moon", 26) + '</span>' +
      '    <div><h3 id="rsFocusH">Focus view</h3>' +
      '    <p class="rs-cta-sub">Gentle visuals</p></div></div>' +
      '  <button class="rs-btn rs-tonal" id="rsFocusGo" style="width:100%">Open focus view</button>' +
      '</section>' +
      '<section class="card" data-band="other" id="rsVizCard" data-art="ambient" aria-labelledby="rsVizH">' +
      '  <h3 id="rsVizH">Ambient panels</h3></section>' +
      '<div class="rs-pad"></div>';
    /* The Visualise screen keeps one clean key per experience. The chamber's own controls now
       live with the chamber (a Setup sheet inside it), so this section is title + door only. */
    var stash = doc.createElement("div");
    stash.id = "rsCymStash";
    stash.hidden = true;
    stash.innerHTML =
      '<div class="rs-cymctl" id="rsCymCtl">' +
      '  <label class="rs-sw"><span class="rs-swt">' +
      '    <b id="rsFollowH">Follow the tone</b></span>' +
      '    <input type="checkbox" id="rsFollow" checked><span class="rs-track" aria-hidden="true"></span></label>' +
      '  <div class="rs-map" id="rsMap" aria-live="polite">No session.</div>' +
      '  <div class="rs-chips" id="rsScenes" role="group" aria-label="Scenes"></div>' +
      '  <div class="rs-chips" id="rsMedia" role="group" aria-label="Medium"></div>' +
      '  <div class="rs-seg" id="rsVisToggles" role="group" aria-label="Layers">' +
      '    <button data-k="sand" aria-pressed="true">Sand</button>' +
      '    <button data-k="lines" aria-pressed="true">Lines</button>' +
      '    <button data-k="dust" aria-pressed="true">Dust</button></div>' +
      '</div>';
    doc.body.appendChild(stash);
  }

  function cymApi() {
    var c = window.ResonanceCymatics;
    return c && (c.api || c);
  }

  /* Which chip is lit: the plan's scene while the chamber follows the session, the
     chamber's own preset the moment a person has picked one. Reading the preset back
     from the page is what keeps the row honest after a reload or a session change. */
  function markScenes(plan) {
    var c = cymApi(), cur = "";
    try { if (c && c.getPrefs) cur = (c.getPrefs() || {}).preset || ""; } catch (e) { }
    $$("#rsScenes button").forEach(function (b) {
      var on = follow ? (!!plan && b.getAttribute("data-scene") === plan.scene)
                      : b.getAttribute("data-scene") === cur;
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function syncVis() {
    var map = $id("rsMap");
    if (!map) return;
    decorateSwatches();
    var shape = sessionShape();
    var plan = planFor(shape);
    markScenes(plan);
    if (!plan) { map.textContent = "No session."; return; }
    var mode = "—";
    var c = cymApi();
    try {
      if (c && c.debugState) {
        var s = c.debugState();
        if (s && s.nearest !== undefined) mode = s.nearest;
      }
    } catch (e) { }
    /* the chamber's own prefs are the truth once a person has picked a medium: the
       session plan only owns the look while Follow is on. Reading plan.medium here
       repainted the row back to the session's medium every tick, so every chip click
       looked dead while the plate underneath had actually changed. */
    var curMed = "";
    if (!follow && c) { try { curMed = (c.getPrefs() || {}).medium || ""; } catch (e) { } }
    var med = curMed || plan.medium;
    map.innerHTML = "carrier <b>" + shape.carrier.toFixed(0) + " Hz</b> · rate <b>" +
      shape.beat.toFixed(1) + " Hz</b> · " + plan.band + " on " + esc(med) + " · mode " + mode;
    $$("#rsMedia button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-medium") === med ? "true" : "false");
    });
  }

  function wireVis() {
    var fg = $id("rsFocusGo");
    if (fg) fg.addEventListener("click", openFocus);
    SCENES.forEach(function (s) {
      var b = doc.createElement("button");
      b.type = "button";
      b.textContent = s[1];
      b.setAttribute("data-scene", s[0]);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { applyVis({ scene: s[0] }); });
      $id("rsScenes").appendChild(b);
    });
    MEDIA.forEach(function (m) {
      var b = doc.createElement("button");
      b.type = "button";
      b.textContent = m[1];
      b.setAttribute("data-medium", m[0]);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { applyVis({ medium: m[0] }); });
      $id("rsMedia").appendChild(b);
    });
    $$("#rsVisToggles button").forEach(function (b) {
      b.addEventListener("click", function () {
        var on = b.getAttribute("aria-pressed") !== "true";
        b.setAttribute("aria-pressed", on ? "true" : "false");
        var o = {}; o[b.getAttribute("data-k")] = on; applyVis(o);
      });
    });
    $id("rsFollow").addEventListener("change", function () {
      setFollow(this.checked);
    });
    $id("rsChamber").addEventListener("click", openChamber);
    decorateSwatches();
  }

  function applyVis(o) {
    var c = cymApi(); if (!c) return;
    /* A scene or a medium chip is a manual decision: it must stop the look being
       re-derived from the session on the next tick, or the chip reads as dead. */
    var manual = !!(o.scene || o.medium);
    try {
      if (o.scene) c.scene(o.scene);
      var p = {};
      if (o.medium) p.medium = o.medium;
      ["sand", "lines", "dust"].forEach(function (k) { if (o[k] !== undefined) p[k] = o[k]; });
      if (manual) { follow = false; prefs.follow = false; savePrefs(); p.src = "manual"; }
      else if (follow) p.src = "session";
      c.setPrefs(p);
    } catch (e) { }
    var cb = $id("rsFollow");
    if (cb) cb.checked = follow;
    syncVis();
  }

  var cymHooked = false;
  var CYM_MQ = null;
  function cymNarrow() {
    if (!CYM_MQ) { try { CYM_MQ = window.matchMedia("(max-width: 820px)"); } catch (e) { } }
    return !!(CYM_MQ && CYM_MQ.matches);
  }
  function chamberChrome() {
    if (cymHooked) return;
    var root = doc.getElementById("cymRoot");
    if (!root) return;
    var act = root.querySelector(".cym-actions");
    if (!act) return;
    cymHooked = true;
    decorateChamberPalettes();
    /* The faceplate is placed by grid areas in the stylesheet, so these keys only have
       to exist and carry their own geometry: navigation on the top row, the transport
       on the row beneath it, one master fader between play and stop. */
    var back = doc.createElement("button");
    back.id = "rsCymBack";
    back.className = "cym-back";
    back.setAttribute("aria-label", "Back to Resonance Studio");
    back.onclick = function () { closeChamber(false); };
    act.insertBefore(back, act.firstChild);

    var playBtn = doc.getElementById("cymPlay");
    if (playBtn) playBtn.setAttribute("aria-label", "Play or pause the session");

    var stop = doc.createElement("button");
    stop.id = "rsCymStop";
    stop.textContent = "Stop";
    stop.setAttribute("aria-label", "Stop and rewind the session");
    stop.onclick = function () { pageStop(); pushState(true); };
    act.appendChild(stop);

    /* one master level: the same fader hardware as the hero and the mini player, and
       the same paintLevel() drives it, so a change here is already right everywhere */
    var vol = doc.createElement("label");
    vol.className = "rs-cym-vol";
    var range = doc.createElement("input");
    range.type = "range";
    range.id = "rsCymVol";
    range.min = "0"; range.max = "1"; range.step = "0.01";
    range.value = String(masterNow());
    range.setAttribute("aria-label", "Volume");
    range.addEventListener("input", function () { setMaster(parseFloat(this.value)); });
    vol.appendChild(range);
    act.appendChild(vol);

    var slower = doc.createElement("button");
    slower.className = "cym-tempo"; slower.textContent = "\u2212";
    slower.setAttribute("aria-label", "Slower tone");
    slower.onclick = function () { applyTempo(tempo - 0.1); };
    var faster = doc.createElement("button");
    faster.className = "cym-tempo"; faster.textContent = "+";
    faster.setAttribute("aria-label", "Faster tone");
    faster.onclick = function () { applyTempo(tempo + 0.1); };

    /* ? : the gesture hints, hidden but findable */
    var info = doc.createElement("button");
    info.id = "rsCymInfo";
    info.textContent = "?";
    info.setAttribute("aria-label", "Gestures");
    info.setAttribute("aria-expanded", "false");
    var pop = doc.createElement("div");
    pop.className = "rs-cym-info";
    pop.innerHTML = "<b>Gestures</b>Drag to orbit \u00b7 two fingers or wheel to zoom<br>" +
      "Double-tap to reset the camera<br>Tap the plate to disturb the sand";
    info.onclick = function (e) {
      e.stopPropagation();
      var on = !pop.classList.contains("on");
      pop.classList.toggle("on", on);
      info.setAttribute("aria-expanded", on ? "true" : "false");
    };
    root.appendChild(pop);
    var lbl = doc.createElement("span");
    lbl.id = "rsCymTempo";
    lbl.style.cssText = "font-size:12px;opacity:.75;min-width:38px;text-align:center";
    lbl.textContent = tempo.toFixed(2) + "\u00d7";
    lbl.title = "tap to reset to 1x";
    lbl.onclick = function () { applyTempo(1); };
    var leftPanel = root.querySelector(".cym-left");
    if (leftPanel) {
      var row = doc.createElement("div");
      row.className = "rs-cym-tempo";
      row.innerHTML = "<span>Tone tempo</span>";
      row.appendChild(slower); row.appendChild(lbl); row.appendChild(faster);
      leftPanel.insertBefore(row, leftPanel.firstChild);
    }
    act.insertBefore(info, act.querySelector("#cymClose"));

    /* The chamber's own controls travel with it: a Setup sheet docked above the transport,
       holding the follow switch, the mapping readout, the scene and medium chips and the
       layer keys. The Visualise card keeps one door and nothing else. */
    var setup = doc.createElement("button");
    setup.id = "rsCymSetup";
    setup.className = "cym-setup";
    setup.setAttribute("aria-label", "Chamber setup");
    setup.setAttribute("aria-expanded", "false");
    var setupSheet = doc.createElement("div");
    setupSheet.className = "rs-cym-setup";
    setupSheet.id = "rsCymPanel";
    var setupCtl = doc.getElementById("rsCymCtl");
    if (setupCtl) setupSheet.appendChild(setupCtl);
    root.appendChild(setupSheet);
    function closeSetup() {
      var live = doc.getElementById("rsCymPanel");
      if (live) live.classList.remove("on");
      var btn = doc.getElementById("rsCymSetup");
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
    var setupGrab = doc.createElement("button");
    setupGrab.id = "rsCymSetupGrab";
    setupGrab.className = "rs-cym-setupGrab";
    setupGrab.setAttribute("aria-label", "Hide the chamber setup");
    setupGrab.innerHTML = "<span></span>";
    setupGrab.style.cssText = "display:block;width:100%;height:28px;min-height:28px;margin:0 0 6px;padding:0;border:0;background:transparent;";
    setupSheet.insertBefore(setupGrab, setupSheet.firstChild);
    var gd = { y0: 0, on: false };
    setupGrab.addEventListener("pointerdown", function (e) {
      gd.y0 = e.clientY; gd.on = true;
      try { setupGrab.setPointerCapture(e.pointerId); } catch (err) { }
    });
    setupGrab.addEventListener("pointermove", function (e) {
      if (gd.on && e.clientY - gd.y0 > 26) { gd.on = false; closeSetup(); }
    });
    setupGrab.addEventListener("pointerup", function () { gd.on = false; });
    setupGrab.addEventListener("click", function (e) { e.stopPropagation(); closeSetup(); });
    setup.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var live = doc.getElementById("rsCymPanel") || setupSheet;
      var on = !live.classList.contains("on");
      live.classList.toggle("on", on);
      var btn = doc.getElementById("rsCymSetup") || setup;
      btn.setAttribute("aria-expanded", on ? "true" : "false");
    };
    act.insertBefore(setup, info);

    /* Two rows of hardware. Navigation (back / status / help / close) on the first,
       the transport (play, stop, fader, Controls) on the second; on a wide glass the
       two groups sit on one line with the transport at the right edge. */
    var nav = doc.createElement("div"), tr = doc.createElement("div");
    nav.className = "rs-cym-nav"; tr.className = "rs-cym-tr";
    var live = act.querySelector(".cym-live");
    var ctl = act.querySelector("#cymCtl");
    /* Back owns leaving the chamber, so the page's Close button is redundant here:
       two keys doing one job is one key too many. It stays in the page for desktop. */
    var close = act.querySelector("#cymClose");
    if (close && close.parentNode) close.parentNode.removeChild(close);
    close = null;
    var liveBox = doc.createElement("span");
    liveBox.className = "cym-nav-live";
    nav.appendChild(back);
    if (live) { liveBox.appendChild(live); nav.appendChild(liveBox); }
    nav.appendChild(info);
    if (close) nav.appendChild(close);
    if (playBtn) tr.appendChild(playBtn);
    tr.appendChild(stop);
    tr.appendChild(vol);
    if (ctl) tr.appendChild(ctl);
    act.appendChild(nav);
    act.appendChild(tr);

    /* The lower panel becomes a drawer with a handle: drag it down to put it away,
       drag it up to bring it back, or tap it. Wide screens keep the side rail. */
    var setSheet = null;
    var sheet = root.querySelector(".cym-left");
    if (sheet) {
      sheet.classList.add("rs-cym-sheet");
      var grab = doc.createElement("div");
      grab.className = "rs-cym-grab";
      grab.setAttribute("role", "button");
      grab.setAttribute("tabindex", "0");
      grab.setAttribute("aria-label", "Show tone tempo and scenes");
      grab.innerHTML = "<i></i><b>Tone tempo &amp; scenes</b><em>▾</em>";
      sheet.insertBefore(grab, sheet.firstChild);
      setSheet = function (on) {
        sheet.classList.toggle("open", on);
        grab.setAttribute("aria-expanded", on ? "true" : "false");
        grab.setAttribute("aria-label", on ? "Hide tone tempo and scenes" : "Show tone tempo and scenes");
        var em = grab.querySelector("em");
        if (em) em.textContent = on ? "▾" : "▴";
        var sc = doc.getElementById("cymScrim");
        if (sc) sc.classList.toggle("on", on);
      };
      setSheet(sheet.classList.contains("open"));
      var isPhone = cymNarrow;
      var drag = null;
      grab.addEventListener("pointerdown", function (e) {
        if (!isPhone()) return;
        drag = { id: e.pointerId, y: e.clientY, dy: 0, raw: 0 };
        try { grab.setPointerCapture(e.pointerId); } catch (err) { }
        sheet.classList.add("rs-dragging");
        e.preventDefault();
      });
      grab.addEventListener("pointermove", function (e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag.raw = e.clientY - drag.y;
        drag.dy = Math.max(-24, drag.raw);
        sheet.style.transform = sheet.classList.contains("open")
          ? "translateY(" + Math.max(0, drag.dy) + "px)"
          : "translateY(calc(100% - 54px + " + Math.min(0, drag.dy) + "px))";
      });
      var endDrag = function () {
        if (!drag) return;
        var dy = drag.raw, open = sheet.classList.contains("open");
        drag = null;
        sheet.classList.remove("rs-dragging");
        sheet.style.transform = "";
        if (Math.abs(dy) < 6) setSheet(!open);
        else if (open) setSheet(!(dy > 56));
        else setSheet(dy < -26);
      };
      grab.addEventListener("pointerup", endDrag);
      grab.addEventListener("pointercancel", endDrag);
      grab.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          setSheet(!sheet.classList.contains("open"));
        }
      });
    }

    /* The top player panel gets the same gesture from its lip: slide up to put the
       player away, slide down to bring it back, tap to toggle. */
    var topbar = root.querySelector(".cym-top");
    if (topbar) {
      var lip = doc.createElement("div");
      lip.className = "rs-cym-lip";
      lip.setAttribute("role", "button");
      lip.setAttribute("tabindex", "0");
      lip.setAttribute("aria-label", "Player controls");
      lip.innerHTML = "<i></i><em>▴</em>";
      topbar.appendChild(lip);
      var setTop = function (on) {
        topbar.classList.toggle("rs-cym-hid", !on);
        lip.setAttribute("aria-expanded", on ? "true" : "false");
        var em = lip.querySelector("em");
        if (em) em.textContent = on ? "▴" : "▾";
      };
      setTop(true);
      var isPhoneT = cymNarrow;
      var tdrag = null;
      lip.addEventListener("pointerdown", function (e) {
        if (!isPhoneT()) return;
        tdrag = { id: e.pointerId, y: e.clientY, dy: 0, raw: 0 };
        try { lip.setPointerCapture(e.pointerId); } catch (err) { }
        topbar.classList.add("rs-dragging");
        e.preventDefault();
      });
      lip.addEventListener("pointermove", function (e) {
        if (!tdrag || e.pointerId !== tdrag.id) return;
        tdrag.raw = e.clientY - tdrag.y;
        tdrag.dy = Math.max(-24, Math.min(140, tdrag.raw));
        var shown = !topbar.classList.contains("rs-cym-hid");
        topbar.style.transform = shown
          ? "translateY(" + Math.min(0, tdrag.dy) + "px)"
          : "translateY(calc(var(--rs-safe-t,0px) - 100% + " + Math.max(0, tdrag.dy) + "px))";
      });
      var endDragTop = function () {
        if (!tdrag) return;
        var dy = tdrag.raw, shown = !topbar.classList.contains("rs-cym-hid");
        tdrag = null;
        topbar.classList.remove("rs-dragging");
        topbar.style.transform = "";
        if (Math.abs(dy) < 6) setTop(!shown);
        else if (shown) setTop(!(dy < -24));
        else setTop(dy > 24);
      };
      lip.addEventListener("pointerup", endDragTop);
      lip.addEventListener("pointercancel", endDragTop);
      lip.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          setTop(topbar.classList.contains("rs-cym-hid"));
        }
      });

      /* Quiet chrome: eight seconds without a touch puts the player and the drawer
         away together, so the plate is the whole screen. Any touch brings the player
         back (the drawer only when its handle is used, so a stray tap on the glass
         cannot spring a panel over the instrument). */
      var idleT = null;
      var armIdle = function () {
        window.clearTimeout(idleT);
        if (!isPhoneT()) return;
        idleT = window.setTimeout(function () {
          if (!doc.documentElement.classList.contains("cym-open")) return;   /* chamber gone: stop */
          if (doc.hidden) { armIdle(); return; }                              /* backgrounded: wait */
          setTop(false);
          if (setSheet) setSheet(false);
        }, 8000);
      };
      root.addEventListener("pointerdown", function (e) {
        var t = e.target;
        var onHandle = t && t.closest && t.closest(".rs-cym-lip,.rs-cym-grab");
        if (!onHandle && topbar.classList.contains("rs-cym-hid")) setTop(true);
        armIdle();
      }, true);
      root.addEventListener("keydown", armIdle, true);
      armIdle();
    }
  }

  /* Tempo scales every binaural/iso entry's beat rate. The untouched beat is kept on the
     entry (`__b0`) so repeated steps compound from the original, not from the last step.
     Tempo is a listening preference, so it survives a session change: a new schedule is
     picked up by tempoGuard and the stored tempo re-applied to it. */
  var tempo = Math.max(0.5, Math.min(2, Number(prefs.tempo) || 1));
  var tempoOn = null;
  function applyTempo(next, quiet) {
    var a = api(), st = pState();
    if (!a || !st) return;
    tempo = Math.max(0.5, Math.min(2, Math.round(next * 100) / 100));
    tempoOn = st.schedule;
    prefs.tempo = tempo; savePrefs();
    (st.schedule.voices || []).forEach(function (v) {
      if (v.type !== 0 && v.type !== 3 && v.type !== 4) return;
      (v.entries || []).forEach(function (e) {
        if (e.__b0 === undefined) e.__b0 = e.beat || 0;
        e.beat = Math.round(e.__b0 * tempo * 10000) / 10000;
      });
    });
    try { a.rebuildEngine(); a.syncToWorklet(); if (a.refresh) a.refresh(); } catch (e) { }
    var lbl = $id("rsCymTempo");
    if (lbl) lbl.textContent = tempo.toFixed(2) + "\u00d7";
    if (!quiet) toast("Tone " + tempo.toFixed(2) + "\u00d7");
    syncVis();
  }

  /* a new session arrived: bring the stored tempo onto it once (see applyTempo) */
  function tempoGuard() {
    var st = pState();
    if (!st || !st.schedule || st.schedule === tempoOn) return;
    if (tempo === 1) { tempoOn = st.schedule; return; }
    applyTempo(tempo, true);
  }

  var CYM = { back: false };
  function closeChamber(fromPop) {
    if (fromPop) CYM.back = false;          /* the history entry is already consumed */
    try { if (window.ResonanceCymatics) window.ResonanceCymatics.close(); } catch (e) { }
  }

  /* The chamber closes from its own button, Esc or the shell's Back; whichever happens, the
     history entry it took has to come off the stack, or the next Back leaves the app. */
  function watchChamber() {
    if (!CYM.back) return;
    if (!doc.documentElement.classList.contains("cym-open")) {
      CYM.back = false;
      unmarkBackTop();
      return;
    }
    window.setTimeout(watchChamber, 300);
  }

  function openChamber() {
    var c = window.ResonanceCymatics;
    if (!c) { toast("The chamber is still starting — try again."); return; }
    var plan = planFor(sessionShape());
    try {
      /* Only a following chamber takes the plan's scene; a scene a person picked is
         theirs, and opening the chamber must not overwrite it. */
      if (follow && plan && c.api && c.api.scene) c.api.scene(plan.scene);
      if (c.api && c.api.setPrefs) c.api.setPrefs({ src: follow ? "session" : "manual" });
    } catch (e) { }
    c.open();
    if (!CYM.back) { CYM.back = true; markBack(); window.setTimeout(watchChamber, 400); }
    window.setTimeout(chamberChrome, 60);
    /* the page focused its own Close on open; that key is gone, so Back takes the focus */
    window.setTimeout(function () {
      var b = doc.getElementById("rsCymBack");
      if (b && b.focus) { try { b.focus({ preventScroll: true }); } catch (e) { } }
    }, 120);
  }

  /* =============================================================== settings === */

  function buildSettings() {
    screenEls.settings.innerHTML =
      '<div class="rs-pad"></div>' +
      '<section class="card" data-band="wake" aria-labelledby="rsApprH">' +
      '  <h3 id="rsApprH">Appearance</h3>' +
      '  <div class="rs-seg" id="rsUi" role="group" aria-label="Interface">' +
      '    <button data-u="full" aria-pressed="true">Full</button><button data-u="minimal" aria-pressed="false">Minimal</button></div>' +
      '  <div class="rs-swatches" id="rsAccents" role="group" aria-label="Theme colour"></div>' +
      '  <label class="rs-sw"><span class="rs-swt"><b>Accent from wallpaper</b>' +
      '    <span>Android 12 and later. Off uses the Resonance teal.</span></span>' +
      '    <input type="checkbox" id="rsAccent"><span class="rs-track" aria-hidden="true"></span></label>' +
      '  <button class="rs-mrow" data-act="focus">' + svg("moon", 22) +
      '    <span class="rs-mtxt"><b>Focus view</b><span id="rsFocusSub">An ambient screen, gently following the tone</span></span>' + svg("chev", 18) + '</button>' +
      '</section>' +
      '<section class="card" data-band="other" aria-labelledby="rsHelpH">' +
      '  <h3 id="rsHelpH">Help &amp; about</h3>' +
      '  <button class="rs-mrow" data-act="guide">' + svg("book", 22) +
      '    <span class="rs-mtxt"><b>Quick guide</b><span>How to use all of this</span></span>' + svg("chev", 18) + '</button>' +
      '  <button class="rs-mrow" id="rsTourRow" data-act="tour">' +
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ' +
      '      stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>' +
      '    <span class="rs-mtxt"><b>Replay the welcome tour</b><span>The bubble guide, from the start</span></span>' + svg("chev", 18) + '</button>' +
      '  <button class="rs-mrow" data-act="check">' + svg("shield", 22) +
      '    <span class="rs-mtxt"><b>Check device</b><span>What this phone reports</span></span>' + svg("chev", 18) + '</button>' +
      '  <button class="rs-mrow" data-act="about">' + svg("info", 22) +
      '    <span class="rs-mtxt"><b>About Resonance Studio</b><span>Version and licences</span></span>' + svg("chev", 18) + '</button>' +
      '  <button class="rs-mrow" data-act="upd">' + svg("down", 22) +
      '    <span class="rs-mtxt"><b>Check for updates</b><span>Asks moddys.net</span></span>' + svg("chev", 18) + '</button>' +
      '</section>' +
      '<section class="card" data-band="relax" aria-labelledby="rsDataH">' +
      '  <h3 id="rsDataH">Data</h3>' +
      '  <div class="rs-kv"><b>Saved files</b><span>Downloads/Resonance Studio</span></div>' +
      '  <div class="rs-kv"><b>Network</b><span>update check + help pages</span></div>' +
      '  <div class="rs-kv"><b>Version</b><span id="rsVer">—</span></div>' +
      '</section>' +
      '<div class="rs-pad"></div>';
  }

  function wireSettings() {
    $$("#rsUi button").forEach(function (b) {
      b.addEventListener("click", function () {
        prefs.ui = b.getAttribute("data-u"); savePrefs(); applyUi();
      });
    });
    applyUi();
    var ACCENTS = [["calm", "#4FB3A2", "Calm"], ["dusk", "#6B72B8", "Dusk"], ["sage", "#5E936F", "Sage"],
                   ["sand", "#B0894A", "Sand"], ["slate", "#6E8B99", "Slate"]];
    var sw = $id("rsAccents");
    ACCENTS.forEach(function (a) {
      var b = doc.createElement("button");
      b.className = "rs-swatch";
      b.type = "button";
      b.style.setProperty("--sw", a[1]);
      b.setAttribute("data-accent", a[0]);
      b.setAttribute("aria-label", a[2] + " theme");
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        prefs.theme2 = a[0]; savePrefs(); applyTheme(); paintAccents();
      });
      sw.appendChild(b);
    });
    function paintAccents() {
      var cur = prefs.theme2 || "calm";
      $$("#rsAccents .rs-swatch").forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-accent") === cur ? "true" : "false");
      });
    }
    paintAccents();

    var acc = $id("rsAccent");
    acc.checked = prefs.accent === "system";
    acc.addEventListener("change", function () {
      prefs.accent = this.checked ? "system" : "brand"; savePrefs(); applyTheme();
      try { var pa = $id("rsAccents"); if (pa) pa.style.display = this.checked ? "none" : "flex"; } catch (e) { }
    });
    var fo = $id("rsFocus");
    if (fo) {
      fo.checked = doc.body.classList.contains("focus");
      fo.addEventListener("change", function () { openFocus(); });
    }
    screenEls.settings.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-act]");
      if (!b) return;
      var a = b.getAttribute("data-act");
      if (a === "guide") openGuide();
      else if (a === "check") openCheck();
      else if (a === "about") openAbout();
      else if (a === "tour") tourStart();
      else if (a === "focus") openFocus();
      else if (a === "upd") askUpdate();
    });
  }

  /* ================================================================ overflow === */

  var ROWS = [
    ["guide", "Quick guide", "How to use all of this", "book"],
    ["check", "Check device", "What this phone reports", "shield"],
    ["about", "About Resonance Studio", "Version and licences", "info"],
    ["upd", "Check for updates", "Asks moddys.net", "down"]
  ];

  var sheetEl = null;
  var SHEET = { open: false };

  function buildSheet() {
    sheetEl = doc.createElement("div");
    sheetEl.id = "rsSheet";
    sheetEl.setAttribute("role", "dialog");
    sheetEl.setAttribute("aria-label", "More");
    var html = '<div class="rs-grab" id="rsGrab"><i></i></div>' +
      '<div class="rs-shead"><b>More</b></div><div class="rs-sbody">';
    ROWS.forEach(function (r) {
      html += '<button class="rs-mrow" data-act="' + r[0] + '">' + svg(r[3], 22) +
        '<span class="rs-mtxt"><b>' + r[1] + '</b><span>' + r[2] + '</span></span>' + svg("chev", 18) + '</button>';
    });
    html += '</div>';
    sheetEl.innerHTML = html;
    var scrim = doc.createElement("div");
    scrim.id = "rsScrim";
    doc.body.appendChild(scrim);
    scrim.addEventListener("click", function () {
      if (!SHEET.open) return;
      setOpen(false);
      unmarkBackTop();
    });
    doc.body.appendChild(sheetEl);

    var y = 0, dragging = false, startY = 0, startOff = 0;
    function height() { return sheetEl.offsetHeight || Math.round(window.innerHeight * 0.6); }
    /* a tablet lifts the sheet off the bottom edge, so "closed" has to travel that much
       further or a strip of it stays over the nav bar. Read the offset back from the
       element rather than from the variable: a boot-time read can land before the
       stylesheet's media query applies. */
    function closedOffset() {
      var b = parseFloat(getComputedStyle(sheetEl).bottom);
      return height() + (isNaN(b) ? 0 : b);
    }
    function apply(off, animate) {
      sheetEl.classList.toggle("rs-drag", animate === false);
      sheetEl.style.transform = "translateY(" + off + "px)";
      y = off;
    }
    function setOpen(open) {
      SHEET.open = !!open;
      sheetEl.classList.toggle("rs-open", SHEET.open);
      doc.documentElement.classList.toggle("rs-sheet", SHEET.open);
      apply(SHEET.open ? 0 : closedOffset(), true);
      doc.documentElement.classList.toggle("rs-locked", SHEET.open);
      var ov = $id("rsOverflow");
      if (ov) ov.setAttribute("aria-expanded", SHEET.open ? "true" : "false");
      if (SHEET.open) markBack();
    }
    openSheet = function (open) { if (!open && !SHEET.open) return; setOpen(open); };
    function park() { if (!SHEET.open) apply(closedOffset(), false); }
    if (window.requestAnimationFrame) requestAnimationFrame(park);
    window.addEventListener("resize", park);

    function down(ev) {
      if (ev.isPrimary === false) return;
      dragging = true; startY = ev.clientY; startOff = y;
      sheetEl.classList.add("rs-drag");
    }
    function move(ev) {
      if (!dragging) return;
      var next = Math.min(closedOffset(), Math.max(0, startOff + (ev.clientY - startY)));
      apply(next, false);
      ev.preventDefault();
    }
    function up(ev) {
      if (!dragging) return;
      dragging = false;
      sheetEl.classList.remove("rs-drag");
      var dy = ev.clientY - startY;
      var wasOpen = SHEET.open;
      if (Math.abs(dy) < 20) { setOpen(false); }
      else setOpen(dy < 0);
      if (wasOpen && !SHEET.open) unmarkBackTop();
    }
    sheetEl.querySelector("#rsGrab").addEventListener("pointerdown", down, { passive: true });
    doc.addEventListener("pointermove", move, { passive: false });
    doc.addEventListener("pointerup", up, { passive: true });
    doc.addEventListener("pointercancel", up, { passive: true });

    sheetEl.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-act]");
      if (!b) return;
      var a = b.getAttribute("data-act");
      var wasOpen = SHEET.open;
      setOpen(false);
      /* A row that opens an overlay inherits this sheet's history entry. Popping it here and
         pushing a fresh one in showOverlay() races the deferred popstate: that event then
         arrives with the new overlay on top and closes it, so the row looked dead. The
         inherited entry is what Back (or the overlay's own close) pops afterwards. */
      var handsOver = (a === "guide" || a === "check" || a === "about");
      if (wasOpen && !handsOver) unmarkBackTop();
      if (a === "guide") openGuide(wasOpen);
      else if (a === "check") openCheck(wasOpen);
      else if (a === "about") openAbout(wasOpen);
      else if (a === "upd") askUpdate();
    });
    apply(height(), true);
  }
  var openSheet = function () { };

  /* ================================================================ overlays === */

  var overlays = [];

  function overlayCss() {
    injectCss([
      ".rs-ov{position:fixed;top:0;right:0;bottom:0;left:0;z-index:95;display:none;flex-direction:column;",
      "  background:var(--rs-bg);color:var(--rs-ink);font:15px/1.55 inherit}",
      ".rs-ov.rs-ov-on{display:flex}",
      /* the fullscreen layer (100) is above a normal overlay, so an overlay opened
         from inside it has to climb over it */
      "html.rs-fs .rs-ov{z-index:110}",
      ".rs-ov .rs-ov-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;",
      "  padding:calc(8px + " + SAFE_T + ") 10px 8px 18px;border-bottom:1px solid var(--rs-line)}",
      ".rs-ov .rs-ov-head b{flex:1 1 auto;font-size:18px}",
      ".rs-ov .rs-ov-body{flex:1 1 auto;overflow-y:auto;padding:16px 18px calc(28px + " + SAFE_B + ")}",
      ".rs-ov h4{margin:26px 0 8px;padding-top:14px;border-top:1px solid var(--rs-line);",
      "  font-size:16px;font-weight:700;letter-spacing:0;text-transform:none;color:var(--rs-ink)}",
      ".rs-ov h4:first-child{margin-top:0;padding-top:0;border-top:0}",
      ".rs-ov p{margin:0 0 10px;color:var(--rs-dim)}",
      ".rs-ov p b,.rs-ov li b{color:var(--rs-ink)}",
      ".rs-ov ul{margin:0 0 10px;padding-left:18px;color:var(--rs-dim)}",
      ".rs-ov .rs-report{font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;",
      "  background:var(--rs-s1);border:1px solid var(--rs-line);border-radius:var(--rs-r-sm);padding:12px;",
      "  margin:8px 0;color:var(--rs-dim)}",
      ".rs-ov .rs-crow{display:flex;gap:10px;align-items:baseline;padding:11px 12px;font-size:13px;",
      "  border-bottom:1px solid var(--rs-line)}",
      ".rs-ov .rs-crow:last-child{border-bottom:0}",
      ".rs-ov .rs-crow b{flex:0 0 auto;min-width:112px}",
      ".rs-ov .rs-crow span{color:var(--rs-dim)}",
      ".rs-ov .rs-crow i{font-style:normal;font-weight:800}",
      ".rs-ov .rs-crow.ok i{color:var(--rs-good)}",
      ".rs-ov .rs-crow.warn i{color:var(--rs-bad)}",
      ".rs-ov button.rs-cta{width:100%;min-height:48px;border-radius:var(--rs-r-sm);margin:8px 0;",
      "  border:1px solid var(--rs-pri);background:transparent;color:var(--rs-pri);",
      "  font:600 15px/1 var(--rs-sans);cursor:pointer}",
      ".rs-ov a{color:var(--rs-pri)}"
    ].join("\n"), "rsOvCss");
  }

  function buildOverlay(id, title, bodyHtml) {
    overlayCss();
    var ov = doc.createElement("div");
    ov.className = "rs-ov";
    ov.id = id;
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", title);
    ov.innerHTML =
      '<div class="rs-ov-head"><b>' + title + '</b>' +
      '<button class="rs-ico" data-ov-x="' + id + '" aria-label="Close">' + svg("close") + '</button></div>' +
      '<div class="rs-ov-body">' + bodyHtml + '</div>';
    ov.setAttribute("aria-modal", "true");
    doc.body.appendChild(ov);
    ov.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-ov-x]")) closeOverlay(ov);
    });
    overlays.push(ov);
    return ov;
  }

  function showOverlay(ov, keepBack) {
    ov.classList.add("rs-ov-on");
    doc.documentElement.classList.add("rs-locked");
    /* inside fullscreen the layer is already on the history stack; pushing again
       would make closing the overlay pop the whole view away */
    if (!FS.on && !keepBack) markBack();
    /* reopening a panel starts at its top, and focus comes back to whatever opened it */
    var body = ov.querySelector(".rs-ov-body");
    if (body) body.scrollTop = 0;
    var from = doc.activeElement;
    ov.__back = (from && from !== doc.body && !ov.contains(from)) ? from : null;
    var x = ov.querySelector("[data-ov-x]");
    if (x) { try { x.focus(); } catch (e) { } }
  }
  function closeOverlay(ov, fromPop) {
    ov.classList.remove("rs-ov-on");
    doc.documentElement.classList.toggle("rs-locked", anyOverlayOpen());
    if (!fromPop && !FS.on) unmarkBackTop();
    /* return focus to the opener; a row in the now-closed More sheet hands it to the
       button that opened the sheet instead of leaving focus on something off-screen */
    var back = ov.__back;
    ov.__back = null;
    if (back && (!back.closest || !back.closest("#rsSheet") || SHEET.open)) {
      try { back.focus({ preventScroll: true }); } catch (e) { }
    } else if (back) {
      var bar = $id("rsOverflow");
      if (bar) { try { bar.focus({ preventScroll: true }); } catch (e) { } }
    }
  }
  function anyOverlayOpen() {
    for (var i = 0; i < overlays.length; i++) if (overlays[i].classList.contains("rs-ov-on")) return true;
    return FS.on;
  }

  var backStack = 0;
  function markBack() {
    try { history.pushState({ rsLayer: ++backStack }, ""); } catch (e) { }
  }
  /* What Android's Back button asks before it finishes the activity: true means the shell
     had a layer to close. It walks the same history entry the system Back would, so the
     popstate handler stays the only place that closes a layer. */
  function shellBack() {
    if (scenePopOpen()) { closeScenePop(); return true; }
    if (history.state && history.state.rsLayer) {
      try { history.back(); return true; } catch (e) { }
    }
    if (TOUR.on) { tourEnd(false); return true; }
    if (SHEET.open) { openSheet(false); return true; }
    for (var i = overlays.length - 1; i >= 0; i--) {
      if (overlays[i].classList.contains("rs-ov-on")) { closeOverlay(overlays[i]); return true; }
    }
    if (doc.documentElement.classList.contains("cym-open")) { closeChamber(true); return true; }
    if (FS.on) { exitFullscreen(true); return true; }
    return false;
  }
  function unmarkBackTop() {
    if (history.state && history.state.rsLayer) { try { history.back(); } catch (e) { } }
  }
  window.addEventListener("popstate", function () {
    if (TOUR.on) { tourEnd(false); return; }
    if (SHEET.open) { openSheet(false); return; }
    var top = null;
    for (var i = overlays.length - 1; i >= 0; i--) {
      if (overlays[i].classList.contains("rs-ov-on")) { top = overlays[i]; break; }
    }
    if (top) { closeOverlay(top, true); return; }
    if (doc.documentElement.classList.contains("cym-open")) { closeChamber(true); return; }
    if (FS.on) { exitFullscreen(true); return; }
  });

  /* ============================================================ welcome tour === */
  /* A coach-mark tour in the Material sense: one bubble, a spotlight on the thing it is
     talking about, and the tour itself moves between sections. It runs once on first
     launch, ends on the tick or Skip, and can be replayed from Settings. */

  var TOUR = { on: false, i: 0, gen: 0, el: null, hole: null, bub: null, steps: [], timer: 0 };

  var TOUR_TICK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  function tourCss() {
    injectCss([
      "#rsTour{position:fixed;top:0;right:0;bottom:0;left:0;z-index:118;display:none}",
      "#rsTour.rs-t-on{display:block}",
      "#rsTour .rs-t-hole{position:absolute;top:0;left:0;width:0;height:0;border-radius:16px;",
      "  background:transparent;box-shadow:0 0 0 9999px rgba(7,6,5,.68);",
      "  transition:transform .34s cubic-bezier(.2,.8,.2,1),width .34s cubic-bezier(.2,.8,.2,1),height .34s cubic-bezier(.2,.8,.2,1)}",
      "#rsTour .rs-t-ring{position:absolute;top:0;left:0;width:0;height:0;border-radius:16px;",
      "  border:1.5px solid var(--rs-pri);pointer-events:none;",
      "  transition:transform .34s cubic-bezier(.2,.8,.2,1),width .34s cubic-bezier(.2,.8,.2,1),height .34s cubic-bezier(.2,.8,.2,1)}",
      "#rsTour .rs-t-bub{position:absolute;top:0;left:0;box-sizing:border-box;",
      "  width:min(340px,calc(100vw - 28px));background:var(--rs-s2);border:1px solid var(--rs-line2);",
      "  border-radius:18px;padding:14px 16px 12px;color:var(--rs-ink);",
      "  font-family:var(--rs-sans);font-size:14px;line-height:1.5;",
      "  box-shadow:0 18px 44px rgba(0,0,0,.55);opacity:0;",
      "  transition:transform .34s cubic-bezier(.2,.8,.2,1),opacity .16s linear}",
      "#rsTour .rs-t-bub.rs-t-show{opacity:1}",
      "#rsTour .rs-t-step{display:block;font-size:11px;line-height:1.4;letter-spacing:.09em;",
      "  text-transform:uppercase;color:var(--rs-dim)}",
      "#rsTour .rs-t-t{display:block;margin:2px 30px 4px 0;font-size:17px;line-height:1.3;font-weight:700}",
      "#rsTour .rs-t-b{margin:0 0 12px;color:var(--rs-dim)}",
      "#rsTour .rs-t-foot{display:flex;align-items:center;gap:8px}",
      "#rsTour .rs-t-skip{margin-right:auto;background:none;border:0;color:var(--rs-dim);",
      "  font-family:var(--rs-sans);font-size:14px;font-weight:600;padding:0 4px;min-height:44px;cursor:pointer}",
      "#rsTour .rs-t-back{background:none;border:1px solid var(--rs-line2);color:var(--rs-ink);",
      "  border-radius:12px;padding:0 14px;min-height:44px;font-family:var(--rs-sans);",
      "  font-size:14px;font-weight:600;cursor:pointer}",
      "#rsTour .rs-t-next{background:var(--rs-pri);border:1px solid var(--rs-pri);color:var(--rs-on-pri);",
      "  border-radius:12px;padding:0 16px;min-height:44px;font-family:var(--rs-sans);",
      "  font-size:14px;font-weight:700;cursor:pointer}",
      "#rsTour .rs-t-x{position:absolute;top:5px;right:5px;width:44px;height:44px;display:grid;",
      "  place-items:center;border:0;background:none;color:var(--rs-dim);border-radius:50%;cursor:pointer}",
      "#rsTour .rs-t-x svg{width:20px;height:20px}",
      "#rsTour .rs-t-caret{position:absolute;width:14px;height:14px;background:var(--rs-s2);",
      "  transform:rotate(45deg);display:none}",
      "#rsTour .rs-t-caret.rs-t-top{display:block;top:-8px;border-top:1px solid var(--rs-line2);border-left:1px solid var(--rs-line2)}",
      "#rsTour .rs-t-caret.rs-t-bottom{display:block;bottom:-8px;border-bottom:1px solid var(--rs-line2);border-right:1px solid var(--rs-line2)}",
      "#rsTour.rs-t-first .rs-t-hole,#rsTour.rs-t-first .rs-t-bub{transition:none}",
      "@media (prefers-reduced-motion: reduce){#rsTour .rs-t-hole,#rsTour.rs-t-first .rs-t-ring,",
      "  #rsTour .rs-t-ring,#rsTour .rs-t-bub{transition:none}}"
    ].join("\n"), "rsTourCss");
  }

  function tourSteps() {
    return [
      { sel: null, title: "Welcome to " + APP_NAME,
        body: "A short look at where everything lives — the player, the library, the engine room " +
              "and the visuals. Move with Next; the tick leaves at any time." },
      { nav: "home", sel: "#rsNav", title: "Five places",
        body: "Home, Sessions, Studio, Visualise and Settings. The bar tucks itself away while " +
              "you listen; touch anywhere to bring it back." },
      { nav: "home", sel: ".rs-hero", title: "The player",
        body: "Play, volume, loop and the clock. A session keeps running while you move between " +
              "screens, and the mini player follows you." },
      { nav: "home", sel: "#rsStates", title: "Eight sessions",
        body: "Deep sleep through Morning. One tap loads the session and starts it — the pulse " +
              "bands tell you what each one is aiming at." },
      { nav: "studio", sel: "#rsMix", title: "The mix",
        body: "Every layer is one sound: its pitch, its beat and its level. Tap a layer to tune " +
              "it, or Add a sound to stack another. The transport at the top plays the whole stack." },
      { nav: "sessions", sel: "#rsModules", title: "The whole library",
        body: "Search it or filter by band, then tap a row to load it. Quick picks are in " +
              "Studio's Add a sound, beside the mix." },
      { nav: "studio", sel: "#rsAdvDet", title: "The raw schedule",
        body: "Each voice's entries and the live meters sit here, folded away until you want " +
              "that control. Nothing in this app is hidden, only put down." },
      { nav: "viz", sel: "#rsChamber", title: "See the tone",
        body: "The chamber draws the figure the session actually drives. Focus view beside it " +
              "is the gentle one for leaving on." },
      { nav: "settings", sel: "#rsTourRow", title: "That's the tour",
        body: "Replay it from here whenever you like, and switch between the Full and Minimal " +
              "interface just above. Nothing here is permanent." }
    ];
  }

  function tourBuild() {
    tourCss();
    var el = doc.createElement("div");
    el.id = "rsTour";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<div class="rs-t-hole" aria-hidden="true"></div>' +
      '<div class="rs-t-ring" aria-hidden="true"></div>' +
      '<div class="rs-t-bub" role="dialog" aria-modal="true" tabindex="-1" ' +
      '  aria-labelledby="rsTourT" aria-describedby="rsTourB">' +
      '  <button class="rs-t-x" aria-label="End the tour">' + TOUR_TICK + '</button>' +
      '  <span class="rs-t-step" id="rsTourN"></span>' +
      '  <b class="rs-t-t" id="rsTourT"></b>' +
      '  <p class="rs-t-b" id="rsTourB"></p>' +
      '  <div class="rs-t-foot">' +
      '    <button class="rs-t-skip">Skip</button>' +
      '    <button class="rs-t-back">Back</button>' +
      '    <button class="rs-t-next">Next</button>' +
      '  </div>' +
      '  <i class="rs-t-caret" aria-hidden="true"></i>' +
      '</div>';
    doc.body.appendChild(el);
    TOUR.el = el;
    TOUR.hole = el.querySelector(".rs-t-hole");
    TOUR.hole2 = el.querySelector(".rs-t-ring");
    TOUR.bub = el.querySelector(".rs-t-bub");
    el.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b) return;
      if (b.classList.contains("rs-t-next")) tourStep(TOUR.i + 1);
      else if (b.classList.contains("rs-t-back")) tourStep(TOUR.i - 1);
      else tourEnd(true);                       /* Skip and the tick both leave for good */
    });
    return el;
  }

  function tourFill() {
    var st = TOUR.steps[TOUR.i], n = TOUR.steps.length, bub = TOUR.bub;
    bub.querySelector("#rsTourN").textContent = (TOUR.i + 1) + " of " + n;
    bub.querySelector("#rsTourT").textContent = st.title;
    bub.querySelector("#rsTourB").textContent = st.body;
    bub.querySelector(".rs-t-back").style.display = TOUR.i ? "" : "none";
    bub.querySelector(".rs-t-skip").style.display = TOUR.i === n - 1 ? "none" : "";
    bub.querySelector(".rs-t-next").textContent = TOUR.i === n - 1 ? "Done" : "Next";
  }

  function tourPlace() {
    var st = TOUR.steps[TOUR.i] || {};
    var vw = window.innerWidth, vh = window.innerHeight;
    var bub = TOUR.bub, hole = TOUR.hole, ring = TOUR.hole2;
    var tgt = st.sel ? doc.querySelector(st.sel) : null;
    if (tgt && !tgt.getClientRects().length) tgt = null;
    /* a tablet has the room for a wider bubble; the width lives here because the
       placement code measures the bubble right after setting it */
    var bw = Math.min(vw >= 600 ? 400 : 340, vw - 28);
    bub.style.width = Math.round(bw) + "px";
    var bh = bub.offsetHeight, margin = 16, x, y, w, h, top, left, below, above;
    var caret = bub.querySelector(".rs-t-caret");
    if (tgt) {
      var r = tgt.getBoundingClientRect();
      x = Math.max(6, r.left - 6);
      y = Math.max(6, r.top - 6);
      w = Math.min(vw - x - 6, r.width + 12);
      h = Math.min(r.height + 12, Math.round(vh * 0.52));
      [hole, ring].forEach(function (e) {
        e.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
        e.style.width = Math.round(w) + "px";
        e.style.height = Math.round(h) + "px";
        e.style.opacity = "1";
      });
      below = y + h + margin;
      above = y - bh - margin;
      if (below + bh <= vh - 8) { top = below; caret.className = "rs-t-caret rs-t-top"; }
      else if (above >= 8) { top = above; caret.className = "rs-t-caret rs-t-bottom"; }
      else { top = Math.max(8, vh - bh - 16); caret.className = "rs-t-caret"; }
      left = Math.max(14, Math.min(vw - bw - 14, x + w / 2 - bw / 2));
      bub.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
      var cx = Math.max(20, Math.min(bw - 34, x + w / 2 - left - 7));
      caret.style.left = Math.round(cx) + "px";
    } else {
      [hole, ring].forEach(function (e) {
        e.style.width = "0px"; e.style.height = "0px"; e.style.opacity = "0";
      });
      caret.className = "rs-t-caret";
      bub.style.transform = "translate(" + Math.round((vw - bw) / 2) + "px," +
        Math.round((vh - bh) / 2) + "px)";
    }
  }

  function tourStep(i) {
    if (!TOUR.on) return;
    if (i < 0) i = 0;
    if (i >= TOUR.steps.length) { tourEnd(true); return; }
    TOUR.i = i;
    var st = TOUR.steps[i], gen = ++TOUR.gen;
    window.clearTimeout(TOUR.timer);
    if (st.nav && CUR !== st.nav) go(st.nav);
    doc.documentElement.classList.remove("rs-navhide");
    wakeChrome();
    TOUR.bub.classList.remove("rs-t-show");
    /* fill now, place later: the bubble must never be on screen empty while the
       120 ms placement timer runs */
    tourFill();
    TOUR.timer = window.setTimeout(function () {
      if (gen !== TOUR.gen || !TOUR.on) return;
      var tgt = st.sel ? doc.querySelector(st.sel) : null, scrolled = false;
      if (tgt) {
        var r = tgt.getBoundingClientRect();
        if (r.top < 76 || r.bottom > window.innerHeight - 76) {
          try { tgt.scrollIntoView({ block: "center", behavior: "smooth" }); scrolled = true; }
          catch (e) { try { tgt.scrollIntoView(); } catch (e2) { } }
        }
      }
      tourPlace();
      TOUR.bub.classList.add("rs-t-show");
      try { TOUR.bub.focus({ preventScroll: true }); } catch (e) { }
      /* a smooth scroll keeps moving after the first measure; re-aim once it has settled */
      if (scrolled) {
        window.clearTimeout(TOUR.timer);
        TOUR.timer = window.setTimeout(function () {
          if (gen === TOUR.gen && TOUR.on) tourPlace();
        }, 380);
      }
    }, 120);
  }

  function tourStart() {
    if (TOUR.on) return;
    if (!TOUR.el) tourBuild();
    if (SHEET.open) { openSheet(false); unmarkBackTop(); }
    for (var i = 0; i < overlays.length; i++) {
      if (overlays[i].classList.contains("rs-ov-on")) closeOverlay(overlays[i], true);
    }
    TOUR.on = true;
    TOUR.i = -1;
    TOUR.steps = tourSteps();
    TOUR.el.classList.add("rs-t-first", "rs-t-on");
    TOUR.el.setAttribute("aria-hidden", "false");
    doc.documentElement.classList.add("rs-locked");
    markBack();
    tourStep(0);
    window.setTimeout(function () { TOUR.el.classList.remove("rs-t-first"); }, 60);
  }

  function tourEnd(byUser) {
    if (!TOUR.on) return;
    TOUR.on = false;
    TOUR.gen++;
    window.clearTimeout(TOUR.timer);
    TOUR.el.classList.remove("rs-t-on");
    TOUR.el.setAttribute("aria-hidden", "true");
    TOUR.bub.classList.remove("rs-t-show");
    doc.documentElement.classList.remove("rs-locked");
    prefs.tour = "done"; savePrefs();
    if (byUser) unmarkBackTop();
  }

  function tourAuto() {
    if (prefs.tour || TOUR.on || SHEET.open || anyOverlayOpen() || FS.on) return;
    tourStart();
  }



  function openGuide(keepBack) {
    var ov = doc.getElementById("rsGuide");
    if (!ov) {
      ov = buildOverlay("rsGuide", "Quick guide",
        '<h4>What this is</h4>' +
        '<p>A tone, beat and noise studio that runs entirely on this device. Everything is ' +
        'synthesised live — nothing streams, nothing is uploaded, there is no account. The ' +
        'built-in sessions are ready to play; everything about them can be changed.</p>' +
        '<h4>Start here</h4>' +
        '<ul>' +
        '<li><b>Home</b> — eight sessions, from Deep sleep to Morning. Tap a card and it loads ' +
        'and plays.</li>' +
        '<li><b>Sessions</b> — the whole library, searchable. Tap a row to load it.</li>' +
        '<li><b>Studio</b> — build a tone from a carrier and a beat, pick a bed, press play. ' +
        'Quick picks, the schedule editor and files all live here too.</li>' +
        '</ul>' +
        '<h4>Headphones or speakers?</h4>' +
        '<p><b>Binaural pair</b> sessions need headphones — the beat is created in your hearing, ' +
        'not in the file. The <b>Speakers</b> pack and the isochronic pulses work on any ' +
        'loudspeaker, and nothing in them depends on a difference between your ears.</p>' +
        '<h4>Visualise</h4>' +
        '<p>The chamber takes the session’s own carrier and beat and draws the figure that tone ' +
        'actually drives on a plate, in water or as bubbles. Open it from Visualise; the back ' +
        'button returns. The panels are capped below the flashing thresholds.</p>' +
        '<h4>Make it yours</h4>' +
        '<p>All of these live in <b>Studio</b>.</p>' +
        '<ul>' +
        '<li><b>Quick picks</b> adds one layer to the current sound.</li>' +
        '<li><b>Layers &amp; entries</b> edits each layer’s schedule: every entry ramps into the ' +
        'next one’s values, and the last wraps around to the first.</li>' +
        '<li><b>Files &amp; export</b> saves .gnaural files, exports WAV audio and copies a share ' +
        'link that opens the same schedule on moddys.net.</li>' +
        '</ul>' +
        '<h4>Your files</h4>' +
        '<p><b>Open .gnaural</b> and <b>Add pack (.zip)</b> import from anywhere on the phone. ' +
        '<b>Save .gnaural</b>, <b>Export WAV</b> and <b>Pack downloads</b> all write to ' +
        '<b>Downloads/Resonance Studio</b>. Everything works offline.</p>' +
        '<h4>While the screen is off</h4>' +
        '<p>Leave the app or lock the screen and the session keeps going; the notification has ' +
        'pause and stop. Swiping the app away ends the session.</p>' +
        '<h4>Care</h4>' +
        '<p>Keep volumes moderate — a pulse train is more alerting than a steady tone at the same ' +
        'level, and if you have to raise your voice to be heard at arm’s length it is too loud. If ' +
        'you have epilepsy or a seizure disorder, ask a clinician before using repetitive pulsed ' +
        'tones. Skip it while driving or operating machinery, and stop if it feels unpleasant. ' +
        '<b>Not a medical device or treatment.</b></p>');
    }
    showOverlay(ov, keepBack);
  }

  /* ------------------------------------------------------------ device check --- */

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
    if (m === "worklet") return "AudioWorklet — full quality";
    if (m === "spn") return "Script fallback — reduced efficiency";
    return m ? m : "not started yet";
  }

  function checkReport() {
    var d = deviceFacts();
    var c = d.compat || {};
    return [
      APP_NAME + " " + (d.app || "?") + " (Android)",
      "Device: " + (d.manufacturer || "?") + " " + (d.model || "?"),
      "Android: " + (d.release || "?") + " (API " + (d.api || "?") + ")",
      "WebView: " + (d.webview || "?"),
      "Audio path: " + audioPathText(),
      "Notifications: " + (d.notifications ? "granted" : "not granted"),
      "Compatibility: " + (c.system || "?") + " — " +
        (c.supported ? (c.recommended ? "supported" : "supported, older than tuned-for") : "NOT supported")
    ].join("\n");
  }

  function checkRows() {
    var d = deviceFacts();
    var rows = [];
    function row(ok, label, detail) { rows.push({ ok: ok, label: label, detail: detail }); }
    row(true, "Device", (d.manufacturer || "?") + " " + (d.model || "?"));
    var apiN = d.api || 0;
    row(apiN >= 30, "Android", (d.release || "?") + " (API " + apiN + ")" +
      (apiN >= 30 ? "" : " — tuned for Android 11+; this release runs, with rough edges"));
    row(true, "Engine", d.webview || "unknown");
    var mode = pState() ? (pState().mode || "") : "";
    row(mode !== "spn", "Audio path", audioPathText());
    row(!!d.notifications, "Notifications", d.notifications
      ? "granted — the lock screen can pause and stop"
      : "not granted — background play still works, the notification does not show");
    var body = "";
    rows.forEach(function (r) {
      body += '<div class="rs-crow ' + (r.ok ? "ok" : "warn") + '"><i>' + (r.ok ? "✓" : "!") +
        '</i><b>' + r.label + '</b><span>' + r.detail + '</span></div>';
    });
    body += '<button class="rs-cta" id="rsCopyReport">Copy report</button>' +
      '<p style="font-size:12.5px">The report is plain text — paste it anywhere to describe ' +
      'exactly what this device reports.</p>';
    return body;
  }

  function openCheck(keepBack) {
    var ov = doc.getElementById("rsCheck");
    if (!ov) ov = buildOverlay("rsCheck", "Check device", "<div id='rsCheckBody'></div>");
    var body = ov.querySelector("#rsCheckBody");
    body.innerHTML = checkRows();
    var copy = body.querySelector("#rsCopyReport");
    if (copy) copy.addEventListener("click", function () {
      var ok = native("copy", [checkReport()]);
      copy.textContent = ok ? "✓ Copied" : "✕ Copy failed";
      window.setTimeout(function () { copy.textContent = "Copy report"; }, 2000);
    });
    showOverlay(ov, keepBack);
  }

  function openAbout(keepBack) {
    var ov = doc.getElementById("rsAbout");
    if (!ov) {
      var d = deviceFacts();
      ov = buildOverlay("rsAbout", "About Resonance Studio",
        '<h4>' + APP_NAME + ' <span style="color:var(--rs-out);font-size:13px">v' +
        esc(d.app || "?") + ' · Android</span></h4>' +
        '<p>The mobile home of <b>Gnaural Web</b>, bundled from <b>moddys.net/resonance</b> — ' +
        'binaural and monaural beats, isochronic pulses and noise beds, with the full session ' +
        'library, schedule editor and visualisers built in. Everything is synthesised on this ' +
        'device; nothing streams and nothing is collected.</p>' +
        '<h4>Licences</h4>' +
        '<p><b>Gnaural Web</b> is a browser re-implementation of Gnaural’s scheduling engine and ' +
        '.gnaural format. Gnaural is © Bret Logan and contributors: the upstream engine is ' +
        'LGPL-2.1-or-later and this port keeps those terms; the rest of the app is ' +
        'GPL-2.0-or-later. The full texts ship inside the app (app/COPYING, app/COPYING.LESSER) ' +
        'and on the site. Not affiliated with the upstream project, the Monroe Institute or any ' +
        'other programme.</p>' +
        '<h4>More</h4>' +
        '<button class="rs-cta" data-about-ext="https://moddys.net/resonance/help/">Full help on moddys.net</button>' +
        '<button class="rs-cta" data-about-ext="https://moddys.net/resonance/credits/">Credits &amp; licence</button>' +
        '<button class="rs-cta" id="rsAboutUpd">Check for updates</button>');
      ov.addEventListener("click", function (ev) {
        var b = ev.target.closest("[data-about-ext]");
        if (b) { native("url", [b.getAttribute("data-about-ext")]); return; }
        if (ev.target.closest("#rsAboutUpd")) { askUpdate(); }
      });
    }
    showOverlay(ov, keepBack);
  }

  /* ======================================================= fullscreen viz === */
  /* The active visual panel is MOVED (never copied) into a fullscreen layer, so the
     page's own visualizer code keeps drawing into it. A resize event makes the viz
     system re-fit its canvas to the new box. */

  var FS = { on: false, host: null, home: null, homeNext: null };

  function fsCss() {
    injectCss([
      "#rsFs{position:fixed;top:0;right:0;bottom:0;left:0;z-index:100;background:#000;display:none}",
      "html.rs-fs #rsFs{display:block}",
      "html.rs-fs #rsApp{display:none}",
      /* generated atmosphere for the focus view: two plates at different depths, drifting
       at different speeds over the figure. Blended, so it adds air and colour without
       covering what the session is drawing; the preset's own palette picks the plate. */
    "#rsFsBg{position:absolute;inset:-5%;z-index:2;pointer-events:none;overflow:hidden;",
    "  opacity:0;transition:opacity 1.1s ease;mix-blend-mode:screen;will-change:transform}",
    "html.rs-focus #rsFsBg{opacity:.55}",
    "#rsFsBg .rs-bgl{position:absolute;inset:0;background-size:cover;background-position:center;",
    "  opacity:0;transition:opacity 1.2s ease;will-change:transform}",
    "#rsFsBg .rs-bgl.on{opacity:1}",
    "#rsFsBgCool{background-image:url(ui/focus-cool.webp)}",
    "#rsFsBgWarm{background-image:url(ui/focus-warm.webp)}",
    "#rsFsBg .a{filter:blur(16px) saturate(1.15)}",
    "#rsFsBg .b{filter:blur(3px) saturate(1.05);opacity:0}",
    "#rsFsBg .b.on{opacity:.55}",
    "@media (prefers-reduced-motion: no-preference){",
    "  #rsFsBg .a{animation:rsBgA 52s ease-in-out infinite alternate}",
    "  #rsFsBg .b{animation:rsBgB 34s ease-in-out infinite alternate}",
    "}",
    "@keyframes rsBgA{from{transform:translate3d(-2.4%,-1.6%,0) scale(1.10)}",
    "  to{transform:translate3d(2.4%,1.6%,0) scale(1.17)}}",
    "@keyframes rsBgB{from{transform:translate3d(2%,1.2%,0) scale(1.22)}",
    "  to{transform:translate3d(-2%,-1.2%,0) scale(1.13)}}",
    "#rsFsStage{position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden}",
      "html.rs-fs .rs-fs-host{position:absolute !important;top:0 !important;right:0 !important;",
      "  bottom:0 !important;left:0 !important;width:100% !important;height:100% !important;",
      "  margin:0 !important;padding:0 !important;border:0 !important;border-radius:0 !important;",
      "  background:transparent !important;box-shadow:none !important;min-height:0 !important}",
      "html.rs-fs .rs-fs-host h3{display:none !important}",
      "html.rs-fs .rs-fs-host .viz-canvas{width:100% !important;height:100% !important;",
      "  max-width:none !important;border-radius:0 !important}",
      /* the panel's own wrappers must stretch too, or the canvas keeps its inline height */
      "html.rs-fs .rs-fs-host .viz-inline,html.rs-fs .rs-fs-host .viz-frame,html.rs-fs .rs-fs-host > div{",
      "  height:100% !important;max-height:none !important;display:block !important}",
      "#rsFsTop{position:absolute;top:calc(10px + " + SAFE_T + ");left:14px;right:12px;display:flex;",
      "  align-items:center;gap:10px;color:rgba(255,255,255,.75);font:13px/1.3 inherit;",
      "  pointer-events:none;transition:opacity .25s;z-index:2}",
      "#rsFsTop .rs-fs-title{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;",
      "  text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.8)}",
      "#rsFsTop button{pointer-events:auto;width:48px;height:48px;border-radius:50%;",
      "  border:1px solid rgba(255,255,255,.28);background:rgba(20,17,13,.42);color:#fff;",
      "  font-size:17px;cursor:pointer}",
      "html[data-rs-ui=full] #rsFsTop button{font-size:0;border:0;background-color:#100e0c;",
      "  background-image:url(ui/amp-close.webp);background-size:cover;background-position:center;",
      "  box-shadow:0 4px 12px rgba(0,0,0,.5)}",
      /* the viewer's control panel: one faceplate, two rows. Transport + master fader
         on the bottom row; in focus view the visualisation picker stacks above it in
         the same panel, so the screen has one piece of hardware instead of two loose
         pill rows. Widths are shared, so the rows line up exactly. */
      "#rsFsCtl{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(12px + " + SAFE_B + ");",
      "  width:min(420px,94vw);box-sizing:border-box;display:flex;flex-direction:column;gap:8px;",
      "  padding:10px 12px;border-radius:18px;background:rgba(10,8,6,.66);",
      "  border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 30px rgba(0,0,0,.45);",
      "  z-index:2;pointer-events:none;transition:opacity .25s}",
      "html[data-rs-ui=full] #rsFsCtl{background-image:linear-gradient(180deg,rgba(12,9,7,.90),rgba(12,9,7,.95)),",
      "  url(ui/strip.webp);background-size:cover;background-position:center;border-color:#4A3D2B;",
      "  box-shadow:0 12px 34px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.07)}",
      "#rsFsCtl .rs-fs-row{display:flex;align-items:center;gap:10px;pointer-events:auto}",
      "#rsFsCtl button{pointer-events:auto;flex:0 0 auto;border-radius:50%;",
      "  border:1px solid rgba(255,255,255,.28);background:rgba(20,17,13,.42);color:#fff;cursor:pointer}",
      "#rsFsCtl .rs-fs-play{width:56px;height:56px;font-size:20px}",
      "#rsFsCtl .rs-fs-stop{width:46px;height:46px;font-size:14px}",
      /* the same brass faces as the hero: the picture is the state */
      "html[data-rs-ui=full] #rsFsCtl .rs-fs-play{font-size:0;border:0;background-color:#100e0c;",
      "  background-image:url(ui/amp-play.webp);background-size:cover;background-position:center;",
      "  box-shadow:0 5px 14px rgba(0,0,0,.55)}",
      "html[data-rs-ui=full].rs-playing #rsFsCtl .rs-fs-play{background-image:url(ui/amp-pause.webp)}",
      "html[data-rs-ui=full] #rsFsCtl .rs-fs-stop{font-size:0;border:0;background-color:#100e0c;",
      "  background-image:url(ui/amp-stop.webp);background-size:cover;background-position:center;",
      "  box-shadow:0 4px 12px rgba(0,0,0,.5)}",
      "#rsFsCtl #rsFsTime{font:600 11px/1 var(--rs-sans);font-variant-numeric:tabular-nums;",
      "  color:rgba(255,255,255,.84);flex:0 0 auto;min-width:74px;text-align:right}",
      "#rsFsCtl #rsFsVol{flex:1 1 auto;min-width:70px;height:44px;margin:0;",
      "  -webkit-appearance:none;background:transparent}",
      "#rsFsCtl #rsFsVol::-webkit-slider-runnable-track{height:26px;border-radius:7px;",
      "  background:linear-gradient(180deg,#2B231A,#14100C);border:1px solid rgba(0,0,0,.8);",
      "  box-shadow:inset 0 2px 6px rgba(0,0,0,.8)}",
      "#rsFsCtl #rsFsVol::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:34px;",
      "  margin-top:-5px;border-radius:5px;border:1px solid rgba(0,0,0,.7);",
      "  background:linear-gradient(180deg,#E7C98A,#8A6A33 58%,#3B2C15);box-shadow:0 2px 5px rgba(0,0,0,.65)}",
      "html[data-rs-ui=full] #rsFsCtl #rsFsVol::-webkit-slider-runnable-track{",
      "  background-image:url(ui/amp-vol-track.webp);background-size:100% 100%;background-repeat:no-repeat}",
      "html[data-rs-ui=full] #rsFsCtl #rsFsVol::-webkit-slider-thumb{",
      "  background-image:url(ui/amp-vol-knob.webp);background-size:cover;background-position:center}",
      /* focus view: the visualisation row, inside the same panel */
      "#rsFocusBar{display:none;align-items:center;gap:8px;pointer-events:auto}",
      "html.rs-focus #rsFocusBar{display:flex}",
      "#rsFocusBar button{pointer-events:auto;min-width:44px;height:44px;border-radius:999px;",
      "  border:1px solid rgba(255,255,255,.24);background:rgba(0,0,0,.42);color:#F2F6F4;",
      "  font:600 13px/1 var(--rs-sans);-webkit-appearance:none;flex:0 0 auto}",
      "#rsFocusBar .rs-fs-prev,#rsFocusBar .rs-fs-next{width:44px;padding:0;font-size:0;border:0;",
      "  background-color:#100e0c}",
      "html[data-rs-ui=full] #rsFocusBar .rs-fs-prev{background-image:url(ui/amp-back.webp);",
      "  background-size:cover;background-position:center}",
      "html[data-rs-ui=full] #rsFocusBar .rs-fs-next{background-image:url(ui/amp-next.webp);",
      "  background-size:cover;background-position:center}",
      "#rsFocusBar #rsFocusName{pointer-events:auto;flex:1 1 auto;min-width:0;padding:0 12px;height:44px;",
      "  display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(0,0,0,.42);",
      "  color:#F6EAD2;font:600 12px/1 var(--rs-sans);letter-spacing:.04em;white-space:nowrap;",
      "  overflow:hidden;text-overflow:ellipsis}",
      "html[data-rs-ui=full] #rsFocusBar #rsFocusName{background-image:",
      "  linear-gradient(180deg,rgba(12,9,7,.84),rgba(20,15,10,.9)),url(ui/strip.webp);",
      "  background-size:cover;background-position:center;border:1px solid #4A3D2B}",
      "#rsFocusBar #rsFocusPick{padding:0 14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase}",
      "html[data-rs-ui=full] #rsFocusBar #rsFocusPick{background-image:",
      "  linear-gradient(180deg,#E2C489,#B58C4C 56%,#7E5C2E);background-color:#B58C4C;",
      "  border-color:#5E4623;color:#241A0F;text-shadow:0 1px 0 rgba(255,244,220,.35);",
      "  box-shadow:inset 0 1px 0 rgba(255,248,230,.45),0 3px 9px rgba(0,0,0,.45)}",
      "html.rs-fs .rs-fs-host .viz-badge{bottom:calc(92px + " + SAFE_B + ") !important;opacity:1;",
      "  color:#fff !important;background:rgba(10,8,6,.72) !important;padding:4px 9px;border-radius:999px}",
      "html.rs-focus .rs-fs-host .viz-badge{bottom:calc(164px + " + SAFE_B + ") !important}",
      /* focus view is for lying still: the sync/slow badge is noise over the picture */
      "html.rs-focus .viz-badge,html.rs-focus .rs-fs-host .viz-badge{display:none !important}",
      "html.rs-fs-hide #rsFsTop,html.rs-fs-hide #rsFsCtl{opacity:0}",
      "html.rs-fs-hide #rsFocusBar{opacity:0;pointer-events:none}",
      "html.rs-fs-hide #rsFsTop button,html.rs-fs-hide #rsFsCtl button{pointer-events:none}",
      "html.rs-fs-hide #rsFsCtl button,html.rs-fs-hide #rsFsTop button{pointer-events:none}"
    ].join("\n"), "rsFsCss");
  }

  function buildFs() {
    fsCss();
    var fs = doc.createElement("div");
    fs.id = "rsFs";
    fs.innerHTML =
      '<div id="rsFsStage" data-rs="fsStage"></div>' +
      '<div id="rsFsBg" aria-hidden="true"><i id="rsFsBgCool" class="rs-bgl a"></i>' +
      '  <i id="rsFsBgWarm" class="rs-bgl b"></i></div>' +
      '<div id="rsFsTop"><span class="rs-fs-title" id="rsFsTitle"></span>' +
      '<button data-rs="fsExit" aria-label="Close the visualiser">✕</button></div>' +
      '<div id="rsFsCtl">' +
      '<div id="rsFocusBar"><button class="rs-fs-prev" data-rs="fPrev" aria-label="Previous visualisation"></button>' +
      '<span id="rsFocusName">Visualisation</span>' +
      '<button class="rs-fs-next" data-rs="fNext" aria-label="Next visualisation"></button>' +
      '<button class="rs-fs-pick" data-rs="fPick">Change</button></div>' +
      '<div class="rs-fs-row">' +
      '<button class="rs-fs-play" data-rs="fsPlay" aria-label="Play or pause">▶</button>' +
      '<button class="rs-fs-stop" data-rs="fsStop" aria-label="Stop">■</button>' +
      '<input id="rsFsVol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Volume">' +
      '<span id="rsFsTime" aria-live="polite">0:00 / 0:00</span></div></div>';
    doc.body.appendChild(fs);
    fs.querySelector("#rsFsVol").addEventListener("input", function () {
      setMaster(parseFloat(this.value));
    });
    fs.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-rs]");
      if (!b) return;
      var act = b.getAttribute("data-rs");
      if (act === "fsExit") { if (FOCUS.on) closeFocus(false); else exitFullscreen(false); return; }
      if (act === "fsPlay") { pageToggle(); pushState(true); return; }
      if (act === "fsStop") { pageStop(); pushState(true); return; }
      if (act === "fPrev") { stepFocus(-1); return; }
      if (act === "fNext") { stepFocus(1); return; }
      if (act === "fPick") { openFocusPick(); return; }
      /* a tap anywhere on the layer only ever wakes the player: the old toggle hid the
         chrome on the same tap that revealed it, which read as a flicker */
      if (act === "fsStage") { armHide(); return; }
    });
    return fs;
  }

  /* ------------------------------------------------------------- focus view --- */
  /* The gentle sibling of the chamber: the page's own ambient panels, full screen,
     with the visualisation switchable right there. The chamber is the instrument;
     this is for lying still and watching. */
  var FOCUS = { on: false, preset: "" };
  var FOCUS_DEFAULT = "focus-cathedral";

  /* the focus view offers SCENES first (eight compositions), and the old ambient
   * presets stay reachable behind a flag until the owner signs the new set off */
  function focusPresets() {
    var S = window.GnauralVizScenes, P = window.GnauralVizPresets, out = [];
    if (S && S.LIST) out = S.LIST.slice();
    if (prefs.focusLegacy && P && P.LIST) {
      P.LIST.forEach(function (p) {
        out.push({ id: p.id, name: p.name, blurb: p.blurb, palette: p.palette, legacy: true });
      });
    }
    return out;
  }

  function focusName(id) {
    var l = focusPresets(), i;
    for (i = 0; i < l.length; i++) if (l[i].id === id) return l[i].name;
    var P = window.GnauralVizPresets;
    if (P && P.byId) { var p = P.byId(id); if (p) return p.name; }
    return "Visualisation";
  }

  function applyFocusPreset(id, quiet) {
    var v = window.ResonanceViz && window.ResonanceViz.api;
    if (!v || !id) return;
    FOCUS.preset = id;
    prefs.focusPreset = id; savePrefs();
    try {
      if (window.GnauralVizScenes && window.GnauralVizScenes.isScene(id)) v.applyScene(id);
      else v.applyPreset(id);
      v.enable(true);
    } catch (e) { }
    var n = $id("rsFocusName");
    if (n) n.textContent = focusName(id);
    var s = $id("rsFocusSub");
    if (s) s.textContent = focusName(id) + " · change it in the view";
    if (!quiet) toast(focusName(id));
  }

  function stepFocus(dir) {
    var l = focusPresets();
    if (!l.length) return;
    var i = 0, k;
    for (k = 0; k < l.length; k++) if (l[k].id === FOCUS.preset) i = k;
    applyFocusPreset(l[(i + dir + l.length) % l.length].id);
  }

  /* one card per scene: its own still (so the picker shows what you are
     choosing), its name, and one line of what it is */
  function focusCard(p, ov) {
    var b = doc.createElement("button");
    b.type = "button";
    b.className = "rs-fscard" + (p.legacy ? " rs-fscard-legacy" : "");
    b.setAttribute("data-fp", p.id);
    b.setAttribute("aria-pressed", "false");
    b.title = p.blurb || "";
    if (p.still) b.style.backgroundImage = "url(" + p.still + ")";
    var n = doc.createElement("span");
    n.className = "rs-fsname"; n.textContent = p.name;
    var d = doc.createElement("span");
    d.className = "rs-fsblurb"; d.textContent = p.blurb || "";
    b.appendChild(n); b.appendChild(d);
    b.addEventListener("click", function () { applyFocusPreset(p.id); closeOverlay(ov); });
    return b;
  }

  function fillFocusList(ov) {
    var box = ov.querySelector("#rsFocusList");
    if (!box) return;
    box.textContent = "";
    focusPresets().forEach(function (p) { box.appendChild(focusCard(p, ov)); });
    $$("#rsFocusList button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-fp") === FOCUS.preset ? "true" : "false");
    });
    var more = ov.querySelector("#rsFocusLegacy");
    if (more) {
      more.textContent = prefs.focusLegacy ? "Hide the old presets" : "Show the old presets";
      more.setAttribute("aria-pressed", prefs.focusLegacy ? "true" : "false");
    }
  }

  function openFocusPick() {
    var ov = doc.getElementById("rsFocusPick");
    if (!ov) {
      ov = buildOverlay("rsFocusPick", "Visualisation",
        '<div class="rs-focusgrid" id="rsFocusList"></div>' +
        '<button type="button" class="rs-focusmore" id="rsFocusLegacy"></button>');
      var more = ov.querySelector("#rsFocusLegacy");
      more.addEventListener("click", function () {
        prefs.focusLegacy = !prefs.focusLegacy; savePrefs();
        fillFocusList(ov);
        syncFsBg();
      });
    }
    fillFocusList(ov);
    showOverlay(ov);
  }

  function openFocus() {
    FOCUS.on = true;
    /* the panels mount a beat after the page boots, so a fast tap used to land on
       nothing and toast. Wait for a panel instead of giving up, and turn the
       visualiser on before it is moved so its first frame is painted in place. */
    if (!doc.querySelector("[data-viz-panel]")) {
      FOCUS.wait = (FOCUS.wait || 0) + 1;
      if (FOCUS.wait < 14) { window.setTimeout(openFocus, 90); return; }
      FOCUS.wait = 0;
      FOCUS.on = false;
      toast("The visualiser is still starting — try again in a moment.");
      return;
    }
    FOCUS.wait = 0;
    var v0 = window.ResonanceViz && window.ResonanceViz.api;
    if (v0) { try { if (!v0.getPrefs().on) v0.enable(true); } catch (e) { } }
    enterFullscreen();
    if (!FS.on) { FOCUS.on = false; return; }
    doc.documentElement.classList.add("rs-focus");
    applyFocusPreset(FOCUS.preset || prefs.focusPreset || FOCUS_DEFAULT, true);
    pushState(true);
  }

  function closeFocus(fromPop) {
    FOCUS.on = false;
    doc.documentElement.classList.remove("rs-focus");
    if (FS.on) exitFullscreen(fromPop);
    pushState(true);
  }

  /* chrome that gets out of the way: any touch brings it back, and a few quiet
     seconds slide it off again so only the visuals are left */
  var FSIDLE = 0;
  var FSWAS = { hidden: false };
  function hideChrome() {
    if (FSIDLE) { window.clearTimeout(FSIDLE); FSIDLE = 0; }
    if (FS.on) doc.documentElement.classList.add("rs-fs-hide");
  }
  function armHide() {
    doc.documentElement.classList.remove("rs-fs-hide");
    if (FSIDLE) { window.clearTimeout(FSIDLE); FSIDLE = 0; }
    if (!FS.on) return;
    FSIDLE = window.setTimeout(hideChrome, FOCUS.on ? 4500 : 6000);
  }

  function enterFullscreen() {
    if (FS.on) return;
    var cv = doc.querySelector("[data-viz-panel]");
    var viz = window.ResonanceViz && window.ResonanceViz.api;
    if (!cv) { toast("The visualiser is still starting — try again in a moment."); return; }
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
    armHide();
    fs.addEventListener("pointerdown", function () {
      FSWAS.hidden = doc.documentElement.classList.contains("rs-fs-hide");
      armHide();
    });
    if (!fs.rsBgWired) {
      fs.rsBgWired = true;
      fs.addEventListener("pointermove", function (ev) { try { fsBgParallax(ev); } catch (e) { } }, { passive: true });
    }
    try { window.dispatchEvent(new Event("resize")); } catch (e) { }
    syncFs();
  }

  function exitFullscreen(fromPop) {
    if (!FS.on) return;
    FS.on = false;
    if (FOCUS.on) { FOCUS.on = false; }
    if (FSIDLE) { window.clearTimeout(FSIDLE); FSIDLE = 0; }
    doc.documentElement.classList.remove("rs-fs-hide");
    doc.documentElement.classList.remove("rs-focus");
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

  var WARM_PAL = { ember: 1, rose: 1, dusk: 1, solar: 1, blood: 1, blossom: 1, candle: 1, champagne: 1 };
  function focusPlate() {
    var l = focusPresets(), i;
    for (i = 0; i < l.length; i++) if (l[i].id === FOCUS.preset) {
      if (l[i].warm !== undefined) return l[i].warm ? "warm" : "cool";
      return WARM_PAL[l[i].palette] ? "warm" : "cool";
    }
    return "cool";
  }
  function syncFsBg() {
    var cool = $id("rsFsBgCool"), warm = $id("rsFsBgWarm");
    if (!cool || !warm) return;
    var want = focusPlate();
    cool.classList.toggle("on", want === "cool");
    warm.classList.toggle("on", want === "warm");
  }
  var FSBP = { x: 0, y: 0 };
  function fsBgParallax(ev) {
    var bg = $id("rsFsBg");
    if (!bg) return;
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    /* a shallow, opposite-to-finger offset: the plates move under the glass, the figure
       stays put. Written straight to the wrapper, the layers keep their own drift. */
    var tx = ((ev.clientX || w / 2) / w - 0.5) * -18;
    var ty = ((ev.clientY || h / 2) / h - 0.5) * -14;
    if (Math.abs(tx - FSBP.x) < 0.4 && Math.abs(ty - FSBP.y) < 0.4) return;
    FSBP.x = tx; FSBP.y = ty;
    bg.style.transform = "translate3d(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px,0)";
    var sv = window.GnauralVizScenes;
    if (sv && sv.setParallax) sv.setParallax(tx / 18, ty / 14);
  }

  function syncFs() {
    syncFsBg();
    var p = $id("rsFsTitle");
    if (p) p.textContent = sessionTitle() || APP_NAME;
    var fs = doc.getElementById("rsFs");
    if (!fs) return;
    var play = fs.querySelector('[data-rs="fsPlay"]');
    if (play) play.textContent = isPlaying() ? "❚❚" : "▶";
    var ft = fs.querySelector("#rsFsTime");
    if (ft) ft.textContent = clockText() || "0:00 / 0:00";
    var fv = fs.querySelector("#rsFsVol");
    if (fv) { var mv = masterNow(); if (Math.abs(parseFloat(fv.value) - mv) > 0.005) fv.value = String(mv); }
  }

  /* ================================================================ downloads === */

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
        toast("Saving " + name + "… " + Math.round(done / 1048576) + " MB");
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
          else toast("Could not save " + name + (res ? " — " + String(res).replace(/^err:/, "") : ""));
          return;
        }
        done += r.value.length;
        buf.push(r.value); buflen += r.value.length;
        if (buflen >= 512 * 1024 && !send()) { toast("Could not save " + name); return; }
        step();
      }).catch(function () { toast("Could not save " + name); });
    }
    fetch(href).then(function (res) {
      if (!res.ok || !res.body) throw new Error("blob read failed");
      var cl = res.headers.get("Content-Length");
      total = cl ? parseInt(cl, 10) : 0;
      toast("Saving " + name + "…");
      reader = res.body.getReader();
      step();
    }).catch(function () { toast("Could not save " + name); });
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

  function patchClipboard() {
    try {
      var clip = navigator.clipboard;
      if (!clip || !clip.writeText) return;
      var orig = clip.writeText.bind(clip);
      clip.writeText = function (t) {
        var out = String(t == null ? "" : t);
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
      if (a.hasAttribute("download")) return;
      if (/^blob:|^data:|^mailto:|^tel:/i.test(href)) return;
      if (/\.zip($|[?#])/i.test(href)) return;
      var absolute;
      if (/^https?:/i.test(href)) absolute = href;
      else { try { absolute = new URL(href, SITE_BASE).href; } catch (e) { return; } }
      if (absolute.indexOf("appassets.androidplatform.net") !== -1) return;
      ev.preventDefault(); ev.stopPropagation();
      report("link handed to the shell: " + absolute);
      native("url", [absolute]);
    }, true);
  }

  function wireSearchKeyboard() {
    var q = $id("search");
    if (!q) return;
    function commit() { try { q.blur(); } catch (e) { } native("dismissKeyboard", []); }
    q.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "Go" || e.keyCode === 13) commit();
    });
    q.addEventListener("search", commit);
  }

  /* =============================================================== update strip === */

  var UPD = { state: "unknown", latest: null, manual: false };

  /* One entry point for "Check for updates": it remembers that the person asked, so the
     answer is spoken even when there is nothing to install. The launch check stays quiet. */
  function askUpdate() {
    UPD.manual = true;
    toast("Checking for updates…");
    native("checkUpdate", []);
  }

  function updAnswer(ok) {
    if (!UPD.manual) return;
    UPD.manual = false;
    toast(ok);
  }
  var updEl = null;

  function updShow() {
    injectCss(
      "#rsUpd{position:fixed;left:12px;right:12px;top:calc(10px + " + SAFE_T + ");z-index:125;" +
      "display:flex;gap:9px;align-items:center;padding:12px;border-radius:16px;" +
      "background:var(--rs-s3);border:1px solid var(--rs-live);color:var(--rs-ink);" +
      "box-shadow:0 10px 30px rgba(0,0,0,.5);font:13px/1.35 inherit}" +
      "#rsUpd .rs-upd-t{flex:1 1 auto;min-width:0}" +
      "#rsUpd b{color:var(--rs-live)}" +
      "#rsUpd .rs-upd-n{display:block;opacity:.85;font-size:12px}" +
      "#rsUpd button{flex:0 0 auto;min-height:44px;border:1px solid var(--rs-live);" +
      "background:var(--rs-live);color:var(--rs-on-live);font-weight:700;border-radius:var(--rs-r-sm);" +
      "padding:8px 13px;font:inherit;cursor:pointer}" +
      "#rsUpd button.rs-alt{background:transparent;color:var(--rs-dim);border-color:var(--rs-line2)}" +
      "#rsUpd button:disabled{opacity:.6}", "rsUpdCss");
    if (!updEl) {
      updEl = doc.createElement("div");
      updEl.id = "rsUpd";
      updEl.innerHTML = '<div class="rs-upd-t"></div><button data-rs-upd="go"></button>' +
        '<button class="rs-alt" data-rs-upd="later">Later</button>';
      updEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-rs-upd]");
        if (!b) return;
        if (b.getAttribute("data-rs-upd") === "later") { updEl.style.display = "none"; return; }
        b.disabled = true;
        native("updateApp", [UPD.latest.url, UPD.latest.version, UPD.latest.sha256]);
        b.textContent = "Downloading…";
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

  window.__rsUpdate = {
    available: function (info) {
      UPD.latest = info || {};
      UPD.state = "available";
      UPD.manual = false;          /* the strip itself is the answer */
      try { updShow(); } catch (e) { }
      return UPD.state;
    },
    none: function (latest) {
      UPD.state = "current";
      UPD.latest = latest ? { version: latest } : null;
      updAnswer("You are on the newest build.");
      return UPD.state;
    },
    failed: function (why) {
      UPD.state = "failed";
      UPD.why = String(why || "");
      updAnswer("Could not reach moddys.net — check the connection and try again.");
      return UPD.state;
    },
    state: function () { return { state: UPD.state, latest: UPD.latest }; }
  };

  /* ==================================================================== tick === */

  function syncHero() {
    var t = $id("rsNowTitle"), s = $id("rsNowSrc"), m = $id("rsMode");
    var sess = sessionTitle();
    if (t) t.textContent = sess || "Pick a session";
    if (s) s.textContent = sess ? (text($id("nowsrc")) || "") : "Sleep, focus, relax or build a tone below.";
    if (m) m.textContent = isPlaying() ? "live" : (modeText() || "idle");
    var clk = $id("rsClock");
    if (clk) clk.textContent = clockText() || "0:00 / 0:00";
    var p = $id("rsPlay");
    if (p) {
      var on = isPlaying();
      if (p.getAttribute("aria-label") !== (on ? "Pause" : "Play")) {
        p.setAttribute("aria-label", on ? "Pause" : "Play");
        p.innerHTML = on ? svgFill("pause") : svgFill("play");
        p.classList.toggle("rs-live", on);
      }
      doc.documentElement.classList.toggle("rs-playing", on);
    }
    paintLevel(masterNow());
    var lp = $id("rsLoop"), lel = $id("loop");
    if (lp && lel && lp.checked !== lel.checked) lp.checked = lel.checked;
    var lbtn = $id("rsLoopBtn"), lled = $id("rsLoopLed");
    if (lel && lbtn) {
      var onL = !!lel.checked;
      if (lbtn.getAttribute("aria-pressed") !== (onL ? "true" : "false"))
        lbtn.setAttribute("aria-pressed", onL ? "true" : "false");
      if (lled) lled.classList.toggle("on", onL);
    }
    try { tempoGuard(); } catch (e) { }
  }

  function syncMini() {
    var mini = $id("rsMini");
    if (!mini) return;
    var sess = sessionTitle();
    var show = !!sess && CUR !== "home" && CUR !== "studio";
    doc.documentElement.classList.remove("rs-minihide");
    mini.classList.toggle("rs-on", show);
    if (!show) return;
    var t = $id("rsMiniTitle");
    if (t) t.textContent = sess;
    var tm = $id("rsMiniTime");
    if (tm) tm.textContent = clockText() || "";
    var b = $id("rsMiniPlay");
    if (b) {
      var on = isPlaying();
      b.innerHTML = on ? svgFill("pause") : svgFill("play");
      b.setAttribute("aria-label", on ? "Pause" : "Play");
    }
  }

  function paintItems() {
    function bandOfText(t) {
      t = t.toLowerCase();
      return /sleep|delta|drift/.test(t) ? "sleep"
        : /focus|study|alpha|concentrat/.test(t) ? "focus"
        : /relax|calm|theta|meditat|breath/.test(t) ? "relax"
        : /wake|morning|energis|gamma|beta|alert/.test(t) ? "wake" : "other";
    }
    var box = $id("plist");
    if (box) $$(".item", box).forEach(function (row) {
      if (row.getAttribute("data-band")) return;
      row.setAttribute("data-band", bandOfText(text(row)));
    });
    var qp = $id("quickpick");
    if (qp) $$("button.chip, button", qp).forEach(function (row) {
      if (row.getAttribute("data-band")) return;
      var t = text(row);
      if (t) row.setAttribute("data-band", bandOfText(t));
    });
  }

  function tick() {
    applyInsets();
    if (CUR === "studio") syncStudio();
    syncHero();
    syncMini();
    try { refreshSceneMenu(); } catch (e) { }
    renderTop();
    syncFs();
    if (CUR === "vis") syncVis();
    pushState(false);
  }

  /* ==================================================================== boot === */

  function markAsApp() {
    try { doc.documentElement.classList.add("rs-app"); } catch (e) { }
    try {
      var mv = doc.querySelector("meta[name=viewport]");
      if (mv && mv.getAttribute("content").indexOf("viewport-fit") === -1) {
        mv.setAttribute("content", mv.getAttribute("content") + ", viewport-fit=cover");
      }
    } catch (e) { }
    applyTheme();
    applyUi();
  }

  /* Move the page's real cards into the screens. The nodes are the page's own; its
     renderers keep painting into them. */
  /* ------------------------------------------------------------------ scene menu --- */
  /* The page's #vizPreset stays the source of truth — the arrows, the chips and the engine
     all drive it — but its native popup is the one surface Android will not let us style.
     The shell shows the value in a smoked LED window and opens a list in the same language. */
  function sceneOptionText(sel) {
    if (!sel) return "Select Scene";
    var o = sel.options[sel.selectedIndex];
    if (!o || !sel.value) return "Select Scene";
    return text(o) || "Select Scene";
  }
  function refreshSceneMenu() {
    var n = $id("rsSceneName"), sel = $id("vizPreset");
    if (!n || !sel) return;
    var want = sceneOptionText(sel);
    if (n.textContent !== want) n.textContent = want;
  }
  function closeScenePop() {
    var p = $id("rsScenePop"), m = $id("rsSceneMenu");
    if (p) p.classList.remove("rs-on");
    if (m) m.setAttribute("aria-expanded", "false");
  }
  function fillScenePop() {
    var pop = $id("rsScenePop"), sel = $id("vizPreset");
    if (!pop || !sel) return;
    pop.innerHTML = "";
    for (var i = 0; i < sel.options.length; i++) {
      (function (o) {
        var b = doc.createElement("button");
        b.type = "button";
        b.setAttribute("role", "option");
        b.setAttribute("data-v", o.value);
        b.setAttribute("aria-selected", o.value === sel.value ? "true" : "false");
        b.textContent = text(o) || "Custom";
        b.addEventListener("click", function () {
          var s2 = $id("vizPreset");
          if (s2) {
            s2.value = b.getAttribute("data-v");
            try { s2.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { }
          }
          closeScenePop();
          refreshSceneMenu();
        });
        pop.appendChild(b);
      })(sel.options[i]);
    }
  }
  function openScenePop() {
    var pop = $id("rsScenePop"), m = $id("rsSceneMenu");
    if (!pop || !m) return;
    fillScenePop();
    pop.classList.add("rs-on");
    m.setAttribute("aria-expanded", "true");
    var cur = pop.querySelector("button[aria-selected=true]");
    if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: "nearest" }); } catch (e) { } }
  }
  function scenePopOpen() {
    var p = $id("rsScenePop");
    return !!(p && p.classList.contains("rs-on"));
  }

  function mountCards() {
    function cardOf(sel) {
      var n = typeof sel === "string" ? $(sel) : sel;
      if (!n) return null;
      return n.closest("section.card") || n;
    }
    var stage = cardOf("#graph");
    if (stage) {
      var hero = $(".rs-hero");
      var gcv = $id("graph");
      var sched = buildSched();
      if (gcv && gcv.parentNode) gcv.parentNode.insertBefore(sched, gcv);
      hero.insertBefore(stage, hero.querySelector(".rs-transport"));
      $$("h2,h3,.hint", stage).forEach(function (n) { n.style.display = "none"; });
      stage.classList.remove("stage");
      stage.style.margin = "0";
      try { drawSched(); } catch (e) { }
    }
    /* Build a tone is one of the ways to add a sound, so it lives in that pane rather
       than standing above the mix as a second, competing model. */
    var build = cardOf("#rsBuild");
    var chapPanel = $id("rsChapPanel");
    if (build && chapPanel) chapPanel.appendChild(build);
    else if (build && $id("rsVoices") && $id("rsVoices").parentNode) {
      $id("rsVoices").parentNode.insertBefore(build, $id("rsVoices"));
    }
    var hear = cardOf("#hearinfo");
    if (hear) {
      var fold = doc.createElement("section");
      fold.className = "card rs-fold";
      fold.innerHTML = '<details><summary><span class="rs-fold-t"><b>What you are hearing</b>' +
        '<span>Layers, rate and level — folded away until you want it</span></span>' + svg("chev", 18) + '</summary></details>';
      hear.classList.remove("card", "rs-screen");
      $id("hearinfo").classList.remove("readout");
      fold.querySelector("details").appendChild(hear);
      var before = $id("rsFilesDet");
      if (before && before.parentNode) before.parentNode.insertBefore(fold, before);
      else screenEls.studio.appendChild(fold);
    }

    var search = $id("search");
    var srow = $(".rs-searchrow");
    if (search && srow) srow.insertBefore(search, srow.firstChild);
    var filters = $id("filters");          // the chips themselves, not their card
    if (filters) $id("rsFilterWrap").appendChild(filters);
    var browse = cardOf("#plist");
    if (browse) $id("rsBrowse").appendChild(browse);
    /* the library's own Surprise me button lives in the player now (see #rsSurprise);
       it stays in the DOM because both the page and the visualiser bind to it */
    var rnd = $id("randomBtn");
    if (rnd) rnd.style.display = "none";
    var quick = cardOf("#quickpick");
    var chapHolder = $id("rsChapPanel");
    if (quick && chapHolder) {
      /* the catalogue becomes the add-a-sound pane's chapters; its own heading and
         two-sentence hint are redundant inside a pane that already says what it is */
      chapHolder.appendChild(quick);
      $$("h3", quick).forEach(function (n) { n.style.display = "none"; });
    }

    var voices = cardOf("#voicelist");
    if (voices) $id("rsVoices").appendChild(voices);
    var vh = voices && voices.querySelector("h3");
    if (vh) {
      var cnt = vh.querySelector(".cnt");
      /* the mix speaks "layers"; the raw schedule speaks the page's own "voices" and
         "entries", so the two panels are never two names for one thing */
      vh.textContent = "Voices";
      if (cnt) { vh.appendChild(document.createTextNode(" \u00b7 ")); vh.appendChild(cnt); }
    }
    var hs = ["duration s", "base Hz", "beat Hz", "vol L", "vol R"];
    var rows = $$("#entryedit .erow");
    rows.concat($$("#entryedit .erow")).forEach(function (r) {
      $$("input", r).forEach(function (inp, i) {
        if (hs[i]) { inp.setAttribute("aria-label", hs[i]); inp.setAttribute("placeholder", hs[i]); }
      });
    });
    var eh = voices && voices.querySelector("#entriesHead");
    if (eh) {
      var ecnt = eh.querySelector(".cnt");
      eh.textContent = "Entries";
      if (ecnt) { eh.appendChild(document.createTextNode(" \u00b7 ")); eh.appendChild(ecnt); }
    }
    var live = cardOf("#barL");
    if (live) $id("rsLive").appendChild(live);
    var files = cardOf("#loadBtn");
    if (files) {
      $$("p.hint", files).forEach(function (n) {
        if (/^Every export is made/.test(text(n))) n.parentNode.removeChild(n);
      });
      $id("rsFiles").appendChild(files);
      /* one rhythm for the card: the page's own heading repeats the summary, the two-button
         rows become equal columns, and the export length gets a labelled row of its own */
      files.classList.add("rs-files");
      $$("h3", files).forEach(function (n) { n.style.display = "none"; });
      function twoCols(sel) {
        var b = files.querySelector(sel);
        var row = b && b.closest(".row");
        if (row) row.classList.add("rs-2");
      }
      twoCols("#loadBtn");
      twoCols("#saveGnm");
      var share = files.querySelector("#shareBtn");
      var shareRow = share && share.closest(".row");
      if (shareRow) shareRow.classList.add("rs-1");
      var len = files.querySelector("#exportMin");
      var saveRow = files.querySelector("#saveGnm").closest(".row");
      if (len && saveRow && len.parentNode !== saveRow.parentNode) { /* keep the element */ }
      if (len && saveRow) {
        var lab = doc.createElement("label");
        lab.className = "rs-filelen";
        var sp = doc.createElement("span");
        sp.textContent = "Export length";
        lab.appendChild(sp);
        lab.appendChild(len);
        if (saveRow.nextSibling) saveRow.parentNode.insertBefore(lab, saveRow.nextSibling);
        else saveRow.parentNode.appendChild(lab);
      }
    }

    var packs = cardOf("#pklist");
    if (packs) {
      packs.id = "rsPacks";
      var pkH = packs.querySelector("h3");
      var n = packs.querySelectorAll("a").length;
      var det = doc.createElement("details");
      det.className = "tool";
      det.innerHTML = '<summary>Session packs <span class="cnt">' + n + '</span></summary>';
      var body = doc.createElement("div");
      body.className = "body";
      var hint = packs.querySelector("p.hint");
      if (hint) body.appendChild(hint);
      body.appendChild(packs);
      det.appendChild(body);
      screenEls.settings.appendChild(det);
    }

    var kb = $$("section.card").filter(function (c) { return /Keyboard/.test(text(c.querySelector("h3"))); })[0];
    if (kb && kb.parentNode) kb.parentNode.removeChild(kb);

    var tries = 0;
    (function adoptViz() {
      var vc = $id("vizCard");
      if (vc) {
        $$("h3", vc).forEach(function (n) { n.style.display = "none"; });
        /* the page's paragraph described the panels' plumbing; one line is enough here */
        var vhint = vc.querySelector("p.hint");
        if (vhint) vhint.textContent = "Follows the audio";
        /* the shell's own chamber card is the entry to it; the page's copy of that button
           sat three controls away and read as a second, different door */
        var cymBtn = $id("cymCardBtn");
        if (cymBtn) cymBtn.style.display = "none";
        /* Scene becomes a menu: its label and the select-plus-arrows live in one raised box */
        var scenes = vc.querySelector(".vz-scenes");
        var sceneHead = scenes && scenes.previousElementSibling;
        /* a scene set by hand leaves the picker with no value at all, which renders as a
           blank menu; name that state instead */
        var vsel = $id("vizPreset");
        if (vsel && !vsel.value) {
          var custom = doc.createElement("option");
          custom.value = ""; custom.textContent = "Custom (chips)";
          vsel.insertBefore(custom, vsel.firstChild);
          vsel.value = "";
        }
        if (scenes && sceneHead) {
          var sbox = doc.createElement("div");
          sbox.className = "rs-scenebox";
          vc.insertBefore(sbox, sceneHead);
          sbox.appendChild(sceneHead);
          sbox.appendChild(scenes);
          /* shuffle belongs with the label: the control row is then arrows and one wide
             picker, which is what makes it read as a menu */
          var shuf = $id("vizShuffle");
          var hint = sceneHead.querySelector(".hint");
          if (hint) hint.style.display = "none";
          if (shuf) { shuf.classList.add("rs-scene-shuffle"); sceneHead.appendChild(shuf); }
          /* the picker a person actually uses: an LED window between the arrows, and a list
             in the same language (the page's select stays hidden but keeps driving) */
          var menu = doc.createElement("button");
          menu.type = "button"; menu.id = "rsSceneMenu"; menu.className = "rs-scenemenu";
          menu.setAttribute("aria-haspopup", "listbox");
          menu.setAttribute("aria-expanded", "false");
          menu.setAttribute("aria-label", "Scene");
          menu.innerHTML = '<span id="rsSceneName">Select Scene</span>';
          menu.addEventListener("click", function (ev) {
            ev.stopPropagation();
            if (scenePopOpen()) closeScenePop(); else openScenePop();
          });
          var nextBtn = $id("vizNext");
          if (nextBtn && nextBtn.parentNode === scenes) scenes.insertBefore(menu, nextBtn);
          else scenes.appendChild(menu);
          var pop = doc.createElement("div");
          pop.id = "rsScenePop"; pop.className = "rs-scenepop";
          pop.setAttribute("role", "listbox");
          sbox.appendChild(pop);
          doc.addEventListener("pointerdown", function (ev) {
            if (!scenePopOpen()) return;
            if (ev.target && ev.target.closest &&
                (ev.target.closest("#rsScenePop") || ev.target.closest("#rsSceneMenu"))) return;
            closeScenePop();
          }, true);
          doc.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeScenePop(); });
          refreshSceneMenu();
        }
        $id("rsVizCard").appendChild(vc);
        /* Backdrop, overlay and palette only matter when no scene is chosen — the focus scenes
           bypass them — so they fold away under one disclosure and the card reads preview ->
           scene -> intensity/calm -> auto-scramble. */
        var bdRow = $id("vizBackdrops") ? $id("vizBackdrops").previousElementSibling : null;
        var ovRow = $id("vizOverlays") ? $id("vizOverlays").previousElementSibling : null;
        var plRow = $id("vizPalettes") ? $id("vizPalettes").previousElementSibling : null;
        if (bdRow && ovRow && plRow) {
          var adv = doc.createElement("details");
          adv.className = "rs-fold rs-vizadv";
          var sum = doc.createElement("summary");
          sum.innerHTML = '<span class="rs-fold-t"><b>Backdrop, layers and palette</b>' +
            '<span>For hand-built looks — the scenes above ignore these</span></span>' + svg("chev", 18);
          adv.appendChild(sum);
          vc.insertBefore(adv, bdRow);
          [bdRow, $id("vizBackdrops"), ovRow, $id("vizOverlays"), plRow, $id("vizPalettes")]
            .forEach(function (n) { if (n) adv.appendChild(n); });
        }
        /* The card was a control panel with no screen on it: the page's ambient canvases live in
           its own grid, which the shell hides (both sat at 0x0), so every chip changed a picture
           nobody could see. The left inline panel moves into the card — the shell's own CSS
           already sizes it (#vizCard canvas.viz-canvas, 190 px) — so the controls show their work. */
        var panels = doc.querySelectorAll("section.card.viz-inline");
        for (var pi = 0; pi < panels.length; pi++) {
          if (panels[pi].closest("#rsVizCard")) continue;
          var ph = panels[pi].querySelector("h3");
          if (ph) ph.style.display = "none";
          var anchor = vc.querySelector(".rs-scenebox") || vc.firstChild;
          vc.insertBefore(panels[pi], anchor);
          break;
        }
        decorateSwatches();
        return;
      }
      if (++tries < 40) window.setTimeout(adoptViz, 250);
    })();

    var pv = $id("presets");
    if (pv && pv.parentNode) pv.parentNode.style.display = "none";
  }

  markAsApp();
  shellCss();
  patchClipboard();
  externalLinks();
  downloadClicks();

  var bootTries = 0;
  function boot() {
    if (!pageReady()) {
      if (++bootTries <= 60) { window.setTimeout(boot, 250); return; }
      report("shim: the page never became ready — shell not built");
      return;
    }
    buildShell();
    buildHome(); buildSessions(); buildStudio(); buildVis(); buildSettings();
    buildSheet();
    mountCards();
    wireHome(); wireVis(); wireSettings();
    wireSearchKeyboard();
    buildModules();
    deviceFacts();
    var ver = $id("rsVer");
    if (ver) ver.textContent = "v" + (deviceFacts().app || "?");
    go("home", { scroll: false });
    syncStudio();
    window.setInterval(tick, 1000);
    doc.addEventListener("pointerdown", wakeChrome, true);
    doc.addEventListener("keydown", wakeChrome, true);
    doc.addEventListener("wheel", wakeChrome, { passive: true });
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden) wakeChrome(); });
    wakeChrome();
    /* the library re-renders on every keystroke and filter; band the rows promptly */
    window.setInterval(function () { if (CUR === "sessions") paintItems(); }, 300);
    tick();
    try { schedLoop(0); } catch (e) { }
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden) tick(); });
    window.addEventListener("beforeunload", function () { native("state", [false, "", ""]); });
    /* first launch: the tour introduces the shape of the app, once */
    if (!prefs.tour) window.setTimeout(tourAuto, 1600);
    report("shim ready | session=" + (sessionTitle() || "none"));
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
    back: function () { return shellBack(); },
    sheet: function () { return SHEET; },
    menu: function () { openSheet(true); return true; },
    nav: function (id) { go(id); return true; },
    fullscreen: function () { enterFullscreen(); },
    fullscreenExit: function () { exitFullscreen(false); },
    guide: function () { openGuide(); },
    check: function () { openCheck(); },
    checkReport: checkReport,
    about: function () { openAbout(); },
    tour: {
      start: tourStart,
      end: function () { tourEnd(true); },
      step: tourStep,
      state: function () { return { on: TOUR.on, i: TOUR.i, n: TOUR.steps.length }; }
    },
    compat: function () { openCheck(); },
    chamber: openChamber,
    sched: drawSched,
    tempo: function (v) { applyTempo(v); },
    update: window.__rsUpdate,
    viz: function () { enterFullscreen(); }
  };
})();
