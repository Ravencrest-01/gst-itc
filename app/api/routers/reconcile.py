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
from app.services.reconciliation import ingest_file, reconcile, ReconciliationConfig

router = APIRouter()

@router.post("/reconcile")
def run_reconciliation_endpoint(
    purchase_register: UploadFile = File(...),
    gstr_2b: UploadFile = File(...),
    ctx: TenantContext = Depends(require_active_client),
    db: Session = Depends(get_db)
):
    """Legacy/direct multipart upload endpoint utilizing active client context."""
    run = ReconciliationRun(client_id=ctx.active_client.id, tax_period="CURRENT", status=RunStatusEnum.processing)
    db.add(run)
    db.flush()
    
    config = ReconciliationConfig()
    
    # Process PR
    pr_content = purchase_register.file.read()
    pr_result = ingest_file(pr_content, kind="purchase_register", config=config)
    
    # Process 2B
    po_content = gstr_2b.file.read()
    po_result = ingest_file(po_content, kind="gstr_2b", config=config)
    
    # Run Engine
    matches, summary = reconcile(pr_result.rows, po_result.rows, config)
    
    # We must save invoices to DB to get IDs
    pr_db_invoices = []
    for row in pr_result.rows:
        inv = PurchaseInvoice(
            run_id=run.id,
            supplier_gstin=row.supplier_gstin,
            supplier_name=row.supplier_name,
            invoice_number=row.invoice_number,
            invoice_number_norm=row.invoice_number_norm,
            invoice_date=row.invoice_date,
            taxable_value=row.taxable_value,
            cgst=row.cgst,
            sgst=row.sgst,
            igst=row.igst,
            cess=row.cess,
            total_tax=row.total_tax
        )
        pr_db_invoices.append(inv)
        # Store object ref to fetch ID later
        row.raw_data["_db_obj"] = inv 
        
    twob_db_invoices = []
    for row in po_result.rows:
        inv = PortalInvoice(
            run_id=run.id,
            supplier_gstin=row.supplier_gstin,
            supplier_name=row.supplier_name,
            invoice_number=row.invoice_number,
            invoice_number_norm=row.invoice_number_norm,
            invoice_date=row.invoice_date,
            taxable_value=row.taxable_value,
            cgst=row.cgst,
            sgst=row.sgst,
            igst=row.igst,
            cess=row.cess,
            total_tax=row.total_tax
        )
        twob_db_invoices.append(inv)
        row.raw_data["_db_obj"] = inv
        
    db.add_all(pr_db_invoices)
    db.add_all(twob_db_invoices)
    db.flush() # Now all invoices have IDs!
    
    db_matches = []
    for m in matches:
        pr_id = m.purchase_invoice.raw_data["_db_obj"].id if m.purchase_invoice else None
        po_id = m.portal_invoice.raw_data["_db_obj"].id if m.portal_invoice else None
        
        db_matches.append(MatchResult(
            run_id=run.id,
            purchase_invoice_id=pr_id,
            portal_invoice_id=po_id,
            bucket=BucketEnum(m.bucket.value),
            match_pass=m.match_pass.value if m.match_pass else None,
            confidence=m.confidence,
            tax_diff=m.tax_diff,
            review_status=m.review_status.value
        ))
        
    db.bulk_save_objects(db_matches)
    
    run.total_records = summary.total
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
