#!/usr/bin/env node
'use strict';
// `printat connect` — link this Mac to the Print@ cloud (printat.co) so jobs dispatch
// through the network: branded sender, Print@ Network shops, pickup codes — no local
// email setup. Magic-link device authorization (matches the house auth pattern).
//   node agent/connect.js [email]      connect this device
//   node agent/connect.js --status     show connection state
//   node agent/connect.js --disconnect forget the token (back to local-only mode)
const readline = require('readline');
const { load, save } = require('./config');
const cloud = require('./cloud');

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(q, a => { rl.close(); r(a.trim()); }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const cfg = load();
  const arg = process.argv[2];

  if (arg === '--status') {
    if (cfg.cloudToken) console.log(`Connected to ${cfg.cloudBase} as ${cfg.cloudEmail} (useCloud=${cfg.useCloud}).`);
    else console.log(`Not connected. Running in local-only mode. Run "printat connect" to use the Print@ cloud.`);
    return;
  }
  if (arg === '--disconnect') {
    save({ cloudToken: '', cloudEmail: '' });
    console.log('Disconnected. Print@ now runs fully local — jobs send from your own email again.');
    return;
  }

  console.log('\nConnect this Mac to Print@ (printat.co)');
  console.log('  Jobs will dispatch through the network: sent from a Print@ address,');
  console.log('  Print@ Network shops with real pickup codes, nothing to configure locally.\n');
  const email = arg && arg.includes('@') ? arg : await ask('Your email: ');
  if (!email || !email.includes('@')) { console.error('Need a valid email.'); process.exit(1); }

  let poll;
  try { ({ poll } = await cloud.startDeviceAuth(cfg, email, cfg.contactName)); }
  catch (e) { console.error(`Could not reach ${cfg.cloudBase}: ${e.message}`); process.exit(1); }

  console.log(`\nWe emailed a confirmation link to ${email}.`);
  console.log('Open it on any device to authorize this Mac. Waiting…\n');

  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(3000);
    let d; try { d = await cloud.pollDevice(cfg, poll); } catch { continue; }
    if (d.status === 'ok' && d.device_token) {
      save({ cloudToken: d.device_token, cloudEmail: d.email || email, useCloud: 'auto', contactEmail: cfg.contactEmail || d.email || email });
      console.log(`Connected as ${d.email || email}. Print@ will now dispatch through the cloud.`);
      console.log('Run "printat connect --disconnect" any time to go back to local-only mode.');
      return;
    }
    process.stdout.write('.');
  }
  console.error('\nTimed out waiting for confirmation. Run "printat connect" again.');
  process.exit(1);
}
main().catch(e => { console.error(e.message); process.exit(1); });
