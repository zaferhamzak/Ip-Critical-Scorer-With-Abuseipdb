#!/bin/sh
# Builds dist/ip-critical-scorer-<version>.zip for the Chrome Web Store.
# manifest.json sits at the root of the archive, as the store requires.
set -eu

cd "$(dirname "$0")/.."

version=$(node -p 'require("./manifest.json").version')
stage="dist/stage"
archive="dist/ip-critical-scorer-$version.zip"

npm test --silent

rm -rf "$stage" "$archive"
mkdir -p "$stage/icons"
cp manifest.json "$stage/"
cp -R src "$stage/"
cp icons/*.png "$stage/icons/"

(cd "$stage" && zip -qrX "../$(basename "$archive")" .)
rm -rf "$stage"

echo "Created $archive"
