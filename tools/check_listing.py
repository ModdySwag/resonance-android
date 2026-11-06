#!/usr/bin/env python3
"""Check the Play listing copy against the console's hard limits and the asset set.

Fails when a field is over its limit, when a marker is missing, or when a required asset
is absent or the wrong size. Run before pasting anything into the console.
"""
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
OUT = os.path.join(PROJECT, "store")
LIMITS = {"name": 30, "short": 80, "full": 4000}
ASSETS = {"icon-512.png": (512, 512), "feature-1024x500.png": (1024, 500)}


def field(text, key):
    m = re.search(r"<!--%s-->(.*?)<!--/%s-->" % (key, key), text, re.S)
    return None if not m else m.group(1).strip()


def main():
    path = os.path.join(OUT, "listing.md")
    text = open(path, encoding="utf-8").read()
    bad = []
    for key, limit in LIMITS.items():
        value = field(text, key)
        if value is None:
            bad.append("%s: marker missing" % key)
            continue
        n = len(value)
        print("  %-6s %4d / %d" % (key, n, limit))
        if n > limit:
            bad.append("%s is %d over the %d limit" % (key, n - limit, limit))
        if n == 0:
            bad.append("%s is empty" % key)

    for name, size in ASSETS.items():
        p = os.path.join(OUT, name)
        if not os.path.exists(p):
            bad.append("%s: missing" % name)
            continue
        got = Image.open(p).size
        if got != size:
            bad.append("%s is %sx%s, needs %sx%s" % (name, got[0], got[1], size[0], size[1]))
        print("  asset %-22s %s" % (name, "ok"))

    shots = sorted(f for f in os.listdir(OUT) if re.match(r"^\d\d-.*\.png$", f))
    print("  shots  %d (Play wants 4-8)" % len(shots))
    if not 4 <= len(shots) <= 8:
        bad.append("need 4-8 phone screenshots, have %d" % len(shots))
    for f in shots:
        w, h = Image.open(os.path.join(OUT, f)).size
        if (w, h) != (1080, 1920):
            bad.append("%s is %sx%s, needs 1080x1920" % (f, w, h))

    if bad:
        print("\n".join("FAIL " + b for b in bad))
        return 1
    print("listing ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
