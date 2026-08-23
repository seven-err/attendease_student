import React, { useState, useEffect } from 'react';
import type { TodayAttendanceRecord, AttendanceHistoryRecord } from '../../types/portal';
import { AttendanceStatus, getAttendanceStatusDisplay } from './AttendanceStatus';
import { AttendanceTimeRow, formatAttendanceTime } from './AttendanceTimeRow';
import { formatCacheTimestamp, formatTimeAgo } from '../../lib/offlineCache';
import { getAttendanceHistory } from '../../lib/api';
import {
  RotateCw,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileQuestion,
  WifiOff,
  CloudOff,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  ArrowLeft,
} from 'lucide-react';

export { formatAttendanceTime };

export interface TodayAttendanceProps {
  records: TodayAttendanceRecord[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  serverDate?: string;
  sessionToken?: string | null;
  userRole?: 'student' | 'employee';
  userDepartment?: string | null;
  userYearLevel?: string | null;
  studentDepartment?: string | null; // Backward-compatibility
  onRefresh: () => void;
  onReportIssue?: (session: { sessionId: string; sessionTitle: string; date?: string }) => void;
  isOffline?: boolean;
  isFromCache?: boolean;
  cacheTimestamp?: number | null;
}

export function isDepartmentMatching(
  sessionDept?: string | null,
  userDept?: string | null
): boolean {
  if (!sessionDept || sessionDept.trim() === '' || sessionDept.trim().toLowerCase() === 'all' || sessionDept.trim().toLowerCase() === 'institution') {
    return true; // Institutional / All-department session
  }
  if (!userDept || userDept.trim() === '') {
    return false;
  }
  const cleanSession = sessionDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanUser = userDept.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleanSession === cleanUser;
}

export function isYearLevelMatching(
  targetYearLevels?: string[] | null,
  userYearLevel?: string | null
): boolean {
  if (!targetYearLevels || targetYearLevels.length === 0) {
    return true; // All year levels included
  }
  if (!userYearLevel || userYearLevel.trim() === '') {
    return true; // Default to allow if user year level is not recorded
  }
  const cleanUserYear = userYearLevel.trim().toLowerCase();
  const userDigits = cleanUserYear.match(/\d+/)?.[0];

  return targetYearLevels.some((yl) => {
    const cleanYl = yl.trim().toLowerCase();
    if (cleanYl === cleanUserYear) return true;
    const ylDigits = cleanYl.match(/\d+/)?.[0];
    if (userDigits && ylDigits && userDigits === ylDigits) {
      return true;
    }
    return false;
  });
}

export function isScheduleForAudience(
  record: TodayAttendanceRecord,
  userRole: 'student' | 'employee'
): boolean {
  const targetRole = record.session_type || record.raw_status;
  if (!targetRole || targetRole.trim() === '' || targetRole.trim().toLowerCase() === 'all') {
    return true;
  }
  const normalizedTarget = targetRole.trim().toLowerCase();
  if (normalizedTarget === 'students_only' || normalizedTarget === 'student') {
    return userRole === 'student';
  }
  if (normalizedTarget === 'employees_only' || normalizedTarget === 'employee' || normalizedTarget === 'faculty') {
    return userRole === 'employee';
  }
  return true;
}

export function formatTodayHeaderDate(dateString?: string): string {
  try {
    if (dateString) {
      const [year, month, day] = dateString.split('-').map(Number);
      if (year && month && day) {
        const d = new Date(year, month - 1, day);
        return d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    }
  } catch {
    // Fall back to client date
  }

  return new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatScheduleTime(timeStr?: string | null): string | null {
  if (!timeStr) return null;
  try {
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
      return `${displayHours}:${displayMinutes} ${period}`;
    }
  } catch {
    return timeStr;
  }
  return null;
}

export interface CalendarDay {
  date: Date;
  dateString: string; // 'YYYY-MM-DD'
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  isSelected: boolean;
}

export function formatLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatContextualDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function getWeekDays(referenceDate?: string) {
  const base = referenceDate ? new Date(referenceDate) : new Date();
  const currentDay = base.getDay();
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday =
      d.getFullYear() === base.getFullYear() &&
      d.getMonth() === base.getMonth() &&
      d.getDate() === base.getDate();

    days.push({
      date: d,
      dateString: formatLocalDateString(d),
      dayNameShort: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      dayNameMedium: d.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNumber: d.getDate(),
      isToday,
    });
  }
  return days;
}

export function getMonthDays(
  viewYear: number,
  viewMonth: number,
  todayStr: string,
  selectedStr: string
): CalendarDay[] {
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);

  // Align Monday = 0, ..., Sunday = 6
  const startDayWeekday = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = lastDayOfMonth.getDate();

  const days: CalendarDay[] = [];

  // Trailing previous month days
  const prevMonthLastDate = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = startDayWeekday - 1; i >= 0; i--) {
    const d = new Date(viewYear, viewMonth - 1, prevMonthLastDate - i);
    const dateString = formatLocalDateString(d);
    days.push({
      date: d,
      dateString,
      dayNumber: d.getDate(),
      isCurrentMonth: false,
      isToday: dateString === todayStr,
      isPast: dateString < todayStr,
      isFuture: dateString > todayStr,
      isSelected: dateString === selectedStr,
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(viewYear, viewMonth, i);
    const dateString = formatLocalDateString(d);
    days.push({
      date: d,
      dateString,
      dayNumber: i,
      isCurrentMonth: true,
      isToday: dateString === todayStr,
      isPast: dateString < todayStr,
      isFuture: dateString > todayStr,
      isSelected: dateString === selectedStr,
    });
  }

  // Next month leading days to complete grid (multiples of 7)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(viewYear, viewMonth + 1, i);
    const dateString = formatLocalDateString(d);
    days.push({
      date: d,
      dateString,
      dayNumber: i,
      isCurrentMonth: false,
      isToday: dateString === todayStr,
      isPast: dateString < todayStr,
      isFuture: dateString > todayStr,
      isSelected: dateString === selectedStr,
    });
  }

  return days;
}

export function formatMonthYear(dateString?: string): string {
  const dt = dateString ? new Date(dateString) : new Date();
  return dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export const TodayAttendance: React.FC<TodayAttendanceProps> = ({
  records,
  isLoading,
  isRefreshing,
  error,
  serverDate,
  sessionToken,
  userRole = 'student',
  userDepartment,
  userYearLevel,
  studentDepartment,
  onRefresh,
  onReportIssue,
  isOffline = false,
  isFromCache = false,
  cacheTimestamp = null,
}) => {
  const todayDateStr = serverDate ? serverDate.split('T')[0] : formatLocalDateString(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayDateStr);
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (serverDate) {
      const [y, m, d] = serverDate.split('-').map(Number);
      return new Date(y, m - 1, d || 1);
    }
    return new Date();
  });
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week'>('week');
  const [pastRecordsMap, setPastRecordsMap] = useState<Record<string, AttendanceHistoryRecord[]>>({});
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);

  const effectiveRole: 'student' | 'employee' = userRole;
  const effectiveDept = userDepartment || studentDepartment || null;

  // Preload past attendance history to empower instant calendar exploration
  useEffect(() => {
    if (!sessionToken || isOffline) return;
    let isCancelled = false;

    async function fetchPastHistory() {
      try {
        const res = await getAttendanceHistory(sessionToken!, 100, 0);
        if (!isCancelled && res.status === 'ok' && res.records) {
          const map: Record<string, AttendanceHistoryRecord[]> = {};
          for (const rec of res.records) {
            const dateKey = rec.date;
            if (!map[dateKey]) map[dateKey] = [];
            map[dateKey].push(rec);
          }
          setPastRecordsMap(map);
        }
      } catch {
        // Silently tolerate background history preloading
      }
    }

    fetchPastHistory();
    return () => {
      isCancelled = true;
    };
  }, [sessionToken, isOffline]);

  // Keep selectedDate in sync if serverDate changes initially
  useEffect(() => {
    if (serverDate) {
      const parsed = serverDate.split('T')[0];
      setSelectedDate(parsed);
      const [y, m, d] = parsed.split('-').map(Number);
      setViewDate(new Date(y, m - 1, d || 1));
    }
  }, [serverDate]);

  // Filter records strictly to schedules matching the user's role (Student vs Employee), department, and year level
  const visibleRecords = React.useMemo(() => {
    return records.filter((r) => {
      // 1. Audience role matching (Student vs Employee)
      if (!isScheduleForAudience(r, effectiveRole)) {
        return false;
      }

      // 2. Department matching
      if (!isDepartmentMatching(r.department, effectiveDept)) {
        return false;
      }

      // 3. Year Level matching (for students only if session specifies target year levels)
      if (effectiveRole === 'student' && !isYearLevelMatching(r.target_year_levels, userYearLevel)) {
        return false;
      }

      return true;
    });
  }, [records, effectiveRole, effectiveDept, userYearLevel]);

  // Summary counts for today
  const totalSessions = visibleRecords.length;
  const completedSessions = visibleRecords.filter(
    (r) => Boolean(r.time_in) && Boolean(r.time_out)
  ).length;
  const activeSessions = visibleRecords.filter(
    (r) => Boolean(r.time_in) && !r.time_out
  ).length;

  const handleRefreshClick = () => {
    if (isOffline) {
      setOfflineNotice("You're offline. Reconnect to fetch latest updates.");
      setTimeout(() => setOfflineNotice(null), 3500);
      return;
    }
    onRefresh();
  };

  // Calendar navigation handlers
  const handlePrevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleMonthSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = parseInt(e.target.value, 10);
    setViewDate((prev) => new Date(prev.getFullYear(), newMonth, 1));
  };

  const handleYearSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYear = parseInt(e.target.value, 10);
    setViewDate((prev) => new Date(newYear, prev.getMonth(), 1));
  };

  const handleJumpToToday = () => {
    setSelectedDate(todayDateStr);
    const [y, m, d] = todayDateStr.split('-').map(Number);
    setViewDate(new Date(y, m - 1, d || 1));
  };

  const monthDays = React.useMemo(() => {
    return getMonthDays(viewDate.getFullYear(), viewDate.getMonth(), todayDateStr, selectedDate);
  }, [viewDate, todayDateStr, selectedDate]);

  const weekDays = React.useMemo(() => {
    return getWeekDays(selectedDate || todayDateStr);
  }, [selectedDate, todayDateStr]);

  const isViewingToday = selectedDate === todayDateStr;
  const isViewingPast = selectedDate < todayDateStr;
  const isViewingUpcoming = selectedDate > todayDateStr;

  const pastRecordsForDate = pastRecordsMap[selectedDate] || [];
  const upcomingRecordsForDate = records.filter(
    (r) =>
      r.date === selectedDate &&
      isScheduleForAudience(r, effectiveRole) &&
      isDepartmentMatching(r.department, effectiveDept) &&
      (effectiveRole !== 'student' || isYearLevelMatching(r.target_year_levels, userYearLevel))
  );

  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const yearsList = [2025, 2026, 2027];
  const currentViewMonthName = viewDate.toLocaleDateString(undefined, { month: 'long' });
  const currentViewYear = viewDate.getFullYear();

  return (
    <div className="today-attendance-container" aria-label="Attendance Dashboard and Calendar">
      {/* Date & Control Header */}
      <header className="today-section-header">
        <div className="today-header-titles">
          <h2 className="today-title">
            {isViewingToday ? "Today's Attendance" : isViewingPast ? 'Past Attendance' : 'Upcoming Schedule'}
          </h2>
        </div>

        <div className="today-header-actions">
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isLoading || isRefreshing}
            className={`refresh-btn ${isRefreshing ? 'is-refreshing' : ''} ${isOffline ? 'is-offline-btn' : ''}`}
            aria-label={isRefreshing ? 'Refreshing today attendance' : 'Refresh today attendance'}
            title={isOffline ? "You're offline" : 'Refresh attendance records'}
          >
            <RotateCw size={16} className={isRefreshing ? 'spin-animation' : ''} aria-hidden="true" />
            <span className="refresh-label">{isRefreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {/* Offline Stale Data Notice Banner */}
      {(isFromCache || isOffline) && (
        <div className="today-offline-indicator" role="status" aria-live="polite">
          <div className="offline-indicator-left">
            <CloudOff size={14} className="offline-indicator-icon" aria-hidden="true" />
            <span className="offline-indicator-text">Offline — showing cached data</span>
          </div>
          {cacheTimestamp && (
            <span className="offline-indicator-time">
              Last updated: {formatCacheTimestamp(cacheTimestamp)} ({formatTimeAgo(cacheTimestamp)})
            </span>
          )}
        </div>
      )}

      {/* Transient Offline Refresh Hint */}
      {offlineNotice && (
        <div className="offline-transient-toast" role="alert">
          <WifiOff size={13} aria-hidden="true" />
          <span>{offlineNotice}</span>
        </div>
      )}

      {/* Week Summary Calendar Card (with Expandable Month Selector) */}
      <section className="card today-calendar-card" role="region" aria-label="Attendance Calendar Summary">
        {/* Calendar Header with Mode-Specific Controls */}
        <div className="calendar-card-header">
          {calendarViewMode === 'week' ? (
            <>
              <div className="calendar-month-title">
                <Calendar size={14} className="calendar-header-icon" aria-hidden="true" />
                <span>{currentViewMonthName} {currentViewYear}</span>
              </div>

              <button
                type="button"
                className="calendar-expand-toggle-btn"
                onClick={() => setCalendarViewMode('month')}
                aria-label="Expand to select month and date in detail"
              >
                <CalendarDays size={13} aria-hidden="true" />
                <span>Pick a Month</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <div className="calendar-nav-controls">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="calendar-nav-arrow-btn"
                  aria-label="View previous month"
                  title="Previous Month"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>

                <div className="calendar-selectors-group">
                  <label htmlFor="calendar-month-select" className="sr-only">Select Month</label>
                  <select
                    id="calendar-month-select"
                    className="calendar-select-input"
                    value={viewDate.getMonth()}
                    onChange={handleMonthSelectChange}
                    aria-label="Select calendar month"
                  >
                    {monthsList.map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="calendar-year-select" className="sr-only">Select Year</label>
                  <select
                    id="calendar-year-select"
                    className="calendar-select-input"
                    value={viewDate.getFullYear()}
                    onChange={handleYearSelectChange}
                    aria-label="Select calendar year"
                  >
                    {yearsList.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="calendar-nav-arrow-btn"
                  aria-label="View next month"
                  title="Next Month"
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                className="calendar-expand-toggle-btn active"
                onClick={() => setCalendarViewMode('week')}
                aria-label="Collapse to week summary view"
              >
                <span>This Week</span>
                <ChevronUp size={14} aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* Week Summary Strip (Default View) */}
        {calendarViewMode === 'week' && (
          <div className="calendar-days-row" role="grid" aria-label="Days of the current week">
            {weekDays.map((day) => {
              const isSelectedDay = day.dateString === selectedDate;
              const hasPastLog = Boolean(pastRecordsMap[day.dateString]?.length);

              return (
                <button
                  key={day.dateString}
                  type="button"
                  onClick={() => setSelectedDate(day.dateString)}
                  className={`calendar-day-item ${day.isToday ? 'is-today' : ''} ${isSelectedDay ? 'is-selected' : ''}`}
                  aria-label={`${day.dayNameMedium}, ${day.dayNumber}${day.isToday ? ' (Today)' : ''}`}
                  aria-pressed={isSelectedDay}
                >
                  <span className="calendar-day-label">{day.dayNameShort}</span>
                  <span className="calendar-day-num">{day.dayNumber}</span>
                  {day.isToday && <span className="calendar-active-dot" aria-hidden="true" />}
                  {hasPastLog && <span className="calendar-record-dot-week" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Detailed Month Grid View (Expanded Mode) */}
        {calendarViewMode === 'month' && (
          <>
            <div className="calendar-weekdays-row" aria-hidden="true">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>

            <div className="calendar-month-grid" role="grid" aria-label="Month days grid">
              {monthDays.map((day) => {
                const hasPastLog = Boolean(pastRecordsMap[day.dateString]?.length);
                const isSelectedDay = day.dateString === selectedDate;

                return (
                  <button
                    key={day.dateString}
                    type="button"
                    onClick={() => setSelectedDate(day.dateString)}
                    className={`calendar-day-cell ${day.isCurrentMonth ? 'in-month' : 'other-month'} ${day.isToday ? 'is-today' : ''} ${isSelectedDay ? 'is-selected' : ''}`}
                    aria-label={`${formatContextualDate(day.dateString)}${day.isToday ? ' (Today)' : ''}${hasPastLog ? ' (Has attendance records)' : ''}`}
                    aria-pressed={isSelectedDay}
                  >
                    <span className="calendar-day-number">{day.dayNumber}</span>
                    {day.isToday && <span className="calendar-today-badge" aria-hidden="true" />}
                    {hasPastLog && <span className="calendar-record-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Contextual Date Footer */}
        <div className="calendar-selected-footer">
          <div className="selected-date-meta">
            <span className="selected-date-title">{formatContextualDate(selectedDate)}</span>
            {isViewingToday && <span className="badge badge-success">Today</span>}
            {isViewingPast && <span className="badge badge-neutral">Past Date</span>}
            {isViewingUpcoming && <span className="badge badge-info">Upcoming</span>}
          </div>
        </div>
      </section>

      {/* Case 1: Today's Live Attendance View */}
      {isViewingToday && (
        <>
          {/* Today Attendance Summary Overview (when sessions exist) */}
          {!isLoading && !error && totalSessions > 0 && (
            <div
              className="today-summary-bar"
              role="region"
              aria-label="Today attendance summary counts"
              aria-live="polite"
            >
              <div className="summary-stat stat-scheduled">
                <span className="stat-label">Scheduled</span>
                <span className="stat-value">{totalSessions}</span>
              </div>
              <div className="summary-stat-divider" aria-hidden="true" />
              <div className="summary-stat stat-timed-in">
                <span className="stat-label">Timed In</span>
                <span className="stat-value text-info">
                  <Clock size={12} className="inline-icon" aria-hidden="true" /> {activeSessions}
                </span>
              </div>
              <div className="summary-stat-divider" aria-hidden="true" />
              <div className="summary-stat stat-completed">
                <span className="stat-label">Completed</span>
                <span className="stat-value text-success">
                  <CheckCircle2 size={12} className="inline-icon" aria-hidden="true" /> {completedSessions}
                </span>
              </div>
            </div>
          )}

          {/* State 1: Initial Loading Skeleton State */}
          {isLoading && (
            <div className="today-skeleton-container" aria-busy="true" aria-label="Loading your attendance">
              <p className="loading-caption">
                <RotateCw size={13} className="spin-animation" aria-hidden="true" />
                Loading your attendance&hellip;
              </p>
              <div className="skeleton-card">
                <div className="skeleton-line skeleton-title shimmer" />
                <div className="skeleton-line skeleton-subtitle shimmer" />
                <div className="skeleton-time-row">
                  <div className="skeleton-box shimmer" />
                  <div className="skeleton-box shimmer" />
                </div>
              </div>
              <div className="skeleton-card">
                <div className="skeleton-line skeleton-title shimmer" />
                <div className="skeleton-line skeleton-subtitle shimmer" />
                <div className="skeleton-time-row">
                  <div className="skeleton-box shimmer" />
                  <div className="skeleton-box shimmer" />
                </div>
              </div>
            </div>
          )}

          {/* State 2: Error State with Retry Button */}
          {!isLoading && error && !isFromCache && (
            <div className="card attendance-error-card" role="alert">
              <div className="error-icon-wrapper">
                <AlertTriangle size={24} className="text-warning" aria-hidden="true" />
              </div>
              <div className="error-content">
                <h3 className="error-title">Unable to load today's attendance</h3>
                <p className="error-description">We couldn't reach the attendance server. Check your internet connection and try again.</p>
              </div>
              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="btn btn-primary retry-btn"
              >
                <RotateCw size={14} className={isRefreshing ? 'spin-animation' : ''} aria-hidden="true" />
                <span>{isRefreshing ? 'Retrying...' : 'Try Again'}</span>
              </button>
            </div>
          )}

          {/* State 3A: Offline Empty State */}
          {!isLoading && !error && visibleRecords.length === 0 && isOffline && (
            <div className="card today-offline-empty-card" role="region" aria-label="Offline attendance unavailable">
              <div className="offline-empty-icon-halo">
                <WifiOff size={32} className="text-warning" aria-hidden="true" />
              </div>
              <h3 className="empty-heading">You're offline</h3>
              <p className="empty-subtext">
                Today's attendance hasn't been saved on this device yet. Connect to the internet to see your latest records.
              </p>
              <div className="offline-empty-badge">
                <span>Showing saved information only</span>
              </div>
            </div>
          )}

          {/* State 4: Today Attendance Records List */}
          {!isLoading && visibleRecords.length > 0 && (
            <div className="attendance-records-list" role="feed" aria-label="Today's attendance sessions">
              {visibleRecords.map((record) => {
                const title = record.session_title || record.session_name || 'Attendance Session';
                const startTimeFormatted = formatScheduleTime(record.start_time || record.starts_at);
                const endTimeFormatted = formatScheduleTime(record.end_time || record.ends_at);
                const hasSchedule = startTimeFormatted || endTimeFormatted;
                const { helpText: statusHelpText } = getAttendanceStatusDisplay(
                  record.portal_status,
                  record.time_in || record.actual_time_in,
                  record.time_out || record.actual_time_out
                );

                return (
                  <article key={record.session_id} className="card attendance-session-card">
                    <div className="session-header-row">
                      <div className="session-title-wrapper">
                        <h3 className="session-heading">{title}</h3>
                        {record.main_session_name &&
                          record.main_session_name.trim().toLowerCase() !== title.trim().toLowerCase() && (
                            <span className="session-parent-meta">{record.main_session_name}</span>
                          )}
                      </div>
                      <AttendanceStatus
                        portalStatus={record.portal_status}
                        timeIn={record.time_in || record.actual_time_in}
                        timeOut={record.time_out || record.actual_time_out}
                        isLate={record.is_late}
                        lateLabel={record.late_label}
                        showHelp={false}
                      />
                    </div>

                    {statusHelpText && (
                      <p className="session-description-text status-help-text">{statusHelpText}</p>
                    )}

                    {hasSchedule && (
                      <div className="session-schedule-meta">
                        <Clock size={12} aria-hidden="true" />
                        <span>
                          Schedule: {startTimeFormatted || '—'} {endTimeFormatted ? `– ${endTimeFormatted}` : ''}
                        </span>
                        {record.session_status && (
                          <span className="session-status-pill">{record.session_status}</span>
                        )}
                      </div>
                    )}

                    {record.session_description && (
                      <p className="session-description-text">{record.session_description}</p>
                    )}

                    <AttendanceTimeRow
                      timeIn={record.time_in || record.actual_time_in}
                      timeOut={record.time_out || record.actual_time_out}
                    />

                    {onReportIssue && (
                      <div className="session-card-footer">
                        <button
                          type="button"
                          onClick={() =>
                            onReportIssue({
                              sessionId: record.session_id,
                              sessionTitle: title,
                              date: serverDate,
                            })
                          }
                          className="session-report-action-btn"
                          aria-label={`Report an attendance issue for ${title}`}
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
          )}
        </>
      )}

      {/* Today Empty State (below the calendar, same placement as "Nothing scheduled") */}
      {isViewingToday && !isLoading && !error && visibleRecords.length === 0 && !isOffline && (
        <div className="card today-empty-card today-empty-card--quiet" role="region" aria-label="No attendance records">
          <h3 className="empty-heading">You're not marked present yet</h3>
          <p className="empty-subtext">
            There are no attendance sessions for you today. Once you scan at an attendance station, your record will appear here.
          </p>
          <button
            type="button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="btn btn-secondary empty-refresh-btn"
          >
            <RotateCw size={14} className={isRefreshing ? 'spin-animation' : ''} aria-hidden="true" />
            <span>Check for updates</span>
          </button>
        </div>
      )}

      {/* Case 2: Past Attendance Review View */}
      {isViewingPast && (
        <div className="past-attendance-review-container">
          {pastRecordsForDate.length > 0 ? (
            <div className="attendance-records-list" role="feed" aria-label={`Past attendance records for ${selectedDate}`}>
              {pastRecordsForDate.map((record) => {
                const title = record.session_title || record.session_name || 'Attendance Session';
                const startTimeFormatted = formatScheduleTime(record.start_time);
                const endTimeFormatted = formatScheduleTime(record.end_time);
                const hasSchedule = startTimeFormatted || endTimeFormatted;

                return (
                  <article key={record.session_id} className="card attendance-session-card">
                    <div className="session-header-row">
                      <div className="session-title-wrapper">
                        <h3 className="session-heading">{title}</h3>
                        {record.main_session_name &&
                          record.main_session_name.trim().toLowerCase() !== title.trim().toLowerCase() && (
                            <span className="session-parent-meta">{record.main_session_name}</span>
                          )}
                      </div>
                      <AttendanceStatus
                        portalStatus={record.portal_status}
                        timeIn={record.time_in}
                        timeOut={record.time_out}
                        isLate={record.is_late}
                        lateLabel={record.late_label}
                        showHelp={false}
                      />
                    </div>

                    {hasSchedule && (
                      <div className="session-schedule-meta">
                        <Clock size={12} aria-hidden="true" />
                        <span>
                          Schedule: {startTimeFormatted || '—'} {endTimeFormatted ? `– ${endTimeFormatted}` : ''}
                        </span>
                      </div>
                    )}

                    {record.session_description && (
                      <p className="session-description-text">{record.session_description}</p>
                    )}

                    <AttendanceTimeRow
                      timeIn={record.time_in}
                      timeOut={record.time_out}
                    />

                    {onReportIssue && (
                      <div className="session-card-footer">
                        <button
                          type="button"
                          onClick={() =>
                            onReportIssue({
                              sessionId: record.session_id,
                              sessionTitle: title,
                              date: selectedDate,
                            })
                          }
                          className="session-report-action-btn"
                          aria-label={`Report an attendance issue for ${title}`}
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
          ) : (
            <div className="card today-empty-card" role="region" aria-label="No past attendance records">
              <div className="empty-icon-halo">
                <Calendar size={28} className="text-muted" aria-hidden="true" />
              </div>
              <h3 className="empty-heading">No attendance on this day</h3>
              <p className="empty-subtext">
                Nothing was recorded for {formatContextualDate(selectedDate)}.
              </p>
              <button
                type="button"
                onClick={handleJumpToToday}
                className="btn btn-secondary empty-refresh-btn"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Back to Today</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Case 3: Advance Upcoming Schedule View */}
      {isViewingUpcoming && (
        <div className="upcoming-attendance-container">
          {upcomingRecordsForDate.length > 0 ? (
            <div className="attendance-records-list" role="feed" aria-label={`Upcoming attendance schedule for ${selectedDate}`}>
              {upcomingRecordsForDate.map((record) => {
                const title = record.session_title || record.session_name || 'Attendance Session';
                const startTimeFormatted = formatScheduleTime(record.start_time || record.starts_at);
                const endTimeFormatted = formatScheduleTime(record.end_time || record.ends_at);
                const hasSchedule = startTimeFormatted || endTimeFormatted;

                return (
                  <article key={record.session_id} className="card attendance-session-card">
                    <div className="session-header-row">
                      <div className="session-title-wrapper">
                        <h3 className="session-heading">{title}</h3>
                        {record.main_session_name && (
                          <span className="session-parent-meta">{record.main_session_name}</span>
                        )}
                      </div>
                      <span className="badge badge-info">
                        <Clock size={11} className="inline-icon" aria-hidden="true" /> Upcoming
                      </span>
                    </div>

                    {hasSchedule && (
                      <div className="session-schedule-meta">
                        <Clock size={12} aria-hidden="true" />
                        <span>
                          Scheduled: {startTimeFormatted || '—'} {endTimeFormatted ? `– ${endTimeFormatted}` : ''}
                        </span>
                      </div>
                    )}

                    {record.session_description && (
                      <p className="session-description-text">{record.session_description}</p>
                    )}

                    <div className="upcoming-info-chip">
                      <span>Scan the attendance QR code at the venue to record your attendance on this day.</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="card today-empty-card" role="region" aria-label="No upcoming attendance scheduled">
              <h3 className="empty-heading">Nothing scheduled</h3>
              <p className="empty-subtext">
                There are no attendance sessions on {formatContextualDate(selectedDate)}. Scheduled classes and events will appear here.
              </p>
              <button
                type="button"
                onClick={handleJumpToToday}
                className="btn btn-secondary empty-refresh-btn"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                <span>Back to Today</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
