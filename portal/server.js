'use strict';
// Print@ web portal — a hosted page (works on any phone, no install) that finds the
// nearest print shop and sends the job. Same backend serves the iOS share sheet.
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { nearby } = require('./search');

const PORT = process.env.PORT || 4250;
const SENDER = process.env.PRINTAT_FROM || process.env.SMTP_USER || '';
const GMAIL_ENV = process.env.GMAIL_ENV || path.join(require('os').homedir(), '.gmail.env');

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function body(req) { return new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); }); }

const PAGE = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE);
  }
  if (req.method === 'GET' && url === '/health') return json(res, 200, { ok: true });

  if (req.method === 'POST' && url === '/api/nearby') {
    try {
      const { lat, lon, radiusMi } = JSON.parse((await body(req)).toString() || '{}');
      if (typeof lat !== 'number' || typeof lon !== 'number') return json(res, 400, { error: 'need lat/lon' });
      const list = await nearby({ lat, lon }, radiusMi || 15);
      return json(res, 200, { shops: list.map(c => ({
        id: c.id, name: c.name, address: c.address, distance_mi: c.distance_mi,
        brand: c.brand, how: c.how, automatable: c.automatable, email: c.email, portal: c.portal || '',
      })) });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  if (req.method === 'POST' && url === '/api/send') {
    try {
      const b = JSON.parse((await body(req)).toString() || '{}');
      const { to, subject, message, filename, fileB64, replyTo, cc } = b;
      if (!to || !fileB64) return json(res, 400, { error: 'need to + fileB64' });
      const tmp = path.join(require('os').tmpdir(), `portal-${Date.now()}-${(filename || 'doc.pdf').replace(/[^\w.]+/g, '_')}`);
      fs.writeFileSync(tmp, Buffer.from(fileB64, 'base64'));
      const bodyFile = tmp + '.txt'; fs.writeFileSync(bodyFile, message || 'Print the attached document.');
      const args = [path.join(__dirname, '..', 'agent', 'send_email.py'), '--to', to,
        '--subject', subject || (filename || 'Print job'), '--body-file', bodyFile, '--attach', tmp,
        '--from', SENDER, '--from-name', 'Print@', '--env', GMAIL_ENV];
      if (cc) args.push('--cc', cc);
      const r = spawnSync('python3', args, { encoding: 'utf8', timeout: 90000 });
      try { fs.unlinkSync(tmp); fs.unlinkSync(bodyFile); } catch {}
      if (r.status !== 0) return json(res, 502, { error: (r.stderr || r.stdout || 'send failed').trim().slice(-300) });
      return json(res, 200, { sent: true, to });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }
  res.writeHead(404); res.end('not found');
});
server.listen(PORT, () => console.log(`Print@ portal on :${PORT}`));
