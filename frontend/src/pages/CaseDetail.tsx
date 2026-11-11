import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  ArrowUpRight,
  Printer,
  Check,
  AlertTriangle,
  Plus,
  LoaderCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { InvestigationCase, CaseStatus } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { PageSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';
import { ReportDocument } from './Reports';

const caseTabs = [
  { id: 'OVERVIEW', label: 'Overview' },
  { id: 'TRANSACTIONS', label: 'Transactions' },
  { id: 'NOTES', label: 'Notes' },
  { id: 'REPORT', label: 'Report' },
] as const;
type CaseTab = typeof caseTabs[number]['id'];
type CaseNote = NonNullable<InvestigationCase['notes']>[number];
const statusLabels: Record<CaseStatus, string> = { OPEN: 'Open', 'UNDER REVIEW': 'Under review', CLOSED: 'Closed' };

const CaseWorkspace: React.FC<{ cId: number | null }> = ({ cId }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CaseTab>('OVERVIEW');
  const [caseData, setCaseData] = useState<InvestigationCase | null>(null);
  const [reportData, setReportData] = useState<Awaited<ReturnType<typeof api.getCaseReport>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [caseError, setCaseError] = useState<{ caseId: number | null; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState<'status' | 'transaction' | 'note' | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportRevision, setReportRevision] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [noteAuthor, setNoteAuthor] = useState('Investigator');
  const [txInput, setTxInput] = useState('');
  const caseRequest = useRef(0);
  const reportRequest = useRef(0);
  const mutationLock = useRef(false);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const currentCase = caseData?.id === cId ? caseData : null;
  const error = caseError?.caseId === cId ? caseError.message : null;
  const reportLoading = activeTab === 'REPORT' && !reportData && !reportError && !saving;

  useEffect(() => {
    if (cId === null) return;
    let cancelled = false;
    const controller = new AbortController();
    const request = ++caseRequest.current;
    api.getCase(cId, controller.signal)
      .then((res) => {
        if (cancelled || request !== caseRequest.current) return;
        if (!res || res.id !== cId) throw new Error('The server did not return the requested case.');
        setCaseData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled && request === caseRequest.current) setCaseError({ caseId: cId, message: err instanceof Error ? err.message : 'The case could not be loaded.' });
      })
      .finally(() => { if (!cancelled && request === caseRequest.current) setLoading(false); });
    return () => {
      cancelled = true;
      controller.abort();
      if (request === caseRequest.current) caseRequest.current += 1;
      reportRequest.current += 1;
    };
  }, [cId, reloadKey]);

  useEffect(() => {
    if (activeTab !== 'REPORT' || cId === null || caseData?.id !== cId || saving) return;
    let cancelled = false;
    const controller = new AbortController();
    const request = ++reportRequest.current;
    api.getCaseReport(cId, controller.signal)
      .then((data) => {
        if (cancelled || request !== reportRequest.current) return;
        if (!data || data.case_id !== cId) throw new Error('The report response did not match this case. Try generating it again.');
        setReportData(data);
      })
      .catch((err: unknown) => {
        if (!cancelled && request === reportRequest.current) setReportError(err instanceof Error ? err.message : 'The report could not be generated.');
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (request === reportRequest.current) reportRequest.current += 1;
    };
  }, [cId, activeTab, caseData?.id, reportRevision, saving]);

  const invalidateReport = () => {
    reportRequest.current += 1;
    setReportData(null);
    setReportError(null);
    setCopyState('idle');
    setCopyError(null);
  };

  const handleStatusChange = async (newStatus: CaseStatus) => {
    if (mutationLock.current || !currentCase || cId === null || newStatus === currentCase.status) return;
    mutationLock.current = true;
    const request = caseRequest.current;
    setSaving('status');
    setStatusError(null);
    setNotice(null);
    invalidateReport();
    try {
      const updated = await api.updateCase(cId, { status: newStatus });
      if (request !== caseRequest.current) return;
      if (!updated || updated.id !== cId || updated.status !== newStatus) throw new Error('The server did not confirm the status change. Reload the case before trying again.');
      setCaseData(updated);
      setNotice(`Case status changed to ${statusLabels[newStatus].toLowerCase()}.`);
      setReportRevision((revision) => revision + 1);
    } catch (err: unknown) {
      if (request === caseRequest.current) setStatusError(err instanceof Error ? err.message : 'The case status could not be saved.');
    } finally {
      if (request === caseRequest.current) { mutationLock.current = false; setSaving(null); }
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutationLock.current || !currentCase || cId === null) return;
    if (!newNote.trim()) { setNoteError('Write a note before saving it.'); return; }
    mutationLock.current = true;
    const request = caseRequest.current;
    setSaving('note');
    setNoteError(null);
    setNotice(null);
    invalidateReport();
    try {
      const savedNote: CaseNote = await api.addNoteToCase(cId, newNote.trim(), undefined, noteAuthor.trim() || undefined);
      if (request !== caseRequest.current) return;
      if (!savedNote || savedNote.case_id !== cId || !Number.isSafeInteger(savedNote.id) || savedNote.id <= 0) throw new Error('The server did not confirm the note. Check the case log before trying again.');
      setCaseData((previous) => previous?.id === cId ? { ...previous, notes: [savedNote, ...(previous.notes || [])], updated_at: savedNote.created_at } : previous);
      setNewNote('');
      setNotice('Investigator note saved.');
      setReportRevision((revision) => revision + 1);
    } catch (err: unknown) {
      if (request === caseRequest.current) setNoteError(err instanceof Error ? err.message : 'The note could not be saved. Your draft has been kept.');
    } finally {
      if (request === caseRequest.current) { mutationLock.current = false; setSaving(null); }
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutationLock.current || !currentCase || cId === null) return;
    const value = txInput.trim();
    if (!/^[1-9]\d*$/.test(value)) {
      setTransactionError('Enter a positive whole-number transaction ID, using digits only.');
      return;
    }
    const transactionId = Number(value);
    if (!Number.isSafeInteger(transactionId)) {
      setTransactionError('This ID is too large to represent safely. Check the transaction ID and try again.');
      return;
    }
    if (currentCase.transactions?.some((t) => t.transaction_id === transactionId)) {
      setTransactionError('This transaction is already attached to the case.');
      return;
    }
    mutationLock.current = true;
    const request = caseRequest.current;
    setSaving('transaction');
    setTransactionError(null);
    setNotice(null);
    invalidateReport();
    try {
      const updated = await api.addTransactionsToCase(cId, [transactionId]);
      if (request !== caseRequest.current) return;
      if (!updated || updated.id !== cId || !updated.transactions?.some((t) => t.transaction_id === transactionId)) throw new Error('The server did not confirm the attachment. Reload the case before trying again.');
      setCaseData(updated);
      setTxInput('');
      setNotice(`Transaction #${transactionId} attached to the case.`);
      setReportRevision((revision) => revision + 1);
    } catch (err: unknown) {
      if (request === caseRequest.current) setTransactionError(err instanceof Error ? err.message : 'The transaction could not be attached.');
    } finally {
      if (request === caseRequest.current) { mutationLock.current = false; setSaving(null); }
    }
  };

  const loadReport = () => {
    if (mutationLock.current || (activeTab === 'REPORT' && reportLoading)) return;
    invalidateReport();
    setActiveTab('REPORT');
    setReportRevision((revision) => revision + 1);
  };

  const selectTab = (tab: CaseTab) => {
    if (activeTab === tab) return;
    if (tab === 'REPORT') invalidateReport();
    setActiveTab(tab);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % caseTabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + caseTabs.length) % caseTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = caseTabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(caseTabs[next].id);
    tabButtons.current[next]?.focus();
  };

  const handleCopyDigest = async (digest: string) => {
    if (!reportData || copyState === 'copying') return;
    const request = reportRequest.current;
    setCopyState('copying');
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(digest);
      if (request === reportRequest.current) setCopyState('copied');
    } catch {
      if (request === reportRequest.current) {
        setCopyState('idle');
        setCopyError('Could not copy the digest. Select the full value below and copy it manually.');
      }
    }
  };

  if (cId !== null && (loading || (!currentCase && !error))) {
    return <div className="workspace-page space-y-6" role="status" aria-label="Loading investigation case"><PageSkeleton cards={4} /></div>;
  }

  if (error || !currentCase) {
    return (
      <div className="workspace-page space-y-6">
        <PageHeader title="Case unavailable" backLabel="Investigations" onBack={() => navigate('/investigations')} />
        <div role="alert"><EmptyState icon={AlertTriangle} tone="error" title="This case could not be opened" description={cId === null ? 'The case ID must be a positive whole number.' : error || 'The requested case record could not be loaded.'} actionLabel={cId === null ? 'Open investigations' : 'Retry loading case'} onAction={cId === null ? () => navigate('/investigations') : () => { setLoading(true); setCaseError(null); setReloadKey((key) => key + 1); }} /></div>
      </div>
    );
  }

  const txs = currentCase.transactions || [];
  const notes = currentCase.notes || [];
  const highRiskCount = txs.filter((t) => typeof t.risk_score === 'number' && Number.isFinite(t.risk_score) && (t.risk_level === 'HIGH' || t.risk_level === 'CRITICAL')).length;
  const attachmentForm = (
    <aside className="panel-surface h-fit space-y-4 p-5">
      <div className="space-y-2"><h2 className="section-heading">Attach a transaction</h2><p className="text-sm leading-relaxed text-ink-muted">Add an Elliptic transaction reference to this case.</p></div>
      <form onSubmit={handleAddTransaction} className="space-y-4" aria-busy={saving === 'transaction'}>
        <div className="space-y-2">
          <label htmlFor="case-transaction-input" className="field-label">Transaction ID</label>
          <input id="case-transaction-input" type="text" inputMode="numeric" autoComplete="off" maxLength={20} value={txInput} onChange={(e) => setTxInput(e.target.value)} disabled={!!saving} required placeholder="Enter a transaction ID" className="field-input font-mono tabular-nums" aria-invalid={!!transactionError} aria-describedby={transactionError ? 'case-transaction-error case-transaction-help' : 'case-transaction-help'} />
          {transactionError && <p id="case-transaction-error" role="alert" className="text-sm text-signal-illicit">{transactionError}</p>}
          <p id="case-transaction-help" className="text-xs leading-relaxed text-ink-muted">Attaching a reference does not run a model. Analysis may be unavailable if its data has not been indexed.</p>
        </div>
        <button type="submit" disabled={!!saving || !txInput.trim()} className="btn-primary w-full">
          {saving === 'transaction' ? <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {saving === 'transaction' ? 'Attaching transaction...' : 'Attach transaction'}
        </button>
      </form>
    </aside>
  );

  return (
    <div className="workspace-page space-y-6">
      <div className="space-y-5 print:hidden">
        <PageHeader
          backLabel="Investigations"
          onBack={() => navigate('/investigations')}
          eyebrow={`Case #${currentCase.id}`}
          badges={[{ label: statusLabels[currentCase.status], tone: currentCase.status === 'OPEN' ? 'accent' : 'unknown' }]}
          title={currentCase.case_name}
          subtitle="Review transaction evidence, add investigator notes, and manage the case."
          actions={
            <>
              <div className="w-full space-y-1.5 sm:w-40">
                <label htmlFor="case-workflow-status" className="field-label">Case status</label>
                <select id="case-workflow-status" value={currentCase.status} onChange={(e) => handleStatusChange(e.target.value as CaseStatus)} disabled={!!saving} className="field-input" aria-describedby={statusError ? 'case-status-error' : undefined}>
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <button type="button" onClick={loadReport} disabled={!!saving || (activeTab === 'REPORT' && reportLoading)} className="btn-primary w-full self-end sm:w-auto">
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>{activeTab === 'REPORT' ? 'Refresh report' : 'Generate report'}</span>
              </button>
            </>
          }
        />

        {statusError && <p id="case-status-error" role="alert" className="text-sm text-signal-illicit">{statusError}</p>}
        {saving === 'status' && <p role="status" className="flex items-center gap-2 text-sm text-ink-muted"><LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />Saving the case status...</p>}
        {notice && <p role="status" className="flex items-center gap-2 text-sm text-accent"><Check className="h-4 w-4 shrink-0" aria-hidden="true" />{notice}</p>}

        <dl className="panel-surface grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
          <div className="space-y-1.5"><dt className="text-xs text-ink-muted">Transactions</dt><dd className="font-mono text-2xl tabular-nums text-ink">{txs.length}</dd></div>
          <div className="space-y-1.5"><dt className="text-xs text-ink-muted">Dataset illicit</dt><dd className="font-mono text-2xl tabular-nums text-ink">{txs.filter((t) => t.known_label === 'ILLICIT').length}</dd></div>
          <div className="space-y-1.5"><dt className="text-xs text-ink-muted">High / critical risk</dt><dd className="font-mono text-2xl tabular-nums text-ink">{highRiskCount}</dd></div>
          <div className="space-y-1.5"><dt className="text-xs text-ink-muted">Investigator notes</dt><dd className="font-mono text-2xl tabular-nums text-ink">{notes.length}</dd></div>
        </dl>

        <div role="tablist" aria-label="Case workspace" className="flex gap-1 overflow-x-auto border-b border-line">
          {caseTabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`case-tab-${tab.id}`}
              ref={(node) => { tabButtons.current[index] = node; }}
              role="tab"
              type="button"
              aria-selected={activeTab === tab.id}
              aria-controls={activeTab === tab.id ? `case-panel-${tab.id}` : undefined}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm motion-safe:transition-colors ${
                activeTab === tab.id
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
              {(tab.id === 'TRANSACTIONS' || tab.id === 'NOTES') && <span className="font-mono text-xs tabular-nums text-ink-muted">{tab.id === 'TRANSACTIONS' ? txs.length : notes.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'OVERVIEW' && (
        <section
          id="case-panel-OVERVIEW"
          role="tabpanel"
          aria-labelledby="case-tab-OVERVIEW"
          tabIndex={0}
          className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="min-w-0 space-y-6">
            <section className="panel-surface space-y-4 p-5 sm:p-6" aria-labelledby="case-summary-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="case-summary-heading" className="section-heading">Case summary</h2>
                <span className="text-xs text-ink-muted">
                  Updated <time dateTime={currentCase.updated_at}>{new Date(currentCase.updated_at).toLocaleString()}</time>
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-secondary">
                {currentCase.description?.trim() || 'No case summary has been added yet.'}
              </p>
              <dl className="grid gap-4 border-t border-line pt-4 text-xs sm:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-ink-muted">Created</dt>
                  <dd className="text-ink tabular-nums">{new Date(currentCase.created_at).toLocaleString()}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-ink-muted">Linked entities</dt>
                  <dd className="font-mono text-ink tabular-nums">
                    {txs.length} {txs.length === 1 ? 'transaction' : 'transactions'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="panel-surface space-y-4 p-5 sm:p-6" aria-labelledby="overview-transactions-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="overview-transactions-heading" className="section-heading">Attached transactions</h2>
                {txs.length > 0 && (
                  <button type="button" onClick={() => selectTab('TRANSACTIONS')} className="text-link">
                    View full registry
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {txs.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No transactions are attached to this case yet. Use the form beside this panel to link an Elliptic transaction ID.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {txs.map((t) => (
                    <li key={t.transaction_id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <Link
                          to={`/transactions/${t.transaction_id}`}
                          className="text-link font-mono tabular-nums"
                        >
                          #{t.transaction_id}
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                        <span className="font-mono text-xs text-ink-muted tabular-nums">Step {t.time_step}</span>
                        <LabelBadge label={t.known_label} />
                        {t.prediction && <LabelBadge label={t.prediction} isPrediction />}
                      </div>
                      <div>
                        {typeof t.risk_score === 'number' && Number.isFinite(t.risk_score) ? (
                          <RiskBadge score={t.risk_score} level={t.risk_level} />
                        ) : (
                          <span className="text-xs text-ink-muted">Not scored</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {attachmentForm}
        </section>
      )}

      {activeTab === 'TRANSACTIONS' && (
        <section
          id="case-panel-TRANSACTIONS"
          role="tabpanel"
          aria-labelledby="case-tab-TRANSACTIONS"
          tabIndex={0}
          className="panel-surface overflow-hidden"
        >
          {txs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No transactions attached"
              description="Link an Elliptic transaction reference from Overview or open Transactions to browse indexed records."
              actionLabel="Attach from Overview"
              onAction={() => selectTab('OVERVIEW')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="tx-table min-w-[720px]">
                <caption className="sr-only">Transactions attached to case #{currentCase.id}. Dataset labels and model predictions are separate.</caption>
                <thead>
                  <tr>
                    <th scope="col">Transaction</th>
                    <th scope="col">Step</th>
                    <th scope="col">Dataset label</th>
                    <th scope="col">Model prediction</th>
                    <th scope="col">Risk</th>
                    <th scope="col">Attachment notes</th>
                    <th scope="col" className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.transaction_id}>
                      <td>
                        <Link
                          to={`/transactions/${t.transaction_id}`}
                          className="text-link font-mono tabular-nums"
                        >
                          #{t.transaction_id}
                        </Link>
                      </td>
                      <td className="font-mono text-ink-muted tabular-nums">Step {t.time_step}</td>
                      <td><LabelBadge label={t.known_label} /></td>
                      <td>
                        {t.prediction ? (
                          <LabelBadge label={t.prediction} isPrediction />
                        ) : (
                          <span className="text-ink-muted">Not available</span>
                        )}
                      </td>
                      <td>
                        {typeof t.risk_score === 'number' && Number.isFinite(t.risk_score) ? (
                          <RiskBadge score={t.risk_score} level={t.risk_level} />
                        ) : (
                          <span className="text-ink-muted">Not scored</span>
                        )}
                      </td>
                      <td className="max-w-xs whitespace-pre-wrap break-words text-sm text-ink-secondary">{t.notes || <span className="text-ink-muted">No note</span>}</td>
                      <td className="text-right">
                        <Link
                          to={`/transactions/${t.transaction_id}`}
                          className="text-link justify-end"
                        >
                          Inspect
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'NOTES' && (
        <section
          id="case-panel-NOTES"
          role="tabpanel"
          aria-labelledby="case-tab-NOTES"
          tabIndex={0}
          className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
        >
          <div className="panel-surface min-w-0 space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <h2 className="section-heading">Investigator notes</h2>
              <span className="font-mono text-xs text-ink-muted tabular-nums">
                {notes.length} {notes.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            {notes.length === 0 ? (
              <p className="py-6 text-sm text-ink-muted">
                No investigator notes have been recorded for this case yet.
              </p>
            ) : (
              <ol className="divide-y divide-line">
                {notes.map((note) => (
                  <li key={note.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-ink">{note.author}</span>
                      <time dateTime={note.created_at} className="text-ink-muted tabular-nums">
                        {new Date(note.created_at).toLocaleString()}
                      </time>
                    </div>
                    {note.transaction_id != null && (
                      <Link
                        to={`/transactions/${note.transaction_id}`}
                        className="text-link text-xs"
                      >
                        Transaction <span className="font-mono tabular-nums">#{note.transaction_id}</span>
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink-secondary">
                      {note.note}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <aside className="panel-surface h-fit space-y-4 p-5">
            <div className="space-y-2">
              <h2 className="section-heading">Add investigator note</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                Record corroborating evidence, flow patterns, or analyst observations in the case log.
              </p>
            </div>
            <form onSubmit={handleAddNote} className="space-y-4" aria-busy={saving === 'note'}>
              <div className="space-y-2">
                <label htmlFor="case-note-author" className="field-label">Author</label>
                <input
                  id="case-note-author"
                  type="text"
                  maxLength={64}
                  value={noteAuthor}
                  onChange={(e) => setNoteAuthor(e.target.value)}
                  disabled={!!saving}
                  className="field-input"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="case-note-body" className="field-label">
                  Note <span className="text-ink-muted">(required)</span>
                </label>
                <textarea
                  id="case-note-body"
                  rows={4}
                  maxLength={4000}
                  required
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  disabled={!!saving}
                  placeholder="Document observations, counterparty links, or off-chain corroboration..."
                  className="field-input resize-y"
                  aria-invalid={!!noteError}
                  aria-describedby={noteError ? 'case-note-error' : undefined}
                />
                {noteError && (
                  <p id="case-note-error" role="alert" className="text-sm text-signal-illicit">
                    {noteError}
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={!!saving || !newNote.trim()}
                className="btn-primary w-full"
              >
                {saving === 'note' ? (
                  <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                {saving === 'note' ? 'Saving note...' : 'Save note'}
              </button>
            </form>
          </aside>
        </section>
      )}

      {activeTab === 'REPORT' && (
        <section
          id="case-panel-REPORT"
          role="tabpanel"
          aria-labelledby="case-tab-REPORT"
          tabIndex={0}
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <p className="text-sm text-ink-muted">
              Generated from the saved state of case #{currentCase.id}.
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!reportData || !!saving || reportLoading}
              className="btn-secondary w-full sm:w-auto"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print report
            </button>
          </div>

          {saving || reportLoading ? (
            <section
              className="panel-surface flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center print:hidden"
              role="status"
            >
              <LoaderCircle className="h-6 w-6 text-accent motion-safe:animate-spin" aria-hidden="true" />
              <div className="space-y-2">
                <h2 className="section-heading">{saving ? 'Saving case changes' : 'Preparing the report'}</h2>
                <p className="text-sm text-ink-muted">{saving ? 'The report will be generated after the current save finishes.' : 'Compiling saved transactions, notes, and case findings.'}</p>
              </div>
            </section>
          ) : reportError ? (
            <div role="alert" className="print:hidden">
              <EmptyState
                icon={AlertTriangle}
                tone="error"
                title="The report could not be generated"
                description={reportError}
                actionLabel="Retry report"
                onAction={loadReport}
              />
            </div>
          ) : reportData ? (
            <ReportDocument
              report={reportData}
              copyState={copyState}
              copyError={copyError}
              onCopyDigest={handleCopyDigest}
            />
          ) : null}
        </section>
      )}
    </div>
  );
};

export const CaseDetail: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const cId = caseId && /^[1-9]\d*$/.test(caseId) && Number.isSafeInteger(Number(caseId)) ? Number(caseId) : null;
  return <CaseWorkspace key={cId ?? 'invalid'} cId={cId} />;
};
