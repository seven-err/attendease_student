import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { normalizeScannedQr } from '../../lib/api';

interface ManualInputProps {
  onSubmit: (token: string) => void;
  isVerifying: boolean;
}

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
      setLocalError('Please enter your Student or Employee QR code or ID number.');
      return;
    }
    if (!isValidFormat) {
      setLocalError('Code must be between 3 and 128 characters.');
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
          <span className="manual-input-title">Manual Code Entry</span>
        </div>

        <p className="manual-input-description">
          Enter or paste your Student or Employee QR code (e.g. CRMC-2026-XXXX) or token if camera scanning is unavailable.
        </p>

        <div className="manual-input-field-wrapper">
          <label htmlFor="student-token-input" className="input-label">
            STUDENT / EMPLOYEE QR CODE OR NUMBER
          </label>
          <div className="input-with-actions">
            <input
              id="student-token-input"
              type={showToken ? 'text' : 'password'}
              className={`input-field ${localError ? 'input-error' : ''}`}
              placeholder="e.g. CRMC-2026-0378 or token..."
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
          aria-label={isVerifying ? 'Verifying QR Code...' : 'Sign In with QR Code'}
        >
          {isVerifying ? (
            'Verifying Code...'
          ) : (
            <>
              <span>Sign In with QR Code</span>
              <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </button>

        <div className="manual-input-security-note">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Codes are verified directly against the AttendEase secure database.</span>
        </div>
      </div>
    </form>
  );
};
