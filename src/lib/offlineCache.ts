/**
 * AttendEase Student Portal - Offline Read Cache
 * Phase 6: PWA / Service Worker + Offline Read Caching
 *
 * ZERO-TRUST SECURITY & STORAGE INVARIANTS:
 * 1. Uses sessionStorage ONLY.
 * 2. Caches sanitized read-only attendance records for UI continuity.
 * 3. NEVER stores session tokens, QR tokens, credentials, or auth headers.
 * 4. NEVER stores raw Supabase database error objects or internal metadata.
 * 5. Data is strictly session-bound and purged on logout or watchdog expiration.
 * 6. Default TTL: 24 hours.
 */

import type {
  TodayAttendanceRecord,
  AttendanceHistoryRecord,
  SemesterPenaltySummary,
} from '../types/portal';

export const CACHE_KEYS = {
  TODAY: 'attendease_offline_today',
  PENALTY_SUMMARY: 'attendease_offline_penalty_summary',
  HISTORY_PAGE_PREFIX: 'attendease_offline_history_p_',
  HISTORY_PAGES_INDEX: 'attendease_offline_history_pages_index',
} as const;

export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedTodayData {
  records: TodayAttendanceRecord[];
  serverDate?: string;
  fetchedAt: number;
}

export interface CachedTodayResult {
  records: TodayAttendanceRecord[];
  serverDate?: string;
  fetchedAt: number;
  isStale: boolean;
}

export interface CachedHistoryPageData {
  page: number;
  pageSize: number;
  records: AttendanceHistoryRecord[];
  totalCount: number;
  fetchedAt: number;
}

export interface CachedHistoryResult {
  page: number;
  pageSize: number;
  records: AttendanceHistoryRecord[];
  totalCount: number;
  fetchedAt: number;
  isStale: boolean;
}

/**
 * Pure sanitization helper for TodayAttendanceRecord.
 * Strips any potential tokens, auth artifacts, or raw internal database fields.
 */
export function sanitizeTodayRecord(raw: TodayAttendanceRecord): TodayAttendanceRecord {
  return {
    session_id: String(raw.session_id || ''),
    session_title: String(raw.session_title || raw.session_name || 'Attendance Session'),
    session_description: raw.session_description ? String(raw.session_description) : null,
    main_session_name: raw.main_session_name ? String(raw.main_session_name) : null,
    date: raw.date ? String(raw.date) : undefined,
    start_time: raw.start_time ? String(raw.start_time) : (raw.starts_at ? String(raw.starts_at) : null),
    end_time: raw.end_time ? String(raw.end_time) : (raw.ends_at ? String(raw.ends_at) : null),
    session_status: raw.session_status ? String(raw.session_status) : undefined,
    time_in: raw.time_in ? String(raw.time_in) : (raw.actual_time_in ? String(raw.actual_time_in) : null),
    time_out: raw.time_out ? String(raw.time_out) : (raw.actual_time_out ? String(raw.actual_time_out) : null),
    raw_status: raw.raw_status ? String(raw.raw_status) : null,
    portal_status: raw.portal_status ? String(raw.portal_status) : undefined,
    is_late: Boolean(raw.is_late),
    late_label: raw.late_label ? String(raw.late_label) : null,
    department: raw.department ? String(raw.department) : null,
  };
}

/**
 * Pure sanitization helper for AttendanceHistoryRecord.
 */
export function sanitizeHistoryRecord(raw: AttendanceHistoryRecord): AttendanceHistoryRecord {
  return {
    session_id: String(raw.session_id || ''),
    session_title: String(raw.session_title || raw.session_name || 'Attendance Session'),
    session_description: raw.session_description ? String(raw.session_description) : null,
    main_session_name: raw.main_session_name ? String(raw.main_session_name) : null,
    date: String(raw.date || ''),
    start_time: raw.start_time ? String(raw.start_time) : null,
    end_time: raw.end_time ? String(raw.end_time) : null,
    session_status: raw.session_status ? String(raw.session_status) : undefined,
    time_in: raw.time_in ? String(raw.time_in) : null,
    time_out: raw.time_out ? String(raw.time_out) : null,
    raw_status: raw.raw_status ? String(raw.raw_status) : null,
    portal_status: raw.portal_status ? String(raw.portal_status) : undefined,
    is_late: Boolean(raw.is_late),
    late_label: raw.late_label ? String(raw.late_label) : null,
    penalty_php: typeof raw.penalty_php === 'number' && !isNaN(raw.penalty_php) && raw.penalty_php > 0 ? raw.penalty_php : undefined,
    is_unattended: Boolean(raw.is_unattended),
  };
}

/**
 * Saves the sanitized semester penalty summary to sessionStorage.
 */
export function saveCachedPenaltySummary(summary: SemesterPenaltySummary): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = { summary, fetchedAt: Date.now() };
    sessionStorage.setItem(CACHE_KEYS.PENALTY_SUMMARY, JSON.stringify(payload));
  } catch {
    // Gracefully ignore storage quota errors
  }
}

/**
 * Retrieves the cached semester penalty summary from sessionStorage if valid.
 */
export function getCachedPenaltySummary(
  maxAgeMs: number = DEFAULT_CACHE_TTL_MS
): { summary: SemesterPenaltySummary; fetchedAt: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEYS.PENALTY_SUMMARY);
    if (!raw) return null;

    const data = JSON.parse(raw) as { summary?: SemesterPenaltySummary; fetchedAt?: number };
    if (!data || !data.summary || typeof data.fetchedAt !== 'number') {
      return null;
    }

    if (!isCacheValid(data.fetchedAt, maxAgeMs)) {
      sessionStorage.removeItem(CACHE_KEYS.PENALTY_SUMMARY);
      return null;
    }

    return { summary: data.summary, fetchedAt: data.fetchedAt };
  } catch {
    return null;
  }
}

/**
 * Checks if a cache entry is within the allowable TTL window.
 */
export function isCacheValid(fetchedAt: number, maxAgeMs: number = DEFAULT_CACHE_TTL_MS): boolean {
  if (!fetchedAt || typeof fetchedAt !== 'number' || isNaN(fetchedAt)) {
    return false;
  }
  const age = Date.now() - fetchedAt;
  if (maxAgeMs >= 1000) {
    return age >= 0 && age <= maxAgeMs + 100;
  }
  return age >= 0 && age <= maxAgeMs;
}

/**
 * Formats a cached timestamp into a friendly human-readable string.
 * Example: "8:42 AM" or "Aug 21, 8:42 AM"
 */
export function formatCacheTimestamp(timestamp: number): string {
  if (!timestamp) return 'recently';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return 'recently';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return 'recently';
  }
}

/**
 * Formats relative time elapsed since the cache entry was saved.
 * Example: "Just now", "5 minutes ago", "2 hours ago"
 */
export function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'recently';
  const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
  if (secondsAgo < 60) return 'just now';
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  return formatCacheTimestamp(timestamp);
}

/**
 * Saves sanitized Today Attendance records to sessionStorage.
 */
export function saveCachedTodayAttendance(
  records: TodayAttendanceRecord[],
  serverDate?: string
): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = records.map(sanitizeTodayRecord);
    const payload: CachedTodayData = {
      records: sanitized,
      serverDate: serverDate ? String(serverDate) : undefined,
      fetchedAt: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEYS.TODAY, JSON.stringify(payload));
  } catch {
    // Gracefully ignore storage quota errors in private browsing
  }
}

/**
 * Retrieves cached Today Attendance records from sessionStorage if valid.
 */
export function getCachedTodayAttendance(
  maxAgeMs: number = DEFAULT_CACHE_TTL_MS
): CachedTodayResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEYS.TODAY);
    if (!raw) return null;

    const data = JSON.parse(raw) as CachedTodayData;
    if (!data || !Array.isArray(data.records) || typeof data.fetchedAt !== 'number') {
      return null;
    }

    const isValid = isCacheValid(data.fetchedAt, maxAgeMs);
    if (!isValid) {
      // Purge expired cache entry
      sessionStorage.removeItem(CACHE_KEYS.TODAY);
      return null;
    }

    return {
      records: data.records.map(sanitizeTodayRecord),
      serverDate: data.serverDate,
      fetchedAt: data.fetchedAt,
      isStale: Date.now() - data.fetchedAt > 5 * 60 * 1000, // Mark stale if older than 5 mins
    };
  } catch {
    return null;
  }
}

/**
 * Saves a sanitized History page to sessionStorage.
 */
export function saveCachedHistoryPage(
  page: number,
  pageSize: number,
  records: AttendanceHistoryRecord[],
  totalCount: number
): void {
  if (typeof window === 'undefined' || page < 1 || pageSize < 1) return;
  try {
    const sanitized = records.map(sanitizeHistoryRecord);
    const payload: CachedHistoryPageData = {
      page,
      pageSize,
      records: sanitized,
      totalCount: Math.max(0, totalCount),
      fetchedAt: Date.now(),
    };

    const key = `${CACHE_KEYS.HISTORY_PAGE_PREFIX}${page}_${pageSize}`;
    sessionStorage.setItem(key, JSON.stringify(payload));

    // Update index of cached pages
    const rawIndex = sessionStorage.getItem(CACHE_KEYS.HISTORY_PAGES_INDEX);
    const index: string[] = rawIndex ? JSON.parse(rawIndex) : [];
    if (!index.includes(key)) {
      index.push(key);
      sessionStorage.setItem(CACHE_KEYS.HISTORY_PAGES_INDEX, JSON.stringify(index));
    }
  } catch {
    // Gracefully ignore storage quota errors
  }
}

/**
 * Retrieves a cached History page from sessionStorage if valid.
 */
export function getCachedHistoryPage(
  page: number,
  pageSize: number,
  maxAgeMs: number = DEFAULT_CACHE_TTL_MS
): CachedHistoryResult | null {
  if (typeof window === 'undefined' || page < 1 || pageSize < 1) return null;
  try {
    const key = `${CACHE_KEYS.HISTORY_PAGE_PREFIX}${page}_${pageSize}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw) as CachedHistoryPageData;
    if (!data || !Array.isArray(data.records) || typeof data.fetchedAt !== 'number') {
      return null;
    }

    const isValid = isCacheValid(data.fetchedAt, maxAgeMs);
    if (!isValid) {
      sessionStorage.removeItem(key);
      return null;
    }

    return {
      page: data.page,
      pageSize: data.pageSize,
      records: data.records.map(sanitizeHistoryRecord),
      totalCount: data.totalCount,
      fetchedAt: data.fetchedAt,
      isStale: Date.now() - data.fetchedAt > 5 * 60 * 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Lists all page numbers currently available in the history cache for a given page size.
 */
export function getCachedHistoryPageNumbers(pageSize: number): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const rawIndex = sessionStorage.getItem(CACHE_KEYS.HISTORY_PAGES_INDEX);
    if (!rawIndex) return [];
    const index: string[] = JSON.parse(rawIndex);
    const suffix = `_${pageSize}`;
    return index
      .filter((k) => k.startsWith(CACHE_KEYS.HISTORY_PAGE_PREFIX) && k.endsWith(suffix))
      .map((k) => {
        const match = k.match(new RegExp(`^${CACHE_KEYS.HISTORY_PAGE_PREFIX}(\\d+)_`));
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null && !isNaN(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * Completely clears all offline attendance cache entries from sessionStorage.
 * Invoked during student logout or session watchdog forceExpire().
 */
export function clearOfflineCache(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEYS.TODAY);
    sessionStorage.removeItem(CACHE_KEYS.PENALTY_SUMMARY);

    // Remove all cached history pages via index
    const rawIndex = sessionStorage.getItem(CACHE_KEYS.HISTORY_PAGES_INDEX);
    if (rawIndex) {
      const index: string[] = JSON.parse(rawIndex);
      for (const key of index) {
        sessionStorage.removeItem(key);
      }
    }
    sessionStorage.removeItem(CACHE_KEYS.HISTORY_PAGES_INDEX);

    // Fallback sweep of any remaining matching keys in sessionStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith('attendease_offline_') || k.startsWith('attendease_cached_'))) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      sessionStorage.removeItem(k);
    }
  } catch {
    // Ignore clear errors
  }
}
