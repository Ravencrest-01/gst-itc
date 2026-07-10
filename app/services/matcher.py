import uuid
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models.domain import ReconciliationRun, PurchaseInvoice, PortalInvoice, MatchResult
from app.models.enums import BucketEnum, MatchPassEnum, ReviewStatusEnum

def run_reconciliation_pass(db: Session, run_id: uuid.UUID):
    """
    Executes the 4-pass reconciliation engine.
    Idempotent: clears existing matches for the run before starting.
    """
    # 0. Clean previous matches for this run if idempotent retry
    db.query(MatchResult).filter(MatchResult.run_id == run_id).delete(synchronize_session=False)
    db.commit()
    
    pr_invoices = db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_id).all()
    portal_invoices = db.query(PortalInvoice).filter(PortalInvoice.run_id == run_id).all()
    
    # Tracking unmatched
    unmatched_pr = {inv.id: inv for inv in pr_invoices}
    unmatched_portal = {inv.id: inv for inv in portal_invoices}
    
    results: List[MatchResult] = []
    
    # Configurable tolerance (could be pulled from client settings in a real app)
    TOLERANCE_AMT = 5.0 

    def create_match(pr_inv, po_inv, bucket: BucketEnum, match_pass: MatchPassEnum, confidence: float, tax_diff: float):
        results.append(MatchResult(
            run_id=run_id,
            purchase_invoice_id=pr_inv.id if pr_inv else None,
            portal_invoice_id=po_inv.id if po_inv else None,
            bucket=bucket,
            match_pass=match_pass,
            confidence=confidence,
            tax_diff=tax_diff,
            review_status=ReviewStatusEnum.pending if bucket == BucketEnum.probable else ReviewStatusEnum.confirmed
        ))
        if pr_inv and pr_inv.id in unmatched_pr: del unmatched_pr[pr_inv.id]
        if po_inv and po_inv.id in unmatched_portal: del unmatched_portal[po_inv.id]

    # Index portal invoices by normalized invoice number
    portal_by_norm = {}
    for inv in portal_invoices:
        portal_by_norm.setdefault(inv.invoice_number_norm, []).append(inv)
        
    # PASS 1: Exact Match (GSTIN + Norm Inv + Date + Exact Tax)
    for pr_id, pr_inv in list(unmatched_pr.items()):
        candidates = portal_by_norm.get(pr_inv.invoice_number_norm, [])
        for po_inv in candidates:
            if po_inv.id in unmatched_portal:
                if (pr_inv.supplier_gstin == po_inv.supplier_gstin and 
                    pr_inv.invoice_date == po_inv.invoice_date and 
                    abs(float(pr_inv.total_tax) - float(po_inv.total_tax)) <= 0.01):
                    create_match(pr_inv, po_inv, BucketEnum.matched, MatchPassEnum.exact, 100.0, 0.0)
                    break

    # PASS 2: Normalized Match (GSTIN + Norm Inv + Minor tax diff)
    for pr_id, pr_inv in list(unmatched_pr.items()):
        candidates = portal_by_norm.get(pr_inv.invoice_number_norm, [])
        for po_inv in candidates:
            if po_inv.id in unmatched_portal and pr_inv.supplier_gstin == po_inv.supplier_gstin:
                diff = float(pr_inv.total_tax) - float(po_inv.total_tax)
                if abs(diff) <= TOLERANCE_AMT:
                    # Within tolerance -> matched
                    create_match(pr_inv, po_inv, BucketEnum.matched, MatchPassEnum.tolerance, 95.0, diff)
                    break
                else:
                    # Outside tolerance -> mismatched
                    create_match(pr_inv, po_inv, BucketEnum.mismatched, MatchPassEnum.normalized, 90.0, diff)
                    break

    # PASS 3: Fuzzy / Probable Match (GSTIN + Amount Match, mismatched invoice number)
    # Re-index remaining portal invoices by GSTIN
    portal_by_gstin = {}
    for po_id, po_inv in unmatched_portal.items():
        portal_by_gstin.setdefault(po_inv.supplier_gstin, []).append(po_inv)
        
    for pr_id, pr_inv in list(unmatched_pr.items()):
        candidates = portal_by_gstin.get(pr_inv.supplier_gstin, [])
        for po_inv in candidates:
            if po_inv.id in unmatched_portal:
                diff = float(pr_inv.total_tax) - float(po_inv.total_tax)
                if abs(diff) <= TOLERANCE_AMT and pr_inv.invoice_date == po_inv.invoice_date:
                    # Same GSTIN, Date, and Amount... invoice number must be slightly off. Probable!
                    create_match(pr_inv, po_inv, BucketEnum.probable, MatchPassEnum.fuzzy, 80.0, diff)
                    break

    # PASS 4: Reverse Sweep (Missing in Portal vs Missing in Books)
    for pr_id, pr_inv in unmatched_pr.items():
        create_match(pr_inv, None, BucketEnum.missing_in_portal, None, 0.0, float(pr_inv.total_tax))
        
    for po_id, po_inv in unmatched_portal.items():
        create_match(None, po_inv, BucketEnum.missing_in_books, None, 0.0, float(po_inv.total_tax))
        
    # Bulk insert all match results
    db.bulk_save_objects(results)
    db.commit()
    return len(results)
