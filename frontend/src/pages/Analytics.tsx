import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowUpRight, Database, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import type { HighRiskQueueResponse } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatTile } from '../components/common/StatTile';
import { CustomTooltip } from '../components/common/CustomTooltip';
import { EmptyState } from '../components/common/EmptyState';

interface AnalyticsReference {
  total_transactions: number;
  total_edges: number;
  illicit_transactions: number;
  licit_transactions: number;
  unknown_transactions: number;
  degree_distribution: Record<string, number>;
}

interface TemporalPoint {
  time_step: number;
  total: number;
  illicit: number;
  licit: number;
  unknown: number;
}

const compactCount = (value: number) => value >= 1000 ? `${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k` : value.toLocaleString();

export const Analytics: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsReference | null>(null);
  const [timeSeries, setTimeSeries] = useState<TemporalPoint[]>([]);
  const [indexedRisk, setIndexedRisk] = useState<HighRiskQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [temporalError, setTemporalError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'count' | 'share'>('count');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRiskLoading(true);
    setError(null);
    setTemporalError(null);
    setRiskError(null);
    setOverview(null);
    setTimeSeries([]);
    setIndexedRisk(null);

    Promise.allSettled([api.getAnalyticsOverview(), api.getTimeSeries()])
      .then(([overviewResult, temporalResult]) => {
        if (cancelled) return;
        if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
        else setError('The dataset reference summary could not be loaded.');
        if (temporalResult.status === 'fulfilled') setTimeSeries(temporalResult.value);
        else setTemporalError('The reference timestep series could not be loaded.');
        setLoading(false);
      });

    // Overview risk tiers are reference placeholders; this read queries indexed records.
    api.getHighRiskQueue({ limit: 1 })
      .then((data) => {
        if (cancelled) return;
        setIndexedRisk(data);
        setRiskLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRiskError('Indexed risk counts could not be loaded. Reference totals are not a substitute.');
        setRiskLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  const totalTx = overview?.total_transactions ?? 0;
  const knownCount = (overview?.illicit_transactions ?? 0) + (overview?.licit_transactions ?? 0);
  const knownShare = totalTx > 0 ? (knownCount / totalTx) * 100 : 0;
  const illicitShare = totalTx > 0 ? ((overview?.illicit_transactions ?? 0) / totalTx) * 100 : 0;
  const illicitShareKnown = knownCount > 0 ? ((overview?.illicit_transactions ?? 0) / knownCount) * 100 : 0;
  const classData = [
    { name: 'Illicit', value: overview?.illicit_transactions ?? 0, color: 'var(--signal-illicit)' },
    { name: 'Licit', value: overview?.licit_transactions ?? 0, color: 'var(--accent-primary)' },
    { name: 'Unknown', value: overview?.unknown_transactions ?? 0, color: 'var(--signal-unknown)' },
  ];
  const temporalData = [...timeSeries].sort((a, b) => a.time_step - b.time_step).map((point) => chartMode === 'count' ? point : {
    ...point,
    illicit: point.total > 0 ? (point.illicit / point.total) * 100 : 0,
    licit: point.total > 0 ? (point.licit / point.total) * 100 : 0,
    unknown: point.total > 0 ? (point.unknown / point.total) * 100 : 0,
  });
  const degreeData = Object.entries(overview?.degree_distribution ?? {}).map(([bucket, count]) => ({ bucket, count }));
  const riskData = indexedRisk ? [
    { name: 'Critical', count: indexedRisk.critical_count, color: 'var(--signal-illicit)' },
    { name: 'High', count: indexedRisk.high_count, color: 'var(--signal-high)' },
    { name: 'Medium', count: indexedRisk.medium_count, color: 'var(--signal-medium)' },
    { name: 'Low', count: indexedRisk.low_count, color: 'var(--accent-primary)' },
  ] : [];
  const classifiedRiskCount = riskData.reduce((sum, tier) => sum + tier.count, 0);

  return (
    <div className="workspace-page space-y-6">
      <PageHeader
        title="Analytics"
        eyebrow="Network analysis"
        subtitle="Read the corpus patterns, then check the indexed risk picture."
        badges={[{ label: 'Dataset reference', tone: 'unknown' }]}
        actions={
          <button type="button" className="btn-secondary" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading || riskLoading}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh analytics
          </button>
        }
      />

      {loading ? (
        <div className="space-y-4" role="status" aria-label="Loading dataset reference analytics">
          <div className="metrics-grid grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="panel-surface h-28 animate-pulse" />)}</div>
          <div className="panel-surface h-80 animate-pulse" aria-hidden="true" />
          <span className="sr-only">Loading reference distributions...</span>
        </div>
      ) : error || !overview ? (
        <EmptyState icon={AlertTriangle} tone="error" title="Reference analytics unavailable" description={error || 'The reference summary is not available.'} actionLabel="Retry analytics" onAction={() => setRefreshKey((key) => key + 1)} />
      ) : (
        <>
          <section className="space-y-3" aria-label="Dataset reference totals">
            <div className="metrics-grid grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatTile label="Reference transactions" value={totalTx.toLocaleString()} caption="Full Elliptic corpus" />
              <StatTile label="Reference edges" value={overview.total_edges.toLocaleString()} caption="Directed graph connections" />
              <StatTile label="Known labels" value={knownCount.toLocaleString()} caption={`${knownShare.toFixed(1)}% of reference nodes`} />
              <StatTile label="Illicit share" value={`${illicitShare.toFixed(1)}%`} caption={`${illicitShareKnown.toFixed(1)}% among known labels`} tone="accent" />
            </div>
            <p className="data-note">Dataset reference totals describe the corpus. They do not measure the records indexed in this workspace.</p>
          </section>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <section className="panel-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="temporal-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 id="temporal-heading" className="section-heading">Temporal composition</h2><p className="mt-1 text-xs text-ink-muted">Dataset reference / {timeSeries.length} timesteps</p></div>
                <div className="segmented-control flex" role="group" aria-label="Temporal chart values">
                  <button type="button" className="btn-ghost" aria-pressed={chartMode === 'count'} onClick={() => setChartMode('count')}>Volume</button>
                  <button type="button" className="btn-ghost" aria-pressed={chartMode === 'share'} onClick={() => setChartMode('share')}>Share</button>
                </div>
              </div>
              <div className="chart-legend flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
                {classData.map((item) => <span key={item.name} className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />{item.name}</span>)}
                <span className="ml-auto">{chartMode === 'count' ? 'Transactions' : 'Share of timestep (%)'}</span>
              </div>
              {temporalError ? (
                <p className="py-20 text-sm text-ink-muted" role="alert">{temporalError}</p>
              ) : temporalData.length ? (
                <div className="h-64 min-w-0 w-full sm:h-80">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                    <BarChart data={temporalData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} barCategoryGap="22%" accessibilityLayer>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
                      <XAxis dataKey="time_step" ticks={[1, 10, 20, 30, 40, 49]} interval={0} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis width={42} domain={chartMode === 'share' ? [0, 100] : [0, 'auto']} tickFormatter={chartMode === 'share' ? (value: number) => `${value}%` : compactCount} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip labelPrefix="Timestep " valueSuffix={chartMode === 'share' ? '%' : ''} />} cursor={{ fill: 'var(--bg-hover)' }} />
                      <Bar dataKey="illicit" name="Illicit" stackId="labels" fill="var(--signal-illicit)" isAnimationActive={false} />
                      <Bar dataKey="licit" name="Licit" stackId="labels" fill="var(--accent-primary)" isAnimationActive={false} />
                      <Bar dataKey="unknown" name="Unknown" stackId="labels" fill="var(--signal-unknown)" fillOpacity={0.4} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="py-20 text-sm text-ink-muted">No reference timestep data is available.</p>}
              <p className="text-right text-xs text-ink-muted">Timestep</p>
            </section>

            <section className="panel-surface min-w-0 space-y-4 p-5 sm:p-6" aria-labelledby="coverage-heading">
              <div><h2 id="coverage-heading" className="section-heading">Label coverage</h2><p className="mt-1 text-xs text-ink-muted">Dataset reference / known and unknown nodes</p></div>
              {totalTx > 0 ? (
                <div className="relative h-52 min-w-0 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                    <PieChart>
                      <Pie data={classData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={88} cx="50%" cy="50%" stroke="var(--bg-surface)" strokeWidth={3} isAnimationActive={false}>
                        {classData.map((item) => <Cell key={item.name} fill={item.color} fillOpacity={item.name === 'Unknown' ? 0.4 : 1} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-medium text-ink tabular-nums">{knownShare.toFixed(1)}%</span><span className="mt-1 text-xs text-ink-muted">known labels</span></div>
                </div>
              ) : <p className="py-10 text-sm text-ink-muted">No reference labels are available.</p>}
              <dl className="divide-y divide-line text-sm">
                {classData.map((item) => <div key={item.name} className="flex items-center justify-between gap-3 py-2.5"><dt className="inline-flex items-center gap-2 text-ink-muted"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</dt><dd className="text-right text-ink tabular-nums">{item.value.toLocaleString()}<span className="ml-2 inline-block min-w-12 text-xs text-ink-muted">{totalTx > 0 ? ((item.value / totalTx) * 100).toFixed(1) : '0.0'}%</span></dd></div>)}
              </dl>
              <p className="data-note">Unknown is not licit. Unlabeled nodes remain in the graph but are excluded from supervised evaluation.</p>
            </section>
          </div>
        </>
      )}

      <div className={`grid min-w-0 gap-5 ${overview ? 'xl:grid-cols-2' : ''}`}>
        {overview && (
          <section className="panel-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="degree-heading">
            <div><h2 id="degree-heading" className="section-heading">Graph connectivity</h2><p className="mt-1 text-xs text-ink-muted">Dataset reference / degree buckets</p></div>
            {degreeData.length ? (
              <div className="h-60 min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                  <BarChart data={degreeData} layout="vertical" margin={{ top: 4, right: 20, left: 0, bottom: 8 }} accessibilityLayer>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" horizontal={false} />
                    <XAxis type="number" tickFormatter={compactCount} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="bucket" width={42} tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip labelPrefix="Degree " />} cursor={{ fill: 'var(--bg-hover)' }} />
                    <Bar dataKey="count" name="Transactions" fill="var(--accent-primary)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="py-16 text-sm text-ink-muted">No degree distribution was returned.</p>}
            <p className="data-note">A connection count describes topology. It does not identify a mixer or establish illicit activity.</p>
          </section>
        )}

        <section className="panel-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="indexed-risk-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="indexed-risk-heading" className="section-heading">Indexed risk</h2><span className="badge-pill badge-unknown">Database snapshot</span></div>
          {riskLoading ? (
            <div className="space-y-4 py-6" role="status"><p className="text-sm text-ink-muted">Reading indexed risk counts...</p><div className="h-40 animate-pulse rounded-lg bg-inset" aria-hidden="true" /></div>
          ) : riskError || !indexedRisk ? (
            <div className="space-y-4 py-6"><p className="data-note" role="alert">{riskError || 'No indexed risk response is available.'}</p><button type="button" className="btn-secondary" onClick={() => setRefreshKey((key) => key + 1)}>Retry analytics</button></div>
          ) : indexedRisk.total === 0 ? (
            <div className="space-y-4 py-5">
              <Database className="h-7 w-7 text-ink-muted" aria-hidden="true" />
              <div><p className="text-3xl font-medium text-ink tabular-nums">0</p><h3 className="mt-2 text-base font-medium text-ink">No scored transactions</h3><p className="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">The risk query returned no scored indexed records. The reference corpus above is not an alert queue.</p></div>
              <Link to="/dataset" className="text-link inline-flex min-h-11 items-center gap-2 text-sm">View dataset status<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1"><p className="text-3xl font-medium text-ink tabular-nums">{indexedRisk.total.toLocaleString()}</p><p className="pb-1 text-sm text-ink-muted">scored indexed records</p></div>
              <dl className="space-y-4">
                {riskData.map((tier) => <div key={tier.name} className="grid grid-cols-[72px_minmax(0,1fr)_60px] items-center gap-3 text-sm"><dt className="text-ink-muted">{tier.name}</dt><dd className="progress-track h-1.5 overflow-hidden rounded-full bg-inset" aria-label={`${tier.count.toLocaleString()} ${tier.name.toLowerCase()} risk records`}><div className="h-full rounded-full" style={{ backgroundColor: tier.color, width: `${classifiedRiskCount > 0 ? (tier.count / classifiedRiskCount) * 100 : 0}%` }} /></dd><dd className="text-right text-ink tabular-nums">{tier.count.toLocaleString()}</dd></div>)}
              </dl>
              <Link to="/risk" className="text-link inline-flex min-h-11 items-center gap-2 text-sm">View risk queue<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            </>
          )}
          <p className="data-note border-t border-line pt-4">Counts come from indexed database records, including all scored tiers. Risk is a triage score, not a ground-truth label.</p>
        </section>
      </div>
    </div>
  );
};
