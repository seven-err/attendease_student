import { useState, useEffect, useCallback, useRef } from 'react';
import { useStudentSession } from './hooks/useStudentSession';
import { useNetworkState } from './hooks/useNetworkState';
import { LoginView } from './views/LoginView';
import { TodayAttendance } from './components/attendance/TodayAttendance';
import { AttendanceHistory } from './components/attendance/AttendanceHistory';
import { IssueReport, SessionContextInfo } from './components/issues/IssueReport';
import { getTodayAttendance } from './lib/api';
import {
  saveCachedTodayAttendance,
  getCachedTodayAttendance,
  clearOfflineCache,
} from './lib/offlineCache';
import type { TodayAttendanceRecord } from './types/portal';
import { Calendar, History, FileQuestion, LogOut, WifiOff, RotateCw, Briefcase, User } from 'lucide-react';

export function App() {
  const {
    token,
    profile,
    isLoading,
    isSessionExpired,
    isAuthenticated,
    login,
    logout,
    forceExpire,
    clearExpiredFlag,
  } = useStudentSession();

  const { isOnline, isOffline, isReconnecting } = useNetworkState();

  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'report'>('today');
  const [selectedReportSession, setSelectedReportSession] = useState<SessionContextInfo | null>(null);
  const previousTabRef = useRef<'today' | 'history'>('today');

  // Today Attendance State
  const [todayRecords, setTodayRecords] = useState<TodayAttendanceRecord[]>([]);
  const [todayServerDate, setTodayServerDate] = useState<string | null>(null);
  const [isTodayLoading, setIsTodayLoading] = useState<boolean>(false);
  const [isTodayRefreshing, setIsTodayRefreshing] = useState<boolean>(false);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [isTodayFromCache, setIsTodayFromCache] = useState<boolean>(false);
  const [todayCacheTimestamp, setTodayCacheTimestamp] = useState<number | null>(null);

  // Concurrency & Active Token Tracking
  const activeTokenRef = useRef<string | null>(token);
  activeTokenRef.current = token;
  const isFetchingTodayRef = useRef<boolean>(false);

  // Track offline transitions for auto-refresh
  const previousOnlineRef = useRef<boolean>(isOnline);

  // Clear offline cache when unauthenticated / logged out / expired
  useEffect(() => {
    if (!isAuthenticated) {
      clearOfflineCache();
      setTodayRecords([]);
      setIsTodayFromCache(false);
      setTodayCacheTimestamp(null);
    }
  }, [isAuthenticated]);

  // Load Today Attendance (with sessionStorage read cache fallback and concurrency guard)
  const loadTodayAttendance = useCallback(
    async (isManualRefresh = false) => {
      if (!token) return;

      // Concurrency guard: prevent duplicate simultaneous in-flight requests
      if (isFetchingTodayRef.current) {
        return;
      }

      const requestToken = token;
      isFetchingTodayRef.current = true;

      if (isManualRefresh) {
        setIsTodayRefreshing(true);
      } else {
        setIsTodayLoading(true);
      }
      setTodayError(null);

      // If offline, attempt to load from sanitized sessionStorage cache
      if (!navigator.onLine) {
        try {
          const cached = getCachedTodayAttendance();
          if (activeTokenRef.current !== requestToken) {
            return;
          }
          if (cached) {
            setTodayRecords(cached.records);
            setTodayServerDate(cached.serverDate || null);
            setIsTodayFromCache(true);
            setTodayCacheTimestamp(cached.fetchedAt);
          } else {
            setTodayRecords([]);
            setIsTodayFromCache(false);
            setTodayCacheTimestamp(null);
          }
        } finally {
          setIsTodayLoading(false);
          setIsTodayRefreshing(false);
          isFetchingTodayRef.current = false;
        }
        return;
      }

      try {
        const response = await getTodayAttendance(requestToken);

        // Discard stale response if active session token changed or expired in flight
        if (activeTokenRef.current !== requestToken) {
          return;
        }

        if (response.status === 'ok') {
          const records = response.records || [];
          const date = response.date || null;
          setTodayRecords(records);
          setTodayServerDate(date);
          setIsTodayFromCache(false);
          setTodayCacheTimestamp(Date.now());

          // Save sanitized read cache to sessionStorage
          saveCachedTodayAttendance(records, date || undefined);
        } else if (response.status === 'session_expired') {
          forceExpire('Session expired on server');
        } else {
          // Attempt cache fallback if online fetch failed
          const cached = getCachedTodayAttendance();
          if (activeTokenRef.current !== requestToken) {
            return;
          }
          if (cached) {
            setTodayRecords(cached.records);
            setTodayServerDate(cached.serverDate || null);
            setIsTodayFromCache(true);
            setTodayCacheTimestamp(cached.fetchedAt);
          } else {
            setTodayError('Unable to load today attendance records.');
          }
        }
      } catch {
        if (activeTokenRef.current !== requestToken) {
          return;
        }
        const cached = getCachedTodayAttendance();
        if (cached) {
          setTodayRecords(cached.records);
          setTodayServerDate(cached.serverDate || null);
          setIsTodayFromCache(true);
          setTodayCacheTimestamp(cached.fetchedAt);
        } else {
          setTodayError('Unable to connect. Please check your network and try again.');
        }
      } finally {
        isFetchingTodayRef.current = false;
        setIsTodayLoading(false);
        setIsTodayRefreshing(false);
      }
    },
    [token, forceExpire]
  );

  // Initial load when authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      loadTodayAttendance(false);
    }
  }, [isAuthenticated, token, loadTodayAttendance]);

  // Handle reconnect: automatically refresh data when transitioning from offline to online
  useEffect(() => {
    if (!previousOnlineRef.current && isOnline && isAuthenticated && token) {
      if (activeTab === 'today') {
        loadTodayAttendance(true);
      }
    }
    previousOnlineRef.current = isOnline;
  }, [isOnline, token, isAuthenticated, activeTab, loadTodayAttendance]);

  // Handler for opening issue reporting for a specific session
  const handleReportSessionIssue = useCallback((sessionInfo: SessionContextInfo) => {
    previousTabRef.current = activeTab === 'report' ? 'today' : activeTab;
    setSelectedReportSession(sessionInfo);
    setActiveTab('report');
  }, [activeTab]);

  // Handler for opening general issue reporting from nav
  const handleNavToReport = useCallback(() => {
    previousTabRef.current = activeTab === 'report' ? 'today' : activeTab;
    setSelectedReportSession(null);
    setActiveTab('report');
  }, [activeTab]);

  const handleCloseReport = useCallback(() => {
    setSelectedReportSession(null);
    setActiveTab(previousTabRef.current || 'today');
  }, []);

  // Feature flag: temporarily disable Issue Reporting UI
  const isReportIssueEnabled = false;

  // View: Unauthenticated Login View
  if (!isAuthenticated) {
    return (
      <div className="app-container">
        <LoginView
          onLogin={login}
          isLoading={isLoading}
          isSessionExpired={isSessionExpired}
          onClearSessionExpired={clearExpiredFlag}
        />
      </div>
    );
  }

  // View: Authenticated Dashboard Shell
  return (
    <div className="app-container">
      {/* Top Global Connectivity Banner */}
      {isOffline && (
        <div className="global-network-banner offline" role="status" aria-live="polite">
          <WifiOff size={13} aria-hidden="true" />
          <span>Offline Mode &bull; Displaying cached attendance data</span>
        </div>
      )}

      {isReconnecting && (
        <div className="global-network-banner reconnecting" role="status" aria-live="polite">
          <RotateCw size={13} className="spin-animation" aria-hidden="true" />
          <span>Back online &bull; Updating latest records...</span>
        </div>
      )}

      {/* Derived Role Metadata */}
      {(() => {
        const isEmployee =
          profile?.role === 'employee' ||
          profile?.person_kind === 'staff' ||
          profile?.person_kind === 'employee' ||
          Boolean(profile?.student_number && profile.student_number.startsWith('EMP-'));
        const portalSubtitle = isEmployee ? 'Employee Portal' : 'Student Portal';
        const roleLabel = isEmployee ? 'Employee' : 'Student';

        return (
          <>
            <header className="app-header">
              <div className="brand-badge-container">
                <img
                  src="/attendease.png"
                  alt="AttendEase Logo"
                  className="header-brand-logo"
                  width={32}
                  height={32}
                />
                <div className="header-brand-text">
                  <h1 className="header-brand-title">AttendEase</h1>
                  <span className="header-brand-subtitle">{portalSubtitle}</span>
                </div>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  onClick={logout}
                  className="btn btn-secondary logout-btn"
                  title="Sign Out"
                  aria-label="Sign out of student portal"
                >
                  <LogOut size={12} aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </div>
            </header>

            <main className="app-main" id="main-content-panel">
              {/* User Profile Card (Visible on Today/Home tab only) */}
              {profile && activeTab === 'today' && (
                <section className="card profile-card" aria-label={`${roleLabel} Profile Summary`}>
                  <div className={`profile-avatar ${isEmployee ? 'profile-avatar-employee' : 'profile-avatar-student'}`} aria-hidden="true">
                    {isEmployee ? <Briefcase size={22} /> : <User size={22} />}
                  </div>
                  <div className="profile-info">
                    <div className="profile-name-row">
                      <div className="profile-name">{profile.full_name}</div>
                      <span className={`role-badge ${isEmployee ? 'role-badge-employee' : 'role-badge-student'}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <div className="profile-meta">
                      <span>{isEmployee ? 'Emp ID' : 'Student ID'}: {profile.student_number}</span>
                      {profile.department && <span>&bull; Dept: {profile.department}</span>}
                      {!isEmployee && profile.course && <span>&bull; {profile.course}</span>}
                      {!isEmployee && profile.year_level && <span>&bull; Year {profile.year_level}</span>}
                    </div>
                  </div>
                </section>
              )}

              {/* Tab Content: Today Attendance */}
              {activeTab === 'today' && (
                <TodayAttendance
                  records={todayRecords}
                  isLoading={isTodayLoading}
                  isRefreshing={isTodayRefreshing}
                  error={todayError}
                  serverDate={todayServerDate || undefined}
                  sessionToken={token}
                  userRole={isEmployee ? 'employee' : 'student'}
                  userDepartment={profile?.department || undefined}
                  userYearLevel={profile?.year_level || undefined}
                  studentDepartment={profile?.department || undefined}
                  onRefresh={() => loadTodayAttendance(true)}
                  onReportIssue={isReportIssueEnabled ? handleReportSessionIssue : undefined}
                  isOffline={isOffline}
                  isFromCache={isTodayFromCache}
                  cacheTimestamp={todayCacheTimestamp || undefined}
                />
              )}

              {/* Tab Content: History */}
              {activeTab === 'history' && (
                <AttendanceHistory
                  sessionToken={token}
                  onSessionExpired={() => forceExpire('Session expired on server')}
                  onReportIssue={isReportIssueEnabled ? handleReportSessionIssue : undefined}
                  isOffline={isOffline}
                />
              )}

              {/* Tab Content: Issue Report (Feature available when navigated) */}
              {isReportIssueEnabled && activeTab === 'report' && (
                <IssueReport
                  key={selectedReportSession?.sessionId || 'general-report'}
                  sessionToken={token}
                  initialSession={selectedReportSession}
                  onSessionExpired={() => forceExpire('Session expired on server')}
                  onClose={handleCloseReport}
                  isOffline={isOffline}
                />
              )}
            </main>
          </>
        );
      })()}

      {/* Mobile Bottom Navigation */}
      <nav className="bottom-nav" role="tablist" aria-label="Student Portal Navigation">
        <button
          id="nav-tab-today"
          type="button"
          role="tab"
          aria-selected={activeTab === 'today'}
          aria-controls="main-content-panel"
          className={`nav-item ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          <Calendar size={18} aria-hidden="true" />
          <span>Today</span>
        </button>
        <button
          id="nav-tab-history"
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          aria-controls="main-content-panel"
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={18} aria-hidden="true" />
          <span>History</span>
        </button>
        {isReportIssueEnabled && (
          <button
            id="nav-tab-report"
            type="button"
            role="tab"
            aria-selected={activeTab === 'report'}
            aria-controls="main-content-panel"
            className={`nav-item ${activeTab === 'report' ? 'active' : ''}`}
            onClick={handleNavToReport}
          >
            <FileQuestion size={18} aria-hidden="true" />
            <span>Report Issue</span>
          </button>
        )}
      </nav>
    </div>
  );
}
