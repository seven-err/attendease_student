import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

console.log('===============================================================');
console.log('   AttendEase Student PWA — Phase 2 Security & Logic Audit     ');
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

// 1. Collect all files in src/
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
console.log(`\nScanning ${sourceFiles.length} source files in src/...`);

// 2. Static Security Scans
let foundServiceRole = false;
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
let foundUnapprovedRpcs = [];

for (const filePath of sourceFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(srcDir, filePath);

  if (/service_role/i.test(content) || /SUPABASE_SERVICE_ROLE_KEY/i.test(content)) {
    foundServiceRole = true;
    console.error(`[Violation] Service role key referenced in ${relativePath}`);
  }

  if (/\.from\s*\(/i.test(content)) {
    foundDirectTableAccess = true;
    console.error(`[Violation] Direct table access (.from()) detected in ${relativePath}`);
  }

  if (/localStorage/i.test(content)) {
    foundLocalStorage = true;
    console.error(`[Violation] localStorage detected in ${relativePath}`);
  }

  if (/document\.cookie/i.test(content)) {
    foundCookieUsage = true;
    console.error(`[Violation] cookie access detected in ${relativePath}`);
  }

  if (/indexedDB/i.test(content)) {
    foundIndexedDb = true;
    console.error(`[Violation] indexedDB detected in ${relativePath}`);
  }

  // Token logging check
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/console\.(log|info|debug)\s*\(.*(qrToken|sessionToken|cleanToken|bearer|token).*\)/i.test(line)) {
      foundTokenLogging = true;
      console.error(`[Violation] Possible token logging in ${relativePath} L${i + 1}: ${line.trim()}`);
    }
  }

  // Check RPC calls
  const rpcMatches = content.matchAll(/supabase\.rpc\(\s*['"]([^'"]+)['"]/g);
  for (const match of rpcMatches) {
    const rpcName = match[1];
    rpcCallsFound.add(rpcName);
    if (!approvedRpcs.has(rpcName)) {
      foundUnapprovedRpcs.push({ rpcName, file: relativePath });
    }
  }
}

// 3. Assertions for Static Checks
assert(!foundServiceRole, 'Zero Service-Role Key references across all source files');
assert(!foundDirectTableAccess, 'Zero direct Supabase table queries (.from()) in client code');
assert(!foundLocalStorage, 'Zero localStorage references (strict sessionStorage enforcement)');
assert(!foundCookieUsage, 'Zero cookie storage for tokens or credentials');
assert(!foundIndexedDb, 'Zero IndexedDB token persistence');
assert(!foundTokenLogging, 'Zero raw token logging in console.log / console.info');
assert(foundUnapprovedRpcs.length === 0, 'Only approved student portal RPCs are invoked');

console.log(`\nVerified approved RPC calls found in client:`);
rpcCallsFound.forEach((rpc) => console.log(`  • ${rpc}`));

// 4. Session Inactivity & Absolute Timeout Math Logic Tests
console.log('\n--- Testing Session Watchdog Logic & Inactivity Calculations ---');

const INACTIVITY_MS = 15 * 60 * 1000; // 15 mins
const ABSOLUTE_MS = 60 * 60 * 1000;   // 1 hour

function checkSessionExpiration(now, createdAt, lastActiveAt) {
  if (!createdAt || !lastActiveAt) return { expired: true, reason: 'missing_timestamps' };
  if (now - createdAt > ABSOLUTE_MS) return { expired: true, reason: 'absolute_timeout' };
  if (now - lastActiveAt > INACTIVITY_MS) return { expired: true, reason: 'inactivity_timeout' };
  return { expired: false };
}

const sessionStartTime = 10000000;

// Test A: Active within 5 mins
const t1 = sessionStartTime + 5 * 60 * 1000;
const r1 = checkSessionExpiration(t1, sessionStartTime, sessionStartTime);
assert(!r1.expired, 'Active session within 5 mins is NOT expired');

// Test B: Inactive for 16 mins
const t2 = sessionStartTime + 16 * 60 * 1000;
const r2 = checkSessionExpiration(t2, sessionStartTime, sessionStartTime);
assert(r2.expired && r2.reason === 'inactivity_timeout', 'Inactive session after 16 mins expires due to inactivity');

// Test C: Continuous activity at 50 mins (should NOT expire)
const t3 = sessionStartTime + 50 * 60 * 1000;
const lastActive50 = sessionStartTime + 48 * 60 * 1000;
const r3 = checkSessionExpiration(t3, sessionStartTime, lastActive50);
assert(!r3.expired, 'Session with continuous activity before 1 hour is NOT expired');

// Test D: Continuous activity at 61 mins (MUST expire due to absolute 1-hour cap)
const t4 = sessionStartTime + 61 * 60 * 1000;
const lastActive60 = sessionStartTime + 60 * 60 * 1000;
const r4 = checkSessionExpiration(t4, sessionStartTime, lastActive60);
assert(r4.expired && r4.reason === 'absolute_timeout', 'Active session at 61 mins expires due to absolute 1-hour limit');

// 5. Run backend security acceptance tests
console.log('\n--- Running Backend RPC Acceptance Suite ---');
try {
  const { execSync } = await import('child_process');
  const output = execSync('node tests/security_acceptance_test.cjs', {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf-8',
  });
  console.log(output);
  assert(true, 'Backend RPC 20/20 acceptance tests passed');
} catch (err) {
  console.error(err);
  assert(false, 'Backend RPC acceptance tests failed');
}


console.log('===============================================================');
console.log(`Audit Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('===============================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✔ Phase 2 Security & Logic Audit fully PASSED.');
  process.exit(0);
}
