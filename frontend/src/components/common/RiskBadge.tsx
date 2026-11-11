import React from 'react';
import { RiskLevel } from '../../types/api';

interface RiskBadgeProps {
  score?: number | null;
  level?: RiskLevel | string | null;
  showScore?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, level, showScore = true }) => {
  if (!level && (score === null || score === undefined)) {
    return <span className="badge-pill badge-unknown">Not scored</span>;
  }
  const normLevel = (level || (score! >= 81 ? 'CRITICAL' : score! >= 61 ? 'HIGH' : score! >= 31 ? 'MEDIUM' : 'LOW')).toUpperCase();

  let badgeClass = 'badge-low';
  if (normLevel === 'CRITICAL') {
    badgeClass = 'badge-critical';
  } else if (normLevel === 'HIGH') {
    badgeClass = 'badge-high';
  } else if (normLevel === 'MEDIUM') {
    badgeClass = 'badge-medium';
  }

  return (
    <span className={`badge-pill ${badgeClass} tabular-nums`}>
      <span className="status-dot" aria-hidden="true" />
      <span>{normLevel.charAt(0) + normLevel.slice(1).toLowerCase()}</span>
      {showScore && score !== undefined && score !== null && (
        <span className="opacity-80">{score}</span>
      )}
    </span>
  );
};
