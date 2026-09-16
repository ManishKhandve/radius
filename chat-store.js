require('dotenv').config();
const crypto = require('crypto');
const { q, one, all, jb, hasDb } = require('./db');

// Boot-time connection test (skipped when running without a database)
if (hasDb) {
  q('SELECT COUNT(*)::int AS c FROM contacts').then(
    (r) => console.log(`${new Date().toISOString()} [chat-store] ✅ Neon connected (contacts: ${r.rows[0].c})`),
    (err) => console.error(`${new Date().toISOString()} [chat-store] ❌ Neon connection FAILED:`, err.message)
  );
} else {
  console.log(`${new Date().toISOString()} [chat-store] no database — chat store returns empty data.`);
}

// JSON-safe param: stringify objects/arrays (jsonb columns), pass the rest through.
function sqlVal(v) {
  return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
}

// Partial UPDATE of one contact row. Returns nothing (throws on SQL error).
async function updateContactFields(phone, obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  const set = keys.map((k, i) => `"${k}"=$${i + 1}`).join(', ');
  await q(`UPDATE contacts SET ${set} WHERE phone=$${keys.length + 1}`, [...keys.map((k) => sqlVal(obj[k])), phone]);
}

// LIKE pattern escape for user-influenced prefixes.
function likePrefix(v) {
  return String(v).replace(/[\\%_]/g, (ch) => '\\' + ch) + '%';
}

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
    // Only set the name when we don't already have one stored. A name an
    // agent saved, or one captured on first contact, should win over the
    // WhatsApp profile name on every later message.
    if (name && !(existing && existing.name)) payload.name = name;

    if (direction === 'inbound') {
      payload.label = 'unread';
      payload.unread_count = (existing?.unread_count || 0) + 1;
      if (existing && existing.abandonment_drip_stage === 99) {
        payload.abandonment_drip_stage = 99;
      } else {
        payload.abandonment_drip_stage = 0;
      }
    } else if (direction === 'outbound') {
      // Overwrite the DB defaults so automated broadcasts don't spawn
      // hundreds of "unread" "New Leads" in the UI.
      if (!existing) {
        payload.label = 'read';
        payload.lead_status = 'Contacted';
      }
    }

    const keys = Object.keys(payload);
    const sets = keys.filter((k) => k !== 'phone').map((k) => `"${k}"=EXCLUDED."${k}"`).join(', ');
    await q(
      `INSERT INTO contacts (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (phone) DO UPDATE SET ${sets}`,
      keys.map((k) => sqlVal(payload[k]))
    );
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

    const row = await one(
      'INSERT INTO messages (phone, direction, content, wamid, status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [phone, direction, content, wamid, status]
    );
    return row || null;
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
    await q('UPDATE messages SET status=$1 WHERE wamid=$2', [status, wamid]);
  } catch (err) {
    console.error('[chat-store] exception updating message status:', err.message);
  }
}

/**
 * Checks if the bot is currently paused for a specific contact.
 */
async function isBotPaused(phone) {
  try {
    const data = await one('SELECT bot_paused_until FROM contacts WHERE phone=$1', [phone]);
    if (!data || !data.bot_paused_until) return false;

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

    await q('UPDATE contacts SET bot_paused_until=$1 WHERE phone=$2', [pausedUntil, phone]);
  } catch (err) {
    console.error('[chat-store] exception setting bot pause:', err.message);
  }
}

/**
 * Updates the custom label for a contact.
 */
async function updateContactLabel(phone, label) {
  try {
    const payload = { label: label };
    if (label === 'read') payload.unread_count = 0;

    await updateContactFields(phone, payload);
  } catch (err) {
    console.error('[chat-store] exception updating label:', err.message);
  }
}

/**
 * Updates CRM fields for a contact (Phase 1).
 *
 * Status-change hook: when `lead_status` actually changes, the registered
 * listener fires (see setStatusChangeHook — index.js wires it to the
 * automation engine's handleStatusChange). Fire-and-forget: a hook failure
 * never breaks the CRM write.
 */
let _statusChangeHook = null;
function setStatusChangeHook(fn) {
  _statusChangeHook = typeof fn === 'function' ? fn : null;
}

async function updateContactCRM(phone, updates) {
  let oldStatus = null;
  const watchesStatus = updates && Object.prototype.hasOwnProperty.call(updates, 'lead_status');
  if (watchesStatus && _statusChangeHook) {
    try {
      const prev = await getContactByPhone(phone);
      oldStatus = (prev && prev.lead_status) || null;
    } catch { /* hook is best-effort */ }
  }

  try {
    await updateContactFields(phone, updates);
  } catch (err) {
    console.error('[chat-store] exception updating CRM fields:', err.message);
  }

  if (watchesStatus && _statusChangeHook) {
    const next = updates.lead_status;
    if (String(next || '') !== String(oldStatus || '')) {
      try {
        const r = _statusChangeHook(phone, oldStatus, next);
        if (r && typeof r.catch === 'function') r.catch(err => console.error('[chat-store] status hook:', err.message));
      } catch (err) {
        console.error('[chat-store] status hook threw:', err.message);
      }
    }
  }
}

/**
 * Fetches internal notes for a contact.
 */
async function getNotes(phone) {
  try {
    return await all('SELECT * FROM notes WHERE phone=$1 ORDER BY created_at DESC', [phone]);
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
    return await one(
      'INSERT INTO notes (phone, note, created_by) VALUES ($1,$2,$3) RETURNING *',
      [phone, note, created_by]
    );
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
    if (role === 'employee') {
      return await all(
        "SELECT * FROM contacts WHERE (assigned_agent=$1 OR assigned_agent='Unassigned' OR assigned_agent IS NULL) ORDER BY last_message_at DESC",
        [username]
      );
    }
    return await all('SELECT * FROM contacts ORDER BY last_message_at DESC');
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
    const data = await all(
      'SELECT * FROM contacts WHERE (abandonment_drip_stage IS NULL OR abandonment_drip_stage < 15)'
    );

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
    return await one('SELECT * FROM contacts WHERE phone=$1', [phone]);
  } catch (err) {
    console.error('[chat-store] error fetching contact:', err.message);
    return null;
  }
}

/**
 * Hash a password with SHA-256 (deterministic, no external dependency).
 */
function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

/**
 * Log in a user.
 * Compares against the SHA-256 hash of the supplied password. For backward
 * compatibility with legacy plaintext passwords already stored in the DB,
 * if the hash doesn't match but the raw value does, the row is silently
 * upgraded to the hashed form so subsequent logins use the hash.
 */
async function loginUser(username, password) {
  try {
    const data = await one('SELECT id, username, role, password_hash FROM users WHERE username=$1', [username]);
    if (!data) return null;

    const hashed = hashPassword(password);

    if (data.password_hash === hashed) {
      // Already using hashed password — good
    } else if (data.password_hash === password) {
      // Legacy plaintext match — auto-upgrade to hash
      await q('UPDATE users SET password_hash=$1 WHERE id=$2', [hashed, data.id]);
      console.log(`[chat-store] auto-upgraded password hash for ${username}`);
    } else {
      return null; // neither hash nor plaintext matched
    }

    // Update last login
    await q('UPDATE users SET last_login_at=$1 WHERE id=$2', [new Date().toISOString(), data.id]);

    return { id: data.id, username: data.username, role: data.role };
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
    return await all('SELECT username, role FROM users ORDER BY username ASC');
  } catch (err) {
    console.error('[chat-store] exception fetching users:', err.message);
    return [];
  }
}

// Per-campaign promise chain to serialize increments and prevent lost updates
// (Meta webhooks can fire concurrently for the same campaign).
const _metricQueue = new Map();
const _ALLOWED_METRICS = new Set(['sent', 'delivered', 'read', 'replied', 'booked', 'failed']);

async function updateBroadcastMetric(campaign_name, metric_type) {
  if (!_ALLOWED_METRICS.has(metric_type)) {
    console.error('[chat-store] updateBroadcastMetric rejected invalid metric:', metric_type);
    return;
  }
  const prev = _metricQueue.get(campaign_name) || Promise.resolve();
  const task = prev.then(async () => {
    // Atomic in Postgres: single-row upsert + increment, no lost updates,
    // no race between concurrent webhook deliveries. metric_type is
    // whitelist-checked above, so interpolating it is safe.
    await q(
      `INSERT INTO broadcast_metrics (campaign_name, sent, delivered, read, replied, booked, failed)
       VALUES ($1,0,0,0,0,0,0) ON CONFLICT (campaign_name) DO NOTHING`,
      [campaign_name]
    );
    await q(`UPDATE broadcast_metrics SET "${metric_type}" = "${metric_type}" + 1 WHERE campaign_name=$1`, [campaign_name]);
  }).catch((err) => {
    console.error('[chat-store] updateBroadcastMetric failed:', campaign_name, metric_type, err.message);
    throw err;
  });
  // Chain next call after this one (swallow rejection so queue doesn't stall)
  _metricQueue.set(campaign_name, task.catch(() => {}));
  return task;
}

async function getBroadcastMetrics() {
  try {
    return await all('SELECT * FROM broadcast_metrics ORDER BY campaign_name DESC LIMIT 1000');
  } catch(err) { return []; }
}

// ─── Read-receipt stats (additive — no existing logic touched) ──

/**
 * Counts outbound messages by WhatsApp status (sent/delivered/read/failed).
 * Uses head-count queries so it never fetches row data — O(1) per status.
 */
async function getMessageStatusCounts() {
  const statuses = ['sent', 'delivered', 'read', 'failed'];
  const counts = { sent: 0, delivered: 0, read: 0, failed: 0, total: 0 };
  try {
    const rows = await all(
      "SELECT status, COUNT(*)::int AS c FROM messages WHERE direction='outbound' GROUP BY status"
    );
    for (const r of rows) {
      if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] = r.c;
    }
    const t = await one("SELECT COUNT(*)::int AS c FROM messages WHERE direction='outbound'");
    counts.total = (t && t.c) || 0;
  } catch (err) {
    console.error('[chat-store] getMessageStatusCounts error:', err.message);
  }
  return counts;
}

/**
 * Aggregated broadcast read stats: per-campaign + grand totals.
 * Source of truth is broadcast_metrics (webhook delivered/read).
 */
async function getBroadcastReadStats() {
  const metrics = await getBroadcastMetrics();
  // Also compute failed per campaign from messages (source of truth for failures)
  let failedByCampaign = {};
  try {
    const msgs = await all("SELECT content, status FROM messages WHERE direction='outbound' AND content LIKE '[Template]%' LIMIT 2000");
    (msgs || []).forEach(r => {
      if (r.status !== 'failed') return;
      const cn = String(r.content || '').replace('[Template]','').trim().split(' ')[0];
      if (!cn) return;
      failedByCampaign[cn] = (failedByCampaign[cn] || 0) + 1;
    });
    // Fallback: if 2000 truncated, always count per campaign (otherwise undercounts)
    if ((msgs || []).length === 2000) {
      for (const m of metrics) {
        const r = await one(
          "SELECT COUNT(*)::int AS c FROM messages WHERE direction='outbound' AND status='failed' AND content LIKE $1 ESCAPE '\\'",
          [likePrefix('[Template] ' + m.campaign_name)]
        );
        failedByCampaign[m.campaign_name] = (r && r.c) || 0;
      }
    }
  } catch(_) { /* best-effort */ }
  let totalSent = 0, totalDelivered = 0, totalRead = 0, totalReplied = 0, totalBooked = 0, totalFailed = 0;
  for (const m of metrics) {
    totalSent += m.sent || 0;
    totalDelivered += m.delivered || 0;
    totalRead += m.read || 0;
    totalReplied += m.replied || 0;
    totalBooked += m.booked || 0;
    totalFailed += failedByCampaign[m.campaign_name] || 0;
  }
  const grandReadRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;
  const grandDeliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
  return {
    totals: { sent: totalSent, delivered: totalDelivered, read: totalRead, replied: totalReplied, booked: totalBooked, failed: totalFailed, readRate: grandReadRate, deliveryRate: grandDeliveryRate },
    campaigns: metrics.map((m) => ({
      campaign_name: m.campaign_name,
      sent: m.sent || 0,
      delivered: m.delivered || 0,
      read: m.read || 0,
      failed: failedByCampaign[m.campaign_name] || 0,
      replied: m.replied || 0,
      booked: m.booked || 0,
      readRate: (m.delivered || 0) > 0 ? Math.round(((m.read || 0) / m.delivered) * 100) : 0,
      deliveryRate: (m.sent || 0) > 0 ? Math.round(((m.delivered || 0) / m.sent) * 100) : 0,
    })),
  };
}

/**
 * Contacts for a campaign filtered by status.
 * status: 'sent'|'delivered'|'read'|'failed'|'replied' (replied uses contacts table).
 * For increment-semantics: delivered includes read, sent includes delivered+read+sent.
 */
async function getCampaignContacts(campaignName, status) {
  const safeName = String(campaignName || '').trim();
  if (!safeName) return [];
  const targetStatuses = (() => {
    if (status === 'delivered') return ['delivered', 'read'];
    if (status === 'sent') return ['sent', 'delivered', 'read'];
    if (['read', 'failed'].includes(status)) return [status];
    if (status === 'replied') return null; // handled via contacts table
    return null;
  })();

  try {
    if (status === 'replied') {
      // contacts who replied within this campaign
      const rows = await all(
        'SELECT phone, name, last_message, last_message_time FROM contacts WHERE attribution_campaign=$1 AND campaign_replied=true LIMIT 500',
        [safeName]
      );
      return (rows || []).map(r => ({ phone: r.phone, name: r.name || '', status: 'replied', last_message: r.last_message, last_message_time: r.last_message_time }));
    }
    if (targetStatuses) {
      // Fetch wamid + phone + status for this template, then enrich with contacts.name
      const data = await all(
        "SELECT phone, status, created_at, wamid FROM messages WHERE direction='outbound' AND content LIKE $1 ESCAPE '\\' AND status = ANY($2) ORDER BY created_at DESC LIMIT 500",
        [likePrefix('[Template] ' + safeName), targetStatuses]
      );
      if (!data || data.length === 0) return [];
      const phones = [...new Set(data.map(r => r.phone))];
      const contacts = await all('SELECT phone, name FROM contacts WHERE phone = ANY($1)', [phones]);
      const nameMap = new Map((contacts || []).map(c => [c.phone, c.name]));
      return data.map(r => ({ phone: r.phone, name: nameMap.get(r.phone) || '', status: r.status, created_at: r.created_at, wamid: r.wamid }));
    }
    // fallback: all for campaign
    const data = await all(
      "SELECT phone, status, created_at, wamid FROM messages WHERE direction='outbound' AND content LIKE $1 ESCAPE '\\' ORDER BY created_at DESC LIMIT 500",
      [likePrefix('[Template] ' + safeName)]
    );
    const phones2 = [...new Set((data || []).map(r => r.phone))];
    const contacts2 = await all('SELECT phone, name FROM contacts WHERE phone = ANY($1)', [phones2]);
    const nameMap2 = new Map((contacts2 || []).map(c => [c.phone, c.name]));
    return (data || []).map(r => ({ phone: r.phone, name: nameMap2.get(r.phone) || '', status: r.status, created_at: r.created_at, wamid: r.wamid }));
  } catch (err) {
    console.error('[chat-store] getCampaignContacts exception:', err.message);
    return [];
  }
}

/**
 * Today's operational counts for the Analytics tab (IST calendar day),
 * computed from the `contacts` table only:
 *   leads     — contacts with a message today that never had one before
 *               (approximated via first inbound message date)
 *   followups — contacts whose follow-up falls today (reuses getScheduledFollowups)
 *   calls     — always 0 in core (no calling module); kept for shape compat
 *   bookings  — contacts whose status contains "book" with activity today
 */
async function getTodayStats() {
  const today = istDateStr(Date.now());
  const isToday = (d) => !!d && istDateStr(d) === today;
  const stats = { leads: 0, followups: 0, calls: 0, bookings: 0 };
  try {
    const [msgs, contacts] = await Promise.all([
      all("SELECT phone, direction, created_at FROM messages WHERE direction='inbound' AND created_at >= $1 LIMIT 5000", [new Date(Date.now() - 48 * 3600e3).toISOString()]),
      all('SELECT phone, lead_status, last_message_at FROM contacts'),
    ]);
    const seenBefore = new Set();
    try {
      const older = await all("SELECT phone FROM messages WHERE direction='inbound' AND created_at < $1 LIMIT 5000", [new Date(Date.now() - 24 * 3600e3).toISOString()]);
      (older || []).forEach(r => seenBefore.add(r.phone));
    } catch { /* best-effort */ }
    const todayPhones = new Set();
    for (const m of (msgs || [])) {
      if (!isToday(m.created_at)) continue;
      todayPhones.add(m.phone);
      if (!seenBefore.has(m.phone)) stats.leads++;
    }
    for (const c of (contacts || [])) {
      if (/book/i.test(String(c.lead_status || '')) && isToday(c.last_message_at)) stats.bookings++;
    }
    void todayPhones;
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
    // contact can have up to 5 scheduled dates in follow_up_times (jsonb).
    const data = await all(
      "SELECT phone, name, assigned_agent, follow_up_time, follow_up_times, service_category FROM contacts WHERE lead_status='Follow-up Required'"
    );
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
 * The follow_up_seen_at column ships in neon-schema.sql.
 */
async function getScheduledFollowups() {
  try {
    const data = await all(
      'SELECT phone, name, assigned_agent, follow_up_time, follow_up_times, service_category, follow_up_seen_at FROM contacts WHERE follow_up_time IS NOT NULL ORDER BY follow_up_time ASC'
    );
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
    await q('UPDATE contacts SET follow_up_seen_at=$1 WHERE phone=$2', [new Date().toISOString(), phone]);
  } catch (err) {
    console.error('[chat-store] exception marking follow-up seen:', err.message);
  }
}

/**
 * Quick Replies Management
 */
async function getQuickReplies() {
  try {
    return await all('SELECT * FROM quick_replies ORDER BY shortcut ASC');
  } catch (err) { return []; }
}

async function addQuickReply(shortcut, message) {
  try {
    await q('DELETE FROM quick_replies WHERE shortcut=$1', [shortcut]);
    return await one('INSERT INTO quick_replies (shortcut, message) VALUES ($1,$2) RETURNING *', [shortcut, message]);
  } catch (err) { return null; }
}

async function deleteQuickReply(shortcut) {
  try {
    await q('DELETE FROM quick_replies WHERE shortcut=$1', [shortcut]);
  } catch (err) {}
}

/**
 * Fetches the conversation history for a specific contact.
 */
async function getMessages(phone) {
  try {
    return await all('SELECT * FROM messages WHERE phone=$1 ORDER BY created_at ASC', [phone]);
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
    return await one('SELECT * FROM messages WHERE id=$1', [id]);
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
    const row = await one(
      "SELECT wamid FROM messages WHERE phone=$1 AND direction='inbound' AND wamid IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      [phone]
    );
    return (row && row.wamid) || null;
  } catch {
    return null;
  }
}

// ─── Contact directory ──────────────────────────────────────
// The inbox + automation audiences run on the `contacts` table only.
// There are no separate lead tables in the white-label core; statuses,
// tags and assignment all live on the contact row itself.

/**
 * Ensures a chat contact exists so agents can open a normal conversation.
 * Sets name without touching label/drip state on existing contacts.
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
        await updateContactFields(phone, updates);
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
    return await one(
      'INSERT INTO contacts (phone, name, service_category, lead_status, label, last_message_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [row.phone, row.name, row.service_category, row.lead_status, row.label, row.last_message_at]
    );
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
    await q(
      'INSERT INTO notifications (lead_type, lead_id, type, title, body, is_read) VALUES ($1,$2,$3,$4,$5,$6)',
      ['whatsapp', phone || null, type, title, body, false]
    );
  } catch (err) {
    console.error('[chat-store] exception adding notification:', err.message);
  }
}

async function getNotifications(limit = 50, filter = null) {
  try {
    let sql = "SELECT * FROM notifications WHERE lead_type='whatsapp'";
    const params = [];
    if (filter === 'message') sql += " AND type='message'";
    else if (filter === 'not-message') sql += " AND type<>'message'";
    sql += ' ORDER BY created_at DESC LIMIT $1';
    params.push(limit);
    const data = await all(sql, params);
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
    await q("UPDATE notifications SET is_read=true WHERE lead_type='whatsapp' AND is_read=false");
  } catch (err) {
    console.error('[chat-store] exception marking notifications read:', err.message);
  }
}

// ─── Quick contact summary (shown when a chat is opened) ─────
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
 * Contact summary for the profile panel: the CRM row plus conversation
 * stats. Only filled-in fields are returned.
 */
async function getLeadSummary(phone) {
  const contact = await getContactByPhone(phone);
  if (!contact) return null;
  let totalMessages = 0;
  let inboundMessages = 0;
  try {
    const t = await one('SELECT COUNT(*)::int AS c FROM messages WHERE phone=$1', [phone]);
    totalMessages = (t && t.c) || 0;
    const inb = await one("SELECT COUNT(*)::int AS c FROM messages WHERE phone=$1 AND direction='inbound'", [phone]);
    inboundMessages = (inb && inb.c) || 0;
  } catch { /* stats are best-effort */ }
  return {
    ...pickFilled({
      name: contact.name,
      phone: contact.phone,
      status: contact.lead_status,
      agent: contact.assigned_agent,
      category: contact.lead_category,
      temperature: contact.lead_temperature,
      tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : contact.tags,
    }),
    totalMessages,
    inboundMessages,
    lastMessageAt: contact.last_message_at || null,
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
 * the contact row (reused from getLeadSummary — cheaper than asking the AI
 * to guess a lead category when the agent already set one).
 */
async function getAiContext(phone) {
  const [contact, messages, pendingNotifications, leadMatch] = await Promise.all([
    getContactByPhone(phone),
    getMessages(phone),
    all(
      "SELECT id, type, title, body, created_at FROM notifications WHERE lead_type='whatsapp' AND lead_id=$1 AND is_read=false",
      [phone]
    ),
    getLeadSummary(phone),
  ]);
  return { contact, messages, pendingNotifications, leadMatch };
}

/**
 * Merges freshly extracted fields into contacts.ai_extracted (never
 * clobbers a previously-known value with a blank one from a later turn
 * that simply didn't mention it) and updates category/locality/timestamp.
 */
async function saveAiAnalysis(phone, { extracted, leadCategory, localityVerification } = {}) {
  try {
    const existing = await one('SELECT ai_extracted FROM contacts WHERE phone=$1', [phone]);
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
    await updateContactFields(phone, updates);
  } catch (err) {
    console.error('[chat-store] exception saving AI analysis:', err.message);
  }
}

async function saveMessageTranslation(messageId, contentEn, language) {
  try {
    await q('UPDATE messages SET content_en=$1, language=$2 WHERE id=$3', [contentEn, language, messageId]);
  } catch (err) {
    console.error('[chat-store] exception saving message translation:', err.message);
  }
}

// Skips inserting a suggestion that duplicates an already-pending one for
// this phone (same type + title), so a re-analysis doesn't spam the popup.
async function createAiSuggestions(phone, suggestions) {
  if (!Array.isArray(suggestions) || !suggestions.length) return;
  try {
    const existing = await all(
      "SELECT type, title FROM ai_suggestions WHERE phone=$1 AND status='pending'",
      [phone]
    );
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
    if (rows.length) {
      const cols = '(phone, type, title, body, payload, status)';
      const ph = rows.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ');
      const params = rows.flatMap((r) => [r.phone, r.type, r.title, r.body, jb(r.payload), r.status]);
      await q(`INSERT INTO ai_suggestions ${cols} VALUES ${ph}`, params);
    }
  } catch (err) {
    console.error('[chat-store] exception creating AI suggestions:', err.message);
  }
}

async function getAiSuggestions(phone) {
  try {
    return await all(
      "SELECT * FROM ai_suggestions WHERE phone=$1 AND status='pending' ORDER BY created_at DESC",
      [phone]
    );
  } catch (err) { return []; }
}

// Scoped by phone as well as id — a stale/spoofed id can never touch
// another chat's suggestion.
async function dismissAiSuggestion(id, phone) {
  try {
    await q("UPDATE ai_suggestions SET status='dismissed' WHERE id=$1 AND phone=$2", [id, phone]);
  } catch (err) { console.error('[chat-store] exception dismissing AI suggestion:', err.message); }
}

async function applyAiSuggestion(id, phone) {
  try {
    await q("UPDATE ai_suggestions SET status='applied' WHERE id=$1 AND phone=$2", [id, phone]);
  } catch (err) { console.error('[chat-store] exception applying AI suggestion:', err.message); }
}

// Defense-in-depth: scoped to lead_type='whatsapp' + this exact phone, so
// even a hallucinated id from the AI can never mark another chat's (or the
// other CRM's) notification read.
async function dismissNotificationsByIds(ids, phone) {
  if (!Array.isArray(ids) || !ids.length || !phone) return;
  try {
    const clean = ids.map(Number).filter(Number.isFinite);
    if (!clean.length) return;
    await q("UPDATE notifications SET is_read=true WHERE id = ANY($1) AND lead_type='whatsapp' AND lead_id=$2", [clean, phone]);
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
  dismissNotificationsByIds,
  getLastInboundWamid,
  addNotification,
  getNotifications,
  markNotificationsRead,
  isBotPaused,
  setBotPause,
  getContacts,
  getAbandonedLeads,
  getContactByPhone,
  getMessages,
  updateContactLabel,
  updateContactCRM,
  setStatusChangeHook,
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
  updateMessageStatus,
  getMessageStatusCounts,
  getBroadcastReadStats,
  getCampaignContacts
};
