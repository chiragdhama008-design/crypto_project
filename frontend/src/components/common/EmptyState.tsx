import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'error';
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  tone = 'neutral',
}) => {
  const isError = tone === 'error';

  return (
    <div
      className={`empty-state ${isError ? 'is-error' : ''}`}
      role={isError ? 'alert' : undefined}
    >
      <div
        className="empty-state-icon"
      >
        <Icon size={24} strokeWidth={1.4} />
      </div>

      <h3>
        {title}
      </h3>

      {description && (
        <p>
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <div className="pt-2">
          <button type="button" onClick={onAction} className="btn-primary">
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};
