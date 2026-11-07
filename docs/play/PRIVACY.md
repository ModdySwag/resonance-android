# Privacy policy — Resonance Studio for Android

**Effective date:** 8 November 2026  
**Applies to:** Resonance Studio 2.0.5-beta (versionCode 12) for Android, Google Play build, package com.moddys.resonance  
**Publisher:** ModdySwag, moddys.net  

Resonance Studio collects nothing, shares nothing and sends nothing off your phone. This page explains what that means, in plain language.

## Who this policy covers

Resonance Studio is an Android app published by ModdySwag (moddys.net). This policy covers the Google Play build of the app, including version 2.0.5-beta (versionCode 12). If you installed the app from somewhere else, that build may behave differently, and this policy does not describe it.

## The short version

- No account, no sign-in and no profile.
- No ads, no analytics, no telemetry, no crash-reporting SDK and no tracking.
- No personal data collected, shared or sold.
- The Play build has no internet permission, so it cannot make a network request.
- Everything the app remembers stays in the app's storage on your phone.
- Uninstalling removes it. Files you chose to save stay in Downloads until you delete them.

## What the app stores on your phone

The app keeps a small amount of state so it works the way you left it:

- your settings and preferences, such as theme, accent, volume, loop and visualiser options;
- your favourites;
- the packs you import;
- the current session.

All of this lives in the app's private storage, inside Android's app sandbox. It is not copied to a server. The app also opts out of Android cloud backup and device-to-device transfer, so this data is not copied to Google Drive or to a new phone by the system.

If you explicitly save or export a file, it goes to Downloads/Resonance Studio, where you and your file manager can see it. On Android 10 and newer this uses the system MediaStore and needs no storage permission. On Android 9 and older the app asks for WRITE_EXTERNAL_STORAGE for that one save.

Storing something on your phone is not collecting it. In this policy, collect means send data off your device. The app does not do that.

## What leaves your phone

Nothing.

The Play build has no INTERNET and no ACCESS_NETWORK_STATE permission. It cannot open a network connection, so it cannot upload, download, sync or phone home. The page you see is loaded from files packaged inside the APK, not from a website.

There are no advertising, analytics, attribution, crash-reporting or tracking SDKs in the app. There is no advertising ID. There is no account system, and no server stores anything about you.

If you tap a link that opens a web page, the link opens in your own browser, outside the app. That is a normal web visit by your browser, not the app sending data. The app itself still has no network access.

The app never collects or has access to:

- your name, email address, phone number or postal address;
- your precise or approximate location;
- your contacts, calendar, photos, camera or microphone;
- your music library or other files, except a file you explicitly pick to open or import, or a file you ask the app to save;
- your device identifiers, advertising ID or IP address;
- your app usage, searches or listening history sent off the device;
- your payment card or bank details.

The audio you hear is synthesised on the device. The app does not record through the microphone and does not read your music library.

## Permissions and why the app asks for them

Version 2.0.5-beta of the Play build asks for exactly these permissions:

| Permission | Why the app asks |
| --- | --- |
| WAKE_LOCK | Keeps the CPU awake while a session plays with the screen off. It is released when playback stops. |
| FOREGROUND_SERVICE | Lets playback run as a foreground service, so Android does not kill it when you leave the app. |
| FOREGROUND_SERVICE_MEDIA_PLAYBACK | Declares that the foreground service is media playback, which is what it is. |
| POST_NOTIFICATIONS | Shows the playback notification on Android 13 and newer. You can refuse it; the sound still plays, but the notification controls will not appear in the shade. |
| WRITE_EXTERNAL_STORAGE (Android 9 and older only) | Saves a session file to Downloads when you ask for it. Android 10 and newer uses MediaStore and needs no permission. |

The app does not ask for internet, location, microphone, camera, contacts, calendar, photos, audio-library access or an advertising ID. That is the whole list for this version.

## Purchases

The app is free to download. If you choose to buy the one-time Studio Unlock or a pack unlock, Google Play processes the payment. The app never sees your card or bank details. Google Play tells the app whether the purchase is active so it can unlock what you paid for, and that state is kept on your phone.

Purchases are tied to your Google Play account, not to an account in this app. Google's handling of payment data is covered by Google's own privacy policy, not this one. We do not receive your payment details. There is no subscription and nothing renews.

## Children's privacy

Resonance Studio is a general-audience app. It is not directed at children under 13 (or the higher age your country sets for online consent), and it is not part of Google Play's Designed for Families programme.

It collects no personal information from anyone, including children. There is no account, no chat, no user-to-user contact, no user-generated content feed, no advertising and no location access. Because there is no server and no collection, there is no profile to delete and no data to request on a child's behalf.

If you are a parent or guardian and have a question, contact us at the address below.

## Your choices and deleting your data

You do not need an account, an email address or a profile to use the app.

To delete everything the app stores, open Android Settings → Apps → Resonance Studio → Storage & cache → Clear storage. Or uninstall the app.

Files you saved to Downloads/Resonance Studio are outside the app's storage. Delete them with your file manager or the Files app.

On Android 13 and newer you can refuse notifications. The app will still play; you just will not see the playback controls in the notification shade. You can change that later in Settings → Apps → Resonance Studio → Notifications.

Local data stays until you clear it or uninstall the app. There is no retention period on a server because there is no server.

There is no data deletion request form because there is no server-side data to delete. If you want help, contact us.

## Security

The app's local data is protected by Android's app sandbox, and by the screen lock on your phone if you have set one.

Because the Play build sends nothing off the device, there is no data in transit to encrypt. If you make a purchase, Google Play handles that transaction under its own security.

The app has no third-party advertising, analytics or crash-reporting SDKs. Its source is open under GPL-2.0-or-later and can be inspected.

If you find a security problem, contact us.

## Changes to this policy

If this policy changes, the new version will be published at https://moddys.net/resonance/privacy with a new effective date. A change to the app's permissions will be reflected here before that version is published. If the change matters, the app's Play listing or release notes will say so. There is no mailing list to notify, because the app has no account and no email address for you.

This version is effective 8 November 2026.

## Not a medical device

Resonance Studio is not a medical device. It does not diagnose, treat, cure or prevent any condition, and it makes no health claims. The tones are a listening tool for relaxation, focus and entertainment.

If you have epilepsy or a seizure disorder, ask a clinician before using repetitive pulsed tones. Keep the volume at a comfortable level, especially with headphones.

## Contact

ModdySwag, moddys.net

Contact: [OWNER: add a contact email address or contact page URL before publishing]

Privacy policy URL: https://moddys.net/resonance/privacy

---

This policy is published at https://moddys.net/resonance/privacy. It applies to the Google Play build only.
