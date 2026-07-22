// ============================================================
// workflow-store.js — persistence for the Automation workflow builder
// ============================================================
// All state lives in Supabase so the engine survives Render restarts:
//   workflows          — definition (nodes/connections/settings), status, next run
//   workflow_versions  — snapshot on every save (version history / restore)
//   workflow_runs      — one row per execution batch, with counters
//   workflow_tasks     — per-recipient walker state (current node, wake_at, loops)
//   workflow_logs      — every action/audit event (who edited, what was sent, errors)
//
// Required SQL (run once in the Supabase SQL editor):
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
const { createClient } = require('@supabase/supabase-js');

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

let tablesMissingWarned = false;
function warnMissing(err) {
  if (!tablesMissingWarned && /does not exist|schema cache/i.test(err.message || '')) {
    tablesMissingWarned = true;
    console.error('[workflow-store] ❌ workflow tables missing — run the SQL in workflow-store.js header. Automation is disabled until then.');
  }
}

// ─── Workflows ──────────────────────────────────────────────
async function listWorkflows() {
  try {
    const { data, error } = await supabase.from('workflows')
      .select('id, name, status, version, next_run_at, last_run_at, created_by, updated_by, updated_at')
      .order('updated_at', { ascending: false });
    if (error) { warnMissing(error); return []; }
    return data || [];
  } catch { return []; }
}

async function getWorkflow(id) {
  try {
    const { data, error } = await supabase.from('workflows').select('*').eq('id', id).single();
    if (error) { warnMissing(error); return null; }
    return data;
  } catch { return null; }
}

async function createWorkflow(name, definition, username) {
  const { data, error } = await supabase.from('workflows')
    .insert({ name, definition, status: 'draft', created_by: username, updated_by: username })
    .select().single();
  if (error) { warnMissing(error); throw new Error(error.message); }
  await saveVersion(data.id, 1, definition, username);
  return data;
}

async function updateWorkflow(id, patch, username) {
  patch.updated_by = username;
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('workflows').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
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
    await supabase.from(t).delete().eq('workflow_id', id);
  }
  const { error } = await supabase.from('workflows').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Versions ───────────────────────────────────────────────
async function saveVersion(workflowId, version, definition, username) {
  try {
    await supabase.from('workflow_versions').insert({ workflow_id: workflowId, version, definition, saved_by: username });
  } catch { /* non-fatal */ }
}

async function listVersions(workflowId) {
  try {
    const { data } = await supabase.from('workflow_versions')
      .select('id, version, saved_by, saved_at')
      .eq('workflow_id', workflowId).order('version', { ascending: false }).limit(30);
    return data || [];
  } catch { return []; }
}

async function getVersion(workflowId, version) {
  try {
    const { data } = await supabase.from('workflow_versions')
      .select('*').eq('workflow_id', workflowId).eq('version', version).single();
    return data;
  } catch { return null; }
}

// ─── Runs ───────────────────────────────────────────────────
async function createRun(workflowId, trigger, total) {
  const { data, error } = await supabase.from('workflow_runs')
    .insert({ workflow_id: workflowId, trigger, total }).select().single();
  if (error) { warnMissing(error); return null; }
  return data;
}

async function bumpRun(runId, field) {
  try {
    const { data } = await supabase.from('workflow_runs').select(field).eq('id', runId).single();
    if (data) await supabase.from('workflow_runs').update({ [field]: (data[field] || 0) + 1 }).eq('id', runId);
  } catch { /* stats are best-effort */ }
}

async function finishOpenRuns() {
  // Mark runs finished once none of their tasks are still active.
  try {
    const { data: open } = await supabase.from('workflow_runs').select('id').eq('status', 'running').limit(50);
    for (const r of (open || [])) {
      const { count } = await supabase.from('workflow_tasks')
        .select('*', { count: 'exact', head: true }).eq('run_id', r.id).eq('status', 'active');
      if (count === 0) {
        await supabase.from('workflow_runs').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', r.id);
      }
    }
  } catch { /* best-effort */ }
}

async function listRuns(workflowId, limit = 25) {
  try {
    let q = supabase.from('workflow_runs').select('*').order('started_at', { ascending: false }).limit(limit);
    if (workflowId) q = q.eq('workflow_id', workflowId);
    const { data } = await q;
    return data || [];
  } catch { return []; }
}

// ─── Tasks (per-recipient walker state) ─────────────────────
async function createTasks(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('workflow_tasks').insert(rows);
  if (error) warnMissing(error);
}

async function dueTasks(limit = 40) {
  try {
    const { data, error } = await supabase.from('workflow_tasks')
      .select('*').eq('status', 'active').lte('wake_at', new Date().toISOString())
      .order('wake_at', { ascending: true }).limit(limit);
    if (error) { warnMissing(error); return []; }
    return data || [];
  } catch { return []; }
}

async function updateTask(id, patch) {
  patch.updated_at = new Date().toISOString();
  await supabase.from('workflow_tasks').update(patch).eq('id', id);
}

// Cancels every still-active task for a workflow. Returns how many were cleared.
async function cancelTasks(workflowId) {
  try {
    const { data } = await supabase.from('workflow_tasks')
      .update({ status: 'cancelled' })
      .eq('workflow_id', workflowId).eq('status', 'active')
      .select('id');
    return (data || []).length;
  } catch { return 0; }
}

// ─── Logs (executions + audit trail) ────────────────────────
async function addLog(workflowId, runId, nodeId, type, recipient, status, message, retryCount = 0) {
  try {
    await supabase.from('workflow_logs').insert({
      workflow_id: workflowId, run_id: runId, node_id: nodeId, type,
      recipient, status, message: String(message || '').slice(0, 500), retry_count: retryCount,
    });
  } catch { /* logging must never break execution */ }
}

async function listLogs({ workflowId, type, limit = 100 } = {}) {
  try {
    let q = supabase.from('workflow_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (workflowId) q = q.eq('workflow_id', workflowId);
    if (type) q = q.eq('type', type);
    const { data } = await q;
    return data || [];
  } catch { return []; }
}

// Has this workflow ever successfully messaged this phone? (duplicate guard)
async function hasSentBefore(workflowId, phone) {
  try {
    const { count } = await supabase.from('workflow_logs')
      .select('*', { count: 'exact', head: true })
      .eq('workflow_id', workflowId).eq('recipient', phone)
      .eq('type', 'send').eq('status', 'sent');
    return (count || 0) > 0;
  } catch { return false; }
}

// Dashboard aggregates.
async function dashboardStats() {
  const out = { active: 0, draft: 0, paused: 0, sent: 0, failed: 0, nextRun: null };
  try {
    const { data: wfs } = await supabase.from('workflows').select('status, next_run_at');
    for (const w of (wfs || [])) {
      if (w.status === 'active') out.active++;
      else if (w.status === 'draft') out.draft++;
      else if (w.status === 'paused') out.paused++;
      if (w.status === 'active' && w.next_run_at && (!out.nextRun || w.next_run_at < out.nextRun)) out.nextRun = w.next_run_at;
    }
    const { count: sent } = await supabase.from('workflow_logs').select('*', { count: 'exact', head: true }).eq('type', 'send').eq('status', 'sent');
    const { count: failed } = await supabase.from('workflow_logs').select('*', { count: 'exact', head: true }).eq('type', 'send').eq('status', 'failed');
    out.sent = sent || 0; out.failed = failed || 0;
  } catch { /* partial stats are fine */ }
  return out;
}

module.exports = {
  supabase,
  listWorkflows, getWorkflow, createWorkflow, updateWorkflow, saveDefinition, deleteWorkflow,
  listVersions, getVersion,
  createRun, bumpRun, finishOpenRuns, listRuns,
  createTasks, dueTasks, updateTask, cancelTasks,
  addLog, listLogs, hasSentBefore, dashboardStats,
};
