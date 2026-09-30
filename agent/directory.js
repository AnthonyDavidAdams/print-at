'use strict';
// The public-printer directory (hotel/library PrinterOn printers, self-serve kiosks,
// library print services) is served by the Print@ cloud, not bundled with the driver.
// A connected driver downloads each file once and refreshes it weekly; the copy lives in
// ~/Library/Application Support/PrintAt/directory/. A maintainer checkout with data/*.json
// present uses those files directly. Local-only drivers without either simply have no
// directory: chains, local shops and Apple Maps still work.
const fs = require('fs');
const path = require('path');
const { APP_DIR, log } = require('./config');
const cloud = require('./cloud');

const NAMES = ['printeron-all', 'printme-us', 'library-print'];
const CACHE_DIR = path.join(APP_DIR, 'directory');
const BUNDLED = path.join(__dirname, '..', 'data');
const TTL = 7 * 86400e3;
const memo = {};

function candidates(name) { return [path.join(CACHE_DIR, name + '.json'), path.join(BUNDLED, name + '.json')]; }

// Parsed JSON for a directory file, memoized on the file's mtime; null when absent.
function read(name) {
  for (const f of candidates(name)) {
    let st; try { st = fs.statSync(f); } catch { continue; }
    const m = memo[name];
    if (m && m.file === f && m.mtime === st.mtimeMs) return m.data;
    try { const data = JSON.parse(fs.readFileSync(f, 'utf8')); memo[name] = { file: f, mtime: st.mtimeMs, data }; return data; } catch (e) { log(`directory ${name}: unreadable ${f}: ${e.message}`); }
  }
  return null;
}

function available(name) { return candidates(name).some(f => fs.existsSync(f)); }

// Download stale/missing files from the cloud. Quiet no-op when not connected.
async function refresh(cfg, force = false) {
  if (!cloud.connected(cfg)) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const name of NAMES) {
    const f = path.join(CACHE_DIR, name + '.json');
    try { if (!force && Date.now() - fs.statSync(f).mtimeMs < TTL) continue; } catch {}
    try {
      const r = await fetch(`${cloud.base(cfg)}/api/directory/${name}`, { headers: { Authorization: `Bearer ${cfg.cloudToken}` } });
      if (!r.ok) { log(`directory ${name}: cloud ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      JSON.parse(buf.toString('utf8')); // refuse to cache garbage
      fs.writeFileSync(f + '.tmp', buf); fs.renameSync(f + '.tmp', f);
      log(`directory ${name}: refreshed from cloud (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (e) { log(`directory ${name}: refresh failed: ${e.message}`); }
  }
}

module.exports = { read, available, refresh, NAMES, CACHE_DIR };
