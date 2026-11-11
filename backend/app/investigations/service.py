"""
Investigation Case Management Service for TRACE-X.
Empowers forensic investigators to group suspicious transactions, log notes,
and track chain-of-custody intelligence.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from backend.app.models import InvestigationCase, CaseTransaction, InvestigationNote, Transaction


class InvestigationService:
    @staticmethod
    def list_cases(db: Session) -> List[Dict[str, Any]]:
        cases = db.query(InvestigationCase).order_by(InvestigationCase.updated_at.desc()).all()
        result = []
        for c in cases:
            tx_count = db.query(CaseTransaction).filter(CaseTransaction.case_id == c.id).count()
            result.append({
                "id": c.id,
                "case_name": c.case_name,
                "description": c.description,
                "status": c.status,
                "transaction_count": tx_count,
                "created_at": c.created_at,
                "updated_at": c.updated_at
            })
        return result

    @staticmethod
    def create_case(db: Session, case_name: str, description: Optional[str] = None, initial_txs: Optional[List[int]] = None) -> Dict[str, Any]:
        new_case = InvestigationCase(
            case_name=case_name,
            description=description,
            status="OPEN",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(new_case)
        db.commit()
        db.refresh(new_case)

        if initial_txs:
            for tx_id in initial_txs:
                case_tx = CaseTransaction(case_id=new_case.id, transaction_id=tx_id)
                db.add(case_tx)
            db.commit()

        return InvestigationService.get_case_detail(db, new_case.id)

    @staticmethod
    def get_case_detail(db: Session, case_id: int) -> Optional[Dict[str, Any]]:
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case:
            return None

        # Get transactions in case with their metadata
        case_txs = db.query(CaseTransaction).filter(CaseTransaction.case_id == case_id).all()
        tx_ids = [ct.transaction_id for ct in case_txs]

        meta_map = {}
        if tx_ids:
            tx_meta_records = db.query(Transaction).filter(Transaction.transaction_id.in_(tx_ids)).all()
            meta_map = {t.transaction_id: t for t in tx_meta_records}

        transactions_data = []
        for ct in case_txs:
            m = meta_map.get(ct.transaction_id)
            transactions_data.append({
                "transaction_id": ct.transaction_id,
                "time_step": m.time_step if m else 1,
                "known_label": m.known_label if m else "UNKNOWN",
                "prediction": m.prediction if m else None,
                "risk_score": m.risk_score if m else None,
                "risk_level": m.risk_level if m else "LOW",
                "notes": ct.notes,
                "added_at": ct.added_at
            })

        # Get notes
        notes = db.query(InvestigationNote).filter(InvestigationNote.case_id == case_id).order_by(InvestigationNote.created_at.desc()).all()
        notes_data = [
            {
                "id": n.id,
                "case_id": n.case_id,
                "transaction_id": n.transaction_id,
                "note": n.note,
                "author": n.author,
                "created_at": n.created_at
            }
            for n in notes
        ]

        return {
            "id": case.id,
            "case_name": case.case_name,
            "description": case.description,
            "status": case.status,
            "created_at": case.created_at,
            "updated_at": case.updated_at,
            "transaction_count": len(transactions_data),
            "transactions": transactions_data,
            "notes": notes_data
        }

    @staticmethod
    def update_case(db: Session, case_id: int, case_name: Optional[str] = None, description: Optional[str] = None, status: Optional[str] = None) -> Optional[Dict[str, Any]]:
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case:
            return None
        if case_name is not None:
            case.case_name = case_name
        if description is not None:
            case.description = description
        if status is not None:
            case.status = status.upper()
        case.updated_at = datetime.utcnow()
        db.commit()
        return InvestigationService.get_case_detail(db, case_id)

    @staticmethod
    def add_transactions_to_case(db: Session, case_id: int, transaction_ids: List[int], notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case:
            return None

        for tx_id in transaction_ids:
            existing = db.query(CaseTransaction).filter(
                CaseTransaction.case_id == case_id,
                CaseTransaction.transaction_id == tx_id
            ).first()
            if not existing:
                ct = CaseTransaction(
                    case_id=case_id,
                    transaction_id=tx_id,
                    notes=notes,
                    added_at=datetime.utcnow()
                )
                db.add(ct)
        case.updated_at = datetime.utcnow()
        db.commit()
        return InvestigationService.get_case_detail(db, case_id)

    @staticmethod
    def add_note_to_case(db: Session, case_id: int, note: str, transaction_id: Optional[int] = None, author: str = "Investigator") -> Optional[Dict[str, Any]]:
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case:
            return None

        new_note = InvestigationNote(
            case_id=case_id,
            transaction_id=transaction_id,
            note=note,
            author=author,
            created_at=datetime.utcnow()
        )
        db.add(new_note)
        case.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(new_note)
        return {
            "id": new_note.id,
            "case_id": new_note.case_id,
            "transaction_id": new_note.transaction_id,
            "note": new_note.note,
            "author": new_note.author,
            "created_at": new_note.created_at
        }
