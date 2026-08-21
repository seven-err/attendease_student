import React, { useState } from 'react';
import { QRScanner } from '../components/auth/QRScanner';
import { ManualInput } from '../components/auth/ManualInput';
import { QrCode, KeyRound, AlertCircle, Clock, ShieldAlert } from 'lucide-react';
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
  const [authMode, setAuthMode] = useState<'scan' | 'manual'>('scan');
  const [authError, setAuthError] = useState<{ type: 'invalid_token' | 'server_error' | 'permission'; message: string } | null>(null);

  const handleScanOrSubmit = async (rawToken: string) => {
    setAuthError(null);
    onClearSessionExpired();

    const response = await onLogin(rawToken);

    if (response.status === 'invalid_token') {
      setAuthError({
        type: 'invalid_token',
        message: 'Unrecognized QR code. This code was not found in the AttendEase database. Please scan or enter your official Student or Employee QR code.',
      });
    } else if (response.status === 'server_error') {
      setAuthError({
        type: 'server_error',
        message: response.message || 'Unable to connect to the authentication server. Please check your network and try again.',
      });
    }
  };

  const handlePermissionDenied = (msg: string) => {
    setAuthError({
      type: 'permission',
      message: msg,
    });
  };

  const handleSwitchToManual = () => {
    setAuthMode('manual');
    setAuthError(null);
  };

  const handleSwitchToScan = () => {
    setAuthMode('scan');
    setAuthError(null);
  };

  const handleKeyDownTab = (e: React.KeyboardEvent, targetMode: 'scan' | 'manual') => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (targetMode === 'scan') {
        handleSwitchToManual();
      } else {
        handleSwitchToScan();
      }
    }
  };

  return (
    <div className="login-view-container">
      {/* Session Expired Banner / Modal */}
      {isSessionExpired && (
        <div className="session-expired-banner" role="alert" aria-live="assertive">
          <div className="session-expired-content">
            <Clock size={20} className="text-warning" aria-hidden="true" />
            <div>
              <div className="session-expired-title">Session Expired</div>
              <div className="session-expired-desc">
                Your session timed out for your security. Please scan your Student or Employee QR code to sign in again.
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
        <h1 className="login-title">AttendEase</h1>
        <p className="login-subtitle">Student &amp; Employee Attendance Portal</p>
      </header>

      {/* Mode Switcher Tabs */}
      <div className="auth-tabs-container" role="tablist" aria-label="Authentication Method">
        <button
          id="tab-scan"
          type="button"
          role="tab"
          aria-selected={authMode === 'scan'}
          aria-controls="auth-tabpanel-scan"
          className={`auth-tab-btn ${authMode === 'scan' ? 'active' : ''}`}
          onClick={handleSwitchToScan}
          onKeyDown={(e) => handleKeyDownTab(e, 'scan')}
          disabled={isLoading}
        >
          <QrCode size={18} aria-hidden="true" />
          <span>Scan QR Code</span>
        </button>
        <button
          id="tab-manual"
          type="button"
          role="tab"
          aria-selected={authMode === 'manual'}
          aria-controls="auth-tabpanel-manual"
          className={`auth-tab-btn ${authMode === 'manual' ? 'active' : ''}`}
          onClick={handleSwitchToManual}
          onKeyDown={(e) => handleKeyDownTab(e, 'manual')}
          disabled={isLoading}
        >
          <KeyRound size={18} aria-hidden="true" />
          <span>Manual Entry</span>
        </button>
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
                ? 'Invalid QR Code'
                : authError.type === 'permission'
                ? 'Camera Access Required'
                : 'Connection Error'}
            </span>
            <p className="auth-error-message">{authError.message}</p>
            {authError.type === 'permission' && authMode === 'scan' && (
              <button
                type="button"
                className="auth-error-action-btn"
                onClick={handleSwitchToManual}
              >
                Switch to Manual Entry &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        id={authMode === 'scan' ? 'auth-tabpanel-scan' : 'auth-tabpanel-manual'}
        role="tabpanel"
        aria-labelledby={authMode === 'scan' ? 'tab-scan' : 'tab-manual'}
        className="auth-content-box"
      >
        {authMode === 'scan' ? (
          <QRScanner
            key="active-qr-scanner"
            onScan={handleScanOrSubmit}
            isVerifying={isLoading}
            onPermissionDenied={handlePermissionDenied}
          />
        ) : (
          <ManualInput
            onSubmit={handleScanOrSubmit}
            isVerifying={isLoading}
          />
        )}
      </div>

      {/* Footer Info */}
      <footer className="login-footer">
        <span>AttendEase Attendance Portal &bull; Zero-Trust Session Architecture</span>
      </footer>
    </div>
  );
};
