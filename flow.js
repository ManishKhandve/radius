// ============================================================
// flow.js — Chat flow state machine
// ============================================================

const config = require("./config");
const sheets = require("./sheets");
const { isInvited, removeInvite, uploadReceipt } = require("./invite-store");

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

  // Build the CUSTOMERS-row payload. Only include fields with values —
  // upsertCustomerByPhone skips empty values so cells aren't blanked.
  const fields = {};
  if (d.contactName)   fields.name     = d.contactName;
  if (d.lang)          fields.language = d.lang;
  if (d.flat)          fields.flat     = d.flat;

  if (d.serviceCategory === 'cleaning') {
    fields.status = d.cleaningServiceType
      ? `Cleaning: ${d.cleaningServiceType}`
      : 'Cleaning Flow Started';
    if (d.cleaningDetails) fields.notes = d.cleaningDetails;
    if (d.cleaningLocation && !fields.flat) fields.flat = d.cleaningLocation;
  } else if (d.serviceCategory === 'maid') {
    if (d.workType)      fields.workType      = d.workType;
    if (d.timing)        fields.timing        = d.timing;
    if (d.budget)        fields.budget        = d.budget;
    if (d.maidCity)      fields.city          = d.maidCity;
    if (d.maidArea)      fields.area          = d.maidArea;
    if (d.maidChoice)    fields.maidChoice    = d.maidChoice;
    if (d.startDate)     fields.interviewDate = d.startDate;
    if (d.selectedPlan)  fields.selectedPlan  = d.selectedPlan;
    fields.status = d.workType ? `Maid: ${d.workType}` : 'Maid Flow Started';
  } else if (d.lang) {
    fields.status = 'Language Selected';
  } else {
    fields.status = 'Bot Contact';
  }

  sheets.upsertCustomerByPhone(d.whatsappNumber, fields)
    .then(cid => { if (cid && !d.customerId) d.customerId = cid; })
    .catch(e => console.error('[flow] saveProgress (CUSTOMERS) err:', e.message));

  // Also patch the CLEANING_BOOKINGS row once one exists for this session.
  if (d.cleaningBookingId) {
    const cleaningFields = {};
    if (d.contactName)         cleaningFields.customerName   = d.contactName;
    if (d.whatsappNumber)      cleaningFields.whatsappNumber = d.whatsappNumber;
    if (d.cleaningServiceType) cleaningFields.serviceType    = d.cleaningServiceType;
    if (d.cleaningDetails)     cleaningFields.details        = d.cleaningDetails;
    if (d.cleaningLocation)    cleaningFields.location       = d.cleaningLocation;
    if (d.cleaningDate)        cleaningFields.preferredDate  = d.cleaningDate;
    if (d.cleaningPrice)       cleaningFields.estimatedPrice = d.cleaningPrice;
    if (d.lang)                cleaningFields.language       = d.lang;
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

  // Images are only accepted in PAYMENT_RECEIPT state. Anywhere else
  // we ignore them — log it so silent drops are visible in debug logs.
  if (msg.type === "image") {
    const existing = sessions.get(senderId);
    if (!existing || existing.state !== "PAYMENT_RECEIPT") {
      console.log('[flow] ignored image from', senderId, '(state:', existing?.state || 'none', ')');
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
      return [config.mainMenuMessage[savedLang]];
    }
    fresh.state = "LANGUAGE";
    saveProgress(fresh);
    return [config.languageMessage];
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
        return [config.workTypeMessage[savedLang]];
      }
      // No remembered language yet — ask, then route into the requested flow
      session.data.directFlow = restart;
      session.state = 'LANGUAGE';
      saveProgress(session);
      return [config.languageMessage];
    }

    session.state = 'LANGUAGE';
    saveProgress(session);
    return [config.languageMessage];
  }

  // MAID_CHOICE special "0" — customer didn't like any maid shown.
  // Offer to proceed with booking anyway (we'll find a maid for them).
  if (body === "0" && session.state === "MAID_CHOICE") {
    const lang = session.data.lang || "en";
    session.state = "MAID_NO_MATCH_OFFER";
    return [config.maidNoMatchOfferMessage[lang]];
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

  // Append the Call + Restart hint if the session is still active
  // (i.e. they haven't finished or cancelled).
  if (getSession(senderId) !== null) {
    const lang = session.data.lang || "en";
    const hint = lang === "hi"
      ? `\n\n0️⃣ कस्टम प्रश्नों के लिए, कॉल करें: ${config.contactNumber}\n🔄 दोबारा शुरू करने के लिए *restart* टाइप करें`
      : lang === "mr"
      ? `\n\n0️⃣ अधिक माहितीसाठी, कॉल करा: ${config.contactNumber}\n🔄 पुन्हा सुरू करण्यासाठी *restart* टाइप करा`
      : `\n\n0️⃣ For custom questions, Call us: ${config.contactNumber}\n🔄 Type *restart* anytime to start over`;

    for (let i = responses.length - 1; i >= 0; i--) {
      if (typeof responses[i] === "string" && !responses[i].includes("0️⃣")) {
        responses[i] += hint;
        break;
      }
    }
  }
  
  return responses;
}

async function processState(session, body, senderId, msg) {
  switch (session.state) {
    case "LANGUAGE": {
      const lang = config.langs[body];
      if (!lang) return [config.languageMessage];
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
        return [config.workTypeMessage[lang]];
      }

      session.state = "MAIN_MENU";
      return [config.mainMenuMessage[lang]];
    }
    
    case "MAIN_MENU": {
      if (body === "1") {
        session.data.serviceCategory = "cleaning";
        session.state = "CLEANING_NAME";
        return [config.cleaningNameMessage[session.data.lang]];
      } else if (body === "2") {
        session.data.serviceCategory = "maid";
        session.state = "WORK_TYPE";
        return [config.workTypeMessage[session.data.lang]];
      } else {
        return [config.mainMenuMessage[session.data.lang]];
      }
    }

    case "CLEANING_NAME": {
      const trimmed = body.trim();
      if (trimmed.length < 2) {
        return [config.cleaningNameMessage[session.data.lang]];
      }
      session.data.contactName = trimmed;
      session.state = "CLEANING_SERVICE_TYPE";
      return [config.cleaningServiceMessage[session.data.lang]];
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
        nextMessage = config.flatStatusMessage[session.data.lang];
      } else if (body === "2") {
        chosen = "Bathroom Cleaning";
        nextState = "CLEANING_BATHROOM_TYPE";
        nextMessage = config.bathroomTypeMessage[session.data.lang];
      } else if (body === "3") {
        chosen = "Mini Service Package";
        nextState = "CLEANING_MINI_SERVICE";
        nextMessage = config.miniServiceMessage[session.data.lang];
      } else if (body === "4") {
        chosen = "Villa / Bungalow / Row House";
        nextState = "CLEANING_VILLA_SQFT";
        nextMessage = config.villaSqftMessage[session.data.lang];
      } else {
        return [config.cleaningServiceMessage[session.data.lang]];
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
            source: "WhatsApp Bot",
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
      return [config.villaStatusMessage[session.data.lang]];
    }

    case "CLEANING_VILLA_STATUS": {
      if (body === "1") {
        session.data.villaRate = 6;
        session.data.villaCondition = "Regular Occupied House";
      } else if (body === "2") {
        session.data.villaRate = 9;
        session.data.villaCondition = "Post Interior / Renovation";
      } else {
        return [config.villaStatusMessage[session.data.lang]];
      }
      
      const price = session.data.villaSqft * session.data.villaRate;
      session.data.cleaningDetails = `${session.data.villaCondition} - ${session.data.villaSqft} Sq.Ft`;
      session.data.cleaningPrice = `₹${price}`;
      session.state = "CLEANING_CONTINUE";
      return [config.villaPriceMessage(session.data.villaSqft, price, session.data.villaRate, session.data.villaCondition, session.data.lang)];
    }

    case "CLEANING_FLAT_STATUS": {
      if (body === "1") {
        session.data.cleaningFlatStatus = "Furnished";
        session.state = "CLEANING_FURNISHED_SUB";
        return [config.furnishedSubMessage[session.data.lang]];
      } else if (body === "2") {
        session.data.cleaningFlatStatus = "Empty / Vacant";
        session.state = "CLEANING_EMPTY_SUB";
        return [config.emptySubMessage[session.data.lang]];
      } else if (body === "3") {
        session.data.cleaningFlatStatus = "Post Interior Cleaning";
        session.state = "CLEANING_FLAT_BHK";
        return [config.flatBhkMessage[session.data.lang]];
      } else {
        return [config.flatStatusMessage[session.data.lang]];
      }
    }

    case "CLEANING_FURNISHED_SUB": {
      if (body === "1") session.data.cleaningSubCondition = "Regular Occupied House";
      else if (body === "2") session.data.cleaningSubCondition = "Move Out Cleaning";
      else if (body === "3") session.data.cleaningSubCondition = "New Flat Possession";
      else return [config.furnishedSubMessage[session.data.lang]];

      session.state = "CLEANING_FLAT_BHK";
      return [config.flatBhkMessage[session.data.lang]];
    }

    case "CLEANING_EMPTY_SUB": {
      if (body === "1") session.data.cleaningSubCondition = "Move Out Cleaning";
      else if (body === "2") session.data.cleaningSubCondition = "New Flat Possession";
      else return [config.emptySubMessage[session.data.lang]];

      session.state = "CLEANING_FLAT_BHK";
      return [config.flatBhkMessage[session.data.lang]];
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

        session.state = "CLEANING_CONTINUE";
        return [config.flatDeepCleaningPriceMessage(session.data.cleaningFlatStatus, body, session.data.lang)];
      } else {
        return [config.flatBhkMessage[session.data.lang]];
      }
    }

    case "CLEANING_BATHROOM_TYPE": {
      if (body === "1") {
        session.data.cleaningBathroomType = "Subscription";
        session.state = "CLEANING_BATHROOM_SUB_COUNT";
        return [config.bathroomSubscriptionCountMessage[session.data.lang]];
      } else if (body === "2") {
        session.data.cleaningBathroomType = "One-Time";
        session.state = "CLEANING_BATHROOM_ONETIME_COUNT";
        return [config.bathroomOneTimeCountMessage[session.data.lang]];
      } else {
        return [config.bathroomTypeMessage[session.data.lang]];
      }
    }

    case "CLEANING_BATHROOM_SUB_COUNT": {
      let count = 0, price = 0;
      if (body === "1") { count = 2; price = 2250; }
      else if (body === "2") { count = 3; price = 3375; }
      else if (body === "3") { count = 4; price = 4500; }
      
      if (count > 0) {
        session.data.cleaningDetails = `${count} Bathrooms Subscription`;
        session.data.cleaningPrice = `₹${price}/month`;
        session.state = "CLEANING_BATHROOM_ACTION";
        return [config.bathroomSubMessage(count, price, session.data.lang)];
      } else {
        return [config.bathroomSubscriptionCountMessage[session.data.lang]];
      }
    }

    case "CLEANING_BATHROOM_ONETIME_COUNT": {
      if (["1", "2", "3", "4"].includes(body)) {
        let p = "";
        if (body === "1") p = "₹550"; else if (body === "2") p = "₹1100"; else if (body === "3") p = "₹1650"; else if (body === "4") p = "₹2200";
        session.data.cleaningDetails = `${body} Bathroom(s) One-Time`;
        session.data.cleaningPrice = p;
        session.state = "CLEANING_BATHROOM_ACTION";
        return [config.bathroomOneTimePriceMessage(body, session.data.lang)];
      } else {
        return [config.bathroomOneTimeCountMessage[session.data.lang]];
      }
    }

    case "CLEANING_BATHROOM_ACTION": {
      if (body === "1") {
        session.state = "COLLECT_FLAT";
        return [config.cleaningAddressMessage[session.data.lang || "en"]];
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
        session.state = "COLLECT_FLAT";
        return [config.cleaningAddressMessage[lang]];
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
        session.state = "COLLECT_FLAT";
        return [config.cleaningAddressMessage[lang]];
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
      session.state = "COLLECT_FLAT";

      return [lang === "hi"
        ? `✅ ऐड-ऑन जोड़े गए! नया कुल: ₹${newTotal}\n\n${config.cleaningAddressMessage.hi}`
        : lang === "mr"
        ? `✅ ऐड-ऑन जोडले! नवीन एकूण: ₹${newTotal}\n\n${config.cleaningAddressMessage.mr}`
        : `✅ Add-ons added! New total: ₹${newTotal}\n\n${config.cleaningAddressMessage.en}`];
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
      session.state = "COLLECT_FLAT";

      return [lang === "hi"
        ? `✅ ऐड-ऑन जोड़े गए! नया कुल: ₹${newTotal}\n\n${config.cleaningAddressMessage.hi}`
        : lang === "mr"
        ? `✅ ऐड-ऑन जोडले! नवीन एकूण: ₹${newTotal}\n\n${config.cleaningAddressMessage.mr}`
        : `✅ Add-ons added! New total: ₹${newTotal}\n\n${config.cleaningAddressMessage.en}`];
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
        delete session.data.miniCart;
        session.state = "COLLECT_FLAT";
        return [config.cleaningAddressMessage[lang]];

      } catch (err) {
        const msg = lang === "hi"
          ? "⚠️ फॉर्मेट गलत है। उदाहरण: 6-2, 3-1, 7-3"
          : lang === "mr"
          ? "⚠️ फॉर्मेट चुकीचे आहे. उदाहरण: 6-2, 3-1, 7-3"
          : "⚠️ Invalid format. Example: 6-2, 3-1, 7-3";
        return [msg];
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
        return [config.cleaningDateMessage[session.data.lang]];
      } else {
        // Maid flow
        session.data.flat = body;
        session.state = "COLLECT_DATE";
        return [config.collectDateMessage[session.data.lang || "en"]];
      }
    }

    case "CLEANING_DATE": {
      if (body === "1") {
        session.data.cleaningDate = "Today";
        session.state = "CLEANING_CONFIRM";
        return [config.cleaningConfirmMessage(session.data, session.data.lang)];
      } else if (body === "2") {
        session.data.cleaningDate = "Tomorrow";
        session.state = "CLEANING_CONFIRM";
        return [config.cleaningConfirmMessage(session.data, session.data.lang)];
      } else if (body === "3") {
        session.state = "CLEANING_CUSTOM_DATE";
        return [config.cleaningCustomDateMessage[session.data.lang]];
      } else {
        return [config.cleaningDateMessage[session.data.lang]];
      }
    }

    case "CLEANING_CUSTOM_DATE": {
      if (body.length <= 2) return [config.cleaningCustomDateMessage[session.data.lang]];
      session.data.cleaningDate = body;
      session.state = "CLEANING_CONFIRM";
      return [config.cleaningConfirmMessage(session.data, session.data.lang)];
    }

    case "CLEANING_CONFIRM": {
      if (body === "1") {
        return finishCleaning(session, senderId);
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
        return [config.cleaningConfirmMessage(session.data, session.data.lang)];
      }
    }

    // ==========================================
    // MAID SERVICE FLOW (Original)
    // ==========================================
    case "WORK_TYPE": {
      const v = config.workTypes[body];
      if (!v) return [config.workTypeMessage[session.data.lang]];
      session.data.workType = v;
      session.state = "TIMING";
      return [config.timingMessage[session.data.lang]];
    }

    case "TIMING": {
      const v = config.timings[body];
      if (!v) return [config.timingMessage[session.data.lang]];
      session.data.timing = v;
      session.state = "BUDGET";
      return [config.getBudgetMessage(v, session.data.lang)];
    }
    case "BUDGET": {
      const opts = config.getBudgetOptions(session.data.timing);
      const v = opts[body];
      if (!v) return [config.getBudgetMessage(session.data.timing, session.data.lang)];
      session.data.budget = v;
      session.state = "MAID_CITY";
      return [config.maidCityMessage[session.data.lang]];
    }

    case "MAID_CITY": {
      if (body === "1") {
        session.data.maidCity = "Pune";
      } else if (body === "2") {
        session.data.maidCity = "PCMC";
      } else {
        return [config.maidCityMessage[session.data.lang]];
      }
      session.state = "MAID_AREA";
      return [config.getAreaMessage(session.data.maidCity, session.data.lang)];
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
        return [config.getAreaMessage(session.data.maidCity, session.data.lang)];
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
          return [config.maidNoMatchOfferMessage[session.data.lang || "en"]];
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
      return [config.maidNoMatchOfferMessage[lang]];
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
      return [config.getMaidPlanMessage(session.data.timing, session.data.lang)];
    }

    case "MAID_PLAN": {
      const opts = config.getMaidPlanOptions(session.data.timing);
      const plan = opts[body];
      if (!plan) return [config.getMaidPlanMessage(session.data.timing, session.data.lang)];
      session.data.selectedPlan = plan;
      session.state = "CONFIRM";
      return [config.confirmMessage(session.data, session.data.lang || "en")];
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
      return [config.confirmMessage(session.data, session.data.lang || "en")];
    }

    case "PAYMENT_RECEIPT": {
      const lang = session.data.lang || "en";
      const isImage = msg && msg.type === "image";
      const isText  = msg && msg.type === "chat";

      if (!isImage && !isText) {
        // Wrong message type — nudge them
        const nudge = lang === "hi"
          ? "📸 कृपया पेमेंट का स्क्रीनशॉट भेजें।"
          : lang === "mr"
          ? "📸 कृपया पेमेंटचा स्क्रीनशॉट पाठवा."
          : "📸 Please send a screenshot of your payment receipt.";
        return [nudge];
      }

      const caption = (msg.body || "").trim();
      const d = session.data;

      // For images: download from WhatsApp and upload to Supabase Storage
      let receiptUrl = "";
      if (isImage) {
        try {
          const media = await msg.downloadMedia();
          receiptUrl = await uploadReceipt(d.bookingId, media.data, media.mimetype);
        } catch (e) {
          console.error("[flow] receipt upload err:", e.message);
          receiptUrl = caption ? `Upload failed — caption: ${caption}` : "Upload failed — check WhatsApp";
        }
      } else {
        receiptUrl = `Transaction ID: ${caption}`;
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
      return [config.receiptReceivedMessage[lang], { _adminAlert: adminAlert }];
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

module.exports = { handleMessage, activeSessionCount, clearSession, sessions, migrateIdentity };
