import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Printer, FileText, Copy, Check, AlertCircle, ArrowUpRight, RefreshCw, Info, LoaderCircle } from 'lucide-react';
import { api } from '../services/api';
import { CaseStatus, InvestigationCase } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { PageSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { TraceXLogo } from '../components/common/TraceXLogo';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';

type CaseReport = Awaited<ReturnType<typeof api.getCaseReport>>;
type CopyState = 'idle' | 'copying' | 'copied';
type ReportState =
  | { selection: string; status: 'ready'; data: CaseReport }
  | { selection: string; status: 'error'; message: string };

const statusLabels: Record<CaseStatus, string> = {
  OPEN: 'Open',
  'UNDER REVIEW': 'Under review',
  CLOSED: 'Closed',
};

interface ReportDocumentProps {
  report: CaseReport;
  copyState: CopyState;
  copyError: string | null;
  onCopyDigest: (digest: string) => void;
}

export const ReportDocument: React.FC<ReportDocumentProps> = ({ report, copyState, copyError, onCopyDigest }) => {
  const transactions: NonNullable<InvestigationCase['transactions']> = report.investigated_transactions || [];
  const notes: NonNullable<InvestigationCase['notes']> = report.forensic_notes || [];
  const scoredCount = transactions.filter((t) => typeof t.risk_score === 'number' && Number.isFinite(t.risk_score)).length;
  const completeRisk = transactions.length > 0 && scoredCount === transactions.length;
  const averageRisk = report.risk_assessment_summary?.average_risk_score;

  return (
    <article className="report-document panel-surface min-w-0 space-y-7 p-5 sm:p-8 print:border-none print:bg-white print:p-0 print:shadow-none" data-print-report>
      <header className="flex flex-col-reverse justify-between gap-5 border-b border-line pb-6 sm:flex-row sm:items-start">
        <div className="min-w-0 space-y-3">
          <p className="text-sm font-medium text-accent">Investigation report</p>
          <h2 className="break-words text-2xl font-medium leading-tight tracking-tight text-ink">{report.case_name}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
            <span>Case <span className="font-mono tabular-nums text-ink">#{report.case_id}</span></span>
            <span>{statusLabels[report.status as CaseStatus] || report.status}</span>
            <time dateTime={report.generated_at}>Generated {new Date(report.generated_at).toLocaleString()}</time>
          </div>
          <p className="break-words text-xs text-ink-muted">Prepared by {report.investigator}</p>
        </div>
        <div className="shrink-0"><TraceXLogo compact showSubtitle={false} /></div>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <div className="space-y-1.5">
          <dt className="text-xs text-ink-muted">Transactions</dt>
          <dd className="font-mono text-xl tabular-nums text-ink">{report.risk_assessment_summary?.total_investigated ?? transactions.length}</dd>
        </div>
        <div className="space-y-1.5">
          <dt className="text-xs text-ink-muted">Average risk</dt>
          <dd className={completeRisk && Number.isFinite(averageRisk) ? 'font-mono text-xl tabular-nums text-ink' : 'text-base font-medium text-ink-muted'}>
            {completeRisk && Number.isFinite(averageRisk) ? <>{averageRisk}<span className="text-xs text-ink-muted"> / 100</span></> : completeRisk ? 'Not provided' : scoredCount > 0 ? 'Incomplete' : 'Not scored'}
          </dd>
        </div>
        <div className="space-y-1.5">
          <dt className="text-xs text-ink-muted">Case connections</dt>
          <dd className={typeof report.network_findings?.internal_case_edges_count === 'number' ? 'font-mono text-xl tabular-nums text-ink' : 'text-base font-medium text-ink-muted'}>{report.network_findings?.internal_case_edges_count ?? 'Not provided'}</dd>
        </div>
        <div className="space-y-1.5">
          <dt className="text-xs text-ink-muted">Investigator notes</dt>
          <dd className="font-mono text-xl tabular-nums text-ink">{notes.length}</dd>
        </div>
      </dl>
      {scoredCount < transactions.length && (
        <p className="data-note">Some attached references have no saved risk score. The API summary may include them; review individual records before using the reported average.</p>
      )}

      <section aria-labelledby="report-summary-heading" className="space-y-3 border-t border-line pt-6">
        <h3 id="report-summary-heading" className="section-heading">Executive summary</h3>
        <p className="break-words text-sm leading-7 text-ink-secondary">{report.executive_summary}</p>
      </section>

      <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
        <section aria-labelledby="report-network-heading" className="space-y-3">
          <h3 id="report-network-heading" className="section-heading">Network findings</h3>
          <p className="break-words text-sm leading-7 text-ink-secondary">{report.network_findings?.topology_summary || 'No network findings were provided.'}</p>
        </section>
        <section aria-labelledby="report-model-heading" className="space-y-3">
          <h3 id="report-model-heading" className="section-heading">Model context</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-ink-muted">Configured model</dt><dd className="text-ink">{report.model_findings?.active_model || 'Not provided'}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt className="text-ink-muted">Reported threshold</dt><dd className={typeof report.model_findings?.detection_threshold === 'number' ? 'font-mono tabular-nums text-ink' : 'text-ink-muted'}>{typeof report.model_findings?.detection_threshold === 'number' ? `${(report.model_findings.detection_threshold * 100).toFixed(0)}%` : 'Not provided'}</dd></div>
          </dl>
          <p className="data-note">Configuration is reported at generation time. Stored predictions may come from an earlier model run.</p>
        </section>
      </div>

      <section aria-labelledby="report-transactions-heading" className="space-y-4 border-t border-line pt-6">
        <h3 id="report-transactions-heading" className="section-heading">Transaction registry</h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-ink-muted">No transactions were attached when this report was generated.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tx-table min-w-[600px]">
              <caption className="sr-only">Transactions included in the generated report. Dataset labels and model predictions are separate.</caption>
              <thead><tr><th scope="col">Transaction</th><th scope="col">Step</th><th scope="col">Dataset label</th><th scope="col">Model prediction</th><th scope="col">Risk</th></tr></thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.transaction_id}>
                    <td><Link to={`/transactions/${t.transaction_id}`} className="text-link inline-flex min-h-11 items-center font-mono tabular-nums">#{t.transaction_id}</Link></td>
                    <td className="font-mono tabular-nums">{t.time_step}</td>
                    <td><LabelBadge label={t.known_label} /></td>
                    <td>{t.prediction ? <LabelBadge label={t.prediction} isPrediction /> : <span className="text-ink-muted">Not available</span>}</td>
                    <td>{typeof t.risk_score === 'number' && Number.isFinite(t.risk_score) ? <RiskBadge score={t.risk_score} level={t.risk_level} /> : <span className="text-ink-muted">Not scored</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="report-indicators-heading" className="space-y-4 border-t border-line pt-6">
        <h3 id="report-indicators-heading" className="section-heading">Evidence indicators</h3>
        {report.evidence_items?.length ? (
          <ul className="divide-y divide-line">
            {report.evidence_items.map((item: { transaction_id: number; type: string; severity: string; detail: string }, index: number) => (
              <li key={`${item.transaction_id}-${item.type}-${index}`} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Link to={`/transactions/${item.transaction_id}`} className="text-link inline-flex min-h-11 items-center font-mono tabular-nums">#{item.transaction_id}</Link>
                  <span className="text-xs text-ink-muted">{item.type === 'GROUND_TRUTH_FLAG' ? 'Dataset label' : item.type === 'MODEL_ANOMALY_DETECTION' ? 'Model prediction' : item.type.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
                <p className="break-words text-sm leading-7 text-ink-secondary">{item.detail}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">No dataset or model indicators were included in this report.</p>}
      </section>

      <section aria-labelledby="report-notes-heading" className="space-y-4 border-t border-line pt-6">
        <h3 id="report-notes-heading" className="section-heading">Investigator notes</h3>
        {notes.length ? (
          <ol className="divide-y divide-line">
            {notes.map((note) => (
              <li key={note.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-ink">{note.author}</span>
                  <time dateTime={note.created_at} className="text-ink-muted">{new Date(note.created_at).toLocaleString()}</time>
                </div>
                {note.transaction_id != null && <Link to={`/transactions/${note.transaction_id}`} className="text-link inline-flex min-h-11 items-center gap-1 text-xs">Transaction <span className="font-mono tabular-nums">#{note.transaction_id}</span></Link>}
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink-secondary">{note.note}</p>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-ink-muted">No investigator notes were included in this report.</p>}
      </section>

      <section aria-labelledby="report-methodology-heading" className="space-y-3 border-t border-line pt-6">
        <h3 id="report-methodology-heading" className="section-heading">Methodology and limitations</h3>
        <p className="break-words text-sm leading-7 text-ink-secondary">{report.methodology_and_limitations || 'ChainGuard predictions are probabilistic investigative leads. They are not legal proof and require independent corroboration.'}</p>
      </section>

      <section aria-labelledby="report-integrity-heading" className="space-y-3 border-t border-line pt-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <h3 id="report-integrity-heading" className="section-heading">Report integrity</h3>
          {report.integrity_sha256 && (
            <button type="button" onClick={() => onCopyDigest(report.integrity_sha256)} disabled={copyState === 'copying'} className="btn-secondary w-full sm:w-auto print:hidden">
              {copyState === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copyState === 'copied' ? 'Digest copied' : copyState === 'copying' ? 'Copying digest...' : 'Copy digest'}
            </button>
          )}
        </div>
        <p className="data-note">The SHA-256 digest identifies this generated snapshot. It is not a digital signature or independent verification of the findings.</p>
        {report.integrity_sha256 ? <code className="block select-all break-all font-mono text-xs leading-6 text-ink">{report.integrity_sha256}</code> : <p className="text-sm text-ink-muted">No integrity digest was returned by the report generator.</p>}
        {copyState === 'copied' && <p role="status" className="text-sm text-accent print:hidden">The full digest was copied to the clipboard.</p>}
        {copyError && <p role="alert" className="text-sm text-signal-illicit print:hidden">{copyError}</p>}
      </section>
    </article>
  );
};

export const Reports: React.FC = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesReload, setCasesReload] = useState(0);
  const [reportRevision, setReportRevision] = useState(0);
  const [reportState, setReportState] = useState<ReportState | null>(null);
  const [clipboard, setClipboard] = useState<{ digest: string; status: CopyState; error: string | null } | null>(null);
  const reportRequest = useRef(0);

  const requestedCase = searchParams.get('case');
  const selectedCase = requestedCase ? cases.find((c) => String(c.id) === requestedCase) : cases[0];
  const selectedCaseId = selectedCase?.id ?? null;
  const selection = `${location.key}:${selectedCaseId}:${reportRevision}`;
  const report = reportState?.status === 'ready' && reportState.selection === selection ? reportState.data : null;
  const reportError = reportState?.status === 'error' && reportState.selection === selection ? reportState.message : null;
  const reportLoading = selectedCaseId !== null && reportState?.selection !== selection;
  const currentClipboard = report && clipboard?.digest === report.integrity_sha256 ? clipboard : null;
  const copyState = currentClipboard?.status ?? 'idle';
  const copyError = currentClipboard?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    api.getCases(controller.signal)
      .then((data) => { if (!cancelled) setCases(data); })
      .catch((err: unknown) => {
        if (!cancelled) setCasesError(err instanceof Error ? err.message : 'The case list could not be loaded.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [casesReload]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const request = ++reportRequest.current;
    if (selectedCaseId !== null) {
      api.getCaseReport(selectedCaseId, controller.signal)
        .then((data) => {
          if (cancelled || request !== reportRequest.current) return;
          if (!data || data.case_id !== selectedCaseId) throw new Error('The report response did not match the selected case. Try generating it again.');
          setReportState({ selection, status: 'ready', data });
        })
        .catch((err: unknown) => {
          if (!cancelled && request === reportRequest.current) {
            setReportState({ selection, status: 'error', message: err instanceof Error ? err.message : 'The report could not be generated.' });
          }
        });
    }
    return () => {
      cancelled = true;
      controller.abort();
      if (request === reportRequest.current) reportRequest.current += 1;
    };
  }, [selectedCaseId, selection]);

  const selectCase = (value: string) => {
    if (value === String(selectedCaseId)) return;
    reportRequest.current += 1;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('case', value);
      return next;
    });
  };

  const refreshReport = () => {
    if (selectedCaseId === null || reportLoading) return;
    reportRequest.current += 1;
    setReportRevision((revision) => revision + 1);
  };

  const handleCopyDigest = async (digest: string) => {
    if (!report || copyState === 'copying') return;
    const request = reportRequest.current;
    setClipboard({ digest, status: 'copying', error: null });
    try {
      await navigator.clipboard.writeText(digest);
      if (request === reportRequest.current) setClipboard({ digest, status: 'copied', error: null });
    } catch {
      if (request === reportRequest.current) {
        setClipboard({ digest, status: 'idle', error: 'Could not copy the digest. Select the full value below and copy it manually.' });
      }
    }
  };

  return (
    <div className="workspace-page space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          subtitle="Review a saved case snapshot, check its evidence, and prepare a report for sharing."
          actions={
            <>
              {selectedCaseId !== null && <button type="button" onClick={refreshReport} disabled={loading || !!casesError || reportLoading} className="btn-secondary w-full sm:w-auto"><RefreshCw className="h-4 w-4" aria-hidden="true" />Refresh report</button>}
              <button type="button" onClick={() => window.print()} disabled={!report || loading || !!casesError || reportLoading} className="btn-primary w-full sm:w-auto"><Printer className="h-4 w-4" aria-hidden="true" />Print report</button>
            </>
          }
        />
      </div>

      {loading ? (
        <div role="status" aria-label="Loading report cases" className="print:hidden"><PageSkeleton cards={2} /></div>
      ) : casesError ? (
        <div role="alert" className="print:hidden"><EmptyState icon={AlertCircle} tone="error" title="Cases could not be loaded" description={casesError} actionLabel="Retry loading cases" onAction={() => { setLoading(true); setCasesError(null); setCasesReload((reload) => reload + 1); }} /></div>
      ) : cases.length === 0 ? (
        <div className="space-y-4 print:hidden">
          <EmptyState icon={FileText} title="A report starts with a case" description="Create an investigation, attach transaction references, and record your findings. The saved case becomes the source for its report." />
          <div className="flex justify-center"><Link to="/investigations" className="btn-primary w-full sm:w-auto">Open investigations<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>
        </div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[280px_minmax(0,1fr)] print:block">
          <aside className="panel-surface space-y-5 p-5 print:hidden">
            <div className="space-y-2">
              <label htmlFor="report-case-select" className="field-label">Investigation case</label>
              <select id="report-case-select" value={selectedCaseId ?? ''} onChange={(e) => selectCase(e.target.value)} className="field-input">
                {selectedCaseId === null && <option value="" disabled>Select a case</option>}
                {cases.map((c) => <option key={c.id} value={c.id}>#{c.id}: {c.case_name}</option>)}
              </select>
            </div>
            {selectedCase && (
              <div className="space-y-4 border-t border-line pt-5">
                <div className="space-y-2">
                  <span className="badge-pill badge-unknown">{statusLabels[selectedCase.status]}</span>
                  <p className="break-words text-sm font-medium text-ink">{selectedCase.case_name}</p>
                  <p className="line-clamp-4 break-words text-sm leading-relaxed text-ink-muted">{selectedCase.description || 'No case summary added.'}</p>
                </div>
                <p className="text-xs text-ink-muted">Updated <time dateTime={selectedCase.updated_at}>{new Date(selectedCase.updated_at).toLocaleDateString()}</time></p>
                <Link to={`/cases/${selectedCaseId}`} className="btn-secondary w-full">Open case<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
              </div>
            )}
            <div className="data-note flex items-start gap-2 border-t border-line pt-4"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>A report reflects the saved case at generation time. Refresh it after editing the case.</p></div>
          </aside>

          {selectedCaseId === null ? (
            <div className="print:hidden"><EmptyState icon={FileText} title="This case is not available" description="The case in this link is not in the current case list. Select another investigation to generate its report." /></div>
          ) : reportLoading ? (
            <section className="panel-surface flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center print:hidden" role="status">
              <LoaderCircle className="h-6 w-6 text-accent motion-safe:animate-spin" aria-hidden="true" />
              <div className="space-y-2"><h2 className="section-heading">Preparing the report</h2><p className="text-sm text-ink-muted">Compiling saved transactions, notes, and case findings.</p></div>
            </section>
          ) : reportError ? (
            <div role="alert" className="print:hidden"><EmptyState icon={AlertCircle} tone="error" title="The report could not be generated" description={reportError} actionLabel="Retry report" onAction={refreshReport} /></div>
          ) : report ? (
            <ReportDocument report={report} copyState={copyState} copyError={copyError} onCopyDigest={handleCopyDigest} />
          ) : null}
        </div>
      )}
    </div>
  );
};
