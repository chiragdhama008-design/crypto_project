"""
Investigation Dossier and Forensic Report Generator for TRACE-X.
Aggregates case transactions, graph propagation evidence, ML risk indicators,
and produces comprehensive, case-ready intelligence reports.
"""

import hashlib
import json
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.investigations.service import InvestigationService
from backend.app.models import Transaction, TransactionEdge


class ReportGenerator:
    @staticmethod
    def generate_case_report(db: Session, case_id: int) -> Optional[Dict[str, Any]]:
        case_data = InvestigationService.get_case_detail(db, case_id)
        if not case_data:
            return None

        tx_list = case_data["transactions"]
        tx_ids = [t["transaction_id"] for t in tx_list]

        # Calculate case-level risk summary
        critical_count = sum(1 for t in tx_list if t["risk_level"] == "CRITICAL")
        high_count = sum(1 for t in tx_list if t["risk_level"] == "HIGH")
        medium_count = sum(1 for t in tx_list if t["risk_level"] == "MEDIUM")
        low_count = sum(1 for t in tx_list if t["risk_level"] == "LOW")
        avg_risk = sum((t["risk_score"] or 0) for t in tx_list) / max(len(tx_list), 1)

        # Graph connectivity within case
        internal_edges = []
        if tx_ids:
            internal_edges = db.query(
                TransactionEdge.source_transaction_id,
                TransactionEdge.destination_transaction_id
            ).filter(
                TransactionEdge.source_transaction_id.in_(tx_ids),
                TransactionEdge.destination_transaction_id.in_(tx_ids)
            ).all()

        evidence_items = []
        for t in tx_list:
            if t["known_label"] == "ILLICIT":
                evidence_items.append({
                    "transaction_id": t["transaction_id"],
                    "type": "GROUND_TRUTH_FLAG",
                    "severity": "CRITICAL",
                    "detail": "Verified ground-truth illicit Bitcoin transaction in dataset."
                })
            elif t["prediction"] == "ILLICIT":
                evidence_items.append({
                    "transaction_id": t["transaction_id"],
                    "type": "MODEL_ANOMALY_DETECTION",
                    "severity": "HIGH",
                    "detail": f"Classified illicit by predictive model with risk score {t['risk_score']}."
                })

        generated_at = datetime.now(timezone.utc)
        active_model_label = settings.ACTIVE_MODEL.replace("_", " ").title()

        report = {
            "case_id": case_data["id"],
            "case_name": case_data["case_name"],
            "status": case_data["status"],
            "created_at": case_data["created_at"],
            "generated_at": generated_at,
            "investigator": "Forensic Intelligence Unit / ChainGuard System",
            "executive_summary": (
                f"Forensic investigation dossier for Case #{case_data['id']}: '{case_data['case_name']}'. "
                f"A total of {len(tx_list)} transactions were inspected with an average composite risk score of {avg_risk:.1f}/100. "
                f"Identified {critical_count} critical and {high_count} high-risk entities exhibiting network and feature anomalies."
            ),
            "risk_assessment_summary": {
                "total_investigated": len(tx_list),
                "average_risk_score": round(avg_risk, 1),
                "critical_risk_count": critical_count,
                "high_risk_count": high_count,
                "medium_risk_count": medium_count,
                "low_risk_count": low_count
            },
            "investigated_transactions": tx_list,
            "network_findings": {
                "internal_case_edges_count": len(internal_edges),
                "internal_connections": [
                    {"source": src, "target": dst} for src, dst in internal_edges
                ],
                "topology_summary": (
                    f"Identified {len(internal_edges)} direct transactional flows interconnecting entities within this case cluster."
                )
            },
            "model_findings": {
                "active_model": active_model_label,
                "classification_focus": "Minority Illicit Class Anomaly Detection",
                "detection_threshold": 0.50
            },
            "evidence_items": evidence_items,
            "forensic_notes": case_data["notes"],
            "methodology_and_limitations": (
                "ChainGuard outputs represent model-derived statistical signals and network topology metrics. "
                "The findings are intended for investigative lead generation and research triage. "
                "These signals do not constitute legally definitive proof of criminal activity without corroborated off-chain evidence."
            )
        }

        canonical_payload = json.dumps(
            {
                "case_id": report["case_id"],
                "status": report["status"],
                "generated_at": generated_at.isoformat(),
                "risk_assessment_summary": report["risk_assessment_summary"],
                "investigated_transactions": report["investigated_transactions"],
                "network_findings": report["network_findings"],
                "evidence_items": report["evidence_items"],
                "forensic_notes": report["forensic_notes"],
            },
            sort_keys=True,
            default=str,
        )
        report["integrity_sha256"] = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

        return report
