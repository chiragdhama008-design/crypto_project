"""
Investigation Cases API routes.
Enables full forensic lifecycle: case creation, entity tagging, investigator notes, and status management.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.app.database import get_db
from backend.app.investigations.service import InvestigationService
from backend.app.schemas.dashboard import (
    CaseCreateRequest,
    CaseUpdateRequest,
    NoteCreateRequest,
    AddTransactionsRequest
)

router = APIRouter(prefix="/cases", tags=["Investigations"])


@router.get("")
def list_cases(db: Session = Depends(get_db)):
    return InvestigationService.list_cases(db)


@router.post("")
def create_case(req: CaseCreateRequest, db: Session = Depends(get_db)):
    if not req.case_name.strip():
        raise HTTPException(status_code=400, detail="Case name is required")
    return InvestigationService.create_case(
        db=db,
        case_name=req.case_name,
        description=req.description,
        initial_txs=req.initial_transactions
    )


@router.get("/{case_id}")
def get_case(case_id: int, db: Session = Depends(get_db)):
    case = InvestigationService.get_case_detail(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Investigation case not found")
    return case


@router.patch("/{case_id}")
def update_case(case_id: int, req: CaseUpdateRequest, db: Session = Depends(get_db)):
    updated = InvestigationService.update_case(
        db=db,
        case_id=case_id,
        case_name=req.case_name,
        description=req.description,
        status=req.status
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Investigation case not found")
    return updated


@router.post("/{case_id}/transactions")
def add_transactions(case_id: int, req: AddTransactionsRequest, db: Session = Depends(get_db)):
    if not req.transaction_ids:
        raise HTTPException(status_code=400, detail="Transaction IDs list cannot be empty")
    updated = InvestigationService.add_transactions_to_case(
        db=db,
        case_id=case_id,
        transaction_ids=req.transaction_ids,
        notes=req.notes
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Investigation case not found")
    return updated


@router.post("/{case_id}/notes")
def add_note(case_id: int, req: NoteCreateRequest, db: Session = Depends(get_db)):
    if not req.note.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty")
    created_note = InvestigationService.add_note_to_case(
        db=db,
        case_id=case_id,
        note=req.note,
        transaction_id=req.transaction_id,
        author=req.author or "Investigator"
    )
    if not created_note:
        raise HTTPException(status_code=404, detail="Investigation case not found")
    return created_note
