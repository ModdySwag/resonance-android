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
- **GATES: `py -3.11 tools/shim_harness.py` 89/89, `py -3.11 cache/contrast.py` 0.**

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

## OPEN — in the order to take them

1. **Owner eye** on the map first, then the rest of the earlier list (chamber row, module rails,
   Studio fold, five themes) — cut what does not earn its place.
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
  look good" answers are useless.

## FIRST THREE MOVES

1. `git log --oneline -3` and `git status` — confirm the tree is clean.
2. `py -3.11 tools/shim_harness.py` (expect 89/89) and `py -3.11 cache/contrast.py` (expect 0).
3. Rebuild + install on `ZY22LGC75T` with the release key, then take his eye notes.
