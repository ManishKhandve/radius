// ============================================================
// flow.js — Generic white-label bot engine (Wati-style)
// ============================================================
// No business-specific flows. Behaviour:
//
//   • BOT_ENABLED=false  → always silent (pure human inbox).
//   • Human keywords     → handoff reply + admin alert for the inbox.
//   • BOT_RULES_JSON     → keyword auto-replies (checked first).
//   • Greetings          → welcome message, once per session.
//   • Anything else      → FALLBACK_MESSAGE only on the very first
//                          message of a session ("" = stay silent and
//                          let a human answer — the default).
//
// Complex / multi-step flows belong in the Automation builder
// (workflow-engine.js), not here. This file is the lightweight
// always-on responder in front of the human inbox.
// ============================================================

const config = require('./config');

const sessions = new Map(); // senderId → { lastActivity, greeted }

function getSession(senderId) {
  const s = sessions.get(senderId);
  if (!s) return null;
  if (Date.now() - s.lastActivity > config.sessionTimeoutMs) {
    sessions.delete(senderId);
    return null;
  }
  s.lastActivity = Date.now();
  return s;
}

function createSession(senderId) {
  const s = { lastActivity: Date.now(), greeted: false };
  sessions.set(senderId, s);
  return s;
}

function clearSession(senderId) {
  sessions.delete(senderId);
}

function activeSessionCount() {
  return sessions.size;
}

const GREETINGS = new Set([
  'hi', 'hii', 'hiii', 'hello', 'hey', 'yo',
  'namaste', 'namaskar', 'ram ram', 'salaam', 'adaab',
  'good morning', 'good afternoon', 'good evening',
  'start', 'menu', 'help',
]);

function isGreeting(text) {
  const t = String(text || '').toLowerCase().trim().replace(/[!.,*_\s]+$/g, '');
  return GREETINGS.has(t);
}

function matchesHumanRequest(text) {
  const t = String(text || '').toLowerCase();
  return config.humanKeywords.some(k => k && t.includes(k));
}

function matchRule(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  for (const r of config.botRules) {
    if (r.match && t.includes(r.match)) return r.reply;
  }
  return null;
}

async function handleMessage(msg) {
  const senderId = msg.from;
  const body = (msg.body || '').trim();

  // Non-text (audio/video/sticker…) — never auto-reply, humans see it.
  if (msg.type !== 'text' && msg.type !== 'chat' && msg.type !== 'interactive' && msg.type !== 'button') {
    return [];
  }

  if (!config.botEnabled) return [];
  if (!body) return [];

  let session = getSession(senderId);
  const isFirstMessage = !session;
  if (!session) {
    session = createSession(senderId);
    try {
      const c = await msg.getContact();
      session.contactName = c.pushname || c.name || '';
      session.whatsappNumber = (c.id._serialized || senderId).split('@')[0];
    } catch {
      session.whatsappNumber = String(senderId).split('@')[0];
    }
  }

  // 1) Human handoff — always honoured.
  if (matchesHumanRequest(body)) {
    session.greeted = true;
    return [
      config.humanHandoffMessage(),
      { _adminAlert: `🙋 *Human requested*\nPhone: +${session.whatsappNumber || senderId}\n_Message: ${body.slice(0, 200)}_` },
    ];
  }

  // 2) Keyword auto-replies.
  const ruleReply = matchRule(body);
  if (ruleReply) {
    session.greeted = true;
    return [ruleReply];
  }

  // 3) Greetings → welcome, once per session.
  if (!session.greeted && (isGreeting(body) || isFirstMessage)) {
    session.greeted = true;
    if (config.welcomeMessage) return [config.welcomeMessage];
    return [];
  }

  // 4) Anything else — silent by default (human inbox owns the chat).
  //    Only speak if the business configured a first-message fallback.
  if (!session.greeted && config.fallbackMessage) {
    session.greeted = true;
    return [config.fallbackMessage];
  }

  return [];
}

module.exports = {
  handleMessage,
  sessions,
  getSession,
  createSession,
  clearSession,
  activeSessionCount,
};
