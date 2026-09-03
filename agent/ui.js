'use strict';
// macOS UI through osascript. Runs inside the user's Aqua session because the
// agent is a LaunchAgent, so dialogs and notifications reach the screen.
// Dialogs are async and cancellable: cancelDialogs() kills whatever is on screen
// (used when the job is cancelled from the print queue).
const { spawn, spawnSync } = require('child_process');
const { log } = require('./config');

const TITLE = 'NearPrint™';
let current = null;

function osa(script, args = [], timeoutMs = 15 * 60 * 1000) {
  return new Promise(resolve => {
    const child = spawn('osascript', ['-', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    current = child;
    let out = '', err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      clearTimeout(timer);
      if (current === child) current = null;
      if (code !== 0) {
        if (!/-128|User canceled/.test(err)) log(`osascript: ${err.trim()}`);
        return resolve(null);
      }
      resolve(out.replace(/\n$/, '') || null);
    });
    child.stdin.end(script);
  });
}

function cancelDialogs() {
  if (current) { try { current.kill(); } catch {} current = null; }
}

function notify(message, subtitle = '') {
  spawnSync('osascript', ['-', message, subtitle], {
    input: `on run argv\n display notification (item 1 of argv) with title "${TITLE}" subtitle (item 2 of argv)\nend run`, timeout: 10000 });
}

// Resolves to the button name, or null when cancelled / timed out.
function dialog(text, buttons, defaultButton) {
  const def = defaultButton || buttons[buttons.length - 1];
  return osa(`on run argv
  set btns to items 3 thru -1 of argv
  set r to display dialog (item 1 of argv) buttons btns default button (item 2 of argv) with title "${TITLE}" giving up after 900
  if gave up of r then return ""
  return button returned of r
end run`, [text, def, ...buttons]);
}

function prompt(text, defaultAnswer = '') {
  return osa(`on run argv
  set r to display dialog (item 1 of argv) default answer (item 2 of argv) buttons {"Cancel", "OK"} default button "OK" with title "${TITLE}"
  return text returned of r
end run`, [text, defaultAnswer]);
}

function chooseFrom(items, promptText) {
  return osa(`on run argv
  set opts to items 2 thru -1 of argv
  set r to choose from list opts with prompt (item 1 of argv) with title "${TITLE}" OK button name "Choose" cancel button name "Cancel"
  if r is false then error number -128
  return item 1 of r
end run`, [promptText, ...items]);
}

module.exports = { notify, dialog, prompt, chooseFrom, cancelDialogs };
