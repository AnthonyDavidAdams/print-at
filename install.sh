#!/bin/bash
# Installs NearPrint: builds the location helper, installs the CUPS backend + PPD,
# registers the "NearPrint" printer, and starts the user agent via launchd.
# Run with:  sudo ./install.sh      (sudo is needed for the backend + lpadmin)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(eval echo "~$REAL_USER")"
REAL_UID="$(id -u "$REAL_USER")"
NODE="$(sudo -u "$REAL_USER" -i which node 2>/dev/null || which node)"
PRINTER="NearPrint"

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo $0"; exit 1; fi

echo "==> Building location helper and panel"
sudo -u "$REAL_USER" bash -c "cd '$ROOT/helper' && swiftc -O main.swift -o nearprint-locate -framework CoreLocation -framework MapKit \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist 2>&1 | grep -v warning || true; codesign -s - -f nearprint-locate; cd '$ROOT/helper/panel' && swiftc -O main.swift -o PrintAtPanel -framework SwiftUI -framework AppKit 2>&1 | grep -v warning || true; mkdir -p PrintAt.app/Contents/MacOS PrintAt.app/Contents/Resources; cp PrintAtPanel PrintAt.app/Contents/MacOS/PrintAtPanel; cp Bundle-Info.plist PrintAt.app/Contents/Info.plist; cp '$ROOT/icon/NearPrint.icns' PrintAt.app/Contents/Resources/PrintAt.icns; codesign -s - -f --deep PrintAt.app"

echo "==> Installing icon + CUPS backend"
mkdir -p /Library/Printers/Icons
install -m 0644 "$ROOT/icon/NearPrint.icns" /Library/Printers/Icons/NearPrint.icns
install -m 0755 -o root -g wheel "$ROOT/backend/nearprint" /usr/libexec/cups/backend/nearprint

echo "==> Registering printer '$PRINTER'"
lpadmin -x "$PRINTER" 2>/dev/null || true
lpadmin -p "$PRINTER" -E -v nearprint://localhost/ -P "$ROOT/ppd/NearPrint.ppd" \
  -D "Print@ Nearby" -L "Nearest print shop" -o printer-is-shared=false \
  -o printer-error-policy=retry-job
cupsenable "$PRINTER"; cupsaccept "$PRINTER"

echo "==> Writing config + launchd agent"
APP="$REAL_HOME/Library/Application Support/NearPrint"
sudo -u "$REAL_USER" mkdir -p "$APP" "$REAL_HOME/Library/Logs/NearPrint"
if [ ! -f "$APP/config.json" ]; then
  sudo -u "$REAL_USER" bash -c "cat > '$APP/config.json'" <<JSON
{
  "contactName": "$(id -F "$REAL_USER" 2>/dev/null || echo "$REAL_USER")",
  "contactEmail": "",
  "contactPhone": "",
  "homeAddress": "",
  "ccSelf": true,
  "port": 4243,
  "claudeModel": "",
  "claudeTimeoutSec": 540,
  "gmailEnv": "$REAL_HOME/.gmail.env",
  "smtpUser": ""
}
JSON
  echo "    wrote $APP/config.json — fill in contactEmail (used as SMTP sender) and contactPhone"
fi
PLIST="$REAL_HOME/Library/LaunchAgents/io.nearprint.agent.plist"
sed -e "s|__NODE__|$NODE|g" -e "s|__ROOT__|$ROOT|g" -e "s|__HOME__|$REAL_HOME|g" \
  "$ROOT/launchd/io.nearprint.agent.plist.template" > "$PLIST"
chown "$REAL_USER" "$PLIST"
launchctl bootout "gui/$REAL_UID/io.nearprint.agent" 2>/dev/null || true
launchctl bootstrap "gui/$REAL_UID" "$PLIST"
sleep 1
if curl -sf "http://127.0.0.1:4243/health" >/dev/null; then echo "    agent is up"; else echo "    agent did not answer on :4243 — check ~/Library/Logs/NearPrint/"; fi

echo
echo "Done. 'Print@ Nearby' is now a printer in every Print dialog."
echo "Options live under the printer-options section of the Print dialog (Priority, radius, shop type, delivery)."
echo "Test from a terminal:  lp -d NearPrint -o Priority=Price -o Delivery=Confirm some.pdf"
