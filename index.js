// ============================================================
// index.js — CLEANLY bot — WATI edition
// ============================================================
// Receives incoming WhatsApp messages via WATI webhook,
// processes them through flow.js, sends replies via WATI REST API.
// ============================================================

require('dotenv').config();
const express = require('express');
const flow    = require('./flow');
const config  = require('./config');
const sheets  = require('./sheets');
const { addInvite, isInvited, uploadReceipt } = require('./invite-store');

process.on('uncaughtException',  (err) => console.error('[crash] Uncaught exception:', err.message));
process.on('unhandledRejection', (r)   => console.error('[crash] Unhandled rejection:', r?.message || r));

const app  = express();
app.use(express.json({ limit: '5mb' }));   // WATI sends ~ small payloads, 5mb is generous
const PORT = process.env.PORT || 3000;

// ─── WATI config ─────────────────────────────────────────────
const WATI_BASE   = process.env.WATI_BASE_URL || 'https://live-mt-server.wati.io/10166417';
let   WATI_TOKEN  = process.env.WATI_TOKEN || '';
const BOT_NUMBER  = process.env.WATI_BOT_NUMBER || '917385155526';

// Defensive: WATI requires `Bearer <jwt>` in the Authorization header.
// Auto-prepend if env var was set without it.
if (WATI_TOKEN && !WATI_TOKEN.toLowerCase().startsWith('bearer ')) {
  WATI_TOKEN = 'Bearer ' + WATI_TOKEN;
  console.log('[boot] WATI_TOKEN was missing "Bearer " prefix — added automatically');
}

// Admin number for booking/payment/lead alerts — hardcoded so misconfig
// can never reroute alerts.
const OWNER_PHONE = '919975233763';

if (!WATI_TOKEN) {
  console.error('[boot] ❌ WATI_TOKEN env var is missing — outgoing messages will fail');
}
console.log('[boot] WATI base:', WATI_BASE, '| bot number:', BOT_NUMBER);

// ─── WATI send helper ───────────────────────────────────────
// Sends a free-form text message inside an open 24-hr session window.
// Retries on 5xx, 429, and network errors with exponential backoff.
// 4xx (other than 429) is treated as permanent (bad token, expired
// 24-hr window, etc.) and skipped to avoid hammering WATI.
//
// Returns { ok, status, body } so the caller can react to failures.
const SEND_TIMEOUT_MS  = 15_000;
const SEND_MAX_ATTEMPTS = 3;

// Lightweight observability — visible at /status.
const sendMetrics = { sent: 0, failed: 0, recentFailures: [] };
function recordFailure(phone, reason, text) {
  sendMetrics.failed++;
  sendMetrics.recentFailures.push({
    at:     new Date().toISOString(),
    phone,
    reason: String(reason || '').slice(0, 120),
    text:   String(text  || '').slice(0, 100),
  });
  // Bounded buffer — keep last 50
  if (sendMetrics.recentFailures.length > 50) sendMetrics.recentFailures.shift();
}

async function _watiSendOnce(phone, text) {
  const url = `${WATI_BASE}/api/v1/sendSessionMessage/${phone}?messageText=${encodeURIComponent(text)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': WATI_TOKEN, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function watiSend(phone, text, opts = {}) {
  if (!phone || !text) return { ok: false, status: 0, body: 'missing phone or text' };

  const maxAttempts  = opts.maxAttempts ?? SEND_MAX_ATTEMPTS;
  const isOwnerAlert = opts.isOwnerAlert === true;
  let lastReason = 'unknown';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await _watiSendOnce(phone, text);

      if (res.ok) {
        if (attempt > 1) console.log(`[wati] ✓ recovered on attempt ${attempt} to ${phone}`);
        sendMetrics.sent++;
        return res;
      }

      // 4xx (not 429) — permanent error, don't retry.
      // Common causes: bad token, customer outside 24-hr session window,
      // invalid phone. None of these fix themselves with a retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        console.error(`[wati] ✗ send ${res.status} (no retry) to ${phone}: ${res.body.slice(0, 200)}`);
        recordFailure(phone, `HTTP ${res.status}: ${res.body.slice(0, 80)}`, text);
        if (!isOwnerAlert) notifyOwnerOfFailure(phone, `HTTP ${res.status}`, text);
        return res;
      }

      // 5xx or 429 — retry with backoff.
      lastReason = `HTTP ${res.status}`;
      console.warn(`[wati] send ${res.status} (attempt ${attempt}/${maxAttempts}) to ${phone}`);
    } catch (e) {
      const aborted = e.name === 'AbortError';
      lastReason = aborted ? `timeout ${SEND_TIMEOUT_MS}ms` : (e.message || 'fetch exception');
      console.warn(`[wati] send error (attempt ${attempt}/${maxAttempts}) to ${phone}: ${lastReason}`);
    }

    if (attempt < maxAttempts) {
      // 500ms, 1500ms, 4500ms
      const delay = 500 * Math.pow(3, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error(`[wati] ✗ send FAILED after ${maxAttempts} attempts to ${phone}: ${lastReason}`);
  recordFailure(phone, lastReason, text);
  if (!isOwnerAlert) notifyOwnerOfFailure(phone, lastReason, text);
  return { ok: false, status: 0, body: lastReason };
}

// One-shot owner alert when a customer message can't be delivered.
// Uses a single-attempt send to avoid recursive failure loops.
function notifyOwnerOfFailure(toPhone, reason, originalText) {
  const alert = `⚠️ *MESSAGE FAILED — Manual Follow-up*

📞 Customer : ${toPhone}
❌ Reason   : ${reason}
📝 Tried to send (first 100 chars):
${(originalText || '').slice(0, 100)}

The bot couldn't deliver this reply. Please contact the customer manually.`;
  _watiSendOnce(OWNER_PHONE, alert).catch(() => {});
}

// ─── Inactivity nudge ───────────────────────────────────────
// 1 minute before the session times out, send a "are you still there?"
// prompt so the user has a chance to resume. Re-scheduled on every
// incoming message; cleared when the session ends.
const NUDGE_DELAY_MS = Math.max(60_000, (config.sessionTimeoutMs || 15 * 60 * 1000) - 60_000);
const nudgeTimers = new Map();

function clearNudge(phone) {
  const t = nudgeTimers.get(phone);
  if (t) { clearTimeout(t); nudgeTimers.delete(phone); }
}

function scheduleNudge(phone) {
  clearNudge(phone);
  const t = setTimeout(() => {
    nudgeTimers.delete(phone);
    const sess = flow.sessions.get(phone);
    if (!sess) return; // session already ended — nothing to nudge
    const lang = (sess.data && sess.data.lang) || 'en';
    const text = (config.nudgeMessage && config.nudgeMessage[lang]) || config.nudgeMessage.en;
    watiSend(phone, text)
      .then(r => r.ok && console.log('[nudge] sent to', phone))
      .catch(e => console.error('[nudge] send failed:', e.message));
  }, NUDGE_DELAY_MS);
  nudgeTimers.set(phone, t);
}

// ─── Dedup ──────────────────────────────────────────────────
// WATI can deliver the same message twice if its retry policy fires
// (e.g. our webhook returns slow). Track recent message IDs and skip dupes.
const processedMsgIds = new Set();
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedMsgIds.has(id)) return true;
  processedMsgIds.add(id);
  if (processedMsgIds.size > 1000) processedMsgIds.delete(processedMsgIds.values().next().value);
  return false;
}

// ─── Per-user queue ─────────────────────────────────────────
// Strictly in-order processing per user. Different users run concurrently.
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

// ─── Build the wrappedMsg flow.js expects ───────────────────
// flow.handleMessage was written for whatsapp-web.js / Baileys
// message objects. We give it the same shape from WATI's payload.
function buildWrappedMsg(phone, text, type, mediaUrl, senderName) {
  return {
    from: phone,
    body: text || '',
    type: type === 'image' ? 'image' : 'chat',
    getContact: async () => ({
      pushname: senderName || '',
      name:     senderName || '',
      id: { _serialized: phone },
    }),
    downloadMedia: async () => {
      // Only used in PAYMENT_RECEIPT state. Returns null on failure so
      // the flow falls back to caption text. WATI's own media URLs need
      // the Bearer token; pass it as Authorization for those.
      if (!mediaUrl) return null;
      try {
        const headers = {};
        if (mediaUrl.includes('wati.io')) headers['Authorization'] = WATI_TOKEN;
        const res = await fetch(mediaUrl, { headers });
        if (!res.ok) {
          console.error('[wati] media download HTTP', res.status, 'for', mediaUrl.slice(0, 80));
          return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') || 'image/jpeg';
        return { data: buf.toString('base64'), mimetype: ct };
      } catch (e) {
        console.error('[wati] media download failed:', e.message);
        return null;
      }
    },
    reply: async (txt) => { await watiSend(phone, txt); },
  };
}

// ─── WATI webhook — incoming customer messages ──────────────
app.post('/wati-webhook', async (req, res) => {
  // ACK first so WATI doesn't retry on slow processing
  res.status(200).send('OK');

  const evt = req.body || {};

  // We only care about incoming customer messages, not status updates
  // or echoes of our own sends.
  const eventType = evt.eventType || evt.type;
  if (eventType && eventType !== 'message') return;
  if (evt.owner === true) return;          // skip our own outgoing echo

  // Pull the fields. WATI's payload varies slightly; cover the common cases.
  const phone     = (evt.waId || evt.whatsappId || evt.phone || '').toString();
  const msgId     = evt.id || evt.messageId || evt.whatsappMessageId;
  const msgType   = (evt.type || '').toLowerCase();   // text / image / document / etc.
  const senderName = evt.senderName || '';

  // For text messages, text is in `text`/`data`. For media messages, WATI
  // puts the URL in `text`/`data` and the actual caption in `caption`.
  // Extract both correctly based on type.
  let text, mediaUrl;
  const isMedia = ['image', 'document', 'video', 'audio'].includes(msgType);
  if (isMedia) {
    mediaUrl = evt.sourceUrl || evt.mediaUrl || evt.text || evt.data || null;
    text     = evt.caption || '';
  } else {
    text     = evt.text || evt.data || evt.caption || '';
    mediaUrl = null;
  }

  if (!phone) { console.warn('[wati] webhook missing phone'); return; }
  if (alreadyProcessed(msgId)) { console.log('[wati] dedup', msgId); return; }

  console.log('[wati] from:', phone, 'type:', msgType, 'body:', JSON.stringify(String(text)).slice(0, 30));

  // Hand off to the flow inside the per-user queue
  runQueued(phone, async () => {
    const t0 = Date.now();
    const wrapped = buildWrappedMsg(phone, text, msgType, mediaUrl, senderName);
    try {
      const replies = await flow.handleMessage(wrapped);
      console.log('[task]', phone, 'flow:', Date.now() - t0, 'ms, replies:', replies.length);
      for (const reply of replies) {
        try {
          if (typeof reply === 'object' && reply && reply._adminAlert) {
            // Admin notification — fire and forget but log outcome
            watiSend(OWNER_PHONE, reply._adminAlert)
              .then(r => console.log(r.ok ? '[task] adminAlert sent' : '[task] adminAlert FAILED: ' + r.body.slice(0,80)))
              .catch(e => console.error('[task] adminAlert send threw:', e.message));
            continue;
          }
          if (typeof reply === 'string' && reply.length > 0) {
            const r = await watiSend(phone, reply);
            if (!r.ok) console.warn('[task] reply not delivered to', phone, '— see /status');
          }
        } catch (sendErr) {
          // One bad reply shouldn't abort the rest. Already logged inside watiSend.
          console.error('[task] reply loop error for', phone, ':', sendErr.message);
        }
      }

      // (Re)schedule the 14-min nudge if the session is still active;
      // otherwise clear it (flow ended, cancelled, or paid).
      if (flow.sessions.get(phone)) scheduleNudge(phone);
      else clearNudge(phone);
    } catch (err) {
      console.error('[task] handler error for', phone, ':', err.message, err.stack);
      // Best-effort error reply; watiSend already retries + alerts owner on failure.
      watiSend(phone, config.errorMessage).catch(() => {});
      flow.clearSession(phone);
      clearNudge(phone);
    }
  });
});

// ─── HTTP endpoints (admin + health) ───────────────────────
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${config.businessName} Bot</title>
<style>body{font-family:system-ui,sans-serif;background:#0a1628;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem}
.dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:#22c55e;margin-right:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style></head>
<body><div class="card"><h1><span class="dot"></span> Bot is Live (WATI)</h1>
<p>${config.businessName}</p>
<p style="font-size:.85rem;color:#94a3b8;margin-top:1rem">Sessions: <span id="s">—</span> · Uptime: <span id="u">—</span>s</p></div>
<script>setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{document.getElementById('s').textContent=d.activeSessions;document.getElementById('u').textContent=Math.floor(d.uptime)}),5000)</script>
</body></html>`);
});

app.get('/status', (_req, res) => res.json({
  ok: true,
  activeSessions: flow.activeSessionCount(),
  uptime: process.uptime(),
  bot: BOT_NUMBER,
  msgs: {
    sent:   sendMetrics.sent,
    failed: sendMetrics.failed,
    recentFailures: sendMetrics.recentFailures.slice(-10),
  },
}));

app.get('/ping', (_req, res) => res.send('pong'));

// Admin page — same as before
app.get('/admin', (req, res) => {
  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CLEANLY Admin</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;background:#0a1628;color:#e2e8f0;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:1rem}
.card{background:#1e293b;border-radius:1rem;padding:2rem;width:100%;max-width:420px}
h2{margin-bottom:1.5rem;font-size:1.2rem}label{display:block;font-size:.85rem;color:#94a3b8;margin-bottom:.4rem}
input{width:100%;padding:.75rem 1rem;border-radius:.5rem;border:1px solid #334155;background:#0f172a;color:#f1f5f9;font-size:1rem;margin-bottom:1rem;outline:none}
input:focus{border-color:#38bdf8}button{width:100%;padding:.85rem;border-radius:.5rem;border:none;background:#22c55e;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
button:hover{background:#16a34a}.result{margin-top:1rem;padding:.75rem 1rem;border-radius:.5rem;font-size:.9rem;display:none}
.result.ok{background:#14532d;color:#86efac}.result.err{background:#4c0519;color:#fca5a5}
.hint{font-size:.78rem;color:#64748b;margin-top:-.5rem;margin-bottom:1rem}</style>
</head><body><div class="card">
<h2>📤 Send Intro Message</h2>
<label>Country Code + Number</label>
<input type="tel" id="phone" placeholder="919876543210" inputmode="numeric"/>
<p class="hint">Customer must have messaged the bot within the last 24 hours.</p>
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
</script></body></html>`);
});

app.get('/send', async (req, res) => {
  const { to, token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!to) return res.status(400).send('Missing ?to=');
  const phone = String(to).replace(/[^0-9]/g, '');
  try {
    await addInvite(phone);
    const r = await watiSend(phone, config.adminIntroMessage);
    if (!r.ok) return res.status(500).send(`Send failed: ${r.body}`);
    res.send(`✅ Sent to ${phone}`);
  } catch (e) { res.status(500).send(e.message); }
});

app.post('/verify-payment', async (req, res) => {
  const { token, phone, bookingId, name, lang } = req.body;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  if (!phone || !bookingId) return res.status(400).json({ error: 'Missing fields' });
  try {
    const msg = config.paymentVerifiedMessage(name || 'there', bookingId, lang || 'en');
    const r = await watiSend(String(phone).replace(/[^0-9]/g, ''), msg);
    if (!r.ok) return res.status(500).json({ error: 'Send failed', detail: r.body });
    await sheets.markPaymentVerified(bookingId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => console.log(`[server] WATI bot ready on :${PORT}`));
