import React from 'react';
import { BookOpen, Shield, Network, Cpu, AlertTriangle, Layers, ArrowRight, Terminal } from 'lucide-react';

export const Methodology: React.FC = () => {
  return (
    <div className="p-5 space-y-4 max-w-4xl mx-auto font-sans text-[#eff1f6]">
      {/* Header - LeetCode Style */}
      <div className="border-b border-[#333333] pb-3 font-mono">
        <div className="flex items-center space-x-2">
          <h1 className="text-base font-bold text-[#eff1f6] tracking-tight">System Specification & Methodology</h1>
          <span className="text-[10px] bg-[#ffa116]/15 text-[#ffa116] border border-[#ffa116]/30 px-2 py-0.5 rounded font-bold">
            RFC SPEC
          </span>
        </div>
        <p className="text-xs text-[#8c8c8c] mt-0.5">
          Core architectural philosophy, algorithmic design, and investigative limitations
        </p>
      </div>

      {/* Principle Quote */}
      <div className="p-3.5 bg-[#262626] border-l-4 border-[#ffa116] rounded-r border-y border-r border-[#333333] font-mono">
        <div className="font-bold text-[#ffa116] text-sm">
          "Don't search for the crime. Let the network reveal it."
        </div>
        <p className="text-[#d1d5db] text-xs mt-1 font-sans">
          TRACE-X replaces traditional single-address keyword searches with end-to-end network flow topology,
          machine-learned behavioral anomaly detection, and multi-hop taint exposure analytics.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-3 font-mono">
        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">1</span>
            <span>Data Collection & Pluggable Ingestion</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            The system is built on a pluggable data source abstraction (<code className="font-mono text-[#ffa116] bg-[#1a1a1a] px-1 py-0.5 rounded">BaseCryptoDataSource</code>).
            For the current production MVP, the engine operates on the Elliptic Bitcoin Transaction Graph (203,769 transactions, 234,355 directed edges,
            and 165 standardized features partitioned across 49 discrete bi-weekly time steps).
            The architecture is designed to integrate Ethereum, Sanctions lists, and exchange APIs without re-architecting data pipelines.
          </p>
        </section>

        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">2</span>
            <span>Graph Construction & Money Tree Topology</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            Transactions represent directed graph nodes where edges designate fund flows from inputs to outputs.
            1-hop and 2-hop subgraphs are indexed using high-speed B-tree indices on both source and destination transaction identifiers,
            allowing bounded sub-5ms graph traversals with safety bounding (100–150 nodes) to maintain smooth browser visualization.
          </p>
        </section>

        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">3</span>
            <span>Feature Normalization & Dimensioning</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            Each transaction contains 165 normalized features:
            <br />
            * <strong className="text-[#eff1f6]">Local Features (1 - 93):</strong> Direct transaction properties including fee rates, volume, input/output counts, and script structures.
            <br />
            * <strong className="text-[#eff1f6]">Neighborhood Aggregate Features (94 - 165):</strong> 1-hop aggregated metrics (mean, std, min, max) capturing behavioral patterns of immediate counterparties.
          </p>
        </section>

        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">4</span>
            <span>Graph Neural Networks (GNN) & GraphSAGE Message Passing</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            Conventional machine learning classifiers (Logistic Regression, Random Forest, Gradient Boosting) evaluate each transaction solely based on its individual tabular feature vector, ignoring the relational structure of the payment graph. In contrast, TRACE-X deploys a <strong className="text-[#eff1f6]">2-Layer GraphSAGE (Sample and Aggregate) Graph Neural Network</strong> that directly learns from both node properties and topological connectivity.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 pt-1 font-mono text-[11px]">
            <div className="p-2.5 bg-[#1e1e1e] rounded border border-[#333333] space-y-1">
              <span className="text-[#ffa116] font-bold">How GraphSAGE Operates:</span>
              <p className="text-[#8c8c8c] font-sans">
                Each node aggregates normalized feature embeddings from its 1-hop and 2-hop transaction neighbors via message passing:
                <code className="text-[#eff1f6] block bg-[#161616] p-1 rounded my-1 font-mono text-[10px]">h_v^(k) = σ(W · Concat(h_v^(k-1), AGG({'{h_u^(k-1) : u ∈ N(v)}'})))</code>
                This enables the network to detect laundering signatures such as peeling chains, multi-hop layering, and mule consolidation clusters even when individual feature values appear benign.
              </p>
            </div>
            <div className="p-2.5 bg-[#1e1e1e] rounded border border-[#333333] space-y-1">
              <span className="text-[#00b8a3] font-bold">Bidirectional Money Flow Semantics:</span>
              <p className="text-[#8c8c8c] font-sans">
                While Bitcoin transactions are directed from inputs to outputs, criminal forensics requires understanding both <strong className="text-[#eff1f6]">upstream provenance</strong> (where funds originated) and <strong className="text-[#eff1f6]">downstream dispersion</strong> (where funds consolidated). The GNN message-passing layer incorporates bidirectional flow context so node representations synthesize holistic network neighborhood dynamics.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">5</span>
            <span>Temporal Chronological Validation & Leakage Prevention</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            Random k-fold cross-validation introduces severe temporal data leakage in cryptocurrency graphs by training on future transactions to predict past events. TRACE-X strictly enforces a chronological evaluation protocol:
            <br />
            * <strong className="text-[#eff1f6]">Training Set:</strong> Timesteps 1–34 (29,894 labeled transactions; 3,462 illicit, 26,432 licit).
            <br />
            * <strong className="text-[#eff1f6]">Validation Set:</strong> Timesteps 35–39 (5,486 labeled transactions) used exclusively for early stopping and hyperparameter tuning.
            <br />
            * <strong className="text-[#eff1f6]">Future Test Set:</strong> Timesteps 40–49 (11,184 labeled transactions; 636 illicit, 10,548 licit) evaluated strictly once on unseen future activity.
            <br />
            * <strong className="text-[#eff1f6]">Graph Isolation Guarantee:</strong> In the Elliptic dataset, all 234,355 directed edges connect transactions confirmed within the exact same 3-hour timestep. Consequently, zero graph edges cross temporal splits, guaranteeing zero structural leakage between training and testing partitions.
          </p>
        </section>

        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">6</span>
            <span>Handling Unlabeled Transactions & Class Imbalance</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            Over 77% of Elliptic transactions (157,205 nodes) have unknown labels. In TRACE-X, unknown transactions are preserved in the graph topology to provide structural context during GNN message passing, but are strictly excluded from supervised loss calculation and evaluation metrics.
            To overcome extreme class imbalance (illicit transactions represent only ~5.7% of the test set), models are optimized with class-weighted CrossEntropy and evaluated primarily on <strong className="text-[#eff1f6]">Illicit Precision, Illicit Recall, Illicit F1, and PR-AUC</strong> rather than overall accuracy.
          </p>
        </section>

        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">7</span>
            <span>Deterministic Multi-Signal Composite Risk Scoring</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            Risk scores (0 - 100) are generated deterministically through a multi-factor composite formula:
            ML / GNN Probability Signal (55%), Graph Neighborhood Illicit Exposure (25%), Structural Degree Topology (10%), and Feature Outlier Deviations (10%).
            Scores map to 4 operational tiers: <span className="text-[#00b8a3] font-bold">LOW (0-30)</span>, <span className="text-[#ffc01e] font-bold">MEDIUM (31-60)</span>, <span className="text-[#ffa116] font-bold">HIGH (61-80)</span>, and <span className="text-[#ef4743] font-bold">CRITICAL (81-100)</span>.
            Confirmed illicit entities automatically enforce a minimum floor score of 90.
          </p>
        </section>

        <section className="bg-[#262626] p-3.5 rounded border border-[#333333] shadow-xs space-y-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#eff1f6] flex items-center space-x-2">
            <span className="w-4 h-4 rounded bg-[#1f1f1f] text-[#ffa116] border border-[#3e3e3e] flex items-center justify-center text-[10px]">8</span>
            <span>Forensic Limitations & Operational Safeguards</span>
          </h2>
          <p className="text-[#8c8c8c] text-xs leading-relaxed font-sans">
            Model predictions and risk scores are decision-support intelligence for certified investigators, not autonomous judicial determinations. Key limitations include:
            (1) Off-chain transactions and Lightning Network hops remain invisible to on-chain graphs;
            (2) CoinJoin mixers and obfuscation tools can distort neighborhood degree signals;
            (3) Predictions reflect statistical pattern recognition on confirmed historical datasets and should always be verified against counterparty subpoena records and blockchain explorer proofs.
          </p>
        </section>
      </div>
    </div>
  );
};
