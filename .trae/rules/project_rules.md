# Trae Project Rules — TRACE-X (`crypto_project`)

Project rules for **TRACE-X** (**Hackathon MVP**), a Bitcoin transaction forensics and AML investigation platform over the **Elliptic Bitcoin Dataset** (`FastAPI`, `SQLAlchemy`, optional `PyTorch Geometric`, `scikit-learn`, `React 19`, `TypeScript`, `Vite 8`).

Consult [`AGENTS.md`](../../AGENTS.md), [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`SECURITY.md`](../../SECURITY.md), and [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md) when planning or editing code.

## Verification Commands

- **Backend tests:** `python -m unittest discover -s backend/tests -v` *(skips 8 optional PyG tests when `torch_geometric` is absent)*
- **Backend server:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend lint & build:** `npm --prefix frontend run lint && npm --prefix frontend run build`

## Core Invariants

1. **Elliptic Labels (`mapper.py`):** `1 -> ILLICIT (1)`, `2 -> LICIT (0)`, `unknown/3/null -> UNKNOWN (-1)`. Never map `UNKNOWN` to `LICIT`; exclude `y == -1` from supervised loss/metrics while retaining unknown nodes in graph edges.
2. **Temporal Split:** Strictly train `1–34`, validate `35–39`, test `40–49`. Never shuffle across time.
3. **Features (`165`):** `0..92` local features, `93..164` 1-hop aggregates. Reject `NaN`/`Inf` in API inference and enforce RFC-8259 JSON metrics (`allow_nan=False`).
4. **Canonical Risk & Importances:** Compute DB/breakdown risk scores via `calculate_risk_score()` (`risk/engine.py`) and preserve `permutation_importance` for `HistGradientBoostingClassifier` (`train.py`).
5. **GNN & Inference Integrity:** Align `BitcoinGraphSAGE` inference (`gnn_predict.py`) with bounded 2-hop subgraphs (`graph_subgraph_2hop`), `center_idx` insertion, and deduplicated `to_undirected` edges; fail closed (`503`/`400`) via `normalize_model_name()`.

## Hackathon MVP & Security Guardrails

- **MVP Access Model:** Keep read endpoints, `/api/cases*`, and empty-DB JSON summary fallbacks (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) accessible without blocking login walls; keep optional `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` tracks post-hackathon JWT/RBAC + Supabase RLS).
- **Safe Model Loading:** Keep `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted checkpoints via `weights_only=False` or raw `pickle`.
- **CORS, Path & Error Hygiene:** Keep `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False`, HTTP `500` traceback suppression, and `dataset_directory_name` redaction.
- **Database, Frontend & Git Hygiene:** Use `.cast(String)` (`sqlalchemy.String`), keep SQLite `UNIQUE` constraints + lazy `supabase`, deterministic `traversal.py` ordering, `integrity_sha256` on reports, synced React types/pages (`Overview.tsx`, `RiskAlerts.tsx`, `ModelPerformance.tsx`), keep secrets out of `frontend/`, and never commit `.env` or `tracex_dev.db*` (`-shm`/`-wal`).
