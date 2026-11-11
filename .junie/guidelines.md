# JetBrains Junie Guidelines — TRACE-X (`crypto_project`)

Project guidelines for **TRACE-X** (**Hackathon MVP**), a Bitcoin UTXO forensics and AML intelligence platform over the **Elliptic Bitcoin Dataset** (`FastAPI`, `SQLAlchemy`, optional `PyTorch Geometric`, `scikit-learn`, `React 19`, `TypeScript`, `Vite 8`).

Read [`AGENTS.md`](../AGENTS.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`SECURITY.md`](../SECURITY.md), and [`SECURITY_AUDIT.md`](../SECURITY_AUDIT.md) before modifying code or schemas.

## Build, Run & Test Commands

```bash
# Backend unit & API tests (isolated temp SQLite; skips 8 PyG tests when torch_geometric absent)
python -m unittest discover -s backend/tests -v

# Start FastAPI server (port 8000)
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend lint & TypeScript production build
npm --prefix frontend run lint
npm --prefix frontend run build
```

## Domain & ML Invariants

1. **Labels (`backend/app/data_sources/elliptic/mapper.py`):** `1 -> ILLICIT (1)`, `2 -> LICIT (0)`, `unknown/3/null -> UNKNOWN (-1)`. Never map `UNKNOWN` to `LICIT`; exclude `y == -1` from supervised loss/evaluation while retaining unknown nodes in graph edges.
2. **Temporal Split:** Train timesteps `1–34`, Validation `35–39`, Test `40–49`. Never shuffle across time.
3. **Features (`165`):** Indices `0..92` (93 local features) and `93..164` (72 1-hop aggregate features). Reject `NaN`/`Inf` on `/api/ml/predict` and enforce strict RFC-8259 JSON (`allow_nan=False`).
4. **Canonical Risk & Importances:** Always compute DB/breakdown risk scores via `calculate_risk_score()` (`backend/app/risk/engine.py`) and preserve `permutation_importance` for `HistGradientBoostingClassifier` (`train.py`).
5. **GNN & Inference Integrity:** Match 2-layer `BitcoinGraphSAGE` inference (`gnn_predict.py`) with bounded 2-hop subgraphs (`graph_subgraph_2hop`), `center_idx` placement, and deduplicated `to_undirected` edges. Fail closed (`503`/`400`) via `normalize_model_name()`.

## Hackathon MVP & Cybersecurity Guardrails

- **MVP Access Model:** Keep read routes, `/api/cases*`, and empty-DB JSON fallbacks (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) open without login blockers; keep optional `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` tracks post-hackathon JWT/RBAC and Supabase RLS).
- **Safe Deserialization:** Keep `torch.load(..., weights_only=True)` in `gnn_predict.py`; avoid `weights_only=False` or untrusted `pickle`/`joblib` loads.
- **CORS, Path & Error Safety:** Preserve `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False`, traceback suppression, and `dataset_directory_name` redaction.
- **SQL, Dossiers & Contracts:** Use `.cast(String)` (`sqlalchemy.String`), keep SQLite `UNIQUE` constraints + lazy `supabase` import, deterministic `traversal.py` ordering, `integrity_sha256` on reports, synced dynamic React components (`Overview.tsx`, `RiskAlerts.tsx`, `ModelPerformance.tsx`), and never commit `.env`, `D:\archive (1)...`, or `tracex_dev.db*` (`-shm`/`-wal`).
