import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, ChevronLeft, ChevronRight, ArrowUpRight, X, SlidersHorizontal, Database, Network, Info } from 'lucide-react';
import { api } from '../services/api';
import type { PaginatedTransactionsResponse } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { TableRowsSkeleton } from '../components/common/LoadingSkeleton';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { EmptyState } from '../components/common/EmptyState';
import { NetworkMotif } from '../components/common/NetworkMotif';

const validLabels = ['ILLICIT', 'LICIT', 'UNKNOWN'];
const validRisk = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function Transactions() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const label = validLabels.includes(params.get('label') || '') ? params.get('label') || '' : '';
  const prediction = ['ILLICIT', 'LICIT'].includes(params.get('prediction') || '') ? params.get('prediction') || '' : '';
  const risk = validRisk.includes(params.get('risk_level') || '') ? params.get('risk_level') || '' : '';
  const rawStep = Number(params.get('time_step'));
  const step = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= 49 ? rawStep : undefined;
  const search = (params.get('search') || '').trim();
  const [searchDraft, setSearchDraft] = useState({ source: search, value: search });
  const searchInput = searchDraft.source === search ? searchDraft.value : search;
  const [filtersOpen, setFiltersOpen] = useState(!!(label || prediction || step));
  const [revision, setRevision] = useState(0);
  const requestKey = `${page}:${label}:${prediction}:${risk}:${step || ''}:${search}:${revision}`;
  const [result, setResult] = useState<{ key: string; data: PaginatedTransactionsResponse | null; error: string | null }>({ key: '', data: null, error: null });
  const loading = result.key !== requestKey;
  const data = loading ? null : result.data;
  const error = loading ? null : result.error;
  const limit = 25;
  const hasFilters = !!(label || prediction || risk || step || search);

  useEffect(() => {
    const controller = new AbortController();
    api.getTransactions({ page, limit, label: label || undefined, prediction: prediction || undefined, risk_level: risk || undefined, time_step: step, search: search || undefined }, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setResult({ key: requestKey, data: result, error: null });
      if (page > Math.max(1, result.total_pages)) setParams((current) => { const next = new URLSearchParams(current); next.set('page', '1'); return next; }, { replace: true });
    }).catch((reason: Error) => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: reason.message }); });
    return () => controller.abort();
  }, [page, label, prediction, risk, step, search, requestKey, setParams]);

  function update(key: string, value: string) {
    setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); return next; });
  }
  function clearFilters() { setSearchDraft({ source: '', value: '' }); setParams({}); }
  function submit(event: FormEvent) { event.preventDefault(); update('search', searchInput.trim()); }
  const rows = data?.transactions || [];
  const total = data?.total || 0;
  const pages = Math.max(1, data?.total_pages || 1);
  const filterChips = [{ key: 'search', label: `ID: ${search}`, value: search }, { key: 'label', label: `Ground truth: ${label.toLowerCase()}`, value: label }, { key: 'prediction', label: `Prediction: ${prediction.toLowerCase()}`, value: prediction }, { key: 'risk_level', label: `Risk: ${risk.toLowerCase()}`, value: risk }, { key: 'time_step', label: `Timestep: ${step}`, value: step }].filter((item) => item.value);

  return <div className="workspace-page space-y-6">
    <PageHeader eyebrow="Indexed Bitcoin records" title="Transactions" subtitle="Search the index. Separate ground truth from model predictions. Follow a transaction into its network." actions={<><Link to="/graph" className="btn-ghost"><Network size={15} />Graph explorer</Link><button type="button" onClick={() => setRevision((value) => value + 1)} className="btn-secondary" disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} />Refresh index</button></>} />

    <section className="panel-surface overflow-hidden" aria-label="Transaction index">
      <div className="section-bar border-b border-line"><div className="flex items-center gap-3"><Database size={18} className="text-accent" /><div><h2 className="section-heading">Transaction index</h2><p className="section-description">{loading ? 'Querying indexed records...' : error ? 'Index data unavailable' : `${total.toLocaleString()} ${hasFilters ? 'matching' : 'indexed'} records`}</p></div></div><span className="badge-pill badge-unknown hidden sm:inline-flex">Database records only</span></div>
      <div className="filter-bar">
        <form onSubmit={submit} className="flex flex-1 min-w-0 gap-2 basis-[340px]"><div className="filter-search"><Search size={15} /><label className="sr-only" htmlFor="transaction-search">Search transaction ID</label><input id="transaction-search" className="field-input font-mono text-xs" placeholder="Transaction ID" type="search" inputMode="numeric" value={searchInput} onChange={(event) => setSearchDraft({ source: search, value: event.target.value })} /></div><button type="submit" className="btn-secondary flex-shrink-0">Find</button></form>
        <label className="sr-only" htmlFor="transaction-risk">Risk level</label><select id="transaction-risk" className="field-input w-auto" value={risk} onChange={(event) => update('risk_level', event.target.value)}><option value="">All risk levels</option><option value="CRITICAL">Critical / 81-100</option><option value="HIGH">High / 61-80</option><option value="MEDIUM">Medium / 31-60</option><option value="LOW">Low / 0-30</option></select>
        <button type="button" className={`btn-secondary ${filtersOpen ? 'text-accent border-accent-border' : ''}`} onClick={() => setFiltersOpen((value) => !value)} aria-expanded={filtersOpen} aria-controls="transaction-advanced-filters"><SlidersHorizontal size={14} />Filters</button>
      </div>
      {filtersOpen && <div id="transaction-advanced-filters" className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 border-b border-line bg-inset">
        <div><label className="field-label" htmlFor="transaction-label">Ground-truth label</label><select id="transaction-label" value={label} onChange={(event) => update('label', event.target.value)} className="field-input"><option value="">All labels</option><option value="ILLICIT">Illicit</option><option value="LICIT">Licit</option><option value="UNKNOWN">Unknown</option></select></div>
        <div><label className="field-label" htmlFor="transaction-prediction">Model prediction</label><select id="transaction-prediction" value={prediction} onChange={(event) => update('prediction', event.target.value)} className="field-input"><option value="">All predictions</option><option value="ILLICIT">Predicted illicit</option><option value="LICIT">Predicted licit</option></select></div>
        <div><label className="field-label" htmlFor="transaction-timestep">Chronological timestep</label><select id="transaction-timestep" value={step || ''} onChange={(event) => update('time_step', event.target.value)} className="field-input"><option value="">All timesteps</option>{Array.from({ length: 49 }, (_, i) => <option key={i} value={i + 1}>Timestep {i + 1}</option>)}</select></div>
      </div>}
      {hasFilters && <div className="px-5 py-2 border-b border-line flex items-center gap-2 flex-wrap">{filterChips.map((item) => <button key={item.key} type="button" className="btn-ghost bg-inset min-h-[44px] text-[11px]" onClick={() => update(item.key, '')} aria-label={`Remove ${item.label} filter`}>{item.label}<X size={12} /></button>)}<button type="button" className="text-link ml-auto" onClick={clearFilters}>Clear all filters</button></div>}

      {error ? <EmptyState tone="error" title="The index could not be loaded" description={error} actionLabel="Retry query" onAction={() => setRevision((value) => value + 1)} /> : !loading && rows.length === 0 ? hasFilters ? <EmptyState icon={Search} title="No matching transactions" description="Try another ID, risk level, label, or timestep. The index only contains records that have been ingested." actionLabel="Clear filters" onAction={clearFilters} /> : <div className="queue-empty"><NetworkMotif /><div className="queue-empty-copy"><span className="badge-pill badge-unknown">No indexed records</span><h3 className="mt-4">The next lead starts with a transaction.</h3><p>The 203,769-transaction reference dataset is available in analytics. Populate the local index to search individual records and open their investigation views.</p><button type="button" className="btn-primary" onClick={() => navigate('/dataset')}>Review dataset setup<ArrowUpRight size={15} /></button></div></div> : <div className="overflow-x-auto"><table className="tx-table"><thead><tr><th>Transaction</th><th>Step</th><th>Ground truth</th><th>Model prediction</th><th>Illicit probability</th><th>Stored risk</th><th>Connections</th><th>Open</th></tr></thead><tbody>{loading ? <TableRowsSkeleton rows={7} cols={8} /> : rows.map((tx) => { const probability = tx.prediction_probability ?? tx.probability; return <tr key={tx.transaction_id}><td><Link to={`/transactions/${tx.transaction_id}`} className="text-link font-mono text-xs">#{tx.transaction_id}</Link></td><td className="text-ink-muted tabular-nums">{tx.time_step}</td><td><LabelBadge label={tx.known_label} /></td><td>{tx.prediction ? <LabelBadge label={tx.prediction} isPrediction /> : <span className="text-xs text-ink-muted">Not evaluated</span>}</td><td className="text-xs tabular-nums text-ink-secondary">{probability == null ? 'Unavailable' : `${(probability * 100).toFixed(1)}%`}</td><td><RiskBadge level={tx.risk_level} score={tx.risk_score} /></td><td className="text-xs tabular-nums text-ink-secondary">{tx.total_degree} <span className="text-ink-muted">({tx.in_degree} in / {tx.out_degree} out)</span></td><td><Link to={`/transactions/${tx.transaction_id}`} className="icon-button" aria-label={`Inspect transaction ${tx.transaction_id}`}><ArrowUpRight size={16} /></Link></td></tr>; })}</tbody></table></div>}
      <div className="table-pagination"><span>{loading ? 'Loading records...' : error ? 'Records unavailable' : `${rows.length ? (page - 1) * limit + 1 : 0}-${rows.length ? (page - 1) * limit + rows.length : 0} of ${total.toLocaleString()} records`}</span><div className="flex items-center gap-2"><button type="button" className="icon-button border border-line" disabled={page <= 1 || loading || !!error} onClick={() => update('page', String(page - 1))} aria-label="Previous transaction page"><ChevronLeft size={15} /></button><span className="tabular-nums px-2">{page} / {pages}</span><button type="button" className="icon-button border border-line" disabled={page >= pages || loading || !!error} onClick={() => update('page', String(page + 1))} aria-label="Next transaction page"><ChevronRight size={15} /></button></div></div>
    </section>
    <p className="workspace-disclaimer"><Info size={12} />Ground-truth labels and model predictions are different sources of evidence. Unknown is not licit; an unavailable prediction is not a low-risk finding.</p>
  </div>;
}
