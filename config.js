// ============================================================
// config.js — White-label business settings + generic bot texts
// ============================================================
// Single-tenant: one business per deploy. Rebrand entirely through
// environment variables — no code changes needed.
//
//   BUSINESS_NAME        e.g. "Acme Traders"
//   BUSINESS_TYPE        e.g. "clothing retail" (used by AI + defaults)
//   CONTACT_NUMBER       public support number shown to customers
//   BUSINESS_ADDRESS     shown in handoffs / profiles
//   WORKING_HOURS        e.g. "Mon–Sat: 10 AM – 7 PM"
//   BRAND_COLOR          hex used by the dashboard UI
//   LOGO_URL             logo shown in the dashboard / landing page
//   BOT_ENABLED          "true" | "false" — master kill-switch for auto-replies
//   WELCOME_MESSAGE      first auto-reply to a new conversation ("" to disable)
//   FALLBACK_MESSAGE     reply when no keyword rule matches ("" = stay silent,
//                        let a human answer — the Wati-style default)
//   OFFLINE_MESSAGE      sent when a customer writes outside working hours
//                        ("" to disable; no schedule parsing — kept simple)
//   HUMAN_KEYWORDS       comma list that triggers the human-handoff reply
//                        e.g. "agent,human,support,call me"
//   BOT_RULES_JSON       JSON array of { "match": "price", "reply": "..." }
//                        matched case-insensitively via substring. Optional.
//   SESSION_TIMEOUT_MS   inactivity window before a session is forgotten
// ============================================================

require('dotenv').config();

function env(name, fallback) {
  const v = process.env[name];
  return (v === undefined || v === null || String(v).trim() === '') ? fallback : String(v);
}

function envBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase());
}

// ─── Branding ────────────────────────────────────────────────
const businessName   = env('BUSINESS_NAME', 'Your Business');
const businessType   = env('BUSINESS_TYPE', 'general business');
const contactNumber  = env('CONTACT_NUMBER', '');
const address        = env('BUSINESS_ADDRESS', process.env.ADDRESS || '');
const workingHours   = env('WORKING_HOURS', '');
const brandColor     = env('BRAND_COLOR', '#10b981');
const logoUrl        = env('LOGO_URL', '');

// ─── Session ─────────────────────────────────────────────────
const sessionTimeoutMs = parseInt(process.env.SESSION_TIMEOUT_MS || '', 10) || 15 * 60 * 1000;

// ─── Bot ─────────────────────────────────────────────────────
const botEnabled = envBool('BOT_ENABLED', true);

const welcomeMessage = env(
  'WELCOME_MESSAGE',
  `👋 Welcome to ${businessName}! How can we help you today?\n\nReply *agent* to talk to our team.`
);

const fallbackMessage = env('FALLBACK_MESSAGE', ''); // silent by default — human answers

const offlineMessage = env('OFFLINE_MESSAGE', '');

const humanKeywords = env('HUMAN_KEYWORDS', 'agent,human,support,call me,call back,callback,help')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

function humanHandoffMessage() {
  const where = contactNumber ? ` at ${contactNumber}` : '';
  const hours = workingHours ? ` (${workingHours})` : '';
  return `👤 Thanks! Our team will reply to you shortly${where}${hours}.`;
}

// Optional keyword → auto-reply rules from BOT_RULES_JSON.
// Example: [{"match":"price","reply":"Our price list: ..."},{"match":"timing","reply":"We are open ..."}]
let botRules = [];
try {
  const raw = env('BOT_RULES_JSON', '');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      botRules = parsed
        .filter(r => r && r.match && r.reply)
        .map(r => ({ match: String(r.match).toLowerCase(), reply: String(r.reply) }))
        .slice(0, 50);
    }
  }
} catch (e) {
  console.error('[config] BOT_RULES_JSON is not valid JSON — ignoring:', e.message);
}

// ─── System messages ─────────────────────────────────────────
const errorMessage = env(
  'ERROR_MESSAGE',
  '⚠️ Sorry, something went wrong on our side. Please try again, or reply *agent* to talk to our team.'
);

const nudgeMessage = {
  en: env('NUDGE_MESSAGE', '👋 Are you still there? Reply to continue, or reply *agent* to talk to our team.'),
};
nudgeMessage.hi = nudgeMessage.en;
nudgeMessage.mr = nudgeMessage.en;

// Public branding payload for the dashboard / landing page.
function getBranding() {
  return {
    businessName,
    businessType,
    contactNumber,
    address,
    workingHours,
    brandColor,
    logoUrl,
  };
}

module.exports = {
  businessName,
  businessType,
  contactNumber,
  address,
  workingHours,
  brandColor,
  logoUrl,
  sessionTimeoutMs,
  botEnabled,
  welcomeMessage,
  fallbackMessage,
  offlineMessage,
  humanKeywords,
  humanHandoffMessage,
  botRules,
  errorMessage,
  nudgeMessage,
  getBranding,
};
