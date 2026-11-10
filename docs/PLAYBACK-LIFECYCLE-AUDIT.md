# Playback lifecycle audit — every play/stop/leave path, phone and tablet

Owner's report (2026-11-11):

1. sound kept playing after the Stop key was pressed, when the sound had been started from
   somewhere in the focus/visualiser surface;
2. sound kept playing after shutting the app down and clearing it from the running apps, and
   the phone needed a restart to stop it.

Both are real and they have one mechanism. This document is the full scenario sweep, what was
wrong, what changed, and how each path is now proven.

---

## 1. The mechanism

The page synthesises the audio itself (Web Audio → an `AudioWorkletNode` → master gain →
`AudioContext.destination`). Android's shell never touches the sound; it forwards commands.

`MainActivity.onDestroy()` used to clear the page handle and nothing else. A WebView that is
merely **detached** — task swiped away, Back out of the app, activity destroyed — keeps its
renderer alive, and the renderer keeps the `AudioContext` running. Measured on the Tab A9+
(debug build, `uid 10327`, Chromium's AAudio output stream as AudioFlinger lists it):

| moment | process | playback service | AAudio track for this uid |
| --- | --- | --- | --- |
| idle | alive | none | **0 rows** |
| playing | alive | foreground | **1 row** (`2293/10324 2729 …`) |
| **after swiping the task away** | **alive** | **gone** | **1 row — still playing** |
| after `am force-stop` | gone | gone | 0 rows |

So the sound outlived the window, the notification and the service. Nothing on the phone could
reach it: a relaunched app builds a *new* page, and its Stop key can only stop its own engine.
That is the "Stop does nothing" report — the sound being heard belonged to a page with no UI.
Only killing the process (a reboot, or force-stop) ended it.

The second defect is a race in the page. `play()` boots the graph asynchronously (two
`fetch()`es plus `addModule`). A Stop issued during that boot set `playing = false`, and then
the boot's own `.then()` started the sound and set `playing = true` anyway. The harness leg
that now pins it fails on the old code with `{"p":true,"m":"worklet"}` after a stop.

Neither the focus view nor the chamber has an audio source of its own — `AudioContext` is
created in exactly one place (`app.js`). Whatever a tap in the focus view appeared to start
was the session, and what kept playing afterwards was the orphaned renderer.

---

## 2. What changed

| file | change |
| --- | --- |
| `MainActivity.java` | `onDestroy()` now calls `stopPageAudio()`: one last `__rs.hardStop()` (best effort), then the WebView is removed from the tree and **destroyed**. That unloads the page and closes its context. A `destroying` flag stops the page's farewell `state(false)` from resurrecting the service. |
| `PlaybackService.java` | `onTaskRemoved()` tells the page to stop **before** dropping focus/wake/notification. `live` is cleared at the start of `teardown()` and `onTaskRemoved()`, so the page's next 1 Hz state message cannot re-create the service as a zombie notification. `AUDIO_BECOMING_NOISY` (headphones out / Bluetooth away) now pauses. The notification's Play refuses to claim playing when there is no page to play. |
| `Bridge.state()` | refuses to start the service for a page that has never played (no more paused notification on every launch) and ignores calls while the activity is destroying. |
| `app.js` | play/pause take a ticket so a stop cancels a boot in flight; `hardStop()` pauses and closes the context; `pagehide` calls it; the async worklet boot abandons itself if the graph was closed underneath it (that was an uncaught `Overload resolution failed`). |
| `_shell_shim.js` | `window.__rs.hardStop()` for the host; `pageStop()` tells the service when the page API is not up yet. |
| `viz.js` | the analyser tap re-attaches when the context or node changes (a hard stop closes the context). |
| `AndroidManifest.xml` | `fontScale` joins `configChanges`, so changing the system font size mid-session no longer recreates the activity (which would stop the sound). |

**Deliberate behaviour, unchanged:** Home (backgrounding) keeps playing — the foreground
service and its notification are the way back. Stop still keeps a *paused* notification
(the way back to a paused session); an explicit Stop from the notification tears everything
down.

---

## 3. The scenario matrix

"Pinned" = the gate that proves it. H = harness (`tools/shim_harness.py`), L =
`tools/playback_lifecycle.py` (on glass, debug build), M = measured by hand on the Tab A9+.

### Starting sound

| # | trigger | expected | before | now | pinned |
| --- | --- | --- | --- | --- | --- |
| 1 | Play key (Home), Studio, mini player, focus bar, chamber, notification, media button | one engine, one graph, service foreground | ok | ok | L2, L3, L10 |
| 2 | Play then Stop within the boot window | silence wins | **sound started after the stop** | silence | H (fails on old code) |
| 3 | Play twice / Play then Pause quickly | no double graph, no restart | ok | ok (single ticket, one ctx) | H |
| 4 | Play with no notification permission | plays, asks once in context | ok | ok | — |
| 5 | Play on a cold page (no audio yet) | graph built on demand | ok | ok | L2 |

### Stopping / pausing

| # | trigger | expected | before | now | pinned |
| --- | --- | --- | --- | --- | --- |
| 6 | Stop key (any surface) | engine paused **and** rewound to 0 | ok | ok | H, L5, M |
| 7 | Pause key | position held, not rewound | ok | ok | L3 |
| 8 | Pause → Play | continues from the held position | ok | ok | L4 |
| 9 | Stop from the notification | page stops, service gone | **service came back as "paused"** (page tick re-started it) | service gone | L10 |
| 10 | Stop from the lock screen / media button | same path as 9 | same defect | fixed | L10 (media key dispatch) |
| 11 | Swipe the paused notification away | session ends | ok (delete intent) | ok | — |
| 12 | Session reaches its end | stops, notification goes to paused | ok | ok | — |

### Leaving the app

| # | trigger | expected | before | now | pinned |
| --- | --- | --- | --- | --- | --- |
| 13 | **Swipe the task out of recents** | sound stops, service gone, no track | **kept playing forever** | track gone | L7, M (real swipe) |
| 14 | **Clear all** in recents | same as 13 | **kept playing** | track gone | L7 (same framework path) |
| 15 | **Back out of the app** (root) | same as 13 | **kept playing** | track gone | L9, M |
| 16 | Relaunch after 13–15 | new page, no orphan audio | **old audio still playing, new Stop cannot reach it** | clean, no track | L8 |
| 17 | Force-stop (Settings) | process dies, silence | ok | ok | M |
| 18 | System destroys the activity for memory | sound stops (a session cannot outlive its page) | **kept playing** | stops | (same path as 13) |
| 19 | Renderer crash (`onRenderProcessGone`) | page rebuilt, service told "paused" not "playing" | rebuilt; service could still claim playing | service flips to paused on the new page's first state | — |

### Background / screen / other apps

| # | trigger | expected | before | now | pinned |
| --- | --- | --- | --- | --- | --- |
| 20 | Home / app switch | keeps playing, notification is the way back | ok | ok | L6 |
| 21 | Return from Home | same page, still playing | ok | ok | L6 |
| 22 | Screen off for minutes | keeps playing (wake lock + FGS) | ok | ok | L12, M |
| 23 | Screen on / unlock | still playing | ok | ok | L12 |
| 24 | Incoming call / another app takes focus | paused, resumes on focus gain | ok | ok | — (existing focus listener) |
| 25 | Navigation prompt / transient focus loss | paused, resumes | ok | ok | — |
| 26 | Can-duck focus loss | ducked, restored | ok | ok | — |
| 27 | **Headphones unplugged / Bluetooth gone** | pause (media-app behaviour) | **kept playing out loud** | pauses | L11 (receiver registration; delivery not scriptable from the shell uid) |
| 28 | Volume keys / mute | system stream volume, engine untouched | ok | ok | — |
| 29 | Rotation | no interruption | ok (configChanges) | ok | — |
| 30 | System font size change | no interruption | **activity recreated → sound stopped** | no interruption | manifest |
| 31 | Split screen / multi-window | keeps playing while visible | ok | ok | — |
| 32 | OEM battery killer / "sleeping apps" | process death, silence | ok | ok | — |
| 33 | App update (`install -r`) | force-stop, silence | ok | ok | — |

### Visual surfaces (same engine, no second sound source)

| # | trigger | expected | verdict |
| --- | --- | --- | --- |
| 34 | Tap in the focus view / visualiser | no audio of its own; a tap only wakes the chrome | confirmed: `AudioContext` exists only in `app.js` |
| 35 | Open the chamber, play, close the chamber | session continues | ok |
| 36 | Studio meters / visualiser analyser | taps the same graph, silent sink (gain 0) | ok |

---

## 4. What can't be scripted, and what was checked by hand

- **Headphone unplug**: `AUDIO_BECOMING_NOISY` is a protected broadcast that must be received
  by a `RECEIVER_NOT_EXPORTED` receiver; the adb shell (uid 2000) may not deliver it. The gate
  proves the receiver is registered for the action; the handler is three lines on the same
  pause path the media session uses.
- **Audibility**: no Android dump distinguishes silence from sound on an open AAudio stream —
  Chromium keeps the track open for ~17 s after the engine goes quiet (measured). The gate
  therefore asserts the engine's own state (`playing`, `live.sample`, `ctx.state`) for
  stop/pause, and the OS track only for the leave-the-app paths, where "the track is still
  there after the page is gone" is precisely the bug.
- **The real gestures**: the swipe from recents and Back-at-root were both driven by hand on
  the tablet as well as by the gate, because a scripted swipe depends on the OEM recents layout.

---

## 5. Gates

```
py -3.11 tools/shim_harness.py            # 274 checks incl. the stop-during-boot race
py -3.11 tools/playback_lifecycle.py -s <serial>   # 33 checks on glass
```

`playback_lifecycle.py` needs the **debug** build (a release APK has no devtools socket).

Negative proof kept for the new harness legs: with `app.js` stashed, the boot-race leg fails
with `{"p":true,"m":"worklet"}` and `pagehide closes the audio graph` fails too.
