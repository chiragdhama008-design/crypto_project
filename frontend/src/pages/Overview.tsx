import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight, Cpu, Layers, Network, ShieldAlert, Database, ScanLine, Info, RefreshCw, ShieldCheck, CircleHelp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import type { DashboardOverview, DatasetStatus, HighRiskQueueResponse, ModelSummary } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatTile } from '../components/common/StatTile';
import { CustomTooltip } from '../components/common/CustomTooltip';
import { PageSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { NetworkMotif } from '../components/common/NetworkMotif';
import { useMotion } from '../context/MotionContext';

export function Overview() {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [index, setIndex] = useState<DatasetStatus | null>(null);
  const [queue, setQueue] = useState<HighRiskQueueResponse | null>(null);
  const [model, setModel] = useState<ModelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [illicitOnly, setIllicitOnly] = useState(false);
  const { motionEnabled } = useMotion();

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([api.getDashboard(), api.getDatasetStatus(), api.getHighRiskQueue({ limit: 5 }), api.listModels()]).then(([dashboardResult, indexResult, queueResult, modelsResult]) => {
      if (!active) return;
      if (dashboardResult.status === 'fulfilled') { setData(dashboardResult.value); setError(null); }
      else setError(dashboardResult.reason?.message || 'The dashboard could not be loaded.');
      setIndex(indexResult.status === 'fulfilled' ? indexResult.value : null);
      setQueue(queueResult.status === 'fulfilled' ? queueResult.value : null);
      const models = modelsResult.status === 'fulfilled' ? modelsResult.value.models : [];
      setModel(models.find((item) => item.is_active) || null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [revision]);

  if (loading && !data) return <PageSkeleton />;
  if (error || !data) return <div className="workspace-page"><EmptyState tone="error" title="Workspace unavailable" description={error || 'The backend did not return dashboard data.'} actionLabel="Retry connection" onAction={() => setRevision((value) => value + 1)} /></div>;

  const coverage = data.total_transactions ? data.known_transactions / data.total_transactions * 100 : 0;
  const licitShare = data.total_transactions ? data.licit_transactions / data.total_transactions : 0;
  const illicitShare = data.total_transactions ? data.illicit_transactions / data.total_transactions : 0;
  const circumference = 2 * Math.PI * 50;
  const labels = [
    { label: 'Licit', count: data.licit_transactions, color: 'var(--signal-licit)' },
    { label: 'Illicit', count: data.illicit_transactions, color: 'var(--signal-illicit)' },
    { label: 'Unknown', count: data.unknown_transactions, color: 'var(--signal-unknown)' },
  ];

  return <div className="workspace-page space-y-6">
    <PageHeader eyebrow="Bitcoin forensic workspace" title="Overview" subtitle="Your starting point for the network, the risk, and the evidence." actions={<>
      <button type="button" className="icon-button" onClick={() => setRevision((value) => value + 1)} disabled={loading} aria-label="Refresh overview" title="Refresh overview"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      <Link to="/investigations" className="btn-primary">Open investigations<ArrowUpRight size={16} /></Link>
    </>} />

    <section className="overview-hero panel-surface" aria-label="Transaction exploration">
      <div className="overview-hero-copy">
        <span className="badge-pill badge-accent"><span className="status-dot" />Elliptic / Bitcoin</span>
        <h2>Follow the money.<br /><span>Keep the context.</span></h2>
        <p>Move from a transaction to its connections, combine model signals with graph exposure, and build a defensible investigation.</p>
        <Link to="/graph" className="text-link">Explore the transaction graph<ArrowUpRight size={15} /></Link>
      </div>
      <div className="overview-hero-art"><NetworkMotif /><span className="motif-label"><Network size={12} />Two-hop neighborhood exploration</span></div>
    </section>

    <div className="flex items-center justify-between gap-3 text-[11px] text-ink-muted">
      <span className="inline-flex items-center gap-2"><Database size={13} />Dataset reference<span className="hidden sm:inline">/ 49 timesteps / 165 features</span></span>
      <Link to="/dataset" className="inline-flex items-center gap-1.5 hover:text-accent min-h-[44px]">View data source<ArrowUpRight size={12} /></Link>
    </div>
    <section className="metrics-grid" aria-label="Reference dataset and indexed coverage">
      <StatTile label="Reference transactions" value={data.total_transactions} caption={`${data.total_edges.toLocaleString()} directed relationships`} icon={Layers} />
      <StatTile label="Known illicit" value={data.illicit_transactions} caption="Ground-truth labels, not predictions" icon={ShieldAlert} tone="illicit" />
      <StatTile label="Unknown labels" value={data.unknown_transactions} caption="Excluded from supervised evaluation" icon={CircleHelp} tone="unknown" />
      <StatTile label="Indexed transactions" value={index ? index.database_ingestion.transactions_in_db : 'Unavailable'} caption={index ? 'Records available for investigation' : 'Index status could not be retrieved'} icon={Database} tone="accent" />
    </section>

    {index && index.database_ingestion.transactions_in_db === 0 && <div className="data-note"><Info size={15} /><p>The reference dataset and historical model evaluations are ready to explore. Your transaction index is empty, so individual investigations and scored alerts are not available yet. <Link to="/dataset" className="underline underline-offset-4 text-accent">Review dataset setup</Link>.</p></div>}

    <section className="overview-grid" aria-label="Dataset activity and label coverage">
      <div className="panel-surface min-w-0">
        <div className="section-bar flex-wrap">
          <div><h2 className="section-heading">Transaction activity</h2><p className="section-description">Dataset reference across 49 chronological snapshots</p></div>
          <div className="segmented-control" aria-label="Activity chart series"><button type="button" aria-pressed={!illicitOnly} onClick={() => setIllicitOnly(false)}>All activity</button><button type="button" aria-pressed={illicitOnly} onClick={() => setIllicitOnly(true)}>Illicit only</button></div>
        </div>
        <div className="chart-frame mx-4 sm:mx-5">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data.time_series} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
              <defs><linearGradient id="activity-total" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={.15} /><stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} /></linearGradient><linearGradient id="activity-illicit" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--signal-illicit)" stopOpacity={.13} /><stop offset="100%" stopColor="var(--signal-illicit)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 5" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="time_step" tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} tickLine={false} axisLine={false} tickFormatter={(value: number) => value >= 1000 ? `${value / 1000}k` : String(value)} />
              <Tooltip content={<CustomTooltip labelPrefix="Timestep " />} />
              {!illicitOnly && <Area type="monotone" dataKey="total_txs" name="All transactions" stroke="var(--accent-primary)" strokeWidth={2} fill="url(#activity-total)" isAnimationActive={motionEnabled} animationDuration={850} />}
              <Area type="monotone" dataKey="illicit_txs" name="Known illicit" stroke="var(--signal-illicit)" strokeWidth={1.7} fill="url(#activity-illicit)" isAnimationActive={motionEnabled} animationDuration={850} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="px-6 pb-5 pt-3 flex flex-wrap items-center justify-between gap-3"><div className="chart-legend">{!illicitOnly && <span><i style={{ background: 'var(--accent-primary)' }} />All transactions</span>}<span><i style={{ background: 'var(--signal-illicit)' }} />Known illicit</span></div><Link to="/analytics" className="text-link">View analytics<ArrowRight size={13} /></Link></div>
      </div>
      <div className="panel-surface flex flex-col min-w-0">
        <div className="section-bar"><div><h2 className="section-heading">Label coverage</h2><p className="section-description">The known and the still unknown</p></div><ScanLine size={17} className="text-ink-muted" /></div>
        <div className="label-distribution flex-1">
          <div className="label-ring"><svg viewBox="0 0 128 128" width="128" height="128" role="img" aria-label={`${coverage.toFixed(1)} percent of reference transactions are labeled`}>
            <circle cx="64" cy="64" r="50" fill="none" stroke="var(--graph-edge)" strokeWidth="10" opacity={.4} />
            <g transform="rotate(-90 64 64)"><circle cx="64" cy="64" r="50" fill="none" stroke="var(--signal-licit)" strokeWidth="10" strokeDasharray={`${licitShare * circumference} ${circumference}`} /><circle cx="64" cy="64" r="50" fill="none" stroke="var(--signal-illicit)" strokeWidth="10" strokeDasharray={`${illicitShare * circumference} ${circumference}`} strokeDashoffset={-licitShare * circumference} /></g>
          </svg><div><strong>{coverage.toFixed(1)}%</strong><small>Labeled</small></div></div>
          <div className="label-key">{labels.map((item) => <div className="label-key-row" key={item.label}><span><i style={{ background: item.color }} />{item.label}</span><strong className="font-medium tabular-nums">{item.count.toLocaleString()}</strong></div>)}</div>
        </div>
        <div className="mx-6 mb-6 pt-4 border-t border-line text-[11px] text-ink-muted leading-relaxed">An unknown label is not a licit label. Predictions remain investigative leads, not ground truth.</div>
      </div>
    </section>

    <section className="overview-grid" aria-label="Scored transactions and model evaluation">
      <div className="panel-surface overflow-hidden">
        <div className="section-bar border-b border-line"><div><h2 className="section-heading">Scored transactions</h2><p className="section-description">Highest stored risk scores in your index</p></div><Link to="/risk" className="text-link">View queue<ArrowRight size={13} /></Link></div>
        {queue === null ? <EmptyState tone="error" title="Queue unavailable" description="The risk service could not be reached. Refresh the overview to retry." /> : queue.transactions.length === 0 ? <EmptyState icon={ShieldCheck} title="No scored transactions yet" description="When indexed transactions have risk scores, your highest-priority records will appear here." actionLabel="Review dataset" onAction={() => { window.location.href = '/dataset'; }} /> : <div className="overflow-x-auto"><table className="tx-table"><thead><tr><th>Transaction</th><th>Ground truth</th><th>Risk</th><th>Inspect</th></tr></thead><tbody>{queue.transactions.map((tx) => <tr key={tx.transaction_id}><td className="font-mono text-xs">#{tx.transaction_id}</td><td><LabelBadge label={tx.known_label} /></td><td><RiskBadge level={tx.risk_level} score={tx.risk_score} /></td><td><Link to={`/transactions/${tx.transaction_id}`} className="text-link" aria-label={`Inspect transaction ${tx.transaction_id}`}><ArrowUpRight size={16} /></Link></td></tr>)}</tbody></table></div>}
      </div>
      <div className="panel-surface model-summary">
        <div className="flex items-center justify-between"><span className="badge-pill badge-unknown">Historical evaluation</span><Cpu size={19} className="text-accent" /></div>
        <div><p className="text-[11px] text-ink-muted mb-2">Configured model</p><h2 className="model-summary-title">{model?.model_name || data.active_model.replace(/_/g, ' ')}</h2></div>
        {model ? <div><div className="model-summary-stat"><strong>{(model.accuracy * 100).toFixed(2)}<span className="text-xl text-ink-muted">%</span></strong><span>Test accuracy</span></div><p className="text-[11px] text-ink-muted mt-1">{(model.f1 * 100).toFixed(1)}% macro F1 / chronological holdout</p></div> : <p className="text-xs text-ink-muted">Evaluation metrics could not be retrieved.</p>}
        <div className="border-t border-line pt-3"><Link to="/models" className="text-link">Compare model evaluations<ArrowUpRight size={15} /></Link><p className="text-[10px] text-ink-muted leading-relaxed">Cached evaluation does not establish live inference readiness.</p></div>
      </div>
    </section>
    <p className="workspace-disclaimer"><Info size={12} />TRACE-X supports investigation. Probabilistic model signals are not proof of illicit activity and require independent verification.</p>
  </div>;
}
