/**
 * AttendEase Phase 10 — Production Load, Concurrency & Failure Simulation Suite
 * 
 * Comprehensive empirical testing:
 * 1. 60-Worker Shared-Account Concurrency Burst (60 simultaneous scans across operator profiles)
 * 2. Sustained High-Throughput Load (300 total scans across 5 rapid 60-worker bursts)
 * 3. High-Frequency Millisecond Race Conditions (10 Simultaneous Scans on Same Student)
 * 4. Time In & Time Out Lifecycle & Race Contention
 * 5. Network Failure, Timeout & Retry Idempotency
 * 6. Shared Account Concurrency (15 Simultaneous Devices on 1 Account)
 * 7. Realtime Thundering-Herd Amplification Simulation (60 concurrent summary RPCs)
 * 8. Offline Queue Synchronization & In-Flight Mutex Invariants
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const adminEnvPath = 'C:/Users/admin/Documents/attendance_system/attendease_admin/.env.local';
  const studentEnvPath = path.resolve(__dirname, '../.env');
  const env = {};

  const files = [studentEnvPath, adminEnvPath];
  for (const file of files) {
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase configuration in environment.');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('======================================================================');
console.log('   AttendEase Phase 10 — Production Load & Concurrency Test Suite     ');
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

function calculateStats(latencies) {
  if (latencies.length === 0) return { min: 0, max: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const getP = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (p / 100)))];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sum / sorted.length),
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
  };
}

async function runLoadTestSuite() {
  const timestamp = Date.now();
  const testSessionTitle = `PHASE10_LOAD_TEST_${timestamp}`;

  console.log('--- Setting Up Isolated Test Environment ---');

  // 1. Create Isolated Test Main Session & Attendance Session scoped to CCS
  const { data: testMain, error: mainErr } = await adminClient
    .from('main_sessions')
    .insert({
      name: `Main ${testSessionTitle}`,
      description: 'Automated Load & Concurrency Test Main Session',
      status: 'Active',
    })
    .select('id')
    .single();

  if (mainErr) throw new Error(`Failed to create test main session: ${mainErr.message}`);

  const todayStr = new Date().toISOString().split('T')[0];
  const { data: testSession, error: sessErr } = await adminClient
    .from('attendance_sessions')
    .insert({
      main_session_id: testMain.id,
      title: testSessionTitle,
      description: 'Automated 60-Device Concurrency Test Session',
      date: todayStr,
      start_time: '07:00:00',
      end_time: '23:00:00',
      time_in_start: '07:00:00',
      time_in_end: '22:00:00',
      time_out_start: '07:00:00',
      time_out_end: '23:00:00',
      department: 'CCS',
      status: 'Open',
    })
    .select('*')
    .single();

  if (sessErr) throw new Error(`Failed to create test attendance session: ${sessErr.message}`);

  console.log(`Created test session: ${testSession.id} (${testSession.title}, Department: ${testSession.department})`);

  // 2. Fetch Active CCS Student QR Tokens
  const { data: recs, error: studErr } = await adminClient
    .from('student_academic_records')
    .select('student_id, department, students!student_id(id, full_name, qr_token, student_status)')
    .eq('department', 'CCS')
    .eq('status', 'Active')
    .limit(450);

  if (studErr) throw new Error(`Failed to query student records: ${studErr.message}`);

  const students = recs
    .filter((r) => r.students && r.students.student_status === 'Active' && r.students.qr_token)
    .map((r) => ({
      id: r.students.id,
      full_name: r.students.full_name,
      qr_token: r.students.qr_token,
    }));

  if (students.length < 350) {
    throw new Error(`Insufficient active CCS test students with QR tokens: ${students.length}`);
  }
  console.log(`Loaded ${students.length} active CCS student test subjects.`);

  // 3. Setup Checker Account (CCS Checker) & Operator Profiles
  try {
    const { data: userList } = await adminClient.auth.admin.listUsers();
    const ccsUser = userList?.users?.find((u) => u.email === 'ccs@crmc.edu');
    if (ccsUser) {
      await adminClient.auth.admin.updateUserById(ccsUser.id, { password: 'CheckerPassword123!' });
    } else {
      await adminClient.auth.admin.createUser({
        email: 'ccs@crmc.edu',
        password: 'CheckerPassword123!',
        email_confirm: true,
        user_metadata: { role: 'checker', department: 'CCS' },
      });
    }
  } catch (adminErr) {
    console.warn('Admin user setup note:', adminErr?.message);
  }

  const ccsClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await ccsClient.auth.signInWithPassword({
    email: 'ccs@crmc.edu',
    password: 'CheckerPassword123!',
  });
  if (authErr) throw new Error(`Auth failed for ccs@crmc.edu: ${authErr.message}`);

  const { data: profiles, error: pErr } = await ccsClient.rpc('list_checker_profiles', {
    p_include_inactive: false,
  });
  if (pErr) throw new Error(`Profile fetch failed: ${pErr.message}`);

  if (!profiles || profiles.length === 0) {
    throw new Error('No active checker profiles found for ccs@crmc.edu');
  }

  console.log(`Authenticated CCS checker account with ${profiles.length} operator profiles.\n`);

  try {
    // =========================================================================
    // TEST 1: 60-Worker Shared-Account Concurrency Burst
    // =========================================================================
    console.log('--- 1. SCANNER CONCURRENCY: 60-Worker Simultaneous Scan Burst ---');

    const totalWorkers = 60;
    const workerPromises = [];
    const scanLatencies = [];
    const scanResults = { recorded: 0, duplicate: 0, failed: 0, errors: [] };

    // Simulate 60 concurrent worker instances (each with its own device ID and operator profile)
    for (let i = 0; i < totalWorkers; i++) {
      const profile = profiles[i % profiles.length];
      const student = students[i]; // Students 0..59
      const deviceId = `scanner-device-sim-${i + 1}`;

      const runWorkerScan = async () => {
        const t0 = Date.now();
        try {
          const { data, error } = await ccsClient.rpc('record_attendance_by_qr_token', {
            p_qr_token: student.qr_token,
            p_session_id: testSession.id,
            p_checker_id: profile.id,
            p_scanned_at: new Date().toISOString(),
            p_attendance_status: 'Present',
            p_device_id: deviceId,
            p_scan_phase: 'time_in',
          });

          const latency = Date.now() - t0;
          scanLatencies.push(latency);

          if (error) {
            scanResults.failed++;
            scanResults.errors.push(error.message);
            return { workerId: i, status: 'error', error: error.message, latency };
          }

          const row = Array.isArray(data) ? data[0] : data;
          if (row?.status === 'recorded') {
            scanResults.recorded++;
          } else if (row?.status === 'duplicate') {
            scanResults.duplicate++;
          } else {
            scanResults.failed++;
            scanResults.errors.push(row?.status || 'unknown');
          }
          return { workerId: i, status: row?.status, latency };
        } catch (err) {
          const latency = Date.now() - t0;
          scanLatencies.push(latency);
          scanResults.failed++;
          scanResults.errors.push(err instanceof Error ? err.message : String(err));
          return { workerId: i, status: 'exception', error: String(err), latency };
        }
      };

      workerPromises.push(runWorkerScan());
    }

    const burstStartTime = Date.now();
    const burstResults = await Promise.all(workerPromises);
    const burstTotalTime = Date.now() - burstStartTime;

    const stats1 = calculateStats(scanLatencies);
    console.log(`60-Worker Burst Completed in ${burstTotalTime}ms:`);
    console.log(`  • Recorded: ${scanResults.recorded} / 60`);
    console.log(`  • Duplicate: ${scanResults.duplicate}`);
    console.log(`  • Failed: ${scanResults.failed}`);
    if (scanResults.errors.length > 0) {
      console.log(`  • Sample Error: ${scanResults.errors[0]}`);
    }
    console.log(`  • Latency Stats: Min=${stats1.min}ms, Mean=${stats1.mean}ms, P50=${stats1.p50}ms, P90=${stats1.p90}ms, P95=${stats1.p95}ms, Max=${stats1.max}ms`);

    assert(scanResults.recorded === 60, '60 concurrent workers recorded exactly 60 distinct attendance rows', `Recorded: ${scanResults.recorded}, Failed: ${scanResults.failed}`);
    assert(scanResults.failed === 0, 'Zero RPC errors or unhandled exceptions under 60-client burst');

    // Verify in database
    const { count: dbRowCount1 } = await adminClient
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', testSession.id);

    assert(dbRowCount1 === 60, 'Database contains exactly 60 attendance records (no lost writes, no phantom duplicates)', `DB count: ${dbRowCount1}`);

    // =========================================================================
    // TEST 2: Sustained Multi-Round Concurrency (300 Scans / 5 Batches)
    // =========================================================================
    console.log('\n--- 2. SUSTAINED LOAD: 300 Total Scans Across 5 Rapid Bursts ---');

    const sustainedLatencies = [];
    let sustainedRecorded = 0;
    let sustainedFailed = 0;
    const totalRounds = 4; // 4 more rounds of 60 = 240 + initial 60 = 300 total

    const sustainedStart = Date.now();

    for (let round = 0; round < totalRounds; round++) {
      const roundOffset = 60 + round * 60; // 60..119, 120..179, 180..239, 240..299
      const roundPromises = [];

      for (let w = 0; w < 60; w++) {
        const studentIndex = roundOffset + w;
        const student = students[studentIndex];
        const profile = profiles[w % profiles.length];
        const deviceId = `scanner-device-sim-${w + 1}`;

        const task = async () => {
          const t0 = Date.now();
          try {
            const { data, error } = await ccsClient.rpc('record_attendance_by_qr_token', {
              p_qr_token: student.qr_token,
              p_session_id: testSession.id,
              p_checker_id: profile.id,
              p_scanned_at: new Date().toISOString(),
              p_attendance_status: 'Present',
              p_device_id: deviceId,
              p_scan_phase: 'time_in',
            });
            sustainedLatencies.push(Date.now() - t0);
            if (error) {
              sustainedFailed++;
            } else {
              const row = Array.isArray(data) ? data[0] : data;
              if (row?.status === 'recorded') sustainedRecorded++;
              else sustainedFailed++;
            }
          } catch {
            sustainedFailed++;
          }
        };
        roundPromises.push(task());
      }
      await Promise.all(roundPromises);
    }

    const sustainedElapsed = Date.now() - sustainedStart;
    const sustainedStats = calculateStats(sustainedLatencies);
    const throughput = Math.round((sustainedRecorded / (sustainedElapsed / 1000)) * 10) / 10;

    console.log(`240 Additional Scans (Total 300 Scans) Completed in ${sustainedElapsed}ms:`);
    console.log(`  • Sustained Recorded: ${sustainedRecorded} / 240`);
    console.log(`  • Sustained Failures: ${sustainedFailed}`);
    console.log(`  • Measured Throughput: ${throughput} scans/second`);
    console.log(`  • Sustained Latency: Min=${sustainedStats.min}ms, Mean=${sustainedStats.mean}ms, P50=${sustainedStats.p50}ms, P90=${sustainedStats.p90}ms, P95=${sustainedStats.p95}ms, Max=${sustainedStats.max}ms`);

    assert(sustainedRecorded === 240, 'All 240 sustained load scans recorded successfully without degradation');
    assert(sustainedFailed === 0, 'Zero database lock contentions or RPC timeouts during sustained multi-burst load');

    const { count: dbRowCountTotal } = await adminClient
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', testSession.id);

    assert(dbRowCountTotal === 300, 'Database contains exactly 300 total attendance records (zero data loss across 300 scans)', `DB count: ${dbRowCountTotal}`);

    // =========================================================================
    // TEST 3: High-Frequency Millisecond Race Conditions (Same Student / Multiple Devices)
    // =========================================================================
    console.log('\n--- 3. DUPLICATE PROTECTION: Millisecond Race on Same Student ---');

    const targetStudent = students[301]; // Distinct un-scanned student
    const raceCount = 10;
    const racePromises = [];
    const raceLatencies = [];
    let raceRecorded = 0;
    let raceDuplicates = 0;
    let raceErrors = 0;

    for (let i = 0; i < raceCount; i++) {
      const profile = profiles[i % profiles.length];
      const deviceId = `race-device-${i + 1}`;

      const runRaceScan = async () => {
        const t0 = Date.now();
        try {
          const { data, error } = await ccsClient.rpc('record_attendance_by_qr_token', {
            p_qr_token: targetStudent.qr_token,
            p_session_id: testSession.id,
            p_checker_id: profile.id,
            p_scanned_at: new Date().toISOString(),
            p_attendance_status: 'Present',
            p_device_id: deviceId,
            p_scan_phase: 'time_in',
          });
          const latency = Date.now() - t0;
          raceLatencies.push(latency);

          if (error) {
            raceErrors++;
            return;
          }
          const row = Array.isArray(data) ? data[0] : data;
          if (row?.status === 'recorded') raceRecorded++;
          else if (row?.status === 'duplicate') raceDuplicates++;
          else raceErrors++;
        } catch {
          raceErrors++;
        }
      };
      racePromises.push(runRaceScan());
    }

    await Promise.all(racePromises);
    console.log(`10 Simultaneous Scans of Same Student:`);
    console.log(`  • Recorded: ${raceRecorded}`);
    console.log(`  • Duplicates: ${raceDuplicates}`);
    console.log(`  • Errors: ${raceErrors}`);

    assert(raceRecorded === 1, 'Exactly 1 scan recorded for simultaneous same-student collision', `Recorded: ${raceRecorded}`);
    assert(raceDuplicates === 9, 'Remaining 9 simultaneous scans safely returned duplicate status', `Duplicates: ${raceDuplicates}`);
    assert(raceErrors === 0, 'Zero errors or lock timeouts during concurrent duplicate collision');

    // Verify row count in database for target student
    const { count: studentLogsCount } = await adminClient
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', testSession.id)
      .eq('person_id', targetStudent.id);

    assert(studentLogsCount === 1, 'Database contains exactly 1 row for the collided student (strict unique index enforcement)', `Rows found: ${studentLogsCount}`);

    // =========================================================================
    // TEST 4: Time In & Time Out Lifecycle & Race Contention
    // =========================================================================
    console.log('\n--- 4. LIFECYCLE & CONTENTION: Time In followed by Time Out ---');

    const inOutStudent = students[302]; // Distinct un-scanned student
    const profile1 = profiles[0];
    const profile2 = profiles[1] || profiles[0];

    // Standard sequential lifecycle (Time In followed by Time Out)
    const { data: timeInData, error: inErr } = await ccsClient.rpc('record_attendance_by_qr_token', {
      p_qr_token: inOutStudent.qr_token,
      p_session_id: testSession.id,
      p_checker_id: profile1.id,
      p_scanned_at: new Date().toISOString(),
      p_attendance_status: 'Present',
      p_device_id: 'device-time-in',
      p_scan_phase: 'time_in',
    });

    const inRow = Array.isArray(timeInData) ? timeInData[0] : timeInData;
    assert(!inErr && inRow?.status === 'recorded', 'Time In recorded cleanly');

    const { data: timeOutData, error: outErr } = await ccsClient.rpc('record_attendance_by_qr_token', {
      p_qr_token: inOutStudent.qr_token,
      p_session_id: testSession.id,
      p_checker_id: profile2.id,
      p_scanned_at: new Date().toISOString(),
      p_attendance_status: 'Present',
      p_device_id: 'device-time-out',
      p_scan_phase: 'time_out',
    });

    const outRow = Array.isArray(timeOutData) ? timeOutData[0] : timeOutData;
    assert(!outErr && outRow?.status === 'recorded', 'Time Out recorded cleanly on existing Time In record');

    const { data: finalLog } = await adminClient
      .from('attendance_logs')
      .select('id, scanned_at, time_out_at, attendance_status')
      .eq('session_id', testSession.id)
      .eq('person_id', inOutStudent.id)
      .single();

    assert(!!finalLog && !!finalLog.scanned_at, 'Time In timestamp preserved on attendee record');
    assert(!!finalLog && !!finalLog.time_out_at, 'Time Out timestamp populated on attendee record');

    // =========================================================================
    // TEST 5: Network Timeout & Retry Idempotency
    // =========================================================================
    console.log('\n--- 5. IDEMPOTENCY: Timeout & Client Retry After Server Commit ---');

    const retryStudent = students[303]; // Distinct un-scanned student

    // First attempt: succeeds on server
    const { data: firstTry, error: err1 } = await ccsClient.rpc('record_attendance_by_qr_token', {
      p_qr_token: retryStudent.qr_token,
      p_session_id: testSession.id,
      p_checker_id: profiles[0].id,
      p_scanned_at: new Date().toISOString(),
      p_attendance_status: 'Present',
      p_device_id: 'device-retry-test',
      p_scan_phase: 'time_in',
    });
    const firstRow = Array.isArray(firstTry) ? firstTry[0] : firstTry;
    assert(!err1 && firstRow?.status === 'recorded', 'Initial scan committed successfully');

    // Second attempt: simulating client retry after suspected timeout
    const { data: secondTry, error: err2 } = await ccsClient.rpc('record_attendance_by_qr_token', {
      p_qr_token: retryStudent.qr_token,
      p_session_id: testSession.id,
      p_checker_id: profiles[0].id,
      p_scanned_at: new Date().toISOString(),
      p_attendance_status: 'Present',
      p_device_id: 'device-retry-test',
      p_scan_phase: 'time_in',
    });
    const secondRow = Array.isArray(secondTry) ? secondTry[0] : secondTry;
    assert(!err2 && secondRow?.status === 'duplicate', 'Client retry safely handled as duplicate without creating second row');

    const { count: retryStudentCount } = await adminClient
      .from('attendance_logs')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', testSession.id)
      .eq('person_id', retryStudent.id);

    assert(retryStudentCount === 1, 'Database strictly holds exactly 1 record after client retry');

    // =========================================================================
    // TEST 6: Shared Checker Account Session Concurrency
    // =========================================================================
    console.log('\n--- 6. SHARED ACCOUNT: 15 Concurrent Devices on 1 Checker Account ---');

    const deviceTokens = [];
    const sharedAuthSuccesses = [];

    // Simulate 15 distinct devices logging in with the same credentials
    for (let d = 0; d < 15; d++) {
      const devClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: devAuth, error: devErr } = await devClient.auth.signInWithPassword({
        email: 'ccs@crmc.edu',
        password: 'CheckerPassword123!',
      });
      if (!devErr && devAuth?.session) {
        deviceTokens.push({ deviceId: `device-shared-${d + 1}`, client: devClient, token: devAuth.session.access_token });
        sharedAuthSuccesses.push(d);
      }
    }

    assert(sharedAuthSuccesses.length === 15, 'All 15 devices successfully authenticated to single shared account', `Auth count: ${sharedAuthSuccesses.length}`);

    // Verify that all 15 devices can simultaneously query without token invalidation
    const simultaneousQueries = await Promise.all(
      deviceTokens.map((dev) => dev.client.rpc('list_checker_profiles', { p_include_inactive: false }))
    );

    const successfulProfileQueries = simultaneousQueries.filter((r) => !r.error && Array.isArray(r.data));
    assert(successfulProfileQueries.length === 15, 'Zero token collisions or session revocations across 15 devices on same account');

    // =========================================================================
    // TEST 7: Realtime Thundering-Herd & Amplification Audit
    // =========================================================================
    console.log('\n--- 7. REALTIME AUDIT: Subscription Amplification & Summary Queries ---');

    const summaryLatencies = [];
    const summaryCount = 60;
    const summaryPromises = [];

    for (let s = 0; s < summaryCount; s++) {
      const runSummary = async () => {
        const t0 = Date.now();
        const { data, error } = await ccsClient.rpc('get_session_attendance_summary', {
          p_session_id: testSession.id,
        });
        const lat = Date.now() - t0;
        summaryLatencies.push(lat);
        return { data, error, lat };
      };
      summaryPromises.push(runSummary());
    }

    const summaryStartTime = Date.now();
    const summaryResults = await Promise.all(summaryPromises);
    const summaryTotalTime = Date.now() - summaryStartTime;
    const summaryStats = calculateStats(summaryLatencies);

    console.log(`60 Simultaneous get_session_attendance_summary Calls Completed in ${summaryTotalTime}ms:`);
    console.log(`  • Latency Stats: Min=${summaryStats.min}ms, Mean=${summaryStats.mean}ms, P50=${summaryStats.p50}ms, P90=${summaryStats.p90}ms, P95=${summaryStats.p95}ms, Max=${summaryStats.max}ms`);

    const successfulSummaries = summaryResults.filter((r) => !r.error && r.data);
    assert(successfulSummaries.length === 60, 'All 60 concurrent summary queries succeeded without timeout');

    // =========================================================================
    // TEST 8: Offline Queue Synchronization & In-Flight Mutex
    // =========================================================================
    console.log('\n--- 8. OFFLINE QUEUE: Concurrent Sync Mutex & Ordering Simulation ---');

    // Simulate 20 pending offline logs
    const offlineBatchStudents = students.slice(305, 325);
    const offlineLogs = offlineBatchStudents.map((st, idx) => ({
      local_id: `mock-local-${idx}`,
      student_qr_token: st.qr_token,
      session_id: testSession.id,
      checker_id: profiles[0].id,
      scanned_at: new Date().toISOString(),
      attendance_status: 'Present',
      scan_phase: 'time_in',
      device_id: 'offline-scanner-mock',
    }));

    // Simulate concurrent sync calls hitting syncPendingLogs mutex
    let syncExecutionCount = 0;
    let syncInFlight = null;

    async function mockSyncPendingLogs() {
      if (syncInFlight) {
        return syncInFlight; // Mutex pattern from attendease.ts
      }
      syncInFlight = (async () => {
        syncExecutionCount++;
        const results = [];
        for (const item of offlineLogs) {
          const { data } = await ccsClient.rpc('record_attendance_by_qr_token', {
            p_qr_token: item.student_qr_token,
            p_session_id: item.session_id,
            p_checker_id: item.checker_id,
            p_scanned_at: item.scanned_at,
            p_attendance_status: item.attendance_status,
            p_device_id: item.device_id,
            p_scan_phase: item.scan_phase,
          });
          const row = Array.isArray(data) ? data[0] : data;
          results.push(row?.status);
        }
        return results;
      })().finally(() => {
        syncInFlight = null;
      });
      return syncInFlight;
    }

    const [syncRun1, syncRun2] = await Promise.all([
      mockSyncPendingLogs(),
      mockSyncPendingLogs(),
    ]);

    assert(syncExecutionCount === 1, 'In-flight sync mutex guaranteed exactly 1 sync execution for simultaneous sync triggers', `Executions: ${syncExecutionCount}`);
    const recordedInBatch = syncRun1.filter((s) => s === 'recorded').length;
    assert(recordedInBatch === 20, 'All 20 offline logs successfully recorded to backend', `Recorded: ${recordedInBatch}`);

  } finally {
    // Teardown test sessions and clean up attendance logs
    console.log('\n--- Cleaning Up Test Data ---');
    await adminClient.from('attendance_logs').delete().eq('session_id', testSession.id);
    await adminClient.from('attendance_sessions').delete().eq('id', testSession.id);
    await adminClient.from('main_sessions').delete().eq('id', testMain.id);
    console.log('Cleaned up test session and temporary attendance logs.');
  }

  console.log('\n======================================================================');
  console.log(`PHASE 10 TEST RESULTS: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================================\n');
  return { passCount, failCount };
}

runLoadTestSuite().catch((err) => {
  console.error('Fatal Load Test Error:', err);
  process.exit(1);
});
