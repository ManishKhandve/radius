// ============================================================
// index.js — WhatsApp client + Express server + QR page
// ============================================================

const { Client, RemoteAuth } = require("whatsapp-web.js");
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
const { SupabaseStore } = require("./supabase-store");
const { addInvite } = require("./invite-store");
require("dotenv").config();
const express = require("express");
const QRCode = require("qrcode");
const flow = require("./flow");
const config = require("./config");
const sheets = require("./sheets");

// ─── Global crash guards ──────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[crash] Uncaught exception (server kept alive):", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("[crash] Unhandled rejection (server kept alive):", reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

// ─── State ───────────────────────────────────────────────────
let currentQR = null;
let botReady  = false;
let client    = null;

// ─── Express Routes ──────────────────────────────────────────

app.get("/", async (_req, res) => {
  if (botReady) return res.send(statusPage("connected"));
  if (currentQR) {
    try {
      const qrDataUrl = await QRCode.toDataURL(currentQR, { width: 300 });
      return res.send(statusPage("qr", qrDataUrl));
    } catch (e) {
      return res.send(statusPage("error"));
    }
  }
  return res.send(statusPage("initializing"));
});

app.get("/status", (_req, res) => {
  res.json({
    connected: botReady,
    activeSessions: flow.activeSessionCount(),
    uptime: process.uptime(),
  });
});

app.get("/ping", (_req, res) => res.send("pong"));

// GET /qr — returns latest QR as JSON for polling
app.get("/qr", async (_req, res) => {
  if (botReady)   return res.json({ status: "connected" });
  if (!currentQR) return res.json({ status: "waiting" });
  try {
    const qrDataUrl = await QRCode.toDataURL(currentQR, { width: 300 });
    res.json({ status: "qr", qr: qrDataUrl });
  } catch {
    res.json({ status: "error" });
  }
});

// GET /admin?token=SECRET — admin panel with send form
app.get("/admin", (req, res) => {
  const { token } = req.query;
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  res.send(adminPage(token));
});

// GET /send?to=91XXXXXXXXXX&token=SECRET — admin initiates conversation
app.get("/send", async (req, res) => {
  const { to, token } = req.query;

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  if (!to) {
    return res.status(400).send("Missing ?to= phone number");
  }
  if (!client || !botReady) {
    return res.status(503).send("Bot not ready yet — try again in a moment");
  }

  // Normalize to WhatsApp ID format
  const phone = to.replace(/[^0-9]/g, "") + "@c.us";

  try {
    await addInvite(phone);
    await client.sendMessage(phone, config.adminIntroMessage);
    res.send(`✅ Message sent to ${phone}`);
  } catch (err) {
    console.error("[send] Error:", err.message);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// POST /verify-payment — called by Google Apps Script when admin ticks checkbox
app.post("/verify-payment", async (req, res) => {
  const { token, phone, bookingId, name, lang } = req.body;

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  if (!phone || !bookingId) {
    return res.status(400).json({ error: "Missing phone or bookingId" });
  }
  if (!client || !botReady) {
    return res.status(503).json({ error: "Bot not ready" });
  }

  const whatsappId = phone.replace(/[^0-9]/g, "") + "@c.us";

  try {
    const msg = config.paymentVerifiedMessage(name || "there", bookingId, lang || "en");
    await client.sendMessage(whatsappId, msg);
    await sheets.markPaymentVerified(bookingId);
    console.log(`[verify-payment] Confirmed: ${bookingId} → ${whatsappId}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[verify-payment] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── HTML helper ─────────────────────────────────────────────
function statusPage(mode, qrDataUrl) {
  const title = config.businessName + " — WhatsApp Bot";
  if (mode === "connected") {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.dot{display:inline-block;width:14px;height:14px;border-radius:50%;background:#22c55e;margin-right:8px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
h1{margin:0 0 .5rem}p{color:#94a3b8;margin:.25rem 0}</style></head>
<body><div class="card"><h1><span class="dot"></span> Bot is Live</h1><p>${config.businessName}</p><p style="font-size:.85rem;margin-top:1rem">Sessions: <span id="s">—</span> | Uptime: <span id="u">—</span></p></div>
<script>setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{document.getElementById('s').textContent=d.activeSessions;document.getElementById('u').textContent=Math.floor(d.uptime)+'s'}),5000)</script></body></html>`;
  }
  if (mode === "qr") {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:2rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:340px;width:100%}
img{border-radius:.5rem;margin:.75rem 0;width:260px;height:260px}
.badge{display:inline-block;padding:.25rem .75rem;border-radius:999px;font-size:.75rem;margin-bottom:.5rem}
.fresh{background:#14532d;color:#86efac}
.stale{background:#713f12;color:#fde68a}
</style></head>
<body><div class="card">
  <h2 style="margin-bottom:.25rem">📱 Scan to Link WhatsApp</h2>
  <p style="color:#94a3b8;font-size:.82rem;margin-bottom:.5rem">Open WhatsApp → Linked Devices → Link a Device</p>
  <span class="badge fresh" id="badge">🟢 Fresh QR</span><br>
  <img id="qrimg" src="${qrDataUrl}" alt="QR Code"/>
  <p style="color:#64748b;font-size:.75rem" id="hint">Auto-refreshes every 15 sec — scan immediately after refresh</p>
</div>
<script>
  let countdown = 15;
  setInterval(async () => {
    countdown--;
    document.getElementById('hint').textContent = 'Refreshing in ' + countdown + 's — scan immediately after';
    if (countdown <= 3) {
      document.getElementById('badge').className = 'badge stale';
      document.getElementById('badge').textContent = '🟡 Expiring…';
    }
    if (countdown <= 0) {
      countdown = 15;
      try {
        const r = await fetch('/qr');
        const d = await r.json();
        if (d.status === 'connected') {
          document.querySelector('.card').innerHTML = '<h2>✅ Bot is Live!</h2><p style="color:#86efac">WhatsApp linked successfully.</p>';
        } else if (d.status === 'qr' && d.qr) {
          document.getElementById('qrimg').src = d.qr;
          document.getElementById('badge').className = 'badge fresh';
          document.getElementById('badge').textContent = '🟢 Fresh QR';
        }
      } catch(e) {}
    }
  }, 1000);
</script>
</body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta http-equiv="refresh" content="15">
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem}</style></head>
<body><div class="card"><h2>⏳ Starting…</h2><p style="color:#94a3b8">WhatsApp client is initializing. Please wait.</p><p style="color:#64748b;font-size:.75rem">Page refreshes every 15 seconds</p></div></body></html>`;
}

// ─── Admin Panel HTML ─────────────────────────────────────────
function adminPage(token) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CLEANLY — Send Message</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0a1628; color: #e2e8f0; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 1rem; }
    .card { background: #1e293b; border-radius: 1rem; padding: 2rem; width: 100%; max-width: 420px; box-shadow: 0 8px 32px rgba(0,0,0,.4); }
    h2 { margin-bottom: 1.5rem; font-size: 1.2rem; color: #f1f5f9; }
    label { display: block; font-size: .85rem; color: #94a3b8; margin-bottom: .4rem; }
    input, select { width: 100%; padding: .75rem 1rem; border-radius: .5rem; border: 1px solid #334155; background: #0f172a; color: #f1f5f9; font-size: 1rem; margin-bottom: 1rem; outline: none; }
    input:focus, select:focus { border-color: #38bdf8; }
    button { width: 100%; padding: .85rem; border-radius: .5rem; border: none; background: #22c55e; color: #fff; font-size: 1rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #16a34a; }
    button:disabled { background: #334155; cursor: not-allowed; }
    .result { margin-top: 1rem; padding: .75rem 1rem; border-radius: .5rem; font-size: .9rem; display: none; }
    .result.ok  { background: #14532d; color: #86efac; }
    .result.err { background: #4c0519; color: #fca5a5; }
    .hint { font-size: .78rem; color: #64748b; margin-top: -.5rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
<div class="card">
  <h2>📤 Send Intro Message</h2>

  <label>Country Code + Number</label>
  <input type="tel" id="phone" placeholder="919876543210" inputmode="numeric" />
  <p class="hint">Include country code, no + or spaces. E.g. 919876543210</p>

  <button id="btn" onclick="send()">Send Message</button>
  <div class="result" id="result"></div>
</div>

<script>
  async function send() {
    const phone = document.getElementById('phone').value.replace(/\\D/g, '');
    const btn   = document.getElementById('btn');
    const result = document.getElementById('result');

    if (phone.length < 10) {
      result.textContent = '⚠️ Enter a valid phone number';
      result.className = 'result err';
      result.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    result.style.display = 'none';

    try {
      const res = await fetch('/send?to=' + phone + '&token=${token}');
      const text = await res.text();
      result.textContent = res.ok ? '✅ ' + text : '❌ ' + text;
      result.className = 'result ' + (res.ok ? 'ok' : 'err');
    } catch (e) {
      result.textContent = '❌ Network error';
      result.className = 'result err';
    }

    result.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Send Message';
    if (document.getElementById('phone')) document.getElementById('phone').value = '';
  }

  document.getElementById('phone').addEventListener('keydown', e => {
    if (e.key === 'Enter') send();
  });
</script>
</body>
</html>`;
}

// ─── Bootstrap: init store, wire up WhatsApp client ──────────
async function bootstrap() {
  const supabase = createSupabaseClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  const store = new SupabaseStore({ supabase });

  client = new Client({
    authStrategy: new RemoteAuth({
      clientId: "cleanly-bot",
      store,
      backupSyncIntervalMs: 5 * 60 * 1000, // save session to Supabase every 5 min
    }),
    puppeteer: {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    },
  });

  client.on("qr", (qr) => {
    currentQR = qr;
    console.log("[wa] QR received — scan at http://localhost:" + PORT);
  });

  client.on("ready", () => {
    botReady = true;
    currentQR = null;
    console.log("[wa] ✅ WhatsApp client is ready!");
  });

  client.on("remote_session_saved", () => {
    console.log("[wa] Session saved to Supabase");
  });

  client.on("auth_failure", (msg) => {
    console.error("[wa] Auth failure:", msg);
  });

  client.on("disconnected", (reason) => {
    botReady = false;
    console.warn("[wa] Disconnected:", reason);
    client.initialize().catch((e) => console.error("[wa] Re-init error:", e.message));
  });

  client.on("message", async (msg) => {
    try {
      if (msg.from.endsWith("@g.us")) return;
      if (msg.type !== "chat" && msg.type !== "image") return;

      const replies = await flow.handleMessage(msg);

      for (const reply of replies) {
        if (typeof reply === "object" && reply._adminAlert) {
          try {
            await client.sendMessage(config.ownerWhatsApp, reply._adminAlert);
          } catch (e) {
            console.error("[wa] Failed to send admin alert:", e.message);
          }
          continue;
        }
        if (typeof reply === "string") {
          try {
            await msg.reply(reply);
          } catch (e) {
            console.error("[wa] Failed to send reply:", e.message);
          }
        }
      }
    } catch (err) {
      console.error("[wa] Message handler error:", err);
      try {
        await msg.reply(config.errorMessage);
        flow.clearSession(msg.from);
      } catch (_) { /* swallow */ }
    }
  });

  // Initialize with retries
  for (let i = 1; i <= 3; i++) {
    try {
      console.log(`[wa] Initializing client (attempt ${i}/3)...`);
      await client.initialize();
      return;
    } catch (err) {
      console.error(`[wa] Init attempt ${i} failed:`, err.message);
      try { await client.destroy(); } catch (_) {}
      if (i < 3) {
        console.log("[wa] Retrying in 5 seconds...");
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
  console.error("[wa] All init attempts failed. Restart the process.");
}

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Express running on http://localhost:${PORT}`);
});

bootstrap().catch((err) => {
  console.error("[boot] Fatal error:", err);
  process.exit(1);
});
