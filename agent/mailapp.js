'use strict';
// Local-mode sender that goes through Mail.app. Whatever account the user already has
// in Mail (Gmail, iCloud, Outlook, Fastmail, a work Exchange box) just works: no app
// passwords, no SMTP settings, nothing stored by Print@. macOS asks once to let the
// agent control Mail. In dry-run mode the message is saved as a draft instead of sent.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = `
on run argv
  set {toAddr, ccAddr, subj, bodyFile, attPath, fromAddr, mode} to argv
  set bodyText to read (POSIX file bodyFile) as «class utf8»
  tell application "Mail"
    set m to make new outgoing message with properties {subject:subj, content:bodyText & return & return, visible:false}
    tell m
      make new to recipient at end of to recipients with properties {address:toAddr}
      if ccAddr is not "" then make new cc recipient at end of cc recipients with properties {address:ccAddr}
      if fromAddr is not "" then set sender to fromAddr
      if attPath is not "" then make new attachment with properties {file name:(POSIX file attPath)} at after the last paragraph
    end tell
    delay 1
    if mode is "draft" then
      save m
    else
      send m
    end if
  end tell
  return "ok"
end run`;

// Accounts Mail knows about, as "Name <address>" strings usable for `sender`.
function accounts() {
  const r = spawnSync('osascript', ['-e', 'tell application "Mail" to get email addresses of every account'], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) return [];
  return r.stdout.split(',').map(s => s.trim()).filter(Boolean);
}

function send({ to, cc, subject, body, attachment, from, draft }) {
  const bodyFile = (attachment || path.join(require('os').tmpdir(), 'printat-mail')) + '.mailapp.txt';
  fs.writeFileSync(bodyFile, body || '');
  const r = spawnSync('osascript', ['-', to, cc || '', subject, bodyFile, attachment || '', from || '', draft ? 'draft' : 'send'],
    { input: SCRIPT, encoding: 'utf8', timeout: 120000 });
  try { fs.unlinkSync(bodyFile); } catch {}
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout).trim();
    if (/not allowed|-1743|Not authorized/i.test(err)) throw new Error('macOS blocked Print@ from controlling Mail. Allow it in System Settings › Privacy & Security › Automation, then print again.');
    throw new Error(`Mail.app send failed: ${err.slice(-300)}`);
  }
  return draft ? `saved as a draft in Mail.app (dry run)` : `sent via Mail.app${from ? ' from ' + from : ''}`;
}

module.exports = { send, accounts };
