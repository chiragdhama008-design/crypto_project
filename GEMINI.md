# GEMINI.md — Gemini & Antigravity Agent Instructions

Workspace rules and domain/cybersecurity reference for Gemini CLI and Antigravity agents operating in `crypto_project` (**TRACE-X Forensic Intelligence Platform — Hackathon MVP**).

Consult [`AGENTS.md`](AGENTS.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`SECURITY.md`](SECURITY.md), and [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) for complete details.

---

## Core Context & MVP Posture

- **Domain:** Bitcoin UTXO transaction forensics & AML risk scoring using the **Elliptic Dataset** (`203,769` nodes, `234,355` directed edges, `165` standardized features across `49` timesteps).
- **Backend:** FastAPI + SQLAlchemy (`backend/app/`) with Supabase PostgreSQL (`sql/schema.sql`) and SQLite dev fallback (`tracex_dev.db`).
- **ML & GNN:** Optional PyTorch Geometric 2-layer `BitcoinGraphSAGE` + `scikit-learn` (`HistGradientBoostingClassifier`, `RandomForestClassifier`, `LogisticRegression`) stored in `models/`.
- **Frontend:** React 19 + TypeScript + Vite 8 + TailwindCSS + Cytoscape.js + Recharts (`frontend/`).
- **Hackathon MVP UX:** Keep read endpoints, `/api/cases*`, and empty-DB JSON summary fixtures (`elliptic_dataset_summary.json`, `unseen_20_transactions.json`) accessible without blocking auth screens; admin compute/ingest gates remain opt-in via `ADMIN_API_KEY`.

---

## Critical Security & Forensic Guardrails

1. **Defensive Security Only:** Perform static/architectural auditing, defensive hardening, and validation only. Never craft exploit scripts or weaponized payloads.
2. **Never Fabricate Forensic Intelligence:**
   - Maintain strict label separation (`1 -> ILLICIT`, `2 -> LICIT`, `unknown/3 -> UNKNOWN`).
   - Maintain strict temporal train/val/test split (`1–34` / `35–39` / `40–49`).
   - Never re-introduce silent heuristic fallback probabilities or mismatched model substitutions in `ml/predict.py` or `ml/gnn_predict.py` (keep HTTP `503` fail-closed + `normalize_model_name()`).
   - Keep `calculate_risk_score()` (`backend/app/risk/engine.py`) as the single risk engine (`0–100`), permutation feature importances in `ml/train.py`, and valid RFC-8259 JSON (`evaluate.py`).
3. **Hardening & Contract Invariants Already Enforced (Do Not Regress):**
   - **Optional Admin Gate:** `verify_admin_key` (`security.py`) protects `POST /api/ml/train` and `POST /api/dataset/ingest` when `ADMIN_API_KEY` is set.
   - **Safe Weights & 2-Hop GNN:** `gnn_predict.py` enforces `torch.load(..., weights_only=True)`, `center_idx` placement, `to_undirected`, and bounded 2-hop DB subgraphs (`graph_subgraph_2hop`).
   - **CORS, Paths & Errors:** `main.py` disables `allow_credentials` on wildcard CORS, enforces `Path.resolve().is_relative_to(...)` in `serve_spa()`, adds security headers, hides raw `str(exc)` unless `DEBUG=True`, and `dataset.py` omits full host `DATASET_PATH`.
   - **API / UI / DB Contracts:** `transactions.py` uses `.cast(String)` + prefix search; `risk.py` / `RiskAlerts.tsx` align on `prediction_probability`, `probability`, and `total_degree`; `Overview.tsx` binds dynamically to `api.listModels()`; `ReportGenerator` emits `integrity_sha256`.
   - **Post-Hackathon Prod Gaps (Tracked in `SECURITY_AUDIT.md`):** Mandatory JWT/RBAC on `/api/cases*` & reads, Supabase `RLS` in `sql/schema.sql`, `skops`/SHA-256 manifests for `.joblib`, rate limiting, and `numpy<2` + PyG runtime alignment.

---

## Verification & Hygiene Commands

```powershell
# Backend test suite (PowerShell; runs isolated temp SQLite, skips 8 PyG tests if absent)
python -m unittest discover -s backend/tests -v

# Frontend lint & build (when frontend/node_modules is installed)
npm --prefix frontend run lint
npm --prefix frontend run build
```

- Note on Windows PowerShell: Avoid `&&` or `||` command chaining in older PowerShell (`5.1`); use `;` or separate statements, and invoke `.cmd` wrappers if `.ps1` execution policies block `npx`.
- Never commit `.env`, API credentials, `tracex_dev.db*` (`-shm`/`-wal`), or hardcoded local developer paths (`D:\archive (1)...`).
