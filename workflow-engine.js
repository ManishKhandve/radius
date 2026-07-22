// ============================================================
// workflow-engine.js — execution engine for the Automation builder
// ============================================================
// Runs published workflows: fires schedule/event triggers, resolves the
// audience with filters at execution time, then walks each recipient through
// the node graph. Per-recipient position (current node, loop counters,
// wake-up time) is persisted in workflow_tasks, so delays/loops survive
// server restarts. Failed sends are retried with backoff. Everything is
// logged to workflow_logs.
//
// A workflow definition is:
//   { nodes: [{id, type, x, y, config}], connections: [{from, port, to}],
//     settings: { preventDuplicates, timezone } }
// ============================================================

const store = require('./workflow-store');

const TICK_MS = 60_000;
const MAX_STEPS_PER_WAKE = 50;        // hard stop against runaway graphs
const RETRY_DELAYS_MIN = [5, 15, 60]; // send retry backoff
const SEND_GAP_MS = 250;              // pacing between sends (Meta rate limits)
const DEFAULT_TZ = 'Asia/Kolkata';

let deps = null; // { sendTemplate, toMetaPhone, log, chatStore }
let busy = false;

// ─── Timezone helpers (no external libs) ────────────────────
// Local date parts of an instant in a given IANA timezone.
const fmtCache = new Map();
function tzFmt(tz) {
  tz = tz || DEFAULT_TZ;
  if (!fmtCache.has(tz)) {
    try {
      fmtCache.set(tz, new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
      }));
    } catch {
      return tzFmt(DEFAULT_TZ); // invalid tz name → fall back
    }
  }
  return fmtCache.get(tz);
}

function tzParts(date, tz) {
  const p = {};
  for (const part of tzFmt(tz).formatToParts(date)) p[part.type] = part.value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return {
    y: +p.year, mo: +p.month, d: +p.day,
    h: +p.hour === 24 ? 0 : +p.hour, mi: +p.minute, dow,
  };
}

// The UTC instant at which wall-clock (y-mo-d h:mi) occurs in timezone tz.
// Guess UTC, measure the wall-clock it produces, correct by the difference
// (two passes handle DST edges; IST has none).
function instantFor(y, mo, d, h, mi, tz) {
  let t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  for (let i = 0; i < 2; i++) {
    const p = tzParts(t, tz);
    const diff = Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
    if (!diff) break;
    t = new Date(t.getTime() + diff);
  }
  return t;
}

function dayMatchesFilter(dow, filter) {
  if (filter === 'business') return dow >= 1 && dow <= 5;
  if (filter === 'weekend') return dow === 0 || dow === 6;
  return true;
}

// ─── Cron matcher (5 fields: min hour dom mon dow) ──────────
function cronFieldMatches(field, value, min, max) {
  if (field === '*' ) return true;
  for (const part of field.split(',')) {
    let [range, step] = part.split('/');
    step = step ? parseInt(step, 10) : 1;
    let lo = min, hi = max;
    if (range !== '*') {
      if (range.includes('-')) { const [a, b] = range.split('-'); lo = +a; hi = +b; }
      else { lo = hi = +range; }
    }
    if (Number.isNaN(lo) || Number.isNaN(hi) || Number.isNaN(step) || step < 1) continue;
    if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
  }
  return false;
}

function cronMatches(expr, parts) {
  const f = String(expr || '').trim().split(/\s+/);
  if (f.length !== 5) return false;
  return cronFieldMatches(f[0], parts.mi, 0, 59) &&
         cronFieldMatches(f[1], parts.h, 0, 23) &&
         cronFieldMatches(f[2], parts.d, 1, 31) &&
         cronFieldMatches(f[3], parts.mo, 1, 12) &&
         cronFieldMatches(f[4], parts.dow, 0, 6);
}

// ─── Next-run computation ───────────────────────────────────
// Returns the next Date the schedule should fire strictly after `after`,
// or null when the schedule has expired. Times are exact wall-clock
// instants in the configured timezone (no step-scanning drift).
function computeNextRun(cfg, after = new Date()) {
  const tz = cfg.timezone || DEFAULT_TZ;
  const [hh, mm] = String(cfg.time || '09:00').split(':').map(Number);
  const startDay = cfg.startDate ? Date.UTC(...String(cfg.startDate).split('-').map((v, i) => i === 1 ? v - 1 : +v)) : null;
  const endLimit = (!cfg.neverExpire && cfg.endDate) ? instantFor(...String(cfg.endDate).split('-').map(Number), 23, 59, tz) : null;

  if (cfg.mode === 'once') {
    if (!cfg.startDate) return null;
    const [y, mo, d] = String(cfg.startDate).split('-').map(Number);
    const t = instantFor(y, mo, d, hh, mm, tz);
    return t > after ? t : null;
  }

  if (cfg.mode === 'hourly') {
    // Fires at minute mm of every hour (respecting the day filter).
    for (let k = 0; k <= 24 * 8; k++) {
      const base = Math.floor(after.getTime() / 3600e3) * 3600e3 + k * 3600e3 + (mm % 60) * 60e3;
      const t = new Date(base);
      if (t <= after) continue;
      if (endLimit && t > endLimit) return null;
      if (dayMatchesFilter(tzParts(t, tz).dow, cfg.daysFilter)) return t;
    }
    return null;
  }

  if (cfg.mode === 'cron') {
    // Minute-resolution scan, bounded to 8 days (covers any weekly pattern).
    let t = new Date(Math.ceil(after.getTime() / 60000) * 60000 + 60000);
    const limit = after.getTime() + 8 * 86400e3;
    while (t.getTime() <= limit) {
      if (endLimit && t > endLimit) return null;
      const p = tzParts(t, tz);
      if (cronMatches(cfg.cron, p) && dayMatchesFilter(p.dow, cfg.daysFilter)) return t;
      t = new Date(t.getTime() + 60000);
    }
    return null;
  }

  // Day-based recurrences: iterate local calendar days, compute the exact
  // instant of hh:mm in tz for each, take the first valid one.
  const p0 = tzParts(after, tz);
  const baseUtcDay = Date.UTC(p0.y, p0.mo - 1, p0.d);
  for (let off = 0; off <= 400; off++) {
    const dayMs = baseUtcDay + off * 86400e3;
    const dd = new Date(dayMs); // holds the LOCAL calendar date in UTC fields
    const y = dd.getUTCFullYear(), mo = dd.getUTCMonth() + 1, d = dd.getUTCDate(), dow = dd.getUTCDay();
    if (startDay && dayMs < startDay) continue;
    if (!dayMatchesFilter(dow, cfg.daysFilter)) continue;

    let hit = false;
    if (cfg.mode === 'daily') hit = true;
    else if (cfg.mode === 'weekly') hit = dow === Number(cfg.weekday ?? 1);
    else if (cfg.mode === 'monthly') hit = d === Number(cfg.monthDay || 1);
    else if (cfg.mode === 'yearly') {
      const s = startDay ? new Date(startDay) : after;
      hit = d === (startDay ? s.getUTCDate() : s.getDate()) && mo === (startDay ? s.getUTCMonth() + 1 : s.getMonth() + 1);
    } else if (cfg.mode === 'every_x') {
      const anchor = startDay ?? baseUtcDay;
      const days = Math.round((dayMs - anchor) / 86400e3);
      const n = Math.max(1, Number(cfg.everyN) || 1);
      const unitDays = cfg.everyUnit === 'weeks' ? 7 * n : cfg.everyUnit === 'months' ? 30 * n : n;
      hit = days >= 0 && days % unitDays === 0;
    }
    if (!hit) continue;

    const t = instantFor(y, mo, d, hh, mm, tz);
    if (t <= after) continue;
    if (endLimit && t > endLimit) return null;
    return t;
  }
  return null;
}

// ─── Condition / filter evaluation ──────────────────────────
// groups: [{ conditions: [{field, op, value}] }] — OR of groups, AND within.
// Normalizes a multi-select value (array, or "a|b|c" string) to a lowercase list.
function valueList(v) {
  const arr = Array.isArray(v) ? v : String(v ?? '').split('|');
  return arr.map(s => String(s).trim().toLowerCase()).filter(Boolean);
}

function condMatches(record, c) {
  const raw = record ? record[c.field] : undefined;
  const val = raw === null || raw === undefined ? '' : String(raw);
  const want = Array.isArray(c.value) ? c.value.join('|') : String(c.value ?? '');
  const lv = val.toLowerCase(), lw = want.toLowerCase();
  switch (c.op) {
    case 'in':           return valueList(c.value).includes(lv);
    case 'not_in':       return !valueList(c.value).includes(lv);
    case 'contains_any': return valueList(c.value).some(w => lv.includes(w));
    case 'eq':           return lv === lw;
    case 'neq':          return lv !== lw;
    case 'contains':     return lv.includes(lw);
    case 'not_contains': return !lv.includes(lw);
    case 'empty':        return val.trim() === '';
    case 'not_empty':    return val.trim() !== '';
    case 'before':       return !!val && new Date(val) < new Date(want);
    case 'after':        return !!val && new Date(val) > new Date(want);
    case 'in_last_days': return !!val && (Date.now() - new Date(val).getTime()) <= (parseFloat(want) || 0) * 86400000;
    case 'older_than_days': return !!val && (Date.now() - new Date(val).getTime()) > (parseFloat(want) || 0) * 86400000;
    case 'gt':           return parseFloat(val) > parseFloat(want);
    case 'lt':           return parseFloat(val) < parseFloat(want);
    default:             return false;
  }
}

function groupsMatch(record, groups) {
  if (!Array.isArray(groups) || !groups.length) return true;
  return groups.some(g => (g.conditions || []).every(c => c.field && condMatches(record, c)));
}

// ─── Audience resolution ────────────────────────────────────
const SOURCES = { customers: 'customers', flat_customers: 'flat_customers', maids: 'maids', contacts: 'contacts' };
const NAME_FIELD = { customers: 'name', flat_customers: 'full_name', maids: 'name', contacts: 'name' };

async function resolveAudience(node) {
  const table = SOURCES[node.config.source];
  if (!table) return [];
  const { data } = await store.supabase.from(table).select('*').limit(5000);
  const out = [];
  const seen = new Set(); // the same number can appear on several rows —
                          // without this they'd each get the same message.
  for (const r of (data || [])) {
    if (!groupsMatch(r, node.config.groups)) continue;
    const phone = deps.toMetaPhone(r.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    // contacts has no numeric id (phone is the key) — fetchRecord uses phone.
    out.push({ phone, name: r[NAME_FIELD[table]] || 'Customer', source: table, record_id: table === 'contacts' ? null : (r.id ?? null) });
  }
  return out;
}

// Re-fetch a task's record so loop/if conditions see CURRENT data.
async function fetchRecord(task) {
  if (!task.source) return null;
  // contacts is keyed by phone, not a numeric id — look it up by the task's
  // phone. (Using record_id here silently returned nothing, so If/Else and
  // loop stop-conditions always saw an empty record.)
  if (task.source === 'contacts') {
    const { data } = await store.supabase.from('contacts').select('*').eq('phone', task.phone).single();
    return data || null;
  }
  if (task.record_id == null) return null;
  const { data } = await store.supabase.from(task.source).select('*').eq('id', task.record_id).single();
  return data || null;
}

// ─── Graph helpers ──────────────────────────────────────────
const nodeById = (def, id) => (def.nodes || []).find(n => n.id === id);
const nextOf = (def, id, port = 'out') =>
  (def.connections || []).filter(c => c.from === id && (c.port || 'out') === port).map(c => c.to);
const isTrigger = (n) => n && n.type.startsWith('trigger_');

function firstNodeAfterTrigger(def) {
  const trig = (def.nodes || []).find(isTrigger);
  if (!trig) return null;
  return nextOf(def, trig.id)[0] || null;
}

// ─── Validation (used by publish + the UI) ──────────────────
function validate(def) {
  const errors = [];
  const nodes = def.nodes || [];
  const triggers = nodes.filter(isTrigger);
  if (triggers.length !== 1) errors.push('Workflow must have exactly one trigger node.');
  const trig = triggers[0];
  if (trig) {
    if (trig.type === 'trigger_schedule') {
      const c = trig.config || {};
      if (!c.mode) errors.push('Schedule trigger needs a recurrence mode.');
      if (c.mode === 'once' && !c.startDate) errors.push('One-time schedule needs a start date.');
      if (c.mode === 'cron' && String(c.cron || '').trim().split(/\s+/).length !== 5) errors.push('Custom cron must have 5 fields (min hour day month weekday).');
      if (c.mode !== 'cron' && c.mode !== 'once' && !c.time) errors.push('Schedule needs a time of day.');
      if (c.timezone) {
        try { new Intl.DateTimeFormat('en-GB', { timeZone: c.timezone }); }
        catch { errors.push(`Timezone "${c.timezone}" is not valid — use a full IANA name like Asia/Kolkata.`); }
      }
      if (c.mode === 'once' && c.startDate && !computeNextRun(c, new Date())) {
        errors.push(`This one-time schedule (${c.startDate} ${c.time || ''}) is in the past. Pick a future date/time, or switch to a recurring mode.`);
      }
    }
    if (!nextOf(def, trig.id).length) errors.push('Trigger is not connected to anything.');
  }
  const needsAudience = trig && ['trigger_schedule', 'trigger_manual', 'trigger_webhook'].includes(trig.type);
  if (needsAudience && !nodes.some(n => n.type === 'audience')) errors.push('Add an Audience node to choose who receives the workflow.');
  for (const n of nodes) {
    if (n.type === 'audience' && !(n.config || {}).source) errors.push('Audience node has no data source selected.');
    if (n.type === 'action_send_template') {
      const tpl = String((n.config || {}).templateName || '').trim();
      if (!tpl) errors.push('Send Template node is missing the template name.');
      // Meta template names allow only lowercase letters, digits and underscores.
      else if (!/^[a-z0-9_]+$/.test(tpl)) {
        errors.push(`Template name "${tpl}" is not a valid Meta name — use only lowercase letters, digits and underscores (e.g. maid_job_opening_hi). Spaces and capitals are rejected by WhatsApp.`);
      }
    }
    if (n.type === 'logic_loop' && !((n.config || {}).maxIterations > 0) && !((n.config || {}).stopGroups || []).length) {
      errors.push('Loop needs a stop condition or a max iteration count.');
    }
    if (n.type === 'logic_delay' && !((n.config || {}).n > 0)) errors.push('Delay node needs a duration.');
    if (!isTrigger(n) && !(def.connections || []).some(c => c.to === n.id)) errors.push(`Node "${n.type}" (${n.id}) has no incoming connection.`);
  }
  return errors;
}

// ─── Node execution (one step of one task) ──────────────────
// Returns { next: nodeId|null, wakeAt: Date|null, done: bool }
async function execNode(wf, def, task, node, state) {
  const cfg = node.config || {};
  const settings = def.settings || {};

  switch (node.type) {
    case 'audience': {
      // As a mid-flow node it acts as a filter gate on this recipient.
      const rec = await fetchRecord(task);
      if (rec && !groupsMatch(rec, cfg.groups)) return { done: true, status: 'skipped', msg: 'filtered out by audience' };
      return { next: nextOf(def, node.id)[0] || null };
    }

    case 'action_send_template': {
      if (settings.preventDuplicates && !state.retrying && await store.hasSentBefore(wf.id, task.phone)) {
        await store.addLog(wf.id, task.run_id, node.id, 'send', task.phone, 'skipped', 'duplicate prevented');
        await store.bumpRun(task.run_id, 'skipped');
        return { next: nextOf(def, node.id)[0] || null };
      }
      const params = cfg.personalizeName ? [task.name || 'Customer'] : [];
      const r = await deps.sendTemplate(task.phone, cfg.templateName, cfg.lang || 'en', params, cfg.headerUrl || null);
      await new Promise(res => setTimeout(res, SEND_GAP_MS));
      if (r.ok) {
        delete state.retrying;
        await store.addLog(wf.id, task.run_id, node.id, 'send', task.phone, 'sent', cfg.templateName, task.retry_count);
        await store.bumpRun(task.run_id, 'sent');
        return { next: nextOf(def, node.id)[0] || null };
      }
      const errMsg = r.error?.message || 'send failed';
      if ((task.retry_count || 0) < RETRY_DELAYS_MIN.length) {
        state.retrying = true;
        await store.addLog(wf.id, task.run_id, node.id, 'send', task.phone, 'retrying', errMsg, task.retry_count + 1);
        return { retry: true, wakeAt: new Date(Date.now() + RETRY_DELAYS_MIN[task.retry_count] * 60000) };
      }
      delete state.retrying;
      await store.addLog(wf.id, task.run_id, node.id, 'send', task.phone, 'failed', errMsg, task.retry_count);
      await store.bumpRun(task.run_id, 'failed');
      return { next: nextOf(def, node.id)[0] || null }; // continue the flow after final failure
    }

    case 'action_update_status': {
      if (task.source && task.record_id != null && task.source !== 'contacts') {
        await store.supabase.from(task.source).update({ status: cfg.value }).eq('id', task.record_id);
      }
      await deps.chatStore.updateContactCRM(task.phone, { lead_status: cfg.value }).catch(() => {});
      await store.addLog(wf.id, task.run_id, node.id, 'action', task.phone, 'ok', `status → ${cfg.value}`);
      return { next: nextOf(def, node.id)[0] || null };
    }

    case 'action_add_note': {
      const stamp = `[wf ${new Date().toISOString().slice(0, 10)}] ${cfg.text || ''}`;
      if (task.source && task.record_id != null && task.source !== 'contacts') {
        const rec = await fetchRecord(task);
        const notes = rec && rec.notes ? rec.notes + '\n' + stamp : stamp;
        await store.supabase.from(task.source).update({ notes }).eq('id', task.record_id);
      }
      await store.addLog(wf.id, task.run_id, node.id, 'action', task.phone, 'ok', 'note added');
      return { next: nextOf(def, node.id)[0] || null };
    }

    case 'action_create_reminder': {
      const due = new Date(Date.now() + (cfg.daysFromNow || 1) * 86400000);
      if (cfg.time) { const [h, m] = cfg.time.split(':').map(Number); due.setHours(h, m, 0, 0); }
      await deps.chatStore.ensureContact(task.phone, task.name, null);
      await deps.chatStore.updateContactCRM(task.phone, { lead_status: 'Follow-up Required', follow_up_time: due.toISOString() }).catch(() => {});
      await store.addLog(wf.id, task.run_id, node.id, 'action', task.phone, 'ok', `reminder set ${due.toISOString()}`);
      return { next: nextOf(def, node.id)[0] || null };
    }

    case 'action_assign': {
      await deps.chatStore.ensureContact(task.phone, task.name, null);
      await deps.chatStore.updateContactCRM(task.phone, { assigned_agent: cfg.agent }).catch(() => {});
      await store.addLog(wf.id, task.run_id, node.id, 'action', task.phone, 'ok', `assigned → ${cfg.agent}`);
      return { next: nextOf(def, node.id)[0] || null };
    }

    case 'logic_if': {
      const rec = await fetchRecord(task);
      const port = groupsMatch(rec, cfg.groups) ? 'true' : 'false';
      return { next: nextOf(def, node.id, port)[0] || null };
    }

    case 'logic_switch': {
      const rec = await fetchRecord(task);
      const val = String((rec || {})[cfg.field] ?? '').toLowerCase();
      const cases = cfg.cases || [];
      for (let i = 0; i < cases.length; i++) {
        if (val === String(cases[i]).toLowerCase()) return { next: nextOf(def, node.id, 'case' + i)[0] || null };
      }
      return { next: nextOf(def, node.id, 'default')[0] || null };
    }

    case 'logic_delay': {
      if (state.delayed === node.id) { delete state.delayed; return { next: nextOf(def, node.id)[0] || null }; }
      state.delayed = node.id;
      const unitMs = { minutes: 60e3, hours: 3600e3, days: 86400e3 }[cfg.unit || 'days'];
      return { wakeAt: new Date(Date.now() + (cfg.n || 1) * unitMs), stay: true };
    }

    case 'logic_wait_until': {
      const until = new Date(cfg.date || Date.now());
      if (until > new Date()) {
        if (state.delayed === node.id) { /* woke early somehow */ }
        state.delayed = node.id;
        return { wakeAt: until, stay: true };
      }
      delete state.delayed;
      return { next: nextOf(def, node.id)[0] || null };
    }

    case 'logic_loop': {
      state.loops = state.loops || {};
      const L = state.loops[node.id] = state.loops[node.id] || { iter: 0 };
      const unitMs = { minutes: 60e3, hours: 3600e3, days: 86400e3, weeks: 604800e3 }[cfg.intervalUnit || 'days'];
      const intervalMs = Math.max(1, Number(cfg.intervalN) || 1) * unitMs;

      // The wait between iterations is enforced HERE, at the loop node, so it
      // applies no matter how the body comes back — whether the last body node
      // is wired back to this loop or simply dead-ends. (Previously the gap
      // lived on the dead-end path only, so wiring the body back to the loop
      // fired every iteration instantly.)
      if (L.nextAt && Date.now() < new Date(L.nextAt).getTime()) {
        return { wakeAt: new Date(L.nextAt), stay: true };
      }

      const rec = await fetchRecord(task);
      const stop = ((cfg.stopGroups || []).length && groupsMatch(rec, cfg.stopGroups)) ||
                   (Number(cfg.maxIterations) > 0 && L.iter >= Number(cfg.maxIterations));
      if (stop) {
        delete state.loops[node.id];
        delete state.loopReturn;
        return { next: nextOf(def, node.id, 'exit')[0] || null };
      }
      L.iter++;
      L.nextAt = new Date(Date.now() + intervalMs).toISOString();
      state.loopReturn = node.id;   // dead-ends in the body return here
      return { next: nextOf(def, node.id, 'do')[0] || null };
    }

    case 'split': {
      // Continue on out1; spawn parallel task copies for out2/out3.
      for (const port of ['out2', 'out3']) {
        const target = nextOf(def, node.id, port)[0];
        if (target) {
          await store.createTasks([{
            workflow_id: wf.id, run_id: task.run_id, phone: task.phone, name: task.name,
            source: task.source, record_id: task.record_id, node_id: target,
            state: JSON.parse(JSON.stringify(state)), wake_at: new Date().toISOString(),
          }]);
        }
      }
      return { next: nextOf(def, node.id, 'out')[0] || nextOf(def, node.id, 'out1')[0] || null };
    }

    case 'merge':
      return { next: nextOf(def, node.id)[0] || null };

    case 'end':
      return { done: true, status: 'done' };

    default:
      return { next: nextOf(def, node.id)[0] || null };
  }
}

// Walk one task until it blocks (delay/retry) or finishes.
async function processTask(task) {
  const wf = await store.getWorkflow(task.workflow_id);
  if (!wf) { await store.updateTask(task.id, { status: 'cancelled' }); return; }
  // Only an explicit user pause freezes in-flight work. A workflow whose
  // schedule is exhausted is 'completed' — already-queued recipients must
  // still finish, otherwise a one-time schedule could never deliver anything.
  if (wf.status === 'paused') return;
  const def = wf.definition || {};
  const state = task.state || {};
  let nodeId = task.node_id;
  let steps = 0;

  let stopped = false; // node vanished / threw — end this recipient
  while (nodeId && steps++ < MAX_STEPS_PER_WAKE) {
    const node = nodeById(def, nodeId);
    if (!node) {
      await store.addLog(wf.id, task.run_id, nodeId, 'error', task.phone, 'error', 'node no longer exists in the workflow — stopping this recipient');
      stopped = true; break;
    }
    let r;
    try {
      r = await execNode(wf, def, task, node, state);
    } catch (err) {
      await store.addLog(wf.id, task.run_id, nodeId, 'error', task.phone, 'error', err.message);
      stopped = true; break;
    }
    if (r.retry) {
      await store.updateTask(task.id, { state, wake_at: r.wakeAt.toISOString(), retry_count: (task.retry_count || 0) + 1, last_error: 'retrying send' });
      return;
    }
    if (r.stay) { // delay / wait-until / loop interval: park on this node
      await store.updateTask(task.id, { state, node_id: nodeId, wake_at: r.wakeAt.toISOString(), retry_count: task.retry_count || 0 });
      return;
    }
    if (r.done) {
      await store.updateTask(task.id, { state, status: r.status === 'skipped' ? 'skipped' : 'done', retry_count: task.retry_count || 0 });
      return;
    }
    task.retry_count = 0; // a step succeeded — reset the send-retry budget
    if (!r.next) {
      // Dead end inside a loop body → back to the loop node, which enforces
      // the interval before the next iteration.
      if (state.loopReturn) {
        const loopId = state.loopReturn;
        delete state.loopReturn;
        await store.updateTask(task.id, { state, node_id: loopId, wake_at: new Date().toISOString(), retry_count: 0 });
        return;
      }
      await store.updateTask(task.id, { state, status: 'done', retry_count: 0 });
      return;
    }
    nodeId = r.next;
  }

  // Ran out of steps this wake (e.g. a very long chain) — keep the recipient
  // and continue next tick instead of silently dropping them.
  if (!stopped && nodeId) {
    await store.addLog(wf.id, task.run_id, nodeId, 'run', task.phone, 'requeued', `step limit (${MAX_STEPS_PER_WAKE}) reached — continuing next tick`);
    await store.updateTask(task.id, { state, node_id: nodeId, wake_at: new Date().toISOString(), retry_count: task.retry_count || 0 });
    return;
  }
  await store.updateTask(task.id, { state, status: 'done', retry_count: task.retry_count || 0 });
}

// ─── Runs: start a workflow for its audience ────────────────
async function startRun(wf, triggerLabel, recipients = null) {
  const def = wf.definition || {};
  const audienceNode = (def.nodes || []).find(n => n.type === 'audience');
  let people = recipients;
  if (!people) people = audienceNode ? await resolveAudience(audienceNode) : [];

  // Final safety net: never queue the same number twice in one run, whoever
  // supplied the list (audience node, event trigger, or a manual call).
  const seenPhones = new Set();
  people = people.filter(p => {
    if (!p.phone || seenPhones.has(p.phone)) return false;
    seenPhones.add(p.phone);
    return true;
  });

  const run = await store.createRun(wf.id, triggerLabel, people.length);
  if (!run) return null;

  // Tasks begin at the node after the trigger (audience gate re-checks are fine).
  const entry = firstNodeAfterTrigger(def);
  if (!entry) { await store.addLog(wf.id, run.id, null, 'error', null, 'error', 'no entry node'); return run; }
  const rows = people.map(p => ({
    workflow_id: wf.id, run_id: run.id, phone: p.phone, name: p.name,
    source: p.source || null, record_id: p.record_id ?? null,
    node_id: entry, wake_at: new Date().toISOString(),
  }));
  await store.createTasks(rows);
  await store.addLog(wf.id, run.id, null, 'run', null, 'started', `${triggerLabel} — ${people.length} recipients`);
  return run;
}

// ─── Event triggers (polled) ────────────────────────────────
async function pollEventTriggers(wf) {
  const def = wf.definition || {};
  const trig = (def.nodes || []).find(isTrigger);
  if (!trig) return;
  const es = wf.engine_state || {};
  const nowIso = new Date().toISOString();

  if (trig.type === 'trigger_customer_created') {
    const table = SOURCES[trig.config?.source] || 'customers';
    const since = es['created_' + table] || wf.updated_at || nowIso;
    const { data } = await store.supabase.from(table).select('*').gt('created_at', since).order('created_at', { ascending: true }).limit(200);
    if (data && data.length) {
      const people = data
        .filter(r => groupsMatch(r, trig.config?.groups))
        .map(r => ({ phone: deps.toMetaPhone(r.phone), name: r[NAME_FIELD[table]] || 'Customer', source: table, record_id: r.id }))
        .filter(p => p.phone);
      if (people.length) await startRun(wf, 'record created', people);
      es['created_' + table] = data[data.length - 1].created_at;
      await store.updateWorkflow(wf.id, { engine_state: es }, 'engine');
    }
  }

  if (trig.type === 'trigger_followup_due') {
    const since = es.followup_since || nowIso;
    const { data } = await store.supabase.from('contacts').select('*')
      .eq('lead_status', 'Follow-up Required').gt('follow_up_time', since).lte('follow_up_time', nowIso);
    if (data && data.length) {
      const people = data.map(c => ({ phone: deps.toMetaPhone(c.phone), name: c.name || 'Customer', source: 'contacts', record_id: null })).filter(p => p.phone);
      if (people.length) await startRun(wf, 'follow-up due', people);
    }
    es.followup_since = nowIso;
    await store.updateWorkflow(wf.id, { engine_state: es }, 'engine');
  }
}

// ─── Main tick ──────────────────────────────────────────────
async function tick() {
  if (busy || !store.supabase) return;
  busy = true;
  try {
    const wfs = await store.listWorkflows();
    for (const w of wfs.filter(x => x.status === 'active')) {
      const wf = await store.getWorkflow(w.id);
      if (!wf) continue;
      const trig = ((wf.definition || {}).nodes || []).find(isTrigger);
      if (!trig) continue;

      if (trig.type === 'trigger_schedule') {
        if (wf.next_run_at && new Date(wf.next_run_at) <= new Date()) {
          await startRun(wf, 'schedule');
          const next = computeNextRun(trig.config || {}, new Date());
          await store.updateWorkflow(wf.id, {
            last_run_at: new Date().toISOString(),
            next_run_at: next ? next.toISOString() : null,
            // No further runs (e.g. one-time schedule) → 'completed', NOT
            // 'paused', so the recipients just queued still get processed.
            ...(next ? {} : { status: 'completed' }),
          }, 'engine');
        }
      } else if (['trigger_customer_created', 'trigger_followup_due'].includes(trig.type)) {
        await pollEventTriggers(wf);
      }
    }

    // Advance every due per-recipient task.
    const due = await store.dueTasks(40);
    for (const t of due) await processTask(t);
    await store.finishOpenRuns();
  } catch (err) {
    deps.log('error', 'workflow', 'tick failed:', err.message);
  } finally {
    busy = false;
  }
}

function init(dependencies) {
  deps = dependencies;
  setInterval(tick, TICK_MS);
  deps.log('info', 'workflow', `Automation engine started (tick every ${TICK_MS / 1000}s)`);
}

module.exports = {
  init, tick, validate, computeNextRun, cronMatches, groupsMatch, condMatches,
  resolveAudience, startRun, SOURCES,
};
