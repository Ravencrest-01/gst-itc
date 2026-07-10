import json
import pytest
from decimal import Decimal
from datetime import date
from io import BytesIO

from app.services.reconciliation.config import ReconciliationConfig
from app.services.reconciliation.buckets import BucketEnum, MatchPassEnum
from app.services.reconciliation.models import NormalizedInvoice
from app.services.reconciliation.normalize import clean_gstin, clean_invoice_number, parse_date, parse_amount
from app.services.reconciliation.ingestion import ingest_file
from app.services.reconciliation.matcher import reconcile

def test_normalization():
    assert clean_gstin(" 27ABCDE1234F1Z5 ") == "27ABCDE1234F1Z5"
    assert clean_invoice_number("INV/2023-01") == "INV202301"
    assert clean_invoice_number("000123") == "123"
    
    assert parse_date("25-12-2023") == date(2023, 12, 25)
    assert parse_date("2023-12-25") == date(2023, 12, 25)
    assert parse_date("45286") == date(2023, 12, 26) # Excel serial
    
    assert parse_amount("₹1,23,456.00") == Decimal("123456.00")
    assert parse_amount("(500.50)") == Decimal("-500.50")
    assert parse_amount("-500.50") == Decimal("-500.50")

def test_json_ingestion():
    gstr2b_json = {
        "data": {
            "docdata": {
                "b2b": [
                    {
                        "ctin": "27ABCDE1234F1Z5",
                        "trdnm": "Test Supplier",
                        "inv": [
                            {
                                "inum": "INV-01",
                                "dt": "25-12-2023",
                                "items": [
                                    {"txval": 1000, "igst": 180, "cgst": 0, "sgst": 0, "cess": 0}
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    }
    file_bytes = json.dumps(gstr2b_json).encode('utf-8')
    res = ingest_file(file_bytes, "gstr_2b")
    assert res.row_count == 1
    inv = res.rows[0]
    assert inv.supplier_gstin == "27ABCDE1234F1Z5"
    assert inv.invoice_number_norm == "INV01"
    assert inv.invoice_date == date(2023, 12, 25)
    assert inv.taxable_value == Decimal("1000")
    assert inv.total_tax == Decimal("180")

def test_csv_ingestion():
    csv_data = "Supplier GST No,Invoice No,Date of Invoice,Taxable Value,CGST,SGST\n27ABCDE1234F1Z5,INV-01,25-12-2023,1000,90,90"
    res = ingest_file(csv_data.encode('utf-8'), "purchase_register")
    assert res.row_count == 1
    inv = res.rows[0]
    assert inv.supplier_gstin == "27ABCDE1234F1Z5"
    assert inv.invoice_number_norm == "INV01"
    assert inv.total_tax == Decimal("180")

def test_matcher_pipeline():
    pr_rows = [
        # Exact match
        NormalizedInvoice(supplier_gstin="11A", invoice_number_norm="INV1", invoice_date=date(2023,1,1), total_tax=Decimal("100")),
        # Normalized match (tax diff within tolerance)
        NormalizedInvoice(supplier_gstin="11A", invoice_number_norm="INV2", invoice_date=date(2023,1,1), total_tax=Decimal("100.50")),
        # Tolerance mismatched
        NormalizedInvoice(supplier_gstin="11A", invoice_number_norm="INV3", invoice_date=date(2023,1,1), total_tax=Decimal("150")),
        # Fuzzy probable
        NormalizedInvoice(supplier_gstin="22B", supplier_name="Tata Motors", invoice_number_norm="BILL01", invoice_date=date(2023,1,1), total_tax=Decimal("200")),
        # Missing in portal
        NormalizedInvoice(supplier_gstin="33C", invoice_number_norm="INV5", invoice_date=date(2023,1,1), total_tax=Decimal("50"))
    ]
    
    twob_rows = [
        # Exact match
        NormalizedInvoice(supplier_gstin="11A", invoice_number_norm="INV1", invoice_date=date(2023,1,1), total_tax=Decimal("100")),
        # Normalized match
        NormalizedInvoice(supplier_gstin="11A", invoice_number_norm="INV2", invoice_date=date(2023,1,1), total_tax=Decimal("100")),
        # Tolerance mismatched
        NormalizedInvoice(supplier_gstin="11A", invoice_number_norm="INV3", invoice_date=date(2023,1,1), total_tax=Decimal("100")),
        # Fuzzy probable (same gstin, date, amount, close name, bad inv_num)
        NormalizedInvoice(supplier_gstin="22B", supplier_name="Tata Motor", invoice_number_norm="BLL01", invoice_date=date(2023,1,1), total_tax=Decimal("200")),
        # Missing in books
        NormalizedInvoice(supplier_gstin="44D", invoice_number_norm="INV6", invoice_date=date(2023,1,1), total_tax=Decimal("60"))
    ]
    
    config = ReconciliationConfig(amount_tolerance_rupees=1.0)
    matches, summary = reconcile(pr_rows, twob_rows, config)
    
    # Assert Exact
    exact = next(m for m in matches if m.match_pass == MatchPassEnum.exact)
    assert exact.bucket == BucketEnum.matched
    
    # Assert Normalized
    norm = next(m for m in matches if m.match_pass == MatchPassEnum.normalized)
    assert norm.bucket == BucketEnum.matched
    assert norm.tax_diff == Decimal("0.50")
    
    # Assert Tolerance (Mismatched)
    tol = next(m for m in matches if m.match_pass == MatchPassEnum.tolerance)
    assert tol.bucket == BucketEnum.mismatched
    assert tol.tax_diff == Decimal("50")
    
    # Assert Fuzzy
    fuzzy = next(m for m in matches if m.match_pass == MatchPassEnum.fuzzy)
    assert fuzzy.bucket == BucketEnum.probable
    
    # Assert missing in portal
    mip = next(m for m in matches if m.bucket == BucketEnum.missing_in_portal)
    assert mip.tax_diff == Decimal("50")
    
    # Assert missing in books
    mib = next(m for m in matches if m.bucket == BucketEnum.missing_in_books)
    assert mib.tax_diff == Decimal("-60")

    assert summary.total == 6
    assert summary.counts[BucketEnum.matched.value] == 2

def test_performance_sanity():
    import random
    from uuid import uuid4
    
    # Generate 5000 PR rows and 5000 2B rows
    num_rows = 5000
    pr_rows = []
    twob_rows = []
    
    for i in range(num_rows):
        gstin = f"GSTIN{i % 100}" # 100 unique GSTINs
        inv_num = f"INV{i}"
        dt = date(2023, 1, 1)
        tax = Decimal(str(random.uniform(10.0, 1000.0))).quantize(Decimal('0.01'))
        
        pr_rows.append(NormalizedInvoice(
            supplier_gstin=gstin,
            invoice_number_norm=inv_num,
            invoice_date=dt,
            total_tax=tax
        ))
        
        # Exact match
        twob_rows.append(NormalizedInvoice(
            supplier_gstin=gstin,
            invoice_number_norm=inv_num,
            invoice_date=dt,
            total_tax=tax
        ))
        
    config = ReconciliationConfig()
    import time
    start = time.time()
    matches, summary = reconcile(pr_rows, twob_rows, config)
    duration = time.time() - start
    
    assert summary.total == num_rows
    assert len(matches) == num_rows
    assert duration < 5.0 # Should easily be under 5s if O(N) blocked

