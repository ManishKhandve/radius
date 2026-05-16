const fs = require('fs');
const path = require('path');

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
    // RemoteAuth compresses the session to <dataPath>/<sessionName>.zip before calling save()
    const zipPath = path.join(this.dataPath, `${session}.zip`);
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

  async extract({ session, path }) {
    // RemoteAuth calls this on startup to restore the session zip
    const { data, error } = await this.supabase.storage
      .from(this.bucketName)
      .download(`${session}.zip`);

    if (error) throw new Error(`Supabase extract error: ${error.message}`);

    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(path, buffer);
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
