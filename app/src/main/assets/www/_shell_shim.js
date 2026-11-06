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
  function setMaster(v) { var a = api(); if (a) { try { a.setMaster(v); return; } catch (e) { } }
                          var m = $id("master"); if (m) { m.value = String(v); m.dispatchEvent(new Event("input", { bubbles: true })); } }
  function toast(t)     { var a = api(); if (a) { try { a.toast(String(t)); return; } catch (e) { } } report(t); }

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

  var mqDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function systemPalette() {
    try {
      var raw = native("palette", []);
      if (!raw) return null;
      var p = typeof raw === "string" ? JSON.parse(raw) : raw;
      return (p && p.primary) ? p : null;
    } catch (e) { return null; }
  }

  function applyTheme() {
    var want = prefs.theme || "system";
    var dark = want === "dark" || (want === "system" && (!mqDark || mqDark.matches));
    var html = doc.documentElement;
    html.setAttribute("data-rs-theme", dark ? "dark" : "light");
    /* the page's own canvases and skin tokens follow the app theme */
    var skin = $id("skin");
    if (skin && skin.value !== "forge") {
      skin.value = "forge";
      try { skin.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) { }
    }
    native("chrome", [!dark]);
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

  if (mqDark && mqDark.addEventListener) mqDark.addEventListener("change", applyTheme);
  else if (mqDark && mqDark.addListener) mqDark.addListener(applyTheme);

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
    "  --rs-bg:#0E1211; --rs-surface:#111615; --rs-s1:#171D1B; --rs-s2:#1D2422;",
    "  --rs-s3:#242C2A; --rs-s4:#2C3533;",
    "  --rs-ink:#E6ECEA; --rs-ink2:#C2CFCB; --rs-dim:#A7B5B1; --rs-out:#7E8C88;",
    "  --rs-line:#33403D; --rs-line2:#48565A;",
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
    ".rs-rail{margin:0 0 16px}",
    ".rs-rail h4{margin:0 0 8px;font-size:15px;font-weight:700;letter-spacing:-.01em}",
    ".rs-rail .rs-track{display:flex;overflow-x:auto;gap:10px;padding:0 16px 4px;",
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
    ".rs-screen .rs-searchrow{display:flex;align-items:center;margin:0 0 6px}",
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
    ".rs-pill{flex:0 0 auto;font:600 11px/1 var(--rs-sans);letter-spacing:.06em;text-transform:uppercase;",
    "  padding:7px 11px;border-radius:999px;background:var(--rs-s3);color:var(--rs-ink2)}",
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
    "html[data-rs-ui=full] .rs-hero #rsClock{color:#D2DBD6}",
    "html[data-rs-ui=full] .rs-hero .rs-vol small{color:#C7D2CC}",
    "html[data-rs-ui=full] .rs-hero .rs-sw{color:#D2DBD6}",
    "html[data-rs-ui=full] .rs-hero .rs-sw span{color:#D2DBD6}",
    "html[data-rs-ui=full] .rs-hero .pill{background:#3A332A;color:#F0E7D7}",
    "html[data-rs-ui=full] .rs-hero .rs-pill{background:#3A332A;color:#F0E7D7}",
    "html[data-rs-ui=full] .rs-hero .rs-fab{width:68px;height:68px;border:0;position:relative;",
    "  background-image:url(ui/knob-calm.webp);background-size:cover;background-position:center;",
    "  box-shadow:0 7px 18px rgba(0,0,0,.55);transition:transform .28s ease}",
    "html[data-rs-ui=full][data-rs-accent=dusk] .rs-hero .rs-fab{background-image:url(ui/knob-dusk.webp)}",
    "html[data-rs-ui=full][data-rs-accent=sage] .rs-hero .rs-fab{background-image:url(ui/knob-sage.webp)}",
    "html[data-rs-ui=full][data-rs-accent=sand] .rs-hero .rs-fab{background-image:url(ui/knob-sand.webp)}",
    "html[data-rs-ui=full][data-rs-accent=slate] .rs-hero .rs-fab{background-image:url(ui/knob-slate.webp)}",
    "html[data-rs-ui=full] .rs-fab svg{display:none}",
    "html[data-rs-ui=full].rs-playing .rs-hero .rs-fab{transform:rotate(34deg)}",
    "html[data-rs-ui=full] .rs-fab::after{content:\"\";position:absolute;left:50%;bottom:-7px;width:8px;height:8px;",
    "  margin-left:-4px;border-radius:50%;background:var(--rs-s4);border:1px solid rgba(0,0,0,.5)}",
    "html[data-rs-ui=full].rs-playing .rs-fab::after{background:var(--rs-live);box-shadow:0 0 10px var(--rs-live)}",
    "html[data-rs-ui=full] .rs-transport #rsStop{width:46px;height:46px;border:0;border-radius:50%;",
    "  background-image:url(ui/btn-stop.webp);background-size:cover;background-position:center;",
    "  box-shadow:0 4px 12px rgba(0,0,0,.5)}",
    "html[data-rs-ui=full] #rsStop svg{display:none}",
    "html[data-rs-ui=full] .rs-vol input[type=range]{height:44px}",
    "html[data-rs-ui=full] .rs-vol input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:4px;",
    "  background:linear-gradient(180deg,#1b1814,#3a332a 45%,#100e0c);box-shadow:inset 0 1px 2px #000}",
    "html[data-rs-ui=full] .rs-vol input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;",
    "  height:30px;margin-top:-11px;border-radius:4px;border:1px solid #0a0908;",
    "  background:linear-gradient(180deg,#e7dcc8,#9d8f77 52%,#5c5244)}",
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
    /* the same faceplate material on the chrome: player bar, app bar, nav, viewer controls */
    "html[data-rs-ui=full] #rsMini{background-image:url(ui/strip.webp);background-size:cover;",
    "  background-position:center;background-color:#141210;border:1px solid #2A2318;border-radius:14px;",
    "  padding:6px 8px;color:#F2F6F4}",
    "html[data-rs-ui=full] #rsMini b{color:#F6FAF8}",
    "html[data-rs-ui=full] #rsMini span{color:#C9D3CE}",
    "html[data-rs-ui=full] #rsMiniPlay{background-image:url(ui/knob-calm.webp);background-size:cover;",
    "  background-position:center;box-shadow:0 3px 9px rgba(0,0,0,.55);position:relative}",
    "html[data-rs-ui=full][data-rs-accent=dusk] #rsMiniPlay{background-image:url(ui/knob-dusk.webp)}",
    "html[data-rs-ui=full][data-rs-accent=sage] #rsMiniPlay{background-image:url(ui/knob-sage.webp)}",
    "html[data-rs-ui=full][data-rs-accent=sand] #rsMiniPlay{background-image:url(ui/knob-sand.webp)}",
    "html[data-rs-ui=full][data-rs-accent=slate] #rsMiniPlay{background-image:url(ui/knob-slate.webp)}",
    "html[data-rs-ui=full] #rsMiniPlay svg{display:none}",
    "html[data-rs-ui=full] #rsMiniStop{background-image:url(ui/btn-stop.webp);background-size:cover;",
    "  background-position:center;border:0;box-shadow:0 3px 9px rgba(0,0,0,.5)}",
    "html[data-rs-ui=full] #rsMiniStop svg{display:none}",
    "html[data-rs-ui=full] #rsBar{background-image:url(ui/strip.webp);background-size:cover;",
    "  background-position:center top;background-color:transparent}",
    "html[data-rs-ui=full] #rsNav{background-image:url(ui/strip.webp);background-size:cover;",
    "  background-position:center bottom;background-color:#141210}",
    "html[data-rs-ui=full] #rsNav button[aria-selected=true]{background:rgba(224,185,111,.14)}",
    "html[data-rs-ui=full] #rsNav button{color:#C9D3CE}",
    "html[data-rs-ui=full] #rsNav button[aria-selected=true]{color:#F8F1E1}",
    "html[data-rs-ui=full] #rsFsCtl .rs-fs-btns button{background-image:url(ui/knob-calm.webp);",
    "  background-size:cover;background-position:center;border:0}",
    "html[data-rs-ui=full] #rsFsCtl .rs-fs-btns button svg,html[data-rs-ui=full] #rsFsCtl .rs-fs-btns button{",
    "  font-size:0}",
    "html[data-rs-ui=full] #rsFsCtl .rs-fs-stop{background-image:url(ui/btn-stop.webp)}",

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
    "  padding:8px 8px 8px 14px;border-radius:16px;background:var(--rs-s2);border:1px solid var(--rs-line)}",
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

    /* --------------------------------------------------------------- sheet --- */
    "#rsScrim{position:fixed;top:0;right:0;bottom:0;left:0;z-index:85;background:rgba(6,9,8,.55);" +
    "  opacity:0;pointer-events:none;transition:opacity .22s var(--rs-ease)}" +
    "html.rs-sheet #rsScrim{opacity:1;pointer-events:auto}" +
    "#rsSheet{position:fixed;left:0;right:0;bottom:0;z-index:86;display:flex;flex-direction:column;",
    "  background:var(--rs-s2);color:var(--rs-ink);border-radius:var(--rs-r-sheet) var(--rs-r-sheet) 0 0;",
    "  border-top:1px solid var(--rs-line);box-shadow:0 -18px 44px rgba(0,0,0,.45);",
    "  transform:translateY(110%);transition:transform .26s var(--rs-ease);",
    "  padding-bottom:calc(8px + " + SAFE_B + ");max-height:82vh}",
    "#rsSheet.rs-open{transform:none}",
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
    "html.rs-app #toast{bottom:auto !important;top:calc(10px + " + SAFE_T + ") !important;",
    "  left:16px !important;right:16px !important;z-index:120 !important;border-radius:var(--rs-r-sm)}",
    "html.rs-app #prog:not([hidden]){display:block !important;position:fixed;left:14px;right:14px;",
    "  bottom:calc(150px + " + SAFE_B + ");height:8px;z-index:78;accent-color:var(--rs-pri)}",

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
    ".rs-tile > * + *{margin-top:8px}",,
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
    ".rs-app .cym .cym-top{padding-top:calc(10px + " + SAFE_T + ") !important;",
    "  align-items:center !important}",
    ".rs-app .cym .cym-dock{bottom:calc(12px + " + SAFE_B + ") !important}",
    ".rs-app .cym .cym-actions{gap:8px !important;flex-wrap:wrap;justify-content:flex-end}",
    ".rs-app .cym .cym-actions > button{min-height:44px;min-width:44px;border-radius:12px;",
    "  font-size:13px;padding:0 12px}",
    ".rs-app .cym .cym-back{order:-1;display:inline-flex;align-items:center;gap:6px;",
    "  background:rgba(20,17,13,.55) !important;color:#fff !important;border-color:rgba(255,255,255,.3) !important}",
    ".rs-app .cym .cym-tempo{min-width:44px;font-size:16px !important;line-height:1}",
    ".rs-app .cym .cym-tone{max-width:56vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    /* the top-right row: even 44px pills, one line, no stray digits */
    ".rs-app .cym .cym-actions{gap:6px !important;flex-wrap:nowrap !important;align-items:center}",
    ".rs-app .cym .cym-actions > button{min-height:44px;height:44px;min-width:44px;padding:0 13px;",
    "  border-radius:999px;font:600 12.5px/1 var(--rs-sans);background:rgba(18,14,10,.55) !important;",
    "  color:#F2E6D8 !important;border:1px solid rgba(255,255,255,.22) !important}",
    ".rs-app .cym .cym-live{display:none}",
    ".rs-app .cym .cym-tone{max-width:44vw}",
    /* the gesture hint lives behind a ? */
    ".rs-app .cym .cym-note{display:none}",
    ".rs-cym-info{position:absolute;right:12px;top:calc(64px + " + SAFE_T + ");z-index:6;",
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
      sub: function () { return sessionTitle() || "Binaural, tones and noise — on this device"; } },
    { id: "sessions", label: "Sessions", icon: "list", title: "Sessions",
      sub: function () { return "The built-in library"; } },
    { id: "studio", label: "Studio", icon: "sliders", title: "Studio",
      sub: function () { return "Shape the schedule"; } },
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

    return app;
  }

  function go(id, opts) {
    if (!screenEls[id]) return;
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
      '    <span class="rs-pill rs-live" id="rsMode">idle</span></div>' +
      '  <div class="rs-transport">' +
      '    <button class="rs-fab" id="rsPlay" aria-label="Play">' + svgFill("play") + '</button>' +
      '    <div class="rs-vol"><small>Volume</small>' +
      '      <input id="rsVol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Volume"></div>' +
      '    <button class="rs-ico" id="rsStop" aria-label="Stop and rewind">' + svg("stop") + '</button>' +
      '  </div>' +
      '  <div class="rs-transport" style="margin-top:10px">' +
      '    <span id="rsClock" aria-live="polite">0:00 / 0:00</span>' +
      '    <label class="rs-sw" style="flex:1 1 auto;min-height:40px;padding:0">' +
      '      <span class="rs-swt"><span style="font-size:12.5px">Loop</span></span>' +
      '      <input type="checkbox" id="rsLoop" checked><span class="rs-track" aria-hidden="true"></span></label>' +
      '  </div>' +
      '</div>' +
      '<div class="rs-states" id="rsStates"></div>' +
      '<section class="card rs-build" id="rsBuild" aria-labelledby="rsBuildH">' +
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
    if (ts - SCHED.last < 66) return;
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

    $id("rsPlay").addEventListener("click", function () { pageToggle(); pushState(true); });
    $id("rsStop").addEventListener("click", function () { pageStop(); pushState(true); });

    var vol = $id("rsVol");
    vol.addEventListener("input", function () { setMaster(parseFloat(vol.value)); });
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
    items.slice(0, 12).forEach(function (hit) {
      var b = doc.createElement("button");
      b.className = "rs-card";
      b.type = "button";
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
      '<section class="card" id="rsBrowse" aria-labelledby="rsBrowseH">' +
      '  <h3 id="rsBrowseH" class="sr-only">Sessions</h3>' +
      '  <div id="rsModules"></div>' +
      '  <div class="rs-searchrow"><button class="rs-chipbtn" id="rsFilterBtn" aria-expanded="false" ' +
      '    aria-controls="rsFilterWrap">Filters</button></div>' +
      '  <div id="rsFilterWrap"></div></section>' +
      '<section class="card" id="rsQuick" aria-labelledby="rsQuickH">' +
      '  <h3 id="rsQuickH">Quick picks</h3></section>' +
      '<div class="rs-pad"></div>';
  }

  /* ================================================================= studio === */

  function syncStats() {
    var box = $id("rsStats");
    if (!box) return;
    var st = pState(); if (!st) { box.innerHTML = ""; return; }
    var vs = (st.schedule && st.schedule.voices) || [];
    var entries = vs.reduce(function (a, v) { return a + (v.entries ? v.entries.length : 0); }, 0);
    var mode = st.playing ? "playing" : (st.mode || "idle");
    var html = '<div class="rs-stat"><b>' + vs.length + '</b><span>voices</span></div>' +
      '<div class="rs-stat"><b>' + entries + '</b><span>entries</span></div>' +
      '<div class="rs-stat"><b>' + esc(mode) + '</b><span>state</span></div>';
    if (box.dataset.k !== html) { box.dataset.k = html; box.innerHTML = html; }
  }

  function buildStudio() {
    screenEls.studio.innerHTML =
      '<div class="rs-pad"></div>' +
      '<div class="rs-stats" id="rsStats" aria-live="polite"></div>' +
      '<section class="card" id="rsVoices" aria-labelledby="rsVoicesH">' +
      '  <h3 id="rsVoicesH">The sound</h3></section>' +
      '<details class="tool rs-mod" id="rsLiveDet"><summary>Live tools</summary>' +
      '  <div class="body"><section class="card" id="rsLive" aria-label="Live tools"></section></div>' +
      '</details>' +
      '<details class="tool rs-mod" id="rsFilesDet"><summary>Files &amp; export</summary>' +
      '  <div class="body"><section class="card" id="rsFiles" aria-label="Files and export"></section></div>' +
      '</details>' +
      '<div class="rs-pad"></div>';
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

  var follow = true;

  function buildVis() {
    screenEls.vis.innerHTML =
      '<div class="rs-pad"></div>' +
      '<section class="card rs-cta" aria-labelledby="rsCymH">' +
      '  <div class="rs-cta-top"><span class="rs-cta-art">' + svg("chamber", 26) + '</span>' +
      '    <div><h3 id="rsCymH">Cymatic chamber</h3>' +
      '    <p class="rs-cta-sub">Full visual experience</p></div></div>' +
      '  <button class="rs-btn rs-filled" id="rsChamber" style="width:100%">Open the chamber</button>' +
      '</section>' +
      '<section class="card rs-cta" aria-labelledby="rsFocusH">' +
      '  <div class="rs-cta-top"><span class="rs-cta-art">' + svg("moon", 26) + '</span>' +
      '    <div><h3 id="rsFocusH">Focus view</h3>' +
      '    <p class="rs-cta-sub">Gentle visuals</p></div></div>' +
      '  <button class="rs-btn rs-tonal" id="rsFocusGo" style="width:100%">Open focus view</button>' +
      '</section>' +
      '<section class="card" aria-labelledby="rsFollowH">' +
      '  <h3 id="rsFollowH">Follow the session</h3>' +
      '  <label class="rs-sw"><span class="rs-swt">' +
      '    <b>Bind the chamber to what plays</b>' +
      '    <span>The carrier picks the plate mode, the beat sets the pace.</span></span>' +
      '    <input type="checkbox" id="rsFollow" checked><span class="rs-track" aria-hidden="true"></span></label>' +
      '  <div class="rs-map" id="rsMap" aria-live="polite">No session loaded.</div>' +
      '  <div class="rs-chips" id="rsScenes" role="group" aria-label="Scenes"></div>' +
      '  <div class="rs-chips" id="rsMedia" role="group" aria-label="Medium"></div>' +
      '  <div class="rs-seg" id="rsVisToggles" role="group" aria-label="Layers">' +
      '    <button data-k="sand" aria-pressed="true">Sand</button>' +
      '    <button data-k="lines" aria-pressed="true">Lines</button>' +
      '    <button data-k="dust" aria-pressed="true">Dust</button></div>' +
      '</section>' +
      '<section class="card" id="rsVizCard" aria-labelledby="rsVizH">' +
      '  <h3 id="rsVizH">Ambient panels</h3>' +
      '  <p class="rs-hint">Held under the flash threshold — a fast rate drifts slower and says so.</p></section>' +
      '<div class="rs-pad"></div>';
  }

  function cymApi() {
    var c = window.ResonanceCymatics;
    return c && (c.api || c);
  }

  function syncVis() {
    var map = $id("rsMap");
    if (!map) return;
    var shape = sessionShape();
    var plan = planFor(shape);
    if (!plan) { map.textContent = "No session loaded — pick one on Home and the chamber will follow it."; return; }
    var mode = "—";
    var c = cymApi();
    try {
      if (c && c.debugState) {
        var s = c.debugState();
        if (s && s.nearest !== undefined) mode = s.nearest;
      }
    } catch (e) { }
    var why = plan.why.charAt(0).toUpperCase() + plan.why.slice(1);
    map.innerHTML = "carrier <b>" + shape.carrier.toFixed(1) + " Hz</b> · rate <b>" +
      shape.beat.toFixed(1) + " Hz</b> · " + plan.band + "<br>" + why +
      "<br>plate mode <b>" + mode + "</b>";
    $$("#rsScenes button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-scene") === plan.scene ? "true" : "false");
    });
    $$("#rsMedia button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-medium") === plan.medium ? "true" : "false");
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
      follow = this.checked;
      if (follow) syncVis();
    });
    $id("rsChamber").addEventListener("click", openChamber);
  }

  function applyVis(o) {
    var c = cymApi(); if (!c) return;
    try {
      if (o.scene) c.scene(o.scene);
      var p = {};
      if (o.medium) p.medium = o.medium;
      ["sand", "lines", "dust"].forEach(function (k) { if (o[k] !== undefined) p[k] = o[k]; });
      if (follow) p.src = "session";
      c.setPrefs(p);
    } catch (e) { }
    syncVis();
  }

  var cymHooked = false;
  function chamberChrome() {
    if (cymHooked) return;
    var root = doc.getElementById("cymRoot");
    if (!root) return;
    var act = root.querySelector(".cym-actions");
    if (!act) return;
    cymHooked = true;
    var back = doc.createElement("button");
    back.id = "rsCymBack";
    back.className = "cym-back";
    back.innerHTML = "\u2039 Back";
    back.setAttribute("aria-label", "Back to Resonance Studio");
    back.onclick = function () { window.ResonanceCymatics.close(); };
    act.insertBefore(back, act.firstChild);

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
    var stop = doc.createElement("button");
    stop.textContent = "Stop";
    stop.setAttribute("aria-label", "Stop and rewind the session");
    stop.onclick = function () { pageStop(); pushState(true); };
    act.insertBefore(stop, act.querySelector("#cymClose"));
    act.insertBefore(info, act.querySelector("#cymClose"));
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

  function openChamber() {
    var c = window.ResonanceCymatics;
    if (!c) { toast("The chamber is still starting — try again."); return; }
    var plan = planFor(sessionShape());
    try {
      if (plan && c.api && c.api.scene) c.api.scene(plan.scene);
      if (c.api && c.api.setPrefs) c.api.setPrefs({ src: follow ? "session" : "manual" });
    } catch (e) { }
    c.open();
    window.setTimeout(chamberChrome, 60);
  }

  /* =============================================================== settings === */

  function buildSettings() {
    screenEls.settings.innerHTML =
      '<div class="rs-pad"></div>' +
      '<section class="card" aria-labelledby="rsApprH">' +
      '  <h3 id="rsApprH">Appearance</h3>' +
      '  <div class="rs-seg" id="rsUi" role="group" aria-label="Interface">' +
      '    <button data-u="full" aria-pressed="true">Full</button><button data-u="minimal" aria-pressed="false">Minimal</button></div>' +
      '  <div class="rs-seg" id="rsTheme" role="group" aria-label="Theme">' +
      '    <button data-t="system" aria-pressed="true">System</button><button data-t="dark" aria-pressed="false">Dark</button>' +
      '    <button data-t="light" aria-pressed="false">Light</button></div>' +
      '  <div class="rs-swatches" id="rsAccents" role="group" aria-label="Theme colour"></div>' +
      '  <label class="rs-sw"><span class="rs-swt"><b>Accent from wallpaper</b>' +
      '    <span>Android 12 and later. Off uses the Resonance teal.</span></span>' +
      '    <input type="checkbox" id="rsAccent"><span class="rs-track" aria-hidden="true"></span></label>' +
      '  <button class="rs-mrow" data-act="focus">' + svg("moon", 22) +
      '    <span class="rs-mtxt"><b>Focus view</b><span id="rsFocusSub">An ambient screen, gently following the tone</span></span>' + svg("chev", 18) + '</button>' +
      '</section>' +
      '<section class="card" aria-labelledby="rsHelpH">' +
      '  <h3 id="rsHelpH">Help &amp; about</h3>' +
      '  <button class="rs-mrow" data-act="guide">' + svg("book", 22) +
      '    <span class="rs-mtxt"><b>Quick guide</b><span>How to use all of this</span></span>' + svg("chev", 18) + '</button>' +
      '  <button class="rs-mrow" data-act="check">' + svg("shield", 22) +
      '    <span class="rs-mtxt"><b>Check device</b><span>What this phone reports</span></span>' + svg("chev", 18) + '</button>' +
      '  <button class="rs-mrow" data-act="about">' + svg("info", 22) +
      '    <span class="rs-mtxt"><b>About Resonance Studio</b><span>Version and licences</span></span>' + svg("chev", 18) + '</button>' +
      '  <button class="rs-mrow" data-act="upd">' + svg("down", 22) +
      '    <span class="rs-mtxt"><b>Check for updates</b><span>Asks moddys.net</span></span>' + svg("chev", 18) + '</button>' +
      '</section>' +
      '<section class="card" aria-labelledby="rsDataH">' +
      '  <h3 id="rsDataH">Data</h3>' +
      '  <div class="rs-kv"><b>Saved files</b><span>Downloads/Resonance Studio</span></div>' +
      '  <div class="rs-kv"><b>Network</b><span>update check + help pages</span></div>' +
      '  <div class="rs-kv"><b>Version</b><span id="rsVer">—</span></div>' +
      '  <p class="rs-note">Everything is synthesised on this device. No account, no upload, no analytics.</p>' +
      '</section>' +
      '<div class="rs-pad"></div>';
  }

  function wireSettings() {
    function paintTheme() {
      $$("#rsTheme button").forEach(function (b) {
        b.setAttribute("aria-pressed", (prefs.theme || "system") === b.getAttribute("data-t") ? "true" : "false");
      });
    }
    $$("#rsTheme button").forEach(function (b) {
      b.addEventListener("click", function () {
        prefs.theme = b.getAttribute("data-t"); savePrefs(); applyTheme(); paintTheme();
      });
    });
    paintTheme();
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
      else if (a === "focus") openFocus();
      else if (a === "upd") { toast("Checking for updates…"); native("checkUpdate", []); }
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
    function apply(off, animate) {
      sheetEl.classList.toggle("rs-drag", animate === false);
      sheetEl.style.transform = "translateY(" + off + "px)";
      y = off;
    }
    function setOpen(open) {
      SHEET.open = !!open;
      sheetEl.classList.toggle("rs-open", SHEET.open);
      doc.documentElement.classList.toggle("rs-sheet", SHEET.open);
      apply(SHEET.open ? 0 : height(), true);
      doc.documentElement.classList.toggle("rs-locked", SHEET.open);
      var ov = $id("rsOverflow");
      if (ov) ov.setAttribute("aria-expanded", SHEET.open ? "true" : "false");
      if (SHEET.open) markBack();
    }
    openSheet = function (open) { if (!open && !SHEET.open) return; setOpen(open); };

    function down(ev) {
      if (ev.isPrimary === false) return;
      dragging = true; startY = ev.clientY; startOff = y;
      sheetEl.classList.add("rs-drag");
    }
    function move(ev) {
      if (!dragging) return;
      var next = Math.min(height(), Math.max(0, startOff + (ev.clientY - startY)));
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
      if (wasOpen) unmarkBackTop();
      if (a === "guide") openGuide();
      else if (a === "check") openCheck();
      else if (a === "about") openAbout();
      else if (a === "upd") { toast("Checking for updates…"); native("checkUpdate", []); }
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
    /* inside fullscreen the layer is already on the history stack; pushing again
       would make closing the overlay pop the whole view away */
    if (!FS.on) markBack();
    var x = ov.querySelector("[data-ov-x]");
    if (x) { try { x.focus(); } catch (e) { } }
  }
  function closeOverlay(ov, fromPop) {
    ov.classList.remove("rs-ov-on");
    doc.documentElement.classList.toggle("rs-locked", anyOverlayOpen());
    if (!fromPop && !FS.on) unmarkBackTop();
  }
  function anyOverlayOpen() {
    for (var i = 0; i < overlays.length; i++) if (overlays[i].classList.contains("rs-ov-on")) return true;
    return FS.on;
  }

  var backStack = 0;
  function markBack() {
    try { history.pushState({ rsLayer: ++backStack }, ""); } catch (e) { }
  }
  function unmarkBackTop() {
    if (history.state && history.state.rsLayer) { try { history.back(); } catch (e) { } }
  }
  window.addEventListener("popstate", function () {
    if (SHEET.open) { openSheet(false); return; }
    var top = null;
    for (var i = overlays.length - 1; i >= 0; i--) {
      if (overlays[i].classList.contains("rs-ov-on")) { top = overlays[i]; break; }
    }
    if (top) { closeOverlay(top, true); return; }
    if (FS.on) { exitFullscreen(true); return; }
  });

  /* ------------------------------------------------------------- quick guide --- */

  function openGuide() {
    var ov = doc.getElementById("rsGuide");
    if (!ov) {
      ov = buildOverlay("rsGuide", "Quick guide",
        '<h4>What this is</h4>' +
        '<p>A tone, beat and noise studio that runs entirely on this device. Everything is ' +
        'synthesised live — nothing streams, nothing is uploaded, there is no account. The ' +
        'built-in sessions are ready to play; everything about them can be changed.</p>' +
        '<h4>Start here</h4>' +
        '<ul>' +
        '<li><b>Home</b> — tap Sleep, Focus, Relax or Wake and it plays.</li>' +
        '<li><b>Build a tone</b> — set a carrier and a beat, pick a bed, press play.</li>' +
        '<li><b>Sessions</b> — the whole library, searchable. Tap a row to load it.</li>' +
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
    showOverlay(ov);
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

  function openCheck() {
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
    showOverlay(ov);
  }

  function openAbout() {
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
        if (ev.target.closest("#rsAboutUpd")) { toast("Checking for updates…"); native("checkUpdate", []); }
      });
    }
    showOverlay(ov);
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
      "#rsFsCtl .rs-fs-meta{gap:18px}",
      "#rsFsTop{position:absolute;top:calc(10px + " + SAFE_T + ");left:14px;right:12px;display:flex;",
      "  align-items:center;gap:10px;color:rgba(255,255,255,.75);font:13px/1.3 inherit;",
      "  pointer-events:none;transition:opacity .25s;z-index:2}",
      "#rsFsTop .rs-fs-title{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;",
      "  text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.8)}",
      "#rsFsTop button{pointer-events:auto;width:48px;height:48px;border-radius:50%;",
      "  border:1px solid rgba(255,255,255,.28);background:rgba(20,17,13,.42);color:#fff;",
      "  font-size:17px;cursor:pointer}",
      "#rsFsCtl{position:absolute;left:0;right:0;bottom:calc(14px + " + SAFE_B + ");display:flex;",
      "  flex-direction:column;align-items:center;gap:10px;z-index:2;pointer-events:none;",
      "  transition:opacity .25s}",
      "#rsFsCtl .rs-fs-meta{pointer-events:auto;display:flex;align-items:center;gap:12px;",
      "  width:min(340px,84vw);color:rgba(255,255,255,.8);font:13px/1 inherit}",
      "#rsFsCtl #rsFsTime{font-variant-numeric:tabular-nums;flex:0 0 auto}",
      "#rsFsCtl #rsFsVol{flex:1 1 auto;height:32px;-webkit-appearance:none;background:transparent}",
      "#rsFsCtl #rsFsVol::-webkit-slider-runnable-track{height:4px;border-radius:2px;",
      "  background:rgba(255,255,255,.32)}",
      "#rsFsCtl #rsFsVol::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;",
      "  margin-top:-7px;border-radius:50%;background:#fff}",
      "#rsFsCtl .rs-fs-btns{display:flex;gap:16px;pointer-events:none}",
      "#rsFsCtl button{pointer-events:auto;border-radius:50%;border:1px solid rgba(255,255,255,.28);",
      "  background:rgba(20,17,13,.42);color:#fff;cursor:pointer}",
      "#rsFsCtl .rs-fs-play{width:58px;height:58px;font-size:20px}",
      "#rsFsCtl .rs-fs-stop{width:46px;height:46px;font-size:14px}",
      /* focus view: the same stage, but with a way to change the visualisation */
      "#rsFocusBar{position:absolute;left:0;right:0;bottom:calc(132px + " + SAFE_B + ");display:none;z-index:2;",
      "  align-items:center;justify-content:center;gap:6px;padding:0 14px;pointer-events:none}",
      "html.rs-focus #rsFocusBar{display:flex}",
      "#rsFocusBar button{pointer-events:auto;min-width:48px;height:48px;border-radius:999px;",
      "  border:1px solid rgba(255,255,255,.28);background:rgba(0,0,0,.42);color:#F2F6F4;",
      "  font:600 15px/1 var(--rs-sans);-webkit-appearance:none}",
      "#rsFocusBar #rsFocusName{pointer-events:auto;min-width:0;max-width:46%;padding:0 12px;height:48px;",
      "  display:flex;align-items:center;justify-content:center;border-radius:999px;background:rgba(0,0,0,.42);",
      "  color:#F2F6F4;font:600 13px/1 var(--rs-sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#rsFocusBar #rsFocusPick{min-width:0;padding:0 16px;font-size:13px}",
      "html.rs-fs .rs-fs-host .viz-badge{bottom:calc(92px + " + SAFE_B + ") !important;opacity:1;",
      "  color:#fff !important;background:rgba(10,8,6,.72) !important;padding:4px 9px;border-radius:999px}",
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
      '<div id="rsFsTop"><span class="rs-fs-title" id="rsFsTitle"></span>' +
      '<button data-rs="fsExit" aria-label="Close the visualiser">✕</button></div>' +
      '<div id="rsFocusBar"><button data-rs="fPrev" aria-label="Previous visualisation">\u2039</button>' +
      '<span id="rsFocusName">Visualisation</span>' +
      '<button data-rs="fNext" aria-label="Next visualisation">\u203a</button>' +
      '<button data-rs="fPick">Change</button></div>' +
      '<div id="rsFsCtl"><div class="rs-fs-meta"><span id="rsFsTime" aria-live="polite">0:00 / 0:00</span>' +
      '<input id="rsFsVol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Volume"></div>' +
      '<div class="rs-fs-btns">' +
      '<button class="rs-fs-play" data-rs="fsPlay" aria-label="Play or pause">▶</button>' +
      '<button class="rs-fs-stop" data-rs="fsStop" aria-label="Stop">■</button></div></div>';
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
      if (act === "fsStage") { if (FSWAS.hidden) armHide(); else hideChrome(); return; }
    });
    return fs;
  }

  /* ------------------------------------------------------------- focus view --- */
  /* The gentle sibling of the chamber: the page's own ambient panels, full screen,
     with the visualisation switchable right there. The chamber is the instrument;
     this is for lying still and watching. */
  var FOCUS = { on: false, preset: "" };
  var FOCUS_DEFAULT = "quiet-tide";

  function focusPresets() {
    var P = window.GnauralVizPresets;
    return (P && P.LIST) || [];
  }

  function focusName(id) {
    var l = focusPresets(), i;
    for (i = 0; i < l.length; i++) if (l[i].id === id) return l[i].name;
    return "Visualisation";
  }

  function applyFocusPreset(id, quiet) {
    var v = window.ResonanceViz && window.ResonanceViz.api;
    if (!v || !id) return;
    FOCUS.preset = id;
    prefs.focusPreset = id; savePrefs();
    try { v.applyPreset(id); v.enable(true); } catch (e) { }
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

  function openFocusPick() {
    var ov = doc.getElementById("rsFocusPick");
    if (!ov) {
      ov = buildOverlay("rsFocusPick", "Visualisation", '<div class="rs-chips" id="rsFocusList"></div>');
      var box = ov.querySelector("#rsFocusList");
      focusPresets().forEach(function (p) {
        var b = doc.createElement("button");
        b.type = "button";
        b.textContent = p.name;
        b.title = p.blurb || "";
        b.setAttribute("data-fp", p.id);
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () { applyFocusPreset(p.id); closeOverlay(ov); });
        box.appendChild(b);
      });
    }
    $$("#rsFocusList button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-fp") === FOCUS.preset ? "true" : "false");
    });
    showOverlay(ov);
  }

  function openFocus() {
    FOCUS.on = true;
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

  function syncFs() {
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

  var UPD = { state: "unknown", latest: null };
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
    available: function (info) { UPD.latest = info || {}; UPD.state = "available"; try { updShow(); } catch (e) { } return UPD.state; },
    none: function (latest) { UPD.state = "current"; UPD.latest = latest ? { version: latest } : null; return UPD.state; },
    failed: function (why) { UPD.state = "failed"; UPD.why = String(why || ""); return UPD.state; },
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
    var vol = $id("rsVol");
    if (vol) { var v = masterNow(); if (Math.abs(parseFloat(vol.value) - v) > 0.005) vol.value = String(v); }
    var lp = $id("rsLoop"), lel = $id("loop");
    if (lp && lel && lp.checked !== lel.checked) lp.checked = lel.checked;
    try { tempoGuard(); } catch (e) { }
  }

  function syncMini() {
    var mini = $id("rsMini");
    if (!mini) return;
    var sess = sessionTitle();
    var show = !!sess && CUR !== "home";
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

  function tick() {
    applyInsets();
    if (CUR === "studio") syncStats();
    syncHero();
    syncMini();
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
    var build = cardOf("#rsBuild");
    if (build) {
      var stVoices = $id("rsVoices");
      if (stVoices && stVoices.parentNode) stVoices.parentNode.insertBefore(build, stVoices);
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
      var inStudio = $id("rsVoices");
      if (inStudio && inStudio.parentNode) inStudio.parentNode.insertBefore(fold, inStudio.nextSibling);
      else screenEls.studio.appendChild(fold);
    }

    var search = $id("search");
    var srow = $(".rs-searchrow");
    if (search && srow) srow.insertBefore(search, srow.firstChild);
    var filters = $id("filters");          // the chips themselves, not their card
    if (filters) $id("rsFilterWrap").appendChild(filters);
    var browse = cardOf("#plist");
    if (browse) $id("rsBrowse").appendChild(browse);
    var quick = cardOf("#quickpick");
    if (quick) $id("rsQuick").appendChild(quick);

    var voices = cardOf("#voicelist");
    if (voices) $id("rsVoices").appendChild(voices);
    var vh = voices && voices.querySelector("h3");
    if (vh) {
      var cnt = vh.querySelector(".cnt");
      vh.textContent = "Layers";
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
        $id("rsVizCard").appendChild(vc);
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
    syncStats();
    window.setInterval(tick, 1000);
    tick();
    try { schedLoop(0); } catch (e) { }
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden) tick(); });
    window.addEventListener("beforeunload", function () { native("state", [false, "", ""]); });
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
    sheet: function () { return SHEET; },
    menu: function () { openSheet(true); return true; },
    nav: function (id) { go(id); return true; },
    fullscreen: function () { enterFullscreen(); },
    fullscreenExit: function () { exitFullscreen(false); },
    guide: function () { openGuide(); },
    check: function () { openCheck(); },
    checkReport: checkReport,
    about: function () { openAbout(); },
    compat: function () { openCheck(); },
    chamber: openChamber,
    sched: drawSched,
    tempo: function (v) { applyTempo(v); },
    update: window.__rsUpdate,
    viz: function () { enterFullscreen(); }
  };
})();
