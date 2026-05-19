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

  // Sequential write chain: each save waits for the previous to finish.
  // Without this, two concurrent uploads can race — the slower one
  // finishes last and overwrites Supabase with stale Signal keys,
  // causing "Waiting for this message" after the bot restarts.
  let keySaveChain = Promise.resolve();

  function saveKeys() {
    keySaveChain = keySaveChain.catch(() => {}).then(async () => {
      // Snapshot is taken here (inside the chain), so it always
      // captures the latest in-memory keys at the time this save runs.
      const snapshot = Buffer.from(JSON.stringify(keys, BufferJSON.replacer));
      try {
        const { error } = await supabase.storage.from(BUCKET)
          .upload(KEYS_FILE, snapshot, { upsert: true, contentType: 'application/json' });
        if (error) console.error('[supabase-auth] Keys save error:', error.message);
      } catch (e) {
        console.error('[supabase-auth] Keys save error:', e.message);
      }
    });
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
        set: (data) => {
          for (const [type, typeData] of Object.entries(data)) {
            for (const [id, value] of Object.entries(typeData || {})) {
              if (value) keys[`${type}-${id}`] = value;
              else delete keys[`${type}-${id}`];
            }
          }
          saveKeys(); // non-blocking — in-memory update is immediate, Supabase write is queued
        },
      },
    },
    saveCreds,
  };
}

module.exports = { useSupabaseAuthState };
