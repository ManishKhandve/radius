// Performance debugging script
// Run this to identify bottlenecks

const flow = require('./flow');

// Mock message for testing
function createTestMessage(from, body) {
  return {
    from,
    body,
    type: 'chat',
    getContact: async () => ({
      pushname: 'Test User',
      name: 'Test User',
      id: { _serialized: from }
    })
  };
}

async function testPerformance() {
  console.log('🔍 Testing Bot Performance...\n');
  
  const testUser = '919999999999@s.whatsapp.net';
  
  // Test 1: Language selection
  console.time('⏱️  Language Selection');
  const { addInvite } = require('./invite-store');
  await addInvite(testUser);
  const msg1 = createTestMessage(testUser, 'hi');
  await flow.handleMessage(msg1);
  console.timeEnd('⏱️  Language Selection');
  
  // Test 2: Main menu
  console.time('⏱️  Main Menu');
  const msg2 = createTestMessage(testUser, '1');
  await flow.handleMessage(msg2);
  console.timeEnd('⏱️  Main Menu');
  
  // Test 3: Cleaning service
  console.time('⏱️  Cleaning Service');
  const msg3 = createTestMessage(testUser, '1');
  await flow.handleMessage(msg3);
  console.timeEnd('⏱️  Cleaning Service');
  
  // Test 4: Name input
  console.time('⏱️  Name Input');
  const msg4 = createTestMessage(testUser, 'John Doe');
  await flow.handleMessage(msg4);
  console.timeEnd('⏱️  Name Input');
  
  console.log('\n✅ Performance test complete!');
  console.log('Expected times:');
  console.log('  - Each step: <100ms');
  console.log('  - If >1000ms: There\'s a problem!');
  
  process.exit(0);
}

testPerformance().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
