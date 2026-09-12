'use strict';
// Print@ cloud client (driver side). Talks to printat.co so a connected driver can:
//   - pull Print@ Network shops near the user (real pickup codes, browser printing, ratings)
//   - dispatch a job through the cloud: emails come from printat.co (branded), not the
//     user's own inbox, and the job is logged so replies/codes can be relayed later.
// Every call fails soft: if the cloud is unreachable the driver falls back to local mode.
const fs = require('fs');
const { log } = require('./config');

function base(cfg) { return (cfg.cloudBase || 'https://printat.co').replace(/\/+$/, ''); }
function connected(cfg) { return cfg.useCloud !== 'off' && !!cfg.cloudToken; }

async function api(cfg, pathname, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (cfg.cloudToken && opts.auth !== false) headers.authorization = `Bearer ${cfg.cloudToken}`;
  const r = await fetch(base(cfg) + pathname, { ...opts, headers, signal: AbortSignal.timeout(opts.timeout || 20000) });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

// ---- device authorization (magic link) ----
// Start the flow: server emails a confirm link to `email`, returns a poll id.
async function startDeviceAuth(cfg, email, name) {
  return api(cfg, '/api/device/start', { method: 'POST', auth: false, body: JSON.stringify({ email, name, device: require('os').hostname() }) });
}
// Poll until the user clicks the emailed link; then returns { status:'ok', device_token, email }.
async function pollDevice(cfg, poll) {
  return api(cfg, '/api/device/poll?poll=' + encodeURIComponent(poll), { auth: false });
}

// ---- shops + dispatch ----
// Print@ Network shops near a location, shaped like driver candidates so they slot into ranking.
async function nearbyNetworkShops(cfg, loc, radiusMi = 25) {
  const d = await api(cfg, '/api/shops-nearby', { method: 'POST', auth: false, body: JSON.stringify({ lat: loc.lat, lon: loc.lon, radiusMi }) });
  if (!d.located || !d.shops) return [];
  return d.shops.map((s, i) => ({
    id: `net${i + 1}`, name: s.name, address: s.address || '', phone: '', url: '',
    lat: s.lat, lon: s.lon, distance_mi: s.distance_mi,
    brand: 'Print@ Network', network: true, network_id: s.id,
    price_bw: s.price_bw, price_color: s.price_color, hours: s.hours, stars: s.stars,
    brand_notes: `Print@ Network shop. Sends straight to the shop's browser; the customer gets a pickup code and can rate it. B&W ${s.price_bw || '?'}, color ${s.price_color || '?'}.`,
    submit: { method: 'network', network_id: s.id, instructions: 'Print@ Network — pickup code' },
    automatable: true,
  }));
}

// Send a job to a Print@ Network shop → returns { pickup_code, count }.
async function sendNetworkJob(cfg, { networkId, items, name, email }) {
  return api(cfg, '/api/send', { method: 'POST', auth: false, body: JSON.stringify({ shop_id: networkId, name, email, items }) });
}

// Dispatch a directory job (chain/PrinterOn/PrintMe/library email) THROUGH the cloud so the
// email is sent from printat.co, not the user's inbox. Returns { ok, tracking }.
async function dispatchEmail(cfg, { to, cc, subject, body, pdfPath, shop, meta }) {
  const fileB64 = fs.readFileSync(pdfPath).toString('base64');
  const filename = require('path').basename(pdfPath);
  return api(cfg, '/api/dispatch', { method: 'POST', timeout: 60000, body: JSON.stringify({
    to, cc, subject, body, filename, fileB64,
    shop: shop ? { name: shop.name, address: shop.address, lat: shop.lat, lon: shop.lon } : null,
    meta: meta || {},
  }) });
}

module.exports = { connected, startDeviceAuth, pollDevice, nearbyNetworkShops, sendNetworkJob, dispatchEmail, base };
