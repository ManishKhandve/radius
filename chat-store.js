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
async function upsertContact(phone, name, direction) {
  if (!supabase) return;
  try {
    const payload = {
      phone: phone,
      name: name || 'Customer',
      last_message_at: new Date().toISOString()
    };
    if (direction === 'inbound') {
      payload.label = 'unread';
    }

    const { data, error } = await supabase
      .from('contacts')
      .upsert(payload, { onConflict: 'phone' });

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
    await upsertContact(phone, name, direction);

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
 * Updates the custom label for a contact.
 */
async function updateContactLabel(phone, label) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ label: label })
      .eq('phone', phone);

    if (error) console.error('[chat-store] error updating label:', error);
  } catch (err) {
    console.error('[chat-store] exception updating label:', err.message);
  }
}

/**
 * Updates CRM fields for a contact (Phase 1).
 */
async function updateContactCRM(phone, updates) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('phone', phone);

    if (error) console.error('[chat-store] error updating CRM fields:', error);
  } catch (err) {
    console.error('[chat-store] exception updating CRM fields:', err.message);
  }
}

/**
 * Fetches internal notes for a contact.
 */
async function getNotes(phone) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[chat-store] error fetching notes:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[chat-store] exception fetching notes:', err.message);
    return [];
  }
}

/**
 * Adds an internal note for a contact.
 */
async function addNote(phone, note, created_by = 'Admin') {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('notes')
      .insert({
        phone: phone,
        note: note,
        created_by: created_by
      })
      .select()
      .single();

    if (error) {
      console.error('[chat-store] error adding note:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[chat-store] exception adding note:', err.message);
    return null;
  }
}

/**
 * Fetches contacts, ordered by the latest message.
 * Admins see all. Employees see only their assigned chats or unassigned chats.
 */
async function getContacts(role = 'admin', username = '') {
  if (!supabase) return [];
  try {
    let query = supabase.from('contacts').select('*');
    
    if (role === 'employee') {
      query = query.or(`assigned_agent.eq.${username},assigned_agent.eq.Unassigned,assigned_agent.is.null`);
    }

    const { data, error } = await query.order('last_message_at', { ascending: false });

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
 * Log in a user.
 */
async function loginUser(username, password) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, role')
      .eq('username', username)
      .eq('password_hash', password)
      .single();
    
    if (error || !data) return null;

    // Update last login
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', data.id);

    return data;
  } catch (err) {
    console.error('[chat-store] login exception:', err.message);
    return null;
  }
}

/**
 * Fetches all system users for agent assignment dropdowns.
 */
async function getUsers() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('users')
      .select('username, role')
      .order('username', { ascending: true });

    if (error) {
      console.error('[chat-store] error fetching users:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[chat-store] exception fetching users:', err.message);
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
  getMessages,
  updateContactLabel,
  updateContactCRM,
  getNotes,
  addNote,
  loginUser,
  getUsers
};
