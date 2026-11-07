#!/usr/bin/env python3
"""Drive the Resonance app shell against the real bundled page in a real browser.

The shim is injected at runtime by the Android shell, so it can be exercised here without
a device: serve app/src/main/assets/www, load the studio, inject _shell_shim.js exactly
as the shell does, stub the native bridge (recording every call), and drive the phone UI
with real pointer/keyboard input.

The checks are the app's acceptance gate: navigation, the hero transport, the library,
the studio, the visualise section's deterministic binding, the settings surface, the
overlays, the file paths, and the shell's own contract (no page errors, no off-origin
requests, no undersized tap targets, no horizontal overflow).

Exit code is nonzero when any check fails, so CI treats this as the gate.
Usage:
    python tools/shim_harness.py                 # phone viewport, bundled assets
    python tools/shim_harness.py --shots DIR     # also write screenshots
    python tools/shim_harness.py --url URL       # drive a different page build
"""
import argparse
import functools
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
WWW = os.path.join(PROJECT, "app", "src", "main", "assets", "www")
SHIM = open(os.path.join(WWW, "_shell_shim.js"), encoding="utf-8").read()

BRIDGE = r"""
(() => {
  if (window.ResonanceJs) return;
  const calls = [];
  window.__calls = calls;
  const rec = (m, args) => { calls.push({ m: m, a: args }); };
  let save = null;
  const b64len = (s) => Math.floor(String(s).replace(/=+$/, "").length * 3 / 4);
  window.ResonanceJs = {
    state: function (p, s, e) { rec("state", [p, s, e]); },
    log: function (m) { rec("log", [m]); },
    toast: function (t) { rec("toast", [t]); },
    url: function (u) { rec("url", [u]); },
    dismissKeyboard: function () { rec("dismissKeyboard", []); },
    copy: function (t) { rec("copy", [t]); return true; },
    device: function () {
      return JSON.stringify({
        manufacturer: "Harness", model: "Phone", api: 33, release: "13",
        app: "2.0.0-beta", webview: "com.google.android.webview 120.0.6099.43",
        engine: "com.google.android.webview 120.0.6099.43", engineLabel: "WebView",
        platform: "android", osName: "Android", notifications: true, density: "420",
        system: "Android 13 (API 33)",
        compat: { supported: true, recommended: true, system: "Android 13 (API 33)",
                  hardLabel: "Android 8.0 (API 26)", softLabel: "Android 11 (API 30)",
                  engineNote: "note" }
      });
    },
    palette: function () {
      return JSON.stringify({ primary: "#8AD8C8", onPrimary: "#003731",
                              container: "#12463F", onContainer: "#A9F2E4" });
    },
    fileStart: function (name, mime) { rec("fileStart", [name, mime]); save = { name: name, total: 0 }; return true; },
    fileChunk: function (b64) { if (!save) return false; save.total += b64len(b64); return true; },
    fileEnd: function () {
      const n = save ? save.name : "?";
      const t = save ? save.total : 0;
      rec("fileEnd", [t]);
      save = null;
      return "ok:Downloads/Resonance Studio/" + n;
    },
    saveAsset: function (asset, name) { rec("saveAsset", [asset, name]); return "ok:Downloads/Resonance Studio/" + name; },
    updateApp: function (u, v, s) { rec("updateApp", [u, v, s]); },
    checkUpdate: function () { rec("checkUpdate", []); }
  };
})();
"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=WWW)
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, "http://127.0.0.1:%d/app/index.html" % port


class Suite:
    def __init__(self, page, shots_dir=None):
        self.page = page
        self.shots = shots_dir
        self.passed = 0
        self.failed = 0
        self.failures = []

    def check(self, name, cond, detail=""):
        if cond:
            self.passed += 1
            print("  PASS  %s" % name)
        else:
            self.failed += 1
            self.failures.append((name, detail))
            print("  FAIL  %s%s" % (name, ("  | " + str(detail)[:400]) if detail else ""))

    def calls(self):
        return self.page.evaluate("window.__calls || []")

    def last_call(self, method, pred=None):
        for c in reversed(self.calls()):
            if c["m"] == method and (pred is None or pred(c["a"])):
                return c
        return None

    def wait_call(self, method, timeout=10.0, pred=None):
        deadline = time.time() + timeout
        while time.time() < deadline:
            c = self.last_call(method, pred)
            if c:
                return c
            self.page.wait_for_timeout(120)
        return None

    def wait_until(self, expr, timeout=8.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.page.evaluate(expr):
                return True
            self.page.wait_for_timeout(150)
        return False

    def shot(self, name):
        if not self.shots:
            return
        os.makedirs(self.shots, exist_ok=True)
        self.page.screenshot(path=os.path.join(self.shots, name))
        print("  shot  %s" % name)

    def tab(self, name):
        # the bar auto-hides; reveal it before aiming at it
        self.page.evaluate("document.documentElement.classList.remove('rs-navhide')")
        self.page.click("#nav-%s" % name)
        self.page.wait_for_timeout(260)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None, help="page to drive (default: bundled assets)")
    ap.add_argument("--www", default=None,
                    help="asset root to serve and inject the shim from (default: app/src/main/assets/www); "
                         "point it at build/intermediates/assets/release/mergeReleaseAssets/www to gate "
                         "the minified bytes that actually ship")
    ap.add_argument("--shots", default=None, help="write screenshots into this directory")
    a = ap.parse_args()

    global WWW, SHIM
    if a.www:
        WWW = os.path.abspath(a.www)
        SHIM = open(os.path.join(WWW, "_shell_shim.js"), encoding="utf-8").read()

    httpd = None
    url = a.url
    if not url:
        httpd, url = serve()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  has_touch=True, is_mobile=True)
        page = ctx.new_page()
        page.add_init_script(BRIDGE)

        errors, console_errors, external = [], [], []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("request", lambda r: external.append(r.url)
                if not r.url.startswith(("http://127.0.0.1", "data:", "blob:")) else None)

        print("== driving %s" % url)
        page.goto(url, wait_until="load")
        # the suite is not a first run: pre-mark the tour seen so the tests drive the app
        # itself. The tour legs at the end clear this and reload to prove the real first run.
        page.evaluate("try { localStorage.setItem('resonance.app.theme.v1', "
                      "JSON.stringify({ tour: 'done' })) } catch (e) {}")
        page.add_script_tag(content=SHIM)           # exactly how the shell injects it
        suite = Suite(page, a.shots)

        ok = suite.wait_until("!!document.getElementById('rsApp')", 20)
        suite.check("the shell builds the app frame", ok)
        if not ok:
            print("shell never appeared; page errors: %s" % errors[:5])
            browser.close()
            if httpd:
                httpd.shutdown()
            return 1

        suite.check("the desktop header is hidden and the page is marked as an app",
                    page.evaluate("document.documentElement.classList.contains('rs-app') && "
                                  "getComputedStyle(document.querySelector('header.studio')).display === 'none'"))
        suite.check("the page's own API is present (nothing about it was forked)",
                    page.evaluate("!!(window.__gnauralAPI && window.__gnauralAPI.state)"))
        suite.check("the shell paints in the app theme, not the page skin",
                    page.evaluate("!!document.documentElement.getAttribute('data-rs-theme')"))

        # what the APK carries must agree with the build it was cut from
        cj = json.load(open(os.path.join(WWW, "compat.json"), encoding="utf-8"))
        grade = open(os.path.join(PROJECT, "app", "build.gradle"), encoding="utf-8").read()
        vname = re.search(r'versionName\s+"([^"]+)"', grade)
        suite.check("compat.json names the version this build actually is",
                    vname is not None and cj.get("appVersion") == vname.group(1),
                    "%s vs %s" % (cj.get("appVersion"), vname and vname.group(1)))
        suite.shot("1-home.png")

        # ---- the session map (the shell's own chart, not the page's) ---------------
        suite.check("the page's own chart canvas is hidden",
                    page.evaluate("getComputedStyle(document.getElementById('graph')).display === 'none'"))
        suite.check("the shell's session map takes its place, at height",
                    page.evaluate("(() => { const c = document.getElementById('rsSched');"
                                  " if (!c) return 0; const r = c.getBoundingClientRect();"
                                  " return getComputedStyle(c).display === 'block' ? r.height : 0; })()") >= 110)
        suite.check("the map's backing store follows the device pixel ratio",
                    page.evaluate("(() => { const c = document.getElementById('rsSched');"
                                  " return c.width === Math.floor(c.clientWidth * devicePixelRatio) &&"
                                  " c.height === Math.floor(c.clientHeight * devicePixelRatio); })()"))
        page.evaluate("(() => { const st = window.__gnauralAPI.state;"
                      " window.__keepCurves = st.curves; st.curves = null; window.__rs.sched(); })()")
        suite.check("with no session the map draws its empty state",
                    page.evaluate("document.getElementById('rsSched').getAttribute('aria-label')")
                    == "Session map, no session loaded")
        suite.check("the empty state actually paints (not a blank field)",
                    page.evaluate("(() => { const c = document.getElementById('rsSched');"
                                  " const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;"
                                  " let n = 0; for (let i = 0; i < d.length; i += 4)"
                                  " if (d[i] > 60) n++; return n; })()") > 60)
        page.evaluate("(() => { window.__gnauralAPI.state.curves = window.__keepCurves; window.__rs.sched(); })()")
        suite.check("restoring the session brings the ridges back",
                    page.evaluate("document.getElementById('rsSched').getAttribute('aria-label')")
                    != "Session map, no session loaded")

        # ---- navigation ------------------------------------------------------------
        suite.check("the nav is a real tablist",
                    page.evaluate("document.getElementById('rsNav').getAttribute('role') === 'tablist' && "
                                  "document.querySelectorAll('#rsNav [role=tab]').length === 5"))
        suite.check("the five destinations are named",
                    page.evaluate("Array.from(document.querySelectorAll('#rsNav [role=tab] span:last-child'))"
                                  ".map(e => e.textContent).join(',')") ==
                    "Home,Sessions,Studio,Visualise,Settings")
        suite.tab("sessions")
        suite.check("moving to Sessions shows its panel and moves aria-selected",
                    page.evaluate("document.getElementById('scr-sessions').classList.contains('rs-on') && "
                                  "document.getElementById('nav-sessions').getAttribute('aria-selected') === 'true' && "
                                  "document.getElementById('nav-home').getAttribute('aria-selected') === 'false'"))
        suite.check("the app bar retitles per screen", page.evaluate(
            "document.getElementById('rsTitle').textContent") == "Sessions")
        suite.check("the library is really here (the page's own list, moved)",
                    page.evaluate("document.querySelectorAll('#rsBrowse #plist .item').length > 50"))
        suite.check("sessions are reachable above the fold with the filters closed",
                    page.evaluate("(() => { const r = document.querySelector('#rsModules .rs-card')"
                                  " || document.querySelector('#plist .item');"
                                  " return !!r && r.getBoundingClientRect().top < innerHeight; })()"))
        suite.shot("2-sessions.png")
        suite.tab("studio")
        suite.check("the studio carries the page's own voices list",
                    page.evaluate("!!document.querySelector('#rsVoices #voicelist') && "
                                  "!!document.querySelector('#rsVoices #entryedit')"))
        suite.check("live tools and files travelled with it",
                    page.evaluate("!!document.querySelector('#rsLive #barL') && "
                                  "!!document.querySelector('#rsFiles #saveGnm')"))
        suite.check("the secondary studio modules are folded by default",
                    page.evaluate("!document.getElementById('rsFilesDet').open && "
                                  "!document.getElementById('rsLiveDet').open"))
        suite.shot("3-studio.png")
        suite.tab("vis")
        suite.shot("4-vis.png")
        suite.tab("settings")
        suite.check("the visualiser card is adopted into the visualise screen",
                    page.evaluate("!!document.querySelector('#rsVizCard #vizCard')"))
        suite.shot("5-settings.png")
        suite.check("the desktop keyboard card is gone",
                    page.evaluate("!Array.from(document.querySelectorAll('section.card'))"
                                  ".some(c => /Keyboard/.test(c.textContent))"))
        suite.tab("home")

        # ---- start from a state tile ------------------------------------------------
        before = page.evaluate("document.getElementById('clock').textContent")
        page.click("#rsStates .rs-tile")
        started = suite.wait_until(
            "document.getElementById('clock').textContent !== %s" % json.dumps(before), 10)
        suite.check("a state tile loads a session and starts it", started,
                    page.evaluate("document.getElementById('clock').textContent"))
        title = page.evaluate("document.getElementById('rsNowTitle').textContent.trim()")
        suite.check("the hero names the session it started", bool(title) and title != "Pick a session", title)
        c = suite.wait_call("state", pred=lambda args: args and args[0] is True)
        suite.check("playing state is pushed to the native service", c is not None, c)
        suite.check("the service hears the session name", c is not None and c["a"][1] == title,
                    c["a"][1] if c else None)
        suite.check("the play button reads as Pause while playing",
                    page.evaluate("document.getElementById('rsPlay').getAttribute('aria-label')") == "Pause")

        page.click("#rsPlay")
        paused = suite.wait_until("window.__gnauralAPI.state.playing === false", 8)
        suite.check("the hero Play pauses again", paused)
        page.evaluate("window.__rs.play()")
        suite.check("the lock screen's play path resumes the page",
                    suite.wait_until("window.__gnauralAPI.state.playing === true", 8))
        page.evaluate("window.__rs.pause()")
        suite.wait_until("window.__gnauralAPI.state.playing === false", 8)
        page.click("#rsStop")
        suite.check("Stop stops and rewinds",
                    suite.wait_until("document.getElementById('clock').textContent.indexOf('0:00') === 0", 8))

        # ---- Surprise me lives in the player -----------------------------------------
        sur = page.evaluate("""(() => {
          const s = document.getElementById('rsSurprise'),
                m = document.getElementById('rsMode');
          if (!s || !m) return null;
          const a = s.getBoundingClientRect(), b = m.getBoundingClientRect();
          return { h: Math.round(a.height), w: Math.round(a.width),
                   beside: Math.abs(a.right - b.left) < 30 && Math.abs(a.top - b.top) < 26,
                   inHero: !!s.closest('.rs-hero'),
                   pill: getComputedStyle(s.querySelector('.rs-pill')).borderRadius };
        })()""")
        suite.check("Surprise me is a pill beside the live pill in the player",
                    sur is not None and sur["inHero"] and sur["beside"] and sur["h"] >= 44
                    and sur["pill"] == "999px", sur)
        suite.check("the library no longer shows its own Surprise me button",
                    page.evaluate("getComputedStyle(document.getElementById('randomBtn')).display") == "none")
        page.click("#rsSurprise")
        suite.check("Surprise me rolls a session and starts it",
                    suite.wait_until("window.__gnauralAPI.state.playing === true", 8))
        rolled = page.evaluate("document.getElementById('rsNowTitle').textContent")
        suite.check("...and the player names what it rolled",
                    bool(rolled) and rolled != "Pick a session", rolled)
        page.click("#rsStop")
        suite.wait_until("window.__gnauralAPI.state.playing === false", 8)

        # ---- the map reads the loaded session --------------------------------------
        label = page.evaluate("document.getElementById('rsSched').getAttribute('aria-label')")
        suite.check("the map's label names the layer count and total",
                    label.startswith("Session map, ") and " total, at " in label, label)
        suite.check("the map paints the session's ridges",
                    page.evaluate("(() => { const c = document.getElementById('rsSched');"
                                  " const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;"
                                  " let n = 0; for (let i = 0; i < d.length; i += 4)"
                                  " if (d[i] > 40) n++; return n; })()") > 400)
        seek = page.evaluate("""(() => {
          const st = window.__gnauralAPI.state, c = document.getElementById('rsSched');
          const g = c.getContext('2d'), W = c.width, H = c.height;
          const scan = () => {
            const d = g.getImageData(0, 0, W, H).data, out = new Float64Array(W);
            for (let x = 0; x < W; x++) { let s = 0;
              for (let y = 24; y < H - 60; y++) { const i = (y * W + x) * 4; s += d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2]; }
              out[x] = s; }
            return out; };
          const at = (f) => { st.live = { sample: Math.round(st.curves.total * 44100 * f), total: 0,
                                          completed: false, peakL: 0, peakR: 0, voices: [] }; window.__rs.sched(); };
          const head = (a, b) => { let best = -1e9, bx = -1;
            for (let x = 0; x < W; x++) { const d = b[x] - a[x]; if (d > best) { best = d; bx = x; } }
            return bx; };
          at(0); const at0 = scan();
          at(0.5); const mid = head(at0, scan());
          at(0.9); const late = head(at0, scan());
          at(0);
          return { still: head(at0, scan()), mid: mid / W, late: late / W, w: W };
        })()""")
        suite.check("the playhead sits at the left edge when rewound",
                    seek["still"] / seek["w"] < 0.2, seek)
        suite.check("the playhead follows the position (half, then near the end)",
                    0.42 < seek["mid"] < 0.58 and seek["late"] > 0.8, seek)

        # ---- Build a tone and the hearing readout live on Studio now ----------------
        suite.check("Home keeps only the player and the modules",
                    page.evaluate("!document.querySelector('#scr-home #rsBuild') && "
                                  "!document.querySelector('#scr-home .rs-fold') && "
                                  "!!document.querySelector('#scr-home #rsStates')"))
        suite.check("the module grid offers eight ways in",
                    page.evaluate("document.querySelectorAll('#rsStates .rs-tile').length") == 8)
        suite.tab("studio")
        suite.check("Build a tone moved to Studio",
                    page.evaluate("!!document.querySelector('#scr-studio #rsBuild')"))
        # ---- "what you are hearing" is folded to a single row ----------------------
        suite.check("the hearing card is folded away by default",
                    page.evaluate("(() => { const d = document.querySelector('#scr-studio .rs-fold details');"
                                  " return !!d && !d.open; })()"))
        suite.check("its summary names it",
                    page.evaluate("document.querySelector('#scr-studio .rs-fold summary b').textContent") == "What you are hearing")
        page.click("#scr-studio .rs-fold summary")
        suite.check("opening it reveals the layer detail",
                    page.evaluate("document.querySelector('.rs-fold details').open && "
                                  "document.getElementById('hearinfo').getBoundingClientRect().height > 10"))
        page.click(".rs-fold summary")

        # volume drives the page's own master gain
        page.evaluate("(() => { const v = document.getElementById('rsVol'); v.value = '0.25';"
                      " v.dispatchEvent(new Event('input', { bubbles: true })); })()")
        suite.check("the hero volume drives the studio master gain",
                    abs(page.evaluate("parseFloat(document.getElementById('master').value)") - 0.25) < 0.001)

        # build-a-tone writes a real schedule
        page.evaluate("(() => { const c = document.getElementById('rsCarrier'); c.value = '300';"
                      " c.dispatchEvent(new Event('input', { bubbles: true }));"
                      " const b = document.getElementById('rsBeat'); b.value = '10.5';"
                      " b.dispatchEvent(new Event('input', { bubbles: true })); })()")
        page.click("#rsBuildGo")
        built = suite.wait_until(
            "window.__gnauralAPI.state.schedule.voices.length === 1 && "
            "window.__gnauralAPI.state.schedule.voices[0].entries[0].basefreq === 300", 6)
        suite.check("Build a tone writes the carrier and beat into the schedule", built,
                    page.evaluate("JSON.stringify(window.__gnauralAPI.state.schedule.voices[0]||{})"))
        suite.check("the built tone is named for what it is",
                    page.evaluate("document.getElementById('rsNowTitle').textContent").startswith("Custom 300 Hz"),
                    page.evaluate("document.getElementById('rsNowTitle').textContent"))
        page.click("#rsBed button[data-bed=pink]")
        page.click("#rsBuildGo")
        suite.check("a bed adds a second, noise voice",
                    suite.wait_until("window.__gnauralAPI.state.schedule.voices.length === 2", 6))
        page.evaluate("window.__rs.stop()")

        # ---- the library ------------------------------------------------------------
        suite.tab("sessions")
        total = page.evaluate("document.querySelectorAll('#plist .item').length")
        page.fill("#rsBrowse #search", "sleep")
        page.wait_for_timeout(350)
        shown = page.evaluate("document.querySelectorAll('#plist .item').length")
        suite.check("search narrows the library", 0 < shown < total, "%s -> %s" % (total, shown))
        page.fill("#rsBrowse #search", "")
        page.wait_for_timeout(300)
        suite.check("clearing the search restores it",
                    page.evaluate("document.querySelectorAll('#plist .item').length") == total)
        page.click("#plist .item")
        suite.check("tapping a library row loads that session",
                    suite.wait_until("!!document.querySelector('#plist .item.sel')", 5))
        page.click("#plist .item .star")
        suite.check("the favourite star is a real toggle",
                    page.evaluate("!!document.querySelector('#plist .item .star.on')"))
        page.click("#rsFilterBtn")
        suite.check("the Filters button reveals the chip block",
                    suite.wait_until("document.getElementById('rsFilterBtn').getAttribute('aria-expanded') === 'true'"))
        suite.wait_until("Array.from(document.querySelectorAll('#plist .item'))"
                         ".every(r => r.getAttribute('data-band'))", 5)
        bands = page.evaluate("Array.from(document.querySelectorAll('#plist .item'))"
                              ".map(r => r.getAttribute('data-band'))")
        suite.check("every session row carries a band", bool(bands) and all(bands), bands[:8])
        suite.check("a sleep session is banded sleep", page.evaluate(
            "Array.from(document.querySelectorAll('#plist .item')).some("
            "r => /sleep|delta/i.test(r.textContent) && r.getAttribute('data-band') === 'sleep')"))
        suite.check("the band shows as a tinted edge", page.evaluate(
            "getComputedStyle(document.querySelector('#plist .item')).backgroundImage.indexOf('gradient') > -1"))
        suite.check("the rail cards carry their band too", page.evaluate(
            "(() => { const c = document.querySelector('#scr-sessions .rs-card[data-band=sleep]');"
            " if (!c) return false; return getComputedStyle(c).backgroundImage.indexOf('gradient') > -1; })()"))
        page.click("#filters .chip:nth-child(2)")
        suite.check("the Favourites chip filters to the starred session",
                    page.evaluate("document.querySelectorAll('#plist .item').length") == 1)

        # ---- visualise: the binding is deterministic --------------------------------
        suite.tab("vis")
        page.wait_for_timeout(400)
        mapping = page.evaluate("document.getElementById('rsMap').textContent")
        suite.check("the mapping prints the real carrier and rate", "carrier" in mapping and "rate" in mapping, mapping[:120])
        suite.check("the mapping names a medium for the band",
                    any(w in mapping.lower() for w in ["plate", "disc", "water", "skin", "ripple"]), mapping[:120])
        suite.check("a scene chip is preselected to match", page.evaluate(
            "!!document.querySelector('#rsScenes button[aria-pressed=true]')"))
        page.click("#rsScenes button[data-scene=minnaert-cloud]")
        page.wait_for_timeout(200)
        suite.check("a scene chip applies to the chamber", page.evaluate(
            "window.ResonanceCymatics.api.getPrefs().medium === 'bubbles'"))
        page.click("#rsMedia button[data-medium=water]")
        suite.check("a medium chip applies too", page.evaluate(
            "window.ResonanceCymatics.api.getPrefs().medium === 'water'"))
        suite.check("follow keeps the chamber reading the session", page.evaluate(
            "window.ResonanceCymatics.api.getPrefs().src === 'session'"))

        # ---- visualise layout + the gentle focus view ------------------------------
        suite.check("the chamber card leads the section",
                    page.evaluate("document.querySelector('#scr-vis section.card') === "
                                  "document.querySelector('#scr-vis section.card.rs-cta')"))
        suite.check("the page's long motion caption is folded away",
                    page.evaluate("getComputedStyle(document.getElementById('vizNote')).display") == "none")
        suite.check("a one-line version stands in its place",
                    page.evaluate("(() => { const h = document.querySelector('#rsVizCard .rs-hint');"
                                  " return !!h && h.textContent.indexOf('flash threshold') > -1; })()"))
        suite.check("the two ways in are equal cards",
                    page.evaluate("(() => { const c = document.querySelectorAll('#scr-vis section.card.rs-cta');"
                                  " if (c.length !== 2) return false;"
                                  " const h = [...c].map(x => x.querySelector('h3').textContent + '|' +"
                                  " x.querySelector('.rs-cta-sub').textContent);"
                                  " return h[0] === 'Cymatic chamber|Full visual experience' &&"
                                  " h[1] === 'Focus view|Gentle visuals'; })()"))
        suite.check("Focus view has its own way in",
                    page.evaluate("!!document.getElementById('rsFocusGo')"))
        page.click("#scr-vis [data-act=focus], #rsFocusGo")
        suite.check("Focus view opens full screen", suite.wait_until(
            "document.documentElement.classList.contains('rs-focus')", 8))
        suite.check("it brings a bar to change the visualisation",
                    page.evaluate("getComputedStyle(document.getElementById('rsFocusBar')).display") == "flex")
        first = page.evaluate("document.getElementById('rsFocusName').textContent")
        suite.check("the chrome is up at first",
                    page.evaluate("!document.documentElement.classList.contains('rs-fs-hide')"))
        page.wait_for_timeout(5200)
        suite.check("a few quiet seconds slide the chrome away",
                    page.evaluate("document.documentElement.classList.contains('rs-fs-hide')"))
        page.click("#rsFsStage")
        suite.check("a touch brings it back",
                    suite.wait_until("!document.documentElement.classList.contains('rs-fs-hide')", 4))
        suite.check("it starts on a named visualisation", bool(first) and first != "Visualisation", first)
        suite.check("the visualiser is genuinely enabled", page.evaluate(
            "window.ResonanceViz.api.getPrefs().on === true"))
        page.click("[data-rs=fNext]")
        page.wait_for_timeout(300)
        second = page.evaluate("document.getElementById('rsFocusName').textContent")
        suite.check("Next switches to another visualisation", bool(second) and second != first, [first, second])
        suite.check("the switch lands in the page's own prefs", page.evaluate(
            "window.ResonanceViz.api.getPrefs().preset") != "")
        page.click("#rsFocusBar [data-rs=fPick]")
        suite.check("Change opens the full list", suite.wait_until(
            "!!document.getElementById('rsFocusPick') && "
            "document.getElementById('rsFocusPick').classList.contains('rs-ov-on')", 5))
        page.click("#rsFocusPick [data-fp='quiet-tide']")
        page.wait_for_timeout(250)
        suite.check("picking one applies it", page.evaluate(
            "window.ResonanceViz.api.getPrefs().preset") == "quiet-tide")
        page.click("#rsFsTop [data-rs=fsExit]")
        suite.check("closing focus returns to the app", suite.wait_until(
            "!document.documentElement.classList.contains('rs-focus')", 8))
        suite.check("the panels come home with it", page.evaluate(
            "(() => { const c = document.querySelector('[data-viz-panel]');"
            " return !!c && !c.closest('#rsFs'); })()"))

        # the chamber opens as a real instrument
        page.click("#rsChamber")
        opened = suite.wait_until("!!document.getElementById('cymRoot') && "
                                  "!document.getElementById('cymRoot').hidden", 8)
        suite.check("Open the chamber opens the chamber", opened)
        if opened:
            suite.check("the chamber is on-screen (not a zero-size fixed layer)",
                        page.evaluate("(() => { const r = document.getElementById('cymRoot').getBoundingClientRect();"
                                      " return r.width > 200 && r.height > 200; })()"))
            suite.check("the chamber follows the session carrier",
                        page.evaluate("window.ResonanceCymatics.debugState().src === 'session'"))
            # tempo: steps the label, scales the schedule, and survives a session change
            page.click("button[aria-label='Faster tone']")
            page.click("button[aria-label='Faster tone']")
            suite.check("the chamber tempo steps to 1.20x",
                        page.evaluate("document.getElementById('rsCymTempo').textContent") == "1.20\u00d7")
            ratio = ("(() => { const st = window.__gnauralAPI.state;"
                     " const v = st.schedule.voices.filter(v => v.type === 0 || v.type === 3)[0];"
                     " return v ? [v.entries[0].beat, v.entries[0].__b0] : null; })()")
            pair = page.evaluate(ratio)
            suite.check("tempo really scales that schedule's beat",
                        bool(pair) and abs(pair[0] / pair[1] - 1.2) < 0.001, pair)
            suite.check("tempo is stored as a preference",
                        abs(page.evaluate("JSON.parse(localStorage.getItem('resonance.app.theme.v1')).tempo") - 1.2) < 0.001)
        page.evaluate("window.ResonanceCymatics.close()")
        page.wait_for_timeout(300)
        suite.tab("home")
        page.evaluate("Array.from(document.querySelectorAll('#rsStates .rs-tile')).filter(b => !b.disabled)[1].click()")
        suite.wait_until("document.getElementById('rsPlay').getAttribute('aria-label') === 'Pause'", 8)
        page.wait_for_timeout(1300)     # tempoGuard rides the 1 Hz shell tick
        carried = page.evaluate(ratio)
        suite.check("tempo carries onto the next session", bool(carried) and abs(carried[0] / carried[1] - 1.2) < 0.02, carried)
        page.evaluate("window.__rs.tempo(1)")
        back = page.evaluate(ratio)
        suite.check("resetting tempo restores the session's own beat",
                    bool(back) and abs(back[0] / back[1] - 1) < 0.001, back)

        # ---- the nav leaves when the glass is quiet --------------------------------
        page.wait_for_timeout(6300)
        suite.check("six quiet seconds put the nav away",
                    page.evaluate("document.documentElement.classList.contains('rs-navhide')"))
        page.mouse.click(200, 600)
        suite.check("a touch brings the nav back",
                    suite.wait_until("!document.documentElement.classList.contains('rs-navhide')", 3))
        suite.check("the bar has a transition, not a jump", page.evaluate(
            "getComputedStyle(document.getElementById('rsNav')).transitionProperty.indexOf('transform') > -1"))
        page.evaluate("document.documentElement.classList.remove('rs-navhide')")

        # ---- settings ---------------------------------------------------------------
        suite.tab("settings")
        page.click("#rsTheme button[data-t=light]")
        suite.check("choosing Light repaints in the light theme",
                    page.evaluate("document.documentElement.getAttribute('data-rs-theme')") == "light")
        suite.click = None
        page.click("#rsTheme button[data-t=dark]")
        suite.check("choosing Dark goes back", page.evaluate(
            "document.documentElement.getAttribute('data-rs-theme')") == "dark")
        page.click("#rsAccent")
        suite.check("wallpaper accent takes the system palette",
                    page.evaluate("document.documentElement.style.getPropertyValue('--rs-pri')") == "#8AD8C8")
        page.click("#rsAccent")
        # ---- the Full / Minimal interface -------------------------------------------
        suite.check("the interface starts Full, with the knob on Play",
                    page.evaluate("document.documentElement.getAttribute('data-rs-ui')") == "full" and
                    "knob-calm" in page.evaluate(
                        "getComputedStyle(document.getElementById('rsPlay')).backgroundImage"))
        suite.check("the tiles carry their own artwork",
                    "tile-sleep" in page.evaluate(
                        "getComputedStyle(document.querySelector('.rs-tile[data-rs-tile=sleep]')).backgroundImage"))
        art = page.evaluate("""() => Promise.all(["knob-calm","knob-dusk","knob-sage","knob-sand",
            "knob-slate","btn-stop","tile-sleep","tile-focus","tile-relax","tile-wake","plate","strip"]
            .map(n => fetch("ui/" + n + ".webp").then(r => r.ok)))""")
        suite.check("every piece of art actually loads", bool(art) and all(art), art)
        page.click("#rsUi button[data-u=minimal]")
        suite.check("Minimal drops the art and says so",
                    page.evaluate("document.documentElement.getAttribute('data-rs-ui')") == "minimal" and
                    page.evaluate("getComputedStyle(document.getElementById('rsPlay')).backgroundImage") == "none")
        suite.check("Minimal drops the band tint too", page.evaluate(
            "getComputedStyle(document.querySelector('#plist .item')).backgroundImage") == "none")
        suite.check("Minimal drops the visualise pictures as well", page.evaluate(
            "(() => { const c = document.querySelector('#scr-vis .rs-cta[data-art=chamber]');"
            " if (!c) return false; const bg = getComputedStyle(c, '::before').backgroundImage;"
            " return bg === 'none' || bg.indexOf('cta-chamber') === -1; })()"))
        suite.check("the choice is stored",
                    page.evaluate("JSON.parse(localStorage.getItem('resonance.app.theme.v1')).ui") == "minimal")
        page.click("#rsUi button[data-u=full]")
        suite.check("Full comes back",
                    page.evaluate("document.documentElement.getAttribute('data-rs-ui')") == "full")
        page.click("#scr-settings [data-act=focus]")
        suite.check("the Settings row opens focus view too", suite.wait_until(
            "document.documentElement.classList.contains('rs-focus')", 8))
        page.click("#rsFsTop [data-rs=fsExit]")
        suite.wait_until("!document.documentElement.classList.contains('rs-focus')", 6)

        # ---- the overflow sheet -----------------------------------------------------
        page.click("#rsOverflow")
        suite.check("the overflow sheet opens",
                    suite.wait_until("document.getElementById('rsSheet').classList.contains('rs-open')"))
        suite.check("it is announced as expanded", page.evaluate(
            "document.getElementById('rsOverflow').getAttribute('aria-expanded')") == "true")
        suite.shot("6-sheet.png")
        page.evaluate("history.back()")
        suite.check("back closes the sheet",
                    suite.wait_until("!document.getElementById('rsSheet').classList.contains('rs-open')", 5))
        page.wait_for_timeout(500)      # let the popstate settle before touching the bar again

        # ---- help & about, through the rows a person actually taps -------------------
        # These used to be reached only through window.__rs.guide()/check(), which skipped
        # the row handlers entirely - and the More sheet's rows were dead: the sheet popped
        # its history entry while the overlay pushed a new one, so the deferred popstate
        # closed the overlay it had just opened.
        def close_shown():
            page.evaluate("(() => { const o = document.querySelector('.rs-ov.rs-ov-on');"
                          " if (o) o.querySelector('[data-ov-x]').click(); })()")
            page.wait_for_timeout(450)

        def shown(ov):
            return page.evaluate("(() => { const o = document.getElementById('%s');"
                                 " return !!o && o.classList.contains('rs-ov-on'); })()" % ov)

        def open_state(ov):
            return page.evaluate("document.getElementById('%s').classList.contains('rs-ov-on')" % ov)

        suite.tab("settings")
        for act, ov in (("about", "rsAbout"), ("guide", "rsGuide"), ("check", "rsCheck")):
            close_shown()
            page.evaluate("window.__rsUpdate.none('')")      # a stray answer must not toast here
            page.click("#scr-settings [data-act=%s]" % act)
            page.wait_for_timeout(500)
            suite.check("Settings' %s row opens %s" % (act, ov), open_state(ov))
            page.wait_for_timeout(700)                       # the popstate that ate it lands here
            suite.check("%s is still open a moment later (from Settings)" % ov, open_state(ov))
            close_shown()

        for act, ov in (("about", "rsAbout"), ("guide", "rsGuide"), ("check", "rsCheck")):
            close_shown()
            page.click("#rsOverflow")
            suite.wait_until("document.getElementById('rsSheet').classList.contains('rs-open')", 4)
            page.wait_for_timeout(350)
            page.click("#rsSheet [data-act=%s]" % act)
            page.wait_for_timeout(600)
            suite.check("the More sheet's %s row opens %s and shuts the sheet" % (act, ov),
                        open_state(ov) and not page.evaluate(
                            "document.getElementById('rsSheet').classList.contains('rs-open')"))
            page.wait_for_timeout(700)
            suite.check("%s survives the sheet's history pop" % ov, open_state(ov))
            page.evaluate("history.back()")
            suite.check("Back closes %s and leaves the screen alone" % ov,
                        suite.wait_until(
                            "!document.getElementById('rsCheck').classList.contains('rs-ov-on')"
                            if ov == "rsCheck" else
                            "!document.getElementById('%s').classList.contains('rs-ov-on')" % ov, 4)
                        and page.evaluate(
                            "document.getElementById('scr-settings').classList.contains('rs-on')"))
            page.wait_for_timeout(400)

        # the guide starts at the top even when it was left halfway down
        close_shown()
        page.click("#scr-settings [data-act=guide]")
        page.wait_for_timeout(500)
        page.evaluate("document.querySelector('#rsGuide .rs-ov-body').scrollTop = 640")
        close_shown()
        page.click("#scr-settings [data-act=guide]")
        page.wait_for_timeout(500)
        suite.check("the guide reopens at its top",
                    page.evaluate("document.querySelector('#rsGuide .rs-ov-body').scrollTop") == 0)
        close_shown()

        # About names the build the shell is actually running
        page.click("#scr-settings [data-act=about]")
        page.wait_for_timeout(500)
        about = page.evaluate("document.getElementById('rsAbout').textContent")
        suite.check("About names this build", "2.0.0-beta" in about, about[:90])
        suite.check("About carries the licence terms", "GPL-2.0" in about and "LGPL-2.1" in about)
        before = len([x for x in suite.calls() if x["m"] == "checkUpdate"])
        page.click("#rsAboutUpd")
        page.wait_for_timeout(400)
        suite.check("About's update button asks the shell",
                    len([x for x in suite.calls() if x["m"] == "checkUpdate"]) == before + 1)
        page.evaluate("window.__rsUpdate.none('')")
        close_shown()

        # Check device reports each metric, and a report that copies whole
        page.click("#scr-settings [data-act=check]")
        page.wait_for_timeout(500)
        rows = page.evaluate("Array.from(document.querySelectorAll('#rsCheck .rs-crow b'))"
                             ".map(e => e.textContent)")
        suite.check("Check device lists every metric it claims",
                    rows == ["Device", "Android", "Engine", "Audio path", "Notifications"], rows)
        suite.check("Check device finds nothing wrong on a healthy phone",
                    page.evaluate("document.querySelectorAll('#rsCheck .rs-crow.ok').length") == 5)
        close_shown()

        # the rows are as tappable as the rest of the app
        page.click("#rsOverflow")
        page.wait_for_timeout(450)
        small = page.evaluate("""(() => {
          const bad = [];
          document.querySelectorAll('#rsSheet button').forEach(e => {
            const q = e.getBoundingClientRect();
            if (!q.width || !q.height) return;
            if (q.height < 44) bad.push((e.dataset.act || e.tagName) + ' ' + Math.round(q.height));
          });
          return bad;
        })()""")
        suite.check("every More-sheet row is at least 44 px tall", small == [], small)
        page.evaluate("document.querySelector('#rsSheet [data-act=guide]').click()")
        page.wait_for_timeout(500)
        small = page.evaluate("""(() => {
          const bad = [];
          document.querySelectorAll('.rs-ov.rs-ov-on button').forEach(e => {
            const q = e.getBoundingClientRect();
            if (!q.width || !q.height) return;
            if (q.height < 44) bad.push((e.id || e.textContent.trim().slice(0, 12)) + ' ' + Math.round(q.height));
          });
          return bad;
        })()""")
        suite.check("every overlay control is at least 44 px tall", small == [], small)
        close_shown()


        # dragging the grabber down closes it
        page.click("#rsOverflow")
        suite.wait_until("document.getElementById('rsSheet').classList.contains('rs-open')", 4)
        page.wait_for_timeout(500)
        box = page.evaluate("(() => { const r = document.getElementById('rsGrab').getBoundingClientRect();"
                            " return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()")
        page.mouse.move(box["x"], box["y"])
        page.mouse.down()
        page.mouse.move(box["x"], box["y"] + 160, steps=8)
        page.mouse.up()
        page.wait_for_timeout(600)
        suite.check("dragging the sheet down closes it",
                    not page.evaluate("document.getElementById('rsSheet').classList.contains('rs-open')"))

        # ---- fullscreen visualiser ---------------------------------------------------
        page.evaluate("window.ResonanceViz && window.ResonanceViz.api.enable(true)")
        page.wait_for_timeout(700)
        page.evaluate("document.querySelector('[data-viz-host]').scrollIntoView({ block: 'center' })")
        page.wait_for_timeout(300)
        page.evaluate("document.querySelector('[data-viz-host] .viz-canvas').dispatchEvent("
                      "new MouseEvent('click', { bubbles: true }))")
        infs = suite.wait_until("document.documentElement.classList.contains('rs-fs')", 6)
        suite.check("tapping a visual panel goes fullscreen", infs)
        if infs:
            page.wait_for_timeout(900)
            size = page.evaluate("(() => { const c = document.querySelector('#rsFsStage [data-viz-panel]');"
                                 " if (!c) return null; const r = c.getBoundingClientRect();"
                                 " return { w: Math.round(r.width), h: Math.round(r.height),"
                                 " vw: innerWidth, vh: innerHeight }; })()")
            suite.check("the moved canvas fills the screen",
                        size and abs(size["w"] - size["vw"]) < 8 and abs(size["h"] - size["vh"]) < 8, size)
            lit = 0
            for _ in range(12):
                lit = page.evaluate("(() => { const c = document.querySelector('#rsFsStage .viz-canvas');"
                                    " if (!c) return -1; const x = c.getContext('2d');"
                                    " const d = x.getImageData(0, 0, c.width, c.height).data;"
                                    " let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++;"
                                    " return n; })()")
                if isinstance(lit, int) and lit > 0:
                    break
                page.wait_for_timeout(500)
            suite.check("the fullscreen canvas is genuinely painting", isinstance(lit, int) and lit > 0, "lit=%s" % lit)
            suite.shot("7-fullscreen.png")
            page.evaluate("history.back()")
            suite.check("back leaves fullscreen",
                        suite.wait_until("!document.documentElement.classList.contains('rs-fs')", 6))
            suite.check("the panel returns to its card", page.evaluate(
                "(() => { const c = document.querySelector('[data-viz-panel]');"
                " return c ? !!c.closest('.viz-inline') : false; })()"))

        # ---- the chamber is a layer, not a trap --------------------------------------
        # A system Back (edge swipe) used to find no history and finish the activity; the
        # chamber now owns an entry and Back returns to the app.
        page.evaluate("window.__rs.chamber()")
        suite.check("the chamber opens", suite.wait_until(
            "document.documentElement.classList.contains('cym-open')", 8))
        page.wait_for_timeout(700)
        page.evaluate("history.back()")
        suite.check("Back closes the chamber without leaving the app", suite.wait_until(
            "!document.documentElement.classList.contains('cym-open')", 5)
            and page.evaluate("!!document.getElementById('rsApp')"))
        page.wait_for_timeout(400)

        # ---- Ambient panels: one scene menu, no second chamber door -------------------
        suite.tab("vis")
        page.wait_for_timeout(700)
        amb = page.evaluate("""(() => {
          const p = document.getElementById('vizPrev').getBoundingClientRect();
          const n = document.getElementById('vizNext').getBoundingClientRect();
          const s = document.getElementById('vizPreset').getBoundingClientRect();
          const cym = document.getElementById('cymCardBtn');
          return { box: !!document.querySelector('#vizCard .rs-scenebox'),
                   pw: Math.round(p.width), ph: Math.round(p.height), nw: Math.round(n.width),
                   sw: Math.round(s.width), sh: Math.round(s.height),
                   cym: cym ? getComputedStyle(cym).display : 'gone' };
        })()""")
        suite.check("the page's duplicate Cymatic Chamber button is gone", amb["cym"] == "none", amb)
        suite.check("Scene reads as a menu: 44 px arrows against one wide picker",
                    amb["box"] and amb["pw"] >= 44 and amb["ph"] >= 44 and amb["nw"] >= 44
                    and abs(amb["sh"] - amb["ph"]) <= 2 and amb["sw"] >= 150, amb)


        # ---- files: .gnaural save, pack save, share link -----------------------------
        suite.tab("studio")
        page.evaluate("document.getElementById('rsFilesDet').open = true")
        page.wait_for_timeout(250)
        expected = page.evaluate("window.__gnauralAPI.toGnauralText().length")
        page.evaluate("document.getElementById('saveGnm').scrollIntoView({ block: 'center' })")
        page.click("#saveGnm")
        c = suite.wait_call("fileEnd", timeout=12)
        suite.check("Save .gnaural streams the real file to the shell",
                    c is not None and c["a"][0] == expected, "%s vs %s" % (c and c["a"][0], expected))
        start = suite.last_call("fileStart")
        suite.check("the save has a sensible name", start is not None and start["a"][0].endswith(".gnaural"),
                    start and start["a"][0])

        # the card's formatting contract: two equal columns per action row, one labelled
        # length row, a full-width share, and no second "Files" heading
        lay = page.evaluate("""(() => {
          const r = id => document.getElementById(id).getBoundingClientRect();
          const card = document.getElementById('rsFiles').getBoundingClientRect();
          const len = document.getElementById('exportMin');
          return { open: Math.round(r('loadBtn').width), pack: Math.round(r('loadPackBtn').width),
                   save: Math.round(r('saveGnm').width), exp: Math.round(r('exportBtn').width),
                   share: Math.round(r('shareBtn').width),
                   shareRow: Math.round(document.getElementById('shareBtn').closest('.row')
                     .getBoundingClientRect().width),
                   lenRow: !!len.closest('.rs-filelen'), lenH: Math.round(r('exportMin').height),
                   head: getComputedStyle(document.querySelector('#rsFiles h3')).display };
        })()""")
        suite.check("the file rows share one two-column rhythm and one heading",
                    abs(lay["open"] - lay["pack"]) <= 2 and abs(lay["save"] - lay["exp"]) <= 2
                    and lay["head"] == "none", lay)
        suite.check("the export length has its own labelled row, and share runs full width",
                    lay["lenRow"] and lay["lenH"] >= 44 and lay["share"] >= lay["shareRow"] - 2, lay)

        suite.tab("sessions")
        page.evaluate("document.querySelector('#pklist a') || null")
        suite.check("pack downloads are reachable", page.evaluate("!!document.querySelector('#pklist a')"))

        suite.tab("studio")
        page.evaluate("document.getElementById('shareBtn').scrollIntoView({ block: 'center' })")
        page.click("#shareBtn")
        c = suite.wait_call("copy", timeout=8, pred=lambda args: args and "#s=" in str(args[0]))
        suite.check("share link is copied, rewritten to the real site address",
                    c is not None and str(c["a"][0]).startswith("https://moddys.net/resonance/app/"),
                    c and str(c["a"][0])[:90])

        # ---- overlays ---------------------------------------------------------------
        page.evaluate("window.__rs.guide()")
        suite.check("the quick guide opens",
                    suite.wait_until("!!document.getElementById('rsGuide') && "
                                     "document.getElementById('rsGuide').classList.contains('rs-ov-on')"))
        page.click("#rsGuide [data-ov-x]")
        suite.check("the guide closes", suite.wait_until(
            "!document.getElementById('rsGuide').classList.contains('rs-ov-on')"))

        page.evaluate("window.__rs.check()")
        suite.check("the device check opens", suite.wait_until(
            "!!document.getElementById('rsCheck') && "
            "document.getElementById('rsCheck').classList.contains('rs-ov-on')"))
        page.click("#rsCopyReport")
        c = suite.wait_call("copy", timeout=6, pred=lambda args: args and "WebView:" in str(args[0]))
        suite.check("the check report copies as plain text", c is not None)
        page.evaluate("history.back()")
        suite.check("back closes the check", suite.wait_until(
            "!document.getElementById('rsCheck').classList.contains('rs-ov-on')"))

        page.evaluate("""window.__rsUpdate.available({version: "9.9.9",
            url: "https://moddys.net/x.apk", sha256: "ab", notes: ""})""")
        suite.check("an available update shows the update strip", suite.wait_until(
            "!!document.getElementById('rsUpd') && "
            "getComputedStyle(document.getElementById('rsUpd')).display !== 'none'"))
        page.click("#rsUpd [data-rs-upd='later']")
        suite.check("Later hides the update strip", page.evaluate(
            "getComputedStyle(document.getElementById('rsUpd')).display === 'none'"))

        # ---- Check for updates: whoever asks always gets an answer ---------------------
        suite.tab("settings")

        def toasts():
            return len([x for x in suite.calls() if x["m"] == "toast"])

        n0 = toasts()
        page.click("#scr-settings [data-act=upd]")
        c = suite.wait_call("checkUpdate", timeout=4)
        suite.check("Check for updates asks the shell", c is not None)
        page.evaluate("window.__rsUpdate.none('1.1.4-beta')")
        suite.check("a manual check that finds nothing says so, and says what it found",
                    toasts() == n0 + 2 and page.evaluate("window.__rsUpdate.state().state") == "current",
                    toasts() - n0)
        n0 = toasts()
        page.evaluate("window.__rsUpdate.none('1.1.4-beta')")
        suite.check("the launch check stays quiet", toasts() == n0)

        page.click("#scr-settings [data-act=upd]")
        page.wait_for_timeout(200)
        page.evaluate("window.__rsUpdate.failed('java.net.UnknownHostException: moddys.net')")
        suite.check("a manual check that cannot reach the site says so",
                    toasts() == n0 + 2 and page.evaluate("window.__rsUpdate.state().state") == "failed",
                    toasts() - n0)
        n0 = toasts()
        page.evaluate("window.__rsUpdate.failed('boom')")
        suite.check("a failed launch check stays quiet", toasts() == n0)

        page.click("#scr-settings [data-act=upd]")
        page.wait_for_timeout(200)
        page.evaluate("""window.__rsUpdate.available({version: "9.9.9",
            url: "https://moddys.net/x.apk", sha256: "ab", notes: ""})""")
        suite.check("a manual check with an update shows the strip instead of a toast",
                    toasts() == n0 + 1 and page.evaluate(
                        "getComputedStyle(document.getElementById('rsUpd')).display !== 'none'"),
                    toasts() - n0)
        n0 = toasts()
        page.evaluate("window.__rsUpdate.none('1.1.4-beta')")
        suite.check("the update answer does not leak onto the next launch check", toasts() == n0)
        page.click("#rsUpd [data-rs-upd='later']")


        # search + keyboard dismissal (the shell's own contract)
        suite.tab("sessions")
        page.click("#search")
        page.fill("#search", "sleep")
        page.keyboard.press("Enter")
        c = suite.wait_call("dismissKeyboard", timeout=6)
        suite.check("committing a search dismisses the keyboard", c is not None)

        # ---- tap targets and overflow ------------------------------------------------
        suite.tab("home")
        small = page.evaluate("""(() => {
          const bad = [];
          document.querySelectorAll('#rsApp button, #rsApp a, #rsApp select, #rsApp input').forEach(e => {
            const q = e.getBoundingClientRect();
            if (!q.width || !q.height || e.type === 'checkbox') return;
            if (q.height < 44) bad.push((e.id || e.tagName) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
          });
          return bad;
        })()""")
        suite.check("every control is at least 44 px tall", small == [], small)
        for w in (320, 390, 430):
            page.set_viewport_size({"width": w, "height": 844})
            page.wait_for_timeout(300)
            over = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            suite.check("no horizontal overflow at %d px" % w, over <= 0, over)
        page.set_viewport_size({"width": 390, "height": 844})

        # ---- the welcome tour ---------------------------------------------------------
        page.evaluate("localStorage.removeItem('resonance.app.theme.v1')")
        page.reload(wait_until="load")
        page.add_script_tag(content=SHIM)
        suite.check("a first launch opens the welcome tour by itself", suite.wait_until(
            "!!document.getElementById('rsTour') && "
            "document.getElementById('rsTour').classList.contains('rs-t-on')", 10))
        suite.check("it opens on step 1 and says how many there are", page.evaluate(
            "document.getElementById('rsTourN').textContent") == "1 of 9")
        suite.check("the bubble is a labelled modal dialog", page.evaluate(
            "(() => { const b = document.querySelector('#rsTour .rs-t-bub');"
            " return b.getAttribute('role') === 'dialog' && b.getAttribute('aria-modal') === 'true'"
            " && !!document.getElementById('rsTourT').textContent; })()"))
        tick = page.evaluate("""(() => { const t = document.querySelector('#rsTour .rs-t-x');
            const r = t.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), label: t.getAttribute('aria-label') }; })()""")
        suite.check("a tick leaves the tour, sized and labelled for it",
                    tick["w"] >= 44 and tick["h"] >= 44 and "End" in (tick["label"] or ""), tick)

        page.click("#rsTour .rs-t-next")
        page.wait_for_timeout(900)
        hit = page.evaluate("""(() => {
          const h = document.querySelector('#rsTour .rs-t-hole').getBoundingClientRect();
          const n = document.getElementById('rsNav').getBoundingClientRect();
          return { hx: Math.round(h.x), hw: Math.round(h.width), hy: Math.round(h.y),
                   hh: Math.round(h.height), nx: Math.round(n.x), nw: Math.round(n.width),
                   ny: Math.round(n.y), nh: Math.round(n.height) }; })()""")
        suite.check("step 2 walks to the nav and spotlights it",
                    hit["hx"] <= hit["nx"] + 8 and hit["hx"] + hit["hw"] >= hit["nx"] + hit["nw"] - 8
                    and hit["hy"] <= hit["ny"] and hit["hy"] + hit["hh"] >= hit["ny"] + hit["nh"], hit)
        suite.check("the step count follows the walk", page.evaluate(
            "document.getElementById('rsTourN').textContent") == "2 of 9")

        bad = []
        for n in range(3, 10):
            page.click("#rsTour .rs-t-next")
            page.wait_for_timeout(850)
            bubble = page.evaluate("""(() => { const q = document.querySelector('#rsTour .rs-t-bub')
                .getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y),
                w: Math.round(q.width), h: Math.round(q.height), vw: innerWidth, vh: innerHeight }; })()""")
            if (bubble["x"] < 0 or bubble["y"] < 0 or bubble["x"] + bubble["w"] > bubble["vw"]
                    or bubble["y"] + bubble["h"] > bubble["vh"]):
                bad.append((n, bubble))
            count = page.evaluate("document.getElementById('rsTourN').textContent")
            if count != "%d of 9" % n:
                bad.append((n, count))
        suite.check("the tour walks all nine stops with the bubble on screen", bad == [], bad[:3])

        page.click("#rsTour .rs-t-next")          # Done
        suite.check("Done ends the tour", suite.wait_until(
            "!document.getElementById('rsTour').classList.contains('rs-t-on')", 4))
        suite.check("the tour is remembered as seen", page.evaluate(
            "JSON.parse(localStorage.getItem('resonance.app.theme.v1') || '{}').tour") == "done")

        page.reload(wait_until="load")
        page.add_script_tag(content=SHIM)
        suite.check("the shell comes back after the tour", suite.wait_until(
            "!!document.getElementById('rsApp')", 15))
        page.wait_for_timeout(2400)
        suite.check("a tour already seen does not open again", not page.evaluate(
            "!!document.getElementById('rsTour') && "
            "document.getElementById('rsTour').classList.contains('rs-t-on')"))

        suite.tab("settings")
        page.click("#scr-settings [data-act=tour]")
        suite.check("Settings can replay it", suite.wait_until(
            "document.getElementById('rsTour').classList.contains('rs-t-on') && "
            "document.getElementById('rsTourN').textContent === '1 of 9'", 6))
        page.evaluate("history.back()")
        suite.check("Back leaves the tour without leaving the app", suite.wait_until(
            "!document.getElementById('rsTour').classList.contains('rs-t-on')", 4)
            and page.evaluate("!!document.getElementById('rsApp')"))

        # reload: the shell reinjects and the frame comes back
        page.reload(wait_until="load")
        page.add_script_tag(content=SHIM)
        suite.check("the shell survives a reload (renderer rebuilt)",
                    suite.wait_until("!!document.getElementById('rsApp')", 15))

        # ---- hygiene ------------------------------------------------------------------
        suite.check("no uncaught page errors", len(errors) == 0, errors[:4])
        benign = [e for e in console_errors if "favicon" not in e.lower()]
        suite.check("no console errors", len(benign) == 0, benign[:4])
        suite.check("zero off-origin requests", len(external) == 0, external[:6])

        print("\n== %d passed, %d failed" % (suite.passed, suite.failed))
        for name, detail in suite.failures:
            print("   FAILED: %s | %s" % (name, str(detail)[:200]))
        if not suite.failed:
            print("ALL CHECKS PASSED")
        browser.close()

    if httpd:
        httpd.shutdown()
    return 0 if suite.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
