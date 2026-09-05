# Print@ Network — our own release-code print network

Any shop with a printer and a browser can offer printing as a foot-traffic draw.
No release-station software — the shop prints jobs from this web page on any device.

- **Customers** (`/`): find a nearby Print@ Network shop, send a PDF/photo, get a pickup code.
- **Shops** (`/shop`): sign up (email-verified), log in by magic link, print the queue from
  the browser, mark picked up. Customers rate the shop afterward.

Run: `PRINTAT_FROM="you@gmail.com" node network/server.js` → http://localhost:4260

Storage: built-in `node:sqlite` at `~/Library/Application Support/PrintAtNetwork/`.
Auth: magic links (email verification is the link itself). Email via `agent/send_email.py`
(SMTP locally; swap to Resend/Gmail API on a host that blocks SMTP).

The wedge: Print@ aggregates the existing networks (PrinterOn, PrintMe, chains, libraries);
this adds the places no network covers — the local coffee shop, the small-town retailer —
and lets Print@ recruit a shop when there isn't one nearby.
