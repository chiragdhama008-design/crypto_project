---
name: TRACE-X Domain, ML & Cybersecurity Guardrails
description: Mandatory architecture, Hackathon MVP posture, Elliptic domain invariants, verification commands, and security rules for TRACE-X
alwaysApply: true
---

# TRACE-X Rules (Continue.dev)

Repository instructions for **TRACE-X** (**Hackathon MVP**), a Bitcoin transaction forensics and AML investigation platform built on the **Elliptic Bitcoin Dataset** (`FastAPI`, `SQLAlchemy`, optional `PyTorch Geometric`, `scikit-learn`, `React 19`, `TypeScript`, `Vite 8`).

Reference documents: [`AGENTS.md`](../../AGENTS.md), [`ARCHITECTURE.md`](../../ARCHITECTURE.md), [`SECURITY.md`](../../SECURITY.md), [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md).

## Commands

- **Backend tests:** `python -m unittest discover -s backend/tests -v` *(skips 8 optional PyG tests when `torch_geometric` is absent)*
- **API dev server:** `uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000`
- **Frontend lint & build:** `npm --prefix frontend run lint && npm --prefix frontend run build`

## Mandatory Domain & ML Invariants

1. **Elliptic Label Semantics (`backend/app/data_sources/elliptic/mapper.py`):** `1` -> `ILLICIT` (`1`), `2` -> `LICIT` (`0`), `unknown`/`3`/null -> `UNKNOWN` (`-1`). Never coerce `UNKNOWN` into `LICIT`; mask `y != -1` in loss and evaluation while preserving unknown nodes in graph edges.
2. **Chronological Split (`preprocessing.py`, `gnn_train.py`):** Train `1–34`, Val `35–39`, Test `40–49`. Never shuffle across timesteps or use random k-fold CV.
3. **Feature Indexing (`165`):** `0..92` = local features, `93..164` = 1-hop aggregates. Reject `NaN`/`Inf` on `/api/ml/predict` and enforce strict RFC-8259 JSON (`allow_nan=False`).
4. **Canonical Risk & Importances (`risk/engine.py`, `ml/train.py`):** Compute DB/breakdown `0–100` risk scores via `calculate_risk_score()` and keep `permutation_importance` for `HistGradientBoostingClassifier`.
5. **GNN Parity & Honest Inference:** Keep `BitcoinGraphSAGE` inference (`gnn_predict.py`) aligned via bounded 2-hop subgraphs (`graph_subgraph_2hop`), `center_idx` insertion, and deduplicated `to_undirected` edges; fail closed (`503`/`400`) via `normalize_model_name()`.

## Hackathon MVP & Cybersecurity Guardrails

- **Access Control:** Keep read routes, `/api/cases*`, and empty-DB JSON summary fixtures (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) open for zero-friction hackathon demos; preserve optional `verify_admin_key` (`X-Admin-Key`) on `/api/ml/train` and `/api/dataset/ingest` (`SECURITY_AUDIT.md` tracks post-hackathon JWT/RBAC + Supabase RLS).
- **Model Deserialization:** Keep `torch.load(..., weights_only=True)` in `gnn_predict.py`; never load untrusted checkpoints via `weights_only=False`/`pickle`.
- **CORS, Path, Error & SQL Safety:** Preserve `allow_credentials=not _wildcard_cors`, security response headers, `Path.resolve().is_relative_to(...)` in `serve_spa()`, `DEBUG=False`, traceback/path suppression, `.cast(String)` + prefix matching, SQLite `UNIQUE` constraints + lazy `supabase`, deterministic `traversal.py` ordering, and `integrity_sha256` on case dossiers.
- **Frontend Contracts & Hygiene:** Keep `frontend/src/types/api.ts` synced (`RiskAlerts.tsx`, `Overview.tsx` dynamic models, `ModelPerformance.tsx` `Precomputed Benchmark`), keep secrets out of `frontend/`, and never commit `.env` or `tracex_dev.db*` (`-shm`/`-wal`).
