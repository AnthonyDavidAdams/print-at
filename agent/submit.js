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

// "Print@ Staples, Eureka": display label plus a CUPS-safe queue name.
function printerNames(pick) {
  const short = pick.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/#\d+/g, '').replace(/\s+/g, ' ').trim();
  const parts = (pick.address || '').split(',').map(x => x.trim());
  const city = parts.length >= 3 ? parts[parts.length - 3] : '';
  const label = `Print@ ${short}${city ? ', ' + city : ''}`;
  const queue = ('PrintAt_' + `${short}${city ? '_' + city : ''}`.replace(/[^A-Za-z0-9]+/g, '_')).replace(/_+$/, '').slice(0, 60);
  return { short, city, label, queue };
}

// Create a CUPS queue pinned to this shop. Works without sudo for admin users.
// Defaults for the queue mirror the job that created it; location confirmation is off.
function addPrinter(pick, spec) {
  const { ROOT } = require('./config');
  const { short, label, queue } = printerNames(pick);
  const uri = `nearprint://localhost/?shop=${encodeURIComponent(short)}`;
  const args = ['-p', queue, '-E', '-v', uri, '-P', path.join(ROOT, 'ppd', 'NearPrint.ppd'), '-D', label,
    '-L', pick.address || '', '-o', 'printer-is-shared=false', '-o', 'printer-error-policy=retry-job',
    '-o', 'ConfirmLocation=No', '-o', `Priority=${spec.priority}`, '-o', `Delivery=${spec.delivery === 'FindOnly' ? 'Confirm' : spec.delivery}`];
  const r = spawnSync('/usr/sbin/lpadmin', args, { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) throw new Error(`lpadmin: ${(r.stderr || r.stdout).trim()}`);
  return { queue, label };
}

module.exports = { sendEmail, openPortal, openMaps, revealPdf, addPrinter, printerNames };
