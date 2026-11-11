# Roo Code Workspace Rules — TRACE-X (`crypto_project`)

Repository rules for **TRACE-X** (**Hackathon MVP**), a Bitcoin UTXO forensics platform built on the **Elliptic Bitcoin Dataset** (FastAPI, SQLAlchemy, optional PyTorch Geometric, scikit-learn, React 19, TypeScript, Vite 8).

Always consult [`AGENTS.md`](../../AGENTS.md), [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`SECURITY.md`](../../SECURITY.md), and [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md).

## Commands

- **Backend tests:** `python -m unittest discover -s backend/tests -v` *(skips 8 optional PyG tests when `torch_geometric` is absent)*
- **Backend API:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend lint & build:** `npm --prefix frontend run lint && npm --prefix frontend run build`

## Non-Negotiable ML & Domain Rules

1. **Labels (`backend/app/data_sources/elliptic/mapper.py`):** `1 -> ILLICIT (1)`, `2 -> LICIT (0)`, `unknown/3/null -> UNKNOWN (-1)`. Never coerce `UNKNOWN` into `LICIT`; mask `y != -1` in loss and evaluation while preserving unknown nodes in graph edges.
2. **Temporal Split:** Strictly train `1–34`, validate `35–39`, test `40–49`. Never randomize across timesteps.
3. **Features (`165`):** Indices `0..92` = 93 local features, `93..164` = 72 1-hop aggregates. Reject `NaN`/`Inf` on `/api/ml/predict` and enforce strict RFC-8259 JSON metrics (`allow_nan=False`).
4. **Risk Scoring & Importances:** Use `calculate_risk_score()` (`backend/app/risk/engine.py`) across pipelines/live breakdowns (`0–100`) and preserve `permutation_importance` for `HistGradientBoostingClassifier` (`train.py`).
5. **GNN Parity & Honest Inference:** Keep `BitcoinGraphSAGE` inference (`gnn_predict.py`) aligned via bounded 2-hop subgraphs (`graph_subgraph_2hop`), `center_idx` placement, and `to_undirected` edges. Fail closed (`503`/`400`) via `normalize_model_name()`.

## Hackathon MVP & Cybersecurity Standards

- **MVP Access Model:** Keep read views, `/api/cases*`, and empty-DB JSON fallbacks (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) accessible without blocking login walls; keep optional `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` lists post-hackathon JWT/RBAC + Supabase RLS).
- **Model Deserialization:** Preserve `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted artifacts with `weights_only=False`/`pickle`.
- **CORS, Path & Error Safety:** Keep `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False`, traceback masking, `dataset_directory_name` redaction, and never commit `.env`, `D:\archive (1)...`, or `tracex_dev.db*` (`-shm`/`-wal`).
- **Database & Frontend Contracts:** Use `.cast(String)`, preserve SQLite `UNIQUE` constraints + lazy `supabase` import, deterministic `traversal.py` ordering, `integrity_sha256` case dossier digests, dynamic UI metrics (`Overview.tsx`, `RiskAlerts.tsx`, `ModelPerformance.tsx`), and keep server secrets out of `frontend/`.
