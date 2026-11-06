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
        self.page.click("#nav-%s" % name)
        self.page.wait_for_timeout(260)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None, help="page to drive (default: bundled assets)")
    ap.add_argument("--shots", default=None, help="write screenshots into this directory")
    a = ap.parse_args()

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
        suite.shot("1-home.png")

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
        suite.shot("2-sessions.png")
        suite.tab("studio")
        suite.check("the studio carries the page's own voices list",
                    page.evaluate("!!document.querySelector('#rsVoices #voicelist') && "
                                  "!!document.querySelector('#rsVoices #entryedit')"))
        suite.check("live tools and files travelled with it",
                    page.evaluate("!!document.querySelector('#rsLive #barL') && "
                                  "!!document.querySelector('#rsFiles #saveGnm')"))
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
        page.evaluate("window.ResonanceCymatics.close()")
        page.wait_for_timeout(300)

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

        # ---- files: .gnaural save, pack save, share link -----------------------------
        suite.tab("studio")
        expected = page.evaluate("window.__gnauralAPI.toGnauralText().length")
        page.evaluate("document.getElementById('saveGnm').scrollIntoView({ block: 'center' })")
        page.click("#saveGnm")
        c = suite.wait_call("fileEnd", timeout=12)
        suite.check("Save .gnaural streams the real file to the shell",
                    c is not None and c["a"][0] == expected, "%s vs %s" % (c and c["a"][0], expected))
        start = suite.last_call("fileStart")
        suite.check("the save has a sensible name", start is not None and start["a"][0].endswith(".gnaural"),
                    start and start["a"][0])

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
