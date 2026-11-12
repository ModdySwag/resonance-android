# 2.1.3-beta — the code-review fixes, shipped 2026-11-11

- **Phone re-paired and proved on the glass (13 Nov).** `adb pair 192.168.1.95:35399 849522`, connect
  `192.168.1.95:43909`; installed code 18, boots (`page: shim ready`). On-device export test:
  Studio → Export WAV at the default **20 min** produced
  `Downloads/Resonance Studio/Focus_40_gamma_-20min.wav`, **211,680,044 bytes** in ~20 s with the app
  alive; header verified on the device (RIFF/WAVE, PCM, 2 ch, 44100 Hz, 16-bit, data 211,680,000 =
  exactly 20:00). That is the streaming path writing straight to disk — the case that used to peak
  ~635 MB and kill the renderer.
Answered the open GitHub issue ("Full code review", 11 items) against the tree, then landed the
blocking + high items. **Published**: site APK
`resonance-studio-v2.1.3-beta.apk` 994,045 B sha256
`05e94a4d8e89b74f4ec280fbf439e9b0ad8d0a2c35531b135872173020f86d4c`; feed 2.1.3-beta / code 18 /
994045; card v2.1.3-beta + sha + VirusTotal 0/64; GitHub tag `v2.1.3-beta` with the same digest.

## What was real (all verified on the tree, not taken on trust)
- **Manifest drift was real and worse than reported**: 3 of 63 entries bad, because `app/app.js`
  and `app/viz.js` had been edited in the app tree only, while `site/resonance` (the declared
  source of truth) still held the 2.1.2 audio fix's predecessors. Regenerating from the app tree
  would have left the website stale; `sync-assets` would have reverted the shipped fix. Fixed by
  backporting both files to the site first, then syncing: **69/69 in sync, manifest 69 files / 0
  bad**, so the CI step that has been red since `06d66b3` passes again.
- **`ctx.close()` unhandled rejection** — real; both call sites now `.catch()`. The author's
  273/1 harness run was a flake: mine is **274/0** on both the old and the new bytes.
- **WAV export OOM** — real. Now **streams** through `fileStart`/`fileChunk`/`fileEnd` in 1-second
  blocks; only a browser (no bridge) falls back to the blob path, capped at 60 min. Proved with a
  bridge-recording probe: `fileStart` once, 44-byte header + 5 min of PCM = **52,920,044 bytes**
  through `fileEnd`, zero page errors.
- **Space key** — real; excludes `BUTTON|A|role=button|role=link|contentEditable` and any open
  dialog/overlay/tour.
- **Receiver leak / save leak / configChanges** — receiver unregisters before the id check;
  `save.abort()` in `onDestroy`; `locale|layoutDirection|colorMode|keyboard|navigation` added.
- Overstated in the report: "the gate is broken" (one flaky sample) and the out-of-band release
  assets (each was digest-verified). Not done yet: CSP + strict interceptor, service watchdog,
  CI workflow modernisation (android-36, wrapper, lint/tests), README's stale "71 checks",
  graph idling, `onPause()` — all documented as the next pass.

- **CI is green again (13 Nov)** — the last red leg was the shell harness, not the build: *"the map's
  backing store follows the device pixel ratio"* compared `canvas.width` to
  `Math.floor(clientWidth * dpr)` at one instant, while `clientWidth` is integer-rounded and the map
  repaints on the tick — a race that happened to pass locally and lose on a slower runner. The leg now
  polls for up to 3 s and allows 1 px, and reports the measured `[width, clientWidth, dpr, height,
  clientHeight]` on failure. Run `9b675f0`: **Shell shim 274/0 in CI**, Debug APK green — the first
  green `Build APK` run since 5 Nov. The release workflow was already green on `v2.1.3-beta`.

## State
- Tablet: installed from the built bytes, `versionCode=18`, 2.1.3-beta. **Phone is unpaired** —
  wireless adb refused (`actively refused`), needs a fresh `adb pair` code before it can be
  installed/tested.
- Gates on these bytes: harness 274/0, contrast 0, tablet 82/0, eslint 0. VirusTotal 0 malicious /
  0 suspicious (64 clean, 8 type-unsupported, 2 timeouts, 1 failure, 75 engines).
- Play AAB rebuilt at 2.1.3-beta for the Console step; not uploaded.

# Resonance Studio Android — 2026-11-11

## SHIPPED — 2.1.2-beta (code 17) is live, published 2026-11-11

Owner report: sound kept playing after Stop; sound survived shutting the app down and clearing
recents, and the phone needed a restart.

**Mechanism (measured, not guessed).** `MainActivity.onDestroy` only cleared the page handle, so
a detached WebView kept its renderer and its `AudioContext`. On the Tab A9+, after the task was
removed the service was gone and `pidof` was still alive while AudioFlinger still held
`<pid>/<uid> <trackid> …` in its track table — the sound was playing with no window and no
notification. A relaunch built a new page whose Stop could only stop *its* engine, which is
"Stop does nothing". Separately, a Stop pressed while `play()` was still booting (two fetches +
`addModule`) was undone by the boot's own `.then()`.

**Fixed.** `onDestroy` → `__rs.hardStop()` + `web.destroy()` (unloads the page, closes the
context); `onTaskRemoved` stops the page first; `live` cleared in `teardown()`/`onTaskRemoved()`
so the page tick cannot re-create the service; `AUDIO_BECOMING_NOISY` pauses on headphones out;
notification Play refuses to claim playing with no page; no paused notification on a cold start
(the bridge only starts the service once something plays). Page: play tickets, `hardStop`,
`pagehide`, and the async boot abandons a graph that was closed under it. `fontScale` added to
`configChanges` so a font-size change no longer restarts the session.

**Bytes.** `app-release.apk` 993,501 B, sha256 `46290c25234d970203d4aec7cd5dc67f3379c3f58dcd80c6fb85fc6eb6373efd`,
signed with the release keystore, installed on the Tab A9+ (versionCode 17).

**Gates on these bytes.** harness 274/0 · `tools/playback_lifecycle.py` 33/0 (new, on glass) ·
tablet 82/0 · contrast 0 · eslint 0 · lintRelease + testUnitTests BUILD SUCCESSFUL ·
apk_identity 41 checks, 7 failed and all seven are the expected `byte-identical to the site's`
legs (release assets are minified).

**Negative proofs.** With `app.js` stashed, the harness's "a stop issued while the audio graph
boots is not undone" fails with `{"p":true,"m":"worklet"}` and `pagehide closes the audio graph`
fails. Before the fix, the task-removal leg on glass left one track row for the uid; after it,
zero.

The scenario matrix (34 rows: play/stop/pause/Home/background/screen/focus/headphone/unplug/
rotation/multi-window/OEM kill/update) is `docs/PLAYBACK-LIFECYCLE-AUDIT.md` — read it before
touching audio again.

**Published (2026-11-11).** Site https://moddys.net/downloads/resonance-studio-v2.1.2-beta.apk
(re-downloaded and hashed to the scanned sha) · feed 17 / 2.1.2-beta / 993501 / `46290c25…` ·
card v2.1.2-beta with the sha, the certutil line, the tag link and the VirusTotal 0/66 line ·
GitHub `main` 23c3468, tag `v2.1.2-beta`, release asset digest = the same sha · tablet
reinstalled **from the downloaded bytes**: versionCode 17, `page: shim ready`, Home, no update
offered, empty crash buffer. `upload-site.py --verify`: 0 file(s) not in sync.

**Still open.** His **phone** was not attached, so 2.1.2 has not run there; and a real headphone
unplug (the receiver is registered but the adb shell cannot deliver a protected broadcast to a
`RECEIVER_NOT_EXPORTED` receiver, so the gate proves wiring, not delivery).

## SHIPPED — 2.1.1 (versionCode 16) is live

`sha256 21b53aee6c12cc3e44093aa20d59cbaa0aba8231f11c78946dd3fdf69c1580ff`, 992,837 B,
signed with `resonance-release.p12`.

| Where | What |
| --- | --- |
| Site | https://moddys.net/downloads/resonance-studio-v2.1.1.apk — re-downloaded, hashes to the scanned sha |
| Feed | `updates.json` resonance-android: code 16, name 2.1.1, size 992837, same sha, url above |
| Card | `moddys-downloads.html` v2.1.1 pill, New-in copy, 0.9 MB, sha, certutil line, tag link, VirusTotal 0/66 line |
| GitHub | `main` at `bede38d`, tag `v2.1.1`, release with `resonance-studio-v2.1.1.apk` (API digest = the same sha) |
| VirusTotal | 0 malicious / 0 suspicious — 66 clean, 8 type-unsupported, 1 timeout, 0 failure of 75 engines, first submission. `docs/play/VIRUSTOTAL-2.1.1.md` |
| Tablet | installed, versionCode=16, versionName=2.1.1, `page: shim ready`, no crash |

The app offers no update on the tablet because the feed's code (16) equals the installed one.

## What 2.1.1 contains

1. **Chamber Setup sheet has a second exit** (`47e7223`). A `pointerdown` in the capture phase on
   `#cymRoot` closes `#rsCymPanel` when the tap is outside the sheet and outside its key; opening
   the page's Controls drawer closes it too. One `setSetup(on)` drives class + `aria-expanded`.
2. **Walkthrough bubbles always land inside the band** (`913dfee`). `tourPlace()` computes the band
   once (status bar, gesture bar, tab bar), `tourFit()` tucks spacing then caps the bubble and
   scrolls the copy, `tourClamp()` clamps the TARGET with the real width/height, `tourSettle()`
   measures the resting rect on `transitionend` +700 ms, `tourWatch()` re-places on
   resize/orientationchange/visualViewport.

## Gates on the shipped bytes

harness 268/0 · tour_fit 146 placements 0 outside the band · tablet 82/0 · eslint 0 ·
contrast 0 · lintRelease + testUnitTests BUILD SUCCESSFUL · apk_identity version legs ok
(only the byte-identity legs red, as expected for a minified release) · APK carries
`__rsSetupOutside` and `rs-t-tight`.

Negative proofs this session: the Setup-dismiss leg fails with the shim stashed
(`FAIL a tap on the picture dismisses the Setup sheet | 228`), and `tools/tour_fit.py`
reports 3 failures on the previous shim including rotation `bottom+278 next-unhittable`.

## Traps paid

- **Correct the target, not the live rect.** A measured nudge taken while the bubble's
  `.34 s` transform was in flight fed its own error back: 375 → 172 → 249 across one rotation.
  `tourClamp()` clamps the target; measurement happens only once the transition has ended.
- **A Playwright probe that measures mid-animation reports phantom overflow** (and one that polls
  for "stable" before the bubble is placed reports it at 0,0). Wait ~700 ms, then require three
  identical samples with `width > 100`.
- **The tablet's notification shade can hold focus** (`mCurrentFocus=NotificationShade` survives
  `cmd statusbar collapse`, BACK and HOME), so `adb shell input tap` never reaches the app. Use CDP
  input for glass proof while that is true, and say which input path proved it.
- **A fresh debug install opens the safety notice, then the welcome tour**, both of which swallow
  taps; clear them before probing anything in the chamber.

## Open

- Play Console owner steps (unchanged from 2.1.0): app record, Play App Signing, listing,
  data safety, content rating, FGS declaration, upload the AAB to internal testing.
- The site still carries `resonance-studio-v2.1.0.apk` (left in place so old links keep working;
  the feed points at 2.1.1).
- Every rebuild = rebuild both channels, gates, reinstall, RE-SCAN (new hash), re-upload APK +
  feed + card, and re-tag.
