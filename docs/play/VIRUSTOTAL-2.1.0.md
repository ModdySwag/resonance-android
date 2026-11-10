# VirusTotal — Resonance Studio 2.1.0 (Android, sideload build)

Scanned so a person downloading the APK from moddys.net does not have to take the publisher's
word for it. The report is the engines' own output, not a summary written here.

## The artifact

| | |
| --- | --- |
| File | `resonance-studio-2.1.0.apk` |
| Size | 992,101 B |
| SHA-256 | `826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2` |
| Package | `com.moddys.resonance`, versionCode 15, versionName 2.1.0 |
| Signed by | `C=AU, O=ModdySwag, CN=Resonance Studio`, cert SHA-256 `08:B8:CB:BF…15:F2:1B:6` |
| Scanned | 10 November 2026 |
| Report | https://www.virustotal.com/gui/file/826c66e61b04b04434f232de28290061c986e047d909f58218dcde937a5013c2 |

## The result

**0 malicious, 0 suspicious.** 65 engines returned a verdict and every one of them was
`undetected`. The remaining ten are not a judgement on the file: eight do not analyse Android
packages at all (`type-unsupported`), one timed out (Bkav) and one failed (Skyhigh). Engines
listed for the file: 75.

Reputation on first submission: 0 (no prior history). This was the first time these bytes were
submitted, so nothing here is inherited from an earlier build.

## What it means, and what it does not

- It means no engine in VirusTotal's set recognises this build as malware, adware or a PUA. On a
  small WebView app whose payload is bundled HTML/JS, that is a meaningful check against a
  repackaged build.
- It does **not** certify that the app is bug-free, that its behaviour is harmless, or that it
  is safe on every device. A scanner is a second opinion, not a warranty.
- The result cannot be stored inside the APK: adding it would change the file and invalidate the
  hash that was scanned. The app's About screen therefore states the durable policy ("Release
  builds are scanned with VirusTotal before publication; the report for each build is linked
  from the download page") and the per-build numbers live here and on the download page.

## Re-scanning

Any new build changes the hash, so it needs its own scan. Keep the filename and the hash
together, and never quote a report against a file whose SHA-256 differs from the one above.
