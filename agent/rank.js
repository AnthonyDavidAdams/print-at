'use strict';
// Ranking + research through the Claude Code CLI (`claude -p`), so it bills to
// the Max plan rather than the pay-as-you-go API. Structured output via --json-schema.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { SHOP_CACHE_PATH, log } = require('./config');

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

function buildPrompt(job, loc, candidates, cfg) {
  const cache = loadCache();
  const known = candidates.map(c => cache[cacheKey(c)]).filter(Boolean);
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

## Previously verified facts about some of these shops (may be stale)
${known.length ? JSON.stringify(known, null, 1) : 'none'}

## What to do
1. Use WebSearch and WebFetch to verify, for the 4-6 most promising candidates given the priority: today's hours (are they open now?), document-printing prices for this job, realistic turnaround, and HOW TO SUBMIT a file (order email address, online upload portal, or phone/walk-in only). Prefer the shop's own website or its brand's official store page. Do not spend more than a few lookups per shop.
2. Estimate total cost for this exact job (pages x copies x per-page price, plus finishing). If unknown, use typical brand pricing from the notes and say so in cost_basis.
3. Rank every candidate. score is 0-1. Shops that cannot do the job (photo-only, closed for the needed window, no color when color is required) get a low score and a why that says so.
4. Submission policy: the user wants the job SENT for them, not a form to fill in. A shop whose order can be placed by email (or another machine-sendable channel) is worth far more than a cheaper or closer one that only has a web upload form or a phone number. Look hard for an order/quote email on the shop's own site, its brand's store page, PrinterOn-style email-to-print addresses (hotels, libraries), or a published store email pattern (The UPS Store: store####@theupsstore.com). Set automatable=true only for "email". Rank all automatable shops above all non-automatable ones unless the automatable one cannot do the job.
5. Submission method rules:
   - "email": ONLY if you found a real order/quote email address, OR the candidate has a "chain_email" field (a verified central email-to-print address for that brand) — use chain_email exactly, method "email", automatable=true, and explain in instructions that a release code comes back by email to enter at any of that brand's self-service kiosks. Never guess an address. Candidates with a "printeron" field are PrinterOn public printers whose email in printeron.email is verified from the PrinterOn directory: use method "email" with exactly that address, automatable=true, and note in instructions that a 6-digit release code arrives by email and the job is collected at the business center or front desk. Do not research these beyond checking the venue is open to the public.
   Candidates with a "printme" field are PrinterOn-style PrintMe kiosks (Office Depot, Staples, etc). If printme.email is set, use method "email" with that exact central address, automatable=true, and note the release-code-at-kiosk flow. If printme.email is empty, use method "portal" with url https://www.printme.com/ and explain the file is uploaded via the PrintMe app then released at the kiosk. Do not invent an email for these.
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
      } catch (e) { reject(new Error(`could not parse claude output: ${e.message}: ${out.slice(0, 300)}`)); }
    });
    child.stdin.end(prompt);
  });
}

// Distance-only fallback when Claude is unavailable.
function fallbackRanking(candidates) {
  return {
    location_note: 'Ranked by distance only (AI ranking unavailable).',
    ranked: candidates.map((c, i) => ({
      id: c.id, name: c.name, address: c.address, distance_mi: c.distance_mi,
      open_now: null, hours_today: '', est_cost_usd: null, cost_basis: '', turnaround: '',
      rating: null, score: Math.max(0.05, 1 - i * 0.07), why: `${c.distance_mi} mi away`, automatable: false,
      submit: c.portal ? { method: 'portal', url: c.portal, phone: c.phone, instructions: 'Upload the PDF on the brand portal and choose this store for pickup.' }
        : c.phone ? { method: 'phone', phone: c.phone, url: c.url, instructions: 'Call to ask how they accept files.' }
        : { method: 'in_person', url: c.url, instructions: 'Bring the file on a USB stick or ask at the counter.' },
    })),
  };
}

async function rank(job, loc, candidates, cfg, onEvent = () => {}) {
  if (!candidates.length) return { ranked: [] };
  if (cfg.skipClaude) return fallbackRanking(candidates);
  try {
    const data = await runClaude(buildPrompt(job, loc, candidates, cfg), cfg, onEvent);
    const byId = Object.fromEntries(candidates.map(c => [c.id, c]));
    const cache = loadCache();
    data.ranked = data.ranked.map(r => {
      const c = byId[r.id] || {};
      const merged = { ...c, ...r, address: r.address || c.address, distance_mi: r.distance_mi ?? c.distance_mi };
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
    return data;
  } catch (e) {
    log(`Claude ranking failed, using distance fallback: ${e.message}`);
    return fallbackRanking(candidates);
  }
}

module.exports = { rank, fallbackRanking };
