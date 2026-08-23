// =============================================================================
// AttendEase Student Portal - Core Type Definitions
// Matches backend RPC shapes defined in 20260821000000_student_portal_foundation.sql
// =============================================================================

export type PersonRole = 'student' | 'employee';

export interface StudentProfile {
  full_name: string;
  student_number: string;
  role?: PersonRole; // 'student' | 'employee'
  person_kind?: string; // 'student' | 'staff' | 'employee'
  department: string | null;
  course: string | null;
  year_level: string | null;
  academic_year: string | null;
}

export type UserProfile = StudentProfile;

export type CreateSessionStatus = 'ok' | 'invalid_token' | 'server_error';

export interface CreateSessionResponse {
  status: CreateSessionStatus;
  session_token?: string;
  expires_at?: string;
  student?: StudentProfile;
  profile?: StudentProfile;
  message?: string;
}

export type SessionQueryStatus = 'ok' | 'session_expired' | 'server_error';

export interface TodayAttendanceRecord {
  session_id: string;
  session_title: string;
  session_description?: string | null;
  main_session_name?: string | null;
  date?: string;
  start_time?: string | null;
  end_time?: string | null;
  session_status?: string;
  time_in?: string | null;
  time_out?: string | null;
  raw_status?: string | null;
  portal_status?: string; // 'Complete' | 'In Progress' | 'Awaiting Scan' | 'Not Open Yet' | 'Not Recorded' | 'Missing Time In' | 'Absent'
  is_late?: boolean;
  late_label?: string | null;

  // Optional aliases for backward-compatibility
  session_name?: string;
  session_type?: string;
  department?: string | null;
  target_year_levels?: string[] | null;
  starts_at?: string | null;
  ends_at?: string | null;
  actual_time_in?: string | null;
  actual_time_out?: string | null;
  time_in_status?: string | null;
  time_out_status?: string | null;
  overall_status?: string;
  estimated_penalty_php?: number;
}

export interface GetTodayAttendanceResponse {
  status: SessionQueryStatus;
  date?: string;
  records?: TodayAttendanceRecord[];
  message?: string;
}

export interface AttendanceHistoryRecord {
  session_id: string;
  session_title: string;
  session_description?: string | null;
  main_session_name?: string | null;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  session_status?: string;
  time_in?: string | null;
  time_out?: string | null;
  raw_status?: string | null;
  portal_status?: string;
  is_late?: boolean;
  late_label?: string | null;

  // Penalty tracking (see migration 20260822000000)
  penalty_php?: number;
  is_unattended?: boolean;

  // Optional compatibility aliases
  log_id?: string;
  session_name?: string;
  overall_status?: string;
  created_at?: string;
}

export interface GetAttendanceHistoryResponse {
  status: SessionQueryStatus;
  total_count?: number;
  limit?: number;
  offset?: number;
  records?: AttendanceHistoryRecord[];
  message?: string;
}

export type IssueType =
  | 'missing_time_in'
  | 'missing_time_out'
  | 'incorrect_time'
  | 'wrong_status'
  | 'other';

export type ReportIssueStatus =
  | 'ok'
  | 'session_expired'
  | 'invalid_issue_type'
  | 'invalid_details'
  | 'unauthorized_session'
  | 'rate_limit_exceeded'
  | 'rate_limited'
  | 'server_error';

export interface ReportIssueResponse {
  status: ReportIssueStatus;
  report_id?: string;
  created_at?: string;
  message?: string;
}

export interface DestroySessionResponse {
  status: 'ok' | 'server_error';
  message?: string;
}

// ---------------------------------------------------------------------------
// Semester Penalty Summary (migration 20260822000000)
// ---------------------------------------------------------------------------

export interface SemesterPenaltySummary {
  total_penalty_php: number;
  absent_count: number;
  late_count: number;
  recorded_sessions_count: number;
  total_sessions_count: number;
  semester_label?: string;
  academic_year?: string | null;
  period_start?: string;
  period_end?: string;
  currency?: string;
}

export type GetSemesterPenaltyResponse =
  | { status: 'ok'; summary?: SemesterPenaltySummary }
  | { status: 'session_expired' }
  | { status: 'server_error'; message?: string };