'use strict';
// macOS UI through osascript. Runs inside the user's Aqua session because the
// agent is a LaunchAgent, so dialogs and notifications reach the screen.
const { spawnSync } = require('child_process');
const { log } = require('./config');

const TITLE = 'NearPrint™';

function osa(script, args = [], timeoutMs = 15 * 60 * 1000) {
  const r = spawnSync('osascript', ['-', ...args], { input: script, encoding: 'utf8', timeout: timeoutMs });
  if (r.status !== 0) {
    if (!/-128|User canceled/.test(r.stderr || '')) log(`osascript: ${(r.stderr || '').trim()}`);
    return null;
  }
  return (r.stdout || '').replace(/\n$/, '');
}

function notify(message, subtitle = '') {
  osa(`on run argv
  display notification (item 1 of argv) with title "${TITLE}" subtitle (item 2 of argv)
end run`, [message, subtitle], 10000);
}

// Returns the button name, or null when cancelled / timed out.
function dialog(text, buttons, defaultButton) {
  const def = defaultButton || buttons[buttons.length - 1];
  const out = osa(`on run argv
  set btns to items 3 thru -1 of argv
  set r to display dialog (item 1 of argv) buttons btns default button (item 2 of argv) with title "${TITLE}" giving up after 900
  if gave up of r then return ""
  return button returned of r
end run`, [text, def, ...buttons]);
  return out || null;
}

function prompt(text, defaultAnswer = '') {
  return osa(`on run argv
  set r to display dialog (item 1 of argv) default answer (item 2 of argv) buttons {"Cancel", "OK"} default button "OK" with title "${TITLE}"
  return text returned of r
end run`, [text, defaultAnswer]);
}

function chooseFrom(items, promptText) {
  const out = osa(`on run argv
  set opts to items 2 thru -1 of argv
  set r to choose from list opts with prompt (item 1 of argv) with title "${TITLE}" OK button name "Choose" cancel button name "Cancel"
  if r is false then error number -128
  return item 1 of r
end run`, [promptText, ...items]);
  return out || null;
}

module.exports = { notify, dialog, prompt, chooseFrom };
