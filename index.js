// ============================================================
// index.js — WhatsApp (Baileys) + Express — VPS edition
// Auth stored locally in ./auth/ — no Supabase needed
// ============================================================

const { default: makeWASocket, DisconnectReason, downloadMediaMessage,
        fetchLatestBaileysVersion, Browsers, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { addInvite, isInvited } = require('./invite-store');
require('dotenv').config();
const express = require('express');
const QRCode  = require('qrcode');
const pino    = require('pino');
const flow    = require('./flow');
const config  = require('./config');
const sheets  = require('./sheets');

process.on('uncaughtException',  (err) => console.error('[crash] Uncaught exception:', err.message));
process.on('unhandledRejection', (r)   => console.error('[crash] Unhandled rejection:', r?.message || r));

// Silence libsignal's verbose internal key-rotation chatter that drowns out our real logs
const _origLog = console.log;
console.log = (...args) => {
  const first = args[0];
  if (typeof first === 'string' && (
    first.startsWith('Closing session') ||
    first.startsWith('Removing old closed session') ||
    first.startsWith('Closing open session') ||
    first.startsWith('Removing closed session')
  )) return;
  _origLog.apply(console, args);
};

const app  = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ─── State ───────────────────────────────────────────────────
let currentQR      = null;
let botReady       = false;
let sock           = null;
let isBootstrapping = false;
let replacedAt      = 0;

const sentMessageStore = new Map();
function storeMessage(result) {
  if (result?.key?.id && result?.message) {
    sentMessageStore.set(result.key.id, result.message);
    if (sentMessageStore.size > 500) sentMessageStore.delete(sentMessageStore.keys().next().value);
  }
}

// Safe dedup — only drops genuine Baileys retries (same valid id seen twice).
// Messages without an id are processed normally (we don't have anything to dedup on).
const processedMsgIds = new Set();
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedMsgIds.has(id)) return true;
  processedMsgIds.add(id);
  if (processedMsgIds.size > 1000) processedMsgIds.delete(processedMsgIds.values().next().value);
  return false;
}

// Per-user queue — each user's messages process strictly in order.
// Different users run in parallel. No message is dropped.
const userQueues = new Map();
function runQueued(jid, task) {
  const existing = userQueues.get(jid);
  if (existing) { existing.push(task); return; }
  const queue = [task];
  userQueues.set(jid, queue);
  (async () => {
    while (queue.length > 0) {
      try { await queue[0](); } catch (e) { console.error('[queue]', jid, 'task error:', e.message); }
      queue.shift();
    }
    userQueues.delete(jid);
  })();
}

// Tracks JIDs the admin has invited but who haven't replied yet.
// When an @lid message arrives without senderPn, we associate it with
// the oldest pending invite so the user gets recognized.
const pendingInvites = new Map(); // jid -> timestamp

// Persistent @lid → phone mapping. Baileys provides senderPn on some
// messages but not all. We cache it so subsequent @lid-only messages
// from the same source resolve to the same session/invite key.
const lidToPhone = new Map();     // @lid jid → @s.whatsapp.net jid

function toJid(phone) {
  return phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}
const ownerJid = toJid(process.env.OWNER_WHATSAPP || '919975233763');

// ─── Routes ──────────────────────────────────────────────────
app.get('/', async (_req, res) => {
  const title = config.businessName + ' — WhatsApp Bot';
  if (botReady) return res.send(statusPage('connected', title));
  if (currentQR) {
    try {
      const qr = await QRCode.toDataURL(currentQR, { width: 300 });
      return res.send(statusPage('qr', title, qr));
    } catch { return res.send(statusPage('error', title)); }
  }
  return res.send(statusPage('init', title));
});

app.get('/status', (_req, res) => res.json({
  connected: botReady, activeSessions: flow.activeSessionCount(), uptime: process.uptime()
}));

app.get('/ping', (_req, res) => res.send('pong'));

app.get('/qr', async (_req, res) => {
  if (botReady)   return res.json({ status: 'connected' });
  if (!currentQR) return res.json({ status: 'waiting' });
  try {
    const qr = await QRCode.toDataURL(currentQR, { width: 300 });
    res.json({ status: 'qr', qr });
  } catch { res.json({ status: 'error' }); }
});

app.get('/admin', (req, res) => {
  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  res.send(adminPage(token));
});

app.get('/send', async (req, res) => {
  const { to, token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!to) return res.status(400).send('Missing ?to=');
  if (!sock || !botReady) return res.status(503).send('Bot not ready');
  const jid = toJid(to);
  try {
    await addInvite(jid);
    pendingInvites.set(jid, Date.now());
    storeMessage(await sock.sendMessage(jid, { text: config.adminIntroMessage }));
    res.send(`✅ Sent to ${jid}`);
  } catch (e) { res.status(500).send(e.message); }
});

app.post('/verify-payment', async (req, res) => {
  const { token, phone, bookingId, name, lang } = req.body;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  if (!phone || !bookingId) return res.status(400).json({ error: 'Missing fields' });
  if (!sock || !botReady) return res.status(503).json({ error: 'Bot not ready' });
  const jid = toJid(phone);
  try {
    const msg = config.paymentVerifiedMessage(name || 'there', bookingId, lang || 'en');
    storeMessage(await sock.sendMessage(jid, { text: msg }));
    await sheets.markPaymentVerified(bookingId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HTML pages ───────────────────────────────────────────────
function statusPage(mode, title, qr) {
  if (mode === 'connected') return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:#22c55e;margin-right:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style></head>
<body><div class="card"><h1><span class="dot"></span> Bot is Live</h1><p>${config.businessName}</p>
<p style="font-size:.85rem;margin-top:1rem;color:#94a3b8">Sessions: <span id="s">—</span> | Uptime: <span id="u">—</span></p></div>
<script>setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{document.getElementById('s').textContent=d.activeSessions;document.getElementById('u').textContent=Math.floor(d.uptime)+'s'}),5000)</script>
</body></html>`;

  if (mode === 'qr') return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:2rem;border-radius:1rem;max-width:340px;width:100%}
img{border-radius:.5rem;margin:.75rem 0;width:260px;height:260px}</style></head>
<body><div class="card"><h2>📱 Scan to Link WhatsApp</h2>
<p style="color:#94a3b8;font-size:.82rem;margin:.5rem 0">WhatsApp → Linked Devices → Link a Device</p>
<img id="qr" src="${qr}"/>
<p style="color:#64748b;font-size:.75rem" id="hint">Refreshing every 15s — scan immediately</p></div>
<script>let t=15;setInterval(async()=>{t--;document.getElementById('hint').textContent='Refreshing in '+t+'s';
if(t<=0){t=15;try{const r=await fetch('/qr');const d=await r.json();
if(d.status==='connected'){document.querySelector('.card').innerHTML='<h2>✅ Bot is Live!</h2>';}
else if(d.qr){document.getElementById('qr').src=d.qr;}}catch(e){}}},1000);</script>
</body></html>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta http-equiv="refresh" content="10">
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}</style></head>
<body><div style="text-align:center;background:#1e293b;padding:3rem;border-radius:1rem"><h2>⏳ Starting…</h2>
<p style="color:#94a3b8">Connecting to WhatsApp. Please wait.</p></div></body></html>`;
}

function adminPage(token) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CLEANLY Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;background:#0a1628;color:#e2e8f0;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:1rem}
.card{background:#1e293b;border-radius:1rem;padding:2rem;width:100%;max-width:420px}
h2{margin-bottom:1.5rem;font-size:1.2rem}label{display:block;font-size:.85rem;color:#94a3b8;margin-bottom:.4rem}
input{width:100%;padding:.75rem 1rem;border-radius:.5rem;border:1px solid #334155;background:#0f172a;color:#f1f5f9;font-size:1rem;margin-bottom:1rem;outline:none}
input:focus{border-color:#38bdf8}button{width:100%;padding:.85rem;border-radius:.5rem;border:none;background:#22c55e;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
button:hover{background:#16a34a}button:disabled{background:#334155;cursor:not-allowed}
.result{margin-top:1rem;padding:.75rem 1rem;border-radius:.5rem;font-size:.9rem;display:none}
.result.ok{background:#14532d;color:#86efac}.result.err{background:#4c0519;color:#fca5a5}
.hint{font-size:.78rem;color:#64748b;margin-top:-.5rem;margin-bottom:1rem}</style>
</head><body><div class="card">
<h2>📤 Send Intro Message</h2>
<label>Country Code + Number</label>
<input type="tel" id="phone" placeholder="919876543210" inputmode="numeric"/>
<p class="hint">Include country code, no + or spaces.</p>
<button id="btn" onclick="send()">Send Message</button>
<div class="result" id="result"></div>
</div>
<script>
async function send(){
  const phone=document.getElementById('phone').value.replace(/\\D/g,'');
  const btn=document.getElementById('btn'),result=document.getElementById('result');
  if(phone.length<10){result.textContent='⚠️ Enter a valid number';result.className='result err';result.style.display='block';return;}
  btn.disabled=true;btn.textContent='Sending…';result.style.display='none';
  try{const res=await fetch('/send?to='+phone+'&token=${token}');const text=await res.text();
  result.textContent=res.ok?'✅ '+text:'❌ '+text;result.className='result '+(res.ok?'ok':'err');}
  catch(e){result.textContent='❌ Network error';result.className='result err';}
  result.style.display='block';btn.disabled=false;btn.textContent='Send Message';
  document.getElementById('phone').value='';
}
document.getElementById('phone').addEventListener('keydown',e=>{if(e.key==='Enter')send();});
</script></body></html>`;
}

// ─── Bootstrap ────────────────────────────────────────────────
async function bootstrap() {
  if (isBootstrapping) return;
  isBootstrapping = true;

  // Auth stored locally — sessions, pre-keys, creds all persist on disk
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const logger = pino({ level: 'silent' });

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[wa] version ${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,   // also shows QR in terminal as fallback
    logger,
    browser: Browsers.ubuntu('Chrome'),
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    getMessage: async (key) => sentMessageStore.get(key.id),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) { currentQR = qr; console.log('[wa] QR ready — open http://SERVER_IP:3000'); }
    if (connection === 'open') {
      botReady = true; currentQR = null; isBootstrapping = false;
      console.log('[wa] ✅ WhatsApp connected and ready!');
      // Pre-fetch the Sheets row counts so the FIRST booking is instant
      sheets.warmCounters().catch(e => console.warn('[boot] warmCounters failed:', e.message));
    }
    if (connection === 'close') {
      botReady = false;
      const code     = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const replaced  = code === 440;
      if (loggedOut) {
        console.log('[wa] Logged out — delete ./auth folder and restart to re-scan QR');
        isBootstrapping = false;
        setTimeout(() => bootstrap(), 3000);
      } else if (replaced) {
        const now = Date.now();
        if (now - replacedAt < 180000) {
          console.warn('[wa] 440 again within 3 min — skipping reconnect');
        } else {
          replacedAt = now; isBootstrapping = false;
          console.log('[wa] Connection replaced — reconnecting in 60s...');
          setTimeout(() => bootstrap(), 60000);
        }
      } else {
        console.warn('[wa] Disconnected code:', code, '— reconnecting in 5s...');
        isBootstrapping = false;
        setTimeout(() => bootstrap(), 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    console.log('[wa] upsert type:', type, 'count:', messages.length);
    if (type !== 'notify') return;
    for (const rawMsg of messages) {
      try {
        const rk = rawMsg.key || {};
        console.log('[skip?] remoteJid:', rk.remoteJid, 'id:', rk.id, 'senderPn:', rk.senderPn, 'fromMe:', rk.fromMe, 'hasMsg:', !!rawMsg.message);
        if (rk.fromMe) { console.log('[skip] fromMe'); continue; }
        if (!rawMsg.message) { console.log('[skip] no rawMsg.message (protocol/undecryptable)'); continue; }
        let jid = rk.remoteJid;
        if (!jid) { console.log('[skip] no remoteJid'); continue; }
        if (jid.endsWith('@g.us')) { console.log('[skip] group message'); continue; }
        // Translate @lid → phone. Cache the mapping when senderPn is provided,
        // and reuse the cached mapping when later @lid messages omit senderPn.
        if (jid.endsWith('@lid')) {
          if (rk.senderPn) {
            lidToPhone.set(jid, rk.senderPn);
            console.log('[xlate] @lid', jid, '→', rk.senderPn, '(cached)');
            jid = rk.senderPn;
          } else if (lidToPhone.has(jid)) {
            const cached = lidToPhone.get(jid);
            console.log('[xlate] @lid', jid, '→', cached, '(from cache)');
            jid = cached;
          }
        }
        if (alreadyProcessed(rk.id)) { console.log('[skip] alreadyProcessed id:', rk.id); continue; }

        // @lid fallback: if we still have an @lid jid (no senderPn ever seen)
        // and there's an unconsumed admin invite, transfer the invite to this
        // @lid so the bot recognises the user.
        if (jid.endsWith('@lid') && !await isInvited(jid) && pendingInvites.size > 0) {
          const [oldestJid] = [...pendingInvites.entries()].sort((a, b) => a[1] - b[1])[0];
          console.log('[wa] @lid fallback — transferring invite from', oldestJid, 'to', jid);
          await addInvite(jid);
          pendingInvites.delete(oldestJid);
        } else if (pendingInvites.has(jid)) {
          pendingInvites.delete(jid);
        }

        const msgContent = rawMsg.message || {};
        const msgType    = Object.keys(msgContent)[0] || '';
        let body = '';
        if (msgType === 'conversation')             body = msgContent.conversation || '';
        else if (msgType === 'extendedTextMessage') body = msgContent.extendedTextMessage?.text || '';
        else if (msgType === 'imageMessage')        body = msgContent.imageMessage?.caption || '';

        console.log('[wa] from:', jid, 'body:', JSON.stringify(body).slice(0, 30));

        const liveSock = sock;
        const userJid  = jid;
        const wrappedMsg = {
          from: userJid, body,
          type: msgType === 'imageMessage' ? 'image' : 'chat',
          getContact: async () => ({
            pushname: rawMsg.pushName || '',
            name:     rawMsg.pushName || '',
            id: { _serialized: userJid },
          }),
          downloadMedia: async () => {
            try {
              const buf = await downloadMediaMessage(rawMsg, 'buffer', {}, {
                logger, reuploadRequest: liveSock.updateMediaMessage,
              });
              return { data: buf.toString('base64'), mimetype: msgContent.imageMessage?.mimetype || 'image/jpeg' };
            } catch { return null; }
          },
          reply: async (text) => { storeMessage(await liveSock.sendMessage(userJid, { text })); },
        };

        runQueued(userJid, async () => {
          const before = flow.sessions?.get?.(userJid);
          console.log('[task] start jid:', userJid, 'body:', JSON.stringify(body).slice(0, 30), 'state:', before?.state || 'NEW');
          try {
            const replies = await flow.handleMessage(wrappedMsg);
            const after = flow.sessions?.get?.(userJid);
            console.log('[task] flow returned', replies.length, 'replies; state →', after?.state || 'CLEARED');
            for (const reply of replies) {
              if (typeof reply === 'object' && reply._adminAlert) {
                try {
                  storeMessage(await liveSock.sendMessage(ownerJid, { text: reply._adminAlert }));
                  console.log('[task] sent adminAlert to', ownerJid);
                } catch (e) { console.error('[task] adminAlert send failed:', e.message); }
                continue;
              }
              if (typeof reply === 'string') {
                try {
                  storeMessage(await liveSock.sendMessage(userJid, { text: reply }));
                  console.log('[task] sent reply to', userJid, '(' + reply.length + ' chars)');
                } catch (e) { console.error('[task] reply send failed:', e.message); }
              }
            }
          } catch (err) {
            console.error('[task] handler error for', userJid, ':', err.message, err.stack);
            try { storeMessage(await liveSock.sendMessage(userJid, { text: config.errorMessage }));
                  flow.clearSession(userJid); } catch (_) {}
          }
        });
      } catch (err) {
        console.error('[wa] Outer handler error:', err.message);
      }
    }
  });
}

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`));
bootstrap().catch(err => {
  console.error('[boot] Failed:', err.message);
  setTimeout(() => bootstrap(), 10000);
});
