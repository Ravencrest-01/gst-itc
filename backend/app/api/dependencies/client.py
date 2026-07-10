from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User, Client, ClientAllocation, UserRole
from app.api.dependencies.auth import get_current_user
from uuid import UUID

def get_current_client(
    x_client_id: UUID = Header(alias="X-Client-Id"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    client = db.query(Client).filter(
        Client.id == x_client_id,
        Client.workspace_id == current_user.workspace_id
    ).first()
    
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
        
    if current_user.role != UserRole.admin:
        allocation = db.query(ClientAllocation).filter(
            ClientAllocation.client_id == client.id,
            ClientAllocation.user_id == current_user.id
        ).first()
        if not allocation:
            raise HTTPException(status_code=403, detail="Not allocated to this client")
            
    return client
