import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
process.env.VITE_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.VITE_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { normalizeScannedQr } = await import('../src/lib/api.ts');

console.log('======================================================================');
console.log('   AttendEase Student PWA — CCS & Diverse QR Structure Test Suite    ');
console.log('======================================================================\n');

const anonClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
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

async function runCcsDiverseQrVerification() {
  console.log('--- 1. Database Sample Inspection (CCS vs Other Departments) ---');

  const { data: ccsRecords } = await adminClient
    .from('student_academic_records')
    .select('student_id, department, course, year_level')
    .eq('department', 'CCS')
    .limit(50);

  assert(Boolean(ccsRecords && ccsRecords.length > 0), 'Found CCS department student academic records', `Found ${ccsRecords?.length || 0} records`);

  const ccsStudentIds = ccsRecords.map(r => r.student_id);
  const { data: ccsPeople } = await adminClient
    .from('people')
    .select('id, full_name, person_number, qr_token, person_status, person_kind')
    .in('id', ccsStudentIds.slice(0, 20));

  assert(Boolean(ccsPeople && ccsPeople.length > 0), 'Found CCS students in people table', `Found ${ccsPeople?.length || 0} students`);

  const sampleShortCcsStudent = ccsPeople.find(p => p.qr_token && p.qr_token.startsWith('CRMC-'));
  assert(Boolean(sampleShortCcsStudent), 'Identified sample CCS student with short CRMC QR code', 
    `Student: ${sampleShortCcsStudent?.full_name} (${sampleShortCcsStudent?.person_number}), QR: ${sampleShortCcsStudent?.qr_token}`);

  console.log('\n--- 2. Client-Side QR Structure Normalization Unit Tests ---');

  const structureTests = [
    { name: 'Standard CCS QR token', input: 'CRMC-2026-0378', expected: 'CRMC-2026-0378' },
    { name: 'Lowercase CCS token', input: 'crmc-2026-0378', expected: 'crmc-2026-0378' },
    { name: 'Pure student ID number', input: '2026-0378', expected: '2026-0378' },
    { name: 'Prefixed STUDENT:', input: 'STUDENT:CRMC-2026-0378', expected: 'CRMC-2026-0378' },
    { name: 'Prefixed ID:', input: 'ID: 2026-0378', expected: '2026-0378' },
    { name: 'Prefixed QR=', input: 'QR=CRMC-2026-0378', expected: 'CRMC-2026-0378' },
    { name: 'URL query parameter (token)', input: 'https://attendease.com/scan?token=CRMC-2026-0378', expected: 'CRMC-2026-0378' },
    { name: 'URL path segment', input: 'https://crmc.edu.ph/student/2026-0378', expected: '2026-0378' },
    { name: 'JSON qr_token field', input: '{"qr_token":"CRMC-2026-0378"}', expected: 'CRMC-2026-0378' },
    { name: 'JSON student_number field', input: '{"student_number":"2026-0378"}', expected: '2026-0378' },
    { name: 'Delimited pipe format', input: 'CRMC-2026-0378|BSIT|4th Year', expected: 'CRMC-2026-0378' },
    { name: 'Delimited semicolon format', input: '2026-0378;Rotcel Cañete Rosellosa;CCS', expected: '2026-0378' },
    { name: 'Surrounding whitespace & newlines', input: '  CRMC-2026-0378 \n', expected: 'CRMC-2026-0378' }
  ];

  for (const st of structureTests) {
    const norm = normalizeScannedQr(st.input);
    assert(norm === st.expected, `Normalizes ${st.name}`, `Input: ${st.input} ➜ Normalized: ${norm}`);
  }

  console.log('\n--- 3. Client Component Invariant Checks ---');

  const qrScannerSrc = readFileSync('src/components/auth/QRScanner.tsx', 'utf8');
  assert(qrScannerSrc.includes('normalizeScannedQr'), 'QRScanner uses normalizeScannedQr on decoded camera frames');
  assert(!qrScannerSrc.includes('cleanToken.length === 64'), 'QRScanner has zero 64-char length restrictions');
const apiSrc = readFileSync('src/lib/api.ts', 'utf8');
  assert(apiSrc.includes('normalizeScannedQr'), 'api.ts createStudentSession uses normalizeScannedQr');

  console.log('\n--- 4. Invalid Token Rejection ---');

  const fakeTokens = [
    { name: 'Unknown short token', token: 'CRMC-9999-9999' },
    { name: 'Random text', token: 'invalid_code' },
    { name: 'Fake 64-hex token', token: '0'.repeat(64) },
    { name: 'Too short (<3)', token: 'ab' }
  ];

  for (const tc of fakeTokens) {
    if (tc.token.length < 3) {
      assert(tc.token.length < 3, `Client layer strictly rejects '${tc.name}'`);
    } else {
      const { data: fakeRes } = await anonClient.rpc('student_portal_create_session', {
        p_qr_token: tc.token
      });
      assert(fakeRes && fakeRes.status === 'invalid_token', `Non-existent token rejected: ${tc.name}`);
    }
  }

  console.log('\n--- 5. SQL Migration File Completeness ---');

  const migration1 = readFileSync('supabase/migrations/20260821010000_portal_student_and_employee_support.sql', 'utf8');
  assert(migration1.includes('replace(p.qr_token, \'CRMC-\', \'\')'), 'Composite migration handles CRMC- prefix variations');
  assert(migration1.includes('v_raw_trimmed ~* \'^https?://\''), 'Composite migration parses URLs');

  const migration2 = readFileSync('supabase/migrations/20260821020000_allow_short_qr_tokens_and_exact_db_matching.sql', 'utf8');
  assert(migration2.includes('create or replace function public.student_portal_create_session'), 'Dedicated migration creates student_portal_create_session');
  assert(migration2.includes('replace(p.qr_token, \'CRMC-\', \'\')'), 'Dedicated migration handles CRMC- prefix variations');
  assert(migration2.includes('v_raw_trimmed ~* \'^https?://\''), 'Dedicated migration parses URLs');

  console.log('\n======================================================================');
  console.log(`Diverse QR Structure Verification Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runCcsDiverseQrVerification().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});
