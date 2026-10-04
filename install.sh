#!/bin/bash
# Installs Print@: builds the location helper, installs the CUPS backend + PPD,
# registers the "Print@" printer, and starts the user agent via launchd.
# Run with:  sudo ./install.sh      (sudo is needed for the backend + lpadmin)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PRINTAT_BASE="${PRINTAT_BASE:-https://printat.co}"

# Everything below is logged; if the install fails (or logs a warning) we offer to send the
# log to Print@ support so the problem gets fixed for the next person too.
REAL_USER_EARLY="${SUDO_USER:-$USER}"; LOGDIR="$(eval echo "~$REAL_USER_EARLY")/Library/Logs/PrintAt"; mkdir -p "$LOGDIR" 2>/dev/null || LOGDIR=/tmp
INSTALL_LOG="$LOGDIR/install.log"; sudo -u "$REAL_USER_EARLY" sh -c "rm -f '$INSTALL_LOG'; umask 077; : > '$INSTALL_LOG'" 2>/dev/null || INSTALL_LOG=/tmp/printat-install.log
exec > >(tee -a "$INSTALL_LOG") 2>&1
report_install_problem() {
  local kind="$1"
  echo
  echo "!! Install $kind. The log is at $INSTALL_LOG"
  local ans="y"
  if ( : </dev/tty ) 2>/dev/null; then read -r -p "Send this log to Print@ support so we can fix it (nothing private; versions + this output)? [Y/n] " ans </dev/tty || ans="y"; fi
  case "$ans" in n|N|no|NO) echo "Not sent. You can always run: printat bug \"install $kind\""; return 0 ;; esac
  local email=""; if ( : </dev/tty ) 2>/dev/null; then read -r -p "Your email, so we can reply (optional): " email </dev/tty || email=""; fi
  python3 - "$INSTALL_LOG" "$kind" "$email" "$PRINTAT_BASE" <<'PY' || echo "(could not send; email print@printat.co with the log)"
import json,sys,subprocess,urllib.request,platform
log,kind,email,base=sys.argv[1:5]
tail=open(log,errors='replace').read()[-12000:]
def sh(c):
    try: return subprocess.run(c,capture_output=True,text=True,timeout=8).stdout.strip()
    except Exception: return ''
diag={'macos':sh(['sw_vers','-productVersion']),'arch':platform.machine(),'node':sh(['node','--version']),'git':sh(['git','--version']),'xcode_clt':sh(['xcode-select','-p']),'install_log_tail':tail}
body=json.dumps({'email':email,'source':'installer','description':f'Installer {kind} (automatic report)','diagnostics':diag}).encode()
r=urllib.request.urlopen(urllib.request.Request(base+'/api/bugs',data=body,headers={'content-type':'application/json'}),timeout=30)
j=json.loads(r.read()); print(f"Sent — ticket #{j.get('id')}."+(f"\nKnown problem: {j.get('title')}\n\n{j.get('answer')}" if j.get('answer') else " A person will look at it."))
PY
}
trap 'report_install_problem "failed at line $LINENO"' ERR
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME="$(eval echo "~$REAL_USER")"
REAL_UID="$(id -u "$REAL_USER")"
NODE="$(sudo -u "$REAL_USER" -i which node 2>/dev/null || which node 2>/dev/null || true)"
# Use the private Node that an earlier install fetched, if the Mac still has no Node 22+.
[ -x "$ROOT/.node/bin/node" ] && { NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"; [ "$NODE_MAJOR" -ge 22 ] 2>/dev/null || NODE="$ROOT/.node/bin/node"; }
NODE_MAJOR="$([ -n "$NODE" ] && "$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ -z "$NODE" ] || [ "$NODE_MAJOR" -lt 22 ] 2>/dev/null; then
  # No usable Node.js: fetch the official macOS build into ~/printat/.node (no admin rights, nothing
  # else on the Mac changes). This is the #1 reason installs used to fail.
  echo "==> Node.js 22+ not found${NODE:+ (have $("$NODE" --version 2>/dev/null))}; fetching a private copy for Print@ (about 50 MB)"
  NARCH="$(uname -m)"; [ "$NARCH" = "arm64" ] || NARCH="x64"
  NTAR="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v22[0-9.]*-darwin-$NARCH.tar.gz" | head -1)"
  [ -n "$NTAR" ] || { echo "!! Could not find a Node.js 22 download for $NARCH. Install Node.js from https://nodejs.org and re-run."; exit 1; }
  sudo -u "$REAL_USER" bash -c "rm -rf '$ROOT/.node' && mkdir -p '$ROOT/.node' && curl -fsSL 'https://nodejs.org/dist/latest-v22.x/$NTAR' | tar -xz -C '$ROOT/.node' --strip-components=1" \
    || { echo "!! Node.js download failed. Install Node.js from https://nodejs.org and re-run."; exit 1; }
  NODE="$ROOT/.node/bin/node"
  echo "    using $("$NODE" --version) at $NODE"
fi
PRINTER="PrintAt"

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo $0"; exit 1; fi

echo "Print@ is an open-source beta, provided as-is, use at your own risk. By installing you agree to https://printat.co/terms (privacy: https://printat.co/privacy)."
echo "==> Building location helper and panel"
sudo -u "$REAL_USER" bash -c "cd '$ROOT/helper' && swiftc -O -suppress-warnings main.swift -o printat-locate -framework CoreLocation -framework MapKit \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker Info.plist 2>&1 | grep -v warning || true; codesign -s - -f printat-locate; cd '$ROOT/helper/panel' && swiftc -O -suppress-warnings main.swift -o PrintAtPanel -framework SwiftUI -framework AppKit 2>&1 | grep -v warning || true; mkdir -p PrintAt.app/Contents/MacOS PrintAt.app/Contents/Resources; cp PrintAtPanel PrintAt.app/Contents/MacOS/PrintAtPanel; cp Bundle-Info.plist PrintAt.app/Contents/Info.plist; cp '$ROOT/icon/PrintAt.icns' PrintAt.app/Contents/Resources/PrintAt.icns; codesign -s - -f --deep PrintAt.app; cd '$ROOT/helper/console' && swiftc -O -suppress-warnings main.swift -o PrintAtConsole -framework AppKit -framework WebKit 2>&1 | grep -v warning || true; rm -rf 'Print@ Console.app'; mkdir -p 'Print@ Console.app/Contents/MacOS' 'Print@ Console.app/Contents/Resources'; cp PrintAtConsole 'Print@ Console.app/Contents/MacOS/'; cp Bundle-Info.plist 'Print@ Console.app/Contents/Info.plist'; cp '$ROOT/icon/PrintAt.icns' 'Print@ Console.app/Contents/Resources/PrintAt.icns'; codesign -s - -f --deep 'Print@ Console.app'; mkdir -p '$REAL_HOME/Applications'; rm -rf '$REAL_HOME/Applications/Print@ Console.app'; cp -R 'Print@ Console.app' '$REAL_HOME/Applications/'"

for bin in "$ROOT/helper/printat-locate" "$ROOT/helper/panel/PrintAt.app/Contents/MacOS/PrintAtPanel" "$ROOT/helper/console/Print@ Console.app/Contents/MacOS/PrintAtConsole"; do
  [ -x "$bin" ] || { echo "!! build failed: $bin is missing (is Xcode Command Line Tools installed? xcode-select --install)"; exit 1; }
done
echo "==> Installing icon + CUPS backend"
mkdir -p /Library/Printers/Icons
install -m 0644 "$ROOT/icon/PrintAt.icns" /Library/Printers/Icons/PrintAt.icns
install -m 0755 -o root -g wheel "$ROOT/backend/printat" /usr/libexec/cups/backend/printat

echo "==> Registering printer '$PRINTER'"
lpadmin -x "$PRINTER" 2>/dev/null || true
lpadmin -p "$PRINTER" -E -v printat://localhost/ -P "$ROOT/ppd/PrintAt.ppd" \
  -D "Print@ Nearby" -L "Nearest print shop" -o printer-is-shared=false \
  -o printer-error-policy=retry-job
cupsenable "$PRINTER"; cupsaccept "$PRINTER"

echo "==> Writing config + launchd agent"
APP="$REAL_HOME/Library/Application Support/PrintAt"
sudo -u "$REAL_USER" mkdir -p "$APP" "$REAL_HOME/Library/Logs/PrintAt"
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
  "sender": "mailapp",
  "mailAccount": "",
  "gmailEnv": "$REAL_HOME/.gmail.env",
  "smtpUser": ""
}
JSON
  echo "    wrote $APP/config.json — fill in contactEmail (used as SMTP sender) and contactPhone"
fi
PLIST="$REAL_HOME/Library/LaunchAgents/io.printat.agent.plist"
sudo -u "$REAL_USER" mkdir -p "$REAL_HOME/Library/LaunchAgents"
sed -e "s|__NODE__|$NODE|g" -e "s|__ROOT__|$ROOT|g" -e "s|__HOME__|$REAL_HOME|g" "$ROOT/launchd/io.printat.agent.plist.template" \
  | sudo -u "$REAL_USER" tee "$PLIST" >/dev/null
plutil -lint "$PLIST" >/dev/null || { echo "!! generated launchd plist is invalid"; exit 1; }
launchctl bootout "gui/$REAL_UID/io.printat.agent" 2>/dev/null || true
sleep 0.5
# launchd sometimes answers "Bootstrap failed: 5: Input/output error" when the old instance is
# still winding down; a kickstart right after brings it up. Neither is fatal.
launchctl bootstrap "gui/$REAL_UID" "$PLIST" 2>/dev/null || launchctl kickstart -k "gui/$REAL_UID/io.printat.agent" 2>/dev/null || true
for i in 1 2 3 4 5 6; do curl -sf "http://127.0.0.1:4243/health" >/dev/null && break; sleep 1; done
if curl -sf "http://127.0.0.1:4243/health" >/dev/null; then echo "    agent is up"; else echo "    WARNING: agent did not answer on :4243 — check ~/Library/Logs/PrintAt/"; fi

echo "==> Installing 'printat' command"
mkdir -p /usr/local/bin 2>/dev/null; ln -sf "$ROOT/bin/printat" /usr/local/bin/printat 2>/dev/null && echo "    /usr/local/bin/printat -> repo" || echo "    (could not symlink; run $ROOT/bin/printat directly)"

echo
echo "Done. 'Print@ Nearby' is now a printer in every Print dialog. 'Print@ Console' is in ~/Applications."
echo
echo "What happens when you hit Print:"
echo "  1. Choose 'Print@ Nearby' as the printer. Options (closest/cheapest, radius, finishing) are under"
echo "     Printer Options > Printer Features > Print@ Dispatch. In Chrome, use 'Print using system dialog' to see them."
echo "  2. A Print@ window opens and shows it locating you and checking nearby shops (a minute or two)."
echo "  3. It shows the best shop and how the job will be sent; click 'Use this shop' (or it sends automatically if you chose that)."
echo "  4. The order goes out; the pickup or release code comes back to your email."
echo "Test from a terminal:  lp -d PrintAt -o Delivery=FindOnly some.pdf   (finds a shop, sends nothing)"
if [ -r /dev/tty ] && [ -f "$ROOT/test/sample-boarding-pass.pdf" ]; then
  read -r -p "Want to see it work right now? It prints a sample boarding pass in find-only mode: a Print@ window opens, finds a shop near you, sends nothing. [Y/n] " demo </dev/tty || demo=y
  case "$demo" in n|N|no|NO) ;; *)
    sudo -u "$REAL_USER" lp -d PrintAt -o Delivery=FindOnly -o ConfirmLocation=Auto -t "Print@ demo" "$ROOT/test/sample-boarding-pass.pdf" >/dev/null 2>&1 \
      && echo "    Sent. Watch for the Print@ window (it may take a minute or two)." || echo "    Could not queue the demo; try: lp -d PrintAt -o Delivery=FindOnly $ROOT/test/sample-boarding-pass.pdf" ;;
  esac
fi
if grep -qiE "warning|Bootstrap failed|error" "$INSTALL_LOG"; then trap - ERR; report_install_problem "finished with warnings"; fi
trap - ERR
# Tell Print@ an install finished (versions only, no personal data) so the maintainer hears about it.
IDF="$REAL_HOME/Library/Application Support/PrintAt/install-id"; KIND=update
[ -s "$IDF" ] || { KIND=new; sudo -u "$REAL_USER" sh -c "mkdir -p '$(dirname "$IDF")'; umask 077; head -c 16 /dev/urandom | xxd -p > '$IDF'" 2>/dev/null || true; }
INSTALL_ID="$(cat "$IDF" 2>/dev/null || echo unknown)" KIND="$KIND" VERSION="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo ?)" NODEV="$("$NODE" --version 2>/dev/null || echo ?)" PRINTAT_BASE="$PRINTAT_BASE" python3 - <<'PY' >/dev/null 2>&1 || true
import json,os,platform,subprocess,urllib.request
macos=subprocess.run(["sw_vers","-productVersion"],capture_output=True,text=True).stdout.strip()
b=json.dumps({"install_id":os.environ["INSTALL_ID"],"kind":os.environ["KIND"],"version":os.environ["VERSION"],"macos":macos,"arch":platform.machine(),"node":os.environ["NODEV"]}).encode()
urllib.request.urlopen(urllib.request.Request(os.environ["PRINTAT_BASE"]+"/api/install",data=b,headers={"content-type":"application/json"}),timeout=15)
PY
echo
echo "Last step: connect this Mac to Print@ in the console that just opened (enter your email, click the link we send)."
echo "    http://127.0.0.1:4243/     (or in Terminal: printat connect your@email)"
echo "Skip it to stay fully local: orders go out through Mail.app from whatever account you already have there."
sleep 1; sudo -u "$REAL_USER" open "http://127.0.0.1:4243/" >/dev/null 2>&1 || true
