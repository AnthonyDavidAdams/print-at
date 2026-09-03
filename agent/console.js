'use strict';
// Print@ console at http://127.0.0.1:4243/ — the printers, remembered shops,
// verified shop facts and recent jobs, with remove/forget buttons.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { APP_DIR, HISTORY_PATH, SHOP_CACHE_PATH, CONFIG_PATH, JOBS_DIR, ROOT, log } = require('./config');

const MEMORY_PATH = path.join(APP_DIR, 'memory.json');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

function printers() {
  let out = '';
  try { out = execFileSync('/usr/bin/lpstat', ['-v'], { encoding: 'utf8' }); } catch { return []; }
  return out.split('\n').map(l => l.match(/^device for (\S+): (nearprint:\/\/\S*)/)).filter(Boolean).map(m => {
    const queue = m[1];
    let info = queue, shop = '', email = '';
    try { info = (execFileSync('/usr/bin/lpstat', ['-l', '-p', queue], { encoding: 'utf8' }).match(/Description: (.*)/) || [])[1] || queue; } catch {}
    try { const u = new URL(m[2]); shop = u.searchParams.get('shop') || ''; email = u.searchParams.get('email') || ''; } catch {}
    let defaults = {};
    try {
      const ppd = fs.readFileSync(`/etc/cups/ppd/${queue}.ppd`, 'latin1');
      for (const k of ['Priority', 'Delivery', 'ConfirmLocation', 'MaxDistance', 'ShopType']) defaults[k] = (ppd.match(new RegExp(`^\\*Default${k}:\\s*(\\S+)`, 'm')) || [])[1] || '';
    } catch {}
    return { queue, info, shop, email, defaults, uri: m[2] };
  });
}

function page(cfg) {
  const ps = printers();
  const mem = readJson(MEMORY_PATH, []);
  const shops = readJson(SHOP_CACHE_PATH, {});
  const hist = fs.existsSync(HISTORY_PATH) ? fs.readFileSync(HISTORY_PATH, 'utf8').trim().split('\n').filter(Boolean).map(l => readJson === null ? null : JSON.parse(l)).reverse().slice(0, 25) : [];
  const row = cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  const btn = (action, fields, label) => `<form method="post" action="${action}" style="display:inline">${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}<button>${label}</button></form>`;
  return `<!doctype html><meta charset="utf-8"><title>Print@ console</title>
<style>
body{font:14px/1.45 -apple-system,system-ui,sans-serif;color:#1c2430;background:#f6f7f9;margin:0;padding:32px 40px;max-width:1100px}
h1{font-size:22px;margin:0 0 4px}h1 sup{font-size:10px}h2{font-size:15px;margin:28px 0 8px;letter-spacing:.02em;text-transform:uppercase;color:#5b6573}
table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e3e6ea;border-radius:8px;overflow:hidden}
td,th{padding:8px 10px;border-top:1px solid #eceff2;text-align:left;vertical-align:top;font-size:13px}th{background:#fafbfc;font-weight:600;color:#5b6573;border-top:0}
code{font:12px ui-monospace,Menlo,monospace;background:#eef0f3;padding:1px 4px;border-radius:3px}
button{font:12px -apple-system,system-ui;padding:3px 9px;border:1px solid #c9ced5;border-radius:6px;background:#fff;cursor:pointer}button:hover{background:#f0f2f5}
.muted{color:#6b7480}.path{font-size:12px;color:#6b7480;margin-top:6px}
form.inline{display:flex;gap:8px;align-items:center;margin-top:10px}input[type=text]{font:13px -apple-system,system-ui;padding:4px 8px;border:1px solid #c9ced5;border-radius:6px;min-width:220px}
</style>
<h1>Print@<sup>™</sup> console</h1>
<div class="muted">Agent on 127.0.0.1:${cfg.port} · contact ${esc(cfg.contactName)} &lt;${esc(cfg.contactEmail)}&gt; · home ${esc(cfg.homeAddress || 'not set')}</div>
<div class="path">Edit contact details, home address and SMTP in <code>${esc(CONFIG_PATH)}</code>. Printers also appear in System Settings › Printers &amp; Scanners.</div>

<h2>Printers</h2>
<table><tr><th>Name in Print dialog</th><th>Queue</th><th>Pinned shop</th><th>Order email</th><th>Defaults</th><th></th></tr>
${ps.map(p => row([`<strong>${esc(p.info)}</strong>`, `<code>${esc(p.queue)}</code>`, p.shop ? esc(p.shop) : '<span class="muted">searches nearby</span>', p.email ? esc(p.email) : '<span class="muted">found per job</span>',
  `<span class="muted">${Object.entries(p.defaults).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' · ')}</span>`,
  p.queue === 'NearPrint' ? '' : btn('/printers/remove', { queue: p.queue }, 'Remove')])).join('')}
</table>
<form class="inline" method="post" action="/printers/add"><input type="text" name="shop" placeholder="Shop name, e.g. Staples" required><input type="text" name="city" placeholder="City (optional)"><input type="text" name="email" placeholder="Order email (optional)"><button>Add printer</button></form>

<h2>Remembered shops (used instead of searching)</h2>
<table><tr><th>Near</th><th>When</th><th>Priority / type</th><th>Shop</th><th>How</th><th></th></tr>
${mem.length ? mem.map((e, i) => row([esc(e.address), new Date(e.at).toLocaleDateString(), `${esc(e.priority)} / ${esc(e.shopType)}`, `<strong>${esc(e.pick.name)}</strong><br><span class="muted">${esc(e.pick.address)}</span>`,
  esc((e.pick.submit || {}).method || '') + ' ' + esc((e.pick.submit || {}).email || (e.pick.submit || {}).url || ''), btn('/memory/forget', { i }, 'Forget')])).join('') : row(['<span class="muted">nothing yet</span>', '', '', '', '', ''])}
</table>

<h2>Verified shop facts (reused on later jobs)</h2>
<div class="path">Know a shop's order email that the agent could not find? Enter it here and that shop becomes automatable from then on.</div>
<table><tr><th>Shop</th><th>Hours</th><th>Pricing</th><th>Order via</th><th>Order email (yours)</th><th>Verified</th><th></th></tr>
${Object.entries(shops).map(([k, v]) => row([`<strong>${esc(v.name)}</strong><br><span class="muted">${esc(v.address)}</span>`, esc(v.hours_today), esc(v.cost_basis), esc((v.submit || {}).method || '') + ' ' + esc((v.submit || {}).email || (v.submit || {}).url || (v.submit || {}).phone || ''),
  `<form method="post" action="/shops/email" style="display:flex;gap:4px"><input type="hidden" name="key" value="${esc(k)}"><input type="text" name="email" value="${esc(v.manual_email || '')}" placeholder="orders@shop.com" style="min-width:150px"><button>Save</button></form>`,
  esc(v.verified), btn('/shops/forget', { key: k }, 'Forget')])).join('') || row(['<span class="muted">nothing yet</span>', '', '', '', '', '', ''])}
</table>
<div class="path">Files: <code>${esc(MEMORY_PATH)}</code> · <code>${esc(SHOP_CACHE_PATH)}</code> · jobs in <code>${esc(JOBS_DIR)}</code></div>

<h2>Recent jobs</h2>
<table><tr><th>When</th><th>Document</th><th>Outcome</th><th>Shop</th></tr>
${hist.map(h => row([new Date(h.at).toLocaleString(), esc(h.title), esc(h.status), esc(h.shop || '')])).join('') || row(['<span class="muted">none</span>', '', '', ''])}
</table>`;
}

function form(req, cb) {
  let b = '';
  req.on('data', c => b += c);
  req.on('end', () => cb(Object.fromEntries(new URLSearchParams(b))));
}

function handle(req, res, cfg) {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && (url === '/' || url === '/console')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page(cfg));
    return true;
  }
  if (req.method !== 'POST') return false;
  const back = () => { res.writeHead(303, { Location: '/' }); res.end(); };
  if (url === '/printers/remove') return form(req, f => { if (f.queue && f.queue !== 'NearPrint') { spawnSync('/usr/sbin/lpadmin', ['-x', f.queue]); log(`console: removed printer ${f.queue}`); } back(); }), true;
  if (url === '/printers/add') return form(req, f => {
    if (f.shop) { const r = spawnSync(path.join(ROOT, 'nearprint-add'), [f.shop, 'Nearest', 'Confirm', f.city || '', f.email || ''], { encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH + ':/usr/sbin:/sbin' } }); log(`console: add printer ${f.shop}: ${(r.stdout || r.stderr || '').trim()}`); }
    back();
  }), true;
  if (url === '/memory/forget') return form(req, f => { const m = readJson(MEMORY_PATH, []); m.splice(Number(f.i), 1); fs.writeFileSync(MEMORY_PATH, JSON.stringify(m, null, 2)); back(); }), true;
  if (url === '/shops/email') return form(req, f => {
    const sh = readJson(SHOP_CACHE_PATH, {});
    if (sh[f.key]) {
      const email = (f.email || '').trim();
      if (email) { sh[f.key].manual_email = email; sh[f.key].submit = { method: 'email', email, instructions: 'Order email entered in the Print@ console' }; }
      else delete sh[f.key].manual_email;
      fs.writeFileSync(SHOP_CACHE_PATH, JSON.stringify(sh, null, 2));
      log(`console: order email for ${sh[f.key].name}: ${email || '(cleared)'}`);
    }
    back();
  }), true;
  if (url === '/shops/forget') return form(req, f => { const s = readJson(SHOP_CACHE_PATH, {}); delete s[f.key]; fs.writeFileSync(SHOP_CACHE_PATH, JSON.stringify(s, null, 2)); back(); }), true;
  return false;
}

module.exports = { handle, printers };
