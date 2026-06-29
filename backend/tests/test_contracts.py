from decimal import Decimal
from datetime import date
import uuid
import pytest
from pydantic import ValidationError
from app.schemas.contracts import InvoiceRecord, MatchResultRecord

def test_invoice_record_validation():
    # Valid validation
    data = {
        "source": "PR",
        "supplier_gstin": "27AADCB8374D1Z2",
        "supplier_name": "Acme Corp",
        "invoice_no": "INV-1001",
        "invoice_no_norm": None,
        "invoice_date": "2026-06-29",
        "taxable_value": Decimal("10000.00"),
        "cgst": Decimal("900.00"),
        "sgst": Decimal("900.00"),
        "igst": Decimal("0.00"),
        "cess": Decimal("0.00"),
        "total_tax": Decimal("1800.00"),
        "filing_period": None,
        "raw": {"original_row": "raw_data"}
    }
    
    record = InvoiceRecord(**data)
    assert record.source == "PR"
    assert record.taxable_value == Decimal("10000.00")
    
    # Check frozen contract (should raise error if mutated)
    with pytest.raises(ValidationError):
        # In Pydantic V2, updating attributes of frozen model throws ValidationError or AttributeError
        # Depending on configuration, but modifying it is forbidden.
        record.source = "2B"

def test_match_result_record_validation():
    p_id = uuid.uuid4()
    data = {
        "purchase_invoice_id": p_id,
        "portal_invoice_id": None,
        "bucket": "missing_in_portal",
        "match_pass": "none",
        "confidence": 0.0,
        "tax_diff": Decimal("1800.00"),
        "status": "auto"
    }
    
    record = MatchResultRecord(**data)
    assert record.purchase_invoice_id == p_id
    assert record.bucket == "missing_in_portal"
    assert record.tax_diff == Decimal("1800.00")
