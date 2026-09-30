'use strict';
// `printat bug "what happened" [--screenshot file] [--email you@x]` and the console's
// "Report a problem" form. Bundles the description with diagnostics that make the report
// actionable (versions, config minus secrets, the last log lines, the last receipt) and
// sends it to printat.co, which answers with a known fix when it recognizes the problem.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const cfgmod = require('./config');
const cloud = require('./cloud');

function sh(cmd, args) { try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 8000 }).trim(); } catch { return ''; } }

function diagnostics(cfg) {
  const safe = { ...cfg }; for (const k of Object.keys(safe)) if (/key|token|password/i.test(k)) safe[k] = safe[k] ? '(set)' : '';
  delete safe.dryRun; delete safe.skipClaude; delete safe.homeAddress; delete safe.contactPhone;
  const redact = t => String(t || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>').replace(/\(?\b[2-9]\d{2}\)?[-. ]\d{3}[-. ]\d{4}\b/g, '<phone>');
  const logFile = path.join(cfgmod.LOG_DIR, 'agent.log');
  let logTail = ''; try { const l = fs.readFileSync(logFile, 'utf8').trim().split('\n'); logTail = l.slice(-80).join('\n'); } catch {}
  let receipt = ''; try { const jobs = fs.readdirSync(cfgmod.JOBS_DIR).sort().reverse(); for (const j of jobs) { const r = path.join(cfgmod.JOBS_DIR, j, 'receipt.md'); if (fs.existsSync(r)) { receipt = fs.readFileSync(r, 'utf8').slice(0, 4000); break; } } } catch {}
  return {
    macos: sh('sw_vers', ['-productVersion']), node: process.version, arch: os.arch(),
    driver: sh('git', ['-C', cfgmod.ROOT, 'rev-parse', '--short', 'HEAD']), root: cfgmod.ROOT,
    claude_cli: sh('claude', ['--version']) || '(not found)',
    printers: sh('lpstat', ['-p']), backend: fs.existsSync('/usr/libexec/cups/backend/printat') ? 'installed' : 'MISSING',
    agent: (() => { try { return sh('curl', ['-s', '-m', '3', `http://127.0.0.1:${cfg.port}/health`]) || '(no answer)'; } catch { return '(no answer)'; } })(),
    connected: cloud.connected(cfg), config: safe, log_tail: redact(logTail), last_receipt: redact(receipt),
  };
}

async function send({ description, email, screenshotPath, cfg }) {
  cfg = cfg || cfgmod.load();
  const body = { description, email: email || cfg.cloudEmail || cfg.contactEmail || '', source: 'driver', diagnostics: diagnostics(cfg) };
  if (screenshotPath) { const p = screenshotPath.replace(/^~/, os.homedir()); body.screenshot = { name: path.basename(p), b64: fs.readFileSync(p).toString('base64') }; }
  const headers = { 'content-type': 'application/json' }; if (cfg.cloudToken) headers.authorization = `Bearer ${cfg.cloudToken}`;
  const r = await fetch(`${cloud.base(cfg)}/api/bugs`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

if (require.main === module) {
  const args = process.argv.slice(2); let screenshotPath = '', email = ''; const words = [];
  for (let i = 0; i < args.length; i++) { if (args[i] === '--screenshot') screenshotPath = args[++i]; else if (args[i] === '--email') email = args[++i]; else words.push(args[i]); }
  const description = words.join(' ').trim();
  if (!description) { console.log('Usage: printat bug "what happened" [--screenshot ~/Desktop/shot.png] [--email you@example.com]\nSends the description plus diagnostics (versions, config without secrets, last log lines, last receipt) to Print@ support.'); process.exit(1); }
  send({ description, email, screenshotPath }).then(r => {
    console.log(`\nSent — ticket #${r.id}.`);
    if (r.answer) console.log(`\nThis looks like a known problem: ${r.title}\n\n${r.answer}\n\nThe same fix was emailed to you. If it doesn't help, reply to that email.`);
    else console.log('A person will reply by email.');
  }).catch(e => { console.error('Could not send the report:', e.message); console.error('Email it instead: print@printat.co'); process.exit(1); });
}

module.exports = { send, diagnostics };
