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
