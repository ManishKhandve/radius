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
const chatStore = require('./chat-store');
const matching = require('./matching');

// ─── Structured logging ─────────────────────────────────────
function log(level, tag, ...args) {
  const ts = new Date().toISOString();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`${ts} [${tag}]`, ...args);
}

process.on('uncaughtException',  (err) => log('error', 'crash', 'Uncaught exception:', err.message, err.stack));
process.on('unhandledRejection', (r)   => log('error', 'crash', 'Unhandled rejection:', r?.message || r));

const app  = express();
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Trust proxy (for Render, Cloudflare, Nginx) ────────────
app.set('trust proxy', 1);

// ─── Body parsing ───────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ─── CORS — restrict API to same-origin ─────────────────────
app.use((req, res, next) => {
  // Allow same-origin requests; block cross-origin to /api/*
  if (req.path.startsWith('/api/') || req.path === '/wati-webhook') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, auth-token');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

// ─── Request timeout (30s) ──────────────────────────────────
app.use((req, res, next) => {
  req.setTimeout(30_000, () => {
    if (!res.headersSent) res.status(408).json({ ok: false, error: 'Request timeout' });
  });
  next();
});

const PORT = process.env.PORT || 3000;

// ─── Meta Cloud API config ───────────────────────────────────
const META_API_VERSION    = process.env.META_API_VERSION    || 'v22.0';
const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
const META_ACCESS_TOKEN    = process.env.META_ACCESS_TOKEN   || '';
const META_VERIFY_TOKEN    = process.env.META_VERIFY_TOKEN   || '';
const META_GRAPH_BASE      = `https://graph.facebook.com/${META_API_VERSION}`;
const BOT_NUMBER           = process.env.META_BOT_NUMBER || ''; // display only

// Owner phone for booking/payment/lead alerts.
// Falls back to hardcoded value to prevent misrouting.
const OWNER_PHONE = process.env.OWNER_PHONE || '919975233763';

// ─── Admin token validation ─────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_TOKEN || ADMIN_TOKEN === 'your-secret-token-here') {
  log('warn', 'boot', '⚠️  ADMIN_TOKEN is missing or uses the default placeholder — admin endpoints are insecure!');
  if (NODE_ENV === 'production') {
    log('error', 'boot', '❌ Refusing to start in production with default ADMIN_TOKEN');
    process.exit(1);
  }
}

// ─── Input validation helpers ───────────────────────────────
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}
function cleanPhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

// ─── Boot-time checks ───────────────────────────────────────
function validateConfig() {
  let hasErrors = false;

  log('info', 'boot', `Starting Cleanly WhatsApp CRM in ${NODE_ENV} mode...`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    log('error', 'boot', '❌ Database Configuration Error: SUPABASE_URL and SUPABASE_KEY must be set');
    hasErrors = true;
  }
  if (!process.env.SPREADSHEET_ID) {
    log('error', 'boot', '❌ Google Sheets Configuration Error: SPREADSHEET_ID must be set');
    hasErrors = true;
  }
  if (!process.env.GOOGLE_CREDENTIALS && !process.env.GOOGLE_CREDENTIALS_PATH) {
    log('error', 'boot', '❌ Google Credentials Error: GOOGLE_CREDENTIALS or GOOGLE_CREDENTIALS_PATH must be set');
    hasErrors = true;
  }

  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID || !META_VERIFY_TOKEN) {
    log('error', 'boot', '❌ Meta Cloud API Configuration Error: META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, and META_VERIFY_TOKEN must be set');
    hasErrors = true;
  }

  if (hasErrors && NODE_ENV === 'production') {
    log('error', 'boot', '❌ Config validation failed in production. Refusing to start.');
    process.exit(1);
  }
}
validateConfig();

log('info', 'boot', `Meta Cloud API ${META_API_VERSION} | phoneId: ${META_PHONE_NUMBER_ID || 'MISSING'} | env: ${NODE_ENV}`);

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

    if (res.ok && metaOk) {
      chatStore.saveMessage(phone, null, 'outbound', text, waMessageId, 'sent');
    }

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
    let j = null;
    try {
      j = JSON.parse(body);
      if (j?.error) { metaOk = false; metaInfo = `${j.error.code || '?'}: ${j.error.message || ''}`; }
      else if (j?.messages?.[0]?.id) { metaInfo = j.messages[0].id.slice(0, 40); }
    } catch {}
    if (res.ok && metaOk) {
      console.log(`[meta] ✓ buttons sent to ${phone}${metaInfo ? ' — ' + metaInfo : ''}`);
      sendMetrics.sent++;
      const btnStr = buttons.map(b => `\n[Btn: ${b.title}]`).join('');
      const wamid = j?.messages?.[0]?.id || null;
      chatStore.saveMessage(phone, null, 'outbound', `${bodyText}${btnStr}`, wamid, 'sent');
      return { ok: true, status: res.status, body, waMessageId: wamid };
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
    let j = null;
    try {
      j = JSON.parse(respBody);
      if (j?.error) { metaOk = false; metaInfo = `${j.error.code || '?'}: ${j.error.message || ''}`; }
      else if (j?.messages?.[0]?.id) { metaInfo = j.messages[0].id.slice(0, 40); }
    } catch {}
    if (res.ok && metaOk) {
      console.log(`[meta] ✓ list sent to ${phone}${metaInfo ? ' — ' + metaInfo : ''}`);
      sendMetrics.sent++;
      const listStr = sections.flatMap(s => (s.rows || []).map(r => `\n[Btn: 📄 ${r.title}]`)).join('');
      const wamid = j?.messages?.[0]?.id || null;
      chatStore.saveMessage(phone, null, 'outbound', `${body}${listStr}`, wamid, 'sent');
      return { ok: true, status: res.status, body: respBody, waMessageId: wamid };
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
    let j = null;
    try {
      j = JSON.parse(body);
      if (j?.error) { metaOk = false; metaInfo = `${j.error.code || '?'}: ${j.error.message || ''}`; }
      else if (j?.messages?.[0]?.id) { metaInfo = j.messages[0].id.slice(0, 40); }
    } catch {}
    if (res.ok && metaOk) {
      console.log(`[meta] ✓ image sent to ${phone}${metaInfo ? ' — ' + metaInfo : ''}`);
      sendMetrics.sent++;
      const wamid = j?.messages?.[0]?.id || null;
      chatStore.saveMessage(phone, null, 'outbound', `[Image] ${caption || ''}`, wamid, 'sent');
      return { ok: true, status: res.status, body, waMessageId: wamid };
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
async function watiSendTemplate(phone, templateName, langCode = 'en', variables = [], headerUrl = null) {
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

  const components = [];

  if (headerUrl) {
    const lowerUrl = headerUrl.toLowerCase();
    const isDoc = lowerUrl.endsWith('.pdf');
    const isVideo = lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov') || lowerUrl.endsWith('.avi');
    const typeStr = isDoc ? 'document' : (isVideo ? 'video' : 'image');
    
    components.push({
      type: 'header',
      parameters: [
        {
          type: typeStr,
          [typeStr]: { link: headerUrl }
        }
      ]
    });
  }

  if (parameters.length > 0) {
    components.push({
      type: 'body',
      parameters: parameters
    });
  }

  if (components.length > 0) {
    payload.template.components = components;
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
      const wamid = j?.messages?.[0]?.id || null;
      chatStore.saveMessage(phone, null, 'outbound', `[Template] ${templateName}`, wamid, 'sent');
      return { ok: true, body: j, waMessageId: wamid };
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
  chatStore.addNotification('⚠️ Message failed — manual follow-up', alert, toPhone, 'send-failure').catch(() => {});
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
  const t = setTimeout(async () => {
    nudgeTimers.delete(phone);
    
    // Do not nudge if an admin agent has taken over the chat
    if (await isPaused(phone)) return;

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

async function pauseUser(phone, hours = PAUSE_DEFAULT_HOURS) {
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  pausedUsers.set(phone, { expiresAt, notified: false });
  console.log(`[pause] ${phone} → paused for ${hours}h`);
  await chatStore.setBotPause(phone, hours);
}

async function resumeUser(phone) {
  const had = pausedUsers.delete(phone);
  if (had) console.log(`[pause] ${phone} → resumed`);
  await chatStore.setBotPause(phone, 0);
  return had;
}

async function isPaused(phone) {
  const entry = pausedUsers.get(phone);
  if (entry && Date.now() <= entry.expiresAt) return true;
  
  const dbPaused = await chatStore.isBotPaused(phone);
  if (dbPaused) {
    pausedUsers.set(phone, { expiresAt: Date.now() + 24*60*60*1000, notified: true });
    return true;
  }

  if (entry) {
    pausedUsers.delete(phone);
    console.log(`[pause] ${phone} → auto-released (pause expired)`);
  }
  return false;
}

// ─── Dedup ──────────────────────────────────────────────────
// Meta can deliver the same message twice if its retry policy fires
// (e.g. our webhook returns slow). Track recent message IDs with TTL.
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEDUP_MAX_SIZE = 5000;
const processedMsgIds = new Map(); // id → timestamp
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedMsgIds.has(id)) return true;
  processedMsgIds.set(id, Date.now());
  // Evict entries older than TTL or if over max size
  if (processedMsgIds.size > DEDUP_MAX_SIZE) {
    const cutoff = Date.now() - DEDUP_TTL_MS;
    for (const [k, ts] of processedMsgIds) {
      if (ts < cutoff) processedMsgIds.delete(k);
    }
    // If still over limit, remove oldest
    if (processedMsgIds.size > DEDUP_MAX_SIZE) {
      const oldest = processedMsgIds.keys().next().value;
      processedMsgIds.delete(oldest);
    }
  }
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
// flow.handleMessage expects a specific message object shape.
// We give it the same shape from Meta's payload.
function buildWrappedMsg(phone, text, type, mediaId, senderName, title = '') {
  return {
    from: phone,
    body: text || '',
    title: title || '',
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

      if (Array.isArray(value.statuses)) {
        for (const st of value.statuses) {
          const wamid = st.id;
          const statusVal = st.status; // sent, delivered, read, failed
          chatStore.updateMessageStatus(wamid, statusVal).catch(() => {});
          const campaignName = wamidToCampaign.get(wamid);
          if (campaignName && ['sent', 'delivered', 'read'].includes(statusVal)) {
            chatStore.updateBroadcastMetric(campaignName, statusVal).catch(() => {});
          }
        }
        if (!Array.isArray(value.messages)) continue;
      }
      
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
  
  // Ignore WhatsApp reactions and unsupported types quietly
  if (msgType === 'reaction' || msgType === 'unknown') return;

  if (!phone) { console.warn('[meta] message missing from'); return; }
  if (alreadyProcessed(msgId)) { console.log('[meta] dedup', msgId); return; }

  // Track Broadcast "Replied" Attribution
  const contactInfo = await chatStore.getContactByPhone(phone);
  if (contactInfo && contactInfo.attribution_campaign && !contactInfo.campaign_replied) {
     await chatStore.updateBroadcastMetric(contactInfo.attribution_campaign, 'replied');
     await chatStore.updateContactCRM(phone, { campaign_replied: true });
  }

  // Extract text + media-id depending on message type
  let text = '';
  let title = '';
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
    title = m.interactive?.button_reply?.title
         || m.interactive?.list_reply?.title
         || '';
  } else {
    text = '';
  }

  // If admin has taken over this customer manually, the bot stays silent.
  // The customer gets a single "an agent will help you" notice the first
  // time they message while paused, then nothing until /release is hit.
  const paused = await isPaused(phone);
  await chatStore.saveMessage(phone, senderName, 'inbound', msgType === 'image' || msgType === 'document' ? `[${msgType}] ${text}` : text, m.id || null, 'delivered');

  if (paused) {
    if (flow.restartIntent(text) || flow.isAdMessage(text)) {
      console.log(`[pause] ${phone} → keyword/ad triggered, unpausing automatically`);
      await resumeUser(phone);
    } else {
      const entry = pausedUsers.get(phone);
      console.log(`[pause] ${phone} → skipping bot reply (agent takeover)`);
      if (entry && !entry.notified) {
        entry.notified = true;
        watiSend(phone, "👤 An agent from our team will reply to you shortly. Thanks for your patience!")
          .catch(() => {});
      }
      return;
    }
  }

  console.log('[meta] from:', phone, 'type:', msgType, 'body:', JSON.stringify(String(text)).slice(0, 30));

  // Hand off to the flow inside the per-user queue
  runQueued(phone, async () => {
    const t0 = Date.now();
    const wrapped = buildWrappedMsg(phone, text, msgType, mediaId, senderName, title);
    try {
      const replies = await flow.handleMessage(wrapped);
      console.log('[task]', phone, 'flow:', Date.now() - t0, 'ms, replies:', replies.length);
      for (const reply of replies) {
        try {
          if (typeof reply === 'object' && reply && reply._adminAlert) {
            // Mirror the alert into the CRM Notifications tab (title = first line).
            const alertTitle = String(reply._adminAlert).split('\n')[0].replace(/[*_]/g, '').trim().slice(0, 120);
            chatStore.addNotification(alertTitle, reply._adminAlert, phone, 'alert').catch(() => {});
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

// ─── Dashboard Chat APIs ───────────────────────────────────────
app.get('/chat', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(__dirname + '/livechat.html');
});

// Serve login page
app.get('/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(__dirname + '/login.html');
});

const crypto = require('crypto');
const AUTH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const authTokens = new Map(); // token → { username, role, createdAt }
const wamidToCampaign = new Map();
function setWamidCampaign(wamid, campaignName) {
  wamidToCampaign.set(wamid, campaignName);
  if (wamidToCampaign.size > 10000) {
    const oldestKey = wamidToCampaign.keys().next().value;
    wamidToCampaign.delete(oldestKey);
  }
}

// ─── Auth token cleanup (every 30 min) ─────────────────────
setInterval(() => {
  const now = Date.now();
  let expired = 0;
  for (const [token, entry] of authTokens) {
    if (now - entry.createdAt > AUTH_TOKEN_TTL_MS) {
      authTokens.delete(token);
      expired++;
    }
  }
  if (expired > 0) log('info', 'auth', `Cleaned up ${expired} expired token(s)`);
}, 30 * 60 * 1000);

// ─── Paused users cleanup (every 15 min) ────────────────────
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [phone, entry] of pausedUsers) {
    if (now > entry.expiresAt) {
      pausedUsers.delete(phone);
      cleaned++;
    }
  }
  if (cleaned > 0) log('info', 'pause', `Cleaned up ${cleaned} expired pause(s)`);
}, 15 * 60 * 1000);

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ ok: false, error: 'Missing credentials' });

  const user = await chatStore.loginUser(username, password);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

  const token = crypto.randomBytes(32).toString('hex');
  authTokens.set(token, { username: user.username, role: user.role, createdAt: Date.now() });

  res.json({ ok: true, success: true, token, role: user.role, username: user.username });
});

const authMiddleware = (req, res, next) => {
  const token = req.headers['auth-token'];
  const entry = authTokens.get(token);
  if (!entry) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  // Check TTL
  if (Date.now() - entry.createdAt > AUTH_TOKEN_TTL_MS) {
    authTokens.delete(token);
    return res.status(401).json({ ok: false, error: 'Session expired, please login again' });
  }
  req.user = entry;
  next();
};

app.get('/api/chat/contacts', authMiddleware, async (req, res) => {
  const contacts = await chatStore.getContacts(req.user.role, req.user.username);
  res.json({ ok: true, success: true, contacts });
});

app.get('/api/users', authMiddleware, async (req, res) => {
  const users = await chatStore.getUsers();
  res.json({ ok: true, success: true, users });
});

app.get('/api/analytics', authMiddleware, async (req, res) => {
  const metrics = await chatStore.getBroadcastMetrics();
  res.json({ ok: true, success: true, metrics });
});

app.get('/api/chat/messages/:phone', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  const messages = await chatStore.getMessages(phone);
  const isBotPaused = await chatStore.isBotPaused(phone);
  res.json({ ok: true, success: true, messages, isBotPaused });
});

app.post('/api/chat/send', authMiddleware, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ ok: false, error: 'Missing phone or message' });
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number' });
  
  await pauseUser(phone, 4); // Pause bot automatically when human replies
  
  const result = await watiSend(phone, message);
  if (result.ok) {
    await chatStore.updateContactLabel(phone, 'read');
    res.json({ ok: true, success: true });
  } else {
    res.status(500).json({ ok: false, error: 'Failed to send', details: result.error });
  }
});

app.post('/api/chat/read', authMiddleware, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: 'Missing phone' });
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  await chatStore.updateContactLabel(phone, 'read');
  res.json({ ok: true, success: true });
});

app.post('/api/chat/pause', authMiddleware, async (req, res) => {
  const { phone, hours } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: 'Missing phone' });
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  
  if (hours > 0) {
    await pauseUser(phone, hours);
    res.json({ ok: true, success: true, paused: true });
  } else {
    await resumeUser(phone);
    res.json({ ok: true, success: true, paused: false });
  }
});

app.post('/api/chat/label', authMiddleware, async (req, res) => {
  const { phone, label } = req.body;
  if (!phone || !label) return res.status(400).json({ ok: false, error: 'Missing phone or label' });
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  
  await chatStore.updateContactLabel(phone, label);
  res.json({ ok: true, success: true, label });
});

app.post('/api/chat/crm', authMiddleware, async (req, res) => {
  const { phone, lead_status, assigned_agent, follow_up_time, follow_up_times, tags, abandonment_drip_stage } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: 'Missing phone' });
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });

  const updates = {};
  if (lead_status !== undefined) {
      updates.lead_status = lead_status;
      if (lead_status === 'Booked') {
         const c = await chatStore.getContactByPhone(phone);
         if (c && c.attribution_campaign && !c.campaign_booked) {
             await chatStore.updateBroadcastMetric(c.attribution_campaign, 'booked');
             updates.campaign_booked = true;
         }
      }
  }
  if (assigned_agent !== undefined) updates.assigned_agent = assigned_agent;
  if (follow_up_times !== undefined) {
      // Up to 5 scheduled follow-up dates; keep follow_up_time synced to the
      // soonest so the reminder cron and any legacy readers still work.
      const arr = (Array.isArray(follow_up_times) ? follow_up_times : [])
        .filter(Boolean).map(String).slice(0, 5)
        .sort((a, b) => new Date(a) - new Date(b));
      updates.follow_up_times = arr;
      updates.follow_up_time = arr[0] || null;
  } else if (follow_up_time !== undefined) {
      updates.follow_up_time = follow_up_time;
  }
  if (tags !== undefined) updates.tags = tags;
  if (abandonment_drip_stage !== undefined) updates.abandonment_drip_stage = abandonment_drip_stage;

  await chatStore.updateContactCRM(phone, updates);
  res.json({ ok: true, success: true });
});

app.get('/api/notes/:phone', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  const notes = await chatStore.getNotes(phone);
  res.json({ ok: true, success: true, notes });
});

app.post('/api/notes', authMiddleware, async (req, res) => {
  const { phone, note } = req.body;
  if (!phone || !note) return res.status(400).json({ ok: false, error: 'Missing phone or note' });
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  
  // Store note with the logged-in user's name
  const newNote = await chatStore.addNote(phone, note, req.user.username);
  res.json({ ok: true, success: true, note: newNote });
});

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${config.businessName} Bot</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-color: #f8fafc;
    --card-bg: #ffffff;
    --border-color: #94a3b8;
    --text-main: #0f172a;
    --text-muted: #334155;
    --primary: #10b981;
  }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg-color);
    background-image: 
      radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%),
      radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.04) 0px, transparent 50%);
    color: var(--text-main);
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
  }
  .card {
    text-align: center;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    padding: 3rem;
    border-radius: 24px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
    max-width: 420px;
    width: 90%;
  }
  h1 {
    font-family: 'Outfit', sans-serif;
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .business {
    color: var(--text-muted);
    font-size: 15px;
    margin-bottom: 24px;
  }
  .dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary);
    box-shadow: 0 0 12px var(--primary);
    animation: pulse 2s infinite;
  }
  .stats {
    font-size: 13px;
    color: var(--text-muted);
    background: #f1f5f9;
    padding: 10px 16px;
    border-radius: 12px;
    border: 1px solid var(--border-color);
    display: inline-block;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: .4; transform: scale(1.15); }
  }
</style></head>
<body><div class="card">
  <h1><span class="dot"></span> Bot is Active</h1>
  <p class="business">${config.businessName}</p>
  <div class="stats">Sessions: <span id="s">—</span> &nbsp;·&nbsp; Uptime: <span id="u">—</span>s</div>
</div>
<script>
  setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{
    document.getElementById('s').textContent=d.activeSessions;
    document.getElementById('u').textContent=Math.floor(d.uptime);
  }),5000);
</script>
</body></html>`);
});

app.get('/status', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    sender: 'Meta Cloud API',
    env: NODE_ENV,
    nodeVersion: process.version,
    build: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local',
    apiVersion: META_API_VERSION,
    phoneId: META_PHONE_NUMBER_ID || 'MISSING',
    hasToken: !!META_ACCESS_TOKEN,
    hasVerifyToken: !!META_VERIFY_TOKEN,
    activeSessions: flow.activeSessionCount(),
    uptime: process.uptime(),
    bot: BOT_NUMBER,
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
    },
    maps: {
      authTokens: authTokens.size,
      pausedUsers: pausedUsers.size,
      nudgeTimers: nudgeTimers.size,
      dedupIds: processedMsgIds.size,
      userQueues: userQueues.size,
    },
    msgs: {
      sent:   sendMetrics.sent,
      failed: sendMetrics.failed,
      recentFailures: sendMetrics.recentFailures.slice(-10),
    },
  });
});

app.get('/ping', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.send('pong');
});

// Admin page — same as before
app.get('/admin', (req, res) => {
  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cleanly WhatsApp - Admin Portal</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-color: #f8fafc;
    --card-bg: #ffffff;
    --border-color: #94a3b8;
    --text-main: #0f172a;
    --text-muted: #334155;
    --primary: #10b981;
    --indigo: #4f46e5;
    --error: #e11d48;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    background: var(--bg-color);
    background-image: 
      radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%),
      radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.04) 0px, transparent 50%);
    color: var(--text-main);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2rem 1rem;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 24px;
    padding: 36px;
    width: 100%;
    max-width: 460px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
  }
  h2 {
    font-family: 'Outfit', sans-serif;
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  label {
    display: block;
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 8px;
    font-weight: 500;
  }
  input {
    width: 100%;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    background: #ffffff;
    color: var(--text-main);
    font-size: 14px;
    margin-bottom: 14px;
    outline: none;
    transition: border-color 0.2s;
    font-family: inherit;
  }
  input:focus { border-color: var(--primary); }
  button {
    width: 100%;
    padding: 12px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, var(--primary) 0%, #047857 100%);
    color: #fff;
    font-size: 14.5px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
    font-family: inherit;
  }
  button:hover { opacity: 0.95; }
  button.secondary {
    background: linear-gradient(135deg, var(--indigo) 0%, #4f46e5 100%);
  }
  button:disabled { opacity: .5; cursor: not-allowed; }
  
  .result {
    margin-top: 14px;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 12px;
    display: none;
    white-space: pre-wrap;
    text-align: left;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    line-height: 1.5;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  .result.ok { background: #0f172a; border: 1px solid var(--border-color); color: #a7f3d0; }
  .result.err { background: #0f172a; border: 1px solid var(--border-color); color: #fca5a5; }
  
  .hint { font-size: 12px; color: var(--text-muted); margin-top: -6px; margin-bottom: 14px; line-height: 1.4; }
  .divider { height: 1px; background: var(--border-color); margin: 28px 0 24px; }</style>
</head><body><div class="card">
<h2>📤 Send Intro Message</h2>
<label>Country Code + Phone Number</label>
<input type="tel" id="phone" placeholder="e.g. 919876543210" inputmode="numeric"/>
<p class="hint">Customer must have messaged the bot within the last 24 hours.</p>
<button id="btn" onclick="send()">Send Message</button>
<div class="result" id="result"></div>
</div>
<script>
async function send(){
  const phone=document.getElementById('phone').value.replace(/\D/g,'');
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
app.get('/takeover', async (req, res) => {
  const { phone, token, hours } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!phone) return res.status(400).send('Missing ?phone=');
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const durationHours = Math.max(1, Math.min(48, parseInt(hours) || PAUSE_DEFAULT_HOURS));
  await pauseUser(cleanPhone, durationHours);
  res.json({
    ok: true,
    phone: cleanPhone,
    pausedForHours: durationHours,
    releasesAt: new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString(),
  });
});

app.get('/release', async (req, res) => {
  const { phone, token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!phone) return res.status(400).send('Missing ?phone=');
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  const wasReleased = await resumeUser(cleanPhone);
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
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'broadcast.html'));
});

app.post('/api/broadcast', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
  const { templateName, languageCode, recipients, headerUrl } = req.body;

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

      let cleanPhone = String(r.phone).replace(/\D/g, '');
      // India-only service: a bare 10-digit number is missing its country
      // code, which Meta rejects. Prepend 91. Also handle a leading 0
      // (e.g. 0XXXXXXXXXX → 91XXXXXXXXXX).
      if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
      else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) cleanPhone = '91' + cleanPhone.slice(1);
      const displayName = String(r.name || 'Customer').trim();
      activeCampaign.sent++;

      try {
        // We pass the recipient's Name as the first parameter (maps to {{1}} in the body)
        const result = await watiSendTemplate(cleanPhone, templateName, languageCode, [displayName], headerUrl);
        if (result.ok) {
          activeCampaign.success++;
          activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Sent to ${displayName} (${cleanPhone}) — Success`);
          
          if (result.body && result.body.messages && result.body.messages[0]) {
             setWamidCampaign(result.body.messages[0].id, templateName);
             await chatStore.updateBroadcastMetric(templateName, 'sent').catch(()=>{});
          }
          
          // Add attribution tracking to CRM
          await chatStore.updateContactCRM(cleanPhone, {
             attribution_campaign: templateName,
             campaign_replied: false,
             campaign_booked: false
          }).catch(()=>{});
          
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

app.get('/api/broadcast/status', authMiddleware, (req, res) => {
  res.json(activeCampaign);
});

app.get('/api/quickreplies', authMiddleware, async (req, res) => {
  const replies = await chatStore.getQuickReplies();
  res.json({ ok: true, success: true, replies });
});

app.post('/api/quickreplies', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
  const { shortcut, message } = req.body;
  if (!shortcut || !message) return res.status(400).json({ ok: false, error: 'Missing fields' });
  const newReply = await chatStore.addQuickReply(shortcut, message);
  res.json({ ok: true, success: true, reply: newReply });
});

app.delete('/api/quickreplies/:shortcut', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
  await chatStore.deleteQuickReply(req.params.shortcut);
  res.json({ ok: true, success: true });
});

// ─── Background Cron: Follow-up Reminders ─────────────────────
const notifiedFollowups = new Set();
setInterval(async () => {
  try {
    const dues = await chatStore.getDueFollowups();
    const currentDueKeys = new Set(dues.map(d => `${d.phone}_${d.follow_up_time}`));
    
    // Clean up keys that are no longer active/due to prevent memory leaks and support rescheduled follow-ups
    for (const key of notifiedFollowups) {
      if (!currentDueKeys.has(key)) {
        notifiedFollowups.delete(key);
      }
    }
    
    for (const d of dues) {
      const key = `${d.phone}_${d.follow_up_time}`;
      if (!notifiedFollowups.has(key)) {
        notifiedFollowups.add(key);
        const alertMsg = `⏰ *Follow-up Reminder*\nCustomer: ${d.name || 'Unknown'}\nPhone: +${d.phone}\nAssigned: ${d.assigned_agent || 'Unassigned'}\n\n_Please check the CRM._`;
        watiSend(OWNER_PHONE, alertMsg).catch(()=>{});
      }
    }
  } catch (err) {
    console.error('[cron] follow-up check failed', err.message);
  }
}, 60000); // Check every minute

// ─── WhatsApp Follow-up Drip (Interested maid customers) ─────
// Sends follow-up templates to leads in the `customers` table whose
// status = 'Interested'. Manual trigger only — an admin presses
// "Run Follow-Ups" in the CRM (POST /api/run-followups) or hits
// GET /run-followups?token=ADMIN_TOKEN. Progress is tracked per-customer
// via the wa_followup_stage column so a repeat press never re-sends a stage.
//
// Cadence (see FOLLOWUP_CADENCE below):
//   'single' — one follow-up per customer (day3 template), then done.
//   'staged' — Day 3 → 7 → 15 progression, one stage advanced per run.
// Change the constant to switch; no other code changes needed.
const FOLLOWUP_CADENCE = 'single';

// Approved templates (media header, static body — no {{1}} variables).
const DRIP_TEMPLATES = {
  3:  { name: 'day3_follow_up',  header: 'https://ikwyrrzipzfbyzmkrfmu.supabase.co/storage/v1/object/public/media/Untitled%20design%20(1).mp4' },
  7:  { name: 'day7_follow_up',  header: 'https://ikwyrrzipzfbyzmkrfmu.supabase.co/storage/v1/object/public/media/WhatsApp%20Video%202026-06-10%20at%204.08.29%20PM.mp4' },
  15: { name: 'day15_follow_up', header: 'https://ikwyrrzipzfbyzmkrfmu.supabase.co/storage/v1/object/public/media/WhatsApp%20Image%202026-06-10%20at%205.13.53%20PM.jpeg' },
};

// customers.phone is stored as 10 local digits (e.g. 9545533100). Meta needs
// a full number with country code. Returns null for unusable numbers.
function toMetaPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 12 && d.startsWith('91')) return d;
  return null;
}

// Which drip day (if any) is next for a given stage under the active cadence.
function nextDripDay(stage) {
  if (stage >= 15) return null;
  if (FOLLOWUP_CADENCE === 'single') return 3;   // one send, then marked done
  for (const d of [3, 7, 15]) if (stage < d) return d;
  return null;
}

// Process a single customer. Returns { action: 'sent'|'skipped'|'error', ... }.
async function processOneCustomerForFollowup(c) {
  const phone = toMetaPhone(c.phone);
  if (!phone) return { action: 'skipped', reason: 'invalid phone' };

  const stage = c.wa_followup_stage || 0;
  const dripDay = nextDripDay(stage);
  if (!dripDay) return { action: 'skipped', reason: 'all follow-ups already sent' };

  const tpl = DRIP_TEMPLATES[dripDay];
  const result = await watiSendTemplate(phone, tpl.name, 'en', [], tpl.header);

  // Advance stage whether or not the send succeeded — each stage is a
  // best-effort one-shot, so a rejected send is not retried every run.
  // In 'single' mode we jump straight to 15 (done); in 'staged' we step.
  const newStage = FOLLOWUP_CADENCE === 'single' ? 15 : dripDay;
  await chatStore.advanceCustomerFollowupStage(c.id, newStage);

  if (result.ok) return { action: 'sent', template: tpl.name, stage: dripDay };
  const reason = result.error?.message || JSON.stringify(result.error || {});
  return { action: 'error', template: tpl.name, reason };
}

// ─── Maid-revival campaign (dead / closed customers) ─────────
// Customers marked "Not Interested" or "Didn't Convert" get the photos of
// the TOP 3 maids nearest to them (one template message per maid) once every
// 7 days, up to 4 rounds (~1 month), then stop. Paced by the revive_stage /
// revive_last_sent_at columns so it's safe to press daily.
//
// REVIVE_TEMPLATE_NAME must be an approved template with an IMAGE header
// (the maid photo is passed as the header) and a static caption body — no
// body variables. Set this to your approved template's exact name.
const REVIVE_TEMPLATE_NAME = 'maid_nearby_profile';
const REVIVE_INTERVAL_DAYS = 7;
const REVIVE_MAX_SENDS      = 4;   // 7 + 14 + 21 + 28 days ≈ one month

async function processOneCustomerForRevive(c, now) {
  const phone = toMetaPhone(c.phone);
  if (!phone) return { action: 'skipped', reason: 'invalid phone' };

  const stage = c.revive_stage || 0;
  if (stage >= REVIVE_MAX_SENDS) return { action: 'skipped', reason: 'revive complete (1 month)' };

  // 7-day gate — don't message again until a week has passed.
  if (c.revive_last_sent_at) {
    const daysSince = (now - new Date(c.revive_last_sent_at)) / (1000 * 60 * 60 * 24);
    if (daysSince < REVIVE_INTERVAL_DAYS) {
      return { action: 'skipped', reason: `next revive in ${(REVIVE_INTERVAL_DAYS - daysSince).toFixed(1)}d` };
    }
  }

  if (!c.latitude || !c.longitude) return { action: 'skipped', reason: 'no location' };

  let maids;
  try {
    maids = await matching.getTopMaids(c.latitude, c.longitude);
  } catch (err) {
    return { action: 'error', reason: 'maid match failed: ' + err.message };
  }
  // Send the top 3 nearby maids — one template (photo header) per maid.
  // getTopMaids already returns at most 3, sorted P1→P4 zone then distance.
  const withPhoto = (maids || []).filter(m => m.photo_url).slice(0, 3);
  if (withPhoto.length === 0) return { action: 'skipped', reason: 'no nearby maid with a photo' };

  const sentMaids = [];
  const failures  = [];
  for (const maid of withPhoto) {
    const result = await watiSendTemplate(phone, REVIVE_TEMPLATE_NAME, 'en', [], maid.photo_url);
    if (result.ok) sentMaids.push(maid.name);
    else failures.push(`${maid.name}: ${result.error?.message || 'send failed'}`);
  }

  // Advance whether or not the sends succeeded — best-effort weekly one-shot.
  await chatStore.advanceReviveStage(c.id, stage + 1, new Date(now).toISOString());

  if (sentMaids.length > 0) {
    return { action: 'sent', template: REVIVE_TEMPLATE_NAME, maids: sentMaids, sentCount: sentMaids.length, revive: stage + 1 };
  }
  return { action: 'error', template: REVIVE_TEMPLATE_NAME, reason: failures.join(' | ').slice(0, 200) };
}

// One full pass: the Interested drip, then the dead/closed maid-revival.
async function runFollowupsBatch() {
  const summary = { totalLeadsChecked: 0, followUpsSent: 0, followUpsSkipped: 0, errors: 0 };
  const details = [];
  const tally = (res) => {
    if (res.action === 'sent') summary.followUpsSent++;
    else if (res.action === 'skipped') summary.followUpsSkipped++;
    else if (res.action === 'error') summary.errors++;
  };
  const now = Date.now();

  // 1) Interested customers → Day 3/7/15 (or single) drip.
  const interested = await chatStore.getInterestedFollowupCustomers();
  for (const c of interested) {
    const res = await processOneCustomerForFollowup(c);
    tally(res);
    details.push({ campaign: 'interested', phone: c.phone, name: c.name || null, ...res });
  }

  // 2) Dead / closed customers → weekly nearby-maid photo for one month.
  const revive = await chatStore.getReviveCustomers();
  for (const c of revive) {
    const res = await processOneCustomerForRevive(c, now);
    tally(res);
    details.push({ campaign: 'revive', phone: c.phone, name: c.name || null, ...res });
  }

  summary.totalLeadsChecked = interested.length + revive.length;
  return { summary, details };
}

// Manual trigger via the CRM "Run Follow-Ups" button (session auth, admin-only).
app.post('/api/run-followups', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
  const t0 = Date.now();
  try {
    const { summary, details } = await runFollowupsBatch();
    summary.durationMs = Date.now() - t0;
    log('info', 'drip', `manual run (CRM) by ${req.user.username}: ${JSON.stringify(summary)}`);
    res.json({ ok: true, summary, details });
  } catch (err) {
    log('error', 'drip', 'manual run (CRM) failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Same trigger via ADMIN_TOKEN query param (for curl / external schedulers).
app.get('/run-followups', async (req, res) => {
  if (!req.query.token || req.query.token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  const t0 = Date.now();
  try {
    const { summary, details } = await runFollowupsBatch();
    summary.durationMs = Date.now() - t0;
    log('info', 'drip', `manual run (token): ${JSON.stringify(summary)}`);
    res.json({ ok: true, summary, details });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Maid (worker) follow-ups ────────────────────────────────
// No bulk campaign: maids are messaged one-by-one from the Maids directory
// view, where the agent picks the template and video/image per send
// (POST /api/people/message below).

// ─── People directory (flat_customers / customers / maids) ───
// Browse the three lead tables and message an individual via template.
app.get('/api/people', authMiddleware, async (req, res) => {
  const group = req.query.group;
  if (!chatStore.isPeopleGroup(group)) {
    return res.status(400).json({ ok: false, error: 'Unknown group' });
  }
  try {
    const people = await chatStore.getPeople(group);
    res.json({ ok: true, group, people });
  } catch (err) {
    log('error', 'people', `fetch ${group} failed:`, err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start (or reopen) a normal chat with a person from a directory view.
// Creates the contact under the Meta-normalized phone (so their replies map
// to the same thread) tagged with the group's service category.
const PEOPLE_SERVICE_CATEGORY = {
  flat_customers: 'cleaning',
  customers:      'maid',
  maids:          'worker',
};
app.post('/api/people/start-chat', authMiddleware, async (req, res) => {
  const { group, phone, name } = req.body || {};
  const to = toMetaPhone(phone);
  if (!to) return res.status(400).json({ ok: false, error: 'Invalid phone number' });
  if (!PEOPLE_SERVICE_CATEGORY[group]) return res.status(400).json({ ok: false, error: 'Unknown group' });
  try {
    const contact = await chatStore.ensureContact(to, (name || '').trim() || null, PEOPLE_SERVICE_CATEGORY[group]);
    if (!contact) return res.status(500).json({ ok: false, error: 'Could not create contact' });
    res.json({ ok: true, contact });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Notifications: due follow-up reminders for the CRM tab ──
// Same data the owner-alert cron uses (contacts with lead_status =
// 'Follow-up Required' and follow_up_time in the past), served to the UI.
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const [dues, alerts] = await Promise.all([
      chatStore.getDueFollowups(),
      chatStore.getNotifications(50),
    ]);
    // Employees only see their own / unassigned follow-ups.
    const list = req.user.role === 'admin'
      ? dues
      : dues.filter(d => !d.assigned_agent || d.assigned_agent === 'Unassigned' || d.assigned_agent === req.user.username);
    const unreadAlerts = alerts.filter(a => !a.read).length;
    res.json({ ok: true, notifications: list, alerts, unreadAlerts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mark all stored alerts as read (called when the Notifications tab is opened).
app.post('/api/notifications/read', authMiddleware, async (req, res) => {
  await chatStore.markNotificationsRead();
  res.json({ ok: true });
});

// Send one approved template to a single person from a directory view.
// bodyParams maps to the template's {{1}}, {{2}}… body variables; headerUrl is
// the media header. Both must match the approved template exactly (Meta #132000).
app.post('/api/people/message', authMiddleware, async (req, res) => {
  const { phone, templateName, languageCode, headerUrl, bodyParams } = req.body || {};
  const to = toMetaPhone(phone);
  if (!to) return res.status(400).json({ ok: false, error: 'Invalid phone number' });
  if (!templateName) return res.status(400).json({ ok: false, error: 'templateName is required' });
  const params = Array.isArray(bodyParams) ? bodyParams.map(String) : [];
  try {
    const result = await watiSendTemplate(to, templateName.trim(), languageCode || 'en', params, headerUrl || null);
    if (result.ok) return res.json({ ok: true });
    return res.status(502).json({ ok: false, error: result.error?.message || 'Send failed' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Global error handler ───────────────────────────────────
// Catches unhandled Express errors to return consistent JSON.
app.use((err, req, res, _next) => {
  log('error', 'express', `Unhandled error on ${req.method} ${req.path}:`, err.message);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

// ─── 404 handler ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not found: ${req.method} ${req.path}` });
});

// --- Start ---──────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  log('info', 'server', `Meta Cloud API bot ready on :${PORT}`);
  log('info', 'server', `build: ${process.env.RENDER_GIT_COMMIT?.slice(0,7) || 'local'} | phoneId: ${META_PHONE_NUMBER_ID || 'MISSING'} | verifyToken: ${META_VERIFY_TOKEN ? 'set' : 'MISSING'} | env: ${NODE_ENV}`);
});

// ─── Graceful shutdown ──────────────────────────────────────
function gracefulShutdown(signal) {
  log('info', 'shutdown', `${signal} received — shutting down gracefully...`);
  server.close(() => {
    log('info', 'shutdown', 'HTTP server closed');
    process.exit(0);
  });
  // Force exit after 5 seconds if connections don't drain
  setTimeout(() => {
    log('warn', 'shutdown', 'Forcing exit after 5s timeout');
    process.exit(1);
  }, 5000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
