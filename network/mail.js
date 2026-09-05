'use strict';
// Email sender. On a host that blocks SMTP (Railway) uses the Gmail API over HTTPS
// (GOOGLE_* env). Locally falls back to SMTP via agent/send_email.py.
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const FROM = process.env.PRINTAT_FROM || process.env.SMTP_USER || 'anthony@175g.com';
const FROM_NAME = process.env.PRINTAT_FROM_NAME || 'Print@ Network';

async function gmailApi(to, subject, text) {
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }).then(r => r.json());
  if (!tok.access_token) throw new Error('gmail token: ' + JSON.stringify(tok).slice(0, 120));
  const mime = [`From: ${FROM_NAME} <${FROM}>`, `To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=UTF-8', '', text].join('\r\n');
  const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error('gmail send ' + res.status + ' ' + (await res.text()).slice(0, 120));
  return true;
}

function smtp(to, subject, text) {
  const fs = require('fs');
  const bf = path.join(os.tmpdir(), 'netmail-' + Date.now() + '.txt'); fs.writeFileSync(bf, text);
  const r = spawnSync('python3', [path.join(__dirname, '..', 'agent', 'send_email.py'),
    '--to', to, '--subject', subject, '--body-file', bf, '--from', FROM, '--from-name', FROM_NAME,
    '--env', process.env.GMAIL_ENV || path.join(os.homedir(), '.gmail.env')], { encoding: 'utf8', timeout: 60000 });
  try { fs.unlinkSync(bf); } catch {}
  return r.status === 0;
}

module.exports = function send(to, subject, text) {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    return gmailApi(to, subject, text).catch(e => { console.error('mail(gmail):', e.message); return false; });
  }
  try { return smtp(to, subject, text); } catch (e) { console.error('mail(smtp):', e.message); return false; }
};
