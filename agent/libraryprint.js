'use strict';
// Public-library email-to-print (EnvisionWare MobilePrint / ewprints.com, and Princh).
// There is no central directory, so this is a seed of verified library codes plus a
// documented address pattern. A nearby library that matches the seed is sent by email;
// libraries not in the seed are resolved live by the ranker (see rank.js).
const fs = require('fs');
const path = require('path');
const { log } = require('./config');

const FILE = path.join(__dirname, '..', 'data', 'library-print.json');
let DB = null;
function load() {
  if (DB) return DB;
  try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { DB = { libraries: [] }; }
  return DB;
}
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ewprints addresses for a stem: bw + color (documented suffix pattern).
function addresses(stem) {
  return { bw: `${stem}-bw@ewprints.com`, color: `${stem}-color@ewprints.com`, duplex: `${stem}-bw-duplex@ewprints.com` };
}

// Match a candidate (name/city/state) to a seeded library; null if unknown.
function lookup(name, city, state) {
  const db = load();
  const n = norm(name);
  for (const lib of db.libraries) {
    const ln = norm(lib.name);
    const nameHit = n.includes(ln) || ln.includes(n) || (lib.aliases || []).some(a => n.includes(norm(a)));
    const geoOk = !lib.state || !state || lib.state === state;
    if (nameHit && geoOk) {
      const addr = addresses(lib.stems[0]);
      return { name: lib.name, stems: lib.stems, email: addr.bw, colorEmail: addr.color, note: lib.note || '' };
    }
  }
  return null;
}

// Attach a known ewprints email to a library-type candidate.
function enrich(candidate) {
  if (!/librar/i.test(candidate.name || '')) return candidate;
  const cs = (candidate.address || '').match(/,\s*([^,]+?),\s*([A-Z]{2})\b/);
  const hit = lookup(candidate.name, cs ? cs[1] : '', cs ? cs[2] : '');
  if (hit) {
    candidate.library_print = { email: hit.email, colorEmail: hit.colorEmail, network: 'ewprints' };
    log(`library-print: ${candidate.name} -> ${hit.email}`);
  }
  return candidate;
}

module.exports = { lookup, enrich, addresses };
