# TRACE-X — Crypto, Blockchain, ML & Cybersecurity Audit Report

**Repository:** `crypto_project` (TRACE-X Forensic Intelligence Platform)  
**Audit Date:** 2026-11-11  
**Project Posture:** **Hackathon MVP / Research & Demo Prototype** *(updated post-remediation on 2026-11-11)*  
**Scope:** Full static & configuration audit of backend (`FastAPI`, `SQLAlchemy`, `PyTorch/PyG`, `scikit-learn`), ETL/training scripts (`scripts/`), SQL schema (`sql/schema.sql`), frontend (`React`/`TypeScript`/`Vite`), deployment config (`render.yaml`, `.env.example`, `.gitignore`), model artifacts (`models/`), and test suite (`backend/tests/`).

---

## Executive Summary

TRACE-X is an end-to-end Bitcoin transaction forensics and AML investigation platform built around the **Elliptic Bitcoin Dataset** (203,769 nodes, 234,355 directed edges, 165 standardized features across 49 temporal snapshots). The project enforces foundational ML domain invariants—**chronological temporal splitting** (`1–34` train, `35–39` validation, `40–49` test) and **strict preservation of `UNKNOWN` labels**—and has been remediated to establish a **pragmatic Hackathon MVP baseline** that preserves zero-friction local/demo UX while fixing correctness, GNN train-serve skew, silent model fallbacks, and key security bugs.

> **Hackathon MVP vs. Production Boundary:** Read-only demo routes, empty-DB JSON fixtures (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`), and Investigation Case demo workflows intentionally remain accessible without a login wall so evaluators can explore all pages immediately. Enterprise controls (mandatory user login + RBAC, Supabase Row-Level Security policies, cryptographic model manifests, and API rate limiting) are tracked under **Post-Hackathon / Pre-Production Hardening**.

### Finding Status Summary

| Severity | Total | Fixed / Mitigated for MVP | Post-Hackathon / Pre-Prod Remaining |
|---|---:|---:|---|
| **Critical** | 4 | 2 Mitigated (`[CRIT-01]` opt-in `ADMIN_API_KEY`, `[CRIT-02]` `weights_only=True`), 1 Fixed (`[CRIT-03]` CORS), 1 Partial (`[CRIT-04]` lazy `supabase` import) | Mandatory JWT/RBAC auth (`[CRIT-01]`), `skops`/`safetensors` + SHA-256 model manifests (`[CRIT-02]`), Supabase RLS DDL (`[CRIT-04]`) |
| **High** | 5 | **5 Fixed** (`[HIGH-01]`..`[HIGH-05]`) | Unseen-benchmark preview heuristic relies on static JSON without live subgraph fetch |
| **Medium** | 7 | **4 Fixed**, **3 Partial** (`[MED-03]` intentional MVP fixtures, `[MED-05]` rate limiting, `[MED-07]` GNN precision tuning) | Live DB dashboard aggregation, API rate limiting + pagination on `/api/cases`, GNN threshold calibration on steps `35–39` |
| **Low / Hygiene** | 5 | 2 Fixed/Partial (`[LOW-01]`, `[LOW-02]`, `[LOW-03]`) | `git rm --cached` on legacy `tracex_dev.db-*`, `numpy<2` pin alignment, `README.md` cleanup, template image cleanup |

---

## 1. Critical Findings

### [CRIT-01] Complete Absence of Authentication & Authorization on All Endpoints (CWE-306, CWE-862)
- **Status:** **`[MITIGATED FOR MVP / OPEN FOR PROD]`**
- **Locations:**
  - `backend/app/security.py:verify_admin_key` *(new opt-in gate)*
  - `backend/app/config.py` (`ADMIN_API_KEY: str = ""`)
  - `backend/app/api/routes/ml.py:train_endpoint` (`Depends(verify_admin_key)`)
  - `backend/app/api/routes/dataset.py:trigger_ingest` (`Depends(verify_admin_key)`)
  - `backend/app/api/routes/cases.py` (`/api/cases*`)
- **Current MVP Behavior:**
  - `POST /api/ml/train` and `POST /api/dataset/ingest` (`clear=True` DB reset) are protected by `verify_admin_key` checking constant-time `hmac.compare_digest` on `X-Admin-Key` whenever `ADMIN_API_KEY` is configured. When `ADMIN_API_KEY` is empty (local hackathon default), requests pass cleanly with zero friction.
  - Read routes and `/api/cases*` intentionally remain unauthenticated for zero-login hackathon demonstrations.
- **Post-Hackathon / Pre-Production Remediation:**
  - Enforce authentication (JWT / Supabase Auth / API Gateway) and role-based access control (RBAC) across `/api/*` (including `/api/cases*`).
  - Disable `/api/ml/train` and `/api/dataset/ingest` in public web worker deployments in favor of offline jobs, and derive `InvestigationNote.author` from verified authenticated identity instead of client payloads.

### [CRIT-02] Arbitrary Code Execution via Unsafe Deserialization of Model Artifacts (CWE-502)
- **Status:** **`[PARTIALLY FIXED / OPEN FOR PROD]`**
- **Locations:**
  - `backend/app/ml/gnn_predict.py:33` (**Fixed** to `torch.load(ckpt_path, map_location="cpu", weights_only=True)`)
  - `backend/app/ml/gnn_predict.py:66` (`joblib.load(meta_path)`)
  - `backend/app/ml/predict.py:55` (`joblib.load(p)`)
  - `scripts/ingest_dataset.py:69` (`joblib.load(model_path)`)
- **Current MVP Behavior:**
  - GNN checkpoint loading now enforces `torch.load(..., weights_only=True)` (validated by `backend/tests/test_gnn.py`).
  - Tabular scikit-learn artifacts (`models/*.joblib`) and `gnn_metadata.joblib` remain `.joblib` files trusted within the repository for hackathon simplicity.
- **Post-Hackathon / Pre-Production Remediation:**
  - Migrate `gnn_metadata.joblib` to JSON and tabular models to `skops` (with explicit untrusted type checks) or ONNX Runtime, and verify SHA-256 / HMAC manifests before loading any artifact from `models/`.

### [CRIT-03] Overly Permissive CORS Policy Combined with `allow_credentials=True` (CWE-942)
- **Status:** **`[FIXED FOR MVP]`**
- **Locations:**
  - `backend/app/main.py:53-62`
  - `render.yaml:18-21`
- **Implemented Fix:**
  - Removed `+ ["*"]` and `allow_origin_regex=r"https?://.*"` from `CORSMiddleware`.
  - `backend/app/main.py` now computes `_wildcard_cors = ("*" in _configured_origins) or (len(_configured_origins) == 0)` and sets `allow_credentials=not _wildcard_cors`, with explicit allowed HTTP methods and headers (`Content-Type`, `Authorization`, `X-Admin-Key`).
  - `render.yaml` retains `CORS_ORIGINS: "*"` strictly for unauthenticated hackathon previews (credentials automatically disabled) and documents locking `CORS_ORIGINS` to the deployed frontend URL before enabling cookies or authentication.

### [CRIT-04] Missing Supabase Row-Level Security (RLS) & Unused Unconditional `supabase` Client Import
- **Status:** **`[FIXED IN PYTHON / OPEN IN SUPABASE SQL FOR PROD]`**
- **Locations:**
  - `sql/schema.sql:1-128`
  - `backend/app/database.py:12-43`
- **Implemented Fix & Remaining Gap:**
  - `supabase.create_client` is now lazy-imported inside `get_supabase_client()` (`database.py:36`) with `TYPE_CHECKING` typing only, allowing FastAPI routes and unit tests to run cleanly in SQLite mode without `supabase-py` installed.
  - **Post-Hackathon:** Add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` and explicit policies (or revoke PostgREST `anon`/`authenticated` privileges) in `sql/schema.sql` before exposing Supabase PostgREST APIs publicly.

---

## 2. High-Severity Findings

### [HIGH-01] GNN Train-Serve Skew: 1-Hop Inference vs 2-Hop Training & Undeduplicated Edges
- **Status:** **`[FIXED]`**
- **Locations:**
  - `backend/app/ml/gnn_predict.py:73-231`
  - `backend/app/api/routes/transactions.py` (`/intelligence`, `/evidence` lazy GNN calls)
- **Implemented Fix:**
  - Fixed `predict_gnn_with_subgraph()` to insert `center_features` at `center_idx` cleanly (`all_features.insert(center_idx, center_features)`) regardless of `center_idx != 0`.
  - Replaced manual edge list duplication with `torch_geometric.utils.to_undirected(...)`, matching `gnn_train.py`.
  - Upgraded `predict_gnn_transaction()` to traverse a deterministic bounded **2-hop** neighborhood (`order_by(TransactionEdge.id.asc()).limit(max_subgraph_nodes)`), returning `"mode": "graph_subgraph_2hop"`.

### [HIGH-02] Silent Fabricated Inference Fallbacks & Silent Model Substitution (Forensic Integrity Risk)
- **Status:** **`[FIXED]`**
- **Locations:**
  - `backend/app/ml/predict.py`
  - `backend/app/ml/gnn_predict.py`
  - `backend/app/api/routes/ml.py`
- **Implemented Fix:**
  - Added canonical model normalization (`normalize_model_name()`) mapping aliases (including `"graph_neural_network_(gnn)"` -> `"gnn"`).
  - Removed silent cross-model fallback lists and z-score heuristic guesses (`FileNotFoundError` / `ValueError` raised on missing checkpoints or bad vectors).
  - `POST /api/ml/predict` now returns HTTP `503` when a requested model artifact or `torch-geometric` runtime is unavailable, and HTTP `400` for unsupported model names or malformed feature vectors.

### [HIGH-03] Unsafe SPA Static File Path Join Without Canonical Prefix Check (CWE-22)
- **Status:** **`[FIXED]`**
- **Location:** `backend/app/main.py:87-110` (`serve_spa`)
- **Implemented Fix:**
  - Resolves `frontend_dist_path = (... / "frontend" / "dist").resolve()` and `candidate = (frontend_dist_path / full_path).resolve()`, requiring `candidate.is_relative_to(frontend_dist_path) and candidate.is_file()` before serving files.

### [HIGH-04] Raw Exception & Filesystem Path Disclosure (CWE-200, CWE-209)
- **Status:** **`[FIXED]`**
- **Locations:**
  - `backend/app/config.py` (`DEBUG: bool = False` default)
  - `backend/app/main.py:123-132` (`global_exception_handler`)
  - `backend/app/api/routes/dataset.py:38-42`
- **Implemented Fix:**
  - `settings.DEBUG` now defaults to `False`.
  - `global_exception_handler` logs full tracebacks server-side via `logger.exception(...)` and only returns `"detail": str(exc)` when `settings.DEBUG` is `True`.
  - `GET /api/dataset/status` replaces raw host `dataset_path` with `dataset_configured` and `dataset_directory_name`. (`frontend/src/pages/Dataset.tsx` updated cleanly.)

### [HIGH-05] Divergent Risk Scoring Formulas Across Codebase
- **Status:** **`[FIXED]`**
- **Locations:**
  - `backend/app/risk/engine.py:18,103`
  - `scripts/train_model.py:155-221`
  - `scripts/ingest_dataset.py:137-167`
- **Implemented Fix:**
  - `scripts/train_model.py` and `scripts/ingest_dataset.py` now compute DB transaction risk scores exclusively via `calculate_risk_score()` using neighborhood exposure (`known_illicit_neighbors`, `illicit_neighborhood_ratio`, `total_neighbors`) and transaction feature vectors.
  - `train_model.py` now scores transactions using `settings.ACTIVE_MODEL` rather than whichever baseline model looped last.
  - Reconciled `risk/engine.py:18` docstring (`ml_prob < 0.2`) to match `risk/engine.py:103`.
  - *(Note: `GET /api/models/unseen-benchmark` in `backend/app/api/routes/models.py:79-84` still derives simplified preview risk badges from precomputed fixture probabilities because `unseen_20_transactions.json` omits full graph/feature arrays.)*

---

## 3. Medium-Severity Findings

### [MED-01] SQLAlchemy `.cast(str)` Runtime Bug on Non-Numeric Transaction Search
- **Status:** **`[FIXED]`**
- **Locations:** `backend/app/api/routes/transactions.py:10,46,84-90`
- **Implemented Fix:** Imported `sqlalchemy.String`, replaced `.cast(str)` with `.cast(String)`, and updated `GET /api/search/transactions` so integer prefixes match both exact IDs and partial substring matches (`or_(Transaction.transaction_id == val, Transaction.transaction_id.cast(String).contains(q_clean))`).

### [MED-02] Frontend-Backend Schema Drift in Risk Alerts Queue
- **Status:** **`[FIXED]`**
- **Locations:** `backend/app/api/routes/risk.py:59-74`, `backend/app/schemas/dashboard.py`, `frontend/src/types/api.ts`, `frontend/src/pages/RiskAlerts.tsx`
- **Implemented Fix:** `GET /api/risk/high` now emits `"probability"`, `"prediction_probability"`, and `"total_degree"`, and `RiskAlerts.tsx` renders `prediction_probability ?? probability` and `total_degree ?? (in + out)`.

### [MED-03] Hardcoded Model Metrics, Non-Standard JSON (`Infinity`) & Static Benchmark Fixtures
- **Status:** **`[PARTIALLY FIXED / INTENTIONAL MVP DEMO FIXTURE]`**
- **Implemented Fixes:**
  - Fixed `models/gnn_metrics.json` invalid `Infinity` value (`null`) and added `_clean_float()` in `backend/app/ml/evaluate.py` so saved JSON metrics conform strictly to RFC 8259 (`allow_nan=False`).
  - Fixed `list_models()` disk-cache `is_active` bug in `backend/app/api/routes/models.py:146` (now compares normalized model name against `settings.ACTIVE_MODEL` instead of setting `True` for every model).
  - Updated `frontend/src/pages/Overview.tsx` to fetch `api.listModels()` dynamically instead of hardcoding `"96.16% ACC / 0.81 F1"` and `"Gradient Boosting"`.
  - Updated `frontend/src/pages/ModelPerformance.tsx` to compute test counts dynamically and label `unseen_20_transactions.json` honestly as `"Precomputed Benchmark"`.
- **Intentional MVP Behavior Remaining:**
  - `GET /api/dashboard` and `GET /api/analytics/overview` intentionally serve summary statistics and risk distribution from `elliptic_dataset_summary.json` when present so an un-ingested SQLite hackathon demo renders meaningful full-graph visualizations. Switch to live DB aggregations post-hackathon once full dataset ingestion is guaranteed.

### [MED-04] Dummy Uniform Feature Importances for Gradient Boosting
- **Status:** **`[FIXED]`**
- **Locations:** `backend/app/ml/train.py:83-130`, `models/gradient_boosting_metrics.json` *(on retrain)*
- **Implemented Fix:** Replaced uniform `1/165` array with bounded `sklearn.inspection.permutation_importance(..., sample_n=2500, n_repeats=3, scoring="average_precision")` and standardized artifact output names (`gradient_boosting.joblib`, `random_forest.joblib`, `logistic_regression.joblib`). *(Note: Pre-existing committed JSON under `models/gradient_boosting_metrics.json` retains legacy values until `train_model.py` is re-run against local Elliptic CSVs.)*

### [MED-05] Rate Limiting, Security Headers & Input Validation
- **Status:** **`[PARTIALLY FIXED / OPEN FOR PROD]`**
- **Implemented Fixes:**
  - Added security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) in `backend/app/main.py:65-71`.
  - Rejected `NaN`/`Inf` floats (`math.isfinite`) in `POST /api/ml/predict`.
  - Restricted `CaseUpdateRequest.status` to `Literal["OPEN", "UNDER REVIEW", "CLOSED"]`, added `min_length`/`max_length` constraints on case/note schemas (`backend/app/schemas/dashboard.py`), and added missing-case `404` checks in `InvestigationService` and `cases.py`.
- **Post-Hackathon / Pre-Production Remaining:** Add rate limiting on `/api/ml/*`, `/api/dataset/*`, and subgraph traversals, plus pagination on `GET /api/cases`.

### [MED-06] Non-Deterministic Graph Traversal Truncation & SQLite Schema Parity Gap
- **Status:** **`[FIXED]`**
- **Locations:** `backend/app/graph/traversal.py:35-50`, `backend/app/database.py:169,207`
- **Implemented Fix:** Added deterministic `.order_by(TransactionEdge.id.asc())` before `.limit(max_nodes)` in `get_transaction_subgraph()` and `UNIQUE` constraints on `(source_transaction_id, destination_transaction_id)` and `(case_id, transaction_id)` in `_create_sqlite_dev_tables()`.

### [MED-07] Adversarial ML & Crypto Forensics Chain-of-Custody
- **Status:** **`[PARTIALLY FIXED / RESEARCH NOTE]`**
- **Implemented Fix:** `ReportGenerator.generate_case_report()` (`backend/app/reports/generator.py`) now safely guards empty `tx_ids`, binds `model_findings.active_model` from `settings.ACTIVE_MODEL`, and emits an `integrity_sha256` digest displayed in `CaseDetail.tsx` and `Reports.tsx`.
- **Post-Hackathon / Research Note:** GraphSAGE class weighting yields `65.57%` illicit recall at `19.88%` precision on test steps `40–49`; calibrate probability thresholds on validation steps `35–39` and store append-only immutable audit events for regulatory production use.

---

## 4. Low-Severity & Repository Hygiene Findings

1. **`[LOW-01]` Tracked SQLite WAL/SHM Artifacts `[PARTIALLY FIXED]`:** `.gitignore` now excludes `*.db-shm`, `*.db-wal`, `*.db-journal`, `models/*.joblib`, and `models/*.pt`. Existing tracked `tracex_dev.db-shm`/`-wal` entries in Git index should be untracked with `git rm --cached` when cleaning up the branch.
2. **`[LOW-02]` Hardcoded Developer Filesystem Path `[FIXED]`:** Replaced hardcoded `D:\archive (1)\...` fallbacks in `backend/app/config.py`, `.env.example`, and `scripts/{train_model,ingest_dataset,inspect_dataset}.py` with portable `"data/elliptic_bitcoin_dataset"`.
3. **`[LOW-03]` Dependency Pinning & Runtime Test Compatibility `[PARTIALLY FIXED]`:** Lazy-imported `supabase` (`database.py`) and `torch_geometric` (`transactions.py`, `ml.py`, `scripts/train_model.py`); backend test suite runs cleanly (`24` passing tests + `8` optional PyG tests skipped when `torch-geometric` is absent). `requirements.txt` still leaves `numpy` and `torch` without upper bounds (avoid NumPy 2.x with PyTorch builds compiled against NumPy 1.x).
4. **`[LOW-04]` Documentation & Feature-Index Notes:** `README.md` contains minor duplicated prose and lists `1–94`/`95–165`, whereas codebase indexing is strictly `0..92` (93 local) and `93..164` (72 aggregate).
5. **`[LOW-05]` Leftover Frontend Template Assets:** `frontend/src/App.css` and `frontend/src/assets/{hero.png,react.svg,vite.svg}` remain unused starter template artifacts.

---

## 5. Post-Hackathon / Pre-Production Hardening Checklist

Before moving TRACE-X from Hackathon MVP to a live or regulated production environment:
1. Require JWT / Supabase Auth + RBAC across `/api/*` (especially `/api/cases*`, `/api/ml/train`, `/api/dataset/ingest`) and enforce verified `author` attribution.
2. Enable `ROW LEVEL SECURITY` (`RLS`) policies across all tables in `sql/schema.sql`.
3. Lock `CORS_ORIGINS` in `render.yaml` and environment configs to explicit frontend domains when credentials/cookies are enabled.
4. Migrate tabular ML checkpoints away from raw `pickle`/`joblib` to `skops` / ONNX / `safetensors` with verified SHA-256 manifests.
5. Replace static `elliptic_dataset_summary.json` / `unseen_20_transactions.json` demo shortcuts with live DB queries, calibrate GNN decision thresholds on validation steps `35–39`, and add API rate limiting + pagination on `/api/cases`.
