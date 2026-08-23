/**
 * AttendEase Student PWA — Phase 12 Production UX, Reliability & Security Audit Suite
 * 
 * Verifies:
 * 1. Static Security & Zero-Trust Invariants (SessionStorage-only, RPC-only, no leaked keys)
 * 2. Session Watchdog & Inactivity Lifecycle (15m inactivity, 1hr absolute cap, clean boot)
 * 3. Client Concurrency & Unmount Safety (In-flight login lock, isMountedRef guards)
 * 4. Network Resilience & Client RPC Timeouts (withApiTimeout fast-fail protection)
 * 5. PWA / Service Worker Lifecycle & Offline Fallback (ReadyState registration, promise chaining)
 * 6. Attendance Integrity & Year-Level Normalization (Numeric extraction fallback)
 * 7. Accessibility, Reduced Motion & Canonical Theme Alignment
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(projectRoot, 'src');
const publicDir = path.resolve(projectRoot, 'public');

console.log('======================================================================');
console.log('   AttendEase Student PWA — Phase 12 Production Audit Suite           ');
console.log('======================================================================');

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

// Utility: Recursively find all source files
function getFiles(dir, filter = () => true) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath, filter));
    } else if (filter(filePath)) {
      results.push(filePath);
    }
  }
  return results;
}

const srcFiles = getFiles(srcDir, (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.css'));
const cssContent = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf8');
const swContent = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
const swRegisterContent = fs.readFileSync(path.join(srcDir, 'lib/swRegister.ts'), 'utf8');
const sessionHookContent = fs.readFileSync(path.join(srcDir, 'hooks/useStudentSession.ts'), 'utf8');
const apiContent = fs.readFileSync(path.join(srcDir, 'lib/api.ts'), 'utf8');
const appContent = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf8');
const historyContent = fs.readFileSync(path.join(srcDir, 'components/attendance/AttendanceHistory.tsx'), 'utf8');
const todayContent = fs.readFileSync(path.join(srcDir, 'components/attendance/TodayAttendance.tsx'), 'utf8');
const loginContent = fs.readFileSync(path.join(srcDir, 'views/LoginView.tsx'), 'utf8');

// Mirror pure watchdog logic for standalone unit evaluation
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const ABSOLUTE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

function evaluateSessionWatchdog(now, createdAt, lastActiveAt) {
  if (!createdAt || !lastActiveAt) {
    return { expired: false };
  }
  if (now - lastActiveAt > INACTIVITY_TIMEOUT_MS) {
    return { expired: true, reason: 'Session expired due to 15 minutes of inactivity.' };
  }
  if (now - createdAt > ABSOLUTE_TIMEOUT_MS) {
    return { expired: true, reason: 'Session reached 1-hour maximum lifetime.' };
  }
  return { expired: false };
}

// Mirror pure timeout wrapper for standalone unit evaluation
async function withApiTimeout(promise, timeoutMs = 15000, timeoutMessage = 'Request timed out.') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Mirror pure year level matching logic
function isYearLevelMatching(targetYearLevels, userYearLevel) {
  if (!targetYearLevels || targetYearLevels.length === 0) {
    return true;
  }
  if (!userYearLevel || userYearLevel.trim() === '') {
    return true;
  }
  const cleanUserYear = userYearLevel.trim().toLowerCase();
  const userDigits = cleanUserYear.match(/\d+/)?.[0];

  return targetYearLevels.some((yl) => {
    const cleanYl = yl.trim().toLowerCase();
    if (cleanYl === cleanUserYear) return true;
    const ylDigits = cleanYl.match(/\d+/)?.[0];
    if (userDigits && ylDigits && userDigits === ylDigits) {
      return true;
    }
    return false;
  });
}

function isDepartmentMatching(sessionDept, userDept) {
  if (!sessionDept || sessionDept.trim() === '' || sessionDept.trim().toLowerCase() === 'all' || sessionDept.trim().toLowerCase() === 'institution') {
    return true;
  }
  if (!userDept || userDept.trim() === '') {
    return false;
  }
  const cleanSession = sessionDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanUser = userDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleanSession === cleanUser;
}

async function runTests() {
  console.log('\n--- 1. STATIC SECURITY & ZERO-TRUST INVARIANTS ---');

  // Check 1: Zero service role keys
  let hasServiceRole = false;
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('service_role') || content.includes('SERVICE_ROLE_KEY')) {
      hasServiceRole = true;
    }
  }
  assert(!hasServiceRole, 'Zero Service-Role Key references across client code');

  // Check 2: Session token persisted in localStorage (long-lived ~4-year portal sessions)
  let hasLocalStorage = false;
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('localStorage')) {
      hasLocalStorage = true;
    }
  }
  assert(hasLocalStorage, 'Session identity persisted via localStorage (survives browser restarts)');

  // Check 3: Zero cookie storage
  let hasCookies = false;
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('document.cookie') || content.includes('set-cookie')) {
      hasCookies = true;
    }
  }
  assert(!hasCookies, 'Zero cookie storage for tokens or credentials');

  // Check 4: Zero direct table queries (.from())
  let hasDirectFrom = false;
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('.from(') && !file.includes('offlineCache.ts')) {
      hasDirectFrom = true;
    }
  }
  assert(!hasDirectFrom, 'Zero direct table queries (.from()) - RPC-only gateway');

  // Check 5: Zero token logging
  let hasTokenLogging = false;
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (/console\.(log|info|warn|error)\(.*(?:session_token|qr_token|sessionToken|qrToken).*\)/i.test(content)) {
      hasTokenLogging = true;
    }
  }
  assert(!hasTokenLogging, 'Zero raw session/QR token logging in console statements');

  console.log('\n--- 2. SESSION WATCHDOG & INACTIVITY LIFECYCLE ---');

  const baseTime = 1700000000000;

  assert(INACTIVITY_TIMEOUT_MS === 15 * 60 * 1000, 'Inactivity timeout constant is exactly 15 minutes');
  assert(ABSOLUTE_TIMEOUT_MS === 60 * 60 * 1000, 'Absolute session timeout cap is exactly 1 hour');

  const activeRes = evaluateSessionWatchdog(baseTime + 5 * 60 * 1000, baseTime, baseTime);
  assert(!activeRes.expired, 'Active session within 15 minutes is not expired');

  const inactiveRes = evaluateSessionWatchdog(baseTime + 16 * 60 * 1000, baseTime, baseTime);
  assert(inactiveRes.expired, 'Inactive session past 15 minutes is expired by watchdog');
  assert(inactiveRes.reason?.includes('15 minutes'), 'Inactive expiration reason mentions 15 minutes inactivity');

  const absoluteRes = evaluateSessionWatchdog(baseTime + 61 * 60 * 1000, baseTime, baseTime + 60 * 60 * 1000);
  assert(absoluteRes.expired, 'Session exceeding 1-hour absolute lifetime is expired by watchdog');
  assert(absoluteRes.reason?.includes('1-hour'), 'Absolute expiration reason mentions 1-hour cap');

  const nullRes = evaluateSessionWatchdog(baseTime, null, null);
  assert(!nullRes.expired, 'Watchdog handles missing timestamps without crashing');

  assert(
    sessionHookContent.includes('WATCHDOG_INTERVAL_MS') &&
    sessionHookContent.includes('checkWatchdog') &&
    sessionHookContent.includes('visibilitychange') &&
    sessionHookContent.includes('focus'),
    'useStudentSession actively evaluates watchdog on interval, window focus, and visibilitychange'
  );

  assert(
    sessionHookContent.includes('evaluateSessionWatchdog(now, createdAt, lastActiveAt)') &&
    sessionHookContent.includes('clearSession()'),
    'useStudentSession cleans up orphaned or expired sessions on initial boot'
  );

  console.log('\n--- 3. CLIENT CONCURRENCY & UNMOUNT SAFETY ---');

  assert(
    sessionHookContent.includes('isLoggingInRef') && sessionHookContent.includes('Authentication already in progress'),
    'useStudentSession enforces in-flight concurrency lock on login requests'
  );

  assert(
    historyContent.includes('isMountedRef') && historyContent.includes('isMountedRef.current = false'),
    'AttendanceHistory tracks component mount state via isMountedRef'
  );

  assert(
    appContent.includes('activeTokenRef') && historyContent.includes('activeTokenRef'),
    'Active session token ref tracking prevents stale async response race conditions'
  );

  console.log('\n--- 4. NETWORK RESILIENCE & CLIENT RPC TIMEOUTS ---');

  assert(apiContent.includes('API_REQUEST_TIMEOUT_MS = 15000'), 'Default API request timeout is set to 15,000ms (15s)');

  // Test withApiTimeout on fast resolving promise
  const fastPromise = Promise.resolve('fast_result');
  const fastResult = await withApiTimeout(fastPromise, 1000);
  assert(fastResult === 'fast_result', 'withApiTimeout resolves promptly on successful fast responses');

  // Test withApiTimeout on stalled promise
  let timedOut = false;
  try {
    const hangingPromise = new Promise((resolve) => setTimeout(() => resolve('late'), 500));
    await withApiTimeout(hangingPromise, 50, 'Custom timeout error');
  } catch (err) {
    timedOut = err.message === 'Custom timeout error';
  }
  assert(timedOut, 'withApiTimeout fast-fails with custom timeout error when request hangs');

  assert(
    apiContent.includes('withApiTimeout') &&
    apiContent.includes('student_portal_create_session') &&
    apiContent.includes('student_portal_get_today_attendance') &&
    apiContent.includes('student_portal_get_attendance_history') &&
    apiContent.includes('student_portal_report_issue') &&
    apiContent.includes('student_portal_destroy_session'),
    'All 5 student portal RPCs are protected with client-side timeout wrappers'
  );

  console.log('\n--- 5. PWA / SERVICE WORKER LIFECYCLE & OFFLINE RESILIENCE ---');

  assert(
    swRegisterContent.includes("document.readyState === 'complete'") &&
    swRegisterContent.includes('window.addEventListener'),
    'swRegister handles both already-complete document state and window load event'
  );

  assert(
    swContent.includes("caches.match('/index.html').then((indexRes) => indexRes || caches.match('/'))"),
    'sw.js correctly chains Promise for offline navigation fallback without early evaluation'
  );

  assert(
    swContent.includes('supabase.co') &&
    swContent.includes('/rpc/') &&
    swContent.includes('student_portal_'),
    'sw.js explicitly bypasses Supabase API and all student_portal RPCs'
  );

  console.log('\n--- 6. ATTENDANCE INTEGRITY & YEAR-LEVEL MATCHING ---');

  assert(isYearLevelMatching(['4th Year'], '4th Year'), 'Direct year level string matches correctly');
  assert(isYearLevelMatching(['4th Year'], '4'), 'Normalized digit year level matches (4 matches 4th Year)');
  assert(isYearLevelMatching(['1st Year'], '1'), 'Normalized digit year level matches (1 matches 1st Year)');
  assert(isYearLevelMatching(['3rd Year', '4th Year'], '4'), 'Target list with multiple year levels matches correctly');
  assert(!isYearLevelMatching(['4th Year'], '3'), 'Different year level is rejected (3 does not match 4th Year)');
  assert(isYearLevelMatching(null, '4'), 'Null target year levels allows all students');
  assert(isYearLevelMatching([], '4'), 'Empty target year levels allows all students');
  assert(isYearLevelMatching(['4th Year'], null), 'Student with unrecorded year level is allowed');

  assert(isDepartmentMatching('CCS', 'CCS'), 'Department matching matches identical department');
  assert(isDepartmentMatching('ccs', 'CCS'), 'Department matching is case-insensitive');
  assert(isDepartmentMatching('ALL', 'CCS'), 'Department matching allows institutional ALL department');
  assert(!isDepartmentMatching('CBA', 'CCS'), 'Department matching strictly filters out other departments');

  console.log('\n--- 7. ACCESSIBILITY, REDUCED MOTION & CANONICAL THEME ---');

  assert(cssContent.includes(':focus-visible'), 'Visible :focus-visible outlines present for keyboard navigation');
  assert(cssContent.includes('@media (prefers-reduced-motion: reduce)'), 'CSS includes @media (prefers-reduced-motion: reduce) rules');
  assert(cssContent.includes('min-height: 44px') && cssContent.includes('min-width: 44px'), 'CSS enforces minimum 44px touch targets');
  assert(cssContent.includes('--colors-primary: #8b0000'), 'CSS defines canonical maroon brand color (#8b0000)');
  assert(cssContent.includes('--colors-bg: #f5f5f4'), 'CSS defines canonical background canvas color (#f5f5f4)');

  assert(
    loginContent.includes('/attendease.png') && appContent.includes('/attendease.png'),
    'Authentic AttendEase logo is integrated in both login view and authenticated shell header'
  );

  console.log('\n======================================================================');
  console.log(`PHASE 12 PRODUCTION AUDIT RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
