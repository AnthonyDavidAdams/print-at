# Print@ for Windows (scaffold — help wanted)

The macOS version installs a CUPS backend + PPD and a local agent. Windows needs the
equivalent. This folder is a starting point; it is **not finished** — issues and PRs welcome.

## The shape

Windows doesn't use CUPS. The cleanest path is a **Print Monitor / Port Monitor** (a virtual
printer port) plus the same dispatch agent the Mac uses.

1. **Virtual printer + port monitor.** Register a "Print@" printer whose port is a custom
   monitor. When a job prints, Windows hands the port monitor a spooled file (EMF/XPS/PDF).
   - Simplest v1: a **Redirected Port Monitor** (e.g. the open-source `RedMon`, or a
     `Ports\` registry redirection) that pipes the spool file to `agent\dispatch.exe`.
   - Convert the spool to PDF if needed (Ghostscript, or print as "Microsoft Print to PDF"
     upstream and use our printer only as the destination).
2. **The agent is portable.** `agent/` in this repo is Node + a small Swift locator. On
   Windows, reuse the Node agent almost as-is; replace the Swift `nearprint-locate` with a
   Windows locator (IP geolocation, or the Windows.Devices.Geolocation WinRT API via a tiny
   C#/PowerShell shim). Everything else — search, ranking, email/portal dispatch — is the same.
3. **Options UI.** The Mac reads dispatch options from the PPD. Windows printer prefs use a
   different mechanism (DEVMODE / a printer property sheet). v1 can skip this and read options
   from a small config file / tray app instead.

## Suggested v1 (least code)

- Install "Microsoft Print to PDF"-style virtual printer that writes the PDF to a watched
  folder, and run the Node agent watching that folder. No port-monitor DLL needed.
- Tray app for the dispatch options (optimize-for, radius, shop type).

## Reuse from this repo
- `agent/server.js`, `agent/shops.js`, `agent/rank.js`, `agent/pipeline.js`, `agent/printeron.js`,
  `agent/printme.js`, `agent/libraryprint.js` — cross-platform Node, minimal changes.
- Replace: `helper/` (Swift/CoreLocation), the CUPS `backend/` and `ppd/`, and `install.sh`.

## Status: NOT WORKING YET — contributions wanted.
