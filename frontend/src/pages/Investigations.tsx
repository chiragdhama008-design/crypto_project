import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Briefcase,
  Plus,
  ArrowRight,
  AlertCircle,
  Search,
  LoaderCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { CaseStatus, InvestigationCase } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { PageSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Modal } from '../components/common/Modal';

const statusLabels: Record<CaseStatus, string> = {
  OPEN: 'Open',
  'UNDER REVIEW': 'Under review',
  CLOSED: 'Closed',
};

export const Investigations: React.FC = () => {
  const navigate = useNavigate();
  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CaseStatus | 'ALL'>('ALL');
  const deferredSearch = useDeferredValue(search);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [caseName, setCaseName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createInFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    api
      .getCases(controller.signal)
      .then((res) => {
        if (cancelled) return;
        setCases(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'The case list could not be loaded.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey]);

  const openCreateModal = () => {
    setCreateError(null);
    setIsModalOpen(true);
  };

  const closeCreateModal = () => {
    if (!createInFlight.current) setIsModalOpen(false);
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createInFlight.current) return;
    if (!caseName.trim()) {
      setCreateError('Enter a name for this case.');
      return;
    }
    createInFlight.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createCase({
        case_name: caseName.trim(),
        description: description.trim(),
      });
      if (!mounted.current) return;
      if (!created || !Number.isSafeInteger(created.id) || created.id <= 0) {
        throw new Error('The server did not confirm the new case. Refresh the case list before trying again.');
      }
      setIsModalOpen(false);
      setCaseName('');
      setDescription('');
      navigate(`/cases/${created.id}`);
    } catch (err: unknown) {
      if (mounted.current) {
        setCreateError(err instanceof Error ? err.message : 'The case could not be created. Your draft has been kept.');
      }
    } finally {
      createInFlight.current = false;
      if (mounted.current) setCreating(false);
    }
  };

  const query = deferredSearch.trim().toLocaleLowerCase();
  const filteredCases = cases.filter((c) =>
    (status === 'ALL' || c.status === status) &&
    (!query || `${c.id} ${c.case_name} ${c.description || ''}`.toLocaleLowerCase().includes(query))
  );

  return (
    <div className="workspace-page space-y-6">
      <PageHeader
        title="Investigations"
        subtitle="Keep transaction evidence, investigator notes, and case reports in one place."
        actions={
          <button type="button" onClick={openCreateModal} className="btn-primary w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Create case</span>
          </button>
        }
      />

      {loading ? (
        <div role="status" aria-label="Loading investigations">
          <PageSkeleton cards={3} />
        </div>
      ) : error ? (
        <div role="alert">
          <EmptyState
            icon={AlertCircle}
            tone="error"
            title="Cases could not be loaded"
            description={error}
            actionLabel="Retry loading cases"
            onAction={() => {
              setLoading(true);
              setError(null);
              setReloadKey((key) => key + 1);
            }}
          />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Your first case starts here"
          description="Create a case to collect transaction references, record what you find, and prepare a report for review."
          actionLabel="Create case"
          onAction={openCreateModal}
        />
      ) : (
        <section aria-labelledby="case-files-heading" className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <label htmlFor="case-search" className="field-label">Search cases</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <input
                  id="case-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Case name, description, or ID"
                  className="field-input pl-10"
                />
              </div>
            </div>
            <div className="space-y-2 sm:w-48">
              <label htmlFor="case-status-filter" className="field-label">Case status</label>
              <select
                id="case-status-filter"
                value={status}
                onChange={(e) => setStatus(e.target.value as CaseStatus | 'ALL')}
                className="field-input"
              >
                <option value="ALL">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="case-files-heading" className="section-heading">Case files</h2>
            <p className="text-sm text-ink-muted" role="status">
              <span className="font-mono tabular-nums text-ink">{filteredCases.length}</span>
              {' '}{filteredCases.length === 1 ? 'case' : 'cases'}
              {query || status !== 'ALL' ? ' matching your filters' : ', most recently updated first'}
            </p>
          </div>

          {filteredCases.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No cases match these filters"
              description="Try a different name or ID, or clear the status filter to see all cases."
              actionLabel="Clear filters"
              onAction={() => { setSearch(''); setStatus('ALL'); }}
            />
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredCases.map((c) => (
                <li key={c.id} className="min-w-0">
                  <Link
                    to={`/cases/${c.id}`}
                    className="panel-surface group flex h-full min-h-[232px] flex-col gap-5 p-5 hover:border-accent-border motion-safe:transition-[transform,border-color] motion-safe:duration-200 motion-safe:hover:-translate-y-0.5"
                    aria-label={`Open case ${c.id}: ${c.case_name}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
                        <Briefcase className="h-4 w-4" aria-hidden="true" />
                        Case <span className="font-mono tabular-nums text-ink">#{c.id}</span>
                      </span>
                      <span className={`badge-pill ${c.status === 'OPEN' ? 'badge-accent' : 'badge-unknown'}`}>
                        {statusLabels[c.status]}
                      </span>
                    </div>
                    <div className="flex-1 space-y-2">
                      <h3 className="break-words text-base font-semibold leading-snug text-ink group-hover:text-accent motion-safe:transition-colors">
                        {c.case_name}
                      </h3>
                      <p className="line-clamp-2 break-words text-sm leading-relaxed text-ink-muted">
                        {c.description || 'No case summary added.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-ink-muted">
                      <div className="space-y-1">
                        <p><span className="font-mono tabular-nums text-ink">{c.transaction_count}</span> {c.transaction_count === 1 ? 'transaction' : 'transactions'}</p>
                        <p>Updated <time dateTime={c.updated_at}>{new Date(c.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></p>
                      </div>
                      <span className="inline-flex items-center gap-2 font-medium text-accent">
                        Open case
                        <ArrowRight className="h-4 w-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal
        open={isModalOpen}
        onClose={closeCreateModal}
        title="Create a case"
        description="Give the investigation a name and describe what needs reviewing. You can attach transactions next."
        className="max-w-lg"
      >
        <form onSubmit={handleCreateCase} className="space-y-5" aria-busy={creating}>
          <div className="space-y-2">
            <label htmlFor="case-name-input" className="field-label">Case name <span className="text-ink-muted">(required)</span></label>
            <input
              id="case-name-input"
              type="text"
              required
              maxLength={256}
              autoComplete="off"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              disabled={creating}
              placeholder="Name the investigation"
              className="field-input"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="case-desc-input" className="field-label">Case summary <span className="text-ink-muted">(optional)</span></label>
            <textarea
              id="case-desc-input"
              rows={4}
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={creating}
              placeholder="What are you investigating, and why?"
              className="field-input resize-y"
            />
          </div>
          {createError && <p role="alert" className="text-sm text-signal-illicit">{createError}</p>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeCreateModal} disabled={creating} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={creating || !caseName.trim()} className="btn-primary">
              {creating ? <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              {creating ? 'Creating case...' : 'Create case'}
            </button>
          </div>
          {creating && <p role="status" className="text-sm text-ink-muted">Saving the case. This dialog will stay open until the request finishes.</p>}
        </form>
      </Modal>
    </div>
  );
};
