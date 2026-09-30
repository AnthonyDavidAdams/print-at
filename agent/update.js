'use strict';
// Tells the user when a newer driver is available. The driver is a git checkout, so
// "latest" is the tip of main on GitHub (asked via printat.co, which caches it). Checked
// shortly after the agent starts and then daily; one notification per new version.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ROOT, APP_DIR, log } = require('./config');
const ui = require('./ui');

const STATE = path.join(APP_DIR, 'update.json');
const state = (() => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } })();

function local() {
  try {
    const commit = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const date = Number(execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%ct'], { encoding: 'utf8' }).trim()) * 1000;
    return { commit, date };
  } catch { return null; }
}

async function check(cfg) {
  const me = local(); if (!me) return null; // not a git checkout: nothing to compare
  try {
    const base = (cfg.cloudBase || 'https://printat.co').replace(/\/+$/, '');
    const r = await fetch(`${base}/api/driver/latest`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const latest = await r.json();
    const available = !!latest.commit && latest.commit !== me.commit && (latest.date || 0) > me.date;
    Object.assign(state, { checkedAt: Date.now(), local: me.commit, latest: latest.commit, latestDate: latest.date, latestMessage: latest.message || '', available });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    if (available && state.notified !== latest.commit) {
      state.notified = latest.commit; fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
      ui.notify('Print@ update available', 'Run "printat update" in Terminal to get it.');
      log(`update available: ${latest.commit.slice(0, 7)} (${latest.message || ''}); local ${me.commit.slice(0, 7)}`);
    }
    return state;
  } catch (e) { log(`update check failed: ${e.message}`); return null; }
}

function schedule(cfg) {
  setTimeout(() => check(cfg), 30000).unref();
  setInterval(() => check(cfg), 24 * 3600e3).unref();
}

function status() { return { available: !!state.available, local: (state.local || '').slice(0, 7), latest: (state.latest || '').slice(0, 7), message: state.latestMessage || '', checkedAt: state.checkedAt || 0 }; }

module.exports = { check, schedule, status, local };
