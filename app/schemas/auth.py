from typing import Optional, List
from pydantic import BaseModel, EmailStr, UUID4, Field
from app.models.enums import RoleEnum, WorkspaceTypeEnum

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: UUID4
    name: str
    email: EmailStr
    workspace_id: UUID4
    role: RoleEnum

class TokenData(Token):
    user: UserOut

class OTPRequest(BaseModel):
    email: EmailStr

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=72)
    full_name: str
    workspace_name: str
    workspace_type: WorkspaceTypeEnum

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=72)
