# TRACE-X System Architecture & Technical Reference

This document is the canonical technical reference for human engineers and AI coding agents working in `crypto_project` (**Hackathon MVP Baseline**). For security posture and post-hackathon hardening items, always cross-reference [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) and [`SECURITY.md`](SECURITY.md).

---

## 1. System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Frontend: React 19 + TypeScript + Vite 8 + TailwindCSS 3               │
│ Visualizations: Cytoscape.js (subgraphs), Recharts (ROC/PR/time-series)│
│ Entry: frontend/src/main.tsx -> App.tsx -> frontend/src/services/api.ts │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ REST JSON (/api/*)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Backend: FastAPI (backend/app/main.py)                                  │
│  ├─ Security & Headers: security.py (optional ADMIN_API_KEY), CORS guard│
│  ├─ API Routes: backend/app/api/routes/*.py (11 routers under /api)     │
│  ├─ Data Sources: backend/app/data_sources/{common,elliptic}/           │
│  ├─ ML & GNN: backend/app/ml/{gnn_*,train,predict,evaluate,explain}.py  │
│  ├─ Graph Engine: backend/app/graph/{traversal,risk}.py                 │
│  ├─ Risk Engine: backend/app/risk/engine.py                             │
│  ├─ Investigations & Reports: backend/app/{investigations,reports}/     │
│  └─ ORM & DB: backend/app/{models,database,config}.py                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ SQLAlchemy ORM
            ┌───────────────────┴───────────────────┐
            ▼                                       ▼
   Supabase PostgreSQL                     Local SQLite Fallback
   (sql/schema.sql)                        (tracex_dev.db via database.py)
```

---

## 2. Repository Layout

| Path | Purpose |
|---|---|
| `backend/app/main.py` | FastAPI initialization, lifespan DB init, safe CORS policy, security response headers, `/api` routers, path-checked SPA static serving, debug-gated error handler |
| `backend/app/security.py` | Opt-in `verify_admin_key` (`X-Admin-Key` header vs `ADMIN_API_KEY`, no-op in unconfigured local hackathon dev) |
| `backend/app/config.py` | `pydantic-settings` `Settings` loading `.env` (`DATABASE_URL`, `SUPABASE_*`, `DATASET_PATH`, `CORS_ORIGINS`, `ACTIVE_MODEL`, `ADMIN_API_KEY`, `DEBUG=False`) |
| `backend/app/database.py` | SQLAlchemy engine/session setup (`postgresql://` primary, `sqlite:///./tracex_dev.db` fallback), SQLite DDL with unique constraints, lazy `supabase` import |
| `backend/app/models.py` | ORM models for 9 tables (`transactions`, `transaction_features`, `transaction_edges`, `model_predictions`, `model_metrics`, `investigation_cases`, `case_transactions`, `investigation_notes`, `ingestion_runs`) |
| `backend/app/api/routes/` | 11 route modules: `health`, `dashboard`, `transactions`, `graph`, `risk`, `models`, `analytics`, `cases`, `reports`, `ml`, `dataset` |
| `backend/app/data_sources/` | `BaseCryptoDataSource` abstraction + Elliptic CSV loader/parser/mapper + MVP demo fixtures (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) |
| `backend/app/ml/` | `BitcoinGraphSAGE` (`gnn_model.py`), 2-hop GNN training/inference (`gnn_train.py`, `gnn_predict.py` with `weights_only=True` & `to_undirected`), tabular models (`train.py` with permutation importances, `predict.py` with canonical normalization & no silent fallback), temporal split (`preprocessing.py`), metrics (`evaluate.py`), z-score explainer (`explain.py`) |
| `backend/app/graph/` | Deterministic `get_transaction_subgraph` (`traversal.py`) and `calculate_neighborhood_signals` (`risk.py`) |
| `backend/app/risk/engine.py` | Composite deterministic risk scorer (`calculate_risk_score`, `0–100` -> `LOW`/`MEDIUM`/`HIGH`/`CRITICAL`) |
| `backend/app/investigations/` | `InvestigationService` for case/transaction/note CRUD with 404/validation guards |
| `backend/app/reports/` | `ReportGenerator` building forensic case dossiers with `integrity_sha256` digests |
| `backend/tests/` | Isolated temp-SQLite tests (`test_api.py`, `test_gnn.py`, `test_labels.py`, `test_risk_engine.py`) |
| `scripts/` | CLI pipelines: `inspect_dataset.py`, `ingest_dataset.py`, `train_model.py` |
| `models/` | Saved checkpoints and RFC-8259 valid test metrics (`gnn_model.pt`, `gnn_metadata.joblib`, `*.joblib`, `*_metrics.json`) |
| `sql/schema.sql` | Canonical PostgreSQL DDL for Supabase |
| `frontend/src/` | React 19 SPA pages (`12` routes), reusable components, API client (`services/api.ts`), TS types (`types/api.ts`) |
| `render.yaml` | Render deployment blueprint (FastAPI web service + static frontend build) |

---

## 3. Domain & ML Invariants (Elliptic Bitcoin Dataset)

1. **Dataset Dimensions:**
   - **203,769** Bitcoin transactions, **234,355** directed edges, **49** discrete temporal snapshots.
   - **165** standardized features per transaction (0-indexed `0..164`):
     - Indices `0..92` (**Features 1–93**, 93 dims): Local transaction features.
     - Indices `93..164` (**Features 94–165**, 72 dims): 1-hop neighborhood aggregate features.
     - *(Note: `README.md` inconsistently mentions `1–94` / `95–165`; codebase indexing is strictly `0..92` / `93..164`.)*
2. **Label Mapping Contract (`backend/app/data_sources/elliptic/mapper.py`):**
   - `'1'` / `'illicit'` -> `ILLICIT` (`1`) -> ~4,545 rows
   - `'2'` / `'licit'` -> `LICIT` (`0`) -> ~42,019 rows
   - `'unknown'` / `'3'` / null -> `UNKNOWN` (`-1`) -> ~157,205 rows
   - **CRITICAL:** `UNKNOWN` transactions must **NEVER** be coerced to `LICIT`. They participate in GNN graph message passing (`data.x`, `data.edge_index`), but must remain masked out (`y != -1`) during supervised loss calculation and evaluation.
3. **Temporal Chronological Split (`preprocessing.py`, `gnn_train.py`):**
   - **Train:** Timesteps `1–34` (29,894 labeled nodes)
   - **Validation:** Timesteps `35–39` (5,486 labeled nodes)
   - **Test:** Timesteps `40–49` (11,184 labeled nodes: 636 illicit, 10,548 licit)
   - Never apply random k-fold CV across timesteps (introduces temporal leakage).
4. **Composite Risk Scoring (`backend/app/risk/engine.py`):**
   - `0–55` pts: `ml_probability * 55`
   - `0–25` pts: Graph exposure (known illicit neighbors, suspicious neighbors, neighborhood illicit ratio)
   - `0–10` pts: Structural topology (`total_neighbors`: `>20` -> 10, `>10` -> 5, `>5` -> 2)
   - `0–10` pts: Feature z-score outliers (`|z| > 3.0`: `>5` features -> 10, `>2` -> 5)
   - **Overrides:** `ILLICIT` floor `90`; `LICIT` with `known_illicit_neighbors == 0` and `ml_probability < 0.2` capped at `25`.
   - **Tiers:** `0–30` `LOW`, `31–60` `MEDIUM`, `61–80` `HIGH`, `81–100` `CRITICAL`.

---

## 4. API & Frontend Contract Notes (Hackathon MVP Baseline)

- **API Prefix & Frontend Base:** All FastAPI routes are mounted under `/api` (`main.py`). `frontend/src/services/api.ts` resolves `import.meta.env.VITE_API_URL` (else `/api` Vite dev proxy -> `http://127.0.0.1:8000`).
- **Search & Risk Queue Alignment:** `GET /api/transactions` and `GET /api/search/transactions` use `sqlalchemy.String` (`.cast(String)`) and prefix matching cleanly; `GET /api/risk/high` emits `"probability"`, `"prediction_probability"`, and `"total_degree"` matching `RiskAlerts.tsx` and `HighRiskQueueResponse`.
- **Dynamic Model Metrics & Honest Fixtures:**
  - `GET /api/models` computes `is_active` accurately via `normalize_model_name()`; `Overview.tsx` binds live active metrics from `api.listModels()`; `ModelPerformance.tsx` derives evaluated test counts dynamically and labels `unseen_20_transactions.json` as **"Precomputed Benchmark"**.
  - **Intentional MVP Behavior:** `GET /api/dashboard` and `GET /api/analytics/overview` fall back to precomputed summary counts (`elliptic_dataset_summary.json`) when present so empty SQLite hackathon demos still render full dataset distributions seamlessly.
- **Forensic Reports:** `POST /api/reports/case/{case_id}` (`ReportGenerator`) generates dossiers carrying an `integrity_sha256` canonical hash surfaced in `CaseDetail.tsx` and `Reports.tsx`.
