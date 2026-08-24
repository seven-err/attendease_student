import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

const DISMISS_KEY = 'attendease_install_dismissed_at';
// After a dismissal, stay quiet for 3 days before asking again
const DISMISS_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    iosStandalone
  );
}

function readDismissTimestamp(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Tracks PWA install availability:
 * - `isVisible`: the app is running in a browser tab (not installed),
 *   the browser fired `beforeinstallprompt`, and the user hasn't
 *   recently dismissed the prompt.
 */
export function usePwaInstall() {
  const [standalone, setStandalone] = useState<boolean>(isStandaloneDisplay);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(readDismissTimestamp);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      // Prevent the browser's mini-infobar so our own UI is used instead
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setPromptEvent(null);
      setStandalone(true);
    };

    const displayMedia = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = (e: MediaQueryListEvent) => {
      setStandalone(e.matches || isStandaloneDisplay());
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    displayMedia.addEventListener?.('change', onDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      displayMedia.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  const dismiss = useCallback(() => {
    const now = Date.now();
    try {
      localStorage.setItem(DISMISS_KEY, String(now));
    } catch {
      // Ignore storage failures; dismissal still applies for this session
    }
    setDismissedAt(now);
  }, []);

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (!promptEvent) return 'unavailable';
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setPromptEvent(null);
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, [promptEvent]);

  const recentlyDismissed =
    dismissedAt !== null && Date.now() - dismissedAt < DISMISS_TTL_MS;

  return {
    isVisible: !standalone && Boolean(promptEvent) && !recentlyDismissed,
    canInstall: Boolean(promptEvent),
    install,
    dismiss,
  };
}
