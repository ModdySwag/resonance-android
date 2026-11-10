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
