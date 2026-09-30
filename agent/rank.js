'use strict';
// Ranking + research through the Claude Code CLI (`claude -p`), so it bills to
// the Max plan rather than the pay-as-you-go API. Structured output via --json-schema.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SHOP_CACHE_PATH, log } = require('./config');
const research = require('./research');
const cloud = require('./cloud');

const SCHEMA = {
  type: 'object',
  required: ['ranked'],
  properties: {
    location_note: { type: 'string' },
    ranked: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name', 'score', 'why', 'submit'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          address: { type: 'string' },
          distance_mi: { type: 'number' },
          open_now: { type: ['boolean', 'null'] },
          hours_today: { type: 'string' },
          est_cost_usd: { type: ['number', 'null'] },
          cost_basis: { type: 'string' },
          turnaround: { type: 'string' },
          rating: { type: ['number', 'null'] },
          score: { type: 'number' },
          why: { type: 'string' },
          automatable: { type: 'boolean' },
          submit: {
            type: 'object',
            required: ['method'],
            properties: {
              method: { type: 'string', enum: ['email', 'portal', 'phone', 'in_person'] },
              email: { type: 'string' },
              url: { type: 'string' },
              phone: { type: 'string' },
              instructions: { type: 'string' },
            },
          },
          email_subject: { type: 'string' },
          email_body: { type: 'string' },
        },
      },
    },
  },
};

const PRIORITY_TEXT = {
  Nearest: 'the closest shop that can actually do the job',
  Price: 'the lowest total price for this exact job',
  Turnaround: 'the fastest time until the job is in hand',
  OpenNow: 'a shop that is open right now and can take the job immediately',
  Quality: 'the best-reviewed shop with real print expertise',
};

function loadCache() {
  try { return JSON.parse(fs.readFileSync(SHOP_CACHE_PATH, 'utf8')); } catch { return {}; }
}
function saveCache(cache) {
  fs.writeFileSync(SHOP_CACHE_PATH, JSON.stringify(cache, null, 2));
}
function cacheKey(c) { return `${c.name}|${c.address}`.toLowerCase(); }

function buildPrompt(job, loc, candidates, cfg, cloudKnown = []) {
  const cache = loadCache();
  const known = candidates.map(c => cache[cacheKey(c)]).filter(Boolean).concat(cloudKnown);
  const now = new Date();
  const spec = job.spec;
  return `You are Print@, a dispatcher that picks the best nearby place to print a document and works out how to send it there.

## The job
- Document: "${job.title}" (${spec.pages || 'unknown'} pages, ${spec.copies} cop${spec.copies === 1 ? 'y' : 'ies'})
- ${spec.color ? 'Full color' : 'Black and white'}, ${spec.duplex ? 'two-sided' : 'single-sided'}, paper size ${spec.pageSize}
- Paper stock: ${spec.paperStock}; finishing: ${spec.binding}
- Needed by: ${spec.pickup}
- Optimize for: ${PRIORITY_TEXT[spec.priority] || PRIORITY_TEXT.Nearest} (priority = ${spec.priority}). Distance still matters as a tiebreaker.
- Shop type filter already applied: ${spec.shopType}${job.pin ? `\n- The user printed to a queue pinned to "${job.pin}". Only these candidates are that shop; rank them, do not look for alternatives.` : ''}

## Where the user is
${loc.address || `${loc.lat}, ${loc.lon}`} (from ${loc.source}). Local time now: ${now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}.

## Candidates (from Apple Maps, sorted by distance)
${JSON.stringify(candidates, null, 1)}

## Previously verified facts about some of these shops (from this Mac and from other Print@ users; may be stale)
${known.length ? JSON.stringify(known, null, 1) : 'none'}
Shops with fresh verified facts (verified within 30 days, with a submit method) do NOT need new web research: reuse the facts and spend your lookups on the others.

## What to do
1. Use WebSearch and WebFetch to verify, for the 4-6 most promising candidates given the priority: today's hours (are they open now?), document-printing prices for this job, realistic turnaround, and HOW TO SUBMIT a file (order email address, online upload portal, or phone/walk-in only). Prefer the shop's own website or its brand's official store page. Do not spend more than a few lookups per shop.
2. Estimate total cost for this exact job (pages x copies x per-page price, plus finishing). If unknown, use typical brand pricing from the notes and say so in cost_basis.
3. Rank every candidate. score is 0-1. Shops that cannot do the job (photo-only, closed for the needed window, no color when color is required) get a low score and a why that says so.
4. Submission policy: the user wants the job SENT for them, not a form to fill in. A shop whose order can be placed by email (or another machine-sendable channel) is worth far more than a cheaper or closer one that only has a web upload form or a phone number. If a SINGLE shop offers BOTH an email-to-print address and a web portal, ALWAYS choose the email (automatable) — never return method "portal" for a shop that also has any usable email. Look hard for an order/quote email on the shop's own site, its brand's store page, PrinterOn-style email-to-print addresses (hotels, libraries), or a published store email pattern (The UPS Store: store####@theupsstore.com). Set automatable=true only for "email". Rank all automatable shops above all non-automatable ones unless the automatable one cannot do the job.
5. Submission method rules:
   - "email": ONLY if you found a real order/quote email address, OR the candidate has a "chain_email" field (a verified central email-to-print address for that brand) — use chain_email exactly, method "email", automatable=true, and explain in instructions that a release code comes back by email to enter at any of that brand's self-service kiosks. Never guess an address. Candidates with a "printeron" field are PrinterOn public printers whose email in printeron.email is verified from the PrinterOn directory: use method "email" with exactly that address, automatable=true, and note in instructions that a 6-digit release code arrives by email and the job is collected at the business center or front desk. Do not research these beyond checking the venue is open to the public.
   Candidates with a "printme" field are PrinterOn-style PrintMe kiosks (Office Depot, Staples, etc). If printme.email is set, use method "email" with that exact central address, automatable=true, and note the release-code-at-kiosk flow. If printme.email is empty, use method "portal" with url https://www.printme.com/ and explain the file is uploaded via the PrintMe app then released at the kiosk. Do not invent an email for these.
   Candidates with a "library_print" field are public libraries whose email-to-print address is verified in library_print.email: use method "email" with exactly that address, automatable=true, note that a release code returns by email and the print is collected at the library.
   For any OTHER candidate that is a public library or a college/university library (name contains "library"/"college"/"university") WITHOUT a library_print field: it likely uses one of these public-print networks — find how on its own site with WebSearch/WebFetch and use the EXACT value you see (never guess a code):
     - EnvisionWare MobilePrint: "<code>-bw@ewprints.com" / "<code>-color@ewprints.com" → method email.
     - ePRINTit: "bw-<code>@eprintitsaas.com" → method email.
     - Wepa: the address is the SAME everywhere — "print@wepanow.com" (put "color"/"duplex" in the email body). If the page mentions Wepa/wepanow, use method email with print@wepanow.com, automatable=true, network "Wepa".
     - PaperCut Email to Print: a per-campus address the site publishes (e.g. print@its.school.edu) → method email with that exact address only.
     - Princh: a "print.princh.com/?pid=NUMBER" web portal → method portal with that URL.
   - "portal": an official online upload URL (brand portal is fine, prefer a store-specific page if it exists).
   - "phone": no online path found but a phone number exists.
   - "in_person": walk-in only (libraries, kiosks, hotel business centers).
   For email, write email_subject and email_body as ${cfg.contactName}: state the specs above plainly, say the PDF is attached, ask them to confirm price and ready time by reply, give pickup name${cfg.contactPhone ? ' and phone ' + cfg.contactPhone : ''}. Plain text, short, no marketing tone.
6. Return only the JSON.`;
}

function runClaude(prompt, cfg, onEvent = () => {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--json-schema', JSON.stringify(SCHEMA),
      '--permission-mode', 'bypassPermissions', '--max-turns', '60'];
    if (cfg.claudeModel) args.push('--model', cfg.claudeModel);
    args.push('--allowedTools', 'WebSearch', 'WebFetch', '--tools', 'WebSearch', 'WebFetch');
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (/^CLAUDE(CODE|_CODE)/.test(k)) delete env[k];
    env.PATH = `${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${env.PATH || '/usr/bin:/bin'}:/usr/sbin:/sbin`;
    const child = spawn('claude', args, { env, cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', err = '', final = null, lookups = 0;
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('claude timed out')); }, cfg.claudeTimeoutSec * 1000);
    const handle = line => {
      let ev; try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'result') { final = ev; return; }
      if (ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) return;
      for (const b of ev.message.content) {
        if (b.type !== 'tool_use') continue;
        lookups++;
        if (b.name === 'WebSearch' && b.input && b.input.query) onEvent(`Searching the web: ${b.input.query}`);
        else if (b.name === 'WebFetch' && b.input && b.input.url) { let h = b.input.url; try { h = new URL(b.input.url).hostname.replace(/^www\./, ''); } catch {} onEvent(`Reading ${h}`); }
      }
    };
    child.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    child.stderr.on('data', d => err += d);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (buf.trim()) handle(buf);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(-500)}`));
      try {
        const j = final || {};
        if (!final) return reject(new Error('claude produced no result event'));
        if (j.is_error) return reject(new Error(`claude error: ${String(j.result).slice(0, 300)}`));
        onEvent(`Ranking ${lookups} lookups into a shortlist`);
        let data = j.structured_output;
        if (!data && typeof j.result === 'string') {
          const m = j.result.match(/\{[\s\S]*\}/);
          data = m ? JSON.parse(m[0]) : null;
        }
        if (!data || !Array.isArray(data.ranked)) return reject(new Error('claude returned no ranking'));
        log(`claude ranking done: ${j.num_turns} turns, $${(j.total_cost_usd || 0).toFixed(2)} equiv, ${Math.round((j.duration_ms || 0) / 1000)}s`);
        resolve(data);
      } catch (e) { reject(new Error(`could not parse claude output: ${e.message}`)); }
    });
    child.stdin.end(prompt);
  });
}

// Fallback when Claude Code isn't installed or the run fails: no research, but every
// candidate with a known email-to-print address (chains, hotel/library printers, kiosks,
// library print services) is still fully automatable. Those sort first, then by distance.
function fallbackRanking(candidates) {
  const knownEmail = c => (c.known && c.known.submit && c.known.submit.method === 'email' && c.known.submit.email) || (c.printeron && c.printeron.email) || (c.printme && c.printme.email) || (c.library_print && c.library_print.email) || c.chain_email || c.email || '';
  const knownPortal = c => (c.known && c.known.submit && c.known.submit.method === 'portal' && c.known.submit.url) || c.portal || '';
  const ranked = candidates.map(c => {
    const email = knownEmail(c);
    const k = c.known || {};
    const base = { id: c.id, name: c.name, address: c.address, distance_mi: c.distance_mi, open_now: null, hours_today: k.hours_today || '', est_cost_usd: k.est_cost_usd ?? null, cost_basis: k.cost_basis || '', turnaround: '', rating: k.rating ?? null };
    if (email) return { ...base, score: 0.9 - Math.min(c.distance_mi || 0, 25) / 50, why: `${c.distance_mi} mi away · takes orders by email${k.verified ? ' (verified ' + k.verified + ')' : ''}`, automatable: true,
      submit: { method: 'email', email, instructions: 'Email the PDF; the release code or confirmation comes back to you.' } };
    const portal = knownPortal(c);
    return { ...base, score: 0.4 - Math.min(c.distance_mi || 0, 25) / 100, why: `${c.distance_mi} mi away`, automatable: false,
      submit: portal ? { method: 'portal', url: portal, phone: c.phone, instructions: 'Upload the PDF on their online ordering page and choose this store for pickup.' }
        : c.phone ? { method: 'phone', phone: c.phone, url: c.url, instructions: 'Call to ask how they accept files.' }
        : { method: 'in_person', url: c.url, instructions: 'Bring the file on a USB stick or ask at the counter.' } };
  }).sort((a, b) => b.score - a.score);
  return { location_note: 'Ranked without AI research (install Claude Code for hours, prices and local shops). Places with a known email-to-print address come first.', ranked };
}

async function rank(job, loc, candidates, cfg, onEvent = () => {}) {
  if (!candidates.length) return { ranked: [] };
  // Pool knowledge: ask the cloud what other drivers already verified about these shops.
  let cloudKnown = [];
  if (cloud.connected(cfg)) {
    try {
      // Only independents: chains and directory printers are already known to the driver.
      const ask = candidates.filter(c => c.lat && !c.printeron && !c.printme && !c.library_print && !c.chain_email && (c.brand || 'independent') === 'independent');
      const facts = ask.length ? await cloud.lookupFacts(cfg, ask) : {};
      for (const c of candidates) { const f = facts[cloud.factKey(c)]; if (f) { c.known = f; cloudKnown.push({ name: c.name, address: c.address, ...f }); } }
      if (cloudKnown.length) onEvent(`${cloudKnown.length} of ${candidates.length} places already known to Print@`);
    } catch (e) { log(`shop facts lookup failed: ${e.message}`); }
  }
  const provider = cfg.skipClaude ? 'none' : research.choose(cfg);
  if (provider === 'none') { log('ranking without research (no brain configured)'); return fallbackRanking(candidates); }
  try {
    const prompt = buildPrompt(job, loc, candidates, cfg, cloudKnown);
    onEvent(`Research via ${provider === 'claude-code' ? 'Claude Code' : provider === 'anthropic' ? 'Anthropic API' : 'OpenAI API'}`);
    const data = provider === 'anthropic' ? await research.runAnthropic(prompt, SCHEMA, cfg, onEvent)
      : provider === 'openai' ? await research.runOpenAI(prompt, SCHEMA, cfg, onEvent)
      : await runClaude(prompt, cfg, onEvent);
    const byId = Object.fromEntries(candidates.map(c => [c.id, c]));
    const cache = loadCache();
    // The model ranks; it does not get to invent candidates or rewrite where a known
    // destination sends. Directory / chain / pooled-fact addresses win over model output.
    const knownDest = c => (c.printeron && c.printeron.email) || (c.printme && c.printme.email) || (c.library_print && c.library_print.email) || c.chain_email || (c.known && c.known.submit && c.known.submit.method === 'email' && c.known.submit.email) || '';
    data.ranked = data.ranked.filter(r => r && byId[r.id]).map(r => {
      const c = byId[r.id];
      if (r.submit && r.submit.method === 'portal' && !/^https?:\/\//i.test(String(r.submit.url || ''))) r.submit = { method: 'in_person', instructions: 'Ask at the counter.' };
      if (r.submit && r.submit.method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.submit.email || ''))) r.submit = { method: c.phone ? 'phone' : 'in_person', phone: c.phone, instructions: 'Call to ask how they accept files.' };
      const fixed = knownDest(c);
      if (fixed) r.submit = { method: 'email', email: fixed, instructions: (r.submit && r.submit.instructions) || 'Email the PDF.' };
      const merged = { ...c, ...r, name: c.name, address: c.address, distance_mi: c.distance_mi ?? r.distance_mi, score: Number(r.score) || 0 };
      const known = cache[cacheKey(merged)];
      if (known && known.manual_email) {
        merged.submit = { method: 'email', email: known.manual_email, instructions: 'Order email entered by you in the Print@ console' };
        merged.automatable = true;
        merged.score = Math.max(merged.score, 0.5);
      }
      cache[cacheKey(merged)] = {
        ...(known && known.manual_email ? { manual_email: known.manual_email } : {}),
        name: merged.name, address: merged.address, hours_today: merged.hours_today, cost_basis: merged.cost_basis,
        submit: merged.submit, rating: merged.rating, verified: new Date().toISOString().slice(0, 10),
      };
      return merged;
    }).sort((a, b) => b.score - a.score);
    saveCache(cache);
    // Give back: report what was verified so the next driver skips the research.
    if (cloud.connected(cfg) && cfg.shareFacts !== false) {
      const facts = data.ranked.filter(r => r.submit && r.submit.method && byId[r.id] && byId[r.id].lat).map(r => {
        const c = byId[r.id];
        return { key: cloud.factKey(c), name: c.name, address: c.address, lat: c.lat, lon: c.lon, brand: c.brand, submit: r.submit, hours_today: r.hours_today || '', est_cost_usd: r.est_cost_usd ?? null, cost_basis: r.cost_basis || '', rating: r.rating ?? null, open_now: r.open_now ?? null, source: provider };
      });
      cloud.reportFacts(cfg, facts).then(() => log(`shop facts: reported ${facts.length}`)).catch(e => log(`shop facts report failed: ${e.message}`));
    }
    return data;
  } catch (e) {
    log(`${provider} ranking failed, using fallback: ${e.message}`);
    return fallbackRanking(candidates);
  }
}

module.exports = { rank, fallbackRanking };
