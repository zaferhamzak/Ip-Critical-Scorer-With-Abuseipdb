#!/bin/sh
# Builds dist/abuseipdb-ip-lookup-<version>.zip containing only the files Chrome needs.
# The archive has a single top-level folder so it extracts cleanly for "Load unpacked".
set -eu

cd "$(dirname "$0")/.."

version=$(node -p 'require("./manifest.json").version')
name="abuseipdb-ip-lookup"
stage="dist/$name"
archive="dist/$name-$version.zip"

npm test --silent

rm -rf "$stage" "$archive"
mkdir -p "$stage/icons"
cp manifest.json "$stage/"
cp -R src "$stage/"
cp icons/*.png "$stage/icons/"
cp README.md "$stage/"
mkdir -p "$stage/updater"
cp updater/*.sh "$stage/updater/"

(cd dist && zip -qrX "$(basename "$archive")" "$name")
rm -rf "$stage"

echo "Created $archive"
