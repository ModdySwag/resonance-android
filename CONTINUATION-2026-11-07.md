# RESUME HERE — Resonance Studio Android, 2.0.5-beta, 2026-11-07 (session 2)

Read this whole block before touching anything. The tree is clean; nothing is pushed anywhere.

## STATE

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
- **GATES: `py -3.11 tools/shim_harness.py` 112/112, `py -3.11 cache/contrast.py` 0.**

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

## OPEN — in the order to take them

1. **Owner eye** on the map, the vintage face (Full) against Minimal, the folded hearing row, the
   chamber-led Visualise and Focus view — cut what does not earn its place.
2. **Play submission:** deploy `store/privacy.html` to `moddys.net/resonance/privacy/` first
   (Moddy must review a deploy), then icon/feature/screenshots/listing/data-safety.
3. **Push** the branch and cut the tag only after his review of the release copy; bump
   `versionCode`/`versionName` in the same pass.

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
