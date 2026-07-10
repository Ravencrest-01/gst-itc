from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from app.models.models import VendorSource

class VendorCreateRequest(BaseModel):
    gstin: str
    legal_name: str
    contact_email: Optional[EmailStr] = None

class VendorUpdateRequest(BaseModel):
    legal_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    is_frequent: Optional[bool] = None

class VendorResponse(BaseModel):
    id: UUID
    gstin: str
    legal_name: str
    contact_email: Optional[str] = None
    is_frequent: bool
    source: VendorSource

class VendorListResponse(BaseModel):
    items: List[VendorResponse]
    total: int
