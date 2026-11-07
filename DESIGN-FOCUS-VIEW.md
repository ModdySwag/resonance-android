# FOCUS VIEW — the redesign brief (2026-11-08)

Owner's verdict: too many similar-looking animations; wants a complete replacement that is
spectacular, genuinely "trippy", and specific to **focusing and a meditative state** — not a
generic audio visualiser, and deliberately not cymatic (the chamber owns that language).

## Why the current set reads as samey (the diagnosis)

The 24 presets are a cartesian product: 5 backdrops (`tide`, `drift`, `rainfall`, `score`,
`aurora`) × 8 overlays (`pulse`, `phasors`, `traces`, `orbits`, `ripples`, `harmonograph`,
`weave`, `meters`) × 7 palettes. Measured on the phone at 1:1, twenty of them resolve to the
same visual sentence: **a horizontal line or a field of dots, with one small motion accent**.
That is why they feel interchangeable — they are the same composition, retinted.

The chamber escapes this because cymatics is a *specific* physical language (nodes, sand,
modes, materials). The focus view needs its own language, chosen for attention rather than
for physics.

## What "focus / meditative" means visually (the design rules)

1. **One anchor, moving slowly.** Every scene has a single thing the eye can rest on and
   return to. Depth comes from parallax behind it, never from more objects competing.
2. **Breath, not beat.** Motion is paced to a slow breath (≈ 4 s in / 6 s out, i.e. 0.1 Hz),
   which the sessions already carry as a sub-band. Beat events may *tint* or *push* the
   anchor; they must not add objects.
3. **Peripheral richness, central calm.** Detail lives at the edges and in the far layer; the
   middle stays quiet so the gaze can settle (the classic meditation-video trick).
4. **No hard cuts, no strobes.** Every transition is a dissolve of ≥ 1.2 s. Flash budget stays
   under WCAG 2.3.1 by construction (one luminance step per second maximum).
5. **Each scene owns a distinct geometry**, not a variation of the last: veil, lattice, bloom,
   spiral, glass, deep field, current, horizon.

## The new set — eight scenes, eight geometries

Higgsfield plates give each one its far layer; a procedural near layer gives it life.

| # | Name | Far layer (generated) | Near layer (procedural) | Audio drive |
|---|------|----------------------|-------------------------|-------------|
| 1 | **Cathedral of Light** | vast nave, dust in shafts | slow god-rays sweeping on the breath; motes drift toward the light | sub = ray width |
| 2 | **Deep Field** | star field with a faint nebula | parallax star drift, one guiding star that breathes | slow centroid = depth |
| 3 | **Ink Bloom** | water surface, dark | ink plumes blooming at breath turns, dissolving over 20 s | air = bloom density |
| 4 | **Aurora Veil** | high cold sky | three curtain passes at different depths, edges feathered | mid = curtain thickness |
| 5 | **Ember Lattice** | dark workshop air | a slow lattice of embers connecting and breaking | level = ember count |
| 6 | **Rain on Glass** | night window, bokeh | drops that gather, merge and slide; refracted light behind | air = drop rate |
| 7 | **Slow Spiral** | deep gradient void | one logarithmic spiral rotating at 0.02 rad/s, dust in its arms | beat = arm brightness |
| 8 | **Bioluminescent Drift** | dark water column | plankton pulses travelling as waves, never repeating | iso gate = pulse wave |

Each scene ships with a **still** (for reduced-motion and for the preview chip) rendered from
the same plate, so the picker can show what you are choosing.

## Architecture (how it lands without touching the chamber)

- New page module `vizscenes.js`, loaded after `vizmodes.js`: a `SCENES` table (id, name,
  blurb, plate files, palette, drive map) and a `Scene` renderer that owns **three canvas
  layers** in one host: `far` (plate, transformed for parallax), `mid` (plate detail or
  procedural wash), `near` (the anchor + accents).
- The existing ambient visualiser keeps working untouched; the focus view chooses a *scene*
  instead of a *preset*. Preset ids stay valid so nothing breaks (scene ids are prefixed
  `focus-`).
- Parallax is one transform per layer, driven by (a) a slow time drift and (b) a shallow
  pointer offset — the shell already has `#rsFsBg` doing exactly this for two plates; the
  scene renderer generalises it to three layers and gives the near layer its own motion.
- Reduced motion: the still + a single 8 s cross-dissolve, no drift.

## Assets (Higgsfield)

- 8 scenes × 2 plates (far + mid) = **16 images**, 16:9, 1k, high: **≈ 56 credits**
  (measured at 3.5 credits each today), plus 8 stills derived locally from the plates (0 credits).
- Target ≤ 40 KB per plate as WebP q80 at 1280 px → **≤ 640 KB added to the APK**.
- Prompt discipline that worked for the two atmosphere plates: "extremely subtle", "very low
  contrast", "no bright hotspots", "leaves the middle calm", "no text, no objects, no figures"
  — plus one sentence of scene-specific art direction per scene.

## Gates for the pass

1. `tools/shim_harness.py`: one leg per scene — applies it, samples the canvas at 1:1 twice
   900 ms apart, asserts **lit pixels > 0** and **delta > threshold** (the two numbers that
   caught the dead drift/ripples), plus a leg that every scene's still exists.
2. A **similarity leg**: hash a 32×32 luminance grid of each scene and assert no two scenes
   are within a tight distance — this is the leg that would have caught "they all look the
   same", and it is the point of the redesign.
3. Contrast 0; tablet 82/0; eslint 0; lint/JVM; device gate 19/0; then a 1:1 crop of every
   scene for the owner's eye.
4. Flash budget: assert no scene changes mean luminance by more than one step per second
   (extend the existing motion-guard probe).

## Cost and shape of the pass

- Assets: ~56 credits (balance 2,668 at the time of writing).
- Work: one focused session — the renderer is ~400 lines, the scene table is data, the gates
  are mechanical. Not a rewrite of `vizmodes.js`; the old presets stay available until the
  new set is signed off, then they are hidden from the picker (kept in code, one flag).

## Decisions taken (do not re-litigate in the build)

- Scenes are **not** cymatic; no plate/sand/mode language in the focus view.
- The near layer is **procedural**, not generated video — it has to react to the session and
  survive a 44 px-wide thumbnail.
- The picker shows a **still + a one-line blurb** per scene, not just a name.
- Old presets remain reachable behind `focusLegacy` until the owner signs off.

---

# BUILD NOTES (2026-11-08, the pass that landed)

## What shipped

- `app/vizscenes.js` — the eight scenes, a `SCENES` table plus a `Scene` renderer with
  `create / reset / stepInst / drawInst`, loaded after `vizmodes.js`. Scene ids are
  `focus-*`; the 24 ambient presets are untouched and still valid.
- `viz.js` learned one pref (`scene`) and one branch: when a scene is set it steps and
  draws that, otherwise the old backdrop/overlay path runs. `applyPreset(id)` routes a
  scene id to `applyScene`, so the whole existing API keeps working. Switching looks is
  a 1.2 s snapshot dissolve (`dissolve()`), never a cut.
- The focus picker is now one card per scene (still + name + blurb). The 24 old presets
  stay reachable behind **Show the old presets** (`prefs.focusLegacy`, default off) until
  the owner signs the new set off.
- Reduced motion draws the shipped still, cross-dissolved over 1.2 s when the scene
  changes; no drift, no particles, no timers.

## Assets (measured)

- **8 plates, not 16**: one 1280x720 WebP q80 per scene, 143 KB total (7-50 KB each),
  generated with `gpt_image_2` at 16:9 / 1k / high, 3.5 credits each = **28 credits**
  (balance before 2660.53). The mid layer is derived locally from the far plate (a 72 px
  downscale drawn back up, at a different zoom and a faster, opposite drift). That is the
  same physical depth stack the second plate would have drawn, costs nothing, and keeps
  the two planes coherent. Total spent on assets: 28 credits, half the 56 budgeted.
- **8 stills** rendered by the live renderer itself (`tools/scene_stills.py`, 480x1039,
  WebP q76, ~3-9 KB each, 48 KB total). Not cut from the plates: a still of the actual
  frame is what the picker promises and what reduced motion needs.
- Total added to the APK: ~191 KB before compression.

## The similarity gate (the leg that matters)

`tools/scene_stills.py --check` and a matching harness leg both build a 32x32 luminance
grid per scene from the *live* canvas and compute **1 - Pearson correlation** (structure
distance) plus a 992-bit dHash. Thresholds: **struct >= 0.15**, **dHash >= 250**, no still
under mean 8.

Measured on the shipped stills: closest pair **aurora / spiral at 0.250**, dHash 423 — a
66 % margin on structure. Every scene lights 969-1024 of 1024 grid cells, and every scene
moves over 1.6 s at 1:1 (grid delta 0.00102 ember … 0.03083 rain) against a 0.0004 floor.

The gate was proved able to fail: copying `ember-still.webp` over `spiral-still.webp`
turns it red (`--check` exit 1), then the file was restored.

## Deviations from the brief, each for a reason

1. **8 plates instead of 16** — see above (28 credits saved, better parallax coherence).
2. **Three layers, one canvas** — the far plate, the mid wash and the near art are three
   draw passes with their own transforms, not three intermediate canvases. Three
   full-screen buffers would cost three extra composites per frame for identical pixels
   on a phone.
3. **Stills are rendered, not derived from plates** — a plate is the air, the scene is
   the frame; the picker and reduced motion must show the latter.
4. **The picker is cards, not chips** — a still and a blurb per scene was in the brief;
   chips cannot carry either.

## Gates run on these bytes

`py -3.11 tools/shim_harness.py` (all checks, including the eight scene legs, the still
decode leg, the legacy-flag leg, the structure gate and the reduced-motion leg),
`tools/scene_stills.py --check`, then contrast / tablet / eslint / lintRelease /
testUnitTests, then the signed release build.
