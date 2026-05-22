#!/usr/bin/env node

/**
 * Test Runner Script
 * Runs Playwright tests with custom reporting and summary
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('\n' + '='.repeat(60));
  log(message, 'bright');
  console.log('='.repeat(60) + '\n');
}

function section(message) {
  log(`\n${message}`, 'cyan');
  console.log('-'.repeat(60));
}

// Parse command line arguments
const args = process.argv.slice(2);
const testSuite = args[0] || 'all';

header('🎭 WhatsApp Chatbot Test Suite');

// Check if Playwright is installed
section('Checking Prerequisites');
try {
  execSync('npx playwright --version', { stdio: 'pipe' });
  log('✓ Playwright installed', 'green');
} catch (error) {
  log('✗ Playwright not installed', 'red');
  log('  Run: npm install && npx playwright install', 'yellow');
  process.exit(1);
}

// Check if node_modules exists
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
  log('✗ Dependencies not installed', 'red');
  log('  Run: npm install', 'yellow');
  process.exit(1);
}
log('✓ Dependencies installed', 'green');

// Check environment variables
section('Checking Environment');
const requiredEnvVars = ['SPREADSHEET_ID', 'ADMIN_TOKEN'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  log(`⚠ Missing environment variables: ${missingVars.join(', ')}`, 'yellow');
  log('  Some tests may fail without proper configuration', 'yellow');
} else {
  log('✓ Environment variables configured', 'green');
}

// Determine which tests to run
let testCommand = 'npx playwright test';
let testDescription = 'All Tests';

switch (testSuite) {
  case 'api':
    testCommand += ' tests/api.spec.js';
    testDescription = 'API Endpoint Tests';
    break;
  case 'flow':
    testCommand += ' tests/flow.spec.js';
    testDescription = 'Flow Logic Tests';
    break;
  case 'sheets':
    testCommand += ' tests/sheets.spec.js';
    testDescription = 'Module Tests';
    break;
  case 'integration':
    testCommand += ' tests/integration.spec.js';
    testDescription = 'Integration Tests';
    break;
  case 'performance':
    testCommand += ' tests/performance.spec.js';
    testDescription = 'Performance Tests';
    break;
  case 'quick':
    testCommand += ' tests/api.spec.js tests/flow.spec.js';
    testDescription = 'Quick Tests (API + Flow)';
    break;
  case 'all':
  default:
    testDescription = 'All Tests';
    break;
}

// Run tests
section(`Running: ${testDescription}`);
const startTime = Date.now();

try {
  execSync(testCommand, { stdio: 'inherit' });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  header('✅ Test Suite Passed');
  log(`Duration: ${duration}s`, 'green');
  
  // Show report command
  console.log('\n📊 View detailed report:');
  log('  npm run test:report', 'cyan');
  
  process.exit(0);
} catch (error) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  header('❌ Test Suite Failed');
  log(`Duration: ${duration}s`, 'red');
  
  // Show debugging commands
  console.log('\n🔍 Debug failed tests:');
  log('  npm run test:ui      # Interactive UI', 'cyan');
  log('  npm run test:headed  # Show browser', 'cyan');
  log('  npm run test:report  # View report', 'cyan');
  
  process.exit(1);
}
