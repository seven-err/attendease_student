import type { StudentProfile } from '../types/portal';
import { clearOfflineCache } from './offlineCache';

const SESSION_TOKEN_KEY = 'attendease_student_token';
const PROFILE_KEY = 'attendease_student_profile';
const SESSION_CREATED_AT_KEY = 'attendease_session_created_at';
const SESSION_LAST_ACTIVE_KEY = 'attendease_session_last_active';
const QR_TOKEN_KEY = 'attendease_student_qr_token';

/**
 * Retrieves the active 64-char student session token from localStorage.
 * Persisted across browser restarts so students stay signed in (~4 years).
 */
export function getSessionToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (token && token.length === 64 && /^[0-9a-fA-F]{64}$/.test(token)) {
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Stores the 64-char session token persistently in localStorage.
 */
export function setSessionToken(token: string): void {
  try {
    if (typeof localStorage !== 'undefined' && token && token.length === 64 && /^[0-9a-fA-F]{64}$/.test(token)) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Retrieves the student's raw QR token (the credential used to sign in)
 * so it can be re-rendered as their personal QR code on the profile card.
 */
export function getStoredQrToken(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(QR_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Stores the student's raw QR token persistently in localStorage.
 */
export function setStoredQrToken(qrToken: string): void {
  try {
    const clean = qrToken?.trim();
    if (typeof localStorage !== 'undefined' && clean && clean.length >= 3 && clean.length <= 256) {
      localStorage.setItem(QR_TOKEN_KEY, clean);
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Retrieves the cached student profile from localStorage.
 */
export function getStoredProfile(): StudentProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudentProfile;
  } catch {
    return null;
  }
}

/**
 * Stores the student profile in localStorage for UI continuity.
 */
export function setStoredProfile(profile: StudentProfile): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Retrieves session timestamp markers from localStorage.
 */
export function getSessionTimestamps(): { createdAt: number | null; lastActiveAt: number | null } {
  try {
    if (typeof localStorage === 'undefined') {
      return { createdAt: null, lastActiveAt: null };
    }
    const createdStr = localStorage.getItem(SESSION_CREATED_AT_KEY);
    const activeStr = localStorage.getItem(SESSION_LAST_ACTIVE_KEY);
    return {
      createdAt: createdStr ? parseInt(createdStr, 10) : null,
      lastActiveAt: activeStr ? parseInt(activeStr, 10) : null,
    };
  } catch {
    return { createdAt: null, lastActiveAt: null };
  }
}

/**
 * Sets session timestamp markers in localStorage.
 */
export function setSessionTimestamps(createdAt: number, lastActiveAt: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_CREATED_AT_KEY, createdAt.toString());
      localStorage.setItem(SESSION_LAST_ACTIVE_KEY, lastActiveAt.toString());
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Updates last active timestamp in localStorage.
 */
export function setLastActiveTimestamp(lastActiveAt: number): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SESSION_LAST_ACTIVE_KEY, lastActiveAt.toString());
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Clears all student session state and cached attendance from localStorage.
 */
export function clearSession(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(PROFILE_KEY);
      localStorage.removeItem(SESSION_CREATED_AT_KEY);
      localStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
      localStorage.removeItem(QR_TOKEN_KEY);
    }
    clearOfflineCache();
  } catch {
    // Ignore storage clear errors
  }
}
