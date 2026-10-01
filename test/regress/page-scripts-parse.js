// Every inline <script> on the hosted pages must parse. A template literal that turns "\n"
// into a real newline inside a JS string silently kills the whole script (the /help Ask
// button and report form did nothing, 2026-10-01).
process.env.PRINTAT_NET_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'pa-pages-'));
process.env.PORT = '0';
const vm = require('vm');
const server = require('../../network/server.js');
const pages = typeof server.pages === 'function' ? server.pages() : null;
if (!pages) { console.error('network/server.js must export pages() for this test'); process.exit(1); }
try { pages['agent-console'] = require('../../agent/console.js').page({}, true); } catch (e) { console.error('console page skipped: ' + e.message); }
let n = 0, bad = 0;
for (const [name, html] of Object.entries(pages)) {
  for (const m of String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    n++; try { new vm.Script(m[1], { filename: name }); } catch (e) { bad++; console.error(`${name}: ${e.message}\n  ${m[1].slice(0, 160).replace(/\n/g, '\\n')}`); }
  }
}
if (!n) { console.error('no inline scripts found'); process.exit(1); }
if (bad) process.exit(1);
console.log(`page scripts parse ok (${n} scripts)`);
process.exit(0);
