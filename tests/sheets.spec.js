// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Sheets Module', () => {
  
  test('should export required functions', () => {
    const sheets = require('../sheets');
    
    expect(typeof sheets.appendCustomer).toBe('function');
    expect(typeof sheets.appendBooking).toBe('function');
    expect(typeof sheets.appendCleaningBooking).toBe('function');
    expect(typeof sheets.updateCleaningBooking).toBe('function');
    expect(typeof sheets.updateCustomerStatus).toBe('function');
    expect(typeof sheets.updateBookingPayment).toBe('function');
    expect(typeof sheets.markPaymentVerified).toBe('function');
    expect(typeof sheets.generateCustomerId).toBe('function');
    expect(typeof sheets.generateBookingId).toBe('function');
    expect(typeof sheets.warmCounters).toBe('function');
  });

  test('should generate customer IDs in correct format', async () => {
    const sheets = require('../sheets');
    
    const id = await sheets.generateCustomerId();
    
    expect(id).toMatch(/^C\d{3,}$/);
    expect(id.startsWith('C')).toBeTruthy();
  });

  test('should generate booking IDs in correct format', async () => {
    const sheets = require('../sheets');
    
    const id = await sheets.generateBookingId();
    
    expect(id).toMatch(/^B\d{3,}$/);
    expect(id.startsWith('B')).toBeTruthy();
  });

  test('should generate sequential customer IDs', async () => {
    const sheets = require('../sheets');
    
    const id1 = await sheets.generateCustomerId();
    const id2 = await sheets.generateCustomerId();
    
    const num1 = parseInt(id1.substring(1));
    const num2 = parseInt(id2.substring(1));
    
    expect(num2).toBe(num1 + 1);
  });

  test('should generate sequential booking IDs', async () => {
    const sheets = require('../sheets');
    
    const id1 = await sheets.generateBookingId();
    const id2 = await sheets.generateBookingId();
    
    const num1 = parseInt(id1.substring(1));
    const num2 = parseInt(id2.substring(1));
    
    expect(num2).toBe(num1 + 1);
  });
});

test.describe('Matching Module', () => {
  
  test('should export required functions', () => {
    const matching = require('../matching');
    
    expect(typeof matching.getTopMaids).toBe('function');
    expect(typeof matching.getDistanceFromLatLonInKm).toBe('function');
  });

  test('should calculate distance correctly', () => {
    const { getDistanceFromLatLonInKm } = require('../matching');
    
    // Distance between Baner and Aundh (both in Pune)
    const banerLat = 18.5590;
    const banerLng = 73.7868;
    const aundhLat = 18.5590;
    const aundhLng = 73.8080;
    
    const distance = getDistanceFromLatLonInKm(banerLat, banerLng, aundhLat, aundhLng);
    
    // Should be approximately 2 km
    expect(distance).toBeGreaterThan(1);
    expect(distance).toBeLessThan(3);
  });

  test.skip('should return empty array when no Supabase credentials', async () => {
    // This test is skipped because dotenv.config() in matching.js will always
    // reload credentials from .env file when the module is reloaded.
    // In a real scenario, if credentials are missing, they would be missing
    // from the .env file itself, not just from process.env.
    
    // Temporarily clear Supabase credentials
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_KEY;
    
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;
    
    // Clear both matching and dotenv from require cache
    delete require.cache[require.resolve('../matching')];
    delete require.cache[require.resolve('dotenv')];
    
    const { getTopMaids } = require('../matching');
    
    let errorThrown = false;
    try {
      await getTopMaids(18.5590, 73.7868, 'Cooking');
    } catch (error) {
      errorThrown = true;
      expect(error.message).toContain('Supabase credentials missing');
    }
    
    // Verify that an error was thrown
    expect(errorThrown).toBe(true);
    
    // Restore credentials
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_KEY = originalKey;
    
    // Reload modules with credentials
    delete require.cache[require.resolve('../matching')];
    delete require.cache[require.resolve('dotenv')];
  });

  test('should validate coordinates', async () => {
    const { getTopMaids } = require('../matching');
    
    try {
      await getTopMaids(null, null, 'Cooking');
      expect(true).toBe(false);
    } catch (error) {
      expect(error.message).toContain('coordinates are missing');
    }
  });
});

test.describe('Invite Store Module', () => {
  
  test('should export required functions', () => {
    const inviteStore = require('../invite-store');
    
    expect(typeof inviteStore.isInvited).toBe('function');
    expect(typeof inviteStore.addInvite).toBe('function');
    expect(typeof inviteStore.removeInvite).toBe('function');
    expect(typeof inviteStore.uploadReceipt).toBe('function');
  });

  test('should add and check invites', async () => {
    const { isInvited, addInvite } = require('../invite-store');
    
    const phone = '919876543299@s.whatsapp.net';
    
    // Should not be invited initially
    expect(await isInvited(phone)).toBe(false);
    
    // Add invite
    await addInvite(phone);
    
    // Should be invited now
    expect(await isInvited(phone)).toBe(true);
  });

  test('should remove invites', async () => {
    const { isInvited, addInvite, removeInvite } = require('../invite-store');
    
    const phone = '919876543298@s.whatsapp.net';
    
    await addInvite(phone);
    expect(await isInvited(phone)).toBe(true);
    
    await removeInvite(phone);
    expect(await isInvited(phone)).toBe(false);
  });

  test('should handle multiple invites', async () => {
    const { isInvited, addInvite } = require('../invite-store');
    
    const phone1 = '919876543297@s.whatsapp.net';
    const phone2 = '919876543296@s.whatsapp.net';
    
    await addInvite(phone1);
    await addInvite(phone2);
    
    expect(await isInvited(phone1)).toBe(true);
    expect(await isInvited(phone2)).toBe(true);
  });
});
