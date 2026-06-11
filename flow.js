// ============================================================
// flow.js — Chat flow state machine
// ============================================================

const config = require("./config");
const sheets = require("./sheets");
const { isInvited, removeInvite, uploadReceipt } = require("./invite-store");
const chatStore = require("./chat-store");

const sessions = new Map();

// Remember each user's last-used language so restarts skip language selection.
const userLanguages = new Map(); // senderId → 'en' | 'hi' | 'mr'

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
  const s = { state: "LANGUAGE", data: {}, lastActivity: Date.now() };
  sessions.set(senderId, s);
  return s;
}

function clearSession(senderId) {
  sessions.delete(senderId);
}

// Move an in-memory session + remembered language from one identity key to
// another. Used when Baileys finally tells us the senderPn for an @lid jid
// after we've already created the session under @lid (because senderPn
// wasn't in the first message). Also rewrites the whatsappNumber stored
// in session.data so downstream sheet writes use the real phone number.
function migrateIdentity(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const s = sessions.get(fromId);
  if (s) {
    if (s.data && s.data.whatsappNumber === fromId.split('@')[0]) {
      s.data.whatsappNumber = toId.split('@')[0];
    }
    sessions.set(toId, s);
    sessions.delete(fromId);
    console.log('[flow] migrated session', fromId, '→', toId);
  }
  const lang = userLanguages.get(fromId);
  if (lang !== undefined) {
    userLanguages.set(toId, lang);
    userLanguages.delete(fromId);
  }
}

function activeSessionCount() {
  return sessions.size;
}

// ─── Progressive save ────────────────────────────────────────
// Writes whatever we know about the customer to Sheets after every state
// transition. Drop-offs mid-flow still leave a retargetable lead row.
//
// CUSTOMERS sheet is the master lead table for both flows.
// CLEANING_BOOKINGS is also patched (in parallel) once we've created a
// cleaning booking row.
//
// Fire-and-forget: never blocks the customer reply.
function saveProgress(session) {
  if (!session || !session.data || !session.data.whatsappNumber) return;
  const d = session.data;

  // Sync explicitly provided name and service category to the CRM Database
  const crmUpdates = {};
  if (d.contactName && d.contactName !== 'there') crmUpdates.name = d.contactName;
  if (d.serviceCategory) crmUpdates.service_category = d.serviceCategory;
  if (d.leadTemperature) crmUpdates.lead_temperature = d.leadTemperature;

  if (Object.keys(crmUpdates).length > 0) {
    chatStore.updateContactCRM(d.whatsappNumber, crmUpdates).catch(()=>{});
  }

  // MAID CUSTOMERS sheet is for maid leads only. Cleaning customers go
  // to CLEANING_BOOKINGS (below). Pre-category contacts (just opened
  // the bot, haven't picked maid/cleaning yet) also stay out of MAID
  // CUSTOMERS to keep it clean.
  if (d.serviceCategory === 'maid') {
    const fields = {};
    if (d.contactName)   fields.name          = d.contactName;
    if (d.workType)      fields.workType      = d.workType;
    if (d.timing)        fields.timing        = d.timing;
    if (d.budget)        fields.budget        = d.budget;
    if (d.maidCity)      fields.city          = d.maidCity;
    if (d.maidArea)      fields.area          = d.maidArea;
    if (d.flat)          fields.flat          = d.flat;
    if (d.maidChoice)    fields.maidChoice    = d.maidChoice;
    if (d.startDate)     fields.interviewDate = d.startDate;
    if (d.selectedPlan)  fields.selectedPlan  = d.selectedPlan;
    fields.status = d.workType ? `Maid: ${d.workType}` : 'Maid Flow Started';

    sheets.upsertCustomerByPhone(d.whatsappNumber, fields)
      .then(cid => { if (cid && !d.customerId) d.customerId = cid; })
      .catch(e => console.error('[flow] saveProgress (MAID CUSTOMERS) err:', e.message));
  }

  // Also patch the CLEANING_CUSTOMERS row once one exists for this session.
  if (d.cleaningBookingId) {
    const cleaningFields = {};
    if (d.contactName)         cleaningFields.customerName   = d.contactName;
    if (d.whatsappNumber)      cleaningFields.whatsappNumber = d.whatsappNumber;
    if (d.cleaningServiceType) cleaningFields.serviceType    = d.cleaningServiceType;
    if (d.cleaningDetails)     cleaningFields.details        = d.cleaningDetails;
    if (d.cleaningLocation)    cleaningFields.location       = d.cleaningLocation;
    if (d.cleaningDate)        cleaningFields.preferredDate  = d.cleaningDate;
    if (d.cleaningPrice)       cleaningFields.estimatedPrice = d.cleaningPrice;
    if (Object.keys(cleaningFields).length > 0) {
      sheets.updateCleaningBookingFields(d.cleaningBookingId, cleaningFields)
        .catch(e => console.error('[flow] saveProgress (CLEANING) err:', e.message));
    }
  }
}

function isRestart(text) {
  // Check if the text is a restart keyword
  const restart = restartIntent(text);
  return restart !== null;
}

// Trigger from Facebook/Instagram ad links OR common inquiry phrases.
// Phrases here cover what Meta auto-prefills in Click-to-WhatsApp ads,
// what customers paste from wa.me?text= links, and common natural
// language openings ('know more', 'interested', etc.).
function isAdMessage(text) {
  const lower = text.toLowerCase().trim();

  // URL-based (FB / IG ad clicks)
  if (
    lower.includes("facebook.com") ||
    lower.includes("fb.me") ||
    lower.includes("instagram.com") ||
    lower.includes("ig.me")
  ) return true;

  // Natural-language inquiry phrases
  const inquiryPhrases = [
    'know more', 'want to know', 'tell me more',
    'more details', 'more information', 'more info',
    'interested', 'i am interested', "i'm interested",
    'want to book', 'book service', 'book cleaning', 'book maid',
    'about service', 'about services', 'know about',
    'जानकारी', 'और जानें',
    'अधिक माहिती', 'माहिती हवी', 'जाणून',
  ];
  return inquiryPhrases.some(p => lower.includes(p));
}

// Restart shortcuts shown to users at the end of a flow.
function restartIntent(text) {
  const lower = text.toLowerCase().trim();
  if (lower === 'clean' || lower === 'cleaning') return 'cleaning';
  if (lower === 'maid' || lower === 'maid service') return 'maid';
  return null;
}

// ─── Interactive button helpers (Phase 1) ───────────────────
// Each helper returns the shape index.js's reply loop expects for
// interactive button messages:
//   { type: 'buttons', body: '<message text>', buttons: [{id, title}, ...] }
// The `id` matches the existing numeric state logic (1/2/3 etc.) so the
// processState switches don't need to change.

function langPrompt() {
  return {
    type: 'buttons',
    body: config.languageMessage,
    buttons: [
      { id: '1', title: 'English' },
      { id: '2', title: 'मराठी' },
      { id: '3', title: 'हिंदी' },
    ],
  };
}

function mainMenuPrompt(lang) {
  const labels = {
    en: { home: '🏠 Home Cleaning', maid: '🧹 Maid Service' },
    hi: { home: '🏠 घर की क्लीनिंग', maid: '🧹 मेड सर्विस' },
    mr: { home: '🏠 घराची क्लीनिंग', maid: '🧹 मेड सर्विस' },
  }[lang] || { en: '', home: '🏠 Home Cleaning', maid: '🧹 Maid Service' }.en;
  const L = labels.home ? labels : { home: '🏠 Home Cleaning', maid: '🧹 Maid Service' };
  return {
    type: 'buttons',
    body: config.mainMenuMessage[lang] || config.mainMenuMessage.en,
    buttons: [
      { id: '1', title: L.home },
      { id: '2', title: L.maid },
    ],
  };
}

function cityPrompt(lang) {
  return {
    type: 'buttons',
    body: config.maidCityMessage[lang] || config.maidCityMessage.en,
    buttons: [
      { id: '1', title: 'Pune' },
      { id: '2', title: 'PCMC' },
    ],
  };
}

function confirmPrompt(data, lang) {
  const titles = {
    en: { confirm: '✅ Confirm', cancel: '❌ Cancel', restart: '🔄 Restart' },
    hi: { confirm: '✅ कन्फर्म', cancel: '❌ कैंसिल', restart: '🔄 रीस्टार्ट' },
    mr: { confirm: '✅ कन्फर्म', cancel: '❌ कैंसल', restart: '🔄 रीस्टार्ट' },
  }[lang] || { confirm: '✅ Confirm', cancel: '❌ Cancel', restart: '🔄 Restart' };
  return {
    type: 'buttons',
    body: config.confirmMessage(data, lang),
    buttons: [
      { id: '1', title: titles.confirm },
      { id: '2', title: titles.cancel },
      { id: 'restart', title: titles.restart },
    ],
  };
}

function cleaningConfirmPrompt(data, lang) {
  const titles = {
    en: { confirm: '✅ Confirm', cancel: '❌ Cancel', restart: '🔄 Restart' },
    hi: { confirm: '✅ कन्फर्म', cancel: '❌ कैंसिल', restart: '🔄 रीस्टार्ट' },
    mr: { confirm: '✅ कन्फर्म', cancel: '❌ कैंसल', restart: '🔄 रीस्टार्ट' },
  }[lang] || { confirm: '✅ Confirm', cancel: '❌ Cancel', restart: '🔄 Restart' };

  return {
    type: 'buttons',
    body: config.cleaningConfirmMessage(data, lang),
    buttons: [
      { id: '1', title: titles.confirm },
      { id: '2', title: titles.cancel },
      { id: 'restart', title: titles.restart },
    ],
  };
}
function getDiscountOrAddressPrompt(session, prefixMsg = "") {
  const lang = session.data.lang || "en";
  if (session.data.isBroadcast && !session.data.discountApplied) {
    session.state = "CLEANING_DISCOUNT_PROMPT";
    const discountTitles = {
      en: '🎁 Apply 10% Discount',
      hi: '🎁 10% छूट लागू करें',
      mr: '🎁 10% सवलत लागू करा'
    }[lang] || '🎁 Apply 10% Discount';

    const skipTitles = {
      en: '➡️ Continue',
      hi: '➡️ आगे बढ़ें',
      mr: '➡️ पुढे जा'
    }[lang] || '➡️ Continue';

    const msgText = {
      en: `You are eligible for a 10% discount on your total of ${session.data.cleaningPrice}!`,
      hi: `आप अपने कुल ${session.data.cleaningPrice} पर 10% छूट के पात्र हैं!`,
      mr: `तुम्ही तुमच्या एकूण ${session.data.cleaningPrice} वर 10% सवलतीसाठी पात्र आहात!`
    }[lang] || `You are eligible for a 10% discount on your total of ${session.data.cleaningPrice}!`;

    const bodyText = prefixMsg ? `${prefixMsg}\n\n${msgText}` : msgText;

    return [{
      type: 'buttons',
      body: bodyText,
      buttons: [
        { id: 'apply_discount', title: discountTitles },
        { id: 'skip_discount', title: skipTitles }
      ]
    }];
  } else {
    session.state = "COLLECT_FLAT";
    const msg = prefixMsg ? `${prefixMsg}\n\n${config.cleaningAddressMessage[lang]}` : config.cleaningAddressMessage[lang];
    return [msg];
  }
}


// ─── Phase 2 + 3 prompt helpers ─────────────────────────────
// Tactic: extract just the question line(s) for the body, let the
// buttons/list show the options. Falls back gracefully on old WA
// versions because the body still tells customers what to do.

const T = {
  en: {
    choose:     'Choose',
    restart_btn:'🔄 Restart',
    work_q:     '🧹 What type of work do you need help with?',
    timing_q:   '⏰ What timing works best for you?',
    budget_q:   "💰 What's your monthly budget for the maid's salary?",
    service_q:  '🏠 Which service are you looking for?',
    flatStatus_q:'🏠 What is the flat condition?',
    sub_q:      '🏠 What is the current condition of the flat?',
    bhk_q:      '🏠 How many BHK is your flat?',
    bath_type_q:'🛁 How would you like to book?',
    bath_sub_q: '🛁 How many bathrooms?',
    bath_one_q: '🧼 How many bathrooms (one-time)?',
    bath_act_q: 'How would you like to proceed?',
    villa_q:    '🏡 House condition?',
    date_q:     '📅 When do you need the service?',
    cont_q:     'How would you like to proceed?',
    nomatch_q:  "😔 We couldn't find a maid right away. What next?",
    plan_q:     '📦 Choose your plan',
    pune_areas: '📍 Please select your Pune area',
    pcmc_areas: '📍 Please select your PCMC area',
    select_btn: 'Select',
    plan_btn:   'View plans',
    select_area:'Select area',
    other:      'Other (type your area)',
    proceed:    '✅ Proceed booking',
    wait:       '📞 Wait for call',
    continue:   'Continue',
    cancel:     'Cancel',
    addons:     'Select Add-ons',
    skip_addons:'Skip Add-ons',
    booking:    'Book Now',
    support:    'Talk to Support',
    today:      'Today',
    tomorrow:   'Tomorrow',
    selectDate: 'Select date',
    sub:        'Subscription',
    onetime:    'One-Time',
  },
  hi: {
    choose:     'चुनें',
    restart_btn:'🔄 रीस्टार्ट',
    work_q:     '🧹 कौन से काम की जरूरत है?',
    timing_q:   '⏰ कितने घंटे काम चाहिए?',
    budget_q:   '💰 मेड की सैलरी का मंथली बजट?',
    service_q:  '🏠 कौन सी सर्विस चाहिए?',
    flatStatus_q:'🏠 फ्लैट कैसा है?',
    sub_q:      '🏠 फ्लैट की कंडिशन?',
    bhk_q:      '🏠 कितने BHK?',
    bath_type_q:'🛁 बुकिंग कैसे करनी है?',
    bath_sub_q: '🛁 कितने बाथरूम?',
    bath_one_q: '🧼 कितने बाथरूम (एक बार)?',
    bath_act_q: 'आगे कैसे बढ़ें?',
    villa_q:    '🏡 घर की कंडिशन?',
    date_q:     '📅 सर्विस कब चाहिए?',
    cont_q:     'आगे कैसे बढ़ें?',
    nomatch_q:  '😔 अभी सही मेड नहीं मिली। आगे क्या?',
    plan_q:     '📦 अपना प्लान चुनें',
    pune_areas: '📍 अपना Pune एरिया चुनें',
    pcmc_areas: '📍 अपना PCMC एरिया चुनें',
    select_btn: 'चुनें',
    plan_btn:   'प्लान देखें',
    select_area:'एरिया चुनें',
    other:      'अन्य (एरिया लिखें)',
    proceed:    '✅ बुकिंग आगे',
    wait:       '📞 कॉल का इंतजार',
    continue:   'आगे बढ़ें',
    cancel:     'कैंसिल',
    addons:     'ऐड-ऑन चुनें',
    skip_addons:'बिना ऐड-ऑन',
    booking:    'बुक करें',
    support:    'सपोर्ट से बात करें',
    today:      'आज',
    tomorrow:   'कल',
    selectDate: 'तारीख चुनें',
    sub:        'सब्सक्रिप्शन',
    onetime:    'एक बार',
  },
  mr: {
    choose:     'निवडा',
    restart_btn:'🔄 रीस्टार्ट',
    work_q:     '🧹 कोणत्या कामाची गरज आहे?',
    timing_q:   '⏰ किती वेळ काम हवे आहे?',
    budget_q:   '💰 मेडच्या पगाराचे मंथली बजट?',
    service_q:  '🏠 कोणती सर्विस हवी आहे?',
    flatStatus_q:'🏠 फ्लॅट कसा आहे?',
    sub_q:      '🏠 फ्लॅटची कंडिशन?',
    bhk_q:      '🏠 किती BHK?',
    bath_type_q:'🛁 बुकिंग कशी करायची?',
    bath_sub_q: '🛁 किती बाथरूम?',
    bath_one_q: '🧼 किती बाथरूम (एक वेळ)?',
    bath_act_q: 'पुढे कसे जायचे?',
    villa_q:    '🏡 घराची कंडिशन?',
    date_q:     '📅 सर्विस केव्हा हवी?',
    cont_q:     'पुढे कसे जायचे?',
    nomatch_q:  '😔 लगेच मेड मिळाली नाही. पुढे काय?',
    plan_q:     '📦 तुमचा प्लान निवडा',
    pune_areas: '📍 तुमचा Pune एरिया निवडा',
    pcmc_areas: '📍 तुमचा PCMC एरिया निवडा',
    select_btn: 'निवडा',
    plan_btn:   'प्लान बघा',
    select_area:'एरिया निवडा',
    other:      'इतर (एरिया लिहा)',
    proceed:    '✅ बुकिंग पुढे',
    wait:       '📞 कॉलची वाट',
    continue:   'पुढे चला',
    cancel:     'कैंसल',
    addons:     'ऐड-ऑन निवडा',
    skip_addons:'ऐड-ऑनशिवाय',
    booking:    'बुक करा',
    support:    'सपोर्टशी बोला',
    today:      'आज',
    tomorrow:   'उद्या',
    selectDate: 'तारीख निवडा',
    sub:        'सब्सक्रिप्शन',
    onetime:    'एक वेळ',
  },
};
function t(lang, key) { return (T[lang] || T.en)[key] || T.en[key] || ''; }

function workTypePrompt(lang) {
  return {
    type: 'list',
    body: t(lang, 'choose'),
    buttonLabel: t(lang, 'select_btn'),
    sections: [{
      rows: [
        { id: '1', title: lang === 'hi' ? 'खाना बनाना' : lang === 'mr' ? 'स्वयंपाक' : 'Cooking' },
        { id: '2', title: lang === 'hi' ? 'सफाई'      : lang === 'mr' ? 'साफसफाई'  : 'Cleaning' },
        { id: '3', title: lang === 'hi' ? 'बच्चों की देखभाल' : lang === 'mr' ? 'मुलांची काळजी' : 'Babysitter' },
        { id: '4', title: lang === 'hi' ? 'बुजुर्ग देखभाल'    : lang === 'mr' ? 'वृद्धांची काळजी' : 'Caretaker' },
        { id: '5', title: lang === 'hi' ? 'ऑल राउंडर'         : lang === 'mr' ? 'ऑल राउंडर'        : 'All Rounder' },
      ],
    }],
  };
}

function timingPrompt(lang) {
  return {
    type: 'list',
    body: t(lang, 'choose'),
    buttonLabel: t(lang, 'select_btn'),
    sections: [{
      rows: [
        { id: '1', title: lang === 'hi' ? 'पार्ट टाइम 1-3h' : lang === 'mr' ? 'पार्ट टाइम 1-3h'  : 'Part Time 1-3h' },
        { id: '2', title: lang === 'hi' ? 'फुल टाइम 8h'     : lang === 'mr' ? 'फुल टाइम 8h'     : 'Full Time 8h' },
        { id: '3', title: lang === 'hi' ? 'फुल टाइम 10h'    : lang === 'mr' ? 'फुल टाइम 10h'    : 'Full Time 10h' },
        { id: '4', title: lang === 'hi' ? 'फुल टाइम 24h'    : lang === 'mr' ? 'फुल टाइम 24h'    : 'Full Time 24h' },
      ],
    }],
  };
}

function budgetPrompt(timing, lang) {
  const opts = config.getBudgetOptions(timing);
  const entries = Object.entries(opts);
  return {
    type: 'buttons',
    body: t(lang, 'budget_q'),
    buttons: entries.slice(0, 3).map(([id, label]) => ({ id, title: label })),
  };
}

function cleaningServicePrompt(lang) {
  return {
    type: 'list',
    body: t(lang, 'choose'),
    buttonLabel: t(lang, 'select_btn'),
    sections: [{
      rows: [
        { id: '1', title: lang === 'hi' ? 'फ्लैट डीप क्लीनिंग' : lang === 'mr' ? 'फ्लॅट डीप क्लीनिंग' : 'Flat Deep Clean' },
        { id: '2', title: lang === 'hi' ? 'बाथरूम क्लीनिंग'    : lang === 'mr' ? 'बाथरूम क्लीनिंग'    : 'Bathroom Clean' },
        { id: '3', title: lang === 'hi' ? 'मिनी सर्विस पैक'    : lang === 'mr' ? 'मिनी सर्विस पॅक'    : 'Mini Service' },
        { id: '4', title: lang === 'hi' ? 'विला / बंगला'        : lang === 'mr' ? 'व्हिला / बंगला'      : 'Villa / Bungalow' },
      ],
    }],
  };
}

function flatStatusPrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'flatStatus_q'),
    buttons: [
      { id: '1', title: lang === 'hi' ? 'फर्निश्ड'        : lang === 'mr' ? 'फर्निश्ड'           : 'Furnished' },
      { id: '2', title: lang === 'hi' ? 'खाली / वेकेंट'   : lang === 'mr' ? 'रिकामा / व्हेकंट'   : 'Empty / Vacant' },
      { id: '3', title: lang === 'hi' ? 'पोस्ट इंटीरियर' : lang === 'mr' ? 'पोस्ट इंटीरियर'     : 'Post Interior' },
    ],
  };
}

function furnishedSubPrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'sub_q'),
    buttons: [
      { id: '1', title: lang === 'hi' ? 'रेगुलर ऑक्युपाइड' : lang === 'mr' ? 'रेगुलर ऑक्युपाइड' : 'Regular Occupied' },
      { id: '2', title: lang === 'hi' ? 'मूव आउट क्लीन'    : lang === 'mr' ? 'मूव्ह आउट क्लीन'   : 'Move Out Clean' },
      { id: '3', title: lang === 'hi' ? 'नया फ्लैट पजेशन' : lang === 'mr' ? 'नवीन फ्लॅट पझेशन'    : 'New Flat Possession' },
    ],
  };
}

function emptySubPrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'sub_q'),
    buttons: [
      { id: '1', title: lang === 'hi' ? 'मूव आउट क्लीन'    : lang === 'mr' ? 'मूव्ह आउट क्लीन'   : 'Move Out Clean' },
      { id: '2', title: lang === 'hi' ? 'नया फ्लैट पजेशन' : lang === 'mr' ? 'नवीन फ्लॅट पझेशन'    : 'New Flat Possession' },
    ],
  };
}

function flatBhkPrompt(lang) {
  return {
    type: 'list',
    body: t(lang, 'choose'),
    buttonLabel: t(lang, 'select_btn'),
    sections: [{
      rows: [
        { id: '1', title: '1 BHK' },
        { id: '2', title: '2 BHK' },
        { id: '3', title: '3 BHK' },
        { id: '4', title: lang === 'hi' ? '4 BHK / विला' : lang === 'mr' ? '4 BHK / व्हिला' : '4 BHK / Villa' },
      ],
    }],
  };
}

function bathroomTypePrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'bath_type_q'),
    buttons: [
      { id: '1', title: t(lang, 'sub') },
      { id: '2', title: t(lang, 'onetime') },
    ],
  };
}

function bathroomSubCountPrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'bath_sub_q'),
    buttons: [
      { id: '1', title: lang === 'hi' ? '2 बाथरूम' : lang === 'mr' ? '2 बाथरूम' : '2 Bathrooms' },
      { id: '2', title: lang === 'hi' ? '3 बाथरूम' : lang === 'mr' ? '3 बाथरूम' : '3 Bathrooms' },
      { id: '3', title: lang === 'hi' ? '4 बाथरूम' : lang === 'mr' ? '4 बाथरूम' : '4 Bathrooms' },
    ],
  };
}

function bathroomOneTimeCountPrompt(lang) {
  return {
    type: 'list',
    body: t(lang, 'choose'),
    buttonLabel: t(lang, 'select_btn'),
    sections: [{
      rows: [
        { id: '1', title: lang === 'hi' ? '1 बाथरूम'  : lang === 'mr' ? '1 बाथरूम'  : '1 Bathroom' },
        { id: '2', title: lang === 'hi' ? '2 बाथरूम' : lang === 'mr' ? '2 बाथरूम' : '2 Bathrooms' },
        { id: '3', title: lang === 'hi' ? '3 बाथरूम' : lang === 'mr' ? '3 बाथरूम' : '3 Bathrooms' },
        { id: '4', title: lang === 'hi' ? '4+ बाथरूम': lang === 'mr' ? '4+ बाथरूम': '4+ Bathrooms' },
      ],
    }],
  };
}

function bathroomActionPrompt(details, price, lang) {
  // Used after bathroom sub or onetime price is shown — keep the price
  // info as the body, add Continue / Support buttons.
  return {
    type: 'buttons',
    body: t(lang, 'bath_act_q'),
    buttons: [
      { id: '1', title: t(lang, 'continue') },
      { id: '2', title: t(lang, 'support') },
    ],
  };
}

function villaStatusPrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'villa_q'),
    buttons: [
      { id: '1', title: lang === 'hi' ? 'रेगुलर ₹6/sq.ft' : lang === 'mr' ? 'रेगुलर ₹6/sq.ft' : 'Regular ₹6/sqft' },
      { id: '2', title: lang === 'hi' ? 'पोस्ट इंटी ₹9'    : lang === 'mr' ? 'पोस्ट इंटी ₹9'    : 'Post Interior ₹9' },
    ],
  };
}

function cleaningDatePrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'date_q'),
    buttons: [
      { id: '1', title: t(lang, 'today') },
      { id: '2', title: t(lang, 'tomorrow') },
      { id: '3', title: t(lang, 'selectDate') },
    ],
  };
}

function cleaningContinuePrompt(hasAddons, lang) {
  const buttons = [{ id: '1', title: t(lang, 'continue') }];
  if (hasAddons) {
    buttons.push({ id: '2', title: t(lang, 'addons') });
    buttons.push({ id: '3', title: t(lang, 'cancel') });
  } else {
    buttons.push({ id: '2', title: t(lang, 'cancel') });
  }
  return {
    type: 'buttons',
    body: t(lang, 'cont_q'),
    buttons,
  };
}

function maidNoMatchPrompt(lang) {
  return {
    type: 'buttons',
    body: t(lang, 'nomatch_q'),
    buttons: [
      { id: '1', title: t(lang, 'proceed') },
      { id: '2', title: t(lang, 'wait') },
    ],
  };
}

function maidPlanPrompt(timing, lang) {
  const opts = config.getMaidPlanOptions(timing);
  const entries = Object.entries(opts);
  const buttons = entries.slice(0, 2).map(([id, label]) => ({
    id,
    title: label.length > 20 ? label.slice(0, 18) + '…' : label,
  }));
  if (buttons.length < 3) {
    buttons.push({ id: 'restart', title: t(lang, 'restart_btn') });
  }
  return {
    type: 'buttons',
    body: config.getMaidPlanMessage(timing, lang),
    buttons,
  };
}

function pcmcAreaPrompt(lang) {
  const areas = config.pcmcAreas;
  const rows = areas.map((area, idx) => ({ id: String(idx + 1), title: area }));
  rows.push({ id: String(areas.length + 1), title: t(lang, 'other') });
  return {
    type: 'list',
    body: t(lang, 'choose'),
    buttonLabel: t(lang, 'select_area'),
    sections: [{ rows }],
  };
}

// PCMC fits in one list (8 areas + Other = 9 ≤ 10 cap).
// Pune has 19 areas — too many for a single list, keep as text.
function areaPrompt(city, lang) {
  if (city === 'PCMC') return pcmcAreaPrompt(lang);
  return config.getAreaMessage(city, lang);  // plain text fallback for Pune
}

// "restart" keyword: clears the current session in any state and
// re-opens the main menu (skipping language pick if we remember it).
// Accepts a few common variants in EN/HI/MR.
const RESTART_KEYWORDS = new Set([
  'restart', 'reset', 'start over', 'start again',
  'रिस्टार्ट', 'रीस्टार्ट', 'फिर से शुरू', 'दोबारा शुरू',
  'पुन्हा सुरू', 'रिस्टार्ट करा',
]);
function isRestartKeyword(text) {
  const lower = (text || '').toLowerCase().trim();
  return RESTART_KEYWORDS.has(lower);
}

async function handleMessage(msg) {
  const senderId = msg.from;
  const body = (msg.body || "").trim();

  const cleanBody = body.toLowerCase().trim();
  const isGetCode = cleanBody === 'getcode' || cleanBody === 'get code' || cleanBody === 'get quote';
  const isConnectTeam = cleanBody === 'connect_team' || cleanBody === 'connect with team';
  
  // --- Abandonment Drip Campaign Interceptions ---
  const isDripBook = cleanBody === 'drip_book' || cleanBody === 'book';
  const isDripCancel = cleanBody === 'drip_cancel' || cleanBody === 'cancel';
  const isDripCallback = cleanBody === 'drip_callback' || cleanBody === 'request call back';

  if (isDripCancel) {
      clearSession(senderId);
      chatStore.updateContactCRM(senderId, { lead_status: 'Canceled' }).catch(()=>{});
      return ["No problem! We have canceled your request. Feel free to reach out anytime if you need help!"];
  }

  if (isDripCallback) {
      clearSession(senderId);
      chatStore.updateContactCRM(senderId, { lead_status: 'Follow-up Required' }).catch(()=>{});
      return [
         "We have notified our team! Someone will call you shortly.",
         { _adminAlert: `🚨 *Callback Request!*\nPhone: +${senderId}\n_Requested a callback from the automated follow-up._` }
      ];
  }

  if (isDripBook) {
      const sess = sessions.get(senderId) || createSession(senderId);
      sess.state = "CLEANING_NAME";
      sess.data.serviceCategory = "cleaning";
      sess.data.leadTemperature = "Warm Lead";
      sess.data.lang = sess.data.lang || "en";
      sessions.set(senderId, sess);
      return [config.cleaningNameMessage[sess.data.lang]];
  }

  if (isGetCode) {
    clearSession(senderId);
    const session = createSession(senderId);
    session.data.isBroadcast = true;
    try {
      const c = await msg.getContact();
      session.data.contactName = c.pushname || c.name || "there";
      session.data.whatsappNumber = (c.id._serialized || senderId).split('@')[0];
    } catch {
      session.data.contactName = "there";
      session.data.whatsappNumber = senderId.split('@')[0];
    }

    const savedLang = userLanguages.get(senderId);
    if (savedLang) {
      session.data.lang = savedLang;
      session.data.serviceCategory = 'cleaning';
      session.state = 'CLEANING_NAME';
      saveProgress(session);
      return [config.cleaningNameMessage[savedLang]];
    }
    session.data.directFlow = 'cleaning';
    session.state = 'LANGUAGE';
    saveProgress(session);
    return [langPrompt()];
  }

  if (isConnectTeam) {
    const savedLang = userLanguages.get(senderId) || 'en';
    clearSession(senderId);
    return [config.supportMessage[savedLang]];
  }

  // Ignore non-text messages unless it's an image at the receipt upload step
  if (msg.type !== "text" && msg.type !== "chat" && msg.type !== "interactive" && msg.type !== "button") {
    if (msg.type === "image") {
    const existing = sessions.get(senderId);
    if (!existing || (existing.state !== "PAYMENT_RECEIPT" && existing.state !== "CLEANING_PAYMENT_RECEIPT")) {
      console.log('[flow] ignored image from', senderId, '(state:', existing?.state || 'none', ')');
      return [];
    }
    } else {
        return [];
    }
  }

  // "restart" keyword: always works, in any state. Clear the session and
  // re-show the main menu (skipping language pick if we remember it).
  if (isRestartKeyword(body)) {
    const savedLang = userLanguages.get(senderId);
    clearSession(senderId);
    const fresh = createSession(senderId);
    try {
      const c = await msg.getContact();
      fresh.data.contactName = c.pushname || c.name || "there";
      fresh.data.whatsappNumber = (c.id._serialized || senderId).split('@')[0];
    } catch {
      fresh.data.contactName = "there";
      fresh.data.whatsappNumber = senderId.split('@')[0];
    }
    if (savedLang) {
      fresh.data.lang = savedLang;
      fresh.state = "MAIN_MENU";
      saveProgress(fresh);
      return [mainMenuPrompt(savedLang)];
    }
    fresh.state = "LANGUAGE";
    saveProgress(fresh);
    return [langPrompt()];
  }

  // If they want to restart, clear their current session
  if (isRestart(body)) clearSession(senderId);

  let session = getSession(senderId);

  // If no active session, check restart keyword, admin invite, or ad link
  if (!session) {
    const invited = await isInvited(senderId);
    const restart = restartIntent(body);
    console.log('[flow] from:', senderId, '| invited:', invited, '| restart:', restart, '| body:', body.slice(0, 40));

    if (!invited && !restart && !isAdMessage(body)) {
      return [];
    }

    if (invited) await removeInvite(senderId);

    session = createSession(senderId);
    try {
      const c = await msg.getContact();
      session.data.contactName = c.pushname || c.name || "there";
      session.data.whatsappNumber = (c.id._serialized || senderId).split('@')[0];
    } catch {
      session.data.contactName = "there";
      session.data.whatsappNumber = senderId.split('@')[0];
    }

    // Restart keyword path: skip language menu if we know it, jump straight into the flow
    if (restart) {
      const savedLang = userLanguages.get(senderId);
      if (savedLang) {
        session.data.lang = savedLang;
        if (restart === 'cleaning') {
          session.data.serviceCategory = 'cleaning';
          session.state = 'CLEANING_NAME';
          saveProgress(session);
          return [config.cleaningNameMessage[savedLang]];
        }
        session.data.serviceCategory = 'maid';
        session.state = 'WORK_TYPE';
        saveProgress(session);
        return [workTypePrompt(savedLang)];
      }
      // No remembered language yet — ask, then route into the requested flow
      session.data.directFlow = restart;
      session.state = 'LANGUAGE';
      saveProgress(session);
      return [langPrompt()];
    }

    session.state = 'LANGUAGE';
    saveProgress(session);
    return [langPrompt()];
  }

  // MAID_CHOICE special "0" — customer didn't like any maid shown.
  // Offer to proceed with booking anyway (we'll find a maid for them).
  if (body === "0" && session.state === "MAID_CHOICE") {
    const lang = session.data.lang || "en";
    session.state = "MAID_NO_MATCH_OFFER";
    return [maidNoMatchPrompt(lang)];
  }

  // GLOBAL HANDLER FOR "0" - Talk to Support
  if (body === "0") {
    const lang = session.data.lang || "en";
    const msg = config.supportMessage[lang];
    clearSession(senderId);
    return [msg];
  }

  let responses = await processState(session, body, senderId, msg);

  // Save whatever we know after every state transition. Fire-and-forget
  // so customer reply isn't slowed by the Sheets round-trip.
  if (getSession(senderId) !== null) {
    saveProgress(session);
  }
  
  return responses;
}

async function processState(session, body, senderId, msg) {
  switch (session.state) {
    case "LANGUAGE": {
      const lang = config.langs[body];
      if (!lang) return [langPrompt()];
      session.data.lang = lang;
      userLanguages.set(senderId, lang);

      // Restart keyword set a target flow before language was picked
      if (session.data.directFlow === 'cleaning') {
        delete session.data.directFlow;
        session.data.serviceCategory = 'cleaning';
        session.state = 'CLEANING_NAME';
        return [config.cleaningNameMessage[lang]];
      }
      if (session.data.directFlow === 'maid') {
        delete session.data.directFlow;
        session.data.serviceCategory = 'maid';
        session.state = 'WORK_TYPE';
        return [workTypePrompt(lang)];
      }

      session.state = "MAIN_MENU";
      return [mainMenuPrompt(lang)];
    }
    
    case "MAIN_MENU": {
      if (body === "1") {
        session.data.serviceCategory = "cleaning";
        session.data.leadTemperature = "Cold Lead";
        session.state = "CLEANING_NAME";
        return [config.cleaningNameMessage[session.data.lang]];
      } else if (body === "2") {
        session.data.serviceCategory = "maid";
        session.data.leadTemperature = "Cold Lead";
        session.state = "WORK_TYPE";
        return [workTypePrompt(session.data.lang)];
      } else {
        return [mainMenuPrompt(session.data.lang)];
      }
    }

    case "CLEANING_NAME": {
      const trimmed = body.trim();
      if (trimmed.length < 2) {
        return [config.cleaningNameMessage[session.data.lang]];
      }
      session.data.contactName = trimmed;
      session.data.leadTemperature = "Warm Lead";
      session.state = "CLEANING_SERVICE_TYPE";
      return [cleaningServicePrompt(session.data.lang)];
    }

    // ==========================================
    // CLEANING SERVICE FLOW
    // ==========================================
    case "CLEANING_SERVICE_TYPE": {
      let chosen = null;
      let nextState = null;
      let nextMessage = null;
      if (body === "1") {
        chosen = "Flat Deep Cleaning";
        nextState = "CLEANING_FLAT_STATUS";
        nextMessage = flatStatusPrompt(session.data.lang);
      } else if (body === "2") {
        chosen = "Bathroom Cleaning";
        nextState = "CLEANING_BATHROOM_TYPE";
        nextMessage = bathroomTypePrompt(session.data.lang);
      } else if (body === "3") {
        chosen = "Mini Service Package";
        nextState = "CLEANING_MINI_SERVICE";
        nextMessage = config.miniServiceMessage[session.data.lang];
      } else if (body === "4") {
        chosen = "Villa / Bungalow / Row House";
        nextState = "CLEANING_VILLA_SQFT";
        nextMessage = config.villaSqftMessage[session.data.lang];
      } else {
        return [cleaningServicePrompt(session.data.lang)];
      }

      session.data.cleaningServiceType = chosen;
      session.state = nextState;

      // Save lead immediately (fire-and-forget) so abandoned cleaning flows
      // still leave a record for follow-up.
      const bid = `CB${Date.now().toString().slice(-5)}`;
      session.data.cleaningBookingId = bid;
      (async () => {
        try {
          await sheets.appendCleaningBooking({
            bookingId: bid,
            customerName: session.data.contactName,
            whatsappNumber: session.data.whatsappNumber,
            serviceType: chosen,
            details: "",
            location: "",
            preferredDate: "",
            estimatedPrice: "",
            status: "New Lead",
            source: session.data.isBroadcast ? "Broadcast" : "WhatsApp Bot",
            language: session.data.lang,
          });
        } catch (e) { console.error("[flow] cleaning lead save err:", e.message); }
      })();

      return [nextMessage];
    }

    case "CLEANING_VILLA_SQFT": {
      const sqft = parseInt(body.replace(/\D/g, ""));
      if (!sqft || sqft < 100) {
        return [config.villaSqftMessage[session.data.lang]];
      }
      
      // Store sqft and move to status selection
      session.data.villaSqft = sqft;
      session.state = "CLEANING_VILLA_STATUS";
      return [villaStatusPrompt(session.data.lang)];
    }

    case "CLEANING_VILLA_STATUS": {
      if (body === "1") {
        session.data.villaRate = 6;
        session.data.villaCondition = "Regular Occupied House";
      } else if (body === "2") {
        session.data.villaRate = 9;
        session.data.villaCondition = "Post Interior / Renovation";
      } else {
        return [villaStatusPrompt(session.data.lang)];
      }
      
      const price = session.data.villaSqft * session.data.villaRate;
      session.data.cleaningDetails = `${session.data.villaCondition} - ${session.data.villaSqft} Sq.Ft`;
      session.data.cleaningPrice = `₹${price}`;
      session.state = "CLEANING_CONTINUE";
      return [{
        type: 'buttons',
        body: config.villaPriceMessage(session.data.villaSqft, price, session.data.villaRate, session.data.villaCondition, session.data.lang),
        buttons: [
          { id: '1', title: t(session.data.lang, 'booking') },
          { id: '2', title: t(session.data.lang, 'cancel') },
          { id: 'restart', title: t(session.data.lang, 'restart_btn') },
        ],
      }];
    }

    case "CLEANING_FLAT_STATUS": {
      if (body === "1") {
        session.data.cleaningFlatStatus = "Furnished";
        session.state = "CLEANING_FURNISHED_SUB";
        return [furnishedSubPrompt(session.data.lang)];
      } else if (body === "2") {
        session.data.cleaningFlatStatus = "Empty / Vacant";
        session.state = "CLEANING_EMPTY_SUB";
        return [emptySubPrompt(session.data.lang)];
      } else if (body === "3") {
        session.data.cleaningFlatStatus = "Post Interior Cleaning";
        session.state = "CLEANING_FLAT_BHK";
        return [flatBhkPrompt(session.data.lang)];
      } else {
        return [flatStatusPrompt(session.data.lang)];
      }
    }

    case "CLEANING_FURNISHED_SUB": {
      if (body === "1") session.data.cleaningSubCondition = "Regular Occupied House";
      else if (body === "2") session.data.cleaningSubCondition = "Move Out Cleaning";
      else if (body === "3") session.data.cleaningSubCondition = "New Flat Possession";
      else return [furnishedSubPrompt(session.data.lang)];

      session.state = "CLEANING_FLAT_BHK";
      return [flatBhkPrompt(session.data.lang)];
    }

    case "CLEANING_EMPTY_SUB": {
      if (body === "1") session.data.cleaningSubCondition = "Move Out Cleaning";
      else if (body === "2") session.data.cleaningSubCondition = "New Flat Possession";
      else return [emptySubPrompt(session.data.lang)];

      session.state = "CLEANING_FLAT_BHK";
      return [flatBhkPrompt(session.data.lang)];
    }

    case "CLEANING_FLAT_BHK": {
      if (["1", "2", "3", "4"].includes(body)) {
        let details = `${session.data.cleaningFlatStatus}`;
        if (session.data.cleaningSubCondition) {
           details += ` (${session.data.cleaningSubCondition})`;
        }
        details += ` - ${body} BHK`;
        
        session.data.cleaningDetails = details;

        let p = "";
        let st = session.data.cleaningFlatStatus;
        if (st === "Furnished") {
          if (body === "1") p = "₹3,199"; else if (body === "2") p = "₹3,599"; else if (body === "3") p = "₹4,799";
        } else if (st === "Empty / Vacant") {
          if (body === "1") p = "₹2,999"; else if (body === "2") p = "₹3,499"; else if (body === "3") p = "₹4,499";
        } else if (st === "Post Interior Cleaning") {
          if (body === "1") p = "₹5,999"; else if (body === "2") p = "₹6,999"; else if (body === "3") p = "₹7,999";
        }
        if (body === "4") p = "Inspection Required";
        session.data.cleaningPrice = p;

        session.data.leadTemperature = "Hot Lead";
        session.state = "CLEANING_CONTINUE";
        const lang = session.data.lang;
        const priceBody = config.flatDeepCleaningPriceMessage(session.data.cleaningFlatStatus, body, lang);
        const hasAddons = (st === "Furnished" || st === "Post Interior Cleaning") && body !== "4";
        const buttons = hasAddons
          ? [
              { id: '1', title: t(lang, 'skip_addons') },
              { id: '2', title: t(lang, 'addons') },
              { id: '3', title: t(lang, 'cancel') },
            ]
          : [
              { id: '1', title: t(lang, 'continue') },
              { id: '2', title: t(lang, 'cancel') },
              { id: 'restart', title: t(lang, 'restart_btn') },
            ];
        return [{ type: 'buttons', body: priceBody, buttons }];
      } else {
        return [flatBhkPrompt(session.data.lang)];
      }
    }

    case "CLEANING_BATHROOM_TYPE": {
      if (body === "1") {
        session.data.cleaningBathroomType = "Subscription";
        session.state = "CLEANING_BATHROOM_SUB_COUNT";
        return [bathroomSubCountPrompt(session.data.lang)];
      } else if (body === "2") {
        session.data.cleaningBathroomType = "One-Time";
        session.state = "CLEANING_BATHROOM_ONETIME_COUNT";
        return [bathroomOneTimeCountPrompt(session.data.lang)];
      } else {
        return [bathroomTypePrompt(session.data.lang)];
      }
    }

    case "CLEANING_BATHROOM_SUB_COUNT": {
      let count = 0, price = 0;
      if (body === "1") { count = 2; price = 2250; }
      else if (body === "2") { count = 3; price = 3375; }
      else if (body === "3") { count = 4; price = 4500; }
      
      if (count > 0) {
        session.data.cleaningDetails = `${count} Bathrooms 3-Month Subscription`;
        session.data.cleaningPrice = `₹${price} (3 months, 3 visits)`;
        session.data.leadTemperature = "Hot Lead";
        session.state = "CLEANING_BATHROOM_ACTION";
        return [{
          type: 'buttons',
          body: config.bathroomSubMessage(count, price, session.data.lang),
          buttons: [
            { id: '1', title: t(session.data.lang, 'continue') },
            { id: '2', title: t(session.data.lang, 'support') },
            { id: 'restart', title: t(session.data.lang, 'restart_btn') },
          ],
        }];
      } else {
        return [bathroomSubCountPrompt(session.data.lang)];
      }
    }

    case "CLEANING_BATHROOM_ONETIME_COUNT": {
      if (["1", "2", "3", "4"].includes(body)) {
        let p = "";
        if (body === "1") p = "₹550"; else if (body === "2") p = "₹1100"; else if (body === "3") p = "₹1650"; else if (body === "4") p = "₹2200";
        session.data.cleaningDetails = `${body} Bathroom(s) One-Time`;
        session.data.cleaningPrice = p;
        session.data.leadTemperature = "Hot Lead";
        session.state = "CLEANING_BATHROOM_ACTION";
        return [{
          type: 'buttons',
          body: config.bathroomOneTimePriceMessage(body, session.data.lang),
          buttons: [
            { id: '1', title: t(session.data.lang, 'continue') },
            { id: '2', title: t(session.data.lang, 'support') },
            { id: 'restart', title: t(session.data.lang, 'restart_btn') },
          ],
        }];
      } else {
        return [bathroomOneTimeCountPrompt(session.data.lang)];
      }
    }

    case "CLEANING_BATHROOM_ACTION": {
      if (body === "1") {
        return getDiscountOrAddressPrompt(session);
      } else if (body === "2") {
        const msg = config.supportMessage[session.data.lang];
        clearSession(senderId);
        return [msg];
      } else {
        return [session.data.lang === "hi" ? "1 या 2 रिप्लाई करें।" : session.data.lang === "mr" ? "1 किंवा 2 रिप्लाय करा." : "Please reply 1 or 2."];
      }
    }

    case "CLEANING_CONTINUE": {
      const lang = session.data.lang || "en";
      const hasAddons = session.data.cleaningServiceType === "Flat Deep Cleaning" &&
        (session.data.cleaningFlatStatus === "Furnished" || session.data.cleaningFlatStatus === "Post Interior Cleaning") &&
        session.data.cleaningPrice !== "Inspection Required";

      if (body === "1") {
        return getDiscountOrAddressPrompt(session);
      } else if (body === "2") {
        if (hasAddons) {
          session.state = "CLEANING_ADDONS";
          return [config.cleaningAddonsMessage[lang]];
        }
        clearSession(senderId);
        return [config.cancelMessage[lang]];
      } else if (body === "3" && hasAddons) {
        clearSession(senderId);
        return [config.cancelMessage[lang]];
      } else {
        const hint = hasAddons
          ? (lang === "hi" ? "*1* (बिना ऐड-ऑन), *2* (ऐड-ऑन चुनें), या *3* (कैंसिल) रिप्लाई करें।"
            : lang === "mr" ? "*1* (ऐड-ऑनशिवाय), *2* (ऐड-ऑन निवडा), किंवा *3* (कैंसल) रिप्लाय करा."
            : "Reply *1* to continue, *2* to select add-ons, or *3* to cancel.")
          : (lang === "hi" ? "आगे बढ़ने के लिए *1* या कैंसिल के लिए *2* रिप्लाई करें।"
            : lang === "mr" ? "पुढे जाण्यासाठी *1* किंवा कैंसलसाठी *2* रिप्लाय करा."
            : "Reply *1* to proceed or *2* to cancel.");
        return [hint];
      }
    }

    case "CLEANING_ADDONS": {
      const lang = session.data.lang || "en";
      const base = parseInt((session.data.cleaningPrice || "0").replace(/[^0-9]/g, "")) || 0;

      // Parse comma/space-separated selection — accepts e.g. "1,3,5" or "1 3 5" or just "4".
      const picks = body.replace(/\s+/g, ',').split(',').map(s => s.trim()).filter(Boolean);
      if (picks.length === 0) return [config.cleaningAddonsMessage[lang]];

      // "Continue without add-ons" — selected alone
      if (picks.length === 1 && picks[0] === config.ADDON_SKIP_OPTION) {
        return getDiscountOrAddressPrompt(session);
      }

      // Validate every pick is a real add-on number
      const valid = picks.every(p => config.cleaningAddons[p]);
      if (!valid) return [config.cleaningAddonsMessage[lang]];

      // Walk the picks: add flat-priced ones to total now; sofa needs a seat-count prompt
      let addedTotal = 0;
      const addedLines = [];
      let needSofaSeats = false;
      for (const p of picks) {
        const a = config.cleaningAddons[p];
        if (a.perSeat) { needSofaSeats = true; continue; }
        addedTotal += a.price;
        addedLines.push(`${a.name} (₹${a.price})`);
      }

      if (needSofaSeats) {
        // Stash everything else, ask for sofa seat count next
        session.data.addonPending = { addedTotal, addedLines };
        session.state = "CLEANING_ADDON_SOFA";
        return [config.cleaningAddonsSofaMessage[lang]];
      }

      // No sofa — finalise immediately
      const newTotal = base + addedTotal;
      session.data.cleaningPrice = `₹${newTotal}`;
      session.data.cleaningDetails += ` + Add-ons: ${addedLines.join(' + ')}`;
      
      const prefix = lang === "hi"
        ? `✅ ऐड-ऑन जोड़े गए! नया कुल: ₹${newTotal}`
        : lang === "mr"
        ? `✅ ऐड-ऑन जोडले! नवीन एकूण: ₹${newTotal}`
        : `✅ Add-ons added! New total: ₹${newTotal}`;
        
      return getDiscountOrAddressPrompt(session, prefix);
    }

    case "CLEANING_ADDON_SOFA": {
      const lang = session.data.lang || "en";
      const seats = parseInt(body.replace(/[^0-9]/g, ""));
      if (!seats || seats < 1 || seats > 30) {
        return [config.cleaningAddonsSofaMessage[lang]];
      }
      const sofaTotal = seats * 150;
      const pending = session.data.addonPending || { addedTotal: 0, addedLines: [] };
      const base = parseInt((session.data.cleaningPrice || "0").replace(/[^0-9]/g, "")) || 0;
      const newTotal = base + sofaTotal + pending.addedTotal;

      const allLines = [`${seats} sofa seat(s) (₹${sofaTotal})`, ...pending.addedLines];
      session.data.cleaningPrice = `₹${newTotal}`;
      session.data.cleaningDetails += ` + Add-ons: ${allLines.join(' + ')}`;
      delete session.data.addonPending;
      
      const prefix = lang === "hi"
        ? `✅ ऐड-ऑन जोड़े गए! नया कुल: ₹${newTotal}`
        : lang === "mr"
        ? `✅ ऐड-ऑन जोडले! नवीन एकूण: ₹${newTotal}`
        : `✅ Add-ons added! New total: ₹${newTotal}`;

      return getDiscountOrAddressPrompt(session, prefix);
    }

    case "CLEANING_MINI_SERVICE": {
      // Parse input like "6-2, 3-1, 7-3" (service-quantity pairs).
      // Accumulates across messages until ₹2000 minimum is reached.
      const lang = session.data.lang || "en";
      if (body.length < 1) return [config.miniServiceMessage[lang]];

      // Initialise the per-session cart
      if (!session.data.miniCart) session.data.miniCart = { items: [], total: 0 };
      const cart = session.data.miniCart;

      try {
        const newItems = body.split(',').map(s => s.trim()).filter(Boolean);
        for (const item of newItems) {
          const [serviceNum, qty] = item.split('-').map(s => s.trim());
          const quantity = parseInt(qty) || 1;
          const service = config.miniServiceItems[serviceNum];
          if (!service) {
            const msg = lang === "hi"
              ? `⚠️ गलत सर्विस नंबर: ${serviceNum}. फिर से कोशिश करें.`
              : lang === "mr"
              ? `⚠️ चुकीचा सर्विस नंबर: ${serviceNum}. पुन्हा प्रयत्न करा.`
              : `⚠️ Invalid service number: ${serviceNum}. Please try again.`;
            return [msg];
          }
          const itemTotal = service.price * quantity;
          cart.items.push(`${service.name} x${quantity} = ₹${itemTotal}`);
          cart.total += itemTotal;
        }

        // Below minimum — keep collecting, show current cart
        if (cart.total < 2000) {
          const remaining = 2000 - cart.total;
          const cartLines = cart.items.map(s => `• ${s}`).join('\n');
          const msg = lang === "hi"
            ? `✅ अभी तक जोड़ा गया:\n${cartLines}\n\n💰 अभी का कुल: ₹${cart.total}\n⚠️ न्यूनतम ऑर्डर ₹2000 — और ₹${remaining} की सर्विसेज़ जोड़ें।`
            : lang === "mr"
            ? `✅ आत्तापर्यंत जोडले:\n${cartLines}\n\n💰 सध्याचा एकूण: ₹${cart.total}\n⚠️ किमान ऑर्डर ₹2000 — आणखी ₹${remaining} च्या सर्विसेस जोडा.`
            : `✅ Added so far:\n${cartLines}\n\n💰 Current total: ₹${cart.total}\n⚠️ Minimum order ₹2000 — please add ₹${remaining} more in services.`;
          return [msg];
        }

        // Minimum met — finalise
        session.data.cleaningDetails = "Mini Services: " + cart.items.join(', ');
        session.data.cleaningPrice = `₹${cart.total}`;
        session.data.leadTemperature = "Hot Lead";
        delete session.data.miniCart;
        return getDiscountOrAddressPrompt(session);

      } catch (err) {
        const msg = lang === "hi"
          ? "⚠️ फॉर्मेट गलत है। उदाहरण: 6-2, 3-1, 7-3"
          : lang === "mr"
          ? "⚠️ फॉर्मेट चुकीचे आहे. उदाहरण: 6-2, 3-1, 7-3"
          : "⚠️ Invalid format. Example: 6-2, 3-1, 7-3";
        return [msg];
      }
    }
    case "CLEANING_DISCOUNT_PROMPT": {
      const lang = session.data.lang || "en";
      if (body === "apply_discount") {
        const currentPriceStr = session.data.cleaningPrice || "";
        const match = currentPriceStr.match(/[\d,]+/);
        const numericPrice = match ? parseInt(match[0].replace(/,/g, "")) : 0;
        let discountMsg = "";
        if (numericPrice > 0) {
          const discount = Math.round(numericPrice * 0.10);
          const newPrice = numericPrice - discount;
          session.data.cleaningPrice = `₹${newPrice.toLocaleString('en-IN')}`;
          session.data.discountApplied = true;
          discountMsg = {
            en: `🎉 10% discount applied! You saved ₹${discount.toLocaleString('en-IN')}.\n\n`,
            hi: `🎉 10% छूट लागू हो गई! आपने ₹${discount.toLocaleString('en-IN')} की बचत की।\n\n`,
            mr: `🎉 10% सवलत लागू झाली! तुम्ही ₹${discount.toLocaleString('en-IN')} वाचवले.\n\n`
          }[lang] || `🎉 10% discount applied! You saved ₹${discount.toLocaleString('en-IN')}.\n\n`;
        }
        session.state = "COLLECT_FLAT";
        return [discountMsg + config.cleaningAddressMessage[lang]];
      } else {
        session.state = "COLLECT_FLAT";
        return [config.cleaningAddressMessage[lang]];
      }
    }

    case "COLLECT_FLAT": {
      const isCleaning = session.data.serviceCategory === "cleaning";
      const lang = session.data.lang || "en";
      // Need at least 3 chars so things like 'B-1' or 'A/3' are accepted.
      if (body.length < 3) {
        return [isCleaning ? config.cleaningAddressMessage[lang] : config.collectFlatMessage[lang]];
      }
      
      // Check if we're in cleaning flow or maid flow
      if (session.data.serviceCategory === "cleaning") {
        session.data.flat = body;
        session.data.cleaningLocation = body; // address is the location, no area selection needed
        session.state = "CLEANING_DATE";
        return [cleaningDatePrompt(session.data.lang)];
      } else {
        // Maid flow
        session.data.flat = body;
        session.data.leadTemperature = "Warm Lead";
        session.state = "COLLECT_DATE";
        return [config.collectDateMessage[session.data.lang || "en"]];
      }
    }

    case "CLEANING_DATE": {
      if (body === "1") {
        session.data.cleaningDate = "Today";
        session.state = "CLEANING_CONFIRM";
        return [cleaningConfirmPrompt(session.data, session.data.lang)];
      } else if (body === "2") {
        session.data.cleaningDate = "Tomorrow";
        session.state = "CLEANING_CONFIRM";
        return [cleaningConfirmPrompt(session.data, session.data.lang)];
      } else if (body === "3") {
        session.state = "CLEANING_CUSTOM_DATE";
        return [config.cleaningCustomDateMessage[session.data.lang]];
      } else {
        return [cleaningDatePrompt(session.data.lang)];
      }
    }

    case "CLEANING_CUSTOM_DATE": {
      if (body.length <= 2) return [config.cleaningCustomDateMessage[session.data.lang]];
      session.data.cleaningDate = body;
      session.state = "CLEANING_CONFIRM";
      return [cleaningConfirmPrompt(session.data, session.data.lang)];
    }

    case "CLEANING_CONFIRM": {
      if (body === "1") {
        const d = session.data;
        (async () => {
          try {
            await sheets.updateCleaningBooking(d.cleaningBookingId, {
              details: d.cleaningDetails || "N/A",
              location: d.cleaningLocation,
              preferredDate: d.cleaningDate,
              estimatedPrice: d.cleaningPrice,
              status: "Payment Pending",
              paymentStatus: "Pending",
              leadTemperature: d.leadTemperature,
            });
          } catch (e) { console.error("[flow] cleaning booking confirm err:", e.message); }
        })();

        session.state = "CLEANING_PAYMENT_RECEIPT";
        return [config.cleaningPaymentMessage[d.lang]];
      } else if (body === "2") {
        const lang = session.data.lang || "en";
        // Mark the lead as explicitly cancelled (not just abandoned)
        if (session.data.cleaningBookingId) {
          sheets.updateCleaningBooking(session.data.cleaningBookingId, { status: "Cancelled" })
            .catch(e => console.error('[flow] cleaning cancel update err:', e.message));
        }
        clearSession(senderId);
        return [config.cancelMessage[lang]];
      } else {
        return [cleaningConfirmPrompt(session.data, session.data.lang)];
      }
    }

    case "CLEANING_PAYMENT_RECEIPT": {
      const lang = session.data.lang || "en";
      const isImage = msg && msg.type === "image";

      if (!isImage) {
        const nudge = lang === "hi"
          ? "📸 कृपया पेमेंट का *स्क्रीनशॉट (इमेज)* भेजें। टेक्स्ट मैसेज स्वीकार नहीं किए जाते।"
          : lang === "mr"
          ? "📸 कृपया पेमेंटचा *स्क्रीनशॉट (इमेज)* पाठवा. टेक्स्ट मेसेज स्वीकारले जात नाहीत."
          : "📸 Please send a *screenshot (image)* of your payment receipt. Text messages are not accepted — only an actual screenshot will be processed.";
        return [nudge];
      }

      const caption = (msg.body || "").trim();
      const d = session.data;

      let receiptUrl = "";
      try {
        const media = await msg.downloadMedia();
        receiptUrl = await uploadReceipt(d.cleaningBookingId, media.data, media.mimetype);
      } catch (e) {
        console.error("[flow] cleaning receipt upload err:", e.message);
        receiptUrl = caption ? `Upload failed — caption: ${caption}` : "Upload failed — check WhatsApp";
      }

      (async () => {
        try {
          await sheets.updateCleaningBooking(d.cleaningBookingId, {
            status: "Payment Received",
            paymentStatus: "Receipt Received",
            receiptUrl: receiptUrl,
          });
        } catch (e) { console.error("[flow] cleaning payment update err:", e.message); }
      })();

      const adminAlert = config.adminCleaningPaymentAlert({
        customerName: d.contactName,
        phone: d.whatsappNumber,
        bookingId: d.cleaningBookingId,
        serviceType: d.cleaningServiceType,
        receiptNote: receiptUrl,
      });

      clearSession(senderId);
      return [config.cleaningReceiptReceivedMessage[lang], { _adminAlert: adminAlert, _adminImageId: msg.mediaId }];
    }

    // ==========================================
    // MAID SERVICE FLOW (Original)
    // ==========================================
    case "WORK_TYPE": {
      const v = config.workTypes[body];
      if (!v) return [workTypePrompt(session.data.lang)];
      session.data.workType = v;
      session.state = "TIMING";
      return [timingPrompt(session.data.lang)];
    }

    case "TIMING": {
      const v = config.timings[body];
      if (!v) return [timingPrompt(session.data.lang)];
      session.data.timing = v;
      session.state = "BUDGET";
      return [budgetPrompt(v, session.data.lang)];
    }
    case "BUDGET": {
      const opts = config.getBudgetOptions(session.data.timing);
      const v = opts[body];
      if (!v) return [budgetPrompt(session.data.timing, session.data.lang)];
      session.data.budget = v;
      session.state = "MAID_CITY";
      return [cityPrompt(session.data.lang)];
    }

    case "MAID_CITY": {
      if (body === "1") {
        session.data.maidCity = "Pune";
      } else if (body === "2") {
        session.data.maidCity = "PCMC";
      } else {
        return [cityPrompt(session.data.lang)];
      }
      session.state = "MAID_AREA";
      return [areaPrompt(session.data.maidCity, session.data.lang)];
    }

    case "MAID_AREA": {
      const idx = parseInt(body) - 1;
      const areas = session.data.maidCity === "Pune" ? config.puneAreas : config.pcmcAreas;
      // Custom-area option is one past the regular area list
      if (idx === areas.length) {
        session.state = "MAID_CUSTOM_AREA";
        return [config.customAreaPromptMessage[session.data.lang || "en"]];
      }
      if (isNaN(idx) || idx < 0 || idx >= areas.length) {
        return [areaPrompt(session.data.maidCity, session.data.lang)];
      }
      const selectedArea = areas[idx];
      session.data.maidArea = selectedArea;

      // Get area coordinates
      const areaCoords = session.data.maidCity === "Pune" 
        ? config.puneAreaCoordinates[selectedArea] 
        : config.pcmcAreaCoordinates[selectedArea];

      if (!areaCoords) {
        const lang = session.data.lang || "en";
        return [lang === "hi"
          ? "इस एरिया की जानकारी नहीं मिली। सपोर्ट के लिए कॉल करें।"
          : lang === "mr"
          ? "या एरियाची माहिती मिळाली नाही. सपोर्टसाठी फोन करा."
          : "Sorry, we couldn't find details for this area. Please contact support."];
      }

      // (CUSTOMERS row is already being upserted progressively by
      // saveProgress on each state transition — no separate append needed.)

      // Fetch from matching engine
      try {
        const { getTopMaids } = require('./matching.js');
        const topMaids = await getTopMaids(areaCoords.lat, areaCoords.lng, session.data.workType);
        
        if (topMaids.length === 0) {
          // No maids within 8km — offer to proceed with booking anyway.
          // Team finds the maid post-booking.
          session.state = "MAID_NO_MATCH_OFFER";
          session.data.availableMaids = []; // for admin alert if user says 2
          return [maidNoMatchPrompt(session.data.lang || "en")];
        }

        let resultMsg = session.data.lang === "hi"
          ? "🌟 आपके लिए बेस्ट मेड:\n\n"
          : session.data.lang === "mr"
          ? "🌟 तुमच्यासाठी बेस्ट मेड:\n\n"
          : "🌟 Here are our top picks for you:\n\n";

        const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
        const l = session.data.lang;
        const lbl = {
          work:   l === "hi" ? "काम"       : l === "mr" ? "काम"       : "Work",
          exp:    l === "hi" ? "अनुभव"     : l === "mr" ? "अनुभव"     : "Experience",
          salary: l === "hi" ? "अपेक्षित सैलरी" : l === "mr" ? "अपेक्षित पगार" : "Expected Salary",
          dist:   l === "hi" ? "दूरी"      : l === "mr" ? "अंतर"      : "Distance",
        };
        topMaids.forEach((maid, i) => {
          resultMsg += `${emojis[i]} *ID:* M${maid.id}
👤 ${maid.name}
🧹 *${lbl.work}:* ${maid.service_type || '-'}
✨ *${lbl.exp}:* ${maid.experience || '-'}
💰 *${lbl.salary}:* ₹${maid.salary_expectation || 'Negotiable'}
📍 *${lbl.dist}:* ${maid.distance.toFixed(1)} km
➖➖➖➖➖➖➖➖➖➖➖➖➖\n`;
        });

        resultMsg += session.data.lang === "hi"
          ? "👩 कौन सी मेड पसंद आई? नंबर रिप्लाई करें।\n\n💡 आप अधिकतम 2 मेड चुन सकते हैं (उदाहरण: 1,2 या सिर्फ 1)।\n\n0️⃣ अगर कोई पसंद नहीं आई तो सपोर्ट के लिए 0 दबाएं।"
          : session.data.lang === "mr"
          ? "👩 कोणती मेड आवडली? नंबर रिप्लाय करा.\n\n💡 तुम्ही जास्तीत जास्त 2 मेड निवडू शकता (उदाहरण: 1,2 किंवा फक्त 1).\n\n0️⃣ जर कोणी आवडली नाही तर सपोर्टसाठी 0 दाबा."
          : "👩 Which maid(s) did you like? Please reply with their *number*.\n\n💡 You can select up to 2 maids (e.g., 1,2 or just 1).\n\n0️⃣ If you didn't like these, reply with 0 to contact support.";

        // Store the maid list for validation
        session.data.availableMaids = topMaids;
        session.data.selectedMaids = [];
        session.data.leadTemperature = "Hot Lead";
        session.state = "MAID_CHOICE";
        return [resultMsg];

      } catch (err) {
        console.error("Matching Error:", err);
        const errLang = session.data.lang || "en";
        return [errLang === "hi"
          ? "मेड ढूंढने में कुछ गड़बड़ हुई। सपोर्ट के लिए कॉल करें।"
          : errLang === "mr"
          ? "मेड शोधताना चूक झाली. सपोर्टसाठी फोन करा."
          : "Something went wrong while finding maids. Please contact support."];
      }
    }

    case "MAID_CUSTOM_AREA": {
      const lang = session.data.lang || "en";
      const trimmed = body.trim();
      if (trimmed.length < 2) {
        return [config.customAreaPromptMessage[lang]];
      }
      session.data.maidArea = trimmed;
      session.data.maidCity = session.data.maidCity || "Custom";
      // CUSTOMERS row gets upserted by saveProgress on the way out.

      // Custom area: the customer has already invested effort typing
      // their location. Skip the proceed/wait choice — go straight
      // into the booking flow. Team assigns the maid post-booking.
      session.data.maidChoice = config.maidToBeAssignedLabel[lang] || config.maidToBeAssignedLabel.en;
      session.data.maidChoiceIds = "PENDING_ASSIGNMENT";
      session.data.selectedMaids = ["PENDING"];
      session.state = "COLLECT_FLAT";
      return [config.customAreaProceedMessage(trimmed, lang)];
    }

    case "MAID_NO_MATCH_OFFER": {
      const lang = session.data.lang || "en";
      if (body === "1") {
        // Customer chose to proceed — placeholder maid + continue flow
        session.data.maidChoice = config.maidToBeAssignedLabel[lang] || config.maidToBeAssignedLabel.en;
        session.data.maidChoiceIds = "PENDING_ASSIGNMENT";
        session.data.selectedMaids = ["PENDING"];
        session.state = "COLLECT_FLAT";
        return [config.collectFlatMessage[lang]];
      }
      if (body === "2") {
        // Customer chose to wait — admin alert + end
        const d = session.data;
        const adminAlert = config.adminMaidsRejectedAlert({
          customerName: d.contactName,
          phone: d.whatsappNumber,
          customerId: d.customerId,
          workType: d.workType,
          timing: d.timing,
          budget: d.budget,
          city: d.maidCity,
          area: d.maidArea,
          availableMaids: d.availableMaids,
        });
        clearSession(senderId);
        return [config.maidsRejectedMessage(lang), { _adminAlert: adminAlert }];
      }
      return [maidNoMatchPrompt(lang)];
    }

    case "MAID_CHOICE": {
      if (body.length === 0) {
        const msg = session.data.lang === "hi"
          ? "मेड का नंबर रिप्लाई करें (उदाहरण: 1 या 1,2)"
          : session.data.lang === "mr"
          ? "मेडचा नंबर रिप्लाय करा (उदाहरण: 1 किंवा 1,2)"
          : "Please reply with maid number (e.g., 1 or 1,2)";
        return [msg];
      }
      
      // Parse the input - can be "1" or "1,2" or "1 2"
      const maidNumbers = body
        .replace(/\s+/g, ',')  // Replace spaces with commas
        .split(',')
        .map(num => num.trim())
        .filter(num => num.length > 0)
        .map(num => parseInt(num));
      
      // Validate: maximum 2 maids
      if (maidNumbers.length > 2) {
        const msg = session.data.lang === "hi"
          ? "⚠️ आप अधिकतम 2 मेड ही चुन सकते हैं। फिर से कोशिश करें।"
          : session.data.lang === "mr"
          ? "⚠️ तुम्ही जास्तीत जास्त 2 मेड निवडू शकता. पुन्हा प्रयत्न करा."
          : "⚠️ You can select maximum 2 maids only. Please try again.";
        return [msg];
      }
      
      // Validate: check if numbers are valid (1, 2, or 3)
      const totalMaids = session.data.availableMaids ? session.data.availableMaids.length : 0;
      const invalidNumbers = maidNumbers.filter(num => isNaN(num) || num < 1 || num > totalMaids);
      
      if (invalidNumbers.length > 0 || maidNumbers.length === 0) {
        const msg = session.data.lang === "hi"
          ? `⚠️ गलत नंबर। 1 से ${totalMaids} के बीच नंबर चुनें।`
          : session.data.lang === "mr"
          ? `⚠️ चुकीचा नंबर. 1 ते ${totalMaids} मधला नंबर निवडा.`
          : `⚠️ Invalid number. Please select between 1 and ${totalMaids}.`;
        return [msg];
      }
      
      // Get selected maids by index
      const selectedMaids = maidNumbers.map(num => session.data.availableMaids[num - 1]);
      
      // Store selected maids with IDs
      const maidIds = selectedMaids.map(m => `M${m.id}`);
      const maidNames = selectedMaids.map(m => m.name);
      
      session.data.selectedMaids = maidIds;
      session.data.maidChoice = maidNames.join(', ');
      session.data.maidChoiceIds = maidIds.join(', ');
      
      // Show confirmation of selected maids
      let confirmMsg = session.data.lang === "hi"
        ? `✅ आपने चुना:\n\n`
        : session.data.lang === "mr"
        ? `✅ तुम्ही निवडले:\n\n`
        : `✅ You selected:\n\n`;
      
      selectedMaids.forEach((maid, idx) => {
        confirmMsg += `👤 ${maid.name} (M${maid.id}) - ${maid.distance.toFixed(1)} km\n`;
      });
      
      confirmMsg += session.data.lang === "hi"
        ? `\n📝 अब अपना फ्लैट नंबर और एरिया/सोसायटी का नाम बताएं।\n(उदाहरण: Flat 4B, Cidco N-6)`
        : session.data.lang === "mr"
        ? `\n📝 आता तुमचा फ्लॅट नंबर आणि एरिया/सोसायटी चे नाव सांगा.\n(उदाहरण: Flat 4B, Cidco N-6)`
        : `\n📝 Now please share your flat number and area/society name.\n(Example: Flat 4B, Cidco N-6)`;
      
      session.state = "COLLECT_FLAT";
      return [confirmMsg];
    }
    case "COLLECT_DATE": {
      if (body.length <= 3) return [config.collectDateMessage[session.data.lang || "en"]];
      session.data.startDate = body;
      session.state = "MAID_PLAN";
      return [maidPlanPrompt(session.data.timing, session.data.lang)];
    }

    case "MAID_PLAN": {
      const opts = config.getMaidPlanOptions(session.data.timing);
      const plan = opts[body];
      if (!plan) return [maidPlanPrompt(session.data.timing, session.data.lang)];
      session.data.selectedPlan = plan;
      session.state = "CONFIRM";
      return [confirmPrompt(session.data, session.data.lang || "en")];
    }

    case "CONFIRM": {
      if (body === "1") {
        const d = session.data;
        let bid = "B000";
        try { bid = await sheets.generateBookingId(); } catch (e) { console.error(e.message); }
        d.bookingId = bid;

        // Save booking as Payment Pending — will update after receipt received
        (async () => {
          try {
            await sheets.appendBooking({
              bookingId: bid,
              customerName: d.contactName,
              customerWhatsApp: d.whatsappNumber,
              maidName: d.maidChoice,
              maidId: d.maidChoiceIds || (d.selectedMaids || []).join(', '),
              workType: d.workType,
              timing: d.timing,
              startDate: d.startDate,
              monthlySalary: d.budget,
              flat: d.flat,
              status: "Payment Pending",
              selectedPlan: d.selectedPlan,
              city: d.maidCity,
              area: d.maidArea,
              language: d.lang,
              paymentStatus: "Pending",
            });
            // Backfill the matching CUSTOMERS row with the details that
            // weren't known at lead-capture time (address, picked maid,
            // interview date, plan).
            await sheets.updateCustomerBooking(d.whatsappNumber, {
              flat: d.flat,
              maidChoice: d.maidChoice,
              interviewDate: d.startDate,
              selectedPlan: d.selectedPlan,
            });
          } catch (e) { console.error("[flow] booking write err:", e.message); }
        })();

        session.state = "PAYMENT_RECEIPT";
        return [config.paymentMessage[d.lang]];
      }
      if (body === "2") {
        const lang = session.data.lang || "en";
        clearSession(senderId);
        return [config.cancelMessage[lang]];
      }
      return [confirmPrompt(session.data, session.data.lang || "en")];
    }

    case "PAYMENT_RECEIPT": {
      const lang = session.data.lang || "en";
      const isImage = msg && msg.type === "image";

      // Screenshot-only policy. Text messages (transaction IDs, "paid"
      // confirmations, anything else) are rejected — the customer is
      // nudged to send an actual image of the payment receipt.
      if (!isImage) {
        const nudge = lang === "hi"
          ? "📸 कृपया पेमेंट का *स्क्रीनशॉट (इमेज)* भेजें। टेक्स्ट मैसेज स्वीकार नहीं किए जाते।"
          : lang === "mr"
          ? "📸 कृपया पेमेंटचा *स्क्रीनशॉट (इमेज)* पाठवा. टेक्स्ट मेसेज स्वीकारले जात नाहीत."
          : "📸 Please send a *screenshot (image)* of your payment receipt. Text messages are not accepted — only an actual screenshot will be processed.";
        return [nudge];
      }

      const caption = (msg.body || "").trim();
      const d = session.data;

      // Download the image from WhatsApp and upload to Supabase Storage
      let receiptUrl = "";
      try {
        const media = await msg.downloadMedia();
        receiptUrl = await uploadReceipt(d.bookingId, media.data, media.mimetype);
      } catch (e) {
        console.error("[flow] receipt upload err:", e.message);
        receiptUrl = caption ? `Upload failed — caption: ${caption}` : "Upload failed — check WhatsApp";
      }

      // Update payment columns in Sheets
      (async () => {
        try {
          await sheets.updateBookingPayment(d.bookingId, receiptUrl);
          await sheets.updateCustomerStatus(d.whatsappNumber, "Payment Received");
        } catch (e) { console.error("[flow] payment update err:", e.message); }
      })();

      const adminAlert = config.adminPaymentAlert({
        customerName: d.contactName,
        phone: d.whatsappNumber,
        bookingId: d.bookingId,
        maidChoice: d.maidChoice,
        receiptNote: receiptUrl,
      });

      clearSession(senderId);
      return [config.receiptReceivedMessage[lang], { _adminAlert: adminAlert, _adminImageId: msg.mediaId }];
    }
    default: {
      clearSession(senderId);
      return [config.errorMessage];
    }
  }
}

function finishCleaning(session, senderId) {
  const d = session.data;

  // Upgrade the existing 'New Lead' row to 'Confirmed' with full details.
  // If for some reason the lead row wasn't created (rare), fall back to a
  // fresh append so we don't lose the booking.
  (async () => {
    try {
      if (d.cleaningBookingId) {
        await sheets.updateCleaningBooking(d.cleaningBookingId, {
          details: d.cleaningDetails || "N/A",
          location: d.cleaningLocation,
          preferredDate: d.cleaningDate,
          estimatedPrice: d.cleaningPrice,
          status: "Confirmed",
        });
      } else {
        const bid = `CB${Date.now().toString().slice(-5)}`;
        await sheets.appendCleaningBooking({
          bookingId: bid,
          customerName: d.contactName,
          whatsappNumber: d.whatsappNumber,
          serviceType: d.cleaningServiceType,
          details: d.cleaningDetails || "N/A",
          location: d.cleaningLocation,
          preferredDate: d.cleaningDate,
          estimatedPrice: d.cleaningPrice,
          status: "Confirmed",
          source: d.isBroadcast ? "Broadcast" : "WhatsApp Bot",
          language: d.lang,
        });
      }
    } catch (e) { console.error("[flow] cleaning booking finalize err:", e.message); }
  })();

  const msg = config.cleaningThanksMessage[session.data.lang];
  const adminAlert = config.adminCleaningAlert(session.data);
  clearSession(senderId);
  return [msg, { _adminAlert: adminAlert }];
}

module.exports = { handleMessage, activeSessionCount, clearSession, sessions, migrateIdentity, restartIntent, isAdMessage };
