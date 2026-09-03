'use strict';
// One window per job. The agent pushes state over SSE; the panel posts actions back.
// Falls back to AppleScript dialogs (ui.js) when the panel binary is missing.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, log } = require('./config');
const ui = require('./ui');

const PANEL_BIN = path.join(ROOT, 'helper', 'panel', 'PrintAt.app', 'Contents', 'MacOS', 'PrintAtPanel');
const registry = new Map();

class PanelUX {
  constructor(job, cfg) {
    this.job = job; this.cfg = cfg;
    this.state = { phase: 'status', title: job.title, status: '', detail: '', log: [], location: null, ranked: [], fromMemory: false, note: '', alternates: 0, result: '', actions: [] };
    this.subs = new Set();
    this.pending = null;
    this.closed = false;
    this.proc = null;
    registry.set(job.id, this);
  }
  launch() {
    if (this.proc) return;
    this.proc = spawn(PANEL_BIN, [this.job.id, String(this.cfg.port)], { stdio: 'ignore' });
    this.proc.on('error', e => log(`panel failed to start: ${e.message}`));
    this.proc.on('exit', () => { this.proc = null; if (!this.closed) this.action({ action: 'cancel', reason: 'window closed' }); });
  }
  push(patch) {
    Object.assign(this.state, patch);
    const line = `data: ${JSON.stringify(this.state)}\n\n`;
    for (const res of this.subs) res.write(line);
  }
  subscribe(res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(this.state)}\n\n`);
    this.subs.add(res);
    res.on('close', () => this.subs.delete(res));
  }
  wait(patch) {
    this.launch();
    this.push(patch);
    return new Promise(resolve => { this.pending = resolve; });
  }
  action(a) {
    const p = this.pending; this.pending = null;
    if (p) p(a); else log(`panel action with nothing pending: ${JSON.stringify(a)}`);
  }
  status(msg) { this.launch(); this.push({ phase: 'status', status: msg, detail: '', log: [...this.state.log, msg].slice(-8) }); }
  detail(msg) { this.push({ detail: msg, log: [...this.state.log, msg].slice(-8) }); }
  async confirmLocation(loc) {
    const a = await this.wait({ phase: 'confirm_location', location: { address: loc.address || `${loc.lat}, ${loc.lon}`, source: loc.source } });
    return a;   // {action: use|address|cancel, value}
  }
  async pick(ranked, fromMemory, note = '', alternates = 0) {
    const a = await this.wait({ phase: 'pick', fromMemory, ranked, note, alternates });
    return a;   // {action: choose|search|alternates|cancel, value: id}
  }
  async result(text, actions) {
    const a = await this.wait({ phase: 'result', result: text, actions });
    return a.action;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.push({ phase: 'closed' });
    for (const res of this.subs) { try { res.end(); } catch {} }
    this.subs.clear();
    registry.delete(this.job.id);
    if (this.proc) setTimeout(() => { try { this.proc && this.proc.kill(); } catch {} }, 800);
  }
}

// AppleScript fallback with the same interface.
class DialogUX {
  constructor(job, cfg) { this.job = job; this.cfg = cfg; }
  status() {}
  detail() {}
  async confirmLocation(loc) {
    const btn = await ui.dialog(`Search for a print shop near:\n\n${loc.address}\nSource: ${loc.source}`, ['Cancel', 'Enter an address…', 'Use this location'], 'Use this location');
    if (btn === 'Use this location') return { action: 'use' };
    if (btn === 'Enter an address…') { const v = await ui.prompt('Street address, intersection, or place name:', loc.address || ''); return v ? { action: 'address', value: v } : { action: 'cancel' }; }
    return { action: 'cancel' };
  }
  async pick(ranked, fromMemory, note = '', alternates = 0) {
    let idx = 0;
    for (;;) {
      const r = ranked[idx];
      const btn = await ui.dialog(`${fromMemory ? 'Last time from here you used:' : 'Best match:'}\n\n${r.name}\n${r.address}\n${r.summary}\n\n${r.why}\n\n${r.method}`,
        ['Cancel', fromMemory ? 'Search again' : 'Other shops…', r.primary], r.primary);
      if (!btn || btn === 'Cancel') return { action: 'cancel' };
      if (btn === 'Search again') return { action: 'search' };
      if (btn === r.primary) return { action: 'choose', value: r.id };
      const labels = ranked.map((x, i) => `${i + 1}. ${x.name} — ${x.summary}`);
      const chosen = await ui.chooseFrom(labels, 'Every shop found, best first:');
      if (chosen) idx = labels.indexOf(chosen);
    }
  }
  async result(text, actions) {
    const btn = await ui.dialog(text, actions.slice(0, 3).map(a => a.label), actions.find(a => a.key === 'done')?.label);
    return (actions.find(a => a.label === btn) || { key: 'done' }).key;
  }
  close() {}
}

function panelAvailable() { try { fs.accessSync(PANEL_BIN, fs.constants.X_OK); return true; } catch { return false; } }
function createUX(job, cfg) { return panelAvailable() ? new PanelUX(job, cfg) : new DialogUX(job, cfg); }
function get(id) { return registry.get(id); }

module.exports = { createUX, get, PanelUX, DialogUX };
