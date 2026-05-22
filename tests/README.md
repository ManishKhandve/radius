# Test Suite Documentation

## Overview

This test suite uses **Playwright** to test the WhatsApp chatbot application. It includes:

- **API Endpoint Tests** - Testing Express routes
- **Flow Logic Tests** - Testing conversation state machine
- **Module Tests** - Testing Sheets, Matching, and Invite Store modules
- **Integration Tests** - End-to-end conversation flows

## Installation

```bash
npm install
npx playwright install
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
npm run test:api          # API endpoint tests only
npm run test:flow         # Flow state machine tests only
npm run test:sheets       # Module tests only
npm run test:integration  # Integration tests only
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests in Headed Mode (see browser)
```bash
npm run test:headed
```

### View Test Report
```bash
npm run test:report
```

## Test Structure

### 1. API Tests (`api.spec.js`)
Tests all Express endpoints:
- `GET /` - Status/QR page
- `GET /status` - JSON status
- `GET /ping` - Health check
- `GET /qr` - QR status
- `GET /admin` - Admin panel (with auth)
- `GET /send` - Send invite (with auth)
- `POST /verify-payment` - Payment verification (with auth)

### 2. Flow Tests (`flow.spec.js`)
Tests conversation state machine:
- Language selection (English, Hindi, Marathi)
- Main menu navigation
- Cleaning service flows (Flat, Villa, Bathroom, Mini)
- Maid service flows (Work type, Timing, Budget, Area)
- Global commands (0 for support, restart keywords)
- Session management

### 3. Module Tests (`sheets.spec.js`)
Tests core modules:
- **Sheets Module**: ID generation, CRUD operations
- **Matching Module**: Distance calculation, maid matching
- **Invite Store Module**: Invite management

### 4. Integration Tests (`integration.spec.js`)
End-to-end conversation flows:
- Complete cleaning booking flows (all service types)
- Complete maid booking flows
- Multi-language flows
- Restart and navigation scenarios
- Error handling and validation

## Test Coverage

### Cleaning Service Flows
✅ Flat Deep Cleaning (Furnished/Empty/Post-Interior)
✅ Villa/Bungalow cleaning with sqft calculation
✅ Bathroom Cleaning (Subscription & One-Time)
✅ Mini Service Package with cart accumulation
✅ Add-ons (Kitchen, Sofa)
✅ Date selection (Today/Tomorrow/Custom)

### Maid Service Flows
✅ Work type selection (5 types)
✅ Timing selection (4 options)
✅ Dynamic budget based on timing
✅ City & Area selection (Pune/PCMC)
✅ Custom area handling
✅ Maid matching (when Supabase configured)
✅ Plan selection (Part-Time/Full-Time)

### Multi-Language Support
✅ English flow
✅ Hindi (हिंदी) flow
✅ Marathi (मराठी) flow

### Navigation & Error Handling
✅ Restart with "clean" keyword
✅ Restart with "maid" keyword
✅ Support request (0) at any stage
✅ Invalid input handling
✅ Input validation (length, format, range)
✅ Session timeout handling

## Environment Variables

Tests use the same environment variables as the application:

```env
PORT=3000
ADMIN_TOKEN=your_admin_token
SPREADSHEET_ID=your_sheet_id
GOOGLE_CREDENTIALS={"type":"service_account",...}
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
```

## Mock Data

Tests use mock message objects that simulate WhatsApp messages:
- Mock contact information
- Mock media downloads
- Mock reply functions

No actual WhatsApp connection is required for most tests.

## CI/CD Integration

The test suite is configured for CI/CD:
- Automatic retries on failure (2 retries in CI)
- HTML report generation
- Screenshot on failure
- Trace on first retry

## Debugging Tests

### View Test in UI Mode
```bash
npm run test:ui
```

### Run Single Test
```bash
npx playwright test -g "should start with language selection"
```

### Debug Mode
```bash
npx playwright test --debug
```

### View Traces
After a test failure, traces are automatically captured. View them:
```bash
npx playwright show-trace trace.zip
```

## Known Limitations

1. **WhatsApp Connection**: Tests don't require actual WhatsApp connection
2. **Supabase**: Maid matching tests require Supabase credentials
3. **Google Sheets**: Some tests may fail if Sheets API is not configured
4. **Admin Token**: Admin endpoint tests require valid ADMIN_TOKEN

## Test Maintenance

When adding new features:

1. Add unit tests in `flow.spec.js` for new states
2. Add integration tests in `integration.spec.js` for complete flows
3. Update API tests if new endpoints are added
4. Update this README with new test coverage

## Troubleshooting

### Port Already in Use
If tests fail with "port already in use":
```bash
# Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Tests Timing Out
Increase timeout in `playwright.config.js`:
```javascript
timeout: 60000  // 60 seconds
```

### Flaky Tests
Tests are designed to be deterministic, but if you encounter flaky tests:
- Check network connectivity (for Supabase/Sheets)
- Verify environment variables are set
- Run tests sequentially: `workers: 1`

## Contributing

When contributing tests:
1. Follow existing test structure
2. Use descriptive test names
3. Add comments for complex test logic
4. Ensure tests are independent (no shared state)
5. Clean up sessions in `beforeEach` hooks

## Support

For issues with tests, check:
1. All dependencies installed: `npm install`
2. Playwright browsers installed: `npx playwright install`
3. Environment variables configured
4. Application starts successfully: `npm start`
