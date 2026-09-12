'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'PrintAt');
const JOBS_DIR = path.join(APP_DIR, 'jobs');
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'PrintAt');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const SHOP_CACHE_PATH = path.join(APP_DIR, 'shops.json');
const HISTORY_PATH = path.join(APP_DIR, 'history.jsonl');
const ROOT = path.resolve(__dirname, '..');
const HELPER = path.join(ROOT, 'helper', 'printat-locate');

const DEFAULTS = {
  contactName: os.userInfo().username,
  contactEmail: '',
  contactPhone: '',
  homeAddress: '',
  ccSelf: true,
  port: 4243,
  claudeModel: '',
  claudeTimeoutSec: 540,
  gmailEnv: path.join(os.homedir(), '.gmail.env'),
  smtpUser: '',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  // Print@ cloud. When cloudToken is set the driver dispatches through printat.co
  // (branded sender, Print@ Network shops, pickup codes) instead of the user's own
  // email. Empty token = fully local mode: nothing leaves the Mac but the print job.
  cloudBase: 'https://printat.co',
  cloudToken: '',
  cloudEmail: '',
  useCloud: 'auto', // 'auto' = use the cloud whenever connected; 'off' = force local
};

for (const d of [APP_DIR, JOBS_DIR, LOG_DIR]) fs.mkdirSync(d, { recursive: true });

function load() {
  let saved = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { log(`config.json unreadable: ${e.message}`); }
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
  }
  const cfg = { ...DEFAULTS, ...saved };
  if (!cfg.smtpUser) cfg.smtpUser = cfg.contactEmail;
  if (process.env.PRINTAT_CLOUD_BASE) cfg.cloudBase = process.env.PRINTAT_CLOUD_BASE;
  cfg.dryRun = process.env.PRINTAT_DRY_RUN === '1';
  cfg.skipClaude = process.env.PRINTAT_SKIP_CLAUDE === '1';
  cfg.cloudOn = cfg.useCloud !== 'off' && !!cfg.cloudToken;
  return cfg;
}

// Merge a patch into config.json on disk (used by `printat connect` to store the token).
function save(patch) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  const next = { ...saved, ...patch };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(LOG_DIR, 'agent.log'), line + '\n'); } catch {}
}

module.exports = { APP_DIR, JOBS_DIR, LOG_DIR, CONFIG_PATH, SHOP_CACHE_PATH, HISTORY_PATH, ROOT, HELPER, load, save, log };
