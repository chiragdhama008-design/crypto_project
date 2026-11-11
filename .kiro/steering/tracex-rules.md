---
inclusion: always
---

# Kiro Steering Rules — TRACE-X (`crypto_project`)

Mandatory architecture, ML domain, and cybersecurity rules for **TRACE-X** (**Hackathon MVP** Bitcoin forensics & AML intelligence platform over the **Elliptic Bitcoin Dataset**).

Always consult [`AGENTS.md`](../../AGENTS.md), [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`SECURITY.md`](../../SECURITY.md), and [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md).

## Commands

- **Backend tests:** `python -m unittest discover -s backend/tests -v` *(skips 8 optional PyG tests when `torch_geometric` is absent)*
- **Backend API:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend lint & build:** `npm --prefix frontend run lint && npm --prefix frontend run build`

## Elliptic Domain & ML Invariants

1. **Label Semantics (`mapper.py`):** `1 -> ILLICIT (1)`, `2 -> LICIT (0)`, `unknown/3/null -> UNKNOWN (-1)`. Never coerce `UNKNOWN` into `LICIT`; exclude `y == -1` from supervised loss/evaluation while retaining unknown nodes in graph topology.
2. **Chronological Temporal Split (`preprocessing.py`, `gnn_train.py`):** Train `1–34`, Val `35–39`, Test `40–49`. Never randomize across timesteps.
3. **Feature Layout (`165`):** `0..92` local features, `93..164` 1-hop aggregates. Reject `NaN`/`Inf` in `/api/ml/predict` and enforce strict RFC-8259 JSON (`allow_nan=False`).
4. **Canonical Risk & Importances:** Compute DB/breakdown `0–100` risk scores via `calculate_risk_score()` (`risk/engine.py`) and preserve `permutation_importance` for `HistGradientBoostingClassifier` (`train.py`).
5. **GNN & Inference Fidelity:** Align `BitcoinGraphSAGE` inference (`gnn_predict.py`) with bounded 2-hop subgraphs (`graph_subgraph_2hop`), `center_idx` placement, and deduplicated `to_undirected` edges; fail closed (`503`/`400`) via `normalize_model_name()`.

## Hackathon MVP & Cybersecurity Guardrails

- **Access Control:** Keep read views, `/api/cases*`, and empty-DB JSON fallbacks (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) accessible without blocking auth screens; keep optional `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` tracks post-hackathon JWT/RBAC and Supabase RLS).
- **Model Deserialization:** Preserve `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted artifacts via `weights_only=False`/`pickle`.
- **CORS, Path & Error Safety:** Keep `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False`, traceback masking, and `dataset_directory_name` redaction.
- **SQL, Dossiers, Frontend & Git Hygiene:** Use `.cast(String)`, preserve SQLite `UNIQUE` constraints + lazy `supabase`, deterministic `traversal.py` ordering, `integrity_sha256` on reports, dynamic synced UI components (`Overview.tsx`, `RiskAlerts.tsx`, `ModelPerformance.tsx`), keep secrets out of `frontend/`, and avoid committing `.env` or `tracex_dev.db*` (`-shm`/`-wal`).
