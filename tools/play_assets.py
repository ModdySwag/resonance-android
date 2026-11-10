#!/usr/bin/env python3
"""Render the Play Store asset set from the real app, in the sizes the console demands.

Phone screenshots are 1080x1920 (9:16) - a 432x768 viewport at device_scale_factor 2.5,
which lands on 1080x1920 with no resampling. 432 px is the CSS width this shell is drawn
for (the owner's phone measures 433), so the shot is the phone layout rather than a
360-wide squeeze of it.

The icon is 512x512 and the feature graphic 1024x500. Everything is rendered from the
bundled page with the shell injected, so a shot can never show a UI that does not exist.

Two things gate the first screen in 2.1.0: the safety notice and the welcome tour (the
tour sits over the tiles and intercepts the tap). Both are acknowledged in the stored
prefs before the page boots, so a shot shows the app as it looks after a person has said
yes once - not the gate itself.

These are WEB RENDERS: the notification, lock screen and system dialogs only exist on a
device, so they are not in the set and the listing says so.

    python tools/play_assets.py            # -> store/
"""
import functools
import http.server
import os
import socketserver
import sys
import threading

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
WWW = os.path.join(PROJECT, "app", "src", "main", "assets", "www")
OUT = os.path.join(PROJECT, "store")
SHIM = open(os.path.join(WWW, "_shell_shim.js"), encoding="utf-8").read()

SHOT_W, SHOT_H, SHOT_DSF = 432, 768, 2.5      # -> 1080x1920 exactly

BRIDGE = r"""
(() => {
  if (window.ResonanceJs) return;
  try {
    localStorage.setItem("resonance.app.theme.v1",
      JSON.stringify({notice: 1, tour: "done", ui: "full"}));
  } catch (e) {}
  window.ResonanceJs = {
    state(){}, log(){}, url(){}, dismissKeyboard(){}, copy(){ return true; },
    channel(){ return "sideload"; },
    device(){ return JSON.stringify({manufacturer:"Google",model:"Pixel 7",api:34,release:"14",
      app:"2.1.0",webview:"Chrome 126",engine:"Chrome 126",engineLabel:"WebView",
      platform:"android",osName:"Android",notifications:true,density:"420",
      system:"Android 14 (API 34)",compat:{supported:true,recommended:true,
      system:"Android 14 (API 34)",hardLabel:"Android 8.0",softLabel:"Android 11",engineNote:""}}); },
    palette(){ return ""; },
    fileStart(){ return true; }, fileChunk(){ return true; }, fileEnd(){ return "ok:x"; },
    saveAsset(){ return "ok:x"; }, updateApp(){}, checkUpdate(){}
  };
})();
"""

SHELL = """<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%%;background:#0E1211;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,Roboto,'Segoe UI',sans-serif}
  .wrap{display:flex;flex-direction:column;align-items:center;gap:34px}
  .ring{position:relative;width:%(ring)dpx;height:%(ring)dpx;border-radius:50%%;
    background:radial-gradient(circle at 50%% 45%%,#12463F,#0E1211 70%%);
    display:flex;align-items:center;justify-content:center;border:%(bw)dpx solid #7FDCCB}
  svg{width:%(g)dpx;height:%(g)dpx}
  .name{font-size:%(n)dpx;font-weight:700;letter-spacing:-.02em;color:#E6ECEA}
  .tag{font-size:%(t)dpx;color:#A7B5B1;margin-top:-18px}
</style></head><body><div class="wrap">
  <div class="ring">%(svg)s</div>%(text)s
</div></body></html>"""

GLYPH = """<svg viewBox="0 0 108 108" fill="none" aria-hidden="true">
  <circle cx="54" cy="54" r="20" stroke="#7FDCCB" stroke-width="3.4"/>
  <circle cx="54" cy="54" r="14" stroke="#7FDCCB" stroke-width="2" opacity=".55"/>
  <path d="M40 54h4.5l3-7 4.5 14 4-10 3 6 4.5-3h6.5" stroke="#E9B972" stroke-width="3.4"
    stroke-linecap="round"/>
</svg>"""


class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    h = functools.partial(Q, directory=WWW)
    s = socketserver.ThreadingTCPServer(("127.0.0.1", 0), h)
    s.daemon_threads = True
    port = s.server_address[1]
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, "http://127.0.0.1:%d/app/index.html" % port


def prep(page):
    """The once-only gate, already answered: notice acknowledged, tour finished."""
    page.evaluate("""() => {
      try {
        const k = "resonance.app.theme.v1";
        const p = JSON.parse(localStorage.getItem(k) || "{}");
        p.notice = 1; p.tour = "done"; p.ui = "full";
        localStorage.setItem(k, JSON.stringify(p));
      } catch (e) {}
      const n = document.getElementById("rsNotice"); if (n) n.remove();
      const t = document.getElementById("rsTour"); if (t) t.remove();
      const c = document.documentElement.className;
      document.documentElement.className = c.replace(/\\brs-t-on\\b/g, "")
        .replace(/\\brs-navhide\\b/g, "").replace(/\\brs-minihide\\b/g, "");
    }""")


def main():
    os.makedirs(OUT, exist_ok=True)
    httpd, url = serve()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])

        # ---- phone screenshots: 432x768 @2.5 = 1080x1920 ----------------------------
        ctx = browser.new_context(viewport={"width": SHOT_W, "height": SHOT_H},
                                  device_scale_factor=SHOT_DSF,
                                  has_touch=True, is_mobile=True, color_scheme="dark")
        page = ctx.new_page()
        page.set_default_timeout(15000)
        page.add_init_script(BRIDGE)
        page.goto(url, wait_until="load")
        page.add_script_tag(content=SHIM)
        page.wait_for_selector("#rsApp", timeout=20000)
        page.wait_for_timeout(1800)
        prep(page)

        shots = [
            ("01-home.png", "home", None),
            ("03-sessions.png", "sessions", None),
            ("04-studio.png", "studio", None),
            ("05-visualise.png", "vis", None),
            ("06-chamber.png", "chamber", None),
            ("07-settings.png", "settings", None),
            # last: it starts a session, and the toast it raises sits over the next screen
            ("02-playing.png", "home", "play"),
        ]
        for name, where, act in shots:
            if where == "chamber":
                page.evaluate("window.__rs.nav('vis')")
                page.wait_for_timeout(400)
                page.evaluate("window.__rs.chamber()")
                page.wait_for_timeout(700)
                # a preset with a readable Chladni figure; the session's default plate
                # resolves to a two-lobe curve that photographs as a soft blur
                page.evaluate("window.ResonanceCymatics.api.scene('cathedral')")
                page.wait_for_timeout(2200)
            else:
                page.evaluate("window.__rs.nav(%r)" % where)
                page.wait_for_timeout(450)
                if act == "play":
                    page.click("#rsStates .rs-tile")
                    # the shell's toast lasts 2600 ms; a shot must not carry it
                    page.wait_for_timeout(3200)
            path = os.path.join(OUT, name)
            page.screenshot(path=path)
            im = Image.open(path)
            mean = ImageStat.Stat(im.convert("L")).mean[0]
            print("  shot %-16s %s  mean %5.1f  %d B" % (name, im.size, mean, os.path.getsize(path)))
            if mean < 12:
                raise SystemExit("blank frame for %s (mean %.1f) - capture it again" % (name, mean))
            if where == "chamber":
                page.evaluate("window.ResonanceCymatics.close()")
                page.wait_for_timeout(300)
        page.evaluate("window.__rs.stop()")
        ctx.close()

        # ---- icon 512 and feature graphic 1024x500 ----------------------------------
        for name, w, h, ring, g, n, t, text in [
            ("icon-512.png", 512, 512, 300, 150, 0, 0, ""),
            ("feature-1024x500.png", 1024, 500, 210, 130, 46, 20,
             '<div class="name">Resonance Studio</div><div class="tag">Binaural, tones and noise — offline</div>'),
        ]:
            ctx2 = browser.new_context(viewport={"width": w, "height": h},
                                       device_scale_factor=1, color_scheme="dark")
            p2 = ctx2.new_page()
            p2.set_content(SHELL % {"ring": ring, "g": g, "n": n, "t": t,
                                    "bw": 3 if w <= 512 else 2, "svg": GLYPH, "text": text})
            p2.wait_for_timeout(250)
            p2.screenshot(path=os.path.join(OUT, name))
            print("shot", name)
            ctx2.close()
        browser.close()
    httpd.shutdown()
    print("done ->", OUT)


if __name__ == "__main__":
    sys.exit(main())
