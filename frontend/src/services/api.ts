import {
  DashboardOverview,
  PaginatedTransactionsResponse,
  TransactionSummary,
  HighRiskQueueResponse,
  CategorizedFeaturesResponse,
  TransactionIntelligenceResponse,
  TransactionEvidenceResponse,
  GraphResponse,
  InvestigationCase,
  ModelMetrics,
  SystemHealth,
  ModelSummary,
  DatasetStatus,
  RiskBreakdownResponse,
} from '../types/api';

const rawApiUrl = import.meta.env.VITE_API_URL;
const normalizedBase = rawApiUrl ? (rawApiUrl.startsWith('http') ? rawApiUrl : `https://${rawApiUrl}`) : '';
const API_BASE = normalizedBase ? `${normalizedBase.replace(/\/$/, '')}/api` : '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      const detail = errJson.detail || errJson.error;
      if (typeof detail === 'string') errorDetail = detail;
      else if (Array.isArray(detail)) errorDetail = detail.map((item: { msg?: string }) => item.msg || 'Invalid value').join('. ');
    } catch {
      // fallback to statusText
    }
    throw new Error(errorDetail || `Request failed (${res.status})`);
  }

  return res.json();
}

export const api = {
  // Health & Status
  getHealth: () => fetchJson<SystemHealth>(`${API_BASE}/health`),

  // Dashboard
  getDashboard: () => fetchJson<DashboardOverview>(`${API_BASE}/dashboard`),

  // Transactions
  getTransactions: (params: {
    page?: number;
    limit?: number;
    label?: string;
    prediction?: string;
    risk_level?: string;
    time_step?: number;
    search?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', params.page.toString());
    if (params.limit) sp.set('limit', params.limit.toString());
    if (params.label) sp.set('label', params.label);
    if (params.prediction) sp.set('prediction', params.prediction);
    if (params.risk_level) sp.set('risk_level', params.risk_level);
    if (params.time_step) sp.set('time_step', params.time_step.toString());
    if (params.search) sp.set('search', params.search);
    return fetchJson<PaginatedTransactionsResponse>(`${API_BASE}/transactions?${sp.toString()}`);
  },

  getTransaction: (id: number) => fetchJson<TransactionSummary>(`${API_BASE}/transactions/${id}`),

  getTransactionFeatures: (id: number) =>
    fetchJson<CategorizedFeaturesResponse>(`${API_BASE}/transactions/${id}/features`),

  getTransactionIntelligence: (id: number) =>
    fetchJson<TransactionIntelligenceResponse>(`${API_BASE}/transactions/${id}/intelligence`),

  getTransactionEvidence: (id: number) =>
    fetchJson<TransactionEvidenceResponse>(`${API_BASE}/transactions/${id}/evidence`),

  searchTransactions: (query: string, signal?: AbortSignal) =>
    fetchJson<Array<{ transaction_id: number; time_step: number; known_label: string; prediction: string | null; risk_score: number | null; risk_level: string | null }>>(
      `${API_BASE}/search/transactions?query=${encodeURIComponent(query.trim())}`, { signal }
    ),

  // Graph
  getTransactionGraph: (id: number, depth: number = 1) =>
    fetchJson<GraphResponse>(`${API_BASE}/transactions/${id}/graph?depth=${depth}`),

  // Risk & Alerts
  getHighRiskQueue: (params?: { level?: string; time_step?: number; limit?: number; page?: number }) => {
    const sp = new URLSearchParams();
    if (params?.level) sp.set('level', params.level);
    if (params?.time_step) sp.set('time_step', params.time_step.toString());
    if (params?.limit) sp.set('limit', params.limit.toString());
    if (params?.page) sp.set('page', params.page.toString());
    return fetchJson<HighRiskQueueResponse>(`${API_BASE}/risk/high?${sp.toString()}`);
  },

  getRiskBreakdown: (id: number) => fetchJson<RiskBreakdownResponse>(`${API_BASE}/risk/${id}`),

  // Models
  listModels: () => fetchJson<{ active_model: string; supported_architectures: string[]; models: ModelSummary[] }>(`${API_BASE}/models`),

  getModelMetrics: (modelName: string) => {
    const metricNames: Record<string, string> = {
      gradient_boosting: 'Gradient Boosting',
      random_forest: 'Random Forest',
      logistic_regression: 'Logistic Regression',
      gnn: 'gnn',
    };
    return fetchJson<ModelMetrics>(`${API_BASE}/models/${encodeURIComponent(metricNames[modelName] || modelName)}/metrics`);
  },

  getUnseenBenchmark: (modelName?: string) =>
    fetchJson<any>(`${API_BASE}/models/unseen-benchmark?model_name=${encodeURIComponent(modelName || 'gradient_boosting')}`),

  // Analytics
  getAnalyticsOverview: () => fetchJson<any>(`${API_BASE}/analytics/overview`),
  getTimeSeries: () => fetchJson<any[]>(`${API_BASE}/analytics/time-series`),

  // Cases
  getCases: (signal?: AbortSignal) => fetchJson<InvestigationCase[]>(`${API_BASE}/cases`, { signal }),

  getCase: (id: number, signal?: AbortSignal) => fetchJson<InvestigationCase>(`${API_BASE}/cases/${id}`, { signal }),

  createCase: (data: { case_name: string; description?: string; initial_transactions?: number[] }) =>
    fetchJson<InvestigationCase>(`${API_BASE}/cases`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCase: (id: number, data: { case_name?: string; description?: string; status?: string }) =>
    fetchJson<InvestigationCase>(`${API_BASE}/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  addTransactionsToCase: (caseId: number, transaction_ids: number[], notes?: string) =>
    fetchJson<InvestigationCase>(`${API_BASE}/cases/${caseId}/transactions`, {
      method: 'POST',
      body: JSON.stringify({ transaction_ids, notes }),
    }),

  addNoteToCase: (caseId: number, note: string, transaction_id?: number, author?: string) =>
    fetchJson<any>(`${API_BASE}/cases/${caseId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note, transaction_id, author }),
    }),

  // Reports
  getCaseReport: (caseId: number, signal?: AbortSignal) => fetchJson<any>(`${API_BASE}/cases/${caseId}/report`, { signal }),

  // Dataset
  getDatasetStatus: () => fetchJson<DatasetStatus>(`${API_BASE}/dataset/status`),
};
