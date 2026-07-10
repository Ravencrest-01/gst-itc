import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_context, require_active_client, TenantContext
from app.models.domain import ReconciliationRun, PurchaseInvoice, PortalInvoice, MatchResult, UploadedFile
from app.models.enums import RunStatusEnum, FileKindEnum, BucketEnum
from app.schemas.domain import RunOut, ReconciliationSummary, MatchUpdate
from app.services.ingestion import ingest_file
from app.services.matcher import run_reconciliation_pass

router = APIRouter()

@router.post("/reconcile")
def run_reconciliation(
    purchase_register: UploadFile = File(...),
    gstr_2b: UploadFile = File(...),
    ctx: TenantContext = Depends(require_active_client),
    db: Session = Depends(get_db)
):
    """Legacy/direct multipart upload endpoint utilizing active client context."""
    run = ReconciliationRun(client_id=ctx.active_client.id, tax_period="CURRENT", status=RunStatusEnum.processing)
    db.add(run)
    db.flush()
    
    # Process PR
    pr_content = purchase_register.file.read()
    pr_result = ingest_file(pr_content, purchase_register.filename)
    
    pr_invoices = [
        PurchaseInvoice(run_id=run.id, **row) 
        for row in pr_result.rows
    ]
    db.bulk_save_objects(pr_invoices)
    
    # Process 2B
    po_content = gstr_2b.file.read()
    po_result = ingest_file(po_content, gstr_2b.filename)
    
    po_invoices = [
        PortalInvoice(run_id=run.id, **row) 
        for row in po_result.rows
    ]
    db.bulk_save_objects(po_invoices)
    
    run.total_records = len(pr_invoices) + len(po_invoices)
    
    # Execute matching
    matches_created = run_reconciliation_pass(db, run.id)
    
    run.status = RunStatusEnum.completed
    db.commit()
    
    return {
        "status": "success",
        "run_id": run.id,
        "total_records_committed": run.total_records
    }

@router.get("/runs/recent")
def get_recent_runs(ctx: TenantContext = Depends(require_active_client), db: Session = Depends(get_db)):
    runs = db.execute(
        select(ReconciliationRun)
        .where(ReconciliationRun.client_id == ctx.active_client.id)
        .order_by(ReconciliationRun.created_at.desc())
        .limit(10)
    ).scalars().all()
    
    return {"runs": [{"id": str(r.id), "tax_period": r.tax_period, "status": r.status} for r in runs]}

@router.get("/runs/{id}/summary", response_model=ReconciliationSummary)
def get_run_summary(id: uuid.UUID, ctx: TenantContext = Depends(require_active_client), db: Session = Depends(get_db)):
    # Very simplified aggregation for example
    counts = db.execute(
        select(MatchResult.bucket, func.count(MatchResult.id))
        .where(MatchResult.run_id == id)
        .group_by(MatchResult.bucket)
    ).all()
    
    count_dict = {row[0].value: row[1] for row in counts}
    
    # Need to aggregate itc at risk (missing in 2B + mismatched)
    at_risk = db.execute(
        select(func.sum(MatchResult.tax_diff))
        .where(MatchResult.run_id == id)
        .where(MatchResult.bucket.in_([BucketEnum.mismatched, BucketEnum.missing_in_portal]))
    ).scalar() or 0.0
    
    return ReconciliationSummary(
        counts=count_dict,
        itc_at_risk=float(at_risk),
        itc_recovered=0.0,
        total=sum(count_dict.values())
    )

@router.get("/runs/{id}/results")
def get_run_results(id: uuid.UUID, ctx: TenantContext = Depends(require_active_client), db: Session = Depends(get_db)):
    matches = db.execute(select(MatchResult).where(MatchResult.run_id == id)).scalars().all()
    return {"items": [{"id": m.id, "bucket": m.bucket, "tax_diff": m.tax_diff} for m in matches], "total": len(matches), "page": 1, "page_size": 100}

@router.patch("/reconcile/matches/{id}")
def update_match(id: uuid.UUID, payload: MatchUpdate, ctx: TenantContext = Depends(require_active_client), db: Session = Depends(get_db)):
    match = db.execute(select(MatchResult).where(MatchResult.id == id)).scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    match.review_status = payload.status
    if payload.override_bucket:
        match.bucket = payload.override_bucket
    db.commit()
    return {"status": "success"}
