# Resonance Mobile — the 2.0 redesign

Status: in build. Owner: Moddy. Surface: `resonance-android` only (the web studio, the
Windows app and the site are unchanged).

## The problem with 1.1.4

The app was the **desktop studio page** with a bottom bar bolted on: a three-column DAW
document, scaled down, plus a drag-up sheet that listed the page's own sections as anchors.
Every control was the page's desktop control. Nothing about the shape said "Android", and
the sheet asked the user to understand the studio's information architecture before they
could play anything.

## The 2.0 shape

A purpose-built mobile app UI, in Material 3 (dark + light, dynamic accent), with five
destinations and one job each:

| destination | job |
|---|---|
| **Home** | start a sound in one tap: state tiles (Sleep · Focus · Relax · Wake), the build-a-tone generator, the current session, what you are hearing |
| **Sessions** | the 100+ session library: search, packs, favourites, speaker/headphone filter |
| **Studio** | voices & entries, live tools (meter · timer · pacer · mute), files & export |
| **Visualise** | the Cymatic Chamber plus the ambient panels, bound to the session |
| **Settings** | theme, motion, guide, device check, about, updates |

The desktop markup stays the **single source of truth** for sound: the app moves the real
card nodes into its own screens and drives the page's own `window.__gnauralAPI`. Nothing
about the engine, the schedule model, the presets or the renderers is forked.

## Design system

- **Colour**: M3 tonal roles generated from a teal brand seed (`#0E8C7C`), dark-first.
  Accent comes from the system dynamic-colour palette on Android 12+ via the `palette()`
  bridge; the brand seed is the fallback. Amber (`#E9B972`) is reserved for "live".
- **Type**: system UI face; display 32/36 700 · title 22/28 600 · body 15/22 · label
  12/16 600. Nothing below 12 sp.
- **Shape**: 16 dp cards, 24 dp hero, 28 dp sheet, full-round pills. 1 dp outline-variant
  hairline instead of shadows.
- **Touch**: 48×48 dp minimum on everything interactive; the transport is 64 dp.
- **Motion**: 180 ms emphasized-decelerate screen transitions, a nav indicator that slides,
  a slow breathing ring on the hero while playing. All of it collapses under
  `prefers-reduced-motion: reduce`.

## Accessibility (Play-ready)

- Nav is a real `role="tablist"`; screens are `tabpanel`s with `aria-labelledby`.
- Every icon-only button carries an `aria-label`; the clock is `aria-live="polite"` at 1 Hz.
- Focus moves to the new screen's heading on nav change; focus rings are visible.
- Contrast is measured, not eyeballed: every text token is ≥ 4.5:1 on its own surface
  (`tools/contrast_audit.py`, run in CI).
- Reduced motion, large text (sp-based sizes, no fixed heights on text), and TalkBack labels
  on the visualiser canvases.
- Flash budget stays the page's own (≤ 1 Hz luminance).

## The Visualise section

The chamber is already a deterministic instrument: `src: "session"` makes it resolve the
session's own carrier onto the plate's mode ladder and breathe at the session's beat. 2.0
turns that into a section:

- **Follow the session** (default on): the screen reads the loaded schedule and picks the
  medium from the *voice type* and the *beat band* — binaural delta/theta → free plate,
  alpha → disc, beta/gamma → Faraday water, isochronic → water, noise beds → dust-forward
  drum. The mapping is printed as text so it is never a mystery.
- The screen shows the live carrier, rate, band and mode the chamber resolved, and the
  ambient panels underneath.
- Scene chips, medium chips, sand/lines/dust toggles, and **Open the chamber** for the
  full-screen instrument.

## Platform work

- `targetSdk 35`, edge-to-edge with real inset handling, predictive back for the sheet and
  overlays, monochrome adaptive icon, per-app language + `localeConfig`.
- `.aab` alongside the APK in the release job, signed from the same config.
- Play assets: 512 icon, 1024×500 feature graphic, 1080×1920 screenshots rendered from the
  real build, listing copy with counted fields, data-safety answers, privacy page.

## Contract (for every lane)

- The app never reimplements playback or state; it calls `window.__gnauralAPI` and reads the
  page's DOM.
- New UI text is sentence case, names the thing, and says what happens. No jargon the
  studio itself does not already use.
- `tools/shim_harness.py` is the acceptance gate and grows with the UI; a red check is a bug
  in the build, never in the check.
- The bundled `www/app` tree stays byte-identical to the site. Only `_shell_shim.js` and the
  native shell are ours.
