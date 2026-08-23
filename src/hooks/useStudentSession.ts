import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSessionToken,
  setSessionToken,
  getStoredProfile,
  setStoredProfile,
  getStoredQrToken,
  setStoredQrToken,
  getSessionTimestamps,
  setSessionTimestamps,
  setLastActiveTimestamp,
  clearSession,
} from '../lib/storage';
import { createStudentSession, destroyStudentSession, normalizeScannedQr } from '../lib/api';
import type { StudentProfile, CreateSessionResponse } from '../types/portal';

export const ACTIVITY_THROTTLE_MS = 15 * 1000; // 15 seconds throttle
// Long-lived sessions: students stay signed in for ~4 years (matches the
// server-side perpetual portal session policy) unless they sign out manually.
export const FOUR_YEARS_MS = 4 * 365.25 * 24 * 60 * 60 * 1000; // ≈ 126,230,400,000 ms
export const INACTIVITY_TIMEOUT_MS = FOUR_YEARS_MS; // ~4 years of inactivity
export const ABSOLUTE_TIMEOUT_MS = FOUR_YEARS_MS; // ~4 years absolute cap
export const WATCHDOG_INTERVAL_MS = 30 * 1000; // 30 seconds periodic check

export interface WatchdogEvaluationResult {
  expired: boolean;
  reason?: string;
}

/**
 * Pure evaluation helper for student portal session timeouts.
 */
export function evaluateSessionWatchdog(
  now: number,
  createdAt: number | null,
  lastActiveAt: number | null
): WatchdogEvaluationResult {
  if (!createdAt || !lastActiveAt) {
    return { expired: false };
  }
  if (now - lastActiveAt > INACTIVITY_TIMEOUT_MS) {
    return { expired: true, reason: 'Session expired after roughly 4 years of inactivity.' };
  }
  if (now - createdAt > ABSOLUTE_TIMEOUT_MS) {
    return { expired: true, reason: 'Session reached its ~4-year maximum lifetime.' };
  }
  return { expired: false };
}

export interface UseStudentSessionReturn {
  token: string | null;
  qrToken: string | null;
  profile: StudentProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  login: (qrToken: string) => Promise<CreateSessionResponse>;
  logout: () => Promise<void>;
  touchActivity: () => void;
  forceExpire: (reason?: string) => void;
  clearExpiredFlag: () => void;
}

export function useStudentSession(): UseStudentSessionReturn {
  // Boot-time clean initialization & orphan sweep
  const [token, setToken] = useState<string | null>(() => {
    const rawToken = getSessionToken();
    const rawProfile = getStoredProfile();
    const { createdAt, lastActiveAt } = getSessionTimestamps();
    const now = Date.now();

    // If session is corrupt (one exists without the other) or expired on boot, clean up storage immediately
    if ((rawToken && !rawProfile) || (!rawToken && rawProfile)) {
      clearSession();
      return null;
    }

    if (rawToken && rawProfile && createdAt && lastActiveAt) {
      const check = evaluateSessionWatchdog(now, createdAt, lastActiveAt);
      if (check.expired) {
        clearSession();
        return null;
      }
    }

    return rawToken;
  });

  const [profile, setProfile] = useState<StudentProfile | null>(() => {
    const rawToken = getSessionToken();
    const rawProfile = getStoredProfile();
    if (!rawToken || !rawProfile) {
      return null;
    }
    return rawProfile;
  });

  // Raw QR credential used at sign-in; kept so the student's personal QR
  // code can be re-displayed on their profile card for future check-ins.
  const [qrToken, setQrToken] = useState<string | null>(() => {
    const rawToken = getSessionToken();
    const rawProfile = getStoredProfile();
    if (!rawToken || !rawProfile) {
      return null;
    }
    return getStoredQrToken();
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);

  const lastActivityTouchRef = useRef<number>(Date.now());
  const isLoggingInRef = useRef<boolean>(false);

  // Force-expire the session locally (when server reports invalidation or watchdog fires)
  const forceExpire = useCallback((_reason?: string) => {
    clearSession();
    setToken(null);
    setProfile(null);
    setQrToken(null);
    setIsSessionExpired(true);
  }, []);

  const clearExpiredFlag = useCallback(() => {
    setIsSessionExpired(false);
  }, []);

  // Update activity timestamp with throttling
  const touchActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastActivityTouchRef.current < ACTIVITY_THROTTLE_MS) {
      return;
    }
    lastActivityTouchRef.current = now;
    setLastActiveTimestamp(now);
  }, []);

  // Check watchdog status actively
  const checkWatchdog = useCallback(() => {
    if (!token) return;
    const { createdAt, lastActiveAt } = getSessionTimestamps();
    const now = Date.now();
    const check = evaluateSessionWatchdog(now, createdAt, lastActiveAt);
    if (check.expired) {
      forceExpire(check.reason);
    }
  }, [token, forceExpire]);

  // Authenticate via QR token with in-flight concurrency protection
  const login = useCallback(async (qrToken: string): Promise<CreateSessionResponse> => {
    if (isLoggingInRef.current) {
      return { status: 'server_error', message: 'Authentication already in progress.' };
    }

    isLoggingInRef.current = true;
    setIsLoading(true);
    setIsSessionExpired(false);

    try {
      const res = await createStudentSession(qrToken);

      if (res.status === 'ok' && res.session_token && res.student) {
        const now = Date.now();
        const normalizedQr = normalizeScannedQr(qrToken) || qrToken.trim();
        setSessionToken(res.session_token);
        setStoredProfile(res.student);
        setStoredQrToken(normalizedQr);
        setSessionTimestamps(now, now);

        lastActivityTouchRef.current = now;
        setToken(res.session_token);
        setProfile(res.student);
        setQrToken(normalizedQr);
        setIsSessionExpired(false);
      }

      return res;
    } finally {
      isLoggingInRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Gracefully revoke session and clear credentials on manual sign out
  const logout = useCallback(async () => {
    const activeToken = token || getSessionToken();
    if (activeToken) {
      try {
        await destroyStudentSession(activeToken);
      } catch {
        // Continue clearing client credentials regardless of network failure
      }
    }
    clearSession();
    setToken(null);
    setProfile(null);
    setQrToken(null);
    setIsSessionExpired(false);
  }, [token]);

  // Active Session Watchdog Timer & Visibility Change Watcher
  useEffect(() => {
    if (!token) return;

    // Check immediately on mount/token change
    checkWatchdog();

    // Check on window focus or visibility change
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkWatchdog();
      }
    };

    window.addEventListener('focus', onVisibilityOrFocus, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityOrFocus, { passive: true });

    // Periodic watchdog timer every 30 seconds
    const intervalId = setInterval(() => {
      checkWatchdog();
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      clearInterval(intervalId);
    };
  }, [token, checkWatchdog]);

  // Setup user activity listeners to keep last active timestamp up-to-date
  useEffect(() => {
    if (!token) return;

    const onUserInteraction = () => {
      touchActivity();
    };

    window.addEventListener('pointerdown', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
    };
  }, [token, touchActivity]);

  return {
    token,
    qrToken,
    profile,
    isAuthenticated: Boolean(token && profile),
    isLoading,
    isSessionExpired,
    login,
    logout,
    touchActivity,
    forceExpire,
    clearExpiredFlag,
  };
}

