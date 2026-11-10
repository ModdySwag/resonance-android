#!/usr/bin/env python3
"""Tour-bubble fit gate: the walkthrough bubble must never leave the glass.

Owner report: on a phone he does not own, a step bubble was half off the screen. The
bubble is placed by estimating its height, so any glass where the text wraps differently
(landscape, small screen, enlarged system font) or that changes under an open tour
(rotation) can put it outside the safe band. The shell now fits and re-aims it; this
tool is the check that keeps that honest.

It boots the real bundled page with the real shim (the same way shim_harness.py does),
walks all nine stops at a matrix of glass sizes, then rotates with the tour open, and
asserts the bubble rests inside [8, vw-8] x [ceil, floor] with its Next key hittable.

    py -3.11 tools/tour_fit.py            # the gate
    py -3.11 tools/tour_fit.py --shots D  # also drop a screenshot per glass size

Exit code is nonzero when any bubble leaves the band.
"""
import argparse
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shim_harness import BRIDGE, SHIM, serve  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

# label, w, h, safe-top, safe-bottom, text scale (Android system font / textZoom)
CASES = [
    ("320x480 xs", 320, 480, 24, 0, 1.0),
    ("320x568 SE", 320, 568, 24, 0, 1.0),
    ("360x640 small", 360, 640, 24, 0, 1.0),
    ("390x844 reference", 390, 844, 47, 34, 1.0),
    ("412x915 android", 412, 915, 30, 24, 1.0),
    ("411x960 xperia", 411, 960, 36, 24, 1.0),
    ("412x1000 pixel", 412, 1000, 32, 24, 1.0),
    ("844x390 landscape", 844, 390, 24, 0, 1.0),
    ("800x360 landscape", 800, 360, 24, 0, 1.0),
    ("411x960 text 130%", 411, 960, 36, 24, 1.3),
    ("411x960 text 160%", 411, 960, 36, 24, 1.6),
    ("411x960 text 200%", 411, 960, 36, 24, 2.0),
    ("360x640 text 160%", 360, 640, 24, 0, 1.6),
    ("360x640 text 200%", 360, 640, 24, 0, 2.0),
    ("390x844 text 200%", 390, 844, 47, 34, 2.0),
    ("844x390 text 160%", 844, 390, 24, 0, 1.6),
]

BIGTEXT = ("#rsTour .rs-t-bub{font-size:%.1fpx}#rsTour .rs-t-step{font-size:%.1fpx}"
           "#rsTour .rs-t-t{font-size:%.1fpx}#rsTour .rs-t-b{font-size:%.1fpx}"
           "#rsTour .rs-t-foot button{font-size:%.1fpx}")

PROBE = """(step) => {
  const b = document.querySelector('#rsTour .rs-t-bub');
  const q = b.getBoundingClientRect();
  const rootStyle = getComputedStyle(document.documentElement);
  const safeT = parseFloat(rootStyle.getPropertyValue('--rs-safe-t')) || 0;
  const safeB = parseFloat(rootStyle.getPropertyValue('--rs-safe-b')) || 0;
  const ceil = Math.max(8, safeT + 8);
  let floor = innerHeight - 8 - safeB;
  const nav = document.getElementById('rsNav');
  if (nav) {
    const nr = nav.getBoundingClientRect();
    if (nr.height && nr.top > 0) floor = Math.min(floor, nr.top - 10);
  }
  const next = document.querySelector('#rsTour .rs-t-next');
  const nr = next ? next.getBoundingClientRect() : null;
  const hit = nr ? document.elementFromPoint(nr.left + nr.width / 2, nr.top + nr.height / 2) : null;
  return {
    step, y: Math.round(q.y), h: Math.round(q.height), x: Math.round(q.x), w: Math.round(q.width),
    ceil: Math.round(ceil), floor: Math.round(floor),
    over_top: Math.round(Math.max(0, ceil - q.top)),
    over_bottom: Math.round(Math.max(0, q.bottom - floor)),
    over_left: Math.round(Math.max(0, 8 - q.left)),
    over_right: Math.round(Math.max(0, q.right - (innerWidth - 8))),
    next_hit: !!hit && (hit === next || (next && next.contains(hit))),
    body_scrolls: (() => { const p = document.getElementById('rsTourB');
      return p ? Math.round(p.scrollHeight - p.clientHeight) : 0; })(),
  };
}"""

STABLE = """(() => {
  const b = document.querySelector('#rsTour .rs-t-bub');
  if (!b) return false;
  const r = b.getBoundingClientRect();
  if (r.width < 100) return false;
  const k = Math.round(r.y) + ':' + Math.round(r.height);
  window.__rest = (window.__rest || []).concat([k]).slice(-3);
  return window.__rest.length === 3 && window.__rest[0] === window.__rest[2];
})()"""


def overflow(row):
    out = []
    for k, label in (("over_top", "top"), ("over_bottom", "bottom"),
                     ("over_left", "left"), ("over_right", "right")):
        if row[k]:
            out.append("%s+%d" % (label, row[k]))
    if not row["next_hit"]:
        out.append("next-unhittable")
    return out


def walk(page, shots=None, tag=""):
    """Walk the nine stops, measuring each bubble at rest."""
    rows = []
    for step in range(1, 10):
        page.wait_for_timeout(700)
        try:
            page.wait_for_function(STABLE, timeout=6000)
        except Exception:
            pass
        rows.append(page.evaluate(PROBE, step))
        page.evaluate("window.__rest = []")
        if shots and step == 1:
            page.screenshot(path=os.path.join(shots, "tour-%s.png" % tag))
        page.click("#rsTour .rs-t-next")
    return rows


def boot(browser, url, w, h, st, sb, scale):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2,
                              has_touch=True, is_mobile=True)
    page = ctx.new_page()
    page.add_init_script(BRIDGE)
    page.goto(url, wait_until="load")
    page.evaluate("localStorage.removeItem('resonance.app.theme.v1')")
    page.add_script_tag(content=SHIM)
    page.evaluate("document.documentElement.style.setProperty('--rs-safe-t','%dpx');"
                  "document.documentElement.style.setProperty('--rs-safe-b','%dpx')" % (st, sb))
    if scale != 1.0:
        page.add_style_tag(content=BIGTEXT % tuple(round(v * scale, 1)
                                                   for v in (14, 11, 17, 14, 14)))
    page.wait_for_function("!!document.getElementById('rsTour') && "
                           "document.getElementById('rsTour').classList.contains('rs-t-on')",
                           timeout=15000)
    return ctx, page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default=None, help="write one screenshot per glass size here")
    a = ap.parse_args()
    if a.shots:
        os.makedirs(a.shots, exist_ok=True)

    httpd, url = serve()
    failed = 0
    checked = 0
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])

            for label, w, h, st, sb, scale in CASES:
                ctx, page = boot(browser, url, w, h, st, sb, scale)
                rows = walk(page, a.shots, label.replace(" ", "-").replace("%", "pct"))
                ctx.close()
                bad = [(r["step"], overflow(r)) for r in rows if overflow(r)]
                checked += len(rows)
                failed += len(bad)
                print("[%s] %-20s %4dx%-4d band %d..%d" % (
                    "ok " if not bad else "BAD", label, w, h, rows[0]["ceil"], rows[0]["floor"]))
                for step, why in bad:
                    r = next(x for x in rows if x["step"] == step)
                    print("      step %d: y%d..%d h%d  %s" % (step, r["y"], r["y"] + r["h"],
                                                              r["h"], " ".join(why)))

            # ---- rotation with the tour open --------------------------------------
            # this is the case a phone-only tester cannot retest on every device: the
            # bubble is placed in portrait, then the glass turns under it.
            ctx, page = boot(browser, url, 411, 960, 36, 24, 1.0)
            page.wait_for_timeout(900)
            page.evaluate("window.__rest = []")
            page.wait_for_function(STABLE, timeout=6000)
            before = page.evaluate(PROBE, "portrait")
            page.set_viewport_size({"width": 960, "height": 411})
            page.wait_for_timeout(900)
            page.evaluate("window.__rest = []")
            try:
                page.wait_for_function(STABLE, timeout=6000)
            except Exception:
                pass
            after = page.evaluate(PROBE, "landscape")
            page.screenshot(path=os.path.join(a.shots, "tour-rotated.png")) if a.shots else None
            ctx.close()
            checked += 2
            bad = overflow(after)
            failed += len(bad)
            print("[%s] rotation 411x960 -> 960x411   portrait y%d h%d / landscape y%d h%d band %d..%d" % (
                "ok " if not bad else "BAD", before["y"], before["h"], after["y"], after["h"],
                after["ceil"], after["floor"]))
            if bad:
                print("      " + " ".join(bad))

            browser.close()
    finally:
        httpd.shutdown()

    print("\n== %d bubble placements measured, %d outside the band" % (checked, failed))
    if not failed:
        print("ALL BUBBLES INSIDE THE BAND")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
