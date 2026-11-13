import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldAlert, AlertTriangle, ArrowUpRight, CheckCircle2, RefreshCw, ChevronLeft, ChevronRight, Flame, Eye, Info, Network, Cpu, GitBranch, Fingerprint, X } from 'lucide-react';
import { api } from '../services/api';
import type { HighRiskQueueResponse, TransactionSummary, DatasetStatus } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatTile, type StatTone } from '../components/common/StatTile';
import { TableRowsSkeleton } from '../components/common/LoadingSkeleton';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { RiskGauge } from '../components/common/RiskGauge';
import { EmptyState } from '../components/common/EmptyState';
import { NetworkMotif } from '../components/common/NetworkMotif';
import { Modal } from '../components/common/Modal';

const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const weights = [
  { label: 'Model probability', weight: 55, icon: Cpu, color: 'var(--accent-primary)' },
  { label: 'Graph exposure', weight: 25, icon: Network, color: 'var(--signal-info)' },
  { label: 'Degree topology', weight: 10, icon: GitBranch, color: 'var(--signal-high)' },
  { label: 'Feature anomalies', weight: 10, icon: Fingerprint, color: 'var(--signal-unknown)' },
];

export function RiskAlerts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const level = levels.includes((params.get('level') || '').toUpperCase()) ? params.get('level')!.toUpperCase() : '';
  const rawPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawStep = Number(params.get('time_step'));
  const step = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= 49 ? rawStep : undefined;
  const [index, setIndex] = useState<DatasetStatus | null>(null);
  const [revision, setRevision] = useState(0);
  const requestKey = `${level}:${step || ''}:${page}:${revision}`;
  const [result, setResult] = useState<{ key: string; data: HighRiskQueueResponse | null; error: string | null }>({ key: '', data: null, error: null });
  const loading = result.key !== requestKey;
  const data = loading ? null : result.data;
  const error = loading ? null : result.error;
  const [preview, setPreview] = useState<TransactionSummary | null>(null);
  const limit = 25;

  useEffect(() => {
    let active = true;
    api.getDatasetStatus().then((result) => { if (active) setIndex(result); }).catch(() => { if (active) setIndex(null); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    const controller = new AbortController();
    api.getHighRiskQueue({ level: level || undefined, time_step: step, page, limit }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setResult({ key: requestKey, data: result, error: null });
      if (page > Math.max(1, Math.ceil(result.total / limit))) {
        setParams((current) => { const next = new URLSearchParams(current); next.set('page', '1'); return next; }, { replace: true });
      }
    }).catch((reason: Error) => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: reason.message }); });
    return () => controller.abort();
  }, [level, step, page, requestKey, setParams]);

  function update(key: string, value: string) {
    setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); return next; });
  }
  const tiers = [
    { key: 'CRITICAL', label: 'Critical', count: data?.critical_count, caption: '81-100 / Immediate review', tone: 'illicit' as StatTone, icon: Flame },
    { key: 'HIGH', label: 'High', count: data?.high_count, caption: '61-80 / Elevated exposure', tone: 'high' as StatTone, icon: ShieldAlert },
    { key: 'MEDIUM', label: 'Medium', count: data?.medium_count, caption: '31-60 / Secondary triage', tone: 'unknown' as StatTone, icon: AlertTriangle },
    { key: 'LOW', label: 'Low', count: data?.low_count, caption: '0-30 / Lower scored risk', tone: 'licit' as StatTone, icon: CheckCircle2 },
  ];
  const emptyIndex = index?.database_ingestion.transactions_in_db === 0;
  const matches = data?.transactions || [];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / limit));
  const previewProbability = preview?.prediction_probability ?? preview?.probability;

  return <div className="workspace-page space-y-6">
    <PageHeader eyebrow="Indexed transaction scores" title="Risk & alerts" subtitle="Triage the signals that deserve a closer look. Highest composite scores come first." actions={<>
      <Link to="/methodology" className="btn-ghost">Scoring methodology<ArrowUpRight size={14} /></Link>
      <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="btn-secondary"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh queue</button>
    </>} />

    <div className="flex items-center justify-between text-[11px] text-ink-muted"><span>Global indexed severity counts</span><button type="button" className="text-link" onClick={() => setParams({})}>Show all levels<ArrowUpRight size={12} /></button></div>
    <section className="metrics-grid" aria-label="Filter by risk severity">{tiers.map((tier) => <StatTile key={tier.key} label={tier.label} value={error ? 'Unavailable' : tier.count ?? 'Loading...'} caption={tier.caption} tone={tier.tone} icon={tier.icon} active={level === tier.key} onClick={() => update('level', level === tier.key ? '' : tier.key)} />)}</section>

    <section className="panel-surface overflow-hidden" aria-label="Triage queue">
      <div className="section-bar border-b border-line flex-wrap"><div><h2 className="section-heading">Triage queue</h2><p className="section-description">{loading ? 'Refreshing indexed scores...' : error ? 'Queue data unavailable' : `${(data?.total || 0).toLocaleString()} scored records in this view`}</p></div><div className="flex items-center gap-3 flex-wrap">
        <label className="sr-only" htmlFor="risk-timestep">Filter by timestep</label><select id="risk-timestep" value={step || ''} onChange={(event) => update('time_step', event.target.value)} className="field-input w-auto"><option value="">All timesteps</option>{Array.from({ length: 49 }, (_, i) => <option key={i} value={i + 1}>Timestep {i + 1}</option>)}</select>
        {(level || step) && <button type="button" className="btn-ghost" onClick={() => setParams({})}><X size={13} />Clear filters</button>}
      </div></div>
      {error ? <EmptyState tone="error" title="The queue could not be loaded" description={error} actionLabel="Retry queue" onAction={() => setRevision((value) => value + 1)} /> : !loading && matches.length === 0 ? <div className="queue-empty"><NetworkMotif /><div className="queue-empty-copy"><span className="badge-pill badge-unknown">{emptyIndex ? 'Index not populated' : 'No matching scores'}</span><h3 className="mt-4">{emptyIndex ? 'A clear queue starts with a connected index.' : level || step ? 'No scores match this view.' : 'Nothing to triage yet.'}</h3><p>{emptyIndex ? 'The overview shows the reference Bitcoin dataset. This queue only shows transactions that have actually been indexed and scored.' : level || step ? 'Try a different severity or timestep. A filtered empty queue does not mean the rest of the index is clear.' : 'Indexed transactions need stored risk scores before they can appear in the triage queue.'}</p><button type="button" className="btn-primary" onClick={() => emptyIndex || (!level && !step) ? navigate('/dataset') : setParams({})}>{emptyIndex || (!level && !step) ? 'Review dataset setup' : 'Show all scores'}<ArrowUpRight size={15} /></button></div></div> : <div className="overflow-x-auto"><table className="tx-table"><thead><tr><th>Transaction</th><th>Step</th><th>Ground truth</th><th>Model prediction</th><th>Illicit probability</th><th>Stored risk</th><th>Connections</th><th>Actions</th></tr></thead><tbody>
        {loading ? <TableRowsSkeleton rows={6} cols={8} /> : matches.map((tx) => { const probability = tx.prediction_probability ?? tx.probability; return <tr key={tx.transaction_id}><td><Link to={`/transactions/${tx.transaction_id}`} className="text-link font-mono">#{tx.transaction_id}</Link></td><td className="tabular-nums text-ink-muted">{tx.time_step}</td><td><LabelBadge label={tx.known_label} /></td><td>{tx.prediction ? <LabelBadge label={tx.prediction} isPrediction /> : <span className="text-ink-muted text-xs">Not evaluated</span>}</td><td className="tabular-nums">{probability == null ? <span className="text-ink-muted">Unavailable</span> : `${(probability * 100).toFixed(1)}%`}</td><td><RiskBadge score={tx.risk_score} level={tx.risk_level} /></td><td className="text-xs tabular-nums text-ink-muted">{tx.total_degree ?? tx.in_degree + tx.out_degree}</td><td><div className="flex items-center gap-1.5"><button type="button" className="icon-button" onClick={() => setPreview(tx)} aria-label={`Review signals for transaction ${tx.transaction_id}`} title="Review signals"><Eye size={16} /></button><Link to={`/graph?tx=${tx.transaction_id}&depth=1`} className="icon-button text-accent" aria-label={`Investigate graph flow for #${tx.transaction_id}`} title="Investigate in Graph Explorer"><Network size={16} /></Link></div></td></tr>; })}
      </tbody></table></div>}
      <div className="table-pagination"><span>{loading ? 'Loading records...' : error ? 'Records unavailable' : `${matches.length ? (page - 1) * limit + 1 : 0}-${matches.length ? (page - 1) * limit + matches.length : 0} of ${(data?.total || 0).toLocaleString()} scored records`}</span><div className="flex items-center gap-2"><button type="button" className="icon-button border border-line" onClick={() => update('page', String(page - 1))} disabled={page <= 1 || loading || !!error} aria-label="Previous queue page"><ChevronLeft size={15} /></button><span className="tabular-nums px-2">{page} / {totalPages}</span><button type="button" className="icon-button border border-line" onClick={() => update('page', String(page + 1))} disabled={page >= totalPages || loading || !!error} aria-label="Next queue page"><ChevronRight size={15} /></button></div></div>
    </section>

    <section className="panel-surface p-6" aria-label="Composite risk scoring components"><div className="flex flex-wrap justify-between items-start gap-4 mb-5"><div><h2 className="section-heading">Four signals. One review priority.</h2><p className="section-description">The canonical risk engine combines these weights, with ground-truth overrides.</p></div><span className="badge-pill badge-unknown">Score 0-100</span></div><div className="risk-weights mb-5">{weights.map((item) => <span key={item.label} style={{ flex: item.weight, background: item.color }} />)}</div><div className="grid grid-cols-2 lg:grid-cols-4 gap-5">{weights.map((item) => <div key={item.label} className="flex gap-3 items-start"><item.icon size={17} style={{ color: item.color }} className="mt-0.5 flex-shrink-0" /><div><p className="text-[12px] text-ink-secondary">{item.label}</p><p className="text-xl font-medium tracking-tight mt-1 tabular-nums">{item.weight}<span className="text-xs text-ink-muted">%</span></p></div></div>)}</div></section>
    <p className="workspace-disclaimer"><Info size={12} />Risk scores are probabilistic investigative leads, not a legal determination. Verify the underlying evidence before taking action.</p>

    <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `Transaction #${preview.transaction_id}` : 'Transaction signals'} description="Stored score and model signals from the indexed record.">
      {preview && <div className="space-y-5"><div className="flex items-center gap-6"><RiskGauge score={preview.risk_score} level={preview.risk_level} /><div className="space-y-3"><RiskBadge score={preview.risk_score} level={preview.risk_level} /><p className="text-xs text-ink-muted">Timestep {preview.time_step}</p><LabelBadge label={preview.known_label} /></div></div><div className="grid grid-cols-2 gap-4 border-y border-line py-4"><div><p className="field-label">Model prediction</p>{preview.prediction ? <LabelBadge label={preview.prediction} isPrediction /> : <p className="text-xs text-ink-muted">Not evaluated</p>}</div><div><p className="field-label">Illicit probability</p><p className="text-lg tabular-nums">{previewProbability == null ? 'Unavailable' : `${(previewProbability * 100).toFixed(1)}%`}</p></div></div><div><h3 className="text-sm font-medium mb-3">Recorded triggers</h3>{preview.trigger_reasons?.length ? <ul className="space-y-2 text-xs text-ink-secondary leading-relaxed">{preview.trigger_reasons.map((reason, i) => <li key={i} className="flex gap-2"><span className="status-dot text-signal-high mt-1.5" />{reason}</li>)}</ul> : <p className="text-xs text-ink-muted">No trigger details were returned for this record.</p>}</div>        <div className="grid grid-cols-2 gap-2">
          <Link to={`/graph?tx=${preview.transaction_id}&depth=1`} onClick={() => setPreview(null)} className="btn-secondary text-xs py-2 inline-flex items-center justify-center gap-1.5">
            <Network size={14} /> Investigate (1 Hop)
          </Link>
          <Link to={`/graph?tx=${preview.transaction_id}&depth=2`} onClick={() => setPreview(null)} className="btn-secondary text-xs py-2 inline-flex items-center justify-center gap-1.5">
            <Network size={14} /> Investigate (2 Hops)
          </Link>
        </div>
        <Link to={`/transactions/${preview.transaction_id}`} onClick={() => setPreview(null)} className="btn-primary w-full">Open investigation view<ArrowUpRight size={15} /></Link></div>}
    </Modal>
  </div>;
}
