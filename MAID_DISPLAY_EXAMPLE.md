# How Maid Details Are Displayed to Customers

## Overview

When a customer selects their area, the system:
1. **Fetches GPS coordinates** for the selected area
2. **Queries Supabase** for available maids
3. **Calculates distance** using Haversine formula
4. **Categorizes into zones** (P1-P4)
5. **Sorts by proximity** (zone first, then exact distance)
6. **Shows top 3 maids** with detailed information

---

## Display Format (WhatsApp Message)

### English Example:

```
🌟 Here are our top picks for you:

1️⃣ *ID:* M101
👤 *Name:* Sunita Devi
🧹 *Work:* Cooking & Cleaning
✨ *Experience:* 5 years
💰 *Expected Salary:* ₹8,000
📍 *Distance:* 0.8 km (P1 Zone (Green))

2️⃣ *ID:* M205
👤 *Name:* Rekha Bai
🧹 *Work:* Full-time Maid
✨ *Experience:* 3 years
💰 *Expected Salary:* ₹6,500
📍 *Distance:* 2.1 km (P2 Zone (Blue))

3️⃣ *ID:* M312
👤 *Name:* Asha Kamble
🧹 *Work:* Babysitter & Cleaning
✨ *Experience:* 7 years
💰 *Expected Salary:* ₹10,000
📍 *Distance:* 4.5 km (P3 Zone (Orange))

👩 Which maid did you like? Please reply with their *ID* (e.g., M123).

0️⃣ If you didn't like these, reply with 0 to contact support.
```

### Hindi Example:

```
🌟 यहाँ आपके लिए हमारी शीर्ष पसंद हैं:

1️⃣ *ID:* M101
👤 *Name:* सुनीता देवी
🧹 *Work:* कुकिंग और क्लीनिंग
✨ *Experience:* 5 साल
💰 *Expected Salary:* ₹8,000
📍 *Distance:* 0.8 km (P1 Zone (Green))

2️⃣ *ID:* M205
👤 *Name:* रेखा बाई
🧹 *Work:* फुल-टाइम मेड
✨ *Experience:* 3 साल
💰 *Expected Salary:* ₹6,500
📍 *Distance:* 2.1 km (P2 Zone (Blue))

3️⃣ *ID:* M312
👤 *Name:* आशा कांबले
🧹 *Work:* बेबीसिटर और क्लीनिंग
✨ *Experience:* 7 साल
💰 *Expected Salary:* ₹10,000
📍 *Distance:* 4.5 km (P3 Zone (Orange))

👩 आपको कौन सी मेड पसंद आई? कृपया उनकी *ID* के साथ रिप्लाई करें (उदा: M123)।

0️⃣ अगर आपको इनमें से कोई पसंद नहीं है, तो सपोर्ट से बात करने के लिए 0 दबाएं।
```

### Marathi Example:

```
🌟 येथे तुमच्यासाठी आमची सर्वोत्तम निवड आहे:

1️⃣ *ID:* M101
👤 *Name:* सुनीता देवी
🧹 *Work:* स्वयंपाक आणि स्वच्छता
✨ *Experience:* 5 वर्षे
💰 *Expected Salary:* ₹8,000
📍 *Distance:* 0.8 km (P1 Zone (Green))

2️⃣ *ID:* M205
👤 *Name:* रेखा बाई
🧹 *Work:* फुल-टाइम मोलकरीण
✨ *Experience:* 3 वर्षे
💰 *Expected Salary:* ₹6,500
📍 *Distance:* 2.1 km (P2 Zone (Blue))

3️⃣ *ID:* M312
👤 *Name:* आशा कांबले
🧹 *Work:* बेबीसिटर आणि स्वच्छता
✨ *Experience:* 7 वर्षे
💰 *Expected Salary:* ₹10,000
📍 *Distance:* 4.5 km (P3 Zone (Orange))

👩 तुम्हाला कोणती मोलकरीण आवडली? कृपया त्यांच्या *ID* सोबत रिप्लाय करा (उदा: M123).

0️⃣ जर तुम्हाला यापैकी कोणी आवडली नसेल, तर सपोर्टशी बोलण्यासाठी 0 दाबा.
```

---

## Data Fields Displayed

| Field | Source | Example | Description |
|-------|--------|---------|-------------|
| **ID** | `maid.id` | M101 | Unique maid identifier from database |
| **Name** | `maid.name` | Sunita Devi | Full name of the maid |
| **Work** | `maid.service_type` | Cooking & Cleaning | Type of work they specialize in |
| **Experience** | `maid.experience` | 5 years | Years of experience |
| **Expected Salary** | `maid.salary_expectation` | ₹8,000 | Monthly salary expectation |
| **Distance** | Calculated | 0.8 km | Distance from customer's area |
| **Zone** | Calculated | P1 Zone (Green) | Proximity zone category |

---

## Zone Color Coding

The distance is categorized into 4 priority zones:

| Zone | Distance Range | Color | Priority | Description |
|------|----------------|-------|----------|-------------|
| **P1 Zone** | < 1 km | 🟢 Green | Highest | Very close, ideal match |
| **P2 Zone** | 1-3 km | 🔵 Blue | High | Close proximity, good match |
| **P3 Zone** | 3-6 km | 🟠 Orange | Medium | Moderate distance, acceptable |
| **P4 Zone** | 6-8 km | 🔴 Red | Low | Far but within range |
| **Out of Range** | > 8 km | ❌ | Excluded | Not shown to customer |

---

## Sorting Logic

Maids are sorted by:
1. **Primary**: Zone level (P1 → P2 → P3 → P4)
2. **Secondary**: Exact distance within the same zone

### Example:
```
✅ Maid A: 0.5 km (P1) - Shown first
✅ Maid B: 0.9 km (P1) - Shown second
✅ Maid C: 1.2 km (P2) - Shown third
❌ Maid D: 2.8 km (P2) - Not shown (only top 3)
❌ Maid E: 9.5 km (Out of Range) - Excluded
```

---

## Database Schema (Supabase)

The maid data comes from a Supabase table with this structure:

```sql
CREATE TABLE maids (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  service_type VARCHAR(255),
  experience VARCHAR(100),
  salary_expectation INTEGER,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  status VARCHAR(50) DEFAULT 'Available',
  phone VARCHAR(20),
  languages VARCHAR(255),
  area VARCHAR(100),
  city VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Sample Data:

| id | name | service_type | experience | salary_expectation | latitude | longitude | status |
|----|------|--------------|------------|-------------------|----------|-----------|--------|
| 101 | Sunita Devi | Cooking & Cleaning | 5 years | 8000 | 18.5590 | 73.8080 | Available |
| 205 | Rekha Bai | Full-time Maid | 3 years | 6500 | 18.5600 | 73.8100 | Available |
| 312 | Asha Kamble | Babysitter & Cleaning | 7 years | 10000 | 18.5650 | 73.8150 | Available |

---

## Code Flow

### 1. Customer Selects Area
```javascript
case "MAID_AREA": {
  const selectedArea = areas[idx];
  const areaCoords = config.puneAreaCoordinates[selectedArea];
  // areaCoords = { lat: 18.5590, lng: 73.8080 }
```

### 2. Fetch Maids from Supabase
```javascript
const { getTopMaids } = require('./matching.js');
const topMaids = await getTopMaids(areaCoords.lat, areaCoords.lng);
```

### 3. Calculate Distance & Zone
```javascript
// In matching.js
const distance = getDistanceFromLatLonInKm(
  customerLat, customerLng, 
  maid.latitude, maid.longitude
);
const zone = getZone(distance);
// zone = { name: "P1 Zone (Green)", level: 1 }
```

### 4. Sort & Filter
```javascript
maidsWithDistance.sort((a, b) => {
  if (a.zone.level !== b.zone.level) {
    return a.zone.level - b.zone.level; // P1 before P2
  }
  return a.distance - b.distance; // Closer first
});

return maidsWithDistance.slice(0, 3); // Top 3 only
```

### 5. Format Message
```javascript
const emojis = ["1️⃣", "2️⃣", "3️⃣"];
topMaids.forEach((maid, i) => {
  resultMsg += `${emojis[i]} *ID:* M${maid.id}
👤 *Name:* ${maid.name}
🧹 *Work:* ${maid.service_type || 'Not specified'}
✨ *Experience:* ${maid.experience || 'Not specified'}
💰 *Expected Salary:* ₹${maid.salary_expectation || 'Negotiable'}
📍 *Distance:* ${maid.distance.toFixed(1)} km (${maid.zone.name})\n\n`;
});
```

---

## Edge Cases

### No Maids Found (Within 8km)

**English:**
```
Sorry, no maids are currently available in your area within 8km. 
Please contact our support.
```

**Hindi:**
```
क्षमा करें, आपके क्षेत्र में 8 किमी के दायरे में कोई मेड उपलब्ध नहीं है। 
कृपया हमारे सपोर्ट से संपर्क करें।
```

**Marathi:**
```
क्षमस्व, तुमच्या परिसरात 8 किमीच्या आत कोणतीही मोलकरीण उपलब्ध नाही. 
कृपया आमच्या सपोर्टशी संपर्क साधा.
```

### Missing Data Handling

| Field | If Missing | Display |
|-------|-----------|---------|
| `service_type` | null/empty | "Not specified" |
| `experience` | null/empty | "Not specified" |
| `salary_expectation` | null/empty | "Negotiable" |
| `latitude/longitude` | null/empty | Maid is skipped (not shown) |

---

## Customer Response

After seeing the maid list, customer can:

1. **Select a maid**: Reply with ID (e.g., "M101")
2. **Contact support**: Reply with "0"
3. **Restart**: Type "hi" to start over

### Example Customer Response:
```
Customer: M101
```

Bot proceeds to collect:
- Flat/Address
- Start date
- Service plan selection
- Final confirmation

---

## Visual Flow

```
Customer selects area (e.g., "Kharadi")
           ↓
System gets coordinates (18.5514, 73.9456)
           ↓
Query Supabase for available maids
           ↓
Calculate distance for each maid
           ↓
Filter: Keep only maids within 8km
           ↓
Categorize into zones (P1, P2, P3, P4)
           ↓
Sort: Zone level → Distance
           ↓
Take top 3 maids
           ↓
Format WhatsApp message with:
  - Emoji numbers (1️⃣ 2️⃣ 3️⃣)
  - Maid ID (M101)
  - Name, Work Type, Experience
  - Salary expectation
  - Distance & Zone
           ↓
Send to customer
           ↓
Wait for customer to select maid ID
```

---

## WhatsApp Formatting

The message uses **WhatsApp markdown**:

- `*Bold text*` → **Bold text**
- `\n` → New line
- Emojis render natively
- Line breaks create visual separation

### Actual WhatsApp Appearance:

<img src="https://via.placeholder.com/400x600/25D366/FFFFFF?text=WhatsApp+Message" alt="WhatsApp Preview" />

*(In actual WhatsApp, the message appears with proper formatting, emojis, and bold text)*

---

## Configuration Requirements

### 1. Supabase Setup
```javascript
// .env file
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

### 2. Area Coordinates (config.js)
```javascript
const puneAreaCoordinates = {
  "Kharadi": { lat: 18.5514, lng: 73.9456 },
  "Baner": { lat: 18.5590, lng: 73.7868 },
  // ... more areas
};
```

### 3. Maid Data in Supabase
- Must have `latitude` and `longitude`
- Status must be "Available"
- All other fields optional but recommended

---

## Testing

To test the maid display:

1. **Run the bot**: `node index.js`
2. **Start conversation**: Send "hi"
3. **Select language**: "1" (English)
4. **Choose service**: "2" (Maid service)
5. **Select work type**: "1" (Cooking)
6. **Select timing**: "1" (Part-time)
7. **Select budget**: "3" (₹6,000-₹10,000)
8. **Select city**: "1" (Pune)
9. **Select area**: "7" (Kharadi)
10. **View maid list** ✅

---

## Summary

The maid display is:
- ✅ **Clean and organized** with emojis
- ✅ **Multi-language** (EN/HI/MR)
- ✅ **Distance-based** with zone categorization
- ✅ **Top 3 only** to avoid overwhelming customers
- ✅ **Detailed information** for informed decisions
- ✅ **Easy selection** with simple ID-based replies
- ✅ **Fallback option** (0 for support)

This creates a smooth, professional experience for customers looking for maid services! 🎯
