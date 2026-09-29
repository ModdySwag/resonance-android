#!/usr/bin/env python3
"""Copy the Resonance Studio web app into the Android project's assets.

The app tree under webmusic-hub/site/resonance is the source of truth (it is byte-identical
to what moddys.net serves). This script copies the studio, its licence files and every pack
zip into app/src/main/assets/www/, then writes assets-manifest.json with a sha256 per file -
CI checks the manifest against the tree before every build, so a hand-edit in assets/ cannot
slip out unrecognised.

Usage:
    python tools/sync-assets.py                 # from the local site folder
    python tools/sync-assets.py --from-url      # from https://www.moddys.net/resonance/
    python tools/sync-assets.py --site DIR      # from somewhere else
    python tools/sync-assets.py --check         # report drift only, change nothing
"""
import argparse
import datetime
import glob
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
DEST = os.path.join(PROJECT, "app", "src", "main", "assets", "www")
MANIFEST = os.path.join(PROJECT, "assets-manifest.json")

# Every file the app bundles. app/pack/*.zip is globbed below - the in-app Pack
# downloads card saves those zips with no network, so all of them are shipped.
FILES = [
    "app/index.html", "app/studio.css", "app/app.js", "app/engine.js",
    "app/gnm.js", "app/presets.js", "app/packs.js", "app/rates.js",
    "app/pack.js", "app/studio.js", "app/vizmath.js", "app/vizpal.js",
    "app/vizmodes.js", "app/viz.js", "app/worklet-processor.js",
    "app/NOTICE.txt", "app/COPYING", "app/COPYING.LESSER",
    "site.css",
]

DEFAULT_SITES = [
    r"C:\Users\Moddy\webmusic-hub\site\resonance",
]
LIVE = "https://www.moddys.net/resonance/"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def bundle_list(site):
    """FILES plus every pack zip that exists in the source tree."""
    out = list(FILES)
    zips = sorted(os.path.basename(p) for p in glob.glob(os.path.join(site, "app", "pack", "*.zip")))
    out += ["app/pack/" + z for z in zips]
    return out


def find_site(explicit):
    if explicit:
        return explicit if os.path.isdir(explicit) else None
    for cand in DEFAULT_SITES:
        if os.path.isdir(cand) and os.path.isfile(os.path.join(cand, "app", "index.html")):
            return cand
    return None


def sanity(site, files):
    """The bundled index.html must load its scripts and styles from this bundle.

    Only loadable assets (.js/.css) are checked - the page's own links to help/,
    credits/ and ../ are real pages on moddys.net and are deliberately not bundled;
    the shell hands them to the phone's browser.
    """
    idx = os.path.join(site, "app", "index.html")
    html = open(idx, encoding="utf-8", errors="replace").read()
    ok = True
    refs = re.findall(r'(?:src|href)="([^"?#]+)(?:\?[^"]*)?"', html)
    for s in refs:
        if s.startswith(("data:", "http:", "https:", "#")):
            continue
        if not re.search(r"\.(js|css)$", s):
            continue                      # pages are not assets
        rel = os.path.normpath(os.path.join("app", s)).replace(os.sep, "/")
        if rel not in files:
            print(f"  WARNING: index.html references {rel} - not in the bundle list", file=sys.stderr)
            ok = False
    for want in ("studio.css", "app.js", "engine.js", "viz.js"):
        if want not in html:
            print(f"  WARNING: index.html no longer references {want}", file=sys.stderr)
            ok = False
    if "app/worklet-processor.js" not in files:
        print("  WARNING: worklet-processor.js is missing from the bundle (app.js fetches it)", file=sys.stderr)
        ok = False
    return ok


def from_url(files):
    os.makedirs(DEST, exist_ok=True)
    for rel in files:
        url = LIVE + rel
        out = os.path.join(DEST, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        print(f"  fetching {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "resonance-android sync-assets"})
        with urllib.request.urlopen(req, timeout=180) as r, open(out, "wb") as f:
            shutil.copyfileobj(r, f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-url", action="store_true", help="pull from moddys.net")
    ap.add_argument("--site", default=None, help="local site folder to copy from")
    ap.add_argument("--check", action="store_true", help="report only, change nothing")
    a = ap.parse_args()

    if a.from_url and a.check:
        files = bundle_list(DEST)
        drift = []
        for rel in files:
            out = os.path.join(DEST, rel.replace("/", os.sep))
            try:
                req = urllib.request.Request(LIVE + rel, headers={"User-Agent": "resonance-android sync-assets"})
                live = urllib.request.urlopen(req, timeout=60).read()
            except Exception as e:
                drift.append(f"{rel}: live fetch failed: {e}")
                continue
            local = open(out, "rb").read() if os.path.isfile(out) else b""
            if hashlib.sha256(local).hexdigest() != hashlib.sha256(live).hexdigest():
                drift.append(f"{rel}: differs from the live site")
        for d in drift:
            print("  DRIFT:", d)
        print(f"{len(files) - len(drift)}/{len(files)} files match the live site")
        return 1 if drift else 0

    if a.from_url:
        files = bundle_list(DEST)
        if not files:
            print("nothing bundled yet; run once from a local site folder first", file=sys.stderr)
            return 1
        print(f"syncing from {LIVE}")
        from_url(files)
        source = LIVE
    else:
        site = find_site(a.site)
        if not site:
            print("Could not find the site folder. Pass --site DIR or --from-url.", file=sys.stderr)
            return 1
        files = bundle_list(site)
        print(f"syncing from {site}")
        missing = [f for f in files if not os.path.isfile(os.path.join(site, f))]
        if missing:
            print("  missing in source: " + ", ".join(missing), file=sys.stderr)
            return 1

        if a.check:
            drift = []
            for rel in files:
                src = os.path.join(site, rel.replace("/", os.sep))
                dst = os.path.join(DEST, rel.replace("/", os.sep))
                if not os.path.isfile(dst):
                    drift.append(f"{rel}: not in assets")
                elif sha256(src) != sha256(dst):
                    drift.append(f"{rel}: assets copy differs from source")
            for d in drift:
                print("  DRIFT:", d)
            print(f"{len(files) - len(drift)}/{len(files)} files in sync")
            return 1 if drift else 0

        for rel in files:
            src = os.path.join(site, rel.replace("/", os.sep))
            dst = os.path.join(DEST, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
        print(f"  copied {len(files)} files")
        source = site
        sanity(site, files)

    man = {
        "source": source,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": {},
    }
    total = 0
    for rel in files:
        p = os.path.join(DEST, rel.replace("/", os.sep))
        if os.path.isfile(p):
            total += os.path.getsize(p)
            man["files"][rel] = sha256(p)
        else:
            print(f"  MISSING in assets: {rel}", file=sys.stderr)
            return 1
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        json.dump(man, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"\nassets: {len(files)} files, {total:,} B; manifest -> {os.path.relpath(MANIFEST, PROJECT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
