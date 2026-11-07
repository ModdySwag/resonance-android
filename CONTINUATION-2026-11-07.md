# RESUME HERE — Resonance Studio Android, 2.0.5-beta, 2026-11-08 (latest: session 9 FINAL)

## SESSION 9 FINAL — the chamber faceplate, scene chips fixed, versionCode 13

Read this block first; everything below it is history.

### STATE

- HEAD `c239866`, tree clean, **nothing pushed**. `2.0.5-beta`, **`versionCode 13`**, targetSdk 36.
- **Signed release APK: 714,923 B, sha256 `5f6a72066537aa4013b429a92ab249b98d5ed0ad19a8c7734e9ccf2968ef8f99`**,
  installed on the phone (`192.168.1.95:33139`) over the 683,566 B / code-12 build: cold start
  **454 ms**, `page: shim ready` in logcat, crash buffer empty.
- Debug build (`com.moddys.resonance.debug`) on the phone — device_gate and CDP need it.
- **Publish payload staged locally in `radio-browser`, NOT uploaded** (house rule: his review
  first): `deploy/downloads/resonance-studio-v2.0.5-beta.apk` (same bytes as the release APK),
  `deploy/updates.json` regenerated (`resonance-android` = 2.0.5-beta / code 13 / 714923 /
  `5f6a7206…`), `deploy/moddys-downloads.html` card updated (pill, href, filename, 0.7 MB, sha256,
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

### QUEUE, in order

1. **His eye on the chamber** (faceplate, drawer, lip, auto-hide, chips) — then the publish above.
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
