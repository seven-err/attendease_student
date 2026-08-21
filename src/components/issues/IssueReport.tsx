import React, { useState, useRef, useEffect } from 'react';
import type { IssueType, ReportIssueResponse } from '../../types/portal';
import { reportAttendanceIssue } from '../../lib/api';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  X,
  Send,
  RotateCw,
  FileQuestion,
  Sparkles,
  Link2Off,
  WifiOff,
} from 'lucide-react';

export interface IssueCategoryOption {
  type: IssueType;
  label: string;
  description: string;
}

export const ISSUE_CATEGORIES: IssueCategoryOption[] = [
  {
    type: 'missing_time_in',
    label: 'Missing Time In',
    description: 'Scanned at entry but time-in was not recorded',
  },
  {
    type: 'missing_time_out',
    label: 'Missing Time Out',
    description: 'Attended session but time-out was not captured',
  },
  {
    type: 'incorrect_time',
    label: 'Incorrect Time',
    description: 'Recorded timestamp does not match arrival/departure',
  },
  {
    type: 'wrong_status',
    label: 'Wrong Status',
    description: 'Status marked incorrectly (e.g., absent or late by mistake)',
  },
  {
    type: 'other',
    label: 'Other',
    description: 'General discrepancy or other attendance concern',
  },
];

export interface IssueValidationResult {
  isValid: boolean;
  error: string | null;
  trimmedDetails: string;
  charCount: number;
}

/**
 * Pure validation helper for issue details adhering to the 5–1000 character backend contract.
 */
export function validateIssueReport(details: string): IssueValidationResult {
  const trimmed = details ? details.trim() : '';
  const charCount = trimmed.length;

  if (charCount === 0) {
    return {
      isValid: false,
      error: 'Please enter details describing the issue.',
      trimmedDetails: trimmed,
      charCount,
    };
  }

  if (charCount < 5) {
    return {
      isValid: false,
      error: 'Details must be at least 5 characters.',
      trimmedDetails: trimmed,
      charCount,
    };
  }

  if (charCount > 1000) {
    return {
      isValid: false,
      error: 'Details cannot exceed 1000 characters.',
      trimmedDetails: trimmed,
      charCount,
    };
  }

  return {
    isValid: true,
    error: null,
    trimmedDetails: trimmed,
    charCount,
  };
}

export interface SessionContextInfo {
  sessionId?: string;
  sessionTitle?: string;
  date?: string;
}

export interface IssueReportProps {
  sessionToken: string | null;
  onSessionExpired: () => void;
  onClose?: () => void;
  initialSession?: SessionContextInfo | null;
  className?: string;
  isOffline?: boolean;
}

export const IssueReport: React.FC<IssueReportProps> = ({
  sessionToken,
  onSessionExpired,
  onClose,
  initialSession,
  className = '',
  isOffline = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<IssueType>('missing_time_in');
  const [details, setDetails] = useState<string>('');
  const [sessionContext, setSessionContext] = useState<SessionContextInfo | null>(
    initialSession || null
  );

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResult, setSubmitResult] = useState<{
    status: 'ok';
    reportId?: string;
  } | null>(null);

  const [submissionError, setSubmissionError] = useState<{
    type: 'rate_limited' | 'unauthorized' | 'invalid_details' | 'offline' | 'generic';
    message: string;
  } | null>(null);

  // In-flight concurrency lock
  const isSubmittingRef = useRef<boolean>(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstCategoryRef = useRef<HTMLButtonElement | null>(null);

  // Live validation calculations
  const trimmedLength = details.trim().length;
  const isTooShort = details.length > 0 && trimmedLength < 5;
  const isTooLong = trimmedLength > 1000;

  // Focus management and Escape key handling
  useEffect(() => {
    // Focus the close button or first category on mount
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    } else if (firstCategoryRef.current) {
      firstCategoryRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, isSubmitting]);

  const handleDetailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDetails(e.target.value);
    if (validationError) {
      setValidationError(null);
    }
    if (submissionError) {
      setSubmissionError(null);
    }
  };

  const handleCategorySelect = (catType: IssueType) => {
    setSelectedCategory(catType);
    if (submissionError) {
      setSubmissionError(null);
    }
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % ISSUE_CATEGORIES.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + ISSUE_CATEGORIES.length) % ISSUE_CATEGORIES.length;
    }
    if (nextIndex !== currentIndex) {
      setSelectedCategory(ISSUE_CATEGORIES[nextIndex].type);
    }
  };

  const handleClearSessionContext = () => {
    setSessionContext(null);
  };

  const handleResetForm = () => {
    setSubmitResult(null);
    setDetails('');
    setSelectedCategory('missing_time_in');
    setValidationError(null);
    setSubmissionError(null);
    setSessionContext(null);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // 0. Offline Guard (Strictly no offline write queue)
    if (isOffline) {
      setSubmissionError({
        type: 'offline',
        message: 'You are currently offline. Issue reports cannot be submitted without an internet connection.',
      });
      return;
    }

    // 1. Validate locally
    const validation = validateIssueReport(details);
    if (!validation.isValid) {
      setValidationError(validation.error);
      return;
    }

    // 2. Concurrency protection
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    // 3. Verify active session token
    if (!sessionToken) {
      onSessionExpired();
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setValidationError(null);
    setSubmissionError(null);

    try {
      const response: ReportIssueResponse = await reportAttendanceIssue(
        sessionToken,
        selectedCategory,
        validation.trimmedDetails,
        sessionContext?.sessionId || null
      );

      if (response.status === 'ok') {
        setSubmitResult({
          status: 'ok',
          reportId: response.report_id,
        });
      } else if (response.status === 'session_expired') {
        onSessionExpired();
      } else if (
        response.status === 'rate_limited' ||
        response.status === 'rate_limit_exceeded'
      ) {
        setSubmissionError({
          type: 'rate_limited',
          message: 'Too many reports submitted. Please try again later.',
        });
      } else if (response.status === 'unauthorized_session') {
        setSubmissionError({
          type: 'unauthorized',
          message: 'You are not authorized to report an issue for this session.',
        });
      } else if (response.status === 'invalid_details') {
        setSubmissionError({
          type: 'invalid_details',
          message: 'Details must be between 5 and 1000 characters.',
        });
      } else {
        setSubmissionError({
          type: 'generic',
          message: 'Unable to submit report. Please check your connection and try again.',
        });
      }
    } catch {
      setSubmissionError({
        type: 'generic',
        message: 'Unable to submit report. Please check your connection and try again.',
      });
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // State A: Submission Success View
  if (submitResult) {
    return (
      <div
        className={`issue-report-container issue-success-view ${className}`}
        role="region"
        aria-label="Issue Submitted Confirmation"
      >
        <div className="card issue-success-card" role="status" aria-live="polite">
          <div className="issue-success-icon-wrap">
            <CheckCircle2 size={36} className="text-success" aria-hidden="true" />
          </div>

          <h2 className="issue-success-title">Report Submitted</h2>
          <p className="issue-success-desc">
            Your issue report has been successfully submitted. Administrators will review the discrepancy and update your record accordingly.
          </p>

          {submitResult.reportId && (
            <div className="issue-reference-box">
              <span className="issue-reference-label">Reference ID</span>
              <code className="issue-reference-value">{submitResult.reportId}</code>
            </div>
          )}

          <div className="issue-success-actions">
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="btn btn-primary issue-action-btn"
                aria-label="Done with reporting issue"
              >
                <span>Done</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResetForm}
                className="btn btn-primary issue-action-btn"
                aria-label="Report another attendance issue"
              >
                <span>Report Another Issue</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={handleResetForm}
                className="btn btn-secondary issue-action-btn-secondary"
                aria-label="Report another issue"
              >
                <span>Report another issue</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // State B: Reporting Form View
  return (
    <div className={`issue-report-container ${className}`} role="region" aria-label="Report Attendance Issue">
      {/* Header */}
      <header className="issue-section-header">
        <div className="issue-header-titles">
          <div className="issue-header-badge">
            <FileQuestion size={13} aria-hidden="true" />
            <span>Support &amp; Inquiries</span>
          </div>
          <h2 className="issue-title">Report Attendance Issue</h2>
        </div>

        {onClose && (
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="issue-close-btn"
            aria-label="Close report form"
            title="Cancel"
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </header>

      {/* Offline Mode Alert Notice */}
      {isOffline && (
        <div className="card issue-alert-card alert-warning" role="alert">
          <div className="alert-icon">
            <WifiOff size={18} aria-hidden="true" />
          </div>
          <div className="alert-body">
            <div className="alert-title">Offline Mode</div>
            <p className="alert-message">
              You are currently offline. Issue reporting requires an active connection and cannot be submitted until you are back online.
            </p>
          </div>
        </div>
      )}

      {/* Optional Session Context Banner */}
      {sessionContext ? (
        <div className="card issue-session-context-card">
          <div className="issue-context-icon">
            <Calendar size={18} aria-hidden="true" />
          </div>
          <div className="issue-context-info">
            <div className="issue-context-label">Attached Attendance Session</div>
            <div className="issue-context-title">
              {sessionContext.sessionTitle || 'Selected Session'}
            </div>
            {sessionContext.date && (
              <div className="issue-context-date">{sessionContext.date}</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleClearSessionContext}
            disabled={isSubmitting || isOffline}
            className="issue-unlink-btn"
            title="Remove session link to submit a general report"
            aria-label="Remove attached session and submit a general report"
          >
            <Link2Off size={14} aria-hidden="true" />
            <span>General</span>
          </button>
        </div>
      ) : (
        <div className="issue-general-badge">
          <Sparkles size={13} aria-hidden="true" />
          <span>General Attendance Discrepancy</span>
        </div>
      )}

      {/* Submission Error Banner */}
      {submissionError && (
        <div
          className={`card issue-alert-card ${
            submissionError.type === 'rate_limited' || submissionError.type === 'offline'
              ? 'alert-warning'
              : 'alert-danger'
          }`}
          role="alert"
        >
          <div className="alert-icon">
            {submissionError.type === 'rate_limited' ? (
              <Clock size={18} aria-hidden="true" />
            ) : submissionError.type === 'offline' ? (
              <WifiOff size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
          </div>
          <div className="alert-body">
            <div className="alert-title">
              {submissionError.type === 'rate_limited'
                ? 'Rate Limit Reached'
                : submissionError.type === 'offline'
                ? 'Offline Notice'
                : submissionError.type === 'unauthorized'
                ? 'Authorization Notice'
                : 'Unable to Submit'}
            </div>
            <p className="alert-message">{submissionError.message}</p>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="issue-form" noValidate>
        {/* Step 1: Category Selection */}
        <fieldset className="issue-fieldset">
          <legend className="issue-label">1. Select Issue Category</legend>
          <div
            className="issue-category-grid"
            role="radiogroup"
            aria-label="Attendance issue category"
          >
            {ISSUE_CATEGORIES.map((cat, idx) => {
              const isSelected = selectedCategory === cat.type;
              return (
                <button
                  key={cat.type}
                  ref={idx === 0 ? firstCategoryRef : undefined}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isSubmitting || isOffline}
                  onClick={() => handleCategorySelect(cat.type)}
                  onKeyDown={(e) => handleCategoryKeyDown(e, idx)}
                  className={`issue-category-card ${isSelected ? 'is-selected' : ''}`}
                >
                  <div className="category-radio-indicator" aria-hidden="true">
                    {isSelected && <div className="radio-dot" />}
                  </div>
                  <div className="category-card-text">
                    <span className="category-name">{cat.label}</span>
                    <span className="category-desc">{cat.description}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Step 2: Issue Description */}
        <div className="issue-fieldset">
          <div className="issue-label-row">
            <label htmlFor="issue-details-input" className="issue-label">
              2. Describe the Discrepancy
            </label>
            <span
              id="char-counter-hint"
              className={`char-counter ${
                isTooShort ? 'char-counter-short' : isTooLong ? 'char-counter-long' : ''
              }`}
              aria-live="polite"
            >
              {trimmedLength}/1000 characters
            </span>
          </div>

          <div className="textarea-wrapper">
            <textarea
              id="issue-details-input"
              rows={4}
              value={details}
              onChange={handleDetailsChange}
              disabled={isSubmitting || isOffline}
              placeholder={
                isOffline
                  ? 'Issue reporting is disabled while offline.'
                  : "Provide specific details about the issue (minimum 5 characters)... e.g., 'I was present at the session and scanned at 8:05 AM, but my attendance shows absent.'"
              }
              aria-describedby="char-counter-hint issue-validation-error"
              aria-invalid={Boolean(validationError || isTooShort || isTooLong)}
              className={`issue-textarea ${
                validationError || isTooShort || isTooLong ? 'has-error' : ''
              }`}
            />
          </div>

          {/* Validation Feedback */}
          {validationError && (
            <div id="issue-validation-error" className="validation-error-text" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          {!validationError && isTooShort && !isOffline && (
            <div className="validation-hint-text">
              <span>Enter at least {5 - trimmedLength} more character{5 - trimmedLength > 1 ? 's' : ''}.</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="issue-form-actions">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-secondary cancel-btn"
            >
              <span>Cancel</span>
            </button>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isOffline || trimmedLength < 5 || trimmedLength > 1000}
            className="btn btn-primary submit-btn"
            aria-label={isSubmitting ? 'Submitting issue report' : 'Submit issue report'}
          >
            {isSubmitting ? (
              <>
                <RotateCw size={15} className="spin-animation" aria-hidden="true" />
                <span>Submitting...</span>
              </>
            ) : isOffline ? (
              <>
                <WifiOff size={15} aria-hidden="true" />
                <span>Offline (Cannot Submit)</span>
              </>
            ) : (
              <>
                <Send size={15} aria-hidden="true" />
                <span>Submit Report</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
