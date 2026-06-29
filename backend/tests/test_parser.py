import io
from datetime import date
from decimal import Decimal
from app.models.models import ReconciliationRun, PurchaseInvoice, PortalInvoice, UploadedFile, AuditLog
from app.services.parser import parse_pr, parse_2b

def test_pure_csv_parser():
    csv_data = (
        "GSTIN,Invoice Number,Invoice Date,Taxable Value,CGST,SGST,IGST,Cess\n"
        "27AADCB2230M1Z2,INV/001,01-04-2026,1000.00,90.00,90.00,0.00,0.00\n"
        "27AADCB2230M1Z2, INV/002 ,02-04-2026,2000.00,0.00,0.00,360.00,0.00\n"
    ).encode("utf-8")
    
    records = parse_pr(csv_data)
    assert len(records) == 2
    
    assert records[0]["supplier_gstin"] == "27AADCB2230M1Z2"
    assert records[0]["invoice_no"] == "INV/001"
    assert records[0]["invoice_no_norm"] == "INV001"
    assert records[0]["invoice_date"] == date(2026, 4, 1)
    assert records[0]["taxable_value"] == Decimal("1000.00")
    assert records[0]["cgst"] == Decimal("90.00")
    assert records[0]["sgst"] == Decimal("90.00")
    assert records[0]["igst"] == Decimal("0.00")
    assert records[0]["cess"] == Decimal("0.00")
    assert records[0]["total_tax"] == Decimal("180.00")
    
    assert records[1]["invoice_no"] == "INV/002"
    assert records[1]["invoice_no_norm"] == "INV002"

def test_pure_json_2b_parser_flat():
    json_data = (
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
        '  }\n'
        ']'
    ).encode("utf-8")
    
    records = parse_2b(json_data, is_json=True)
    assert len(records) == 1
    assert records[0]["supplier_gstin"] == "27AADCB2230M1Z2"
    assert records[0]["invoice_no"] == "INV/001"
    assert records[0]["invoice_no_norm"] == "INV001"
    assert records[0]["invoice_date"] == date(2026, 4, 1)
    assert records[0]["filing_period"] == "2026-04"

def test_pure_json_2b_parser_gov():
    # Nested government GSTR-2B JSON
    json_data = (
        '{\n'
        '  "data": {\n'
        '    "doclist": [\n'
        '      {\n'
        '        "ctin": "27AADCB2230M1Z2",\n'
        '        "inv": [\n'
        '          {\n'
        '            "inum": "INV-100",\n'
        '            "idt": "15-04-2026",\n'
        '            "val": 1180.00,\n'
        '            "fp": "2026-04",\n'
        '            "itms": [\n'
        '              {\n'
        '                "itm_det": {\n'
        '                  "txval": 1000.00,\n'
        '                  "cgst": 90.00,\n'
        '                  "sgst": 90.00\n'
        '                }\n'
        '              }\n'
        '            ]\n'
        '          }\n'
        '        ]\n'
        '      }\n'
        '    ]\n'
        '  }\n'
        '}'
    ).encode("utf-8")
    
    records = parse_2b(json_data, is_json=True)
    assert len(records) == 1
    assert records[0]["supplier_gstin"] == "27AADCB2230M1Z2"
    assert records[0]["invoice_no"] == "INV-100"
    assert records[0]["invoice_no_norm"] == "INV100"
    assert records[0]["invoice_date"] == date(2026, 4, 15)
    assert records[0]["cgst"] == Decimal("90.00")
    assert records[0]["sgst"] == Decimal("90.00")
    assert records[0]["igst"] == Decimal("0.00")
    assert records[0]["filing_period"] == "2026-04"

def test_upload_api_flow(client, auth_headers, db_session):
    # Step 1: Create reconciliation run
    run_response = client.post("/runs", json={"tax_period": "2026-04"}, headers=auth_headers)
    assert run_response.status_code == 201
    run_id = run_response.json()["id"]
    
    # Step 2: Upload PR CSV
    csv_file = io.BytesIO(
        b"GSTIN,Invoice Number,Invoice Date,Taxable Value,CGST,SGST,IGST,Cess\n"
        b"27AADCB2230M1Z2,INV/001,01-04-2026,1000.00,90.00,90.00,0.00,0.00\n"
    )
    
    upload_response = client.post(
        f"/runs/{run_id}/upload",
        data={"file_type": "PR"},
        files={"file": ("pr_file.csv", csv_file, "text/csv")},
        headers=auth_headers
    )
    assert upload_response.status_code == 201
    res_data = upload_response.json()
    assert res_data["row_count"] == 1
    
    # Verify in DB
    db_session.expire_all()
    invoices = db_session.query(PurchaseInvoice).filter(PurchaseInvoice.run_id == run_id).all()
    assert len(invoices) == 1
    assert invoices[0].invoice_no == "INV/001"
    assert invoices[0].invoice_no_norm == "INV001"
    
    # Verify UploadedFile
    uploaded_file = db_session.query(UploadedFile).filter(UploadedFile.run_id == run_id).first()
    assert uploaded_file is not None
    assert uploaded_file.file_type == "PR"
    assert uploaded_file.row_count == 1
    
    # Verify Audit Log
    audit = db_session.query(AuditLog).filter(
        AuditLog.run_id == run_id,
        AuditLog.action == "upload_file"
    ).first()
    assert audit is not None
    assert audit.details["file_type"] == "PR"
