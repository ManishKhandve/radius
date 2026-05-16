# 📋 How to Get Your Google Sheets SPREADSHEET_ID

## Quick Answer

The **SPREADSHEET_ID** is found in your Google Sheet's URL.

---

## 🎯 Step-by-Step Instructions

### Step 1: Open Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Open the spreadsheet you want to use for the bot
   - OR create a new one if you haven't already

### Step 2: Look at the URL

Your Google Sheet URL looks like this:

```
https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z/edit#gid=0
                                      ↑_____________________________________________↑
                                                THIS IS YOUR SPREADSHEET_ID
```

### Step 3: Copy the SPREADSHEET_ID

The SPREADSHEET_ID is the **long string of letters and numbers** between `/d/` and `/edit`

**Example:**
```
URL: https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z/edit#gid=0

SPREADSHEET_ID: 1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z
```

### Step 4: Add to .env File

1. Open your `.env` file
2. Find the line: `SPREADSHEET_ID=""`
3. Paste your ID between the quotes:
   ```
   SPREADSHEET_ID="1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z"
   ```
4. Save the file

---

## 🆕 Don't Have a Google Sheet Yet?

### Create One Now:

1. **Go to Google Sheets**: https://sheets.google.com
2. **Click** "Blank" to create a new spreadsheet
3. **Name it**: "CLEANLY Bot Data" (or any name you like)
4. **Create 3 tabs** (sheets) with these EXACT names:
   - `CUSTOMERS`
   - `BOOKINGS`
   - `CLEANING_BOOKINGS`

5. **Add column headers** to each tab (see structure below)

---

## 📊 Quick Sheet Structure

### Tab 1: CUSTOMERS

**Row 1 (Headers):**
```
Customer ID | Name | WhatsApp Number | Flat | Work Type | Timing | Budget | Enquiry Date | Status | Assigned Maid ID | Source | Notes | City | Area | Language
```

### Tab 2: BOOKINGS

**Row 1 (Headers):**
```
Booking ID | Customer Name | Customer WhatsApp | Maid Name | Maid ID | Work Type | Timing | Start Date | Monthly Salary | Flat | Booking Date | Status | Commission Paid | Follow-up Day 1 | Follow-up Day 2 | Follow-up Day 3 | Monthly Check-in | Selected Plan | City | Area | Language
```

### Tab 3: CLEANING_BOOKINGS

**Row 1 (Headers):**
```
Booking ID | Customer Name | WhatsApp Number | Service Type | Details | Location | Preferred Date | Booking Date | Status | Source | Notes | Estimated Price | Language
```

**Pro Tip:** Copy the headers from `UPDATED_GOOGLE_SHEETS_SETUP.md` for the complete structure.

---

## 🔐 Important: Share Access with Service Account

After creating your sheet, you need to give the bot access:

### Step 1: Find Your Service Account Email

1. Look in your project folder for a file like:
   - `service-account.json`
   - `credentials.json`
   - Or any `.json` file with Google credentials

2. Open it and find the `client_email` field:
   ```json
   {
     "type": "service_account",
     "project_id": "your-project",
     "client_email": "your-bot@your-project.iam.gserviceaccount.com",
     ...
   }
   ```

3. Copy that email address

### Step 2: Share Your Google Sheet

1. Open your Google Sheet
2. Click the **"Share"** button (top right)
3. Paste the service account email
4. Set permission to **"Editor"**
5. **Uncheck** "Notify people" (it's a bot, not a person)
6. Click **"Share"**

---

## ✅ Verification

After adding the SPREADSHEET_ID to your `.env` file:

1. **Restart the bot** if it's running
2. **Test a booking** (complete a full flow)
3. **Check your Google Sheet** - you should see data appear!

---

## 🐛 Troubleshooting

### Error: "The caller does not have permission"

**Solution:** You forgot to share the sheet with the service account email.
- Go back to Step 2 above and share the sheet

### Error: "Unable to parse range"

**Solution:** Your tab names don't match exactly.
- Must be: `CUSTOMERS`, `BOOKINGS`, `CLEANING_BOOKINGS`
- Case-sensitive! All UPPERCASE

### Error: "Requested entity was not found"

**Solution:** Wrong SPREADSHEET_ID
- Double-check you copied the correct part of the URL
- Make sure there are no extra spaces

### Data Not Appearing

**Solution:** Check these:
1. Is SPREADSHEET_ID in `.env` file?
2. Did you restart the bot after adding it?
3. Is the sheet shared with service account?
4. Are tab names exactly correct?

---

## 📝 Example .env File

Your `.env` file should look like this:

```env
BUSINESS_NAME="CLEANLY Services"
OWNER_WHATSAPP="918767572043@c.us"
GLIDE_APP_URL="https://your-app.glideapp.io"
WORKING_HOURS="Mon–Sat: 10 AM – 7 PM"
ADDRESS="pune"
CONTACT_NUMBER="+91 8767572043"
SPREADSHEET_ID="1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z"

# ─── Supabase Configuration ──────────────────────────────────
SUPABASE_URL=https://ikwyrrzipzfbyzmkrfmu.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🎉 That's It!

Once you have:
1. ✅ Created your Google Sheet
2. ✅ Set up the 3 tabs with headers
3. ✅ Copied the SPREADSHEET_ID from the URL
4. ✅ Added it to your `.env` file
5. ✅ Shared the sheet with your service account

Your bot will automatically save all booking data to Google Sheets! 📊

---

## 🆘 Still Need Help?

If you're stuck, check:
1. `UPDATED_GOOGLE_SHEETS_SETUP.md` - Complete sheet structure
2. `GOOGLE_SHEETS_SETUP.md` - Original setup guide
3. Console logs when bot runs - shows any Google Sheets errors

**Common Issue:** If you see "service account" errors, you might not have the credentials file set up. Check your project for `service-account.json` or similar.
