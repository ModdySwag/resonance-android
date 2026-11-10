# AUDIT — 2026-11-10 (session 15). Measured baseline against Play Store standards.

Artifact: `app/build/outputs/apk/release/app-release.apk`, 966,144 B, `2.0.6-beta` (code 14),
HEAD `7bb8ff9`. Every number below is from `aapt2 dump`, `apksigner verify`, a `zipfile` pass over
the APK and a byte scan of the bundled assets — not from memory or the build log.

## What is already right (measured)
- **Package** `com.moddys.resonance`, **targetSdk 36**, compileSdk 36, minSdk 26 — current Play floor.
- **Not debuggable**, `usesCleartextTraffic` absent/false, network security config present.
- **Permissions are a short, honest list**: INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK,
  FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, POST_NOTIFICATIONS,
  REQUEST_INSTALL_PACKAGES, WRITE/READ_EXTERNAL_STORAGE (maxSdk 28 only).
- **Signing**: APK Signature Scheme v2 verified, single signer
  `08b8cbbf…15f21b6`; v1/v3/v4 not present.
- **Size**: 966 KB. images 477 KB (50.4 %), packs 244 KB (25.8 %), js 159 KB (16.8 %),
  other assets 37 KB, **dex 21 KB (2.3 %)**, res 3 KB. R8 + shrinkResources + terser all working.
- **No personal data in the shipped page**: zero hits for `Moddy`, `C:/Users`, `C:\\Users`,
  `@gmail`, `192.168.`, `resonance-android` across every `.js/.json/.html/.css/.xml/.txt/.md`
  asset. The only brand reference is `moddys.net` in 5 files (NOTICE, index, shim, compat) — a
  public URL, not PII.
- Components: `MainActivity` + `PlaybackService` (foreground service with a media-playback type).

## Blocking issues for a Play release (ranked)
1. **AAB, not APK.** Play rejects an APK upload for a new app; `bundleRelease` must be produced and
   the upload key registered for Play App Signing. v3 signing is absent — accepted today, but the
   AAB path re-signs anyway, so do the key migration once, deliberately.
2. **`REQUEST_INSTALL_PACKAGES`.** Play requires a declaration and rejects self-updaters that are
   not file managers or stores. Remove it and drop the in-app APK self-update path; ship updates
   through Play (and the website APK as a side channel, which does not need the permission).
3. **Privacy policy + Data safety form.** Even with no collection, the listing needs a policy URL
   that covers the update check, the bundled web page and the notification. Declare: no data
   collected, no ads, no analytics — and make the in-app About screen link the same policy.
4. **`allowBackup` needs to be explicitly false** in the manifest (the audit shows the attribute
   present; the value has to be read and pinned, or a restore can carry the WebView store).
5. **Notification permission rationale.** POST_NOTIFICATIONS is requested for the playback
   notification; Play review looks for an in-context prompt, not a cold ask at first launch.

## Quality/efficiency findings (non-blocking, worth doing)
6. **No baseline profile.** WebView start-up is the app; a `baseline-prof.txt` for the Java side
   plus a measured cold-start number would put the Play vitals in the green rather than unknown.
7. **No crash/ANR reporting.** Play Vitals will be blind. A minimal crash handler or Play-internal
   reporting is enough; do not add an SDK that needs a data-safety disclosure.
8. **FGS type is declared but the start path should be audited** for the API 34+ rule (start the
   service from a visible activity, stop it when playback ends) — a violation is a hard Play block.
9. **Images are 50 % of the APK** and several are oversampled for their box (the five 512×512
   accent knobs used at 56–64 px were measured earlier at ~128 KB for ~30 KB of need). Re-export
   at 2× the CSS box and the whole app loses ~150–200 KB.
10. **`WRITE_EXTERNAL_STORAGE` maxSdk 28** is only needed for the Downloads save path on API 26–28;
    keep only if that path still writes there, otherwise drop both storage permissions.
11. **No `.so` files** — so the 16 KB page-size requirement is trivially satisfied; state it in the
    release checklist so a future native dependency does not slip in unexamined.

## What this session did NOT do
- No remediation was applied: the artifact audited here is the one on the phone (`2a720f0` build).
- No Play Console work (listing, assets, data safety, policy URL) — that is account-side, needs the
  owner's Google account.
- No debloat pass on the images, no baseline profile, no AAB.

## Next session, in order
1. `bundleRelease` + a real AAB size/contents check (same zipfile pass on the `.aab`).
2. Remove REQUEST_INSTALL_PACKAGES and the self-update path; rebuild, re-run the gate (265/0).
3. Pin `allowBackup=false` + `dataExtractionRules`, verify with `aapt2 dump xmltree`.
4. Image re-export pass (2× CSS box) and re-measure the APK by category.
5. Privacy policy page on moddys.net, linked from About and the listing; draft the Data safety answers.
6. Baseline profile + a cold-start measurement; then cut 2.1.0 / code 15 as an AAB for internal
   testing, and only then the production push.


## Remediation — 2.1.0 / versionCode 15 (10 November 2026)

Everything below is measured on the built artifacts, not on the source tree:

- `app/build/outputs/bundle/playRelease/app-play-release.aab` — **1,009,326 B**,
  sha256 `bd882a00b62a0a3e8217cfc8e6ebd0607f50e1a3a55d5b8c0bba54835383197d` (the Play build).
- `app/build/outputs/apk/release/app-release.apk` — **992,101 B**,
  sha256 `826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2` (the sideload build,
  cert `08:B8:CB:BF…:B6`). Both report `versionCode=15`, `versionName=2.1.0`.

| # | Finding | State now | Evidence |
| --- | --- | --- | --- |
| 1 | AAB, not APK | **DONE** | `bundlePlayRelease` produced the signed bundle above; baseline profile rides in `BUNDLE-METADATA/com.android.tools.build.profiles/`. Play App Signing enrolment is the remaining Console step. |
| 2 | `REQUEST_INSTALL_PACKAGES` / self-update | **DONE for the Play build** | The AAB's manifest has **0** occurrences of `REQUEST_INSTALL_PACKAGES`, `INTERNET` and `ACCESS_NETWORK_STATE`. The shell now asks the bridge `channel()` and, on the Play channel, does not build the update row in Settings, the row in the More sheet, or the About update button; the Data card reads "None — updates come from Play". The sideload APK keeps all three, deliberately. |
| 3 | Privacy policy + Data safety | **POLICY READY, PAGE NOT LIVE** | `docs/play/PRIVACY.md` and `privacy.html` updated to 2.1.0/code 15, contact `admin@moddys.net`, and the purchases section now states there is nothing to buy (the old text sold an unlock that has no code). The page is staged at `webmusic-hub/site/resonance/privacy/index.html` and `radio-browser/deploy/resonance/privacy/index.html`, byte-identical, 12,823 B, no scripts. Upload waits for the owner. |
| 4 | `allowBackup` | **DONE** | Packaged manifest: `allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules="@xml/data_extraction_rules"`; the rules exclude root, file, database, sharedpref and external for both cloud backup and device transfer. |
| 5 | Notification rationale | **DONE (guidance, not policy)** | The cold `requestPermissions` in `onCreate` is gone. `maybeExplainNotifications()` runs when the page first reports playback, shows an AlertDialog once per install, then opens the system prompt; "Not now" is remembered as firmly as "Allow". Research correction: no Play policy page requires a pre-prompt rationale for `POST_NOTIFICATIONS`, and stock Android exempts media-session notifications from the Android 13 permission change — so this is Android's in-context guidance plus belt-and-braces for OEM behaviour, not a submission requirement. Kept because the playback notification is the only way back to a background session. |
| 6 | Baseline profile + cold start | **DONE, measured** | `app/src/main/baseline-prof.txt` (methods verified against the four Java classes) is compiled by AGP and packaged as `assets/dexopt/baseline.prof`. Cold start on the phone: **median 269.5 ms**, six force-stopped launches, min 267 / max 277, `am start -W` TotalTime. There is no Macrobenchmark A/B, so the profile is packaged-but-unproven; the number is the artifact's own. |
| 7 | Crash/ANR signal | **NO CODE NEEDED** | Play Console's Android vitals collects crashes and ANRs for Play-distributed builds without any SDK ("Data comes from Android devices whose users have opted in to automatically share their usage and diagnostics data" — support.google.com/googleplay/android-developer/answer/9859174), so a crash reporter would only create a Data safety disclosure for data we do not need. Two caveats: it is a sample because it depends on the user's diagnostics opt-in, and a small internal track can legitimately show an empty vitals page. The sideload channel's logcat remains the debugging surface. |
| 8 | FGS start path (API 34+) | **PROVEN ON GLASS** | Requirements confirmed against developer.android.com: type + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` declared, `startForeground()` inside the first `onStartCommand` (five-second deadline), Play's App-content FGS declaration for Android 14+ targets, and a start from a visible activity — a notification-action `PendingIntent.getService` is a permitted user interaction, but only because the person tapped it. While playing: `isForeground=true foregroundId=4230 types=0x00000002` (mediaPlayback), notification channel `playback`, MediaSession state `PLAYING`. ActivityManager logged `Background started FGS: Allowed … uidState: TOP`, i.e. the service was started from the visible activity, and `startForeground` runs inside the first `onStartCommand` (well under the 5 s deadline). |
| 9 | Image oversampling | **MEASURED, NOT FORCED** | 55 images, 488,092 B on disk. Current art is already 2–3× its CSS box: knobs are 256 px for 56–64 px keys, scene plates 1280 px for full-screen use, tiles 880 px for 331 px cards. The earlier "~150–200 KB" estimate came from five 512 px knobs that no longer exist. A safe downsample buys roughly 30 KB and softens the signature controls, so it was left alone and the number was corrected instead. |
| 10 | Storage permissions | **KEPT, DELIBERATE** | `WRITE_EXTERNAL_STORAGE` maxSdk 28 still backs the Downloads save path on API 26–28; Android 10+ writes through MediaStore. |
| 11 | 16 KB page size | **TRIVIALLY MET** | No `.so` files in either artifact (`mergePlayReleaseNativeLibs NO-SOURCE`). |
| 12 | VirusTotal | **CLEAN — 0 detections** | `resonance-studio-2.1.0.apk`, sha256 `826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2`, 992,101 B, scanned 10 November 2026: **0 malicious, 0 suspicious**; 65 engines returned a clean verdict, 8 do not analyse APKs (`type-unsupported`), 1 timed out (Bkav) and 1 failed (Skyhigh). Report: https://www.virustotal.com/gui/file/826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2 This was the first submission of these bytes, so the verdict is the engines' own, not a reputation carried from an earlier build. The result can only live outside the APK: editing the APK to embed its own hash would change the hash. |

### The first-run notice (added this session)

A safety and licence gate now appears once per install, before the tour: headphones for binaural,
comfortable volume / stop if ringing, ask a clinician first if epilepsy or a seizure disorder, not
while driving, not a medical device, GPL-2.0-or-later as-is without warranty with statutory rights
(the Australian Consumer Law) expressly unaffected. It is answered, not dismissed — the close X is
hidden so Back cannot silently accept it — and it is re-openable from Settings → Safety notice. The
website never shows it (no bridge). Its action is pinned to the foot of the scroller because on a
320×568 screen the text alone is taller than the glass and an unpinned button scrolls out of reach.

### Tour bubble placement (fixed this session)

Measured at 320×568, 390×844, 433×962 and 844×390. The bubbles were inside the raw viewport but two
sat low enough to slide under the tab bar once real insets exist. `tourPlace()` now clamps to the band
between `--rs-safe-t` and the nav bar's top edge, centres inside that band when neither side fits, and
drops the caret rather than pointing it at nothing. All nine steps clear the nav at every size.


## Published — 10 November 2026 (sideload channel + policy page)

- **APK live**: https://moddys.net/downloads/resonance-studio-v2.1.0.apk — 992,101 B, sha256
  `826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2`. Proved by downloading the
  live file and hashing it, not by trusting the upload.
- **Feed live**: `updates.json` → versionName 2.1.0, versionCode 15, size 992101, same sha, url as
  above; regenerated by `make-updates-json.py --resonance-only` (world-radio keys untouched).
- **Downloads card live**: v2.1.0 pill, "New in 2.1.0" copy, 0.9 MB, the same sha, the VirusTotal
  line (0 detections + report link) and the GitHub link pinned to the tag. `upload-site.py --verify`
  → 0 files not in sync; the local page checker's three reds are the known pre-existing ones
  (palette parity, spraybar stripes, two hosted card links).
- **Privacy page live**: https://moddys.net/resonance/privacy/ (the no-slash URL 301s to it) —
  HTTP 200, `admin@moddys.net` present, no `[OWNER` placeholders.
- **GitHub**: `main` pushed (`dcbe47b`), annotated tag `v2.1.0` pushed, release
  https://github.com/ModdySwag/resonance-android/releases/tag/v2.1.0 with
  `resonance-studio-v2.1.0.apk`, 992,101 B, digest `sha256:826c66e6…5013c2` reported by the API —
  the same bytes the site serves and the scan covered.
- **What is deliberately not done here**: the Play Console work (app record, Play App Signing,
  listing, data-safety form, content rating, FGS declaration, internal test) needs the owner's
  Google account. The `play` AAB in this audit is the artifact for it.
