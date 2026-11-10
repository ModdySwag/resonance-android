# Play submission checklist — Resonance Studio 2.1.0

Package: `com.moddys.resonance` · versionCode 15 · versionName 2.1.0 · targetSdk 36 · minSdk 26
Prepared: 8 November 2026 · refreshed for 2.1.0 on 10 November 2026

Work top to bottom. The tags tell you who owns each line:

- **[CODE DONE]** already true in this repository; the evidence is named. Re-verify on the artifact you upload, not just in the source.
- **[CODE TODO]** needs a code change before the listing can be honest.
- **[OWNER]** only you can do it: Play Console, the website, a device, or a payment.
- **[QA]** a device test with a pass/fail result.

Do not submit while a **[CODE TODO]** or an incomplete **[OWNER]** item sits above the submission line.

## At a glance

| Item | State | Evidence / where |
| --- | --- | --- |
| `targetSdk 36` | **CODE DONE** | `app/build.gradle` line 12 |
| AAB buildable | **CODE DONE** | `./gradlew :app:bundlePlayRelease`; output under `app/build/outputs/bundle/playRelease/` |
| Play flavour permissions | **CODE DONE** | `app/src/play/AndroidManifest.xml` removes `INTERNET`, `ACCESS_NETWORK_STATE`, `REQUEST_INSTALL_PACKAGES` and the installer `<queries>` |
| FGS type | **CODE DONE** | `app/src/main/AndroidManifest.xml`: `.PlaybackService` with `android:foregroundServiceType="mediaPlayback"`, `exported="false"` |
| Audio focus | **CODE DONE** | `PlaybackService.java`: `AUDIOFOCUS_GAIN`, loss / transient loss / duck handling |
| Play Billing | **CODE TODO** | Needed only if shipping the Studio Unlock and per-pack unlocks |
| Privacy page | **READY TO DEPLOY** | `docs/play/privacy.html` staged as `site/resonance/privacy/index.html`; needs the upload |
| Contact address | **CODE DONE** | `admin@moddys.net` in `PRIVACY.md` and `privacy.html` |
| Play Console account + US$25 | **OWNER TODO** | One-time registration fee, if not already paid |
| Signing enrolment | **OWNER TODO** | Play App Signing + upload key |
| Store listing | **OWNER TODO** | Paste from `LISTING.md` |
| Screenshots | **OWNER TODO** | `store/01-home.png` … `07-settings.png` |
| Content rating | **OWNER TODO** | `CONTENT-RATING.md` |
| Data safety | **OWNER TODO** | `DATA-SAFETY.md` |
| FGS declaration + video | **OWNER TODO** | `FGS-DECLARATION.md` |
| Closed test, 12 testers / 14 days | **OWNER TODO** | Calendar-bound; start it first |
| Production access | **OWNER TODO** | After the closed test |

## Phase 0 — decisions that change the copy

- [ ] **0.1 [OWNER] Choose the launch model.** Free-only, or free with the two unlocks. If free-only: delete the PRICE section from `LISTING.md`, answer **No** to in-app purchases in `CONTENT-RATING.md`, and skip Phase 1 billing. If with unlocks: do 1.6 first and do not publish the price copy until it is real.
- [x] **0.2 Version name.** `2.1.0` / `versionCode 15`, no "beta" suffix; set in `app/build.gradle` and `compat.json`.
- [ ] **0.3 [OWNER] Define the entitlements.** One sentence each: what the Studio Unlock opens, and which packs have their own A$2.99 SKU. The listing currently says "opens the full studio"; replace that phrase if it is not accurate.
- [x] **0.4 Contact.** `admin@moddys.net`, in both privacy files and the listing table.
- [ ] **0.5 [OWNER] Confirm the public developer name.** The pack uses **ModdySwag** and **moddys.net**. If Play shows a different legal entity on the developer profile, keep the privacy policy and the profile consistent.
- [ ] **0.6 [OWNER] Confirm the target audience: 13 and over, not Designed for Families.** This is the assumption in `CONTENT-RATING.md` and `DATA-SAFETY.md`.

## Phase 1 — code and the uploaded artifact

- [ ] **1.1 [CODE DONE] Confirm the SDK levels.** `minSdk 26`, `targetSdk 36`, `compileSdk 36` in `app/build.gradle`. Play requires API 36 for new apps and updates from 31 August 2026; this build meets it.
- [ ] **1.2 [CODE DONE] Confirm the Play overlay.** `app/src/play/AndroidManifest.xml` removes `INTERNET`, `ACCESS_NETWORK_STATE`, `REQUEST_INSTALL_PACKAGES` and the installer `<queries>`. The play flavour also sets `BuildConfig.SELF_UPDATE = false`, so the updater cannot run.
- [ ] **1.3 [CODE DONE] Confirm the foreground service.** `.PlaybackService` declares `android:foregroundServiceType="mediaPlayback"`, `android:exported="false"`, and the app declares `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.
- [ ] **1.4 [CODE DONE] Confirm audio focus.** `PlaybackService` requests `AUDIOFOCUS_GAIN` before reporting playing, pauses on loss/transient loss, ducks on can-duck, and abandons focus on stop.
- [ ] **1.5 [CODE DONE] Build the AAB.** `./gradlew :app:bundlePlayRelease`. The output is the `playRelease` bundle under `app/build/outputs/bundle/playRelease/`. Do not upload the `sideload` bundle: it has `INTERNET` and the updater.
- [x] **1.6 No billing in this build.** The 2.1.0 artifact has no billing library and no `BILLING` permission; the listing and data-safety answers say free, no in-app purchases. (Re-open this line only if a paid build is planned.) ~~Implement Play Billing~~ Dependency, product IDs, purchase flow, restore flow, entitlement check, price display, and a test purchase in a closed track. The free build must still work if billing is unavailable.
- [ ] **1.7 [CODE TODO] Re-check the permissions after billing.** A billing library can add `com.android.vending.BILLING` and is a third-party SDK. If it does, update the permission table in both privacy files, the data-safety answer, and the listing's privacy sentence (it currently says no ads, analytics or crash-reporting SDKs). Do not leave "exactly five permissions" on a build that has six.
- [x] **1.8 Artifact inspected.** `app-play-release.aab` (2.1.0, code 15): no `INTERNET`, no `ACCESS_NETWORK_STATE`, no `REQUEST_INSTALL_PACKAGES`, no installer `<queries>`; `mediaPlayback` service present. Evidence in `AUDIT-2026-11-10-PLAY.md`.
- [ ] **1.8b [OWNER] Re-inspect in Play Console** after upload (the Console's merged view is the authority the reviewer sees).
- [x] **1.8c VirusTotal — clean.** `resonance-studio-2.1.0.apk`, sha256 `826c66e6…5013c2`, 992,101 B: **0 malicious / 0 suspicious** (65 clean verdicts, 8 engines do not scan APKs, 1 timeout, 1 failure). Report and method in `docs/play/VIRUSTOTAL-2.1.0.md`. Re-scan any rebuild — a new hash invalidates this report. Upload the AAB to internal testing, then check the merged manifest in Play Console or with `bundletool dump manifest --bundle <file>.aab`. It must show no `INTERNET`, no `ACCESS_NETWORK_STATE`, no `REQUEST_INSTALL_PACKAGES`, and the `mediaPlayback` service.
- [ ] **1.9 [OWNER] Enrol in Play App Signing.** Create or upload the upload key, store the keystore and both passwords in a password manager, and keep the CI secrets `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` current. A lost upload key can be reset through Play support; a lost app signing key can end the app's update path, so back it up.
- [ ] **1.10 [OWNER] Upload the playRelease AAB to internal testing and install it from Play** on a physical device. Confirm the installed package is `com.moddys.resonance`, not the `.debug` suffix.

## Phase 2 — policy page and store listing

- [ ] **2.1 [OWNER] Deploy `docs/play/privacy.html`** to https://moddys.net/resonance/privacy. It is one self-contained file: upload it as the page (for example `privacy/index.html`, or wire the route) and confirm the URL returns 200 over HTTPS with no login.
- [ ] **2.2 [OWNER] Read the live page on a phone.** Check the effective date, the publisher line, the contact, the five-permission table, the "no data collected" statement and the medical disclaimer. The HTML is the same policy as `PRIVACY.md`; if you edit one, edit both.
- [ ] **2.3 [OWNER] Enter the privacy URL in Play Console.** Required even though the app collects nothing. The listing cannot be submitted without it.
- [ ] **2.4 [OWNER] Create the app in Play Console.** Name **Resonance Studio**, package `com.moddys.resonance`, default language **English (Australia)**, type **App**, price **Free**, contact email, accept the Developer Program Policies, US export laws and the Play App Signing terms.
- [ ] **2.5 [OWNER] Paste the store listing** from `LISTING.md`: name (≤30), short description (≤80), full description (≤4,000). Check the counters in Console; it truncates at the limit without warning.
- [ ] **2.6 [OWNER] Upload the graphics.** `store/icon-512.png` (512×512), `store/feature-1024x500.png` (1024×500), and 2–8 phone screenshots from `store/01-home.png` … `07-settings.png` (1080×1920). The seven supplied shots are web renders of the shipped build. If review questions them, capture the same seven screens on a device and replace the set.
- [ ] **2.7 [OWNER] Set category and tags.** Health & Fitness (Music & Audio if you prefer to stay further from health-policy review), tags from Play's picker: binaural beats, white noise, brown noise, sleep, focus.
- [ ] **2.8 [OWNER] Set the contact details and website.** `https://moddys.net`, and the same contact email as the privacy page.
- [ ] **2.9 [OWNER] Start the listing experiment** from `LISTING.md`: A is the control, B and C are the two short-description variants. Keep the icon, feature graphic, screenshots and full description identical. Titles need custom store listings, not an experiment.
- [ ] **2.10 [OWNER] Read the listing once as a hostile reviewer.** No treatment claims, no ranking superlatives, no "completely free" if an unlock exists, no "no permissions" (there are five), no "no in-app purchases" if the unlocks are live.

## Phase 3 — declarations

- [ ] **3.1 [OWNER] Data safety.** Answer **No** to collection and sharing; leave every data type empty; do not opt in to Families or claim an independent review. Follow `DATA-SAFETY.md` line by line. The preview should read "No data collected or shared".
- [ ] **3.2 [OWNER] Content rating.** Complete the IARC questionnaire with the answers in `CONTENT-RATING.md`. Expect Everyone / PEGI 3 / ACB G. Apply the issued ratings and save the certificate.
- [ ] **3.3 [OWNER] Target audience and content.** 13 and over; not Designed for Families. This is separate from the content rating.
- [ ] **3.4 [OWNER] Ads.** **No.** There is no ad SDK and no ad slot.
- [ ] **3.5 [OWNER] App access.** **No special access** — every feature is available without a login or credentials.
- [ ] **3.6 [OWNER] Health apps declaration.** Describe it as a non-medical relaxation/listening tool with no diagnosis, treatment, cure or prevention claims. `[OWNER: pick the Console option that matches "not a medical device"; do not select a clinical or medical-device category.]`
- [ ] **3.7 [OWNER] Foreground service declaration.** Use `FGS-DECLARATION.md`: type `mediaPlayback`, the three impact texts, the **Media Playback** use case, and a 30–60 s continuous video that shows a user starting playback and it continuing in the background. Keep the video link live.
- [ ] **3.8 [OWNER] In-app purchases.** If the unlocks are live: declare them, create the Studio Unlock and per-pack products, set the A$7.99 / A$2.99 prices (Play converts to local currency), and confirm there is no subscription. If they are not live: answer **No** and remove the price copy from the listing.
- [ ] **3.9 [OWNER] Other declarations.** Not a news app, no government affiliation, no financial features, no health data collection, no account creation (so no account-deletion URL). Answer each truthfully; none of them needs a document.
- [ ] **3.10 [OWNER] Cross-check the three descriptions of the app:** the listing, the privacy policy and the data-safety form must agree on no account, no ads, no analytics, no network, local storage. If one says "no internet permission" and another implies a server, fix it before submitting.

## Phase 4 — device QA and the closed test

- [ ] **4.1 [QA] Permissions.** Android Settings → Apps → Resonance Studio → Permissions shows exactly `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, `WRITE_EXTERNAL_STORAGE` (the last only on Android 9 and older). No internet, location, microphone, camera, contacts, calendar, photos or music-library permission.
- [ ] **4.2 [QA] Airplane mode.** Turn on airplane mode, disable Wi-Fi, open the app, start a session, browse the library, open the visualiser, save a session file, export a WAV. Everything works and no network error appears.
- [ ] **4.3 [QA] Background playback.** Start a session, press Home, lock the screen, open another app. The sound continues, the notification stays, pause/stop work. Take a call or start another player and confirm the app pauses or ducks, then resumes correctly.
- [ ] **4.4 [QA] Notification permission.** On Android 13+, deny `POST_NOTIFICATIONS`. Playback still works; the notification controls do not appear. Grant it again and confirm they do.
- [ ] **4.5 [QA] Saving.** On Android 9, save a session file and confirm the storage prompt and the file in Downloads/Resonance Studio. On Android 10+, confirm no storage prompt and the file still arrives through MediaStore.
- [ ] **4.6 [QA] Accessibility and layout.** TalkBack labels on icon buttons, 48 dp targets, reduced motion, dark and light themes, large text, rotation, predictive back. No clipped text at the largest font.
- [ ] **4.7 [QA] Stability.** No crash or ANR on launch, play, pause, stop, rotate, background, lock, swipe from Recents (the service must stop with the task), or after an hour of playback. Check the visualiser flash rate stays below three per second.
- [ ] **4.8 [OWNER] Record the FGS video** using the shot list in `FGS-DECLARATION.md`. One continuous take on a physical device, 30–60 s, user-started playback continuing in the background, notification and pause/stop visible.
- [ ] **4.9 [OWNER] Start the closed test.** If this is a new personal developer account (created after 13 November 2023), Play requires at least **12 testers opted in for 14 continuous days** before production access. Recruit them, keep them opted in, collect feedback and fix blockers. `[OWNER: tester list and start date]`
- [ ] **4.10 [OWNER] Apply for production access.** Answer Play's questions about the testers, the feedback and what changed. Do not apply before the 14 days are complete.

## Phase 5 — production and after

- [ ] **5.1 [OWNER] Create the production release** with the playRelease AAB (the same version or a new `versionCode` if you changed anything). Write release notes that match what shipped; do not mention features that are not in the build.
- [ ] **5.2 [OWNER] Staged rollout.** 20% → 50% → 100%, watching Android vitals and the first reviews at each step.
- [ ] **5.3 [OWNER] Verify the live listing.** Name, short and full description, seven screenshots, privacy URL, content rating, "no ads", and the IAP prices if the unlocks are live.
- [ ] **5.4 [OWNER] Keep the channels separate.** The sideload build on moddys.net keeps `INTERNET` and the self-updater; the Play build must never be the sideload AAB. Do not upload the sideload bundle to Play.
- [ ] **5.5 [OWNER] Keep the privacy page live.** It is linked from the listing and must stay reachable for the life of the app. If the policy changes, update the page and the effective date, and re-check the data-safety answers.
- [ ] **5.6 [OWNER] Watch the contact address.** Reply to privacy and support questions; Play's review and users both use it.

## Stop-ship conditions

Do not submit if any of these is true:

- The privacy URL is not live, returns an error, or still shows `[OWNER: ...]`.
- The listing advertises the Studio Unlock or per-pack prices but Play Billing is not implemented.
- The FGS video does not show a user starting playback and the audio continuing with the app in the background.
- The uploaded AAB contains `INTERNET`, `ACCESS_NETWORK_STATE` or `REQUEST_INSTALL_PACKAGES`.
- The uploaded AAB contains a billing library or any analytics/ad/crash SDK and the data-safety form still says "no collection" without a re-check.
- The listing, privacy policy or content rating contains a treatment, cure, prevention, top-app or number-one claim.
- The screenshots show a UI that is not in the build.
- A new personal account has not completed 12 testers for 14 continuous days.

## Facts this pack still needs from you

| Missing fact | Why it blocks | Where it appears |
| --- | --- | --- |
| Contact email or contact page URL | The privacy policy and the Play listing both require a working contact | `PRIVACY.md`, `privacy.html`, `LISTING.md` |
| What Studio Unlock includes | The price copy says "opens the full studio"; that must be exact | `LISTING.md` |
| Per-pack SKU list and prices | The A$2.99 per-pack claim must match the products | Play Console, `LISTING.md` |
| Production versionName | Set to `2.1.0` / code 15 | `app/build.gradle`, `compat.json` |
| Billing go/no-go | It changes the permission list, data safety, privacy page and listing | Phases 0, 1, 3 |
| Tester list and start date | The 14-day clock cannot start without 12 opted-in testers | Phase 4 |
| FGS video URL | The declaration cannot be submitted without it | `FGS-DECLARATION.md` |
| Health declaration option | Console wording varies; the answer must be non-medical | Phase 3 |
| Play account and US$25 fee status | Determines whether Phases 2–4 can start | Phase 2 |
| Signing key status | The first upload needs the upload key and Play App Signing | Phase 1 |
