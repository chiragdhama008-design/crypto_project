import React from 'react';
import { RiskLevel } from '../../types/api';

interface RiskGaugeProps {
  score: number;
  level?: RiskLevel | string | null;
  size?: number;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({ score, level, size = 104 }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const normLevel = (level || (clamped >= 81 ? 'CRITICAL' : clamped >= 61 ? 'HIGH' : clamped >= 31 ? 'MEDIUM' : 'LOW')).toUpperCase();

  let strokeColor = 'var(--signal-licit)';
  if (normLevel === 'CRITICAL') strokeColor = 'var(--signal-illicit)';
  else if (normLevel === 'HIGH') strokeColor = 'var(--signal-high)';
  else if (normLevel === 'MEDIUM') strokeColor = 'var(--signal-medium)';

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Composite risk score ${clamped} out of 100 (${normLevel})`}
    >
      <svg width={size} height={size} viewBox="0 0 96 96" className="-rotate-90">
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="var(--border-strong)"
          strokeOpacity="0.45"
          strokeWidth="7"
        />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 450ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span
          className="font-mono font-semibold text-xl tabular-nums"
          style={{ color: strokeColor }}
        >
          {clamped}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted mt-1">
          / 100
        </span>
      </div>
    </div>
  );
};

