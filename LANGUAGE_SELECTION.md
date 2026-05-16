# Language Selection System

## Overview

The chatbot supports **3 languages** with a simple numeric selection system at the start of every conversation.

---

## Supported Languages

| Option | Language Code | Language Name | Native Name |
|--------|---------------|---------------|-------------|
| **1** | `en` | English | English |
| **2** | `hi` | Hindi | हिंदी |
| **3** | `mr` | Marathi | मराठी |

---

## How It Works

### 1. Initial Welcome Message

When a user starts a conversation (by typing "hi", "hello", "hey", "start", "menu", or "help"), they see:

```
👋 Welcome to CLEANLY Services
Please choose your preferred language:
1️⃣ English
2️⃣ हिंदी
3️⃣ मराठी
```

### 2. User Selection

The user replies with a number:
- **1** → English
- **2** → Hindi (हिंदी)
- **3** → Marathi (मराठी)

### 3. Language Storage

The selected language is stored in the user's session:
```javascript
session.data.lang = "en"  // or "hi" or "mr"
```

### 4. All Subsequent Messages

Every message after language selection is displayed in the chosen language.

---

## Configuration

### In `config.js`:

```javascript
const langs = {
  "1": "en",    // English
  "2": "hi",    // Hindi
  "3": "mr"     // Marathi
};

const languageMessage = `👋 Welcome to CLEANLY Services
Please choose your preferred language:
1️⃣ English
2️⃣ हिंदी
3️⃣ मराठी`;
```

---

## Flow Logic

### In `flow.js`:

```javascript
case "LANGUAGE": {
  const lang = config.langs[body];  // Get language code from user input
  if (!lang) return [config.languageMessage];  // Invalid input, ask again
  session.data.lang = lang;  // Store language preference
  session.state = "MAIN_MENU";  // Move to main menu
  return [config.mainMenuMessage[lang]];  // Show menu in selected language
}
```

---

## Message Structure

All messages that need translation are stored as objects with language keys:

```javascript
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
```

### Usage in Code:

```javascript
return [config.mainMenuMessage[session.data.lang]];
```

This automatically returns the message in the user's selected language.

---

## Complete Conversation Examples

### Example 1: English User

```
User: hi

Bot: 👋 Welcome to CLEANLY Services
     Please choose your preferred language:
     1️⃣ English
     2️⃣ हिंदी
     3️⃣ मराठी

User: 1

Bot: Main menu
     - Which service are you looking for?
     1. HOME deep cleaning service
     2. MONTHLY maid service

User: 1

Bot: 🏠 Which service are you looking for?
     1️⃣ Flat Deep Cleaning
     2️⃣ Bathroom Cleaning
     3️⃣ Mini Service Package
     4️⃣ Villa / Bungalow / Row House
```

---

### Example 2: Hindi User

```
User: hello

Bot: 👋 Welcome to CLEANLY Services
     Please choose your preferred language:
     1️⃣ English
     2️⃣ हिंदी
     3️⃣ मराठी

User: 2

Bot: मुख्य मेनू
     - आप कौन सी सेवा ढूंढ रहे हैं?
     1. होम डीप क्लीनिंग सर्विस (HOME deep cleaning service)
     2. मासिक मेड सर्विस (MONTHLY maid service)

User: 1

Bot: 🏠 आप कौन सी सेवा ढूंढ रहे हैं?
     1️⃣ फ्लैट डीप क्लीनिंग
     2️⃣ बाथरूम क्लीनिंग
     3️⃣ मिनी सर्विस पैकेज
     4️⃣ विला / बंगला / रो हाउस
```

---

### Example 3: Marathi User

```
User: start

Bot: 👋 Welcome to CLEANLY Services
     Please choose your preferred language:
     1️⃣ English
     2️⃣ हिंदी
     3️⃣ मराठी

User: 3

Bot: मुख्य मेनू
     - तुम्ही कोणती सेवा शोधत आहात?
     1. होम डीप क्लिनिंग सर्व्हिस (HOME deep cleaning service)
     2. मासिक मोलकरीण सर्व्हिस (MONTHLY maid service)

User: 2

Bot: तुम्हाला कोणत्या प्रकारच्या कामासाठी मदत हवी आहे?
     1️⃣ स्वयंपाक (Cooking)
     2️⃣ स्वच्छता (Cleaning)
     3️⃣ बेबीसिटर (Babysitter)
     4️⃣ केअरटेकर (Caretaker)
     5️⃣ कस्टम (तुमची आवश्यकता टाइप करा)
```

---

## Invalid Input Handling

If the user enters an invalid option:

```
User: hi

Bot: 👋 Welcome to CLEANLY Services
     Please choose your preferred language:
     1️⃣ English
     2️⃣ हिंदी
     3️⃣ मराठी

User: 5

Bot: 👋 Welcome to CLEANLY Services
     Please choose your preferred language:
     1️⃣ English
     2️⃣ हिंदी
     3️⃣ मराठी

User: 1

Bot: Main menu
     - Which service are you looking for?
     1. HOME deep cleaning service
     2. MONTHLY maid service
```

---

## Session Persistence

The language preference is stored for the entire session (15 minutes of inactivity):

```javascript
session.data.lang = "en"  // Stored in memory
```

### Session Timeout:
- **Duration**: 15 minutes of inactivity
- **After timeout**: User must select language again
- **During session**: Language persists across all messages

---

## Restart Behavior

Users can restart the conversation at any time by typing:
- `hi`
- `hello`
- `hey`
- `menu`
- `start`
- `help`

This clears their session and shows the language selection again.

---

## Support Option (Global)

At any point in the conversation, users can press **0** to contact support:

```javascript
if (body === "0") {
  const lang = session.data.lang || "en";
  const msg = config.supportMessage[lang];
  clearSession(senderId);
  return [msg];
}
```

### Support Messages:

**English:**
```
📞 You can talk to our support team at +91 8767572043.
```

**Hindi:**
```
📞 आप हमारी सपोर्ट टीम से +91 8767572043 पर बात कर सकते हैं।
```

**Marathi:**
```
📞 तुम्ही आमच्या सपोर्ट टीमशी +91 8767572043 वर बोलू शकता.
```

---

## All Translated Messages

The following message categories are available in all 3 languages:

### Core Flow:
- ✅ Language selection
- ✅ Main menu
- ✅ Support message
- ✅ Cancel message
- ✅ Error message

### Cleaning Service:
- ✅ Service type selection
- ✅ Flat status options
- ✅ BHK selection
- ✅ Villa condition
- ✅ Villa sqft input
- ✅ Bathroom type
- ✅ Mini services menu
- ✅ Location input
- ✅ Date selection
- ✅ Confirmation message
- ✅ Thank you message

### Maid Service:
- ✅ Work type selection
- ✅ Timing preferences
- ✅ Budget ranges
- ✅ City selection
- ✅ Area selection
- ✅ Maid results display
- ✅ Plan selection
- ✅ Confirmation message
- ✅ Booking confirmation

---

## Adding a New Language

To add a new language (e.g., Gujarati):

### 1. Update `config.js`:

```javascript
const langs = {
  "1": "en",
  "2": "hi",
  "3": "mr",
  "4": "gu"  // Add Gujarati
};

const languageMessage = `👋 Welcome to CLEANLY Services
Please choose your preferred language:
1️⃣ English
2️⃣ हिंदी
3️⃣ मराठી
4️⃣ ગુજરાતી`;  // Add Gujarati option
```

### 2. Add translations to all message objects:

```javascript
const mainMenuMessage = {
  en: `Main menu...`,
  hi: `मुख्य मेनू...`,
  mr: `मुख्य मेनू...`,
  gu: `મુખ્ય મેનુ...`  // Add Gujarati translation
};
```

### 3. Update all message functions:

```javascript
const villaPriceMessage = (sqft, price, rate, condition, lang) => {
  const en = `...`;
  const hi = `...`;
  const mr = `...`;
  const gu = `...`;  // Add Gujarati
  
  return lang === 'hi' ? hi : 
         lang === 'mr' ? mr : 
         lang === 'gu' ? gu : en;
};
```

---

## Technical Details

### Language Code Storage:
```javascript
session.data.lang = "en" | "hi" | "mr"
```

### Default Language:
If no language is selected or session expires, the system defaults to **English** (`en`).

### Message Retrieval:
```javascript
// Static messages
config.mainMenuMessage[session.data.lang]

// Dynamic messages (functions)
config.villaPriceMessage(sqft, price, rate, condition, session.data.lang)
```

---

## Benefits of This System

✅ **Simple**: Just press 1, 2, or 3  
✅ **Clear**: Native script shown for each language  
✅ **Consistent**: All messages translated uniformly  
✅ **Flexible**: Easy to add more languages  
✅ **User-friendly**: No typing required, just numbers  
✅ **Persistent**: Language saved throughout session  
✅ **Restartable**: Can change language by restarting  

---

## Summary

The language selection system:
- Offers **3 languages**: English, Hindi, Marathi
- Uses **numeric selection**: 1, 2, or 3
- Stores preference in **session data**
- Applies to **all subsequent messages**
- Can be **restarted anytime** by typing "hi"
- Defaults to **English** if not selected

This creates a seamless multilingual experience for users across Maharashtra and India! 🌐
