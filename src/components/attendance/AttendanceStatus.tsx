import React from 'react';
import { CheckCircle2, Clock, AlertCircle, CircleDashed, XCircle } from 'lucide-react';

export interface AttendanceStatusProps {
  portalStatus?: string | null;
  timeIn?: string | null;
  timeOut?: string | null;
  isLate?: boolean;
  lateLabel?: string | null;
  /** Show the plain-language explanation under the badge (Today view only). */
  showHelp?: boolean;
  className?: string;
}

/**
 * Maps backend portal statuses to plain-language labels a student can
 * understand at a glance. Never exposes raw database or RPC terminology.
 */
export function getAttendanceStatusDisplay(
  portalStatus?: string | null,
  timeIn?: string | null,
  timeOut?: string | null
): {
  statusText: string;
  badgeVariant: string;
  helpText: string | null;
} {
  const hasTimeIn = Boolean(timeIn);
  const hasTimeOut = Boolean(timeOut);

  if (hasTimeIn && hasTimeOut) {
    return {
      statusText: 'Present',
      badgeVariant: 'badge-success',
      helpText: 'Attendance recorded successfully.',
    };
  }

  if (hasTimeIn && !hasTimeOut) {
    return {
      statusText: 'Timed In',
      badgeVariant: 'badge-info',
      helpText: "You're checked in. Your time out hasn't been recorded yet.",
    };
  }

  if (portalStatus === 'Not Open Yet') {
    return {
      statusText: 'Not open yet',
      badgeVariant: 'badge-neutral',
      helpText: "This session hasn't been opened for scanning yet. Check back later.",
    };
  }

  if (portalStatus === 'Awaiting Scan') {
    return {
      statusText: 'Not checked in',
      badgeVariant: 'badge-neutral',
      helpText: 'Scan the attendance QR code to record your attendance.',
    };
  }

  if (portalStatus === 'Missing Time In') {
    return {
      statusText: 'Missing Time In',
      badgeVariant: 'badge-warning',
      helpText: 'Your time out was recorded, but not your time in. Report this if it looks wrong.',
    };
  }

  if (portalStatus === 'Absent') {
    return {
      statusText: 'Absent',
      badgeVariant: 'badge-danger',
      helpText: 'No attendance was recorded for this session.',
    };
  }

  if (portalStatus === 'Complete') {
    return {
      statusText: 'Present',
      badgeVariant: 'badge-success',
      helpText: 'Attendance recorded successfully.',
    };
  }

  if (portalStatus === 'In Progress') {
    return {
      statusText: 'Timed In',
      badgeVariant: 'badge-info',
      helpText: "You're checked in. Your time out hasn't been recorded yet.",
    };
  }

  if (portalStatus === 'Not Recorded' || !portalStatus) {
    return {
      statusText: 'No record yet',
      badgeVariant: 'badge-neutral',
      helpText: 'Your attendance for this session has not been recorded yet.',
    };
  }

  // Unknown backend status: show it as-is rather than guessing.
  return { statusText: portalStatus, badgeVariant: 'badge-neutral', helpText: null };
}

export const AttendanceStatus: React.FC<AttendanceStatusProps> = ({
  portalStatus,
  timeIn,
  timeOut,
  isLate,
  lateLabel,
  showHelp = true,
  className = '',
}) => {
  const { statusText, badgeVariant, helpText } = getAttendanceStatusDisplay(
    portalStatus,
    timeIn,
    timeOut
  );

  let StatusIcon = CircleDashed;
  if (badgeVariant === 'badge-success') StatusIcon = CheckCircle2;
  else if (badgeVariant === 'badge-info') StatusIcon = Clock;
  else if (badgeVariant === 'badge-warning') StatusIcon = AlertCircle;
  else if (badgeVariant === 'badge-danger') StatusIcon = XCircle;

  return (
    <div className={`attendance-status-group ${className}`} role="status" aria-label={`Attendance status: ${statusText}`}>
      <span className="status-badge-row">
        <span className={`status-badge ${badgeVariant}`}>
          <StatusIcon size={14} className="status-badge-icon" aria-hidden="true" />
          <span className="status-badge-text">{statusText}</span>
        </span>

        {isLate && (
          <span className="status-badge badge-warning" aria-label={`Attendance penalty: ${lateLabel || 'Late'}`}>
            <AlertCircle size={14} className="status-badge-icon" aria-hidden="true" />
            <span className="status-badge-text">{lateLabel || 'Late'}</span>
          </span>
        )}
      </span>

      {showHelp && helpText && <span className="status-help-text">{helpText}</span>}
    </div>
  );
};
