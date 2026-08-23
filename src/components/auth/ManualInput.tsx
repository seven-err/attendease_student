import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { normalizeScannedQr } from '../../lib/api';

interface ManualInputProps {
  onSubmit: (token: string) => void;
  isVerifying: boolean;
}

/**
 * Manual QR-code entry fallback.
 *
 * NOTE: The current sign-in screen is QR-scan only, so this component is not
 * mounted anywhere right now. It is kept as the accessible fallback path for
 * users who cannot use the camera (e.g., damaged camera or kiosk devices).
 * Wire it into LoginView to re-enable manual entry.
 */
export const ManualInput: React.FC<ManualInputProps> = ({ onSubmit, isVerifying }) => {
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const cleanToken = tokenInput.trim();
  const normalizedCandidate = normalizeScannedQr(cleanToken);
  const effectiveToken = normalizedCandidate || cleanToken;
  const isValidLength = effectiveToken.length >= 3 && effectiveToken.length <= 128;
  const isValidFormat = isValidLength;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanToken) {
      setLocalError('Please enter your QR code or ID number.');
      return;
    }
    if (!isValidFormat) {
      setLocalError("That code doesn't look right. Please double-check it and try again.");
      return;
    }
    setLocalError(null);
    onSubmit(effectiveToken);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTokenInput(e.target.value);
    if (localError) {
      setLocalError(null);
    }
  };

  const handleClear = () => {
    setTokenInput('');
    setLocalError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="manual-input-form" noValidate>
      <div className="manual-input-card">
        <div className="manual-input-header">
          <KeyRound size={18} className="text-accent" aria-hidden="true" />
          <span className="manual-input-title">Enter your code</span>
        </div>

        <p className="manual-input-description">
          Type or paste the code from your AttendEase QR code (for example, CRMC-2026-0378) if you can't scan it with the camera.
        </p>

        <div className="manual-input-field-wrapper">
          <label htmlFor="student-token-input" className="input-label">
            Your QR code or ID number
          </label>
          <div className="input-with-actions">
            <input
              id="student-token-input"
              type={showToken ? 'text' : 'password'}
              className={`input-field ${localError ? 'input-error' : ''}`}
              placeholder="e.g. CRMC-2026-0378"
              value={tokenInput}
              onChange={handleChange}
              disabled={isVerifying}
              autoComplete="off"
              spellCheck="false"
              aria-invalid={Boolean(localError)}
              aria-describedby={localError ? 'manual-input-error' : undefined}
            />
            <div className="input-actions">
              {tokenInput.length > 0 && !isVerifying && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="input-action-btn"
                  aria-label="Clear student token input"
                  title="Clear student token input"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="input-action-btn"
                aria-label={showToken ? 'Hide student token' : 'Show student token'}
                title={showToken ? 'Hide student token' : 'Show student token'}
                disabled={isVerifying}
              >
                {showToken ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {localError && (
            <div id="manual-input-error" className="manual-input-error-msg" role="alert">
              {localError}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary manual-submit-btn"
          disabled={isVerifying || !isValidFormat}
          aria-label={isVerifying ? 'Checking your code. Please wait.' : 'Sign in'}
        >
          {isVerifying ? (
            'Checking your code…'
          ) : (
            <>
              <span>Sign in</span>
              <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>

        <div className="manual-input-security-note">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Your code is checked securely and is never shared.</span>
        </div>
      </div>
    </form>
  );
};
