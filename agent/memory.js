'use strict';
// Remembers which shop was used from where, so the next job from the same spot
// skips the search. One entry per (place, priority, shop type); newest wins.
const fs = require('fs');
const path = require('path');
const { APP_DIR, log } = require('./config');

const FILE = path.join(APP_DIR, 'memory.json');
const MAX_AGE_DAYS = 30;
const MAX_MILES = 1.5;

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
function save(list) { fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); }

function miles(a, b) {
  const R = 3958.8, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function recall(loc, spec) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400e3;
  const hits = load().filter(e => e.at > cutoff && e.priority === spec.priority && e.shopType === spec.shopType && miles(e, loc) <= MAX_MILES);
  hits.sort((a, b) => b.at - a.at);
  return hits[0] || null;
}

function remember(loc, spec, pick) {
  const list = load().filter(e => !(e.priority === spec.priority && e.shopType === spec.shopType && miles(e, loc) <= MAX_MILES));
  list.unshift({ at: Date.now(), lat: loc.lat, lon: loc.lon, address: loc.address, priority: spec.priority, shopType: spec.shopType, pick });
  save(list.slice(0, 200));
  log(`remembered ${pick.name} for ${loc.address} (${spec.priority}/${spec.shopType})`);
}

function forget(loc, spec) {
  save(load().filter(e => !(e.priority === spec.priority && e.shopType === spec.shopType && miles(e, loc) <= MAX_MILES)));
}

module.exports = { recall, remember, forget };
