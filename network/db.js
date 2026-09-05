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
`);
try { db.exec('ALTER TABLE jobs ADD COLUMN group_id TEXT'); } catch {}
const now = () => Date.now();
const rid = (n = 16) => require('crypto').randomBytes(n).toString('hex');
const code = () => String(Math.floor(100000 + Math.random() * 900000));

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
      const r = db.prepare(`INSERT INTO jobs(shop_id,customer_name,customer_email,filename,filepath,pages,copies,color,pickup_code,group_id,rate_token,status,created)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'queued',?)`).run(base.shop_id, base.customer_name, base.customer_email, it.filename, it.filepath, it.pages || 0, it.copies || 1, it.color ? 1 : 0, pc, gid, rt, now());
      if (firstId == null) firstId = r.lastInsertRowid;
    }
    return { id: firstId, pickup_code: pc, rate_token: rt, group_id: gid };
  },
  jobsForShop: id => db.prepare("SELECT * FROM jobs WHERE shop_id=? ORDER BY created DESC LIMIT 100").all(id),
  jobById: id => db.prepare('SELECT * FROM jobs WHERE id=?').get(id),
  jobByRateToken: t => db.prepare('SELECT * FROM jobs WHERE rate_token=?').get(t || ''),
  jobsByCode: c => db.prepare('SELECT * FROM jobs WHERE pickup_code=? ORDER BY id').all(String(c || '').trim()),
  setJobStatus(id, status) { db.prepare('UPDATE jobs SET status=?, printed=? WHERE id=?').run(status, status === 'printed' || status === 'done' ? now() : null, id); },
  // ratings
  addRating(shop_id, job_id, stars, comment) { db.prepare('INSERT INTO ratings(shop_id,job_id,stars,comment,created) VALUES(?,?,?,?,?)').run(shop_id, job_id, stars, comment || '', now()); },
  shopRating: id => db.prepare('SELECT COUNT(*) n, AVG(stars) avg FROM ratings WHERE shop_id=?').get(id),
  shopReviews: id => db.prepare('SELECT stars,comment,created FROM ratings WHERE shop_id=? AND comment<>"" ORDER BY created DESC LIMIT 10').all(id),
};
