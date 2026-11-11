import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  Info,
  Layers,
  Network,
  Search,
  Shield,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  CategorizedFeaturesResponse,
  DatasetStatus,
  GraphResponse,
  KnownLabel,
  RiskBreakdownResponse,
  TransactionEvidenceResponse,
  TransactionIntelligenceResponse,
  TransactionSummary,
} from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatTile } from '../components/common/StatTile';
import { EmptyState } from '../components/common/EmptyState';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { CytoscapeCanvas } from '../components/graph/CytoscapeCanvas';
import { AddToCaseModal } from '../components/investigations/AddToCaseModal';
import { useMotion } from '../context/MotionContext';

const tabs = [
  { id: 'overview', label: 'Overview', icon: Shield },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'intelligence', label: 'Signals', icon: Cpu },
  { id: 'features', label: 'Features', icon: Layers },
  { id: 'evidence', label: 'Evidence', icon: FileText },
] as const;
type Tab = typeof tabs[number]['id'];
type Resource<T> = { key: string; data: T | null; loading: boolean; error: 'missing' | 'unavailable' | null };

function useInvestigationResource<T>(key: string, enabled: boolean, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Resource<T>>({ key, data: null, loading: false, error: null });
  const [attempt, setAttempt] = useState(0);
  const cache = useRef<{ key: string; data: T } | null>(null);
  const request = useEffectEvent(load);

  useEffect(() => {
    if (!enabled) return;
    if (cache.current?.key === key) {
      setState({ key, data: cache.current.data, loading: false, error: null });
      return;
    }
    let stale = false;
    const controller = new AbortController();
    setState({ key, data: null, loading: true, error: null });
    request(controller.signal)
      .then((data) => {
        if (stale) return;
        cache.current = { key, data };
        setState({ key, data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (stale) return;
        const missing = error instanceof Error && /not found/i.test(error.message);
        setState({ key, data: null, loading: false, error: missing ? 'missing' : 'unavailable' });
      });
    // Abort supported requests; logical cancellation also protects methods without a signal.
    return () => { stale = true; controller.abort(); };
  }, [key, enabled, attempt]);

  const current = state.key === key ? state : { key, data: null, loading: enabled, error: null };
  return {
    ...current,
    loading: enabled && (current.loading || (!current.data && !current.error)),
    retry: () => {
      cache.current = null;
      setState({ key, data: null, loading: enabled, error: null });
      setAttempt((value) => value + 1);
    },
  };
}

function probability(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function percent(value: number | null): string {
  return value === null ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
}

function count(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString() : 'Unavailable';
}

function PanelLoading({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-4 py-3" aria-label={`Loading ${label}`}>
      <p className="text-sm text-ink-muted">Loading {label}...</p>
      {[0, 1, 2].map((row) => <div key={row} className="skeleton h-12 w-full bg-elevated" aria-hidden="true" />)}
    </div>
  );
}

export const TransactionInvestigation: React.FC = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const id = transactionId && /^\d+$/.test(transactionId) ? Number(transactionId) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) {
    return (
      <div className="workspace-page space-y-6">
        <PageHeader title="Transaction investigation" subtitle="Open an indexed transaction using its numeric ID." backLabel="Transaction ledger" onBack={() => navigate('/transactions')} />
        <section className="panel-surface">
          <h2 className="sr-only">Transaction ID validation</h2>
          <EmptyState icon={AlertTriangle} tone="error" title="Invalid transaction ID" description="Transaction IDs must be positive whole numbers within the browser's safe integer range. No transaction request was sent." actionLabel="View transaction ledger" onAction={() => navigate('/transactions')} />
        </section>
      </div>
    );
  }
  return <InvestigationWorkspace key={id} transactionId={id} />;
};

function InvestigationWorkspace({ transactionId }: { transactionId: number }) {
  const navigate = useNavigate();
  const { motionEnabled } = useMotion();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [graphDepth, setGraphDepth] = useState<1 | 2>(1);
  const [selectedTransactionId, setSelectedTransactionId] = useState<number | null>(null);
  const [featureCategory, setFeatureCategory] = useState<'all' | 'local' | 'aggregate'>('all');
  const [featureSearch, setFeatureSearch] = useState('');
  const [onlyDeviations, setOnlyDeviations] = useState(false);
  const [featurePage, setFeaturePage] = useState(1);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const detail = useInvestigationResource<TransactionSummary>(`detail:${transactionId}`, true, async () => {
    const record = await api.getTransaction(transactionId);
    if (record.transaction_id !== transactionId) throw new Error('Unexpected transaction response');
    return record;
  });
  const tx = detail.data;
  const intelligence = useInvestigationResource<TransactionIntelligenceResponse>(`intelligence:${transactionId}`, !!tx, async () => {
    const response = await api.getTransactionIntelligence(transactionId);
    if (response.transaction_id !== transactionId) throw new Error('Unexpected intelligence response');
    return response;
  });
  const risk = useInvestigationResource<RiskBreakdownResponse>(`risk:${transactionId}`, !!tx, async () => {
    const response = await api.getRiskBreakdown(transactionId);
    if (response.transaction_id !== transactionId) throw new Error('Unexpected risk response');
    return response;
  });
  const features = useInvestigationResource<CategorizedFeaturesResponse>(`features:${transactionId}`, !!tx && activeTab === 'features', async () => {
    const response = await api.getTransactionFeatures(transactionId);
    if (response.transaction_id !== transactionId) throw new Error('Unexpected feature response');
    return response;
  });
  const evidence = useInvestigationResource<TransactionEvidenceResponse>(`evidence:${transactionId}`, !!tx && activeTab === 'evidence', async () => {
    const response = await api.getTransactionEvidence(transactionId);
    if (response.transaction_id !== transactionId) throw new Error('Unexpected evidence response');
    return response;
  });
  const graph = useInvestigationResource<GraphResponse>(`graph:${transactionId}:${graphDepth}`, !!tx && activeTab === 'network', async (signal) => {
    const response = await api.getTransactionGraph(transactionId, graphDepth, signal);
    if (response.metadata.center_transaction_id !== transactionId || response.metadata.depth !== graphDepth) throw new Error('Unexpected graph response');
    return response;
  });
  const dataset = useInvestigationResource<DatasetStatus>(`index:${transactionId}`, detail.error === 'missing', () => api.getDatasetStatus());

  const storedProbability = probability(tx?.prediction_probability ?? tx?.probability);
  const storedPrediction: KnownLabel | null = tx?.prediction === 'ILLICIT' || tx?.prediction === 'LICIT' ? tx.prediction : null;
  const assignedProbability = storedProbability === null || !storedPrediction ? null : storedPrediction === 'ILLICIT' ? storedProbability : 1 - storedProbability;
  const gnn = intelligence.data?.gnn_prediction;
  const gnnMode = typeof gnn?.metadata?.mode === 'string' ? gnn.metadata.mode : '';
  const gnnProbability = probability(gnn?.illicit_probability);
  const gnnAvailable = !!gnn && (gnn.prediction === 'ILLICIT' || gnn.prediction === 'LICIT') && gnnProbability !== null && !/(unavailable|insufficient)/i.test(gnnMode);
  const gnnContext = gnnMode === 'graph_subgraph_2hop' ? 'Bounded two-hop inference' : gnnMode === 'isolated_node_self_loop' ? 'Isolated self-loop inference' : 'Returned graph-model inference';
  const neighborhood = intelligence.data?.risk_summary;
  const selectedNode = graph.data?.nodes.find((node) => node.transaction_id === selectedTransactionId)
    ?? graph.data?.nodes.find((node) => node.transaction_id === transactionId)
    ?? null;
  const graphNeighbors = graph.data?.nodes.filter((node) => node.transaction_id !== transactionId) ?? [];
  const allFeatures = features.data ? [...features.data.local_features, ...features.data.aggregate_features] : [];
  const featureQuery = featureSearch.trim().toLowerCase();
  const displayedFeatures = (featureCategory === 'local' ? features.data?.local_features ?? [] : featureCategory === 'aggregate' ? features.data?.aggregate_features ?? [] : allFeatures)
    .filter((feature) => {
      if (onlyDeviations && (!Number.isFinite(feature.value) || Math.abs(feature.value) <= 3)) return false;
      if (!featureQuery) return true;
      if (/^\d+$/.test(featureQuery)) return feature.index - 1 === Number(featureQuery);
      return `${feature.name} ${feature.category}`.toLowerCase().includes(featureQuery);
    });
  const featuresPerPage = 15;
  const totalFeaturePages = Math.max(1, Math.ceil(displayedFeatures.length / featuresPerPage));
  const currentFeaturePage = Math.min(featurePage, totalFeaturePages);
  const paginatedFeatures = displayedFeatures.slice((currentFeaturePage - 1) * featuresPerPage, currentFeaturePage * featuresPerPage);
  const breakdown = risk.data?.breakdown;
  const storedRisk = typeof tx?.risk_score === 'number' && Number.isFinite(tx.risk_score) ? tx.risk_score : null;
  const riskParts = breakdown ? [
    { label: 'Model signal', value: breakdown.ml_points, color: 'var(--accent-primary)' },
    { label: 'Graph exposure', value: breakdown.graph_points, color: 'var(--signal-illicit)' },
    { label: 'Network topology', value: breakdown.topology_points, color: 'var(--signal-info)' },
    { label: 'Feature deviations', value: breakdown.feature_points, color: 'var(--signal-high)' },
  ] : [];

  return (
    <div className="workspace-page space-y-6">
      <PageHeader
        backLabel="Transaction ledger"
        onBack={() => navigate('/transactions')}
        eyebrow="Transaction investigation"
        title={`Transaction #${transactionId}`}
        subtitle="Review the stored prediction, graph connections, and source evidence."
        badges={tx ? [{ label: `Step ${tx.time_step} / 49`, tone: 'unknown' }, { label: 'Indexed record', tone: 'accent' }] : []}
        actions={tx ? <>
          <Link to={`/graph?tx=${transactionId}&depth=${graphDepth}`} className="btn-secondary"><Network size={16} aria-hidden="true" />Open graph</Link>
          <button type="button" onClick={() => setIsCaseModalOpen(true)} className="btn-primary"><Briefcase size={16} aria-hidden="true" />Add to a case</button>
        </> : undefined}
      />

      {detail.loading ? (
        <div role="status" aria-label="Loading indexed transaction" className="space-y-6">
          <span className="sr-only">Loading indexed transaction</span>
          <div className="metrics-grid">{[0, 1, 2, 3].map((tile) => <div key={tile} className="panel-surface skeleton h-36" aria-hidden="true" />)}</div>
          <div className="panel-surface skeleton h-80" aria-hidden="true" />
        </div>
      ) : !tx ? (
        <section className="panel-surface p-4 sm:p-6">
          <h2 className="sr-only">Transaction lookup</h2>
          <EmptyState
            icon={detail.error === 'missing' ? Database : AlertTriangle}
            tone={detail.error === 'missing' ? 'neutral' : 'error'}
            title={detail.error === 'missing' ? 'Transaction not indexed' : 'Transaction could not be loaded'}
            description={detail.error === 'missing'
              ? `Transaction #${transactionId} is not in the indexed store. A dataset reference or precomputed benchmark can contain an ID without a matching transaction record.`
              : 'The indexed store could not return this transaction. No substitute record or model prediction has been displayed.'}
            actionLabel="Retry transaction lookup"
            onAction={detail.retry}
          />
          {detail.error === 'missing' && (
            <div className="data-note">
              <Info size={16} aria-hidden="true" />
              <div>
                <p>{dataset.data
                  ? `${count(dataset.data.database_ingestion.transactions_in_db)} transaction records and ${count(dataset.data.database_ingestion.edges_in_db)} edge references are currently indexed.`
                  : dataset.loading ? 'Checking the dataset index...' : 'Dataset index status is unavailable.'}</p>
                <p>CSV features and cached model metrics do not confirm that a transaction is indexed.</p>
                <Link to="/dataset" className="text-link">View dataset status<ArrowUpRight size={15} aria-hidden="true" /></Link>
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="metrics-grid" aria-label="Transaction signal summary">
            <StatTile
              label="Stored risk"
              value={storedRisk === null ? 'Unavailable' : `${storedRisk} / 100`}
              caption={storedRisk === null ? 'No usable score returned' : `${tx.risk_level.charAt(0)}${tx.risk_level.slice(1).toLowerCase()} tier, as stored`}
              icon={Shield}
              tone="accent"
            />
            <StatTile
              label="Stored illicit probability"
              value={percent(storedProbability)}
              caption="Source model not provided"
              icon={Cpu}
              tone={storedPrediction === 'ILLICIT' ? 'illicit' : 'neutral'}
            />
            <StatTile
              label="GraphSAGE illicit probability"
              value={intelligence.loading ? 'Loading' : percent(gnnAvailable ? gnnProbability : null)}
              caption={intelligence.loading ? 'Checking optional inference' : gnnAvailable ? gnnContext : 'No usable inference returned'}
              icon={Network}
              tone="info"
            />
            <StatTile
              label="Direct illicit exposure"
              value={intelligence.loading ? 'Loading' : count(neighborhood?.known_illicit_neighbors)}
              caption={intelligence.loading ? 'Reading direct edge references' : neighborhood ? `Dataset-labeled, of ${count(neighborhood.total_neighbors)} connected references` : 'Neighborhood analysis unavailable'}
              icon={ArrowDownLeft}
              tone="illicit"
            />
          </section>

          <div className="segmented-control flex w-full" role="tablist" aria-label="Transaction analysis sections">
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  id={`transaction-${transactionId}-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`transaction-${transactionId}-panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => {
                    if (tab.id === 'network' && activeTab !== 'network') setSelectedTransactionId(null);
                    setActiveTab(tab.id);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap"
                  style={{ minHeight: 44 }}
                  onKeyDown={(event) => {
                    let next = index;
                    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
                    else if (event.key === 'Home') next = 0;
                    else if (event.key === 'End') next = tabs.length - 1;
                    else return;
                    event.preventDefault();
                    if (tabs[next].id === 'network') setSelectedTransactionId(null);
                    setActiveTab(tabs[next].id);
                    tabRefs.current[next]?.focus();
                  }}
                ><Icon size={16} aria-hidden="true" />{tab.label}</button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`transaction-${transactionId}-panel-${activeTab}`}
            aria-labelledby={`transaction-${transactionId}-tab-${activeTab}`}
            tabIndex={0}
            className="min-w-0 space-y-6 rounded-xl"
          >
            {activeTab === 'overview' && (
              <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="panel-surface min-w-0 p-5 sm:p-6">
                  <h2 className="section-heading">Transaction record</h2>
                  <p className="section-description">Dataset annotation and stored prediction are separate signals.</p>
                  <dl className="mt-5 divide-y divide-line text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="text-ink-muted">Transaction ID</dt><dd className="font-mono tabular-nums">#{tx.transaction_id}</dd></div>
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="text-ink-muted">Temporal snapshot</dt><dd className="font-mono tabular-nums">{tx.time_step} / 49</dd></div>
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="text-ink-muted">Dataset label</dt><dd><LabelBadge label={tx.known_label} /></dd></div>
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="text-ink-muted">Stored model classification</dt><dd>{storedPrediction ? <LabelBadge label={storedPrediction} isPrediction /> : <span className="text-ink-muted">Unavailable</span>}</dd></div>
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="text-ink-muted">Illicit probability</dt><dd className="font-mono tabular-nums">{percent(storedProbability)}</dd></div>
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="text-ink-muted">Assigned-class probability</dt><dd className="font-mono tabular-nums">{percent(assignedProbability)}</dd></div>
                  </dl>
                  <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-5">
                    {[
                      { label: 'Incoming', value: tx.in_degree, icon: ArrowDownLeft },
                      { label: 'Outgoing', value: tx.out_degree, icon: ArrowUpRight },
                      { label: 'Total degree', value: tx.total_degree, icon: Network },
                    ].map((item) => <div key={item.label} className="min-w-0"><item.icon size={16} className="mb-2 text-ink-muted" aria-hidden="true" /><p className="font-mono text-xl tabular-nums">{count(item.value)}</p><p className="mt-1 text-xs text-ink-muted">{item.label}</p></div>)}
                  </div>
                  <div className="data-note mt-5"><Info size={16} aria-hidden="true" /><p>{tx.known_label === 'UNKNOWN' ? 'Unknown means the dataset has no known class for this transaction. It is not a licit label.' : 'Dataset labels are historical research annotations, not a legal determination.'} Stored model identity and inference time are not provided.</p></div>
                </section>

                <section className="panel-surface min-w-0 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="section-heading">Risk contribution</h2><p className="section-description">Canonical components returned by the risk engine.</p></div>
                    {breakdown && <RiskBadge score={breakdown.final_score} level={breakdown.risk_level} />}
                  </div>
                  {risk.loading ? <PanelLoading label="risk breakdown" /> : !breakdown ? (
                    <EmptyState icon={Shield} title="Breakdown unavailable" description="The stored record remains visible, but its canonical risk components could not be loaded." actionLabel="Retry risk breakdown" onAction={risk.retry} />
                  ) : (
                    <>
                      <div className="mt-6 space-y-5">
                        {riskParts.map((part) => {
                          const finite = typeof part.value === 'number' && Number.isFinite(part.value);
                          return (
                            <div key={part.label} className="space-y-2">
                              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span className="text-ink-secondary">{part.label}{part.label === 'Model signal' && storedProbability === null && <span className="ml-2 text-xs text-ink-muted">input unavailable</span>}</span><span className="font-mono tabular-nums">{finite ? `${part.value.toFixed(1)} points` : 'Unavailable'}</span></div>
                              <div className="progress-track" role={finite ? 'meter' : undefined} aria-label={finite ? `${part.label} contribution on the 100-point risk scale` : undefined} aria-valuemin={finite ? 0 : undefined} aria-valuemax={finite ? 100 : undefined} aria-valuenow={finite ? Math.max(0, Math.min(100, part.value)) : undefined} aria-valuetext={finite ? `${part.value.toFixed(1)} risk points` : undefined}>
                                <div style={{ width: `${finite ? Math.max(0, Math.min(100, part.value)) : 0}%`, backgroundColor: part.color, transition: motionEnabled ? undefined : 'none' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-5 text-xs leading-relaxed text-ink-muted">Raw parts share a 100-point scale. The final score includes server-side label overrides and rounding, so it may differ from their sum.</p>
                      {storedProbability === null && <p className="mt-3 text-xs leading-relaxed text-ink-muted">Missing stored probabilities may be scored as zero by the server. A missing input is not a model prediction.</p>}
                      {storedRisk !== null && storedRisk !== breakdown.final_score && <div className="data-note mt-4"><Info size={16} aria-hidden="true" /><p>The stored risk is <span className="font-mono">{storedRisk}</span>; the current canonical calculation returns <span className="font-mono">{breakdown.final_score}</span>. Neither value has been recalculated in this browser.</p></div>}
                      <div className="mt-5 border-t border-line pt-5">
                        <h3 className="text-sm font-medium text-ink">Engine observations</h3>
                        {breakdown.trigger_reasons.length ? <ul className="mt-3 space-y-3 text-sm leading-relaxed text-ink-secondary">{breakdown.trigger_reasons.map((reason, index) => <li key={`${reason}-${index}`} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />{reason}</li>)}</ul> : <p className="mt-3 text-sm text-ink-muted">No trigger reasons were returned. This does not establish a clean transaction.</p>}
                        <p className="mt-4 text-xs text-ink-muted">{breakdown.scoring_standard}</p>
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'network' && (
              <section className="panel-surface min-w-0 p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><h2 className="section-heading">Transaction neighborhood</h2><p className="section-description">Select a node to inspect its returned metadata. Arrows preserve recorded flow direction.</p></div>
                  <div className="segmented-control" role="group" aria-label="Neighborhood depth">
                    {([1, 2] as const).map((depth) => <button key={depth} type="button" aria-pressed={graphDepth === depth} style={{ minHeight: 44 }} onClick={() => { setGraphDepth(depth); setSelectedTransactionId(null); }}>{depth === 1 ? '1 hop' : '2 hops'}</button>)}
                  </div>
                </div>
                {graph.loading ? <PanelLoading label={`${graphDepth}-hop graph`} /> : !graph.data ? (
                  <EmptyState icon={Network} title="Network unavailable" description="This bounded neighborhood could not be loaded. The transaction record and other analysis sections remain available." actionLabel="Retry network" onAction={graph.retry} />
                ) : (
                  <>
                    <div className="my-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-ink-muted">
                      <span><span className="font-mono text-ink">{count(graph.data.nodes.length)}</span> returned nodes</span>
                      <span><span className="font-mono text-ink">{count(graph.data.edges.length)}</span> edge references</span>
                      <span>Neighbor labels: <span className="font-mono text-signal-illicit">{graphNeighbors.filter((node) => node.label === 'ILLICIT').length}</span> illicit, <span className="font-mono text-signal-licit">{graphNeighbors.filter((node) => node.label === 'LICIT').length}</span> licit, <span className="font-mono text-ink">{graphNeighbors.filter((node) => node.label === 'UNKNOWN').length}</span> unknown</span>
                      {graph.data.metadata.truncated && <span className="badge-pill badge-high">Bounded at {graph.data.metadata.max_limit} nodes</span>}
                    </div>
                    <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="h-[540px] min-w-0 sm:h-[560px]">
                        <CytoscapeCanvas nodes={graph.data.nodes} edges={graph.data.edges} centerTransactionId={transactionId} onNodeClick={(node) => setSelectedTransactionId(node.transaction_id)} />
                      </div>
                      <aside className="panel-inset min-w-0 p-5" aria-label="Selected graph transaction">
                        <h3 className="text-sm font-medium text-ink">Node inspector</h3>
                        {selectedNode ? (
                          <div className="mt-5 space-y-5">
                            <div><p className="text-xs text-ink-muted">Transaction ID</p><p className="mt-2 break-words font-mono text-xl tabular-nums">#{selectedNode.transaction_id}</p>{selectedNode.transaction_id === transactionId && <span className="badge-pill badge-accent mt-3">Graph origin</span>}</div>
                            <dl className="divide-y divide-line text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2 py-3"><dt className="text-ink-muted">Hop distance</dt><dd className="font-mono">{selectedNode.hop_level}</dd></div>
                              <div className="flex flex-wrap items-center justify-between gap-2 py-3"><dt className="text-ink-muted">Dataset label</dt><dd><LabelBadge label={selectedNode.label} /></dd></div>
                              <div className="flex flex-wrap items-center justify-between gap-2 py-3"><dt className="text-ink-muted">Stored prediction</dt><dd>{selectedNode.prediction === 'ILLICIT' || selectedNode.prediction === 'LICIT' ? <LabelBadge label={selectedNode.prediction} isPrediction /> : <span className="text-ink-muted">Unavailable</span>}</dd></div>
                              <div className="flex flex-wrap items-center justify-between gap-2 py-3"><dt className="text-ink-muted">Illicit probability</dt><dd className="font-mono">{percent(probability(selectedNode.probability))}</dd></div>
                            </dl>
                            <p className="text-xs leading-relaxed text-ink-muted">An edge reference may lack a full indexed record. Unknown or unscored metadata does not establish a licit counterparty.</p>
                            {selectedNode.transaction_id !== transactionId && <Link to={`/transactions/${selectedNode.transaction_id}`} className="btn-secondary w-full">Open transaction<ArrowUpRight size={16} aria-hidden="true" /></Link>}
                          </div>
                        ) : <p className="mt-5 text-sm leading-relaxed text-ink-muted">Select a returned node to inspect it. No origin metadata has been inferred.</p>}
                      </aside>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                      <p className="max-w-[70ch] text-xs leading-relaxed text-ink-muted">Neighbor label counts exclude the origin and use dataset labels only. Unflagged unknown nodes are not counted as licit; this is a bounded view, not a completeness check.</p>
                      <Link to={`/graph?tx=${transactionId}&depth=${graphDepth}`} className="text-link">Open graph workspace<ArrowUpRight size={16} aria-hidden="true" /></Link>
                    </div>
                    {graph.data.edges.length === 0 && <div className="data-note mt-4"><Info size={16} aria-hidden="true" /><p>No connecting edges were returned at this depth. An isolated indexed view is not evidence that a transaction is clean.</p></div>}
                  </>
                )}
              </section>
            )}

            {activeTab === 'intelligence' && (
              <div className="space-y-6">
                <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                  <section className="panel-surface min-w-0 p-5 sm:p-6">
                    <div className="flex items-center gap-3"><Cpu size={19} className="text-accent" aria-hidden="true" /><h2 className="section-heading">Stored model output</h2></div>
                    <p className="section-description">Recorded classification, not a new inference from the active model.</p>
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs text-ink-muted">Illicit probability</p><p className="mt-2 font-mono text-3xl tabular-nums">{percent(storedProbability)}</p></div>{storedPrediction ? <LabelBadge label={storedPrediction} isPrediction /> : <span className="badge-pill badge-unknown">No classification</span>}</div>
                    {storedProbability !== null && <div className="progress-track mt-4" role="meter" aria-label="Stored illicit probability" aria-valuemin={0} aria-valuemax={1} aria-valuenow={storedProbability} aria-valuetext={percent(storedProbability)}><div className={storedPrediction === 'ILLICIT' ? 'bg-signal-illicit' : 'bg-accent'} style={{ width: `${storedProbability * 100}%`, transition: motionEnabled ? undefined : 'none' }} /></div>}
                    <dl className="mt-5 text-sm"><div className="flex flex-wrap justify-between gap-3 border-t border-line py-3"><dt className="text-ink-muted">Assigned-class probability</dt><dd className="font-mono">{percent(assignedProbability)}</dd></div></dl>
                    <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{storedProbability === null ? 'The record contains no usable probability. No licit confidence estimate can be derived.' : 'Probability is a model score, not proof of intent or a verified confidence interval.'}</p>
                    <p className="mt-3 text-xs leading-relaxed text-ink-muted">The originating model name and inference timestamp are not supplied. Cached evaluation metrics cannot establish prediction provenance.</p>
                  </section>
                  <section className="panel-surface min-w-0 p-5 sm:p-6">
                    <div className="flex items-center gap-3"><Network size={19} className="text-signal-info" aria-hidden="true" /><h2 className="section-heading">GraphSAGE output</h2></div>
                    <p className="section-description">Separate graph-model inference returned with the intelligence response.</p>
                    {intelligence.loading ? <PanelLoading label="GraphSAGE status" /> : !gnnAvailable ? (
                      <div className="mt-6 space-y-4">
                        <p className="text-xl font-medium text-ink-muted">Inference unavailable</p>
                        <p className="text-sm leading-relaxed text-ink-secondary">
                          {gnnMode === 'dependency_unavailable' ? 'The optional graph-model runtime is unavailable.' : gnnMode === 'model_unavailable' ? 'The graph-model checkpoint is unavailable.' : 'No usable graph-model prediction was returned for this transaction.'} Unknown and unavailable outputs do not carry a probability estimate.
                        </p>
                        <button type="button" onClick={intelligence.retry} className="btn-secondary">Retry intelligence</button>
                      </div>
                    ) : (
                      <>
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs text-ink-muted">Illicit probability</p><p className="mt-2 font-mono text-3xl tabular-nums">{percent(gnnProbability)}</p></div><LabelBadge label={gnn!.prediction} isPrediction /></div>
                        <div className="progress-track mt-4" role="meter" aria-label="GraphSAGE illicit probability" aria-valuemin={0} aria-valuemax={1} aria-valuenow={gnnProbability!} aria-valuetext={percent(gnnProbability)}><div className="bg-signal-info" style={{ width: `${gnnProbability! * 100}%`, transition: motionEnabled ? undefined : 'none' }} /></div>
                        <p className="mt-5 text-sm text-ink-secondary">{gnnContext}</p>
                        {gnnMode === 'graph_subgraph_2hop' && <p className="mt-2 text-xs text-ink-muted"><span className="font-mono">{count(gnn!.metadata?.nodes_in_subgraph)}</span> inference nodes / <span className="font-mono">{count(gnn!.metadata?.edges_in_subgraph)}</span> inference edges</p>}
                        <p className="mt-4 text-sm leading-relaxed text-ink-secondary">{gnnMode === 'isolated_node_self_loop' ? 'The model evaluated a self-loop, not external neighborhood exposure.' : 'GraphSAGE uses an undirected message-passing view. The investigation canvas retains the original directed edges.'}</p>
                        <p className="mt-3 text-xs leading-relaxed text-ink-muted">Feature coverage is not reported. This output is not assumed to be the source of the stored risk score.</p>
                      </>
                    )}
                  </section>
                </div>
                {intelligence.loading ? <section className="panel-surface p-6"><PanelLoading label="graph and feature signals" /></section> : !intelligence.data ? (
                  <section className="panel-surface"><EmptyState icon={Cpu} title="Signal analysis unavailable" description="The stored model output above remains available. Graph and feature signals could not be loaded." actionLabel="Retry signal analysis" onAction={intelligence.retry} /></section>
                ) : (
                  <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                    {[
                      { id: 'graph', title: 'Graph observations', description: 'Direct exposure and topology, from the indexed edge references.', signals: intelligence.data.graph_signals, icon: Network },
                      { id: 'features', title: 'Feature observations', description: 'Endpoint deviation notices, not learned feature attribution.', signals: intelligence.data.feature_signals, icon: Layers },
                    ].map((group) => (
                      <section key={group.id} className="panel-surface min-w-0 p-5 sm:p-6">
                        <div className="flex items-center gap-3"><group.icon size={18} className="text-ink-muted" aria-hidden="true" /><h2 className="section-heading">{group.title}</h2></div>
                        <p className="section-description">{group.description}</p>
                        {group.id === 'graph' && <p className="mt-4 text-xs leading-relaxed text-ink-muted"><span className="font-mono">{count(neighborhood?.known_illicit_neighbors)}</span> dataset-illicit neighbors; <span className="font-mono">{count(neighborhood?.suspicious_neighbors_count)}</span> flagged references. These categories can overlap.</p>}
                        <div className="mt-5 divide-y divide-line">
                          {group.signals.length ? group.signals.map((signal, index) => {
                            const unflagged = group.id === 'graph' && /benign|clean/i.test(`${signal.name} ${signal.value}`);
                            const noFeatureAlerts = group.id === 'features' && signal.name === 'Standard Feature Profile';
                            const tone = signal.severity === 'critical' ? 'badge-critical' : signal.severity === 'high' ? 'badge-high' : signal.severity === 'medium' ? 'badge-medium' : 'badge-unknown';
                            return (
                              <article key={`${signal.name}-${index}`} className="space-y-3 py-4 first:pt-0 last:pb-0">
                                <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 text-sm font-medium text-ink">{unflagged ? 'No flagged direct exposure' : noFeatureAlerts ? 'No feature alerts returned' : signal.name}</h3><span className={`badge-pill ${tone}`}>{signal.severity === 'low' ? 'Informational' : `${signal.severity.charAt(0).toUpperCase()}${signal.severity.slice(1)} signal`}</span></div>
                                <p className={`text-sm tabular-nums text-ink-secondary ${noFeatureAlerts ? '' : 'font-mono'}`}>{unflagged ? `${count(neighborhood?.total_neighbors)} connected references` : noFeatureAlerts ? 'No alerts' : signal.value}</p>
                                <p className="text-sm leading-relaxed text-ink-muted">{unflagged ? 'No flagged neighborhood signal was returned. Unknown and unindexed neighbors are not confirmed licit.' : noFeatureAlerts ? 'No deviation notices were returned. This does not establish a normal or low-risk transaction.' : signal.description}</p>
                              </article>
                            );
                          }) : <p className="text-sm leading-relaxed text-ink-muted">No observations were returned for this section. Missing signals are not evidence of safety.</p>}
                        </div>
                        {group.id === 'features' && <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-ink-muted">Intelligence notices use |z| &gt; 2.5. The feature browser highlights |z| &gt; 3; only the returned risk breakdown determines score contributions.</p>}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'features' && (
              <section className="panel-surface min-w-0 overflow-hidden">
                <div className="border-b border-line p-5 sm:p-6"><h2 className="section-heading">Feature dimensions</h2><p className="section-description">Inspect standardized values. Large deviations are observations, not proof of illicit activity.</p></div>
                {features.loading ? <div className="p-6"><PanelLoading label="feature dimensions" /></div> : !features.data ? (
                  <EmptyState icon={Layers} title="Features unavailable" description="No usable feature vector could be loaded for this indexed transaction. Other investigation sections remain available." actionLabel="Retry features" onAction={features.retry} />
                ) : (
                  <>
                    <div className="space-y-5 border-b border-line p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4"><div className="segmented-control" role="group" aria-label="Feature category">{([
                        { id: 'all', label: `All (${allFeatures.length})` },
                        { id: 'local', label: `Local (${features.data.local_features.length})` },
                        { id: 'aggregate', label: `Neighborhood (${features.data.aggregate_features.length})` },
                      ] as const).map((category) => <button key={category.id} type="button" aria-pressed={featureCategory === category.id} style={{ minHeight: 44 }} onClick={() => { setFeatureCategory(category.id); setFeaturePage(1); }}>{category.label}</button>)}</div><span className={`badge-pill ${allFeatures.length === 165 && features.data.total_features === 165 ? 'badge-unknown' : 'badge-high'}`}>{allFeatures.length} / 165 dimensions returned</span></div>
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="min-w-0 flex-1 basis-[260px]"><label htmlFor={`feature-search-${transactionId}`} className="field-label">Find a feature</label><div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden="true" /><input id={`feature-search-${transactionId}`} type="search" value={featureSearch} onChange={(event) => { setFeatureSearch(event.target.value); setFeaturePage(1); }} placeholder="Feature 42 or zero-based index 41" className="field-input pl-10" aria-describedby={`feature-index-note-${transactionId}`} /></div></div>
                        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink-secondary"><input type="checkbox" checked={onlyDeviations} onChange={(event) => { setOnlyDeviations(event.target.checked); setFeaturePage(1); }} className="h-4 w-4 accent-[var(--accent-primary)]" />Only |z| &gt; 3</label>
                      </div>
                      <p id={`feature-index-note-${transactionId}`} className="text-xs leading-relaxed text-ink-muted">Zero-based indices: local <span className="font-mono">0-92</span>, neighborhood aggregates <span className="font-mono">93-164</span>. API feature names remain one-based.</p>
                    </div>
                    {paginatedFeatures.length ? (
                      <div role="region" aria-label="Feature values table" tabIndex={0} className="overflow-x-auto focus-visible:outline-offset-[-3px]">
                        <table className="tx-table">
                          <caption className="sr-only">Standardized transaction features, with zero-based indices and an absolute deviation threshold of three</caption>
                          <thead><tr><th scope="col">Index</th><th scope="col">Feature</th><th scope="col" className="text-right">Standardized value</th><th scope="col">Deviation</th></tr></thead>
                          <tbody>
                            {paginatedFeatures.map((feature) => {
                              const finite = Number.isFinite(feature.value);
                              const deviation = finite && Math.abs(feature.value) > 3;
                              return (
                                <tr key={feature.index}>
                                  <td className="font-mono tabular-nums text-ink-muted">{feature.index - 1}</td>
                                  <th scope="row" className="!bg-transparent !font-normal">
                                    <span className="text-sm font-medium text-ink">{feature.name}</span>
                                    <span className="mt-1 block text-xs font-normal text-ink-muted">{feature.category}</span>
                                  </th>
                                  <td className="whitespace-nowrap text-right font-mono tabular-nums">
                                    {finite ? `${feature.value > 0 ? '+' : ''}${feature.value.toFixed(4)}` : 'Unavailable'}
                                  </td>
                                  <td><span className={`badge-pill ${deviation ? 'badge-high' : 'badge-unknown'}`}>
                                    {!finite ? 'Value unavailable' : deviation ? '|z| > 3' : 'Within threshold'}
                                  </span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : <EmptyState icon={Search} title="No matching features" description="Try a feature name, a zero-based index, or a different category. The deviation-only filter may hide matches." actionLabel="Clear feature filters" onAction={() => { setFeatureSearch(''); setFeatureCategory('all'); setOnlyDeviations(false); setFeaturePage(1); }} />}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-4 text-xs text-ink-muted" role="navigation" aria-label="Feature pagination">
                      <p role="status">Showing <span className="font-mono">{displayedFeatures.length ? (currentFeaturePage - 1) * featuresPerPage + 1 : 0}-{Math.min(currentFeaturePage * featuresPerPage, displayedFeatures.length)}</span> of <span className="font-mono">{displayedFeatures.length}</span> features</p>
                      <div className="flex items-center gap-2"><button type="button" onClick={() => setFeaturePage(currentFeaturePage - 1)} disabled={currentFeaturePage <= 1} className="icon-button" aria-label="Previous feature page"><ChevronLeft size={18} aria-hidden="true" /></button><span className="min-w-[60px] text-center font-mono tabular-nums">{currentFeaturePage} / {totalFeaturePages}</span><button type="button" onClick={() => setFeaturePage(currentFeaturePage + 1)} disabled={currentFeaturePage >= totalFeaturePages} className="icon-button" aria-label="Next feature page"><ChevronRight size={18} aria-hidden="true" /></button></div>
                    </div>
                    <div className="border-t border-line px-5 py-4 text-xs leading-relaxed text-ink-muted">Feature rows may come from indexed vectors or a local CSV lookup; the endpoint does not expose row-level source provenance. This view does not run inference or change the score.</div>
                  </>
                )}
              </section>
            )}

            {activeTab === 'evidence' && (
              <section className="panel-surface min-w-0 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="section-heading">Evidence observations</h2><p className="section-description">Research annotations and model-derived leads, grouped by source.</p></div><span className="badge-pill badge-unknown">Investigative leads</span></div>
                {evidence.loading ? <PanelLoading label="evidence observations" /> : !evidence.data ? (
                  <EmptyState icon={FileText} title="Evidence unavailable" description="The evidence endpoint could not return observations. The indexed transaction has not been replaced or inferred." actionLabel="Retry evidence" onAction={evidence.retry} />
                ) : !evidence.data.evidence_items.length ? (
                  <EmptyState icon={FileText} title="No evidence observations" description="No observations were returned. This is not a finding of safety or an absence of suspicious activity." actionLabel="Refresh evidence" onAction={evidence.retry} />
                ) : (
                  <div className="mt-6 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
                    {evidence.data.evidence_items.map((item, index) => {
                      const datasetItem = item.category === 'Dataset Ground Truth';
                      const storedModelItem = item.category === 'Machine Learning Detection';
                      const graphModelItem = item.category === 'Graph Neural Network';
                      const classification = datasetItem ? 'Dataset annotation' : storedModelItem || graphModelItem ? 'Model-derived' : 'Graph observation';
                      const observation = storedModelItem
                        ? storedProbability === null ? 'A classification was stored without a usable probability.' : `Stored illicit probability: ${percent(storedProbability)}. Assigned-class probability: ${percent(assignedProbability)}.`
                        : graphModelItem && !gnnAvailable ? 'The evidence response reports a graph-model observation, but a usable structured inference status is unavailable.' : item.observation;
                      const significance = datasetItem ? 'Historical Elliptic annotation; not an independent legal assessment.' : storedModelItem ? 'Recorded model output. The originating model and inference time are not supplied.' : graphModelItem ? 'A separate graph-model observation, not proof of transaction intent.' : item.forensic_significance;
                      return (
                        <article key={`${item.category}-${item.indicator}-${index}`} className="panel-inset min-w-0 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-muted">{item.category}</span><span className="badge-pill badge-unknown">{classification}</span></div>
                          <h3 className="mt-4 text-base font-medium leading-relaxed text-ink">{graphModelItem && !gnnAvailable ? 'GraphSAGE observation' : item.indicator}</h3>
                          <p className="mt-3 text-sm leading-relaxed text-ink-secondary">{observation}</p>
                          <div className="mt-4 border-t border-line pt-4"><p className="text-xs font-medium text-ink-muted">Investigative relevance</p><p className="mt-2 text-sm leading-relaxed text-ink-secondary">{significance}</p></div>
                          {storedModelItem && storedProbability === null && <p className="mt-4 text-xs text-ink-muted">Probability unavailable. No confidence estimate displayed.</p>}
                          {!datasetItem && !storedModelItem && !graphModelItem && <p className="mt-4 text-xs text-ink-muted">Endpoint assessment: {item.confidence}. This is not a legal confidence measure.</p>}
                        </article>
                      );
                    })}
                  </div>
                )}
                <div className="data-note mt-6"><Info size={16} aria-hidden="true" /><p>Evidence and intelligence are separate response snapshots. Dataset labels, stored predictions, and graph-model outputs do not share verified inference provenance.</p></div>
              </section>
            )}
          </div>

          {tabs.filter((tab) => tab.id !== activeTab).map((tab) => (
            <div key={tab.id} role="tabpanel" id={`transaction-${transactionId}-panel-${tab.id}`} aria-labelledby={`transaction-${transactionId}-tab-${tab.id}`} hidden />
          ))}

          <div className="workspace-disclaimer">
            <Shield size={14} aria-hidden="true" />
            <p>{activeTab === 'evidence' && evidence.data?.disclaimer ? evidence.data.disclaimer : breakdown?.legal_disclaimer || 'Risk scores and predictions are probabilistic investigative leads, not legal proof or a definitive accusation of illegal conduct.'}</p>
          </div>
          <AddToCaseModal
            transactionId={tx.transaction_id}
            isOpen={isCaseModalOpen}
            onClose={() => setIsCaseModalOpen(false)}
          />
        </>
      )}
    </div>
  );
}
