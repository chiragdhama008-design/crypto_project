---
applyTo: "backend/**,scripts/**,sql/**"
---

# Backend, ML & Database Security Rules (TRACE-X)

Follow [`SECURITY.md`](../../SECURITY.md) and [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md) for all Python and SQL changes:

1. **SQLAlchemy & Supabase PostgreSQL:**
   - Use ORM/bound parameters only; never interpolate strings into `text(...)`.
   - Use `from sqlalchemy import String` in `.cast(String)` (never `.cast(str)`) and keep prefix substring matching in `/api/search/transactions`.
   - Preserve `UNIQUE` constraints (`uq_edge`, `uq_case_tx`) in both `sql/schema.sql` and `_create_sqlite_dev_tables()` (`database.py`).
   - Keep `supabase` lazy-imported inside `get_supabase_client()` so SQLite/API tests work cleanly without `supabase-py`.
   - *(Pre-Production)* Add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with explicit policies before exposing Supabase PostgREST externally.

2. **ML & GNN Integrity (`backend/app/ml/`):**
   - Preserve `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted artifacts with `weights_only=False` / `pickle`.
   - Preserve `normalize_model_name()` and fail closed (`FileNotFoundError` -> HTTP `503`, `ValueError` -> HTTP `400`); never add silent heuristic fallbacks or silent cross-model substitution.
   - Keep `BitcoinGraphSAGE` inference (`gnn_predict.py`) aligned with training (`gnn_train.py`): bounded 2-hop traversal (`graph_subgraph_2hop`), `center_idx` insertion, and deduplicated undirected edges (`to_undirected`).
   - Preserve `permutation_importance` in `train.py` for `HistGradientBoostingClassifier` (never uniform `1/165` placeholders) and `_clean_float` (`allow_nan=False`) in `evaluate.py`.
   - Validate `len(features) == 165` and `all(math.isfinite(v) for v in features)` in `/api/ml/predict`.

3. **API, Risk Scoring & MVP Auth Hygiene:**
   - Preserve `Depends(verify_admin_key)` on `/api/ml/train` and `/api/dataset/ingest`; keep `/api/cases*` and read endpoints login-free for Hackathon MVP UX.
   - Preserve deterministic `.order_by(TransactionEdge.id.asc())` in `traversal.py`, `integrity_sha256` on reports, `CaseUpdateRequest.status` `Literal` validation, and `404` checks in `InvestigationService`.
   - Compute DB/breakdown risk scores exclusively via `calculate_risk_score()` (`backend/app/risk/engine.py`).
   - Never hardcode local paths (`D:\archive (1)...`), leak raw `str(exc)` outside `DEBUG=True`, expose raw host `DATASET_PATH`, or combine wildcard CORS with `allow_credentials=True`.
