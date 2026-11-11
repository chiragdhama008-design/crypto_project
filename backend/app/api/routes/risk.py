"""
Risk & Alerts API routes.
Investigator-oriented risk triage queue, alert feeds, and transparent score calculation breakdowns.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.database import get_db
from backend.app.models import Transaction, TransactionFeature
from backend.app.graph.risk import calculate_neighborhood_signals
from backend.app.risk.engine import calculate_risk_score
import json

router = APIRouter(prefix="/risk", tags=["Risk & Alerts"])


@router.get("/high")
def get_high_risk_queue(
    level: Optional[str] = None,
    time_step: Optional[int] = None,
    limit: int = Query(50, ge=1, le=100),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db)
):
    query = db.query(Transaction).filter(Transaction.risk_score.isnot(None))

    if level:
        query = query.filter(Transaction.risk_level == level.upper())
    if time_step:
        query = query.filter(Transaction.time_step == time_step)

    total = query.count()
    offset = (page - 1) * limit
    records = query.order_by(Transaction.risk_score.desc()).offset(offset).limit(limit).all()

    # Counts by level
    level_counts = db.query(
        Transaction.risk_level,
        func.count(Transaction.id)
    ).group_by(Transaction.risk_level).all()

    stats = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for r_lvl, cnt in level_counts:
        if r_lvl in stats:
            stats[r_lvl] = cnt

    items = []
    for t in records:
        reasons = []
        if t.known_label == "ILLICIT":
            reasons.append("Ground-truth verified illicit transaction")
        if (t.prediction_probability or 0) >= 0.7:
            reasons.append(f"High ML illicit probability ({(t.prediction_probability or 0)*100:.1f}%)")
        if t.total_degree > 15:
            reasons.append(f"High network degree connectivity ({t.total_degree} flows)")

        prob_rounded = round(t.prediction_probability, 4) if t.prediction_probability is not None else None
        total_deg = t.total_degree if t.total_degree is not None else ((t.in_degree or 0) + (t.out_degree or 0))
        items.append({
            "transaction_id": t.transaction_id,
            "time_step": t.time_step,
            "known_label": t.known_label,
            "prediction": t.prediction,
            "probability": prob_rounded,
            "prediction_probability": prob_rounded,
            "risk_score": t.risk_score or 0,
            "risk_level": t.risk_level or "LOW",
            "in_degree": t.in_degree or 0,
            "out_degree": t.out_degree or 0,
            "total_degree": total_deg,
            "trigger_reasons": reasons
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "critical_count": stats["CRITICAL"],
        "high_count": stats["HIGH"],
        "medium_count": stats["MEDIUM"],
        "low_count": stats["LOW"],
        "transactions": items
    }


@router.get("/{transaction_id}")
def get_transaction_risk_breakdown(transaction_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    graph_metrics = calculate_neighborhood_signals(db, transaction_id)
    
    # Features
    feat_record = db.query(TransactionFeature).filter(TransactionFeature.transaction_id == transaction_id).first()
    feats = json.loads(feat_record.features) if (feat_record and feat_record.features) else None

    prob = tx.prediction_probability or 0.0
    score, level, breakdown = calculate_risk_score(
        known_label=tx.known_label,
        ml_probability=prob,
        graph_metrics=graph_metrics,
        features=feats
    )

    return {
        "transaction_id": transaction_id,
        "risk_score": score,
        "risk_level": level.value,
        "breakdown": breakdown
    }
