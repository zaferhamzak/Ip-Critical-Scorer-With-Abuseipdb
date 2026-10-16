#!/bin/sh
# Downloads the latest GitHub release of the extension and replaces the files in the
# extension folder. Chrome notices the new manifest version and the extension reloads
# itself within a few minutes.
#
# Usage: update.sh /path/to/abuseipdb-ip-lookup
# Env (testing only): UPDATE_API_URL and UPDATE_ASSET_PREFIX override the GitHub endpoints.
set -eu

REPO="zaferhamzak/Ip-Critical-Scorer-With-Abuseipdb"
API_URL="${UPDATE_API_URL:-https://api.github.com/repos/$REPO/releases/latest}"
ASSET_PREFIX="${UPDATE_ASSET_PREFIX:-https://github.com/$REPO/releases/download/}"
FOLDER_NAME="abuseipdb-ip-lookup"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

target="${1:-}"
if [ -z "$target" ] || [ ! -f "$target/manifest.json" ]; then
  log "error: extension folder not found: '$target'"
  exit 1
fi

manifest_version() {
  sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$1" | head -n 1
}

# Prints 1 when $1 > $2 (x.y.z), otherwise 0.
version_gt() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, "."); split(b, y, ".");
    for (i = 1; i <= 3; i++) { if (x[i] + 0 > y[i] + 0) { print 1; exit } if (x[i] + 0 < y[i] + 0) { print 0; exit } }
    print 0 }'
}

# Never overwrite a development checkout: files not in the release would be deleted.
if [ -e "$target/.git" ]; then
  log "error: '$target' is a git checkout; auto-update only manages folders extracted from a release ZIP"
  exit 1
fi

current=$(manifest_version "$target/manifest.json")

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

if ! curl -fsSL --max-time 30 -H "Accept: application/vnd.github+json" -o "$tmp/release.json" "$API_URL"; then
  log "error: could not reach GitHub"
  exit 1
fi

# Put each JSON field on its own line so this works for pretty-printed and minified JSON.
tr ',{}[]' '\n\n\n\n\n' < "$tmp/release.json" > "$tmp/fields"
latest=$(sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"v\{0,1\}\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)"[[:space:]]*$/\1/p' "$tmp/fields" | head -n 1)
asset_url=$(sed -n 's/^[[:space:]]*"browser_download_url":[[:space:]]*"\([^"]*\.zip\)"[[:space:]]*$/\1/p' "$tmp/fields" | head -n 1)

if [ -z "$latest" ] || [ -z "$asset_url" ]; then
  log "error: release information not understood"
  exit 1
fi

if [ "$(version_gt "$latest" "$current")" != "1" ]; then
  log "up to date (v$current)"
  exit 0
fi

# Only download from this repository's release assets.
case "$asset_url" in
  "$ASSET_PREFIX"*) ;;
  *) log "error: unexpected download URL"; exit 1 ;;
esac

log "updating v$current -> v$latest"
curl -fsSL --max-time 120 -o "$tmp/release.zip" "$asset_url"
mkdir "$tmp/x"
unzip -q "$tmp/release.zip" -d "$tmp/x"

new="$tmp/x/$FOLDER_NAME"
if [ ! -f "$new/manifest.json" ] || [ "$(manifest_version "$new/manifest.json")" != "$latest" ]; then
  log "error: downloaded package does not match v$latest"
  exit 1
fi

# Copy everything except the manifest first, then the manifest. The extension reloads
# only when the manifest version changes, so it never runs a half-copied update.
(cd "$new" && find . -type d) | while IFS= read -r dir; do mkdir -p "$target/$dir"; done
(cd "$new" && find . -type f ! -path ./manifest.json) | while IFS= read -r file; do cp "$new/$file" "$target/$file"; done
# Remove files that no longer exist in the new version (never touches anything outside the folder).
(cd "$target" && find . -type f ! -path ./manifest.json) | while IFS= read -r file; do
  [ -e "$new/$file" ] || rm -f "$target/$file"
done
cp "$new/manifest.json" "$target/manifest.json"

# Keep the installed copy of this script current.
self_dir="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$target/updater/update.sh" ] && [ "$self_dir" != "$(cd "$target/updater" && pwd)" ]; then
  # Write a new file and rename it so the shell running this script keeps reading the old one.
  cp "$target/updater/update.sh" "$self_dir/update.sh.new" && mv -f "$self_dir/update.sh.new" "$self_dir/update.sh"
fi

log "updated to v$latest; Chrome will reload the extension within a few minutes"
