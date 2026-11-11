import React from 'react';

interface TooltipPayloadEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  labelPrefix?: string;
  valueSuffix?: string;
}

export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  labelPrefix = '',
  valueSuffix = '',
}) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-surface/95 backdrop-blur-md border border-line-strong rounded-lg shadow-elevated px-3 py-2.5 text-xs font-mono tabular-nums min-w-[140px]">
      {label !== undefined && label !== null && label !== '' && (
        <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider pb-1.5 mb-1.5 border-b border-line">
          {labelPrefix}
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-secondary">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color || 'var(--accent-primary)' }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-semibold text-ink">
              {typeof entry.value === 'number'
                ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 4 })
                : entry.value}
              {valueSuffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

