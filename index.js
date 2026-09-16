// ============================================================
// index.js — White-label WhatsApp CRM — Meta WhatsApp Cloud API edition
// ============================================================
// Receives incoming WhatsApp messages via Meta Cloud API webhook,
// processes them through flow.js, sends replies via Meta Graph API.
// ============================================================

require('dotenv').config();
const express = require('express');
const flow    = require('./flow');
const config  = require('./config');
const chatStore = require('./chat-store');
const wfStore = require('./workflow-store');
const wfEngine = require('./workflow-engine');
const aiAssistant = require('./ai-assistant');
const sheetAutomations = require('./sheet-automations');

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

// ─── Demo mode (no database) ────────────────────────────────
// DEMO_MODE=true (or missing SUPABASE_* vars): login is skipped, all
// API auth passes as a demo admin, and every endpoint degrades to empty
// data. For local UI review only — never enable in production.
const DEMO_MODE = process.env.DEMO_MODE === 'true' || !process.env.DATABASE_URL;
if (DEMO_MODE) log('warn', 'boot', '⚠️  DEMO MODE — login skipped, data will be empty. Set DEMO_MODE=false + DATABASE_URL for real use.');

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

// Admin phone for delivery-failure / follow-up alerts (optional).
// Set OWNER_PHONE in env to receive these on WhatsApp.
const OWNER_PHONE = process.env.OWNER_PHONE || process.env.ADMIN_WHATSAPP || '';

// ─── Admin token validation ─────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_TOKEN || ADMIN_TOKEN === 'your-secret-token-here') {
  log('warn', 'boot', '⚠️  ADMIN_TOKEN is missing or uses the default placeholder — admin endpoints are insecure!');
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

  log('info', 'boot', `Starting WhatsApp CRM (${config.businessName}) in ${NODE_ENV} mode...`);

  // Neon Postgres is optional: without it the app runs with empty, non-persisted
  // data (demo / fresh-start mode). Never fatal — even in production.
  if (!process.env.DATABASE_URL) {
    log('warn', 'boot', '⚠️  No DATABASE_URL — running without a database (empty data, nothing persists).');
  }

  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID || !META_VERIFY_TOKEN) {
    log('warn', 'boot', '⚠️  Meta Cloud API tokens missing — WhatsApp messaging will be disabled until configured.');
    // We intentionally don't set hasErrors = true so the app can start
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
// task loop, takeover, admin alerts, etc.). Internally hits the Meta Graph API.
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
  log: [],
  campaignName: null
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
      const varStr = (variables && variables.length) ? ` — {{1}}=${String(variables[0]).slice(0,40)}` : '';
      const hdrStr = headerUrl ? ` | header: ${headerUrl.slice(0,80)}` : '';
      chatStore.saveMessage(phone, null, 'outbound', `[Template] ${templateName}${varStr}${hdrStr}`, wamid, 'sent');
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
  if (OWNER_PHONE) _metaSendOnce(OWNER_PHONE, alert).catch(() => {});
}

// ─── New inbound message → admin WhatsApp alert ───────────────
// Forwards a preview of every incoming customer message to the admin's
// WhatsApp (throttled per-phone so an active back-and-forth doesn't spam
// them). This does NOT create an in-app CRM notification — the "New
// Messages" section was removed; the Conversations list itself is where
// agents see and read incoming messages.
const lastInboundAdminAlert = new Map(); // phone -> timestamp
const INBOUND_ALERT_THROTTLE_MS = 3 * 60 * 1000; // 3 min per phone

function notifyNewInboundMessage(phone, name, text, msgType) {
  // Skip pure menu navigation (button/list taps) — not real messages.
  if (msgType === 'interactive' || msgType === 'button') return;
  const who = name || `+${phone}`;
  const isMedia = ['image', 'document', 'video', 'audio', 'voice'].includes(msgType);
  const preview = (isMedia ? `[${msgType}]${text ? ' ' + text : ''}` : (text || '')).slice(0, 300);

  const last = lastInboundAdminAlert.get(phone) || 0;
  if (OWNER_PHONE && Date.now() - last >= INBOUND_ALERT_THROTTLE_MS) {
    lastInboundAdminAlert.set(phone, Date.now());
    if (lastInboundAdminAlert.size > 5000) lastInboundAdminAlert.clear(); // bound memory
    const alert = `💬 *New message*\nFrom: ${who}\nPhone: +${phone}\n\n${preview}`;
    watiSend(OWNER_PHONE, alert)
      .then(r => console.log(r.ok ? '[inbound-alert] sent to owner' : '[inbound-alert] FAILED'))
      .catch(() => {});
  }
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
      // Meta uses a two-step media flow:
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
          if (isDuplicateStatus(wamid, statusVal)) continue;
          chatStore.updateMessageStatus(wamid, statusVal).catch((e) => console.error('[webhook] updateMessageStatus fail:', e.message));
          const campaignName = wamidToCampaign.get(wamid);
          if (campaignName && ['sent', 'delivered', 'read', 'failed'].includes(statusVal)) {
            chatStore.updateBroadcastMetric(campaignName, statusVal).catch((e) => console.error('[webhook] updateBroadcastMetric fail:', e.message));
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

  // Alert the CRM + admin about the new incoming message.
  notifyNewInboundMessage(phone, senderName, text, msgType);

  // Sales-flow automation (fire-and-forget, never blocks delivery):
  // a customer reply STOPS automatic messages, and matching keywords
  // START keyword sequences (Thinking / Price Objection / …).
  wfEngine.handleInboundReply(phone).catch(() => {});
  if (text) {
    wfEngine.handleInboundText(phone, senderName, text).catch(() => {});
  }

  // AI layer: fire-and-forget, never blocks message delivery. Full chat
  // analysis (extraction, suggestions, etc.) is debounced per phone.
  if (msgType === 'text' && text) {
    aiAssistant.scheduleAnalysis(phone);
  }

  // An agent has taken over this chat — the bot stays silent until released
  // via the inbox toggle or POST /api/chat/pause.
  if (paused) {
    console.log(`[pause] ${phone} → skipping bot reply (agent takeover)`);
    return;
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
// Dedup for webhook status retries — Meta may redeliver same (wamid, status)
const processedStatusIds = new Set();
function isDuplicateStatus(wamid, status) {
  const key = wamid + ':' + status;
  if (processedStatusIds.has(key)) return true;
  processedStatusIds.add(key);
  if (processedStatusIds.size > 20000) {
    const oldest = processedStatusIds.values().next().value;
    processedStatusIds.delete(oldest);
  }
  return false;
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
  if (DEMO_MODE) {
    const token = 'demo-' + crypto.randomBytes(16).toString('hex');
    authTokens.set(token, { username: 'Demo', role: 'admin', createdAt: Date.now() });
    return res.json({ ok: true, success: true, token, role: 'admin', username: 'Demo' });
  }
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ ok: false, error: 'Missing credentials' });

  const user = await chatStore.loginUser(username, password);
  if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

  const token = crypto.randomBytes(32).toString('hex');
  authTokens.set(token, { username: user.username, role: user.role, createdAt: Date.now() });

  res.json({ ok: true, success: true, token, role: user.role, username: user.username });
});

const authMiddleware = (req, res, next) => {
  if (DEMO_MODE) {
    req.user = { username: 'Demo', role: 'admin', demo: true };
    return next();
  }
  const token = req.headers['auth-token'];
  const entry = authTokens.get(token);
  if (!entry) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  // Check TTL
  if (Date.now() - entry.createdAt > AUTH_TOKEN_TTL_MS) {
    authTokens.delete(token);
    return res.status(401).json({ ok: false, error: 'Session expired, please login again' });
  }
  entry.lastSeen = Date.now(); // powers /api/team/presence's "online" flag
  req.user = entry;
  next();
};

// ─── Presence & typing indicators ────────────────────────────
// Ephemeral UI sugar only — in-memory, never persisted.
const TYPING_TTL_MS           = 6_000;  // "X is typing" clears this long after the last keystroke ping
const META_TYPING_THROTTLE_MS = 20_000; // Meta's own indicator lasts ~25s — don't re-poke more often than this
const ONLINE_WINDOW_MS        = 60_000; // agent counted "online" if seen within the last minute
const typingByPhone = new Map();            // phone -> { username, at }
const lastMetaTypingSentByPhone = new Map(); // phone -> timestamp

// Which agent (other than excludeUsername) is currently typing to this phone.
function whoIsTyping(phone, excludeUsername) {
  const t = typingByPhone.get(phone);
  if (!t) return null;
  if (Date.now() - t.at > TYPING_TTL_MS) { typingByPhone.delete(phone); return null; }
  return t.username === excludeUsername ? null : t.username;
}

// Marks the customer's last inbound message read and shows a "typing…"
// indicator in their WhatsApp app for up to ~25s (or until the real reply
// sends). Best-effort cosmetic feature — failures are swallowed.
async function sendTypingIndicator(phone) {
  const wamid = await chatStore.getLastInboundWamid(phone);
  if (!wamid) return { ok: false, reason: 'no inbound message to anchor to' };
  const url = `${META_GRAPH_BASE}/${META_PHONE_NUMBER_ID}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: wamid,
        typing_indicator: { type: 'text' },
      }),
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, reason: err.message };
  } finally {
    clearTimeout(timer);
  }
}

// Agent pings this while composing a reply. Updates internal presence (for
// other agents watching the same contact) and, throttled, nudges Meta so the
// customer sees "typing…" in their own WhatsApp app.
app.post('/api/chat/typing', authMiddleware, async (req, res) => {
  const { phone } = req.body || {};
  if (!phone || !isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone' });
  typingByPhone.set(phone, { username: req.user.username, at: Date.now() });

  const lastSent = lastMetaTypingSentByPhone.get(phone) || 0;
  if (Date.now() - lastSent > META_TYPING_THROTTLE_MS) {
    lastMetaTypingSentByPhone.set(phone, Date.now());
    sendTypingIndicator(phone).catch(() => {});
  }
  res.json({ ok: true });
});

// Which teammates are logged in / recently active — for a simple "online" dot.
app.get('/api/team/presence', authMiddleware, (req, res) => {
  const now = Date.now();
  const byUser = new Map(); // dedupe multiple tabs/tokens per username, keep the freshest
  for (const entry of authTokens.values()) {
    const prev = byUser.get(entry.username);
    if (!prev || (entry.lastSeen || 0) > (prev.lastSeen || 0)) byUser.set(entry.username, entry);
  }
  const agents = [...byUser.values()].map(e => ({
    username: e.username,
    role: e.role,
    online: (now - (e.lastSeen || 0)) <= ONLINE_WINDOW_MS,
    lastSeen: e.lastSeen ? new Date(e.lastSeen).toISOString() : null,
  }));
  res.json({ ok: true, agents });
});

app.get('/api/chat/contacts', authMiddleware, async (req, res) => {
  const contacts = await chatStore.getContacts(req.user.role, req.user.username);
  // Attach live "someone else is typing here" state (ephemeral, not stored).
  const withTyping = contacts.map(c => ({ ...c, typingAgent: whoIsTyping(c.phone, req.user.username) }));
  res.json({ ok: true, success: true, contacts: withTyping });
});

app.get('/api/users', authMiddleware, async (req, res) => {
  const users = await chatStore.getUsers();
  res.json({ ok: true, success: true, users });
});

app.get('/api/analytics', authMiddleware, async (req, res) => {
  const [readStats, today] = await Promise.all([
    chatStore.getBroadcastReadStats(),
    chatStore.getTodayStats(),
  ]);
  // readStats.campaigns includes failed; keep same shape as before but enriched
  res.json({ ok: true, success: true, metrics: readStats.campaigns, today, totals: readStats.totals });
});

// Live approved templates from Meta (Render env) — cached 5 min
let _tmplCache = { at: 0, data: null, err: null };
app.get('/api/templates', authMiddleware, async (req, res) => {
  const now = Date.now();
  if (_tmplCache.data && (now - _tmplCache.at) < 5*60*1000) return res.json({ ok:true, templates: _tmplCache.data, cached:true });
  if (!META_ACCESS_TOKEN || !META_PHONE_NUMBER_ID) return res.json({ ok:true, templates: [], warning:'Meta not configured (MOCK mode)' });
  try {
    let wabaId = process.env.META_WABA_ID || process.env.WABA_ID || '';
    if (!wabaId) {
      const r = await fetch(`${META_GRAPH_BASE}/${META_PHONE_NUMBER_ID}?fields=whatsapp_business_account`, { headers:{ 'Authorization': `Bearer ${META_ACCESS_TOKEN}` }});
      const j = await r.json();
      wabaId = j?.whatsapp_business_account?.id || j?.id || '';
    }
    if (!wabaId) return res.json({ ok:false, error:'WABA_ID not found — set META_WABA_ID in Render env or check phone number ID' });
    const url = `${META_GRAPH_BASE}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=100`;
    const resp = await fetch(url, { headers:{ 'Authorization': `Bearer ${META_ACCESS_TOKEN}` }});
    const j = await resp.json();
    if (j.error) { _tmplCache = { at: now, data: null, err: j.error }; return res.status(500).json({ ok:false, error: j.error }); }
    _tmplCache = { at: now, data: j.data || [], err: null };
    res.json({ ok:true, templates: _tmplCache.data, cached:false });
  } catch(e){ _tmplCache = { at: now, data: null, err: e.message }; res.status(500).json({ ok:false, error:e.message }); }
});

app.get('/api/chat/messages/:phone', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  const messages = await chatStore.getMessages(phone);
  const isBotPaused = await chatStore.isBotPaused(phone);
  res.json({ ok: true, success: true, messages, isBotPaused });
});

// Quick contact summary — shown in the profile panel when a chat is opened.
// Returns the CRM contact row plus recent conversation stats.
app.get('/api/lead-summary/:phone', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  const summary = await chatStore.getLeadSummary(phone);
  res.json({ ok: true, summary });
});

// ─── AI Assistant (per chat) ──────────────────────────────────
// Read-only, cached view — never makes a blocking AI call, so opening a
// chat stays instant. A background analysis is kicked off ONLY if this
// chat actually has a message newer than its last analysis — the open-chat
// poll hits this every ~20s, so without this check a long-idle open chat
// would re-trigger a full AI analysis every ~20s for no new data (this was
// the single biggest source of avoidable AI call volume).
app.get('/api/ai/insights/:phone', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  try {
    const [contact, suggestions] = await Promise.all([
      chatStore.getContactByPhone(phone),
      chatStore.getAiSuggestions(phone),
    ]);
    const hasNewActivity = contact && contact.last_message_at &&
      (!contact.ai_last_analyzed_at || new Date(contact.last_message_at) > new Date(contact.ai_last_analyzed_at));
    if (hasNewActivity) {
      aiAssistant.scheduleAnalysis(phone);
    }
    res.json({
      ok: true,
      extracted: (contact && contact.ai_extracted) || {},
      leadCategory: (contact && contact.lead_category) || null,
      localityVerification: (contact && contact.locality_verification) || null,
      lastAnalyzedAt: (contact && contact.ai_last_analyzed_at) || null,
      suggestions,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// On-demand translation for a single inbound message (🌐 button in the
// chat). Automatic per-message translation was removed to cut AI call
// volume — this now fires only when an agent explicitly asks for it.
app.post('/api/ai/translate/:messageId', authMiddleware, async (req, res) => {
  const { messageId } = req.params;
  if (!messageId) return res.status(400).json({ ok: false, error: 'Missing messageId' });
  try {
    const msg = await chatStore.getMessageById(messageId);
    if (!msg) return res.status(404).json({ ok: false, error: 'Message not found' });
    const translated = await aiAssistant.translateIfNeeded(messageId, msg.content, /* force */ true);
    if (!translated) return res.json({ ok: false, error: 'AI translation is not available right now' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Manual "re-analyze now" — awaits one immediate AI call.
app.post('/api/ai/insights/:phone/refresh', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  try {
    await aiAssistant.analyzeChat(phone);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/ai/suggestions/:id/dismiss', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { phone } = req.body || {};
  if (!phone || !isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone' });
  await chatStore.dismissAiSuggestion(id, phone);
  res.json({ ok: true });
});

app.post('/api/ai/suggestions/:id/apply', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { phone } = req.body || {};
  if (!phone || !isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone' });
  await chatStore.applyAiSuggestion(id, phone);
  res.json({ ok: true });
});

// On-demand "Ask AI" — an agent types a question about this ONE chat and
// gets a direct answer back. Read-only: never sends anything to the
// customer and never writes to the database.
app.post('/api/ai/ask/:phone', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  const { question } = req.body || {};
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  if (!question || !String(question).trim()) return res.status(400).json({ ok: false, error: 'Missing question' });
  try {
    const result = await aiAssistant.askQuestion(phone, question);
    if (result.error && !result.answer) return res.status(200).json({ ok: true, answer: null, error: result.error });
    res.json({ ok: true, answer: result.answer });
  } catch (err) {
    log('error', 'ai', 'ask failed:', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong answering that question' });
  }
});

// Rewrites the agent's in-progress draft (Hindi/Hinglish/broken English)
// into professional English. Stateless (no chat lookup) and never sends
// anything — the agent still reviews and hits Send themselves.
app.post('/api/ai/polish-draft', authMiddleware, async (req, res) => {
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: 'Missing text' });
  try {
    const result = await aiAssistant.polishDraft(text);
    if (result.error && !result.text) return res.status(200).json({ ok: true, text: null, error: result.error });
    res.json({ ok: true, text: result.text });
  } catch (err) {
    log('error', 'ai', 'polish-draft failed:', err.message);
    res.status(500).json({ ok: false, error: 'Something went wrong polishing that message' });
  }
});

// Admin-only connectivity diagnostic: runs one minimal OpenRouter call
// from this server and reports status/timing/error (never the key). Lets
// us see exactly what Render's network + the configured key/model do,
// instead of guessing from timeout logs.
app.get('/api/ai/diag', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
  try {
    const result = await aiAssistant.diagnose();
    res.json({ ok: true, diag: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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
<title>WhatsApp CRM - Admin Portal</title>
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
  const { to, token, text } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) return res.status(401).send('Unauthorized');
  if (!to) return res.status(400).send('Missing ?to=');
  const phone = String(to).replace(/[^0-9]/g, '');
  try {
    const r = await watiSend(phone, String(text || config.welcomeMessage || 'Hello!'));
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

// ─── Public branding (white-label landing + dashboard) ──────
app.get('/api/branding', (_req, res) => {
  const { hasDb } = require('./db');
  res.json({ ok: true, branding: { ...config.getBranding(), demo: DEMO_MODE, db: hasDb } });
});

// ─── Broadcast Admin Dashboard & API ───────────────────────
// Deprecated: old standalone broadcast was at /admin/broadcast (broadcast.html).
// New broadcast lives inside /chat (livechat.html broadcastView). Keep redirect for bookmarks.
app.get('/admin/broadcast', (req, res) => {
  res.redirect(301, '/chat');
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
    activeCampaign.campaignName = templateName;
    
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

      // Stamp the recipient's stored name onto the contact so the chat list
      // shows a real name instead of the WhatsApp profile name when they
      // reply. ensureContact only sets the name if the contact doesn't
      // already have one, so this never clobbers.
      if (displayName && displayName !== 'Customer') {
        try {
          await chatStore.ensureContact(cleanPhone, displayName, null);
        } catch (err) {
          console.error('[broadcast] failed to set contact name for', cleanPhone, err.message);
        }
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

app.get('/api/broadcast/status', authMiddleware, async (req, res) => {
  // Snapshot before any await to avoid torn read while broadcast loop mutates activeCampaign
  const snap = { ...activeCampaign };
  let readStats = null;
  if (snap.campaignName) {
    try {
      const all = await chatStore.getBroadcastMetrics();
      const row = all.find((r) => r.campaign_name === snap.campaignName);
      if (row) readStats = { delivered: row.delivered || 0, read: row.read || 0, replied: row.replied || 0, booked: row.booked || 0 };
    } catch (_) { /* best-effort */ }
  }
  res.json({ ...snap, readStats });
});

// ─── Read-receipt stats (additive — no existing route touched) ──
app.get('/api/broadcast/read-stats', authMiddleware, async (req, res) => {
  try {
    const stats = await chatStore.getBroadcastReadStats();
    res.json({ ok: true, success: true, ...stats });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/messages/stats', authMiddleware, async (req, res) => {
  try {
    const counts = await chatStore.getMessageStatusCounts();
    const readRate = counts.delivered > 0 ? Math.round((counts.read / counts.delivered) * 100) : 0;
    const deliveryRate = counts.total > 0 ? Math.round((counts.delivered / counts.total) * 100) : 0;
    res.json({ ok: true, success: true, counts: { ...counts, readRate, deliveryRate } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/broadcast/campaign/:campaignName/contacts', authMiddleware, async (req, res) => {
  try {
    const { campaignName } = req.params;
    const status = String(req.query.status || 'all').toLowerCase();
    const allowed = new Set(['sent','delivered','read','failed','replied','all']);
    if (!allowed.has(status)) return res.status(400).json({ ok:false, error:'Invalid status. Use sent|delivered|read|failed|replied|all' });
    const contacts = await chatStore.getCampaignContacts(campaignName, status);
    res.json({ ok:true, success:true, campaignName, status, count: contacts.length, contacts });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.post('/api/broadcast/campaign/:campaignName/retry-failed', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ ok:false, error:'Admin only' });
  if (activeCampaign.running) return res.status(400).json({ ok:false, error:'A broadcast is already running' });
  const { campaignName } = req.params;
  const { languageCode = 'en', headerUrl = null } = req.body || {};
  try {
    const failed = await chatStore.getCampaignContacts(campaignName, 'failed');
    if (!failed || failed.length === 0) return res.status(400).json({ ok:false, error:'No failed numbers for this campaign' });
    const recipients = failed.map(r => ({ phone: r.phone, name: r.name || 'Customer' }));
    // Reuse the same broadcast machinery by delegating to the existing /api/broadcast handler logic
    // Build a synthetic request to the broadcast loop (duplicate the async loop here to avoid recursion)
    (async () => {
      activeCampaign.running = true;
      activeCampaign.total = recipients.length;
      activeCampaign.sent = 0;
      activeCampaign.success = 0;
      activeCampaign.failed = 0;
      activeCampaign.campaignName = campaignName;
      const startTime = new Date().toLocaleTimeString();
      activeCampaign.log = [`[${startTime}] Retry started for "${campaignName}" — ${recipients.length} failed numbers.`];
      for (const r of recipients) {
        if (!activeCampaign.running) { activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Retry cancelled.`); break; }
        let cleanPhone = String(r.phone).replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
        else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) cleanPhone = '91' + cleanPhone.slice(1);
        const displayName = String(r.name || 'Customer').trim();
        activeCampaign.sent++;
        try {
          const result = await watiSendTemplate(cleanPhone, campaignName, languageCode, [displayName], headerUrl);
          if (result.ok) {
            activeCampaign.success++;
            activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Resent to ${displayName} (${cleanPhone}) — Success`);
            if (result.body && result.body.messages && result.body.messages[0]) setWamidCampaign(result.body.messages[0].id, campaignName);
            await chatStore.updateBroadcastMetric(campaignName, 'sent').catch(()=>{});
            await chatStore.updateContactCRM(cleanPhone, { attribution_campaign: campaignName, campaign_replied: false, campaign_booked: false }).catch(()=>{});
          } else {
            activeCampaign.failed++;
            let errMsg = result.error?.message || 'Rejected';
            if (result.error?.error_data?.details) errMsg += ` Details: ${result.error.error_data.details}`;
            activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Retry failed for ${displayName} (${cleanPhone}): ${errMsg}`);
          }
        } catch (err) {
          activeCampaign.failed++;
          activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Retry exception for ${displayName} (${cleanPhone}): ${err.message}`);
        }
        if (displayName && displayName !== 'Customer') {
          try { await chatStore.ensureContact(cleanPhone, displayName, null); } catch(_){}
        }
        await new Promise(rr=> setTimeout(rr, 200));
      }
      activeCampaign.running = false;
      activeCampaign.log.push(`[${new Date().toLocaleTimeString()}] Retry completed. Success: ${activeCampaign.success}, Failed: ${activeCampaign.failed}`);
    })();
    res.json({ ok:true, success:true, count: recipients.length, message: `Retry started for ${recipients.length} numbers` });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
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

// ─── Generic helpers ──────────────────────────────────────
// toMetaPhone: normalize a stored number to a full Meta-routable number.
// A bare 10-digit number is assumed to be Indian (91 prefix); a leading 0
// is stripped. Returns null for unusable numbers.
function toMetaPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

// ─── Notifications: due follow-up reminders for the CRM tab ──
// Same data the owner-alert cron uses (contacts with lead_status =
// 'Follow-up Required' and follow_up_time in the past), served to the UI.
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const [scheduled, alerts] = await Promise.all([
      chatStore.getScheduledFollowups(),
      chatStore.getNotifications(40, 'not-message'),
    ]);
    // Employees only see their own / unassigned follow-ups.
    const list = req.user.role === 'admin'
      ? scheduled
      : scheduled.filter(d => !d.assigned_agent || d.assigned_agent === 'Unassigned' || d.assigned_agent === req.user.username);
    const dueCount = list.filter(d => d.is_due).length;
    // Badge = things needing attention right now that haven't been opened yet.
    const unseenTodayCount = list.filter(d => d.unseen && (d.dayBucket === 'today' || d.dayBucket === 'overdue')).length;
    const unreadAlerts = alerts.filter(a => !a.read).length;
    res.json({ ok: true, notifications: list, dueCount, unseenTodayCount, alerts, unreadAlerts });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Mark all stored alerts as read (called when the Notifications tab is opened).
app.post('/api/notifications/read', authMiddleware, async (req, res) => {
  await chatStore.markNotificationsRead();
  res.json({ ok: true });
});

// Marks a single contact's follow-up as seen (called when its "Open Chat" is
// clicked from the Notifications follow-up list).
app.post('/api/notifications/followup-seen', authMiddleware, async (req, res) => {
  const { phone } = req.body || {};
  if (!phone || !isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone' });
  await chatStore.markFollowupSeen(phone);
  res.json({ ok: true });
});

// ─── Insights dashboard: missed opportunities + today's tasks ──
// Generic across businesses. (An older build had a city-specific locality
// heatmap here; the endpoint now returns an empty heatmap shape so older
// dashboard code keeps working.)
// Any follow-up date (single field or array) still in the future?
function hasFutureFollowup(c, now) {
  const times = Array.isArray(c.follow_up_times) ? c.follow_up_times : [];
  const all = [...times, c.follow_up_time].filter(Boolean);
  return all.some(t => new Date(t).getTime() > now);
}
const OPEN_STATUSES = new Set(['New Lead', 'Contacted', 'Interested', 'Follow-up Required', 'Quote Sent', 'Payment Pending', 'Booked', '']);

app.get('/api/insights', authMiddleware, async (req, res) => {
  const now = Date.now();
  const isAdmin = req.user.role === 'admin';
  try {
    // ── Contacts → missed opportunities + today's tasks ──
    const contactsAll = await chatStore.getContacts('admin').catch(() => []);
    const mine = c => isAdmin || !c.assigned_agent || c.assigned_agent === 'Unassigned' || c.assigned_agent === req.user.username;
    const contacts = (contactsAll || []).filter(mine);

    const missed = [];
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const tasks = { waitingReplies: [], callFollowup: [], payments: [], interviews: [] };

    for (const c of contacts) {
      const status = c.lead_status || '';
      const ageMin = c.last_message_at ? (now - new Date(c.last_message_at).getTime()) / 60000 : Infinity;
      const unread = c.label === 'unread';
      const reasons = [];

      if (unread && ageMin > 15) reasons.push({ type: 'waiting', text: `Waiting ${Math.floor(ageMin)} min for a reply` });
      if (isFinite(ageMin) && ageMin > 1440 && OPEN_STATUSES.has(status) && !hasFutureFollowup(c, now))
        reasons.push({ type: 'cold', text: `No contact in ${Math.floor(ageMin / 1440)}d, no follow-up set` });
      if (status === 'Payment Pending') reasons.push({ type: 'payment', text: 'Payment pending' });
      if (status === 'Booked') reasons.push({ type: 'interview', text: 'Booked — follow through' });
      if (reasons.length) missed.push({ phone: c.phone, name: c.name || c.phone, assigned_agent: c.assigned_agent || 'Unassigned', status, reasons });

      // Today's tasks (a contact can land in several buckets)
      if (unread) tasks.waitingReplies.push({ phone: c.phone, name: c.name || c.phone });
      const fu = [...(Array.isArray(c.follow_up_times) ? c.follow_up_times : []), c.follow_up_time].filter(Boolean);
      if (fu.some(t => new Date(t).getTime() <= endOfToday.getTime())) tasks.callFollowup.push({ phone: c.phone, name: c.name || c.phone });
      if (status === 'Payment Pending') tasks.payments.push({ phone: c.phone, name: c.name || c.phone });
      if (status === 'Interested' || status === 'Hot Lead') tasks.interviews.push({ phone: c.phone, name: c.name || c.phone });
    }
    // Most-severe reason first for display
    const sev = { waiting: 4, payment: 3, interview: 2, cold: 1 };
    missed.sort((a, b) => Math.max(...b.reasons.map(r => sev[r.type])) - Math.max(...a.reasons.map(r => sev[r.type])));

    const emptyHeat = { heatmap: [], matched: 0, unmatched: 0, total: 0 };
    res.json({
      ok: true, role: req.user.role,
      missed,
      tasks: {
        waitingReplies: tasks.waitingReplies.length, callFollowup: tasks.callFollowup.length,
        payments: tasks.payments.length, interviews: tasks.interviews.length,
        lists: tasks,
      },
      // Kept for backward compatibility with the dashboard; no geo breakdown.
      heatmaps: { all: emptyHeat },
      heatmap: [], heatmapMatched: 0, heatmapUnmatched: 0,
    });
  } catch (err) {
    log('error', 'insights', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Send one approved template to a single contact.
// bodyParams maps to the template's {{1}}, {{2}}… body variables; headerUrl is
// the media header. Both must match the approved template exactly (Meta #132000).
app.post('/api/contacts/message', authMiddleware, async (req, res) => {
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

// ═════════════════════════════════════════════════════════════
// AUTOMATION — no-code workflow builder (schedule/follow-up messaging)
// ═════════════════════════════════════════════════════════════
// Admin-only mutations; employees get read-only access. Every edit and
// execution is logged to workflow_logs. Engine lives in workflow-engine.js.

app.get('/automation', (req, res) => {
  res.sendFile(__dirname + '/automation.html');
});

function requireAdmin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'Admin only' });
    return false;
  }
  return true;
}

const audit = (wfId, user, action, msg = '') =>
  wfStore.addLog(wfId, null, null, 'audit', user, action, msg).catch(() => {});

// Curated filterable fields per audience source (real columns only).
// Single generic audience: WhatsApp contacts. Businesses segment by the
// CRM fields agents set in the inbox (status, agent, labels, campaigns).
const WORKFLOW_META = {
  sources: {
    contacts: {
      label: 'WhatsApp Contacts',
      fields: ['lead_status', 'assigned_agent', 'lead_temperature', 'lead_category', 'label', 'attribution_campaign', 'campaign_replied', 'service_category', 'last_message_at', 'follow_up_time', 'created_at'],
    },
  },
  operators: [
    { id: 'in', label: 'is any of ☑', multi: true }, { id: 'not_in', label: 'is none of ☑', multi: true },
    { id: 'contains_any', label: 'contains any of ☑', multi: true },
    { id: 'eq', label: 'equals' }, { id: 'neq', label: 'not equals' },
    { id: 'contains', label: 'contains' }, { id: 'not_contains', label: 'does not contain' },
    { id: 'empty', label: 'is empty' }, { id: 'not_empty', label: 'is not empty' },
    { id: 'in_last_days', label: 'within last N days' }, { id: 'older_than_days', label: 'older than N days' },
    { id: 'before', label: 'date before' }, { id: 'after', label: 'date after' },
    { id: 'gt', label: 'greater than' }, { id: 'lt', label: 'less than' },
  ],
  // Live template names come from GET /api/templates (Meta). This is only
  // a seed list shown in the builder dropdown before the first fetch.
  knownTemplates: [],
};

// Ready-to-use workflow templates (loadable into the editor, then customized).
// Sales follow-up pack — implements the lead rules:
//   new lead → New Lead Sequence · reply → auto-stops (stopOnReply)
//   Connected → stops New Lead · Proposal Sent → Proposal Follow-up
//   "I'll think" → Thinking · "price high" → Price Objection
//   Payment Received → stops ALL sales → Website Onboarding
//   manual pause (inbox ⚡ Auto button) → stops everything for the contact
//
// NOTE: the templateName values below are placeholders — create matching
// Meta-approved templates (or edit the nodes to use yours) before publishing.
const WORKFLOW_TEMPLATES = [
  {
    key: 'new_lead_sequence', name: 'New Lead Sequence',
    description: 'IF new lead → start. 3 touches over ~3 days. STOPS automatically when the customer replies, is marked Connected, or automation is paused.',
    definition: { settings: { preventDuplicates: true, timezone: 'Asia/Kolkata', group: 'new-lead', stopOnReply: true }, nodes: [
      { id: 't', type: 'trigger_customer_created', x: 60, y: 160, config: { source: 'contacts' } },
      { id: 'd1', type: 'logic_delay', x: 330, y: 160, config: { n: 2, unit: 'hours' } },
      { id: 's1', type: 'action_send_template', x: 600, y: 160, config: { templateName: 'new_lead_touch_1', lang: 'en', personalizeName: true } },
      { id: 'd2', type: 'logic_delay', x: 870, y: 160, config: { n: 1, unit: 'days' } },
      { id: 's2', type: 'action_send_template', x: 1140, y: 160, config: { templateName: 'new_lead_touch_2', lang: 'en', personalizeName: true } },
      { id: 'd3', type: 'logic_delay', x: 1410, y: 160, config: { n: 2, unit: 'days' } },
      { id: 's3', type: 'action_send_template', x: 1680, y: 160, config: { templateName: 'new_lead_touch_3', lang: 'en', personalizeName: true } },
      { id: 'e', type: 'end', x: 1950, y: 160, config: {} },
    ], connections: [ { from: 't', port: 'out', to: 'd1' }, { from: 'd1', port: 'out', to: 's1' }, { from: 's1', port: 'out', to: 'd2' }, { from: 'd2', port: 'out', to: 's2' }, { from: 's2', port: 'out', to: 'd3' }, { from: 'd3', port: 'out', to: 's3' }, { from: 's3', port: 'out', to: 'e' } ] },
  },
  {
    key: 'stop_on_connected', name: 'Stop on Connected',
    description: 'IF salesperson marks Connected → STOP the New Lead Sequence for that contact. No messages sent.',
    definition: { settings: { preventDuplicates: false, timezone: 'Asia/Kolkata', group: 'utility', stopOnReply: false }, nodes: [
      { id: 't', type: 'trigger_status_changed', x: 60, y: 160, config: { value: 'Connected', cancelGroups: ['new-lead'] } },
      { id: 'e', type: 'end', x: 330, y: 160, config: {} },
    ], connections: [ { from: 't', port: 'out', to: 'e' } ] },
  },
  {
    key: 'proposal_followup', name: 'Proposal Follow-up Sequence',
    description: 'IF salesperson marks Proposal Sent → START. Also stops any running New Lead Sequence. 2 touches over 4 days; replies stop it.',
    definition: { settings: { preventDuplicates: true, timezone: 'Asia/Kolkata', group: 'proposal', stopOnReply: true }, nodes: [
      { id: 't', type: 'trigger_status_changed', x: 60, y: 160, config: { value: 'Proposal Sent', cancelGroups: ['new-lead'] } },
      { id: 'd1', type: 'logic_delay', x: 330, y: 160, config: { n: 1, unit: 'days' } },
      { id: 's1', type: 'action_send_template', x: 600, y: 160, config: { templateName: 'proposal_touch_1', lang: 'en', personalizeName: true } },
      { id: 'd2', type: 'logic_delay', x: 870, y: 160, config: { n: 3, unit: 'days' } },
      { id: 's2', type: 'action_send_template', x: 1140, y: 160, config: { templateName: 'proposal_touch_2', lang: 'en', personalizeName: true } },
      { id: 'e', type: 'end', x: 1410, y: 160, config: {} },
    ], connections: [ { from: 't', port: 'out', to: 'd1' }, { from: 'd1', port: 'out', to: 's1' }, { from: 's1', port: 'out', to: 'd2' }, { from: 'd2', port: 'out', to: 's2' }, { from: 's2', port: 'out', to: 'e' } ] },
  },
  {
    key: 'thinking_sequence', name: 'Interested / Thinking Sequence',
    description: 'IF customer says they will think (or similar) → START. 2 touches over 2 days; replies stop it.',
    definition: { settings: { preventDuplicates: false, timezone: 'Asia/Kolkata', group: 'thinking', stopOnReply: true }, nodes: [
      { id: 't', type: 'trigger_keyword', x: 60, y: 160, config: { keywords: ["i'll think", 'i will think', 'let me think', 'thinking about', 'need some time', 'will decide', 'will let you know'], matchMode: 'contains' } },
      { id: 'd1', type: 'logic_delay', x: 330, y: 160, config: { n: 2, unit: 'hours' } },
      { id: 's1', type: 'action_send_template', x: 600, y: 160, config: { templateName: 'thinking_touch_1', lang: 'en', personalizeName: true } },
      { id: 'd2', type: 'logic_delay', x: 870, y: 160, config: { n: 2, unit: 'days' } },
      { id: 's2', type: 'action_send_template', x: 1140, y: 160, config: { templateName: 'thinking_touch_2', lang: 'en', personalizeName: true } },
      { id: 'e', type: 'end', x: 1410, y: 160, config: {} },
    ], connections: [ { from: 't', port: 'out', to: 'd1' }, { from: 'd1', port: 'out', to: 's1' }, { from: 's1', port: 'out', to: 'd2' }, { from: 'd2', port: 'out', to: 's2' }, { from: 's2', port: 'out', to: 'e' } ] },
  },
  {
    key: 'price_objection', name: 'Price Objection Sequence',
    description: 'IF customer says price is high (or similar) → START. 2 touches over 2 days; replies stop it.',
    definition: { settings: { preventDuplicates: false, timezone: 'Asia/Kolkata', group: 'objection', stopOnReply: true }, nodes: [
      { id: 't', type: 'trigger_keyword', x: 60, y: 160, config: { keywords: ['price is high', 'too expensive', 'costly', 'cost is high', 'discount', 'price kam', 'rate jyada', 'mehnga', 'mehenga', 'budget issue'], matchMode: 'contains' } },
      { id: 'd1', type: 'logic_delay', x: 330, y: 160, config: { n: 1, unit: 'hours' } },
      { id: 's1', type: 'action_send_template', x: 600, y: 160, config: { templateName: 'price_touch_1', lang: 'en', personalizeName: true } },
      { id: 'd2', type: 'logic_delay', x: 870, y: 160, config: { n: 2, unit: 'days' } },
      { id: 's2', type: 'action_send_template', x: 1140, y: 160, config: { templateName: 'price_touch_2', lang: 'en', personalizeName: true } },
      { id: 'e', type: 'end', x: 1410, y: 160, config: {} },
    ], connections: [ { from: 't', port: 'out', to: 'd1' }, { from: 'd1', port: 'out', to: 's1' }, { from: 's1', port: 'out', to: 'd2' }, { from: 'd2', port: 'out', to: 's2' }, { from: 's2', port: 'out', to: 'e' } ] },
  },
  {
    key: 'website_onboarding', name: 'Website Onboarding Sequence',
    description: 'IF payment received → STOP ALL sales follow-ups, then START onboarding. Welcome + day-1 step.',
    definition: { settings: { preventDuplicates: true, timezone: 'Asia/Kolkata', group: 'onboarding', stopOnReply: true }, nodes: [
      { id: 't', type: 'trigger_status_changed', x: 60, y: 160, config: { value: 'Payment Received', cancelGroups: ['*'] } },
      { id: 's1', type: 'action_send_template', x: 330, y: 160, config: { templateName: 'onboarding_welcome', lang: 'en', personalizeName: true } },
      { id: 'd1', type: 'logic_delay', x: 600, y: 160, config: { n: 1, unit: 'days' } },
      { id: 's2', type: 'action_send_template', x: 870, y: 160, config: { templateName: 'onboarding_step_2', lang: 'en', personalizeName: true } },
      { id: 'e', type: 'end', x: 1140, y: 160, config: {} },
    ], connections: [ { from: 't', port: 'out', to: 's1' }, { from: 's1', port: 'out', to: 'd1' }, { from: 'd1', port: 'out', to: 's2' }, { from: 's2', port: 'out', to: 'e' } ] },
  },
  {
    key: 'monthly_checkin', name: 'Monthly Customer Check-in',
    description: 'On the 1st of every month, check in with Booked customers and set a CRM follow-up reminder.',
    definition: { settings: { preventDuplicates: false, timezone: 'Asia/Kolkata' }, nodes: [
      { id: 't', type: 'trigger_schedule', x: 60, y: 160, config: { mode: 'monthly', monthDay: 1, time: '11:00', timezone: 'Asia/Kolkata', neverExpire: true } },
      { id: 'a', type: 'audience', x: 320, y: 160, config: { source: 'contacts', groups: [ { conditions: [ { field: 'lead_status', op: 'eq', value: 'Booked' } ] } ] } },
      { id: 's', type: 'action_send_template', x: 580, y: 160, config: { templateName: 'check_in_1', lang: 'en' } },
      { id: 'r', type: 'action_create_reminder', x: 840, y: 160, config: { daysFromNow: 2, time: '10:00' } },
      { id: 'e', type: 'end', x: 1080, y: 160, config: {} },
    ], connections: [ { from: 't', port: 'out', to: 'a' }, { from: 'a', port: 'out', to: 's' }, { from: 's', port: 'out', to: 'r' }, { from: 'r', port: 'out', to: 'e' } ] },
  },
];

// ─── Meta / templates (must precede /:id routes) ─────────────
app.get('/api/workflows/meta', authMiddleware, async (req, res) => {
  const users = await chatStore.getUsers().catch(() => []);
  res.json({ ok: true, meta: WORKFLOW_META, agents: users.map(u => u.username), role: req.user.role });
});

app.get('/api/workflows/templates', authMiddleware, (req, res) => {
  res.json({ ok: true, templates: WORKFLOW_TEMPLATES });
});

// Distinct values for a field, so the builder can offer real checkboxes
// instead of free-typed text (a typo like "Intrested" matches nobody).
app.get('/api/workflows/field-values', authMiddleware, async (req, res) => {
  const { source, field } = req.query;
  const meta = WORKFLOW_META.sources[source];
  if (!meta) return res.status(400).json({ ok: false, error: 'Unknown source' });
  if (!meta.fields.includes(field)) return res.status(400).json({ ok: false, error: 'Unknown field' });
  try {
    const vals = await wfStore.columnValues(source, field, 5000);
    const counts = new Map();
    let blank = 0;
    for (const v of (vals || [])) {
      if (v === null || v === undefined || String(v).trim() === '') { blank++; continue; }
      const key = String(v).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const values = [...counts.entries()].map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
    // Dates/free text explode into thousands of uniques — tell the UI to use text input.
    res.json({ ok: true, values: values.slice(0, 300), blank, total: (vals || []).length, tooMany: values.length > 300 });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Live preview: how many people does this audience node actually match?
app.post('/api/workflows/preview-audience', authMiddleware, async (req, res) => {
  const node = (req.body && req.body.node) || {};
  if (!node.config || !node.config.source) return res.status(400).json({ ok: false, error: 'Choose a data source first' });
  try {
    const people = await wfEngine.resolveAudience(node);
    const totalRows = await wfStore.countRows(node.config.source);
    res.json({ ok: true, count: people.length, totalRows: totalRows || 0, sample: people.slice(0, 25) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/automation/stats', authMiddleware, async (req, res) => {
  res.json({ ok: true, stats: await wfStore.dashboardStats() });
});

// ─── Per-contact automation state (sales-flow manual pause) ─
// "Salesperson manually pauses automation → STOP ALL AUTOMATIC MESSAGES."
// Pausing cancels the contact's in-flight tasks and blocks future triggers
// until resumed. (Manual Run Now still works — it's a human action.)
app.get('/api/automation/contact/:phone', authMiddleware, async (req, res) => {
  const { phone } = req.params;
  if (!isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number format' });
  try {
    const [paused, tasks] = await Promise.all([
      wfStore.isAutomationPaused(phone),
      wfStore.activeTasksForPhone(phone),
    ]);
    const names = {};
    for (const t of tasks) {
      if (!(t.workflow_id in names)) {
        const wf = await wfStore.getWorkflow(t.workflow_id).catch(() => null);
        names[t.workflow_id] = (wf && wf.name) || `#${t.workflow_id}`;
      }
    }
    res.json({
      ok: true, phone, paused,
      activeTasks: tasks.map(t => ({
        workflow_id: t.workflow_id, workflow: names[t.workflow_id],
        node_id: t.node_id, wake_at: t.wake_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/automation/pause-contact', authMiddleware, async (req, res) => {
  const { phone, paused } = req.body || {};
  if (!phone || !isValidPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone' });
  try {
    const wantPaused = paused !== false;
    let cancelled = 0;
    if (wantPaused) {
      cancelled = await wfStore.cancelTasksForPhone(phone, { reason: 'manually paused by ' + req.user.username });
    }
    await wfStore.setAutomationPaused(phone, wantPaused);
    await wfStore.addLog(null, null, null, 'audit', req.user.username,
      wantPaused ? 'automation-paused' : 'automation-resumed',
      `${phone}${wantPaused ? ` — ${cancelled} task(s) cancelled` : ''}`).catch(() => {});
    res.json({ ok: true, phone, paused: wantPaused, cancelled });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/automation/executions', authMiddleware, async (req, res) => {
  const logs = await wfStore.listLogs({ workflowId: req.query.workflow_id || undefined, type: req.query.type || undefined, limit: 200 });
  const runs = await wfStore.listRuns(req.query.workflow_id || undefined, 25);
  res.json({ ok: true, logs, runs });
});

// ─── Workflow CRUD ───────────────────────────────────────────
app.get('/api/workflows', authMiddleware, async (req, res) => {
  res.json({ ok: true, workflows: await wfStore.listWorkflows(), role: req.user.role });
});

app.post('/api/workflows', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { name, definition } = req.body || {};
    if (!name) return res.status(400).json({ ok: false, error: 'Name required' });
    const wf = await wfStore.createWorkflow(name.trim(), definition || { nodes: [], connections: [], settings: { timezone: 'Asia/Kolkata' } }, req.user.username);
    audit(wf.id, req.user.username, 'created', name);
    res.json({ ok: true, workflow: wf });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.get('/api/workflows/:id', authMiddleware, async (req, res) => {
  const wf = await wfStore.getWorkflow(req.params.id);
  if (!wf) return res.status(404).json({ ok: false, error: 'Workflow not found' });
  res.json({ ok: true, workflow: wf, role: req.user.role });
});

app.put('/api/workflows/:id', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { name, definition } = req.body || {};
    let wf = await wfStore.getWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ ok: false, error: 'Workflow not found' });
    if (definition) wf = await wfStore.saveDefinition(wf.id, definition, req.user.username);
    if (name && name !== wf.name) wf = await wfStore.updateWorkflow(wf.id, { name: name.trim() }, req.user.username);
    audit(wf.id, req.user.username, 'saved', `v${wf.version}`);
    res.json({ ok: true, workflow: wf });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.delete('/api/workflows/:id', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    audit(Number(req.params.id), req.user.username, 'deleted');
    await wfStore.deleteWorkflow(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─── Lifecycle: validate / publish / pause / resume / duplicate ──
app.post('/api/workflows/:id/validate', authMiddleware, async (req, res) => {
  const def = (req.body && req.body.definition) || (await wfStore.getWorkflow(req.params.id) || {}).definition || {};
  res.json({ ok: true, errors: wfEngine.validate(def) });
});

app.post('/api/workflows/:id/publish', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    let wf = await wfStore.getWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ ok: false, error: 'Workflow not found' });
    if (req.body && req.body.definition) wf = await wfStore.saveDefinition(wf.id, req.body.definition, req.user.username);
    const errors = wfEngine.validate(wf.definition || {});
    if (errors.length) return res.status(400).json({ ok: false, errors });
    const trig = (wf.definition.nodes || []).find(n => n.type.startsWith('trigger_'));
    const patch = { status: 'active', engine_state: {} };
    if (trig.type === 'trigger_schedule') {
      const next = wfEngine.computeNextRun(trig.config || {}, new Date());
      if (!next) return res.status(400).json({ ok: false, errors: ['Schedule never fires (already expired?) — check dates.'] });
      patch.next_run_at = next.toISOString();
    }
    // Clear recipients still in flight from an earlier run. Without this they
    // resume against the NEW definition and fire unexpected messages at the
    // moment of publishing (rather than at the scheduled time).
    const cleared = await wfStore.cancelTasks(wf.id);
    if (cleared) {
      await wfStore.addLog(wf.id, null, null, 'audit', req.user.username, 'cleared-queue',
        `${cleared} in-flight recipient(s) from a previous run cancelled on publish`).catch(() => {});
    }
    wf = await wfStore.updateWorkflow(wf.id, patch, req.user.username);
    audit(wf.id, req.user.username, 'published', `v${wf.version}`);
    res.json({ ok: true, workflow: wf, clearedTasks: cleared });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/workflows/:id/pause', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const wf = await wfStore.updateWorkflow(req.params.id, { status: 'paused' }, req.user.username);
  audit(wf.id, req.user.username, 'paused');
  res.json({ ok: true, workflow: wf });
});

app.post('/api/workflows/:id/resume', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  let wf = await wfStore.getWorkflow(req.params.id);
  if (!wf) return res.status(404).json({ ok: false, error: 'Workflow not found' });
  const trig = ((wf.definition || {}).nodes || []).find(n => n.type.startsWith('trigger_'));
  const patch = { status: 'active' };
  if (trig && trig.type === 'trigger_schedule') {
    const next = wfEngine.computeNextRun(trig.config || {}, new Date());
    if (!next) {
      // Don't silently flip back to paused — tell the admin what to change.
      const c = trig.config || {};
      return res.status(400).json({ ok: false, error:
        `This schedule has no future run${c.mode === 'once' && c.startDate ? ` (one-time, set for ${c.startDate} ${c.time || ''}, already passed)` : ''}. ` +
        `Edit the trigger — pick a future date/time or switch to a recurring mode — then Publish again.` });
    }
    patch.next_run_at = next.toISOString();
  }
  wf = await wfStore.updateWorkflow(wf.id, patch, req.user.username);
  audit(wf.id, req.user.username, 'resumed');
  res.json({ ok: true, workflow: wf });
});

app.post('/api/workflows/:id/duplicate', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const wf = await wfStore.getWorkflow(req.params.id);
  if (!wf) return res.status(404).json({ ok: false, error: 'Workflow not found' });
  const copy = await wfStore.createWorkflow(wf.name + ' (copy)', wf.definition, req.user.username);
  audit(copy.id, req.user.username, 'duplicated', `from #${wf.id}`);
  res.json({ ok: true, workflow: copy });
});

// ─── Versions ───────────────────────────────────────────────
app.get('/api/workflows/:id/versions', authMiddleware, async (req, res) => {
  res.json({ ok: true, versions: await wfStore.listVersions(req.params.id) });
});

app.post('/api/workflows/:id/restore', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const v = await wfStore.getVersion(req.params.id, req.body.version);
  if (!v) return res.status(404).json({ ok: false, error: 'Version not found' });
  const wf = await wfStore.saveDefinition(req.params.id, v.definition, req.user.username);
  audit(wf.id, req.user.username, 'restored', `v${req.body.version} → v${wf.version}`);
  res.json({ ok: true, workflow: wf });
});

// ─── Manual trigger / run-now ───────────────────────────────
app.post('/api/workflows/:id/run-now', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const wf = await wfStore.getWorkflow(req.params.id);
  if (!wf) return res.status(404).json({ ok: false, error: 'Workflow not found' });
  const errors = wfEngine.validate(wf.definition || {});
  if (errors.length) return res.status(400).json({ ok: false, errors });
  if (wf.status !== 'active') return res.status(400).json({ ok: false, error: 'Publish the workflow first (Run Now only executes active workflows).' });
  const run = await wfEngine.startRun(wf, `manual by ${req.user.username}`, null, { skipPaused: false });
  audit(wf.id, req.user.username, 'run-now', run ? `run #${run.id} (${run.total} recipients)` : 'failed');
  await wfEngine.tick(); // process immediately instead of waiting for the next tick
  res.json({ ok: true, run });
});

// Custom trigger — external systems can fire a workflow via URL.
app.post('/api/workflows/hook/:id', async (req, res) => {
  if (!req.query.token || req.query.token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const wf = await wfStore.getWorkflow(req.params.id);
  if (!wf || wf.status !== 'active') return res.status(404).json({ ok: false, error: 'Active workflow not found' });
  const run = await wfEngine.startRun(wf, 'webhook', null, { skipPaused: false });
  res.json({ ok: true, run });
});

// ─── Sheet Automations ──────────────────────────────────────
app.get('/api/sheet-automations/config', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const cfg = await sheetAutomations.getConfig() || {};
  const envOverride = !!process.env.SPREADSHEET_ID;
  if (envOverride) {
    cfg.spreadsheet_id = process.env.SPREADSHEET_ID;
  }
  res.json({ ok: true, config: cfg, envOverride });
});

app.post('/api/sheet-automations/config', authMiddleware, async (req, res) => {
  if (!requireAdmin(req, res)) return;
  await sheetAutomations.saveConfig(req.body);
  res.json({ ok: true });
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
  // Automation engine — persisted in Neon Postgres, safe across restarts.
  wfEngine.init({ sendTemplate: watiSendTemplate, toMetaPhone, log, chatStore });
  // Sales-flow rule: a salesperson changing a contact's status fires
  // status workflows (stop groups + start sequences).
  chatStore.setStatusChangeHook((p, oldS, newS) => wfEngine.handleStatusChange(p, oldS, newS));
  // Start Sheet Automations polling
  sheetAutomations.startPolling();
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
