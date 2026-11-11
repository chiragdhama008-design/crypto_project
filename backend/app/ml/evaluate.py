"""
Model evaluation module focusing on class imbalance and illicit activity detection.
Tracks Illicit Precision, Illicit Recall, Illicit F1, PR-AUC, and ROC-AUC.
"""

from typing import Dict, Any, List, Optional
import math
import numpy as np


def _clean_float(val: float, digits: int = 4) -> Optional[float]:
    f = float(val)
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, digits)
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
    accuracy_score,
    confusion_matrix,
    roc_curve,
    precision_recall_curve
)


def evaluate_model_performance(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob: np.ndarray,
    model_name: str,
    evaluation_strategy: str,
    training_period: str = "Timesteps 1 - 34",
    validation_period: str = "Timesteps 35 - 39",
    testing_period: str = "Timesteps 40 - 49"
) -> Dict[str, Any]:
    """
    Computes rigorous evaluation metrics with a spotlight on the minority illicit class.
    """
    acc = float(accuracy_score(y_true, y_pred))
    prec_macro = float(precision_score(y_true, y_pred, average="macro", zero_division=0))
    rec_macro = float(recall_score(y_true, y_pred, average="macro", zero_division=0))
    f1_macro = float(f1_score(y_true, y_pred, average="macro", zero_division=0))

    # Minority Illicit Class (Class 1) specific metrics
    illicit_prec = float(precision_score(y_true, y_pred, pos_label=1, zero_division=0))
    illicit_rec = float(recall_score(y_true, y_pred, pos_label=1, zero_division=0))
    illicit_f1 = float(f1_score(y_true, y_pred, pos_label=1, zero_division=0))

    try:
        roc_auc = float(roc_auc_score(y_true, y_prob))
    except Exception:
        roc_auc = 0.5

    try:
        pr_auc = float(average_precision_score(y_true, y_prob))
    except Exception:
        pr_auc = float(np.mean(y_true == 1))

    # Confusion Matrix
    cm = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = int(cm[0, 0]), int(cm[0, 1]), int(cm[1, 0]), int(cm[1, 1])

    # Downsample ROC and PR curves to ~40 points for crisp, RFC-8259-compliant JSON payloads
    fpr, tpr, roc_thresh = roc_curve(y_true, y_prob)
    step_roc = max(1, len(fpr) // 40)
    roc_points = [
        {"fpr": _clean_float(fpr[i]), "tpr": _clean_float(tpr[i]), "threshold": _clean_float(roc_thresh[i])}
        for i in range(0, len(fpr), step_roc)
    ]

    p_curve, r_curve, pr_thresh = precision_recall_curve(y_true, y_prob)
    step_pr = max(1, len(p_curve) // 40)
    pr_points = [
        {"precision": _clean_float(p_curve[i]), "recall": _clean_float(r_curve[i]), "threshold": _clean_float(pr_thresh[min(i, len(pr_thresh)-1)])}
        for i in range(0, len(p_curve), step_pr)
    ]

    return {
        "model_name": model_name,
        "accuracy": round(acc, 4),
        "precision": round(prec_macro, 4),
        "recall": round(rec_macro, 4),
        "f1": round(f1_macro, 4),
        "roc_auc": round(roc_auc, 4),
        "pr_auc": round(pr_auc, 4),
        "illicit_precision": round(illicit_prec, 4),
        "illicit_recall": round(illicit_rec, 4),
        "illicit_f1": round(illicit_f1, 4),
        "evaluation_strategy": evaluation_strategy,
        "training_period": training_period,
        "validation_period": validation_period,
        "testing_period": testing_period,
        "confusion_matrix": {
            "true_negative": tn,
            "false_positive": fp,
            "false_negative": fn,
            "true_positive": tp
        },
        "roc_curve": roc_points,
        "pr_curve": pr_points
    }
