// Test utility functions

/**
 * Creates a mock WhatsApp message object
 * @param {string} from - Sender JID
 * @param {string} body - Message text
 * @param {string} type - Message type ('chat' or 'image')
 * @returns {Object} Mock message object
 */
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

/**
 * Simulates a complete conversation flow
 * @param {Function} handleMessage - Flow handler function
 * @param {string} userId - User JID
 * @param {Array<string>} messages - Array of messages to send
 * @returns {Array<Array<string>>} Array of response arrays
 */
async function simulateConversation(handleMessage, userId, messages) {
  const responses = [];
  for (const message of messages) {
    const msg = createMockMessage(userId, message);
    const reply = await handleMessage(msg);
    responses.push(reply);
  }
  return responses;
}

/**
 * Waits for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} interval - Check interval in milliseconds
 */
async function waitForCondition(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Condition not met within timeout');
}

/**
 * Generates a unique test user ID
 * @returns {string} Unique user JID
 */
function generateTestUserId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `91${timestamp}${random}@s.whatsapp.net`;
}

/**
 * Extracts numbers from a string
 * @param {string} text - Text containing numbers
 * @returns {Array<number>} Array of numbers found
 */
function extractNumbers(text) {
  const matches = text.match(/\d+/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Checks if text contains any of the given keywords
 * @param {string} text - Text to search
 * @param {Array<string>} keywords - Keywords to find
 * @returns {boolean} True if any keyword found
 */
function containsAny(text, keywords) {
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Checks if text contains all of the given keywords
 * @param {string} text - Text to search
 * @param {Array<string>} keywords - Keywords to find
 * @returns {boolean} True if all keywords found
 */
function containsAll(text, keywords) {
  const lowerText = text.toLowerCase();
  return keywords.every(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Validates Indian phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid
 */
function isValidIndianPhone(phone) {
  const cleaned = phone.replace(/\D/g, '');
  return /^91\d{10}$/.test(cleaned);
}

/**
 * Formats currency for testing
 * @param {number} amount - Amount in rupees
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/**
 * Delays execution
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a function until it succeeds or max attempts reached
 * @param {Function} fn - Function to retry
 * @param {number} maxAttempts - Maximum retry attempts
 * @param {number} delayMs - Delay between attempts
 */
async function retry(fn, maxAttempts = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await delay(delayMs);
      }
    }
  }
  throw lastError;
}

/**
 * Cleans up test data
 * @param {Object} flow - Flow module
 * @param {Object} inviteStore - Invite store module
 */
async function cleanupTestData(flow, inviteStore) {
  // Clear all sessions
  if (flow && flow.sessions) {
    flow.sessions.clear();
  }
  
  // Note: Invite store is in-memory, will be cleared on restart
  // Google Sheets data persists - manual cleanup may be needed
}

/**
 * Validates session state
 * @param {Object} session - Session object
 * @param {string} expectedState - Expected state
 * @param {Object} expectedData - Expected data fields
 */
function validateSession(session, expectedState, expectedData = {}) {
  if (!session) {
    throw new Error('Session is null or undefined');
  }
  
  if (session.state !== expectedState) {
    throw new Error(`Expected state ${expectedState}, got ${session.state}`);
  }
  
  for (const [key, value] of Object.entries(expectedData)) {
    if (session.data[key] !== value) {
      throw new Error(`Expected ${key} to be ${value}, got ${session.data[key]}`);
    }
  }
  
  return true;
}

/**
 * Test data generators
 */
const testData = {
  names: ['John Doe', 'Jane Smith', 'राज कुमार', 'प्रिया पाटील', 'अमित शर्मा'],
  addresses: [
    'Flat 4B, Sunrise Society, Baner, Pune',
    'Villa 12, Green Valley, Hinjewadi',
    'Flat 5C, Shivaji Nagar, Pune',
    'Row House 8, Palm Residency, Wakad'
  ],
  dates: ['Today', 'Tomorrow', '25 May', '1 June', '15th July'],
  
  getRandomName: () => testData.names[Math.floor(Math.random() * testData.names.length)],
  getRandomAddress: () => testData.addresses[Math.floor(Math.random() * testData.addresses.length)],
  getRandomDate: () => testData.dates[Math.floor(Math.random() * testData.dates.length)],
};

module.exports = {
  createMockMessage,
  simulateConversation,
  waitForCondition,
  generateTestUserId,
  extractNumbers,
  containsAny,
  containsAll,
  isValidIndianPhone,
  formatCurrency,
  delay,
  retry,
  cleanupTestData,
  validateSession,
  testData,
};
