import uuid
from typing import Optional
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.security import ALGORITHM
from app.models.domain import User, Workspace, Client, ClientAllocation, RoleEnum

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

class TenantContext:
    def __init__(self, user: User, workspace: Workspace, active_client: Optional[Client] = None):
        self.user = user
        self.workspace = workspace
        self.active_client = active_client

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.execute(select(User).where(User.id == uuid.UUID(user_id))).scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

def get_current_tenant_context(
    x_client_id: Optional[str] = Header(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> TenantContext:
    """
    Resolves the active tenant context: the User, their Workspace, and the optional Active Client.
    Validates that the active client belongs to the workspace, and if the user is a member,
    that they have an allocation to that client.
    """
    # Eager load workspace or query it
    workspace = db.execute(select(Workspace).where(Workspace.id == user.workspace_id)).scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Workspace not found")
        
    active_client = None
    if x_client_id:
        try:
            client_uuid = uuid.UUID(x_client_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Client-Id format")
            
        active_client = db.execute(select(Client).where(Client.id == client_uuid)).scalar_one_or_none()
        if not active_client or active_client.workspace_id != workspace.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Client not found in your workspace")
            
        # Enforce allocations for members
        if user.role == RoleEnum.member:
            allocation = db.execute(
                select(ClientAllocation)
                .where(ClientAllocation.client_id == active_client.id)
                .where(ClientAllocation.user_id == user.id)
            ).scalar_one_or_none()
            
            if not allocation:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this client")
                
    return TenantContext(user=user, workspace=workspace, active_client=active_client)

def require_active_client(context: TenantContext = Depends(get_current_tenant_context)) -> TenantContext:
    """Dependency that mandates an X-Client-Id header for scoped routes."""
    if not context.active_client:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="X-Client-Id header is required")
    return context