# Amazon Q Developer Rules — TRACE-X (`crypto_project`)

Workspace conventions and mandatory security/ML guardrails for **TRACE-X** (**Hackathon MVP** Bitcoin forensics & AML intelligence over the **Elliptic Bitcoin Dataset**).

Refer to [`AGENTS.md`](../../AGENTS.md), [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`SECURITY.md`](../../SECURITY.md), and [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md) for authoritative project context.

## Commands

- **Backend tests:** `python -m unittest discover -s backend/tests -v` *(skips 8 optional PyG tests when `torch_geometric` is absent)*
- **Backend API:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend lint & build:** `npm --prefix frontend run lint && npm --prefix frontend run build`

## Mandatory Domain & ML Rules

1. **Label Preservation (`mapper.py`):** `1 -> ILLICIT`, `2 -> LICIT`, `unknown/3/null -> UNKNOWN (-1)`. Never coerce `UNKNOWN` to `LICIT`; exclude `y == -1` from supervised training loss and evaluation metrics while preserving unknown nodes in graph edges.
2. **Chronological Split (`preprocessing.py`, `gnn_train.py`):** Train `1–34`, Validation `35–39`, Test `40–49`. Never randomize across timesteps.
3. **Features (`165`):** `0..92` local features, `93..164` 1-hop aggregate features. Reject `NaN`/`Inf` in `/api/ml/predict` and enforce strict RFC-8259 JSON (`allow_nan=False`).
4. **Risk & Importance Integrity:** Use `calculate_risk_score()` (`backend/app/risk/engine.py`) across DB pipelines/breakdowns (`0–100`) and preserve `permutation_importance` for `HistGradientBoostingClassifier` (`train.py`).
5. **GNN & Model Integrity:** Keep `BitcoinGraphSAGE` inference (`gnn_predict.py`) on bounded 2-hop deduplicated undirected subgraphs (`to_undirected`, `center_idx`), and fail closed (`503`/`400`) via `normalize_model_name()`.

## Hackathon MVP & Cybersecurity Guardrails

- **Access Control:** Keep read routes, `/api/cases*`, and empty-DB JSON fallbacks (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) login-free for hackathon demos; preserve optional `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` lists post-hackathon JWT/RBAC + Supabase RLS).
- **Safe Deserialization:** Keep `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted artifacts with `weights_only=False` or raw `pickle`.
- **CORS, Paths & Errors:** Preserve `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False`, traceback suppression, and `dataset_directory_name` redaction.
- **Database & Secrets Hygiene:** Use `sqlalchemy.String` in `.cast(String)` (never `.cast(str)`), preserve SQLite `UNIQUE` constraints + lazy `supabase`, deterministic `traversal.py` ordering, `integrity_sha256` on reports, synced UI contracts (`Overview.tsx`, `RiskAlerts.tsx`, `ModelPerformance.tsx`), and never expose secrets or commit `tracex_dev.db*` (`-shm`/`-wal`).
