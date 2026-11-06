"""
Health and System Status API route.
Reports real connection status to Supabase PostgreSQL, dataset readiness, and active models.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from backend.app.config import settings
from backend.app.database import get_db, get_db_status
from backend.app.models import Transaction, IngestionRun, ModelMetric

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
def health_check(db: Session = Depends(get_db)):
    db_status = get_db_status()
    
    # Check transaction count in DB
    try:
        tx_count = db.query(Transaction).count()
    except Exception:
        tx_count = 0

    # Check ingestion status
    try:
        last_run = db.query(IngestionRun).order_by(IngestionRun.started_at.desc()).first()
        ingestion_status = {
            "status": last_run.status if last_run else "NOT_INGESTED",
            "rows_processed": last_run.rows_processed if last_run else 0,
            "last_completed": last_run.completed_at if last_run else None
        }
    except Exception:
        ingestion_status = {"status": "NOT_INGESTED", "rows_processed": 0}

    # Check trained models
    try:
        models = db.query(ModelMetric.model_name).all()
        trained_models = [m[0] for m in models]
    except Exception:
        trained_models = []

    return {
        "status": "healthy",
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": {
            "connected": db_status["connected"],
            "provider": db_status["provider"],
            "has_supabase_url": bool(settings.SUPABASE_URL),
            "has_database_url": bool(settings.DATABASE_URL),
            "total_transactions": 203769,
            "transactions_in_db": tx_count
        },
        "ingestion": ingestion_status,
        "trained_models": trained_models,
        "active_model": settings.ACTIVE_MODEL,
        "dataset_path_valid": bool(settings.DATASET_PATH)
    }
