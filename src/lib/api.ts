import { supabase } from './supabase';
import type {
  CreateSessionResponse,
  GetTodayAttendanceResponse,
  GetAttendanceHistoryResponse,
  ReportIssueResponse,
  DestroySessionResponse,
  GetSemesterPenaltyResponse,
  IssueType,
} from '../types/portal';

export const API_REQUEST_TIMEOUT_MS = 15000; // 15 seconds request timeout

/**
 * Pure timeout wrapper to prevent RPC calls from hanging indefinitely on poor network connections.
 */
export async function withApiTimeout<T>(
  promiseOrThenable: PromiseLike<T> | Promise<T>,
  timeoutMs: number = API_REQUEST_TIMEOUT_MS,
  timeoutMessage: string = 'Request timed out. Please check your network connection and try again.'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(promiseOrThenable), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Extracts department code from employee person_number (e.g. EMP-CCS-007 -> CCS)
 */
export function extractDepartmentFromPersonNumber(personNumber?: string | null): string | null {
  if (!personNumber) return null;
  const match = personNumber.match(/^EMP-([A-Za-z0-9]+)-/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Normalizes different QR code structures:
 * - Direct token: 'CRMC-2026-0378' or 64-hex
 * - Student ID number: '2026-0378'
 * - URLs: 'https://...?token=CRMC-2026-0378' or 'https://.../student/2026-0378'
 * - JSON: '{"qr_token":"CRMC-2026-0378"}' or '{"student_number":"2026-0378"}'
 * - Prefixed: 'STUDENT:CRMC-2026-0378', 'ID: 2026-0378', 'QR=CRMC-2026-0378'
 * - Delimited: 'CRMC-2026-0378|BSIT|CCS' or '2026-0378;DOE,JOHN'
 */
export function normalizeScannedQr(raw?: string | null): string {
  if (!raw) return '';
  let token = String(raw).trim();

  // 1. URL extraction
  if (token.startsWith('http://') || token.startsWith('https://')) {
    try {
      const url = new URL(token);
      const param =
        url.searchParams.get('token') ||
        url.searchParams.get('qr') ||
        url.searchParams.get('qr_token') ||
        url.searchParams.get('code') ||
        url.searchParams.get('id') ||
        url.searchParams.get('student') ||
        url.searchParams.get('person_number') ||
        url.searchParams.get('student_number');

      if (param) {
        token = param.trim();
      } else {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          token = segments[segments.length - 1].trim();
        }
      }
    } catch {
      // Ignore URL parse error
    }
  }

  // 2. JSON payload extraction
  if ((token.startsWith('{') && token.endsWith('}')) || (token.startsWith('"{') && token.endsWith('}"'))) {
    try {
      const parsed = JSON.parse(token.startsWith('"{') ? JSON.parse(token) : token);
      const val =
        parsed.qr_token ||
        parsed.token ||
        parsed.qr ||
        parsed.student_number ||
        parsed.person_number ||
        parsed.student_id ||
        parsed.person_id ||
        parsed.id ||
        parsed.code;

      if (val && typeof val === 'string') {
        token = val.trim();
      }
    } catch {
      // Ignore JSON parse error
    }
  }

  // 3. Prefix stripping (e.g. STUDENT:..., QR=..., ID: ...)
  const prefixMatch = token.match(/^(?:student|employee|qr|id|code|attendee|token)[\s:=_-]+(.+)$/i);
  if (prefixMatch) {
    token = prefixMatch[1].trim();
  }

  // 4. Delimited barcode payload extraction (e.g. 'CRMC-2026-0378|BSIT|4th Year')
  if (token.includes('|') || token.includes(';') || token.includes('\t')) {
    const parts = token.split(/[|;\t]+/).map(p => p.trim()).filter(Boolean);
    const bestPart = parts.find(p =>
      /^CRMC-\d{4}-\d{4}$/i.test(p) ||
      /^\d{4}-\d{4}$/.test(p) ||
      /^EMP-[A-Za-z0-9]+-\d+$/i.test(p) ||
      /^[0-9a-fA-F]{64}$/.test(p)
    );
    if (bestPart) {
      token = bestPart;
    } else if (parts.length > 0) {
      token = parts[0];
    }
  }

  return token.trim();
}

/**
 * Authenticates a student or employee via their QR code / token and issues an active session token.
 */
export async function createStudentSession(
  qrToken: string
): Promise<CreateSessionResponse> {
  try {
    const normalized = normalizeScannedQr(qrToken);
    const cleanToken = normalized || qrToken.trim();

    if (!cleanToken || cleanToken.length < 3 || cleanToken.length > 256) {
      return { status: 'invalid_token', message: 'Please provide a valid QR code or token.' };
    }

    const { data, error } = await withApiTimeout(
      supabase.rpc('student_portal_create_session', {
        p_qr_token: cleanToken,
      })
    );

    if (error) {
      return { status: 'server_error', message: 'Authentication service temporarily unavailable. Please try again.' };
    }

    const result = data as CreateSessionResponse;
    if (result && result.status === 'invalid_token') {
      return { status: 'invalid_token', message: 'Unrecognized QR code. This code was not found in the AttendEase database. Please ensure you are scanning a valid Student or Employee QR code.' };
    }

    if (result && result.status === 'ok' && result.student) {
      const rawStudent = result.student;
      const isEmp =
        rawStudent.role === 'employee' ||
        rawStudent.person_kind === 'staff' ||
        rawStudent.person_kind === 'employee' ||
        (rawStudent.student_number && rawStudent.student_number.startsWith('EMP-'));

      const role = isEmp ? 'employee' : 'student';
      const department =
        rawStudent.department ||
        (isEmp ? extractDepartmentFromPersonNumber(rawStudent.student_number) : null);

      result.student = {
        ...rawStudent,
        role,
        department,
      };
      result.profile = result.student;
    }

    return result || { status: 'server_error', message: 'Authentication service returned an unexpected response.' };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    return {
      status: 'server_error',
      message: isTimeout
        ? 'Authentication request timed out. Please check your connection and try again.'
        : 'Network connection issue. Please check your connection and try again.',
    };
  }
}

export const createPortalSession = createStudentSession;

/**
 * Fetches today's target and attended attendance sessions for the authenticated student.
 */
export async function getTodayAttendance(
  sessionToken: string
): Promise<GetTodayAttendanceResponse> {
  try {
    if (!sessionToken || sessionToken.length !== 64) {
      return { status: 'session_expired', message: 'Your session has expired. Please sign in again.' };
    }

    const { data, error } = await withApiTimeout(
      supabase.rpc('student_portal_get_today_attendance', {
        p_session_token: sessionToken,
      })
    );

    if (error) {
      return { status: 'server_error', message: 'Unable to fetch attendance data. Please try again.' };
    }

    return (data as GetTodayAttendanceResponse) || { status: 'server_error', message: 'Unable to fetch attendance data.' };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    return {
      status: 'server_error',
      message: isTimeout
        ? 'Attendance request timed out. Please check your network.'
        : 'Network connection issue. Please check your connection.',
    };
  }
}

/**
 * Fetches paginated attendance history for the authenticated student.
 */
export async function getAttendanceHistory(
  sessionToken: string,
  limit: number = 20,
  offset: number = 0
): Promise<GetAttendanceHistoryResponse> {
  try {
    if (!sessionToken || sessionToken.length !== 64) {
      return { status: 'session_expired', message: 'Your session has expired. Please sign in again.' };
    }

    const { data, error } = await withApiTimeout(
      supabase.rpc('student_portal_get_attendance_history', {
        p_session_token: sessionToken,
        p_limit: limit,
        p_offset: offset,
      })
    );

    if (error) {
      return { status: 'server_error', message: 'Unable to fetch attendance history. Please try again.' };
    }

    return (data as GetAttendanceHistoryResponse) || { status: 'server_error', message: 'Unable to fetch attendance history.' };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    return {
      status: 'server_error',
      message: isTimeout
        ? 'History request timed out. Please check your network.'
        : 'Network connection issue. Please check your connection.',
    };
  }
}

/**
 * Submits an attendance issue report for a specific session or general discrepancy.
 */
export async function reportAttendanceIssue(
  sessionToken: string,
  issueType: IssueType,
  details: string,
  sessionId?: string | null
): Promise<ReportIssueResponse> {
  try {
    if (!sessionToken || sessionToken.length !== 64) {
      return { status: 'session_expired', message: 'Your session has expired. Please sign in again.' };
    }

    const cleanDetails = details ? details.trim() : '';
    if (cleanDetails.length < 5 || cleanDetails.length > 1000) {
      return { status: 'invalid_details', message: 'Details must be between 5 and 1000 characters.' };
    }

    const { data, error } = await withApiTimeout(
      supabase.rpc('student_portal_report_issue', {
        p_session_token: sessionToken,
        p_issue_type: issueType,
        p_details: cleanDetails,
        p_session_id: sessionId || null,
      })
    );

    if (error) {
      return { status: 'server_error', message: 'Failed to submit issue report. Please try again.' };
    }

    return (data as ReportIssueResponse) || { status: 'server_error', message: 'Failed to submit issue report.' };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    return {
      status: 'server_error',
      message: isTimeout
        ? 'Issue submission timed out. Please check your connection.'
        : 'Network connection issue. Please check your connection.',
    };
  }
}

/**
 * Explicitly revokes the active session token in the database.
 */
export async function destroyStudentSession(
  sessionToken: string
): Promise<DestroySessionResponse> {
  try {
    if (!sessionToken || sessionToken.length !== 64) {
      return { status: 'ok' };
    }

    const { data, error } = await withApiTimeout(
      supabase.rpc('student_portal_destroy_session', {
        p_session_token: sessionToken,
      }),
      8000 // 8-second fast timeout on session teardown
    );

    if (error) {
      return { status: 'server_error', message: 'Failed to revoke remote session cleanly.' };
    }

    return (data as DestroySessionResponse) || { status: 'ok' };
  } catch {
    return { status: 'server_error', message: 'Network request failed during sign out.' };
  }
}



/**
 * Fetches the student's cumulative attendance penalty totals for the current
 * semester (absences, lates, total PHP penalty).
 */
export async function getSemesterPenaltySummary(
  sessionToken: string
): Promise<GetSemesterPenaltyResponse> {
  try {
    if (!sessionToken || sessionToken.length !== 64) {
      return { status: 'session_expired' };
    }

    const { data, error } = await withApiTimeout(
      supabase.rpc('student_portal_get_semester_penalty_summary', {
        p_session_token: sessionToken,
      })
    );

    if (error) {
      return { status: 'server_error', message: 'Unable to fetch your semester penalty summary. Please try again.' };
    }

    return (data as GetSemesterPenaltyResponse) || { status: 'server_error', message: 'Unable to fetch your semester penalty summary.' };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.message.includes('timed out');
    return {
      status: 'server_error',
      message: isTimeout
        ? 'Penalty summary request timed out. Please check your network.'
        : 'Network connection issue. Please check your connection.',
    };
  }
}
