# Quality gates — what is measured, with what, and what is missing

Written 2026-11-07 after the pre-release audit. Every number in "Measured" was read from
this machine or the device in the same session, with its command shown. Items under "Missing"
are industry-standard for an Android app of this shape and are not currently run.

Rule for this file: a gate counts as covered only if a command exists in this repo, it runs
against the real artifact, and its threshold fails the build.

## Measured now

| Metric | Value | How |
|---|---|---|
| Release lint | **0 errors / 0 warnings** (was 3 errors / 11 warnings; fixed 2026-11-07 22:14) | `gradle :app:lintRelease` -> `app/build/reports/lint-results-release.xml` |
| APK size / download | **641,386 B / 631,080 B** (was 860,074 / 848,994 on 2026-11-07 22:14) | `apkanalyzer apk file-size` / `download-size` |
| Code size | 108 classes, 434 methods, 21,528 B method code | `apkanalyzer dex packages --defined-only` |
| Frames | 25,429 total, **90.4% janky**, p50 18 ms, p90 23 ms, p99 27 ms | `dumpsys gfxinfo com.moddys.resonance` |
| GPU | p50 4 ms, p90 6 ms — not the bottleneck | same |
| Memory (PSS) | 128,537 kB total; Java 26,480; native 12,972; **graphics 51,496** | `dumpsys meminfo com.moddys.resonance` |
| Java tests | **0** for 1,706 lines | `find app/src -path "*test*"` empty |
| StrictMode / LeakCanary | **not instrumented** | grep of `app/src/main/java` |
| WebView hardening | file+content access off, mixed content never, safe browsing on | MainActivity.java:188-210 |
| CSP | **absent** on the bundled page | assets/www/app/index.html has no meta |
| CI | debug APK on push, signed APK on tag — **no lint, no tests** | `.github/workflows/android.yml`, `release.yml` |
| Gradle wrapper | absent | no `gradlew` |
| R8 | minify + shrinkResources + optimize proguard, 9 keep lines | `app/build.gradle:42` |

## Size work done 2026-11-07 (measured)

APK 860,074 -> 641,386 B (-218,688, -25.4%). Download 848,994 -> 631,080 B.
Composition now: packs 250,266 (39.0%), ui images 180,410 (28.1%), js 129,607 (20.2%),
other 42,307 (6.6%), dex 21,030 (3.3%), res 3,347 (0.5%).

| Change | Saved | Verified by |
|---|---|---|
| Five accent knobs 512 -> 256 px (they paint at 68 CSS px / 102 device px; #play.big is 44 px) | 85,158 B | mean per-channel difference at display size 0.15/255 |
| Build-time terser on the release package (20 files; sources stay readable) | 66,124 B | harness re-run against the packaged tree: 183/183 |
| Density mipmap PNGs deleted (adaptive icon covers every density at minSdk 26) | 67,412 B | icon renders in the emulator app drawer; `aapt2 dump badging` -> res/BW.xml |

Things that bit: AAPT2 only compiles `<adaptive-icon>` in a `v26`-qualified folder, so the
`mipmap-anydpi-v26` name has to stay (scoped `ObsoleteSdkInt` ignore in `app/lint.xml`);
mutating AGP's merged assets does not reach packaging; and `apk_identity` had to assert on
mangling-safe markers (`ResonanceJs`, `__rs`) rather than `function native(`.

Remaining size, if it is ever worth it: the nine pack zips are 39% of the APK and are already
deflated - only shipping the default and fetching the rest on demand would move that.

## The two tools you asked about

**Dr. Memory** is a Windows x86/x64 memory checker built on DynamoRIO. It has no Android
target: it cannot attach to an ART process or a WebView renderer. Its Android equivalents are:

- ASan / HWASan — native heap and stack faults. Needs a debuggable native build; this app has
  no native libraries of its own (only Chromium's), so most of its value is already covered by
  the platform image.
- `libc` `malloc_debug` — native leak/corruption detection on a debuggable build.
- **heapprofd** (through Perfetto) — the real native-heap profiler for an unmodified release
  build. This is the closest thing to Dr. Memory that exists here.
- Android Studio Memory Profiler heap dumps + LeakCanary (JVM heap, activity leaks).
- StrictMode — leaked `Closeable`s, disk/network on the main thread.

**Visual Studio** has no role in a Gradle/AGP build. Roslyn analyzers are C#/.NET only. Its
Android equivalent is the Java/Kotlin static analysis stack:

- Android Lint — run, 3 errors open.
- **Error Prone** (javac plugin, Google) — real defect classes Lint does not model.
- SpotBugs / PMD / Checkstyle — bytecode and style defects.
- JaCoCo — coverage. Currently 0% because there are no tests.

## Missing, ranked by signal per hour

| # | Tool | What it would catch here | Effort |
|---|---|---|---|
| 1 | Error Prone | null derefs, ignored returns, `equals`/`hashCode`, thread-safety mistakes across 1,706 Java lines | ~30 min |
| 2 | JUnit 5 + Robolectric + JaCoCo | the JS layer has 183 checks; the Java layer has none. Also turns coverage from 0% into a number | ~3 h |
| 3 | StrictMode (debug) + LeakCanary | leaked receivers/streams — the audit already found one unregistered BroadcastReceiver and a file leak on export | ~45 min |
| 4 | Perfetto trace + `framestats` | why playback is 90% janky: UI thread 18 ms vs GPU 4 ms says main thread, not GPU | ~30 min |
| 5 | Baseline Profile + Macrobenchmark | startup and first-scroll; Play recommends it, it pins R8/profile rules at build time | ~2 h |
| 6 | ESLint + `tsc --checkJs` | 7,214 lines of JS (`_shell_shim.js` alone is 3,581) with no linter at all | ~1 h |
| 7 | apksigner verify --strict | v2-only signing, no v3 rotation — a real Play requirement | ~20 min |
| 8 | Gradle wrapper + CI lint/tests | the gate exists only on this machine; CI compiles but checks nothing | ~45 min |
| 9 | MobSF (Docker) | formal MASVS/MASTG pass instead of a hand-written security review; Docker is installed but the daemon is down | ~1 h |
| 10 | Semgrep | taint paths into `addJavascriptInterface`, intent handling | ~30 min |
| 11 | bundletool + AAB | Play needs an AAB, not an APK | ~30 min |
| 12 | Play Console pre-launch report | free real-device run inside Google's lab; needs an AAB and a Play account | external |
| 13 | Firebase Test Lab | device matrix (API 26-36, OEM skins); paid | external |
| 14 | batterystats / Energy Profiler | audio playback is the app's whole job; energy has never been measured | ~30 min |

## Already ahead of the industry norm

- A 183-check Playwright harness driving the real WebView page, not a mock.
- A contrast gate (0 low-contrast pairs) and a tablet geometry probe (82 checks).
- An APK identity gate (32 checks) run against the installed bytes.
- Zero third-party dependencies: 107 of 108 classes are the app's own.

## Order I would run them

1. Error Prone, because it finds real defects and costs 30 minutes.
2. Lint to zero: the 3 NewApi errors are one `@RequiresApi(33)` and two `values-v27` themes.
3. StrictMode + LeakCanary in debug.
4. JUnit + Robolectric + JaCoCo, starting with the ten tests in `docs/AUDIT-2026-11-07.md`.
5. Perfetto on playback, then the frame fix the trace points at.
6. Wrapper + CI so none of the above can rot.
