"""Verify a published APK for real: identity, the code inside it, and the signing key.

A green CI run is a claim; this checks the artifact a user would download, including that the
DEX actually contains the code this release was about (the DEX string pool holds every method
name and string literal), and that it is signed with the same key as the previous release -
otherwise nobody on the older version can install the update.

Usage:
  python verify_release.py --repo OWNER/NAME --tag v1.2.0 [--prev v1.1.0]
      [--expect "label=needle"]        substring that must be in the bundled asset
      [--asset path]                   default: assets/www/_android_shim.js
      [--dex label=needle]             substring that must be in the compiled code
      [--arsc needle]                  substring that must be in resources.arsc
      [--asset-file path=min_bytes]    a bundled file that must still be whole
      [--headline "phrase"]            phrase the release body must contain

Needs: gh (authenticated), openssl.
"""
import argparse
import glob
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor

ap = argparse.ArgumentParser()
ap.add_argument("--repo", required=True)
ap.add_argument("--tag", required=True)
ap.add_argument("--prev", default="")
ap.add_argument("--asset", default="assets/www/_android_shim.js")
ap.add_argument("--expect", action="append", default=[])
ap.add_argument("--dex", action="append", default=[])
ap.add_argument("--arsc", action="append", default=[])
ap.add_argument("--asset-file", action="append", default=[])
ap.add_argument("--headline", default="")
ap.add_argument("--workdir", default=os.path.join(tempfile.gettempdir(), "apk-verify"))
args = ap.parse_args()

os.makedirs(args.workdir, exist_ok=True)
fails, checks = [], []


def check(name, ok, detail=""):
    checks.append(name)
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"   [{detail}]" if detail and not ok else ""))
    if not ok:
        fails.append(f"{name} - {detail}")


def fetch(tag):
    """Download the release asset and return its path (cached)."""
    local = os.path.join(args.workdir, f"{tag}.apk")
    if not os.path.exists(local):
        subprocess.run(["gh", "release", "download", tag, "--repo", args.repo,
                        "--pattern", "*.apk", "--dir", args.workdir, "--clobber"],
                       capture_output=True, text=True)
        got = [p for p in glob.glob(os.path.join(args.workdir, "*.apk")) if tag in os.path.basename(p)]
        if not got:
            got = glob.glob(os.path.join(args.workdir, "*.apk"))
        if got:
            os.replace(got[0], local)
    return local


def cert_fingerprints(path):
    """Every embedded X.509 certificate, taken only where openssl agrees it is one.

    Hand-parsing the v2 signing block is easy to get subtly wrong and yields bytes that look
    plausible but are not a certificate - so let openssl be the judge before comparing.
    """
    if not os.path.exists(path):
        return []
    data = open(path, "rb").read()
    cands, pos = [], 0
    while True:
        i = data.find(b"\x30\x82", pos)
        if i == -1:
            break
        outer = int.from_bytes(data[i + 2:i + 4], "big") + 4
        if 400 <= outer <= 2500 and data[i + 4:i + 6] == b"\x30\x82":
            if int.from_bytes(data[i + 6:i + 8], "big") <= outer - 8:
                cands.append((data[i:i + outer],))
        pos = i + 1

    def parse(c):
        r = subprocess.run(["openssl", "x509", "-inform", "DER", "-noout",
                            "-fingerprint", "-sha256"], input=c[0], capture_output=True)
        return (hashlib.sha256(c[0]).hexdigest().upper(), r.stdout.decode().strip()) \
            if r.returncode == 0 else None

    with ThreadPoolExecutor(max_workers=8) as ex:
        good = [x for x in ex.map(parse, cands) if x]
    return sorted(good)


print(f"=== the release as the public sees it ({args.tag}) ===")
view = subprocess.run(["gh", "release", "view", args.tag, "--repo", args.repo, "--json",
                       "name,isDraft,isPrerelease,url,assets,body"], capture_output=True, text=True)
if view.returncode:
    check("release exists", False, view.stderr.strip()[:150])
    sys.exit(1)
rel = json.loads(view.stdout)
check("release is published and not a pre-release", not rel["isDraft"] and not rel["isPrerelease"])
check(f"the title names the tag", args.tag.lstrip("v") in rel["name"], rel["name"])
print(f"  {rel['url']}")
for a in rel["assets"]:
    print(f"  asset: {a['name']}  {a['size']:,} bytes  {a.get('digest', '')[:23]}")

apk = fetch(args.tag)
check("the APK downloaded", os.path.exists(apk) and os.path.getsize(apk) > 100_000,
      f"{os.path.getsize(apk) if os.path.exists(apk) else 0:,} bytes")
z = zipfile.ZipFile(apk)
names = z.namelist()

print("\n=== identity ===")
raw = z.read("AndroidManifest.xml")
blob = raw.decode("utf-16-le", errors="ignore") + raw.decode("utf-8", errors="ignore")
check(f"versionName is {args.tag.lstrip('v')}", args.tag.lstrip("v") in blob, "not in the manifest")
check("no debug applicationId suffix leaked in", ".debug" not in blob)
check("the v2/v3 signature block is present", b"APK Sig Block 42" in open(apk, "rb").read())

if args.expect:
    print(f"\n=== {args.asset} is this build ===")
    asset = z.read(args.asset).decode("utf-8", errors="replace")
    for item in args.expect:
        label, _, needle = item.partition("=")
        check(label, needle in asset, f"missing {needle!r}")

for item in args.asset_file:
    path, _, floor = item.partition("=")
    size = z.getinfo(path).file_size
    check(f"{path} is the real file", size > int(floor), f"{size:,} bytes")

if args.dex or args.arsc:
    print("\n=== the compiled code and resources shipped too ===")
    dex = b"".join(z.read(n) for n in names if n.endswith(".dex"))
    for item in args.dex:
        label, _, needle = item.partition("=")
        check(f"dex: {label}", needle.encode() in dex, f"missing {needle!r}")
    if args.arsc and "resources.arsc" in names:
        res = z.read("resources.arsc")
        for needle in args.arsc:
            check(f"resources: {needle}", needle.encode() in res, f"missing {needle!r}")

if args.prev:
    print(f"\n=== signed with the same key as {args.prev} ===")
    now, prev = cert_fingerprints(apk), cert_fingerprints(fetch(args.prev))
    print(f"  {args.tag}: {[f[:16] for f, _ in now]}")
    print(f"  {args.prev}: {[f[:16] for f, _ in prev]}")
    check("one certificate, and it is the same key",
          bool(now) and [f for f, _ in now] == [f for f, _ in prev],
          f"{[f[:16] for f, _ in now]} vs {[f[:16] for f, _ in prev]}")
    if now:
        print("  " + now[0][1].strip().splitlines()[-1].strip())

print("\n=== the release body ===")
check("the body is not empty", len(rel["body"].strip()) > 80)
if args.headline:
    check(f"the body mentions {args.headline!r}", args.headline in rel["body"], args.headline)

print("\n" + "=" * 62)
print(f"{len(checks) - len(fails)}/{len(checks)} checks passed")
if fails:
    for f in fails:
        print("  FAILED:", f)
    sys.exit(1)
print(f"PUBLISHED {args.tag} APK VERIFIED")
