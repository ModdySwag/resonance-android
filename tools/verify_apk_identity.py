#!/usr/bin/env python3
"""Verify an APK's identity and payload without a JDK or Android SDK.

Answers the questions a release actually has to answer:
  * is it signed (v2/v3 block present)?
  * which package id and version does it carry? (decoded from the BINARY manifest)
  * did a debug suffix leak into the build?
  * do the bundled web assets match the source byte-for-byte?

Usage:
    python3 verify_apk_identity.py app-release.apk
    python3 verify_apk_identity.py app-release.apk --assets-dir <path/to/source/www>
    python3 verify_apk_identity.py app-release.apk --expect-package com.example.app

Why not grep: AndroidManifest.xml inside an APK is AXML - its strings are length-prefixed
UTF-16 in a string pool, so text tools cannot see the package name or version at all.
"""
import argparse
import hashlib
import struct
import sys
import zipfile


def axml_strings(data: bytes):
    """Decode the string pool of a binary AndroidManifest.xml."""
    if struct.unpack_from("<H", data, 0)[0] != 0x0003:
        raise ValueError("not a binary AndroidManifest (AXML)")
    off = 8
    while off < len(data):
        ctype, hsize, csize = struct.unpack_from("<HHI", data, off)
        if ctype == 0x0001:                                   # RES_STRING_POOL_TYPE
            count, _style_count, flags, strings_start, _ = struct.unpack_from(
                "<IIIII", data, off + 8)
            utf8 = bool(flags & 0x100)
            offsets = struct.unpack_from("<%dI" % count, data, off + hsize)
            base = off + strings_start
            out = []
            for o in offsets:
                p = base + o
                if utf8:
                    n = data[p]
                    if n & 0x80:
                        n = ((n & 0x7F) << 8) | data[p + 1]; p += 2
                    else:
                        p += 1
                    bn = data[p]                       # byte length (may differ from chars)
                    if bn & 0x80:
                        bn = ((bn & 0x7F) << 8) | data[p + 1]; p += 2
                    else:
                        p += 1
                    out.append(data[p:p + bn].decode("utf-8", "replace"))
                else:
                    n = struct.unpack_from("<H", data, p)[0]
                    if n & 0x8000:
                        n = ((n & 0x7FFF) << 16) | struct.unpack_from("<H", data, p + 2)[0]
                        p += 4
                    else:
                        p += 2
                    out.append(data[p:p + n * 2].decode("utf-16-le", "replace"))
            return out
        off += csize
    raise ValueError("no string pool found")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("apk")
    ap.add_argument("--assets-dir", help="source dir to hash-compare bundled assets against")
    ap.add_argument("--expect-package", help="fail unless the manifest carries this package")
    a = ap.parse_args()

    ok = True

    def fail(msg):
        nonlocal ok
        ok = False
        print("  FAIL:", msg)

    with zipfile.ZipFile(a.apk) as z:
        names = z.namelist()
        manifest = z.read("AndroidManifest.xml")

        print("=== signature ===")
        raw = z.read  # keep the handle; read the whole file for the marker
        with open(a.apk, "rb") as fh:
            blob = fh.read()
        if b"APK Sig Block 42" in blob:
            print("  v2/v3 signature block present")
        else:
            fail("no v2/v3 signature block - is this signed?")
        v1 = [n for n in names if n.startswith("META-INF/") and n.endswith((".RSA", ".DSA", ".EC"))]
        print("  v1 JAR signature files:", v1 or "none (expected when minSdk >= 24)")

        print("\n=== identity (decoded from the binary manifest) ===")
        strings = axml_strings(manifest)
        pkg = next((s for s in strings if s.count(".") >= 2 and " " not in s
                    and not s.startswith("android")), None)
        ver = next((s for s in strings if s[:1].isdigit() and s.count(".") == 2), None)
        print("  package guess   :", pkg)
        print("  versionName     :", ver)
        print("  components      :", [s for s in strings if s.startswith(pkg or "~none~")][:6])
        if a.expect_package and a.expect_package not in strings:
            fail(f"package {a.expect_package} not found in the manifest")
        if any(".debug" in s for s in strings):
            fail("a '.debug' string is present in the manifest")

        print("\n=== payload ===")
        for need in ("classes.dex", "resources.arsc", "AndroidManifest.xml"):
            print(f"  {'ok  ' if need in names else 'MISS'} {need}")
            if need not in names:
                fail(f"missing {need}")
        assets = [n for n in names if n.startswith("assets/www/")]
        for n in assets:
            print(f"  {z.getinfo(n).file_size:>10,} B  {n}")
        if not assets:
            fail("no bundled assets found under assets/www/")

        if "classes.dex" in names:
            dex = z.read("classes.dex")
            if b".debug" in dex:
                print("  note: '.debug' appears in classes.dex - check whether it is a package id")

        if a.assets_dir:
            import os
            print(f"\n=== bundled assets vs {a.assets_dir} ===")
            for n in assets:
                src = os.path.join(a.assets_dir, os.path.basename(n))
                if not os.path.isfile(src):
                    fail(f"no source file for {os.path.basename(n)}")
                    continue
                a_hash = hashlib.sha256(z.read(n)).hexdigest()
                b_hash = hashlib.sha256(open(src, "rb").read()).hexdigest()
                if a_hash == b_hash:
                    print(f"  MATCH  {os.path.basename(n)}  {a_hash[:16]}")
                else:
                    fail(f"DIFFERS {os.path.basename(n)}: apk={a_hash[:16]} source={b_hash[:16]}"
                         "  (line-ending rewrite? see .gitattributes -text)")

    print("\n" + ("APK VERIFICATION PASSED" if ok else "APK VERIFICATION FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
