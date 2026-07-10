import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import List, Optional, Dict, Any

from app.services.reconciliation.buckets import BucketEnum, MatchPassEnum, ReviewStatusEnum

@dataclass
class NormalizedInvoice:
    # Keep the raw data if needed
    raw_data: Dict[str, Any] = field(default_factory=dict)
    
    supplier_gstin: str = ""
    supplier_name: Optional[str] = None
    invoice_number: str = ""
    invoice_number_norm: str = ""
    invoice_date: Optional[date] = None
    taxable_value: Decimal = Decimal('0.00')
    cgst: Decimal = Decimal('0.00')
    sgst: Decimal = Decimal('0.00')
    igst: Decimal = Decimal('0.00')
    cess: Decimal = Decimal('0.00')
    total_tax: Decimal = Decimal('0.00')
    
    # Track origin
    row_index: int = 0

@dataclass
class MatchResult:
    purchase_invoice: Optional[NormalizedInvoice] = None
    portal_invoice: Optional[NormalizedInvoice] = None
    bucket: BucketEnum = BucketEnum.matched
    match_pass: Optional[MatchPassEnum] = None
    confidence: Optional[float] = None
    tax_diff: Decimal = Decimal('0.00')
    review_status: ReviewStatusEnum = ReviewStatusEnum.pending

@dataclass
class RunSummary:
    counts: Dict[str, int] = field(default_factory=dict)
    total: int = 0
    itc_at_risk: Decimal = Decimal('0.00')
    itc_matched: Decimal = Decimal('0.00')
    matched_percentage: float = 0.0

@dataclass
class SkippedRow:
    row_index: int
    reason: str

@dataclass
class IngestionResult:
    rows: List[NormalizedInvoice] = field(default_factory=list)
    row_count: int = 0
    detected_format: str = ""
    detected_sheet: str = ""
    mapped_columns: Dict[str, str] = field(default_factory=dict)
    skipped_rows: List[SkippedRow] = field(default_factory=list)
