import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.run import (
    RunCreateRequest, RunCreateResponse, RunResponse, RunListResponse,
    RunSummaryResponse, RunSummaryCounts, MatchRowResponse, MatchRowListResponse
)
from pydantic import BaseModel

class ReviewMatchRequest(BaseModel):
    decision: str # confirm | reject | skip

class ReviewMatchResponse(BaseModel):
    id: uuid.UUID
    bucket: str
    review_status: str
    reviewed_by: uuid.UUID

class RunStatusUpdateResponse(BaseModel):
    id: uuid.UUID
    status: str

from app.models.models import (
    ReconciliationRun, Client, User, UploadedFile, MatchResult, RunStatus, Bucket, ReviewStatus
)
from app.api.dependencies.client import get_current_client
from app.api.dependencies.auth import get_current_user
from typing import Optional

router = APIRouter()

@router.post("/clients/{id}/runs", response_model=RunCreateResponse)
def create_run(
    id: uuid.UUID,
    data: RunCreateRequest,
    client: Client = Depends(get_current_client),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = ReconciliationRun(
        workspace_id=current_user.workspace_id,
        client_id=client.id,
        created_by=current_user.id,
        financial_year=data.financial_year,
        tax_period=data.tax_period,
        status=RunStatus.pending
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    
    # Mocking matching process logic
    # In a real engine, we'd read purchase_file_id and portal_file_id, normalize, and match
    run.status = RunStatus.completed
    db.commit()
    
    return RunCreateResponse(
        id=run.id,
        status=run.status,
        total_records_committed=0
    )

@router.get("/clients/{id}/runs", response_model=RunListResponse)
def list_runs(
    id: uuid.UUID,
    fy: Optional[str] = None,
    page: int = 1,
    client: Client = Depends(get_current_client),
    db: Session = Depends(get_db)
):
    query = db.query(ReconciliationRun).filter(ReconciliationRun.client_id == client.id)
    if fy:
        query = query.filter(ReconciliationRun.financial_year == fy)
        
    runs = query.order_by(ReconciliationRun.created_at.desc()).all()
    
    items = []
    for r in runs:
        items.append(RunResponse(
            id=r.id,
            client_id=r.client_id,
            financial_year=r.financial_year,
            tax_period=r.tax_period,
            status=r.status,
            invoices=0, # Would aggregate from purchase/portal invoices
            matched_percentage=0.0,
            itc_at_risk=0.0,
            created_on=r.created_at
        ))
    return RunListResponse(items=items, total=len(items))

@router.get("/runs/{id}/summary", response_model=RunSummaryResponse)
def get_run_summary(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == id, ReconciliationRun.workspace_id == current_user.workspace_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    counts = RunSummaryCounts(
        matched=0, mismatched=0, missing_in_portal=0, missing_in_books=0, probable=0
    )
    
    return RunSummaryResponse(
        counts=counts,
        itc_at_risk=0.0,
        itc_recovered=0.0,
        total=0
    )

@router.get("/runs/{id}/matches", response_model=MatchRowListResponse)
def get_run_matches(
    id: uuid.UUID,
    bucket: Optional[Bucket] = None,
    q: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == id, ReconciliationRun.workspace_id == current_user.workspace_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    query = db.query(MatchResult).filter(MatchResult.run_id == id)
    if bucket:
        query = query.filter(MatchResult.bucket == bucket)
        
    total = query.count()
    matches = query.offset((page - 1) * page_size).limit(page_size).all()
    
    items = []
    # Real logic would join PurchaseInvoice / PortalInvoice to construct the flat row response
    return MatchRowListResponse(items=items, total=total, page=page, page_size=page_size)

@router.patch("/runs/{id}/matches/{matchId}", response_model=ReviewMatchResponse)
def review_match(
    id: uuid.UUID,
    matchId: uuid.UUID,
    data: ReviewMatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.decision not in ["confirm", "reject", "skip"]:
        raise HTTPException(status_code=400, detail="Invalid decision")
        
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == id, ReconciliationRun.workspace_id == current_user.workspace_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    match = db.query(MatchResult).filter(MatchResult.id == matchId, MatchResult.run_id == id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    # Apply decision logic here
    if data.decision == "confirm":
        match.review_status = ReviewStatus.confirmed
    elif data.decision == "reject":
        match.review_status = ReviewStatus.rejected
    else:
        match.review_status = ReviewStatus.skipped
        
    match.reviewed_by = current_user.id
    db.commit()
    db.refresh(match)
    
    return ReviewMatchResponse(
        id=match.id,
        bucket=match.bucket,
        review_status=match.review_status,
        reviewed_by=match.reviewed_by
    )

@router.patch("/runs/{id}/status", response_model=RunStatusUpdateResponse)
def update_run_status(
    id: uuid.UUID,
    status: RunStatus,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == id, ReconciliationRun.workspace_id == current_user.workspace_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    run.status = status
    db.commit()
    
    return RunStatusUpdateResponse(id=run.id, status=run.status)

@router.delete("/runs/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == id, ReconciliationRun.workspace_id == current_user.workspace_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    # In real app, cascade deletes are handled by SQLAlchemy relationship cascade configurations.
    # For now we'll just delete the run.
    db.delete(run)
    db.commit()
    return None

