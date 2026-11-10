# Resonance Studio 2.1.1

**Two edges smoothed: the chamber's Setup sheet and the walkthrough's bubbles.**

## What changed

- **The Setup sheet has a second way out.** In the Cymatic Chamber, a tap anywhere on the
  picture now puts it away — the Setup key is no longer the only exit. Opening the page's
  Controls drawer puts the sheet away too, so the two panels never stack on one stage.
  Taps inside the sheet (its chips, its faders, the grabber) are left alone.
- **The walkthrough bubble always lands on the glass.** It is now fitted to the safe band
  (status bar, gesture bar, tab bar) before it is placed: tighter spacing first, and copy that
  still cannot fit scrolls inside a bubble capped to the band, so Next and Back stay reachable.
  The placement is re-aimed when the glass changes — rotation, resize — and checked again once
  the bubble has come to rest, which catches copy that reflowed after the estimate.
  Found on a phone this was never tested on: rotate with the tour open and the bubble kept its
  portrait coordinates, 278 px past the bottom of the band with Next unreachable.

## Installing

`resonance-studio-2.1.1.apk` (versionCode 16) installs straight over 2.1.0 — same signing key.
Built for the sideload channel; the Google Play build is delivered by Play.

# Resonance Studio 2.1.0

**Fourteen doors on Home, and every number now tells the truth.**

## What changed

- **Home has fourteen sessions.** Six new short doors join the eight state cards — Settle the
  room, Reset break, One tone 396, Forty a second, Settling in, Six breaths — each pinned to an
  exact library session and each with its own plate.
- **The counts are read, not typed.** Home says 14 sessions, Sessions says 130 in the library,
  and the tour says the same. They come from the library the app actually built.
- **The mini viewer runs.** Its scenes breathe, drift and settle instead of holding a still
  frame, and the play key is the only switch: pause or stop paints one frame and holds it.
  Shuffle and the arrows start a silent preview; tapping the picture ends it.
- **A safety notice on first launch.** Headphones for binaural, comfortable volume, a clinician
  first if you have epilepsy or a seizure disorder, never while driving — plus the licence and
  warranty terms in plain words. It shows once, and it is in Settings afterwards.
- **Copy trimmed.** The Studio's headphone and fold notes are gone; Settings gained Session
  packs and the safety notice.

## Installing

`resonance-studio-2.1.0.apk` (versionCode 15) installs straight over 2.0.x — same signing key.
Built for the sideload channel; the Google Play build is delivered by Play.

**VirusTotal:** 0 detections. `resonance-studio-2.1.0.apk`, sha256
`826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2`, 992,101 B — 0 malicious,
0 suspicious across 65 engines that returned a verdict (8 do not analyse APKs). Report:
https://www.virustotal.com/gui/file/826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2
The app itself says the same thing without a hash, because embedding the hash would change the
file that was scanned.

Cheers Moddy !

---

# Resonance Studio 2.0.5-beta

**The chamber becomes an instrument.** The cymatic chamber now wears the same amplifier
hardware as the rest of the app, and the scenes you pick stay picked.

## What changed

- **The chamber has a real faceplate.** Play/Pause and Stop are the same machined brass keys
  as the home player, with a master fader between them; Back, ? and LIVE sit on the row above.
  The redundant Close key is gone — Back already leaves.
- **The panels move.** Drag the player's lip up to put it away, pull it back down; the lower
  panel is a drawer you can slide shut or open from its handle. Eight seconds of quiet puts
  both away on their own, and any touch brings the player back.
- **Scenes stick.** Picking Cathedral, Cold Forge or Solar Disc used to be erased a beat later —
  the shell re-derived the look from the session and repainted the chip row from its own plan.
  A chip is now a manual decision: it turns "Follow the tone" off, stays lit, and survives
  reopening the chamber.
- **Focus view and the fullscreen visualiser share one panel** — the visualisation row stacked
  over transport and fader, same brass, same fader, no loose pill rows.
- **Every session holds its level.** The fade-out entry now repeats the level instead of
  ramping into silence, so a hold is a hold. Measured across the library: 92 of 130 sessions
  change, no voice changes its peak or its length.

## Install

Release assets are signed with the same key as 1.1.x, so 2.0.5 installs straight over it.
`resonance-studio-v2.0.5-beta.apk` is the sideload build (versionCode 13).

Cheers Moddy !

---

# Resonance Studio 2.0.0-beta

**The redesign.** The app is no longer the desktop studio page with a bar under it. It is a
purpose-built Android app — Material 3, five real destinations, and a visualiser that is tied
to what you are actually playing.

## What changed

- **New app shell.** Home, Sessions, Studio, Visualise and Settings in a Material 3 navigation
  bar, a large-title app bar, and a mini player that follows you. The old drag-up menu is an
  overflow sheet for the four things that live outside the tabs.
- **Home starts a sound in one tap.** Sleep, Focus, Relax and Wake tiles load a matching
  session and play it; a build-a-tone panel lets you set a carrier, a beat and an optional
  noise bed and press play.
- **The library is a library.** Search, packs, favourites, and a real row layout — the same
  hundred sessions, now reachable instead of buried in a document.
- **Visualise is its own section.** The cymatic chamber binds to the session: the carrier
  picks the plate mode, the beat sets the pace, the voice type picks the medium — plate, disc,
  drum, water or bubbles — and the screen prints the mapping. Ambient panels and the chamber
  scene chips live there too.
- **Material 3, dark and light.** Tonal surfaces instead of shadow soup, 48 dp minimum on every
  control, one accent (teal) with an optional system-wallpaper accent, and everything collapses
  under reduced motion.
- **Accessibility pass.** Nav is a real tablist, every icon button is labelled, the clock is a
  polite live region, contrast is measured rather than eyeballed.
- **Platform.** `targetSdk 35`, edge-to-edge with proper insets, predictive back for sheets and
  overlays, a monochrome adaptive icon, and a signed `.aab` built beside the APK in the release
  job.

## The rest, still true

Offline by default; sessions keep playing with the screen off; pause and stop on the lock
screen; exports of any length; share links rewritten to the real site; no account, no
analytics, no ads, no third-party dependencies.

## Play Store

`store/` carries the submission pack: 512 icon, 1024×500 feature graphic, seven 1080×1920
screenshots from this build, listing copy with a limit checker, data-safety answers with
evidence, and the privacy page.

## Known limitations

- Play review has not been attempted yet; the AAB and listing are ready but unsubmitted.
- The state tiles pick the first matching built-in session, so a pack rename can move what a
  tile loads. Deterministic, but tied to names.
- Visualise needs a WebView with WebGL2 for the full shader path; older devices get the 2D
  fallback.

## Install

Release assets are signed with the same key as 1.1.x, so this installs straight over it.
`resonance-studio-v2.0.0-beta.apk` is the sideload build; `…​.aab` is for the store.

Cheers Moddy !
