#!/bin/sh
# chromium/src is the single source of truth; this copies it (and the icons) to firefox/.
set -eu
cd "$(dirname "$0")/.."
rm -rf firefox/src firefox/icons
cp -R chromium/src firefox/src
cp -R chromium/icons firefox/icons
echo "firefox/src and firefox/icons synced from chromium/"
