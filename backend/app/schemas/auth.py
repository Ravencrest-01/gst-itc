from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.models import WorkspaceType

class RequestOtp(BaseModel):
    email: EmailStr

class RequestOtpResponse(BaseModel):
    status: str
    message: str

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    workspace_name: str
    workspace_type: WorkspaceType

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserInfo(BaseModel):
    name: str
    email: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserInfo
