// ============================================================
// sheet-automations.js — Google Sheets Status Sync
// ============================================================
const { google } = require('googleapis');
const db = require('./db');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Ensure tables exist
async function initDb() {
  if (!db.hasDb) return;
  await db.q(`
    CREATE TABLE IF NOT EXISTS sheet_automation_config (
      id SERIAL PRIMARY KEY,
      spreadsheet_id TEXT,
      sheet_name TEXT,
      phone_col TEXT,
      status_col TEXT,
      templates JSONB NOT NULL DEFAULT '{}'::jsonb,
      links JSONB NOT NULL DEFAULT '{}'::jsonb,
      delays JSONB NOT NULL DEFAULT '{}'::jsonb,
      times JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.q(`DROP TABLE IF EXISTS sheet_sync_status;`);
  await db.q(`
    CREATE TABLE IF NOT EXISTS sheet_sync_status (
      phone TEXT PRIMARY KEY,
      sent_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
      entered_at JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

let sheets = null;
let isPublicMode = false;

try {
  const credPath = path.join(__dirname, 'credentials.json');
  let authOptions = { scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] };
  let hasAuth = false;

  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    const jsonStr = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8');
    authOptions.credentials = JSON.parse(jsonStr);
    hasAuth = true;
  } else if (process.env.GOOGLE_CREDENTIALS_JSON) {
    authOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    hasAuth = true;
  } else if (fs.existsSync(credPath)) {
    authOptions.keyFile = credPath;
    hasAuth = true;
  }

  if (hasAuth) {
    const auth = new google.auth.GoogleAuth(authOptions);
    sheets = google.sheets({ version: 'v4', auth });
    console.log('[sheet-automations] Google Auth loaded successfully.');
  } else {
    isPublicMode = true;
    console.log('[sheet-automations] No Google Auth found. Defaulting to Public Mode.');
  }
} catch (err) {
  console.error('[sheet-automations] Auth init error:', err);
  isPublicMode = true;
}

// Map column letter to index (A=0, B=1, Z=25, AA=26)
function colToIndex(col) {
  if (!col) return -1;
  let s = col.toUpperCase();
  let index = 0;
  for (let i = 0; i < s.length; i++) {
    index = index * 26 + (s.charCodeAt(i) - 64);
  }
  return index - 1;
}

// Fetch current config
async function getConfig() {
  if (!db.hasDb) return null;
  const c = await db.one('SELECT * FROM sheet_automation_config ORDER BY id DESC LIMIT 1');
  return c;
}

// Send Template using Meta Graph API
async function sendTemplate(phone, templateName, templateLink) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.warn('[sheet-automations] Missing Meta API credentials');
    return;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' }
    }
  };

  // If there's a link variable (assuming header or body variable for the link)
  // Since we only have "link" as input, we can inject it as a CTA button parameter or body parameter.
  // For generic handling, we will add it to body components if provided.
  if (templateLink) {
    payload.template.components = [
      {
        type: 'body',
        parameters: [{ type: 'text', text: templateLink }]
      }
    ];
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v17.0'}/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.error) {
      console.error(`[sheet-automations] Send failed to ${phone}:`, result.error.message);
    } else {
      console.log(`[sheet-automations] Sent template ${templateName} to ${phone}`);
    }
  } catch (e) {
    console.error(`[sheet-automations] Send error for ${phone}:`, e.message);
  }
}

// Main polling function
async function pollSheet() {
  if (!db.hasDb) return;
  if (!sheets && !isPublicMode) return;
  
  const cfg = await getConfig();
  if (!cfg || !cfg.sheet_name || !cfg.phone_col || !cfg.status_col) {
    return;
  }
  
  const spreadsheetId = process.env.SPREADSHEET_ID || cfg.spreadsheet_id;
  if (!spreadsheetId) return;

  const phoneIdx = colToIndex(cfg.phone_col);
  const statusIdx = colToIndex(cfg.status_col);
  if (phoneIdx === -1 || statusIdx === -1) return;

  try {
    let rows = [];
    if (sheets) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${cfg.sheet_name}!A:ZZ`,
      });
      rows = response.data.values || [];
    } else if (isPublicMode) {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(cfg.sheet_name)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let text = await res.text();
      // Google returns: /*O_o*/ google.visualization.Query.setResponse({ ... })
      text = text.replace(/.*\(/, '');
      text = text.substring(0, text.lastIndexOf(')'));
      const json = JSON.parse(text);
      if (json.table && json.table.rows) {
        rows = json.table.rows.map(r => r.c.map(cell => cell ? (cell.f || cell.v || '') : ''));
      }
    }

    if (rows.length === 0) return;

    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      let rawPhone = row[phoneIdx];
      let status = (row[statusIdx] || '').trim().toLowerCase();

      if (!rawPhone || !status) continue;
      
      let phone = String(rawPhone).replace(/[^0-9]/g, '');
      if (phone.length < 10) continue;

      // Check DB for this phone
      const record = await db.one('SELECT sent_counts, entered_at FROM sheet_sync_status WHERE phone = $1', [phone]);
      
      let sentCounts = record ? record.sent_counts : {};
      let enteredAt = record ? record.entered_at : {};
      let sentIndex = sentCounts[status] || 0;
      
      let dbNeedsUpdate = false;
      if (!enteredAt[status]) {
        enteredAt[status] = new Date().toISOString();
        dbNeedsUpdate = true;
      }

      // Check if we have templates for this status
      let templatesForStatus = cfg.templates[status] || [];
      let linksForStatus = cfg.links[status] || [];
      let delaysForStatus = cfg.delays[status] || [];
      let timesForStatus = cfg.times[status] || [];

      // If we haven't exhausted templates for this status, send the next one
      if (sentIndex < templatesForStatus.length) {
        let shouldSend = true;
        let delayDays = delaysForStatus[sentIndex] || 0;
        let targetTime = timesForStatus[sentIndex] || '';

        // Calculate target date-time based on when they entered the status
        let enterDate = new Date(enteredAt[status]);
        let targetDate = new Date(enterDate.getTime() + (delayDays * 24 * 60 * 60 * 1000));
        
        if (targetTime) {
          const [hh, mm] = targetTime.split(':');
          targetDate.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);
        }

        if (Date.now() < targetDate.getTime()) {
          shouldSend = false;
        }

        if (shouldSend) {
          const tplName = templatesForStatus[sentIndex];
          const tplLink = linksForStatus[sentIndex] || '';
          
          if (tplName && tplName.trim()) {
            await sendTemplate(phone, tplName.trim(), tplLink.trim());
          }

          // Update DB
          sentCounts[status] = sentIndex + 1;
          dbNeedsUpdate = true;
        }
      }

      if (dbNeedsUpdate) {
        await db.q(`
          INSERT INTO sheet_sync_status (phone, sent_counts, entered_at, updated_at) 
          VALUES ($1, $2, $3, now()) 
          ON CONFLICT (phone) DO UPDATE 
          SET sent_counts = $2, entered_at = $3, updated_at = now()
        `, [phone, db.jb(sentCounts), db.jb(enteredAt)]);
      }
    }
  } catch (err) {
    console.error('[sheet-automations] Poll error:', err.message);
  }
}

function startPolling() {
  initDb();
  // Poll every 5 minutes (300,000 ms)
  setInterval(pollSheet, 5 * 60 * 1000);
  console.log('[sheet-automations] Polling started (5m interval)');
  
  // Run once immediately on startup
  setTimeout(pollSheet, 5000);
}

module.exports = {
  startPolling,
  getConfig,
  saveConfig: async (data) => {
    if (!db.hasDb) return;
    await db.q('TRUNCATE sheet_automation_config RESTART IDENTITY');
    await db.q(`
      INSERT INTO sheet_automation_config (spreadsheet_id, sheet_name, phone_col, status_col, templates, links, delays, times)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      data.spreadsheet_id, 
      data.sheet_name, 
      data.phone_col, 
      data.status_col, 
      db.jb(data.templates), 
      db.jb(data.links),
      db.jb(data.delays),
      db.jb(data.times)
    ]);
  }
};
