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
  "5": "All Rounder"
};

const timings = {
  "1": "Part Time (1-3 hrs)",
  "2": "Full Time (8 hrs)",
  "3": "Full Time (10 hrs)",
  "4": "Full Time (24 hrs)"
};

const budgets = {
  "1": "Based on skill and experience",
  "2": "₹4,000 – ₹6,000",
  "3": "₹6,000 – ₹10,000",
  "4": "₹10,000 – ₹20,000",
  "5": "₹20,000 – ₹30,000 (10+ education + experience)"
};

const langs = {
  "1": "en",
  "2": "mr",
  "3": "hi"
};

// ─── Message Templates ──────────────────────────────────────

const languageMessage = `👋 Welcome to CLEANLY Services
Please choose your preferred language:
1️⃣ English
2️⃣ मराठी
3️⃣ हिंदी`;

const mainMenuMessage = {
  en: `Main menu
Which service are you looking for?
1️⃣ HOME deep cleaning service
2️⃣ MONTHLY maid service`,
  hi: `मुख्य मेनू
आपको कौन सी सेवा चाहिए?
1️⃣ घर की डीप क्लीनिंग
2️⃣ मंथली मेड सर्विस`,
  mr: `मुख्य मेनू
तुम्हाला कोणती सेवा हवी आहे?
1️⃣ घराची डीप क्लीनिंग
2️⃣ मंथली मेड सर्विस`
};

// --- Maid Flow Messages ---
const workTypeMessage = {
  en: `What type of work do you need help with?
1️⃣ Cooking
2️⃣ Cleaning
3️⃣ Babysitter
4️⃣ Caretaker
5️⃣ All Rounder`,
  hi: `कौन से काम की जरूरत है?
1️⃣ खाना बनाना
2️⃣ सफाई
3️⃣ बच्चों की देखभाल
4️⃣ बुजुर्गों की देखभाल
5️⃣ ऑल राउंडर`,
  mr: `कोणत्या कामाची गरज आहे?
1️⃣ स्वयंपाक
2️⃣ साफसफाई
3️⃣ मुलांची काळजी
4️⃣ वृद्धांची काळजी
5️⃣ ऑल राउंडर`
};

const timingMessage = {
  en: `⏰ What timing works best for you?
1️⃣ Part Time (1-3 hrs)
2️⃣ Full Time (8 hrs)
3️⃣ Full Time (10 hrs)
4️⃣ Full Time (24 hrs)`,
  hi: `⏰ कितने घंटे काम चाहिए?
1️⃣ पार्ट टाइम (1-3 घंटे)
2️⃣ फुल टाइम (8 घंटे)
3️⃣ फुल टाइम (10 घंटे)
4️⃣ फुल टाइम (24 घंटे)`,
  mr: `⏰ किती वेळ काम हवे आहे?
1️⃣ पार्ट टाइम (1-3 तास)
2️⃣ फुल टाइम (8 तास)
3️⃣ फुल टाइम (10 तास)
4️⃣ फुल टाइम (24 तास)`
};

const budgetMessage = {
  en: `💰 What is your monthly budget for the maid's salary?
1️⃣ Based on skill and experience
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000 (10+ education + experience)`,
  hi: `💰 मेड की सैलरी का मंथली बजट क्या है?
1️⃣ स्किल और अनुभव के हिसाब से
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000 (10+ पढ़ाई + अनुभव)`,
  mr: `💰 मेडच्या पगाराचे मंथली बजट किती आहे?
1️⃣ स्किल आणि अनुभवानुसार
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000 (10+ शिक्षण + अनुभव)`
};

const maidCityMessage = {
  en: `🏙️ Please select your city:
1️⃣ Pune
2️⃣ PCMC`,
  hi: `🏙️ अपना शहर चुनें:
1️⃣ Pune
2️⃣ PCMC`,
  mr: `🏙️ तुमचे शहर निवडा:
1️⃣ Pune
2️⃣ PCMC`
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

// Coordinates for backend logic (not shown to customers)
const pcmcAreaCoordinates = {
  "Akurdi": { lat: 18.6486, lng: 73.7677 },
  "Bhosari": { lat: 18.6386, lng: 73.8478 },
  "Chinchwad": { lat: 18.6279, lng: 73.7930 },
  "Hinjewadi": { lat: 18.5912, lng: 73.7389 },
  "Kotewadi": { lat: 18.6100, lng: 73.8050 },
  "Nigdi": { lat: 18.6600, lng: 73.7750 },
  "Pimpri": { lat: 18.6279, lng: 73.8009 },
  "Wakad": { lat: 18.5988, lng: 73.7626 }
};

const getAreaMessage = (city, lang) => {
  const areas = city === "Pune" ? puneAreas : pcmcAreas;
  let text = "";
  areas.forEach((area, index) => {
    text += `${index + 1}. ${area}\n`;
  });
  
  if (lang === "hi") {
    text += `\n*👉 अपने एरिया का नंबर रिप्लाई करें।*`;
    return `📍 अपना एरिया चुनें:\n\n${text}`;
  } else if (lang === "mr") {
    text += `\n*👉 तुमच्या एरियाचा नंबर रिप्लाय करा.*`;
    return `📍 तुमचा एरिया निवडा:\n\n${text}`;
  } else {
    text += `\n*👉 Reply with the number of your area.*`;
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
  hi: `🏠 कौन सी सर्विस चाहिए?
1️⃣ फ्लैट डीप क्लीनिंग
2️⃣ बाथरूम क्लीनिंग
3️⃣ मिनी सर्विस पैकेज
4️⃣ विला / बंगला / रो हाउस`,
  mr: `🏠 कोणती सर्विस हवी आहे?
1️⃣ फ्लॅट डीप क्लीनिंग
2️⃣ बाथरूम क्लीनिंग
3️⃣ मिनी सर्विस पॅकेज
4️⃣ व्हिला / बंगला / रो हाउस`
};

const flatStatusMessage = {
  en: `🏠 Is the flat:
1️⃣ Furnished
2️⃣ Empty / Vacant
3️⃣ Post Interior Cleaning`,
  hi: `🏠 फ्लैट कैसा है?
1️⃣ फर्निश्ड
2️⃣ खाली / वेकेंट
3️⃣ पोस्ट इंटीरियर क्लीनिंग`,
  mr: `🏠 फ्लॅट कसा आहे?
1️⃣ फर्निश्ड
2️⃣ रिकामा / व्हेकंट
3️⃣ पोस्ट इंटीरियर क्लीनिंग`
};

const furnishedSubMessage = {
  en: `🏠 What is the current condition of the flat?
1️⃣ Regular Occupied House
2️⃣ Move Out Cleaning
3️⃣ New Flat Possession`,
  hi: `🏠 फ्लैट की कंडिशन क्या है?
1️⃣ रेगुलर ऑक्युपाइड हाउस
2️⃣ मूव आउट क्लीनिंग
3️⃣ नया फ्लैट पजेशन`,
  mr: `🏠 फ्लॅटची कंडिशन काय आहे?
1️⃣ रेगुलर ऑक्युपाइड हाउस
2️⃣ मूव्ह आउट क्लीनिंग
3️⃣ नवीन फ्लॅट पझेशन`
};

const emptySubMessage = {
  en: `🏠 What is the current condition of the flat?
1️⃣ Move Out Cleaning
2️⃣ New Flat Possession`,
  hi: `🏠 फ्लैट की कंडिशन क्या है?
1️⃣ मूव आउट क्लीनिंग
2️⃣ नया फ्लैट पजेशन`,
  mr: `🏠 फ्लॅटची कंडिशन काय आहे?
1️⃣ मूव्ह आउट क्लीनिंग
2️⃣ नवीन फ्लॅट पझेशन`
};

const flatBhkMessage = {
  en: `🏠 How many BHK is your flat?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / Villa`,
  hi: `🏠 फ्लैट कितने BHK का है?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / विला`,
  mr: `🏠 फ्लॅट किती BHK चा आहे?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / व्हिला`
};

const villaStatusMessage = {
  en: `🏠 What is the current condition of the house?
1️⃣ Regular Occupied House (₹6/sq.ft)
2️⃣ Post Interior / Renovation (₹9/sq.ft)`,
  hi: `🏠 घर की कंडिशन कैसी है?
1️⃣ रेगुलर ऑक्युपाइड हाउस (₹6/sq.ft)
2️⃣ पोस्ट इंटीरियर / रिनोवेशन (₹9/sq.ft)`,
  mr: `🏠 घराची कंडिशन काय आहे?
1️⃣ रेगुलर ऑक्युपाइड हाउस (₹6/sq.ft)
2️⃣ पोस्ट इंटीरियर / रिनोव्हेशन (₹9/sq.ft)`
};

const villaSqftMessage = {
  en: `📐 Please enter the total built-up area of your house in Square Feet.
(Example: 1500)`,
  hi: `📐 घर का कुल एरिया Square Feet में बताएं।
(उदाहरण: 1500)`,
  mr: `📐 घराचे एकूण क्षेत्रफळ Square Feet मध्ये सांगा.
(उदाहरण: 1500)`
};

const villaPriceMessage = (sqft, price, rate, condition, lang) => {
  const en = `💰 Estimated Pricing:
✔ Size: ${sqft} Sq.Ft
✔ Condition: ${condition}
✔ Rate: ₹${rate}/sq.ft
✔ Total Cost: ₹${price}

👉 Reply *1* to proceed with booking`;

  const hi = `💰 अनुमानित किंमत:
✔ साइज: ${sqft} Sq.Ft
✔ कंडिशन: ${condition}
✔ रेट: ₹${rate}/sq.ft
✔ कुल खर्च: ₹${price}

👉 बुकिंग के लिए *1* रिप्लाई करें`;

  const mr = `💰 अंदाजित किंमत:
✔ साइज: ${sqft} Sq.Ft
✔ कंडिशन: ${condition}
✔ रेट: ₹${rate}/sq.ft
✔ एकूण खर्च: ₹${price}

👉 बुकिंगसाठी *1* रिप्लाय करा`;

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
  let priceTextHi = bhk === "4" ? "इंस्पेक्शन जरूरी" : price;
  let priceTextMr = bhk === "4" ? "इन्स्पेक्शन आवश्यक" : price;

  let noteEn = bhk === "1" ? "\nNote: This price includes all scope of work." : "";
  let noteHi = bhk === "1" ? "\nनोट: इस कीमत में सारा काम शामिल है।" : "";
  let noteMr = bhk === "1" ? "\nनोट: या किमतीत सगळे काम समाविष्ट आहे." : "";

  let addOnsEn = "";
  let addOnsHi = "";
  let addOnsMr = "";

  if (status === "Furnished" || status === "Post Interior Cleaning") {
    addOnsEn = `\n\n✨ *Recommended Add-ons:*\n• Kitchen external cleaning: ₹450\n• Sofa cleaning: ₹150 / seat\n\n👉 Reply *1* to proceed without add-ons.`;
    addOnsHi = `\n\n✨ *सुझाए गए ऐड-ऑन:*\n• किचन एक्सटर्नल क्लीनिंग: ₹450\n• सोफा क्लीनिंग: ₹150 / सीट\n\n👉 ऐड-ऑन के बिना आगे बढ़ने के लिए *1* रिप्लाई करें।`;
    addOnsMr = `\n\n✨ *सुचवलेले ऐड-ऑन:*\n• किचन एक्सटर्नल क्लीनिंग: ₹450\n• सोफा क्लीनिंग: ₹150 / सीट\n\n👉 ऐड-ऑनशिवाय पुढे जाण्यासाठी *1* रिप्लाय करा.`;
  } else {
    addOnsEn = `\n\n👉 Reply *1* to proceed with booking`;
    addOnsHi = `\n\n👉 बुकिंग के लिए *1* रिप्लाई करें`;
    addOnsMr = `\n\n👉 बुकिंगसाठी *1* रिप्लाय करा`;
  }

  const en = `💰 Estimated Pricing:
✔ ${bhk === "4" ? "4 BHK/Villa" : bhk + " BHK"} → ${priceTextEn}
${noteEn}${addOnsEn}`;

  const hi = `💰 अनुमानित किंमत:
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
  hi: `एक ऑप्शन चुनें:
1️⃣ सब्सक्रिप्शन प्लान देखें
2️⃣ एक बार की डीप क्लीनिंग (₹550/बाथरूम)`,
  mr: `एक पर्याय निवडा:
1️⃣ सब्सक्रिप्शन प्लान बघा
2️⃣ एक वेळची डीप क्लीनिंग (₹550/बाथरूम)`
};

const bathroomSubscriptionCountMessage = {
  en: `How many bathrooms would you like to include?
1️⃣ 2 Bathrooms
2️⃣ 3 Bathrooms
3️⃣ 4 Bathrooms`,
  hi: `कितने बाथरूम शामिल करने हैं?
1️⃣ 2 बाथरूम
2️⃣ 3 बाथरूम
3️⃣ 4 बाथरूम`,
  mr: `किती बाथरूम समाविष्ट करायचे आहेत?
1️⃣ 2 बाथरूम
2️⃣ 3 बाथरूम
3️⃣ 4 बाथरूम`
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

  const hi = `✨ 3 महीने का बाथरूम सब्सक्रिप्शन प्लान (${count} बाथरूम)
💵 ₹${price}/महीना
✅ 3 विजिट (हर महीने 1 विजिट, 3 महीने)
✅ बाथरूम की डीप क्लीनिंग
✅ हार्ड वाटर स्टेन हटाना
✅ फ्लोर और टाइल्स की गहरी सफाई
✅ फिटिंग्स और फिक्स्चर की सफाई
✅ मिरर और शीशे की सफाई
📌 सिर्फ ${count} बाथरूम के लिए वैलिड

रिप्लाई करें:
1️⃣ बुकिंग जारी रखें
2️⃣ सपोर्ट से बात करें`;

  const mr = `✨ 3 महिन्यांचा बाथरूम सब्सक्रिप्शन प्लान (${count} बाथरूम)
💵 ₹${price}/महिना
✅ 3 व्हिजिट (दर महिन्याला 1 व्हिजिट, 3 महिने)
✅ बाथरूमची डीप क्लीनिंग
✅ हार्ड वॉटर स्टेन काढणे
✅ फ्लोर आणि टाइल्सची खोल साफसफाई
✅ फिटिंग्ज आणि फिक्स्चरची साफसफाई
✅ मिरर आणि काचेची साफसफाई
📌 फक्त ${count} बाथरूमसाठी वैध

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
  hi: `🧼 एक बार की बाथरूम डीप क्लीनिंग
चुनें:
1️⃣ 1 बाथरूम
2️⃣ 2 बाथरूम
3️⃣ 3 बाथरूम
4️⃣ 4+ बाथरूम`,
  mr: `🧼 एक वेळची बाथरूम डीप क्लीनिंग
निवडा:
1️⃣ 1 बाथरूम
2️⃣ 2 बाथरूम
3️⃣ 3 बाथरूम
4️⃣ 4+ बाथरूम`
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
✅ हार्ड वाटर स्टेन हटाना
✅ टाइल डीप क्लीनिंग
✅ WC क्लीनिंग
✅ वॉश बेसिन क्लीनिंग
✅ मिरर क्लीनिंग

💵 अनुमानित खर्च: ${price}

बुकिंग जारी रखने के लिए 1 रिप्लाई करें
सपोर्ट के लिए 2 रिप्लाई करें`;

  const mr = `✨ डीप क्लीनिंगमध्ये समाविष्ट आहे:
✅ मशीन स्क्रबिंग
✅ हार्ड वॉटर स्टेन काढणे
✅ टाइल डीप क्लीनिंग
✅ WC क्लीनिंग
✅ वॉश बेसिन क्लीनिंग
✅ मिरर क्लीनिंग

💵 अंदाजित खर्च: ${price}

बुकिंग सुरू ठेवण्यासाठी 1 रिप्लाय करा
सपोर्टसाठी 2 रिप्लाय करा`;

  return lang === 'hi' ? hi : lang === 'mr' ? mr : en;
};

const miniServiceItems = {
  "1": { name: "Full Kitchen Deep Clean", price: 2400, category: "Kitchen" },
  "2": { name: "Kitchen Clean (Utensils removed)", price: 1500, category: "Kitchen" },
  "3": { name: "Single Door Fridge", price: 300, category: "Kitchen" },
  "4": { name: "Double Door Fridge", price: 400, category: "Kitchen" },
  "5": { name: "Chimney Deep Clean", price: 400, category: "Kitchen" },
  "6": { name: "Bathroom Deep Clean", price: 550, category: "Bathroom" },
  "7": { name: "Ceiling Fan Clean", price: 50, category: "Room" },
  "8": { name: "Wall Wet Wiping", price: 500, category: "Room" },
  "9": { name: "Window Cleaning", price: 300, category: "Room" },
  "10": { name: "Sofa & Chairs", price: 150, category: "Furniture", unit: "per seat" },
  "11": { name: "Balcony (< 25 sq.ft)", price: 400, category: "Balcony" },
  "12": { name: "Balcony (> 25 sq.ft)", price: 650, category: "Balcony" },
  "13": { name: "Carpet (< 30 sq.ft)", price: 500, category: "Furniture" },
  "14": { name: "Carpet (30-100 sq.ft)", price: 750, category: "Furniture" },
  "15": { name: "Single Bed Mattress", price: 400, category: "Furniture" },
  "16": { name: "Double Bed Mattress", price: 700, category: "Furniture" },
};

const miniServiceMessage = {
  en: `🧹 *MINI SERVICES & ADD-ONS*
⚠️ *Note: Minimum order value is ₹2000*

🍳 *Kitchen*
1️⃣ Full Kitchen Deep Clean - ₹2400
2️⃣ Kitchen Clean (Utensils removed) - ₹1500
3️⃣ Single Door Fridge - ₹300
4️⃣ Double Door Fridge - ₹400
5️⃣ Chimney Deep Clean - ₹400

🛁 *Bathroom & Rooms*
6️⃣ Bathroom Deep Clean - ₹550/bath
7️⃣ Ceiling Fan Clean - ₹50/fan
8️⃣ Wall Wet Wiping - ₹500/room
9️⃣ Window Cleaning - ₹300/window

🛋️ *Furniture & Balcony*
🔟 Sofa & Chairs - ₹150/seat
1️⃣1️⃣ Balcony (< 25 sq.ft) - ₹400
1️⃣2️⃣ Balcony (> 25 sq.ft) - ₹650
1️⃣3️⃣ Carpet (< 30 sq.ft) - ₹500
1️⃣4️⃣ Carpet (30-100 sq.ft) - ₹750
1️⃣5️⃣ Single Bed Mattress - ₹400
1️⃣6️⃣ Double Bed Mattress - ₹700

👉 Reply with service numbers and quantities.
Example: 6-2, 3-1, 7-3
(means: 2 Bathrooms, 1 Single Fridge, 3 Fans)

Or reply *0* to talk to support.`,

  hi: `🧹 *मिनी सर्विसेज़ और ऐड-ऑन*
⚠️ *नोट: न्यूनतम ऑर्डर ₹2000*

🍳 *किचन*
1️⃣ फुल किचन डीप क्लीन - ₹2400
2️⃣ किचन क्लीन (बर्तन हटाकर) - ₹1500
3️⃣ सिंगल डोर फ्रिज - ₹300
4️⃣ डबल डोर फ्रिज - ₹400
5️⃣ चिमनी डीप क्लीन - ₹400

🛁 *बाथरूम और कमरे*
6️⃣ बाथरूम डीप क्लीन - ₹550/बाथरूम
7️⃣ सीलिंग फैन क्लीन - ₹50/फैन
8️⃣ वॉल वेट वाइपिंग - ₹500/कमरा
9️⃣ विंडो क्लीनिंग - ₹300/विंडो

🛋️ *फर्निचर और बालकनी*
🔟 सोफा और चेयर - ₹150/सीट
1️⃣1️⃣ बालकनी (< 25 sq.ft) - ₹400
1️⃣2️⃣ बालकनी (> 25 sq.ft) - ₹650
1️⃣3️⃣ कारपेट (< 30 sq.ft) - ₹500
1️⃣4️⃣ कारपेट (30-100 sq.ft) - ₹750
1️⃣5️⃣ सिंगल बेड मैट्रेस - ₹400
1️⃣6️⃣ डबल बेड मैट्रेस - ₹700

👉 सर्विस नंबर और क्वांटिटी रिप्लाई करें।
उदाहरण: 6-2, 3-1, 7-3
(मतलब: 2 बाथरूम, 1 सिंगल फ्रिज, 3 फैन)

या सपोर्ट के लिए *0* रिप्लाई करें।`,

  mr: `🧹 *मिनी सर्विसेस आणि ऐड-ऑन*
⚠️ *नोट: किमान ऑर्डर ₹2000*

🍳 *किचन*
1️⃣ फुल किचन डीप क्लीन - ₹2400
2️⃣ किचन क्लीन (भांडी काढून) - ₹1500
3️⃣ सिंगल डोर फ्रिज - ₹300
4️⃣ डबल डोर फ्रिज - ₹400
5️⃣ चिमणी डीप क्लीन - ₹400

🛁 *बाथरूम आणि खोल्या*
6️⃣ बाथरूम डीप क्लीन - ₹550/बाथरूम
7️⃣ सीलिंग फॅन क्लीन - ₹50/फॅन
8️⃣ भिंत ओली पुसणे - ₹500/खोली
9️⃣ खिडकी साफसफाई - ₹300/खिडकी

🛋️ *फर्निचर आणि बाल्कनी*
🔟 सोफा आणि खुर्च्या - ₹150/सीट
1️⃣1️⃣ बाल्कनी (< 25 sq.ft) - ₹400
1️⃣2️⃣ बाल्कनी (> 25 sq.ft) - ₹650
1️⃣3️⃣ कार्पेट (< 30 sq.ft) - ₹500
1️⃣4️⃣ कार्पेट (30-100 sq.ft) - ₹750
1️⃣5️⃣ सिंगल बेड मॅट्रेस - ₹400
1️⃣6️⃣ डबल बेड मॅट्रेस - ₹700

👉 सर्विस नंबर आणि प्रमाण रिप्लाय करा.
उदाहरण: 6-2, 3-1, 7-3
(म्हणजे: 2 बाथरूम, 1 सिंगल फ्रिज, 3 फॅन)

किंवा सपोर्टसाठी *0* रिप्लाय करा.`
};

const cleaningLocationMessage = {
  en: `📍 Select your city:
1️⃣ Pune
2️⃣ PCMC`,
  hi: `📍 अपना शहर चुनें:
1️⃣ Pune
2️⃣ PCMC`,
  mr: `📍 तुमचे शहर निवडा:
1️⃣ Pune
2️⃣ PCMC`
};

const getCleaningAreaMessage = (city, lang) => {
  const areas = city === "Pune" ? puneAreas : pcmcAreas;
  let text = "";
  areas.forEach((area, index) => {
    text += `${index + 1}. ${area}\n`;
  });
  
  if (lang === "hi") {
    text += `\n*👉 अपने एरिया का नंबर रिप्लाई करें।*`;
    return `📍 अपना एरिया चुनें:\n\n${text}`;
  } else if (lang === "mr") {
    text += `\n*👉 तुमच्या एरियाचा नंबर रिप्लाय करा.*`;
    return `📍 तुमचा एरिया निवडा:\n\n${text}`;
  } else {
    text += `\n*👉 Reply with the number of your area.*`;
    return `📍 Please select your area:\n\n${text}`;
  }
};

const cleaningDateMessage = {
  en: `📅 When do you need the service?
1️⃣ Today
2️⃣ Tomorrow
3️⃣ Select Date`,
  hi: `📅 सर्विस कब चाहिए?
1️⃣ आज
2️⃣ कल
3️⃣ तारीख चुनें`,
  mr: `📅 सर्विस केव्हा हवी आहे?
1️⃣ आज
2️⃣ उद्या
3️⃣ तारीख निवडा`
};

const cleaningCustomDateMessage = {
  en: `Please type the date you need the service. (e.g., 25th May)`,
  hi: `सर्विस की तारीख टाइप करें। (उदाहरण: 25 मई)`,
  mr: `सर्विसची तारीख टाइप करा. (उदाहरण: 25 मे)`
};

const cleaningThanksMessage = {
  en: `✅ Thank you!
Our team will check and share Available slots
You will receive a call shortly. 📞`,
  hi: `✅ धन्यवाद!
हमारी टीम उपलब्ध स्लॉट चेक करके बताएगी।
आपको जल्द कॉल आएगा। 📞`,
  mr: `✅ धन्यवाद!
आमची टीम उपलब्ध स्लॉट चेक करून सांगेल.
तुम्हाला लवकरच फोन येईल. 📞`
};

const supportMessage = {
  en: `📞 You can talk to our support team at ${contactNumber}.`,
  hi: `📞 सपोर्ट के लिए कॉल करें: ${contactNumber}`,
  mr: `📞 सपोर्टसाठी फोन करा: ${contactNumber}`
};


// --- Maid Plan Selection Messages ---
const maidPlanMessage = {
  en: `📦 *Choose Your Plan:*

1️⃣ *Part-Time Standard — ₹6,000*
• One-time placement fee
• Maid interviews at your home
• Identity & document verification
• Experience and skill screening
• Service agreement assistance
• 1 free replacement within 1 month

2️⃣ *Part-Time Verified — ₹12,000*
• One-time placement fee
• All services in Standard Plan
• Police verification initiated (records & basic checks)
• Experience and skill screening
• 2 free replacements within 6 months

3️⃣ *Full-Time Verified — 1 Month Salary*
• One-time fee (1 month salary)
• All services in Standard Plan
• Police verification initiated (records & basic checks)
• Experience and skill screening
• 2 free replacements within 6 months

💡 *Registration Fee:* ₹1,000 (adjusted in your final service fee)

📌 *Note:* CLEANLY is a brand of Platinum Company

🔗 For more info: cleanly-maid-service.netlify.app

👉 Reply with *1*, *2*, or *3* to select your plan.`,
  hi: `📦 *अपना प्लान चुनें:*

1️⃣ *पार्ट-टाइम स्टैंडर्ड — ₹6,000*
• एक बार की प्लेसमेंट फीस
• घर पर मेड का इंटरव्यू
• आईडी और डॉक्युमेंट वेरिफिकेशन
• अनुभव और स्किल की जांच
• सर्विस एग्रीमेंट में मदद
• 1 महीने में 1 फ्री रिप्लेसमेंट

2️⃣ *पार्ट-टाइम वेरिफाइड — ₹12,000*
• एक बार की प्लेसमेंट फीस
• स्टैंडर्ड प्लान की सभी सेवाएं
• पुलिस वेरिफिकेशन (रिकॉर्ड और बेसिक चेक)
• अनुभव और स्किल की जांच
• 6 महीने में 2 फ्री रिप्लेसमेंट

3️⃣ *फुल-टाइम वेरिफाइड — 1 महीने की सैलरी*
• एक बार की फीस (1 महीने की सैलरी)
• स्टैंडर्ड प्लान की सभी सेवाएं
• पुलिस वेरिफिकेशन (रिकॉर्ड और बेसिक चेक)
• अनुभव और स्किल की जांच
• 6 महीने में 2 फ्री रिप्लेसमेंट

💡 *रजिस्ट्रेशन फीस:* ₹1,000 (फाइनल सर्विस फीस में एडजस्ट होगी)

📌 *नोट:* CLEANLY, Platinum Company का एक ब्रांड है

🔗 ज्यादा जानकारी: cleanly-maid-service.netlify.app

👉 प्लान चुनने के लिए *1*, *2*, या *3* रिप्लाई करें।`,
  mr: `📦 *तुमचा प्लान निवडा:*

1️⃣ *पार्ट-टाइम स्टँडर्ड — ₹6,000*
• एक वेळची प्लेसमेंट फी
• घरी मेडचा इंटरव्ह्यू
• आयडी आणि डॉक्युमेंट व्हेरिफिकेशन
• अनुभव आणि स्किल तपासणी
• सर्विस करार मदत
• 1 महिन्यात 1 फ्री रिप्लेसमेंट

2️⃣ *पार्ट-टाइम व्हेरिफाइड — ₹12,000*
• एक वेळची प्लेसमेंट फी
• स्टँडर्ड प्लानच्या सर्व सेवा
• पोलिस व्हेरिफिकेशन (रेकॉर्ड आणि बेसिक चेक)
• अनुभव आणि स्किल तपासणी
• 6 महिन्यांत 2 फ्री रिप्लेसमेंट

3️⃣ *फुल-टाइम व्हेरिफाइड — 1 महिन्याचा पगार*
• एक वेळची फी (1 महिन्याचा पगार)
• स्टँडर्ड प्लानच्या सर्व सेवा
• पोलिस व्हेरिफिकेशन (रेकॉर्ड आणि बेसिक चेक)
• अनुभव आणि स्किल तपासणी
• 6 महिन्यांत 2 फ्री रिप्लेसमेंट

💡 *रजिस्ट्रेशन फी:* ₹1,000 (फायनल सर्विस फीमध्ये अ‍ॅडजस्ट होईल)

📌 *नोट:* CLEANLY हा Platinum Company चा एक ब्रँड आहे

🔗 अधिक माहिती: cleanly-maid-service.netlify.app

👉 प्लान निवडण्यासाठी *1*, *2*, किंवा *3* रिप्लाय करा.`
};

const maidPlans = {
  "1": "Part-Time Standard (₹6,000)",
  "2": "Part-Time Verified (₹12,000)",
  "3": "Full-Time Verified (1 Month Salary)"
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
📦 Plan       : ${data.selectedPlan || 'N/A'}

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

const adminIntroMessage = `👋 Hi! *CLEANLY Services* offers:

🧹 *Monthly Maid Placement*
Cooking, Cleaning, Babysitting, Caretaking & more

🏠 *Home Deep Cleaning*
Flats, Bathrooms, Villas — Pune & PCMC ✅

Reply *1* to explore our services.`;

const cancelMessage = "❌ Booking cancelled. No worries!\n\nReply *hi* anytime to start again. 😊";

const errorMessage = "⚠️ Something went wrong. Type *hi* to start again.";

// ─── UPI Payment ─────────────────────────────────────────────
const upiId = process.env.UPI_ID || "cleanly@upi";

const paymentMessage = {
  en: `Hello,
Please pay ₹1000 booking amount using the below payment link:

upi://pay?pa=${upiId}&pn=Cleanly&am=1000&cu=INR

After payment kindly share the screenshot for admin to verify.`,

  hi: `नमस्ते,
कृपया नीचे दिए गए पेमेंट लिंक से ₹1000 बुकिंग राशि जमा करें:

upi://pay?pa=${upiId}&pn=Cleanly&am=1000&cu=INR

पेमेंट के बाद एडमिन वेरिफिकेशन के लिए स्क्रीनशॉट भेजें।`,

  mr: `नमस्कार,
कृपया खालील पेमेंट लिंकद्वारे ₹1000 बुकिंग रक्कम भरा:

upi://pay?pa=${upiId}&pn=Cleanly&am=1000&cu=INR

पेमेंटनंतर एडमिन व्हेरिफिकेशनसाठी स्क्रीनशॉट पाठवा.`
};

const receiptReceivedMessage = {
  en: `✅ *Receipt Received!*

Thank you! Our admin will verify your payment and confirm your booking within 2–4 hours.

📞 For urgent queries: ${contactNumber}
— ${businessName}`,

  hi: `✅ *रसीद मिल गई!*

धन्यवाद! हमारी टीम आपका पेमेंट वेरिफाई करके 2–4 घंटों में बुकिंग कन्फर्म करेगी।

📞 जरूरी सवालों के लिए: ${contactNumber}
— ${businessName}`,

  mr: `✅ *पावती मिळाली!*

धन्यवाद! आमची टीम तुमचे पेमेंट व्हेरिफाय करून 2–4 तासांत बुकिंग कन्फर्म करेल.

📞 तातडीच्या प्रश्नांसाठी: ${contactNumber}
— ${businessName}`
};

function adminPaymentAlert(data) {
  return `💰 *PAYMENT RECEIPT — Verify Now*

👤 Customer  : ${data.customerName}
📞 WhatsApp  : ${data.phone}
🔖 Booking ID: ${data.bookingId}
👩 Maid      : ${data.maidChoice}
📝 Receipt   : ${data.receiptNote}

➡️ Verify payment and confirm booking with customer.`;
}

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
  pcmcAreaCoordinates,
  getAreaMessage,
  maidPlanMessage,
  maidPlans,
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
  miniServiceItems,
  miniServiceMessage,
  cleaningLocationMessage,
  getCleaningAreaMessage,
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
  upiId,
  paymentMessage,
  receiptReceivedMessage,
  adminPaymentAlert,
  adminIntroMessage,
};
