# Print@ for Linux (scaffold — help wanted)

Linux **uses CUPS**, same as macOS — so this is the closest port. Most of the Mac code moves
over; the pieces to replace are the Swift location helper and the install glue.

## The shape (mostly done for you)

1. **CUPS backend + PPD.** `backend/nearprint` is a POSIX shell script that POSTs the job to
   the local agent — it should run on Linux CUPS as-is. `ppd/PrintAt.ppd` is portable.
   Install the backend to `/usr/lib/cups/backend/` (Linux) instead of
   `/usr/libexec/cups/backend/` (macOS), `chmod 700`, root-owned.
2. **The agent** (`agent/`, Node) is cross-platform. Runs the same. Use a systemd **user
   service** instead of launchd (`~/.config/systemd/user/printat.service`).
3. **Location helper.** Replace the Swift `helper/nearprint-locate` with:
   - IP geolocation (already the fallback in `agent/locate.js`), and/or
   - GeoClue2 over D-Bus for real device location.
4. **UI.** No AppleScript. Replace the Swift panel + `osascript` dialogs with `zenity`/`kdialog`
   for the confirm/pick dialogs, or run headless with "send without asking".

## Install sketch
```
sudo cp backend/printat /usr/lib/cups/backend/printat && sudo chmod 700 /usr/lib/cups/backend/printat
sudo lpadmin -p PrintAt -E -v printat://localhost/ -P ppd/PrintAt.ppd -D "Print@ Nearby"
systemctl --user enable --now printat   # runs agent/server.js
```

## To replace
- `helper/` (Swift) → GeoClue2 or IP-only locator
- `osascript` dialogs / SwiftUI panel → zenity/kdialog, or headless
- `install.sh` paths (`/usr/libexec` → `/usr/lib`), launchd → systemd user unit

## Status: SHOULD BE CLOSE — needs a Linux tester. Contributions wanted.
