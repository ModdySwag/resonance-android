# Data safety — Resonance Studio (Google Play build)

App: **Resonance Studio** · package `com.moddys.resonance` · version 2.0.5-beta (versionCode 12)
Form: Play Console → **App content** → **Data safety**
Prepared: 8 November 2026

The whole declaration is one answer: **the app collects nothing and shares nothing.** Everything below exists to make that answer defensible if Play asks, and to stop a future change from silently making it false.

Play's own definition matters here: **collect** means transmitting user data off the device, including data sent by an SDK or by WebView content the app controls. Data that is only accessed and processed on the device is not collection. **Sharing** means transferring collected data to a third party, including an on-device transfer to another app. ([Play's Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469))

## The form, section by section

Play's form is conditional. Because the first answer is **No**, the encryption, deletion, data-type and data-usage questions are not shown. Do not go looking for them, and do not add a data type just to fill the screen.

| # | Console section | Question, as Play words it | Answer | Why, in one line |
| --- | --- | --- | --- | --- |
| 1 | Data collection and security | "Does your app collect or share any of the required user data types?" | **No** | The Play build has no `INTERNET` or `ACCESS_NETWORK_STATE` permission and no server; nothing leaves the phone. |
| 2 | Data collection and security | "Is all of the user data collected by your app encrypted in transit?" | **Not shown** — the form only asks this after a **Yes** to the first question | There is no data in transit to encrypt. If your Console shows this question, you answered the first question wrong. |
| 3 | Data collection and security | "Do you provide a way for users to request that their data is deleted?" | **Not shown** — same condition | There is no server-side data; the user deletes local data by clearing app storage or uninstalling. |
| 4 | Data types | "Select the user data types your app collects or shares." | **None selected** — leave every checkbox empty, then **Next** | None of the categories apply; the tables below say why for each. |
| 5 | Data usage and handling | Per-type questions (ephemeral, required/optional, purposes) | **Not shown** — no types selected | There is no collected type to describe. |
| 6 | Security practices | "Committed to follow the Play Families Policy" | **No** — do not opt in | The app is not directed at children and is not in the Families programme. |
| 7 | Security practices | "Independent security review" | **No** — do not claim it | No authorised lab has reviewed the app. |
| 8 | Security practices | Deletion request mechanism / URL | **Not applicable** | No collected data exists to delete; do not invent a URL. |
| 9 | Privacy policy | Privacy policy URL | **https://moddys.net/resonance/privacy** | Required even for an app that collects nothing. The page must be live before you submit. |
| 10 | Store listing preview | — | It should read **"No data collected or shared"** | If it says anything else, go back and clear the accidental selection. |

Two optional badges (#6 and #7) are marketing claims, not form requirements. Leaving both off is correct. If you later join the Families programme or commission an independent review, revisit them; do not tick either one to look thorough.

## Data types — every category, and why it is empty

Play groups the data types into 14 categories. Here is the whole list, so an empty form is a decision rather than an oversight.

| Play category | Data types in it | Selected? | Why not |
| --- | --- | --- | --- |
| Location | Approximate location, precise location | **No** | No location permission, no location API, no network request that could reveal an IP-based location. |
| Personal info | Name, email address, user IDs, address, phone number, race and ethnicity, political or religious beliefs, sexual orientation, other info | **No** | There is no account, no form, no profile and no sign-in. |
| Financial info | User payment info, purchase history, credit score, other financial info | **No** | The app never sees card or bank details. If Play Billing is added, Google Play processes the payment; see the billing note below before you answer this again. |
| Health and fitness | Health info, fitness info | **No** | The app asks no health questions and reads no health or fitness APIs. It is a listening tool, not a health app. |
| Messages | Emails, SMS or MMS, other in-app messages | **No** | There is no messaging, chat or inbox. |
| Photos and videos | Photos, videos | **No** | No camera or gallery permission and no picker. |
| Audio | Voice or sound recordings, music files, other audio files | **No** | Audio is synthesised with Web Audio; the app does not record and does not read the music library. |
| Files and docs | Files and docs, including file names | **No** | The app reads a file only when the user picks one to open or import, and writes an export only when asked, into the user's own Downloads; nothing is transmitted. |
| Calendar | Calendar events | **No** | No calendar permission or API. |
| Contacts | Contacts | **No** | No contacts permission or API. |
| App activity | App interactions, in-app search history, installed apps, other user-generated content, other actions | **No** | Settings, favourites and pack choices are stored locally and never transmitted. |
| Web browsing | Web browsing history | **No** | There is no in-app browser and no network permission. External links open the user's own browser, outside the app. |
| App info and performance | Crash logs, diagnostics, other app performance data | **No** | No crash-reporting or diagnostics SDK. Google Play's own platform vitals are Google's processing, not this app's collection. |
| Device or other IDs | Device or other IDs, including advertising ID | **No** | No advertising ID, no device identifier, no IP address reaches the app. |

## Why "No" is true — the evidence to keep

Check these against the **artifact you upload**, not just the source tree. A source file can be right while a dependency's manifest adds a permission.

1. **The Play overlay removes the network and installer permissions.** `app/src/play/AndroidManifest.xml` removes `INTERNET`, `ACCESS_NETWORK_STATE`, `REQUEST_INSTALL_PACKAGES` and the installer `<queries>` block from the merged manifest.
2. **The merged Play manifest has exactly five permissions:** `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, and `WRITE_EXTERNAL_STORAGE` with `maxSdkVersion="28"`. No `INTERNET`, no `ACCESS_NETWORK_STATE`, no advertising ID permission.
3. **The updater is compiled out.** The play flavour sets `BuildConfig.SELF_UPDATE = false`; the version-check and APK hand-off code cannot run.
4. **The page is packaged, not fetched.** `WebViewAssetLoader` answers `https://appassets.androidplatform.net/` from the APK's own assets. That is an internal origin, not a website, and the build has no permission to reach a website anyway.
5. **No third-party analytics, ads or crash SDK.** `app/build.gradle` has no `dependencies` block; the shell is the platform WebView plus its own Java classes.
6. **Nothing is backed up or transferred.** `allowBackup="false"`, `fullBackupContent="false"`, and `res/xml/data_extraction_rules.xml` excludes cloud backup and device-to-device transfer for every domain.
7. **No account and no server.** There is no sign-in, no API key, no endpoint, no database and no developer backend.

If any one of those stops being true, the answer to the first question is no longer **No**. Re-do the form; do not leave the old declaration up while the code changes.

## The one future change that needs a new answer: Play Billing

The planned commercial model adds a one-time Studio Unlock and per-pack unlocks. That is not in the 2.0.5-beta build described above. Before you ship a billing build:

- **Re-check the merged permission list.** A billing library can add `com.android.vending.BILLING` (a normal permission). The privacy policy's "exactly these permissions" table and the listing's permission sentence must be updated if it does.
- **Decide the purchase-history answer honestly.** Google Play processes the payment, and Play's FAQ says you do not declare the card data that the payment service collects directly. But Play also says to consider whether your app collects other financial information such as purchase history, and whether it receives data back from the payment service. If the app only asks "is this SKU owned?" and stores that locally, say so; if it keeps a purchase history or sends receipts anywhere, declare it.
- **Do not add a "no third-party SDKs" claim to the listing** once a billing library is in the build. Say "no ads, analytics or crash-reporting SDKs", which stays true.
- **If you are not ready to do that work, do not publish the price paragraph in `LISTING.md`.** Ship the free build with no purchases and keep the data-safety answer as it is.

This is the only planned feature that touches the declaration. A widget, a timer, extra presets or a visualiser do not.

## Deletion, in the form and in the app

The form does not ask for a deletion URL when nothing is collected. The privacy policy still tells the user how to delete what is on the phone:

- **Android Settings → Apps → Resonance Studio → Storage & cache → Clear storage** removes settings, favourites, imported packs and the current session.
- **Uninstall** removes the app's private storage with it.
- **Downloads/Resonance Studio** is outside the app's storage; the user deletes those files with the Files app or a file manager.

There is no account to delete and no server copy to request. If a reviewer asks for a "data deletion request" path, the honest answer is that the app has no server-side data; the local path above is the whole mechanism.

## Airplane-mode proof (for the review file)

The strongest evidence is behavioural, not documentary:

1. Put a device in airplane mode, with Wi-Fi off.
2. Install the Play build and open it.
3. Start a session, browse the library, open the visualiser, save a session file, export a WAV.
4. Everything works. The app never asks for a network and never shows a network error, because it has no network permission.

Keep a short screen recording of that pass with the submission notes. It answers the "how does a WebView app work offline?" question before it is asked.

## What to put in the review notes

Short version, if the Console gives you a free-text box:

> Resonance Studio's Play build has no INTERNET or ACCESS_NETWORK_STATE permission. Its page is served from APK assets by WebViewAssetLoader; audio is synthesised on-device with Web Audio. There is no account, no server, no ads, no analytics and no crash-reporting SDK. All preferences, favourites and imported packs are stored in the app's private storage. The only permissions are WAKE_LOCK, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK, POST_NOTIFICATIONS and WRITE_EXTERNAL_STORAGE (maxSdkVersion 28) for a user-requested save on Android 9 and older.

That is consistent with the manifest, the privacy policy and the listing. Keep it that way.
