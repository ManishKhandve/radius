// ============================================================
// index.js — WhatsApp client (Baileys) + Express server + QR page
// ============================================================

const { default: makeWASocket, DisconnectReason, downloadMediaMessage, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { useSupabaseAuthState } = require('./supabase-store');
const { addInvite } = require('./invite-store');
require('dotenv').config();
const express = require('express');
const QRCode  = require('qrcode');
const pino    = require('pino');
const flow    = require('./flow');
const config  = require('./config');
const sheets  = require('./sheets');

// ─── Global crash guards ──────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[crash] Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[crash] Unhandled rejection (server kept alive):', reason?.message || reason);
});

const app  = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ─── State ───────────────────────────────────────────────────
let currentQR      = null;
let botReady       = false;
let sock           = null;
let supabase       = null;
let isBootstrapping = false;

// Convert any phone/JID to Baileys @s.whatsapp.net format
function toJid(phone) {
  return phone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}

const ownerJid = toJid(process.env.OWNER_WHATSAPP || '919975233763');

// ─── Express Routes ──────────────────────────────────────────

app.get('/', async (_req, res) => {
  if (botReady) return res.send(statusPage('connected'));
  if (currentQR) {
    try {
      const qrDataUrl = await QRCode.toDataURL(currentQR, { width: 300 });
      return res.send(statusPage('qr', qrDataUrl));
    } catch (e) {
      return res.send(statusPage('error'));
    }
  }
  return res.send(statusPage('initializing'));
});

app.get('/status', (_req, res) => {
  res.json({
    connected: botReady,
    activeSessions: flow.activeSessionCount(),
    uptime: process.uptime(),
  });
});

app.get('/ping', (_req, res) => res.send('pong'));

app.get('/qr', async (_req, res) => {
  if (botReady)   return res.json({ status: 'connected' });
  if (!currentQR) return res.json({ status: 'waiting' });
  try {
    const qrDataUrl = await QRCode.toDataURL(currentQR, { width: 300 });
    res.json({ status: 'qr', qr: qrDataUrl });
  } catch {
    res.json({ status: 'error' });
  }
});

app.get('/admin', (req, res) => {
  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  res.send(adminPage(token));
});

app.get('/send', async (req, res) => {
  const { to, token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!to) return res.status(400).send('Missing ?to= phone number');
  if (!sock || !botReady) return res.status(503).send('Bot not ready yet — try again in a moment');

  const jid = toJid(to);
  try {
    await addInvite(jid);
    await sock.sendMessage(jid, { text: config.adminIntroMessage });
    res.send(`✅ Message sent to ${jid}`);
  } catch (err) {
    console.error('[send] Error:', err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.post('/verify-payment', async (req, res) => {
  const { token, phone, bookingId, name, lang } = req.body;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  if (!phone || !bookingId) return res.status(400).json({ error: 'Missing phone or bookingId' });
  if (!sock || !botReady) return res.status(503).json({ error: 'Bot not ready' });

  const jid = toJid(phone);
  try {
    const msg = config.paymentVerifiedMessage(name || 'there', bookingId, lang || 'en');
    await sock.sendMessage(jid, { text: msg });
    await sheets.markPaymentVerified(bookingId);
    console.log(`[verify-payment] Confirmed: ${bookingId} → ${jid}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[verify-payment] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HTML helpers ─────────────────────────────────────────────
function statusPage(mode, qrDataUrl) {
  const title = config.businessName + ' — WhatsApp Bot';
  if (mode === 'connected') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:#22c55e;margin-right:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
h1{margin:0 0 .5rem}p{color:#94a3b8;margin:.25rem 0}</style></head>
<body><div class="card"><h1><span class="dot"></span> Bot is Live</h1><p>${config.businessName}</p><p style="font-size:.85rem;margin-top:1rem">Sessions: <span id="s">—</span> | Uptime: <span id="u">—</span></p></div>
<script>setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{document.getElementById('s').textContent=d.activeSessions;document.getElementById('u').textContent=Math.floor(d.uptime)+'s'}),5000)</script></body></html>`;
  }
  if (mode === 'qr') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:2rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:340px;width:100%}
img{border-radius:.5rem;margin:.75rem 0;width:260px;height:260px}
.badge{display:inline-block;padding:.25rem .75rem;border-radius:999px;font-size:.75rem;margin-bottom:.5rem}
.fresh{background:#14532d;color:#86efac}
.stale{background:#713f12;color:#fde68a}
</style></head>
<body><div class="card">
  <h2 style="margin-bottom:.25rem">📱 Scan to Link WhatsApp</h2>
  <p style="color:#94a3b8;font-size:.82rem;margin-bottom:.5rem">Open WhatsApp → Linked Devices → Link a Device</p>
  <span class="badge fresh" id="badge">🟢 Fresh QR</span><br>
  <img id="qrimg" src="${qrDataUrl}" alt="QR Code"/>
  <p style="color:#64748b;font-size:.75rem" id="hint">Auto-refreshes every 15 sec — scan immediately after refresh</p>
</div>
<script>
  let countdown = 15;
  setInterval(async () => {
    countdown--;
    document.getElementById('hint').textContent = 'Refreshing in ' + countdown + 's — scan immediately after';
    if (countdown <= 3) {
      document.getElementById('badge').className = 'badge stale';
      document.getElementById('badge').textContent = '🟡 Expiring…';
    }
    if (countdown <= 0) {
      countdown = 15;
      try {
        const r = await fetch('/qr');
        const d = await r.json();
        if (d.status === 'connected') {
          document.querySelector('.card').innerHTML = '<h2>✅ Bot is Live!</h2><p style="color:#86efac">WhatsApp linked successfully.</p>';
        } else if (d.status === 'qr' && d.qr) {
          document.getElementById('qrimg').src = d.qr;
          document.getElementById('badge').className = 'badge fresh';
          document.getElementById('badge').textContent = '🟢 Fresh QR';
        }
      } catch(e) {}
    }
  }, 1000);
</script>
</body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta http-equiv="refresh" content="15">
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem}</style></head>
<body><div class="card"><h2>⏳ Starting…</h2><p style="color:#94a3b8">WhatsApp client is initializing. Please wait.</p><p style="color:#64748b;font-size:.75rem">Page refreshes every 15 seconds</p></div></body></html>`;
}

function adminPage(token) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CLEANLY — Send Message</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0a1628; color: #e2e8f0; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 1rem; }
    .card { background: #1e293b; border-radius: 1rem; padding: 2rem; width: 100%; max-width: 420px; box-shadow: 0 8px 32px rgba(0,0,0,.4); }
    h2 { margin-bottom: 1.5rem; font-size: 1.2rem; color: #f1f5f9; }
    label { display: block; font-size: .85rem; color: #94a3b8; margin-bottom: .4rem; }
    input { width: 100%; padding: .75rem 1rem; border-radius: .5rem; border: 1px solid #334155; background: #0f172a; color: #f1f5f9; font-size: 1rem; margin-bottom: 1rem; outline: none; }
    input:focus { border-color: #38bdf8; }
    button { width: 100%; padding: .85rem; border-radius: .5rem; border: none; background: #22c55e; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #16a34a; }
    button:disabled { background: #334155; cursor: not-allowed; }
    .result { margin-top: 1rem; padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; display: none; }
    .result.ok  { background: #14532d; color: #86efac; }
    .result.err { background: #4c0519; color: #fca5a5; }
    .hint { font-size: .78rem; color: #64748b; margin-top: -.5rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
<div class="card">
  <h2>📤 Send Intro Message</h2>
  <label>Country Code + Number</label>
  <input type="tel" id="phone" placeholder="919876543210" inputmode="numeric" />
  <p class="hint">Include country code, no + or spaces. E.g. 919876543210</p>
  <button id="btn" onclick="send()">Send Message</button>
  <div class="result" id="result"></div>
</div>
<script>
  async function send() {
    const phone = document.getElementById('phone').value.replace(/\\D/g, '');
    const btn   = document.getElementById('btn');
    const result = document.getElementById('result');
    if (phone.length < 10) {
      result.textContent = '⚠️ Enter a valid phone number';
      result.className = 'result err';
      result.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Sending…';
    result.style.display = 'none';
    try {
      const res = await fetch('/send?to=' + phone + '&token=${token}');
      const text = await res.text();
      result.textContent = res.ok ? '✅ ' + text : '❌ ' + text;
      result.className = 'result ' + (res.ok ? 'ok' : 'err');
    } catch (e) {
      result.textContent = '❌ Network error';
      result.className = 'result err';
    }
    result.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Send Message';
    if (document.getElementById('phone')) document.getElementById('phone').value = '';
  }
  document.getElementById('phone').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
</script>
</body>
</html>`;
}

// ─── Bootstrap: init Baileys socket ──────────────────────────
async function bootstrap() {
  if (isBootstrapping) return;
  isBootstrapping = true;

  if (!supabase) {
    supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  }

  const { state, saveCreds } = await useSupabaseAuthState(supabase);
  const logger = pino({ level: 'silent' });

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[wa] WA version: ${version.join('.')}, isLatest: ${isLatest}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['Ubuntu', 'Chrome', '120.0.0'],
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    getMessage: async () => undefined,
  });

  // Persist credentials whenever they change
  sock.ev.on('creds.update', saveCreds);

  // QR / connection state changes
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR = qr;
      console.log('[wa] QR received — scan at http://localhost:' + PORT);
    }
    if (connection === 'open') {
      botReady        = true;
      currentQR       = null;
      isBootstrapping = false;
      console.log('[wa] ✅ WhatsApp client is ready!');
    }
    if (connection === 'close') {
      botReady = false;
      const code      = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const replaced  = code === 440;

      if (loggedOut) {
        console.log('[wa] Logged out — re-scan QR at the URL');
        isBootstrapping = false;
        setTimeout(() => bootstrap(), 3000);
      } else if (replaced) {
        console.log('[wa] Connection replaced — new session took over, not reconnecting');
      } else {
        console.warn('[wa] Disconnected, code:', code, '(reconnecting in 5s...)');
        isBootstrapping = false;
        setTimeout(() => bootstrap(), 5000);
      }
    }
  });

  // Incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const rawMsg of messages) {
      try {
        if (rawMsg.key.fromMe) continue;
        const jid = rawMsg.key.remoteJid;
        if (!jid || jid.endsWith('@g.us')) continue;

        const msgContent = rawMsg.message || {};
        const msgType    = Object.keys(msgContent)[0] || '';

        let body = '';
        if (msgType === 'conversation')         body = msgContent.conversation || '';
        else if (msgType === 'extendedTextMessage') body = msgContent.extendedTextMessage?.text || '';
        else if (msgType === 'imageMessage')    body = msgContent.imageMessage?.caption || '';

        // Capture current socket in closure so replies always use the live socket
        const liveSock = sock;

        // whatsapp-web.js compatible wrapper — flow.js never needs to change
        const wrappedMsg = {
          from: jid,
          body,
          type: msgType === 'imageMessage' ? 'image' : 'chat',
          getContact: async () => ({
            pushname: rawMsg.pushName || '',
            name:     rawMsg.pushName || '',
            id: { _serialized: jid },
          }),
          downloadMedia: async () => {
            try {
              const buffer = await downloadMediaMessage(rawMsg, 'buffer', {}, {
                logger,
                reuploadRequest: liveSock.updateMediaMessage,
              });
              return {
                data:     buffer.toString('base64'),
                mimetype: msgContent.imageMessage?.mimetype || 'image/jpeg',
              };
            } catch (e) {
              console.error('[wa] Media download error:', e.message);
              return null;
            }
          },
          reply: async (text) => {
            await liveSock.sendMessage(jid, { text });
          },
        };

        const replies = await flow.handleMessage(wrappedMsg);

        for (const reply of replies) {
          if (typeof reply === 'object' && reply._adminAlert) {
            try {
              await liveSock.sendMessage(ownerJid, { text: reply._adminAlert });
            } catch (e) {
              console.error('[wa] Failed to send admin alert:', e.message);
            }
            continue;
          }
          if (typeof reply === 'string') {
            try {
              await liveSock.sendMessage(jid, { text: reply });
            } catch (e) {
              console.error('[wa] Failed to send reply:', e.message);
            }
          }
        }
      } catch (err) {
        console.error('[wa] Message handler error:', err.message);
        try {
          await sock.sendMessage(rawMsg.key.remoteJid, { text: config.errorMessage });
          flow.clearSession(rawMsg.key.remoteJid);
        } catch (_) {}
      }
    }
  });
}

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Express running on http://localhost:${PORT}`);
});

bootstrap().catch((err) => {
  console.error('[boot] Bootstrap failed:', err.message);
  setTimeout(() => bootstrap().catch(e => console.error('[boot] Retry failed:', e.message)), 10000);
});
