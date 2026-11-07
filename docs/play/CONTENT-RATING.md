# Content rating — Resonance Studio (IARC questionnaire)

App: **Resonance Studio** · package `com.moddys.resonance` · version 2.0.5-beta (versionCode 12)
Console path: **App content → Content rating**
Prepared: 8 November 2026

## What this app is, in questionnaire terms

A non-medical relaxation and listening tool. It synthesises tones, beats and noise on the device, ships a library of presets, and draws an abstract visualiser. There is no story, no characters, no user-to-user feature, no advertising, no gambling, no location, no personal information and no unrestricted web access. It sells two optional digital unlocks.

The answers below are written for IARC's generic questionnaire. IARC's exact wording changes slightly with the category you pick and the country set; answer the same way wherever the topic appears. If a question is not listed here, it is because the answer is **No** and the reason is the same as its section.

## The answers

| IARC section | Question in plain terms | Answer | Why |
| --- | --- | --- | --- |
| App category | Is this a game or a non-game app? | **Non-game app** — the closest utility/lifestyle/music option | It is a listening tool. There is no game loop, score, competition or playable character. |
| Violence | Does the app depict violence, blood, injury, weapons or violent threats? | **No** | There are no characters, scenes or narrative. The visualiser is abstract sand, water and particles. |
| Sexuality | Does the app contain nudity, sexual content, suggestive material or sexual references? | **No** | No people are depicted and no sexual content exists. |
| Language | Does the app contain profanity, slurs, crude humour or sexually explicit language? | **No** | The shipped copy is plain UI text and preset names (Sleep, Focus, Relax, Wake, Noise, and so on). |
| Controlled substances | Does the app reference or depict drugs, alcohol or tobacco? | **No** | No substance references, no drinking or smoking imagery, no drug culture. |
| Gambling | Does the app offer real-money gambling, simulated gambling, betting or casino games? | **No** | There is no wagering, no casino, no lottery, no loot box and no randomised reward. |
| User-generated content and social features | Can users create, upload, publish or share content, or interact with other users? | **No** | Users can edit a session and import a local pack, but nothing is published, shared or sent anywhere. There is no profile, chat, comment, feed, friend list or multiplayer. Local editing is not UGC in IARC's sense because no other user can see it. |
| Location sharing | Does the app share the user's location? | **No** | No location permission and no location API. |
| Personal information | Does the app collect or share personal information? | **No** | No account, no form, no analytics and no network permission. The privacy policy says the same. |
| Digital purchases | Does the app let users buy digital goods or services with real money? | **Yes** — one-time Studio Unlock and per-pack unlocks | Both are direct, permanent unlocks through Google Play. No subscription, no randomised item, no loot box, no physical goods. Details below. |
| Advertising | Does the app contain ads or ad-supported content? | **No** | No ad SDK, no ad slot, no sponsored content, no ad identifier. |
| Unrestricted web access | Does the app provide an in-app browser or unrestricted access to the internet? | **No** | The WebView loads only files packaged in the APK. There is no in-app browser and no internet permission. A link that opens a web page hands it to the user's own browser, outside the app. |
| Medical / health content | Does the app give medical information, diagnose, treat or claim health benefits? | **No** | It is not a medical device and makes no diagnosis, treatment, cure or prevention claim. The seizure warning is safety information, not medical advice. |
| Horror / frightening content | Does the app contain horror, jump scares, gore or content likely to frighten young children? | **No** | The visualiser is abstract and calm; there are no threats, monsters or sudden events. |
| Flashing / photosensitivity | Does the app contain rapid flashing or strobe effects? | **No** | The visualiser is capped below three flashes per second, and motion can be reduced or switched off. |

## In-app purchases — the detail IARC and Play both want

| Question | Answer |
| --- | --- |
| Are digital goods sold? | **Yes.** A one-time **Studio Unlock** and individual **pack unlocks**. |
| Is it a subscription? | **No.** Nothing renews. |
| Are purchases random (loot boxes, gacha, mystery packs)? | **No.** The user buys a named unlock and gets that unlock. |
| Are physical goods sold? | **No.** |
| Is real money used? | **Yes**, through Google Play's billing system. Prices are set in Play Console (planned: A$7.99 for Studio Unlock, A$2.99 per pack). |
| Can the app be used without buying? | **Yes.** The free download plays sessions; the unlocks are optional. |
| Does the app require an account? | **No app account.** A purchase is tied to the user's Google Play account, which Google handles. |

The IARC questionnaire's digital-purchases question is about disclosure, not adult content. Answering **Yes** does not push the rating up by itself. Answering **No** when purchases exist is the mistake.

If the first submission ships before Play Billing is implemented, answer **No** here and change it before the billing build goes live. Do not advertise the unlocks in the listing until they exist.

## What rating to expect

With these answers, the expected outcome is the lowest tier from each authority: **ESRB Everyone**, **PEGI 3**, **USK 0**, **ACB G**, **ClassInd L**, and similar elsewhere. That is an expectation, not a promise: IARC issues the certificate, and the exact descriptors are its decision.

Do not advertise a rating, print a rating badge, or put a rating in the listing until the certificate is issued and visible in Play Console. If the result comes back higher than expected, re-read the answers for user-generated content, unrestricted web access and digital purchases; those are the three most common accidental **Yes** answers.

## Target audience is separate from the content rating

A low content rating does **not** mean the app is directed at children. In **App content → Target audience and content**:

- Select **13 and over** as the target age group.
- Do **not** opt in to **Designed for Families**.
- Do **not** select an under-13 age group. That would bring the Families policy into scope: additional ad-SDK rules, additional data rules and a different review. The app has no ads and collects nothing, so it would probably pass, but it is unnecessary scope for a general-audience tool.

The content rating can still be Everyone/PEGI 3 while the target audience is 13+. Those are different questions and Play expects them to be answered separately.

## After the questionnaire

1. Apply the ratings in Play Console; they appear on the listing automatically.
2. Save the IARC certificate PDF with the release records.
3. Re-do the questionnaire if the content changes in a way that affects an answer: adding ads, adding user accounts, adding chat or sharing, adding a browser, adding randomised purchases, or adding medical claims.
4. Keep the non-medical disclaimer in the listing and the privacy policy. It is consistent with the answers above and it is the line that keeps the app out of medical-device territory.
5. If you later add a feature that lets users share sessions with each other, the user-generated content answer changes. Come back to this file before shipping it.
