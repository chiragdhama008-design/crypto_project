import {
  DashboardOverview,
  PaginatedTransactionsResponse,
  TransactionSummary,
  CategorizedFeaturesResponse,
  TransactionIntelligenceResponse,
  TransactionEvidenceResponse,
  GraphResponse,
  InvestigationCase,
  ModelMetrics,
  SystemHealth
} from '../types/api';

const rawApiUrl = import.meta.env.VITE_API_URL;
const normalizedBase = rawApiUrl ? (rawApiUrl.startsWith('http') ? rawApiUrl : `https://${rawApiUrl}`) : '';
const API_BASE = normalizedBase ? `${normalizedBase}/api` : '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.error || errorDetail;
    } catch {
      // fallback to statusText
    }
    throw new Error(errorDetail);
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

  searchTransactions: (query: string) =>
    fetchJson<Array<{ transaction_id: number; time_step: number; known_label: string; risk_score: number }>>(
      `${API_BASE}/search/transactions?query=${encodeURIComponent(query)}`
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
    return fetchJson<{
      total: number;
      page: number;
      limit: number;
      critical_count: number;
      high_count: number;
      medium_count: number;
      low_count: number;
      transactions: any[];
    }>(`${API_BASE}/risk/high?${sp.toString()}`);
  },

  getRiskBreakdown: (id: number) => fetchJson<any>(`${API_BASE}/risk/${id}`),

  // Models
  listModels: () => fetchJson<{ active_model: string; supported_architectures: string[]; models: any[] }>(`${API_BASE}/models`),

  getModelMetrics: (modelName: string) => fetchJson<ModelMetrics>(`${API_BASE}/models/${modelName}/metrics`),

  // Analytics
  getAnalyticsOverview: () => fetchJson<any>(`${API_BASE}/analytics/overview`),
  getTimeSeries: () => fetchJson<any[]>(`${API_BASE}/analytics/time-series`),

  // Cases
  getCases: () => fetchJson<InvestigationCase[]>(`${API_BASE}/cases`),

  getCase: (id: number) => fetchJson<InvestigationCase>(`${API_BASE}/cases/${id}`),

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
  getCaseReport: (caseId: number) => fetchJson<any>(`${API_BASE}/cases/${caseId}/report`),

  // Dataset
  getDatasetStatus: () => fetchJson<any>(`${API_BASE}/dataset/status`),
};
