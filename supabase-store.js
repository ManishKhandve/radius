const fs = require('fs');
const path = require('path');
const fsp = fs.promises;

/**
 * Custom RemoteAuth store for whatsapp-web.js backed by Supabase Storage.
 * Implements the 4-method interface: sessionExists, save, extract, delete.
 *
 * RemoteAuth writes/reads the zip at: .wwebjs_auth/<sessionName>.zip
 * sessionName = "RemoteAuth-<clientId>"  (e.g. "RemoteAuth-cleanly-bot")
 */
class SupabaseStore {
  constructor({ supabase, bucketName = 'whatsapp-sessions', dataPath = './.wwebjs_auth' }) {
    this.supabase = supabase;
    this.bucketName = bucketName;
    this.dataPath = dataPath;
  }

  async sessionExists({ session }) {
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .list();
    if (error || !data) return false;
    return data.some(f => f.name === `${session}.zip`);
  }

  async save({ session }) {
    const zipPath = path.join(this.dataPath, `${session}.zip`);
    if (!fs.existsSync(zipPath)) {
      console.warn(`[supabase-store] Zip not found, skipping save: ${zipPath}`);
      return;
    }
    const fileBuffer = fs.readFileSync(zipPath);

    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .upload(`${session}.zip`, fileBuffer, {
        upsert: true,
        contentType: 'application/zip',
      });

    if (error) throw new Error(`Supabase save error: ${error.message}`);
    console.log(`[supabase-store] Session saved: ${session}`);
  }

  async extract({ session, path: destPath }) {
    // Ensure the target directory exists (deleted cache causes ENOENT otherwise)
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .download(`${session}.zip`);

    if (error) throw new Error(`Supabase extract error: ${error.message}`);

    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`[supabase-store] Session restored: ${session}`);
  }

  async delete({ session }) {
    const { error } = await this.supabase.storage
      .from(this.bucketName)
      .remove([`${session}.zip`]);

    if (error) console.error(`[supabase-store] Delete error: ${error.message}`);
  }
}

module.exports = { SupabaseStore };
