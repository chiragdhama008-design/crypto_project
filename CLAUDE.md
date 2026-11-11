# CLAUDE.md — Claude Code Project Guide

This repository (`crypto_project`) implements **TRACE-X**, a **Hackathon MVP** Bitcoin transaction forensics and AML investigation platform over the **Elliptic Bitcoin Dataset** (FastAPI + SQLAlchemy + PyTorch Geometric + scikit-learn + React/TypeScript).

Always read [`AGENTS.md`](AGENTS.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`SECURITY.md`](SECURITY.md), and [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) when planning or editing code.

## Quick Commands

```bash
# Backend tests (uses isolated temp SQLite; skips 8 PyG tests if torch_geometric is absent)
python -m unittest discover -s backend/tests -v
python -m pytest backend/tests/ -v

# Start FastAPI backend (port 8000)
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend lint & type-checked production build (requires npm install in frontend/)
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Key Architectural Map

- `backend/app/main.py` — FastAPI app, CORS credential guard, security headers, path-checked SPA mount, debug-gated error handler, `/api` routers.
- `backend/app/security.py` — Optional `verify_admin_key` (`X-Admin-Key`) for admin training/ingestion routes (no-op when `ADMIN_API_KEY` is unset).
- `backend/app/config.py` & `database.py` — Pydantic `Settings` (`.env`, `DEBUG=False`, portable `DATASET_PATH`), PostgreSQL primary + `tracex_dev.db` SQLite fallback, lazy `supabase` import.
- `backend/app/api/routes/*.py` — 11 API modules (`health`, `dashboard`, `transactions`, `graph`, `risk`, `models`, `analytics`, `cases`, `reports`, `ml`, `dataset`).
- `backend/app/ml/` — 2-layer `BitcoinGraphSAGE` (`gnn_model.py`, `gnn_train.py`, `gnn_predict.py` with `weights_only=True` & 2-hop `to_undirected`), tabular models (`train.py` permutation importance, `predict.py` strict aliases & `503` fail-closed), temporal split (`preprocessing.py`), sanitized metrics (`evaluate.py`), z-score explainer (`explain.py`).
- `backend/app/graph/` & `backend/app/risk/engine.py` — Deterministic bounded subgraph extraction, neighborhood exposure signals, and canonical composite risk scoring (`calculate_risk_score`, `0–100`).
- `backend/app/reports/generator.py` — Case dossiers with canonical `integrity_sha256` digest.
- `scripts/` — `inspect_dataset.py`, `ingest_dataset.py`, `train_model.py`.
- `sql/schema.sql` — Canonical Supabase PostgreSQL DDL.
- `frontend/src/` — React 19 SPA (`services/api.ts`, `types/api.ts`, `pages/*.tsx`, `components/`).

## Non-Negotiable Rules

1. **Preserve Hackathon MVP Demo Flow:** Keep demo read routes, `/api/cases*`, and empty-DB JSON fallbacks (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) accessible without blocking login walls; keep `ADMIN_API_KEY` optional.
2. **Elliptic Labels:** `1 -> ILLICIT`, `2 -> LICIT`, `unknown/3 -> UNKNOWN`. Never coerce `UNKNOWN` to `LICIT`; exclude `y == -1` from supervised loss/metrics while keeping unlabeled nodes in graph topology.
3. **Temporal Integrity:** Strictly split timesteps `1–34` (train), `35–39` (val), `40–49` (test). Never randomize across time.
4. **Feature Bounds:** Exactly `165` features (`0..92` local, `93..164` 1-hop aggregate). Reject non-finite (`NaN`/`Inf`) floats on `/api/ml/predict`.
5. **Canonical Risk & ML Fidelity:** Route DB scoring through `calculate_risk_score()`, keep 2-hop undirected GNN parity (`to_undirected`), preserve `HistGradientBoostingClassifier` permutation importances, and fail closed (`503`) rather than substituting models or returning heuristic fallbacks.
6. **Preserved Security & Bug Fixes:**
   - Keep `allow_credentials=not _wildcard_cors` in `main.py` (never wildcard/regex + credentials).
   - Keep `torch.load(..., weights_only=True)` in `gnn_predict.py`.
   - Keep `serve_spa()` `.resolve().is_relative_to(...)`, `DEBUG=False`, and `dataset.py` path redaction (`dataset_directory_name`).
   - Use `sqlalchemy.String` in `.cast(String)` (never `.cast(str)`) and keep prefix matching in `GET /api/search/transactions`.
   - Keep `Overview.tsx` bound dynamically to `api.listModels()`, `RiskAlerts.tsx` synced with `/api/risk/high`, and `ModelPerformance.tsx` labeling static benchmarks honestly (`Precomputed Benchmark`).

## Verification Before Finishing

- Run `python -m unittest discover -s backend/tests -v`.
- If editing `frontend/`, run `npm --prefix frontend run lint` and `npm --prefix frontend run build` (report accurately if `frontend/node_modules` is missing).
- Ensure no local `.db`, `.db-shm`, `.db-wal`, `.env`, or hardcoded developer paths (`D:\archive (1)...`) are introduced or modified.
