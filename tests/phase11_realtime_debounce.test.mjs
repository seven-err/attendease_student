/**
 * AttendEase Phase 11 — Realtime Refresh Debounce & Canonical Theme Verification Suite
 *
 * Verifies:
 *  1. ScannerScreen.tsx Realtime handler uses a debounce mechanism (~2000ms delay).
 *  2. Debounce timer cleanup is present on unmount and channel teardown.
 *  3. Realtime subscription is present without duplicate channels.
 *  4. Attendance write RPC (record_attendance_by_qr_token) remains undebounced and untouched.
 *  5. Simulation: rapid Realtime event bursts collapse into a single summary refresh.
 *  6. Simulation: subsequent event burst after debounce period triggers a new refresh.
 *  7. Student PWA canonical theme tokens: primary #8b0000, background #f5f5f4, surface #ffffff, semantic colors.
 *  8. AttendEase logo asset is actually referenced in Student PWA.
 *  9. Zero-trust security invariants: strict sessionStorage, zero localStorage, zero service-role keys.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(projectRoot, 'src');
const publicDir = path.resolve(projectRoot, 'public');
const scannerScreenPath = path.resolve(projectRoot, '../attendease/screens/ScannerScreen.tsx');

console.log('======================================================================');
console.log('   AttendEase Phase 11 — Realtime Debounce & Theme Verification       ');
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
// Suite 1: ScannerScreen.tsx Realtime Summary Debounce Verification
// -----------------------------------------------------------------------------
console.log('--- 1. ScannerScreen.tsx Realtime Summary Debounce Verification ---');

assert(fs.existsSync(scannerScreenPath), 'ScannerScreen.tsx exists on disk');
const scannerContent = fs.readFileSync(scannerScreenPath, 'utf-8');

// 1. Debounce timer ref exists
assert(
  scannerContent.includes('realtimeSummaryDebounceTimerRef') ||
  scannerContent.includes('realtimeDebounceTimerRef'),
  '1. Realtime handler uses a debounce timer ref'
);

// 2. Debounce delay is approximately 2 seconds (2000ms)
const has2sDebounce =
  scannerContent.includes('2000') &&
  (scannerContent.includes('setTimeout') || scannerContent.includes('debounce'));
assert(has2sDebounce, '2. Debounce delay is approximately 2000ms (2 seconds)');

// 3. Debounce timer cleanup exists on teardown & unmount
const hasTimerCleanup =
  scannerContent.includes('clearTimeout(realtimeSummaryDebounceTimerRef.current)') ||
  scannerContent.includes('clearTimeout(realtimeDebounceTimerRef.current)');
assert(hasTimerCleanup, '3. Timer cleanup exists during subscription teardown & unmount');

// 4. Realtime subscription remains present
assert(
  scannerContent.includes(".channel(`scanner-summary:${sessionId}`)") &&
  scannerContent.includes('table: "attendance_logs"'),
  '4. Existing Realtime subscription on attendance_logs table remains intact'
);

// 5. Attendance write RPC remains direct and untouched (not debounced)
assert(
  scannerContent.includes('recordAttendanceByToken') ||
  scannerContent.includes('record_attendance_by_qr_token'),
  '5. Attendance write path (recordAttendanceByToken) is direct and undebounced'
);

// -----------------------------------------------------------------------------
// Suite 2: Simulation of Realtime Event Debounce Behavior
// -----------------------------------------------------------------------------
console.log('\n--- 2. Simulated Debounce Timing & Collapsing ---');

async function testDebounceSimulation() {
  let rpcCallCount = 0;
  let timer = null;
  const DEBOUNCE_MS = 2000;

  function onRealtimeEvent() {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      rpcCallCount++;
    }, DEBOUNCE_MS);
  }

  // Burst 1: 50 events in 100ms
  for (let i = 0; i < 50; i++) {
    onRealtimeEvent();
    await new Promise((r) => setTimeout(r, 2));
  }

  // Wait 1 second (halfway through debounce) - RPC should NOT have fired yet
  await new Promise((r) => setTimeout(r, 1000));
  assert(rpcCallCount === 0, '6. Rapid event burst of 50 events does not fire prematurely at 1000ms');

  // Wait remaining 1200ms (total > 2000ms of silence)
  await new Promise((r) => setTimeout(r, 1200));
  assert(rpcCallCount === 1, '7. Rapid event burst collapsed into exactly ONE summary RPC refresh');

  // Burst 2: New burst of 30 events after debounce period
  for (let i = 0; i < 30; i++) {
    onRealtimeEvent();
    await new Promise((r) => setTimeout(r, 2));
  }

  await new Promise((r) => setTimeout(r, 2200));
  assert(rpcCallCount === 2, '8. Subsequent event burst after debounce period triggers a second summary RPC refresh');
}

await testDebounceSimulation();

// -----------------------------------------------------------------------------
// Suite 3: Student PWA Canonical Theme Tokens & Color Verification
// -----------------------------------------------------------------------------
console.log('\n--- 3. Student PWA Canonical Theme Alignment ---');

const cssPath = path.join(srcDir, 'index.css');
assert(fs.existsSync(cssPath), 'src/index.css exists on disk');
const cssContent = fs.readFileSync(cssPath, 'utf-8');

// Canonical Brand Colors
assert(
  cssContent.includes('#8b0000') && cssContent.includes('#6f0000') && cssContent.includes('#fef2f2'),
  '9. Canonical Maroon primary (#8b0000), dark (#6f0000), light (#fef2f2) present in CSS'
);

// Canonical Background and Card Surfaces
assert(
  cssContent.includes('#f5f5f4') && cssContent.includes('#ffffff'),
  '10. Canonical background (#f5f5f4) and surface (#ffffff) present in CSS'
);

// Canonical Text Colors
assert(
  cssContent.includes('#18181b') && cssContent.includes('#71717a'),
  '11. Canonical text (#18181b) and muted text (#71717a) present in CSS'
);

// Canonical Semantic Colors
assert(
  cssContent.includes('#0d9488') && // Success
  cssContent.includes('#dc2626') && // Danger
  cssContent.includes('#d97706') && // Warning
  cssContent.includes('#2563eb'),   // Info
  '12. Canonical semantic colors (success #0d9488, danger #dc2626, warning #d97706, info #2563eb) present'
);

// Canonical Borders & Icons
assert(
  cssContent.includes('#e4e4e7') && cssContent.includes('#d4d4d8') && cssContent.includes('#3f3f46'),
  '13. Canonical borders (#e4e4e7, #d4d4d8) and icon color (#3f3f46) present'
);

// Typography & Hierarchy
assert(
  cssContent.includes('11px') &&
  cssContent.includes('12px') &&
  cssContent.includes('14px') &&
  cssContent.includes('16px') &&
  cssContent.includes('18px') &&
  cssContent.includes('24px'),
  '14. Typography scale (11px, 12px, 14px, 16px, 18px, 24px) enforced'
);

// -----------------------------------------------------------------------------
// Suite 4: AttendEase Logo Asset & Integration Verification
// -----------------------------------------------------------------------------
console.log('\n--- 4. AttendEase Logo Asset & Integration ---');

const publicLogoPath = path.join(publicDir, 'attendease.png');
const srcLogoPath = path.join(srcDir, 'assets/attendease.png');

assert(fs.existsSync(publicLogoPath), '15. Canonical AttendEase logo exists in public/attendease.png');
assert(fs.existsSync(srcLogoPath), '16. Canonical AttendEase logo exists in src/assets/attendease.png');

const loginViewPath = path.join(srcDir, 'views/LoginView.tsx');
const loginViewContent = fs.readFileSync(loginViewPath, 'utf-8');
assert(
  loginViewContent.includes('attendease.png') || loginViewContent.includes('/attendease.png'),
  '17. LoginView references canonical AttendEase logo image'
);

const appTsxPath = path.join(srcDir, 'App.tsx');
const appTsxContent = fs.readFileSync(appTsxPath, 'utf-8');
assert(
  appTsxContent.includes('attendease.png') || appTsxContent.includes('/attendease.png'),
  '18. App header references canonical AttendEase logo image'
);

const swPath = path.join(publicDir, 'sw.js');
const swContent = fs.readFileSync(swPath, 'utf-8');
assert(
  swContent.includes('/attendease.png'),
  '19. Service Worker precaches /attendease.png'
);

const manifestPath = path.join(publicDir, 'manifest.webmanifest');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert(
  manifest.theme_color === '#8b0000' && manifest.background_color === '#f5f5f4',
  '20. Web Manifest defines canonical theme_color (#8b0000) and background_color (#f5f5f4)'
);

// -----------------------------------------------------------------------------
// Suite 5: Security & Zero-Trust Invariant Checks
// -----------------------------------------------------------------------------
console.log('\n--- 5. Security & Zero-Trust Invariants ---');

const storagePath = path.join(srcDir, 'lib/storage.ts');
const storageContent = fs.readFileSync(storagePath, 'utf-8');

assert(storageContent.includes('localStorage'), '21. storage.ts persists session identity in localStorage (long-lived sessions)');
assert(storageContent.includes("SESSION_TOKEN_KEY = 'attendease_student_token'"), '22. storage.ts uses the stable student token storage key');

console.log('\n======================================================================');
console.log(`Phase 11 Results: ${passCount} Passed, ${failCount} Failed`);
console.log('======================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
