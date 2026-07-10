from typing import Optional, List
from pydantic import BaseModel, UUID4
from app.models.enums import FileKindEnum, RunStatusEnum, BucketEnum

# --- Clients ---
class ClientCreate(BaseModel):
    legal_name: str
    gstin: str
    state_code: str

class ClientOut(ClientCreate):
    id: UUID4
    workspace_id: UUID4
    
    class Config:
        from_attributes = True

# --- Vendors ---
class VendorCreate(BaseModel):
    gstin: str
    legal_name: str
    contact_email: Optional[str] = None
    is_frequent: bool = False
    source: str = "system"

class VendorUpdate(BaseModel):
    legal_name: Optional[str] = None
    contact_email: Optional[str] = None
    is_frequent: Optional[bool] = None

# --- Runs & Results ---
class ReconciliationSummary(BaseModel):
    counts: dict
    itc_at_risk: float
    itc_recovered: float
    total: float

class RunOut(BaseModel):
    id: UUID4
    status: RunStatusEnum
    tax_period: str
    total_records: int
    
    class Config:
        from_attributes = True

class MatchUpdate(BaseModel):
    status: str
    override_bucket: Optional[BucketEnum] = None
