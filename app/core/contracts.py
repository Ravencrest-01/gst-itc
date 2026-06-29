from pydantic import BaseModel, Field
from datetime import date
from uuid import UUID
from typing import Optional

class InvoiceRecord(BaseModel):
    """The frozen data shape produced by ingestion (M4) and consumed by M1/M2."""
    workspace_id: UUID
    client_id: UUID
    run_id: UUID
    supplier_gstin: str = Field(..., max_length=15)
    invoice_no: str
    invoice_date: date
    taxable_value: float
    cgst: float = 0.0
    sgst: float = 0.0
    igst: float = 0.0
    cess: float = 0.0
    total_tax: float

class MatchResultRecord(BaseModel):
    """The data shape produced by the matcher (M2) and consumed by tracking layers."""
    workspace_id: UUID
    client_id: UUID
    run_id: UUID
    purchase_invoice_id: Optional[UUID] = None
    portal_invoice_id: Optional[UUID] = None
    bucket: str  # Matched, Mismatched, Missing-in-Portal, Missing-in-Books, Probable
    match_pass: Optional[str] = None  # P1, P2, P3, P4
    confidence: float
    tax_diff: float = 0.0