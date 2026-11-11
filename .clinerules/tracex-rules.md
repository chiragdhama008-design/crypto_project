# Cline Workspace Rules — TRACE-X (`crypto_project`)

You are working on **TRACE-X** (**Hackathon MVP**), a Bitcoin transaction forensics and AML intelligence platform powered by FastAPI, SQLAlchemy, optional PyTorch Geometric (`BitcoinGraphSAGE`), scikit-learn, Supabase PostgreSQL / SQLite, and React 19 + TypeScript (`frontend/`).

Before making architectural, schema, ML, or API changes, review [`AGENTS.md`](../AGENTS.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md), [`SECURITY.md`](../SECURITY.md), and [`SECURITY_AUDIT.md`](../SECURITY_AUDIT.md).

## Commands

- **Backend tests:** `python -m unittest discover -s backend/tests -v` *(skips 8 optional PyG tests if `torch_geometric` is absent)*
- **Backend dev API:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend lint & typecheck build:** `npm --prefix frontend run lint && npm --prefix frontend run build`

## Domain & ML Invariants

1. **Elliptic Label Semantics (`mapper.py`):** `1` -> `ILLICIT`, `2` -> `LICIT`, `unknown`/`3`/null -> `UNKNOWN` (`-1`). Never coerce `UNKNOWN` to `LICIT`; exclude `y == -1` from supervised loss/evaluation while keeping unknown nodes in graph edges.
2. **Chronological Split (`preprocessing.py`, `gnn_train.py`):** Train timesteps `1–34`, Validation `35–39`, Test `40–49`. Never shuffle across time.
3. **Features (`165`):** `0..92` local features, `93..164` 1-hop aggregates. Reject `NaN`/`Inf` (`math.isfinite`) in `/api/ml/predict` and enforce valid RFC-8259 JSON (`allow_nan=False`).
4. **Canonical Risk & Importances (`risk/engine.py`, `ml/train.py`):** Compute DB/breakdown `0–100` risk scores via `calculate_risk_score()`, and preserve `permutation_importance` for `HistGradientBoostingClassifier`.
5. **GNN Train-Serve Alignment (`gnn_predict.py`):** 2-layer `BitcoinGraphSAGE` uses bounded 2-hop traversal (`graph_subgraph_2hop`), `center_idx` insertion, and deduplicated `to_undirected` edges.
6. **Honest Inference:** Fail closed (`503`/`400`) via `normalize_model_name()` instead of silent heuristic fallbacks or mismatched model substitutions.

## Hackathon MVP & Security Guardrails

- **Access Control:** Keep read routes, `/api/cases*`, and empty-DB demo fixtures (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) accessible without blocking auth screens; preserve `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` tracks full JWT/RBAC and Supabase RLS post-hackathon).
- **Safe Deserialization:** Preserve `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted artifacts with `weights_only=False` or raw `pickle`.
- **CORS, Path & Error Hygiene:** Preserve `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False`, traceback masking, and `dataset_directory_name` path redaction in `/api/dataset/status`.
- **SQL & Dossier Integrity:** Use `sqlalchemy.String` in `.cast(String)` (never `.cast(str)`), preserve SQLite `UNIQUE` constraints + lazy `supabase` import, deterministic `.order_by(TransactionEdge.id.asc())` in `traversal.py`, and `integrity_sha256` on case dossiers.
- **Frontend Contracts & Secrets:** Keep `frontend/src/types/api.ts` synchronized (`RiskAlerts.tsx`, `Overview.tsx` dynamic models, `ModelPerformance.tsx` `Precomputed Benchmark`), and never expose `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, or `ADMIN_API_KEY` in `frontend/`.
