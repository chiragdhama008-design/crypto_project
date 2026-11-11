import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Shield,
  Layers,
  Network,
  Cpu,
  FileText,
  AlertTriangle,
  Briefcase,
  ExternalLink,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { api } from '../services/api';
import {
  TransactionSummary,
  CategorizedFeaturesResponse,
  TransactionIntelligenceResponse,
  TransactionEvidenceResponse,
  GraphResponse,
  FeatureItem,
} from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { PageSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { RiskGauge } from '../components/common/RiskGauge';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { CytoscapeCanvas } from '../components/graph/CytoscapeCanvas';
import { AddToCaseModal } from '../components/investigations/AddToCaseModal';

export const TransactionInvestigation: React.FC = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const txId = parseInt(transactionId || '0', 10);

  const [activeTab, setActiveTab] = useState<
    'OVERVIEW' | 'FEATURES' | 'NETWORK' | 'INTELLIGENCE' | 'EVIDENCE'
  >('OVERVIEW');

  const [tx, setTx] = useState<TransactionSummary | null>(null);
  const [featuresData, setFeaturesData] = useState<CategorizedFeaturesResponse | null>(null);
  const [intelData, setIntelData] = useState<TransactionIntelligenceResponse | null>(null);
  const [evidenceData, setEvidenceData] = useState<TransactionEvidenceResponse | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);

  const [featureCategory, setFeatureCategory] = useState<'ALL' | 'LOCAL' | 'AGGREGATE'>('ALL');
  const [featureSearch, setFeatureSearch] = useState('');
  const [featurePage, setFeaturePage] = useState(1);
  const featuresPerPage = 15;

  useEffect(() => {
    if (!txId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getTransaction(txId),
      api.getTransactionIntelligence(txId).catch(() => null),
      api.getTransactionEvidence(txId).catch(() => null),
      api.getTransactionFeatures(txId).catch(() => null),
      api.getTransactionGraph(txId, 1).catch(() => null),
    ])
      .then(([txRes, intelRes, evRes, featRes, grRes]) => {
        setTx(txRes);
        setIntelData(intelRes);
        setEvidenceData(evRes);
        setFeaturesData(featRes);
        setGraphData(grRes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [txId]);

  if (loading) {
    return <PageSkeleton cards={4} />;
  }

  if (error || !tx) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] mx-auto">
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="Transaction Entity Not Found"
          description={error || `Transaction #${txId} is not present in the indexed forensic store.`}
          actionLabel="Return to Ledger"
          onAction={() => navigate('/transactions')}
        />
      </div>
    );
  }

  // Filter features
  let displayedFeatures: FeatureItem[] = [];
  if (featuresData) {
    if (featureCategory === 'LOCAL') {
      displayedFeatures = featuresData.local_features;
    } else if (featureCategory === 'AGGREGATE') {
      displayedFeatures = featuresData.aggregate_features;
    } else {
      displayedFeatures = [...featuresData.local_features, ...featuresData.aggregate_features];
    }

    if (featureSearch.trim()) {
      const q = featureSearch.toLowerCase();
      displayedFeatures = displayedFeatures.filter(
        (f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
      );
    }
  }

  const totalFeaturePages = Math.ceil(displayedFeatures.length / featuresPerPage) || 1;
  const paginatedFeatures = displayedFeatures.slice(
    (featurePage - 1) * featuresPerPage,
    featurePage * featuresPerPage
  );

  const tabItems = [
    { id: 'OVERVIEW', label: 'Entity Overview', icon: Shield },
    { id: 'FEATURES', label: 'Features (165)', icon: Layers },
    { id: 'NETWORK', label: 'Network Subgraph', icon: Network },
    { id: 'INTELLIGENCE', label: 'Signals & Analysis', icon: Cpu },
    { id: 'EVIDENCE', label: 'Forensic Dossier', icon: FileText },
  ] as const;

  const probPct =
    tx.prediction_probability !== null && tx.prediction_probability !== undefined
      ? `${(tx.prediction_probability * 100).toFixed(1)}%`
      : 'N/A';

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] mx-auto space-y-5">
      <PageHeader
        backLabel="Transaction Ledger"
        onBack={() => navigate('/transactions')}
        eyebrow={`ENTITY DOSSIER · TIMESTEP ${tx.time_step} / 49`}
        badges={[
          { label: tx.known_label, tone: tx.known_label === 'ILLICIT' ? 'illicit' : tx.known_label === 'LICIT' ? 'licit' : 'unknown' },
          ...(tx.prediction ? [{ label: `PRED: ${tx.prediction}`, tone: (tx.prediction === 'ILLICIT' ? 'illicit' : 'licit') as 'illicit' | 'licit' }] : []),
        ]}
        title={`Transaction #${tx.transaction_id}`}
        subtitle={`Topology: ${tx.total_degree} directed edges (${tx.in_degree} incoming inflows, ${tx.out_degree} outgoing outflows).`}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate(`/graph?tx=${tx.transaction_id}`)}
              className="btn-secondary"
            >
              <Network className="w-4 h-4 text-signal-info" />
              <span>Graph Explorer</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCaseModalOpen(true)}
              className="btn-primary"
            >
              <Briefcase className="w-4 h-4" />
              <span>Attach to Case</span>
            </button>
          </>
        }
      />

      {/* Executive Verdict Strip + Gauge */}
      <section className="panel-surface p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* ML & GNN Telemetry Readouts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            <div className="panel-inset p-3.5 space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                Tabular Illicit Probability
              </div>
              <div className="text-2xl font-mono font-semibold text-ink tabular-nums">
                {probPct}
              </div>
              <div className="text-[11px] font-mono text-ink-muted">
                Active Classifier Signal
              </div>
            </div>

            <div className="panel-inset p-3.5 space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-accent flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5" />
                <span>2-Layer GraphSAGE</span>
              </div>
              {intelData?.gnn_prediction ? (
                <>
                  <div
                    className={`text-2xl font-mono font-semibold tabular-nums ${
                      intelData.gnn_prediction.prediction === 'ILLICIT'
                        ? 'text-signal-illicit'
                        : 'text-signal-licit'
                    }`}
                  >
                    {(intelData.gnn_prediction.illicit_probability * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] font-mono text-ink-muted">
                    GNN Verdict: {intelData.gnn_prediction.prediction}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-mono font-semibold text-ink-muted">Standby</div>
                  <div className="text-[11px] font-mono text-ink-muted">PyG optional runtime</div>
                </>
              )}
            </div>

            <div className="panel-inset p-3.5 space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                1-Hop Neighborhood Exposure
              </div>
              <div className="text-2xl font-mono font-semibold text-signal-illicit tabular-nums">
                {graphData ? graphData.metadata.illicit_count : 0}{' '}
                <span className="text-sm text-ink-muted font-normal">
                  / {graphData ? Math.max(0, graphData.metadata.total_nodes - 1) : 0} neighbors
                </span>
              </div>
              <div className="text-[11px] font-mono text-ink-muted">
                Adjacent illicit nodes
              </div>
            </div>
          </div>

          {/* Risk Gauge */}
          <div className="flex items-center gap-4 pl-0 lg:pl-6 lg:border-l border-line">
            <RiskGauge score={tx.risk_score} level={tx.risk_level} size={96} />
            <div className="space-y-1.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-muted">
                Composite Triage
              </div>
              <RiskBadge score={tx.risk_score} level={tx.risk_level} showScore={false} />
              <div className="text-[11px] font-mono text-ink-muted">
                Weighted 0–100 index
              </div>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          role="tablist"
          aria-label="Transaction analysis sections"
          className="flex items-center gap-1 border-b border-line overflow-x-auto pb-px"
        >
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2.5 text-xs font-mono border-b-2 inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-[var(--accent-primary)] text-ink font-semibold'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-accent' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="panel-surface p-5 space-y-4">
            <h2 className="text-[15px] font-semibold text-ink pb-2.5 border-b border-line">
              Entity Classification Attributes
            </h2>
            <div className="divide-y divide-line text-xs font-mono">
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">Transaction ID</span>
                <span className="font-semibold text-ink tabular-nums">#{tx.transaction_id}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">Time Step Snapshot</span>
                <span className="font-semibold text-ink tabular-nums">Step {tx.time_step} / 49</span>
              </div>
              <div className="flex justify-between py-2.5 items-center">
                <span className="text-ink-muted">Ground Truth</span>
                <LabelBadge label={tx.known_label} />
              </div>
              <div className="flex justify-between py-2.5 items-center">
                <span className="text-ink-muted">Tabular Model Prediction</span>
                {tx.prediction ? (
                  <LabelBadge label={tx.prediction} isPrediction />
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">Tabular P(Illicit)</span>
                <span className="font-semibold text-ink tabular-nums">
                  {tx.prediction_probability !== null && tx.prediction_probability !== undefined
                    ? `${(tx.prediction_probability * 100).toFixed(2)}%`
                    : '—'}
                </span>
              </div>
              {intelData?.gnn_prediction && (
                <>
                  <div className="flex justify-between py-2.5 items-center">
                    <span className="text-accent flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5" />
                      <span>GraphSAGE Verdict</span>
                    </span>
                    <LabelBadge label={intelData.gnn_prediction.prediction} isPrediction />
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-accent">GNN Illicit / Licit Probs</span>
                    <span className="font-semibold text-ink tabular-nums">
                      {(intelData.gnn_prediction.illicit_probability * 100).toFixed(2)}% /{' '}
                      {(intelData.gnn_prediction.licit_probability * 100).toFixed(2)}%
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between py-2.5 items-center">
                <span className="text-ink-muted">Composite Risk Score</span>
                <RiskBadge score={tx.risk_score} level={tx.risk_level} />
              </div>
            </div>
          </div>

          <div className="panel-surface p-5 space-y-4">
            <h2 className="text-[15px] font-semibold text-ink pb-2.5 border-b border-line">
              Graph Flow Dynamics
            </h2>
            <div className="divide-y divide-line text-xs font-mono">
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">Incoming Degree (Inflow)</span>
                <span className="font-semibold text-ink tabular-nums">{tx.in_degree} edges</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">Outgoing Degree (Outflow)</span>
                <span className="font-semibold text-ink tabular-nums">{tx.out_degree} edges</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">Total Neighborhood Degree</span>
                <span className="font-semibold text-ink tabular-nums">
                  {tx.total_degree} connections
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">1-Hop Subgraph Size</span>
                <span className="font-semibold text-ink tabular-nums">
                  {graphData ? Math.max(0, graphData.metadata.total_nodes - 1) : 0} adjacent nodes
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-ink-muted">Confirmed Illicit Counterparties</span>
                <span className="font-semibold text-signal-illicit tabular-nums">
                  {graphData ? graphData.metadata.illicit_count : 0} nodes
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: 165 FEATURES */}
      {activeTab === 'FEATURES' && (
        <section className="panel-surface overflow-hidden">
          <div className="p-4 border-b border-line bg-inset/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 bg-surface p-1 rounded-lg border border-line font-mono text-xs">
              {(['ALL', 'LOCAL', 'AGGREGATE'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setFeatureCategory(cat);
                    setFeaturePage(1);
                  }}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    featureCategory === cat
                      ? 'bg-accent text-[var(--accent-ink)] font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {cat === 'ALL'
                    ? 'All (165)'
                    : cat === 'LOCAL'
                    ? 'Local (1–93)'
                    : 'Neighborhood (94–165)'}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input
                type="text"
                aria-label="Filter features"
                placeholder="Search feature dimension..."
                value={featureSearch}
                onChange={(e) => {
                  setFeatureSearch(e.target.value);
                  setFeaturePage(1);
                }}
                className="field-input pl-8 font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Feature Dimension</th>
                  <th>Category</th>
                  <th>Standardized Value (z-score)</th>
                  <th>Anomaly Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFeatures.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-ink-muted font-mono text-xs">
                      No feature dimensions match &ldquo;{featureSearch}&rdquo;.
                    </td>
                  </tr>
                ) : (
                  paginatedFeatures.map((f) => {
                    const isAnom = Math.abs(f.value) > 2.5;
                    return (
                      <tr
                        key={f.index}
                        className={isAnom ? 'bg-[var(--signal-illicit-soft)]/40' : ''}
                      >
                        <td className="font-mono text-ink-muted tabular-nums">#{f.index}</td>
                        <td className="font-mono font-semibold text-ink">{f.name}</td>
                        <td className="font-mono text-ink-secondary">{f.category}</td>
                        <td className="font-mono font-semibold text-accent tabular-nums">
                          {f.value > 0 ? `+${f.value.toFixed(4)}` : f.value.toFixed(4)}
                        </td>
                        <td>
                          {isAnom ? (
                            <span className="badge-pill badge-illicit">Outlier (|z| &gt; 2.5)</span>
                          ) : (
                            <span className="badge-pill badge-unknown">Nominal</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 bg-inset/60 border-t border-line flex items-center justify-between text-xs font-mono text-ink-muted tabular-nums">
            <div>
              Showing {displayedFeatures.length > 0 ? (featurePage - 1) * featuresPerPage + 1 : 0}{' '}
              to {Math.min(featurePage * featuresPerPage, displayedFeatures.length)} of{' '}
              {displayedFeatures.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFeaturePage(Math.max(1, featurePage - 1))}
                disabled={featurePage <= 1}
                className="btn-secondary min-h-[32px] py-1 px-2.5 text-xs"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-accent font-semibold">
                {featurePage} / {totalFeaturePages}
              </span>
              <button
                type="button"
                onClick={() => setFeaturePage(Math.min(totalFeaturePages, featurePage + 1))}
                disabled={featurePage >= totalFeaturePages}
                className="btn-secondary min-h-[32px] py-1 px-2.5 text-xs"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: NETWORK GRAPH */}
      {activeTab === 'NETWORK' && (
        <section className="panel-surface p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">1-Hop Money Flow Subgraph</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Click any counterparty node to navigate directly to its transaction dossier
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/graph?tx=${tx.transaction_id}&depth=2`)}
              className="btn-secondary text-xs"
            >
              <span>Expand to 2-Hop Graph</span>
              <ExternalLink className="w-3.5 h-3.5 text-accent" />
            </button>
          </div>

          <div className="h-[440px] w-full">
            {graphData ? (
              <CytoscapeCanvas
                nodes={graphData.nodes}
                edges={graphData.edges}
                centerTransactionId={tx.transaction_id}
                onNodeClick={(n) => {
                  if (n.transaction_id !== tx.transaction_id) {
                    navigate(`/transactions/${n.transaction_id}`);
                  }
                }}
              />
            ) : (
              <div className="h-full panel-inset flex items-center justify-center text-xs font-mono text-ink-muted">
                Graph topology unavailable for this transaction.
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 4: INTELLIGENCE SIGNALS (Zero Violet — Amber / Azure / Teal) */}
      {activeTab === 'INTELLIGENCE' && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Model Signals */}
          <div className="panel-surface p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-line">
              <Cpu className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-ink">Model Inference Signals</h3>
            </div>
            <div className="space-y-2.5">
              {(intelData?.ml_signals || []).map((sig, i) => (
                <div key={i} className="panel-inset p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-semibold text-ink">{sig.name}</span>
                    <span className="text-accent font-semibold tabular-nums">{sig.value}</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">{sig.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Graph Signals */}
          <div className="panel-surface p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-line">
              <Network className="w-4 h-4 text-signal-info" />
              <h3 className="text-sm font-semibold text-ink">Graph Topology Signals</h3>
            </div>
            <div className="space-y-2.5">
              {(intelData?.graph_signals || []).map((sig, i) => (
                <div key={i} className="panel-inset p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-semibold text-ink">{sig.name}</span>
                    <span className="text-signal-info font-semibold tabular-nums">{sig.value}</span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">{sig.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Signals */}
          <div className="panel-surface p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-line">
              <Layers className="w-4 h-4 text-signal-licit" />
              <h3 className="text-sm font-semibold text-ink">Feature Deviation Signals</h3>
            </div>
            <div className="space-y-2.5">
              {(intelData?.feature_signals || []).map((sig, i) => (
                <div key={i} className="panel-inset p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-mono">
                    <span className="font-semibold text-ink">{sig.name}</span>
                    <span className="text-signal-licit font-semibold tabular-nums">
                      {sig.value}
                    </span>
                  </div>
                  <p className="text-xs text-ink-secondary leading-relaxed">{sig.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TAB 5: EVIDENCE TRAIL */}
      {activeTab === 'EVIDENCE' && (
        <section className="panel-surface p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Forensic Evidence Trail</h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Structured observations derived from dataset ground truth, graph neighborhood exposure, and ML probability calibration
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCaseModalOpen(true)}
              className="btn-primary text-xs"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Attach to Case</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-line rounded-lg">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Indicator</th>
                  <th>Observation</th>
                  <th>Forensic Significance</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {(evidenceData?.evidence_items || []).map((ev, i) => (
                  <tr key={i}>
                    <td className="font-mono font-semibold text-ink">{ev.category}</td>
                    <td className="font-mono text-accent">{ev.indicator}</td>
                    <td className="text-ink-secondary text-xs leading-relaxed">
                      {ev.observation}
                    </td>
                    <td className="text-ink-muted text-xs leading-relaxed">
                      {ev.forensic_significance}
                    </td>
                    <td>
                      <span className="badge-pill badge-licit">{ev.confidence}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel-inset p-3.5 text-xs text-ink-muted flex items-start gap-2.5 leading-relaxed">
            <Shield className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-ink font-semibold">Forensic Disclaimer: </strong>
              {evidenceData?.disclaimer ||
                'Risk scores and predictions represent probabilistic investigative leads rather than final judicial determinations.'}
            </div>
          </div>
        </section>
      )}

      <AddToCaseModal
        transactionId={tx.transaction_id}
        isOpen={isCaseModalOpen}
        onClose={() => setIsCaseModalOpen(false)}
      />
    </div>
  );
};
