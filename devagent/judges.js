'use strict';
// The three judges a fix has to pass before a human sees it:
//   1. Astra (openai/gpt-6-astra via OpenRouter): an outside frontier reviewer, ~$1/review.
//   2. Claude Code (`claude -p`, Max plan): a second frontier reviewer, reads the worktree.
//   3. Jev (typesafe/jev-1.13 decisions): probability the change addresses what the user reported.
const { spawnSync } = require('child_process');

const KEY = () => process.env.OPENROUTER_API_KEY || '';
const ASTRA = process.env.DEVAGENT_ASTRA_MODEL || 'openai/gpt-6-astra';
const JEV = 'typesafe/jev-1.13';

const RUBRIC = `Judge an automated code change made in response to a user bug report for Print@ (a macOS virtual printer: CUPS backend + Node agent in agent/, bin/, backend/, install.sh; a hosted Node server network/server.js at printat.co; landing site docs/).
Decide: (1) does the change fix the reported problem at its root, not just the symptom; (2) could it break the installer, printing, dispatch, the hosted server or other users; (3) security: secrets, injection, auth, paths; (4) is the regression test real and would it have caught the bug; (5) is the customer note accurate.
Reply with ONLY a JSON object, no prose: {"approve": true|false, "risk": "low"|"medium"|"high", "summary": "one sentence", "concerns": ["..."], "must_fix": ["..."]}. approve=false when any must_fix exists.`;

function parseJSON(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in review: ' + String(text).slice(0, 200));
  const j = JSON.parse(m[0]);
  return { approve: !!j.approve, risk: j.risk || 'medium', summary: String(j.summary || '').slice(0, 400), concerns: (j.concerns || []).map(String).slice(0, 8), must_fix: (j.must_fix || []).map(String).slice(0, 8) };
}

// packet: { ticket: string, fixmd: string, diff: string, tests: string }
function packetText(p) {
  return `## Ticket\n${p.ticket}\n\n## FIX.md (written by the fixing agent)\n${p.fixmd}\n\n## Test run\n${p.tests.slice(-3000)}\n\n## Diff (origin/main...HEAD)\n${p.diff.slice(0, 60000)}${p.diff.length > 60000 ? '\n...(truncated)' : ''}`;
}

async function astra(packet) {
  if (!KEY()) throw new Error('OPENROUTER_API_KEY missing');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { authorization: `Bearer ${KEY()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: ASTRA, messages: [{ role: 'system', content: RUBRIC }, { role: 'user', content: packetText(packet) }], temperature: 0.1, max_tokens: 1500, usage: { include: true } }),
    signal: AbortSignal.timeout(240000),
  });
  const j = await r.json();
  if (!r.ok || !j.choices) throw new Error('astra: ' + JSON.stringify(j).slice(0, 300));
  const out = parseJSON(j.choices[0].message.content); out.cost = (j.usage && j.usage.cost) || 0; out.model = ASTRA;
  return out;
}

function claudeReview(worktree, packet) {
  const prompt = `${RUBRIC}\n\nYou are in the git worktree with the change checked out. Read FIX.md, run \`git diff origin/main...HEAD\`, open any file you need, and run ./test/run.sh yourself if you doubt the test output below.\n\n${packetText({ ...packet, diff: packet.diff.slice(0, 20000) })}`;
  const r = spawnSync('claude', ['-p', prompt, '--output-format', 'json', '--max-turns', '25', '--allowedTools', 'Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(./test/run.sh)', 'Bash(node --check:*)'],
    { cwd: worktree, encoding: 'utf8', timeout: 15 * 60000, maxBuffer: 50e6, env: { ...process.env, CLAUDECODE: '' } });
  if (r.status !== 0) throw new Error('claude review failed: ' + (r.stderr || r.stdout || '').slice(-400));
  let text = r.stdout; try { const j = JSON.parse(r.stdout); text = j.result || text; } catch {}
  const out = parseJSON(text); out.model = 'claude-code'; return out;
}

async function jevScore(packet) {
  if (!KEY()) throw new Error('OPENROUTER_API_KEY missing');
  const state = { user_report: packet.ticket.slice(0, 6000), developer_fix_description: packet.fixmd.slice(0, 4000), diff: packet.diff.slice(0, 20000), test_output: packet.tests.slice(-1500) };
  const questions = { resolves: { type: 'noul', instructions: 'Given a user bug report and a developer\'s code change (description + diff), does the change resolve what the user reported? It holds when the diff changes the code path the report describes, in a way that would make the reported symptom stop, and the tests exercise it.' } };
  const r = await fetch('https://openrouter.ai/api/alpha/decisions', { method: 'POST', headers: { authorization: `Bearer ${KEY()}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: JEV, state, questions }), signal: AbortSignal.timeout(30000) });
  const j = await r.json();
  if (!r.ok || !j.answers) throw new Error('jev: ' + JSON.stringify(j).slice(0, 200));
  const a = j.answers.resolves; const p = typeof a === 'number' ? a : (a && (a.noul ?? a.probability ?? a.confidence)); // noul answers look like { type: 'noul', noul: 0.68 }
  return { probability: Number(p) || 0, cost: (j.usage && j.usage.cost) || 0, raw: a };
}

module.exports = { astra, claudeReview, jevScore, RUBRIC };
