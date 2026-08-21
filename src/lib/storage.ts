import type { StudentProfile } from '../types/portal';
import { clearOfflineCache } from './offlineCache';

const SESSION_TOKEN_KEY = 'attendease_student_token';
const PROFILE_KEY = 'attendease_student_profile';
const SESSION_CREATED_AT_KEY = 'attendease_session_created_at';
const SESSION_LAST_ACTIVE_KEY = 'attendease_session_last_active';

/**
 * Retrieves the active 64-char student session token from sessionStorage.
 */
export function getSessionToken(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (token && token.length === 64 && /^[0-9a-fA-F]{64}$/.test(token)) {
      return token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Stores the 64-char session token strictly in sessionStorage.
 */
export function setSessionToken(token: string): void {
  try {
    if (typeof sessionStorage !== 'undefined' && token && token.length === 64 && /^[0-9a-fA-F]{64}$/.test(token)) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Retrieves the cached student profile from sessionStorage.
 */
export function getStoredProfile(): StudentProfile | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudentProfile;
  } catch {
    return null;
  }
}

/**
 * Stores the student profile in sessionStorage for UI continuity.
 */
export function setStoredProfile(profile: StudentProfile): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Retrieves session timestamp markers from sessionStorage.
 */
export function getSessionTimestamps(): { createdAt: number | null; lastActiveAt: number | null } {
  try {
    if (typeof sessionStorage === 'undefined') {
      return { createdAt: null, lastActiveAt: null };
    }
    const createdStr = sessionStorage.getItem(SESSION_CREATED_AT_KEY);
    const activeStr = sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY);
    return {
      createdAt: createdStr ? parseInt(createdStr, 10) : null,
      lastActiveAt: activeStr ? parseInt(activeStr, 10) : null,
    };
  } catch {
    return { createdAt: null, lastActiveAt: null };
  }
}

/**
 * Sets session timestamp markers in sessionStorage.
 */
export function setSessionTimestamps(createdAt: number, lastActiveAt: number): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_CREATED_AT_KEY, createdAt.toString());
      sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, lastActiveAt.toString());
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Updates last active timestamp in sessionStorage.
 */
export function setLastActiveTimestamp(lastActiveAt: number): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, lastActiveAt.toString());
    }
  } catch {
    // Gracefully handle private browsing quota exceptions
  }
}

/**
 * Clears all student session state and cached attendance from sessionStorage.
 */
export function clearSession(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(PROFILE_KEY);
      sessionStorage.removeItem(SESSION_CREATED_AT_KEY);
      sessionStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
    }
    clearOfflineCache();
  } catch {
    // Ignore storage clear errors
  }
}
