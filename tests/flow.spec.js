// @ts-check
const { test, expect } = require('@playwright/test');
const flow = require('../flow');
const config = require('../config');

// Mock message object factory
function createMockMessage(from, body, type = 'chat') {
  return {
    from,
    body,
    type,
    getContact: async () => ({
      pushname: 'Test User',
      name: 'Test User',
      id: { _serialized: from }
    }),
    downloadMedia: async () => ({
      data: Buffer.from('fake-image-data').toString('base64'),
      mimetype: 'image/jpeg'
    }),
    reply: async (text) => {
      console.log(`[Mock Reply to ${from}]: ${text.substring(0, 50)}...`);
    }
  };
}

test.describe('Flow State Machine - Language Selection', () => {
  
  test.beforeEach(() => {
    // Clear all sessions before each test
    flow.sessions.clear();
  });

  test('should start with language selection for new user', async () => {
    const userId = '919876543210@s.whatsapp.net';
    const msg = createMockMessage(userId, 'hi');
    
    // Simulate admin invite
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    
    const responses = await flow.handleMessage(msg);
    
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]).toContain('Welcome to CLEANLY Services');
    expect(responses[0]).toContain('1️⃣ English');
    expect(responses[0]).toContain('2️⃣ मराठी');
    expect(responses[0]).toContain('3️⃣ हिंदी');
  });

  test('should accept language selection - English', async () => {
    const userId = '919876543211@s.whatsapp.net';
    
    // Start session
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    // Select English
    const responses = await flow.handleMessage(createMockMessage(userId, '1'));
    
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]).toContain('Main menu');
    expect(responses[0]).toContain('1️⃣ HOME deep cleaning service');
    expect(responses[0]).toContain('2️⃣ MONTHLY maid service');
  });

  test('should accept language selection - Marathi', async () => {
    const userId = '919876543212@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    // Select Marathi
    const responses = await flow.handleMessage(createMockMessage(userId, '2'));
    
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]).toContain('मेन मेनू');
  });

  test('should accept language selection - Hindi', async () => {
    const userId = '919876543213@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    // Select Hindi
    const responses = await flow.handleMessage(createMockMessage(userId, '3'));
    
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]).toContain('मेन मेनू');
  });

  test('should reject invalid language selection', async () => {
    const userId = '919876543214@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    // Invalid selection
    const responses = await flow.handleMessage(createMockMessage(userId, '5'));
    
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]).toContain('Welcome to CLEANLY Services');
  });
});

test.describe('Flow State Machine - Cleaning Service', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  async function setupCleaningFlow(userId) {
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning service
  }

  test('should navigate to cleaning service', async () => {
    const userId = '919876543220@s.whatsapp.net';
    await setupCleaningFlow(userId);
    
    // Should ask for name
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('CLEANING_NAME');
  });

  test('should collect name and show service types', async () => {
    const userId = '919876543221@s.whatsapp.net';
    await setupCleaningFlow(userId);
    
    const responses = await flow.handleMessage(createMockMessage(userId, 'John Doe'));
    
    expect(responses[0]).toContain('Which service are you looking for?');
    expect(responses[0]).toContain('1️⃣ Flat Deep Cleaning');
    expect(responses[0]).toContain('2️⃣ Bathroom Cleaning');
    expect(responses[0]).toContain('3️⃣ Mini Service Package');
    expect(responses[0]).toContain('4️⃣ Villa / Bungalow / Row House');
  });

  test('should handle Flat Deep Cleaning flow', async () => {
    const userId = '919876543222@s.whatsapp.net';
    await setupCleaningFlow(userId);
    await flow.handleMessage(createMockMessage(userId, 'John Doe'));
    
    // Select Flat Deep Cleaning
    const responses = await flow.handleMessage(createMockMessage(userId, '1'));
    
    expect(responses[0]).toContain('Is the flat:');
    expect(responses[0]).toContain('1️⃣ Furnished');
    expect(responses[0]).toContain('2️⃣ Empty / Vacant');
  });

  test('should handle Villa cleaning flow', async () => {
    const userId = '919876543223@s.whatsapp.net';
    await setupCleaningFlow(userId);
    await flow.handleMessage(createMockMessage(userId, 'John Doe'));
    
    // Select Villa
    await flow.handleMessage(createMockMessage(userId, '4'));
    
    // Should ask for square footage
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('CLEANING_VILLA_SQFT');
  });

  test('should calculate villa pricing correctly', async () => {
    const userId = '919876543224@s.whatsapp.net';
    await setupCleaningFlow(userId);
    await flow.handleMessage(createMockMessage(userId, 'John Doe'));
    await flow.handleMessage(createMockMessage(userId, '4')); // Villa
    
    // Enter 1500 sqft
    await flow.handleMessage(createMockMessage(userId, '1500'));
    
    // Select Regular Occupied (₹6/sqft)
    const responses = await flow.handleMessage(createMockMessage(userId, '1'));
    
    expect(responses[0]).toContain('₹9000'); // 1500 * 6
  });

  test('should handle Bathroom Cleaning subscription', async () => {
    const userId = '919876543225@s.whatsapp.net';
    await setupCleaningFlow(userId);
    await flow.handleMessage(createMockMessage(userId, 'John Doe'));
    
    // Select Bathroom Cleaning
    await flow.handleMessage(createMockMessage(userId, '2'));
    
    // Select Subscription
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Select 2 bathrooms
    const responses = await flow.handleMessage(createMockMessage(userId, '1'));
    
    expect(responses[0]).toContain('3-Month Bathroom Subscription');
    expect(responses[0]).toContain('₹2250/month');
  });

  test('should handle Mini Service Package', async () => {
    const userId = '919876543226@s.whatsapp.net';
    await setupCleaningFlow(userId);
    await flow.handleMessage(createMockMessage(userId, 'John Doe'));
    
    // Select Mini Service
    await flow.handleMessage(createMockMessage(userId, '3'));
    
    // Add services: 6-2 (2 bathrooms), 3-1 (1 fridge), 7-3 (3 fans)
    const responses = await flow.handleMessage(createMockMessage(userId, '6-2, 3-1, 7-3'));
    
    // Total: (550*2) + (300*1) + (50*3) = 1100 + 300 + 150 = 1550
    expect(responses[0]).toContain('1550');
    expect(responses[0]).toContain('₹450'); // Remaining to reach ₹2000
  });

  test('should complete mini service when minimum reached', async () => {
    const userId = '919876543227@s.whatsapp.net';
    await setupCleaningFlow(userId);
    await flow.handleMessage(createMockMessage(userId, 'John Doe'));
    await flow.handleMessage(createMockMessage(userId, '3')); // Mini Service
    
    // Add services totaling ₹2000+
    await flow.handleMessage(createMockMessage(userId, '1-1')); // Full Kitchen ₹2400
    
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('COLLECT_FLAT');
  });
});

test.describe('Flow State Machine - Maid Service', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  async function setupMaidFlow(userId) {
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '2')); // Maid service
  }

  test('should navigate to maid service', async () => {
    const userId = '919876543230@s.whatsapp.net';
    await setupMaidFlow(userId);
    
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('WORK_TYPE');
  });

  test('should collect work type', async () => {
    const userId = '919876543231@s.whatsapp.net';
    await setupMaidFlow(userId);
    
    // Select Cooking
    const responses = await flow.handleMessage(createMockMessage(userId, '1'));
    
    expect(responses[0]).toContain('What timing works best');
    expect(responses[0]).toContain('Part Time');
    expect(responses[0]).toContain('Full Time');
  });

  test('should collect timing', async () => {
    const userId = '919876543232@s.whatsapp.net';
    await setupMaidFlow(userId);
    await flow.handleMessage(createMockMessage(userId, '1')); // Cooking
    
    // Select Part Time
    const responses = await flow.handleMessage(createMockMessage(userId, '1'));
    
    expect(responses[0]).toContain('monthly budget');
  });

  test('should show dynamic budget based on timing', async () => {
    const userId = '919876543233@s.whatsapp.net';
    await setupMaidFlow(userId);
    await flow.handleMessage(createMockMessage(userId, '1')); // Cooking
    
    // Select Full Time 8 hrs
    const responses = await flow.handleMessage(createMockMessage(userId, '2'));
    
    // Should show higher budget ranges
    expect(responses[0]).toContain('₹15,000');
  });

  test('should collect city selection', async () => {
    const userId = '919876543234@s.whatsapp.net';
    await setupMaidFlow(userId);
    await flow.handleMessage(createMockMessage(userId, '1')); // Cooking
    await flow.handleMessage(createMockMessage(userId, '1')); // Part Time
    await flow.handleMessage(createMockMessage(userId, '1')); // Budget
    
    const responses = await flow.handleMessage(createMockMessage(userId, '1')); // Pune
    
    expect(responses[0]).toContain('select your area');
    expect(responses[0]).toContain('Aundh');
    expect(responses[0]).toContain('Baner');
  });

  test('should handle custom area input', async () => {
    const userId = '919876543235@s.whatsapp.net';
    await setupMaidFlow(userId);
    await flow.handleMessage(createMockMessage(userId, '1')); // Cooking
    await flow.handleMessage(createMockMessage(userId, '1')); // Part Time
    await flow.handleMessage(createMockMessage(userId, '1')); // Budget
    await flow.handleMessage(createMockMessage(userId, '1')); // Pune
    
    // Select custom area (option 20 for Pune)
    await flow.handleMessage(createMockMessage(userId, '20'));
    
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('MAID_CUSTOM_AREA');
  });
});

test.describe('Flow State Machine - Global Commands', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('should handle "0" for support at any stage', async () => {
    const userId = '919876543240@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    
    // Press 0 for support
    const responses = await flow.handleMessage(createMockMessage(userId, '0'));
    
    expect(responses[0]).toContain('support team');
    expect(responses[0]).toContain('+91 9975233763');
    
    // Session should be cleared
    const session = flow.sessions.get(userId);
    expect(session).toBeUndefined();
  });

  test('should handle restart with "clean" keyword', async () => {
    const userId = '919876543241@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    
    // Type "clean" to restart
    const responses = await flow.handleMessage(createMockMessage(userId, 'clean'));
    
    // Should go directly to cleaning flow (skipping language if remembered)
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('CLEANING_NAME');
  });

  test('should handle restart with "maid" keyword', async () => {
    const userId = '919876543242@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    
    // Type "maid" to restart
    const responses = await flow.handleMessage(createMockMessage(userId, 'maid'));
    
    // Should go directly to maid flow
    const session = flow.sessions.get(userId);
    expect(session.state).toBe('WORK_TYPE');
  });
});

test.describe('Flow State Machine - Session Management', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('should track active session count', async () => {
    const userId1 = '919876543250@s.whatsapp.net';
    const userId2 = '919876543251@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId1);
    await addInvite(userId2);
    
    await flow.handleMessage(createMockMessage(userId1, 'hi'));
    expect(flow.activeSessionCount()).toBe(1);
    
    await flow.handleMessage(createMockMessage(userId2, 'hi'));
    expect(flow.activeSessionCount()).toBe(2);
  });

  test('should clear session manually', async () => {
    const userId = '919876543252@s.whatsapp.net';
    
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    
    expect(flow.sessions.has(userId)).toBeTruthy();
    
    flow.clearSession(userId);
    
    expect(flow.sessions.has(userId)).toBeFalsy();
  });

  test('should not start session without invite or ad link', async () => {
    const userId = '919876543253@s.whatsapp.net';
    
    // Try to start without invite
    const responses = await flow.handleMessage(createMockMessage(userId, 'hello'));
    
    expect(responses.length).toBe(0);
    expect(flow.sessions.has(userId)).toBeFalsy();
  });

  test('should start session with Facebook ad link', async () => {
    const userId = '919876543254@s.whatsapp.net';
    
    const responses = await flow.handleMessage(
      createMockMessage(userId, 'Check this out: https://facebook.com/ad/12345')
    );
    
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]).toContain('Welcome to CLEANLY Services');
  });

  test('should start session with Instagram ad link', async () => {
    const userId = '919876543255@s.whatsapp.net';
    
    const responses = await flow.handleMessage(
      createMockMessage(userId, 'https://instagram.com/p/abc123')
    );
    
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]).toContain('Welcome to CLEANLY Services');
  });
});

test.describe('Config Validation', () => {
  
  test('should have all required config values', () => {
    expect(config.businessName).toBeDefined();
    expect(config.contactNumber).toBeDefined();
    expect(config.sessionTimeoutMs).toBeDefined();
  });

  test('should have all language messages', () => {
    expect(config.languageMessage).toBeDefined();
    expect(config.mainMenuMessage.en).toBeDefined();
    expect(config.mainMenuMessage.hi).toBeDefined();
    expect(config.mainMenuMessage.mr).toBeDefined();
  });

  test('should have all work types', () => {
    expect(Object.keys(config.workTypes).length).toBe(5);
    expect(config.workTypes['1']).toBe('Cooking');
  });

  test('should have all timings', () => {
    expect(Object.keys(config.timings).length).toBe(4);
  });

  test('should have area coordinates', () => {
    expect(config.puneAreas.length).toBeGreaterThan(0);
    expect(config.pcmcAreas.length).toBeGreaterThan(0);
    expect(config.puneAreaCoordinates['Baner']).toBeDefined();
    expect(config.puneAreaCoordinates['Baner'].lat).toBeDefined();
    expect(config.puneAreaCoordinates['Baner'].lng).toBeDefined();
  });
});
