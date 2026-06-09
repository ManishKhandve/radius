require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * Ensures the contact exists, updates their name and last_message_at.
 */
async function upsertContact(phone, name) {
  if (!supabase) return;
  try {
    // We update the name if provided, and bump the last_message_at
    const { data, error } = await supabase
      .from('contacts')
      .upsert({
        phone: phone,
        name: name || 'Customer',
        last_message_at: new Date().toISOString()
      }, { onConflict: 'phone' });

    if (error) console.error('[chat-store] error upserting contact:', error);
  } catch (err) {
    console.error('[chat-store] exception in upsertContact:', err.message);
  }
}

/**
 * Saves a message to the database.
 * direction: 'inbound' or 'outbound'
 */
async function saveMessage(phone, name, direction, content) {
  if (!supabase) return;
  try {
    await upsertContact(phone, name);

    const { error } = await supabase
      .from('messages')
      .insert({
        phone: phone,
        direction: direction,
        content: content
      });

    if (error) console.error('[chat-store] error saving message:', error);
  } catch (err) {
    console.error('[chat-store] exception in saveMessage:', err.message);
  }
}

/**
 * Checks if the bot is currently paused for a specific contact.
 */
async function isBotPaused(phone) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('bot_paused_until')
      .eq('phone', phone)
      .single();

    if (error || !data || !data.bot_paused_until) return false;

    const pausedUntil = new Date(data.bot_paused_until);
    const now = new Date();
    
    return now < pausedUntil;
  } catch (err) {
    console.error('[chat-store] exception checking bot pause:', err.message);
    return false;
  }
}

/**
 * Pauses or unpauses the bot for a specific contact.
 * durationHours: number of hours to pause (e.g. 24). If 0 or null, unpauses.
 */
async function setBotPause(phone, durationHours) {
  if (!supabase) return;
  try {
    let pausedUntil = null;
    if (durationHours > 0) {
      pausedUntil = new Date();
      pausedUntil.setHours(pausedUntil.getHours() + durationHours);
      pausedUntil = pausedUntil.toISOString();
    }

    const { error } = await supabase
      .from('contacts')
      .update({ bot_paused_until: pausedUntil })
      .eq('phone', phone);

    if (error) console.error('[chat-store] error pausing bot:', error);
  } catch (err) {
    console.error('[chat-store] exception setting bot pause:', err.message);
  }
}

/**
 * Fetches all contacts, ordered by the latest message.
 */
async function getContacts() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('[chat-store] error fetching contacts:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[chat-store] exception fetching contacts:', err.message);
    return [];
  }
}

/**
 * Fetches the conversation history for a specific contact.
 */
async function getMessages(phone) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[chat-store] error fetching messages:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[chat-store] exception fetching messages:', err.message);
    return [];
  }
}

module.exports = {
  saveMessage,
  isBotPaused,
  setBotPause,
  getContacts,
  getMessages
};
