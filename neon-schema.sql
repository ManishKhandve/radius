-- ============================================================
-- neon-schema.sql — White-label WhatsApp CRM on Neon Postgres
-- ============================================================
-- Run once on a FRESH Neon database (Neon SQL editor or psql):
--   psql $DATABASE_URL -f neon-schema.sql
--
-- Every table/column below is referenced by the app. Timestamps are
-- timestamptz (server sends ISO strings; pg handles them natively).
-- IDs created with bigserial come back from node-postgres as STRINGS —
-- the app treats ids opaquely (no arithmetic), so this is safe.
-- ============================================================

-- ─── Inbox / CRM ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  phone                text PRIMARY KEY,
  name                 text,
  last_message_at      timestamptz,
  last_message         text,
  last_message_time    timestamptz,
  label                text,
  unread_count         integer NOT NULL DEFAULT 0,
  abandonment_drip_stage integer NOT NULL DEFAULT 0,
  bot_paused_until     timestamptz,
  lead_status          text,
  assigned_agent       text,
  follow_up_time       timestamptz,
  follow_up_times      jsonb NOT NULL DEFAULT '[]'::jsonb,
  follow_up_seen_at    timestamptz,
  tags                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  attribution_campaign text,
  campaign_replied     boolean NOT NULL DEFAULT false,
  campaign_booked      boolean NOT NULL DEFAULT false,
  service_category     text,
  lead_temperature     text,
  lead_category        text,
  ai_extracted         jsonb NOT NULL DEFAULT '{}'::jsonb,
  locality_verification jsonb,
  ai_last_analyzed_at  timestamptz,
  automation_paused    boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message ON contacts (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status  ON contacts (lead_status);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned     ON contacts (assigned_agent);

CREATE TABLE IF NOT EXISTS messages (
  id          bigserial PRIMARY KEY,
  phone       text NOT NULL,
  direction   text NOT NULL,               -- 'inbound' | 'outbound'
  content     text,
  wamid       text,                        -- Meta message id (nullable)
  status      text,                        -- sent|delivered|read|failed
  content_en  text,                        -- AI English translation
  language    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_phone   ON messages (phone, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_wamid   ON messages (wamid);
CREATE INDEX IF NOT EXISTS idx_messages_status  ON messages (direction, status);

CREATE TABLE IF NOT EXISTS notes (
  id         bigserial PRIMARY KEY,
  phone      text NOT NULL,
  note       text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_phone ON notes (phone);

CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  user_id    text,                          -- telecalling-compat, unused by WA CRM
  lead_type  text NOT NULL DEFAULT 'whatsapp',
  lead_id    text,                          -- customer phone for WA alerts
  type       text NOT NULL DEFAULT 'alert',
  title      text,
  body       text,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_wa ON notifications (lead_type, created_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id            bigserial PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  role          text NOT NULL DEFAULT 'employee',  -- 'admin' | 'employee'
  password_hash text NOT NULL,                     -- SHA-256 hex
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quick_replies (
  shortcut text PRIMARY KEY,
  message  text NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
  id         bigserial PRIMARY KEY,
  phone      text NOT NULL,
  type       text NOT NULL DEFAULT 'suggestion',
  title      text NOT NULL,
  body       text,
  payload    jsonb,
  status     text NOT NULL DEFAULT 'pending',  -- pending|applied|dismissed
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_phone ON ai_suggestions (phone, status);

CREATE TABLE IF NOT EXISTS broadcast_metrics (
  campaign_name text PRIMARY KEY,
  sent          integer NOT NULL DEFAULT 0,
  delivered     integer NOT NULL DEFAULT 0,
  read          integer NOT NULL DEFAULT 0,
  replied       integer NOT NULL DEFAULT 0,
  booked        integer NOT NULL DEFAULT 0,
  failed        integer NOT NULL DEFAULT 0
);

-- ─── Automation builder ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflows (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'draft',   -- draft|active|paused|completed
  definition   jsonb NOT NULL DEFAULT '{}'::jsonb,
  version      integer NOT NULL DEFAULT 1,
  next_run_at  timestamptz,
  last_run_at  timestamptz,
  engine_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by   text,
  updated_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id          bigserial PRIMARY KEY,
  workflow_id bigint REFERENCES workflows (id) ON DELETE CASCADE,
  version     integer NOT NULL,
  definition  jsonb,
  saved_by    text,
  saved_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id          bigserial PRIMARY KEY,
  workflow_id bigint REFERENCES workflows (id) ON DELETE CASCADE,
  trigger     text,
  status      text NOT NULL DEFAULT 'running',  -- running|finished
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total       integer NOT NULL DEFAULT 0,
  sent        integer NOT NULL DEFAULT 0,
  failed      integer NOT NULL DEFAULT 0,
  skipped     integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workflow_tasks (
  id          bigserial PRIMARY KEY,
  workflow_id bigint REFERENCES workflows (id) ON DELETE CASCADE,
  run_id      bigint REFERENCES workflow_runs (id) ON DELETE CASCADE,
  phone       text,
  name        text,
  source      text,
  record_id   bigint,
  node_id     text,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  wake_at     timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'active',   -- active|done|skipped|cancelled
  retry_count integer NOT NULL DEFAULT 0,
  last_error  text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_due   ON workflow_tasks (status, wake_at);
CREATE INDEX IF NOT EXISTS idx_wf_tasks_phone ON workflow_tasks (phone, status);

CREATE TABLE IF NOT EXISTS workflow_logs (
  id          bigserial PRIMARY KEY,
  workflow_id bigint REFERENCES workflows (id) ON DELETE CASCADE,
  run_id      bigint REFERENCES workflow_runs (id) ON DELETE SET NULL,
  node_id     text,
  type        text,
  recipient   text,
  status      text,
  message     text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wf_logs_wf        ON workflow_logs (workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wf_logs_send_stat ON workflow_logs (type, status);
