// ============================================================
// flow.js — Chat flow state machine
// ============================================================

const config = require("./config");
const sheets = require("./sheets");
const { isInvited, removeInvite, uploadReceipt } = require("./invite-store");

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

function isRestart(text) {
  return false; // No keyword triggers — only FB/IG links start the bot
}

// Only trigger from Facebook/Instagram ad links
function isAdMessage(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("facebook.com") ||
    lower.includes("fb.me") ||
    lower.includes("instagram.com") ||
    lower.includes("ig.me")
  );
}

async function handleMessage(msg) {
  const senderId = msg.from;
  const body = (msg.body || "").trim();

  // Images are only accepted in PAYMENT_RECEIPT state
  if (msg.type === "image") {
    const existing = sessions.get(senderId);
    if (!existing || existing.state !== "PAYMENT_RECEIPT") return [];
  }

  // If they want to restart, clear their current session
  if (isRestart(body)) clearSession(senderId);

  let session = getSession(senderId);

  // If no active session, check if admin invited this person OR if it's an ad link
  if (!session) {
    // Check Supabase for a pending admin invite
    const invited = await isInvited(senderId);
    if (invited) {
      // Delete invite immediately — session takes over from here
      await removeInvite(senderId);
      session = createSession(senderId);
      try {
        const c = await msg.getContact();
        session.data.contactName = c.pushname || c.name || "there";
      } catch { session.data.contactName = "there"; }
      session.data.whatsappNumber = senderId;
      session.state = "LANGUAGE";
      return [config.languageMessage];
    }

    // Otherwise only FB/IG ad links can start the bot
    if (!isAdMessage(body)) {
      return [];
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

  let responses = await processState(session, body, senderId, msg);
  
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

async function processState(session, body, senderId, msg) {
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
        session.state = "CLEANING_VILLA_SQFT";
        return [config.villaSqftMessage[session.data.lang]];
      } else {
        return [config.cleaningServiceMessage[session.data.lang]];
      }
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
        return [session.data.lang === "hi" ? "1 या 2 रिप्लाई करें।" : session.data.lang === "mr" ? "1 किंवा 2 रिप्लाय करा." : "Please reply 1 or 2."];
      }
    }

    case "CLEANING_CONTINUE": {
      if (body === "1") {
        session.state = "CLEANING_LOCATION";
        return [config.cleaningLocationMessage[session.data.lang]];
      } else {
        // Invalid input
        return [session.data.lang === "hi" ? "आगे बढ़ने के लिए 1 रिप्लाई करें।" : session.data.lang === "mr" ? "पुढे जाण्यासाठी 1 रिप्लाय करा." : "Please reply 1 to continue."];
      }
    }

    case "CLEANING_MINI_SERVICE": {
      // Parse input like "6-2, 3-1, 7-3" (service-quantity pairs)
      if (body.length < 1) {
        return [config.miniServiceMessage[session.data.lang]];
      }
      
      try {
        const items = body.split(',').map(item => item.trim());
        let totalPrice = 0;
        let serviceDetails = [];
        
        for (const item of items) {
          const [serviceNum, qty] = item.split('-').map(s => s.trim());
          const quantity = parseInt(qty) || 1;
          
          const service = config.miniServiceItems[serviceNum];
          if (!service) {
            const msg = session.data.lang === "hi"
              ? `⚠️ गलत सर्विस नंबर: ${serviceNum}. फिर से कोशिश करें.`
              : session.data.lang === "mr"
              ? `⚠️ चुकीचा सर्विस नंबर: ${serviceNum}. पुन्हा प्रयत्न करा.`
              : `⚠️ Invalid service number: ${serviceNum}. Please try again.`;
            return [msg];
          }
          
          const itemTotal = service.price * quantity;
          totalPrice += itemTotal;
          serviceDetails.push(`${service.name} x${quantity} = ₹${itemTotal}`);
        }
        
        // Check minimum order value
        if (totalPrice < 2000) {
          const msg = session.data.lang === "hi"
            ? `⚠️ न्यूनतम ऑर्डर ₹2000 है। आपका कुल: ₹${totalPrice}। और सर्विसेज़ जोड़ें।`
            : session.data.lang === "mr"
            ? `⚠️ किमान ऑर्डर ₹2000 आहे. तुमचा एकूण: ₹${totalPrice}. आणखी सर्विसेस जोडा.`
            : `⚠️ Minimum order value is ₹2000. Your total: ₹${totalPrice}. Please add more services.`;
          return [msg];
        }
        
        session.data.cleaningDetails = "Mini Services: " + serviceDetails.join(', ');
        session.data.cleaningPrice = `₹${totalPrice}`;
        session.state = "CLEANING_LOCATION";
        return [config.cleaningLocationMessage[session.data.lang]];
        
      } catch (err) {
        const msg = session.data.lang === "hi"
          ? "⚠️ फॉर्मेट गलत है। उदाहरण: 6-2, 3-1, 7-3"
          : session.data.lang === "mr"
          ? "⚠️ फॉर्मेट चुकीचे आहे. उदाहरण: 6-2, 3-1, 7-3"
          : "⚠️ Invalid format. Example: 6-2, 3-1, 7-3";
        return [msg];
      }
    }

    case "CLEANING_LOCATION": {
      if (body === "1") {
        session.data.cleaningCity = "Pune";
      } else if (body === "2") {
        session.data.cleaningCity = "PCMC";
      } else {
        return [config.cleaningLocationMessage[session.data.lang]];
      }
      session.state = "CLEANING_AREA";
      return [config.getCleaningAreaMessage(session.data.cleaningCity, session.data.lang)];
    }

    case "CLEANING_AREA": {
      const idx = parseInt(body) - 1;
      const areas = session.data.cleaningCity === "Pune" ? config.puneAreas : config.pcmcAreas;
      if (isNaN(idx) || idx < 0 || idx >= areas.length) {
        return [config.getCleaningAreaMessage(session.data.cleaningCity, session.data.lang)];
      }
      const selectedArea = areas[idx];
      session.data.cleaningArea = selectedArea;
      session.data.cleaningLocation = `${selectedArea}, ${session.data.cleaningCity}`;
      session.state = "COLLECT_FLAT";
      return [config.collectFlatMessage];
    }

    case "COLLECT_FLAT": {
      if (body.length <= 3) {
        const msg = session.data.lang === "hi"
          ? "🏠 अपना फ्लैट नंबर और एरिया/सोसायटी का नाम बताएं।\n(उदाहरण: Flat 4B, Cidco N-6)"
          : session.data.lang === "mr"
          ? "🏠 तुमचा फ्लॅट नंबर आणि एरिया/सोसायटी चे नाव सांगा.\n(उदाहरण: Flat 4B, Cidco N-6)"
          : "🏠 Please share your flat number and area/society name.\n(Example: Flat 4B, Cidco N-6)";
        return [msg];
      }
      
      // Check if we're in cleaning flow or maid flow
      if (session.data.serviceCategory === "cleaning") {
        session.data.flat = body;
        session.state = "CLEANING_DATE";
        return [config.cleaningDateMessage[session.data.lang]];
      } else {
        // Maid flow
        session.data.flat = body;
        session.state = "COLLECT_DATE";
        return [config.collectDateMessage];
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
      const v = config.workTypes[body];
      if (!v) return [config.workTypeMessage[session.data.lang]];
      
      if (body === "5") {
        // Custom work type - still needs text input as it's genuinely custom
        session.state = "WORK_TYPE_CUSTOM";
        const msg = session.data.lang === "hi" ? "काम का प्रकार बताएं:" : session.data.lang === "mr" ? "कामाचा प्रकार सांगा:" : "Please type the specific work you need help with:";
        return [msg];
      }
      
      session.data.workType = v;
      session.state = "TIMING";
      return [config.timingMessage[session.data.lang]];
    }
    
    case "WORK_TYPE_CUSTOM": {
      if (body.length < 2) {
         const msg = session.data.lang === "hi" ? "काम का प्रकार बताएं:" : session.data.lang === "mr" ? "कामाचा प्रकार सांगा:" : "Please type the specific work you need help with:";
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
            budget: session.data.budget,
            status: "New Lead",
            source: "WhatsApp Bot",
            city: session.data.maidCity,
            area: session.data.maidArea,
            language: session.data.lang,
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
            ? `हम अभी आपके एरिया में मेड ढूंढ रहे हैं! 🔍\n\nहमें कॉल करें और हम आपके लिए सही मेड खोजने में मदद करेंगे:\n📞 ${config.contactNumber}`
            : session.data.lang === "mr"
            ? `आम्ही तुमच्या एरियात मेड शोधत आहोत! 🔍\n\nआम्हाला फोन करा आणि आम्ही तुमच्यासाठी योग्य मेड शोधण्यात मदत करू:\n📞 ${config.contactNumber}`
            : `We're on it! 🔍\n\nWe'll personally help you find the right maid for your area.\nPlease give us a call and we'll locate one for you:\n📞 ${config.contactNumber}`;
          return [msg];
        }

        let resultMsg = session.data.lang === "hi"
          ? "🌟 आपके लिए बेस्ट मेड:\n\n"
          : session.data.lang === "mr"
          ? "🌟 तुमच्यासाठी बेस्ट मेड:\n\n"
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
        return ["Sorry, there was an error finding maids. Please make sure the system is properly configured with Supabase."];
      }
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
      if (body.length <= 3) return [config.collectDateMessage];
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
          } catch (e) { console.error("[flow] booking write err:", e.message); }
        })();

        session.state = "PAYMENT_RECEIPT";
        return [config.paymentMessage[d.lang]];
      }
      if (body === "2") {
        clearSession(senderId);
        return [config.cancelMessage];
      }
      return [config.confirmMessage(session.data)];
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
        estimatedPrice: d.cleaningPrice,
        language: d.lang,
      });
    } catch (e) { console.error("[flow] cleaning booking write err:", e.message); }
  })();

  const msg = config.cleaningThanksMessage[session.data.lang];
  const adminAlert = config.adminCleaningAlert(session.data);
  clearSession(senderId);
  return [msg, { _adminAlert: adminAlert }];
}

module.exports = { handleMessage, activeSessionCount, clearSession, sessions };
