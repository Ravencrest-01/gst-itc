import uuid
import re
from sqlalchemy.orm import Session
from app.models.models import (
    ReconciliationRun, UploadedFile, PurchaseInvoice, PortalInvoice, 
    MatchResult, Bucket, MatchPass, FileKind, RunStatus
)
from app.services.parser import parse_purchase_register, parse_gstr2b

def normalize_invoice_number(inv: str) -> str:
    """Strips special characters and leading zeros for fuzzy matching"""
    if not inv: return ""
    inv = re.sub(r'[^A-Za-z0-9]', '', str(inv))
    return inv.lstrip('0').upper()

def run_reconciliation(run_id: uuid.UUID, db: Session):
    run = db.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    if not run:
        return
        
    run.status = RunStatus.pending
    db.commit()
    
    try:
        # Clear existing data for this run (if any)
        db.query(MatchResult).filter(MatchResult.run_id == run_id).delete()
        db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_id).delete()
        db.query(PortalInvoice).filter(PortalInvoice.run_id == run_id).delete()
        db.commit()
        
        # Get uploaded files for this run
        files = db.query(UploadedFile).filter(UploadedFile.run_id == run_id).all()
        pr_files = [f for f in files if f.kind == FileKind.purchase_register]
        g2b_files = [f for f in files if f.kind == FileKind.gstr_2b]
        
        # Parse Purchase Register
        pr_invoices = []
        for pr_file in pr_files:
            parsed = parse_purchase_register(pr_file.storage_url)
            for p in parsed:
                inv = PurchaseInvoice(
                    run_id=run.id,
                    client_id=run.client_id,
                    source_file_id=pr_file.id,
                    supplier_gstin=p['supplier_gstin'],
                    supplier_name=p['supplier_name'],
                    invoice_number=p['invoice_number'],
                    invoice_date=p['invoice_date'],
                    taxable_value=p['taxable_value'],
                    total_tax=p['total_tax']
                )
                db.add(inv)
                pr_invoices.append(inv)
                
        # Parse GSTR-2B
        portal_invoices = []
        for g2b_file in g2b_files:
            parsed = parse_gstr2b(g2b_file.storage_url)
            for p in parsed:
                inv = PortalInvoice(
                    run_id=run.id,
                    client_id=run.client_id,
                    source_file_id=g2b_file.id,
                    supplier_gstin=p['supplier_gstin'],
                    supplier_name=p['supplier_name'],
                    invoice_number=p['invoice_number'],
                    invoice_date=p['invoice_date'],
                    taxable_value=p['taxable_value'],
                    total_tax=p['total_tax']
                )
                db.add(inv)
                portal_invoices.append(inv)
                
        db.commit()
        
        # Match Engine
        # Reload from DB to get IDs
        pr_list = db.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_id).all()
        po_list = db.query(PortalInvoice).filter(PortalInvoice.run_id == run_id).all()
        
        unmatched_pr = {p.id: p for p in pr_list}
        unmatched_po = {p.id: p for p in po_list}
        
        # Pass 1: Exact Match (Invoice Number exact, Tax within 1 Rs)
        for po_id, po in list(unmatched_po.items()):
            for pr_id, pr in list(unmatched_pr.items()):
                if po.invoice_number.strip().upper() == pr.invoice_number.strip().upper():
                    tax_diff = abs(po.total_tax - pr.total_tax)
                    if tax_diff <= 1.0:
                        res = MatchResult(
                            run_id=run.id,
                            client_id=run.client_id,
                            purchase_invoice_id=pr.id,
                            portal_invoice_id=po.id,
                            bucket=Bucket.matched,
                            match_pass=MatchPass.exact,
                            confidence=1.0,
                            tax_diff=tax_diff
                        )
                        db.add(res)
                        del unmatched_po[po_id]
                        del unmatched_pr[pr_id]
                        break
                        
        # Pass 2: Normalized Match (Ignore special chars and leading zeros)
        for po_id, po in list(unmatched_po.items()):
            po_norm = normalize_invoice_number(po.invoice_number)
            for pr_id, pr in list(unmatched_pr.items()):
                pr_norm = normalize_invoice_number(pr.invoice_number)
                if po_norm == pr_norm and po_norm != "":
                    tax_diff = abs(po.total_tax - pr.total_tax)
                    if tax_diff <= 10.0:
                        bucket = Bucket.matched if tax_diff <= 1.0 else Bucket.probable
                        res = MatchResult(
                            run_id=run.id,
                            client_id=run.client_id,
                            purchase_invoice_id=pr.id,
                            portal_invoice_id=po.id,
                            bucket=bucket,
                            match_pass=MatchPass.normalized,
                            confidence=0.8,
                            tax_diff=tax_diff
                        )
                        db.add(res)
                        del unmatched_po[po_id]
                        del unmatched_pr[pr_id]
                        break
                        
        # Remaining PR are Missing in Portal
        for pr_id, pr in unmatched_pr.items():
            db.add(MatchResult(
                run_id=run.id,
                client_id=run.client_id,
                purchase_invoice_id=pr.id,
                portal_invoice_id=None,
                bucket=Bucket.missing_in_portal,
                tax_diff=-pr.total_tax
            ))
            
        # Remaining PO are Missing in Books
        for po_id, po in unmatched_po.items():
            db.add(MatchResult(
                run_id=run.id,
                client_id=run.client_id,
                purchase_invoice_id=None,
                portal_invoice_id=po.id,
                bucket=Bucket.missing_in_books,
                tax_diff=po.total_tax
            ))
            
        run.status = RunStatus.completed
        db.commit()
        
    except Exception as e:
        db.rollback()
        run.status = RunStatus.failed
        db.commit()
        raise e
