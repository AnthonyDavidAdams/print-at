'use strict';
// Guides: the questions people actually type into a search box when they need something
// printed and have no printer. Each is a real answer first and a Print@ mention second.
// Rendered at /guides/<slug> with Article + FAQ structured data; listed at /guides and on the landing page.
//
// Body format: paragraphs separated by blank lines; "## " starts a section; "- " starts a list item;
// **bold** and [text](url) inline. Keep claims general (no prices or hours, they change).

const UPDATED = '2026-10-03';

const GUIDES = [
  {
    slug: 'printers-near-me',
    title: 'Printers near me: every way to get something printed today',
    description: 'No printer? Here is where to print near you right now: libraries, print shops, hotel business centers, shipping stores, self-serve kiosks, and how to send the file from your phone or Mac.',
    body: `You need a document on paper and you do not own a printer. The good news is that almost every town has four or five places that will print for you, and most of them take a file by email or upload so you never touch their machine.

## The places that print for the public

- **Public libraries.** The most reliable option in the United States and much of Europe. Most branches charge a small per-page fee, and many now accept jobs by email or through a mobile printing page, so you release the job at the counter or at a kiosk.
- **Print and copy shops.** Independent shops and the chains (FedEx Office, The UPS Store, Staples, Office Depot and similar). They handle color, binding, card stock and large formats, and most accept emailed files or have an upload page.
- **Hotel business centers.** If you are staying at a hotel, ask the front desk. Many hotels run an email-to-print service for guests; some let non-guests pay to use it.
- **Shipping and mailbox stores.** Good for labels and quick black-and-white jobs.
- **Self-serve kiosks.** Found in pharmacies, grocery stores, some convenience stores and campuses. You bring a USB stick or upload from your phone.
- **Coworking spaces and universities.** Members and students usually get a printer; guests often can for a day fee.

## How to find the closest one

Searching "print near me" in Apple Maps or Google Maps works for shops. It does not work well for library and hotel printers, which are rarely listed as printers. Print@ keeps a directory of thousands of public printers (hotel and library printers, kiosks and the chains) and ranks them by distance from where you are standing, so the closest option appears even when it is a library branch and not a store.

## How to get the file there

- **Email it.** Most shops and libraries give you an address; attach the PDF and say how many copies, color or black and white, and the name for pickup.
- **Upload it.** Chains have an order page; some libraries use a mobile printing page.
- **Bring it.** A USB stick works at kiosks and most shops.
- **Print it from the Print dialog.** On a Mac, Print@ adds a printer called Print@ Nearby to every app. Choose it, and the job goes to the nearest shop or public printer with a pickup code.

## What to bring

A government ID is rarely needed for printing, but have the pickup name and, if the shop gave you one, the code. Carry a card; some kiosks and libraries do not take cash.`,
    faq: [
      { q: 'Where can I print documents near me for free?', a: 'Libraries are the closest thing to free; many charge a few cents a page and some waive small jobs. Hotels usually print a few pages free for guests. Shops charge per page.' },
      { q: 'Can I print from my phone at a print shop?', a: 'Yes. Email the file to the shop, use its upload page, or use a mobile printing service if the location supports one. Most accept PDFs, Word files and photos.' },
      { q: 'How do I find library printers near me?', a: 'Search the library system\'s site for "printing" or "mobile printing", or use the Print@ directory, which lists library printers by distance.' },
    ],
    related: ['how-to-print-without-a-printer', 'how-to-print-at-a-library', 'how-to-print-at-a-hotel'],
  },
  {
    slug: 'how-to-print-at-a-hotel',
    title: 'How to print at a hotel (even if you are not a guest)',
    description: 'Hotel business centers, email-to-print at the front desk, and what to do when the hotel has no printer. A practical guide for travelers.',
    body: `Hotels print more boarding passes, tickets and contracts than any other kind of business, and most have a way to do it even when the business center closed years ago.

## Ask the front desk first

Say what you need: "I have a two-page PDF to print." Three things usually happen:

- They give you an **email address** for the hotel printer. You send the file, and the pages come out at the desk or in the business center.
- They point you to a **business center** computer with a printer, often unlocked with your room key.
- They print it **behind the desk** from your phone or a USB stick. Many hotels do this for free for a few pages.

Larger hotels run an email-to-print service (PrinterOn is common) with a public address like a code followed by @printspots.com. You email the file, get a release code back, and type it on the hotel's print station.

## If you are not a guest

Walk in anyway. Business hotels near airports and convention centers routinely let non-guests pay to print, and a polite ask at the desk works more often than not. If they refuse, the closest library branch is usually within a mile or two.

## Sending the file the easy way

Hotel printers are listed in the Print@ directory, so on a Mac you can pick Print@ Nearby in any Print dialog, see the hotel printer ranked by distance, and send to it with the hotel's own email address already filled in. Your receipt shows where to pick it up. From a phone, email the file yourself.

## Things that go wrong

- **The file is huge.** Hotel print services cap attachment size. Export a smaller PDF.
- **Fancy formatting.** Send a PDF, not a Pages or Word file, so the pages come out as you see them.
- **Color.** Many hotel printers are black and white only. Say so if color matters.
- **Confidential documents.** Business center printers are shared. Stand by the printer, and do not leave pages in the tray.`,
    faq: [
      { q: 'Do hotels charge for printing?', a: 'Many print a few pages free for guests. Business centers often charge per page, and non-guests usually pay.' },
      { q: 'Can I email a document to a hotel to print?', a: 'Often yes. Ask the front desk for the printer email address or the business center instructions. Some hotels use an email-to-print service with a release code.' },
      { q: 'What if the hotel has no printer?', a: 'Try the nearest library, a shipping store, or a print shop. Print@ ranks all of them by distance from the hotel.' },
    ],
    related: ['how-to-print-a-boarding-pass', 'digital-nomad-guide-to-printing', 'printers-near-me'],
  },
  {
    slug: 'how-to-print-at-a-library',
    title: 'How to print at a public library: email, mobile printing and the counter',
    description: 'Public libraries are the cheapest, most reliable place to print without a printer. How library printing works, how to send a file from your phone, and what it costs.',
    body: `If you need one thing printed and want it cheap, go to the library. Nearly every public library in the United States, Canada, the UK and Australia prints for the public, members and visitors alike, and the per-page cost is usually the lowest in town.

## Three ways libraries take your file

- **Email to print.** Many systems publish an address per branch, often through PrinterOn, Princh or a similar service. You email the document, then release it at a print station with your email address or a code.
- **Mobile printing page.** You upload from your phone's browser, pick the branch, and pay at the station.
- **A library computer.** Log in as a guest, open your file from email or a USB stick, and print. Ask at the desk for a guest pass if you have no card.

## What it costs and how you pay

Black and white is typically a few cents a page; color a bit more. Most branches take coins or a card at the print station, and some let you add value to a print account at the desk. A library card is usually not required to print.

## The fastest route

Open the branch's page before you go and look for "printing" or "mobile printing". If the branch takes email, send the file from the car and it is waiting when you walk in. On a Mac, Print@ lists library printers in the Print dialog with the right email address for each branch, so you can send from any app and get a receipt that tells you where to pick it up.

## Tips

- Send a **PDF**. Word and Pages files can reflow on the library's machines.
- Email-to-print queues usually hold a job for a day or less; print it the same day.
- Large jobs are fine, but a hundred pages of color is cheaper at a print shop.
- Libraries also scan, fax and laminate at most branches. Ask.`,
    faq: [
      { q: 'Do I need a library card to print?', a: 'Usually not. Most branches let visitors print by paying at the station or asking for a guest pass.' },
      { q: 'Can I print from my phone at the library?', a: 'Yes, at most systems: email the file to the branch printer or use the library\'s mobile printing page, then release it at the print station.' },
      { q: 'How much does library printing cost?', a: 'A few cents per page for black and white in most places, more for color. It varies by system, so check the branch page.' },
    ],
    related: ['printers-near-me', 'how-to-print-without-a-printer', 'how-to-print-a-pdf-near-me'],
  },
  {
    slug: 'digital-nomad-guide-to-printing',
    title: 'The digital nomad guide to printing anywhere',
    description: 'Working from a different city every month and still need paper sometimes. Where to print in any country, how to send files, and how to make it a one-click habit.',
    body: `Paper still shows up: a visa form, a signed lease, a customs declaration, a client contract that must be wet-signed. Nomads learn fast that the printer problem is really a "where" problem, and it has a routine.

## The hierarchy, wherever you land

1. **Coworking space.** If you have a desk, you have a printer. Day passes usually include a few pages.
2. **Library.** Cheapest, and in most countries open to visitors.
3. **Hotel or hostel desk.** Hostels print more than you would think; ask.
4. **Print shop or copy center.** Every city has them, often clustered near universities and government offices. Walk in with a PDF on your phone or email it ahead.
5. **Convenience store kiosks.** In Japan, Korea and Taiwan, the convenience store is the printer. Upload from your phone, get a code, print at the counter machine.

## Make it one click

The slow part is finding the place and figuring out how it takes files. Print@ solves exactly that on a Mac: a printer called Print@ Nearby appears in every Print dialog. Pick it, and it finds the nearest public printer, library, hotel or shop, works out how that place accepts jobs, sends the file, and hands you a receipt with the address and a pickup code. It works from any app, in any country where the directory has coverage, which is most of them.

## Documents that need care

- **Visa and immigration forms.** Print single-sided on plain paper unless told otherwise. Some consulates reject double-sided prints.
- **Contracts.** Send a flattened PDF so signatures and dates do not shift.
- **Boarding passes and tickets.** A phone is fine for most airlines, but some airports and border crossings still want paper. Print the night before at the hotel.
- **Anything confidential.** Prefer a shop that prints while you wait, and take the originals with you.

## Keep a kit

A USB stick with your most-printed PDFs, a photo of your passport page, and the Print@ driver on your Mac. That covers every country you are likely to work from.`,
    faq: [
      { q: 'Where do digital nomads print documents?', a: 'Coworking spaces, libraries, hotel desks, print shops and, in East Asia, convenience store kiosks. Print@ ranks all of them by distance from wherever you are.' },
      { q: 'Can I print abroad from my laptop?', a: 'Yes. Email the file to a shop or library printer, or use Print@ on a Mac to send it from the Print dialog to the nearest place that prints.' },
      { q: 'Is printing abroad expensive?', a: 'Rarely. Libraries and kiosks are cheap almost everywhere; hotels and business centers cost more per page.' },
    ],
    related: ['how-to-print-while-traveling-abroad', 'how-to-print-at-a-hotel', 'how-to-print-a-boarding-pass'],
  },
  {
    slug: 'how-to-print-a-boarding-pass',
    title: 'How to print a boarding pass without a printer',
    description: 'Where to print a boarding pass when you have no printer: hotel desk, airport, library, print shop, or straight from your Mac. Plus when a paper pass is actually required.',
    body: `Most airlines are happy with a boarding pass on your phone. Some airports, some airlines and some border posts still want paper, and the moment you discover that is usually a bad time to be looking for a printer.

## Do you really need paper?

You probably do if: the airline's app warns that mobile passes are not accepted at your departure airport; you are flying a low-cost carrier that charges for airport check-in; you are entering a country that asks for a printed onward ticket; or your phone battery is a gamble. When in doubt, print it. It costs almost nothing and takes five minutes.

## Where to print it

- **Your hotel.** Front desks print boarding passes all day. Email it to them or show the PDF on your phone.
- **The airport.** Self-service kiosks print passes for most airlines, and the check-in desk will too. Low-cost carriers may charge.
- **A library.** Cheapest option on the way to the airport; many accept email-to-print.
- **A print shop or shipping store.** Email the PDF, pick up a minute later.
- **Your Mac, anywhere.** With Print@ installed, open the boarding pass PDF, choose Print@ Nearby, and it finds the closest place that prints and sends it there with a pickup code. The demo job in the installer is, in fact, a boarding pass.

## Getting the pass as a file

In the airline app, look for "share" or "save as PDF" on the pass. In Apple Wallet, tap the three dots and share. If the airline only emails a link, open it in a browser and use the browser's print-to-PDF.

## Print it right

One page per passenger, single-sided, plain paper, black and white is fine. Check that the barcode printed clearly; a smudged barcode means a trip to the desk anyway.`,
    faq: [
      { q: 'Can I print my boarding pass at the airport?', a: 'Yes, at the airline\'s self-service kiosk or the check-in desk. Some low-cost airlines charge a fee for printing at the airport.' },
      { q: 'Will a hotel print my boarding pass?', a: 'Almost always, often free. Email the PDF to the front desk or show it on your phone.' },
      { q: 'Does a boarding pass need to be in color?', a: 'No. Black and white is fine as long as the barcode is sharp.' },
    ],
    related: ['how-to-print-at-an-airport', 'how-to-print-at-a-hotel', 'printers-near-me'],
  },
  {
    slug: 'how-to-print-from-iphone-without-a-printer',
    title: 'How to print from an iPhone or Android when you have no printer',
    description: 'Send a file from your phone to a library, hotel, shop or kiosk printer. The share sheet, email-to-print, upload pages, and what format to send.',
    body: `Your phone has the document. The printer is somewhere else. Here is how to connect the two without owning anything.

## Get the document into a sendable form

From any app, use the share button and choose "Save to Files" or "Print", then pinch outward on the preview to turn it into a PDF you can share. Android has "Print" to PDF in the share menu of most apps. Screenshots work in a pinch but print small; a PDF prints at full size.

## Send it to a printer near you

- **Email to print.** Libraries, hotels and many shops give you an address. Attach the PDF, put the pickup name in the subject, and say copies and color. A release code or a confirmation usually comes back within a minute.
- **Upload page.** Chains and some libraries have a page where you drop the file and pick the location. You pay there or at pickup.
- **Kiosk.** Pharmacy and convenience store kiosks take uploads from your phone's browser or a USB stick, and print while you wait.
- **Walk up.** A print shop will print from your phone over AirDrop, email or a cable.

## Finding the printer

Maps apps find shops but miss library and hotel printers. The Print@ directory covers those and is searchable from a Mac. From a phone, the Print@ Network portal lets you upload a file to a participating local shop and get a pickup code by email.

## What to send

PDF for documents, JPEG or PNG for photos. Avoid sending links to cloud files; the person printing may not be able to open them. Keep attachments small; hotel and library email printers reject very large files.`,
    faq: [
      { q: 'How do I print a PDF from my iPhone without a printer?', a: 'Email it to a library, hotel or shop printer, upload it on the shop\'s page, or take it to a kiosk. Print@ Network shops take uploads from a phone at printat.co/app.' },
      { q: 'Can I AirDrop a file to a print shop?', a: 'Many independent shops accept AirDrop at the counter; ask. Email is the universal fallback.' },
    ],
    related: ['how-to-print-without-a-printer', 'how-to-print-at-a-library', 'printers-near-me'],
  },
  {
    slug: 'how-to-print-without-a-printer',
    title: 'How to print without a printer: the complete list of options',
    description: 'Every realistic way to get pages on paper when you do not own a printer, ranked by cost and effort, with the fastest route for each.',
    body: `Owning a printer is optional now. It is cheaper and less annoying to borrow one a few times a year, as long as you know where they are and how they take files.

## Ranked by effort

1. **A Mac with Print@.** Choose Print@ Nearby in the Print dialog of any app. It finds the closest public printer or shop, sends the file the way that place accepts it, and gives you a pickup code. One click, no searching.
2. **Email to a library or hotel printer.** Two minutes if you know the address.
3. **A shop's upload page.** Five minutes, pay online, pick up.
4. **Walk into a shop with the file on your phone.** Ten minutes, pay at the counter.
5. **A kiosk with a USB stick.** Works everywhere, including at midnight in a convenience store in Tokyo.
6. **Ask a neighbor or your office.** Free, socially expensive.

## Ranked by cost

Libraries are cheapest, then kiosks, then shipping stores and chains, then hotels and business centers. Independent print shops vary and are often the best value for anything beyond a few pages.

## When each one is right

- **One page, right now:** library, hotel desk or the nearest shop.
- **Fifty pages, double-sided, stapled:** a print shop or chain; they finish it properly.
- **Photos:** a pharmacy kiosk or a photo lab, not an office printer.
- **Labels and shipping:** a shipping store; they print and often ship in one stop.
- **Posters and large format:** a print shop with a wide-format machine.

## What to send

PDF. Always PDF. It prints the same on their machine as on your screen.`,
    faq: [
      { q: 'What is the cheapest way to print without a printer?', a: 'A public library. Per-page fees are the lowest you will find, and most take files by email or mobile upload.' },
      { q: 'Can I print from my laptop to a store?', a: 'Yes. Email the file, use the store\'s upload page, or on a Mac use Print@ to send it from the Print dialog.' },
    ],
    related: ['printers-near-me', 'how-to-print-at-a-library', 'how-to-email-a-document-to-a-print-shop'],
  },
  {
    slug: 'how-to-print-a-shipping-label-without-a-printer',
    title: 'How to print a shipping label without a printer',
    description: 'Return labels, prepaid labels and marketplace shipping labels: where to print them, QR code drop-offs that need no printing at all, and how to get the label as a PDF.',
    body: `A shipping label is one page, usually black and white, and the carrier wants it taped to a box. You have three routes, and one of them needs no printer at all.

## Route one: skip the printing

Most carriers now accept a **QR code** at the counter. The retailer or marketplace emails the code, the clerk scans it and prints the label for you. Look for "print at the store" or "QR code" in the return instructions before you go looking for a printer.

## Route two: print it at the carrier's store

Shipping stores and carrier counters print labels from an emailed PDF or a code, often for a small fee or free with a shipment. Bring the box; they tape it too.

## Route three: print it anywhere

Save the label as a PDF (the carrier's page has a download or print button; use print-to-PDF if not). Then:

- Email it to a library or hotel printer and pick it up.
- Send it to the nearest shop with Print@ from a Mac; the receipt shows the pickup address.
- Print at a kiosk from your phone.

## Getting the label right

- Print at **100% scale**, never "fit to page" if the label has a size marked on it.
- Plain paper and clear tape over the whole label works for every major carrier; thermal label paper is not required.
- Do not tape over the barcode with anything glossy that could glare under a scanner.
- If the label is two pages, the second page is usually a receipt; ship only the label.`,
    faq: [
      { q: 'Can I ship a package without printing a label?', a: 'Often yes. Many returns and prepaid shipments come with a QR code that the carrier scans and prints at the counter.' },
      { q: 'Where can I print a shipping label near me?', a: 'Shipping stores, carrier counters, libraries, print shops and kiosks. Any place that prints a PDF can print a label.' },
    ],
    related: ['how-to-print-without-a-printer', 'how-to-email-a-document-to-a-print-shop', 'printers-near-me'],
  },
  {
    slug: 'how-to-email-a-document-to-a-print-shop',
    title: 'How to email a document to a print shop (and what to write)',
    description: 'The email that gets your job printed right the first time: subject line, what to say, file format, and how chains and local shops handle emailed orders.',
    body: `Most print shops would rather get an email than a walk-in with a phone. Here is the email that works.

## The email

**Subject:** Print order, pickup name Jane Lee

**Body:** Please print the attached PDF: 12 pages, 2 copies, black and white, single-sided, stapled. Needed by 3pm today. Pickup name Jane Lee, phone 555 0100. Please reply with the price. Thank you.

Attach the PDF. That is the whole thing. Specify: page count, copies, color or black and white, one or two sided, paper if it matters, finishing (staple, hole punch, bind), and when you need it.

## Finding the address

- **Chains** (FedEx Office, The UPS Store, Staples, Office Depot and others) generally prefer their online order page, and many locations also take email. The location page lists which.
- **Independent shops** almost always take email; the address is on their site or Google listing.
- **Libraries and hotels** publish printer addresses for email-to-print services.

Print@ keeps the right order address for thousands of locations and, for shops it has not seen, reads the shop's website to find out how it takes files. On a Mac, the Print dialog sends the email for you from a Print@ address, and the shop's reply lands in your inbox.

## File format

PDF. If the shop needs something else, it will say. Flatten forms, embed fonts (any "export as PDF" does this) and check page size: US Letter in the US, A4 almost everywhere else.

## After you send

Expect a reply with price and timing. Many shops want payment at pickup; some send a link. If you hear nothing in an hour on a weekday, call. Email filters eat print orders more than you would think.`,
    faq: [
      { q: 'Can I email a PDF to FedEx Office or Staples to print?', a: 'Many locations accept email or have an online order page where you upload the file and choose the store. Check the specific location.' },
      { q: 'What should I include when emailing a print job?', a: 'Page count, copies, color or black and white, single or double sided, finishing, when you need it, and the pickup name and phone.' },
    ],
    related: ['how-to-print-without-a-printer', 'how-to-print-a-pdf-near-me', 'printers-near-me'],
  },
  {
    slug: 'how-to-print-while-traveling-abroad',
    title: 'How to print documents while traveling abroad',
    description: 'Printing in another country: what to expect in Europe, Asia and Latin America, paper sizes, convenience store kiosks, and how to send a file when you do not speak the language.',
    body: `Printing abroad is easy once you know the local habit. Every region has a default place people go, and it is rarely the one you would guess from home.

## By region

- **Western Europe.** Copy shops near universities and train stations, libraries, and hotel desks. Paper is A4; your US Letter PDF will print with small margins, which is fine.
- **Japan, Korea, Taiwan.** Convenience stores. Upload from your phone to the store chain's print service, get a code, print at the machine by the door, any hour.
- **Southeast Asia.** Small print shops are everywhere and cheap; look for signs saying "print", "photocopy" or "fotocopy". Hotels print for guests.
- **Latin America.** "Papelería", "ciber" and "centro de copiado" shops. Bring the file on a USB stick or email it; many also accept WhatsApp.
- **Australia and New Zealand.** Libraries and office supply chains, plus hotel desks.

## Sending without the language

Email removes the conversation. Attach the PDF, and in the subject write the pickup name and the number of copies as digits. A one-line body in English is usually understood; copies, color and sides are the only facts that matter. Print@ does this automatically from a Mac: it finds the nearest shop or public printer, writes the order email, and gives you the address to walk to.

## Paper and power

You will get A4 outside North America. For forms that must be on Letter, nobody at a border will notice. Your laptop charger needs a plug adapter; the printer does not care.

## Documents travelers print most

Visa applications and e-visa approvals, onward tickets, hotel confirmations for immigration, insurance certificates, and rental car vouchers. Print the ones a border officer might ask for before you reach the border, not at it.`,
    faq: [
      { q: 'Can I print at a convenience store abroad?', a: 'In Japan, Korea and Taiwan, yes, around the clock, by uploading from your phone and typing a code at the store machine.' },
      { q: 'Will my US Letter document print abroad?', a: 'Yes, on A4 paper with slightly different margins. It is rarely a problem.' },
    ],
    related: ['digital-nomad-guide-to-printing', 'how-to-print-a-boarding-pass', 'how-to-print-at-a-hotel'],
  },
  {
    slug: 'how-to-print-at-an-airport',
    title: 'How to print at an airport',
    description: 'Boarding passes, visas, insurance letters: where to print inside the terminal, what the airline desk will print, and the places just outside the airport that are faster.',
    body: `Airports are built for people who already have their documents. Printing inside one is possible, but it helps to know which doors to try.

## Inside the terminal

- **Airline kiosks and desks** print boarding passes and, sometimes, itineraries. They will not print your visa letter.
- **Business lounges** usually have a printer. If you have access through a card or a ticket, this is the easiest option.
- **Business centers** exist in large international terminals, often inside a hotel attached to the airport. They charge per page.
- **Airport hotels.** The front desk prints for guests and often for anyone polite. The hotel is frequently closer than the business center.
- **Shipping store counters** at some larger airports print and ship.

## Just outside

A library branch or print shop near the airport is often faster than anything inside security, especially if you have a car or a long layover. Print@ ranks these by distance from where you are, so from the terminal you can see the three closest places and how each takes files.

## Before you get there

If the document matters, print it the night before at the hotel. Airports are the worst place to discover that a mobile pass is not accepted or that an immigration officer wants a paper itinerary.

## From your phone at the gate

Email the PDF to an airport hotel's desk or the lounge, and ask them to hold it. Lounges in particular are used to this.`,
    faq: [
      { q: 'Can I print documents at the airport?', a: 'Yes, in lounges, business centers, airport hotels and at some shipping counters. Airline desks print boarding passes only.' },
      { q: 'Is it free to print a boarding pass at the airport?', a: 'For most full-service airlines, yes at a kiosk or desk. Some low-cost carriers charge.' },
    ],
    related: ['how-to-print-a-boarding-pass', 'how-to-print-at-a-hotel', 'how-to-print-while-traveling-abroad'],
  },
  {
    slug: 'how-to-print-a-pdf-near-me',
    title: 'How to print a PDF near me',
    description: 'The fastest way to get a PDF printed close to where you are: send it by email or upload, pick it up with a code, or send it straight from the Print dialog on a Mac.',
    body: `A PDF is the easiest file to get printed anywhere, because it looks the same on every machine. The only question is which machine.

## The one-click way on a Mac

Install Print@ once. From then on, open the PDF in Preview or any app, choose Print, pick Print@ Nearby as the printer, and click Print. A window finds the nearest place that prints, shows you the choice, sends the file the way that shop or library accepts it, and emails you a pickup code and address. The file is deleted from Print@ as soon as the job is delivered.

## The two-minute way from anywhere

Find a place with the directory or a maps search, then:

- **Email the PDF** to the shop or library printer with copies and the pickup name in the subject.
- **Upload it** on the shop's order page.
- **Carry it** on a USB stick to a kiosk.

## Which place for which PDF

- A page or two: library or hotel desk.
- A report with a cover: print shop or chain, ask for a staple or a spiral bind.
- A poster: a shop with wide-format printing; most libraries cannot.
- Anything confidential: a shop that prints while you wait.

## Make the PDF print well

Export at actual size; do not shrink to fit unless the shop asks. Embed fonts (exporting from any modern app does this). Check the page size matches the local paper. If it has form fields, flatten it so the values print.`,
    faq: [
      { q: 'How do I print a PDF from my Mac at a shop?', a: 'With Print@ installed, choose Print@ Nearby in the Print dialog. It finds the nearest shop or public printer and sends the PDF with a pickup code.' },
      { q: 'Can I print a PDF from my phone near me?', a: 'Email it to a library, hotel or shop printer, upload it on a shop\'s order page, or use a Print@ Network shop at printat.co/app.' },
    ],
    related: ['printers-near-me', 'how-to-email-a-document-to-a-print-shop', 'how-to-print-from-iphone-without-a-printer'],
  },
  {
    slug: 'how-to-let-an-ai-agent-print',
    title: 'How to let an AI agent print documents in the real world',
    description: 'Give Claude or any agent a printer: the Print@ MCP server finds a print shop near a location, sends a document, and returns a pickup code. Setup and what the tools do.',
    body: `Agents can book, buy, write and send, but paper has been out of reach. Print@ ships an MCP server so an agent can find a print shop near any address, send a document there, and hand back a pickup code, with a person approving the order where it matters.

## What the agent can do

- **Find printers near a place.** Public printers, hotel and library printers, kiosks and shops, ranked by distance from an address or coordinates.
- **Send a document.** Email the file to a shop that accepts emailed orders, or submit it to a Print@ Network shop and receive a pickup code.
- **Report back.** The destination, how it was sent, and the code or confirmation.

## Setup

The server lives in the Print@ repository under mcp. Add it to the agent's MCP configuration, connect it to the Print@ cloud once, and the tools appear. Claude Desktop, Claude Code and any MCP client can use it.

## Guardrails that are built in

The agent chooses from real destinations; it cannot invent an email address. Orders to independent shops go through the shop's actual order channel, and the person who owns the account gets the receipt. Files are deleted from Print@ once delivered. The terms at printat.co/terms apply to agent use the same as to a person.

## Example

"Print my boarding pass at a shop near the airport hotel." The agent looks up printers near the hotel, picks a shop that takes emailed orders, sends the PDF with the pickup name, and replies with the shop's address and the reference. The person walks over and picks it up.`,
    faq: [
      { q: 'Can Claude print a document?', a: 'With the Print@ MCP server, yes. It finds a shop or public printer near a location, sends the file, and returns a pickup code.' },
      { q: 'Is the Print@ MCP server open source?', a: 'Yes, MIT licensed, in the print-at repository on GitHub.' },
    ],
    related: ['how-to-print-a-pdf-near-me', 'printers-near-me', 'how-to-print-a-boarding-pass'],
  },
  {
    slug: 'where-to-print-library-vs-shop-vs-hotel',
    title: 'Library, print shop or hotel: where should you print?',
    description: 'A plain comparison of the three places most people print when they have no printer: cost, speed, what each can do, and when to pick which.',
    body: `Three places print most of the world's "I don't have a printer" jobs. They are good at different things.

## Library

**Best for:** a few pages, cheap, no fuss. **Weak at:** finishing, color-heavy jobs, large formats, anything after closing time. Libraries take email or mobile uploads at most branches and charge per page. Visitors can print without a card almost everywhere.

## Print shop

**Best for:** anything that needs to look finished: reports, binding, card stock, posters, color. **Weak at:** price for a single page, and hours on weekends. Independent shops and chains both take emailed files or uploads, and they will tell you the price before printing. Turnaround on a small job is minutes.

## Hotel

**Best for:** travelers who need one page now. **Weak at:** everything else. Front desks print boarding passes and confirmations, often free for guests, and business centers charge per page. Color is rare.

## A simple rule

- One to five pages, black and white: library, or the hotel if you are staying there.
- More than that, or anything you would hand to a client: a print shop.
- Photos: a photo kiosk or lab, none of the above.

## Finding the nearest of each

Print@ keeps all three in one directory and ranks by distance, so you can see at a glance whether the library is closer than the shop. On a Mac it sends the job from the Print dialog; from a phone, email the file.`,
    faq: [
      { q: 'Is it cheaper to print at a library or a print shop?', a: 'The library, per page. Print shops are better value for larger or finished jobs.' },
      { q: 'Can non-guests print at a hotel?', a: 'Sometimes. Business hotels often allow it for a fee; a polite ask at the desk usually works.' },
    ],
    related: ['how-to-print-at-a-library', 'how-to-print-at-a-hotel', 'printers-near-me'],
  },
  {
    slug: 'last-minute-printing-guide',
    title: 'Last-minute printing: how to get something on paper in the next hour',
    description: 'A fast checklist for when you need a document printed right now: the quickest places, the fastest way to send the file, and the mistakes that cost an extra trip.',
    body: `The clock is running. Here is the order of operations that gets you paper fastest.

## Minute one: get the file ready

Export it as a PDF. Check the page count. If it is a form, flatten it. Put it somewhere you can attach it from your phone: email it to yourself or save it to Files.

## Minute two: pick the place

- **Staying at a hotel?** Front desk. Done.
- **Near a library branch?** Check that it takes email-to-print; send it from where you are and walk over.
- **Otherwise:** the nearest print shop or shipping store. Email the PDF with the pickup name and copies in the subject, then go.
- **On a Mac:** choose Print@ Nearby in the Print dialog. It picks the nearest place, sends the file the right way and gives you the address and a code. This is the shortest path when you do not know the area.

## Minute five: confirm

If you emailed a shop, call to confirm they saw it. Email filters are the most common reason a last-minute job is not ready when you arrive.

## The mistakes that cost a second trip

- Sending a Word file that reflows on their machine. Send PDF.
- Forgetting to say the number of copies.
- Arriving without a card; some kiosks and libraries do not take cash.
- Leaving the only copy in a shared printer tray.
- Trusting a mobile boarding pass at an airport that wants paper. Print it anyway.`,
    faq: [
      { q: 'Where can I print something right now near me?', a: 'Hotel desk if you are a guest, otherwise the nearest library branch or print shop. Email the PDF first so it is ready when you arrive.' },
    ],
    related: ['printers-near-me', 'how-to-print-a-pdf-near-me', 'how-to-print-without-a-printer'],
  },
  {
    slug: 'how-to-print-from-a-mac-to-a-print-shop',
    title: 'How to print from a Mac straight to a print shop',
    description: 'Turn the Print dialog into a way to send jobs to the nearest print shop, library or hotel printer. What Print@ does, how to install it, and how a job flows from Cmd-P to pickup.',
    body: `The Print dialog on a Mac already knows how to talk to printers you own. Print@ teaches it about the ones you do not.

## What it adds

After install, every app's Print dialog lists a printer called **Print@ Nearby**. Choosing it does not print on your desk. It finds where you are, looks up the public printers, libraries, hotel printers, kiosks and shops nearby, ranks them for your job (closest, cheapest, or open now), and sends the file to the one you approve. You get a receipt with the address and a pickup code. Independent shops reply to you by email.

## Installing

Open Terminal and paste the one line from printat.co, or download the installer package. It needs the Xcode Command Line Tools and Node.js, both free. Then run printat connect with your email so jobs go out through the Print@ cloud with the full directory.

## A job, step by step

1. Cmd-P in any app. Choose Print@ Nearby. Set copies and color as usual.
2. A window appears with the nearest options and how each one takes files.
3. Approve one. Print@ emails the shop or submits the upload for you, with a cover sheet carrying your pickup name and code.
4. Your receipt opens with the address. The shop's reply, if any, lands in your inbox.
5. Pick it up. Print@ deletes the file as soon as the job is delivered.

## Options worth knowing

In the Print dialog's Print@ settings you can set a maximum distance, prefer a shop type, confirm your location first, or let it send without asking for shops it already knows. The console at 127.0.0.1:4243 keeps your pinned shops, settings and job history.

## It is open source

The driver is MIT licensed on GitHub. The hosted part at printat.co is free during the beta.`,
    faq: [
      { q: 'How do I add a print shop as a printer on my Mac?', a: 'Install Print@. It adds Print@ Nearby to every Print dialog and routes the job to the nearest shop or public printer.' },
      { q: 'Does Print@ work with any app?', a: 'Yes. Anything that can print on a Mac can print to Print@ Nearby.' },
    ],
    related: ['how-to-print-a-pdf-near-me', 'how-to-let-an-ai-agent-print', 'printers-near-me'],
  },
];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => /^https?:\/\/|^\//.test(u) ? `<a href="${u}">${t}</a>` : t);

function bodyHtml(md) {
  const out = []; let list = null; let olist = null;
  const flush = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; } if (olist) { out.push(`<ol>${olist.join('')}</ol>`); olist = null; } };
  for (const block of md.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n');
    if (lines.every(l => /^- /.test(l))) { flush(); out.push(`<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`); continue; }
    if (lines.every(l => /^\d+\. /.test(l))) { flush(); out.push(`<ol>${lines.map(l => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`); continue; }
    flush();
    if (/^## /.test(block)) out.push(`<h2>${inline(block.slice(3))}</h2>`);
    else out.push(`<p>${inline(block.replace(/\n/g, ' '))}</p>`);
  }
  flush(); return out.join('\n');
}

const byTitle = () => GUIDES.map(g => ({ slug: g.slug, title: g.title, description: g.description }));
const find = slug => GUIDES.find(g => g.slug === slug);

module.exports = { GUIDES, UPDATED, bodyHtml, byTitle, find, esc };
