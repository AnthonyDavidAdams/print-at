#!/bin/bash
# Print@™ installer — https://printat.co/install.sh
#   curl -fsSL https://printat.co/install.sh | bash
# Clones (or updates) the open-source driver into ~/printat and runs its install.sh,
# which needs sudo once for the CUPS backend and printer registration.
set -euo pipefail
REPO="https://github.com/AnthonyDavidAdams/print-at"
DEST="${PRINTAT_DIR:-$HOME/printat}"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "Print@ currently supports macOS only. Windows and Linux ports are started — help wanted: $REPO"
if ! xcode-select -p >/dev/null 2>&1; then
  say "Xcode Command Line Tools are required (they provide swiftc). Starting the install…"
  xcode-select --install >/dev/null 2>&1 || true
  die "Re-run this installer once the Command Line Tools finish installing."
fi
command -v git >/dev/null 2>&1 || die "git is required (it ships with the Command Line Tools)."
command -v node >/dev/null 2>&1 || die "Node.js 22+ is required: https://nodejs.org  (or: brew install node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || die "Node.js 22+ is required (found $(node --version))."

if [ -d "$DEST/.git" ]; then
  say "==> Updating $DEST"
  git -C "$DEST" pull --ff-only
else
  say "==> Cloning Print@ into $DEST"
  git clone --depth 1 "$REPO" "$DEST"
fi

say "==> Installing (sudo is needed once, for the CUPS backend and printer registration)"
sudo "$DEST/install.sh" </dev/tty

echo
say "Print@ is installed: 'Print@ Nearby' is now in every Print dialog."
echo "Recommended next step — connect this Mac to the Print@ cloud (magic link, nothing else to set up):"
echo "    printat connect you@example.com"
echo "Skip that to stay fully local. Uninstall any time: $DEST/uninstall.sh"
