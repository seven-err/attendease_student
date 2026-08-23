import React, { useState } from 'react';
import { QRScanner } from '../components/auth/QRScanner';
import { QrCode, AlertCircle, Clock, ShieldAlert } from 'lucide-react';
import type { CreateSessionResponse } from '../types/portal';

interface LoginViewProps {
  onLogin: (token: string) => Promise<CreateSessionResponse>;
  isLoading: boolean;
  isSessionExpired: boolean;
  onClearSessionExpired: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLogin,
  isLoading,
  isSessionExpired,
  onClearSessionExpired,
}) => {
  const [authError, setAuthError] = useState<{ type: 'invalid_token' | 'server_error' | 'permission'; message: string } | null>(null);

  const handleScanOrSubmit = async (rawToken: string) => {
    setAuthError(null);
    onClearSessionExpired();

    const response = await onLogin(rawToken);

    if (response.status === 'invalid_token') {
      setAuthError({
        type: 'invalid_token',
        message:
          "This QR code wasn't recognized. Please scan your official AttendEase QR code again.",
      });
    } else if (response.status === 'server_error') {
      setAuthError({
        type: 'server_error',
        message: response.message || 'We could not reach the attendance server. Please check your internet connection and try again.',
      });
    }
  };

  const handlePermissionDenied = (msg: string) => {
    setAuthError({
      type: 'permission',
      message: msg,
    });
  };

  return (
    <div className="login-view-container">
      {/* Session Expired Banner / Modal */}
      {isSessionExpired && (
        <div className="session-expired-banner" role="alert" aria-live="assertive">
          <div className="session-expired-content">
            <Clock size={20} className="text-warning" aria-hidden="true" />
            <div>
              <div className="session-expired-title">Your session ended</div>
              <div className="session-expired-desc">
                For your security, sessions end after a period of inactivity. Scan your QR code to sign in again.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="session-expired-close-btn"
            onClick={onClearSessionExpired}
            aria-label="Dismiss session expired notice"
            title="Dismiss session expired notice"
          >
            &times;
          </button>
        </div>
      )}

      {/* Hero / Header */}
      <header className="login-hero">
        <div className="login-logo-container">
          <img
            src="/attendease.png"
            alt="AttendEase Logo"
            className="login-brand-logo"
            width={64}
            height={64}
          />
        </div>
        <h1 className="login-title">Welcome to AttendEase</h1>
        <p className="login-subtitle">Scan your QR code to sign in.</p>
      </header>

      {/* Mode Indicator */}
      <div className="auth-mode-indicator" role="note" aria-label="Sign-in method">
        <QrCode size={16} aria-hidden="true" />
        <span>Camera QR Sign-In</span>
      </div>

      {/* Global Error Banner */}
      {authError && (
        <div className={`auth-error-banner ${authError.type}`} role="alert">
          <div className="auth-error-icon">
            {authError.type === 'invalid_token' ? (
              <ShieldAlert size={20} aria-hidden="true" />
            ) : (
              <AlertCircle size={20} aria-hidden="true" />
            )}
          </div>
          <div className="auth-error-body">
            <span className="auth-error-title">
              {authError.type === 'invalid_token'
                ? "We didn't recognize that code"
                : authError.type === 'permission'
                ? 'Camera access needed'
                : 'Connection problem'}
            </span>
            <p className="auth-error-message">{authError.message}</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        role="tabpanel"
        aria-label="QR code sign-in"
        className="auth-content-box"
      >
        <QRScanner
          key="active-qr-scanner"
          onScan={handleScanOrSubmit}
          isVerifying={isLoading}
          onPermissionDenied={handlePermissionDenied}
          onCameraUnavailable={handlePermissionDenied}
        />
      </div>

      {/* Footer Info */}
      <footer className="login-footer">
        <span>AttendEase &bull; Your attendance, made easy</span>
      </footer>
    </div>
  );
};