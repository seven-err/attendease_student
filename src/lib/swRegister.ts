/**
 * AttendEase Student Portal - Service Worker Registration
 * Handles safe registration of the static app shell service worker.
 */

export interface SWRegistrationCallbacks {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  onError?: (error: Error) => void;
}

/**
 * Registers the static app shell Service Worker safely.
 */
export function registerServiceWorker(callbacks?: SWRegistrationCallbacks): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const doRegister = () => {
    const swUrl = '/sw.js';

    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => {
        // Registration successful
        if (callbacks?.onSuccess) {
          callbacks.onSuccess(registration);
        }

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New content is available and will be used when all tabs close
                if (callbacks?.onUpdate) {
                  callbacks.onUpdate(registration);
                }
              }
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[ServiceWorker] Registration failed:', error);
        if (callbacks?.onError) {
          callbacks.onError(error);
        }
      });
  };

  // If document is already fully loaded, register immediately; otherwise wait for load event
  if (typeof document !== 'undefined' && document.readyState === 'complete') {
    doRegister();
  } else {
    window.addEventListener('load', doRegister, { once: true });
  }
}

/**
 * Unregisters any active service worker (for testing / cleanup).
 */
export function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    return navigator.serviceWorker.ready
      .then((registration) => registration.unregister())
      .catch(() => false);
  }
  return Promise.resolve(false);
}

