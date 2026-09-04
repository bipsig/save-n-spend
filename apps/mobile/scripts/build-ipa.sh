#!/usr/bin/env bash
# Build an UNSIGNED .ipa for sideloading via SideStore.
#
# Unsigned is deliberate: SideStore re-signs with your free Apple ID cert on
# the device, so a signature here would only be stripped and replaced.
#
# Run from apps/mobile:  npm run ipa
set -euo pipefail

cd "$(dirname "$0")/.."

SCHEME="SavenSpend"
APP="$SCHEME.app"
VERSION=$(node -p "require('./app.json').expo.version")
OUT="${IPA_OUT:-$HOME/Desktop}/savenspend-$VERSION.ipa"
PRODUCT="build/Build/Products/Release-iphoneos/$APP"

# `ios/` is gitignored and regenerated, so it may not exist on a fresh clone.
if [ ! -d ios ]; then
  echo "==> ios/ missing, running prebuild"
  npx expo prebuild --platform ios
fi

echo "==> Building Release for device (unsigned)"
# Release picks up .env.production, which is what bakes EXPO_PUBLIC_API_URL
# into the JS bundle. Changing that file requires a rebuild to take effect.
xcodebuild \
  -workspace "ios/$SCHEME.xcworkspace" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  build

[ -d "$PRODUCT" ] || { echo "build succeeded but $PRODUCT is missing" >&2; exit 1; }

echo "==> Packaging $OUT"
# An .ipa is just a zip with the .app inside a top-level Payload/ directory.
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/Payload"
cp -R "$PRODUCT" "$STAGE/Payload/"
rm -f "$OUT"
(cd "$STAGE" && zip -qry "$OUT" Payload)

echo
echo "Done: $OUT"
ls -lh "$OUT" | awk '{print "     size: "$5}'
# Sanity-check the baked config. A missing `scheme` crashes the app on launch
# (expo-router calls Linking.createURL on first render), and this embedded
# app.config is the exact file expo-linking reads at runtime.
echo "     scheme:  $(node -e "
  const c = JSON.parse(require('fs').readFileSync('$PRODUCT/EXConstants.bundle/app.config', 'utf8'));
  console.log(c.scheme || '*** MISSING - app will crash on launch ***');
")"
# Release bundles inline EXPO_PUBLIC_* at build time, so this is what the
# app will actually talk to until the next rebuild.
API_URL=$(sed -n 's/^EXPO_PUBLIC_API_URL=//p' .env.production 2>/dev/null || true)
echo "     api url: ${API_URL:-(unset - falls back to Metro LAN host)}"
echo
echo "Next: AirDrop it to the iPhone, then SideStore -> + -> pick the file."
