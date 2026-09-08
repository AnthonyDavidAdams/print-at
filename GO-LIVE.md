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
- Railway issues the cert; live at https://printat.co in a few minutes.

## 3. Persistence
Add a volume mounted at `/data` on the Railway service (dashboard → service → Volumes)
so shops, jobs and ratings survive redeploys. Until then the DB resets on each deploy.

## Split
- **GitHub Pages** (anthonydavidadams.github.io/print-at) = the open-source driver home.
- **printat.co** = the product: the two-sided network, the phone portal, and the MCP endpoint.
