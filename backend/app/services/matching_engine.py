from decimal import Decimal
from typing import List, Dict, Any

def run_matching(pr_invoices: List[Dict[str, Any]], portal_invoices: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Core pure function for matching PR invoices against Portal (GSTR-2B) invoices.
    Expects invoices to be dictionaries with keys:
    - id
    - supplier_gstin
    - invoice_no
    - invoice_no_norm
    - invoice_date
    - cgst, sgst, igst, cess
    
    Returns a list of MatchResult dictionaries.
    """
    
    # We will mutate local copies of the lists to remove matched items
    unmatched_pr = list(pr_invoices)
    unmatched_portal = list(portal_invoices)
    
    results = []
    
    # Helper to compare taxes exactly
    def taxes_match(pr: Dict[str, Any], po: Dict[str, Any]) -> bool:
        return (
            pr.get('cgst', Decimal('0.00')) == po.get('cgst', Decimal('0.00')) and
            pr.get('sgst', Decimal('0.00')) == po.get('sgst', Decimal('0.00')) and
            pr.get('igst', Decimal('0.00')) == po.get('igst', Decimal('0.00')) and
            pr.get('cess', Decimal('0.00')) == po.get('cess', Decimal('0.00'))
        )

    # PASS 1: EXACT MATCH
    # Compare GSTIN + invoice_no + date + tax heads
    
    pass1_pr_remaining = []
    
    for pr in unmatched_pr:
        matched = False
        for po in unmatched_portal:
            if (
                pr.get('supplier_gstin') == po.get('supplier_gstin') and
                pr.get('invoice_no') == po.get('invoice_no') and
                pr.get('invoice_date') == po.get('invoice_date') and
                taxes_match(pr, po)
            ):
                results.append({
                    "purchase_invoice_id": pr.get('id'),
                    "portal_invoice_id": po.get('id'),
                    "bucket": "matched",
                    "match_pass": "exact",
                    "confidence": 1.0,
                    "tax_diff": Decimal('0.00'),
                    "status": "auto"
                })
                unmatched_portal.remove(po)
                matched = True
                break
        
        if not matched:
            pass1_pr_remaining.append(pr)

    # PASS 2: NORMALIZED MATCH
    # Compare GSTIN + invoice_no_norm + date + tax heads
    
    pass2_pr_remaining = []
    
    for pr in pass1_pr_remaining:
        matched = False
        for po in unmatched_portal:
            # Skip if normalized numbers are missing or empty
            pr_norm = pr.get('invoice_no_norm')
            po_norm = po.get('invoice_no_norm')
            if not pr_norm or not po_norm:
                continue
                
            if (
                pr.get('supplier_gstin') == po.get('supplier_gstin') and
                pr_norm == po_norm and
                pr.get('invoice_date') == po.get('invoice_date') and
                taxes_match(pr, po)
            ):
                results.append({
                    "purchase_invoice_id": pr.get('id'),
                    "portal_invoice_id": po.get('id'),
                    "bucket": "matched",
                    "match_pass": "normalized",
                    "confidence": 1.0,
                    "tax_diff": Decimal('0.00'),
                    "status": "auto"
                })
                unmatched_portal.remove(po)
                matched = True
                break
                
        if not matched:
            pass2_pr_remaining.append(pr)
            
    # BUCKET LEFTOVERS
    
    # Missing in Portal (PR items not matched)
    for pr in pass2_pr_remaining:
        results.append({
            "purchase_invoice_id": pr.get('id'),
            "portal_invoice_id": None,
            "bucket": "missing_in_portal",
            "match_pass": "none",
            "confidence": 0.0,
            "tax_diff": pr.get('total_tax', Decimal('0.00')), # They owe us this tax
            "status": "auto"
        })
        
    # Missing in Books (Portal items not matched)
    for po in unmatched_portal:
        results.append({
            "purchase_invoice_id": None,
            "portal_invoice_id": po.get('id'),
            "bucket": "missing_in_books",
            "match_pass": "none",
            "confidence": 0.0,
            "tax_diff": -po.get('total_tax', Decimal('0.00')), # We didn't claim this tax
            "status": "auto"
        })

    return results
