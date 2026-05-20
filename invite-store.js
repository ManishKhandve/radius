// invite-store.js — in-memory invite tracking (no Supabase needed on VPS)
require('dotenv').config();

const invites = new Set();

async function isInvited(phone) {
  return invites.has(phone);
}

async function addInvite(phone) {
  invites.add(phone);
}

async function removeInvite(phone) {
  invites.delete(phone);
}

async function uploadReceipt(bookingId, mediaData, mimetype) {
  // Receipt upload requires Supabase — skip on VPS, return null
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const ext      = mimetype.split('/')[1] || 'jpg';
    const fileName = `${bookingId}-${Date.now()}.${ext}`;
    const buffer   = Buffer.from(mediaData, 'base64');
    const { error } = await supabase.storage
      .from('receipts')
      .upload(fileName, buffer, { contentType: mimetype, upsert: false });
    if (error) return null;
    const { data } = supabase.storage.from('receipts').getPublicUrl(fileName);
    return data.publicUrl;
  } catch { return null; }
}

module.exports = { isInvited, addInvite, removeInvite, uploadReceipt };
