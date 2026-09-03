'use strict';
// PrinterOn public directory (hotels, libraries, business centers). Each printer has an
// email-to-print address at printspots.com, so these are automatable: mail the PDF, the
// release code comes back by email, pick up at the desk. Scraped from the city listing
// behind printeron.net's directory frame and cached per city for a week.
const fs = require('fs');
const path = require('path');
const { APP_DIR, log } = require('./config');
const { geocode } = require('./locate');

const CACHE = path.join(APP_DIR, 'printeron.json');
const DIRECTORY = path.join(__dirname, '..', 'data', 'printeron-us.json');
const BASE = 'https://www.printeron.net';
const UA = 'Mozilla/5.0 (Macintosh) Print@';
const TTL = 7 * 86400e3;

const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { return {}; } }
function saveCache(c) { fs.writeFileSync(CACHE, JSON.stringify(c, null, 2)); }

// Cookie-aware fetch: printeron.net hands out a JSESSIONID on the first hop and the
// details servlet only answers inside that session, so follow redirects by hand.
async function get(url, cookie = '') {
  let jar = cookie;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...(jar ? { Cookie: jar } : {}) }, signal: AbortSignal.timeout(20000), redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie') || '';
    const jsid = (setCookie.match(/JSESSIONID=([^;]+)/) || [])[1];
    if (jsid) jar = `JSESSIONID=${jsid}`;
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).toString();
      const pj = (url.match(/;jsessionid=([^?&/]+)/) || [])[1];
      if (pj) jar = `JSESSIONID=${pj}`;
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const text = await res.text();
    return Object.assign(new String(text), { cookie: jar });
  }
  throw new Error(`too many redirects: ${url}`);
}

const strip = s => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// "3123 H St, Eureka, CA, 95503" -> {city: 'Eureka', state: 'CA'}
function cityState(address) {
  const m = (address || '').match(/,\s*([^,]+?),\s*([A-Z]{2})\b/);
  return m ? { city: m[1].trim(), state: m[2] } : null;
}

// One city page: <a href="https://www.printeron.net/<path>;jsessionid=..">Name</a><br>street<br>City, ST zip<br>COUNTRY
async function cityListing(state, city) {
  const html = String(await get(`${BASE}/system/hotspot_search_frame.jsp?country=US&state=${encodeURIComponent(state)}&city=${encodeURIComponent(city)}`));
  const out = [];
  const re = /<a[^>]*href="https:\/\/www\.printeron\.net\/([^";]+)[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?<br>\s*([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const addr = strip(m[3]).replace(/\s*UNITED STATES\s*$/i, '').replace(/\s+,/g, ',');
    out.push({ path: m[1], name: strip(m[2]), address: addr });
  }
  return out;
}

// The printer page carries the printer alias; the details servlet publishes its email.
// The details servlet only answers inside the session that opened the printer page.
async function printerInfo(p) {
  const page = await get(`${BASE}/${p.path}`);
  const html = String(page);
  const aliases = [...html.matchAll(/name="printerAlias"[^>]*value="(\d{12})"/g)].map(x => x[1]);
  if (!aliases.length) return null;
  const alias = aliases[0];
  const number = alias.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '$1-$2-$3-$4');
  let email = `${alias.slice(3)}@printspots.com`, color = null, model = '';
  try {
    const sid = page.cookie ? ';jsessionid=' + page.cookie.replace('JSESSIONID=', '') : '';
    const detailsUrl = `${BASE}/Page${sid}?FUNCTION=SearchServlet_search&printeraddress=${alias}&urlsearch=true&dd=true&lang=us`;
    let d = strip(String(await get(detailsUrl, page.cookie)));
    let pnum = (d.match(/Printer Number:\s*([\d-]{11,15})/) || [])[1];
    if (pnum && pnum !== number) {
      await get(`${BASE}/system/printspot/interface/select_file.jsp${sid}?url=${encodeURIComponent(p.path)}&printerAlias=${alias}&lang=en-us`, page.cookie);
      d = strip(String(await get(detailsUrl, page.cookie)));
      pnum = (d.match(/Printer Number:\s*([\d-]{11,15})/) || [])[1];
    }
    if (pnum && pnum !== number) throw new Error(`details mismatch: got ${pnum}, wanted ${number}`);
    const em = d.match(/Email Address:\s*([\w.-]+@printspots\.com)/i);
    if (em) email = em[1];
    const cm = d.match(/Color\/B&W:\s*(Color|Black\s*&\s*White)/i);
    if (cm) color = /color/i.test(cm[1]);
    const mm = d.match(/Model:\s*([A-Za-z0-9 ]{2,30})/);
    if (mm) model = mm[1].trim();
  } catch (e) { log(`printeron details failed for ${p.path}: ${e.message}`); }
  return { alias, number, email, color, model, printers: aliases.length };
}

function miles(a, b) {
  const R = 3958.8, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The bundled directory (data/printeron-us.json) already has every US printer with its
// email and color, so when it is present we filter it by distance and skip scraping.
let DIR = null;
function loadDirectory() {
  if (DIR !== null) return DIR;
  try { DIR = JSON.parse(fs.readFileSync(DIRECTORY, 'utf8')).printers || []; } catch { DIR = []; }
  return DIR;
}

async function fromDirectory(loc, radiusMi) {
  const dir = loadDirectory();
  if (!dir.length) return null;
  const home = cityState(loc.address);
  const withGeo = [];
  const needGeo = [];
  for (const p of dir) {
    const cs = cityState(', ' + p.address) || cityState(p.address + ',');
    // fast path: same city or state, geocode lazily
    if (home && p.state !== home.state) continue;
    needGeo.push(p);
  }
  // Geocode only the same-state printers whose city matches the user's or a candidate city set is unknown here,
  // so bound the work: same city first, then nearest by string, cap the geocoding.
  const sameCity = home ? needGeo.filter(p => (p.city || '').toLowerCase() === home.city.toLowerCase()) : [];
  const pool = (sameCity.length ? sameCity : needGeo).slice(0, 40);
  for (const p of pool) {
    let lat = p.lat, lon = p.lon;
    if (lat == null) { try { const g = await geocode(p.address); lat = g.lat; lon = g.lon; } catch { continue; } }
    const mi = Math.round(miles(loc, { lat, lon }) * 10) / 10;
    if (mi <= radiusMi) withGeo.push({ ...p, lat, lon, distance_mi: mi });
  }
  return withGeo.sort((a, b) => a.distance_mi - b.distance_mi);
}

// Locations in the user's city plus the cities of the other candidates, within radiusMi.
async function findNearby(loc, otherAddresses = [], radiusMi = 10) {
  const local = await fromDirectory(loc, radiusMi);
  if (local && local.length) { log(`printeron: ${local.length} from bundled directory`); return local; }
  if (loadDirectory().length) return [];   // directory present but nothing nearby

  const home = cityState(loc.address);
  if (!home) return [];
  const cities = new Map();
  for (const a of [loc.address, ...otherAddresses]) {
    const cs = cityState(a);
    if (cs && cs.state === home.state) cities.set(cs.city.toLowerCase(), cs.city);
  }
  const cache = loadCache();
  const found = [];
  for (const city of cities.values()) {
    const key = `${home.state}/${city}`.toLowerCase();
    let entry = cache[key];
    if (!entry || Date.now() - entry.at > TTL) {
      try {
        const list = await cityListing(home.state, city);
        const items = [];
        for (const p of list.slice(0, 12)) {
          const info = await printerInfo(p).catch(() => null);
          if (!info) continue;
          let geo = null;
          try { geo = await geocode(p.address); } catch {}
          items.push({ ...p, ...info, lat: geo ? geo.lat : null, lon: geo ? geo.lon : null });
        }
        const byAddr = new Map();
        for (const it of items) {
          const k = it.address.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
          const cur = byAddr.get(k);
          if (!cur || (/\d/.test(cur.name) && !/\d/.test(it.name))) byAddr.set(k, { ...it, printers: (cur ? cur.printers : 0) + it.printers });
        }
        entry = { at: Date.now(), items: [...byAddr.values()] };
        cache[key] = entry;
        saveCache(cache);
        log(`printeron: ${items.length} location(s) in ${city}, ${home.state}`);
      } catch (e) { log(`printeron: ${city} lookup failed: ${e.message}`); continue; }
    }
    found.push(...entry.items);
  }
  return found
    .map(p => ({ ...p, distance_mi: p.lat != null ? Math.round(miles(loc, p) * 10) / 10 : null }))
    .filter(p => p.distance_mi == null || p.distance_mi <= radiusMi)
    .sort((a, b) => (a.distance_mi ?? 99) - (b.distance_mi ?? 99));
}

// Shape a PrinterOn location like a search candidate.
function asCandidate(p, i) {
  return {
    id: `p${i + 1}`,
    name: `${p.name}`,
    address: p.address,
    phone: '', url: `${BASE}/${p.path}`,
    lat: p.lat, lon: p.lon,
    distance_mi: p.distance_mi,
    brand: 'PrinterOn',
    portal: `${BASE}/${p.path}`,
    brand_notes: `PrinterOn public printer (${p.color === true ? 'color' : p.color === false ? 'black and white' : 'color unknown'}${p.model ? ', ' + p.model : ''}). Order by emailing the PDF to ${p.email}; a 6-digit release code comes back by email; collect at the business center or front desk. No per-page price published; hotels often charge little or nothing for guests.`,
    printeron: { email: p.email, alias: p.alias, number: p.number },
  };
}

module.exports = { findNearby, asCandidate, cityState };
