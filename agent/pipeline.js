'use strict';
const fs = require('fs');
const path = require('path');
const { HISTORY_PATH, log } = require('./config');
const ui = require('./ui');
const { locate, geocode } = require('./locate');
const { findCandidates } = require('./shops');
const { rank } = require('./rank');
const submit = require('./submit');

function money(n) { return n == null ? 'price unknown' : `est. $${Number(n).toFixed(2)}`; }
function openText(r) { return r.open_now === true ? 'open now' : r.open_now === false ? 'closed now' : 'hours unverified'; }

function summary(r) {
  const bits = [`${r.distance_mi ?? '?'} mi`, openText(r)];
  if (r.hours_today) bits.push(r.hours_today);
  bits.push(money(r.est_cost_usd));
  if (r.turnaround) bits.push(r.turnaround);
  return bits.join(' · ');
}

function methodText(r) {
  const s = r.submit || {};
  switch (s.method) {
    case 'email': return `email the PDF to ${s.email}`;
    case 'portal': return `upload at ${s.url}`;
    case 'phone': return `call ${s.phone || r.phone} (no online ordering found)`;
    default: return 'bring the file in person';
  }
}

async function confirmLocation(loc, job) {
  let cur = loc;
  for (;;) {
    const btn = ui.dialog(
      `Where should NearPrint look for a print shop for "${job.title}"?\n\nNear: ${cur.address || `${cur.lat}, ${cur.lon}`}\nSource: ${cur.source}`,
      ['Cancel', 'Enter an address…', 'Use this location'], 'Use this location');
    if (!btn || btn === 'Cancel') return null;
    if (btn === 'Use this location') return cur;
    const typed = ui.prompt('Street address, intersection, or place name:', cur.address || '');
    if (!typed) return null;
    try { cur = await geocode(typed); } catch { ui.notify(`Could not find "${typed}". Try again.`); }
  }
}

function pickDialog(ranked, job, spec) {
  let idx = 0;
  for (;;) {
    const r = ranked[idx];
    const text = `Best match for "${job.title}" (${spec.pages || '?'} pages, ${spec.color ? 'color' : 'B&W'}, ${spec.copies} cop${spec.copies === 1 ? 'y' : 'ies'}):\n\n` +
      `${r.name}\n${r.address}\n${summary(r)}\n\n${r.why}\n\nHow: ${methodText(r)}`;
    const primary = r.submit.method === 'email' ? 'Send order' : r.submit.method === 'portal' ? 'Open upload page' : 'Show details';
    const btn = ui.dialog(text, ['Cancel', 'Other shops…', primary], primary);
    if (!btn || btn === 'Cancel') return null;
    if (btn === primary) return r;
    const labels = ranked.map((x, i) => `${i + 1}. ${x.name} — ${summary(x)}`);
    const chosen = ui.chooseFrom(labels, 'Every shop found, best first:');
    if (chosen) idx = labels.indexOf(chosen);
  }
}

function writeReceipt(job, lines) {
  const p = path.join(job.dir, 'receipt.md');
  fs.writeFileSync(p, `# NearPrint receipt — ${job.title}\n\n${lines.join('\n')}\n`);
  fs.appendFileSync(HISTORY_PATH, JSON.stringify({ at: new Date().toISOString(), id: job.id, title: job.title, ...job.result }) + '\n');
  return p;
}

async function run(job, cfg) {
  const spec = job.spec;
  const receipt = [`- Job ${job.id}, ${spec.pages || '?'} pages x ${spec.copies}, ${spec.color ? 'color' : 'B&W'}, ${spec.duplex ? 'duplex' : 'simplex'}, ${spec.binding}, ${spec.paperStock}`,
    `- Priority ${spec.priority}, radius ${spec.maxDistance}, shop type ${spec.shopType}, delivery ${spec.delivery}`];
  const interactive = !cfg.dryRun && spec.delivery !== 'Auto';

  ui.notify(`Finding a print shop for "${job.title}"…`, 'Locating you');
  let loc;
  try { loc = await locate(cfg); } catch (e) {
    if (cfg.dryRun) throw e;
    const typed = ui.prompt('NearPrint could not determine your location. Where are you?', cfg.homeAddress || '');
    if (!typed) { job.result = { status: 'cancelled', step: 'location' }; return writeReceipt(job, receipt); }
    loc = await geocode(typed);
  }
  if (interactive && spec.confirmLocation) {
    loc = await confirmLocation(loc, job);
    if (!loc) { job.result = { status: 'cancelled', step: 'location' }; return writeReceipt(job, receipt); }
  }
  receipt.push(`- Location: ${loc.address} (${loc.source})`);
  log(`job ${job.id}: location ${loc.address} via ${loc.source}`);

  ui.notify(`Searching within ${spec.maxDistance} of ${loc.address}`, 'Finding shops');
  const candidates = await findCandidates(loc, spec.shopType, spec.maxDistance);
  log(`job ${job.id}: ${candidates.length} candidates`);
  if (!candidates.length) {
    if (interactive) ui.dialog(`No print shops found within ${spec.maxDistance} of ${loc.address}. Try a larger search radius in the print dialog.`, ['OK']);
    job.result = { status: 'no_candidates' };
    return writeReceipt(job, receipt);
  }
  fs.writeFileSync(path.join(job.dir, 'candidates.json'), JSON.stringify(candidates, null, 2));

  ui.notify(`${candidates.length} places found. Checking hours, prices and how to order…`, 'This takes a minute or two');
  const ranking = await rank(job, loc, candidates, cfg);
  fs.writeFileSync(path.join(job.dir, 'ranking.json'), JSON.stringify(ranking, null, 2));
  const ranked = ranking.ranked.filter(r => r.score > 0.05);
  if (!ranked.length) {
    if (interactive) ui.dialog('None of the nearby shops can take this job. See ranking.json in the job folder for why.', ['OK']);
    job.result = { status: 'no_viable' };
    return writeReceipt(job, receipt);
  }
  receipt.push('', '## Ranking', ...ranked.map((r, i) => `${i + 1}. **${r.name}** — ${summary(r)} — ${r.why} — ${methodText(r)}`), '');

  let pick = ranked[0];
  if (spec.delivery === 'FindOnly') {
    if (interactive) {
      const btn = ui.dialog(`Top picks for "${job.title}":\n\n` + ranked.slice(0, 3).map((r, i) => `${i + 1}. ${r.name}\n   ${r.address}\n   ${summary(r)}`).join('\n\n'), ['Done', 'Reveal PDF', 'Open #1 in Maps'], 'Open #1 in Maps');
      if (btn === 'Open #1 in Maps') submit.openMaps(pick);
      if (btn === 'Reveal PDF') submit.revealPdf(job.pdf);
    }
    job.result = { status: 'found', shop: pick.name, method: 'find_only' };
    return writeReceipt(job, receipt);
  }

  if (interactive) {
    pick = pickDialog(ranked, job, spec);
    if (!pick) { job.result = { status: 'cancelled', step: 'pick' }; return writeReceipt(job, receipt); }
  }
  receipt.push(`## Chosen: ${pick.name}`, `${pick.address}`, `${summary(pick)}`, `Method: ${methodText(pick)}`, '');

  const s = pick.submit;
  if (cfg.dryRun) {
    receipt.push(`DRY RUN — would ${methodText(pick)}.`);
    if (s.method === 'email') receipt.push('', '### Email draft', `Subject: ${pick.email_subject}`, '', pick.email_body || '(no body)');
    job.result = { status: 'dry_run', shop: pick.name, method: s.method };
    ui.notify(`Dry run: would ${methodText(pick)}`, pick.name);
    return writeReceipt(job, receipt);
  }

  try {
    if (s.method === 'email' && s.email) {
      const subject = pick.email_subject || `Print order: ${job.title} (${spec.pages || '?'} pp x ${spec.copies}, ${spec.color ? 'color' : 'B&W'})`;
      const body = pick.email_body || `Hello,\n\nPlease print the attached PDF: ${spec.pages || '?'} pages, ${spec.copies} copies, ${spec.color ? 'full color' : 'black and white'}, ${spec.duplex ? 'two-sided' : 'single-sided'}, ${spec.paperStock} paper, ${spec.binding}. Needed ${spec.pickup}.\n\nPlease reply with the price and when it will be ready. Pickup name: ${cfg.contactName}${cfg.contactPhone ? ', ' + cfg.contactPhone : ''}.\n\nThanks,\n${cfg.contactName}`;
      const out = submit.sendEmail({ to: s.email, cc: cfg.ccSelf ? cfg.contactEmail : '', subject, body, attachment: job.pdf, cfg });
      receipt.push(`Sent: ${out}`, '', '### Email', `Subject: ${subject}`, '', body);
      job.result = { status: 'sent', shop: pick.name, method: 'email', to: s.email };
      ui.notify(`Order emailed to ${pick.name}. They will reply to confirm price and pickup time.`, 'Sent');
      if (interactive) ui.dialog(`Order emailed to ${pick.name} (${s.email}).\n\nThey will reply to ${cfg.contactEmail} with price and ready time. A copy was cc'd to you.`, ['Open in Maps', 'OK'], 'OK') === 'Open in Maps' && submit.openMaps(pick);
    } else if (s.method === 'portal' && s.url) {
      submit.openPortal(s.url, job.pdf);
      receipt.push(`Opened portal ${s.url}; PDF revealed in Finder and its path copied to the clipboard.`);
      job.result = { status: 'portal_opened', shop: pick.name, method: 'portal', url: s.url };
      ui.notify(`Upload page opened for ${pick.name}. Your PDF is selected in Finder; drag it into the uploader.`, 'Almost there');
    } else {
      submit.revealPdf(job.pdf);
      const phone = s.phone || pick.phone || 'no phone listed';
      receipt.push(`No online ordering. Phone ${phone}. ${s.instructions || ''}`);
      job.result = { status: 'manual', shop: pick.name, method: s.method };
      if (interactive) {
        const btn = ui.dialog(`${pick.name} has no online ordering.\n\n${pick.address}\nPhone: ${phone}\n\n${s.instructions || 'Bring the PDF in person.'}\n\nThe PDF is selected in Finder.`, ['OK', 'Call', 'Open in Maps'], 'Open in Maps');
        if (btn === 'Open in Maps') submit.openMaps(pick);
        if (btn === 'Call' && phone !== 'no phone listed') { try { require('child_process').execFileSync('open', [`tel:${phone.replace(/[^\d+]/g, '')}`]); } catch {} }
      }
    }
  } catch (e) {
    log(`job ${job.id}: delivery failed: ${e.message}`);
    receipt.push(`Delivery failed: ${e.message}`);
    job.result = { status: 'failed', shop: pick.name, error: e.message };
    if (interactive) ui.dialog(`Could not send the job to ${pick.name}:\n\n${e.message}\n\nThe PDF is at:\n${job.pdf}`, ['OK']);
    submit.revealPdf(job.pdf);
  }
  return writeReceipt(job, receipt);
}

module.exports = { run };
