"""
Model training engine for TRACE-X.
Trains baseline ML models (Logistic Regression, Random Forest, Gradient Boosting)
using chronological splits, balanced class weights, and saves real evaluation metrics.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, Tuple
import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from backend.app.ml.evaluate import evaluate_model_performance


MODEL_CACHE_DIR = Path("models")
MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def train_baseline_model(
    model_type: str,
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    feature_cols: list
) -> Tuple[Any, Dict[str, Any]]:
    """
    Trains the requested model on temporal training data and evaluates on future unseen test data.
    """
    model_type = model_type.lower().strip()
    print(f"[ML Train] Starting training for '{model_type}' on {len(X_train):,} samples...")

    if model_type in ("logreg", "logistic_regression"):
        canonical_name = "logistic_regression"
        display_name = "Logistic Regression"
        model = LogisticRegression(
            class_weight="balanced",
            max_iter=500,
            solver="lbfgs",
            random_state=42
        )
        model.fit(X_train, y_train)
        y_prob = model.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)

        # Feature importance from normalized linear coefficients
        importances = np.abs(model.coef_[0])
        imp_sum = float(np.sum(importances))
        importances = importances / imp_sum if imp_sum > 0 else np.zeros(X_train.shape[1])

    elif model_type in ("rf", "random_forest"):
        canonical_name = "random_forest"
        display_name = "Random Forest"
        model = RandomForestClassifier(
            n_estimators=100,
            max_depth=14,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        )
        model.fit(X_train, y_train)
        y_prob = model.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)
        importances = model.feature_importances_

    elif model_type in ("gb", "gradient_boosting", "hist_gradient_boosting"):
        canonical_name = "gradient_boosting"
        display_name = "Gradient Boosting"
        model = HistGradientBoostingClassifier(
            class_weight="balanced",
            max_iter=100,
            max_depth=8,
            random_state=42
        )
        model.fit(X_train, y_train)
        y_prob = model.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)

        # Compute real bounded permutation importance on held-out test slice
        sample_n = min(len(X_test), 2500)
        if sample_n > 0:
            perm = permutation_importance(
                model,
                X_test[:sample_n],
                y_test[:sample_n],
                n_repeats=3,
                random_state=42,
                scoring="average_precision",
                n_jobs=-1,
            )
            raw_imp = np.clip(perm.importances_mean, 0.0, None)
            imp_sum = float(np.sum(raw_imp))
            importances = raw_imp / imp_sum if imp_sum > 0 else np.zeros(X_train.shape[1])
        else:
            importances = np.zeros(X_train.shape[1])
    else:
        raise ValueError(f"Unsupported model type: {model_type}")

    print(f"[ML Train] Evaluating {display_name} on {len(X_test):,} testing transactions...")
    metrics = evaluate_model_performance(
        y_true=y_test,
        y_pred=y_pred,
        y_prob=y_prob,
        model_name=display_name,
        evaluation_strategy="Temporal Chronological Split (Train: Steps 1-34, Test: Steps 40-49)"
    )

    # Top feature importances
    top_indices = np.argsort(importances)[::-1][:20]
    top_features = []
    for idx in top_indices:
        cat = "Local Transaction Features" if idx < 93 else "Neighborhood Aggregate Features"
        top_features.append({
            "feature_index": int(idx),
            "feature_name": f"Feature {idx + 1}",
            "importance": round(float(importances[idx]), 5),
            "category": cat
        })
    metrics["feature_importances"] = top_features

    # Save model and metrics to disk using canonical filename
    model_filename = f"{canonical_name}.joblib"
    metrics_filename = f"{canonical_name}_metrics.json"
    joblib.dump(model, MODEL_CACHE_DIR / model_filename)
    with open(MODEL_CACHE_DIR / metrics_filename, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"[ML Train] {display_name} successfully trained & saved.")
    print(f"  * Illicit Precision: {metrics['illicit_precision'] * 100:.2f}%")
    print(f"  * Illicit Recall:    {metrics['illicit_recall'] * 100:.2f}%")
    print(f"  * Illicit F1:        {metrics['illicit_f1'] * 100:.2f}%")
    print(f"  * PR-AUC:            {metrics['pr_auc']:.4f}")
    print(f"  * ROC-AUC:           {metrics['roc_auc']:.4f}")

    return model, metrics
