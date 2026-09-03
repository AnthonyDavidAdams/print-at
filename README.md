# NearPrint™

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A virtual printer for macOS. Pick **NearPrint** in any Print dialog and the job goes to
the closest print shop that fits your priorities instead of to a device on your desk.

```
Print dialog ──> CUPS ──> backend/nearprint (POST to localhost) ──> agent/server.js
                                                                        │
      locate (Location Services → IP → saved address, confirm dialog)  │
      search Apple Maps for shops / chains / hotels / libraries         │
      rank + research with `claude -p` (hours, price, how to order)     │
      confirm pick ──> email PDF / open upload portal / show phone      ▼
```

## Print-dialog options (under the printer-options section, not Page Setup)

| Option | Choices |
|---|---|
| Optimize for | Closest · Lowest price · Fastest turnaround · Open right now · Best reviews |
| Search radius | 1 / 2 / 5 / 10 / 25 miles |
| Shop type | Anything · Chains only (Staples, FedEx Office, UPS Store, Office Depot) · Local shops · Travel (hotels, libraries, kiosks) |
| Needed by | ASAP · Today · Tomorrow · This week |
| Finishing | Loose · Stapled · 3-hole · Spiral · Comb |
| Paper stock | Standard · Heavy · Cardstock · Glossy |
| How to send | Show me the pick, then send · Send without asking · Just find a shop |
| Confirm my location first | Yes · No |

Color mode, two-sided, copies and paper size are the standard controls.

Page Setup on macOS only carries paper size, orientation and scale, so the dispatch
settings live in the printer-options pane of the Print dialog. Save them as a Preset
("Cheapest, this week") and it becomes one click.

## One printer per shop

Any shop NearPrint finds can become its own printer, so the Print dialog's printer menu
reads like a list of places: **Print at Staples**, **Print at The UPS Store**, **Print at
Bug Press**. Each is a normal queue with the same options, pinned to that shop through its
device URI (`nearprint://localhost/?shop=Staples`), with the location confirmation off and
the priority and delivery defaults copied from the job that created it.

- In the dialog after a job: **Add as printer** (or **Add #1 as printer** in find-only mode).
- From a terminal: `~/nearprint/nearprint-add "Staples" Price Auto` (shop, priority, delivery).
- Remove one: `lpadmin -x Print_at_Staples`.

Printing to a pinned queue skips the search, verifies that shop's hours, price and ordering
method, and sends. If the shop is not within the search radius the agent widens to 25 miles.

## What you see while it runs

The Print dialog closes when you click Print, as it does for every printer. The job then
sits in the NearPrint queue window (the printer icon in the Dock) with a live status line:
"Locating you", "Checking hours, prices and how to order at 8 places", "Waiting for your OK:
The UPS Store, 1.3 mi, open now, est. $1.70", "Emailed to The UPS Store". It leaves the queue
only when dispatch is finished. Cancelling the job there cancels the dispatch and closes any
NearPrint dialog. Failures stay in the queue with the reason.

## Requirements

- macOS 13 or later (tested on 15.6). PPD printers are deprecated by Apple but still work.
- Xcode Command Line Tools (`xcode-select --install`) to build the Swift location helper.
- Node 18 or later.
- [Claude Code](https://claude.com/claude-code) CLI on your PATH. Ranking runs through
  `claude -p`, so it bills to your Claude subscription. Without it NearPrint still works,
  ranked by distance only.
- A Gmail account with an [app password](https://myaccount.google.com/apppasswords) if you
  want NearPrint to email orders. Put `GMAIL_APP_PASSWORD=...` in `~/.gmail.env`.

## Install

```
git clone https://github.com/AnthonyDavidAdams/nearprint ~/nearprint
sudo ~/nearprint/install.sh
```

No terminal for sudo (running it from an agent, say)? `SUDO_ASKPASS=~/nearprint/helper/askpass.sh sudo -A ~/nearprint/install.sh`
asks for the password in a dialog instead.

Then edit `~/Library/Application Support/NearPrint/config.json`:

| Key | Purpose |
|---|---|
| `contactName`, `contactEmail`, `contactPhone` | who the shop should reply to; email is also the SMTP sender |
| `homeAddress` | used when Location Services is unavailable and your IP lands within 25 miles of it |
| `ccSelf` | cc yourself on every order email |
| `claudeModel` | leave blank for the CLI default |
| `gmailEnv` | file holding `GMAIL_APP_PASSWORD` |

Uninstall with `sudo ~/nearprint/uninstall.sh`.

## Test without the print dialog

```
lp -d NearPrint -o Priority=Price -o MaxDistance=10mi -o Delivery=Confirm ~/nearprint/test/sample.pdf
```

Dry run (no dialogs, no email, still does search + AI ranking) for development:

```
NEARPRINT_DRY_RUN=1 node ~/nearprint/agent/server.js
NEARPRINT_DRY_RUN=1 NEARPRINT_SKIP_CLAUDE=1 node ~/nearprint/agent/server.js   # distance only
```

## Where things land

- `~/Library/Application Support/NearPrint/jobs/<id>/` — the PDF, `job.json`, `candidates.json`, `ranking.json`, `receipt.md`
- `~/Library/Application Support/NearPrint/shops.json` — verified facts per shop, reused on later jobs
- `~/Library/Application Support/NearPrint/history.jsonl`
- `~/Library/Logs/NearPrint/agent.log`
- `curl localhost:4243/jobs` — recent jobs

## How submission works

Claude picks one method per shop and only uses an email address it actually found on an
official page. Chains get their upload portal opened with the PDF selected in Finder and
its path on the clipboard. Independents with a published order email get the PDF emailed
with the specs and a request to confirm price and ready time (cc to you). Everything else
shows the phone number and the address with an Open in Maps button.

## Known limits

- Location Services denies ad-hoc-signed CLI tools on some Macs, so the agent falls back to
  IP geolocation (snapped to `homeAddress` when that is nearby) and asks you to confirm or
  type an address.
- Chain portals (FedEx Office, Staples, UPS Store, Office Depot) are opened, not driven.
  Automating those checkouts is the obvious next step.
- PPD-based printers are deprecated by Apple but still work through macOS 15.

## Contributing

Ideas that would make this much better, in rough order:

1. Drive the FedEx Office / Staples / UPS Store / Office Depot checkouts with a browser
   agent instead of opening the portal.
2. PrinterOn discovery for hotels and airports (each printer has an email-to-print address).
3. A Windows port (a port monitor plus the same agent).
4. An iOS share-sheet version.

PRs welcome. Keep the agent dependency-free (Node built-ins only).

## License

MIT
