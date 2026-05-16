// ============================================================
// index.js — WhatsApp client + Express server + QR page
// ============================================================

const { Client, RemoteAuth } = require("whatsapp-web.js");
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
const { SupabaseStore } = require("./supabase-store");
require("dotenv").config();
const express = require("express");
const QRCode = require("qrcode");
const flow = require("./flow");
const config = require("./config");

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
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta http-equiv="refresh" content="30">
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:2rem;border-radius:1rem;box-shadow:0 8px 32px rgba(0,0,0,.4)}
img{border-radius:.5rem;margin:1rem 0}</style></head>
<body><div class="card"><h2>📱 Scan QR to Link WhatsApp</h2><img src="${qrDataUrl}" alt="QR Code"/><p style="color:#94a3b8;font-size:.85rem">Open WhatsApp → Linked Devices → Link a Device</p><p style="color:#64748b;font-size:.75rem">Page refreshes every 30 seconds</p></div></body></html>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta http-equiv="refresh" content="15">
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a1628;color:#e2e8f0}
.card{text-align:center;background:#1e293b;padding:3rem;border-radius:1rem}</style></head>
<body><div class="card"><h2>⏳ Starting…</h2><p style="color:#94a3b8">WhatsApp client is initializing. Please wait.</p><p style="color:#64748b;font-size:.75rem">Page refreshes every 15 seconds</p></div></body></html>`;
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
      if (msg.type !== "chat") return;

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
          await msg.reply(reply);
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
