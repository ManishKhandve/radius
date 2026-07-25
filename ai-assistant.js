// ============================================================
// ai-assistant.js — per-chat AI layer (OpenRouter)
// ============================================================
// Every function here is scoped to a single `phone` (one WhatsApp chat).
// No function in this file ever reads or writes another chat's data —
// analyzeChat() only pulls what chat-store.getAiContext(phone) returns,
// which is filtered to that phone at the database layer.
//
// This module never talks to Supabase directly; all reads/writes go
// through chat-store.js so DB access stays centralized like the rest of
// the codebase. Adding a new extraction field or suggestion type later
// only means touching FIELD_LIST / the prompt / applyAnalysisResult here.
// ============================================================

const chatStore = require('./chat-store');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// openai/gpt-oss-120b:free returns a live 404 from OpenRouter (confirmed
// against a real account) despite its info page claiming a free tier —
// gpt-oss-20b:free is the model that's actually callable for free.
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';

// ─── Low-level OpenRouter call ───────────────────────────────
// Never throws — callers get null on any failure and degrade gracefully
// (no reply, no popup, just "nothing to show yet"). Errors are logged as
// status codes / short messages only, never the request body (which can
// contain customer message content).
// A hung request would otherwise sit past Render's own proxy timeout, which
// returns a raw (non-JSON) gateway-timeout page to the browser before this
// function ever gets a chance to log or respond — a 25s local abort ensures
// we always return a clean, logged result well before that happens.
const REQUEST_TIMEOUT_MS = 25000;

async function callOpenRouter(messages, { temperature = 0.2 } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null; // not configured — silently skip (e.g. local dev)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://cleanly-whatsapp.local',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'Cleanly WhatsApp CRM',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
        messages,
        temperature,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      let bodySnippet = '';
      try { bodySnippet = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
      console.error('[ai-assistant] OpenRouter HTTP error:', res.status, bodySnippet);
      return null;
    }
    const data = await res.json();
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
  } catch (err) {
    console.error('[ai-assistant] OpenRouter request failed:', err.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeParseJson(text) {
  try { return JSON.parse(text); } catch (e) { /* fall through */ }
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* give up */ } }
  return null;
}

// ─── Hindi / Hinglish detection + transcription ──────────────
// A cheap local gate runs first so most (already-English) messages never
// trigger an API call at all — this is the main lever for staying inside
// the free-tier rate limit.
const DEVANAGARI_RE = /[ऀ-ॿ]/;
const HINGLISH_WORDS = [
  'hai', 'hain', 'nahi', 'nahin', 'kya', 'kaise', 'chahiye', 'kitna', 'kitne',
  'paisa', 'paise', 'rupee', 'rupaye', 'ghar', 'kaam', 'bhai', 'didi', 'theek',
  'thik', 'accha', 'achha', 'kal', 'abhi', 'matlab', 'samajh', 'bata', 'karo',
  'karna', 'hoga', 'milega', 'mujhe', 'aapka', 'kripya', 'dhanyavad', 'shukriya',
  'haan', 'nahi', 'bolo', 'batao', 'kaam wali', 'maidam',
];

function looksHindiOrHinglish(text) {
  if (!text) return false;
  if (DEVANAGARI_RE.test(text)) return true;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const w of HINGLISH_WORDS) {
    if (new RegExp(`\\b${w.replace(/\s+/g, '\\s+')}\\b`).test(lower)) {
      hits++;
      if (hits >= 2) return true;
    }
  }
  return false;
}

/**
 * Detects Hindi/Hinglish in a single inbound message and, if found, stores
 * an English transcription alongside the original (never replacing it).
 * Fire-and-forget from the webhook handler — never blocks message delivery.
 */
async function translateIfNeeded(messageId, text) {
  try {
    if (!messageId || !looksHindiOrHinglish(text)) return;
    const raw = await callOpenRouter([
      {
        role: 'system',
        content: 'Translate a single WhatsApp message (Hindi in Devanagari script, or Hinglish/Romanized Hindi, possibly mixed with English) into natural English. Preserve the meaning exactly; do not add commentary or explanation. Respond ONLY with JSON: {"language":"hi|hinglish|mixed","english":"..."}',
      },
      { role: 'user', content: String(text).slice(0, 2000) },
    ]);
    if (!raw) return;
    const parsed = safeParseJson(raw);
    if (!parsed || !parsed.english) return;
    await chatStore.saveMessageTranslation(messageId, String(parsed.english).slice(0, 4000), String(parsed.language || 'hi').slice(0, 20));
  } catch (err) {
    console.error('[ai-assistant] translateIfNeeded error:', err.message);
  }
}

// ─── Full chat analysis (extraction, suggestions, category, etc.) ────
const FIELD_LIST = [
  'customer_name', 'phone_number', 'locality', 'society', 'building',
  'flat_number', 'requirement', 'maid_type', 'budget', 'preferred_timing',
  'move_in_date', 'lead_status', 'notes',
];

const SUGGESTION_TYPES = new Set([
  'follow_up_reminder', 'lead_status_update', 'missing_info', 'important_action', 'suggested_reply',
]);

function istNowString() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function summarizeLeadMatch(leadMatch) {
  if (!leadMatch) return '';
  const parts = [];
  if (leadMatch.flat) parts.push(`Matched Flat Customer record: ${JSON.stringify(leadMatch.flat)}`);
  if (leadMatch.customer) parts.push(`Matched Maid-seeking Customer record: ${JSON.stringify(leadMatch.customer)}`);
  if (leadMatch.maid) parts.push(`Matched Maid record: ${JSON.stringify(leadMatch.maid)}`);
  return parts.join('\n');
}

// Per-phone debounce so a burst of messages triggers one analysis call,
// not one per message. Mirrors the shape of index.js's runQueued map.
const analysisTimers = new Map();
const ANALYSIS_DEBOUNCE_MS = 8000;

function scheduleAnalysis(phone, opts = {}) {
  if (!phone) return;
  const existing = analysisTimers.get(phone);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    analysisTimers.delete(phone);
    analyzeChat(phone, opts).catch(err => console.error('[ai-assistant] scheduled analysis failed:', err.message));
  }, ANALYSIS_DEBOUNCE_MS);
  analysisTimers.set(phone, timer);
}

/**
 * The core per-chat analysis call. Pulls ONLY this phone's data, asks for
 * one structured JSON object, validates every field before it's allowed to
 * touch the database, and writes the results.
 */
async function analyzeChat(phone, { localityNames = [] } = {}) {
  if (!phone) return null;
  const ctx = await chatStore.getAiContext(phone);
  if (!ctx.messages || !ctx.messages.length) return null;

  const transcript = ctx.messages.slice(-60).map(m =>
    `[${m.direction === 'inbound' ? 'Customer' : 'Agent'}] ${m.content_en || m.content}`
  ).join('\n');

  const priorExtracted = (ctx.contact && ctx.contact.ai_extracted) || {};
  const leadMatchNote = summarizeLeadMatch(ctx.leadMatch);
  const pendingNotifText = (ctx.pendingNotifications || [])
    .map(n => `id=${n.id}: [${n.type}] ${n.title} — ${n.body || ''}`).join('\n') || '(none)';

  const responseShape = {
    extracted_fields: Object.fromEntries(FIELD_LIST.map(f => [f, 'string or null'])),
    lead_category: 'Maid | Flat | Maid Customer | null',
    locality_verification: {
      input: 'string or null', city: 'string or null', locality: 'string or null',
      state: 'string or null', confidence: '0.0-1.0 number', flagged: 'boolean', suggestion: 'string or null',
    },
    suggestions: [{ type: 'follow_up_reminder|lead_status_update|missing_info|important_action|suggested_reply', title: 'string', body: 'string' }],
    scheduled_followups: [{ reminder_type: 'string', reminder_time_iso: 'ISO 8601 datetime, IST' }],
    notification_ids_to_dismiss: ['id of a pending notification listed below, only if it is clearly no longer relevant'],
  };

  const systemPrompt = [
    'You are a CRM assistant analyzing ONE isolated WhatsApp conversation for a maid-placement and home-cleaning business in Pune, India.',
    'Use ONLY the conversation and data given in this message. Never reference or assume anything about any other customer or conversation — you have no memory beyond what is provided here.',
    'Respond ONLY with a single JSON object matching exactly this shape (no prose, no markdown fences):',
    JSON.stringify(responseShape),
    localityNames.length ? `Known valid localities near Pune, for verifying/correcting the customer's stated locality: ${localityNames.join(', ')}.` : '',
    'Only include a scheduled_followups entry when the chat explicitly asked for a delayed follow-up (e.g. "call tomorrow", "follow up after 2 days", "ping next week"); compute reminder_time_iso relative to the current time below, in IST.',
    `Current time (IST): ${istNowString()}`,
  ].filter(Boolean).join('\n');

  const userPrompt = [
    `Previously extracted fields for this chat (fill gaps, do not discard known values): ${JSON.stringify(priorExtracted)}`,
    leadMatchNote,
    `This chat's pending notifications:\n${pendingNotifText}`,
    `Conversation transcript, oldest to newest:\n${transcript}`,
  ].join('\n\n');

  const raw = await callOpenRouter([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  if (!raw) return null;

  const parsed = safeParseJson(raw);
  if (!parsed) {
    console.error('[ai-assistant] unparsable AI response for phone ending', String(phone).slice(-4));
    return null;
  }

  await applyAnalysisResult(phone, parsed, ctx);
  return parsed;
}

// Validates and sanitizes every piece of the AI's response before it is
// allowed to reach the database — the model's output is never trusted
// blindly, especially for anything that could touch another record.
async function applyAnalysisResult(phone, parsed, ctx) {
  const extracted = {};
  if (parsed.extracted_fields && typeof parsed.extracted_fields === 'object') {
    for (const f of FIELD_LIST) {
      const v = parsed.extracted_fields[f];
      if (typeof v === 'string' && v.trim()) extracted[f] = v.trim().slice(0, 300);
    }
  }

  // A real match in the lead tables is a stronger signal than the model's
  // guess, and it's free (no extra AI call) — prefer it when available.
  let leadCategory = null;
  if (ctx.leadMatch) {
    if (ctx.leadMatch.maid) leadCategory = 'Maid';
    else if (ctx.leadMatch.flat) leadCategory = 'Flat';
    else if (ctx.leadMatch.customer) leadCategory = 'Maid Customer';
  }
  if (!leadCategory && ['Maid', 'Flat', 'Maid Customer'].includes(parsed.lead_category)) {
    leadCategory = parsed.lead_category;
  }

  let localityVerification = null;
  if (parsed.locality_verification && typeof parsed.locality_verification === 'object') {
    const lv = parsed.locality_verification;
    if (lv.input || lv.locality) {
      localityVerification = {
        input: lv.input || null,
        city: lv.city || null,
        locality: lv.locality || null,
        state: lv.state || null,
        confidence: typeof lv.confidence === 'number' ? Math.max(0, Math.min(1, lv.confidence)) : null,
        flagged: !!lv.flagged,
        suggestion: lv.suggestion || null,
      };
    }
  }

  await chatStore.saveAiAnalysis(phone, { extracted, leadCategory, localityVerification });

  if (Array.isArray(parsed.suggestions) && parsed.suggestions.length) {
    const suggestions = parsed.suggestions
      .filter(s => s && typeof s.title === 'string' && s.title.trim())
      .map(s => ({
        type: SUGGESTION_TYPES.has(s.type) ? s.type : 'important_action',
        title: s.title.trim(),
        body: typeof s.body === 'string' ? s.body.trim() : null,
      }));
    await chatStore.createAiSuggestions(phone, suggestions);
  }

  if (Array.isArray(parsed.scheduled_followups)) {
    for (const f of parsed.scheduled_followups) {
      if (!f || !f.reminder_time_iso) continue;
      const t = new Date(f.reminder_time_iso);
      // Ignore unparsable dates and anything more than 5 minutes in the past
      // (a "reminder" that already elapsed isn't useful to schedule).
      if (isNaN(t.getTime()) || t.getTime() < Date.now() - 5 * 60000) continue;
      await chatStore.createScheduledNotification(phone, {
        reminder_time: t.toISOString(),
        reminder_type: String(f.reminder_type || 'follow_up').slice(0, 100),
        source_message: f.source_message || null,
      });
    }
  }

  if (Array.isArray(parsed.notification_ids_to_dismiss) && parsed.notification_ids_to_dismiss.length) {
    // Only ids that were actually offered to the model for THIS phone are
    // honored — an id it invents or one from another chat is dropped here,
    // and chat-store.dismissNotificationsByIds() re-checks phone ownership
    // again at the database layer as a second layer of defense.
    const validIds = new Set((ctx.pendingNotifications || []).map(n => n.id));
    const ids = parsed.notification_ids_to_dismiss.filter(id => validIds.has(id));
    if (ids.length) await chatStore.dismissNotificationsByIds(ids, phone);
  }
}

// ─── On-demand Q&A ("Ask AI" icon in the chat header) ────────
// Answers a free-form question about ONE chat only — same isolation as
// analyzeChat (only this phone's messages/extracted data/lead match are
// given as context), but synchronous/on-demand rather than debounced, and
// it never writes anything back to the database — it only answers.
async function askQuestion(phone, question) {
  if (!phone || !question || !String(question).trim()) return { answer: null, error: 'Empty question' };
  const ctx = await chatStore.getAiContext(phone);
  if (!ctx.messages || !ctx.messages.length) return { answer: null, error: 'No conversation history for this chat yet' };

  const transcript = ctx.messages.slice(-80).map(m =>
    `[${m.direction === 'inbound' ? 'Customer' : 'Agent'}] ${m.content_en || m.content}`
  ).join('\n');
  const extracted = (ctx.contact && ctx.contact.ai_extracted) || {};
  const leadMatchNote = summarizeLeadMatch(ctx.leadMatch);

  const systemPrompt = [
    'You are a CRM assistant answering ONE support agent\'s question about ONE isolated WhatsApp conversation for a maid-placement and home-cleaning business in Pune, India.',
    'Use ONLY the conversation and data given in this message — never reference or assume anything about any other customer or conversation.',
    'If the answer isn\'t in the given data, say so plainly instead of guessing.',
    'Respond ONLY with JSON: {"answer": "a concise, direct answer in plain text, 2-4 sentences max"}',
  ].join('\n');

  const userPrompt = [
    `Extracted fields known so far: ${JSON.stringify(extracted)}`,
    leadMatchNote,
    `Conversation transcript, oldest to newest:\n${transcript}`,
    `\nAgent's question: ${String(question).trim().slice(0, 500)}`,
  ].join('\n\n');

  const raw = await callOpenRouter([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  if (!raw) return { answer: null, error: 'AI is not available right now' };

  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed.answer !== 'string' || !parsed.answer.trim()) {
    return { answer: null, error: 'Could not parse an answer' };
  }
  return { answer: parsed.answer.trim().slice(0, 2000), error: null };
}

// ─── Outbound draft polish ("✨" icon on the composer) ────────
// Takes whatever the agent has typed — Hindi, Hinglish, or just broken/
// casual English — and rewrites it as a clean, professional English reply.
// Stateless: no chat context is needed or sent, nothing is written to the
// database, and it never sends anything — it only returns text for the
// agent to review (and edit further) before they hit Send themselves.
async function polishDraft(text) {
  if (!text || !String(text).trim()) return { text: null, error: 'Empty message' };
  const raw = await callOpenRouter([
    {
      role: 'system',
      content: 'Rewrite a single WhatsApp draft reply from a maid-placement/home-cleaning business agent to a customer. If it is in Hindi (Devanagari) or Hinglish, translate it to English. Fix grammar/spelling and make the tone professional, polite, and clear — but keep it natural and reasonably concise; do not make it stiff or robotic, and do not add information or change its meaning. Respond ONLY with JSON: {"text":"..."}',
    },
    { role: 'user', content: String(text).trim().slice(0, 1000) },
  ]);
  if (!raw) return { text: null, error: 'AI is not available right now' };

  const parsed = safeParseJson(raw);
  if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) {
    return { text: null, error: 'Could not polish this message' };
  }
  return { text: parsed.text.trim().slice(0, 2000), error: null };
}

module.exports = {
  translateIfNeeded,
  scheduleAnalysis,
  askQuestion,
  polishDraft,
  analyzeChat,
  // exported for tests
  looksHindiOrHinglish,
  FIELD_LIST,
};
