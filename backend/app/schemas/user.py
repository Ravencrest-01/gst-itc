from pydantic import BaseModel, EmailStr
from typing import Optional, List
from uuid import UUID
from app.models.models import UserRole, UserStatus

class UserMeResponse(BaseModel):
    id: UUID
    name: str
    email: str
    workspace_id: UUID
    role: UserRole

class UserUpdateNameRequest(BaseModel):
    full_name: str

class UserUpdateNameResponse(BaseModel):
    id: UUID
    full_name: str
    email: str

class UserUpdateEmailRequest(BaseModel):
    new_email: EmailStr
    otp: str

class UserUpdateEmailResponse(BaseModel):
    id: UUID
    email: str

class MemberItem(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: UserRole
    status: UserStatus

class MembersListResponse(BaseModel):
    items: List[MemberItem]
    total: int

class AddMemberRequest(BaseModel):
    full_name: str
    email: EmailStr
    role: UserRole

class AddMemberResponse(BaseModel):
    id: UUID
    invite_code: Optional[str] = None

class UpdateRoleRequest(BaseModel):
    role: UserRole

class UpdateRoleResponse(BaseModel):
    id: UUID
    role: UserRole

class UpdateAvatarResponse(BaseModel):
    avatar_url: str
