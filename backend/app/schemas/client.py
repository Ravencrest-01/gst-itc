from pydantic import BaseModel, constr
from typing import Optional, List
from uuid import UUID
from datetime import datetime
from app.models.models import ClientStatus

class ClientCreateRequest(BaseModel):
    legal_name: str
    gstin: constr(min_length=15, max_length=15)
    state_code: constr(min_length=2, max_length=2)

class ClientUpdateRequest(BaseModel):
    legal_name: Optional[str] = None
    state_code: Optional[constr(min_length=2, max_length=2)] = None
    status: Optional[ClientStatus] = None
    default_financial_year: Optional[str] = None

class ClientResponse(BaseModel):
    id: UUID
    legal_name: str
    gstin: str
    state_code: str
    status: ClientStatus
    default_financial_year: Optional[str] = None
    created_at: datetime
    # Note: 'invoices', 'matched_percentage', 'itc_at_risk' might be needed later
    # as per PDF "Canonical response objects" but require DB computation.
    
class ClientListResponse(BaseModel):
    items: List[ClientResponse]
    total: int

class ClientAllocationRequest(BaseModel):
    user_id: UUID

class ClientAllocationResponse(BaseModel):
    client_id: UUID
    user_id: UUID
