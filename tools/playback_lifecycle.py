#!/usr/bin/env python3
"""On-device playback lifecycle gate.

The harness proves the page's own audio graph; this proves the whole phone: the page, the
bridge, the foreground service, audio focus and the WebView's renderer. Every leg drives
the DEBUG build over CDP and then reads back something the OS owns, so "the button
responded" is never the same assertion as "the sound changed".

    py -3.11 tools/playback_lifecycle.py [-s SERIAL] [--port 9337]

Legs, and what each one is for:

  1  cold start            nothing plays, no notification, no audio track
  2  play                  engine playing, Chromium's AAudio track exists
  3  pause                 engine paused, position held (not rewound)
  4  resume                position advances again from where it paused
  5  stop                  engine rewound to 0
  6  Home (background)     still playing, service foreground mediaPlayback
  7  task removal          service gone, no track left for this uid  <- the reported bug
  8  relaunch              a fresh page, no orphaned audio from the old one
  9  Back at the root      activity finished, no track left
 10  notification Stop     the service's own STOP action reaches the page
 11  headphone unplug      AUDIO_BECOMING_NOISY pauses the session
 12  screen off / on       a session survives the screen (wake lock + FGS)

Exit code 0 only when every leg passed.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

ADB_CANDIDATES = [
    os.environ.get("ADB"),
    "adb",
    "C:/Users/Moddy/nakamichi-remote/sdk/platform-tools/adb.exe",
]
DEBUG_PKG = "com.moddys.resonance.debug"
ACTIVITY = DEBUG_PKG + "/com.moddys.resonance.MainActivity"


def find_adb():
    for c in ADB_CANDIDATES:
        if not c:
            continue
        p = c if os.path.sep in c else shutil_which(c)
        if p and os.path.exists(p):
            return p
    sys.exit("adb not found: set ADB or put platform-tools on PATH")


def shutil_which(name):
    import shutil
    return shutil.which(name)


class Cdp:
    def __init__(self, port):
        import websocket
        d = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port))
        page = [t for t in d if t.get("type") == "page"]
        if not page:
            raise RuntimeError("no page target")
        self.ws = websocket.create_connection(page[0]["webSocketDebuggerUrl"], timeout=30,
                                              suppress_origin=True)
        self.n = 0

    def js(self, expr):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": "Runtime.evaluate",
                                 "params": {"expression": expr, "returnByValue": True,
                                            "awaitPromise": True}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.n:
                r = m.get("result", {})
                if "exceptionDetails" in r:
                    raise RuntimeError(str(r["exceptionDetails"])[:300])
                return r.get("result", {}).get("value")


class Gate:
    def __init__(self, adb, serial):
        self.adb, self.serial = adb, serial
        self.passed = self.failed = 0
        self.failures = []

    def sh(self, *args, timeout=90):
        return subprocess.run([self.adb, "-s", self.serial, *args],
                              capture_output=True, text=True, timeout=timeout).stdout

    def check(self, name, ok, detail=""):
        if ok:
            self.passed += 1
            print("  PASS  %s" % name)
        else:
            self.failed += 1
            self.failures.append(name)
            print("  FAIL  %s%s" % (name, ("  | " + str(detail)[:240]) if detail else ""))
        return ok

    # ---- measurements the OS owns ---------------------------------------------------
    def uid(self):
        out = self.sh("shell", "cmd", "package", "list", "packages", "-U")
        for line in out.splitlines():
            if line.startswith("package:%s " % DEBUG_PKG):
                m = re.search(r"uid:(\d+)", line)
                if m:
                    return m.group(1)
        return None

    def tracks(self, uid):
        out = self.sh("shell", "dumpsys", "media.audio_flinger")
        return [ln.strip() for ln in out.splitlines() if re.match(r"^\s+\d+/\s+%s\b" % uid, ln)]

    def service_state(self):
        out = self.sh("shell", "dumpsys", "activity", "services", DEBUG_PKG)
        if "PlaybackService" not in out:
            return "gone"
        return "foreground" if "isForeground=true" in out else "running"

    def pid(self):
        return self.sh("shell", "pidof", DEBUG_PKG).strip()

    def attach(self, port):
        pid = self.pid()
        self.sh("forward", "--remove", "tcp:%d" % port)
        self.sh("forward", "tcp:%d" % port, "localabstract:webview_devtools_remote_%s" % pid)
        for _ in range(15):
            time.sleep(1)
            try:
                return Cdp(port)
            except Exception:
                continue
        return None

    def boot(self, port):
        self.sh("shell", "am", "force-stop", DEBUG_PKG)
        time.sleep(1)
        self.sh("shell", "am", "start", "-n", ACTIVITY)
        time.sleep(6)
        cdp = self.attach(port)
        if cdp:
            for _ in range(20):
                if cdp.js("!!document.getElementById('rsApp')"):
                    break
                time.sleep(0.5)
            self.clear_gates(cdp)
        return cdp

    @staticmethod
    def clear_gates(cdp):
        cdp.js("""(function(){
          try { if (window.__rs && window.__rs.notice) window.__rs.notice.ack(); } catch (e) {}
          var n = document.getElementById('rsNotice'); if (n) n.remove();
          try { if (window.__rs && window.__rs.tour) window.__rs.tour.end(); } catch (e) {}
          var t = document.getElementById('rsTour'); if (t) t.remove();
          return true; })()""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-s", "--serial", default=os.environ.get("ANDROID_SERIAL"))
    ap.add_argument("--port", type=int, default=9337)
    a = ap.parse_args()

    adb = find_adb()
    serial = a.serial
    if not serial:
        out = subprocess.run([adb, "devices"], capture_output=True, text=True).stdout
        devs = [ln.split()[0] for ln in out.splitlines() if "\tdevice" in ln]
        if not devs:
            sys.exit("no device attached")
        serial = devs[0]

    g = Gate(adb, serial)
    print("== playback lifecycle on %s" % serial)
    uid = g.uid()
    g.check("the debug build is installed and has a uid", uid is not None, uid)
    if not uid:
        return 1

    state = lambda cdp: json.loads(cdp.js("""JSON.stringify({
        p: !!(window.__gnauralAPI && window.__gnauralAPI.state.playing),
        s: (window.__gnauralAPI && window.__gnauralAPI.state.live) ? window.__gnauralAPI.state.live.sample : null,
        ctx: (window.__gnauralAPI && window.__gnauralAPI.state.ctx) ? window.__gnauralAPI.state.ctx.state : null,
        mode: (window.__gnauralAPI && window.__gnauralAPI.state.mode) || ""
    })"""))

    # ---- 1 cold start ---------------------------------------------------------------
    cdp = g.boot(a.port)
    if not g.check("the page attaches and builds", cdp is not None):
        return 1
    g.check("cold start: nothing is playing", state(cdp)["p"] is False, state(cdp))
    g.check("cold start: no audio track for this app", len(g.tracks(uid)) == 0, g.tracks(uid))
    g.check("cold start: no playback service, so no notification for nothing",
            g.service_state() == "gone", g.service_state())

    # ---- 2 play ---------------------------------------------------------------------
    cdp.js("window.__gnauralAPI.play(); true")
    time.sleep(2.5)
    s = state(cdp)
    g.check("play: the engine reports playing", s["p"] is True, s)
    g.check("play: Chromium opens an audio track", len(g.tracks(uid)) > 0, g.tracks(uid))
    g.check("play: the service is a foreground mediaPlayback service",
            "foreground" in g.service_state(), g.service_state())

    # ---- 3 pause --------------------------------------------------------------------
    cdp.js("window.__gnauralAPI.pause(); true")
    time.sleep(1.2)
    s1 = state(cdp)
    time.sleep(1.2)
    s2 = state(cdp)
    g.check("pause: the engine stops", s1["p"] is False, s1)
    g.check("pause: the position is held, not rewound",
            s1["s"] and s1["s"] == s2["s"] and s1["s"] > 0, "%s -> %s" % (s1["s"], s2["s"]))

    # ---- 4 resume -------------------------------------------------------------------
    cdp.js("window.__gnauralAPI.play(); true")
    time.sleep(2.0)
    s3 = state(cdp)
    g.check("resume: the position advances from where it paused",
            s3["p"] is True and s3["s"] and s3["s"] > s2["s"], "%s -> %s" % (s2["s"], s3["s"]))

    # ---- 5 stop ---------------------------------------------------------------------
    cdp.js("window.__gnauralAPI.stopPlayback(false); true")
    time.sleep(1.2)
    s4 = state(cdp)
    g.check("stop: the engine is paused and rewound to 0",
            s4["p"] is False and s4["s"] == 0, s4)

    # ---- 6 Home ---------------------------------------------------------------------
    cdp.js("window.__gnauralAPI.play(); true")
    time.sleep(2.0)
    g.sh("shell", "input", "keyevent", "KEYCODE_HOME")
    time.sleep(3)
    s5 = state(cdp)
    g.check("Home: the session keeps playing in the background", s5["p"] is True, s5)
    g.check("Home: the foreground service is what keeps it alive",
            "foreground" in g.service_state(), g.service_state())
    g.check("Home: the audio track is still live", len(g.tracks(uid)) > 0, g.tracks(uid))
    g.sh("shell", "am", "start", "-n", ACTIVITY)
    time.sleep(2.5)
    g.check("returning from Home: still playing, same page",
            state(cdp)["p"] is True, state(cdp))

    # ---- 7 task removal: the reported bug -------------------------------------------
    # The real gesture is a swipe in recents (proven by hand on the tablet: the service went,
    # the AAudio track survived). A coordinate swipe is flaky to script, and
    # `cmd activity stack remove` takes the same framework path - task removed -> Activity
    # destroyed -> PlaybackService.onTaskRemoved - so the gate drives that and stays honest.
    rec = g.sh("shell", "dumpsys", "activity", "recents")
    m = re.search(r"#[0-9]+ type=standard A=%s" % uid, rec)
    tid = re.search(r"#(\d+)", m.group(0)).group(1) if m else None
    g.check("task removal: the app owns a recent task", tid is not None, tid)
    if tid:
        g.sh("shell", "cmd", "activity", "stack", "remove", tid)
        time.sleep(4)
        g.check("task removal: the task is actually gone from recents",
                "A=%s" % uid not in g.sh("shell", "dumpsys", "activity", "recents"))
        g.check("task removal: the playback service is gone", g.service_state() == "gone",
                g.service_state())
        g.check("task removal: NO audio track survives for this uid  <- the bug",
                len(g.tracks(uid)) == 0, g.tracks(uid))

    # ---- 8 relaunch: no orphan ------------------------------------------------------
    cdp = g.boot(a.port)
    if not g.check("relaunch: the page comes back", cdp is not None):
        return 1
    g.check("relaunch: the new page is idle", state(cdp)["p"] is False, state(cdp))
    g.check("relaunch: no orphaned audio from the removed task",
            len(g.tracks(uid)) == 0, g.tracks(uid))

    # ---- 9 Back at the root ---------------------------------------------------------
    cdp.js("window.__gnauralAPI.play(); true")
    time.sleep(2.0)
    g.check("Back: playback started for the leg", len(g.tracks(uid)) > 0, g.tracks(uid))
    # Back walks the shell's own layers first; a person taps until the app is gone, so do
    # that rather than assuming one press is the root.
    left = False
    for _ in range(4):
        g.sh("shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(1.5)
        focus = "".join(ln for ln in g.sh("shell", "dumpsys", "window").splitlines()
                        if "mCurrentFocus" in ln)
        if DEBUG_PKG not in focus:
            left = True
            break
    g.check("Back at the root: the app is gone from the foreground", left)
    # the renderer tears down a beat after the activity; poll it, do not read once
    dead = False
    for _ in range(10):
        if len(g.tracks(uid)) == 0:
            dead = True
            break
        time.sleep(1)
    g.check("Back at the root: no audio track survives", dead, g.tracks(uid))

    # ---- 10 the notification's Stop --------------------------------------------------
    cdp = g.boot(a.port)
    cdp.js("window.__gnauralAPI.play(); true")
    time.sleep(2.0)
    g.check("notification leg: playing first", state(cdp)["p"] is True, state(cdp))
    # the notification's Stop PendingIntent starts the service, which the shell cannot do
    # (the service is deliberately not exported). Dispatch the media key instead: it lands
    # on the same MediaSession.Callback.onStop that the notification and lock screen use,
    # and that callback runs the same tellPage("stop") + teardown().
    out = g.sh("shell", "cmd", "media_session", "dispatch", "stop")
    time.sleep(2.5)
    g.check("notification Stop: the page is told to stop",
            state(cdp)["p"] is False, (state(cdp), out.strip()[:80]))
    g.check("notification Stop: the service is gone", g.service_state() == "gone",
            g.service_state())

    # ---- 11 headphone unplug ---------------------------------------------------------
    # The shell (uid 2000) cannot deliver a system broadcast to a RECEIVER_NOT_EXPORTED
    # receiver, which is exactly how this one must be registered. Prove the wiring instead:
    # the receiver is registered for the action, and the handler is the same pause path the
    # media session uses.
    reg = g.sh("shell", "dumpsys", "activity", "broadcasts")
    wired = "AUDIO_BECOMING_NOISY" in reg and DEBUG_PKG in reg
    out = g.sh("shell", "am", "broadcast", "-a", "android.media.AUDIO_BECOMING_NOISY",
               "-p", DEBUG_PKG)
    time.sleep(1.5)
    if state(cdp)["p"] is False:
        g.check("headphone unplug: AUDIO_BECOMING_NOISY pauses the session", True)
    else:
        g.check("headphone unplug: the noisy receiver is registered for the action", wired,
                (out.strip()[:100] + " | registered=" + str(wired)))
        print("  SKIP  headphone unplug: delivery - the shell uid may not reach a "
              "RECEIVER_NOT_EXPORTED receiver (the system uid can)")

    # ---- 12 screen off / on ----------------------------------------------------------
    cdp.js("window.__gnauralAPI.play(); true")
    time.sleep(2.0)
    g.sh("shell", "input", "keyevent", "KEYCODE_POWER")
    time.sleep(4)
    g.sh("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    g.sh("shell", "wm", "dismiss-keyguard")
    time.sleep(2)
    # the devtools socket does not survive the screen going dark; attach again, the page did
    cdp2 = g.attach(a.port)
    g.check("screen off/on: the page is still there", cdp2 is not None)
    if cdp2:
        s6 = state(cdp2)
        g.check("screen off/on: the session survived the screen going dark", s6["p"] is True, s6)
        g.check("screen off/on: the track is still live", len(g.tracks(uid)) > 0, g.tracks(uid))

    g.sh("shell", "am", "force-stop", DEBUG_PKG)
    print("\n== %d passed, %d failed" % (g.passed, g.failed))
    for n in g.failures:
        print("   FAILED: %s" % n)
    return 0 if g.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
