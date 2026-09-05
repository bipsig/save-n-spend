#!/usr/bin/env bash
# Render the app icons from their SVG sources.
#
# assets/*.svg are the source of truth; the PNGs beside them are build output that
# happens to be committed, because Expo's config can only point at raster files and
# a fresh clone must be able to build without this toolchain installed.
#
# Run from apps/mobile:  npm run icons
#
# Needs librsvg:  brew install librsvg
set -euo pipefail

cd "$(dirname "$0")/../assets"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found. Install it with: brew install librsvg" >&2
  exit 1
fi

# iOS/marketing icon: full bleed, square, and opaque. iOS applies its own squircle
# mask, so rounding the corners here would only show dark wedges inside the mask.
render() {
  local src="$1" size="$2" out="$3"
  rsvg-convert -w "$size" -h "$size" "$src" -o "$out"
  echo "  $out  ${size}x${size}"
}

echo "==> Rendering icons"
render icon.svg  1024 icon.png           # expo.icon
render glyph.svg 1024 adaptive-icon.png  # expo.android.adaptiveIcon.foregroundImage
render glyph.svg 1024 splash-icon.png    # expo.splash.image
render glyph.svg   48 favicon.png        # expo.web.favicon

# The iOS icon must have no alpha channel. rsvg-convert only emits one when the
# source has transparency, and icon.svg paints an opaque background — so this is a
# check that the source stayed opaque, not a conversion step.
if [ "$(sips -g hasAlpha icon.png | tail -1 | tr -d ' ' | cut -d: -f2)" != "no" ]; then
  echo "error: icon.png has an alpha channel; iOS icons must be opaque." >&2
  echo "       Check that icon.svg still paints a full-bleed background rect." >&2
  exit 1
fi

echo "==> Done. Icons are baked at prebuild, so run 'npx expo prebuild --clean' to pick them up."
