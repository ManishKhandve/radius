# Villa Cleaning Flow Improvement

## Changes Made

Reversed the order of questions for villa/bungalow cleaning to ask for square footage **before** asking about condition. This provides a better user experience.

---

## Why This Change?

### ❌ Old Flow (Confusing)
```
1. Ask: What's the condition? (Regular or Post-Interior)
2. User doesn't know the rate yet
3. Ask: What's the square footage?
4. Calculate and show price
```

**Problem:** User has to commit to a condition without knowing the pricing structure.

### ✅ New Flow (Better UX)
```
1. Ask: What's the square footage?
2. User provides size
3. Ask: What's the condition? (Shows rates: ₹6 or ₹9/sq.ft)
4. Calculate and show detailed breakdown
```

**Benefit:** User sees the rates upfront and can make an informed decision.

---

## Before vs After

### ❌ Before

**Step 1:**
```
🏠 What is the current condition of the house?
1️⃣ Regular Occupied House
2️⃣ Post Interior / Renovation
```
*User doesn't know what the rate difference is*

**Step 2:**
```
📐 Please enter the total built-up area of your house in Square Feet.
(Example: 1500)
```

**Step 3:**
```
💰 Estimated Pricing:
✔ Size: 1500 Sq.Ft
✔ Estimated Cost: ₹9,000

👉 Reply *1* to proceed with booking
```

---

### ✅ After

**Step 1:**
```
📐 Please enter the total built-up area of your house in Square Feet.
(Example: 1500)
```

**Step 2:**
```
🏠 What is the current condition of the house?
1️⃣ Regular Occupied House (₹6/sq.ft)
2️⃣ Post Interior / Renovation (₹9/sq.ft)
```
*User can now see the rate difference and calculate mentally*

**Step 3:**
```
💰 Estimated Pricing:
✔ Size: 1500 Sq.Ft
✔ Condition: Regular Occupied House
✔ Rate: ₹6/sq.ft
✔ Total Cost: ₹9,000

👉 Reply *1* to proceed with booking
```

---

## Complete Flow Examples

### Example 1: Regular Occupied House

```
Bot: 🏠 Which service are you looking for?
     1️⃣ Flat Deep Cleaning
     2️⃣ Bathroom Cleaning
     3️⃣ Mini Service Package
     4️⃣ Villa / Bungalow / Row House

User: 4

Bot: 📐 Please enter the total built-up area of your house in Square Feet.
     (Example: 1500)

User: 2000

Bot: 🏠 What is the current condition of the house?
     1️⃣ Regular Occupied House (₹6/sq.ft)
     2️⃣ Post Interior / Renovation (₹9/sq.ft)

User: 1

Bot: 💰 Estimated Pricing:
     ✔ Size: 2000 Sq.Ft
     ✔ Condition: Regular Occupied House
     ✔ Rate: ₹6/sq.ft
     ✔ Total Cost: ₹12,000
     
     👉 Reply *1* to proceed with booking

User: 1

Bot: 📍 Please share your location or society name.
     (Example: Kharadi, Magarpatta, Wakad)
```

---

### Example 2: Post-Renovation House

```
Bot: 📐 Please enter the total built-up area of your house in Square Feet.
     (Example: 1500)

User: 1800

Bot: 🏠 What is the current condition of the house?
     1️⃣ Regular Occupied House (₹6/sq.ft)
     2️⃣ Post Interior / Renovation (₹9/sq.ft)

User: 2

Bot: 💰 Estimated Pricing:
     ✔ Size: 1800 Sq.Ft
     ✔ Condition: Post Interior / Renovation
     ✔ Rate: ₹9/sq.ft
     ✔ Total Cost: ₹16,200
     
     👉 Reply *1* to proceed with booking
```

---

## Multi-Language Support

### English
```
🏠 What is the current condition of the house?
1️⃣ Regular Occupied House (₹6/sq.ft)
2️⃣ Post Interior / Renovation (₹9/sq.ft)
```

### Hindi
```
🏠 घर की वर्तमान स्थिति क्या है?
1️⃣ नियमित रहने वाला घर (₹6/वर्ग फुट)
2️⃣ इंटीरियर के बाद / नवीनीकरण (₹9/वर्ग फुट)
```

### Marathi
```
🏠 घराची सध्याची स्थिती काय आहे?
1️⃣ नियमित राहते घर (₹6/चौ. फूट)
2️⃣ इंटिरिअर नंतर / नूतनीकरण (₹9/चौ. फूट)
```

---

## Updated Price Breakdown

The final pricing message now shows:

| Field | Description | Example |
|-------|-------------|---------|
| **Size** | Square footage entered | 1500 Sq.Ft |
| **Condition** | Selected condition | Regular Occupied House |
| **Rate** | Per sq.ft rate | ₹6/sq.ft |
| **Total Cost** | Calculated price | ₹9,000 |

### English Example:
```
💰 Estimated Pricing:
✔ Size: 1500 Sq.Ft
✔ Condition: Regular Occupied House
✔ Rate: ₹6/sq.ft
✔ Total Cost: ₹9,000

👉 Reply *1* to proceed with booking
```

### Hindi Example:
```
💰 अनुमानित मूल्य:
✔ आकार: 1500 वर्ग फुट (Sq.Ft)
✔ स्थिति: Regular Occupied House
✔ दर: ₹6/वर्ग फुट
✔ कुल लागत: ₹9,000

👉 बुकिंग के साथ आगे बढ़ने के लिए *1* रिप्लाई करें
```

### Marathi Example:
```
💰 अंदाजित किंमत:
✔ आकार: 1500 चौरस फूट (Sq.Ft)
✔ स्थिती: Regular Occupied House
✔ दर: ₹6/चौ. फूट
✔ एकूण किंमत: ₹9,000

👉 बुकिंग करण्यासाठी *1* रिप्लाय करा
```

---

## State Flow Changes

### Old State Flow:
```
CLEANING_SERVICE_TYPE (select Villa)
         ↓
CLEANING_VILLA_STATUS (select condition)
         ↓
CLEANING_VILLA_SQFT (enter sqft)
         ↓
CLEANING_CONTINUE (show price)
```

### New State Flow:
```
CLEANING_SERVICE_TYPE (select Villa)
         ↓
CLEANING_VILLA_SQFT (enter sqft)
         ↓
CLEANING_VILLA_STATUS (select condition with rates shown)
         ↓
CLEANING_CONTINUE (show detailed price breakdown)
```

---

## Code Changes

### 1. `flow.js` - State Handler Order

**Changed:**
- Villa service now goes to `CLEANING_VILLA_SQFT` first
- `CLEANING_VILLA_SQFT` stores sqft and moves to `CLEANING_VILLA_STATUS`
- `CLEANING_VILLA_STATUS` calculates price and shows breakdown

**Key Logic:**
```javascript
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
```

---

### 2. `config.js` - Message Updates

**Updated `villaStatusMessage`:**
- Now shows rates in the options: `(₹6/sq.ft)` and `(₹9/sq.ft)`
- Available in all 3 languages

**Updated `villaPriceMessage` function:**
- Added parameters: `rate` and `condition`
- Shows detailed breakdown with all 4 fields
- More transparent pricing

---

## Benefits

✅ **Transparent Pricing**: Users see rates before choosing  
✅ **Better Decision Making**: Can calculate mentally before selecting  
✅ **Reduced Confusion**: Clear what each option costs  
✅ **Professional**: Shows detailed breakdown like a quote  
✅ **Consistent**: Matches industry standard (size first, then options)  

---

## Validation

The square footage validation remains:
- Minimum: 100 sq.ft
- Must be a number
- Non-numeric characters are stripped (e.g., "1500 sqft" → 1500)

---

## Testing

To test the new flow:

1. Start bot: `node index.js`
2. Send "hi"
3. Select language: "1" (English)
4. Choose service: "1" (Cleaning)
5. Select service type: "4" (Villa)
6. **Enter sqft**: "1500"
7. **See rates in options** ✅
8. Select condition: "1" (Regular)
9. **See detailed breakdown** ✅
10. Reply "1" to continue
11. Complete booking

---

## Summary

The villa cleaning flow now:
1. ✅ Asks for square footage first
2. ✅ Shows rates when asking about condition
3. ✅ Provides detailed price breakdown
4. ✅ Gives users all information to make informed decisions

This creates a more professional and transparent booking experience! 🎯
