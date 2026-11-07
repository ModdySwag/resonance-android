#!/usr/bin/env python3
"""Render the eight focus scenes and cut their stills, then gate similarity.

The still is the live renderer's own frame (not a generated image), so the
picker preview, the reduced-motion view and the similarity gate all show the
same thing the phone draws.

    py -3.11 tools/scene_stills.py            # capture + cut stills
    py -3.11 tools/scene_stills.py --check    # similarity report only

Writes app/src/main/assets/www/app/ui/scene/<id>-still.webp (480 px wide,
portrait, matching the phone's full-screen panel).
"""
import argparse
import base64
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import shim_harness as H  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402
from PIL import Image  # noqa: E402

OUT = os.path.join(H.WWW, "app", "ui", "scene")
SCENES = ["cathedral", "deepfield", "ink", "aurora", "ember", "rain", "spiral", "plankton"]
IDS = ["focus-" + s for s in SCENES]


def capture(tw, settle):
    httpd, url = H.serve()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                      has_touch=True, is_mobile=True)
            page = ctx.new_page()
            page.add_init_script(H.BRIDGE)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(url, wait_until="load")
            page.evaluate("try { localStorage.setItem('resonance.app.theme.v1', "
                          "JSON.stringify({ tour: 'done' })) } catch (e) {}")
            page.add_script_tag(content=H.SHIM)
            page.wait_for_timeout(900)
            page.evaluate("window.__rs.nav('vis')")
            page.wait_for_timeout(500)
            page.click("#rsFocusGo")
            page.wait_for_timeout(1200)
            for sid in IDS:
                page.evaluate("window.ResonanceViz.api.applyScene(%r)" % sid)
                page.wait_for_timeout(int(settle * 1000))
                data = page.evaluate("(() => { const c = document.querySelector('#rsFsStage .viz-canvas');"
                                     " return c ? c.toDataURL('image/png') : ''; })()")
                if not data:
                    print("MISS", sid)
                    continue
                im = Image.open(io.BytesIO(base64.b64decode(data.split(",", 1)[1]))).convert("RGB")
                # the panel is portrait at 2x; keep the full frame, cut to 480 wide
                w = tw
                h = round(im.height * w / im.width)
                im = im.resize((w, h), Image.LANCZOS)
                path = os.path.join(OUT, sid.replace("focus-", "") + "-still.webp")
                im.save(path, "WEBP", quality=76, method=6)
                print("%-18s %4dx%-5d %6d B" % (sid, w, h, os.path.getsize(path)))
            print("page errors:", errors[:3])
            browser.close()
    finally:
        httpd.shutdown()


def check():
    try:
        import numpy as np
    except ImportError:
        print("numpy missing: cannot run the similarity gate")
        return 1
    grids, means = {}, {}
    for s in SCENES:
        p = os.path.join(OUT, s + "-still.webp")
        if not os.path.exists(p):
            print("missing", p)
            return 1
        im = Image.open(p).convert("L")
        means[s] = sum(im.resize((16, 16), Image.LANCZOS).getdata()) / 256
        grids[s] = np.asarray(im.resize((32, 32), Image.LANCZOS), dtype=np.float32) / 255.0

    def struct(a, b):
        aa = a.ravel() - a.mean()
        bb = b.ravel() - b.mean()
        return float(1 - (aa * bb).sum() / np.sqrt((aa * aa).sum() * (bb * bb).sum()))

    def dhash(a, b):
        ha = (a[:, :-1] > a[:, 1:]).ravel()
        hb = (b[:, :-1] > b[:, 1:]).ravel()
        return int((ha != hb).sum())

    rows = []
    for i in range(len(SCENES)):
        for j in range(i + 1, len(SCENES)):
            a, b = SCENES[i], SCENES[j]
            rows.append((struct(grids[a], grids[b]), dhash(grids[a], grids[b]), a, b))
    rows.sort()
    print("%-12s %-12s %9s %6s" % ("a", "b", "struct", "dHash"))
    for sd, dh, a, b in rows[:8]:
        print("%-12s %-12s %9.3f %6d" % (a, b, sd, dh))
    worst = rows[0]
    print("\nclosest pair: %s / %s  struct=%.3f  dHash=%d" % (worst[2], worst[3], worst[0], worst[1]))
    dark = [k for k, v in means.items() if v < 8]
    print("dark stills:", dark or "none")
    ok = worst[0] >= 0.15 and worst[1] >= 250 and not dark
    print("GATE", "PASS" if ok else "FAIL", "(struct>=0.15, dHash>=250, no still under mean 8)")
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--width", type=int, default=480)
    ap.add_argument("--settle", type=float, default=7.0)
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if a.check:
        return check()
    capture(a.width, a.settle)
    return check()


if __name__ == "__main__":
    sys.exit(main())
