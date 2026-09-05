'use strict';
// Print@ Network — our own release-code print network. Shops sign up (email-verified),
// log in by magic link, and print jobs from their browser. Customers send a job to a
// nearby shop and get a pickup code; they can rate the shop afterward.
const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const mail = require('./mail');

const PORT = process.env.PORT || 4260;
const BASE = process.env.PRINTAT_NET_BASE || `http://localhost:${PORT}`;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const body = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
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
</style><link href="https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@600;700&family=Bitter:wght@400;600&display=swap" rel="stylesheet">`;
const page = (title, inner) => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title>${CSS}<div class=wrap>${inner}</div>`;

function customerPage() {
  return page('Print@ Network', `<div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag><a href="/shop">For shops »</a></span></div>
  <p class=tag>Send a file to a nearby shop. Pick it up with a code.</p>
  <div class=card><div class=lab>1 · Document</div>
    <label>PDF or photo<input type=file id=file accept="application/pdf,image/*"></label>
    <div class=row><div><label>Color<select id=color><option value=bw>B&amp;W</option><option value=color>Color</option></select></div>
    <div><label>Copies<input id=copies value=1 inputmode=numeric></div></div>
    <label>Your name<input id=cname placeholder="For the pickup"></label>
    <label>Your email<input id=cemail inputmode=email placeholder="you@example.com"></label>
    <button class=btn id=find>Find shops near me</button><div class=muted id=note style=margin-top:8px></div></div>
  <div class=card id=shops style=display:none><div class=lab>2 · Pick a shop</div><div id=list></div></div>
  <div class=card id=send style=display:none><div class=lab>3 · Send</div><div id=pick></div><button class=btn red id=go>Send to shop</button><div id=result></div></div>
  <script>
  var f={},pick=null;
  file.onchange=e=>{var x=e.target.files[0];if(!x)return;f.name=x.name;var r=new FileReader();r.onload=()=>f.b64=r.result.split(',')[1];r.readAsDataURL(x)};
  find.onclick=()=>{if(!f.b64)return alert('Choose a file');note.textContent='Locating…';
    navigator.geolocation.getCurrentPosition(p=>{f.lat=p.coords.latitude;f.lon=p.coords.longitude;
      fetch('/api/shops-nearby',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({lat:f.lat,lon:f.lon})}).then(r=>r.json()).then(d=>{
        if(!d.shops.length){note.textContent='No Print@ Network shops near you yet.';return}
        note.textContent=d.shops.length+' shops';list.innerHTML=d.shops.map(s=>'<div class=job data-id='+s.id+' style=cursor:pointer><b>'+s.name+'</b> '+(s.stars?'<span class=stars>'+'\\u2605'.repeat(Math.round(s.stars))+'</span>':'')+'<div class=m>'+s.distance_mi+' mi · '+s.address+'</div><div class=m>'+(s.hours||'')+' · B&W '+(s.price_bw||'?')+' color '+(s.price_color||'?')+'</div></div>').join('');
        shops.style.display='block';
        document.querySelectorAll('#list .job').forEach(el=>el.onclick=()=>{pick=d.shops.find(s=>s.id==el.dataset.id);document.querySelectorAll('#list .job').forEach(x=>x.style.background='#fff');el.style.background='#d09a3c';document.getElementById('pick').innerHTML='<b>'+pick.name+'</b><br>'+pick.address;send.style.display='block';send.scrollIntoView({behavior:'smooth'})});
      })},()=>note.textContent='Allow location and retry',{enableHighAccuracy:true,timeout:12000})};
  go.onclick=()=>{if(!pick)return;result.innerHTML='Sending…';
    fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({shop_id:pick.id,name:cname.value,email:cemail.value,color:color.value,copies:copies.value,filename:f.name,fileB64:f.b64})}).then(r=>r.json()).then(d=>{
      if(d.pickup_code)result.innerHTML='<div class=job style=background:#e8f5ec><b>Sent to '+pick.name+'!</b><br>Show this pickup code at the counter:<br><span style="font-family:Anton;font-size:34px;letter-spacing:3px">'+d.pickup_code+'</span></div>';
      else result.innerHTML='Error: '+(d.error||'failed')})};
  </script>`);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const q = Object.fromEntries(new URL(req.url, BASE).searchParams);
  try {
    if (req.method === 'GET' && url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(customerPage()); }
    if (req.method === 'GET' && url === '/health') return json(res, 200, { ok: true });

    // customer: shops nearby
    if (req.method === 'POST' && url === '/api/shops-nearby') {
      const { lat, lon } = JSON.parse((await body(req)).toString() || '{}');
      const shops = db.activeShops().filter(s => s.lat != null).map(s => { const r = db.shopRating(s.id); return {
        id: s.id, name: s.name, address: s.address, hours: s.hours, price_bw: s.price_bw, price_color: s.price_color,
        distance_mi: Math.round(miles({ lat, lon }, s) * 10) / 10, stars: r.avg ? Math.round(r.avg * 10) / 10 : 0 };
      }).filter(s => s.distance_mi <= 25).sort((a, b) => a.distance_mi - b.distance_mi);
      return json(res, 200, { shops });
    }
    // customer: send a job
    if (req.method === 'POST' && url === '/api/send') {
      const b = JSON.parse((await body(req)).toString() || '{}');
      const shop = db.shopById(Number(b.shop_id)); if (!shop) return json(res, 404, { error: 'shop not found' });
      const fp = path.join(db.DIR, 'files', db.rid(10) + '-' + String(b.filename || 'doc.pdf').replace(/[^\w.]+/g, '_'));
      fs.writeFileSync(fp, Buffer.from(b.fileB64, 'base64'));
      const job = db.createJob({ shop_id: shop.id, customer_name: b.name, customer_email: b.email, filename: b.filename, filepath: fp, copies: Number(b.copies) || 1, color: b.color === 'color' });
      mail(shop.email, `New print job — pickup ${job.pickup_code}`, `${b.name || 'A customer'} sent a print job to ${shop.name}.\n\nOpen your queue to print it: ${BASE}/shop/dashboard\n\nPickup code: ${job.pickup_code}`);
      return json(res, 200, { pickup_code: job.pickup_code });
    }

    // shop: landing (signup + login)
    if (req.method === 'GET' && url === '/shop') return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page('Print@ for Shops', `
      <div class=head><h1>PRINT<span class=at>@</span></h1><span class=tag><a href="/">« For customers</a></span></div>
      <h2>Offer printing. Get foot traffic.</h2>
      <p class=muted>List your shop, and people nearby send you print jobs. You print them from this page on any device — no software, just your browser and your printer. Take a small fee at the counter.</p>
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
        <button class=btn red>Create shop &amp; verify email</button>
        <p class=muted style=margin-top:8px>Tip: leave lat/long blank and <a href="#" onclick="navigator.geolocation.getCurrentPosition(p=>{document.querySelector('[name=lat]').value=p.coords.latitude.toFixed(5);document.querySelector('[name=lon]').value=p.coords.longitude.toFixed(5)});return false">use my current location</a> while standing in the shop.</p>
      </form></div>`));

    if (req.method === 'POST' && url === '/shop/signup') {
      const f = await form(req);
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
      const shop = db.shopByEmail(row.email); if (!shop) return redirect(res, '/shop');
      if (row.purpose === 'verify') db.verifyShop(shop.id);
      const s = db.makeSession(shop.id);
      res.writeHead(303, { 'Set-Cookie': `pn=${s}; HttpOnly; SameSite=Lax; Max-Age=${30 * 864e2}; Path=/`, Location: '/shop/dashboard' }); return res.end();
    }

    // shop dashboard (auth required)
    const sess = db.session(cookies(req).pn);
    if (url.startsWith('/shop/dashboard') || url.startsWith('/shop/job') || url.startsWith('/shop/file')) {
      if (!sess) return redirect(res, '/shop');
      const shop = db.shopById(sess.shop_id);
      if (req.method === 'GET' && url === '/shop/dashboard') {
        const jobs = db.jobsForShop(shop.id); const r = db.shopRating(shop.id);
        const rows = jobs.map(j => `<div class=job><div class=head><b>${esc(j.customer_name || 'Customer')}</b> <span class="pill ${j.status}">${j.status}</span></div>
          <div class=m>${esc(j.filename)} · ${j.copies} cop${j.copies === 1 ? 'y' : 'ies'} · ${j.color ? 'color' : 'B&W'} · code ${j.pickup_code}</div>
          <div style=margin-top:8px>${j.status === 'queued' ? `<a class=btn href="/shop/file/${j.id}" target=_blank style="display:inline-block;width:auto;padding:8px 16px">Open &amp; print</a> ` : ''}
          ${j.status !== 'done' ? `<form method=post action="/shop/job/${j.id}/done" style="display:inline"><button class=btn style="display:inline-block;width:auto;padding:8px 16px;background:#2e7d4f;border-color:#2e7d4f;box-shadow:4px 4px 0 #1c4a2f">Mark picked up</button></form>` : ''}</div></div>`).join('') || '<p class=muted>No jobs yet. Share your shop so people can send you print jobs.</p>';
        return res.writeHead(200, { 'Content-Type': 'text/html' }), res.end(page(shop.name + ' — Print@', `
          <div class=head><h1>PRINT<span class=at>@</span></h1><a class=tag href=/shop/logout>Log out</a></div>
          <h2>${esc(shop.name)}</h2>
          <p class=muted>${esc(shop.address)} · ${r.n ? (Math.round(r.avg * 10) / 10) + '★ (' + r.n + ')' : 'no ratings yet'} · <a href=/shop/dashboard>refresh</a></p>
          <div class=card><div class=lab>Print queue</div>${rows}</div>`));
      }
      if (req.method === 'GET' && url.startsWith('/shop/file/')) {
        const j = db.jobById(Number(url.split('/')[3])); if (!j || j.shop_id !== shop.id) return res.writeHead(404).end();
        const buf = fs.readFileSync(j.filepath); res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${j.filename}"` }); return res.end(buf);
      }
      if (req.method === 'POST' && /\/shop\/job\/\d+\/done/.test(url)) {
        const j = db.jobById(Number(url.split('/')[3])); if (j && j.shop_id === shop.id) {
          db.setJobStatus(j.id, 'done');
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
