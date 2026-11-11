import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { GraphNode, GraphEdge } from '../../types/api';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface CytoscapeCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerTransactionId: number;
  onNodeClick: (node: GraphNode) => void;
}

type LayoutMode = 'concentric' | 'breadthfirst' | 'cose';

export const CytoscapeCanvas: React.FC<CytoscapeCanvasProps> = ({
  nodes,
  edges,
  centerTransactionId,
  onNodeClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const { theme } = useTheme();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('concentric');

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    if (!containerRef.current) return;

    const styles = getComputedStyle(document.documentElement);
    const val = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback;

    const cIllicit = val('--signal-illicit', '#f05252');
    const cLicit = val('--signal-licit', '#14b8a6');
    const cUnknown = val('--signal-unknown', '#94a3b8');
    const cAccent = val('--accent-primary', '#e5a93b');
    const cInk = val('--ink-primary', '#eef2f6');
    const cEdge = val('--graph-edge', '#374354');
    const cSurface = val('--bg-surface', '#11161d');

    const elements: cytoscape.ElementDefinition[] = [];

    nodes.forEach((n) => {
      let bgColor = cUnknown;
      let borderColor = cEdge;

      if (n.label === 'ILLICIT' || n.prediction === 'ILLICIT') {
        bgColor = cIllicit;
        borderColor = cIllicit;
      } else if (n.label === 'LICIT') {
        bgColor = cLicit;
        borderColor = cLicit;
      }

      elements.push({
        group: 'nodes',
        data: {
          id: n.id,
          label: `#${n.id}`,
          txData: n,
          isCenter: n.is_center,
          bgColor,
          borderColor,
          size: n.is_center ? 38 : 24,
        },
      });
    });

    edges.forEach((e) => {
      elements.push({
        group: 'edges',
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
        },
      });
    });

    const layoutConfig: cytoscape.LayoutOptions =
      layoutMode === 'breadthfirst'
        ? {
            name: 'breadthfirst',
            directed: true,
            spacingFactor: 1.35,
            animate: false,
            roots: [`#${centerTransactionId}`],
          }
        : layoutMode === 'cose'
        ? {
            name: 'cose',
            animate: false,
            nodeRepulsion: () => 5000,
            idealEdgeLength: () => 75,
          }
        : {
            name: 'concentric',
            concentric: (node: cytoscape.NodeSingular) => (node.data('isCenter') ? 2 : 1),
            levelWidth: () => 1,
            minNodeSpacing: 58,
            animate: false,
          };

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(bgColor)',
            'border-color': cSurface,
            'border-width': 2.5,
            label: 'data(label)',
            color: cInk,
            'font-family': '"JetBrains Mono", monospace',
            'font-size': '9px',
            'font-weight': 500,
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-background-color': cSurface,
            'text-background-opacity': 0.72,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            width: 'data(size)',
            height: 'data(size)',
          },
        },
        {
          selector: 'node[?isCenter]',
          style: {
            'border-width': 4,
            'border-color': cAccent,
            'border-style': 'solid',
            'font-weight': 700,
            'font-size': '10px',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': cEdge,
            'target-arrow-color': cAccent,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.85,
            opacity: 0.85,
          },
        },
        {
          selector: ':selected',
          style: {
            'border-color': cAccent,
            'border-width': 4,
          },
        },
      ],
      layout: layoutConfig,
      minZoom: 0.2,
      maxZoom: 3.5,
    });

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data('txData') as GraphNode;
      if (nodeData) {
        onNodeClickRef.current(nodeData);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [nodes, edges, centerTransactionId, theme, layoutMode]);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => cyRef.current?.fit(undefined, 32);
  const handleReset = () => {
    if (cyRef.current) {
      cyRef.current.reset();
      cyRef.current.fit(undefined, 32);
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden border border-line rounded-xl"
      style={{ backgroundColor: 'var(--graph-bg)' }}
    >
      {/* Top-Left Layout Selector */}
      <div className="absolute top-3 left-3 z-10 inline-flex items-center bg-surface/90 backdrop-blur-md border border-line-strong rounded-lg p-1 shadow-panel font-mono text-[11px]">
        {(
          [
            { id: 'concentric', label: 'Radial' },
            { id: 'breadthfirst', label: 'Tree' },
            { id: 'cose', label: 'Cluster' },
          ] as Array<{ id: LayoutMode; label: string }>
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setLayoutMode(m.id)}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              layoutMode === m.id
                ? 'bg-accent text-[var(--accent-ink)] font-semibold'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Top-Right Canvas Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-surface/90 backdrop-blur-md border border-line-strong rounded-lg shadow-panel p-1">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom In"
          className="p-1.5 hover:bg-hoverbg rounded-md text-ink transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
          className="p-1.5 hover:bg-hoverbg rounded-md text-ink transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleFit}
          title="Fit Canvas"
          aria-label="Fit Graph to Canvas"
          className="p-1.5 hover:bg-hoverbg rounded-md text-ink transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          title="Reset View"
          aria-label="Reset Graph View"
          className="p-1.5 hover:bg-hoverbg rounded-md text-ink transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom-Left Compact Node Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-3 bg-surface/90 backdrop-blur-md border border-line-strong rounded-lg px-3 py-1.5 shadow-panel font-mono text-[10px] text-ink-secondary pointer-events-none">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-accent bg-inset" />
          <span>Center TX</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-signal-illicit" />
          <span>Illicit</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-signal-licit" />
          <span>Licit</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-signal-unknown" />
          <span>Unknown</span>
        </span>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
