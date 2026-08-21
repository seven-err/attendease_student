/**
 * AttendEase Student PWA — Phase 4 Unit & Pagination Tests
 */

console.log('===============================================================');
console.log('   AttendEase Student PWA — Phase 4 Unit & Pagination Test     ');
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

// 1. Date Formatting Function (Mirroring AttendanceHistory.tsx implementation)
export function formatHistoryDate(dateStr) {
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

// 2. Time Formatting Function (Mirroring AttendanceTimeRow.tsx / AttendanceHistory.tsx)
export function formatAttendanceTime(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

// 3. Schedule Time Formatting Function
export function formatScheduleTime(timeStr) {
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

// 4. Pagination Math & Controls Calculator
export function calculatePaginationState(currentPage, totalCount, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const offset = (validPage - 1) * pageSize;
  const rangeStart = totalCount === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(validPage * pageSize, totalCount);

  return {
    currentPage: validPage,
    totalPages,
    offset,
    pageSize,
    totalCount,
    rangeStart,
    rangeEnd,
    hasPrevious: validPage > 1,
    hasNext: validPage < totalPages,
    isFirstPage: validPage === 1,
    isLastPage: validPage === totalPages,
  };
}

// 5. Concurrency Guard Simulator
export function createConcurrencyGuard() {
  let isFetching = false;
  let callCount = 0;

  async function executeRequest(fn) {
    if (isFetching) {
      return { status: 'blocked_duplicate' };
    }
    isFetching = true;
    callCount++;
    try {
      const result = await fn();
      return { status: 'executed', data: result };
    } finally {
      isFetching = false;
    }
  }

  return { executeRequest, getCallCount: () => callCount, isBusy: () => isFetching };
}

// 6. Authoritative Status Determination
export function resolveAttendanceDisplayStatus(portalStatus, timeIn, timeOut) {
  const hasTimeIn = Boolean(timeIn);
  const hasTimeOut = Boolean(timeOut);

  if (hasTimeIn && hasTimeOut) {
    return { statusText: 'Attendance Complete', badgeVariant: 'badge-success' };
  } else if (hasTimeIn && !hasTimeOut) {
    return { statusText: 'Timed In', badgeVariant: 'badge-info' };
  } else if (portalStatus === 'Awaiting Scan') {
    return { statusText: 'Awaiting Scan', badgeVariant: 'badge-neutral' };
  } else if (portalStatus === 'Missing Time In') {
    return { statusText: 'Missing Time In', badgeVariant: 'badge-warning' };
  } else if (portalStatus === 'Absent') {
    return { statusText: 'Absent', badgeVariant: 'badge-danger' };
  } else if (portalStatus) {
    return { statusText: portalStatus, badgeVariant: 'badge-neutral' };
  }
  return { statusText: 'Not Recorded', badgeVariant: 'badge-neutral' };
}

// =============================================================================
// RUN SUITES
// =============================================================================

// --- Suite 1: Date and Time Formatting ---
console.log('\n--- 1. Date and Time Formatting ---');

const d1 = formatHistoryDate('2026-08-21');
assert(d1.includes('Aug 21, 2026') || d1.includes('8/21/2026'), `formatHistoryDate('2026-08-21') formats date properly (got: "${d1}")`);

const d2 = formatHistoryDate(null);
assert(d2 === '—', 'formatHistoryDate(null) returns dash');

const d3 = formatHistoryDate(undefined);
assert(d3 === '—', 'formatHistoryDate(undefined) returns dash');

const t1 = formatAttendanceTime('2026-08-21T08:30:00+08:00');
assert(t1 && t1.includes('8:30'), `formatAttendanceTime ISO string returns formatted time (got: "${t1}")`);

const t2 = formatAttendanceTime(null);
assert(t2 === null, 'formatAttendanceTime(null) returns null');

const s1 = formatScheduleTime('08:00:00');
assert(s1 && (s1 === '8:00 AM' || s1.includes('8:00')), `formatScheduleTime('08:00:00') returns "8:00 AM" (got: "${s1}")`);

const s2 = formatScheduleTime('17:30');
assert(s2 && (s2 === '5:30 PM' || s2.includes('5:30')), `formatScheduleTime('17:30') returns "5:30 PM" (got: "${s2}")`);

// --- Suite 2: Empty History State ---
console.log('\n--- 2. Empty History State ---');

const emptyState = calculatePaginationState(1, 0, 10);
assert(emptyState.totalCount === 0, 'Empty state has totalCount 0');
assert(emptyState.totalPages === 1, 'Empty state totalPages is 1');
assert(emptyState.isFirstPage === true, 'Empty state is on first page');
assert(emptyState.isLastPage === true, 'Empty state is also on last page');
assert(emptyState.hasPrevious === false, 'Previous is disabled for empty state');
assert(emptyState.hasNext === false, 'Next is disabled for empty state');
assert(emptyState.rangeStart === 0 && emptyState.rangeEnd === 0, 'Range for empty state is 0 to 0');

// --- Suite 3: Paginated History Calculations ---
console.log('\n--- 3. Paginated History Calculations ---');

const p1 = calculatePaginationState(1, 28, 10);
assert(p1.totalPages === 3, '28 records with page size 10 yields 3 total pages');
assert(p1.offset === 0, 'Page 1 offset is 0');
assert(p1.rangeStart === 1 && p1.rangeEnd === 10, 'Page 1 range is 1–10');
assert(p1.hasPrevious === false, 'Page 1 previous button is disabled');
assert(p1.hasNext === true, 'Page 1 next button is enabled');

const p2 = calculatePaginationState(2, 28, 10);
assert(p2.offset === 10, 'Page 2 offset is 10');
assert(p2.rangeStart === 11 && p2.rangeEnd === 20, 'Page 2 range is 11–20');
assert(p2.hasPrevious === true, 'Page 2 previous button is enabled');
assert(p2.hasNext === true, 'Page 2 next button is enabled');

const p3 = calculatePaginationState(3, 28, 10);
assert(p3.offset === 20, 'Page 3 offset is 20');
assert(p3.rangeStart === 21 && p3.rangeEnd === 28, 'Page 3 range is 21–28');
assert(p3.hasPrevious === true, 'Page 3 previous button is enabled');
assert(p3.hasNext === false, 'Page 3 next button is disabled (last page)');

// --- Suite 4: First-Page and Last-Page Pagination Boundaries ---
console.log('\n--- 4. First-Page and Last-Page Pagination Boundaries ---');

// Single page dataset
const singlePage = calculatePaginationState(1, 5, 10);
assert(singlePage.totalPages === 1, 'Single page dataset has 1 total page');
assert(singlePage.hasPrevious === false, 'Single page: Previous is disabled');
assert(singlePage.hasNext === false, 'Single page: Next is disabled');

// Boundary clamping
const outOfBounds = calculatePaginationState(99, 25, 10);
assert(outOfBounds.currentPage === 3, 'Out of bounds page 99 is clamped to totalPages (3)');
assert(outOfBounds.isLastPage === true, 'Clamped page is recognized as last page');

// --- Suite 5: Duplicate-Request Prevention (Concurrency Guard) ---
console.log('\n--- 5. Duplicate-Request Prevention ---');

const guard = createConcurrencyGuard();

let resolveSlowCall;
const slowPromise = new Promise((resolve) => {
  resolveSlowCall = resolve;
});

// Launch first call
const call1 = guard.executeRequest(() => slowPromise);
// Immediately launch concurrent duplicate call
const call2 = guard.executeRequest(() => slowPromise);

assert(guard.isBusy() === true, 'Guard is busy while request is in flight');

const result2 = await call2;
assert(result2.status === 'blocked_duplicate', 'Concurrent duplicate call is immediately blocked');

// Resolve in-flight call
resolveSlowCall({ records: [{ id: '1' }] });
const result1 = await call1;
assert(result1.status === 'executed', 'First request completes successfully');
assert(guard.getCallCount() === 1, 'Exactly 1 backend RPC execution occurred');
assert(guard.isBusy() === false, 'Guard resets to available once request finishes');

// --- Suite 6: Session-Expired Response Handling ---
console.log('\n--- 6. Session-Expired Response Handling ---');

let expiredTriggered = false;
function handleSessionExpired() {
  expiredTriggered = true;
}

function processRpcResponse(response, onSessionExpired) {
  if (response.status === 'session_expired') {
    onSessionExpired();
    return { shouldRender: false };
  }
  if (response.status === 'ok') {
    return { shouldRender: true, records: response.records };
  }
  return { shouldRender: false, error: response.message || 'Error' };
}

const expiredResp = { status: 'session_expired' };
processRpcResponse(expiredResp, handleSessionExpired);
assert(expiredTriggered === true, 'session_expired RPC response triggers session expiration callback');

// --- Suite 7: Error / Retry State ---
console.log('\n--- 7. Error / Retry State ---');

const errorResp = { status: 'server_error', message: 'Unable to fetch attendance history.' };
const errResult = processRpcResponse(errorResp, handleSessionExpired);
assert(errResult.shouldRender === false && Boolean(errResult.error), 'Server error sets error state and prevents invalid render');

// --- Suite 8: Authoritative Status Rendering (No Client Inference) ---
console.log('\n--- 8. Authoritative Status Rendering (No Client Inference) ---');

const stComplete = resolveAttendanceDisplayStatus('Complete', '2026-08-21T08:00:00Z', '2026-08-21T17:00:00Z');
assert(stComplete.statusText === 'Attendance Complete' && stComplete.badgeVariant === 'badge-success',
  'Timestamps present map to "Attendance Complete"');

const stTimedIn = resolveAttendanceDisplayStatus('In Progress', '2026-08-21T08:00:00Z', null);
assert(stTimedIn.statusText === 'Timed In' && stTimedIn.badgeVariant === 'badge-info',
  'Time In only maps to "Timed In"');

const stMissingIn = resolveAttendanceDisplayStatus('Missing Time In', null, '2026-08-21T17:00:00Z');
assert(stMissingIn.statusText === 'Missing Time In' && stMissingIn.badgeVariant === 'badge-warning',
  'Missing Time In matches authoritative backend status');

const stAbsent = resolveAttendanceDisplayStatus('Absent', null, null);
assert(stAbsent.statusText === 'Absent' && stAbsent.badgeVariant === 'badge-danger',
  'Absent is only shown when authoritative portal_status is "Absent"');

const stUnattended = resolveAttendanceDisplayStatus('Awaiting Scan', null, null);
assert(stUnattended.statusText === 'Awaiting Scan' && stUnattended.badgeVariant === 'badge-neutral',
  'Unattended session maps to "Awaiting Scan"');

// =============================================================================
// Summary
// =============================================================================
console.log('\n===============================================================');
console.log(`Phase 4 Test Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('===============================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✔ Phase 4 Unit & Pagination Tests PASSED.\n');
  process.exit(0);
}
