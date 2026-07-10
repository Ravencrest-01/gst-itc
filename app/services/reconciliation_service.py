import uuid
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.domain import ReconciliationRun, PurchaseInvoice, PortalInvoice, MatchResult, UploadedFile
from app.models.enums import RunStatusEnum, BucketEnum, MatchPassEnum, ReviewStatusEnum

from app.services.reconciliation import (
    ingest_file, reconcile, ReconciliationConfig,
    IngestionResult, IngestionError,
    NormalizedInvoice, MatchResult as EngineMatchResult
)

def process_file_upload(db: Session, file_id: uuid.UUID) -> Dict[str, Any]:
    """
    Adapter: Reads a file from DB/disk, ingests it via pure engine, and saves to DB.
    """
    db_file = db.query(UploadedFile).filter(UploadedFile.id == file_id).first()
    if not db_file:
        raise ValueError("File not found")
        
    config = ReconciliationConfig()
    try:
        result = ingest_file(db_file.storage_path, kind=db_file.kind.value, config=config)
    except IngestionError as e:
        db_file.row_count = 0
        db.commit()
        raise ValueError(f"Ingestion failed: {str(e)}")
        
    # Update file stats
    db_file.row_count = result.row_count
    db.commit()
    
    return {
        "status": "success",
        "format": result.detected_format,
        "sheet": result.detected_sheet,
        "mapped_columns": result.mapped_columns,
        "row_count": result.row_count,
        "skipped": len(result.skipped_rows)
    }

def run_reconciliation(db: Session, run_id: uuid.UUID) -> int:
    """
    Adapter: Extracts rows from DB, runs pure engine reconcile(), persists results.
    """
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    if not run:
        raise ValueError("Run not found")
        
    # Clear existing matches for idempotency
    db.query(MatchResult).filter(MatchResult.run_id == run_id).delete()
    db.commit()
    
    pr_invoices = db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_id).all()
    twob_invoices = db.query(PortalInvoice).filter(PortalInvoice.run_id == run_id).all()
    
    # Map DB models to Engine Dataclasses
    def _to_norm(inv) -> NormalizedInvoice:
        return NormalizedInvoice(
            raw_data={"id": str(inv.id)}, # Store DB ID for back-reference
            supplier_gstin=inv.supplier_gstin,
            supplier_name=inv.supplier_name,
            invoice_number=inv.invoice_number,
            invoice_number_norm=inv.invoice_number_norm,
            invoice_date=inv.invoice_date,
            taxable_value=inv.taxable_value,
            cgst=inv.cgst,
            sgst=inv.sgst,
            igst=inv.igst,
            cess=inv.cess,
            total_tax=inv.total_tax
        )
        
    pr_rows = [_to_norm(i) for i in pr_invoices]
    twob_rows = [_to_norm(i) for i in twob_invoices]
    
    # Run the pure engine
    config = ReconciliationConfig()
    engine_matches, summary = reconcile(pr_rows, twob_rows, config)
    
    # Map back to DB models
    db_matches = []
    for em in engine_matches:
        pr_id = uuid.UUID(em.purchase_invoice.raw_data["id"]) if em.purchase_invoice else None
        po_id = uuid.UUID(em.portal_invoice.raw_data["id"]) if em.portal_invoice else None
        
        db_matches.append(MatchResult(
            run_id=run_id,
            purchase_invoice_id=pr_id,
            portal_invoice_id=po_id,
            bucket=BucketEnum(em.bucket.value),
            match_pass=MatchPassEnum(em.match_pass.value) if em.match_pass else None,
            confidence=em.confidence,
            tax_diff=em.tax_diff,
            review_status=ReviewStatusEnum(em.review_status.value)
        ))
        
    db.bulk_save_objects(db_matches)
    
    # Update run status
    run.status = RunStatusEnum.completed
    run.total_records = len(db_matches)
    db.commit()
    
    return len(db_matches)
