#!/bin/sh
# Builds store packages for both browsers. manifest.json sits at the archive root.
#   dist/ip-critical-scorer-chromium-<version>.zip  -> Chrome Web Store / Edge Add-ons
#   dist/ip-critical-scorer-firefox-<version>.zip   -> addons.mozilla.org
set -eu

cd "$(dirname "$0")/.."

sh scripts/sync-src.sh >/dev/null
npm test --silent

version=$(node -p 'require("./chromium/manifest.json").version')
mkdir -p dist

for browser in chromium firefox; do
  stage="dist/stage-$browser"
  archive="dist/ip-critical-scorer-$browser-$version.zip"
  rm -rf "$stage" "$archive"
  mkdir -p "$stage/icons"
  cp "$browser/manifest.json" "$stage/"
  cp -R "$browser/src" "$stage/"
  cp "$browser"/icons/*.png "$stage/icons/"
  (cd "$stage" && zip -qrX "../$(basename "$archive")" .)
  rm -rf "$stage"
  echo "Created $archive"
done

# Keep a copy of the Chrome package next to the store submission texts.
rm -f chromium/web-store/2-paket/*.zip
cp "dist/ip-critical-scorer-chromium-$version.zip" chromium/web-store/2-paket/
echo "Copied to chromium/web-store/2-paket/"
