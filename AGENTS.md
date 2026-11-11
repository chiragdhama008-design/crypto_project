# AGENTS.md — Universal Instructions for AI Coding Agents

This file defines mandatory workspace conventions, domain invariants, build/test commands, and security guardrails for **all AI coding agents** working in `crypto_project` (**TRACE-X Forensic Intelligence Platform — Hackathon MVP**).

Read [`ARCHITECTURE.md`](ARCHITECTURE.md), [`SECURITY.md`](SECURITY.md), and [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) before modifying code, database schemas, ML pipelines, or deployment configs.

---

## 1. Project Overview & MVP Posture

TRACE-X is a full-stack crypto transaction forensics platform analyzing the **Elliptic Bitcoin Transaction Graph** (203,769 transactions, 234,355 directed edges, 165 features, 49 timesteps):
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy ORM, Pydantic v2, PyTorch + optional PyTorch Geometric (`BitcoinGraphSAGE`), scikit-learn (`HistGradientBoostingClassifier`, `RandomForestClassifier`, `LogisticRegression`).
- **Database:** Supabase PostgreSQL (`sql/schema.sql`) with local SQLite fallback (`tracex_dev.db` via `backend/app/database.py`).
- **Frontend:** React 19, TypeScript, Vite 8, TailwindCSS 3, Cytoscape.js, Recharts, React Router v7 (`frontend/`).
- **CLI Pipelines:** `scripts/inspect_dataset.py`, `scripts/ingest_dataset.py`, `scripts/train_model.py`.
- **Hackathon MVP UX Constraint:** Zero-friction demo access is intentional—**do not** add mandatory login walls blocking `/api/dashboard`, `/api/transactions*`, `/api/cases*`, `/api/risk*`, `/api/models*`, or frontend demo views, and preserve `elliptic_dataset_summary.json` / `unseen_20_transactions.json` empty-DB fixtures unless upgrading for production.

---

## 2. Build, Run & Verification Commands

Run commands from the repository root (`e:\PROJECTS\crypto_project` / repo root):

```bash
# Backend tests (unittest / pytest)
python -m unittest discover -s backend/tests -v
python -m pytest backend/tests/ -v

# Start Backend API (http://localhost:8000, Swagger at /docs)
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend setup, lint, typecheck & build
cd frontend
npm install
npm run lint          # oxlint
npm run build         # tsc -b && vite build
npm run dev           # http://localhost:5173 (proxies /api -> 127.0.0.1:8000)
```

### Offline Data & Training Commands (Requires Local Elliptic CSVs)
```bash
python scripts/inspect_dataset.py --data-dir "data/elliptic_bitcoin_dataset"
python scripts/train_model.py --data-dir "data/elliptic_bitcoin_dataset" --models logistic_regression random_forest gradient_boosting gnn
python scripts/ingest_dataset.py --data-dir "data/elliptic_bitcoin_dataset" --limit 10000
```

### Current Known Environment Notes
- `supabase` and `torch-geometric` are **optional** in local Python environments: `database.py` lazy-imports `supabase`, and `transactions.py` / `ml.py` / `train_model.py` lazy-import PyG inference/training modules so API routes and tabular tests run cleanly (`test_gnn.py` cleanly skips 8 PyG-specific tests when `torch_geometric` is absent).
- `requirements.txt` pins `numpy>=1.26.0` and `torch>=2.2.0` without upper bounds; avoid NumPy 2.x with PyTorch builds compiled against NumPy 1.x (`tensor.numpy()` raises `_ARRAY_API` errors — prefer `.tolist()`).
- Legacy `tracex_dev.db-shm` and `tracex_dev.db-wal` exist in Git history while `.gitignore` now excludes `*.db-shm`/`-wal`; tests must use isolated temp SQLite files (`tempfile.TemporaryDirectory`) and never commit local DB files.

---

## 3. Non-Negotiable Domain & ML Invariants

1. **Elliptic Label Semantics (`backend/app/data_sources/elliptic/mapper.py`):**
   - `1` / `illicit` -> `ILLICIT` (`1`)
   - `2` / `licit` -> `LICIT` (`0`)
   - `unknown` / `3` / null -> `UNKNOWN` (`-1`)
   - **Never** treat or coerce `UNKNOWN` as `LICIT`. Unknown nodes are included in graph structure for GNN message passing, but **must remain excluded (`y != -1`)** from supervised loss and evaluation metrics.
2. **Chronological Temporal Split (`preprocessing.py`, `gnn_train.py`):**
   - Train: timesteps `1–34` | Validation: `35–39` | Test: `40–49`.
   - **Never** shuffle or apply random k-fold cross-validation across timesteps (causes severe temporal leakage).
3. **Feature Indexing & Validation (`transactions.py`, `explain.py`, `mapper.py`, `ml.py`):**
   - Feature vectors must have exact length `165` (`0..92` = 93 local transaction features; `93..164` = 72 1-hop neighborhood aggregate features).
   - Reject non-finite (`NaN`/`Inf`) feature values (`math.isfinite`) on inference endpoints, and sanitize metrics JSON outputs (`allow_nan=False`).
4. **No Silent Fabricated Predictions (`ml/predict.py`, `ml/gnn_predict.py`):**
   - Fail closed (`FileNotFoundError` -> HTTP `503`, `ValueError` -> HTTP `400`). Do **not** re-introduce silent heuristic fallbacks or silent cross-model substitution, and preserve `normalize_model_name()`.
5. **Deterministic Risk Scoring (`backend/app/risk/engine.py`):**
   - Compute database and breakdown risk scores (`0–100`) exclusively via `calculate_risk_score()` (55% ML + 25% graph exposure + 10% topology + 10% z-score anomalies + ground-truth overrides). Do not introduce divergent formulas in `scripts/` or live DB scoring routes.
6. **GNN Graph Consistency (`ml/gnn_model.py`, `ml/gnn_predict.py`):**
   - `BitcoinGraphSAGE` is a 2-layer model (`2-hop` receptive field) trained on deduplicated undirected edges (`to_undirected`). Preserve bounded **2-hop** subgraph extraction, `to_undirected`, and `center_idx` placement in `predict_gnn_transaction()` and `predict_gnn_with_subgraph()`.

---

## 4. Cybersecurity Guardrails (MVP + Production Awareness)

- **Admin Operations Gate (`backend/app/security.py`):** Keep `Depends(verify_admin_key)` (`X-Admin-Key`) on `POST /api/ml/train` and `POST /api/dataset/ingest` (`clear=True` resets DB). Do **not** add blocking login gates on demo UI/read/case routes unless implementing post-hackathon production hardening.
- **Model Deserialization:** Keep `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted checkpoints with `pickle` / `weights_only=False`. (Full `skops`/SHA-256 verification for `.joblib` artifacts is tracked post-hackathon in `SECURITY_AUDIT.md`.)
- **CORS:** Never combine `allow_origins=["*"]` or `allow_origin_regex=r"https?://.*"` with `allow_credentials=True`. Preserve `_wildcard_cors` credential suppression in `main.py`.
- **Path & Error Hygiene:** Preserve canonical `.resolve().is_relative_to(...)` validation in `serve_spa()` (`main.py`), `DEBUG=False` default, traceback masking in HTTP `500`s, security headers, and `dataset_configured`/`dataset_directory_name` path sanitization in `/api/dataset/status`.
- **SQL & Supabase Security:** Always use parameterized SQLAlchemy queries and `sqlalchemy.String` in `.cast(String)` (never `.cast(str)`). Never place `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` in `frontend/`. Enable Supabase `ROW LEVEL SECURITY` in `sql/schema.sql` before public PostgREST exposure.
- **Forensic Disclaimers & Auditability:** Preserve legal disclaimers noting predictions are probabilistic investigative leads, and keep `integrity_sha256` canonical digests intact on exported case dossiers (`reports/generator.py`).

---

## 5. Coding Conventions & Review Checklist

- **Python:** FastAPI dependency injection (`Depends(get_db)`), Pydantic v2 `BaseModel` schemas (`model_config = {"protected_namespaces": ()}` when fields start with `model_`), explicit HTTP status codes (`400`/`403`/`404`/`503`).
- **TypeScript / React:** Keep `frontend/src/types/api.ts` synchronized with backend FastAPI payloads (`RiskAlerts.tsx` uses `prediction_probability ?? probability` & `total_degree`; `Overview.tsx` binds dynamically to `api.listModels()`; `ModelPerformance.tsx` labels static 20-tx fixtures honestly as `"Precomputed Benchmark"`).
- **Before Completing Any Change:**
  1. Run backend tests (`python -m unittest discover -s backend/tests -v`).
  2. Run frontend lint & TypeScript build (`npm --prefix frontend run lint && npm --prefix frontend run build`) when `frontend/` changed and `node_modules` is available (explicitly note if skipped due to uninstalled `node_modules`).
  3. Cross-check against [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) so fixed vulnerabilities are never re-introduced.
