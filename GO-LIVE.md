# printat.co go-live checklist

Everything in the code already points at https://printat.co. Two manual steps remain.

## 1. Register the domain
Cloudflare dashboard (175g account, where earthpilot.ai lives):
Domain Registration → Register Domains → `printat.co` → pay. DNS lands on Cloudflare
automatically. (`.com` is taken; `.co` is the product domain.)

## 2. Attach to Railway + point DNS
- In this repo run `railway login` (interactive), then I run:
  `railway domain printat.co --service print-at-network`
  which prints a CNAME target like `xxxx.up.railway.app`.
- In Cloudflare DNS for printat.co add:
  `CNAME  @  ->  <the railway target>`  (proxy OFF / DNS-only so Railway can issue the cert)
- Set the runtime base so QR/email links use the domain:
  `railway variables --service print-at-network --set PRINTAT_NET_BASE=https://printat.co`
- Branded sender for cloud dispatch + device links (so connected drivers send from Print@,
  not a personal Gmail): `PRINTAT_FROM=print@printat.co PRINTAT_FROM_NAME="Print@"`. The
  Gmail-API creds (`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`) already power sending; switch to
  Resend once printat.co is DNS-verified for a real branded from-address + inbound replies.
- Railway issues the cert; live at https://printat.co in a few minutes.

## The driver connects here
Connected drivers hit this same service: `POST /api/device/start` + `/device/confirm` +
`/api/device/poll` (magic-link device auth) and `POST /api/dispatch` (relays a directory
job's PDF from the Print@ address). Nothing extra to deploy — they ship with the network
server. The driver points at `https://printat.co` by default (`cloudBase`, override with
`PRINTAT_CLOUD_BASE`).

## 3. Persistence
Add a volume mounted at `/data` on the Railway service (dashboard → service → Volumes)
so shops, jobs and ratings survive redeploys. Until then the DB resets on each deploy.

## Split
- **GitHub Pages** (anthonydavidadams.github.io/print-at) = the open-source driver home.
- **printat.co** = the product: the two-sided network, the phone portal, and the MCP endpoint.
