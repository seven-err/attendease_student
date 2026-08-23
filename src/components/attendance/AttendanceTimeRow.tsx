import React from 'react';
import { LogIn, LogOut } from 'lucide-react';

export interface AttendanceTimeRowProps {
  timeIn?: string | null;
  timeOut?: string | null;
  className?: string;
}

export function formatAttendanceTime(isoString: string | null | undefined): string | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

export const AttendanceTimeRow: React.FC<AttendanceTimeRowProps> = ({
  timeIn,
  timeOut,
  className = '',
}) => {
  const formattedTimeIn = formatAttendanceTime(timeIn);
  const formattedTimeOut = formatAttendanceTime(timeOut);

  const hasTimeIn = Boolean(timeIn);
  const hasTimeOut = Boolean(timeOut);

  return (
    <div className={`attendance-time-grid ${className}`}>
      {/* Time In Card */}
      <div
        className={`time-card ${hasTimeIn ? 'time-card-recorded' : 'time-card-pending'}`}
        aria-label={`Time In: ${formattedTimeIn || 'Not recorded yet'}`}
      >
        <div className="time-card-header">
          <div className="time-card-label">
            <LogIn size={14} className="time-card-icon time-in-icon" aria-hidden="true" />
            <span>Time In</span>
          </div>
        </div>
        <div className="time-card-value">
          {formattedTimeIn ? (
            <span className="time-timestamp">{formattedTimeIn}</span>
          ) : (
            <span className="time-placeholder">Not recorded yet</span>
          )}
        </div>
      </div>

      {/* Time Out Card */}
      <div
        className={`time-card ${hasTimeOut ? 'time-card-recorded' : 'time-card-pending'}`}
        aria-label={`Time Out: ${formattedTimeOut || (hasTimeIn ? 'Pending' : 'Not recorded yet')}`}
      >
        <div className="time-card-header">
          <div className="time-card-label">
            <LogOut size={14} className="time-card-icon time-out-icon" aria-hidden="true" />
            <span>Time Out</span>
          </div>
        </div>
        <div className="time-card-value">
          {formattedTimeOut ? (
            <span className="time-timestamp">{formattedTimeOut}</span>
          ) : hasTimeIn ? (
            <span className="time-placeholder awaiting-text">Not recorded yet</span>
          ) : (
            <span className="time-placeholder">Not recorded yet</span>
          )}
        </div>
      </div>
    </div>
  );
};
