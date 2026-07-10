import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func
import os
import time

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_context, require_active_client, TenantContext
from app.models.domain import ReconciliationRun, PurchaseInvoice, PortalInvoice, MatchResult, UploadedFile
from app.models.enums import RunStatusEnum, FileKindEnum, BucketEnum
from app.schemas.domain import RunOut, ReconciliationSummary, MatchUpdate
from app.services.reconciliation import ingest_file, reconcile, ReconciliationConfig

router = APIRouter()

UPLOAD_DIR = "data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/reconcile")
def run_reconciliation_endpoint(
    purchase_register: UploadFile = File(...),
    gstr_2b: UploadFile = File(...),
    tax_period: str = Form("CURRENT"),
    ctx: TenantContext = Depends(require_active_client),
    db: Session = Depends(get_db)
):
    """Legacy/direct multipart upload endpoint utilizing active client context."""
    run = ReconciliationRun(client_id=ctx.active_client.id, tax_period=tax_period, status=RunStatusEnum.processing)
    db.add(run)
    db.flush()
    
    config = ReconciliationConfig()
    
    # Process PR
    pr_content = purchase_register.file.read()
    
    # Save PR file
    pr_path = os.path.join(UPLOAD_DIR, f"{int(time.time())}_{purchase_register.filename}")
    with open(pr_path, "wb") as f:
        f.write(pr_content)
        
    db_pr_file = UploadedFile(
        client_id=ctx.active_client.id,
        kind=FileKindEnum.purchase_register,
        filename=purchase_register.filename,
        tax_period=tax_period,
        storage_path=pr_path
    )
    db.add(db_pr_file)
    
    pr_result = ingest_file(pr_content, kind="purchase_register", config=config)
    db_pr_file.row_count = len(pr_result.rows)
    
    # Process 2B
    po_content = gstr_2b.file.read()
    
    # Save 2B file
    po_path = os.path.join(UPLOAD_DIR, f"{int(time.time())}_{gstr_2b.filename}")
    with open(po_path, "wb") as f:
        f.write(po_content)
        
    db_po_file = UploadedFile(
        client_id=ctx.active_client.id,
        kind=FileKindEnum.gstr_2b,
        filename=gstr_2b.filename,
        tax_period=tax_period,
        storage_path=po_path
    )
    db.add(db_po_file)
    
    po_result = ingest_file(po_content, kind="gstr_2b", config=config)
    db_po_file.row_count = len(po_result.rows)
    
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
    
    # Calculate ITC recovered (matched/probable from Books)
    recovered = db.execute(
        select(func.sum(PurchaseInvoice.total_tax))
        .join(MatchResult, MatchResult.purchase_invoice_id == PurchaseInvoice.id)
        .where(MatchResult.run_id == id)
        .where(MatchResult.bucket.in_([BucketEnum.matched, BucketEnum.probable]))
    ).scalar() or 0.0
    
    return ReconciliationSummary(
        counts=count_dict,
        itc_at_risk=float(at_risk),
        itc_recovered=float(recovered),
        total=sum(count_dict.values())
    )

@router.get("/dashboard/kpis")
def get_dashboard_kpis(ctx: TenantContext = Depends(require_active_client), db: Session = Depends(get_db)):
    total_itc = db.execute(
        select(func.sum(PurchaseInvoice.total_tax))
        .join(ReconciliationRun, PurchaseInvoice.run_id == ReconciliationRun.id)
        .where(ReconciliationRun.client_id == ctx.active_client.id)
    ).scalar() or 0.0
    
    safe_to_claim = db.execute(
        select(func.sum(PurchaseInvoice.total_tax))
        .join(MatchResult, MatchResult.purchase_invoice_id == PurchaseInvoice.id)
        .join(ReconciliationRun, MatchResult.run_id == ReconciliationRun.id)
        .where(ReconciliationRun.client_id == ctx.active_client.id)
        .where(MatchResult.bucket.in_([BucketEnum.matched, BucketEnum.probable]))
    ).scalar() or 0.0
    
    at_risk = db.execute(
        select(func.sum(MatchResult.tax_diff))
        .join(ReconciliationRun, MatchResult.run_id == ReconciliationRun.id)
        .where(ReconciliationRun.client_id == ctx.active_client.id)
        .where(MatchResult.bucket.in_([BucketEnum.mismatched, BucketEnum.missing_in_portal]))
    ).scalar() or 0.0
    
    vendors_action_req = db.execute(
        select(func.count(func.distinct(PurchaseInvoice.supplier_gstin)))
        .join(MatchResult, MatchResult.purchase_invoice_id == PurchaseInvoice.id)
        .join(ReconciliationRun, MatchResult.run_id == ReconciliationRun.id)
        .where(ReconciliationRun.client_id == ctx.active_client.id)
        .where(MatchResult.bucket.in_([BucketEnum.mismatched, BucketEnum.missing_in_portal]))
    ).scalar() or 0
    
    return {
        "totalItcAvailable": float(total_itc),
        "safeToClaim": float(safe_to_claim),
        "atRisk": float(at_risk),
        "vendorsActionRequired": vendors_action_req
    }

@router.get("/runs/{id}/results")
def get_run_results(id: uuid.UUID, ctx: TenantContext = Depends(require_active_client), db: Session = Depends(get_db)):
    # Simple join to get PR or Portal invoice details for display
    matches = db.execute(
        select(MatchResult, PurchaseInvoice, PortalInvoice)
        .outerjoin(PurchaseInvoice, MatchResult.purchase_invoice_id == PurchaseInvoice.id)
        .outerjoin(PortalInvoice, MatchResult.portal_invoice_id == PortalInvoice.id)
        .where(MatchResult.run_id == id)
    ).all()
    
    items = []
    for m, pr, po in matches:
        # Prefer PR details, fallback to Portal details
        inv = pr or po
        if inv:
            items.append({
                "id": str(m.id),
                "bucket": m.bucket.value,
                "tax_diff": float(m.tax_diff) if m.tax_diff else 0.0,
                "vendor_name": inv.supplier_name,
                "gstin": inv.supplier_gstin,
                "invoice_no": inv.invoice_number,
                "date": str(inv.invoice_date),
                "pr_tax": float(pr.total_tax) if pr else 0.0,
                "po_tax": float(po.total_tax) if po else 0.0
            })
            
    return {"items": items, "total": len(items), "page": 1, "page_size": 100}

@router.get("/runs/{id}/probable")
def get_probable_matches(id: uuid.UUID, ctx: TenantContext = Depends(require_active_client), db: Session = Depends(get_db)):
    matches = db.execute(
        select(MatchResult, PurchaseInvoice, PortalInvoice)
        .outerjoin(PurchaseInvoice, MatchResult.purchase_invoice_id == PurchaseInvoice.id)
        .outerjoin(PortalInvoice, MatchResult.portal_invoice_id == PortalInvoice.id)
        .where(MatchResult.run_id == id)
        .where(MatchResult.bucket == BucketEnum.probable)
        .where(MatchResult.review_status == "pending")
    ).all()
    
    items = []
    for m, pr, po in matches:
        items.append({
            "id": str(m.id),
            "confidence": m.confidence,
            "pr_record": {
                "vendor": pr.supplier_name if pr else "Unknown",
                "gstin": pr.supplier_gstin if pr else "Unknown",
                "invoice_no": pr.invoice_number if pr else "N/A",
                "date": str(pr.invoice_date) if pr else "N/A",
                "tax": float(pr.total_tax) if pr else 0.0
            } if pr else None,
            "portal_record": {
                "vendor": po.supplier_name if po else "Unknown",
                "gstin": po.supplier_gstin if po else "Unknown",
                "invoice_no": po.invoice_number if po else "N/A",
                "date": str(po.invoice_date) if po else "N/A",
                "tax": float(po.total_tax) if po else 0.0
            } if po else None
        })
        
    return {"items": items}

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
