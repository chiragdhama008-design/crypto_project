import React from 'react';
import { KnownLabel } from '../../types/api';

interface LabelBadgeProps {
  label: KnownLabel | string;
  isPrediction?: boolean;
}

export const LabelBadge: React.FC<LabelBadgeProps> = ({ label, isPrediction = false }) => {
  const norm = (label || 'UNKNOWN').toUpperCase();

  let badgeClass = 'badge-unknown';
  let dotColor = 'bg-signal-unknown';

  if (norm === 'ILLICIT') {
    badgeClass = 'badge-illicit';
    dotColor = 'bg-signal-illicit';
  } else if (norm === 'LICIT') {
    badgeClass = 'badge-licit';
    dotColor = 'bg-signal-licit';
  }

  return (
    <span
      className={`badge-pill ${badgeClass}`}
      title={isPrediction ? `Model Prediction: ${norm}` : `Dataset Ground Truth: ${norm}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
      {isPrediction && <span className="opacity-70 text-[10px]">Model</span>}
      <span>{norm.charAt(0) + norm.slice(1).toLowerCase()}</span>
    </span>
  );
};
