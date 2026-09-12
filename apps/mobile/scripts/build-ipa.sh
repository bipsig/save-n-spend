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

# Expo 54's Metro needs Node 20+ for `Array.prototype.toReversed`. Checked here rather
# than left to fail, because it fails INSIDE Xcode's bundling phase — ten minutes and
# twenty thousand log lines in — as "configs.toReversed is not a function".
require_node_20 () {
  local node_bin="$1" where="$2"
  local major
  major=$("$node_bin" -p "process.versions.node.split('.')[0]" 2>/dev/null) || major=0
  [ "$major" -ge 20 ] && return 0
  echo "Node $("$node_bin" -v 2>/dev/null || echo '?') is too old for Expo's bundler ($where)." >&2
  echo "mise.toml pins 24.20.0. Retry with:  mise exec node@24.20.0 -- npm run ipa" >&2
  exit 1
}

require_node_20 "$(command -v node)" "on PATH"

# `ios/` is gitignored and regenerated, so it may not exist on a fresh clone.
if [ ! -d ios ]; then
  echo "==> ios/ missing, running prebuild"
  npx expo prebuild --platform ios
fi

# Prebuild bakes `command -v node` into this file, and the script phases source it — so an
# `ios/` generated from a shell on an older Node stays broken however this script is run.
if [ -f ios/.xcode.env.local ]; then
  BAKED=$(sed -n 's/^export NODE_BINARY=//p' ios/.xcode.env.local)
  [ -n "$BAKED" ] && require_node_20 "$BAKED" "baked into ios/.xcode.env.local by prebuild"
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
