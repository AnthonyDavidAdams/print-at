'use strict';
// Print@ Network — storage for our own release-code print network (shops + jobs + ratings).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DIR = process.env.PRINTAT_NET_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'PrintAtNetwork');
fs.mkdirSync(path.join(DIR, 'files'), { recursive: true });
const db = new DatabaseSync(path.join(DIR, 'network.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS shops(
    id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, address TEXT, city TEXT, state TEXT,
    lat REAL, lon REAL, hours TEXT, price_bw TEXT, price_color TEXT, color INTEGER DEFAULT 1,
    notes TEXT, verified INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created INTEGER);
  CREATE TABLE IF NOT EXISTS tokens(token TEXT PRIMARY KEY, email TEXT, purpose TEXT, expires INTEGER, used INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, shop_id INTEGER, expires INTEGER);
  CREATE TABLE IF NOT EXISTS jobs(
    id INTEGER PRIMARY KEY, shop_id INTEGER, customer_name TEXT, customer_email TEXT,
    filename TEXT, filepath TEXT, pages INTEGER, copies INTEGER, color INTEGER,
    pickup_code TEXT, group_id TEXT, status TEXT DEFAULT 'queued', rate_token TEXT, created INTEGER, printed INTEGER);
  CREATE TABLE IF NOT EXISTS ratings(id INTEGER PRIMARY KEY, shop_id INTEGER, job_id INTEGER, stars INTEGER, comment TEXT, created INTEGER);
  -- Driver devices: a Mac running the open-source driver, linked by magic link. Lets the
  -- driver dispatch through the cloud (branded sender) without local email setup.
  CREATE TABLE IF NOT EXISTS devices(token TEXT PRIMARY KEY, email TEXT, name TEXT, device TEXT, created INTEGER, last_used INTEGER);
  CREATE TABLE IF NOT EXISTS device_polls(poll TEXT PRIMARY KEY, email TEXT, name TEXT, device TEXT, magic TEXT, device_token TEXT, expires INTEGER);
  -- Directory dispatches: jobs the driver relayed by email to a chain/library/PrinterOn/PrintMe
  -- shop (not a Print@ Network shop). Logged so we can relay replies/codes back later.
  CREATE TABLE IF NOT EXISTS shop_facts(key TEXT PRIMARY KEY, name TEXT, address TEXT, lat REAL, lon REAL, brand TEXT,
    method TEXT, email TEXT, url TEXT, phone TEXT, instructions TEXT, hours_today TEXT, cost_basis TEXT, est_cost_usd REAL, rating REAL,
    source TEXT, confidence REAL DEFAULT 0.5, confirmations INTEGER DEFAULT 0, last_outcome TEXT, verified INTEGER, updated INTEGER);
  CREATE TABLE IF NOT EXISTS consents(id INTEGER PRIMARY KEY, subject TEXT, surface TEXT, version TEXT, ip TEXT, created INTEGER);
  CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY, email TEXT, source TEXT, description TEXT, diagnostics TEXT, screenshot TEXT,
    category TEXT, faq_id TEXT, faq_confidence REAL, status TEXT DEFAULT 'open', created INTEGER);
  CREATE TABLE IF NOT EXISTS replies(id INTEGER PRIMARY KEY, kind TEXT, ref TEXT, from_email TEXT, to_email TEXT, forwarded_to TEXT, subject TEXT, text TEXT, created INTEGER);
  CREATE TABLE IF NOT EXISTS dispatches(id INTEGER PRIMARY KEY, device_token TEXT, email TEXT, shop_name TEXT, shop_address TEXT,
    to_email TEXT, subject TEXT, filename TEXT, ref TEXT, status TEXT DEFAULT 'sent', created INTEGER);
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS installs(id INTEGER PRIMARY KEY, install_id TEXT, kind TEXT, version TEXT, macos TEXT, arch TEXT, node TEXT, ip TEXT, created INTEGER);
  CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, kind TEXT, detail TEXT, created INTEGER);
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
`);
try { db.exec('ALTER TABLE jobs ADD COLUMN group_id TEXT'); } catch {}
try { db.exec('ALTER TABLE tickets ADD COLUMN dev_notes TEXT'); } catch {}
try { db.exec('ALTER TABLE jobs ADD COLUMN dest TEXT'); } catch {}
try { db.exec('ALTER TABLE dispatches ADD COLUMN nudged INTEGER'); } catch {}
try { db.exec('ALTER TABLE dispatches ADD COLUMN customer_told INTEGER'); } catch {}
try { db.exec('ALTER TABLE dispatches ADD COLUMN customer_name TEXT'); } catch {} // JSON of a public-printer destination (web portal), when the job is not for a Network shop
const now = () => Date.now();
const rid = (n = 16) => require('crypto').randomBytes(n).toString('hex');
const code = () => { for (let i = 0; i < 50; i++) { const c = String(require('crypto').randomInt(100000, 1000000)); if (!db.prepare("SELECT 1 FROM jobs WHERE pickup_code=? AND status!='done' LIMIT 1").get(c)) return c; } return String(require('crypto').randomInt(100000, 1000000)); };

module.exports = {
  DIR, now, rid, code,
  // shops
  createShop(s) {
    const r = db.prepare(`INSERT INTO shops(name,email,address,city,state,lat,lon,hours,price_bw,price_color,color,notes,verified,created)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?)`).run(s.name, s.email.toLowerCase(), s.address, s.city, s.state, s.lat, s.lon, s.hours, s.price_bw, s.price_color, s.color ? 1 : 0, s.notes || '', now());
    return r.lastInsertRowid;
  },
  shopByEmail: e => db.prepare('SELECT * FROM shops WHERE email=?').get((e || '').toLowerCase()),
  shopById: id => db.prepare('SELECT * FROM shops WHERE id=?').get(id),
  verifyShop: id => db.prepare('UPDATE shops SET verified=1 WHERE id=?').run(id),
  updateShop(id, s) { db.prepare(`UPDATE shops SET name=?,address=?,city=?,state=?,lat=?,lon=?,hours=?,price_bw=?,price_color=?,color=?,notes=? WHERE id=?`)
    .run(s.name, s.address, s.city, s.state, s.lat, s.lon, s.hours, s.price_bw, s.price_color, s.color ? 1 : 0, s.notes || '', id); },
  activeShops: () => db.prepare('SELECT * FROM shops WHERE verified=1 AND active=1').all(),
  // tokens (magic link + verify)
  makeToken(email, purpose, ttlMin = 30) { const t = rid(20); db.prepare('INSERT INTO tokens(token,email,purpose,expires) VALUES(?,?,?,?)').run(t, (email || '').toLowerCase(), purpose, now() + ttlMin * 60000); return t; },
  useToken(t) { const row = db.prepare('SELECT * FROM tokens WHERE token=?').get(t); if (!row || row.used || row.expires < now()) return null; db.prepare('UPDATE tokens SET used=1 WHERE token=?').run(t); return row; },
  // sessions
  makeSession(shop_id, days = 30) { const t = rid(24); db.prepare('INSERT INTO sessions(token,shop_id,expires) VALUES(?,?,?)').run(t, shop_id, now() + days * 864e5); return t; },
  session(t) { const row = db.prepare('SELECT * FROM sessions WHERE token=?').get(t || ''); if (!row || row.expires < now()) return null; return row; },
  // jobs
  createJob(j) { return this.createJobGroup(j, [{ filename: j.filename, filepath: j.filepath, copies: j.copies, color: j.color }]); },
  createJobGroup(base, items) {
    const pc = code(), rt = rid(12), gid = rid(8); let firstId = null;
    for (const it of items) {
      const r = db.prepare(`INSERT INTO jobs(shop_id,customer_name,customer_email,filename,filepath,pages,copies,color,pickup_code,group_id,rate_token,status,created,dest)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(base.shop_id ?? null, base.customer_name || '', base.customer_email || '', it.filename || 'document.pdf', it.filepath, it.pages || 0, it.copies || 1, it.color ? 1 : 0, pc, gid, rt, base.status || 'queued', now(), base.dest || null);
      if (firstId == null) firstId = r.lastInsertRowid;
    }
    return { id: firstId, pickup_code: pc, rate_token: rt, group_id: gid };
  },
  // 'pending' = customer hasn't confirmed their email yet; shops never see those.
  jobsForShop: id => db.prepare("SELECT * FROM jobs WHERE shop_id=? AND status!='pending' ORDER BY created DESC LIMIT 100").all(id),
  jobsByGroup: gid => db.prepare('SELECT * FROM jobs WHERE group_id=? ORDER BY id').all(gid || ''),
  releaseGroup(gid) { db.prepare("UPDATE jobs SET status='queued' WHERE group_id=? AND status='pending'").run(gid); return this.jobsByGroup(gid); },
  jobById: id => db.prepare('SELECT * FROM jobs WHERE id=?').get(id),
  jobByRateToken: t => db.prepare('SELECT * FROM jobs WHERE rate_token=?').get(t || ''),
  jobsByCode: c => db.prepare("SELECT * FROM jobs WHERE pickup_code=? AND status!='pending' ORDER BY id").all(String(c || '').trim()),
  setJobStatus(id, status) { db.prepare('UPDATE jobs SET status=?, printed=? WHERE id=?').run(status, status === 'printed' || status === 'done' ? now() : null, id); },
  // ratings
  addRating(shop_id, job_id, stars, comment) { db.prepare('INSERT INTO ratings(shop_id,job_id,stars,comment,created) VALUES(?,?,?,?,?)').run(shop_id, job_id, stars, comment || '', now()); },
  shopRating: id => db.prepare('SELECT COUNT(*) n, AVG(stars) avg FROM ratings WHERE shop_id=?').get(id),
  shopReviews: id => db.prepare('SELECT stars,comment,created FROM ratings WHERE shop_id=? AND comment<>"" ORDER BY created DESC LIMIT 10').all(id),
  // driver devices (magic-link device authorization)
  makeDevicePoll(email, name, device, ttlMin = 15) {
    const poll = rid(16), magic = rid(20);
    db.prepare('INSERT INTO device_polls(poll,email,name,device,magic,device_token,expires) VALUES(?,?,?,?,?,NULL,?)')
      .run(poll, (email || '').toLowerCase(), name || '', device || '', magic, now() + ttlMin * 60000);
    return { poll, magic };
  },
  pollByMagic: m => db.prepare('SELECT * FROM device_polls WHERE magic=?').get(m || ''),
  pollById: p => db.prepare('SELECT * FROM device_polls WHERE poll=?').get(p || ''),
  pollByMagic: m => { const r = db.prepare('SELECT * FROM device_polls WHERE magic=?').get(m || ''); return r && !r.device_token && r.expires > now() ? r : null; },
  consumePoll(poll) { db.prepare('DELETE FROM device_polls WHERE poll=?').run(poll || ''); },
  deleteDevice(token) { db.prepare('DELETE FROM devices WHERE token=?').run(token || ''); },
  dispatchProof: (device_token, to_email) => !!db.prepare("SELECT 1 FROM dispatches WHERE device_token=? AND lower(to_email)=lower(?) AND status IN ('sent','replied') AND created > ? LIMIT 1").get(device_token || '', to_email || '', now() - 7 * 864e5),
  // A driver's report is a proposal: it fills gaps and refreshes matching facts, but never
  // silently redirects a destination that has been confirmed by real orders.
  upsertFactProposal(f) {
    const cur = db.prepare('SELECT * FROM shop_facts WHERE key=?').get(f.key);
    const sub = f.submit || {};
    if (cur && cur.method && cur.confirmations > 0) {
      const sameDest = (cur.method === sub.method) && ((cur.email || '') === (sub.email || '')) && ((cur.url || '') === (sub.url || ''));
      if (!sameDest) return false; // keep the confirmed destination; a change needs new evidence
    }
    if (cur && cur.method && cur.method !== 'phone' && cur.method !== 'in_person' && (sub.method === 'phone' || sub.method === 'in_person')) return false; // never downgrade a working destination to "call them"
    this.upsertFact({ ...f, confirmations: cur ? cur.confirmations : 0 });
    return true;
  },
  confirmDevicePoll(magic) {
    const row = db.prepare('SELECT * FROM device_polls WHERE magic=?').get(magic || '');
    if (!row || row.expires < now() || row.device_token) return row && row.device_token ? row : null;
    const tok = rid(24);
    db.prepare('INSERT INTO devices(token,email,name,device,created,last_used) VALUES(?,?,?,?,?,?)').run(tok, row.email, row.name, row.device, now(), now());
    db.prepare('UPDATE device_polls SET device_token=? WHERE poll=?').run(tok, row.poll);
    return { ...row, device_token: tok };
  },
  device: t => { const r = db.prepare('SELECT * FROM devices WHERE token=?').get(t || ''); if (r) db.prepare('UPDATE devices SET last_used=? WHERE token=?').run(now(), t); return r; },
  // directory dispatches (driver relayed a job by email through the cloud)
  // retention: purge user files as soon as they are no longer needed
  filesToPurge(now_) { return db.prepare("SELECT id, filepath, status, created FROM jobs WHERE filepath!='' AND (status='done' OR (status='pending' AND created < ?) OR created < ?)").all(now_ - 2 * 3600e3, now_ - 7 * 864e5); },
  setJobPages(id, pages) { db.prepare('UPDATE jobs SET pages=? WHERE id=?').run(pages, id); },
  clearJobFile(id) { db.prepare("UPDATE jobs SET filepath='' WHERE id=?").run(id); },
  oldTickets(now_) { return db.prepare("SELECT id, screenshot FROM tickets WHERE screenshot!='' AND created < ?").all(now_ - 30 * 864e5); },
  clearTicketShot(id) { db.prepare("UPDATE tickets SET screenshot='' WHERE id=?").run(id); },
  // shop facts (pooled knowledge)
  factsNear(lat, lon, radiusMi) { const dl = radiusMi / 69, dn = radiusMi / (69 * Math.max(0.2, Math.cos(lat * Math.PI / 180))); return db.prepare('SELECT * FROM shop_facts WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND method IS NOT NULL AND method<>?').all(lat - dl, lat + dl, lon - dn, lon + dn, ''); },
  factsWithEmailLike(pattern) { return db.prepare('SELECT email, lat, lon FROM shop_facts WHERE email LIKE ?').all(pattern); },
  factsFor(keys) { if (!keys.length) return {}; const rows = db.prepare(`SELECT * FROM shop_facts WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys); return Object.fromEntries(rows.map(r => [r.key, r])); },
  upsertFact(f) {
    const cur = db.prepare('SELECT * FROM shop_facts WHERE key=?').get(f.key);
    const sub = f.submit || {};
    // A driver-confirmed fact beats an unconfirmed cloud guess; otherwise newest wins.
    if (cur && cur.confirmations > 0 && (f.source === 'cloud-jev') && cur.method) return cur;
    db.prepare(`INSERT INTO shop_facts(key,name,address,lat,lon,brand,method,email,url,phone,instructions,hours_today,cost_basis,est_cost_usd,rating,source,confidence,confirmations,last_outcome,verified,updated)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET name=excluded.name, address=COALESCE(NULLIF(excluded.address,''),shop_facts.address), lat=excluded.lat, lon=excluded.lon, brand=COALESCE(NULLIF(excluded.brand,''),shop_facts.brand),
        method=excluded.method, email=excluded.email, url=excluded.url, phone=COALESCE(NULLIF(excluded.phone,''),shop_facts.phone), instructions=excluded.instructions,
        hours_today=COALESCE(NULLIF(excluded.hours_today,''),shop_facts.hours_today), cost_basis=COALESCE(NULLIF(excluded.cost_basis,''),shop_facts.cost_basis), est_cost_usd=COALESCE(excluded.est_cost_usd,shop_facts.est_cost_usd), rating=COALESCE(excluded.rating,shop_facts.rating),
        source=excluded.source, confidence=excluded.confidence, verified=excluded.verified, updated=excluded.updated`)
      .run(f.key, f.name || '', f.address || '', f.lat ?? null, f.lon ?? null, f.brand || '', sub.method || '', sub.email || '', sub.url || '', sub.phone || f.phone || '', sub.instructions || '', f.hours_today || '', f.cost_basis || '', f.est_cost_usd ?? null, f.rating ?? null, f.source || 'driver', f.confidence ?? 0.7, f.confirmations || 0, null, now(), now());
    return db.prepare('SELECT * FROM shop_facts WHERE key=?').get(f.key);
  },
  recordOutcome(key, outcome) { db.prepare("UPDATE shop_facts SET confirmations=confirmations+?, last_outcome=?, confidence=MIN(0.99, confidence+?), updated=? WHERE key=?").run(outcome === 'sent' || outcome === 'picked_up' ? 1 : 0, outcome, outcome === 'picked_up' ? 0.1 : outcome === 'sent' ? 0.05 : outcome === 'bounced' || outcome === 'failed' ? -0.3 : 0, now(), key); },
  recordConsent(subject, surface, version, ip) { db.prepare('INSERT INTO consents(subject,surface,version,ip,created) VALUES(?,?,?,?,?)').run(String(subject || '').toLowerCase(), surface, version, ip || '', now()); },
  // installs, events (downloads etc.), meta, and the weekly numbers
  recordInstall(i) { db.prepare('INSERT INTO installs(install_id,kind,version,macos,arch,node,ip,created) VALUES(?,?,?,?,?,?,?,?)').run(i.install_id || '', i.kind || 'new', i.version || '', i.macos || '', i.arch || '', i.node || '', i.ip || '', now()); return db.prepare('SELECT COUNT(DISTINCT install_id) AS n FROM installs').get().n; },
  event(kind, detail = '') { db.prepare('INSERT INTO events(kind,detail,created) VALUES(?,?,?)').run(kind, String(detail).slice(0, 200), now()); },
  getMeta(k) { const r = db.prepare('SELECT value FROM meta WHERE key=?').get(k); return r ? r.value : null; },
  setMeta(k, v) { db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v)); },
  stats(since) {
    const one = (sql, ...a) => db.prepare(sql).get(...a); const all = (sql, ...a) => db.prepare(sql).all(...a);
    return {
      installsNew: one("SELECT COUNT(*) AS n FROM installs WHERE kind='new' AND created>=?", since).n,
      installsUpdate: one("SELECT COUNT(*) AS n FROM installs WHERE kind<>'new' AND created>=?", since).n,
      installsTotal: one('SELECT COUNT(DISTINCT install_id) AS n FROM installs').n,
      downloads: one("SELECT COUNT(*) AS n FROM events WHERE kind='download' AND created>=?", since).n,
      connects: one('SELECT COUNT(*) AS n FROM devices WHERE created>=?', since).n,
      devicesTotal: one('SELECT COUNT(*) AS n FROM devices').n,
      dispatches: one("SELECT COUNT(*) AS n FROM dispatches WHERE created>=? AND status='sent'", since).n,
      dispatchShops: all("SELECT shop_name AS name, COUNT(*) AS n FROM dispatches WHERE created>=? AND status='sent' GROUP BY shop_name ORDER BY n DESC LIMIT 15", since),
      dispatchUsers: one("SELECT COUNT(DISTINCT email) AS n FROM dispatches WHERE created>=? AND status='sent'", since).n,
      portalJobs: one("SELECT COUNT(*) AS n FROM jobs WHERE created>=? AND status<>'pending'", since).n,
      portalShops: all("SELECT s.name, COUNT(*) AS n FROM jobs j JOIN shops s ON s.id=j.shop_id WHERE j.created>=? AND j.status<>'pending' GROUP BY s.name ORDER BY n DESC LIMIT 15", since),
      newShops: all('SELECT name, city, state FROM shops WHERE created>=? ORDER BY id DESC LIMIT 20', since),
      shopsTotal: one('SELECT COUNT(*) AS n FROM shops').n,
      tickets: all('SELECT status, COUNT(*) AS n FROM tickets WHERE created>=? GROUP BY status', since),
      ticketsOpen: one("SELECT COUNT(*) AS n FROM tickets WHERE status IN ('open','needs-human')").n,
      facts: one('SELECT COUNT(*) AS n FROM shop_facts').n,
    };
  },
  // support tickets
  createTicket(t) { const r = db.prepare('INSERT INTO tickets(email,source,description,diagnostics,screenshot,category,faq_id,faq_confidence,status,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run(t.email || '', t.source || 'web', t.description || '', t.diagnostics || '', t.screenshot || '', t.category || '', t.faq_id || '', t.faq_confidence ?? null, t.status || 'open', now()); return r.lastInsertRowid; },
  ticket: id => db.prepare('SELECT * FROM tickets WHERE id=?').get(id),
  tickets: () => db.prepare('SELECT id,email,source,category,faq_id,faq_confidence,status,created,substr(description,1,140) AS description FROM tickets ORDER BY id DESC LIMIT 200').all(),
  setTicketStatus(id, status) { db.prepare('UPDATE tickets SET status=? WHERE id=?').run(status, id); },
  ticketsByStatus: status => db.prepare('SELECT * FROM tickets WHERE status=? ORDER BY id ASC LIMIT 50').all(status),
  setTicketNotes(id, notes) { db.prepare('UPDATE tickets SET dev_notes=? WHERE id=?').run(String(notes || '').slice(0, 20000), id); },
  dispatchByRef: r => db.prepare('SELECT * FROM dispatches WHERE ref=? ORDER BY id DESC').get(String(r || '').toUpperCase()),
  setDispatchStatus(ref, status) { db.prepare('UPDATE dispatches SET status=? WHERE ref=?').run(status, ref); },
  quietDispatches(olderThanMs, youngerThanMs, col) { const t = now(); return db.prepare(`SELECT * FROM dispatches WHERE status='sent' AND ${col} IS NULL AND created < ? AND created > ? AND to_email NOT LIKE '%@printspots.com' AND to_email NOT LIKE '%@printme.com' ORDER BY id ASC LIMIT 50`).all(t - olderThanMs, t - youngerThanMs); },
  markDispatch(ref, col) { db.prepare(`UPDATE dispatches SET ${col}=? WHERE ref=?`).run(now(), ref); },
  factPhoneFor(email) { const r = db.prepare('SELECT phone, name FROM shop_facts WHERE email=? AND phone IS NOT NULL AND phone<>? LIMIT 1').get(String(email || '').toLowerCase(), ''); return r || null; },
  logReply(r) { db.prepare('INSERT INTO replies(kind,ref,from_email,to_email,forwarded_to,subject,text,created) VALUES(?,?,?,?,?,?,?,?)').run(r.kind, r.ref, r.from_email, r.to_email, r.forwarded_to || '', r.subject || '', (r.text || '').slice(0, 20000), now()); },
  repliesFor: (kind, ref) => db.prepare('SELECT * FROM replies WHERE kind=? AND ref=? ORDER BY id').all(kind, ref),
  logDispatch(d) { const r = db.prepare(`INSERT INTO dispatches(device_token,email,shop_name,shop_address,to_email,subject,filename,ref,status,created,customer_name)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(d.device_token || '', d.email || '', d.shop_name || '', d.shop_address || '', d.to_email || '', d.subject || '', d.filename || '', d.ref, d.status || 'sent', now(), d.customer_name || ''); return r.lastInsertRowid; },
};
