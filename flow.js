// ============================================================
// flow.js — Chat flow state machine
// ============================================================

const config = require("./config");
const sheets = require("./sheets");

const sessions = new Map();

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

function activeSessionCount() {
  return sessions.size;
}

const RESTART_KW = ["hi", "hello", "hey", "menu", "start", "help"];
function isRestart(text) {
  return RESTART_KW.includes(text.trim().toLowerCase());
}

// Check if message looks like it came from a Facebook/Instagram ad
function isAdMessage(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("facebook") || 
    lower.includes("instagram") || 
    lower.includes("fb.me") || 
    lower.includes("ig.me") || 
    lower.includes("http")
  );
}

async function handleMessage(msg) {
  const senderId = msg.from;
  const body = (msg.body || "").trim();

  // If they want to restart, clear their current session
  if (isRestart(body)) clearSession(senderId);

  let session = getSession(senderId);

  // If no active session, ONLY create one if it's an ad message or a restart keyword
  if (!session) {
    if (!isRestart(body) && !isAdMessage(body)) {
      return; // Ignore random personal messages
    }
    
    session = createSession(senderId);
    try {
      const c = await msg.getContact();
      session.data.contactName = c.pushname || c.name || "there";
    } catch { session.data.contactName = "there"; }
    session.data.whatsappNumber = senderId;
    session.state = "LANGUAGE";
    return [config.languageMessage];
  }

  // GLOBAL HANDLER FOR "0" - Talk to Support
  if (body === "0") {
    const lang = session.data.lang || "en";
    const msg = config.supportMessage[lang];
    clearSession(senderId);
    return [msg];
  }

  let responses = await processState(session, body, senderId);
  
  // Append the Call Option if the session is still active (meaning they haven't finished or cancelled)
  if (getSession(senderId) !== null) {
    const lang = session.data.lang || "en";
    const callOption = lang === "hi" ? `\n\n0️⃣ कस्टम प्रश्नों के लिए, कॉल करें: ${config.contactNumber}` : 
                       lang === "mr" ? `\n\n0️⃣ सानुकूल प्रश्नांसाठी, कॉल करा: ${config.contactNumber}` : 
                       `\n\n0️⃣ For custom questions, Call us: ${config.contactNumber}`;
                       
    for (let i = responses.length - 1; i >= 0; i--) {
      if (typeof responses[i] === "string" && !responses[i].includes("0️⃣")) {
        responses[i] += callOption;
        break;
      }
    }
  }
  
  return responses;
}

async function processState(session, body, senderId) {
  switch (session.state) {
    case "LANGUAGE": {
      const lang = config.langs[body];
      if (!lang) return [config.languageMessage];
      session.data.lang = lang;
      session.state = "MAIN_MENU";
      return [config.mainMenuMessage[lang]];
    }
    
    case "MAIN_MENU": {
      if (body === "1") {
        session.data.serviceCategory = "cleaning";
        session.state = "CLEANING_SERVICE_TYPE";
        return [config.cleaningServiceMessage[session.data.lang]];
      } else if (body === "2") {
        session.data.serviceCategory = "maid";
        session.state = "WORK_TYPE";
        return [config.workTypeMessage[session.data.lang]];
      } else {
        return [config.mainMenuMessage[session.data.lang]];
      }
    }

    // ==========================================
    // CLEANING SERVICE FLOW
    // ==========================================
    case "CLEANING_SERVICE_TYPE": {
      if (body === "1") {
        session.data.cleaningServiceType = "Flat Deep Cleaning";
        session.state = "CLEANING_FLAT_STATUS";
        return [config.flatStatusMessage[session.data.lang]];
      } else if (body === "2") {
        session.data.cleaningServiceType = "Bathroom Cleaning";
        session.state = "CLEANING_BATHROOM_TYPE";
        return [config.bathroomTypeMessage[session.data.lang]];
      } else if (body === "3") {
        session.data.cleaningServiceType = "Mini Service Package";
        session.state = "CLEANING_MINI_SERVICE";
        return [config.miniServiceMessage[session.data.lang]];
      } else if (body === "4") {
        session.data.cleaningServiceType = "Villa / Bungalow / Row House";
        session.state = "CLEANING_VILLA_STATUS";
        return [config.villaStatusMessage[session.data.lang]];
      } else {
        return [config.cleaningServiceMessage[session.data.lang]];
      }
    }

    case "CLEANING_VILLA_STATUS": {
      if (body === "1") {
        session.data.villaRate = 6;
        session.data.villaCondition = "Regular Occupied House";
        session.state = "CLEANING_VILLA_SQFT";
        return [config.villaSqftMessage[session.data.lang]];
      } else if (body === "2") {
        session.data.villaRate = 9;
        session.data.villaCondition = "Post Interior / Renovation";
        session.state = "CLEANING_VILLA_SQFT";
        return [config.villaSqftMessage[session.data.lang]];
      } else {
        return [config.villaStatusMessage[session.data.lang]];
      }
    }

    case "CLEANING_VILLA_SQFT": {
      const sqft = parseInt(body.replace(/\D/g, ""));
      if (!sqft || sqft < 100) {
        return [config.villaSqftMessage[session.data.lang]];
      }
      
      const price = sqft * session.data.villaRate;
      session.data.cleaningDetails = `${session.data.villaCondition} - ${sqft} Sq.Ft`;
      session.data.cleaningPrice = `₹${price}`;
      session.state = "CLEANING_CONTINUE";
      return [config.villaPriceMessage(sqft, price, session.data.lang)];
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
          if (body === "1") p = "₹3199"; else if (body === "2") p = "₹3599"; else if (body === "3") p = "₹4799";
        } else if (st === "Empty / Vacant") {
          if (body === "1") p = "₹2999"; else if (body === "2") p = "₹3499"; else if (body === "3") p = "₹4499";
        } else if (st === "Post Interior Cleaning") {
          if (body === "1") p = "₹5999"; else if (body === "2") p = "₹6999"; else if (body === "3") p = "₹7999";
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
        session.state = "CLEANING_LOCATION";
        return [config.cleaningLocationMessage[session.data.lang]];
      } else if (body === "2") {
        const msg = config.supportMessage[session.data.lang];
        clearSession(senderId);
        return [msg];
      } else {
        return [session.data.lang === "hi" ? "कृपया 1 या 2 रिप्लाई करें" : session.data.lang === "mr" ? "कृपया 1 किंवा 2 रिप्लाय करा" : "Please reply 1 or 2."];
      }
    }

    case "CLEANING_CONTINUE": {
      if (body === "1") {
        session.state = "CLEANING_LOCATION";
        return [config.cleaningLocationMessage[session.data.lang]];
      } else if (body.length >= 2) {
        // Assume they typed add-ons
        session.data.cleaningDetails += ` + Add-ons: ${body}`;
        if (session.data.cleaningPrice) session.data.cleaningPrice += ` + Add-ons`;
        session.state = "CLEANING_LOCATION";
        return [config.cleaningLocationMessage[session.data.lang]];
      } else {
        return [session.data.lang === "hi" ? "आगे बढ़ने के लिए 1 रिप्लाई करें या ऐड-ऑन टाइप करें" : session.data.lang === "mr" ? "पुढे जाण्यासाठी 1 रिप्लाय करा किंवा ॲड-ऑन्स टाइप करा" : "Please reply 1 to continue or type your add-ons."];
      }
    }

    case "CLEANING_MINI_SERVICE": {
      if (body.length >= 2) {
        session.data.cleaningDetails = "Mini Services: " + body;
        session.data.cleaningPrice = "As per menu + MOQ ₹2000";
        session.state = "CLEANING_LOCATION";
        return [config.cleaningLocationMessage[session.data.lang]];
      } else {
        return [config.miniServiceMessage[session.data.lang]];
      }
    }

    case "CLEANING_LOCATION": {
      if (body.length <= 2) return [config.cleaningLocationMessage[session.data.lang]];
      session.data.cleaningLocation = body;
      session.state = "CLEANING_DATE";
      return [config.cleaningDateMessage[session.data.lang]];
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
        clearSession(senderId);
        return [config.cancelMessage];
      } else {
        return [config.cleaningConfirmMessage(session.data, session.data.lang)];
      }
    }

    // ==========================================
    // MAID SERVICE FLOW (Original)
    // ==========================================
    case "WORK_TYPE": {
      if (body === "5") {
        session.state = "WORK_TYPE_CUSTOM";
        const msg = session.data.lang === "hi" ? "कृपया टाइप करें कि आपको किस प्रकार के काम की आवश्यकता है:" : session.data.lang === "mr" ? "कृपया तुम्हाला कोणत्या प्रकारचे काम हवे आहे ते टाइप करा:" : "Please type the specific work you need help with:";
        return [msg];
      }
      
      const v = config.workTypes[body];
      if (!v) return [config.workTypeMessage[session.data.lang]];
      session.data.workType = v;
      session.state = "TIMING";
      return [config.timingMessage[session.data.lang]];
    }
    
    case "WORK_TYPE_CUSTOM": {
      if (body.length < 2) {
         const msg = session.data.lang === "hi" ? "कृपया टाइप करें कि आपको किस प्रकार के काम की आवश्यकता है:" : session.data.lang === "mr" ? "कृपया तुम्हाला कोणत्या प्रकारचे काम हवे आहे ते टाइप करा:" : "Please type the specific work you need help with:";
         return [msg];
      }
      session.data.workType = "Custom: " + body;
      session.state = "TIMING";
      return [config.timingMessage[session.data.lang]];
    }

    case "TIMING": {
      const v = config.timings[body];
      if (!v) return [config.timingMessage[session.data.lang]];
      session.data.timing = v;
      session.state = "BUDGET";
      return [config.budgetMessage[session.data.lang]];
    }
    case "BUDGET": {
      const v = config.budgets[body];
      if (!v) return [config.budgetMessage[session.data.lang]];
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
        return ["Sorry, we couldn't find coordinates for this area. Please contact support."];
      }

      // Save lead (fire-and-forget)
      (async () => {
        try {
          const cid = await sheets.generateCustomerId();
          session.data.customerId = cid;
          await sheets.appendCustomer({
            customerId: cid,
            name: session.data.contactName,
            whatsappNumber: session.data.whatsappNumber,
            workType: session.data.workType,
            timing: session.data.timing,
            budget: session.data.budget + ` | Loc: ${session.data.maidArea}, ${session.data.maidCity}`,
            status: "New Lead",
            source: "WhatsApp Bot",
          });
        } catch (e) { console.error("[flow] lead save err:", e.message); }
      })();

      // Fetch from matching engine
      try {
        const { getTopMaids } = require('./matching.js');
        const topMaids = await getTopMaids(areaCoords.lat, areaCoords.lng);
        
        if (topMaids.length === 0) {
          // If no maids found in 8km
          const msg = session.data.lang === "hi" 
            ? "क्षमा करें, आपके क्षेत्र में 8 किमी के दायरे में कोई मेड उपलब्ध नहीं है। कृपया हमारे सपोर्ट से संपर्क करें।" 
            : session.data.lang === "mr"
            ? "क्षमस्व, तुमच्या परिसरात 8 किमीच्या आत कोणतीही मोलकरीण उपलब्ध नाही. कृपया आमच्या सपोर्टशी संपर्क साधा."
            : "Sorry, no maids are currently available in your area within 8km. Please contact our support.";
          return [msg];
        }

        let resultMsg = session.data.lang === "hi" 
          ? "🌟 यहाँ आपके लिए हमारी शीर्ष पसंद हैं:\n\n" 
          : session.data.lang === "mr"
          ? "🌟 येथे तुमच्यासाठी आमची सर्वोत्तम निवड आहे:\n\n"
          : "🌟 Here are our top picks for you:\n\n";

        const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
        topMaids.forEach((maid, i) => {
          resultMsg += `${emojis[i]} *ID:* M${maid.id}
👤 *Name:* ${maid.name}
🧹 *Work:* ${maid.service_type || 'Not specified'}
✨ *Experience:* ${maid.experience || 'Not specified'}
💰 *Expected Salary:* ₹${maid.salary_expectation || 'Negotiable'}
📍 *Distance:* ${maid.distance.toFixed(1)} km (${maid.zone.name})\n\n`;
        });

        resultMsg += session.data.lang === "hi"
          ? "👩 आपको कौन सी मेड पसंद आई? कृपया उनकी *ID* के साथ रिप्लाई करें (उदा: M123)।\n\n0️⃣ अगर आपको इनमें से कोई पसंद नहीं है, तो सपोर्ट से बात करने के लिए 0 दबाएं।"
          : session.data.lang === "mr"
          ? "👩 तुम्हाला कोणती मोलकरीण आवडली? कृपया त्यांच्या *ID* सोबत रिप्लाय करा (उदा: M123).\n\n0️⃣ जर तुम्हाला यापैकी कोणी आवडली नसेल, तर सपोर्टशी बोलण्यासाठी 0 दाबा."
          : "👩 Which maid did you like? Please reply with their *ID* (e.g., M123).\n\n0️⃣ If you didn't like these, reply with 0 to contact support.";

        session.state = "MAID_CHOICE";
        return [resultMsg];

      } catch (err) {
        console.error("Matching Error:", err);
        return ["Sorry, there was an error finding maids. Please make sure the system is properly configured with Supabase."];
      }
    }

    case "MAID_CHOICE": {
      if (body.length <= 1) return [config.maidChoiceMessage[session.data.lang]];
      session.data.maidChoice = body;
      session.state = "COLLECT_FLAT";
      return [config.collectFlatMessage[session.data.lang]];
    }
    case "COLLECT_FLAT": {
      if (body.length <= 3) return [config.collectFlatMessage[session.data.lang]];
      session.data.flat = body;
      session.state = "COLLECT_DATE";
      return [config.collectDateMessage[session.data.lang]];
    }
    case "COLLECT_DATE": {
      if (body.length <= 3) return [config.collectDateMessage[session.data.lang]];
      session.data.startDate = body;
      session.state = "MAID_PLAN";
      return [config.maidPlanMessage[session.data.lang]];
    }

    case "MAID_PLAN": {
      const plan = config.maidPlans[body];
      if (!plan) return [config.maidPlanMessage[session.data.lang]];
      session.data.selectedPlan = plan;
      session.state = "CONFIRM";
      return [config.confirmMessage(session.data)];
    }

    case "CONFIRM": {
      if (body === "1") {
        const d = session.data;
        let bid = "B000";
        try { bid = await sheets.generateBookingId(); } catch (e) { console.error(e.message); }
        d.bookingId = bid;
        (async () => {
          try {
            await sheets.appendBooking({
              bookingId: bid, customerName: d.contactName,
              customerWhatsApp: d.whatsappNumber, maidName: d.maidChoice,
              maidId: "", workType: d.workType, timing: d.timing,
              startDate: d.startDate, monthlySalary: d.budget, flat: d.flat,
              status: "Confirmed",
            });
            await sheets.updateCustomerStatus(d.whatsappNumber, "Booking Confirmed");
          } catch (e) { console.error("[flow] booking write err:", e.message); }
        })();
        const custMsg = config.bookingConfirmation({
          customerName: d.contactName, maidName: d.maidChoice,
          workType: d.workType, timing: d.timing,
          startDate: d.startDate, flat: d.flat,
        });
        const ownerMsg = config.adminBookingAlert({
          customerName: d.contactName, phone: d.whatsappNumber,
          flat: d.flat, maidChoice: d.maidChoice,
          workType: d.workType, timing: d.timing, startDate: d.startDate,
        });
        clearSession(senderId);
        return [custMsg, { _adminAlert: ownerMsg }];
      }
      if (body === "2") {
        clearSession(senderId);
        return [config.cancelMessage];
      }
      return [config.confirmMessage(session.data)];
    }
    default: {
      clearSession(senderId);
      return [config.errorMessage];
    }
  }
}

function finishCleaning(session, senderId) {
  const d = session.data;
  
  // Save cleaning request to Google Sheets (fire-and-forget)
  (async () => {
    try {
      // Create a unique booking ID for cleaning
      const bid = `CB${Date.now().toString().slice(-5)}`;
      await sheets.appendCleaningBooking({
        bookingId: bid,
        customerName: d.contactName,
        whatsappNumber: d.whatsappNumber,
        serviceType: d.cleaningServiceType,
        details: d.cleaningDetails || "N/A",
        location: d.cleaningLocation,
        preferredDate: d.cleaningDate,
      });
    } catch (e) { console.error("[flow] cleaning booking write err:", e.message); }
  })();

  const msg = config.cleaningThanksMessage[session.data.lang];
  const adminAlert = config.adminCleaningAlert(session.data);
  clearSession(senderId);
  return [msg, { _adminAlert: adminAlert }];
}

module.exports = { handleMessage, activeSessionCount, clearSession, sessions };
