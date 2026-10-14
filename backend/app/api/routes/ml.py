"""
ML Training and Inference API routes.
"""

from typing import List, Optional, Any
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.config import settings
from backend.app.ml.predict import predict_transaction

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


class PredictRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    features: List[float]
    model_name: Optional[str] = "gradient_boosting"
    transaction_id: Optional[int] = None


class TrainRequest(BaseModel):
    models: Optional[List[str]] = ["logistic_regression", "random_forest", "gradient_boosting", "gnn"]


@router.post("/predict")
def predict_endpoint(req: PredictRequest, db: Session = Depends(get_db)):
    if len(req.features) != 165:
        raise HTTPException(
            status_code=400,
            detail=f"Expected 165 normalized feature values, received {len(req.features)}."
        )

    model_name = req.model_name or "gradient_boosting"
    pred, prob = predict_transaction(
        features=req.features,
        model_name=model_name,
        transaction_id=req.transaction_id,
        db_session=db
    )
    licit_prob = round(1.0 - prob, 4)
    illicit_prob = round(prob, 4)

    return {
        "model_name": model_name,
        "selected_model": model_name,
        "prediction": pred,
        "illicit_probability": illicit_prob,
        "licit_probability": licit_prob,
        "confidence_score": round(max(prob, 1.0 - prob), 4),
        "transaction_id": req.transaction_id
    }


@router.post("/train")
def train_endpoint(req: TrainRequest, background_tasks: BackgroundTasks):
    from scripts.train_model import run_training
    models_to_train = req.models or ["logistic_regression", "random_forest", "gradient_boosting", "gnn"]
    background_tasks.add_task(
        run_training,
        data_dir=settings.DATASET_PATH,
        model_types=models_to_train,
        update_db=True
    )
    return {
        "message": "Model training initiated in background.",
        "models": models_to_train,
        "strategy": "Temporal Chronological Split (Train: 1-34, Val: 35-39, Test: 40-49)"
    }
