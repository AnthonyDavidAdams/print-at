#!/usr/bin/env python3
"""Send a plain-text email with one PDF attached via SMTP (Gmail app password)."""
import argparse, os, smtplib, sys
from email.message import EmailMessage

p = argparse.ArgumentParser()
p.add_argument('--to', required=True)
p.add_argument('--cc', default='')
p.add_argument('--subject', required=True)
p.add_argument('--body-file', required=True)
p.add_argument('--attach', required=True)
p.add_argument('--from', dest='from_addr', required=True)
p.add_argument('--from-name', default='')
p.add_argument('--env', required=True)
p.add_argument('--host', default='smtp.gmail.com')
p.add_argument('--port', type=int, default=587)
a = p.parse_args()

password = os.environ.get('GMAIL_APP_PASSWORD')
if not password and os.path.exists(a.env):
    for line in open(a.env):
        line = line.strip()
        if line.startswith('GMAIL_APP_PASSWORD='):
            password = line.split('=', 1)[1].strip().strip('"').strip("'")
if not password:
    sys.exit('no GMAIL_APP_PASSWORD in env or ' + a.env)

msg = EmailMessage()
msg['From'] = f'{a.from_name} <{a.from_addr}>' if a.from_name else a.from_addr
msg['To'] = a.to
if a.cc:
    msg['Cc'] = a.cc
msg['Subject'] = a.subject
msg.set_content(open(a.body_file, encoding='utf-8').read())
if a.attach and a.attach != '/dev/null' and os.path.exists(a.attach) and os.path.getsize(a.attach) > 0:
    with open(a.attach, 'rb') as f:
        msg.add_attachment(f.read(), maintype='application', subtype='pdf', filename=os.path.basename(a.attach))

with smtplib.SMTP(a.host, a.port, timeout=60) as s:
    s.starttls()
    s.login(a.from_addr, password)
    s.send_message(msg)
print(f'sent to {a.to}' + (f' cc {a.cc}' if a.cc else ''))
