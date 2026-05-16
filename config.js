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
- Which service are you looking for?
1. HOME deep cleaning service
2. MONTHLY maid service`,
  hi: `Main Menu
Aapko kaun si service chahiye?
1. HOME deep cleaning service
2. MONTHLY maid service`,
  mr: `Main Menu
Tumhala koni service pahije?
1. HOME deep cleaning service
2. MONTHLY maid service`
};

// --- Maid Flow Messages ---
const workTypeMessage = {
  en: `What type of work do you need help with?
1️⃣ Cooking
2️⃣ Cleaning
3️⃣ Babysitter
4️⃣ Caretaker
5️⃣ Custom (Type what you need)`,
  hi: `Kis type ka kaam chahiye?
1️⃣ Cooking
2️⃣ Cleaning
3️⃣ Babysitter
4️⃣ Caretaker
5️⃣ Custom (apni zarurat type karo)`,
  mr: `Konta type cha kaam pahije?
1️⃣ Cooking
2️⃣ Cleaning
3️⃣ Babysitter
4️⃣ Caretaker
5️⃣ Custom (tumchi zarurat type kara)`
};

const timingMessage = {
  en: `⏰ What timing works best for you?
1️⃣ Part Time (1-3 hrs)
2️⃣ Full Time (8 hrs)
3️⃣ Full Time (10 hrs)
4️⃣ Full Time (24 hrs)`,
  hi: `⏰ Timing kaisi chahiye?
1️⃣ Part Time (1-3 hours)
2️⃣ Full Time (8 hours)
3️⃣ Full Time (10 hours)
4️⃣ Full Time (24 hours)`,
  mr: `⏰ Timing kashi pahije?
1️⃣ Part Time (1-3 hours)
2️⃣ Full Time (8 hours)
3️⃣ Full Time (10 hours)
4️⃣ Full Time (24 hours)`
};

const budgetMessage = {
  en: `💰 What is your monthly budget for the maid's salary?
1️⃣ Based on skill and experience
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000 (10+ education + experience)`,
  hi: `💰 Monthly budget kitna hai?
1️⃣ Skill aur experience ke hisab se
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000 (10+ education + experience)`,
  mr: `💰 Monthly budget kiti aahe?
1️⃣ Skill ani experience pramane
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000 (10+ education + experience)`
};

const maidCityMessage = {
  en: `🏙️ Please select your city:
1️⃣ Pune
2️⃣ PCMC`,
  hi: `🏙️ Apna city select karo:
1️⃣ Pune
2️⃣ PCMC`,
  mr: `🏙️ Tumcha city select kara:
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
    text += `\n*👉 Apne area ka number reply karo.*`;
    return `📍 Apna area select karo:\n\n${text}`;
  } else if (lang === "mr") {
    text += `\n*👉 Tumchya area cha number reply kara.*`;
    return `📍 Tumcha area select kara:\n\n${text}`;
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
  hi: `🏠 Kaun si service chahiye?
1️⃣ Flat Deep Cleaning
2️⃣ Bathroom Cleaning
3️⃣ Mini Service Package
4️⃣ Villa / Bungalow / Row House`,
  mr: `🏠 Koni service pahije?
1️⃣ Flat Deep Cleaning
2️⃣ Bathroom Cleaning
3️⃣ Mini Service Package
4️⃣ Villa / Bungalow / Row House`
};

const flatStatusMessage = {
  en: `🏠 Is the flat:
1️⃣ Furnished
2️⃣ Empty / Vacant
3️⃣ Post Interior Cleaning`,
  hi: `🏠 Flat kaisa hai?
1️⃣ Furnished
2️⃣ Empty / Vacant
3️⃣ Post Interior Cleaning`,
  mr: `🏠 Flat kasa aahe?
1️⃣ Furnished
2️⃣ Empty / Vacant
3️⃣ Post Interior Cleaning`
};

const furnishedSubMessage = {
  en: `🏠 What is the current condition of the flat?
1️⃣ Regular Occupied House
2️⃣ Move Out Cleaning
3️⃣ New Flat Possession`,
  hi: `🏠 Flat ki condition kaisi hai?
1️⃣ Regular Occupied House
2️⃣ Move Out Cleaning
3️⃣ New Flat Possession`,
  mr: `🏠 Flat chi condition kashi aahe?
1️⃣ Regular Occupied House
2️⃣ Move Out Cleaning
3️⃣ New Flat Possession`
};

const emptySubMessage = {
  en: `🏠 What is the current condition of the flat?
1️⃣ Move Out Cleaning
2️⃣ New Flat Possession`,
  hi: `🏠 Flat ki condition kaisi hai?
1️⃣ Move Out Cleaning
2️⃣ New Flat Possession`,
  mr: `🏠 Flat chi condition kashi aahe?
1️⃣ Move Out Cleaning
2️⃣ New Flat Possession`
};

const flatBhkMessage = {
  en: `🏠 How many BHK is your flat?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / Villa`,
  hi: `🏠 Flat kitne BHK ka hai?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / Villa`,
  mr: `🏠 Flat kiti BHK cha aahe?
1️⃣ 1 BHK
2️⃣ 2 BHK
3️⃣ 3 BHK
4️⃣ 4 BHK / Villa`
};

const villaStatusMessage = {
  en: `🏠 What is the current condition of the house?
1️⃣ Regular Occupied House (₹6/sq.ft)
2️⃣ Post Interior / Renovation (₹9/sq.ft)`,
  hi: `🏠 Ghar ki condition kaisi hai?
1️⃣ Regular Occupied House (₹6/sq.ft)
2️⃣ Post Interior / Renovation (₹9/sq.ft)`,
  mr: `🏠 Gharachi condition kashi aahe?
1️⃣ Regular Occupied House (₹6/sq.ft)
2️⃣ Post Interior / Renovation (₹9/sq.ft)`
};

const villaSqftMessage = {
  en: `📐 Please enter the total built-up area of your house in Square Feet.
(Example: 1500)`,
  hi: `📐 Ghar ka total area Square Feet mein batao.
(Example: 1500)`,
  mr: `📐 Gharacha total area Square Feet madhe sanga.
(Example: 1500)`
};

const villaPriceMessage = (sqft, price, rate, condition, lang) => {
  const en = `💰 Estimated Pricing:
✔ Size: ${sqft} Sq.Ft
✔ Condition: ${condition}
✔ Rate: ₹${rate}/sq.ft
✔ Total Cost: ₹${price}

👉 Reply *1* to proceed with booking`;

  const hi = `💰 Price:
✔ Size: ${sqft} Sq.Ft
✔ Condition: ${condition}
✔ Rate: ₹${rate}/sq.ft
✔ Total Cost: ₹${price}

👉 Booking ke liye *1* reply karo`;

  const mr = `💰 Price:
✔ Size: ${sqft} Sq.Ft
✔ Condition: ${condition}
✔ Rate: ₹${rate}/sq.ft
✔ Total Cost: ₹${price}

👉 Booking sathi *1* reply kara`;

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
  let priceTextHi = bhk === "4" ? "Inspection chahiye" : price;
  let priceTextMr = bhk === "4" ? "Inspection pahije" : price;

  let noteEn = bhk === "1" ? "\nNote: This price includes all scope of work." : "";
  let noteHi = bhk === "1" ? "\nNote: Is price mein sab kaam included hai." : "";
  let noteMr = bhk === "1" ? "\nNote: Ya price madhe sagla kaam included aahe." : "";

  let addOnsEn = "";
  let addOnsHi = "";
  let addOnsMr = "";

  if (status === "Furnished" || status === "Post Interior Cleaning") {
    addOnsEn = `\n\n✨ *Recommended Add-ons:*\n• Kitchen external cleaning: ₹450\n• Sofa cleaning: ₹150 / seat\n\n👉 Reply *1* to proceed without add-ons.`;
    addOnsHi = `\n\n✨ *Recommended Add-ons:*\n• Kitchen external cleaning: ₹450\n• Sofa cleaning: ₹150 / seat\n\n👉 Bina add-ons ke aage badhne ke liye *1* reply karo.`;
    addOnsMr = `\n\n✨ *Recommended Add-ons:*\n• Kitchen external cleaning: ₹450\n• Sofa cleaning: ₹150 / seat\n\n👉 Add-ons shivay pudhe jaanyasathi *1* reply kara.`;
  } else {
    addOnsEn = `\n\n👉 Reply *1* to proceed with booking`;
    addOnsHi = `\n\n👉 Booking ke liye *1* reply karo`;
    addOnsMr = `\n\n👉 Booking sathi *1* reply kara`;
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
  hi: `Option choose karo:
1️⃣ Subscription Plans dekho
2️⃣ One-Time Deep Cleaning (Rs550/bathroom)`,
  mr: `Option choose kara:
1️⃣ Subscription Plans bagha
2️⃣ One-Time Deep Cleaning (Rs550/bathroom)`
};

const bathroomSubscriptionCountMessage = {
  en: `How many bathrooms would you like to include?
1️⃣ 2 Bathrooms
2️⃣ 3 Bathrooms
3️⃣ 4 Bathrooms`,
  hi: `Kitne bathrooms include karne hain?
1️⃣ 2 Bathrooms
2️⃣ 3 Bathrooms
3️⃣ 4 Bathrooms`,
  mr: `Kiti bathrooms include karayche aahet?
1️⃣ 2 Bathrooms
2️⃣ 3 Bathrooms
3️⃣ 4 Bathrooms`
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

  const hi = `✨ 3-Month Bathroom Subscription Plan (${count} Bathrooms)
💵 ₹${price}/month
✅ 3 Visits (1 visit per month for 3 months)
✅ Deep cleaning for bathrooms
✅ Hard-water stain removal treatment
✅ Floor & wall tile deep scrubbing
✅ Fixture & fittings cleaning
✅ Mirror & glass cleaning
📌 Sirf ${count} bathrooms ke liye valid

Reply karo:
1️⃣ Booking continue karo
2️⃣ Support se baat karo`;

  const mr = `✨ 3-Month Bathroom Subscription Plan (${count} Bathrooms)
💵 ₹${price}/month
✅ 3 Visits (1 visit per month for 3 months)
✅ Deep cleaning for bathrooms
✅ Hard-water stain removal treatment
✅ Floor & wall tile deep scrubbing
✅ Fixture & fittings cleaning
✅ Mirror & glass cleaning
📌 Fakt ${count} bathrooms sathi valid

Reply kara:
1️⃣ Booking continue kara
2️⃣ Support shi bola`;

  return lang === 'hi' ? hi : lang === 'mr' ? mr : en;
};

const bathroomOneTimeCountMessage = {
  en: `🧼 One-Time Bathroom Deep Cleaning
Please select:
1️⃣ 1 Bathroom
2️⃣ 2 Bathrooms
3️⃣ 3 Bathrooms
4️⃣ 4+ Bathrooms`,
  hi: `🧼 One-Time Bathroom Deep Cleaning
Select karo:
1️⃣ 1 Bathroom
2️⃣ 2 Bathrooms
3️⃣ 3 Bathrooms
4️⃣ 4+ Bathrooms`,
  mr: `🧼 One-Time Bathroom Deep Cleaning
Select kara:
1️⃣ 1 Bathroom
2️⃣ 2 Bathrooms
3️⃣ 3 Bathrooms
4️⃣ 4+ Bathrooms`
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

  const hi = `✨ Deep Cleaning mein included:
✅ Machine Scrubbing
✅ Hard Water Stain Removal
✅ Tile Deep Cleaning
✅ WC cleaning
✅ Wash Basin Cleaning
✅ Mirror Cleaning

💵 Cost: ${price}

Booking continue karne ke liye 1 reply karo
Support ke liye 2 reply karo`;

  const mr = `✨ Deep Cleaning madhe included:
✅ Machine Scrubbing
✅ Hard Water Stain Removal
✅ Tile Deep Cleaning
✅ WC cleaning
✅ Wash Basin Cleaning
✅ Mirror Cleaning

💵 Cost: ${price}

Booking continue karnyasathi 1 reply kara
Support sathi 2 reply kara`;

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

  hi: `🧹 *Mini Services*
⚠️ *Note: Minimum order ₹2000*

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

👉 Service number aur quantity reply karo.
Example: 6-2, 3-1, 7-3
(matlab: 2 Bathrooms, 1 Single Fridge, 3 Fans)

Ya *0* reply karo support ke liye.`,

  mr: `🧹 *Mini Services*
⚠️ *Note: Minimum order ₹2000*

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

👉 Service number ani quantity reply kara.
Example: 6-2, 3-1, 7-3
(mhanje: 2 Bathrooms, 1 Single Fridge, 3 Fans)

Kiva *0* reply kara support sathi.`
};

const cleaningLocationMessage = {
  en: `📍 Select your city:
1️⃣ Pune
2️⃣ PCMC`,
  hi: `📍 Apna city select karo:
1️⃣ Pune
2️⃣ PCMC`,
  mr: `📍 Tumcha city select kara:
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
    text += `\n*👉 Apne area ka number reply karo.*`;
    return `📍 Apna area select karo:\n\n${text}`;
  } else if (lang === "mr") {
    text += `\n*👉 Tumchya area cha number reply kara.*`;
    return `📍 Tumcha area select kara:\n\n${text}`;
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
  hi: `📅 Service kab chahiye?
1️⃣ Aaj
2️⃣ Kal
3️⃣ Date select karo`,
  mr: `📅 Service kevha pahije?
1️⃣ Aaj
2️⃣ Udya
3️⃣ Date select kara`
};

const cleaningCustomDateMessage = {
  en: `Please type the date you need the service. (e.g., 25th May)`,
  hi: `Service ki date type karo. (example: 25th May)`,
  mr: `Service chi date type kara. (example: 25th May)`
};

const cleaningThanksMessage = {
  en: `✅ Thank you!
Our team will check and share Available slots
You will receive a call shortly. 📞`,
  hi: `✅ Thank you!
Hamari team available slots check karke batayegi
Aapko jaldi call aayega. 📞`,
  mr: `✅ Thank you!
Amchi team available slots check karun sangel
Tumhala lavkar call yeil. 📞`
};

const supportMessage = {
  en: `📞 You can talk to our support team at ${contactNumber}.`,
  hi: `📞 Support ke liye call karo: ${contactNumber}`,
  mr: `📞 Support sathi call kara: ${contactNumber}`
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
  hi: `📦 *Apna Plan Choose Karo:*

1️⃣ *Part-Time Standard — ₹6,000*
• One-time placement fee
• Ghar pe maid interview
• Identity & document verification
• Experience aur skill check
• Service agreement help
• 1 month mein 1 free replacement

2️⃣ *Part-Time Verified — ₹12,000*
• One-time placement fee
• Standard Plan ki sab services
• Police verification (records & basic checks)
• Experience aur skill check
• 6 months mein 2 free replacements

3️⃣ *Full-Time Verified — 1 Month Salary*
• One-time fee (1 month salary)
• Standard Plan ki sab services
• Police verification (records & basic checks)
• Experience aur skill check
• 6 months mein 2 free replacements

💡 *Registration Fee:* ₹1,000 (final service fee mein adjust hoga)

📌 *Note:* CLEANLY ek Platinum Company ka brand hai

🔗 More info: cleanly-maid-service.netlify.app

👉 Plan select karne ke liye *1*, *2*, ya *3* reply karo.`,
  mr: `📦 *Tumcha Plan Choose Kara:*

1️⃣ *Part-Time Standard — ₹6,000*
• One-time placement fee
• Ghari maid interview
• Identity & document verification
• Experience ani skill check
• Service agreement help
• 1 month madhe 1 free replacement

2️⃣ *Part-Time Verified — ₹12,000*
• One-time placement fee
• Standard Plan chya sagalya services
• Police verification (records & basic checks)
• Experience ani skill check
• 6 months madhe 2 free replacements

3️⃣ *Full-Time Verified — 1 Month Salary*
• One-time fee (1 month salary)
• Standard Plan chya sagalya services
• Police verification (records & basic checks)
• Experience ani skill check
• 6 months madhe 2 free replacements

💡 *Registration Fee:* ₹1,000 (final service fee madhe adjust hoel)

📌 *Note:* CLEANLY ha Platinum Company cha brand aahe

🔗 More info: cleanly-maid-service.netlify.app

👉 Plan select karnyasathi *1*, *2*, kiva *3* reply kara.`
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
};
