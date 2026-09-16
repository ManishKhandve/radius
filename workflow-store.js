// ============================================================
// workflow-store.js — persistence for the Automation workflow builder
// ============================================================
// All state lives in Neon Postgres so the engine survives Render restarts:
//   workflows          — definition (nodes/connections/settings), status, next run
//   workflow_versions  — snapshot on every save (version history / restore)
//   workflow_runs      — one row per execution batch, with counters
//   workflow_tasks     — per-recipient walker state (current node, wake_at, loops)
//   workflow_logs      — every action/audit event (who edited, what was sent, errors)
//
// Required SQL lives in neon-schema.sql (run once on a fresh database):
//   CREATE TABLE IF NOT EXISTS workflows (
//     id bigserial PRIMARY KEY, name text NOT NULL, status text DEFAULT 'draft',
//     definition jsonb DEFAULT '{}'::jsonb, version int DEFAULT 1,
//     next_run_at timestamptz, last_run_at timestamptz,
//     engine_state jsonb DEFAULT '{}'::jsonb,
//     created_by text, updated_by text,
//     created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
//   CREATE TABLE IF NOT EXISTS workflow_versions (
//     id bigserial PRIMARY KEY, workflow_id bigint, version int,
//     definition jsonb, saved_by text, saved_at timestamptz DEFAULT now());
//   CREATE TABLE IF NOT EXISTS workflow_runs (
//     id bigserial PRIMARY KEY, workflow_id bigint, trigger text,
//     status text DEFAULT 'running', started_at timestamptz DEFAULT now(),
//     finished_at timestamptz, total int DEFAULT 0, sent int DEFAULT 0,
//     failed int DEFAULT 0, skipped int DEFAULT 0);
//   CREATE TABLE IF NOT EXISTS workflow_tasks (
//     id bigserial PRIMARY KEY, workflow_id bigint, run_id bigint,
//     phone text, name text, source text, record_id bigint,
//     node_id text, state jsonb DEFAULT '{}'::jsonb,
//     wake_at timestamptz DEFAULT now(), status text DEFAULT 'active',
//     retry_count int DEFAULT 0, last_error text,
//     updated_at timestamptz DEFAULT now());
//   CREATE TABLE IF NOT EXISTS workflow_logs (
//     id bigserial PRIMARY KEY, workflow_id bigint, run_id bigint,
//     node_id text, type text, recipient text, status text,
//     message text, retry_count int DEFAULT 0,
//     created_at timestamptz DEFAULT now());
//   CREATE INDEX IF NOT EXISTS idx_wf_tasks_due ON workflow_tasks (status, wake_at);
//   CREATE INDEX IF NOT EXISTS idx_wf_logs_wf ON workflow_logs (workflow_id, created_at DESC);
// ============================================================

require('dotenv').config();
const { q, one, all, jb, hasDb } = require('./db');

if (!hasDb) {
  console.log(`${new Date().toISOString()} [workflow-store] no database — automation is in-memory only (nothing persists).`);
}

// JSON-safe param for jsonb columns (definition, engine_state, state).
function sqlVal(v) {
  return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
}

// ─── Audience / event reads (table-whitelisted — never interpolate raw input) ──
const AUDIENCE_TABLES = new Set(['contacts']);
async function fetchAudienceRows(table) {
  if (!AUDIENCE_TABLES.has(table)) return [];
  try { return await all(`SELECT * FROM ${table} LIMIT 5000`); } catch { return []; }
}
async function listCreatedSince(table, since, limit = 200) {
  if (!AUDIENCE_TABLES.has(table)) return [];
  try {
    return await all(`SELECT * FROM ${table} WHERE created_at > $1 ORDER BY created_at ASC LIMIT $2`, [since, limit]);
  } catch { return []; }
}
async function listFollowupsDue(since, until) {
  try {
    return await all(
      "SELECT * FROM contacts WHERE lead_status='Follow-up Required' AND follow_up_time > $1 AND follow_up_time <= $2",
      [since, until]
    );
  } catch { return []; }
}
async function countRows(table) {
  if (!AUDIENCE_TABLES.has(table)) return 0;
  try {
    const r = await one(`SELECT COUNT(*)::int AS c FROM ${table}`);
    return (r && r.c) || 0;
  } catch { return 0; }
}
async function columnValues(source, field, limit = 5000) {
  if (!AUDIENCE_TABLES.has(source) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
    throw new Error('Unknown source/field');
  }
  const rows = await all(`SELECT "${field}" AS v FROM ${source} LIMIT $1`, [limit]);
  return rows.map((r) => r.v);
}

// ─── Workflows ──────────────────────────────────────────────
async function listWorkflows() {
  try {
    return await all(
      'SELECT id, name, status, version, next_run_at, last_run_at, created_by, updated_by, updated_at FROM workflows ORDER BY updated_at DESC'
    );
  } catch { return []; }
}

async function getWorkflow(id) {
  try {
    return await one('SELECT * FROM workflows WHERE id=$1', [id]);
  } catch { return null; }
}

async function createWorkflow(name, definition, username) {
  const data = await one(
    'INSERT INTO workflows (name, definition, status, created_by, updated_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, jb(definition), 'draft', username, username]
  );
  if (!data) throw new Error('Database not connected — cannot save workflows.');
  await saveVersion(data.id, 1, definition, username);
  return data;
}

async function updateWorkflow(id, patch, username) {
  patch.updated_by = username;
  patch.updated_at = new Date().toISOString();
  const keys = Object.keys(patch);
  const set = keys.map((k, i) => `"${k}"=$${i + 1}`).join(', ');
  const data = await one(
    `UPDATE workflows SET ${set} WHERE id=$${keys.length + 1} RETURNING *`,
    [...keys.map((k) => sqlVal(patch[k])), id]
  );
  if (!data) throw new Error('Workflow not found');
  return data;
}

// Save definition + bump version with a snapshot.
async function saveDefinition(id, definition, username) {
  const wf = await getWorkflow(id);
  if (!wf) throw new Error('Workflow not found');
  const version = (wf.version || 1) + 1;
  await saveVersion(id, version, definition, username);
  return updateWorkflow(id, { definition, version }, username);
}

async function deleteWorkflow(id) {
  for (const t of ['workflow_tasks', 'workflow_runs', 'workflow_versions', 'workflow_logs']) {
    await q(`DELETE FROM ${t} WHERE workflow_id=$1`, [id]);
  }
  await q('DELETE FROM workflows WHERE id=$1', [id]);
}

// ─── Versions ───────────────────────────────────────────────
async function saveVersion(workflowId, version, definition, username) {
  try {
    await q(
      'INSERT INTO workflow_versions (workflow_id, version, definition, saved_by) VALUES ($1,$2,$3,$4)',
      [workflowId, version, jb(definition), username]
    );
  } catch { /* non-fatal */ }
}

async function listVersions(workflowId) {
  try {
    return await all(
      'SELECT id, version, saved_by, saved_at FROM workflow_versions WHERE workflow_id=$1 ORDER BY version DESC LIMIT 30',
      [workflowId]
    );
  } catch { return []; }
}

async function getVersion(workflowId, version) {
  try {
    return await one(
      'SELECT * FROM workflow_versions WHERE workflow_id=$1 AND version=$2',
      [workflowId, version]
    );
  } catch { return null; }
}

// ─── Runs ───────────────────────────────────────────────────
async function createRun(workflowId, trigger, total) {
  return await one(
    'INSERT INTO workflow_runs (workflow_id, trigger, total) VALUES ($1,$2,$3) RETURNING *',
    [workflowId, trigger, total]
  );
}

async function bumpRun(runId, field) {
  try {
    // Atomic increment in a single statement — no lost updates under
    // concurrency. Column is whitelist-checked (only run counters).
    if (!['sent', 'failed', 'skipped'].includes(field)) return;
    await q(`UPDATE workflow_runs SET "${field}" = "${field}" + 1 WHERE id=$1`, [runId]);
  } catch { /* stats are best-effort */ }
}

async function finishOpenRuns() {
  // Mark runs finished once none of their tasks are still active.
  try {
    const open = await all("SELECT id FROM workflow_runs WHERE status='running' LIMIT 50");
    for (const r of (open || [])) {
      const c = await one("SELECT COUNT(*)::int AS c FROM workflow_tasks WHERE run_id=$1 AND status='active'", [r.id]);
      if (c && c.c === 0) {
        await q('UPDATE workflow_runs SET status=$1, finished_at=$2 WHERE id=$3', ['finished', new Date().toISOString(), r.id]);
      }
    }
  } catch { /* best-effort */ }
}

async function listRuns(workflowId, limit = 25) {
  try {
    if (workflowId) {
      return await all('SELECT * FROM workflow_runs WHERE workflow_id=$1 ORDER BY started_at DESC LIMIT $2', [workflowId, limit]);
    }
    return await all('SELECT * FROM workflow_runs ORDER BY started_at DESC LIMIT $1', [limit]);
  } catch { return []; }
}

// ─── Tasks (per-recipient walker state) ─────────────────────
async function createTasks(rows) {
  if (!rows.length) return;
  // Large audiences (100+
  // recipients) silently fail as a single insert, leaving zero tasks and
  // causing the run to finish immediately. Chunk into small batches.
  const BATCH = 50;
  const cols = '(workflow_id, run_id, phone, name, source, record_id, node_id, state, wake_at)';
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    try {
      const ph = chunk.map((_, k) => `($${k * 9 + 1}, $${k * 9 + 2}, $${k * 9 + 3}, $${k * 9 + 4}, $${k * 9 + 5}, $${k * 9 + 6}, $${k * 9 + 7}, $${k * 9 + 8}, $${k * 9 + 9})`).join(', ');
      const params = chunk.flatMap((r) => [r.workflow_id, r.run_id, r.phone, r.name, r.source || null, r.record_id ?? null, r.node_id, jb(r.state || {}), r.wake_at]);
      await q(`INSERT INTO workflow_tasks ${cols} VALUES ${ph}`, params);
    } catch (err) {
      console.error(`[workflow-store] createTasks batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(rows.length / BATCH)} failed (${chunk.length} rows):`, err.message);
    }
  }
}

async function dueTasks(limit = 40) {
  try {
    return await all(
      "SELECT * FROM workflow_tasks WHERE status='active' AND wake_at <= $1 ORDER BY wake_at ASC LIMIT $2",
      [new Date().toISOString(), limit]
    );
  } catch { return []; }
}

async function updateTask(id, patch) {
  patch.updated_at = new Date().toISOString();
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const set = keys.map((k, i) => `"${k}"=$${i + 1}`).join(', ');
  await q(`UPDATE workflow_tasks SET ${set} WHERE id=$${keys.length + 1}`, [...keys.map((k) => sqlVal(patch[k])), id]);
}

// Cancels every still-active task for a workflow. Returns how many were cleared.
async function cancelTasks(workflowId) {
  try {
    const rows = await all(
      "UPDATE workflow_tasks SET status='cancelled' WHERE workflow_id=$1 AND status='active' RETURNING id",
      [workflowId]
    );
    return (rows || []).length;
  } catch { return 0; }
}

// Cancels active tasks for ONE phone (one customer), optionally scoped to a
// subset of workflows. This is the "customer replied / status changed /
// agent paused" stop mechanism for sales sequences.
//   opts.onlyWorkflowIds   — cancel only these workflows (array of ids)
//   opts.excludeWorkflowIds — cancel everything except these (e.g. the onboarding
//                             workflow that just started for the same phone)
// Returns how many tasks were cleared.
async function cancelTasksForPhone(phone, opts = {}) {
  if (!phone) return 0;
  try {
    const reason = 'stopped: ' + (opts.reason || 'rule');
    let sql = "UPDATE workflow_tasks SET status='cancelled', last_error=$1 WHERE phone=$2 AND status='active'";
    const params = [reason, phone];
    if (Array.isArray(opts.onlyWorkflowIds) && opts.onlyWorkflowIds.length) {
      params.push(opts.onlyWorkflowIds);
      sql += ` AND workflow_id = ANY($${params.length}::bigint[])`;
    } else if (Array.isArray(opts.excludeWorkflowIds) && opts.excludeWorkflowIds.length) {
      params.push(opts.excludeWorkflowIds);
      sql += ` AND NOT (workflow_id = ANY($${params.length}::bigint[]))`;
    }
    sql += ' RETURNING id';
    const rows = await all(sql, params);
    return (rows || []).length;
  } catch { return 0; }
}

// Lists a phone's still-active tasks (for the inbox "automation" indicator).
async function activeTasksForPhone(phone, limit = 50) {
  if (!phone) return [];
  try {
    return await all(
      "SELECT id, workflow_id, node_id, wake_at, retry_count FROM workflow_tasks WHERE phone=$1 AND status='active' ORDER BY wake_at ASC LIMIT $2",
      [phone, limit]
    );
  } catch { return []; }
}

// ─── Per-contact automation pause ───────────────────────────
// "Salesperson manually pauses automation → STOP ALL AUTOMATIC MESSAGES".
// Memory map is the source of truth at runtime; the optional
// contacts.automation_paused column (see SALES_FLOW_SETUP.md) makes it
// survive restarts. Every read/write degrades gracefully when the column
// doesn't exist yet.
const _automationPaused = new Map(); // phone -> true

function _colMissing(err) {
  const msg = String((err && err.message) || '');
  return /automation_paused|column.*does not exist|PGRST204|42703/i.test(msg);
}

async function isAutomationPaused(phone) {
  if (!phone) return false;
  if (_automationPaused.has(phone)) return true;
  try {
    const row = await one('SELECT automation_paused FROM contacts WHERE phone=$1', [phone]);
    if (row && row.automation_paused) {
      _automationPaused.set(phone, true);
      return true;
    }
    return false;
  } catch { return false; }
}

async function setAutomationPaused(phone, paused) {
  if (!phone) return;
  if (paused) _automationPaused.set(phone, true);
  else _automationPaused.delete(phone);
  try {
    await q('UPDATE contacts SET automation_paused=$1 WHERE phone=$2', [!!paused, phone]);
  } catch { /* memory map still applies */ }
}

// ─── Logs (executions + audit trail) ────────────────────────
async function addLog(workflowId, runId, nodeId, type, recipient, status, message, retryCount = 0) {
  try {
    await q(
      'INSERT INTO workflow_logs (workflow_id, run_id, node_id, type, recipient, status, message, retry_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [workflowId, runId, nodeId, type, recipient, status, String(message || '').slice(0, 500), retryCount]
    );
  } catch { /* logging must never break execution */ }
}

async function listLogs({ workflowId, type, limit = 100 } = {}) {
  try {
    const conds = [];
    const params = [];
    if (workflowId) { params.push(workflowId); conds.push(`workflow_id=$${params.length}`); }
    if (type) { params.push(type); conds.push(`type=$${params.length}`); }
    params.push(limit);
    return await all(
      `SELECT * FROM workflow_logs${conds.length ? ' WHERE ' + conds.join(' AND ') : ''} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
  } catch { return []; }
}

// Has this workflow ever successfully messaged this phone? (duplicate guard)
async function hasSentBefore(workflowId, phone) {
  try {
    const row = await one(
      "SELECT COUNT(*)::int AS c FROM workflow_logs WHERE workflow_id=$1 AND recipient=$2 AND type='send' AND status='sent'",
      [workflowId, phone]
    );
    return ((row && row.c) || 0) > 0;
  } catch { return false; }
}

// Dashboard aggregates.
async function dashboardStats() {
  const out = { active: 0, draft: 0, paused: 0, sent: 0, failed: 0, nextRun: null };
  try {
    const wfs = await all('SELECT status, next_run_at FROM workflows');
    for (const w of (wfs || [])) {
      if (w.status === 'active') out.active++;
      else if (w.status === 'draft') out.draft++;
      else if (w.status === 'paused') out.paused++;
      if (w.status === 'active' && w.next_run_at && (!out.nextRun || w.next_run_at < out.nextRun)) out.nextRun = w.next_run_at;
    }
    const snt = await one("SELECT COUNT(*)::int AS c FROM workflow_logs WHERE type='send' AND status='sent'");
    const fld = await one("SELECT COUNT(*)::int AS c FROM workflow_logs WHERE type='send' AND status='failed'");
    out.sent = (snt && snt.c) || 0; out.failed = (fld && fld.c) || 0;
  } catch { /* partial stats are fine */ }
  return out;
}

module.exports = {
  hasDb, fetchAudienceRows, listCreatedSince, listFollowupsDue, countRows, columnValues,
  listWorkflows, getWorkflow, createWorkflow, updateWorkflow, saveDefinition, deleteWorkflow,
  listVersions, getVersion,
  createRun, bumpRun, finishOpenRuns, listRuns,
  createTasks, dueTasks, updateTask, cancelTasks, cancelTasksForPhone, activeTasksForPhone,
  isAutomationPaused, setAutomationPaused,
  addLog, listLogs, hasSentBefore, dashboardStats,
};
