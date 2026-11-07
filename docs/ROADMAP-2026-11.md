# Roadmap — what five research streams found, and what to do first

Researched 2026-11-07 by five parallel agents (Play Store market scan, Play compliance, WebView GPU
feasibility, monetisation/ASO, platform upgrades). Every number below carries its source in the
stream reports; this file is the decision layer, not the evidence dump. Claims that contradict our
own code have been checked against the repo and corrected here.

## What actually matters from the research

**Every incumbent fails at the same thing.** 25 of 144 sampled 1-3 star reviews across 16 apps are
"audio stopped"; 6 of 7 critical reviews of Binaural Beats Therapy are that exact bug. 71 of 144
complain about subscription/price/refund. We already ship the thing they cannot: offline, no
account, no ads, a foreground service, 641 KB.

**Nobody owns the visualiser.** 0 of 11 readable listing descriptions mention visuals at all. Our
cymatic water is the only genuinely distinctive asset in the category, and it is currently wasted as
a screensaver.

**"Binaural beats" is not the biggest search term.** Google Trends, 12-month mean: worldwide
`binaural beats` 40.5 vs `sleep sounds` 63.3; in the US `brown noise` 34.4 vs `binaural beats` 13.3;
in the UK `brown noise` 68.3 vs 32.7; in Australia `white noise` is 70.2 vs 6.0. We synthesise
audio and have a mixer — adding noise colours is DSP plus presets, not a new product.

**Headphone dependence is the category's adoption cliff.** Every binaural app warns "use
headphones"; one reviewer reports total silence with none; a 1K-install app's entire pitch is "works
without headphones". A speaker-safe (isochronic) mode is unclaimed ground.

**AAA in the console sense is not possible in a WebView, and the arithmetic is not close.** At
1080x2400/60 there are ~1200 usable ALU ops/px on Adreno 643 and ~440 on Mali-G68; one 64-step
raymarch needs ~1900 before anything else is drawn. What *is* achievable is Milkdrop/Shadertoy-class
imagery, which is exactly what a music visualiser needs: one or two full-screen procedural passes,
HDR bloom + filmic tonemap, instanced lanes and particles. ~15-20 working days. The first day alone
removes the 18 ms UI-thread cost by moving the work to a GPU currently sitting at 4 ms.

## Corrected against our code (the agents assumed otherwise)

| Claim | Reality |
|---|---|
| "No foreground service type declared" | Already correct: `mediaPlayback` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, and `startForeground(..., FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)` |
| "No MediaSession; Blink disables it in WebView" | We already own a native `MediaSession` in PlaybackService — the shell does what the page cannot |
| "No audio focus" | **True gap.** No `requestAudioFocus` anywhere. On Android 15+ focus is refused unless top-app or FGS, so this is a correctness bug, not polish |
| "REQUEST_INSTALL_PACKAGES is a Play blocker" | **True.** It is in the manifest at line 14 and the policy names self-update explicitly |
| "Edge-to-edge / predictive back will break at API 36" | Already handled (`edgeToEdge()`, `OnBackInvokedCallback`), verified on the tablet this session |

## Track A — Play blockers (must happen before any submission)

1. **Remove the self-updater for the Play build.** Delete `REQUEST_INSTALL_PACKAGES`, the
   download/verify/install path, and the version-check call. Play's Device and Network Abuse policy
   names this behaviour outright; it is removal, not a warning. Sideload keeps its own flavour.
2. **Then `INTERNET` and `ACCESS_NETWORK_STATE` become removable too** on the Play flavour — the
   strongest possible listing claim: nothing leaves the device.
3. **Add `fullBackupContent` is done; now the AAB**: `./gradlew bundleRelease`, upload the `.aab`.
4. **Privacy policy** on a live HTTPS page, linked in Play Console and in-app.
5. **Data safety**: "no data collected, no data shared"; revisit if any SDK is ever added.
6. **FGS declaration in Play Console** with a 30-60 s screen recording of user-initiated playback
   continuing in the background.
7. **Audio focus** (also Track D1) — reviewers exercise background playback, and failing it is a
   one-star review waiting to happen.
8. **Closed test: 12 testers opted in for 14 continuous days** before production access for a
   personal account created after 13 Nov 2023. This is calendar time, not work — start it first.
9. **Signing**: enrol the existing release key in Play App Signing, or a Play build will not install
   over a sideload build.
10. **Listing copy must avoid therapeutic claims.** "Tone generator for relaxation and focus", plus
    a not-a-medical-device line. Health-claims policy is a takedown risk, and the tinnitus audience
    is exactly where the temptation lives.

## Track B — the visualiser, in cost order

Step 1 is one day and is worth doing on its own merit:

1. WebGL2 canvas behind the current one, one trivial full-screen draw, permanent Canvas2D fallback
   if context creation fails. **This alone moves the frame cost off the UI thread.**
2. Port the cymatic field to one fragment shader at 0.6-0.75 internal scale; analytic normals from
   the field gradient (never finite differences — 4x the cost); sin/cos through a 256x1 LUT.
3. HDR: RGBA16F + bloom mip chain (dual-filter) + ACES tonemap + grade/vignette/grain **in the same
   pass**. Requires `EXT_color_buffer_float`; fall back to RGBA8 with no bloom.
4. Instance the spectrum/waveform lanes (one draw call, heights as a data texture — Qualcomm bug
   #290 requires 4-byte-aligned UBO ranges).
5. Particles: 20-100k additive quads, procedural sprites, fixed pool, per-frame covered-pixel
   budget (fill-bound, not ALU-bound).
6. Optional GPGPU fluid at 128-256 grid, never at screen resolution.
7. Adaptive quality: EMA of frame time drives internal scale 0.5-1.0, bloom depth, particle count.
   Design target ~8 ms GPU on the weakest supported device to leave thermal headroom.

Skip raymarched volumetrics (16-43 ms/frame at native res) and MSAA (capped at 4x on Android, does
nothing for procedural full-screen content). Defer WebGPU: Android 12+, no Samsung Xclipse, and it
buys compute this renderer does not need.

## Track C — market wedge (ranked by evidence per effort)

1. **Noise colours** (brown/pink/white) in the mixer and packs. Biggest demand unlock available.
2. **Speaker-safe entrainment mode**: detect output route, offer isochronic, honest one-liner that
   true binaural needs headphones. Unclaimed by every competitor.
3. **Cymatic Bedside Mode**: full-screen visualiser, clock, burn-in-safe, dim, fade-out timer,
   shareable 15 s clip. Turns the best asset into eight hours of nightly use.
4. **Sleep timer that is a clock time** ("stop at 11:30"), real fade, remembered last session.
   24 of 144 critical reviews ask for exactly this.
5. **Focus Sprint**: 25/5 with a beta ramp, break chime, auto-resume, weekly minutes. Highest
   willingness to pay, and the incumbents' timers are what break.
6. **Hearing-safety guard**: per-pack loudness normalisation, estimated SPL, 60/60 reminders, kids
   volume cap. Cheap, defensible, nobody does it.
7. **Evidence mode**: protocol, target band, what it does *not* claim, citations, and a one-tap
   after-session rating with a 7-day chart. Scepticism about "science" is the category's weak spot.
8. **Tinnitus toolkit** — real demand (10-25% of adults have tinnitus) but it carries Play health-
   claim risk and clinical-brand competition. Build it as *masking*, never as treatment, and only
   after the Play listing is established.

## Track D — platform upgrades, ranked

1. **Audio focus** (real bug, half a day): request `AUDIOFOCUS_GAIN` in the service, pause on
   `LOSS`, duck on `LOSS_TRANSIENT_CAN_DUCK`, abandon on stop.
2. **Widget** ("tonight's session", one-tap start). Google's own case study: +25% retention for
   widget users. No account or network needed.
3. **Beat-synced haptics**: amplitude ticks on the beat, not continuous vibration; honest labelling
   as rhythmic haptics, not a binaural beat.
4. **Output awareness**: pause when headphones unplug, tell the user when they are on speaker, and
   note when system spatial audio is active but not applied.
5. **Android 16 Live Update** session card (progress + pause) on top of the existing MediaSession.
6. **Circadian presets + sunrise fade** (pure JS + AlarmManager; no new APIs).
7. **Latency calibration** by tap-along, stored per route (visual/haptic sync only).
8. **Skip**: spatial audio (HRTF crossfeed destroys dichotic beats — Google's own guidance says
   stereo must not be spatialised) and Wear OS (15-20 days for a small audience).

## Track E — commercial

- **Free, no ads, no account; one-time "Studio Unlock" at A$7.99 (US$5.99, GBP 4.99, EUR 5.99)**,
  plus a A$2.99 per-pack SKU. No subscription: the published benchmark says subscriptions earn more
  (utilities 12-month LTV US$46.30) but ~72% of annual subscribers cancel inside year one, an
  offline app has no recurring cost to justify it, and this audience is explicitly shopping for
  "no subscription". Google's AU fee is ~15% either way at sub-$1M scale.
- **Title and 80-character short description** should lead with the searched term, not the brand.
  A 10K-install app holds a top-4 slot on "binaural beats" — relevance and rating beat install mass.
- **Do not chase** `sleep sounds`, `focus sounds` or `tinnitus relief` head terms; they are owned by
  Calm/Headspace/BetterSleep/Endel and by clinical brands.
- **Grandfather** existing sideload users with a free unlock and a session import path.

## Track F — features that build distance (not just parity)

Distance comes from things a competitor cannot copy in a sprint because their architecture forbids
it. Ours are structural: no account, no server, no network permission, and a native shell that owns
system surfaces a web app cannot reach.

1. **Cymatic Bedside Mode.** Full-screen field, clock, burn-in-safe dim, fade-out, 15 s share clip.
   Turns the one asset nobody else has into eight hours of nightly use. Copyable in a month; not
   copyable by anyone whose visualiser is a paid add-on.
2. **Speaker-safe entrainment.** Route detection, isochronic fallback, one honest line about
   headphones. Every competitor's product silently dies on a phone speaker; theirs cannot fix it
   without admitting it.
3. **Session files, no cloud.** A session exports as a small JSON (and a QR for a tap-to-import).
   Sharing a protocol works offline, needs no account, and is something cloud-based rivals will not
   ship because it routes around their account system.
4. **Noise colour continuum + room calibration.** Not four fixed colours: one continuous tilt from
   brown to white, plus a 20-second ambient measurement that sets the masking level. Owns the
   highest-volume search terms with a better tool than the incumbents' fixed presets.
5. **Night programs.** Chain sessions with crossfades into a single night-long arc (down through
   theta, hold, drift to delta, sunrise ramp). A timer is a setting; a program is a feature.
6. **On-device journal.** One tap after a session (focus/mood/sleep), stored locally, 7-day chart,
   CSV export, no telemetry. Evidence mode's other half, and a trust claim no subscription app can
   make credibly.
7. **Haptics + Android 16 Live Update card.** The "this is native" layer: a beat you can feel and a
   session card in the shade.

**Do not build:** accounts, cloud sync, social feed, an AI companion, sleep-cycle detection from
phone sensors, Wear OS. Each one either breaks the offline moat or picks a fight with an incumbent
who owns it.

**The bluntest moat is a permission list.** A Play build with no `INTERNET` permission is verifiable
by any user in Settings, and no competitor whose product depends on a server can say the same.

## First three moves

1. Start the 12-tester closed test the day the Play track begins — it is a 14-day calendar wall.
2. Cut the Play flavour's updater and network permissions (Track A1-A2), because everything else in
   that track is paperwork that depends on it.
3. Spend one day on WebGL2 step 1: it is the cheapest visible win on the board and it fixes the
   measured 18 ms UI-thread frame cost at the same time.

## Provenance and limits

- Market numbers are from Play listings and review panels read on 7 Nov 2026 (US storefront);
  review theme percentages are keyword-tagged over a non-random 144-review sample — directional.
- Subscription/retention figures are published benchmarks (RevenueCat SOSA 2026, Adapty SOIS 2026).
- GPU budgets are derived from published peak ALU and bandwidth, **not measured on our devices**.
  Verify with a one-day spike on real Adreno 643 and Mali-G68 hardware before committing to dates.
- Play policy items marked confirmed carry a support.google.com or developer.android.com URL in the
  stream reports; the ones marked unverified (some API-level behaviours) need a check against the
  current docs before we rely on them.
