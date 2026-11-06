import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, ChevronLeft, ChevronRight, ArrowRight, Filter, Terminal } from 'lucide-react';
import { api } from '../services/api';
import { TransactionSummary } from '../types/api';
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

  // Filters from URL or default
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = 25;
  const labelFilter = searchParams.get('label') || '';
  const predFilter = searchParams.get('prediction') || '';
  const riskFilter = searchParams.get('risk_level') || '';
  const timeStepFilter = searchParams.get('time_step') || '';
  const search = searchParams.get('search') || '';

  const [searchInput, setSearchInput] = useState(search);

  const fetchTransactions = () => {
    setLoading(true);
    api.getTransactions({
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
        setTotalPages(res.total_pages);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTransactions();
  }, [page, labelFilter, predFilter, riskFilter, timeStepFilter, search]);

  const updateParam = (key: string, value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
    nextParams.set('page', '1');
    setSearchParams(nextParams);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam('search', searchInput.trim());
  };

  return (
    <div className="p-4 space-y-3.5 max-w-7xl mx-auto font-sans">
      {/* LeetCode Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#333333] pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-bold text-[#eff1f6] tracking-tight font-mono">
              Transaction Problem Set
            </h1>
            <span className="text-[11px] font-mono bg-[#333333] text-[#ffa116] px-2 py-0.5 rounded border border-[#444444]">
              {total.toLocaleString()} indexed in DB / 203,769 total dataset
            </span>
          </div>
          <p className="text-xs text-[#8c8c8c] mt-0.5 font-mono">
            Ground-truth labeled and ML-inferred Bitcoin flow graph records
          </p>
        </div>
        <button
          onClick={fetchTransactions}
          disabled={loading}
          className="px-3 py-1.5 bg-[#262626] border border-[#3e3e3e] hover:bg-[#333333] rounded text-xs font-mono font-medium text-[#eff1f6] shadow-sm flex items-center space-x-1.5 self-start transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#ffa116] ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* LeetCode Filter Bar */}
      <div className="bg-[#262626] p-2.5 rounded border border-[#333333] shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="relative sm:col-span-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#8c8c8c] pointer-events-none" />
            <input
              type="text"
              placeholder="Search Transaction ID (e.g. 230425980)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs bg-[#1a1a1a] border border-[#3e3e3e] rounded text-[#eff1f6] placeholder-[#6b7280] focus:outline-none focus:border-[#ffa116] font-mono"
            />
          </form>

          {/* Known Label Filter */}
          <div>
            <select
              value={labelFilter}
              onChange={(e) => updateParam('label', e.target.value)}
              className="w-full text-xs py-1 px-2 bg-[#1a1a1a] border border-[#3e3e3e] rounded text-[#eff1f6] focus:outline-none focus:border-[#ffa116] font-mono"
            >
              <option value="">Label (All)</option>
              <option value="ILLICIT">Known: ILLICIT (Hard)</option>
              <option value="LICIT">Known: LICIT (Easy)</option>
              <option value="UNKNOWN">Known: UNKNOWN (Medium)</option>
            </select>
          </div>

          {/* Prediction Filter */}
          <div>
            <select
              value={predFilter}
              onChange={(e) => updateParam('prediction', e.target.value)}
              className="w-full text-xs py-1 px-2 bg-[#1a1a1a] border border-[#3e3e3e] rounded text-[#eff1f6] focus:outline-none focus:border-[#ffa116] font-mono"
            >
              <option value="">Prediction (All)</option>
              <option value="ILLICIT">Pred: ILLICIT</option>
              <option value="LICIT">Pred: LICIT</option>
            </select>
          </div>

          {/* Risk Level Filter */}
          <div>
            <select
              value={riskFilter}
              onChange={(e) => updateParam('risk_level', e.target.value)}
              className="w-full text-xs py-1 px-2 bg-[#1a1a1a] border border-[#3e3e3e] rounded text-[#eff1f6] focus:outline-none focus:border-[#ffa116] font-mono"
            >
              <option value="">Risk Tier (All)</option>
              <option value="CRITICAL">Critical (81-100)</option>
              <option value="HIGH">High (61-80)</option>
              <option value="MEDIUM">Medium (31-60)</option>
              <option value="LOW">Low (0-30)</option>
            </select>
          </div>
        </div>
      </div>

      {/* LeetCode Table Container */}
      <div className="bg-[#262626] rounded border border-[#333333] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="leetcode-table">
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>Step</th>
                <th>Ground Truth</th>
                <th>ML Prediction</th>
                <th>Probability</th>
                <th>Risk Score</th>
                <th>Difficulty Tier</th>
                <th>Degree (In/Out)</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="py-2.5 px-4">
                      <div className="h-4 bg-[#333333] rounded animate-pulse w-full"></div>
                    </td>
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#ef4743] font-mono text-xs">
                    Error loading transactions: {error}
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#8c8c8c] font-mono text-xs">
                    No transactions found matching filter parameters.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={tx.transaction_id}
                    onClick={() => navigate(`/transactions/${tx.transaction_id}`)}
                    className="cursor-pointer hover:bg-[#2e2e2e] transition-colors"
                  >
                    <td className="font-mono font-bold text-[#eff1f6] hover:text-[#ffa116]">
                      #{tx.transaction_id}
                    </td>
                    <td className="font-mono text-[#8c8c8c]">
                      {tx.time_step}
                    </td>
                    <td>
                      <LabelBadge label={tx.known_label} />
                    </td>
                    <td>
                      {tx.prediction ? (
                        <LabelBadge label={tx.prediction} isPrediction />
                      ) : (
                        <span className="text-[#6b7280] text-xs font-mono">—</span>
                      )}
                    </td>
                    <td className="font-mono text-[#d1d5db]">
                      {tx.prediction_probability !== null && tx.prediction_probability !== undefined
                        ? `${(tx.prediction_probability * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td>
                      <span className="font-mono font-bold text-[#eff1f6]">{tx.risk_score}</span>
                      <span className="text-[#6b7280] text-[10px]">/100</span>
                    </td>
                    <td>
                      <RiskBadge score={tx.risk_score} level={tx.risk_level} showScore={false} />
                    </td>
                    <td className="font-mono text-[#8c8c8c] text-[11px]">
                      {tx.total_degree} <span className="text-[#6b7280]">({tx.in_degree}↓ {tx.out_degree}↑)</span>
                    </td>
                    <td className="text-right">
                      <span className="text-xs text-[#ffa116] hover:text-[#ffb84d] font-mono font-medium inline-flex items-center space-x-1">
                        <span>Inspect</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* LeetCode Pagination Bar */}
        <div className="px-4 py-2 bg-[#202020] border-t border-[#333333] flex items-center justify-between text-xs text-[#8c8c8c] font-mono">
          <div>
            Showing <span className="text-[#eff1f6] font-semibold">{transactions.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
            <span className="text-[#eff1f6] font-semibold">{Math.min(page * limit, total)}</span> of{' '}
            <span className="text-[#eff1f6] font-semibold">{total.toLocaleString()}</span> entries
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => updateParam('page', Math.max(1, page - 1).toString())}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 bg-[#2a2a2a] border border-[#3e3e3e] rounded text-[#eff1f6] disabled:opacity-30 hover:bg-[#333333] flex items-center space-x-1 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="text-[#ffa116] font-bold">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => updateParam('page', Math.min(totalPages, page + 1).toString())}
              disabled={page >= totalPages || loading}
              className="px-2.5 py-1 bg-[#2a2a2a] border border-[#3e3e3e] rounded text-[#eff1f6] disabled:opacity-30 hover:bg-[#333333] flex items-center space-x-1 transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
