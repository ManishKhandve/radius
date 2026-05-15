const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Create Supabase client only if credentials exist
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Calculates the distance between two coordinates using the Haversine formula
 * @returns {number} distance in kilometers
 */
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Categorize distance into Zones
 */
function getZone(distance) {
  if (distance < 1) return { name: "P1 Zone (Green)", level: 1 };
  if (distance <= 3) return { name: "P2 Zone (Blue)", level: 2 };
  if (distance <= 6) return { name: "P3 Zone (Orange)", level: 3 };
  if (distance <= 8) return { name: "P4 Zone (Red)", level: 4 };
  return { name: "Out of Range", level: 5 }; // Excluded
}

/**
 * Fetch top 3 maids based on the customer's coordinates
 */
async function getTopMaids(customerLat, customerLng) {
  if (!supabase) {
    throw new Error("Supabase credentials missing. Please set SUPABASE_URL and SUPABASE_KEY.");
  }

  if (!customerLat || !customerLng) {
    throw new Error("Customer location coordinates are missing.");
  }

  // Update table name if needed, assuming 'maids'
  const { data: maids, error } = await supabase
    .from('maids')
    .select('*')
    .eq('status', 'Available');

  if (error) {
    console.error("Supabase Error:", error);
    throw new Error("Failed to fetch maids from database.");
  }

  if (!maids || maids.length === 0) {
    return [];
  }

  const maidsWithDistance = [];

  for (const maid of maids) {
    // If maid missing coordinates, skip
    if (!maid.latitude || !maid.longitude) continue;

    const distance = getDistanceFromLatLonInKm(customerLat, customerLng, maid.latitude, maid.longitude);
    const zone = getZone(distance);

    // Exclude if beyond 8km
    if (zone.level <= 4) {
      maidsWithDistance.push({
        ...maid,
        distance: distance,
        zone: zone
      });
    }
  }

  // Sort: Primary by zone (P1 -> P4), Secondary by exact distance
  maidsWithDistance.sort((a, b) => {
    if (a.zone.level !== b.zone.level) {
      return a.zone.level - b.zone.level;
    }
    return a.distance - b.distance;
  });

  // Return top 3
  return maidsWithDistance.slice(0, 3);
}

module.exports = {
  getTopMaids,
  getDistanceFromLatLonInKm
};
