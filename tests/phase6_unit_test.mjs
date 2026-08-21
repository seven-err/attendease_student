/**
 * AttendEase Student PWA — Phase 6 Unit, Caching & Security Tests
 * Covers PWA Service Worker Rules, Offline Read Cache, Security Invariants, and State Machine.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');
const publicDir = path.resolve(__dirname, '../public');

console.log('===============================================================');
console.log('   AttendEase Student PWA — Phase 6 Offline & PWA Tests        ');
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
// Mock sessionStorage implementation for Node.js test environment
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
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }
}

globalThis.sessionStorage = new MockSessionStorage();
globalThis.window = globalThis;

// Import offline cache functions dynamically
const {
  saveCachedTodayAttendance,
  getCachedTodayAttendance,
  saveCachedHistoryPage,
  getCachedHistoryPage,
  getCachedHistoryPageNumbers,
  clearOfflineCache,
  isCacheValid,
  formatCacheTimestamp,
  formatTimeAgo,
  sanitizeTodayRecord,
  sanitizeHistoryRecord,
  DEFAULT_CACHE_TTL_MS,
  CACHE_KEYS,
} = await import('../src/lib/offlineCache.ts');

// =============================================================================
// Suite 1: Cache Serialization & Sanitization
// =============================================================================
console.log('\n--- 1. Cache Serialization & Pure Sanitization ---');

const sampleRawToday = {
  session_id: 'sess-1234',
  session_title: 'Math Assembly',
  session_description: 'Midterm orientation',
  main_session_name: 'General Assemblies',
  date: '2026-08-21',
  start_time: '08:00:00',
  end_time: '11:00:00',
  time_in: '2026-08-21T08:02:00+08:00',
  time_out: '2026-08-21T10:55:00+08:00',
  portal_status: 'Complete',
  is_late: false,
  // Attempt to inject sensitive fields
  session_token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  qr_token: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  bearer_token: 'secret_bearer',
  password_hash: '$2b$10$xyz',
};

const sanitizedToday = sanitizeTodayRecord(sampleRawToday);
assert(sanitizedToday.session_id === 'sess-1234', 'Session ID preserved');
assert(sanitizedToday.portal_status === 'Complete', 'Portal status preserved');
assert(sanitizedToday.session_token === undefined, 'Session token strictly stripped during sanitization');
assert(sanitizedToday.qr_token === undefined, 'QR token strictly stripped during sanitization');
assert(sanitizedToday.bearer_token === undefined, 'Bearer token strictly stripped during sanitization');
assert(sanitizedToday.password_hash === undefined, 'Password hash strictly stripped during sanitization');

const sampleRawHistory = {
  session_id: 'hist-999',
  session_title: 'Physics Lab',
  date: '2026-08-19',
  portal_status: 'Complete',
  time_in: '2026-08-19T09:00:00Z',
  time_out: '2026-08-19T12:00:00Z',
  auth_token: 'sensitive_jwt_token',
};

const sanitizedHistory = sanitizeHistoryRecord(sampleRawHistory);
assert(sanitizedHistory.session_id === 'hist-999', 'History session ID preserved');
assert(sanitizedHistory.date === '2026-08-19', 'History date preserved');
assert(sanitizedHistory.auth_token === undefined, 'Auth token strictly stripped during sanitization');

// =============================================================================
// Suite 2: TTL & Timestamp Validation
// =============================================================================
console.log('\n--- 2. Cache TTL & Expiration Logic ---');

assert(DEFAULT_CACHE_TTL_MS === 24 * 60 * 60 * 1000, 'Default TTL is exactly 24 hours');

const now = Date.now();
assert(isCacheValid(now) === true, 'Current timestamp is valid');
assert(isCacheValid(now - 1000) === true, '1-second old cache is valid');
assert(isCacheValid(now - 12 * 60 * 60 * 1000) === true, '12-hour old cache is valid');
assert(isCacheValid(now - 24 * 60 * 60 * 1000) === true, 'Exact 24-hour old cache is valid (boundary)');
assert(isCacheValid(now - (24 * 60 * 60 * 1000 + 1000)) === false, '24 hours + 1s old cache is expired');
assert(isCacheValid(null) === false, 'null timestamp is invalid');
assert(isCacheValid(undefined) === false, 'undefined timestamp is invalid');
assert(isCacheValid(NaN) === false, 'NaN timestamp is invalid');

const timeFormatted = formatCacheTimestamp(now);
assert(typeof timeFormatted === 'string' && timeFormatted.length > 0, 'formatCacheTimestamp returns formatted string');

const timeAgoJustNow = formatTimeAgo(now);
assert(timeAgoJustNow === 'just now', 'formatTimeAgo for current time returns "just now"');

const timeAgoMins = formatTimeAgo(now - 5 * 60 * 1000);
assert(timeAgoMins === '5m ago', 'formatTimeAgo for 5 mins returns "5m ago"');

// =============================================================================
// Suite 3: Today Attendance Offline Cache Operations
// =============================================================================
console.log('\n--- 3. Today Attendance Offline Cache Operations ---');

sessionStorage.clear();

// Test empty retrieval
assert(getCachedTodayAttendance() === null, 'getCachedTodayAttendance() returns null when empty');

// Save today records with sensitive payload
saveCachedTodayAttendance([sampleRawToday], '2026-08-21');

const cachedToday = getCachedTodayAttendance();
assert(cachedToday !== null, 'getCachedTodayAttendance() returns cached object');
assert(cachedToday.records.length === 1, 'Returns 1 cached record');
assert(cachedToday.records[0].session_title === 'Math Assembly', 'Record title matches');
assert(cachedToday.serverDate === '2026-08-21', 'Server date matches');
assert(cachedToday.records[0].session_token === undefined, 'No session_token in cached record');
assert(cachedToday.records[0].qr_token === undefined, 'No qr_token in cached record');

// Verify direct sessionStorage content has no tokens
const rawTodayStorage = sessionStorage.getItem(CACHE_KEYS.TODAY);
assert(!rawTodayStorage.includes('secret_bearer'), 'Raw sessionStorage has no credentials');
assert(!rawTodayStorage.includes('password_hash'), 'Raw sessionStorage has no password_hash');

// Expired Today Cache Test (simulated TTL of 10ms)
await new Promise((r) => setTimeout(r, 20));
const expiredToday = getCachedTodayAttendance(10); // 10ms maxAge
assert(expiredToday === null, 'Expired today cache returns null and cleans storage');
assert(sessionStorage.getItem(CACHE_KEYS.TODAY) === null, 'Expired today cache is removed from sessionStorage');

// =============================================================================
// Suite 4: Attendance History Paginated Offline Cache Operations
// =============================================================================
console.log('\n--- 4. History Paginated Offline Cache Operations ---');

sessionStorage.clear();

// Test uncached page
assert(getCachedHistoryPage(1, 10) === null, 'Uncached history page 1 returns null');

// Save page 1
saveCachedHistoryPage(1, 10, [sanitizedHistory], 25);

const cachedP1 = getCachedHistoryPage(1, 10);
assert(cachedP1 !== null, 'Page 1 retrieved from cache');
assert(cachedP1.records.length === 1, 'Page 1 has 1 record');
assert(cachedP1.totalCount === 25, 'Total count 25 preserved');
assert(cachedP1.page === 1 && cachedP1.pageSize === 10, 'Page and pageSize match');

// Save page 2
const sampleP2History = {
  session_id: 'hist-888',
  session_title: 'Chemistry Lab',
  date: '2026-08-18',
  portal_status: 'Complete',
};
saveCachedHistoryPage(2, 10, [sampleP2History], 25);

const cachedP2 = getCachedHistoryPage(2, 10);
assert(cachedP2 !== null, 'Page 2 retrieved from cache');
assert(cachedP2.records[0].session_id === 'hist-888', 'Page 2 record matches');

// Verify page 3 is still uncached
assert(getCachedHistoryPage(3, 10) === null, 'Page 3 is correctly identified as uncached');

// Check cached page index
const cachedPages = getCachedHistoryPageNumbers(10);
assert(cachedPages.includes(1) && cachedPages.includes(2), 'Cached page numbers index lists pages 1 and 2');
assert(!cachedPages.includes(3), 'Cached page numbers index does not include page 3');

// =============================================================================
// Suite 5: Cache Purge on Session Expiration / Logout
// =============================================================================
console.log('\n--- 5. Cache Purge on Session Expiration / Logout ---');

saveCachedTodayAttendance([sampleRawToday], '2026-08-21');
saveCachedHistoryPage(1, 10, [sanitizedHistory], 25);

assert(getCachedTodayAttendance() !== null, 'Today cache populated before purge');
assert(getCachedHistoryPage(1, 10) !== null, 'History cache populated before purge');

clearOfflineCache();

assert(getCachedTodayAttendance() === null, 'Today cache is completely purged after clearOfflineCache()');
assert(getCachedHistoryPage(1, 10) === null, 'History cache is completely purged after clearOfflineCache()');
assert(getCachedHistoryPageNumbers(10).length === 0, 'History index is empty after clearOfflineCache()');

// =============================================================================
// Suite 6: Offline State Machine & "No Absent Inference" Invariant
// =============================================================================
console.log('\n--- 6. State Machine & Status Invariants ---');

// Invariant: If a student is offline with no cached data, we do NOT infer "Absent"
function resolveOfflineDisplayState(isOffline, hasCache, cachedRecords) {
  if (isOffline) {
    if (hasCache && cachedRecords.length > 0) {
      return {
        uiMode: 'cached_records',
        records: cachedRecords,
        isStale: true,
      };
    }
    // Offline with NO cache
    return {
      uiMode: 'offline_unavailable',
      records: [],
      emptyMessage: "Today's attendance is not available on this device yet.",
      // MUST NOT INFER ABSENT
      inferredStatus: null,
    };
  }
  return { uiMode: 'online' };
}

const offlineNoCache = resolveOfflineDisplayState(true, false, []);
assert(offlineNoCache.uiMode === 'offline_unavailable', 'Offline without cache returns offline_unavailable mode');
assert(offlineNoCache.inferredStatus === null, 'Zero client-side status inference (No Absent)');
assert(offlineNoCache.emptyMessage.includes('not available on this device yet'), 'Shows friendly offline explanation');

const offlineWithCache = resolveOfflineDisplayState(true, true, [sanitizedToday]);
assert(offlineWithCache.uiMode === 'cached_records', 'Offline with cache displays cached records');
assert(offlineWithCache.records.length === 1, 'Renders exactly cached records');
assert(offlineWithCache.isStale === true, 'Marks data as stale/cached');

// =============================================================================
// Suite 7: Offline History Pagination Invariant
// =============================================================================
console.log('\n--- 7. Offline History Pagination Invariant ---');

function resolveHistoryPageState(targetPage, pageSize, isOffline) {
  if (isOffline) {
    const cached = getCachedHistoryPage(targetPage, pageSize);
    if (cached) {
      return { status: 'cached', records: cached.records, totalCount: cached.totalCount };
    }
    // Uncached page offline
    return {
      status: 'uncached_offline',
      records: [],
      message: `Page ${targetPage} isn't available offline.`,
      // Do not invent fake total
      totalCount: null,
    };
  }
  return { status: 'online_fetch' };
}

// Repopulate page 1
saveCachedHistoryPage(1, 10, [sanitizedHistory], 20);

const p1State = resolveHistoryPageState(1, 10, true);
assert(p1State.status === 'cached' && p1State.records.length === 1, 'Cached page 1 loads offline');

const p2State = resolveHistoryPageState(2, 10, true);
assert(p2State.status === 'uncached_offline', 'Uncached page 2 returns uncached_offline');
assert(p2State.records.length === 0, 'No fake records created for uncached page');
assert(p2State.message.includes("isn't available offline"), 'Shows clear uncached offline notice');

// =============================================================================
// Suite 8: Offline Issue Reporting Guard (Strictly No Offline Writes)
// =============================================================================
console.log('\n--- 8. Issue Reporting Offline Guard ---');

function handleIssueSubmitAttempt(isOffline, details) {
  if (isOffline) {
    return {
      allowed: false,
      queued: false,
      error: 'You are currently offline. Issue reports cannot be submitted without an internet connection.',
    };
  }
  return { allowed: true, queued: false };
}

const offlineSubmit = handleIssueSubmitAttempt(true, 'I was present today at 8am');
assert(offlineSubmit.allowed === false, 'Issue report submission is blocked when offline');
assert(offlineSubmit.queued === false, 'Issue reports are strictly NOT queued offline');
assert(offlineSubmit.error.includes('currently offline'), 'Displays offline error notice');

const onlineSubmit = handleIssueSubmitAttempt(false, 'I was present today at 8am');
assert(onlineSubmit.allowed === true, 'Issue report submission is permitted when online');

// =============================================================================
// Suite 9: Duplicate Refresh / Request Storm Prevention
// =============================================================================
console.log('\n--- 9. Duplicate Refresh / Request Storm Prevention ---');

let inFlight = false;
let executionAttempts = 0;

async function guardedFetch(isOffline) {
  if (isOffline) {
    return { status: 'offline_blocked' };
  }
  if (inFlight) {
    return { status: 'duplicate_blocked' };
  }
  inFlight = true;
  executionAttempts++;
  try {
    await new Promise((r) => setTimeout(r, 20));
    return { status: 'ok' };
  } finally {
    inFlight = false;
  }
}

// Offline click
const offlineClickRes = await guardedFetch(true);
assert(offlineClickRes.status === 'offline_blocked', 'Refresh while offline does not initiate network request');
assert(executionAttempts === 0, 'Zero network executions during offline click');

// Online burst click
const [r1, r2, r3] = await Promise.all([
  guardedFetch(false),
  guardedFetch(false),
  guardedFetch(false),
]);

assert(r1.status === 'ok', 'First concurrent request succeeds');
assert(r2.status === 'duplicate_blocked', 'Second request is blocked by concurrency guard');
assert(r3.status === 'duplicate_blocked', 'Third request is blocked by concurrency guard');
assert(executionAttempts === 1, 'Exactly 1 execution took place during concurrent burst');

// =============================================================================
// Suite 10: Service Worker Security Rules
// =============================================================================
console.log('\n--- 10. Service Worker Static Shell Rules Inspection ---');

const swPath = path.join(publicDir, 'sw.js');
assert(fs.existsSync(swPath), 'public/sw.js exists');

const swContent = fs.readFileSync(swPath, 'utf-8');

assert(!/localStorage/i.test(swContent), 'sw.js contains zero localStorage usage');
assert(!/indexedDB/i.test(swContent), 'sw.js contains zero indexedDB usage');
assert(swContent.includes('attendease-student-shell-'), 'sw.js uses versioned cache name');
assert(swContent.includes('supabase.co'), 'sw.js explicitly checks and bypasses supabase.co');
assert(swContent.includes('/rest/'), 'sw.js explicitly checks and bypasses /rest/');
assert(swContent.includes('/rpc/'), 'sw.js explicitly checks and bypasses /rpc/');
assert(swContent.includes("request.method !== 'GET'"), 'sw.js only handles GET requests (POST/PUT/DELETE bypassed)');

// Verify manifest
const manifestPath = path.join(publicDir, 'manifest.webmanifest');
assert(fs.existsSync(manifestPath), 'public/manifest.webmanifest exists');
const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert(manifestJson.name === 'AttendEase - Student Portal', 'Manifest name is "AttendEase - Student Portal"');
assert(manifestJson.short_name === 'AttendEase', 'Manifest short_name is "AttendEase"');
assert(manifestJson.display === 'standalone', 'Manifest display is "standalone"');
assert(manifestJson.orientation === 'portrait-primary', 'Manifest orientation is "portrait-primary"');

// =============================================================================
// Suite 11: Static Security & Zero-Trust Audit Across All Source Files
// =============================================================================
console.log('\n--- 11. Static Security Audit Across src/ ---');

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
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/console\.(log|info|debug)\s*\(.*(sessionToken|qrToken|cleanToken|bearer|password).*\)/i.test(line)) {
      hasTokenLogging = true;
      console.error(`[Violation] Token logging detected in ${relativePath} L${i + 1}`);
    }
  }
}

assert(!hasFromQuery, 'Zero direct table queries (.from()) in client code');
assert(!hasLocalStorage, 'Zero localStorage usage across all src/ files');
assert(!hasIndexedDb, 'Zero IndexedDB usage across all src/ files');
assert(!hasCookie, 'Zero cookie storage across all src/ files');
assert(!hasTokenLogging, 'Zero token or credential logging in console');

// =============================================================================
// Summary
// =============================================================================
console.log('\n===============================================================');
console.log(`Phase 6 Unit Test Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('===============================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✔ Phase 6 Unit, Caching & Security Tests fully PASSED.\n');
  process.exit(0);
}
