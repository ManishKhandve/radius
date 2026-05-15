# Maid Service — WhatsApp Chatbot

Automated WhatsApp chatbot for a maid placement business.  
Customers chat with the bot, browse maid profiles, and book — all inside WhatsApp.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| WhatsApp | whatsapp-web.js (LocalAuth) |
| Web Server | Express.js |
| Database | Google Sheets API v4 |
| QR Display | qrcode npm package |
| Hosting | Render.com (free tier) |
| Keep-alive | UptimeRobot (5-min ping) |

---

## 1. Prerequisites

- **Node.js** v18+ installed locally
- **GitHub** account (to push code for Render)
- **Render.com** account (free)
- **Google account** (for Sheets + service account)
- A **WhatsApp number** that will act as the bot

---

## 2. Google Sheets Setup

1. Go to [Google Sheets](https://sheets.google.com) → **Create a new spreadsheet**
2. Create **3 tabs** (rename the sheet tabs at the bottom):

### Tab: MAIDS
Add these headers in Row 1:
```
Maid ID | Full Name | Age | Work Type | Timing | Languages | Experience (Years) | Budget Range | Area Available | Reference Check | Photo Link | Glide Profile ID | Status | Notes
```

### Tab: CUSTOMERS
```
Customer ID | Name | WhatsApp Number | Flat/Area | Work Type Needed | Timing Preference | Budget | Enquiry Date | Status | Assigned Maid ID | Source | Notes
```

### Tab: BOOKINGS
```
Booking ID | Customer Name | Customer WhatsApp | Maid Name | Maid ID | Work Type | Timing | Start Date | Monthly Salary | Flat/Address | Booking Date | Status | Commission Paid | Follow-up Day 1 | Follow-up Day 2 | Follow-up Day 3 | Monthly Check-in
```

3. Copy the **Spreadsheet ID** from the URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit
```

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

## 5. Test Locally

```bash
# Install dependencies
npm install

# Start the bot
node index.js
```

1. Open **http://localhost:3000** in your browser
2. You'll see a QR code — scan it with WhatsApp → **Linked Devices → Link a Device**
3. Once linked, the page shows "✅ Bot is Live"
4. Send "hi" from another WhatsApp number to test the flow

---

## 6. Deploy on Render

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
6. For `credentials.json` on Render:
   - Option A: Add the JSON content as a secret file via Render dashboard
   - Option B: Base64 encode it and decode in your start script
7. Click **Deploy**

---

## 7. Scan QR on Render

1. Open your Render URL (e.g. `https://maid-service-bot.onrender.com`)
2. Scan the QR code with WhatsApp → **Linked Devices**
3. Once scanned, the page shows "✅ Bot is Live"

> After the first scan, the session is saved to disk (`.wwebjs_auth`).  
> You won't need to scan again unless Render wipes the disk.

---

## 8. Set Up UptimeRobot (CRITICAL for 24/7)

This is **essential** — without it, Render's free tier sleeps after 15 minutes of inactivity, killing your bot and sessions.

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
| WhatsApp login session | `.wwebjs_auth/` folder (disk) | Survives process restarts |
| Customer/booking data | Google Sheets | Permanent |

- **UptimeRobot** prevents Render from sleeping → RAM sessions stay active
- If Render ever restarts (rare deploy/maintenance), customers just type "hi" to restart
- WhatsApp login persists on disk — no re-scan needed after restart

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
| `/` | GET | Status page or QR code scanner |
| `/status` | GET | JSON: `{ connected, activeSessions, uptime }` |
| `/ping` | GET | Returns "pong" — for UptimeRobot |

---

## Error Handling

- Invalid input at any step → re-sends the current question
- "hi" / "hello" / "menu" / "start" / "help" → restarts from welcome
- Google Sheets write fails → logged, but flow continues normally
- Unhandled error → sends "Something went wrong. Type hi to start again." and clears session
- All `client.on('message')` logic is wrapped in try/catch

---

## Project Structure

```
chat flow/
├── index.js          # WhatsApp client + Express server + QR page
├── flow.js           # Chat flow state machine
├── sheets.js         # Google Sheets API helpers
├── config.js         # Business settings + message templates
├── package.json      # Dependencies
├── render.yaml       # Render.com deployment config
├── .gitignore        # Ignores node_modules, auth, credentials
├── credentials.json  # Google service account key (DO NOT COMMIT)
└── README.md         # This file
```

---

## License

ISC
