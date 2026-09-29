#!/usr/bin/env python3
"""Static validation for an Android project - everything checkable without the SDK.

Run this before every push when CI is your only compiler. It catches the class of
mistake that otherwise costs a full CI round-trip:

  * XML that isn't well-formed (manifest, resources)
  * a resource reference (@drawable/x, R.string.y) that resolves to nothing - in an
    IDE this is a red squiggle, in CI it is a build failure
  * injected JavaScript that doesn't parse
  * a workflow YAML that doesn't load, or that has no build/upload step
  * Java source that doesn't parse (via javalang, if installed)
  * assets the Java code claims to load but that aren't there

It does NOT check semantics - only the real compiler does that.

Usage:
    python3 validate_android_project.py [project-dir]        # default: cwd

Optional extras (both degrade gracefully when missing):
    python3 -m pip install javalang pyyaml
"""
import glob
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

P = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.getcwd())
ok = True


def fail(msg):
    global ok
    ok = False
    print("  FAIL:", msg)


print(f"validating {P}\n")
print("=== 1. XML well-formedness ===")
xmls = glob.glob(os.path.join(P, "app/src/main/**/*.xml"), recursive=True)
for f in xmls:
    try:
        ET.parse(f)
        print("  ok  ", os.path.relpath(f, P))
    except Exception as e:
        fail(f"{os.path.relpath(f, P)}: {e}")
if not xmls:
    fail("no XML found - is this an Android project root?")

print("\n=== 2. resource references resolve ===")
have = {}
for kind in ("drawable", "xml", "values", "mipmap", "layout"):
    have[kind] = set()
for f in glob.glob(os.path.join(P, "app/src/main/res/**/*"), recursive=True):
    if os.path.isfile(f):
        kind_dir = os.path.basename(os.path.dirname(f))
        if kind_dir.startswith("mipmap"):          # mipmap-mdpi, mipmap-hdpi, ... are all "mipmap"
            kind_dir = "mipmap"
        have.setdefault(kind_dir, set()).add(os.path.basename(f).split(".")[0])
values_tags = set()
for f in glob.glob(os.path.join(P, "app/src/main/res/values/*.xml")):
    try:
        for child in ET.parse(f).getroot():
            values_tags.add(child.attrib.get("name"))
    except Exception:
        pass
print("  drawables:", sorted(have.get("drawable", ())))
print("  values:   ", sorted(v for v in values_tags if v))

sources = glob.glob(os.path.join(P, "app/src/main/java/**/*.java"), recursive=True)
sources.append(os.path.join(P, "app/src/main/AndroidManifest.xml"))
refs = set()
for f in sources:
    txt = open(f, encoding="utf-8", errors="replace").read()
    refs |= set(re.findall(r"@(drawable|string|color|style|xml|mipmap)/(\w+)", txt))
    # android.R.* references are framework resources, not this project's
    refs |= set(re.findall(r"(?<!android\.)R\.(drawable|string|color|style|xml|mipmap)\.(\w+)", txt))
for kind, name in sorted(refs):
    if name in have.get(kind, set()) or name in values_tags:
        print(f"  ok   @{kind}/{name}")
    else:
        fail(f"@{kind}/{name} referenced but not defined")

print("\n=== 3. workflow YAML loads and has build + upload ===")
wfs = glob.glob(os.path.join(P, ".github/workflows/*.yml")) + \
      glob.glob(os.path.join(P, ".github/workflows/*.yaml"))
if not wfs:
    fail("no workflow found under .github/workflows/")
try:
    import yaml
    any_build = False
    any_upload = False
    for wf in wfs:
        doc = yaml.safe_load(open(wf, encoding="utf-8"))
        for job_name, job in (doc.get("jobs") or {}).items():
            steps = job.get("steps") or []
            runs = " ".join(str(s.get("run", "")) for s in steps)
            uses = " ".join(str(s.get("uses", "")) for s in steps)
            print(f"  ok   {os.path.basename(wf)} :: {job_name} ({len(steps)} steps)")
            if "assemble" in runs or "bundle" in runs:
                any_build = True
            if "upload-artifact" in uses or "gh release" in runs:
                any_upload = True
    if not any_build:
        fail("no workflow job builds the APK (assemble/bundle)")
    if not any_upload:
        fail("no workflow job uploads or publishes the APK")
except ImportError:
    print("  (pyyaml not installed - skipped)")

print("\n=== 4. injected JS parses ===")
for js in glob.glob(os.path.join(P, "app/src/main/assets/**/*.js"), recursive=True) \
        + glob.glob(os.path.join(P, "**/_android_shim.js"), recursive=True):
    r = subprocess.run(["node", "--check", js], capture_output=True, text=True)
    print(f"  {'ok  ' if r.returncode == 0 else 'FAIL'} {os.path.relpath(js, P)}")
    if r.returncode:
        fail(r.stderr.strip()[:300])

print("\n=== 5. Java sources parse ===")
try:
    import javalang
    for f in sources:
        if not f.endswith(".java"):
            continue
        try:
            javalang.parse.parse(open(f, encoding="utf-8").read())
            print("  ok  ", os.path.basename(f))
        except Exception as e:
            fail(f"{os.path.basename(f)}: {type(e).__name__}: {e}")
except ImportError:
    print("  (javalang not installed - skipped)")

print("\n=== 6. assets the code loads exist ===")
assets_dir = os.path.join(P, "app/src/main/assets/www")
for f in sources:
    if not f.endswith(".java"):
        continue
    txt = open(f, encoding="utf-8", errors="replace").read()
    for rel in set(re.findall(r'open\("([^"]+)"\)', txt)):
        p = os.path.join(P, "app/src/main/assets", rel)
        print(f"  {'ok  ' if os.path.isfile(p) else 'MISS'} {rel}")
        if not os.path.isfile(p):
            fail(f"asset referenced in Java but missing: {rel}")
if os.path.isdir(assets_dir):
    for f in sorted(os.listdir(assets_dir)):
        p = os.path.join(assets_dir, f)
        if os.path.isfile(p):
            print(f"  ok   www/{f}  {os.path.getsize(p):,} B")

print("\n" + ("ALL STATIC CHECKS PASSED" if ok else "SOME CHECKS FAILED"))
print("Reminder: static checks cannot verify runtime behaviour - background playback,"
      " notifications and cleartext policy are only proven on a device.")
sys.exit(0 if ok else 1)
