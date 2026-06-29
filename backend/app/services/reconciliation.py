from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.models import ReconciliationRun, PurchaseInvoice, PortalInvoice, MatchResult
from app.services.audit import log_audit
from app.services.matching_engine import run_matching
from app.core.logging import get_logger

logger = get_logger(__name__)

def run_reconciliation(run_id: UUID, db: Session = None) -> None:
    if db is None:
        db = SessionLocal()
        close_db = True
    else:
        close_db = False
    try:
        run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
        if not run:
            logger.error(f"ReconciliationRun {run_id} not found")
            return
        
        # Step 1: transition status to "matching"
        run.status = "matching"
        db.commit()
        log_audit(
            db=db,
            org_id=run.org_id,
            run_id=run.id,
            action="start_matching",
            entity_type="reconciliation_run",
            entity_id=run.id,
            details={"status": run.status}
        )
        
        # Fetch PR Invoices
        pr_rows = db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_id).all()
        pr_dicts = [{
            "id": row.id,
            "supplier_gstin": row.supplier_gstin,
            "invoice_no": row.invoice_no,
            "invoice_no_norm": row.invoice_no_norm,
            "invoice_date": row.invoice_date,
            "cgst": row.cgst,
            "sgst": row.sgst,
            "igst": row.igst,
            "cess": row.cess,
            "total_tax": row.total_tax,
        } for row in pr_rows]

        # Fetch Portal Invoices
        po_rows = db.query(PortalInvoice).filter(PortalInvoice.run_id == run_id).all()
        po_dicts = [{
            "id": row.id,
            "supplier_gstin": row.supplier_gstin,
            "invoice_no": row.invoice_no,
            "invoice_no_norm": row.invoice_no_norm,
            "invoice_date": row.invoice_date,
            "cgst": row.cgst,
            "sgst": row.sgst,
            "igst": row.igst,
            "cess": row.cess,
            "total_tax": row.total_tax,
        } for row in po_rows]
        
        # Run Matching Logic
        results = run_matching(pr_dicts, po_dicts)
        
        # Persist MatchResults
        db_results = [
            MatchResult(
                org_id=run.org_id,
                run_id=run.id,
                purchase_invoice_id=res["purchase_invoice_id"],
                portal_invoice_id=res["portal_invoice_id"],
                bucket=res["bucket"],
                match_pass=res["match_pass"],
                confidence=res["confidence"],
                tax_diff=res["tax_diff"],
                status=res["status"]
            )
            for res in results
        ]
        db.bulk_save_objects(db_results)

        # Step 2: transition status to "completed"
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        db.commit()
        
        log_audit(
            db=db,
            org_id=run.org_id,
            run_id=run.id,
            action="complete_matching",
            entity_type="reconciliation_run",
            entity_id=run.id,
            details={
                "status": run.status,
                "matches": len(results)
            }
        )
        logger.info(f"ReconciliationRun {run_id} completed successfully. Generated {len(results)} match results.")
        
    except Exception as e:
        logger.exception(f"Error during reconciliation run {run_id}")
        db.rollback()
    finally:
        if close_db:
            db.close()
