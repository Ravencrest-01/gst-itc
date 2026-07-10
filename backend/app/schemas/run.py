from pydantic import BaseModel
from typing import List, Optional, Dict
from uuid import UUID
from datetime import datetime
from app.models.models import RunStatus, Bucket, MatchPass, ReviewStatus

class RunCreateRequest(BaseModel):
    financial_year: str
    tax_period: str
    purchase_file_id: Optional[UUID] = None
    portal_file_id: Optional[UUID] = None

class RunCreateResponse(BaseModel):
    id: UUID
    status: RunStatus
    total_records_committed: int

class RunResponse(BaseModel):
    id: UUID
    client_id: UUID
    client_name: Optional[str] = None
    financial_year: str
    tax_period: str
    status: RunStatus
    invoices: int
    matched_percentage: float
    itc_at_risk: float
    created_on: datetime

class RunListResponse(BaseModel):
    items: List[RunResponse]
    total: int

class RunSummaryCounts(BaseModel):
    matched: int
    mismatched: int
    missing_in_portal: int
    missing_in_books: int
    probable: int

class RunSummaryResponse(BaseModel):
    counts: RunSummaryCounts
    itc_at_risk: float
    itc_recovered: float
    total: int

class MatchRowResponse(BaseModel):
    id: UUID
    bucket: Bucket
    match_pass: Optional[MatchPass] = None
    confidence: Optional[float] = None
    tax_diff: Optional[float] = None
    supplier_gstin: str
    supplier_name: str
    invoice_number: str
    invoice_date: str
    taxable_value: float
    total_tax: float
    source: Optional[str] = None
    review_status: ReviewStatus

class MatchRowListResponse(BaseModel):
    items: List[MatchRowResponse]
    total: int
    page: int
    page_size: int
