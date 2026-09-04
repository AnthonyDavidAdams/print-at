# Print@ web portal + iPhone share sheet

A hosted page anyone can open on a phone — no install — that finds the nearest print
shop and sends the job. Same backend serves the iOS share flow.

## Run

```
PRINTAT_FROM="you@gmail.com" GMAIL_ENV=~/.gmail.env node portal/server.js
# open http://localhost:4250
```

- `GET /` — the mobile page (choose file, allow location, pick a shop, send)
- `POST /api/nearby {lat,lon,radiusMi}` — ranked nearby printers (PrinterOn, PrintMe,
  libraries, chains, and OpenStreetMap local shops)
- `POST /api/send {to, subject, message, filename, fileB64, cc}` — emails the job

Sending uses `agent/send_email.py` (Gmail app password in `GMAIL_ENV`). Locally that's
SMTP; on a host that blocks SMTP (e.g. Railway) switch the sender to the Gmail API.

Proximity works because the bundled directory is geocoded by ZIP centroid
(`maintainer/printat-geocode-directory`), so no live geocoder is needed on the server.

## Put it on an iPhone — two ways, no App Store

**A. Add to Home Screen (30 seconds).** Open the portal URL in Safari, tap Share →
*Add to Home Screen*. It gets a Print@ icon and opens full-screen like an app.

**B. Share Sheet via a Shortcut (no Xcode).** In the Shortcuts app, make a shortcut that:
1. accepts *Files / Images / PDFs* as share-sheet input,
2. *Get Current Location*,
3. *Get Contents of URL* → `POST https://<portal>/api/nearby` with the location,
4. shows the shops in a *Choose from List*,
5. *Get Contents of URL* → `POST /api/send` with the file (base64) and chosen shop.

Turn on *Show in Share Sheet* in the shortcut settings. Then "Print@" appears when he
taps Share on any PDF or photo. Share the shortcut by iCloud link — he taps it once to add.

**C. Native Share Extension (App Store / TestFlight).** A small SwiftUI app whose Share
Extension posts to the same `/api` endpoints. Needs Xcode and an Apple Developer account;
scaffold lives in `ios/` when built.
