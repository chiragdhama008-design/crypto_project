import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Cpu, Database, FileCheck2, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';

const PIPELINE = [
  { title: 'Source data', detail: 'Transaction features and directed fund-flow edges', icon: Database },
  { title: 'Selected model', detail: 'Tabular classification or two-hop GraphSAGE inference', icon: Cpu },
  { title: 'Composite risk', detail: 'Model probability, graph exposure and anomaly signals', icon: SlidersHorizontal },
  { title: 'Analyst review', detail: 'Indexed records, case notes and an integrity digest', icon: FileCheck2 },
];

export const Methodology: React.FC = () => {
  return (
    <div className="workspace-page space-y-6">
      <PageHeader
        title="Methodology"
        eyebrow="Research protocol"
        subtitle="How transaction data becomes an investigative lead."
        badges={[{ label: 'Research MVP', tone: 'unknown' }]}
        actions={<Link to="/models" className="btn-secondary">View evaluation<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>}
      />

      <section className="panel-surface space-y-6 p-5 sm:p-6" aria-labelledby="pipeline-heading">
        <div><h2 id="pipeline-heading" className="section-heading">From source to evidence</h2><p className="mt-1 text-sm text-ink-muted">The processing path, not a live system status</p></div>
        <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map(({ title, detail, icon: Icon }, index) => (
            <li key={title} className="relative flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              <div><h3 className="text-sm font-medium text-ink">{title}</h3><p className="mt-2 text-sm leading-relaxed text-ink-muted">{detail}</p></div>
              {index < PIPELINE.length - 1 && <svg viewBox="0 0 28 16" className="absolute -right-6 top-0.5 hidden h-4 w-6 xl:block" aria-hidden="true"><path d="M2 8H24M18 3L24 8L18 13" fill="none" stroke="var(--ink-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </li>
          ))}
        </ol>
      </section>

      <div className="divide-y divide-line">
        <section id="protocol-data" className="grid gap-5 py-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10" aria-labelledby="data-heading">
          <div className="space-y-2"><p className="text-xs text-ink-muted tabular-nums">01</p><h2 id="data-heading" className="section-heading">Data & labels</h2><p className="text-sm text-ink-muted">Preserve the dataset meaning.</p></div>
          <div className="space-y-5">
            <p className="max-w-3xl text-sm leading-relaxed text-ink">Elliptic represents Bitcoin transactions as nodes and fund transfers as directed edges. The reference corpus contains 203,769 transactions and 234,355 edges across 49 timesteps.</p>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><dt className="field-label">Source class 1</dt><dd className="text-sm font-medium text-ink">Illicit</dd><dd className="font-mono text-xs text-ink-muted">ILLICIT / 1</dd></div>
              <div className="space-y-2"><dt className="field-label">Source class 2</dt><dd className="text-sm font-medium text-ink">Licit</dd><dd className="font-mono text-xs text-ink-muted">LICIT / 0</dd></div>
              <div className="space-y-2"><dt className="field-label">Unknown, 3 or null</dt><dd className="text-sm font-medium text-ink">Unlabeled</dd><dd className="font-mono text-xs text-ink-muted">UNKNOWN / -1</dd></div>
            </dl>
            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div><p className="text-sm font-medium text-ink">93 local features</p><p className="mt-1 text-xs text-ink-muted">Transaction properties / <span className="font-mono">indices 0-92</span></p></div>
              <div><p className="text-sm font-medium text-ink">72 aggregate features</p><p className="mt-1 text-xs text-ink-muted">One-hop neighborhood summaries / <span className="font-mono">indices 93-164</span></p></div>
            </div>
            <p className="data-note">Unknown nodes remain in graph structure. They are never relabeled as licit and never enter supervised loss or evaluation metrics.</p>
          </div>
        </section>

        <section id="protocol-inference" className="grid gap-5 py-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10" aria-labelledby="inference-heading">
          <div className="space-y-2"><p className="text-xs text-ink-muted tabular-nums">02</p><h2 id="inference-heading" className="section-heading">Model inference</h2><p className="text-sm text-ink-muted">One selected model, a defined context.</p></div>
          <div className="grid min-w-0 gap-6 md:grid-cols-2">
            <div className="space-y-5">
              <p className="text-sm leading-relaxed text-ink">GraphSAGE uses two aggregation layers on deduplicated, undirected edges. Serving extracts a bounded two-hop neighborhood and preserves the queried transaction's position.</p>
              <dl className="divide-y divide-line text-sm">
                <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink">GraphSAGE</dt><dd className="text-right text-ink-muted">Graph + 165 features</dd></div>
                <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink">Gradient boosting</dt><dd className="text-right text-ink-muted">Boosted trees</dd></div>
                <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink">Random forest</dt><dd className="text-right text-ink-muted">Bagged trees</dd></div>
                <div className="flex justify-between gap-3 py-2.5"><dt className="text-ink">Logistic regression</dt><dd className="text-right text-ink-muted">Linear baseline</dd></div>
              </dl>
              <p className="data-note">Tabular models consume all 165 features, including neighborhood aggregates. Risk scoring does not blend all four classifiers.</p>
            </div>
            <div className="min-w-0 space-y-3">
              <svg viewBox="0 0 360 230" className="mx-auto h-auto w-full max-w-sm" role="img" aria-labelledby="receptive-field-title receptive-field-description">
                <title id="receptive-field-title">Two-hop GraphSAGE receptive field</title>
                <desc id="receptive-field-description">A queried center transaction connects to three first-hop neighbors, each connected to second-hop neighbors. Edges are undirected for message passing. This is a methodology schematic, not an indexed transaction graph.</desc>
                <g fill="none" stroke="var(--border-strong)" strokeWidth="1.5" strokeLinecap="round">
                  <path className="diagram-path" d="M180 108L108 65M180 108L252 70M180 108L180 165" stroke="var(--accent-primary)" />
                  <path className="diagram-path" d="M108 65L35 60M108 65L85 15M108 65L60 140M252 70L312 30M252 70L335 125M180 165L130 210M180 165L260 205" />
                </g>
                <g fill="var(--bg-inset)" stroke="var(--ink-muted)" strokeWidth="1.5">
                  <circle cx="35" cy="60" r="5" /><circle cx="85" cy="15" r="5" /><circle cx="60" cy="140" r="5" /><circle cx="312" cy="30" r="5" /><circle cx="335" cy="125" r="5" /><circle cx="130" cy="210" r="5" /><circle cx="260" cy="205" r="5" />
                </g>
                <g fill="var(--bg-surface)" stroke="var(--accent-primary)" strokeWidth="1.5"><circle cx="108" cy="65" r="8" /><circle cx="252" cy="70" r="8" /><circle cx="180" cy="165" r="8" /></g>
                <circle cx="180" cy="108" r="21" fill="var(--accent-soft)" />
                <circle cx="180" cy="108" r="11" fill="var(--accent-primary)" />
              </svg>
              <div className="chart-legend flex flex-wrap justify-center gap-4 text-xs text-ink-muted"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-accent" />Center</span><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full border border-accent" />1 hop</span><span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full border border-ink-muted" />2 hops</span></div>
              <p className="text-center text-xs text-ink-muted">Receptive-field schematic, not a transaction subgraph</p>
            </div>
            <p className="data-note md:col-span-2">Inference rejects non-finite or incorrectly sized vectors. Missing model artifacts stop the request rather than produce substitute predictions.</p>
          </div>
        </section>

        <section id="protocol-evaluation" className="grid gap-5 py-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10" aria-labelledby="evaluation-heading">
          <div className="space-y-2"><p className="text-xs text-ink-muted tabular-nums">03</p><h2 id="evaluation-heading" className="section-heading">Chronological evaluation</h2><p className="text-sm text-ink-muted">Earlier data trains. Later data tests.</p></div>
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-ink">Training, validation and testing occupy separate time windows. Random cross-timestep shuffling is not used because it leaks future patterns into training.</p>
            <div className="progress-track grid h-8 grid-cols-[34fr_5fr_10fr] gap-1 overflow-hidden rounded-lg" role="img" aria-label="Chronological split: 34 training timesteps, 5 validation timesteps, 10 held-out test timesteps"><div className="bg-ink-muted opacity-30" /><div className="bg-ink-muted opacity-60" /><div className="bg-accent" /></div>
            <dl className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2"><dt className="field-label">Training timesteps</dt><dd className="text-xl font-medium text-ink tabular-nums">1-34</dd><dd className="text-sm text-ink-muted tabular-nums">29,894 labeled nodes</dd></div>
              <div className="space-y-2"><dt className="field-label">Validation timesteps</dt><dd className="text-xl font-medium text-ink tabular-nums">35-39</dd><dd className="text-sm text-ink-muted tabular-nums">5,486 labeled nodes</dd></div>
              <div className="space-y-2"><dt className="field-label">Held-out test timesteps</dt><dd className="text-xl font-medium text-accent tabular-nums">40-49</dd><dd className="text-sm text-ink-muted tabular-nums">11,184 labeled nodes</dd></div>
            </dl>
            <p className="data-note">Reference test split: 636 illicit and 10,548 licit nodes. Illicit-class precision, recall and F1 are reported separately from macro averages. Historical evaluations do not prove runtime readiness.</p>
          </div>
        </section>

        <section id="protocol-risk" className="grid gap-5 py-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10" aria-labelledby="risk-heading">
          <div className="space-y-2"><p className="text-xs text-ink-muted tabular-nums">04</p><h2 id="risk-heading" className="section-heading">Composite risk</h2><p className="text-sm text-ink-muted">A consistent score from 0 to 100.</p></div>
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-ink">One deterministic engine combines four bounded signals. Each weight below is a maximum contribution, not a probability of wrongdoing.</p>
            <div className="progress-track flex h-2.5 overflow-hidden rounded-full bg-inset" role="img" aria-label="Maximum risk contributions: 55 points model probability, 25 graph exposure, 10 topology, 10 feature anomalies"><div className="h-full bg-accent" style={{ width: '55%' }} /><div className="h-full bg-signal-high" style={{ width: '25%' }} /><div className="h-full bg-ink-muted" style={{ width: '10%' }} /><div className="h-full bg-ink-muted opacity-40" style={{ width: '10%' }} /></div>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <div className="space-y-2"><dt className="field-label">ML probability</dt><dd className="text-xl font-medium text-ink tabular-nums">55 <span className="text-xs font-normal text-ink-muted">points</span></dd></div>
              <div className="space-y-2"><dt className="field-label">Graph exposure</dt><dd className="text-xl font-medium text-ink tabular-nums">25 <span className="text-xs font-normal text-ink-muted">points</span></dd></div>
              <div className="space-y-2"><dt className="field-label">Topology</dt><dd className="text-xl font-medium text-ink tabular-nums">10 <span className="text-xs font-normal text-ink-muted">points</span></dd></div>
              <div className="space-y-2"><dt className="field-label">Feature anomalies</dt><dd className="text-xl font-medium text-ink tabular-nums">10 <span className="text-xs font-normal text-ink-muted">points</span></dd></div>
            </dl>
            <p className="text-sm leading-relaxed text-ink-muted">Known illicit labels set a floor of 90. Known licit labels are capped at 25 only when there are no known illicit neighbors and ML probability is below 0.2.</p>
            <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <div><dt className="text-sm text-ink-muted">Low</dt><dd className="mt-1 text-sm text-ink tabular-nums">0-30</dd></div>
              <div><dt className="text-sm text-ink-muted">Medium</dt><dd className="mt-1 text-sm text-ink tabular-nums">31-60</dd></div>
              <div><dt className="text-sm text-signal-high">High</dt><dd className="mt-1 text-sm text-ink tabular-nums">61-80</dd></div>
              <div><dt className="text-sm text-signal-illicit">Critical</dt><dd className="mt-1 text-sm text-ink tabular-nums">81-100</dd></div>
            </dl>
          </div>
        </section>

        <section id="protocol-evidence" className="grid gap-5 py-7 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10" aria-labelledby="evidence-heading">
          <div className="space-y-2"><p className="text-xs text-ink-muted tabular-nums">05</p><h2 id="evidence-heading" className="section-heading">Evidence & limits</h2><p className="text-sm text-ink-muted">Human review remains necessary.</p></div>
          <div className="space-y-5">
            <div className="panel-inset flex items-start gap-3 p-4 sm:p-5"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" /><p className="text-sm leading-relaxed text-ink">All predictions and composite scores are probabilistic investigative leads, not autonomous legal conclusions. Corroborate findings with independent evidence.</p></div>
            <ul className="space-y-3 text-sm leading-relaxed text-ink-muted">
              <li>Bounded subgraphs may omit connections. Degree and exposure alone do not identify laundering, and CoinJoin can confound topology-based signals.</li>
              <li>Lightning channels and internal exchange books fall outside this on-chain transaction dataset.</li>
              <li>Dossiers include a canonical SHA-256 digest. It checks content integrity, not factual truth, signed custody or legal admissibility.</li>
            </ul>
            <div className="flex flex-wrap gap-x-6 gap-y-2"><Link to="/dataset" className="text-link inline-flex min-h-11 items-center gap-2 text-sm">View source status<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link><Link to="/models" className="text-link inline-flex min-h-11 items-center gap-2 text-sm">View model results<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>
          </div>
        </section>
      </div>
    </div>
  );
};
