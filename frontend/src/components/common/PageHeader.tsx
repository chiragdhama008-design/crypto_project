import React from 'react';
import { ArrowLeft } from 'lucide-react';

export interface HeaderBadge {
  label: string;
  tone?: 'accent' | 'illicit' | 'licit' | 'info' | 'unknown';
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badges?: HeaderBadge[];
  backLabel?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

const badgeClassMap: Record<NonNullable<HeaderBadge['tone']>, string> = {
  accent: 'badge-accent',
  illicit: 'badge-illicit',
  licit: 'badge-licit',
  info: 'badge-info',
  unknown: 'badge-unknown',
};

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  eyebrow,
  badges = [],
  backLabel,
  onBack,
  actions,
}) => {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {onBack && backLabel && (
          <button
            type="button"
            onClick={onBack}
            className="text-link page-back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{backLabel}</span>
          </button>
        )}

        {(eyebrow || badges.length > 0) && (
          <div className="page-eyebrow-row">
            {eyebrow && (
              <span className="page-eyebrow">
                {eyebrow}
              </span>
            )}
            {badges.map((b, i) => (
              <span
                key={i}
                className={`badge-pill ${badgeClassMap[b.tone || 'accent']}`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}

        <h1>
          {title}
        </h1>

        {subtitle && (
          <p className="page-subtitle">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="page-header-actions">
          {actions}
        </div>
      )}
    </header>
  );
};
