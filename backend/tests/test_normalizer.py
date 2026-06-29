from datetime import date
from decimal import Decimal
from app.services.normalizer import (
    normalize_gstin,
    normalize_invoice_no,
    parse_date,
    standardize_tax
)

def test_normalize_gstin():
    assert normalize_gstin(" 27AADCB2230M1Z2 ") == "27AADCB2230M1Z2"
    assert normalize_gstin("27aadcb2230m1z2") == "27AADCB2230M1Z2"
    assert normalize_gstin("") is None
    assert normalize_gstin(None) is None

def test_normalize_invoice_no():
    assert normalize_invoice_no("INV/26-27/042") == "INV2627042"
    assert normalize_invoice_no("26-27-42") == "262742"
    assert normalize_invoice_no("00042") == "42"
    assert normalize_invoice_no("INV-0042") == "INV0042"
    assert normalize_invoice_no("000000") == "0"
    assert normalize_invoice_no(None) is None

def test_parse_date():
    assert parse_date("2026-03-15") == date(2026, 3, 15)
    assert parse_date("15-03-2026") == date(2026, 3, 15)
    assert parse_date("15/03/2026") == date(2026, 3, 15)
    assert parse_date("15-Mar-2026") == date(2026, 3, 15)
    assert parse_date(date(2026, 3, 15)) == date(2026, 3, 15)
    assert parse_date("invalid") is None
    assert parse_date(None) is None

def test_standardize_tax():
    assert standardize_tax("1234.567") == Decimal("1234.57")
    assert standardize_tax("1234.564") == Decimal("1234.56")
    assert standardize_tax(1234.5) == Decimal("1234.50")
    assert standardize_tax("1,234.56") == Decimal("1234.56")
    assert standardize_tax("") == Decimal("0.00")
    assert standardize_tax(None) == Decimal("0.00")
    assert standardize_tax("invalid") == Decimal("0.00")
