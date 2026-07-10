from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.user import (
    MembersListResponse, MemberItem, AddMemberRequest, AddMemberResponse,
    UpdateRoleRequest, UpdateRoleResponse
)
from app.models.models import User, UserRole, UserStatus
from app.api.dependencies.auth import get_current_user, require_admin
import uuid

router = APIRouter()

@router.get("/members", response_model=MembersListResponse)
def list_members(current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    members = db.query(User).filter(User.workspace_id == current_user.workspace_id).all()
    items = [
        MemberItem(
            id=m.id,
            full_name=m.full_name,
            email=m.email,
            role=m.role,
            status=m.status
        ) for m in members
    ]
    return MembersListResponse(items=items, total=len(items))

@router.post("/members", response_model=AddMemberResponse)
def add_member(data: AddMemberRequest, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already unique in workspace")
    
    # Mocking password for invited user
    new_user = User(
        workspace_id=current_user.workspace_id,
        role=data.role,
        full_name=data.full_name,
        email=data.email,
        hashed_password="invited_no_password_yet"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return AddMemberResponse(id=new_user.id, invite_code="MOCK_INVITE_123")

@router.patch("/members/{id}/role", response_model=UpdateRoleResponse)
def update_role(id: uuid.UUID, data: UpdateRoleRequest, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == id, User.workspace_id == current_user.workspace_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    if member.id == current_user.id and data.role != UserRole.admin:
        admins_count = db.query(User).filter(User.workspace_id == current_user.workspace_id, User.role == UserRole.admin, User.status == UserStatus.active).count()
        if admins_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last remaining admin")
            
    member.role = data.role
    db.commit()
    return UpdateRoleResponse(id=member.id, role=member.role)

@router.delete("/members/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(id: uuid.UUID, current_user: User = Depends(require_admin), db: Session = Depends(get_db)):
    member = db.query(User).filter(User.id == id, User.workspace_id == current_user.workspace_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    if member.id == current_user.id:
        admins_count = db.query(User).filter(User.workspace_id == current_user.workspace_id, User.role == UserRole.admin, User.status == UserStatus.active).count()
        if admins_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last remaining admin")
            
    member.status = UserStatus.disabled
    # Note: client allocations should also be removed here.
    db.commit()
    return None
