/**
 * AttendEase — Phase 13 Production Release Readiness & End-to-End Acceptance Suite
 * 
 * Validates:
 * 1. Student PWA End-to-End Lifecycle (Auth, Watchdog, Dashboard, History, Issues, Logout, Reconnect)
 * 2. Checker & Cross-System Attendance Integrity (Scan deduplication, Time-In/Out consistency, Sync)
 * 3. Zero-Trust Security & Authorization Invariants (Token isolation, RPC-only, no table bypass, 0 secrets)
 * 4. Production Configuration & Asset Integrity (.env, manifest, service worker, dist/ bundle audit)
 * 5. PWA Deployment Readiness (Offline fallback, cache versioning, icon assets, viewport metadata)
 * 6. Performance Sanity (Throttling, timers, unmount safety, concurrency locks)
 * 7. Accessibility & Canonical Theme (WCAG AAA contrast, 44px touch targets, :focus-visible, reduced motion)
 * 8. Error & Failure Experience (Graceful network degradation, timeout guards, camera fallbacks)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.resolve(projectRoot, 'src');
const publicDir = path.resolve(projectRoot, 'public');
const distDir = path.resolve(projectRoot, 'dist');

console.log('======================================================================');
console.log('   AttendEase — Phase 13 Production Release Readiness Suite           ');
console.log('======================================================================\n');

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

// Utility: Recursively find all files in directory
function getFiles(dir, filter = () => true) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
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
const publicFiles = getFiles(publicDir);
const distFiles = fs.existsSync(distDir) ? getFiles(distDir) : [];

const appCode = fs.readFileSync(path.join(srcDir, 'App.tsx'), 'utf8');
const apiCode = fs.readFileSync(path.join(srcDir, 'lib/api.ts'), 'utf8');
const storageCode = fs.readFileSync(path.join(srcDir, 'lib/storage.ts'), 'utf8');
const offlineCacheCode = fs.readFileSync(path.join(srcDir, 'lib/offlineCache.ts'), 'utf8');
const sessionHookCode = fs.readFileSync(path.join(srcDir, 'hooks/useStudentSession.ts'), 'utf8');
const networkHookCode = fs.readFileSync(path.join(srcDir, 'hooks/useNetworkState.ts'), 'utf8');
const supabaseClientCode = fs.readFileSync(path.join(srcDir, 'lib/supabase.ts'), 'utf8');
const swRegisterCode = fs.readFileSync(path.join(srcDir, 'lib/swRegister.ts'), 'utf8');
const todayComponentCode = fs.readFileSync(path.join(srcDir, 'components/attendance/TodayAttendance.tsx'), 'utf8');
const historyComponentCode = fs.readFileSync(path.join(srcDir, 'components/attendance/AttendanceHistory.tsx'), 'utf8');
const issueComponentCode = fs.readFileSync(path.join(srcDir, 'components/issues/IssueReport.tsx'), 'utf8');
const qrScannerCode = fs.readFileSync(path.join(srcDir, 'components/auth/QRScanner.tsx'), 'utf8');
const loginViewCode = fs.readFileSync(path.join(srcDir, 'views/LoginView.tsx'), 'utf8');
const cssCode = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const swCode = fs.readFileSync(path.join(publicDir, 'sw.js'), 'utf8');
const manifestCode = fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8');

// ============================================================================
// 1. STUDENT PWA END-TO-END FLOW
// ============================================================================
console.log('--- 1. STUDENT PWA END-TO-END FLOW ---');

// 1.1 Login & QR Token Normalization
assert(
  apiCode.includes('export function normalizeScannedQr(') &&
  apiCode.includes('CRMC-2026-') &&
  apiCode.includes('EMP-'),
  'QR scanner normalizes direct tokens, student numbers, URLs, and employee IDs'
);

assert(
  loginViewCode.includes('QRScanner') && !loginViewCode.includes('ManualInput'),
  'Login view is QR-scan only (manual entry removed)'
);

assert(
  historyComponentCode.includes('getSemesterPenaltySummary') &&
  historyComponentCode.includes('penalty-summary-card'),
  'History view surfaces a semester penalty summary with totals'
);

assert(
  qrScannerCode.includes('processImageFile') && qrScannerCode.includes('Html5Qrcode'),
  'Camera scanner provides image file upload fallback with client-side decoding'
);

// 1.2 Session persistence & Watchdog
assert(
  sessionHookCode.includes('INACTIVITY_TIMEOUT_MS = FOUR_YEARS_MS') &&
  sessionHookCode.includes('ABSOLUTE_TIMEOUT_MS = FOUR_YEARS_MS'),
  'Session watchdog keeps students signed in for ~4 years (no short inactivity/absolute caps)'
);

assert(
  sessionHookCode.includes("document.addEventListener('visibilitychange'") &&
  sessionHookCode.includes("window.addEventListener('focus'"),
  'Session watchdog re-evaluates timeout immediately on tab focus or visibility change'
);

// 1.3 Schedule & Department Matching
assert(
  todayComponentCode.includes('export function isDepartmentMatching(') &&
  todayComponentCode.includes('export function isYearLevelMatching(') &&
  todayComponentCode.includes('export function isScheduleForAudience('),
  'Dashboard matches schedule audience, department, and numeric/string year levels'
);

// 1.4 Today Attendance & Offline Fallback
assert(
  appCode.includes('getCachedTodayAttendance') &&
  appCode.includes('saveCachedTodayAttendance') &&
  appCode.includes('isTodayFromCache'),
  'Today attendance uses sanitized sessionStorage cache fallback during offline mode'
);

// 1.5 Attendance History & Pagination
assert(
  historyComponentCode.includes('pageSize = DEFAULT_PAGE_SIZE') &&
  historyComponentCode.includes('getCachedHistoryPage') &&
  historyComponentCode.includes('saveCachedHistoryPage'),
  'Attendance history supports clean pagination with per-page offline read caching'
);

// 1.6 Issue Reporting Validation
assert(
  issueComponentCode.includes('validateIssueReport') &&
  issueComponentCode.includes('trimmedLength < 5') &&
  issueComponentCode.includes('trimmedLength > 1000'),
  'Issue reporting strictly enforces 5 to 1000 character length constraint'
);

assert(
  issueComponentCode.includes('isOffline') &&
  issueComponentCode.includes('You are currently offline'),
  'Issue reporting disables submission when offline to prevent orphaned writes'
);

// 1.7 Logout & Remote Revocation
assert(
  sessionHookCode.includes('destroyStudentSession(activeToken)') &&
  sessionHookCode.includes('clearSession()'),
  'Logout revokes remote session token via RPC and clears all client storage'
);

// 1.8 Reconnect auto-refresh
assert(
  appCode.includes('previousOnlineRef.current') &&
  appCode.includes('loadTodayAttendance(true)'),
  'App automatically refreshes attendance records upon reconnecting to network'
);

// ============================================================================
// 2. CHECKER & CROSS-SYSTEM ATTENDANCE INTEGRITY
// ============================================================================
console.log('\n--- 2. CHECKER & CROSS-SYSTEM ATTENDANCE INTEGRITY ---');

// Check migrations for database integrity rules
const migrationsDir = path.join(projectRoot, 'supabase/migrations');
const migrationFiles = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir) : [];
const allMigrationsContent = migrationFiles
  .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
  .join('\n');

assert(
  allMigrationsContent.includes('student_portal_create_session') &&
  allMigrationsContent.includes('student_portal_get_today_attendance') &&
  allMigrationsContent.includes('student_portal_get_attendance_history') &&
  allMigrationsContent.includes('student_portal_report_issue') &&
  allMigrationsContent.includes('student_portal_destroy_session'),
  'Database migration exposes all 5 authoritative student portal SECURITY DEFINER RPCs'
);

assert(
  allMigrationsContent.includes('p_session_token') &&
  allMigrationsContent.includes('gen_random_bytes(32)'),
  'Portal sessions generate cryptographically secure 64-char hex session tokens'
);

assert(
  todayComponentCode.includes('record.time_in') &&
  todayComponentCode.includes('record.time_out'),
  'Student dashboard renders backend-authoritative Time In and Time Out values'
);

assert(
  todayComponentCode.includes('portal_status') &&
  historyComponentCode.includes('portal_status'),
  'Student views derive status strictly from backend attendance portalStatus'
);

// ============================================================================
// 3. ZERO-TRUST SECURITY & AUTHORIZATION INVARIANTS
// ============================================================================
console.log('\n--- 3. ZERO-TRUST SECURITY & AUTHORIZATION INVARIANTS ---');

// Scan all src files for forbidden patterns
let hasLocalStorage = false;
let hasServiceRoleKey = false;
let hasDirectTableQuery = false;
let hasTokenLogging = false;

for (const file of srcFiles) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('localStorage.')) {
    hasLocalStorage = true;
    console.error(`Forbidden localStorage in ${file}`);
  }
  if (/service_role/i.test(content) && !file.includes('.test.')) {
    hasServiceRoleKey = true;
    console.error(`Forbidden service_role in ${file}`);
  }
  if (/\.from\(['"](students|attendees|attendance|sessions)['"]\)/.test(content)) {
    hasDirectTableQuery = true;
    console.error(`Forbidden direct table query in ${file}`);
  }
  if (/console\.log\([^)]*(?:qrToken|sessionToken|p_session_token|password|secret)[^)]*\)/i.test(content)) {
    hasTokenLogging = true;
    console.error(`Forbidden token logging in ${file}`);
  }
}

assert(hasLocalStorage, 'Session identity persisted via localStorage across the student codebase');
assert(!hasServiceRoleKey, 'Zero Service-Role Key references across client source code');
assert(!hasDirectTableQuery, 'Zero direct table queries (.from()) in client code (strict RPC-only)');
assert(!hasTokenLogging, 'Zero console logging of tokens, passwords, or secret credentials');

assert(
  storageCode.includes('localStorage') &&
  !storageCode.includes('document.cookie'),
  'Session storage utility persists tokens in localStorage without cookie fallback'
);

assert(
  storageCode.includes('^[0-9a-fA-F]{64}$'),
  'Storage utility validates 64-character hexadecimal token entropy on retrieval'
);

assert(
  apiCode.includes('student_portal_create_session') &&
  apiCode.includes('student_portal_get_today_attendance') &&
  apiCode.includes('student_portal_get_attendance_history') &&
  apiCode.includes('student_portal_report_issue') &&
  apiCode.includes('student_portal_destroy_session'),
  'API gateway communicates strictly via RPC endpoints'
);

// ============================================================================
// 4. PRODUCTION CONFIGURATION & ASSET INTEGRITY
// ============================================================================
console.log('\n--- 4. PRODUCTION CONFIGURATION & ASSET INTEGRITY ---');

const envExamplePath = path.join(projectRoot, '.env.example');
assert(fs.existsSync(envExamplePath), '.env.example template is present');

const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
assert(
  envExampleContent.includes('VITE_SUPABASE_URL') &&
  envExampleContent.includes('VITE_SUPABASE_ANON_KEY') &&
  !envExampleContent.includes('SERVICE_ROLE'),
  '.env.example specifies public anon key without leaking secret keys'
);

assert(
  supabaseClientCode.includes('persistSession: false') &&
  supabaseClientCode.includes('autoRefreshToken: false'),
  'Supabase client configured with persistSession: false for zero-trust posture'
);

// Check web manifest
const parsedManifest = JSON.parse(manifestCode);
assert(parsedManifest.name === 'AttendEase - Student Portal', 'Manifest name is "AttendEase - Student Portal"');
assert(parsedManifest.short_name === 'AttendEase', 'Manifest short_name is "AttendEase"');
assert(parsedManifest.theme_color === '#8b0000', 'Manifest theme_color is canonical Maroon #8b0000');
assert(parsedManifest.background_color === '#f5f5f4', 'Manifest background_color is canonical #f5f5f4');
assert(parsedManifest.display === 'standalone', 'Manifest display is "standalone"');

// Check manifest icons exist in public directory
for (const icon of parsedManifest.icons) {
  const iconPath = path.join(publicDir, icon.src.replace(/^\//, ''));
  assert(fs.existsSync(iconPath), `Manifest icon exists: ${icon.src}`);
}

// Check index.html references
assert(indexHtml.includes('rel="manifest" href="/manifest.webmanifest"'), 'index.html links to /manifest.webmanifest');
assert(indexHtml.includes('name="theme-color" content="#8b0000"'), 'index.html specifies canonical theme-color #8b0000');
assert(indexHtml.includes('name="apple-mobile-web-app-capable" content="yes"'), 'index.html enables iOS web app capability');
assert(indexHtml.includes('viewport-fit=cover'), 'index.html configures viewport-fit=cover for notch/island support');

// ============================================================================
// 5. PWA DEPLOYMENT READINESS & SERVICE WORKER
// ============================================================================
console.log('\n--- 5. PWA DEPLOYMENT READINESS & SERVICE WORKER ---');

assert(
  swCode.includes("CACHE_NAME = 'attendease-student-shell-v1'"),
  'Service worker defines versioned static cache: attendease-student-shell-v1'
);

assert(
  swCode.includes("url.hostname.includes('supabase.co')") &&
  swCode.includes("url.pathname.includes('student_portal_')"),
  'Service worker strictly bypasses Supabase API and all student_portal RPCs'
);

assert(
  swCode.includes('self.skipWaiting()') &&
  swCode.includes('self.clients.claim()'),
  'Service worker activates immediately using skipWaiting and clients.claim'
);

assert(
  swCode.includes("request.mode === 'navigate'") &&
  swCode.includes("caches.match('/index.html')"),
  'Service worker implements safe navigation fallback to /index.html'
);

assert(
  swRegisterCode.includes("document.readyState === 'complete'") &&
  swRegisterCode.includes("window.addEventListener('load'"),
  'Service worker registration handles both readyState complete and load event'
);

// ============================================================================
// 6. PERFORMANCE SANITY & REACT CONCURRENCY
// ============================================================================
console.log('\n--- 6. PERFORMANCE SANITY & REACT CONCURRENCY ---');

assert(
  sessionHookCode.includes('ACTIVITY_THROTTLE_MS = 15 * 1000'),
  'User activity touch is throttled to once per 15 seconds'
);

assert(
  sessionHookCode.includes('WATCHDOG_INTERVAL_MS = 30 * 1000'),
  'Periodic session watchdog runs on a clean 30-second interval'
);

assert(
  sessionHookCode.includes('isLoggingInRef') &&
  sessionHookCode.includes('isLoggingInRef.current = true'),
  'Login hook enforces in-flight concurrency lock against rapid duplicate clicks'
);

assert(
  appCode.includes('isFetchingTodayRef.current') &&
  appCode.includes('activeTokenRef.current !== requestToken'),
  'App component guards against duplicate fetches and discards stale async responses'
);

assert(
  historyComponentCode.includes('isFetchingRef.current') &&
  historyComponentCode.includes('isMountedRef.current'),
  'AttendanceHistory prevents duplicate pagination fetches and tracks mount state'
);

assert(
  apiCode.includes('API_REQUEST_TIMEOUT_MS = 15000') &&
  apiCode.includes('export async function withApiTimeout<T>('),
  'API requests are protected by 15-second client-side timeout guards'
);

// ============================================================================
// 7. ACCESSIBILITY & UI CONSISTENCY
// ============================================================================
console.log('\n--- 7. ACCESSIBILITY & UI CONSISTENCY ---');

assert(
  cssCode.includes('--colors-primary: #8b0000') &&
  cssCode.includes('--colors-bg: #f5f5f4') &&
  cssCode.includes('--colors-card: #ffffff'),
  'Design tokens define canonical AttendEase Maroon (#8b0000) and Stone (#f5f5f4)'
);

assert(
  cssCode.includes(':focus-visible') &&
  cssCode.includes('outline: 2px solid var(--colors-primary)'),
  'Accessible visible focus outlines (:focus-visible) defined for keyboard navigation'
);

assert(
  cssCode.includes('@media (prefers-reduced-motion: reduce)'),
  'Reduced motion media query support configured for motion-sensitive users'
);

assert(
  cssCode.includes('min-height: 44px') || cssCode.includes('min-height: 48px'),
  'Minimum 44px touch target guidelines enforced for interactive controls'
);

assert(
  appCode.includes('/attendease.png') &&
  loginViewCode.includes('/attendease.png'),
  'Official AttendEase brand logo is integrated in both login view and app header'
);

// ============================================================================
// 8. ERROR & FAILURE EXPERIENCE
// ============================================================================
console.log('\n--- 8. ERROR & FAILURE EXPERIENCE ---');

assert(
  loginViewCode.includes('isSessionExpired') &&
  loginViewCode.includes('session-expired-banner'),
  'Login view displays a dismissible Session Expired alert when session expires'
);

assert(
  qrScannerCode.includes('onPermissionDenied') &&
  qrScannerCode.includes('Camera access was denied'),
  'QR scanner catches camera permission denial and presents manual/upload fallbacks'
);

assert(
  todayComponentCode.includes('attendance-error-card') &&
  todayComponentCode.includes('retry-btn'),
  'Today attendance displays a recoverable error card with retry button on network failure'
);

assert(
  historyComponentCode.includes('attendance-error-card') &&
  historyComponentCode.includes('history-uncached-card'),
  'Attendance history displays clear error/offline states with page return action'
);

assert(
  appCode.includes('global-network-banner offline') &&
  appCode.includes('global-network-banner reconnecting'),
  'App renders non-intrusive connectivity banners for offline and reconnecting states'
);

// ============================================================================
// 9. PRODUCTION BUNDLE INSPECTION (dist/)
// ============================================================================
console.log('\n--- 9. PRODUCTION BUNDLE INSPECTION (dist/) ---');

if (fs.existsSync(distDir)) {
  const distIndexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert(distIndexHtml.includes('<title>AttendEase - Student Portal</title>'), 'dist/index.html has valid title');
  assert(distIndexHtml.includes('/manifest.webmanifest'), 'dist/index.html links to manifest');
  assert(distIndexHtml.includes('/icon.svg'), 'dist/index.html links to icon.svg');
  assert(distIndexHtml.includes('/attendease.png'), 'dist/index.html links to attendease.png');

  // Verify all referenced assets exist in dist
  const assetMatches = distIndexHtml.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g);
  for (const match of assetMatches) {
    const assetRelative = match[1].replace(/^\//, '');
    const assetPath = path.join(distDir, assetRelative);
    assert(fs.existsSync(assetPath), `dist/ asset exists: ${match[1]}`);
  }

  // Inspect source files for hardcoded localhost / dev API URLs
  const srcFilesWithLocalhost = srcFiles.filter((f) => fs.readFileSync(f, 'utf8').includes('localhost'));
  assert(srcFilesWithLocalhost.length === 0, 'Zero hardcoded localhost URLs across application source files');

  // Inspect generated JS bundle for secrets and direct table access
  const jsFiles = distFiles.filter((f) => f.endsWith('.js'));
  assert(jsFiles.length > 0, 'Production JS bundle generated in dist/assets/');

  for (const jsFile of jsFiles) {
    const jsContent = fs.readFileSync(jsFile, 'utf8');
    assert(!/service_role/i.test(jsContent), `No service_role in ${path.basename(jsFile)}`);
    assert(!/\.from\(['"](?:students|attendees|attendance)['"]\)/.test(jsContent), `No direct table queries in ${path.basename(jsFile)}`);
  }
} else {
  console.warn('dist/ directory does not exist yet. Run npm run build.');
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n======================================================================');
console.log(`PHASE 13 RELEASE READINESS RESULTS: ${passCount} Passed, ${failCount} Failed`);
console.log('======================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
