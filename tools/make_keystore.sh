#!/usr/bin/env bash
# Generate an Android release signing key (PKCS12) with openssl - no JDK required.
#
# WINDOWS HOST NOTE: openssl is a native binary and MSYS path conversion is off, so it must
# be given C:/... paths. /c/... fails with "Can't open ... for writing, No such file or
# directory", which looks like a missing directory rather than a path problem.
#
# Usage: make_keystore.sh <output-dir> [alias]
set -e
OUT="${1:?usage: make_keystore.sh <output-dir> [alias]}"
ALIAS="${2:-release}"
mkdir -p "$OUT"
# native-tool-friendly path
case "$OUT" in
  /?/*) OUT_WIN="$(cygpath -m "$OUT" 2>/dev/null || echo "$OUT")" ;;
  *)    OUT_WIN="$OUT" ;;
esac

PW=$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-28)

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$OUT_WIN/.tmp-key.pem" -out "$OUT_WIN/.tmp-cert.pem" \
  -days 10000 -subj "/CN=App Release/O=Owner/C=AU" 2>/dev/null

openssl pkcs12 -export -out "$OUT_WIN/release.p12" \
  -inkey "$OUT_WIN/.tmp-key.pem" -in "$OUT_WIN/.tmp-cert.pem" \
  -name "$ALIAS" -passout "pass:$PW"

rm -f "$OUT_WIN/.tmp-key.pem" "$OUT_WIN/.tmp-cert.pem"

{
  echo "Android release signing - KEEP THIS SAFE, it is the app's identity."
  echo
  echo "keystore : $OUT_WIN/release.p12"
  echo "alias    : $ALIAS"
  echo "password : $PW"
  echo "created  : $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo
  echo "If this keystore is lost you can never publish an update that existing users can"
  echo "install - they would have to uninstall and reinstall. Back it up somewhere safe."
  echo
  echo "CI secrets carrying the same values:"
  echo "  KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD"
} > "$OUT/release-credentials.txt"

echo "keystore   : $OUT_WIN/release.p12 ($(stat -c%s "$OUT/release.p12") bytes)"
echo "credentials: $OUT/release-credentials.txt"
echo
echo "--- proof it is a usable signing key ---"
openssl pkcs12 -in "$OUT_WIN/release.p12" -passin "pass:$PW" -nokeys -noenc 2>/dev/null \
  | openssl x509 -noout -subject -dates

echo
echo "--- set the CI secrets without echoing values ---"
cat <<'EOF'
base64 -w0 release.p12 > ks.b64
gh secret set KEYSTORE_BASE64 --repo OWNER/REPO < ks.b64
printf '%s' "$PW" | gh secret set KEYSTORE_PASSWORD --repo OWNER/REPO
printf '%s' "$ALIAS" | gh secret set KEY_ALIAS --repo OWNER/REPO
printf '%s' "$PW" | gh secret set KEY_PASSWORD --repo OWNER/REPO
rm -f ks.b64
EOF
