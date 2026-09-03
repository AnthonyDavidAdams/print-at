'use strict';
const { spawnSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { log } = require('./config');

function sendEmail({ to, cc, subject, body, attachment, cfg }) {
  const bodyFile = attachment + '.email.txt';
  fs.writeFileSync(bodyFile, body);
  const args = [path.join(__dirname, 'send_email.py'), '--to', to, '--subject', subject, '--body-file', bodyFile,
    '--attach', attachment, '--from-name', cfg.contactName, '--from', cfg.smtpUser, '--env', cfg.gmailEnv,
    '--host', cfg.smtpHost, '--port', String(cfg.smtpPort)];
  if (cc) args.push('--cc', cc);
  const r = spawnSync('python3', args, { encoding: 'utf8', timeout: 90000 });
  if (r.status !== 0) throw new Error(`send_email failed: ${(r.stderr || r.stdout).trim().slice(-400)}`);
  return r.stdout.trim();
}

function openPortal(url, pdfPath) {
  try { execFileSync('open', [url]); } catch (e) { log(`open url failed: ${e.message}`); }
  try { execFileSync('open', ['-R', pdfPath]); } catch {}
  try { spawnSync('pbcopy', { input: pdfPath }); } catch {}
}

function openMaps(pick) {
  const q = encodeURIComponent(pick.name);
  const url = pick.lat ? `https://maps.apple.com/?q=${q}&ll=${pick.lat},${pick.lon}` : `https://maps.apple.com/?q=${q}`;
  try { execFileSync('open', [url]); } catch {}
}

function revealPdf(pdfPath) {
  try { execFileSync('open', ['-R', pdfPath]); } catch {}
}

module.exports = { sendEmail, openPortal, openMaps, revealPdf };
