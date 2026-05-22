# Test Setup Instructions

## Prerequisites

- Node.js v18+ installed
- npm or yarn package manager
- Git (optional, for version control)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd "c:\Users\manis\Downloads\chat flow"
npm install
```

This installs:
- Application dependencies (Express, Baileys, etc.)
- Playwright test framework

### 2. Install Playwright Browsers

```bash
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers for testing.

### 3. Verify Environment Variables

Ensure your `.env` file has these variables:

```env
PORT=3000
BUSINESS_NAME=CLEANLY Services
CONTACT_NUMBER=+91 9975233763
ADMIN_TOKEN=your_secret_admin_token_here
SPREADSHEET_ID=your_google_sheet_id
GOOGLE_CREDENTIALS={"type":"service_account",...}
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
```

### 4. Run Your First Test

```bash
npm test
```

You should see output like:

```
Running 77 tests using 1 worker

  ✓ API Endpoints > GET / - should show QR or status page
  ✓ API Endpoints > GET /status - should return JSON status
  ✓ API Endpoints > GET /ping - should return pong
  ...

  77 passed (15.2s)
```

## Test Structure

```
chat flow/
├── tests/
│   ├── api.spec.js           # API endpoint tests
│   ├── flow.spec.js          # Conversation flow tests
│   ├── sheets.spec.js        # Module tests
│   ├── integration.spec.js   # End-to-end tests
│   └── README.md             # Detailed test documentation
├── playwright.config.js      # Playwright configuration
├── TESTING.md               # Testing guide
└── TEST_SETUP.md            # This file
```

## What Each Test File Does

### `api.spec.js` - API Endpoint Tests
Tests all Express routes:
- Status page (QR code display)
- Health check endpoint
- Admin panel authentication
- Send invite functionality
- Payment verification

**Run only these tests:**
```bash
npm run test:api
```

### `flow.spec.js` - Flow Logic Tests
Tests the conversation state machine:
- Language selection (English/Hindi/Marathi)
- Main menu navigation
- Cleaning service flows
- Maid service flows
- Global commands (support, restart)
- Session management

**Run only these tests:**
```bash
npm run test:flow
```

### `sheets.spec.js` - Module Tests
Tests core modules:
- Google Sheets integration
- ID generation (Customer, Booking)
- Maid matching algorithm
- Distance calculations
- Invite store management

**Run only these tests:**
```bash
npm run test:sheets
```

### `integration.spec.js` - Integration Tests
End-to-end conversation flows:
- Complete cleaning booking (all service types)
- Complete maid booking
- Multi-language flows
- Restart scenarios
- Error handling

**Run only these tests:**
```bash
npm run test:integration
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run with interactive UI
npm run test:ui

# Run with visible browser
npm run test:headed

# View HTML report
npm run test:report
```

### Advanced Commands

```bash
# Run specific test file
npx playwright test tests/api.spec.js

# Run specific test by name
npx playwright test -g "should start with language selection"

# Run in debug mode
npx playwright test --debug

# Run with specific browser
npx playwright test --project=chromium
```

## Understanding Test Results

### ✅ Passing Test
```
✓ API Endpoints > GET /status - should return JSON status (45ms)
```
- Green checkmark = test passed
- Time in parentheses = execution time

### ❌ Failing Test
```
✗ Flow State Machine > should handle invalid input (234ms)
  Error: expect(received).toContain(expected)
  Expected: "Welcome"
  Received: "Error"
```
- Red X = test failed
- Shows expected vs actual values
- Includes stack trace

### ⊘ Skipped Test
```
⊘ Integration Tests > Complete payment flow (skipped)
```
- Test was skipped (usually due to missing dependencies)

## Viewing Test Reports

After running tests, view the HTML report:

```bash
npm run test:report
```

The report includes:
- ✅ Test execution timeline
- 📊 Pass/fail statistics
- 📸 Screenshots of failures
- 🔍 Detailed error messages
- 🎬 Video recordings (if enabled)
- 🔬 Trace viewer for debugging

## Debugging Failed Tests

### Method 1: UI Mode (Recommended)
```bash
npm run test:ui
```
- Interactive test runner
- See tests execute in real-time
- Click to run individual tests
- Inspect DOM at any point
- Time-travel debugging

### Method 2: Headed Mode
```bash
npm run test:headed
```
- Watch browser execute tests
- See visual feedback
- Good for understanding flow

### Method 3: Debug Mode
```bash
npx playwright test --debug
```
- Pauses at each step
- Opens Playwright Inspector
- Step through line by line
- Inspect variables

### Method 4: Console Logs
Add console logs to tests:
```javascript
test('my test', async () => {
  console.log('Starting test...');
  const result = await someFunction();
  console.log('Result:', result);
});
```

## Common Test Scenarios

### Scenario 1: Test a New Feature

1. Write test in appropriate file:
```javascript
test('should handle new feature', async () => {
  // Your test code
});
```

2. Run the test:
```bash
npx playwright test -g "should handle new feature"
```

3. Fix issues until test passes

4. Run all tests to ensure no regressions:
```bash
npm test
```

### Scenario 2: Debug a Failing Test

1. Run in UI mode:
```bash
npm run test:ui
```

2. Click on failing test

3. Use time-travel debugging to see what went wrong

4. Fix the issue

5. Re-run test

### Scenario 3: Test Multi-Language Support

```bash
# Run integration tests which include all languages
npm run test:integration
```

Tests automatically verify:
- English flow
- Hindi (हिंदी) flow
- Marathi (मराठी) flow

## Test Data

Tests use mock data:
- **Mock Users**: `919876543210@s.whatsapp.net`
- **Mock Messages**: Simulated WhatsApp messages
- **Mock Contacts**: Test user profiles
- **Mock Media**: Fake image data for receipt uploads

No real WhatsApp connection needed!

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run tests
        run: npm test
      
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Performance Tips

### Speed Up Tests

1. **Run in parallel** (if tests are independent):
```javascript
// playwright.config.js
workers: 4  // Run 4 tests in parallel
```

2. **Skip slow tests during development**:
```javascript
test.skip('slow test', async () => {
  // This test will be skipped
});
```

3. **Use test.only for focused testing**:
```javascript
test.only('focus on this test', async () => {
  // Only this test will run
});
```

## Troubleshooting

### Issue: Tests hang or timeout

**Solution**: Increase timeout in `playwright.config.js`:
```javascript
timeout: 60000  // 60 seconds
```

### Issue: Port 3000 already in use

**Solution**: Kill the process:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Issue: Google Sheets tests fail

**Solution**: 
1. Verify `credentials.json` exists
2. Check service account permissions
3. Verify `SPREADSHEET_ID` in `.env`

### Issue: Supabase tests fail

**Solution**:
1. Check `SUPABASE_URL` and `SUPABASE_KEY`
2. Verify database schema
3. Ensure `maids` table exists

## Next Steps

1. ✅ Run `npm test` to verify setup
2. ✅ Explore `npm run test:ui` for interactive testing
3. ✅ Read `tests/README.md` for detailed documentation
4. ✅ Review `TESTING.md` for testing guide
5. ✅ Add tests for your custom features

## Getting Help

- **Test Documentation**: `tests/README.md`
- **Testing Guide**: `TESTING.md`
- **Playwright Docs**: https://playwright.dev
- **Issues**: Check console output and error messages

## Summary

You now have a comprehensive test suite that covers:
- ✅ 77 automated tests
- ✅ API endpoints
- ✅ Conversation flows
- ✅ Multi-language support
- ✅ Integration scenarios
- ✅ Error handling

Run `npm test` anytime to verify your application works correctly!
