'use strict';
const { helper } = require('./locate');
const printeron = require('./printeron');
const { log } = require('./config');

// Brand knowledge Claude gets as hints. Portal URLs are the public upload entry points.
const CHAINS = [
  { match: /fedex office/i, brand: 'FedEx Office', portal: 'https://www.office.fedex.com/default/print-products', notes: 'Online upload with store pickup; kiosks also take email-to-print (Print & Go). Typical: $0.16-0.19/pg B&W, $0.79-0.99/pg color; same-day.' },
  { match: /staples/i, brand: 'Staples', portal: 'https://www.staples.com/services/printing/', notes: 'Online upload, same-day pickup in most stores. Typical: $0.15-0.19/pg B&W, $0.59-0.79/pg color.' },
  { match: /ups store/i, brand: 'The UPS Store', portal: 'https://www.theupsstore.com/print/online-printing', notes: 'Each store also accepts email orders at store####@theupsstore.com (number from the store page). Pricing varies by franchise.' },
  { match: /office ?depot|officemax/i, brand: 'Office Depot / OfficeMax', portal: 'https://www.officedepot.com/l/print-and-copy/print-online', notes: 'Online upload, 1-hour pickup on simple B&W/color docs.' },
  { match: /walgreens/i, brand: 'Walgreens', portal: 'https://photo.walgreens.com/store/document-printing', notes: 'Document printing via photo site, same-day pickup, B&W and color letter size only. Some stores publish a store email; check the store page.' },
  { match: /\bcvs\b/i, brand: 'CVS', portal: 'https://www.cvs.com/photo/documents', notes: 'Document printing via photo site, same-day pickup, letter size only. Some stores publish a store email; check the store page.' },
  { match: /walmart/i, brand: 'Walmart', portal: 'https://photos.walmart.com/', notes: 'Photo center; document printing varies by store. Check the store page for a store email before ruling it out.' },
  { match: /library/i, brand: 'Public library', notes: 'Cheapest B&W (often $0.10/pg). Usually Princh or PrinterOn web/email release; self-serve at the branch.' },
  { match: /hotel|\binn\b|suites|marriott|hilton|hyatt|sheraton|westin|courtyard|hampton|holiday inn/i, brand: 'Hotel business center', notes: 'Often PrinterOn: each printer has an email-to-print address on printeron.com/hotel directory. Sometimes guests-only.' },
  { match: /minuteman|alphagraphics|sir speedy|\bpip\b|allegra|postnet/i, brand: 'Franchise print shop', notes: 'Full-service; email the PDF, quote back within hours; better for binding and card stock.' },
];

const QUERIES = {
  Any: ['print shop', 'printing services', 'copy center', 'FedEx Office', 'Staples', 'The UPS Store', 'Office Depot'],
  Chains: ['FedEx Office', 'Staples', 'The UPS Store', 'Office Depot', 'OfficeMax', 'Walgreens', 'CVS Pharmacy'],
  Local: ['print shop', 'printing services', 'copy center', 'digital printing', 'sign and print'],
  Travel: ['hotel business center', 'public library', 'FedEx Office', 'The UPS Store', 'coworking space', 'print kiosk', 'copy center'],
};

const RADIUS_M = { '1mi': 1609, '2mi': 3219, '5mi': 8047, '10mi': 16093, '25mi': 40234 };

function chainFor(name) {
  return CHAINS.find(c => c.match.test(name || '')) || null;
}

function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Places MapKit returns for "print" queries that cannot print a document.
const NOISE = /access point|ship center|shipping center|drop ?box|customer center|fedex ground|fedex freight|amazon (hub|locker)|copier|toner|ink refill|3d print|screen print|t-?shirt|apparel|embroider/i;

async function findCandidates(loc, shopType, maxDistance, pin = '') {
  // A pinned queue ("Print at Eureka Staples") searches for that shop only and widens
  // the radius if it is not inside the chosen one.
  if (pin) {
    for (const r of [maxDistance, '10mi', '25mi']) {
      const found = (await findCandidates(loc, 'Any', r)).filter(c => norm(c.name).includes(norm(pin)) || norm(pin).includes(norm(c.name)));
      if (found.length) return found.slice(0, 3);
    }
    const direct = await helper(['search', pin, String(loc.lat), String(loc.lon), String(RADIUS_M['25mi'])]).catch(() => []);
    return direct.slice(0, 3).map((it, i) => ({ id: `s${i + 1}`, name: it.name, address: it.address, phone: it.phone || '', url: it.url || '', lat: it.lat, lon: it.lon,
      distance_mi: Math.round(it.distance_m / 160.9) / 10, brand: (chainFor(it.name) || {}).brand || 'independent', portal: (chainFor(it.name) || {}).portal || '', brand_notes: (chainFor(it.name) || {}).notes || '' }));
  }
  const radius = RADIUS_M[maxDistance] || RADIUS_M['5mi'];
  const queries = QUERIES[shopType] || QUERIES.Any;
  const results = await Promise.all(queries.map(q =>
    helper(['search', q, String(loc.lat), String(loc.lon), String(radius)]).catch(e => { log(`search "${q}" failed: ${e.message}`); return []; })
  ));
  const seen = new Map();
  for (const list of results) for (const it of list) {
    if (!it.name || it.distance_m > radius * 1.15 || NOISE.test(it.name)) continue;
    // Chains list their print counter as a second POI at the same address; collapse those.
    const key = (chainFor(it.name) ? norm(chainFor(it.name).brand) : norm(it.name)) + '|' + norm(it.address).slice(0, 12);
    if (!seen.has(key)) seen.set(key, it);
  }
  let items = [...seen.values()];
  items = items.filter(it => {
    const chain = chainFor(it.name);
    if (shopType === 'Chains') return !!chain && !/library|hotel|franchise/i.test(chain.brand);
    if (shopType === 'Local') return !chain || /franchise/i.test(chain.brand);
    // Drop obvious non-printers MapKit sometimes returns for "print shop".
    return !/MKPOICategory(Restaurant|Cafe|Bakery|GasStation|Pharmacy)$/.test(it.category || '') || !!chain;
  });
  items.sort((a, b) => a.distance_m - b.distance_m);
  const mapped = items.slice(0, 15).map((it, i) => {
    const chain = chainFor(it.name);
    return {
      id: `s${i + 1}`,
      name: it.name,
      address: it.address,
      phone: it.phone || '',
      url: it.url || '',
      lat: it.lat, lon: it.lon,
      distance_mi: Math.round(it.distance_m / 160.9) / 10,
      brand: chain ? chain.brand : 'independent',
      portal: chain && chain.portal ? chain.portal : '',
      brand_notes: chain ? chain.notes : '',
    };
  });
  // PrinterOn public printers (hotel business centers, libraries) come with a known
  // email-to-print address, so they are automatable even when nothing else is.
  if (shopType === 'Any' || shopType === 'Travel') {
    try {
      const radiusMi = radius / 1609;
      const near = await printeron.findNearby(loc, mapped.map(m => m.address), radiusMi);
      const seen = new Set(mapped.map(m => norm(m.address).slice(0, 14)));
      let n = 0;
      for (const p of near) {
        if (seen.has(norm(p.address).slice(0, 14))) continue;
        mapped.push(printeron.asCandidate(p, n++));
      }
      if (n) log(`printeron: added ${n} location(s)`);
    } catch (e) { log(`printeron lookup skipped: ${e.message}`); }
  }
  return mapped;
}

module.exports = { findCandidates, chainFor, CHAINS };
