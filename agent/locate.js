'use strict';
const { execFile } = require('child_process');
const { HELPER, log } = require('./config');

function helper(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    execFile(HELPER, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error(`helper returned non-JSON: ${stdout.slice(0, 200)}`)); }
    });
  });
}

async function reverse(lat, lon) {
  try { return (await helper(['reverse', String(lat), String(lon)])).address || ''; } catch { return ''; }
}

async function geocode(address) {
  const r = await helper(['geocode', address]);
  return { lat: r.lat, lon: r.lon, address: r.address || address, source: 'address you entered' };
}

async function byIp() {
  const ctl = AbortSignal.timeout(6000);
  const res = await fetch('http://ip-api.com/json/?fields=status,lat,lon,city,regionName,zip', { signal: ctl });
  const j = await res.json();
  if (j.status !== 'success') throw new Error('ip-api failed');
  return { lat: j.lat, lon: j.lon, address: [j.city, j.regionName, j.zip].filter(Boolean).join(', '), source: 'IP address (approximate)' };
}

function milesBetween(a, b) {
  const R = 3958.8, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Chain: Location Services -> IP geolocation (snapped to the saved home address
// when the IP puts us within 25 miles of it, since IP is only city-accurate) -> home address.
async function locate(cfg) {
  try {
    const r = await helper(['locate']);
    const address = await reverse(r.lat, r.lon);
    return { lat: r.lat, lon: r.lon, address, source: 'Location Services' };
  } catch (e) { log(`Location Services unavailable: ${e.message}`); }
  let home = null;
  if (cfg.homeAddress) {
    try { home = { ...(await geocode(cfg.homeAddress)), source: 'saved home address' }; } catch (e) { log(`home address geocode failed: ${e.message}`); }
  }
  try {
    const ip = await byIp();
    if (home && milesBetween(ip, home) <= 25) return { ...home, source: `saved home address (IP places you nearby, ${ip.address})` };
    return ip;
  } catch (e) { log(`IP geolocation failed: ${e.message}`); }
  if (home) return home;
  throw new Error('Could not determine location');
}

module.exports = { locate, geocode, reverse, helper };
