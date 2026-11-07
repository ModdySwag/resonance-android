#!/usr/bin/env python3
"""On-device gate for Resonance Studio Android.

The Chromium harness (tools/shim_harness.py) proves the shell against a stubbed bridge.
This proves the other half: the real app, its real WebView, its real bridge, on glass.
It drives the DEBUG build over CDP, taps the controls a person taps, and reads the
engine's own state back - so "the button responded" and "the engine changed" are two
separate assertions, not one inference from a screenshot.

    py -3.11 tools/device_gate.py [-s SERIAL] [--port 9337] [--shots DIR]

Needs the debug build installed (com.moddys.resonance.debug): a release APK has no
devtools socket, by design. Exit code 0 only when every check passed.

Why this exists: the harness cannot see the bridge, the foreground service or the real
compositor, and several bugs have only ever appeared there.
"""
import argparse
import json
import os
import shutil
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
        p = c if os.path.sep in c else shutil.which(c)
        if p and os.path.exists(p):
            return p
    sys.exit("adb not found: set ADB or put platform-tools on PATH")


class Gate:
    def __init__(self, adb, serial, shots):
        self.adb, self.serial, self.shots = adb, serial, shots
        self.passed = self.failed = 0
        self.failures = []

    def sh(self, args, timeout=60):
        return subprocess.run([self.adb, "-s", self.serial, *args],
                              capture_output=True, text=True, timeout=timeout)

    def check(self, name, ok, detail=""):
        if ok:
            self.passed += 1
            print("  PASS  %s" % name)
        else:
            self.failed += 1
            self.failures.append(name)
            print("  FAIL  %s%s" % (name, ("  | " + str(detail)) if detail else ""))
        return ok

    def shot(self, name):
        try:
            with open(os.path.join(self.shots, name), "wb") as f:
                f.write(self.sh(("exec-out", "screencap", "-p")).stdout
                        if False else subprocess.run(
                            [self.adb, "-s", self.serial, "exec-out", "screencap", "-p"],
                            capture_output=True).stdout)
        except Exception as e:
            print("  (screenshot failed: %s)" % e)


class Cdp:
    def __init__(self, port):
        import websocket
        self.ws = websocket.create_connection(self._url(port), timeout=30,
                                              suppress_origin=True)
        self.n = 0

    @staticmethod
    def _url(port):
        d = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port))
        for t in d:
            if t.get("type") == "page":
                return t["webSocketDebuggerUrl"]
        raise RuntimeError("no page target on the forwarded port")

    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.n:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m.get("result", {})

    def js(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(str(r["exceptionDetails"])[:300])
        return r["result"].get("value")

    def touch(self, x, y):
        for kind in ("touchStart", "touchEnd"):
            self.call("Input.dispatchTouchEvent", type=kind,
                      touchPoints=[{"x": x, "y": y, "id": 0}] if kind == "touchStart" else [])
        time.sleep(0.6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-s", "--serial", default=os.environ.get("ANDROID_SERIAL"))
    ap.add_argument("--port", type=int, default=9337)
    ap.add_argument("--shots", default=os.path.join("cache", "device-gate"))
    a = ap.parse_args()
    os.makedirs(a.shots, exist_ok=True)

    adb = find_adb()
    g = Gate(adb, a.serial, a.shots)

    if not a.serial:
        out = subprocess.run([adb, "devices"], capture_output=True, text=True).stdout
        devs = [ln.split()[0] for ln in out.splitlines()[1:] if "\tdevice" in ln]
        if not devs:
            sys.exit("no device attached")
        g.serial = devs[0]
    print("== on-device gate: %s" % g.serial)

    # ---- launch -------------------------------------------------------------------
    g.sh(("shell", "am", "force-stop", DEBUG_PKG))
    g.sh(("logcat", "-c", "-b", "crash"))
    start = g.sh(("shell", "am", "start", "-W", "-n", ACTIVITY))
    g.check("the app starts", "Status: ok" in start.stdout, start.stdout.strip()[:120])

    pid = g.sh(("shell", "pidof", DEBUG_PKG)).stdout.strip()
    g.check("the process is alive", bool(pid), pid)

    port_ok = False
    for _ in range(20):
        time.sleep(1)
        if "webview_devtools_remote" in g.sh(("shell", "cat", "/proc/net/unix")).stdout:
            port_ok = True
            break
    g.check("the WebView exposes a devtools socket (debug build)", port_ok)
    if not port_ok:
        print("  (a release APK has no socket - run the debug build for this gate)")
        g.shot("fail-no-socket.png")
        return finish(g, a)

    g.sh(("forward", "--remove", "tcp:%d" % a.port))
    fwd = g.sh(("forward", "tcp:%d" % a.port, "localabstract:webview_devtools_remote_%s" % pid))
    g.check("the devtools port forwards", fwd.returncode == 0, fwd.stderr.strip()[:120])

    cdp = None
    for _ in range(15):
        time.sleep(1)
        try:
            cdp = Cdp(a.port)
            break
        except Exception:
            continue
    if not g.check("attaches over CDP", cdp is not None):
        g.shot("fail-cdp.png")
        return finish(g, a)

    built = False
    for _ in range(20):
        if cdp.js("!!document.getElementById('rsApp')"):
            built = True
            break
        time.sleep(0.5)
    g.check("the shell builds inside the real WebView", built)
    if not built:
        g.shot("fail-shell.png")
        return finish(g, a)

    # ---- the frame ----------------------------------------------------------------
    g.check("all five destinations are in the tab bar",
            cdp.js("document.querySelectorAll('#rsNav button').length") == 5)
    g.check("the page reports itself as an app",
            cdp.js("document.documentElement.classList.contains('rs-app')"))

    geo = cdp.js("""JSON.stringify(['rsPlay','rsStop','rsMute','rsVol'].map(function(id){
        var e=document.getElementById(id); if(!e) return [id,0,0];
        var r=e.getBoundingClientRect(); return [id,Math.round(r.width),Math.round(r.height)]; }))""")
    boxes = {k: (w, h) for k, w, h in json.loads(geo)}
    g.check("the transport is present", all(boxes.get(i, (0, 0))[0] > 0
                                            for i in ("rsPlay", "rsStop", "rsMute", "rsVol")), geo)
    tiny = [k for k, (w, h) in boxes.items() if 0 < min(w, h) < 44 and k != "rsVol"]
    g.check("every transport control meets the 44 px floor", not tiny, tiny)

    # ---- transport, driven and read back ------------------------------------------
    def state():
        return json.loads(cdp.js("""JSON.stringify({p:!!(window.__gnauralAPI&&window.__gnauralAPI.state.playing),
            s:(window.__gnauralAPI&&window.__gnauralAPI.state.live)?window.__gnauralAPI.state.live.sample:null,
            m:document.getElementById('master').value})"""))

    def tap(sel):
        r = json.loads(cdp.js("(function(){var e=document.querySelector(%r);var b=e.getBoundingClientRect();"
                              "return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2});})()" % sel))
        cdp.touch(r["x"], r["y"])

    before = state()
    tap("#rsPlay")
    playing = state()
    g.check("Play starts the engine", playing["p"] and not before["p"],
            "%s -> %s" % (before["p"], playing["p"]))
    tap("#rsPlay")
    paused = state()
    g.check("the same control pauses", not paused["p"] and paused["s"] > 0,
            "sample kept at %s" % paused["s"])
    tap("#rsStop")
    stopped = state()
    g.check("Stop rewinds to zero", stopped["s"] == 0, "sample %s" % stopped["s"])

    # ---- level --------------------------------------------------------------------
    tap("#rsMute")
    muted = state()
    g.check("Mute silences the master", float(muted["m"]) < 0.001, muted["m"])
    tap("#rsMute")
    back = state()
    g.check("Mute restores the level it silenced", abs(float(back["m"]) - float(playing["m"])) < 0.02,
            "%s -> %s" % (muted["m"], back["m"]))
    g.shot("home.png")

    # ---- the persistent player ----------------------------------------------------
    cdp.js("document.documentElement.classList.remove('rs-navhide')")
    time.sleep(0.6)
    tap("#nav-sessions")
    time.sleep(0.8)
    g.check("the mini player appears off Home",
            cdp.js("document.getElementById('rsMini').classList.contains('rs-on')"))
    nvol = cdp.js("(function(){var e=document.getElementById('rsMiniVol');"
                  "return e?Math.round(e.getBoundingClientRect().width):0;})()")
    g.check("the mini player carries its own fader", (nvol or 0) > 40, "%s px" % nvol)
    g.shot("sessions.png")

    taps = cdp.js("(function(){var e=document.getElementById('rsMiniPlay');"
                  "return e?Math.round(e.getBoundingClientRect().width):0;})()")
    g.check("the mini player's transport is reachable", (taps or 0) >= 44, "%s px" % taps)

    crash = g.sh(("logcat", "-d", "-b", "crash")).stdout
    g.check("no crash was logged", "FATAL EXCEPTION" not in crash, crash.strip()[-160:])
    return finish(g, a)


def finish(g, a):
    print("\n== %d passed, %d failed" % (g.passed, g.failed))
    if g.failed:
        print("   FAILED: " + " | ".join(g.failures))
        print("   evidence in %s" % os.path.abspath(a.shots))
        return 1
    print("DEVICE GATE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
