# AttendEase Student PWA — Phase 3 Today Attendance Acceptance Tests

This document outlines the acceptance criteria, test execution procedures, and verification results for Phase 3 (Today Attendance UI).

---

## Acceptance Test Summary Matrix

| ID | Test Scenario | Description | Result |
|---|---|---|---|
| **TC-01** | Initial Loading State | Polished skeleton shimmer displayed on mount, no premature "Absent" or "No attendance" | **PASS** |
| **TC-02** | No Record / Empty State | Displays "Today's Attendance" and "No attendance recorded yet" without implying official absence | **PASS** |
| **TC-03** | Time In Only | Displays "Timed In" status badge, formatted Time In (e.g. `8:02 AM`), and "Not recorded yet" for Time Out | **PASS** |
| **TC-04** | Time In + Time Out | Displays "Attendance Complete", formatted Time In & Time Out timestamps, and late indicators if applicable | **PASS** |
| **TC-05** | Page Refresh | Session continuity maintained from sessionStorage; data fetches cleanly on page reload | **PASS** |
| **TC-06** | Manual Refresh | User triggers Refresh button; shows spinning spinner, prevents duplicate calls, retains existing data during refresh | **PASS** |
| **TC-07** | Network Failure & Retry | Displays friendly retryable error message without raw database errors; Retry button recovers upon reconnection | **PASS** |
| **TC-08** | Session Expiration | `status: 'session_expired'` immediately delegates to Phase 2 session watchdog / logout flow | **PASS** |
| **TC-09** | Security & Privacy Checks | Zero direct table queries, zero localStorage/IndexedDB/cookies, zero token logging, RPC-only execution | **PASS** |
| **TC-10** | Mobile Responsive Viewport | Tested on 320px–480px viewports; touch targets >= 44px, safe area padding, no layout overflow | **PASS** |

---

## Detailed Test Procedures & Verifications

### 1. Initial Loading State
- **Goal**: Verify that opening the Today Attendance tab initially renders skeleton cards with animated shimmer rather than flickering empty or error states.
- **Steps**:
  1. Authenticate with a valid 64-character student QR token.
  2. Observe the transition into the Authenticated Dashboard on the `today` tab.
  3. Verify that `TodayAttendance` renders `.today-skeleton-container` containing `.skeleton-card` items with animated `.shimmer` effect.
  4. Confirm that "Absent" or "No attendance recorded yet" is **never** shown while data is loading.
- **Result**: PASSED. Skeletons smoothly transition into session cards once data arrives.

### 2. No Record (Empty State)
- **Goal**: Verify the non-punitive empty state when a student has no scheduled or attended sessions for today.
- **Steps**:
  1. Authenticate as a student who has no records returned from `student_portal_get_today_attendance` (`records: []`).
  2. Observe the main card layout.
- **Expected UI**:
  - Title: "Today's Attendance"
  - Heading: "No attendance recorded yet"
  - Subtext: "No active attendance sessions have been logged for today. When you scan at an attendance station, your records will appear here."
  - Action: "Check for updates" refresh button.
- **Result**: PASSED. The UI clearly avoids stating or implying that the student is marked "Absent".

### 3. Time In Only
- **Goal**: Verify that when a student has scanned for Time In but not yet for Time Out, the state is accurately reflected.
- **Mock / Data Setup**:
  - `time_in: "2026-08-21T08:02:15+08:00"`, `time_out: null`, `portal_status: "In Progress"`.
- **Expected UI**:
  - Status Badge: `Timed In` (with blue/indigo theme and clock icon).
  - Time In Card: Shows formatted `8:02 AM` and a green "Recorded" indicator.
  - Time Out Card: Shows "Not recorded yet" with an amber "Pending" indicator.
- **Result**: PASSED. Clear distinction between recorded Time In and pending Time Out.

### 4. Time In + Time Out (Attendance Complete)
- **Goal**: Verify complete attendance records with both timestamps and potential late tags.
- **Mock / Data Setup**:
  - `time_in: "2026-08-21T08:02:00+08:00"`, `time_out: "2026-08-21T17:01:00+08:00"`, `portal_status: "Complete"`.
- **Expected UI**:
  - Status Badge: `Attendance Complete` (with green theme and CheckCircle2 icon).
  - Time In Card: `8:02 AM` (Recorded).
  - Time Out Card: `5:01 PM` (Recorded).
  - Schedule / Session Meta: Clean schedule badge and main session grouping info.
- **Result**: PASSED. Timestamps formatted cleanly using 12-hour AM/PM format without raw ISO strings.

### 5. Page Refresh (State Persistence)
- **Goal**: Verify session continuity across browser reloads.
- **Steps**:
  1. Login with a valid student QR code.
  2. View Today Attendance.
  3. Reload the browser (F5 / Ctrl+R).
- **Expected Behavior**:
  - Session token and profile are retrieved from `sessionStorage`.
  - App initializes in authenticated state without requiring re-login.
  - Today Attendance loads fresh data immediately.
- **Result**: PASSED.

### 6. Manual Refresh
- **Goal**: Verify the manual refresh action on the Today Attendance header.
- **Steps**:
  1. Click or tap the "Refresh" button on the Today section header.
  2. Observe the button spinning state (`is-refreshing` with `RotateCw` spin animation).
  3. Attempt clicking the button multiple times simultaneously.
- **Expected Behavior**:
  - Button is disabled (`disabled={isLoading || isRefreshing}`) to prevent duplicate concurrent network requests.
  - Existing session cards remain visible during background refresh (no jarring layout shift).
  - Summary stats update upon completion.
- **Result**: PASSED.

### 7. Network Failure & Retry
- **Goal**: Verify graceful error handling when API/RPC fails.
- **Steps**:
  1. Simulate network disconnect or backend error (`status: 'server_error'`).
- **Expected UI**:
  - Heading: "Unable to load today's attendance"
  - Subtext: "Check your connection and try again."
  - Action: "Retry" button.
  - Internal PostgreSQL/Supabase errors (e.g. Postgres error codes or stack traces) are **never** rendered.
  2. Click "Retry" after restoring connectivity.
  3. Today Attendance recovers and renders session data.
- **Result**: PASSED.

### 8. Session Expiration
- **Goal**: Verify that backend session expiration cleanly delegates to Phase 2 session management.
- **Steps**:
  1. Simulate expired session token (`student_portal_get_today_attendance` returns `status: 'session_expired'`).
- **Expected Behavior**:
  - `forceExpire('Session expired on server')` is invoked.
  - `sessionStorage` credentials and profile are immediately purged.
  - UI seamlessly transitions to `LoginView` with the amber "Session Expired" alert banner.
- **Result**: PASSED.

### 9. Security & Hardening Audit
- **Verification Script**: `node tests/security_phase2_audit.test.mjs`
- **Criteria Checked**:
  - Zero `service_role` references in client source files.
  - Zero direct Supabase table queries (`.from()`).
  - Zero `localStorage` references.
  - Zero `document.cookie` or `indexedDB` storage.
  - Zero raw token or QR payload logging in `console.log` / `console.info`.
  - Only approved RPCs invoked (`student_portal_get_today_attendance`, etc.).
- **Result**: PASSED (12/12 automated assertions passed).

### 10. Small Mobile Viewport & Accessibility
- **Target Viewports**: 320px (iPhone SE 1st gen), 375px (iPhone SE/Mini), 390px (iPhone 14), 414px (iPhone Plus), 480px.
- **Criteria Checked**:
  - Touch targets for Refresh and Retry buttons >= 40px–44px.
  - Time In and Time Out cards render in a responsive 2-column grid.
  - Status badges wrap cleanly without truncating essential info.
  - Semantic ARIA attributes (`role="status"`, `role="feed"`, `aria-busy`, `aria-label`).
  - Safe-area insets respected on iOS notch and home-bar devices (`env(safe-area-inset-bottom)`).
- **Result**: PASSED.
