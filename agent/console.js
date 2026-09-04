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
<div class="muted">Agent on 127.0.0.1:${cfg.port}. Printers also appear in System Settings › Printers &amp; Scanners. · <a href="/near">printers near me (map)</a> · <a href="/sync">directory sync</a>${fs.existsSync(SYNC_OUT) ? ' · directory on disk: ' + (readJson(SYNC_OUT, {}).count || 0) + ' printers' : ''}</div>

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
function freshestStatus() {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => /^\.printeron-.*\.status\.json$/.test(f))
      .map(f => ({ f: path.join(DATA_DIR, f), m: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return files[0] ? files[0].f : null;
  } catch { return null; }
}

function syncPage() {
  return `<!doctype html><meta charset="utf-8"><title>WOPR // NORAD DEFENSE GRID</title>
<style>
@keyframes flick{0%,96%{opacity:1}97%{opacity:.9}100%{opacity:1}}
@keyframes blink{50%{opacity:0}}
@keyframes sweep{0%{transform:translateY(-4%)}100%{transform:translateY(104%)}}
@keyframes pulse{0%,100%{opacity:.55}50%{opacity:1}}
:root{--g:#5fd8ef;--dim:#2b7d97;--blue:#2f8fd6;--blue2:#0a3a5c;--red:#ff3b30;--amber:#ff5a4d;}
html,body{margin:0;background:#000}
body{font:14px/1.35 "Courier New",ui-monospace,Menlo,monospace;color:var(--g);background:radial-gradient(ellipse at center,#052537,#02131e 70%,#01080d);padding:20px 24px;letter-spacing:.5px;text-shadow:0 0 6px rgba(95,216,239,.45);animation:flick 7s infinite}
body:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:9;background:repeating-linear-gradient(0deg,transparent 0,transparent 2px,rgba(0,0,0,.25) 3px,transparent 4px)}
.hd{border:1px solid var(--dim);padding:8px 12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
.hd b{font-size:17px;letter-spacing:3px}.hd .r{color:var(--dim)}
.cur:after{content:"█";animation:blink 1s steps(1) infinite;margin-left:2px}
.top{display:grid;grid-template-columns:1fr 320px;gap:12px;margin-bottom:12px}
.board{border:1px solid var(--blue);position:relative;background:#02141f;box-shadow:0 0 22px rgba(47,143,214,.22) inset;overflow:hidden}
.board .scan{position:absolute;left:0;right:0;height:8%;background:linear-gradient(180deg,transparent,rgba(95,216,239,.16),transparent);animation:sweep 4s linear infinite}
.eta{border:1px solid var(--dim);padding:10px 12px;display:flex;flex-direction:column;justify-content:center}
.eta .lab{color:var(--red);font-size:12px;letter-spacing:2px}
.eta .big{font-size:40px;font-weight:bold;letter-spacing:3px;color:var(--red);text-shadow:0 0 10px rgba(255,59,48,.6)}
.eta .kv{display:grid;grid-template-columns:auto 1fr;gap:1px 12px;margin-top:8px;font-size:13px}
.eta .kv .k{color:var(--dim)}.eta .kv .v{text-align:right;font-weight:bold}
.bar{border:1px solid var(--dim);height:14px;margin-top:8px;position:relative;overflow:hidden}
.bar i{display:block;height:100%;background:var(--red);box-shadow:0 0 10px var(--red);transition:width .5s}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.box{border:1px solid var(--dim);padding:10px 12px}
.box h2{margin:0 0 8px;font-size:12px;color:var(--red);letter-spacing:2px;border-bottom:1px solid var(--dim);padding-bottom:5px}
.feed{height:196px;overflow:hidden;font-size:13px}
.feed div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.feed .num{color:var(--g)}.feed .car{color:var(--dim)}.feed .off{color:var(--red)}.feed .nc{color:var(--dim)}
svg{display:block;width:100%}
.foot{color:var(--dim);font-size:11px;margin-top:10px;text-align:center;letter-spacing:1px}
</style>
<div class="hd"><b>W O P R</b><span>NORAD // PRINTERON PUBLIC DIRECTORY DEFENSE GRID</span><span class="r" id="clock">--:--:--</span></div>
<div id="status" style="margin-bottom:10px"><span class="cur">INITIALIZING</span></div>
<div class="top">
 <div class="board"><div class="scan"></div><svg id="map" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet"></svg></div>
 <div class="eta">
  <div class="lab">ESTIMATED TIME REMAINING</div>
  <div class="big" id="eta">--:--:--</div>
  <div class="kv">
   <div class="k">TARGETS SWEPT</div><div class="v" id="cities">----</div>
   <div class="k">CARRIERS</div><div class="v" id="online">----</div>
   <div class="k">NO CARRIER</div><div class="v" id="dead">----</div>
   <div class="k">BAUD</div><div class="v" id="rps">--</div>
   <div class="k">LINES</div><div class="v" id="conc">--</div>
   <div class="k">RE-DIALS</div><div class="v" id="backoffs">--</div>
   <div class="k">ELAPSED</div><div class="v" id="elapsed">--</div>
  </div>
  <div class="bar"><i id="bar" style="width:0%"></i></div>
 </div>
</div>
<div class="grid">
 <div class="box"><h2>LINE MONITOR</h2><div class="feed" id="feed"></div></div>
 <div class="box"><h2 id="gridTitle">EXCHANGES</h2><div id="cty" style="display:grid;grid-template-columns:repeat(9,1fr);gap:5px;font-size:11px"></div></div>
</div>
<div class="foot" id="foot">SHALL WE PLAY A GAME?</div>
<script>
const $=id=>document.getElementById(id),pad=(n,w)=>String(n).padStart(w,"0"),fmt=n=>n==null?"----":Number(n).toLocaleString();
function el(s){if(s==null||!isFinite(s))return"--:--:--";s=Math.max(0,Math.round(s));return pad(Math.floor(s/3600),2)+":"+pad(Math.floor(s%3600/60),2)+":"+pad(s%60,2)}
setInterval(()=>{$("clock").textContent=new Date().toTimeString().slice(0,8)},1000);
const CT={AL:[32.8,-86.8],AK:[63,-152],AZ:[34.3,-111.7],AR:[34.9,-92.4],CA:[37.2,-119.3],CO:[39,-105.5],CT:[41.6,-72.7],DE:[39,-75.5],FL:[28.6,-82.4],GA:[32.6,-83.4],HI:[20.8,-156.3],ID:[44.4,-114.6],IL:[40,-89.2],IN:[39.9,-86.3],IA:[42,-93.5],KS:[38.5,-98.4],KY:[37.5,-85.3],LA:[31,-92],ME:[45.4,-69.2],MD:[39,-76.8],MA:[42.3,-71.8],MI:[44.3,-85.4],MN:[46.3,-94.3],MS:[32.7,-89.7],MO:[38.4,-92.5],MT:[47,-109.6],NE:[41.5,-99.8],NV:[39.3,-116.6],NH:[43.7,-71.6],NJ:[40.2,-74.7],NM:[34.4,-106.1],NY:[42.9,-75.6],NC:[35.6,-79.4],ND:[47.4,-100.5],OH:[40.3,-82.8],OK:[35.6,-97.5],OR:[43.9,-120.6],PA:[40.9,-77.8],RI:[41.7,-71.5],SC:[33.9,-80.9],SD:[44.4,-100.2],TN:[35.9,-86.4],TX:[31.5,-99.3],UT:[39.3,-111.7],VT:[44.1,-72.7],VA:[37.5,-78.9],WA:[47.4,-120.4],WV:[38.6,-80.6],WI:[44.6,-89.9],WY:[43,-107.6],DC:[38.9,-77],PR:[18.2,-66.4],GU:[13.4,144.8],
US:[39,-98],CA_:[56,-106],CANADA:[56,-106],MX:[23,-102],GB:[54,-2],FR:[46,2],DE:[51,10],NL:[52,5],BE:[50.5,4.5],ES:[40,-4],IT:[42,12],CH:[47,8],SE:[62,15],NO:[62,10],DK:[56,10],FI:[64,26],IE:[53,-8],GR:[39,22],CZ:[49.8,15.5],PL:[52,19],TR:[39,35],SA:[24,45],AE:[24,54],KW:[29.3,47.5],JO:[31,36],MA:[32,-6],NG:[9,8],RW:[-2,30],ZA:[-29,24],IN:[21,78],CN:[35,105],JP:[36,138],KR:[37,127.5],SG:[1.3,103.8],MY:[4,102],ID:[-2,118],PH:[13,122],VN:[16,106],LK:[7,81],AU:[-25,134],NZ:[-41,174],BR:[-10,-52],CL:[-30,-71],PE:[-10,-76],CO:[4,-73],CR:[10,-84],PA:[9,-80],NI:[13,-85],HN:[15,-86],SV:[13.8,-88.9],TT:[11,-61],BB:[13.1,-59.5],AW:[12.5,-70],KY:[19.3,-81.2]};
const LANDBOX=[
 [-168,52,-140,72],[-140,48,-52,72],[-128,30,-95,49],[-95,25,-74,49],[-107,18,-86,30],[-92,8,-77,18],
 [-73,60,-11,84],
 [-81,-3,-50,12],[-79,-23,-44,-3],[-76,-40,-53,-23],[-74,-54,-65,-40],
 [-11,43,3,59],[-3,50,2,59],[2,40,30,55],[4,55,31,71],[23,44,45,60],
 [-17,15,20,33],[-17,4,10,16],[8,-6,32,15],[24,-12,42,4],[12,-35,33,-12],[33,-27,42,-8],
 [34,12,44,40],[44,12,60,32],
 [30,48,60,72],[55,50,120,72],[100,50,180,72],[45,40,88,52],[88,40,120,52],
 [68,20,90,33],[70,8,88,20],
 [95,10,109,28],[98,-10,120,10],[108,20,122,42],[120,30,126,42],[124,20,122,30],
 [113,-38,153,-11],[130,31,146,45],[125,34,130,39],[166,-47,179,-34],
 [-11,36,4,44],[10,36,20,42],[19,35,28,42]
];
function inLand(lon,lat){for(const b of LANDBOX){if(lon>=b[0]&&lon<=b[2]&&lat>=b[1]&&lat<=b[3])return true}return false}
let BASECACHE=null;
const W=1000,H=500;const PX=lon=>(lon+180)/360*W,PY=lat=>(90-lat)/180*H;
function drawBase(){
 if(BASECACHE)return BASECACHE;
 let g='';
 for(let lon=-180;lon<=180;lon+=30)g+='<line x1="'+PX(lon).toFixed(1)+'" y1="0" x2="'+PX(lon).toFixed(1)+'" y2="'+H+'" stroke="#0a3a5c" stroke-width="1"/>';
 for(let lat=-60;lat<=80;lat+=30)g+='<line x1="0" y1="'+PY(lat).toFixed(1)+'" x2="'+W+'" y2="'+PY(lat).toFixed(1)+'" stroke="#0a3a5c" stroke-width="1"/>';
 let dots='';
 for(let lat=78;lat>=-56;lat-=3)for(let lon=-178;lon<=180;lon+=3){if(inLand(lon,lat))dots+='<circle cx="'+PX(lon).toFixed(1)+'" cy="'+PY(lat).toFixed(1)+'" r="1.5" fill="#2f8fd6" opacity=".6"/>';}
 BASECACHE=g+dots;return BASECACHE;
}
let lastFeedLen=0;
async function refresh(){
 let d;try{d=await(await fetch("/sync/status",{cache:"no-cache"})).json()}catch{return}
 if(!d||!d.at){$("status").innerHTML='<span class="cur">NO SCAN PROCESS ON LINE</span>';return}
 const stale=Date.now()-d.at>15000,online=d.printers||0;

 let rate=d.elapsed?d.citiesDone/d.elapsed:0;
 const hh=d.history||[];
 if(hh.length>=2){const now=hh[hh.length-1];let past=hh[0];for(let i=hh.length-1;i>=0;i--){if(now.t-hh[i].t>=90000){past=hh[i];break}}
  const dc=(now.cd||0)-(past.cd||0),dt=(now.t-past.t)/1000;if(dt>5&&dc>0)rate=0.35*rate+0.65*(dc/dt);}
 const rem=rate?(d.cities-d.citiesDone)/rate:null;
 $("eta").textContent=d.done?"00:00:00":el(rem);
 const phase=d.done?"SCAN COMPLETE":stale?"CARRIER LOST // RECONNECTING":d.paused?"LINE BUSY // RE-DIALING":"SCANNING NORTH AMERICAN EXCHANGES";
 $("status").innerHTML="> "+phase+' <span class="cur"></span>';
 $("cities").textContent=fmt(d.citiesDone)+" / "+fmt(d.cities);
 $("online").textContent=fmt(online);
 let nc=0;(d.feed||[]).forEach(f=>{if(f.status!=="online")nc++});
 $("dead").textContent=fmt(nc);
 const h=d.history||[],last=h.slice(-3),rps=last.length?last.reduce((a,b)=>a+b.rps,0)/last.length:0;
 $("rps").textContent=rps.toFixed(0);$("conc").textContent=d.concurrency;$("backoffs").textContent=fmt(d.stats.backoffs);$("elapsed").textContent=el(d.elapsed);
 $("bar").style.width=((d.cities?d.citiesDone/d.cities:0)*100).toFixed(1)+"%";
 const f=d.feed||[];

 $("feed").innerHTML=f.slice().reverse().slice(0,11).map(x=>{
  const st=x.status==="online"?'<span class="off">CONNECT '+(x.color===true?"COLOR":x.color===false?"MONO ":"     ")+'</span>':x.status==="offline"?'<span class="off">NO CARRIER</span>':'<span class="nc">RING-NO ANS</span>';
  const loc=[x.city,x.state,(x.country&&x.country!=="US"?x.country:"")].filter(Boolean).join(", ").toUpperCase();
  return '<div><span class="num">'+String(x.number||"").padEnd(15)+"</span> "+st+' <span class="car">'+String(x.name||"").slice(0,20).toUpperCase()+" · "+loc+"</span></div>";
 }).join("");
 // map blips

 const NORAD=[PX(-104.8),PY(38.7)];
 let arcs="",blips="";
 f.forEach((x,i)=>{const c=CT[x.state]||CT[x.country]||CT[(x.country||"").toUpperCase()];if(!c)return;
  const jx=(Math.random()-.5)*5,jy=(Math.random()-.5)*5,cx=PX(c[1])+jx,cy=PY(c[0])+jy;
  const online=x.status==="online";
  const col=online?"#ff3b30":x.status==="offline"?"#2f8fd6":"#0a3a5c";
  // trajectory arc for the most recent carriers
  if(online&&i>=f.length-14){const mx=(NORAD[0]+cx)/2,my=Math.min(NORAD[1],cy)-70-Math.abs(cx-NORAD[0])*.12;
   arcs+='<path d="M'+NORAD[0].toFixed(1)+','+NORAD[1].toFixed(1)+' Q'+mx.toFixed(1)+','+my.toFixed(1)+' '+cx.toFixed(1)+','+cy.toFixed(1)+'" fill="none" stroke="#ff3b30" stroke-width="1" opacity=".5"><animate attributeName="stroke-dasharray" values="0 600;600 0" dur="1.4s" fill="freeze"/></path>';}
  blips+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="'+(online?3.4:2)+'" fill="'+col+'"><animate attributeName="opacity" values="1;.35;1" dur="1.8s" repeatCount="indefinite"/></circle>';
  if(online)blips+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="7" fill="none" stroke="#ff3b30" stroke-width="1" opacity=".45"/>';
 });
 // NORAD origin marker
 blips+='<circle cx="'+PX(-104.8).toFixed(1)+'" cy="'+PY(38.7).toFixed(1)+'" r="4" fill="#ff3b30"/><circle cx="'+PX(-104.8).toFixed(1)+'" cy="'+PY(38.7).toFixed(1)+'" r="10" fill="none" stroke="#ff3b30" stroke-width="1" opacity=".6"><animate attributeName="r" values="4;16;4" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values=".7;0;.7" dur="3s" repeatCount="indefinite"/></circle>';
 $("map").innerHTML=drawBase()+arcs+blips;
 const nCo=Object.keys(d.byCountry||{}).length,src=nCo>1?d.byCountry:(d.byState||{});
 $("gridTitle").textContent=nCo>1?"COUNTRIES ("+nCo+")":"EXCHANGES";
 $("cty").innerHTML=Object.entries(src).sort((a,b)=>b[1].printers-a[1].printers||a[0].localeCompare(b[0])).slice(0,54)
  .map(([k,v])=>'<div style="border:1px solid #1c8a3c;padding:4px 2px;text-align:center;position:relative;overflow:hidden" title="'+k+': '+v.done+'/'+v.cities+'"><b style="display:block;color:#ff5a4d">'+k+"</b>"+v.printers+'<i style="position:absolute;left:0;bottom:0;height:2px;background:#2f8fd6;width:'+(v.cities?v.done/v.cities*100:0)+'%"></i></div>').join("");
 if(d.done)$("foot").textContent="SCAN COMPLETE // "+fmt(online)+" CARRIERS LOGGED. GREETINGS PROFESSOR FALKEN.";
}
refresh();setInterval(refresh,1500);
</script>`;
}

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
  if (req.method === 'GET' && url === '/sync') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(syncPage()); return true; }
  if (req.method === 'GET' && url === '/sync/status') {
    let body = '{}';
    const sf = freshestStatus();
    if (sf) try { body = fs.readFileSync(sf, 'utf8'); } catch {}
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
