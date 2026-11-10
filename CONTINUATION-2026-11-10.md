# SAVE POINT — 2026-11-10 (session 16: the Play submission build). READ THIS FIRST.

Supersedes the session-15 block below; same project, same gates, same signing material.

## State
- **Version 2.1.0 / versionCode 15** (no beta suffix). Both channels built from one tree.
- **Play AAB** `app/build/outputs/bundle/playRelease/app-play-release.aab` — 1,009,326 B,
  sha256 `bd882a00b62a0a3e8217cfc8e6ebd0607f50e1a3a55d5b8c0bba54835383197d`.
  Manifest on the artifact: **no INTERNET, no ACCESS_NETWORK_STATE, no REQUEST_INSTALL_PACKAGES**,
  no installer `<queries>`, `mediaPlayback` service, `allowBackup=false` + dataExtractionRules,
  baseline profile in `BUNDLE-METADATA/…/baseline.prof`.
- **Sideload APK** `app/build/outputs/apk/release/app-release.apk` — 992,101 B,
  sha256 `826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2`,
  signed with `resonance-release.p12` (cert 08:B8:…:B6). Keeps INTERNET + the updater, deliberately.
- Installed on the **phone** (`192.168.1.95:46017`) and the **Tab A9+**
  (`adb-R92XB0RWN3B-67B1Tm`); both read back `versionCode=15`. The app had been absent from both
  devices at session start (previous installs gone), so this is a fresh install, not an update.
- **Cold start, phone:** median **269.5 ms** over six force-stopped launches (267–277),
  `am start -W` TotalTime.
- **FGS proof on glass:** `isForeground=true`, `types=0x00000002` (mediaPlayback), notification
  channel `playback`, state PLAYING, and ActivityManager logged
  `Background started FGS: Allowed … uidState: TOP`.
- **Gates green on these bytes**: harness **265/0** (final run, `cache/harness-final.log`),
  contrast **TOTAL LOW-CONTRAST 0**, tablet pass **82/0**, eslint **0**.

## Shipped this session
- **Play channel UI**: `channel()` bridge method; on `play` the Settings update row, the More-sheet
  row and the About update button are not built, and the Data card reads "None — updates come
  from Play". The site/harness (no bridge) stays "sideload".
- **In-context notification rationale**: cold `requestPermissions` removed from `onCreate`;
  `maybeExplainNotifications()` fires on the first playback with a one-per-install dialog, then the
  system prompt. "Not now" is remembered.
- **First-run safety notice** (`#rsNotice`): four safety lines, not-a-medical-device, GPL as-is,
  statutory rights unaffected; one tap "I understand"; X hidden so Back cannot accept it; re-open
  from Settings → Safety notice; action pinned to the foot of the scroller (320×568 proof).
- **Tour bubble placement** clamped to the safe band above the nav; caret dropped when neither side
  fits. Measured at 320×568, 390×844, 433×962, 844×390 — all nine steps clear the nav.
- **Baseline profile** `app/src/main/baseline-prof.txt` (methods verified against the Java source;
  class rules carry no flags, method rules must carry HSP) — packaged as
  `assets/dexopt/baseline.prof`.
- **Docs**: `AUDIT-2026-11-10-PLAY.md` gained a full remediation table (12 findings) plus the
  notice/bubble sections; `docs/play/PRIVACY.md` + `privacy.html` are 2.1.0/code 15 with
  `admin@moddys.net` and a truthful "nothing to buy" purchases section; `LISTING.md` and the store
  copies say free, no in-app purchases (the old A$7.99 unlock described code that does not exist);
  `CHECKLIST.md` and `DATA-SAFETY.md` refreshed.

## Counts are read, never typed (fixed after he spotted it)
The tour still said "Eight sessions" three waves after Home grew to fourteen. Every count is now
taken from the data: `STATES.length` for the Home tiles (app-bar sub "14 sessions", tour step 4 title,
the guide's Home line) and `libCount()` — `GnauralPacks.LIBRARY.length`, measured **130** — for
Sessions ("130 in the library") and the page search placeholder. A tile or pack added later moves the
numbers automatically; the hardcoded copy must not come back.

## Open, in order
1. **VirusTotal is the one blocked item.** No API key on the host; the public upload page was
   driven twice with Playwright and never started a scan. Needs `VT_API_KEY`, then scan
   `app-release.apk` (992,101 B) and record engines/detections/sha/report URL **outside** the APK
   (embedding the result changes the hash). The About screen already says releases are scanned and
   the report is linked from the download page.
2. **Privacy page is staged, not uploaded**: `webmusic-hub/site/resonance/privacy/index.html` and
   `radio-browser/deploy/resonance/privacy/index.html`, byte-identical (12,823 B, no scripts).
   Upload with `upload-site.py --only resonance/privacy/index.html` then `--verify`, on his word.
3. **Play Console work** (owner): create the app, Play App Signing with the existing upload key,
   paste the listing, data-safety answers (No collection / No IAP), content rating, FGS declaration.
4. **Sideload publish path** (owner's word): copy the APK to `deploy/downloads/`, regenerate
   `updates.json` (`make-updates-json.py --resonance-only`), update the card's sha/size, upload.
5. Re-install the final APK on both devices after any further change (the tablet currently has a
   build one compile older than the phone's).

## Traps added this session
- **A ZipFile left open in the execute_code kernel locks the built AAB**: Gradle then fails at
  `signPlayReleaseBundle` with "being used by another process", and the file cannot even be
  renamed. Close every `zipfile.ZipFile` before rebuilding.
- **`.rs-cta` pins `background:linear-gradient(...) !important`** — any coloured variant of it needs
  `!important` on background/border too, or you get dark text on the dark gradient (the notice's
  "I understand" was invisible until this was fixed).
- **A class rule in baseline-prof.txt must not carry flags** ("Class rules don't support flags"),
  while **method rules must** ("At least one of flags 'H','S','P'"), and the profile compiler
  rejects the build until both are right — it is a real gate, not a packaging formality.
- **Tour placement must use the safe band, not `innerHeight`**: a bubble can be inside the raw
  viewport and still sit under the tab bar once `--rs-safe-b` and the nav are real.
- The harness suite that reads `compat.json` starts before a version bump: a run launched across a
  bump reports `X vs Y` on that one leg even though nothing is wrong. Bump `compat.json` with
  `app/build.gradle` in the same edit.

# SAVE POINT — 2026-11-10 (session 15: the visualiser actually runs now). READ THIS FIRST.

Supersedes the session-14 block below. Same project, same gates, same signing material.

## State
- **HEAD `c02fe27`**, tree clean, **nothing pushed, nothing published**. Eleven commits this session:
  `5343e13` calm-scene motion · `32eaf69` play key is the only switch · `e4a9611` card header ·
  `22e004b` Studio wording · `d2c72b5` six Home tiles + art · `a940d2b` search/packs ·
  `974ffd1` brass shuffle + banner · `abccdc7` card icon · `8bb53ef` scene preview + still at rest ·
  `2a720f0` harness legs rewritten to the new card contract (265/0) · `c02fe27` the Play audit.
- **PLAY AUDIT = `AUDIT-2026-11-10-PLAY.md`** (measured from the APK). Five blocking items: AAB not
  APK, `REQUEST_INSTALL_PACKAGES` must go, privacy policy + data-safety form, `allowBackup` pinned
  false, POST_NOTIFICATIONS in-context rationale. Then: baseline profile, crash/ANR signal, image
  re-export (~150-200 KB), FGS start-path audit. Clean facts: targetSdk 36, 966 KB total
  (dex 2.3 %), no PII in any bundled asset, v2 signature verified.
- Release **2.0.6-beta / versionCode 14** built and installed on the **phone over wireless adb**
  (`192.168.1.95:46017`, paired this session with code at `:33049`) and on the **Tab A9+**
  (`adb-R92XB0RWN3B-67B1Tm`). Site tree is the source of truth: `C:/Users/Moddy/webmusic-hub/site/resonance`.
- `tools/sync-assets.py --check` → **69/69 in sync** (63 + 6 fast-tone plates).

## The root cause found this session (do not re-litigate)
**The phone had Animator/Transition/Window animation scales at 0.0.** In that state the WebView
draws the page but never presents canvas frames: frame counter climbs at 60 fps, canvas bitmap
changes 34 %/1.5 s, and the glass shows 0.03 %/s. A/B on the device: scales 0.0 → 0.03 %/s;
scales 1.0 → mini viewer 5.7/2.0/1.7/4.0/3.9 %/s, focus view 10/18.6/7.6/24/30 %/s.
`adb shell settings put global animator_duration_scale 1.0` (and the other two) fixes it.
A CDP devtools attachment also defeats the throttle — that asymmetry is the tell.

## Shipped (all measured or seen on glass)
- **Motion**: shared camera breath in `drawPlate` (±3 % scale over 45 s from the scene clock),
  Spiral 0.02→0.085 rad/s, Deep Field star drift ×37, Ember node drift ×3.2 + sparks ×2.5 +
  plate 0.50→0.64, Ink plumes 0.014→0.024 + boundary 0.30→0.42 + threads 0.10→0.17.
- **One control**: the card's Turn on/off button is gone and hidden by CSS; the app's play key
  drives the visualiser (`vizFollowsPlayback`), pause/stop paints one frame and holds it.
- **Preview**: Shuffle, ◀ ▶ and any pick from the scene list start a silent preview
  (`VIZ_PREVIEW`); tapping the picture itself ends it; play always overrides.
- **Card**: header is `icon · MINI VIEWER · Shuffle` (generated brass key, nudged −3 px);
  background uses `ui/cta-viz.webp` with the same 96 px banner + gradient as the chamber and
  focus cards; no "Scene" label, no "Same scenes as the focus view".
- **Home**: six new tiles (Settle the room, Reset break, One tone 396, Forty a second,
  Settling in, Six breaths) in the Deep sleep/Drift off format, each pinned to an exact library
  name with its own generated plate in `app/ui/fast/`; art tiles reserve their session before
  the broad state matches run; Morning now names "Bright steady (working a question)".
- **Copy**: Studio lost the headphones line and both "folded away" notes; Sessions search reads
  `Search 100+ session - try sleep !`; Settings gained a **Session packs** card under the update chip.

## Gates (re-run on the final bytes before any publish)
`py -3.11 tools/shim_harness.py` (last green 264/0, before the last three UI edits) ·
`py -3.11 cache/contrast.py` (0) · `py -3.11 tools/tablet_pass.py` (82/0) ·
`npx eslint@9 --config eslint.config.mjs app/src/main/assets/www` (0) · lintRelease / testUnitTests.

## Open, in order
1. ~~Preview confirmed by finger~~ **DONE**: with sound stopped, Shuffle produced 0.52 % of screen
   change per 1.5 s (rest is 0.02 %), and tapping the picture stopped it (0.02 %).
2. **Rest frame is a picture but dim** (card mean luminance 13/255): the scene is there as a dark
   field with its points of light. Lifting its exposure is a LOOK decision — his eye.
3. ~~Gates on the final bytes~~ **DONE 2026-11-10: harness 265/0, contrast 0, tablet 82/0, eslint 0**
   (four legs rewritten to the new contract: rest holds a frame, a pick previews, no toggle key,
   banner plate, shuffle key is an image, tiles must all resolve, window label waits 1.4 s).
   Then the publish path he already approved in principle:
   bump to **2.0.7-beta / code 15**, rebuild, `make-updates-json.py --resonance-only`, upload
   **only on his word**.
4. Wireless adb pairing dies when he toggles Wireless debugging or reboots — re-pair with a fresh code.

## Traps added this session
- Board rules beat a bare class on adopted page cards — set tile geometry inline.
- A page `button:hover{background:…}` shorthand wipes a generated face; give `:hover/:active/:focus`.
- `data-art` banners are `.rs-cta::before` at 96 px; match that pattern, don't full-bleed the card.
- `GnauralPacks.LIBRARY` carries `{pack, packName, name, blurb, voices}`; `state.presetList` indexes it.
- Wireless adb: `adb pair <ip>:<pair-port> <code>` then `adb connect <ip>:<connect-port>`; mDNS
  lists both ports (`adb mdns services`).
