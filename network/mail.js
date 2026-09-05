'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const SENDER = process.env.PRINTAT_FROM || process.env.SMTP_USER || '';
const GMAIL_ENV = process.env.GMAIL_ENV || path.join(os.homedir(), '.gmail.env');
module.exports = function send(to, subject, body) {
  const fs = require('fs');
  const bf = path.join(os.tmpdir(), 'netmail-' + Date.now() + '.txt'); fs.writeFileSync(bf, body);
  const r = spawnSync('python3', [path.join(__dirname, '..', 'agent', 'send_email.py'),
    '--to', to, '--subject', subject, '--body-file', bf, '--attach', '/dev/null',
    '--from', SENDER, '--from-name', 'Print@ Network', '--env', GMAIL_ENV], { encoding: 'utf8', timeout: 60000 });
  try { fs.unlinkSync(bf); } catch {}
  return r.status === 0;
};
