/**
 * AttendEase Student PWA — Phase 3 Unit & State Mapping Tests
 */

console.log('===============================================================');
console.log('   AttendEase Student PWA — Phase 3 Unit & State Mapping Test  ');
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

// 1. Date Header Formatting Logic
export function formatTodayHeaderDate(dateString) {
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

// 2. Format Attendance Time Logic
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

// 3. Authoritative Status Determination Logic
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

// --- Test Suite 1: Date and Time Formatting ---
console.log('\n--- 1. Date and Time Formatting ---');

const dateStr = formatTodayHeaderDate('2026-08-21');
assert(dateStr === 'Friday, August 21', `formatTodayHeaderDate('2026-08-21') returns "Friday, August 21" (got: "${dateStr}")`);

const time1 = formatAttendanceTime('2026-08-21T08:02:00+08:00');
assert(time1 && (time1 === '8:02 AM' || time1.includes('8:02')), `formatAttendanceTime('2026-08-21T08:02:00+08:00') returns 12-hour formatted time (got: "${time1}")`);

const time2 = formatAttendanceTime('2026-08-21T17:01:00+08:00');
assert(time2 && (time2 === '5:01 PM' || time2.includes('5:01')), `formatAttendanceTime('2026-08-21T17:01:00+08:00') returns 12-hour formatted time (got: "${time2}")`);

assert(formatAttendanceTime(null) === null, 'formatAttendanceTime(null) returns null');
assert(formatAttendanceTime(undefined) === null, 'formatAttendanceTime(undefined) returns null');
assert(formatAttendanceTime('invalid_timestamp') === null, 'formatAttendanceTime("invalid") returns null');

// --- Test Suite 2: Authoritative Backend State Mapping ---
console.log('\n--- 2. Authoritative Backend State Mapping (No Client Invention) ---');

// Complete State
const stateComplete = resolveAttendanceDisplayStatus(
  'Complete',
  '2026-08-21T08:02:00+08:00',
  '2026-08-21T17:01:00+08:00'
);
assert(stateComplete.statusText === 'Attendance Complete' && stateComplete.badgeVariant === 'badge-success',
  'Complete attendance maps to "Attendance Complete" badge');

// Timed In Only State
const stateTimedIn = resolveAttendanceDisplayStatus(
  'In Progress',
  '2026-08-21T08:02:00+08:00',
  null
);
assert(stateTimedIn.statusText === 'Timed In' && stateTimedIn.badgeVariant === 'badge-info',
  'Time In only maps to "Timed In" badge');

// Awaiting Scan State (Unattended today session)
const stateAwaiting = resolveAttendanceDisplayStatus(
  'Awaiting Scan',
  null,
  null
);
assert(stateAwaiting.statusText === 'Awaiting Scan' && stateAwaiting.badgeVariant === 'badge-neutral',
  'Unattended open session maps strictly to backend "Awaiting Scan"');

// Missing Time In State
const stateMissingIn = resolveAttendanceDisplayStatus(
  'Missing Time In',
  null,
  '2026-08-21T17:01:00+08:00'
);
assert(stateMissingIn.statusText === 'Missing Time In' && stateMissingIn.badgeVariant === 'badge-warning',
  'Missing Time In maps strictly to backend "Missing Time In" status');

// Absent State (Backend marked)
const stateAbsent = resolveAttendanceDisplayStatus(
  'Absent',
  null,
  null
);
assert(stateAbsent.statusText === 'Absent' && stateAbsent.badgeVariant === 'badge-danger',
  'Absent status is only rendered when backend explicitly specifies portal_status: "Absent"');

// 4. Department Scope Matching Logic
export function isDepartmentMatching(sessionDept, studentDept) {
  if (!sessionDept || sessionDept.trim() === '' || sessionDept.trim().toLowerCase() === 'all') {
    return true; // Institutional / All-department session
  }
  if (!studentDept || studentDept.trim() === '') {
    return false;
  }
  const cleanSession = sessionDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanStudent = studentDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleanSession === cleanStudent;
}

// --- Test Suite 3: Department-Specific Schedule Scoping ---
console.log('\n--- 3. Department-Specific Schedule Scoping ---');

assert(isDepartmentMatching('CCS', 'CCS') === true, 'Matches same department (CCS === CCS)');
assert(isDepartmentMatching('ccs', 'CCS') === true, 'Matches case-insensitively (ccs === CCS)');
assert(isDepartmentMatching('BSIT', 'BSIT') === true, 'Matches program/dept codes (BSIT === BSIT)');
assert(isDepartmentMatching(null, 'CCS') === true, 'Institutional/All-campus session (dept: null) matches any student department');
// 5. Student vs Employee Schedule Filtering Logic
export function isStudentSchedule(record) {
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

// --- Test Suite 4: Student vs. Employee Schedule Isolation ---
console.log('\n--- 4. Student vs. Employee Schedule Isolation ---');

const studentRecord1 = {
  session_title: 'Day 4 - Afternoon Practice',
  main_session_name: 'P.E Demo Practice',
  session_description: 'Mandatory Practice',
  department: 'CCS'
};
assert(isStudentSchedule(studentRecord1) === true, 'Student practice session is allowed');

const studentRecord2 = {
  session_title: 'Mass Dance Practice Day 1',
  main_session_name: 'Mass Dance Practice',
  session_description: null,
  department: 'CCS'
};
assert(isStudentSchedule(studentRecord2) === true, 'General student activity session is allowed');

const employeeRecord1 = {
  session_title: 'Day 4 Attendance',
  main_session_name: "Founder's Day Attendance",
  session_description: 'Employees Attendance',
  department: null
};
assert(isStudentSchedule(employeeRecord1) === false, 'Employee Attendance session (in description) is strictly filtered out');

const employeeRecord2 = {
  session_title: 'Faculty & Staff General Assembly',
  main_session_name: null,
  session_description: null,
  department: null
};
assert(isStudentSchedule(employeeRecord2) === false, 'Faculty meeting session (in title) is strictly filtered out');

const employeeRecord3 = {
  session_title: 'Day 1 Attendance',
  main_session_name: 'Employees Attendance',
  session_description: null,
  department: null
};
assert(isStudentSchedule(employeeRecord3) === false, 'Employee attendance (in main session name) is strictly filtered out');

// Summary
console.log('===============================================================');
console.log(`Unit Test Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('===============================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✔ Phase 3 Unit & State Mapping Tests PASSED.\n');
  process.exit(0);
}
