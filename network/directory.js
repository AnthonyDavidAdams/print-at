'use strict';
// The public-printer directory, server side, for the web portal: the same files connected
// drivers download (PrinterOn hotel/library printers, PrintMe kiosks), read from the volume,
// searched by distance. Only entries a web user can actually send to by email are returned.
//
// Files (PRINTAT_NET_DIR/directory/, uploaded by the maintainer):
//   printeron-all.json  { printers: [{ path, name, address, city, state, country, email, status, color, ... }] }
//   printeron-geo.json  { [path]: { lat, lon } | null }    (geocoded addresses; built by scratch/geocode-printeron.js)
//   printme-us.json     { locations: [{ merchant, name, address, city, state, zip, country, lat, lon, phone }], submit }
const fs = require('fs');
const path = require('path');

const DIR = () => path.join(require('./db').DIR, 'directory');
const cache = {};
function read(name) {
  const f = path.join(DIR(), name + '.json');
  try {
    const m = fs.statSync(f).mtimeMs; const c = cache[name];
    if (c && c.m === m) return c.d;
    const d = JSON.parse(fs.readFileSync(f, 'utf8')); cache[name] = { m, d }; return d;
  } catch { return null; }
}

const R = Math.PI / 180;
function miles(a, b) {
  const dLat = (b.lat - a.lat) * R, dLon = (b.lon - a.lon) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// Every sendable entry, normalized. Memoized per file version.
let allCache = null, allKey = '';
function all() {
  const po = read('printeron-all'), geo = read('printeron-geo') || {}, pm = read('printme-us');
  const key = [po && po.fetched, Object.keys(geo).length, pm && pm.fetched, Math.floor(Date.now() / 3600e3)].join('|'); // re-merge learned coordinates hourly
  if (allCache && allKey === key) return allCache;
  // Coordinates the drivers learned (pooled facts carry lat/lon for PrinterOn printers they researched)
  // fill in where the geocoder came up empty.
  const learned = {}; try { for (const r of require('./db').factsWithEmailLike('%@printspots.com')) if (r.lat && r.lon) learned[r.email.toLowerCase()] = { lat: r.lat, lon: r.lon }; } catch {}
  const out = [];
  for (const p of (po && po.printers) || []) {
    if (!p.email || p.status === 'offline') continue;
    const g = geo[p.path] || learned[p.email.toLowerCase()]; if (!g) continue; // no coordinates yet: not searchable by distance
    const kind = /librar/i.test(p.name) ? 'library' : /hotel|inn|suites|marriott|hilton|hyatt|sheraton|westin|resort|lodge|motel|courtyard|residence|hampton|holiday|doubletree|embassy|fairfield|springhill|towneplace|hospitality/i.test(p.name) ? 'hotel' : 'printer';
    out.push({ key: 'po:' + p.path, network: 'PrinterOn', kind, name: p.name.replace(/\s+-\s+[A-Z0-9]{3,8}$/, ''), address: p.address, city: p.city, state: p.state, country: p.country, email: p.email, color: !!p.color, lat: g.lat, lon: g.lon,
      how: 'Email. The printer emails you a release code; type it at the printer or ask the desk.' });
  }
  for (const l of (pm && pm.locations) || []) {
    if (typeof l.lat !== 'number' || typeof l.lon !== 'number') continue;
    out.push({ key: 'pm:' + [l.merchant, l.name, l.zip].join('|'), network: 'PrintMe', kind: 'kiosk', name: l.merchant + (l.name && l.name !== l.merchant ? ' · ' + l.name : ''), address: l.address, city: l.city, state: l.state, country: l.country, email: 'printme@printme.com', color: true, lat: l.lat, lon: l.lon, phone: l.phone,
      how: 'Email. PrintMe emails you a release code; enter it at the kiosk.' });
  }
  allCache = out; allKey = key; return out;
}

function nearby(lat, lon, radiusMi = 25, limit = 12) {
  const here = { lat, lon };
  return all().map(e => ({ ...e, distance_mi: Math.round(miles(here, e) * 10) / 10 })).filter(e => e.distance_mi <= radiusMi).sort((a, b) => a.distance_mi - b.distance_mi).slice(0, limit);
}
const find = key => all().find(e => e.key === key) || null;
const counts = () => { const c = { total: 0 }; for (const e of all()) { c.total++; c[e.kind] = (c[e.kind] || 0) + 1; } return c; };

module.exports = { nearby, find, counts, miles, all };
