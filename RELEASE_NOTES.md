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
