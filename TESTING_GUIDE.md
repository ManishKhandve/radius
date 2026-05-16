# Testing Guide - Number-Only Input System

## 🚀 Quick Start Testing

### Prerequisites
1. WhatsApp bot is running (`node index.js`)
2. QR code scanned and connected
3. Google Sheets configured with SPREADSHEET_ID
4. Supabase connected (for maid matching)

---

## 🧪 TEST SCENARIOS

### Test 1: Flat Deep Cleaning (Full Flow)
```
You: hi
Bot: Language selection (1-3)

You: 1
Bot: Main menu (1-2)

You: 1
Bot: Cleaning service type (1-4)

You: 1
Bot: Flat status (1-3)

You: 1
Bot: Furnished sub-condition (1-3)

You: 1
Bot: BHK selection (1-4)

You: 2
Bot: Shows price + add-ons, asks for 1

You: 1
Bot: City selection (1-2)

You: 1
Bot: Area selection (1-19 for Pune)

You: 7
Bot: Asks for flat address

You: Flat 301, Seasons Apartment
Bot: Date selection (1-3)

You: 2
Bot: Booking summary, confirm (1-2)

You: 1
Bot: ✅ Booking confirmed!
```

**Expected Results:**
- ✅ All number inputs accepted
- ✅ Area "Kharadi" selected (7th in Pune list)
- ✅ Location stored as "Kharadi, Pune"
- ✅ Data saved to Google Sheets
- ✅ Admin alert sent

---

### Test 2: Mini Services (Multiple Items)
```
You: hi
Bot: Language selection

You: 2
Bot: Main menu (Marathi)

You: 1
Bot: Cleaning service type

You: 3
Bot: Mini services menu (16 items)

You: 6-2, 3-1, 7-3
Bot: Validates and calculates:
     - 2 Bathrooms (₹550 × 2 = ₹1100)
     - 1 Single Fridge (₹300 × 1 = ₹300)
     - 3 Ceiling Fans (₹50 × 3 = ₹150)
     - Total: ₹1550
     
Bot: ⚠️ Minimum order ₹2000. Add more services.

You: 6-2, 1-1
Bot: Calculates:
     - 2 Bathrooms (₹1100)
     - 1 Full Kitchen (₹2400)
     - Total: ₹3500 ✅
     
Bot: City selection

You: 2
Bot: Area selection (PCMC - 8 areas)

You: 3
Bot: Asks for flat address

You: B-204, Panchsheel Heights
Bot: Date selection

You: 3
Bot: Asks for custom date

You: 28th May
Bot: Booking summary

You: 1
Bot: ✅ Confirmed!
```

**Expected Results:**
- ✅ Validates minimum order value
- ✅ Parses service-quantity format correctly
- ✅ Calculates total price accurately
- ✅ PCMC area "Chinchwad" selected (3rd in list)
- ✅ Custom date accepted

---

### Test 3: Maid Service (Multiple Maid Selection)
```
You: hello
Bot: Language selection

You: 3
Bot: Main menu (Hindi)

You: 2
Bot: Work type (1-5)

You: 1
Bot: Timing (1-4)

You: 2
Bot: Budget (1-5)

You: 3
Bot: City selection

You: 1
Bot: Area selection (Pune)

You: 15
Bot: Searches database...
     Shows top 3 maids near "Undri"
     
You: 1,2
Bot: ✅ You selected 2 maids
     Shows their names and IDs
     Asks for flat address

You: Flat 102, Kumar Paradise
Bot: Asks for start date

You: 1st June
Bot: Plan selection (1-3)

You: 2
Bot: Booking summary with both maids

You: 1
Bot: ✅ Booking confirmed!
```

**Expected Results:**
- ✅ Multiple maid selection works (1,2)
- ✅ Both maid names and IDs stored
- ✅ Area coordinates used for matching
- ✅ Top 3 maids within 8km shown
- ✅ Data saved with both maid IDs

---

### Test 4: Error Handling
```
Test 4a: Invalid Number
You: hi
Bot: Language selection (1-3)
You: 5
Bot: ⚠️ Shows language selection again

Test 4b: Text Instead of Number
You: hi → 1 → 1 → 1
Bot: Flat status (1-3)
You: furnished
Bot: ⚠️ Shows flat status options again

Test 4c: Out of Range Area
You: hi → 1 → 1 → 1 → 1 → 1 → 2 → 1 → 1
Bot: City selection
You: 1
Bot: Area selection (1-19)
You: 25
Bot: ⚠️ Invalid area, shows list again

Test 4d: Mini Services - Invalid Format
You: hi → 1 → 1 → 3
Bot: Mini services menu
You: 6, 3, 7
Bot: ⚠️ Invalid format. Example: 6-2, 3-1, 7-3

Test 4e: Mini Services - Invalid Service Number
You: 20-1
Bot: ⚠️ Invalid service number: 20. Please try again.

Test 4f: Maid Selection - Too Many
You: [After seeing 3 maids]
You: 1,2,3
Bot: ⚠️ Maximum 2 maids only. Try again.

Test 4g: Maid Selection - Invalid Number
You: 5
Bot: ⚠️ Invalid number. Select between 1 and 3.
```

**Expected Results:**
- ✅ All invalid inputs rejected gracefully
- ✅ Clear error messages in selected language
- ✅ Bot re-shows the same question
- ✅ Session not cleared on error

---

### Test 5: Support & Restart
```
Test 5a: Support at Any Point
You: hi → 1 → 1 → 1
Bot: Flat status
You: 0
Bot: 📞 Shows support number
     Session cleared

Test 5b: Restart Mid-Flow
You: hi → 1 → 1 → 1 → 1 → 1 → 2
Bot: BHK selection
You: menu
Bot: 👋 Language selection (restarted)

Test 5c: Session Timeout
You: hi → 1 → 1
Bot: Cleaning service type
[Wait 16 minutes]
You: 1
Bot: No response (session expired)
You: hi
Bot: 👋 Language selection (new session)
```

**Expected Results:**
- ✅ "0" works at any state
- ✅ Restart keywords clear session
- ✅ 15-minute timeout enforced
- ✅ New session starts fresh

---

### Test 6: Multi-Language
```
Test 6a: English
You: hi → 1
Bot: All messages in English

Test 6b: Marathi
You: hi → 2
Bot: All messages in Marathi (Marathlish)

Test 6c: Hindi
You: hi → 3
Bot: All messages in Hindi (Hinglish)
```

**Expected Results:**
- ✅ Language persists throughout session
- ✅ Natural Hinglish/Marathlish used
- ✅ Numbers and emojis consistent
- ✅ Error messages in selected language

---

### Test 7: Edge Cases
```
Test 7a: Empty Input
You: hi → 1 → 1
Bot: Cleaning service type
You: [empty message]
Bot: Shows cleaning service type again

Test 7b: Spaces in Number Input
You: [At maid selection]
You: 1 2
Bot: ✅ Accepts (converts spaces to commas)

Test 7c: Extra Commas
You: [At mini services]
You: 6-2,, 3-1
Bot: ✅ Handles gracefully (filters empty)

Test 7d: Very Long Address
You: [At flat address]
You: Flat 1234, Building XYZ, Phase 2, Sector 5, Near ABC Mall, Opposite DEF School, Landmark: GHI Hospital
Bot: ✅ Accepts (no length limit on address)

Test 7e: Special Characters in Address
You: Flat A-101, D'Souza Residency, Lane #5
Bot: ✅ Accepts (allows special chars)
```

**Expected Results:**
- ✅ Empty inputs handled
- ✅ Flexible parsing for numbers
- ✅ Address accepts all characters
- ✅ No crashes on edge cases

---

## 📊 DATA VERIFICATION

After each test, verify in Google Sheets:

### Cleaning Bookings Sheet
- [ ] Booking ID generated
- [ ] Customer name saved
- [ ] WhatsApp number saved
- [ ] Service type correct
- [ ] Details complete
- [ ] Location = "Area, City" format
- [ ] Estimated price saved
- [ ] Language preference saved
- [ ] Timestamp recorded

### Maid Bookings Sheet
- [ ] Booking ID generated
- [ ] Customer details saved
- [ ] Maid IDs saved (comma-separated if multiple)
- [ ] Maid names saved
- [ ] Work type, timing, budget saved
- [ ] City and area saved separately
- [ ] Selected plan saved
- [ ] Language preference saved
- [ ] Status = "Confirmed"

### Customer Leads Sheet
- [ ] Customer ID generated
- [ ] Lead saved when area selected
- [ ] Status updated to "Booking Confirmed" after confirmation

---

## 🐛 COMMON ISSUES & FIXES

### Issue 1: Bot Not Responding
**Symptoms**: No reply to "hi"
**Check**:
- Is bot running? (`node index.js`)
- Is QR code scanned?
- Check console for errors

### Issue 2: "Invalid service number" on Mini Services
**Symptoms**: Valid numbers rejected
**Check**:
- Format: `6-2, 3-1` (service-quantity)
- Service numbers: 1-16 only
- No spaces around hyphens

### Issue 3: No Maids Found
**Symptoms**: "No maids available" message
**Check**:
- Supabase connected?
- Maids table has data?
- Coordinates correct? (should be Pune, not New York)

### Issue 4: Google Sheets Error
**Symptoms**: Booking confirmed but not in sheets
**Check**:
- SPREADSHEET_ID in .env?
- Service account has edit access?
- Sheet names match exactly?

### Issue 5: Area Selection Not Working
**Symptoms**: Invalid area error on valid numbers
**Check**:
- Pune: 1-19
- PCMC: 1-8
- Number within range?

---

## ✅ FINAL CHECKLIST

Before going live:
- [ ] All 7 test scenarios pass
- [ ] Data saves to Google Sheets correctly
- [ ] Admin alerts sent to owner WhatsApp
- [ ] All 3 languages work properly
- [ ] Error messages clear and helpful
- [ ] Support option (0) works everywhere
- [ ] Restart commands work
- [ ] Session timeout works (15 min)
- [ ] Maid matching returns results
- [ ] Mini services calculation correct
- [ ] Multiple maid selection works
- [ ] Location format correct (Area, City)

---

## 🎯 SUCCESS CRITERIA

A successful test means:
1. ✅ Customer only types numbers (except addresses/dates)
2. ✅ All inputs validated properly
3. ✅ Clear error messages on invalid input
4. ✅ Data saved completely to Google Sheets
5. ✅ Admin receives alerts
6. ✅ Customer receives confirmation
7. ✅ No crashes or unexpected errors
8. ✅ Session management works correctly

---

**Ready to test!** Start with Test 1 and work through all scenarios.
