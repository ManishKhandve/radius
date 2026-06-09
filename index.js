// ============================================================
// index.js — CLEANLY bot — Meta WhatsApp Cloud API edition
// ============================================================
// Receives incoming WhatsApp messages via Meta Cloud API webhook,
// processes them through flow.js, sends replies via Meta Graph API.
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
app.use(express.json({ limit: '5mb' }));
const PORT = process.env.PORT || 3000;

// ─── Meta Cloud API config ───────────────────────────────────
const META_API_VERSION    = process.env.META_API_VERSION    || 'v22.0';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
const META_ACCESS_TOKEN    = process.env.META_ACCESS_TOKEN   || '';
const META_VERIFY_TOKEN    = process.env.META_VERIFY_TOKEN   || '';
const META_GRAPH_BASE      = `https://graph.facebook.com/${META_API_VERSION}`;
const BOT_NUMBER           = process.env.META_BOT_NUMBER || ''; // display only

// Admin number for booking/payment/lead alerts — hardcoded so misconfig
// can never reroute alerts.
const OWNER_PHONE = '919975233763';

if (!META_ACCESS_TOKEN)    console.error('[boot] ❌ META_ACCESS_TOKEN missing — outgoing sends will fail');
if (!META_PHONE_NUMBER_ID) console.error('[boot] ❌ META_PHONE_NUMBER_ID missing — outgoing sends will fail');
if (!META_VERIFY_TOKEN)    console.error('[boot] ❌ META_VERIFY_TOKEN missing — webhook verification will fail');

console.log(`[boot] Meta Cloud API ${META_API_VERSION} | phoneId: ${META_PHONE_NUMBER_ID || 'MISSING'}`);

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

async function _metaSendOnce(phone, text) {
  const url = `${META_GRAPH_BASE}/${META_PHONE_NUMBER_ID}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                phone,
        type:              'text',
        text: { preview_url: false, body: text },
      }),
      signal: controller.signal,
    });
    const body = await res.text();

    // Inspect Meta's response. On success: `{messages:[{id:"wamid..."}]}`.
    // On failure: `{error:{message, code, type, fbtrace_id}}` with non-2xx status.
    let metaOk = res.ok;
    let metaInfo = '';
    let waMessageId = null;
    try {
      const j = JSON.parse(body);
      if (j?.error) {
        metaOk = false;
        metaInfo = `${j.error.code || '?'}: ${j.error.message || '(no message)'}`;
      } else if (Array.isArray(j?.messages) && j.messages[0]?.id) {
        waMessageId = j.messages[0].id;
        metaInfo = waMessageId.slice(0, 40);
      }
    } catch { /* not JSON — rely on HTTP status */ }

    return { ok: res.ok, status: res.status, body, metaOk, metaInfo, waMessageId };
  } finally {
    clearTimeout(timer);
  }
}

// Meta interactive button message — max 3 buttons, titles ≤ 20 chars,
// body ≤ 1024 chars. Returns the same shape as watiSend.
// buttons: [{ id: "1", title: "English" }, ...]
async function watiSendButtons(phone, bodyText, buttons) {
  if (!phone || !Array.isArray(buttons) || buttons.length === 0) {
    return { ok: false, status: 0, body: 'missing phone or buttons' };
  }
  const safeButtons = buttons.slice(0, 3).map(b => ({
    type: 'reply',
    reply: { id: String(b.id), title: String(b.title).slice(0, 20) },
  }));
  const url = `${META_GRAPH_BASE}/${META_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                phone,
    type:              'interactive',
    interactive: {
      type: 'button',
      body: { text: String(bodyText).slice(0, 1024) },
      action: { buttons: safeButtons },
    },
  };

  console.log(`[meta] → send buttons (${safeButtons.length}) to ${phone}: "${bodyText.slice(0,40)}..."`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text();
    let metaOk = res.ok;
    let metaInfo = '';
    try {
      const j = JSON.parse(body);
      if (j?.error) { metaOk = false; metaInfo = `${j.error.code || '?'}: ${j.error.message || ''}`; }
      else if (j?.messages?.[0]?.id) { metaInfo = j.messages[0].id.slice(0, 40); }
    } catch {}
    if (res.ok && metaOk) {
      console.log(`[meta] ✓ buttons sent to ${phone}${metaInfo ? ' — ' + metaInfo : ''}`);
      sendMetrics.sent++;
      return { ok: true, status: res.status, body };
    }
    console.error(`[meta] ✗ buttons HTTP ${res.status} to ${phone}: ${metaInfo || body.slice(0, 200)}`);
    recordFailure(phone, `buttons: ${metaInfo || 'HTTP ' + res.status}`, bodyText);
    return { ok: false, status: res.status, body };
  } catch (e) {
    console.error('[meta] buttons send exception:', e.message);
    return { ok: false, status: 0, body: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Meta interactive list message — max 10 rows total (across all
// sections). Use for choices with 4-10 options where buttons (max 3)
// won't fit. Row titles ≤ 24 chars, descriptions ≤ 72 chars.
// sections: [{ title?: string, rows: [{ id, title, description? }] }]
async function watiSendList(phone, body, buttonLabel, sections, opts = {}) {
  if (!phone || !Array.isArray(sections) || sections.length === 0) {
    return { ok: false, status: 0, body: 'missing phone or sections' };
  }
  const safeSections = sections.slice(0, 10).map(s => ({
    title: s.title ? String(s.title).slice(0, 24) : undefined,
    rows: (s.rows || []).slice(0, 10).map(r => ({
      id: String(r.id),
      title: String(r.title).slice(0, 24),
      description: r.description ? String(r.description).slice(0, 72) : undefined,
    })),
  }));

  const url = `${META_GRAPH_BASE}/${META_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                phone,
    type:              'interactive',
    interactive: {
      type: 'list',
      body: { text: String(body).slice(0, 1024) },
      action: {
        button:   String(buttonLabel || 'Select').slice(0, 20),
        sections: safeSections,
      },
    },
  };
  if (opts.header) payload.interactive.header = { type: 'text', text: String(opts.header).slice(0, 60) };
  if (opts.footer) payload.interactive.footer = { text: String(opts.footer).slice(0, 60) };

  console.log(`[meta] → send list (${safeSections.reduce((n,s)=>n+s.rows.length,0)} rows) to ${phone}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const respBody = await res.text();
    let metaOk = res.ok;
    let metaInfo = '';
    try {
      const j = JSON.parse(respBody);
      if (j?.error) { metaOk = false; metaInfo = `${j.error.code || '?'}: ${j.error.message || ''}`; }
      else if (j?.messages?.[0]?.id) { metaInfo = j.messages[0].id.slice(0, 40); }
    } catch {}
    if (res.ok && metaOk) {
      console.log(`[meta] ✓ list sent to ${phone}${metaInfo ? ' — ' + metaInfo : ''}`);
      sendMetrics.sent++;
      return { ok: true, status: res.status, body: respBody };
    }
    console.error(`[meta] ✗ list HTTP ${res.status} to ${phone}: ${metaInfo || respBody.slice(0, 200)}`);
    recordFailure(phone, `list: ${metaInfo || 'HTTP ' + res.status}`, body);
    return { ok: false, status: res.status, body: respBody };
  } catch (e) {
    console.error('[meta] list send exception:', e.message);
    return { ok: false, status: 0, body: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Kept the name `watiSend` because it's called from many places (nudge,
// task loop, takeover, /verify-payment, etc.). Internally now hits the
// Meta Graph API.
async function watiSend(phone, text, opts = {}) {
  if (!phone || !text) {
    console.error('[meta] ✗ missing phone or text:', { phone: !!phone, textLen: text?.length || 0 });
    return { ok: false, status: 0, body: 'missing phone or text' };
  }

  const maxAttempts  = opts.maxAttempts ?? SEND_MAX_ATTEMPTS;
  const isOwnerAlert = opts.isOwnerAlert === true;
  let lastReason = 'unknown';

  console.log(`[meta] → send ${text.length}c to ${phone}: ${JSON.stringify(text.slice(0, 40))}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await _metaSendOnce(phone, text);

      // True success — HTTP ok AND Meta returned a wamid.
      if (res.ok && res.metaOk) {
        console.log(`[meta] ✓ sent to ${phone}${res.metaInfo ? ' — ' + res.metaInfo : ''}`);
        sendMetrics.sent++;
        if (attempt > 1) console.log(`[meta]   (recovered on attempt ${attempt})`);
        return res;
      }

      // HTTP 200 but Meta JSON says failure — usually 24-hr window expired,
      // template required, or destination not opted in. Don't retry.
      if (res.ok && !res.metaOk) {
        const info = String(res.metaInfo || '').slice(0, 200);
        console.error(`[meta] ✗ Meta rejected (HTTP 200) to ${phone}: ${info}`);
        console.error(`[meta]   full body: ${res.body.slice(0, 500)}`);
        recordFailure(phone, `Meta rejected: ${info.slice(0, 80)}`, text);
        if (!isOwnerAlert) notifyOwnerOfFailure(phone, `Meta rejected: ${info.slice(0, 80)}`, text);
        return { ...res, ok: false };
      }

      // 4xx (not 429) — permanent HTTP error (bad token, bad phone, etc).
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const reason = res.metaInfo || res.body.slice(0, 200);
        console.error(`[meta] ✗ HTTP ${res.status} (no retry) to ${phone}: ${reason}`);
        recordFailure(phone, `HTTP ${res.status}: ${reason.slice(0, 80)}`, text);
        if (!isOwnerAlert) notifyOwnerOfFailure(phone, `HTTP ${res.status}: ${reason.slice(0, 80)}`, text);
        return res;
      }

      // 5xx or 429 — retry with backoff.
      lastReason = `HTTP ${res.status}`;
      console.warn(`[meta] send ${res.status} (attempt ${attempt}/${maxAttempts}) to ${phone}: ${res.body.slice(0, 120)}`);
    } catch (e) {
      const aborted = e.name === 'AbortError';
      lastReason = aborted ? `timeout ${SEND_TIMEOUT_MS}ms` : (e.message || 'fetch exception');
      console.warn(`[meta] send error (attempt ${attempt}/${maxAttempts}) to ${phone}: ${lastReason}`);
    }

    if (attempt < maxAttempts) {
      const delay = 500 * Math.pow(3, attempt - 1); // 500ms, 1500ms, 4500ms
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.error(`[meta] ✗ send FAILED after ${maxAttempts} attempts to ${phone}: ${lastReason}`);
  recordFailure(phone, lastReason, text);
  if (!isOwnerAlert) notifyOwnerOfFailure(phone, lastReason, text);
  return { ok: false, status: 0, body: lastReason };
}

// Meta image send helper — sends an image by media ID.
// Caption is optional and can be up to 1024 chars.
async function watiSendImage(phone, mediaId, caption = '') {
  if (!phone || !mediaId) {
    return { ok: false, status: 0, body: 'missing phone or mediaId' };
  }
  const url = `${META_GRAPH_BASE}/${META_PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                phone,
    type:              'image',
    image: {
      id: mediaId
    }
  };
  if (caption) {
    payload.image.caption = String(caption).slice(0, 1024);
  }

  console.log(`[meta] → send image (${mediaId}) to ${phone}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await res.text();
    let metaOk = res.ok;
    let metaInfo = '';
    try {
      const j = JSON.parse(body);
      if (j?.error) { metaOk = false; metaInfo = `${j.error.code || '?'}: ${j.error.message || ''}`; }
      else if (j?.messages?.[0]?.id) { metaInfo = j.messages[0].id.slice(0, 40); }
    } catch {}
    if (res.ok && metaOk) {
      console.log(`[meta] ✓ image sent to ${phone}${metaInfo ? ' — ' + metaInfo : ''}`);
      sendMetrics.sent++;
      return { ok: true, status: res.status, body };
    }
    console.error(`[meta] ✗ image HTTP ${res.status} to ${phone}: ${metaInfo || body.slice(0, 200)}`);
    recordFailure(phone, `image: ${metaInfo || 'HTTP ' + res.status}`, caption);
    return { ok: false, status: res.status, body };
  } catch (e) {
    console.error('[meta] image send exception:', e.message);
    return { ok: false, status: 0, body: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Template Broadcast Tracking & Helper ──────────────────
let activeCampaign = {
  running: false,
  total: 0,
  sent: 0,
  success: 0,
  failed: 0,
  log: []
};

// Meta Cloud API template sender
async function watiSendTemplate(phone, templateName, langCode = 'en', variables = []) {
  if (!phone || !templateName) {
    return { ok: false, error: { message: 'Missing phone or templateName' } };
  }
  const url = `${META_GRAPH_BASE}/${META_PHONE_NUMBER_ID}/messages`;
  const parameters = variables.map(val => ({
    type: 'text',
    text: String(val)
  }));

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type:    'individual',
    to:                phone,
    type:              'template',
    template: {
      name: templateName,
      language: {
        code: langCode
      }
    }
  };

  if (parameters.length > 0) {
    payload.template.components = [
      {
        type: 'body',
        parameters: parameters
      }
    ];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const textBody = await res.text();
    let j = {};
    try { j = JSON.parse(textBody); } catch {}
    
    if (res.ok && !j.error) {
      return { ok: true, body: j };
    }
    return { ok: false, error: j.error || { message: `HTTP ${res.status}: ${textBody}` } };
  } catch (err) {
    return { ok: false, error: { message: err.message } };
  } finally {
    clearTimeout(timer);
  }
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
  _metaSendOnce(OWNER_PHONE, alert).catch(() => {});
}

// ─── Inactivity nudge ───────────────────────────────────────
// 10 seconds before the session times out, send a "are you still there?"
// prompt so the user has a chance to resume. Re-scheduled on every
// incoming message; cleared when the session ends.
const NUDGE_DELAY_MS = Math.max(10_000, (config.sessionTimeoutMs || 15 * 60 * 1000) - 10_000);
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

// ─── Manual intervention pause ──────────────────────────────
// When the admin takes over a conversation (replies manually via WATI
// dashboard or anywhere outside the bot), the bot must stop auto-
// replying to that customer until released.
//
// Use POST /takeover?phone=PHONE&hours=N to pause.
//      POST /release?phone=PHONE to resume.
const PAUSE_DEFAULT_HOURS = 4;
const pausedUsers = new Map(); // phone -> { expiresAt, notified }

function pauseUser(phone, hours = PAUSE_DEFAULT_HOURS) {
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  pausedUsers.set(phone, { expiresAt, notified: false });
  console.log(`[pause] ${phone} → paused for ${hours}h`);
}

function resumeUser(phone) {
  const had = pausedUsers.delete(phone);
  if (had) console.log(`[pause] ${phone} → resumed`);
  return had;
}

function isPaused(phone) {
  const entry = pausedUsers.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    pausedUsers.delete(phone);
    console.log(`[pause] ${phone} → auto-released (pause expired)`);
    return false;
  }
  return true;
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
function buildWrappedMsg(phone, text, type, mediaId, senderName) {
  return {
    from: phone,
    body: text || '',
    type: type === 'image' ? 'image' : 'chat',
    mediaId: mediaId,
    getContact: async () => ({
      pushname: senderName || '',
      name:     senderName || '',
      id: { _serialized: phone },
    }),
    downloadMedia: async () => {
      // Only used in PAYMENT_RECEIPT state. Meta uses a two-step flow:
      //   1) GET /MEDIA_ID  → returns { url: "https://lookaside.fbsbx.com/..." }
      //   2) GET <url>      → returns the actual bytes (Bearer auth required)
      // Returns null on failure so the flow can react gracefully.
      if (!mediaId) return null;
      try {
        const metaUrl = `${META_GRAPH_BASE}/${mediaId}`;
        const meta = await fetch(metaUrl, {
          headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}` },
        });
        if (!meta.ok) {
          console.error('[meta] media lookup HTTP', meta.status, 'for', mediaId);
          return null;
        }
        const { url, mime_type } = await meta.json();
        if (!url) return null;
        const dl = await fetch(url, {
          headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}` },
        });
        if (!dl.ok) {
          console.error('[meta] media download HTTP', dl.status);
          return null;
        }
        const buf = Buffer.from(await dl.arrayBuffer());
        return {
          data: buf.toString('base64'),
          mimetype: mime_type || dl.headers.get('content-type') || 'image/jpeg',
        };
      } catch (e) {
        console.error('[meta] media download failed:', e.message);
        return null;
      }
    },
    reply: async (txt) => { await watiSend(phone, txt); },
  };
}

// ─── Meta webhook — GET verification (handshake) ────────────
// Meta sends GET /wati-webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
// We must echo back hub.challenge if the verify token matches.
app.get('/wati-webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
    console.log('[meta] webhook verified ✓');
    return res.status(200).send(challenge);
  }
  console.warn('[meta] webhook verification failed — token mismatch');
  return res.sendStatus(403);
});

// ─── Meta webhook — POST incoming customer messages ─────────
app.post('/wati-webhook', async (req, res) => {
  // ACK first so Meta doesn't retry on slow processing
  res.status(200).send('OK');

  const body = req.body || {};
  if (body.object !== 'whatsapp_business_account') return;

  // Meta nests messages deep: entry[].changes[].value.messages[]
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};

      // Skip status updates (delivery receipts: sent/delivered/read/failed).
      // We only care about inbound messages.
      if (Array.isArray(value.statuses) && !Array.isArray(value.messages)) continue;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      if (messages.length === 0) continue;

      // Pull the sender name (if Meta included a contact profile)
      const senderName = value.contacts?.[0]?.profile?.name || '';

      for (const m of messages) {
        await handleMetaMessage(m, senderName);
      }
    }
  }
});

async function handleMetaMessage(m, senderName) {
  const phone = (m.from || '').toString();
  const msgId = m.id;
  const msgType = (m.type || '').toLowerCase();
  if (!phone) { console.warn('[meta] message missing from'); return; }
  if (alreadyProcessed(msgId)) { console.log('[meta] dedup', msgId); return; }

  // Extract text + media-id depending on message type
  let text = '';
  let mediaId = null;
  if (msgType === 'text') {
    text = m.text?.body || '';
  } else if (msgType === 'image') {
    text    = m.image?.caption || '';
    mediaId = m.image?.id || null;
  } else if (msgType === 'document') {
    text    = m.document?.caption || m.document?.filename || '';
    mediaId = m.document?.id || null;
  } else if (msgType === 'video') {
    text    = m.video?.caption || '';
    mediaId = m.video?.id || null;
  } else if (msgType === 'audio' || msgType === 'voice') {
    text    = '';
    mediaId = m.audio?.id || m.voice?.id || null;
  } else if (msgType === 'button') {
    text = m.button?.text || m.button?.payload || '';
  } else if (msgType === 'interactive') {
    // Prefer the button/list `id` (matches the bot's numeric state logic
    // like "1", "2", "3") over the human-readable title.
    text = m.interactive?.button_reply?.id
        || m.interactive?.list_reply?.id
        || m.interactive?.button_reply?.title
        || m.interactive?.list_reply?.title
        || '';
  } else {
    text = '';
  }

  // If admin has taken over this customer manually, the bot stays silent.
  // The customer gets a single "an agent will help you" notice the first
  // time they message while paused, then nothing until /release is hit.
  if (isPaused(phone)) {
    const entry = pausedUsers.get(phone);
    console.log(`[pause] ${phone} → skipping bot reply (agent takeover)`);
    if (entry && !entry.notified) {
      entry.notified = true;
      watiSend(phone, "👤 An agent from our team will reply to you shortly. Thanks for your patience!")
        .catch(() => {});
    }
    return;
  }

  console.log('[meta] from:', phone, 'type:', msgType, 'body:', JSON.stringify(String(text)).slice(0, 30));

  // Hand off to the flow inside the per-user queue
  runQueued(phone, async () => {
    const t0 = Date.now();
    const wrapped = buildWrappedMsg(phone, text, msgType === 'image' ? 'image' : 'chat', mediaId, senderName);
    try {
      const replies = await flow.handleMessage(wrapped);
      console.log('[task]', phone, 'flow:', Date.now() - t0, 'ms, replies:', replies.length);
      for (const reply of replies) {
        try {
          if (typeof reply === 'object' && reply && reply._adminAlert) {
            // Admin notification — send image with alert text as caption if available
            if (reply._adminImageId) {
              watiSendImage(OWNER_PHONE, reply._adminImageId, reply._adminAlert)
                .then(r => console.log(r.ok ? '[task] adminAlert image sent' : '[task] adminAlert image FAILED: ' + r.body.slice(0,80)))
                .catch(e => console.error('[task] adminAlert image send threw:', e.message));
            } else {
              watiSend(OWNER_PHONE, reply._adminAlert)
                .then(r => console.log(r.ok ? '[task] adminAlert sent' : '[task] adminAlert FAILED: ' + r.body.slice(0,80)))
                .catch(e => console.error('[task] adminAlert send threw:', e.message));
            }
            continue;
          }
          if (typeof reply === 'object' && reply && reply.type === 'buttons') {
            const r = await watiSendButtons(phone, reply.body, reply.buttons);
            if (!r.ok) console.warn('[task] buttons reply not delivered to', phone, '— see /status');
            continue;
          }
          if (typeof reply === 'object' && reply && reply.type === 'list') {
            const r = await watiSendList(phone, reply.body, reply.buttonLabel, reply.sections, {
              header: reply.header,
              footer: reply.footer,
            });
            if (!r.ok) console.warn('[task] list reply not delivered to', phone, '— see /status');
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
}

// ─── HTTP endpoints (admin + health) ───────────────────────
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${config.businessName} Bot</title>
<style>body{font-family:system-ui,sans-serif;background:#0a1628;color:#e2e8f0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem}
.dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:#22c55e;margin-right:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}</style></head>
<body><div class="card"><h1><span class="dot"></span> Bot is Live (Meta Cloud API)</h1>
<p>${config.businessName}</p>
<p style="font-size:.85rem;color:#94a3b8;margin-top:1rem">Sessions: <span id="s">—</span> · Uptime: <span id="u">—</span>s</p></div>
<script>setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{document.getElementById('s').textContent=d.activeSessions;document.getElementById('u').textContent=Math.floor(d.uptime)}),5000)</script>
</body></html>`);
});

app.get('/status', (_req, res) => res.json({
  ok: true,
  sender: 'Meta Cloud API',
  build: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local',
  apiVersion: META_API_VERSION,
  phoneId: META_PHONE_NUMBER_ID || 'MISSING',
  hasToken: !!META_ACCESS_TOKEN,
  hasVerifyToken: !!META_VERIFY_TOKEN,
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
    const r = await watiSendButtons(phone, config.adminIntroMessage, [
      { id: 'getcode', title: 'Get Code' },
      { id: 'connect_team', title: 'Connect with Team' }
    ]);
    if (!r.ok) return res.status(500).send(`Send failed: ${r.body}`);
    res.send(`✅ Sent to ${phone}`);
  } catch (e) { res.status(500).send(e.message); }
});

// ─── Manual intervention endpoints ──────────────────────────
// /takeover  → bot stops auto-replying to PHONE (default 4h, configurable)
// /release   → bot resumes auto-replying
// /paused    → list currently paused conversations
app.get('/takeover', (req, res) => {
  const { phone, token, hours } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!phone) return res.status(400).send('Missing ?phone=');
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const durationHours = Math.max(1, Math.min(48, parseInt(hours) || PAUSE_DEFAULT_HOURS));
  pauseUser(cleanPhone, durationHours);
  res.json({
    ok: true,
    phone: cleanPhone,
    pausedForHours: durationHours,
    releasesAt: new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString(),
  });
});

app.get('/release', (req, res) => {
  const { phone, token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!phone) return res.status(400).send('Missing ?phone=');
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const wasReleased = resumeUser(cleanPhone);
  res.json({ ok: true, phone: cleanPhone, wasPaused: wasReleased });
});

app.get('/paused', (req, res) => {
  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  const now = Date.now();
  const list = [];
  for (const [phone, entry] of pausedUsers.entries()) {
    if (entry.expiresAt > now) {
      list.push({
        phone,
        notified: entry.notified,
        releasesAt: new Date(entry.expiresAt).toISOString(),
        minutesLeft: Math.round((entry.expiresAt - now) / 60000),
      });
    }
  }
  res.json({ ok: true, paused: list, count: list.length });
});

app.post('/verify-payment', async (req, res) => {
  const { token, phone, bookingId, name, lang } = req.body;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(403).json({ error: 'Unauthorized' });
  if (!phone || !bookingId) return res.status(400).json({ error: 'Missing fields' });
  try {
    const msg = config.paymentVerifiedMessage(name || 'there', bookingId, lang || 'en');
    const r = await watiSend(String(phone).replace(/[^0-9]/g, ''), msg);
    if (!r.ok) return res.status(500).send(`Send failed: ${r.body}`);
    if (String(bookingId).startsWith('CB')) {
      await sheets.markCleaningPaymentVerified(bookingId);
    } else {
      await sheets.markPaymentVerified(bookingId);
    }
    res.send(`✅ Sent to ${phone}`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Broadcast Admin Dashboard & API ───────────────────────
const path = require('path');

app.get('/admin/broadcast', (req, res) => {
  res.sendFile(path.join(__dirname, 'broadcast.html'));
});

app.post('/api/broadcast', (req, res) => {
  const { templateName, languageCode, recipients } = req.body;

  if (activeCampaign.running) {
    return res.status(400).json({ success: false, error: 'A broadcast campaign is already running.' });
  }

  if (!templateName || !languageCode || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing parameters (templateName, languageCode, or recipients list).' });
  }

  // Trigger the broadcast campaign loop asynchronously in the background
  (async () => {
    activeCampaign.running = true;
    activeCampaign.total = recipients.length;
    activeCampaign.sent = 0;
    activeCampaign.success = 0;
    activeCampaign.failed = 0;
    
    const startTime = new Date().toLocaleTimeString();
    activeCampaign.log = [`[${startTime}] Broadcast started with ${recipients.length} recipients.`];
    
    for (const r of recipients) {
      if (!activeCampaign.running) {
        activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Broadcast cancelled by system.`);
        break;
      }

      const cleanPhone = String(r.phone).replace(/\D/g, '');
      const displayName = String(r.name || 'Customer').trim();
      activeCampaign.sent++;

      try {
        // We pass the recipient's Name as the first parameter (maps to {{1}} in the body)
        const result = await watiSendTemplate(cleanPhone, templateName, languageCode, [displayName]);
        if (result.ok) {
          activeCampaign.success++;
          activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Sent to ${displayName} (${cleanPhone}) — Success`);
        } else {
          activeCampaign.failed++;
          let errMsg = result.error?.message || 'Rejected by WhatsApp';
          if (result.error?.error_data?.details) {
            errMsg += ` Details: ${result.error.error_data.details}`;
          }
          activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Failed to ${displayName} (${cleanPhone}): ${errMsg}`);
        }
      } catch (err) {
        activeCampaign.failed++;
        activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Exception for ${displayName} (${cleanPhone}): ${err.message}`);
      }

      // Add invite to invite-store so their incoming replies work immediately
      try {
        await addInvite(cleanPhone);
      } catch (err) {
        console.error('[broadcast] failed to add invite for', cleanPhone, err.message);
      }

      // 200ms sleep delay to comply with standard Meta rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    activeCampaign.running = false;
    const endTime = new Date().toLocaleTimeString();
    activeCampaign.log.push(`[${endTime}] Broadcast completed. Success: ${activeCampaign.success}, Failed: ${activeCampaign.failed}`);
  })();

  res.json({ success: true, message: 'Broadcast campaign started.' });
});

app.get('/api/broadcast/status', (req, res) => {
  res.json(activeCampaign);
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Meta Cloud API bot ready on :${PORT}`);
  console.log(`[server] build: ${process.env.RENDER_GIT_COMMIT?.slice(0,7) || 'local'} | phoneId: ${META_PHONE_NUMBER_ID || 'MISSING'} | verifyToken: ${META_VERIFY_TOKEN ? 'set' : 'MISSING'}`);
});
