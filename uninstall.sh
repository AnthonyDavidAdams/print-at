#!/bin/bash
set -uo pipefail
REAL_USER="${SUDO_USER:-$USER}"; REAL_HOME="$(eval echo "~$REAL_USER")"; REAL_UID="$(id -u "$REAL_USER")"
[ "$(id -u)" -ne 0 ] && { echo "Run with sudo"; exit 1; }
lpadmin -x NearPrint 2>/dev/null
rm -f /usr/libexec/cups/backend/nearprint
launchctl bootout "gui/$REAL_UID/io.nearprint.agent" 2>/dev/null
rm -f "$REAL_HOME/Library/LaunchAgents/io.nearprint.agent.plist"
echo "Removed printer, backend and agent. Job history kept in ~/Library/Application Support/NearPrint/."
