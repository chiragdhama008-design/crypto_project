# GitHub Copilot Instructions — TRACE-X (`crypto_project`)

You are assisting on **TRACE-X** (**Hackathon MVP**), a Bitcoin transaction forensics and AML intelligence platform built on the **Elliptic Bitcoin Dataset** (`FastAPI`, `SQLAlchemy`, optional `PyTorch Geometric`, `scikit-learn`, `React 19`, `TypeScript`, `Vite`, `Cytoscape.js`, `Recharts`).

Always respect [`AGENTS.md`](../AGENTS.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`SECURITY.md`](../SECURITY.md), and [`SECURITY_AUDIT.md`](../SECURITY_AUDIT.md).

## Architecture & Commands

- **Backend API:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000` (all routers mounted under `/api`)
- **Backend Tests:** `python -m unittest discover -s backend/tests -v` (isolated temp SQLite; skips 8 PyG tests when `torch_geometric` is absent)
- **Frontend:** `cd frontend && npm run lint && npm run build` (`oxlint` + `tsc -b && vite build`)
- **CLI Pipelines:** `scripts/inspect_dataset.py`, `scripts/train_model.py`, `scripts/ingest_dataset.py` (portable default `"data/elliptic_bitcoin_dataset"`)

## Domain & ML Invariants

1. **Label Mapping (`backend/app/data_sources/elliptic/mapper.py`):**
   - `1` -> `ILLICIT`, `2` -> `LICIT`, `unknown`/`3`/null -> `UNKNOWN`.
   - Never coerce `UNKNOWN` to `LICIT`. Exclude `y == -1` from supervised loss/metrics while preserving unlabeled nodes in graph edges.
2. **Temporal Chronological Split:**
   - Train: timesteps `1–34` | Val: `35–39` | Test: `40–49`. Never use random k-fold CV across time.
3. **Feature Layout:**
   - 165 standardized features per transaction: indices `0..92` (Features 1–93, local) and `93..164` (Features 94–165, 1-hop aggregate).
   - Reject non-finite floats (`math.isfinite`) on `/api/ml/predict`.
4. **Risk Scoring & ML Integrity:**
   - Always use `backend/app/risk/engine.py:calculate_risk_score()` (`ml_probability < 0.2` licit cap).
   - Keep 2-hop undirected GNN inference (`gnn_predict.py`: `to_undirected`, `center_idx`), `HistGradientBoostingClassifier` permutation importances (`train.py`), and fail-closed `HTTP 503` responses (never fabricate heuristic fallbacks).

## Security & Hackathon MVP Standards

- **MVP Access Model:** Keep read views, `/api/cases*`, and empty-DB JSON fallbacks (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) usable without forced login screens; preserve `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` tracks full JWT/RBAC and Supabase RLS for post-hackathon hardening).
- **Safe Deserialization:** Preserve `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted checkpoints with `weights_only=False` or raw `pickle`.
- **CORS:** Never combine wildcard/regex origins with `allow_credentials=True` (`allow_credentials=not _wildcard_cors` in `main.py`).
- **Path & Error Hygiene:** Preserve `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False` default, traceback masking in HTTP `500`s, security headers, and `dataset_directory_name` redaction in `/api/dataset/status`.
- **Database & Frontend Sync:** Use `sqlalchemy.String` in `.cast(String)` (never `.cast(str)`), lazy-import `supabase`/`torch_geometric`, bind UI components (`Overview.tsx`, `RiskAlerts.tsx`, `ModelPerformance.tsx`) dynamically, surface `integrity_sha256` on case dossiers, and keep `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` out of `frontend/`.
