// Print@ inbound mail: every message to an unrouted @printat.co address (job-<ref>@,
// order-<code>@, …) lands here via Cloudflare Email Routing. We parse it and hand it to
// the network server, which relays it to the right person. If the server can't be
// reached the message is forwarded to a human so nothing is lost.
import PostalMime from 'postal-mime';

export default {
  async email(message, env) {
    // DMARC aggregate reports (Google, Microsoft, Yahoo send one a day) go to dmarc@: accept and drop.
    if (/^dmarc@/i.test(message.to || '')) return;
    if (message.rawSize > 15 * 1024 * 1024) { if (env.FALLBACK_TO) await message.forward(env.FALLBACK_TO); return; }
    let parsed;
    try { parsed = await PostalMime.parse(message.raw); } catch (e) { parsed = null; }
    const payload = {
      to: message.to,
      from: parsed?.from?.address || message.from, // header From, not the bounce/envelope sender
      envelopeFrom: message.from,
      subject: parsed?.subject || message.headers.get('subject') || '',
      text: parsed?.text || '', html: parsed?.html || '',
      fromName: parsed?.from?.name || '',
      attachments: (parsed?.attachments || []).slice(0, 5).map(a => ({ filename: a.filename, mimeType: a.mimeType, size: a.content?.byteLength || 0 })),
      messageId: message.headers.get('message-id') || '',
    };
    try {
      const r = await fetch(env.INBOUND_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-printat-inbound': env.INBOUND_SECRET || '' }, body: JSON.stringify(payload) });
      if (r.ok) return;
      console.log('inbound: server said', r.status, await r.text());
    } catch (e) { console.log('inbound: server unreachable', e.message); }
    if (env.FALLBACK_TO) await message.forward(env.FALLBACK_TO);
  },
};
