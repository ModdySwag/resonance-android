# RESUME HERE — Resonance Studio Android, 2.0.5-beta, 2026-11-07

Read this whole block before touching anything. The tree is clean at **1b0a765**; nothing
is pushed anywhere.

## STATE

- `C:\Users\Moddy\resonance-android`, branch `main`, HEAD `1b0a765`, **tree clean**.
- Version `2.0.5-beta`, `versionCode 12`, `targetSdk 35`, `compileSdk 35`.
- **Installed on Moddy's phone** (`ZY22LGC75T`, motorola edge 60 fusion) as a signed release
  and on the emulator (`emulator-5554`) as debug.
- Release signing: `C:\Users\Moddy\keystores\resonance-release.p12`, alias `resonance`,
  password in `resonance-release-credentials.txt` beside it. Cert `08:B8:…:F2:1B6`.
- Build: `JAVA_HOME=C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot`, Gradle at
  `C:\Users\Moddy\tools\gradle-8.7`. SDK at `C:\Users\Moddy\nakamichi-remote\sdk`
  (platform 35 + build-tools 35 now installed; the API-30 system image was re-downloaded).

## WHAT THIS APP IS NOW

A Material 3 rebuild of the Resonance Android shell. Five destinations (Home, Sessions,
Studio, Visualise, Settings), a deterministic Visualise section bound to the session, five
calm accent themes, dark/light, edge-to-edge with real insets, predictive back. The page's
own cards are MOVED into the screens and `window.__gnauralAPI` is still the only source of
truth.

## SHIPPED THIS SESSION (all committed)

- The whole 2.0 rebuild (`4de3227` and the passes after it).
- Device fixes: real window insets pushed to CSS vars, gap fallbacks, no card-in-card.
- Review passes: blank FAB, grey primary CTA, unlabelled entries, tile matching, contrast.
- Chamber: insets, Back, Stop, tempo, ? popover, tidy action row, tempo moved to the panel.
- Sessions: module rails (Continue / favourites / short / Sleep / Focus / speaker-friendly)
  above the authoritative list.
- Studio: stats strip, one open module, folded Live tools + Files.
- Five accent themes with a contrast sweep across all of them (0 failures).
- Play pack in `store/` + `tools/play_assets.py`, `tools/check_listing.py`, `tools/make_icons.py`.
- Harness `tools/shim_harness.py`: **73/73**. Contrast: **0**.

## OPEN — in the order to take them

1. **Owner eye** on the chamber row, the module rails, the Studio fold and the five themes.
   Cut any rail or stat that does not earn its place — he said he would tell you which.
2. **The schedule graph** is still the page's own chart on a dark inset; its labels are drawn
   into the canvas at 11 px. Taking the chart over (our own renderer reading the schedule) is
   the last real "web page" tell.
3. **Chamber tempo resets to 1× on a new session** — decide whether it should persist.
4. **Minor review leftovers:** duplicate "Voices" wording on Studio, vis readout run-on.
5. **Play submission:** deploy `store/privacy.html` to `moddys.net/resonance/privacy/` first
   (Moddy must review a deploy), then icon/feature/screenshots/listing/data-safety.
6. **Push** the branch and cut `v2.0.5-beta` only after his review of the release copy.

## TRAPS (paid for this session)

- Two ADB devices are attached: **always pass `-s <serial>`** or every command fails with
  "more than one device".
- After install/reinstall the WebView devtools socket changes: re-read
  `/proc/net/unix | grep webview_devtools_remote`, re-`adb forward`, retry once.
- `env(safe-area-inset-*)` is **0** in this WebView — insets come from `OnApplyWindowInsets`
  into `--rs-safe-t` / `--rs-safe-b`. Keep `var(--rs-safe-x, env(...))`.
- `font: 600 11px/1 inherit` is invalid CSS; use `var(--rs-sans)`.
- The page's tokens bleed: override `--ink/--panel/--bg/--bg2` on `.rs-screen`; a display
  canvas (the graph) re-declares the dark values.
- Octal escapes in CSS strings break strict mode (`\2039`) — write `\u2039`.
- `write_file` refuses files in `cache/` it has not read — `rm` first or use `patch`.
- Gradle/ADB are native: pass `C:/...` paths, not `/c/...`.

## FIRST THREE MOVES

1. `git log --oneline -3` and `git status` — confirm `1b0a765`, clean.
2. `py -3.11 tools/shim_harness.py` (expect 73/73) and `py -3.11 cache/contrast.py` (expect 0).
3. Rebuild + install on `ZY22LGC75T` with the release key, then take his eye notes.
