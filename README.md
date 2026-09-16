# White-label WhatsApp CRM

Wati-style WhatsApp platform for **any business**. One deploy = one brand.
Rebrand entirely through environment variables — no code changes.

Customers message you on WhatsApp; your team replies from a shared inbox,
sends template broadcasts, and builds no-code automations — all in one place.

## Features

| Area | What you get |
|------|--------------|
| 💬 Shared inbox | Multi-agent conversations, assignment, labels, notes, follow-up reminders, quick replies |
| 🤖 Bot | Generic auto-responder: welcome message, keyword rules (`BOT_RULES_JSON`), human handoff. `BOT_ENABLED=false` = pure human inbox |
| 📣 Broadcasts | Template campaigns with delivery/read/reply tracking + retry-failed |
| ⚡ Automation | Visual workflow builder: manual / schedule / new-contact / follow-up-due triggers, delays, loops, conditions, template sends |
| 🧠 AI assist | Per-chat insights, suggested replies, Hindi/Hinglish translation, draft polish (OpenRouter, optional) |
| 🔔 Notifications | Follow-up reminders + delivery-failure alerts (in-app + optional admin WhatsApp) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| WhatsApp | Meta WhatsApp Cloud API |
| Web Server | Express.js |
| Database | Neon Postgres (`pg`) — optional, runs empty without it |
| Hosting | Render.com |
| Keep-alive | UptimeRobot (5-min ping on `/ping`) |

## 1. Prerequisites

- Node.js v18+, GitHub + Render.com accounts
- Neon Postgres database (**optional** — without `DATABASE_URL` the app runs
  with empty, non-persisted data; on a fresh database run `neon-schema.sql`
  once: `psql $DATABASE_URL -f neon-schema.sql`)
- Meta WhatsApp Business Account: **Phone Number ID**, permanent **Access Token**, chosen **Verify Token**

## 2. Configure (no code changes)

Copy `.env.example` → `.env` and set at minimum:

```bash
BUSINESS_NAME="Acme Traders"
CONTACT_NUMBER="+91 XXXXXXXXXX"
WELCOME_MESSAGE="👋 Welcome to Acme! How can we help?"
SUPABASE_URL=…  SUPABASE_KEY=…
META_ACCESS_TOKEN=…  META_PHONE_NUMBER_ID=…  META_VERIFY_TOKEN=…
ADMIN_TOKEN=<strong random string>
OWNER_PHONE=<admin alerts, optional>
```

Full branding + bot options (`BUSINESS_TYPE`, `BRAND_COLOR`, `LOGO_URL`,
`BOT_RULES_JSON`, `FALLBACK_MESSAGE`, …) are documented in `.env.example`.

## 3. Run locally

```bash
npm install
npm run dev        # PORT from .env (default 3000)
```

Expose with ngrok (`ngrok http 3000`), set the Meta webhook to
`https://<id>.ngrok-free.app/wati-webhook` with your verify token,
subscribe to `messages`, and send “hi” to the business number.

## 4. Deploy on Render

Push to GitHub → Render **New → Web Service** (`npm install` / `node index.js`),
add the env vars above, update the Meta webhook to
`https://your-app.onrender.com/wati-webhook`, and add an UptimeRobot
HTTP monitor on `https://your-app.onrender.com/ping` (5 min).

## 5. How it works

- Webhook `POST /wati-webhook` → per-user serial queue → `flow.js`
  (welcome / keyword / handoff rules) → replies via Meta Graph API.
- Anything the bot doesn't answer stays in the **inbox** (`/chat`)
  for humans. Agent replies auto-pause the bot for that chat.
- Bulk/out-of-window messaging goes through **broadcasts** and
  **automation** (`/automation`) using Meta-approved templates.
- Sessions are in-memory (survive via UptimeRobot keep-alive);
  all business data is permanent in Neon Postgres.

## API Endpoints

| Route | Method | Description |
|-------|--------|------------|
| `/wati-webhook` | GET/POST | Meta verification + incoming messages/statuses |
| `/api/branding` | GET | Public business name/colors (white-label UI) |
| `/api/chat/*` | GET/POST | Contacts, messages, send, pause, labels, CRM fields |
| `/api/broadcast` | POST | Start template campaign (+ status/retry endpoints) |
| `/api/workflows/*` | * | Automation CRUD, publish, run-now, field values |
| `/api/ai/*` | * | Insights, translate, ask, polish-draft |
| `/api/insights` | GET | Missed opportunities + today's tasks |
| `/api/notifications` | GET/POST | Follow-ups + alerts |
| `/status`, `/ping` | GET | Health + send metrics |

## Project Structure

```
├── index.js            # Express server + Meta API integration
├── flow.js             # Generic bot engine (welcome/keywords/handoff)
├── config.js           # Branding + bot settings (env-driven)
├── chat-store.js       # Neon: contacts/messages/notifications/users
├── db.js               # pg pool + no-database fallback
├── neon-schema.sql     # Full database schema (run once on a fresh DB)
├── workflow-engine.js  # Automation execution engine
├── workflow-store.js   # Automation persistence
├── ai-assistant.js     # OpenRouter per-chat AI layer
├── livechat.html       # Inbox + CRM dashboard (/chat)
├── automation.html     # Workflow builder (/automation)
├── login.html          # Agent login (/login)
└── render.yaml         # Render.com deployment config
```

## License

ISC
