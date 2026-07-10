from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.vendor import (
    VendorCreateRequest, VendorUpdateRequest, VendorResponse, VendorListResponse
)
from app.models.models import Vendor, Client
from app.api.dependencies.client import get_current_client
import uuid
from typing import Optional

router = APIRouter()

@router.get("/clients/{id}/vendors", response_model=VendorListResponse)
def list_vendors(id: uuid.UUID, q: Optional[str] = None, client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    query = db.query(Vendor).filter(Vendor.client_id == client.id)
    if q:
        query = query.filter(Vendor.legal_name.ilike(f"%{q}%") | Vendor.gstin.ilike(f"%{q}%"))
        
    vendors = query.all()
    items = [
        VendorResponse(
            id=v.id,
            gstin=v.gstin,
            legal_name=v.legal_name,
            contact_email=v.contact_email,
            is_frequent=v.is_frequent,
            source=v.source
        ) for v in vendors
    ]
    return VendorListResponse(items=items, total=len(items))

@router.post("/clients/{id}/vendors", response_model=VendorResponse)
def create_vendor(id: uuid.UUID, data: VendorCreateRequest, client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    existing = db.query(Vendor).filter(Vendor.client_id == client.id, Vendor.gstin == data.gstin).first()
    if existing:
        raise HTTPException(status_code=400, detail="Vendor with this GSTIN already exists")
        
    vendor = Vendor(
        client_id=client.id,
        gstin=data.gstin,
        legal_name=data.legal_name,
        contact_email=data.contact_email,
        is_frequent=True,
        source="manual"
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    
    return VendorResponse(
        id=vendor.id,
        gstin=vendor.gstin,
        legal_name=vendor.legal_name,
        contact_email=vendor.contact_email,
        is_frequent=vendor.is_frequent,
        source=vendor.source
    )

@router.patch("/clients/{id}/vendors/{vendorId}", response_model=VendorResponse)
def update_vendor(id: uuid.UUID, vendorId: uuid.UUID, data: VendorUpdateRequest, client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendorId, Vendor.client_id == client.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
        
    if data.legal_name: vendor.legal_name = data.legal_name
    if data.contact_email: vendor.contact_email = data.contact_email
    if data.is_frequent is not None: vendor.is_frequent = data.is_frequent
        
    db.commit()
    db.refresh(vendor)
    
    return VendorResponse(
        id=vendor.id,
        gstin=vendor.gstin,
        legal_name=vendor.legal_name,
        contact_email=vendor.contact_email,
        is_frequent=vendor.is_frequent,
        source=vendor.source
    )

@router.delete("/clients/{id}/vendors/{vendorId}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(id: uuid.UUID, vendorId: uuid.UUID, client: Client = Depends(get_current_client), db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendorId, Vendor.client_id == client.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
        
    db.delete(vendor)
    db.commit()
    return None
