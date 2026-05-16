# Language Order Update

## Change Made

Updated the language selection order to prioritize Marathi over Hindi.

---

## New Language Order

| Option | Language Code | Language Name | Native Name |
|--------|---------------|---------------|-------------|
| **1** | `en` | English | English |
| **2** | `mr` | Marathi | मराठी |
| **3** | `hi` | Hindi | हिंदी |

---

## Updated Welcome Message

```
👋 Welcome to CLEANLY Services
Please choose your preferred language:
1️⃣ English
2️⃣ मराठी
3️⃣ हिंदी
```

---

## Why This Order?

This order makes sense because:
- **English** (1) - Universal language, most common
- **Marathi** (2) - Primary regional language in Pune/PCMC area
- **Hindi** (3) - Secondary language, widely understood

---

## Configuration

### In `config.js`:

```javascript
const langs = {
  "1": "en",    // English
  "2": "mr",    // Marathi (moved up)
  "3": "hi"     // Hindi (moved down)
};

const languageMessage = `👋 Welcome to CLEANLY Services
Please choose your preferred language:
1️⃣ English
2️⃣ मराठी
3️⃣ हिंदी`;
```

---

## User Experience

### Example: Marathi User

```
User: hi

Bot: 👋 Welcome to CLEANLY Services
     Please choose your preferred language:
     1️⃣ English
     2️⃣ मराठी
     3️⃣ हिंदी

User: 2

Bot: मुख्य मेनू
     - तुम्ही कोणती सेवा शोधत आहात?
     1. होम डीप क्लिनिंग सर्व्हिस (HOME deep cleaning service)
     2. मासिक मोलकरीण सर्व्हिस (MONTHLY maid service)
```

---

## Impact

✅ **Better UX for Pune/PCMC users** - Marathi is now option 2  
✅ **Easier to remember** - Local language comes before Hindi  
✅ **No code changes needed** - All translations remain the same  
✅ **Backward compatible** - Existing sessions not affected  

---

## Testing

To test the new order:

1. Start bot: `node index.js`
2. Send "hi"
3. See new order: English, Marathi, Hindi
4. Select "2" for Marathi
5. Verify all messages appear in Marathi

---

## Summary

Language selection order changed from:
- ❌ Old: English → Hindi → Marathi
- ✅ New: English → Marathi → Hindi

This better reflects the primary service area (Pune/PCMC) where Marathi is the dominant regional language! 🎯
