# AttendEase Student Portal Migration Review Report

**Date:** 2026-08-21  
**Target Migration:** supabase/migrations/20260821000000_student_portal_foundation.sql  
**Target Application:** ttendease-student (PWA)  
**Backend:** Shared AttendEase Supabase PostgreSQL Database  

---

## 1. Executive Summary & Verification

A comprehensive adversarial security and schema verification was conducted against the existing AttendEase database codebase (C:\Users\admin\Documents\attendance_system\attendease).

All 4 required hardening fixes have been implemented cleanly, idempotently, and without modifying any checker tables, columns, triggers, or existing RPCs.

---

## 2. Exact Fixes Implemented

### Fix 1: Department Admin Data Isolation on ttendance_issue_reports
* **Problem Resolved**: is_department_admin(auth.uid()) alone allowed a department admin from one department (e.g. CCJE) to view or update issue reports submitted by students from other departments (e.g. CBA or CAS).
* **Fix Applied**: Updated both ttendance_issue_reports_admin_select and ttendance_issue_reports_admin_update policies to leverage AttendEase's native public.can_access_department(user_id, dept) and public.person_in_user_department(user_id, person_id) functions.
* **Result**:
  - Super admins retain full global access across all departments.
  - Department admins can only view/update reports if the report's session department is accessible to them OR the student submitting the report belongs to their authorized department.

### Fix 2: Trashed Session Filtering Across All Portal Queries
* **Problem Resolved**: AttendEase supports soft-deletion via 	rashed_at timestamptz on ttendance_sessions and main_sessions. Trashed sessions could previously appear in today's active dashboard or history count.
* **Fix Applied**: Consistently added nd s.trashed_at is null and (ms.id is null or ms.trashed_at is null) across:
  - student_portal_get_today_attendance (ttended_sessions and unattended_today_sessions)
  - student_portal_get_attendance_history (	otal_count and history_logs)
  - student_portal_report_issue (session authorization verification)

### Fix 3: Removed Hot-Path Expiry Cleanup from Session Creation
* **Problem Resolved**: Running DELETE FROM public.student_portal_sessions WHERE expires_at < now(); on every single QR scan created unneeded row and table lock contention during busy morning/afternoon scanning windows.
* **Fix Applied**: Completely removed table-wide deletions from student_portal_create_session.
* **Result**: Session creation is atomic, instantaneous, and concurrency-safe via pg_advisory_xact_lock and INSERT ... ON CONFLICT (person_id) DO UPDATE.

### Fix 4: Atomic Issue-Report Rate Limiting Under Concurrency
* **Problem Resolved**: High-frequency concurrent requests could bypass the 5-report 24-hour limit due to race conditions between the count check and row insertion.
* **Fix Applied**: Added a transaction-scoped advisory lock perform pg_advisory_xact_lock(hashtext(v_student.person_id::text)); inside student_portal_report_issue before the count query and insert.
* **Result**: Rate limit checking and insertion are strictly serialized per student.

---

## 3. Schema & Permission Audit Summary

| Component | Status | Verification Detail |
|---|---|---|
| **Identity 1:1 Mapping** | Verified | students.id = people.id. Dual-read (l.person_id = id OR l.student_id = id) safely covers legacy and new rows without cross-student data leakage. |
| **Search Path Isolation** | Verified | All 6 functions explicitly define SET search_path = public, pg_temp;. |
| **Direct non Table Privileges** | Verified | REVOKE ALL executed on student_portal_sessions and ttendance_issue_reports. Public/anon has 0 direct table privileges. |
| **Internal Function Sealing** | Verified | internal_validate_student_portal_session has all execution rights revoked from public, anon, authenticated. |
| **Single Active Session** | Verified | Database unique index idx_student_portal_sessions_person_unique guarantees at most 1 session per student. |
| **Session Lifetime Bounds** | Verified | 15-minute rolling inactivity timeout strictly capped at 1-hour absolute maximum lifetime from creation. |
| **Checker Non-Interference** | Verified | 100% additive migration. No checker tables, indexes, triggers, or RPCs modified. |

---

## 4. Final Deployment Recommendation

**Status:** **READY FOR DEPLOYMENT**

The migration script ttendease-student/supabase/migrations/20260821000000_student_portal_foundation.sql is verified, fully hardened, and ready to be applied to the shared Supabase PostgreSQL backend.
