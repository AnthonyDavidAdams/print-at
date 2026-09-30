'use strict';
// Email sender. On a host that blocks SMTP (Railway) uses the Gmail API over HTTPS
// (GOOGLE_* env). Locally falls back to SMTP via agent/send_email.py.
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

// Header hygiene: one address per field, no line breaks (header injection), bounded subject.
const hdr = v => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, 500);
const addr = v => { const a = hdr(v).trim(); return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(a) ? a : ''; };
const FROM = process.env.PRINTAT_FROM || process.env.SMTP_USER || 'anthony@175g.com';
const FROM_NAME = process.env.PRINTAT_FROM_NAME || 'Print@ Network';

async function gmailApi(to, subject, text) {
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }).then(r => r.json());
  if (!tok.access_token) throw new Error('gmail token: ' + JSON.stringify(tok).slice(0, 120));
  to = addr(to); if (!to) throw new Error('invalid recipient'); subject = hdr(subject);
  const mime = [`From: ${hdr(FROM_NAME)} <${FROM}>`, `To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=UTF-8', '', text].join('\r\n');
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

// Attachment-capable send (multipart/mixed) — used to relay a driver's PDF to a shop.
async function gmailApiAttach(to, cc, subject, text, att, replyTo) {
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }).then(r => r.json());
  if (!tok.access_token) throw new Error('gmail token: ' + JSON.stringify(tok).slice(0, 120));
  const bound = 'pa_' + Math.random().toString(36).slice(2);
  const b64 = att.buffer.toString('base64').replace(/(.{76})/g, '$1\r\n');
  to = addr(to); if (!to) throw new Error('invalid recipient'); cc = cc ? addr(cc) : ''; replyTo = replyTo ? addr(replyTo) : ''; subject = hdr(subject);
  const head = [`From: ${hdr(FROM_NAME)} <${FROM}>`, `To: ${to}`];
  if (cc) head.push(`Cc: ${cc}`);
  if (replyTo) head.push(`Reply-To: ${replyTo}`);
  head.push(`Subject: ${subject}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${bound}"`, '');
  const mime = head.join('\r\n') + '\r\n' + [
    `--${bound}`, 'Content-Type: text/plain; charset=UTF-8', '', text, '',
    `--${bound}`, `Content-Type: ${att.contentType || 'application/pdf'}; name="${att.filename}"`,
    'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${att.filename}"`, '', b64, '',
    `--${bound}--`, '',
  ].join('\r\n');
  const raw = Buffer.from(mime).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error('gmail send ' + res.status + ' ' + (await res.text()).slice(0, 120));
  return true;
}

function smtpAttach(to, cc, subject, text, att, replyTo) {
  const fs = require('fs');
  const bf = path.join(os.tmpdir(), 'netmail-' + Date.now() + '.txt'); fs.writeFileSync(bf, text);
  const af = path.join(os.tmpdir(), 'netmail-' + Date.now() + '-' + att.filename.replace(/[^\w.]+/g, '_')); fs.writeFileSync(af, att.buffer);
  const args = [path.join(__dirname, '..', 'agent', 'send_email.py'), '--to', to, '--subject', subject, '--body-file', bf,
    '--attach', af, '--from', FROM, '--from-name', FROM_NAME, '--env', process.env.GMAIL_ENV || path.join(os.homedir(), '.gmail.env')];
  if (cc) args.push('--cc', cc);
  if (replyTo) args.push('--reply-to', replyTo);
  const r = spawnSync('python3', args, { encoding: 'utf8', timeout: 90000 });
  try { fs.unlinkSync(bf); fs.unlinkSync(af); } catch {}
  return r.status === 0;
}

// Resend (https://resend.com) is the hosted network's sender: from print@printat.co, with
// Reply-To honored and attachments as base64. Gmail API / SMTP below stay as fallbacks for
// self-hosters who don't want a Resend account.
const RESEND = process.env.RESEND_API_KEY || '';
async function resendSend(to, cc, subject, text, att, replyTo) {
  to = addr(to); if (!to) throw new Error('invalid recipient'); cc = cc ? addr(cc) : ''; replyTo = replyTo ? addr(replyTo) : ''; subject = hdr(subject);
  const msg = { from: `${hdr(FROM_NAME)} <${FROM}>`, to: [to], subject, text };
  if (cc) msg.cc = [cc];
  if (replyTo) msg.reply_to = replyTo;
  if (att) msg.attachments = [{ filename: att.filename, content: att.buffer.toString('base64') }];
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error('resend ' + res.status + ' ' + (await res.text()).slice(0, 160));
  return true;
}

module.exports = function send(to, subject, text, replyTo) {
  if (RESEND) return resendSend(to, '', subject, text, null, replyTo || '').catch(e => { console.error('mail(resend):', e.message); return false; });
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    return gmailApi(to, subject, text).catch(e => { console.error('mail(gmail):', e.message); return false; });
  }
  try { return smtp(to, subject, text); } catch (e) { console.error('mail(smtp):', e.message); return false; }
};
module.exports.withAttachment = function sendAttach(to, cc, subject, text, att, replyTo) {
  if (RESEND) return resendSend(to, cc, subject, text, att, replyTo);
  if (process.env.GOOGLE_REFRESH_TOKEN) return gmailApiAttach(to, cc, subject, text, att, replyTo);
  return Promise.resolve().then(() => { if (!smtpAttach(to, cc, subject, text, att, replyTo)) throw new Error('smtp send failed'); return true; });
};
module.exports.FROM = FROM;
