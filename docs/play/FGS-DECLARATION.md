# Foreground service declaration — Resonance Studio

App: **Resonance Studio** · package `com.moddys.resonance` · version 2.0.5-beta (versionCode 12)
Console path: **App content → Foreground service permissions**
Declared type: **`mediaPlayback`**
Prepared: 8 November 2026

## What is being declared

| Item | Value |
| --- | --- |
| Foreground service type | `mediaPlayback` |
| Manifest declaration | `android:foregroundServiceType="mediaPlayback"` on `.PlaybackService` |
| Permissions | `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` |
| Service class | `com.moddys.resonance.PlaybackService`, `android:exported="false"` |
| Started by | The user pressing play or resume in the app; the page reports the state and `MainActivity` starts the service |
| Notification | `Playback` channel, low importance, pause and stop actions, lock-screen controls via `MediaSession` |
| Keeps running when | The user leaves the app, locks the screen, or switches to another app |
| Stops when | The user presses stop, the session ends, the notification is dismissed with the task, or Android stops the app |

Play's media-playback use case is explicit: the video must show **a user starting audio or video playback**, and automatic soundtracks do not qualify. This app is exactly that case, and it has no automatic playback path.

## Copy-paste answers

The Console asks for a description, the impact if the task is deferred, the impact if it is interrupted, a video link, and a use case. The text below fits each field.

### 1. Description of the app functionality using this foreground service type

> Resonance Studio plays the audio session the user started. The sound is synthesised inside the app's WebView with Web Audio; PlaybackService keeps the process alive, holds a partial wake lock, owns the media session and shows the playback notification with pause and stop. Playback continues when the user leaves the app or locks the screen.

### 2. User impact if the task is deferred by the system (does not start immediately)

> The session does not start. The user sees the play control but hears nothing, and has to press play again. No data is lost because the session has not begun.

### 3. User impact if the task is interrupted by the system (paused or restarted)

> The audio stops mid-session. A timed session ends early, and the user has to reopen the app and start it again; the elapsed part of that session is not resumed. No user data is lost, because preferences and saved files are written by the app, not by the service.

### 4. Use case selection

> **Media Playback** — continue audio playback from the background.

If the Console offers a free-text use case instead of the list, use the same sentence. Do not choose **Media processing**, **Data sync**, **Connected device**, **Microphone** or **Phone call**; none of them describes this service.

### 5. Video link

> `[OWNER: paste the unlisted YouTube or link-shared Google Drive URL here before submitting]`

The link must open without a request for access and must stay live for as long as the declaration is active. Do not delete the video after approval.

## Shot list for the 30–60 second recording

Record on a **physical Android device**, with the Play build installed, in one continuous take. Portrait is fine. 1080p or higher. The whole screen, no crops that hide the notification.

| Time | Action | What the reviewer must see |
| --- | --- | --- |
| 0:00–0:05 | From the home screen, tap the Resonance Studio icon. | The app is opened by the user, not already running with sound. |
| 0:05–0:12 | Tap a built-in session (for example **Sleep**), then press **Play**. | The tap and the play press are visible. The elapsed timer starts. This is the user-initiated start Play requires. |
| 0:12–0:20 | Pull down the notification shade. | The playback notification is present, with the session name and a pause and stop action. |
| 0:20–0:28 | Press **Home**. Wait a few seconds. Pull the shade down again. | The app is in the background, the notification is still there, and the timer has advanced. |
| 0:28–0:36 | Lock the phone. Wait about five seconds. Unlock it. | The session is still running after the screen was off; the notification and timer are still there. |
| 0:36–0:44 | Open another app (Clock or Settings) for a few seconds, then return via the notification. | Playback survives another app being in front; the notification is the way back. |
| 0:44–0:52 | Press **Pause** in the notification. Then press **Play** again. | Pause stops the sound and shows the paused state; play resumes it. This proves the controls are real. |
| 0:52–0:58 | Open the app from Recents. Press **Stop**. | The session is still the one that was playing; stop tears the notification down. |
| 0:58–1:00 | Hold on the app's now-empty playback state, or open **About**. | A clean end. Do not add a title card or an edit. |

If you need a shorter cut, drop 0:36–0:44 and 0:58–1:00. Keep the open → play → notification → background → lock screen → pause/play → stop arc; those are the parts that prove the declaration.

## Recording rules

- **One take, no cuts, no speed changes.** A montage reads as a demo, not a recording of the app.
- **Show the initiation.** The first play must be a visible tap in the app. Do not start the video with audio already playing; Play's guidance says automatic playback does not qualify.
- **Show the background.** At least one segment must have the app off-screen (home, lock screen or another app) while the notification and timer show playback continuing.
- **Show the controls.** Pause, resume and stop must be visible and must change the state.
- **Keep the notification legible.** Do not record with a full shade of other notifications. Clear the shade first; use a clean device if you have one.
- **Audio is optional but useful.** If the recorder captures internal audio, leave it in. If it only captures the microphone, the moving timer and the notification are the evidence; do not add music or narration that could be mistaken for the app's sound.
- **Do not show personal data.** No email addresses, phone numbers, other apps' notifications or account names.
- **Length: 30–60 seconds.** Under 30 s does not show enough; over 60 s makes review slower and may be trimmed.

## Common rejection reasons to avoid

- The video opens with sound already playing (looks automatic).
- The video never leaves the app, so background playback is not demonstrated.
- The notification is missing, hidden behind a sheet, or too small to read.
- The video is a sequence of clips with cuts.
- The declared use case is not **Media Playback**, or the manifest type does not match it.
- The service is described as doing something else (downloads, sync, processing) that the app does not do.
- The video link is private, expired or deleted after approval.
- The recording is on an emulator. Use a physical device.

## After approval

- Keep the video link live and unchanged while the declaration is active.
- If the service's behaviour changes — a new start path, a new type, a different notification — update the declaration and record a new video before shipping that build.
- If the app ever adds automatic playback, the declaration stops being true. Do not add it. Playback in this app is always a user action.
- The FGS type must stay `mediaPlayback` in the merged Play manifest. If a library or a future feature adds another type, declare it separately; do not hide it under this one.
