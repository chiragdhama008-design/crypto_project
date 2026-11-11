---
applyTo: "frontend/**"
---

# Frontend React & TypeScript Rules (TRACE-X)

Follow [`ARCHITECTURE.md`](../../ARCHITECTURE.md) and [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md) for all frontend changes:

1. **API & Schema Alignment:**
   - Keep `frontend/src/types/api.ts` (`HighRiskQueueResponse`, `TransactionSummary`, etc.) strictly synchronized with FastAPI JSON responses (`backend/app/api/routes/*.py` & `backend/app/schemas/*.py`).
   - Route all API calls through `frontend/src/services/api.ts` using `import.meta.env.VITE_API_URL` (or `/api` dev proxy).
   - Keep `RiskAlerts.tsx` reading `prediction_probability ?? probability` and `total_degree ?? (in + out)`, keep `Dataset.tsx` using `dataset_directory_name`, and surface `integrity_sha256` in `CaseDetail.tsx` and `Reports.tsx`.

2. **Data Fidelity & Security:**
   - Never store or read `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ADMIN_API_KEY`, or backend secrets in `frontend/` or `VITE_*` env vars.
   - Never render raw HTML (`dangerouslySetInnerHTML`, `innerHTML`) from transaction notes, case names, or API errors.
   - Do **not** hardcode static model accuracy, F1 scores, or model names in JSX (`Overview.tsx` fetches `api.listModels()`, `ModelPerformance.tsx` computes evaluated counts dynamically and labels static 20-tx fixtures honestly as `"Precomputed Benchmark"`).
   - Bound Cytoscape.js graph subgraphs (`max_nodes <= 200`) to prevent browser UI freezes.

3. **Verification:**
   - Validate edits with `npm --prefix frontend run lint` (`oxlint`) and `npm --prefix frontend run build` (`tsc -b && vite build`) when `frontend/node_modules` is installed (explicitly note if skipped when absent).
