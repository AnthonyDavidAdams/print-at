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
<div class="muted">Agent on 127.0.0.1:${cfg.port}. Printers also appear in System Settings › Printers &amp; Scanners. · <a href="/sync">PrinterOn directory sync</a>${fs.existsSync(SYNC_OUT) ? ' · directory on disk: ' + (readJson(SYNC_OUT, {}).count || 0) + ' printers' : ''}</div>

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

const SYNC_STATUS = path.join(ROOT, 'data', '.printeron-us.status.json');
const SYNC_OUT = path.join(ROOT, 'data', 'printeron-us.json');

function syncPage() {
  return `<!doctype html><meta charset="utf-8"><title>Print@ directory sync</title>
<style>
:root{--bg:#0e1116;--panel:#161b23;--line:#242b36;--ink:#e6e9ee;--dim:#8b95a5;--acc:#5ec8ff;--ok:#5bd39a;--warn:#f2b750;--bad:#f0666a}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,system-ui,sans-serif;padding:28px 34px}
h1{font-size:20px;margin:0 0 2px;font-weight:600}h1 sup{font-size:10px}.sub{color:var(--dim);font-size:13px;margin-bottom:22px}
.tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:18px}.tile{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.tile .k{color:var(--dim);font-size:11px;letter-spacing:.06em;text-transform:uppercase}.tile .v{font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}.tile .s{color:var(--dim);font-size:12px}
.row{display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:12px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.panel h2{font-size:12px;color:var(--dim);letter-spacing:.06em;text-transform:uppercase;margin:0 0 10px;font-weight:600}
.bar{height:10px;background:#1f2631;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),#8be3ff);transition:width .6s}
svg{width:100%;height:120px;display:block}
.states{display:grid;grid-template-columns:repeat(10,1fr);gap:6px}.st{border-radius:6px;padding:6px 4px;text-align:center;font-size:11px;background:#1f2631;color:var(--dim);position:relative;overflow:hidden}
.st b{display:block;font-size:12px;color:var(--ink)}.st i{position:absolute;left:0;bottom:0;height:3px;background:var(--acc)}
.log{font:11.5px ui-monospace,Menlo,monospace;color:var(--dim);max-height:220px;overflow:auto;white-space:pre-wrap}.log .b{color:var(--warn)}.log .d{color:var(--ok)}.log .f{color:var(--bad)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--ok);margin-right:6px;box-shadow:0 0 8px var(--ok)}.dot.paused{background:var(--warn);box-shadow:0 0 8px var(--warn)}.dot.done{background:var(--acc);box-shadow:none}.dot.off{background:#555;box-shadow:none}
a{color:var(--acc);text-decoration:none}
</style>
<h1>Print@<sup>™</sup> directory sync</h1>
<div class="sub" id="sub"><span class="dot off"></span>waiting for the sync to report</div>
<div class="tiles">
 <div class="tile"><div class="k">Cities</div><div class="v" id="cities">–</div><div class="s" id="citiesS"></div></div>
 <div class="tile"><div class="k">Printers found</div><div class="v" id="printers">–</div><div class="s" id="printersS"></div></div>
 <div class="tile"><div class="k">Requests</div><div class="v" id="req">–</div><div class="s" id="reqS"></div></div>
 <div class="tile"><div class="k">Speed</div><div class="v" id="rps">–</div><div class="s">requests / second</div></div>
 <div class="tile"><div class="k">Concurrency</div><div class="v" id="conc">–</div><div class="s" id="concS"></div></div>
 <div class="tile"><div class="k">ETA</div><div class="v" id="eta">–</div><div class="s" id="etaS"></div></div>
</div>
<div class="panel" style="margin-bottom:12px"><h2>Progress</h2><div class="bar"><i id="bar" style="width:0%"></i></div></div>
<div class="row">
 <div class="panel"><h2>Throughput, last six minutes</h2><svg id="chart" viewBox="0 0 600 120" preserveAspectRatio="none"></svg></div>
 <div class="panel"><h2>Log</h2><div class="log" id="log"></div></div>
</div>
<div class="panel"><h2>States</h2><div class="states" id="states"></div></div>
<script>
const $=id=>document.getElementById(id);const fmt=n=>n==null?'–':Number(n).toLocaleString();
function eta(s){if(!s||!isFinite(s))return '–';if(s<90)return Math.round(s)+'s';if(s<5400)return Math.round(s/60)+' min';return (s/3600).toFixed(1)+' h'}
async function refresh(){
  let d; try{d=await (await fetch('/sync/status',{cache:'no-cache'})).json();}catch{return}
  if(!d||!d.at){$('sub').innerHTML='<span class="dot off"></span>no sync running';return}
  const stale=Date.now()-d.at>15000;
  $('sub').innerHTML=(d.done?'<span class="dot done"></span>finished':stale?'<span class="dot off"></span>stalled, last report '+Math.round((Date.now()-d.at)/1000)+'s ago':d.paused?'<span class="dot paused"></span>backing off':'<span class="dot"></span>'+d.phase)+' · '+eta(d.elapsed)+' elapsed';
  $('cities').textContent=fmt(d.citiesDone)+' / '+fmt(d.cities);$('citiesS').textContent=d.states+' states';
  $('printers').textContent=fmt(d.printers);$('printersS').textContent=d.citiesDone?(d.printers/d.citiesDone).toFixed(2)+' per city':'';
  $('req').textContent=fmt(d.stats.req);$('reqS').textContent=fmt(d.stats.fail)+' retried · '+fmt(d.stats.backoffs)+' backoffs';
  const last=d.history.slice(-3);const rps=last.length?last.reduce((a,b)=>a+b.rps,0)/last.length:0;$('rps').textContent=rps.toFixed(1);
  $('conc').textContent=d.concurrency;$('concS').textContent=d.paused?'paused':'parallel requests';
  const pct=d.cities?d.citiesDone/d.cities:0;$('bar').style.width=(pct*100).toFixed(1)+'%';
  const rate=d.elapsed?d.citiesDone/d.elapsed:0;$('eta').textContent=d.done?'done':eta(rate?(d.cities-d.citiesDone)/rate:null);$('etaS').textContent=(pct*100).toFixed(1)+'% complete';
  const h=d.history;const max=Math.max(5,...h.map(x=>x.rps));const w=600,hh=120;
  const pts=h.map((x,i)=>[i/(Math.max(1,h.length-1))*w,hh-8-(x.rps/max)*(hh-16)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const area=pts.length?line+' L'+w+','+hh+' L0,'+hh+' Z':'';
  const cpts=h.map((x,i)=>[i/(Math.max(1,h.length-1))*w,hh-8-(x.c/10)*(hh-16)]);
  const cline=cpts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  $('chart').innerHTML='<path d="'+area+'" fill="rgba(94,200,255,.15)"/><path d="'+line+'" fill="none" stroke="#5ec8ff" stroke-width="2"/><path d="'+cline+'" fill="none" stroke="#f2b750" stroke-width="1.2" stroke-dasharray="3 3"/><text x="4" y="12" fill="#8b95a5" font-size="10">'+max.toFixed(0)+' req/s</text><text x="'+(w-4)+'" y="12" fill="#f2b750" font-size="10" text-anchor="end">dashed: concurrency of 10</text>';
  const st=Object.entries(d.byState||{}).sort((a,b)=>a[0].localeCompare(b[0]));
  $('states').innerHTML=st.map(([k,v])=>'<div class="st" title="'+v.done+'/'+v.cities+' cities"><b>'+k+'</b>'+v.printers+'<i style="width:'+(v.cities?v.done/v.cities*100:0)+'%"></i></div>').join('');
  $('log').innerHTML=(d.recent||[]).slice(-30).reverse().map(l=>{const c=/backoff/.test(l)?'b':/DONE/.test(l)?'d':/FATAL|failed/.test(l)?'f':'';return '<div class="'+c+'">'+l.replace(/^\S+T(\S+?)\.\d+Z/,'$1').replace(/[<>&]/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]))+'</div>'}).join('');
}
refresh();setInterval(refresh,2000);
</script>`;
}

function handle(req, res, cfg) {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && url === '/sync') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(syncPage()); return true; }
  if (req.method === 'GET' && url === '/sync/status') {
    let body = '{}';
    try { body = fs.readFileSync(SYNC_STATUS, 'utf8'); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); res.end(body); return true;
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
