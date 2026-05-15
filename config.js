// ============================================================
// config.js — Business settings, templates, and message strings
// ============================================================
// ⚠️  Replace every value marked "REPLACE" before going live.
// ============================================================

// Add dotenv just in case this is loaded standalone somewhere
require('dotenv').config();

// ─── Business Details ────────────────────────────────────────
const businessName     = process.env.BUSINESS_NAME || "CLEANLY Services";                      
const ownerWhatsApp    = process.env.OWNER_WHATSAPP || "918767572043@c.us";                     
const glideAppUrl      = process.env.GLIDE_APP_URL || "https://your-app.glideapp.io";          
const workingHours     = process.env.WORKING_HOURS || "Mon–Sat: 10 AM – 7 PM";                
const address          = process.env.ADDRESS || "pune";                             
const contactNumber    = process.env.CONTACT_NUMBER || "+91 8767572043";                       

// ─── Session ─────────────────────────────────────────────────
const sessionTimeoutMs = 15 * 60 * 1000; // 15 minutes

const workTypes = {
  "1": "Cooking",
  "2": "Cleaning",
  "3": "Babysitter",
  "4": "Caretaker",
  "5": "Custom"
};

const timings = {
  "1": "1 hr",
  "2": "8 hr",
  "3": "10 hr",
  "4": "24 hr"
};

const budgets = {
  "1": "Based on skill and experience",
  "2": "₹4,000 – ₹6,000",
  "3": "₹6,000 – ₹10,000",
  "4": "₹10,000 – ₹20,000",
  "5": "₹20,000 – ₹30,000"
};

const langs = {
  "1": "en",
  "2": "hi",
  "3": "mr"
};

// ─── Message Templates ──────────────────────────────────────

const languageMessage = `👋 Welcome to CLEANLY Services
Please choose your preferred language:
1️⃣ English
2️⃣ हिंदी
3️⃣ मराठी`;

const mainMenuMessage = {
  en: `Main menu
- Which service are you looking for?
1. HOME deep cleaning service
2. MONTHLY maid service`,
  hi: `मुख्य मेनू
- आप कौन सी सेवा ढूंढ रहे हैं?
1. होम डीप क्लीनिंग सर्विस (HOME deep cleaning service)
2. मासिक मेड सर्विस (MONTHLY maid service)`,
  mr: `मुख्य मेनू
- तुम्ही कोणती सेवा शोधत आहात?
1. होम डीप क्लिनिंग सर्व्हिस (HOME deep cleaning service)
2. मासिक मोलकरीण सर्व्हिस (MONTHLY maid service)`
};

// --- Maid Flow Messages ---
const workTypeMessage = {
  en: `What type of work do you need help with?
1️⃣ Cooking
2️⃣ Cleaning
3️⃣ Babysitter
4️⃣ Caretaker
5️⃣ Custom (Type what you need)`,
  hi: `आपको किस प्रकार के काम में मदद चाहिए?
1️⃣ कुकिंग (Cooking)
2️⃣ क्लीनिंग (Cleaning)
3️⃣ बेबीसिटर (Babysitter)
4️⃣ केयरटेकर (Caretaker)
5️⃣ कस्टम (अपनी आवश्यकता टाइप करें)`,
  mr: `तुम्हाला कोणत्या प्रकारच्या कामासाठी मदत हवी आहे?
1️⃣ स्वयंपाक (Cooking)
2️⃣ स्वच्छता (Cleaning)
3️⃣ बेबीसिटर (Babysitter)
4️⃣ केअरटेकर (Caretaker)
5️⃣ कस्टम (तुमची आवश्यकता टाइप करा)`
};

const timingMessage = {
  en: `⏰ What timing works best for you?
1️⃣ 1 hr
2️⃣ 8 hr
3️⃣ 10 hr
4️⃣ 24 hr`,
  hi: `⏰ आपके लिए कौन सा समय सबसे अच्छा रहेगा?
1️⃣ 1 घंटा
2️⃣ 8 घंटे
3️⃣ 10 घंटे
4️⃣ 24 घंटे`,
  mr: `⏰ तुमच्यासाठी कोणती वेळ सर्वात योग्य राहील?
1️⃣ 1 तास
2️⃣ 8 तास
3️⃣ 10 तास
4️⃣ 24 तास`
};

const budgetMessage = {
  en: `💰 What is your monthly budget for the maid's salary?
1️⃣ Based on skill and experience
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000`,
  hi: `💰 मेड के वेतन के लिए आपका मासिक बजट क्या है?
1️⃣ कौशल और अनुभव के आधार पर
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000`,
  mr: `💰 मोलकरीणीच्या पगारासाठी तुमचे मासिक बजेट काय आहे?
1️⃣ कौशल्य आणि अनुभवावर आधारित
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000`
};

const maidCityMessage = {
  en: `🏙️ Please select your city:
1️⃣ Pune
2️⃣ PCMC`,
  hi: `🏙️ कृपया अपने शहर का चयन करें:
1️⃣ पुणे
2️⃣ पिंपरी-चिंचवड़ (PCMC)`,
  mr: `🏙️ कृपया तुमचे शहर निवडा:
1️⃣ पुणे
2️⃣ पिंपरी-चिंचवड (PCMC)`
};

const puneAreas = [
  "Aundh", "Baner", "Bavdhan", "Dhanori", "Hadapsar", "Kalyani Nagar",
  "Kharadi", "Kondhwa", "Koregaon", "Kothrud", "Lohegaon", "Magarpatta",
  "Mundhwa", "NIBM", "Undri", "Viman Nagar", "Vishrantwadi", "Wadgaon Sheri", "Wagholi"
];

// Coordinates for backend logic (not shown to customers)
const puneAreaCoordinates = {
  "Aundh": { lat: 18.5590, lng: 73.8080 },
  "Baner": { lat: 18.5590, lng: 73.7868 },
  "Bavdhan": { lat: 18.5200, lng: 73.7700 },
  "Dhanori": { lat: 18.5900, lng: 73.9100 },
  "Hadapsar": { lat: 18.5018, lng: 73.9252 },
  "Kalyani Nagar": { lat: 18.5461, lng: 73.9010 },
  "Kharadi": { lat: 18.5514, lng: 73.9456 },
  "Kondhwa": { lat: 18.4647, lng: 73.8826 },
  "Koregaon": { lat: 18.5362, lng: 73.8938 },
  "Kothrud": { lat: 18.5074, lng: 73.8076 },
  "Lohegaon": { lat: 18.5986, lng: 73.9196 },
  "Magarpatta": { lat: 18.5133, lng: 73.9302 },
  "Mundhwa": { lat: 18.5280, lng: 73.9220 },
  "NIBM": { lat: 18.4700, lng: 73.8960 },
  "Undri": { lat: 18.4530, lng: 73.8960 },
  "Viman Nagar": { lat: 18.5672, lng: 73.9143 },
  "Vishrantwadi": { lat: 18.5908, lng: 73.8842 },
  "Wadgaon Sheri": { lat: 18.5554, lng: 73.9254 },
  "Wagholi": { lat: 18.5780, lng: 73.9800 }
};

const pcmcAreas = [
  "Akurdi", "Bhosari", "Chinchwad", "Hinjewadi", "Kotewadi", "Nigdi", "Pimpri", "Wakad"
];

const getAreaMessage = (city, lang) => {
  const areas = city === "Pune" ? puneAreas : pcmcAreas;
  let text = "";
  areas.forEach((area, index) => {
    text += `${index + 1}. ${area}\n`;
  });
  text += `\n*👉 Reply with the number of your area.*`;
  
  if (lang === "hi") {
    return `📍 कृपया अपना क्षेत्र चुनें:\n\n${text}`;
  } else if (lang === "mr") {
    return `📍 कृपया तुमचा परिसर निवडा:\n\n${text}`;
  } else {
    return `📍 Please select your area:\n\n${text}`;
  }
};

const glideLinkMessage = `✅ Perfect! Based on your needs, here are our available verified maids:

🔗 ${glideAppUrl}

👆 Tap the link, browse the profiles, and come back here once you've found someone you like!`;

const maidChoiceMessage = `👩 Which maid did you like?

Please type her *Name or ID* exactly as shown in the app.
(Example: Sunita Bai or M001)`;

const collectFlatMessage = `🏠 Great choice!

Please share your *flat number and area/society name* so we can confirm availability near you.
(Example: Flat 4B, Cidco N-6)`;

const collectDateMessage = `📅 When would you like her to start?

Please enter your preferred start date.
(Example: 20 May or 20/05/2025)`;

// --- Cleaning Flow Messages ---

const cleaningServiceMessage = {
  en: `🏠 Which service are you looking for?
1️⃣ Flat Deep Cleaning
2️⃣ Bathroom Cleaning
3️⃣ Mini Service Package
4️⃣ Villa / Bungalow / Row House`,
  hi: `🏠 आप कौन सी सेवा ढूंढ रहे हैं?
1️⃣ फ्लैट डीप क्लीनिंग
2️⃣ बाथरूम क्लीनिंग
3️⃣ मिनी सर्विस पैकेज
4️⃣ विला / बंगला / रो हाउस`,
  mr: `🏠 तुम्ही कोणती सेवा शोधत आहात?
1️⃣ फ्लॅट डीप क्लिनिंग
2️⃣ बाथरूम क्लिनिंग
3️⃣ मिनी सर्व्हिस पॅकेज
4️⃣ व्हिला / बंगला / रो हाऊस`
};

const flatStatusMessage = {
  en: `🏠 Is the flat:
1️⃣ Furnished
2️⃣ Empty / Vacant
3️⃣ Post Interior Cleaning`,
  hi: `🏠 क्या फ्लैट:
1️⃣ फर्निश्ड है
2️⃣ खाली है
3️⃣ इंटीरियर के बाद की सफाई`,
  mr: `🏠 फ्लॅट कसा आहे:
1️⃣ फर्निश्ड
2️⃣ रिकामा
3️⃣ इंटिरिअर नंतरची स्वच्छता`
};

const furnishedSubMessage = {
  en: `🏠 What is the current condition of the flat?
1️⃣ Regular Occupied House
2️⃣ Move Out Cleaning
3️⃣ New Flat Possession`,
  hi: `🏠 फ्लैट की वर्तमान स्थिति क्या है?
1️⃣ नियमित रहने वाला घर
2️⃣ घर खाली करते समय की सफाई
3️⃣ नए फ्लैट का कब्ज़ा`,
  mr: `🏠 फ्लॅटची सध्याची स्थिती काय आहे?
1️⃣ नियमित राहते घर
2️⃣ घर सोडतानाची स्वच्छता
3️⃣ नवीन फ्लॅटचा ताबा`
};

const emptySubMessage = {
  en: `🏠 What is the current condition of the flat?
1️⃣ Move Out Cleaning
2️⃣ New Flat Possession`,
  hi: `🏠 फ्लैट की वर्तमान स्थिति क्या है?
1️⃣ घर खाली करते समय की सफाई
2️⃣ नए फ्लैट का कब्ज़ा`,
  mr: `🏠 फ्लॅटची सध्याची स्थिती काय आहे?
1️⃣ घर सोडतानाची स्वच्छता
2️⃣ नवीन फ्लॅटचा ताबा`
};

const flatBhkMessage = {
  en: `🏠 How many BHK is your flat?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / Villa`,
  hi: `🏠 आपका फ्लैट कितने BHK का है?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / विला`,
  mr: `🏠 तुमचा फ्लॅट किती BHK चा आहे?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / व्हिला`
};

const villaStatusMessage = {
  en: `🏠 What is the current condition of the house?
1️⃣ Regular Occupied House
2️⃣ Post Interior / Renovation`,
  hi: `🏠 घर की वर्तमान स्थिति क्या है?
1️⃣ नियमित रहने वाला घर
2️⃣ इंटीरियर के बाद / नवीनीकरण (Renovation)`,
  mr: `🏠 घराची सध्याची स्थिती काय आहे?
1️⃣ नियमित राहते घर
2️⃣ इंटिरिअर नंतर / नूतनीकरण (Renovation)`
};

const villaSqftMessage = {
  en: `📐 Please enter the total built-up area of your house in Square Feet.
(Example: 1500)`,
  hi: `📐 कृपया अपने घर का कुल बिल्ट-अप क्षेत्र स्क्वायर फीट में दर्ज करें।
(उदाहरण: 1500)`,
  mr: `📐 कृपया तुमच्या घराचे एकूण क्षेत्रफळ स्क्वेअर फूट मध्ये प्रविष्ट करा.
(उदाहरण: 1500)`
};

const villaPriceMessage = (sqft, price, lang) => {
  const en = `💰 Estimated Pricing:
✔ Size: ${sqft} Sq.Ft
✔ Estimated Cost: ₹${price}

If you want to proceed with booking
Reply *1* to continue`;

  const hi = `💰 अनुमानित मूल्य:
✔ आकार: ${sqft} वर्ग फुट (Sq.Ft)
✔ अनुमानित लागत: ₹${price}

अगर आप बुकिंग के साथ आगे बढ़ना चाहते हैं
तो *1* रिप्लाई करें`;

  const mr = `💰 अंदाजित किंमत:
✔ आकार: ${sqft} चौरस फूट (Sq.Ft)
✔ अंदाजित किंमत: ₹${price}

तुम्हाला बुकिंग करायची असल्यास
पुढे जाण्यासाठी *1* रिप्लाय करा`;

  return lang === 'hi' ? hi : lang === 'mr' ? mr : en;
};

const flatDeepCleaningPriceMessage = (status, bhk, lang) => {
  let price = "";
  if (status === "Furnished") {
    if (bhk === "1") price = "₹3199";
    else if (bhk === "2") price = "₹3,599";
    else if (bhk === "3") price = "₹4,799";
  } else if (status === "Empty / Vacant") {
    if (bhk === "1") price = "₹2999";
    else if (bhk === "2") price = "₹3,499";
    else if (bhk === "3") price = "₹4,499";
  } else if (status === "Post Interior Cleaning") {
    if (bhk === "1") price = "₹5999";
    else if (bhk === "2") price = "₹6,999";
    else if (bhk === "3") price = "₹7,999";
  }

  let priceTextEn = bhk === "4" ? "Inspection Required" : price;
  let priceTextHi = bhk === "4" ? "निरीक्षण (Inspection) आवश्यक है" : price;
  let priceTextMr = bhk === "4" ? "पाहणी (Inspection) आवश्यक" : price;

  let noteEn = bhk === "1" ? "\nNote: This price includes all scope of work." : "";
  let noteHi = bhk === "1" ? "\nनोट: इस कीमत में सभी कार्य शामिल हैं।" : "";
  let noteMr = bhk === "1" ? "\nनोंद: या किंमतीत सर्व कामांचा समावेश आहे." : "";

  let addOnsEn = "";
  let addOnsHi = "";
  let addOnsMr = "";

  if (status === "Furnished" || status === "Post Interior Cleaning") {
    addOnsEn = `\n\n✨ *Recommended Add-ons:*\n• Kitchen external cleaning: ₹450\n• Sofa cleaning: ₹150 / seat\n\n👉 Type any add-ons you need, OR reply *1* to continue without add-ons.`;
    addOnsHi = `\n\n✨ *अनुशंसित ऐड-ऑन:*\n• किचन की बाहरी सफाई: ₹450\n• सोफा सफाई: ₹150 / सीट\n\n👉 अपने आवश्यक ऐड-ऑन टाइप करें, या बिना ऐड-ऑन के आगे बढ़ने के लिए *1* रिप्लाई करें।`;
    addOnsMr = `\n\n✨ *सुचविलेले ॲड-ऑन्स:*\n• किचनची बाह्य स्वच्छता: ₹450\n• सोफा स्वच्छता: ₹150 / सीट\n\n👉 तुम्हाला हवे असलेले ॲड-ऑन्स टाइप करा, किंवा ॲड-ऑन्सशिवाय पुढे जाण्यासाठी *1* रिप्लाय करा.`;
  } else {
    addOnsEn = `\n\nIf you want to proceed with booking\nReply *1* to continue`;
    addOnsHi = `\n\nअगर आप बुकिंग के साथ आगे बढ़ना चाहते हैं\nतो *1* रिप्लाई करें`;
    addOnsMr = `\n\nतुम्हाला बुकिंग करायची असल्यास\nपुढे जाण्यासाठी *1* रिप्लाय करा`;
  }

  const en = `💰 Estimated Pricing:
✔ ${bhk === "4" ? "4 BHK/Villa" : bhk + " BHK"} → ${priceTextEn}
${noteEn}${addOnsEn}`;

  const hi = `💰 अनुमानित मूल्य:
✔ ${bhk === "4" ? "4 BHK/विला" : bhk + " BHK"} → ${priceTextHi}
${noteHi}${addOnsHi}`;

  const mr = `💰 अंदाजित किंमत:
✔ ${bhk === "4" ? "4 BHK/व्हिला" : bhk + " BHK"} → ${priceTextMr}
${noteMr}${addOnsMr}`;

  return lang === 'hi' ? hi : lang === 'mr' ? mr : en;
};

const bathroomTypeMessage = {
  en: `Please choose an option:
1️⃣ View Subscription Plans
2️⃣ One-Time Deep Cleaning(Rs550/bathroom)`,
  hi: `कृपया एक विकल्प चुनें:
1️⃣ सब्सक्रिप्शन प्लान देखें
2️⃣ वन-टाइम डीप क्लीनिंग (रु 550/बाथरूम)`,
  mr: `कृपया एक पर्याय निवडा:
1️⃣ सबस्क्रिप्शन प्लॅन पहा
2️⃣ वन-टाइम डीप क्लिनिंग (रु 550/बाथरूम)`
};

const bathroomSubscriptionCountMessage = {
  en: `How many bathrooms would you like to include?
1️⃣ 2 Bathrooms
2️⃣ 3 Bathrooms
3️⃣ 4 Bathrooms`,
  hi: `आप कितने बाथरूम शामिल करना चाहेंगे?
1️⃣ 2 बाथरूम
2️⃣ 3 बाथरूम
3️⃣ 4 बाथरूम`,
  mr: `तुम्हाला किती बाथरूम्सचा समावेश करायचा आहे?
1️⃣ 2 बाथरूम्स
2️⃣ 3 बाथरूम्स
3️⃣ 4 बाथरूम्स`
};

const bathroomSubMessage = (count, price, lang) => {
  const en = `✨ 3-Month Bathroom Subscription Plan (${count} Bathrooms)
💵 ₹${price}/month
✅ 3 Visits (1 visit per month for 3 months)
✅ Deep cleaning for bathrooms
✅ Hard-water stain removal treatment
✅ Floor & wall tile deep scrubbing
✅ Fixture & fittings cleaning
✅ Mirror & glass cleaning
📌 Valid for ${count} bathrooms only

Reply:
1️⃣ Continue Booking
2️⃣ Talk to Support`;

  const hi = `✨ 3-महीने का बाथरूम सब्सक्रिप्शन प्लान (${count} बाथरूम)
💵 ₹${price}/महीना
✅ 3 विज़िट (3 महीने के लिए प्रति माह 1 विज़िट)
✅ बाथरूम की डीप क्लीनिंग
✅ हार्ड-वाटर स्टेन रिमूवल ट्रीटमेंट
✅ फर्श और दीवार की टाइलों की डीप स्क्रबिंग
✅ फिक्स्चर और फिटिंग की सफाई
✅ शीशे और ग्लास की सफाई
📌 केवल ${count} बाथरूम के लिए वैध

रिप्लाई करें:
1️⃣ बुकिंग जारी रखें
2️⃣ सपोर्ट से बात करें`;

  const mr = `✨ 3-महिन्यांचा बाथरूम सबस्क्रिप्शन प्लॅन (${count} बाथरूम्स)
💵 ₹${price}/महिना
✅ 3 भेटी (3 महिन्यांसाठी दरमहा 1 भेट)
✅ बाथरूम्सची डीप क्लिनिंग
✅ हार्ड-वॉटर स्टेन रिमूव्हल ट्रीटमेंट
✅ फ्लोअर आणि वॉल टाईल्स डीप स्क्रबिंग
✅ फिक्स्चर आणि फिटिंग्ज क्लिनिंग
✅ आरसा आणि काच क्लिनिंग
📌 केवळ ${count} बाथरूम्ससाठी वैध

रिप्लाय करा:
1️⃣ बुकिंग सुरू ठेवा
2️⃣ सपोर्टशी बोला`;

  return lang === 'hi' ? hi : lang === 'mr' ? mr : en;
};

const bathroomOneTimeCountMessage = {
  en: `🧼 One-Time Bathroom Deep Cleaning
Please select:
1️⃣ 1 Bathroom
2️⃣ 2 Bathrooms
3️⃣ 3 Bathrooms
4️⃣ 4+ Bathrooms`,
  hi: `🧼 वन-टाइम बाथरूम डीप क्लीनिंग
कृपया चुनें:
1️⃣ 1 बाथरूम
2️⃣ 2 बाथरूम
3️⃣ 3 बाथरूम
4️⃣ 4+ बाथरूम`,
  mr: `🧼 वन-टाइम बाथरूम डीप क्लिनिंग
कृपया निवडा:
1️⃣ 1 बाथरूम
2️⃣ 2 बाथरूम्स
3️⃣ 3 बाथरूम्स
4️⃣ 4+ बाथरूम्स`
};

const bathroomOneTimePriceMessage = (count, lang) => {
  let price = "";
  if (count === "1") price = "Rs 550";
  else if (count === "2") price = "Rs 1100";
  else if (count === "3") price = "Rs 1650";
  else if (count === "4") price = "Rs 2200";

  const en = `✨ Deep Cleaning Includes:
✅ Machine Scrubbing
✅ Hard Water Stain Removal
✅ Tile Deep Cleaning
✅ WC cleaning
✅ Wash Basin Cleaning
✅ Mirror Cleaning

💵 Estimated Cost: ${price}

Reply 1 to Continue Booking
Reply 2 to Talk to Support`;

  const hi = `✨ डीप क्लीनिंग में शामिल है:
✅ मशीन स्क्रबिंग
✅ हार्ड वॉटर स्टेन रिमूवल
✅ टाइल डीप क्लीनिंग
✅ WC क्लीनिंग
✅ वॉश बेसिन क्लीनिंग
✅ मिरर क्लीनिंग

💵 अनुमानित लागत: ${price}

बुकिंग जारी रखने के लिए 1 रिप्लाई करें
सपोर्ट से बात करने के लिए 2 रिप्लाई करें`;

  const mr = `✨ डीप क्लिनिंगमध्ये समाविष्ट आहे:
✅ मशीन स्क्रबिंग
✅ हार्ड वॉटर स्टेन रिमूव्हल
✅ टाईल डीप क्लिनिंग
✅ WC क्लिनिंग
✅ वॉश बेसिन क्लिनिंग
✅ मिरर क्लिनिंग

💵 अंदाजित किंमत: ${price}

बुकिंग सुरू ठेवण्यासाठी 1 रिप्लाय करा
सपोर्टशी बोलण्यासाठी 2 रिप्लाय करा`;

  return lang === 'hi' ? hi : lang === 'mr' ? mr : en;
};

const miniServiceMessage = {
  en: `🧹 *MINI SERVICES & ADD-ONS*
⚠️ *Note: Minimum order value is ₹2000*

🍳 *Kitchen*
• Full Kitchen Deep Clean: ₹2400
• Kitchen Clean (Utensils removed): ₹1500
• Single Door Fridge: ₹300
• Double Door Fridge: ₹400
• Chimney Deep Clean: ₹400

🛁 *Bathroom & Rooms*
• Bathroom Deep Clean: ₹550/bath
• Ceiling Fan Clean: ₹50/fan
• Wall Wet Wiping: ₹500/room
• Window Cleaning: ₹300/window

🛋️ *Furniture & Balcony*
• Sofa & Chairs: ₹150/seat
• Balcony (< 25 sq.ft): ₹400
• Balcony (> 25 sq.ft): ₹650
• Carpet (< 30 sq.ft): ₹500
• Carpet (30-100 sq.ft): ₹750
• Single Bed Mattress: ₹400
• Double Bed Mattress: ₹700

👉 Please type the services and quantities you need.
(Example: 2 Bathrooms, 1 Single Fridge, 3 Fans)`,

  hi: `🧹 *मिनी सर्विसेस (Mini Services)*
⚠️ *नोट: न्यूनतम ऑर्डर मूल्य ₹2000 है*

🍳 *रसोई (Kitchen)*
• फुल किचन डीप क्लीन: ₹2400
• किचन क्लीन (बर्तन हटाकर): ₹1500
• सिंगल डोर फ्रिज: ₹300
• डबल डोर फ्रिज: ₹400
• चिमनी डीप क्लीन: ₹400

🛁 *बाथरूम और कमरे (Bathroom & Rooms)*
• बाथरूम डीप क्लीन: ₹550/बाथरूम
• सीलिंग फैन क्लीन: ₹50/पंखे
• दीवारों की गीली सफाई: ₹500/कमरा
• खिड़की की सफाई: ₹300/खिड़की

🛋️ *फर्नीचर और बालकनी (Furniture & Balcony)*
• सोफा और कुर्सियां: ₹150/सीट
• बालकनी (< 25 वर्ग फुट): ₹400
• बालकनी (> 25 वर्ग फुट): ₹650
• कालीन (Carpet < 30 वर्ग फुट): ₹500
• कालीन (Carpet 30-100 वर्ग फुट): ₹750
• सिंगल बेड गद्दा (Mattress): ₹400
• डबल बेड गद्दा: ₹700

👉 कृपया उन सेवाओं और मात्राओं को टाइप करें जिनकी आपको आवश्यकता है।
(उदाहरण: 2 बाथरूम, 1 सिंगल फ्रिज, 3 पंखे)`,

  mr: `🧹 *मिनी सर्व्हिसेस (Mini Services)*
⚠️ *नोंद: किमान ऑर्डर मूल्य ₹2000 आहे*

🍳 *स्वयंपाकघर (Kitchen)*
• फुल किचन डीप क्लिनिंग: ₹2400
• किचन क्लिनिंग (भांडी हटवून): ₹1500
• सिंगल डोअर फ्रिज: ₹300
• डबल डोअर फ्रिज: ₹400
• चिमणी डीप क्लिनिंग: ₹400

🛁 *बाथरूम आणि खोल्या (Bathroom & Rooms)*
• बाथरूम डीप क्लिनिंग: ₹550/बाथरूम
• सिलिंग फॅन क्लिनिंग: ₹50/फॅन
• भिंती पुसणे: ₹500/खोली
• खिडकीची स्वच्छता: ₹300/खिडकी

🛋️ *फर्निचर आणि बाल्कनी (Furniture & Balcony)*
• सोफा आणि खुर्च्या: ₹150/सीट
• बाल्कनी (< 25 चौ. फूट): ₹400
• बाल्कनी (> 25 चौ. फूट): ₹650
• कार्पेट (Carpet < 30 चौ. फूट): ₹500
• कार्पेट (Carpet 30-100 चौ. फूट): ₹750
• सिंगल बेड मॅट्रेस (Mattress): ₹400
• डबल बेड मॅट्रेस: ₹700

👉 कृपया तुम्हाला आवश्यक असलेल्या सेवा आणि प्रमाण टाइप करा.
(उदाहरण: 2 बाथरूम्स, 1 सिंगल फ्रिज, 3 फॅन)`
};

const cleaningLocationMessage = {
  en: `📍 Please share your location or society name.
(Example: Kharadi, Magarpatta, Wakad)`,
  hi: `📍 कृपया अपना स्थान या सोसायटी का नाम साझा करें।
(उदाहरण: खराड़ी, मगरपट्टा, वाकड)`,
  mr: `📍 कृपया तुमचे ठिकाण किंवा सोसायटीचे नाव शेअर करा.
(उदाहरण: खराडी, मगरपट्टा, वाकड)`
};

const cleaningDateMessage = {
  en: `📅 When do you need the service?
1️⃣ Today
2️⃣ Tomorrow
3️⃣ Select Date`,
  hi: `📅 आपको सेवा कब चाहिए?
1️⃣ आज
2️⃣ कल
3️⃣ तारीख चुनें`,
  mr: `📅 तुम्हाला सेवा कधी हवी आहे?
1️⃣ आज
2️⃣ उद्या
3️⃣ तारीख निवडा`
};

const cleaningCustomDateMessage = {
  en: `Please type the date you need the service. (e.g., 25th May)`,
  hi: `कृपया वह तारीख टाइप करें जब आपको सेवा चाहिए। (उदा. 25 मई)`,
  mr: `कृपया तुम्हाला सेवा हवी असलेली तारीख टाईप करा. (उदा. २५ मे)`
};

const cleaningThanksMessage = {
  en: `✅ Thank you!
Our team will check and share Available slots
You will receive a call shortly. 📞`,
  hi: `✅ धन्यवाद!
हमारी टीम उपलब्ध स्लॉट की जांच करेगी और साझा करेगी
आपको जल्द ही एक कॉल प्राप्त होगी। 📞`,
  mr: `✅ धन्यवाद!
आमची टीम उपलब्ध स्लॉट्स तपासेल आणि शेअर करेल
तुम्हाला लवकरच एक कॉल येईल. 📞`
};

const supportMessage = {
  en: `📞 You can talk to our support team at ${contactNumber}.`,
  hi: `📞 आप हमारी सपोर्ट टीम से ${contactNumber} पर बात कर सकते हैं।`,
  mr: `📞 तुम्ही आमच्या सपोर्ट टीमशी ${contactNumber} वर बोलू शकता.`
};


// ─── Formatting Functions ──────────────────────────────────────

function confirmMessage(data) {
  const address = data.maidCity && data.maidArea ? `${data.flat}, ${data.maidArea}, ${data.maidCity}` : data.flat;
  return `📋 *Booking Summary*

👤 Name       : ${data.contactName}
🧹 Work Type  : ${data.workType}
⏰ Timing     : ${data.timing}
💰 Budget     : ${data.budget}
👩 Maid Chosen: ${data.maidChoice}
🏠 Address    : ${address}
📅 Start Date : ${data.startDate}

Reply *1* to Confirm ✅
Reply *2* to Cancel ❌`;
}

function bookingConfirmation(data) {
  return `✅ *Booking Confirmed!*

Hi ${data.customerName}, your booking details:

👩 Maid      : ${data.maidName}
🧹 Work      : ${data.workType}
⏰ Timing    : ${data.timing}
📅 Start Date: ${data.startDate}
🏠 Address   : ${data.flat}

We will contact you shortly to introduce the maid.

Questions? Reply here anytime! 🙏
— ${businessName}`;
}

function adminBookingAlert(data) {
  return `🔔 *NEW BOOKING — Maid Service*

👤 Customer : ${data.customerName}
📞 WhatsApp : ${data.phone}
🏠 Address  : ${data.flat}
👩 Maid     : ${data.maidChoice}
🧹 Work     : ${data.workType}
⏰ Timing   : ${data.timing}
📅 Start    : ${data.startDate}

➡️ Confirm maid and call customer within 2 hrs.`;
}

function adminCleaningAlert(data) {
  return `🔔 *NEW LEAD/BOOKING — Cleaning Service*

👤 Customer : ${data.contactName}
📞 WhatsApp : ${data.whatsappNumber}
🧹 Service  : ${data.cleaningServiceType || 'N/A'}
ℹ️ Details  : ${data.cleaningDetails || 'N/A'}
💰 Est Price: ${data.cleaningPrice || 'N/A'}
🏠 Location : ${data.cleaningLocation || 'N/A'}
📅 Date     : ${data.cleaningDate || 'N/A'}

➡️ Please confirm slots with the customer.`;
}

const cleaningConfirmMessage = (data, lang) => {
  const priceDisplay = data.cleaningPrice ? `\n💰 Est. Price : ${data.cleaningPrice}` : "";

  const en = `📋 *Cleaning Booking Summary*
👤 Name       : ${data.contactName}
🧹 Service    : ${data.cleaningServiceType}
ℹ️ Details    : ${data.cleaningDetails}
🏠 Location   : ${data.cleaningLocation}
📅 Date       : ${data.cleaningDate}${priceDisplay}

Reply *1* to Confirm ✅
Reply *2* to Cancel ❌`;

  const hi = `📋 *क्लीनिंग बुकिंग सारांश*
👤 नाम       : ${data.contactName}
🧹 सेवा       : ${data.cleaningServiceType}
ℹ️ विवरण      : ${data.cleaningDetails}
🏠 स्थान      : ${data.cleaningLocation}
📅 तारीख     : ${data.cleaningDate}${priceDisplay}

पुष्टि करने के लिए *1* रिप्लाई करें ✅
रद्द करने के लिए *2* रिप्लाई करें ❌`;

  const mr = `📋 *क्लिनिंग बुकिंग सारांश*
👤 नाव       : ${data.contactName}
🧹 सेवा       : ${data.cleaningServiceType}
ℹ️ तपशील     : ${data.cleaningDetails}
🏠 ठिकाण      : ${data.cleaningLocation}
📅 तारीख     : ${data.cleaningDate}${priceDisplay}

पुष्टी करण्यासाठी *1* रिप्लाय करा ✅
रद्द करण्यासाठी *2* रिप्लाय करा ❌`;

  return lang === 'hi' ? hi : lang === 'mr' ? mr : en;
};

const cancelMessage = "❌ Booking cancelled. No worries!\n\nReply *hi* anytime to start again. 😊";

const errorMessage = "⚠️ Something went wrong. Type *hi* to start again.";

// ─── Exports ─────────────────────────────────────────────────
module.exports = {
  businessName,
  ownerWhatsApp,
  glideAppUrl,
  workingHours,
  address,
  contactNumber,
  sessionTimeoutMs,
  workTypes,
  timings,
  budgets,
  langs,
  languageMessage,
  mainMenuMessage,
  workTypeMessage,
  timingMessage,
  budgetMessage,
  glideLinkMessage,
  maidChoiceMessage,
  collectFlatMessage,
  collectDateMessage,
  cleaningServiceMessage,
  villaStatusMessage,
  villaSqftMessage,
  villaPriceMessage,
  maidCityMessage,
  puneAreas,
  puneAreaCoordinates,
  pcmcAreas,
  getAreaMessage,
  flatStatusMessage,
  furnishedSubMessage,
  emptySubMessage,
  flatBhkMessage,
  flatDeepCleaningPriceMessage,
  bathroomTypeMessage,
  bathroomSubscriptionCountMessage,
  bathroomSubMessage,
  bathroomOneTimeCountMessage,
  bathroomOneTimePriceMessage,
  miniServiceMessage,
  cleaningLocationMessage,
  cleaningDateMessage,
  cleaningCustomDateMessage,
  cleaningThanksMessage,
  supportMessage,
  confirmMessage,
  cleaningConfirmMessage,
  bookingConfirmation,
  adminBookingAlert,
  adminCleaningAlert,
  cancelMessage,
  errorMessage,
};
