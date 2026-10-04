'use strict';
// Print@ Network — our own release-code print network. Shops sign up (email-verified),
// log in by magic link, and print jobs from their browser. Customers send a job to a
// nearby shop and get a pickup code; they can rate the shop afterward.
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const mail = require('./mail');
const shopResearch = require('./research');
const FAQ = require('./faq');
const legal = require('./legal');
const guides = require('./guides');
const faqList = require('./faq');
const CHAT_JS = fs.readFileSync(path.join(__dirname, 'chat.js'), 'utf8');
const cover = require('./cover');
const qr = require('./qr');

const PORT = process.env.PORT || 4260;
const BASE = process.env.PRINTAT_NET_BASE || `http://localhost:${PORT}`;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const body = (req, max = 64 * 1024) => new Promise((resolve, reject) => {
  const c = []; let n = 0;
  req.on('data', d => { n += d.length; if (n > max) { reject(Object.assign(new Error('payload too large'), { status: 413 })); req.destroy(); } else c.push(d); });
  req.on('end', () => resolve(Buffer.concat(c)));
  req.on('error', e => reject(e)); req.on('aborted', () => reject(new Error('request aborted')));
});
const BIG = 30 * 1024 * 1024; // portal uploads, relayed PDFs, bug screenshots
// Simple fixed-window rate limiter (per key). Enough to stop email bombing and paid-AI abuse.
const RL = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); const e = RL.get(key) || { n: 0, t: now };
  if (now - e.t > windowMs) { e.n = 0; e.t = now; }
  e.n++; RL.set(key, e); if (RL.size > 50000) RL.clear();
  return e.n > max;
}
const scriptJSON = v => JSON.stringify(v).replace(/</g, '\\u003c');
const form = async req => Object.fromEntries(new URLSearchParams((await body(req)).toString()));
const json = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
const redirect = (res, to) => { res.writeHead(303, { Location: to }); res.end(); };
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(x => x[0]));
function miles(a, b) { const R = 3958.8, d = Math.PI / 180, dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }

const CSS = `<style>
:root{--paper:#efe4cc;--card:#f5ecd7;--ink:#1c3a57;--ink2:#274c6e;--red:#c8432c;--gold:#d09a3c}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Bitter",Georgia,serif;
 background-image:radial-gradient(var(--ink) 1px,transparent 1.4px);background-size:7px 7px}
body:before{content:"";position:fixed;inset:0;background:var(--paper);opacity:.94;z-index:-1}
.wrap{max-width:640px;margin:0 auto;padding:22px 18px 60px}
h1{font-family:"Anton",sans-serif;font-size:34px;letter-spacing:1px;margin:0}h1 .at{color:var(--red)}
h2{font-family:"Anton";font-size:22px;text-transform:uppercase;margin:22px 0 10px}
.tag{font-family:"Oswald",sans-serif;text-transform:uppercase;letter-spacing:2px;font-size:12px;color:var(--ink2)}
.card{background:var(--card);border:3px solid var(--ink);box-shadow:5px 5px 0 rgba(28,58,87,.15);padding:18px;margin:16px 0}
.lab{font-family:"Oswald";font-weight:700;text-transform:uppercase;letter-spacing:1.5px;font-size:13px;color:var(--red);margin-bottom:8px}
label{font-family:"Oswald";font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.5px;display:block;margin-top:10px}
input,select,textarea{width:100%;font-family:"Bitter";font-size:16px;padding:11px;border:2px solid var(--ink);background:#fff;margin-top:4px}
.btn{font-family:"Oswald";font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:15px;padding:14px 20px;border:2.5px solid var(--ink);
 background:var(--ink);color:var(--paper);box-shadow:4px 4px 0 #0d2236;cursor:pointer;width:100%;margin-top:14px;display:block;text-align:center}
.btn:active{transform:translate(2px,2px);box-shadow:2px 2px 0 #0d2236}.btn.red{background:var(--red);border-color:var(--red);box-shadow:4px 4px 0 #7d2417}
.row{display:flex;gap:10px}.row>*{flex:1}
.job{border:2px solid var(--ink);background:#fff;padding:12px;margin-top:10px}
.job .m{font-size:13px;color:var(--ink2)}.pill{font-family:"Oswald";font-size:11px;text-transform:uppercase;padding:2px 8px;border-radius:3px}
.queued{background:var(--red);color:#fff}.printed{background:var(--gold);color:#1c3a57}.done{background:#2e7d4f;color:#fff}
a{color:var(--red)}.muted{color:var(--ink2);font-size:14px}.stars{color:var(--gold);font-size:18px}
.head{display:flex;justify-content:space-between;align-items:baseline}
h1:after{content:"™";font-family:"Bitter",serif;font-size:.36em;vertical-align:top;position:relative;top:.5em;margin-left:2px;color:var(--ink2)}
</style><link href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@600;700&family=Bitter:wght@400;600&display=swap" rel="stylesheet">`;
// Every page ships Open Graph + Twitter cards (shared links render from them) and the help chat.
const DEFAULT_DESC = 'Print@ turns any print shop, hotel or library printer near you into a printer in your Print dialog. Open source, macOS, free beta.';
const og = (title, o = {}) => { const u = BASE + (o.path || ''); const d = o.description || DEFAULT_DESC; const img = o.image || BASE + '/assets/og.png';
  return `<meta name=description content="${esc(d)}"><link rel=canonical href="${esc(u)}"><meta property=og:title content="${esc(title)}"><meta property=og:description content="${esc(d)}"><meta property=og:image content="${esc(img)}"><meta property=og:url content="${esc(u)}"><meta property=og:type content="${o.type || 'website'}"><meta property=og:site_name content="Print@™"><meta name=twitter:card content=summary_large_image><meta name=twitter:title content="${esc(title)}"><meta name=twitter:description content="${esc(d)}"><meta name=twitter:image content="${esc(img)}">`; };
const page = (title, inner, o = {}) => `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${og(title, o)}${CSS}</head><body><div class=wrap>${inner}</div>${o.extra || ''}<script src="/chat.js" defer></script></body></html>`;

// printat.co is the product's front door: the landing page (shared with the GitHub Pages
// site in docs/), its assets, and the one-line installer. The customer portal lives at /app.
const DOCS = path.join(__dirname, '..', 'docs');
const LANDING = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
const INSTALL_SH = fs.readFileSync(path.join(__dirname, 'get.sh'), 'utf8');
const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
function asset(res, url) {
  const rel = decodeURIComponent(url.replace(/^\/assets\//, ''));
  const file = path.normalize(path.join(DOCS, 'assets', rel));
  if (!file.startsWith(path.join(DOCS, 'assets') + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
  return res.end(fs.readFileSync(file));
}

function customerPage(preShop) {
  return page('Print@™ Network', `<div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag><a href="/">Home</a> &middot; <a href="/shop">For shops »</a></span></div>
  <p class=tag>Send a file to a nearby shop. Pick it up with a code.</p>
  <p class=muted style="margin-top:-6px">Your file is deleted from Print@ the moment the shop marks it picked up, and within 7 days no matter what. Unconfirmed uploads are deleted after 2 hours.</p>
  <div class=card><div class=lab>1 · Documents</div>
    <label>Add PDFs, photos or documents (you can pick several)<input type=file id=file multiple></label>
    <div id=items></div>
    <label>Your name<input id=cname placeholder="For the pickup"></label>
    <label>Your email (we confirm it, then send your pickup code there)<input id=cemail inputmode=email placeholder="you@example.com" required></label>
    <p class=muted>Your file goes to the shop you pick; we can't control what happens on their end.</p>
    ${AGREE_HTML.replace('name=agree', 'id=agree name=agree')}
    <button class=btn id=find>Find shops near me</button><div class=muted id=note style=margin-top:8px></div></div>
  <div class=card id=shops style=display:none><div class=lab>2 · Pick a shop</div><div id=list></div></div>
  <div class=card id=send style=display:none><div class=lab>3 · Send</div><div id=pick></div><button class=btn red id=go>Send to shop</button><div id=result></div></div>
  <script>
  var $=function(id){return document.getElementById(id)};var file=$('file'),find=$('find'),note=$('note'),shops=$('shops'),list=$('list'),send=$('send'),go=$('go'),result=$('result'),cname=$('cname'),cemail=$('cemail');
  var items=[],pick=null;var esc=function(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  function render(){var box=document.getElementById('items');box.innerHTML=items.map((it,i)=>
    '<div class=job style="display:flex;gap:10px;align-items:center;margin-top:10px">'+
    (it.thumb?'<img src="'+it.thumb+'" data-i='+i+' class=ith style="width:46px;height:60px;object-fit:cover;border:1px solid #1c3a57;transition:filter .6s ease;filter:'+(it.color==='color'?'none':'grayscale(1)')+'">':'<div style="width:46px;height:60px;border:1px solid #1c3a57;display:flex;align-items:center;justify-content:center;font-family:Oswald;font-size:11px">PDF</div>')+
    '<div style=flex:1;min-width:0><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>'+it.name+'</b></div>'+
    '<div class=row style=margin-top:4px>'+
    '<select data-i='+i+' class=ic style="padding:6px"><option value=bw>B&W</option><option value=color '+(it.color=='color'?'selected':'')+'>Color</option></select>'+
    '<input data-i='+i+' class=iq value='+it.copies+' inputmode=numeric style="padding:6px" title=copies>'+
    '<button data-i='+i+' class=irm style="width:auto;padding:6px 10px;background:#c8432c;border:2px solid #c8432c;color:#fff;font-family:Oswald;cursor:pointer">✕</button>'+
    '</div></div></div>').join('');
    box.querySelectorAll('.ic').forEach(el=>el.onchange=e=>{items[e.target.dataset.i].color=e.target.value;var th=box.querySelector('.ith[data-i="'+e.target.dataset.i+'"]');if(th)th.style.filter=e.target.value==='color'?'none':'grayscale(1)'});
    box.querySelectorAll('.iq').forEach(el=>el.onchange=e=>items[e.target.dataset.i].copies=Math.max(1,parseInt(e.target.value)||1));
    box.querySelectorAll('.irm').forEach(el=>el.onclick=e=>{items.splice(e.target.dataset.i,1);render()});
  }
  file.onchange=e=>{[...e.target.files].forEach(x=>{
    var it={name:x.name,copies:1,color:'bw',b64:null,thumb:null};
    var r=new FileReader();r.onload=()=>{it.b64=r.result.split(',')[1];if(x.type.startsWith('image/'))it.thumb=r.result;render()};r.readAsDataURL(x);
    items.push(it);
  });e.target.value='';render()};
  function query(loc){note.textContent='Finding shops…';
    fetch('/api/shops-nearby',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(loc||{})}).then(r=>r.json()).then(d=>{
      if(!d.located){note.textContent='Could not find your location. Add ?shop=ID or try again.';return}
      if(!d.shops.length){note.textContent='No Print@ Network shops within 25 miles yet. Know a shop with a printer? Ask them to join at /join';return}
      note.textContent=d.shops.length+' shop'+(d.shops.length>1?'s':'')+' near you';list.innerHTML=d.shops.map(s=>'<div class=job data-id='+Number(s.id)+' style=cursor:pointer><b>'+esc(s.name)+'</b> '+(s.stars?'<span class=stars>'+'\\u2605'.repeat(Math.round(s.stars))+'</span>':'')+'<div class=m>'+esc(s.distance_mi)+' mi · '+esc(s.address)+'</div><div class=m>'+esc(s.hours||'')+' · B&W '+esc(s.price_bw||'?')+' color '+esc(s.price_color||'?')+'</div></div>').join('');
        shops.style.display='block';
        document.querySelectorAll('#list .job').forEach(el=>el.onclick=()=>{pick=d.shops.find(s=>s.id==el.dataset.id);document.querySelectorAll('#list .job').forEach(x=>x.style.background='#fff');el.style.background='#d09a3c';document.getElementById('pick').innerHTML='<b>'+esc(pick.name)+'</b><br>'+esc(pick.address);send.style.display='block';send.scrollIntoView({behavior:'smooth'})});
      })}
  find.onclick=()=>{if(!items.length){note.textContent='Add at least one file first.';return}if(items.some(it=>!it.b64)){note.textContent='Still reading a file, one second.';return}note.textContent='Locating…';
    if(!navigator.geolocation){query(null);return}
    var done=false;var t=setTimeout(()=>{if(!done){done=true;note.textContent='Using approximate location…';query(null)}},7000);
    navigator.geolocation.getCurrentPosition(p=>{if(done)return;done=true;clearTimeout(t);query({lat:p.coords.latitude,lon:p.coords.longitude})},
      ()=>{if(done)return;done=true;clearTimeout(t);note.textContent='Using approximate location…';query(null)},{enableHighAccuracy:true,timeout:6000})};
  var PRE=%PRESHOP%;
  if(PRE){pick=PRE;document.getElementById('note').textContent='Sending to '+PRE.name;shops.style.display='none';
    var pk=document.getElementById('pick');if(pk)pk.innerHTML='<b>'+esc(PRE.name)+'</b><br>'+esc(PRE.address||'');send.style.display='block';
    find.textContent='Choose files, then send'; find.onclick=()=>{if(!items.length){note.textContent='Add at least one file first.';return}send.scrollIntoView({behavior:'smooth'})};}
  go.onclick=()=>{if(!pick)return;if(!document.getElementById('agree').checked){result.innerHTML='Please agree to the Terms of Use first.';return;}result.innerHTML='Sending…';
    fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shop_id:pick.id,name:cname.value,email:cemail.value,agree:true,terms_version:'${legal.VERSION}',items:items.map(it=>({filename:it.name,fileB64:it.b64,copies:it.copies,color:it.color}))})}).then(r=>r.json()).then(d=>{
      if(d.pending)result.innerHTML='<div class=job style=background:#fff7e0><b>Check your email.</b><br>We sent a confirmation link to <b>'+esc(d.email)+'</b>. Tap it to release your '+Number(d.count)+' file'+(d.count>1?'s':'')+' to '+esc(pick.name)+' — your pickup code appears right after. (Look in spam if it is not there in a minute.)</div>';
      else if(d.pickup_code)result.innerHTML='<div class=job style=background:#e8f5ec><b>Sent '+Number(d.count)+' file'+(d.count>1?'s':'')+' to '+esc(pick.name)+'!</b><br>Show this pickup code at the counter:<br><span style="font-family:Anton;font-size:34px;letter-spacing:3px">'+d.pickup_code+'</span></div>';
      else result.innerHTML='Error: '+(d.error||'failed')})};
  </script>`.replace('%PRESHOP%', preShop ? scriptJSON({id:preShop.id,name:preShop.name,address:preShop.address}) : 'null'));
}

const MAIL_DOMAIN = process.env.PRINTAT_MAIL_DOMAIN || new URL(BASE).hostname.replace(/^www\./, '');
const INBOUND_SECRET = process.env.INBOUND_SECRET || '';
const ADMIN_SECRET = process.env.PRINTAT_ADMIN_SECRET || '';
const LATEST = { at: 0, data: null };
const FALLBACK_INBOX = process.env.PRINTAT_INBOX || '';
const clientIp = req => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
const AGREE_HTML = `<label class=check style="display:flex;gap:8px;align-items:flex-start;font-family:Bitter;text-transform:none;letter-spacing:0;font-size:14px;margin-top:12px"><input type=checkbox name=agree value=1 required style="width:auto;margin-top:3px"> <span>I agree to the <a href="/terms" target=_blank>Terms of Use</a> and acknowledge the <a href="/privacy" target=_blank>Privacy Policy</a>.</span></label>`;
const replyAddr = (kind, ref) => `${kind}-${String(ref).toLowerCase()}@${MAIL_DOMAIN}`;
// ---- support: match a question / bug report to the FAQ with Jev; escalate when unsure ----
async function triage(text) {
  const out = { faq: null, confidence: 0, category: 'other' };
  if (!text || !shopResearch.enabled()) return out;
  try {
    const criteria = Object.fromEntries(FAQ.map(f => [f.id, `${f.title}. Typical report: ${f.match}`]).concat([['none', 'None of the listed problems match; this needs a person.']]));
    const { answers } = await shopResearch.decide({ user_message: text.slice(0, 4000) }, {
      faq: { type: 'choice', instructions: 'Which known Print@ problem or question does this message describe? Pick "none" if it is not clearly one of them.', criteria },
      category: { type: 'choice', instructions: 'What kind of message is this?', criteria: { install: 'Installing or updating the driver, command line errors.', connect: 'Connecting the Mac to the cloud, magic links, email delivery of the link.', printing: 'A print job: finding shops, ranking, sending, the status window, queue.', shop: 'A print shop, pickup codes, replies from shops, the shop portal.', account: 'Pricing, privacy, account, billing.', feature: 'A feature request or product feedback rather than a problem.', other: 'Anything else.' } },
    });
    const a = answers.faq || {}; out.confidence = a.confidence || 0; out.faq = a.choice && a.choice !== 'none' && out.confidence >= 0.6 ? FAQ.find(f => f.id === a.choice) || null : null;
    out.category = (answers.category && answers.category.choice) || 'other';
  } catch (e) { console.error('triage:', e.message); }
  return out;
}
const HELP_CSS = `<style>.faq{margin-top:10px}.faq details{border:2px solid var(--ink);background:#fff;padding:8px 12px;margin-top:8px}.faq summary{font-family:Oswald;font-weight:700;cursor:pointer}.faq pre{white-space:pre-wrap;font-size:14px}.ans{background:#e8f5ec;border:2px solid #2e7d4f;padding:12px;margin-top:10px;white-space:pre-wrap}</style>`;
function helpPage(msg = '') {
  return page('Print@™ help', `<div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag><a href="/">Home</a></span></div>
  <p class=tag>Help &amp; bug reports</p>${HELP_CSS}${msg}
  <div class=card><div class=lab>Ask a question</div>
    <label>What's going on?<textarea id=q rows=3 placeholder="e.g. printat connect says Cannot find module…"></textarea></label>
    <button class=btn id=ask>Ask</button><div id=ans></div></div>
  <div class=card><div class=lab>Report a problem</div><form id=bug>
    <label>Your email<input name=email inputmode=email required placeholder="you@example.com"></label>
    <label>What happened, and what you expected<textarea name=description rows=5 required></textarea></label>
    <label>Screenshot (optional)<input type=file name=shot accept="image/*"></label>
    <button class=btn red>Send report</button><div class=muted id=note style=margin-top:8px>We read every report. If it matches a known fix you get it back by email right away; otherwise a person picks it up.</div></form></div>
  <div class=card><div class=lab>Known fixes</div><div class=faq>${FAQ.map(f => `<details><summary>${esc(f.title)}</summary><pre>${esc(f.answer)}</pre></details>`).join('')}</div></div>
  <script>
  document.getElementById('ask').onclick=async()=>{const q=document.getElementById('q').value.trim();if(!q)return;const a=document.getElementById('ans');a.innerHTML='<div class=muted>Thinking…</div>';
    const r=await fetch('/api/help/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q})}).then(r=>r.json());
    a.innerHTML=r.answer?'<div class=ans><b>'+r.title+'</b><br><br>'+r.answer.replace(/</g,'&lt;')+'</div>':'<div class=ans style="background:#fff7e0;border-color:#d09a3c">Not a known one. Send it as a report below and a person will answer by email.</div>';};
  document.getElementById('bug').onsubmit=async e=>{e.preventDefault();const f=e.target;const note=document.getElementById('note');note.textContent='Sending…';
    const file=f.shot.files[0];let shot=null;if(file){shot=await new Promise(res=>{const rd=new FileReader();rd.onload=()=>res({name:file.name,b64:rd.result.split(',')[1]});rd.readAsDataURL(file)});}
    const r=await fetch('/api/bugs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:f.email.value,description:f.description.value,source:'web',screenshot:shot})}).then(r=>r.json());
    note.innerHTML=r.ok?('<b>Got it — ticket #'+r.id+'.</b> '+(r.answer?'This looks like a known one; the fix is in your inbox and below.<div class=ans>'+r.answer.replace(/</g,'&lt;')+'</div>':'A person will reply to '+f.email.value+'.')):'Error: '+(r.error||'failed');
    if(r.ok)f.reset();};
  </script>`);
}
// Turn a bug report into a ticket, an auto-reply when we know the fix, and a heads-up to a human.
async function fileTicket(b, source) {
  const email = String(b.email || '').trim().toLowerCase();
  const desc = String(b.description || '').slice(0, 20000);
  if (!desc) return { error: 'description required' };
  let shotPath = '';
  if (b.screenshot && b.screenshot.b64) {
    const dir = path.join(db.DIR, 'bugs'); fs.mkdirSync(dir, { recursive: true });
    const name = String(b.screenshot.name || 'shot.png').replace(/[^\w.]+/g, '_').slice(-60);
    shotPath = path.join(dir, `${Date.now()}-${name}`); fs.writeFileSync(shotPath, Buffer.from(String(b.screenshot.b64).slice(0, 12e6), 'base64'));
  }
  const diag = typeof b.diagnostics === 'string' ? b.diagnostics.slice(0, 40000) : JSON.stringify(b.diagnostics || {}, null, 1).slice(0, 40000);
  const t = await triage(desc + (diag ? '\n\nDiagnostics:\n' + diag.slice(0, 3000) : ''));
  const id = db.createTicket({ email, source, description: desc, diagnostics: diag, screenshot: shotPath, category: t.category, faq_id: t.faq ? t.faq.id : '', faq_confidence: t.confidence, status: t.faq ? 'auto-replied' : 'open' });
  const subjectTag = `[Print@ #${id}] ${t.category}${t.faq ? ' · auto: ' + t.faq.id : ' · NEEDS A HUMAN'}`;
  const summary = `From: ${email || '(no email)'} via ${source}\nCategory: ${t.category}\nFAQ match: ${t.faq ? t.faq.id + ' (' + t.confidence.toFixed(2) + ')' : 'none (' + t.confidence.toFixed(2) + ')'}\n\n${desc}\n\n--- diagnostics ---\n${diag || '(none)'}\n\nAdmin: ${BASE}/admin/bugs?key=…`;
  if (FALLBACK_INBOX) {
    if (shotPath) mail.withAttachment(FALLBACK_INBOX, '', subjectTag, summary, { filename: path.basename(shotPath), buffer: fs.readFileSync(shotPath), contentType: 'image/png' }, email || undefined).catch(e => console.error('ticket mail:', e.message));
    else mail(FALLBACK_INBOX, subjectTag, summary, email || undefined);
  }
  if (email) {
    if (t.faq) mail(email, `Print@ support: ${t.faq.title}`, `Thanks for the report (ticket #${id}). This looks like a known one; here is the fix:\n\n${t.faq.answer}\n\nIf that doesn't do it, just reply to this email and a person will pick it up.`, FALLBACK_INBOX || undefined);
    else mail(email, `Print@ support: we got your report (#${id})`, `Thanks. A person is looking at it and will reply here.\n\nWhat you sent:\n${desc.slice(0, 2000)}`, FALLBACK_INBOX || undefined);
  }
  return { ok: true, id, category: t.category, faq: t.faq ? t.faq.id : null, answer: t.faq ? t.faq.answer : null, title: t.faq ? t.faq.title : null };
}

// Retention. Customers' documents exist on this server only for the shop to print them:
// deleted the moment the order is marked picked up, unconfirmed uploads after 2 hours, and
// anything left after 7 days. Bug-report screenshots go after 30 days. Runs hourly.
function purgeJobFiles(jobs) {
  let n = 0;
  for (const j of jobs) { try { if (j.filepath) fs.unlinkSync(j.filepath); db.clearJobFile(j.id); n++; } catch (e) { if (e.code === 'ENOENT') { db.clearJobFile(j.id); n++; } else console.error('purge:', j.filepath, e.message); } }
  return n;
}
function sweep() {
  try {
    const now = Date.now();
    const n = purgeJobFiles(db.filesToPurge(now));
    let t = 0; for (const r of db.oldTickets(now)) { try { fs.unlinkSync(r.screenshot); db.clearTicketShot(r.id); t++; } catch (e) { if (e.code === 'ENOENT') { db.clearTicketShot(r.id); t++; } } }
    if (n || t) console.log(`sweep: removed ${n} job file(s), ${t} screenshot(s)`);
  } catch (e) { console.error('sweep:', e.message); }
}
setTimeout(sweep, 5000); setInterval(sweep, 3600e3).unref();

function jobListing(items) { return items.map(x => `  • ${x.filename} — ${x.copies} cop${x.copies === 1 ? 'y' : 'ies'}, ${x.color ? 'color' : 'B&W'}`).join('\n'); }
function notifyShop(shop, jobs, customerName) {
  mail(shop.email, `New print job (${jobs.length} file${jobs.length > 1 ? 's' : ''}) — pickup ${jobs[0].pickup_code}`,
    `${customerName || 'A customer'} sent ${jobs.length} file${jobs.length > 1 ? 's' : ''} to ${shop.name}:\n${jobListing(jobs)}\n\nOpen your queue to print: ${BASE}/shop/dashboard\n\nPickup code: ${jobs[0].pickup_code}\n\nReply to this email to message the customer.`,
    replyAddr('order', jobs[0].pickup_code));
}

// ---- GUIDES (SEO / answer pages) ----
const GUIDE_CSS = `<style>.guide{max-width:720px}.guide h1{font-family:"Anton";font-size:34px;line-height:1.15;text-transform:none;letter-spacing:0;margin:10px 0 4px}.guide h1:after{content:none}.guide .meta{color:#5c6f80;font-size:13px;margin:0 0 18px}.guide p,.guide li{font-size:17px;line-height:1.6}.guide ul,.guide ol{padding-left:22px}.guide h2{margin-top:30px}.guide .cta{background:#f5ecd7;border:3px solid #1c3a57;box-shadow:6px 6px 0 rgba(28,58,87,.14);padding:18px 20px;margin:30px 0}.guide .cta p{margin:0 0 12px}.guide .cta a.btn{display:inline-block;width:auto;margin:0 8px 8px 0;padding:10px 16px}.guide dl dt{font-weight:700;margin-top:14px}.guide dl dd{margin:4px 0 0}.related a,.allguides a{display:block;padding:8px 0;border-top:1px solid rgba(28,58,87,.2);color:#1c3a57;font-weight:600;text-decoration:none}.related a:hover,.allguides a:hover{color:#c8432c}</style>`;
const guideCta = () => `<div class=cta><p><b>Print@</b> does this from the Print dialog on a Mac: pick <b>Print@ Nearby</b>, and it finds the closest shop or public printer, sends the file, and gives you a pickup code. From a phone, send a file to a Print@ Network shop.</p><a class="btn red" href="/#install">Install on macOS</a><a class=btn href="/app">Print from the web</a><a class=btn href="/guides">All guides</a></div>`;
function guidePage(g) {
  const url = `${BASE}/guides/${g.slug}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, datePublished: guides.UPDATED, dateModified: guides.UPDATED, author: { '@type': 'Organization', name: 'Print@', url: BASE }, publisher: { '@type': 'Organization', name: 'Print@', logo: { '@type': 'ImageObject', url: BASE + '/assets/og.png' } }, mainEntityOfPage: url, image: BASE + '/assets/og.png' },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Print@', item: BASE }, { '@type': 'ListItem', position: 2, name: 'Guides', item: BASE + '/guides' }, { '@type': 'ListItem', position: 3, name: g.title, item: url }] },
  ];
  const related = (g.related || []).map(guides.find).filter(Boolean);
  const inner = `${GUIDE_CSS}<div class=head><h1><a href="/" style="color:inherit;text-decoration:none">PRINT<span class=at>@</span></a></h1><span class=tag><a href="/guides">Guides</a></span></div>
<article class=guide><h1>${esc(g.title)}</h1><p class=meta>Print@ guides · updated ${guides.UPDATED}</p>${guides.bodyHtml(g.body)}${guideCta()}
<h2>Questions people ask</h2><dl>${g.faq.map(f => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join('')}</dl>
${related.length ? `<h2>Related guides</h2><div class=related>${related.map(r => `<a href="/guides/${r.slug}">${esc(r.title)}</a>`).join('')}</div>` : ''}
<h2>All guides</h2><div class=allguides>${guides.byTitle().map(r => `<a href="/guides/${r.slug}">${esc(r.title)}</a>`).join('')}</div></article>
<script type="application/ld+json">${scriptJSON(ld)}</script>`;
  return page(g.title, inner, { description: g.description, path: '/guides/' + g.slug, type: 'article' });
}
function guidesIndex() {
  const inner = `${GUIDE_CSS}<div class=head><h1><a href="/" style="color:inherit;text-decoration:none">PRINT<span class=at>@</span></a></h1><span class=tag>Guides</span></div>
<article class=guide><h1>Where to print, anywhere</h1><p class=meta>Short, practical answers for the moments people go looking for a printer.</p>
<div class=allguides>${guides.byTitle().map(r => `<a href="/guides/${r.slug}">${esc(r.title)}<br><span style="font-weight:400;color:#5c6f80;font-size:14px">${esc(r.description)}</span></a>`).join('')}</div>${guideCta()}</article>`;
  return page('Print@ guides: where to print, anywhere', inner, { description: 'Guides to printing without a printer: hotels, libraries, airports, abroad, from a phone, in the next hour.', path: '/guides' });
}
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/app', '/shop', '/help', '/guides', '/terms', '/privacy', ...guides.GUIDES.map(g => '/guides/' + g.slug)].map(u => `  <url><loc>${BASE}${u}</loc><lastmod>${guides.UPDATED}</lastmod></url>`).join('\n')}\n</urlset>\n`;

// ---- HELP CHAT ----
const CHAT_MODEL = process.env.PRINTAT_CHAT_MODEL || 'anthropic/claude-haiku-4.5';
const CHAT_SYSTEM = () => `You are the Print@ helper, a support chat on printat.co. Be brief, concrete and friendly; plain sentences, no bullet spam, no em dashes. Under 120 words unless steps are needed.

What Print@ is: an open-source macOS virtual printer. After install, "Print@ Nearby" appears in every app's Print dialog; choosing it finds where you are, ranks nearby public printers (hotel and library printers, kiosks, chains, independent shops), and sends the document the way that place accepts it (email, upload page, or a Print@ Network shop), then shows a receipt with the address and a pickup code. Files are deleted from Print@ as soon as the job is delivered. It is a free open-source beta, use at your own risk; terms at ${BASE}/terms.
Install: in Terminal, curl -fsSL https://printat.co/install.sh | bash (needs the Xcode Command Line Tools and Node.js 22+), or download the .pkg at ${BASE}/download/PrintAt.pkg (unsigned beta: allow it under System Settings > Privacy & Security > Open Anyway). Then run: printat connect you@email, and click the link in the email.
Update: the console at http://127.0.0.1:4243/ shows an Update now button when a new version exists; "printat update" in Terminal does the same. Console: settings, pinned shops, research keys, job history, bug reports. Status: printat status. Uninstall: ~/printat/uninstall.sh.
Research brain: with Claude Code installed it checks hours, prices and how each shop takes files; otherwise add an Anthropic or OpenAI key in the console; without any, it still sends to chains, hotels, libraries and kiosks by their known addresses.
Phones and Windows: no driver yet. Phones can send a file to a Print@ Network shop at ${BASE}/app. Shops join free at ${BASE}/shop. Guides for where to print: ${BASE}/guides. AI agents: the MCP server in the GitHub repo (github.com/AnthonyDavidAdams/print-at).
Rules: never invent a shop's prices or hours; say they vary and the receipt shows what Print@ found. For bugs, ask for the exact error text or the last lines of ~/Library/Logs/PrintAt/agent.log, give the matching known fix if there is one, and otherwise point to the report form at ${BASE}/help#bug (a person replies by email). You cannot take actions, send jobs or look up accounts. If you do not know, say so.

Known fixes (use these verbatim when they match):
${faqList.map(f => `- ${f.title}: ${f.answer}`).join('\n')}`;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400' };
async function helpChat(messages) {
  const msgs = (Array.isArray(messages) ? messages : []).filter(m => m && typeof m.content === 'string' && m.content.trim()).slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content.slice(0, 2000) }));
  const users = msgs.filter(m => m.role === 'user'); if (!users.length) throw new Error('say something first');
  if (users.length === 1) { try { const t = await triage(users[0].content); if (t.faq && t.confidence >= 0.8) return { answer: `${t.faq.title}\n\n${t.faq.answer}`, source: 'faq' }; } catch {} }
  const key = process.env.OPENROUTER_API_KEY;
  try {
    if (!key) throw new Error('chat is not configured');
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'HTTP-Referer': BASE, 'X-Title': 'Print@ help' },
      body: JSON.stringify({ model: CHAT_MODEL, messages: [{ role: 'system', content: CHAT_SYSTEM() }, ...msgs], max_tokens: 450, temperature: 0.3 }), signal: AbortSignal.timeout(40000) });
    const j = await r.json(); if (!r.ok || !j.choices) throw new Error(`model ${r.status}: ${JSON.stringify(j).slice(0, 120)}`);
    return { answer: String(j.choices[0].message.content || '').trim(), source: 'model' };
  } catch (e) {
    console.error('help chat:', e.message);
    // No model: match the question against the known fixes by words, so the chat still helps.
    const f = localFaq(users[users.length - 1].content);
    if (f) return { answer: `${f.title}\n\n${f.answer}\n\n(My full brain is offline right now, so this is the closest known fix. If it is not it, send a report at ${BASE}/help#bug and a person replies by email.)`, source: 'faq-local' };
    return { answer: `My full brain is offline for the moment. The known fixes are listed at ${BASE}/help, where you can also send a report and a person replies by email. Where to print: ${BASE}/guides.`, source: 'offline' };
  }
}
function localFaq(q) {
  const words = new Set(String(q).toLowerCase().match(/[a-z0-9@.'-]{3,}/g) || []); if (!words.size) return null;
  let best = null, bestScore = 0;
  for (const f of faqList) { const hay = `${f.title} ${f.match || ''}`.toLowerCase(); let score = 0; for (const w of words) if (hay.includes(w)) score++; if (score > bestScore) { bestScore = score; best = f; } }
  return bestScore >= 2 ? best : null;
}

// ---- WEEKLY REPORT ----
// Monday morning (Pacific) mail to the maintainer: installs, connects, prints, shops, tickets.
function weeklyReportText(days = 7) {
  const since = Date.now() - days * 864e5; const st = db.stats(since);
  const list = (rows, f) => rows.length ? rows.map(f).join('\n') : '  (none)';
  return `Print@ week in review · ${new Date(since).toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}

INSTALLS
  New Macs: ${st.installsNew}   Updates: ${st.installsUpdate}   Installer downloads: ${st.downloads}
  Connected this week: ${st.connects}
  Totals: ${st.installsTotal} Macs installed, ${st.devicesTotal} connected

PRINTS
  Driver dispatches: ${st.dispatches} (from ${st.dispatchUsers} people)
${list(st.dispatchShops, r => `  ${r.n} × ${r.name || '(unnamed)'}`)}
  Portal jobs: ${st.portalJobs}
${list(st.portalShops, r => `  ${r.n} × ${r.name}`)}

NETWORK
  New shops: ${st.newShops.length} (total ${st.shopsTotal})
${list(st.newShops, r => `  ${r.name}${r.city ? ', ' + r.city : ''}${r.state ? ' ' + r.state : ''}`)}
  Pooled shop facts: ${st.facts}

SUPPORT
  Tickets this week: ${st.tickets.map(t => `${t.n} ${t.status}`).join(', ') || 'none'}   Open now: ${st.ticketsOpen}
  ${BASE}/admin/bugs`;
}
async function sendWeeklyReport(force = false) {
  const last = Number(db.getMeta('weekly_report_at') || 0);
  const d = new Date(); const monday = d.getUTCDay() === 1 && d.getUTCHours() >= 15; // 8am Pacific
  if (!force && !(monday && Date.now() - last > 6 * 864e5)) return null;
  const text = weeklyReportText();
  if (FALLBACK_INBOX) { await mail(FALLBACK_INBOX, `[Print@] Week in review: ${db.stats(Date.now() - 7 * 864e5).installsNew} installs, ${db.stats(Date.now() - 7 * 864e5).dispatches + db.stats(Date.now() - 7 * 864e5).portalJobs} prints`, text); db.setMeta('weekly_report_at', Date.now()); }
  return text;
}
setInterval(() => sendWeeklyReport().catch(e => console.error('weekly report:', e.message)), 3600e3).unref();

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const q = Object.fromEntries(new URL(req.url, BASE).searchParams);
  try {
    if (req.method === 'GET' && url === '/') {
      if (q.shop) return redirect(res, '/app?shop=' + encodeURIComponent(q.shop)); // old shop signs / QR codes
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(LANDING);
    }
    if (req.method === 'GET' && url === '/app') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(customerPage(q.shop ? db.shopById(Number(q.shop)) : null)); }
    if (req.method === 'GET' && (url === '/install.sh' || url === '/install')) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(INSTALL_SH); }
    if (req.method === 'GET' && url.startsWith('/assets/')) return asset(res, url);
    if (req.method === 'GET' && url === '/health') return json(res, 200, { ok: true });

    // customer: shops nearby
    if (req.method === 'POST' && url === '/api/shops-nearby') {
      let { lat, lon, radiusMi } = JSON.parse((await body(req)).toString() || '{}');
      const radius = Math.min(100, Number(radiusMi) || 25);
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
        try { const g = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon`, { signal: AbortSignal.timeout(6000) }).then(r => r.json());
          if (g.status === 'success') { lat = g.lat; lon = g.lon; } } catch {}
      }
      if (typeof lat !== 'number' || typeof lon !== 'number') return json(res, 200, { shops: [], located: false });
      const shops = db.activeShops().filter(s => s.lat != null).map(s => { const r = db.shopRating(s.id); return {
        id: s.id, name: s.name, address: s.address, hours: s.hours, price_bw: s.price_bw, price_color: s.price_color,
        distance_mi: Math.round(miles({ lat, lon }, s) * 10) / 10, stars: r.avg ? Math.round(r.avg * 10) / 10 : 0,
        lat: s.lat, lon: s.lon }; }).filter(s => s.distance_mi <= radius).sort((a, b) => a.distance_mi - b.distance_mi);
      return json(res, 200, { shops, located: true });
    }
    // status of a job group by pickup code
    if (req.method === 'GET' && url === '/api/status') {
      const g = db.jobsByCode(q.code || '');
      if (!g.length) return json(res, 404, { error: 'no job for that code' });
      const shop = db.shopById(g[0].shop_id);
      return json(res, 200, { pickup_code: g[0].pickup_code, shop: shop ? shop.name : '', address: shop ? shop.address : '',
        files: g.map(j => ({ copies: j.copies, color: !!j.color, status: j.status })),
        status: g.every(j => j.status === 'done') ? 'done' : g.some(j => j.status !== 'queued') ? 'in_progress' : 'queued' });
    }
    // customer: send a job
    if (req.method === 'POST' && url === '/api/send') {
      if (limited('send:' + clientIp(req), 20, 3600e3)) return json(res, 429, { error: 'too many uploads; try again later' });
      const b = JSON.parse((await body(req, BIG)).toString() || '{}');
      const shop = db.shopById(Number(b.shop_id)); if (!shop) return json(res, 404, { error: 'shop not found' });
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'a valid email is required — we send your pickup code there' });
      if (!b.agree) return json(res, 400, { error: 'please agree to the Terms of Use' });
      db.recordConsent(email, 'portal', b.terms_version || legal.VERSION, clientIp(req));
      const items = (b.items && b.items.length) ? b.items : [{ filename: b.filename, fileB64: b.fileB64, copies: b.copies, color: b.color }];
      const saved = [];
      for (const it of items) {
        if (!it.fileB64) continue;
        const fp = path.join(db.DIR, 'files', db.rid(10) + '-' + String(it.filename || 'doc.pdf').replace(/[^\w.]+/g, '_'));
        fs.writeFileSync(fp, Buffer.from(it.fileB64, 'base64'));
        saved.push({ filename: it.filename, filepath: fp, copies: Number(it.copies) || 1, color: it.color === 'color' });
      }
      if (!saved.length) return json(res, 400, { error: 'no files' });
      // Held as 'pending' until the customer confirms their email (so the shop never prints
      // for a bogus address and the pickup code reaches a real inbox).
      const job = db.createJobGroup({ shop_id: shop.id, customer_name: b.name, customer_email: email, status: 'pending' }, saved);
      const t = db.makeToken(email, 'release:' + job.group_id, 60);
      mail(email, `Confirm your email to send ${saved.length} file${saved.length > 1 ? 's' : ''} to ${shop.name}`,
        `Tap this link to release your print job to ${shop.name}:\n${BASE}/release?t=${t}\n\n${jobListing(saved)}\n\nYour pickup code appears once you confirm. The link expires in 60 minutes; if you didn't request this, ignore it.`);
      return json(res, 200, { pending: true, email, count: saved.length });
    }
    if (req.method === 'GET' && url === '/release') {
      const row = db.useToken(q.t);
      const gid = row && String(row.purpose || '').startsWith('release:') ? row.purpose.slice(8) : null;
      const jobs = gid ? db.releaseGroup(gid) : [];
      if (!jobs.length) return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Link expired', `<div class=head><h1>PRINT<span class=at>@</span></h1></div><div class=card><p>That link expired or was already used. <a href="/app">Send the job again</a>.</p></div>`));
      const shop = db.shopById(jobs[0].shop_id); const first = jobs[0];
      // Cover sheet goes on the front of each PDF now that the job is real.
      for (const j of jobs) {
        if (!j.filepath || !fs.existsSync(j.filepath)) continue;
        try { const c = await cover.withCover(fs.readFileSync(j.filepath), { name: first.customer_name, email: first.customer_email, code: first.pickup_code, shop: shop.name, filename: j.filename, copies: j.copies, color: !!j.color }); if (c.merged) { fs.writeFileSync(j.filepath, c.buffer); db.setJobPages(j.id, c.pages); j.pages = c.pages; } }
        catch (e) { console.error('cover sheet:', e.message); }
      }
      notifyShop(shop, jobs, first.customer_name);
      mail(first.customer_email, `Your pickup code for ${shop.name}: ${first.pickup_code}`,
        `Your ${jobs.length} file${jobs.length > 1 ? 's are' : ' is'} on the way to ${shop.name}${shop.address ? ', ' + shop.address : ''}.\n\nPickup code: ${first.pickup_code}\n\nShow it at the counter. Reply to this email if you have a question about the order.`);
      return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Sent to ' + shop.name, `<div class=head><h1>PRINT<span class=at>@</span></h1></div>
        <div class=card style=background:#e8f5ec><div class=lab>Sent</div><p><b>${jobs.length} file${jobs.length > 1 ? 's' : ''}</b> released to <b>${esc(shop.name)}</b>${shop.address ? ' · ' + esc(shop.address) : ''}.</p>
        <p>Show this pickup code at the counter:</p><div style="font-family:Anton;font-size:44px;letter-spacing:4px">${first.pickup_code}</div>
        <p class=muted>We also emailed it to ${esc(first.customer_email)}.</p></div>`));
    }

    // ---- DRIVER DEVICE AUTHORIZATION (magic link) ----
    // The open-source driver links this Mac so it can dispatch through the cloud.
    if (req.method === 'POST' && url === '/api/device/start') {
      const b = JSON.parse((await body(req)).toString() || '{}');
      if (!b.email || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(b.email))) return json(res, 400, { error: 'valid email required' });
      if (limited('devstart:' + clientIp(req), 10, 3600e3) || limited('devstart:' + String(b.email).toLowerCase(), 5, 3600e3)) return json(res, 429, { error: 'too many attempts; try again in an hour' });
      const { poll, magic } = db.makeDevicePoll(b.email, b.name, b.device);
      mail(b.email, 'Connect your Mac to Print@',
        `You (or the Print@ driver on "${b.device || 'your Mac'}") asked to connect to Print@.\n\nConfirm this device (by confirming you agree to the Terms of Use, ${BASE}/terms, and acknowledge the Privacy Policy, ${BASE}/privacy):\n${BASE}/device/confirm?c=${magic}\n\nAfter you confirm, your Mac will print through Print@ — no email setup, Print@ Network shops, pickup codes. This link expires in 15 minutes. If you didn't request it, ignore this email.`);
      return json(res, 200, { poll });
    }
    if (req.method === 'GET' && url === '/device/confirm') {
      const pending = db.pollByMagic(q.c);
      if (!pending) return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Link expired', `<div class=head><h1>PRINT<span class=at>@</span></h1></div><div class=card><p>That link expired or was already used. Run <b>printat connect</b> on your Mac again.</p></div>`));
      return res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }), res.end(page('Connect this Mac', `<div class=head><h1>PRINT<span class=at>@</span></h1></div>
        <div class=card><div class=lab>Connect this Mac?</div><p><b>${esc(pending.device || 'A Mac')}</b> asked to connect to Print@ as <b>${esc(pending.email)}</b>. If that wasn't you, close this page.</p>
        <form method=post action="/device/confirm"><input type=hidden name=c value="${esc(q.c)}">${AGREE_HTML}<button class=btn red>Connect this Mac</button></form></div>`));
    }
    if (req.method === 'POST' && url === '/device/confirm') {
      const f = await form(req); q.c = f.c;
      if (!f.agree) return res.writeHead(400, { 'Content-Type': 'text/html' }), res.end(page('Terms', `<div class=wrap><p>Please agree to the Terms of Use to connect. <a href="javascript:history.back()">Go back</a></p></div>`));
      const row = db.confirmDevicePoll(q.c);
      if (!row) return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Link expired', `<div class=head><h1>PRINT<span class=at>@</span></h1></div><div class=card><p>That link expired or was already used. Run <b>printat connect</b> on your Mac again.</p></div>`));
      db.recordConsent(row.email, 'device', legal.VERSION, clientIp(req));
      if (FALLBACK_INBOX) { const n = db.stats(0).devicesTotal; mail(FALLBACK_INBOX, `[Print@] Connected: ${row.email} (${row.device || 'a Mac'}) · device #${n}`, `${row.email} connected ${row.device || 'a Mac'} to the Print@ cloud.\nConnected devices so far: ${n}.\n\n${BASE}/admin/bugs`).catch(e => console.error('connect mail:', e.message)); }
      return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Device connected', `<div class=head><h1>PRINT<span class=at>@</span></h1></div>
        <div class=card><div class=lab>Connected</div><p><b>${esc(row.device || 'Your Mac')}</b> is now linked to Print@ as <b>${esc(row.email)}</b>.</p>
        <p class=muted>By connecting you agree to the <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Policy</a>.</p>
        <p class=muted>Return to your Mac — the driver will pick this up in a few seconds. From now on your print jobs dispatch through Print@: sent from a Print@ address, Print@ Network shops with pickup codes, nothing to configure locally.</p></div>`));
    }
    if (req.method === 'GET' && url === '/api/device/poll') {
      const row = db.pollById(q.poll);
      if (!row) return json(res, 404, { error: 'unknown poll' });
      if (row.device_token) { db.consumePoll(q.poll); res.setHeader('Cache-Control', 'no-store'); return json(res, 200, { status: 'ok', device_token: row.device_token, email: row.email }); }
      if (row.expires < Date.now()) return json(res, 200, { status: 'expired' });
      return json(res, 200, { status: 'pending' });
    }
    if (req.method === 'POST' && url === '/api/device/revoke') {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (db.device(auth)) db.deleteDevice(auth);
      return json(res, 200, { ok: true });
    }
    // Driver dispatches a directory job (chain/library/PrinterOn/PrintMe) THROUGH the cloud:
    // the email is sent from printat.co, not the user's inbox, and the job is logged.
    if (req.method === 'POST' && url === '/api/dispatch') {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const dev = db.device(auth);
      if (!dev) return json(res, 401, { error: 'connect this device: run "printat connect"' });
      const b = JSON.parse((await body(req, BIG)).toString() || '{}');
      if (!b.to || !b.fileB64) return json(res, 400, { error: 'to and fileB64 required' });
      if (limited('dispatch:' + auth, 40, 3600e3)) return json(res, 429, { error: 'too many orders from this device this hour' });
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(b.to)) || (b.cc && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(b.cc)))) return json(res, 400, { error: 'invalid recipient' });
      if (String(b.fileB64).length > 25e6) return json(res, 413, { error: 'file too large' });
      const ref = 'PA-' + db.rid(6).toUpperCase();
      db.logDispatch({ device_token: auth, email: dev.email, shop_name: b.shop && b.shop.name, shop_address: b.shop && b.shop.address, to_email: b.to, subject: b.subject || '', filename: b.filename || '', ref, status: 'sending' });
      // Cover sheet on the front (name, pickup code, pages, our message slot) unless the
      // driver opted out (kiosk/release-style destinations, where the customer prints it themselves).
      let fileBuf = Buffer.from(b.fileB64, 'base64');
      const m = b.meta || {};
      if (b.cover !== false) {
        try { const c = await cover.withCover(fileBuf, { name: m.name || dev.name || '', email: dev.email, code: ref, ref, shop: b.shop && b.shop.name, filename: b.filename || 'document.pdf', pages: Number(m.pages) || 0, copies: Number(m.copies) || 1, color: !!m.color, duplex: !!m.duplex, tz: m.tz }); fileBuf = c.buffer; }
        catch (e) { console.error('cover sheet:', e.message); }
      }
      try {
        await mail.withAttachment(b.to, b.cc || '', b.subject || `Print order (${ref})`, (b.body || 'Please print the attached document.') + `\n\n— Sent via Print@ for ${dev.email} (ref ${ref}). Just reply to this email and it reaches them.${b.cover !== false ? ' The first page of the attachment is a cover sheet with the pickup name and code.' : ''}`,
          { filename: (b.filename || 'document.pdf').replace(/[^\w.]+/g, '_'), buffer: fileBuf }, replyAddr('job', ref));
      } catch (e) { db.setDispatchStatus(ref, 'failed'); return json(res, 502, { error: 'send failed: ' + e.message }); }
      db.setDispatchStatus(ref, 'sent');
      return json(res, 200, { ok: true, ref });
    }

    // ---- DEV AGENT (devagent/run.js on the maintainer's Mac) ----
    // Reads open tickets, records what it did, and replies to the reporter once a fix ships.
    if (url.startsWith('/api/admin/tickets')) {
      if (!ADMIN_SECRET || req.headers['x-printat-admin'] !== ADMIN_SECRET) return json(res, 401, { error: 'bad secret' });
      const m = url.match(/^\/api\/admin\/tickets(?:\/(\d+)(\/reply)?)?$/);
      if (!m) return json(res, 404, { error: 'not found' });
      if (req.method === 'GET' && !m[1]) return json(res, 200, { tickets: db.ticketsByStatus(q.status || 'open').map(t => ({ ...t, screenshot: !!t.screenshot })) });
      if (req.method === 'GET' && m[1] && !m[2]) { const t = db.ticket(Number(m[1])); return t ? json(res, 200, { ...t, screenshot: !!t.screenshot }) : json(res, 404, { error: 'no ticket' }); }
      if (req.method === 'POST' && m[1]) {
        const t = db.ticket(Number(m[1])); if (!t) return json(res, 404, { error: 'no ticket' });
        const b = JSON.parse((await body(req)).toString() || '{}');
        if (m[2]) { // reply to the reporter
          if (!t.email) return json(res, 400, { error: 'ticket has no email' });
          const text = String(b.text || '').slice(0, 10000); if (!text) return json(res, 400, { error: 'text' });
          await mail(t.email, b.subject || `Re: your Print@ report (#${t.id})`, text + `\n\n— Print@ support. Reply to this email if it is still not working.`, legal.CONTACT);
          return json(res, 200, { ok: true });
        }
        if (b.status) db.setTicketStatus(t.id, String(b.status).slice(0, 30));
        if (b.notes !== undefined) db.setTicketNotes(t.id, b.notes);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'method' });
    }

    // The public-printer directory, for connected drivers only (this is the asset).
    // Lives on the persistent volume (PRINTAT_NET_DIR/directory), uploaded by the
    // maintainer with PUT /api/admin/directory/<name> (x-printat-admin: PRINTAT_ADMIN_SECRET);
    // never in git, never in the build.
    const DIRECTORY_DIR = path.join(db.DIR, 'directory');
    if (req.method === 'PUT' && url.startsWith('/api/admin/directory/')) {
      if (!ADMIN_SECRET || req.headers['x-printat-admin'] !== ADMIN_SECRET) return json(res, 401, { error: 'bad secret' });
      const name = url.slice('/api/admin/directory/'.length).replace(/[^a-z0-9-]/g, '');
      if (!name) return json(res, 400, { error: 'name' });
      const buf = await body(req, BIG);
      try { JSON.parse(buf.toString('utf8')); } catch { return json(res, 400, { error: 'not JSON' }); }
      fs.mkdirSync(DIRECTORY_DIR, { recursive: true });
      const file = path.join(DIRECTORY_DIR, name + '.json');
      fs.writeFileSync(file + '.tmp', buf); fs.renameSync(file + '.tmp', file);
      return json(res, 200, { ok: true, name, bytes: buf.length });
    }
    if (req.method === 'GET' && url.startsWith('/api/directory/')) {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!db.device(auth)) return json(res, 401, { error: 'connect this device: run "printat connect"' });
      const name = url.slice('/api/directory/'.length).replace(/[^a-z0-9-]/g, '');
      const file = [path.join(DIRECTORY_DIR, name + '.json'), path.join(__dirname, 'directory', name + '.json')].find(f => name && fs.existsSync(f));
      if (!file) return json(res, 404, { error: 'no such directory file' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=3600', 'Last-Modified': fs.statSync(file).mtime.toUTCString() });
      return res.end(fs.readFileSync(file));
    }

    // ---- LEGAL ----
    if (req.method === 'GET' && (url === '/terms' || url === '/privacy')) {
      const body_ = url === '/terms' ? legal.TERMS : legal.PRIVACY;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page(url === '/terms' ? 'Print@™ Terms of Use' : 'Print@™ Privacy Policy', `<div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag><a href="/">Home</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/privacy">Privacy</a></span></div><style>h2{margin-top:18px}h3{font-family:"Oswald";text-transform:uppercase;letter-spacing:1px;font-size:15px;margin:18px 0 6px}p,li{line-height:1.5}ul{padding-left:20px}</style>${body_}<p class=muted style="margin-top:24px"><a href="/terms">Terms of Use</a> &middot; <a href="/privacy">Privacy Policy</a> &middot; <a href="/help">Help</a></p>`));
    }

    // ---- SUPPORT ----
    if (req.method === 'GET' && url === '/help') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(helpPage()); }
    if (req.method === 'GET' && url === '/chat.js') { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }); return res.end(CHAT_JS); }
    if (req.method === 'GET' && url === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /shop/dashboard\nSitemap: ${BASE}/sitemap.xml\n`); }
    if (req.method === 'GET' && url === '/sitemap.xml') { res.writeHead(200, { 'Content-Type': 'application/xml' }); return res.end(sitemap()); }
    if (req.method === 'GET' && url === '/guides') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(guidesIndex()); }
    if (req.method === 'GET' && url.startsWith('/guides/')) {
      const g = guides.find(url.slice(8).replace(/\/$/, '')); if (!g) return res.writeHead(404, { 'Content-Type': 'text/html' }), res.end(page('Not found', `<div class=head><h1>PRINT<span class=at>@</span></h1></div><div class=card><p>No guide at that address. <a href="/guides">All guides</a>.</p></div>`));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); return res.end(guidePage(g));
    }
    if (req.method === 'OPTIONS' && url === '/api/help/chat') { res.writeHead(204, CORS); return res.end(); }
    if (req.method === 'POST' && url === '/api/help/chat') {
      const out = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(o)); };
      if (limited('chat:' + clientIp(req), 40, 3600e3)) return out(429, { error: 'too many messages this hour' });
      let b; try { b = JSON.parse((await body(req)).toString() || '{}'); } catch { return out(400, { error: 'bad json' }); }
      try { const r = await helpChat(b.messages); db.event('chat', r.source); return out(200, r); }
      catch (e) { console.error('help chat:', e.message); return out(200, { answer: `I could not take that message (${e.message}). Known fixes and the report form are at ${BASE}/help.`, error: e.message }); }
    }
    if (req.method === 'POST' && url === '/api/help/ask') {
      if (limited('ask:' + clientIp(req), 30, 3600e3)) return json(res, 429, { error: 'slow down' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      const t = await triage(String(b.q || ''));
      return json(res, 200, t.faq ? { answer: t.faq.answer, title: t.faq.title, id: t.faq.id, confidence: t.confidence } : { answer: null, confidence: t.confidence });
    }
    // Installer success ping (install.sh, end): counts installs and tells the maintainer right away.
    if (req.method === 'POST' && url === '/api/install') {
      if (limited('install:' + clientIp(req), 10, 3600e3)) return json(res, 429, { error: 'slow down' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      const i = { install_id: String(b.install_id || '').slice(0, 40), kind: /^(new|update)$/.test(b.kind) ? b.kind : 'new', version: String(b.version || '').slice(0, 12), macos: String(b.macos || '').slice(0, 20), arch: String(b.arch || '').slice(0, 10), node: String(b.node || '').slice(0, 12), ip: clientIp(req) };
      const n = db.recordInstall(i);
      if (FALLBACK_INBOX) mail(FALLBACK_INBOX, `[Print@] ${i.kind === 'new' ? 'New install' : 'Update'} · macOS ${i.macos} ${i.arch} · driver ${i.version} · ${n} Macs total`,
        `${i.kind === 'new' ? 'A new Mac installed the Print@ driver.' : 'A Mac updated the Print@ driver.'}\n\nmacOS ${i.macos} (${i.arch}), Node ${i.node}, driver ${i.version}.\nDistinct Macs that have installed: ${n}. Connected devices: ${db.stats(0).devicesTotal}.\n\nThey will show up as "Connected" when they run printat connect.`).catch(e => console.error('install mail:', e.message));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url === '/download/PrintAt.pkg') {
      const file = path.join(DOCS, 'assets', 'PrintAt.pkg');
      if (!fs.existsSync(file)) return res.writeHead(404).end('no installer built');
      db.event('download', clientIp(req));
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="PrintAt.pkg"', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(file));
    }
    if (req.method === 'POST' && url === '/api/admin/report') {
      if (!ADMIN_SECRET || req.headers['x-printat-admin'] !== ADMIN_SECRET) return json(res, 401, { error: 'bad secret' });
      const text = await sendWeeklyReport(true);
      return json(res, 200, { ok: true, text });
    }
    if (req.method === 'POST' && url === '/api/bugs') {
      if (limited('bugs:' + clientIp(req), 10, 3600e3)) return json(res, 429, { error: 'too many reports; try again later' });
      const b = JSON.parse((await body(req, BIG)).toString() || '{}');
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const dev = auth ? db.device(auth) : null;
      if (dev && !b.email) b.email = dev.email;
      const r = await fileTicket(b, b.source || (dev ? 'driver' : 'web'));
      return json(res, r.error ? 400 : 200, r);
    }
    const adminOk = () => ADMIN_SECRET && (cookies(req).pa_admin === ADMIN_SECRET || q.key === ADMIN_SECRET);
    if (req.method === 'GET' && url === '/admin/bugs') {
      if (!adminOk()) return json(res, 401, { error: 'bad key' });
      if (q.key) { res.writeHead(303, { Location: '/admin/bugs', 'Set-Cookie': `pa_admin=${encodeURIComponent(ADMIN_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=28800` }); return res.end(); }
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
      const rows = db.tickets();
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }), res.end(page('Print@ tickets', `<div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag>tickets</span></div>` + rows.map(r => `<div class=job><div class=head><b>#${r.id} ${esc(r.email)}</b> <span class="pill ${r.status === 'open' ? 'queued' : 'done'}">${esc(r.status)}</span></div><div class=m>${new Date(r.created).toISOString().slice(0, 16)} · ${esc(r.source)} · ${esc(r.category)}${r.faq_id ? ' · ' + esc(r.faq_id) + ' ' + (r.faq_confidence || 0).toFixed(2) : ''}</div><div style="margin-top:6px">${esc(r.description)}</div><div class=m><a href="/admin/bugs/${r.id}">details</a></div></div>`).join('') || '<p>No tickets.</p>'));
    }
    if (req.method === 'GET' && /^\/admin\/bugs\/\d+$/.test(url)) {
      if (!adminOk()) return json(res, 401, { error: 'bad key' });
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
      const t = db.ticket(Number(url.split('/')[3])); if (!t) return json(res, 404, { error: 'no ticket' });
      if (q.shot && t.screenshot && fs.existsSync(t.screenshot)) { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(fs.readFileSync(t.screenshot)); }
      return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }), res.end(page(`Ticket #${t.id}`, `<div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag><a href="/admin/bugs">« tickets</a></span></div><div class=card><div class=lab>#${t.id} · ${esc(t.status)} · ${esc(t.category)} · ${esc(t.source)}</div><p><b>${esc(t.email)}</b> · ${new Date(t.created).toISOString()}</p><pre style="white-space:pre-wrap">${esc(t.description)}</pre>${t.screenshot ? `<img src="/admin/bugs/${t.id}?shot=1" style="max-width:100%;border:2px solid var(--ink)">` : ''}<details><summary>diagnostics</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(t.diagnostics)}</pre></details></div>`));
    }

    // Latest driver version for the update check (tip of main on GitHub, cached 10 min).
    if (req.method === 'GET' && url === '/api/driver/latest') {
      if (!LATEST.at || Date.now() - LATEST.at > 600e3) {
        try {
          const r = await fetch('https://api.github.com/repos/AnthonyDavidAdams/print-at/commits/main', { headers: { 'user-agent': 'printat.co', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) });
          if (r.ok) { const c = await r.json(); LATEST.data = { commit: c.sha, date: Date.parse(c.commit && c.commit.committer && c.commit.committer.date) || 0, message: (c.commit && c.commit.message || '').split('\n')[0], url: c.html_url }; LATEST.at = Date.now(); }
        } catch (e) { console.error('driver/latest:', e.message); }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' });
      return res.end(JSON.stringify(LATEST.data || {}));
    }

    // ---- SHARED SHOP FACTS ----
    // Connected drivers ask what's known about their candidates before doing any research,
    // and report what they verified afterwards. Unknown shops get a cheap cloud research pass
    // (Jev) once, so the first person to ever hit a shop is the last person who has to wait.
    const factView = r => r ? { submit: { method: r.method, email: r.email || undefined, url: r.url || undefined, phone: r.phone || undefined, instructions: r.instructions || undefined },
      hours_today: r.hours_today || '', cost_basis: r.cost_basis || '', est_cost_usd: r.est_cost_usd, rating: r.rating, confidence: r.confidence, confirmations: r.confirmations, source: r.source,
      verified: new Date(r.verified || r.updated).toISOString().slice(0, 10) } : null;
    if (req.method === 'POST' && url === '/api/shopfacts/lookup') {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!db.device(auth)) return json(res, 401, { error: 'connect this device: run "printat connect"' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      const cands = (b.candidates || []).filter(c => c && c.key).slice(0, 40);
      const fresh = 30 * 864e5;
      const have = db.factsFor(cands.map(c => c.key));
      const facts = {};
      for (const c of cands) { const r = have[c.key]; if (r && r.method && Date.now() - (r.verified || 0) < fresh * (r.confirmations ? 3 : 1)) facts[c.key] = factView(r); }
      // Research up to 3 unknown independent shops inline (fast) and the rest in the background.
      const unknown = cands.filter(c => !facts[c.key] && !(have[c.key] && Date.now() - (have[c.key].updated || 0) < 7 * 864e5));
      if (shopResearch.enabled() && unknown.length) {
        const inline = unknown.slice(0, 3), later = unknown.slice(3, 10);
        const work = async c => { try { const f = await shopResearch.researchShop(c, m => console.log('research:', m)); if (f) { const row = db.upsertFact({ key: c.key, name: c.name, address: c.address, lat: c.lat, lon: c.lon, brand: c.brand, ...f }); return [c.key, factView(row)]; } else db.upsertFact({ key: c.key, name: c.name, address: c.address, lat: c.lat, lon: c.lon, brand: c.brand, submit: {}, source: 'cloud-jev', confidence: 0 }); } catch (e) { console.log('research failed:', c.name, e.message); } return null; };
        const done = await Promise.race([Promise.all(inline.map(work)), new Promise(r => setTimeout(() => r([]), 14000))]);
        for (const d of done || []) if (d) facts[d[0]] = d[1];
        if (later.length) setImmediate(() => later.reduce((p, c) => p.then(() => work(c)), Promise.resolve()));
      }
      return json(res, 200, { facts, known: Object.keys(facts).length, asked: cands.length });
    }
    if (req.method === 'POST' && url === '/api/shopfacts') {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!db.device(auth)) return json(res, 401, { error: 'connect this device' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      let n = 0;
      for (const f of (b.facts || []).slice(0, 40)) { if (f && f.key && f.submit && f.submit.method) { if (db.upsertFactProposal({ ...f, source: 'driver:' + (f.source || 'unknown'), confidence: 0.6 })) n++; } }
      return json(res, 200, { ok: true, stored: n });
    }
    if (req.method === 'POST' && url === '/api/shopfacts/outcome') {
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!db.device(auth)) return json(res, 401, { error: 'connect this device' });
      const b = JSON.parse((await body(req)).toString() || '{}');
      // Only a dispatch this device actually made through us counts as evidence.
      if (b.key && b.outcome) { const f = db.factsFor([String(b.key)])[String(b.key)]; if (f && f.email && db.dispatchProof(auth, f.email)) db.recordOutcome(String(b.key), String(b.outcome).slice(0, 20)); }
      return json(res, 200, { ok: true });
    }

    // Inbound mail from the Email Worker: job-<ref>@ (a driver's relayed order) or
    // order-<code>@ (a Print@ Network job). Relay to whichever side didn't write it.
    if (req.method === 'POST' && url === '/api/inbound') {
      if (!INBOUND_SECRET || req.headers['x-printat-inbound'] !== INBOUND_SECRET) return json(res, 401, { error: 'bad secret' });
      const m = JSON.parse((await body(req)).toString() || '{}');
      const local = String(m.to || '').split('@')[0].toLowerCase();
      const from = String(m.from || '').toLowerCase();
      const who = m.fromName ? `${m.fromName} <${m.from}>` : m.from;
      const text = (m.text || String(m.html || '').replace(/<[^>]+>/g, ' ')).trim();
      const kind = local.split('-')[0], ref = local.slice(kind.length + 1);
      let customer = '', shop = '', shopName = '';
      if (kind === 'job') { const d = db.dispatchByRef(ref); if (d) { customer = d.email; shop = d.to_email; shopName = d.shop_name || d.to_email; db.setDispatchStatus(d.ref, 'replied'); } }
      else if (kind === 'order') { const j = db.jobsByCode(ref)[0]; if (j) { const s = db.shopById(j.shop_id); customer = j.customer_email; shop = s ? s.email : ''; shopName = s ? s.name : ''; } }
      const fromCustomer = customer && from === customer.toLowerCase();
      const fromShop = shop && (from === shop.toLowerCase() || (from.split('@')[1] && from.split('@')[1] === shop.toLowerCase().split('@')[1]));
      const dest = fromCustomer ? shop : fromShop ? customer : ''; // anyone else: unmatched, goes to a human
      db.logReply({ kind, ref, from_email: m.from, to_email: m.to, forwarded_to: dest || FALLBACK_INBOX, subject: m.subject, text });
      if (!dest) {
        if (FALLBACK_INBOX) mail(FALLBACK_INBOX, `[Print@ unmatched] ${m.subject || '(no subject)'}`, `To: ${m.to}\nFrom: ${who}\n\n${text}`);
        return json(res, 200, { relayed: false });
      }
      const intro = fromCustomer ? `${who} (the customer) replied about print order ${ref.toUpperCase()}:` : `${shopName || who} replied about your print order ${ref.toUpperCase()}:`;
      const ok = await mail(dest, `Re: ${(m.subject || 'Print order ' + ref.toUpperCase()).replace(/^(re:\s*)+/i, '')}`, `${intro}\n\n${text}\n\n— Relayed by Print@. Reply to this email to answer.`, m.to);
      if (!ok) return json(res, 502, { relayed: false, error: 'relay send failed' }); // Worker then forwards to the fallback inbox
      return json(res, 200, { relayed: true, to: fromCustomer ? 'shop' : 'customer' });
    }

    // QR image for any URL: /qr?d=<url>
    if (req.method === 'GET' && url === '/qr') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
      return res.end(qr.svg(q.d || BASE, { dark: q.dark || '#1c3a57' }));
    }

    // GUEST JOIN — scan a QR, unlock a shop account instantly, then finish signup.
    if (req.method === 'GET' && url === '/join') {
      return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Become a Print@™ shop', `<!-- terms --><div class=muted style="margin:8px 0 0">By listing a shop you agree to the <a href="/terms">Terms of Use</a> and <a href="/privacy">Privacy Policy</a>.</div>
        <div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag>Guest signup</span></div>
        <h2>Turn your shop printer into profit</h2>
        <p class=muted>Customers and sales from a machine you already own. People nearby send print jobs, you print them from this page (no software, no kiosk), they come in to pick up. You keep the fee and the foot traffic.</p>
        <p class=muted>Join the <b>largest network of public printers in the world</b> — free, and set up in under a minute.</p>
        <form method=post action=/join class=card>
          <div class=lab>Your shop</div>
          <label>Shop name<input name=name required placeholder="e.g. Kinetic Coffee"></label>
          <label>Email<input name=email required inputmode=email placeholder="you@shop.com"></label>
          <label>Street address<input name=address required></label>
          <div class=row><div><label>City<input name=city></label></div><div><label>State<input name=state></label></div></div>
          <input type=hidden name=lat id=lat><input type=hidden name=lon id=lon>
          <label>Hours<input name=hours placeholder="Mon-Sat 8am-6pm"></label>
          <div class=row><div><label>B&W $/page<input name=price_bw placeholder="$0.15"></label></div><div><label>Color $/page<input name=price_color placeholder="$0.75"></label></div></div>
          ${AGREE_HTML}
          <button class=btn red>Create my shop</button>
          <p class=muted style=margin-top:8px id=geo>Getting your location…</p>
        </form>
        <script>navigator.geolocation && navigator.geolocation.getCurrentPosition(p=>{lat.value=p.coords.latitude.toFixed(5);lon.value=p.coords.longitude.toFixed(5);document.getElementById('geo').textContent='Location set ✓ (edit address above if needed)'},()=>document.getElementById('geo').textContent='Enter your address; we could not auto-locate.',{enableHighAccuracy:true,timeout:8000});</script>`));
    }
    if (req.method === 'POST' && url === '/join') {
      const f = await form(req);
      if (!f.agree) return res.writeHead(400, { 'Content-Type': 'text/html' }), res.end(page('Terms', `<div class=wrap><p>Please agree to the <a href="/terms">Terms of Use</a> to list a shop. <a href="javascript:history.back()">Go back</a></p></div>`));
      db.recordConsent(f.email, 'shop', legal.VERSION, clientIp(req));
      let shop = db.shopByEmail(f.email);
      if (shop) {
        // Existing shop: never hand out a session from a signup form. Email a login link instead.
        if (!limited('login:' + String(f.email).toLowerCase(), 5, 3600e3)) { const t = db.makeToken(f.email, 'login'); mail(f.email, 'Your Print@ login link', `Log in to your Print@ shop:\n${BASE}/shop/auth?token=${t}\n\nExpires in 30 minutes.`); }
        return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Check your email', `<div class=wrap><h1>PRINT<span class=at>@</span></h1><div class=card><div class=lab>That shop already exists</div><p>We emailed a login link to <b>${esc(f.email)}</b>.</p></div></div>`));
      }
      if (!shop) {
        const id = db.createShop({ name: f.name, email: f.email, address: f.address, city: f.city, state: f.state, lat: f.lat ? Number(f.lat) : null, lon: f.lon ? Number(f.lon) : null, hours: f.hours, price_bw: f.price_bw, price_color: f.price_color, color: 1, notes: '' });
        shop = db.shopById(id);
      }
      // Guest unlock: give an immediate session so they can explore + print, and email a verify link to go live to customers.
      const sTok = db.makeSession(shop.id);
      const vTok = db.makeToken(f.email, 'verify');
      mail(f.email, 'Verify your Print@ shop to go live', `Welcome, ${f.name}! Your shop is set up.\n\nVerify your email so customers can find you:\n${BASE}/shop/auth?token=${vTok}\n\nYou can already open your queue: ${BASE}/shop/dashboard`);
      res.writeHead(303, { 'Set-Cookie': `pn=${sTok}; HttpOnly; SameSite=Lax; Secure; Max-Age=${30 * 864e2}; Path=/`, Location: '/shop/dashboard' });
      return res.end();
    }

    // shop: landing (signup + login)
    if (req.method === 'GET' && url === '/shop') return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Print@™ for Shops', `
      <div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag><a href="/app">« For customers</a></span></div>
      <h2>Turn your printer into profit.</h2>
      <p class=muted>Your printer is already sitting there. Put it to work: people nearby send you jobs, you print them from this page (no software), and they walk in to pick up — new customers and a little revenue on every page. Set your own prices.</p>
      <p class=muted>You're joining the <b>largest network of public printers in the world</b> — Print@ already routes to chains, hotels, libraries and 5,000+ kiosks. Independent shops are the last gap on the map, and there's no one covering your block but you.</p>
      <div class=card><div class=lab>Log in</div><form method=post action=/shop/login><label>Shop email<input name=email required></label><button class=btn>Email me a login link</button></form></div>
      <div class=card><div class=lab>New shop — sign up</div><form method=post action=/shop/signup>
        <label>Shop name<input name=name required></label>
        <label>Email (we verify it)<input name=email required></label>
        <label>Street address<input name=address required></label>
        <div class=row><div><label>City<input name=city></label></div><div><label>State<input name=state></label></div></div>
        <div class=row><div><label>Latitude<input name=lat placeholder="auto"></label></div><div><label>Longitude<input name=lon placeholder="auto"></label></div></div>
        <label>Hours<input name=hours placeholder="Mon–Sat 7am–6pm"></label>
        <div class=row><div><label>B&W price/page<input name=price_bw placeholder="$0.15"></label></div><div><label>Color price/page<input name=price_color placeholder="$0.75"></label></div></div>
        <label>Notes for customers<input name=notes placeholder="Ask at the counter"></label>
        ${AGREE_HTML}<button class=btn red>Create shop &amp; verify email</button>
        <p class=muted style=margin-top:8px>Tip: leave lat/long blank and <a href="#" onclick="navigator.geolocation.getCurrentPosition(p=>{document.querySelector('[name=lat]').value=p.coords.latitude.toFixed(5);document.querySelector('[name=lon]').value=p.coords.longitude.toFixed(5)});return false">use my current location</a> while standing in the shop.</p>
      </form></div>`));

    if (req.method === 'POST' && url === '/shop/signup') {
      const f = await form(req);
      if (!f.agree) return res.writeHead(400, { 'Content-Type': 'text/html' }), res.end(page('Terms', `<div class=wrap><p>Please agree to the <a href="/terms">Terms of Use</a> to sign up. <a href="javascript:history.back()">Go back</a></p></div>`));
      db.recordConsent(f.email, 'shop', legal.VERSION, clientIp(req));
      if (db.shopByEmail(f.email)) return redirect(res, '/shop?err=exists');
      const id = db.createShop({ name: f.name, email: f.email, address: f.address, city: f.city, state: f.state, lat: f.lat ? Number(f.lat) : null, lon: f.lon ? Number(f.lon) : null, hours: f.hours, price_bw: f.price_bw, price_color: f.price_color, color: 1, notes: f.notes });
      const t = db.makeToken(f.email, 'verify');
      mail(f.email, 'Verify your Print@ shop', `Welcome to Print@ Network, ${f.name}!\n\nVerify your email and log in:\n${BASE}/shop/auth?token=${t}\n\nThis link expires in 30 minutes.`);
      return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Check your email', `<div class=wrap><h1>PRINT<span class=at>@</span></h1><div class=card><div class=lab>Almost there</div><p>We emailed a verification link to <b>${esc(f.email)}</b>. Click it to activate your shop and log in.</p></div></div>`));
    }
    if (req.method === 'POST' && url === '/shop/login') {
      const f = await form(req); const shop = db.shopByEmail(f.email);
      if (shop) { const t = db.makeToken(f.email, 'login'); mail(f.email, 'Your Print@ login link', `Log in to your Print@ shop:\n${BASE}/shop/auth?token=${t}\n\nExpires in 30 minutes.`); }
      return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Check your email', `<div class=wrap><h1>PRINT<span class=at>@</span></h1><div class=card><div class=lab>Login link sent</div><p>If <b>${esc(f.email)}</b> is a registered shop, a login link is on its way.</p></div></div>`));
    }
    if (req.method === 'GET' && url === '/shop/auth') {
      const row = db.useToken(q.token); if (!row) return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Link expired', `<div class=wrap><h1>PRINT<span class=at>@</span></h1><div class=card><p>That link expired or was already used. <a href=/shop>Request a new one</a>.</p></div></div>`));
      if (row.purpose !== 'login' && row.purpose !== 'verify') return redirect(res, '/shop');
      const shop = db.shopByEmail(row.email); if (!shop) return redirect(res, '/shop');
      if (row.purpose === 'verify') db.verifyShop(shop.id);
      const s = db.makeSession(shop.id);
      res.writeHead(303, { 'Set-Cookie': `pn=${s}; HttpOnly; SameSite=Lax; Secure; Max-Age=${30 * 864e2}; Path=/`, Location: '/shop/dashboard' }); return res.end();
    }

    // shop dashboard (auth required)
    const sess = db.session(cookies(req).pn);
    if (url.startsWith('/shop/dashboard') || url.startsWith('/shop/job') || url.startsWith('/shop/group') || url.startsWith('/shop/file') || url === '/shop/qr' || url === '/shop/sign' || url === '/shop/lookup' || url.startsWith('/shop/anyfile/') || url.startsWith('/shop/code/')) {
      if (!sess) return redirect(res, '/shop');
      const shop = db.shopById(sess.shop_id);
      if (url === '/shop/lookup') {
        const codeIn = (q.code || '').trim();
        let found = codeIn ? db.jobsByCode(codeIn) : [];
        const files = found.map(j => { const sh = db.shopById(j.shop_id); return `<div class=m style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
          <span>${esc(j.filename)} · ${j.copies} cop${j.copies===1?'y':'ies'} · ${j.color?'color':'B&W'} · <i>sent to ${esc(sh?sh.name:'?')}</i></span>
          <a class=btn href="/shop/anyfile/${j.id}?code=${esc(codeIn)}" target=_blank style="display:inline-block;width:auto;padding:5px 12px;margin:0;font-size:12px">Print</a></div>`; }).join('');
        return res.writeHead(200,{'Content-Type':'text/html'}), res.end(page('Look up a job', `
          <div class=head><h1>PRINT<span class=at>@</span></h1><a class=tag href=/shop/dashboard>« Queue</a></div>
          <h2>Pull up a job by code</h2>
          <p class=muted>A customer can pick up at <b>any</b> Print@ shop. Enter their 6-digit code to print it here.</p>
          <form method=get action=/shop/lookup class=card><label>Pickup code<input name=code value="${esc(codeIn)}" inputmode=numeric placeholder="123456" autofocus></label><button class=btn red>Find job</button></form>
          ${codeIn ? (found.length ? `<div class=card><div class=lab>Code ${esc(codeIn)} — ${found.length} file${found.length>1?'s':''}</div>${files}<form method=post action="/shop/code/${esc(codeIn)}/done" style=margin-top:10px><button class=btn style="padding:8px 16px;background:#2e7d4f;border-color:#2e7d4f;box-shadow:4px 4px 0 #1c4a2f">Mark picked up</button></form></div>` : '<div class=card><p class=muted>No job found for that code.</p></div>') : ''}`));
      }
      if (req.method === 'GET' && url.startsWith('/shop/anyfile/')) {
        const j = db.jobById(Number(url.split('/')[3]));
        // Cross-shop pickup by code: the code is the customer's authorization. No code, no file.
        if (!j || j.status === 'pending' || !q.code || String(q.code) !== String(j.pickup_code)) return res.writeHead(404).end();
        if (!j.filepath || !fs.existsSync(j.filepath)) return res.writeHead(410, { 'Content-Type': 'text/html' }), res.end(page('File removed', '<div class=wrap><p>This document was deleted from Print@ after the order was completed.</p></div>'));
        const buf = fs.readFileSync(j.filepath); res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${j.filename}"`}); return res.end(buf);
      }
      if (req.method === 'POST' && /\/shop\/code\/\w+\/done/.test(url)) {
        const pc = url.split('/')[3]; const g = db.jobsByCode(pc).filter(j => j.status !== 'pending' && j.status !== 'done');
        if (!g.length) return redirect(res, '/shop/lookup?code=' + encodeURIComponent(pc));
        for (const j of g) db.setJobStatus(j.id, 'done');
        purgeJobFiles(g);
        const first = g[0];
        if (first && first.customer_email) mail(first.customer_email, `Your Print@ job is printed`, `Your ${g.length} file${g.length>1?'s were':' was'} printed and picked up.\n\nRate the shop: ${BASE}/rate/${first.rate_token}`);
        return redirect(res, '/shop/lookup?code=' + encodeURIComponent(pc));
      }
      if (req.method === 'GET' && url === '/shop/qr') {
        const target = `${BASE}/app?shop=${shop.id}`;
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        return res.end(qr.svg(target, { dark: '#1c3a57' }));
      }
      if (req.method === 'GET' && url === '/shop/sign') {
        const target = `${BASE}/app?shop=${shop.id}`;
        const qrsvg = qr.svg(target, { dark: '#1c3a57' });
        return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(`<!doctype html><meta charset=utf-8><title>${esc(shop.name)} — Print@ sign</title>
        <style>@page{size:letter;margin:0}body{margin:0;font-family:"Bitter",Georgia,serif;color:#1c3a57}
        .sheet{width:8.5in;height:11in;padding:0.8in 0.7in;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;text-align:center;
          background:#efe4cc;background-image:radial-gradient(#1c3a57 1px,transparent 1.4px);background-size:9px 9px}
        .sheet:before{content:"";position:fixed;inset:0;background:#efe4cc;opacity:.9;z-index:-1}
        .brand{font-family:"Anton",sans-serif;font-size:64px;letter-spacing:2px}.brand .at{color:#c8432c}
        h1{font-family:"Anton";font-size:78px;line-height:.95;margin:18px 0 6px;text-transform:uppercase}
        .sub{font-family:"Oswald",sans-serif;text-transform:uppercase;letter-spacing:3px;font-size:22px;color:#274c6e}
        .qrbox{border:5px solid #1c3a57;padding:22px;margin:34px 0 18px;background:#f5ecd7;box-shadow:10px 10px 0 rgba(28,58,87,.18)}
        .qrbox svg{width:3in;height:3in;display:block}
        .steps{font-family:"Oswald";text-transform:uppercase;letter-spacing:1px;font-size:20px;color:#1c3a57;line-height:2}
        .name{font-family:"Anton";font-size:30px;margin-top:14px}.foot{font-family:"Oswald";text-transform:uppercase;letter-spacing:2px;font-size:14px;color:#274c6e;margin-top:auto}
        .print-btn{position:fixed;top:12px;right:12px;font-family:"Oswald";font-weight:700;padding:10px 18px;background:#c8432c;color:#fff;border:none;cursor:pointer}
        @media print{.print-btn{display:none}}</style>
        <link href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@600;700&family=Bitter:wght@400;600&display=swap" rel=stylesheet>
        <button class=print-btn onclick=print()>Print / Save PDF</button>
        <div class=sheet>
          <div class=brand>PRINT<span class=at>@</span></div>
          <h1>Print Here</h1>
          <div class=sub>Send a document from your phone. Pick it up here.</div>
          <div class=qrbox>${qrsvg}</div>
          <div class=steps>1 · Scan the code &nbsp;•&nbsp; 2 · Send your file &nbsp;•&nbsp; 3 · Show your pickup code</div>
          <div class=name>${esc(shop.name)}</div>
          <div class=foot>Powered by Print@ · printat.co</div>
        </div>`);
      }
      if (req.method === 'GET' && url === '/shop/dashboard') {
        const jobs = db.jobsForShop(shop.id); const r = db.shopRating(shop.id);
        const groups = {};
        for (const j of jobs) { (groups[j.pickup_code] = groups[j.pickup_code] || []).push(j); }
        const rows = Object.values(groups).map(g => { const first = g[0]; const anyOpen = g.some(x => x.status !== 'done');
          const files = g.map(j => `<div class=m style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <span>${esc(j.filename)} · ${j.copies} cop${j.copies === 1 ? 'y' : 'ies'} · ${j.color ? 'color' : 'B&W'}</span>
            ${j.status !== 'done' ? `<a class=btn href="/shop/file/${j.id}" target=_blank style="display:inline-block;width:auto;padding:5px 12px;margin:0;font-size:12px">Print</a>` : '<span class="pill done">printed</span>'}</div>`).join('');
          return `<div class=job><div class=head><b>${esc(first.customer_name || 'Customer')}</b> <span class="pill ${anyOpen ? 'queued' : 'done'}">${g.length} file${g.length > 1 ? 's' : ''} · code ${first.pickup_code}</span></div>
            ${files}
            ${anyOpen ? `<form method=post action="/shop/group/${first.pickup_code}/done" style="margin-top:10px"><button class=btn style="padding:8px 16px;background:#2e7d4f;border-color:#2e7d4f;box-shadow:4px 4px 0 #1c4a2f">Mark whole order picked up</button></form>` : ''}</div>`;
        }).join('') || '<p class=muted>No jobs yet. Share your shop so people can send you print jobs.</p>';
        return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page(shop.name + ' — Print@', `
          <div class=head><h1>PRINT<span class=at>@</span></h1><a class=tag href=/shop/logout>Log out</a></div>
          <h2>${esc(shop.name)}</h2>
          <p class=muted>${esc(shop.address)} · ${r.n ? (Math.round(r.avg * 10) / 10) + '★ (' + r.n + ')' : 'no ratings yet'} · <a href=/shop/dashboard>refresh</a></p>
          <div class=card><div class=lab>Pick up from any shop</div><p class=muted>Someone printed elsewhere but wants to collect here? Pull up their job by code.</p><a class=btn href=/shop/lookup style="display:inline-block;width:auto;padding:10px 18px">Look up a job by code</a></div>
          <div class=card><div class=lab>Your shop sign</div><p class=muted>Put a Print@ sign in your window so customers know they can print here.</p><a class=btn href=/shop/sign target=_blank style="display:inline-block;width:auto;padding:10px 18px">Get printable sign + QR</a></div>
          <div class=card><div class=lab>Print queue</div>${rows}</div>`));
      }
      if (req.method === 'GET' && url.startsWith('/shop/file/')) {
        const j = db.jobById(Number(url.split('/')[3])); if (!j || j.shop_id !== shop.id) return res.writeHead(404).end();
        if (!j.filepath || !fs.existsSync(j.filepath)) return res.writeHead(410, { 'Content-Type': 'text/html' }), res.end(page('File removed', '<div class=wrap><p>This document was deleted from Print@ after the order was completed.</p></div>'));
        const buf = fs.readFileSync(j.filepath); res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${j.filename}"` }); return res.end(buf);
      }
      if (req.method === 'POST' && /\/shop\/group\/\w+\/done/.test(url)) {
        const pc = url.split('/')[3];
        const g = db.jobsForShop(shop.id).filter(j => j.pickup_code === pc);
        for (const j of g) db.setJobStatus(j.id, 'done');
        purgeJobFiles(g);
        const first = g[0];
        if (first && first.customer_email) mail(first.customer_email, `Your print at ${shop.name} is ready`, `Your ${g.length} file${g.length > 1 ? 's are' : ' is'} printed and ready at ${shop.name}.\n\nHow was it? Rate the shop: ${BASE}/rate/${first.rate_token}`);
        return redirect(res, '/shop/dashboard');
      }
      if (req.method === 'POST' && /\/shop\/job\/\d+\/done/.test(url)) {
        const j = db.jobById(Number(url.split('/')[3])); if (j && j.shop_id === shop.id) {
          db.setJobStatus(j.id, 'done'); purgeJobFiles([j]);
          if (j.customer_email) mail(j.customer_email, `Your print at ${shop.name} is ready`, `Your job is printed and picked up at ${shop.name}.\n\nHow was it? Rate the shop: ${BASE}/rate/${j.rate_token}`);
        }
        return redirect(res, '/shop/dashboard');
      }
    }
    if (url === '/shop/logout') { res.writeHead(303, { 'Set-Cookie': 'pn=; Max-Age=0; Path=/', Location: '/shop' }); return res.end(); }

    // rating
    if (url.startsWith('/rate/')) {
      const tok = url.split('/')[2]; const j = db.jobByRateToken(tok);
      if (!j) return res.writeHead(404, { 'Content-Type': 'text/html' }), res.end(page('Not found', '<div class=wrap><p>Rating link not found.</p></div>'));
      const shop = db.shopById(j.shop_id);
      if (req.method === 'POST') { const f = await form(req); db.addRating(shop.id, j.id, Math.max(1, Math.min(5, Number(f.stars) || 5)), f.comment); return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Thanks!', `<div class=wrap><h1>PRINT<span class=at>@</span></h1><div class=card><p>Thanks for rating <b>${esc(shop.name)}</b>!</p></div></div>`)); }
      return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Rate ' + shop.name, `<div class=wrap><h1>PRINT<span class=at>@</span></h1>
        <h2>Rate ${esc(shop.name)}</h2><form method=post class=card>
        <label>Stars<select name=stars><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label>
        <label>Comment (optional)<textarea name=comment rows=3></textarea></label><button class=btn red>Submit rating</button></form></div>`));
    }
    res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(page('Not found', '<div class=wrap><p>Not found. <a href=/>Home</a></p></div>'));
  } catch (e) { json(res, 500, { error: e.message }); }
});
server.listen(PORT, () => console.log(`Print@ Network on :${PORT}`));
// Rendered pages for tests (test/regress/page-scripts-parse.js checks every inline script parses).
module.exports = { pages: () => ({ landing: LANDING, customer: customerPage(null), help: helpPage(), terms: page('Terms', legal.TERMS), privacy: page('Privacy', legal.PRIVACY), guides: guidesIndex(), guide: guidePage(guides.GUIDES[0]), chatjs: '<script>' + CHAT_JS + '</script>' }) };
