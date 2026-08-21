import React from 'react';
import { CheckCircle2, Clock, AlertCircle, CircleDashed, XCircle } from 'lucide-react';

export interface AttendanceStatusProps {
  portalStatus?: string | null;
  timeIn?: string | null;
  timeOut?: string | null;
  isLate?: boolean;
  lateLabel?: string | null;
  className?: string;
}

export const AttendanceStatus: React.FC<AttendanceStatusProps> = ({
  portalStatus,
  timeIn,
  timeOut,
  isLate,
  lateLabel,
  className = '',
}) => {
  // Determine primary display state based on timestamps and backend portalStatus
  const hasTimeIn = Boolean(timeIn);
  const hasTimeOut = Boolean(timeOut);

  let badgeVariant = 'badge-neutral';
  let statusText = 'Not Recorded';
  let StatusIcon = CircleDashed;

  if (hasTimeIn && hasTimeOut) {
    statusText = 'Attendance Complete';
    badgeVariant = 'badge-success';
    StatusIcon = CheckCircle2;
  } else if (hasTimeIn && !hasTimeOut) {
    statusText = 'Timed In';
    badgeVariant = 'badge-info';
    StatusIcon = Clock;
  } else if (portalStatus === 'Awaiting Scan') {
    statusText = 'Awaiting Scan';
    badgeVariant = 'badge-neutral';
    StatusIcon = CircleDashed;
  } else if (portalStatus === 'Missing Time In') {
    statusText = 'Missing Time In';
    badgeVariant = 'badge-warning';
    StatusIcon = AlertCircle;
  } else if (portalStatus === 'Absent') {
    statusText = 'Absent';
    badgeVariant = 'badge-danger';
    StatusIcon = XCircle;
  } else if (portalStatus) {
    statusText = portalStatus;
  }

  return (
    <div className={`attendance-status-group ${className}`} role="status" aria-label={`Attendance status: ${statusText}`}>
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
    </div>
  );
};
