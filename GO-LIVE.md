# printat.co go-live

Status as of 2026-09-29: **LIVE.** https://printat.co and https://www.printat.co serve with valid Railway certs (both `CERTIFICATE_STATUS_TYPE_VALID`). Fix was the `_railway-verify` TXT records below.

- `printat.co` registered 2026-09-26 via Cloudflare Registrar (175g account, $30/yr, auto-renew on).
- Railway custom domains on service `print-at-network`: `printat.co` (CNAME target
  `uw3kj8yi.up.railway.app`, id ec6e7b74-e399-494d-95d8-d3a9bbb6b363) and `www.printat.co` (`2lbe7730.up.railway.app`, id b1b4abdd-5152-4122-889e-f85b9a07f780). Both DNS-only
  in Cloudflare (proxy OFF so Railway issues the cert).
- Volume mounted at `/data` (`PRINTAT_NET_DIR=/data`) so shops, jobs and codes survive deploys.
- `PRINTAT_NET_BASE=https://printat.co`, `PRINTAT_FROM_NAME=Print@`.

## Railway ownership TXT records (found 2026-09-29)
The dashboard's "Show DNS records" (not the GraphQL API) also requires a TXT per host:
- `_railway-verify`      TXT `railway-verify=1a111a69dcf58a772cc1bcb6a838273b80b4dfb1b38eca4e690ffd7cede8b0bc`
- `_railway-verify.www`  TXT `railway-verify=ffee362b040fc1670d99af663c3ce6bf2cabcb63c35b82e9c1e4a9250b5f8724`
Tokens are per custom-domain object: recreating the domain changes them.

## Cert wedge (2026-09-26)
Both domains sat in `CERTIFICATE_STATUS_TYPE_VALIDATING_OWNERSHIP` with DNS `PROPAGATED`
for 70+ min; `customDomainIssueCertificate` and delete+recreate (new targets above) did not
clear it. Railway's edge answers `{"code":404,"message":"Application not found"}` for the
host, i.e. the route is not attached until ownership validates (same pattern as
onramp.earthpilot.ai, wedged since Aug 18). No Railway status incident.

Fallback (no longer needed, left in place unrouted): a Cloudflare Worker `printat-proxy` exists in the 175g
account (still the Hello World starter, no routes). To activate: paste the reverse-proxy
code (kept in the session scratchpad / below), add routes `printat.co/*` and
`www.printat.co/*`, and orange-cloud both CNAMEs. Cloudflare's Universal SSL then serves
printat.co and the Worker forwards every method/body to
print-at-network-production.up.railway.app. Revert = grey-cloud the CNAMEs + delete routes.

```js
const O='print-at-network-production.up.railway.app';
export default{async fetch(r){const u=new URL(r.url);const h=u.hostname;u.hostname=O;u.protocol='https:';
const hd=new Headers(r.headers);hd.set('x-forwarded-host',h);hd.set('x-forwarded-proto','https');const m=r.method;
const res=await fetch(u.toString(),{method:m,headers:hd,body:(m==='GET'||m==='HEAD')?undefined:r.body,redirect:'manual'});
const oh=new Headers(res.headers);const l=oh.get('location');if(l&&l.includes(O))oh.set('location',l.split(O).join(h));
return new Response(res.body,{status:res.status,statusText:res.statusText,headers:oh});}};
```

## Email (done 2026-09-30)
- Outbound: **Resend**, from `print@printat.co` (`RESEND_API_KEY`, `PRINTAT_FROM`, `PRINTAT_FROM_NAME` on Railway;
  `network/mail.js` prefers Resend, then Gmail API, then SMTP). Domain verified: TXT `resend._domainkey`,
  CNAME `rsend`/`send` → *.forge.rmta.net.
- Inbound: Cloudflare Email Routing (MX route1-3.mx.cloudflare.net). `print@printat.co` → anthony@175g.com.
  Catch-all reserved for the per-job reply Worker (not built yet).
- Relayed orders set `Reply-To: <customer>`; portal jobs are held until the customer confirms by email.
- Local-only drivers send via Mail.app (`sender: mailapp`), no credentials.

## Still open
- Per-job reply addresses (`job-<ref>@printat.co`) + Worker/inbound endpoint that logs the shop's reply and forwards it to the customer.
- Live PrinterOn send never tested end to end (creates a real held job).

## The driver connects here
Connected drivers hit this same service: `POST /api/device/start` + `/device/confirm` +
`/api/device/poll` (magic-link device auth) and `POST /api/dispatch` (relays a directory
job's PDF from the Print@ address). The driver points at `https://printat.co` by default
(`cloudBase`, override with `PRINTAT_CLOUD_BASE`).

## Split
- **GitHub Pages** (anthonydavidadams.github.io/print-at) = the open-source driver home.
- **printat.co** = the product: the two-sided network, the phone portal, and the MCP endpoint.

## Re-attaching a domain
`railway domain <host>` may say Unauthorized; use the GraphQL `customDomainCreate` mutation
with the CLI's `user.accessToken` (see memory `feedback_railway_custom_domain_api`).
