import io
import pytest
from datetime import date
from decimal import Decimal
from app.models.models import ReconciliationRun, PurchaseInvoice, PortalInvoice, MatchResult

def test_full_orchestrator_flow(client, auth_headers, db_session):
    # Step 1: Create a run
    payload = {"tax_period": "2026-06"}
    response = client.post("/runs", json=payload, headers=auth_headers)
    assert response.status_code == 201
    run_id = response.json()["id"]

    # Step 2: Upload PR
    pr_csv = (
        "GSTIN,Invoice Number,Invoice Date,Taxable Value,CGST,SGST,IGST,Cess\n"
        "27AADCB2230M1Z2,INV/001,01-04-2026,1000.00,90.00,90.00,0.00,0.00\n"
        "27AADCB2230M1Z2,INV/002,02-04-2026,2000.00,0.00,0.00,360.00,0.00\n" # Missing in portal
    ).encode("utf-8")
    
    upload_pr_res = client.post(
        f"/runs/{run_id}/upload",
        data={"file_type": "PR"},
        files={"file": ("pr.csv", io.BytesIO(pr_csv), "text/csv")},
        headers=auth_headers
    )
    assert upload_pr_res.status_code == 201
    
    # Step 3: Upload 2B
    po_json = (
        '[\n'
        '  {\n'
        '    "supplier_gstin": "27AADCB2230M1Z2",\n'
        '    "invoice_no": "INV/001",\n'
        '    "invoice_date": "01-04-2026",\n'
        '    "taxable_value": 1000.00,\n'
        '    "cgst": 90.00,\n'
        '    "sgst": 90.00,\n'
        '    "igst": 0.00,\n'
        '    "cess": 0.00,\n'
        '    "filing_period": "2026-04"\n'
        '  },\n'
        '  {\n'
        '    "supplier_gstin": "27AADCB2230M1Z2",\n'
        '    "invoice_no": "INV/003",\n' # Missing in books
        '    "invoice_date": "03-04-2026",\n'
        '    "taxable_value": 500.00,\n'
        '    "cgst": 45.00,\n'
        '    "sgst": 45.00,\n'
        '    "igst": 0.00,\n'
        '    "cess": 0.00,\n'
        '    "filing_period": "2026-04"\n'
        '  }\n'
        ']'
    ).encode("utf-8")
    
    upload_po_res = client.post(
        f"/runs/{run_id}/upload",
        data={"file_type": "2B"},
        files={"file": ("2b.json", io.BytesIO(po_json), "application/json")},
        headers=auth_headers
    )
    assert upload_po_res.status_code == 201

    # Step 4: Run Orchestrator
    recon_res = client.post(f"/runs/{run_id}/reconcile", headers=auth_headers)
    assert recon_res.status_code == 202

    # Verify Results
    db_session.expire_all()
    
    # Wait / assure completion
    run = db_session.query(ReconciliationRun).filter(ReconciliationRun.id == run_id).first()
    assert run.status == "completed"
    
    results = db_session.query(MatchResult).filter(MatchResult.run_id == run_id).all()
    assert len(results) == 3
    
    matched = [r for r in results if r.bucket == "matched"]
    missing_in_portal = [r for r in results if r.bucket == "missing_in_portal"]
    missing_in_books = [r for r in results if r.bucket == "missing_in_books"]
    
    assert len(matched) == 1
    assert len(missing_in_portal) == 1
    assert len(missing_in_books) == 1
    
    assert matched[0].match_pass == "exact"
    assert matched[0].tax_diff == Decimal("0.00")
    assert missing_in_portal[0].tax_diff == Decimal("360.00") # from PR tax
    assert missing_in_books[0].tax_diff == Decimal("-90.00") # from Portal tax (45+45)
