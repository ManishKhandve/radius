// ============================================================
// supabase-store.js — Baileys auth state using official useMultiFileAuthState
// with Supabase Storage as cold backup (restored on each startup)
// ============================================================

const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs   = require('fs/promises');
const path = require('path');

const BUCKET   = 'whatsapp-sessions';
const AUTH_DIR = '/tmp/baileys-auth';

// All files that useMultiFileAuthState may create
const AUTH_FILES = [
  'creds.json',
  'pre-keys.json',
  'sessions.json',
  'sender-keys.json',
  'app-state-sync-keys.json',
  'app-state-sync-version.json',
  'sender-key-memory.json',
];

const KEY_FILE_MAP = {
  'pre-key':               'pre-keys.json',
  'session':               'sessions.json',
  'sender-key':            'sender-keys.json',
  'app-state-sync-key':    'app-state-sync-keys.json',
  'app-state-sync-version':'app-state-sync-version.json',
  'sender-key-memory':     'sender-key-memory.json',
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function sbDownload(supabase, filename) {
  for (let i = 1; i <= 3; i++) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).download(filename);
      if (data && !error) return await data.text();
      if (error?.statusCode === 404 || error?.message?.includes('not found')) return null;
    } catch (_) {}
    if (i < 3) await delay(600 * i);
  }
  return null;
}

async function sbUpload(supabase, filename, content) {
  const buf = Buffer.from(content);
  for (let i = 1; i <= 3; i++) {
    try {
      const { error } = await supabase.storage.from(BUCKET)
        .upload(filename, buf, { upsert: true, contentType: 'application/json' });
      if (!error) return true;
      console.error(`[supabase-auth] Upload ${filename} attempt ${i}:`, error.message);
    } catch (e) {
      console.error(`[supabase-auth] Upload ${filename} attempt ${i} exception:`, e.message);
    }
    if (i < 3) await delay(600 * i);
  }
  return false;
}

async function useSupabaseAuthState(supabase) {
  // ── Prepare local auth directory ─────────────────────────────
  await fs.mkdir(AUTH_DIR, { recursive: true });

  // ── Restore files from Supabase ──────────────────────────────
  let restored = 0;
  for (const file of AUTH_FILES) {
    const content = await sbDownload(supabase, file);
    if (content) {
      await fs.writeFile(path.join(AUTH_DIR, file), content, 'utf-8');
      restored++;
    }
  }
  console.log(`[supabase-auth] ✅ Restored ${restored}/${AUTH_FILES.length} auth files from Supabase`);

  // ── Clear sessions to force fresh pre-key exchange on reconnect ──
  // Sessions diverge while the bot is offline (recipient's ratchet advances,
  // bot's saved ratchet stays behind). Starting fresh avoids Bad MAC and
  // 'Waiting for this message' on the first reply after every restart.
  try {
    await fs.writeFile(path.join(AUTH_DIR, 'sessions.json'), '{}', 'utf-8');
    console.log('[supabase-auth] 🔄 Cleared stale sessions — fresh encryption on next send');
  } catch (_) {}

  // ── Use official Baileys auth state (battle-tested Signal impl) ──
  const { state, saveCreds: _saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // ── Sequential Supabase sync chain ───────────────────────────
  // Keeps uploads in order so a slow older upload never overwrites
  // a newer one (the original race-condition root cause).
  let syncChain = Promise.resolve();

  function scheduleSync(files) {
    syncChain = syncChain.catch(() => {}).then(async () => {
      for (const filename of files) {
        try {
          const content = await fs.readFile(path.join(AUTH_DIR, filename), 'utf-8').catch(() => null);
          if (content) await sbUpload(supabase, filename, content);
        } catch (e) {
          console.error(`[supabase-auth] Sync error for ${filename}:`, e.message);
        }
      }
    });
  }

  // ── Wrap saveCreds to also push creds.json to Supabase ───────
  const saveCreds = async () => {
    await _saveCreds();
    scheduleSync(['creds.json']);
    console.log('[supabase-auth] Credentials saved');
  };

  // ── Wrap keys.set to push affected key files to Supabase ─────
  const origSet = state.keys.set.bind(state.keys);
  state.keys.set = async (data) => {
    await origSet(data); // write to local FS first (official impl, awaited)
    const files = [...new Set(
      Object.keys(data).map(t => KEY_FILE_MAP[t]).filter(Boolean)
    )];
    if (files.length) scheduleSync(files);
  };

  return { state, saveCreds };
}

module.exports = { useSupabaseAuthState };
