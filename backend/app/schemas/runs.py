from datetime import datetime
from uuid import UUID
from pydantic import BaseModel

class ReconciliationRunCreate(BaseModel):
    tax_period: str

class ReconciliationRunResponse(BaseModel):
    id: UUID
    org_id: UUID
    created_by: UUID
    tax_period: str
    status: str
    created_at: datetime
    completed_at: datetime | None = None

    class Config:
        from_attributes = True
