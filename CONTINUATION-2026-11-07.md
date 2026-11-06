# RESUME HERE — Resonance Studio Android, 2.0.5-beta, 2026-11-07 (session 2)

## SESSION 3 (later the same day) — read this first

### STATE

- `C:/Users/Moddy/resonance-android`, branch `main`, HEAD `ace1348`, **tree clean**, 42 commits
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

### LATER THE SAME DAY — interaction pass (HEAD ace1348, 183/183)

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

1. **His eye** on the tour (all nine stops), the Surprise pill beside LIVE, and the three trimmed
   copy blocks.
2. **The update feed is stale and blocks the update path.** `https://moddys.net/updates.json`'s
   `resonance-android` entry is still `1.1.4-beta` / `versionCode 6`, so the app (12) can only ever
   answer "you are on the newest build". The download → sha256 → installer path is therefore
   **untested end to end**. Publishing 2.0.5 with a bumped versionCode and fresh feed entry is a
   deploy he must review (queue items 4/5).
3. **Tour Back on the phone by his thumb** — I verified the sheet's Back on the device and the
   tour's popstate in the harness; clearing app data is the only way I can re-trigger the first
   run without him, so I left his data alone.
4. Then the older queue: systemic type/radius pass, re-cut `tile-drift`/`tile-focus`, Play
   submission (privacy page first), versionCode bump + push + tag.

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
