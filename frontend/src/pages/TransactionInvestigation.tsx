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
  ArrowLeft,
  CheckCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Terminal
} from 'lucide-react';
import { api } from '../services/api';
import {
  TransactionSummary,
  CategorizedFeaturesResponse,
  TransactionIntelligenceResponse,
  TransactionEvidenceResponse,
  GraphResponse,
  FeatureItem
} from '../types/api';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { CytoscapeCanvas } from '../components/graph/CytoscapeCanvas';
import { AddToCaseModal } from '../components/investigations/AddToCaseModal';

export const TransactionInvestigation: React.FC = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const txId = parseInt(transactionId || '0', 10);

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'FEATURES' | 'NETWORK' | 'INTELLIGENCE' | 'EVIDENCE'>('OVERVIEW');

  const [tx, setTx] = useState<TransactionSummary | null>(null);
  const [featuresData, setFeaturesData] = useState<CategorizedFeaturesResponse | null>(null);
  const [intelData, setIntelData] = useState<TransactionIntelligenceResponse | null>(null);
  const [evidenceData, setEvidenceData] = useState<TransactionEvidenceResponse | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);

  // Features tab states
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
    return (
      <div className="p-5 space-y-4 max-w-7xl mx-auto font-sans">
        <div className="h-7 w-64 bg-[#262626] border border-[#333333] animate-pulse rounded"></div>
        <div className="h-24 bg-[#262626] border border-[#333333] animate-pulse rounded"></div>
        <div className="h-80 bg-[#262626] border border-[#333333] animate-pulse rounded"></div>
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="p-5 max-w-7xl mx-auto font-mono">
        <div className="bg-[#262626] border border-[#ef4743]/50 rounded p-4 text-[#ef4743] text-xs space-y-2">
          <div className="font-semibold flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-[#ef4743]" />
            <span>Transaction Not Found</span>
          </div>
          <p className="text-[#d1d5db]">{error || `Transaction #${txId} does not exist in the database.`}</p>
          <button
            onClick={() => navigate('/transactions')}
            className="px-3 py-1.5 bg-[#1a1a1a] border border-[#3e3e3e] rounded text-xs font-semibold text-[#eff1f6] hover:bg-[#333333]"
          >
            Return to Problem Explorer
          </button>
        </div>
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

  return (
    <div className="p-4 space-y-3.5 max-w-7xl mx-auto font-sans text-[#eff1f6]">
      {/* Back link & actions - LeetCode Style */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/transactions')}
          className="text-xs text-[#8c8c8c] hover:text-[#eff1f6] flex items-center space-x-1 font-mono transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>&lt; Problem Set</span>
        </button>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigate(`/graph?tx=${tx.transaction_id}`)}
            className="px-3 py-1 bg-[#262626] border border-[#3e3e3e] hover:bg-[#333333] rounded text-xs font-mono font-medium text-[#eff1f6] shadow-sm flex items-center space-x-1.5 transition-colors"
          >
            <Network className="w-3.5 h-3.5 text-[#00b8a3]" />
            <span>Open Graph Canvas</span>
          </button>
          <button
            onClick={() => setIsCaseModalOpen(true)}
            className="px-3 py-1 bg-[#ffa116] hover:bg-[#ffb84d] text-[#1a1a1a] rounded text-xs font-mono font-bold shadow-sm flex items-center space-x-1.5 transition-colors"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Add to Case</span>
          </button>
        </div>
      </div>

      {/* LEETCODE PROBLEM HEADER PANEL */}
      <div className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-sm space-y-3 font-sans">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#333333] pb-3">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 bg-[#1f1f1f] border border-[#3e3e3e] text-[#eff1f6] font-mono text-xs font-bold rounded">
                TX #{tx.transaction_id}
              </span>
              <span className="text-xs text-[#8c8c8c] font-mono">Step {tx.time_step} / 49</span>
              <LabelBadge label={tx.known_label} />
              {tx.prediction && <LabelBadge label={tx.prediction} isPrediction />}
            </div>
            <div className="text-xs text-[#8c8c8c] font-mono">
              Topology: {tx.total_degree} Total Degree ({tx.in_degree} Inflow ↓, {tx.out_degree} Outflow ↑)
            </div>
          </div>

          <div className="flex items-center space-x-4 font-mono">
            {intelData?.gnn_prediction && (
              <>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-semibold text-[#ffa116] flex items-center justify-end space-x-1">
                    <Network className="w-3 h-3 text-[#ffa116]" />
                    <span>GNN Relational</span>
                  </div>
                  <div className="text-xs font-bold text-[#eff1f6] flex items-center justify-end space-x-1 mt-0.5">
                    <span className={intelData.gnn_prediction.prediction === 'ILLICIT' ? 'text-[#ef4743]' : 'text-[#00b8a3]'}>
                      {intelData.gnn_prediction.prediction}
                    </span>
                    <span className="text-[#8c8c8c] text-[10px]">
                      ({(intelData.gnn_prediction.illicit_probability * 100).toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <div className="h-8 w-px bg-[#3e3e3e]"></div>
              </>
            )}
            <div className="text-right">
              <div className="text-[10px] uppercase font-semibold text-[#8c8c8c]">ML Illicit Probability</div>
              <div className="text-base font-bold text-[#eff1f6]">
                {tx.prediction_probability !== null && tx.prediction_probability !== undefined
                  ? `${(tx.prediction_probability * 100).toFixed(1)}%`
                  : 'N/A'}
              </div>
            </div>
            <div className="h-8 w-px bg-[#3e3e3e]"></div>
            <div className="text-right">
              <div className="text-[10px] uppercase font-semibold text-[#8c8c8c]">Composite Risk</div>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="text-base font-bold text-[#eff1f6]">{tx.risk_score}</span>
                <span className="text-xs text-[#8c8c8c]">/100</span>
                <RiskBadge score={tx.risk_score} level={tx.risk_level} showScore={false} />
              </div>
            </div>
          </div>
        </div>

        {/* LeetCode Style Problem Tabs */}
        <div className="flex items-center space-x-2 border-b border-[#333333] text-xs font-mono pt-0.5">
          {[
            { id: 'OVERVIEW', label: 'Description', icon: Shield },
            { id: 'FEATURES', label: 'Features (165)', icon: Layers },
            { id: 'NETWORK', label: 'Network Subgraph', icon: Network },
            { id: 'INTELLIGENCE', label: 'Signals & Analysis', icon: Cpu },
            { id: 'EVIDENCE', label: 'Forensic Dossier', icon: FileText },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 border-b-2 flex items-center space-x-1.5 transition-colors ${
                  isActive
                    ? 'border-[#ffa116] text-[#eff1f6] font-bold'
                    : 'border-transparent text-[#8c8c8c] hover:text-[#d1d5db]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB CONTENT */}
      {/* 1. OVERVIEW TAB */}
      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-sans">
          <div className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-sm space-y-3 font-mono">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] border-b border-[#333333] pb-2">
              Entity Baseline Attributes
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Transaction ID</span>
                <span className="font-semibold text-[#eff1f6]">{tx.transaction_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Time Step</span>
                <span className="font-semibold text-[#eff1f6]">{tx.time_step} (out of 49)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Dataset Ground Truth</span>
                <LabelBadge label={tx.known_label} />
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Tabular Model Prediction</span>
                {tx.prediction ? <LabelBadge label={tx.prediction} isPrediction /> : <span className="text-[#6b7280]">—</span>}
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Tabular Illicit Probability</span>
                <span className="font-semibold text-[#eff1f6]">
                  {tx.prediction_probability !== null && tx.prediction_probability !== undefined ? `${(tx.prediction_probability * 100).toFixed(2)}%` : '—'}
                </span>
              </div>
              {intelData?.gnn_prediction && (
                <>
                  <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                    <span className="text-[#ffa116] flex items-center space-x-1">
                      <Network className="w-3 h-3 text-[#ffa116]" />
                      <span>GNN (GraphSAGE) Prediction</span>
                    </span>
                    <LabelBadge label={intelData.gnn_prediction.prediction as any} isPrediction />
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                    <span className="text-[#ffa116] flex items-center space-x-1">
                      <Network className="w-3 h-3 text-[#ffa116]" />
                      <span>GNN Illicit / Licit Probs</span>
                    </span>
                    <span className="font-semibold text-[#eff1f6]">
                      {(intelData.gnn_prediction.illicit_probability * 100).toFixed(2)}% / {(intelData.gnn_prediction.licit_probability * 100).toFixed(2)}%
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Composite Risk Score</span>
                <RiskBadge score={tx.risk_score} level={tx.risk_level} />
              </div>
            </div>
          </div>

          <div className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-sm space-y-3 font-mono">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] border-b border-[#333333] pb-2">
              Graph Flow Dynamics
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Incoming Degree (Inflow / Aggregation)</span>
                <span className="font-semibold text-[#eff1f6]">{tx.in_degree} flows</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Outgoing Degree (Outflow / Dispersal)</span>
                <span className="font-semibold text-[#eff1f6]">{tx.out_degree} flows</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Total Neighborhood Degree</span>
                <span className="font-semibold text-[#eff1f6]">{tx.total_degree} connections</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">1-Hop Neighbor Cluster Size</span>
                <span className="font-semibold text-[#eff1f6]">
                  {graphData ? graphData.metadata.total_nodes - 1 : 0} nodes
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#2d2d2d]">
                <span className="text-[#8c8c8c]">Connected Illicit Entities</span>
                <span className="font-bold text-[#ef4743]">
                  {graphData ? graphData.metadata.illicit_count : 0} nodes
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. FEATURES TAB */}
      {activeTab === 'FEATURES' && (
        <div className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-sm space-y-3 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#333333] pb-2">
            <div className="flex items-center space-x-1.5 text-xs">
              {(['ALL', 'LOCAL', 'AGGREGATE'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setFeatureCategory(cat); setFeaturePage(1); }}
                  className={`px-2.5 py-0.5 rounded text-xs transition-colors ${
                    featureCategory === cat
                      ? 'bg-[#ffa116] text-[#1a1a1a] font-bold'
                      : 'bg-[#1a1a1a] border border-[#3e3e3e] text-[#8c8c8c] hover:text-[#eff1f6]'
                  }`}
                >
                  {cat === 'ALL' ? 'All (165)' : cat === 'LOCAL' ? 'Local (1-93)' : 'Neighborhood (94-165)'}
                </button>
              ))}
            </div>

            <div className="relative w-48">
              <Search className="w-3 h-3 absolute left-2 top-2 text-[#8c8c8c]" />
              <input
                type="text"
                placeholder="Search feature..."
                value={featureSearch}
                onChange={(e) => { setFeatureSearch(e.target.value); setFeaturePage(1); }}
                className="w-full pl-7 pr-2 py-0.5 text-xs bg-[#1a1a1a] border border-[#3e3e3e] rounded text-[#eff1f6] placeholder-[#6b7280] focus:outline-none focus:border-[#ffa116]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="leetcode-table">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Feature Dimension</th>
                  <th>Category</th>
                  <th>Standardized Value (z-score)</th>
                  <th>Variance Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFeatures.map((f) => {
                  const isAnom = Math.abs(f.value) > 2.5;
                  return (
                    <tr key={f.index} className={isAnom ? 'bg-[#ef4743]/10' : ''}>
                      <td className="text-[#8c8c8c]">#{f.index}</td>
                      <td className="font-semibold text-[#eff1f6]">{f.name}</td>
                      <td className="text-[#8c8c8c]">{f.category}</td>
                      <td className="font-semibold text-[#ffa116]">
                        {f.value > 0 ? `+${f.value.toFixed(4)}` : f.value.toFixed(4)}
                      </td>
                      <td>
                        {isAnom ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#ef4743]/20 text-[#ef4743] border border-[#ef4743]/40">
                            Outlier (|z| &gt; 2.5)
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#333333] text-[#8c8c8c]">
                            Normal Variance
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Feature Pagination */}
          <div className="flex items-center justify-between text-xs text-[#8c8c8c] pt-2 border-t border-[#333333]">
            <div>
              Showing {displayedFeatures.length > 0 ? (featurePage - 1) * featuresPerPage + 1 : 0} to{' '}
              {Math.min(featurePage * featuresPerPage, displayedFeatures.length)} of {displayedFeatures.length}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFeaturePage(Math.max(1, featurePage - 1))}
                disabled={featurePage <= 1}
                className="px-2 py-0.5 bg-[#1a1a1a] border border-[#3e3e3e] rounded text-[#eff1f6] disabled:opacity-30 hover:bg-[#333333]"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[#ffa116] font-bold">Page {featurePage} of {totalFeaturePages}</span>
              <button
                onClick={() => setFeaturePage(Math.min(totalFeaturePages, featurePage + 1))}
                disabled={featurePage >= totalFeaturePages}
                className="px-2 py-0.5 bg-[#1a1a1a] border border-[#3e3e3e] rounded text-[#eff1f6] disabled:opacity-30 hover:bg-[#333333]"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. NETWORK GRAPH TAB */}
      {activeTab === 'NETWORK' && (
        <div className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-sm space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-[#333333] pb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6]">
                1-Hop Money Flow Network
              </h3>
              <p className="text-[10px] text-[#8c8c8c]">
                Directed propagation edges interconnecting this transaction with adjacent nodes
              </p>
            </div>
            <button
              onClick={() => navigate(`/graph?tx=${tx.transaction_id}&depth=2`)}
              className="text-xs text-[#ffa116] hover:underline font-semibold flex items-center space-x-1"
            >
              <span>Explore 2-Hop Graph</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="h-96 w-full">
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
              <div className="h-full flex items-center justify-center text-xs text-[#8c8c8c]">
                Loading graph topology...
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. INTELLIGENCE SIGNALS TAB */}
      {activeTab === 'INTELLIGENCE' && (
        <div className="space-y-3 font-sans">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
            {/* Model Signals */}
            <div className="bg-[#262626] p-3 rounded border border-[#333333] shadow-sm space-y-2">
              <div className="flex items-center space-x-2 border-b border-[#333333] pb-2">
                <Cpu className="w-4 h-4 text-[#ffa116]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6]">Model Signals</h3>
              </div>
              <div className="space-y-2">
                {intelData?.ml_signals.map((sig, i) => (
                  <div key={i} className="p-2 bg-[#1e1e1e] rounded border border-[#333333] space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#eff1f6]">{sig.name}</span>
                      <span className="text-[#ffa116] font-bold">{sig.value}</span>
                    </div>
                    <p className="text-[10px] text-[#8c8c8c] font-sans">{sig.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Graph Signals */}
            <div className="bg-[#262626] p-3 rounded border border-[#333333] shadow-sm space-y-2">
              <div className="flex items-center space-x-2 border-b border-[#333333] pb-2">
                <Network className="w-4 h-4 text-[#a855f7]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6]">Graph Signals</h3>
              </div>
              <div className="space-y-2">
                {intelData?.graph_signals.map((sig, i) => (
                  <div key={i} className="p-2 bg-[#1e1e1e] rounded border border-[#333333] space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#eff1f6]">{sig.name}</span>
                      <span className="text-[#a855f7] font-bold">{sig.value}</span>
                    </div>
                    <p className="text-[10px] text-[#8c8c8c] font-sans">{sig.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Signals */}
            <div className="bg-[#262626] p-3 rounded border border-[#333333] shadow-sm space-y-2">
              <div className="flex items-center space-x-2 border-b border-[#333333] pb-2">
                <Layers className="w-4 h-4 text-[#00b8a3]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6]">Feature Signals</h3>
              </div>
              <div className="space-y-2">
                {intelData?.feature_signals.map((sig, i) => (
                  <div key={i} className="p-2 bg-[#1e1e1e] rounded border border-[#333333] space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#eff1f6]">{sig.name}</span>
                      <span className="text-[#00b8a3] font-bold">{sig.value}</span>
                    </div>
                    <p className="text-[10px] text-[#8c8c8c] font-sans">{sig.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. EVIDENCE TAB */}
      {activeTab === 'EVIDENCE' && (
        <div className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-sm space-y-3 font-mono">
          <div className="border-b border-[#333333] pb-2 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6]">
                Forensic Evidence Trail
              </h3>
              <p className="text-[10px] text-[#8c8c8c]">
                Objective observations derived from ground truth, graph topology, and ML inference
              </p>
            </div>
            <button
              onClick={() => setIsCaseModalOpen(true)}
              className="px-2.5 py-1 text-xs bg-[#ffa116] text-[#1a1a1a] font-bold rounded hover:bg-[#ffb84d] transition-colors"
            >
              Attach to Case
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="leetcode-table">
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
                {evidenceData?.evidence_items.map((ev, i) => (
                  <tr key={i}>
                    <td className="font-semibold text-[#eff1f6]">{ev.category}</td>
                    <td className="text-[#ffa116]">{ev.indicator}</td>
                    <td className="text-[#d1d5db] font-sans text-xs">{ev.observation}</td>
                    <td className="text-[#8c8c8c] font-sans text-xs">{ev.forensic_significance}</td>
                    <td>
                      <span className="px-1.5 py-0.5 rounded bg-[#1f1f1f] border border-[#3e3e3e] text-[10px] font-bold text-[#00b8a3]">
                        {ev.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-2.5 bg-[#1e1e1e] border border-[#333333] rounded text-[10px] text-[#8c8c8c] flex items-start space-x-2">
            <Shield className="w-3.5 h-3.5 text-[#ffa116] flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#eff1f6]">Forensic Disclaimer: </span>
              {evidenceData?.disclaimer}
            </div>
          </div>
        </div>
      )}

      {/* Add To Case Modal */}
      <AddToCaseModal
        transactionId={tx.transaction_id}
        isOpen={isCaseModalOpen}
        onClose={() => setIsCaseModalOpen(false)}
      />
    </div>
  );
};
