from decimal import Decimal
from datetime import date
from uuid import UUID
from typing import Literal, Dict, Any
from pydantic import BaseModel, ConfigDict

class InvoiceRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: Literal["PR", "2B"]
    supplier_gstin: str
    supplier_name: str | None = None
    invoice_no: str
    invoice_no_norm: str | None = None
    invoice_date: date
    taxable_value: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal
    cess: Decimal
    total_tax: Decimal
    filing_period: str | None = None
    raw: Dict[str, Any]


class MatchResultRecord(BaseModel):
    model_config = ConfigDict(frozen=True)

    purchase_invoice_id: UUID | None = None
    portal_invoice_id: UUID | None = None
    bucket: Literal["matched", "mismatched", "missing_in_portal", "missing_in_books", "probable"]
    match_pass: Literal["exact", "normalized", "tolerance", "fuzzy", "none"]
    confidence: float
    tax_diff: Decimal
    status: Literal["auto", "pending_review", "confirmed", "rejected"]
