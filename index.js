// ============================================================
// index.js — WhatsApp via Green API + Express server
// ============================================================

require('dotenv').config();
const express = require('express');
const flow    = require('./flow');
const config  = require('./config');
const sheets  = require('./sheets');
const { addInvite } = require('./invite-store');

// ─── Global crash guards ──────────────────────────────────────
process.on('uncaughtException',  (err) => console.error('[crash] Uncaught exception:', err.message));
process.on('unhandledRejection', (r)   => console.error('[crash] Unhandled rejection:', r?.message || r));

const app  = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ─── Green API helpers ────────────────────────────────────────
const GA_INSTANCE = process.env.GREENAPI_INSTANCE_ID;
const GA_TOKEN    = process.env.GREENAPI_TOKEN;
const GA_BASE     = `https://api.green-api.com/waInstance${GA_INSTANCE}`;

function toChatId(phone) {
  return phone.replace(/[^0-9]/g, '') + '@c.us';
}

const ownerChatId = toChatId(process.env.OWNER_WHATSAPP || '919975233763');

async function gaSend(chatId, text) {
  try {
    const res = await fetch(`${GA_BASE}/sendMessage/${GA_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: text }),
    });
    if (!res.ok) console.error('[green] Send error:', await res.text());
    return res.ok;
  } catch (e) {
    console.error('[green] Send exception:', e.message);
    return false;
  }
}

const botReady = () => !!(GA_INSTANCE && GA_TOKEN);

// ─── Express Routes ───────────────────────────────────────────

app.get('/', (_req, res) => {
  const title = config.businessName + ' — WhatsApp Bot';
  if (botReady()) {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:#22c55e;margin-right:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style></head>
<body><div class="card"><h1><span class="dot"></span> Bot is Live</h1><p>${config.businessName}</p>
<p style="font-size:.85rem;margin-top:1rem;color:#94a3b8">Sessions: <span id="s">—</span> | Uptime: <span id="u">—</span></p></div>
<script>setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{document.getElementById('s').textContent=d.activeSessions;document.getElementById('u').textContent=Math.floor(d.uptime)+'s'}),5000)</script>
</body></html>`);
  } else {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui;background:#0a1628;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;background:#1e293b;padding:3rem;border-radius:1rem">
<h2>⚠️ Not Configured</h2>
<p style="color:#94a3b8;margin-top:1rem">Set GREENAPI_INSTANCE_ID and GREENAPI_TOKEN in Render environment variables.</p>
</div></body></html>`);
  }
});

app.get('/status', (_req, res) => {
  res.json({ connected: botReady(), activeSessions: flow.activeSessionCount(), uptime: process.uptime() });
});

app.get('/ping', (_req, res) => res.send('pong'));

app.get('/admin', (req, res) => {
  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  res.send(adminPage(token));
});

app.get('/send', async (req, res) => {
  const { to, token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!to) return res.status(400).send('Missing ?to= phone number');
  if (!botReady()) return res.status(503).send('Bot not configured');

  const chatId = toChatId(to);
  try {
    await addInvite(chatId);
    await gaSend(chatId, config.adminIntroMessage);
    res.send(`✅ Message sent to ${chatId}`);
  } catch (err) {
    console.error('[send] Error:', err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.post('/verify-payment', async (req, res) => {
  const { token, phone, bookingId, name, lang } = req.body;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  if (!phone || !bookingId) return res.status(400).json({ error: 'Missing phone or bookingId' });
  if (!botReady()) return res.status(503).json({ error: 'Bot not configured' });

  const chatId = toChatId(phone);
  try {
    const msg = config.paymentVerifiedMessage(name || 'there', bookingId, lang || 'en');
    await gaSend(chatId, msg);
    await sheets.markPaymentVerified(bookingId);
    console.log(`[verify-payment] Confirmed: ${bookingId} → ${chatId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[verify-payment] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Incoming webhook from Green API ─────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // always respond immediately

  const { typeWebhook, senderData, messageData } = req.body || {};
  if (typeWebhook !== 'incomingMessageReceived') return;
  if (!senderData?.chatId || !messageData) return;

  const chatId = senderData.chatId;
  if (chatId.endsWith('@g.us')) return; // skip groups

  const msgType = messageData.typeMessage || '';
  let body = '';
  if (msgType === 'textMessage')         body = messageData.textMessageData?.textMessage || '';
  else if (msgType === 'extendedTextMessage') body = messageData.extendedTextMessageData?.text || '';
  else if (msgType === 'imageMessage')   body = messageData.imageMessageData?.caption || '';

  console.log(`[webhook] Message from ${chatId}: "${body.slice(0, 40)}"`);

  const wrappedMsg = {
    from: chatId,
    body,
    type: msgType === 'imageMessage' ? 'image' : 'chat',
    getContact: async () => ({
      pushname: senderData.senderName || '',
      name:     senderData.senderName || '',
      id: { _serialized: chatId },
    }),
    downloadMedia: async () => null,
    reply: async (text) => { await gaSend(chatId, text); },
  };

  try {
    const replies = await flow.handleMessage(wrappedMsg);
    for (const reply of replies) {
      if (typeof reply === 'object' && reply._adminAlert) {
        await gaSend(ownerChatId, reply._adminAlert);
        continue;
      }
      if (typeof reply === 'string') {
        await gaSend(chatId, reply);
      }
    }
  } catch (err) {
    console.error('[webhook] Handler error:', err.message);
    try {
      await gaSend(chatId, config.errorMessage);
      flow.clearSession(chatId);
    } catch (_) {}
  }
});

// ─── Admin page ───────────────────────────────────────────────
function adminPage(token) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CLEANLY — Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0a1628;color:#e2e8f0;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:1rem}
.card{background:#1e293b;border-radius:1rem;padding:2rem;width:100%;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.4)}
h2{margin-bottom:1.5rem;font-size:1.2rem;color:#f1f5f9}
label{display:block;font-size:.85rem;color:#94a3b8;margin-bottom:.4rem}
input{width:100%;padding:.75rem 1rem;border-radius:.5rem;border:1px solid #334155;background:#0f172a;color:#f1f5f9;font-size:1rem;margin-bottom:1rem;outline:none}
input:focus{border-color:#38bdf8}
button{width:100%;padding:.85rem;border-radius:.5rem;border:none;background:#22c55e;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
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
  if(phone.length<10){result.textContent='⚠️ Enter a valid phone number';result.className='result err';result.style.display='block';return;}
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

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
  if (botReady()) {
    console.log(`[green] Green API configured — instance ${GA_INSTANCE}`);
    console.log(`[green] Webhook URL: https://YOUR-RENDER-URL.onrender.com/webhook`);
  } else {
    console.warn('[green] ⚠️  GREENAPI_INSTANCE_ID or GREENAPI_TOKEN not set');
  }
});
