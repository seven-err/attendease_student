import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AttendanceHistoryRecord } from '../../types/portal';
import { getAttendanceHistory } from '../../lib/api';
import {
  saveCachedHistoryPage,
  getCachedHistoryPage,
  formatCacheTimestamp,
  formatTimeAgo,
} from '../../lib/offlineCache';
import { AttendanceStatus } from './AttendanceStatus';
import { AttendanceTimeRow, formatAttendanceTime } from './AttendanceTimeRow';
import {
  Calendar,
  Clock,
  RotateCw,
  AlertTriangle,
  History,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileQuestion,
  CloudOff,
  WifiOff,
} from 'lucide-react';

export { formatAttendanceTime };

export interface AttendanceHistoryProps {
  sessionToken: string | null;
  onSessionExpired: () => void;
  pageSize?: number;
  className?: string;
  onReportIssue?: (session: { sessionId: string; sessionTitle: string; date?: string }) => void;
  isOffline?: boolean;
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * Formats a YYYY-MM-DD date string into human-readable format, e.g., "Friday, Aug 21, 2026".
 */
export function formatHistoryDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      const [year, month, day] = parts;
      const dt = new Date(year, month - 1, day);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    }
    const dt = new Date(dateStr);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {
    return dateStr;
  }
  return dateStr;
}

/**
 * Formats "HH:MM:SS" or "HH:MM" schedule string into 12-hour format, e.g. "8:00 AM".
 */
export function formatScheduleTime(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  try {
    const parts = timeStr.split(':').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const dummy = new Date();
      dummy.setHours(parts[0], parts[1], 0, 0);
      return dummy.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
  } catch {
    return null;
  }
  return null;
}

export const AttendanceHistory: React.FC<AttendanceHistoryProps> = ({
  sessionToken,
  onSessionExpired,
  pageSize = DEFAULT_PAGE_SIZE,
  className = '',
  onReportIssue,
  isOffline = false,
}) => {
  const [records, setRecords] = useState<AttendanceHistoryRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [isPaginating, setIsPaginating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Offline caching states
  const [isFromCache, setIsFromCache] = useState<boolean>(false);
  const [cacheTimestamp, setCacheTimestamp] = useState<number | null>(null);
  const [isPageUncachedOffline, setIsPageUncachedOffline] = useState<boolean>(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  // Concurrency guard ref to prevent duplicate in-flight requests
  const isFetchingRef = useRef<boolean>(false);
  // Track active token to discard stale responses on session reset
  const activeTokenRef = useRef<string | null>(sessionToken);
  activeTokenRef.current = sessionToken;
  // Mount state tracking to prevent state updates after unmount
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /**
   * Fetches attendance history for a specific page with offline fallback.
   */
  const fetchPage = useCallback(
    async (targetPage: number, isInitial: boolean = false) => {
      if (!sessionToken) return;

      // Duplicate-request concurrency protection
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      setError(null);

      if (isInitial) {
        setIsLoadingInitial(true);
      } else {
        setIsPaginating(true);
      }

      // Check if device is offline
      if (isOffline) {
        const cached = getCachedHistoryPage(targetPage, pageSize);
        if (isMountedRef.current) {
          if (cached) {
            setRecords(cached.records);
            setTotalCount(cached.totalCount);
            setPage(targetPage);
            setIsFromCache(true);
            setCacheTimestamp(cached.fetchedAt);
            setIsPageUncachedOffline(false);
            setError(null);
          } else {
            // Page not cached offline - do not fabricate data
            setRecords([]);
            setPage(targetPage);
            setIsFromCache(false);
            setCacheTimestamp(null);
            setIsPageUncachedOffline(true);
            setError(null);
          }

          setIsLoadingInitial(false);
          setIsPaginating(false);
        }
        isFetchingRef.current = false;
        return;
      }

      // Online: Fetch authoritative backend data
      const offset = (targetPage - 1) * pageSize;
      const response = await getAttendanceHistory(sessionToken, pageSize, offset);

      // Check if component unmounted or session token changed while request was in-flight
      if (!isMountedRef.current || activeTokenRef.current !== sessionToken) {
        isFetchingRef.current = false;
        return;
      }

      if (response.status === 'ok') {
        const fetchedRecords = response.records || [];
        const count = response.total_count ?? fetchedRecords.length;

        setRecords(fetchedRecords);
        setTotalCount(count);
        setPage(targetPage);
        setIsFromCache(false);
        setCacheTimestamp(null);
        setIsPageUncachedOffline(false);
        setError(null);

        // Update offline cache for this page
        saveCachedHistoryPage(targetPage, pageSize, fetchedRecords, count);
      } else if (response.status === 'session_expired') {
        onSessionExpired();
      } else {
        // Network or server error - check for cached fallback
        const fallbackCache = getCachedHistoryPage(targetPage, pageSize);
        if (fallbackCache) {
          setRecords(fallbackCache.records);
          setTotalCount(fallbackCache.totalCount);
          setPage(targetPage);
          setIsFromCache(true);
          setCacheTimestamp(fallbackCache.fetchedAt);
          setIsPageUncachedOffline(false);
          setError(null);
        } else {
          setError('Unable to load attendance history. Check your connection and try again.');
        }
      }

      if (isMountedRef.current) {
        setIsLoadingInitial(false);
        setIsPaginating(false);
      }
      isFetchingRef.current = false;
    },
    [sessionToken, pageSize, onSessionExpired, isOffline]
  );

  // Initial load and reset when sessionToken or isOffline changes
  useEffect(() => {
    if (!isMountedRef.current) return;
    setPage(1);
    setRecords([]);
    setTotalCount(0);
    setError(null);

    if (sessionToken) {
      fetchPage(1, true);
    } else {
      setIsLoadingInitial(false);
    }
  }, [sessionToken, isOffline, fetchPage]);

  // Page navigation handlers
  const handlePreviousPage = () => {
    if (page > 1 && !isLoadingInitial && !isPaginating) {
      fetchPage(page - 1, false);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages && !isLoadingInitial && !isPaginating) {
      fetchPage(page + 1, false);
    }
  };

  const handleRetry = () => {
    if (!isLoadingInitial && !isPaginating) {
      fetchPage(page, records.length === 0);
    }
  };

  const handleRefresh = () => {
    if (isOffline) {
      setOfflineNotice("You're offline. Connect to internet to update past records.");
      setTimeout(() => setOfflineNotice(null), 3500);
      return;
    }
    if (!isLoadingInitial && !isPaginating) {
      fetchPage(page, false);
    }
  };

  // Calculate display range (e.g., Showing 1-10 of 25)
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className={`attendance-history-container ${className}`} aria-label="Attendance History Dashboard">
      {/* Section Header */}
      <header className="history-section-header">
        <div className="history-header-titles">
          <div className="history-header-badge">
            <History size={13} aria-hidden="true" />
            <span>Past Records</span>
          </div>
          <h2 className="history-title">Attendance History</h2>
        </div>

        <div className="history-header-actions">
          {totalCount > 0 && !isLoadingInitial && !isPageUncachedOffline && (
            <span className="history-total-count-pill" aria-label={`Total of ${totalCount} records`}>
              {totalCount} {totalCount === 1 ? 'Record' : 'Records'}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoadingInitial || isPaginating}
            className={`refresh-btn ${isPaginating ? 'is-refreshing' : ''} ${isOffline ? 'is-offline-btn' : ''}`}
            aria-label={isPaginating ? 'Updating history' : 'Refresh history'}
            title={isOffline ? "You're offline" : 'Refresh history records'}
          >
            <RotateCw size={16} className={isPaginating ? 'spin-animation' : ''} aria-hidden="true" />
            <span className="refresh-label">{isPaginating ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Offline Cached Indicator Banner */}
      {(isFromCache || isOffline) && !isPageUncachedOffline && records.length > 0 && (
        <div className="today-offline-indicator" role="status" aria-live="polite">
          <div className="offline-indicator-left">
            <CloudOff size={14} className="offline-indicator-icon" aria-hidden="true" />
            <span className="offline-indicator-text">Offline — showing cached page</span>
          </div>
          {cacheTimestamp && (
            <span className="offline-indicator-time">
              Last updated: {formatCacheTimestamp(cacheTimestamp)} ({formatTimeAgo(cacheTimestamp)})
            </span>
          )}
        </div>
      )}

      {/* Transient Offline Refresh Toast */}
      {offlineNotice && (
        <div className="offline-transient-toast" role="alert">
          <WifiOff size={13} aria-hidden="true" />
          <span>{offlineNotice}</span>
        </div>
      )}

      {/* State 1: Initial Skeleton Loading State */}
      {isLoadingInitial && (
        <div className="history-skeleton-container" aria-busy="true" aria-label="Loading attendance history">
          <div className="skeleton-card">
            <div className="skeleton-line skeleton-header-badge shimmer" />
            <div className="skeleton-line skeleton-title shimmer" />
            <div className="skeleton-line skeleton-subtitle shimmer" />
            <div className="skeleton-time-row">
              <div className="skeleton-box shimmer" />
              <div className="skeleton-box shimmer" />
            </div>
          </div>
          <div className="skeleton-card">
            <div className="skeleton-line skeleton-header-badge shimmer" />
            <div className="skeleton-line skeleton-title shimmer" />
            <div className="skeleton-line skeleton-subtitle shimmer" />
            <div className="skeleton-time-row">
              <div className="skeleton-box shimmer" />
              <div className="skeleton-box shimmer" />
            </div>
          </div>
        </div>
      )}

      {/* State 2: Error State (with Retry action) */}
      {!isLoadingInitial && error && !isFromCache && (
        <div className="card attendance-error-card" role="alert">
          <div className="error-icon-wrapper">
            <AlertTriangle size={24} className="text-warning" aria-hidden="true" />
          </div>
          <div className="error-content">
            <h3 className="error-title">Unable to load attendance history</h3>
            <p className="error-description">Check your connection and try again.</p>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isPaginating}
            className="btn btn-primary retry-btn"
          >
            <RotateCw size={14} className={isPaginating ? 'spin-animation' : ''} aria-hidden="true" />
            <span>{isPaginating ? 'Retrying...' : 'Retry'}</span>
          </button>
        </div>
      )}

      {/* State 3A: Offline Uncached Page Notice */}
      {!isLoadingInitial && isPageUncachedOffline && (
        <div className="card history-uncached-card" role="region" aria-label="Page unavailable offline">
          <div className="offline-empty-icon-halo">
            <WifiOff size={28} className="text-warning" aria-hidden="true" />
          </div>
          <h3 className="empty-heading">This page isn't available offline</h3>
          <p className="empty-subtext">
            Page {page} has not been downloaded to this device yet. Reconnect to the internet to load and view past attendance records.
          </p>
          <div className="history-uncached-actions">
            {page > 1 && (
              <button
                type="button"
                onClick={() => fetchPage(1, false)}
                className="btn btn-secondary empty-refresh-btn"
              >
                <span>Return to Page 1</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* State 3B: Normal Empty State (Zero records returned) */}
      {!isLoadingInitial && !error && !isPageUncachedOffline && records.length === 0 && (
        <div className="card history-empty-card" role="region" aria-label="No attendance records">
          <div className="empty-icon-halo">
            <History size={28} className="text-accent" aria-hidden="true" />
          </div>
          <h3 className="empty-heading">No attendance records yet</h3>
          <p className="empty-subtext">
            When you participate in attendance sessions, your historical logs and time stamps will appear here.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPaginating}
            className="btn btn-secondary empty-refresh-btn"
          >
            <RotateCw size={14} className={isPaginating ? 'spin-animation' : ''} aria-hidden="true" />
            <span>Check for updates</span>
          </button>
        </div>
      )}

      {/* State 4: Paginated Records List */}
      {!isLoadingInitial && records.length > 0 && (
        <div className={`history-list-wrapper ${isPaginating ? 'history-list-paginating' : ''}`}>
          {/* Subtle localized loading indicator during pagination */}
          {isPaginating && (
            <div className="history-pagination-overlay" aria-live="polite">
              <div className="history-pagination-spinner">
                <Sparkles size={16} className="spin-animation text-accent" />
                <span>Updating records...</span>
              </div>
            </div>
          )}

          <div className="history-records-list" role="feed" aria-label="Historical attendance sessions">
            {records.map((record) => {
              const formattedDate = formatHistoryDate(record.date);
              const startTimeFormatted = formatScheduleTime(record.start_time);
              const endTimeFormatted = formatScheduleTime(record.end_time);
              const hasSchedule = startTimeFormatted || endTimeFormatted;

              return (
                <article key={record.session_id} className="card history-item-card">
                  {/* Top Bar: Date Badge + Authoritative Status */}
                  <div className="history-card-topbar">
                    <div className="history-date-chip">
                      <Calendar size={13} aria-hidden="true" />
                      <time dateTime={record.date}>{formattedDate}</time>
                    </div>
                    <AttendanceStatus
                      portalStatus={record.portal_status}
                      timeIn={record.time_in}
                      timeOut={record.time_out}
                      isLate={record.is_late}
                      lateLabel={record.late_label}
                    />
                  </div>

                  {/* Title & Parent Session */}
                  <div className="history-card-body">
                    <h3 className="history-session-title">{record.session_title}</h3>
                    {record.main_session_name &&
                      record.main_session_name.trim().toLowerCase() !== record.session_title.trim().toLowerCase() && (
                        <span className="history-parent-name">{record.main_session_name}</span>
                      )}

                    {/* Schedule info if available */}
                    {hasSchedule && (
                      <div className="history-schedule-meta">
                        <Clock size={12} aria-hidden="true" />
                        <span>
                          {startTimeFormatted || '—'} {endTimeFormatted ? `– ${endTimeFormatted}` : ''}
                        </span>
                        {record.session_status && (
                          <span className="history-status-pill">{record.session_status}</span>
                        )}
                      </div>
                    )}

                    {/* Description if provided */}
                    {record.session_description && (
                      <p className="history-description-text">{record.session_description}</p>
                    )}
                  </div>

                  {/* Time In & Time Out Row */}
                  <AttendanceTimeRow
                    timeIn={record.time_in}
                    timeOut={record.time_out}
                  />

                  {/* Report Discrepancy Action */}
                  {onReportIssue && (
                    <div className="history-card-footer">
                      <button
                        type="button"
                        onClick={() =>
                          onReportIssue({
                            sessionId: record.session_id,
                            sessionTitle: record.session_title,
                            date: formattedDate,
                          })
                        }
                        className="history-report-action-btn"
                        aria-label={`Report an attendance issue for ${record.session_title}`}
                      >
                        <FileQuestion size={13} aria-hidden="true" />
                        <span>Report Issue</span>
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* Pagination Navigation Controls */}
          <nav className="pagination-bar" aria-label="Attendance History Pagination">
            <button
              type="button"
              onClick={handlePreviousPage}
              disabled={page <= 1 || isLoadingInitial || isPaginating}
              className="pagination-btn pagination-btn-prev"
              aria-label="Go to previous page"
            >
              <ChevronLeft size={18} aria-hidden="true" />
              <span>Previous</span>
            </button>

            <div className="pagination-info" role="status" aria-live="polite">
              <span className="pagination-page-label">
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
              </span>
              {totalCount > 0 && (
                <span className="pagination-range-subtext">
                  Showing {rangeStart}–{rangeEnd} of {totalCount}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={page >= totalPages || isLoadingInitial || isPaginating}
              className="pagination-btn pagination-btn-next"
              aria-label="Go to next page"
            >
              <span>Next</span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
};
