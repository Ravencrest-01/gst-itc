from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.client import (
    ClientCreateRequest, ClientUpdateRequest, ClientResponse, ClientListResponse,
    ClientAllocationRequest, ClientAllocationResponse
)
from app.models.models import User, Client, ClientAllocation, UserRole, ClientStatus
from app.api.dependencies.auth import get_current_user, require_admin
import uuid
from typing import Optional

router = APIRouter()

@router.get("/clients", response_model=ClientListResponse)
def list_clients(fy: Optional[str] = None, q: Optional[str] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Client).filter(Client.workspace_id == current_user.workspace_id)
    
    if current_user.role != UserRole.admin:
        query = query.join(ClientAllocation).filter(ClientAllocation.user_id == current_user.id)
        
    if q:
        query = query.filter(Client.legal_name.ilike(f"%{q}%") | Client.gstin.ilike(f"%{q}%"))
        
    clients = query.all()
    # Note: 'fy' might be used later to filter run aggregations inside the client response
    
    items = []
    for c in clients:
        items.append(ClientResponse(
            id=c.id,
            legal_name=c.legal_name,
            gstin=c.gstin,
            state_code=c.state_code,
            status=c.status,
            default_financial_year=c.default_financial_year,
            created_at=c.created_at
        ))
    return ClientListResponse(items=items, total=len(items))

@router.post("/clients", response_model=ClientResponse)
def create_client(data: ClientCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != UserRole.admin and current_user.workspace.type != "solo":
        raise HTTPException(status_code=403, detail="Members cannot add companies")
        
    client = Client(
        workspace_id=current_user.workspace_id,
        legal_name=data.legal_name,
        gstin=data.gstin,
        state_code=data.state_code
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    
    return ClientResponse(
        id=client.id,
        legal_name=client.legal_name,
        gstin=client.gstin,
        state_code=client.state_code,
        status=client.status,
        default_financial_year=client.default_financial_year,
        created_at=client.created_at
    )

@router.get("/clients/{id}", response_model=ClientResponse)
def get_client(id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == id, Client.workspace_id == current_user.workspace_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
        
    if current_user.role != UserRole.admin:
        allocation = db.query(ClientAllocation).filter(ClientAllocation.client_id == id, ClientAllocation.user_id == current_user.id).first()
        if not allocation:
            raise HTTPException(status_code=403, detail="Not allocated to this client")
            
    return ClientResponse(
        id=client.id,
        legal_name=client.legal_name,
        gstin=client.gstin,
        state_code=client.state_code,
        status=client.status,
        default_financial_year=client.default_financial_year,
        created_at=client.created_at
    )

@router.patch("/clients/{id}", response_model=ClientResponse)
def update_client(id: uuid.UUID, data: ClientUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != UserRole.admin and current_user.workspace.type != "solo":
        raise HTTPException(status_code=403, detail="Members cannot edit clients")
        
    client = db.query(Client).filter(Client.id == id, Client.workspace_id == current_user.workspace_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
        
    if data.legal_name: client.legal_name = data.legal_name
    if data.state_code: client.state_code = data.state_code
    if data.status: client.status = data.status
    if data.default_financial_year: client.default_financial_year = data.default_financial_year
    
    db.commit()
    db.refresh(client)
    
    return ClientResponse(
        id=client.id,
        legal_name=client.legal_name,
        gstin=client.gstin,
        state_code=client.state_code,
        status=client.status,
        default_financial_year=client.default_financial_year,
        created_at=client.created_at
    )

@router.delete("/clients/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(id: uuid.UUID, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != UserRole.admin and current_user.workspace.type != "solo":
        raise HTTPException(status_code=403, detail="Members cannot delete clients")
        
    client = db.query(Client).filter(Client.id == id, Client.workspace_id == current_user.workspace_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
        
    client.status = ClientStatus.archived
    db.commit()
    return None

@router.post("/clients/{id}/allocations", response_model=ClientAllocationResponse)
def allocate_client(id: uuid.UUID, data: ClientAllocationRequest, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    client = db.query(Client).filter(Client.id == id, Client.workspace_id == current_user.workspace_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
        
    member = db.query(User).filter(User.id == data.user_id, User.workspace_id == current_user.workspace_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    allocation = db.query(ClientAllocation).filter(ClientAllocation.client_id == id, ClientAllocation.user_id == data.user_id).first()
    if allocation:
        raise HTTPException(status_code=400, detail="Allocation already exists")
        
    new_allocation = ClientAllocation(client_id=id, user_id=data.user_id)
    db.add(new_allocation)
    db.commit()
    
    return ClientAllocationResponse(client_id=id, user_id=data.user_id)
