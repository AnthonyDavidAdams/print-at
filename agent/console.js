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
  return out.split('\n').map(l => l.match(/^device for (\S+): (printat:\/\/\S*)/)).filter(Boolean).map(m => {
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
form.inline{display:flex;gap:8px;align-items:center;margin-top:10px}
form.settings{background:#fff;border:1px solid #e3e6ea;border-radius:8px;padding:14px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px 18px}form.settings label{display:flex;flex-direction:column;font-size:12px;color:#5b6573;gap:3px}form.settings label input[type=text]{min-width:0;width:100%;box-sizing:border-box}form.settings label.check{flex-direction:row;align-items:center;gap:6px;font-size:13px;color:#1c2430}form.settings div{grid-column:1/-1}input[type=text]{font:13px -apple-system,system-ui;padding:4px 8px;border:1px solid #c9ced5;border-radius:6px;min-width:220px}
</style>
<h1>Print@<sup>™</sup> console</h1>
<div class="muted">Agent on 127.0.0.1:${cfg.port}. Printers also appear in System Settings › Printers &amp; Scanners. · <a href="/near">printers near me (map)</a>${fs.existsSync(SYNC_OUT) ? ' · directory: ' + (readJson(SYNC_OUT, {}).count || 0) + ' printers' : ''}</div>

<h2>Settings</h2>
<form method="post" action="/settings" class="settings">
<label>Your name <input type="text" name="contactName" value="${esc(cfg.contactName)}"></label>
<label>Email (shops reply here; also the sender) <input type="text" name="contactEmail" value="${esc(cfg.contactEmail)}"></label>
<label>Phone (optional, goes in order emails) <input type="text" name="contactPhone" value="${esc(cfg.contactPhone)}"></label>
<label>Home address (used when Location Services is off and your IP is nearby) <input type="text" name="homeAddress" value="${esc(cfg.homeAddress)}"></label>
<label>Gmail app password file <input type="text" name="gmailEnv" value="${esc(cfg.gmailEnv)}"></label>
<label>Claude model for ranking (blank = CLI default) <input type="text" name="claudeModel" value="${esc(cfg.claudeModel)}"></label>
<label class="check"><input type="checkbox" name="ccSelf" ${cfg.ccSelf ? 'checked' : ''}> Cc me on every order email</label>
<div><button>Save settings</button> <span class="muted">Stored in <code>${esc(CONFIG_PATH)}</code>; applies to the next job.</span></div>
</form>

<h2>Printers</h2>
<table><tr><th>Name in Print dialog</th><th>Queue</th><th>Pinned shop</th><th>Order email</th><th>Defaults</th><th></th></tr>
${ps.map(p => row([`<strong>${esc(p.info)}</strong>`, `<code>${esc(p.queue)}</code>`, p.shop ? esc(p.shop) : '<span class="muted">searches nearby</span>', p.email ? esc(p.email) : '<span class="muted">found per job</span>',
  `<span class="muted">${Object.entries(p.defaults).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' · ')}</span>`,
  p.queue === 'PrintAt' ? '' : btn('/printers/remove', { queue: p.queue }, 'Remove')])).join('')}
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

const DATA_DIR = path.join(ROOT, 'data');
const SYNC_OUT = fs.existsSync(path.join(DATA_DIR,'printeron-all.json'))?path.join(DATA_DIR,'printeron-all.json'):path.join(DATA_DIR,'printeron-us.json');

async function nearData(cfg) {
  const { locate } = require('./locate');
  const { findCandidates } = require('./shops');
  let loc;
  try { loc = await locate(cfg); } catch { loc = { lat: 39.8, lon: -98.6, address: 'location unavailable', source: 'default' }; }
  let cands = [];
  try { cands = await findCandidates(loc, 'Any', '25mi'); } catch (e) { log(`near: ${e.message}`); }
  const pts = cands.filter(c => c.lat != null && c.lon != null).map(c => ({
    name: c.name, address: c.address, lat: c.lat, lon: c.lon, distance_mi: c.distance_mi,
    type: c.brand === 'PrinterOn' ? 'printeron' : c.brand === 'PrintMe' ? 'printme' : c.brand === 'independent' ? 'local' : 'chain',
    how: c.printme ? ('email ' + c.printme.email) : c.printeron ? ('email ' + c.printeron.email) : c.chain_email ? ('email ' + c.chain_email) : c.portal ? 'online upload' : c.phone ? ('call ' + c.phone) : 'walk-in',
  }));
  return { center: { lat: loc.lat, lon: loc.lon, address: loc.address, source: loc.source }, printers: pts };
}

function nearPage() {
  return `<!doctype html><meta charset="utf-8"><title>Print@ — printers near you</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<style>
html,body{margin:0;height:100%;font:14px/1.4 -apple-system,system-ui,sans-serif;background:#0e1116;color:#e6e9ee}
#map{position:absolute;top:0;left:0;right:320px;bottom:0}
#side{position:absolute;top:0;right:0;bottom:0;width:320px;overflow:auto;background:#161b23;border-left:1px solid #242b36;padding:14px 16px;box-sizing:border-box}
h1{font-size:16px;margin:0 0 2px}.muted{color:#8b95a5;font-size:12px}
.row{border-top:1px solid #242b36;padding:8px 0;cursor:pointer}.row:hover{background:#1b212b}
.row b{font-size:13px}.row .m{color:#8b95a5;font-size:12px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
.printeron{background:#ff6b4a}.printme{background:#c98bff}.chain{background:#5ec8ff}.local{background:#5bd39a}
.leaflet-popup-content{font:13px -apple-system,system-ui}
</style>
<div id="map"></div>
<div id="side"><h1>Printers near you</h1><div class="muted" id="ctr">locating…</div><div id="list"></div>
<div class="muted" style="margin-top:12px">Colours: <span class="dot printeron"></span>PrinterOn <span class="dot printme"></span>PrintMe <span class="dot chain"></span>chain <span class="dot local"></span>local</div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
const COL={printeron:'#ff6b4a',printme:'#c98bff',chain:'#5ec8ff',local:'#5bd39a'};
(async()=>{
 const d=await(await fetch('/near/data')).json();
 const c=d.center;
 const map=L.map('map').setView([c.lat,c.lon],12);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
 L.circleMarker([c.lat,c.lon],{radius:8,color:'#fff',fillColor:'#2b6cff',fillOpacity:1,weight:2}).addTo(map).bindPopup('You: '+c.address);
 document.getElementById('ctr').textContent=c.address+' ('+c.source+') · '+d.printers.length+' printers';
 const markers={};
 d.printers.forEach((p,i)=>{
  const m=L.circleMarker([p.lat,p.lon],{radius:6,color:'#0e1116',weight:1,fillColor:COL[p.type]||'#ccc',fillOpacity:.95}).addTo(map)
   .bindPopup('<b>'+p.name+'</b><br>'+p.address+'<br>'+p.distance_mi+' mi · '+p.how);
  markers[i]=m;
 });
 const bounds=L.latLngBounds([[c.lat,c.lon],...d.printers.map(p=>[p.lat,p.lon])]);
 if(d.printers.length)map.fitBounds(bounds.pad(0.15));
 document.getElementById('list').innerHTML=d.printers.map((p,i)=>'<div class="row" data-i="'+i+'"><b><span class="dot '+p.type+'"></span>'+p.name+'</b><div class="m">'+p.distance_mi+' mi · '+p.how+'</div><div class="m">'+p.address+'</div></div>').join('');
 document.querySelectorAll('.row').forEach(r=>r.onclick=()=>{const i=r.dataset.i;markers[i].openPopup();map.panTo(markers[i].getLatLng())});
})();
</script>`;
}

function handle(req, res, cfg) {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url === '/near') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(nearPage()); return true; }
  if (req.method === 'GET' && url === '/near/data') {
    nearData(cfg).then(d => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); }).catch(e => { res.writeHead(500); res.end(String(e)); });
    return true;
  }
  if (req.method === 'GET' && (url === '/' || url === '/console')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page(cfg));
    return true;
  }
  if (req.method !== 'POST') return false;
  const back = () => { res.writeHead(303, { Location: '/' }); res.end(); };
  if (url === '/settings') return form(req, f => {
    const cur = readJson(CONFIG_PATH, {});
    for (const k of ['contactName', 'contactEmail', 'contactPhone', 'homeAddress', 'gmailEnv', 'claudeModel']) if (k in f) cur[k] = (f[k] || '').trim();
    cur.ccSelf = !!f.ccSelf;
    if (cur.contactEmail && !cur.smtpUser) cur.smtpUser = cur.contactEmail;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cur, null, 2));
    log('console: settings saved');
    back();
  }), true;
  if (url === '/printers/remove') return form(req, f => { if (f.queue && f.queue !== 'PrintAt') { spawnSync('/usr/sbin/lpadmin', ['-x', f.queue]); log(`console: removed printer ${f.queue}`); } back(); }), true;
  if (url === '/printers/add') return form(req, f => {
    if (f.shop) { const r = spawnSync(path.join(ROOT, 'printat-add'), [f.shop, 'Nearest', 'Confirm', f.city || '', f.email || ''], { encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH + ':/usr/sbin:/sbin' } }); log(`console: add printer ${f.shop}: ${(r.stdout || r.stderr || '').trim()}`); }
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
