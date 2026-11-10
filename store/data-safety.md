# Data safety answers — Resonance Studio 2.1.0

Play's form is a claim about the code, so each answer carries the evidence that makes it
true. Re-check every line before a submission; if a line stops being true, the answer is
wrong, not the code.

| question | answer | evidence |
|---|---|---|
| Does the app collect or share any required user data types? | **No** | nothing is sent off-device except the update check, which carries no identifier; no analytics SDK, no crash reporter |
| Is data encrypted in transit? | **Yes** (for the little that moves) | the update check and help pages are HTTPS to moddys.net |
| Can users request data deletion? | **Yes, by uninstall** | all state is `localStorage` + files the user chose to save |
| Third-party SDKs | **none** | `app/build.gradle` has no `dependencies` block at all |
| Adverts | **no** | nothing in the shell draws one |
| In-app purchases | **no** | — |
| Account required | **no** | — |
| Approximate location / device ID / contacts / files | **not collected** | permissions list in `AndroidManifest.xml`: INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK, FOREGROUND_SERVICE(_MEDIA_PLAYBACK), POST_NOTIFICATIONS, REQUEST_INSTALL_PACKAGES, WRITE_EXTERNAL_STORAGE (≤ API 28 only) |

## Permissions, justified one by one

- `INTERNET` — the update check and handing help/credits pages to the browser.
- `ACCESS_NETWORK_STATE` — do not offer an update download on a dead link.
- `WAKE_LOCK` — the CPU must stay up while a session plays with the screen off.
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — the session is a media
  foreground service, with pause/stop on the lock screen.
- `POST_NOTIFICATIONS` (API 33+) — asked at runtime, only for that notification.
- `REQUEST_INSTALL_PACKAGES` — sideloaded builds update themselves; the user still confirms.
- `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion 28` — only old devices need it to write
  `Downloads/Resonance Studio`; Android 10+ uses MediaStore.

## Privacy policy URL

`https://moddys.net/resonance/privacy/` — source at `store/privacy.html`, deployed with the
resonance site. The listing cannot be submitted without it.

## What the policy must keep saying

- no account, no analytics, no ads, no upload
- what is stored locally and where (preferences, favourites, imported packs, saved files)
- that help/credits open in the browser and are therefore a normal web visit
- that the update check fetches a JSON file with no identifier attached
- how to delete everything (uninstall, plus deleting the saved files)
