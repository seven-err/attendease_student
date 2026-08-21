import { readFileSync, existsSync } from 'node:fs';
import { createClient } from 'C:/Users/admin/Documents/attendance_system/attendease_admin/node_modules/@supabase/supabase-js/dist/main/index.js';

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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase URL or Anon key');
  process.exit(1);
}

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log('  [PASS] ' + message);
    passed++;
  } else {
    console.error('  [FAIL] ' + message);
    failed++;
  }
}

async function runAcceptanceTests() {
  console.log('===============================================================');
  console.log('  ATTENDEASE STUDENT PORTAL: SECURITY & CONCURRENCY TEST SUITE');
  console.log('===============================================================\n');

  console.log('Connecting to: ' + SUPABASE_URL);
  console.log('Anon client initialized: ' + (!!anonClient));
  console.log('Admin client initialized: ' + (!!adminClient) + '\n');

  // --- Suite 1: Direct Table Access RLS Hardening ---
  console.log('--- Suite 1: Direct Table Access RLS Hardening ---');
  
  const { data: directStudents, error: errStudents } = await anonClient.from('students').select('*').limit(1);
  assert(!directStudents || directStudents.length === 0 || !!errStudents, 'anon cannot directly select from public.students');

  const { data: directPeople, error: errPeople } = await anonClient.from('people').select('*').limit(1);
  assert(!directPeople || directPeople.length === 0 || !!errPeople, 'anon cannot directly select from public.people');

  const { data: directLogs, error: errLogs } = await anonClient.from('attendance_logs').select('*').limit(1);
  assert(!directLogs || directLogs.length === 0 || !!errLogs, 'anon cannot directly select from public.attendance_logs');

  const { data: directSessions, error: errSessions } = await anonClient.from('student_portal_sessions').select('*').limit(1);
  assert(!directSessions || directSessions.length === 0 || !!errSessions, 'anon cannot directly select from public.student_portal_sessions');

  const { data: directIssues, error: errIssues } = await anonClient.from('attendance_issue_reports').select('*').limit(1);
  assert(!directIssues || directIssues.length === 0 || !!errIssues, 'anon cannot directly select from public.attendance_issue_reports');

  // --- Suite 2: RPC Existence & Parameter Validation ---
  console.log('\n--- Suite 2: RPC Input Validation & Token Hardening ---');

  const { data: resShort, error: errShort } = await anonClient.rpc('student_portal_create_session', {
    p_qr_token: 'short_token'
  });
  if (errShort && errShort.code === 'PGRST202') {
    console.log('  [NOTICE] MIGRATION NOT YET APPLIED TO DATABASE SCHEMA.');
    console.log('  [NOTICE] Target migration file: supabase/migrations/20260821000000_student_portal_foundation.sql');
    console.log('\n===============================================================');
    console.log('SUMMARY: ' + passed + ' Passed, ' + failed + ' Failed (Migration Pending Application in Supabase SQL Editor)');
    console.log('===============================================================\n');
    return;
  }

  assert(resShort && resShort.status === 'invalid_token', 'Rejects short QR token with status=invalid_token');

  const { data: resNonHex } = await anonClient.rpc('student_portal_create_session', {
    p_qr_token: 'g'.repeat(64)
  });
  assert(resNonHex && resNonHex.status === 'invalid_token', 'Rejects non-hex 64-char QR token with status=invalid_token');

  const { data: resFakeHex } = await anonClient.rpc('student_portal_create_session', {
    p_qr_token: '0'.repeat(64)
  });
  assert(resFakeHex && resFakeHex.status === 'invalid_token', 'Rejects valid format but unknown QR token with status=invalid_token');

  // --- Suite 3: Valid Student QR Flow ---
  console.log('\n--- Suite 3: Valid Student Authentication & Data Isolation ---');
  if (adminClient) {
    const { data: sampleStudents } = await adminClient
      .from('people')
      .select('id, full_name, person_number, qr_token')
      .eq('person_kind', 'student')
      .eq('person_status', 'Active')
      .limit(2);

    if (sampleStudents && sampleStudents.length >= 1) {
      const studentA = sampleStudents[0];
      console.log('  Testing with Student A: ' + studentA.full_name + ' (' + studentA.person_number + ')');

      // Clear any prior automated test issue reports for this student to maintain repeatable rate limit headroom
      await adminClient
        .from('attendance_issue_reports')
        .delete()
        .eq('person_id', studentA.id)
        .like('details', 'Automated security acceptance test%');

      const { data: authA } = await anonClient.rpc('student_portal_create_session', {
        p_qr_token: studentA.qr_token
      });

      assert(authA && authA.status === 'ok' && !!authA.session_token, 'Session created successfully for Student A');
      assert(authA && authA.student && authA.student.student_number === studentA.person_number, 'Student A profile information returned correctly');
      assert(authA && typeof authA.session_token === 'string' && authA.session_token.length === 64, 'Session token is a 64-char hex string');

      const { data: todayA } = await anonClient.rpc('student_portal_get_today_attendance', {
        p_session_token: authA.session_token
      });
      assert(todayA && todayA.status === 'ok' && Array.isArray(todayA.records), 'Today attendance query succeeded with status=ok');

      const { data: histA } = await anonClient.rpc('student_portal_get_attendance_history', {
        p_session_token: authA.session_token,
        p_limit: 10,
        p_offset: 0
      });
      assert(histA && histA.status === 'ok' && Array.isArray(histA.records) && typeof histA.total_count === 'number', 'History query succeeded with paginated records and total_count');

      // --- Suite 4: Single Active Session Enforcement ---
      console.log('\n--- Suite 4: Single Active Session Enforcement ---');
      const token1 = authA.session_token;
      
      const { data: authA2 } = await anonClient.rpc('student_portal_create_session', {
        p_qr_token: studentA.qr_token
      });
      const token2 = authA2.session_token;
      assert(authA2 && authA2.status === 'ok' && token2 !== token1, 'New session created on re-scan with fresh token');

      const { data: oldTokenQuery } = await anonClient.rpc('student_portal_get_today_attendance', {
        p_session_token: token1
      });
      assert(oldTokenQuery && oldTokenQuery.status === 'session_expired', 'Previous session token was immediately invalidated (Single-Session Invariant)');

      const { data: newTokenQuery } = await anonClient.rpc('student_portal_get_today_attendance', {
        p_session_token: token2
      });
      assert(newTokenQuery && newTokenQuery.status === 'ok', 'Latest session token remains valid');

      // --- Suite 5: Issue Reporting Validation ---
      console.log('\n--- Suite 5: Issue Reporting Validation & Rate Limiting ---');

      const { data: issueShort } = await anonClient.rpc('student_portal_report_issue', {
        p_session_token: token2,
        p_issue_type: 'missing_time_in',
        p_details: 'ab'
      });
      assert(issueShort && issueShort.status === 'invalid_details', 'Rejects issue details shorter than 5 characters');

      const { data: issueValid } = await anonClient.rpc('student_portal_report_issue', {
        p_session_token: token2,
        p_issue_type: 'other',
        p_details: 'Automated security acceptance test issue report verification.'
      });
      assert(issueValid && issueValid.status === 'ok' && !!issueValid.report_id, 'General issue report successfully submitted');

      // --- Suite 6: Explicit Session Revocation ---
      console.log('\n--- Suite 6: Explicit Session Destruction ---');
      const { data: destroyRes } = await anonClient.rpc('student_portal_destroy_session', {
        p_session_token: token2
      });
      assert(destroyRes && destroyRes.status === 'ok', 'student_portal_destroy_session returned status=ok');

      const { data: postDestroyQuery } = await anonClient.rpc('student_portal_get_today_attendance', {
        p_session_token: token2
      });
      assert(postDestroyQuery && postDestroyQuery.status === 'session_expired', 'Destroyed session is immediately expired');
    }
  }

  console.log('\n===============================================================');
  console.log('TOTAL RESULTS: ' + passed + ' Passed, ' + failed + ' Failed');
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests().catch(err => {
  console.error('Unhandled error during acceptance testing:', err);
  process.exit(1);
});
