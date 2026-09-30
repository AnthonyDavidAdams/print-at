'use strict';
// Cloud-side shop research at near-zero cost: fetch the shop's own page (or a free web
// search for it), pull out emails / phones / hours / prices / order links with regexes,
// and let Jev (typesafe/jev-1.13 via OpenRouter's Decisions API) make the judgments:
// is this the shop's site, does it take print jobs by email, which address, is there an
// online upload. Jev never writes strings, so extraction stays regex; it only decides.
// Runs once per shop; results go in shop_facts and are served to every connected driver.
const JEV = 'typesafe/jev-1.13';
const KEY = process.env.OPENROUTER_API_KEY || '';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 Print@';
const SKIP = /yelp\.|facebook\.|instagram\.|google\.|mapquest|yellowpages|bbb\.org|tripadvisor|nextdoor|foursquare|linkedin|duckduckgo\.com\/y\.js|bing\.com\/aclick|doubleclick/i;

function enabled() { return !!KEY; }

async function fetchText(url, ms = 9000) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!/html|text/i.test(ct)) throw new Error('not html');
  const buf = Buffer.from(await r.arrayBuffer()); return buf.subarray(0, 400000).toString('utf8');
}
function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>|<\/tr>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
async function ddg(query) {
  const html = await fetchText('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), 10000);
  const links = [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)].map(m => m[1]).map(h => { const u = h.match(/uddg=([^&]+)/); return u ? decodeURIComponent(u[1]) : h; });
  return links.filter(u => /^https?:/.test(u) && !SKIP.test(u)).slice(0, 3);
}

function extract(text, html) {
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(e => e.toLowerCase()).filter(e => !/\.(png|jpg|gif|svg|webp)$/.test(e) && !/example\.com|sentry|wixpress|godaddy/.test(e)))].slice(0, 6);
  const phones = [...new Set(text.match(/\(?\b[2-9]\d{2}\)?[-. ]\d{3}[-. ]\d{4}\b/g) || [])].slice(0, 3);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const hours = lines.filter(l => /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.test(l) && /\d\s*(am|pm|:\d\d)/i.test(l) && l.length < 160).slice(0, 8);
  const prices = lines.filter(l => /\$\s?\d/.test(l) && /(page|copy|copies|print|color|b&w|black)/i.test(l) && l.length < 160).slice(0, 8);
  const links = [...new Set((html.match(/href="([^"]+)"/gi) || []).map(h => h.slice(6, -1)).filter(h => /(print|upload|order|quote|submit|send)/i.test(h) && !/mailto:|tel:|\.(png|jpg|css|js)/i.test(h)))].slice(0, 8);
  const mentions = { email_orders: /email (us )?(your|the) (file|pdf|document|order)|send (us )?(your|the) (file|pdf)|e-?mail (your )?(file|document)s?/i.test(text), walk_in: /walk[- ]?in|self[- ]serv/i.test(text), public: /copies|printing|print shop|print services|copy center|business center/i.test(text) };
  return { emails, phones, hours, prices, links, mentions };
}

async function jev(state, questions) {
  // noul questions carry only `instructions`; choice questions need a criteria map.
  for (const q of Object.values(questions)) if (q.type === 'noul' && q.criteria) { q.instructions = `${q.instructions} It holds when: ${q.criteria}`; delete q.criteria; }
  const r = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: JEV, state, questions }), signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (!r.ok || !j.answers) throw new Error('jev: ' + JSON.stringify(j).slice(0, 200));
  return { answers: j.answers, cost: (j.usage && j.usage.cost) || 0 };
}

// Research one shop. Returns a facts object or null when nothing usable was found.
async function researchShop(shop, log = () => {}) {
  if (!enabled()) return null;
  const started = Date.now();
  let urls = [];
  if (shop.url && !SKIP.test(shop.url)) urls.push(shop.url);
  if (!urls.length) { try { urls = await ddg(`${shop.name} ${shop.address || ''} print`); } catch (e) { log(`ddg failed: ${e.message}`); } }
  if (!urls.length) return null;
  let page = null;
  for (const u of urls.slice(0, 2)) {
    try { const html = await fetchText(u); const text = stripHtml(html); if (text.length > 200) { page = { url: u, text: text.slice(0, 12000), ex: extract(text, html) }; break; } } catch (e) { log(`fetch ${u}: ${e.message}`); }
  }
  if (!page) return null;
  const ex = page.ex;
  const state = { shop: `${shop.name}, ${shop.address || ''}`, page_url: page.url, page_excerpt: page.text.slice(0, 6000), emails_found: ex.emails, order_links_found: ex.links, hours_lines: ex.hours, price_lines: ex.prices, mentions: ex.mentions };
  const questions = {
    official_site: { type: 'noul', instructions: 'Is this page the official website of this specific business (not a directory, review site, or a different business)?', criteria: 'The page belongs to the named business itself, at or near the given address, or is its official brand site.' },
    prints_for_public: { type: 'noul', instructions: 'Does this business print documents for walk-in / public customers (copies, document printing, print services)?', criteria: 'The page offers copies, document printing, print services or a business center to the public; not a print-only-for-guests/members rule, not a manufacturer, not a sign-only shop.' },
    accepts_email_orders: { type: 'noul', instructions: 'Can a customer send a document to this business by EMAIL to be printed?', criteria: 'The page says to email files / documents / PDFs for printing, gives a print-orders email, or clearly invites emailed jobs. A generic contact email alone is weak evidence.' },
    has_online_upload: { type: 'noul', instructions: 'Does the business have an online page where a customer can upload a file to order prints?', criteria: 'A link or page for uploading files, online print ordering, or a quote/upload form for print jobs exists.' },
  };
  if (ex.emails.length) questions.order_email = { type: 'choice', instructions: 'Which email address should a customer send a print job to? Pick "none" if no listed address is meant for print orders / general business contact.', criteria: Object.fromEntries([...ex.emails.map(e => [e, `The address ${e} is where this business wants print jobs or general customer inquiries sent.`]), ['none', 'No listed address is an appropriate place to send a print job.']]) };
  if (ex.links.length) questions.upload_link = { type: 'choice', instructions: 'Which link is the online print-ordering / file-upload page for this business? Pick "none" if none is.', criteria: Object.fromEntries([...ex.links.map(l => [l, `${l} is the page where a customer uploads a file or orders printing online.`]), ['none', 'None of these links is an online print ordering page.']]) };
  const { answers, cost } = await jev(state, questions);
  const p = n => answers[n] ? (answers[n].noul ?? answers[n].confidence ?? 0) : 0;
  const choice = n => answers[n] && answers[n].choice && answers[n].choice !== 'none' && (answers[n].confidence ?? 0) >= 0.6 ? answers[n].choice : '';
  if (p('official_site') < 0.5) { log(`${shop.name}: page not judged official (${p('official_site').toFixed(2)})`); return null; }
  const email = p('accepts_email_orders') >= 0.6 ? choice('order_email') : '';
  const upload = p('has_online_upload') >= 0.6 ? choice('upload_link') : '';
  const absUrl = u => { try { return new URL(u, page.url).toString(); } catch { return u; } };
  const submit = email ? { method: 'email', email, instructions: 'Email the PDF with the job details; they confirm price and ready time.' }
    : upload ? { method: 'portal', url: absUrl(upload), instructions: 'Upload the PDF on their online ordering page.' }
    : (ex.phones[0] || shop.phone) ? { method: 'phone', phone: ex.phones[0] || shop.phone, url: page.url, instructions: 'Call to ask how they accept files.' }
    : { method: 'in_person', url: page.url, instructions: 'Bring the file on a USB stick or ask at the counter.' };
  const confidence = Math.round(100 * Math.min(p('official_site'), p('prints_for_public'), email ? p('accepts_email_orders') : upload ? p('has_online_upload') : 0.5)) / 100;
  // A phone/in-person verdict with weak evidence that they even print for the public is not a
  // fact worth serving; leave it unknown so a driver with a real brain researches it.
  if (!email && !upload && p('prints_for_public') < 0.5) { log(`${shop.name}: weak evidence (${p('prints_for_public').toFixed(2)}), not stored`); return null; }
  log(`${shop.name}: ${submit.method}${email ? ' ' + email : ''} conf ${confidence} in ${Date.now() - started}ms, $${cost.toFixed(5)}`);
  return { submit, hours_today: ex.hours.slice(0, 3).join(' · '), cost_basis: ex.prices.slice(0, 3).join(' · '), est_cost_usd: null, rating: null, open_now: null, url: page.url, phone: ex.phones[0] || shop.phone || '', prints_for_public: p('prints_for_public'), confidence, source: 'cloud-jev' };
}

// Generic Jev call for other judgments (support triage).
async function decide(state, questions) { return jev(state, questions); }
module.exports = { researchShop, enabled, extract, stripHtml, decide };
