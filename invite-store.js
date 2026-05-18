const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function isInvited(phone) {
  const { data } = await supabase
    .from('pending_invites')
    .select('phone')
    .eq('phone', phone)
    .single();
  return !!data;
}

async function addInvite(phone) {
  await supabase
    .from('pending_invites')
    .upsert({ phone });
}

async function removeInvite(phone) {
  await supabase
    .from('pending_invites')
    .delete()
    .eq('phone', phone);
}

/**
 * Uploads a WhatsApp media receipt to Supabase Storage (receipts bucket)
 * and returns the permanent public URL.
 *
 * @param {string} bookingId  - used as part of the filename
 * @param {string} mediaData  - base64 encoded image data from msg.downloadMedia()
 * @param {string} mimetype   - e.g. 'image/jpeg'
 * @returns {string} public URL
 */
async function uploadReceipt(bookingId, mediaData, mimetype) {
  const ext      = mimetype.split('/')[1] || 'jpg';
  const fileName = `${bookingId}-${Date.now()}.${ext}`;
  const buffer   = Buffer.from(mediaData, 'base64');

  const { error } = await supabase.storage
    .from('receipts')
    .upload(fileName, buffer, { contentType: mimetype, upsert: false });

  if (error) throw new Error(`Receipt upload failed: ${error.message}`);

  const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
  return data.publicUrl;
}

module.exports = { isInvited, addInvite, removeInvite, uploadReceipt };
