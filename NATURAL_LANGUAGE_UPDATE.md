# Natural Language Update - Hinglish/Marathlish Style

## Problem
Current translations are too formal and pure. People in Pune/Mumbai don't speak like that in daily life.

## Solution
Use natural, conversational language that mixes Hindi/Marathi with English words (the way people actually talk).

---

## Examples of Changes

### ❌ Too Formal (Current)

**Hindi:**
```
मुख्य मेनू
आप कौन सी सेवा ढूंढ रहे हैं?
```

**Marathi:**
```
मुख्य मेनू
तुम्ही कोणती सेवा शोधत आहात?
```

### ✅ Natural (Suggested)

**Hindi (Hinglish):**
```
Main Menu
Aapko kaun si service chahiye?
```

**Marathi (Marathlish):**
```
Main Menu
Tumhala koni service pahije?
```

---

## Complete Updated Messages

### 1. Main Menu

```javascript
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
```

---

### 2. Work Type

```javascript
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
```

---

### 3. Timing

```javascript
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
```

---

### 4. Budget

```javascript
const budgetMessage = {
  en: `💰 What is your monthly budget for the maid's salary?
1️⃣ Based on skill and experience
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000`,
  
  hi: `💰 Monthly budget kitna hai?
1️⃣ Skill aur experience ke hisab se
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000`,
  
  mr: `💰 Monthly budget kiti aahe?
1️⃣ Skill ani experience pramane
2️⃣ ₹4,000 – ₹6,000
3️⃣ ₹6,000 – ₹10,000
4️⃣ ₹10,000 – ₹20,000
5️⃣ ₹20,000 – ₹30,000`
};
```

---

### 5. City Selection

```javascript
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
```

---

### 6. Area Selection

```javascript
const getAreaMessage = (city, lang) => {
  const areas = city === "Pune" ? puneAreas : pcmcAreas;
  let text = "";
  areas.forEach((area, index) => {
    text += `${index + 1}. ${area}\n`;
  });
  text += `\n*👉 Apna area ka number reply karo.*`;
  
  if (lang === "hi") {
    return `📍 Apna area select karo:\n\n${text}`;
  } else if (lang === "mr") {
    return `📍 Tumcha area select kara:\n\n${text}`;
  } else {
    return `📍 Please select your area:\n\n${text}`;
  }
};
```

---

### 7. Cleaning Service

```javascript
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
```

---

### 8. Flat Status

```javascript
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
```

---

### 9. Villa Square Feet

```javascript
const villaSqftMessage = {
  en: `📐 Please enter the total built-up area of your house in Square Feet.
(Example: 1500)`,
  
  hi: `📐 Ghar ka total area Square Feet mein batao.
(Example: 1500)`,
  
  mr: `📐 Gharacha total area Square Feet madhe sanga.
(Example: 1500)`
};
```

---

### 10. Location

```javascript
const cleaningLocationMessage = {
  en: `📍 Please share your location or society name.
(Example: Kharadi, Magarpatta, Wakad)`,
  
  hi: `📍 Apna location ya society name batao.
(Example: Kharadi, Magarpatta, Wakad)`,
  
  mr: `📍 Tumcha location ya society name sanga.
(Example: Kharadi, Magarpatta, Wakad)`
};
```

---

### 11. Date Selection

```javascript
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
```

---

### 12. Support Message

```javascript
const supportMessage = {
  en: `📞 You can talk to our support team at ${contactNumber}.`,
  
  hi: `📞 Support ke liye call karo: ${contactNumber}`,
  
  mr: `📞 Support sathi call kara: ${contactNumber}`
};
```

---

### 13. Thank You (Cleaning)

```javascript
const cleaningThanksMessage = {
  en: `✅ Thank you!
Our team will check and share Available slots
You will receive a call shortly. 📞`,
  
  hi: `✅ Thank you!
Hamari team check karke available slots batayegi
Aapko jaldi call aayega. 📞`,
  
  mr: `✅ Thank you!
Amchi team check karun available slots sangel
Tumhala lavkar call yeil. 📞`
};
```

---

### 14. Maid Results

```javascript
// In flow.js - Maid display message
let resultMsg = session.data.lang === "hi" 
  ? "🌟 Aapke liye best maids:\n\n" 
  : session.data.lang === "mr"
  ? "🌟 Tumchyasathi best maids:\n\n"
  : "🌟 Here are our top picks for you:\n\n";

// After showing maids
resultMsg += session.data.lang === "hi"
  ? "👩 Kaun si maid pasand aayi? Unki *ID* reply karo (example: M123).\n\n0️⃣ Agar koi pasand nahi aayi toh support ke liye 0 dabao."
  : session.data.lang === "mr"
  ? "👩 Koni maid avadli? Tyanchi *ID* reply kara (example: M123).\n\n0️⃣ Jar koni avadli nahi tar support sathi 0 daba."
  : "👩 Which maid did you like? Please reply with their *ID* (e.g., M123).\n\n0️⃣ If you didn't like these, reply with 0 to contact support.";
```

---

## Key Principles

### ✅ DO:
- Use Roman script for Hindi/Marathi (easier to type and read on phones)
- Mix English words naturally (service, cleaning, timing, budget)
- Keep it conversational ("chahiye", "pahije", "karo", "kara")
- Use common words people actually say

### ❌ DON'T:
- Use pure Devanagari script for everything
- Translate technical terms (keep "service", "cleaning", "flat")
- Use formal/literary language
- Over-translate common English words

---

## Comparison Table

| English | ❌ Pure Hindi | ✅ Hinglish | ❌ Pure Marathi | ✅ Marathlish |
|---------|--------------|-------------|----------------|---------------|
| Which service? | आप कौन सी सेवा ढूंढ रहे हैं? | Kaun si service chahiye? | तुम्ही कोणती सेवा शोधत आहात? | Koni service pahije? |
| Your budget? | आपका बजट क्या है? | Budget kitna hai? | तुमचे बजेट काय आहे? | Budget kiti aahe? |
| Select city | शहर का चयन करें | City select karo | शहर निवडा | City select kara |
| Type here | यहाँ टाइप करें | Yahan type karo | येथे टाइप करा | Ikde type kara |

---

## Benefits

✅ **Natural**: How people actually speak in Pune/Mumbai  
✅ **Easy to read**: Roman script is familiar  
✅ **Less intimidating**: Not too formal  
✅ **Faster**: Shorter messages  
✅ **Relatable**: Feels like talking to a friend  
✅ **Modern**: Reflects current urban language  

---

## Implementation

Would you like me to:
1. ✅ Update ALL messages to this natural style?
2. ✅ Keep technical terms in English?
3. ✅ Use Roman script for Hindi/Marathi?

This will make the bot feel much more friendly and approachable! 🎯
