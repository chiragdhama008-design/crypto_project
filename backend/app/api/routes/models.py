"""
Model Performance and Evaluation API routes.
Returns real calculated metrics, confusion matrix, ROC/PR curves, and feature importance.
Never serves hardcoded or fake metrics.
"""

import os
import json
import math
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.models import ModelMetric
from backend.app.config import settings


def sanitize_floats(obj):
    """Replace inf/nan float values with None to prevent JSON serialization errors."""
    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_floats(item) for item in obj]
    return obj

router = APIRouter(prefix="/models", tags=["Models"])
MODEL_CACHE_DIR = Path("models")


@router.get("")
def list_models(db: Session = Depends(get_db)):
    metrics_records = db.query(ModelMetric).all()
    models_list = []

    for m in metrics_records:
        models_list.append({
            "model_name": m.model_name,
            "accuracy": m.accuracy,
            "precision": m.precision,
            "recall": m.recall,
            "f1": m.f1,
            "roc_auc": m.roc_auc,
            "pr_auc": m.pr_auc,
            "is_active": (m.model_name.lower().replace(" ", "_") == settings.ACTIVE_MODEL.lower().replace(" ", "_"))
        })

    # If DB doesn't have records yet, check disk cache
    if not models_list and MODEL_CACHE_DIR.exists():
        for f in MODEL_CACHE_DIR.glob("*_metrics.json"):
            try:
                with open(f, "r", encoding="utf-8") as jf:
                    data = json.load(jf)
                    models_list.append({
                        "model_name": data["model_name"],
                        "accuracy": data["accuracy"],
                        "precision": data["precision"],
                        "recall": data["recall"],
                        "f1": data["f1"],
                        "roc_auc": data["roc_auc"],
                        "pr_auc": data["pr_auc"],
                        "is_active": True
                    })
            except Exception:
                pass

    return {
        "active_model": settings.ACTIVE_MODEL,
        "supported_architectures": ["Logistic Regression", "Random Forest", "Gradient Boosting", "Graph Neural Network (GNN)"],
        "models": models_list
    }


@router.get("/{model_name}/metrics")
def get_model_metrics(model_name: str, db: Session = Depends(get_db)):
    clean_name = model_name.replace("_", " ").title()
    filter_expr = (
        (ModelMetric.model_name.ilike(f"%{clean_name}%")) | 
        (ModelMetric.model_name.ilike(f"%{model_name}%"))
    )
    if model_name.lower() in ("gnn", "graph_neural_network", "graphsage"):
        filter_expr = filter_expr | (ModelMetric.model_name.ilike("%gnn%")) | (ModelMetric.model_name.ilike("%graph%"))

    record = db.query(ModelMetric).filter(filter_expr).first()

    if record and record.details:
        details = json.loads(record.details)
        result = {
            "model_name": record.model_name,
            "accuracy": record.accuracy,
            "precision": record.precision,
            "recall": record.recall,
            "f1": record.f1,
            "roc_auc": record.roc_auc,
            "pr_auc": record.pr_auc,
            "illicit_precision": details.get("illicit_precision", record.precision),
            "illicit_recall": details.get("illicit_recall", record.recall),
            "illicit_f1": details.get("illicit_f1", record.f1),
            "evaluation_strategy": record.evaluation_strategy,
            "training_period": details.get("training_period", "Timesteps 1 - 34"),
            "validation_period": details.get("validation_period", "Timesteps 35 - 39"),
            "testing_period": details.get("testing_period", "Timesteps 40 - 49"),
            "confusion_matrix": details.get("confusion_matrix", {}),
            "roc_curve": details.get("roc_curve", []),
            "pr_curve": details.get("pr_curve", []),
            "feature_importances": details.get("feature_importances", []),
            "created_at": record.created_at
        }
        return sanitize_floats(result)

    # Fallback to disk cache if DB metrics table not populated yet
    if model_name.lower() in ("gnn", "graph_neural_network", "graphsage"):
        gnn_file = MODEL_CACHE_DIR / "gnn_metrics.json"
        if gnn_file.exists():
            try:
                with open(gnn_file, "r", encoding="utf-8") as jf:
                    return sanitize_floats(json.load(jf))
            except Exception:
                pass

    for f in MODEL_CACHE_DIR.glob("*_metrics.json"):
        try:
            with open(f, "r", encoding="utf-8") as jf:
                data = json.load(jf)
                if model_name.lower() in data["model_name"].lower() or (model_name.lower() == "gnn" and "graph" in data["model_name"].lower()):
                    return sanitize_floats(data)
        except Exception:
            pass

    raise HTTPException(status_code=404, detail=f"No trained metrics found for model '{model_name}'. Please run model training first.")
