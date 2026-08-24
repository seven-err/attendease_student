import { Download, X } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';

/**
 * Floating install button shown only when the PWA can be installed
 * (browser fired `beforeinstallprompt`) and the app isn't already
 * running as an installed/standalone app.
 */
export function InstallAppButton() {
  const { isVisible, install, dismiss } = usePwaInstall();

  if (!isVisible) return null;

  return (
    <div className="install-fab" role="region" aria-label="Install AttendEase app">
      <button
        type="button"
        className="install-fab-action"
        onClick={() => void install()}
        aria-label="Install AttendEase on this device"
      >
        <Download size={16} aria-hidden="true" />
        <span>Install App</span>
      </button>
      <button
        type="button"
        className="install-fab-dismiss"
        onClick={dismiss}
        aria-label="Dismiss install suggestion"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
