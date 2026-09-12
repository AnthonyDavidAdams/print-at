'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { HISTORY_PATH, log } = require('./config');
const ui = require('./ui');
const { locate, geocode } = require('./locate');
const { findCandidates } = require('./shops');
const { rank } = require('./rank');
const submit = require('./submit');
const memory = require('./memory');
const cloud = require('./cloud');
const { createUX } = require('./panel');

function money(n) { return n == null ? 'price unknown' : `est. $${Number(n).toFixed(2)}`; }
function openText(r) { return r.open_now === true ? 'open now' : r.open_now === false ? 'closed now' : 'hours unverified'; }
function summary(r) {
  if (r.network) {
    const bits = [`${r.distance_mi ?? '?'} mi`, 'Print@ Network'];
    if (r.price_bw) bits.push(`B&W ${r.price_bw}`);
    if (r.price_color) bits.push(`color ${r.price_color}`);
    if (r.stars) bits.push(`${r.stars}★`);
    return bits.join(' · ');
  }
  const bits = [`${r.distance_mi ?? '?'} mi`, openText(r)];
  if (r.hours_today) bits.push(r.hours_today);
  bits.push(money(r.est_cost_usd));
  if (r.turnaround) bits.push(r.turnaround);
  return bits.join(' · ');
}
function methodText(r) {
  const s = r.submit || {};
  switch (s.method) {
    case 'network': return `Sends to ${r.name} through Print@. You get a pickup code and the shop prints it from its browser.`;
    case 'email': return `Sends the PDF by email to ${s.email}`;
    case 'portal': return `Opens the upload page at ${s.url}`;
    case 'phone': return `No online ordering found. Call ${s.phone || r.phone}.`;
    default: return 'Walk-in only. Bring the file.';
  }
}
function primaryLabel(r, delivery) {
  if (delivery === 'FindOnly') return 'Use this shop';
  const m = (r.submit || {}).method;
  return (m === 'email' || m === 'network') ? `Send to ${r.name}` : m === 'portal' ? 'Open upload page' : 'Show details';
}
function radiusMiles(maxDistance) { return parseInt(maxDistance, 10) || 5; }
function forPanel(ranked, delivery) {
  return ranked.map(r => ({ id: r.id, name: r.name, address: r.address || '', summary: summary(r), why: r.why || '', method: methodText(r), primary: primaryLabel(r, delivery) }));
}

function writeReceipt(job, lines) {
  const p = path.join(job.dir, 'receipt.md');
  fs.writeFileSync(p, `# Print@ receipt — ${job.title}\n\n${lines.join('\n')}\n`);
  fs.appendFileSync(HISTORY_PATH, JSON.stringify({ at: new Date().toISOString(), id: job.id, title: job.title, ...job.result }) + '\n');
  return p;
}

function queueExists(queue) {
  try { execFileSync('/usr/bin/lpstat', ['-p', queue], { stdio: 'pipe' }); return true; } catch { return false; }
}

// After a shop has actually been used, make it a printer of its own (once).
function autoAddPrinter(pick, spec, receipt) {
  try {
    const { queue, label } = submit.printerNames(pick);
    if (queueExists(queue)) return '';
    submit.addPrinter(pick, spec);
    receipt.push(`Added printer "${label}".`);
    return `\n\n"${label}" is now a printer in every Print dialog.`;
  } catch (e) { log(`auto add printer failed: ${e.message}`); return ''; }
}

async function run(job, cfg, report = () => {}) {
  const spec = job.spec;
  const receipt = [`- Job ${job.id}, ${spec.pages || '?'} pages x ${spec.copies}, ${spec.color ? 'color' : 'B&W'}, ${spec.duplex ? 'duplex' : 'simplex'}, ${spec.binding}, ${spec.paperStock}`,
    `- Priority ${spec.priority}, radius ${spec.maxDistance}, shop type ${spec.shopType}, delivery ${spec.delivery}${job.pin ? `, pinned to ${job.pin}` : ''}`];
  const interactive = !cfg.dryRun && spec.delivery !== 'Auto';
  const ux = interactive ? createUX(job, cfg) : null;
  Object.defineProperty(job, 'ux', { value: ux, enumerable: false, writable: true, configurable: true });
  const check = () => { if (job.cancelled) throw new Error('cancelled from the print queue'); };
  const status = msg => { report(msg); if (ux) ux.status(msg); };
  const cancelled = step => { job.result = { status: 'cancelled', step }; return writeReceipt(job, receipt); };

  try {
    // 1. Where are we
    status('Locating you');
    let loc;
    try { loc = await locate(cfg); } catch (e) {
      if (!ux) throw e;
      loc = { lat: 0, lon: 0, address: '', source: 'unknown' };
    }
    check();
    // Auto: only ask when the fix is uncertain (IP-only, or nothing at all).
    const sure = /Location Services|home address|entered/.test(loc.source || '');
    const needConfirm = !loc.address || spec.confirmLocation === 'Yes' || (spec.confirmLocation === 'Auto' && !sure);
    if (ux && needConfirm) {
      report('Waiting for you to confirm the location');
      for (;;) {
        const a = await ux.confirmLocation(loc);
        check();
        if (a.action === 'cancel') return cancelled('location');
        if (a.action === 'use' && loc.address) break;
        if (a.action === 'address' && a.value) {
          try { loc = await geocode(a.value); break; } catch { loc = { ...loc, address: '', source: `could not find "${a.value}"` }; }
        }
      }
    }
    receipt.push(`- Location: ${loc.address} (${loc.source})`);
    log(`job ${job.id}: location ${loc.address} via ${loc.source}`);

    // 2. Reuse the shop used last time from here, unless pinned or told to search again
    let ranked = null, fromMemory = false;
    const remembered = job.pin ? null : memory.recall(loc, spec);
    if (remembered) {
      ranked = [{ ...remembered.pick, id: remembered.pick.id || 's1' }];
      fromMemory = true;
      receipt.push(`- Reused ${remembered.pick.name}, last used ${new Date(remembered.at).toLocaleDateString()} from ${remembered.address}`);
      status(`Using ${remembered.pick.name} again`);
    }

    // 3. Otherwise search and rank
    if (!ranked) {
      status(`Searching within ${spec.maxDistance} of ${loc.address}`);
      const candidates = await findCandidates(loc, spec.shopType, spec.maxDistance, job.pin);
      check();
      log(`job ${job.id}: ${candidates.length} candidates`);
      if (!candidates.length) {
        const msg = job.pin ? `Could not find "${job.pin}" within 25 miles of ${loc.address}.` : `No print shops found within ${spec.maxDistance} of ${loc.address}. Try a larger search radius in the Print dialog.`;
        if (ux) await ux.result(msg, [{ key: 'done', label: 'OK' }]);
        job.result = { status: 'no_candidates' };
        return writeReceipt(job, receipt);
      }
      fs.writeFileSync(path.join(job.dir, 'candidates.json'), JSON.stringify(candidates, null, 2));
      status(`Checking hours, prices and how to order at ${candidates.length} place${candidates.length === 1 ? '' : 's'} (a minute or two)`);
      const detail = msg => { report(msg); if (ux) ux.detail(msg); };
      const ranking = await rank(job, loc, candidates, cfg, detail);
      check();
      fs.writeFileSync(path.join(job.dir, 'ranking.json'), JSON.stringify(ranking, null, 2));
      ranked = ranking.ranked.filter(r => r.score > 0.05);
      if (job.pinEmail) for (const r of ranked) { r.submit = { method: 'email', email: job.pinEmail, instructions: 'Order email set on this printer' }; r.automatable = true; }
      if (!ranked.length) {
        if (ux) await ux.result('None of the nearby shops can take this job. See ranking.json in the job folder for why.', [{ key: 'done', label: 'OK' }]);
        job.result = { status: 'no_viable' };
        return writeReceipt(job, receipt);
      }
      receipt.push('', '## Ranking', ...ranked.map((r, i) => `${i + 1}. **${r.name}** — ${summary(r)} — ${r.why} — ${methodText(r)}`), '');
    }

    // 3b. Print@ cloud: when connected, Print@ Network shops are the best option — the
    //     shop prints from its browser, the customer gets a pickup code and can rate it.
    //     Offer them ahead of directory shops.
    if (cloud.connected(cfg) && !fromMemory) {
      try {
        const net = await cloud.nearbyNetworkShops(cfg, loc, radiusMiles(spec.maxDistance));
        if (net.length) {
          net.forEach((n, i) => { n.score = 1 - i * 0.001; n.why = `Print@ Network shop, ${n.distance_mi} mi away.`; });
          ranked = net.concat(ranked);
          receipt.push(`- ${net.length} Print@ Network shop(s) available via the cloud`);
          log(`job ${job.id}: ${net.length} Print@ Network shop(s) from cloud`);
        }
      } catch (e) { log(`network shops lookup skipped: ${e.message}`); }
    }

    // 4. Pick. Shops the agent can send to by itself come first; web forms and
    //    phone-only shops are offered only behind "Show other options", or when
    //    nothing automatable exists.
    const isAuto = r => { const m = (r.submit || {}).method; return m === 'network' || (m === 'email' && !!(r.submit || {}).email); };
    const autoList = ranked.filter(isAuto), manualList = ranked.filter(r => !isAuto(r));
    let shortlist = autoList.length ? autoList : manualList;
    let alternates = autoList.length ? manualList : [];
    let note = autoList.length ? '' : 'None of these take orders by email. They need a web upload or a call.';
    if (fromMemory) { shortlist = ranked; alternates = []; note = ''; }
    let pick = shortlist[0];
    if (ux) {
      report(`Waiting for your OK: ${pick.name}, ${summary(pick)}`);
      for (;;) {
        const a = await ux.pick(forPanel(shortlist, spec.delivery), fromMemory, note, alternates.length);
        check();
        if (a.action === 'cancel') return cancelled('pick');
        if (a.action === 'search') { memory.forget(loc, spec); return run(job, cfg, report); }
        if (a.action === 'alternates') { shortlist = shortlist.concat(alternates); alternates = []; note = 'Shops below the line need a web upload or a call.'; continue; }
        pick = shortlist.find(r => r.id === a.value) || pick;
        break;
      }
    }
    receipt.push(`## Chosen: ${pick.name}`, `${pick.address}`, `${summary(pick)}`, `${methodText(pick)}`, '');

    // 5. Deliver
    const s = pick.submit || {};
    if (spec.delivery === 'FindOnly') {
      memory.remember(loc, spec, pick);
      job.result = { status: 'found', shop: pick.name, method: 'find_only' };
      status(`Found: ${pick.name}, ${summary(pick)}`);
      if (ux) {
        const added = autoAddPrinter(pick, spec, receipt);
        const act = await ux.result(`${pick.name}\n${pick.address}\n${summary(pick)}\n\n${methodText(pick)}${added}`, [{ key: 'pdf', label: 'Show PDF' }, { key: 'maps', label: 'Open in Maps' }, { key: 'done', label: 'Done' }]);
        if (act === 'maps') submit.openMaps(pick);
        if (act === 'pdf') submit.revealPdf(job.pdf);
      } else submit.revealPdf(job.pdf);
      return writeReceipt(job, receipt);
    }
    if (cfg.dryRun) {
      receipt.push(`DRY RUN — ${methodText(pick)}`);
      if (s.method === 'email') receipt.push('', '### Email draft', `Subject: ${pick.email_subject}`, '', pick.email_body || '(no body)');
      job.result = { status: 'dry_run', shop: pick.name, method: s.method };
      return writeReceipt(job, receipt);
    }
    status(`Sending to ${pick.name}`);
    try {
      if (s.method === 'network') {
        const items = [{ filename: path.basename(job.pdf), fileB64: fs.readFileSync(job.pdf).toString('base64'), copies: spec.copies, color: spec.color ? 'color' : 'bw' }];
        const out = await cloud.sendNetworkJob(cfg, { networkId: s.network_id, items, name: cfg.contactName, email: cfg.contactEmail });
        receipt.push(`Sent through Print@ Network. Pickup code: ${out.pickup_code}.`);
        job.result = { status: 'sent', shop: pick.name, method: 'network', pickup_code: out.pickup_code };
        memory.remember(loc, spec, pick);
        ui.notify(`Sent to ${pick.name}. Pickup code ${out.pickup_code}.`, 'Sent via Print@');
        if (ux) {
          const added = autoAddPrinter(pick, spec, receipt);
          const act = await ux.result(`Sent to ${pick.name} through Print@ Network.\n\nPickup code: ${out.pickup_code}\nShow it at the counter. ${cfg.contactEmail ? `A copy went to ${cfg.contactEmail}.` : ''}\n${pick.address}${added}`, [{ key: 'maps', label: 'Open in Maps' }, { key: 'done', label: 'Done' }]);
          if (act === 'maps') submit.openMaps(pick);
        }
      } else if (s.method === 'email' && s.email) {
        const isPrinterOn = !!pick.printeron || /@printspots\.com$/i.test(s.email);
        const isPrintMe = !!pick.printme || /@printme\.com$/i.test(s.email || '');
        const releaseStyle = isPrinterOn || isPrintMe;
        const subject = releaseStyle ? job.title : (pick.email_subject || `Print order: ${job.title} (${spec.pages || '?'} pp x ${spec.copies}, ${spec.color ? 'color' : 'B&W'})`);
        const body = releaseStyle ? 'Print the attached document.' : pick.email_body || `Hello,\n\nPlease print the attached PDF: ${spec.pages || '?'} pages, ${spec.copies} copies, ${spec.color ? 'full color' : 'black and white'}, ${spec.duplex ? 'two-sided' : 'single-sided'}, ${spec.paperStock} paper, ${spec.binding}. Needed ${spec.pickup}.\n\nPlease reply with the price and when it will be ready. Pickup name: ${cfg.contactName}${cfg.contactPhone ? ', ' + cfg.contactPhone : ''}.\n\nThanks,\n${cfg.contactName}`;
        const cc = cfg.ccSelf ? cfg.contactEmail : '';
        // Connected → dispatch through printat.co (branded sender, logged). Fall back to
        // local email if the cloud is unreachable and local email is configured.
        let out, viaCloud = false;
        if (cloud.connected(cfg)) {
          try {
            const r = await cloud.dispatchEmail(cfg, { to: s.email, cc, subject, body, pdfPath: job.pdf, shop: pick, meta: { pages: spec.pages, copies: spec.copies, color: spec.color } });
            out = `Print@ cloud (ref ${r.ref})`; viaCloud = true;
          } catch (e) {
            log(`cloud dispatch failed (${e.message}); ${cfg.smtpUser ? 'falling back to local email' : 'no local email configured'}`);
            if (!cfg.smtpUser) throw e;
          }
        }
        if (!viaCloud) out = submit.sendEmail({ to: s.email, cc, subject, body, attachment: job.pdf, cfg });
        receipt.push(`Sent: ${out}`, '', '### Email', `Subject: ${subject}`, '', body);
        job.result = { status: 'sent', shop: pick.name, method: 'email', to: s.email, via: viaCloud ? 'cloud' : 'local' };
        memory.remember(loc, spec, pick);
        ui.notify(releaseStyle ? `Sent to ${pick.name} via ${isPrintMe ? 'PrintMe' : 'PrinterOn'}. Watch your email for the release code.` : `Order emailed to ${pick.name}${viaCloud ? ' via Print@' : ''}. They will reply with price and pickup time.`, 'Sent');
        if (ux) {
          const added = autoAddPrinter(pick, spec, receipt);
          const text = isPrintMe
            ? `Sent to ${pick.name} via PrintMe (${s.email}).\n\nPrintMe will email a release code to ${cfg.contactEmail}. Enter it at the self-service kiosk in any ${pick.printme ? pick.printme.merchant : 'store'} and pay there. Nearest one:\n${pick.address}${added}`
            : isPrinterOn
            ? `Sent to the PrinterOn printer at ${pick.name} (${s.email}).\n\nPrinterOn will email a 6-digit release code to ${cfg.contactEmail}. Take it to the business center or front desk at:\n${pick.address}${added}`
            : `Order emailed to ${pick.name} (${s.email}).\n\nThey will reply to ${cfg.contactEmail} with price and ready time. A copy was cc'd to you.${added}`;
          const act = await ux.result(text, [{ key: 'maps', label: 'Open in Maps' }, { key: 'done', label: 'Done' }]);
          if (act === 'maps') submit.openMaps(pick);
        }
      } else if (s.method === 'portal' && s.url) {
        submit.openPortal(s.url, job.pdf);
        receipt.push(`Opened portal ${s.url}; PDF revealed in Finder and its path copied to the clipboard.`);
        job.result = { status: 'portal_opened', shop: pick.name, method: 'portal', url: s.url };
        memory.remember(loc, spec, pick);
        if (ux) {
          const added = autoAddPrinter(pick, spec, receipt);
          await ux.result(`The ${pick.name} upload page is open in your browser and the PDF is selected in Finder. Drag it into the uploader and pick this store for pickup:\n${pick.address}${added}`, [{ key: 'done', label: 'Done' }]);
        }
      } else {
        const phone = s.phone || pick.phone || 'no phone listed';
        receipt.push(`No online ordering. Phone ${phone}. ${s.instructions || ''}`);
        job.result = { status: 'manual', shop: pick.name, method: s.method };
        memory.remember(loc, spec, pick);
        if (ux) {
          const act = await ux.result(`${pick.name} has no online ordering.\n\n${pick.address}\nPhone: ${phone}\n\n${s.instructions || 'Bring the PDF in person.'}`,
            [{ key: 'pdf', label: 'Show PDF' }, { key: 'call', label: 'Call' }, { key: 'maps', label: 'Open in Maps' }, { key: 'done', label: 'Done' }]);
          if (act === 'pdf') submit.revealPdf(job.pdf);
          if (act === 'maps') submit.openMaps(pick);
          if (act === 'call' && phone !== 'no phone listed') { try { execFileSync('open', [`tel:${phone.replace(/[^\d+]/g, '')}`]); } catch {} }
        }
      }
    } catch (e) {
      log(`job ${job.id}: delivery failed: ${e.message}`);
      receipt.push(`Delivery failed: ${e.message}`);
      job.result = { status: 'failed', shop: pick.name, error: e.message };
      submit.revealPdf(job.pdf);
      if (ux) await ux.result(`Could not send the job to ${pick.name}:\n\n${e.message}\n\nThe PDF is at:\n${job.pdf}`, [{ key: 'done', label: 'OK' }]);
    }
    return writeReceipt(job, receipt);
  } finally {
    if (ux) ux.close();
  }
}

module.exports = { run };
