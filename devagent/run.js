#!/usr/bin/env node
'use strict';
// Print@ dev agent. Stage five of the customer-service loop:
//   open ticket → reproduce + fix in a git worktree (Claude Code) → tests → three judges
//   (Astra, Claude, Jev) → iMessage the maintainer → "YES <id>" → merge, push, deploy, reply to the reporter.
//
//   node devagent/run.js once          handle new tickets, then check for replies (default)
//   node devagent/run.js watch         loop: tickets every 10 min, replies every minute
//   node devagent/run.js approve <id>  same as texting YES <id>
//   node devagent/run.js reject <id>   same as texting NO <id>
//   node devagent/run.js status
//
// Env (loaded from ~/.printat.env): PRINTAT_ADMIN_SECRET, OPENROUTER_API_KEY, DEVAGENT_PHONE (+1…).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.PRINTAT_NET_BASE_PROD || 'https://printat.co';
const STATE_PATH = path.join(__dirname, 'state.json');
const RUNS = path.join(__dirname, 'runs');
const WORKTREES = path.join(path.dirname(ROOT), 'printat-fixes');
const JEV_MIN = Number(process.env.DEVAGENT_JEV_MIN || 0.6);

for (const line of (() => { try { return fs.readFileSync(path.join(os.homedir(), '.printat.env'), 'utf8').split('\n'); } catch { return []; } })()) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const notify = require('./notify');
const judges = require('./judges');

const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { tickets: {} }; } })();
const save = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
const log = (id, msg) => { const line = `${new Date().toISOString()} ${id ? '#' + id + ' ' : ''}${msg}`; console.log(line); if (id) { fs.mkdirSync(path.join(RUNS, String(id)), { recursive: true }); fs.appendFileSync(path.join(RUNS, String(id), 'run.log'), line + '\n'); } };
const sh = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 50e6, ...opts }); if (r.status !== 0 && !opts.ok) throw new Error(`${cmd} ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim().slice(-500)}`); return (r.stdout || '').trim(); };
const git = (cwd, ...args) => sh('git', ['-C', cwd, ...args]);

async function api(p, opts = {}) {
  const r = await fetch(BASE + p, { ...opts, headers: { 'x-printat-admin': process.env.PRINTAT_ADMIN_SECRET || '', 'content-type': 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p}: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
const note = (id, status, notes) => api(`/api/admin/tickets/${id}`, { method: 'POST', body: JSON.stringify({ status, notes }) }).catch(e => log(id, 'note failed: ' + e.message));

// ---------- the fixing agent ----------
function fixPrompt(t) {
  return `You are the Print@ dev agent, working in a git worktree on branch fix/ticket-${t.id} (the current directory). Print@ is a macOS virtual printer (CUPS backend in backend/, Node agent in agent/, CLI in bin/, installer install.sh) plus a hosted network (network/server.js on Railway at printat.co) and the landing site (docs/). Read README.md first.

A user reported this. Ticket #${t.id} · source: ${t.source} · category: ${t.category || '?'} · FAQ match: ${t.faq_id || 'none'} (${t.faq_confidence == null ? '-' : Number(t.faq_confidence).toFixed(2)}) · reporter: ${t.email || '(no email)'}

--- report ---
${t.description}

--- diagnostics (already redacted) ---
${t.diagnostics || '(none)'}

Do this, in order:
1. Find the cause in the code. The diagnostics carry versions and log lines; use them. Do not guess: name the file and line.
2. Fix it with the smallest correct change, in the existing style (plain Node, no new dependencies unless unavoidable).
3. Add a regression test as test/regress/<slug>.js (a node script that exits non-zero on failure; see the existing ones) when the bug is testable without a real printer, CUPS or root. Run ./test/run.sh; everything must pass.
4. If users will hit this again and can fix it themselves, add an entry to network/faq.js in the same shape as the others.
5. Commit with git, staging files BY NAME (never \`git add -A\`), message starting "Fix #${t.id}: ".
6. Write FIX.md in the worktree root (do NOT commit it). First these lines, exactly, then free text:
verdict: fixed | no-fix | needs-human
cause: one sentence
change: one sentence
tests: what you ran and the result
risk: low | medium | high, and why
deploy: network | driver | both | none
confidence: 0 to 1
customer_note: two or three plain sentences to email the reporter: what was wrong and what to do now (for driver fixes: click Update now in the console at http://127.0.0.1:4243/ or run "printat update"). No jargon, no apology-only text.

Use verdict no-fix when it is not a bug (say what the user should do in customer_note), needs-human when it needs a decision, credentials, a physical device, or lives outside this repo. Never touch secrets or .env files, never deploy, never push.`;
}

function parseFix(md) {
  const f = {}; for (const line of md.split('\n')) { const m = line.match(/^(verdict|cause|change|tests|risk|deploy|confidence|customer_note):\s*(.*)$/i); if (m && !f[m[1].toLowerCase()]) f[m[1].toLowerCase()] = m[2].trim(); }
  f.verdict = (f.verdict || 'needs-human').toLowerCase().replace(/[^a-z-].*$/, '');
  f.confidence = Number(f.confidence) || 0; f.deploy = (f.deploy || 'none').toLowerCase().replace(/[^a-z].*$/, '');
  return f;
}

function runClaude(cwd, prompt, logFile, maxTurns = 80) {
  const r = spawnSync('claude', ['-p', prompt, '--output-format', 'json', '--max-turns', String(maxTurns), '--dangerously-skip-permissions'], { cwd, encoding: 'utf8', timeout: 40 * 60000, maxBuffer: 100e6, env: { ...process.env, CLAUDECODE: '' } });
  fs.writeFileSync(logFile, (r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''));
  if (r.status !== 0) throw new Error('claude exited ' + r.status + ': ' + (r.stderr || '').slice(-300));
  try { return JSON.parse(r.stdout).result || ''; } catch { return r.stdout; }
}

async function handle(t) {
  const id = t.id; const s = state.tickets[id] = { stage: 'fixing', started: Date.now(), email: t.email, branch: `fix/ticket-${id}`, worktree: path.join(WORKTREES, String(id)) };
  save(); fs.mkdirSync(path.join(RUNS, String(id)), { recursive: true }); fs.mkdirSync(WORKTREES, { recursive: true });
  log(id, `new ticket from ${t.email || '?'}: ${t.description.slice(0, 100).replace(/\n/g, ' ')}`);
  await note(id, 'in-progress', `dev agent started ${new Date().toISOString()}`);
  try {
    git(ROOT, 'fetch', '-q', 'origin', 'main');
    if (fs.existsSync(s.worktree)) { sh('git', ['-C', ROOT, 'worktree', 'remove', '--force', s.worktree], { ok: true }); }
    sh('git', ['-C', ROOT, 'branch', '-D', s.branch], { ok: true });
    git(ROOT, 'worktree', 'add', '-q', '-b', s.branch, s.worktree, 'origin/main');
    if (fs.existsSync(path.join(ROOT, 'node_modules'))) fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(s.worktree, 'node_modules'));
    log(id, 'worktree ready, running the fixing agent');
    runClaude(s.worktree, fixPrompt(t), path.join(RUNS, String(id), 'fix.json'));
    const md = fs.existsSync(path.join(s.worktree, 'FIX.md')) ? fs.readFileSync(path.join(s.worktree, 'FIX.md'), 'utf8') : 'verdict: needs-human\ncause: the agent wrote no FIX.md';
    fs.writeFileSync(path.join(RUNS, String(id), 'FIX.md'), md);
    const fix = parseFix(md); s.fix = fix; save();
    log(id, `verdict ${fix.verdict}: ${fix.cause || ''}`);
    if (fix.verdict !== 'fixed') {
      s.stage = 'needs-human'; save();
      await note(id, 'needs-human', `dev agent: ${fix.verdict}. ${fix.cause || ''} ${fix.customer_note || ''}`.trim());
      notify.sendText(`Print@ dev agent · ticket #${id} (${t.email || 'no email'}): ${fix.verdict.toUpperCase()}.\n${fix.cause || ''}\n${fix.customer_note ? 'Suggested reply: ' + fix.customer_note : ''}\nDetails: ${BASE}/admin/bugs/${id}`);
      return;
    }
    // Anything the agent left unstaged (never add -A): stage by name, excluding FIX.md.
    const dirty = git(s.worktree, 'status', '--porcelain').split('\n').filter(Boolean).map(l => l.slice(3).trim()).filter(f => f && f !== 'FIX.md' && f !== 'node_modules');
    if (dirty.length) { git(s.worktree, 'add', '--', ...dirty); git(s.worktree, 'commit', '-q', '-m', `Fix #${id}: remaining changes`); }
    const diff = git(s.worktree, 'diff', 'origin/main...HEAD'); fs.writeFileSync(path.join(RUNS, String(id), 'diff.patch'), diff);
    s.files = git(s.worktree, 'diff', '--name-only', 'origin/main...HEAD').split('\n').filter(Boolean);
    if (!diff.trim()) throw new Error('verdict fixed but the diff is empty');
    const testRun = spawnSync('./test/run.sh', [], { cwd: s.worktree, encoding: 'utf8', timeout: 10 * 60000 });
    const tests = (testRun.stdout || '') + (testRun.stderr || ''); s.testsPassed = testRun.status === 0; fs.writeFileSync(path.join(RUNS, String(id), 'tests.txt'), tests);
    log(id, `tests ${s.testsPassed ? 'passed' : 'FAILED'}; ${s.files.length} files changed; asking the judges`);
    const packet = { ticket: `#${id} from ${t.email || '?'} via ${t.source} (${t.category || '?'})\n${t.description}\n\nDiagnostics:\n${(t.diagnostics || '').slice(0, 4000)}`, fixmd: md, diff, tests };
    const [astra, claude, jev] = await Promise.all([
      judges.astra(packet).catch(e => ({ approve: false, risk: 'high', summary: 'Astra failed: ' + e.message, concerns: [], must_fix: [] })),
      Promise.resolve().then(() => judges.claudeReview(s.worktree, packet)).catch(e => ({ approve: false, risk: 'high', summary: 'Claude review failed: ' + e.message, concerns: [], must_fix: [] })),
      judges.jevScore(packet).catch(e => ({ probability: 0, error: e.message })),
    ]);
    s.reviews = { astra, claude, jev }; fs.writeFileSync(path.join(RUNS, String(id), 'reviews.json'), JSON.stringify(s.reviews, null, 2)); save();
    const ok = s.testsPassed && astra.approve && claude.approve && jev.probability >= JEV_MIN;
    const verdictLine = `Tests: ${s.testsPassed ? 'pass' : 'FAIL'} · Astra: ${astra.approve ? 'ok' : 'NO'} (${astra.risk}) · Claude: ${claude.approve ? 'ok' : 'NO'} (${claude.risk}) · Jev ${jev.probability.toFixed(2)}`;
    log(id, verdictLine + (astra.cost ? ` · astra $${astra.cost.toFixed(2)}` : ''));
    if (ok) {
      s.stage = 'awaiting-approval'; s.textedAt = Date.now(); save();
      await note(id, 'fix-ready', `branch ${s.branch}; ${verdictLine}; awaiting maintainer approval`);
      notify.sendText(`Print@ dev agent · ticket #${id} (${t.email || 'no email'}): fix ready.\nCause: ${fix.cause}\nFix: ${fix.change} (${s.files.length} file${s.files.length === 1 ? '' : 's'}, deploy: ${fix.deploy})\n${verdictLine}\nReply YES ${id} to deploy, NO ${id} to drop.`);
    } else {
      s.stage = 'needs-human'; save();
      const why = [...(astra.must_fix || []).map(x => 'Astra: ' + x), ...(claude.must_fix || []).map(x => 'Claude: ' + x), !s.testsPassed ? 'tests failed' : '', jev.probability < JEV_MIN ? `Jev ${jev.probability.toFixed(2)} < ${JEV_MIN}` : ''].filter(Boolean).slice(0, 5).join('\n');
      await note(id, 'needs-human', `fix on ${s.branch} did not pass review. ${verdictLine}. ${why}`);
      notify.sendText(`Print@ dev agent · ticket #${id}: fix on ${s.branch} did NOT pass review.\n${verdictLine}\n${why}\nWorktree: ${s.worktree}`);
    }
  } catch (e) {
    s.stage = 'error'; s.error = e.message; save(); log(id, 'ERROR ' + e.message);
    await note(id, 'needs-human', 'dev agent error: ' + e.message.slice(0, 500));
    try { notify.sendText(`Print@ dev agent · ticket #${id}: error. ${e.message.slice(0, 300)}`); } catch {}
  }
}

// ---------- approval, deploy, reject ----------
async function deploy(id) {
  const s = state.tickets[id]; if (!s || s.stage !== 'awaiting-approval') throw new Error(`ticket #${id} is not awaiting approval (${s ? s.stage : 'unknown'})`);
  s.stage = 'deploying'; save(); log(id, 'approved; merging and deploying');
  try {
    if (git(ROOT, 'status', '--porcelain').split('\n').some(l => l && !l.startsWith('??'))) throw new Error('main checkout has uncommitted changes; commit or stash them first');
    git(ROOT, 'checkout', '-q', 'main'); git(ROOT, 'pull', '-q', '--ff-only', 'origin', 'main');
    git(ROOT, 'merge', '--no-ff', '-q', '-m', `Merge ${s.branch}: ${s.fix.cause || ''} (dev agent, reviewed by Astra + Claude, Jev ${s.reviews.jev.probability.toFixed(2)})\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, s.branch);
    git(ROOT, 'push', '-q', 'origin', 'main');
    const commit = git(ROOT, 'rev-parse', '--short', 'HEAD');
    const touchesNetwork = s.files.some(f => /^(network\/|docs\/|package(-lock)?\.json$|railway\.json$)/.test(f));
    let deployed = 'pushed (driver update reaches users through the console banner)';
    if (touchesNetwork || s.fix.deploy === 'network' || s.fix.deploy === 'both') { sh('railway', ['up', '--detach'], { cwd: ROOT }); deployed = 'pushed + railway up'; }
    sh('git', ['-C', ROOT, 'worktree', 'remove', '--force', s.worktree], { ok: true }); sh('git', ['-C', ROOT, 'branch', '-d', s.branch], { ok: true });
    s.stage = 'deployed'; s.commit = commit; save();
    await note(id, 'fixed', `deployed ${commit} (${deployed})`);
    if (s.email && s.fix.customer_note) { await api(`/api/admin/tickets/${id}/reply`, { method: 'POST', body: JSON.stringify({ text: s.fix.customer_note }) }).then(() => log(id, 'reporter emailed')).catch(e => log(id, 'reply failed: ' + e.message)); }
    notify.sendText(`Print@ dev agent · ticket #${id} deployed as ${commit} (${deployed}).${s.email ? ' Reporter emailed.' : ''}`);
  } catch (e) { s.stage = 'error'; s.error = e.message; save(); log(id, 'DEPLOY ERROR ' + e.message); notify.sendText(`Print@ dev agent · ticket #${id} deploy FAILED: ${e.message.slice(0, 300)}`); }
}

async function reject(id) {
  const s = state.tickets[id]; if (!s) throw new Error('unknown ticket');
  sh('git', ['-C', ROOT, 'worktree', 'remove', '--force', s.worktree], { ok: true }); sh('git', ['-C', ROOT, 'branch', '-D', s.branch], { ok: true });
  s.stage = 'rejected'; save(); log(id, 'rejected by maintainer');
  await note(id, 'needs-human', 'maintainer rejected the dev agent fix');
  notify.sendText(`Print@ dev agent · ticket #${id} dropped; branch removed.`);
}

async function checkReplies() {
  const waiting = Object.entries(state.tickets).filter(([, s]) => s.stage === 'awaiting-approval');
  if (!waiting.length) return;
  const since = Math.min(...waiting.map(([, s]) => s.textedAt));
  let replies; try { replies = notify.repliesSince(since); } catch (e) { log(0, e.message); return; }
  for (const r of replies) {
    const m = r.text.match(/^\s*(yes|y|ship|deploy|go|no|n|drop|reject)\b[\s#:]*(\d+)?/i); if (!m) continue;
    const yes = /^(yes|y|ship|deploy|go)$/i.test(m[1]);
    const id = m[2] ? Number(m[2]) : (waiting.length === 1 ? Number(waiting[0][0]) : null);
    if (!id || !state.tickets[id] || state.tickets[id].stage !== 'awaiting-approval' || r.at < state.tickets[id].textedAt) continue;
    if (yes) await deploy(id); else await reject(id);
  }
}

async function once() {
  const open = (await api('/api/admin/tickets?status=open')).tickets || [];
  for (const t of open) if (!state.tickets[t.id]) await handle(t);
  await checkReplies();
}

(async () => {
  const [mode, arg] = process.argv.slice(2);
  if (mode === 'approve') return deploy(Number(arg));
  if (mode === 'reject') return reject(Number(arg));
  if (mode === 'status') return console.log(JSON.stringify(state, null, 2));
  if (mode === 'watch') {
    log(0, 'watching ' + BASE);
    for (;;) { try { await once(); } catch (e) { log(0, 'cycle error: ' + e.message); } for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 60000)); try { await checkReplies(); } catch (e) { log(0, e.message); } } }
  }
  await once();
})().catch(e => { console.error(e.message); process.exit(1); });
