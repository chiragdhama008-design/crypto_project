import React, { useEffect, useState } from 'react';
import { LucideIcon } from 'lucide-react';
import { useMotion } from '../../context/MotionContext';

export type StatTone =
  | 'neutral'
  | 'accent'
  | 'illicit'
  | 'licit'
  | 'unknown'
  | 'high'
  | 'info';

interface StatTileProps {
  label: string;
  value: string | number;
  caption?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  /** Stagger index for entrance animation (0–3) */
  index?: number;
}

function AnimatedValue({ value }: { value: number }) {
  const { motionEnabled } = useMotion();
  const [display, setDisplay] = useState(value);
  const reduced = !motionEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reduced || !Number.isFinite(value)) return;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / 850, 1);
      setDisplay(value * (1 - Math.pow(1 - progress, 4)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <><span aria-hidden="true">{(reduced ? value : display).toLocaleString(undefined, { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 })}</span><span className="sr-only">{value.toLocaleString()}</span></>;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'neutral',
  active = false,
  onClick,
  className = '',
  index,
}) => {
  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? active : undefined}
      data-tone={tone}
      className={`stat-tile panel-surface ${onClick ? 'is-interactive' : ''} ${active ? 'is-active' : ''} ${className}`}
      style={{ '--stagger': `${(index ?? 0) * 55}ms` } as React.CSSProperties}
    >
      <div className="stat-tile-heading">
        <span>{label}</span>
        {Icon && <span className="stat-icon"><Icon size={17} strokeWidth={1.6} /></span>}
      </div>
      <div className={`stat-value ${typeof value === 'string' && value.length > 10 ? 'stat-value-text' : ''}`}>
        {typeof value === 'number' ? <AnimatedValue value={value} /> : value}
      </div>
      {caption && <div className="stat-caption">{caption}</div>}
    </Wrapper>
  );
};
