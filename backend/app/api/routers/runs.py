import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
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
    ReconciliationRun, Client, User, UploadedFile, MatchResult, RunStatus, Bucket, ReviewStatus,
    PurchaseInvoice, PortalInvoice
)
from app.api.dependencies.client import get_current_client
from app.api.dependencies.auth import get_current_user
from typing import Optional

router = APIRouter()

from fastapi import BackgroundTasks

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
    
    # We optionally link the uploaded files to this run.
    if data.purchase_file_id:
        f1 = db.query(UploadedFile).filter(UploadedFile.id == data.purchase_file_id).first()
        if f1: f1.run_id = run.id
    if data.portal_file_id:
        f2 = db.query(UploadedFile).filter(UploadedFile.id == data.portal_file_id).first()
        if f2: f2.run_id = run.id
    db.commit()
    
    # Trigger matching process synchronously for the MVP to avoid DB session closed issues
    from app.services.matcher import run_reconciliation
    run_reconciliation(run.id, db)
    
    return RunCreateResponse(
        id=run.id,
        status=run.status,
        total_records_committed=0
    )

@router.get("/runs/recent", response_model=RunListResponse)
def list_recent_runs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ReconciliationRun).filter(ReconciliationRun.workspace_id == current_user.workspace_id)
    runs = query.order_by(ReconciliationRun.created_at.desc()).limit(10).all()
    
    items = []
    for r in runs:
        client = db.query(Client).filter(Client.id == r.client_id).first()
        client_name = client.legal_name if client else "Unknown Client"
        
        pr_total_rows = db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == r.id).count()
        po_total_rows = db.query(PortalInvoice).filter(PortalInvoice.run_id == r.id).count()
        matched = db.query(MatchResult).filter(MatchResult.run_id == r.id, MatchResult.bucket == Bucket.matched).count()
        
        match_rate = 0.0
        if pr_total_rows > 0:
            match_rate = round((matched / pr_total_rows) * 100, 1)
            
        itc_at_risk = 0.0
        for m in db.query(MatchResult).filter(MatchResult.run_id == r.id).all():
            if m.bucket in [Bucket.missing_in_portal, Bucket.mismatched]:
                itc_at_risk += abs(m.tax_diff or 0.0)
        
        items.append({
            "id": r.id,
            "client_id": r.client_id,
            "client_name": client_name,
            "financial_year": r.financial_year,
            "tax_period": r.tax_period,
            "status": r.status,
            "invoices": pr_total_rows + po_total_rows,
            "matched_percentage": match_rate,
            "itc_at_risk": itc_at_risk,
            "created_on": r.created_at
        })
    return RunListResponse(items=items, total=len(items))

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
        client = db.query(Client).filter(Client.id == r.client_id).first()
        client_name = client.legal_name if client else "Unknown Client"
        
        pr_total_rows = db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == r.id).count()
        po_total_rows = db.query(PortalInvoice).filter(PortalInvoice.run_id == r.id).count()
        matched = db.query(MatchResult).filter(MatchResult.run_id == r.id, MatchResult.bucket == Bucket.matched).count()
        
        match_rate = 0.0
        if pr_total_rows > 0:
            match_rate = round((matched / pr_total_rows) * 100, 1)
            
        itc_at_risk = 0.0
        for m in db.query(MatchResult).filter(MatchResult.run_id == r.id).all():
            if m.bucket in [Bucket.missing_in_portal, Bucket.mismatched]:
                itc_at_risk += abs(m.tax_diff or 0.0)
                
        items.append(RunResponse(
            id=r.id,
            client_id=r.client_id,
            client_name=client_name,
            financial_year=r.financial_year,
            tax_period=r.tax_period,
            status=r.status,
            invoices=pr_total_rows + po_total_rows,
            matched_percentage=match_rate,
            itc_at_risk=itc_at_risk,
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
        
    matched = db.query(MatchResult).filter(MatchResult.run_id == id, MatchResult.bucket == Bucket.matched).count()
    mismatched = db.query(MatchResult).filter(MatchResult.run_id == id, MatchResult.bucket == Bucket.mismatched).count()
    missing_portal = db.query(MatchResult).filter(MatchResult.run_id == id, MatchResult.bucket == Bucket.missing_in_portal).count()
    missing_books = db.query(MatchResult).filter(MatchResult.run_id == id, MatchResult.bucket == Bucket.missing_in_books).count()
    probable = db.query(MatchResult).filter(MatchResult.run_id == id, MatchResult.bucket == Bucket.probable).count()
    
    counts = RunSummaryCounts(
        matched=matched, mismatched=mismatched, missing_in_portal=missing_portal, missing_in_books=missing_books, probable=probable
    )
    
    itc_at_risk = 0.0
    itc_recovered = 0.0
    for m in db.query(MatchResult).filter(MatchResult.run_id == id).all():
        if m.bucket in [Bucket.missing_in_portal, Bucket.mismatched]:
            itc_at_risk += abs(m.tax_diff or 0.0)
        elif m.bucket in [Bucket.matched, Bucket.probable]:
            if m.purchase_invoice_id:
                inv = db.query(PurchaseInvoice).filter(PurchaseInvoice.id == m.purchase_invoice_id).first()
                if inv:
                    itc_recovered += (inv.total_tax or 0.0)
            
    pr_tax_sum = db.query(func.sum(PurchaseInvoice.total_tax)).filter(PurchaseInvoice.run_id == id).scalar() or 0.0
    po_tax_sum = db.query(func.sum(PortalInvoice.total_tax)).filter(PortalInvoice.run_id == id).scalar() or 0.0
            
    pr_total_rows = db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == id).count()
    po_total_rows = db.query(PortalInvoice).filter(PortalInvoice.run_id == id).count()
    
    match_rate = 0.0
    if pr_total_rows > 0:
        match_rate = round((matched / pr_total_rows) * 100, 1)
    
    return RunSummaryResponse(
        id=run.id,
        client_id=run.client_id,
        financial_year=run.financial_year,
        tax_period=run.tax_period,
        status=run.status,
        counts=counts,
        itc_at_risk=itc_at_risk,
        itc_recovered=itc_recovered,
        pr_total=pr_tax_sum,
        gstr2b_total=po_tax_sum,
        match_rate=match_rate,
        total=pr_total_rows + po_total_rows
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
        
    # We must join to PR/PO to filter by q if necessary
    # Or fetch all and filter in Python for simplicity in MVP
    matches_all = query.all()
    filtered_matches = []
    
    for m in matches_all:
        pr_inv = None
        po_inv = None
        if m.purchase_invoice_id:
            pr_inv = db.query(PurchaseInvoice).filter(PurchaseInvoice.id == m.purchase_invoice_id).first()
        if m.portal_invoice_id:
            po_inv = db.query(PortalInvoice).filter(PortalInvoice.id == m.portal_invoice_id).first()
            
        pr_num = pr_inv.invoice_number if pr_inv else ""
        po_num = po_inv.invoice_number if po_inv else ""
        pr_gstin = pr_inv.supplier_gstin if pr_inv else ""
        po_gstin = po_inv.supplier_gstin if po_inv else ""
        
        # Filter by q (search)
        if q:
            q_lower = q.lower()
            if q_lower not in pr_num.lower() and q_lower not in po_num.lower() and q_lower not in pr_gstin.lower() and q_lower not in po_gstin.lower():
                continue
                
        filtered_matches.append((m, pr_inv, po_inv))
        
    total = len(filtered_matches)
    start_idx = (page - 1) * page_size
    paged_matches = filtered_matches[start_idx:start_idx + page_size]
    
    items = []
    for m, pr_inv, po_inv in paged_matches:
        items.append(MatchRowResponse(
            id=m.id,
            bucket=m.bucket,
            match_pass=m.match_pass,
            confidence=m.confidence,
            difference=m.tax_diff,
            
            pr_vendor_gstin=pr_inv.supplier_gstin if pr_inv else None,
            gstr2b_vendor_gstin=po_inv.supplier_gstin if po_inv else None,
            pr_invoice_number=pr_inv.invoice_number if pr_inv else None,
            gstr2b_invoice_number=po_inv.invoice_number if po_inv else None,
            pr_invoice_date=pr_inv.invoice_date if pr_inv else None,
            gstr2b_invoice_date=po_inv.invoice_date if po_inv else None,
            pr_tax_value=pr_inv.total_tax if pr_inv else None,
            gstr2b_tax_value=po_inv.total_tax if po_inv else None,
            
            review_status=m.review_status
        ))
    
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

