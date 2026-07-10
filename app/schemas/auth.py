from typing import Optional, List
from pydantic import BaseModel, EmailStr, UUID4
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
    password: str
    full_name: str
    workspace_name: str
    workspace_type: WorkspaceTypeEnum
    otp: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    otp: Optional[str] = None
