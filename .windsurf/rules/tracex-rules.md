---
trigger: always_on
---

# TRACE-X Rules (Windsurf)

Workspace instructions for **TRACE-X** (**Hackathon MVP**), a Bitcoin forensics platform over the **Elliptic Bitcoin Dataset** (`203,769` txs, `234,355` directed edges, `165` features, `49` timesteps). See `AGENTS.md`, `ARCHITECTURE.md`, `SECURITY.md`, and `SECURITY_AUDIT.md`.

## Build & Verification Commands

- **Backend tests:** `python -m unittest discover -s backend/tests -v` *(skips 8 PyG tests if `torch_geometric` is absent)*
- **API server:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend lint & build:** `npm --prefix frontend run lint && npm --prefix frontend run build`

## Mandatory Domain & ML Invariants

1. **Label Mapping (`mapper.py`):** `1` -> `ILLICIT` (`1`), `2` -> `LICIT` (`0`), `unknown`/`3`/null -> `UNKNOWN` (`-1`). Never coerce `UNKNOWN` into `LICIT`; exclude `y == -1` from supervised loss/metrics while retaining unknown nodes in graph edges.
2. **Temporal Split (`preprocessing.py`, `gnn_train.py`):** Train `1–34`, Val `35–39`, Test `40–49`. Never shuffle or apply random k-fold CV across timesteps.
3. **Feature Layout:** Strictly `165` features (`0..92` local, `93..164` 1-hop aggregate). Reject non-finite (`NaN`/`Inf`) inference inputs and output strict RFC-8259 JSON (`allow_nan=False`).
4. **Risk & Importance Integrity:** Route DB/breakdown risk scores (`0–100`) through `calculate_risk_score()` (`risk/engine.py`). Preserve `permutation_importance` for `HistGradientBoostingClassifier` (`train.py`).
5. **GNN Parity & Honest Inference:** Keep `BitcoinGraphSAGE` inference (`gnn_predict.py`) on bounded 2-hop subgraphs (`graph_subgraph_2hop`), `center_idx` placement, and deduplicated `to_undirected` edges. Fail closed (`HTTP 503`/`400`) via `normalize_model_name()` rather than silent heuristic fallbacks.

## Hackathon MVP UX & Cybersecurity Guardrails

- **MVP Access Model:** Keep read views, `/api/cases*`, and empty-DB fixtures (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) accessible without login walls; keep `verify_admin_key` (`X-Admin-Key` via `ADMIN_API_KEY`, no-op when unset) on `/api/ml/train` and `/api/dataset/ingest`. Pre-production JWT/RBAC and Supabase RLS belong post-hackathon (`SECURITY_AUDIT.md`).
- **Model Deserialization:** Preserve `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted checkpoints via `weights_only=False`/`pickle`.
- **CORS, Paths & Errors:** Preserve `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False` default, HTTP `500` traceback masking, and `dataset_directory_name` redaction in `/api/dataset/status`.
- **SQL & Dossier Integrity:** Use `.cast(String)` (`sqlalchemy.String`), keep SQLite `UNIQUE` constraints + lazy `supabase` import in `database.py`, deterministic `.order_by(TransactionEdge.id.asc())` in `traversal.py`, and `integrity_sha256` on case dossiers.
- **Frontend Sync & Secrets:** Keep `frontend/src/types/api.ts` matched (`RiskAlerts.tsx`, `Overview.tsx` dynamic models, `ModelPerformance.tsx` `Precomputed Benchmark`), avoid raw HTML, and keep server secrets out of `frontend/`.
