# Security Policy & Hardening Baseline — TRACE-X

## Supported Deployment Model

TRACE-X is a **Hackathon MVP & research crypto-forensics platform** analyzing transaction graphs (the **Elliptic Bitcoin Dataset**). It is **NOT** a custodian, wallet, or signing service and **MUST NOT** store private keys, seed phrases, mnemonic material, exchange API secrets with withdrawal privileges, or raw PII.

> **MVP vs. Production Posture:** Core defensive guardrails (CORS credential separation, `torch.load(..., weights_only=True)`, SPA path containment, host-path & exception masking, `NaN`/`Inf` rejection, security headers, fail-closed HTTP `503` ML loading, deterministic dossier digests, and opt-in `ADMIN_API_KEY`) are **implemented**. However, zero-auth UI/case demo workflows remain enabled for hackathon usability; see [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) for the complete **Post-Hackathon / Pre-Production Hardening** checklist before exposing this service to untrusted internet traffic or compliance workloads.

---

## Trust Boundaries & Current Controls

1. **Untrusted Network / Browser Boundary (`/api/*`, SPA static serving)**
   - Treat all query parameters, path segments, JSON payloads, and `Origin` headers as untrusted.
   - `POST /api/ml/train` and `POST /api/dataset/ingest` enforce `verify_admin_key` (`X-Admin-Key` header via constant-time `hmac.compare_digest`) whenever `ADMIN_API_KEY` is configured (no-op when empty in local dev). Never deploy `/api/ml/train` or `/api/dataset/ingest` publicly without setting `ADMIN_API_KEY`.
   - `CORSMiddleware` disables `allow_credentials` automatically when `CORS_ORIGINS` is wildcard (`*`) and supports explicit allowlisted origins.
   - `serve_spa()` validates static file requests via canonical `Path.resolve().is_relative_to(...)`.
   - Middleware attaches `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.
2. **Database & Supabase Boundary (`sql/schema.sql`, `backend/app/database.py`)**
   - `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` credentials must **never** appear in frontend code, `VITE_*` variables, logs, HTTP error responses, or Git history.
   - `database.py` lazy-imports `supabase.create_client` only inside `get_supabase_client()`.
   - **Pre-Production Requirement:** Enable Supabase Row-Level Security (`RLS`) on every `public` schema table in `sql/schema.sql` before enabling PostgREST exposure.
3. **ML Model Artifact Boundary (`models/*.pt`, `models/*.joblib`)**
   - `gnn_predict.py` uses `torch.load(..., weights_only=True)` for PyTorch checkpoints.
   - Do **not** load untrusted third-party `.joblib` / `.pt` files; treat `models/` as a trusted artifact directory.
   - **Pre-Production Requirement:** Migrate `*.joblib` artifacts to `skops`/`safetensors` with cryptographic SHA-256 manifest verification.
4. **Forensic Integrity & Chain-of-Custody Boundary**
   - Model outputs are probabilistic triage indicators—not legal proof.
   - Inference fails closed (`HTTP 503` / `400`) when checkpoints are absent or vectors are non-finite (`NaN`/`Inf`) rather than substituting silent heuristics or mismatched model names.
   - `ReportGenerator.generate_case_report()` includes an `integrity_sha256` canonical digest on exported forensic dossiers.

---

## Mandatory Security Rules for Contributors & AI Agents

- **Preserve Hackathon Demo UX:** Do **not** add mandatory login walls blocking read routes (`/api/dashboard`, `/api/transactions*`, `/api/risk*`, `/api/models*`) or interactive demo cases (`/api/cases*`) unless explicitly asked for production auth rollout; keep admin compute/wipe protection optional via `ADMIN_API_KEY`.
- **No Secrets in Code or Frontend:** Never commit `.env`, API keys, DB passwords, or `SUPABASE_SERVICE_ROLE_KEY`. Only `VITE_*` public settings belong in `frontend/`.
- **Parameterized Queries Only:** Use SQLAlchemy ORM/bound parameters (`sqlalchemy.String` in `.cast(String)`, never `.cast(str)`). Never interpolate user input into `text(...)` SQL strings.
- **Input Validation:** Enforce `len == 165` and `math.isfinite()` on `/api/ml/predict`, `Literal["OPEN", "UNDER REVIEW", "CLOSED"]` on `CaseUpdateRequest.status`, string length bounds on case/note schemas, and bounded subgraph limits (`max_nodes <= 200`).
- **Fail Closed Outside Debug:** Keep `DEBUG=False` default, suppress raw `str(exc)` in HTTP `500` responses unless `DEBUG=True`, and never leak raw host `DATASET_PATH` strings in API responses.
- **No Exploit / Offensive Tooling:** Security analysis in this repository is strictly defensive (remediation, validation, hardening, and auditing).

---

## Reporting Vulnerabilities

If you discover a security vulnerability in TRACE-X:
1. **Do not** open a public GitHub issue with exploit payloads or live credentials.
2. Document the affected file(s), reproduction preconditions, impact, and suggested defensive patch privately for the repository maintainers.
3. Rotate any exposed `SUPABASE_*`, `DATABASE_URL`, or `ADMIN_API_KEY` credentials immediately if accidental leakage occurs.
