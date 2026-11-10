#!/usr/bin/env python3
"""Render the Android card's screenshots for moddys.net's downloads page.

The site card shows three tall phone shots and one wide tablet shot. They are rendered
from the same bundled page + shell as the Play set (`tools/play_assets.py`), at the pixel
sizes the card asks for, so the site cannot drift from the app:

    phone  780x1688   (390x844 CSS @2, the card's 260x563 slot)
    wide  1280x800    (rendered at @2 and downscaled, the card's 380x238 slot)

Writes full + `-t.jpg` thumbnails straight into the site tree. Re-runnable: every output
is overwritten.

    python tools/site_shots.py                       # -> C:/Users/Moddy/radio-browser/deploy/shots
    python tools/site_shots.py --out <dir>
"""
import argparse
import os
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
DEFAULT_OUT = r"C:/Users/Moddy/radio-browser/deploy/shots"

# role, screen, action
PHONE = [
    ("resonance-android-home", "home", None),
    ("resonance-android-sessions", "sessions", None),
    ("resonance-android-chamber", "chamber", None),
]
THUMB_TALL = (260, 563)
THUMB_WIDE = (380, 238)


def render_phone(page, where, act):
    if where == "chamber":
        page.evaluate("window.__rs.nav('vis')")
        page.wait_for_timeout(400)
        page.evaluate("window.__rs.chamber()")
        page.wait_for_timeout(700)
        page.evaluate("window.ResonanceCymatics.api.scene('cathedral')")
        page.wait_for_timeout(2200)
    else:
        page.evaluate("window.__rs.nav(%r)" % where)
        page.wait_for_timeout(450)


def save_jpg(src, out_path, size=None):
    im = Image.open(src).convert("RGB")
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(out_path, "JPEG", quality=84, optimize=True, progressive=True)
    return im.size, os.path.getsize(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT, help="dir to write the jpgs into")
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)

    import play_assets as pa

    httpd, url = pa.serve()
    tmp = os.path.join(out, ".render")
    os.makedirs(tmp, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])

        # ---- three tall phone shots: 390x844 @2 = 780x1688 ---------------------------
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  has_touch=True, is_mobile=True, color_scheme="dark")
        page = ctx.new_page()
        page.set_default_timeout(15000)
        page.add_init_script(pa.BRIDGE)
        page.goto(url, wait_until="load")
        page.add_script_tag(content=pa.SHIM)
        page.wait_for_selector("#rsApp", timeout=20000)
        page.wait_for_timeout(1800)
        pa.prep(page)
        for name, where, act in PHONE:
            render_phone(page, where, act)
            png = os.path.join(tmp, name + ".png")
            page.screenshot(path=png)
            size, n = save_jpg(png, os.path.join(out, name + ".jpg"))
            print("  shot %-32s %s  %d B" % (name + ".jpg", size, n))
            tsize, tn = save_jpg(png, os.path.join(out, name + "-t.jpg"), THUMB_TALL)
            print("  thumb %-31s %s  %d B" % (name + "-t.jpg", tsize, tn))
            if where == "chamber":
                page.evaluate("window.ResonanceCymatics.close()")
                page.wait_for_timeout(300)
        ctx.close()

        # ---- one wide tablet shot: 1280x800, rendered @2 and downscaled --------------
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2,
                                   has_touch=True, color_scheme="dark")
        p2 = ctx2.new_page()
        p2.set_default_timeout(15000)
        p2.add_init_script(pa.BRIDGE)
        p2.goto(url, wait_until="load")
        p2.add_script_tag(content=pa.SHIM)
        p2.wait_for_selector("#rsApp", timeout=20000)
        p2.wait_for_timeout(2000)
        pa.prep(p2)
        p2.evaluate("window.__rs.nav('studio')")
        p2.wait_for_timeout(600)
        png = os.path.join(tmp, "resonance-android-tablet.png")
        p2.screenshot(path=png)
        im = Image.open(png).convert("RGB").resize((1280, 800), Image.LANCZOS)
        im.save(os.path.join(out, "resonance-android-tablet.jpg"), "JPEG", quality=84,
                optimize=True, progressive=True)
        print("  shot %-32s %s  %d B" % ("resonance-android-tablet.jpg", im.size,
                                         os.path.getsize(os.path.join(out, "resonance-android-tablet.jpg"))))
        im.resize(THUMB_WIDE, Image.LANCZOS).save(os.path.join(out, "resonance-android-tablet-t.jpg"),
                                                  "JPEG", quality=84, optimize=True, progressive=True)
        print("  thumb %-31s %s  %d B" % ("resonance-android-tablet-t.jpg", THUMB_WIDE,
                                          os.path.getsize(os.path.join(out, "resonance-android-tablet-t.jpg"))))
        ctx2.close()
        browser.close()
    httpd.shutdown()
    print("done ->", out)


if __name__ == "__main__":
    sys.exit(main())
