'use strict';
// The "brain" behind ranking: a model with web search that returns the ranking JSON.
// Pluggable so users bring their own: Claude Code on the Mac (Max plan, no key), an
// Anthropic API key, an OpenAI API key, or none (distance + known addresses only).
// The prompt and schema are shared; only the transport differs.
const { spawnSync } = require('child_process');
const os = require('os');
const { log } = require('./config');

const ANTHROPIC_MODEL = 'claude-opus-5';
const OPENAI_MODEL = 'gpt-5';

function hasClaudeCli() {
  const env = { ...process.env, PATH: `${os.homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}` };
  const r = spawnSync('claude', ['--version'], { env, encoding: 'utf8', timeout: 8000 });
  return r.status === 0;
}

// Which provider this driver will use. 'auto' prefers Claude Code, then a key, then none.
function choose(cfg) {
  const want = (cfg.research || 'auto').toLowerCase();
  if (want === 'claude-code' || want === 'anthropic' || want === 'openai' || want === 'none') return want;
  if (cfg.anthropicApiKey) return 'anthropic';
  if (cfg.openaiApiKey) return 'openai';
  if (hasClaudeCli()) return 'claude-code';
  return 'none';
}

// Structured-output schemas must close every object and avoid type unions.
function strictify(node) {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = (k === 'enum' || k === 'required') ? v : strictify(v);
  if (Array.isArray(out.type)) { const types = out.type; delete out.type; out.anyOf = types.map(t => ({ type: t })); }
  if (out.type === 'object') { out.additionalProperties = false; if (out.properties && !out.required) out.required = Object.keys(out.properties); }
  return out;
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ---- Anthropic Messages API: web search tool + JSON schema output, raw fetch (no SDK dep).
async function runAnthropic(prompt, schema, cfg, onEvent) {
  const key = cfg.anthropicApiKey; if (!key) throw new Error('no Anthropic API key configured');
  const model = cfg.researchModel || ANTHROPIC_MODEL;
  const messages = [{ role: 'user', content: prompt }];
  let lookups = 0;
  for (let turn = 0; turn < 6; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 16000,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 12 }],
        output_config: { format: { type: 'json_schema', schema: strictify(schema) } },
        messages,
      }),
      signal: AbortSignal.timeout((cfg.claudeTimeoutSec || 540) * 1000),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(j.error && j.error.message) || JSON.stringify(j).slice(0, 200)}`);
    for (const b of j.content || []) {
      if (b.type === 'server_tool_use') { lookups++; const q = b.input && (b.input.query || b.input.url); if (q) onEvent(b.name === 'web_fetch' ? `Reading ${q}` : `Searching the web: ${q}`); }
    }
    if (j.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: j.content }); continue; }
    if (j.stop_reason === 'refusal') throw new Error('anthropic refused the request');
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const data = parseJsonLoose(text);
    if (!data || !Array.isArray(data.ranked)) throw new Error('anthropic returned no ranking');
    onEvent(`Ranking ${lookups} lookups into a shortlist`);
    const u = j.usage || {};
    log(`anthropic ranking done: ${model}, in ${u.input_tokens || 0} / out ${u.output_tokens || 0} tokens, ${lookups} lookups`);
    return data;
  }
  throw new Error('anthropic: too many continuation turns');
}

// ---- OpenAI Responses API: built-in web search + JSON schema output.
async function runOpenAI(prompt, schema, cfg, onEvent) {
  const key = cfg.openaiApiKey; if (!key) throw new Error('no OpenAI API key configured');
  const model = cfg.researchModel || OPENAI_MODEL;
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, input: prompt,
      tools: [{ type: 'web_search' }],
      text: { format: { type: 'json_schema', name: 'ranking', schema: strictify(schema), strict: false } },
    }),
    signal: AbortSignal.timeout((cfg.claudeTimeoutSec || 540) * 1000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`openai ${res.status}: ${(j.error && j.error.message) || JSON.stringify(j).slice(0, 200)}`);
  let lookups = 0, text = '';
  for (const item of j.output || []) {
    if (item.type === 'web_search_call') { lookups++; const q = item.action && item.action.query; onEvent(q ? `Searching the web: ${q}` : 'Searching the web'); }
    if (item.type === 'message') for (const c of item.content || []) if (c.type === 'output_text') text += c.text;
  }
  const data = parseJsonLoose(text);
  if (!data || !Array.isArray(data.ranked)) throw new Error('openai returned no ranking');
  onEvent(`Ranking ${lookups} lookups into a shortlist`);
  const u = j.usage || {};
  log(`openai ranking done: ${model}, in ${u.input_tokens || 0} / out ${u.output_tokens || 0} tokens, ${lookups} lookups`);
  return data;
}

module.exports = { choose, runAnthropic, runOpenAI, strictify, hasClaudeCli, ANTHROPIC_MODEL, OPENAI_MODEL };
