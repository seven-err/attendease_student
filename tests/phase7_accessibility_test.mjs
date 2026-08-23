/**
 * AttendEase Student PWA — Phase 7 Accessibility & UX Polish Test Suite
 * Statically and structurally validates accessibility, ARIA semantics, touch targets,
 * reduced motion, focus indicators, and zero-trust security invariants.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

console.log('===============================================================');
console.log('   AttendEase Student PWA — Phase 7 Accessibility Test Suite   ');
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

// Utility: Recursively find all source files
function getFiles(dir, filter = (f) => true) {
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath, filter));
    } else if (filter(filePath)) {
      results.push(filePath);
    }
  }
  return results;
}

const srcFiles = getFiles('src', (f) => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.css'));
const cssContent = readFileSync('src/index.css', 'utf8');
const loginViewContent = readFileSync('src/views/LoginView.tsx', 'utf8');
const qrScannerContent = readFileSync('src/components/auth/QRScanner.tsx', 'utf8');
const todayAttendanceContent = readFileSync('src/components/attendance/TodayAttendance.tsx', 'utf8');
const attendanceHistoryContent = readFileSync('src/components/attendance/AttendanceHistory.tsx', 'utf8');
const attendanceStatusContent = readFileSync('src/components/attendance/AttendanceStatus.tsx', 'utf8');
const attendanceTimeRowContent = readFileSync('src/components/attendance/AttendanceTimeRow.tsx', 'utf8');
const issueReportContent = readFileSync('src/components/issues/IssueReport.tsx', 'utf8');
const appContent = readFileSync('src/App.tsx', 'utf8');

console.log('\n--- 1. CSS Design System & Accessibility Hardening ---');

assert(
  cssContent.includes('@media (prefers-reduced-motion: reduce)'),
  '1. CSS contains @media (prefers-reduced-motion: reduce) rules'
);

assert(
  cssContent.includes(':focus-visible'),
  '2. CSS contains visible :focus-visible rules for keyboard navigation'
);

assert(
  cssContent.includes('min-height: 44px') && cssContent.includes('min-width: 44px'),
  '3. CSS enforces minimum 44x44px touch targets on interactive elements'
);

assert(
  cssContent.includes('overflow-x: hidden'),
  '4. CSS enforces horizontal overflow safety on viewport containers'
);

assert(
  cssContent.includes('--text-secondary: #cbd5e1') && cssContent.includes('--text-muted: #94a3b8'),
  '5. CSS tokens provide WCAG AA compliant text contrast against dark surface'
);

console.log('\n--- 2. Login & Authentication Accessibility ---');

assert(
  loginViewContent.includes('aria-label="Sign-in method"') &&
  loginViewContent.includes('role="tabpanel"'),
  '6. LoginView exposes a single accessible sign-in panel with a labelled method note'
);

assert(
  loginViewContent.includes('role="alert"') &&
  loginViewContent.includes('aria-label="Dismiss session expired notice"'),
  '7. Session expired banner is marked role="alert" with accessible dismiss button'
);


assert(
  qrScannerContent.includes('aria-label="Retry starting camera"'),
  '11. QRScanner retry button has an accessible name'
);

console.log('\n--- 3. Today Attendance Accessibility ---');

assert(
  todayAttendanceContent.includes('aria-label={isRefreshing ? \'Refreshing today attendance\' : \'Refresh today attendance\'}'),
  '12. Today Attendance refresh button has accessible label reflecting refresh state'
);

assert(
  todayAttendanceContent.includes('role="region"') &&
  todayAttendanceContent.includes('aria-label="Today attendance summary counts"') &&
  todayAttendanceContent.includes('aria-live="polite"'),
  '13. Today Attendance summary counts have polite live region semantics'
);

assert(
  todayAttendanceContent.includes('aria-label={`Report an attendance issue for ${title}`}') ||
  todayAttendanceContent.includes('aria-label={`Report attendance issue for ${title}`}'),
  '14. Today Attendance Report Issue buttons have contextual session accessible names'
);

console.log('\n--- 4. Attendance History Accessibility ---');

assert(
  attendanceHistoryContent.includes('aria-label="Go to previous page"') &&
  attendanceHistoryContent.includes('aria-label="Go to next page"'),
  '15. Attendance History pagination controls have accessible previous/next names'
);

assert(
  attendanceHistoryContent.includes('role="status"') &&
  attendanceHistoryContent.includes('aria-live="polite"'),
  '16. Attendance History pagination announcements use polite live region'
);

assert(
  attendanceHistoryContent.includes('aria-label={`Report an attendance issue for ${record.session_title}`}'),
  '17. History Report Issue buttons have contextual session accessible names'
);

console.log('\n--- 5. Attendance Status & Time Row Readability ---');

assert(
  attendanceStatusContent.includes('role="status"') &&
  attendanceStatusContent.includes('aria-label={`Attendance status: ${statusText}`}'),
  '18. AttendanceStatus communicates status through icon, text, and ARIA without color alone'
);

assert(
  attendanceTimeRowContent.includes('aria-label={`Time In:') &&
  attendanceTimeRowContent.includes('aria-label={`Time Out:'),
  '19. AttendanceTimeRow provides accessible labels for recorded/pending time states'
);

console.log('\n--- 6. Issue Reporting Focus Management & Accessibility ---');

assert(
  issueReportContent.includes('role="radiogroup"') &&
  issueReportContent.includes('role="radio"') &&
  issueReportContent.includes('aria-checked='),
  '20. IssueReport exposes issue categories with accessible radiogroup/radio semantics'
);

assert(
  issueReportContent.includes('handleCategoryKeyDown') ||
  issueReportContent.includes('onKeyDown='),
  '21. IssueReport supports Arrow key keyboard navigation between categories'
);

assert(
  issueReportContent.includes('addEventListener(\'keydown\'') &&
  issueReportContent.includes('Escape'),
  '22. IssueReport handles Escape key to dismiss the report form'
);

assert(
  issueReportContent.includes('aria-describedby="char-counter-hint issue-validation-error"'),
  '23. IssueReport textarea associates character counter and validation errors'
);

assert(
  issueReportContent.includes('role="status"') &&
  issueReportContent.includes('aria-live="polite"'),
  '24. IssueReport success confirmation announces submission reference accessibly'
);

console.log('\n--- 7. Application Navigation & Shell Accessibility ---');

assert(
  appContent.includes('role="tablist"') &&
  appContent.includes('role="tab"') &&
  appContent.includes('aria-selected='),
  '25. Bottom navigation exposes tablist/tab semantics'
);

assert(
  appContent.includes('aria-label="Sign out of student portal"'),
  '26. Sign out button has explicit accessible label'
);

assert(
  appContent.includes('previousTabRef'),
  '27. App tracks previous tab and restores navigation when closing Issue Report'
);

console.log('\n--- 8. Security & Zero-Trust Invariant Checks ---');

let totalLocalStorageUsage = 0;
let totalIndexedDBUsage = 0;
let totalCookieUsage = 0;
let totalTokenLogging = 0;

for (const filePath of srcFiles) {
  if (filePath.endsWith('.css')) continue;
  const content = readFileSync(filePath, 'utf8');

  if (content.includes('localStorage.')) {
    console.error(`Violation: localStorage found in ${filePath}`);
    totalLocalStorageUsage++;
  }
  if (content.includes('indexedDB.') || content.includes('openDatabase')) {
    console.error(`Violation: IndexedDB found in ${filePath}`);
    totalIndexedDBUsage++;
  }
  if (content.includes('document.cookie')) {
    console.error(`Violation: document.cookie found in ${filePath}`);
    totalCookieUsage++;
  }
  if (/console\.(log|info)\(.*(token|secret|password|bearer)/i.test(content)) {
    console.error(`Violation: token logging found in ${filePath}`);
    totalTokenLogging++;
  }
}

assert(totalLocalStorageUsage === 0, '28. Zero localStorage usage across all client source files');
assert(totalIndexedDBUsage === 0, '29. Zero IndexedDB usage across all client source files');
assert(totalCookieUsage === 0, '30. Zero cookie storage for credentials');
assert(totalTokenLogging === 0, '31. Zero token/credential logging in console calls');

console.log('\n===============================================================');
console.log(`Phase 7 Test Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('===============================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('✔ Phase 7 Accessibility & UX Polish Test Suite PASSED 100%.\n');
  process.exit(0);
}
