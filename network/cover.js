'use strict';
// Cover sheet for every print job that leaves printat.co: who it's for, the pickup code,
// what the document is (pages, copies, color), and a message slot at the bottom that is
// ours (a cause, a Print@ Network pitch, later an ad). Prepended to PDFs; for anything
// that isn't a PDF the cover goes along as a separate one-page PDF.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const MESSAGE = process.env.PRINTAT_COVER_MESSAGE ||
  'Print@ is free during the open beta. Have a printer? Any business can take jobs like this one from a web page, no software: printat.co/shop';
const INK = rgb(0.11, 0.14, 0.19), MUTED = rgb(0.42, 0.46, 0.52), RED = rgb(0.86, 0.2, 0.18), LINE = rgb(0.85, 0.87, 0.9);

// The Sent row is a plain date the counter can read at a glance ("Sep 30, 2026"), in the
// customer's timezone (an IANA name the driver sends), not the server's UTC clock: an
// evening job in the US used to read as the next day in GMT. No zone, or one we can't
// parse, falls back to COVER_TZ.
const COVER_TZ = process.env.PRINTAT_COVER_TZ || 'America/Los_Angeles';
function sentDate(tz, at = new Date()) {
  for (const timeZone of [tz, COVER_TZ, 'UTC']) {
    if (!timeZone) continue;
    try { return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: String(timeZone) }); } catch { /* unknown zone: try the next */ }
  }
}

function wrap(font, text, size, width) {
  const out = []; for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(t, size) <= width) line = t; else { if (line) out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

// fields: { name, email, code, ref, shop, filename, pages, copies, color, duplex, when, tz, message }
async function drawCover(doc, f) {
  const page = doc.addPage([612, 792]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold), reg = await doc.embedFont(StandardFonts.Helvetica);
  const L = 54, R = 612 - 54, W = R - L; let y = 792 - 64;
  const text = (s, x, yy, size, font = reg, color = INK) => page.drawText(String(s ?? ''), { x, y: yy, size, font, color });
  text('PRINT', L, y, 34, bold); text('@', L + bold.widthOfTextAtSize('PRINT', 34), y, 34, bold, RED);
  const tmW = bold.widthOfTextAtSize('PRINT@', 34); text('TM', L + tmW + 2, y + 18, 8, reg, MUTED);
  text('Print order', R - reg.widthOfTextAtSize('Print order', 13), y + 14, 13, reg, MUTED);
  text('printat.co', R - reg.widthOfTextAtSize('printat.co', 13), y - 4, 13, reg, MUTED);
  y -= 30; page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LINE });

  // Pickup block: the two things the counter needs, big.
  y -= 40; text('PICKUP NAME', L, y, 9, bold, MUTED); text('PICKUP CODE', L + W / 2, y, 9, bold, MUTED);
  y -= 26; text(f.name || f.email || 'Customer', L, y, 22, bold); text(f.code || f.ref || '', L + W / 2, y, 22, bold, RED);
  if (f.email) { y -= 16; text(f.email, L, y, 10, reg, MUTED); }
  y -= 30; page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LINE });

  // Document block.
  y -= 30; text('DOCUMENT', L, y, 9, bold, MUTED);
  const rows = [
    ['File', f.filename || 'document.pdf'],
    ['Pages', f.pages ? `${f.pages} (plus this cover sheet)` : 'see document (plus this cover sheet)'],
    ['Copies', String(f.copies || 1)],
    ['Print', [f.color ? 'Color' : 'Black and white', f.duplex ? 'two-sided' : 'single-sided'].join(', ')],
    ['Sent to', f.shop || ''],
    ['Sent', f.when || sentDate(f.tz)],
    ['Ref', f.ref || ''],
  ].filter(r => r[1]);
  for (const [k, v] of rows) { y -= 20; text(k, L, y, 11, bold); const lines = wrap(reg, v, 11, W - 90); lines.forEach((ln, i) => { if (i) y -= 15; text(ln, L + 90, y, 11); }); }
  y -= 30; page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: LINE });

  // Shop instructions.
  y -= 26; const note = wrap(reg, 'This job arrived by email from printat.co on the customer\'s behalf. Replying to that email reaches the customer directly. Print the pages that follow; hand them over against the pickup name or code above. Price and payment are between you and the customer.', 10.5, W);
  note.forEach(ln => { text(ln, L, y, 10.5, reg, MUTED); y -= 14; });

  // Message slot (ours).
  const msg = wrap(reg, f.message || MESSAGE, 11, W - 36);
  const boxH = 18 + 16 + msg.length * 15 + 14; const boxY = 60;
  page.drawRectangle({ x: L, y: boxY, width: W, height: boxH, borderColor: LINE, borderWidth: 1, color: rgb(0.97, 0.97, 0.98) });
  let my = boxY + boxH - 22; text('FROM PRINT@', L + 18, my, 9, bold, MUTED); my -= 20;
  msg.forEach(ln => { text(ln, L + 18, my, 11); my -= 15; });
  text('Print@ is an open-source beta. printat.co/terms', L, 36, 8, reg, MUTED);
  return page;
}

async function coverPdf(f) { const doc = await PDFDocument.create(); await drawCover(doc, f); return Buffer.from(await doc.save()); }

// Prepend the cover to a PDF. Returns { buffer, pages, merged }. A file that isn't a
// readable PDF comes back untouched with merged:false and a separate `cover` buffer.
async function withCover(buf, f) {
  let src; try { src = await PDFDocument.load(buf, { ignoreEncryption: true }); } catch { return { buffer: buf, pages: null, merged: false, cover: await coverPdf(f) }; }
  const pages = src.getPageCount();
  const out = await PDFDocument.create();
  await drawCover(out, { ...f, pages: f.pages || pages });
  const copied = await out.copyPages(src, src.getPageIndices());
  copied.forEach(p => out.addPage(p));
  out.setTitle(f.filename || 'Print order'); out.setProducer('printat.co');
  return { buffer: Buffer.from(await out.save()), pages, merged: true };
}

module.exports = { coverPdf, withCover, sentDate, MESSAGE };
