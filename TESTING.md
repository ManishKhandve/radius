# Testing Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Install Playwright Browsers
```bash
npx playwright install
```

### 3. Run Tests
```bash
npm test
```

## Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:ui` | Run tests with interactive UI |
| `npm run test:headed` | Run tests with visible browser |
| `npm run test:api` | Run API endpoint tests only |
| `npm run test:flow` | Run flow logic tests only |
| `npm run test:sheets` | Run module tests only |
| `npm run test:integration` | Run integration tests only |
| `npm run test:report` | View HTML test report |

## What Gets Tested

### ✅ API Endpoints
- Status page (QR code / connected status)
- Health check (`/ping`)
- Status JSON (`/status`)
- Admin panel (with authentication)
- Send invite endpoint
- Payment verification endpoint

### ✅ Conversation Flows
- **Language Selection**: English, Hindi, Marathi
- **Cleaning Services**:
  - Flat Deep Cleaning (Furnished/Empty/Post-Interior)
  - Villa/Bungalow cleaning
  - Bathroom Cleaning (Subscription & One-Time)
  - Mini Service Package
- **Maid Services**:
  - Work type selection
  - Timing selection
  - Budget selection (dynamic based on timing)
  - City & Area selection
  - Maid matching
  - Plan selection

### ✅ Navigation & Error Handling
- Restart keywords ("clean", "maid")
- Support request (press "0")
- Invalid input handling
- Input validation
- Session management

### ✅ Multi-Language Support
- All flows tested in English, Hindi, and Marathi

## Test Results

After running tests, you'll see:

```
Running 50 tests using 1 worker

  ✓ API Endpoints > GET / - should show QR or status page (234ms)
  ✓ API Endpoints > GET /status - should return JSON status (45ms)
  ✓ Flow State Machine > should start with language selection (12ms)
  ...

  50 passed (2.3s)
```

## View Detailed Report

```bash
npm run test:report
```

This opens an HTML report in your browser with:
- Test execution timeline
- Screenshots of failures
- Detailed error messages
- Trace viewer for debugging

## Debugging Failed Tests

### 1. Run in UI Mode
```bash
npm run test:ui
```
- See tests execute in real-time
- Step through test actions
- Inspect DOM at any point

### 2. Run in Headed Mode
```bash
npm run test:headed
```
- Watch browser execute tests
- See visual feedback

### 3. Run Single Test
```bash
npx playwright test -g "should start with language selection"
```

### 4. Debug Mode
```bash
npx playwright test --debug
```
- Pauses execution
- Opens Playwright Inspector
- Step through line by line

## Common Issues

### ❌ Port Already in Use
**Error**: `EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9
```

### ❌ Playwright Not Installed
**Error**: `Executable doesn't exist`

**Solution**:
```bash
npx playwright install
```

### ❌ Environment Variables Missing
**Error**: Tests fail with "undefined" errors

**Solution**: Ensure `.env` file exists with required variables:
```env
PORT=3000
ADMIN_TOKEN=your_token
SPREADSHEET_ID=your_sheet_id
GOOGLE_CREDENTIALS={"type":"service_account",...}
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_key
```

### ❌ Google Sheets Tests Fail
**Error**: Sheets API errors

**Solution**: 
- Verify `credentials.json` exists
- Check service account has access to the sheet
- Verify `SPREADSHEET_ID` is correct

### ❌ Supabase Tests Fail
**Error**: Maid matching tests fail

**Solution**:
- Verify `SUPABASE_URL` and `SUPABASE_KEY` are set
- Check Supabase database has `maids` table
- Ensure maids table has required columns

## Test Coverage Summary

| Category | Tests | Status |
|----------|-------|--------|
| API Endpoints | 12 | ✅ |
| Language Selection | 5 | ✅ |
| Cleaning Flows | 15 | ✅ |
| Maid Flows | 10 | ✅ |
| Navigation | 8 | ✅ |
| Integration | 12 | ✅ |
| Module Tests | 15 | ✅ |
| **Total** | **77** | **✅** |

## CI/CD Integration

Tests are configured for CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Install dependencies
  run: npm ci

- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run tests
  run: npm test

- name: Upload test report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Performance

Typical test execution times:
- **API Tests**: ~2 seconds
- **Flow Tests**: ~5 seconds
- **Integration Tests**: ~8 seconds
- **All Tests**: ~15 seconds

## Next Steps

1. ✅ Run tests to verify everything works
2. ✅ Review test report for any failures
3. ✅ Fix any environment configuration issues
4. ✅ Add tests for new features you develop
5. ✅ Integrate tests into your CI/CD pipeline

## Need Help?

- Check `tests/README.md` for detailed documentation
- Review test files for examples
- Open an issue if you find bugs in tests
