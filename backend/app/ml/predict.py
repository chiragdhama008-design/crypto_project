"""
Inference engine for TRACE-X.
Generates real ML predictions and probabilities from trained models.
"""

from pathlib import Path
from threading import Lock
from typing import Optional, Tuple, Dict, Any, List
import joblib
import numpy as np

MODEL_CACHE_DIR = Path("models")
_loaded_models: Dict[str, Any] = {}
_compat_load_lock = Lock()

GNN_ALIASES = {"gnn", "graph_neural_network", "graph_neural_network_(gnn)", "graphsage"}
TABULAR_ALIASES = {
    "gradient_boosting": "gradient_boosting",
    "gb": "gradient_boosting",
    "hist_gradient_boosting": "gradient_boosting",
    "random_forest": "random_forest",
    "rf": "random_forest",
    "logistic_regression": "logistic_regression",
    "logreg": "logistic_regression",
}
SUPPORTED_TABULAR_MODELS = set(TABULAR_ALIASES.values())


def normalize_model_name(model_name: Optional[str]) -> str:
    raw = (model_name or "gradient_boosting").lower().strip().replace(" ", "_")
    if raw in GNN_ALIASES:
        return "gnn"
    return TABULAR_ALIASES.get(raw, raw)


def _load_joblib_artifact(model_path: Path):
    """
    Loads a scikit-learn joblib checkpoint, handling cross-version NumPy BitGenerator
    pickle differences when artifacts saved on NumPy 2.x are loaded under NumPy 1.x.
    """
    try:
        return joblib.load(model_path)
    except (ValueError, TypeError) as exc:
        msg = str(exc)
        if "BitGenerator" not in msg and "state must be" not in msg:
            raise

    import numpy.random._pickle as nrp
    from numpy.random.bit_generator import BitGenerator
    from numpy.random._generator import Generator
    from numpy.random.mtrand import RandomState

    compat_classes: Dict[Any, Any] = {}
    for name, base_cls in list(nrp.BitGenerators.items()):
        class _CompatBitGen(base_cls):
            _base_name = name

            def __setstate__(self, state):
                raw = state[0] if (isinstance(state, tuple) and state and isinstance(state[0], dict)) else state
                if isinstance(raw, dict):
                    fixed = dict(raw)
                    fixed["bit_generator"] = type(self).__name__
                    return super().__setstate__(fixed)
                return super().__setstate__(state)

        _CompatBitGen.__name__ = f"{base_cls.__name__}Compat"
        compat_classes[name] = _CompatBitGen
        compat_classes[base_cls] = _CompatBitGen

    with _compat_load_lock:
        orig_bg = nrp.__bit_generator_ctor
        orig_gen = nrp.__generator_ctor
        orig_rs = nrp.__randomstate_ctor

        def _compat_bg_ctor(bit_generator_name="MT19937"):
            if isinstance(bit_generator_name, BitGenerator):
                return bit_generator_name
            cls = compat_classes.get(bit_generator_name)
            if cls is not None:
                return cls()
            return orig_bg(bit_generator_name)

        def _compat_gen_ctor(bit_generator_name="MT19937", bit_generator_ctor=_compat_bg_ctor):
            bg = bit_generator_name if isinstance(bit_generator_name, BitGenerator) else _compat_bg_ctor(bit_generator_name)
            return Generator(bg)

        def _compat_rs_ctor(bit_generator_name="MT19937", bit_generator_ctor=_compat_bg_ctor):
            bg = bit_generator_name if isinstance(bit_generator_name, BitGenerator) else _compat_bg_ctor(bit_generator_name)
            return RandomState(bg)

        try:
            nrp.__bit_generator_ctor = _compat_bg_ctor
            nrp.__generator_ctor = _compat_gen_ctor
            nrp.__randomstate_ctor = _compat_rs_ctor
            return joblib.load(model_path)
        finally:
            nrp.__bit_generator_ctor = orig_bg
            nrp.__generator_ctor = orig_gen
            nrp.__randomstate_ctor = orig_rs


def load_model(model_name: str = "gradient_boosting"):
    """Loads and caches the exact requested trained model artifact."""
    global _loaded_models
    normalized = normalize_model_name(model_name)
    if normalized == "gnn":
        from backend.app.ml.gnn_predict import load_gnn_model
        return load_gnn_model()

    if normalized not in SUPPORTED_TABULAR_MODELS:
        raise ValueError(f"Unsupported tabular model '{model_name}'.")

    if normalized in _loaded_models:
        return _loaded_models[normalized]

    model_path = MODEL_CACHE_DIR / f"{normalized}.joblib"
    if not model_path.exists():
        return None

    try:
        model = _load_joblib_artifact(model_path)
        _loaded_models[normalized] = model
        return model
    except Exception as e:
        raise RuntimeError(f"Failed to load model checkpoint '{normalized}': {e}") from e


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
    normalized = normalize_model_name(model_name)
    if normalized == "gnn":
        from backend.app.ml.gnn_predict import predict_gnn_transaction
        pred, prob, _ = predict_gnn_transaction(
            transaction_id=transaction_id,
            features=features,
            db_session=db_session
        )
        return pred, prob

    model = load_model(normalized)
    if model is None:
        raise FileNotFoundError(
            f"Requested model artifact '{normalized}.joblib' is missing. Run scripts/train_model.py first."
        )

    X = np.array(features, dtype=float).reshape(1, -1)
    prob = float(model.predict_proba(X)[0, 1])
    pred = "ILLICIT" if prob >= 0.5 else "LICIT"
    return pred, prob
