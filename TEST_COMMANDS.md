# Test Commands Quick Reference

## Installation

```bash
# Install all dependencies
npm install

# Install Playwright browsers
npx playwright install
```

## Running Tests

### All Tests
```bash
npm test                    # Run all tests
npm run test:ui            # Run with interactive UI
npm run test:headed        # Run with visible browser
```

### Specific Test Suites
```bash
npm run test:api           # API endpoint tests only
npm run test:flow          # Flow logic tests only
npm run test:sheets        # Module tests only
npm run test:integration   # Integration tests only
```

### Single Test File
```bash
npx playwright test tests/api.spec.js
npx playwright test tests/flow.spec.js
npx playwright test tests/sheets.spec.js
npx playwright test tests/integration.spec.js
```

### Single Test by Name
```bash
npx playwright test -g "should start with language selection"
npx playwright test -g "Complete Flat Deep Cleaning"
```

## Debugging

```bash
npx playwright test --debug              # Debug mode (step through)
npx playwright test --headed             # Show browser
npx playwright test --ui                 # Interactive UI
npx playwright test --trace on           # Record trace
```

## Reports

```bash
npm run test:report                      # View HTML report
npx playwright show-report               # Same as above
npx playwright show-trace trace.zip      # View trace file
```

## Test Filtering

```bash
# Run only tests matching pattern
npx playwright test -g "API"
npx playwright test -g "Cleaning"
npx playwright test -g "Maid"

# Run specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Run in specific file
npx playwright test tests/api.spec.js -g "status"
```

## Development

```bash
# Run tests on file change (watch mode)
npx playwright test --watch

# Run only failed tests
npx playwright test --last-failed

# Update snapshots
npx playwright test --update-snapshots
```

## CI/CD

```bash
# Run in CI mode (with retries)
CI=true npm test

# Generate report for CI
npx playwright test --reporter=html,json

# Run with specific workers
npx playwright test --workers=4
```

## Useful Flags

```bash
--headed                    # Show browser
--debug                     # Debug mode
--ui                        # Interactive UI
--trace on                  # Record trace
--reporter=html             # HTML report
--reporter=list             # List reporter
--workers=1                 # Single worker (sequential)
--workers=4                 # 4 parallel workers
--timeout=60000             # 60 second timeout
--retries=2                 # Retry failed tests 2 times
--grep="pattern"            # Run tests matching pattern
--grep-invert="pattern"     # Skip tests matching pattern
--project=chromium          # Run on specific browser
--update-snapshots          # Update visual snapshots
```

## Environment Variables

```bash
# Set environment variable for tests
ADMIN_TOKEN=test npm test

# Run with different port
PORT=3001 npm test

# Debug mode
DEBUG=pw:api npm test
```

## Common Workflows

### Quick Test During Development
```bash
npm run test:ui
# Click on test to run
# Make changes
# Click again to re-run
```

### Test New Feature
```bash
# Run specific test
npx playwright test -g "new feature"

# If it fails, debug it
npx playwright test -g "new feature" --debug
```

### Before Commit
```bash
# Run all tests
npm test

# If any fail, view report
npm run test:report
```

### CI Pipeline
```bash
# Install
npm ci
npx playwright install --with-deps

# Test
npm test

# Upload report
# (handled by CI configuration)
```

## Keyboard Shortcuts (UI Mode)

- `Space` - Run/pause test
- `F5` - Refresh
- `Ctrl+F` - Search
- `Esc` - Close panel
- `←` `→` - Navigate timeline

## Exit Codes

- `0` - All tests passed
- `1` - Some tests failed
- `2` - Configuration error

## Tips

1. **Use UI mode for development**: `npm run test:ui`
2. **Use headed mode to see what's happening**: `npm run test:headed`
3. **Use debug mode to step through**: `npx playwright test --debug`
4. **Run specific tests during development**: `npx playwright test -g "pattern"`
5. **View report after failures**: `npm run test:report`

## Quick Troubleshooting

```bash
# Port in use?
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Playwright not installed?
npx playwright install

# Clear test cache
rm -rf test-results/
rm -rf playwright-report/

# Reinstall dependencies
rm -rf node_modules/
npm install
npx playwright install
```

## Test Coverage

| Suite | Tests | Command |
|-------|-------|---------|
| API | 12 | `npm run test:api` |
| Flow | 30 | `npm run test:flow` |
| Modules | 15 | `npm run test:sheets` |
| Integration | 20 | `npm run test:integration` |
| **Total** | **77** | `npm test` |

## Documentation

- **Setup Guide**: `TEST_SETUP.md`
- **Testing Guide**: `TESTING.md`
- **Test Documentation**: `tests/README.md`
- **Playwright Docs**: https://playwright.dev

---

**Quick Start**: `npm install && npx playwright install && npm test`
