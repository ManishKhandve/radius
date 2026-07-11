# Maid Service — WhatsApp Chatbot

Automated WhatsApp chatbot for a maid placement business.  
Customers chat with the bot, browse maid profiles, and book — all inside WhatsApp.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| WhatsApp | Meta WhatsApp Cloud API |
| Web Server | Express.js |
| Database | Google Sheets API v4 |
| Hosting | Render.com (free tier) |
| Keep-alive | UptimeRobot (5-min ping) |

---

## 1. Prerequisites

- **Node.js** v18+ installed locally
- **GitHub** account (to push code for Render)
- **Render.com** account (free)
- **Google account** (for Sheets + service account)
- A **Meta WhatsApp Business Account** (with a verified phone number) and an app on the Meta Developer Dashboard.

---

## 2. Google Sheets Setup

1. Go to [Google Sheets](https://sheets.google.com) → **Create a new spreadsheet**
2. Create **3 tabs** (rename the sheet tabs at the bottom):

### Tab: MAIDS
Add these headers in Row 1:
`Maid ID | Full Name | Age | Work Type | Timing | Languages | Experience (Years) | Budget Range | Area Available | Reference Check | Photo Link | Glide Profile ID | Status | Notes`

### Tab: CUSTOMERS
`Customer ID | Name | WhatsApp Number | Flat/Area | Work Type Needed | Timing Preference | Budget | Enquiry Date | Status | Assigned Maid ID | Source | Notes`

### Tab: BOOKINGS
`Booking ID | Customer Name | Customer WhatsApp | Maid Name | Maid ID | Work Type | Timing | Start Date | Monthly Salary | Flat/Address | Booking Date | Status | Commission Paid | Follow-up Day 1 | Follow-up Day 2 | Follow-up Day 3 | Monthly Check-in`

3. Copy the **Spreadsheet ID** from the URL:
`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit`

---

## 3. Google Service Account Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a **new project** (e.g. "Maid Bot")
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a **Service Account**:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Give it any name → Done
5. Create a **JSON key**:
   - Click the service account → Keys tab → Add Key → JSON → Download
6. Rename the downloaded file to `credentials.json`
7. Place it in the **project root** folder
8. Copy the **service account email** (looks like `xxx@project.iam.gserviceaccount.com`)
9. Go to your Google Sheet → **Share** → paste the service account email → give **Editor** access

---

## 4. Configure config.js

Open `config.js` and fill in:

| Setting | What to put |
|---------|------------|
| `businessName` | Your business name |
| `ownerWhatsApp` | Your WhatsApp number: `91XXXXXXXXXX@c.us` |
| `glideAppUrl` | Link to your Glide maid-browsing app |
| `contactNumber` | Display phone number for customers |
| `address` | Your city/office address |

---

## 5. Meta Cloud API Setup

1. Go to the [Meta Developer Dashboard](https://developers.facebook.com) and create an App.
2. Add the **WhatsApp** product.
3. Note down your **Phone Number ID** and generate a permanent **Access Token**.
4. Decide on a **Verify Token** (a random string you choose) to verify webhooks.

---

## 6. Test Locally

To test locally, you need a public URL for Meta's webhook to hit your server.

```bash
# Install dependencies
npm install

# Set your env variables locally in a .env file:
# META_ACCESS_TOKEN=your_token
# META_PHONE_NUMBER_ID=your_id
# META_VERIFY_TOKEN=your_verify_token

# Start the bot
npm run dev
```

1. Use a tool like **ngrok** to expose your local port 3000: `ngrok http 3000`
2. In Meta App Dashboard, go to **Webhooks** and configure your webhook URL to `https://<ngrok_id>.ngrok-free.app/wati-webhook`.
3. Use the **Verify Token** you chose.
4. Subscribe to the `messages` field.
5. Send "hi" to your bot's WhatsApp number to test the flow.

---

## 7. Deploy on Render

> **Important:** Do NOT push `credentials.json` to GitHub — it's in `.gitignore`.

1. Push your code to a **GitHub repository**
2. Go to [Render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
5. Add **Environment Variables:**
   - `SPREADSHEET_ID` = your Google Sheet ID
   - `GOOGLE_CREDENTIALS_PATH` = `./credentials.json`
   - `META_ACCESS_TOKEN` = from Meta App Dashboard
   - `META_PHONE_NUMBER_ID` = from Meta App Dashboard
   - `META_VERIFY_TOKEN` = your chosen verify token
6. For `credentials.json` on Render:
   - Option A: Add the JSON content as a secret file via Render dashboard
   - Option B: Base64 encode it and decode in your start script
7. Click **Deploy**
8. Update the Meta Webhook URL to your Render domain: `https://your-app.onrender.com/wati-webhook`.

---

## 8. Set Up UptimeRobot (CRITICAL for 24/7)

This is **essential** — without it, Render's free tier sleeps after 15 minutes of inactivity, killing your bot.

1. Go to [UptimeRobot](https://uptimerobot.com) → create a **free account**
2. Click **Add New Monitor**
3. Settings:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** Maid Bot Ping
   - **URL:** `https://your-app.onrender.com/ping`
   - **Monitoring Interval:** 5 minutes
4. Save

This pings your `/ping` endpoint every 5 minutes, keeping Render alive.

---

## 9. How Sessions Work

| Component | Storage | Persistence |
|-----------|---------|------------|
| Customer chat sessions | JavaScript `Map` (RAM) | Survives as long as process is alive |
| Customer/booking data | Google Sheets | Permanent |

- **UptimeRobot** prevents Render from sleeping → RAM sessions stay active
- If Render ever restarts (rare deploy/maintenance), customers just type "hi" to restart.
- Meta Cloud API operates statelessly without QR code scanning, so login persists forever as long as your access token is valid.

---

## Chat Flow Diagram

```
Customer sends "hi"
        │
        ▼
   ┌─────────┐
   │ Welcome  │
   └────┬─────┘
        ▼
   ┌──────────┐
   │ Work Type │  (1-4)
   └────┬──────┘
        ▼
   ┌─────────┐
   │ Timing  │  (1-2)
   └────┬────┘
        ▼
   ┌─────────┐
   │ Budget  │  (1-4)  → Saves lead to Google Sheets
   └────┬────┘
        ▼
   ┌────────────┐
   │ Glide Link │  (browse maids)
   └────┬───────┘
        ▼
   ┌─────────────┐
   │ Maid Choice │  (name or ID)
   └────┬────────┘
        ▼
   ┌──────────────┐
   │ Collect Flat │  (address)
   └────┬─────────┘
        ▼
   ┌──────────────┐
   │ Collect Date │  (start date)
   └────┬─────────┘
        ▼
   ┌──────────┐
   │ Confirm  │  1 = ✅  |  2 = ❌
   └────┬─────┘
        ▼
   Booking saved to Sheets
   Owner gets WhatsApp alert
```

---

## API Endpoints

| Route | Method | Description |
|-------|--------|------------|
| `/wati-webhook` | GET | Meta Cloud API webhook verification |
| `/wati-webhook` | POST | Meta Cloud API incoming messages |
| `/status` | GET | JSON: `{ activeSessions, uptime }` |
| `/ping` | GET | Returns "pong" — for UptimeRobot |

---

## Error Handling

- Invalid input at any step → re-sends the current question
- "hi" / "hello" / "menu" / "start" / "help" → restarts from welcome
- Google Sheets write fails → logged, but flow continues normally
- Meta Cloud API fails → logged and retried with exponential backoff (unless 4xx error).

---

## Project Structure

```
chat flow/
├── index.js          # Express server + Meta API integration
├── flow.js           # Chat flow state machine
├── sheets.js         # Google Sheets API helpers
├── config.js         # Business settings + message templates
├── package.json      # Dependencies
├── render.yaml       # Render.com deployment config
├── .gitignore        # Ignores node_modules, credentials
├── credentials.json  # Google service account key (DO NOT COMMIT)
└── README.md         # This file
```

---

## Testing

This project includes a comprehensive Playwright test suite with **92 automated tests**.

### Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Run all tests
npm test

# View test summary
npm run test:summary

# Interactive testing
npm run test:ui
```

### Test Coverage

- ✅ **API Endpoints** (12 tests)
- ✅ **Conversation Flows** (35 tests)
- ✅ **Module Tests** (15 tests)
- ✅ **Integration Tests** (20 tests)
- ✅ **Performance Tests** (10 tests)

### Documentation

- **Quick Setup**: `TEST_SETUP.md`
- **Testing Guide**: `TESTING.md`
- **Command Reference**: `TEST_COMMANDS.md`
- **Complete Guide**: `COMPLETE_TEST_GUIDE.md`
- **Implementation Summary**: `TEST_IMPLEMENTATION_SUMMARY.md`

### Test Commands

```bash
npm test                    # Run all tests
npm run test:ui            # Interactive UI
npm run test:api           # API tests only
npm run test:flow          # Flow tests only
npm run test:integration   # Integration tests
npm run test:performance   # Performance tests
npm run test:report        # View HTML report
```

For detailed testing information, see `COMPLETE_TEST_GUIDE.md`.

---

## License

ISC
