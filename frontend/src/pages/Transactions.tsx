import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  X,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api';
import { TransactionSummary } from '../types/api';
import { PageHeader } from '../components/common/PageHeader';
import { TableRowsSkeleton } from '../components/common/LoadingSkeleton';
import { RiskBadge } from '../components/common/RiskBadge';
import { LabelBadge } from '../components/common/LabelBadge';

export const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [transactions, setTransactions] = useState<TransactionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 25;
  const labelFilter = searchParams.get('label') || '';
  const predFilter = searchParams.get('prediction') || '';
  const riskFilter = searchParams.get('risk_level') || '';
  const timeStepFilter = searchParams.get('time_step') || '';
  const search = searchParams.get('search') || '';

  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const fetchTransactions = useCallback(() => {
    setLoading(true);
    api
      .getTransactions({
        page,
        limit,
        label: labelFilter || undefined,
        prediction: predFilter || undefined,
        risk_level: riskFilter || undefined,
        time_step: timeStepFilter ? parseInt(timeStepFilter, 10) : undefined,
        search: search || undefined,
      })
      .then((res) => {
        setTransactions(res.transactions);
        setTotal(res.total);
        setTotalPages(Math.max(1, res.total_pages));
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, limit, labelFilter, predFilter, riskFilter, timeStepFilter, search]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const updateParam = (key: string, value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    if (key !== 'page') {
      nextParams.set('page', '1');
    }
    setSearchParams(nextParams);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchParams({});
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam('search', searchInput.trim());
  };

  const hasActiveFilters = Boolean(
    labelFilter || predFilter || riskFilter || timeStepFilter || search
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fade-up">
      <PageHeader
        eyebrow="BITCOIN UTXO LEDGER"
        badges={[
          { label: `${total.toLocaleString()} MATCHING RECORDS`, tone: 'accent' },
          { label: '203,769 FULL GRAPH', tone: 'unknown' },
        ]}
        title="Transaction Ledger"
        subtitle="Inspect ground-truth labels, ML illicit inference probabilities, composite risk tiers, and directed graph connectivity across indexed transactions."
        actions={
          <button
            type="button"
            onClick={fetchTransactions}
            disabled={loading}
            className="btn-secondary"
          >
            <RefreshCw className={`w-4 h-4 text-accent ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Filter Toolbar */}
      <section aria-label="Transaction Filters" className="panel-surface p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* ID Search */}
          <form onSubmit={handleSearchSubmit} className="relative sm:col-span-2 lg:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              type="text"
              aria-label="Filter by transaction ID"
              placeholder="Search Transaction ID (e.g. 230425980)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="field-input pl-9 pr-16 font-mono tabular-nums"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-elevated hover:bg-hoverbg border border-line text-[11px] font-mono text-ink transition-colors"
            >
              Find
            </button>
          </form>

          {/* Ground Truth Label */}
          <div>
            <select
              aria-label="Filter by ground truth label"
              value={labelFilter}
              onChange={(e) => updateParam('label', e.target.value)}
              className="field-input font-mono"
            >
              <option value="">Ground Truth: All</option>
              <option value="ILLICIT">Label: ILLICIT</option>
              <option value="LICIT">Label: LICIT</option>
              <option value="UNKNOWN">Label: UNKNOWN</option>
            </select>
          </div>

          {/* Model Prediction */}
          <div>
            <select
              aria-label="Filter by model prediction"
              value={predFilter}
              onChange={(e) => updateParam('prediction', e.target.value)}
              className="field-input font-mono"
            >
              <option value="">Prediction: All</option>
              <option value="ILLICIT">Predicted: ILLICIT</option>
              <option value="LICIT">Predicted: LICIT</option>
            </select>
          </div>

          {/* Risk Tier */}
          <div>
            <select
              aria-label="Filter by risk tier"
              value={riskFilter}
              onChange={(e) => updateParam('risk_level', e.target.value)}
              className="field-input font-mono"
            >
              <option value="">Risk Tier: All</option>
              <option value="CRITICAL">Critical (81–100)</option>
              <option value="HIGH">High (61–80)</option>
              <option value="MEDIUM">Medium (31–60)</option>
              <option value="LOW">Low (0–30)</option>
            </select>
          </div>

          {/* Clear Filter Action */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
              className="btn-secondary w-full font-mono text-xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Table Card */}
      <section className="panel-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>Step</th>
                <th>Ground Truth</th>
                <th>ML Prediction</th>
                <th>Probability</th>
                <th>Risk Score</th>
                <th>Risk Tier</th>
                <th>Degree (In / Out)</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowsSkeleton rows={10} cols={9} />
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center">
                    <div className="inline-flex items-center gap-2 text-signal-illicit text-xs font-mono">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Error loading transactions: {error}</span>
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center space-y-2">
                    <div className="text-sm text-ink-secondary font-medium">
                      No transactions found matching the selected filters.
                    </div>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="btn-secondary mt-2"
                      >
                        Clear Active Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={tx.transaction_id}
                    onClick={() => navigate(`/transactions/${tx.transaction_id}`)}
                    className="cursor-pointer group"
                  >
                    <td className="font-mono font-semibold text-ink group-hover:text-accent tabular-nums">
                      #{tx.transaction_id}
                    </td>
                    <td className="font-mono text-ink-secondary tabular-nums">
                      Step {tx.time_step}
                    </td>
                    <td>
                      <LabelBadge label={tx.known_label} />
                    </td>
                    <td>
                      {tx.prediction ? (
                        <LabelBadge label={tx.prediction} isPrediction />
                      ) : (
                        <span className="text-ink-muted font-mono">—</span>
                      )}
                    </td>
                    <td className="font-mono text-ink-secondary tabular-nums">
                      {tx.prediction_probability !== null && tx.prediction_probability !== undefined
                        ? `${(tx.prediction_probability * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="font-mono tabular-nums">
                      <span className="font-semibold text-ink">{tx.risk_score}</span>
                      <span className="text-ink-muted text-[11px]"> / 100</span>
                    </td>
                    <td>
                      <RiskBadge score={tx.risk_score} level={tx.risk_level} showScore={false} />
                    </td>
                    <td className="font-mono text-ink-secondary text-xs tabular-nums">
                      {tx.total_degree}{' '}
                      <span className="text-ink-muted">
                        ({tx.in_degree}↓ {tx.out_degree}↑)
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="text-xs font-mono font-semibold text-accent inline-flex items-center gap-1">
                        <span>Inspect</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3.5 bg-inset/60 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-ink-muted tabular-nums">
          <div>
            Showing{' '}
            <span className="text-ink font-semibold">
              {transactions.length > 0 ? (page - 1) * limit + 1 : 0}
            </span>{' '}
            to{' '}
            <span className="text-ink font-semibold">{Math.min(page * limit, total)}</span> of{' '}
            <span className="text-ink font-semibold">{total.toLocaleString()}</span> records
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateParam('page', Math.max(1, page - 1).toString())}
              disabled={page <= 1 || loading}
              className="btn-secondary min-h-[34px] py-1 px-3 text-xs font-mono"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="px-2 text-accent font-semibold">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => updateParam('page', Math.min(totalPages, page + 1).toString())}
              disabled={page >= totalPages || loading}
              className="btn-secondary min-h-[34px] py-1 px-3 text-xs font-mono"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
