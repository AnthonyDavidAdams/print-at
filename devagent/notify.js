'use strict';
// iMessage to the maintainer and back. Sends through Messages.app (AppleScript); reads
// replies straight from the local chat.db (needs Full Disk Access for the process that
// runs this, e.g. Terminal or node). iMessage is the home channel; nothing else.
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const RECIPIENT = process.env.DEVAGENT_PHONE || '';
const CHAT_DB = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
const APPLE_EPOCH = 978307200; // seconds between 1970 and 2001

function sendText(text) {
  if (!RECIPIENT) throw new Error('DEVAGENT_PHONE not set');
  const script = 'on run argv\n tell application "Messages"\n  set sid to id of 1st service whose service type = iMessage\n  set b to participant (item 1 of argv) of service id sid\n  send (item 2 of argv) to b\n end tell\nend run';
  const r = spawnSync('osascript', ['-', RECIPIENT, text], { input: script, encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) throw new Error('iMessage send failed: ' + (r.stderr || '').trim().slice(0, 200));
}

// Pull the readable string out of an attributedBody blob (macOS stores most texts there now).
function decodeBody(buf) {
  if (!buf) return '';
  const s = Buffer.from(buf).toString('latin1');
  const i = s.indexOf('NSString'); if (i < 0) return '';
  // After the class name: 0x01 '+' (or 0x81 + 2-byte length) then the UTF-8 string.
  let j = i + 'NSString'.length + 1; // skip 0x01
  if (s.charCodeAt(j) !== 0x2b) return '';
  j++; let len = s.charCodeAt(j); j++;
  if (len === 0x81) { len = s.charCodeAt(j) | (s.charCodeAt(j + 1) << 8); j += 2; }
  return Buffer.from(s.slice(j, j + len), 'latin1').toString('utf8');
}

// Replies from the maintainer after `sinceMs` (unix ms). [{ id, text, at }]
function repliesSince(sinceMs) {
  if (!RECIPIENT) return [];
  const { DatabaseSync } = require('node:sqlite');
  let db; try { db = new DatabaseSync(CHAT_DB, { readOnly: true }); } catch (e) { throw new Error('cannot read chat.db (grant Full Disk Access to the terminal/node): ' + e.message); }
  try {
    // message.date is int64 nanoseconds since 2001, too big for a JS number: compare and
    // return in whole seconds inside SQL.
    const sinceSecs = Math.floor(sinceMs / 1000 - APPLE_EPOCH);
    const rows = db.prepare(`SELECT m.ROWID AS id, m.text, m.attributedBody AS body, (m.date / 1000000000) AS secs FROM message m JOIN handle h ON m.handle_id = h.ROWID
      WHERE h.id = ? AND m.is_from_me = 0 AND (m.date / 1000000000) > ? ORDER BY m.date ASC LIMIT 50`).all(RECIPIENT, sinceSecs);
    return rows.map(r => ({ id: r.id, text: (r.text || decodeBody(r.body) || '').trim(), at: (Number(r.secs) + APPLE_EPOCH) * 1000 })).filter(r => r.text);
  } finally { db.close(); }
}

module.exports = { sendText, repliesSince, RECIPIENT };
