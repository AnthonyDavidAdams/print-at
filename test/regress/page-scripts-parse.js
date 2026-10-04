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
// Element ids become window globals, but built-ins win: `find`, `name`, `status`, `open`, `close`,
// `print`, `parent`, `top`, `self`, `length`, `event` never resolve to the element. The portal's
// Find button was dead for every browser because of exactly this.
const RESERVED = ['find', 'name', 'status', 'open', 'close', 'print', 'parent', 'top', 'self', 'length', 'event', 'history', 'location', 'menubar', 'screen', 'external'];
for (const [name, html] of Object.entries(pages)) {
  for (const id of [...String(html).matchAll(/\sid=["']?([A-Za-z_][\w-]*)/g)].map(m => m[1])) {
    if (!RESERVED.includes(id)) continue;
    for (const m of String(html).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      const js = m[1]; const usesBare = new RegExp(`(^|[^.\\w$'"])${id}\\.(onclick|textContent|innerHTML|style|value|addEventListener)`).test(js);
      const declared = new RegExp(`\\b(var|let|const)\\s+[^;]*\\b${id}\\s*=\\s*(\\$|document\\.getElementById)\\(`).test(js);
      if (usesBare && !declared) { bad++; console.error(`${name}: element id "${id}" is used as a bare global but window.${id} is a built-in; declare it with getElementById`); }
    }
  }
}
if (!n) { console.error('no inline scripts found'); process.exit(1); }
if (bad) process.exit(1);
console.log(`page scripts parse ok (${n} scripts)`);
process.exit(0);
