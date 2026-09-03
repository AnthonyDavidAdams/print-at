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
  cfg.dryRun = process.env.PRINTAT_DRY_RUN === '1';
  cfg.skipClaude = process.env.PRINTAT_SKIP_CLAUDE === '1';
  return cfg;
}

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { fs.appendFileSync(path.join(LOG_DIR, 'agent.log'), line + '\n'); } catch {}
}

module.exports = { APP_DIR, JOBS_DIR, LOG_DIR, CONFIG_PATH, SHOP_CACHE_PATH, HISTORY_PATH, ROOT, HELPER, load, log };
