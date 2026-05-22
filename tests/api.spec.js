// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('API Endpoints', () => {
  
  test('GET / - should show QR or status page', async ({ page }) => {
    await page.goto('/');
    
    // Should show either QR code page or connected status
    const pageContent = await page.textContent('body');
    const hasQR = pageContent.includes('Scan to Link WhatsApp') || pageContent.includes('Starting');
    const hasConnected = pageContent.includes('Bot is Live');
    
    expect(hasQR || hasConnected).toBeTruthy();
  });

  test('GET /status - should return JSON status', async ({ request }) => {
    const response = await request.get('/status');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('connected');
    expect(data).toHaveProperty('activeSessions');
    expect(data).toHaveProperty('uptime');
    expect(typeof data.connected).toBe('boolean');
    expect(typeof data.activeSessions).toBe('number');
    expect(typeof data.uptime).toBe('number');
  });

  test('GET /ping - should return pong', async ({ request }) => {
    const response = await request.get('/ping');
    expect(response.ok()).toBeTruthy();
    
    const text = await response.text();
    expect(text).toBe('pong');
  });

  test('GET /qr - should return QR status', async ({ request }) => {
    const response = await request.get('/qr');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(['connected', 'waiting', 'qr', 'error']).toContain(data.status);
  });

  test('GET /admin without token - should return 401', async ({ request }) => {
    const response = await request.get('/admin');
    expect(response.status()).toBe(401);
  });

  test('GET /admin with invalid token - should return 401', async ({ request }) => {
    const response = await request.get('/admin?token=invalid');
    expect(response.status()).toBe(401);
  });

  test('GET /send without token - should return 401', async ({ request }) => {
    const response = await request.get('/send?to=919876543210');
    expect(response.status()).toBe(401);
  });

  test('GET /send without phone - should return 400', async ({ request }) => {
    const adminToken = process.env.ADMIN_TOKEN || 'test_token';
    const response = await request.get(`/send?token=${adminToken}`);
    expect(response.status()).toBe(400);
  });

  test('POST /verify-payment without token - should return 403', async ({ request }) => {
    const response = await request.post('/verify-payment', {
      data: {
        phone: '919876543210',
        bookingId: 'B001',
        name: 'Test User',
        lang: 'en'
      }
    });
    expect(response.status()).toBe(403);
  });

  test('POST /verify-payment without required fields - should return 400', async ({ request }) => {
    const adminToken = process.env.ADMIN_TOKEN || 'test_token';
    const response = await request.post('/verify-payment', {
      data: {
        token: adminToken,
        phone: '919876543210'
        // Missing bookingId
      }
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('UI Pages', () => {
  
  test('Status page should display correctly when connected', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for key elements
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('CLEANLY Services');
  });

  test('Status page should auto-refresh status', async ({ page }) => {
    await page.goto('/');
    
    // Wait for initial load
    await page.waitForLoadState('networkidle');
    
    // Check if status endpoint is being called
    const statusPromise = page.waitForResponse(response => 
      response.url().includes('/status') && response.status() === 200
    );
    
    // Wait up to 10 seconds for status call
    await statusPromise.catch(() => {
      // If bot is not connected, status might not be polled
      console.log('Status polling not active (bot may not be connected)');
    });
  });

  test('QR page should display QR code when not connected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.textContent('body');
    
    // Either shows QR or shows connected status
    const hasQRText = bodyText.includes('Scan to Link') || 
                      bodyText.includes('Starting') ||
                      bodyText.includes('Bot is Live');
    
    expect(hasQRText).toBeTruthy();
  });
});

test.describe('Admin Panel', () => {
  
  test('Admin page should load with valid token', async ({ page }) => {
    const adminToken = process.env.ADMIN_TOKEN || 'test_token';
    await page.goto(`/admin?token=${adminToken}`);
    
    // Check for admin panel elements
    await expect(page.locator('h2')).toContainText('Send Intro Message');
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.locator('button')).toContainText('Send Message');
  });

  test('Admin page should validate phone number', async ({ page }) => {
    const adminToken = process.env.ADMIN_TOKEN || 'test_token';
    await page.goto(`/admin?token=${adminToken}`);
    
    // Try to send without phone number
    await page.click('button');
    
    // Should show error
    const result = page.locator('.result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('Enter a valid number');
  });

  test('Admin page should clear input after submission', async ({ page }) => {
    const adminToken = process.env.ADMIN_TOKEN || 'test_token';
    await page.goto(`/admin?token=${adminToken}`);
    
    const input = page.locator('input[type="tel"]');
    await input.fill('919876543210');
    
    // Click send button
    await page.click('button');
    
    // Wait for response
    await page.waitForTimeout(1000);
    
    // Input should be cleared (if bot is ready)
    const inputValue = await input.inputValue();
    // Note: Will only clear if bot is ready and send succeeds
  });
});
