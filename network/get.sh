#!/bin/bash
# Print@™ installer — https://printat.co/install.sh
#   curl -fsSL https://printat.co/install.sh | bash
# Clones (or updates) the open-source driver into ~/printat and runs its install.sh,
# which needs sudo once for the CUPS backend and printer registration.
set -euo pipefail
REPO="https://github.com/AnthonyDavidAdams/print-at"
DEST="${PRINTAT_DIR:-$HOME/printat}"
say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() {
  printf '\033[31m%s\033[0m\n' "$*" >&2
  # Offer to tell Print@ so the requirement check / message gets better for the next person.
  local ans="y"; [ -r /dev/tty ] && { read -r -p "Send this to Print@ support (versions + this message)? [Y/n] " ans </dev/tty || ans=y; }
  case "$ans" in n|N|no|NO) exit 1 ;; esac
  local email=""; [ -r /dev/tty ] && { read -r -p "Your email, so we can reply (optional): " email </dev/tty || email=""; }
  MSG="$*" EMAIL="$email" python3 -c 'import json,os,subprocess,urllib.request,platform
def sh(c):
    try: return subprocess.run(c,capture_output=True,text=True,timeout=8).stdout.strip()
    except Exception: return ""
d={"macos":sh(["sw_vers","-productVersion"]),"arch":platform.machine(),"node":sh(["node","--version"]),"git":sh(["git","--version"]),"xcode_clt":sh(["xcode-select","-p"])}
b=json.dumps({"email":os.environ["EMAIL"],"source":"installer","description":"Installer stopped: "+os.environ["MSG"],"diagnostics":d}).encode()
r=urllib.request.urlopen(urllib.request.Request("https://printat.co/api/bugs",data=b,headers={"content-type":"application/json"}),timeout=30)
j=json.loads(r.read()); print("Sent — ticket #%s."%j.get("id"))' 2>/dev/null || true
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || die "Print@ currently supports macOS only. Windows and Linux ports are started — help wanted: $REPO"
if ! xcode-select -p >/dev/null 2>&1; then
  say "Xcode Command Line Tools are required (they provide swiftc). Starting the install…"
  xcode-select --install >/dev/null 2>&1 || true
  die "Re-run this installer once the Command Line Tools finish installing."
fi
command -v git >/dev/null 2>&1 || die "git is required (it ships with the Command Line Tools)."
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 22 ] 2>/dev/null; then :
else say "No Node.js 22+ on this Mac; the installer will fetch a private copy for Print@ (about 50 MB)."; fi

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
