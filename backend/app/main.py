"""
TRACE-X Forensic Intelligence Platform - FastAPI Main Entrypoint.
"""

import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from backend.app.config import settings
from backend.app.database import init_db

logger = logging.getLogger("tracex")
from backend.app.api.routes import (
    health,
    dashboard,
    transactions,
    graph,
    risk,
    models,
    analytics,
    cases,
    reports,
    ml,
    dataset
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("=" * 60)
    print("STARTING TRACE-X FORENSIC INTELLIGENCE BACKEND")
    print(f"Environment: {settings.ENVIRONMENT}")
    print(f"Active Model: {settings.ACTIVE_MODEL}")
    print(f"Dataset Path: {settings.DATASET_PATH}")
    print("=" * 60)
    # Initialize database connection and schemas
    init_db()
    try:
        from backend.app.database import get_db
        from backend.app.data_sources.seed_demo import seed_demo_transactions_if_empty
        db = next(get_db())
        seed_demo_transactions_if_empty(db)
    except Exception as e:
        logger.warning("Could not auto-seed demo transactions: %s", e)
    yield
    print("[TRACE-X] Backend shutdown cleanly.")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="End-to-End Crypto & Financial Forensic Analysis Platform",
    lifespan=lifespan
)

# CORS Configuration (avoid pairing wildcard/regex origins with allow_credentials=True)
_configured_origins = settings.cors_origins_list
_wildcard_cors = ("*" in _configured_origins) or (len(_configured_origins) == 0)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _wildcard_cors else _configured_origins,
    allow_credentials=not _wildcard_cors,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Admin-Key"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Mount API Routers under /api
app.include_router(health.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(risk.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(ml.router, prefix="/api")
app.include_router(dataset.router, prefix="/api")

# Serve Frontend static assets if built (Unified Single-Service Deployment on Render)
frontend_dist_path = (Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()
if frontend_dist_path.is_dir():
    assets_dir = frontend_dist_path / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.api_route("/", methods=["GET", "HEAD"])
    async def serve_root():
        index_file = frontend_dist_path / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file))
        return JSONResponse(status_code=404, content={"error": "Frontend index.html not found"})

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            return JSONResponse(status_code=404, content={"error": "Not Found"})
        candidate = (frontend_dist_path / full_path).resolve()
        if candidate.is_relative_to(frontend_dist_path) and candidate.is_file():
            return FileResponse(str(candidate))
        index_file = frontend_dist_path / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file))
        return JSONResponse(status_code=404, content={"error": "Frontend index.html not found"})
else:
    @app.get("/")
    def root():
        return {
            "platform": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "online",
            "docs": "/docs",
            "health": "/api/health"
        }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception at %s %s", request.method, request.url.path, exc_info=exc)
    payload = {"error": "Internal Forensic Server Error"}
    if settings.DEBUG:
        payload["detail"] = str(exc)
    return JSONResponse(
        status_code=500,
        content=payload
    )
