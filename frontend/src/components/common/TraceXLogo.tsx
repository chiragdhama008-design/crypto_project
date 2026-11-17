import React from 'react';

interface TraceXLogoProps {
  compact?: boolean;
  showSubtitle?: boolean;
}

export const TraceXLogo: React.FC<TraceXLogoProps> = ({
  compact = false,
  showSubtitle = true,
}) => {
  return (
    <div className="brand-lockup">
      <div className="brand-mark">
        <svg
          width="24"
          height="24"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M6 6H12L26 26H20L6 6Z" fill="currentColor" />
          <path d="M21 6H27L11 26H5L21 6Z" fill="currentColor" opacity=".65" />
          <circle cx="25" cy="7" r="3" fill="currentColor" stroke="var(--bg-canvas)" strokeWidth="1.5" />
        </svg>
      </div>

      {!compact && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="brand-name">
              ChainGuard
            </span>
          </div>
          {showSubtitle && (
            <div className="brand-subtitle">
              Forensic intelligence
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ChainGuardLogo = TraceXLogo;
