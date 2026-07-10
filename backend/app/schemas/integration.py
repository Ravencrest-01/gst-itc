from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class TallyImportRequest(BaseModel):
    connection: Optional[str] = None

class TallyImportResponse(BaseModel):
    file_id: UUID
    kind: str
    rows_imported: int

class GstnCredentialRequest(BaseModel):
    gstin: str
    username: str
    secret: str

class GstnCredentialResponse(BaseModel):
    status: str

class Fetch2bRequest(BaseModel):
    financial_year: str
    tax_period: str

class Fetch2bResponse(BaseModel):
    job_id: str
    status: str

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    file_id: Optional[UUID] = None
