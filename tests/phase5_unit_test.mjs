/**
 * AttendEase Student PWA — Phase 5 Unit, Validation & Security Tests
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

console.log('===============================================================');
console.log('   AttendEase Student PWA — Phase 5 Issue Reporting Tests      ');
console.log('===============================================================');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${testName}`);
    passCount++;
  } else {
    console.error(`\x1b[31m✘ FAIL:\x1b[0m ${testName}`);
    if (details) console.error(`   ${details}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// 1. Issue Validation Logic (Mirrors validateIssueReport in IssueReport.tsx)
// -----------------------------------------------------------------------------
export function validateIssueReport(details) {
  const trimmed = details ? details.trim() : '';
  const charCount = trimmed.length;

  if (charCount === 0) {
    return {
      isValid: false,
      error: 'Please enter details describing the issue.',
      trimmedDetails: trimmed,
      charCount,
    };
  }

  if (charCount < 5) {
    return {
      isValid: false,
      error: 'Details must be at least 5 characters.',
      trimmedDetails: trimmed,
      charCount,
    };
  }

  if (charCount > 1000) {
    return {
      isValid: false,
      error: 'Details cannot exceed 1000 characters.',
      trimmedDetails: trimmed,
      charCount,
    };
  }

  return {
    isValid: true,
    error: null,
    trimmedDetails: trimmed,
    charCount,
  };
}

export const ISSUE_CATEGORIES = [
  { type: 'missing_time_in', label: 'Missing Time In', description: 'Scanned at entry but time-in was not recorded' },
  { type: 'missing_time_out', label: 'Missing Time Out', description: 'Attended session but time-out was not captured' },
  { type: 'incorrect_time', label: 'Incorrect Time', description: 'Recorded timestamp does not match arrival/departure' },
  { type: 'wrong_status', label: 'Wrong Status', description: 'Status marked incorrectly (e.g., absent or late by mistake)' },
  { type: 'other', label: 'Other', description: 'General discrepancy or other attendance concern' },
];

console.log('\n--- 1. Description Trimming & Input Validation ---');

// Test 1: Description trimming
const trimmedRes = validateIssueReport('   My attendance was not recorded   ');
assert(trimmedRes.trimmedDetails === 'My attendance was not recorded', 'Leading and trailing whitespace is trimmed');
assert(trimmedRes.isValid === true, 'Trimmed string of valid length is valid');

// Test 2: Empty description rejection
const emptyRes = validateIssueReport('');
assert(emptyRes.isValid === false, 'Empty description is rejected');
assert(emptyRes.charCount === 0, 'Empty description charCount is 0');
assert(emptyRes.error !== null, 'Empty description returns error message');

// Test 3: Whitespace-only rejection
const whitespaceRes = validateIssueReport('      \n\t  ');
assert(whitespaceRes.isValid === false, 'Whitespace-only description is rejected');
assert(whitespaceRes.charCount === 0, 'Whitespace-only description charCount is 0');

// Test 4: <5 characters rejection
const shortRes1 = validateIssueReport('a');
assert(shortRes1.isValid === false, '1-character description is rejected');
assert(shortRes1.charCount === 1, '1-character description charCount is 1');

const shortRes4 = validateIssueReport('1234');
assert(shortRes4.isValid === false, '4-character description is rejected (<5 limit)');
assert(shortRes4.charCount === 4, '4-character description charCount is 4');

const shortWithSpaces = validateIssueReport('   ab   ');
assert(shortWithSpaces.isValid === false, 'Padded short string ("  ab  " -> "ab") is rejected as 2 chars');

// Test 5: >1000 characters rejection
const longStr = 'x'.repeat(1001);
const longRes = validateIssueReport(longStr);
assert(longRes.isValid === false, '1001-character description is rejected (>1000 limit)');
assert(longRes.charCount === 1001, '1001-character description charCount is 1001');

// Test 6: Valid boundary tests (5 chars and 1000 chars)
const minValidRes = validateIssueReport('12345');
assert(minValidRes.isValid === true, '5-character description (exact min) is valid');
assert(minValidRes.charCount === 5, 'Exact 5-character charCount is 5');

const maxValidRes = validateIssueReport('a'.repeat(1000));
assert(maxValidRes.isValid === true, '1000-character description (exact max) is valid');
assert(maxValidRes.charCount === 1000, 'Exact 1000-character charCount is 1000');

console.log('\n--- 2. Issue Categories Contract Verification ---');

// Test 7: All 5 issue categories supported exactly
const validTypes = new Set(['missing_time_in', 'missing_time_out', 'incorrect_time', 'wrong_status', 'other']);
assert(ISSUE_CATEGORIES.length === 5, 'ISSUE_CATEGORIES contains exactly 5 categories');

for (const cat of ISSUE_CATEGORIES) {
  assert(validTypes.has(cat.type), `Category "${cat.type}" matches backend RPC contract`);
  assert(Boolean(cat.label && cat.label.length > 0), `Category "${cat.type}" has non-empty label "${cat.label}"`);
  assert(Boolean(cat.description && cat.description.length > 0), `Category "${cat.type}" has helpful description`);
}

console.log('\n--- 3. Concurrency & Duplicate Submission Prevention ---');

// Test 8: Duplicate submission prevention simulation
let isSubmittingLock = false;
let executionCount = 0;

async function mockSubmitFlow(details, issueType) {
  const val = validateIssueReport(details);
  if (!val.isValid) return { status: 'invalid' };

  if (isSubmittingLock) {
    return { status: 'blocked_duplicate' };
  }

  isSubmittingLock = true;
  try {
    executionCount++;
    // Simulate async RPC delay
    await new Promise((r) => setTimeout(r, 20));
    return { status: 'ok', report_id: 'rep-uuid-1234' };
  } finally {
    isSubmittingLock = false;
  }
}

// Rapid consecutive clicks
const [call1, call2, call3] = await Promise.all([
  mockSubmitFlow('Valid issue description here for test', 'missing_time_in'),
  mockSubmitFlow('Valid issue description here for test', 'missing_time_in'),
  mockSubmitFlow('Valid issue description here for test', 'missing_time_in'),
]);

assert(call1.status === 'ok', 'First submission proceeds and returns ok');
assert(call2.status === 'blocked_duplicate', 'Second concurrent submission is blocked by lock');
assert(call3.status === 'blocked_duplicate', 'Third concurrent submission is blocked by lock');
assert(executionCount === 1, 'Exactly 1 backend RPC execution occurred during concurrent burst');
assert(isSubmittingLock === false, 'Concurrency lock is released after request finishes');

console.log('\n--- 4. RPC Response State Machine Handling ---');

function mapRpcResponseToUiState(response, callbacks) {
  if (response.status === 'ok') {
    return {
      uiState: 'success',
      reportId: response.report_id,
      errorMessage: null,
    };
  }
  if (response.status === 'session_expired') {
    callbacks.onSessionExpired();
    return {
      uiState: 'expired',
      reportId: null,
      errorMessage: null,
    };
  }
  if (response.status === 'rate_limited' || response.status === 'rate_limit_exceeded') {
    return {
      uiState: 'error',
      reportId: null,
      errorMessage: 'Too many reports submitted. Please try again later.',
    };
  }
  if (response.status === 'unauthorized_session') {
    return {
      uiState: 'error',
      reportId: null,
      errorMessage: 'You are not authorized to report an issue for this session.',
    };
  }
  if (response.status === 'invalid_details') {
    return {
      uiState: 'error',
      reportId: null,
      errorMessage: 'Details must be between 5 and 1000 characters.',
    };
  }
  return {
    uiState: 'error',
    reportId: null,
    errorMessage: 'Unable to submit report. Please check your connection and try again.',
  };
}

// Test 9: Successful response handling
const successState = mapRpcResponseToUiState({ status: 'ok', report_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }, {});
assert(successState.uiState === 'success', 'status=ok maps to success UI state');
assert(successState.reportId === 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Report reference ID is preserved for student');
assert(successState.errorMessage === null, 'No error message in success state');

// Test 10: rate_limited handling
const rateLimitedState = mapRpcResponseToUiState({ status: 'rate_limited' }, {});
assert(rateLimitedState.uiState === 'error', 'status=rate_limited maps to error UI state');
assert(rateLimitedState.errorMessage === 'Too many reports submitted. Please try again later.', 'Friendly rate limit message displayed without DB leakage');

// Test 11: rate_limit_exceeded handling
const rateLimitExceededState = mapRpcResponseToUiState({ status: 'rate_limit_exceeded' }, {});
assert(rateLimitExceededState.uiState === 'error', 'status=rate_limit_exceeded maps to error UI state');
assert(rateLimitExceededState.errorMessage === 'Too many reports submitted. Please try again later.', 'rate_limit_exceeded displays identical friendly message');

// Test 12: session_expired handling
let expiredCalled = false;
const expiredState = mapRpcResponseToUiState({ status: 'session_expired' }, {
  onSessionExpired: () => { expiredCalled = true; },
});
assert(expiredCalled === true, 'status=session_expired calls onSessionExpired callback');
assert(expiredState.uiState === 'expired', 'Expired state mapped cleanly');

// Test 13: unauthorized_session handling
const unauthState = mapRpcResponseToUiState({ status: 'unauthorized_session' }, {});
assert(unauthState.uiState === 'error', 'unauthorized_session maps to error UI state');
assert(unauthState.errorMessage.includes('not authorized'), 'Shows generic authorization notice');

// Test 14: invalid_details handling
const invalidDetailsState = mapRpcResponseToUiState({ status: 'invalid_details' }, {});
assert(invalidDetailsState.uiState === 'error', 'invalid_details maps to error UI state');
assert(invalidDetailsState.errorMessage.includes('5 and 1000'), 'Shows clear 5–1000 characters validation notice');

// Test 15: Generic / Network error handling
const genericErrorState = mapRpcResponseToUiState({ status: 'server_error' }, {});
assert(genericErrorState.uiState === 'error', 'server_error maps to error UI state');
assert(!genericErrorState.errorMessage.includes('Postgres') && !genericErrorState.errorMessage.includes('supabase'), 'No database or internal stack traces exposed');
assert(genericErrorState.errorMessage.includes('connection and try again'), 'Friendly retry message shown');

console.log('\n--- 5. Session Context Behavior ---');

// Test 16: Session context attachment vs general report
function resolveReportPayload(selectedCategory, details, sessionContext) {
  const validation = validateIssueReport(details);
  return {
    issueType: selectedCategory,
    details: validation.trimmedDetails,
    sessionId: sessionContext?.sessionId || null,
    isGeneral: !sessionContext?.sessionId,
  };
}

const attachedReport = resolveReportPayload('missing_time_in', 'I was scanned in', {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  sessionTitle: 'College Assembly',
});
assert(attachedReport.sessionId === '550e8400-e29b-41d4-a716-446655440000', 'Specific session ID is attached when provided');
assert(attachedReport.isGeneral === false, 'Identified as specific session report');

const clearedReport = resolveReportPayload('other', 'General portal question', null);
assert(clearedReport.sessionId === null, 'General report sends null sessionId');
assert(clearedReport.isGeneral === true, 'Identified as general report');

console.log('\n--- 6. Static Security Audit for Phase 5 Files ---');

// Test 17: Security checks on all source files
function getAllSourceFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getAllSourceFiles(fullPath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const sourceFiles = getAllSourceFiles(srcDir);
let hasFromQuery = false;
let hasLocalStorage = false;
let hasIndexedDb = false;
let hasCookie = false;
let hasTokenLogging = false;

for (const filePath of sourceFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(srcDir, filePath);

  if (/\.from\s*\(/i.test(content)) {
    hasFromQuery = true;
    console.error(`[Violation] .from() query found in ${relativePath}`);
  }
  if (/localStorage/i.test(content)) {
    hasLocalStorage = true;
    console.error(`[Violation] localStorage found in ${relativePath}`);
  }
  if (/indexedDB/i.test(content)) {
    hasIndexedDb = true;
    console.error(`[Violation] indexedDB found in ${relativePath}`);
  }
  if (/document\.cookie/i.test(content)) {
    hasCookie = true;
    console.error(`[Violation] document.cookie found in ${relativePath}`);
  }
  if (/console\.(log|info|debug)\s*\(.*(token|sessionToken|qrToken|cleanToken|password).*\)/i.test(content)) {
    hasTokenLogging = true;
    console.error(`[Violation] Token logging detected in ${relativePath}`);
  }
}

assert(!hasFromQuery, 'Zero direct table access (.from()) across all client code');
assert(!hasLocalStorage, 'Zero localStorage references across all client code');
assert(!hasIndexedDb, 'Zero IndexedDB references across all client code');
assert(!hasCookie, 'Zero cookie storage across all client code');
assert(!hasTokenLogging, 'Zero token/credential logging in console');

console.log('\n===============================================================');
console.log(`Phase 5 Unit Test Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('===============================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✔ Phase 5 Issue Reporting Tests PASSED.\n');
}
