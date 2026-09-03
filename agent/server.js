'use strict';
// NearPrint agent: receives jobs from the CUPS backend over localhost and runs the pipeline.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { JOBS_DIR, load, log } = require('./config');
const { run } = require('./pipeline');
const ui = require('./ui');

const cfg = load();
let queue = Promise.resolve();

function b64(h) { return h ? Buffer.from(h, 'base64').toString('utf8') : ''; }

function parseOptions(str) {
  const o = {};
  const re = /([^\s=]+)=("[^"]*"|'[^']*'|\{[^}]*\}|\S+)|(\S+)/g;
  let m;
  while ((m = re.exec(str || ''))) {
    if (m[1]) o[m[1]] = m[2].replace(/^["'{]|["'}]$/g, '');
    else o[m[3]] = true;
  }
  return o;
}

function countPages(pdfPath) {
  try {
    const s = fs.readFileSync(pdfPath).toString('latin1');
    const n = (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    if (n) return n;
  } catch {}
  try {
    const out = execFileSync('mdls', ['-raw', '-name', 'kMDItemNumberOfPages', pdfPath], { encoding: 'utf8' }).trim();
    const n = parseInt(out, 10);
    if (n > 0) return n;
  } catch {}
  return 0;
}

function buildSpec(opts, copiesHeader, pdfPath) {
  const dup = opts.Duplex || opts.sides || 'None';
  return {
    pages: countPages(pdfPath),
    copies: Math.max(1, parseInt(opts.copies || copiesHeader || '1', 10) || 1),
    color: (opts.ColorModel || 'RGB') !== 'Gray' && opts['print-color-mode'] !== 'monochrome',
    duplex: !/^(None|one-sided)$/.test(dup),
    pageSize: opts.PageSize || opts.media || 'Letter',
    priority: opts.Priority || 'Nearest',
    maxDistance: opts.MaxDistance || '5mi',
    shopType: opts.ShopType || 'Any',
    pickup: opts.Pickup || 'ASAP',
    binding: opts.Binding || 'None',
    paperStock: opts.PaperStock || 'Standard',
    delivery: opts.Delivery || 'Confirm',
    confirmLocation: (opts.ConfirmLocation || 'Yes') === 'Yes',
  };
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, dryRun: cfg.dryRun, skipClaude: cfg.skipClaude }));
  }
  if (req.method === 'GET' && req.url === '/jobs') {
    const list = fs.readdirSync(JOBS_DIR).sort().reverse().slice(0, 50).map(d => {
      try { return JSON.parse(fs.readFileSync(path.join(JOBS_DIR, d, 'job.json'), 'utf8')); } catch { return { id: d }; }
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list, null, 2));
  }
  if (req.method !== 'POST' || req.url !== '/job') { res.writeHead(404); return res.end(); }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const pdf = Buffer.concat(chunks);
    if (pdf.length < 100 || pdf.subarray(0, 5).toString() !== '%PDF-') {
      res.writeHead(415); return res.end('expected a PDF body');
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const id = `${stamp}-${req.headers['x-np-job-id'] || 'manual'}`;
    const dir = path.join(JOBS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    const title = (b64(req.headers['x-np-title']) || 'Untitled').trim();
    const safeTitle = title.replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'document';
    const pdfPath = path.join(dir, `${safeTitle}.pdf`);
    fs.writeFileSync(pdfPath, pdf);
    const opts = parseOptions(b64(req.headers['x-np-options']));
    const job = {
      id, dir, pdf: pdfPath, title,
      user: b64(req.headers['x-np-user']),
      printer: req.headers['x-np-printer'] || 'NearPrint',
      receivedAt: new Date().toISOString(),
      options: opts,
      spec: buildSpec(opts, req.headers['x-np-copies'], pdfPath),
    };
    fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2));
    log(`job ${id}: "${title}" ${job.spec.pages}pp x${job.spec.copies} ${JSON.stringify(job.spec)}`);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id }));

    queue = queue.then(() => run(job, cfg)).then(receipt => {
      log(`job ${id}: done -> ${JSON.stringify(job.result)}`);
      fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2));
    }).catch(e => {
      log(`job ${id}: pipeline error: ${e.stack || e.message}`);
      ui.notify(`Could not dispatch "${title}": ${e.message}`, 'Error');
    });
  });
});

server.listen(cfg.port, '127.0.0.1', () => {
  log(`NearPrint agent listening on 127.0.0.1:${cfg.port}${cfg.dryRun ? ' [DRY RUN]' : ''}${cfg.skipClaude ? ' [NO CLAUDE]' : ''}`);
});
