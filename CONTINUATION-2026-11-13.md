# 2026-11-13 — follow-up review #2 closed, and the install-grant dead end fixed

## State

- **HEAD** = the commit this file arrives in (branch `main`, tree clean after it), version
  still **2.1.4-beta / code 19**. No new release was cut; the next beta carries these bytes.
- **Gates on these bytes**: shim harness **274/0**, eslint **0**, `lintRelease` +
  `testUnitTests` **BUILD SUCCESSFUL**, `device_gate` **19/0** (Moto Edge 60 Fusion,
  Android 16 / API 36), `playback_lifecycle` **33/0**, manifest **69 files, 0 bad, 19 pack
  zips**, `validate_android_project` all pass.
- On glass, on the phone `adb-ZY22LGC75T-d131nd._adb-tls-connect._tcp` (the tablet was on its
  lock screen and went flat; it is not needed for these legs).

## What was fixed (GitHub issue #2, "Follow-up review at 21a5362")

1. **CSP + strict interceptor** — `MainActivity.CSP` is delivered as a
   `Content-Security-Policy` **response header** on every intercepted asset (not a `<meta>` in
   index.html, which is shared with the website), and `shouldInterceptRequest` answers **403**
   for any http(s) request that is not `appassets.androidplatform.net`. Proved on the phone
   over CDP: a `fetch('https://moddys.net/robots.txt')` is refused and the page records
   `connect-src https://moddys.net/robots.txt` as the violated directive; the page still
   boots, finds 130 presets, and plays in **worklet** mode (`sample` advanced 141,312 ≈ 3.2 s).
   **Trap paid:** `script-src` needs `blob:` — the engine concatenates `engine.js` +
   `worklet-processor.js` into a Blob and calls `audioWorklet.addModule(blobURL)`; with only
   `worker-src 'self' blob:` Chrome refuses it and the app silently falls back to
   ScriptProcessor (`state.mode == "spn"`).
2. **Paused-service watchdog** — `PlaybackService` pings the page with
   `evaluateJavascript("1")` every 30 s (2 misses ⇒ teardown). A paused page sends no state,
   so intent traffic cannot prove liveness; a wedged renderer answers nothing, and that
   silence is the signal. Proved both ways on glass: paused session survived **80 s** with
   `isForeground=true`; a `setTimeout(function(){while(true){}},100)` wedge produced
   `watchdog: the page has not answered 2 checks - stopping`, service records **0**,
   notification **0**. The reviewer's "`web.onPause()` is never called" premise is wrong —
   there is no `onPause` hook in the page and `window.__rs.pause()` is the contract the
   service already uses.
3. **CI** — `platforms;android-36` + `build-tools;36.0.0` (compileSdk is 36), `./gradlew`
   instead of bare `gradle`, `gradlew` committed mode **100755** (was 100644), and the release
   job now runs `lintRelease` + `testUnitTests` + the shell harness before it assembles or
   publishes.
4. **Idle loop** — `app.js` paints at 15 fps only while `state.playing`; otherwise a 1 Hz
   timer repaints the clock/graph. Harness 274/0 and the clock advances while playing
   (`0:03` after 3 s on glass).
5. **Smaller** — `Compat.maybeWarn` records "shown" on **dismiss**, not on show; README's
   "71 checks" → 274. **`night0 = true` is not a bug**: the shell is dark-only by owner
   decision (`applyTheme()` rewrites any stored light preference), and the comment in the
   code says so.

## Also fixed — the install-grant dead end (owner report, same pass)

Symptom: tap Update → Android asks to allow installs → allow → return → the strip sits on
"Downloading…" for ever; the only way on is to install the APK from Downloads by hand.

Two real defects:
- **The flow forgot the request.** `Updates.install()` opened the settings screen and
  returned; nothing resumed afterwards. Now permission is asked **before** the download
  (`downloadAndInstall` → pending url/version/sha), `MainActivity.onResume()` →
  `Updates.onResumed()` starts the download (or sends the already-downloaded APK to the
  installer) the moment the grant lands, and the strip's button becomes **"Allow installs"**
  → **"Downloading…"** → **"Installing…"** → back to **"Update now"** if cancelled.
- **The completion broadcast was never delivered.** `ACTION_DOWNLOAD_COMPLETE` is sent by
  `com.android.providers.downloads` (its own uid), so a `RECEIVER_NOT_EXPORTED` receiver
  never sees it on Android 13+. Measured on the phone: the APK landed (994,333 B in
  `Android/data/…/files/`) and nothing installed. Fixed by registering **EXPORTED** (a forged
  completion must still name the id and the APK is re-hashed) **and** polling
  `DownloadManager.query` every 2 s as the path no delivery rule can drop; one
  `activeDownloadId` guards both so the install runs once.

Proved on glass end to end: permission `default` → click → strip "Allow installs" + Settings
app-specific page → `appops set … allow` + return → strip "Downloading…" → installer
(`com.google.android.packageinstaller/.PackageInstallerActivity`) with the strip on
"Installing…" → Back → strip back to "Update now", release app still 2.1.4-beta / code 19.

## Traps learned this pass

- **Android 16 `dumpsys media.audio_flinger` moved the client column.** Track rows are
  `F2 125 yes 3949/ 10575 …` under "N Tracks of which M are active"; the old gate regex
  expected a row that *starts* with `pid/uid`, so every track leg failed and looked like a
  regression. Event-log lines (`AT::add`) also carry `pid/ uid` but start with a timestamp —
  matching those would count removed tracks.
- **`dumpsys activity recents` keeps `mHiddenTasks=[Task{…#41 … A=<uid>}]` for the life of the
  process.** A whole-dump search for `A=<uid>` can never go quiet after a task removal; only
  the `* Recent #N:` lines are the live list.
- **A `RECEIVER_NOT_EXPORTED` receiver does not see DownloadManager's completion.** Register
  EXPORTED (or poll) and validate by id + sha256 rather than by trust.
- **`WebView.onPause()` is not the missing piece for a paused media service**; the page is a
  live audio engine and pausing its timers is a different (unmeasured) risk.
- **Worklet CSP is `script-src`, not `worker-src`** (see 1).

## Open

- Release 2.1.5-beta is **not cut**. It needs: version bump, signed APK/AAB, VirusTotal,
  site + feed + downloads card, and the phone/tablet install pass — on the owner's word.
- Tablet (`SM-X210`) was on its lock screen and then flat; not used this session.
- Existing stale artifact: a paused `com.moddys.resonance` notification (id 4230) was visible
  on the phone during testing; it is the installed 2.1.4 release, not this debug build.
