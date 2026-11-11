import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Cpu, FlaskConical, Info, Network, RefreshCw, ShieldAlert } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../services/api';
import type { KnownLabel, ModelMetrics } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatTile } from '../components/common/StatTile';
import { CustomTooltip } from '../components/common/CustomTooltip';
import { TableRowsSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { LabelBadge } from '../components/common/LabelBadge';

const AVAILABLE_MODELS = [
  { id: 'gradient_boosting', name: 'Gradient boosting', input: '165 features', family: 'Boosted trees' },
  { id: 'random_forest', name: 'Random forest', input: '165 features', family: 'Bagged trees' },
  { id: 'logistic_regression', name: 'Logistic regression', input: '165 features', family: 'Linear baseline' },
  { id: 'gnn', name: 'GraphSAGE', input: 'Graph + 165 features', family: 'Two-layer graph model' },
] as const;

type ModelId = (typeof AVAILABLE_MODELS)[number]['id'];

interface BenchmarkResponse {
  model_name: string;
  transactions: Array<{
    transaction_id: number;
    time_step: number;
    ground_truth: KnownLabel;
    prediction: KnownLabel;
    probability: number;
    scenario: string;
    match: boolean;
  }>;
}

interface ModelRequest<T> {
  model: ModelId;
  data: T | null;
  loading: boolean;
  error: string | null;
}

const percent = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'Not recorded';

const score = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'Not recorded';

export const ModelPerformance: React.FC = () => {
  const [activeModel, setActiveModel] = useState<ModelId>('gradient_boosting');
  const [metricRequest, setMetricRequest] = useState<ModelRequest<ModelMetrics>>({
    model: 'gradient_boosting', data: null, loading: true, error: null,
  });
  const [benchmarkRequest, setBenchmarkRequest] = useState<ModelRequest<BenchmarkResponse>>({
    model: 'gradient_boosting', data: null, loading: true, error: null,
  });
  const [allMetrics, setAllMetrics] = useState<Partial<Record<ModelId, ModelMetrics>>>({});
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [curveType, setCurveType] = useState<'pr' | 'roc'>('pr');
  const [expandedTransaction, setExpandedTransaction] = useState<number | null>(null);
  const [showAllBenchmark, setShowAllBenchmark] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setMetricRequest({ model: activeModel, data: null, loading: true, error: null });
    setBenchmarkRequest({ model: activeModel, data: null, loading: true, error: null });
    setExpandedTransaction(null);
    setShowAllBenchmark(false);

    api.getModelMetrics(activeModel)
      .then((data) => {
        if (!cancelled) setMetricRequest({ model: activeModel, data, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setMetricRequest({
          model: activeModel, data: null, loading: false,
          error: 'Recorded evaluation metrics could not be loaded for this model.',
        });
      });

    api.getUnseenBenchmark(activeModel)
      .then((data: BenchmarkResponse) => {
        // The benchmark endpoint can silently substitute a model for an unsupported key.
        if (data.model_name.toLowerCase().replaceAll(' ', '_') !== activeModel) {
          throw new Error('Benchmark model mismatch');
        }
        if (!cancelled) setBenchmarkRequest({ model: activeModel, data, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setBenchmarkRequest({
          model: activeModel, data: null, loading: false,
          error: 'The precomputed benchmark for this model could not be loaded.',
        });
      });

    return () => { cancelled = true; };
  }, [activeModel, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setComparisonLoading(true);
    setComparisonError(null);
    Promise.allSettled(AVAILABLE_MODELS.map((model) => api.getModelMetrics(model.id)))
      .then((results) => {
        if (cancelled) return;
        const next: Partial<Record<ModelId, ModelMetrics>> = {};
        const unavailable: string[] = [];
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') next[AVAILABLE_MODELS[index].id] = result.value;
          else unavailable.push(AVAILABLE_MODELS[index].name);
        });
        setAllMetrics(next);
        setComparisonError(unavailable.length ? `Metrics unavailable: ${unavailable.join(', ')}.` : null);
        setComparisonLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Keyed results also prevent the previous model appearing before the new effect starts.
  const metrics = metricRequest.model === activeModel ? metricRequest.data : null;
  const modelLoading = metricRequest.model !== activeModel || metricRequest.loading;
  const modelError = metricRequest.model === activeModel ? metricRequest.error : null;
  const benchmark = benchmarkRequest.model === activeModel ? benchmarkRequest.data : null;
  const benchmarkLoading = benchmarkRequest.model !== activeModel || benchmarkRequest.loading;
  const benchmarkError = benchmarkRequest.model === activeModel ? benchmarkRequest.error : null;
  const selectedModel = AVAILABLE_MODELS.find((model) => model.id === activeModel)!;
  const matrix = metrics?.confusion_matrix;
  const matrixValues = matrix && [matrix.true_negative, matrix.false_positive, matrix.false_negative, matrix.true_positive];
  const hasMatrix = !!matrixValues?.every((value) => Number.isFinite(value) && value >= 0);
  const testCount = hasMatrix ? matrixValues!.reduce((sum, value) => sum + value, 0) : null;
  const illicitTestShare = testCount && matrix ? ((matrix.true_positive + matrix.false_negative) / testCount) * 100 : null;
  const curveData: Array<Record<string, number>> = curveType === 'pr'
    ? (metrics?.pr_curve ?? []).filter((point) => Number.isFinite(point.recall) && Number.isFinite(point.precision))
        .map((point) => ({ recall: point.recall * 100, precision: point.precision * 100 }))
    : (metrics?.roc_curve ?? []).filter((point) => Number.isFinite(point.fpr) && Number.isFinite(point.tpr))
        .map((point) => ({ fpr: point.fpr * 100, tpr: point.tpr * 100 }));
  const features = (metrics?.feature_importances ?? [])
    .filter((feature) => Number.isFinite(feature.importance))
    .sort((a, b) => b.importance - a.importance);
  const uniformWeights = features.length > 1 && features.every((feature) => Math.abs(feature.importance - features[0].importance) < 1e-9);
  const maxWeight = features[0]?.importance ?? 0;
  const benchmarkRows = benchmark?.transactions ?? [];
  const correctCount = benchmarkRows.filter((transaction) => transaction.prediction === transaction.ground_truth).length;
  const illicitRows = benchmarkRows.filter((transaction) => transaction.ground_truth === 'ILLICIT');
  const illicitHits = illicitRows.filter((transaction) => transaction.prediction === 'ILLICIT').length;
  const visibleBenchmark = showAllBenchmark ? benchmarkRows : benchmarkRows.slice(0, 6);

  return (
    <div className="workspace-page space-y-6">
      <PageHeader
        title="Model evaluation"
        eyebrow="Recorded evaluation"
        subtitle="Compare model results on later, held-out Bitcoin transactions."
        badges={[{ label: 'Historical metrics', tone: 'unknown' }]}
        actions={
          <button type="button" className="btn-secondary" onClick={() => setRefreshKey((key) => key + 1)} disabled={modelLoading || comparisonLoading || benchmarkLoading}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh results
          </button>
        }
      />

      <div className="segmented-control grid grid-cols-2 gap-1 xl:grid-cols-4" role="group" aria-label="Model to inspect">
        {AVAILABLE_MODELS.map((model) => (
          <button key={model.id} type="button" className="btn-ghost min-h-11 justify-start gap-3 px-4 text-left" aria-pressed={activeModel === model.id} onClick={() => setActiveModel(model.id)}>
            {model.id === 'gnn' ? <Network className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="min-w-0">
              <span className="block text-sm font-medium">{model.name}</span>
              <span className="hidden text-xs text-ink-muted sm:block">{model.family}</span>
            </span>
          </button>
        ))}
      </div>

      {modelLoading ? (
        <section className="space-y-4" role="status" aria-label="Loading recorded model results">
          <p className="data-note">Loading {selectedModel.name.toLowerCase()} results...</p>
          <div className="metrics-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="panel-surface h-28 animate-pulse" />)}
          </div>
          <div className="panel-surface h-80 animate-pulse" aria-hidden="true" />
        </section>
      ) : modelError || !metrics ? (
        <EmptyState icon={AlertTriangle} tone="error" title="No recorded metrics" description={modelError || 'This model has no evaluation results available.'} actionLabel="Retry results" onAction={() => setRefreshKey((key) => key + 1)} />
      ) : (
        <>
          <section className="space-y-4" aria-labelledby="selected-model-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="selected-model-heading" className="section-heading">{selectedModel.name}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {activeModel === 'gnn' ? 'Two-layer GraphSAGE with bounded, two-hop graph context.' : 'Local and neighborhood aggregate features, evaluated together.'}
                </p>
              </div>
              <p className="text-xs text-ink-muted tabular-nums">Test steps 40-49{testCount !== null ? ` / ${testCount.toLocaleString()} known labels` : ''}</p>
            </div>
            <div className="metrics-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Illicit precision" value={percent(metrics.illicit_precision)} caption="Illicit among flagged nodes" />
              <StatTile label="Illicit recall" value={percent(metrics.illicit_recall)} caption="Known illicit nodes found" />
              <StatTile label="Illicit F1" value={percent(metrics.illicit_f1)} caption="Precision / recall balance" tone="accent" />
              <StatTile label="PR-AUC" value={score(metrics.pr_auc)} caption="Precision-recall area" />
              <StatTile label="ROC-AUC" value={score(metrics.roc_auc)} caption="Threshold separation" />
              <StatTile label="Accuracy" value={percent(metrics.accuracy)} caption="Both known classes" />
            </div>
          </section>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <section className="panel-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="curve-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="curve-heading" className="section-heading">Detection trade-off</h2>
                  <p className="mt-1 text-xs text-ink-muted">Recorded threshold curve, not live inference</p>
                </div>
                <div className="segmented-control flex" role="group" aria-label="Evaluation curve">
                  <button type="button" className="btn-ghost" aria-pressed={curveType === 'pr'} onClick={() => setCurveType('pr')}>Precision-recall</button>
                  <button type="button" className="btn-ghost" aria-pressed={curveType === 'roc'} onClick={() => setCurveType('roc')}>ROC</button>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted tabular-nums">
                <span>{curveType === 'pr' ? 'Precision (%)' : 'True positive rate (%)'}</span>
                <span>{curveType === 'pr' ? `PR-AUC ${score(metrics.pr_auc)}` : `ROC-AUC ${score(metrics.roc_auc)}`}</span>
              </div>
              {curveData.length ? (
                <div className="h-64 min-w-0 w-full sm:h-72">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1}>
                    <LineChart data={curveData} margin={{ top: 8, right: 18, left: 0, bottom: 8 }} accessibilityLayer>
                      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
                      <XAxis type="number" dataKey={curveType === 'pr' ? 'recall' : 'fpr'} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={36} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip labelPrefix={curveType === 'pr' ? 'Recall (%) ' : 'False positive rate (%) '} valueSuffix="%" />} />
                      {curveType === 'roc' ? (
                        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="var(--signal-unknown)" strokeDasharray="5 5" />
                      ) : illicitTestShare !== null ? (
                        <ReferenceLine y={illicitTestShare} stroke="var(--signal-unknown)" strokeDasharray="5 5" />
                      ) : null}
                      <Line type="linear" dataKey={curveType === 'pr' ? 'precision' : 'tpr'} name={curveType === 'pr' ? 'Precision' : 'True positive rate'} stroke="var(--accent-primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: 'var(--bg-surface)', strokeWidth: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="py-20 text-center text-sm text-ink-muted">This curve was not recorded.</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
                <div className="chart-legend flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-2"><span className="h-0.5 w-4 bg-accent" />Model curve</span>
                  {(curveType === 'roc' || illicitTestShare !== null) && <span className="inline-flex items-center gap-2"><span className="w-4 border-t border-dashed border-ink-muted" />No-skill reference</span>}
                </div>
                <span>{curveType === 'pr' ? 'Recall (%)' : 'False positive rate (%)'}</span>
              </div>
            </section>

            <section className="panel-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="outcome-heading">
              <div>
                <h2 id="outcome-heading" className="section-heading">Test outcomes</h2>
                <p className="mt-1 text-xs text-ink-muted">Actual labels against recorded predictions</p>
              </div>
              {hasMatrix && matrix ? (
                <>
                  <table className="w-full border-separate border-spacing-1 text-sm">
                    <caption className="sr-only">Confusion matrix for {selectedModel.name}, test timesteps 40 through 49</caption>
                    <thead>
                      <tr>
                        <td />
                        <th scope="col" className="px-2 pb-2 text-center text-xs font-medium text-ink-muted">Predicted<br />licit</th>
                        <th scope="col" className="px-2 pb-2 text-center text-xs font-medium text-ink-muted">Predicted<br />illicit</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th scope="row" className="pr-2 text-left text-xs font-medium text-ink-muted">Actual<br />licit</th>
                        <td className="rounded-lg bg-inset px-2 py-5 text-center"><span className="block text-xl font-medium text-ink tabular-nums">{matrix.true_negative.toLocaleString()}</span><span className="text-xs text-ink-muted">Correct licit</span></td>
                        <td className="rounded-lg bg-inset px-2 py-5 text-center"><span className="block text-xl font-medium text-signal-high tabular-nums">{matrix.false_positive.toLocaleString()}</span><span className="text-xs text-ink-muted">False alarms</span></td>
                      </tr>
                      <tr>
                        <th scope="row" className="pr-2 text-left text-xs font-medium text-ink-muted">Actual<br />illicit</th>
                        <td className="rounded-lg bg-inset px-2 py-5 text-center"><span className="block text-xl font-medium text-signal-illicit tabular-nums">{matrix.false_negative.toLocaleString()}</span><span className="text-xs text-ink-muted">Missed illicit</span></td>
                        <td className="rounded-lg bg-accent-soft px-2 py-5 text-center"><span className="block text-xl font-medium text-accent tabular-nums">{matrix.true_positive.toLocaleString()}</span><span className="text-xs text-ink-muted">Illicit found</span></td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex items-center justify-between border-t border-line pt-4 text-sm">
                    <span className="text-ink-muted">Known labels evaluated</span>
                    <span className="font-medium text-ink tabular-nums">{testCount!.toLocaleString()}</span>
                  </div>
                </>
              ) : <p className="py-12 text-sm text-ink-muted">Confusion counts were not recorded.</p>}
              <p className="data-note">UNKNOWN nodes are excluded from supervised metrics. Illicit F1 is not the macro F1 average.</p>
            </section>
          </div>
        </>
      )}

      <section className="panel-surface min-w-0 overflow-hidden" aria-labelledby="comparison-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
          <div>
            <h2 id="comparison-heading" className="section-heading">Model comparison</h2>
            <p className="mt-1 text-sm text-ink-muted">Illicit-class results from the chronological test split</p>
          </div>
          <span className="text-xs text-ink-muted">Select a model to inspect its results</span>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Historical model comparison table">
          <table className="tx-table min-w-[760px]">
            <thead><tr><th scope="col">Model</th><th scope="col" className="text-right">Illicit precision</th><th scope="col" className="text-right">Illicit recall</th><th scope="col" className="text-right">Illicit F1</th><th scope="col" className="text-right">PR-AUC</th><th scope="col" className="text-right">ROC-AUC</th><th scope="col" className="text-right">Accuracy</th></tr></thead>
            <tbody>
              {comparisonLoading ? <TableRowsSkeleton rows={4} cols={7} /> : AVAILABLE_MODELS.map((model) => {
                const data = allMetrics[model.id];
                return (
                  <tr key={model.id} className={activeModel === model.id ? 'bg-accent-soft' : ''}>
                    <td>
                      <button type="button" className="text-link inline-flex min-h-11 items-center gap-2 text-left font-medium" aria-pressed={activeModel === model.id} onClick={() => setActiveModel(model.id)}>
                        {model.name}{activeModel === model.id && <Check className="h-3.5 w-3.5 text-accent" aria-label="Selected" />}
                      </button>
                      <span className="block text-xs text-ink-muted">{model.input}</span>
                    </td>
                    <td className="text-right tabular-nums">{percent(data?.illicit_precision)}</td>
                    <td className="text-right tabular-nums">{percent(data?.illicit_recall)}</td>
                    <td className="text-right font-medium tabular-nums"><span className="text-accent">{percent(data?.illicit_f1)}</span></td>
                    <td className="text-right tabular-nums">{score(data?.pr_auc)}</td>
                    <td className="text-right tabular-nums">{score(data?.roc_auc)}</td>
                    <td className="text-right tabular-nums">{percent(data?.accuracy)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-4 border-t border-line p-5 sm:p-6">
          {comparisonError && <p className="data-note flex items-center gap-2" role="status"><AlertTriangle className="h-4 w-4 shrink-0 text-signal-high" aria-hidden="true" />{comparisonError}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="field-label">Training</p><p className="mt-1 text-sm text-ink tabular-nums">Timesteps 1-34</p></div>
            <div><p className="field-label">Validation</p><p className="mt-1 text-sm text-ink tabular-nums">Timesteps 35-39</p></div>
            <div><p className="field-label">Held-out test</p><p className="mt-1 text-sm text-ink tabular-nums">Timesteps 40-49</p></div>
          </div>
          <p className="data-note">Recorded evaluations do not establish checkpoint availability or a working inference runtime.</p>
        </div>
      </section>

      {metrics && (
        <section className="panel-surface grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]" aria-labelledby="features-heading">
          <div className="space-y-3">
            <h2 id="features-heading" className="section-heading">Recorded feature weights</h2>
            <p className="text-sm leading-relaxed text-ink-muted">Artifact-level weights for {selectedModel.name.toLowerCase()}. These are not causal explanations for a transaction.</p>
            <p className="text-xs text-ink-muted">Relative bars use the largest recorded weight. Weight scales may differ between models.</p>
          </div>
          {uniformWeights ? (
            <div className="panel-inset flex items-start gap-3 p-5">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
              <div><h3 className="text-sm font-medium text-ink">No meaningful ranking</h3><p className="mt-2 text-sm leading-relaxed text-ink-muted">This legacy artifact assigns equal weights to every recorded feature. A ranked chart would imply differences that are not present.</p></div>
            </div>
          ) : features.length ? (
            <div className="space-y-3">
              {features.slice(0, 8).map((feature) => (
                <div key={feature.feature_index} className="grid grid-cols-[minmax(0,1fr)_minmax(48px,0.65fr)_60px] items-center gap-3 text-sm">
                  <div className="min-w-0"><span className="font-mono text-xs text-ink">{feature.feature_name}</span><span className="block text-xs text-ink-muted">{feature.feature_index <= 92 ? 'Local' : 'Neighborhood aggregate'}</span></div>
                  <div className="progress-track h-1.5 overflow-hidden rounded-full bg-inset" aria-hidden="true"><div className="h-full rounded-full bg-accent" style={{ width: `${maxWeight > 0 ? Math.max(0, (feature.importance / maxWeight) * 100) : 0}%` }} /></div>
                  <span className="text-right text-ink tabular-nums">{feature.importance.toFixed(4)}</span>
                </div>
              ))}
            </div>
          ) : <p className="self-center text-sm text-ink-muted">Feature weights were not recorded for this model.</p>}
        </section>
      )}

      <section className="panel-surface min-w-0 overflow-hidden" aria-labelledby="benchmark-heading">
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5"><FlaskConical className="h-4 w-4 text-ink-muted" aria-hidden="true" /><h2 id="benchmark-heading" className="section-heading">Precomputed Benchmark</h2></div>
            <span className="badge-pill badge-unknown">Fixture only</span>
          </div>
          <p className="text-sm text-ink-muted">Stored predictions for held-out transactions under {selectedModel.name.toLowerCase()}. These records are not live inference and may not exist in the investigation index.</p>
          {benchmarkRows.length > 0 && <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted tabular-nums"><span><strong className="font-medium text-ink">{correctCount} / {benchmarkRows.length}</strong> correct predictions</span><span><strong className="font-medium text-ink">{illicitHits} / {illicitRows.length}</strong> known illicit nodes found</span></div>}
        </div>
        {benchmarkLoading ? (
          <p className="px-6 py-12 text-sm text-ink-muted" role="status">Loading stored benchmark records...</p>
        ) : benchmarkError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5 sm:p-6"><p className="data-note" role="alert">{benchmarkError}</p><button type="button" className="btn-secondary" onClick={() => setRefreshKey((key) => key + 1)}>Retry benchmark</button></div>
        ) : benchmarkRows.length ? (
          <>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Precomputed benchmark records">
              <table className="tx-table min-w-[680px]">
                <thead><tr><th scope="col">Transaction ID</th><th scope="col">Step</th><th scope="col">Known label</th><th scope="col">Prediction</th><th scope="col" className="text-right">P(illicit)</th><th scope="col">Outcome</th><th scope="col"><span className="sr-only">Fixture details</span></th></tr></thead>
                <tbody>
                  {visibleBenchmark.map((transaction) => {
                    const expanded = expandedTransaction === transaction.transaction_id;
                    const correct = transaction.prediction === transaction.ground_truth;
                    return (
                      <React.Fragment key={transaction.transaction_id}>
                        <tr>
                          <td className="font-mono text-xs">{transaction.transaction_id}</td>
                          <td className="text-ink-muted tabular-nums">{transaction.time_step}</td>
                          <td><LabelBadge label={transaction.ground_truth} /></td>
                          <td><LabelBadge label={transaction.prediction} isPrediction /></td>
                          <td className="text-right tabular-nums">{percent(transaction.probability)}</td>
                          <td><span className={correct ? 'text-ink-muted' : transaction.ground_truth === 'ILLICIT' ? 'text-signal-illicit' : 'text-signal-high'}>{correct ? 'Correct' : transaction.prediction === 'UNKNOWN' ? 'No prediction' : transaction.ground_truth === 'ILLICIT' ? 'Missed illicit' : 'False alarm'}</span></td>
                          <td><button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-expanded={expanded} aria-controls={`fixture-${transaction.transaction_id}`} aria-label={`${expanded ? 'Hide' : 'Show'} fixture details for transaction ${transaction.transaction_id}`} onClick={() => setExpandedTransaction(expanded ? null : transaction.transaction_id)}><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" /></button></td>
                        </tr>
                        {expanded && <tr id={`fixture-${transaction.transaction_id}`}><td colSpan={7} className="bg-inset"><div className="space-y-2 py-2"><p className="text-sm text-ink">{transaction.scenario}</p><p className="text-xs text-ink-muted">Scenario text is part of the benchmark fixture, not a verified case finding. No indexed transaction dossier is opened from this record.</p></div></td></tr>}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5 sm:p-6">
              <p className="text-xs text-ink-muted tabular-nums">Showing {visibleBenchmark.length} of {benchmarkRows.length} stored records</p>
              {benchmarkRows.length > 6 && <button type="button" className="btn-secondary" onClick={() => { setShowAllBenchmark((show) => !show); setExpandedTransaction(null); }}>{showAllBenchmark ? 'Show first 6 records' : `Show all ${benchmarkRows.length} records`}</button>}
            </div>
          </>
        ) : <p className="px-6 py-10 text-sm text-ink-muted">No benchmark records are available for this model.</p>}
      </section>

      <p className="data-note flex items-start gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" /><span>Model outputs are probabilistic investigative leads, not legal conclusions. Corroborate findings with independent evidence.</span></p>
    </div>
  );
};
