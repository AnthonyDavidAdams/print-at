'use strict';
// Server-side nearby search for the web portal / iOS share sheet. Unlike the macOS
// agent it can't use MapKit, so local shops come from OpenStreetMap Overpass; the
// networks (PrinterOn, PrintMe, libraries, chains) reuse the agent modules.
const path = require('path');
const printeron = require(path.join(__dirname, '..', 'agent', 'printeron'));
const printme = require(path.join(__dirname, '..', 'agent', 'printme'));
const libraryprint = require(path.join(__dirname, '..', 'agent', 'libraryprint'));

const CENTRAL = {
  'fedex office': 'printandgo@fedex.com',
  'staples': 'staples@printme.com',
  'office depot': 'officedepot@printme.com',
  'officemax': 'officedepot@printme.com',
};
const UPS_HINT = /the ups store/i;

function miles(a, b) {
  const R = 3958.8, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// OpenStreetMap Overpass: copy shops, stationery, and known print chains near a point.
async function overpass(lat, lon, radiusM) {
  const q = `[out:json][timeout:20];(
    node["shop"="copyshop"](around:${radiusM},${lat},${lon});
    node["shop"="stationery"](around:${radiusM},${lat},${lon});
    node["amenity"="library"](around:${radiusM},${lat},${lon});
    node["name"~"FedEx|Staples|UPS Store|Office Depot|OfficeMax|print|copy",i](around:${radiusM},${lat},${lon});
  );out center 60;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Print@ portal' },
      body: q, signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    return (j.elements || []).map(e => {
      const t = e.tags || {};
      const la = e.lat || (e.center && e.center.lat), lo = e.lon || (e.center && e.center.lon);
      if (la == null) return null;
      const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') +
        (t['addr:city'] ? `, ${t['addr:city']}` : '') + (t['addr:state'] ? `, ${t['addr:state']}` : '');
      return { name: t.name || (t.amenity === 'library' ? 'Public library' : 'Copy shop'), address: addr.replace(/^,\s*/, ''), lat: la, lon: lo, osm: true, tags: t };
    }).filter(Boolean);
  } catch (e) { return []; }
}

function centralEmail(name) {
  const n = (name || '').toLowerCase();
  for (const k of Object.keys(CENTRAL)) if (n.includes(k)) return { brand: k, email: CENTRAL[k] };
  return null;
}

async function nearby(loc, radiusMi = 15) {
  const radiusM = radiusMi * 1609;
  const out = [];
  // PrinterOn (bundled directory)
  try { for (const p of await printeron.findNearby(loc, [], radiusMi)) out.push(printeron.asCandidate(p, out.length)); } catch {}
  // PrintMe kiosks
  try { for (const p of printme.findNearby(loc, radiusMi).slice(0, 8)) out.push(printme.asCandidate(p, out.length)); } catch {}
  // OSM local shops, libraries, chain storefronts
  for (const s of await overpass(loc.lat, loc.lon, radiusM)) {
    const c = {
      id: `o${out.length}`, name: s.name, address: s.address, lat: s.lat, lon: s.lon,
      distance_mi: Math.round(miles(loc, s) * 10) / 10, brand: 'local',
    };
    const central = centralEmail(s.name);
    if (central) { c.brand = central.brand; c.chain_email = central.email; c.how = `email ${central.email}`; }
    else if (UPS_HINT.test(s.name)) { c.brand = 'the ups store'; c.how = 'per-store email or online upload'; }
    else if (/librar/i.test(s.name) || s.tags.amenity === 'library') { c.brand = 'library'; libraryprint.enrich(c); if (c.library_print) c.how = `email ${c.library_print.email}`; else c.how = 'email-to-print (ewprints/Princh) — look up code'; }
    out.push(c);
  }
  // de-dupe by rough address/name, attach how/distance, sort automatable-first then distance
  const seen = new Set();
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
  const list = [];
  for (const c of out) {
    const k = norm(c.name) + norm(c.address);
    if (seen.has(k)) continue; seen.add(k);
    c.distance_mi = c.distance_mi ?? (c.lat != null ? Math.round(miles(loc, c) * 10) / 10 : null);
    c.email = (c.printeron && c.printeron.email) || (c.printme && c.printme.email) || (c.library_print && c.library_print.email) || c.chain_email || '';
    c.automatable = !!c.email;
    if (!c.how) c.how = c.email ? `email ${c.email}` : c.portal ? 'online upload' : 'walk-in';
    list.push(c);
  }
  list.sort((a, b) => (b.automatable - a.automatable) || ((a.distance_mi ?? 99) - (b.distance_mi ?? 99)));
  return list.slice(0, 25);
}

module.exports = { nearby, miles };
