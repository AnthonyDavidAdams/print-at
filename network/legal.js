'use strict';
// Terms of Use and Privacy Policy for printat.co and the Print@ driver. Plain language.
// Reviewed against a California-lawyer-style review on 2026-09-30; entity details come from env.
const ENTITY = process.env.PRINTAT_ENTITY || 'EarthPilot';                 // full legal name, e.g. "EarthPilot LLC, a California limited liability company"
const DBA = process.env.PRINTAT_DBA || 'EarthPilot';
const ADDRESS = process.env.PRINTAT_ADDRESS || '';                          // mailing address for notices
const VENUE = process.env.PRINTAT_VENUE_COUNTY || 'Humboldt County, California';
const CONTACT = process.env.PRINTAT_LEGAL_EMAIL || 'print@printat.co';
const EFFECTIVE = process.env.PRINTAT_TERMS_EFFECTIVE || '2026-09-30';
const VERSION = EFFECTIVE; // the version string recorded when someone accepts
const who = ENTITY === DBA ? ENTITY : `${ENTITY}, doing business as ${DBA}`;

const TERMS = `
<h2>Terms of Use</h2>
<p class=muted>Effective ${EFFECTIVE}. <b>Print@ is an open-source beta. Use it at your own risk.</b> These terms govern the hosted Print@ services at printat.co: connected-driver services, the Print@ Network, the web portal and the hosted MCP service (together, "Print@"). They are provided by ${who} ("we", "us"). You agree to them by checking "I agree" when you send a job through the portal or list a shop, or by confirming the link that connects your Mac to the hosted service. The open-source driver itself is separately licensed under the MIT License.</p>

<h3>1. What Print@ does</h3>
<p>Print@ finds print shops, hotel and library printers, kiosks and independent shops near you and sends your document to the one you approve. The shops are independent businesses. We are not a print shop, we don't print anything ourselves, and we are not a party to your transaction with the shop.</p>
<p>We send a document only to a recipient you approve, or under automatic-selection settings you explicitly turn on in the Print dialog ("Send without asking"). The driver shows the destination business and the address or upload page it will use. Automated shop information (hours, prices, how they take files) is gathered by software and is not a confirmed quote or a guarantee that a destination is correct. Any charge for printing is set and collected by the shop, usually at pickup; we do not authorize charges on your behalf.</p>

<h3>2. Open-source beta, use at your own risk</h3>
<p>Print@ is beta software and a beta service, offered free and as an open-source project. It will have bugs, it may send a document to the wrong place or not at all, and it may change or shut down without notice. Print@ is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose, merchantability and non-infringement. We don't promise that a shop will be open, will print your job, will charge what was estimated, will keep your document confidential, or will exist. Check anything that matters before you rely on it. These disclaimers do not exclude warranties or consumer rights that cannot legally be excluded, or reduce our legal duties to protect personal information.</p>

<h3>3. Your documents and the other end</h3>
<p>Sending a job gives the selected shop or printer network a copy of your document and the contact information needed to handle the job. We also use service providers to host and deliver files, as described in the <a href="/privacy">Privacy Policy</a>.</p>
<p>Independent shops control their own printing and file-handling practices. We cannot retrieve their copies or guarantee their confidentiality or deletion practices. This does not reduce our responsibility for our own service, our legal duties, or service providers acting for us. Check the recipient before sending, and do not use Print@ for documents whose disclosure could cause serious harm.</p>

<h3>4. What you may not do</h3>
<p>You are responsible for what you print. You may not use Print@ to send material you have no right to reproduce, material that is illegal where you or the shop are, malware, or anything intended to harass, defraud or harm a shop or anyone else. You may not use Print@ to attack, scrape or overload shops, printer networks or our service, or to bypass a shop's own rules. We may restrict or end access for misuse, security risks, legal requirements or discontinuation of the service; we will give notice when reasonably practicable and will not suspend or terminate access for an unlawful reason.</p>

<h3>5. Costs</h3>
<p>The shop sets and collects its own price; you pay the shop. If you configured your own AI provider key, your provider bills you. The hosted service is free today; if we introduce charges we will say so clearly before they apply and ask you to accept them.</p>

<h3>6. Shops on the Print@ Network</h3>
<p>If you list a shop, you confirm you are authorized to do so. You must provide accurate business and contact details and a working email address or endpoint you are authorized to use for receiving jobs. Before charging a customer, disclose the total price and obtain approval unless the customer has already authorized that charge.</p>
<p>Use customer files and contact details only to fulfill and support the requested job and to meet legal obligations. Do not sell them, use them for advertising or AI training, or disclose them except as needed to fulfill the job. Restrict access to authorized people and use reasonable security safeguards. Delete digital copies promptly after fulfillment, and no later than 30 days, unless the customer asks you to keep them or law requires retention. Tell us promptly at ${CONTACT} if a Print@ file is lost, misdirected or accessed without authorization, and cooperate with any response and notices. Tell customers your cancellation, refund, retention and privacy practices before accepting their job. These obligations apply to shops enrolled in the Print@ Network, not to independent printers the driver merely discovers. We may remove a listing at any time.</p>

<h3>7. Limitation of liability</h3>
<p>Subject to the exceptions below, we are not liable for indirect, incidental, special or consequential losses arising from Print@. Our total liability arising from Print@ is limited to the amount you paid us for Print@ in the 12 months before the event giving rise to the claim. Print@ is free today, so that amount is zero unless you have paid us.</p>
<p>These limits do not apply to fraud, willful misconduct, gross negligence, death or personal injury caused by negligence, or liability that applicable law does not allow us to limit. Nothing here limits nonwaivable consumer rights, statutory remedies, or our liability where limiting it would violate applicable law.</p>

<h3>8. Business indemnity</h3>
<p>This section applies only if you use Print@ for a business or list a shop, not if you use it solely as an individual consumer. You will cover third-party claims and reasonable defense costs to the extent caused by your unlawful conduct, infringement of another person's rights, or material breach of these terms. You are not responsible to the extent a claim results from our negligence, misconduct or breach. We will promptly notify you and let you control the defense with reasonably acceptable counsel. No settlement may require us to admit fault, pay money or take action without our consent, which we will not unreasonably withhold.</p>

<h3>9. Eligibility and accounts</h3>
<p>You must be at least 18 years old, or the age of majority where you live, to use the hosted service or list a shop. Print@ is not directed to children under 13 and we do not knowingly collect their information. Take reasonable steps to protect your device and login, and promptly tell us at ${CONTACT} about suspected unauthorized access. You are not automatically responsible for activity you did not authorize.</p>

<h3>10. Your documents, copyright and DMCA</h3>
<p>You retain ownership of your documents. You give us a limited, non-exclusive license to receive, temporarily store, copy and transmit them only as needed to fulfill your instructions. We access document content for troubleshooting only when you authorize it, or when necessary for security or legal compliance. This license does not permit advertising use or AI training and ends when the permitted copies are deleted.</p>
<p>To report copyright infringement, contact ${CONTACT}${ADDRESS ? ' or write to ' + ADDRESS : ''}. Identify the copyrighted work and the allegedly infringing material, including where we can find it; provide your contact details and signature; and state that you have a good-faith belief the use is not authorized by the owner, its agent or law, that your notice is accurate, and, under penalty of perjury, that you are authorized to act for the owner. We respond to valid notices and counter-notices under 17 U.S.C. § 512 and terminate repeat infringers' access in appropriate circumstances. If we remove material under this process, we will provide counter-notice instructions where appropriate.</p>

<h3>11. Beta service</h3>
<p>Print@ is early software under active development. Features may change, break or disappear, and the service may be unavailable without notice. Do not rely on it for anything where a failed or delayed print would cause serious harm.</p>

<h3>12. Third-party names</h3>
<p>FedEx, Staples, Office Depot, The UPS Store, PrinterOn, PrintMe and other brands named in Print@ belong to their owners and are used only to identify where a document can be printed. Print@ is independent and is not affiliated with, endorsed by or sponsored by any of them.</p>

<h3>13. The open-source driver</h3>
<p>The driver is licensed under the MIT License. That license governs your rights to use, copy, modify and distribute the driver. These terms govern our hosted services and do not limit rights granted by the MIT License.</p>

<h3>14. Changes and termination</h3>
<p>We will post revised terms with an effective date. For material changes, we will give reasonable advance notice by email or a prominent in-service notice, unless an urgent legal or security change requires shorter notice. Changes apply prospectively. Where required, we will ask you to accept them before continuing to use the affected service. You may stop using Print@ at any time (<code>~/printat/uninstall.sh</code> removes the driver; email ${CONTACT} to delete your account data). Sections 2, 3, 7, 8, 10, 15 and 16 survive termination.</p>

<h3>15. Governing law and disputes</h3>
<p>California law governs these terms, except that you keep any mandatory protections provided by the law where you live. Please contact ${CONTACT} about a dispute so we can try to resolve it. This does not prevent either party from filing a timely claim, seeking urgent relief or contacting a regulator. Unless applicable law allows or requires another location, disputes will be heard in the state courts in ${VENUE} or the federal courts serving that county. You may bring an eligible claim in small claims court. Nothing in these terms waives a jury trial, a nonwaivable right to pursue a class or representative action, or a right to seek public injunctive relief.</p>

<h3>16. General</h3>
<p>These terms, the Privacy Policy and the MIT License for the driver are the entire agreement between you and us about Print@. Mandatory legal rights prevail over these terms, and the MIT License controls any conflict concerning rights it grants in the driver. If any part is found unenforceable, the rest stays in effect. Our not enforcing a term is not a waiver of it. You may not assign these terms; we may assign them to a successor. There are no third-party beneficiaries. We are not liable for delays or failures caused by events outside our reasonable control. You agree to receive notices from us electronically, including at the email you connected with. Nothing in Print@ is legal, financial or professional advice. You will comply with applicable export and sanctions laws in using Print@.</p>

<h3>17. Contact</h3>
<p>${who}${ADDRESS ? '<br>' + ADDRESS : ''}<br>${CONTACT}</p>
<p class=muted>California consumers may contact the Complaint Assistance Unit of the Division of Consumer Services of the California Department of Consumer Affairs at 1625 North Market Blvd., Suite N 112, Sacramento, CA 95834, or (800) 952-5210.</p>
`;

const PRIVACY = `
<h2>Privacy Policy</h2>
<p class=muted>Effective ${EFFECTIVE}. This explains what Print@ (operated by ${who}) collects, why, where it goes, and how long it stays. It applies to printat.co, the hosted service, and the parts of the driver that talk to us.</p>

<h3>What we collect</h3>
<ul>
<li><b>Account and device</b>: your email address and your Mac's hostname when you connect a driver; a shop's name, address, email, hours and prices when a shop signs up. A business's contact details can identify a person, for example a sole proprietor.</li>
<li><b>Relayed documents</b>: when a connected driver sends an order through the cloud, the document passes through our server in memory and is handed to our email provider for delivery to the shop. We do not keep a copy in our database or on disk. Our email provider retains delivery logs and message content for a limited period under its own policy. We keep the job's metadata: shop, destination address, subject, filename, a reference and the time. Subjects and filenames can reveal what a document is.</li>
<li><b>Portal documents</b>: files sent through the web portal to a Print@ Network shop are stored on our server only so the shop can print them. They are deleted when the shop marks the order picked up, unconfirmed uploads after 2 hours, and anything remaining after 7 days.</li>
<li><b>Shop facts</b>: if sharing is on (it is by default for connected drivers; turn it off in the console), the driver sends us what it verified about shops: how a shop takes files, hours, prices, and whether an order it sent went through. This describes businesses and may include a business's contact details; it does not include your document or your identity. We store it and serve it to other connected drivers.</li>
<li><b>Replies</b>: when a shop replies to an order through a Print@ reply address, the message is relayed to the customer and its text is kept with the order so we can debug problems. Replies can contain whatever the shop wrote.</li>
<li><b>Bug reports and help questions</b>: what you type, an optional screenshot, and, from the driver, diagnostics: versions, settings with keys removed, the last 80 lines of the agent log (which include shop names and job titles), and the last receipt. You choose what to send; screenshots are deleted after 30 days. Do not put confidential documents or credentials in support messages.</li>
<li><b>Location</b>: to find nearby shops the driver first asks macOS Location Services (usually denied for command-line tools), then looks up your approximate location from your IP address through ip-api.com, then falls back to the home address you set in the console. Your coordinates go to Apple Maps for the shop search. Our shop-facts lookup receives the coordinates of the candidate shops, which are near you. We do not keep a history of your locations; our hosting and edge providers keep short-lived request logs that include your IP address.</li>
<li><b>Website</b>: our pages load fonts from Google Fonts, which receives your IP address. We run no analytics or advertising trackers on printat.co.</li>
</ul>

<h3>Where it goes</h3>
<ul>
<li><b>Print shops and printer networks</b>: your document, name and contact email, so they can print it and reach you. Their handling of it is governed by their policies, not ours; enrolled Print@ Network shops also agree to the data-handling rules in our Terms of Use.</li>
<li><b>Email delivery</b>: outbound mail is sent through Resend; inbound mail to @printat.co is routed through Cloudflare Email Routing and a Cloudflare Worker.</li>
<li><b>Hosting</b>: our server and database run on Railway in the United States; the site and domain are fronted by Cloudflare.</li>
<li><b>AI providers, on your Mac</b>: when AI research runs on your Mac, the list of candidate shops, your job's specifications (page count, copies, color, paper, finishing, deadline), your approximate location and previously verified shop facts are sent to the provider you configured: Anthropic through Claude Code, or Anthropic or OpenAI through an API key. Your document is not sent. Your provider account terms govern that processing. We never receive your provider credentials; they stay in the driver's config file on your Mac.</li>
<li><b>AI providers, on our side</b>: bug-report text and diagnostics, help-page questions, and the public web pages of print shops are sent through OpenRouter to a decision model operated by TypeSafe (typesafe/jev) to classify them. Documents are never sent. OpenRouter's and the model operator's retention policies apply to those requests.</li>
</ul>
<p>We do not sell personal information and do not share it for cross-context behavioral advertising.</p>

<h3>Without a hosted connection</h3>
<p>If you do not connect the driver to our hosted service, print jobs are sent through your Mail.app account or SMTP provider rather than our relay, and we receive no job data or shop facts. The driver still makes network requests to Apple Maps, ip-api.com and any AI provider you configured, and checks printat.co once a day for driver updates; you can stop the update check by removing the driver.</p>

<h3>How long we keep it</h3>
<p>Account and device records: until you disconnect or ask us to delete them. Job metadata, shop replies and support text: up to 12 months for support and abuse prevention. Documents and screenshots: as described above. Shop facts: indefinitely, as they describe businesses. Backups of our database may hold deleted records for up to 30 days.</p>

<h3>Security</h3>
<p>Data in transit is encrypted (HTTPS, and TLS to email providers where they support it). Access to the server and database is limited to the people who operate Print@. No system is perfectly secure, and email to a shop is only as secure as the shop's mailbox. If we learn of a breach affecting your personal information we will notify you as the law requires.</p>

<h3>Your choices and privacy requests</h3>
<p>Disconnect any time with <code>printat disconnect</code>; turn off shop-fact sharing in the console; uninstall with <code>~/printat/uninstall.sh</code>. Whether or not a particular privacy law applies to us, you may ask to access, correct or delete personal information we maintain about you by emailing ${CONTACT}. You do not need an account. We may verify your identity and retain information needed for legal, security or other permitted purposes. Where privacy law gives you additional rights, we will honor them. We will not treat you differently for making a request.</p>
<p><b>Do Not Track</b>: our website does not change its behavior in response to browser Do Not Track signals; we honor Global Privacy Control where applicable law requires. <b>Third-party tracking</b>: we do not allow third parties to collect personal information through Print@ about your activities over time and across other websites.</p>
<p><b>Cookies</b>: the shop portal sets one session cookie to keep a shop logged in; the public pages set none.</p>

<h3>If you are in the EU, UK or another place with data-protection law</h3>
<p>${who} is the controller of the data described here, except that for documents and customer details a shop receives, the shop is a separate controller. We process data to provide the service you asked for (contract), to keep the service secure and improve it (legitimate interests), and where you agree to it (shop-fact sharing, bug reports). We do not currently target users outside the United States, and our servers are in the United States, so your data is processed there. You have the rights to access, correct, delete, restrict and port your data and to object to processing, and to complain to your local authority. Email ${CONTACT}.</p>

<h3>Changes</h3>
<p>We will post changes here with a new effective date; for material changes we will give reasonable notice by email or a prominent notice on printat.co.</p>

<h3>Contact</h3>
<p>${who}${ADDRESS ? '<br>' + ADDRESS : ''}<br>${CONTACT}</p>
`;

module.exports = { TERMS, PRIVACY, ENTITY, CONTACT, EFFECTIVE, VERSION };
