# Updated Bot Flow - Number-Only Input System

## 🎯 Main Entry Point

```
┌─────────────────────────────────────┐
│  Customer sends message to bot      │
│  (Ad click, "hi", "hello", etc.)    │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  LANGUAGE SELECTION                 │
│  1️⃣ English                         │
│  2️⃣ मराठी                           │
│  3️⃣ हिंदी                           │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  MAIN MENU                          │
│  1️⃣ HOME deep cleaning service     │
│  2️⃣ MONTHLY maid service            │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       ↓                ↓
   CLEANING         MAID FLOW
    FLOW
```

---

## 🧹 CLEANING SERVICE FLOW (Option 1)

```
CLEANING_SERVICE_TYPE
┌─────────────────────────────────────┐
│  1️⃣ Flat Deep Cleaning             │
│  2️⃣ Bathroom Cleaning               │
│  3️⃣ Mini Service Package            │
│  4️⃣ Villa / Bungalow / Row House   │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┬──────────┐
    ↓          ↓          ↓          ↓
  FLAT      BATHROOM    MINI      VILLA
  FLOW       FLOW      SERVICES   FLOW
```

### 🏠 Flat Deep Cleaning Flow

```
CLEANING_FLAT_STATUS
┌─────────────────────────────────────┐
│  1️⃣ Furnished                       │
│  2️⃣ Empty / Vacant                  │
│  3️⃣ Post Interior Cleaning          │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    ↓          ↓          ↓
FURNISHED   EMPTY      POST
  SUB        SUB     INTERIOR
    │          │          │
    └──────────┼──────────┘
               ↓
CLEANING_FLAT_BHK
┌─────────────────────────────────────┐
│  1️⃣ 1 BHK                           │
│  2️⃣ 2 BHK                           │
│  3️⃣ 3 BHK                           │
│  4️⃣ 4 BHK / Villa                   │
└──────────────┬──────────────────────┘
               ↓
CLEANING_CONTINUE
┌─────────────────────────────────────┐
│  Shows price + add-ons info         │
│  1️⃣ Proceed to booking              │
└──────────────┬──────────────────────┘
               ↓
        [LOCATION FLOW]
```

### 🛁 Bathroom Cleaning Flow

```
CLEANING_BATHROOM_TYPE
┌─────────────────────────────────────┐
│  1️⃣ View Subscription Plans         │
│  2️⃣ One-Time Deep Cleaning          │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       ↓                ↓
  SUBSCRIPTION     ONE-TIME
     COUNT          COUNT
       │                │
       ↓                ↓
  1️⃣ 2 Bath        1️⃣ 1 Bath
  2️⃣ 3 Bath        2️⃣ 2 Bath
  3️⃣ 4 Bath        3️⃣ 3 Bath
                   4️⃣ 4+ Bath
       │                │
       └────────┬───────┘
                ↓
CLEANING_BATHROOM_ACTION
┌─────────────────────────────────────┐
│  Shows price details                │
│  1️⃣ Continue Booking                │
│  2️⃣ Talk to Support                 │
└──────────────┬──────────────────────┘
               ↓
        [LOCATION FLOW]
```

### 🧹 Mini Services Flow

```
CLEANING_MINI_SERVICE
┌─────────────────────────────────────┐
│  Shows 16 services with prices      │
│                                     │
│  🍳 Kitchen (1-5)                   │
│  🛁 Bathroom & Rooms (6-9)          │
│  🛋️ Furniture & Balcony (10-16)    │
│                                     │
│  Format: service-quantity           │
│  Example: 6-2, 3-1, 7-3             │
│  (2 Bathrooms, 1 Fridge, 3 Fans)    │
│                                     │
│  ⚠️ Minimum order: ₹2000            │
└──────────────┬──────────────────────┘
               ↓
    Validates & calculates price
               ↓
        [LOCATION FLOW]
```

### 🏡 Villa/Bungalow Flow

```
CLEANING_VILLA_SQFT
┌─────────────────────────────────────┐
│  Enter total area in Sq.Ft          │
│  (Text input - numbers only)        │
│  Example: 1500                      │
└──────────────┬──────────────────────┘
               ↓
CLEANING_VILLA_STATUS
┌─────────────────────────────────────┐
│  1️⃣ Regular Occupied (₹6/sq.ft)    │
│  2️⃣ Post Interior (₹9/sq.ft)       │
└──────────────┬──────────────────────┘
               ↓
    Calculates: sqft × rate
               ↓
CLEANING_CONTINUE
┌─────────────────────────────────────┐
│  Shows calculated price             │
│  1️⃣ Proceed to booking              │
└──────────────┬──────────────────────┘
               ↓
        [LOCATION FLOW]
```

---

## 📍 LOCATION FLOW (Common for all cleaning services)

```
CLEANING_LOCATION
┌─────────────────────────────────────┐
│  Select your city:                  │
│  1️⃣ Pune                            │
│  2️⃣ PCMC                            │
└──────────────┬──────────────────────┘
               ↓
CLEANING_AREA
┌─────────────────────────────────────┐
│  Select your area:                  │
│  (Shows numbered list)              │
│                                     │
│  Pune: 19 areas (1-19)              │
│  PCMC: 8 areas (1-8)                │
└──────────────┬──────────────────────┘
               ↓
COLLECT_FLAT
┌─────────────────────────────────────┐
│  Enter flat number & society        │
│  (Text input required)              │
│  Example: Flat 4B, Cidco N-6        │
└──────────────┬──────────────────────┘
               ↓
CLEANING_DATE
┌─────────────────────────────────────┐
│  When do you need service?          │
│  1️⃣ Today                           │
│  2️⃣ Tomorrow                        │
│  3️⃣ Select Date                     │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       ↓                ↓
   1 or 2           Option 3
       │                ↓
       │    CLEANING_CUSTOM_DATE
       │    ┌─────────────────────┐
       │    │  Enter date         │
       │    │  (Text input)       │
       │    │  Example: 25th May  │
       │    └──────────┬──────────┘
       │               │
       └───────┬───────┘
               ↓
CLEANING_CONFIRM
┌─────────────────────────────────────┐
│  Shows booking summary              │
│  1️⃣ Confirm ✅                      │
│  2️⃣ Cancel ❌                       │
└──────────────┬──────────────────────┘
               ↓
    ✅ Booking Complete!
    - Saves to Google Sheets
    - Sends admin alert
    - Thanks customer
```

---

## 👩 MAID SERVICE FLOW (Option 2)

```
WORK_TYPE
┌─────────────────────────────────────┐
│  1️⃣ Cooking                         │
│  2️⃣ Cleaning                        │
│  3️⃣ Babysitter                      │
│  4️⃣ Caretaker                       │
│  5️⃣ Custom (Type what you need)    │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       ↓                ↓
   Options 1-4      Option 5
       │                ↓
       │    WORK_TYPE_CUSTOM
       │    ┌─────────────────────┐
       │    │  Type custom work   │
       │    │  (Text input)       │
       │    └──────────┬──────────┘
       │               │
       └───────┬───────┘
               ↓
TIMING
┌─────────────────────────────────────┐
│  1️⃣ Part Time (1-3 hrs)            │
│  2️⃣ Full Time (8 hrs)              │
│  3️⃣ Full Time (10 hrs)             │
│  4️⃣ Full Time (24 hrs)             │
└──────────────┬──────────────────────┘
               ↓
BUDGET
┌─────────────────────────────────────┐
│  1️⃣ Based on skill & experience    │
│  2️⃣ ₹4,000 – ₹6,000                │
│  3️⃣ ₹6,000 – ₹10,000               │
│  4️⃣ ₹10,000 – ₹20,000              │
│  5️⃣ ₹20,000 – ₹30,000 (10+ edu)   │
└──────────────┬──────────────────────┘
               ↓
MAID_CITY
┌─────────────────────────────────────┐
│  1️⃣ Pune                            │
│  2️⃣ PCMC                            │
└──────────────┬──────────────────────┘
               ↓
MAID_AREA
┌─────────────────────────────────────┐
│  Select your area:                  │
│  (Shows numbered list)              │
│                                     │
│  Pune: 19 areas (1-19)              │
│  PCMC: 8 areas (1-8)                │
└──────────────┬──────────────────────┘
               ↓
    🔍 Searches Supabase DB
    Finds top 3 maids within 8km
               ↓
MAID_CHOICE
┌─────────────────────────────────────┐
│  Shows top 3 maids with details:    │
│  - Name, ID, Work Type              │
│  - Experience, Salary               │
│  - Distance from your area          │
│                                     │
│  Select by number:                  │
│  1️⃣ First maid                      │
│  2️⃣ Second maid                     │
│  3️⃣ Third maid                      │
│                                     │
│  Can select 1 or 2 maids:           │
│  - Single: 1                        │
│  - Multiple: 1,2 or 1 2             │
│                                     │
│  0️⃣ None? Talk to support          │
└──────────────┬──────────────────────┘
               ↓
COLLECT_FLAT
┌─────────────────────────────────────┐
│  Enter flat number & society        │
│  (Text input required)              │
│  Example: Flat 4B, Cidco N-6        │
└──────────────┬──────────────────────┘
               ↓
COLLECT_DATE
┌─────────────────────────────────────┐
│  When should maid start?            │
│  (Text input required)              │
│  Example: 20 May or 20/05/2025      │
└──────────────┬──────────────────────┘
               ↓
MAID_PLAN
┌─────────────────────────────────────┐
│  1️⃣ Part-Time Standard (₹6,000)    │
│  2️⃣ Part-Time Verified (₹12,000)   │
│  3️⃣ Full-Time Verified (1M Salary) │
│                                     │
│  💡 Registration Fee: ₹1,000        │
│  📌 CLEANLY = Platinum Company      │
└──────────────┬──────────────────────┘
               ↓
CONFIRM
┌─────────────────────────────────────┐
│  Shows complete booking summary     │
│  1️⃣ Confirm ✅                      │
│  2️⃣ Cancel ❌                       │
└──────────────┬──────────────────────┘
               ↓
    ✅ Booking Complete!
    - Saves to Google Sheets
    - Sends admin alert
    - Confirms to customer
```

---

## 🔄 GLOBAL FEATURES

### Always Available
```
┌─────────────────────────────────────┐
│  0️⃣ Talk to Support                │
│     → Shows contact number          │
│     → Clears session                │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  "hi", "hello", "menu", "start"     │
│     → Restarts from beginning       │
│     → Clears current session        │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Session Timeout: 15 minutes        │
│     → Auto-clears inactive session  │
└─────────────────────────────────────┘
```

---

## 📊 INPUT TYPES SUMMARY

### ✅ Number-Only Input (Easy!)
- Language selection (1-3)
- Main menu (1-2)
- Service types (1-4)
- All status/condition selections (1-4)
- BHK selection (1-4)
- City selection (1-2)
- Area selection (1-19 or 1-8)
- Date options (1-3)
- Maid selection (1, 2, 3, or 1,2)
- Plan selection (1-3)
- Confirmation (1-2)
- Mini services (format: 6-2, 3-1)

### 📝 Text Input (When Necessary)
- Flat address (unique for each customer)
- Custom dates (flexible formats)
- Custom work type (option 5 in maid flow)
- Villa square footage (numbers only)

---

## 🎯 KEY IMPROVEMENTS

1. **Faster**: Numbers are quicker to type
2. **Easier**: No spelling mistakes
3. **Clearer**: Validation is straightforward
4. **Universal**: Numbers work in all languages
5. **Consistent**: Same pattern throughout

---

**Status**: ✅ Fully implemented and ready for testing!
