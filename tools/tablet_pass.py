#!/usr/bin/env python3
"""Large-screen pass: drive the shell at tablet widths and measure every layer.

The main harness runs at 390x844 only. This probe boots the same shim against the same
bundled page at tablet sizes (portrait and landscape) and measures the layers a phone
never shows at that width: the More sheet, the help overlays, the welcome tour bubble,
the Ambient panels scene box, the Files & export card, the chamber, the fullscreen
visualiser and the focus view.

Hard checks (nonzero exit): horizontal overflow anywhere, a layer wider than the glass,
a tour bubble off screen, a control under 44 px tall, file rows out of rhythm.
Soft numbers are printed for the eye: content column width, tiles per row, line length.

Usage:
    python tools/tablet_pass.py                 # 800x1280 and 1280x800
    python tools/tablet_pass.py --shots DIR
"""
import argparse
import json
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from shim_harness import BRIDGE, SHIM, WWW, serve, Suite  # noqa: E402

VIEWPORTS = [("tablet-portrait", 800, 1280), ("tablet-landscape", 1280, 800)]


def boot(browser, url, w, h):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2,
                              has_touch=True, is_mobile=True)
    page = ctx.new_page()
    page.add_init_script(BRIDGE)
    page.goto(url, wait_until="load")
    page.evaluate("try { localStorage.setItem('resonance.app.theme.v1', "
                  "JSON.stringify({ tour: 'done' })) } catch (e) {}")
    page.add_script_tag(content=SHIM)
    return ctx, page


def overflow(page):
    return page.evaluate("""(() => {
      const d = document.documentElement;
      const worst = Math.max(d.scrollWidth, document.body.scrollWidth);
      return { scroll: worst, inner: innerWidth, over: worst - innerWidth };
    })()""")


def layer_rect(page, sel):
    return page.evaluate("""(sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width),
               h: Math.round(r.height), vw: innerWidth, vh: innerHeight,
               disp: s.display, z: s.zIndex };
    }""", sel)


def small_controls(page, root):
    return page.evaluate("""(root) => {
      const bad = [];
      document.querySelectorAll(root + ' button, ' + root + ' select, ' + root + ' input').forEach(e => {
        const q = e.getBoundingClientRect();
        if (!q.width || !q.height || e.type === 'checkbox') return;
        if (q.height < 44) bad.push((e.id || e.getAttribute('data-act') || e.textContent.trim().slice(0, 14))
                                    + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
      });
      return bad;
    }""", root)


def run_viewport(browser, url, label, w, h, shots):
    suite = Suite(None, shots)
    suite.page = None
    ctx, page = boot(browser, url, w, h)
    suite.page = page
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    ok = suite.wait_until("!!document.getElementById('rsApp')", 20)
    suite.check("[%s] the shell builds at %dx%d" % (label, w, h), ok)
    if not ok:
        print("page errors:", errors[:4])
        ctx.close()
        return suite
    page.wait_for_timeout(800)
    suite.check("[%s] no horizontal overflow on the phone screens" % label, overflow(page)["over"] <= 0,
                overflow(page))
    suite.shot("%s-1-home.png" % label)

    # the content column is measured, not asserted: a stretched phone layout is a look
    # question for the owner, not a hard failure.
    metrics = page.evaluate("""(() => {
      const q = s => { const e = document.querySelector(s); if (!e) return null;
        const r = e.getBoundingClientRect(); return { w: Math.round(r.width), x: Math.round(r.x),
          y: Math.round(r.y), h: Math.round(r.height) }; };
      const tiles = Array.from(document.querySelectorAll('.rs-tile')).map(t => {
        const r = t.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width) };
      });
      const rows = {};
      tiles.forEach(t => { (rows[t.y] = rows[t.y] || []).push(t); });
      const keys = Object.keys(rows).map(Number).sort((a, b) => a - b);
      const firstRow = rows[keys[0]] || [];
      const cols = new Set(firstRow.map(t => t.x)).size;
      // a short last row must be centred on the same axis as a full one
      const lastRow = rows[keys[keys.length - 1]] || [];
      const centred = lastRow.length === cols ? null
        : Math.round((lastRow[0].x + lastRow[lastRow.length - 1].x + lastRow[0].w) / 2);
      const cs = getComputedStyle(document.documentElement);
      const rail = cs.getPropertyValue('--rs-rail').trim();
      const nrail = cs.getPropertyValue('--rs-nrail').trim();
      return { body: q('#rsBody'), states: q('#rsStates'), hero: q('.rs-hero'),
               screen: q('.rs-screen.rs-on'), top: q('#rsTop'), nav: q('#rsNav'),
               appPad: getComputedStyle(document.getElementById('rsApp')).paddingLeft,
               cols: cols, rail: rail, nrail: nrail,
               rows: keys.length, lastRow: lastRow.length, centred: centred, mid: Math.round(innerWidth / 2),
               contentMid: Math.round((parseFloat(nrail) || 0)
                          + (innerWidth - (parseFloat(nrail) || 0)) / 2),
               tiles: tiles, title: getComputedStyle(document.querySelector('#rsTop h1')).fontSize };
    })()""")
    print("  metrics %s home: %s" % (label, json.dumps(metrics)))
    rail = int((metrics["rail"] or "0px").replace("px", "") or 0)
    nrail = int((metrics["nrail"] or "0px").replace("px", "") or 0)
    want_rail = min(w - nrail, rail) if rail else w
    want_x = nrail + (w - nrail - want_rail) / 2
    suite.check("[%s] the tab bar runs across the bottom, as on a phone" % label,
                metrics["nav"] is not None and metrics["nav"]["x"] == 0
                and metrics["nav"]["w"] >= w - 2
                and 50 <= metrics["nav"]["h"] <= 130
                and abs(metrics["nav"]["y"] + metrics["nav"]["h"] - h) <= 2,
                metrics["nav"])
    suite.check("[%s] the screens sit on one centred rail beyond it" % label,
                metrics["screen"] is not None
                and abs(metrics["screen"]["w"] - want_rail) <= 2
                and abs(metrics["screen"]["x"] - want_x) <= 2, metrics["screen"])
    suite.check("[%s] the app bar shares the rail's left edge" % label,
                metrics["top"] is not None and abs(metrics["top"]["x"] - want_x) <= 2,
                metrics["top"])
    suite.check("[%s] the module grid counts its columns, not its card width" % label,
                metrics["cols"] == 2, metrics["cols"])
    suite.check("[%s] the player and the modules share the screen at tablet width" % label,
                (metrics["hero"]["x"] + metrics["hero"]["w"] <= metrics["states"]["x"] + 2)
                if w >= 900 else (metrics["states"]["y"] >= metrics["hero"]["y"] + metrics["hero"]["h"] - 2),
                {"hero": metrics["hero"], "states": metrics["states"]})
    suite.check("[%s] a short last row is centred, not left hanging" % label,
                metrics["centred"] is None or abs(metrics["centred"] - metrics["contentMid"]) <= 2,
                {"centre": metrics["centred"], "mid": metrics["contentMid"], "row": metrics["lastRow"]})
    suite.check("[%s] module cards keep a card shape, not a banner" % label,
                all(150 <= t["w"] <= 380 for t in metrics["tiles"]),
                [t["w"] for t in metrics["tiles"]])


    # ---- the More sheet -------------------------------------------------------------
    # before anything is opened: the off-state must be off the glass, not a strip over
    # the nav bar that silently eats taps
    peek = page.evaluate("""(() => {
      const s = document.getElementById('rsSheet').getBoundingClientRect();
      const at = document.elementFromPoint(innerWidth / 2, innerHeight - 6);
      return { top: Math.round(s.top), vh: innerHeight,
               hit: at ? (at.id || at.className || at.tagName) : null };
    })()""")
    suite.check("[%s] the closed sheet starts off the glass" % label,
                peek["top"] >= peek["vh"] - 1 and "rsSheet" not in str(peek["hit"])
                and "rsGrab" not in str(peek["hit"]) and "rs-shead" not in str(peek["hit"]), peek)
    page.evaluate("document.documentElement.classList.remove('rs-navhide')")
    page.click("#rsOverflow")
    opened = suite.wait_until("document.getElementById('rsSheet').classList.contains('rs-open')", 5)
    suite.check("[%s] the More sheet opens" % label, opened)
    if opened:
        page.wait_for_timeout(500)
        sh = layer_rect(page, "#rsSheet")
        suite.check("[%s] the sheet fits the glass" % label,
                    sh and sh["x"] >= 0 and sh["w"] <= sh["vw"] and sh["y"] >= 0
                    and sh["y"] + sh["h"] <= sh["vh"] + 1, sh)
        suite.check("[%s] the sheet is a capped, centred panel, not the whole width" % label,
                    sh and sh["w"] <= 600 and abs(sh["x"] - (sh["vw"] - sh["w"]) / 2) <= 2, sh)
        bad = small_controls(page, "#rsSheet")
        suite.check("[%s] every sheet row is at least 44 px tall" % label, bad == [], bad)
        suite.shot("%s-2-sheet.png" % label)
        page.evaluate("history.back()")
        suite.wait_until("!document.getElementById('rsSheet').classList.contains('rs-open')", 5)
        page.wait_for_timeout(600)
        # a sheet lifted off the bottom edge has to travel further to hide: if the close
        # offset only equals its height, a strip stays over the nav bar, eating taps
        gone = page.evaluate("""(() => {
          const s = document.getElementById('rsSheet').getBoundingClientRect();
          const at = document.elementFromPoint(innerWidth / 2, innerHeight - 6);
          return { top: Math.round(s.top), vh: innerHeight,
                   hit: at ? (at.id || at.className || at.tagName) : null };
        })()""")
        suite.check("[%s] the closed sheet leaves nothing on the glass" % label,
                    gone["top"] >= gone["vh"] - 1 and "rsSheet" not in str(gone["hit"])
                    and "rsGrab" not in str(gone["hit"]), gone)

    # ---- help overlays --------------------------------------------------------------
    page.evaluate("document.documentElement.classList.remove('rs-navhide')")
    page.evaluate("document.querySelector('#nav-settings').click()")
    page.wait_for_timeout(400)
    for act, ov in (("guide", "rsGuide"), ("check", "rsCheck"), ("about", "rsAbout")):
        page.evaluate("(() => { const o = document.querySelector('.rs-ov.rs-ov-on');"
                      " if (o) o.querySelector('[data-ov-x]').click(); })()")
        page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#scr-settings [data-act=%s]').click()" % act)
        page.wait_for_timeout(600)
        on = page.evaluate("document.getElementById('%s').classList.contains('rs-ov-on')" % ov)
        suite.check("[%s] the %s overlay opens" % (label, ov), on)
        if on:
            lay = page.evaluate("""(ov) => {
              const root = document.getElementById(ov);
              const panel = root.querySelector('.rs-ov-body') || root.firstElementChild;
              const body = root.querySelector('.rs-ov-body');
              const r = panel.getBoundingClientRect();
              // the longest rendered text line, as a proxy for readable measure
              let chars = 0;
              root.querySelectorAll('.rs-ov-body p, .rs-ov-body li').forEach(e => {
                chars = Math.max(chars, e.textContent.trim().length);
              });
              return { w: Math.round(r.width), x: Math.round(r.x), h: Math.round(r.height),
                       y: Math.round(r.y), vw: innerWidth, vh: innerHeight,
                       scroll: body ? body.scrollHeight - body.clientHeight : -1,
                       chars: chars };
            }""", ov)
            suite.check("[%s] %s fits the glass on the reading rail" % (label, ov),
                        lay["x"] >= 0 and lay["w"] <= min(want_rail, 640) + 2 and lay["y"] >= 0
                        and lay["y"] + lay["h"] <= lay["vh"] + 1, lay)
            bad = small_controls(page, "#%s" % ov)
            suite.check("[%s] %s controls stay 44 px" % (label, ov), bad == [], bad)
            print("  metrics %s %s: %s" % (label, ov, json.dumps(lay)))
            suite.shot("%s-3-%s.png" % (label, ov))
        page.evaluate("(() => { const o = document.querySelector('.rs-ov.rs-ov-on');"
                      " if (o) o.querySelector('[data-ov-x]').click(); })()")
        page.wait_for_timeout(350)

    # ---- Ambient panels: the scene box ----------------------------------------------
    page.evaluate("document.documentElement.classList.remove('rs-navhide')")
    page.evaluate("document.querySelector('#nav-vis').click()")
    page.wait_for_timeout(700)
    amb = page.evaluate("""(() => {
      const r = id => { const e = document.getElementById(id); if (!e) return null;
        const q = e.getBoundingClientRect();
        return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; };
      const box = document.querySelector('#vizCard .rs-scenebox');
      return { box: box ? (() => { const q = box.getBoundingClientRect();
                 return { x: Math.round(q.x), w: Math.round(q.width), h: Math.round(q.height) }; })() : null,
               prev: r('vizPrev'), next: r('vizNext'), pick: r('rsSceneMenu'), vw: innerWidth };
    })()""")
    suite.check("[%s] the scene menu keeps one row: arrows flanking the picker" % label,
                amb["prev"] and amb["next"] and amb["pick"]
                and abs(amb["prev"]["y"] - amb["pick"]["y"]) <= 4
                and abs(amb["next"]["y"] - amb["pick"]["y"]) <= 4
                and abs(amb["prev"]["h"] - amb["pick"]["h"]) <= 2
                and abs(amb["next"]["h"] - amb["pick"]["h"]) <= 2, amb)
    suite.check("[%s] the scene menu fits the glass" % label,
                amb["box"] and amb["box"]["x"] >= 0
                and amb["box"]["x"] + amb["box"]["w"] <= amb["vw"] and amb["prev"]["x"] >= 0
                and amb["next"]["x"] + amb["next"]["w"] <= amb["vw"], amb)
    print("  metrics %s scene: %s" % (label, json.dumps(amb)))
    page.evaluate("document.querySelector('#vizCard .rs-scenebox').scrollIntoView({block:'center'})")
    page.wait_for_timeout(350)
    suite.shot("%s-4-visualise.png" % label)

    # ---- Files & export --------------------------------------------------------------
    page.evaluate("document.querySelector('#nav-studio').click()")
    page.wait_for_timeout(500)
    page.evaluate("document.getElementById('rsFilesDet').open = true")
    page.wait_for_timeout(300)
    files = page.evaluate("""(() => {
      const r = id => { const e = document.getElementById(id); if (!e) return null;
        const q = e.getBoundingClientRect();
        return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; };
      const card = document.getElementById('rsFiles').getBoundingClientRect();
      const lenSel = document.getElementById('exportMin');
      return { card: { x: Math.round(card.x), w: Math.round(card.width), h: Math.round(card.height) },
               open: r('loadBtn'), pack: r('loadPackBtn'), save: r('saveGnm'), exp: r('exportBtn'),
               share: r('shareBtn'), len: lenSel ? r('exportMin') : null, vw: innerWidth };
    })()""")
    bad = small_controls(page, "#rsFiles")
    suite.check("[%s] every file control stays 44 px" % label, bad == [], bad)
    suite.check("[%s] the file rows keep their two-column rhythm" % label,
                abs(files["open"]["w"] - files["pack"]["w"]) <= 2
                and abs(files["save"]["w"] - files["exp"]["w"]) <= 2
                and files["share"]["w"] >= files["open"]["w"] + files["pack"]["w"], files)
    print("  metrics %s files: %s" % (label, json.dumps(files)))
    page.evaluate("document.getElementById('rsFiles').scrollIntoView({block:'center'})")
    page.wait_for_timeout(350)
    suite.shot("%s-5-files.png" % label)
    suite.check("[%s] nothing overflows with the file card open" % label, overflow(page)["over"] <= 0,
                overflow(page))

    # ---- the welcome tour ------------------------------------------------------------
    page.evaluate("localStorage.removeItem('resonance.app.theme.v1')")
    page.reload(wait_until="load")
    page.add_script_tag(content=SHIM)
    on = suite.wait_until("!!document.getElementById('rsTour') && "
                          "document.getElementById('rsTour').classList.contains('rs-t-on')", 12)
    suite.check("[%s] the tour opens on a tablet" % label, on)
    if on:
        bad = []
        for n in range(1, 10):
            page.wait_for_timeout(900)
            state = page.evaluate("""(() => {
              const b = document.querySelector('#rsTour .rs-t-bub').getBoundingClientRect();
              const h = document.querySelector('#rsTour .rs-t-hole').getBoundingClientRect();
              return { n: document.getElementById('rsTourN').textContent,
                       bx: Math.round(b.x), by: Math.round(b.y), bw: Math.round(b.width),
                       bh: Math.round(b.height), hx: Math.round(h.x), hy: Math.round(h.y),
                       hw: Math.round(h.width), hh: Math.round(h.height),
                       vw: innerWidth, vh: innerHeight,
                       prev: getComputedStyle(document.querySelector('#rsTour .rs-t-back')).display };
            })()""")
            if (state["bx"] < 0 or state["by"] < 0 or state["bx"] + state["bw"] > state["vw"]
                    or state["by"] + state["bh"] > state["vh"]):
                bad.append(("bubble off screen", n, state))
            if state["n"] != "%d of 9" % n:
                bad.append(("count", n, state["n"]))
            suite.shot("%s-tour-%d.png" % (label, n))
            if n < 9:
                page.click("#rsTour .rs-t-next")
        suite.check("[%s] all nine tour stops keep the bubble on the glass" % label, bad == [], bad[-2:])
        page.evaluate("history.back()")
        suite.check("[%s] Back leaves the tour and keeps the app" % label, suite.wait_until(
            "!document.getElementById('rsTour').classList.contains('rs-t-on')", 5)
            and page.evaluate("!!document.getElementById('rsApp')"))

    # ---- the chamber ------------------------------------------------------------------
    page.evaluate("window.__rs.chamber()")
    suite.check("[%s] the chamber opens" % label, suite.wait_until(
        "document.documentElement.classList.contains('cym-open')", 10))
    page.wait_for_timeout(900)
    cym = page.evaluate("""(() => {
      const top = document.querySelector('.rs-app .cym .cym-top');
      const acts = document.querySelector('.rs-app .cym .cym-actions');
      const r = e => { if (!e) return null; const q = e.getBoundingClientRect();
        return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; };
      return { top: r(top), acts: r(acts), vw: innerWidth, vh: innerHeight,
               over: document.documentElement.scrollWidth - innerWidth,
               buttons: Array.from(document.querySelectorAll('.rs-app .cym .cym-actions > button'))
                 .map(b => { const q = b.getBoundingClientRect();
                   return { l: b.textContent.trim().slice(0, 10), x: Math.round(q.x),
                            w: Math.round(q.width), h: Math.round(q.height) }; })
                 .filter(b => b.w > 0 && b.h > 0) };
    })()""")
    suite.check("[%s] the chamber controls stay on the glass" % label,
                cym["over"] <= 0 and all(b["x"] >= 0 and b["x"] + b["w"] <= cym["vw"] for b in cym["buttons"]),
                cym)
    suite.check("[%s] the chamber controls stay 44 px" % label,
                all(b["h"] >= 44 for b in cym["buttons"]), cym["buttons"])
    print("  metrics %s chamber: %s" % (label, json.dumps(cym)))
    suite.shot("%s-6-chamber.png" % label)
    page.evaluate("history.back()")
    suite.wait_until("!document.documentElement.classList.contains('cym-open')", 6)
    page.wait_for_timeout(400)

    # ---- fullscreen visualiser ---------------------------------------------------------
    page.evaluate("window.ResonanceViz && window.ResonanceViz.api.enable(true)")
    page.wait_for_timeout(600)
    page.evaluate("document.querySelector('[data-viz-host]').scrollIntoView({block:'center'})")
    page.wait_for_timeout(300)
    page.evaluate("document.querySelector('[data-viz-host] .viz-canvas')"
                  ".dispatchEvent(new MouseEvent('click', {bubbles: true}))")
    infs = suite.wait_until("document.documentElement.classList.contains('rs-fs')", 7)
    suite.check("[%s] a panel goes fullscreen" % label, infs)
    if infs:
        page.wait_for_timeout(900)
        fs = page.evaluate("""(() => {
          const st = document.querySelector('#rsFsStage [data-viz-panel]');
          const c = document.querySelector('#rsFsStage .viz-canvas');
          const bar = document.getElementById('rsFsBar') || document.getElementById('rsFsTop');
          const r = e => { if (!e) return null; const q = e.getBoundingClientRect();
            return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) }; };
          return { stage: r(st), canvas: r(c), bar: r(bar), vw: innerWidth, vh: innerHeight,
                   over: document.documentElement.scrollWidth - innerWidth };
        })()""")
        suite.check("[%s] the fullscreen canvas fills the glass" % label,
                    fs["canvas"] and abs(fs["canvas"]["w"] - fs["vw"]) <= 8
                    and abs(fs["canvas"]["h"] - fs["vh"]) <= 8, fs)
        suite.check("[%s] the fullscreen chrome fits" % label, fs["over"] <= 0, fs)
        suite.shot("%s-7-fullscreen.png" % label)
        page.evaluate("history.back()")
        suite.wait_until("!document.documentElement.classList.contains('rs-fs')", 6)
        page.wait_for_timeout(400)

    # ---- focus view ---------------------------------------------------------------------
    page.evaluate("document.documentElement.classList.remove('rs-navhide')")
    page.evaluate("document.querySelector('#nav-settings').click()")
    page.wait_for_timeout(400)
    page.evaluate("document.querySelector('#scr-settings [data-act=focus]').click()")
    onf = suite.wait_until("document.documentElement.classList.contains('rs-focus')", 8)
    suite.check("[%s] focus view opens" % label, onf)
    if onf:
        page.wait_for_timeout(1000)
        fv = page.evaluate("""(() => {
          const bar = document.getElementById('rsFocusBar');
          const items = Array.from(bar.querySelectorAll('button, select')).map(b => {
            const q = b.getBoundingClientRect();
            return { l: (b.id || b.textContent.trim().slice(0, 10)), x: Math.round(q.x),
                     w: Math.round(q.width), h: Math.round(q.height) }; });
          const br = bar.getBoundingClientRect();
          return { bar: { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width),
                          h: Math.round(br.height) },
                   items: items, vw: innerWidth, vh: innerHeight,
                   over: document.documentElement.scrollWidth - innerWidth };
        })()""")
        suite.check("[%s] the focus bar fits and keeps its controls on the glass" % label,
                    fv["over"] <= 0 and all(i["x"] >= 0 and i["x"] + i["w"] <= fv["vw"] for i in fv["items"])
                    and all(i["h"] >= 44 for i in fv["items"]), fv)
        suite.shot("%s-8-focus.png" % label)
        page.click("#rsFsTop [data-rs=fsExit]")
        suite.wait_until("!document.documentElement.classList.contains('rs-focus')", 6)

    suite.check("[%s] no uncaught page errors" % label, errors == [], errors[:3])
    ctx.close()
    return suite


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default=None)
    ap.add_argument("--only", default=None, help="one viewport label")
    a = ap.parse_args()
    httpd, url = serve()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])
        total_p, total_f = 0, 0
        for label, w, h in VIEWPORTS:
            if a.only and a.only != label:
                continue
            print("\n== %s (%dx%d)" % (label, w, h))
            suite = run_viewport(browser, url, label, w, h, a.shots)
            total_p += suite.passed
            total_f += suite.failed
            for name, detail in suite.failures:
                print("   FAILED: %s | %s" % (name, str(detail)[:300]))
        print("\n== %d passed, %d failed" % (total_p, total_f))
        browser.close()
    httpd.shutdown()
    return 0 if total_f == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
