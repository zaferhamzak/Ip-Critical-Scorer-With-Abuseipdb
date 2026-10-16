#!/bin/sh
# One-time setup: runs update.sh at login and every 6 hours.
# macOS: LaunchAgent. Linux: user crontab entry.
set -eu

ext_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$ext_dir/manifest.json" ]; then
  echo "Hata: eklenti klasörü bulunamadı ($ext_dir)." >&2
  exit 1
fi

if [ -e "$ext_dir/.git" ]; then
  echo "Hata: bu bir geliştirme klasörü (git deposu). Otomatik güncelleme yalnızca Releases'tan indirilen ZIP klasörüne kurulur." >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    support="$HOME/Library/Application Support/IpCriticalScorer"
    label="com.github.zaferhamzak.ip-critical-scorer.updater"
    plist="$HOME/Library/LaunchAgents/$label.plist"
    logfile="$HOME/Library/Logs/ip-critical-scorer-update.log"
    mkdir -p "$support" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    cp "$ext_dir/updater/update.sh" "$support/update.sh"
    cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$support/update.sh</string>
    <string>$ext_dir</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>21600</integer>
  <key>StandardOutPath</key><string>$logfile</string>
  <key>StandardErrorPath</key><string>$logfile</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)" "$plist" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
    echo "Otomatik güncelleme kuruldu. Eklenti klasörü: $ext_dir"
    echo "Kayıt dosyası: $logfile"
    ;;
  Linux)
    support="$HOME/.local/share/ip-critical-scorer"
    logfile="$support/update.log"
    mkdir -p "$support"
    cp "$ext_dir/updater/update.sh" "$support/update.sh"
    line="17 */6 * * * /bin/sh '$support/update.sh' '$ext_dir' >> '$logfile' 2>&1"
    (crontab -l 2>/dev/null | grep -v 'ip-critical-scorer/update.sh' || true; echo "$line") | crontab -
    /bin/sh "$support/update.sh" "$ext_dir" >> "$logfile" 2>&1 || true
    echo "Otomatik güncelleme kuruldu (crontab, 6 saatte bir). Kayıt dosyası: $logfile"
    ;;
  *)
    echo "Bu işletim sistemi desteklenmiyor. README'deki elle güncelleme adımlarını kullanın." >&2
    exit 1
    ;;
esac
