import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { DatasetStatus } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { StatTile } from '../components/common/StatTile';
import { EmptyState } from '../components/common/EmptyState';

const formatCount = (value?: number) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'Not reported';

export const Dataset: React.FC = () => {
  const [status, setStatus] = useState<DatasetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getDatasetStatus()
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Dataset status could not be loaded. Database counts and source file checks are unavailable.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const meta = status?.metadata;
  const ingestion = status?.database_ingestion;
  const transactionCount = ingestion?.transactions_in_db;
  const edgeCount = ingestion?.edges_in_db;
  const hasIndexedTransactions = typeof transactionCount === 'number' && transactionCount > 0;
  const coverage = [
    { label: 'Transaction rows', indexed: transactionCount, reference: meta?.total_transactions },
    { label: 'Edge rows', indexed: edgeCount, reference: meta?.total_edges },
  ];
  const classData = [
    { name: 'Illicit', label: 'Known illicit', count: meta?.known_illicit, color: 'var(--signal-illicit)' },
    { name: 'Licit', label: 'Known licit', count: meta?.known_licit, color: 'var(--accent-primary)' },
    { name: 'Unknown', label: 'Unlabeled', count: meta?.unknown, color: 'var(--signal-unknown)' },
  ];
  const sourceFiles = [
    { name: 'elliptic_txs_classes.csv', description: 'Dataset labels', present: status?.files_verified?.classes_file },
    { name: 'elliptic_txs_edgelist.csv', description: 'Directed transaction edges', present: status?.files_verified?.edgelist_file },
    { name: 'elliptic_txs_features.csv', description: '165-feature transaction vectors', present: status?.files_verified?.features_file },
  ];
  const fileCount = sourceFiles.filter((file) => file.present === true).length;
  const ingestionLabel = ingestion?.status === 'NOT_INGESTED' ? 'No recorded run' : ingestion?.status ? ingestion.status.replaceAll('_', ' ').toLowerCase() : 'Not reported';
  const completedAt = ingestion?.completed_at ? new Date(ingestion.completed_at) : null;

  return (
    <div className="workspace-page space-y-6">
      <PageHeader
        title="Dataset"
        eyebrow="Source & index"
        subtitle="Check source files and the records available to investigate."
        badges={!loading && !error && status ? [{ label: hasIndexedTransactions ? 'Indexed records' : transactionCount === 0 ? 'Index empty' : 'Index not reported', tone: hasIndexedTransactions ? 'accent' : 'unknown' }] : []}
        actions={
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh status</button>
        }
      />

      {loading ? (
        <section className="space-y-4" role="status" aria-label="Loading source and database status"><div className="panel-surface h-60 animate-pulse" aria-hidden="true" /><div className="metrics-grid grid grid-cols-2 gap-4 xl:grid-cols-4" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="panel-surface h-28 animate-pulse" />)}</div><span className="sr-only">Reading dataset status...</span></section>
      ) : error || !status ? (
        <EmptyState icon={AlertTriangle} tone="error" title="Dataset status unavailable" description={error || 'The dataset status service did not return a response.'} actionLabel="Retry status" onAction={() => setRefreshKey((key) => key + 1)} />
      ) : (
        <>
          <section className="panel-surface grid gap-6 p-5 sm:p-6 xl:grid-cols-2" aria-labelledby="index-heading">
            <div className="space-y-5">
              <div className="flex items-center gap-2.5"><Database className="h-4 w-4 text-ink-muted" aria-hidden="true" /><h2 id="index-heading" className="section-heading">Investigation index</h2></div>
              <dl className="grid grid-cols-2 gap-5">
                <div><dt className="field-label">Indexed transactions</dt><dd className={`mt-2 text-3xl font-medium tracking-tight tabular-nums ${hasIndexedTransactions ? 'text-accent' : 'text-ink'}`}>{formatCount(transactionCount)}</dd></div>
                <div><dt className="field-label">Indexed flow edges</dt><dd className="mt-2 text-3xl font-medium tracking-tight text-ink tabular-nums">{formatCount(edgeCount)}</dd></div>
              </dl>
              <p className="text-sm leading-relaxed text-ink-muted">
                {transactionCount === 0 ? 'Search and graph views need indexed transaction records. The corpus summary remains available below as reference.' : hasIndexedTransactions ? 'Transaction records are present. Counts alone do not verify feature coverage, graph completeness or model runtime availability.' : 'The service did not report an indexed transaction count. Corpus metadata cannot establish index readiness.'}
              </p>
              {hasIndexedTransactions && edgeCount === 0 && <p className="data-note flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-signal-high" aria-hidden="true" />No flow edges are indexed, so connected graph context is unavailable.</p>}
            </div>
            <div className="space-y-5 border-t border-line pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
              <div><h3 className="text-sm font-medium text-ink">Row-count comparison</h3><p className="mt-1 text-xs text-ink-muted">Current database against the reference corpus</p></div>
              {coverage.map((item) => {
                const ratio = typeof item.indexed === 'number' && typeof item.reference === 'number' && item.reference > 0 ? (item.indexed / item.reference) * 100 : null;
                return <div key={item.label} className="space-y-2"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-ink-muted">{item.label}</span><span className="font-medium text-ink tabular-nums">{ratio !== null ? `${ratio.toFixed(1)}%` : 'Not reported'}</span></div><div className="progress-track h-2 overflow-hidden rounded-full bg-inset" role={ratio !== null ? 'meter' : undefined} aria-label={`${item.label} relative to the reference corpus`} aria-valuemin={ratio !== null ? 0 : undefined} aria-valuemax={ratio !== null ? 100 : undefined} aria-valuenow={ratio !== null ? Math.min(100, Math.max(0, ratio)) : undefined} aria-valuetext={ratio !== null ? `${formatCount(item.indexed)} indexed rows against ${formatCount(item.reference)} reference rows` : undefined}><div className="h-full rounded-full bg-accent" style={{ width: `${ratio !== null ? Math.min(100, Math.max(0, ratio)) : 0}%` }} /></div><p className="text-xs text-ink-muted tabular-nums">{formatCount(item.indexed)} indexed / {formatCount(item.reference)} reference</p></div>;
              })}
              <p className="data-note">This comparison measures row counts, not verified transaction overlap or complete neighborhoods.</p>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="corpus-heading">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="corpus-heading" className="section-heading">Elliptic corpus</h2><p className="mt-1 text-sm text-ink-muted">Precomputed metadata, separate from the investigation index</p></div><span className="badge-pill badge-unknown">Dataset reference</span></div>
            <div className="metrics-grid grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatTile label="Corpus transactions" value={formatCount(meta?.total_transactions)} caption="Reference graph nodes" />
              <StatTile label="Corpus edges" value={formatCount(meta?.total_edges)} caption="Reference directed edges" />
              <StatTile label="Features per node" value={formatCount(meta?.features_count)} caption="93 local + 72 aggregate" tone="accent" />
              <StatTile label="Temporal steps" value={formatCount(meta?.time_steps_count)} caption="Chronological snapshots" />
            </div>
          </section>

          <section className="panel-surface space-y-5 p-5 sm:p-6" aria-labelledby="labels-heading">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="labels-heading" className="section-heading">Reference label composition</h2><span className="text-xs text-ink-muted">Dataset reference</span></div>
            {meta?.total_transactions && classData.every((item) => typeof item.count === 'number') ? (
              <div className="progress-track flex h-3 overflow-hidden rounded-full bg-inset" role="img" aria-label={`Reference label composition: ${formatCount(meta.known_illicit)} illicit, ${formatCount(meta.known_licit)} licit, ${formatCount(meta.unknown)} unknown transactions`}>
                {classData.map((item) => <div key={item.name} className="h-full" style={{ backgroundColor: item.color, opacity: item.name === 'Unknown' ? 0.4 : 1, width: `${(item.count! / meta.total_transactions!) * 100}%` }} />)}
              </div>
            ) : <p className="text-sm text-ink-muted">Reference class proportions were not reported.</p>}
            <dl className="grid gap-5 sm:grid-cols-3">
              {classData.map((item) => <div key={item.name} className="space-y-2"><dt className="inline-flex items-center gap-2 text-sm text-ink-muted"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</dt><dd className="text-xl font-medium text-ink tabular-nums">{formatCount(item.count)}{typeof item.count === 'number' && meta?.total_transactions ? <span className="ml-2 text-xs font-normal text-ink-muted">{((item.count / meta.total_transactions) * 100).toFixed(1)}%</span> : null}</dd></div>)}
            </dl>
            <p className="data-note border-t border-line pt-4">UNKNOWN labels are preserved, never converted to LICIT. Unlabeled nodes can carry graph context but are excluded from supervised loss and evaluation.</p>
          </section>

          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <section className="panel-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="files-heading">
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="files-heading" className="section-heading">Source files</h2><span className="text-xs text-ink-muted tabular-nums">{fileCount} of 3 found</span></div>
              <div className="space-y-1"><p className="field-label">{status.dataset_configured ? 'Configured folder' : 'Source folder'}</p><p className="break-all font-mono text-xs text-ink">{status.dataset_configured ? status.dataset_directory_name || 'Folder name not reported' : 'No source folder configured'}</p></div>
              <ul className="divide-y divide-line">
                {sourceFiles.map((file) => <li key={file.name} className="flex items-center justify-between gap-3 py-3.5"><div className="flex min-w-0 items-start gap-2.5"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" /><div className="min-w-0"><p className="break-all font-mono text-xs text-ink">{file.name}</p><p className="mt-1 text-xs text-ink-muted">{file.description}</p></div></div><span className={`badge-pill shrink-0 ${file.present === true ? 'badge-accent' : 'badge-unknown'}`}>{file.present === true && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}{file.present === true ? 'Found' : file.present === false ? 'Missing' : 'Not reported'}</span></li>)}
              </ul>
              <p className="data-note">File presence is not an integrity or parsing check. Missing source CSVs do not change the precomputed metadata above.</p>
            </section>

            <section className="panel-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="schema-heading">
              <div><h2 id="schema-heading" className="section-heading">Feature schema</h2><p className="mt-1 text-sm text-ink-muted">An exact 165-value vector for each transaction</p></div>
              <div className="progress-track flex h-2.5 overflow-hidden rounded-full bg-inset" role="img" aria-label="165 features: 93 local features and 72 neighborhood aggregate features"><div className="h-full bg-accent" style={{ width: `${(93 / 165) * 100}%` }} /><div className="h-full bg-ink-muted opacity-40" style={{ width: `${(72 / 165) * 100}%` }} /></div>
              <dl className="grid grid-cols-2 gap-5">
                <div className="space-y-2"><dt className="field-label">Local transaction</dt><dd className="text-2xl font-medium text-ink tabular-nums">93</dd><dd className="font-mono text-xs text-ink-muted">Indices 0-92</dd><dd className="text-sm leading-relaxed text-ink-muted">Properties of the transaction itself.</dd></div>
                <div className="space-y-2"><dt className="field-label">Neighborhood aggregate</dt><dd className="text-2xl font-medium text-ink tabular-nums">72</dd><dd className="font-mono text-xs text-ink-muted">Indices 93-164</dd><dd className="text-sm leading-relaxed text-ink-muted">Precomputed one-hop neighborhood summaries.</dd></div>
              </dl>
              <p className="data-note border-t border-line pt-4">Inference requires all 165 values to be finite. Invalid vectors are rejected rather than silently scored.</p>
            </section>
          </div>

          <section className="panel-surface grid gap-5 p-5 sm:p-6 sm:grid-cols-3" aria-label="Last recorded ingestion run">
            <div><h2 className="field-label">Last ingestion run</h2><p className="mt-2 text-sm font-medium capitalize text-ink">{ingestionLabel}</p></div>
            <div><p className="field-label">Rows processed in that run</p><p className="mt-2 text-sm text-ink tabular-nums">{formatCount(ingestion?.rows_processed)}</p></div>
            <div><p className="field-label">Completed</p><p className="mt-2 text-sm text-ink tabular-nums">{completedAt && Number.isFinite(completedAt.getTime()) ? completedAt.toLocaleString() : 'No completion recorded'}</p></div>
          </section>
          <p className="data-note">This view only reads status. Ingestion and model training are administrative operations and are not triggered here.</p>
        </>
      )}
    </div>
  );
};
