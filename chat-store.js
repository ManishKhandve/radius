require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(`${new Date().toISOString()} [chat-store] ❌ SUPABASE_URL and SUPABASE_KEY are required — the CRM/chat store cannot run without them.`);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Boot-time connection test
supabase.from('contacts').select('phone', { count: 'exact', head: true }).limit(1)
  .then(({ error, count }) => {
    if (error) {
      console.error(`${new Date().toISOString()} [chat-store] ❌ Supabase connection FAILED:`, error.message);
    } else {
      console.log(`${new Date().toISOString()} [chat-store] ✅ Supabase connected (contacts: ${count ?? 'unknown'})`);
    }
  })
  .catch(err => {
    console.error(`${new Date().toISOString()} [chat-store] ❌ Supabase connection exception:`, err.message);
  });

/**
 * Ensures the contact exists, updates their name and last_message_at.
 */
async function upsertContact(phone, name, direction) {
  try {
    const existing = await getContactByPhone(phone);
    const payload = {
      phone: phone,
      last_message_at: new Date().toISOString()
    };
    // Only set the name when we don't already have one stored. A name we saved
    // from a source table (maids/customers) or captured on first contact should
    // win over the WhatsApp profile name on every later message.
    if (name && !(existing && existing.name)) payload.name = name;

    if (direction === 'inbound') {
      payload.label = 'unread';
      if (existing && existing.abandonment_drip_stage === 99) {
        payload.abandonment_drip_stage = 99;
      } else {
        payload.abandonment_drip_stage = 0;
      }
    }

    const { error } = await supabase
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
  try {
    await upsertContact(phone, name, direction);

    const { data, error } = await supabase
      .from('messages')
      .insert({
        phone: phone,
        direction: direction,
        content: content,
        wamid: wamid,
        status: status
      })
      .select('id')
      .single();

    if (error) { console.error('[chat-store] error saving message:', error); return null; }
    return data || null;
  } catch (err) {
    console.error('[chat-store] exception in saveMessage:', err.message);
    return null;
  }
}

/**
 * Updates the delivery/read status of a specific message.
 */
async function updateMessageStatus(wamid, status) {
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
  try {
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
      if (stage >= 15) return false;
      if (c.lead_status && EXCLUDED_STATUSES.has(c.lead_status)) return false;
      return true;
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

async function updateBroadcastMetric(campaign_name, metric_type) {
  // Chained metrics queue in production
  return new Promise((resolve, reject) => {
    supabase.from('broadcast_metrics').select(metric_type).eq('campaign_name', campaign_name).single()
      .then(({ data }) => {
        let currentVal = data ? data[metric_type] || 0 : 0;
        if (!data) {
          const insertData = { campaign_name, sent: 0, delivered: 0, read: 0, replied: 0, booked: 0 };
          insertData[metric_type] = 1;
          return supabase.from('broadcast_metrics').insert([insertData]);
        } else {
          return supabase.from('broadcast_metrics').update({ [metric_type]: currentVal + 1 }).eq('campaign_name', campaign_name);
        }
      })
      .then(() => resolve())
      .catch(reject);
  });
}

async function getBroadcastMetrics() {
  try {
    const { data } = await supabase.from('broadcast_metrics').select('*').order('campaign_name', { ascending: false });
    return data || [];
  } catch(err) { return []; }
}

/**
 * Today's operational counts for the Analytics tab (IST calendar day):
 *   leads     — new customer / flat_customer / maid rows created today
 *   followups — contacts whose follow-up falls today (reuses getScheduledFollowups)
 *   calls     — customer / flat_customer / maid rows called today (last_called_date)
 *   bookings  — customer / flat_customer / maid rows whose status contains "book"
 *               and last changed (last_updated_at) today
 */
async function getTodayStats() {
  const today = istDateStr(Date.now());
  const isToday = (d) => !!d && istDateStr(d) === today;
  const stats = { leads: 0, followups: 0, calls: 0, bookings: 0 };
  try {
    const [custRes, flatRes, maidRes] = await Promise.all([
      supabase.from('customers').select('created_at, last_called_date, status, last_updated_at'),
      supabase.from('flat_customers').select('created_at, last_called_date, status, last_updated_at'),
      supabase.from('maids').select('created_at, last_called_date, status, last_updated_at'),
    ]);
    for (const rows of [custRes.data || [], flatRes.data || [], maidRes.data || []]) {
      for (const r of rows) {
        if (isToday(r.created_at)) stats.leads++;
        if (isToday(r.last_called_date)) stats.calls++;
        if (/book/i.test(String(r.status || '').trim()) && isToday(r.last_updated_at)) stats.bookings++;
      }
    }
  } catch (err) { /* leave zeros on failure */ }

  try {
    const followups = await getScheduledFollowups();
    stats.followups = followups.filter(f => f.dayBucket === 'today').length;
  } catch (err) { /* leave zeros on failure */ }

  return stats;
}

/**
 * Fetch Overdue Follow-ups
 */
async function getDueFollowups() {
  try {
    // Pull all Follow-up Required contacts and compute "due" in JS, because a
    // contact can now have up to 5 scheduled dates in follow_up_times (jsonb).
    let { data, error } = await supabase
      .from('contacts')
      .select('phone, name, assigned_agent, follow_up_time, follow_up_times, service_category')
      .eq('lead_status', 'Follow-up Required');
    if (error) {
      // follow_up_times column not added yet — fall back to the single field.
      ({ data } = await supabase
        .from('contacts')
        .select('phone, name, assigned_agent, follow_up_time, service_category')
        .eq('lead_status', 'Follow-up Required'));
    }
    const now = Date.now();
    const due = [];
    for (const c of (data || [])) {
      const times = Array.isArray(c.follow_up_times) ? c.follow_up_times : [];
      const all = [...times, c.follow_up_time].filter(Boolean);
      const dueDates = all.filter(t => new Date(t).getTime() <= now);
      if (dueDates.length) {
        const soonest = dueDates.sort((a, b) => new Date(a) - new Date(b))[0];
        due.push({
          phone: c.phone,
          name: c.name,
          assigned_agent: c.assigned_agent,
          service_category: c.service_category || null,
          follow_up_time: soonest,
        });
      }
    }
    return due;
  } catch (err) {
    return [];
  }
}

// Calendar-day string (YYYY-MM-DD) in IST, so "today"/"tomorrow" match the
// business's actual day regardless of the server's own timezone.
function istDateStr(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Which day-bucket a follow-up falls into, compared against "now".
function followupDayBucket(followUpTime, now) {
  const fu = istDateStr(followUpTime);
  const today = istDateStr(now);
  const tomorrow = istDateStr(now + 86400000);
  const weekOut = istDateStr(now + 7 * 86400000);
  if (fu < today) return 'overdue';
  if (fu === today) return 'today';
  if (fu === tomorrow) return 'tomorrow';
  if (fu <= weekOut) return 'week';
  return 'later';
}

/**
 * Every contact that has a follow-up scheduled (past OR future), for the
 * Notifications tab. follow_up_time is kept synced to the soonest date, so
 * "has a follow-up" == follow_up_time is not null. Each row is flagged
 * is_due (time has passed), dayBucket (overdue/today/tomorrow/week/later,
 * by IST calendar day), and unseen (never opened since this follow-up time
 * was set — see markFollowupSeen).
 *
 * Requires this column (run once in the Supabase SQL editor):
 *   ALTER TABLE contacts ADD COLUMN IF NOT EXISTS follow_up_seen_at timestamptz;
 */
async function getScheduledFollowups() {
  try {
    let { data, error } = await supabase
      .from('contacts')
      .select('phone, name, assigned_agent, follow_up_time, follow_up_times, service_category, follow_up_seen_at')
      .not('follow_up_time', 'is', null)
      .order('follow_up_time', { ascending: true });
    if (error) {
      // follow_up_times / follow_up_seen_at columns not added yet — degrade gracefully.
      ({ data } = await supabase
        .from('contacts')
        .select('phone, name, assigned_agent, follow_up_time, service_category')
        .not('follow_up_time', 'is', null)
        .order('follow_up_time', { ascending: true }));
    }
    const now = Date.now();
    return (data || []).map(c => {
      const times = Array.isArray(c.follow_up_times) ? c.follow_up_times : [];
      const all = [...times, c.follow_up_time].filter(Boolean).sort((a, b) => new Date(a) - new Date(b));
      return {
        phone: c.phone,
        name: c.name,
        assigned_agent: c.assigned_agent,
        service_category: c.service_category || null,
        follow_up_time: c.follow_up_time,
        all_dates: all,
        is_due: new Date(c.follow_up_time).getTime() <= now,
        dayBucket: followupDayBucket(c.follow_up_time, now),
        // Unseen if never opened, or a newer/different follow-up time was set
        // since the last time it was seen.
        unseen: !c.follow_up_seen_at || new Date(c.follow_up_seen_at).getTime() < new Date(c.follow_up_time).getTime(),
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Marks a contact's current follow-up as seen/opened (called when an agent
 * opens the chat from the Notifications follow-up list).
 */
async function markFollowupSeen(phone) {
  try {
    await supabase.from('contacts').update({ follow_up_seen_at: new Date().toISOString() }).eq('phone', phone);
  } catch (err) {
    console.error('[chat-store] exception marking follow-up seen:', err.message);
  }
}

/**
 * Quick Replies Management
 */
async function getQuickReplies() {
  try {
    const { data } = await supabase.from('quick_replies').select('*').order('shortcut', { ascending: true });
    return data || [];
  } catch (err) { return []; }
}

async function addQuickReply(shortcut, message) {
  try {
    await supabase.from('quick_replies').delete().eq('shortcut', shortcut);
    const { data } = await supabase.from('quick_replies').insert([{ shortcut, message }]).select().single();
    return data;
  } catch (err) { return null; }
}

async function deleteQuickReply(shortcut) {
  try {
    await supabase.from('quick_replies').delete().eq('shortcut', shortcut);
  } catch (err) {}
}

/**
 * Fetches the conversation history for a specific contact.
 */
async function getMessages(phone) {
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

/**
 * Fetches a single message by id — used by the on-demand "🌐 Translate"
 * button, which needs the original text before asking the AI to translate it.
 */
async function getMessageById(id) {
  try {
    const { data, error } = await supabase.from('messages').select('*').eq('id', id).single();
    if (error) return null;
    return data;
  } catch (err) {
    return null;
  }
}

/**
 * Latest inbound message's wamid for a phone — needed to anchor Meta's
 * "mark read + show typing indicator" call to a real message id.
 */
async function getLastInboundWamid(phone) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('wamid')
      .eq('phone', phone)
      .eq('direction', 'inbound')
      .not('wamid', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    return data[0].wamid;
  } catch {
    return null;
  }
}

/**
 * Fetches "Interested" maid-service customers eligible for the WhatsApp
 * follow-up drip. Reads from the `customers` table (the maid-placement lead
 * list) — NOT `contacts`. Qualifies rows where status = 'Interested' and the
 * drip is not yet complete (wa_followup_stage < 15, or unset).
 *
 * Requires this column (run once in the Supabase SQL editor):
 *   ALTER TABLE customers ADD COLUMN IF NOT EXISTS wa_followup_stage smallint DEFAULT 0;
 */
async function getInterestedFollowupCustomers() {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, status, created_at, wa_followup_stage')
      .eq('status', 'Interested')
      .or('wa_followup_stage.is.null,wa_followup_stage.lt.15');
    if (error) {
      console.error('[chat-store] error fetching interested customers (is the wa_followup_stage column added?):', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[chat-store] exception fetching interested customers:', err.message);
    return [];
  }
}

/**
 * Advances a customer's WhatsApp follow-up stage. Called after each send so a
 * repeat press of "Run Follow-Ups" never re-sends the same stage.
 */
async function advanceCustomerFollowupStage(id, stage) {
  try {
    const { error } = await supabase
      .from('customers')
      .update({ wa_followup_stage: stage })
      .eq('id', id);
    if (error) console.error('[chat-store] error advancing followup stage:', error.message);
  } catch (err) {
    console.error('[chat-store] exception advancing followup stage:', err.message);
  }
}

/**
 * Fetches "dead / closed" customers eligible for the weekly maid-revival
 * campaign: status is Not Interested or Didn't Convert, they still have room
 * in the 1-month window (revive_stage < 4), and they have coordinates to
 * match a nearby maid.
 *
 * Requires these columns (run once in the Supabase SQL editor):
 *   ALTER TABLE customers ADD COLUMN IF NOT EXISTS revive_stage smallint DEFAULT 0;
 *   ALTER TABLE customers ADD COLUMN IF NOT EXISTS revive_last_sent_at timestamptz;
 */
async function getReviveCustomers() {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, phone, status, latitude, longitude, revive_stage, revive_last_sent_at')
      .in('status', ['Not Interested', "Didn't Convert"])
      .or('revive_stage.is.null,revive_stage.lt.4')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);
    if (error) {
      console.error('[chat-store] error fetching revive customers (are revive_stage/revive_last_sent_at columns added?):', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[chat-store] exception fetching revive customers:', err.message);
    return [];
  }
}

/**
 * Advances a customer's revive campaign progress (stage 0→4) and stamps the
 * send time so the 7-day gate can pace the next one.
 */
async function advanceReviveStage(id, stage, sentAtISO) {
  try {
    const { error } = await supabase
      .from('customers')
      .update({ revive_stage: stage, revive_last_sent_at: sentAtISO })
      .eq('id', id);
    if (error) console.error('[chat-store] error advancing revive stage:', error.message);
  } catch (err) {
    console.error('[chat-store] exception advancing revive stage:', err.message);
  }
}

// ─── People directory (the 3 lead systems) ──────────────────
// Maps each browsable group to its table and the columns that make up a
// display row. Keeps the front-end generic across the three tables.
const PEOPLE_SOURCES = {
  flat_customers: { table: 'flat_customers', name: 'full_name', area: 'area',        tag: 'home_type',      status: 'status' },
  customers:      { table: 'customers',      name: 'name',      area: 'location',     tag: 'service_needed', status: 'status' },
  maids:          { table: 'maids',          name: 'name',      area: 'areas_served', tag: 'service_type',   status: 'status' },
};

function isPeopleGroup(group) {
  return Object.prototype.hasOwnProperty.call(PEOPLE_SOURCES, group);
}

/**
 * Fetches a normalized list of people from one of the three lead tables.
 * Returns rows shaped { id, name, phone, area, tag, status }.
 */
async function getPeople(group) {
  const src = PEOPLE_SOURCES[group];
  if (!src) return [];
  try {
    const cols = `id, ${src.name}, phone, ${src.area}, ${src.tag}, ${src.status}`;
    const { data, error } = await supabase
      .from(src.table)
      .select(cols)
      .order('id', { ascending: false })
      .limit(2000);
    if (error) {
      console.error(`[chat-store] error fetching people (${group}):`, error.message);
      return [];
    }
    return (data || []).map(r => ({
      id:     r.id,
      name:   r[src.name] || 'Unknown',
      phone:  r.phone || '',
      area:   r[src.area] || '',
      tag:    r[src.tag] || '',
      status: r[src.status] || '',
    }));
  } catch (err) {
    console.error(`[chat-store] exception fetching people (${group}):`, err.message);
    return [];
  }
}

/**
 * Ensures a chat contact exists for a person from one of the lead tables so
 * agents can open a normal conversation with them. Sets name and
 * service_category without touching label/drip state on existing contacts.
 * Returns the contact row.
 */
async function ensureContact(phone, name, serviceCategory) {
  try {
    const existing = await getContactByPhone(phone);
    if (existing) {
      const updates = {};
      if (name && !existing.name) updates.name = name;
      if (serviceCategory && !existing.service_category) updates.service_category = serviceCategory;
      if (Object.keys(updates).length) {
        await supabase.from('contacts').update(updates).eq('phone', phone);
        return { ...existing, ...updates };
      }
      return existing;
    }
    const row = {
      phone,
      name: name || null,
      service_category: serviceCategory || null,
      lead_status: 'New Lead',
      label: 'read',
      last_message_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from('contacts').insert(row).select().single();
    if (error) {
      console.error('[chat-store] error creating contact:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[chat-store] exception in ensureContact:', err.message);
    return null;
  }
}

// ─── CRM notifications (admin alerts mirrored into the UI) ───
// Reuses the shared `notifications` table (also used by the telecalling
// CRM: user_id / lead_type / lead_id / type / title / body / is_read).
// WhatsApp alerts are written with lead_type = 'whatsapp' and the customer
// phone in lead_id, and reads/mark-read are scoped to lead_type='whatsapp'
// so the other system's notifications and unread state are never touched.
async function addNotification(title, body, phone = null, type = 'alert') {
  try {
    const { error } = await supabase.from('notifications').insert({
      lead_type: 'whatsapp',
      lead_id:   phone || null,
      type,
      title,
      body,
      is_read:   false,
    });
    if (error) console.error('[chat-store] error adding notification:', error.message);
  } catch (err) {
    console.error('[chat-store] exception adding notification:', err.message);
  }
}

async function getNotifications(limit = 50, filter = null) {
  try {
    let q = supabase
      .from('notifications')
      .select('*')
      .eq('lead_type', 'whatsapp');
    if (filter === 'message') q = q.eq('type', 'message');
    else if (filter === 'not-message') q = q.neq('type', 'message');
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    // Normalize to the shape the CRM UI expects.
    return (data || []).map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      phone: n.lead_id || null,
      type: n.type,
      read: !!n.is_read,
      created_at: n.created_at,
    }));
  } catch (err) { return []; }
}

async function markNotificationsRead() {
  try {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('lead_type', 'whatsapp')
      .eq('is_read', false);
  } catch (err) {
    console.error('[chat-store] exception marking notifications read:', err.message);
  }
}

// ─── Quick lead summary (shown when a chat is opened) ────────
// Lead tables store phone as 10 local digits (no country code); WhatsApp
// contacts store it with the country code. Match on the last 10 digits.
function last10(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

// Drops null/empty/"Unknown"-style fields so the summary only shows what's
// actually filled in ("if available").
function pickFilled(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const s = v === null || v === undefined ? '' : String(v).trim();
    if (s && s.toLowerCase() !== 'unknown') out[k] = v;
  }
  return out;
}

/**
 * Looks up a phone across all three lead tables (a person can legitimately
 * appear in more than one — e.g. a maid who also inquired as a customer).
 * Returns only the summary fields relevant to each type, with blanks
 * dropped. Each key is null if no match was found in that table.
 */
async function getLeadSummary(phone) {
  const p = last10(phone);
  if (!p) return { flat: null, customer: null, maid: null };

  const [flatRes, custRes, maidRes] = await Promise.all([
    supabase.from('flat_customers').select('full_name, area, street_address, home_type, requirement, status').eq('phone', p).limit(1),
    supabase.from('customers').select('name, location, service_needed, budget, working_hours, status').eq('phone', p).limit(1),
    supabase.from('maids').select('name, areas_served, service_type, salary_expectation, preferred_time, availability, status').eq('phone', p).limit(1),
  ]);

  const flat = flatRes.data && flatRes.data[0];
  const cust = custRes.data && custRes.data[0];
  const maid = maidRes.data && maidRes.data[0];

  return {
    flat: flat ? pickFilled({
      name: flat.full_name, location: flat.area || flat.street_address,
      service: flat.requirement, flat_type: flat.home_type, status: flat.status,
    }) : null,
    customer: cust ? pickFilled({
      name: cust.name, location: cust.location, service: cust.service_needed,
      salary: cust.budget, working_hours: cust.working_hours, status: cust.status,
    }) : null,
    maid: maid ? pickFilled({
      name: maid.name, location: maid.areas_served, service: maid.service_type,
      salary: maid.salary_expectation, working_hours: maid.preferred_time || maid.availability, status: maid.status,
    }) : null,
  };
}

// ─── AI Assistant data access (per-chat, OpenRouter-backed) ──
// Every function here is scoped by phone — the AI layer must never see or
// touch another chat's data. See ai-assistant.js for the OpenRouter calls
// that produce the values these functions store.

/**
 * Everything ai-assistant.js needs to analyze ONE chat: the contact row,
 * the full message history for that phone only, that phone's own pending
 * notifications (so the AI can flag stale ones), and any existing match in
 * the lead tables (reused from getLeadSummary — cheaper than asking the AI
 * to guess a lead category when we already know it from a real record).
 */
async function getAiContext(phone) {
  const [contactRes, messages, notifRes, leadMatch] = await Promise.all([
    supabase.from('contacts').select('*').eq('phone', phone).limit(1),
    getMessages(phone),
    supabase.from('notifications').select('id, type, title, body, created_at')
      .eq('lead_type', 'whatsapp').eq('lead_id', phone).eq('is_read', false),
    getLeadSummary(phone),
  ]);
  return {
    contact: (contactRes.data && contactRes.data[0]) || null,
    messages,
    pendingNotifications: notifRes.data || [],
    leadMatch,
  };
}

/**
 * Merges freshly extracted fields into contacts.ai_extracted (never
 * clobbers a previously-known value with a blank one from a later turn
 * that simply didn't mention it) and updates category/locality/timestamp.
 */
async function saveAiAnalysis(phone, { extracted, leadCategory, localityVerification } = {}) {
  try {
    const { data: existing } = await supabase.from('contacts').select('ai_extracted').eq('phone', phone).limit(1).single();
    const merged = { ...((existing && existing.ai_extracted) || {}) };
    if (extracted && typeof extracted === 'object') {
      for (const [k, v] of Object.entries(extracted)) {
        if (v === null || v === undefined || v === '') continue;
        merged[k] = v;
      }
    }
    const updates = { ai_extracted: merged, ai_last_analyzed_at: new Date().toISOString() };
    if (leadCategory) updates.lead_category = leadCategory;
    if (localityVerification) updates.locality_verification = localityVerification;
    await supabase.from('contacts').update(updates).eq('phone', phone);
  } catch (err) {
    console.error('[chat-store] exception saving AI analysis:', err.message);
  }
}

async function saveMessageTranslation(messageId, contentEn, language) {
  try {
    await supabase.from('messages').update({ content_en: contentEn, language }).eq('id', messageId);
  } catch (err) {
    console.error('[chat-store] exception saving message translation:', err.message);
  }
}

// Skips inserting a suggestion that duplicates an already-pending one for
// this phone (same type + title), so a re-analysis doesn't spam the popup.
async function createAiSuggestions(phone, suggestions) {
  if (!Array.isArray(suggestions) || !suggestions.length) return;
  try {
    const { data: existing } = await supabase.from('ai_suggestions')
      .select('type, title').eq('phone', phone).eq('status', 'pending');
    const seen = new Set((existing || []).map(s => s.type + '::' + s.title));
    const rows = suggestions
      .filter(s => s && s.title && !seen.has((s.type || 'suggestion') + '::' + s.title))
      .map(s => ({
        phone,
        type: s.type || 'suggestion',
        title: String(s.title).slice(0, 300),
        body: s.body ? String(s.body).slice(0, 1000) : null,
        payload: s.payload || null,
        status: 'pending',
      }));
    if (rows.length) await supabase.from('ai_suggestions').insert(rows);
  } catch (err) {
    console.error('[chat-store] exception creating AI suggestions:', err.message);
  }
}

async function getAiSuggestions(phone) {
  try {
    const { data } = await supabase.from('ai_suggestions')
      .select('*').eq('phone', phone).eq('status', 'pending')
      .order('created_at', { ascending: false });
    return data || [];
  } catch (err) { return []; }
}

// Scoped by phone as well as id — a stale/spoofed id can never touch
// another chat's suggestion.
async function dismissAiSuggestion(id, phone) {
  try {
    await supabase.from('ai_suggestions').update({ status: 'dismissed' }).eq('id', id).eq('phone', phone);
  } catch (err) { console.error('[chat-store] exception dismissing AI suggestion:', err.message); }
}

async function applyAiSuggestion(id, phone) {
  try {
    await supabase.from('ai_suggestions').update({ status: 'applied' }).eq('id', id).eq('phone', phone);
  } catch (err) { console.error('[chat-store] exception applying AI suggestion:', err.message); }
}

async function createScheduledNotification(phone, { reminder_time, reminder_type, source_message } = {}) {
  if (!phone || !reminder_time || !reminder_type) return;
  try {
    await supabase.from('scheduled_notifications').insert({
      phone, reminder_time, reminder_type,
      source_message: source_message ? String(source_message).slice(0, 500) : null,
      status: 'pending',
    });
  } catch (err) { console.error('[chat-store] exception creating scheduled notification:', err.message); }
}

async function getDueScheduledNotifications() {
  try {
    const { data } = await supabase.from('scheduled_notifications')
      .select('*').eq('status', 'pending').lte('reminder_time', new Date().toISOString());
    return data || [];
  } catch (err) { return []; }
}

async function markScheduledNotificationFired(id) {
  try {
    await supabase.from('scheduled_notifications').update({ status: 'fired' }).eq('id', id);
  } catch (err) { console.error('[chat-store] exception marking scheduled notification fired:', err.message); }
}

// Defense-in-depth: scoped to lead_type='whatsapp' + this exact phone, so
// even a hallucinated id from the AI can never mark another chat's (or the
// other CRM's) notification read.
async function dismissNotificationsByIds(ids, phone) {
  if (!Array.isArray(ids) || !ids.length || !phone) return;
  try {
    await supabase.from('notifications')
      .update({ is_read: true })
      .in('id', ids)
      .eq('lead_type', 'whatsapp')
      .eq('lead_id', phone);
  } catch (err) { console.error('[chat-store] exception dismissing notifications:', err.message); }
}

module.exports = {
  saveMessage,
  ensureContact,
  getMessageById,
  getLeadSummary,
  getAiContext,
  saveAiAnalysis,
  saveMessageTranslation,
  createAiSuggestions,
  getAiSuggestions,
  dismissAiSuggestion,
  applyAiSuggestion,
  createScheduledNotification,
  getDueScheduledNotifications,
  markScheduledNotificationFired,
  dismissNotificationsByIds,
  getLastInboundWamid,
  addNotification,
  getNotifications,
  markNotificationsRead,
  getInterestedFollowupCustomers,
  advanceCustomerFollowupStage,
  getReviveCustomers,
  advanceReviveStage,
  getPeople,
  isPeopleGroup,
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
  getTodayStats,
  getDueFollowups,
  getScheduledFollowups,
  markFollowupSeen,
  getQuickReplies,
  addQuickReply,
  deleteQuickReply,
  updateMessageStatus
};
