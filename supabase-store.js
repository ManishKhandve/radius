// ============================================================
// supabase-store.js — Baileys auth state backed by Supabase Storage
// ============================================================

const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

const BUCKET      = 'whatsapp-sessions';
const CREDS_FILE  = 'baileys-creds.json';
const KEYS_FILE   = 'baileys-keys.json';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function upload(supabase, file, buf) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await supabase.storage.from(BUCKET)
        .upload(file, buf, { upsert: true, contentType: 'application/json' });
      if (!error) return true;
      console.error(`[supabase-auth] Upload ${file} attempt ${attempt} error:`, error.message);
    } catch (e) {
      console.error(`[supabase-auth] Upload ${file} attempt ${attempt} exception:`, e.message);
    }
    if (attempt < 3) await delay(800 * attempt);
  }
  console.error(`[supabase-auth] ❌ Failed to upload ${file} after 3 attempts`);
  return false;
}

async function useSupabaseAuthState(supabase) {
  let creds;
  let keys = {};

  // ── Load creds ──────────────────────────────────────────────
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(CREDS_FILE);
    if (error) {
      console.log('[supabase-auth] No credentials in Supabase — starting fresh');
    } else if (data) {
      creds = JSON.parse(await data.text(), BufferJSON.reviver);
      console.log('[supabase-auth] ✅ Credentials restored');
    }
  } catch (e) {
    console.warn('[supabase-auth] Credentials load failed:', e.message, '— starting fresh');
  }
  if (!creds) creds = initAuthCreds();

  // ── Load keys ───────────────────────────────────────────────
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(KEYS_FILE);
    if (error) {
      console.log('[supabase-auth] No keys in Supabase — starting fresh');
    } else if (data) {
      keys = JSON.parse(await data.text(), BufferJSON.reviver);
      console.log(`[supabase-auth] ✅ Keys restored (${Object.keys(keys).length} entries)`);
    }
  } catch (e) {
    console.warn('[supabase-auth] Keys load failed:', e.message, '— starting fresh');
  }

  // ── Clear stale Signal sessions on every startup ────────────
  // Signal ratchet state diverges after a bot restart — the recipient's
  // WhatsApp advances the ratchet while the bot was offline, so any
  // sessions saved before the restart are now out of sync.
  // Clearing them forces a fresh pre-key exchange on next send, which
  // is the only guaranteed way to produce messages the recipient can decrypt.
  const staleSessions = Object.keys(keys).filter(k => k.startsWith('session-'));
  if (staleSessions.length > 0) {
    for (const k of staleSessions) delete keys[k];
    console.log(`[supabase-auth] 🔄 Cleared ${staleSessions.length} stale sessions — fresh encryption on next send`);
  } else {
    console.log('[supabase-auth] No stale sessions to clear');
  }

  // ── Persist helpers ─────────────────────────────────────────
  async function saveCreds() {
    const buf = Buffer.from(JSON.stringify(creds, BufferJSON.replacer));
    const ok = await upload(supabase, CREDS_FILE, buf);
    if (ok) console.log('[supabase-auth] Credentials saved');
  }

  // Sequential write chain — each save waits for the previous to finish.
  // Prevents an older concurrent upload from overwriting newer key state.
  let keySaveChain = Promise.resolve();

  function saveKeys() {
    keySaveChain = keySaveChain.catch(() => {}).then(async () => {
      // Snapshot taken inside the chain so it always captures the latest
      // in-memory state at the time this particular save runs.
      const snapshot = Buffer.from(JSON.stringify(keys, BufferJSON.replacer));
      await upload(supabase, KEYS_FILE, snapshot);
    });
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result = {};
          for (const id of ids) {
            let val = keys[`${type}-${id}`];
            if (val !== undefined) {
              // app-state-sync-key must be reconstructed as a proto object
              // after JSON deserialization — matches useMultiFileAuthState
              if (type === 'app-state-sync-key') {
                try { val = proto.Message.AppStateSyncKeyData.fromObject(val); } catch (_) {}
              }
              result[id] = val;
            }
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
          saveKeys(); // non-blocking — in-memory is updated immediately
        },
      },
    },
    saveCreds,
  };
}

module.exports = { useSupabaseAuthState };
