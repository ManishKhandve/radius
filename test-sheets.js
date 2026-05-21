// test-sheets.js — write a dummy row into every tab and report errors clearly.
// Run on the VPS:  node test-sheets.js
require('dotenv').config();
const sheets = require('./sheets');

const ts = Date.now().toString().slice(-5);

(async () => {
  console.log('SPREADSHEET_ID env:', process.env.SPREADSHEET_ID ? 'set' : '❌ MISSING');
  console.log('Credentials file exists:', require('fs').existsSync('./credentials.json') ? 'yes' : '❌ NO');
  console.log('GOOGLE_CREDENTIALS env:', process.env.GOOGLE_CREDENTIALS ? 'set' : 'not set');
  console.log('');

  // 1. CUSTOMERS
  console.log('🧪 Testing CUSTOMERS sheet write...');
  try {
    const cid = await sheets.generateCustomerId();
    await sheets.appendCustomer({
      customerId: cid,
      name: `TEST-${ts}`,
      whatsappNumber: '910000000000',
      workType: 'Cooking',
      timing: 'Full Time (8 hrs)',
      budget: '₹6,000 – ₹10,000',
      status: 'TEST',
      source: 'test-sheets.js',
      city: 'Pune',
      area: 'Kharadi',
      language: 'en',
    });
    console.log('   ✅ CUSTOMERS write OK — id:', cid);
  } catch (e) {
    console.error('   ❌ CUSTOMERS failed:', e.message);
  }
  console.log('');

  // 2. BOOKINGS
  console.log('🧪 Testing BOOKINGS sheet write...');
  try {
    const bid = await sheets.generateBookingId();
    await sheets.appendBooking({
      bookingId: bid,
      customerName: `TEST-${ts}`,
      customerWhatsApp: '910000000000',
      maidName: 'Test Maid',
      maidId: 'M999',
      workType: 'Cooking',
      timing: 'Full Time (8 hrs)',
      startDate: '20 May',
      monthlySalary: '₹6,000 – ₹10,000',
      flat: 'Test Address, Kharadi',
      status: 'TEST',
      selectedPlan: 'Part-Time Standard (₹6,000)',
      city: 'Pune',
      area: 'Kharadi',
      language: 'en',
      paymentStatus: 'Pending',
    });
    console.log('   ✅ BOOKINGS write OK — id:', bid);
  } catch (e) {
    console.error('   ❌ BOOKINGS failed:', e.message);
  }
  console.log('');

  // 3. CLEANING_BOOKINGS
  console.log('🧪 Testing CLEANING_BOOKINGS sheet write...');
  try {
    const cbid = `CB${ts}`;
    await sheets.appendCleaningBooking({
      bookingId: cbid,
      customerName: `TEST-${ts}`,
      whatsappNumber: '910000000000',
      serviceType: 'Flat Deep Cleaning',
      details: 'Furnished - 2 BHK',
      location: 'Test Address, Baner',
      preferredDate: 'Tomorrow',
      estimatedPrice: '₹3,599',
      language: 'en',
    });
    console.log('   ✅ CLEANING_BOOKINGS write OK — id:', cbid);
  } catch (e) {
    console.error('   ❌ CLEANING_BOOKINGS failed:', e.message);
  }

  console.log('\n📋 Check your Google Sheet for rows with TEST-' + ts);
})();
