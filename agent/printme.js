'use strict';
// PrintMe (EFI/Fiery) kiosks: Office Depot, Staples, libraries, campuses. A document
// goes in by email to the brand's central PrintMe address (or the PrintMe app), and is
// released at any of that brand's kiosks with a PIN mailed back to the sender.
const fs = require('fs');
const path = require('path');
const { log } = require('./config');

const DIR_US = path.join(__dirname, '..', 'data', 'printme-us.json');
const DIR_WORLD = path.join(__dirname, '..', 'data', 'printme-world.json');

// Verified central email-to-print addresses (send here, release at any of that brand's kiosks).
const EMAILS = {
  'staples': 'staples@printme.com',
};
function emailFor(merchant) {
  const m = (merchant || '').toLowerCase();
  for (const k of Object.keys(EMAILS)) if (m.includes(k)) return EMAILS[k];
  return '';
}

let DIR = null;
function load() {
  if (DIR !== null) return DIR;
  for (const f of [DIR_WORLD, DIR_US]) {
    try { DIR = JSON.parse(fs.readFileSync(f, 'utf8')).locations || []; return DIR; } catch {}
  }
  DIR = [];
  return DIR;
}

function miles(a, b) {
  const R = 3958.8, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function findNearby(loc, radiusMi = 10) {
  const dir = load();
  if (!dir.length) return [];
  return dir
    .filter(p => p.lat != null && p.lon != null)
    .map(p => ({ ...p, distance_mi: Math.round(miles(loc, p) * 10) / 10 }))
    .filter(p => p.distance_mi <= radiusMi)
    .sort((a, b) => a.distance_mi - b.distance_mi);
}

function asCandidate(p, i) {
  const email = emailFor(p.merchant);
  const brand = p.merchant;
  return {
    id: `m${i + 1}`,
    name: `${brand}${/office depot|staples/i.test(brand) ? '' : ''}`.trim() + (p.name && !/^\d/.test(p.name) ? ` (${p.name})` : ''),
    address: p.address,
    phone: p.phone || '', url: 'https://www.printme.com/',
    lat: p.lat, lon: p.lon, distance_mi: p.distance_mi,
    brand: 'PrintMe',
    portal: email ? '' : 'https://www.printme.com/',
    brand_notes: email
      ? `PrintMe kiosk at ${brand}. Order by emailing the PDF to ${email}; a release code (barcode) comes back by email; release it yourself at the self-service kiosk in any ${brand} and pay there (often ~$0.19/pg B&W, ~$0.79-0.99 color).`
      : `PrintMe kiosk at ${brand}. Upload via the PrintMe app or printme.com, then release at the kiosk with the PIN. No central order email verified for this brand.`,
    printme: { merchant: brand, email },
  };
}

module.exports = { findNearby, asCandidate, emailFor };
