"""
TRACE-X Deterministic Risk Scoring Engine.
Calculates transparent, model-derived risk scores (0 to 100) and risk levels.

Scoring Formula:
1. Base Signal (55%): ML illicit probability (prob * 55)
2. Graph Exposure (25%):
   - Direct connection to known illicit node: +20 pts
   - Suspicious / predicted illicit neighbors: +5 pts per neighbor (capped at 15)
   - Neighborhood illicit ratio * 10
   (capped at 25)
3. Structural / Topology Signal (10%):
   - Abnormal degree fan-in/fan-out: up to +10 pts
4. Feature Statistical Anomaly (10%):
   - Extreme z-score deviations in transaction features: up to +10 pts
5. Override:
   - If known_label == 'ILLICIT': Minimum risk score = 90
   - If known_label == 'LICIT' and ml_prob < 0.2 and no illicit neighbors: Max risk score = 25

Risk Levels:
- 0 to 30: LOW
- 31 to 60: MEDIUM
- 61 to 80: HIGH
- 81 to 100: CRITICAL
"""

from typing import Tuple, Dict, Any, List
from backend.app.data_sources.common.schemas import RiskLevelEnum


def determine_risk_level(score: int) -> RiskLevelEnum:
    if score >= 81:
        return RiskLevelEnum.CRITICAL
    elif score >= 61:
        return RiskLevelEnum.HIGH
    elif score >= 31:
        return RiskLevelEnum.MEDIUM
    return RiskLevelEnum.LOW


def calculate_risk_score(
    known_label: str,
    ml_probability: float,
    graph_metrics: Dict[str, Any],
    features: List[float] = None
) -> Tuple[int, RiskLevelEnum, Dict[str, Any]]:
    """
    Computes deterministic forensic risk score (0 - 100).
    """
    reasons = []

    # 1. ML probability contribution (0 to 55)
    ml_contrib = float(ml_probability) * 55.0
    if ml_probability >= 0.75:
        reasons.append(f"High ML illicit confidence ({ml_probability * 100:.1f}%)")
    elif ml_probability >= 0.5:
        reasons.append(f"Moderate ML illicit probability ({ml_probability * 100:.1f}%)")

    # 2. Graph exposure contribution (0 to 25)
    known_illicit_n = graph_metrics.get("known_illicit_neighbors", 0)
    suspicious_n = graph_metrics.get("suspicious_neighbors_count", 0)
    graph_contrib = 0.0

    if known_illicit_n > 0:
        graph_contrib += min(20.0, known_illicit_n * 10.0)
        reasons.append(f"Direct connection to {known_illicit_n} confirmed illicit node(s)")
    if suspicious_n > 0:
        graph_contrib += min(10.0, suspicious_n * 3.0)

    illicit_ratio = graph_metrics.get("illicit_neighborhood_ratio", 0.0)
    graph_contrib += min(5.0, illicit_ratio * 10.0)
    graph_contrib = min(25.0, graph_contrib)

    # 3. Structural topology (0 to 10)
    total_degree = graph_metrics.get("total_neighbors", 0)
    topo_contrib = 0.0
    if total_degree > 20:
        topo_contrib = 10.0
        reasons.append(f"Unusually high transaction connectivity ({total_degree} edges)")
    elif total_degree > 10:
        topo_contrib = 5.0
    elif total_degree > 5:
        topo_contrib = 2.0

    # 4. Feature statistical anomaly (0 to 10)
    feat_contrib = 0.0
    if features:
        import numpy as np
        arr = np.array(features, dtype=float)
        anomalies = np.sum(np.abs(arr) > 3.0)
        if anomalies > 5:
            feat_contrib = 10.0
            reasons.append(f"{anomalies} statistically anomalous transaction features (|z| > 3.0)")
        elif anomalies > 2:
            feat_contrib = 5.0

    raw_score = ml_contrib + graph_contrib + topo_contrib + feat_contrib

    # Deterministic overrides
    if known_label == "ILLICIT":
        raw_score = max(raw_score, 90.0)
        reasons.insert(0, "Ground truth verified illicit transaction")
    elif known_label == "LICIT" and ml_probability < 0.2 and known_illicit_n == 0:
        raw_score = min(raw_score, 25.0)

    final_score = int(round(max(0.0, min(100.0, raw_score))))
    risk_level = determine_risk_level(final_score)

    breakdown = {
        "final_score": final_score,
        "risk_level": risk_level.value,
        "ml_probability": round(ml_probability, 4),
        "ml_points": round(ml_contrib, 1),
        "graph_points": round(graph_contrib, 1),
        "topology_points": round(topo_contrib, 1),
        "feature_points": round(feat_contrib, 1),
        "trigger_reasons": reasons,
        "scoring_standard": "ChainGuard Multi-Signal Composite Engine v1.0",
        "legal_disclaimer": "Model-derived forensic intelligence assessment. Not a definitive accusation of illegal conduct."
    }

    return final_score, risk_level, breakdown
