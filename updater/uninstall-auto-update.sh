#!/bin/sh
# Removes the automatic updater. The extension itself stays installed.
set -eu
case "$(uname -s)" in
  Darwin)
    label="com.github.zaferhamzak.ip-critical-scorer.updater"
    plist="$HOME/Library/LaunchAgents/$label.plist"
    launchctl bootout "gui/$(id -u)" "$plist" 2>/dev/null || true
    rm -f "$plist"
    rm -rf "$HOME/Library/Application Support/IpCriticalScorer"
    ;;
  Linux)
    (crontab -l 2>/dev/null | grep -v 'ip-critical-scorer/update.sh' || true) | crontab -
    rm -rf "$HOME/.local/share/ip-critical-scorer"
    ;;
esac
echo "Otomatik güncelleme kaldırıldı."
