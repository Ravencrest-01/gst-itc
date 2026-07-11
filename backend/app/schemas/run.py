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
    id: UUID
    client_id: UUID
    financial_year: str
    tax_period: str
    status: RunStatus
    counts: RunSummaryCounts
    itc_at_risk: float
    itc_recovered: float
    pr_total: float
    gstr2b_total: float
    match_rate: float
    total: int

class MatchRowResponse(BaseModel):
    id: UUID
    bucket: Bucket
    match_pass: Optional[MatchPass] = None
    confidence: Optional[float] = None
    difference: Optional[float] = None
    
    pr_vendor_gstin: Optional[str] = None
    gstr2b_vendor_gstin: Optional[str] = None
    pr_invoice_number: Optional[str] = None
    gstr2b_invoice_number: Optional[str] = None
    pr_invoice_date: Optional[str] = None
    gstr2b_invoice_date: Optional[str] = None
    pr_tax_value: Optional[float] = None
    gstr2b_tax_value: Optional[float] = None
    
    review_status: ReviewStatus

class MatchRowListResponse(BaseModel):
    items: List[MatchRowResponse]
    total: int
    page: int
    page_size: int
