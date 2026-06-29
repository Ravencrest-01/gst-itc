from datetime import date
from decimal import Decimal
from app.services.matching_engine import run_matching

def test_matching_engine_exact_match():
    pr = [
        {
            "id": "pr-1",
            "supplier_gstin": "27AADCB2230M1Z2",
            "invoice_no": "INV/001",
            "invoice_no_norm": "INV001",
            "invoice_date": date(2026, 4, 1),
            "cgst": Decimal("100.00"),
            "sgst": Decimal("100.00"),
            "igst": Decimal("0.00"),
            "cess": Decimal("0.00"),
            "total_tax": Decimal("200.00")
        }
    ]
    portal = [
        {
            "id": "po-1",
            "supplier_gstin": "27AADCB2230M1Z2",
            "invoice_no": "INV/001",
            "invoice_no_norm": "INV001",
            "invoice_date": date(2026, 4, 1),
            "cgst": Decimal("100.00"),
            "sgst": Decimal("100.00"),
            "igst": Decimal("0.00"),
            "cess": Decimal("0.00"),
            "total_tax": Decimal("200.00")
        }
    ]
    
    results = run_matching(pr, portal)
    assert len(results) == 1
    assert results[0]["bucket"] == "matched"
    assert results[0]["match_pass"] == "exact"
    assert results[0]["purchase_invoice_id"] == "pr-1"
    assert results[0]["portal_invoice_id"] == "po-1"

def test_matching_engine_normalized_match():
    pr = [
        {
            "id": "pr-2",
            "supplier_gstin": "27AADCB2230M1Z2",
            "invoice_no": "INV/26-27/042",
            "invoice_no_norm": "INV2627042",
            "invoice_date": date(2026, 4, 2),
            "cgst": Decimal("50.00"),
            "sgst": Decimal("50.00"),
            "igst": Decimal("0.00"),
            "cess": Decimal("0.00"),
            "total_tax": Decimal("100.00")
        }
    ]
    portal = [
        {
            "id": "po-2",
            "supplier_gstin": "27AADCB2230M1Z2",
            "invoice_no": "26-27-42", # Different exact number
            "invoice_no_norm": "INV2627042", # Same normalized number!
            "invoice_date": date(2026, 4, 2),
            "cgst": Decimal("50.00"),
            "sgst": Decimal("50.00"),
            "igst": Decimal("0.00"),
            "cess": Decimal("0.00"),
            "total_tax": Decimal("100.00")
        }
    ]
    
    results = run_matching(pr, portal)
    assert len(results) == 1
    assert results[0]["bucket"] == "matched"
    assert results[0]["match_pass"] == "normalized"

def test_matching_engine_missing_in_portal_and_books():
    pr = [
        {
            "id": "pr-3",
            "supplier_gstin": "27XYZ",
            "invoice_no": "INV/003",
            "invoice_no_norm": "INV003",
            "invoice_date": date(2026, 4, 3),
            "cgst": Decimal("10.00"),
            "sgst": Decimal("10.00"),
            "total_tax": Decimal("20.00")
        }
    ]
    portal = [
        {
            "id": "po-4",
            "supplier_gstin": "27ABC",
            "invoice_no": "INV/004",
            "invoice_no_norm": "INV004",
            "invoice_date": date(2026, 4, 4),
            "cgst": Decimal("5.00"),
            "sgst": Decimal("5.00"),
            "total_tax": Decimal("10.00")
        }
    ]
    
    results = run_matching(pr, portal)
    assert len(results) == 2
    
    missing_portal = next(r for r in results if r["bucket"] == "missing_in_portal")
    assert missing_portal["purchase_invoice_id"] == "pr-3"
    assert missing_portal["portal_invoice_id"] is None
    assert missing_portal["tax_diff"] == Decimal("20.00")
    
    missing_books = next(r for r in results if r["bucket"] == "missing_in_books")
    assert missing_books["purchase_invoice_id"] is None
    assert missing_books["portal_invoice_id"] == "po-4"
    assert missing_books["tax_diff"] == Decimal("-10.00")
