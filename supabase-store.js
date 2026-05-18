// ============================================================
// supabase-store.js — Baileys auth state backed by Supabase Storage
// ============================================================

const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const BUCKET      = 'whatsapp-sessions';
const CREDS_FILE  = 'baileys-creds.json';
const KEYS_FILE   = 'baileys-keys.json';

async function useSupabaseAuthState(supabase) {
  let creds;
  let keys = {};

  // ── Load creds ──────────────────────────────────────────────
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(CREDS_FILE);
    if (!error && data) {
      creds = JSON.parse(await data.text(), BufferJSON.reviver);
      console.log('[supabase-auth] Credentials restored');
    }
  } catch (e) {
    console.warn('[supabase-auth] No saved credentials, starting fresh');
  }
  if (!creds) creds = initAuthCreds();

  // ── Load keys ───────────────────────────────────────────────
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(KEYS_FILE);
    if (!error && data) {
      keys = JSON.parse(await data.text(), BufferJSON.reviver);
      console.log('[supabase-auth] Keys restored');
    }
  } catch (e) { /* no keys yet — normal on first run */ }

  // ── Persist helpers ─────────────────────────────────────────
  async function saveCreds() {
    try {
      const buf = Buffer.from(JSON.stringify(creds, BufferJSON.replacer));
      const { error } = await supabase.storage.from(BUCKET)
        .upload(CREDS_FILE, buf, { upsert: true, contentType: 'application/json' });
      if (error) console.error('[supabase-auth] Creds save error:', error.message);
      else console.log('[supabase-auth] Credentials saved');
    } catch (e) {
      console.error('[supabase-auth] Creds save error:', e.message);
    }
  }

  async function saveKeys() {
    try {
      const buf = Buffer.from(JSON.stringify(keys, BufferJSON.replacer));
      const { error } = await supabase.storage.from(BUCKET)
        .upload(KEYS_FILE, buf, { upsert: true, contentType: 'application/json' });
      if (error) console.error('[supabase-auth] Keys save error:', error.message);
    } catch (e) {
      console.error('[supabase-auth] Keys save error:', e.message);
    }
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            const val = keys[`${type}-${id}`];
            if (val !== undefined) result[id] = val;
          }
          return result;
        },
        set: async (data) => {
          for (const [type, typeData] of Object.entries(data)) {
            for (const [id, value] of Object.entries(typeData || {})) {
              if (value) keys[`${type}-${id}`] = value;
              else delete keys[`${type}-${id}`];
            }
          }
          await saveKeys();
        },
      },
    },
    saveCreds,
  };
}

module.exports = { useSupabaseAuthState };
