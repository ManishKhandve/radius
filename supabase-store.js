// ============================================================
// supabase-store.js — Baileys auth state persisted via Supabase Storage
// ============================================================
// Only the identity key (creds.json) is persisted. Pre-keys, sessions
// and sender-keys are intentionally NOT restored — they regenerate
// fresh on every restart, keeping them in sync with WhatsApp servers
// and preventing "Invalid PreKey ID" errors.
// ============================================================

const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs   = require('fs/promises');
const path = require('path');

const BUCKET     = 'whatsapp-sessions';
const AUTH_DIR   = '/tmp/baileys-auth';
const CREDS_FILE = 'creds.json';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function useSupabaseAuthState(supabase) {
  await fs.mkdir(AUTH_DIR, { recursive: true });

  // ── Restore creds.json from Supabase (best effort) ─────────────
  let restored = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(CREDS_FILE);
      if (data && !error) {
        await fs.writeFile(path.join(AUTH_DIR, CREDS_FILE), await data.text(), 'utf-8');
        console.log('[supabase-auth] ✅ Identity restored — same device, no QR needed');
        restored = true;
        break;
      }
      const notFound = error?.statusCode === 404 || error?.message?.toLowerCase().includes('not found');
      if (notFound) {
        console.log('[supabase-auth] First run — scan QR to create identity');
        break;
      }
      console.warn(`[supabase-auth] Restore attempt ${attempt}:`, error?.message);
    } catch (e) {
      console.warn(`[supabase-auth] Restore attempt ${attempt} exception:`, e.message);
    }
    if (attempt < 3) await delay(800 * attempt);
  }
  if (!restored) console.log('[supabase-auth] Starting with fresh identity');

  // ── Load local-file auth state ─────────────────────────────────
  const { state, saveCreds: _saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // ── Override saveCreds to also push creds.json to Supabase ─────
  const saveCreds = async () => {
    await _saveCreds();
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const content = await fs.readFile(path.join(AUTH_DIR, CREDS_FILE), 'utf-8');
        const { error } = await supabase.storage.from(BUCKET)
          .upload(CREDS_FILE, Buffer.from(content), { upsert: true, contentType: 'application/json' });
        if (!error) {
          console.log('[supabase-auth] Identity saved to Supabase');
          return;
        }
        console.error(`[supabase-auth] Save attempt ${attempt}:`, error.message);
      } catch (e) {
        console.error(`[supabase-auth] Save attempt ${attempt} exception:`, e.message);
      }
      if (attempt < 3) await delay(800 * attempt);
    }
    console.error('[supabase-auth] ❌ Could not save identity — QR may be needed on next cold start');
  };

  return { state, saveCreds };
}

module.exports = { useSupabaseAuthState };
