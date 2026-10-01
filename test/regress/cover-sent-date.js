// Ticket #1: the cover sheet's Sent row is a plain date in the customer's timezone
// ("Sep 30, 2026"), not the server's GMT clock ("Thu, 01 Oct 2026 05:17:57 GMT").
const cover = require('../../network/cover');
(async () => {
  const at = new Date('2026-10-01T05:17:57Z'); // the instant from the report: evening of Sep 30 on the US west coast
  const eq = (got, want, what) => { if (got !== want) throw new Error(`${what}: expected "${want}", got "${got}"`); };
  eq(cover.sentDate('America/Los_Angeles', at), 'Sep 30, 2026', 'Pacific');
  eq(cover.sentDate('America/New_York', at), 'Oct 1, 2026', 'Eastern');
  // No zone from the driver, or junk in its place, still gives a plain date and never throws.
  for (const tz of [undefined, '', 'Not/AZone', {}, 42]) {
    const s = cover.sentDate(tz, at);
    if (!/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(s)) throw new Error(`tz ${JSON.stringify(tz)}: not a plain date: "${s}"`);
  }
  if (/GMT|\d:\d\d/.test(cover.sentDate())) throw new Error('Sent still carries a clock time');
  // A bad zone must not cost the job its cover sheet.
  const pdf = await cover.coverPdf({ name: 'Test', code: '123456', tz: 'Not/AZone' });
  if (pdf.slice(0, 5).toString() !== '%PDF-') throw new Error('cover with a bad tz did not render');
  console.log('cover sent date ok');
})().catch(e => { console.error(e.message); process.exit(1); });
