// ============================================================
// db.js — Postgres (Neon) pool with graceful no-database mode
// ============================================================
// Configure with DATABASE_URL (Neon pooled connection string).
// Without it, q() resolves { rows: [] } so every store degrades to
// "empty data" instead of crashing. Nothing persists, nothing throws.
// Reconnect later just by setting DATABASE_URL.
//
// Helpers:
//   q(text, params) → { rows }            (raw pg result shape)
//   one(text, params) → first row | null
//   all(text, params) → rows array (never null)
//   jb(v) → JSONB-safe param (stringify objects/arrays, pass null through)
// ============================================================

require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = !!DATABASE_URL;

let pool = null;
if (hasDb) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  pool.on('error', (err) => {
    console.error(`${new Date().toISOString()} [db] pool error:`, err.message);
  });
  // Fail fast at boot so a bad connection string is obvious in the logs.
  pool.query('SELECT 1').then(
    () => console.log(`${new Date().toISOString()} [db] ✅ Neon connected`),
    (err) => console.error(`${new Date().toISOString()} [db] ❌ Neon connection FAILED:`, err.message)
  );
} else {
  console.warn(`${new Date().toISOString()} [db] No DATABASE_URL — running WITHOUT a database (empty data, nothing persists).`);
}

// Raw query. Throws on SQL errors (callers catch per-function, matching
// the old behaviour); resolves empty when there is no database.
async function q(text, params = []) {
  if (!pool) return { rows: [] };
  return pool.query(text, params);
}

async function one(text, params = []) {
  const r = await q(text, params);
  return (r.rows && r.rows[0]) || null;
}

async function all(text, params = []) {
  const r = await q(text, params);
  return r.rows || [];
}

// JSONB column param: stringify objects/arrays, pass null/strings through.
function jb(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

module.exports = { pool, hasDb, q, one, all, jb };
