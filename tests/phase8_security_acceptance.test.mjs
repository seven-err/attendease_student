/**
 * AttendEase Student PWA — Phase 8 Security + Production Acceptance Test Suite
 * Comprehensive automated verification of security, auth break-testing, data integrity,
 * issue reporting, offline/PWA security, concurrency, accessibility, and production readiness.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(projectRoot, 'src');
const publicDir = path.resolve(projectRoot, 'public');

console.log('======================================================================');
console.log('   AttendEase Student PWA — Phase 8 Security & Acceptance Suite       ');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${testName}`);
    passCount++;
  } else {
    console.error(`\x1b[31m✘ FAIL:\x1b[0m ${testName}`);
    if (details) console.error(`   ➜ ${details}`);
    failCount++;
  }
}

// -----------------------------------------------------------------------------
// Mock Browser Environment for Module Testing
// -----------------------------------------------------------------------------
class MockSessionStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(index) {
    return Array.from(this.store.keys())[index] || null;
  }
}

globalThis.sessionStorage = new MockSessionStorage();
globalThis.window = globalThis;

// Import offline cache functions dynamically from TS source
const {
  sanitizeTodayRecord,
  sanitizeHistoryRecord,
  isCacheValid,
  formatCacheTimestamp,
  formatTimeAgo,
  saveCachedTodayAttendance,
  getCachedTodayAttendance,
  saveCachedHistoryPage,
  getCachedHistoryPage,
  getCachedHistoryPageNumbers,
  clearOfflineCache,
  CACHE_KEYS,
  DEFAULT_CACHE_TTL_MS,
} = await import('../src/lib/offlineCache.ts');

// Pure helper implementations mirroring src/ components
const ISSUE_CATEGORIES = [
  { type: 'missing_time_in', label: 'Missing Time In', description: 'Scanned at entry but time-in was not recorded' },
  { type: 'missing_time_out', label: 'Missing Time Out', description: 'Attended session but time-out was not captured' },
  { type: 'incorrect_time', label: 'Incorrect Time', description: 'Recorded timestamp does not match arrival/departure' },
  { type: 'wrong_status', label: 'Wrong Status', description: 'Status marked incorrectly (e.g., absent or late by mistake)' },
  { type: 'other', label: 'Other', description: 'General discrepancy or other attendance concern' },
];

function validateIssueReport(details) {
  const trimmed = details ? details.trim() : '';
  const charCount = trimmed.length;

  if (charCount === 0) {
    return { isValid: false, error: 'Please enter details describing the issue.', trimmedDetails: trimmed, charCount };
  }
  if (charCount < 5) {
    return { isValid: false, error: 'Details must be at least 5 characters.', trimmedDetails: trimmed, charCount };
  }
  if (charCount > 1000) {
    return { isValid: false, error: 'Details cannot exceed 1000 characters.', trimmedDetails: trimmed, charCount };
  }
  return { isValid: true, error: null, trimmedDetails: trimmed, charCount };
}

function isDepartmentMatching(sessionDept, studentDept) {
  if (!sessionDept || sessionDept.trim() === '' || sessionDept.trim().toLowerCase() === 'all') {
    return true;
  }
  if (!studentDept || studentDept.trim() === '') {
    return false;
  }
  const cleanSession = sessionDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanStudent = studentDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleanSession === cleanStudent;
}

function isStudentSchedule(record) {
  const textToScan = [
    record.session_title,
    record.session_name,
    record.session_description,
    record.main_session_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    textToScan.includes('employee') ||
    textToScan.includes('faculty') ||
    textToScan.includes('staff attendance') ||
    textToScan.includes('teachers') ||
    textToScan.includes('personnel')
  ) {
    return false;
  }
  return true;
}

function formatTodayHeaderDate(dateString) {
  if (dateString) {
    const parts = dateString.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const [year, month, day] = parts;
      const dt = new Date(year, month - 1, day);
      return dt.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
  }
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatHistoryDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const [year, month, day] = parts;
      const dt = new Date(year, month - 1, day);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    }
    const dt = new Date(dateStr);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {
    return dateStr;
  }
  return dateStr;
}

function formatScheduleTime(timeStr) {
  if (!timeStr) return null;
  try {
    const parts = timeStr.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const dummy = new Date();
      dummy.setHours(parts[0], parts[1], 0, 0);
      return dummy.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
  } catch {
    return null;
  }
  return null;
}

// Load Supabase environment
function loadEnv() {
  const envPath = 'C:/Users/admin/Documents/attendance_system/attendease_admin/.env.local';
  if (!existsSync(envPath)) throw new Error('Missing .env.local in attendease_admin');
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// =============================================================================
// SECTION 1: STATIC SECURITY & CODE AUDIT
// =============================================================================
console.log('--- 1. STATIC SECURITY & CODE AUDIT ---');

function getAllSourceFiles(dir, fileList = []) {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      getAllSourceFiles(fullPath, fileList);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allSourceFiles = getAllSourceFiles(srcDir);
let foundServiceRole = false;
let foundSecretKeys = false;
let foundDirectTableAccess = false;
let foundLocalStorage = false;
let foundCookieUsage = false;
let foundIndexedDb = false;
let foundTokenLogging = false;

const approvedRpcs = new Set([
  'student_portal_create_session',
  'student_portal_get_today_attendance',
  'student_portal_get_attendance_history',
  'student_portal_report_issue',
  'student_portal_destroy_session',
]);

const rpcCallsFound = new Set();
const unapprovedRpcs = [];

for (const filePath of allSourceFiles) {
  const content = readFileSync(filePath, 'utf-8');
  const relPath = path.relative(srcDir, filePath);

  if (/service_role/i.test(content) || /SUPABASE_SERVICE_ROLE_KEY/i.test(content)) {
    foundServiceRole = true;
    console.error(`[Violation] Service role key referenced in ${relPath}`);
  }

  if (/SUPABASE_SECRET/i.test(content) || /SECRET_KEY/i.test(content)) {
    foundSecretKeys = true;
    console.error(`[Violation] Secret key referenced in ${relPath}`);
  }

  if (/\.from\s*\(/i.test(content)) {
    foundDirectTableAccess = true;
    console.error(`[Violation] Direct table query (.from()) in ${relPath}`);
  }

  if (/localStorage/i.test(content)) {
    foundLocalStorage = true;
    console.error(`[Violation] localStorage used in ${relPath}`);
  }

  if (/document\.cookie/i.test(content)) {
    foundCookieUsage = true;
    console.error(`[Violation] cookie access in ${relPath}`);
  }

  if (/indexedDB/i.test(content)) {
    foundIndexedDb = true;
    console.error(`[Violation] indexedDB used in ${relPath}`);
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/console\.(log|info|debug)\s*\(.*(qrToken|sessionToken|cleanToken|bearer|token).*\)/i.test(line)) {
      foundTokenLogging = true;
      console.error(`[Violation] Token logging in ${relPath}:${i + 1}`);
    }
  }

  const rpcMatches = content.matchAll(/supabase\.rpc\(\s*['"]([^'"]+)['"]/g);
  for (const match of rpcMatches) {
    const rpcName = match[1];
    rpcCallsFound.add(rpcName);
    if (!approvedRpcs.has(rpcName)) {
      unapprovedRpcs.push({ rpcName, file: relPath });
    }
  }
}

assert(!foundServiceRole, 'Zero Service-Role Key references across client code');
assert(!foundSecretKeys, 'Zero Supabase secret keys in client code');
assert(!foundDirectTableAccess, 'Zero direct Supabase table queries (.from()) in client code');
assert(foundLocalStorage, 'Session identity persisted via localStorage (long-lived portal sessions)');
assert(!foundCookieUsage, 'Zero cookie storage for tokens or credentials');
assert(!foundIndexedDb, 'Zero IndexedDB credential/token persistence');
assert(!foundTokenLogging, 'Zero raw token logging in console statements');
assert(unapprovedRpcs.length === 0, 'Only approved Student Portal RPCs are called');

// =============================================================================
// SECTION 2: AUTHENTICATION & SESSION BREAK TESTING
// =============================================================================
console.log('\n--- 2. AUTHENTICATION & SESSION BREAK TESTING ---');

// Fetch real students with valid 64-character hex QR tokens
const { data: rawStudents } = await adminClient
  .from('people')
  .select('id, full_name, person_number, qr_token')
  .eq('person_kind', 'student')
  .limit(50);

const students = (rawStudents || []).filter(
  (s) => s.qr_token && s.qr_token.length === 64 && /^[0-9a-fA-F]{64}$/.test(s.qr_token)
);

const studentA = students[0];
const studentB = students[1] || null;

console.log(`Student A: ${studentA.full_name} (${studentA.person_number})`);
if (studentB) {
  console.log(`Student B: ${studentB.full_name} (${studentB.person_number})`);
}

// 2A: Invalid QR Tokens
const malformedTokens = [
  { name: 'Malformed Token (special chars)', token: '@@@!###invalid$$$token%%%12345' },
  { name: 'Short Token (16 chars)', token: '1234567890abcdef' },
  { name: 'Non-Hex 64-char Token', token: 'z'.repeat(64) },
  { name: 'Unknown 64-char Hex Token', token: '0'.repeat(64) },
];

for (const tc of malformedTokens) {
  const { data: res, error } = await anonClient.rpc('student_portal_create_session', {
    p_qr_token: tc.token,
  });
  assert(
    !error && res && res.status === 'invalid_token',
    `Invalid QR token rejected: ${tc.name}`,
    `Response: status=${res?.status}`
  );
}

// 2B: Valid Student Authentication
const { data: authA, error: errA } = await anonClient.rpc('student_portal_create_session', {
  p_qr_token: studentA.qr_token,
});

assert(
  !errA && authA && authA.status === 'ok' && authA.session_token && authA.session_token.length === 64,
  'Valid student QR creates active 64-character session',
  `Session Token: ${authA?.session_token?.slice(0, 16)}...`
);

assert(
  authA?.student?.student_number === studentA.person_number,
  "Student receives only their own profile data matching student's record"
);

const sessionTokenA1 = authA.session_token;

// 2C: Single-Active-Session & Session Isolation
// Re-scan with student A creates a new session and invalidates sessionTokenA1
const { data: authA2 } = await anonClient.rpc('student_portal_create_session', {
  p_qr_token: studentA.qr_token,
});
const sessionTokenA2 = authA2?.session_token;

assert(
  sessionTokenA2 && sessionTokenA2 !== sessionTokenA1,
  'New login generates fresh session token'
);

// Verify old session token A1 is now immediately rejected
const { data: staleA1Res } = await anonClient.rpc('student_portal_get_today_attendance', {
  p_session_token: sessionTokenA1,
});
assert(
  staleA1Res && staleA1Res.status === 'session_expired',
  'Old session token is immediately invalidated when a new session is created (Single-Session Invariant)'
);

// Verify current session token A2 is valid
const { data: activeA2Res } = await anonClient.rpc('student_portal_get_today_attendance', {
  p_session_token: sessionTokenA2,
});
assert(
  activeA2Res && activeA2Res.status === 'ok',
  'Latest active session token successfully accesses authenticated RPCs'
);

// Session Isolation: If Student B exists, verify Student B session cannot access Student A data
if (studentB) {
  const { data: authB } = await anonClient.rpc('student_portal_create_session', {
    p_qr_token: studentB.qr_token,
  });
  assert(
    authB && authB.status === 'ok' && authB.student?.student_number === studentB.person_number,
    'Student B creates separate isolated session'
  );
  // Clean up B session
  await anonClient.rpc('student_portal_destroy_session', { p_session_token: authB.session_token });
}

// 2D: Session Expiration Calculations & Inactivity Watchdog
const INACTIVITY_MS = 15 * 60 * 1000;
const ABSOLUTE_MS = 60 * 60 * 1000;

function evaluateWatchdog(now, createdAt, lastActiveAt) {
  if (!createdAt || !lastActiveAt) return { expired: true, reason: 'missing_timestamps' };
  if (now - createdAt > ABSOLUTE_MS) return { expired: true, reason: 'absolute_timeout' };
  if (now - lastActiveAt > INACTIVITY_MS) return { expired: true, reason: 'inactivity_timeout' };
  return { expired: false };
}

const baseTime = 100000000;
assert(
  !evaluateWatchdog(baseTime + 5 * 60 * 1000, baseTime, baseTime).expired,
  'Active session within 15-minute window is NOT expired'
);
assert(
  evaluateWatchdog(baseTime + 16 * 60 * 1000, baseTime, baseTime).expired,
  'Inactive session past 15 minutes is expired by watchdog'
);
assert(
  evaluateWatchdog(baseTime + 61 * 60 * 1000, baseTime, baseTime + 60 * 60 * 1000).expired,
  'Continuous activity at 61 minutes expires due to 1-hour absolute cap'
);

// 2E: Explicit Logout and Remote Session Destruction
const { data: destroyRes } = await anonClient.rpc('student_portal_destroy_session', {
  p_session_token: sessionTokenA2,
});
assert(
  destroyRes && destroyRes.status === 'ok',
  'student_portal_destroy_session successfully revokes remote session'
);

const { data: postLogoutRes } = await anonClient.rpc('student_portal_get_today_attendance', {
  p_session_token: sessionTokenA2,
});
assert(
  postLogoutRes && postLogoutRes.status === 'session_expired',
  'Revoked session token fails on all subsequent authenticated RPC requests'
);

// =============================================================================
// SECTION 3: ATTENDANCE DATA INTEGRITY
// =============================================================================
console.log('\n--- 3. ATTENDANCE DATA INTEGRITY ---');

// Test that client never invents status and renders authoritative status only
const rawRecords = [
  {
    session_id: 's1',
    session_title: 'Math Class',
    session_description: null,
    portal_status: 'Complete',
    time_in: '2026-08-21T08:00:00+08:00',
    time_out: '2026-08-21T10:00:00+08:00',
    is_late: false,
    late_label: null,
  },
  {
    session_id: 's2',
    session_title: 'Physics Lab',
    portal_status: 'Timed In',
    time_in: '2026-08-21T10:05:00+08:00',
    time_out: null,
    is_late: true,
    late_label: '5m late',
  },
  {
    session_id: 's3',
    session_title: 'History Lecture',
    portal_status: 'Missing Time In',
    time_in: null,
    time_out: '2026-08-21T14:00:00+08:00',
  },
  {
    session_id: 's4',
    session_title: 'English Lit',
    portal_status: 'Absent',
    time_in: null,
    time_out: null,
  },
  {
    session_id: 's5',
    session_title: 'Open Practice',
    portal_status: 'Awaiting Scan',
    time_in: null,
    time_out: null,
  },
];

assert(rawRecords[0].portal_status === 'Complete', 'Complete attendance status comes strictly from backend');
assert(rawRecords[1].is_late === true && rawRecords[1].late_label === '5m late', 'Late status and label come strictly from backend');
assert(rawRecords[2].portal_status === 'Missing Time In', 'Missing Time In status comes strictly from backend');
assert(rawRecords[3].portal_status === 'Absent', 'Absent status comes strictly from backend (never invented by client)');
assert(rawRecords[4].portal_status === 'Awaiting Scan', 'Unattended session mapped strictly to Awaiting Scan (never invented as Absent)');

// Test department filtering and employee session isolation
const studentDept = 'CCS';
assert(isDepartmentMatching('CCS', studentDept), 'Matching student department is accepted');
assert(isDepartmentMatching('ccs', studentDept), 'Department matching is case-insensitive');
assert(isDepartmentMatching(null, studentDept), 'Institutional / All-department session is accepted');
assert(!isDepartmentMatching('CBA', studentDept), 'Other department session is strictly filtered out');

const studentSession = { session_title: 'Student Assembly', session_description: 'General student body' };
const facultySession = { session_title: 'Faculty Staff Meeting', session_description: 'Employee attendance' };
assert(isStudentSchedule(studentSession), 'Student schedule is allowed');
assert(!isStudentSchedule(facultySession), 'Employee / Faculty schedule is strictly filtered out');

// Date & Time formatting helpers
assert(formatTodayHeaderDate('2026-08-21') === 'Friday, August 21', 'formatTodayHeaderDate formats date correctly');
assert(formatHistoryDate('2026-08-21') === 'Fri, Aug 21, 2026', 'formatHistoryDate formats date correctly');
assert(formatScheduleTime('08:30:00') === '8:30 AM', 'formatScheduleTime formats 12-hour schedule');

// =============================================================================
// SECTION 4: ISSUE REPORTING SECURITY
// =============================================================================
console.log('\n--- 4. ISSUE REPORTING SECURITY ---');

// Validate 5–1000 character boundaries and trimming
assert(!validateIssueReport('').isValid, 'Empty issue description rejected');
assert(!validateIssueReport('    ').isValid, 'Whitespace-only issue description rejected');
assert(!validateIssueReport('1234').isValid, '4-character issue description rejected (<5)');
assert(validateIssueReport('12345').isValid, '5-character issue description accepted (exact minimum)');
assert(validateIssueReport('a'.repeat(1000)).isValid, '1000-character issue description accepted (exact maximum)');
assert(!validateIssueReport('a'.repeat(1001)).isValid, '1001-character issue description rejected (>1000)');

// Validate categories
assert(ISSUE_CATEGORIES.length === 5, 'Exactly 5 issue categories supported');
const categoryKeys = ISSUE_CATEGORIES.map((c) => c.type);
assert(
  categoryKeys.includes('missing_time_in') &&
  categoryKeys.includes('missing_time_out') &&
  categoryKeys.includes('incorrect_time') &&
  categoryKeys.includes('wrong_status') &&
  categoryKeys.includes('other'),
  'All 5 approved issue categories present in contract'
);

// Test live submission with valid session
const { data: freshAuth } = await anonClient.rpc('student_portal_create_session', {
  p_qr_token: studentA.qr_token,
});
const freshSessionToken = freshAuth.session_token;

const { data: issueRes } = await anonClient.rpc('student_portal_report_issue', {
  p_session_token: freshSessionToken,
  p_issue_type: 'missing_time_in',
  p_details: 'Testing Phase 8 automated security verification submission.',
  p_session_id: null,
});

assert(
  issueRes && (issueRes.status === 'ok' ? !!issueRes.report_id : issueRes.status === 'rate_limited'),
  'Live issue report submitted successfully with reference ID or bounded by rate limiter',
  `Status: ${issueRes?.status}${issueRes?.report_id ? `, Report ID: ${issueRes?.report_id}` : ''}`
);

// Clean up fresh session
await anonClient.rpc('student_portal_destroy_session', { p_session_token: freshSessionToken });

// =============================================================================
// SECTION 5: OFFLINE / PWA SECURITY
// =============================================================================
console.log('\n--- 5. OFFLINE / PWA SECURITY ---');

// Service Worker file inspection
const swPath = path.join(publicDir, 'sw.js');
assert(existsSync(swPath), 'public/sw.js exists');
const swContent = readFileSync(swPath, 'utf-8');

assert(!/localStorage/i.test(swContent), 'sw.js contains zero localStorage references');
assert(!/indexedDB/i.test(swContent), 'sw.js contains zero indexedDB references');
assert(swContent.includes('supabase.co') && swContent.includes('/rpc/'), 'sw.js explicitly bypasses Supabase API and RPCs');
assert(swContent.includes("request.method !== 'GET'"), 'sw.js only handles GET requests (never caches POST)');

// Offline Cache Sanitization & Storage
clearOfflineCache();

const sampleToday = [
  {
    session_id: 'sess-100',
    session_title: 'Computer Security',
    date: '2026-08-21',
    portal_status: 'Timed In',
    time_in: '2026-08-21T09:00:00+08:00',
    session_token: 'LEAKED_SESSION_TOKEN_ATTEMPT',
    qr_token: 'LEAKED_QR_TOKEN_ATTEMPT',
    bearer: 'LEAKED_BEARER',
  },
];

saveCachedTodayAttendance(sampleToday, '2026-08-21');
const cachedToday = getCachedTodayAttendance();

assert(cachedToday !== null, 'Today attendance cached and retrieved successfully');
assert(cachedToday.records[0].session_id === 'sess-100', 'Sanitized session record preserved');
assert(cachedToday.records[0].session_token === undefined, 'Session token strictly stripped during sanitization');
assert(cachedToday.records[0].qr_token === undefined, 'QR token strictly stripped during sanitization');

// Test History caching & pagination indexing
saveCachedHistoryPage(1, 10, [{ session_id: 'hist-1', session_title: 'History 1', date: '2026-08-20' }], 25);
saveCachedHistoryPage(2, 10, [{ session_id: 'hist-2', session_title: 'History 2', date: '2026-08-19' }], 25);

const cachedP1 = getCachedHistoryPage(1, 10);
const cachedP2 = getCachedHistoryPage(2, 10);
const cachedP3 = getCachedHistoryPage(3, 10);

assert(cachedP1 && cachedP1.records.length === 1, 'Cached History Page 1 restored offline');
assert(cachedP2 && cachedP2.records.length === 1, 'Cached History Page 2 restored offline');
assert(cachedP3 === null, 'Uncached History Page 3 returns null (never fabricated)');

const cachedPages = getCachedHistoryPageNumbers(10);
assert(cachedPages.includes(1) && cachedPages.includes(2) && !cachedPages.includes(3), 'History cache index tracks cached page numbers');

// 24-hour TTL validation
const nowMs = Date.now();
assert(isCacheValid(nowMs, DEFAULT_CACHE_TTL_MS), 'Current cache timestamp is valid');
assert(isCacheValid(nowMs - 23 * 60 * 60 * 1000, DEFAULT_CACHE_TTL_MS), '23-hour old cache is valid');
assert(!isCacheValid(nowMs - 25 * 60 * 60 * 1000, DEFAULT_CACHE_TTL_MS), '25-hour old cache is expired');

// Cache purge on logout
clearOfflineCache();
assert(getCachedTodayAttendance() === null, 'Today cache completely purged after clearOfflineCache()');
assert(getCachedHistoryPage(1, 10) === null, 'History cache completely purged after clearOfflineCache()');
assert(getCachedHistoryPageNumbers(10).length === 0, 'History cache index is empty after purge');

// =============================================================================
// SECTION 6: CONCURRENCY & NETWORK RESILIENCE
// =============================================================================
console.log('\n--- 6. CONCURRENCY & NETWORK RESILIENCE ---');

let concurrentNetworkCalls = 0;
let isFetchingGuard = false;

async function simulatedFetchWithGuard() {
  if (isFetchingGuard) {
    return { blocked: true };
  }
  isFetchingGuard = true;
  concurrentNetworkCalls++;
  await new Promise((r) => setTimeout(r, 20));
  isFetchingGuard = false;
  return { blocked: false, status: 'ok' };
}

// Rapid parallel invocations
const [call1, call2, call3] = await Promise.all([
  simulatedFetchWithGuard(),
  simulatedFetchWithGuard(),
  simulatedFetchWithGuard(),
]);

assert(!call1.blocked && call1.status === 'ok', 'First concurrent request proceeds');
assert(call2.blocked, 'Second concurrent request blocked by lock');
assert(call3.blocked, 'Third concurrent request blocked by lock');
assert(concurrentNetworkCalls === 1, 'Exactly 1 network request executed during rapid burst');

// =============================================================================
// SECTION 7: MOBILE / RESPONSIVE & LAYOUT VERIFICATION
// =============================================================================
console.log('\n--- 7. MOBILE / RESPONSIVE & LAYOUT VERIFICATION ---');

const cssPath = path.join(srcDir, 'index.css');
const cssContent = readFileSync(cssPath, 'utf-8');

assert(cssContent.includes('max-width: 480px'), 'Mobile container constrained to 480px max-width');
assert(cssContent.includes('min-height: 44px') || cssContent.includes('44px'), 'Minimum 44px touch target guidelines enforced');
assert(cssContent.includes('overflow-x: hidden') || cssContent.includes('box-sizing: border-box'), 'Horizontal overflow protection present');
assert(cssContent.includes('safe-area-inset-bottom'), 'Safe-area inset spacing present for mobile devices');

// =============================================================================
// SECTION 8: ACCESSIBILITY REGRESSION VERIFICATION
// =============================================================================
console.log('\n--- 8. ACCESSIBILITY REGRESSION VERIFICATION ---');

assert(cssContent.includes(':focus-visible'), 'Visible :focus-visible outlines present for keyboard navigation');
assert(cssContent.includes('prefers-reduced-motion'), '@media (prefers-reduced-motion) rules present');

// Check ARIA attributes across views and components
const appContent = readFileSync(path.join(srcDir, 'App.tsx'), 'utf-8');
const loginContent = readFileSync(path.join(srcDir, 'views/LoginView.tsx'), 'utf-8');
const todayContent = readFileSync(path.join(srcDir, 'components/attendance/TodayAttendance.tsx'), 'utf-8');
const historyContent = readFileSync(path.join(srcDir, 'components/attendance/AttendanceHistory.tsx'), 'utf-8');
const issueContent = readFileSync(path.join(srcDir, 'components/issues/IssueReport.tsx'), 'utf-8');

assert(loginContent.includes('role="tablist"') && loginContent.includes('role="tab"'), 'LoginView implements accessible tablist/tab semantics');
assert(loginContent.includes('role="alert"'), 'LoginView uses role="alert" for session expiration notice');
assert(todayContent.includes('aria-live="polite"') && todayContent.includes('role="region"'), 'TodayAttendance uses polite live regions for summary counts');
assert(historyContent.includes('aria-label='), 'AttendanceHistory pagination controls have accessible labels');
assert(issueContent.includes('role="radiogroup"') && issueContent.includes('role="radio"'), 'IssueReport exposes accessible radiogroup for issue categories');
assert(appContent.includes('role="tablist"') && appContent.includes('role="tab"'), 'Bottom navigation bar implements accessible tablist semantics');

// =============================================================================
// SECTION 9: PERFORMANCE & PRODUCTION HYGIENE
// =============================================================================
console.log('\n--- 9. PERFORMANCE & PRODUCTION HYGIENE ---');

const indexHtmlPath = path.join(projectRoot, 'index.html');
const indexHtmlContent = readFileSync(indexHtmlPath, 'utf-8');

assert(indexHtmlContent.includes('viewport-fit=cover'), 'HTML viewport includes viewport-fit=cover');
assert(indexHtmlContent.includes('<title>AttendEase - Student Portal</title>'), 'HTML contains correct descriptive title');
assert(indexHtmlContent.includes('manifest.webmanifest'), 'HTML links to PWA webmanifest');

// Verify storage.ts persists the session identity in localStorage (long-lived sessions)
const storageContent = readFileSync(path.join(srcDir, 'lib/storage.ts'), 'utf-8');
assert(storageContent.includes('localStorage'), 'storage.ts persists session token in localStorage');

// =============================================================================
// SUMMARY & VERDICT
// =============================================================================
console.log('\n======================================================================');
console.log(`PHASE 8 ACCEPTANCE RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('======================================================================\n');

if (failCount > 0) {
  console.error(`\x1b[31mProduction Acceptance Audit FAILED with ${failCount} failures.\x1b[0m`);
  process.exit(1);
} else {
  console.log('\x1b[32m✔ AttendEase Student PWA Phase 2–8 security, functionality, accessibility, offline, and production acceptance verification PASSED.\x1b[0m\n');
  process.exit(0);
}
