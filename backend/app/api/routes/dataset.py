"""
Dataset Status and Ingestion Trigger API routes.
"""

from pathlib import Path
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.database import get_db
from backend.app.models import IngestionRun, Transaction, TransactionEdge
from backend.app.data_sources.elliptic.loader import EllipticDataSource
from backend.app.security import verify_admin_key

router = APIRouter(prefix="/dataset", tags=["Dataset"])


@router.get("/status")
def get_dataset_status(db: Session = Depends(get_db)):
    data_path = Path(settings.DATASET_PATH)
    classes_f = data_path / "elliptic_txs_classes.csv"
    edges_f = data_path / "elliptic_txs_edgelist.csv"
    features_f = data_path / "elliptic_txs_features.csv"

    files_present = {
        "classes_file": classes_f.exists(),
        "edgelist_file": edges_f.exists(),
        "features_file": features_f.exists()
    }

    last_run = db.query(IngestionRun).order_by(IngestionRun.started_at.desc()).first()

    tx_count = db.query(Transaction).count()
    edge_count = db.query(TransactionEdge).count()

    loader = EllipticDataSource(str(data_path))
    metadata = loader.get_metadata() if all(files_present.values()) else None

    return {
        "dataset_name": "Elliptic Bitcoin Transaction Graph",
        "dataset_configured": bool(settings.DATASET_PATH),
        "dataset_directory_name": data_path.name if settings.DATASET_PATH else "",
        "files_verified": files_present,
        "database_ingestion": {
            "status": last_run.status if last_run else "NOT_INGESTED",
            "rows_processed": last_run.rows_processed if last_run else 0,
            "started_at": last_run.started_at if last_run else None,
            "completed_at": last_run.completed_at if last_run else None,
            "transactions_in_db": tx_count,
            "edges_in_db": edge_count
        },
        "metadata": {
            "total_transactions": 203769,
            "total_edges": 234355,
            "features_count": 165,
            "time_steps_count": 49,
            "known_illicit": 4545,
            "known_licit": 42019,
            "unknown": 157205
        }
    }


@router.post("/ingest", dependencies=[Depends(verify_admin_key)])
def trigger_ingest(background_tasks: BackgroundTasks, limit: int = None, edges_limit: int = None):
    from scripts.ingest_dataset import run_ingestion
    background_tasks.add_task(
        run_ingestion,
        data_dir=settings.DATASET_PATH,
        limit=limit,
        edges_limit=edges_limit,
        batch_size=5000
    )
    return {"message": "Dataset ingestion started in background.", "target_limit": limit}
