// @ts-check
const { test, expect } = require('@playwright/test');
const flow = require('../flow');
const { createMockMessage, generateTestUserId, delay } = require('./helpers/test-utils');

test.describe('Performance Tests', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('should handle multiple concurrent users', async () => {
    const { addInvite } = require('../invite-store');
    const userCount = 10;
    const users = [];
    
    // Create multiple users
    for (let i = 0; i < userCount; i++) {
      const userId = generateTestUserId();
      users.push(userId);
      await addInvite(userId);
    }
    
    const startTime = Date.now();
    
    // Simulate concurrent messages
    const promises = users.map(userId => 
      flow.handleMessage(createMockMessage(userId, 'hi'))
    );
    
    const results = await Promise.all(promises);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // All users should get responses
    expect(results.length).toBe(userCount);
    results.forEach(response => {
      expect(response.length).toBeGreaterThan(0);
      expect(response[0]).toContain('Welcome to CLEANLY Services');
    });
    
    // Should complete in reasonable time (< 2 seconds for 10 users)
    expect(duration).toBeLessThan(2000);
    
    // All sessions should be created
    expect(flow.activeSessionCount()).toBe(userCount);
    
    console.log(`✓ Handled ${userCount} concurrent users in ${duration}ms`);
  });

  test('should handle rapid sequential messages from same user', async () => {
    const userId = generateTestUserId();
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    
    const messages = ['hi', '1', '1', 'Test User', '1', '1', '1'];
    const startTime = Date.now();
    
    // Send messages rapidly
    for (const msg of messages) {
      await flow.handleMessage(createMockMessage(userId, msg));
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete in reasonable time
    expect(duration).toBeLessThan(1000);
    
    // Session should be in expected state
    const session = flow.sessions.get(userId);
    expect(session).toBeDefined();
    
    console.log(`✓ Processed ${messages.length} sequential messages in ${duration}ms`);
  });

  test('should maintain performance with many active sessions', async () => {
    const { addInvite } = require('../invite-store');
    const sessionCount = 50;
    
    // Create many sessions
    for (let i = 0; i < sessionCount; i++) {
      const userId = generateTestUserId();
      await addInvite(userId);
      await flow.handleMessage(createMockMessage(userId, 'hi'));
      await flow.handleMessage(createMockMessage(userId, '1')); // Select language
    }
    
    expect(flow.activeSessionCount()).toBe(sessionCount);
    
    // Test response time with many active sessions
    const testUserId = generateTestUserId();
    await addInvite(testUserId);
    
    const startTime = Date.now();
    const response = await flow.handleMessage(createMockMessage(testUserId, 'hi'));
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(response.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(500); // Should respond quickly even with many sessions
    
    console.log(`✓ Response time with ${sessionCount} active sessions: ${duration}ms`);
  });

  test('should handle session cleanup efficiently', async () => {
    const { addInvite } = require('../invite-store');
    const sessionCount = 100;
    
    // Create many sessions
    for (let i = 0; i < sessionCount; i++) {
      const userId = generateTestUserId();
      await addInvite(userId);
      await flow.handleMessage(createMockMessage(userId, 'hi'));
    }
    
    expect(flow.activeSessionCount()).toBe(sessionCount);
    
    // Clear all sessions
    const startTime = Date.now();
    flow.sessions.clear();
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(flow.activeSessionCount()).toBe(0);
    expect(duration).toBeLessThan(100); // Should clear quickly
    
    console.log(`✓ Cleared ${sessionCount} sessions in ${duration}ms`);
  });

  test('should handle long message processing', async () => {
    const userId = generateTestUserId();
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    
    // Start flow
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1')); // English
    await flow.handleMessage(createMockMessage(userId, '1')); // Cleaning
    await flow.handleMessage(createMockMessage(userId, 'Test User'));
    await flow.handleMessage(createMockMessage(userId, '3')); // Mini Service
    
    // Send very long service list
    const longMessage = '6-5, 3-2, 7-10, 10-8, 11-1, 12-1, 13-1, 14-1, 15-2, 16-1';
    
    const startTime = Date.now();
    const response = await flow.handleMessage(createMockMessage(userId, longMessage));
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(response.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(500); // Should process quickly
    
    console.log(`✓ Processed long message in ${duration}ms`);
  });

  test('should measure average response time', async () => {
    const { addInvite } = require('../invite-store');
    const iterations = 20;
    const durations = [];
    
    for (let i = 0; i < iterations; i++) {
      const userId = generateTestUserId();
      await addInvite(userId);
      
      const startTime = Date.now();
      await flow.handleMessage(createMockMessage(userId, 'hi'));
      const endTime = Date.now();
      
      durations.push(endTime - startTime);
      
      // Clean up
      flow.clearSession(userId);
    }
    
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    
    console.log(`✓ Average response time: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min: ${minDuration}ms, Max: ${maxDuration}ms`);
    
    // Average should be reasonable
    expect(avgDuration).toBeLessThan(200);
  });

  test('should handle memory efficiently with session churn', async () => {
    const { addInvite } = require('../invite-store');
    const iterations = 100;
    
    const startMemory = process.memoryUsage().heapUsed;
    
    for (let i = 0; i < iterations; i++) {
      const userId = generateTestUserId();
      await addInvite(userId);
      
      // Create session
      await flow.handleMessage(createMockMessage(userId, 'hi'));
      await flow.handleMessage(createMockMessage(userId, '1'));
      
      // Clear session
      flow.clearSession(userId);
    }
    
    const endMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (endMemory - startMemory) / 1024 / 1024; // MB
    
    console.log(`✓ Memory increase after ${iterations} session cycles: ${memoryIncrease.toFixed(2)} MB`);
    
    // Memory increase should be reasonable (< 10 MB for 100 cycles)
    expect(memoryIncrease).toBeLessThan(10);
  });
});

test.describe('Load Tests', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('should handle burst traffic', async () => {
    const { addInvite } = require('../invite-store');
    const burstSize = 20;
    const users = [];
    
    // Prepare users
    for (let i = 0; i < burstSize; i++) {
      const userId = generateTestUserId();
      users.push(userId);
      await addInvite(userId);
    }
    
    // Send burst of messages
    const startTime = Date.now();
    const promises = [];
    
    for (const userId of users) {
      promises.push(flow.handleMessage(createMockMessage(userId, 'hi')));
      promises.push(flow.handleMessage(createMockMessage(userId, '1')));
      promises.push(flow.handleMessage(createMockMessage(userId, '1')));
    }
    
    await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✓ Handled burst of ${promises.length} messages in ${duration}ms`);
    
    // Should handle burst efficiently
    expect(duration).toBeLessThan(5000);
  });

  test('should maintain stability under sustained load', async () => {
    const { addInvite } = require('../invite-store');
    const duration = 5000; // 5 seconds
    const startTime = Date.now();
    let messageCount = 0;
    
    while (Date.now() - startTime < duration) {
      const userId = generateTestUserId();
      await addInvite(userId);
      await flow.handleMessage(createMockMessage(userId, 'hi'));
      messageCount++;
      
      // Small delay to simulate realistic traffic
      await delay(50);
    }
    
    const messagesPerSecond = messageCount / (duration / 1000);
    
    console.log(`✓ Sustained load: ${messageCount} messages in ${duration}ms`);
    console.log(`  Throughput: ${messagesPerSecond.toFixed(2)} messages/second`);
    
    // Should handle at least 10 messages per second
    expect(messagesPerSecond).toBeGreaterThan(10);
  });
});

test.describe('Stress Tests', () => {
  
  test.beforeEach(() => {
    flow.sessions.clear();
  });

  test('should handle maximum concurrent sessions', async () => {
    const { addInvite } = require('../invite-store');
    const maxSessions = 100;
    
    const startTime = Date.now();
    
    // Create maximum sessions
    for (let i = 0; i < maxSessions; i++) {
      const userId = generateTestUserId();
      await addInvite(userId);
      await flow.handleMessage(createMockMessage(userId, 'hi'));
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(flow.activeSessionCount()).toBe(maxSessions);
    
    console.log(`✓ Created ${maxSessions} sessions in ${duration}ms`);
    console.log(`  Average: ${(duration / maxSessions).toFixed(2)}ms per session`);
  });

  test('should recover from error conditions', async () => {
    const userId = generateTestUserId();
    const { addInvite } = require('../invite-store');
    await addInvite(userId);
    
    // Start normal flow
    await flow.handleMessage(createMockMessage(userId, 'hi'));
    await flow.handleMessage(createMockMessage(userId, '1'));
    
    // Send invalid inputs
    await flow.handleMessage(createMockMessage(userId, 'invalid'));
    await flow.handleMessage(createMockMessage(userId, '999'));
    await flow.handleMessage(createMockMessage(userId, ''));
    
    // Should still respond correctly
    const response = await flow.handleMessage(createMockMessage(userId, '1'));
    
    expect(response.length).toBeGreaterThan(0);
    expect(flow.sessions.has(userId)).toBeTruthy();
    
    console.log('✓ Recovered from error conditions');
  });
});
