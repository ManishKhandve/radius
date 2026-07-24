// ============================================================
// match.js — proximity matching for the CRM chat interface
// ============================================================
// Finds the nearest maids for a customer, or the nearest customers for a
// maid, using the GPS coordinates already stored in the database.
//
// Rules (see spec):
//   • Uses stored latitude/longitude only — no Google Maps, no geocoding,
//     no external location API.
//   • Straight-line (Haversine) distance only — no roads/traffic/travel time.
//   • Anyone farther than 8 km is removed (daily travel beyond 8 km is
//     considered impractical).
//   • Read-only: this module never writes to or modifies any record.
//
// This is separate from matching.js, which the WhatsApp chatflow uses; that
// file is intentionally left alone.
// ============================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const MAX_DISTANCE_KM = 8;

// ─── Priority zones ─────────────────────────────────────────
const Z_P1 = { zone: 'P1', label: 'Under 1 km', color: '#10b981' }; // green
const Z_P2 = { zone: 'P2', label: '1–3 km',     color: '#3b82f6' }; // blue
const Z_P3 = { zone: 'P3', label: '3–6 km',     color: '#f59e0b' }; // orange
const Z_P4 = { zone: 'P4', label: '6–8 km',     color: '#ef4444' }; // red
const ZONE_ORDER = { P1: 1, P2: 2, P3: 3, P4: 4 };

// Returns the zone for a distance, or null when it is beyond 8 km (removed).
function getZone(distanceKm) {
  if (distanceKm < 1) return Z_P1;
  if (distanceKm <= 3) return Z_P2;
  if (distanceKm <= 6) return Z_P3;
  if (distanceKm <= MAX_DISTANCE_KM) return Z_P4;
  return null;
}

// ─── Haversine distance ─────────────────────────────────────
function deg2rad(deg) { return deg * (Math.PI / 180); }

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Some Postgres drivers return latitude/longitude as strings ("18.5204").
// Convert before calculating or the distance comes out NaN.
function toCoord(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function coordsOf(row) {
  const lat = toCoord(row.latitude);
  const lng = toCoord(row.longitude);
  return (lat === null || lng === null) ? null : { lat, lng };
}

// ─── Service matching (only applied when exactMatch = true) ──
// Flexible and case-insensitive, so "Cook" matches "Cooking" and
// "All-rounder" matches "All-rounder, Cooking".
function serviceTokens(value) {
  return String(value || '').toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 3);
}

function serviceMatches(needed, offered) {
  const want = serviceTokens(needed);
  const have = serviceTokens(offered);
  if (!want.length || !have.length) return false;
  return want.some(w => have.some(h => w === h || w.startsWith(h) || h.startsWith(w)));
}

// ─── Phone masking ──────────────────────────────────────────
// Applied AFTER matching and sorting so it never affects the results.
function maskPhone(phone) {
  const s = String(phone === null || phone === undefined ? '' : phone);
  if (s.length <= 4) return '****';
  return s.slice(0, 2) + '*'.repeat(s.length - 4) + s.slice(-2);
}

// Admins and employees see real numbers; anyone else gets them masked.
function canSeePhones(role) {
  return role === 'admin' || role === 'employee';
}

function showPhone(phone, role) {
  return canSeePhones(role) ? (phone || '') : maskPhone(phone);
}

// Shared core: score a pool of candidates against an origin point.
// Returns the surviving matches, sorted by zone then distance.
function rankCandidates(origin, pool, { exactMatch, wantedService, serviceFieldOf }) {
  const matches = [];
  for (const row of pool) {
    const c = coordsOf(row);
    if (!c) continue; // no GPS → cannot measure, skip
    const distance = haversineKm(origin.lat, origin.lng, c.lat, c.lng);
    const zone = getZone(distance);
    if (!zone) continue; // beyond 8 km → removed
    if (exactMatch && !serviceMatches(wantedService, serviceFieldOf(row))) continue;
    matches.push({
      row,
      distance_km: Math.round(distance * 100) / 100, // 0.84291 → 0.84
      zone: zone.zone,
      label: zone.label,
      color: zone.color,
    });
  }
  matches.sort((a, b) =>
    (ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone]) || (a.distance_km - b.distance_km)
  );
  return matches;
}

/**
 * Customer → Maid. Finds the nearest maids for a customer.
 * Returns { error, status } on failure, otherwise the response payload.
 */
async function matchMaidsForCustomer(customerId, { exactMatch = false, role = null } = {}) {
  if (!supabase) return { error: 'Database not configured', status: 500 };

  // Step 1 — the customer
  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, name, phone, service_needed, location, status, latitude, longitude')
    .eq('id', customerId)
    .single();
  if (error || !customer) return { error: 'Customer not found', status: 404 };

  const origin = coordsOf(customer);
  if (!origin) {
    return { error: 'Customer has no GPS coordinates saved. Please update their location first.', status: 400 };
  }

  // Step 2 — every maid that has coordinates
  const { data: maids } = await supabase
    .from('maids')
    .select('id, name, phone, service_type, areas_served, job_preference, status, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  const pool = (maids || []).filter(m => coordsOf(m));

  // Steps 3–6
  const matches = rankCandidates(origin, pool, {
    exactMatch,
    wantedService: customer.service_needed,
    serviceFieldOf: m => m.service_type,
  });

  // Step 7 — mask phones last
  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: showPhone(customer.phone, role),
      location: customer.location,
      latitude: origin.lat,
      longitude: origin.lng,
      service_needed: customer.service_needed,
      status: customer.status,
    },
    total_available: pool.length,
    matches_found: matches.length,
    maids: matches.map(m => ({
      id: m.row.id,
      name: m.row.name,
      phone: showPhone(m.row.phone, role),
      service_type: m.row.service_type,
      areas_served: m.row.areas_served,
      job_preference: m.row.job_preference,
      status: m.row.status,
      distance_km: m.distance_km,
      zone: m.zone,
      label: m.label,
      color: m.color,
    })),
  };
}

/**
 * Maid → Customer. Finds the nearest customers for a maid.
 * Same logic as above; only the table being searched differs.
 */
async function matchCustomersForMaid(maidId, { exactMatch = false, role = null } = {}) {
  if (!supabase) return { error: 'Database not configured', status: 500 };

  // Step 1 — the maid
  const { data: maid, error } = await supabase
    .from('maids')
    .select('id, name, phone, service_type, areas_served, job_preference, status, latitude, longitude')
    .eq('id', maidId)
    .single();
  if (error || !maid) return { error: 'Maid not found', status: 404 };

  const origin = coordsOf(maid);
  if (!origin) {
    return { error: 'Maid has no GPS coordinates saved. Please update their location first.', status: 400 };
  }

  // Step 2 — every customer that has coordinates
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, service_needed, location, status, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  const pool = (customers || []).filter(c => coordsOf(c));

  // Steps 3–6
  const matches = rankCandidates(origin, pool, {
    exactMatch,
    wantedService: maid.service_type,
    serviceFieldOf: c => c.service_needed,
  });

  // Step 7 — mask phones last
  return {
    maid: {
      id: maid.id,
      name: maid.name,
      phone: showPhone(maid.phone, role),
      service_type: maid.service_type,
      areas_served: maid.areas_served,
      status: maid.status,
      latitude: origin.lat,
      longitude: origin.lng,
    },
    total_pending_jobs: pool.length,
    matches_found: matches.length,
    customers: matches.map(m => ({
      id: m.row.id,
      name: m.row.name,
      phone: showPhone(m.row.phone, role),
      service_needed: m.row.service_needed,
      location: m.row.location,
      status: m.row.status,
      distance_km: m.distance_km,
      zone: m.zone,
      label: m.label,
      color: m.color,
    })),
  };
}

module.exports = {
  matchMaidsForCustomer,
  matchCustomersForMaid,
};
