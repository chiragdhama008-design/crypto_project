"""
TRACE-X Demo Dataset Seeder.
Populates local development database with benchmark transactions and multi-hop flow edges
when the database is unpopulated. Ensures out-of-the-box demo functionality for
high-risk triage and Cytoscape 1-hop / 2-hop graph exploration.
"""

import json
from pathlib import Path
from sqlalchemy.orm import Session
from backend.app.models import Transaction, TransactionFeature, TransactionEdge, ModelPrediction
from backend.app.risk.engine import calculate_risk_score
from backend.app.data_sources.common.schemas import RiskLevelEnum

BENCHMARK_FILE = Path(__file__).resolve().parent / "unseen_20_transactions.json"

DEMO_EDGES = [
    # Group 1: Darknet & Ransomware Flow
    (86403626, 159041022),   # Exchange Hot Wallet -> Darknet Market Flow
    (96580998, 159041022),   # Custody Rebalance -> Darknet Market Flow
    (159041022, 97804696),   # Darknet Market Flow -> Ransomware Laundering
    (159041022, 96957328),   # Darknet Market Flow -> Darknet Sub-Flow
    (97804696, 159043651),   # Ransomware Laundering -> Ransomware Stage 2
    (97804696, 73154970),    # Ransomware Laundering -> Asset Dispersal
    (159043651, 12710328),   # Ransomware Stage 2 -> Regulated Custody Exit
    (96957328, 73306046),    # Darknet Sub-Flow -> Merchant Settlement Exit

    # Group 2: Mixing Service & CoinJoin Aggregation
    (156112934, 12778423),   # Mining Pool Payout -> Mixing Service
    (70836619, 12778423),    # Merchant Settlement -> Mixing Service
    (12778423, 71989346),    # Mixing Service -> CoinJoin Aggregation
    (12778423, 12778573),    # Mixing Service -> Darknet Marketplace Flow
    (71989346, 97702228),    # CoinJoin Aggregation -> CoinJoin Hop 2
    (71989346, 261625437),   # CoinJoin Aggregation -> P2P Transfer Exit
    (12778573, 94130506),    # Darknet Marketplace Flow -> Merchant Settlement Exit
    (97702228, 195441980),   # CoinJoin Hop 2 -> Exchange Hot Wallet Exit
    (96954603, 71989346),    # P2P Transfer In -> CoinJoin Aggregation

    # Group 3: Stolen Asset Dispersal
    (86403626, 11568841),    # Exchange Hot Wallet -> Stolen Asset Dispersal
    (11568841, 73154970),    # Stolen Asset Dispersal -> Dispersal Stage 2
    (11568841, 12778423),    # Stolen Asset Dispersal -> Mixing Service
    (73154970, 97702228),    # Dispersal Stage 2 -> CoinJoin Hop 2
    (73154970, 94130506),    # Dispersal Stage 2 -> Merchant Settlement Exit
    (159043651, 195441980),  # Ransomware Stage 2 -> Exchange Hot Wallet Exit
]


def seed_demo_transactions_if_empty(db: Session) -> int:
    """
    Seeds the database with benchmark transactions and graph edges if the transaction table is empty.
    Returns the count of seeded transactions.
    """
    current_count = db.query(Transaction).count()
    if current_count > 0:
        return 0

    if not BENCHMARK_FILE.exists():
        return 0

    with open(BENCHMARK_FILE, "r", encoding="utf-8") as f:
        records = json.load(f)

    # Compute in/out degrees from DEMO_EDGES
    in_degrees = {}
    out_degrees = {}
    for src, dst in DEMO_EDGES:
        out_degrees[src] = out_degrees.get(src, 0) + 1
        in_degrees[dst] = in_degrees.get(dst, 0) + 1

    illicit_tx_ids = {r["transaction_id"] for r in records if r.get("ground_truth") == "ILLICIT"}

    # Count illicit neighbors
    illicit_neighbors = {}
    for src, dst in DEMO_EDGES:
        if dst in illicit_tx_ids:
            illicit_neighbors[src] = illicit_neighbors.get(src, 0) + 1
        if src in illicit_tx_ids:
            illicit_neighbors[dst] = illicit_neighbors.get(dst, 0) + 1

    seeded = 0
    for r in records:
        tid = r["transaction_id"]
        tstep = r.get("time_step", 42)
        gt = r.get("ground_truth", "UNKNOWN")
        feats = r.get("features", [])

        # Predictions
        preds = r.get("predictions", {})
        gb_pred = preds.get("gradient_boosting", {})
        prob = float(gb_pred.get("probability", 0.0 if gt == "LICIT" else 0.95))
        pred_label = gb_pred.get("prediction", "LICIT" if prob < 0.5 else "ILLICIT")

        in_d = in_degrees.get(tid, 0)
        out_d = out_degrees.get(tid, 0)
        tot_d = in_d + out_d
        ill_n = illicit_neighbors.get(tid, 0)

        graph_metrics = {
            "known_illicit_neighbors": ill_n,
            "suspicious_neighbors_count": 0,
            "illicit_neighborhood_ratio": ill_n / max(tot_d, 1),
            "total_neighbors": tot_d
        }

        score, risk_lvl, breakdown = calculate_risk_score(
            known_label=gt,
            ml_probability=prob,
            graph_metrics=graph_metrics,
            features=feats
        )

        tx = Transaction(
            transaction_id=tid,
            time_step=tstep,
            known_label=gt,
            prediction=pred_label,
            prediction_probability=round(prob, 4),
            risk_score=score,
            risk_level=risk_lvl.value if hasattr(risk_lvl, "value") else str(risk_lvl),
            in_degree=in_d,
            out_degree=out_d,
            total_degree=tot_d
        )
        db.add(tx)

        # Transaction feature
        tx_feat = TransactionFeature(
            transaction_id=tid,
            features=json.dumps(feats),
            feature_summary=json.dumps({
                "scenario": r.get("scenario", ""),
                "total_features": len(feats),
                "in_degree": in_d,
                "out_degree": out_d
            })
        )
        db.add(tx_feat)

        # Model prediction
        model_pred = ModelPrediction(
            transaction_id=tid,
            model_name="gradient_boosting",
            prediction=pred_label,
            probability=round(prob, 4),
            risk_score=score
        )
        db.add(model_pred)
        seeded += 1

    # Insert edges
    for src, dst in DEMO_EDGES:
        existing_edge = db.query(TransactionEdge).filter(
            TransactionEdge.source_transaction_id == src,
            TransactionEdge.destination_transaction_id == dst
        ).first()
        if not existing_edge:
            db.add(TransactionEdge(
                source_transaction_id=src,
                destination_transaction_id=dst
            ))

    db.commit()
    print(f"[Seed] Successfully seeded {seeded} demo transactions and {len(DEMO_EDGES)} directed edges.")
    return seeded

