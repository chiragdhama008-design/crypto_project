import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Network, ArrowUpRight, ArrowRight, Search, Info, PanelRightClose, PanelRightOpen, ScanLine, Layers, RefreshCw, GitBranch } from 'lucide-react';
import { api } from '../services/api';
import type { GraphResponse, GraphNode, TransactionSummary } from '../types/api';
import { CytoscapeCanvas } from '../components/graph/CytoscapeCanvas';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { NetworkMotif } from '../components/common/NetworkMotif';

function transactionId(value: string) {
  const trimmed = value.trim();
  const number = Number(trimmed);
  return /^[1-9]\d*$/.test(trimmed) && Number.isSafeInteger(number) ? number : null;
}

export function GraphExplorer() {
  const [params, setParams] = useSearchParams();
  const rawId = params.get('tx') || '';
  const centerId = transactionId(rawId);
  const depth = params.get('depth') === '2' ? 2 : 1;
  const [inputDraft, setInputDraft] = useState({ source: rawId, value: rawId });
  const inputTx = inputDraft.source === rawId ? inputDraft.value : rawId;
  const [selection, setSelection] = useState<{ key: string; nodeId: string } | null>(null);
  const [suggestions, setSuggestions] = useState<TransactionSummary[]>([]);
  const [indexAvailable, setIndexAvailable] = useState<boolean | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [revision, setRevision] = useState(0);
  const requestKey = `${centerId}:${depth}:${revision}`;
  const [result, setResult] = useState<{ key: string; graph: GraphResponse | null; error: string | null }>({ key: '', graph: null, error: null });
  const loading = !!centerId && result.key !== requestKey;
  const graph = !centerId || loading ? null : result.graph;
  const error = !centerId || loading ? null : result.error;
  const selected = (selection?.key === requestKey ? graph?.nodes.find((node) => node.id === selection.nodeId) : null) || graph?.nodes.find((node) => node.is_center) || graph?.nodes[0] || null;
  const validationError = inputError || (rawId && !centerId && inputTx === rawId ? 'Enter a positive, whole-number transaction ID.' : null);
  function selectNode(node: GraphNode | null) { setSelection(node ? { key: requestKey, nodeId: node.id } : null); }

  useEffect(() => {
    const controller = new AbortController();
    api.getTransactions({ limit: 3 }, controller.signal).then((result) => { if (!controller.signal.aborted) { setSuggestions(result.transactions); setIndexAvailable(result.total > 0); } }).catch(() => { if (!controller.signal.aborted) setIndexAvailable(null); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!centerId) return;
    const controller = new AbortController();
    api.getTransactionGraph(centerId, depth, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setResult({ key: requestKey, graph: result, error: null });
    }).catch((reason: Error) => { if (!controller.signal.aborted) setResult({ key: requestKey, graph: null, error: reason.message }); });
    return () => controller.abort();
  }, [centerId, depth, requestKey]);

  function trace(id: number) { setInputError(null); setParams({ tx: String(id), depth: String(depth) }); if (id === centerId) setRevision((value) => value + 1); }
  function submit(event: FormEvent) { event.preventDefault(); const id = transactionId(inputTx); if (!id) setInputError('Enter a positive, whole-number transaction ID.'); else trace(id); }
  function changeDepth(value: number) { const next = new URLSearchParams(params); next.set('depth', String(value)); setParams(next); }
  const probability = selected?.probability;

  return <div className="workspace-page space-y-6">
    <PageHeader eyebrow="Transaction relationships" title="Graph explorer" subtitle="Trace a transaction through its neighborhood. Keep the connections in view while you inspect the signals." actions={<Link to="/transactions" className="btn-secondary"><Layers size={15} />Browse transactions</Link>} />

    <section className="panel-surface overflow-hidden" aria-label="Graph tracing controls">
      <div className="filter-bar border-b-0 gap-4">
        <form onSubmit={submit} className="flex flex-1 basis-[340px] gap-2 min-w-0"><div className="filter-search"><Search size={15} /><label className="sr-only" htmlFor="graph-transaction">Center transaction ID</label><input id="graph-transaction" className="field-input font-mono text-xs" inputMode="numeric" autoComplete="off" value={inputTx} onChange={(event) => { setInputDraft({ source: rawId, value: event.target.value }); setInputError(null); }} placeholder="Enter an indexed transaction ID" aria-invalid={!!validationError} aria-describedby={validationError ? 'graph-input-error' : undefined} /></div><button type="submit" className="btn-primary" disabled={loading}>{loading ? <RefreshCw size={14} className="animate-spin" /> : <ScanLine size={15} />}Trace</button></form>
        <div className="segmented-control" aria-label="Neighborhood depth"><button type="button" aria-pressed={depth === 1} onClick={() => changeDepth(1)}>1 hop</button><button type="button" aria-pressed={depth === 2} onClick={() => changeDepth(2)}>2 hops</button></div>
        <button type="button" className="btn-ghost" aria-expanded={inspectorOpen} aria-controls="graph-inspector" onClick={() => setInspectorOpen((value) => !value)}>{inspectorOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}Inspector</button>
      </div>
      {validationError && <p id="graph-input-error" role="alert" className="px-5 pb-4 text-xs text-signal-illicit">{validationError}</p>}
    </section>

    {graph?.metadata.truncated && <div className="data-note"><Info size={15} /><p>This is a bounded neighborhood, capped at {graph.metadata.max_limit} nodes. Connections outside the extracted graph are not shown.</p></div>}
    <div className={`graph-workspace ${inspectorOpen ? '' : 'inspector-hidden'}`}>
      <section className="panel-surface overflow-hidden min-w-0" aria-label="Transaction network">
        <div className="section-bar border-b border-line flex-wrap"><div className="flex items-center gap-2.5"><Network size={17} className="text-accent" /><h2 className="section-heading">{centerId ? `Transaction #${centerId}` : 'Transaction network'}</h2>{centerId && <span className="badge-pill badge-accent">{depth}-Hop Flow</span>}</div>{graph && <div className="flex items-center gap-4 text-[11px] text-ink-muted tabular-nums"><span>{graph.nodes.length} nodes</span><span>{graph.edges.length} edges</span></div>}</div>
        <div className="graph-stage">
          {loading ? <div className="h-full flex flex-col justify-center items-center gap-4" role="status"><RefreshCw size={24} className="text-accent animate-spin" /><p className="text-xs text-ink-muted">Tracing the {depth}-hop neighborhood...</p></div> : error ? <div className="h-full flex flex-col justify-center"><EmptyState tone="error" title="This graph is unavailable" description={`${error}. Graph exploration needs an indexed transaction and its relationships.`} actionLabel="Retry trace" onAction={() => setRevision((value) => value + 1)} /><Link to="/dataset" className="text-link self-center">Review dataset setup<ArrowUpRight size={14} /></Link></div> : graph && centerId ? graph.nodes.length > 0 ? <CytoscapeCanvas nodes={graph.nodes} edges={graph.edges} centerTransactionId={centerId} onNodeClick={selectNode} /> : <EmptyState title="No graph nodes returned" description="The graph service did not return a neighborhood for this transaction." /> : <div className="graph-start"><NetworkMotif /><div><span className="badge-pill badge-unknown">Start a trace</span><h3>One transaction.<br />The bigger picture.</h3><p>Enter an indexed transaction ID to explore its directed connections. Choose two hops to follow the next layer of relationships.</p>{suggestions.length > 0 ? <div className="mt-5 flex flex-wrap gap-2">{suggestions.map((tx) => <button type="button" key={tx.transaction_id} onClick={() => trace(tx.transaction_id)} className="btn-secondary font-mono text-xs">#{tx.transaction_id}<ArrowRight size={13} /></button>)}</div> : <Link to={indexAvailable === false ? '/dataset' : '/transactions'} className="text-link mt-4">{indexAvailable === false ? 'Review dataset setup' : 'Find an indexed transaction'}<ArrowUpRight size={14} /></Link>}</div></div>}
        </div>
      </section>

      {inspectorOpen && <aside id="graph-inspector" className="panel-surface graph-inspector" aria-label="Selected transaction inspector">
        <div className="flex items-center justify-between mb-6"><div><p className="text-[10px] text-ink-muted mb-1">Selected transaction</p><h2 className="section-heading">Inspector</h2></div><ScanLine size={18} className="text-ink-muted" /></div>
        {selected && graph ? <>
          <label className="field-label" htmlFor="graph-node-selector">Choose a node</label><select id="graph-node-selector" className="field-input font-mono text-xs mb-5" value={selected.id} onChange={(event) => selectNode(graph.nodes.find((node) => node.id === event.target.value) || null)}>{graph.nodes.map((node) => <option key={node.id} value={node.id}>#{node.transaction_id}{node.is_center ? ' / origin' : ` / hop ${node.hop_level}`}</option>)}</select>
          <div className="flex justify-between gap-2 items-center mb-5"><span className="font-mono text-sm">#{selected.transaction_id}</span>{selected.is_center && <span className="badge-pill badge-accent">Origin</span>}</div>
          <dl className="divide-y divide-line text-[12px]">
            <div className="inspector-row"><dt>Hop distance</dt><dd>{selected.hop_level}</dd></div><div className="inspector-row"><dt>Timestep</dt><dd>{selected.time_step}</dd></div><div className="inspector-row"><dt>Ground truth</dt><dd><LabelBadge label={selected.label} /></dd></div><div className="inspector-row"><dt>Prediction</dt><dd>{selected.prediction ? <LabelBadge label={selected.prediction} isPrediction /> : 'Unavailable'}</dd></div><div className="inspector-row"><dt>Illicit probability</dt><dd>{probability == null ? 'Unavailable' : `${(probability * 100).toFixed(1)}%`}</dd></div><div className="inspector-row"><dt>Stored risk</dt><dd><RiskBadge score={selected.risk_score} level={selected.risk_level} /></dd></div><div className="inspector-row"><dt>Connections</dt><dd>{selected.in_degree} in / {selected.out_degree} out</dd></div>
          </dl><div className="space-y-2 mt-6"><Link to={`/transactions/${selected.transaction_id}`} className="btn-primary w-full">Open investigation<ArrowUpRight size={14} /></Link>{!selected.is_center && <button type="button" className="btn-secondary w-full" onClick={() => trace(selected.transaction_id)}>Center graph here<GitBranch size={14} /></button>}</div>
        </> : <div className="inspector-start"><div className="empty-state-icon"><ScanLine size={24} strokeWidth={1.4} /></div><h3>Keep the context close.</h3><p>After a trace, select a node to inspect its label, model signals, risk, and connections.</p><div className="mt-8 pt-5 border-t border-line space-y-4 text-left">{['Choose an indexed transaction', 'Explore one or two hops', 'Select a node to investigate'].map((item, i) => <div key={item} className="flex items-center gap-3 text-[11px] text-ink-muted"><span className="workspace-monogram w-6 h-6">{i + 1}</span>{item}</div>)}</div></div>}
      </aside>}
    </div>
    <p className="workspace-disclaimer"><Info size={12} />Graph connections establish relationships, not guilt. Unknown labels and unavailable predictions do not imply benign activity.</p>
  </div>;
}
