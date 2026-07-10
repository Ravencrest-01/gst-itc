import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.database import get_db
from app.core.dependencies import get_current_tenant_context, TenantContext
from app.models.domain import Client, ClientAllocation
from app.schemas.domain import ClientCreate, ClientOut

router = APIRouter()

@router.get("/", response_model=List[ClientOut])
def list_clients(ctx: TenantContext = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    if ctx.user.role == 'admin':
        clients = db.execute(select(Client).where(Client.workspace_id == ctx.workspace.id)).scalars().all()
    else:
        # Members only see allocated
        clients = db.execute(
            select(Client)
            .join(ClientAllocation)
            .where(Client.workspace_id == ctx.workspace.id)
            .where(ClientAllocation.user_id == ctx.user.id)
        ).scalars().all()
    return clients

@router.post("/", response_model=ClientOut)
def create_client(payload: ClientCreate, ctx: TenantContext = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    if ctx.user.role != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can create clients")
    
    if db.execute(select(Client).where(Client.gstin == payload.gstin)).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Client with this GSTIN already exists")
        
    client = Client(
        workspace_id=ctx.workspace.id,
        legal_name=payload.legal_name,
        gstin=payload.gstin,
        state_code=payload.state_code
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client

@router.get("/{id}", response_model=ClientOut)
def get_client(id: uuid.UUID, ctx: TenantContext = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    client = db.execute(select(Client).where(Client.id == id, Client.workspace_id == ctx.workspace.id)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client

@router.delete("/{id}")
def delete_client(id: uuid.UUID, ctx: TenantContext = Depends(get_current_tenant_context), db: Session = Depends(get_db)):
    if ctx.user.role != 'admin':
        raise HTTPException(status_code=403, detail="Only admins can delete")
    client = db.execute(select(Client).where(Client.id == id, Client.workspace_id == ctx.workspace.id)).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(client)
    db.commit()
    return {"message": "Deleted"}
