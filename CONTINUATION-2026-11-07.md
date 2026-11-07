# SAVE POINT — 2026-11-08 (session 12: the harness's red explained, and fixed in the page). READ THIS FIRST.

## Where the tree is

- **HEAD = the session-12 commit** (`git log -1`; its message is "focus view: paint only panels that are on
  screen"). It sits on top of **`9db88aa`** and carries the whole static-nav + focus-view build from
  session 11 plus this session's fix. **Nothing pushed, nothing published.**
- **`harness7.log` does not exist in the tree** (session 11's log was never written to disk); the failure
  it described was reproduced from the code and is **understood — it was not a history bug**.
- Release APK built and installed this session: **956,259 B, sha256
  `9b81d86990422eeeb944f47116828ddf1e149c7723caf4de4efa7c5d94e7727f`** (rebuilt after the readouts,
  toast and dark-only theme work below; the first build of the session was 956,019 B / `1f3a1808…`),
  versionCode 14 / 2.0.6-beta, on the phone `192.168.1.95:33139` and the Tab A9+
  `adb-R92XB0RWN3B-67B1Tm`.
- Eye-gate evidence from session 11 is still in `cache/focus-eye-2026-11-08/` (outside `tools/`).

## The lead was wrong — what actually happened

Session 11 suspected an off-by-one history stack after the focus/picker legs. **Measured, it is balanced.**
Probe `cache/probe_history.py` prints `history.state.rsLayer`, `history.length`, the popstate count, `#rsApp`,
the open layer and the active screen after every step of the exact sequence:

```
open focus            st=1  pops=0      (picker/legacy clicks inside fullscreen push nothing: FS.on)
exit focus            st=0  pops=1
settings-row focus    st=2  pops=1
exit again            st=0  pops=2
overflow sheet        st=3  pops=2
history.back()        st=0  pops=3
```

`location` never changes, `#rsApp` and `#nav-settings` exist at every step, and the sheet always closes.
One layer, one entry — the project rule holds. **The app was never navigated away from.**

## The real cause: the page painted panels that had no box on screen

Inside the app the page's own grid is hidden behind the shell, so **both inline visualiser panels sat at a
0x0 CSS box and were still painted every frame** — and the one that came back from the focus view kept its
fullscreen backing store (**585x1266 device px**) and kept drawing it. After one focus visit the page ran at
**10–11 fps** with 117 ms worst-case frames, and Playwright's actionability wait (which polls on
animation frames) stopped settling: `#nav-settings` resolved, was `visible=True`/`enabled=True`, its box was
byte-identical across 20 consecutive frames, `elementFromPoint` hit the button, and a raw `mouse.click` and
a JS `.click()` both switched the screen — yet `page.click` burned 30 s on "waiting for element to be
visible, enabled and stable". That is the 0-FAIL, 30 s-timeout death at `suite.tab("settings")`.

**Fix (in the page, not the harness):** `viz.js` gained `watchPanels()` — one `IntersectionObserver` over
every panel canvas — and each panel carries `onScreen`; the draw loop skips a panel with no box
(`if (p.onScreen === false) continue;`). `debugState().panels[i]` now reports `onScreen` and `frames`.

Measured after the fix: **61 fps after leaving the focus view (was 10–31), 61 at boot (frames frozen on the
off-screen panels), 38 in the focus view**, and the panel that is on screen still paints. This also stops the
app burning two invisible canvases at 60 fps forever on the phone — a real battery/CPU win, not just a test
convenience.

**Two new legs pin it, and both can fail:**
`the panel in the focus view paints frames` (sum of frames must increase) and `a panel with no box on screen
paints nothing` (every off-screen panel's frame count must be frozen and none may report `onScreen`).
Proved able to fail by neutralising the draw gate for one run: `frames` went 171 → 210 with the gate off
(`cache/probe_leg.py`).

## Gates, all green on these bytes

| gate | result |
|---|---|
| `py -3.11 tools/shim_harness.py` | **238 passed / 0 failed** (`cache/harness9.log`; 232 before the loop-key legs) |
| `py -3.11 cache/contrast.py` | `TOTAL LOW-CONTRAST 0` |
| `py -3.11 tools/tablet_pass.py` | **82 passed / 0 failed** |
| `npx eslint@9` | 0 problems |
| `:app:lintRelease` | `No issues found.` |
| `:app:testUnitTests` | BUILD SUCCESSFUL |
| `:app:assembleRelease` (signed) | BUILD SUCCESSFUL in 20 s |
| `tools/apk_identity.py --site C:/Users/Moddy/radio-browser/deploy/resonance` | only the `byte-identical to the site's` legs red (release minifies; that is the expected clean state) |
| install + boot, phone & tablet | `page: shim ready`, crash buffer empty, `versionCode=14` |
| `py -3.11 tools/device_gate.py -s 192.168.1.95:33139` | **19 passed / 0 failed** — `DEVICE GATE OK` |

## Follow-up in the same session: the Home loop key (owner's report)

He reported: *"when I press the Loop button it goes grey and circular and then stays that way"*, and asked
for the key and its red lamp to move to the player's right edge with **the key furthest right and the lamp
left of it**.

- **Cause, measured with CDP `CSS.getMatchedStylesForNode`:** the *page's* own `button:hover` rule
  (`background: color-mix(in srgb, var(--acc) 18%, var(--panel2))`) applies a `background` **shorthand**,
  which resets `background-image` to `none` — and a tap leaves a sticky hover on a touch screen, so the
  generated brass face was wiped on the first press and never came back even though the state kept toggling
  (`aria-pressed` and `engine.schedule.loops` toggled all along; only the face was lost).
- **Fix:** the key's rule is now `html[data-rs-ui=full] .rs-loopkey` **with `:hover`, `:active` and `:focus`
  variants**, re-declaring the face at a specificity the page's `button:hover` cannot beat.
- **Layout:** markup order is now `Loop` (engraved label) → **red lamp** → **key**, and the group is pushed
  to the card's right edge by `html[data-rs-ui=full] .rs-amprow > .rs-loopunit{margin-left:auto}` — the bare
  `margin-left:auto` was losing to the row's own `.rs-transport > * + *{margin-left:14px}`.
- **Measured on his phone (433 CSS px, dpr 2.8125):** row `33..401`, key `355..401` (flush with the row and
  with Stop above it), lamp `337..347` — and two real CDP touch taps leave the face on `amp-loop.webp` while
  `loops` goes `Infinity → 1 → Infinity`.

## Follow-up 2: the player's readouts, the scramble toast, and a dark-only theme

Owner's asks in one pass: the Volume % follows the amp language; Surprise me and the idle readout do too;
pressing Scramble in Visualise puts an empty pill at the top-left for a few seconds; and Light/System/Dark
should go away in favour of dark only.

- **Volume**: the `70%` now sits in a small smoked-glass window (`.rs-ledmini`, `min-width:42px`, amber
  `#FFB454` on a solid `#120D07`, 11 px tabular monospace) under a warm-grey `Volume` caption — the clock's
  LED language one size down. The label row is `.rs-vollab` (flex, value flush right). Pixel-read at 390
  and 433 px: 545 amber pixels in the window at both widths, warm plate behind it.
- **Surprise me / idle**: `#rsSurprise` is a brass-edged key (44 px, `#5A4526` edge over a
  `#2B2115→#0F0A06` plate) and `#rsMode` is a smoked LED window with a `::before` pilot lamp that turns red
  (`rgba(255,60,64,.85)` glow) while `html.rs-playing`. Both are declared for `:hover/:active/:focus` —
  the page's `button:hover` shorthand trap, again. The old leg that pinned the pill's `999px` radius was
  rewritten to the new contract (button carries the plate, the window is rounded 6 px and flush right).
- **The empty pill was the page's own `#toast`.** viz's `scramble()` calls `toastViz()`, which writes the
  message and adds `.show`; the shell moves `#toast` to the top by pinning `left/right:16px`, but the page's
  `.toast` also centres itself with `left:50%; transform:translateX(-50%)` — so the bar was pushed half its
  width off the glass (`x=-159` on a 390 px viewport) and the only visible part was the empty right end of
  the pill. Fix: `transform:none !important` on `html.rs-app #toast` **and** `#toast.show`. Measured on the
  phone: `x=16, right=406` of 433, text `Scrambled: …`.
- **Dark only**: the System/Dark/Light segment is gone from Settings (markup, wiring and the `mqDark`
  listener removed). `applyTheme()` now forces `data-rs-theme="dark"`, calls `native("chrome",[false])`, and
  **rewrites a stored non-dark `prefs.theme`**, so an update from a phone that had Light selected cannot boot
  half-themed. Proven on the phone: store `theme:"light"` → reload → dark, and the stored value reads `dark`.
- **Legs added**: the scramble toast is on the glass with its message and fades by itself; the state window
  reads live with a lit lamp and leaves live when stopped (wait for the tick — an instant read fails);
  the Surprise key keeps its plate through the press; there is no theme switcher; a stored light preference
  boots dark and is rewritten. **Harness 246/0**, contrast 0 (the probe now walks dark only), tablet 82/0,
  eslint 0, device gate 19/0.

## What is left, in order

1. **Owner eye gate** (his phone, his call): the eight scenes switching in the focus view, the picker
   cards at 1:1, the static tab bar, the 8 s player hide, the legacy flag. Do not sign the look off from
   stills.
2. **`assets-manifest.json` is still missing the new files**: `app/vizscenes.js` and `app/ui/scene/*.webp`
   are bundled but not listed, and `tools/sync-assets.py`'s `FILES` does not name `vizscenes.js`. Add them
   and regenerate **only after** the site-tree drift (below) is reconciled — the manifest is generated from
   the source tree, and blessing drifted bytes now would hide the difference.
3. **Publishing is a separate decision.** Nothing was uploaded. The 2.0.6-beta payload staged in session 10
   (`radio-browser/deploy/downloads/resonance-studio-v2.0.6-beta.apk`, `updates.json` 2.0.6/14) points at
   **different bytes**; either re-stage 2.0.6 with this APK's sha/size (956,019 B /
   `1f3a1808…`) or cut 2.0.7-beta / versionCode 15. Regenerate the feed with
   `make-updates-json.py --resonance-only`; never hand-edit `updates.json`.
4. **The site-tree drift is unchanged** (session 11's note stands): `tools/sync-assets.py --check` says
   37/45; `app/index.html`, `engine.js`, `packs.js`, `vizmodes.js`, `viz.js`, `cymrender.js`, `cympresets.js`,
   `cym.js` differ from `webmusic-hub/site/resonance`. Running sync would revert app-side fixes. The site
   tree already carries `vizscenes.js` and the new `viz.js` plus the `<script>` tag.
5. `device_gate.py`, `tablet_pass.py`, `cache/emu4.py`, `cache/tablet_audit.py` still call
   `remove('rs-navhide')` as a wake-up; harmless, tidied later.

# SAVE POINT — 2026-11-08 (session 11: focus view rebuilt + static nav).

## Where the tree is

- **HEAD `9db88aa`** ("focus view: redesign brief"). **NOTHING COMMITTED THIS SESSION** — the whole
  build below is in the working tree. Commit by explicit path (project trap: never `git add -A`).
- **`harness7` finished RED, and it left a real lead.** *(SUPERSEDED — session 12 measured the stack
  balanced and found the true cause: off-screen panels still painting. See the top block.)* 155 PASS, **0 FAIL**, then a 30 s
  Playwright timeout at `suite.tab("settings")` (line 993 → line 170): the locator for
  `#nav-settings` **never resolved**, which is what a page that has navigated away looks like — not
  a covered or hidden button. It happens immediately after the overflow sheet is closed with
  `history.back()` ("back closes the sheet" had just passed). **Prime suspect: the history stack is
  off by one after the new focus/picker legs** — my block opens the picker twice, opens and exits
  the focus view twice more, and `exitFullscreen(false)` calls `unmarkBackTop()` (a replace, not a
  pop), so an entry pushed by `openFocus()`/`showOverlay()` can be left behind or consumed twice.
  **First move next session:** reproduce with `history.length` and `!!document.getElementById('rsApp')`
  printed after each of: open focus → change → pick → reopen → legacy toggle → pick → exit →
  settings-row focus → exit → overflow sheet → `history.back()`. If the app is being navigated away
  from, that is an app bug (Back leaving the app), not a test bug — the project rule is that every
  layer owns exactly one history entry.
- Eye-gate evidence (plate sheet, stills sheet, ink/plankton crop) is kept in
  `cache/focus-eye-2026-11-08/`, out of `tools/` so it cannot be committed by accident.
- Devices attached when saved: phone `192.168.1.95:33139`, tablet `adb-R92XB0RWN3B-67B1Tm`,
  phone `adb-ZY22LGC75T-d131nd`, `emulator-5554`.

## What this session did

### 1. The static tab bar (owner's correction, shipped and proven)
He asked: keep Home / Sessions / Studio / Visualise / Settings **static**, only the lower player
bar auto-hides. Done:
- `_shell_shim.js`: the `NAVIDLE` timer and the `rs-navhide` class-add are gone; `armNav()` became
  **`wakeChrome()`** (clears a stale `rs-navhide` from an older build, then `armMini()`), and every
  call site was renamed (boot listeners, `go()`, `tourStep()`).
- CSS: `html.rs-navhide #rsNav{...}` and the nav's transform transition are removed; the nav rule
  now closes on the padding line. The nav is static at every width.
- The mini player still leaves, now at **`MINI_IDLE_MS = 8000`** (was 12000), keeps its layout
  space, and any pointerdown/keydown/wheel brings it back.
- Harness legs rewritten: after 8.6 quiet seconds the **tab bar is exactly where it was**
  (top/height/opacity/pointer-events), the **mini player is away**, a touch restores it, and the
  nav never grows a hide class. `suite.tab()`'s stale "bar auto-hides" comment updated.
- **`py -3.11 tools/shim_harness.py` passed 218/0 on exactly the nav change** (log `harness2.log`),
  before any focus-view work — that is the attribution run.

### 2. The focus view: eight scenes, eight geometries
- **`app/vizscenes.js`** (new, ~50 KB): `SCENES` table (id `focus-*`, name, blurb, plate, still,
  `warm`, palette, builder) and a `Scene` renderer. Contract:
  `GnauralVizScenes.{LIST, byId, isScene, step(id,dir), create, reset, stepInst, drawInst,
  setParallax, gridOf, dhash, hamming, gridDistance, structureDistance, reduced}`.
  Three layers per panel: far plate (cover-fit, drift + parallax), mid = locally derived blur of the
  same plate (72 px downscale drawn back up, different zoom, opposite drift) + wash, near =
  procedural anchor/accents. 4 s-in / 6 s-out breath (0.1 Hz), beat only tints, 1.2 s dissolve in,
  vignette cached per box. **No per-frame gradients** (every gradient is a cached sprite).
- **`viz.js`** learned exactly one pref (`scene`) and one render branch; `applyPreset(id)` routes a
  scene id to `applyScene`; `dissolve()` snapshots the panel and sets the existing crossfade veil to
  1.2 s on every look change; `stepPreset` walks scenes when one is active; `refreshCard` names a
  scene in the note; api gained `applyScene`, `scenes()`, `sceneMeta()`, `stepScene`, and
  `debugState().scene`. The 24 preset ids remain valid and the ambient card path is untouched.
- **Shell**: `FOCUS_DEFAULT = "focus-cathedral"`; `focusPresets()` returns the 8 scenes and appends
  the 24 old presets only when **`prefs.focusLegacy`** is on (default off — his sign-off gate);
  the picker is now **cards** (`focusCard` / `fillFocusList` / `openFocusPick`) with the still as
  the card's background, the name, and a one-line blurb, plus a **Show/Hide the old presets** key;
  `focusPlate()` reads the scene's own `warm` flag for the atmosphere layer; `fsBgParallax()`
  forwards the same pointer offset to `GnauralVizScenes.setParallax()`.
- **Reduced motion**: draws the shipped still, cross-dissolving over 1.2 s on a scene change; no
  drift, no particles, no timers.

### 3. Assets — 8 plates, 8 stills (28 credits, half the budget)
- `app/src/main/assets/www/app/ui/scene/<id>.webp` — 1280x720 WebP q80, **143 KB total**
  (7-50 KB each), generated with gpt_image_2 16:9 / 1k / high at **3.5 credits each = 28 credits**
  (balance before 2660.53; ~2632 after). Prompts: cathedral god-rays, deep star field, dark water
  underside, cold aurora sky, workshop embers, rain-streaked bokeh window, gradient void, dark water
  column — all with the "very low contrast, no bright hotspots, calm middle" clause.
- `…/ui/scene/<id>-still.webp` — **480x1039** WebP q76, ~48 KB total, **rendered by the live
  renderer itself** (`tools/scene_stills.py`, 5 s settle per scene), not cut from the plates.
- `tools/cut_scene_plates.py` cuts rawUrls to plates; `tools/scene_stills.py` captures stills and is
  also the **build-time similarity gate** (`--check`).

### 4. The similarity gate (the point of the redesign)
- 32x32 luminance grid per scene, **structure distance = 1 − Pearson** plus a 992-bit dHash.
- Build-time (`scene_stills.py --check`) and runtime (harness leg) both gate on
  **struct >= 0.15, dHash >= 250, no still under mean 8**.
- Measured on the shipped stills: closest pair **aurora / spiral 0.250 struct / 423 dHash**;
  everything else 0.307…1.397.
- **The gate was proved able to fail**: copying `ember-still.webp` over `spiral-still.webp` makes
  `--check` exit 1; the file was restored.
- Runtime metrics on a phone viewport: every scene lights **969–1024 of 1024** grid cells; grid
  delta over 1.6 s is **0.00102 (ember) … 0.03083 (rain)** against a **0.0004** floor.

### 5. Gates green so far
- `py -3.11 tools/shim_harness.py`: the nav run 218/0; the focus runs passed every scene leg —
  eight cards, every still decodes, legacy flag 8→32→8, every scene paints, every scene moves,
  structure gate, reduced-motion frozen still — then died on a **Playwright actionability wait, not a
  check** (see traps).
- `py -3.11 tools/scene_stills.py --check` → **GATE PASS**.
- `npx eslint@9 --config eslint.config.mjs app/src/main/assets/www` → **0 problems**.
- **NOT yet run on these bytes**: contrast, tablet pass, `lintRelease`, `testUnitTests`,
  `assembleRelease`, `apk_identity`, `device_gate`.

## The remaining queue, in order

1. **Finish the harness.** Read `harness7.log` (or re-run). I had just changed the three remaining
   `page.click("#rsOverflow")` calls to `document.getElementById('rsOverflow').click()` (the
   actionability wait never settles late in the long suite; the sheet/row assertions that follow are
   the real gate, so this cannot pass on a dead control) and normalised the file back to CRLF.
   Expect **~200+ passed, 0 failed**; every scene leg must be in the PASS list.
2. **`py -3.11 cache/contrast.py`** → `TOTAL LOW-CONTRAST 0`. The new picker cards carry a solid
   `background-color` plus a gradient scrim, so they are measurable; check the card name/blurb lines.
3. **`py -3.11 tools/tablet_pass.py`** → 0 failed (800x1280 + 1280x800). The 2-column picker grid is
   the new thing to look at; it should simply widen.
4. **`./gradlew --no-daemon :app:lintRelease`** (must quote the line; `assembleRelease` is not a
   lint gate) and **`./gradlew --no-daemon :app:testUnitTests`**.
5. **Signed release build** (env in the skill): `JAVA_HOME=C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot`,
   `ANDROID_HOME=C:/Users/Moddy/nakamichi-remote/sdk`, `KEYSTORE_FILE=C:/Users/Moddy/keystores/resonance-release.p12`,
   password in `resonance-release-credentials.txt`, alias `resonance`. Then record bytes + sha and
   prove the build carries the edit (`unzip -p … assets/www/app/vizscenes.js | grep -c "focus-cathedral"`).
6. **`py -3.11 tools/apk_identity.py app/build/outputs/apk/release/app-release.apk --site C:/Users/Moddy/radio-browser/deploy/resonance`**
   — pass a NATIVE path; a clean run is one where **only** the `byte-identical to the site's` legs
   are red. `app/vizscenes.js` is new and is not in `assets-manifest.json`; if the run names it, add
   `app/vizscenes.js` to `tools/sync-assets.py` FILES and regenerate the manifest **only** after the
   drift below is reconciled.
7. **Install + device gate**: `adb -s 192.168.1.95:33139 install -r …`, force-stop, relaunch, then
   `py -3.11 tools/device_gate.py -s 192.168.1.95:33139` → 19/0 (debug build for CDP; the release has
   no devtools socket). Repeat or at least install on the Tab A9+.
8. **Owner eye gate (his phone, his call)**: the eight scenes switching in focus view, the picker
   cards at 1:1, the static tab bar, the 8 s player hide, and the legacy flag. Do not declare the
   look signed off from stills — he drives it himself.
9. **Commit** the work by explicit path, then rewrite this continuation's top block with the final
   bytes/sha and the gate numbers.
10. **Publishing is a separate decision.** Session 10 already staged a `2.0.6-beta` upload
    (`radio-browser/deploy/downloads/resonance-studio-v2.0.6-beta.apk`, updates.json 2.0.6/14,
    backup `%LOCALAPPDATA%/Temp/rs-publish-backup-20261108-055518`). This session's APK is different
    bytes, so either rebuild and re-stage 2.0.6 with the new sha/size, or cut **2.0.7-beta /
    versionCode 15**. Never hand-edit `updates.json`; re-run `make-updates-json.py --resonance-only`.
    Upload only on his word.

## Open decisions / drift to remember

- **8 plates, not the brief's 16.** The mid layer is derived locally from the far plate. That saves
  28 credits and keeps the planes coherent. If he wants true 2-plate depth per scene, the prompts
  are already written and cost 3.5 credits each.
- **The page tree has pre-existing drift.** `tools/sync-assets.py --check` says 37/45 in sync:
  `app/index.html`, `engine.js`, `packs.js`, `vizmodes.js`, `viz.js`, `cymrender.js`,
  `cympresets.js`, `cym.js` all differ from `webmusic-hub/site/resonance`. Running sync-assets
  **would revert** app-side fixes. This session copied `vizscenes.js` and the new `viz.js` into the
  site tree and put the `<script src="vizscenes.js?v=1a">` tag in **both** index.html files, so the
  site page references a file that now exists there. Reconcile before ever running sync.
- The live site is still the frozen 2026-10-09 build; nothing from C1-C5 or this is deployed.
- `device_gate.py`, `tablet_pass.py`, `cache/emu4.py`, `cache/tablet_audit.py` still call
  `remove('rs-navhide')` as a wake-up. Harmless (a no-op class), tidied later.

## Traps found this session (add to the skill)

- **A near layer at 5 % alpha is not a design, it is fog.** The first pass read exactly like the
  owner's complaint ("same dark fog, eight times") at 1:1. Geometry must be drawn at real contrast;
  the generated plate is air, not the subject. Two eye passes were needed; the second inverted ink
  (dark matter in lit water) and clustered plankton, and only then did all eight read as their names.
- **`PROJECT` one level too high**: `tools/cut_scene_plates.py` used `HERE/../..` and wrote the
  plates to `C:\Users\Moddy\app\…`. Fixed to `HERE/..`. If an asset "exists" but the page 404s,
  check where the tool actually wrote before debugging the renderer.
- **`Scene.draw` called `entry.draw`** (the table holds `build`, not `draw`); the state object
  returned by the builder owns step/draw. Symptom: `[viz] scene failed: … e.draw is not a function`,
  a page with only the wash painted, and near-identical stills at ~1 KB.
- **API key collision**: `step` was already the scene-cycling function, so the instance stepper is
  `stepInst`/`drawInst`. A duplicate `step` key would have been an eslint error and a silent
  wrong-dispatch.
- **Plates are 16:9, the panel is portrait.** Measured: the centre crop is BRIGHTER than the whole
  plate (cathedral 47 vs 32; spiral 37 vs 20), so cover-fitting a landscape plate in a portrait panel
  is correct and portrait plates are not needed.
- **The harness's focus chrome auto-hides during long API-driven loops.** A scene loop takes ~25 s
  without a touch, so `#rsFsTop [data-rs=fsExit]` is off-screen by the time it is clicked: tap
  `#rsFsStage` and wait for `!rs-fs-hide` first, and assert the close actually happened.
- **Playwright waits for "scheduled navigations" after a Settings row click** (`pushState` app). Use
  `no_wait_after=True` on those clicks.
- **`#rsOverflow` actionability can stop settling late in the long suite** (0 FAIL lines, 30 s
  timeout). Dispatch the click on the real button and keep the assertions that follow; a dead
  control still fails the gate.
- **A harness leg that appends new flows must end in the state the next leg expects.** The scene
  block leaves focus view open with reduced-motion emulation — it resets media and wakes the chrome
  before closing.

## First three moves for the next session

1. **Fix the history-entry balance first** (harness7's lead, above): instrument `history.length` and
   `!!document.getElementById('rsApp')` through open focus → change → pick → reopen → legacy → pick →
   exit → settings focus → exit → overflow sheet → `history.back()`. One layer, one entry; a Back
   that leaves the app is the bug the project rules exist to prevent. Then re-run the harness and
   expect every scene leg plus the 8.6 s static-nav leg in the PASS list.
2. `py -3.11 cache/contrast.py` and `py -3.11 tools/tablet_pass.py` — solo, never two suites at once.
3. `./gradlew --no-daemon :app:lintRelease` then `:app:testUnitTests`, then the signed build.

# SAVE POINT — 2026-11-08, end of session 10 (read this first)

**HEAD `54468ed`**, tree clean, nothing pushed. **2.0.6-beta, versionCode 14.**

## The bytes

- Signed release APK: **758,130 B, sha256 `9451ce022391812d0a27f952e52404fd3c89bc52176d1aaf2f9ff309e876c955`**.
- On **both** devices, verified by pulling the installed APK back and hashing it:
  phone `192.168.1.95:33139`, Tab A9+ `adb-R92XB0RWN3B-67B1Tm` — same 758,130 B and same sha.
- `dumpsys package` on both: versionCode 14. `page: shim ready`, crash buffer empty.
- A second `assembleRelease` of the same sources produced the **same** sha (deterministic).

## GUARDRAILS AND OWNER EYE — what shipped this session

1. **The Studio is rebuilt around the mix** (his complaint: cluttered and unintuitive). The screen is now
   three things in reading order: **Now** (title, state pill, four metrics — carrier / beat+band / length /
   layers — a play-pause key with its glyph, stop, clock, loop, and one line saying whether the mix needs
   headphones), **The mix** (one row per layer: dot, name, its numbers, level %, mute; tap a row to open
   pitch / beat / level sliders + Timeline and Remove), and **files** (open by default).
2. **One place to add a sound.** `#rsBuild`, the page's quick-pick catalogue (`rates.js` groups) and the
   page's by-hand adder all live in **Add a sound**: eight chapters — Bands · Resonance · Breathing ·
   Focus sets · Solfeggio · Noise · By hand · From scratch — one visible at a time, chips in two columns,
   the per-chip note lines folded away. The catalogue is the page's own data, moved, not copied.
3. **Voice vs layer is no longer two words for one thing.** The mix says *layer*; the raw editor says
   *voices · entries* and lives in **Advanced — the raw schedule** (collapsed), together with **Live meters
   & tools** (collapsed). Full control is still there; it is just put down.
4. **The page API is wrapped once** (`loadSchedule`, `loadPreset`, `loadGnauralText`, `addVoice`,
   `removeVoice`, `refresh`) so the mix repaints in the same beat instead of on the next 1 Hz tick.
5. **Level is a ratio, not an overwrite**: `setLayerLevel` scales every entry, so a preset's fade survives.
   Pitch and beat sliders appear only for single-entry layers; a multi-entry layer says so and offers its
   timeline instead.
6. **Visualise restructure (plan item 2)**: Follow + the mapping + scene/medium chips + layer toggles moved
   into the chamber card above its Open button; Ambient panels keeps its own Scene menu; the select's
   custom option now reads "Custom (chips)". Four harness legs pin the new structure.
7. **Pre-existing tablet bug fixed**: `#scr-home{display:flex}` / `{display:grid}` were ID rules that beat
   `.rs-screen{display:none}`, so Home stayed pinned above whatever screen was open (the Visualise card sat
   at y=1129 on a tablet). Both are now `#scr-home.rs-on`, which also restored the two-pane Home at 900+
   (the tablet pass caught that the 900 rule had lost its specificity).
8. The **welcome tour** now points at `#rsMix` and `#rsAdvDet` (its old stops pointed at `#rsBuild` and
   `#rsVoices`, both folded away, which stranded its bubble off-screen), and its copy describes the mix.
9. The Studio's own transport means the **mini player no longer shows on Studio** (it would be a second
   transport on the same glass).
10. **The Studio transport is amplifier hardware**, the same family as the hero and the chamber: brass
    **play, pause and stop** as three separate keys (ui/amp-play, amp-pause, amp-stop; play rings live while
    running, pause dims when idle) and a **master fader** — sunk slot, 28 px track, knurled brass thumb at
    `#rsStuVol`, painted by the one `paintLevel` and written through `setMaster`. Clock and Loop moved to a
    second row under the keys, and the Loop switch is brass too (a collar in a sunk slot, not the app accent)
    so the transport is one piece of hardware.
11. **Every option carries a mark of its own.** Chamber scenes get a swatch in the colours that scene
    actually renders (palette -> rim+line from `cymrender.js`); mediums get a shape (plate, bolted, disc,
    drum, water, bubbles); the ambient card's backdrops and overlays get shape marks (tide, phasefield,
    drift, rainfall, score, aurora; pulse, phasors, traces, orbits, ripples, harmonograph, weave, meters);
    ambient palettes get a swatch from `vizpal.js`'s own stops. Decorative only — the label still names it,
    and `decorateSwatches()` is idempotent so a re-adopted card cannot double-mark.
12. **The Home player's Loop is amplifier hardware**: a generated brass loop key (`ui/amp-loop.webp`,
    gpt_image_2 1k/high, 3.5 credits, cut to 256 px) with a **red pilot lamp** that lights when looping is
    on, plus an engraved LOOP label; the timer sits in an **amber LED window** (smoked glass, inset
    shadow, glowing monospace digits). Full interface only — Minimal keeps the plain switch. The key
    drives the page's own `#loop` input, so nothing about the engine changed. Contrast needed a fixed
    warm grey for the engraved label (a theme token vanishes on the dark plate) and a solid
    `background-color` on the LED panel for the probe.
14. **Focus view atmosphere (owner: "the subtle pop of a parallax")**: two generated plates
    (`ui/focus-cool.webp` 14 KB, `ui/focus-warm.webp` 10 KB, gpt_image_2 16:9 1k/high, 3.5 credits each)
    crossfade by the preset's own palette — warm for ember/rose/dusk/solar/blood/blossom/candle/champagne.
    Two depth planes (blurred 52 s drift, sharp 34 s drift) behind a `screen` blend at 55 %, plus a shallow
    pointer parallax written to the wrapper. Motion is inside `prefers-reduced-motion: no-preference`.
    `openFocus` now waits up to ~1.2 s for `[data-viz-panel]` instead of toasting, and forces the
    visualiser on before the host is moved, so the first frame paints in place.
16. **Home counter line**: `#meta` (voices · entries · length · loop) is centred under the schedule
    picture and wears an amber LED window (smoked glass, inset shadow, glowing monospace) — pure shell CSS
    on `html[data-rs-ui=full] .rs-hero #meta`, no page edit.
15. **Focus preset audit (24 presets, session playing, pixel-sampled):** 11 animate, 11 draw but read as
    near-static (slow/calm presets: quiet-tide, drift-meter, aurora-orbits, ember-bed, ember-ripples,
    phosphor, harmonograph, orbits-only), and **2 draw nothing at all — `cold-drift` (drift backdrop) and
    `ripple-only` (ripples overlay)**. `drift` and `ripples` are the two modes to repair. The focus view is
    2D canvas only (viz*.js has zero WebGL); the chamber's WebGL2 field is a singleton behind
    `window.ResonanceCymatics` with open/close only, so porting it is a real extraction, not a switch.
13. **Medium chips were dead-looking (owner report).** The engine did switch (`prefs.medium` went plate →
    bolted → disc → drum → bubbles), but `syncVis()` repainted the chip row and the `#rsMap` readout from the
    session plan on every tick, so only the session's own medium ever stayed lit and the line still said "on
    water". Now, once a person picks, the row and the readout read `getPrefs().medium`; the plan owns the look
    only while Follow is on. A harness leg clicks drum, waits a tick, and asserts prefs + the lit chip + the
    readout all agree.

## Gates on these bytes

harness **215/0** · contrast **0** · tablet **82/0** · eslint **0 problems** · lint **0/0** ·
JVM **26/26** · device gate **19/0** · apk_identity **34/41** (the seven byte-identity legs cannot pass on a
minified release). Pass `--site` a **native** path (`C:/Users/...`); an MSYS `/c/...` path silently fails
nine source legs.

## PUBLISH PAYLOAD — STAGED, NOT UPLOADED (his review is the gate)

- `radio-browser/deploy/downloads/resonance-studio-v2.0.6-beta.apk` = the same 758,130 B bytes (re-staged in place; 2.0.6 was never uploaded).
- `deploy/updates.json`: resonance-android = 2.0.6-beta / **14** / 758130 / `9451ce02…`; feed = file = card
  verified equal by script (size **and** sha **and** the card's own `<code>`).
- `deploy/moddys-downloads.html`: pill v2.0.6-beta, href/filename, 0.7 MB, sha at the resonance label's own
  line, certutil line, "New in 2.0.6" paragraph, GitHub → `/releases`.
- Backups: `%LOCALAPPDATA%/Temp/rs-publish-backup-20261108-055518`.
- Upload (on his word): `cd /c/Users/Moddy/radio-browser && python3 upload-site.py --only downloads/resonance-studio-v2.0.6-beta.apk updates.json moddys-downloads.html` then `--verify --only` with the same list →
  expect `0 file(s) not in sync.`
- Then the untested chain: curl the live APK → sha256 vs feed → install those bytes → code 14 and no update
  offered.

## NEXT, in order

0. **FOCUS VIEW REDESIGN — the owner's ask, brief written, nothing built.**
   Read `DESIGN-FOCUS-VIEW.md` first. Verdict: the 24 presets are a cartesian product and read as
   the same picture retinted; replace them with eight scenes that each own a geometry (Cathedral of
   Light, Deep Field, Ink Bloom, Aurora Veil, Ember Lattice, Rain on Glass, Slow Spiral,
   Bioluminescent Drift). New page module `vizscenes.js` (three canvas layers: far plate / mid wash /
   near anchor), 16 Higgsfield plates (~56 credits, ≤640 KB), stills for reduced motion and the
   picker, and a **similarity gate** — the leg that would have caught "they all look the same".
   Old presets stay behind a flag until sign-off. One focused session.
1. **His eye** on the Studio (mix, add-a-sound chapters, a layer's editor), then the upload above.
2. **Play track**: privacy page, AAB, 12-tester/14-day closed test.
3. VizGL step 3: mask the field to the plate, move the simulation.
4. Robolectric follow-ups; Error Prone / JaCoCo / StrictMode / Perfetto / MobSF.
5. Track F features. Do not build accounts/cloud/social/Wear.

## OPEN

- The site's `resonance/app` tree is still behind the page bundled in the APK (noise pack + vizgl work never
  deployed to moddys.net/resonance) — the biggest consistency gap, unchanged this session.
- `apk_identity`'s minified-asset legs; the duplicated chamber/`#rsFsVol` fader CSS; drags gated to ≤820 px;
  no CI leg for the drags (Playwright cannot drive pointer capture; `adb input swipe` can).
- The Studio's files card is 382 px of the phone screen; if it feels long, fold the pack row.

## TRAPS paid for (do not re-learn)

- **`.rs-mrow` was already taken** by the More sheet's rows (`display:flex;align-items:center`), so the mix's
  first rows rendered as a squeezed column at 104 px. Shell class names must be checked against the sheet's;
  the mix rows are `.rs-lay` now.
- **A page rule that sets `display` beats the `hidden` attribute** on `<details>`: hide chapters with a shell
  class (`!important`), never `hidden`.
- **An ID rule beats `.rs-screen{display:none}`** — every `#scr-*` display must be scoped to `.rs-on`, and the
  600 and 900 rules must carry the same specificity or the earlier one wins.
- **`b.firstChild` guard**: an icon painted only when `aria-label` changes leaves the key blank when the markup
  already ships the right label.
- Stray `}` in the shim's CSS string array silently kills every later rule · `!important` + higher specificity
  beats a later rule · a flex item in `overflow:auto` shrinks below its height (`flex:0 0 54px`) · clamp the
  visual drag delta but keep the **raw** delta for thresholds · never regex the first 64-hex on the downloads
  page · two Gradle builds of one source can hash differently — make devices, staged APK, feed and card agree
  by **hash**, not size.

---

# RESUME HERE — Resonance Studio Android, 2.0.5-beta, 2026-11-08 (latest: session 9 FINAL)

## SESSION 9 FINAL — the chamber faceplate, scene chips fixed, versionCode 13

Read this block first; everything below it is history.

### STATE

- HEAD `777f53e`, tree clean, **nothing pushed**. `2.0.5-beta`, **`versionCode 13`**, targetSdk 36.
- **Signed release APK: 715,323 B, sha256 `e48b88d4fb169feffeb159d1d6decc5686fd1beaaf0b580beb49d2dc000d7d68`** (HEAD `16f78b8`),
  installed on the phone (`192.168.1.95:33139`) over the 683,566 B / code-12 build: cold start
  **454 ms**, `page: shim ready` in logcat, crash buffer empty.
- Debug build (`com.moddys.resonance.debug`) on the phone — device_gate and CDP need it.
- **Publish payload staged locally in `radio-browser`, NOT uploaded** (house rule: his review
  first): `deploy/downloads/resonance-studio-v2.0.5-beta.apk` (same bytes as the release APK),
  `deploy/updates.json` regenerated (`resonance-android` = 2.0.5-beta / code 13 / 715067 /
  `fedfcfe1…`), `deploy/moddys-downloads.html` card updated (pill, href, filename, 0.7 MB, sha256,
  certutil line, GitHub link → `/releases`, "New in 2.0.5", 130 sessions). Backups of the two
  site files: `%LOCALAPPDATA%/Temp/rs-publish-backup-*`.

### FIXED THIS SESSION — the scene chips were dead (proven with numbers, then repaired)

Moddy reported Cathedral / Cold Forge / Solar Disc "don't respond". A probe showed the click set
`preset`, then three separate mechanisms erased it: `openChamber()` re-applied the plan's scene on
every open; `applyVis()` forced `src:"session"` after each chip click; `syncVis()` repainted the
chips from the plan, so the chip un-lit immediately. Now a chip is a **manual decision**:
`follow` goes false (persisted, the switch moves with it), the chip stays lit, and opening the
chamber keeps it. `Follow` turned back on returns the chamber to the session. Five harness legs
pin it, including "opening the chamber keeps the scene a person picked".

### BUILT THIS SESSION — the chamber faceplate (his two follow-ups)

- **Root cause found: a stray `}` in the shim's CSS string array.** `.rs-app .cym .cym-top{padding-top:… !important;`
  had no closing brace, so every shell rule after it was swallowed — the chamber had been running
  without its chrome. Fixed; the whole block parses now.
- **Top row:** Back ‹ · LIVE · **?** (the page's **Close removed** — Back already leaves; the
  fullscreen ✕ stays). **Transport row:** Play/Pause 56 px (brass face swaps while playing) ·
  Stop 48 · master fader · CONTROLS engraved on a brass plate.
- **Four new generated keys** (`amp-back/next/info/close`, gpt_image_2 1k/high, 28 credits total,
  re-rolled once because the first set lacked the black bezel ring), cut to 256 px and
  tone-matched radially to the play/pause/stop family.
- **Layout is placed, not wrapped:** two flex rows; navigation on top, transport beneath (phone),
  one row on ≥600 px. Measured 320/390/800: no overlaps, everything inside the glass, 44 px floor,
  fader grows (84–197 px) and nothing else moves. The labelled key is brass with dark engraving.
- **The bottom drawer is a real bottom sheet** (`top:auto` — it had inherited the panel's desktop top
  offset and floated above the gesture bar), with a 54 px handle lifted clear of the safe area and a
  **40 px brass expand key at the far right** whose aria-label flips Hide/Show.
- **Gestures, verified on the phone with real `adb shell input swipe`:** drag the player's lip up →
  panel away (lip parks under the status bar, `y≈60` CSS); drag it down → back; tap the drawer
  handle → open; drag it down → closed; drag it up → open.
- **Auto-hide:** 8 s of quiet puts both panels away together; any touch wakes the player (the
  drawer only from its own handle, so a stray tap cannot spring it over the instrument).
- **Focus view / fullscreen:** one faceplate — `#rsFocusBar` (‹ name › Change) now lives *inside*
  `#rsFsCtl`, above the transport row (play · stop · fader · time). Brass faces on both.
- `paintLevel()` now also paints `#rsCymVol` and `#rsFsVol`, so all four faders/levels are one value.

### CLEANUP PASS (after the chamber work)

- The 8 s quiet timer re-armed forever once the chamber had been opened — it now stops when the
  chamber closes and only re-arms while the document is hidden.
- `paintLevel()` rewrote `aria-valuetext` on both new faders every tick; it writes on change only.
- The chamber built a fresh `matchMedia` per pointermove during a drag; one cached object now.
- Removing Close left nothing focused on open; Back takes focus.
- **Control audit**: 253 interactive elements across the five screens (home 19, sessions 19,
  studio 109, visualise 60, settings 46); every rendered `data-act` (6) and `data-rs` (7) value has
  a handler; the 33 with no listener of their own are delegated settings rows, pack-download
  anchors, or inputs read at submit. Behaviour spot-checks all pass — theme, UI mode, accent,
  follow, scene/medium/sand chips, hero play (aria flips to Pause, sample advances) and stop, mute
  and restore. "Add a voice" *opens* the builder pane rather than adding a voice — that is the
  page's design, not a dead control. `tools/shim_harness.py` 199/0 after the cleanups.

### CARD BANDING (the Sessions look, carried across)

Studio / Visualise / Settings sections now wear a session row's band: a 3 px edge in the band
colour plus a wash that dies inside the first half of the box, at **0.09 alpha against the rows'
0.18** because a card is ~4x the area. Bands are assigned by function, not decoration: amber
(focus) = build a tone, voices, chamber; green (relax) = data, focus view; gold (wake) =
appearance; teal (other) = catalogue, quick picks, follow, ambient panels, help. Minimal is
untouched (all rules gated on `data-rs-ui=full`). **The Speaker-friendly rail was plain because
its title matched none of the band patterns** — the rail builder's regex now maps
speaker|pulse|room|iso to `other`. No Higgsfield art: the Sessions boxes are pure CSS.
Contrast 0 after the change; harness 199/0 (that run predates the one-line rail regex).

### GATES (this session, all green)

`py -3.11 tools/shim_harness.py` **199/0** · `cache/contrast.py` **0** · `tools/tablet_pass.py`
**82/0** · `:app:lintRelease` 0/0 · JVM tests **26/26** across both channels ·
`tools/device_gate.py -s 192.168.1.95:33139` **19/0** (a fresh install needs a second run — the
first launch settles) · `apk_identity` **36/43**: the seven "byte-identical to the site" legs
compare raw source to a **minified** asset (app.js 38,185 → 21,932 B) and cannot pass on a release
APK — fix the tool or judge identity from a debug build.

### PUBLISH — one command away, waiting on his review

```
cd /c/Users/Moddy/radio-browser
python3 upload-site.py --only downloads/resonance-studio-v2.0.5-beta.apk updates.json moddys-downloads.html
python3 upload-site.py --verify --only downloads/resonance-studio-v2.0.5-beta.apk updates.json moddys-downloads.html
```
Then the untested chain, for real: `curl -sL https://moddys.net/downloads/resonance-studio-v2.0.5-beta.apk`
→ `sha256sum` against the feed → install the downloaded bytes on the phone → confirm
`versionCode=13` and that the app offers no update (feed code == installed code).
`check-moddys-downloads.py` local: 60 checks, the resonance link resolves; its 3 failures are
pre-existing (two PatternForge live links answer HTTP 300, palette/spraybar drift vs index.html).

### DECIDED

- The chamber's Close key is gone (Back owns leaving); the fullscreen ✕ stays.
- A scene chip is manual control and turns Follow off — do not "restore" the old auto-reapply.

### NEXT AFTER THE PUBLISH — the Visualise restructure (agreed, not built)

Two different things share one card in Visualise, which is why it reads confusing:
`Follow the tone` + the scene/medium chips are **chamber** controls but sit next to the
**Ambient panels** card, and that card has its own Scene menu, duplicating "Scene".

Plan (a move of existing nodes; no new art; updates live):
1. Move the Follow switch, `#rsScenes`, `#rsMedia`, `#rsVisToggles` and the `#rsMap` line
   **into the chamber card**, directly above the "Open the chamber" button.
2. The Ambient panels card stands alone as a visualiser entry; its own page Scene menu is the
   only scene control for panels, and the duplicate chips go.
3. Focus-view card unchanged.

Also shipped late in session 9: focus view — a tap anywhere now only wakes the player (the
old toggle hid it on the revealing tap, which read as a flicker), and the page's sync/slow
badge is hidden there (`.viz-badge` under `html.rs-focus`).

### QUEUE, in order

1. **His eye on the chamber, the cards and the focus view** — then the publish above.
2. Play track: privacy page live, AAB, closed test.
3. VizGL step 3: mask the field to the plate.
4. Robolectric follow-ups; Error Prone/JaCoCo/StrictMode/Perfetto/MobSF.
5. Track F features. Do not build accounts/cloud/social/Wear.

### TRAPS (new, costly)

- **A stray `}` in the shim's CSS string array kills every rule after it, silently.** When a
  chamber rule "does not apply", balance the braces of the injected sheet before anything else.
- **`!important` + higher specificity beats a later rule.** The header's padding is pinned by the
  full-UI rule, so a second `padding-bottom` never landed; put the lip outside the box instead.
- **A flex item in an `overflow:auto` column shrinks below its height** — give handles `flex:0 0 46px`.
- **Clamp the visual drag delta, keep the RAW one for the decision**, or the threshold is unreachable.
- **Playwright's synthetic mouse does not drive these pointer-drag handlers** (page.mouse down/move/up
  produced no drag); `adb shell input swipe` does. Scale CSS → device px with `wm size / innerWidth`.
- **The generated release APK is minified**, so the site byte-identity legs of `apk_identity` are red
  by construction.

---

# RESUME HERE — Resonance Studio Android, 2.0.5-beta, 2026-11-08 (latest: session 8 FINAL)

## SESSION 8 FINAL — player rebuilt, two new gates, swipe refused (HEAD `05483e0`)

Read this block first; everything below it is history.

### STATE

- HEAD `05483e0`, tree clean, **nothing pushed**. `2.0.5-beta`, `versionCode 12`, targetSdk 36.
- **Both real devices run the release build built this session**: `app-release.apk` **683,566 B**,
  sha256 `4ffc0a84e20d750e7694de460b1e2914ec272f63841cef01432067468577035c`, installed over the
  session-7 build on phone (`192.168.1.95:33139`, motorola edge 60 fusion) and tablet (`SM-X210`,
  wireless mDNS `adb-R92XB0RWN3B-67B1Tm._adb-tls-connect._tcp`). Cold start 320 ms, no crash.
- The **debug** build (`com.moddys.resonance.debug`) is installed on the **tablet and emulator** —
  it is the only build with a devtools socket, so `tools/device_gate.py` needs it.
- **A generated transport-art pack now ships**: `app/ui/amp-{play,pause,stop,vol-knob,vol-track}.webp`,
  31.6 KB total. `.gitattributes` already marks `*.webp` binary.

### SHIPPED THIS SESSION, all gated

1. **Hold-fade fixed** (`packs.js`). `engine.js:151`: an entry ramps into the NEXT entry's values and
   the last wraps to entry 0, so `{fadeIn:0},{hold:vol},{fadeOut:0}` made every session's HOLD the
   fade. The fade-out entry now repeats the level. Measured against the old build: **92 of 130
   sessions change, 0 voices change peak, 0 change duration** — it cannot make anything louder or
   longer. Focus 40 (gamma) went from 0.338 at 60 s falling to 0.012 at 1180 s to a flat 0.350.
   The wake ramp got the same treatment (its dead silent tail is gone).
2. **GPU field switch held back for 2.0.5** (`cym.js`, `GL_SWITCH_VISIBLE = false`). As shipped it
   replaced the plate with a full-bleed shader and ran **46 fps against the canvas path's 90** on
   the Adreno 619. The code is kept: flip the constant, or pin `window.__rsGLRender = "gl"` +
   `api.setFieldRenderer("gl")` (verified live: `mode gl, glLive true, glError ""`). A stored
   `fieldRenderer:"gl"` can no longer resurrect it.
3. **The player rebuilt** — this is the session's headline.
   - The Play control *was* a volume knob: `knob-calm.webp` laid on it with the glyph hidden and
     rotated 34° while playing; Stop was a blank metal mushroom; there was no pause control at all.
   - Five assets generated with **Higgsfield `gpt_image_2`** (1k/high, 3.5 credits each, 17.5 total
     against 2,716 held), re-cut locally: play/pause/stop faces with the glyph inlaid in black
     lacquer, plus a graduated fader slot and its knob.
   - Both surfaces (home hero and the persistent mini player) now carry **Play/Pause, Stop, mute
     and a fader**. Play swaps to the pause face while running. The level has three faces (hero
     fader, mini fader, both mutes) and all paint from one function, so a change anywhere is
     correct everywhere before the next tick. Mute remembers the level it silenced.
   - **The mini player slides away after 12 s of quiet** (twice the tab bar's 6, because it is the
     transport), keeps its layout space, returns on any touch, same quiet guards as the bar.
   - Verified on the Tab A9+: play/pause/stop both surfaces, pause keeps position (sample 93,184
     preserved), mute 0.7→0→0.7 with aria-pressed and the readout following, mini fader 0.24 and
     0.97 with the hero fader and % following, face swap, and the slide-away (gone at t+13, back on
     one tap).
4. **`tools/device_gate.py`** — 19 checks, **verified 19/0 on the Tab A9+**. Launches the debug
   build, attaches over CDP, taps the real controls and reads the engine's own state back, so
   "the control responded" and "the engine changed" are separate assertions. Covers start-up, tab
   bar, transport geometry (44 px floor), play/pause/stop with the sample read back, mute + restore,
   the mini player off Home with its fader, and the crash buffer. Screenshots to
   `cache/device-gate/` on failure.
5. **Java tests exist for the first time** — JUnit + Robolectric, **13 tests, 0 failures**
   via `./gradlew :app:testUnitTests`: `AssetsTest` 4 (compat.json parses, its `appVersion` equals
   the build's `versionName`, every `ui/*.webp` the shim references is packaged, the amplifier
   assets present), `BridgeTest` 4 (builds the real Activity; `device()`, `palette()`, `copy()`
   asserted against the clipboard, `log(null)`), `FocusTest` 5 (drives `requestFocus`/
   `abandonFocus` on the real service: request reaches AudioManager, a second request does not
   stack, abandon gives it back, abandoning what was never held is harmless, a refusal is
   reported as false).
6. **`debugState()` now returns `cam {yaw,pitch,dist}`** — without it a pinch could only be judged
   by eye. Measured on the tablet: spread 3.55 → 1.35 (near clamp), squeeze 6.00, single finger
   orbits (`yaw` 0.48 → -0.42) without touching `dist`.

### DECIDED, do not reopen without a reason

- **Hold-fade**: fix the idiom, **no level re-tuning** — he listens first. If a flat hold is too
  present, the answer is a per-shape level, never going back to the drift.
- **GPU field**: hidden for 2.0.5; the real work is masking the field to the plate quad and moving
  the simulation.
- **Swipe-between-tabs: NOT being built.** Built twice (two-layer overlay, then a real single-track
  pager), reverted twice — both fail the suite at `page.click("#plist .item .star")`. He agreed the
  navigation is self-evident without it, Settings is not a swipe neighbour, and the screens'
  carousels own the axis so the gesture would work in patches. If a gesture is ever wanted, the
  **mini player is the right home** (swipe up for the full player, down to dismiss) — vertical, no
  carousel conflict.

### QUEUE, in order

1. **His ear on the hold-fade** (flat holds at peak for the first time).
2. **Publish 2.0.5**: `versionCode` → 13, signed release, upload, `updates.json`; the
   download → sha256 → installer chain is still **untested end to end**.
3. **Play track** (calendar-bound): 12-tester/14-day closed test, deploy `docs/play/privacy.html`
   to moddys.net/resonance/privacy, AAB, Play App Signing, FGS video, data safety, IARC, shots.
4. **VizGL step 3**: mask the field to the plate, move the simulation. The honest limit stands —
   `heightAt` still runs every frame, so the 18 ms UI cost is not gone.
5. **Robolectric follow-ups**: make `requestFocus`/`abandonFocus`/`handleFocusChange`
   package-private (they are driven by reflection today); then test `handleFocusChange` for LOSS
   and CAN_DUCK, which needs page/notification scaffolding.
6. **Gates still missing**: Error Prone (needs the manual `--add-exports` recipe; the net.ltgt
   plugin never injected `-Xplugin`), JaCoCo coverage, StrictMode/LeakCanary, Perfetto, MobSF.
7. **Track F features**: bedside mode, speaker-safe entrainment, session files + QR, noise continuum
   + room calibration, night programs, on-device journal, haptics + Live Update.
8. Do **not** build: accounts, cloud sync, social, AI companion, sensor sleep tracking, Wear OS.

### TRAPS (new this session)

- **The harness pins design, not just behaviour.** A leg asserted "the knob on Play" — the exact
  thing to be changed. When you change a design, the leg has to change with it, deliberately.
- **`testOptions.unitTests.includeAndroidResources` is required** or every service test dies with
  `Resources$NotFoundException` — it looks like "Robolectric doesn't work on this project".
- **`ShadowAudioManager.getLastAudioFocusRequest()` returns Robolectric's own type**, not
  `android.media.AudioFocusRequest`; name the return type or you get an incompatible-types error.
- **Flavours make task names ambiguous** (`testDebugUnitTest`, `lintRelease`). Add an aggregate task
  depending on both channels, as the project already does for lint.
- **`Page.captureScreenshot` returns black bands / whole black frames on this WebView.** Use
  `adb exec-out screencap -p`.
- **Rects read straight after the nav arm or a smooth scroll are stale** — wait ~550 ms or use
  `behavior:'instant'`. `#cymRoot` scrolls with `overflow:hidden`, so `scrollIntoView` inside the
  chamber drives the stage to y=-833.
- **The mini player's own auto-hide can look like "the buttons don't respond"**: while hidden it is
  `pointer-events:none`, so the first tap only wakes the bar. Same two-tap feel as the tab bar.
- Generated binaries: `.gitattributes` already lists `*.webp binary` — do not re-add a `**` text
  rule above it.

### TOOLS

`./gradlew :app:testUnitTests` (13) · `py -3.11 tools/device_gate.py -s <serial>` (19) ·
`py -3.11 tools/shim_harness.py` (183) · `./gradlew :app:lintRelease` (0/0) ·
`py -3.11 tools/apk_identity.py <apk>` (32) · `py -3.11 cache/contrast.py` ·
`py -3.11 tools/tablet_pass.py` · `npx --yes eslint@9 --config eslint.config.mjs app/src/main/assets/www`

Signed build env: `KEYSTORE_FILE=C:/Users/Moddy/keystores/resonance-release.p12`,
password in `resonance-release-credentials.txt` beside it, `KEY_ALIAS=resonance`, `storeType PKCS12`.
Both flavours build; `outputs/apk/release/app-release.apk` is the **sideload** mirror (has INTERNET),
`outputs/apk/play/release/app-play-release.apk` is the Play one (no INTERNET).

Debug attach: `pidof com.moddys.resonance.debug` → `adb forward tcp:9337
localabstract:webview_devtools_remote_<pid>` → `curl :9337/json`; the websocket client must pass
`suppress_origin=True`.

### FIRST THREE MOVES

1. Read this block, then `git log --oneline -6` to see the four commits since the last save.
2. Confirm the tree is still green: `./gradlew :app:testUnitTests`, `py -3.11 tools/shim_harness.py`.
3. Then either his ear on the hold-fade, or start the publish path (versionCode 13) — the only
   thing standing between this build and your phone's next update.

## SESSION 8 (earlier this session) — the eye pass, before the player work


## SESSION 8 — the eye pass, before any versionCode or hold-fade decision (HEAD `291f264`)

### STATE

- HEAD `f98f653`, tree clean, nothing pushed. Still `2.0.5-beta` / `versionCode 12`.
- Phone `ZY22LGC75T` (`192.168.1.95:33139`) and tablet `SM-X210` (wireless, mDNS transport)
  both still carry the session-7 **release** build (650,567 B).
- The **debug** build (`com.moddys.resonance.debug`) is now installed on **both** the emulator
  and the Tab A9+, so every later session can drive and read the chamber live over CDP
  (recipe below). The tablet debug install is what the measurements in this block came from.

### WHAT THE BUILD LOOKS AND FEELS LIKE (measured, not eyeballed)

1. **Home / Sessions / Visualise / chamber on the phone are clean.** Cold start 269 ms; home
   renders the player card, the 2x2 session grid and the mini player; the tab bar is at rest
   (`rs-navhide`) as designed. Visualise is tidy. The chamber opens from the row a person taps
   and paints a proper tilted plate.
2. **Noise pack is on device**: `LIBRARY.length` **130**, pack `noise` with its six sessions
   (`White noise (broadband mask)`, `Pink noise (room balance)`, `Brown noise (low bed)`,
   `Rain (brown, pink and white)`, `Pink, short (first pass)`, `Brown, open-ended`).
3. **Pinch works, with numbers** (Tab A9+, injected two-finger touch): spread → `dist`
   **3.55 → 1.35** (near clamp), squeeze → **6.00** (far clamp), and a single finger still
   orbits (`yaw` **0.48 → -0.42**) without touching `dist`. Pointer ids arrive as two distinct
   ids, so the by-id tracking is exercised for real. `#cymGL` is only present in the build from
   `61f9388` onward — a debug APK older than the vizgl commit has no switch at all.
4. **GPU field: it works, and it is a downgrade as shipped.** On the Adreno 619 it is live
   (`glLive: true`, no error, a second 1200x1920 canvas) but:
   - **the plate is gone.** `vizgl.js` draws ONE full-screen triangle, and `cymrender.js`
     deliberately turns the 2D canvas into a transparent particle overlay
     (`draw({field:false})`). So GL mode is a full-bleed shader field with no plate body,
     rim or perspective — on both the tablet and the phone. It reads as unfinished next to
     the canvas plate.
   - **it is slower.** Six interleaved samples each, same plate/camera/sand, 800x1280 CSS at
     DPR 1.5: **canvas 90 fps (90,88,90,90,90,90) vs GPU field 46 fps (46,48,47,46,46,46)**.
   - The particle overlay *does* draw on a dry plate (7,876 non-zero-alpha px, 0.34%) —
     `cym.js:523` suppresses sand in **water** medium, which is what made an empty canvas look
     like a bug at first. Do not read an empty overlay in water as a defect.

### GATES on `291f264` (the only code change this session)

`:app:lintRelease` **"No issues found."** | harness **183 passed, 0 failed** |
`npx eslint@9` **clean**.

The change: `debugState()` now returns `cam { yaw, pitch, dist }`. Without it a pinch could
only be judged by eye; with it the four numbers above are a gate.

### APPLIED AFTER THE DECISION (`f98f653`)

His calls: **fix the envelope idiom, do not re-tune the levels** (he listens first), and **hold
the GPU field switch back for 2.0.5 while keeping the code**.

1. `packs.js` — the fade-out entry now repeats the level instead of carrying 0, in both the
   plain and the wake-ramp branch. The wake branch keeps its `vol * 0.8` easing but the fade-out
   entry repeats *that*, so the entry before it is no longer the fade and there is no dead silent
   tail. Measured against HEAD on the shipped library: **92 of 130 sessions change, 38 unchanged**;
   **0 voices change peak, 0 voices change duration** — the fix cannot make anything louder or
   longer, it only stops the drift. Classic and noise are untouched (they never used that path).
   Focus 40 (gamma) is the reference case: `0.338` at 60 s falling to `0.012` at 1180 s becomes a
   flat `0.350` throughout. Largest single change at a sampled instant: **+0.160** (`Settle the
   room`, speakers pack).
2. `cym.js` — `GL_SWITCH_VISIBLE = false` gates both the label in the Display section and the
   persisted preference, so the switch is absent from the UI and a stored `fieldRenderer: "gl"`
   can no longer resurrect it. Verified live on the Tab A9+: Display now lists only Sand grains /
   Nodal glow / Bubbles / Airborne dust / Freeze motion; a hand-written `"gl"` in
   `resonance.cym.v2` still resolves to `canvas`. The code is kept — flipping the constant brings
   the switch back, and `window.__rsGLRender = "gl"` + `api.setFieldRenderer("gl")` still gives
   `mode: gl, glLive: true, glError: ""`, so the path stays probeable for the real work
   (mask the field to the plate, move the simulation).

Gates on `f98f653`: `:app:lintRelease` **"No issues found."**, harness **183 passed / 0 failed**,
ESLint **clean**.

### TWO NEW GATES (`1adf4ab`, `7714284`)

- **`tools/device_gate.py`** — the on-device pass the Chromium harness cannot reach. It launches
  the **debug** build, attaches over CDP, taps the real controls and reads the engine's own state
  back, so "the control responded" and "the engine changed" stay separate assertions. **19 checks,
  verified 19/0 on the Tab A9+**: start-up, tab bar, transport geometry (44 px floor),
  play/pause (sample kept)/stop (rewound), mute + restore, the mini player off Home with its fader,
  and the crash buffer. `py -3.11 tools/device_gate.py -s <serial>`; screenshots land in
  `cache/device-gate/` on failure. Use it whenever a change touches scrolling, layout or the
  bridge — that is where `shim_harness.py`'s stubs disagree with the real WebView.
- **`app/src/test`** — Java had **zero** tests. JUnit + Robolectric wired; **8 tests, 0 failures**
  via `./gradlew :app:testUnitTests` (the aggregate exists because the flavours make
  `testDebugUnitTest` ambiguous, same reason `lintRelease` does). `AssetsTest` guards build
  integrity: compat.json parses, its `appVersion` equals the build's `versionName` (the drift World
  Radio shipped once), every `ui/*.webp` the shim references is packaged, the five amplifier assets
  exist. `BridgeTest` builds the real Activity under Robolectric (only `create()`, never `setup()`
  — start/resume would start the service) and covers `device()`, `palette()`, `copy()` (asserted
  against the clipboard) and `log(null)`.

**Swipe-between-tabs: built twice, reverted twice.** The trap in `resonance-android-ops` records
why — the suite and parts of the shell treat `#rsBody` as the scroller, so port the harness's
scroll model before restructuring anything.

**NOT DONE, deliberately**: no level re-tuning (waiting on his ear), and `versionCode` is still
12 — the publish step has not been touched.

### HOLD-FADE — the measurement that produced the decision

`engine.js:151` — a segment "ends at the next entry's start values (last entry wraps to
entry 0)". So `{fadeIn:0}, {hold:vol}, {fadeOut:0}` makes **the hold itself ramp vol -> 0**,
and the fade-out entry then ramps 0 -> 0 (a dead tail). The engine's own `tone()` and the
noise path both use the correct idiom `{fadeIn:0}, {hold:vol}, {fadeOut:vol}`.

Measured against the shipped library: **114 of 130 sessions** carry the broken signature
(last entry 0, long non-zero entry before it). Clean: 10 classic + 6 noise. **5 classic
sessions are affected too**, and the longest affected holds are the 5,400 s free-flow
sessions. Every pack except classic/noise is affected.

Fixing it lifts the mid-session level of 114 sessions from ~50% of peak to ~100% (the standard
shape measured 0.160 at 75 s, 0.0743 at 1200 s, 0.0057 at 2100 s — the arithmetic reproduces
exactly). That is why it is his call and not a cleanup.

### TRAPS (new this session, all cost real time)

- **The tab bar animates its transform.** `rs-navhide` off + an immediate `getBoundingClientRect()`
  returns the *pre-transition* rect (y=1301, below an 1280 viewport) and the tap lands on nothing.
  Wait ~550 ms after arming before reading the rect.
- **`scrollTop +=` and `scrollIntoView` animate** (smooth scrolling): a rect read immediately
  after is stale. Use `element.scrollTo({top, behavior:'instant'})`.
- **`#cymRoot` scrolls with `overflow:hidden`.** It is not matched by an `auto|scroll` filter, and
  `scrollIntoView` on any chamber control scrolls it — which drives the canvas to y=-833 and puts
  every "centre of the canvas" gesture off-screen (negative y). Park with
  `document.getElementById('cymRoot').scrollTop = 0`.
- **`Page.captureScreenshot` over CDP returns black bands and full-black frames on this WebView.**
  Use `adb exec-out screencap -p`. A full-black CDP frame is not a black screen.
- **`Input.dispatchTouchEvent` needs `Emulation.setTouchEmulationEnabled`** first; `/json` on a
  forwarded port >9335 rejects the websocket unless the client suppresses the Origin header
  (`websocket.create_connection(..., suppress_origin=True)`).
- **A pinch leaves the camera at a clamp.** Re-set it (double-click the plate, or `resetCam`'s
  0.52/0.66/3.30) before judging the renderer, or every later screenshot is a tiny plate at
  `dist 6.0` and looks like a rendering bug.

### TOOLS (this session's additions)

`cache/scratch/s7/cdp.py` — raw CDP client, `RS_CDP_PORT` selects the device (9335 emulator,
9336 tablet). `cdp.py '<js>'`, or import `evaljs/touch/shot`.
Attach: `pidof com.moddys.resonance.debug` → `adb forward tcp:9336
localabstract:webview_devtools_remote_<pid>` → `curl :9336/json`.

## SESSION 7 — lint to zero, 25% smaller, Play-clean flavour, GPU field (HEAD `61f9388`)


### STATE

- HEAD `61f9388`, tree clean, **nothing pushed**. `2.0.5-beta`, `versionCode 12`, targetSdk 36.
- **Both devices run 650,567 B**: tablet SM-X210 (wireless, mDNS transport) and phone
  `ZY22LGC75T` motorola edge 60 fusion (`192.168.1.95:33139`). Verified by `base.apk` size.
- **Tablet GPU is an Adreno 619**, not the 643 the research budgets assumed — every perf number in
  `docs/ROADMAP-2026-11.md` needs re-basing on it. WebGL2, `EXT_color_buffer_float`, maxTex 8192, DPR 1.5.

### SHIPPED THIS SESSION (all gated, all on device)

1. **Lint 0/0** (was 3 errors / 11 warnings). `OnBackInvokedCallback` into an `@TargetApi(33)` method;
   `windowLightNavigationBar` into `values-v27` / `values-night-v27` over a shared `AppThemeBase`;
   `Locale.ROOT`; dead SDK guards; `fullBackupContent="false"`; unused colours deleted.
2. **APK 860,074 -> 641,386 B** before the new features: knobs 512->256 px (-85,158; they paint at
   68 px), release-only terser over the packaged JS (-66,124; sources stay readable), ten density
   launcher PNGs deleted (-67,412; adaptive icon covers every density at minSdk 26).
3. **ESLint + Gradle wrapper**. ESLint found five real defects: duplicate key in `cympresets.js`,
   sparse array slot in `_shell_shim.js`, a dead `Shift+R` branch in `cym.js` (`r`/`R` claimed
   twice), redeclared `target` and `db !== db` in `viz.js`, redeclared loop var in `vizmodes.js`.
4. **play / sideload flavours.** Play build has **no INTERNET, no ACCESS_NETWORK_STATE, no
   REQUEST_INSTALL_PACKAGES** (verified with `aapt2 dump permissions`) and the updater is compiled
   out via `BuildConfig.SELF_UPDATE`; sideload is byte-identical to before. Mirror tasks keep
   `outputs/apk/release`, `outputs/bundle/release`, `outputs/apk/debug` on the sideload build.
5. **Audio focus** in `PlaybackService`: `AUDIOFOCUS_GAIN` around the existing startForeground
   ordering, abandon on stop, pause on LOSS/TRANSIENT, duck on CAN_DUCK. Request+abandon observed
   on device; loss/duck paths are code-verified only.
6. **`app/vizgl.js`** (24,281 B): 8-mode Chladni field shader, real capability probe, inert until
   `init()`. Chamber paints its **field layer** with it when `fieldRenderer='gl'` (default
   **canvas**) — Canvas runs unchanged when webgl2 is missing, init fails, or the context is lost
   (all three forced in the probe; zero page errors).
   **HONEST LIMIT: painting moved, not the simulation — `heightAt` still runs every frame for
   sand/bubbles/dust, so the 18 ms UI cost is NOT gone.**
7. **Noise pack.** `engine.js`: pink was not pink (inherited one-pole lopass measured -3 dB/oct) —
   replaced with Paul Kellet's 3-pole 1/f. Measured octave slopes: white +3.07, pink +0.07, brown
   -2.34 dB/oct at the documented gain. 10 ms master ramp makes play/pause click-free (bit-identical
   after sample 441). New pack: 6 sessions, library 124 -> 130, no existing session altered.
8. **Pinch-to-zoom** in the chamber (`cym.js`): pointers tracked by id, distance ratio maps onto the
   wheel's `cam.dist` clamp 1.35-6.0, remaining finger re-seeds the drag. Hint now says pinch or
   wheel by `(pointer: coarse)`.
9. **Docs**: `docs/ROADMAP-2026-11.md` (five research streams, corrected against the code) and
   `docs/QUALITY-GATES.md` (measured matrix + what is still missing); `docs/play/` — privacy policy
   (md + self-contained HTML), listing copy with 3 A/B arms, data-safety answers, FGS declaration +
   shot list, IARC answers, 52-item checklist.

### OPEN QUEUE, in order

1. **His eye on the new build**: pinch, noise pack, the "GPU field (WebGL2)" switch in the chamber's
   Display section (default remains canvas).
2. **Hold-fade defect, owner decision**: in `packs.js` every legacy session's `hold` entry ramps into
   a `fadeOut`, so all **124** sessions fade across their whole hold — measured 0.160 at 75 s,
   0.0743 at 1200 s, 0.0057 at 2100 s. Fixing changes every existing preset's loudness envelope.
3. **Publish 2.0.5**: `versionCode` -> 13, upload, `updates.json`; download -> sha256 -> installer
   still untested.
4. **Play track** (calendar-bound): start the **12-tester / 14-day** closed test now; deploy
   `docs/play/privacy.html` to https://moddys.net/resonance/privacy (replace `[OWNER]` contact);
   AAB; Play App Signing enrolment; FGS video; data safety; IARC; screenshots.
5. **VizGL step 3**: move or cut the field *simulation*; the painting-only win is not the 18 ms.
6. **Gates still missing**: Error Prone (plugin 4.1.0 did not inject `-Xplugin` into AGP — reverted;
   needs the manual `--add-exports` recipe), JUnit/Robolectric/JaCoCo (Java has **0 tests**),
   StrictMode/LeakCanary, Perfetto, MobSF.
7. **Track F features**: Cymatic Bedside Mode, speaker-safe entrainment, session files + QR, noise
   continuum + room calibration, night programs, on-device journal, haptics + Live Update card.
8. Do **not** build: accounts, cloud sync, social, AI companion, sensor sleep tracking, Wear OS.

### TRAPS (new this session)

- **`assembleRelease` only runs `lintVital`.** `:app:lintRelease` is the real gate and was red while
  the build looked green. Quote the `lintRelease` line.
- **Mutating AGP's merged assets in a `doLast` never reaches packaging.** Minify via a generated dir
  owned by the *release* source set (`minifyPageJs`); match `mergeReleaseAssets` lazily; every task
  whose name contains `Release` must depend on it or Gradle fails the implicit-dependency check.
- **AAPT2 only compiles `<adaptive-icon>` in a `v26` folder** — keep `mipmap-anydpi-v26` and put a
  path-scoped `ObsoleteSdkInt` ignore in `app/lint.xml`.
- `apk_identity` must assert **mangling-safe markers** (`ResonanceJs`, `__rs`), not `function native(`.
- The tab bar **auto-hides after 6 s** (`rs-navhide`) and keeps its space; a screenshot without it is
  the resting state. A screencap seconds after launch can be an **empty frame** — re-capture.
- **Wireless adb**: the connect port changes every time the toggle restarts; pair first
  (`adb pair <ip>:<pairport> <code>`, codes are single-use). If `_adb-tls-pairing` is not advertised,
  scan 30000-46000 for the open port. **Revoking USB debugging authorisations also kills wireless** —
  both devices need re-pairing afterwards.
- Error Prone via `net.ltgt.errorprone` 4.1.0 resolved but never added `-Xplugin:ErrorProne`; a
  three-defect probe compiled clean. Do not assume a wired plugin is running — plant a fault.

### TOOLS

`./gradlew` (wrapper, 8.7) | `py -3.11 tools/shim_harness.py [--www <dir>]` (183) |
`py -3.11 cache/contrast.py` (0) | `py -3.11 tools/apk_identity.py <apk>` (32) |
`py -3.11 tools/tablet_pass.py` (82) | `npx --yes eslint@9 --config eslint.config.mjs app/src/main/assets/www` |
signed build env: `KEYSTORE_FILE=C:/Users/Moddy/keystores/resonance-release.p12`, password in
`resonance-release-credentials.txt` beside it, `KEY_ALIAS=resonance`.

## SESSION 6 — lint to zero, 25% smaller, both devices on the new build (HEAD `65310c9`)

### STATE

- HEAD `65310c9`, tree clean, 58 commits ahead of `origin/main`, **nothing pushed**.
- `2.0.5-beta`, `versionCode 12`, **targetSdk 36**. Installed on `ZY22LGC75T` (motorola edge 60
  fusion, `192.168.1.95:33139`) at 22:52 and on the Tab A9+ (`192.168.1.141:37763`) at 22:40.
  Both carry `base.apk` **641,386 B**; cold start 320 ms (phone) / 565 ms (tablet), both log
  `page: shim ready`, no crash buffer entries.
- **He revoked USB debugging authorisations mid-session**, which also kills wireless: both
  devices then had to be **re-paired** (`adb pair <ip>:<port> <code>`). Pairing codes are
  single-use; the pairings themselves persist. The **connect port changes every time the toggle
  restarts** (42457 -> 37145 -> 37763) — read `adb mdns services` immediately before connecting.
  The pairing dialog does **not** always advertise: scanning 30000-46000 for open TCP ports on
  the device IP found the pairing port when mDNS was silent.
- **APK 860,074 -> 641,386 B (-25.4%)**; download 631,080 B; app dir on device 644,838 B;
  Android accounts it as 621,056 B app + 4.90 MiB data.

### GATES on the final bytes

`:app:lintRelease` **0 errors / 0 warnings** (was 3 / 11), harness **183/183 against the
packaged (minified) tree**, contrast 0, `apk_identity` 32/32, release installs and renders on
phone, tablet and emulator. `docs/QUALITY-GATES.md` carries the full matrix and what is still
missing from it.

### WHAT LANDED

1. **Lint to zero, honestly** — `OnBackInvokedCallback` moved into an `@TargetApi(33)` method
   (lint cannot follow the guard into an anonymous class); `windowLightNavigationBar` moved to
   `values-v27` / `values-night-v27` overlays of a shared `AppThemeBase`; `Locale.ROOT` on the
   mime lookup; dead `SDK_INT` guards; `fullBackupContent="false"`; unused colours deleted.
   **`assembleRelease` only runs `lintVital`** — it stayed green for a whole session while
   `:app:lintRelease` was failing. Quote the `lintRelease` line, always.
2. **Size** — knobs 512 -> 256 px (-85,158 B; they paint on 68 px controls), release-only terser
   over the packaged JS (-66,124 B; sources stay readable), ten density launcher PNGs deleted
   (-67,412 B; the adaptive icon covers every density at minSdk 26).

### TRAPS

- **Mutating AGP's merged assets in a `doLast` does not reach packaging** — the APK keeps the
  unminified bytes. The minified copies come from `build/generated/minifiedPage/www`, owned by
  the *release* source set (`minifyPageJs`), and every task whose name contains `Release` must
  depend on it or Gradle fails the graph as an implicit dependency.
- **AAPT2 only compiles `<adaptive-icon>` in a `v26`-qualified folder** — keep
  `mipmap-anydpi-v26` and put a path-scoped `ObsoleteSdkInt` ignore in `app/lint.xml`.
- `apk_identity` now asserts **mangling-safe markers** (`ResonanceJs`, `__rs`), not
  `function native(`, which terser mangles.
- The tab bar **auto-hides after 6 s** (`rs-navhide`) and keeps its space: a screenshot with no
  tab bar and a ~117 px band is the resting state, not a bug.
- A screencap taken seconds after launch can be an **empty frame**; re-capture and check mean
  luminance before believing a layout is broken.

### OPEN, in order

1. **His eye on both devices** — the new build is installed but he has not looked at it.
2. **Publish 2.0.5**: `versionCode` bump to 13, upload, `updates.json` (draft entry later in this
   file), and the download -> sha256 -> installer path is still untested.
3. **Play**: a `play` flavour that removes `REQUEST_INSTALL_PACKAGES`, stubbed updater, Play
   In-App Updates, AAB, privacy page first.
4. **Quality items still open** (see `docs/QUALITY-GATES.md`): Error Prone, JUnit + Robolectric +
   JaCoCo (the Java layer has **0 tests**), StrictMode/LeakCanary, Perfetto on the 18 ms UI
   frame, ESLint on 7,214 JS lines, Gradle wrapper + CI running these gates, MobSF.
5. **Optional size**: on-demand packs (250 KB = 39% of the APK) — a product decision.

## SESSION 5 — tablet on real hardware: dark brushed, bottom bar, filling layout (HEAD `7f6fe34`)

### STATE

- HEAD `7f6fe34`, tree clean, 50 commits ahead of `origin/main`, **nothing pushed**.
- `2.0.5-beta`, `versionCode 12`. Signed release installed on **`ZY22LGC75T`** and on the
  **Galaxy Tab A9+ (SM-X210, `gta9pwifi`, Android 16 / API 36)**, the tablet he plugged in.
  The tablet is on **wireless adb**: `adb pair 192.168.1.141:<pairing port> <code>`, then
  `adb connect 192.168.1.141:33445`; its devtools socket pid changes per install (re-forward
  `tcp:9335` for the debug build).
- Tablet geometry: 1200x1920 at density 240 → **800x1280 CSS**, so it is the same surface the
  emulator was set to.
- **GATES on these bytes: harness 183/183, contrast 0, tablet probe 82/82, and the DOM audit
  clean on all five screens at both tablet sizes.** APK identity was 32/32 on the earlier build;
  re-run `tools/apk_identity.py` on the next cut.

### WHAT HE ASKED FOR, AND WHAT LANDED

> "keep the brown brushed aesthetic in full screen i like the brushed old school amplifier
> look" · "format for full screen on all devices .. no blank white spaces fill the screen as
> on phone" · "move the home sessions studio visualise settings bar to the bottom on tablet"

- **Dark is the default** (`prefs.theme || "dark"`), System and Light remain in Settings.
  The window behind the page and the nav bar now follow the shell's theme (`chrome()` sets both,
  not just the status-bar icons), so the first frame is never white.
- **The brushed plate is the app backdrop** in Full + dark: `#rsApp` carries `ui/plate.webp`
  under an 88-93% dark scrim, `#rsTop` transparent — one amplifier face, not cards on a page.
- **The tab bar stays at the bottom** on tablets (a left rail was built, shown to him, and he
  asked for the phone arrangement back). `--rs-nrail:0px`.
- **Home fills the glass**: modules take every pixel the player leaves — two columns of four
  rows on portrait, and at 900+ two panes with Build a tone under the player.
- **Back is fixed on Android 16**: `goBackOrFinish()` now asks `window.__rs.back()` before
  finishing. The WebView's `canGoBack()` reports false for the shell's own same-document
  entries on API 36, which sent a Back inside the open tour straight to the launcher.
- **44 px floor** on the page's adopted Studio/Visualise controls (rate boxes, mute keys,
  chips were 36-42).

### HOW IT WAS MEASURED

- `cache/tablet_audit.py` — per screen (home, sessions, studio, vis, settings) at 800x1280 and
  1280x800: horizontal overflow, ellipsis-truncated text, sibling overlaps, empty bands under
  the content, radius spread, tile sizes, controls under 44 px. It printed the anomaly list
  this pass was fixed from; all five screens now read `clean`.
- `tools/tablet_pass.py` — 82 checks, now also asserting the tab bar runs across the bottom
  and that the module grid is two columns of sane cards.
- Pixel check of the tablet render: mean luminance 22, zero bright rows.
- **Anomalies still known and deliberately left**: the Wake tile's subtitle truncates
  ("Focus 10 — Mind Awake, Body As…") exactly as it does on the phone; the radius family is
  still 16 px cards / 12 px chips (the systemic type/radius pass is still queue item 3).

### STILL OPEN, in order

1. **His eye on the tablet** (`cache/shots-final2/`, `cache/shots-emu/tab-bottom-bar.png`).
2. **Publishing 2.0.5** — needs his review and a `versionCode` bump (13), then upload and
   `updates.json`; the download → sha256 → installer path is still untested end to end.
3. Systemic type/radius pass, re-cut `tile-drift`/`tile-focus`, Play submission (privacy page
   first), push + tag.

### NEW TRAPS

- **Android 16 WebView `canGoBack()` is false for `history.pushState` entries the shell made.**
  Ask the page (`window.__rs.back()`), not the WebView, or a Back inside a layer finishes the
  activity while the layer stays open behind it.
- **A nav rail is a design opinion, not a rule**: he wants the phone's bottom bar on the tablet.
- **`#scr-studio` *is* the `.rs-screen`** — `.rs-screen #scr-studio …` never matches.
- **The page's own CSS beats the shell's** at equal specificity (chips stayed 40 px until the
  rule carried `!important`).
- **Samsung wireless adb**: `adb mdns services` gives the pairing port; `adb pair host:port code`,
  then `adb connect host:connectport`.
- **Vision was unavailable for long stretches** — the DOM audit plus PIL luminance checks gave
  the evidence instead; keep both in the toolbox.

---


## SESSION 4 — tablet / large-screen pass (HEAD `2a0412b`)

### STATE

- HEAD `2a0412b`, tree clean, 49 commits ahead of `origin/main`, **nothing pushed**.
- `2.0.5-beta`, `versionCode 12`. **Signed release built from this HEAD and installed on
  `ZY22LGC75T`** — APK 864,550 B, sha256
  `3cb246963aa4a3c4ef465f9136c76cd06b521af171b633d7a654da4021173a53`, identity 32/32.
- `emulator-5554` carries the **debug** build (`com.moddys.resonance.debug`) and is the tablet
  surface: `wm size 800x1280`, `wm density 160` (CSS px == device px). Its WebView is
  Chrome 83 — older than any phone, so it is a useful floor for CSS support.
- **GATES on these bytes: harness 183/183, contrast 0, tablet probe 78/78, identity 32/32.**

### WHAT WAS BUILT

Only the phone had ever been driven. At 800 and 1280 the phone layout stretched: the hero read
as a banner, module cards 4:1, the Scene picker ~1000 px, the More sheet full width, the guide
~100 characters a line.

- **One content rail**: `#rsTop`, `.rs-screen` and `#rsMini` share `--rs-rail` = 720 px at
  600+, 960 px at 900+, centred. Layers meant to be full bleed (chamber, fullscreen, focus)
  are untouched.
- **Module grid counts columns** instead of growing cards: flex with a fixed basis, 3 across
  at 600+ and 4 at 900+, and a short last row is **centred** rather than left hanging (8 cards
  over 3 columns is 3+3+2).
- **The More sheet** caps at 560 px, centres, and **lifts 16 px** off the bottom edge with
  all-round corners (`--rs-sheet-lift`). "Closed" travels `height() + lift()` **and** the
  layer is `visibility:hidden` when shut — without both, a strip of it stayed over the nav bar
  and ate taps (measured: closed top 1216 of 1280 before the fix, 1280 after).
- **Help overlays** get a document measure — `min(var(--rs-rail), 640px)` on both `.rs-ov-head`
  and `.rs-ov-body` — so the reading column is not the app rail.
- **The tour bubble** is 400 px wide at 600+ (JS owns the width, because placement measures it
  immediately), and `tourFill()` now runs **before** the 120 ms placement timer instead of
  inside it, so the bubble is never on screen empty.
- **`tools/tablet_pass.py`** — new gate tool. Drives 800x1280 and 1280x800 and measures the
  sheet (closed and open), the three overlays, the scene menu, the file card, all nine tour
  stops, the chamber, the fullscreen layer and focus view: **78 checks**. Screenshots with
  `--shots DIR`.

### VERIFIED WHERE

- Harness + contrast + tablet probe: Chromium, both tablet viewports.
- **Real WebView at 800x1280** (emulator, debug build): rail 720, lift 16, sheet closed
  top = 1280 and hit-testing the app, open 913..1264, guide body/head 640, tour bubble 400,
  step 2 hole 788x129 over the nav. Screenshots in `cache/shots-emu/`.
- **Tour Back on his phone** (queue item 4): Settings → Replay the welcome tour → hardware
  Back from step 1 **and** from step 2 both close the tour and leave the app resumed
  (`topResumedActivity` = MainActivity). No app data was cleared.

### STILL OPEN, in order

1. **His eye** on the tablet look (`cache/shots-tablet9/`, `cache/shots-emu/`): the rail, the
   3-/4-column grid and its centred last row, the floating More sheet, the overlays' 640 px
   measure, the 400 px tour bubble. Plus the earlier list: Files & export, Scene menu,
   Surprise pill, nine tour stops, trimmed copy.
2. **Publishing 2.0.5 needs his review, and the feed entry must bump `versionCode`.** A draft
   entry (`url` `https://moddys.net/downloads/resonance-studio-v2.0.5-beta.apk`, `size` 864550,
   `sha256` `3cb24696…3a53`, `versionName` `2.0.5-beta`) can only be offered to an installed
   build with a **lower** code, so publishing means: bump to 13, rebuild, upload, then write
   `updates.json`. The download → sha256 → installer path is still untested end to end.
3. Then the older queue: systemic type/radius pass, re-cut `tile-drift`/`tile-focus`, Play
   submission (privacy page first), push + tag.

### NEW TRAPS

- **A bottom sheet lifted off the edge must travel `height + lift` and be `visibility:hidden`
  when shut.** Off-setting with `bottom:16px` alone leaves a 16 px strip over the nav bar that
  silently eats taps; `elementFromPoint(vw/2, vh-6)` is how you catch it.
- **A boot-time read of a media-query CSS variable can come back empty.** The sheet's first
  close offset measured 0 lift and parked it 16 px short. Read the offset back from the
  element (`getComputedStyle(el).bottom`) and re-park on `requestAnimationFrame` + `resize`.
- **The tour filled its bubble inside the 120 ms placement timer**, so `#rsTourN` could be
  empty while `rs-t-on` was already set — a blank bubble for a person and a flaky check.
  Fill synchronously, place later.
- **The page hides its own `Controls` button at ≥821 px**, so a 44 px sweep of the chamber must
  skip zero-size controls (the harness already did; the tablet probe did not).
- **The emulator's devtools socket pid changes on every install** — re-read
  `/proc/net/unix | grep webview_devtools_remote` and re-`adb forward` before CDP.

---

## SESSION 3 (later the same day) — read this first

### STATE

- `C:/Users/Moddy/resonance-android`, branch `main`, HEAD `ba8f233`, **tree clean**, 48 commits
  ahead of `origin/main`, **nothing pushed**.
- Version unchanged: `2.0.5-beta`, `versionCode 12`. Installed on `ZY22LGC75T` as a signed
  release from commit `ace1348`'s build; emulator `emulator-5554` still has an older debug build.
- **GATES: `py -3.11 tools/shim_harness.py` 183/183**, `py -3.11 cache/contrast.py` 0,
  `py -3.11 tools/apk_identity.py …` 32/32.

### WHAT THIS PASS FOUND AND FIXED

He reported "clicking About Resonance Studio does nothing". Three separate faults were behind
that class of symptom:

1. **The More sheet's rows were dead.** The sheet popped its own history entry and the overlay
   it opened pushed a new one; the deferred popstate then arrived with the new panel on top and
   closed it. About, Quick guide and Check device all opened and vanished. The sheet now hands
   its history entry to the overlay (`showOverlay(ov, keepBack)`, `tourEnd`-style ownership), so
   closing pops exactly one entry. It worked from Settings all along — the harness only ever
   opened the panels via `window.__rs.guide()/check()`, so no test touched a row.
2. **Toasts never appeared anywhere in the shell.** `toast()` called `window.__gnauralAPI.toast`,
   a method the page has never had, so every message (share copied, saved, checking for updates)
   fell through to a logcat line. The Android bridge now has a real `toast` (Toast.makeText on
   the UI thread) and the helper targets it, with the page's own toast element as the fallback.
3. **Check for updates was silent** when up to date and on failure. `UPD.manual` now records a
   person-asked check and `none()`/`failed()` answer it; Java calls `__rsUpdate.failed(error)`
   when the feed cannot be reached. The launch check stays quiet. `compat.json` also shipped
   `appVersion 1.1.4-beta` — the identity gate was red; fixed and now guarded by a suite check
   against `app/build.gradle`.

**Back was handled twice on Android 13+** — the `OnBackInvokedCallback` and `onKeyDown` both acted,
the second found no history and finished the activity, so one Back closed a panel *and* left the
app. `onKeyDown` now only serves pre-33 (`Build.VERSION.SDK_INT < 33`). Verified on the phone: the
More sheet closes on Back and the app stays.

### SHIPPED THIS PASS (all in the shim unless said)

- **Welcome tour** (`window.__rs.tour`, `#rsTour`): nine stops — welcome, nav, player, eight
  sessions, build a tone (Studio), library, engine room, chamber, the replay row. One bubble with
  a spotlight cut-out + teal ring, caret on the bubble edge, glide between stops, `N of 9`,
  Back/Skip/Next, a **tick that ends it at any point**, `aria-modal` dialog, focus to the bubble,
  `prefers-reduced-motion` honoured. Runs once at first launch (1.6 s after boot, `prefs.tour`),
  replayed from **Settings → Help & about → Replay the welcome tour** (`#rsTourRow`,
  `data-act="tour"`). Back closes it (markBack/popstate). Targets are chosen after `mountCards`,
  so build-a-tone is in Studio, quick picks beside it, the library in Sessions.
- **Surprise me moved into the player**: a pill beside `#rsMode` in the hero, same `.rs-pill`
  skin, 44 px tap target via a wrapping `.rs-tap` button (the visible chip stays 25 px). It drives
  the page's own `#randomBtn` (which also scrambles the visualiser), then starts playback. The
  page's library button is hidden but kept in the DOM — both the page and viz.js bind to it.
- **Page's duplicate "idle" pill** in the hero hidden (`#modePill`) — the shell's live pill is
  the status.
- **Copy trims**: Quick picks hint one line; Ambient panels hint one line ("Follows the audio
  itself — no microphone, no sensors."); the Data section's "Everything is synthesised…" note
  removed; Quick guide copy rewritten to the shipped layout.
- **Overlays**: `aria-modal`, reopen at the top, focus returns to the opener (or the More button
  when the opener was a sheet row).

### LATER THE SAME DAY — interaction pass (HEAD `ace1348` + docs, 183/183)

- **Files & export**: two equal columns per action row, the page's duplicate "Files" heading
  hidden, the export length on its own labelled row (stacked label, full-width select), the share
  button full width.
- **Ambient panels**: the page's duplicate **Cymatic Chamber** button is gone (the shell's own
  card is the door). **Scene is a raised menu** — label row with SHUFFLE, then 46 px arrows
  flanking one wide picker; a hand-set scene now reads "Custom (chips below)" instead of a blank
  menu. The page's card sat inside the shell card, so every control paid two paddings; removed.
- **Swipe / Back**: the chamber took no history entry, so a system Back (edge swipe) found none
  and finished the activity — it dropped to the launcher. It now marks Back on open, closes on
  popstate, and a watcher returns the entry when the page's own close button or Esc closes it.
  **Verified on the phone**: open the chamber → Back → still in the app. Over-scroll is off
  (`overscroll-behavior:none` + `setOverScrollMode(NEVER)`) so an edge swipe cannot offer
  pull-to-refresh.
- The other layers already popped: sheet, help overlays, welcome tour, fullscreen visualiser,
  focus view.
- Still unproven: the update download → sha256 → installer path (feed is stale, see above).

### STILL OPEN, in order

1. **His eye** on what this pass changed: the Files & export card, the Scene menu in Ambient panels,
   the Surprise pill beside LIVE, the welcome tour (all nine stops), and the trimmed copy.
2. **Tablet / large-screen pass.** Only the phone has been driven this session. At tablet widths the
   scene box, the tour bubble (max 340 px), the More sheet and the fullscreen layers have never been
   looked at, and no tablet is attached. The swipe work covered layers and over-scroll, not layout.
3. **The update feed is stale and blocks the update path.** `https://moddys.net/updates.json`'s
   `resonance-android` entry is still `1.1.4-beta` / `versionCode 6`, so the app (12) can only ever
   answer "you are on the newest build". The download → sha256 → installer path is **untested end to
   end**. Publishing 2.0.5 with a bumped versionCode and a fresh feed entry is a deploy he reviews.
4. **Tour Back on the phone by his thumb** — the sheet's Back and the chamber's Back are verified on
   the device; the tour's Back is proven only in the harness, because re-triggering a first run on
   his phone would mean clearing its app data.
5. Then the older queue: systemic type/radius pass, re-cut `tile-drift`/`tile-focus`, Play submission
   (privacy page first), versionCode bump + push + tag.
6. **Always**: `py -3.11 tools/shim_harness.py` (183/183) + `cache/contrast.py` (0) before anything
   ships; APK identity 32/32 on the built APK.

### NEW TRAPS

- **A sheet that hands off to an overlay must transfer its history entry** — popping on the way in
  and pushing on the way out races the deferred popstate, which closes the new panel.
- **`toast()` looked wired but wasn't**: `api()` is the *page's* API. Anything calling a method the
  page does not implement fails silently. The bridge is `host`/`native()`.
- **Back on API 33+**: with the dispatcher callback registered, also handling `onKeyDown` runs the
  pop twice.
- **The harness hiding a bug**: opening panels through `window.__rs.*` skips the row handlers. The
  suite now clicks the rows a person taps.
- **Vision coordinates come back in the image space the model saw**, which is downscaled — scale by
  `device_width / described_width` before `adb input tap`, or the tap lands elsewhere.
- **A `<select>` with an empty value renders blank**, not as its first option. The scene picker did;
  it now carries a named "Custom (chips below)" option.
- **A page card adopted into a shell card pays two paddings** — `#vizCard` inside `#rsVizCard` cost
  every control ~60 px until the inner card's padding was zeroed.
- **The phone locks itself mid-test**: `dumpsys window` showing `NotificationShade` with
  `mDreamingLockscreen=true` means it dozed. `input keyevent 82` (MENU) unlocks an unsecured
  keyguard; a secure one needs the owner. Screenshots then come back black — check focus, not just
  pixels.

---

## STATE (before this pass)


- `C:\Users\Moddy\resonance-android`, branch `main`.
- Version `2.0.5-beta`, `versionCode 12`, `targetSdk 35`, `compileSdk 35`. The version is bumped
  once, at release time — local round-trips keep 12 and reinstall with `-r`.
- **Installed on Moddy's phone** (`ZY22LGC75T`, motorola edge 60 fusion) as a signed release
  (cert `08:B8:…:F2:1B6`) and on the emulator (`emulator-5554`) as debug.
- Release signing: `C:\Users\Moddy\keystores\resonance-release.p12`, alias `resonance`,
  password in `resonance-release-credentials.txt` beside it.
- Build: `JAVA_HOME=C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot`, Gradle at
  `C:\Users\Moddy\tools\gradle-8.7`; env `KEYSTORE_FILE/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD`
  for a signed `:app:assembleRelease`. SDK at `C:\Users\Moddy\nakamichi-remote\sdk`.
- **GATES: `py -3.11 tools/shim_harness.py` 129/129, `py -3.11 cache/contrast.py` 0.**

## WHAT THIS APP IS NOW

A Material 3 shell around the page engine. Five destinations, the page's own cards moved into
the screens, `window.__gnauralAPI` the only source of truth. Home carries the shell's own
session map (below); the page's chart canvas is hidden and still drawn into.

## THE SESSION MAP (built this session — read before touching it)

`drawSched()` + `schedLoop()` + `buildSched()` in `_shell_shim.js`, in the home section. It is
the shell's own renderer over the page's cached curve data (`state.curves`), and it replaced the
page's three-band monospace chart, which was the last "web page" tell on Home.

- Layout: header row (`carrier Hz ≤N` left, `beat Hz ≤N` right, both plated) / playhead chip row /
  carrier lane / beat lane / axis + ruler / legend. `SCHED_*` constants hold every colour.
- Draw order matters: grid -> entry ticks -> fills -> outlines -> beat lane -> axis+ruler -> legend
  -> header -> **chip** -> **playhead last**. Anything drawn after the playhead eats it.
- Noise beds (types 1/7/8) have no pitch: they are hatched along the carrier lane's floor, never
  drawn as a carrier ridge, and they never draw a beat trace (their zero line read as an axis).
- Fill paths must `lineTo` the first point (`schedTrace(..., true)`) — a bare `moveTo` inside the
  trace replaces the baseline subpath and turns the fill into a triangle.
- The ruler always labels the session end and drops a colliding neighbour (`marks.pop()` under 46 px).
- Everything is measured in device pixels: `cv.width = floor(clientWidth * dpr)`.
- Contrast: ink `#B7AC97` 8.46:1 on `#12100F`, axis `#8A7250` 4.16:1, chip fill 2.28:1 with a
  4.16:1 border. Keep those or brighter.
- `window.__rs.sched()` redraws on demand (harness and probes use it).

## SHIPPED THIS SESSION

- The session map above, with nine harness legs (presence, dpr sizing, empty state, label, paint,
  playhead at 0/half/end) — 73 to 89 checks.
- **Tempo now persists across sessions** (decision taken, was queue item 3): stored in
  `prefs.tempo`, re-applied to a new schedule once by `tempoGuard()` on the 1 Hz tick; the
  chamber's label resets it. Three harness legs cover step, carry-over and reset.
- Studio's duplicated "Voices" heading is now "Layers" (guide text matches); the Visualise
  readout is three lines instead of one run-on.
- **Focus view** (the old "Focus mode" was dead — it drove a `#focusBtn` that no longer existed):
  the page's own ambient panels full screen, a bar to step and pick between the 24 visualisations,
  remembered in `prefs.focusPreset`. Opened from Settings and from Visualise.
- **Full / Minimal interface** (`prefs.ui`, attribute `data-rs-ui` on `<html>`, default Full):
  Full wears eleven generated assets in `www/app/ui/` — a brass knob on Play that turns when live,
  a chrome cap on Stop, a metal fader, artwork behind the four state tiles, a faceplate behind the
  hero. Minimal is the plain shell. Every art rule is gated on `html[data-rs-ui=full]`.
- **Visualise** leads with the chamber CTA card (`.rs-cta`), Focus view second, and the page's long
  motion caption is replaced by one line in the panels card (`#vizNote` is display:none).
- **Home**: "What you are hearing" folds into one summary row (`.rs-fold` details).
- **The material spread** (Full only): the separate faceplate strip (`ui/strip.webp`) carries the mini
  player, the app bar, the bottom nav and the viewer control bar; the player's play/stop reuse the
  knob and chrome-cap art. Visualise's two entries are equal cards (CYMATIC CHAMBER / Full visual
  experience, FOCUS VIEW / Gentle visuals), each with its own button.
- **Chrome that leaves**: focus and fullscreen chrome slide away after 4.5 s / 6 s of quiet and come
  back on any touch (`rs-fs-hide`, armed on pointerdown, `FSWAS.hidden` remembers the pre-tap state).
- **Home is the module grid** (eight: Deep sleep, Drift off, Focus, Deep work, Relax, Meditate, Wake,
  Morning), each a 132 px card with its own picture and the session it loads, tap = load + play. The
  player stays above them. `#rsBuild` and the folded hearing row moved into Studio.
- **Band tints on Sessions**: a 3 px band edge plus a wash that dies by mid-card, applied by
  `paintItems()` on a 300 ms beat (it must survive re-render, so never in the renderer itself).
- The app-bar subtitle is empty on Home and Sessions (it mirrored the player).
- **Visualise, tightened**: the two entry cards each carry their own picture (a cymatic nodal figure,
  an aurora ribbon) bled in at the head and faded into the card; the follow row is one switch labelled
  "Follow the tone"; the mapping is one line (carrier, rate, band, medium, mode); the empty state is
  two words; the panels hint is one line. The chamber's own Back/Stop/?/Close controls wear the strip
  metal with a brass edge and its Play is the theme knob — Full only, like everything else.
- **Chamber header**: the action row is a wrapped flex row on a brushed faceplate panel
  (`.cym-top`, with the brand block hidden for room) — never a nowrap row, or Stop and the
  gestures ? run off a 390 px screen. The tone label is hidden there; the plate carries the space.

## OPEN — in the order to take them

1. **Owner eye**, in this order: the Home module grid and its art, the Sessions bands and rail cards,
   the chamber's faceplate header and wrapped control row, the Focus view chrome timing, the
   Visualise cards, and Full against Minimal. Cut what does not earn its place.
2. **Systemic type/radius pass** — titles run 62/46/43 px across screens and the radii are ad hoc.
   One scale, one gutter, one radius/elevation family.
3. **Re-cut the weak art** — `tile-drift` and `tile-focus` are the thinnest of the eleven.
4. **Play submission:** deploy `store/privacy.html` to `moddys.net/resonance/privacy/` first (Moddy
   must review a deploy), then icon/feature/screenshots/listing/data-safety.
5. **Push** — 39 commits ahead of `origin/main`, nothing pushed; bump `versionCode`/`versionName` and
   cut the tag only after his review of the release copy.
6. **Unrun since the last two CSS-only commits** (`0df2ce8`, `be6b302`): the full suite. Run it
   before anything else ships.

## TRAPS (all still live, plus this session's)

- Two ADB devices are attached: **always pass `-s <serial>`**.
- After install/reinstall the WebView devtools socket changes: re-read
  `/proc/net/unix | grep webview_devtools_remote`, re-`adb forward`, retry once.
- `env(safe-area-inset-*)` is **0** in this WebView — insets come from `OnApplyWindowInsets`
  into `--rs-safe-t` / `--rs-safe-b`.
- `font: 600 11px/1 inherit` is invalid CSS; use `var(--rs-sans)`.
- The page's tokens bleed: override `--ink/--panel/--bg/--bg2` on `.rs-screen`.
- Octal escapes in CSS strings break strict mode — write `\u2039`.
- `write_file` refuses files in `cache/` it has not read — `rm` first or use `patch`.
- Gradle/ADB are native: pass `C:/...` paths, not `/c/...`.
- **A canvas `moveTo` inside a helper kills the caller's open subpath** — pass a "start" flag and
  `lineTo` the first point instead (the map's fill).
- **`clientWidth` excludes the 1 px border** — size the backing store from `clientWidth`, not from
  `getBoundingClientRect().width`, or the dpr assertion is off by two.
- **A plate drawn after the playhead hides it**; a chip drawn over the head hides the dot.
- **A noise voice's beat is 0** — drawing it puts a flat amber line on the lane floor that reads
  as the axis.
- **The page auto-loads a preset at boot**, so "no session" has to be simulated
  (`state.curves = null`) before checking the empty state.
- **The route is text-only**: `vision_analyze` 400s on images. Grade visuals by delegating a child
  with PIL and the PNG in `images`, and give it the previous round's defect list — blind "does it
  look good" answers are useless. **A screenshot taken seconds after an install can be the previous
  build** — force-stop, relaunch, wait, then shoot.
- **`adb shell input tap` works, but `uiautomator dump` is racy**: the dump often describes the
  previous screen. Verify a tap landed by comparing screencap hashes, not by trusting a dump.
- **The devtools socket is absent on a release install here** — drive the UI by taps found in a
  uiautomator dump (nav tabs are exact rects), not by CDP.
- **Overlays are z-index 95, the fullscreen layer is 100** — an overlay opened from inside focus
  has to be lifted (`html.rs-fs .rs-ov{z-index:110}`), and closing it must not pop the history
  entry the view is standing on (`markBack` is skipped while `FS.on`).
- **A dark plate in both themes** means the hero's inherited ink must be forced light; the page's
  own `.pill` and `.rs-sw span` inside the hero carry their own colours, so the parent's colour is
  not enough — target them.
- **Contrast probes cannot see a background image**: give any art-backed element an explicit dark
  `background-color` or the probe (and the first paint) fails. Anything sitting on the strip (the nav
  labels especially) needs its ink forced light too.
- **A pointerdown handler that reveals the chrome fires before the click that toggles it** — capture
  the "was hidden" state on pointerdown (`FSWAS`) or every tap hides again instead of revealing.

## FIRST THREE MOVES

1. `git log --oneline -3` and `git status` — confirm the tree is clean.
2. `py -3.11 tools/shim_harness.py` (expect 89/89) and `py -3.11 cache/contrast.py` (expect 0).
3. Rebuild + install on `ZY22LGC75T` with the release key, then take his eye notes.
