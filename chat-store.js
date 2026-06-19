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
      last_message_at: new Date().toISOString()
    };
    if (name) payload.name = name;
    
    if (direction === 'inbound') {
      payload.label = 'unread';
      const existing = await getContactByPhone(phone);
      if (existing && existing.abandonment_drip_stage === 99) {
        payload.abandonment_drip_stage = 99;
      } else {
        payload.abandonment_drip_stage = 0;
      }
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
async function saveMessage(phone, name, direction, content, wamid = null, status = null) {
  if (!supabase) return;
  try {
    await upsertContact(phone, name, direction);

    const { error } = await supabase
      .from('messages')
      .insert({
        phone: phone,
        direction: direction,
        content: content,
        wamid: wamid,
        status: status
      });

    if (error) console.error('[chat-store] error saving message:', error);
  } catch (err) {
    console.error('[chat-store] exception in saveMessage:', err.message);
  }
}

/**
 * Updates the delivery/read status of a specific message.
 */
async function updateMessageStatus(wamid, status) {
  if (!supabase || !wamid) return;
  try {
    const { error } = await supabase
      .from('messages')
      .update({ status: status })
      .eq('wamid', wamid);

    if (error) console.error('[chat-store] error updating message status:', error);
  } catch (err) {
    console.error('[chat-store] exception updating message status:', err.message);
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
 * Fetches leads that have abandoned the flow and are eligible for the Drip Campaign.
 */
async function getAbandonedLeads() {
  if (!supabase) return [];
  try {
    // Pull leads still eligible for the drip (stage < 15, or never set).
    // NOTE: lead_status exclusion is done in JS below — chaining `.neq()`
    // filters in PostgREST silently drops rows where lead_status IS NULL
    // (since `NULL <> 'x'` is not TRUE), which would exclude almost every
    // brand-new abandoned lead and stop follow-ups from ever sending.
    const { data, error } = await supabase.from('contacts')
      .select('*')
      .or('abandonment_drip_stage.is.null,abandonment_drip_stage.lt.15');
    if (error) {
      console.error('[chat-store] error fetching abandoned leads:', error);
      return [];
    }

    const EXCLUDED_STATUSES = new Set([
      'Booked', 'Canceled', 'Not Interested',
      'Service Completed', 'Follow-up Required',
    ]);
    return (data || []).filter(c => {
      const stage = c.abandonment_drip_stage || 0;
      if (stage >= 15) return false;                          // drip done / disabled (99)
      if (c.lead_status && EXCLUDED_STATUSES.has(c.lead_status)) return false;
      return true;                                            // NULL lead_status → still a lead
    });
  } catch (err) {
    console.error('[chat-store] exception fetching abandoned leads:', err.message);
    return [];
  }
}

/**
 * Fetches a single contact by phone.
 */
async function getContactByPhone(phone) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('contacts').select('*').eq('phone', phone).single();
    if (error && error.code !== 'PGRST116') {
       console.error('[chat-store] error fetching contact:', error);
    }
    return data;
  } catch (err) {
    return null;
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

const metricUpdateQueue = [];
let processingQueue = false;

async function processMetricQueue() {
  if (processingQueue) return;
  processingQueue = true;
  while (metricUpdateQueue.length > 0) {
    const { campaign_name, metric_type, resolve, reject } = metricUpdateQueue[0];
    try {
      let { data } = await supabase.from('broadcast_metrics').select(metric_type).eq('campaign_name', campaign_name).single();
      let currentVal = data ? data[metric_type] || 0 : 0;
      
      if (!data) {
        const insertData = { campaign_name, sent: 0, delivered: 0, read: 0, replied: 0, booked: 0 };
        insertData[metric_type] = 1;
        await supabase.from('broadcast_metrics').insert([insertData]);
      } else {
        await supabase.from('broadcast_metrics').update({ [metric_type]: currentVal + 1 }).eq('campaign_name', campaign_name);
      }
      resolve();
    } catch (err) {
      reject(err);
    }
    metricUpdateQueue.shift();
  }
  processingQueue = false;
}

async function updateBroadcastMetric(campaign_name, metric_type) {
  if (!supabase) return;
  return new Promise((resolve, reject) => {
    metricUpdateQueue.push({ campaign_name, metric_type, resolve, reject });
    processMetricQueue().catch(reject);
  });
}

async function getBroadcastMetrics() {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('broadcast_metrics').select('*').order('campaign_name', { ascending: false });
    return data || [];
  } catch(err) { return []; }
}

/**
 * Fetch Overdue Follow-ups
 */
async function getDueFollowups() {
  if (!supabase) return [];
  try {
    const { data } = await supabase
      .from('contacts')
      .select('phone, name, assigned_agent, follow_up_time')
      .eq('lead_status', 'Follow-up Required')
      .lte('follow_up_time', new Date().toISOString());
    return data || [];
  } catch (err) {
    return [];
  }
}

/**
 * Quick Replies Management
 */
async function getQuickReplies() {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from('quick_replies').select('*').order('shortcut', { ascending: true });
    return data || [];
  } catch (err) { return []; }
}

async function addQuickReply(shortcut, message) {
  if (!supabase) return null;
  try {
    // If the table lacks a unique constraint on shortcut, upsert might fail if not configured. 
    // We will do a safe delete then insert.
    await supabase.from('quick_replies').delete().eq('shortcut', shortcut);
    const { data } = await supabase.from('quick_replies').insert([{ shortcut, message }]).select().single();
    return data;
  } catch (err) { return null; }
}

async function deleteQuickReply(shortcut) {
  if (!supabase) return;
  try {
    await supabase.from('quick_replies').delete().eq('shortcut', shortcut);
  } catch (err) {}
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
  getAbandonedLeads,
  getContactByPhone,
  getMessages,
  updateContactLabel,
  updateContactCRM,
  getNotes,
  addNote,
  loginUser,
  getUsers,
  updateBroadcastMetric,
  getBroadcastMetrics,
  getDueFollowups,
  getQuickReplies,
  addQuickReply,
  deleteQuickReply,
  updateMessageStatus
};
