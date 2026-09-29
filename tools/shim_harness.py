#!/usr/bin/env python3
"""Drive the Resonance Studio shell shim against the real bundled page in a real browser.

The shim is injected at runtime by the Android shell, so it can be exercised here without
a device: serve app/src/main/assets/www, load the studio, inject _shell_shim.js exactly
as the shell does, stub the native bridge (recording every call), and drive the phone UI
with real pointer/keyboard input.

Exit code is nonzero when any check fails, so CI treats this as the acceptance gate.
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
        app: "1.0.0-beta", webview: "com.google.android.webview 120.0.6099.43",
        engine: "com.google.android.webview 120.0.6099.43", engineLabel: "WebView",
        platform: "android", osName: "Android", notifications: true, density: "420",
        system: "Android 13 (API 33)",
        compat: { supported: true, recommended: true, system: "Android 13 (API 33)",
                  hardLabel: "Android 8.0 (API 26)", softLabel: "Android 11 (API 30)",
                  engineNote: "note" }
      });
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None, help="page to drive (default: bundled assets)")
    ap.add_argument("--shots", default=None, help="write screenshots into this directory")
    a = ap.parse_args()

    httpd = None
    url = a.url
    if not url:
        httpd, url = serve()

    results = None
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

        ok = suite.wait_until("!!document.getElementById('rsBar')", 20)
        suite.check("shim boots and builds the player bar", ok)

        if not ok:
            print("bar never appeared; page errors: %s" % errors[:5])
            browser.close()
            if httpd:
                httpd.shutdown()
            return 1

        suite.check("page is marked as an app and its desktop header is hidden",
                    page.evaluate("document.documentElement.classList.contains('rs-app') && "
                                  "getComputedStyle(document.querySelector('header.studio')).display === 'none'"))
        suite.check("the page's own API is present (nothing about it was forked)",
                    page.evaluate("!!(window.__gnauralAPI && window.__gnauralAPI.state)"))
        suite.shot("1-bar.png")

        # ---- pick a session -------------------------------------------------------
        page.click("#plist .item")
        named = suite.wait_until("document.getElementById('rsTitle').textContent.trim() !== 'Pick a session'")
        title = page.evaluate("document.getElementById('rsTitle').textContent.trim()")
        suite.check("picking a session names it in the bar", named, title)

        # ---- play / pause / stop, and the state the service eats ------------------
        clock0 = page.evaluate("document.getElementById('clock').textContent")
        page.click("#rsBar [data-rs='play']")
        advanced = suite.wait_until(
            "document.getElementById('clock').textContent !== %s" % json.dumps(clock0), 8)
        suite.check("bar Play actually starts the session (clock advances)", advanced,
                    page.evaluate("document.getElementById('clock').textContent"))
        c = suite.wait_call("state", pred=lambda args: args and args[0] is True)
        suite.check("playing state is pushed to the native service", c is not None, c)
        suite.check("the service hears the session name", c is not None and c["a"][1] == title,
                    c["a"][1] if c else None)

        page.click("#rsBar [data-rs='play']")
        paused = suite.wait_until("window.__gnauralAPI.state.playing === false", 8)
        suite.check("bar Play pauses again", paused)
        c = suite.wait_call("state", pred=lambda args: args and args[0] is False)
        suite.check("paused state is pushed to the service", c is not None)

        # the service-driven path: window.__rs.play()/pause() is what the lock screen calls
        page.evaluate("window.__rs.play()")
        resumed = suite.wait_until("window.__gnauralAPI.state.playing === true", 8)
        suite.check("the lock screen's play path resumes the page", resumed)
        page.evaluate("window.__rs.pause()")
        suite.wait_until("window.__gnauralAPI.state.playing === false", 8)

        page.click("#rsBar [data-rs='stop']")
        stopped = suite.wait_until("window.__gnauralAPI.state.playing === false && "
                                   "document.getElementById('clock').textContent.indexOf('0:00') === 0", 8)
        suite.check("bar Stop stops and rewinds", stopped)

        # ---- the menu sheet --------------------------------------------------------
        page.click("#rsBar [data-rs='menu']")
        suite.check("the menu opens from the bar", suite.wait_until("!!document.getElementById('rsSheet') && document.getElementById('rsSheet').classList.contains('rs-open')"))
        suite.shot("2-menu.png")

        # volume slider drives the page's own master control
        page.evaluate("(() => { const v = document.getElementById('rsVol'); v.value = '0.25'; "
                      "v.dispatchEvent(new Event('input', { bubbles: true })); })()")
        suite.check("menu volume drives the studio master gain",
                    abs(page.evaluate("parseFloat(document.getElementById('master').value)") - 0.25) < 0.001)

        # skin row cycles skins and the chip follows
        skin0 = page.evaluate("document.documentElement.getAttribute('data-skin')")
        page.click(".rs-mrow[data-act='skin']")
        page.wait_for_timeout(250)
        skin1 = page.evaluate("document.documentElement.getAttribute('data-skin')")
        chip = page.evaluate("document.getElementById('rsChip_skin').textContent")
        suite.check("menu Skin row cycles the skin (and the chip shows it)",
                    skin1 != skin0 and chip == skin1, "%s -> %s / chip=%s" % (skin0, skin1, chip))

        # focus mode row mirrors the page's own toggle
        page.click(".rs-mrow[data-act='focus']")
        page.wait_for_timeout(200)
        foc1 = page.evaluate("document.body.classList.contains('focus')")
        page.click(".rs-mrow[data-act='focus']")
        page.wait_for_timeout(200)
        foc2 = page.evaluate("document.body.classList.contains('focus')")
        suite.check("menu Focus mode toggles the page's focus mode", foc1 is True and foc2 is False,
                    "%s -> %s" % (foc1, foc2))

        # a jump row scrolls to the card it names
        page.click(".rs-mrow[data-act='#voicelist']")
        jumped = suite.wait_until("window.scrollY > 400", 6)
        suite.check("menu rows jump to the studio's own cards (Voices)", jumped,
                    page.evaluate("Math.round(window.scrollY)"))
        closed = suite.wait_until("!document.getElementById('rsSheet').classList.contains('rs-open')")
        suite.check("the sheet closes when a jump is taken", closed)

        # drag the bar up opens the sheet; tap the grabber closes it
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        box = page.evaluate("(() => { const r = document.getElementById('rsBar').getBoundingClientRect();"
                            " return { x: r.x + r.width/2, y: r.y + 12 }; })()")
        page.mouse.move(box["x"], box["y"])
        page.mouse.down()
        page.mouse.move(box["x"], box["y"] - 90, steps=6)
        page.mouse.up()
        dragged = suite.wait_until("document.getElementById('rsSheet').classList.contains('rs-open')")
        suite.check("dragging the bar up opens the menu", dragged)
        if dragged:
            page.evaluate("document.getElementById('rsGrab').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, clientY: 0 }))")
            page.evaluate("document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, clientY: 0 }))")
            suite.check("tapping the grabber closes the menu",
                        suite.wait_until("!document.getElementById('rsSheet').classList.contains('rs-open')", 4))

        # ---- fullscreen visualizer --------------------------------------------------
        page.evaluate("window.ResonanceViz && window.ResonanceViz.api.enable(true)")
        page.wait_for_timeout(700)
        page.click("#rsBar [data-rs='viz']")
        infs = suite.wait_until("document.documentElement.classList.contains('rs-fs')", 6)
        suite.check("the visualizer button goes fullscreen", infs)
        if infs:
            page.wait_for_timeout(900)          # the page refits after our resize event
            size = page.evaluate("(() => { const c = document.querySelector('#rsFsStage [data-viz-panel]');"
                                 " if (!c) return null; const r = c.getBoundingClientRect();"
                                 " return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight }; })()")
            suite.check("the moved canvas fills the screen", size and abs(size["w"] - size["vw"]) < 8 and abs(size["h"] - size["vh"]) < 8, size)
            # the first frames after a resize can be empty while the scene warms up, and a
            # busy CI runner renders slower than a laptop - so poll for paint rather than
            # sleeping a fixed time and hoping
            lit = 0
            for _ in range(12):
                lit = page.evaluate("(() => { const c = document.querySelector('#rsFsStage .viz-canvas');"
                                    " if (!c) return -1; const x = c.getContext('2d');"
                                    " const d = x.getImageData(0, 0, c.width, c.height).data;"
                                    " let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++; return n; })()")
                if isinstance(lit, int) and lit > 0:
                    break
                page.wait_for_timeout(500)
            suite.check("the fullscreen canvas is genuinely painting", isinstance(lit, int) and lit > 0, "lit=%s" % lit)
            suite.check("fullscreen has the embedded play/pause at the bottom",
                        page.evaluate("!!document.querySelector('#rsFsCtl [data-rs=fsPlay]')"))
            page.click("#rsFsCtl [data-rs='fsPlay']")
            page.wait_for_timeout(400)
            advanced2 = suite.wait_until("window.__gnauralAPI.state.playing === true", 6)
            suite.check("the embedded play button starts playback", advanced2)
            page.evaluate("window.__rs.stop()")
            suite.shot("3-fullscreen.png")
            # Android's back button == history back
            page.evaluate("history.back()")
            back = suite.wait_until("!document.documentElement.classList.contains('rs-fs')", 6)
            suite.check("back leaves fullscreen", back)
            home = page.evaluate("(() => { const c = document.querySelector('[data-viz-panel]');"
                                 " return c ? (c.closest('.viz-inline') ? 'inline' : 'other') : 'missing'; })()")
            suite.check("the panel returns to its column", home == "inline", home)

        # tap a visual panel to enter, X to leave
        page.evaluate("document.querySelector('[data-viz-host]').scrollIntoView({ block: 'center' })")
        page.wait_for_timeout(400)
        page.evaluate("document.querySelector('[data-viz-host] .viz-canvas').dispatchEvent(new MouseEvent('click', { bubbles: true }))")
        suite.check("tapping the visual panel goes fullscreen",
                    suite.wait_until("document.documentElement.classList.contains('rs-fs')", 6))
        page.click("#rsFsTop [data-rs='fsExit']")
        suite.check("the X leaves fullscreen",
                    suite.wait_until("!document.documentElement.classList.contains('rs-fs')", 6))

        # ---- files: .gnaural save, pack save, share link -----------------------------
        page.evaluate("window.scrollTo(0, 0)")
        expected = page.evaluate("window.__gnauralAPI.toGnauralText().length")
        page.click("#saveGnm")
        c = suite.wait_call("fileEnd", timeout=12)
        suite.check("Save .gnaural streams the real file to the shell",
                    c is not None and c["a"][0] == expected, "%s vs %s" % (c and c["a"][0], expected))
        start = suite.last_call("fileStart")
        suite.check("the save has a sensible name", start is not None and start["a"][0].endswith(".gnaural"),
                    start and start["a"][0])

        page.click("#pklist a")
        c = suite.wait_call("saveAsset", timeout=8)
        suite.check("a pack download saves the bundled zip with no network",
                    c is not None and c["a"][0].startswith("www/app/pack/") and c["a"][0].endswith(".zip"),
                    c and c["a"])

        page.evaluate("document.getElementById('shareBtn').scrollIntoView({ block: 'center' })")
        page.click("#shareBtn")
        c = suite.wait_call("copy", timeout=8, pred=lambda args: args and "#s=" in str(args[0]))
        suite.check("share link is copied, rewritten to the real site address",
                    c is not None and str(c["a"][0]).startswith("https://moddys.net/resonance/app/"),
                    c and str(c["a"][0])[:90])

        # ---- external links leave the app -------------------------------------------
        page.evaluate("document.querySelector('footer a[href=\\'../credits/\\']').click()")
        c = suite.wait_call("url", timeout=8)
        suite.check("site links (credits/help) are handed to the phone's browser",
                    c is not None and c["a"][0] == "https://moddys.net/resonance/credits/",
                    c and c["a"])

        # ---- guide / check / about / update strip -------------------------------------
        page.evaluate("window.__rs.guide()")
        suite.check("the quick guide opens", suite.wait_until("!!document.getElementById('rsGuide') && document.getElementById('rsGuide').classList.contains('rs-ov-on')"))
        suite.shot("4-guide.png")
        page.click("#rsGuide [data-ov-x]")
        suite.check("the guide closes", suite.wait_until("!document.getElementById('rsGuide').classList.contains('rs-ov-on')"))

        page.evaluate("window.__rs.check()")
        suite.check("the device check opens", suite.wait_until("!!document.getElementById('rsCheck') && document.getElementById('rsCheck').classList.contains('rs-ov-on')"))
        page.click("#rsCopyReport")
        c = suite.wait_call("copy", timeout=6, pred=lambda args: args and "WebView:" in str(args[0]))
        suite.check("the check report copies as plain text", c is not None)
        page.click("#rsCheck [data-ov-x]")
        suite.wait_until("!document.getElementById('rsCheck').classList.contains('rs-ov-on')")

        page.evaluate("""window.__rsUpdate.available({version: "9.9.9", url: "https://moddys.net/x.apk", sha256: "ab", notes: ""})""")
        suite.check("an available update shows the update strip", suite.wait_until("!!document.getElementById('rsUpd') && getComputedStyle(document.getElementById('rsUpd')).display !== 'none'"))
        page.click("#rsUpd [data-rs-upd='later']")
        suite.check("'Later' hides the update strip",
                    page.evaluate("getComputedStyle(document.getElementById('rsUpd')).display === 'none'"))

        # search + keyboard dismissal (the shell's own contract)
        page.evaluate("window.scrollTo(0, 0)")
        page.click("#search")
        page.fill("#search", "sleep")
        page.keyboard.press("Enter")
        c = suite.wait_call("dismissKeyboard", timeout=6)
        suite.check("committing a search dismisses the keyboard", c is not None)

        # reload: the shell reinjects and the bar comes back
        page.reload(wait_until="load")
        page.add_script_tag(content=SHIM)
        suite.check("the shim survives a reload (renderer rebuilt)",
                    suite.wait_until("!!document.getElementById('rsBar')", 15))

        # ---- hygiene -------------------------------------------------------------------
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
