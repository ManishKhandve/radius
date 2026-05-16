# ✅ UPDATED Google Sheets Setup Guide

## 🎉 All Data Now Being Saved!

This is the **COMPLETE** structure with all fields including the newly added ones.

---

## 1. CUSTOMERS Sheet (15 columns)

### Column Headers (Row 1):

| Column | Header | Description | Example |
|--------|--------|-------------|---------|
| A | Customer ID | Auto-generated unique ID | C001, C002, C003 |
| B | Name | Customer's name | John Doe |
| C | WhatsApp Number | Customer's WhatsApp ID | 919876543210@c.us |
| D | Flat | Flat/Address details | Flat 4B, Cidco N-6 |
| E | Work Type | Type of work needed | Cooking, Cleaning |
| F | Timing | Work timing preference | Part Time (1-3 hrs) |
| G | Budget | Monthly budget range | ₹6,000 – ₹10,000 |
| H | Enquiry Date | Date of first contact | 16/05/2026 |
| I | Status | Current lead status | New Lead, Booking Confirmed |
| J | Assigned Maid ID | Maid assigned (if any) | M101 |
| K | Source | Where lead came from | WhatsApp Bot |
| L | Notes | Additional notes | - |
| M | City | Customer's city | Pune, PCMC |
| N | Area | Customer's area | Kharadi, Wakad |
| O | Language | Preferred language | en, hi, mr |

### Setup Instructions:

1. Create a tab named exactly: `CUSTOMERS`
2. In Row 1, add these headers:
   ```
   Customer ID | Name | WhatsApp Number | Flat | Work Type | Timing | Budget | Enquiry Date | Status | Assigned Maid ID | Source | Notes | City | Area | Language
   ```

### Sample Data (Row 2):
```
C001 | John Doe | 919876543210@c.us | Flat 4B, Cidco N-6 | Cooking | Part Time (1-3 hrs) | ₹6,000 – ₹10,000 | 16/05/2026 | New Lead | | WhatsApp Bot | | Pune | Kharadi | en
```

---

## 2. BOOKINGS Sheet (21 columns)

### Column Headers (Row 1):

| Column | Header | Description | Example |
|--------|--------|-------------|---------|
| A | Booking ID | Auto-generated unique ID | B001, B002, B003 |
| B | Customer Name | Customer's name | John Doe |
| C | Customer WhatsApp | Customer's WhatsApp ID | 919876543210@c.us |
| D | Maid Name | Selected maid's name | Sunita Devi, Rekha Bai |
| E | Maid ID | Selected maid's ID | M101, M102 |
| F | Work Type | Type of work | Cooking |
| G | Timing | Work timing | Part Time (1-3 hrs) |
| H | Start Date | When maid should start | 25 May |
| I | Monthly Salary | Agreed salary | ₹6,000 – ₹10,000 |
| J | Flat | Customer's address | Flat 4B, Cidco N-6 |
| K | Booking Date | Date of booking | 16/05/2026 |
| L | Status | Booking status | Confirmed, Cancelled |
| M | Commission Paid | Payment status | Yes, No |
| N | Follow-up Day 1 | First day follow-up notes | - |
| O | Follow-up Day 2 | Second day follow-up notes | - |
| P | Follow-up Day 3 | Third day follow-up notes | - |
| Q | Monthly Check-in | Monthly follow-up notes | - |
| R | Selected Plan | Plan chosen by customer | Part-Time Standard (₹6,000) |
| S | City | Customer's city | Pune, PCMC |
| T | Area | Customer's area | Kharadi, Wakad |
| U | Language | Preferred language | en, hi, mr |

### Setup Instructions:

1. Create a tab named exactly: `BOOKINGS`
2. In Row 1, add these headers:
   ```
   Booking ID | Customer Name | Customer WhatsApp | Maid Name | Maid ID | Work Type | Timing | Start Date | Monthly Salary | Flat | Booking Date | Status | Commission Paid | Follow-up Day 1 | Follow-up Day 2 | Follow-up Day 3 | Monthly Check-in | Selected Plan | City | Area | Language
   ```

### Sample Data (Row 2):
```
B001 | John Doe | 919876543210@c.us | Sunita Devi, Rekha Bai | M101, M102 | Cooking | Part Time (1-3 hrs) | 25 May | ₹6,000 – ₹10,000 | Flat 4B, Cidco N-6 | 16/05/2026 | Confirmed | No | | | | | Part-Time Standard (₹6,000) | Pune | Kharadi | en
```

---

## 3. CLEANING_BOOKINGS Sheet (13 columns)

### Column Headers (Row 1):

| Column | Header | Description | Example |
|--------|--------|-------------|---------|
| A | Booking ID | Auto-generated unique ID | CB12345, CB12346 |
| B | Customer Name | Customer's name | Sarah Smith |
| C | WhatsApp Number | Customer's WhatsApp ID | 919876543211@c.us |
| D | Service Type | Type of cleaning service | Flat Deep Cleaning |
| E | Details | Service details | Furnished - 2 BHK |
| F | Location | Service location | Kharadi, Magarpatta |
| G | Preferred Date | When service is needed | Today, Tomorrow, 20 May |
| H | Booking Date | Date of booking | 16/05/2026 |
| I | Status | Request status | New Request, Confirmed |
| J | Source | Where lead came from | WhatsApp Bot |
| K | Notes | Additional notes | - |
| L | Estimated Price | Calculated price | ₹3,599, ₹6,000 |
| M | Language | Preferred language | en, hi, mr |

### Setup Instructions:

1. Create a tab named exactly: `CLEANING_BOOKINGS`
2. In Row 1, add these headers:
   ```
   Booking ID | Customer Name | WhatsApp Number | Service Type | Details | Location | Preferred Date | Booking Date | Status | Source | Notes | Estimated Price | Language
   ```

### Sample Data (Row 2):
```
CB12345 | Sarah Smith | 919876543211@c.us | Flat Deep Cleaning | Furnished - 2 BHK | Kharadi | Tomorrow | 16/05/2026 | New Request | WhatsApp Bot | | ₹3,599 | mr
```

---

## 4. MAIDS Sheet (Optional - For Reference)

### Column Headers (Row 1):

| Column | Header | Description | Example |
|--------|--------|-------------|---------|
| A | Maid ID | Unique maid identifier | M101, M102 |
| B | Name | Maid's name | Sunita Devi |
| C | Service Type | Type of work | Cooking & Cleaning |
| D | Experience | Years of experience | 5 years |
| E | Salary Expectation | Expected monthly salary | ₹8,000 |
| F | City | City location | Pune |
| G | Area | Area location | Kharadi |
| H | Latitude | GPS latitude | 18.5514 |
| I | Longitude | GPS longitude | 73.9456 |
| J | Phone Number | Contact number | 9876543210 |
| K | Status | Availability status | Available, Placed |
| L | Notes | Additional notes | - |

---

## Quick Setup Checklist

### ✅ Step 1: Update Existing Sheets

If you already have sheets set up, you need to **add new columns**:

#### CUSTOMERS Sheet:
- Add Column M: **City**
- Add Column N: **Area**
- Add Column O: **Language**

#### BOOKINGS Sheet:
- Add Column R: **Selected Plan**
- Add Column S: **City**
- Add Column T: **Area**
- Add Column U: **Language**

#### CLEANING_BOOKINGS Sheet:
- Add Column L: **Estimated Price**
- Add Column M: **Language**

### ✅ Step 2: For New Setup

1. Create new Google Sheet
2. Create 4 tabs: `CUSTOMERS`, `BOOKINGS`, `CLEANING_BOOKINGS`, `MAIDS`
3. Add all column headers as specified above
4. Bold and freeze Row 1
5. Add filters to Row 1

---

## What's New? (Changes from Previous Version)

### CUSTOMERS Sheet:
- ✅ **Column M: City** - Now separate from Budget
- ✅ **Column N: Area** - Now separate from Budget
- ✅ **Column O: Language** - Customer's preferred language
- ✅ **Budget (Column G)** - Now clean, without location appended

### BOOKINGS Sheet:
- ✅ **Column E: Maid ID** - Now properly filled with M101, M102
- ✅ **Column R: Selected Plan** - Which plan customer chose
- ✅ **Column S: City** - Customer's city
- ✅ **Column T: Area** - Customer's area
- ✅ **Column U: Language** - Customer's preferred language

### CLEANING_BOOKINGS Sheet:
- ✅ **Column L: Estimated Price** - Calculated price shown to customer
- ✅ **Column M: Language** - Customer's preferred language

---

## Data Examples

### Example 1: Maid Service Booking

**CUSTOMERS Sheet:**
```
C001 | Rajesh Kumar | 919876543210@c.us | Flat 301, Seasons Apartment | Cooking | Part Time (1-3 hrs) | ₹6,000 – ₹10,000 | 16/05/2026 | Booking Confirmed | M101 | WhatsApp Bot | | Pune | Kharadi | hi
```

**BOOKINGS Sheet:**
```
B001 | Rajesh Kumar | 919876543210@c.us | Sunita Devi, Rekha Bai | M101, M102 | Cooking | Part Time (1-3 hrs) | 25 May | ₹6,000 – ₹10,000 | Flat 301, Seasons Apartment | 16/05/2026 | Confirmed | No | | | | | Part-Time Standard (₹6,000) | Pune | Kharadi | hi
```

### Example 2: Cleaning Service Booking

**CLEANING_BOOKINGS Sheet:**
```
CB12345 | Priya Sharma | 919876543211@c.us | Flat Deep Cleaning | Furnished (Regular Occupied House) - 2 BHK | Magarpatta City | Tomorrow | 16/05/2026 | New Request | WhatsApp Bot | | ₹3,599 | mr
```

---

## Language Codes

| Code | Language | Display Name |
|------|----------|--------------|
| en | English | English |
| hi | Hindi | हिंदी (Hinglish) |
| mr | Marathi | मराठी (Marathlish) |

---

## Status Values Reference

### CUSTOMERS Sheet - Status (Column I):
- `New Lead` - Initial inquiry
- `Booking Confirmed` - Booking completed
- `Follow-up Required` - Needs follow-up
- `Not Interested` - Customer declined
- `Invalid Number` - Wrong contact

### BOOKINGS Sheet - Status (Column L):
- `Confirmed` - Booking confirmed
- `Active` - Maid is working
- `Completed` - Service completed
- `Cancelled` - Booking cancelled
- `Replacement Requested` - Customer wants different maid

### CLEANING_BOOKINGS Sheet - Status (Column I):
- `New Request` - Initial request
- `Confirmed` - Service confirmed
- `Completed` - Service completed
- `Cancelled` - Request cancelled
- `Rescheduled` - Date changed

---

## Plan Values Reference

### Selected Plan (BOOKINGS Column R):
- `Part-Time Standard (₹6,000)`
- `Part-Time Verified (₹12,000)`
- `Full-Time Verified (1 Month Salary)`

---

## Important Notes

### ⚠️ Column Order Matters
The bot writes data in a specific order. Don't rearrange columns without updating the code.

### ⚠️ Tab Names Are Case-Sensitive
Must be exactly:
- `CUSTOMERS` (not "customers" or "Customers")
- `BOOKINGS` (not "bookings" or "Bookings")
- `CLEANING_BOOKINGS` (not "cleaning_bookings")

### ✅ You Can Add Extra Columns
Feel free to add columns after the required ones for your own tracking.

### ✅ Don't Delete Row 1
Row 1 contains headers. Data starts from Row 2.

---

## Migration Guide (If You Have Existing Data)

### Option 1: Add New Columns (Recommended)

1. Open your existing Google Sheet
2. Insert new columns at the specified positions
3. Add the new headers
4. Existing data will remain intact
5. New bookings will have all fields filled

### Option 2: Create New Sheet

1. Create a new Google Sheet with the updated structure
2. Copy existing data manually or via script
3. Update `SPREADSHEET_ID` in `.env` file
4. Test with a new booking

---

## Testing Your Updated Setup

### Test 1: Maid Service Booking
1. Complete a maid service booking
2. Check CUSTOMERS sheet - verify City, Area, Language are filled
3. Check BOOKINGS sheet - verify Maid ID, Selected Plan, City, Area, Language are filled

### Test 2: Cleaning Service Booking
1. Complete a cleaning service booking
2. Check CLEANING_BOOKINGS sheet - verify Estimated Price and Language are filled

### Test 3: Multiple Maids Selection
1. Select 2 maids (e.g., 1,2)
2. Check BOOKINGS sheet - verify Maid ID shows "M101, M102"
3. Check Maid Name shows both names

---

## Summary of Changes

### What Was Missing Before:
❌ Maid IDs were empty  
❌ Selected Plan not saved  
❌ Estimated Price not saved  
❌ City/Area mixed with Budget  
❌ Language preference not saved  

### What's Fixed Now:
✅ Maid IDs properly saved (M101, M102)  
✅ Selected Plan saved  
✅ Estimated Price saved  
✅ City/Area in separate columns  
✅ Language preference saved  
✅ Budget field clean (no location appended)  

---

## Visual Layout

### CUSTOMERS Sheet (15 columns):
```
┌────┬──────┬─────────┬──────┬──────┬────────┬────────┬──────┬────────┬──────┬────────┬───────┬──────┬──────┬──────────┐
│ A  │  B   │    C    │  D   │  E   │   F    │   G    │  H   │   I    │  J   │   K    │   L   │  M   │  N   │    O     │
├────┼──────┼─────────┼──────┼──────┼────────┼────────┼──────┼────────┼──────┼────────┼───────┼──────┼──────┼──────────┤
│ ID │ Name │ WhatsApp│ Flat │ Work │ Timing │ Budget │ Date │ Status │ Maid │ Source │ Notes │ City │ Area │ Language │
└────┴──────┴─────────┴──────┴──────┴────────┴────────┴──────┴────────┴──────┴────────┴───────┴──────┴──────┴──────────┘
```

### BOOKINGS Sheet (21 columns):
```
┌────┬──────┬─────────┬──────┬──────┬──────┬────────┬──────┬────────┬──────┬──────┬────────┬──────┬───┬───┬───┬───┬──────┬──────┬──────┬──────────┐
│ A  │  B   │    C    │  D   │  E   │  F   │   G    │  H   │   I    │  J   │  K   │   L    │  M   │ N │ O │ P │ Q │  R   │  S   │  T   │    U     │
├────┼──────┼─────────┼──────┼──────┼──────┼────────┼──────┼────────┼──────┼──────┼────────┼──────┼───┼───┼───┼───┼──────┼──────┼──────┼──────────┤
│ ID │ Name │ WhatsApp│ Maid │ Maid │ Work │ Timing │Start │ Salary │ Flat │ Date │ Status │ Comm │F1 │F2 │F3 │MC │ Plan │ City │ Area │ Language │
│    │      │         │ Name │  ID  │ Type │        │ Date │        │      │      │        │      │   │   │   │   │      │      │      │          │
└────┴──────┴─────────┴──────┴──────┴──────┴────────┴──────┴────────┴──────┴──────┴────────┴──────┴───┴───┴───┴───┴──────┴──────┴──────┴──────────┘
```

### CLEANING_BOOKINGS Sheet (13 columns):
```
┌────┬──────┬─────────┬─────────┬─────────┬──────────┬──────┬──────┬────────┬────────┬───────┬───────┬──────────┐
│ A  │  B   │    C    │    D    │    E    │    F     │  G   │  H   │   I    │   J    │   K   │   L   │    M     │
├────┼──────┼─────────┼─────────┼─────────┼──────────┼──────┼──────┼────────┼────────┼───────┼───────┼──────────┤
│ ID │ Name │ WhatsApp│ Service │ Details │ Location │ Date │ Date │ Status │ Source │ Notes │ Price │ Language │
│    │      │         │  Type   │         │          │ Pref │ Book │        │        │       │       │          │
└────┴──────┴─────────┴─────────┴─────────┴──────────┴──────┴──────┴────────┴────────┴───────┴───────┴──────────┘
```

---

## 🎉 All Data Now Being Saved!

Your bot now captures **100% of the data** collected during conversations:

✅ Customer details  
✅ Location (City & Area)  
✅ Language preference  
✅ Selected maids with IDs  
✅ Selected plan  
✅ Pricing information  
✅ All booking details  

Everything is properly organized in separate columns for easy analysis and reporting! 📊
