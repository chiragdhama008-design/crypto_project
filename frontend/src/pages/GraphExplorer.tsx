import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Network, ArrowRight, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { GraphResponse, GraphNode } from '../types/api';
import { CytoscapeCanvas } from '../components/graph/CytoscapeCanvas';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';

export const GraphExplorer: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTx = searchParams.get('tx') || '230425980';
  const initialDepth = parseInt(searchParams.get('depth') || '1', 10) === 2 ? 2 : 1;

  const [inputTx, setInputTx] = useState(initialTx);
  const [centerTxId, setCenterTxId] = useState(parseInt(initialTx, 10) || 230425980);
  const [depth, setDepth] = useState<number>(initialDepth);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = (txId: number, d: number) => {
    setLoading(true);
    setError(null);
    api
      .getTransactionGraph(txId, d)
      .then((res) => {
        setGraphData(res);
        const center = res.nodes.find((n) => n.is_center) || res.nodes[0] || null;
        setSelectedNode(center);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (centerTxId) {
      fetchGraph(centerTxId, depth);
    }
  }, [centerTxId, depth]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputTx.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      setCenterTxId(parsed);
      setSearchParams({ tx: parsed.toString(), depth: depth.toString() });
    }
  };

  const handleDepthChange = (newDepth: number) => {
    setDepth(newDepth);
    setSearchParams({ tx: centerTxId.toString(), depth: newDepth.toString() });
  };

  return (
    <div className="flex flex-col lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden text-ink">
      {/* Explorer Control Toolbar */}
      <div className="bg-surface/95 border-b border-line px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 font-semibold text-sm text-ink">
            <Network className="w-4 h-4 text-accent" />
            <span>Graph Explorer</span>
          </div>

          {/* Center TX Search */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              aria-label="Center transaction ID"
              placeholder="Center TX ID..."
              value={inputTx}
              onChange={(e) => setInputTx(e.target.value)}
              className="w-36 sm:w-40 h-8 px-2.5 text-xs bg-inset border border-line-strong rounded-lg font-mono text-ink placeholder-ink-muted focus:outline-none focus:border-[var(--accent-primary)] tabular-nums"
            />
            <button type="submit" className="btn-secondary min-h-[32px] py-1 px-3 text-xs">
              Trace
            </button>
          </form>

          {/* Hop Segmented Control */}
          <div className="inline-flex items-center bg-inset border border-line-strong rounded-lg p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleDepthChange(1)}
              className={`px-3 py-1 rounded-md transition-colors ${
                depth === 1
                  ? 'bg-accent text-[var(--accent-ink)] font-semibold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              1 Hop
            </button>
            <button
              type="button"
              onClick={() => handleDepthChange(2)}
              className={`px-3 py-1 rounded-md transition-colors ${
                depth === 2
                  ? 'bg-accent text-[var(--accent-ink)] font-semibold'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              2 Hops
            </button>
          </div>
        </div>

        {/* Subgraph Counters */}
        {graphData && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted font-mono tabular-nums">
            <span>
              Nodes: <strong className="text-ink">{graphData.metadata.total_nodes}</strong>
            </span>
            <span>
              Edges: <strong className="text-ink">{graphData.metadata.total_edges}</strong>
            </span>
            <span className="text-signal-illicit">
              Illicit: <strong>{graphData.metadata.illicit_count}</strong>
            </span>
            {graphData.metadata.truncated && (
              <span className="badge-pill badge-accent">Bounded (max {graphData.metadata.max_limit})</span>
            )}
          </div>
        )}
      </div>

      {/* Main Workspace: Responsive Graph Canvas + Node Inspector */}
      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
        {/* Canvas Container */}
        <div className="flex-1 min-h-[430px] h-[56vh] lg:h-full p-3">
          {loading ? (
            <div className="w-full h-full panel-inset flex items-center justify-center">
              <div className="text-center space-y-2.5 font-mono">
                <div className="w-7 h-7 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-xs text-ink-muted">
                  Traversing {depth}-hop Bitcoin neighborhood...
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="w-full h-full panel-inset flex items-center justify-center p-6">
              <div className="max-w-md panel-surface p-5 border-[var(--signal-illicit-border)] space-y-3 font-mono text-xs">
                <div className="font-semibold text-signal-illicit flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Graph Traversal Notice</span>
                </div>
                <p className="text-ink-secondary font-sans">{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setInputTx('230425980');
                    setCenterTxId(230425980);
                    setSearchParams({ tx: '230425980', depth: depth.toString() });
                  }}
                  className="btn-secondary text-xs"
                >
                  Load Sample Transaction #230425980
                </button>
              </div>
            </div>
          ) : graphData ? (
            <CytoscapeCanvas
              nodes={graphData.nodes}
              edges={graphData.edges}
              centerTransactionId={centerTxId}
              onNodeClick={(node) => setSelectedNode(node)}
            />
          ) : null}
        </div>

        {/* Selected Node Side Inspector Drawer */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-line bg-surface lg:h-full overflow-y-auto p-5 space-y-4 flex-shrink-0">
          <div className="pb-3 border-b border-line">
            <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Node Inspector
            </div>
            <h2 className="text-[15px] font-semibold text-ink mt-0.5">
              Selected Entity Attributes
            </h2>
          </div>

          {selectedNode ? (
            <div className="space-y-4 font-mono">
              <div className="panel-inset p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-ink-muted">
                  Transaction ID
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-ink tabular-nums">
                    TX #{selectedNode.transaction_id}
                  </span>
                  {selectedNode.is_center && (
                    <span className="badge-pill badge-accent">ORIGIN</span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-line text-xs tabular-nums">
                <div className="flex justify-between py-2">
                  <span className="text-ink-muted">Hop Distance</span>
                  <span className="font-semibold text-ink">
                    {selectedNode.hop_level === 0 ? 'Origin (0)' : `${selectedNode.hop_level} Hop`}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-ink-muted">Snapshot Step</span>
                  <span className="font-semibold text-ink">Step {selectedNode.time_step}</span>
                </div>
                <div className="flex justify-between py-2 items-center">
                  <span className="text-ink-muted">Ground Truth</span>
                  <LabelBadge label={selectedNode.label} />
                </div>
                <div className="flex justify-between py-2 items-center">
                  <span className="text-ink-muted">ML Prediction</span>
                  {selectedNode.prediction ? (
                    <LabelBadge label={selectedNode.prediction} isPrediction />
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-ink-muted">P(Illicit)</span>
                  <span className="font-semibold text-ink">
                    {selectedNode.probability !== null && selectedNode.probability !== undefined
                      ? `${(selectedNode.probability * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-2 items-center">
                  <span className="text-ink-muted">Risk Assessment</span>
                  <RiskBadge score={selectedNode.risk_score} level={selectedNode.risk_level} />
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-ink-muted">Flow Degree</span>
                  <span className="text-ink-secondary">
                    {selectedNode.in_degree}↓ {selectedNode.out_degree}↑
                  </span>
                </div>
              </div>

              <div className="pt-2 space-y-2 font-sans">
                <button
                  type="button"
                  onClick={() => navigate(`/transactions/${selectedNode.transaction_id}`)}
                  className="btn-primary w-full"
                >
                  <span>Open Full Dossier</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {!selectedNode.is_center && (
                  <button
                    type="button"
                    onClick={() => {
                      const nextId = selectedNode.transaction_id;
                      setInputTx(nextId.toString());
                      setCenterTxId(nextId);
                      setSearchParams({ tx: nextId.toString(), depth: depth.toString() });
                    }}
                    className="btn-secondary w-full"
                  >
                    Center Graph Here
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-ink-muted text-xs font-mono">
              Click any node inside the graph canvas to inspect its forensic telemetry.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
