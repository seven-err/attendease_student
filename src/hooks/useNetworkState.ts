/**
 * AttendEase Student Portal - Network State Hook
 * Phase 6: PWA / Service Worker + Offline Connectivity Management
 *
 * Provides a synchronized, debounced online/offline/reconnecting state machine.
 */

import { useState, useEffect, useRef } from 'react';

export interface NetworkState {
  isOnline: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
}

export function useNetworkState(): NetworkState {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsReconnecting(true);

      // Clear any previous timer
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      // Display "Back online — updating..." state for 3 seconds while data refreshes
      reconnectTimeoutRef.current = setTimeout(() => {
        setIsReconnecting(false);
      }, 3000);
    };

    const handleOffline = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setIsReconnecting(false);
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline, { passive: true });
    window.addEventListener('offline', handleOffline, { passive: true });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    isReconnecting,
  };
}
