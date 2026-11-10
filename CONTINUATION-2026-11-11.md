# Resonance Studio Android — 2026-11-11

## SHIPPED — 2.1.1 (versionCode 16) is live

`sha256 21b53aee6c12cc3e44093aa20d59cbaa0aba8231f11c78946dd3fdf69c1580ff`, 992,837 B,
signed with `resonance-release.p12`.

| Where | What |
| --- | --- |
| Site | https://moddys.net/downloads/resonance-studio-v2.1.1.apk — re-downloaded, hashes to the scanned sha |
| Feed | `updates.json` resonance-android: code 16, name 2.1.1, size 992837, same sha, url above |
| Card | `moddys-downloads.html` v2.1.1 pill, New-in copy, 0.9 MB, sha, certutil line, tag link, VirusTotal 0/66 line |
| GitHub | `main` at `bede38d`, tag `v2.1.1`, release with `resonance-studio-v2.1.1.apk` (API digest = the same sha) |
| VirusTotal | 0 malicious / 0 suspicious — 66 clean, 8 type-unsupported, 1 timeout, 0 failure of 75 engines, first submission. `docs/play/VIRUSTOTAL-2.1.1.md` |
| Tablet | installed, versionCode=16, versionName=2.1.1, `page: shim ready`, no crash |

The app offers no update on the tablet because the feed's code (16) equals the installed one.

## What 2.1.1 contains

1. **Chamber Setup sheet has a second exit** (`47e7223`). A `pointerdown` in the capture phase on
   `#cymRoot` closes `#rsCymPanel` when the tap is outside the sheet and outside its key; opening
   the page's Controls drawer closes it too. One `setSetup(on)` drives class + `aria-expanded`.
2. **Walkthrough bubbles always land inside the band** (`913dfee`). `tourPlace()` computes the band
   once (status bar, gesture bar, tab bar), `tourFit()` tucks spacing then caps the bubble and
   scrolls the copy, `tourClamp()` clamps the TARGET with the real width/height, `tourSettle()`
   measures the resting rect on `transitionend` +700 ms, `tourWatch()` re-places on
   resize/orientationchange/visualViewport.

## Gates on the shipped bytes

harness 268/0 · tour_fit 146 placements 0 outside the band · tablet 82/0 · eslint 0 ·
contrast 0 · lintRelease + testUnitTests BUILD SUCCESSFUL · apk_identity version legs ok
(only the byte-identity legs red, as expected for a minified release) · APK carries
`__rsSetupOutside` and `rs-t-tight`.

Negative proofs this session: the Setup-dismiss leg fails with the shim stashed
(`FAIL a tap on the picture dismisses the Setup sheet | 228`), and `tools/tour_fit.py`
reports 3 failures on the previous shim including rotation `bottom+278 next-unhittable`.

## Traps paid

- **Correct the target, not the live rect.** A measured nudge taken while the bubble's
  `.34 s` transform was in flight fed its own error back: 375 → 172 → 249 across one rotation.
  `tourClamp()` clamps the target; measurement happens only once the transition has ended.
- **A Playwright probe that measures mid-animation reports phantom overflow** (and one that polls
  for "stable" before the bubble is placed reports it at 0,0). Wait ~700 ms, then require three
  identical samples with `width > 100`.
- **The tablet's notification shade can hold focus** (`mCurrentFocus=NotificationShade` survives
  `cmd statusbar collapse`, BACK and HOME), so `adb shell input tap` never reaches the app. Use CDP
  input for glass proof while that is true, and say which input path proved it.
- **A fresh debug install opens the safety notice, then the welcome tour**, both of which swallow
  taps; clear them before probing anything in the chamber.

## Open

- Play Console owner steps (unchanged from 2.1.0): app record, Play App Signing, listing,
  data safety, content rating, FGS declaration, upload the AAB to internal testing.
- The site still carries `resonance-studio-v2.1.0.apk` (left in place so old links keep working;
  the feed points at 2.1.1).
- Every rebuild = rebuild both channels, gates, reinstall, RE-SCAN (new hash), re-upload APK +
  feed + card, and re-tag.
