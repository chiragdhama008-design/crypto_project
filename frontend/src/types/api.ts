export type KnownLabel = 'ILLICIT' | 'LICIT' | 'UNKNOWN';
export type PredictionLabel = 'ILLICIT' | 'LICIT' | null;
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CaseStatus = 'OPEN' | 'UNDER REVIEW' | 'CLOSED';

export interface TransactionSummary {
  transaction_id: number;
  time_step: number;
  known_label: KnownLabel;
  prediction?: PredictionLabel;
  prediction_probability?: number | null;
  risk_score: number;
  risk_level: RiskLevel;
  in_degree: number;
  out_degree: number;
  total_degree: number;
}

export interface PaginatedTransactionsResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  transactions: TransactionSummary[];
}

export interface FeatureItem {
  index: number;
  name: string;
  category: string;
  value: number;
}

export interface CategorizedFeaturesResponse {
  transaction_id: number;
  total_features: number;
  local_features: FeatureItem[];
  aggregate_features: FeatureItem[];
}

export interface IntelligenceSignal {
  name: string;
  value: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface TransactionIntelligenceResponse {
  transaction_id: number;
  ml_signals: IntelligenceSignal[];
  graph_signals: IntelligenceSignal[];
  feature_signals: IntelligenceSignal[];
  gnn_prediction?: {
    prediction: string;
    illicit_probability: number;
    licit_probability: number;
    metadata?: any;
  };
  risk_summary: {
    risk_score: number;
    risk_level: RiskLevel;
    known_label: KnownLabel;
    prediction?: PredictionLabel;
    gnn_prediction?: string;
    gnn_probability?: number;
    total_neighbors: number;
    known_illicit_neighbors: number;
    suspicious_neighbors_count: number;
  };
}

export interface EvidenceItem {
  category: string;
  indicator: string;
  observation: string;
  forensic_significance: string;
  confidence: string;
}

export interface TransactionEvidenceResponse {
  transaction_id: number;
  evidence_items: EvidenceItem[];
  disclaimer: string;
}

export interface GraphNode {
  id: string;
  transaction_id: number;
  label: KnownLabel;
  prediction?: PredictionLabel;
  risk_score?: number;
  risk_level?: RiskLevel;
  probability?: number | null;
  time_step: number;
  in_degree: number;
  out_degree: number;
  is_center: boolean;
  hop_level: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  direction: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    center_transaction_id: number;
    depth: number;
    total_nodes: number;
    total_edges: number;
    illicit_count: number;
    licit_count: number;
    unknown_count: number;
    high_risk_count: number;
    truncated: boolean;
    max_limit: number;
  };
}

export interface DashboardOverview {
  total_transactions: number;
  known_transactions: number;
  illicit_transactions: number;
  licit_transactions: number;
  unknown_transactions: number;
  total_edges: number;
  active_model: string;
  risk_distribution: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
  high_risk_preview: TransactionSummary[];
  time_series: Array<{
    time_step: number;
    total_txs: number;
    illicit_txs: number;
    licit_txs: number;
    unknown_txs: number;
  }>;
  database_status: {
    connected: boolean;
    provider: string;
    error?: string;
  };
}

export interface InvestigationCase {
  id: number;
  case_name: string;
  description?: string;
  status: CaseStatus;
  transaction_count: number;
  created_at: string;
  updated_at: string;
  transactions?: Array<{
    transaction_id: number;
    time_step: number;
    known_label: KnownLabel;
    prediction?: PredictionLabel;
    risk_score?: number;
    risk_level?: RiskLevel;
    notes?: string;
    added_at: string;
  }>;
  notes?: Array<{
    id: number;
    case_id: number;
    transaction_id?: number;
    note: string;
    author: string;
    created_at: string;
  }>;
}

export interface ModelMetrics {
  model_name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number;
  pr_auc: number;
  illicit_precision: number;
  illicit_recall: number;
  illicit_f1: number;
  evaluation_strategy: string;
  training_period: string;
  validation_period: string;
  testing_period: string;
  confusion_matrix: {
    true_negative: number;
    false_positive: number;
    false_negative: number;
    true_positive: number;
  };
  roc_curve: Array<{ fpr: number; tpr: number; threshold: number }>;
  pr_curve: Array<{ precision: number; recall: number; threshold: number }>;
  feature_importances: Array<{
    feature_index: number;
    feature_name: string;
    importance: number;
    category: string;
  }>;
  training_duration_seconds?: number;
  best_epoch?: number;
  architecture?: string;
  test_samples_evaluated?: number;
}

export interface SystemHealth {
  status: string;
  app_name: string;
  version: string;
  database: {
    connected: boolean;
    provider: string;
    has_supabase_url: boolean;
    has_database_url: boolean;
    total_transactions: number;
  };
  ingestion: {
    status: string;
    rows_processed: number;
    last_completed?: string;
  };
  trained_models: string[];
  active_model: string;
}
