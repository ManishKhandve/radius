// Test script to fetch existing maid data from Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

console.log('🔍 Testing Supabase Connection...\n');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'NOT SET');
console.log('\n' + '='.repeat(60) + '\n');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL or SUPABASE_KEY not set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchMaids() {
  try {
    console.log('📊 Fetching all maids from database...\n');
    
    const { data, error } = await supabase
      .from('maids')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) {
      console.error('❌ Error fetching data:', error.message);
      console.error('Details:', error);
      return;
    }
    
    if (!data || data.length === 0) {
      console.log('⚠️  No maids found in database');
      console.log('\nPossible reasons:');
      console.log('1. Table "maids" does not exist');
      console.log('2. Table is empty');
      console.log('3. Row Level Security is blocking access');
      return;
    }
    
    console.log(`✅ Successfully fetched ${data.length} maids!\n`);
    console.log('='.repeat(60) + '\n');
    
    // Display each maid
    data.forEach((maid, index) => {
      console.log(`${index + 1}. Maid ID: M${maid.id}`);
      console.log(`   Name: ${maid.name || 'N/A'}`);
      console.log(`   Service Type: ${maid.service_type || 'N/A'}`);
      console.log(`   Experience: ${maid.experience || 'N/A'}`);
      console.log(`   Salary Expectation: ₹${maid.salary_expectation || 'N/A'}`);
      console.log(`   Location: ${maid.area || 'N/A'}, ${maid.city || 'N/A'}`);
      console.log(`   Coordinates: ${maid.latitude}, ${maid.longitude}`);
      console.log(`   Phone: ${maid.phone || 'N/A'}`);
      console.log(`   Status: ${maid.status || 'N/A'}`);
      console.log(`   Created: ${maid.created_at || 'N/A'}`);
      console.log('');
    });
    
    console.log('='.repeat(60) + '\n');
    
    // Statistics
    console.log('📈 Statistics:\n');
    
    const cities = [...new Set(data.map(m => m.city))];
    console.log(`Cities: ${cities.join(', ')}`);
    
    const areas = [...new Set(data.map(m => m.area))];
    console.log(`Areas: ${areas.join(', ')}`);
    
    const available = data.filter(m => m.status === 'Available').length;
    const placed = data.filter(m => m.status === 'Placed').length;
    console.log(`\nAvailable: ${available}`);
    console.log(`Placed: ${placed}`);
    
    const avgSalary = data.reduce((sum, m) => sum + (m.salary_expectation || 0), 0) / data.length;
    console.log(`\nAverage Salary Expectation: ₹${Math.round(avgSalary)}`);
    
    console.log('\n' + '='.repeat(60) + '\n');
    console.log('✅ Test completed successfully!');
    
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    console.error('Stack:', err.stack);
  }
}

async function testMatching() {
  try {
    console.log('\n🎯 Testing Matching System...\n');
    console.log('Testing with Kharadi coordinates (18.5514, 73.9456)\n');
    
    const { getTopMaids } = require('./matching.js');
    const maids = await getTopMaids(18.5514, 73.9456);
    
    if (maids.length === 0) {
      console.log('⚠️  No maids found within 8km of Kharadi');
      return;
    }
    
    console.log(`✅ Found ${maids.length} maids within 8km:\n`);
    
    maids.forEach((maid, i) => {
      console.log(`${i + 1}. ${maid.name} (M${maid.id})`);
      console.log(`   Distance: ${maid.distance.toFixed(2)} km`);
      console.log(`   Zone: ${maid.zone.name}`);
      console.log(`   Location: ${maid.area}, ${maid.city}`);
      console.log('');
    });
    
  } catch (err) {
    console.error('❌ Matching test failed:', err.message);
  }
}

// Run tests
(async () => {
  await fetchMaids();
  await testMatching();
})();
