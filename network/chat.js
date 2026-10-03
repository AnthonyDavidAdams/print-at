/* Print@ help chat: a small popup on every printat.co page. Talks to /api/help/chat,
   which answers from the FAQ when it can and otherwise from a model that knows Print@.
   No cookies; the conversation lives in sessionStorage for this tab only. */
(function () {
  if (window.__paChat) return; window.__paChat = true;
  var API = 'https://printat.co/api/help/chat';
  var css = '\
.pa-chat-btn{position:fixed;right:18px;bottom:18px;z-index:9000;font:700 14px/1 Oswald,-apple-system,system-ui,sans-serif;letter-spacing:1px;text-transform:uppercase;background:#1c3a57;color:#efe4cc;border:3px solid #1c3a57;box-shadow:5px 5px 0 rgba(28,58,87,.25);padding:12px 16px;cursor:pointer;display:flex;align-items:center;gap:8px}\
.pa-chat-btn b{display:inline-block;width:22px;height:22px;border-radius:50%;background:#c8432c;color:#fff;font:800 15px/22px -apple-system,system-ui;text-align:center}\
.pa-chat-btn:hover{background:#274c6e}\
.pa-chat{position:fixed;right:18px;bottom:18px;z-index:9001;width:min(380px,calc(100vw - 36px));height:min(560px,calc(100vh - 36px));background:#f5ecd7;border:3px solid #1c3a57;box-shadow:8px 8px 0 rgba(28,58,87,.2);display:none;flex-direction:column;font:15px/1.45 -apple-system,system-ui,sans-serif;color:#1c3a57}\
.pa-chat.on{display:flex}\
.pa-chat .h{background:#1c3a57;color:#efe4cc;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;font:700 15px Oswald,-apple-system,system-ui,sans-serif;letter-spacing:1px;text-transform:uppercase}\
.pa-chat .h span i{color:#c8432c;font-style:normal}\
.pa-chat .h button{background:none;border:0;color:#efe4cc;font-size:20px;cursor:pointer;line-height:1}\
.pa-chat .m{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px}\
.pa-chat .b{max-width:88%;padding:9px 12px;border:2px solid #1c3a57;background:#fff;white-space:pre-wrap;word-wrap:break-word}\
.pa-chat .b.u{align-self:flex-end;background:#1c3a57;color:#efe4cc}\
.pa-chat .b.a code{font:13px ui-monospace,Menlo,monospace;background:#efe4cc;padding:1px 4px}\
.pa-chat .b.a a{color:#c8432c}\
.pa-chat .t{font-size:12px;color:#5c6f80;padding:0 14px 6px}\
.pa-chat form{display:flex;gap:8px;padding:10px;border-top:2px solid #1c3a57;background:#efe4cc}\
.pa-chat textarea{flex:1;resize:none;font:15px -apple-system,system-ui,sans-serif;padding:8px 10px;border:2px solid #1c3a57;background:#fff;height:44px}\
.pa-chat form button{font:700 13px Oswald,-apple-system,system-ui,sans-serif;letter-spacing:1px;text-transform:uppercase;background:#c8432c;color:#fff;border:2px solid #1c3a57;padding:0 14px;cursor:pointer}\
.pa-chat .f{font-size:12px;color:#5c6f80;padding:6px 14px 10px;background:#efe4cc}\
.pa-chat .f a{color:#c8432c}\
@media(max-width:600px){.pa-chat-btn{right:12px;bottom:12px;padding:10px 12px}.pa-chat-btn span{display:none}.pa-chat{right:0;bottom:0;width:100vw;height:100vh;height:100dvh;border-width:0;box-shadow:none}}\
@media print{.pa-chat,.pa-chat-btn{display:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement('button'); btn.className = 'pa-chat-btn'; btn.type = 'button'; btn.innerHTML = '<b>?</b><span>Help</span>';
  var box = document.createElement('div'); box.className = 'pa-chat'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Print@ help chat');
  box.innerHTML = '<div class=h><span>PRINT<i>@</i> HELP</span><button type=button aria-label=Close>&times;</button></div><div class=m></div><div class=t></div>' +
    '<form><textarea placeholder="Ask anything: where to print, what went wrong, how it works…" aria-label="Your message"></textarea><button type=submit>Send</button></form>' +
    '<div class=f>Not solved? <a href="https://printat.co/help#bug">Send a bug report</a> and a person replies by email.</div>';
  document.body.appendChild(btn); document.body.appendChild(box);
  var msgs = box.querySelector('.m'), typing = box.querySelector('.t'), form = box.querySelector('form'), ta = box.querySelector('textarea');

  var hist = []; try { hist = JSON.parse(sessionStorage.getItem('pa_chat') || '[]'); } catch (e) {}
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function fmt(s) { return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target=_blank rel=noopener>$1</a>'); }
  function add(role, text) { var d = document.createElement('div'); d.className = 'b ' + (role === 'user' ? 'u' : 'a'); d.innerHTML = role === 'user' ? esc(text) : fmt(text); msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; }
  function render() { msgs.innerHTML = ''; if (!hist.length) add('assistant', "Hi. I'm the Print@ helper. Ask me where to print something, how Print@ works, or tell me what went wrong and I'll walk you through it."); hist.forEach(function (m) { add(m.role, m.content); }); }
  function save() { try { sessionStorage.setItem('pa_chat', JSON.stringify(hist.slice(-20))); } catch (e) {} }

  function open() { box.classList.add('on'); btn.style.display = 'none'; render(); setTimeout(function () { ta.focus(); }, 50); }
  function close() { box.classList.remove('on'); btn.style.display = ''; }
  btn.addEventListener('click', open); box.querySelector('.h button').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.classList.contains('on')) close(); });
  if (location.hash === '#chat') open();

  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault(); var q = ta.value.trim(); if (!q || busy) return;
    ta.value = ''; hist.push({ role: 'user', content: q }); add('user', q); save(); busy = true; typing.textContent = 'Thinking…';
    fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: hist.slice(-12), page: location.pathname }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { var a = r.answer || ('Something went wrong on my end' + (r.error ? ' (' + r.error + ')' : '') + '. Try again, or send a bug report below.'); hist.push({ role: 'assistant', content: a }); add('assistant', a); save(); })
      .catch(function () { add('assistant', 'I could not reach printat.co just now. Try again in a moment, or send a bug report below.'); })
      .then(function () { busy = false; typing.textContent = ''; });
  });
  ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); } });
})();
