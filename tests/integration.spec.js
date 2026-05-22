// @ts-check
const { test, expect } = require('@playwright/test');
const flow = require('../flow');

// Mock message factory
function createMockMessage(from, body, type = 'chat') {
  return {
    from,
    body,
    type,
    getContact: async () => ({
      pushname: 'Integration Test User',
      name: 'Integration Test User',
      id: { _serialized: from }
    }),
    downloadMedia: async () => ({
      data: Buffer.from('fake-image-data').toString('base64'),
      mimetype: 'image/jpeg'
    }),
    reply: async (text) => {
      console.log(`[Reply]: ${text.substring(0, 50)}...`);
    }
  };
}

test.describe('Integration Tests - Complete Cleaning Flow', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('Complete Flat Deep Cleaning flow - English', async () => {
    const userId = '919876540001@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    // Step 1: Start conversation
    await addInvite(userId);
    let responses = await flow.handleMessage(createMockMessage(userId, 'hi'));
    expect(responses[0]).toContain('Welcome to CLEANLY Services');
    
    // Step 2: Select English
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('Main menu');
    
    // Step 3: Select Cleaning Service
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('May I have your name');
    
    // Step 4: Provide name
    responses = await flow.handleMessage(createMockMessage(userId, 'John Smith'));
    expect(responses[0]).toContain('Which service are you looking for');
    
    // Step 5: Select Flat Deep Cleaning
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('Is the flat:');
    
    // Step 6: Select Furnished
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('current condition');
    
    // Step 7: Select Regular Occupied House
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('How many BHK');
    
    // Step 8: Select 2 BHK
    responses = await flow.handleMessage(createMockMessage(userId, '2'));
    expect(responses[0]).toContain('₹3,599');
    expect(responses[0]).toContain('Available Add-ons');
    
    // Step 9: Continue without add-ons
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('complete address');
    
    // Step 10: Provide address
    responses = await flow.handleMessage(createMockMessage(userId, 'Flat 4B, Sunrise Society, Baner, Pune'));
    expect(responses[0]).toContain('When do you need the service');
    
    // Step 11: Select Tomorrow
    responses = await flow.handleMessage(createMockMessage(userId, '2'));
    expect(responses[0]).toContain('Confirm');
    expect(responses[0]).toContain('John Smith');
    expect(responses[0]).toContain('₹3,599');
    
    // Step 12: Confirm booking
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('Thank you');
    expect(responses[0]).toContain('call shortly');
    
    // Session should be cleared
    expect(flow.sessions.has(userId)).toBe(false);
  });

  test('Complete Villa Cleaning flow - Hindi', async () => {
    const userId = '919876540002@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    // Select Hindi
    await flow.handleMessage(createMockMessage(userId, '3'));
    
    // Select Cleaning
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Provide name
    await flow.handleMessage(createMockMessage(userId, 'राज कुमार'));
    
    // Select Villa
    await flow.handleMessage(createMockMessage(userId, '4'));
    
    // Enter 2000 sqft
    await flow.handleMessage(createMockMessage(userId, '2000'));
    
    // Select Post Interior (₹9/sqft)
    let responses = await flow.handleMessage(createMockMessage(userId, '2'));
    expect(responses[0]).toContain('₹18000'); // 2000 * 9
    
    // Proceed with booking
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Provide address
    await flow.handleMessage(createMockMessage(userId, 'Villa 12, Green Valley, Pune'));
    
    // Select Today
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Confirm
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('धन्यवाद');
  });

  test('Complete Bathroom Subscription flow - Marathi', async () => {
    const userId = '919876540003@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    // Select Marathi
    await flow.handleMessage(createMockMessage(userId, '2'));
    
    // Select Cleaning
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Provide name
    await flow.handleMessage(createMockMessage(userId, 'प्रिया पाटील'));
    
    // Select Bathroom Cleaning
    await flow.handleMessage(createMockMessage(userId, '2'));
    
    // Select Subscription
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Select 3 bathrooms
    let responses = await flow.handleMessage(createMockMessage(userId, '2'));
    expect(responses[0]).toContain('₹3375');
    
    // Continue booking
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Provide address
    await flow.handleMessage(createMockMessage(userId, 'Flat 5C, Shivaji Nagar, Pune'));
    
    // Select custom date
    await flow.handleMessage(createMockMessage(userId, '3'));
    await flow.handleMessage(createMockMessage(userId, '25 May'));
    
    // Confirm
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('धन्यवाद');
  });

  test('Complete Mini Service flow with cart accumulation', async () => {
    const userId = '919876540004@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning
    await flow.handleMessage(createMockMessage(userId, 'Sarah Johnson'));
    
    // Select Mini Service
    await flow.handleMessage(createMockMessage(userId, '3'));
    
    // Add first batch: 6-1 (1 bathroom = ₹550)
    let responses = await flow.handleMessage(createMockMessage(userId, '6-1'));
    expect(responses[0]).toContain('₹550');
    expect(responses[0]).toContain('₹1450'); // Remaining
    
    // Add second batch: 3-1, 7-2 (fridge ₹300 + 2 fans ₹100 = ₹400)
    responses = await flow.handleMessage(createMockMessage(userId, '3-1, 7-2'));
    expect(responses[0]).toContain('₹950');
    expect(responses[0]).toContain('₹1050'); // Remaining
    
    // Add final batch: 10-7 (7 sofa seats = ₹1050)
    responses = await flow.handleMessage(createMockMessage(userId, '10-7'));
    
    // Should now proceed to address (minimum ₹2000 reached)
    expect(responses[0]).toContain('complete address');
    
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('COLLECT_FLAT');
  });
});

test.describe('Integration Tests - Complete Maid Flow', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('Complete Maid Service flow - Part Time', async () => {
    const userId = '919876540010@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    
    // Select Maid Service
    await flow.handleMessage(createMockMessage(userId, '2'));
    
    // Select Cooking
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Select Part Time
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Select Budget ₹6k-10k
    let responses = await flow.handleMessage(createMockMessage(userId, '2'));
    expect(responses[0]).toContain('select your city');
    
    // Select Pune
    responses = await flow.handleMessage(createMockMessage(userId, '1'));
    expect(responses[0]).toContain('select your area');
    expect(responses[0]).toContain('Baner');
    
    // Select Baner (option 2)
    responses = await flow.handleMessage(createMockMessage(userId, '2'));
    
    // Should show maids or "searching" message
    // (Actual maid display depends on Supabase data)
    const session = flow.sessions.get(userId);
    
    // If maids found, state should be MAID_CHOICE
    // If no maids, session might be cleared with support message
    expect(['MAID_CHOICE', undefined]).toContain(session?.state);
  });

  test('Complete Maid Service flow - Custom Area', async () => {
    const userId = '919876540011@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '2')); // Maid Service
    await flow.handleMessage(createMockMessage(userId, '2')); // Cleaning
    await flow.handleMessage(createMockMessage(userId, '2')); // Full Time 8hrs
    await flow.handleMessage(createMockMessage(userId, '1')); // Budget
    await flow.handleMessage(createMockMessage(userId, '2')); // PCMC
    
    // Select custom area (option 9 for PCMC)
    await flow.handleMessage(createMockMessage(userId, '9'));
    
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('MAID_CUSTOM_AREA');
    
    // Enter custom area
    let responses = await flow.handleMessage(createMockMessage(userId, 'Sinhgad Road'));
    
    expect(responses[0]).toContain('Sinhgad Road');
    expect(responses[0]).toContain('contact you shortly');
    
    // Should have admin alert
    expect(responses.length).toBe(2);
    expect(responses[1]._adminAlert).toBeDefined();
  });
});

test.describe('Integration Tests - Restart and Navigation', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('Should restart with "clean" keyword', async () => {
    const userId = '919876540020@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    // Start initial session
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '2')); // Maid Service
    
    // Now restart with "clean"
    let responses = await flow.handleMessage(createMockMessage(userId, 'clean'));
    
    // Should go directly to cleaning name (language remembered)
    expect(responses[0]).toContain('May I have your name');
    
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('CLEANING_NAME');
    expect(session.data.serviceCategory).toBe('cleaning');
  });

  test('Should restart with "maid" keyword', async () => {
    const userId = '919876540021@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    // Start with cleaning
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning
    
    // Restart with "maid"
    let responses = await flow.handleMessage(createMockMessage(userId, 'maid'));
    
    // Should go directly to work type
    expect(responses[0]).toContain('What type of work');
    
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('WORK_TYPE');
    expect(session.data.serviceCategory).toBe('maid');
  });

  test('Should handle support request mid-flow', async () => {
    const userId = '919876540022@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning
    await flow.handleMessage(createMockMessage(userId, 'Test User'));
    
    // Press 0 for support
    let responses = await flow.handleMessage(createMockMessage(userId, '0'));
    
    expect(responses[0]).toContain('support team');
    expect(responses[0]).toContain('+91 9975233763');
    
    // Session should be cleared
    expect(flow.sessions.has(userId)).toBe(false);
  });

  test('Should handle cancellation', async () => {
    const userId = '919876540023@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning
    await flow.handleMessage(createMockMessage(userId, 'Test User'));
    await flow.handleMessage(createMockMessage(userId, '1')); // Flat Deep Cleaning
    await flow.handleMessage(createMockMessage(userId, '1')); // Furnished
    await flow.handleMessage(createMockMessage(userId, '1')); // Regular
    await flow.handleMessage(createMockMessage(userId, '2')); // 2 BHK
    
    // Cancel (option 3 when add-ons available)
    let responses = await flow.handleMessage(createMockMessage(userId, '3'));
    
    expect(responses[0]).toContain('cancelled') || expect(responses[0]).toContain('cancel');
    
    // Session should be cleared
    expect(flow.sessions.has(userId)).toBe(false);
  });
});

test.describe('Integration Tests - Error Handling', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('Should handle invalid input gracefully', async () => {
    const userId = '919876540030@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    // Invalid language selection
    let responses = await flow.handleMessage(createMockMessage(userId, '99'));
    expect(responses[0]).toContain('Welcome to CLEANLY Services');
    
    // Valid selection
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Invalid menu selection
    responses = await flow.handleMessage(createMockMessage(userId, '99'));
    expect(responses[0]).toContain('Main menu');
  });

  test('Should validate minimum input lengths', async () => {
    const userId = '919876540031@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning
    
    // Too short name
    let responses = await flow.handleMessage(createMockMessage(userId, 'A'));
    expect(responses[0]).toContain('May I have your name');
    
    // Valid name
    responses = await flow.handleMessage(createMockMessage(userId, 'Alice'));
    expect(responses[0]).toContain('Which service');
  });

  test('Should validate numeric inputs', async () => {
    const userId = '919876540032@s.whatsapp.net';
    const { addInvite } = require('../invite-store');
    
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning
    await flow.handleMessage(createMockMessage(userId, 'Test User'));
    await flow.handleMessage(createMockMessage(userId, '4')); // Villa
    
    // Invalid sqft (too small)
    let responses = await flow.handleMessage(createMockMessage(userId, '50'));
    expect(responses[0]).toContain('Square Feet');
    
    // Valid sqft
    responses = await flow.handleMessage(createMockMessage(userId, '1500'));
    expect(responses[0]).toContain('condition');
  });
});
