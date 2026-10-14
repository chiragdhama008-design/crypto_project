"""
Inference engine for TRACE-X.
Generates real ML predictions and probabilities from trained models.
"""

from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List
import joblib
import numpy as np

MODEL_CACHE_DIR = Path("models")
_loaded_models: Dict[str, Any] = {}


def load_model(model_name: str = "gradient_boosting"):
    """Loads and caches trained model artifact."""
    global _loaded_models
    normalized = model_name.lower().replace(" ", "_")
    if normalized in ("gnn", "graph_neural_network", "graphsage"):
        from backend.app.ml.gnn_predict import load_gnn_model
        return load_gnn_model()

    if normalized in _loaded_models:
        return _loaded_models[normalized]

    # Check potential model filenames
    possible_names = [f"{normalized}.joblib", "random_forest.joblib", "gradient_boosting.joblib", "logistic_regression.joblib"]
    for fname in possible_names:
        p = MODEL_CACHE_DIR / fname
        if p.exists():
            try:
                model = joblib.load(p)
                _loaded_models[normalized] = model
                return model
            except Exception as e:
                print(f"[ML Predict] Failed to load {p}: {e}")

    return None


def predict_transaction(
    features: List[float],
    model_name: str = "gradient_boosting",
    transaction_id: Optional[int] = None,
    db_session: Any = None
) -> Tuple[str, float]:
    """
    Predicts class and probability for a given 165-feature vector.
    Supports GNN graph-aware inference as well as tabular baseline models.
    Returns ('ILLICIT' | 'LICIT', probability_of_illicit).
    """
    normalized = (model_name or "gradient_boosting").lower().replace(" ", "_")
    if normalized in ("gnn", "graph_neural_network", "graphsage"):
        from backend.app.ml.gnn_predict import predict_gnn_transaction
        pred, prob, _ = predict_gnn_transaction(
            transaction_id=transaction_id,
            features=features,
            db_session=db_session
        )
        return pred, prob

    model = load_model(model_name)
    if model is None:
        # If no model trained yet, return fallback prediction based on standardized anomaly indicators
        feat_arr = np.array(features, dtype=float)
        # Approximate baseline score from extreme deviations in features
        extreme_signal = np.mean(np.abs(feat_arr) > 2.5)
        prob = float(np.clip(0.05 + extreme_signal * 0.7, 0.01, 0.95))
        pred = "ILLICIT" if prob >= 0.5 else "LICIT"
        return pred, prob

    X = np.array(features, dtype=float).reshape(1, -1)
    try:
        prob = float(model.predict_proba(X)[0, 1])
        pred = "ILLICIT" if prob >= 0.5 else "LICIT"
        return pred, prob
    except Exception as e:
        print(f"[ML Predict] Inference error: {e}")
        return "UNKNOWN", 0.0
