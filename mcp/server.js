#!/usr/bin/env node
'use strict';
// Print@ MCP server — lets an AI agent find nearby print shops, send a document to one,
// and get the pickup code + status. Dependency-free JSON-RPC 2.0 over stdio (MCP).
// Talks to the Print@ cloud (print.earthpilot.ai) so it works from anywhere.
const fs = require('fs');

const BASE = process.env.PRINTAT_BASE || 'https://print.earthpilot.ai';
const NAME = 'print-at';
const VERSION = '1.0.0';

async function api(pathname, opts) {
  const r = await fetch(BASE + pathname, opts);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
async function loadFile(a) {
  if (a.file_base64) return { b64: a.file_base64, name: a.filename || 'document.pdf' };
  if (a.file_path) return { b64: fs.readFileSync(a.file_path).toString('base64'), name: a.filename || require('path').basename(a.file_path) };
  if (a.file_url) { const r = await fetch(a.file_url); const b = Buffer.from(await r.arrayBuffer()); return { b64: b.toString('base64'), name: a.filename || a.file_url.split('/').pop() || 'document.pdf' }; }
  throw new Error('provide file_path, file_url, or file_base64');
}

const TOOLS = [
  { name: 'find_print_shops',
    description: 'Find Print@ Network print shops near a location. Returns shops with name, address, distance, hours, prices and rating. Use before send_print_job to pick a shop_id.',
    inputSchema: { type: 'object', required: ['lat', 'lon'], properties: {
      lat: { type: 'number', description: 'Latitude' }, lon: { type: 'number', description: 'Longitude' },
      radius_mi: { type: 'number', description: 'Search radius in miles (default 25)' } } } },
  { name: 'send_print_job',
    description: 'Send a document to a specific Print@ Network shop for the person to pick up. Returns a 6-digit pickup code. Provide the file as file_path, file_url, or file_base64.',
    inputSchema: { type: 'object', required: ['shop_id'], properties: {
      shop_id: { type: 'integer', description: 'Shop id from find_print_shops' },
      file_path: { type: 'string' }, file_url: { type: 'string' }, file_base64: { type: 'string' },
      filename: { type: 'string' }, copies: { type: 'integer', description: 'default 1' },
      color: { type: 'string', enum: ['bw', 'color'], description: 'default bw' },
      name: { type: 'string', description: 'pickup name' }, email: { type: 'string', description: 'where the code is copied' } } } },
  { name: 'get_job_status',
    description: 'Check a print job by its pickup code: which shop, the files, and whether it is queued, in progress, or done.',
    inputSchema: { type: 'object', required: ['code'], properties: { code: { type: 'string', description: '6-digit pickup code' } } } },
];

async function call(name, a) {
  if (name === 'find_print_shops') {
    const d = await api('/api/shops-nearby', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat: a.lat, lon: a.lon, radiusMi: a.radius_mi || 25 }) });
    if (!d.shops || !d.shops.length) return `No Print@ Network shops within ${a.radius_mi || 25} miles.`;
    return d.shops.map(s => `#${s.id} ${s.name} — ${s.distance_mi} mi — ${s.address}${s.hours ? ' — ' + s.hours : ''}${s.stars ? ' — ' + s.stars + '★' : ''} — B&W ${s.price_bw || '?'} / color ${s.price_color || '?'}`).join('\n');
  }
  if (name === 'send_print_job') {
    const f = await loadFile(a);
    const d = await api('/api/send', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shop_id: a.shop_id, name: a.name || 'Agent', email: a.email || '', color: a.color || 'bw', items: [{ filename: f.name, fileB64: f.b64, copies: a.copies || 1, color: a.color || 'bw' }] }) });
    return `Sent to shop #${a.shop_id}. Pickup code: ${d.pickup_code}. Show this code at the counter to collect.`;
  }
  if (name === 'get_job_status') {
    const d = await api('/api/status?code=' + encodeURIComponent(a.code));
    return `Code ${d.pickup_code} at ${d.shop} (${d.address}) — ${d.status}. Files:\n` + d.files.map(fl => `  ${fl.filename} ×${fl.copies} ${fl.color ? 'color' : 'B&W'} — ${fl.status}`).join('\n');
  }
  throw new Error('unknown tool ' + name);
}

// ---- MCP JSON-RPC over stdio ----
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
async function handle(m) {
  if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: NAME, version: VERSION } } });
  if (m.method === 'notifications/initialized') return;
  if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } });
  if (m.method === 'tools/call') {
    try { const text = await call(m.params.name, m.params.arguments || {}); send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text }] } }); }
    catch (e) { send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true } }); }
    return;
  }
  if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'method not found' } });
}
let buf = '';
process.stdin.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) { try { handle(JSON.parse(line)); } catch {} } } });
process.stdin.resume();
