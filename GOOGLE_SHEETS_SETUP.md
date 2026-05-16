# Google Sheets Setup Guide

## 📊 Required Google Sheets Structure

Your Google Sheet needs **4 tabs** (sheets) with specific column headers.

---

## 1. CUSTOMERS Sheet

This sheet stores all customer leads and inquiries.

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

### Setup Instructions:

1. Create a new tab named exactly: `CUSTOMERS`
2. In Row 1, add these headers:
   ```
   Customer ID | Name | WhatsApp Number | Flat | Work Type | Timing | Budget | Enquiry Date | Status | Assigned Maid ID | Source | Notes
   ```

### Sample Data (Row 2):
```
C001 | John Doe | 919876543210@c.us | Flat 4B, Cidco N-6 | Cooking | Part Time (1-3 hrs) | ₹6,000 – ₹10,000 | 16/05/2026 | New Lead | | WhatsApp Bot | 
```

---

## 2. BOOKINGS Sheet

This sheet stores confirmed maid service bookings.

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

### Setup Instructions:

1. Create a new tab named exactly: `BOOKINGS`
2. In Row 1, add these headers:
   ```
   Booking ID | Customer Name | Customer WhatsApp | Maid Name | Maid ID | Work Type | Timing | Start Date | Monthly Salary | Flat | Booking Date | Status | Commission Paid | Follow-up Day 1 | Follow-up Day 2 | Follow-up Day 3 | Monthly Check-in
   ```

### Sample Data (Row 2):
```
B001 | John Doe | 919876543210@c.us | Sunita Devi, Rekha Bai | M101, M102 | Cooking | Part Time (1-3 hrs) | 25 May | ₹6,000 – ₹10,000 | Flat 4B, Cidco N-6 | 16/05/2026 | Confirmed | No | | | | 
```

---

## 3. CLEANING_BOOKINGS Sheet

This sheet stores cleaning service requests.

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

### Setup Instructions:

1. Create a new tab named exactly: `CLEANING_BOOKINGS`
2. In Row 1, add these headers:
   ```
   Booking ID | Customer Name | WhatsApp Number | Service Type | Details | Location | Preferred Date | Booking Date | Status | Source | Notes
   ```

### Sample Data (Row 2):
```
CB12345 | Sarah Smith | 919876543211@c.us | Flat Deep Cleaning | Furnished - 2 BHK | Kharadi | Tomorrow | 16/05/2026 | New Request | WhatsApp Bot | 
```

---

## 4. MAIDS Sheet (Optional - For Reference)

This sheet can store maid information for manual reference. **Note:** Maid data is primarily stored in Supabase, but you can maintain a backup here.

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

### Setup Instructions:

1. Create a new tab named exactly: `MAIDS`
2. In Row 1, add these headers:
   ```
   Maid ID | Name | Service Type | Experience | Salary Expectation | City | Area | Latitude | Longitude | Phone Number | Status | Notes
   ```

---

## Quick Setup Checklist

### ✅ Step 1: Create Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it: "CLEANLY WhatsApp Bot Data"

### ✅ Step 2: Create 4 Tabs
1. Rename "Sheet1" to `CUSTOMERS`
2. Add new sheet named `BOOKINGS`
3. Add new sheet named `CLEANING_BOOKINGS`
4. Add new sheet named `MAIDS` (optional)

### ✅ Step 3: Add Headers
Copy the headers from above for each sheet (Row 1)

### ✅ Step 4: Format (Optional but Recommended)
1. **Bold Row 1** (headers)
2. **Freeze Row 1** (View → Freeze → 1 row)
3. **Add filters** (Data → Create a filter)
4. **Set column widths** for readability

### ✅ Step 5: Get Spreadsheet ID
1. Open your Google Sheet
2. Look at the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
3. Copy the `SPREADSHEET_ID` part
4. Add to your `.env` file:
   ```
   SPREADSHEET_ID=your_spreadsheet_id_here
   ```

### ✅ Step 6: Set Up Service Account
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable Google Sheets API
4. Create Service Account credentials
5. Download JSON key file
6. Share your Google Sheet with the service account email
7. Add credentials to `.env`:
   ```
   GOOGLE_CREDENTIALS_PATH=./credentials.json
   ```
   OR (for cloud deployment):
   ```
   GOOGLE_CREDENTIALS={"type":"service_account",...}
   ```

---

## Visual Layout

### CUSTOMERS Sheet:
```
┌──────────────┬──────────┬──────────────────┬─────────────────┬───────────┬──────────────────┬──────────────────┬──────────────┬──────────────────┬──────────────────┬──────────────┬───────┐
│ Customer ID  │   Name   │ WhatsApp Number  │      Flat       │ Work Type │     Timing       │     Budget       │ Enquiry Date │     Status       │ Assigned Maid ID │    Source    │ Notes │
├──────────────┼──────────┼──────────────────┼─────────────────┼───────────┼──────────────────┼──────────────────┼──────────────┼──────────────────┼──────────────────┼──────────────┼───────┤
│     C001     │ John Doe │ 919876543210@c.us│ Flat 4B, N-6    │  Cooking  │ Part Time (1-3h) │ ₹6,000-₹10,000   │  16/05/2026  │    New Lead      │                  │ WhatsApp Bot │       │
│     C002     │ Sarah    │ 919876543211@c.us│ Flat 2A, Wakad  │ Cleaning  │ Full Time (8h)   │ ₹4,000-₹6,000    │  16/05/2026  │ Booking Confirmed│      M105        │ WhatsApp Bot │       │
└──────────────┴──────────┴──────────────────┴─────────────────┴───────────┴──────────────────┴──────────────────┴──────────────┴──────────────────┴──────────────────┴──────────────┴───────┘
```

### BOOKINGS Sheet:
```
┌────────────┬──────────────┬──────────────────┬─────────────────┬─────────┬───────────┬──────────────────┬────────────┬────────────────┬─────────────────┬──────────────┬───────────┬─────────────────┐
│ Booking ID │Customer Name │ Customer WhatsApp│   Maid Name     │ Maid ID │ Work Type │     Timing       │ Start Date │ Monthly Salary │      Flat       │ Booking Date │  Status   │ Commission Paid │
├────────────┼──────────────┼──────────────────┼─────────────────┼─────────┼───────────┼──────────────────┼────────────┼────────────────┼─────────────────┼──────────────┼───────────┼─────────────────┤
│    B001    │   John Doe   │ 919876543210@c.us│ Sunita, Rekha   │M101,M102│  Cooking  │ Part Time (1-3h) │  25 May    │ ₹6,000-₹10,000 │ Flat 4B, N-6    │  16/05/2026  │ Confirmed │       No        │
└────────────┴──────────────┴──────────────────┴─────────────────┴─────────┴───────────┴──────────────────┴────────────┴────────────────┴─────────────────┴──────────────┴───────────┴─────────────────┘
```

### CLEANING_BOOKINGS Sheet:
```
┌────────────┬──────────────┬──────────────────┬────────────────────┬──────────────────┬──────────────┬────────────────┬──────────────┬──────────────┬──────────────┬───────┐
│ Booking ID │Customer Name │ WhatsApp Number  │   Service Type     │     Details      │   Location   │ Preferred Date │ Booking Date │   Status     │    Source    │ Notes │
├────────────┼──────────────┼──────────────────┼────────────────────┼──────────────────┼──────────────┼────────────────┼──────────────┼──────────────┼──────────────┼───────┤
│  CB12345   │ Sarah Smith  │ 919876543211@c.us│ Flat Deep Cleaning │ Furnished - 2BHK │   Kharadi    │    Tomorrow    │  16/05/2026  │ New Request  │ WhatsApp Bot │       │
└────────────┴──────────────┴──────────────────┴────────────────────┴──────────────────┴──────────────┴────────────────┴──────────────┴──────────────┴──────────────┴───────┘
```

---

## Data Flow

### When a Customer Books Maid Service:

1. **Lead Created** → CUSTOMERS sheet
   - Customer ID generated (C001, C002...)
   - Status: "New Lead"
   - All customer details saved

2. **Booking Confirmed** → BOOKINGS sheet
   - Booking ID generated (B001, B002...)
   - All booking details saved
   - Status: "Confirmed"

3. **Customer Status Updated** → CUSTOMERS sheet
   - Status changed to "Booking Confirmed"

### When a Customer Books Cleaning Service:

1. **Request Created** → CLEANING_BOOKINGS sheet
   - Booking ID generated (CB12345...)
   - All service details saved
   - Status: "New Request"

---

## Status Values

### CUSTOMERS Sheet - Status Column (I):
- `New Lead` - Initial inquiry
- `Booking Confirmed` - Booking completed
- `Follow-up Required` - Needs follow-up
- `Not Interested` - Customer declined
- `Invalid Number` - Wrong contact

### BOOKINGS Sheet - Status Column (L):
- `Confirmed` - Booking confirmed
- `Active` - Maid is working
- `Completed` - Service completed
- `Cancelled` - Booking cancelled
- `Replacement Requested` - Customer wants different maid

### CLEANING_BOOKINGS Sheet - Status Column (I):
- `New Request` - Initial request
- `Confirmed` - Service confirmed
- `Completed` - Service completed
- `Cancelled` - Request cancelled
- `Rescheduled` - Date changed

---

## Important Notes

### ⚠️ Tab Names Must Match Exactly:
```javascript
const SHEET_CUSTOMERS = "CUSTOMERS";
const SHEET_BOOKINGS  = "BOOKINGS";
const SHEET_MAIDS     = "MAIDS";
const SHEET_CLEANING_BOOKINGS = "CLEANING_BOOKINGS";
```

If your tab names don't match exactly (case-sensitive), the bot will fail to write data.

### ⚠️ Column Order Matters:
The bot writes data in a specific column order. Don't rearrange columns without updating the code.

### ⚠️ Don't Delete Row 1:
Row 1 contains headers. The bot starts writing from Row 2 onwards.

### ✅ You Can Add Extra Columns:
Feel free to add columns after the required ones for your own tracking (e.g., "Payment Status", "Rating", etc.)

---

## Testing Your Setup

### Test 1: Check Sheet Names
```javascript
// In sheets.js, these should match your tab names:
SHEET_CUSTOMERS = "CUSTOMERS"
SHEET_BOOKINGS  = "BOOKINGS"
SHEET_CLEANING_BOOKINGS = "CLEANING_BOOKINGS"
```

### Test 2: Verify Permissions
1. Share your Google Sheet with the service account email
2. Give "Editor" access
3. Service account email looks like: `your-bot@project-id.iam.gserviceaccount.com`

### Test 3: Run a Test Booking
1. Start the bot: `node index.js`
2. Complete a booking flow
3. Check if data appears in Google Sheets
4. Verify all columns are filled correctly

---

## Troubleshooting

### Problem: "Error: Unable to parse range"
**Solution:** Check that tab names match exactly (case-sensitive)

### Problem: "Error: The caller does not have permission"
**Solution:** Share the sheet with your service account email

### Problem: "Data not appearing in sheet"
**Solution:** 
1. Check console logs for errors
2. Verify SPREADSHEET_ID in .env
3. Verify credentials are correct

### Problem: "Wrong column data"
**Solution:** Ensure headers are in the correct order as specified above

---

## Sample Google Sheet Template

You can copy this template: [Create your own based on the structure above]

Or manually create following the instructions in this guide.

---

## Summary

### Required Sheets:
1. ✅ **CUSTOMERS** - 12 columns (A-L)
2. ✅ **BOOKINGS** - 17 columns (A-Q)
3. ✅ **CLEANING_BOOKINGS** - 11 columns (A-K)
4. ⚪ **MAIDS** - Optional (for reference)

### Key Points:
- Tab names are case-sensitive
- Column order matters
- Row 1 = Headers
- Data starts from Row 2
- Service account needs Editor access
- Spreadsheet ID goes in .env file

Your Google Sheets setup is now complete! 🎉
