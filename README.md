# Print@™

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A virtual printer for macOS. Pick **Print@ Nearby** in any Print dialog and the job goes to
the closest print shop that fits your priorities instead of to a device on your desk. Once a
shop has been used it becomes its own printer: **Print@ Staples, Eureka**, **Print@ The UPS
Store, Eureka**. (Internal identifiers such as the `printat://` device URI and the
`io.printat.agent` launchd label keep the old working name.)

```
Print dialog ──> CUPS ──> backend/printat (POST to localhost) ──> agent/server.js
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
| Confirm my location first | Only when unsure (default) · Always · Never |

Color mode, two-sided, copies and paper size are the standard controls.

Page Setup on macOS only carries paper size, orientation and scale, so the dispatch
settings live in the printer-options pane of the Print dialog. Save them as a Preset
("Cheapest, this week") and it becomes one click.

## One printer per shop, and no repeat searches

The first time a shop is actually used (order emailed, upload page opened, or chosen in
find-only mode) two things happen:

1. It becomes a printer of its own, **Print@ Staples, Eureka**, pinned to that shop through
   its device URI (`printat://localhost/?shop=Staples`), location confirmation off, priority
   and delivery defaults copied from the job that created it.
2. **Print@ Nearby** remembers it for that spot. The next job from within 1.5 miles with the
   same priority and shop type skips the search and offers that shop straight away, with a
   **Search again** button if you want a fresh look. Memories expire after 30 days.

From a terminal: `~/printat/printat-add "Staples" Price Auto Eureka` (shop, priority,
delivery, city). Remove one: `lpadmin -x PrintAt_Staples_Eureka`.

Printing to a pinned queue skips the search, verifies that shop's hours, price and ordering
method, and sends. If the shop is not within the search radius the agent widens to 25 miles.

## What you see while it runs

The Print dialog closes when you click Print, as it does for every printer. Two things then
show the job:

- **One Print@ window** that follows the job from "Locating you" through the ranked list
  with a Send button to the result. While shops are being checked it shows what is actually
  happening, streamed from the ranking run ("Searching the web: Staples Eureka print hours",
  "Reading staples.com"). It is a small native app (`helper/panel`), launched per job and
  driven by the agent over localhost. Closing it cancels the job.
- **The queue window** (the printer icon in the Dock) with the same status as a live line.
  The job leaves the queue only when dispatch is finished. Cancelling there cancels the
  dispatch and closes the window. Failures stay in the queue with the reason.

With "Send without asking" and location confirmation off there is no window at all, only a
notification when the order has gone out.

## Requirements

- macOS 13 or later (tested on 15.6). PPD printers are deprecated by Apple but still work.
- Xcode Command Line Tools (`xcode-select --install`) to build the Swift location helper.
- Node 18 or later.
- [Claude Code](https://claude.com/claude-code) CLI on your PATH. Ranking runs through
  `claude -p`, so it bills to your Claude subscription. Without it Print@ still works,
  ranked by distance only.
- A Gmail account with an [app password](https://myaccount.google.com/apppasswords) if you
  want Print@ to email orders. Put `GMAIL_APP_PASSWORD=...` in `~/.gmail.env`.

## Install

```
git clone https://github.com/AnthonyDavidAdams/print-at ~/printat
sudo ~/printat/install.sh
```

No terminal for sudo (running it from an agent, say)? `SUDO_ASKPASS=~/printat/helper/askpass.sh sudo -A ~/printat/install.sh`
asks for the password in a dialog instead.

Then edit `~/Library/Application Support/PrintAt/config.json`:

| Key | Purpose |
|---|---|
| `contactName`, `contactEmail`, `contactPhone` | who the shop should reply to; email is also the SMTP sender |
| `homeAddress` | used when Location Services is unavailable and your IP lands within 25 miles of it |
| `ccSelf` | cc yourself on every order email |
| `claudeModel` | leave blank for the CLI default |
| `gmailEnv` | file holding `GMAIL_APP_PASSWORD` |

Uninstall with `sudo ~/printat/uninstall.sh`.

## Test without the print dialog

```
lp -d PrintAt -o Priority=Price -o MaxDistance=10mi -o Delivery=Confirm ~/printat/test/sample.pdf
```

Dry run (no dialogs, no email, still does search + AI ranking) for development:

```
PRINTAT_DRY_RUN=1 node ~/printat/agent/server.js
PRINTAT_DRY_RUN=1 PRINTAT_SKIP_CLAUDE=1 node ~/printat/agent/server.js   # distance only
```

## Console

**Print@ Console** in `~/Applications` (Spotlight finds it; there is also a Console button in
the job window) is a native window around `http://127.0.0.1:4243/`. It lists every Print@ printer with its pinned shop and defaults,
the remembered shops (what "Print@ Nearby" will reuse instead of searching), the verified
shop facts, and recent jobs, with Remove and Forget buttons and an Add printer form. The
same printers show up in System Settings › Printers & Scanners, where they can be renamed
or removed like any other printer.

## Where things land

- `~/Library/Application Support/PrintAt/jobs/<id>/` — the PDF, `job.json`, `candidates.json`, `ranking.json`, `receipt.md`
- `~/Library/Application Support/PrintAt/shops.json` — verified facts per shop, reused on later jobs
- `~/Library/Application Support/PrintAt/memory.json` — which shop was used from where
- `~/Library/Application Support/PrintAt/history.jsonl`
- `~/Library/Logs/PrintAt/agent.log`
- `curl localhost:4243/jobs` — recent jobs

## How submission works

The rule is automatable first. A shop whose order can be placed by email is ranked above a
cheaper or closer one that only has a web upload form, and the window shows only the
automatable shops. Form-only and phone-only shops sit behind a "Show other options" button
and are offered directly only when nothing automatable exists nearby.

- **Email**: the PDF goes out with the specs and a request to confirm price and ready time,
  cc'd to you. Only addresses found on an official page are used, never guessed. The UPS
  Store's per-store `store####@theupsstore.com` pattern and PrinterOn email-to-print
  addresses count.
- **PrinterOn**: hotel business centers, libraries and airport lounges on HP's PrinterOn
  network each have an email-to-print address. Print@ ships the whole PrinterOn public
  directory (`data/printeron-all.json`: 3,519 venues in 53 countries, 3,212 online with
  email and colour, plus the offline ones for later refresh), so nearby printers appear
  instantly with no lookup during a job. Before offering one it re-checks that printer live
  (about 150 ms) so a dead one is never shown. The PDF is emailed to the printer, PrinterOn
  mails you a 6-digit release code, and you collect it at the desk; libraries charge a few
  cents a page at the release station, hotels are often free for guests. Refresh with
  `node printat-printeron-sync ALL` (or `US`), watched on the WOPR board at
  `http://127.0.0.1:4243/sync`.
- **Your own emails**: know a store's order address the agent could not find (a local CVS,
  Walmart or Walgreens photo counter, say)? Enter it in the console next to that shop, or
  pass it when creating a pinned printer (`printat-add "CVS" Nearest Confirm Eureka
  photo1234@cvs.com`). That shop is treated as automatable from then on.
- **Web upload**: the portal is opened with the PDF selected in Finder and its path on the
  clipboard. Driving these checkouts with a browser agent is the obvious next step.
- **Phone or walk-in**: address, phone, Open in Maps.

## Known limits

- Location Services denies ad-hoc-signed CLI tools on some Macs, so the agent falls back to
  IP geolocation, snapped to `homeAddress` when that is nearby. "Only when unsure" asks you
  to confirm only when the fix is IP-only; a Location Services fix or the saved address is
  used as is.
- Chain portals (FedEx Office, Staples, UPS Store, Office Depot) are opened, not driven.
  Automating those checkouts is the obvious next step.
- PPD-based printers are deprecated by Apple but still work through macOS 15.

## Contributing

Ideas that would make this much better, in rough order:

1. Drive the FedEx Office / Staples / UPS Store / Office Depot checkouts with a browser
   agent instead of opening the portal.
2. ePRINTit's directory (the other public-printing network) only searches by venue name;
   a way to enumerate it by location would add more hotels and libraries.
3. A Windows port (a port monitor plus the same agent).
4. An iOS share-sheet version.

PRs welcome. Keep the agent dependency-free (Node built-ins only).

## License

MIT
