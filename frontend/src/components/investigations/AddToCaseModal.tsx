import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, LoaderCircle, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { InvestigationCase } from '../../types/api';
import { Modal } from '../common/Modal';

interface AddToCaseModalProps {
  transactionId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AddToCaseModal: React.FC<AddToCaseModalProps> = ({
  transactionId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseDesc, setNewCaseDesc] = useState('');
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesReload, setCasesReload] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCase, setSavedCase] = useState<InvestigationCase | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const submissionLock = useRef(false);
  const lifecycle = useRef(0);

  useEffect(() => {
    lifecycle.current += 1;
    submissionLock.current = false;
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setSavedCase(null);
      setSelectedCaseId(null);
      setCases([]);
      setNote('');
      setIsCreatingNew(false);
      setNewCaseName('');
      setNewCaseDesc('');
      setSubmitting(false);
    }
    return () => { lifecycle.current += 1; };
  }, [isOpen, transactionId]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCasesLoading(true);
    setCasesError(null);
    api.getCases()
      .then((data) => {
        if (cancelled) return;
        setCases(data);
        setSelectedCaseId((previous) => data.some((c) => c.id === previous) ? previous : data[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setCasesError(err instanceof Error ? err.message : 'The case list could not be loaded.');
      })
      .finally(() => { if (!cancelled) setCasesLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, transactionId, casesReload]);

  const closeModal = () => {
    if (!submissionLock.current) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionLock.current || successMsg) return;
    setError(null);
    if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
      setError('This transaction ID is not a valid positive whole number.');
      return;
    }
    if (!savedCase && isCreatingNew && !newCaseName.trim()) {
      setError('Enter a name for the new case.');
      return;
    }
    if (!savedCase && !isCreatingNew && (!selectedCaseId || casesLoading || casesError)) {
      setError('Select an available investigation case, or create a new one.');
      return;
    }
    if (note.trim().length > (isCreatingNew ? 4000 : 2000)) {
      setError(`Shorten the note to ${isCreatingNew ? 4000 : 2000} characters or fewer.`);
      return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    const request = lifecycle.current;
    let confirmedCase = savedCase;
    let confirmed = false;
    try {
      if (!confirmedCase) {
        const response = isCreatingNew
          ? await api.createCase({
              case_name: newCaseName.trim(),
              description: newCaseDesc.trim(),
              initial_transactions: [transactionId],
            })
          : await api.addTransactionsToCase(selectedCaseId!, [transactionId], note.trim() || undefined);
        if (request !== lifecycle.current) return;
        if (!response || !Number.isSafeInteger(response.id) || response.id <= 0 || (!isCreatingNew && response.id !== selectedCaseId) || !response.transactions?.some((t) => t.transaction_id === transactionId)) {
          throw new Error('The server did not confirm the attachment. Check the case before submitting again.');
        }
        confirmedCase = response;
        setSavedCase(response);
      }
      if (isCreatingNew && note.trim()) {
        const savedNote = await api.addNoteToCase(confirmedCase.id, note.trim(), transactionId);
        if (request !== lifecycle.current) return;
        if (!savedNote || savedNote.case_id !== confirmedCase.id || !Number.isSafeInteger(savedNote.id)) {
          throw new Error('The server did not confirm the investigator note. Check the case notes before retrying.');
        }
      }
      const attachment = confirmedCase.transactions?.find((t) => t.transaction_id === transactionId);
      setSuccessMsg(!isCreatingNew && note.trim() && attachment?.notes !== note.trim()
        ? 'The transaction is linked to the case. It was already attached, so the existing attachment note was kept.'
        : note.trim() ? 'The transaction reference and note are saved in this case.' : 'The transaction reference is saved in this case.');
      confirmed = true;
    } catch (err: unknown) {
      if (request === lifecycle.current) {
        const message = err instanceof Error ? err.message : 'The request could not be completed.';
        setError(confirmedCase && isCreatingNew
          ? `The case and transaction are saved, but the note could not be saved. ${message} Retrying here only saves the note.`
          : message);
      }
    } finally {
      if (request === lifecycle.current) {
        submissionLock.current = false;
        setSubmitting(false);
      }
    }
    if (confirmed && request === lifecycle.current) onSuccess?.();
  };

  const fieldsLocked = submitting || savedCase !== null;

  return (
    <Modal
      open={isOpen}
      onClose={closeModal}
      title="Add to a case"
      description="Link this transaction to an investigation and record why it belongs there."
      className="max-w-lg"
    >
      <div className="panel-inset mb-5 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className="text-ink-muted">Transaction</span>
        <span className="font-mono tabular-nums text-ink">#{transactionId}</span>
      </div>

      {successMsg && savedCase ? (
        <div className="space-y-5">
          <div role="status" className="space-y-3">
            <div className="flex items-center gap-2 text-accent"><Check className="h-5 w-5" aria-hidden="true" /><p className="font-medium">Transaction linked</p></div>
            <p className="text-sm leading-relaxed text-ink-secondary">{successMsg}</p>
            <p className="break-words text-sm text-ink">{savedCase.case_name} <span className="font-mono tabular-nums text-ink-muted">#{savedCase.id}</span></p>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Link to={`/cases/${savedCase.id}`} onClick={closeModal} className="btn-secondary">Open case<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            <button type="button" onClick={closeModal} className="btn-primary">Close</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={submitting}>
          {savedCase ? (
            <div role="status" className="space-y-2 border-b border-line pb-4 text-sm">
              <p className="font-medium text-accent">Case created and transaction linked</p>
              <Link to={`/cases/${savedCase.id}`} onClick={closeModal} className="text-link inline-flex min-h-11 items-center gap-2">Open {savedCase.case_name}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
          ) : (
            <>
              <div className="segmented-control grid grid-cols-2" role="group" aria-label="Case destination">
                <button type="button" onClick={() => { setIsCreatingNew(false); setError(null); }} aria-pressed={!isCreatingNew} disabled={fieldsLocked}>Existing case</button>
                <button type="button" onClick={() => { setIsCreatingNew(true); setError(null); }} aria-pressed={isCreatingNew} disabled={fieldsLocked}>New case</button>
              </div>

              {!isCreatingNew ? (
                <div className="space-y-3">
                  <label htmlFor="existing-case-select" className="field-label">Investigation case</label>
                  {casesLoading ? (
                    <p role="status" className="flex items-center gap-2 py-3 text-sm text-ink-muted"><LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />Loading cases...</p>
                  ) : casesError ? (
                    <div className="space-y-3"><p role="alert" className="text-sm text-signal-illicit">Cases could not be loaded. {casesError}</p><button type="button" onClick={() => setCasesReload((reload) => reload + 1)} disabled={submitting} className="btn-secondary w-full">Retry loading cases</button></div>
                  ) : cases.length === 0 ? (
                    <div className="space-y-3"><p className="text-sm leading-relaxed text-ink-muted">There are no cases yet. Create one for this transaction.</p><button type="button" onClick={() => setIsCreatingNew(true)} className="btn-secondary w-full"><Plus className="h-4 w-4" aria-hidden="true" />Create a new case</button></div>
                  ) : (
                    <select id="existing-case-select" value={selectedCaseId ?? ''} onChange={(e) => setSelectedCaseId(Number(e.target.value))} disabled={fieldsLocked} className="field-input" required>
                      {cases.map((c) => <option key={c.id} value={c.id}>#{c.id}: {c.case_name}</option>)}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="new-case-name" className="field-label">Case name <span className="text-ink-muted">(required)</span></label>
                    <input id="new-case-name" type="text" value={newCaseName} onChange={(e) => setNewCaseName(e.target.value)} maxLength={256} autoComplete="off" disabled={fieldsLocked} placeholder="Name the investigation" className="field-input" required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="new-case-desc" className="field-label">Case summary <span className="text-ink-muted">(optional)</span></label>
                    <textarea id="new-case-desc" rows={3} value={newCaseDesc} onChange={(e) => setNewCaseDesc(e.target.value)} maxLength={4000} disabled={fieldsLocked} placeholder="What needs investigating?" className="field-input resize-y" />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <label htmlFor="case-attach-note" className="field-label">{isCreatingNew ? 'Investigator note' : 'Attachment note'} <span className="text-ink-muted">(optional)</span></label>
            <textarea id="case-attach-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={isCreatingNew ? 4000 : 2000} disabled={submitting} placeholder="Record why this transaction belongs in the case." className="field-input resize-y" aria-describedby={error ? 'case-attach-error' : undefined} />
            <p className="text-xs leading-relaxed text-ink-muted">{isCreatingNew ? 'This note is saved in the case log and linked to the transaction.' : 'This note belongs to the attachment. Existing attachment notes are not overwritten.'}</p>
          </div>
          {error && <p id="case-attach-error" role="alert" className="text-sm leading-relaxed text-signal-illicit">{error}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeModal} disabled={submitting} className="btn-secondary">{savedCase ? 'Close' : 'Cancel'}</button>
            <button type="submit" disabled={submitting || (!savedCase && (isCreatingNew ? !newCaseName.trim() : casesLoading || !!casesError || !selectedCaseId))} className="btn-primary">
              {submitting && <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
              {submitting ? 'Saving...' : savedCase ? note.trim() ? 'Retry saving note' : 'Finish' : isCreatingNew ? 'Create case and attach' : 'Attach transaction'}
            </button>
          </div>
          {submitting && <p role="status" className="text-sm text-ink-muted">Saving the attachment. This dialog will stay open until the request finishes.</p>}
        </form>
      )}
    </Modal>
  );
};
