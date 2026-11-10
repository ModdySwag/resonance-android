# VirusTotal — Resonance Studio 2.1.2-beta (Android, sideload build)

Scanned so a person downloading the APK from moddys.net does not have to take the publisher's
word for it. The report is the engines' own output, not a summary written here.

## The artifact

| | |
| --- | --- |
| File | `resonance-studio-v2.1.2-beta.apk` |
| Size | 993,501 B |
| SHA-256 | `46290c25234d970203d4aec7cd5dc67f3379c3f58dcd80c6fb85fc6eb6373efd` |
| Version | 2.1.2-beta, versionCode 17 |
| Channel | sideload (signed with `resonance-release.p12`) |

## Verdict

**0 malicious / 0 suspicious.**

| Result | Engines |
| --- | --- |
| undetected (clean) | 66 |
| type-unsupported (did not analyse an APK) | 8 |
| timeout | 1 |
| failure | 0 |
| malicious | 0 |
| suspicious | 0 |

75 engines answered in total. A type-unsupported engine did not scan the file and a timeout is not
a detection; neither is counted as clean or as a hit. First submission of this hash (reputation 0),
so the verdict comes from the engines, not from reputation carried by an earlier build.

Report: https://www.virustotal.com/gui/file/46290c25234d970203d4aec7cd5dc67f3379c3f58dcd80c6fb85fc6eb6373efd

## Method

`cache/vt_scan.py` posts the built APK to `POST /api/v3/files` with `x-apikey`, polls
`GET /api/v3/analyses/<id>` until `status == completed`, then reads `last_analysis_stats` from
`GET /api/v3/files/<sha256>`. The key is read from `C:/Users/Moddy/keystores/virustotal.key` and is
never printed.

Any rebuild changes the hash and voids this report: re-run the scan before publishing, and keep the
card, `updates.json`, this table and the GitHub release asset on the same sha.
