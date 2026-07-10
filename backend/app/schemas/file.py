from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from app.models.models import FileKind

class UploadedFileResponse(BaseModel):
    id: UUID
    client_id: UUID
    run_id: Optional[UUID] = None
    uploaded_by: UUID
    kind: FileKind
    filename: str
    storage_url: str
    byte_size: int
    financial_year: str
    tax_period: str
    uploaded_at: datetime

class UploadedFileListResponse(BaseModel):
    items: List[UploadedFileResponse]
    total: int
    page: int
    page_size: int
