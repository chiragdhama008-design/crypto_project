import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Flame,
  LucideIcon,
} from 'lucide-react';
import { api } from '../services/api';
import { TransactionSummary } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatTile, StatTone } from '../components/common/StatTile';
import { TableRowsSkeleton } from '../components/common/LoadingSkeleton';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';

export const RiskAlerts: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const levelFilter = (searchParams.get('level') || 'CRITICAL').toUpperCase();
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 25;

  const [alerts, setAlerts] = useState<TransactionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0, low: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(() => {
    setLoading(true);
    api
      .getHighRiskQueue({
        level: levelFilter || undefined,
        page,
        limit,
      })
      .then((res) => {
        setAlerts(res.transactions);
        setTotal(res.total);
        setCounts({
          critical: res.critical_count,
          high: res.high_count,
          medium: res.medium_count,
          low: res.low_count,
        });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [levelFilter, page, limit]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleLevelChange = (lvl: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('level', lvl);
    next.set('page', '1');
    setSearchParams(next);
  };

  const handlePageChange = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', nextPage.toString());
    setSearchParams(next);
  };

  const tiers: Array<{
    key: string;
    label: string;
    count: number;
    caption: string;
    tone: StatTone;
    icon: LucideIcon;
  }> = [
    {
      key: 'CRITICAL',
      label: 'Critical Risk',
      count: counts.critical,
      caption: 'Score 81–100 · Immediate review',
      tone: 'illicit',
      icon: Flame,
    },
    {
      key: 'HIGH',
      label: 'High Risk',
      count: counts.high,
      caption: 'Score 61–80 · Elevated exposure',
      tone: 'high',
      icon: ShieldAlert,
    },
    {
      key: 'MEDIUM',
      label: 'Medium Risk',
      count: counts.medium,
      caption: 'Score 31–60 · Secondary triage',
      tone: 'accent',
      icon: AlertTriangle,
    },
    {
      key: 'LOW',
      label: 'Low Risk',
      count: counts.low,
      caption: 'Score 0–30 · Nominal baseline',
      tone: 'licit',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fade-up">
      <PageHeader
        eyebrow="COMPOSITE ANOMALY ENGINE"
        badges={[
          { label: `${levelFilter} QUEUE`, tone: levelFilter === 'CRITICAL' ? 'illicit' : 'accent' },
          { label: `${total.toLocaleString()} FLAGGED`, tone: 'unknown' },
        ]}
        title="Risk & Alert Triage Queue"
        subtitle="Prioritized investigative queue ordered by composite risk score (55% ML inference, 25% neighborhood illicit taint, 10% degree topology, 10% z-score anomalies)."
        actions={
          <button
            type="button"
            onClick={fetchAlerts}
            disabled={loading}
            className="btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 text-accent ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        }
      />

      {/* Interactive Tier Selector Grid */}
      <section aria-label="Risk Severity Tiers" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {tiers.map((t) => (
          <StatTile
            key={t.key}
            label={t.label}
            value={t.count.toLocaleString()}
            caption={t.caption}
            tone={t.tone}
            icon={t.icon}
            active={levelFilter === t.key}
            onClick={() => handleLevelChange(t.key)}
          />
        ))}
      </section>

      {/* Queue Table */}
      <section className="panel-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>Step</th>
                <th>Ground Truth</th>
                <th>Model Prediction</th>
                <th>P(Illicit)</th>
                <th>Risk Score</th>
                <th>Severity</th>
                <th>Degree</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowsSkeleton rows={10} cols={9} />
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-signal-illicit text-xs font-mono">
                    Error loading risk queue: {error}
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-ink-muted text-xs font-mono">
                    No indexed transactions found in the &ldquo;{levelFilter}&rdquo; risk tier.
                  </td>
                </tr>
              ) : (
                alerts.map((tx) => {
                  const prob = tx.prediction_probability ?? tx.probability;
                  const degree = tx.total_degree ?? (tx.in_degree || 0) + (tx.out_degree || 0);
                  return (
                    <tr
                      key={tx.transaction_id}
                      onClick={() => navigate(`/transactions/${tx.transaction_id}`)}
                      className="cursor-pointer group"
                    >
                      <td className="font-mono font-semibold text-ink group-hover:text-accent tabular-nums">
                        #{tx.transaction_id}
                      </td>
                      <td className="font-mono text-ink-secondary tabular-nums">
                        Step {tx.time_step}
                      </td>
                      <td>
                        <LabelBadge label={tx.known_label} />
                      </td>
                      <td>
                        {tx.prediction ? (
                          <LabelBadge label={tx.prediction} isPrediction />
                        ) : (
                          <span className="text-ink-muted font-mono">—</span>
                        )}
                      </td>
                      <td className="font-mono text-ink-secondary tabular-nums">
                        {prob !== null && prob !== undefined ? `${(prob * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td className="font-mono tabular-nums">
                        <span className="font-semibold text-ink">{tx.risk_score}</span>
                        <span className="text-ink-muted text-[11px]"> / 100</span>
                      </td>
                      <td>
                        <RiskBadge score={tx.risk_score} level={tx.risk_level} showScore={false} />
                      </td>
                      <td className="font-mono text-ink-muted text-xs tabular-nums">
                        {degree} edges ({tx.in_degree || 0}↓ {tx.out_degree || 0}↑)
                      </td>
                      <td className="text-right">
                        <span className="text-xs font-mono font-semibold text-accent inline-flex items-center gap-1">
                          <span>Investigate</span>
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="px-5 py-3.5 bg-inset/60 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-ink-muted tabular-nums">
          <div>
            Showing{' '}
            <span className="text-ink font-semibold">
              {alerts.length > 0 ? (page - 1) * limit + 1 : 0}
            </span>{' '}
            to <span className="text-ink font-semibold">{Math.min(page * limit, total)}</span> of{' '}
            <span className="text-ink font-semibold">{total.toLocaleString()}</span> alerts
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              className="btn-secondary min-h-[34px] py-1 px-3 text-xs font-mono"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="px-2 text-accent font-semibold">Page {page}</span>
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={alerts.length < limit || page * limit >= total || loading}
              className="btn-secondary min-h-[34px] py-1 px-3 text-xs font-mono"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
