#!/usr/bin/env python3
"""
TRACE-X Forensic Platform
ML Model Training & Evaluation Pipeline.
Trains baseline ML models (Logistic Regression, Random Forest, Gradient Boosting)
using temporal split (timesteps 1-34 train, 35-39 val, 40-49 test), computes real metrics,
and writes results to PostgreSQL model_metrics and model_predictions.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime, timezone

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.config import settings
from backend.app.database import init_db, get_db
from backend.app.models import ModelMetric, Transaction, ModelPrediction
from backend.app.ml.preprocessing import EllipticPreprocessor
from backend.app.ml.train import train_baseline_model
from backend.app.ml.gnn_train import train_gnn_model
from backend.app.risk.engine import calculate_risk_score, determine_risk_level


def run_training(data_dir: str, model_types: list, update_db: bool = True):
    print("=" * 70)
    print("TRACE-X FORENSIC PLATFORM - ML MODEL TRAINING PIPELINE")
    print("=" * 70)

    # Database session
    init_db()
    db = next(get_db())

    normalized_models = [m.lower().strip() for m in model_types]
    gnn_requested = any(m in ("gnn", "graph_neural_network", "graphsage") for m in normalized_models)
    tabular_models = [m for m in normalized_models if m not in ("gnn", "graph_neural_network", "graphsage")]

    # 1. Train GNN if requested
    if gnn_requested:
        print("\n>>> TRAINING MODEL: GRAPH NEURAL NETWORK (GNN / GRAPHSAGE)")
        gnn_model, gnn_metrics = train_gnn_model(
            data_dir=data_dir,
            epochs=50,
            lr=0.005,
            hidden_channels=128,
            patience=12
        )

        if update_db:
            try:
                # Remove existing metric records for GNN
                db.query(ModelMetric).filter(
                    (ModelMetric.model_name == gnn_metrics["model_name"]) |
                    (ModelMetric.model_name.ilike("%gnn%"))
                ).delete()

                db_metric = ModelMetric(
                    model_name=gnn_metrics["model_name"],
                    precision=gnn_metrics["precision"],
                    recall=gnn_metrics["recall"],
                    f1=gnn_metrics["f1"],
                    roc_auc=gnn_metrics["roc_auc"],
                    pr_auc=gnn_metrics["pr_auc"],
                    accuracy=gnn_metrics["accuracy"],
                    evaluation_strategy=gnn_metrics["evaluation_strategy"],
                    details=json.dumps({
                        "training_period": gnn_metrics["training_period"],
                        "validation_period": gnn_metrics["validation_period"],
                        "testing_period": gnn_metrics["testing_period"],
                        "illicit_precision": gnn_metrics["illicit_precision"],
                        "illicit_recall": gnn_metrics["illicit_recall"],
                        "illicit_f1": gnn_metrics["illicit_f1"],
                        "confusion_matrix": gnn_metrics["confusion_matrix"],
                        "roc_curve": gnn_metrics["roc_curve"],
                        "pr_curve": gnn_metrics["pr_curve"],
                        "feature_importances": gnn_metrics.get("feature_importances", []),
                        "training_duration_seconds": gnn_metrics.get("training_duration_seconds", 0),
                        "best_epoch": gnn_metrics.get("best_epoch", 0),
                        "architecture": gnn_metrics.get("architecture", "2-Layer GraphSAGE")
                    }),
                    created_at=datetime.now(timezone.utc)
                )
                db.add(db_metric)
                db.commit()
                print(f"[Database] Saved real evaluation metrics for {gnn_metrics['model_name']}.")
            except Exception as e:
                db.rollback()
                print(f"[Database] Notice: GNN metric save failed: {e}")

    # 2. Train Tabular Baseline Models if requested
    if tabular_models:
        features_path = os.path.join(data_dir, "elliptic_txs_features.csv")
        classes_path = os.path.join(data_dir, "elliptic_txs_classes.csv")

        preprocessor = EllipticPreprocessor(
            train_timesteps=(1, 34),
            val_timesteps=(35, 39),
            test_timesteps=(40, 49)
        )
        data = preprocessor.prepare_data(features_path, classes_path)

        for m_type in tabular_models:
            print(f"\n>>> TRAINING MODEL: {m_type.upper()}")
            model, metrics = train_baseline_model(
                model_type=m_type,
                X_train=data["X_train"],
                y_train=data["y_train"],
                X_test=data["X_test"],
                y_test=data["y_test"],
                feature_cols=data["feature_cols"]
            )

            # Save to model_metrics table
            if update_db:
                try:
                    db.query(ModelMetric).filter(ModelMetric.model_name == metrics["model_name"]).delete()

                    db_metric = ModelMetric(
                        model_name=metrics["model_name"],
                        precision=metrics["precision"],
                        recall=metrics["recall"],
                        f1=metrics["f1"],
                        roc_auc=metrics["roc_auc"],
                        pr_auc=metrics["pr_auc"],
                        accuracy=metrics["accuracy"],
                        evaluation_strategy=metrics["evaluation_strategy"],
                        details=json.dumps({
                            "training_period": metrics["training_period"],
                            "validation_period": metrics["validation_period"],
                            "testing_period": metrics["testing_period"],
                            "illicit_precision": metrics["illicit_precision"],
                            "illicit_recall": metrics["illicit_recall"],
                            "illicit_f1": metrics["illicit_f1"],
                            "confusion_matrix": metrics["confusion_matrix"],
                            "roc_curve": metrics["roc_curve"],
                            "pr_curve": metrics["pr_curve"],
                            "feature_importances": metrics.get("feature_importances", [])
                        }),
                        created_at=datetime.now(timezone.utc)
                    )
                    db.add(db_metric)
                    db.commit()
                    print(f"[Database] Saved real evaluation metrics for {metrics['model_name']}.")
                except Exception as e:
                    db.rollback()
                    print(f"[Database] Notice: metric save failed: {e}")

        # 3. Update active model predictions in transactions table
        if update_db and tabular_models:
            print("\n>>> INFERRING AND UPDATING ACTIVE PREDICTIONS IN DATABASE...")
            try:
                active_m_name = "Random Forest" if "random_forest" in tabular_models else tabular_models[0]
                test_probs = model.predict_proba(data["X_test"])[:, 1]
                test_preds = (test_probs >= 0.5).astype(int)

                updates = []
                for i, tx_id in enumerate(data["test_txs"]):
                    prob = float(test_probs[i])
                    pred_label = "ILLICIT" if test_preds[i] == 1 else "LICIT"
                    risk_score = int(min(100, max(0, round(prob * 75 + (20 if pred_label == "ILLICIT" else 0)))))
                    risk_level = determine_risk_level(risk_score).value

                    updates.append({
                        "transaction_id": int(tx_id),
                        "prediction": pred_label,
                        "prediction_probability": prob,
                        "risk_score": risk_score,
                        "risk_level": risk_level
                    })

                for chunk in [updates[i:i + 5000] for i in range(0, len(updates), 5000)]:
                    for item in chunk:
                        db.query(Transaction).filter(Transaction.transaction_id == item["transaction_id"]).update({
                            "prediction": item["prediction"],
                            "prediction_probability": item["prediction_probability"],
                            "risk_score": item["risk_score"],
                            "risk_level": item["risk_level"]
                        })
                    db.commit()

                print(f"[Database] Updated active predictions for {len(updates):,} transactions.")
            except Exception as e:
                db.rollback()
                print(f"[Database] Transaction prediction update note: {e}")

    db.close()
    print("\n" + "=" * 70)
    print("ML TRAINING PIPELINE COMPLETED")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train baseline ML models for TRACE-X")
    parser.add_argument("--data-dir", default=os.getenv("DATASET_PATH", r"D:\archive (1)\elliptic_bitcoin_dataset"),
                        help="Path to directory containing Elliptic CSV files")
    parser.add_argument("--models", nargs="+", default=["logistic_regression", "random_forest", "gradient_boosting", "gnn"],
                        help="List of models to train (logistic_regression, random_forest, gradient_boosting, gnn)")
    parser.add_argument("--no-db", action="store_true", help="Do not write results to database")
    args = parser.parse_args()

    run_training(
        data_dir=args.data_dir,
        model_types=args.models,
        update_db=not args.no_db
    )
