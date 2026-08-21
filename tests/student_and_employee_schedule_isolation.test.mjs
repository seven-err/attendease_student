import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

console.log('======================================================================');
console.log('   AttendEase — Student & Employee Schedule Isolation Test Suite      ');
console.log('======================================================================\n');

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
const adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

let passCount = 0;
let failCount = 0;

function assert(condition, title, details = '') {
  if (condition) {
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${title}`);
    if (details) console.log(`   ➜ ${details}`);
    passCount++;
  } else {
    console.error(`\x1b[31m✘ FAIL:\x1b[0m ${title}`);
    if (details) console.error(`   ➜ ${details}`);
    failCount++;
  }
}

// Pure logic mirrors from TodayAttendance.tsx & api.ts
export function extractDepartmentFromPersonNumber(personNumber) {
  if (!personNumber) return null;
  const match = personNumber.match(/^EMP-([A-Za-z0-9]+)-/i);
  return match ? match[1].toUpperCase() : null;
}

export function isDepartmentMatching(sessionDept, userDept) {
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

export function isEmployeeSchedule(record) {
  const textToScan = [
    record.session_title,
    record.session_name,
    record.session_description,
    record.main_session_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    textToScan.includes('employee') ||
    textToScan.includes('faculty') ||
    textToScan.includes('staff attendance') ||
    textToScan.includes('teachers') ||
    textToScan.includes('personnel') ||
    textToScan.includes("founder's  day attendance") ||
    textToScan.includes("founders attendance") ||
    record.session_type === 'employee'
  );
}

export function isStudentSchedule(record) {
  return !isEmployeeSchedule(record);
}

export function isScheduleForAudience(record, role = 'student') {
  if (role === 'employee') {
    return isEmployeeSchedule(record);
  }
  return isStudentSchedule(record);
}

async function runTests() {
  // -------------------------------------------------------------------------
  // 1. Test Department Extraction from Employee IDs
  // -------------------------------------------------------------------------
  console.log('--- 1. Employee Department Extraction ---');
  const testCases = [
    { id: 'EMP-CCS-007', expected: 'CCS' },
    { id: 'EMP-CBE-006', expected: 'CBE' },
    { id: 'EMP-CCJE-002', expected: 'CCJE' },
    { id: 'EMP-CTE-001', expected: 'CTE' },
    { id: 'EMP-ADMIN-015', expected: 'ADMIN' },
    { id: 'EMP-OFFICE-005', expected: 'OFFICE' },
    { id: 'EMP-HS-001', expected: 'HS' },
    { id: 'EMP-ELEM-006', expected: 'ELEM' },
    { id: 'EMP-PSYCH-004', expected: 'PSYCH' },
    { id: '2026-0728', expected: null },
  ];

  for (const tc of testCases) {
    const extracted = extractDepartmentFromPersonNumber(tc.id);
    assert(
      extracted === tc.expected,
      `Extracted department for ${tc.id} -> ${extracted} (Expected: ${tc.expected})`
    );
  }

  // -------------------------------------------------------------------------
  // 2. Test Department Matching Logic
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Department Matching Logic ---');
  assert(isDepartmentMatching('CCS', 'CCS'), 'CCS matches CCS');
  assert(isDepartmentMatching('ccs', 'CCS'), 'Case-insensitive matching (ccs vs CCS)');
  assert(!isDepartmentMatching('CCS', 'CCJE'), 'CCS does not match CCJE');
  assert(isDepartmentMatching(null, 'CCS'), 'Null session department (Institutional) matches any user department');
  assert(isDepartmentMatching('all', 'CTE'), '"all" session department matches CTE');
  assert(isDepartmentMatching('institution', 'PSYCH'), '"institution" session department matches PSYCH');

  // -------------------------------------------------------------------------
  // 3. Test Student vs Employee Schedule Classifier
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Schedule Audience Classification ---');
  const empRecord = {
    session_id: '1',
    session_title: 'Day 3 Evening Attendance',
    main_session_name: "Founder's  Day Attendance",
    session_description: 'Employees Attendance',
  };
  assert(isEmployeeSchedule(empRecord), 'Employee session correctly identified via description & title');
  assert(!isStudentSchedule(empRecord), 'Employee session excluded from student schedule');
  assert(isScheduleForAudience(empRecord, 'employee'), 'Employee schedule matched for employee role');
  assert(!isScheduleForAudience(empRecord, 'student'), 'Employee schedule rejected for student role');

  const studentRecord = {
    session_id: '2',
    session_title: 'Day 9 Practice',
    main_session_name: 'P.E Demo Practice',
    session_description: 'Mandatory Practice',
    department: 'CCS',
    target_year_levels: ['1st Year'],
  };
  assert(isStudentSchedule(studentRecord), 'Student demo practice correctly identified as student schedule');
  assert(!isEmployeeSchedule(studentRecord), 'Student practice excluded from employee schedule');
  assert(isScheduleForAudience(studentRecord, 'student'), 'Student schedule matched for student role');
  assert(!isScheduleForAudience(studentRecord, 'employee'), 'Student schedule rejected for employee role');

  // -------------------------------------------------------------------------
  // 4. End-to-End Database Schedule Isolation Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Real Database Schedule Isolation ---');
  const { data: dbSessions } = await adminClient
    .from('attendance_sessions')
    .select('*, main_sessions(*)')
    .eq('date', '2026-08-21');

  console.log(`Loaded ${dbSessions?.length || 0} active sessions for 2026-08-21 from database:`);
  for (const s of dbSessions || []) {
    console.log(`  • [${s.id}] Title: "${s.title}" | Dept: ${s.department} | Main: "${s.main_sessions?.name}"`);
  }

  // A. CCS Student view:
  const ccsStudentDept = 'CCS';
  const ccsStudentYear = '1st Year';
  const ccsStudentVisible = (dbSessions || []).filter((s) => {
    const rec = {
      session_id: s.id,
      session_title: s.title,
      session_description: s.description,
      main_session_name: s.main_sessions?.name,
      department: s.department,
      target_year_levels: s.target_year_levels,
    };
    if (!isScheduleForAudience(rec, 'student')) return false;
    if (!isDepartmentMatching(rec.department, ccsStudentDept)) return false;
    if (rec.target_year_levels && rec.target_year_levels.length > 0) {
      if (!rec.target_year_levels.includes(ccsStudentYear)) return false;
    }
    return true;
  });

  assert(
    ccsStudentVisible.length > 0,
    `CCS Student sees intended CCS student session(s) (${ccsStudentVisible.length} found)`
  );
  assert(
    ccsStudentVisible.every((s) => s.department === 'CCS' || s.department === null),
    'All sessions shown to CCS Student belong to CCS or are Institutional'
  );
  assert(
    !ccsStudentVisible.some((s) => s.main_sessions?.name?.includes("Founder's  Day Attendance")),
    'CCS Student does NOT see Employee Founder\'s Day Attendance'
  );
  assert(
    !ccsStudentVisible.some((s) => s.department === 'CCJE' || s.department === 'PSYCH'),
    'CCS Student does NOT see CCJE or PSYCH department sessions'
  );

  // B. Employee view:
  const empDept = 'CCS';
  const empVisible = (dbSessions || []).filter((s) => {
    const rec = {
      session_id: s.id,
      session_title: s.title,
      session_description: s.description,
      main_session_name: s.main_sessions?.name,
      department: s.department,
    };
    if (!isScheduleForAudience(rec, 'employee')) return false;
    if (!isDepartmentMatching(rec.department, empDept)) return false;
    return true;
  });

  assert(
    empVisible.length > 0,
    `Employee sees intended Employee session(s) (${empVisible.length} found: ${empVisible.map((s) => s.title).join(', ')})`
  );
  assert(
    empVisible.every((s) => isEmployeeSchedule({
      session_id: s.id,
      session_title: s.title,
      session_description: s.description,
      main_session_name: s.main_sessions?.name,
    })),
    'All sessions shown to Employee are verified Employee sessions'
  );
  assert(
    !empVisible.some((s) => s.title?.includes('Foundation Day - Day 3 (Students)') || s.title?.includes('Practice')),
    'Employee does NOT see student foundation or practice sessions'
  );

  // -------------------------------------------------------------------------
  // 5. Verification Summary
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`Isolation Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================================');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
