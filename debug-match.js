// debug-match.js — show all maids matching a workType near an area,
// including the ones filtered out and the reason why.
// Usage:  node debug-match.js Kharadi Cooking
//         node debug-match.js Baner Cleaning
//         node debug-match.js Wakad "All Rounder"

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const config = require('./config');
const { getDistanceFromLatLonInKm } = require('./matching');

const area = process.argv[2] || 'Kharadi';
const workType = process.argv[3] || 'Cooking';

const coords = config.puneAreaCoordinates[area] || config.pcmcAreaCoordinates[area];
if (!coords) {
  console.error(`❌ Unknown area "${area}". Valid Pune areas: ${config.puneAreas.join(', ')}`);
  console.error(`   Valid PCMC areas: ${config.pcmcAreas.join(', ')}`);
  process.exit(1);
}

console.log(`\n🔍 Looking for "${workType}" maids near ${area} (${coords.lat}, ${coords.lng})\n`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  realtime: { transport: ws }
});

(async () => {
  // Fetch ALL maids (no status filter) so we can see who's excluded and why
  const { data: maids, error } = await supabase.from('maids').select('*');
  if (error) { console.error('Supabase error:', error.message); process.exit(1); }

  console.log(`📊 Total maids in DB: ${maids.length}\n`);
  console.log('─'.repeat(110));
  console.log('ID   | Name                  | Status        | Service                  | Lat,Lng        | Distance | Result');
  console.log('─'.repeat(110));

  let topCandidates = [];

  for (const m of maids) {
    let result = '';
    let distance = null;

    const svc = (m.service_type || '').toLowerCase();
    const specificMatch = svc.includes(workType.toLowerCase());
    const genericMatch  = svc === 'maid';

    if (m.status !== 'Interested') {
      result = `❌ status="${m.status}" (need "Interested")`;
    } else if (!specificMatch && !genericMatch) {
      result = `❌ service "${m.service_type || 'none'}" doesn't match "${workType}" or "Maid"`;
    } else if (!m.latitude || !m.longitude) {
      result = `❌ missing lat/lng`;
    } else if (m.latitude < 15.6 || m.latitude > 22.1 || m.longitude < 72.6 || m.longitude > 80.9) {
      result = `❌ outside Maharashtra bbox`;
    } else {
      distance = getDistanceFromLatLonInKm(coords.lat, coords.lng, m.latitude, m.longitude);
      if (distance > 8) {
        result = `⚠️  ${distance.toFixed(2)}km — beyond 8km, excluded`;
      } else {
        let zone;
        if (distance < 1) zone = 'P1 🟢';
        else if (distance <= 3) zone = 'P2 🔵';
        else if (distance <= 6) zone = 'P3 🟠';
        else zone = 'P4 🔴';
        const tag = specificMatch ? 'SPECIFIC' : 'GENERIC';
        result = `✅ ${distance.toFixed(2)}km — ${zone} [${tag}]`;
        topCandidates.push({ ...m, distance, zone, specificMatch });
      }
    }

    console.log(
      `M${String(m.id).padEnd(4)}| ${(m.name || '-').padEnd(22)}| ${(m.status || '-').padEnd(14)}| ${(m.service_type || '-').padEnd(25)}| ${(m.latitude || '?')},${(m.longitude || '?')}`.padEnd(95) +
      `| ${distance ? distance.toFixed(2) + 'km' : '-'.padEnd(8)} | ${result}`
    );
  }

  console.log('─'.repeat(110));
  // Specific matches first, then by distance — same sort as matching.js
  topCandidates.sort((a, b) => {
    if (a.specificMatch !== b.specificMatch) return a.specificMatch ? -1 : 1;
    return a.distance - b.distance;
  });
  console.log(`\n🏆 Top 3 that WOULD be shown to the customer (specific match first, then distance):\n`);
  if (topCandidates.length === 0) {
    console.log('   (none — no matching maids within 8km)');
  } else {
    topCandidates.slice(0, 3).forEach((m, i) => {
      const tag = m.specificMatch ? 'SPECIFIC' : 'GENERIC';
      console.log(`   ${i + 1}. M${m.id} — ${m.name} — ${m.distance.toFixed(2)}km ${m.zone} [${tag}] — service: ${m.service_type}`);
    });
  }
  console.log();
})();
