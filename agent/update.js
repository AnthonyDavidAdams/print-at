'use strict';
// Tells the user when a newer driver is available. The driver is a git checkout, so
// "latest" is the tip of main on GitHub (asked via printat.co, which caches it). Checked
// shortly after the agent starts and then daily; one notification per new version.
const { execFileSync, spawnSync } = require('child_process');
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

// Files whose change needs the sudo installer (CUPS backend, helpers, PPD); everything
// else only needs the agent restarted.
const NEEDS_INSTALL = /^(backend\/|helper\/|install\.sh$|printat\.ppd$|printat-add$|icon\/)/;
let applying = null;

// Pull the latest driver. Resolves { ok, from, to, message, needsInstall, upToDate }.
function apply() {
  if (applying) return applying;
  applying = (async () => {
    const me = local(); if (!me) throw new Error('not a git checkout');
    let branch = 'main'; try { branch = execFileSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim() || 'main'; } catch {}
    const r = spawnSync('git', ['-C', ROOT, 'pull', '--ff-only', '--quiet', 'origin', branch], { encoding: 'utf8', timeout: 120000 });
    if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'git pull failed').trim().split('\n').pop());
    const now = local();
    if (now.commit === me.commit) { Object.assign(state, { available: false, local: now.commit }); fs.writeFileSync(STATE, JSON.stringify(state, null, 2)); return { ok: true, upToDate: true, to: now.commit.slice(0, 7) }; }
    const changed = execFileSync('git', ['-C', ROOT, 'diff', '--name-only', `${me.commit}..${now.commit}`], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const message = execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
    const needsInstall = changed.some(f => NEEDS_INSTALL.test(f));
    Object.assign(state, { available: false, local: now.commit, latest: now.commit, latestDate: now.date, latestMessage: message, notified: now.commit });
    fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
    log(`updated ${me.commit.slice(0, 7)} -> ${now.commit.slice(0, 7)} (${changed.length} files${needsInstall ? ', installer needed' : ''})`);
    return { ok: true, from: me.commit.slice(0, 7), to: now.commit.slice(0, 7), message, files: changed.length, needsInstall };
  })().finally(() => { applying = null; });
  return applying;
}

// Restart the LaunchAgent after the response has gone out.
function restart() {
  setTimeout(() => {
    log('restarting for update');
    spawnSync('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/io.printat.agent`], { timeout: 10000 });
    setTimeout(() => process.exit(0), 2000); // kickstart didn't reach us (run by hand): exit and let whatever runs us restart
  }, 600).unref();
}

// Open Terminal running "printat update" for the sudo part of an update.
function openTerminal() {
  const cmd = `${ROOT.replace(/'/g, "'\\''")}/bin/printat update`;
  spawnSync('osascript', ['-', cmd], { input: 'on run argv\n tell application "Terminal"\n activate\n do script (item 1 of argv)\n end tell\nend run', timeout: 10000 });
}

module.exports = { check, schedule, status, local, apply, restart, openTerminal };
