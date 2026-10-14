"""
Transactions API routes.
Server-side pagination, structured feature categories, multi-signal intelligence, and search.
"""

import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from backend.app.database import get_db
from backend.app.models import Transaction, TransactionFeature
from backend.app.graph.risk import calculate_neighborhood_signals
from backend.app.ml.explain import generate_feature_signals
from backend.app.ml.gnn_predict import predict_gnn_transaction

router = APIRouter(prefix="", tags=["Transactions"])


@router.get("/transactions")
def get_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    label: Optional[str] = None,
    prediction: Optional[str] = None,
    risk_level: Optional[str] = None,
    time_step: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction)

    if label:
        query = query.filter(Transaction.known_label == label.upper())
    if prediction:
        query = query.filter(Transaction.prediction == prediction.upper())
    if risk_level:
        query = query.filter(Transaction.risk_level == risk_level.upper())
    if time_step:
        query = query.filter(Transaction.time_step == time_step)
    if search:
        # Search by exact or partial transaction ID
        try:
            tx_id_num = int(search)
            query = query.filter(Transaction.transaction_id == tx_id_num)
        except ValueError:
            query = query.filter(Transaction.transaction_id.cast(str).contains(search))

    total = query.count()
    offset = (page - 1) * limit
    records = query.order_by(Transaction.risk_score.desc().nullslast(), Transaction.transaction_id.asc()).offset(offset).limit(limit).all()

    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "transactions": [
            {
                "transaction_id": t.transaction_id,
                "time_step": t.time_step,
                "known_label": t.known_label,
                "prediction": t.prediction,
                "prediction_probability": round(t.prediction_probability, 4) if t.prediction_probability is not None else None,
                "risk_score": t.risk_score or 0,
                "risk_level": t.risk_level or "LOW",
                "in_degree": t.in_degree,
                "out_degree": t.out_degree,
                "total_degree": t.total_degree
            }
            for t in records
        ]
    }


@router.get("/search/transactions")
def search_transactions(query: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Fast auto-suggest transaction search."""
    try:
        val = int(query)
        res = db.query(Transaction).filter(Transaction.transaction_id == val).limit(10).all()
    except ValueError:
        res = db.query(Transaction).filter(Transaction.transaction_id.cast(str).contains(query)).limit(10).all()

    return [
        {
            "transaction_id": t.transaction_id,
            "time_step": t.time_step,
            "known_label": t.known_label,
            "prediction": t.prediction,
            "risk_score": t.risk_score,
            "risk_level": t.risk_level
        }
        for t in res
    ]


@router.get("/transactions/{transaction_id}")
def get_transaction_detail(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return {
        "transaction_id": tx.transaction_id,
        "time_step": tx.time_step,
        "known_label": tx.known_label,
        "prediction": tx.prediction,
        "prediction_probability": round(tx.prediction_probability, 4) if tx.prediction_probability is not None else None,
        "risk_score": tx.risk_score or 0,
        "risk_level": tx.risk_level or "LOW",
        "in_degree": tx.in_degree,
        "out_degree": tx.out_degree,
        "total_degree": tx.total_degree,
        "created_at": tx.created_at
    }


@router.get("/transactions/{transaction_id}/features")
def get_transaction_features(transaction_id: int, db: Session = Depends(get_db)):
    feat_record = db.query(TransactionFeature).filter(TransactionFeature.transaction_id == transaction_id).first()
    if not feat_record or not feat_record.features:
        raise HTTPException(status_code=404, detail="Features not found for this transaction")

    try:
        feats = json.loads(feat_record.features)
    except Exception:
        feats = []

    local_feats = []
    agg_feats = []

    for idx, val in enumerate(feats):
        item = {
            "index": idx + 1,
            "name": f"Feature {idx + 1}",
            "value": round(float(val), 4)
        }
        if idx < 93:
            item["category"] = "Local Transaction Feature"
            local_feats.append(item)
        else:
            item["category"] = "Neighborhood Aggregate Feature"
            agg_feats.append(item)

    return {
        "transaction_id": transaction_id,
        "total_features": len(feats),
        "local_features": local_feats,
        "aggregate_features": agg_feats
    }


@router.get("/transactions/{transaction_id}/intelligence")
def get_transaction_intelligence(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # 1. Graph neighborhood signals
    graph_info = calculate_neighborhood_signals(db, transaction_id)

    # 2. Feature anomaly signals
    feat_record = db.query(TransactionFeature).filter(TransactionFeature.transaction_id == transaction_id).first()
    feats = []
    if feat_record and feat_record.features:
        try:
            feats = json.loads(feat_record.features)
        except Exception:
            pass
    feature_signals = generate_feature_signals(feats) if feats else []

    # 3. ML signals
    ml_signals = []
    prob = tx.prediction_probability or 0.0
    if prob >= 0.75:
        ml_signals.append({
            "name": "High Illicit Anomaly Score",
            "value": f"{prob * 100:.1f}% confidence",
            "description": "The predictive model evaluated the 165 feature dimensions and identified high congruence with historical illicit transaction patterns.",
            "severity": "critical"
        })
    elif prob >= 0.50:
        ml_signals.append({
            "name": "Elevated Illicit Anomaly Score",
            "value": f"{prob * 100:.1f}% confidence",
            "description": "Model indicators lean towards illicit classification.",
            "severity": "high"
        })
    else:
        ml_signals.append({
            "name": "Licit Baseline Conformity",
            "value": f"{(1 - prob) * 100:.1f}% licit confidence",
            "description": "Transaction features conform within normal baseline expectations.",
            "severity": "low"
        })

    # 4. GNN Graph-Aware Inference
    gnn_pred, gnn_prob, gnn_meta = predict_gnn_transaction(
        transaction_id=transaction_id,
        features=feats if feats else None,
        db_session=db
    )
    if gnn_pred != "UNKNOWN":
        ml_signals.append({
            "name": "Graph Neural Network (GraphSAGE) Relational Score",
            "value": f"{gnn_pred} ({gnn_prob * 100:.1f}% illicit prob)",
            "description": f"GNN aggregated 2-hop graph connectivity across {graph_info['total_neighbors']} direct counterparties ({gnn_meta.get('nodes_in_subgraph', 1)} neighborhood nodes) using message passing.",
            "severity": "critical" if gnn_prob >= 0.75 else "high" if gnn_prob >= 0.5 else "low"
        })

    return {
        "transaction_id": transaction_id,
        "ml_signals": ml_signals,
        "graph_signals": graph_info["graph_signals"],
        "feature_signals": feature_signals,
        "gnn_prediction": {
            "prediction": gnn_pred,
            "illicit_probability": round(gnn_prob, 4),
            "licit_probability": round(1.0 - gnn_prob, 4),
            "metadata": gnn_meta
        },
        "risk_summary": {
            "risk_score": tx.risk_score or 0,
            "risk_level": tx.risk_level or "LOW",
            "known_label": tx.known_label,
            "prediction": tx.prediction,
            "gnn_prediction": gnn_pred,
            "gnn_probability": round(gnn_prob, 4),
            "total_neighbors": graph_info["total_neighbors"],
            "known_illicit_neighbors": graph_info["known_illicit_neighbors"],
            "suspicious_neighbors_count": graph_info["suspicious_neighbors_count"]
        }
    }


@router.get("/transactions/{transaction_id}/evidence")
def get_transaction_evidence(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    graph_info = calculate_neighborhood_signals(db, transaction_id)

    evidence = []
    if tx.known_label == "ILLICIT":
        evidence.append({
            "category": "Dataset Ground Truth",
            "indicator": "Confirmed Illicit Label",
            "observation": "Labeled as illicit (1) in academic Elliptic dataset repository.",
            "forensic_significance": "Definitive historical classification.",
            "confidence": "100%"
        })
    elif tx.known_label == "LICIT":
        evidence.append({
            "category": "Dataset Ground Truth",
            "indicator": "Confirmed Licit Label",
            "observation": "Labeled as licit (2) in academic Elliptic dataset repository.",
            "forensic_significance": "Definitive historical benign classification.",
            "confidence": "100%"
        })

    if tx.prediction:
        prob = tx.prediction_probability or 0.0
        evidence.append({
            "category": "Machine Learning Detection",
            "indicator": f"Model Classification: {tx.prediction}",
            "observation": f"Evaluated illicit probability of {prob * 100:.2f}%.",
            "forensic_significance": "Algorithm-derived structural and behavioral anomaly score.",
            "confidence": f"{max(prob, 1 - prob) * 100:.1f}%"
        })

    # GNN Relational Evidence
    gnn_pred, gnn_prob, gnn_meta = predict_gnn_transaction(
        transaction_id=transaction_id,
        features=None,
        db_session=db
    )
    if gnn_pred != "UNKNOWN":
        evidence.append({
            "category": "Graph Neural Network",
            "indicator": f"GraphSAGE Prediction: {gnn_pred}",
            "observation": f"Aggregated 2-hop transaction neighborhood ({gnn_meta.get('nodes_in_subgraph', 1)} nodes, {gnn_meta.get('edges_in_subgraph', 0)} edges). Evaluated illicit probability: {gnn_prob * 100:.2f}%.",
            "forensic_significance": "Deep relational graph inference over transaction edges and topological money flow.",
            "confidence": f"{max(gnn_prob, 1 - gnn_prob) * 100:.1f}%"
        })

    if graph_info["known_illicit_neighbors"] > 0:
        evidence.append({
            "category": "Network Flow & Exposure",
            "indicator": "Direct Taint Exposure",
            "observation": f"Direct 1-hop flow connected to {graph_info['known_illicit_neighbors']} verified illicit node(s).",
            "forensic_significance": "High risk of money laundering propagation or peel-chain dispersal.",
            "confidence": "High"
        })

    evidence.append({
        "category": "Graph Topology",
        "indicator": "Degree Profile",
        "observation": f"{tx.in_degree} incoming flows, {tx.out_degree} outgoing flows (Total Degree: {tx.total_degree}).",
        "forensic_significance": "Fan-in and fan-out topology indicating transaction structure.",
        "confidence": "Deterministic"
    })

    return {
        "transaction_id": transaction_id,
        "evidence_items": evidence,
        "disclaimer": "Model-derived forensic intelligence. Research-oriented indicators do not constitute legal proof."
    }
