import React, { useEffect, useId, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { GraphNode, GraphEdge } from '../../types/api';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useMotion } from '../../context/MotionContext';

interface CytoscapeCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerTransactionId: number;
  onNodeClick: (node: GraphNode) => void;
}

type LayoutMode = 'concentric' | 'breadthfirst' | 'cose';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.5;

function safeGraphData(nodes: GraphNode[], edges: GraphEdge[]) {
  const nodeIds = new Set<string>();
  const graphNodes = nodes.filter((node) => {
    if (!node.id || !Number.isSafeInteger(node.transaction_id) || node.transaction_id <= 0 || nodeIds.has(node.id)) return false;
    nodeIds.add(node.id);
    return true;
  }).sort((a, b) => a.hop_level - b.hop_level || a.transaction_id - b.transaction_id);
  const elementIds = new Set(nodeIds);
  const graphEdges = edges.filter((edge) => {
    if (!edge.id || elementIds.has(edge.id) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;
    elementIds.add(edge.id);
    return true;
  });
  return { nodes: graphNodes, edges: graphEdges };
}

function layoutOptions(mode: LayoutMode, cy: cytoscape.Core, animate: boolean): cytoscape.LayoutOptions {
  const common = { animate, animationDuration: 260, fit: true, padding: 36, nodeDimensionsIncludeLabels: true };
  if (mode === 'breadthfirst') {
    return {
      ...common,
      name: 'breadthfirst',
      // Hop arrangement traverses both directions; recorded edge arrows are never reversed.
      directed: false,
      roots: cy.nodes().filter((node) => node.data('isCenter')).map((node) => node.id()),
      spacingFactor: 1.35,
      avoidOverlap: true,
    };
  }
  if (mode === 'cose') {
    return { ...common, name: 'cose', animate: false, randomize: false, nodeRepulsion: () => 9000, idealEdgeLength: () => 110, nodeOverlap: 24 };
  }
  return {
    ...common,
    name: 'concentric',
    concentric: (node: cytoscape.NodeSingular) => node.data('isCenter') ? 3 : 3 - Math.min(2, node.data('hop')),
    levelWidth: () => 1,
    minNodeSpacing: 55,
    avoidOverlap: true,
  };
}

export const CytoscapeCanvas: React.FC<CytoscapeCanvasProps> = ({
  nodes,
  edges,
  centerTransactionId,
  onNodeClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const selectedIdRef = useRef('');
  const graphIdentityRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[]; center: number } | null>(null);
  const fitOnResizeRef = useRef(true);
  const firstLayoutRef = useRef(true);
  const helpId = useId();
  const { theme } = useTheme();
  const { motionEnabled } = useMotion();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('concentric');
  const [selectedId, setSelectedId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [canvasError, setCanvasError] = useState(false);
  const [reload, setReload] = useState(0);

  const { nodes: graphNodes, edges: graphEdges } = safeGraphData(nodes, edges);
  const omittedItems = nodes.length + edges.length - graphNodes.length - graphEdges.length;
  const hasOrigin = graphNodes.some((node) => node.transaction_id === centerTransactionId);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    if (!containerRef.current) return;
    const { nodes: graphNodes, edges: graphEdges } = safeGraphData(nodes, edges);
    const styles = getComputedStyle(document.documentElement);
    const val = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;
    const cIllicit = val('--signal-illicit', '#f58c8c');
    const cLicit = val('--signal-licit', '#89cdb3');
    const cUnknown = val('--signal-unknown', '#9aaab5');
    const cAccent = val('--accent-primary', '#b7e4ce');
    const cInk = val('--ink-primary', '#eaf0ed');
    const cEdge = val('--graph-edge', '#425b51');
    const cSurface = val('--graph-bg', '#0c1014');
    const origin = graphNodes.find((node) => node.transaction_id === centerTransactionId);
    const previous = graphIdentityRef.current;
    const sameGraph = previous?.nodes === nodes && previous.edges === edges && previous.center === centerTransactionId;
    const selection = (sameGraph ? graphNodes.find((node) => node.id === selectedIdRef.current) : null) ?? origin;
    graphIdentityRef.current = { nodes, edges, center: centerTransactionId };
    selectedIdRef.current = selection?.id ?? '';
    setSelectedId(selectedIdRef.current);
    setCanvasError(false);
    firstLayoutRef.current = true;
    fitOnResizeRef.current = true;

    const elements: cytoscape.ElementDefinition[] = graphNodes.map((node, index) => {
      const isCenter = node.transaction_id === centerTransactionId;
      const hop = Number.isFinite(node.hop_level) ? Math.max(1, Math.min(2, node.hop_level)) : 1;
      const angle = (index / Math.max(1, graphNodes.length)) * Math.PI * 2;
      return {
        group: 'nodes',
        selected: node.id === selectedIdRef.current,
        position: { x: isCenter ? 0 : Math.cos(angle) * 140 * hop, y: isCenter ? 0 : Math.sin(angle) * 140 * hop },
        data: {
          id: node.id,
          label: `#${node.transaction_id}`,
          txData: node,
          isCenter,
          hop,
          predictedIllicit: node.prediction === 'ILLICIT' && node.label !== 'ILLICIT',
          bgColor: node.label === 'ILLICIT' ? cIllicit : node.label === 'LICIT' ? cLicit : cUnknown,
          size: isCenter ? 46 : 34,
        },
      };
    });
    // A bounded response can contain unresolved endpoints. Never invent their node metadata.
    elements.push(...graphEdges.map((edge): cytoscape.ElementDefinition => ({
      group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target },
    })));

    let cy: cytoscape.Core;
    try {
      cy = cytoscape({
        container: containerRef.current,
        elements,
        selectionType: 'single',
        boxSelectionEnabled: false,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(bgColor)',
              'border-color': cSurface,
              'border-width': 3,
              label: 'data(label)',
              color: cInk,
              'font-family': 'IBM Plex Mono, monospace',
              'font-size': 12,
              'font-weight': 500,
              'text-valign': 'bottom',
              'text-margin-y': 8,
              'text-background-color': cSurface,
              'text-background-opacity': 0.92,
              'text-background-padding': '3px',
              'text-background-shape': 'roundrectangle',
              width: 'data(size)',
              height: 'data(size)',
              'overlay-padding': 8,
            },
          },
          { selector: 'node[?predictedIllicit]', style: { shape: 'diamond', 'border-color': cIllicit, 'border-style': 'dashed' } },
          { selector: 'node[?isCenter]', style: { 'border-width': 4, 'border-color': cAccent, 'border-style': 'solid', 'font-size': 13, 'font-weight': 600 } },
          { selector: 'node:selected', style: { 'overlay-color': cAccent, 'overlay-opacity': 0.12, 'border-width': 4 } },
          {
            selector: 'edge',
            style: {
              width: 1.8,
              'line-color': cEdge,
              'target-arrow-color': cEdge,
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'arrow-scale': 1.1,
              opacity: 0.8,
            },
          },
          { selector: 'edge:selected', style: { 'line-color': cAccent, 'target-arrow-color': cAccent, width: 2.5, opacity: 1 } },
        ],
        layout: { name: 'preset' },
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
    } catch {
      setCanvasError(true);
      return;
    }
    cyRef.current = cy;
    const updateZoom = () => {
      const current = cy.zoom();
      if (Number.isFinite(current)) setZoom(current);
    };
    cy.on('zoom', updateZoom);
    cy.on('dragpan scrollzoom pinchzoom grab', () => { fitOnResizeRef.current = false; });
    cy.on('tap', 'node', (event) => {
      const nodeData = event.target.data('txData') as GraphNode;
      if (!nodeData) return;
      selectedIdRef.current = event.target.id();
      setSelectedId(selectedIdRef.current);
      onNodeClickRef.current(nodeData);
    });

    let frame = 0;
    let width = 0;
    let height = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (cy.destroyed() || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || (rect.width === width && rect.height === height)) return;
        width = rect.width;
        height = rect.height;
        cy.resize();
        if (fitOnResizeRef.current && cy.nodes().length) cy.fit(cy.elements(), 36);
        updateZoom();
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(containerRef.current);
    window.addEventListener('resize', resize);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      cy.destroy();
      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [nodes, edges, centerTransactionId, theme, reload]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !cy.nodes().length) return;
    const animate = !firstLayoutRef.current && motionEnabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    firstLayoutRef.current = false;
    fitOnResizeRef.current = true;
    cy.stop();
    const layout = cy.layout(layoutOptions(layoutMode, cy, animate));
    const frame = requestAnimationFrame(() => {
      if (cy.destroyed()) return;
      try { layout.run(); } catch { setCanvasError(true); }
    });
    return () => { cancelAnimationFrame(frame); layout.stop(); };
  }, [layoutMode, motionEnabled, nodes, edges, centerTransactionId, theme, reload]);

  const changeZoom = (factor: number) => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !cy.nodes().length || !Number.isFinite(factor)) return;
    const current = Number.isFinite(cy.zoom()) ? cy.zoom() : 1;
    const level = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor));
    const width = cy.width();
    const height = cy.height();
    if (!Number.isFinite(level) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    fitOnResizeRef.current = false;
    cy.stop();
    cy.zoom({ level, renderedPosition: { x: width / 2, y: height / 2 } });
  };
  const handleFit = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !cy.nodes().length) return;
    fitOnResizeRef.current = true;
    cy.stop();
    cy.resize();
    cy.fit(cy.elements(), 36);
  };
  const handleReset = () => {
    const cy = cyRef.current;
    if (!cy || cy.destroyed() || !cy.nodes().length) return;
    fitOnResizeRef.current = true;
    cy.stop();
    try { cy.layout(layoutOptions(layoutMode, cy, false)).run(); } catch { setCanvasError(true); }
  };
  const disabled = canvasError || graphNodes.length === 0;

  return (
    <div
      role="group"
      aria-label={`Transaction graph for #${centerTransactionId}`}
      className="flex h-full w-full min-w-0 flex-col overflow-x-hidden overflow-y-auto rounded-xl border border-line"
      style={{ backgroundColor: 'var(--graph-bg)' }}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface p-3">
        <div className="segmented-control max-w-full" role="group" aria-label="Graph layout">
          {([
            { id: 'concentric', label: 'Radial' },
            { id: 'breadthfirst', label: 'Tree' },
            { id: 'cose', label: 'Cluster' },
          ] as const).map((mode) => (
            <button key={mode.id} type="button" aria-pressed={layoutMode === mode.id} disabled={disabled} onClick={() => setLayoutMode(mode.id)} style={{ minHeight: 44 }}>
              {mode.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Graph viewport controls">
          <button type="button" onClick={() => changeZoom(1.25)} title="Zoom in" aria-label="Zoom in" disabled={disabled || zoom >= MAX_ZOOM - 0.001} className="icon-button"><ZoomIn size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => changeZoom(0.8)} title="Zoom out" aria-label="Zoom out" disabled={disabled || zoom <= MIN_ZOOM + 0.001} className="icon-button"><ZoomOut size={18} aria-hidden="true" /></button>
          <button type="button" onClick={handleFit} title="Fit graph" aria-label="Fit graph to canvas" disabled={disabled} className="icon-button"><Maximize2 size={17} aria-hidden="true" /></button>
          <button type="button" onClick={handleReset} title="Reset layout" aria-label="Reset graph layout" disabled={disabled} className="icon-button"><RotateCcw size={17} aria-hidden="true" /></button>
          <span className="min-w-[45px] text-center font-mono text-[12px] tabular-nums text-ink-muted">{Math.round(zoom * 100)}%<span className="sr-only"> zoom</span></span>
        </div>
      </div>

      <div className="relative min-h-[160px] min-w-0 flex-1">
        <div
          ref={containerRef}
          role="img"
          aria-label={`${graphNodes.length} transaction nodes and ${graphEdges.length} directed edges`}
          aria-describedby={helpId}
          tabIndex={disabled ? -1 : 0}
          className="absolute inset-0 focus-visible:outline-offset-[-3px]"
          onKeyDown={(event) => {
            const cy = cyRef.current;
            if (!cy || disabled) return;
            if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(1.25); }
            else if (event.key === '-') { event.preventDefault(); changeZoom(0.8); }
            else if (event.key === '0') { event.preventDefault(); handleFit(); }
            else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
              event.preventDefault();
              fitOnResizeRef.current = false;
              cy.panBy({ x: event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0, y: event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0 });
            }
          }}
        />
        {(canvasError || graphNodes.length === 0) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-inset p-5 text-center text-sm text-ink-muted" role={canvasError ? 'alert' : 'status'}>
            <p>{canvasError ? 'The graph could not be drawn in this browser.' : 'No transaction nodes were returned.'}</p>
            {canvasError && <button type="button" className="btn-secondary" onClick={() => setReload((value) => value + 1)}>Retry graph display</button>}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-secondary" role="group" aria-label="Graph legend">
          <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-accent" aria-hidden="true" />Origin</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-signal-illicit" aria-hidden="true" />Dataset illicit</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-signal-licit" aria-hidden="true" />Dataset licit</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-signal-unknown" aria-hidden="true" />Unknown</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rotate-45 border border-dashed border-signal-illicit" aria-hidden="true" />Predicted illicit</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor={`${helpId}-node`} className="text-[12px] text-ink-secondary">Inspect transaction</label>
          <select
            id={`${helpId}-node`}
            value={graphNodes.some((node) => node.id === selectedId) ? selectedId : ''}
            disabled={graphNodes.length === 0}
            className="field-input min-w-0 flex-1 font-mono sm:max-w-[280px]"
            style={{ minWidth: 140 }}
            onChange={(event) => {
              const node = graphNodes.find((item) => item.id === event.target.value);
              if (!node) return;
              selectedIdRef.current = node.id;
              setSelectedId(node.id);
              const cy = cyRef.current;
              if (cy && !cy.destroyed()) { cy.elements().unselect(); cy.getElementById(node.id).select(); }
              onNodeClick(node);
            }}
          >
            <option value="" disabled>Select a graph node</option>
            {graphNodes.map((node) => <option key={node.id} value={node.id}>#{node.transaction_id}{node.transaction_id === centerTransactionId ? ' (origin)' : ` (${node.hop_level}-hop)`}</option>)}
          </select>
        </div>
        <p id={helpId} className="sr-only">Select a node to inspect its returned data. Arrowheads show recorded flow direction, including in Tree layout. Focus the canvas to pan with arrow keys, zoom with plus or minus, and fit with zero.</p>
        {omittedItems > 0 && <p role="status" className="text-[12px] leading-relaxed text-ink-muted">{omittedItems} unresolved or duplicate graph {omittedItems === 1 ? 'item is' : 'items are'} not drawn. No missing node data has been inferred.</p>}
        {!hasOrigin && graphNodes.length > 0 && <p role="status" className="text-[12px] text-ink-muted">The requested origin was not returned in this graph.</p>}
      </div>
    </div>
  );
};
