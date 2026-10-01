// The cover sheet prepends exactly one page to a PDF and leaves non-PDFs untouched.
const fs = require('fs'); const path = require('path');
const cover = require('../../network/cover');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'sample.pdf'));
  const r = await cover.withCover(src, { name: 'Test', code: '123456', shop: 'Shop', filename: 'sample.pdf', copies: 1 });
  const { PDFDocument } = require('pdf-lib');
  const n0 = (await PDFDocument.load(src)).getPageCount(), n1 = (await PDFDocument.load(r.buffer)).getPageCount();
  if (!r.merged || n1 !== n0 + 1 || r.pages !== n0) throw new Error(`expected ${n0 + 1} pages, got ${n1} (merged=${r.merged}, pages=${r.pages})`);
  const r2 = await cover.withCover(Buffer.from('hello'), { name: 'T' });
  if (r2.merged || !r2.cover || r2.buffer.toString() !== 'hello') throw new Error('non-PDF should pass through with a separate cover');
  console.log('cover sheet ok');
})().catch(e => { console.error(e.message); process.exit(1); });
